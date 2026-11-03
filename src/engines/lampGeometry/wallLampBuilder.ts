/**
 * Wall lamp: an open-front box on the wall with the LED on a post. Light from the
 * LED tip travels back past the side walls onto the mounting wall; the side walls'
 * profiles cast ONE silhouette around the lamp, inside a bright halo.
 *
 * Inverse projection: seen from the emitter L, the inner plane of side wall p maps
 * onto the mounting wall (lamp plane y = 0) by a central projection. The side wall
 * spans x ∈ [0, w] and heights up to the cap, whose image is the trapezoid Q_p
 * fanning out from that side of the lamp; the four trapezoids tile the reachable
 * region K (the box outline scaled by y_L / (y_L − cap) about the LED axis).
 * The silhouette S is placed on the wall with the lamp at its deepest point, and
 * each wall's material is the back-projection of S ∩ Q_p plus a solid base strip.
 * Edges are cut along the rays, so every profile casts exactly its share of S.
 */
import type { FigureAnalysis, Finding, LampDimensions, Loop, MountingConfig, PanelDrawing, PanelId, PrintConfig, ProjectionConfig, Vec2, Vec3 } from '@/types';
import { PANEL_IDS } from '@/types';
import { clipPolygonHalfPlane, convexHull, signedArea } from '../math/vec';
import { lampLayout, panelFrame, worldToPanel } from '../projectionGeometry/frames';
import { mountingWallFrame } from '../projectionGeometry/mounting';
import { ensureCCW, maxScaleAt, panelToWall, wallToPanel } from '../projectionGeometry/projection';
import type { CrossSection, ManifoldToplevel } from './manifoldRuntime';
import { Scope } from './manifoldRuntime';
import type { HolderShadow, PanelBuildOutput } from './panelBuilder';
import { bridgeIslands, emptyAnalysis, enforceMinFeature, opticsAt, perspectiveCut, rectLoop } from './panelOps';
import { deepestPoint, polygonsToLoops, type UnitSilhouette } from './silhouetteRegion';

export interface WallLampInput {
  wasm: ManifoldToplevel;
  lamp: LampDimensions;
  light: Vec3;
  emitterSize: number;
  projection: ProjectionConfig;
  print: PrintConfig;
  mounting: MountingConfig;
  unit: UnitSilhouette | null;
  holder: HolderShadow;
}

export interface WallLampOutput {
  panels: Record<PanelId, PanelBuildOutput>;
  figure: FigureAnalysis | null;
  findings: Finding[];
}

export function buildWallPanels(input: WallLampInput, scope: Scope): WallLampOutput {
  const { wasm, lamp, light: L, projection, print, mounting, unit } = input;
  const { CrossSection } = wasm;
  const local = new Scope();
  const findings: Finding[] = [];
  try {
    const wall = mountingWallFrame();
    const { panelTop, baseTop } = lampLayout({ ...lamp, topCover: false });
    const cap = Math.min(panelTop, L[1] - 4);
    const hSlab = Math.max(lamp.frameMargin + 1, cap - baseTop);
    if (L[1] - 4 < panelTop)
      findings.push({
        severity: 'info',
        code: 'cap',
        message: `Side walls are capped ${cap.toFixed(0)} mm off the wall: anything at or beyond the LED's distance (${L[1].toFixed(0)} mm) could not shade the wall.`,
      });

    // ---- reachable region K and each side wall's sector Q_p ---------------------------
    const frames = Object.fromEntries(PANEL_IDS.map((id) => [id, panelFrame(id, { ...lamp, topCover: false })])) as Record<PanelId, ReturnType<typeof panelFrame>>;
    const sectors = {} as Record<PanelId, Loop>;
    const allPts: Vec2[] = [];
    for (const id of PANEL_IDS) {
      const f = frames[id];
      const pts: Vec2[] = [];
      for (const [x, y] of rectLoop(0, 0, f.width, hSlab)) {
        const p = panelToWall(f, wall, L, [x, y, 0]);
        if (p) pts.push(p);
      }
      sectors[id] = convexHull(pts);
      allPts.push(...pts);
    }
    let reach = ensureCCW(convexHull(allPts));
    const before = Math.abs(signedArea(reach));
    // floor (world y ≥ 10) and ceiling: world y = mountHeight + b
    reach = clipPolygonHalfPlane(reach, 0, 1, mounting.height - 10);
    reach = clipPolygonHalfPlane(reach, 0, -1, mounting.ceilingHeight - 10 - mounting.height);
    if (Math.abs(signedArea(reach)) < before - 1e-6)
      findings.push({
        severity: 'info',
        code: 'room',
        message: `At ${mounting.height} mm mounting height the floor or ceiling cuts into the area the lamp can shade; the figure is kept on the wall.`,
      });

    // ---- place the figure --------------------------------------------------------------
    let figure: FigureAnalysis | null = null;
    let placed: CrossSection | null = null;
    if (unit && reach.length >= 3) {
      const anchor = deepestPoint(unit.region);
      const hullRel = unit.hull.map(([x, y]) => [x - anchor[0], y - anchor[1]] as Vec2);
      const centre: Vec2 = [projection.offsetU, projection.offsetV];
      const sMax = maxScaleAt(hullRel, reach, centre);
      if (sMax <= 0) {
        findings.push({ severity: 'error', code: 'fit', message: 'The lamp sits outside the reachable area with this offset; reduce the offset.' });
      } else {
        const s = sMax * projection.fill;
        const S = local.keep(local.keep(local.keep(unit.region.translate([-anchor[0], -anchor[1]])).scale([s, s])).translate(centre));
        const reachCs = local.keep(new CrossSection([reach], 'Positive'));
        placed = local.keep(S.intersect(reachCs));
        const clippedPct = Math.max(0, (1 - placed.area() / Math.max(S.area(), 1e-9)) * 100);
        const body = local.keep(new CrossSection([rectLoop(-lamp.width / 2, -lamp.depth / 2, lamp.width / 2, lamp.depth / 2)], 'Positive'));
        const lampCoveredPct = (local.keep(body.intersect(placed)).area() / body.area()) * 100;
        const b = placed.bounds();
        const e = L[1] - input.holder.rimY;
        figure = {
          width: b.max[0] - b.min[0],
          height: b.max[1] - b.min[1],
          reach,
          target: polygonsToLoops(placed),
          lampCoveredPct,
          postShadowRadius: e > 0 ? (input.holder.rimRadius * L[1]) / e : Infinity,
          nearBlur: Infinity,
          farBlur: 0,
          maxProfileHeight: cap,
          clippedPct,
          fidelity: null,
        };
        if (clippedPct > 0.5)
          findings.push({
            severity: 'warning',
            code: 'clipped',
            message: `${clippedPct.toFixed(1)}% of the figure lies beyond what the side walls can shade and was clipped. Raise the side walls closer to the LED's distance from the wall, or reduce size/offset.`,
          });
        if (lampCoveredPct < 95)
          findings.push({
            severity: 'warning',
            code: 'lamp-outside',
            message: `${(100 - lampCoveredPct).toFixed(0)}% of the lamp body lies outside the figure — it will show as a dark block. Offset the figure so the lamp sits inside it.`,
          });
      }
    } else if (!unit) {
      findings.push({ severity: 'info', code: 'no-silhouette', message: 'No silhouette loaded — side walls are plain strips.' });
    }

    // ---- per side wall: material = back-projected sector ∪ base strip -----------------------
    const panels = {} as Record<PanelId, PanelBuildOutput>;
    const mf = print.minFeature;
    const bw = Math.max(projection.bridgeWidth, mf);
    const stripH = Math.min(lamp.frameMargin, hSlab);
    for (const id of PANEL_IDS) {
      const f = frames[id];
      const w = f.width;
      const l = worldToPanel(f, L);
      const a = -l[2];
      const active = projection.activePanels[id];
      const analysis = emptyAnalysis(f, active, a, hSlab);
      const drawing: PanelDrawing = { width: w, height: hSlab, holesInner: [], holesOuter: [], bridges: [], window: [rectLoop(0, 0, w, hSlab)], lightFoot: [l[0], l[1]] };
      const slabRect = local.keep(new CrossSection([rectLoop(0, 0, w, hSlab)], 'Positive'));
      // Material is built slightly past the slab's edges so the ray-aligned cutter
      // crosses the end/bottom faces transversally instead of grazing them (which
      // leaves zero-area slivers); the slab itself trims the overhang.
      const E = 5;
      const eTop = Math.max(0, Math.min(E, l[1] - hSlab - 1));
      let material = local.keep(new CrossSection([rectLoop(-E, -E, w + E, stripH)], 'Positive'));
      if (active && placed) {
        const sectorCs = local.keep(new CrossSection([sectors[id]], 'Positive'));
        const part = local.keep(placed.intersect(sectorCs));
        // Extend sideways and upwards only: below the plate the ray meets the wall
        // before the side wall, so those points have no back-projection.
        const ext: Vec2[] = [];
        for (const [x, y] of rectLoop(-E, 0, w + E, hSlab + eTop)) {
          const p = panelToWall(f, wall, L, [x, y, 0]);
          if (p) ext.push(p);
        }
        const partExt = local.keep(placed.intersect(local.keep(new CrossSection([convexHull(ext)], 'Positive'))));
        if (!part.isEmpty()) {
          const target = polygonsToLoops(part);
          const back: Loop[] = [];
          for (const loop of polygonsToLoops(partExt)) {
            const q: Loop = [];
            for (const p of loop) {
              const pp = wallToPanel(f, wall, L, p, 0);
              if (!pp) throw new Error(`Wall point (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) has no back-projection onto the ${id} side wall`);
              q.push(pp);
            }
            if (q.length >= 3) back.push(q);
          }
          if (back.length) material = local.keep(material.add(local.keep(new CrossSection(back, 'EvenOdd'))));
          const pb = part.bounds();
          analysis.imageWidth = pb.max[0] - pb.min[0];
          analysis.imageHeight = pb.max[1] - pb.min[1];
          analysis.placement = { minU: pb.min[0], maxU: pb.max[0], minV: pb.min[1], maxV: pb.max[1], feasible: sectors[id], target };
          const optics = opticsAt(f, wall, L, [(pb.min[0] + pb.max[0]) / 2, (pb.min[1] + pb.max[1]) / 2], input.emitterSize, mf);
          if (optics) {
            analysis.magnification = optics.magnification;
            analysis.penumbra = optics.penumbra;
            analysis.resolution = optics.resolution;
          }
          if (figure)
            for (const loop of target)
              for (const p of loop) {
                const o = opticsAt(f, wall, L, p, input.emitterSize, mf);
                if (!o) continue;
                figure.nearBlur = Math.min(figure.nearBlur, o.penumbra);
                figure.farBlur = Math.max(figure.farBlur, o.penumbra);
              }
        }
      }
      // openings = everything around the material (they may run past the slab edge)
      const big = local.keep(new CrossSection([rectLoop(-20, -20, w + 20, hSlab + 20)], 'Positive'));
      let holes = local.keep(big.subtract(material));
      const fixed = enforceMinFeature(wasm, holes, slabRect, slabRect, mf, projection.thinFeatures, local);
      holes = fixed.holes;
      const br = bridgeIslands(wasm, holes, slabRect, w, hSlab, bw, mf, 'base', local);
      holes = br.holes;
      analysis.islands = br.islands;
      analysis.bridges = br.bridges;
      drawing.bridges = br.bridgeLoops;
      if (br.islands > 0)
        analysis.findings.push({
          severity: 'info',
          code: 'bridges',
          message: `${br.islands} detached part${br.islands > 1 ? 's' : ''} of the figure held by ${bw.toFixed(1)} mm struts down to the base strip (they cast thin lines pointing away from the lamp).`,
        });
      if (br.floating > 0) analysis.findings.push({ severity: 'error', code: 'floating', message: `${br.floating} part(s) of this side wall are still floating.` });
      const cut = perspectiveCut(wasm, f, L, holes, hSlab, scope, true);
      drawing.holesInner = cut.holesInner;
      drawing.holesOuter = cut.holesOuter;
      analysis.openAreaPct = (cut.openArea / (w * hSlab)) * 100;
      panels[id] = { solid: cut.solid, drawing, analysis, wall };
    }

    if (figure) {
      if (!Number.isFinite(figure.nearBlur)) figure.nearBlur = 0;
      findings.push({
        severity: figure.farBlur > 0.08 * Math.max(figure.width, figure.height) ? 'warning' : 'info',
        code: 'blur',
        message: `Edges are sharpest next to the lamp (≈${figure.nearBlur.toFixed(0)} mm blur) and soften towards the tips (≈${figure.farBlur.toFixed(0)} mm) — light reaches the outer parts at grazing angles. A smaller emitter or a longer LED post sharpens them.`,
      });
      const halfMin = Math.min(lamp.width, lamp.depth) / 2;
      if (figure.postShadowRadius > halfMin)
        findings.push({
          severity: 'warning',
          code: 'post-shadow',
          message: `The LED post shades a disc of ≈${figure.postShadowRadius.toFixed(0)} mm radius around the lamp. Raise the emitter further above the post rim.`,
        });
    }
    return { panels, figure, findings };
  } finally {
    local.dispose();
  }
}
