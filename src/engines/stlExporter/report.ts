import { printRecommendations } from '../printing/recommendations';
import { panelLabel } from '../projectionGeometry/mounting';
import type { DesignConfig, LampGeometryResult } from '@/types';
import { PANEL_IDS } from '@/types';

/** Human-readable build report shipped inside the ZIP. */
export function buildReport(design: DesignConfig, r: LampGeometryResult, printReady: boolean): string {
  const L: string[] = [];
  const f = (v: number, d = 1) => v.toFixed(d);
  L.push('GIFTIEVERSE SHADOW LAMP STUDIO — BUILD REPORT', `Generated ${new Date().toISOString()}`, '');
  L.push('UNITS: millimetres. ' + (printReady ? 'Part STLs are in print orientation (flat on the bed, Z up).' : 'Part STLs are in assembly coordinates (Y up).'));
  L.push('Assembled_Model.stl is always in assembly coordinates (multiple bodies, reference only).', '');
  const { lamp, light, projection, print, mounting } = design;
  const wall = mounting.type === 'wall';
  if (wall) {
    L.push('LAMP — WALL-MOUNTED (open front, LED on a post)');
    L.push(`  Wall plate ${lamp.width} × ${lamp.depth} mm (width × height), side walls stand ${lamp.height} mm off the wall, ${lamp.wallThickness} mm thick`);
    L.push(`  LED emitter ${f(r.light[1])} mm from the wall, emitter size ${light.emitterSize} mm, ${light.flux} lm; lamp centre ${mounting.height} mm above the floor`);
    if (r.figure)
      L.push(
        `  Figure on the wall: ${f(r.figure.width / 10, 0)} × ${f(r.figure.height / 10, 0)} cm, fidelity ${r.figure.fidelity !== null ? f(r.figure.fidelity * 100) + '%' : 'n/a'}, edge blur ${f(r.figure.nearBlur, 0)}–${f(r.figure.farBlur, 0)} mm, lamp inside figure ${f(r.figure.lampCoveredPct, 0)}%`,
      );
    const deco = design.decoration;
    if (deco.kind !== 'none')
      L.push(
        `  Wall plate decoration: raised ${deco.kind === 'text' ? `text "${deco.text.replace(/\n/g, ' / ')}" (${deco.font} font)` : `${deco.icon === 'figure' ? 'copy of the figure' : deco.icon}`}, ${deco.position} the LED, ${deco.height} mm high`,
      );
    L.push('  File names: Lower/Upper/Left/Right_Wall = side walls as seen when hanging; Wall_Plate; LED_Post.', '');
  } else {
    L.push('LAMP', `  ${lamp.width} × ${lamp.depth} × ${lamp.height} mm, panels ${lamp.wallThickness} mm, base ${lamp.baseThickness} mm, top ${lamp.topCover ? lamp.topThickness + ' mm' : 'open'}`);
    L.push(`  LED emitter at (${r.light.map((v) => f(v)).join(', ')}) mm, emitter size ${light.emitterSize} mm, ${light.flux} lm`);
    L.push(`  Projection: ${projection.style} style, target wall ${projection.wallDistance} mm from each panel face (yaw ${projection.wallYaw}°, tilt ${projection.wallPitch}°)`, '');
  }
  L.push(wall ? 'SIDE WALLS' : 'PANELS');
  for (const id of PANEL_IDS) {
    const p = r.panels[id];
    L.push(`  ${panelLabel(mounting.type, id).toUpperCase().padEnd(6)} ${f(p.width)} × ${f(p.height)} × ${f(p.thickness)} mm  ${p.active ? 'projecting' : 'solid'}`);
    if (!p.active) continue;
    L.push(
      `         image ${f(p.imageWidth / 10, 0)} × ${f(p.imageHeight / 10, 0)} cm, magnification ${f(p.magnification, 2)}×, edge blur ≈ ${f(p.penumbra, 0)} mm, open ${f(p.openAreaPct, 0)}%, bridges ${p.bridges}, fidelity ${p.fidelity !== null ? f(p.fidelity * 100) + '%' : 'n/a'}`,
    );
    for (const x of p.findings) L.push(`         [${x.severity}] ${x.message}`);
  }
  L.push('', 'MESH VALIDATION');
  for (const v of r.validation) {
    L.push(
      `  ${v.partId.padEnd(10)} ${v.status.toUpperCase().padEnd(5)} tris ${String(v.triangles).padStart(6)}  watertight ${v.watertight ? 'yes' : 'NO'}  winding ${v.orientationConsistent ? 'ok' : 'BAD'}  shells ${v.shells}  self-intersections ${v.selfIntersections}  volume ${f(v.volume / 1000, 2)} cm³  size ${v.size.map((s) => f(s)).join(' × ')} mm`,
    );
    for (const i of v.issues) L.push(`             ! ${i}`);
  }
  L.push('', 'PRINT SETTINGS', `  ${print.printer} · ${print.material} · nozzle ${print.nozzle} mm · layer ${print.layerHeight} mm · infill ${print.infill}% · min feature ${print.minFeature} mm · clearance ${print.clearance} mm`);
  L.push('', 'RECOMMENDATIONS (guidance, not guarantees)');
  for (const rec of printRecommendations(design, r)) L.push(`  - ${rec.title}: ${rec.value}. ${rec.detail}`);
  if (wall) {
    L.push('', 'ASSEMBLY & HANGING');
    L.push('  1. Glue the LED post flange into the socket ring on the wall plate; run the leads down the bore and out along the groove (it exits at the bottom edge).');
    L.push(
      lamp.fingerJoints
        ? '  2. Drop each side wall\'s tabs into the matching notches at the plate edge (upper and lower walls first, then left and right between them); a drop of glue in each notch and at the corners makes it permanent.'
        : '  2. Fit the upper and lower side walls outside the locating lip, then the left and right walls between them; glue the corners.',
    );
    L.push(`  3. Seat an omnidirectional emitter (filament / tube LED) at the post tip, ${f(r.light[1])} mm from the wall.`);
    if (mounting.keyholes)
      L.push(`  4. Drive two screws (head ≤ ${mounting.screwHead} mm, shank ≤ ${mounting.screwShank} mm) into the wall, leaving the heads ~3 mm proud, matching the keyhole spacing; hang the lamp and slide it down.`);
    L.push(`  ${mounting.keyholes ? 5 : 4}. Mount with the lamp centre about ${mounting.height} mm above the floor ("Lower_Wall" pointing down); view in a dark room.`);
  } else {
    L.push('', 'ASSEMBLY', '  1. Insert the LED holder flange into the socket ring on the base; feed the LED leads down the bore and along the underside groove.');
    L.push(
      lamp.fingerJoints
        ? '  2. Drop the front and back panels\' tabs into the notches at the base edge, then the left and right panels between them.'
        : '  2. Stand the front and back panels on the base outside the locating lip; slide the left and right panels between them.',
    );
    L.push('  3. Seal the vertical corner joints with a thin bead of glue to stop light leaking, then press the top cover on.');
    L.push('  4. Place the lamp so the front panel faces the wall at the design distance, in a dark room.');
  }
  return L.join('\n');
}
