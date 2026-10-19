import { WORKER_TIMEOUT_MS } from './constants.ts';
import type { ErrorResponse } from './types.ts';

export interface WorkerJob {
  /** Stops the worker; the job then never settles. */
  cancel(): void;
}

interface WorkerJobOptions {
  transfer?: Transferable[];
  timeoutMessage: string;
  crashMessage: string;
}

/**
 * Sends one request to a dedicated worker and settles exactly once: with the worker's
 * reply, or with an error after a crash or timeout. The worker is terminated either way.
 * Throws if the request cannot be posted.
 */
export function startWorkerJob<Request, Response>(
  worker: Worker,
  request: Request,
  { transfer = [], timeoutMessage, crashMessage }: WorkerJobOptions,
  onSettled: (response: Response | ErrorResponse) => void,
): WorkerJob {
  let active = true;
  const stop = () => {
    active = false;
    clearTimeout(timeout);
    worker.terminate();
  };
  const settle = (response: Response | ErrorResponse) => {
    if (!active) return;
    stop();
    onSettled(response);
  };

  const timeout = setTimeout(() => settle({ error: timeoutMessage }), WORKER_TIMEOUT_MS);
  worker.onmessage = ({ data }: MessageEvent<Response>) => settle(data);
  worker.onerror = () => settle({ error: crashMessage });
  try {
    worker.postMessage(request, transfer);
  } catch (error) {
    stop();
    throw error;
  }
  return { cancel: () => { if (active) stop(); } };
}
