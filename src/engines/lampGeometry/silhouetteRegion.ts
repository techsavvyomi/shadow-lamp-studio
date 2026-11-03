import type { Loop, SilhouetteData, Vec2 } from '@/types';
import { pointInLoops } from '../math/vec';
import type { CrossSection, ManifoldToplevel } from './manifoldRuntime';
import { Scope } from './manifoldRuntime';

export interface UnitSilhouette {
  /** Region in unit coordinates: centred on its bounding box, y up, longest side = 1. */
  region: CrossSection;
  /** Convex hull vertices of the region (unit coordinates). */
  hull: Vec2[];
  area: number;
}

const toFill = (r: 'evenodd' | 'nonzero') => (r === 'evenodd' ? 'EvenOdd' : 'NonZero') as 'EvenOdd' | 'NonZero';

/**
 * Builds the filled silhouette region: union of shapes ∩ frame (complemented
 * inside the frame when inverted), normalised, then mirrored/rotated as requested.
 * Returns null if the silhouette is empty. The returned region is owned by `scope`.
 */
export function buildUnitSilhouette(
  wasm: ManifoldToplevel,
  s: SilhouetteData,
  rotationDeg: number,
  mirror: boolean,
  scope: Scope,
): UnitSilhouette | null {
  const { CrossSection } = wasm;
  const local = new Scope();
  try {
    // NB: the JS binding rejects an empty polygon list, so start from "no region".
    let region: CrossSection | null = null;
    for (const sh of s.shapes) {
      const loops = sh.loops.filter((l) => l.length >= 3);
      if (!loops.length) continue;
      const cs = local.keep(new CrossSection(loops, toFill(sh.fillRule)));
      if (sh.subtract) region = region ? local.keep(region.subtract(cs)) : null;
      else region = region ? local.keep(region.add(cs)) : cs;
    }
    const { x, y, w, h } = s.frame;
    const frame = local.keep(
      new CrossSection(
        [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ],
        'Positive',
      ),
    );
    if (region) region = local.keep(region.intersect(frame));
    if (s.invert) region = region ? local.keep(frame.subtract(region)) : frame;
    if (!region || region.isEmpty() || region.area() <= 0) return null;

    const b = region.bounds();
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const k = 1 / Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
    // y-down source → y-up wall: mirror across x axis then scale.
    let unit = local.keep(region.translate([-cx, -cy]));
    unit = local.keep(unit.mirror([0, 1]));
    unit = local.keep(unit.scale([k, k]));
    if (mirror) unit = local.keep(unit.mirror([1, 0]));
    if (rotationDeg) unit = local.keep(unit.rotate(rotationDeg));
    unit = local.keep(unit.simplify(1e-5));
    const hullCs = local.keep(unit.hull());
    const hull = hullCs.toPolygons()[0] ?? [];
    const out = scope.keep(unit.translate([0, 0]));
    return { region: out, hull: hull.map((p) => [p[0], p[1]] as Vec2), area: out.area() };
  } finally {
    local.dispose();
  }
}

export const polygonsToLoops = (cs: CrossSection): Loop[] =>
  cs.toPolygons().map((poly) => poly.map((p) => [p[0], p[1]] as Vec2));

/**
 * The point deepest inside a region (largest inscribed circle centre, found by
 * bisecting the erosion distance). Used to seat a wall lamp inside its figure.
 */
export function deepestPoint(region: CrossSection): Vec2 {
  const b = region.bounds();
  let lo = 0;
  let hi = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2;
  let best: CrossSection | null = null;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const eroded = region.offset(-mid, 'Round');
    if (eroded.isEmpty()) {
      eroded.delete();
      hi = mid;
    } else {
      best?.delete();
      best = eroded;
      lo = mid;
    }
  }
  if (!best) return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
  const parts = best.decompose();
  const largest = parts.reduce((p, c) => (c.area() > p.area() ? c : p));
  const lb = largest.bounds();
  const centre: Vec2 = [(lb.min[0] + lb.max[0]) / 2, (lb.min[1] + lb.max[1]) / 2];
  const loops = polygonsToLoops(largest);
  const result = pointInLoops(centre, loops) ? centre : (loops[0]?.[0] ?? centre);
  parts.forEach((p) => p.delete());
  best.delete();
  return result;
}
