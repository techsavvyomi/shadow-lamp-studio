import type { Mat4, Vec3 } from '@/types';
import { dot } from '../math/vec';

/**
 * Planar projected-shadow matrix (Blinn 1988).
 *
 * For receiver plane π = (n, −n·p0) — signed distance positive on the light side —
 * and point light L, S = (π·L)·I − L·πᵀ maps any point X to the intersection of the
 * line L→X with the plane, in homogeneous coordinates. Its w component is
 * π·L − π·X = n·(L − X), which is positive exactly for points between the light's
 * parallel plane and the receiver: geometry behind the light gets w ≤ 0 and is
 * removed by clipping (GPU) or by `clipToLightSide` (CPU). The result is the exact
 * hard shadow of every triangle — no depth-map resolution or bias artefacts.
 */
export function shadowMatrix(light: Vec3, planeNormal: Vec3, planePoint: Vec3): Mat4 {
  const pi = [planeNormal[0], planeNormal[1], planeNormal[2], -dot(planeNormal, planePoint)];
  const Lh = [light[0], light[1], light[2], 1];
  const d = pi[0] * Lh[0] + pi[1] * Lh[1] + pi[2] * Lh[2] + pi[3];
  const m = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      m[c * 4 + r] = (r === c ? d : 0) - Lh[r] * pi[c];
    }
  }
  return m;
}

/** Applies a column-major 4×4 to (x, y, z, 1), returning homogeneous [x, y, z, w]. */
export function applyHomogeneous(m: Mat4, p: Vec3): [number, number, number, number] {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15],
  ];
}

/**
 * Deterministic emitter samples: a Vogel (golden-angle) spiral over a disc of the
 * given diameter lying in the plane spanned by e1, e2 — used to approximate an
 * area emitter by averaging hard shadows (Monte-Carlo soft shadows).
 */
export function emitterSamples(centre: Vec3, diameter: number, count: number, e1: Vec3, e2: Vec3): Vec3[] {
  if (diameter <= 0 || count <= 1) return [centre];
  const r = diameter / 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const rho = r * Math.sqrt((i + 0.5) / count);
    const th = i * golden;
    const a = rho * Math.cos(th);
    const b = rho * Math.sin(th);
    out.push([centre[0] + a * e1[0] + b * e2[0], centre[1] + a * e1[1] + b * e2[1], centre[2] + a * e1[2] + b * e2[2]]);
  }
  return out;
}
