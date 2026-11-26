import React, { useEffect, useMemo, useState } from 'react';
import {
  FileArchive,
  FileText,
  PenTool,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { HandwritingStudio } from './components/HandwritingStudio';
import { PagePreview } from './components/PagePreview';
import {
  ALL_CHARACTERS,
  DEFAULT_PAGE_SETTINGS,
  PEN_COLORS,
  type HandwritingProfile,
  type PageSettings,
  type PaperStyle,
  type PenStyle,
} from './types/handwriting';
import {
  exportAllPagesPdf,
  exportAllPagesZip,
  exportSinglePagePng,
} from './utils/exportPages';
import { loadProfile, saveProfile } from './utils/glyphStorage';
import { paginateText } from './utils/paperRenderer';

const SAMPLE_TEXT = `Hey! This is a sample page generated in your own handwriting style.

You can paste your notes, essays, letters, or assignments right here, and InkCraft will automatically wrap lines, paginate across multiple pages, and add natural human variations like slight letter tilt, baseline drift, and ink pressure changes.

Want it to look 100% like YOUR handwriting?
Click "My Handwriting Studio" at the top, draw each letter (you can even record 2 or 3 variants of common letters like a, e, i, o, s, t), or upload a .ttf handwriting font!

Then pick your favorite paper style, ink color, and export as crisp PNGs or a multi-page PDF.`;

export function App() {
  const [mode, setMode] = useState<'editor' | 'studio'>('editor');
  const [text, setText] = useState<string>(SAMPLE_TEXT);
  const [profile, setProfile] = useState<HandwritingProfile>(() => loadProfile());
  const [settings, setSettings] = useState<PageSettings>(DEFAULT_PAGE_SETTINGS);
  const [currentPageIdx, setCurrentPageIdx] = useState<number>(0);
  const [exporting, setExporting] = useState<'zip' | 'pdf' | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  // Re-render once Google Fonts finish loading
  useEffect(() => {
    document.fonts.ready.then(() => {
      setFontsReady((prev) => !prev);
    });
  }, []);

  const handleUpdateProfile = (next: HandwritingProfile) => {
    setProfile(next);
    saveProfile(next);
  };

  const updateSetting = <K extends keyof PageSettings>(
    key: K,
    value: PageSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const pages = useMemo(
    () => paginateText(text, settings, profile),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, settings, profile, fontsReady]
  );

  useEffect(() => {
    if (currentPageIdx >= pages.length) {
      setCurrentPageIdx(Math.max(0, pages.length - 1));
    }
  }, [pages.length, currentPageIdx]);

  const recordedCount = useMemo(
    () =>
      ALL_CHARACTERS.filter((ch) => (profile.glyphs[ch]?.length || 0) > 0)
        .length,
    [profile]
  );

  const wordCount = useMemo(() => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [text]);

  const handleExportZip = async () => {
    setExporting('zip');
    try {
      await exportAllPagesZip(pages, settings, profile);
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    setExporting('pdf');
    try {
      await exportAllPagesPdf(pages, settings, profile);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <PenTool size={18} />
          </div>
          <div>
            <span className="brand-title">InkCraft</span>
            <span className="brand-sub">Text to My Handwriting</span>
          </div>
        </div>

        <nav className="mode-tabs">
          <button
            className={`tab-btn ${mode === 'editor' ? 'active' : ''}`}
            onClick={() => setMode('editor')}
          >
            <FileText size={16} /> Write & Generate
          </button>
          <button
            className={`tab-btn ${mode === 'studio' ? 'active' : ''}`}
            onClick={() => setMode('studio')}
          >
            <PenTool size={16} /> My Handwriting Studio
            <span className="tab-pill">
              {recordedCount}/{ALL_CHARACTERS.length}
            </span>
          </button>
        </nav>

        <div className="topbar-exports">
          <button
            className="btn btn-secondary btn-sm"
            disabled={exporting !== null}
            onClick={handleExportZip}
          >
            <FileArchive size={15} />
            {exporting === 'zip' ? 'Zipping...' : `Export ZIP (${pages.length})`}
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={exporting !== null}
            onClick={handleExportPdf}
          >
            <FileText size={15} />
            {exporting === 'pdf' ? 'Building PDF...' : 'Export PDF'}
          </button>
        </div>
      </header>

      {mode === 'studio' ? (
        <HandwritingStudio
          profile={profile}
          onUpdateProfile={handleUpdateProfile}
          customFontName={settings.customFontName}
          onUploadCustomFont={(fontName) =>
            updateSetting('customFontName', fontName)
          }
          onDone={() => setMode('editor')}
        />
      ) : (
        <main className="workspace-grid">
          <aside className="controls-panel">
            {/* Text Input Section */}
            <section className="panel-card">
              <div className="panel-card-header">
                <h3>Your Text</h3>
                <div className="inline-actions">
                  <button
                    className="btn-link"
                    onClick={() => setText(SAMPLE_TEXT)}
                  >
                    <Sparkles size={13} /> Sample
                  </button>
                  <button
                    className="btn-link danger"
                    onClick={() => setText('')}
                  >
                    <Trash2 size={13} /> Clear
                  </button>
                </div>
              </div>
              <textarea
                className="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste your text here..."
                rows={9}
              />
              <div className="text-stats">
                <span>{wordCount} words</span>
                <span>{text.length} chars</span>
                <span>
                  {pages.length} {pages.length === 1 ? 'page' : 'pages'}
                </span>
              </div>
            </section>

            {/* Paper & Ink Section */}
            <section className="panel-card">
              <div className="panel-card-header">
                <h3>
                  <Sliders size={15} /> Paper & Ink
                </h3>
              </div>

              <div className="control-group">
                <label>Paper Style</label>
                <div className="segmented-grid">
                  {(
                    [
                      ['ruled', 'Ruled'],
                      ['plain', 'Plain A4'],
                      ['grid', 'Grid'],
                      ['cream', 'Cream'],
                    ] as [PaperStyle, string][]
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      className={`seg-btn ${
                        settings.paperStyle === val ? 'active' : ''
                      }`}
                      onClick={() => updateSetting('paperStyle', val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group">
                <label>Pen & Ink</label>
                <div className="pen-swatches">
                  {(Object.keys(PEN_COLORS) as PenStyle[]).map((penKey) => {
                    const pen = PEN_COLORS[penKey];
                    const active = settings.penStyle === penKey;
                    return (
                      <button
                        key={penKey}
                        className={`pen-swatch ${active ? 'active' : ''}`}
                        onClick={() => updateSetting('penStyle', penKey)}
                        title={pen.label}
                      >
                        <span
                          className="swatch-dot"
                          style={{ backgroundColor: pen.color }}
                        />
                        <span className="swatch-name">{pen.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="control-group">
                <label>Fallback Font (for undrawn chars)</label>
                <select
                  className="select-input"
                  value={
                    settings.customFontName
                      ? '__custom__'
                      : settings.fallbackFont
                  }
                  onChange={(e) => {
                    if (e.target.value === '__custom__') return;
                    setSettings((prev) => ({
                      ...prev,
                      customFontName: null,
                      fallbackFont: e.target.value,
                    }));
                  }}
                >
                  {settings.customFontName && (
                    <option value="__custom__">Uploaded Custom Font</option>
                  )}
                  <option value="Caveat">Caveat (Natural Cursive)</option>
                  <option value="Patrick Hand">Patrick Hand (Neat Print)</option>
                  <option value="Indie Flower">Indie Flower (Casual)</option>
                </select>
              </div>

              <div className="sliders-grid">
                <SliderControl
                  label="Font Size"
                  value={settings.fontSize}
                  min={16}
                  max={46}
                  step={1}
                  suffix="px"
                  onChange={(v) => updateSetting('fontSize', v)}
                />
                <SliderControl
                  label="Line Spacing"
                  value={settings.lineHeight}
                  min={22}
                  max={60}
                  step={1}
                  suffix="px"
                  onChange={(v) => updateSetting('lineHeight', v)}
                />
                <SliderControl
                  label="Human Messiness"
                  value={settings.jitter}
                  min={0}
                  max={1.5}
                  step={0.05}
                  onChange={(v) => updateSetting('jitter', v)}
                />
                <SliderControl
                  label="Slant Angle"
                  value={settings.slantDeg}
                  min={-15}
                  max={15}
                  step={1}
                  suffix="°"
                  onChange={(v) => updateSetting('slantDeg', v)}
                />
                <SliderControl
                  label="Ink Thickness"
                  value={settings.strokeWidth}
                  min={0.6}
                  max={1.8}
                  step={0.05}
                  suffix="x"
                  onChange={(v) => updateSetting('strokeWidth', v)}
                />
                <SliderControl
                  label="Left Margin"
                  value={settings.marginLeft}
                  min={40}
                  max={150}
                  step={2}
                  suffix="px"
                  onChange={(v) => updateSetting('marginLeft', v)}
                />
              </div>

              <div className="toggles-row">
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={settings.showBinderHoles}
                    onChange={(e) =>
                      updateSetting('showBinderHoles', e.target.checked)
                    }
                  />
                  Binder holes
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={settings.showPaperGrain}
                    onChange={(e) =>
                      updateSetting('showPaperGrain', e.target.checked)
                    }
                  />
                  Paper grain
                </label>
              </div>
            </section>
          </aside>

          <PagePreview
            pages={pages}
            currentPageIdx={currentPageIdx}
            onChangePage={setCurrentPageIdx}
            settings={settings}
            profile={profile}
            onRerollSeed={() =>
              updateSetting('seed', Math.floor(Math.random() * 100000))
            }
            onDownloadCurrent={() => {
              const page = pages[currentPageIdx] || pages[0];
              if (page) exportSinglePagePng(page, settings, profile);
            }}
          />
        </main>
      )}
    </div>
  );
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (val: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}) => (
  <div className="slider-item">
    <div className="slider-head">
      <span>{label}</span>
      <span className="slider-val">
        {Number.isInteger(step) ? value : value.toFixed(2)}
        {suffix}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  </div>
);

export default App;
