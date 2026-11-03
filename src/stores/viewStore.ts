import { create } from 'zustand';
import type { PanelId, PartId, Vec3 } from '@/types';

export type ViewMode = 'assembled' | 'exploded' | 'internal' | 'panels' | 'simulation';
export type MaterialPreset = 'matte-white' | 'matte-black' | 'wood' | 'silk-gold' | 'grey-resin';
export type LeftSection = 'image' | 'silhouette' | 'mounting' | 'lamp' | 'projection' | 'light';
export type RightTab = 'inspect' | 'print' | 'export';

export interface SimulationSettings {
  ledOn: boolean;
  /** Overrides the design flux in the simulator (lumens). */
  flux: number;
  /** Offset of the simulated LED from its designed position (tests misplacement). */
  lightOffset: Vec3;
  emitterSize: number;
  wallDistance: number;
  wallYaw: number;
  lampYaw: number;
  room: 'single' | 'room';
  wallColor: string;
  floorColor: string;
  ambient: number; // lux
  exposure: number;
  quality: 8 | 24 | 64;
  showRays: boolean;
  /** Keep wall distance / emitter in sync with the design target. */
  linked: boolean;
}

export const MATERIALS: Record<MaterialPreset, { label: string; color: string; roughness: number; metalness: number; transmission?: number }> = {
  'matte-white': { label: 'Matte white PLA', color: '#ecebe6', roughness: 0.72, metalness: 0 },
  'matte-black': { label: 'Matte black PLA', color: '#26272b', roughness: 0.65, metalness: 0 },
  wood: { label: 'Wood-fill PLA', color: '#a7784c', roughness: 0.82, metalness: 0 },
  'silk-gold': { label: 'Silk gold PLA', color: '#d7a64a', roughness: 0.32, metalness: 0.55 },
  'grey-resin': { label: 'Grey resin', color: '#8a8f99', roughness: 0.4, metalness: 0.05 },
};

interface ViewState {
  mode: ViewMode;
  visible: Record<PartId, boolean>;
  material: MaterialPreset;
  selectedPanel: PanelId;
  sim: SimulationSettings;
  resetToken: number;
  leftOpen: boolean;
  rightOpen: boolean;
  leftSection: LeftSection[];
  rightTab: RightTab;
  exportOpen: boolean;
  visited: Partial<Record<'configure' | 'preview' | 'export', boolean>>;
  setMode: (m: ViewMode) => void;
  toggleVisible: (p: PartId) => void;
  setMaterial: (m: MaterialPreset) => void;
  selectPanel: (p: PanelId) => void;
  setSim: (s: Partial<SimulationSettings>) => void;
  resetView: () => void;
  setLeftOpen: (v: boolean) => void;
  setRightOpen: (v: boolean) => void;
  setLeftSection: (s: LeftSection[]) => void;
  setRightTab: (t: RightTab) => void;
  setExportOpen: (v: boolean) => void;
  markVisited: (k: 'configure' | 'preview' | 'export') => void;
}

export const useViewStore = create<ViewState>((set) => ({
  mode: 'assembled',
  visible: { front: true, back: true, left: true, right: true, base: true, top: true, ledHolder: true },
  material: 'matte-white',
  selectedPanel: 'front',
  sim: {
    ledOn: true,
    flux: 120,
    lightOffset: [0, 0, 0],
    emitterSize: 2,
    wallDistance: 500,
    wallYaw: 0,
    lampYaw: 0,
    room: 'room',
    wallColor: '#e9e4da',
    floorColor: '#5a4a3c',
    ambient: 3,
    exposure: 1,
    quality: 24,
    showRays: false,
    linked: true,
  },
  resetToken: 0,
  leftOpen: true,
  rightOpen: true,
  leftSection: ['image', 'mounting'],
  rightTab: 'inspect',
  exportOpen: false,
  visited: {},
  setMode: (mode) =>
    set((s) => ({ mode, visited: mode === 'simulation' ? { ...s.visited, preview: true } : s.visited })),
  toggleVisible: (p) => set((s) => ({ visible: { ...s.visible, [p]: !s.visible[p] } })),
  setMaterial: (material) => set({ material }),
  selectPanel: (selectedPanel) => set({ selectedPanel }),
  setSim: (patch) => set((s) => ({ sim: { ...s.sim, ...patch } })),
  resetView: () => set((s) => ({ resetToken: s.resetToken + 1 })),
  setLeftOpen: (leftOpen) => set({ leftOpen }),
  setRightOpen: (rightOpen) => set({ rightOpen }),
  setLeftSection: (leftSection) => set({ leftSection }),
  setRightTab: (rightTab) => set({ rightTab }),
  setExportOpen: (exportOpen) => set((s) => ({ exportOpen, visited: exportOpen ? { ...s.visited, export: true } : s.visited })),
  markVisited: (k) => set((s) => ({ visited: { ...s.visited, [k]: true } })),
}));
