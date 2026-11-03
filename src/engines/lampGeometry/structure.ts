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
 */
import type { LampDimensions, LightConfig, MountingConfig, PrintConfig, Vec3 } from '@/types';
import { lampLayout } from '../projectionGeometry/frames';
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
function extrudeUp(cs: CrossSection, y0: number, height: number, scope: Scope): Manifold {
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
    const lipW = W - 2 * t - 2 * c;
    const lipD = D - 2 * t - 2 * c;
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
      const rHead = mounting.screwHead / 2 + 0.4;
      const slotW = mounting.screwShank + 0.4;
      const slotLen = Math.max(6, rHead * 1.6);
      const kx = W / 2 - t - c - HOLDER.lipWidth - rHead - 3;
      const kz = -D / 4 + slotLen / 2;
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
