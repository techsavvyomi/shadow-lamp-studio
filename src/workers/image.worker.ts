/// <reference lib="webworker" />
import { processImage } from '@/engines/imageProcessing/pipeline';
import type { ImageJob, ImageResult, WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest<ImageJob>>) => {
  const { id, payload } = e.data;
  try {
    const result = processImage(payload.image, payload.params);
    const msg: WorkerResponse<ImageResult> = { id, type: 'result', result };
    ctx.postMessage(msg, [result.mask.buffer]);
  } catch (err) {
    const msg: WorkerResponse<ImageResult> = { id, type: 'error', message: err instanceof Error ? err.message : String(err) };
    ctx.postMessage(msg);
  }
};
