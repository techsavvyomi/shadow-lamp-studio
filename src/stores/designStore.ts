import { create } from 'zustand';
import { DEFAULT_DESIGN } from '@/engines/defaults';
import type { DesignConfig } from '@/types';

type Section = keyof DesignConfig;

interface DesignState {
  design: DesignConfig;
  past: DesignConfig[];
  future: DesignConfig[];
  /** Coalesces rapid edits of the same control (slider drags) into one undo step. */
  lastKey: string | null;
  lastTime: number;
  update: <S extends Section>(section: S, patch: Partial<DesignConfig[S]>, key?: string) => void;
  replace: (design: DesignConfig) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

const HISTORY_LIMIT = 100;
const COALESCE_MS = 900;

export const useDesignStore = create<DesignState>((set, get) => ({
  design: DEFAULT_DESIGN,
  past: [],
  future: [],
  lastKey: null,
  lastTime: 0,

  update: (section, patch, key) => {
    const { design, past, lastKey, lastTime } = get();
    const next: DesignConfig = { ...design, [section]: { ...design[section], ...patch } };
    const k = key ?? `${section}:${Object.keys(patch).join(',')}`;
    const now = performance.now();
    const coalesce = k === lastKey && now - lastTime < COALESCE_MS;
    set({
      design: next,
      past: coalesce ? past : [...past, design].slice(-HISTORY_LIMIT),
      future: [],
      lastKey: k,
      lastTime: now,
    });
  },

  replace: (design) => set((s) => ({ design, past: [...s.past, s.design].slice(-HISTORY_LIMIT), future: [], lastKey: null })),

  undo: () => {
    const { past, design, future } = get();
    if (!past.length) return;
    set({ design: past[past.length - 1], past: past.slice(0, -1), future: [design, ...future], lastKey: null });
  },

  redo: () => {
    const { past, design, future } = get();
    if (!future.length) return;
    set({ design: future[0], past: [...past, design], future: future.slice(1), lastKey: null });
  },

  reset: () => set((s) => ({ design: DEFAULT_DESIGN, past: [...s.past, s.design], future: [], lastKey: null })),
}));
