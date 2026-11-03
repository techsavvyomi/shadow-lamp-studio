/**
 * Shared domain types for Giftieverse Shadow Lamp Studio.
 *
 * Units: all lengths are millimetres. World frame: origin at the centre of the
 * lamp footprint on the table surface, +Y up, +X to the right when looking at
 * the front panel, +Z out of the front panel (towards the front wall).
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
/** Column-major 4×4 matrix (WebGL / three.js / manifold convention). */
export type Mat4 = number[];

/** A closed polygon ring. The closing edge (last → first) is implicit. */
export type Loop = Vec2[];
export type FillRule = 'evenodd' | 'nonzero';

export interface Shape {
  loops: Loop[];
  fillRule: FillRule;
  /** Painter's order: a light-coloured vector shape drawn over dark ones cuts a hole. */
  subtract?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Resolution-independent silhouette. Coordinates are in source units (pixels
 * for raster sources, SVG user units for vector sources), y pointing down.
 * The filled region is: shapes composited in order (add, or subtract when
 * `subtract`), ∩ frame, complemented within frame if `invert`.
 */
export interface SilhouetteData {
  shapes: Shape[];
  frame: Rect;
  invert: boolean;
  source: 'raster' | 'vector';
}

// ---------------------------------------------------------------------------
// Image processing
// ---------------------------------------------------------------------------

export type ProcessingMode = 'auto' | 'manual';
export type SegmentationMethod = 'luminance' | 'alpha' | 'background';

export interface ProcessingParams {
  mode: ProcessingMode;
  method: SegmentationMethod;
  /** 0..255 threshold for the selected method (manual mode). */
  threshold: number;
  /** -1..1 contrast adjustment applied before luminance thresholding. */
  contrast: number;
  invert: boolean;
  /** Remove background connected to the image border (manual mode). */
  removeBackground: boolean;
  /** 0..255 colour distance tolerance for border-connected background removal. */
  bgTolerance: number;
  /** Remove foreground islands smaller than this % of the image area. */
  noiseArea: number;
  /** Fill holes smaller than this % of the image area. */
  holeArea: number;
  /** Contour smoothing (Gaussian sigma, px at processing resolution). */
  smoothing: number;
  /** Normalised crop rectangle (0..1). */
  crop: Rect;
  /** Longest side of the processing raster (px). */
  resolution: number;
  /** For SVG sources: use exact vector paths instead of rasterising. */
  svgVector: boolean;
}

export interface ProcessingStats {
  method: SegmentationMethod;
  threshold: number;
  foregroundPct: number;
  components: number;
  holes: number;
  vertices: number;
  width: number;
  height: number;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Design configuration
// ---------------------------------------------------------------------------

export type PanelId = 'front' | 'back' | 'left' | 'right';
export type PartId = PanelId | 'base' | 'top' | 'ledHolder';
export const PANEL_IDS: PanelId[] = ['front', 'right', 'back', 'left'];
export const PART_IDS: PartId[] = ['front', 'right', 'back', 'left', 'base', 'top', 'ledHolder'];

export interface LampDimensions {
  width: number; // X extent (front/back panels), mm
  depth: number; // Z extent (left/right panels), mm
  height: number; // total height incl. base and top, mm
  wallThickness: number; // side panel thickness
  baseThickness: number;
  topCover: boolean;
  topThickness: number;
  topVents: boolean;
  /** Opaque border kept around the projection window of every panel. */
  frameMargin: number;
  /** Height of the locating lip on base/top that keeps panels aligned. */
  lipHeight: number;
  /** Tabs on each panel's bottom edge that lock into notches in the base / wall plate. */
  fingerJoints: boolean;
}

export type EmissionPattern = 'isotropic' | 'lambertian-up';

export interface LightConfig {
  /** LED emitter centre: x, z relative to lamp centre, y above the table. */
  position: Vec3;
  /** Physical emitter diameter (controls penumbra / shadow sharpness). */
  emitterSize: number;
  /** Luminous flux in lumens (used by the simulator). */
  flux: number;
  pattern: EmissionPattern;
  /** LED package diameter that the holder seat must accept. */
  ledDiameter: number;
  /** Height of the emitter above the holder rim. */
  emitterAboveRim: number;
}

export type ProjectionStyle = 'shadow' | 'light';
export type ThinFeaturePolicy = 'thicken' | 'remove';

export interface ProjectionConfig {
  /** shadow: dark silhouette in a lit field. light: lit silhouette on a dark wall. */
  style: ProjectionStyle;
  activePanels: Record<PanelId, boolean>;
  /** Design target: distance from each panel's outer face to its wall. */
  wallDistance: number;
  /** Design target wall rotation about the vertical axis, degrees. */
  wallYaw: number;
  /** Design target wall tilt, degrees (positive tilts the top towards the lamp). */
  wallPitch: number;
  /** Fraction (0.1..1) of the largest feasible silhouette size. */
  fill: number;
  /** Silhouette offset on the wall (mm, wall right / up). */
  offsetU: number;
  offsetV: number;
  rotation: number; // degrees, counter-clockwise as seen on the wall
  mirror: boolean;
  /** Keep the projection above the table surface (rays below hit the table). */
  respectFloor: boolean;
  bridgeWidth: number;
  thinFeatures: ThinFeaturePolicy;
}

export type PrinterType = 'FDM' | 'SLA';
export type PrintMaterial = 'PLA' | 'PETG' | 'ABS' | 'Resin';
export type PrintOrientation = 'outer-down' | 'inner-down';
export type SupportPreference = 'none' | 'auto' | 'everywhere';

export interface PrintConfig {
  printer: PrinterType;
  material: PrintMaterial;
  nozzle: number;
  layerHeight: number;
  infill: number;
  orientation: PrintOrientation;
  supports: SupportPreference;
  /** Minimum printable feature (wall/bridge/gap) width, mm. */
  minFeature: number;
  /** Assembly clearance for mating parts, mm. */
  clearance: number;
}

/**
 * table: closed box on a table/shelf; each panel's cut-outs project onto the wall
 *        that panel faces.
 * wall:  open-front box hung on a wall with the LED on a post; the profiled side
 *        walls cast ONE large silhouette onto the same wall, around the lamp.
 */
export type MountingType = 'table' | 'wall';

export interface MountingConfig {
  type: MountingType;
  /** Wall: height of the lamp centre above the floor (mm). */
  height: number;
  /** Wall: ceiling height of the room (mm). */
  ceilingHeight: number;
  /** Wall: keyhole slots in the wall plate for two screws. */
  keyholes: boolean;
  screwHead: number;
  screwShank: number;
}

export type DecorationKind = 'none' | 'silhouette' | 'text';
/** `figure` reuses the lamp's own silhouette; the rest are built-in shapes. */
export type DecorationIcon = 'figure' | 'moon' | 'star' | 'heart' | 'bat' | 'pumpkin' | 'ghost';
export type DecorationFont = 'bold' | 'spooky' | 'script';
export type DecorationPosition = 'below' | 'above' | 'behind';

/**
 * Wall lamp: raised relief on the front face of the wall plate — the face the LED
 * lights up and the viewer sees inside the open lamp.
 */
export interface PlateDecoration {
  kind: DecorationKind;
  icon: DecorationIcon;
  /** Up to three lines, separated by newlines. */
  text: string;
  font: DecorationFont;
  /** Where on the plate, relative to the LED post (as seen on the wall). */
  position: DecorationPosition;
  /** Fraction (0.2..1) of the largest size that fits the chosen area. */
  size: number;
  /** How far the relief stands off the plate, mm. */
  height: number;
}

export interface DesignConfig {
  processing: ProcessingParams;
  lamp: LampDimensions;
  light: LightConfig;
  projection: ProjectionConfig;
  print: PrintConfig;
  mounting: MountingConfig;
  decoration: PlateDecoration;
}

// ---------------------------------------------------------------------------
// Geometry outputs
// ---------------------------------------------------------------------------

export interface MeshData {
  positions: Float32Array; // xyz triplets
  indices: Uint32Array; // CCW triangles (outward normals)
}

export interface PartGeometry {
  id: PartId;
  name: string;
  fileName: string;
  mesh: MeshData;
  /** Unit vector used to offset the part in the exploded view. */
  explodeDir: Vec3;
  /** Maps assembly coordinates to print-bed coordinates (Z up, resting on z=0). */
  printTransform: Mat4;
}

export type Severity = 'info' | 'warning' | 'error';

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
}

export interface PanelDrawing {
  width: number;
  height: number;
  /** Cut-out boundaries on the inner (light-facing) face, panel-local mm. */
  holesInner: Loop[];
  /** Cut-out boundaries on the outer face. */
  holesOuter: Loop[];
  /** Bridges added to support floating islands (inner face). */
  bridges: Loop[];
  /** Effective projection window (inner face). */
  window: Loop[];
  /** Foot of the perpendicular from the light onto the panel plane. */
  lightFoot: Vec2;
  /** Finger-joint tabs below the bottom edge (panel-local, y < 0). */
  tabs: Loop[];
}

/**
 * Wall plate as seen from the room: x to the right, y up, LED post at `led`.
 * All loops are even-odd.
 */
export interface PlateDrawing {
  width: number;
  height: number;
  /** Plate cross-section: outline with finger-joint notches, keyholes and wire hole. */
  plate: Loop[];
  /** Where a decoration may go (inside the side walls, clear of the post and screws). */
  area: Loop[];
  /** Raised decoration as generated. */
  decoration: Loop[];
  led: Vec2;
  /** Radius kept clear around the LED post. */
  postRadius: number;
}

export interface WallPlacement {
  /** Wall-space bounding box of the placed silhouette (mm). */
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  /** Feasible region (projected window ∩ above-table), wall coordinates. */
  feasible: Loop;
  /** The silhouette as placed on the wall (wall coordinates, even-odd). */
  target: Loop[];
}

export interface PanelAnalysis {
  id: PanelId;
  active: boolean;
  width: number;
  height: number;
  thickness: number;
  /** Perpendicular distance from the emitter to the panel's inner face. */
  lightDistance: number;
  /** Wall distance / panel distance along the central ray. */
  magnification: number;
  imageWidth: number;
  imageHeight: number;
  /** Penumbra (blur) width on the wall at the image centre, mm. */
  penumbra: number;
  /** Smallest wall-space feature the lamp can reproduce, mm. */
  resolution: number;
  openAreaPct: number;
  bridges: number;
  islands: number;
  clippedPct: number;
  thinAdjustedPct: number;
  /** Projection fidelity vs. the target silhouette (IoU, 0..1), from the reference shadow raster. */
  fidelity: number | null;
  placement: WallPlacement | null;
  findings: Finding[];
}

export interface MeshValidationReport {
  partId: PartId;
  vertices: number;
  triangles: number;
  watertight: boolean;
  boundaryEdges: number;
  nonManifoldEdges: number;
  orientationConsistent: boolean;
  degenerateTriangles: number;
  invalidVertices: number;
  shells: number;
  selfIntersections: number;
  /** Signed volume, mm³. Positive ⇔ outward-facing normals. */
  volume: number;
  surfaceArea: number;
  size: Vec3;
  /** Smallest wall thickness found by sampling (mm), null if not measured. */
  minThickness: number | null;
  status: 'pass' | 'warn' | 'fail';
  issues: string[];
}

/** Wall lamp: the single silhouette cast onto the mounting wall around the lamp. */
export interface FigureAnalysis {
  width: number;
  height: number;
  /** Region of the wall the side walls can shade (wall coordinates, mm). */
  reach: Loop;
  /** The silhouette as placed (wall coordinates, even-odd). */
  target: Loop[];
  /** Share of the lamp body's footprint that lies inside the figure (%). */
  lampCoveredPct: number;
  /** Radius of the dark disc the LED post casts around the lamp centre. */
  postShadowRadius: number;
  nearBlur: number;
  farBlur: number;
  /** Tallest side-wall profile above the wall plate. */
  maxProfileHeight: number;
  clippedPct: number;
  fidelity: number | null;
}

export interface LampGeometryResult {
  mounting: MountingType;
  figure: FigureAnalysis | null;
  parts: PartGeometry[];
  panels: Record<PanelId, PanelAnalysis>;
  drawings: Record<PanelId, PanelDrawing>;
  validation: MeshValidationReport[];
  findings: Finding[];
  /** Resolved light position used for generation (world). */
  light: Vec3;
  /** Wall lamps: the wall plate and its decoration, for 2D previews. */
  plate: PlateDrawing | null;
  timings: Record<string, number>;
}
