import type { GlyphStroke, GlyphVariant, HandwritingProfile } from '../types/handwriting';

const STORAGE_KEY = 'inkcraft_handwriting_profile_v1';

export function computeGlyphMetrics(strokes: GlyphStroke[]): {
  leftBearing: number;
  rightBearing: number;
  widthRatio: number;
} {
  let minX = 1;
  let maxX = 0;
  let hasPoints = false;

  for (const stroke of strokes) {
    for (const pt of stroke) {
      hasPoints = true;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
    }
  }

  if (!hasPoints) {
    return { leftBearing: 0.25, rightBearing: 0.75, widthRatio: 0.5 };
  }

  const clampedMin = Math.max(0, Math.min(0.95, minX));
  const clampedMax = Math.max(clampedMin + 0.05, Math.min(1, maxX));
  const rawWidth = clampedMax - clampedMin;
  // Minimum advance width so narrow punctuation/letters still breathe naturally
  const widthRatio = Math.max(0.18, rawWidth + 0.12);

  return {
    leftBearing: clampedMin,
    rightBearing: clampedMax,
    widthRatio,
  };
}

export function createEmptyProfile(name = 'My Handwriting'): HandwritingProfile {
  return {
    id: `profile_${Date.now()}`,
    name,
    createdAt: Date.now(),
    glyphs: {},
  };
}

export function loadProfile(): HandwritingProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyProfile();
    const parsed = JSON.parse(raw) as HandwritingProfile;
    if (!parsed || typeof parsed !== 'object' || !parsed.glyphs) {
      return createEmptyProfile();
    }
    return parsed;
  } catch {
    return createEmptyProfile();
  }
}

export function saveProfile(profile: HandwritingProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.warn('Failed to save handwriting profile to localStorage:', err);
  }
}

export function exportProfileJson(profile: HandwritingProfile): void {
  const blob = new Blob([JSON.stringify(profile, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'handwriting'}-profile.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportedProfile(jsonText: string): HandwritingProfile {
  const parsed = JSON.parse(jsonText) as HandwritingProfile;
  if (!parsed || typeof parsed.glyphs !== 'object') {
    throw new Error('Invalid handwriting profile JSON.');
  }
  return {
    id: parsed.id || `profile_${Date.now()}`,
    name: parsed.name || 'Imported Handwriting',
    createdAt: parsed.createdAt || Date.now(),
    glyphs: parsed.glyphs,
  };
}

export function createGlyphVariant(strokes: GlyphStroke[]): GlyphVariant {
  const metrics = computeGlyphMetrics(strokes);
  return {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    strokes,
    ...metrics,
  };
}
