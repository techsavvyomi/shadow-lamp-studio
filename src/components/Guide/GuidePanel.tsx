import { AlertTriangle, ArrowLeft, ArrowRight, Box, Boxes, CheckCircle2, Download, FileSearch, Lightbulb, Loader2, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { NumberField, Stat, SubHeading } from '@/components/common/Fields';
import { ImageUploader } from '@/components/ImageUploader/ImageUploader';
import { DecorationPanel } from '@/components/LampConfigurator/DecorationPanel';
import { MountingPanel } from '@/components/LampConfigurator/MountingPanel';
import { PlacementPad } from '@/components/LampConfigurator/PlacementPad';
import { SilhouetteEditor } from '@/components/SilhouetteEditor/SilhouetteEditor';
import { downloadZip } from '@/components/ExportPanel/exportActions';
import { Button, Progress } from '@/components/ui/primitives';
import { useSilhouetteData } from '@/hooks/usePipeline';
import { panelLabel } from '@/engines/projectionGeometry/mounting';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useImageStore } from '@/stores/imageStore';
import { GUIDE_STEP_IDS, useViewStore, type GuideStepId, type ViewMode } from '@/stores/viewStore';
import { PANEL_IDS, type Finding, type ProjectionConfig } from '@/types';
import { cn } from '@/utils';

export const GUIDE_STEPS: Record<GuideStepId, { label: string; title: string; intro: string }> = {
  type: { label: 'Lamp type', title: 'What kind of lamp?', intro: 'Pick where it will shine. You can switch at any time.' },
  picture: { label: 'Picture', title: 'Choose a picture', intro: 'Bold shapes with a clear outline work best: a silhouette, logo or simple drawing. Or start with a sample.' },
  silhouette: { label: 'Silhouette', title: 'Check the shape', intro: 'The highlighted part becomes the shadow. Make sure its outline looks right.' },
  customise: { label: 'Customise', title: 'Make it yours', intro: 'Set how big the shadow is and add the finishing touches.' },
  preview: { label: 'Preview', title: 'See the shadow', intro: 'The virtual LED is on: this is how your wall will look. Drag to look around.' },
  export: { label: 'Export', title: 'Print it', intro: 'Download the parts and print them. Everything is checked to be a clean, printable solid.' },
};

/** Whether a step's essentials are in place (used for ticks and to gate Next). */
export function useGuideProgress(): Record<GuideStepId, boolean> {
  const source = useImageStore((s) => !!s.source);
  const silhouette = !!useSilhouetteData();
  const visited = useViewStore((s) => s.visited);
  return {
    type: !!visited.type,
    picture: source,
    silhouette: silhouette && !!visited.silhouette,
    customise: !!visited.customise,
    preview: !!visited.preview,
    export: !!visited.export,
  };
}

const upProj = (patch: Partial<ProjectionConfig>, key?: string) => useDesignStore.getState().update('projection', patch, key);

function CustomiseStep() {
  const wall = useDesignStore((s) => s.design.mounting.type === 'wall');
  const fill = useDesignStore((s) => s.design.projection.fill);
  const active = useDesignStore((s) => s.design.projection.activePanels);
  return (
    <div className="space-y-3">
      <NumberField
        label="Shadow size"
        value={Math.round(fill * 100)}
        min={30}
        max={100}
        unit="%"
        onChange={(v) => upProj({ fill: v / 100 }, 'projection:fill')}
        help={wall ? 'How much of the area the lamp can shade the figure fills. Smaller figures are sharper.' : 'How much of each wall the lamp can reach the picture fills.'}
      />
      <SubHeading>Position on the wall</SubHeading>
      <PlacementPad />
      {!wall && (
        <div className="space-y-1.5">
          <div className="text-[11.5px] font-medium text-ink-300">Sides that show the picture</div>
          <div className="grid grid-cols-4 gap-1">
            {PANEL_IDS.map((id) => (
              <button
                key={id}
                aria-pressed={active[id]}
                onClick={() => upProj({ activePanels: { ...active, [id]: !active[id] } })}
                className={cn(
                  'rounded-md border py-1.5 text-[11.5px] font-medium transition-colors',
                  active[id] ? 'border-glow-500 bg-glow-400/10 text-glow-200' : 'border-ink-700 bg-ink-800/60 text-ink-400 hover:border-ink-500',
                )}
              >
                {panelLabel('table', id)}
              </button>
            ))}
          </div>
        </div>
      )}
      {wall && (
        <>
          <SubHeading>Wall plate</SubHeading>
          <DecorationPanel />
        </>
      )}
    </div>
  );
}

function ViewButton({ mode, icon, children }: { mode: ViewMode; icon: ReactNode; children: ReactNode }) {
  const current = useViewStore((s) => s.mode);
  return (
    <button
      onClick={() => {
        const v = useViewStore.getState();
        v.setMode(mode);
        if (mode === 'simulation') v.setSim({ ledOn: true });
      }}
      className={cn(
        'flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors [&_svg]:h-4 [&_svg]:w-4',
        current === mode ? 'border-glow-500 bg-glow-400/10 text-glow-200' : 'border-ink-700 bg-ink-800/60 text-ink-300 hover:border-ink-500',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function topFindings(): Finding[] {
  const r = useGeometryStore.getState().result;
  if (!r) return [];
  const all = [...r.findings, ...PANEL_IDS.flatMap((id) => r.panels[id].findings)].filter((f) => f.severity !== 'info');
  const seen = new Set<string>();
  return all.filter((f) => !seen.has(f.message) && seen.add(f.message)).slice(0, 3);
}

function PreviewStep() {
  const result = useGeometryStore((s) => s.result);
  const status = useGeometryStore((s) => s.status);
  const progress = useGeometryStore((s) => s.progress);
  const findings = result ? topFindings() : [];
  const failing = result?.validation.filter((v) => v.status === 'fail').length ?? 0;
  const wall = result?.mounting === 'wall';
  const active = result ? PANEL_IDS.map((id) => result.panels[id]).filter((p) => p.active && p.fidelity != null) : [];
  const fidelity = wall ? result?.figure?.fidelity : active.length ? active.reduce((a, p) => a + p.fidelity!, 0) / active.length : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <ViewButton mode="simulation" icon={<Lightbulb />}>
          Light it up
        </ViewButton>
        <ViewButton mode="assembled" icon={<Box />}>
          3D model
        </ViewButton>
        <ViewButton mode="exploded" icon={<Boxes />}>
          How it fits
        </ViewButton>
      </div>
      <PlacementPad height={150} />
      {status === 'running' && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11.5px] text-ink-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress.stage || 'Building your lamp'}…
          </div>
          <Progress value={progress.fraction * 100} />
        </div>
      )}
      {result && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {wall && result.figure && <Stat label="Shadow size" value={`${(result.figure.width / 10).toFixed(0)} × ${(result.figure.height / 10).toFixed(0)}`} unit="cm" />}
            {!wall && <Stat label="Sides with a picture" value={active.length} />}
            {fidelity != null && <Stat label="Shape match" value={(fidelity * 100).toFixed(1)} unit="%" tone={fidelity > 0.9 ? 'ok' : fidelity > 0.8 ? 'warn' : 'bad'} />}
          </div>
          <div className={cn('flex items-center gap-1.5 text-[11.5px]', failing ? 'text-bad' : 'text-ok')}>
            {failing ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {failing ? `${failing} part(s) need attention before printing` : 'All parts are clean, printable solids'}
          </div>
          {findings.length > 0 && (
            <ul className="space-y-1.5">
              {findings.map((f) => (
                <li key={f.message} className={cn('flex gap-1.5 text-[11px] leading-snug', f.severity === 'error' ? 'text-bad' : 'text-warn')}>
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {f.message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ExportStep() {
  const design = useDesignStore((s) => s.design);
  const ready = useGeometryStore((s) => !!s.result && s.status !== 'running');
  const wall = design.mounting.type === 'wall';
  const tips = [
    'Print every part in dark, opaque filament (black PLA works best) so light only passes where it should.',
    `Walls and panels print flat with no supports. ${design.lamp.fingerJoints ? 'Their tabs drop into the notches in the plate; a drop of glue makes it permanent.' : 'Glue them onto the plate around the locating lip.'}`,
    wall && design.decoration.kind !== 'none'
      ? `Wall plate: print design-side up. For a two-colour plate, pause at Z = ${design.lamp.baseThickness.toFixed(1)} mm and switch to a light filament.`
      : null,
    wall ? 'Use a filament or tube LED that shines all round: the light has to travel back to the wall.' : 'Use a small, wide-angle LED for the sharpest shadows.',
  ].filter(Boolean) as string[];
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {tips.map((t, i) => (
          <li key={t} className="flex gap-2 text-[11.5px] leading-snug text-ink-200">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[9.5px] font-bold text-ink-200">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <Button
        variant="primary"
        size="md"
        className="w-full"
        disabled={!ready}
        onClick={() => {
          useViewStore.getState().markVisited('export');
          void downloadZip(true, true);
        }}
      >
        <Download /> Download all files (.zip)
      </Button>
      <Button variant="secondary" size="md" className="w-full" disabled={!ready} onClick={() => useViewStore.getState().setExportOpen(true)}>
        <FileSearch /> Review parts &amp; checks
      </Button>
    </div>
  );
}

function StepBody({ step }: { step: GuideStepId }) {
  switch (step) {
    case 'type':
      return <MountingPanel compact />;
    case 'picture':
      return <ImageUploader />;
    case 'silhouette':
      return <SilhouetteEditor simple />;
    case 'customise':
      return <CustomiseStep />;
    case 'preview':
      return <PreviewStep />;
    case 'export':
      return <ExportStep />;
  }
}

export function GuidePanel() {
  const step = useViewStore((s) => s.guideStep);
  const source = useImageStore((s) => !!s.source);
  const silhouette = !!useSilhouetteData();
  const i = GUIDE_STEP_IDS.indexOf(step);
  const info = GUIDE_STEPS[step];
  const blocked = step === 'picture' ? !source : step === 'silhouette' ? !silhouette : false;
  const go = (d: number) => useViewStore.getState().setGuideStep(GUIDE_STEP_IDS[i + d]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-ink-700 px-4 pb-3 pt-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-glow-300">
            Step {i + 1} of {GUIDE_STEP_IDS.length}
          </span>
          <button
            data-tour="advanced"
            onClick={() => useViewStore.getState().setUiMode('advanced')}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          >
            <SlidersHorizontal className="h-3 w-3" /> All settings
          </button>
        </div>
        <h2 className="mt-1 text-[16px] font-semibold tracking-tight text-ink-50">{info.title}</h2>
        <p className="mt-1 text-[11.5px] leading-snug text-ink-400">{info.intro}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" key={step}>
        <div className="animate-slide-up">
          <StepBody step={step} />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-ink-700 px-3 py-2.5">
        <Button variant="ghost" size="md" disabled={i === 0} onClick={() => go(-1)}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex flex-1 justify-center gap-1" aria-hidden>
          {GUIDE_STEP_IDS.map((id, k) => (
            <span key={id} className={cn('h-1.5 rounded-full transition-all', k === i ? 'w-4 bg-glow-400' : k < i ? 'w-1.5 bg-ok/70' : 'w-1.5 bg-ink-600')} />
          ))}
        </div>
        {i < GUIDE_STEP_IDS.length - 1 ? (
          <Button variant="primary" size="md" disabled={blocked} onClick={() => go(1)} title={blocked ? (step === 'picture' ? 'Pick a picture first' : 'Waiting for the silhouette') : undefined}>
            Next <ArrowRight />
          </Button>
        ) : (
          <span className="w-[74px]" />
        )}
      </div>
    </div>
  );
}
