/**
 * Tab pane skeleton — shape-matching loaders for the AppShell <Suspense>
 * fallback. Replaces the bare "Loading…" text. Each variant approximates
 * the layout shape of its tab so the perceived first-paint feels like a
 * real layout settling in, not an empty box flashing.
 *
 * Animation: a slow pulse via Tailwind's ``animate-pulse``. Honors
 * prefers-reduced-motion globally because Tailwind's pulse uses
 * ``opacity`` only, which the reduced-motion media query in
 * src/index.css does not gate (it only gates the named infinite
 * animations); we want a low-amplitude pulse to remain visible as a
 * legible loading hint rather than disappear.
 */
import type { AppTab } from '../store/uiStore';

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-muted ${className}`} />;
}

function Row({ className = '' }: { className?: string }) {
  return <div className={`h-row rounded bg-muted/70 ${className}`} />;
}

export function TabSkeleton({ tab }: { tab: AppTab }) {
  return (
    <div
      role="status"
      aria-label={`Loading ${tab}`}
      data-testid={`skeleton-${tab}`}
      className="mx-auto h-full max-w-[1400px] animate-pulse px-4 py-4"
    >
      {tab === 'setup' && <SetupShape />}
      {tab === 'roster' && <RosterShape />}
      {tab === 'matches' && <MatchesShape />}
      {tab === 'schedule' && <ScheduleShape />}
      {tab === 'live' && <LiveShape />}
      {tab === 'tv' && <TvShape />}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function SetupShape() {
  return (
    <div className="grid h-full grid-cols-[220px_1fr] gap-6">
      <aside className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bar key={i} className="h-8" />
        ))}
      </aside>
      <section className="space-y-4">
        <Bar className="h-7 w-1/3" />
        <Bar className="h-4 w-1/2" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bar key={i} className="h-16" />
          ))}
        </div>
      </section>
    </div>
  );
}

function RosterShape() {
  return (
    <div className="grid h-full grid-cols-[260px_1fr] gap-6">
      <aside className="space-y-3">
        <Bar className="h-9" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Bar key={i} className="h-7" />
        ))}
      </aside>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Bar className="h-7 w-40" />
          <Bar className="h-7 w-24" />
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <Row key={i} />
        ))}
      </section>
    </div>
  );
}

function MatchesShape() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Bar className="h-7 w-44" />
        <div className="flex gap-2">
          <Bar className="h-7 w-24" />
          <Bar className="h-7 w-24" />
        </div>
      </div>
      {Array.from({ length: 14 }).map((_, i) => (
        <Row key={i} />
      ))}
    </div>
  );
}

function ScheduleShape() {
  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4">
      <section className="space-y-3">
        <Bar className="h-7 w-1/3" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[60px_1fr] gap-2">
              <Bar className="h-7" />
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 4 }).map((__, j) => (
                  <Bar key={j} className="h-7" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <aside className="space-y-3">
        <Bar className="h-7 w-2/3" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Bar key={i} className="h-12" />
        ))}
      </aside>
    </div>
  );
}

function LiveShape() {
  return (
    <div className="grid h-full grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-sm border border-border p-3">
          <Bar className="h-5 w-1/3" />
          <Bar className="h-9" />
          <Bar className="h-9" />
          <div className="flex gap-2">
            <Bar className="h-7 flex-1" />
            <Bar className="h-7 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TvShape() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <Bar className="h-7 w-40" />
        <div className="flex gap-2">
          <Bar className="h-8 w-32" />
          <Bar className="h-8 w-32" />
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bar key={i} className="h-full min-h-32" />
        ))}
      </div>
    </div>
  );
}
