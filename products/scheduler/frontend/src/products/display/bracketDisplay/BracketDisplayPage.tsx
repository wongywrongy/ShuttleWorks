/**
 * Bracket Display Page — the bracket workspace's TV / projector surface.
 * Rendered by ``PublicDisplayPage`` (the kind-router) for bracket-kind
 * workspaces. Read-only: polls ``getBracket`` via ``useBracketDisplaySync``
 * and renders one of three director-selectable views.
 *
 *   ?view=live (default) — bracket matches on court / called
 *   ?view=draw           — read-only bracket tree (per ?event=)
 *   ?view=results        — winners / champion per event
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Select } from '@scheduler/design-system/components';
import { INTERACTIVE_BASE } from '../../../lib/utils';
import { useFullscreen } from '../publicDisplay/useFullscreen';
import { FullscreenButton } from '../publicDisplay/FullscreenButton';
import { LiveStatusPill } from '../publicDisplay/LiveStatusPill';
import { useBracketDisplaySync } from './useBracketDisplaySync';
import { BracketLiveView } from './BracketLiveView';
import { BracketDrawView } from './BracketDrawView';
import { BracketResultsView } from './BracketResultsView';

type BracketView = 'live' | 'draw' | 'results';
const VIEWS: { id: BracketView; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'draw', label: 'Draw' },
  { id: 'results', label: 'Results' },
];

export function BracketDisplayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view') as BracketView | null;
  const view: BracketView =
    viewParam && VIEWS.some((v) => v.id === viewParam) ? viewParam : 'live';
  const [now, setNow] = useState<Date>(() => new Date());
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { data, freshness, syncError } = useBracketDisplaySync(now);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);

  // 1 Hz clock drives the freshness derivation.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const currentTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Event selection for the draw/results views — default to the first event.
  const eventParam = searchParams.get('event');
  const events = data?.events ?? [];
  const activeEventId = eventParam ?? events[0]?.id ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const tabClass = (mode: BracketView) =>
    [
      INTERACTIVE_BASE,
      'border px-4 py-2 text-base font-semibold',
      view === mode
        ? 'border-accent bg-accent/15 text-accent'
        : 'border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/40 hover:text-foreground',
    ].join(' ');

  return (
    <div
      ref={rootRef}
      data-testid="bracket-display"
      className="flex min-h-[100dvh] flex-col bg-background text-foreground"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div role="tablist" aria-label="Display view" className="flex items-center gap-2">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              data-testid={`bracket-view-${v.id}`}
              className={tabClass(v.id)}
              onClick={() => setParam('view', v.id)}
            >
              {v.label}
            </button>
          ))}
          {view === 'draw' && events.length > 1 ? (
            <span className="ml-2 inline-flex">
              <Select
                value={activeEventId}
                onValueChange={(v) => setParam('event', v)}
                options={events.map((ev) => ({ value: ev.id, label: ev.discipline }))}
                ariaLabel="Event"
                size="md"
              />
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-base text-muted-foreground">{currentTime}</span>
          <LiveStatusPill status={freshness} />
          <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
        </div>
      </header>

      {/* Nice-to-have parity with the meet board's stale treatment (not
          required by this task's scope — see task-4-report.md): a calm
          caption, no red/alarm styling. */}
      {freshness === 'stale' && data && (
        <div className="border-b border-border bg-muted/30 px-4 py-1.5 text-center text-sm text-muted-foreground">
          Results may be out of date — reconnecting
        </div>
      )}

      <main
        className={`min-h-0 flex-1 overflow-auto ${freshness === 'stale' ? 'opacity-60 transition-opacity' : ''}`}
      >
        {!data ? (
          <div className="flex h-full items-center justify-center p-12 text-center">
            <p className="text-2xl text-muted-foreground">
              {syncError ? 'Waiting to connect…' : 'Loading bracket…'}
            </p>
          </div>
        ) : view === 'draw' ? (
          <BracketDrawView data={data} eventId={activeEventId} />
        ) : view === 'results' ? (
          <BracketResultsView data={data} />
        ) : (
          <BracketLiveView data={data} />
        )}
      </main>
    </div>
  );
}
