import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import type { HandwritingProfile, PageSettings } from '../types/handwriting';
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  preloadProfileImages,
  renderPageToCanvas,
  type PageLayout,
} from './paperRenderer';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to export canvas to PNG'));
    }, 'image/png');
  });
}

export async function exportSinglePagePng(
  page: PageLayout,
  settings: PageSettings,
  profile: HandwritingProfile
): Promise<void> {
  await preloadProfileImages(profile);
  const canvas = document.createElement('canvas');
  renderPageToCanvas(canvas, page, settings, profile, 2);
  const blob = await canvasToBlob(canvas);
  triggerDownload(blob, `handwriting-page-${page.pageIndex + 1}.png`);
}

export async function exportAllPagesZip(
  pages: PageLayout[],
  settings: PageSettings,
  profile: HandwritingProfile
): Promise<void> {
  await preloadProfileImages(profile);
  const zip = new JSZip();
  const canvas = document.createElement('canvas');

  for (const page of pages) {
    renderPageToCanvas(canvas, page, settings, profile, 2);
    const blob = await canvasToBlob(canvas);
    zip.file(`page-${String(page.pageIndex + 1).padStart(2, '0')}.png`, blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, 'handwriting-pages.zip');
}

export async function exportAllPagesPdf(
  pages: PageLayout[],
  settings: PageSettings,
  profile: HandwritingProfile
): Promise<void> {
  await preloadProfileImages(profile);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [PAGE_WIDTH, PAGE_HEIGHT],
    hotfixes: ['px_scaling'],
  });

  const canvas = document.createElement('canvas');

  pages.forEach((page, index) => {
    if (index > 0) {
      pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT], 'portrait');
    }
    renderPageToCanvas(canvas, page, settings, profile, 2);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    pdf.addImage(dataUrl, 'JPEG', 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  });

  pdf.save('handwriting-pages.pdf');
}
