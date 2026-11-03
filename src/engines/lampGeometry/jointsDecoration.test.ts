/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'opentype.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_DECORATION, DEFAULT_DESIGN, DEFAULT_MOUNTING, WALL_PRESET } from '@/engines/defaults';
import { iconArt, textArt } from '@/engines/decoration/plateArt';
import { cat, silhouetteFromParts } from '@/test/fixtures';
import { PANEL_IDS, type DecorationFont, type LampGeometryResult, type MeshData, type PlateDecoration, type SilhouetteData } from '@/types';
import { buildLamp, type LampDesign } from './buildLamp';
import { loadManifold, type Manifold, type ManifoldToplevel } from './manifoldRuntime';
import { keyholeLayout } from './structure';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await loadManifold();
});

const FONT_FILES: Record<DecorationFont, string> = {
  bold: 'lilita-one/files/lilita-one-latin-400-normal.woff',
  spooky: 'creepster/files/creepster-latin-400-normal.woff',
  script: 'pacifico/files/pacifico-latin-400-normal.woff',
};
const loadFont = (f: DecorationFont) => {
  const b = readFileSync(resolve('node_modules/@fontsource', FONT_FILES[f]));
  return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

const tableDesign = (): LampDesign => ({ ...DEFAULT_DESIGN });
const wallDesign = (decoration: Partial<PlateDecoration> = {}, lamp: Partial<LampDesign['lamp']> = {}): LampDesign => ({
  lamp: { ...WALL_PRESET.lamp, ...lamp },
  light: { ...WALL_PRESET.light },
  projection: { ...DEFAULT_DESIGN.projection, ...WALL_PRESET.projection },
  print: DEFAULT_DESIGN.print,
  mounting: { ...DEFAULT_MOUNTING, type: 'wall' },
  decoration: { ...DEFAULT_DECORATION, ...decoration },
});

const toManifold = (m: MeshData): Manifold => new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const part = (r: LampGeometryResult, id: string) => r.parts.find((p) => p.id === id)!;
const minY = (m: MeshData) => {
  let y = Infinity;
  for (let i = 1; i < m.positions.length; i += 3) y = Math.min(y, m.positions[i]);
  return y;
};
const overlap = (a: MeshData, b: MeshData) => {
  const ma = toManifold(a);
  const mb = toManifold(b);
  const i = ma.intersect(mb);
  const v = i.volume();
  [ma, mb, i].forEach((x) => x.delete());
  return v;
};
const expectValid = (r: LampGeometryResult) => {
  for (const v of r.validation) {
    expect(v.issues, `${v.partId}: ${v.issues.join('; ')}`).toEqual([]);
    expect(v.shells).toBe(1);
  }
  expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
};

describe('finger joints between the walls and the plate', () => {
  for (const kind of ['table', 'wall'] as const) {
    it(`${kind} lamp: tabs reach into the plate, nothing overlaps once assembled, all parts valid`, async () => {
      const design = kind === 'table' ? tableDesign() : wallDesign();
      const r = await buildLamp(wasm, silhouetteFromParts(cat(), 400, 400), design);
      expectValid(r);
      const tb = design.lamp.baseThickness;
      const base = part(r, 'base').mesh;
      for (const id of PANEL_IDS) {
        const m = part(r, id).mesh;
        expect(minY(m), `${id} tabs`).toBeCloseTo(0.3, 3); // tabs stop 0.3 mm short of the plate's back
        expect(r.drawings[id].tabs.length).toBeGreaterThanOrEqual(2);
        expect(overlap(m, base), `${id} ∩ plate`).toBeLessThan(1e-3);
      }
      // without joints the walls simply stand on the plate
      const plain = await buildLamp(wasm, silhouetteFromParts(cat(), 400, 400), { ...design, lamp: { ...design.lamp, fingerJoints: false } }, { validate: false, fidelity: false });
      for (const id of PANEL_IDS) expect(minY(part(plain, id).mesh)).toBeCloseTo(tb, 3);
      // and the shadow is unchanged by the joints
      if (kind === 'table') for (const id of PANEL_IDS) expect(r.panels[id].fidelity!).toBeGreaterThan(0.95);
      else expect(r.figure!.fidelity!).toBeGreaterThan(0.93);
    });
  }

  it('keeps the cable groove exit clear of tabs', async () => {
    const r = await buildLamp(wasm, null, wallDesign(), { validate: false, fidelity: false });
    // wall lamp: groove leaves through the lower edge (front panel) under the LED (x = 0 → local x = W/2)
    const W = WALL_PRESET.lamp.width;
    for (const t of r.drawings.front.tabs) {
      const x0 = Math.min(...t.map((p) => p[0]));
      const x1 = Math.max(...t.map((p) => p[0]));
      expect(x1 < W / 2 - 3 || x0 > W / 2 + 3).toBe(true);
    }
  });
});

describe('wall plate decoration (raised relief)', () => {
  const sil = () => silhouetteFromParts(cat(), 400, 400);

  it('plain plate has no relief and the figure does not depend on the decoration', async () => {
    const plain = await buildLamp(wasm, sil(), wallDesign());
    expect(plain.plate!.decoration).toEqual([]);
    expect(plain.plate!.plate.length).toBeGreaterThan(1); // outline + keyholes + wire hole
    const moon = await buildLamp(wasm, sil(), wallDesign({ kind: 'silhouette', icon: 'moon' }), {}, iconArt('moon'));
    expectValid(moon);
    expect(moon.plate!.decoration.length).toBeGreaterThan(0);
    expect(moon.figure!.fidelity!).toBeCloseTo(plain.figure!.fidelity!, 2);
    const vol = (r: LampGeometryResult) => {
      const m = toManifold(part(r, 'base').mesh);
      const v = m.volume();
      m.delete();
      return v;
    };
    expect(vol(moon) - vol(plain)).toBeGreaterThan(100); // mm³ of relief
  });

  for (const position of ['below', 'above', 'behind'] as const) {
    it(`relief ${position} the LED stays clear of the post, the walls and the screw heads`, async () => {
      const design = wallDesign({ kind: 'silhouette', icon: 'star', position, size: 1 });
      const r = await buildLamp(wasm, sil(), design, {}, iconArt('star'));
      expectValid(r);
      const plate = r.plate!;
      const pts = plate.decoration.flat();
      expect(pts.length).toBeGreaterThan(0);
      const k = keyholeLayout(design.lamp, design.print, design.mounting!);
      for (const p of pts) {
        expect(Math.hypot(p[0] - plate.led[0], p[1] - plate.led[1])).toBeGreaterThan(plate.postRadius - 0.05);
        for (const sx of [-1, 1]) {
          const inU = Math.abs(p[0] - sx * k.kx) < k.rHead + 1.9;
          const inV = p[1] > -(k.kz + k.rHead) - 1.9 && p[1] < -(k.kz - k.slotLen) + k.rHead + 1.9;
          expect(inU && inV, `point ${p} on keyhole`).toBe(false);
        }
        if (position === 'below') expect(p[1]).toBeLessThan(plate.led[1]);
        if (position === 'above') expect(p[1]).toBeGreaterThan(plate.led[1]);
      }
      // the relief never touches the side walls or the LED post
      for (const id of [...PANEL_IDS, 'ledHolder']) expect(overlap(part(r, id).mesh, part(r, 'base').mesh), id).toBeLessThan(1e-3);
    });
  }

  for (const font of ['bold', 'spooky', 'script'] as const) {
    it(`text in the ${font} font becomes a valid relief`, async () => {
      const art = textArt(loadFont(font), 'Boo!\nHappy Halloween');
      expect(art).not.toBeNull();
      const r = await buildLamp(wasm, sil(), wallDesign({ kind: 'text', font, text: 'Boo!\nHappy Halloween' }), { fidelity: false }, art);
      expectValid(r);
      const b = r.plate!.decoration.flat();
      const w = Math.max(...b.map((p) => p[0])) - Math.min(...b.map((p) => p[0]));
      expect(w).toBeGreaterThan(50); // fills most of the plate's width
    });
  }

  it('lays out text lines centred under each other', () => {
    const one = textArt(loadFont('bold'), 'BOO')!;
    const two = textArt(loadFont('bold'), 'BOO\nBOO')!;
    expect(two.frame.h).toBeGreaterThan(1.9 * one.frame.h);
    expect(two.frame.w).toBeCloseTo(one.frame.w, 0);
    expect(textArt(loadFont('bold'), '  \n ')).toBeNull();
  });

  it('uses the lamp figure itself and warns when there is nothing to show', async () => {
    const figure: SilhouetteData = sil();
    const r = await buildLamp(wasm, figure, wallDesign({ kind: 'silhouette', icon: 'figure' }), { fidelity: false }, figure);
    expectValid(r);
    expect(r.plate!.decoration.length).toBeGreaterThan(0);
    const empty = await buildLamp(wasm, figure, wallDesign({ kind: 'text', text: '' }), { validate: false, fidelity: false }, null);
    expect(empty.findings.some((f) => f.code === 'decoration-empty')).toBe(true);
    // the relief lies inside the area the plate reserves for it
    const deco = new wasm.CrossSection(r.plate!.decoration, 'EvenOdd');
    const area = new wasm.CrossSection(r.plate!.area, 'EvenOdd');
    const outside = deco.subtract(area);
    expect(outside.area() / deco.area()).toBeLessThan(1e-3);
    [deco, area, outside].forEach((x) => x.delete());
  });
});
