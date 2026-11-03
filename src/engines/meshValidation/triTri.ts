import type { Vec3 } from '@/types';
import { cross, dot, length, sub } from '../math/vec';

const EPS = 1e-7;

/**
 * Does segment p→q pierce triangle (a, b, c)? The segment must strictly cross the
 * triangle's plane (an endpoint resting on the plane is "touching", not piercing,
 * and coplanar pairs are ignored); the crossing point may lie on the boundary.
 */
function segmentCrossesTriangle(p: Vec3, q: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const n = cross(sub(b, a), sub(c, a));
  const nl = length(n);
  if (nl < 1e-12) return false;
  const dp = dot(n, sub(p, a)) / nl;
  const dq = dot(n, sub(q, a)) / nl;
  if ((dp > EPS && dq > EPS) || (dp < -EPS && dq < -EPS)) return false;
  if (Math.abs(dp) <= EPS || Math.abs(dq) <= EPS) return false; // endpoint on plane: touching
  const t = dp / (dp - dq);
  const x: Vec3 = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  // barycentric inside test (strict)
  const c0 = dot(n, cross(sub(b, a), sub(x, a)));
  const c1 = dot(n, cross(sub(c, b), sub(x, b)));
  const c2 = dot(n, cross(sub(a, c), sub(x, c)));
  // Inclusive: a segment that strictly crosses the plane through a triangle edge
  // still pierces the surface (the neighbouring triangle shares that edge).
  const tol = EPS * nl * nl;
  return c0 >= -tol && c1 >= -tol && c2 >= -tol;
}

/** True if two non-coplanar triangles properly intersect. */
export function trianglesIntersect(t1: [Vec3, Vec3, Vec3], t2: [Vec3, Vec3, Vec3]): boolean {
  for (let i = 0; i < 3; i++) {
    if (segmentCrossesTriangle(t1[i], t1[(i + 1) % 3], t2[0], t2[1], t2[2])) return true;
    if (segmentCrossesTriangle(t2[i], t2[(i + 1) % 3], t1[0], t1[1], t1[2])) return true;
  }
  return false;
}
