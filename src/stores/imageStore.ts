import { create } from 'zustand';
import type { Loop, ProcessingStats, SilhouetteData } from '@/types';

export interface SourceImage {
  name: string;
  kind: 'raster' | 'svg';
  /** Decoded pixels (SVGs are rasterised too, for previews and raster mode). */
  rgba: { data: Uint8ClampedArray; width: number; height: number };
  /** Object URL for display. */
  url: string;
  /** Vector extraction for SVG sources. */
  vector: SilhouetteData | null;
  vectorWarnings: string[];
  originalWidth: number;
  originalHeight: number;
}

export interface ProcessedSilhouette {
  width: number;
  height: number;
  mask: Uint8Array;
  loops: Loop[];
  stats: ProcessingStats;
}

interface ImageState {
  source: SourceImage | null;
  processed: ProcessedSilhouette | null;
  status: 'idle' | 'loading' | 'processing' | 'ready' | 'error';
  error: string | null;
  setSource: (s: SourceImage | null) => void;
  setProcessed: (p: ProcessedSilhouette | null) => void;
  setStatus: (status: ImageState['status'], error?: string | null) => void;
}

export const useImageStore = create<ImageState>((set, get) => ({
  source: null,
  processed: null,
  status: 'idle',
  error: null,
  setSource: (source) => {
    const prev = get().source;
    if (prev && prev.url !== source?.url) URL.revokeObjectURL(prev.url);
    set({ source, processed: null, status: source ? 'processing' : 'idle', error: null });
  },
  setProcessed: (processed) => set({ processed, status: processed ? 'ready' : 'idle' }),
  setStatus: (status, error = null) => set({ status, error }),
}));
