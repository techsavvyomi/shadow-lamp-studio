// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { signedArea } from '@/engines/math/vec';
import { loadManifold, Scope } from '@/engines/lampGeometry/manifoldRuntime';
import { buildUnitSilhouette } from '@/engines/lampGeometry/silhouetteRegion';
import { applyAffine, parsePathData, parseTransform } from './svgPath';
import { colourLuminance, extractSvg } from './svgDocument';

describe('SVG path data', () => {
  it('parses absolute and relative lines with implicit commands', () => {
    const sp = parsePathData('M10 10 l 20 0 0 20 h-20 z');
    expect(sp).toHaveLength(1);
    expect(sp[0].closed).toBe(true);
    expect(Math.abs(signedArea(sp[0].points))).toBeCloseTo(400, 6);
  });

  it('flattens arcs accurately (circle from two arcs)', () => {
    const r = 50;
    const sp = parsePathData(`M ${100 - r} 100 A ${r} ${r} 0 1 0 ${100 + r} 100 A ${r} ${r} 0 1 0 ${100 - r} 100 Z`, 0.05);
    expect(Math.abs(Math.abs(signedArea(sp[0].points)) - Math.PI * r * r) / (Math.PI * r * r)).toBeLessThan(0.002);
  });

  it('flattens cubic and smooth cubic curves', () => {
    const sp = parsePathData('M0,0 C 0,55 45,100 100,100 S 200,55 200,0 Z');
    const pts = sp[0].points;
    expect(pts.length).toBeGreaterThan(10);
    const maxY = Math.max(...pts.map((p) => p[1]));
    expect(maxY).toBeGreaterThan(95);
    expect(maxY).toBeLessThanOrEqual(100.0001);
  });

  it('splits multiple subpaths (holes)', () => {
    const sp = parsePathData('M0 0H100V100H0Z M25 25V75H75V25Z');
    expect(sp).toHaveLength(2);
  });

  it('composes transforms in SVG order', () => {
    const m = parseTransform('translate(10,20) rotate(90) scale(2)');
    const p = applyAffine(m, [1, 0]);
    expect(p[0]).toBeCloseTo(10, 9);
    expect(p[1]).toBeCloseTo(22, 9);
  });

  it('reads colour luminance', () => {
    expect(colourLuminance('#000')).toBe(0);
    expect(colourLuminance('white')).toBeCloseTo(1, 6);
    expect(colourLuminance('none')).toBeNull();
    expect(colourLuminance('rgb(255, 255, 255)')).toBeCloseTo(1, 6);
  });
});

describe('6. SVG documents with multiple paths', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <style>.ghost{fill:none} .ink{fill:#111}</style>
    <g transform="translate(100,100)">
      <path class="ink" d="M-80 -80 H80 V80 H-80 Z"/>
      <circle cx="0" cy="0" r="30" fill="#ffffff"/>
    </g>
    <rect x="0" y="0" width="15" height="15" fill="black"/>
    <path class="ghost" d="M0 0 L200 200" stroke="black"/>
    <polygon points="190,5 195,15 185,15"/>
    <path fill-rule="evenodd" d="M182 150 h16 v40 h-16 z M186 160 h8 v20 h-8 z"/>
  </svg>`;

  it('extracts filled elements with transforms, styles and painter order', () => {
    const { silhouette, warnings } = extractSvg(svg);
    expect(warnings).toEqual([]);
    expect(silhouette.frame).toEqual({ x: 0, y: 0, w: 200, h: 200 });
    // square, white circle (subtract), rect, polygon, evenodd frame = 5 shapes; stroke-only path skipped
    expect(silhouette.shapes).toHaveLength(5);
    expect(silhouette.shapes[1].subtract).toBe(true);
    const sq = silhouette.shapes[0].loops[0];
    expect(Math.min(...sq.map((p) => p[0]))).toBeCloseTo(20, 6);
    expect(silhouette.shapes[4].fillRule).toBe('evenodd');
  });

  it('composites into the expected region area', async () => {
    const wasm = await loadManifold();
    const scope = new Scope();
    const { silhouette } = extractSvg(svg, 0.05);
    const unit = buildUnitSilhouette(wasm, silhouette, 0, false, scope)!;
    // Non-overlapping shapes: square − white circle + corner rect + triangle + even-odd frame.
    const expected = 160 * 160 - Math.PI * 30 * 30 + 15 * 15 + 50 + (16 * 40 - 8 * 20);
    const b = unit.region.bounds();
    // unit coordinates scale the longest extent (x: 0 … 198) to 1
    const k = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 198;
    expect(Math.abs(unit.area / (k * k) - expected) / expected).toBeLessThan(0.01);
    scope.dispose();
  });
});
