/**
 * Procedural test silhouettes (no binary fixtures): each is a set of even-odd
 * polygon rings in pixel coordinates, rasterised to RGBA on demand. Because the
 * ground-truth geometry is known exactly, extraction accuracy can be measured.
 */
import type { Loop, SilhouetteData, Vec2 } from '@/types';
import type { RGBAImage } from '@/engines/imageProcessing/raster';
import { fillPolygons, type Grid } from '@/engines/shadowProjection/cpuShadow';

export const circle = (cx: number, cy: number, r: number, n = 96): Loop =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)] as Vec2);

export const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 96): Loop =>
  Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * 2 * Math.PI), cy + ry * Math.sin((i / n) * 2 * Math.PI)] as Vec2);

export const rect = (x: number, y: number, w: number, h: number): Loop => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

export const star = (cx: number, cy: number, r1: number, r2: number, n: number): Loop =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? r2 : r1;
    const a = (i / (n * 2)) * Math.PI * 2;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as Vec2;
  });

export const polygon = (...pts: Vec2[]): Loop => pts;

/** A standing person: head, torso, arms and legs (single connected silhouette, union semantics). */
export const human = (): Loop[][] => [
  [circle(200, 78, 34)],
  [rect(160, 108, 80, 130)],
  [polygon([170, 115], [120, 205], [104, 198], [162, 108])],
  [polygon([230, 115], [280, 205], [296, 198], [238, 108])],
  [rect(165, 230, 30, 140)],
  [rect(205, 230, 30, 140)],
];

/** A sitting cat: body, head, ears and a curled tail. */
export const cat = (): Loop[][] => [
  [ellipse(200, 270, 95, 85)],
  [circle(200, 150, 60)],
  [polygon([150, 120], [160, 60], [190, 100])],
  [polygon([250, 120], [240, 60], [210, 100])],
  [polygon([260, 320], [350, 300], [370, 240], [385, 245], [365, 315], [250, 335])],
];

/**
 * Complex character for robustness: a ring (hole), a star with a circular hole,
 * two disconnected dots, plus single-pixel noise specks that must be removed.
 */
export const complex = (): { parts: Loop[][]; holes: number; components: number } => ({
  parts: [
    [circle(110, 110, 80), circle(110, 110, 45)],
    [star(290, 120, 90, 40, 5), circle(290, 125, 18)],
    [circle(90, 300, 30)],
    [circle(200, 320, 22)],
    [rect(320, 260, 50, 100), rect(335, 280, 20, 25)],
  ],
  holes: 3,
  components: 5,
});

/** Union-of-parts rasterisation: each part is even-odd internally, parts are OR-ed. */
export function rasterParts(parts: Loop[][], w: number, h: number): Uint8Array {
  const g: Grid = { minU: 0, minV: 0, maxU: w, maxV: h, nu: w, nv: h };
  const out = new Uint8Array(w * h);
  for (const p of parts) {
    const m = new Uint8Array(w * h);
    fillPolygons(m, g, p, 1, false);
    for (let i = 0; i < m.length; i++) out[i] |= m[i];
  }
  return out;
}

export function maskToRGBA(
  mask: Uint8Array,
  w: number,
  h: number,
  fg: [number, number, number],
  bg: [number, number, number],
  transparentBg = false,
): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const c = mask[i] ? fg : bg;
    data[i * 4] = c[0];
    data[i * 4 + 1] = c[1];
    data[i * 4 + 2] = c[2];
    data[i * 4 + 3] = transparentBg && !mask[i] ? 0 : 255;
  }
  return { data, width: w, height: h };
}

export function addSpeckNoise(img: RGBAImage, count: number, colour: [number, number, number], seed = 7): void {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < count; k++) {
    const x = Math.floor(rnd() * img.width);
    const y = Math.floor(rnd() * img.height);
    const p = (y * img.width + x) * 4;
    img.data[p] = colour[0];
    img.data[p + 1] = colour[1];
    img.data[p + 2] = colour[2];
    img.data[p + 3] = 255;
  }
}

export const maskArea = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);

export function silhouetteFromParts(parts: Loop[][], w: number, h: number): SilhouetteData {
  return {
    shapes: parts.map((loops) => ({ loops, fillRule: 'evenodd' as const })),
    frame: { x: 0, y: 0, w, h },
    invert: false,
    source: 'vector',
  };
}
