import { chartPng } from './chart.ts';
import { indexedPng } from './png.ts';
import type { Chart, ExportFormat, ExportRequest, ExportResponse } from './types.ts';

export function exportPng(chart: Chart, format: ExportFormat): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined' || !OffscreenCanvas.prototype.convertToBlob) {
    return format === 'chart'
      ? chartPng(chart, () => document.createElement('canvas'), () => new Promise(resolve => setTimeout(resolve, 0)))
      : indexedPng(chart);
  }
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL('./export-worker.ts', import.meta.url), { type: 'module' });
    const finish = (response: ExportResponse) => {
      clearTimeout(timeout);
      worker.terminate();
      if ('error' in response) reject(new Error(response.error));
      else resolve(response.blob);
    };
    const timeout = setTimeout(() => finish({ error: '导出超时，请减少图纸尺寸后重试。' }), 45000);
    worker.onmessage = ({ data }: MessageEvent<ExportResponse>) => finish(data);
    worker.onerror = () => finish({ error: '导出失败，请重试或减少图纸尺寸。' });
    // Structured cloning keeps the live preview's index buffer usable.
    try { worker.postMessage({ chart, format } satisfies ExportRequest); }
    catch (error) { finish({ error: error instanceof Error ? error.message : String(error) }); }
  });
}
