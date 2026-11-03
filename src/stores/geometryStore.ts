import { create } from 'zustand';
import type { BufferGeometry } from 'three';
import { meshDataToGeometry } from '@/engines/stlExporter/exportStl';
import type { LampGeometryResult, PartId } from '@/types';

interface GeometryState {
  result: LampGeometryResult | null;
  /**
   * GPU geometries built once per result. The 3D preview, the shadow simulator and
   * the STL exporter all use these exact instances.
   */
  geometries: Partial<Record<PartId, BufferGeometry>>;
  status: 'idle' | 'running' | 'ready' | 'error';
  progress: { stage: string; fraction: number };
  error: string | null;
  /** Monotonic counter so views can react to new geometry. */
  version: number;
  /** Bumped to force a regeneration with unchanged inputs. */
  regenToken: number;
  regenerate: () => void;
  setRunning: () => void;
  setProgress: (stage: string, fraction: number) => void;
  setResult: (r: LampGeometryResult) => void;
  setError: (e: string) => void;
}

export const useGeometryStore = create<GeometryState>((set, get) => ({
  result: null,
  geometries: {},
  status: 'idle',
  progress: { stage: '', fraction: 0 },
  error: null,
  version: 0,
  regenToken: 0,
  regenerate: () => set((s) => ({ regenToken: s.regenToken + 1 })),
  setRunning: () => set({ status: 'running', error: null }),
  setProgress: (stage, fraction) => set({ progress: { stage, fraction } }),
  setResult: (result) => {
    const old = get().geometries;
    const geometries: Partial<Record<PartId, BufferGeometry>> = {};
    for (const p of result.parts) geometries[p.id] = meshDataToGeometry(p.mesh);
    set({ result, geometries, status: 'ready', error: null, version: get().version + 1, progress: { stage: 'Done', fraction: 1 } });
    // Dispose GPU buffers of the previous generation after React has swapped them out.
    setTimeout(() => Object.values(old).forEach((g) => g?.dispose()), 0);
  },
  setError: (error) => set({ status: 'error', error }),
}));
