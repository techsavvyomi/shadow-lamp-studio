/**
 * Inverse light-projection mathematics.
 *
 * Model: a point emitter at L inside the lamp. A wall point P receives direct light
 * iff the segment L→P crosses the panel through an opening. For a planar panel the
 * map wall → panel plane along rays through L is a central projection (a planar
 * homography), which maps straight lines to straight lines; polygons therefore map
 * to polygons exactly by projecting their vertices, provided every vertex lies in
 * front of the emitter. Between the panel's inner and outer faces (parallel planes)
 * the same projection is a homothety centred on the foot of the perpendicular from L,
 * with ratio (a + t) / a — this is what makes the cut-out walls follow the rays.
 */
import type { Loop, Vec2, Vec3 } from '@/types';
import { clipPolygonHalfPlane, convexHalfPlanes, convexHull, dot, length, madd, signedArea, sub } from '../math/vec';
import { panelToWorld, type PanelFrame, type WallFrame, wallToWorld, worldToPanel, worldToWall } from './frames';

/** Wall point (a, b) → panel-local (x, y) on the plane z_local = z, along the ray from L. */
export function wallToPanel(frame: PanelFrame, wall: WallFrame, light: Vec3, p: Vec2, z = 0): Vec2 | null {
  const l = worldToPanel(frame, light);
  const q = worldToPanel(frame, wallToWorld(wall, p[0], p[1]));
  if (!(l[2] < z && q[2] > z)) return null;
  const s = (z - l[2]) / (q[2] - l[2]);
  return [l[0] + s * (q[0] - l[0]), l[1] + s * (q[1] - l[1])];
}

/** Panel-local point (x, y, z) → wall coordinates along the ray from L (null if the ray misses). */
export function panelToWall(frame: PanelFrame, wall: WallFrame, light: Vec3, p: Vec3): Vec2 | null {
  const q = panelToWorld(frame, p);
  const d = sub(q, light);
  const denom = dot(wall.normal, d);
  if (denom >= -1e-12) return null;
  const tau = dot(wall.normal, sub(wall.origin, light)) / denom;
  if (tau <= 0) return null;
  return worldToWall(wall, madd(light, d, tau));
}

/** Homothety between parallel panel planes: maps a point on plane z0 to plane z1. */
export function homothety(lightLocal: Vec3, p: Vec2, z0: number, z1: number): Vec2 {
  const k = (z1 - lightLocal[2]) / (z0 - lightLocal[2]);
  return [lightLocal[0] + (p[0] - lightLocal[0]) * k, lightLocal[1] + (p[1] - lightLocal[1]) * k];
}

export const ensureCCW = (loop: Loop): Loop => (signedArea(loop) < 0 ? [...loop].reverse() : loop);

export interface FeasibleRegionInput {
  frame: PanelFrame;
  wall: WallFrame;
  light: Vec3;
  /** Convex projection window on the panel inner plane (panel-local). */
  window: Loop;
  respectFloor: boolean;
  /** World height of the table surface. */
  floorY: number;
  /** Largest allowed distance from the emitter to a wall hit point (bounds grazing rays). */
  maxRayLength: number;
}

export interface FeasibleRegion {
  /** Convex region of the wall the window can illuminate (wall coords, CCW). */
  wall: Loop;
  /** The part of the window whose rays reach that region (panel-local, CCW). */
  panel: Loop;
  floorClipped: boolean;
  grazingClipped: boolean;
}

/**
 * Region of the wall reachable through the panel window, honouring rays that miss
 * the wall (grazing) and rays that hit the table first.
 */
export function feasibleRegion(input: FeasibleRegionInput): FeasibleRegion {
  const { frame, wall, light, respectFloor, floorY, maxRayLength } = input;
  let poly = ensureCCW(input.window);
  // 1) Rays must travel towards the wall: −n·(Q − L) ≥ δ, linear in panel (x, y).
  //    δ bounds the hit distance: |hit − L| = h / (−n·d̂) ≤ maxRayLength.
  const h = dot(wall.normal, sub(light, wall.origin));
  let maxD = 0;
  for (const [x, y] of poly) maxD = Math.max(maxD, length(sub(panelToWorld(frame, [x, y, 0]), light)));
  const delta = (h * maxD) / maxRayLength;
  const nU = dot(wall.normal, frame.u);
  const nV = dot(wall.normal, frame.v);
  const nO = dot(wall.normal, sub(frame.origin, light));
  const before = poly.length;
  const areaBefore = Math.abs(signedArea(poly));
  poly = clipPolygonHalfPlane(poly, -nU, -nV, -nO - delta);
  const grazingClipped = poly.length !== before || Math.abs(Math.abs(signedArea(poly)) - areaBefore) > 1e-6;
  if (poly.length < 3 || h <= 0) return { wall: [], panel: [], floorClipped: false, grazingClipped: true };

  // 2) Project to the wall (convex → convex).
  let wallPoly: Loop = [];
  for (const [x, y] of poly) {
    const w = panelToWall(frame, wall, light, [x, y, 0]);
    if (w) wallPoly.push(w);
  }
  wallPoly = convexHull(wallPoly);

  // 3) Table surface: world y ≥ floorY ⇔ (u.y)·a + (v.y)·b + (origin.y − floorY) ≥ 0.
  let floorClipped = false;
  if (respectFloor) {
    const a0 = Math.abs(signedArea(wallPoly));
    wallPoly = clipPolygonHalfPlane(wallPoly, wall.u[1], wall.v[1], wall.origin[1] - floorY);
    floorClipped = Math.abs(Math.abs(signedArea(wallPoly)) - a0) > 1e-6;
  }
  if (wallPoly.length < 3) return { wall: [], panel: [], floorClipped, grazingClipped };

  // Back-project the final wall region so the panel window matches it exactly.
  const panelPoly: Loop = [];
  for (const p of wallPoly) {
    const q = wallToPanel(frame, wall, light, p, 0);
    if (q) panelPoly.push(q);
  }
  return { wall: ensureCCW(wallPoly), panel: convexHull(panelPoly), floorClipped, grazingClipped };
}

export interface FitResult {
  centre: Vec2;
  scale: number;
}

/**
 * Largest uniform scale s and centre c such that c + s·hull ⊂ region (both convex).
 * For fixed c every (vertex, edge) pair bounds s linearly, so s_max(c) is a minimum
 * of linear functions — concave — and a refining grid search finds the global max.
 */
/** Largest s with c + s·hull ⊂ region for a fixed centre c (0 if c is outside). */
export function maxScaleAt(hull: Vec2[], region: Loop, c: Vec2): number {
  return scaleBound(convexHalfPlanes(ensureCCW(region)), hull, c);
}

function scaleBound(planes: [number, number, number][], hull: Vec2[], c: Vec2): number {
  let s = Infinity;
  for (const [a, b, cc] of planes) {
    const g = a * c[0] + b * c[1] + cc;
    if (g < 0) return 0;
    for (const hp of hull) {
      const k = a * hp[0] + b * hp[1];
      if (k < 0) s = Math.min(s, g / -k);
    }
  }
  return Number.isFinite(s) ? s : 0;
}

export function fitConvex(hull: Vec2[], region: Loop): FitResult {
  const planes = convexHalfPlanes(ensureCCW(region));
  const sMax = (c: Vec2) => scaleBound(planes, hull, c);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of region) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  let best: FitResult = { centre: [(minX + maxX) / 2, (minY + maxY) / 2], scale: 0 };
  best.scale = sMax(best.centre);
  let cx = best.centre[0];
  let cy = best.centre[1];
  let hw = (maxX - minX) / 2;
  let hh = (maxY - minY) / 2;
  const N = 12;
  for (let iter = 0; iter < 14; iter++) {
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const c: Vec2 = [cx - hw + (2 * hw * i) / N, cy - hh + (2 * hh * j) / N];
        const s = sMax(c);
        if (s > best.scale) best = { centre: c, scale: s };
      }
    }
    cx = best.centre[0];
    cy = best.centre[1];
    hw *= 0.35;
    hh *= 0.35;
  }
  return best;
}
