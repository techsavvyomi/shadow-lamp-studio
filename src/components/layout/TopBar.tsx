import { Check, CircleHelp, PanelLeft, PanelRight } from 'lucide-react';
import { GUIDE_STEPS, useGuideProgress } from '@/components/Guide/GuidePanel';
import { Button, Tip } from '@/components/ui/primitives';
import { GUIDE_STEP_IDS, useViewStore, type GuideStepId } from '@/stores/viewStore';
import { cn } from '@/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="gv" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe2a8" />
          <stop offset="1" stopColor="#eba630" />
        </linearGradient>
      </defs>
      <rect x="7" y="12" width="18" height="15" rx="2.5" fill="none" stroke="url(#gv)" strokeWidth="2" />
      <path d="M16 12v15M7 17.5h18" stroke="url(#gv)" strokeWidth="1.6" />
      <path d="M16 11.5c-2.5-4.5-7-4-6-1.2.8 2 4 1.6 6 1.2zm0 0c2.5-4.5 7-4 6-1.2-.8 2-4 1.6-6 1.2z" fill="url(#gv)" />
      <circle cx="16" cy="21" r="1.6" fill="#fff6dc" />
    </svg>
  );
}

function goToStep(id: GuideStepId) {
  const v = useViewStore.getState();
  if (v.uiMode !== 'guide') v.setUiMode('guide');
  v.setLeftOpen(true);
  v.setGuideStep(id);
}

export function TopBar() {
  const done = useGuideProgress();
  const guideStep = useViewStore((s) => s.guideStep);
  const guided = useViewStore((s) => s.uiMode === 'guide');
  const leftOpen = useViewStore((s) => s.leftOpen);
  const rightOpen = useViewStore((s) => s.rightOpen);
  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-900/95 px-3 backdrop-blur">
      <Button variant="ghost" size="icon-sm" onClick={() => useViewStore.getState().setLeftOpen(!leftOpen)} aria-label="Toggle left panel">
        <PanelLeft className={leftOpen ? 'text-glow-300' : ''} />
      </Button>
      <div className="flex items-center gap-2">
        <BrandMark className="h-7 w-7" />
        <div className="leading-none">
          <div className="text-[13.5px] font-semibold tracking-tight text-ink-100">
            Giftieverse<span className="text-glow-400">.</span>
          </div>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">Shadow Lamp Studio</div>
        </div>
      </div>

      <nav className="mx-auto hidden items-center gap-1 md:flex" aria-label="Workflow" data-tour="steps">
        {GUIDE_STEP_IDS.map((id, i) => {
          const label = GUIDE_STEPS[id].label;
          const isDone = done[id] && !(guided && id === guideStep);
          const isCurrent = guided && id === guideStep;
          return (
            <div key={id} className="flex items-center gap-1">
              <Tip content={`Step ${i + 1}: ${GUIDE_STEPS[id].title}`} side="bottom">
                <button
                  onClick={() => goToStep(id)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11.5px] font-medium transition-all',
                    isCurrent
                      ? 'border-glow-500/70 bg-glow-400/12 text-glow-200 shadow-[0_0_14px_-4px_rgb(247_189_82/0.6)]'
                      : isDone
                        ? 'border-ink-600 text-ink-200 hover:border-ink-500'
                        : 'border-transparent text-ink-400 hover:text-ink-200',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full text-[9.5px] font-bold',
                      isDone ? 'bg-ok/90 text-ink-950' : isCurrent ? 'bg-glow-400 text-ink-950' : 'bg-ink-700 text-ink-300',
                    )}
                  >
                    {isDone ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> : i + 1}
                  </span>
                  <span className="hidden lg:inline">{label}</span>
                </button>
              </Tip>
              {i < GUIDE_STEP_IDS.length - 1 && <span className={cn('h-px w-3 lg:w-5', done[id] ? 'bg-ok/50' : 'bg-ink-700')} />}
            </div>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1 md:ml-0">
        <Tip content="Show the walkthrough again" side="bottom">
          <Button variant="ghost" size="icon-sm" data-tour="help" onClick={() => useViewStore.getState().startTour()} aria-label="Help: replay the walkthrough">
            <CircleHelp />
          </Button>
        </Tip>
        <Button variant="ghost" size="icon-sm" onClick={() => useViewStore.getState().setRightOpen(!rightOpen)} aria-label="Toggle right panel">
          <PanelRight className={rightOpen ? 'text-glow-300' : ''} />
        </Button>
      </div>
    </header>
  );
}
