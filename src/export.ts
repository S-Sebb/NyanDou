import { chartPng } from './chart.ts';
import { indexedPng } from './png.ts';
import { startWorkerJob } from './worker-job.ts';
import type { Chart, ExportFormat, ExportRequest, ExportResponse } from './types.ts';

const supportsOffscreenCanvas = () =>
  typeof OffscreenCanvas !== 'undefined' && Boolean(OffscreenCanvas.prototype.convertToBlob);

/** Main-thread fallback that yields between row batches to keep the page responsive. */
function exportOnMainThread(chart: Chart, format: ExportFormat): Promise<Blob> {
  if (format === 'pixel') return indexedPng(chart);
  return chartPng(chart, {
    createCanvas: () => document.createElement('canvas'),
    yieldBetweenRows: () => new Promise(resolve => setTimeout(resolve, 0)),
  });
}

/** Renders the download in a dedicated worker, falling back to the main thread when needed. */
export function exportPng(chart: Chart, format: ExportFormat): Promise<Blob> {
  if (!supportsOffscreenCanvas()) return exportOnMainThread(chart, format);
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL('./export-worker.ts', import.meta.url), { type: 'module' });
    // Not transferred: structured cloning keeps the live preview's index buffer usable.
    startWorkerJob<ExportRequest, ExportResponse>(
      worker,
      { chart, format },
      {
        timeoutMessage: '导出超时，请减少图纸尺寸后重试。',
        crashMessage: '导出失败，请重试或减少图纸尺寸。',
      },
      response => {
        if ('error' in response) reject(new Error(response.error));
        else resolve(response.blob);
      },
    );
  });
}
