import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { ExpertOnly, NumberField, SelectField, SubHeading } from '@/components/common/Fields';
import { LIMITS } from '@/engines/defaults';
import { printRecommendations, recommendedClearance, recommendedMinFeature } from '@/engines/printing/recommendations';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import type { PrintConfig } from '@/types';

const up = (patch: Partial<PrintConfig>) => useDesignStore.getState().update('print', patch);

export function PrintSettings() {
  const design = useDesignStore((s) => s.design);
  const result = useGeometryStore((s) => s.result);
  const p = design.print;
  const recs = useMemo(() => printRecommendations(design, result), [design, result]);

  const setPrinter = (printer: PrintConfig['printer']) => {
    const next = { ...p, printer };
    up({
      printer,
      material: printer === 'SLA' ? 'Resin' : p.material === 'Resin' ? 'PLA' : p.material,
      minFeature: recommendedMinFeature(next),
      clearance: recommendedClearance(next),
      layerHeight: printer === 'SLA' ? 0.05 : 0.2,
    });
  };

  return (
    <div className="space-y-3 px-4 pb-6">
      <SubHeading>Printer</SubHeading>
      <div className="grid grid-cols-2 gap-2">
        <SelectField label="Printer type" value={p.printer} onChange={setPrinter} options={[{ value: 'FDM', label: 'FDM (filament)' }, { value: 'SLA', label: 'SLA (resin)' }]} />
        <SelectField
          label="Material"
          value={p.material}
          onChange={(material) => up({ material })}
          options={(p.printer === 'SLA' ? ['Resin'] : ['PLA', 'PETG', 'ABS']).map((m) => ({ value: m as PrintConfig['material'], label: m }))}
        />
      </div>
      {p.printer === 'FDM' && (
        <NumberField label="Nozzle diameter" value={p.nozzle} min={LIMITS.nozzle[0]} max={LIMITS.nozzle[1]} step={0.05} unit="mm" onChange={(nozzle) => up({ nozzle, minFeature: recommendedMinFeature({ printer: p.printer, nozzle }) })} />
      )}
      <NumberField label="Layer height" value={p.layerHeight} min={LIMITS.layerHeight[0]} max={LIMITS.layerHeight[1]} step={0.01} unit="mm" onChange={(layerHeight) => up({ layerHeight })} />
      <ExpertOnly>
      {p.printer === 'FDM' && <NumberField label="Infill" value={p.infill} min={LIMITS.infill[0]} max={LIMITS.infill[1]} step={5} unit="%" onChange={(infill) => up({ infill })} />}
      <SelectField
        label="Panel print orientation"
        value={p.orientation}
        onChange={(orientation) => up({ orientation })}
        options={[
          { value: 'outer-down', label: 'Flat, outer face on the bed' },
          { value: 'inner-down', label: 'Flat, inner face on the bed' },
        ]}
      />
      <SelectField
        label="Supports"
        value={p.supports}
        onChange={(supports) => up({ supports })}
        options={[
          { value: 'none', label: 'None (recommended)' },
          { value: 'auto', label: 'Auto / touching build plate' },
          { value: 'everywhere', label: 'Everywhere' },
        ]}
      />
      <SubHeading>Geometry tolerances</SubHeading>
      <NumberField
        label="Minimum feature"
        value={p.minFeature}
        min={LIMITS.minFeature[0]}
        max={LIMITS.minFeature[1]}
        step={0.05}
        unit="mm"
        onChange={(minFeature) => up({ minFeature })}
        help="Thinnest wall, gap or bridge the generator will produce. Regenerates the panels."
      />
      <NumberField label="Assembly clearance" value={p.clearance} min={LIMITS.clearance[0]} max={LIMITS.clearance[1]} step={0.05} unit="mm" onChange={(clearance) => up({ clearance })} />
      </ExpertOnly>

      <SubHeading>Recommendations</SubHeading>
      <ul className="space-y-2">
        {recs.map((r) => (
          <li key={r.id} className="rounded-lg border border-ink-700 bg-ink-800/50 p-2.5">
            <div className="flex items-center gap-1.5">
              {r.status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> : r.status === 'warn' ? <AlertTriangle className="h-3.5 w-3.5 text-warn" /> : <Info className="h-3.5 w-3.5 text-cool-400" />}
              <span className="flex-1 text-[12px] font-medium text-ink-100">{r.title}</span>
              <span className="num text-[11px] text-ink-300">{r.value}</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-400">{r.detail}</p>
          </li>
        ))}
      </ul>
      <p className="text-[10.5px] leading-snug text-ink-500">
        Guidance only: tune for your printer, slicer and material. Nothing here guarantees a print on a specific machine.
      </p>
    </div>
  );
}
