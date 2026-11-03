import { describe, expect, it } from 'vitest';
import { signedArea } from '@/engines/math/vec';
import { marchingSquares, simplifyLoop } from './marchingSquares';

const field = (w: number, h: number, f: (x: number, y: number) => number) => {
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x + 0.5, y + 0.5);
  return a;
};

describe('marching squares', () => {
  it('traces a square with exact sub-pixel area', () => {
    const f = field(20, 20, (x, y) => (x > 5 && x < 15 && y > 5 && y < 15 ? 1 : 0));
    const loops = marchingSquares(f, 20, 20);
    expect(loops).toHaveLength(1);
    // a binary step: corners are cut by 4 × 0.125 px²
    expect(Math.abs(signedArea(loops[0]))).toBeCloseTo(99.5, 6);
  });

  it('traces a signed-distance disk within 0.5%', () => {
    const r = 30;
    const f = field(80, 80, (x, y) => 0.5 + (r - Math.hypot(x - 40, y - 40)) * 0.5);
    const loops = marchingSquares(f, 80, 80);
    expect(loops).toHaveLength(1);
    expect(Math.abs(Math.abs(signedArea(loops[0])) - Math.PI * r * r) / (Math.PI * r * r)).toBeLessThan(0.005);
  });

  it('orients outer boundaries and holes oppositely', () => {
    const f = field(60, 60, (x, y) => {
      const d = Math.hypot(x - 30, y - 30);
      return d < 25 && d > 10 ? 1 : 0;
    });
    const loops = marchingSquares(f, 60, 60);
    expect(loops).toHaveLength(2);
    const signs = loops.map((l) => Math.sign(signedArea(l))).sort();
    expect(signs).toEqual([-1, 1]);
  });

  it('closes contours at the image border and resolves saddles', () => {
    const f = field(4, 4, (x, y) => ((Math.floor(x) + Math.floor(y)) % 2 === 0 ? 1 : 0));
    const loops = marchingSquares(f, 4, 4);
    expect(loops.length).toBeGreaterThan(0);
    for (const l of loops) expect(l.length).toBeGreaterThanOrEqual(3);
    // every set pixel is enclosed: total area equals 8 diamonds of area 0.5
    const total = loops.reduce((s, l) => s + signedArea(l), 0);
    expect(Math.abs(total)).toBeGreaterThan(3.9);
  });

  it('Douglas–Peucker keeps shape within tolerance', () => {
    const loop = Array.from({ length: 400 }, (_, i) => {
      const a = (i / 400) * Math.PI * 2;
      return [50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)] as [number, number];
    });
    const s = simplifyLoop(loop, 0.2);
    expect(s.length).toBeLessThan(80);
    expect(Math.abs(signedArea(s) - signedArea(loop)) / signedArea(loop)).toBeLessThan(0.01);
  });
});
