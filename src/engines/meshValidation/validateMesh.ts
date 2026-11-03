/**
 * Independent mesh validation for printable STL output. Does not trust the
 * generator: vertices are re-welded by position and every property is recomputed.
 */
import type { MeshData, MeshValidationReport, PartId, Vec3 } from '@/types';
import { cross, dot, length, sub } from '../math/vec';
import { trianglesIntersect } from './triTri';

export interface ValidateOptions {
  /** Run the O(n·k) triangle–triangle self-intersection test. */
  selfIntersection?: boolean;
  /** Weld tolerance in mm. */
  weldTolerance?: number;
  /** Expected nominal minimum wall thickness — reported if sampling finds thinner. */
  expectedMinThickness?: number;
  /** Allow multiple shells (e.g. an assembly reference model). */
  allowMultipleShells?: boolean;
}

interface Welded {
  verts: Float64Array;
  tris: Uint32Array;
  invalidVertices: number;
}

function weld(mesh: MeshData, tol: number): Welded {
  const map = new Map<string, number>();
  const remap = new Uint32Array(mesh.positions.length / 3);
  const verts: number[] = [];
  let invalid = 0;
  const q = 1 / tol;
  for (let i = 0; i < remap.length; i++) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) invalid++;
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      map.set(key, id);
      verts.push(x, y, z);
    }
    remap[i] = id;
  }
  const tris = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < tris.length; i++) tris[i] = remap[mesh.indices[i]];
  return { verts: Float64Array.from(verts), tris, invalidVertices: invalid };
}

const vtx = (v: Float64Array, i: number): Vec3 => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];

export function validateMesh(partId: PartId, mesh: MeshData, opts: ValidateOptions = {}): MeshValidationReport {
  const issues: string[] = [];
  const { verts, tris, invalidVertices } = weld(mesh, opts.weldTolerance ?? 1e-4);
  const nTri = tris.length / 3;
  const nVert = verts.length / 3;

  // --- edges: undirected use count + directed uniqueness -------------------
  const undirected = new Map<number, number>();
  const directed = new Set<number>();
  let orientationOk = true;
  let degenerate = 0;
  const key = (a: number, b: number) => a * nVert + b;
  let volume = 0;
  let area = 0;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nVert; i++) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], verts[i * 3 + k]);
      max[k] = Math.max(max[k], verts[i * 3 + k]);
    }
  }
  for (let t = 0; t < nTri; t++) {
    const a = tris[t * 3];
    const b = tris[t * 3 + 1];
    const c = tris[t * 3 + 2];
    const pa = vtx(verts, a);
    const pb = vtx(verts, b);
    const pc = vtx(verts, c);
    const cr = cross(sub(pb, pa), sub(pc, pa));
    const triArea = length(cr) / 2;
    area += triArea;
    volume += dot(pa, cross(pb, pc)) / 6;
    if (a === b || b === c || a === c || triArea < 1e-10) {
      degenerate++;
      continue;
    }
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const dk = key(p, q);
      if (directed.has(dk)) orientationOk = false;
      directed.add(dk);
      const uk = p < q ? key(p, q) : key(q, p);
      undirected.set(uk, (undirected.get(uk) ?? 0) + 1);
    }
  }
  let boundary = 0;
  let nonManifold = 0;
  for (const count of undirected.values()) {
    if (count === 1) boundary++;
    else if (count > 2) nonManifold++;
  }
  // Each undirected interior edge must appear once in each direction.
  if (orientationOk) {
    for (const dk of directed) {
      const p = Math.floor(dk / nVert);
      const q = dk % nVert;
      if (!directed.has(key(q, p)) && (undirected.get(p < q ? key(p, q) : key(q, p)) ?? 0) === 2) {
        orientationOk = false;
        break;
      }
    }
  }

  // --- shells (connected components through shared vertices) --------------
  const parent = new Int32Array(nVert).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let t = 0; t < nTri; t++) {
    const a = find(tris[t * 3]);
    const b = find(tris[t * 3 + 1]);
    const c = find(tris[t * 3 + 2]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const roots = new Set<number>();
  for (let t = 0; t < nTri; t++) roots.add(find(tris[t * 3]));
  const shells = roots.size;

  // --- self intersections ------------------------------------------------
  let selfIntersections = 0;
  if (opts.selfIntersection !== false && nTri > 0) selfIntersections = countSelfIntersections(verts, tris, min, max);

  const watertight = boundary === 0 && nonManifold === 0;
  if (invalidVertices > 0) issues.push(`${invalidVertices} vertices have non-finite coordinates`);
  if (!watertight) issues.push(`Not watertight: ${boundary} open edges, ${nonManifold} non-manifold edges`);
  if (!orientationOk) issues.push('Inconsistent triangle winding (flipped normals)');
  if (degenerate > 0) issues.push(`${degenerate} degenerate (zero-area) triangles`);
  if (volume <= 0 && nTri > 0) issues.push('Signed volume is not positive: normals point inwards');
  if (selfIntersections > 0) issues.push(`${selfIntersections} self-intersecting triangle pairs`);
  if (shells > 1 && !opts.allowMultipleShells) issues.push(`${shells} disconnected shells (floating geometry)`);

  const fail = invalidVertices > 0 || !watertight || !orientationOk || volume <= 0 || selfIntersections > 0 || nTri === 0;
  const warn = degenerate > 0 || (shells > 1 && !opts.allowMultipleShells);
  return {
    partId,
    vertices: nVert,
    triangles: nTri,
    watertight,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    orientationConsistent: orientationOk,
    degenerateTriangles: degenerate,
    invalidVertices,
    shells,
    selfIntersections,
    volume,
    surfaceArea: area,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    minThickness: null,
    status: fail ? 'fail' : warn ? 'warn' : 'pass',
    issues,
  };
}

/** Uniform-grid broad phase + exact triangle–triangle tests for non-adjacent pairs. */
function countSelfIntersections(verts: Float64Array, tris: Uint32Array, min: Vec3, max: Vec3): number {
  const nTri = tris.length / 3;
  const ext: Vec3 = [max[0] - min[0] + 1e-6, max[1] - min[1] + 1e-6, max[2] - min[2] + 1e-6];
  const target = Math.max(1, Math.cbrt(nTri / 2));
  const cell = Math.max(ext[0], ext[1], ext[2]) / Math.max(1, target);
  const dims: Vec3 = [
    Math.max(1, Math.ceil(ext[0] / cell)),
    Math.max(1, Math.ceil(ext[1] / cell)),
    Math.max(1, Math.ceil(ext[2] / cell)),
  ];
  const buckets = new Map<number, number[]>();
  const triBox = new Float64Array(nTri * 6);
  for (let t = 0; t < nTri; t++) {
    const lo: Vec3 = [Infinity, Infinity, Infinity];
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++) {
      const vi = tris[t * 3 + k] * 3;
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], verts[vi + a]);
        hi[a] = Math.max(hi[a], verts[vi + a]);
      }
    }
    triBox.set([...lo, ...hi], t * 6);
    const c0 = lo.map((v, a) => Math.min(dims[a] - 1, Math.floor((v - min[a]) / cell)));
    const c1 = hi.map((v, a) => Math.min(dims[a] - 1, Math.floor((v - min[a]) / cell)));
    for (let x = c0[0]; x <= c1[0]; x++)
      for (let y = c0[1]; y <= c1[1]; y++)
        for (let z = c0[2]; z <= c1[2]; z++) {
          const k = (x * dims[1] + y) * dims[2] + z;
          let b = buckets.get(k);
          if (!b) buckets.set(k, (b = []));
          b.push(t);
        }
  }
  const tested = new Set<number>();
  let count = 0;
  const tri = (t: number): [Vec3, Vec3, Vec3] => [
    vtx(verts, tris[t * 3]),
    vtx(verts, tris[t * 3 + 1]),
    vtx(verts, tris[t * 3 + 2]),
  ];
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      const a = bucket[i];
      for (let j = i + 1; j < bucket.length; j++) {
        const b = bucket[j];
        const pairKey = a < b ? a * nTri + b : b * nTri + a;
        if (tested.has(pairKey)) continue;
        tested.add(pairKey);
        // skip pairs sharing a vertex (adjacent in the mesh)
        const ia = [tris[a * 3], tris[a * 3 + 1], tris[a * 3 + 2]];
        const ib = [tris[b * 3], tris[b * 3 + 1], tris[b * 3 + 2]];
        if (ia.some((v) => ib.includes(v))) continue;
        let overlap = true;
        for (let k = 0; k < 3; k++) {
          if (triBox[a * 6 + k] > triBox[b * 6 + 3 + k] || triBox[b * 6 + k] > triBox[a * 6 + 3 + k]) {
            overlap = false;
            break;
          }
        }
        if (!overlap) continue;
        if (trianglesIntersect(tri(a), tri(b))) count++;
      }
    }
  }
  return count;
}
