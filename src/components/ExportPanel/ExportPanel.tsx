import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileArchive, FileBox, Image as ImageIcon, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { SubHeading, ToggleField } from '@/components/common/Fields';
import { Badge, Button, Dialog, DialogContent } from '@/components/ui/primitives';
import { useGeometryStore } from '@/stores/geometryStore';
import { useViewStore } from '@/stores/viewStore';
import type { MeshValidationReport } from '@/types';
import { cn, fmt } from '@/utils';
import { downloadAssembled, downloadAssemblyPng, downloadPart, downloadZip } from './exportActions';

function overall(v: MeshValidationReport[]) {
  if (!v.length) return 'none' as const;
  if (v.some((x) => x.status === 'fail')) return 'fail' as const;
  if (v.some((x) => x.status === 'warn')) return 'warn' as const;
  return 'pass' as const;
}

function useAsync() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => unknown) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

export function ValidationTable({ reports }: { reports: MeshValidationReport[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-700">
      <table className="w-full min-w-[620px] text-[11.5px]">
        <thead className="bg-ink-800 text-ink-400">
          <tr>
            {['Part', 'Status', 'Triangles', 'Watertight', 'Winding', 'Shells', 'Self-int.', 'Volume', 'Size (mm)'].map((h) => (
              <th key={h} className="px-2.5 py-2 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reports.map((v) => (
            <tr key={v.partId} className="border-t border-ink-700/70 align-top">
              <td className="px-2.5 py-2 font-medium text-ink-100">{v.partId}</td>
              <td className="px-2.5 py-2">
                <Badge tone={v.status === 'pass' ? 'ok' : v.status === 'warn' ? 'warn' : 'bad'}>{v.status}</Badge>
              </td>
              <td className="num px-2.5 py-2 text-ink-300">{v.triangles.toLocaleString()}</td>
              <td className={cn('px-2.5 py-2', v.watertight ? 'text-ok' : 'text-bad')}>{v.watertight ? 'yes' : `no (${v.boundaryEdges})`}</td>
              <td className={cn('px-2.5 py-2', v.orientationConsistent && v.volume > 0 ? 'text-ok' : 'text-bad')}>{v.orientationConsistent && v.volume > 0 ? 'outward' : 'bad'}</td>
              <td className={cn('num px-2.5 py-2', v.shells === 1 ? 'text-ink-300' : 'text-warn')}>{v.shells}</td>
              <td className={cn('num px-2.5 py-2', v.selfIntersections ? 'text-bad' : 'text-ink-300')}>{v.selfIntersections}</td>
              <td className="num px-2.5 py-2 text-ink-300">{fmt(v.volume / 1000, 2)} cm³</td>
              <td className="num px-2.5 py-2 text-ink-300">{v.size.map((s) => fmt(s, 1)).join(' × ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportButtons({ printReady }: { printReady: boolean }) {
  const result = useGeometryStore((s) => s.result);
  const { busy, error, run } = useAsync();
  if (!result) return null;
  return (
    <div className="space-y-2">
      <Button variant="primary" size="lg" className="w-full" disabled={!!busy} onClick={() => run('zip', () => downloadZip(printReady, true))}>
        {busy === 'zip' ? <Loader2 className="animate-spin" /> : <FileArchive />} Download everything (ZIP)
      </Button>
      <div className="grid grid-cols-2 gap-1.5">
        {result.parts.map((p) => (
          <Button key={p.id} variant="secondary" size="sm" className="justify-start" disabled={!!busy} onClick={() => run(p.id, () => downloadPart(p.id, printReady))}>
            <FileBox /> <span className="truncate">{p.fileName}</span>
          </Button>
        ))}
        <Button variant="secondary" size="sm" className="justify-start" disabled={!!busy} onClick={() => run('asm', downloadAssembled)}>
          <Download /> Assembled_Model.stl
        </Button>
        <Button variant="secondary" size="sm" className="justify-start" disabled={!!busy} onClick={() => run('png', downloadAssemblyPng)}>
          {busy === 'png' ? <Loader2 className="animate-spin" /> : <ImageIcon />} Assembly image
        </Button>
      </div>
      {error && <div className="text-[11.5px] text-bad">{error}</div>}
    </div>
  );
}

function Summary() {
  const result = useGeometryStore((s) => s.result);
  const status = useGeometryStore((s) => s.status);
  if (!result) return null;
  const o = overall(result.validation);
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border p-3',
        o === 'pass' ? 'border-ok/30 bg-ok/8' : o === 'warn' ? 'border-warn/30 bg-warn/8' : 'border-bad/30 bg-bad/8',
      )}
    >
      {o === 'pass' ? <ShieldCheck className="mt-0.5 h-4 w-4 text-ok" /> : o === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 text-warn" /> : <XCircle className="mt-0.5 h-4 w-4 text-bad" />}
      <div className="text-[12px] leading-snug">
        <div className="font-semibold text-ink-100">
          {o === 'pass' ? 'All parts are valid, watertight solids' : o === 'warn' ? 'Parts are printable with warnings' : 'Some parts failed validation'}
        </div>
        <div className="text-ink-300">
          {result.validation.length} meshes checked for open edges, winding, self-intersections, degenerate faces and floating shells.
          {status === 'running' && ' Regenerating…'}
        </div>
      </div>
    </div>
  );
}

export function ExportPanel() {
  const result = useGeometryStore((s) => s.result);
  const [printReady, setPrintReady] = useState(true);
  if (!result) return <div className="p-4 text-[12px] text-ink-400">Generate geometry to enable export.</div>;
  return (
    <div className="space-y-3 px-4 pb-6">
      <SubHeading>Validation</SubHeading>
      <Summary />
      <Button variant="outline" size="sm" className="w-full" onClick={() => useViewStore.getState().setExportOpen(true)}>
        <CheckCircle2 /> Open full validation report
      </Button>
      <SubHeading>Files</SubHeading>
      <ToggleField
        label="Print-ready orientation"
        checked={printReady}
        onChange={setPrintReady}
        help="On: each part is laid flat on the bed (Z up, resting on Z = 0). Off: parts keep their assembly coordinates."
      />
      <ExportButtons printReady={printReady} />
      <p className="text-[10.5px] leading-snug text-ink-500">
        Units are millimetres. The files are generated from the same meshes shown in the 3D view and used by the shadow simulator.
      </p>
    </div>
  );
}

export function ExportDialog() {
  const open = useViewStore((s) => s.exportOpen);
  const result = useGeometryStore((s) => s.result);
  const [printReady, setPrintReady] = useState(true);
  return (
    <Dialog open={open} onOpenChange={(v) => useViewStore.getState().setExportOpen(v)}>
      <DialogContent title="Export STL files" description="Review the geometry validation report before downloading.">
        <div className="space-y-4 p-5">
          {result ? (
            <>
              <Summary />
              <ValidationTable reports={result.validation} />
              {result.validation.some((v) => v.issues.length) && (
                <ul className="space-y-1 text-[11.5px] text-warn">
                  {result.validation.flatMap((v) => v.issues.map((i) => <li key={v.partId + i}>{v.partId}: {i}</li>))}
                </ul>
              )}
              <ToggleField label="Print-ready orientation (flat on the bed)" checked={printReady} onChange={setPrintReady} />
              <ExportButtons printReady={printReady} />
            </>
          ) : (
            <div className="text-[12px] text-ink-400">No geometry yet.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
