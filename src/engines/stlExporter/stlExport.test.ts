import { beforeAll, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { Box3, Matrix4 } from 'three';
import { DEFAULT_DESIGN } from '@/engines/defaults';
import { buildLamp, projectionFidelity } from '@/engines/lampGeometry/buildLamp';
import { loadManifold } from '@/engines/lampGeometry/manifoldRuntime';
import { validateMesh } from '@/engines/meshValidation/validateMesh';
import { panelFrame, wallFrameForPanel } from '@/engines/projectionGeometry/frames';
import { cat, silhouetteFromParts } from '@/test/fixtures';
import { PANEL_IDS, type LampGeometryResult } from '@/types';
import { buildZip, exportAssemblyStl, exportPartStl, meshDataToGeometry, parseBinaryStl, stlToMeshData } from './exportStl';

let result: LampGeometryResult;
beforeAll(async () => {
  const wasm = await loadManifold();
  result = await buildLamp(wasm, silhouetteFromParts(cat(), 400, 400), DEFAULT_DESIGN, { selfIntersection: false });
});

describe('10. STL export', () => {
  it('exports every part as a valid binary STL in millimetres', () => {
    for (const part of result.parts) {
      const geo = meshDataToGeometry(part.mesh);
      const stl = parseBinaryStl(exportPartStl(geo));
      expect(stl.triangles).toBe(part.mesh.indices.length / 3);
      const report = validateMesh(part.id, stlToMeshData(stl), { selfIntersection: false });
      expect(report.issues).toEqual([]);
      // assembly coordinates are in mm: the lamp fits in its configured footprint
      for (let i = 0; i < stl.positions.length; i += 3) {
        expect(Math.abs(stl.positions[i])).toBeLessThanOrEqual(DEFAULT_DESIGN.lamp.width / 2 + 1e-3);
        expect(stl.positions[i + 1]).toBeGreaterThanOrEqual(-1e-3);
        expect(stl.positions[i + 1]).toBeLessThanOrEqual(DEFAULT_DESIGN.lamp.height + 1e-3);
      }
    }
  });

  it('print transforms lay every part flat on the bed (z ≥ 0, touching z = 0) without mirroring', () => {
    for (const part of result.parts) {
      const m = new Matrix4().fromArray(part.printTransform);
      expect(m.determinant()).toBeCloseTo(1, 6);
      const geo = meshDataToGeometry(part.mesh).applyMatrix4(m);
      const box = new Box3().setFromBufferAttribute(geo.getAttribute('position') as never);
      expect(box.min.z).toBeCloseTo(0, 3);
      if (PANEL_IDS.includes(part.id as never)) expect(box.max.z).toBeCloseTo(DEFAULT_DESIGN.lamp.wallThickness, 3);
      const stl = parseBinaryStl(exportPartStl(meshDataToGeometry(part.mesh), part.printTransform));
      const v = validateMesh(part.id, stlToMeshData(stl), { selfIntersection: false });
      expect(v.volume).toBeGreaterThan(0);
    }
  });

  it('assembled STL contains every part; ZIP round-trips', () => {
    const geos = result.parts.map((p) => meshDataToGeometry(p.mesh));
    const asm = parseBinaryStl(exportAssemblyStl(geos));
    expect(asm.triangles).toBe(result.parts.reduce((s, p) => s + p.mesh.indices.length / 3, 0));
    const files: Record<string, Uint8Array> = {};
    for (const p of result.parts) files[p.fileName] = new Uint8Array(exportPartStl(meshDataToGeometry(p.mesh), p.printTransform));
    const unz = unzipSync(buildZip(files));
    expect(Object.keys(unz).sort()).toEqual(Object.keys(files).sort());
    expect(unz['Front_Panel.stl'].byteLength).toBe(files['Front_Panel.stl'].byteLength);
  });

  it('reference test: the exported STL casts the same shadow the preview engine computes', () => {
    // Export → parse the STL bytes → shadow-project those triangles → compare with the target.
    const exported = result.parts.map((p) => stlToMeshData(parseBinaryStl(exportPartStl(meshDataToGeometry(p.mesh)))));
    for (const id of PANEL_IDS) {
      const pa = result.panels[id];
      const wall = wallFrameForPanel(panelFrame(id, DEFAULT_DESIGN.lamp), {
        distance: DEFAULT_DESIGN.projection.wallDistance,
        yaw: 0,
        pitch: 0,
      });
      const fromStl = projectionFidelity(exported, result.light, wall, pa.placement!, DEFAULT_DESIGN.projection.style, 200);
      expect(fromStl).toBeGreaterThan(0.95);
      expect(Math.abs(fromStl - pa.fidelity!)).toBeLessThan(0.005);
    }
  });
});
