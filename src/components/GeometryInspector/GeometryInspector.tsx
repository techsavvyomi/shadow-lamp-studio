import { AlertTriangle, CircleCheck, Info, XCircle } from 'lucide-react';
import { Stat, SubHeading } from '@/components/common/Fields';
import { Badge } from '@/components/ui/primitives';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useViewStore } from '@/stores/viewStore';
import { panelLabel } from '@/engines/projectionGeometry/mounting';
import { PANEL_IDS, type Finding, type PanelId } from '@/types';
import { cn, fmt } from '@/utils';
import { PanelDrawing } from './PanelDrawing';

export function FindingList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => (
        <li key={f.code + i} className="flex gap-2 text-[11.5px] leading-snug text-ink-200">
          {f.severity === 'error' ? (
            <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-bad" />
          ) : f.severity === 'warning' ? (
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warn" />
          ) : (
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-cool-400" />
          )}
          <span>{f.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function GeometryInspector() {
  const result = useGeometryStore((s) => s.result);
  const lamp = useDesignStore((s) => s.design.lamp);
  const selected = useViewStore((s) => s.selectedPanel);
  if (!result) return <div className="p-4 text-[12px] text-ink-400">Geometry will appear here once generated.</div>;
  const NAMES = Object.fromEntries(PANEL_IDS.map((id) => [id, panelLabel(result.mounting, id)])) as Record<PanelId, string>;
  const fig = result.figure;
  const p = result.panels[selected];
  const d = result.drawings[selected];
  const totalTris = result.parts.reduce((s, x) => s + x.mesh.indices.length / 3, 0);

  return (
    <div className="space-y-1 px-4 pb-6">
      <SubHeading>Lamp</SubHeading>
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Footprint" value={`${lamp.width}×${lamp.depth}`} unit="mm" />
        <Stat label="Height" value={lamp.height} unit="mm" />
        <Stat label="Triangles" value={(totalTris / 1000).toFixed(1)} unit="k" />
      </div>
      {fig && (
        <>
          <SubHeading right={<Badge tone="glow">wall lamp</Badge>}>Figure on the wall</SubHeading>
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Figure size" value={`${fmt(fig.width / 10, 0)}×${fmt(fig.height / 10, 0)}`} unit="cm" />
            <Stat
              label="Fidelity"
              value={fig.fidelity === null ? '—' : `${(fig.fidelity * 100).toFixed(1)}`}
              unit={fig.fidelity === null ? undefined : '%'}
              tone={fig.fidelity === null ? undefined : fig.fidelity > 0.95 ? 'ok' : 'warn'}
            />
            <Stat label="Lamp inside figure" value={fmt(fig.lampCoveredPct, 0)} unit="%" tone={fig.lampCoveredPct < 95 ? 'warn' : 'ok'} />
            <Stat label="Edge blur" value={`${fmt(fig.nearBlur, 0)}–${fmt(fig.farBlur, 0)}`} unit="mm" />
            <Stat label="Profile height" value={fmt(fig.maxProfileHeight, 0)} unit="mm" />
            <Stat label="Post shadow" value={Number.isFinite(fig.postShadowRadius) ? fmt(fig.postShadowRadius, 0) : '∞'} unit="mm" />
          </div>
        </>
      )}
      {result.findings.length > 0 && (
        <div className="pt-2">
          <FindingList findings={result.findings} />
        </div>
      )}

      <SubHeading>{fig || result.mounting === 'wall' ? 'Side walls' : 'Panels'}</SubHeading>
      <div className="overflow-hidden rounded-lg border border-ink-700">
        <table className="w-full text-[11px]">
          <thead className="bg-ink-800 text-ink-400">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Panel</th>
              <th className="px-1 py-1.5 text-right font-medium">Size</th>
              <th className="px-1 py-1.5 text-right font-medium">Open</th>
              <th className="px-2 py-1.5 text-right font-medium">Fidelity</th>
            </tr>
          </thead>
          <tbody>
            {PANEL_IDS.map((id) => {
              const a = result.panels[id];
              return (
                <tr
                  key={id}
                  onClick={() => useViewStore.getState().selectPanel(id)}
                  className={cn('cursor-pointer border-t border-ink-700/70 transition-colors hover:bg-ink-800', id === selected && 'bg-glow-400/8')}
                >
                  <td className={cn('px-2 py-1.5 font-medium', id === selected ? 'text-glow-200' : 'text-ink-200')}>{NAMES[id]}</td>
                  <td className="num px-1 py-1.5 text-right text-ink-300">
                    {fmt(a.width, 0)}×{fmt(a.height, 0)}
                  </td>
                  <td className="num px-1 py-1.5 text-right text-ink-300">{a.active && a.placement ? `${fmt(a.openAreaPct, 0)}%` : '—'}</td>
                  <td className="px-2 py-1.5 text-right">
                    {!a.active || !a.placement ? (
                      <Badge>solid</Badge>
                    ) : a.fidelity === null ? (
                      <Badge tone="bad">n/a</Badge>
                    ) : (
                      <span className={cn('num', a.fidelity > 0.95 ? 'text-ok' : a.fidelity > 0.85 ? 'text-warn' : 'text-bad')}>{(a.fidelity * 100).toFixed(1)}%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SubHeading
        right={
          p.active && p.placement ? (
            <Badge tone="glow">{NAMES[selected]} · projecting</Badge>
          ) : (
            <Badge>{NAMES[selected]} · solid</Badge>
          )
        }
      >
        {result.mounting === 'wall' ? 'Selected side wall' : 'Selected panel'}
      </SubHeading>
      <PanelDrawing d={d} />
      {p.active && p.placement && (
        <>
          <div className="grid grid-cols-3 gap-1.5 pt-2">
            <Stat label="Wall image" value={`${fmt(p.imageWidth / 10, 0)}×${fmt(p.imageHeight / 10, 0)}`} unit="cm" />
            <Stat label="Magnification" value={fmt(p.magnification, 1)} unit="×" />
            <Stat label="LED → panel" value={fmt(p.lightDistance, 1)} unit="mm" />
            <Stat label="Edge blur" value={fmt(p.penumbra, 0)} unit="mm" tone={p.penumbra > 40 ? 'warn' : undefined} />
            <Stat label="Finest detail" value={fmt(p.resolution, 0)} unit="mm" />
            <Stat label="Bridges" value={p.bridges} tone={p.bridges > 6 ? 'warn' : undefined} />
          </div>
          <div className="pt-2">
            <FindingList findings={p.findings} />
          </div>
        </>
      )}
      {result.validation.length > 0 && (
        <>
          <SubHeading>Mesh checks</SubHeading>
          <div className="flex flex-wrap gap-1">
            {result.validation.map((v) => (
              <Badge key={v.partId} tone={v.status === 'pass' ? 'ok' : v.status === 'warn' ? 'warn' : 'bad'}>
                {v.status === 'pass' ? <CircleCheck className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
                {v.partId}
              </Badge>
            ))}
          </div>
        </>
      )}
      <div className="pt-3 text-[10.5px] text-ink-500">
        Generated in {Object.values(result.timings).reduce((s, t) => s + t, 0)} ms · fidelity = IoU of the ray-traced shadow of the exported mesh vs. the target silhouette
      </div>
    </div>
  );
}
