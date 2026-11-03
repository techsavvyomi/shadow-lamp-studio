import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { useDesignStore } from '@/stores/designStore';
import { useImageStore } from '@/stores/imageStore';
import { useViewStore } from '@/stores/viewStore';
import { cn } from '@/utils';
import { ACCEPT_ATTR, loadImageFile, loadSample } from '@/utils/loadImage';

const SAMPLES = [
  { file: 'cat.svg', label: 'Cat' },
  { file: 'moon.svg', label: 'Moon & stars' },
  { file: 'tree.svg', label: 'Tree' },
  { file: 'dancer.svg', label: 'Figure' },
  { file: 'witch.svg', label: 'Witch' },
];

export function ImageUploader() {
  const source = useImageStore((s) => s.source);
  const status = useImageStore((s) => s.status);
  const error = useImageStore((s) => s.error);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(async (load: () => Promise<Awaited<ReturnType<typeof loadImageFile>>>) => {
    const store = useImageStore.getState();
    store.setStatus('loading');
    try {
      const src = await load();
      // reset crop for a new image
      useDesignStore.getState().update('processing', { crop: { x: 0, y: 0, w: 1, h: 1 } }, 'new-image');
      store.setSource(src);
      useViewStore.getState().setLeftSection(['silhouette', 'mounting']);
    } catch (e) {
      store.setStatus('error', e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) accept(() => loadImageFile(f));
  };

  const busy = status === 'loading';

  return (
    <div className="space-y-3">
      {source ? (
        <div className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-800/60 p-2">
          <div className="checkerboard h-14 w-14 shrink-0 overflow-hidden rounded-md">
            <img src={source.url} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-ink-100">{source.name}</div>
            <div className="num text-[11px] text-ink-400">
              {source.kind === 'svg' ? 'SVG · ' : ''}
              {source.originalWidth} × {source.originalHeight}
              {source.kind === 'svg' && source.vector ? ` · ${source.vector.shapes.length} shapes` : ''}
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => inputRef.current?.click()} aria-label="Replace image">
              <RefreshCw />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => useImageStore.getState().setSource(null)} aria-label="Remove image">
              <Trash2 />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onFiles(e.dataTransfer.files);
          }}
          className={cn(
            'group flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-all',
            drag ? 'border-glow-400 bg-glow-400/8' : 'border-ink-600 bg-ink-800/40 hover:border-ink-500 hover:bg-ink-800/70',
          )}
        >
          <div className={cn('rounded-full border border-ink-600 bg-ink-750 p-2.5 transition-colors', drag ? 'text-glow-300' : 'text-ink-300 group-hover:text-glow-300')}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          </div>
          <div className="text-[12.5px] font-medium text-ink-100">Drop a silhouette image</div>
          <div className="text-[11px] text-ink-400">PNG · JPG · SVG — or click to browse</div>
        </button>
      )}
      <input ref={inputRef} type="file" accept={ACCEPT_ATTR} className="hidden" onChange={(e) => onFiles(e.target.files)} onClick={(e) => ((e.target as HTMLInputElement).value = '')} />

      {error && <div className="rounded-md border border-bad/30 bg-bad/10 px-2.5 py-2 text-[11.5px] text-bad">{error}</div>}

      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">
          <ImagePlus className="h-3 w-3" /> Samples
        </div>
        <div className="grid grid-cols-5 gap-1">
          {SAMPLES.map((s) => (
            <button
              key={s.file}
              type="button"
              disabled={busy}
              onClick={() => accept(() => loadSample(`${import.meta.env.BASE_URL}samples/${s.file}`, s.file))}
              className="group flex flex-col items-center gap-1 rounded-md border border-ink-700 bg-ink-200/95 p-1.5 transition-all hover:-translate-y-px hover:border-glow-400 disabled:opacity-50"
              title={s.label}
            >
              <img src={`${import.meta.env.BASE_URL}samples/${s.file}`} alt={s.label} className="h-9 w-9 object-contain" />
              <span className="text-[9.5px] font-medium text-ink-800">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
