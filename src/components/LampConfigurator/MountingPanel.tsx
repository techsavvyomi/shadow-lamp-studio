import { NumberField, SubHeading, ToggleField } from '@/components/common/Fields';
import { DEFAULT_LAMP, DEFAULT_LIGHT, DEFAULT_PROJECTION, LIMITS, WALL_PRESET } from '@/engines/defaults';
import { useDesignStore } from '@/stores/designStore';
import type { MountingConfig, MountingType } from '@/types';
import { cn } from '@/utils';

/** Switches lamp type with a matching starting design, as one undoable step. */
export function switchMounting(type: MountingType) {
  const { design, replace } = useDesignStore.getState();
  if (design.mounting.type === type) return;
  const mounting = { ...design.mounting, type };
  if (type === 'wall')
    replace({
      ...design,
      mounting,
      lamp: { ...WALL_PRESET.lamp },
      light: { ...design.light, position: WALL_PRESET.light.position, emitterAboveRim: WALL_PRESET.light.emitterAboveRim },
      projection: { ...design.projection, ...WALL_PRESET.projection },
    });
  else
    replace({
      ...design,
      mounting,
      lamp: { ...DEFAULT_LAMP },
      light: { ...design.light, position: DEFAULT_LIGHT.position, emitterAboveRim: DEFAULT_LIGHT.emitterAboveRim },
      projection: { ...design.projection, fill: DEFAULT_PROJECTION.fill, offsetU: 0, offsetV: 0 },
    });
}

function TableArt() {
  return (
    <svg viewBox="0 0 120 70" className="h-14 w-full">
      <rect x="8" y="6" width="104" height="52" rx="2" fill="#1b2029" />
      <path d="M14 22 l10 6 l-4 8 l6 4" stroke="#3a4152" fill="none" />
      <rect x="0" y="58" width="120" height="4" fill="#3a4152" />
      <rect x="48" y="36" width="24" height="22" rx="1" fill="#2a303d" stroke="#f7bd52" strokeWidth="1" />
      <circle cx="60" cy="46" r="2" fill="#fff6dc" />
      <path d="M60 46 L20 14 M60 46 L100 14" stroke="#f7bd52" strokeOpacity="0.35" strokeDasharray="2 2" />
      <path d="M92 16 q4 -6 8 0 q-2 6 -4 10 z" fill="#0b0d12" />
    </svg>
  );
}

function WallArt() {
  return (
    <svg viewBox="0 0 120 70" className="h-14 w-full">
      <defs>
        <radialGradient id="halo">
          <stop offset="0" stopColor="#ffd27a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="120" height="70" fill="#1b2029" />
      <ellipse cx="60" cy="35" rx="56" ry="34" fill="url(#halo)" />
      <path d="M30 52 q8 -30 30 -32 q14 0 18 -12 l4 8 q8 -2 10 4 q-6 8 -14 6 q2 18 -14 26 l14 10 h-50 z" fill="#0b0d12" />
      <rect x="53" y="27" width="14" height="18" rx="1" fill="#2a303d" stroke="#f7bd52" strokeWidth="1" />
      <circle cx="60" cy="36" r="2" fill="#fff6dc" />
    </svg>
  );
}

const OPTIONS: { type: MountingType; title: string; text: string; art: () => JSX.Element }[] = [
  { type: 'table', title: 'Table / shelf', text: 'Closed box. Panel cut-outs project onto the walls around the room.', art: TableArt },
  { type: 'wall', title: 'Wall-mounted', text: 'Open front, LED on a post. Shaped side walls cast one big silhouette on the same wall.', art: WallArt },
];

export function MountingPanel() {
  const m = useDesignStore((s) => s.design.mounting);
  const up = (patch: Partial<MountingConfig>) => useDesignStore.getState().update('mounting', patch);
  return (
    <div className="space-y-3">
      <p className="text-[11.5px] leading-snug text-ink-300">Where will the lamp be used? This decides the lamp's shape and where the shadow lands.</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mounting">
        {OPTIONS.map((o) => (
          <button
            key={o.type}
            role="radio"
            aria-checked={m.type === o.type}
            onClick={() => switchMounting(o.type)}
            className={cn(
              'group overflow-hidden rounded-lg border text-left transition-all',
              m.type === o.type ? 'border-glow-500 bg-glow-400/8 shadow-[0_0_18px_-6px_rgb(247_189_82/0.6)]' : 'border-ink-600 bg-ink-800/60 hover:border-ink-500',
            )}
          >
            <o.art />
            <div className="px-2 pb-2 pt-1.5">
              <div className={cn('text-[12px] font-semibold', m.type === o.type ? 'text-glow-200' : 'text-ink-100')}>{o.title}</div>
              <div className="mt-0.5 text-[10.5px] leading-snug text-ink-400">{o.text}</div>
            </div>
          </button>
        ))}
      </div>

      {m.type === 'wall' && (
        <>
          <SubHeading>On the wall</SubHeading>
          <NumberField
            label="Mounting height"
            value={m.height}
            min={LIMITS.mountHeight[0]}
            max={LIMITS.mountHeight[1]}
            step={10}
            unit="mm"
            onChange={(height) => up({ height })}
            help="Height of the lamp's centre above the floor. The figure is kept between the floor and the ceiling."
          />
          <NumberField label="Ceiling height" value={m.ceilingHeight} min={LIMITS.ceilingHeight[0]} max={LIMITS.ceilingHeight[1]} step={10} unit="mm" onChange={(ceilingHeight) => up({ ceilingHeight })} />
          <ToggleField label="Keyhole screw slots" checked={m.keyholes} onChange={(keyholes) => up({ keyholes })} help="Two keyholes in the wall plate: fit the screws, hang the lamp, slide it down." />
          {m.keyholes && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Screw head Ø" value={m.screwHead} min={4} max={12} step={0.1} unit="mm" onChange={(screwHead) => up({ screwHead })} />
              <NumberField label="Screw shank Ø" value={m.screwShank} min={2} max={6} step={0.1} unit="mm" onChange={(screwShank) => up({ screwShank })} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
