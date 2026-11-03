import { useState } from 'react';
import { ChevronDown, Link2, Link2Off, Power, RotateCcw } from 'lucide-react';
import { ExpertOnly, NumberField, SelectField, ToggleField } from '@/components/common/Fields';
import { Button, Tip } from '@/components/ui/primitives';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useViewStore, type SimulationSettings } from '@/stores/viewStore';
import { cn } from '@/utils';

const WALLS = ['#e9e4da', '#f5f5f2', '#c9d6e3', '#d9c7b2', '#9aa59a', '#3d4048'];
const FLOORS = ['#5a4a3c', '#8b7356', '#2f3136', '#b9b2a6'];

/** Floating control card for the shadow simulation workspace. */
export function SimulationControls() {
  const sim = useViewStore((s) => s.sim);
  const design = useDesignStore((s) => s.design);
  const result = useGeometryStore((s) => s.result);
  const set = (p: Partial<SimulationSettings>) => useViewStore.getState().setSim(p);
  // guided mode starts with just the LED switch and the two readouts
  const [open, setOpen] = useState(() => useViewStore.getState().uiMode === 'advanced');

  const wall = design.mounting.type === 'wall';
  const flux = sim.linked ? design.light.flux : sim.flux;
  const emitter = sim.linked ? design.light.emitterSize : sim.emitterSize;
  const designDist = design.projection.wallDistance;
  const front = result?.panels.front;
  // penumbra for the simulated wall distance (similar triangles)
  const a = front?.lightDistance ?? 0;
  const simPenumbra = a > 0 ? (emitter * (sim.wallDistance + design.lamp.wallThickness)) / a : 0;
  const I = flux / (4 * Math.PI);
  let centreLux = I / Math.pow((sim.wallDistance + design.lamp.depth / 2) / 1000, 2);
  let blurText = `≈ ${simPenumbra.toFixed(0)} mm`;
  if (wall) {
    // halo on the mounting wall 30 cm from the lamp: E = I·cosθ / r²
    const y = (result?.light ?? design.light.position)[1];
    const r = Math.hypot(300, y);
    centreLux = (I * (y / r)) / Math.pow(r / 1000, 2);
    const f = result?.figure;
    const k = design.light.emitterSize > 0 ? emitter / design.light.emitterSize : 0;
    blurText = f ? `${(f.nearBlur * k).toFixed(0)}–${(f.farBlur * k).toFixed(0)} mm` : '—';
  }

  const link = (linked: boolean) =>
    set(linked ? { linked, wallDistance: designDist, wallYaw: design.projection.wallYaw, flux: design.light.flux, emitterSize: design.light.emitterSize } : { linked });

  return (
    <div className="absolute right-3 top-14 w-[272px] overflow-hidden rounded-xl border border-ink-600/80 bg-ink-850/92 shadow-2xl shadow-black/50 backdrop-blur animate-slide-up">
      <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
        <button
          onClick={() => set({ ledOn: !sim.ledOn })}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold transition-all',
            sim.ledOn ? 'border-glow-400 bg-glow-400/20 text-glow-200 animate-pulse-glow' : 'border-ink-500 bg-ink-800 text-ink-300',
          )}
          aria-pressed={sim.ledOn}
        >
          <Power className="h-3.5 w-3.5" /> LED {sim.ledOn ? 'ON' : 'OFF'}
        </button>
        <div className="flex-1" />
        <Tip content={sim.linked ? 'Linked to the design target — unlink to experiment' : 'Re-link to the design target'}>
          <Button variant="ghost" size="icon-sm" onClick={() => link(!sim.linked)} aria-label="Link to design">
            {sim.linked ? <Link2 className="text-glow-300" /> : <Link2Off />}
          </Button>
        </Tip>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen((o) => !o)} aria-label="Collapse">
          <ChevronDown className={cn('transition-transform', !open && '-rotate-90')} />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-3 pt-3 text-[10.5px]">
            <div className="rounded-md bg-ink-800 px-2 py-1">
              <div className="text-ink-400">{wall ? 'Halo at 30 cm' : 'Wall centre'}</div>
              <div className="num text-[12px] text-ink-100">{sim.ledOn ? centreLux.toFixed(0) : 0} lx</div>
            </div>
            <div className="rounded-md bg-ink-800 px-2 py-1">
              <div className="text-ink-400">Edge blur</div>
              <div className="num text-[12px] text-ink-100">{blurText}</div>
            </div>
      </div>
      {!open && <div className="h-3" />}
      {open && (
        <div className="max-h-[calc(100vh-300px)] space-y-3 overflow-y-auto px-3 py-3">
          {!wall && Math.abs(sim.wallDistance - designDist) > 1 && (
            <p className="text-[10.5px] leading-snug text-warn">Wall is at {sim.wallDistance} mm but the panels were designed for {designDist} mm — the image scales and blurs accordingly.</p>
          )}
          <NumberField label="LED flux" value={flux} min={5} max={1000} step={5} unit="lm" disabled={sim.linked} onChange={(v) => set({ flux: v })} />
          <NumberField label="Emitter size (sharpness)" value={emitter} min={0} max={20} step={0.1} unit="mm" disabled={sim.linked} onChange={(v) => set({ emitterSize: v })} />
          {!wall && <NumberField label="Wall distance" value={sim.wallDistance} min={100} max={3000} step={10} unit="mm" disabled={sim.linked} onChange={(v) => set({ wallDistance: v })} />}
          {!wall && <SelectField
            label="Environment"
            value={sim.room}
            onChange={(room) => set({ room })}
            options={[
              { value: 'room', label: 'Room — four walls' },
              { value: 'single', label: 'Single wall (rotatable)' },
            ]}
          />}
          {!wall && sim.room === 'single' && <NumberField label="Wall orientation" value={sim.wallYaw} min={-60} max={60} unit="°" onChange={(v) => set({ wallYaw: v })} />}
          <NumberField label={wall ? 'Rotate on the wall' : 'Rotate lamp'} value={sim.lampYaw} min={-180} max={180} unit="°" onChange={(v) => set({ lampYaw: v })} />
          <ExpertOnly>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium text-ink-300">Light position offset</span>
              <button className="text-ink-400 hover:text-ink-100" onClick={() => set({ lightOffset: [0, 0, 0] })} aria-label="Reset light offset">
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
            {(['X', 'Y', 'Z'] as const).map((axis, i) => (
              <NumberField
                key={axis}
                label={`${axis} offset`}
                value={sim.lightOffset[i]}
                min={-15}
                max={15}
                step={0.5}
                unit="mm"
                onChange={(v) => {
                  const o = [...sim.lightOffset] as [number, number, number];
                  o[i] = v;
                  set({ lightOffset: o });
                }}
              />
            ))}
          </div>
          </ExpertOnly>
          <div className="space-y-1">
            <div className="text-[11.5px] font-medium text-ink-300">Wall colour</div>
            <div className="flex gap-1.5">
              {WALLS.map((c) => (
                <button key={c} aria-label={c} onClick={() => set({ wallColor: c })} className={cn('h-5 w-5 rounded-full border-2', sim.wallColor === c ? 'border-glow-400' : 'border-ink-600')} style={{ background: c }} />
              ))}
            </div>
            <div className="text-[11.5px] font-medium text-ink-300">Floor / table</div>
            <div className="flex gap-1.5">
              {FLOORS.map((c) => (
                <button key={c} aria-label={c} onClick={() => set({ floorColor: c })} className={cn('h-5 w-5 rounded-full border-2', sim.floorColor === c ? 'border-glow-400' : 'border-ink-600')} style={{ background: c }} />
              ))}
            </div>
          </div>
          <ExpertOnly>
          <NumberField label="Room brightness" value={sim.ambient} min={0} max={80} step={0.5} unit="lx" onChange={(v) => set({ ambient: v })} />
          <NumberField label="Exposure" value={sim.exposure} min={0.1} max={6} step={0.05} onChange={(v) => set({ exposure: v })} />
          <SelectField
            label="Soft-shadow samples"
            value={String(sim.quality) as '8' | '24' | '64'}
            onChange={(v) => set({ quality: Number(v) as 8 | 24 | 64 })}
            options={[
              { value: '8', label: '8 — fast' },
              { value: '24', label: '24 — balanced' },
              { value: '64', label: '64 — smooth penumbra' },
            ]}
          />
          <ToggleField label="Show light rays" checked={sim.showRays} onChange={(v) => set({ showRays: v })} />
          </ExpertOnly>
        </div>
      )}
    </div>
  );
}
