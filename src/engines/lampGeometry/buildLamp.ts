import type {
  DesignConfig,
  FigureAnalysis,
  Finding,
  LampGeometryResult,
  Mat4,
  MeshData,
  MountingConfig,
  PanelAnalysis,
  PanelDrawing,
  PanelId,
  PartGeometry,
  PartId,
  PlateDrawing,
  SilhouetteData,
  Vec3,
  WallPlacement,
} from '@/types';
import { PANEL_IDS } from '@/types';
import { DEFAULT_DECORATION, DEFAULT_MOUNTING } from '../defaults';
import { clamp, invertRigid, multiply, rotationX, translation } from '../math/vec';
import { mountingWallFrame, partNames } from '../projectionGeometry/mounting';
import { lampLayout, panelFrame, type PanelFrame, type WallFrame } from '../projectionGeometry/frames';
import { validateMesh } from '../meshValidation/validateMesh';
import { maskIoU, rasterizeRegion, rasterizeShadow, type Grid } from '../shadowProjection/cpuShadow';
import type { Manifold, ManifoldToplevel } from './manifoldRuntime';
import { Scope } from './manifoldRuntime';
import { buildPanel } from './panelBuilder';
import { buildUnitSilhouette } from './silhouetteRegion';
import { buildPlateDecoration } from './plateDecoration';
import { buildBase, buildFingerJoints, buildLedHolder, buildTop, HOLDER, holderRimRadius, holderRimY, minLightHeight } from './structure';
import { buildWallPanels } from './wallLampBuilder';

export type LampDesign = Pick<DesignConfig, 'lamp' | 'light' | 'projection' | 'print'> & { mounting?: MountingConfig; decoration?: DesignConfig['decoration'] };

export interface BuildOptions {
  validate?: boolean;
  selfIntersection?: boolean;
  fidelity?: boolean;
  /** Longest side of the fidelity raster grid. */
  fidelityResolution?: number;
  onProgress?: (stage: string, fraction: number) => void;
}

/** Table-lamp part names (wall lamps use `partNames('wall')`). */
export const PART_NAMES = partNames('table');

export function manifoldToMesh(m: Manifold): MeshData {
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const nv = mesh.vertProperties.length / np;
  const positions = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    positions[i * 3] = mesh.vertProperties[i * np];
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}

/** Light position constrained to where a holder can physically place it. */
export function resolveLight(design: LampDesign): { position: Vec3; findings: Finding[] } {
  const { lamp, light, print } = design;
  const findings: Finding[] = [];
  const wall = (design.mounting ?? DEFAULT_MOUNTING).type === 'wall';
  const { panelTop } = lampLayout(lamp);
  const lim = (half: number) =>
    half - lamp.wallThickness - print.clearance - HOLDER.lipWidth - (HOLDER.flangeRadius + print.clearance + HOLDER.socketWall) - 0.5;
  const limX = Math.max(0, lim(lamp.width / 2));
  const limZ = Math.max(0, lim(lamp.depth / 2));
  const yMin = minLightHeight(lamp, light);
  // a wall lamp's LED sits on a post that may reach past the side walls
  const yMax = wall ? HOLDER_MAX_REACH : panelTop - 3;
  const [x, y, z] = light.position;
  const p: Vec3 = [clamp(x, -limX, limX), clamp(y, yMin, Math.max(yMin, yMax)), clamp(z, -limZ, limZ)];
  if (Math.abs(p[0] - x) > 1e-6 || Math.abs(p[2] - z) > 1e-6)
    findings.push({ severity: 'warning', code: 'light-xz', message: 'LED moved inwards so its holder fits inside the base lip.' });
  if (Math.abs(p[1] - y) > 1e-6)
    findings.push({
      severity: 'warning',
      code: 'light-y',
      message: `LED height limited to ${yMin.toFixed(1)}–${yMax.toFixed(1)} mm by the holder and panel height.`,
    });
  return { position: p, findings };
}

function partPrintTransform(id: PartId, design: LampDesign, frames: Record<PanelId, PanelFrame>, light: Vec3): Mat4 {
  const { lamp } = design;
  if (id === 'base') return rotationX(Math.PI / 2);
  if (id === 'top') return multiply(translation([0, 0, lamp.height]), rotationX(-Math.PI / 2));
  if (id === 'ledHolder') {
    const { baseTop } = lampLayout(lamp);
    return multiply(translation([-light[0], light[2], -baseTop]), rotationX(Math.PI / 2));
  }
  const f = frames[id];
  const toLocal = invertRigid(f.matrix);
  const flat =
    design.print.orientation === 'outer-down'
      ? multiply(translation([-f.width / 2, f.height / 2, f.thickness]), rotationX(Math.PI))
      : translation([-f.width / 2, -f.height / 2, 0]);
  return multiply(flat, toLocal);
}

const HOLDER_MAX_REACH = 250;

const EXPLODE: Record<PartId, Vec3> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  base: [0, -1, 0],
  top: [0, 1, 0],
  ledHolder: [0, 0.35, 0],
};

export async function buildLamp(
  wasm: ManifoldToplevel,
  silhouette: SilhouetteData | null,
  design: LampDesign,
  options: BuildOptions = {},
  /** Wall lamps: artwork for the wall plate decoration (resolved by the caller). */
  plateArt: SilhouetteData | null = null,
): Promise<LampGeometryResult> {
  const progress = options.onProgress ?? (() => {});
  const timings: Record<string, number> = {};
  const tick = (label: string, t0: number) => (timings[label] = Math.round(performance.now() - t0));
  const scope = new Scope();
  const findings: Finding[] = [];
  const mounting = design.mounting ?? DEFAULT_MOUNTING;
  const isWall = mounting.type === 'wall';
  const names = partNames(mounting.type);
  try {
    const resolved = resolveLight(design);
    findings.push(...resolved.findings);
    const light = resolved.position;
    const effDesign: LampDesign = { ...design, light: { ...design.light, position: light } };

    let t0 = performance.now();
    progress('Preparing silhouette', 0.02);
    const unit = silhouette
      ? buildUnitSilhouette(wasm, silhouette, design.projection.rotation, design.projection.mirror, scope)
      : null;
    if (silhouette && !unit) findings.push({ severity: 'error', code: 'empty-silhouette', message: 'The silhouette is empty.' });
    tick('silhouette', t0);

    const frames = Object.fromEntries(PANEL_IDS.map((id) => [id, panelFrame(id, design.lamp)])) as Record<PanelId, PanelFrame>;
    const solids = new Map<PartId, Manifold>();
    const panels = {} as Record<PanelId, PanelAnalysis>;
    const drawings = {} as Record<PanelId, PanelDrawing>;
    const walls = {} as Record<PanelId, WallFrame>;
    const holder = { rimY: holderRimY(effDesign.light), rimRadius: holderRimRadius(effDesign.light) };

    let figure: FigureAnalysis | null = null;
    if (isWall) {
      t0 = performance.now();
      progress('Projecting the figure onto the wall', 0.1);
      const out = buildWallPanels(
        { wasm, lamp: design.lamp, light, emitterSize: design.light.emitterSize, projection: design.projection, print: design.print, mounting, unit, holder },
        scope,
      );
      for (const id of PANEL_IDS) {
        solids.set(id, out.panels[id].solid);
        panels[id] = out.panels[id].analysis;
        drawings[id] = out.panels[id].drawing;
        walls[id] = out.panels[id].wall;
      }
      figure = out.figure;
      findings.push(...out.findings);
      tick('wall-figure', t0);
    }
    let i = 0;
    for (const id of isWall ? [] : PANEL_IDS) {
      t0 = performance.now();
      progress(`Projecting ${id} panel`, 0.05 + 0.55 * (i++ / PANEL_IDS.length));
      const out = buildPanel(
        {
          wasm,
          frame: frames[id],
          lamp: design.lamp,
          light,
          emitterSize: design.light.emitterSize,
          projection: design.projection,
          print: design.print,
          unit,
          active: design.projection.activePanels[id],
          holder,
        },
        scope,
      );
      solids.set(id, out.solid);
      panels[id] = out.analysis;
      drawings[id] = out.drawing;
      walls[id] = out.wall;
      tick(id, t0);
    }

    t0 = performance.now();
    progress('Building base, cover and LED holder', 0.62);
    let base = buildBase(wasm, design.lamp, effDesign.light, design.print, scope, mounting);
    if (design.lamp.fingerJoints) {
      const joints = buildFingerJoints(wasm, frames, design.lamp, design.print, light, mounting.type, scope);
      for (const id of PANEL_IDS) {
        const tab = joints.tabs[id];
        if (tab) solids.set(id, scope.keep(solids.get(id)!.add(tab)));
        drawings[id].tabs = joints.drawings[id];
      }
      if (joints.notches) base = scope.keep(base.subtract(joints.notches));
    }
    let plate: PlateDrawing | null = null;
    if (isWall) {
      const deco = buildPlateDecoration(wasm, base, design.lamp, light, design.print, mounting, design.decoration ?? DEFAULT_DECORATION, plateArt, scope);
      if (deco.relief) base = scope.keep(base.add(deco.relief));
      plate = deco.drawing;
      findings.push(...deco.findings);
    }
    solids.set('base', base);
    if (design.lamp.topCover && !isWall) solids.set('top', buildTop(wasm, design.lamp, effDesign.light, design.print, scope));
    solids.set('ledHolder', buildLedHolder(wasm, design.lamp, effDesign.light, design.print, scope));
    tick('structure', t0);

    const parts: PartGeometry[] = [];
    for (const [id, solid] of solids) {
      const status = solid.status();
      if (status !== 'NoError') findings.push({ severity: 'error', code: 'manifold', message: `${names[id].name}: kernel status ${status}` });
      parts.push({
        id,
        name: names[id].name,
        fileName: names[id].file,
        mesh: manifoldToMesh(solid),
        explodeDir: EXPLODE[id],
        printTransform: partPrintTransform(id, effDesign, frames, light),
      });
    }

    if (!design.lamp.topCover && !isWall)
      findings.push({
        severity: 'warning',
        code: 'open-top',
        message: 'Open top: light escapes upwards and lights the walls above the projection. Enable the top cover for a clean image.',
      });
    if (!PANEL_IDS.some((id) => design.projection.activePanels[id]))
      findings.push({ severity: 'warning', code: 'no-active', message: 'No projection panels are active.' });
    if (isWall && design.light.pattern === 'lambertian-up')
      findings.push({
        severity: 'warning',
        code: 'led-direction',
        message: 'A forward-facing (Lambertian) LED sends almost no light back towards the wall. Wall shadow lamps need an omnidirectional or side-emitting source such as a filament or tube LED.',
      });

    // ---- reference shadow raster: projection fidelity -------------------------------
    if (options.fidelity !== false) {
      t0 = performance.now();
      progress('Verifying projection by shadow ray-casting', 0.72);
      const meshes = parts.map((p) => p.mesh);
      for (const id of PANEL_IDS) {
        const pa = panels[id];
        if (!pa.active || !pa.placement) continue;
        pa.fidelity = projectionFidelity(meshes, light, walls[id], pa.placement, isWall ? 'shadow' : design.projection.style, options.fidelityResolution ?? 200);
        if (pa.fidelity < 0.85)
          pa.findings.push({
            severity: 'warning',
            code: 'fidelity',
            message: `Simulated shadow matches the target silhouette at ${(pa.fidelity * 100).toFixed(1)}% (IoU).`,
          });
      }
      if (figure && figure.target.length) {
        const all = figure.target.flat();
        const placement: WallPlacement = {
          minU: Math.min(...all.map((p) => p[0])),
          maxU: Math.max(...all.map((p) => p[0])),
          minV: Math.min(...all.map((p) => p[1])),
          maxV: Math.max(...all.map((p) => p[1])),
          feasible: figure.reach,
          target: figure.target,
        };
        figure.fidelity = projectionFidelity(meshes, light, mountingWallFrame(), placement, 'shadow', options.fidelityResolution ?? 240);
      }
      tick('fidelity', t0);
    }

    // ---- mesh validation ----------------------------------------------------------------
    const validation = [];
    if (options.validate !== false) {
      t0 = performance.now();
      let k = 0;
      for (const part of parts) {
        progress(`Validating ${part.name}`, 0.8 + 0.18 * (k++ / parts.length));
        const report = validateMesh(part.id, part.mesh, { selfIntersection: options.selfIntersection !== false });
        if (PANEL_IDS.includes(part.id as PanelId)) report.minThickness = design.lamp.wallThickness;
        else if (part.id === 'base') report.minThickness = Math.max(0.5, design.lamp.baseThickness - Math.min(2, design.lamp.baseThickness - 1));
        validation.push(report);
      }
      tick('validation', t0);
    }
    progress('Done', 1);
    return { mounting: mounting.type, figure, parts, panels, drawings, validation, findings, light, plate, offset: [design.projection.offsetU, design.projection.offsetV], timings };
  } finally {
    scope.dispose();
  }
}

/** IoU between the simulated figure and the target on the wall, over the reachable area. */
export function projectionFidelity(
  meshes: MeshData[],
  light: Vec3,
  wall: WallFrame,
  pl: WallPlacement,
  style: 'shadow' | 'light',
  resolution: number,
): number {
  const padU = (pl.maxU - pl.minU) * 0.03;
  const padV = (pl.maxV - pl.minV) * 0.03;
  const spanU = pl.maxU - pl.minU + 2 * padU;
  const spanV = pl.maxV - pl.minV + 2 * padV;
  const k = resolution / Math.max(spanU, spanV);
  const g: Grid = {
    minU: pl.minU - padU,
    maxU: pl.maxU + padU,
    minV: pl.minV - padV,
    maxV: pl.maxV + padV,
    nu: Math.max(8, Math.round(spanU * k)),
    nv: Math.max(8, Math.round(spanV * k)),
  };
  const occ = rasterizeShadow(meshes, light, wall, g);
  const target = rasterizeRegion(pl.target, g);
  const domain = rasterizeRegion([pl.feasible], g);
  const figure = new Uint8Array(occ.length);
  for (let i = 0; i < occ.length; i++) figure[i] = style === 'shadow' ? occ[i] : occ[i] ? 0 : 1;
  return maskIoU(figure, target, domain);
}
