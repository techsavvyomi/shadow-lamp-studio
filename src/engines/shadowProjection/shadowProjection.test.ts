import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '@/engines/defaults';
import { buildLamp } from '@/engines/lampGeometry/buildLamp';
import { loadManifold } from '@/engines/lampGeometry/manifoldRuntime';
import { dot, sub } from '@/engines/math/vec';
import { panelFrame, wallFrameForPanel, wallToWorld } from '@/engines/projectionGeometry/frames';
import { cat, silhouetteFromParts } from '@/test/fixtures';
import type { Vec3 } from '@/types';
import { cellCentre, rasterizeShadow, type Grid } from './cpuShadow';
import { applyHomogeneous, emitterSamples, shadowMatrix } from './shadowMatrix';

describe('shadow matrix', () => {
  const L: Vec3 = [5, 40, -3];
  const n: Vec3 = [0, 0, -1];
  const p0: Vec3 = [0, 0, 550];

  it('projects points along the light ray onto the receiver plane', () => {
    const S = shadowMatrix(L, n, p0);
    const X: Vec3 = [20, 60, 50];
    const h = applyHomogeneous(S, X);
    expect(h[3]).toBeGreaterThan(0);
    const P: Vec3 = [h[0] / h[3], h[1] / h[3], h[2] / h[3]];
    expect(P[2]).toBeCloseTo(550, 6);
    // collinear with L and X
    const t = (P[2] - L[2]) / (X[2] - L[2]);
    expect(P[0]).toBeCloseTo(L[0] + t * (X[0] - L[0]), 6);
    expect(P[1]).toBeCloseTo(L[1] + t * (X[1] - L[1]), 6);
  });

  it('gives w ≤ 0 for geometry behind the light (cannot shadow the wall)', () => {
    const S = shadowMatrix(L, n, p0);
    expect(applyHomogeneous(S, [0, 40, -50])[3]).toBeLessThan(0);
  });

  it('emitter samples stay inside the emitter disc', () => {
    const s = emitterSamples([0, 0, 0], 4, 32, [1, 0, 0], [0, 1, 0]);
    expect(s).toHaveLength(32);
    for (const p of s) expect(Math.hypot(p[0], p[1])).toBeLessThanOrEqual(2 + 1e-9);
  });
});

describe('reference shadow raster vs. exact ray casting through the mesh', () => {
  it('agrees with manifold ray casts on the real generated lamp (≥ 99% of samples)', async () => {
    const wasm = await loadManifold();
    const sil = silhouetteFromParts(cat(), 400, 400);
    const res = await buildLamp(wasm, sil, DEFAULT_DESIGN, { validate: false, fidelity: false });
    // Rebuild one manifold containing every part for exact ray queries.
    const { Manifold, Mesh } = wasm;
    const all = res.parts.map(
      (p) => new Manifold(new Mesh({ numProp: 3, vertProperties: p.mesh.positions, triVerts: p.mesh.indices })),
    );
    const lamp = Manifold.compose(all);
    const f = panelFrame('front', DEFAULT_DESIGN.lamp);
    const wall = wallFrameForPanel(f, { distance: 500, yaw: 0, pitch: 0 });
    const g: Grid = { minU: -500, maxU: 500, minV: 0, maxV: 900, nu: 70, nv: 63 };
    const occ = rasterizeShadow(
      res.parts.map((p) => p.mesh),
      res.light,
      wall,
      g,
    );
    let agree = 0;
    let lit = 0;
    for (let j = 0; j < g.nv; j++)
      for (let i = 0; i < g.nu; i++) {
        const [a, b] = cellCentre(g, i, j);
        const P = wallToWorld(wall, a, b);
        const blocked = lamp.rayCast(P, res.light).length > 0;
        if (!blocked) lit++;
        if (blocked === !!occ[j * g.nu + i]) agree++;
      }
    expect(lit).toBeGreaterThan(200); // the test is meaningful: plenty of light gets through
    expect(agree / (g.nu * g.nv)).toBeGreaterThan(0.99);
    lamp.delete();
    all.forEach((m) => m.delete());
    expect(dot(sub(res.light, wall.origin), wall.normal)).toBeGreaterThan(0);
  });
});
