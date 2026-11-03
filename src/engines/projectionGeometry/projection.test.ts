import { describe, expect, it } from 'vitest';
import { DEFAULT_LAMP } from '@/engines/defaults';
import { cross, dot, length } from '@/engines/math/vec';
import { PANEL_IDS, type Vec3 } from '@/types';
import { panelFrame, panelToWorld, wallFrameForPanel, wallHandedness, wallToWorld, worldToPanel } from './frames';
import { feasibleRegion, fitConvex, homothety, panelToWall, wallToPanel } from './projection';

const light: Vec3 = [3, 24, -5];

describe('frames', () => {
  it.each(PANEL_IDS)('%s panel frame is orthonormal, right-handed and faces outward', (id) => {
    const f = panelFrame(id, DEFAULT_LAMP);
    expect(length(f.u)).toBeCloseTo(1);
    expect(dot(f.u, f.v)).toBeCloseTo(0);
    expect(dot(cross(f.u, f.v), f.n)).toBeCloseTo(1);
    // panel centre minus lamp centre points along the outward normal
    const c = panelToWorld(f, [f.width / 2, f.height / 2, f.thickness / 2]);
    expect(dot([c[0], 0, c[2]], f.n)).toBeGreaterThan(0);
    // round trip
    const p: Vec3 = [12, 34, 0.7];
    const q = worldToPanel(f, panelToWorld(f, p));
    q.forEach((v, i) => expect(v).toBeCloseTo(p[i], 9));
  });

  it.each([
    [0, 0],
    [25, 0],
    [0, 15],
    [-30, -10],
  ])('wall frame (yaw %d°, pitch %d°) is right-handed with the normal facing the lamp', (yaw, pitch) => {
    const f = panelFrame('front', DEFAULT_LAMP);
    const w = wallFrameForPanel(f, { distance: 500, yaw, pitch });
    expect(wallHandedness(w)).toBeCloseTo(1);
    expect(dot(w.normal, [light[0] - w.origin[0], light[1] - w.origin[1], light[2] - w.origin[2]])).toBeGreaterThan(0);
  });

  it('positive pitch leans the top of the wall towards the lamp', () => {
    const f = panelFrame('front', DEFAULT_LAMP);
    const w = wallFrameForPanel(f, { distance: 500, yaw: 0, pitch: 20 });
    const top = wallToWorld(w, 0, 1000);
    expect(top[2]).toBeLessThan(w.origin[2]);
  });
});

describe('central projection', () => {
  it.each(PANEL_IDS)('%s: wall → panel → wall is the identity (yawed wall)', (id) => {
    const f = panelFrame(id, DEFAULT_LAMP);
    const w = wallFrameForPanel(f, { distance: 600, yaw: 20, pitch: 5 });
    for (const p of [
      [0, 300],
      [-200, 150],
      [180, 600],
    ] as [number, number][]) {
      const q = wallToPanel(f, w, light, p, 0)!;
      const back = panelToWall(f, w, light, [q[0], q[1], 0])!;
      expect(back[0]).toBeCloseTo(p[0], 6);
      expect(back[1]).toBeCloseTo(p[1], 6);
    }
  });

  it('points on the same light ray map to the same wall point (homothety)', () => {
    const f = panelFrame('front', DEFAULT_LAMP);
    const w = wallFrameForPanel(f, { distance: 500, yaw: 0, pitch: 0 });
    const l = worldToPanel(f, light);
    const inner: [number, number] = [30, 60];
    const outer = homothety(l, inner, 0, f.thickness);
    const a = panelToWall(f, w, light, [inner[0], inner[1], 0])!;
    const b = panelToWall(f, w, light, [outer[0], outer[1], f.thickness])!;
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
  });

  it('magnification equals the ratio of distances for a parallel wall', () => {
    const f = panelFrame('front', DEFAULT_LAMP);
    const w = wallFrameForPanel(f, { distance: 500, yaw: 0, pitch: 0 });
    const L: Vec3 = [0, 50, 0];
    const p0 = panelToWall(f, w, L, [50, 50, 0])!;
    const p1 = panelToWall(f, w, L, [60, 50, 0])!;
    const a = DEFAULT_LAMP.depth / 2 - DEFAULT_LAMP.wallThickness;
    const D = DEFAULT_LAMP.depth / 2 + 500;
    expect(Math.abs(p1[0] - p0[0])).toBeCloseTo((10 * D) / a, 6);
  });
});

describe('feasibility and fitting', () => {
  it('feasible region respects the table line', () => {
    const f = panelFrame('front', DEFAULT_LAMP);
    const w = wallFrameForPanel(f, { distance: 500, yaw: 0, pitch: 0 });
    const window: [number, number][] = [
      [6, 6],
      [94, 6],
      [94, 85],
      [6, 85],
    ];
    const r = feasibleRegion({ frame: f, wall: w, light, window, respectFloor: true, floorY: 0, maxRayLength: 5000 });
    expect(r.floorClipped).toBe(true);
    for (const [, b] of r.wall) expect(b).toBeGreaterThanOrEqual(-1e-6);
    const free = feasibleRegion({ frame: f, wall: w, light, window, respectFloor: false, floorY: 0, maxRayLength: 5000 });
    expect(Math.min(...free.wall.map((p) => p[1]))).toBeLessThan(0);
  });

  it('a strongly yawed wall clips grazing rays instead of producing infinite regions', () => {
    const f = panelFrame('front', DEFAULT_LAMP);
    const w = wallFrameForPanel(f, { distance: 200, yaw: 60, pitch: 0 });
    const window: [number, number][] = [
      [6, 6],
      [94, 6],
      [94, 85],
      [6, 85],
    ];
    const r = feasibleRegion({ frame: f, wall: w, light, window, respectFloor: true, floorY: 0, maxRayLength: 2000 });
    for (const [a, b] of r.wall) {
      expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true);
      expect(length([...wallToWorld(w, a, b)].map((v, i) => v - light[i]) as Vec3)).toBeLessThan(2000 + 1e-6);
    }
  });

  it('fits a square into a square exactly and a wide shape against its limiting edges', () => {
    const region: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const hull: [number, number][] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ];
    const fit = fitConvex(hull, region);
    expect(fit.scale).toBeCloseTo(10, 2);
    expect(fit.centre[0]).toBeCloseTo(5, 1);
    const wide = fitConvex(
      [
        [-1, -0.25],
        [1, -0.25],
        [1, 0.25],
        [-1, 0.25],
      ],
      region,
    );
    expect(wide.scale).toBeCloseTo(5, 2);
  });
});
