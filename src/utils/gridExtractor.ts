import { ALL_CHARACTERS, type GlyphVariant } from '../types/handwriting';

const DESCENDERS = new Set(['g', 'j', 'p', 'q', 'y']);
const TOP_PUNCT = new Set(["'", '"']);
const MID_PUNCT = new Set(['-', '=', '+']);
const SMALL_CAPS_OR_TALL = new Set([
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'b', 'd', 'f', 'h', 'k', 'l', 't', '!', '?', '(', ')', '/', '&', '@', '#',
]);

export interface GridExtractOptions {
  rows?: number;
  cols?: number;
  /** Luminance cutoff [0..255] below which a pixel is considered ink */
  inkThreshold?: number;
  /** Fraction of cell size to crop inward on each side to avoid grid borders */
  cellInset?: number;
}

/**
 * Finds the pixel coordinates of grid lines along an axis by detecting rows/columns
 * where a high fraction of pixels are non-white (the thin gray grid borders).
 * Falls back to uniform division if the exact number of boundaries isn't found.
 */
function detectGridBoundaries(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  expectedCount: number,
  axis: 'horizontal' | 'vertical'
): number[] {
  const primaryLen = axis === 'horizontal' ? height : width;
  const crossLen = axis === 'horizontal' ? width : height;
  const minRunSize = crossLen * 0.6;

  const lineIndices: number[] = [];
  for (let p = 0; p < primaryLen; p++) {
    let nonWhite = 0;
    for (let c = 0; c < crossLen; c++) {
      const x = axis === 'horizontal' ? c : p;
      const y = axis === 'horizontal' ? p : c;
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 245) nonWhite++;
    }
    if (nonWhite >= minRunSize) {
      lineIndices.push(p);
    }
  }

  // Cluster consecutive indices into single line centers
  const clusters: number[] = [];
  let sum = 0;
  let count = 0;
  let prev = -999;

  for (const idx of lineIndices) {
    if (idx - prev <= 4) {
      sum += idx;
      count++;
    } else {
      if (count > 0) clusters.push(sum / count);
      sum = idx;
      count = 1;
    }
    prev = idx;
  }
  if (count > 0) clusters.push(sum / count);

  const expectedBoundaries = expectedCount + 1;
  if (clusters.length === expectedBoundaries) {
    return clusters;
  }

  // Fallback to uniform grid
  const uniform: number[] = [];
  for (let i = 0; i <= expectedCount; i++) {
    uniform.push((i * primaryLen) / expectedCount);
  }
  return uniform;
}

/**
 * Slices an 8x10 character grid image into normalized transparent ink-mask GlyphVariants.
 */
export function extractGlyphsFromGridImage(
  img: HTMLImageElement,
  options: GridExtractOptions = {}
): Record<string, GlyphVariant[]> {
  const rows = options.rows ?? 8;
  const cols = options.cols ?? 10;
  const inkThreshold = options.inkThreshold ?? 195;
  const cellInset = options.cellInset ?? 0.03;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.naturalWidth || img.width;
  srcCanvas.height = img.naturalHeight || img.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return {};

  srcCtx.drawImage(img, 0, 0);
  const fullData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;

  const rowBounds = detectGridBoundaries(
    fullData,
    srcCanvas.width,
    srcCanvas.height,
    rows,
    'horizontal'
  );
  const colBounds = detectGridBoundaries(
    fullData,
    srcCanvas.width,
    srcCanvas.height,
    cols,
    'vertical'
  );

  const result: Record<string, GlyphVariant[]> = {};
  const outSize = 128;

  for (let idx = 0; idx < ALL_CHARACTERS.length; idx++) {
    const ch = ALL_CHARACTERS[idx];
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    if (r >= rows) break;

    const x0 = colBounds[c];
    const x1 = colBounds[c + 1];
    const y0 = rowBounds[r];
    const y1 = rowBounds[r + 1];

    const cellW = x1 - x0;
    const cellH = y1 - y0;

    const padX = Math.max(2, cellW * cellInset);
    const padY = Math.max(2, cellH * cellInset);

    const sx = Math.round(x0 + padX);
    const sy = Math.round(y0 + padY);
    const sw = Math.max(4, Math.round(cellW - padX * 2));
    const sh = Math.max(4, Math.round(cellH - padY * 2));

    const imgData = srcCtx.getImageData(sx, sy, sw, sh);
    const data = imgData.data;

    // Find tight ink bounding box and convert paper to transparent
    let minX = sw;
    let minY = sh;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

        if (lum < inkThreshold) {
          // Smooth alpha ramp for anti-aliased edges while keeping thin strokes solid
          const strength = Math.min(1, (inkThreshold - lum) / 45);
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = Math.round(strength * 255);

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        } else {
          data[i + 3] = 0;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      continue; // Empty cell
    }

    // Pad bounding box slightly
    const pad = 2;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(sw - 1, maxX + pad);
    maxY = Math.min(sh - 1, maxY + pad);

    const inkW = maxX - minX + 1;
    const inkH = maxY - minY + 1;

    // Put cleaned ink mask into a temp canvas
    const cleanCanvas = document.createElement('canvas');
    cleanCanvas.width = sw;
    cleanCanvas.height = sh;
    const cleanCtx = cleanCanvas.getContext('2d');
    if (!cleanCtx) continue;
    cleanCtx.putImageData(imgData, 0, 0);

    // Normalize into outSize x outSize box with consistent baseline alignment
    const normCanvas = document.createElement('canvas');
    normCanvas.width = outSize;
    normCanvas.height = outSize;
    const normCtx = normCanvas.getContext('2d');
    if (!normCtx) continue;

    let targetFracH = 0.34;
    if (SMALL_CAPS_OR_TALL.has(ch)) targetFracH = 0.52;
    else if (DESCENDERS.has(ch)) targetFracH = 0.50;
    else if (ch === '.' || ch === ',') targetFracH = 0.14;
    else if (ch === ':' || ch === ';') targetFracH = 0.30;
    else if (TOP_PUNCT.has(ch)) targetFracH = 0.18;
    else if (MID_PUNCT.has(ch)) targetFracH = 0.24;

    const targetH = outSize * targetFracH;
    const scale = Math.min(targetH / inkH, (outSize * 0.82) / inkW);
    const drawW = inkW * scale;
    const drawH = inkH * scale;
    const drawX = (outSize - drawW) / 2;

    const baselinePx = outSize * 0.72;
    let drawY = baselinePx - drawH;
    if (DESCENDERS.has(ch)) {
      drawY = baselinePx - drawH * 0.65;
    } else if (ch === ',' || ch === ';') {
      drawY = baselinePx - drawH * 0.55;
    } else if (TOP_PUNCT.has(ch)) {
      drawY = outSize * 0.2;
    } else if (MID_PUNCT.has(ch)) {
      drawY = outSize * 0.5 - drawH / 2;
    }

    normCtx.drawImage(
      cleanCanvas,
      minX,
      minY,
      inkW,
      inkH,
      drawX,
      drawY,
      drawW,
      drawH
    );

    const leftBearing = Math.max(0.05, drawX / outSize);
    const rightBearing = Math.min(0.95, (drawX + drawW) / outSize);
    const widthRatio = Math.max(0.18, rightBearing - leftBearing + 0.08);

    result[ch] = [
      {
        id: `grid_${ch}_${Date.now()}`,
        strokes: [],
        imageDataUrl: normCanvas.toDataURL('image/png'),
        leftBearing,
        rightBearing,
        widthRatio,
      },
    ];
  }

  return result;
}
