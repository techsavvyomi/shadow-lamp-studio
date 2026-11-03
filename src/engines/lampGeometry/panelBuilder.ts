/**
 * Table lamp: generates one projection panel of a closed box by inverse light
 * projection onto the wall the panel faces.
 *
 *  1. Window: panel area minus the frame margin, limited by the LED holder's shadow
 *     cone and by the inner/outer-face homothety so cut-outs never break the edge.
 *  2. Feasible wall region: the window projected onto the target wall, minus rays
 *     that graze/miss the wall and rays that would hit the table first.
 *  3. The silhouette is fitted (largest convex fit) inside the feasible region,
 *     scaled by `fill`, offset, then clipped to what is physically reachable.
 *  4. The placed silhouette is projected back onto the panel's inner plane.
 *  5. Openings = silhouette (light style) or window − silhouette (shadow style).
 *  6. Manufacturability: thin material is thickened (or removed), sub-printable
 *     gaps are closed, floating islands get bridges to the frame.
 *  7. Openings are extruded along the light rays through the panel thickness
 *     (homothety about the light's foot point) and subtracted from the slab.
 */
import type { Finding, LampDimensions, Loop, PanelAnalysis, PanelDrawing, PrintConfig, ProjectionConfig, Vec2, Vec3 } from '@/types';
import { clipPolygonHalfPlane, convexHalfPlanes, dot, sub } from '../math/vec';
import { type PanelFrame, type WallFrame, wallFrameForPanel, worldToPanel } from '../projectionGeometry/frames';
import { ensureCCW, feasibleRegion, fitConvex, wallToPanel } from '../projectionGeometry/projection';
import type { CrossSection, Manifold, ManifoldToplevel } from './manifoldRuntime';
import { Scope } from './manifoldRuntime';
import { bridgeIslands, emptyAnalysis, enforceMinFeature, opticsAt, perspectiveCut, rectLoop } from './panelOps';
import { polygonsToLoops, type UnitSilhouette } from './silhouetteRegion';

export interface HolderShadow {
  /** Height of the holder rim above the base (lamp coordinates). */
  rimY: number;
  /** Rim radius. */
  rimRadius: number;
}

export interface PanelBuildInput {
  wasm: ManifoldToplevel;
  frame: PanelFrame;
  lamp: LampDimensions;
  light: Vec3;
  emitterSize: number;
  projection: ProjectionConfig;
  print: PrintConfig;
  unit: UnitSilhouette | null;
  active: boolean;
  holder: HolderShadow | null;
}

export interface PanelBuildOutput {
  /** Panel solid in lamp coordinates (caller owns it via the scope passed in). */
  solid: Manifold;
  drawing: PanelDrawing;
  analysis: PanelAnalysis;
  wall: WallFrame;
}

export function buildPanel(input: PanelBuildInput, scope: Scope): PanelBuildOutput {
  const { wasm, frame, lamp, light, projection, print, unit } = input;
  const { CrossSection } = wasm;
  const local = new Scope();
  const w = frame.width;
  const h = frame.height;
  const t = frame.thickness;
  const l = worldToPanel(frame, light);
  const a = -l[2];
  const foot: Vec2 = [l[0], l[1]];
  const wall = wallFrameForPanel(frame, {
    distance: projection.wallDistance,
    yaw: projection.wallYaw,
    pitch: projection.wallPitch,
  });
  const analysis = emptyAnalysis(frame, input.active, a);
  const findings: Finding[] = analysis.findings;
  const drawing: PanelDrawing = { width: w, height: h, holesInner: [], holesOuter: [], bridges: [], window: [], lightFoot: foot };

  const finish = (holes: CrossSection | null): PanelBuildOutput => {
    const cut = perspectiveCut(wasm, frame, light, holes, h, scope);
    drawing.holesInner = cut.holesInner;
    drawing.holesOuter = cut.holesOuter;
    analysis.openAreaPct = (cut.openArea / (w * h)) * 100;
    local.dispose();
    return { solid: cut.solid, drawing, analysis, wall };
  };

  if (!input.active) return finish(null);
  if (!unit) {
    findings.push({ severity: 'info', code: 'no-silhouette', message: 'No silhouette loaded — panel left solid.' });
    return finish(null);
  }
  if (a <= 1) {
    findings.push({ severity: 'error', code: 'light-too-close', message: 'The LED is touching this panel; move it inwards.' });
    return finish(null);
  }

  // ---- 1. projection window -------------------------------------------------
  const m = lamp.frameMargin;
  let win: Loop = rectLoop(m, m, w - m, h - m);
  if (input.holder && input.holder.rimY < light[1]) {
    const e = light[1] - input.holder.rimY;
    const yMin = l[1] - (a * e) / input.holder.rimRadius;
    if (yMin > m) {
      win = clipPolygonHalfPlane(win, 0, 1, -yMin);
      findings.push({
        severity: 'info',
        code: 'holder-shadow',
        message: `The LED holder blocks rays steeper than ${((Math.atan(e / input.holder.rimRadius) * 180) / Math.PI).toFixed(0)}° below horizontal; the window starts ${yMin.toFixed(1)} mm above the panel bottom.`,
      });
    }
  }
  // Openings on the inner face grow by (a+t)/a on the outer face: keep both inside the window.
  const kIn = a / (a + t);
  const scaledWin = win.map(([x, y]) => [foot[0] + (x - foot[0]) * kIn, foot[1] + (y - foot[1]) * kIn] as Vec2);
  for (const [pa, pb, pc] of convexHalfPlanes(ensureCCW(scaledWin))) win = clipPolygonHalfPlane(win, pa, pb, pc);
  if (win.length < 3) {
    findings.push({ severity: 'error', code: 'no-window', message: 'Frame margin leaves no projection window on this panel.' });
    return finish(null);
  }

  // ---- 2. feasible wall region -----------------------------------------------
  const h0 = dot(wall.normal, sub(light, wall.origin));
  const feas = feasibleRegion({
    frame,
    wall,
    light,
    window: win,
    respectFloor: projection.respectFloor,
    floorY: 0,
    maxRayLength: Math.max(4 * h0, 3000),
  });
  if (feas.wall.length < 3) {
    findings.push({
      severity: 'error',
      code: 'unreachable',
      message: 'No part of the target wall can be reached through this panel (wall too oblique or entirely below the table).',
    });
    return finish(null);
  }
  if (feas.grazingClipped)
    findings.push({ severity: 'warning', code: 'grazing', message: 'Part of the window sends light nearly parallel to the wall; that region is unusable.' });
  if (feas.floorClipped)
    findings.push({
      severity: 'info',
      code: 'floor',
      message: 'Light through the lower part of the window lands on the table; the projection is kept above the table line.',
    });

  // ---- 3. fit + place silhouette on the wall ---------------------------------
  const fit = fitConvex(unit.hull, feas.wall);
  if (fit.scale <= 0) {
    findings.push({ severity: 'error', code: 'fit', message: 'The silhouette cannot be fitted into the reachable wall area.' });
    return finish(null);
  }
  const s = fit.scale * projection.fill;
  const centre: Vec2 = [fit.centre[0] + projection.offsetU, fit.centre[1] + projection.offsetV];
  const placed = local.keep(local.keep(unit.region.scale([s, s])).translate(centre));
  const feasCs = local.keep(new CrossSection([feas.wall], 'Positive'));
  const clipped = local.keep(placed.intersect(feasCs));
  const placedArea = placed.area();
  analysis.clippedPct = placedArea > 0 ? Math.max(0, (1 - clipped.area() / placedArea) * 100) : 0;
  if (analysis.clippedPct > 0.5)
    findings.push({
      severity: 'warning',
      code: 'clipped',
      message: `${analysis.clippedPct.toFixed(1)}% of the silhouette lies outside the area this panel can reach and was clipped. Reduce size or offset.`,
    });
  if (clipped.isEmpty()) {
    findings.push({ severity: 'error', code: 'empty', message: 'The placed silhouette is entirely outside the reachable area.' });
    return finish(null);
  }
  const cb = clipped.bounds();
  const targetLoops = polygonsToLoops(clipped);
  analysis.imageWidth = cb.max[0] - cb.min[0];
  analysis.imageHeight = cb.max[1] - cb.min[1];
  analysis.placement = { minU: cb.min[0], maxU: cb.max[0], minV: cb.min[1], maxV: cb.max[1], feasible: feas.wall, target: targetLoops };

  // ---- optics at the image centre ------------------------------------------------
  const optics = opticsAt(frame, wall, light, [(cb.min[0] + cb.max[0]) / 2, (cb.min[1] + cb.max[1]) / 2], input.emitterSize, print.minFeature);
  if (optics) {
    analysis.magnification = optics.magnification;
    analysis.penumbra = optics.penumbra;
    analysis.resolution = optics.resolution;
    if (optics.cosInc < 0.5)
      findings.push({
        severity: 'warning',
        code: 'oblique',
        message: `Light meets the wall at ${((Math.acos(optics.cosInc) * 180) / Math.PI).toFixed(0)}° from perpendicular: expect stretching and extra blur.`,
      });
  }

  // ---- 4. back-project the silhouette onto the panel inner plane -------------------
  const projected: Loop[] = [];
  for (const loop of targetLoops) {
    const out: Loop = [];
    for (const p of loop) {
      const pp = wallToPanel(frame, wall, light, p, 0);
      if (pp) out.push(pp);
    }
    if (out.length >= 3) projected.push(out);
  }
  const sil = local.keep(new CrossSection(projected, 'EvenOdd'));
  let windowCs = local.keep(new CrossSection([ensureCCW(feas.panel)], 'Positive'));
  drawing.window = [ensureCCW(feas.panel)];

  // ---- 5. openings by style ---------------------------------------------------------
  let holes: CrossSection;
  if (projection.style === 'light') {
    holes = local.keep(sil.intersect(windowCs));
  } else {
    const r = Math.min(3, Math.max(0.5, m / 2));
    windowCs = local.keep(local.keep(windowCs.offset(-r, 'Round')).offset(r, 'Round'));
    holes = local.keep(windowCs.subtract(sil));
  }
  const silArea = Math.max(local.keep(sil.intersect(windowCs)).area(), 1e-9);

  // ---- 6. manufacturability ------------------------------------------------------------
  const mf = print.minFeature;
  const rect = local.keep(new CrossSection([rectLoop(0, 0, w, h)], 'Positive'));
  const fixed = enforceMinFeature(wasm, holes, rect, windowCs, mf, projection.thinFeatures, local);
  holes = fixed.holes;
  analysis.thinAdjustedPct = (fixed.changedArea / silArea) * 100;
  if (analysis.thinAdjustedPct > 1)
    findings.push({
      severity: 'info',
      code: 'thin',
      message: `${analysis.thinAdjustedPct.toFixed(1)}% of the silhouette area was adjusted so every feature is at least ${mf} mm (${projection.thinFeatures === 'thicken' ? 'thin parts thickened' : 'thin parts removed'}, sub-printable gaps closed).`,
    });

  const bw = Math.max(projection.bridgeWidth, mf);
  const br = bridgeIslands(wasm, holes, rect, w, h, bw, mf, 'frame', local);
  holes = br.holes;
  analysis.islands = br.islands;
  analysis.bridges = br.bridges;
  drawing.bridges = br.bridgeLoops;
  if (br.islands > 0)
    findings.push({
      severity: 'info',
      code: 'bridges',
      message: `${br.islands} floating island${br.islands > 1 ? 's' : ''} connected with ${bw.toFixed(1)} mm bridges — they cast thin lines (≈${(bw * Math.max(analysis.magnification, 1)).toFixed(0)} mm wide) on the wall.`,
    });
  if (br.specks > 0)
    findings.push({ severity: 'info', code: 'specks', message: `${br.specks} unprintably small detail${br.specks > 1 ? 's' : ''} removed.` });
  if (br.floating > 0) findings.push({ severity: 'error', code: 'floating', message: `${br.floating} part(s) of the panel are still floating.` });

  if (analysis.penumbra > 0)
    findings.push({
      severity: analysis.penumbra > 0.05 * Math.max(analysis.imageWidth, analysis.imageHeight) ? 'warning' : 'info',
      code: 'penumbra',
      message: `Penumbra ≈ ${analysis.penumbra.toFixed(0)} mm on the wall (emitter ${input.emitterSize} mm): wall details smaller than ≈${analysis.resolution.toFixed(0)} mm will blur.`,
    });

  return finish(holes);
}
