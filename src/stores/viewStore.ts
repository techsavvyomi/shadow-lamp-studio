import { create } from 'zustand';
import type { PanelId, PartId, Vec3 } from '@/types';

export type ViewMode = 'assembled' | 'exploded' | 'internal' | 'panels' | 'simulation';
export type MaterialPreset = 'matte-white' | 'matte-black' | 'wood' | 'silk-gold' | 'grey-resin';
export type LeftSection = 'image' | 'silhouette' | 'mounting' | 'plate' | 'lamp' | 'projection' | 'light';
export type RightTab = 'inspect' | 'print' | 'export';
/** guide: one step at a time with the essential controls; advanced: every setting. */
export type UiMode = 'guide' | 'advanced';
export type GuideStepId = 'type' | 'picture' | 'silhouette' | 'customise' | 'preview' | 'export';
export const GUIDE_STEP_IDS: GuideStepId[] = ['type', 'picture', 'silhouette', 'customise', 'preview', 'export'];

const TOUR_KEY = 'giftieverse.studio.tour.v1';
/** True once the first-visit walkthrough was finished or skipped on this browser. */
export const tourSeen = () => {
  try {
    return localStorage.getItem(TOUR_KEY) === 'done';
  } catch {
    return true;
  }
};
const rememberTour = () => {
  try {
    localStorage.setItem(TOUR_KEY, 'done');
  } catch {
    /* private mode: the tour simply shows again next time */
  }
};

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
  visited: Partial<Record<GuideStepId, boolean>>;
  uiMode: UiMode;
  /** All settings: also show fine-tuning options (off = everyday settings only). */
  expert: boolean;
  guideStep: GuideStepId;
  /** Index into the walkthrough, or null when it is not showing. */
  tourStep: number | null;
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
  markVisited: (k: GuideStepId) => void;
  setUiMode: (m: UiMode) => void;
  setExpert: (v: boolean) => void;
  setGuideStep: (s: GuideStepId) => void;
  startTour: () => void;
  setTourStep: (i: number) => void;
  endTour: () => void;
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
  rightOpen: false,
  leftSection: ['image', 'mounting'],
  rightTab: 'inspect',
  exportOpen: false,
  visited: {},
  uiMode: 'guide',
  expert: false,
  guideStep: 'type',
  tourStep: null,
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
  setUiMode: (uiMode) => set({ uiMode, rightOpen: uiMode === 'advanced' && typeof window !== 'undefined' && window.innerWidth >= 1024 }),
  setExpert: (expert) => set({ expert }),
  setGuideStep: (guideStep) =>
    set((s) => {
      // leaving a step counts as having seen it; arriving at preview lights the lamp
      const visited = { ...s.visited, [s.guideStep]: true, ...(guideStep === 'customise' ? { customise: true } : {}) };
      return guideStep === 'preview' ? { guideStep, visited: { ...visited, preview: true }, mode: 'simulation' as ViewMode, sim: { ...s.sim, ledOn: true } } : { guideStep, visited };
    }),
  startTour: () => set({ tourStep: 0 }),
  setTourStep: (tourStep) => set({ tourStep }),
  endTour: () => {
    rememberTour();
    set({ tourStep: null });
  },
}));
