/**
 * Offscreen, labelled exploded-assembly reference image (browser only). Uses its
 * own short-lived WebGL context so it never disturbs the interactive viewport.
 */
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Vec3 } from '@/types';

export interface AssemblyPart {
  geometry: BufferGeometry;
  explodeDir: Vec3;
  label: string;
}

export async function renderAssemblyImage(parts: AssemblyPart[], title: string, subtitle: string, width = 1600, height = 1100): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  const scene = new Scene();
  scene.background = new Color('#0f1218');
  scene.add(new AmbientLight('#ffffff', 0.9));
  const key = new DirectionalLight('#fff4e6', 2.4);
  key.position.set(300, 500, 400);
  scene.add(key);
  const rim = new DirectionalLight('#9db5ff', 0.9);
  rim.position.set(-400, 200, -300);
  scene.add(rim);

  const mat = new MeshStandardMaterial({ color: '#e7e3da', roughness: 0.7, flatShading: true });
  const edgeMat = new LineBasicMaterial({ color: '#1a1c22' });
  const box = new Box3();
  const anchors: { label: string; pos: Vector3 }[] = [];
  const disposables: { dispose(): void }[] = [mat, edgeMat];
  for (const p of parts) {
    const offset = new Vector3(...p.explodeDir).multiplyScalar(70);
    const mesh = new Mesh(p.geometry, mat);
    mesh.position.copy(offset);
    scene.add(mesh);
    const edges = new EdgesGeometry(p.geometry, 25);
    disposables.push(edges);
    const lines = new LineSegments(edges, edgeMat);
    lines.position.copy(offset);
    scene.add(lines);
    p.geometry.computeBoundingBox();
    const b = p.geometry.boundingBox!.clone().translate(offset);
    box.union(b);
    anchors.push({ label: p.label, pos: b.getCenter(new Vector3()) });
  }
  const centre = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3()).length();
  const camera = new PerspectiveCamera(32, width / height, 1, 10000);
  camera.position.copy(centre).add(new Vector3(0.95, 0.75, 1.1).normalize().multiplyScalar(size * 1.55));
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  renderer.render(scene, camera);

  // 2D compositing: labels with leader lines
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  ctx.font = '600 30px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#ffd27a';
  ctx.fillText(title, 48, 72);
  ctx.font = '400 20px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#8a93a8';
  ctx.fillText(subtitle, 48, 104);
  ctx.font = '500 19px ui-monospace, monospace';
  for (const a of anchors) {
    const s = a.pos.clone().project(camera);
    const x = (s.x * 0.5 + 0.5) * width;
    const y = (-s.y * 0.5 + 0.5) * height;
    const dx = x > width / 2 ? 90 : -90;
    const lx = x + dx;
    const ly = y - 40;
    ctx.strokeStyle = 'rgba(255, 210, 122, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.moveTo(x, y);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    const w = ctx.measureText(a.label).width + 16;
    const bx = dx > 0 ? lx : lx - w;
    ctx.fillStyle = 'rgba(15, 18, 24, 0.88)';
    ctx.fillRect(bx, ly - 16, w, 28);
    ctx.strokeRect(bx, ly - 16, w, 28);
    ctx.fillStyle = '#dfe4ee';
    ctx.fillText(a.label, bx + 8, ly + 5);
  }
  const blob = await new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  disposables.forEach((d) => d.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
  return blob;
}
