import { Loader2, Shapes, Square, Type } from 'lucide-react';
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/creepster/latin-400.css';
import '@fontsource/pacifico/latin-400.css';
import { ExpertOnly, NumberField } from '@/components/common/Fields';
import { Label, ToggleGroup, ToggleGroupItem } from '@/components/ui/primitives';
import { FONT_OPTIONS, ICON_OPTIONS, iconArt, shapeToPathData } from '@/engines/decoration/plateArt';
import { LIMITS } from '@/engines/defaults';
import { useSilhouetteData } from '@/hooks/usePipeline';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useImageStore } from '@/stores/imageStore';
import type { DecorationIcon, Loop, PlateDecoration, PlateDrawing } from '@/types';
import { cn } from '@/utils';

const up = (patch: Partial<PlateDecoration>, key?: string) => useDesignStore.getState().update('decoration', patch, key);

/** Plate loops are y-up (as seen from the room); SVG is y-down. */
const svgPath = (loops: Loop[]) => loops.map((l) => `M${l.map(([x, y]) => `${x.toFixed(2)} ${(-y).toFixed(2)}`).join('L')}Z`).join('');

function IconThumb({ icon }: { icon: DecorationIcon }) {
  const source = useImageStore((s) => s.source);
  if (icon === 'figure')
    return source ? <img src={source.url} alt="" className="h-7 w-7 rounded-sm bg-ink-200 object-contain p-0.5" /> : <Shapes className="h-7 w-5 text-ink-500" />;
  return (
    <svg viewBox="0 0 100 100" className="h-7 w-7">
      {iconArt(icon).shapes.map((s, i) => (
        <path key={i} d={shapeToPathData(s)} fill={s.subtract ? '#1b2029' : 'currentColor'} fillRule="nonzero" />
      ))}
    </svg>
  );
}

/** The wall plate as seen from the room, with the generated relief. */
export function PlatePreview({ plate }: { plate: PlateDrawing }) {
  const running = useGeometryStore((s) => s.status === 'running');
  const pad = 6;
  const W = plate.width;
  const H = plate.height;
  return (
    <div className="space-y-1">
      <div className="relative rounded-lg border border-ink-700 bg-ink-950/70 p-1.5">
        <svg viewBox={`${-W / 2 - pad} ${-H / 2 - pad} ${W + 2 * pad} ${H + 2 * pad}`} className="mx-auto block" style={{ height: 190 }} role="img" aria-label="Wall plate preview">
          <path d={svgPath(plate.plate)} fill="#232934" stroke="#5b6478" strokeWidth={0.5} fillRule="evenodd" />
          <path d={svgPath(plate.area)} fill="none" stroke="#7ea2ff" strokeOpacity={0.35} strokeWidth={0.4} strokeDasharray="2 1.5" fillRule="evenodd" />
          {plate.decoration.length > 0 && <path d={svgPath(plate.decoration)} fill="#f7bd52" stroke="#ffe2a8" strokeWidth={0.3} fillRule="evenodd" />}
          <circle cx={plate.led[0]} cy={-plate.led[1]} r={plate.postRadius - 2} fill="#3a4152" stroke="#8a93a8" strokeWidth={0.4} />
          <circle cx={plate.led[0]} cy={-plate.led[1]} r={2.2} fill="#fff6dc" />
        </svg>
        {running && <Loader2 className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-ink-400" />}
      </div>
      <div className="text-center text-[10.5px] text-ink-400">
        Wall plate seen from the room · {W} × {H} mm · <span className="text-glow-300">■</span> raised design
      </div>
    </div>
  );
}

export function DecorationPanel({ advanced = false }: { advanced?: boolean }) {
  const d = useDesignStore((s) => s.design.decoration);
  const plate = useGeometryStore((s) => (s.result?.mounting === 'wall' ? s.result.plate : null));
  const hasFigure = !!useSilhouetteData();
  return (
    <div className="space-y-3">
      <p className="text-[11.5px] leading-snug text-ink-300">The LED lights up the plate behind it. Give it a raised design that stands out when the lamp is on.</p>
      <ToggleGroup type="single" value={d.kind} onValueChange={(v) => v && up({ kind: v as PlateDecoration['kind'] })} aria-label="Plate decoration">
        <ToggleGroupItem value="none">
          <Square /> Plain
        </ToggleGroupItem>
        <ToggleGroupItem value="silhouette">
          <Shapes /> Silhouette
        </ToggleGroupItem>
        <ToggleGroupItem value="text">
          <Type /> Text
        </ToggleGroupItem>
      </ToggleGroup>

      {d.kind === 'silhouette' && (
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Plate silhouette">
          {ICON_OPTIONS.map((o) => {
            const disabled = o.value === 'figure' && !hasFigure;
            return (
              <button
                key={o.value}
                role="radio"
                aria-checked={d.icon === o.value}
                disabled={disabled}
                title={disabled ? 'Pick a picture first' : o.label}
                onClick={() => up({ icon: o.value })}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-ink-200 transition-colors disabled:opacity-40',
                  d.icon === o.value ? 'border-glow-500 bg-glow-400/10 text-glow-200' : 'border-ink-700 bg-ink-800/60 hover:border-ink-500',
                )}
              >
                <IconThumb icon={o.value} />
                <span className="text-[9.5px] leading-none">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {d.kind === 'text' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="plate-text">Text (up to 3 lines)</Label>
            <textarea
              id="plate-text"
              rows={2}
              maxLength={60}
              value={d.text}
              onChange={(e) => up({ text: e.target.value.split('\n').slice(0, 3).join('\n') }, 'decoration:text')}
              className="w-full resize-none rounded-md border border-ink-600 bg-ink-800/80 px-2 py-1.5 text-[13px] text-ink-100 outline-none focus:border-glow-500/70"
              placeholder="Happy Halloween"
            />
          </div>
          <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Font">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.value}
                role="radio"
                aria-checked={d.font === f.value}
                onClick={() => up({ font: f.value })}
                className={cn(
                  'rounded-md border px-1 py-1.5 text-[15px] leading-tight transition-colors',
                  d.font === f.value ? 'border-glow-500 bg-glow-400/10 text-glow-200' : 'border-ink-700 bg-ink-800/60 text-ink-200 hover:border-ink-500',
                )}
                style={{ fontFamily: `'${f.family}', sans-serif` }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {d.kind !== 'none' && (
        <>
          <div className="space-y-1">
            <Label>Position</Label>
            <ToggleGroup type="single" value={d.position} onValueChange={(v) => v && up({ position: v as PlateDecoration['position'] })} aria-label="Decoration position">
              <ToggleGroupItem value="above">Above LED</ToggleGroupItem>
              <ToggleGroupItem value="below">Below LED</ToggleGroupItem>
              <ToggleGroupItem value="behind">Behind LED</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <NumberField label="Size" value={Math.round(d.size * 100)} min={LIMITS.decorationSize[0] * 100} max={100} unit="%" onChange={(v) => up({ size: v / 100 }, 'decoration:size')} />
          {advanced && (
            <ExpertOnly>
            <NumberField
              label="Relief height"
              value={d.height}
              min={LIMITS.reliefHeight[0]}
              max={LIMITS.reliefHeight[1]}
              step={0.1}
              unit="mm"
              onChange={(height) => up({ height }, 'decoration:height')}
              help="How far the design stands off the plate. Pause the print at the plate's top layer and swap filament for a two-colour design."
            />
            </ExpertOnly>
          )}
        </>
      )}

      {plate && <PlatePreview plate={plate} />}
    </div>
  );
}
