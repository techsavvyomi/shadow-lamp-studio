import { useEffect } from 'react';
import { ExportDialog } from '@/components/ExportPanel/ExportPanel';
import { BottomToolbar } from '@/components/layout/BottomToolbar';
import { LeftSidebar, RightSidebar } from '@/components/layout/Sidebars';
import { TopBar } from '@/components/layout/TopBar';
import { SceneViewer } from '@/components/SceneViewer/SceneViewer';
import { TooltipProvider } from '@/components/ui/primitives';
import { useGeometryGeneration, useImageProcessing } from '@/hooks/usePipeline';
import { useDesignStore } from '@/stores/designStore';
import { useViewStore } from '@/stores/viewStore';

/** Keeps the simulated room in step with the design target while linked. */
function useSimulationLink() {
  const linked = useViewStore((s) => s.sim.linked);
  const projection = useDesignStore((s) => s.design.projection);
  const light = useDesignStore((s) => s.design.light);
  useEffect(() => {
    if (linked) useViewStore.getState().setSim({ wallDistance: projection.wallDistance, wallYaw: projection.wallYaw, flux: light.flux, emitterSize: light.emitterSize });
  }, [linked, projection.wallDistance, projection.wallYaw, light.flux, light.emitterSize]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useDesignStore.getState().redo();
        else useDesignStore.getState().undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useDesignStore.getState().redo();
      } else if (!mod && e.key.toLowerCase() === 'f') useViewStore.getState().resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function Studio() {
  useImageProcessing();
  useGeometryGeneration();
  useSimulationLink();
  useShortcuts();
  useEffect(() => {
    if (window.innerWidth < 1024) {
      useViewStore.getState().setLeftOpen(false);
      useViewStore.getState().setRightOpen(false);
    }
  }, []);
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden">
        <TopBar />
        <div className="relative flex min-h-0 flex-1">
          <LeftSidebar />
          <main className="relative min-w-0 flex-1">
            <SceneViewer />
          </main>
          <RightSidebar />
        </div>
        <BottomToolbar />
        <ExportDialog />
      </div>
    </TooltipProvider>
  );
}
