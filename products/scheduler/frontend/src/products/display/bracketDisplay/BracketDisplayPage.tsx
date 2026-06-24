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

  const { data, liveStatus, syncError } = useBracketDisplaySync(now);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);

  // 1 Hz clock drives the live-status freshness derivation.
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
            <select
              aria-label="Event"
              value={activeEventId}
              onChange={(e) => setParam('event', e.target.value)}
              className="ml-2 rounded border border-border bg-card px-3 py-2 text-base text-foreground"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.discipline}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-base text-muted-foreground">{currentTime}</span>
          <LiveStatusPill status={liveStatus} error={syncError} />
          <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {!data ? (
          <div className="flex h-full items-center justify-center p-12 text-center">
            <p className="text-2xl text-muted-foreground">
              {syncError ? 'Waiting for connection to the server…' : 'Loading bracket…'}
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
