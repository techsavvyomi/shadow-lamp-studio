import type { WorkerRequest, WorkerResponse } from './protocol';

interface Pending<R> {
  resolve: (r: R) => void;
  reject: (e: Error) => void;
  onProgress?: (stage: string, fraction: number) => void;
}

/**
 * Promise-based RPC over a dedicated worker with "latest wins" scheduling: while a
 * job runs, only the most recent queued job is kept; superseded jobs reject with
 * `SupersededError` so slider drags never build up a backlog.
 */
export class LatestWorkerClient<P, R> {
  private worker: Worker | null = null;
  private seq = 0;
  private running: number | null = null;
  private queued: { id: number; payload: P; transfer: Transferable[] } | null = null;
  private pending = new Map<number, Pending<R>>();

  constructor(private factory: () => Worker) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = this.factory();
    w.onmessage = (e: MessageEvent<WorkerResponse<R>>) => this.onMessage(e.data);
    w.onerror = (e) => {
      const err = new Error(e.message || 'Worker crashed');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.running = null;
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker = w;
    return w;
  }

  run(payload: P, transfer: Transferable[] = [], onProgress?: (stage: string, fraction: number) => void): Promise<R> {
    const id = ++this.seq;
    const promise = new Promise<R>((resolve, reject) => this.pending.set(id, { resolve, reject, onProgress }));
    if (this.running === null) this.dispatch(id, payload, transfer);
    else {
      if (this.queued) this.supersede(this.queued.id);
      this.queued = { id, payload, transfer };
    }
    return promise;
  }

  private dispatch(id: number, payload: P, transfer: Transferable[]) {
    this.running = id;
    const msg: WorkerRequest<P> = { id, payload };
    this.ensure().postMessage(msg, transfer);
  }

  private supersede(id: number) {
    const p = this.pending.get(id);
    this.pending.delete(id);
    p?.reject(new SupersededError());
  }

  private onMessage(msg: WorkerResponse<R>) {
    const p = this.pending.get(msg.id);
    if (msg.type === 'progress') {
      p?.onProgress?.(msg.stage, msg.fraction);
      return;
    }
    this.pending.delete(msg.id);
    if (msg.type === 'result') p?.resolve(msg.result);
    else p?.reject(new Error(msg.message));
    this.running = null;
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      this.dispatch(q.id, q.payload, q.transfer);
    }
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
  }
}

export class SupersededError extends Error {
  constructor() {
    super('superseded');
  }
}

export const isSuperseded = (e: unknown) => e instanceof SupersededError;
