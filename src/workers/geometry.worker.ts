/// <reference lib="webworker" />
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { buildLamp } from '@/engines/lampGeometry/buildLamp';
import { loadManifold } from '@/engines/lampGeometry/manifoldRuntime';
import type { GeometryJob, GeometryResult, WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: WorkerResponse<GeometryResult>, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);

ctx.onmessage = async (e: MessageEvent<WorkerRequest<GeometryJob>>) => {
  const { id, payload } = e.data;
  try {
    const wasm = await loadManifold(() => wasmUrl);
    const result = await buildLamp(wasm, payload.silhouette, payload.design, {
      ...payload.options,
      onProgress: (stage, fraction) => post({ id, type: 'progress', stage, fraction }),
    });
    const transfer: Transferable[] = [];
    for (const p of result.parts) transfer.push(p.mesh.positions.buffer, p.mesh.indices.buffer);
    post({ id, type: 'result', result }, transfer);
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
