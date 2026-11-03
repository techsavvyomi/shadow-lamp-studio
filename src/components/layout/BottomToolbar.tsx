import { Download, Focus, Hammer, Lightbulb, Loader2, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { Button, Separator, Tip } from '@/components/ui/primitives';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useViewStore } from '@/stores/viewStore';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

export function BottomToolbar() {
  const canUndo = useDesignStore((s) => s.past.length > 0);
  const canRedo = useDesignStore((s) => s.future.length > 0);
  const status = useGeometryStore((s) => s.status);
  const hasResult = useGeometryStore((s) => !!s.result);
  const mode = useViewStore((s) => s.mode);
  const ledOn = useViewStore((s) => s.sim.ledOn);

  const previewShadow = () => {
    const v = useViewStore.getState();
    if (v.mode === 'simulation') v.setSim({ ledOn: !v.sim.ledOn });
    else {
      v.setMode('simulation');
      v.setSim({ ledOn: true });
    }
  };

  return (
    <footer className="relative z-20 flex h-12 shrink-0 items-center gap-1.5 border-t border-ink-700 bg-ink-900/95 px-3 backdrop-blur">
      <Tip content={`Undo (${mod}Z)`}>
        <Button variant="ghost" size="icon-sm" disabled={!canUndo} onClick={() => useDesignStore.getState().undo()} aria-label="Undo">
          <Undo2 />
        </Button>
      </Tip>
      <Tip content={`Redo (${mod}${isMac ? '⇧Z' : 'Y'})`}>
        <Button variant="ghost" size="icon-sm" disabled={!canRedo} onClick={() => useDesignStore.getState().redo()} aria-label="Redo">
          <Redo2 />
        </Button>
      </Tip>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Tip content="Reset camera (F)">
        <Button variant="ghost" size="sm" onClick={() => useViewStore.getState().resetView()}>
          <Focus /> <span className="hidden sm:inline">Reset view</span>
        </Button>
      </Tip>
      <Tip content="Restore all default dimensions and settings (undoable)">
        <Button variant="ghost" size="sm" onClick={() => useDesignStore.getState().reset()}>
          <RotateCcw /> <span className="hidden xl:inline">Defaults</span>
        </Button>
      </Tip>

      <div className="flex-1" />

      <Button variant="secondary" size="md" onClick={() => useGeometryStore.getState().regenerate()} disabled={status === 'running'}>
        {status === 'running' ? <Loader2 className="animate-spin" /> : <Hammer />}
        <span className="hidden sm:inline">{status === 'running' ? 'Generating…' : 'Generate geometry'}</span>
      </Button>
      <Button variant={mode === 'simulation' && ledOn ? 'outline' : 'secondary'} size="md" onClick={previewShadow} className={mode === 'simulation' && ledOn ? 'border-glow-500 text-glow-200' : ''}>
        <Lightbulb />
        <span className="hidden sm:inline">{mode === 'simulation' ? (ledOn ? 'LED off' : 'LED on') : 'Preview shadow'}</span>
      </Button>
      <Button variant="primary" size="md" disabled={!hasResult} onClick={() => useViewStore.getState().setExportOpen(true)}>
        <Download /> <span className="hidden sm:inline">Export STL</span>
      </Button>
    </footer>
  );
}
