import { Box, Boxes, Eye, Lightbulb, Palette, PanelsTopLeft, ScanEye } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, Switch, Tip, ToggleGroup, ToggleGroupItem } from '@/components/ui/primitives';
import { MATERIALS, useViewStore, type MaterialPreset, type ViewMode } from '@/stores/viewStore';
import { PART_IDS, type PartId } from '@/types';
import { cn } from '@/utils';

const MODES: { id: ViewMode; label: string; icon: typeof Box; hint: string }[] = [
  { id: 'assembled', label: 'Assembled', icon: Box, hint: 'The lamp as it will stand on the table' },
  { id: 'exploded', label: 'Exploded', icon: Boxes, hint: 'Parts separated along their assembly direction' },
  { id: 'internal', label: 'Internal', icon: ScanEye, hint: 'See-through panels: LED, holder and base' },
  { id: 'panels', label: 'Panels', icon: PanelsTopLeft, hint: 'All four panels side by side — click one to inspect' },
  { id: 'simulation', label: 'Shadow sim', icon: Lightbulb, hint: 'Room with walls lit by the LED through the generated geometry' },
];

const PART_LABEL: Record<PartId, string> = {
  front: 'Front panel',
  right: 'Right panel',
  back: 'Back panel',
  left: 'Left panel',
  base: 'Base plate',
  top: 'Top cover',
  ledHolder: 'LED holder',
};

export function ViewModeBar() {
  const mode = useViewStore((s) => s.mode);
  const visible = useViewStore((s) => s.visible);
  const material = useViewStore((s) => s.material);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex items-start justify-center gap-2 px-3">
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && useViewStore.getState().setMode(v as ViewMode)}
        className="pointer-events-auto w-auto border-ink-600/80 bg-ink-850/85 shadow-xl shadow-black/40 backdrop-blur"
      >
        {MODES.map((m) => (
          <Tip key={m.id} content={m.hint} side="bottom">
            <ToggleGroupItem value={m.id} className={cn('px-2.5 py-1.5', m.id === 'simulation' && 'data-[state=on]:bg-glow-500/20')}>
              <m.icon />
              <span className="hidden md:inline">{m.label}</span>
            </ToggleGroupItem>
          </Tip>
        ))}
      </ToggleGroup>

      <div className="pointer-events-auto flex gap-1 rounded-md border border-ink-600/80 bg-ink-850/85 p-0.5 shadow-xl shadow-black/40 backdrop-blur">
        <Popover>
          <Tip content="Part visibility" side="bottom">
            <PopoverTrigger className="flex h-7 w-7 items-center justify-center rounded text-ink-300 hover:bg-ink-700 hover:text-ink-100" aria-label="Part visibility">
              <Eye className="h-3.5 w-3.5" />
            </PopoverTrigger>
          </Tip>
          <PopoverContent className="w-52 space-y-1.5">
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">Visible parts</div>
            {PART_IDS.map((id) => (
              <label key={id} className="flex cursor-pointer items-center justify-between text-[12px] text-ink-200">
                {PART_LABEL[id]}
                <Switch checked={visible[id]} onCheckedChange={() => useViewStore.getState().toggleVisible(id)} />
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <Popover>
          <Tip content="Material appearance" side="bottom">
            <PopoverTrigger className="flex h-7 w-7 items-center justify-center rounded text-ink-300 hover:bg-ink-700 hover:text-ink-100" aria-label="Material">
              <Palette className="h-3.5 w-3.5" />
            </PopoverTrigger>
          </Tip>
          <PopoverContent className="w-52 space-y-1">
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">Material</div>
            {(Object.keys(MATERIALS) as MaterialPreset[]).map((k) => (
              <button
                key={k}
                onClick={() => useViewStore.getState().setMaterial(k)}
                className={cn('flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-ink-700', material === k ? 'text-glow-200' : 'text-ink-200')}
              >
                <span className="h-3.5 w-3.5 rounded-full border border-ink-500" style={{ background: MATERIALS[k].color }} />
                {MATERIALS[k].label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
