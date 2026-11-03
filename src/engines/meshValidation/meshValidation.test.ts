import { describe, expect, it } from 'vitest';
import type { MeshData } from '@/types';
import { validateMesh } from './validateMesh';

function cube(ox = 0, oy = 0, oz = 0, s = 10): MeshData {
  const p = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ].flatMap(([x, y, z]) => [ox + x * s, oy + y * s, oz + z * s]);
  // outward CCW faces
  const f = [
    [0, 2, 1, 0, 3, 2], // z = 0 (−z)
    [4, 5, 6, 4, 6, 7], // z = 1 (+z)
    [0, 1, 5, 0, 5, 4], // y = 0
    [3, 6, 2, 3, 7, 6], // y = 1
    [0, 4, 7, 0, 7, 3], // x = 0
    [1, 2, 6, 1, 6, 5], // x = 1
  ].flat();
  return { positions: new Float32Array(p), indices: new Uint32Array(f) };
}

const merge = (a: MeshData, b: MeshData): MeshData => {
  const off = a.positions.length / 3;
  return {
    positions: new Float32Array([...a.positions, ...b.positions]),
    indices: new Uint32Array([...a.indices, ...Array.from(b.indices, (i) => i + off)]),
  };
};

describe('mesh validation', () => {
  it('passes a closed, outward cube', () => {
    const r = validateMesh('base', cube());
    expect(r.status).toBe('pass');
    expect(r.watertight).toBe(true);
    expect(r.orientationConsistent).toBe(true);
    expect(r.volume).toBeCloseTo(1000, 3);
    expect(r.shells).toBe(1);
    expect(r.selfIntersections).toBe(0);
  });

  it('detects an open mesh', () => {
    const m = cube();
    const r = validateMesh('base', { positions: m.positions, indices: m.indices.slice(0, -3) });
    expect(r.watertight).toBe(false);
    expect(r.boundaryEdges).toBe(3);
    expect(r.status).toBe('fail');
  });

  it('detects a flipped triangle', () => {
    const m = cube();
    const idx = m.indices.slice();
    [idx[1], idx[2]] = [idx[2], idx[1]];
    expect(validateMesh('base', { positions: m.positions, indices: idx }).orientationConsistent).toBe(false);
  });

  it('detects inverted normals via negative volume', () => {
    const m = cube();
    const idx = m.indices.slice();
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    const r = validateMesh('base', { positions: m.positions, indices: idx });
    expect(r.volume).toBeLessThan(0);
    expect(r.status).toBe('fail');
  });

  it('detects floating geometry (multiple shells)', () => {
    const r = validateMesh('front', merge(cube(), cube(50, 0, 0)));
    expect(r.shells).toBe(2);
    expect(r.status).toBe('warn');
  });

  it('detects self-intersections between overlapping shells', () => {
    const r = validateMesh('front', merge(cube(), cube(4, 3, 6)));
    expect(r.selfIntersections).toBeGreaterThan(0);
    expect(r.status).toBe('fail');
  });

  it('detects degenerate triangles and non-finite vertices', () => {
    const m = cube();
    const pos = m.positions.slice();
    pos[0] = NaN;
    const r = validateMesh('base', { positions: pos, indices: m.indices });
    expect(r.invalidVertices).toBe(1);
    expect(r.status).toBe('fail');
  });
});
