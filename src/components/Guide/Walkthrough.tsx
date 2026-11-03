/**
 * First-visit walkthrough: a welcome card, then a spotlight on each area of the
 * studio with a short explanation. Remembered per browser; the ? button in the
 * top bar replays it.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import { BrandMark } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/primitives';
import { useViewStore } from '@/stores/viewStore';
import { cn } from '@/utils';

interface TourStep {
  /** `data-tour` value of the element to spotlight; null centres the card. */
  target: string | null;
  title: string;
  body: string;
  /** Makes sure the target is on screen before it is measured. */
  before?: () => void;
}

const openLeft = () => {
  const v = useViewStore.getState();
  v.setLeftOpen(true);
  if (v.uiMode !== 'guide') v.setUiMode('guide');
};

const STEPS: TourStep[] = [
  {
    target: null,
    title: 'Welcome to Shadow Lamp Studio',
    body: 'Turn any picture into a 3D-printable lamp whose shadow shows your picture on the wall. This quick tour shows you around. It takes under a minute.',
  },
  { target: 'steps', title: 'Six simple steps', body: 'Work through them left to right. A tick marks a finished step; click any step to go back to it.' },
  { target: 'guide', title: 'One step at a time', body: 'This panel shows only what the current step needs. Use Next and Back at the bottom to move along.', before: openLeft },
  { target: 'viewer', title: 'Your lamp, live', body: 'Every change rebuilds the lamp here within a second or two. Drag to rotate, scroll to zoom, right-drag to pan.' },
  { target: 'views', title: 'See the real shadow', body: 'Shadow sim switches the LED on in a virtual room, so you see exactly what the printed lamp will cast before you print it.' },
  { target: 'advanced', title: 'Need more control?', body: 'All settings opens every dimension, light and printer option. You never need it for a first lamp.', before: openLeft },
  { target: 'help', title: 'Replay any time', body: 'Click here to see this tour again. Ready? Start with step 1 and choose your lamp type.' },
];

type Rect = { x: number; y: number; w: number; h: number };
const CARD_W = 320;
const CARD_H = 190; // generous estimate used only for placement
const M = 12;

function measure(target: string | null): Rect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4 || r.right < 0 || r.left > window.innerWidth) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function placeCard(r: Rect | null): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(M, x), vw - CARD_W - M);
  const clampY = (y: number) => Math.min(Math.max(M, y), vh - CARD_H - M);
  if (!r) return { left: (vw - CARD_W) / 2, top: Math.max(M, vh / 2 - CARD_H / 2 - 40) };
  if (r.x + r.w + M + CARD_W < vw - M) return { left: r.x + r.w + M, top: clampY(r.y) };
  if (r.x - M - CARD_W > M) return { left: r.x - M - CARD_W, top: clampY(r.y) };
  if (r.y + r.h + M + CARD_H < vh - M) return { left: clampX(r.x + r.w / 2 - CARD_W / 2), top: r.y + r.h + M };
  if (r.y - M - CARD_H > M) return { left: clampX(r.x + r.w / 2 - CARD_W / 2), top: r.y - M - CARD_H };
  // the target fills the screen (the 3D view): sit inside it, near the bottom
  return { left: clampX(r.x + r.w / 2 - CARD_W / 2), top: clampY(r.y + r.h - CARD_H - 24) };
}

export function Walkthrough() {
  const i = useViewStore((s) => s.tourStep);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = i == null ? null : STEPS[i];

  useLayoutEffect(() => {
    if (!step) return;
    step.before?.();
    let raf = 0;
    let last = '';
    // follow the target while drawers slide and the layout settles
    const tick = () => {
      const r = measure(step.target);
      const key = r ? `${r.x | 0},${r.y | 0},${r.w | 0},${r.h | 0}` : 'none';
      if (key !== last) {
        last = key;
        setRect(r);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const end = useCallback(() => useViewStore.getState().endTour(), []);
  const go = useCallback(
    (d: number) => {
      if (i == null) return;
      const n = i + d;
      if (n >= STEPS.length) end();
      else if (n >= 0) useViewStore.getState().setTourStep(n);
    },
    [i, end],
  );

  useEffect(() => {
    if (i == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, go, end]);

  if (i == null || !step) return null;
  const welcome = i === 0;
  const last = i === STEPS.length - 1;
  const pos = placeCard(rect);
  const pad = 6;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-glow-400/80 transition-all duration-200"
          style={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + 2 * pad, height: rect.h + 2 * pad, boxShadow: '0 0 0 9999px rgb(5 6 10 / 0.72), 0 0 28px 2px rgb(247 189 82 / 0.35)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgb(5_6_10/0.72)]" />
      )}
      <div
        className={cn('absolute rounded-xl border border-ink-600 bg-ink-850 p-4 shadow-2xl shadow-black/60 animate-slide-up', welcome && 'text-center')}
        style={{ left: pos.left, top: pos.top, width: CARD_W }}
      >
        {!welcome && (
          <button onClick={end} className="absolute right-2.5 top-2.5 rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100" aria-label="Close tour">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {welcome && <BrandMark className="mx-auto mb-2 h-11 w-11" />}
        {!welcome && (
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-glow-300">
            {i} of {STEPS.length - 1}
          </div>
        )}
        <h3 id="tour-title" className="pr-5 text-[15px] font-semibold tracking-tight text-ink-50">
          {step.title}
        </h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">{step.body}</p>
        {welcome ? (
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="primary" size="md" onClick={() => go(1)}>
              <Sparkles /> Show me around
            </Button>
            <Button variant="ghost" size="md" onClick={end}>
              Skip tour
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={end}>
              Skip tour
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => go(-1)} aria-label="Previous">
              <ArrowLeft />
            </Button>
            <Button variant="primary" size="sm" onClick={() => go(1)}>
              {last ? "Let's start" : 'Next'} {!last && <ArrowRight />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
