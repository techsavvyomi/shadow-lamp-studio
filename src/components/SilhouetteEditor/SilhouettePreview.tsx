import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useVectorMode } from '@/hooks/usePipeline';
import { useDesignStore } from '@/stores/designStore';
import { useImageStore } from '@/stores/imageStore';
import type { Rect } from '@/types';
import { cn } from '@/utils';

export type PreviewMode = 'overlay' | 'silhouette' | 'original';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Draws the extracted silhouette over the source, with an interactive crop box. */
export function SilhouettePreview({ mode, cropping }: { mode: PreviewMode; cropping: boolean }) {
  const source = useImageStore((s) => s.source);
  const processed = useImageStore((s) => s.processed);
  const crop = useDesignStore((s) => s.design.processing.crop);
  const invert = useDesignStore((s) => s.design.processing.invert);
  const vectorMode = useVectorMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const c = draft ?? crop;

  // ---- render the silhouette layer -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const ctx = canvas.getContext('2d')!;
    const fill = mode === 'silhouette' ? '#f4f1ea' : 'rgba(247, 189, 82, 0.62)';
    const stroke = mode === 'silhouette' ? 'rgba(0,0,0,0)' : '#ffd27a';
    if (vectorMode && source.vector) {
      const f = source.vector.frame;
      const k = 1024 / Math.max(f.w, f.h);
      canvas.width = Math.round(f.w * k);
      canvas.height = Math.round(f.h * k);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(k, k);
      ctx.translate(-f.x, -f.y);
      // composite in painter's order on an offscreen layer
      const layer = document.createElement('canvas');
      layer.width = canvas.width;
      layer.height = canvas.height;
      const lc = layer.getContext('2d')!;
      lc.scale(k, k);
      lc.translate(-f.x, -f.y);
      for (const sh of source.vector.shapes) {
        const p = new Path2D();
        for (const l of sh.loops) {
          l.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
          p.closePath();
        }
        lc.globalCompositeOperation = sh.subtract ? 'destination-out' : 'source-over';
        lc.fillStyle = fill;
        lc.fill(p, sh.fillRule);
      }
      ctx.restore();
      if (invert) {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(layer, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      } else ctx.drawImage(layer, 0, 0);
      return;
    }
    if (!processed) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const { width: w, height: h, mask, loops } = processed;
    canvas.width = w;
    canvas.height = h;
    const img = ctx.createImageData(w, h);
    const col = mode === 'silhouette' ? [244, 241, 234, 255] : [247, 189, 82, 150];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      img.data.set(col, i * 4);
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, w / 400);
    ctx.lineJoin = 'round';
    for (const l of loops) {
      ctx.beginPath();
      l.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
    }
  }, [source, processed, mode, vectorMode, invert]);

  // ---- crop interaction ---------------------------------------------------------------
  const drag = useRef<{ kind: string; x: number; y: number; start: Rect } | null>(null);
  const onDown = (kind: string) => (e: RPointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, start: { ...c } };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    const box = boxRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    let { x, y, w, h } = d.start;
    const min = 0.05;
    if (d.kind === 'move') {
      x = clamp01(Math.min(x + dx, 1 - w));
      y = clamp01(Math.min(y + dy, 1 - h));
    } else {
      if (d.kind.includes('l')) {
        const nx = clamp01(Math.min(x + dx, x + w - min));
        w += x - nx;
        x = nx;
      }
      if (d.kind.includes('r')) w = Math.max(min, Math.min(1 - x, w + dx));
      if (d.kind.includes('t')) {
        const ny = clamp01(Math.min(y + dy, y + h - min));
        h += y - ny;
        y = ny;
      }
      if (d.kind.includes('b')) h = Math.max(min, Math.min(1 - y, h + dy));
    }
    setDraft({ x, y, w, h });
  };
  const onUp = () => {
    if (drag.current && draft) useDesignStore.getState().update('processing', { crop: draft }, 'crop');
    drag.current = null;
    setDraft(null);
  };

  if (!source) return null;
  const aspect = source.vector && vectorMode ? source.vector.frame.w / source.vector.frame.h : source.rgba.width / source.rgba.height;
  const pct = (v: number) => `${v * 100}%`;
  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg border border-ink-700', mode === 'silhouette' ? 'bg-ink-950' : 'checkerboard')}>
      <div ref={boxRef} className="relative mx-auto" style={{ aspectRatio: String(aspect), maxHeight: 260, maxWidth: '100%' }} onPointerMove={onMove} onPointerUp={onUp}>
        {mode !== 'silhouette' && <img src={source.url} alt="Source" className={cn('absolute inset-0 h-full w-full object-fill', mode === 'overlay' && 'opacity-55')} draggable={false} />}
        {mode !== 'original' && (
          <canvas
            ref={canvasRef}
            className="absolute"
            style={vectorMode ? { inset: 0, width: '100%', height: '100%' } : { left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
          />
        )}
        {cropping && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-black/45" style={{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 ${pct(c.y)},${pct(c.x)} ${pct(c.y)},${pct(c.x)} ${pct(c.y + c.h)},${pct(c.x + c.w)} ${pct(c.y + c.h)},${pct(c.x + c.w)} ${pct(c.y)},0 ${pct(c.y)})` }} />
            <div className="absolute cursor-move border border-glow-300" style={{ left: pct(c.x), top: pct(c.y), width: pct(c.w), height: pct(c.h) }} onPointerDown={onDown('move')}>
              {['tl', 'tr', 'bl', 'br'].map((k) => (
                <div
                  key={k}
                  onPointerDown={onDown(k)}
                  className={cn(
                    'absolute h-3 w-3 rounded-sm border border-ink-950 bg-glow-300',
                    k.includes('t') ? '-top-1.5' : '-bottom-1.5',
                    k.includes('l') ? '-left-1.5 cursor-nwse-resize' : '-right-1.5 cursor-nesw-resize',
                    k === 'tr' || k === 'bl' ? 'cursor-nesw-resize' : 'cursor-nwse-resize',
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
