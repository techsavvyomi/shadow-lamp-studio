import type { Loop, Vec2 } from '@/types';

/**
 * Marching squares iso-contours of a scalar field (inside = value > iso) with
 * linear sub-pixel interpolation. The field is implicitly padded with 0 so every
 * contour closes. Sample (i, j) sits at the pixel centre (i + 0.5, j + 0.5).
 *
 * Segments are oriented with the inside on the right in image coordinates
 * (clockwise on screen), so each edge crossing starts exactly one segment and ends
 * exactly one, and loops link unambiguously.
 */

// Edges of a cell: T(op), R(ight), B(ottom), L(eft).
const T = 0;
const R = 1;
const B = 2;
const L = 3;

// Corner bits (clockwise on screen): tl=1, tr=2, br=4, bl=8.
// [from, to] pairs; saddles 5 and 10 are resolved at runtime.
const CASES: number[][][] = [
  [], // 0
  [[T, L]], // 1 tl
  [[R, T]], // 2 tr
  [[R, L]], // 3 tl+tr
  [[B, R]], // 4 br
  [], // 5 tl+br (saddle)
  [[B, T]], // 6 tr+br
  [[B, L]], // 7 all but bl
  [[L, B]], // 8 bl
  [[T, B]], // 9 tl+bl
  [], // 10 tr+bl (saddle)
  [[R, B]], // 11 all but br
  [[L, R]], // 12 br+bl
  [[T, R]], // 13 all but tr
  [[L, T]], // 14 all but tl
  [], // 15
];

export function marchingSquares(field: Float32Array, w: number, h: number, iso = 0.5): Loop[] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : field[y * w + x]);
  const W2 = w + 2;
  // Unique id per lattice edge: horizontal edges (x,y)-(x+1,y) and vertical (x,y)-(x,y+1).
  const hKey = (x: number, y: number) => ((y + 1) * W2 + (x + 1)) * 2;
  const vKey = (x: number, y: number) => ((y + 1) * W2 + (x + 1)) * 2 + 1;
  const next = new Map<number, number>();
  const point = new Map<number, Vec2>();
  const lerp = (a: number, b: number) => {
    const d = b - a;
    return Math.abs(d) < 1e-12 ? 0.5 : Math.min(1, Math.max(0, (iso - a) / d));
  };

  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const c = (tl > iso ? 1 : 0) | (tr > iso ? 2 : 0) | (br > iso ? 4 : 0) | (bl > iso ? 8 : 0);
      if (c === 0 || c === 15) continue;
      let segs = CASES[c];
      if (c === 5 || c === 10) {
        const centre = (tl + tr + br + bl) / 4 > iso;
        if (c === 5)
          segs = centre
            ? [
                [T, R],
                [B, L],
              ]
            : [
                [T, L],
                [B, R],
              ];
        else
          segs = centre
            ? [
                [L, T],
                [R, B],
              ]
            : [
                [R, T],
                [L, B],
              ];
      }
      const edgeKey = (e: number) => (e === T ? hKey(x, y) : e === B ? hKey(x, y + 1) : e === L ? vKey(x, y) : vKey(x + 1, y));
      const edgePoint = (e: number): Vec2 => {
        switch (e) {
          case T:
            return [x + lerp(tl, tr) + 0.5, y + 0.5];
          case R:
            return [x + 1.5, y + lerp(tr, br) + 0.5];
          case B:
            return [x + lerp(bl, br) + 0.5, y + 1.5];
          default:
            return [x + 0.5, y + lerp(tl, bl) + 0.5];
        }
      };
      for (const [e0, e1] of segs) {
        const k0 = edgeKey(e0);
        const k1 = edgeKey(e1);
        next.set(k0, k1);
        if (!point.has(k0)) point.set(k0, edgePoint(e0));
        if (!point.has(k1)) point.set(k1, edgePoint(e1));
      }
    }
  }

  const loops: Loop[] = [];
  for (const start of next.keys()) {
    if (!next.has(start)) continue;
    const loop: Loop = [];
    let k = start;
    let guard = 0;
    while (next.has(k) && guard++ < 10_000_000) {
      loop.push(point.get(k)!);
      const n = next.get(k)!;
      next.delete(k);
      k = n;
      if (k === start) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Ramer–Douglas–Peucker simplification of a closed ring. */
export function simplifyLoop(loop: Loop, tolerance: number): Loop {
  const n = loop.length;
  if (n <= 4 || tolerance <= 0) return loop;
  // split at the vertex farthest from vertex 0
  let far = 0;
  let farD = -1;
  for (let i = 1; i < n; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const tol2 = tolerance * tolerance;
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const a = loop[i0];
    const b = loop[i1 % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const p = loop[i];
      let d: number;
      if (len2 < 1e-18) d = (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
      else {
        const cr = dx * (p[1] - a[1]) - dy * (p[0] - a[0]);
        d = (cr * cr) / len2;
      }
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  const out: Loop = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(loop[i]);
  return out.length >= 3 ? out : loop;
}
