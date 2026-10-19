import { chartPng } from './chart.ts';
import { indexedPng } from './png.ts';
import type { WorkerPort, ExportRequest, ExportResponse } from './types.ts';
const scope = self as unknown as WorkerPort<ExportRequest, ExportResponse>;

scope.onmessage = async ({ data }) => {
  try {
    const blob = data.format === 'chart' ? await chartPng(data.chart) : await indexedPng(data.chart);
    scope.postMessage({ blob });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
