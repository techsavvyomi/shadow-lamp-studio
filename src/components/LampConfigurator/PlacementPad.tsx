/**
 * Drag-to-place control for the silhouette. Shows the wall as the lamp lights it:
 * the reachable (lit) area, the figure as a shadow and — on a wall lamp — the lamp
 * itself. Dragging changes projection.offsetU / offsetV; the geometry worker then
 * re-designs the panels for the new spot, so the cast shadow stays the silhouette.
 *
 * While the worker runs, the figure is previewed exactly as the engine will place
 * it: a pure translation on a table lamp, and translation + re-fit to the reachable
 * area on a wall lamp (size = fill × the largest that fits at the new spot).
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Loader2, Move } from 'lucide-react';
import { Button, Tip } from '@/components/ui/primitives';
import { convexHull, pointInLoops } from '@/engines/math/vec';
import { panelLabel } from '@/engines/projectionGeometry/mounting';
import { maxScaleAt } from '@/engines/projectionGeometry/projection';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useViewStore } from '@/stores/viewStore';
import { PANEL_IDS, type LampGeometryResult, type Loop, type Vec2 } from '@/types';
import { cn } from '@/utils';

interface Scene {
  wall: boolean;
  label: string;
  /** Area the lamp can shade (wall mm, y up). */
  region: Loop;
  /** Figure as generated, and the offset it was generated for. */
  target: Loop[];
  builtAt: Vec2;
  /** Wall lamp body outline. */
  lamp: Loop | null;
}

const svgPath = (loops: Loop[]) => loops.map((l) => `M${l.map(([x, y]) => `${x.toFixed(1)} ${(-y).toFixed(1)}`).join('L')}Z`).join('');

function sceneOf(r: LampGeometryResult, selected: (typeof PANEL_IDS)[number], lampW: number, lampD: number): Scene | null {
  if (r.mounting === 'wall') {
    const f = r.figure;
    if (!f || !f.target.length) return null;
    const lamp: Loop = [
      [-lampW / 2, -lampD / 2],
      [lampW / 2, -lampD / 2],
      [lampW / 2, lampD / 2],
      [-lampW / 2, lampD / 2],
    ];
    return { wall: true, label: 'Your wall, around the lamp', region: f.reach, target: f.target, builtAt: r.offset, lamp };
  }
  const id = r.panels[selected]?.placement ? selected : PANEL_IDS.find((i) => r.panels[i].placement);
  if (!id) return null;
  const pl = r.panels[id].placement!;
  return { wall: false, label: `${panelLabel('table', id)} wall (all sides move together)`, region: pl.feasible, target: pl.target, builtAt: r.offset, lamp: null };
}

const centreOf = (loops: Loop[]): Vec2 => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of loops)
    for (const [x, y] of l) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
};

/** Share of the lamp body inside the figure (a wall lamp's body shows as a dark block otherwise). */
function lampCover(lamp: Loop, figure: Loop[]): number {
  const [x0, y0] = lamp[0];
  const [x1, y1] = lamp[2];
  let inside = 0;
  const N = 7;
  const M = 9;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) if (pointInLoops([x0 + ((i + 0.5) / N) * (x1 - x0), y0 + ((j + 0.5) / M) * (y1 - y0)], figure)) inside++;
  return inside / (N * M);
}

/** Where the engine will put the figure for `offset` (see file comment). */
function previewAt(s: Scene, offset: Vec2, fill: number, builtFill: number): Loop[] | null {
  const [u0, v0] = s.builtAt;
  if (!s.wall) {
    const du = offset[0] - u0;
    const dv = offset[1] - v0;
    const k = fill / builtFill;
    if (Math.abs(k - 1) < 1e-6) return s.target.map((l) => l.map(([x, y]) => [x + du, y + dv] as Vec2));
    // size changed too: table lamps scale with fill about the placement centre
    const [cx, cy] = centreOf(s.target);
    return s.target.map((l) => l.map(([x, y]) => [cx + du + (x - cx) * k, cy + dv + (y - cy) * k] as Vec2));
  }
  // wall lamp: the anchor sits at the offset; the size re-fits the reachable area there
  if (!pointInLoops(offset, [s.region])) return null;
  const hull = convexHull(s.target.flat()).map(([x, y]) => [x - u0, y - v0] as Vec2);
  const k = maxScaleAt(hull, s.region, offset) * fill;
  if (!(k > 0)) return null;
  return s.target.map((l) => l.map(([x, y]) => [offset[0] + (x - u0) * k, offset[1] + (y - v0) * k] as Vec2));
}


export function PlacementPad({ height = 190, className }: { height?: number; className?: string }) {
  const result = useGeometryStore((s) => s.result);
  const running = useGeometryStore((s) => s.status === 'running');
  const offsetU = useDesignStore((s) => s.design.projection.offsetU);
  const offsetV = useDesignStore((s) => s.design.projection.offsetV);
  const fill = useDesignStore((s) => s.design.projection.fill);
  const lampW = useDesignStore((s) => s.design.lamp.width);
  const lampD = useDesignStore((s) => s.design.lamp.depth);
  const selected = useViewStore((s) => s.selectedPanel);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ start: Vec2; offset: Vec2 } | null>(null);
  const [dragging, setDragging] = useState(false);
  // fill at the time of the last result, to preview size changes made since
  const builtFill = useRef(fill);
  const builtFor = useRef<LampGeometryResult | null>(null);
  if (result && builtFor.current !== result && !running) {
    builtFor.current = result;
    builtFill.current = fill;
  }

  const scene = useMemo(() => (result ? sceneOf(result, selected, lampW, lampD) : null), [result, selected, lampW, lampD]);
  const offset: Vec2 = [offsetU, offsetV];
  const preview = scene ? previewAt(scene, offset, fill, builtFill.current) : null;

  // view box: the reachable area (fixed while dragging, so the mapping never jumps)
  const view = useMemo(() => {
    if (!scene) return null;
    const pts = [...scene.region, ...(scene.lamp ?? [])];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => -p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0;
    const h = Math.max(...ys) - y0;
    const m = 0.06 * Math.max(w, h);
    return { x: x0 - m, y: y0 - m, w: w + 2 * m, h: h + 2 * m };
  }, [scene]);

  if (!scene || !view) {
    return (
      <div className={cn('flex items-center justify-center rounded-lg border border-dashed border-ink-700 text-[11px] text-ink-400', className)} style={{ height }}>
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pick a picture to place it on the wall.'}
      </div>
    );
  }

  // A wall lamp's body sits in the light: wherever the figure does not cover it, it
  // adds a dark block to the shadow. Shown live; moving is never blocked for it.
  const cover = scene.lamp && preview ? lampCover(scene.lamp, preview) : null;
  const valid = (o: Vec2) => {
    const p = previewAt(scene, o, fill, builtFill.current);
    return !!p && pointInLoops(scene.wall ? o : centreOf(p), [scene.region]);
  };
  const commit = (o: Vec2) => {
    const r: Vec2 = [Math.round(o[0]), Math.round(o[1])];
    // slide along the limit: try the full move, then each axis alone
    const tries: Vec2[] = [r, [r[0], offsetV], [offsetU, r[1]]];
    const ok = tries.find((t) => (t[0] !== offsetU || t[1] !== offsetV) && valid(t));
    if (ok) useDesignStore.getState().update('projection', { offsetU: ok[0], offsetV: ok[1] }, 'projection:offset');
  };
  const toWall = (e: { clientX: number; clientY: number }): Vec2 | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return [p.x, -p.y];
  };
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = toWall(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: p, offset };
    setDragging(true);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const p = d && toWall(e);
    if (!d || !p) return;
    commit([d.offset[0] + p[0] - d.start[0], d.offset[1] + p[1] - d.start[1]]);
  };
  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };
  const step = Math.max(5, Math.round((0.02 * Math.max(view.w, view.h)) / 5) * 5);
  const nudge = (du: number, dv: number, big = false) => commit([offsetU + du * step * (big ? 5 : 1), offsetV + dv * step * (big ? 5 : 1)]);

  const coverTone = cover == null ? null : cover >= 0.95 ? '#3ecf8e' : cover >= 0.8 ? '#f0b04b' : '#f0645a';
  const marker = preview ? (scene.wall ? offset : centreOf(preview)) : null;
  const unit = (v: number, pos: string, neg: string) => (Math.abs(v) < 0.5 ? null : `${Math.abs(v / 10).toFixed(1)} cm ${v > 0 ? pos : neg}`);
  const readout = [unit(offsetU, 'right', 'left'), unit(offsetV, 'up', 'down')].filter(Boolean).join(' · ') || 'centred';

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="relative overflow-hidden rounded-lg border border-ink-700 bg-ink-950">
        <svg
          ref={svgRef}
          data-testid="placement-pad"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className={cn('block w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-glow-400/60', dragging ? 'cursor-grabbing' : 'cursor-grab')}
          style={{ height }}
          tabIndex={0}
          role="application"
          aria-label="Silhouette position: drag, or use the arrow keys"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={(e) => {
            const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
            if (!k) return;
            e.preventDefault();
            nudge(k[0], k[1], e.shiftKey);
          }}
        >
          <defs>
            <radialGradient id="pad-light">
              <stop offset="0" stopColor="#f7e3b4" stopOpacity="0.55" />
              <stop offset="1" stopColor="#f7bd52" stopOpacity="0.12" />
            </radialGradient>
          </defs>
          <path d={svgPath([scene.region])} fill="url(#pad-light)" stroke="#f7bd52" strokeOpacity={0.45} strokeWidth={view.w / 260} strokeDasharray={`${view.w / 90} ${view.w / 140}`} />
          {preview && <path d={svgPath(preview)} fill="#0b0d12" fillOpacity={running || dragging ? 0.65 : 0.92} fillRule="evenodd" stroke={dragging ? '#ffd27a' : 'none'} strokeWidth={view.w / 300} />}
          {scene.lamp && (
            <g>
              <path d={svgPath([scene.lamp])} fill="#2a303d" stroke={coverTone ?? '#8a93a8'} strokeWidth={view.w / 200} />
              <circle cx={0} cy={0} r={view.w / 90} fill="#fff6dc" />
            </g>
          )}
          {marker && (
            <g stroke="#ffd27a" strokeWidth={view.w / 320} transform={`translate(${marker[0]} ${-marker[1]})`}>
              <line x1={-view.w / 40} x2={view.w / 40} />
              <line y1={-view.w / 40} y2={view.w / 40} />
            </g>
          )}
        </svg>
        <div className="pointer-events-none absolute left-2 top-1.5 flex items-center gap-1 text-[10px] text-ink-300/90">
          <Move className="h-3 w-3" /> {scene.label}
        </div>
        {running && <Loader2 className="absolute right-2 top-1.5 h-3.5 w-3.5 animate-spin text-ink-300" />}
      </div>
      <div className="flex items-center gap-1">
        {(
          [
            ['left', ArrowLeft, -1, 0],
            ['up', ArrowUp, 0, 1],
            ['down', ArrowDown, 0, -1],
            ['right', ArrowRight, 1, 0],
          ] as const
        ).map(([name, Icon, du, dv]) => (
          <Button key={name} variant="secondary" size="icon-sm" onClick={(e) => nudge(du, dv, e.shiftKey)} aria-label={`Move ${name}`}>
            <Icon />
          </Button>
        ))}
        <Tip content="Back to the best spot">
          <Button variant="ghost" size="icon-sm" onClick={() => commit([0, 0])} aria-label="Re-centre" disabled={offsetU === 0 && offsetV === 0}>
            <Crosshair />
          </Button>
        </Tip>
        <span className="num ml-auto text-right text-[10.5px] leading-tight text-ink-400">
          {readout}
          {cover != null && (
            <span className="block" style={{ color: coverTone ?? undefined }}>
              lamp hidden {Math.round(cover * 100)}%
            </span>
          )}
        </span>
      </div>
      <p className="text-[10.5px] leading-snug text-ink-400">
        Drag the figure (or use the arrows). The lamp is re-designed for the new spot, so its shadow always matches your silhouette.
        {scene.wall && ' The lamp itself also casts a dark block wherever the figure does not cover it, so keep it hidden inside the figure; ⌖ returns to the best spot.'}
      </p>
    </div>
  );
}
