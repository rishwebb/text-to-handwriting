import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Dices, Download } from 'lucide-react';
import type { HandwritingProfile, PageSettings } from '../types/handwriting';
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  renderPageToCanvas,
  type PageLayout,
} from '../utils/paperRenderer';

interface PagePreviewProps {
  pages: PageLayout[];
  currentPageIdx: number;
  onChangePage: (idx: number) => void;
  settings: PageSettings;
  profile: HandwritingProfile;
  onRerollSeed: () => void;
  onDownloadCurrent: () => void;
}

export const PagePreview: React.FC<PagePreviewProps> = ({
  pages,
  currentPageIdx,
  onChangePage,
  settings,
  profile,
  onRerollSeed,
  onDownloadCurrent,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageTick, setImageTick] = React.useState(0);
  const safeIndex = Math.min(currentPageIdx, Math.max(0, pages.length - 1));
  const currentPage = pages[safeIndex] || { pageIndex: 0, lines: [] };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPageToCanvas(canvas, currentPage, settings, profile, 2, () => {
      setImageTick((t) => t + 1);
    });
  }, [currentPage, settings, profile, imageTick]);

  return (
    <div className="preview-panel">
      <div className="preview-toolbar">
        <div className="page-nav">
          <button
            className="btn btn-icon"
            disabled={safeIndex <= 0}
            onClick={() => onChangePage(safeIndex - 1)}
            title="Previous page"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="page-counter">
            Page <strong>{safeIndex + 1}</strong> of <strong>{pages.length}</strong>
          </span>
          <button
            className="btn btn-icon"
            disabled={safeIndex >= pages.length - 1}
            onClick={() => onChangePage(safeIndex + 1)}
            title="Next page"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="preview-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={onRerollSeed}
            title="Randomize handwriting variation"
          >
            <Dices size={15} /> Re-roll Ink
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={onDownloadCurrent}
          >
            <Download size={15} /> Save Page PNG
          </button>
        </div>
      </div>

      <div className="preview-canvas-stage">
        <div className="paper-shadow-frame">
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            style={{
              aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
