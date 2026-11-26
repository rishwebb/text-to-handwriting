import {
  PEN_COLORS,
  type GlyphStroke,
  type HandwritingProfile,
  type PageSettings,
} from '../types/handwriting';

export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
const RIGHT_MARGIN = 48;
const BOTTOM_MARGIN = 54;

/** Baseline position within the normalized [0..1] glyph drawing box */
export const GLYPH_BASELINE_Y = 0.72;

export interface PageLine {
  text: string;
  lineIndex: number;
}

export interface PageLayout {
  pageIndex: number;
  lines: PageLine[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getFontFamily(settings: PageSettings): string {
  if (settings.customFontName) {
    return `"${settings.customFontName}", "${settings.fallbackFont}", cursive`;
  }
  return `"${settings.fallbackFont}", cursive`;
}

function measureCharAdvance(
  char: string,
  settings: PageSettings,
  profile: HandwritingProfile,
  measureCtx: CanvasRenderingContext2D
): number {
  if (char === ' ') {
    return settings.fontSize * settings.wordSpacing;
  }
  if (char === '\t') {
    return settings.fontSize * settings.wordSpacing * 4;
  }

  const variants = profile.glyphs[char];
  if (variants && variants.length > 0) {
    const avgRatio =
      variants.reduce((sum, v) => sum + v.widthRatio, 0) / variants.length;
    return avgRatio * settings.fontSize * 1.15 + settings.letterSpacing;
  }

  return measureCtx.measureText(char).width + settings.letterSpacing;
}

function measureWordWidth(
  word: string,
  settings: PageSettings,
  profile: HandwritingProfile,
  measureCtx: CanvasRenderingContext2D
): number {
  let total = 0;
  for (const ch of word) {
    total += measureCharAdvance(ch, settings, profile, measureCtx);
  }
  return total;
}

export function paginateText(
  text: string,
  settings: PageSettings,
  profile: HandwritingProfile
): PageLayout[] {
  const offscreen = document.createElement('canvas');
  const ctx = offscreen.getContext('2d');
  if (!ctx) return [{ pageIndex: 0, lines: [] }];

  ctx.font = `${settings.fontSize}px ${getFontFamily(settings)}`;

  const maxLineWidth = Math.max(120, PAGE_WIDTH - settings.marginLeft - RIGHT_MARGIN);
  const maxLinesPerPage = Math.max(
    1,
    Math.floor((PAGE_HEIGHT - settings.marginTop - BOTTOM_MARGIN) / settings.lineHeight)
  );

  const allLines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      allLines.push('');
      continue;
    }

    // Tokenize into words and spaces
    const tokens = paragraph.match(/\S+|\s+/g) || [];
    let currentLine = '';
    let currentWidth = 0;

    for (const token of tokens) {
      const isWhitespace = /^\s+$/.test(token);
      if (isWhitespace) {
        if (currentLine.length === 0) continue; // skip leading space on wrapped line
        const w = measureWordWidth(token, settings, profile, ctx);
        if (currentWidth + w <= maxLineWidth) {
          currentLine += token;
          currentWidth += w;
        }
        continue;
      }

      const wordWidth = measureWordWidth(token, settings, profile, ctx);

      if (currentWidth + wordWidth <= maxLineWidth) {
        currentLine += token;
        currentWidth += wordWidth;
      } else if (wordWidth > maxLineWidth) {
        // Long word: flush current line if non-empty, then split characters
        if (currentLine.trimEnd().length > 0) {
          allLines.push(currentLine.trimEnd());
          currentLine = '';
          currentWidth = 0;
        }
        for (const ch of token) {
          const cw = measureCharAdvance(ch, settings, profile, ctx);
          if (currentWidth + cw > maxLineWidth && currentLine.length > 0) {
            allLines.push(currentLine);
            currentLine = ch;
            currentWidth = cw;
          } else {
            currentLine += ch;
            currentWidth += cw;
          }
        }
      } else {
        allLines.push(currentLine.trimEnd());
        currentLine = token;
        currentWidth = wordWidth;
      }
    }

    if (currentLine.length > 0) {
      allLines.push(currentLine.trimEnd());
    }
  }

  if (allLines.length === 0) {
    return [{ pageIndex: 0, lines: [] }];
  }

  const pages: PageLayout[] = [];
  for (let i = 0; i < allLines.length; i += maxLinesPerPage) {
    const slice = allLines.slice(i, i + maxLinesPerPage);
    pages.push({
      pageIndex: pages.length,
      lines: slice.map((lineText, idx) => ({
        text: lineText,
        lineIndex: idx,
      })),
    });
  }

  return pages;
}

export function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  stroke: GlyphStroke,
  offsetX: number,
  offsetY: number,
  boxSize: number
): void {
  if (stroke.length === 0) return;

  if (stroke.length === 1) {
    const pt = stroke[0];
    ctx.beginPath();
    ctx.arc(
      offsetX + pt.x * boxSize,
      offsetY + pt.y * boxSize,
      Math.max(1, ctx.lineWidth * 0.55),
      0,
      Math.PI * 2
    );
    ctx.fill();
    return;
  }

  ctx.beginPath();
  const first = stroke[0];
  ctx.moveTo(offsetX + first.x * boxSize, offsetY + first.y * boxSize);

  if (stroke.length === 2) {
    const second = stroke[1];
    ctx.lineTo(offsetX + second.x * boxSize, offsetY + second.y * boxSize);
    ctx.stroke();
    return;
  }

  for (let i = 1; i < stroke.length - 1; i++) {
    const curr = stroke[i];
    const next = stroke[i + 1];
    const midX = ((curr.x + next.x) / 2) * boxSize + offsetX;
    const midY = ((curr.y + next.y) / 2) * boxSize + offsetY;
    ctx.quadraticCurveTo(
      offsetX + curr.x * boxSize,
      offsetY + curr.y * boxSize,
      midX,
      midY
    );
  }

  const last = stroke[stroke.length - 1];
  ctx.lineTo(offsetX + last.x * boxSize, offsetY + last.y * boxSize);
  ctx.stroke();
}

function drawPaperBackground(
  ctx: CanvasRenderingContext2D,
  settings: PageSettings,
  pageIndex: number
): void {
  const { paperStyle, marginLeft, marginTop, lineHeight, fontSize } = settings;

  // Base paper color
  const bgColors: Record<PageSettings['paperStyle'], string> = {
    ruled: '#fcfbf7',
    plain: '#fdfdfb',
    grid: '#fbfcfe',
    cream: '#f6eedb',
  };

  ctx.fillStyle = bgColors[paperStyle];
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  // Subtle edge vignette for natural paper depth
  const grad = ctx.createRadialGradient(
    PAGE_WIDTH / 2,
    PAGE_HEIGHT / 2,
    PAGE_WIDTH * 0.3,
    PAGE_WIDTH / 2,
    PAGE_HEIGHT / 2,
    PAGE_HEIGHT * 0.72
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(120,105,85,0.055)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  // Optional subtle paper grain
  if (settings.showPaperGrain) {
    const rand = mulberry32(991 + pageIndex * 37);
    ctx.fillStyle = 'rgba(110, 98, 80, 0.025)';
    for (let i = 0; i < 1800; i++) {
      const gx = rand() * PAGE_WIDTH;
      const gy = rand() * PAGE_HEIGHT;
      const gs = rand() * 1.4 + 0.4;
      ctx.fillRect(gx, gy, gs, gs);
    }
  }

  if (paperStyle === 'ruled') {
    // Horizontal ruled lines aligned with text baselines
    ctx.strokeStyle = 'rgba(130, 168, 212, 0.48)';
    ctx.lineWidth = 1;
    const baselineOffset = fontSize * 0.78;
    const firstLineY = marginTop + baselineOffset;

    for (let y = firstLineY; y < PAGE_HEIGHT - 30; y += lineHeight) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(PAGE_WIDTH, Math.round(y) + 0.5);
      ctx.stroke();
    }

    // Pink/red vertical margin line
    const marginX = Math.max(24, marginLeft - 14);
    ctx.strokeStyle = 'rgba(220, 105, 118, 0.45)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(marginX, 0);
    ctx.lineTo(marginX, PAGE_HEIGHT);
    ctx.stroke();
  } else if (paperStyle === 'grid') {
    const step = 24;
    ctx.strokeStyle = 'rgba(145, 182, 214, 0.34)';
    ctx.lineWidth = 0.85;
    for (let x = step; x < PAGE_WIDTH; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, PAGE_HEIGHT);
      ctx.stroke();
    }
    for (let y = step; y < PAGE_HEIGHT; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(PAGE_WIDTH, y + 0.5);
      ctx.stroke();
    }
  }

  // Optional 3-hole punch binder holes
  if (settings.showBinderHoles && (paperStyle === 'ruled' || paperStyle === 'grid')) {
    const holeX = 30;
    const holeYs = [155, PAGE_HEIGHT / 2, PAGE_HEIGHT - 155];
    for (const hy of holeYs) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(holeX, hy, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#e4e6eb';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }
}

const imageCache = new Map<string, HTMLImageElement>();
const tintedCache = new Map<string, HTMLCanvasElement>();

function getTintedGlyphCanvas(
  variantId: string,
  dataUrl: string,
  color: string,
  onImageReady?: () => void
): HTMLCanvasElement | null {
  const cacheKey = `${variantId}__${color}`;
  const cached = tintedCache.get(cacheKey);
  if (cached) return cached;

  let img = imageCache.get(dataUrl);
  if (!img) {
    img = new Image();
    img.onload = () => {
      onImageReady?.();
    };
    img.src = dataUrl;
    imageCache.set(dataUrl, img);
  }

  if (!img.complete || img.naturalWidth === 0) {
    return null;
  }

  const off = document.createElement('canvas');
  off.width = img.naturalWidth;
  off.height = img.naturalHeight;
  const octx = off.getContext('2d');
  if (!octx) return null;

  octx.drawImage(img, 0, 0);
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = color;
  octx.fillRect(0, 0, off.width, off.height);

  tintedCache.set(cacheKey, off);
  return off;
}

export async function preloadProfileImages(
  profile: HandwritingProfile
): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const variants of Object.values(profile.glyphs)) {
    for (const v of variants) {
      if (!v.imageDataUrl) continue;
      const existing = imageCache.get(v.imageDataUrl);
      if (existing && existing.complete) continue;
      promises.push(
        new Promise<void>((resolve) => {
          const img = existing || new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          if (!existing) {
            img.src = v.imageDataUrl!;
            imageCache.set(v.imageDataUrl!, img);
          }
        })
      );
    }
  }
  await Promise.all(promises);
}

export function renderPageToCanvas(
  canvas: HTMLCanvasElement,
  page: PageLayout,
  settings: PageSettings,
  profile: HandwritingProfile,
  scale = 2,
  onImageReady?: () => void
): void {
  canvas.width = Math.round(PAGE_WIDTH * scale);
  canvas.height = Math.round(PAGE_HEIGHT * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(scale, scale);

  drawPaperBackground(ctx, settings, page.pageIndex);

  const pen = PEN_COLORS[settings.penStyle];
  const fontFamily = getFontFamily(settings);
  const slantRad = (settings.slantDeg * Math.PI) / 180;
  const slantSkew = Math.tan(slantRad);

  ctx.font = `${settings.fontSize}px ${fontFamily}`;

  for (const line of page.lines) {
    const lineRand = mulberry32(
      settings.seed * 7919 + page.pageIndex * 1009 + line.lineIndex * 131
    );
    const lineStartDrift = (lineRand() - 0.5) * 3.5 * settings.jitter;
    const lineYDrift = (lineRand() - 0.5) * 1.6 * settings.jitter;

    let cursorX = settings.marginLeft + lineStartDrift;
    const baselineY =
      settings.marginTop +
      line.lineIndex * settings.lineHeight +
      settings.fontSize * 0.78 +
      lineYDrift;

    for (let charIdx = 0; charIdx < line.text.length; charIdx++) {
      const ch = line.text[charIdx];
      const charRand = mulberry32(
        settings.seed * 104729 +
          page.pageIndex * 3571 +
          line.lineIndex * 613 +
          charIdx * 97
      );

      if (ch === ' ') {
        const spaceJitter = 1 + (charRand() - 0.5) * 0.24 * settings.jitter;
        cursorX += settings.fontSize * settings.wordSpacing * spaceJitter;
        continue;
      }

      if (ch === '\t') {
        cursorX += settings.fontSize * settings.wordSpacing * 4;
        continue;
      }

      const variants = profile.glyphs[ch];
      const hasDrawnGlyph = variants && variants.length > 0;

      const rotDeg = (charRand() - 0.5) * 4.2 * settings.jitter;
      const rotRad = (rotDeg * Math.PI) / 180;
      const yOffset = (charRand() - 0.5) * 2.4 * settings.jitter;
      const xOffset = (charRand() - 0.5) * 1.0 * settings.jitter;
      const alphaVar =
        settings.inkOpacity * (1 - 0.14 * settings.jitter * charRand());

      if (hasDrawnGlyph) {
        const variant = variants[Math.floor(charRand() * variants.length)];
        const boxSize = settings.fontSize * 1.28;
        const advance =
          variant.widthRatio * settings.fontSize * 1.15 + settings.letterSpacing;

        ctx.save();
        // Position so the glyph's leftBearing starts near cursorX and baseline aligns with baselineY
        const drawOriginX = cursorX - variant.leftBearing * boxSize + 0.05 * boxSize + xOffset;
        const drawOriginY = baselineY - GLYPH_BASELINE_Y * boxSize + yOffset;

        const pivotX = drawOriginX + ((variant.leftBearing + variant.rightBearing) / 2) * boxSize;
        const pivotY = baselineY + yOffset;

        ctx.translate(pivotX, pivotY);
        ctx.rotate(rotRad);
        ctx.transform(1, 0, slantSkew, 1, 0, 0);
        ctx.translate(-pivotX, -pivotY);

        ctx.strokeStyle = pen.color;
        ctx.fillStyle = pen.color;
        ctx.globalAlpha = Math.max(0.25, Math.min(1, alphaVar));

        if (variant.imageDataUrl) {
          const tinted = getTintedGlyphCanvas(
            variant.id,
            variant.imageDataUrl,
            pen.color,
            onImageReady
          );
          if (tinted) {
            ctx.drawImage(tinted, drawOriginX, drawOriginY, boxSize, boxSize);
          }
        } else {
          ctx.lineWidth =
            pen.baseWidth *
            settings.strokeWidth *
            (settings.fontSize / 28) *
            (0.92 + charRand() * 0.16 * settings.jitter);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          for (const stroke of variant.strokes) {
            drawSmoothStroke(ctx, stroke, drawOriginX, drawOriginY, boxSize);
          }
        }
        ctx.restore();

        cursorX += advance;
      } else {
        // Fallback handwriting font or uploaded .ttf
        const charWidth = ctx.measureText(ch).width;
        ctx.save();
        ctx.translate(cursorX + charWidth / 2 + xOffset, baselineY + yOffset);
        ctx.rotate(rotRad);
        ctx.transform(1, 0, slantSkew, 1, 0, 0);
        ctx.fillStyle = pen.color;
        ctx.globalAlpha = Math.max(0.25, Math.min(1, alphaVar));
        ctx.font = `${settings.fontSize}px ${fontFamily}`;
        ctx.fillText(ch, -charWidth / 2, 0);
        ctx.restore();

        cursorX += charWidth + settings.letterSpacing;
      }
    }
  }

  ctx.restore();
}
