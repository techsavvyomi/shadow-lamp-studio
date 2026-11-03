import { Box, Frame, ImageUp, Lightbulb, Printer, Scan, ScanSearch, Share, Sun } from 'lucide-react';
import { ImageUploader } from '@/components/ImageUploader/ImageUploader';
import { SilhouetteEditor } from '@/components/SilhouetteEditor/SilhouetteEditor';
import { LampDimensionsPanel, LightPanel, ProjectionPanel } from '@/components/LampConfigurator/LampConfigurator';
import { MountingPanel } from '@/components/LampConfigurator/MountingPanel';
import { useDesignStore } from '@/stores/designStore';
import { GeometryInspector } from '@/components/GeometryInspector/GeometryInspector';
import { PrintSettings } from '@/components/ExportPanel/PrintSettings';
import { ExportPanel } from '@/components/ExportPanel/ExportPanel';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useSilhouetteData } from '@/hooks/usePipeline';
import { useGeometryStore } from '@/stores/geometryStore';
import { useImageStore } from '@/stores/imageStore';
import { useViewStore, type LeftSection, type RightTab } from '@/stores/viewStore';
import { cn } from '@/utils';

function Drawer({ side, open, children }: { side: 'left' | 'right'; open: boolean; children: React.ReactNode }) {
  const close = () => (side === 'left' ? useViewStore.getState().setLeftOpen(false) : useViewStore.getState().setRightOpen(false));
  return (
    <>
      {open && <div className="fixed inset-0 top-12 z-20 bg-black/50 lg:hidden" onClick={close} />}
      <aside
        className={cn(
          'panel-surface z-30 flex min-h-0 shrink-0 flex-col border-ink-700 transition-[transform,margin] duration-200',
          side === 'left' ? 'w-[320px] border-r' : 'w-[348px] border-l',
          'fixed bottom-12 top-12 lg:static',
          side === 'left' ? 'left-0' : 'right-0',
          open ? 'translate-x-0' : side === 'left' ? '-translate-x-full lg:-ml-[320px]' : 'translate-x-full lg:-mr-[348px]',
        )}
        aria-hidden={!open}
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
  const onChange = (v: string[]) => {
    useViewStore.getState().setLeftSection(v as LeftSection[]);
    if (v.some((s) => s === 'mounting' || s === 'lamp' || s === 'projection' || s === 'light')) useViewStore.getState().markVisited('configure');
  };
  return (
    <Drawer side="left" open={open}>
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
