/**
 * Reactive processing pipeline: image → silhouette (image worker) and
 * silhouette + design → lamp geometry (geometry worker). Both are debounced and
 * use latest-wins workers so the UI stays responsive while sliders move.
 */
import { useEffect, useMemo } from 'react';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useImageStore } from '@/stores/imageStore';
import type { SilhouetteData } from '@/types';
import { isSuperseded, LatestWorkerClient } from '@/workers/client';
import { usePlateArt } from './usePlateArt';
import type { GeometryJob, GeometryResult, ImageJob, ImageResult } from '@/workers/protocol';

const imageClient = new LatestWorkerClient<ImageJob, ImageResult>(
  () => new Worker(new URL('../workers/image.worker.ts', import.meta.url), { type: 'module' }),
);
const geometryClient = new LatestWorkerClient<GeometryJob, GeometryResult>(
  () => new Worker(new URL('../workers/geometry.worker.ts', import.meta.url), { type: 'module' }),
);

/** True when the vector path of an SVG drives the geometry. */
export function useVectorMode() {
  const source = useImageStore((s) => s.source);
  const svgVector = useDesignStore((s) => s.design.processing.svgVector);
  return !!(source?.kind === 'svg' && svgVector && source.vector && source.vector.shapes.length);
}

/** The silhouette that drives geometry generation (memoised for referential stability). */
export function useSilhouetteData(): SilhouetteData | null {
  const source = useImageStore((s) => s.source);
  const processed = useImageStore((s) => s.processed);
  const crop = useDesignStore((s) => s.design.processing.crop);
  const invert = useDesignStore((s) => s.design.processing.invert);
  const vectorMode = useVectorMode();
  return useMemo(() => {
    if (vectorMode && source?.vector) {
      const f = source.vector.frame;
      return {
        ...source.vector,
        frame: { x: f.x + crop.x * f.w, y: f.y + crop.y * f.h, w: crop.w * f.w, h: crop.h * f.h },
        invert,
      };
    }
    if (!processed || !processed.loops.length) return null;
    return {
      shapes: [{ loops: processed.loops, fillRule: 'evenodd' }],
      frame: { x: 0, y: 0, w: processed.width, h: processed.height },
      invert: false,
      source: 'raster',
    };
  }, [vectorMode, source, processed, crop, invert]);
}

export function useImageProcessing() {
  const source = useImageStore((s) => s.source);
  const params = useDesignStore((s) => s.design.processing);
  const vectorMode = useVectorMode();
  useEffect(() => {
    if (!source) return;
    const { setProcessed, setStatus } = useImageStore.getState();
    if (vectorMode) {
      setProcessed(null);
      setStatus('ready');
      return;
    }
    setStatus('processing');
    const t = setTimeout(() => {
      imageClient
        .run({ image: source.rgba, params })
        .then((r) => {
          if (useImageStore.getState().source !== source) return;
          setProcessed({ width: r.width, height: r.height, mask: r.mask, loops: r.loops, stats: r.stats });
        })
        .catch((e) => {
          if (!isSuperseded(e)) setStatus('error', e instanceof Error ? e.message : String(e));
        });
    }, 120);
    return () => clearTimeout(t);
  }, [source, params, vectorMode]);
}

export function useGeometryGeneration() {
  const silhouette = useSilhouetteData();
  const lamp = useDesignStore((s) => s.design.lamp);
  const light = useDesignStore((s) => s.design.light);
  const projection = useDesignStore((s) => s.design.projection);
  const print = useDesignStore((s) => s.design.print);
  const mounting = useDesignStore((s) => s.design.mounting);
  const decoration = useDesignStore((s) => s.design.decoration);
  const plate = usePlateArt(silhouette);
  const imageStatus = useImageStore((s) => s.status);
  const regenToken = useGeometryStore((s) => s.regenToken);

  useEffect(() => {
    if (imageStatus === 'processing' || imageStatus === 'loading' || plate.pending) return;
    const store = useGeometryStore.getState();
    store.setRunning();
    const t = setTimeout(() => {
      geometryClient
        .run({ silhouette, design: { lamp, light, projection, print, mounting, decoration }, options: { validate: true, fidelity: true, selfIntersection: true }, plateArt: plate.art }, [], (stage, fraction) =>
          useGeometryStore.getState().setProgress(stage, fraction),
        )
        .then((r) => useGeometryStore.getState().setResult(r))
        .catch((e) => {
          if (!isSuperseded(e)) useGeometryStore.getState().setError(e instanceof Error ? e.message : String(e));
        });
    }, 220);
    return () => clearTimeout(t);
  }, [silhouette, lamp, light, projection, print, mounting, decoration, plate.art, plate.pending, imageStatus, regenToken]);
}
