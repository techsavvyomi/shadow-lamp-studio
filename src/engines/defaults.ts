import type { DesignConfig, LampDimensions, LightConfig, MountingConfig, PlateDecoration, PrintConfig, ProcessingParams, ProjectionConfig } from '@/types';

export const DEFAULT_PROCESSING: ProcessingParams = {
  mode: 'auto',
  method: 'luminance',
  threshold: 128,
  contrast: 0,
  invert: false,
  removeBackground: true,
  bgTolerance: 48,
  noiseArea: 0.05,
  holeArea: 0.01,
  smoothing: 1.2,
  crop: { x: 0, y: 0, w: 1, h: 1 },
  resolution: 768,
  svgVector: true,
};

export const DEFAULT_LAMP: LampDimensions = {
  width: 100,
  depth: 100,
  height: 100,
  wallThickness: 1.5,
  baseThickness: 3,
  topCover: true,
  topThickness: 2,
  topVents: true,
  frameMargin: 6,
  lipHeight: 3,
  fingerJoints: true,
};

export const DEFAULT_LIGHT: LightConfig = {
  position: [0, 24, 0],
  emitterSize: 2,
  flux: 120,
  pattern: 'isotropic',
  ledDiameter: 5,
  emitterAboveRim: 4,
};

export const DEFAULT_PROJECTION: ProjectionConfig = {
  style: 'shadow',
  activePanels: { front: true, back: true, left: true, right: true },
  wallDistance: 500,
  wallYaw: 0,
  wallPitch: 0,
  fill: 0.9,
  offsetU: 0,
  offsetV: 0,
  rotation: 0,
  mirror: false,
  respectFloor: true,
  bridgeWidth: 1.2,
  thinFeatures: 'thicken',
};

export const DEFAULT_PRINT: PrintConfig = {
  printer: 'FDM',
  material: 'PLA',
  nozzle: 0.4,
  layerHeight: 0.2,
  infill: 100,
  orientation: 'outer-down',
  supports: 'none',
  minFeature: 1.2, // three lines of a 0.4 mm nozzle
  clearance: 0.2,
};

export const DEFAULT_MOUNTING: MountingConfig = {
  type: 'table',
  height: 1500,
  ceilingHeight: 2500,
  keyholes: true,
  screwHead: 7.5,
  screwShank: 3.5,
};

export const DEFAULT_DECORATION: PlateDecoration = {
  kind: 'none',
  icon: 'figure',
  text: 'Boo!',
  font: 'bold',
  position: 'below',
  size: 0.9,
  height: 1.5,
};

export const DEFAULT_DESIGN: DesignConfig = {
  processing: DEFAULT_PROCESSING,
  lamp: DEFAULT_LAMP,
  light: DEFAULT_LIGHT,
  projection: DEFAULT_PROJECTION,
  print: DEFAULT_PRINT,
  mounting: DEFAULT_MOUNTING,
  decoration: DEFAULT_DECORATION,
};

/**
 * Starting point for a wall lamp (open front, LED on a post), modelled on the
 * common 11 × 15.5 cm wall shadow lamps. `height` is how far the side walls stand
 * off the wall; `frameMargin` is the solid base strip of each side wall.
 */
export const WALL_PRESET: Pick<DesignConfig, 'lamp' | 'light'> & { projection: Partial<ProjectionConfig> } = {
  lamp: { ...DEFAULT_LAMP, width: 110, depth: 155, height: 70, wallThickness: 1.6, topCover: false, frameMargin: 8 },
  light: { ...DEFAULT_LIGHT, position: [0, 82, 0], emitterAboveRim: 8 },
  projection: { style: 'shadow', fill: 0.95, offsetU: 0, offsetV: 0 },
};

/** Valid ranges used by the UI and by input sanitisation. */
export const LIMITS = {
  width: [50, 300],
  depth: [50, 300],
  height: [50, 300],
  wallThickness: [1, 5],
  baseThickness: [2, 10],
  topThickness: [1.2, 6],
  frameMargin: [2, 30],
  lipHeight: [1.5, 8],
  wallDistance: [100, 5000],
  wallYaw: [-60, 60],
  wallPitch: [-45, 45],
  fill: [0.1, 1],
  bridgeWidth: [0.6, 5],
  emitterSize: [0, 20],
  flux: [5, 1000],
  ledDiameter: [2, 12],
  emitterAboveRim: [0.5, 15],
  minFeature: [0.2, 3],
  mountHeight: [300, 3000],
  ceilingHeight: [1800, 5000],
  lightDistance: [20, 250],
  clearance: [0, 1],
  nozzle: [0.1, 1.2],
  layerHeight: [0.02, 0.6],
  infill: [10, 100],
  decorationSize: [0.2, 1],
  reliefHeight: [0.6, 4],
} as const satisfies Record<string, readonly [number, number]>;
