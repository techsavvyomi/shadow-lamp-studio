/**
 * STL export. Uses three.js STLExporter on the *same* BufferGeometry instances the
 * 3D preview renders, so what you inspect is byte-for-byte what you print.
 */
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { zipSync } from 'fflate';
import type { Mat4, MeshData } from '@/types';

/**
 * Indexed BufferGeometry from engine mesh data (shared by preview and export).
 * Buffers are copied so in-place geometry operations can never corrupt the
 * engine's result arrays.
 */
export function meshDataToGeometry(mesh: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(mesh.positions.slice(), 3));
  g.setIndex(new BufferAttribute(mesh.indices.slice(), 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const material = new MeshBasicMaterial();

function exportObject(obj: Object3D): ArrayBuffer {
  obj.updateMatrixWorld(true);
  const view = new STLExporter().parse(obj, { binary: true }) as unknown as DataView;
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

/** Binary STL of one part, optionally re-posed (e.g. into print orientation). */
export function exportPartStl(geometry: BufferGeometry, transform?: Mat4): ArrayBuffer {
  const mesh = new Mesh(geometry, material);
  if (transform) {
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(new Matrix4().fromArray(transform));
  }
  return exportObject(mesh);
}

/** Binary STL containing every part in assembly position (reference model, multiple bodies). */
export function exportAssemblyStl(geometries: BufferGeometry[]): ArrayBuffer {
  const group = new Group();
  for (const g of geometries) group.add(new Mesh(g, material));
  return exportObject(group);
}

export interface ParsedStl {
  triangles: number;
  positions: Float32Array;
  normals: Float32Array;
}

export function parseBinaryStl(buf: ArrayBuffer): ParsedStl {
  const dv = new DataView(buf);
  const n = dv.getUint32(80, true);
  if (84 + n * 50 !== buf.byteLength) throw new Error('Corrupt binary STL (size mismatch)');
  const positions = new Float32Array(n * 9);
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50;
    for (let k = 0; k < 3; k++) normals[i * 3 + k] = dv.getFloat32(o + k * 4, true);
    for (let k = 0; k < 9; k++) positions[i * 9 + k] = dv.getFloat32(o + 12 + k * 4, true);
  }
  return { triangles: n, positions, normals };
}

/** Un-indexed STL triangles back to MeshData (for round-trip verification). */
export function stlToMeshData(stl: ParsedStl): MeshData {
  const indices = new Uint32Array(stl.triangles * 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions: stl.positions, indices };
}

export function buildZip(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 6 });
}
