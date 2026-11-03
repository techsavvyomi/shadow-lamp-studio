/**
 * SVG path data parsing and flattening (pure, DOM-free).
 * Supports M L H V C S Q T A Z in absolute and relative forms.
 */
import type { Vec2 } from '@/types';

export interface Subpath {
  points: Vec2[];
  closed: boolean;
}

/** 2D affine transform [a b c d e f] — x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];
export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export const composeAffine = (m: Affine, n: Affine): Affine => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export const applyAffine = (m: Affine, p: Vec2): Vec2 => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

/** Parses an SVG `transform` attribute into a single affine matrix. */
export function parseTransform(str: string | null | undefined): Affine {
  let m: Affine = IDENTITY;
  if (!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(str))) {
    const args = (match[2].match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    let t: Affine = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (args.length === 6) t = args as Affine;
        break;
      case 'translate':
        t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale':
        t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = ((args[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(r);
        const s = Math.sin(r);
        t = [c, s, -s, c, 0, 0];
        if (args.length >= 3) {
          const [, cx, cy] = args;
          t = composeAffine(composeAffine([1, 0, 0, 1, cx, cy], t), [1, 0, 0, 1, -cx, -cy]);
        }
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = composeAffine(m, t);
  }
  return m;
}

function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push(m[1] ? m[1] : Number(m[2]));
  return out;
}

const segCount = (len: number, tol: number) => Math.min(128, Math.max(2, Math.ceil(Math.sqrt(len / Math.max(tol, 1e-6)) * 1.5)));
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function cubic(out: Vec2[], p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tol: number) {
  const n = segCount(dist(p0, p1) + dist(p1, p2) + dist(p2, p3), tol);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

function quad(out: Vec2[], p0: Vec2, p1: Vec2, p2: Vec2, tol: number) {
  const n = segCount(dist(p0, p1) + dist(p1, p2), tol);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
}

/** Elliptical arc, endpoint parameterisation (SVG 1.1 §F.6.5). */
function arc(out: Vec2[], p0: Vec2, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: Vec2, tol: number) {
  if (rx === 0 || ry === 0) {
    out.push(p1);
    return;
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cphi = Math.cos(phi);
  const sphi = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1p = cphi * dx + sphi * dy;
  const y1p = -sphi * dx + cphi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cphi * cxp - sphi * cyp + (p0[0] + p1[0]) / 2;
  const cy = sphi * cxp + cphi * cyp + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  if (sweep && dth < 0) dth += 2 * Math.PI;
  const n = segCount(Math.abs(dth) * Math.max(rx, ry), tol);
  for (let i = 1; i <= n; i++) {
    const th = th1 + (dth * i) / n;
    const x = rx * Math.cos(th);
    const y = ry * Math.sin(th);
    out.push([cphi * x - sphi * y + cx, sphi * x + cphi * y + cy]);
  }
  out[out.length - 1] = p1;
}

export function parsePathData(d: string, tolerance = 0.25): Subpath[] {
  const tokens = tokenize(d);
  const subpaths: Subpath[] = [];
  let cur: Vec2[] | null = null;
  let pos: Vec2 = [0, 0];
  let start: Vec2 = [0, 0];
  let lastCtrl: Vec2 | null = null;
  let lastCmd = '';
  let i = 0;
  const num = () => {
    const v = tokens[i++];
    if (typeof v !== 'number') throw new Error('Malformed path data');
    return v;
  };
  const begin = (p: Vec2) => {
    if (cur && cur.length > 1) subpaths.push({ points: cur, closed: false });
    cur = [p];
    start = p;
  };
  let cmd = '';
  while (i < tokens.length) {
    const tk = tokens[i];
    if (typeof tk === 'string') {
      cmd = tk;
      i++;
    } else if (!cmd) {
      throw new Error('Path data must start with a command');
    } else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const rp = (x: number, y: number): Vec2 => (rel ? [pos[0] + x, pos[1] + y] : [x, y]);
    if (C !== 'Z' && !cur) cur = [pos];
    switch (C) {
      case 'M': {
        const p = rp(num(), num());
        begin(p);
        pos = p;
        lastCtrl = null;
        break;
      }
      case 'L': {
        const p = rp(num(), num());
        cur!.push(p);
        pos = p;
        lastCtrl = null;
        break;
      }
      case 'H': {
        const x = num();
        const p: Vec2 = [rel ? pos[0] + x : x, pos[1]];
        cur!.push(p);
        pos = p;
        lastCtrl = null;
        break;
      }
      case 'V': {
        const y = num();
        const p: Vec2 = [pos[0], rel ? pos[1] + y : y];
        cur!.push(p);
        pos = p;
        lastCtrl = null;
        break;
      }
      case 'C': {
        const c1 = rp(num(), num());
        const c2 = rp(num(), num());
        const p = rp(num(), num());
        cubic(cur!, pos, c1, c2, p, tolerance);
        lastCtrl = c2;
        pos = p;
        break;
      }
      case 'S': {
        const c1: Vec2 = lastCtrl && 'CS'.includes(lastCmd) ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
        const c2 = rp(num(), num());
        const p = rp(num(), num());
        cubic(cur!, pos, c1, c2, p, tolerance);
        lastCtrl = c2;
        pos = p;
        break;
      }
      case 'Q': {
        const c = rp(num(), num());
        const p = rp(num(), num());
        quad(cur!, pos, c, p, tolerance);
        lastCtrl = c;
        pos = p;
        break;
      }
      case 'T': {
        const c: Vec2 = lastCtrl && 'QT'.includes(lastCmd) ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
        const p = rp(num(), num());
        quad(cur!, pos, c, p, tolerance);
        lastCtrl = c;
        pos = p;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num() !== 0;
        const sweep = num() !== 0;
        const p = rp(num(), num());
        arc(cur!, pos, rx, ry, rot, large, sweep, p, tolerance);
        pos = p;
        lastCtrl = null;
        break;
      }
      case 'Z': {
        if (cur && cur.length > 1) subpaths.push({ points: cur, closed: true });
        cur = null;
        pos = start;
        lastCtrl = null;
        break;
      }
      default:
        throw new Error(`Unsupported path command ${cmd}`);
    }
    lastCmd = C;
  }
  if (cur && (cur as Vec2[]).length > 1) subpaths.push({ points: cur, closed: false });
  // drop duplicated closing vertex
  for (const sp of subpaths) {
    const p = sp.points;
    if (p.length > 2 && dist(p[0], p[p.length - 1]) < 1e-9) p.pop();
  }
  return subpaths;
}

export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, tol: number): Vec2[] {
  const n = Math.max(12, Math.min(256, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tol / Math.max(rx, ry, 1e-6))))));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Vec2;
  });
}

export function roundedRectPoints(x: number, y: number, w: number, h: number, rx: number, ry: number, tol: number): Vec2[] {
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (rx <= 0 || ry <= 0) {
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  }
  const d = `M${x + rx},${y} H${x + w - rx} A${rx},${ry} 0 0 1 ${x + w},${y + ry} V${y + h - ry} A${rx},${ry} 0 0 1 ${x + w - rx},${y + h} H${x + rx} A${rx},${ry} 0 0 1 ${x},${y + h - ry} V${y + ry} A${rx},${ry} 0 0 1 ${x + rx},${y} Z`;
  return parsePathData(d, tol)[0].points;
}
