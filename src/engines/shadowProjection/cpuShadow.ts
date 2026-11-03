/**
 * CPU reference implementation of the shadow projection used by the GPU simulator.
 * Every triangle of the real lamp mesh is clipped to the light side, projected onto
 * the receiver plane with the same shadow matrix, and scan-converted. The union of
 * the projected triangles is exactly the region that cannot see the emitter.
 */
import type { Loop, MeshData, Vec2, Vec3 } from '@/types';
import { dot, sub } from '../math/vec';
import type { WallFrame } from '../projectionGeometry/frames';
import { applyHomogeneous, shadowMatrix } from './shadowMatrix';

export interface Grid {
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
  nu: number;
  nv: number;
}

export const cellCentre = (g: Grid, i: number, j: number): Vec2 => [
  g.minU + ((g.maxU - g.minU) * (i + 0.5)) / g.nu,
  g.minV + ((g.maxV - g.minV) * (j + 0.5)) / g.nv,
];

/** Fills a polygon (grid coordinates) into `mask`, even-odd across all rings. */
export function fillPolygons(mask: Uint8Array, g: Grid, rings: Vec2[][], value = 1, xor = false): void {
  const su = g.nu / (g.maxU - g.minU);
  const sv = g.nv / (g.maxV - g.minV);
  const edges: [number, number, number, number][] = [];
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const x0 = (ring[j][0] - g.minU) * su;
      const y0 = (ring[j][1] - g.minV) * sv;
      const x1 = (ring[i][0] - g.minU) * su;
      const y1 = (ring[i][1] - g.minV) * sv;
      if (y0 === y1) continue;
      edges.push([x0, y0, x1, y1]);
      minRow = Math.min(minRow, y0, y1);
      maxRow = Math.max(maxRow, y0, y1);
    }
  }
  const r0 = Math.max(0, Math.ceil(minRow - 0.5));
  const r1 = Math.min(g.nv - 1, Math.floor(maxRow - 0.5));
  const xs: number[] = [];
  for (let row = r0; row <= r1; row++) {
    const y = row + 0.5;
    xs.length = 0;
    for (const [x0, y0, x1, y1] of edges) {
      if (y0 <= y !== y1 <= y) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const c1 = Math.min(g.nu - 1, Math.floor(xs[k + 1] - 0.5));
      for (let c = c0; c <= c1; c++) {
        const idx = row * g.nu + c;
        mask[idx] = xor ? mask[idx] ^ value : value;
      }
    }
  }
}

/** Clips a triangle to the half-space n·(L − X) ≥ eps (between light plane and wall). */
function clipToLightSide(tri: Vec3[], light: Vec3, n: Vec3, eps: number): Vec3[] {
  const out: Vec3[] = [];
  const d = tri.map((p) => dot(n, sub(light, p)) - eps);
  for (let i = 0; i < 3; i++) {
    const p = tri[i];
    const q = tri[(i + 1) % 3];
    const dp = d[i];
    const dq = d[(i + 1) % 3];
    if (dp >= 0) out.push(p);
    if (dp >= 0 !== dq >= 0) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
    }
  }
  return out;
}

/**
 * Occlusion mask (1 = shadowed) of the receiver grid for a point light.
 * `meshes` must be in world coordinates.
 */
export function rasterizeShadow(meshes: MeshData[], light: Vec3, wall: WallFrame, g: Grid): Uint8Array {
  const mask = new Uint8Array(g.nu * g.nv);
  const S = shadowMatrix(light, wall.normal, wall.origin);
  const eps = 1e-4;
  const tri: Vec3[] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const ring: Vec2[] = [];
  for (const mesh of meshes) {
    const P = mesh.positions;
    const I = mesh.indices;
    for (let t = 0; t < I.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const vi = I[t + k] * 3;
        tri[k] = [P[vi], P[vi + 1], P[vi + 2]];
      }
      const poly = clipToLightSide(tri, light, wall.normal, eps);
      if (poly.length < 3) continue;
      ring.length = 0;
      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      for (const p of poly) {
        const h = applyHomogeneous(S, p);
        const w: Vec3 = [h[0] / h[3], h[1] / h[3], h[2] / h[3]];
        const d = sub(w, wall.origin);
        const uv: Vec2 = [dot(d, wall.u), dot(d, wall.v)];
        ring.push(uv);
        minU = Math.min(minU, uv[0]);
        maxU = Math.max(maxU, uv[0]);
        minV = Math.min(minV, uv[1]);
        maxV = Math.max(maxV, uv[1]);
      }
      if (maxU < g.minU || minU > g.maxU || maxV < g.minV || minV > g.maxV) continue;
      fillPolygons(mask, g, [ring.slice()], 1, false);
    }
  }
  return mask;
}

/** Rasterises an even-odd region (wall coordinates) onto the grid. */
export function rasterizeRegion(loops: Loop[], g: Grid): Uint8Array {
  const mask = new Uint8Array(g.nu * g.nv);
  fillPolygons(mask, g, loops, 1, true);
  return mask;
}

/** Intersection-over-union of two masks restricted to `domain` (1 = counted). */
export function maskIoU(a: Uint8Array, b: Uint8Array, domain?: Uint8Array): number {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (domain && !domain[i]) continue;
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) uni++;
  }
  return uni === 0 ? 1 : inter / uni;
}
