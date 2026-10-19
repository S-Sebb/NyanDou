import { startWorkerJob, type WorkerJob } from './worker-job.ts';
import type { QuantizeRequest, QuantizeResponse } from './types.ts';

/** Turns sampled pixels into a chart in a dedicated worker. The pixel buffer is transferred. */
export function startQuantizeJob(request: QuantizeRequest, onSettled: (response: QuantizeResponse) => void): WorkerJob {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  return startWorkerJob<QuantizeRequest, QuantizeResponse>(
    worker,
    request,
    {
      transfer: [request.rgba.buffer],
      timeoutMessage: '生成超时，请减少豆数或换一张图片后重试。',
      crashMessage: '无法生成图纸。请使用支持 Web Worker 的现代浏览器，或刷新后重试。',
    },
    onSettled,
  );
}
