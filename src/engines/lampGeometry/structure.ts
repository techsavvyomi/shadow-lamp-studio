/**
 * Non-optical lamp parts, all in world (assembly) coordinates, Y up.
 *
 *  Base plate — slab, a locating lip that sits just inside the four panels, a socket
 *               ring that centres the LED holder, a wire hole and an underside wire
 *               groove leading to the back edge (prints flat, groove bridges).
 *               As a wall plate the groove leads down (lamp +z) and two keyhole
 *               slots take screws: the head passes the round end, then the lamp
 *               drops so the shank sits in the slot above it (lamp −z is up).
 *  Top cover  — plate with a downward locating lip and optional vent holes.
 *  LED holder — flange + tube with a seat for the LED package and a wire bore.
 *               Prints flange-down with no overhangs.
 *  Finger joints — tabs on each panel's bottom edge drop into notches cut into the
 *               plate's edge (box-joint style, open to the outside), so the walls
 *               locate themselves and cannot slide along the plate.
 */
import type { LampDimensions, LightConfig, Loop, MountingConfig, MountingType, PanelId, PrintConfig, Vec3 } from '@/types';
import { PANEL_IDS } from '@/types';
import { lampLayout, type PanelFrame } from '../projectionGeometry/frames';
import type { CrossSection, Manifold, ManifoldToplevel } from './manifoldRuntime';
import { Scope } from './manifoldRuntime';

export const HOLDER = {
  flangeRadius: 7,
  flangeHeight: 2,
  wall: 1.2,
  seatDepth: 2.5,
  boreRadius: 1.4,
  lipWidth: 2,
  socketWall: 1.6,
  socketHeight: 1.6,
  grooveWidth: 3.5,
};

export const holderRimRadius = (light: LightConfig) => light.ledDiameter / 2 + HOLDER.wall;
export const holderRimY = (light: LightConfig) => light.position[1] - light.emitterAboveRim;
/** Lowest emitter height that leaves room for flange + seat + a short tube. */
export const minLightHeight = (lamp: LampDimensions, light: LightConfig) =>
  lamp.baseThickness + HOLDER.flangeHeight + HOLDER.seatDepth + 1.5 + light.emitterAboveRim;

/** Extrudes a 2D section (x, −z) upward along world +Y from y0 by height. */
export function extrudeUp(cs: CrossSection, y0: number, height: number, scope: Scope): Manifold {
  return scope.keep(scope.keep(scope.keep(cs.extrude(height)).rotate([-90, 0, 0])).translate([0, y0, 0]));
}

function ring(wasm: ManifoldToplevel, w: number, d: number, width: number, scope: Scope): CrossSection {
  const { CrossSection } = wasm;
  const outer = scope.keep(CrossSection.square([w, d], true));
  const inner = scope.keep(CrossSection.square([w - 2 * width, d - 2 * width], true));
  return scope.keep(outer.subtract(inner));
}

function cylinderY(wasm: ManifoldToplevel, r: number, y0: number, y1: number, x: number, z: number, scope: Scope): Manifold {
  const c = scope.keep(wasm.Manifold.cylinder(y1 - y0, r, r, 48));
  return scope.keep(scope.keep(c.rotate([-90, 0, 0])).translate([x, y0, z]));
}

/** Keyhole slots of a wall plate (lamp coordinates; lamp −z is up on the wall). */
export function keyholeLayout(lamp: LampDimensions, print: PrintConfig, mounting: MountingConfig) {
  const rHead = mounting.screwHead / 2 + 0.4;
  const slotW = mounting.screwShank + 0.4;
  const slotLen = Math.max(6, rHead * 1.6);
  const kx = lamp.width / 2 - lamp.wallThickness - print.clearance - HOLDER.lipWidth - rHead - 3;
  const kz = -lamp.depth / 4 + slotLen / 2;
  return { rHead, slotW, slotLen, kx, kz };
}

/** Extra gap between the base lip and the panels when finger joints are used, mm. */
export const JOINT_LIP_SETBACK = 0.4;

/** How far a tab reaches into the plate (stops short of the back so it never rocks). */
const tabDepth = (lamp: LampDimensions) => Math.max(1, lamp.baseThickness - 0.3);

/**
 * Finger-joint tabs along a panel's bottom edge, as panel-local x ranges. An even
 * number of tabs, clear of the corners and of the cable groove where it leaves
 * the plate (back edge on a table, lower edge on a wall).
 */
export function fingerTabRanges(frame: PanelFrame, lamp: LampDimensions, print: PrintConfig, light: Vec3, mounting: MountingType): [number, number][] {
  const corner = frame.id === 'front' || frame.id === 'back' ? lamp.wallThickness : 0;
  const a = corner + 6;
  const b = frame.width - corner - 6;
  const span = b - a;
  if (span < 16) return [];
  const n = 2 * Math.max(1, Math.round(span / 70));
  const tw = Math.min(12, span / (2 * n));
  let keepClear: [number, number] | null = null;
  if (frame.id === (mounting === 'wall' ? 'front' : 'back')) {
    const g = (light[0] - frame.origin[0]) / frame.u[0];
    const half = HOLDER.grooveWidth / 2 + print.clearance + 2;
    keepClear = [g - half, g + half];
  }
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const c = a + (span * (i + 0.5)) / n;
    const r: [number, number] = [c - tw / 2, c + tw / 2];
    if (keepClear && r[1] + print.clearance > keepClear[0] && r[0] - print.clearance < keepClear[1]) continue;
    out.push(r);
  }
  return out;
}

export interface FingerJoints {
  tabs: Partial<Record<PanelId, Manifold>>;
  /** Notches to cut from the plate (one solid), or null. */
  notches: Manifold | null;
  /** Tab outlines for the panel drawings (panel-local, below y = 0). */
  drawings: Record<PanelId, Loop[]>;
}

export function buildFingerJoints(
  wasm: ManifoldToplevel,
  frames: Record<PanelId, PanelFrame>,
  lamp: LampDimensions,
  print: PrintConfig,
  light: Vec3,
  mounting: MountingType,
  out: Scope,
): FingerJoints {
  const { Manifold } = wasm;
  const s = new Scope();
  try {
    const c = print.clearance;
    const t = lamp.wallThickness;
    const depth = tabDepth(lamp);
    const tb = lamp.baseThickness;
    const tabs: Partial<Record<PanelId, Manifold>> = {};
    const drawings = {} as Record<PanelId, Loop[]>;
    const notches: Manifold[] = [];
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, f: PanelFrame) =>
      s.keep(s.keep(s.keep(Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0])).transform(f.matrix as Parameters<Manifold['transform']>[0]));
    for (const id of PANEL_IDS) {
      const f = frames[id];
      const ranges = fingerTabRanges(f, lamp, print, light, mounting);
      drawings[id] = ranges.map(([x0, x1]) => [
        [x0, -depth],
        [x1, -depth],
        [x1, 0],
        [x0, 0],
      ]);
      if (!ranges.length) continue;
      // tabs overlap the panel by 0.5 mm so the union is one solid
      tabs[id] = out.keep(Manifold.union(ranges.map(([x0, x1]) => box(x0, -depth, 0, x1, 0.5, t, f))));
      // notch: tab + clearance, through the plate and open to the outside edge
      for (const [x0, x1] of ranges) notches.push(box(x0 - c, -tb - 1, -c, x1 + c, 0.5, t + 1, f));
    }
    return { tabs, notches: notches.length ? out.keep(Manifold.union(notches)) : null, drawings };
  } finally {
    s.dispose();
  }
}

export function buildBase(
  wasm: ManifoldToplevel,
  lamp: LampDimensions,
  light: LightConfig,
  print: PrintConfig,
  out: Scope,
  mounting?: MountingConfig,
): Manifold {
  const { Manifold } = wasm;
  const s = new Scope();
  try {
    const { width: W, depth: D, wallThickness: t, baseThickness: tb } = lamp;
    const c = print.clearance;
    const [lx, , lz] = light.position;
    const slab = s.keep(s.keep(Manifold.cube([W, tb, D])).translate([-W / 2, 0, -D / 2]));
    // With finger joints the tabs locate the panels; the lip steps back a little so
    // the notches never share a face with it (coplanar faces leave slivers).
    const inset = c + (lamp.fingerJoints ? JOINT_LIP_SETBACK : 0);
    const lipW = W - 2 * t - 2 * inset;
    const lipD = D - 2 * t - 2 * inset;
    const lip = extrudeUp(ring(wasm, lipW, lipD, HOLDER.lipWidth, s), tb - 0.01, lamp.lipHeight + 0.01, s);
    const sockIn = HOLDER.flangeRadius + c;
    const socket = s.keep(
      cylinderY(wasm, sockIn + HOLDER.socketWall, tb - 0.01, tb + HOLDER.socketHeight, lx, lz, s).subtract(
        cylinderY(wasm, sockIn, tb - 1, tb + HOLDER.socketHeight + 1, lx, lz, s),
      ),
    );
    const hole = cylinderY(wasm, HOLDER.boreRadius + 0.6, -1, tb + 1, lx, lz, s);
    const grooveDepth = Math.min(2, tb - 1);
    const wall = mounting?.type === 'wall';
    // table: towards the back edge (−z); wall: downwards (lamp +z) so the cable hangs
    const z0 = wall ? lz : -D / 2 - 1;
    const z1 = wall ? D / 2 + 1 : lz;
    const groove = s.keep(
      s.keep(Manifold.cube([HOLDER.grooveWidth, grooveDepth + 1, z1 - z0])).translate([lx - HOLDER.grooveWidth / 2, -1, z0]),
    );
    const cuts = [hole, groove];
    if (wall && mounting.keyholes) {
      const { rHead, slotW, slotLen, kx, kz } = keyholeLayout(lamp, print, mounting);
      for (const sx of [-1, 1]) {
        const x = sx * kx;
        cuts.push(cylinderY(wasm, rHead, -1, tb + 1, x, kz, s));
        cuts.push(s.keep(s.keep(Manifold.cube([slotW, tb + 2, slotLen])).translate([x - slotW / 2, -1, kz - slotLen])));
        cuts.push(cylinderY(wasm, slotW / 2, -1, tb + 1, x, kz - slotLen, s));
      }
    }
    const solid = s.keep(Manifold.union([slab, lip, socket]));
    return out.keep(solid.subtract(s.keep(Manifold.union(cuts))));
  } finally {
    s.dispose();
  }
}

export function buildTop(wasm: ManifoldToplevel, lamp: LampDimensions, light: LightConfig, print: PrintConfig, out: Scope): Manifold {
  const { Manifold } = wasm;
  const s = new Scope();
  try {
    const { width: W, depth: D, wallThickness: t, topThickness: tt, height: H } = lamp;
    const c = print.clearance;
    const plate = s.keep(s.keep(Manifold.cube([W, tt, D])).translate([-W / 2, H - tt, -D / 2]));
    const lip = extrudeUp(ring(wasm, W - 2 * t - 2 * c, D - 2 * t - 2 * c, HOLDER.lipWidth, s), H - tt - lamp.lipHeight, lamp.lipHeight + 0.01, s);
    let solid = s.keep(plate.add(lip));
    if (lamp.topVents) {
      const [lx, , lz] = light.position;
      const vents: Manifold[] = [];
      const R = Math.min(12, (Math.min(W, D) - 2 * t) / 2 - HOLDER.lipWidth - 4);
      for (let i = 0; i < 6; i++) {
        const th = (i / 6) * Math.PI * 2;
        vents.push(cylinderY(wasm, 1.5, H - tt - 1, H + 1, lx + R * Math.cos(th), lz + R * Math.sin(th), s));
      }
      solid = s.keep(solid.subtract(s.keep(Manifold.union(vents))));
    }
    return out.keep(solid.translate([0, 0, 0]));
  } finally {
    s.dispose();
  }
}

export function buildLedHolder(wasm: ManifoldToplevel, lamp: LampDimensions, light: LightConfig, print: PrintConfig, out: Scope): Manifold {
  const s = new Scope();
  try {
    const { baseTop } = lampLayout(lamp);
    const [lx, , lz] = light.position;
    const rim = holderRimY(light);
    const rOuter = holderRimRadius(light);
    const rSeat = light.ledDiameter / 2 + print.clearance;
    const flange = cylinderY(wasm, HOLDER.flangeRadius, baseTop, baseTop + HOLDER.flangeHeight, lx, lz, s);
    const tube = cylinderY(wasm, rOuter, baseTop + HOLDER.flangeHeight - 0.01, rim, lx, lz, s);
    const seat = cylinderY(wasm, rSeat, rim - HOLDER.seatDepth, rim + 1, lx, lz, s);
    const bore = cylinderY(wasm, HOLDER.boreRadius, baseTop - 1, rim + 1, lx, lz, s);
    const body = s.keep(flange.add(tube));
    return out.keep(body.subtract(s.keep(seat.add(bore))));
  } finally {
    s.dispose();
  }
}

export const holderTopWorld = (light: LightConfig): Vec3 => [light.position[0], holderRimY(light), light.position[2]];
