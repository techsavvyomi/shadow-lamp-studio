import { Moon, Sun } from 'lucide-react';
import { ExpertOnly, NumberField, SelectField, SubHeading, ToggleField } from '@/components/common/Fields';
import { Button, ToggleGroup, ToggleGroupItem } from '@/components/ui/primitives';
import { LIMITS } from '@/engines/defaults';
import { minLightHeight } from '@/engines/lampGeometry/structure';
import { lampLayout } from '@/engines/projectionGeometry/frames';
import { panelLabel } from '@/engines/projectionGeometry/mounting';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { PANEL_IDS, type LampDimensions, type LightConfig, type PanelId, type ProjectionConfig } from '@/types';
import { cn } from '@/utils';
import { PlacementPad } from './PlacementPad';

const upLamp = (patch: Partial<LampDimensions>) => useDesignStore.getState().update('lamp', patch);
const upProj = (patch: Partial<ProjectionConfig>) => useDesignStore.getState().update('projection', patch);
const upLight = (patch: Partial<LightConfig>, key?: string) => useDesignStore.getState().update('light', patch, key);

export function LampDimensionsPanel() {
  const l = useDesignStore((s) => s.design.lamp);
  const wall = useDesignStore((s) => s.design.mounting.type === 'wall');
  return (
    <div className="space-y-3">
      <NumberField label={wall ? 'Width on the wall' : 'Width'} value={l.width} min={LIMITS.width[0]} max={LIMITS.width[1]} unit="mm" onChange={(width) => upLamp({ width })} help={wall ? 'Horizontal size of the wall plate.' : 'Front/back panel width (X).'} />
      <NumberField label={wall ? 'Height on the wall' : 'Depth'} value={l.depth} min={LIMITS.depth[0]} max={LIMITS.depth[1]} unit="mm" onChange={(depth) => upLamp({ depth })} help={wall ? 'Vertical size of the wall plate.' : 'Side panel extent (Z).'} />
      <NumberField
        label={wall ? 'Side walls stand-off' : 'Height'}
        value={l.height}
        min={LIMITS.height[0]}
        max={LIMITS.height[1]}
        unit="mm"
        onChange={(height) => upLamp({ height })}
        help={wall ? 'How far the side walls stand off the wall, plate included. The closer they reach to the LED, the larger (and softer) the figure.' : 'Overall height including base and top cover.'}
      />
      <SubHeading>Thickness</SubHeading>
      <NumberField label="Panel thickness" value={l.wallThickness} min={LIMITS.wallThickness[0]} max={LIMITS.wallThickness[1]} step={0.1} unit="mm" onChange={(wallThickness) => upLamp({ wallThickness })} help="1–1.5 mm suits a 0.4 mm nozzle: stiff, opaque and quick to print." />
      <ExpertOnly>
      <NumberField label={wall ? 'Wall plate thickness' : 'Base thickness'} value={l.baseThickness} min={LIMITS.baseThickness[0]} max={LIMITS.baseThickness[1]} step={0.1} unit="mm" onChange={(baseThickness) => upLamp({ baseThickness })} />
      <NumberField
        label={wall ? 'Base strip height' : 'Frame margin'}
        value={l.frameMargin}
        min={LIMITS.frameMargin[0]}
        max={LIMITS.frameMargin[1]}
        step={0.5}
        unit="mm"
        onChange={(frameMargin) => upLamp({ frameMargin })}
        help={wall ? 'Solid strip along the foot of each side wall that seats it on the plate. It shades a thin band right around the lamp.' : "Solid border around each panel's projection window — stiffens the panel."}
      />
      <NumberField label="Locating lip height" value={l.lipHeight} min={LIMITS.lipHeight[0]} max={LIMITS.lipHeight[1]} step={0.5} unit="mm" onChange={(lipHeight) => upLamp({ lipHeight })} />
      <ToggleField
        label="Finger joints"
        checked={l.fingerJoints}
        onChange={(fingerJoints) => upLamp({ fingerJoints })}
        help={`Tabs on the foot of each ${wall ? 'side wall' : 'panel'} drop into notches in the ${wall ? 'wall plate' : 'base'}, so the parts locate themselves. Off: plain butt joints against the lip.`}
      />
      {!wall && <SubHeading>Top cover</SubHeading>}
      {!wall && <ToggleField label="Top cover" checked={l.topCover} onChange={(topCover) => upLamp({ topCover })} help="Without a cover, light escapes upwards and washes the walls above the image." />}
      {!wall && l.topCover && (
        <>
          <NumberField label="Cover thickness" value={l.topThickness} min={LIMITS.topThickness[0]} max={LIMITS.topThickness[1]} step={0.1} unit="mm" onChange={(topThickness) => upLamp({ topThickness })} />
          <ToggleField label="Ventilation holes" checked={l.topVents} onChange={(topVents) => upLamp({ topVents })} />
        </>
      )}
      </ExpertOnly>
    </div>
  );
}

export function ProjectionPanel() {
  const p = useDesignStore((s) => s.design.projection);
  const wall = useDesignStore((s) => s.design.mounting.type === 'wall');
  const label = (id: PanelId) => panelLabel(wall ? 'wall' : 'table', id);
  const activeCount = PANEL_IDS.filter((id) => p.activePanels[id]).length;
  const setCount = (n: number) => {
    const order: PanelId[] = ['front', 'back', 'left', 'right'];
    upProj({ activePanels: Object.fromEntries(order.map((id, i) => [id, i < n])) as Record<PanelId, boolean> });
  };
  return (
    <div className="space-y-3">
      {wall && (
        <p className="rounded-md border border-glow-500/30 bg-glow-400/8 px-2.5 py-2 text-[11px] leading-snug text-ink-200">
          Wall lamp: one dark silhouette is cast onto the wall around the lamp, inside a bright halo. Each side wall's shaped edge casts the part of the figure on its side.
        </p>
      )}
      {!wall && (
      <div className="space-y-1">
        <div className="text-[11.5px] font-medium text-ink-300">Projection style</div>
        <ToggleGroup type="single" value={p.style} onValueChange={(v) => v && upProj({ style: v as ProjectionConfig['style'] })}>
          <ToggleGroupItem value="shadow">
            <Moon /> Shadow figure
          </ToggleGroupItem>
          <ToggleGroupItem value="light">
            <Sun /> Light figure
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-[10.5px] leading-snug text-ink-400">
          {p.style === 'shadow'
            ? 'Dark silhouette inside a lit field. The figure is suspended in the window by bridges.'
            : 'Lit silhouette on a dark wall. The panel is a stencil; enclosed details are bridged.'}
        </p>
      </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[11.5px] font-medium text-ink-300">{wall ? 'Shaped side walls' : 'Active panels'}</div>
          <div className="flex gap-0.5">
            {[1, 2, 4].map((n) => (
              <Button key={n} size="sm" variant={activeCount === n ? 'outline' : 'ghost'} className={cn('h-6 px-2 text-[11px]', activeCount === n && 'border-glow-500 text-glow-200')} onClick={() => setCount(n)}>
                {n}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {PANEL_IDS.map((id) => (
            <button
              key={id}
              onClick={() => upProj({ activePanels: { ...p.activePanels, [id]: !p.activePanels[id] } })}
              className={cn(
                'rounded-md border py-1.5 text-[11px] font-medium transition-colors',
                p.activePanels[id] ? 'border-glow-500/70 bg-glow-400/10 text-glow-200' : 'border-ink-600 bg-ink-800 text-ink-400 hover:text-ink-200',
              )}
            >
              {label(id)}
            </button>
          ))}
        </div>
      </div>

      <ExpertOnly>
      {!wall && (
        <>
      <SubHeading>Target wall</SubHeading>
      <NumberField label="Wall distance" value={p.wallDistance} min={LIMITS.wallDistance[0]} max={LIMITS.wallDistance[1]} step={10} unit="mm" onChange={(wallDistance) => upProj({ wallDistance })} help="Distance from each panel's outer face to the wall the design is computed for." />
      <NumberField label="Wall yaw" value={p.wallYaw} min={LIMITS.wallYaw[0]} max={LIMITS.wallYaw[1]} unit="°" onChange={(wallYaw) => upProj({ wallYaw })} help="Custom projection angle: the target wall rotated about the vertical axis." />
      <NumberField label="Wall tilt" value={p.wallPitch} min={LIMITS.wallPitch[0]} max={LIMITS.wallPitch[1]} unit="°" onChange={(wallPitch) => upProj({ wallPitch })} help="Positive tilts the top of the wall towards the lamp (e.g. a sloped ceiling)." />
      <ToggleField label="Keep above the table line" checked={p.respectFloor} onChange={(respectFloor) => upProj({ respectFloor })} help="Rays aimed below the table hit the table first; keeping the projection above it avoids losing part of the figure." />
        </>
      )}
      </ExpertOnly>

      <SubHeading>Silhouette placement</SubHeading>
      {wall && <p className="-mt-1 text-[10.5px] leading-snug text-ink-400">The lamp sits at the deepest point of the figure; offsets move the figure around the lamp.</p>}
      <NumberField label="Size (of max feasible)" value={Math.round(p.fill * 100)} min={10} max={100} unit="%" onChange={(v) => upProj({ fill: v / 100 })} />
      <PlacementPad />
      <ExpertOnly>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Offset right" value={p.offsetU} min={-1500} max={1500} step={1} unit="mm" onChange={(offsetU) => upProj({ offsetU })} />
          <NumberField label="Offset up" value={p.offsetV} min={-1500} max={1500} step={1} unit="mm" onChange={(offsetV) => upProj({ offsetV })} />
        </div>
      </ExpertOnly>
      <NumberField label="Rotation" value={p.rotation} min={-180} max={180} unit="°" onChange={(rotation) => upProj({ rotation })} />
      <ToggleField label="Mirror" checked={p.mirror} onChange={(mirror) => upProj({ mirror })} />

      <ExpertOnly>
      <SubHeading>Manufacturability</SubHeading>
      <NumberField label="Bridge width" value={p.bridgeWidth} min={LIMITS.bridgeWidth[0]} max={LIMITS.bridgeWidth[1]} step={0.1} unit="mm" onChange={(bridgeWidth) => upProj({ bridgeWidth })} help="Struts that hold floating islands. Wider = stronger but more visible on the wall." />
      <SelectField
        label="Features thinner than the minimum"
        value={p.thinFeatures}
        onChange={(thinFeatures) => upProj({ thinFeatures })}
        options={[
          { value: 'thicken', label: 'Thicken to printable width' },
          { value: 'remove', label: 'Remove' },
        ]}
      />
      </ExpertOnly>
    </div>
  );
}

export function LightPanel() {
  const light = useDesignStore((s) => s.design.light);
  const lamp = useDesignStore((s) => s.design.lamp);
  const wall = useDesignStore((s) => s.design.mounting.type === 'wall');
  const resolved = useGeometryStore((s) => s.result?.light);
  const penumbra = useGeometryStore((s) => (s.result?.figure ? s.result.figure.farBlur : s.result?.panels.front.penumbra));
  const [x, y, z] = light.position;
  const { panelTop } = lampLayout(lamp);
  const yMin = minLightHeight(lamp, light);
  const halfW = lamp.width / 2 - lamp.wallThickness - 3;
  const halfD = lamp.depth / 2 - lamp.wallThickness - 3;
  const clamped = resolved && (Math.abs(resolved[0] - x) > 0.01 || Math.abs(resolved[1] - y) > 0.01 || Math.abs(resolved[2] - z) > 0.01);
  return (
    <div className="space-y-3">
      <SubHeading>LED position</SubHeading>
      <NumberField
        label={wall ? 'Distance from the wall (post)' : 'Height above table'}
        value={y}
        min={Math.floor(yMin)}
        max={wall ? LIMITS.lightDistance[1] : Math.ceil(panelTop - 3)}
        step={0.5}
        unit="mm"
        onChange={(v) => upLight({ position: [x, v, z] }, 'light:y')}
        help={wall ? "The emitter's distance from the wall. Reach grows as the side walls approach this distance." : 'Lower LEDs throw more of each panel upward onto the wall.'}
      />
      <ExpertOnly>
      <NumberField label="Left ↔ right (X)" value={x} min={-Math.round(halfW)} max={Math.round(halfW)} step={0.5} unit="mm" onChange={(v) => upLight({ position: [v, y, z] }, 'light:x')} />
      <NumberField
        label={wall ? 'Up ↔ down (Z, + is down)' : 'Back ↔ front (Z)'}
        value={z}
        min={-Math.round(halfD)}
        max={Math.round(halfD)}
        step={0.5}
        unit="mm"
        onChange={(v) => upLight({ position: [x, y, v] }, 'light:z')}
      />
      </ExpertOnly>
      {clamped && resolved && (
        <p className="text-[10.5px] text-warn">
          Constrained to ({resolved.map((v) => v.toFixed(1)).join(', ')}) so the holder fits.
        </p>
      )}
      <SubHeading>Emitter</SubHeading>
      <NumberField
        label="Emitter size"
        value={light.emitterSize}
        min={LIMITS.emitterSize[0]}
        max={LIMITS.emitterSize[1]}
        step={0.1}
        unit="mm"
        onChange={(emitterSize) => upLight({ emitterSize })}
        help="Diameter of the light-emitting area. Shadow edge blur grows linearly with it — use a small bare LED die for crisp shadows."
      />
      {penumbra !== undefined && penumbra > 0 && <p className="text-[10.5px] text-ink-400">≈ {penumbra.toFixed(0)} mm edge blur {wall ? "at the figure's tips" : 'on the front wall'}.</p>}
      <ExpertOnly>
      <NumberField label="Luminous flux" value={light.flux} min={LIMITS.flux[0]} max={LIMITS.flux[1]} step={5} unit="lm" onChange={(flux) => upLight({ flux })} />
      <SelectField
        label="Emission pattern"
        value={light.pattern}
        onChange={(pattern) => upLight({ pattern })}
        options={[
          { value: 'isotropic', label: wall ? 'Omnidirectional (filament / tube LED)' : 'Omnidirectional (filament / bulb)' },
          { value: 'lambertian-up', label: wall ? 'Lambertian, facing the room (SMD LED)' : 'Lambertian, facing up (SMD LED)' },
        ]}
        help="Affects brightness distribution in the simulator only; geometry assumes rays leave from the emitter centre."
      />
      <SubHeading>{wall ? 'LED post' : 'Holder'}</SubHeading>
      <NumberField label="LED package diameter" value={light.ledDiameter} min={LIMITS.ledDiameter[0]} max={LIMITS.ledDiameter[1]} step={0.1} unit="mm" onChange={(ledDiameter) => upLight({ ledDiameter })} />
      <NumberField
        label="Emitter above holder rim"
        value={light.emitterAboveRim}
        min={LIMITS.emitterAboveRim[0]}
        max={LIMITS.emitterAboveRim[1]}
        step={0.5}
        unit="mm"
        onChange={(emitterAboveRim) => upLight({ emitterAboveRim })}
        help="The holder shadows rays steeper than atan(height / rim radius) below horizontal; the window is limited accordingly."
      />
      </ExpertOnly>
    </div>
  );
}
