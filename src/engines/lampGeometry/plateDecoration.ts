/**
 * Wall plate decoration: raised relief on the plate's front face, the surface the
 * LED lights up and the viewer sees inside the open lamp.
 *
 * Plate coordinates (u, v) are as seen from the room: u = lamp x (right),
 * v = −lamp z (up). The relief stays inside the side walls' locating lip, clear of
 * the LED post's socket and of the keyholes (the screw heads rest on the front
 * face). It sits in the shadow of the plate itself, so it never changes the figure
 * cast on the wall.
 */
import type { Finding, LampDimensions, MountingConfig, PlateDecoration, PlateDrawing, PrintConfig, SilhouetteData, Vec2, Vec3 } from '@/types';
import type { CrossSection, Manifold, ManifoldToplevel } from './manifoldRuntime';
import { Scope } from './manifoldRuntime';
import { rectLoop } from './panelOps';
import { buildUnitSilhouette, polygonsToLoops } from './silhouetteRegion';
import { extrudeUp, HOLDER, keyholeLayout } from './structure';

/** Clear gap kept between the relief and anything it must not touch, mm. */
const GAP = 2;

interface Box {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface PlateDecorationResult {
  /** Relief solid in lamp coordinates (to be united with the plate), or null. */
  relief: Manifold | null;
  drawing: PlateDrawing;
  findings: Finding[];
}

export function buildPlateDecoration(
  wasm: ManifoldToplevel,
  plate: Manifold,
  lamp: LampDimensions,
  light: Vec3,
  print: PrintConfig,
  mounting: MountingConfig,
  deco: PlateDecoration,
  art: SilhouetteData | null,
  out: Scope,
): PlateDecorationResult {
  const { CrossSection } = wasm;
  const s = new Scope();
  const findings: Finding[] = [];
  try {
    const c = print.clearance;
    const tb = lamp.baseThickness;
    const hx = lamp.width / 2 - lamp.wallThickness - c - HOLDER.lipWidth - GAP;
    const hz = lamp.depth / 2 - lamp.wallThickness - c - HOLDER.lipWidth - GAP;
    const led: Vec2 = [light[0], -light[2]];
    const postRadius = HOLDER.flangeRadius + c + HOLDER.socketWall + GAP;

    // ---- keep-out zones: LED socket and keyholes (incl. the screw head's seat) ----
    const keepOut: CrossSection[] = [s.keep(s.keep(CrossSection.circle(postRadius, 64)).translate(led))];
    const keyBoxes: Box[] = [];
    if (mounting.keyholes) {
      const k = keyholeLayout(lamp, print, mounting);
      for (const sx of [-1, 1]) {
        const b: Box = {
          u0: sx * k.kx - k.rHead - GAP,
          u1: sx * k.kx + k.rHead + GAP,
          v0: -(k.kz + k.rHead) - GAP,
          v1: -(k.kz - k.slotLen) + k.rHead + GAP,
        };
        keyBoxes.push(b);
        keepOut.push(s.keep(new CrossSection([rectLoop(b.u0, b.v0, b.u1, b.v1)], 'Positive')));
      }
    }
    const inner = s.keep(new CrossSection([rectLoop(-hx, -hz, hx, hz)], 'Positive'));
    const area = s.keep(inner.subtract(s.keep(CrossSection.union(keepOut))));

    // ---- plate cross-section for the drawing (above the underside cable groove) ----
    const sliced = s.keep(s.keep(plate.rotate([90, 0, 0])).slice(tb - 0.4));
    const drawing: PlateDrawing = {
      width: lamp.width,
      height: lamp.depth,
      plate: polygonsToLoops(sliced),
      area: polygonsToLoops(area),
      decoration: [],
      led,
      postRadius,
    };
    if (deco.kind === 'none') return { relief: null, drawing, findings };
    if (!art) {
      findings.push({
        severity: 'info',
        code: 'decoration-empty',
        message: deco.kind === 'text' ? 'Type some text for the wall plate decoration.' : 'Load a silhouette to use your figure on the wall plate.',
      });
      return { relief: null, drawing, findings };
    }
    const unit = buildUnitSilhouette(wasm, art, 0, false, s);
    if (!unit) {
      findings.push({ severity: 'warning', code: 'decoration-empty', message: 'The wall plate decoration is empty.' });
      return { relief: null, drawing, findings };
    }

    // ---- choose the box the artwork fills -----------------------------------------
    const ub = unit.region.bounds();
    const aw = ub.max[0] - ub.min[0];
    const ah = ub.max[1] - ub.min[1];
    const candidates: Box[] = [];
    if (deco.position === 'below') candidates.push({ u0: -hx, u1: hx, v0: -hz, v1: led[1] - postRadius });
    else if (deco.position === 'above') {
      const v0 = led[1] + postRadius;
      if (!keyBoxes.length) candidates.push({ u0: -hx, u1: hx, v0, v1: hz });
      else {
        const kb = keyBoxes;
        const narrow = Math.min(...kb.map((b) => (b.u0 > 0 ? b.u0 : Infinity)), ...kb.map((b) => (b.u1 < 0 ? -b.u1 : Infinity)));
        candidates.push({ u0: -narrow, u1: narrow, v0, v1: hz }); // between the screws
        candidates.push({ u0: -hx, u1: hx, v0, v1: Math.min(...kb.map((b) => b.v0)) }); // under them
        candidates.push({ u0: -hx, u1: hx, v0: Math.max(...kb.map((b) => b.v1)), v1: hz }); // over them
      }
    } else candidates.push({ u0: -hx, u1: hx, v0: -hz, v1: hz });
    let best: { box: Box; k: number } | null = null;
    for (const b of candidates) {
      if (b.u1 - b.u0 <= 1 || b.v1 - b.v0 <= 1) continue;
      const k = Math.min((b.u1 - b.u0) / aw, (b.v1 - b.v0) / ah);
      if (!best || k > best.k) best = { box: b, k };
    }
    if (!best) {
      findings.push({ severity: 'warning', code: 'decoration-space', message: 'There is no room on the wall plate for the decoration in that position.' });
      return { relief: null, drawing, findings };
    }
    const k = best.k * deco.size;
    const centre: Vec2 = deco.position === 'behind' ? led : [(best.box.u0 + best.box.u1) / 2, (best.box.v0 + best.box.v1) / 2];
    const mid: Vec2 = [(ub.min[0] + ub.max[0]) / 2, (ub.min[1] + ub.max[1]) / 2];
    const placed = s.keep(s.keep(s.keep(unit.region.translate([-mid[0], -mid[1]])).scale([k, k])).translate(centre));
    let relief2d = s.keep(placed.intersect(area));
    if (relief2d.isEmpty()) {
      findings.push({ severity: 'warning', code: 'decoration-space', message: 'The decoration does not fit beside the LED post; try another position.' });
      return { relief: null, drawing, findings };
    }
    const lostToPost = 1 - relief2d.area() / placed.area();
    if (lostToPost > 0.02)
      findings.push({
        severity: 'info',
        code: 'decoration-clipped',
        message: `${(lostToPost * 100).toFixed(0)}% of the decoration is trimmed around the LED post${keyBoxes.length ? ' and screw heads' : ''}.`,
      });

    // ---- printability: strokes thinner than the minimum feature ------------------------
    const mf = print.minFeature;
    const opened = s.keep(s.keep(relief2d.offset(-mf / 2, 'Round')).offset(mf / 2, 'Round'));
    const thinPct = (1 - opened.area() / relief2d.area()) * 100;
    if (thinPct > 3)
      findings.push({
        severity: 'warning',
        code: 'decoration-thin',
        message: `${thinPct.toFixed(0)}% of the decoration is narrower than ${mf} mm and may not print cleanly. Make it bigger, use fewer letters or a bolder font.`,
      });
    relief2d = s.keep(relief2d.simplify(0.01));
    drawing.decoration = polygonsToLoops(relief2d);
    const relief = out.keep(extrudeUp(relief2d, tb - 0.01, deco.height + 0.01, s).translate([0, 0, 0])); // copy out of the local scope
    return { relief, drawing, findings };
  } finally {
    s.dispose();
  }
}

