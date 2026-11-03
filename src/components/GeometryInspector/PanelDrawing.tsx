import { useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/primitives';
import type { Loop, PanelDrawing as Drawing } from '@/types';

const path = (loops: Loop[], h: number) =>
  loops.map((l) => l.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${(h - y).toFixed(2)}`).join('') + 'Z').join('');

/** Dimensioned 2D drawing of a panel's cut-outs (as seen from outside). */
export function PanelDrawing({ d }: { d: Drawing }) {
  const [face, setFace] = useState<'outer' | 'inner'>('outer');
  const pad = 14;
  const W = d.width;
  const H = d.height;
  const holes = face === 'outer' ? d.holesOuter : d.holesInner;
  const tabDepth = d.tabs.reduce((m, t) => Math.max(m, ...t.map((p) => -p[1])), 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-ink-400">Viewed from outside · mm</span>
        <ToggleGroup type="single" value={face} onValueChange={(v) => v && setFace(v as 'outer' | 'inner')} className="w-auto">
          <ToggleGroupItem value="outer">Outer face</ToggleGroupItem>
          <ToggleGroupItem value="inner">Inner face</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="rounded-lg border border-ink-700 bg-ink-950/70 p-1">
        <svg viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${H + tabDepth + 2 * pad}`} className="w-full" style={{ maxHeight: 280 }}>
          <defs>
            <pattern id="hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="3" stroke="#2a303d" strokeWidth="1.2" />
            </pattern>
          </defs>
          {/* material with holes cut (even-odd) */}
          <path d={`M0,0H${W}V${H}H0Z` + path(holes, H)} fill="url(#hatch)" fillRule="evenodd" stroke="#8a93a8" strokeWidth={0.35} />
          <path d={`M0,0H${W}V${H}H0Z` + path(holes, H)} fill="#cfd5e2" fillOpacity={0.12} fillRule="evenodd" />
          {/* finger-joint tabs */}
          {d.tabs.length > 0 && <path d={path(d.tabs, H)} fill="url(#hatch)" stroke="#8a93a8" strokeWidth={0.35} />}
          {/* holes */}
          <path d={path(holes, H)} fill="#f7bd52" fillOpacity={0.08} stroke="#f7bd52" strokeWidth={0.3} fillRule="evenodd" />
          {/* window */}
          <path d={path(d.window, H)} fill="none" stroke="#7ea2ff" strokeOpacity={0.6} strokeWidth={0.3} strokeDasharray="1.5 1.2" />
          {/* bridges */}
          {d.bridges.length > 0 && <path d={path(d.bridges, H)} fill="#3ecf8e" fillOpacity={0.35} stroke="#3ecf8e" strokeWidth={0.25} />}
          {/* light foot */}
          <g transform={`translate(${d.lightFoot[0]},${H - d.lightFoot[1]})`} stroke="#ffd27a" strokeWidth={0.35}>
            <circle r={1.6} fill="none" />
            <line x1={-3.2} x2={3.2} />
            <line y1={-3.2} y2={3.2} />
          </g>
          {/* dimensions */}
          <g fill="#8a93a8" fontSize={4} fontFamily="ui-monospace, monospace">
            <line x1={0} x2={W} y1={-6} y2={-6} stroke="#5b6478" strokeWidth={0.3} />
            <text x={W / 2} y={-8} textAnchor="middle">
              {W.toFixed(1)}
            </text>
            <line x1={W + 6} x2={W + 6} y1={0} y2={H} stroke="#5b6478" strokeWidth={0.3} />
            <text x={W + 8} y={H / 2} transform={`rotate(90 ${W + 8} ${H / 2})`} textAnchor="middle">
              {H.toFixed(1)}
            </text>
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink-400">
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-sm border border-glow-400" /> cut-out
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-sm bg-ok/60" /> bridge
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-0 w-3 border-t border-dashed border-cool-400" /> window
        </span>
        <span className="flex items-center gap-1 text-glow-300">⊕ light axis</span>
        {d.tabs.length > 0 && <span>▭ tabs into the plate</span>}
      </div>
    </div>
  );
}
