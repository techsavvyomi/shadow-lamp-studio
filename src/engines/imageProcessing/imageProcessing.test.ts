import { describe, expect, it } from 'vitest';
import { DEFAULT_PROCESSING } from '@/engines/defaults';
import { regionArea } from '@/engines/math/vec';
import { addSpeckNoise, cat, circle, complex, human, maskArea, maskToRGBA, rasterParts } from '@/test/fixtures';
import { gaussianBlur, otsu } from './raster';
import { processImage } from './pipeline';

const W = 400;
const H = 400;
const auto = { ...DEFAULT_PROCESSING, resolution: 400 };

/** Area enclosed by contours (even-odd): sum of signed areas. */
const contourArea = (loops: [number, number][][]) => regionArea(loops);

describe('raster primitives', () => {
  it('Otsu splits a bimodal distribution between the modes', () => {
    const v = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) v[i] = i < 600 ? 0.2 + (i % 7) * 0.005 : 0.8 - (i % 5) * 0.005;
    const t = otsu(v);
    // mid-gap between the modes (0.23 … 0.78), not at the edge of either cluster
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(0.6);
  });

  it('Gaussian blur preserves total mass', () => {
    const f = new Float32Array(50 * 50);
    f[25 * 50 + 25] = 1;
    const b = gaussianBlur(f, 50, 50, 2);
    expect(b.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 4);
  });
});

describe('silhouette extraction', () => {
  it('1. basic black-and-white silhouette (disk): exact area, one component', () => {
    const mask = rasterParts([[circle(200, 200, 120)]], W, H);
    const r = processImage(maskToRGBA(mask, W, H, [0, 0, 0], [255, 255, 255]), auto);
    expect(r.stats.method).toBe('background');
    expect(r.stats.components).toBe(1);
    expect(r.stats.holes).toBe(0);
    const expected = Math.PI * 120 * 120;
    expect(Math.abs(contourArea(r.loops) - expected) / expected).toBeLessThan(0.01);
  });

  it('2. human silhouette: one connected figure', () => {
    const mask = rasterParts(human(), W, H);
    const r = processImage(maskToRGBA(mask, W, H, [20, 20, 20], [250, 250, 245]), auto);
    expect(r.stats.components).toBe(1);
    expect(Math.abs(maskArea(r.mask) - maskArea(mask)) / maskArea(mask)).toBeLessThan(0.03);
  });

  it('3. animal silhouette on a coloured background', () => {
    const mask = rasterParts(cat(), W, H);
    const r = processImage(maskToRGBA(mask, W, H, [70, 40, 20], [160, 200, 240]), auto);
    expect(r.stats.method).toBe('background');
    expect(r.stats.components).toBe(1);
    expect(Math.abs(maskArea(r.mask) - maskArea(mask)) / maskArea(mask)).toBeLessThan(0.03);
  });

  it('4/7. complex character: holes and disconnected regions preserved, noise removed', () => {
    const c = complex();
    const mask = rasterParts(c.parts, W, H);
    const img = maskToRGBA(mask, W, H, [0, 0, 0], [255, 255, 255]);
    addSpeckNoise(img, 40, [0, 0, 0]);
    const r = processImage(img, auto);
    expect(r.stats.components).toBe(c.components);
    expect(r.stats.holes).toBe(c.holes);
  });

  it('5. transparent PNG uses the alpha channel regardless of colour', () => {
    const mask = rasterParts(cat(), W, H);
    const img = maskToRGBA(mask, W, H, [240, 240, 240], [0, 0, 0], true); // light figure, transparent bg
    const r = processImage(img, auto);
    expect(r.stats.method).toBe('alpha');
    expect(Math.abs(maskArea(r.mask) - maskArea(mask)) / maskArea(mask)).toBeLessThan(0.03);
  });

  it('detects a light figure on a dark background (polarity)', () => {
    const mask = rasterParts([[circle(200, 200, 100)]], W, H);
    const r = processImage(maskToRGBA(mask, W, H, [250, 250, 250], [5, 5, 5]), auto);
    expect(Math.abs(maskArea(r.mask) - maskArea(mask)) / maskArea(mask)).toBeLessThan(0.03);
  });

  it('manual mode: threshold, invert and crop', () => {
    const mask = rasterParts([[circle(100, 100, 60)]], W, H);
    const img = maskToRGBA(mask, W, H, [0, 0, 0], [255, 255, 255]);
    const manual = { ...auto, mode: 'manual' as const, method: 'luminance' as const, threshold: 128, removeBackground: false };
    const plain = processImage(img, manual);
    expect(Math.abs(maskArea(plain.mask) - maskArea(mask)) / maskArea(mask)).toBeLessThan(0.03);
    const inv = processImage(img, { ...manual, invert: true });
    expect(maskArea(inv.mask)).toBeGreaterThan(W * H - maskArea(mask) * 1.05);
    const cropped = processImage(img, { ...manual, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    expect(cropped.width).toBe(200);
    expect(cropped.height).toBe(200);
    expect(Math.abs(maskArea(cropped.mask) - maskArea(mask)) / maskArea(mask)).toBeLessThan(0.03);
  });

  it('handles an empty image without crashing', () => {
    const img = maskToRGBA(new Uint8Array(W * H), W, H, [0, 0, 0], [255, 255, 255]);
    const r = processImage(img, auto);
    expect(r.loops.length).toBe(0);
    expect(r.stats.notes.some((n) => n.includes('No silhouette'))).toBe(true);
  });

  it('downsamples large uploads to the processing resolution', () => {
    const big = 1600;
    const mask = rasterParts([[circle(800, 800, 500)]], big, big);
    const r = processImage(maskToRGBA(mask, big, big, [0, 0, 0], [255, 255, 255]), { ...auto, resolution: 512 });
    expect(Math.max(r.width, r.height)).toBe(512);
    expect(r.stats.components).toBe(1);
  });
});
