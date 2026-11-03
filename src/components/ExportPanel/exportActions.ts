import { renderAssemblyImage } from '@/engines/stlExporter/assemblyImage';
import { buildReport } from '@/engines/stlExporter/report';
import { buildZip, exportAssemblyStl, exportPartStl } from '@/engines/stlExporter/exportStl';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import type { PartId } from '@/types';
import { downloadBlob } from '@/utils';

function state() {
  const { result, geometries } = useGeometryStore.getState();
  if (!result) throw new Error('No geometry generated yet.');
  return { result, geometries, design: useDesignStore.getState().design };
}

export function partStl(id: PartId, printReady: boolean): ArrayBuffer {
  const { result, geometries } = state();
  const part = result.parts.find((p) => p.id === id);
  const geo = geometries[id];
  if (!part || !geo) throw new Error(`Part ${id} is not available.`);
  return exportPartStl(geo, printReady ? part.printTransform : undefined);
}

export function downloadPart(id: PartId, printReady: boolean) {
  const { result } = state();
  const part = result.parts.find((p) => p.id === id)!;
  downloadBlob(partStl(id, printReady), part.fileName, 'model/stl');
}

export function assembledStl(): ArrayBuffer {
  const { result, geometries } = state();
  return exportAssemblyStl(result.parts.map((p) => geometries[p.id]!).filter(Boolean));
}

export function downloadAssembled() {
  downloadBlob(assembledStl(), 'Assembled_Model.stl', 'model/stl');
}

export async function assemblyPng(): Promise<Blob> {
  const { result, geometries, design } = state();
  return renderAssemblyImage(
    result.parts.map((p) => ({ geometry: geometries[p.id]!, explodeDir: p.explodeDir, label: p.fileName })),
    'Giftieverse Shadow Lamp — assembly reference',
    `${design.lamp.width} × ${design.lamp.depth} × ${design.lamp.height} mm · ${design.projection.style} projection · wall at ${design.projection.wallDistance} mm`,
  );
}

export async function downloadAssemblyPng() {
  downloadBlob(await assemblyPng(), 'Assembly_Reference.png', 'image/png');
}

export async function downloadZip(printReady: boolean, includeImage: boolean) {
  const { result, design } = state();
  const files: Record<string, Uint8Array> = {};
  for (const p of result.parts) files[p.fileName] = new Uint8Array(partStl(p.id, printReady));
  files['Assembled_Model.stl'] = new Uint8Array(assembledStl());
  files['REPORT.txt'] = new TextEncoder().encode(buildReport(design, result, printReady));
  files['design.json'] = new TextEncoder().encode(JSON.stringify(design, null, 2));
  if (includeImage) {
    try {
      files['Assembly_Reference.png'] = new Uint8Array(await (await assemblyPng()).arrayBuffer());
    } catch {
      // WebGL unavailable for the offscreen render — ship the rest.
    }
  }
  downloadBlob(buildZip(files) as Uint8Array<ArrayBuffer>, 'Giftieverse_Shadow_Lamp.zip', 'application/zip');
}
