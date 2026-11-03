/**
 * Panel operations shared by the table-lamp builder (closed box, windows with
 * cut-outs) and the wall-lamp builder (open front, profiled side walls).
 */
import type { Loop, PanelAnalysis, ThinFeaturePolicy, Vec2, Vec3 } from '@/types';
import { dot, length, normalize, sub } from '../math/vec';
import { panelToWorld, type PanelFrame, type WallFrame, wallToWorld, worldToPanel } from '../projectionGeometry/frames';
import { wallToPanel } from '../projectionGeometry/projection';
import type { CrossSection, Manifold, ManifoldToplevel } from './manifoldRuntime';
import { Scope } from './manifoldRuntime';
import { polygonsToLoops } from './silhouetteRegion';

export const rectLoop = (x0: number, y0: number, x1: number, y1: number): Loop => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

export function emptyAnalysis(frame: PanelFrame, active: boolean, lightDistance: number, height = frame.height): PanelAnalysis {
  return {
    id: frame.id,
    active,
    width: frame.width,
    height,
    thickness: frame.thickness,
    lightDistance,
    magnification: 0,
    imageWidth: 0,
    imageHeight: 0,
    penumbra: 0,
    resolution: 0,
    openAreaPct: 0,
    bridges: 0,
    islands: 0,
    clippedPct: 0,
    thinAdjustedPct: 0,
    fidelity: null,
    placement: null,
    findings: [],
  };
}

export interface CutResult {
  /** Panel solid in lamp coordinates (owned by the caller's scope). */
  solid: Manifold;
  holesInner: Loop[];
  holesOuter: Loop[];
  openArea: number;
}

/**
 * Slab (w × h × t, panel-local) minus openings extruded along the light rays:
 * between the parallel inner and outer faces the central projection is a homothety
 * about the light's foot point, which manifold's `extrude(…, scaleTop)` reproduces
 * exactly. With `clipToSlab`, drawing loops are clipped to the slab (openings that
 * extend past the panel edge, as in profiled panels).
 */
export function perspectiveCut(
  wasm: ManifoldToplevel,
  frame: PanelFrame,
  light: Vec3,
  holes: CrossSection | null,
  slabHeight: number,
  out: Scope,
  clipToSlab = false,
): CutResult {
  const { Manifold, CrossSection } = wasm;
  const local = new Scope();
  try {
    const w = frame.width;
    const t = frame.thickness;
    const l = worldToPanel(frame, light);
    const a = -l[2];
    const foot: Vec2 = [l[0], l[1]];
    const slab = local.keep(Manifold.cube([w, slabHeight, t]));
    let solid: Manifold = slab;
    let holesInner: Loop[] = [];
    let holesOuter: Loop[] = [];
    let openArea = 0;
    if (holes && !holes.isEmpty()) {
      const eps = Math.min(0.05, a / 4);
      const s0 = a - eps; // distance from the emitter plane to z = −eps
      const s1 = a + t + eps;
      const k0 = s0 / a;
      const atZ0 = local.keep(local.keep(holes.translate([-foot[0], -foot[1]])).scale([k0, k0]));
      // NB: scaleTop must be a Vec2 — a scalar is read as [s, 0] by the JS binding.
      const cutter = local.keep(local.keep(atZ0.extrude(t + 2 * eps, 0, 0, [s1 / s0, s1 / s0])).translate([foot[0], foot[1], -eps]));
      solid = local.keep(slab.subtract(cutter));
      const kOut = (a + t) / a;
      let inner = holes;
      let outer = local.keep(local.keep(local.keep(holes.translate([-foot[0], -foot[1]])).scale([kOut, kOut])).translate(foot));
      if (clipToSlab) {
        const rect = local.keep(new CrossSection([rectLoop(0, 0, w, slabHeight)], 'Positive'));
        inner = local.keep(inner.intersect(rect));
        outer = local.keep(outer.intersect(rect));
      }
      holesInner = polygonsToLoops(inner);
      holesOuter = polygonsToLoops(outer);
      openArea = inner.area();
    }
    return { solid: out.keep(solid.transform(frame.matrix as Parameters<Manifold['transform']>[0])), holesInner, holesOuter, openArea };
  } finally {
    local.dispose();
  }
}

/**
 * Makes every feature printable: material thinner than `mf` is thickened (or
 * removed) and gaps narrower than `mf` are closed. Returns the new openings and the
 * area that changed.
 */
export function enforceMinFeature(
  wasm: ManifoldToplevel,
  holes: CrossSection,
  rect: CrossSection,
  removeWithin: CrossSection,
  mf: number,
  policy: ThinFeaturePolicy,
  local: Scope,
): { holes: CrossSection; changedArea: number } {
  const { CrossSection } = wasm;
  const before = holes;
  const material = local.keep(rect.subtract(holes));
  const opened = local.keep(local.keep(material.offset(-mf / 2, 'Round')).offset(mf / 2, 'Round'));
  const thinAll = local.keep(material.subtract(local.keep(opened.offset(0.01, 'Round'))));
  const thinParts = local.keepAll(thinAll.decompose()).filter((c) => c.area() > 0.25 * mf * mf);
  if (thinParts.length) {
    const thin = local.keep(CrossSection.union(thinParts));
    holes =
      policy === 'thicken'
        ? local.keep(holes.subtract(local.keep(thin.offset(mf / 2, 'Round'))))
        : local.keep(holes.add(local.keep(thin.intersect(removeWithin))));
  }
  holes = local.keep(local.keep(local.keep(holes.offset(-mf / 2, 'Round')).offset(mf / 2, 'Round')).simplify(0.005));
  const changedArea = local.keep(holes.subtract(before)).area() + local.keep(before.subtract(holes)).area();
  return { holes, changedArea };
}

export interface BridgeResult {
  holes: CrossSection;
  islands: number;
  specks: number;
  bridges: number;
  bridgeLoops: Loop[];
  floating: number;
}

/**
 * Connects floating islands of material. `frame` anchoring (windowed panels): an
 * island is joined to the surrounding frame by the cheapest straight strut in one of
 * four directions. `base` anchoring (profiled panels): islands are joined by a
 * vertical strut down to the base strip that rests on the plate.
 */
export function bridgeIslands(
  wasm: ManifoldToplevel,
  holes: CrossSection,
  rect: CrossSection,
  w: number,
  h: number,
  bw: number,
  mf: number,
  anchor: 'frame' | 'base',
  local: Scope,
): BridgeResult {
  const { CrossSection } = wasm;
  const tol = 1e-3;
  const anchored = (c: CrossSection) => {
    const b = c.bounds();
    return anchor === 'frame' ? b.min[0] <= tol && b.min[1] <= tol && b.max[0] >= w - tol && b.max[1] >= h - tol : b.min[1] <= tol;
  };
  const bridges: CrossSection[] = [];
  let islands = 0;
  let specks = 0;
  for (let iter = 0; iter < 8; iter++) {
    const comps = local.keepAll(local.keep(rect.subtract(holes)).decompose());
    const floating = comps.filter((c) => !anchored(c));
    if (!floating.length) break;
    const added: CrossSection[] = [];
    for (const comp of floating) {
      if (comp.area() < 4 * mf * mf) {
        holes = local.keep(holes.add(comp)); // unprintable speck: drop it
        specks++;
        continue;
      }
      if (iter === 0) islands++;
      const pts = comp.toPolygons().flat();
      const bot = pts.reduce((p, c) => (c[1] < p[1] ? c : p));
      const down = rectLoop(bot[0] - bw / 2, 0, bot[0] + bw / 2, bot[1] + bw);
      let candidates: Loop[] = [down];
      if (anchor === 'frame') {
        const top = pts.reduce((p, c) => (c[1] > p[1] ? c : p));
        const lft = pts.reduce((p, c) => (c[0] < p[0] ? c : p));
        const rgt = pts.reduce((p, c) => (c[0] > p[0] ? c : p));
        candidates = [
          rectLoop(top[0] - bw / 2, top[1] - bw, top[0] + bw / 2, h),
          down,
          rectLoop(0, lft[1] - bw / 2, lft[0] + bw, lft[1] + bw / 2),
          rectLoop(rgt[0] - bw, rgt[1] - bw / 2, w, rgt[1] + bw / 2),
        ];
      }
      let best: CrossSection | null = null;
      let bestCost = Infinity;
      for (const c of candidates) {
        const strip = local.keep(new CrossSection([c], 'Positive'));
        const cost = local.keep(strip.intersect(holes)).area();
        if (cost < bestCost) {
          bestCost = cost;
          best = strip;
        }
      }
      if (best) added.push(best);
    }
    if (!added.length) continue;
    const union = local.keep(CrossSection.union(added));
    bridges.push(union);
    holes = local.keep(holes.subtract(union));
  }
  // Final gap cleanup after bridging, then verify connectivity.
  holes = local.keep(local.keep(local.keep(holes.offset(-mf / 2, 'Round')).offset(mf / 2, 'Round')).simplify(0.005));
  const floating = local.keepAll(local.keep(rect.subtract(holes)).decompose()).filter((c) => !anchored(c)).length;
  const all = bridges.length ? local.keep(CrossSection.union(bridges)) : null;
  return {
    holes,
    islands,
    specks,
    bridges: all ? local.keepAll(all.decompose()).length : 0,
    bridgeLoops: all ? polygonsToLoops(all) : [],
    floating,
  };
}

/** Magnification, penumbra and resolvable detail along the ray to a wall point. */
export function opticsAt(frame: PanelFrame, wall: WallFrame, light: Vec3, wallPoint: Vec2, emitterSize: number, minFeature: number) {
  const P = wallToWorld(wall, wallPoint[0], wallPoint[1]);
  const q = wallToPanel(frame, wall, light, wallPoint, 0);
  if (!q) return null;
  const Q = panelToWorld(frame, [q[0], q[1], 0]);
  const d1 = length(sub(Q, light));
  const d2 = length(sub(P, light));
  const cosInc = Math.abs(dot(normalize(sub(P, light)), wall.normal));
  const magnification = d2 / d1;
  const penumbra = (emitterSize * (d2 - d1)) / d1 / Math.max(cosInc, 0.05);
  const resolution = Math.max(penumbra, (minFeature * magnification) / Math.max(cosInc, 0.05));
  return { magnification, penumbra, resolution, cosInc };
}
