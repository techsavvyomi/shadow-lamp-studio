import { useState } from 'react';
import { Crop, Eye, Layers, Loader2, Sparkles, SlidersHorizontal, Square } from 'lucide-react';
import { NumberField, SelectField, Stat, SubHeading, ToggleField } from '@/components/common/Fields';
import { Button, ToggleGroup, ToggleGroupItem } from '@/components/ui/primitives';
import { useVectorMode } from '@/hooks/usePipeline';
import { useDesignStore } from '@/stores/designStore';
import { useImageStore } from '@/stores/imageStore';
import type { ProcessingParams } from '@/types';
import { SilhouettePreview, type PreviewMode } from './SilhouettePreview';

export function SilhouetteEditor() {
  const source = useImageStore((s) => s.source);
  const processed = useImageStore((s) => s.processed);
  const status = useImageStore((s) => s.status);
  const p = useDesignStore((s) => s.design.processing);
  const update = (patch: Partial<ProcessingParams>) => useDesignStore.getState().update('processing', patch);
  const vectorMode = useVectorMode();
  const [view, setView] = useState<PreviewMode>('overlay');
  const [cropping, setCropping] = useState(false);

  if (!source) return <div className="rounded-md border border-ink-700 bg-ink-800/40 p-3 text-[12px] text-ink-400">Upload an image or pick a sample first.</div>;

  const stats = processed?.stats;
  const isCropped = p.crop.x > 0 || p.crop.y > 0 || p.crop.w < 1 || p.crop.h < 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as PreviewMode)} className="w-auto">
          <ToggleGroupItem value="overlay" aria-label="Overlay">
            <Layers /> Overlay
          </ToggleGroupItem>
          <ToggleGroupItem value="silhouette" aria-label="Silhouette only">
            <Square /> Mask
          </ToggleGroupItem>
          <ToggleGroupItem value="original" aria-label="Original">
            <Eye />
          </ToggleGroupItem>
        </ToggleGroup>
        <Button variant={cropping ? 'outline' : 'ghost'} size="sm" onClick={() => setCropping((c) => !c)} className={cropping ? 'border-glow-500 text-glow-200' : ''}>
          <Crop /> Crop
        </Button>
      </div>

      <div className="relative">
        <SilhouettePreview mode={view} cropping={cropping} />
        {status === 'processing' && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-ink-900/80 px-1.5 py-0.5 text-[10.5px] text-ink-300">
            <Loader2 className="h-3 w-3 animate-spin" /> processing
          </div>
        )}
      </div>
      {isCropped && (
        <button className="text-[11px] text-glow-300 hover:underline" onClick={() => update({ crop: { x: 0, y: 0, w: 1, h: 1 } })}>
          Reset crop
        </button>
      )}

      {source.kind === 'svg' && (
        <ToggleField
          label="Exact vector paths (SVG)"
          checked={p.svgVector}
          onChange={(v) => update({ svgVector: v })}
          help="Use the SVG's own curves (flattened to 0.2 units) instead of tracing a rasterised copy. Disable for stroke-only artwork."
        />
      )}
      {source.kind === 'svg' && source.vectorWarnings.length > 0 && <div className="text-[11px] text-warn">{source.vectorWarnings.join(' ')}</div>}

      {!vectorMode && (
        <>
          <ToggleGroup type="single" value={p.mode} onValueChange={(v) => v && update({ mode: v as ProcessingParams['mode'] })}>
            <ToggleGroupItem value="auto">
              <Sparkles /> Automatic
            </ToggleGroupItem>
            <ToggleGroupItem value="manual">
              <SlidersHorizontal /> Manual
            </ToggleGroupItem>
          </ToggleGroup>

          {p.mode === 'manual' && (
            <div className="space-y-3">
              <SelectField
                label="Segmentation"
                value={p.method}
                onChange={(method) => update({ method })}
                options={[
                  { value: 'luminance', label: 'Brightness threshold' },
                  { value: 'background', label: 'Distance from background colour' },
                  { value: 'alpha', label: 'Alpha channel (transparent PNG)' },
                ]}
              />
              {p.method === 'background' ? (
                <NumberField label="Background tolerance" value={p.bgTolerance} min={1} max={255} onChange={(bgTolerance) => update({ bgTolerance })} />
              ) : (
                <NumberField label="Threshold" value={p.threshold} min={1} max={254} onChange={(threshold) => update({ threshold })} />
              )}
              {p.method === 'luminance' && <NumberField label="Contrast" value={p.contrast} min={-0.9} max={0.9} step={0.05} onChange={(contrast) => update({ contrast })} />}
              <ToggleField
                label={p.method === 'background' ? 'Only background touching the border' : 'Remove clutter touching the border'}
                checked={p.removeBackground}
                onChange={(removeBackground) => update({ removeBackground })}
                help="Background removal: keeps interior regions even if they match the background colour (useful for photos)."
              />
            </div>
          )}
        </>
      )}

      <ToggleField label="Invert silhouette" checked={p.invert} onChange={(invert) => update({ invert })} />

      {!vectorMode && (
        <>
          <SubHeading>Clean-up</SubHeading>
          <NumberField label="Remove noise below" value={p.noiseArea} min={0} max={3} step={0.01} unit="%" onChange={(noiseArea) => update({ noiseArea })} help="Drops foreground islands smaller than this share of the image." />
          <NumberField label="Fill holes below" value={p.holeArea} min={0} max={3} step={0.01} unit="%" onChange={(holeArea) => update({ holeArea })} help="Fills enclosed gaps smaller than this share of the image. Keep low to preserve meaningful holes." />
          <NumberField label="Contour smoothing" value={p.smoothing} min={0} max={6} step={0.1} unit="px" onChange={(smoothing) => update({ smoothing })} />
          <NumberField label="Trace resolution" value={p.resolution} min={256} max={1536} step={64} unit="px" onChange={(resolution) => update({ resolution })} />
        </>
      )}

      {stats && !vectorMode && (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Regions" value={stats.components} />
            <Stat label="Holes" value={stats.holes} />
            <Stat label="Vertices" value={stats.vertices} />
          </div>
          <div className="text-[11px] leading-relaxed text-ink-400">
            <span className="text-ink-300">
              {stats.method === 'alpha' ? 'Alpha' : stats.method === 'background' ? 'Background distance' : 'Brightness'} @ {stats.threshold}
            </span>{' '}
            · {stats.foregroundPct.toFixed(1)}% coverage · {stats.width}×{stats.height}px
            {stats.notes.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </div>
        </div>
      )}
      {vectorMode && source.vector && (
        <div className="text-[11px] text-ink-400">
          Using {source.vector.shapes.length} vector shapes directly (painter's order; light fills cut holes).
        </div>
      )}
    </div>
  );
}
