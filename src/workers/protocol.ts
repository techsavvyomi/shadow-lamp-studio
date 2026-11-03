import type { BuildOptions, LampDesign } from '@/engines/lampGeometry/buildLamp';
import type { ProcessingResult } from '@/engines/imageProcessing/pipeline';
import type { LampGeometryResult, ProcessingParams, SilhouetteData } from '@/types';

export interface ImageJob {
  image: { data: Uint8ClampedArray; width: number; height: number };
  params: ProcessingParams;
}

export interface GeometryJob {
  silhouette: SilhouetteData | null;
  design: Required<LampDesign>;
  options: Omit<BuildOptions, 'onProgress'>;
  /** Wall plate decoration artwork (resolved on the main thread, where fonts load). */
  plateArt: SilhouetteData | null;
}

export type WorkerRequest<P> = { id: number; payload: P };
export type WorkerResponse<R> =
  | { id: number; type: 'progress'; stage: string; fraction: number }
  | { id: number; type: 'result'; result: R }
  | { id: number; type: 'error'; message: string };

export type ImageResult = ProcessingResult;
export type GeometryResult = LampGeometryResult;
