import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Studio } from '@/pages/Studio';

function Crash({ error }: { error: Error }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-lg rounded-xl border border-bad/40 bg-ink-850 p-6 text-[13px] text-ink-200">
        <div className="mb-2 text-[15px] font-semibold text-ink-100">Shadow Lamp Studio hit an unexpected error</div>
        <pre className="max-h-48 overflow-auto rounded bg-ink-950 p-3 text-[11.5px] text-bad">{error.stack ?? error.message}</pre>
        <button className="mt-4 rounded-md bg-glow-400 px-3 py-1.5 font-medium text-ink-950" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallback={(error) => <Crash error={error} />}>
      <Studio />
    </ErrorBoundary>
  );
}
