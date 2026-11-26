export interface StrokePoint {
  /** Normalized X coordinate within glyph box [0..1] */
  x: number;
  /** Normalized Y coordinate within glyph box [0..1] */
  y: number;
}

export type GlyphStroke = StrokePoint[];

export interface GlyphVariant {
  id: string;
  strokes: GlyphStroke[];
  /** Optional transparent ink-mask PNG data URL extracted from a photo */
  imageDataUrl?: string;
  /** Vertical placement offset ratio relative to glyph box (for image glyphs) */
  yOffsetRatio?: number;
  /** Bounding box left edge [0..1] */
  leftBearing: number;
  /** Bounding box right edge [0..1] */
  rightBearing: number;
  /** Effective advance width ratio relative to fontSize */
  widthRatio: number;
}

export interface HandwritingProfile {
  id: string;
  name: string;
  createdAt: number;
  glyphs: Record<string, GlyphVariant[]>;
}

export type PaperStyle = 'ruled' | 'plain' | 'grid' | 'cream';

export type PenStyle =
  | 'ballpoint-blue'
  | 'gel-black'
  | 'fountain-navy'
  | 'red-ink'
  | 'pencil';

export interface PageSettings {
  paperStyle: PaperStyle;
  penStyle: PenStyle;
  fontSize: number;
  lineHeight: number;
  slantDeg: number;
  jitter: number;
  wordSpacing: number;
  letterSpacing: number;
  marginLeft: number;
  marginTop: number;
  showBinderHoles: boolean;
  showPaperGrain: boolean;
  inkOpacity: number;
  strokeWidth: number;
  fallbackFont: string;
  customFontName: string | null;
  seed: number;
}

export const CHAR_GROUPS: { label: string; chars: string[] }[] = [
  {
    label: 'Lowercase',
    chars: 'abcdefghijklmnopqrstuvwxyz'.split(''),
  },
  {
    label: 'Uppercase',
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  },
  {
    label: 'Numbers',
    chars: '0123456789'.split(''),
  },
  {
    label: 'Punctuation',
    chars: ['.', ',', '!', '?', ';', ':', "'", '"', '-', '(', ')', '/', '&', '+', '=', '@', '#'],
  },
];

export const ALL_CHARACTERS: string[] = CHAR_GROUPS.flatMap((g) => g.chars);

export const PEN_COLORS: Record<PenStyle, { color: string; label: string; baseWidth: number }> = {
  'ballpoint-blue': { color: '#1b3f8b', label: 'Ballpoint Blue', baseWidth: 1.85 },
  'gel-black': { color: '#1a1c20', label: 'Gel Black', baseWidth: 2.1 },
  'fountain-navy': { color: '#14244b', label: 'Fountain Navy', baseWidth: 2.35 },
  'red-ink': { color: '#a8222a', label: 'Red Pen', baseWidth: 1.85 },
  pencil: { color: '#4c5157', label: 'Graphite Pencil', baseWidth: 1.7 },
};

export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  paperStyle: 'ruled',
  penStyle: 'ballpoint-blue',
  fontSize: 28,
  lineHeight: 36,
  slantDeg: -4,
  jitter: 0.45,
  wordSpacing: 0.36,
  letterSpacing: 0,
  marginLeft: 92,
  marginTop: 98,
  showBinderHoles: true,
  showPaperGrain: true,
  inkOpacity: 0.92,
  strokeWidth: 1.0,
  fallbackFont: 'Caveat',
  customFontName: null,
  seed: 42,
};
