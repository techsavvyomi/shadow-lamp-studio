import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '@/engines/defaults';
import { cat, circle, complex, human, silhouetteFromParts, star } from '@/test/fixtures';
import { PANEL_IDS, type DesignConfig, type LampGeometryResult } from '@/types';
import { buildLamp, type LampDesign } from './buildLamp';
import { loadManifold, type ManifoldToplevel } from './manifoldRuntime';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await loadManifold();
});

const design = (patch: Partial<{ [K in keyof DesignConfig]: Partial<DesignConfig[K]> }> = {}): LampDesign => ({
  lamp: { ...DEFAULT_DESIGN.lamp, ...patch.lamp },
  light: { ...DEFAULT_DESIGN.light, ...patch.light },
  projection: { ...DEFAULT_DESIGN.projection, ...patch.projection },
  print: { ...DEFAULT_DESIGN.print, ...patch.print },
});

const expectValid = (r: LampGeometryResult) => {
  for (const v of r.validation) {
    expect(v.issues, `${v.partId}: ${v.issues.join('; ')}`).toEqual([]);
    expect(v.status).toBe('pass');
    expect(v.shells).toBe(1);
  }
  expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
};

const catSil = silhouetteFromParts(cat(), 400, 400);

describe('lamp generation', () => {
  it.each(['shadow', 'light'] as const)('default lamp (%s style): all parts valid, projection faithful', async (style) => {
    const r = await buildLamp(wasm, catSil, design({ projection: { style } }));
    expect(r.parts.map((p) => p.id).sort()).toEqual(['back', 'base', 'front', 'ledHolder', 'left', 'right', 'top']);
    expectValid(r);
    for (const id of PANEL_IDS) {
      expect(r.panels[id].fidelity).not.toBeNull();
      expect(r.panels[id].fidelity!).toBeGreaterThan(0.95);
      expect(r.panels[id].openAreaPct).toBeGreaterThan(1);
    }
  });

  it('generates four distinct panel geometries (off-centre LED, rectangular lamp)', async () => {
    const r = await buildLamp(wasm, catSil, design({ lamp: { width: 120, depth: 90 }, light: { position: [10, 26, -8] } }));
    expectValid(r);
    const sig = PANEL_IDS.map((id) => {
      const d = r.drawings[id];
      const b = d.holesInner.flat();
      return [d.width, Math.min(...b.map((p) => p[0])), Math.max(...b.map((p) => p[1])), r.panels[id].openAreaPct].map((v) => v.toFixed(2)).join('/');
    });
    expect(new Set(sig).size).toBe(4);
  });

  it('8. different lamp dimensions all produce valid, faithful lamps', async () => {
    for (const lamp of [
      { width: 60, depth: 60, height: 80 },
      { width: 150, depth: 110, height: 120, wallThickness: 2.4 },
      { width: 200, depth: 200, height: 160, baseThickness: 4, frameMargin: 10 },
    ]) {
      const r = await buildLamp(wasm, catSil, design({ lamp, light: { position: [0, lamp.height * 0.25, 0] } }), { selfIntersection: false });
      expectValid(r);
      for (const id of PANEL_IDS) expect(r.panels[id].fidelity!).toBeGreaterThan(0.93);
    }
  });

  it('9. different light positions change the geometry and stay faithful', async () => {
    const opens: number[] = [];
    for (const position of [
      [0, 18, 0],
      [0, 40, 0],
      [12, 24, 6],
      [-15, 30, -12],
    ] as [number, number, number][]) {
      const r = await buildLamp(wasm, catSil, design({ light: { position } }), { selfIntersection: false });
      expectValid(r);
      for (const id of PANEL_IDS) expect(r.panels[id].fidelity!).toBeGreaterThan(0.93);
      opens.push(r.panels.front.openAreaPct);
    }
    expect(new Set(opens.map((o) => o.toFixed(2))).size).toBe(opens.length);
  });

  it('single-panel projection leaves the other panels solid', async () => {
    const r = await buildLamp(
      wasm,
      catSil,
      design({ projection: { activePanels: { front: true, back: false, left: false, right: false } } }),
    );
    expectValid(r);
    expect(r.panels.front.openAreaPct).toBeGreaterThan(1);
    for (const id of ['back', 'left', 'right'] as const) {
      expect(r.drawings[id].holesInner).toHaveLength(0);
      const v = r.validation.find((x) => x.partId === id)!;
      expect(v.volume).toBeCloseTo(r.panels[id].width * r.panels[id].height * r.panels[id].thickness, 0);
    }
  });

  it('7. floating islands are bridged so every panel is one printable piece', async () => {
    const c = complex();
    const sil = silhouetteFromParts(c.parts, 400, 400);
    for (const style of ['shadow', 'light'] as const) {
      const r = await buildLamp(wasm, sil, design({ projection: { style } }), { selfIntersection: false });
      expectValid(r);
      expect(r.panels.front.islands).toBeGreaterThan(0);
      expect(r.panels.front.bridges).toBeGreaterThan(0);
      expect(r.panels.front.fidelity!).toBeGreaterThan(0.85);
    }
  });

  it('honours oblique target walls (yaw and pitch)', async () => {
    const r = await buildLamp(wasm, silhouetteFromParts(human(), 400, 400), design({ projection: { wallYaw: 25, wallPitch: 10 } }), {
      selfIntersection: false,
    });
    expectValid(r);
    for (const id of PANEL_IDS) expect(r.panels[id].fidelity!).toBeGreaterThan(0.93);
  });

  it('reports clipping instead of silently producing an impossible projection', async () => {
    const r = await buildLamp(wasm, catSil, design({ projection: { offsetU: 600 } }), { selfIntersection: false });
    expectValid(r);
    expect(r.panels.front.clippedPct).toBeGreaterThan(10);
    expect(r.panels.front.findings.some((f) => f.code === 'clipped')).toBe(true);
  });

  it('clamps an impossible LED position and says so', async () => {
    const r = await buildLamp(wasm, catSil, design({ light: { position: [80, 2, 0] } }), { selfIntersection: false });
    expect(r.findings.some((f) => f.code === 'light-xz')).toBe(true);
    expect(r.findings.some((f) => f.code === 'light-y')).toBe(true);
    expect(Math.abs(r.light[0])).toBeLessThan(40);
  });

  it('reports the penumbra growing with emitter size', async () => {
    const a = await buildLamp(wasm, catSil, design({ light: { emitterSize: 1 } }), { validate: false, fidelity: false });
    const b = await buildLamp(wasm, catSil, design({ light: { emitterSize: 6 } }), { validate: false, fidelity: false });
    expect(b.panels.front.penumbra / a.panels.front.penumbra).toBeCloseTo(6, 1);
  });

  it('works without a silhouette (plain enclosure) and with an inverted silhouette', async () => {
    const plain = await buildLamp(wasm, null, design());
    expectValid(plain);
    const inv = await buildLamp(wasm, { ...silhouetteFromParts([[circle(200, 200, 120)], [star(200, 200, 60, 25, 5)]], 400, 400), invert: true }, design(), {
      selfIntersection: false,
    });
    expectValid(inv);
  });
});
