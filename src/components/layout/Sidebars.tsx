import { useEffect, useRef } from 'react';
import { ArrowLeft, Box, Frame, ImageUp, Lightbulb, PanelTop, Printer, Scan, ScanSearch, Share, Sun } from 'lucide-react';
import { GuidePanel } from '@/components/Guide/GuidePanel';
import { DecorationPanel } from '@/components/LampConfigurator/DecorationPanel';
import { ImageUploader } from '@/components/ImageUploader/ImageUploader';
import { SilhouetteEditor } from '@/components/SilhouetteEditor/SilhouetteEditor';
import { LampDimensionsPanel, LightPanel, ProjectionPanel } from '@/components/LampConfigurator/LampConfigurator';
import { MountingPanel } from '@/components/LampConfigurator/MountingPanel';
import { useDesignStore } from '@/stores/designStore';
import { GeometryInspector } from '@/components/GeometryInspector/GeometryInspector';
import { PrintSettings } from '@/components/ExportPanel/PrintSettings';
import { ExportPanel } from '@/components/ExportPanel/ExportPanel';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Button, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useSilhouetteData } from '@/hooks/usePipeline';
import { useGeometryStore } from '@/stores/geometryStore';
import { useImageStore } from '@/stores/imageStore';
import { useViewStore, type LeftSection, type RightTab } from '@/stores/viewStore';
import { cn } from '@/utils';

function Drawer({ side, open, tour, children }: { side: 'left' | 'right'; open: boolean; tour?: string; children: React.ReactNode }) {
  // a closed drawer must not take focus (Tab would land on invisible controls)
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.inert = !open;
  }, [open]);
  const close = () => (side === 'left' ? useViewStore.getState().setLeftOpen(false) : useViewStore.getState().setRightOpen(false));
  return (
    <>
      {open && <div className="fixed inset-0 top-12 z-20 bg-black/50 lg:hidden" onClick={close} />}
      <aside
        ref={ref}
        className={cn(
          'panel-surface z-30 flex min-h-0 shrink-0 flex-col border-ink-700 transition-[transform,margin] duration-200',
          side === 'left' ? 'w-[320px] border-r' : 'w-[348px] border-l',
          'fixed bottom-12 top-12 lg:static',
          side === 'left' ? 'left-0' : 'right-0',
          open ? 'translate-x-0' : side === 'left' ? '-translate-x-full lg:-ml-[320px]' : 'translate-x-full lg:-mr-[348px]',
        )}
        aria-hidden={!open}
        data-tour={tour}
      >
        {children}
      </aside>
    </>
  );
}

export function LeftSidebar() {
  const open = useViewStore((s) => s.leftOpen);
  const sections = useViewStore((s) => s.leftSection);
  const source = useImageStore((s) => s.source);
  const silhouette = useSilhouetteData();
  const mounting = useDesignStore((s) => s.design.mounting.type);
  const decoration = useDesignStore((s) => s.design.decoration.kind);
  const uiMode = useViewStore((s) => s.uiMode);
  const expert = useViewStore((s) => s.expert);
  const onChange = (v: string[]) => {
    useViewStore.getState().setLeftSection(v as LeftSection[]);
    if (v.some((s) => s === 'mounting' || s === 'plate' || s === 'lamp' || s === 'projection' || s === 'light')) useViewStore.getState().markVisited('customise');
  };
  if (uiMode === 'guide')
    return (
      <Drawer side="left" open={open} tour="guide">
        <GuidePanel />
      </Drawer>
    );
  return (
    <Drawer side="left" open={open} tour="guide">
      <div className="space-y-1.5 border-b border-ink-700 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">All settings</span>
          <Button variant="ghost" size="sm" onClick={() => useViewStore.getState().setUiMode('guide')}>
            <ArrowLeft /> Guided mode
          </Button>
        </div>
        <label className="flex cursor-pointer items-center justify-between rounded-md bg-ink-800/60 px-2.5 py-1.5">
          <span>
            <span className="block text-[11.5px] font-medium text-ink-200">Expert options</span>
            <span className="block text-[10.5px] text-ink-400">{expert ? 'Every tolerance and fine-tuning control' : 'Off: only the settings most lamps need'}</span>
          </span>
          <Switch checked={expert} onCheckedChange={(v) => useViewStore.getState().setExpert(v)} aria-label="Expert options" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Accordion type="multiple" value={sections} onValueChange={onChange}>
          <AccordionItem value="image">
            <AccordionTrigger icon={<ImageUp />} badge={source ? <Badge tone="ok">loaded</Badge> : undefined}>
              Image
            </AccordionTrigger>
            <AccordionContent>
              <ImageUploader />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="silhouette">
            <AccordionTrigger icon={<Scan />} badge={silhouette ? <Badge tone="ok">ready</Badge> : undefined}>
              Silhouette
            </AccordionTrigger>
            <AccordionContent>
              <SilhouetteEditor />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="mounting">
            <AccordionTrigger icon={<Frame />} badge={<Badge tone="glow">{mounting === 'wall' ? 'wall' : 'table'}</Badge>}>
              Mounting
            </AccordionTrigger>
            <AccordionContent>
              <MountingPanel />
            </AccordionContent>
          </AccordionItem>
          {mounting === 'wall' && (
            <AccordionItem value="plate">
              <AccordionTrigger icon={<PanelTop />} badge={<Badge tone="glow">{decoration === 'none' ? 'plain' : decoration}</Badge>}>
                Wall plate
              </AccordionTrigger>
              <AccordionContent>
                <DecorationPanel advanced />
              </AccordionContent>
            </AccordionItem>
          )}
          <AccordionItem value="lamp">
            <AccordionTrigger icon={<Box />}>Lamp dimensions</AccordionTrigger>
            <AccordionContent>
              <LampDimensionsPanel />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="projection">
            <AccordionTrigger icon={<Sun />}>Projection geometry</AccordionTrigger>
            <AccordionContent>
              <ProjectionPanel />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="light">
            <AccordionTrigger icon={<Lightbulb />}>Light source</AccordionTrigger>
            <AccordionContent>
              <LightPanel />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </Drawer>
  );
}

export function RightSidebar() {
  const open = useViewStore((s) => s.rightOpen);
  const tab = useViewStore((s) => s.rightTab);
  const validation = useGeometryStore((s) => s.result?.validation);
  const failing = validation?.some((v) => v.status === 'fail');
  return (
    <Drawer side="right" open={open}>
      <Tabs value={tab} onValueChange={(v) => useViewStore.getState().setRightTab(v as RightTab)} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-ink-700 px-3 py-2.5">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="inspect">
              <ScanSearch /> Inspect
            </TabsTrigger>
            <TabsTrigger value="print">
              <Printer /> Print
            </TabsTrigger>
            <TabsTrigger value="export">
              <Share /> Export
              {validation && <span className={cn('h-1.5 w-1.5 rounded-full', failing ? 'bg-bad' : 'bg-ok')} />}
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pt-1">
          <TabsContent value="inspect">
            <GeometryInspector />
          </TabsContent>
          <TabsContent value="print">
            <PrintSettings />
          </TabsContent>
          <TabsContent value="export">
            <ExportPanel />
          </TabsContent>
        </div>
      </Tabs>
    </Drawer>
  );
}
