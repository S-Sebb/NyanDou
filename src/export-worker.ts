// Export worker: renders download files on its own OffscreenCanvas.
import { chartPng } from './chart.ts';
import { errorMessage } from './format.ts';
import { indexedPng } from './png.ts';
import type { ExportRequest, ExportResponse, WorkerPort } from './types.ts';

const scope = self as unknown as WorkerPort<ExportRequest, ExportResponse>;

scope.onmessage = async ({ data: { chart, format } }) => {
  try {
    const blob = format === 'chart' ? await chartPng(chart) : await indexedPng(chart);
    scope.postMessage({ blob });
  } catch (error) {
    scope.postMessage({ error: errorMessage(error) });
  }
};
