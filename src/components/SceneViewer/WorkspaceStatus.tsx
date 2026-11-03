import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/primitives';
import { useGeometryStore } from '@/stores/geometryStore';
import { useImageStore } from '@/stores/imageStore';
import { useViewStore } from '@/stores/viewStore';
import { PANEL_IDS } from '@/types';

/** Generation progress, errors and a compact projection summary over the canvas. */
export function WorkspaceStatus() {
  const status = useGeometryStore((s) => s.status);
  const progress = useGeometryStore((s) => s.progress);
  const error = useGeometryStore((s) => s.error);
  const result = useGeometryStore((s) => s.result);
  const hasImage = useImageStore((s) => !!s.source);
  const mode = useViewStore((s) => s.mode);

  const active = result ? PANEL_IDS.filter((id) => result.panels[id].active && result.panels[id].fidelity !== null) : [];
  const fid = result?.figure ? result.figure.fidelity : active.length ? Math.min(...active.map((id) => result!.panels[id].fidelity!)) : null;
  const fails = result?.validation.filter((v) => v.status === 'fail').length ?? 0;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[min(420px,70%)] flex-col gap-2">
      {status === 'running' && (
        <div className="pointer-events-auto w-64 rounded-lg border border-ink-600/80 bg-ink-850/90 p-2.5 shadow-xl backdrop-blur animate-fade-in">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-glow-400" />
            {progress.stage || 'Generating geometry'}
          </div>
          <Progress value={Math.round(progress.fraction * 100)} />
        </div>
      )}
      {status === 'error' && error && (
        <div className="pointer-events-auto rounded-lg border border-bad/40 bg-bad/15 px-3 py-2 text-[12px] text-bad shadow-xl backdrop-blur">
          Geometry generation failed: {error}
        </div>
      )}
      {!hasImage && status !== 'running' && mode !== 'simulation' && (
        <div className="rounded-lg border border-ink-600/80 bg-ink-850/85 px-3 py-2 text-[12px] text-ink-300 shadow-xl backdrop-blur">
          Showing a plain enclosure — upload a silhouette or pick a sample to generate projection panels.
        </div>
      )}
      {result && status !== 'running' && fid !== null && mode !== 'simulation' && (
        <div className="flex items-center gap-2 rounded-lg border border-ink-600/80 bg-ink-850/85 px-3 py-1.5 text-[11.5px] text-ink-200 shadow-xl backdrop-blur animate-fade-in">
          {fails ? <AlertTriangle className="h-3.5 w-3.5 text-bad" /> : <CheckCircle2 className="h-3.5 w-3.5 text-ok" />}
          <span>
            {result.figure ? 'Wall figure' : `${active.length} projection panel${active.length === 1 ? '' : 's'}`} · fidelity <span className="num text-glow-200">{(fid * 100).toFixed(1)}%</span> · {fails ? `${fails} part(s) invalid` : 'all meshes valid'}
          </span>
        </div>
      )}
    </div>
  );
}
