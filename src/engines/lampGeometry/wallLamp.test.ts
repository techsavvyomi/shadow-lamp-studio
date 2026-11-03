import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN, DEFAULT_MOUNTING, WALL_PRESET } from '@/engines/defaults';
import { transformPoint } from '@/engines/math/vec';
import { lampWorldMatrix, mountingWallFrame } from '@/engines/projectionGeometry/mounting';
import { wallToWorld } from '@/engines/projectionGeometry/frames';
import { cellCentre, rasterizeShadow, type Grid } from '@/engines/shadowProjection/cpuShadow';
import { cat, complex, human, silhouetteFromParts } from '@/test/fixtures';
import { PANEL_IDS, type LampGeometryResult, type MountingConfig } from '@/types';
import { buildLamp, type LampDesign } from './buildLamp';
import { loadManifold, type ManifoldToplevel } from './manifoldRuntime';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await loadManifold();
});

const wallDesign = (patch: { mounting?: Partial<MountingConfig>; light?: Partial<LampDesign['light']>; projection?: Partial<LampDesign['projection']>; lamp?: Partial<LampDesign['lamp']> } = {}): LampDesign => ({
  lamp: { ...WALL_PRESET.lamp, ...patch.lamp },
  light: { ...WALL_PRESET.light, ...patch.light },
  projection: { ...DEFAULT_DESIGN.projection, ...WALL_PRESET.projection, ...patch.projection },
  print: DEFAULT_DESIGN.print,
  mounting: { ...DEFAULT_MOUNTING, type: 'wall', ...patch.mounting },
});

const expectValid = (r: LampGeometryResult) => {
  for (const v of r.validation) {
    expect(v.issues, `${v.partId}: ${v.issues.join('; ')}`).toEqual([]);
    expect(v.shells).toBe(1);
  }
  expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
};

describe('wall lamp (one silhouette on the mounting wall)', () => {
  it('maps lamp coordinates onto the wall: plate on z = 0, lamp +z pointing down', () => {
    const m = lampWorldMatrix('wall', 1500);
    expect(transformPoint(m, [0, 0, 0])).toEqual([0, 1500, 0]);
    const out = transformPoint(m, [0, 80, 0]);
    expect(out[2]).toBeCloseTo(80, 9); // lamp +y → into the room
    expect(transformPoint(m, [0, 0, 100])[1]).toBeCloseTo(1400, 9); // lamp +z → down
    const w = mountingWallFrame();
    // wall frame "up" (b) is world up
    const p = transformPoint(m, wallToWorld(w, 0, 200));
    expect(p[1]).toBeCloseTo(1700, 9);
  });

  it('builds valid parts and casts the figure faithfully around the lamp', async () => {
    const r = await buildLamp(wasm, silhouetteFromParts(cat(), 400, 400), wallDesign());
    expect(r.mounting).toBe('wall');
    expect(r.parts.map((p) => p.fileName).sort()).toEqual(['LED_Post.stl', 'Left_Wall.stl', 'Lower_Wall.stl', 'Right_Wall.stl', 'Upper_Wall.stl', 'Wall_Plate.stl']);
    expectValid(r);
    const f = r.figure!;
    expect(f.fidelity!).toBeGreaterThan(0.93);
    expect(f.lampCoveredPct).toBeGreaterThan(95);
    // the figure is far larger than the lamp (a halo projection)
    expect(Math.max(f.width, f.height)).toBeGreaterThan(3 * WALL_PRESET.lamp.depth);
    for (const id of PANEL_IDS) if (r.panels[id].placement) expect(r.panels[id].fidelity!).toBeGreaterThan(0.9);
  });

  it('agrees with exact ray casting from the LED through the real mesh to the wall', async () => {
    const r = await buildLamp(wasm, silhouetteFromParts(human(), 400, 400), wallDesign(), { validate: false, fidelity: false });
    const { Manifold, Mesh } = wasm;
    const all = r.parts.map((p) => new Manifold(new Mesh({ numProp: 3, vertProperties: p.mesh.positions, triVerts: p.mesh.indices })));
    const lamp = Manifold.compose(all);
    const wall = mountingWallFrame();
    const reach = r.figure!.reach;
    const g: Grid = {
      minU: Math.min(...reach.map((p) => p[0])),
      maxU: Math.max(...reach.map((p) => p[0])),
      minV: Math.min(...reach.map((p) => p[1])),
      maxV: Math.max(...reach.map((p) => p[1])),
      nu: 60,
      nv: 70,
    };
    const occ = rasterizeShadow(
      r.parts.map((p) => p.mesh),
      r.light,
      wall,
      g,
    );
    let agree = 0;
    let lit = 0;
    for (let j = 0; j < g.nv; j++)
      for (let i = 0; i < g.nu; i++) {
        const [a, b] = cellCentre(g, i, j);
        // start 0.01 mm in front of the wall so the plate face itself is not a hit
        const P = wallToWorld(wall, a, b);
        P[1] += 0.01;
        const blocked = lamp.rayCast(P, r.light).length > 0;
        if (!blocked) lit++;
        if (blocked === !!occ[j * g.nu + i]) agree++;
      }
    expect(lit).toBeGreaterThan(300);
    expect(agree / (g.nu * g.nv)).toBeGreaterThan(0.98);
    lamp.delete();
    all.forEach((m) => m.delete());
  });

  it('holds detached parts of the figure with struts down to the base strip', async () => {
    const r = await buildLamp(wasm, silhouetteFromParts(complex().parts, 400, 400), wallDesign(), { selfIntersection: false });
    expectValid(r);
    const bridged = PANEL_IDS.reduce((s, id) => s + r.panels[id].bridges, 0);
    expect(bridged).toBeGreaterThan(0);
  });

  it('adds keyhole slots to the wall plate and a longer LED post', async () => {
    const withKeys = await buildLamp(wasm, null, wallDesign(), { selfIntersection: false });
    const without = await buildLamp(wasm, null, wallDesign({ mounting: { keyholes: false } }), { selfIntersection: false });
    expectValid(withKeys);
    const vol = (r: LampGeometryResult, id: string) => r.validation.find((v) => v.partId === id)!.volume;
    expect(vol(withKeys, 'base')).toBeLessThan(vol(without, 'base') - 50);
    const post = withKeys.validation.find((v) => v.partId === 'ledHolder')!;
    expect(post.size[1]).toBeGreaterThan(60);
    expect(withKeys.parts.some((p) => p.id === 'top')).toBe(false);
  });

  it('side walls rising closer to the LED reach further; mounted low the figure stays off the floor', async () => {
    // reach ∝ y_L / (y_L − wall height): taller walls (or a shorter post) throw the figure further
    const low = await buildLamp(wasm, silhouetteFromParts(cat(), 400, 400), wallDesign({ lamp: { height: 55 } }), { validate: false, fidelity: false });
    const tall = await buildLamp(wasm, silhouetteFromParts(cat(), 400, 400), wallDesign({ lamp: { height: 78 } }), { validate: false, fidelity: false });
    expect(tall.figure!.height).toBeGreaterThan(1.5 * low.figure!.height);
    const nearFloor = await buildLamp(wasm, silhouetteFromParts(cat(), 400, 400), wallDesign({ mounting: { height: 300 } }), { validate: false, fidelity: false });
    for (const [, b] of nearFloor.figure!.target.flat()) expect(300 + b).toBeGreaterThanOrEqual(9.9);
    expect(nearFloor.findings.some((f) => f.code === 'room')).toBe(true);
  });

  it('warns about a forward-facing LED and a lamp body outside the figure', async () => {
    const r = await buildLamp(wasm, silhouetteFromParts(cat(), 400, 400), wallDesign({ light: { pattern: 'lambertian-up' }, projection: { offsetU: 260 } }), {
      validate: false,
      fidelity: false,
    });
    expect(r.findings.some((f) => f.code === 'led-direction')).toBe(true);
    expect(r.findings.some((f) => f.code === 'lamp-outside')).toBe(true);
  });
});
