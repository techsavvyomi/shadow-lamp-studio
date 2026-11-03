/**
 * Print-preparation guidance derived from the design and the generated geometry.
 * These are rules of thumb tied to the chosen printer/material settings — every
 * value is configurable and none is a guarantee for a particular machine.
 */
import type { DesignConfig, LampGeometryResult, PrintConfig } from '@/types';
import { PANEL_IDS } from '@/types';

export type RecStatus = 'ok' | 'warn' | 'info';

export interface Recommendation {
  id: string;
  title: string;
  value: string;
  detail: string;
  status: RecStatus;
}

export function recommendedMinFeature(p: Pick<PrintConfig, 'printer' | 'nozzle'>): number {
  return p.printer === 'SLA' ? 0.4 : Math.round(p.nozzle * 2 * 100) / 100;
}

export function recommendedClearance(p: Pick<PrintConfig, 'printer'>): number {
  return p.printer === 'SLA' ? 0.1 : 0.2;
}

export function printRecommendations(design: DesignConfig, result: LampGeometryResult | null): Recommendation[] {
  const { print, lamp, light } = design;
  const out: Recommendation[] = [];
  const fdm = print.printer === 'FDM';

  // Minimum wall thickness
  const minWall = fdm ? 2 * print.nozzle : 0.6;
  out.push({
    id: 'wall',
    title: 'Minimum wall thickness',
    value: `${minWall.toFixed(2)} mm`,
    status: lamp.wallThickness >= minWall ? 'ok' : 'warn',
    detail: fdm
      ? `Two perimeters of a ${print.nozzle} mm nozzle. Panels are ${lamp.wallThickness} mm (${(lamp.wallThickness / print.layerHeight).toFixed(0)} layers flat).`
      : `Unsupported resin walls below ~0.6 mm tend to warp or break. Panels are ${lamp.wallThickness} mm.`,
  });

  // Feature size used by the geometry engine
  const recFeature = recommendedMinFeature(print);
  out.push({
    id: 'feature',
    title: 'Minimum feature / bridge width',
    value: `${print.minFeature} mm`,
    status: print.minFeature >= recFeature * 0.99 ? 'ok' : 'warn',
    detail: `Recommended ≥ ${recFeature} mm for this setup. The generator thickens thinner features, closes narrower gaps and makes bridges at least this wide.`,
  });

  // Panel strength
  const panels = result ? PANEL_IDS.map((id) => result.panels[id]).filter((p) => p.active) : [];
  const maxOpen = panels.reduce((m, p) => Math.max(m, p.openAreaPct), 0);
  const bridges = panels.reduce((s, p) => s + p.bridges, 0);
  out.push({
    id: 'strength',
    title: 'Panel strength',
    value: result ? `${maxOpen.toFixed(0)}% open max` : '—',
    status: maxOpen > 65 || (bridges > 0 && design.projection.bridgeWidth < 1) ? 'warn' : 'ok',
    detail:
      maxOpen > 65
        ? 'Large open area: consider a thicker panel (≥ 2 mm), wider bridges, or the "light" projection style for a stiffer stencil.'
        : `Open area is moderate.${bridges ? ` ${bridges} bridge${bridges > 1 ? 's' : ''} carry the floating parts — handle panels by the frame.` : ''}`,
  });

  // Light leakage
  const thinTranslucent = fdm && lamp.wallThickness < 2.4;
  out.push({
    id: 'leak',
    title: 'Light leakage',
    value: thinTranslucent ? 'Use dark filament' : 'OK',
    status: thinTranslucent ? 'warn' : 'info',
    detail: `${
      fdm
        ? `Light-coloured ${print.material} at ${lamp.wallThickness} mm glows through. Print panels in black/dark filament, or paint the inner faces matt black.`
        : 'Use an opaque (pigmented) resin; clear and translucent resins will not cast a crisp shadow.'
    } The base and top lips seal the panel edges; a thin bead of glue at the vertical corners stops light bleeding out of the butt joints.`,
  });

  // Clearance
  const recClear = recommendedClearance(print);
  out.push({
    id: 'clearance',
    title: 'Assembly clearance',
    value: `${print.clearance} mm`,
    status: Math.abs(print.clearance - recClear) <= 0.1 ? 'ok' : 'warn',
    detail: `Gap between the panels and the locating lips, and around the LED holder flange. Typical: ${recClear} mm for ${print.printer}. Print a corner test piece if your printer runs tight or loose.`,
  });

  // LED heat / ventilation
  const watts = light.flux / 100; // ~100 lm/W for white LEDs
  const softens = print.material === 'PLA' ? 55 : print.material === 'PETG' ? 75 : print.material === 'ABS' ? 95 : 60;
  const hot = watts > (lamp.topVents && lamp.topCover ? 1.5 : 0.75);
  out.push({
    id: 'vent',
    title: 'LED ventilation',
    value: `≈ ${watts.toFixed(1)} W LED`,
    status: hot ? 'warn' : 'ok',
    detail: `${print.material} softens near ${softens} °C. ${
      hot
        ? 'Reduce LED power, enable top vents, or use PETG/ABS.'
        : lamp.topCover && !lamp.topVents
          ? 'Low power — a closed top is acceptable, vents optional.'
          : 'Power level is comfortable for this enclosure.'
    } Note: vents above the LED project bright spots on the ceiling.`,
  });

  // Print orientation / overhang of the ray-aligned cut-out walls
  let maxRayAngle = 0;
  if (result) {
    for (const id of PANEL_IDS) {
      const p = result.panels[id];
      const d = result.drawings[id];
      if (!p.active) continue;
      for (const loop of d.holesInner)
        for (const [x, y] of loop) {
          const r = Math.hypot(x - d.lightFoot[0], y - d.lightFoot[1]);
          maxRayAngle = Math.max(maxRayAngle, Math.atan(r / Math.max(p.lightDistance, 1e-6)));
        }
    }
  }
  const angleDeg = (maxRayAngle * 180) / Math.PI;
  const stepPerLayer = print.layerHeight * Math.tan(maxRayAngle);
  const outerDown = print.orientation === 'outer-down';
  out.push({
    id: 'orientation',
    title: 'Print orientation',
    value: outerDown ? 'Flat, outer face down' : 'Flat, inner face down',
    status: outerDown && fdm && stepPerLayer > print.nozzle * 0.6 ? 'warn' : 'ok',
    detail: outerDown
      ? `Best outer finish. Cut-out walls follow the light rays (up to ${angleDeg.toFixed(0)}° from vertical); printed outer-face-down that is an overhang of ${stepPerLayer.toFixed(2)} mm per layer${fdm && stepPerLayer > print.nozzle * 0.6 ? ' — consider inner-face-down' : ''}.`
      : `Cut-out walls widen upwards, so there are no overhangs (up to ${angleDeg.toFixed(0)}° ray angle). The outer face is the top surface.`,
  });

  out.push({
    id: 'supports',
    title: 'Supports',
    value: 'Not required',
    status: print.supports === 'everywhere' ? 'warn' : 'ok',
    detail:
      'Every part is designed to print without supports: panels flat, base with the wire groove bridging, top cover upside down, LED holder flange-down.' +
      (print.supports === 'everywhere' ? ' "Everywhere" supports would fill the cut-outs and damage edges.' : ''),
  });

  out.push({
    id: 'infill',
    title: 'Infill',
    value: `${print.infill}%`,
    status: fdm && print.infill < 40 ? 'warn' : 'ok',
    detail: fdm
      ? 'Thin panels are almost all perimeter; use ≥ 40% (100% for best opacity) so the base and lips stay rigid.'
      : 'Resin parts are solid; infill does not apply unless hollowing.',
  });

  if (design.mounting.type === 'wall') {
    const m = design.mounting;
    out.push({
      id: 'mount',
      title: 'Wall mounting',
      value: m.keyholes ? '2 keyholes' : 'No keyholes',
      status: m.keyholes ? 'ok' : 'info',
      detail: m.keyholes
        ? `Use two screws with heads up to ${m.screwHead} mm and shanks up to ${m.screwShank} mm, heads left ~3 mm proud; the lamp hangs on them and slides down. Plugs suited to your wall type.`
        : 'Fix the wall plate with adhesive pads or your own screws.',
    });
    out.push({
      id: 'emitter',
      title: 'Light source',
      value: design.light.pattern === 'isotropic' ? 'Omnidirectional' : 'Forward-facing',
      status: design.light.pattern === 'isotropic' ? 'ok' : 'warn',
      detail: 'The light must travel back towards the wall: use a filament, tube or side-emitting LED at the post tip, not a forward-facing SMD. A smaller emitter gives crisper figure edges.',
    });
  }

  if (print.printer === 'SLA' && print.material !== 'Resin')
    out.push({ id: 'material', title: 'Material', value: print.material, status: 'warn', detail: 'SLA printers use resin; switch the material to Resin.' });
  if (print.printer === 'FDM' && print.material === 'Resin')
    out.push({ id: 'material', title: 'Material', value: print.material, status: 'warn', detail: 'FDM printers use filament (PLA/PETG/ABS).' });

  return out;
}
