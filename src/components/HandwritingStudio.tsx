import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  Eraser,
  FastForward,
  RotateCcw,
  Trash2,
  Upload,
  FileType,
  ImagePlus,
} from 'lucide-react';
import {
  ALL_CHARACTERS,
  CHAR_GROUPS,
  type GlyphStroke,
  type GlyphVariant,
  type HandwritingProfile,
  type StrokePoint,
} from '../types/handwriting';
import { extractGlyphsFromGridImage } from '../utils/gridExtractor';
import {
  createEmptyProfile,
  createGlyphVariant,
  exportProfileJson,
  parseImportedProfile,
} from '../utils/glyphStorage';
import { drawSmoothStroke, GLYPH_BASELINE_Y } from '../utils/paperRenderer';

interface HandwritingStudioProps {
  profile: HandwritingProfile;
  onUpdateProfile: (profile: HandwritingProfile) => void;
  customFontName: string | null;
  onUploadCustomFont: (fontName: string) => void;
  onDone: () => void;
}

const PAD_SIZE = 320;

export const HandwritingStudio: React.FC<HandwritingStudioProps> = ({
  profile,
  onUpdateProfile,
  customFontName,
  onUploadCustomFont,
  onDone,
}) => {
  const [selectedChar, setSelectedChar] = useState<string>('a');
  const [strokes, setStrokes] = useState<GlyphStroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showGhost, setShowGhost] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentStrokeRef = useRef<GlyphStroke>([]);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const gridInputRef = useRef<HTMLInputElement | null>(null);

  const variants = profile.glyphs[selectedChar] || [];
  const recordedCount = ALL_CHARACTERS.filter(
    (ch) => (profile.glyphs[ch]?.length || 0) > 0
  ).length;

  const flashStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => {
      setStatusMsg((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  const redrawPad = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = PAD_SIZE * dpr;
    canvas.height = PAD_SIZE * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#fdfcf8';
    ctx.fillRect(0, 0, PAD_SIZE, PAD_SIZE);

    // Guide lines: Cap (0.20), X-height (0.44), Baseline (0.72), Descender (0.90)
    const guides = [
      { y: 0.2, label: 'Cap', color: 'rgba(148, 163, 184, 0.35)', dash: [4, 4] },
      { y: 0.44, label: 'x-height', color: 'rgba(148, 163, 184, 0.35)', dash: [4, 4] },
      { y: GLYPH_BASELINE_Y, label: 'Baseline', color: 'rgba(239, 68, 68, 0.45)', dash: [] },
      { y: 0.9, label: 'Descender', color: 'rgba(148, 163, 184, 0.3)', dash: [3, 4] },
    ];

    ctx.font = '10px Inter, sans-serif';
    for (const g of guides) {
      const py = g.y * PAD_SIZE;
      ctx.save();
      ctx.strokeStyle = g.color;
      ctx.lineWidth = g.dash.length === 0 ? 1.5 : 1;
      ctx.setLineDash(g.dash);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(PAD_SIZE, py);
      ctx.stroke();
      ctx.fillStyle = 'rgba(100, 116, 139, 0.7)';
      ctx.fillText(g.label, 8, py - 4);
      ctx.restore();
    }

    // Center vertical guide
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD_SIZE / 2, 0);
    ctx.lineTo(PAD_SIZE / 2, PAD_SIZE);
    ctx.stroke();
    ctx.restore();

    // Ghost character guide
    if (showGhost) {
      ctx.save();
      ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.font = `${PAD_SIZE * 0.62}px "Caveat", cursive`;
      ctx.textAlign = 'center';
      ctx.fillText(selectedChar, PAD_SIZE / 2, GLYPH_BASELINE_Y * PAD_SIZE);
      ctx.restore();
    }

    // Draw recorded strokes
    ctx.strokeStyle = '#1b3f8b';
    ctx.fillStyle = '#1b3f8b';
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokes) {
      drawSmoothStroke(ctx, stroke, 0, 0, PAD_SIZE);
    }

    if (currentStrokeRef.current.length > 0) {
      drawSmoothStroke(ctx, currentStrokeRef.current, 0, 0, PAD_SIZE);
    }

    ctx.restore();
  }, [selectedChar, showGhost, strokes]);

  useEffect(() => {
    redrawPad();
  }, [redrawPad]);

  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    currentStrokeRef.current = [getNormalizedPoint(e)];
    redrawPad();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pt = getNormalizedPoint(e);
    const prev = currentStrokeRef.current[currentStrokeRef.current.length - 1];
    if (prev) {
      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      if (dx * dx + dy * dy < 0.00004) return;
    }
    currentStrokeRef.current.push(pt);
    redrawPad();
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentStrokeRef.current.length > 0) {
      const finished = [...currentStrokeRef.current];
      currentStrokeRef.current = [];
      setStrokes((prev) => [...prev, finished]);
    }
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    currentStrokeRef.current = [];
    setStrokes([]);
  };

  const handleSaveVariant = (advanceNext = false) => {
    if (strokes.length === 0) {
      flashStatus('Draw the character first!');
      return;
    }
    const newVariant = createGlyphVariant(strokes);
    const existing = profile.glyphs[selectedChar] || [];
    const updated: HandwritingProfile = {
      ...profile,
      glyphs: {
        ...profile.glyphs,
        [selectedChar]: [...existing, newVariant],
      },
    };
    onUpdateProfile(updated);
    setStrokes([]);
    flashStatus(`Saved variant #${existing.length + 1} for "${selectedChar}"`);

    if (advanceNext) {
      const nextUnrecorded = ALL_CHARACTERS.find(
        (ch) => ch !== selectedChar && !(updated.glyphs[ch]?.length > 0)
      );
      if (nextUnrecorded) {
        setSelectedChar(nextUnrecorded);
      } else {
        const idx = ALL_CHARACTERS.indexOf(selectedChar);
        setSelectedChar(ALL_CHARACTERS[(idx + 1) % ALL_CHARACTERS.length]);
      }
    }
  };

  const handleDeleteVariant = (variantId: string) => {
    const existing = profile.glyphs[selectedChar] || [];
    const filtered = existing.filter((v) => v.id !== variantId);
    const nextGlyphs = { ...profile.glyphs };
    if (filtered.length === 0) {
      delete nextGlyphs[selectedChar];
    } else {
      nextGlyphs[selectedChar] = filtered;
    }
    onUpdateProfile({ ...profile, glyphs: nextGlyphs });
  };

  const handleJumpNextUnrecorded = () => {
    const next = ALL_CHARACTERS.find(
      (ch) => ch !== selectedChar && !(profile.glyphs[ch]?.length > 0)
    );
    if (next) {
      setSelectedChar(next);
      setStrokes([]);
    } else {
      flashStatus('All 80 characters have at least 1 variant!');
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedProfile(text);
      onUpdateProfile(imported);
      flashStatus(`Imported "${imported.name}"`);
    } catch {
      flashStatus('Invalid profile JSON file');
    } finally {
      e.target.value = '';
    }
  };

  const handleUploadFont = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const fontName = `CustomHandwriting_${Date.now()}`;
      const face = new FontFace(fontName, buffer);
      await face.load();
      document.fonts.add(face);
      onUploadCustomFont(fontName);
      flashStatus(`Loaded font "${file.name}"`);
    } catch {
      flashStatus('Failed to load .ttf / .otf font file');
    } finally {
      e.target.value = '';
    }
  };

  const handleUploadGridPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const extracted = extractGlyphsFromGridImage(img, {
          rows: 8,
          cols: 10,
          inkThreshold: 195,
          cellInset: 0.035,
        });
        URL.revokeObjectURL(url);
        const count = Object.keys(extracted).length;
        if (count === 0) {
          flashStatus('Could not detect ink in grid cells. Try a higher-contrast image.');
          return;
        }
        const mergedGlyphs = { ...profile.glyphs };
        for (const [ch, vars] of Object.entries(extracted)) {
          // Replace previous grid-extracted variants while keeping hand-drawn ones
          const manualOnly = (mergedGlyphs[ch] || []).filter(
            (v) => !v.id.startsWith('grid_')
          );
          mergedGlyphs[ch] = [...manualOnly, ...vars];
        }
        onUpdateProfile({
          ...profile,
          glyphs: mergedGlyphs,
        });
        flashStatus(`Extracted ${count} characters from grid photo!`);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        flashStatus('Failed to read image file.');
      };
      img.src = url;
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="studio-container">
      <div className="studio-header">
        <div>
          <h2>My Handwriting Studio</h2>
          <p className="muted-text">
            Draw characters below ({recordedCount}/{ALL_CHARACTERS.length} recorded). Add 2–3
            variants of common letters so your handwriting never looks copy-pasted.
          </p>
        </div>
        <div className="studio-header-actions">
          <button
            className="btn btn-primary"
            onClick={() => gridInputRef.current?.click()}
            title="Upload an 8x10 character grid photo (like the ChatGPT sheet)"
          >
            <ImagePlus size={16} /> Import 8×10 Grid Photo
          </button>
          <input
            ref={gridInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleUploadGridPhoto}
          />
          <button
            className="btn btn-secondary"
            onClick={() => fontInputRef.current?.click()}
            title="Upload a .ttf or .otf handwriting font (e.g. from Calligraphr)"
          >
            <FileType size={16} />
            {customFontName ? 'Change .ttf Font' : 'Upload .ttf/.otf'}
          </button>
          <input
            ref={fontInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            hidden
            onChange={handleUploadFont}
          />
          <button
            className="btn btn-secondary"
            onClick={() => exportProfileJson(profile)}
          >
            <Download size={16} /> Export JSON
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => jsonInputRef.current?.click()}
          >
            <Upload size={16} /> Import JSON
          </button>
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json"
            hidden
            onChange={handleImportJson}
          />
          <button
            className="btn btn-danger-outline"
            onClick={() => {
              if (window.confirm('Clear all drawn characters in this profile?')) {
                onUpdateProfile(createEmptyProfile(profile.name));
                setStrokes([]);
              }
            }}
          >
            <Trash2 size={16} /> Reset
          </button>
          <button className="btn btn-primary" onClick={onDone}>
            <Check size={16} /> Back to Page Generator
          </button>
        </div>
      </div>

      <div className="studio-grid">
        {/* Left: Character Picker */}
        <div className="char-palette-card">
          <div className="palette-top">
            <span>Select Character</span>
            <button className="btn-link" onClick={handleJumpNextUnrecorded}>
              <FastForward size={14} /> Next unrecorded
            </button>
          </div>

          {CHAR_GROUPS.map((group) => (
            <div key={group.label} className="char-group">
              <div className="char-group-label">{group.label}</div>
              <div className="char-buttons">
                {group.chars.map((ch) => {
                  const count = profile.glyphs[ch]?.length || 0;
                  const active = selectedChar === ch;
                  return (
                    <button
                      key={ch}
                      className={`char-btn ${active ? 'active' : ''} ${
                        count > 0 ? 'recorded' : ''
                      }`}
                      onClick={() => {
                        setSelectedChar(ch);
                        setStrokes([]);
                      }}
                    >
                      <span>{ch}</span>
                      {count > 0 && <span className="variant-badge">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right: Drawing Pad + Saved Variants */}
        <div className="pad-card">
          <div className="pad-top-bar">
            <div className="pad-char-title">
              Drawing: <span className="big-char-badge">{selectedChar}</span>
            </div>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={showGhost}
                onChange={(e) => setShowGhost(e.target.checked)}
              />
              Show faint guide
            </label>
          </div>

          <div className="canvas-pad-wrapper">
            <canvas
              ref={canvasRef}
              className="drawing-pad-canvas"
              style={{ width: PAD_SIZE, height: PAD_SIZE }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </div>

          <div className="pad-actions">
            <button
              className="btn btn-secondary"
              onClick={handleUndo}
              disabled={strokes.length === 0}
            >
              <RotateCcw size={16} /> Undo
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleClear}
              disabled={strokes.length === 0}
            >
              <Eraser size={16} /> Clear
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleSaveVariant(false)}
              disabled={strokes.length === 0}
            >
              <Check size={16} /> Save Variant
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handleSaveVariant(true)}
              disabled={strokes.length === 0}
            >
              Save & Next →
            </button>
          </div>

          {statusMsg && <div className="status-toast">{statusMsg}</div>}

          <div className="variants-section">
            <div className="variants-title">
              Saved Variants for "{selectedChar}" ({variants.length})
            </div>
            {variants.length === 0 ? (
              <p className="muted-text small">
                No custom variants yet — the generator will use your fallback font for "{selectedChar}"
                until you draw it.
              </p>
            ) : (
              <div className="variants-list">
                {variants.map((v, i) => (
                  <VariantThumbnail
                    key={v.id}
                    index={i}
                    variant={v}
                    onDelete={() => handleDeleteVariant(v.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface VariantThumbnailProps {
  index: number;
  variant: GlyphVariant;
  onDelete: () => void;
}

const VariantThumbnail: React.FC<VariantThumbnailProps> = ({
  index,
  variant,
  onDelete,
}) => {
  const thumbRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = thumbRef.current;
    if (!canvas) return;
    const size = 64;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fdfcf8';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, GLYPH_BASELINE_Y * size);
    ctx.lineTo(size, GLYPH_BASELINE_Y * size);
    ctx.stroke();

    if (variant.imageDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, size, size);
      };
      img.src = variant.imageDataUrl;
    } else {
      ctx.strokeStyle = '#1b3f8b';
      ctx.fillStyle = '#1b3f8b';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of variant.strokes) {
        drawSmoothStroke(ctx, s, 0, 0, size);
      }
    }
  }, [variant]);

  return (
    <div className="variant-chip">
      <canvas ref={thumbRef} style={{ width: 64, height: 64 }} />
      <span className="variant-label">#{index + 1}</span>
      <button
        className="variant-delete-btn"
        onClick={onDelete}
        title="Delete variant"
      >
        ×
      </button>
    </div>
  );
};
