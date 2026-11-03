import type { LampDimensions, Mat4, PanelId, Vec2, Vec3 } from '@/types';
import { basisMatrix, cross, deg2rad, dot, madd, rotateAbout, sub } from '../math/vec';

/**
 * Panel coordinate frame.
 *
 * Panel-local coordinates (x, y, z): x ∈ [0, width] runs left→right as seen from
 * OUTSIDE the lamp, y ∈ [0, height] runs up, z ∈ [0, thickness] runs from the inner
 * (light-facing) face to the outer face. world = origin + x·u + y·v + z·n.
 * (u, v, n) is right-handed, so the local→world map is a proper rotation.
 */
export interface PanelFrame {
  id: PanelId;
  u: Vec3;
  v: Vec3;
  n: Vec3;
  origin: Vec3;
  width: number;
  height: number;
  thickness: number;
  /** local → world */
  matrix: Mat4;
}

/** Heights of the stacked lamp parts (world Y). */
export interface LampLayout {
  panelBottom: number;
  panelTop: number;
  panelHeight: number;
  baseTop: number;
}

export function lampLayout(lamp: LampDimensions): LampLayout {
  const baseTop = lamp.baseThickness;
  const panelTop = lamp.height - (lamp.topCover ? lamp.topThickness : 0);
  return { baseTop, panelBottom: baseTop, panelTop, panelHeight: panelTop - baseTop };
}

export function panelFrame(id: PanelId, lamp: LampDimensions): PanelFrame {
  const { width: W, depth: D, wallThickness: t } = lamp;
  const { panelBottom: yb, panelHeight: h } = lampLayout(lamp);
  let u: Vec3;
  let n: Vec3;
  let w: number;
  let innerCentre: Vec3;
  switch (id) {
    case 'front':
      n = [0, 0, 1];
      u = [1, 0, 0];
      w = W;
      innerCentre = [0, yb, D / 2 - t];
      break;
    case 'back':
      n = [0, 0, -1];
      u = [-1, 0, 0];
      w = W;
      innerCentre = [0, yb, -D / 2 + t];
      break;
    case 'right':
      n = [1, 0, 0];
      u = [0, 0, -1];
      w = D - 2 * t; // butt joint: sides fit between front and back
      innerCentre = [W / 2 - t, yb, 0];
      break;
    case 'left':
      n = [-1, 0, 0];
      u = [0, 0, 1];
      w = D - 2 * t;
      innerCentre = [-W / 2 + t, yb, 0];
      break;
  }
  const v: Vec3 = [0, 1, 0];
  const origin = madd(innerCentre, u, -w / 2);
  return { id, u, v, n, origin, width: w, height: h, thickness: t, matrix: basisMatrix(u, v, n, origin) };
}

export const worldToPanel = (f: PanelFrame, p: Vec3): Vec3 => {
  const d = sub(p, f.origin);
  return [dot(d, f.u), dot(d, f.v), dot(d, f.n)];
};

export const panelToWorld = (f: PanelFrame, p: Vec3): Vec3 =>
  madd(madd(madd(f.origin, f.u, p[0]), f.v, p[1]), f.n, p[2]);

/**
 * Wall (receiver plane) frame. Wall coordinates (a, b): a to the right and b up, as
 * seen by a viewer standing at the lamp looking at the wall. `normal` faces the lamp.
 * world = origin + a·u + b·v.
 */
export interface WallFrame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3;
}

export interface WallPose {
  distance: number; // from the panel's outer face
  yaw: number; // degrees about world up
  pitch: number; // degrees about the wall's horizontal axis
}

/**
 * The wall facing a panel. Its origin is the point on the table line (world y = 0)
 * directly in front of the panel centre; yaw and pitch rotate the wall about that
 * point (pitch hinges on the table line).
 */
export function wallFrameForPanel(f: PanelFrame, pose: WallPose): WallFrame {
  const centre = madd(madd(f.origin, f.u, f.width / 2), f.n, f.thickness + pose.distance);
  const origin: Vec3 = [centre[0], 0, centre[2]];
  let u: Vec3 = [-f.u[0], -f.u[1], -f.u[2]];
  let v: Vec3 = [0, 1, 0];
  let normal: Vec3 = [-f.n[0], -f.n[1], -f.n[2]];
  const p = deg2rad(pose.pitch);
  if (p !== 0) {
    // (−U) × up = −n, so a positive rotation about u leans the top towards the lamp.
    v = rotateAbout(v, u, p);
    normal = rotateAbout(normal, u, p);
  }
  const y = deg2rad(pose.yaw);
  if (y !== 0) {
    u = rotateAbout(u, [0, 1, 0], y);
    v = rotateAbout(v, [0, 1, 0], y);
    normal = rotateAbout(normal, [0, 1, 0], y);
  }
  return { origin, u, v, normal };
}

export const wallToWorld = (w: WallFrame, a: number, b: number): Vec3 => madd(madd(w.origin, w.u, a), w.v, b);

export const worldToWall = (w: WallFrame, p: Vec3): Vec2 => {
  const d = sub(p, w.origin);
  return [dot(d, w.u), dot(d, w.v)];
};

/** Consistency check used by tests: u × v must equal the lamp-facing normal. */
export const wallHandedness = (w: WallFrame): number => dot(cross(w.u, w.v), w.normal);
