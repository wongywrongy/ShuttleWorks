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
import { useFullscreen } from '../publicDisplay/useFullscreen';
import { FullscreenButton } from '../publicDisplay/FullscreenButton';
import { BoardSwitch } from '../publicDisplay/BoardSwitch';
import { LiveStatusPill } from '../publicDisplay/LiveStatusPill';
import { staleCaption, STALE_MS } from '../publicDisplay/freshness';
import { formatDateTime } from '../../../lib/formatDateTime';
import { useBracketDisplaySync } from './useBracketDisplaySync';
import { isComplete } from './bracketDisplayData';
import { BracketLiveView } from './BracketLiveView';
import { BracketDrawView } from './BracketDrawView';
import { BracketResultsView } from './BracketResultsView';
import { SyncHealthIndicator } from '../../../components/SyncHealthIndicator';
import { ActiveChoice } from '../../../components/ActiveChoice';

type BracketView = 'live' | 'draw' | 'results';
const VIEWS: { id: BracketView; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'draw', label: 'Draw' },
  { id: 'results', label: 'Results' },
];

/** See `MeetDisplayPage.tsx`'s identical constant for the full rationale:
 *  no tournament timezone reaches this page's wire data today
 *  (`BracketTournamentDTO` carries no `timeZone` field either), so the
 *  board falls back to UTC and LABELS it rather than silently formatting
 *  in the viewer's own browser zone (state-and-formatting §7.2, D13,
 *  V3-OC24.2). */
const BOARD_TIME_ZONE = 'UTC';

/** `hybrid` — this workspace also runs a Meet, so the header carries a switch
 *  back to that board (see `PublicDisplayPage` for why the two boards stay
 *  separate rather than merging). */
export function BracketDisplayPage({ hybrid = false, preview = false }: { hybrid?: boolean; preview?: boolean } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view') as BracketView | null;
  const [now, setNow] = useState<Date>(() => new Date());
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { data, freshness, syncError, lastSyncedAt, terminal } = useBracketDisplaySync(now);

  // A finished tournament opening on Live shows "No matches on court", which
  // reads as "hasn't started yet" — so with nothing left to play, open on the
  // results instead. An explicit `?view=` always wins: the board a director
  // pointed the TV at never moves under them.
  const view: BracketView =
    viewParam && VIEWS.some((v) => v.id === viewParam) ? viewParam : data && isComplete(data) ? 'results' : 'live';
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);

  // 1 Hz clock drives the freshness derivation.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // `clock_with_zone` (state-and-formatting §7.1), tournament-tz-aware —
  // see BOARD_TIME_ZONE's doc comment above for why that is 'UTC', labeled.
  const currentTime = formatDateTime(now.toISOString(), 'clock_with_zone', BOARD_TIME_ZONE);

  // Event selection for the draw/results views — default to the first event.
  const eventParam = searchParams.get('event');
  const events = data?.events ?? [];
  const activeEventId = eventParam ?? events[0]?.id ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div
      ref={rootRef}
      data-testid="bracket-display"
      role={!preview ? 'main' : undefined}
      aria-label={!preview ? 'Tournament bracket display' : undefined}
      className={`flex w-full flex-col bg-background text-foreground ${preview ? 'h-full min-h-0' : 'min-h-[100dvh]'}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        {/* Venue render drops the view tabs and the fullscreen button — the
            board is not operated from the wall (TV-8). */}
        <div className="flex items-center gap-2">
          {preview ? (
            <div role="tablist" aria-label="Display view" className="flex items-center gap-2">
              {VIEWS.map((v) => (
                <ActiveChoice
                  key={v.id}
                  active={view === v.id}
                  geometry="segment"
                  semantics="tab"
                  data-testid={`bracket-view-${v.id}`}
                  className="px-4 py-2 text-base font-semibold"
                  onClick={() => setParam('view', v.id)}
                >
                  {v.label}
                </ActiveChoice>
              ))}
            </div>
          ) : null}
          {/* Survives the venue render — see the meet board's note. */}
          {hybrid ? <BoardSwitch to="meet" /> : null}
          {view === 'draw' && events.length > 1 ? (
            <span className="ml-2 inline-flex">
              <Select
                value={activeEventId}
                onValueChange={(v) => setParam('event', v)}
                options={events.map((ev) => ({
                  value: ev.id,
                  label: ev.discipline,
                }))}
                ariaLabel="Event"
                size="md"
              />
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {/* Signage clock floor: >= 40px (match-card contract §4.4,
              initial target pending package 27's physical validation).
              `text-5xl` is 48px. This header is otherwise a slim single-row
              bar; the visual fit of a 48px clock next to the view tabs is
              exactly the kind of thing the physical validation pass should
              confirm or push back on. */}
          <time dateTime={now.toISOString()} className="tabular-nums text-5xl text-muted-foreground">
            {currentTime}
          </time>
          <LiveStatusPill status={freshness} />
          <SyncHealthIndicator
            lastSyncedAt={lastSyncedAt}
            error={syncError}
            terminal={terminal}
            nowMs={now.getTime()}
          />
          {lastSyncedAt ? (
            // `datetime` (date + clock, tournament tz) rather than a bare
            // time-of-day — V3-OC24.2's exact finding was an unlabeled,
            // date-less "Updated 04:07 AM" that a board left running
            // overnight cannot interpret across midnight.
            <time
              data-testid="display-last-updated"
              dateTime={formatDateTime(new Date(lastSyncedAt).toISOString(), 'diagnostic') ?? undefined}
              className="whitespace-nowrap text-xs text-muted-foreground"
              title={`Last updated ${formatDateTime(new Date(lastSyncedAt).toISOString(), 'deadline', BOARD_TIME_ZONE)}`}
            >
              Updated{' '}
              {formatDateTime(new Date(lastSyncedAt).toISOString(), 'datetime', BOARD_TIME_ZONE)}
            </time>
          ) : null}
          {preview ? <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} /> : null}
        </div>
      </header>

      {/* Nice-to-have parity with the meet board's stale treatment (not
          required by this task's scope — see task-4-report.md): a calm
          caption, no red/alarm styling. */}
      {freshness === 'stale' && data && (
        <div className="border-b border-border bg-muted/30 px-4 py-1.5 text-center text-sm text-muted-foreground">
          {/* V3-OC24.2: says HOW old, not a fixed "a few minutes" — see
              MeetDisplayPage.tsx's identical treatment. */}
          {staleCaption(lastSyncedAt ? now.getTime() - lastSyncedAt : STALE_MS)}
        </div>
      )}

      <main className={`min-h-0 flex-1 overflow-auto ${freshness === 'stale' ? 'opacity-60 transition-opacity' : ''}`}>
        {!data ? (
          <div className="flex h-full items-center justify-center p-12 text-center">
            <p className="text-2xl text-muted-foreground">{syncError ? 'Waiting to connect…' : 'Loading bracket…'}</p>
          </div>
        ) : view === 'draw' ? (
          <BracketDrawView data={data} eventId={activeEventId} />
        ) : view === 'results' ? (
          <BracketResultsView data={data} isFullscreen={isFullscreen} />
        ) : (
          <BracketLiveView data={data} isFullscreen={isFullscreen} />
        )}
      </main>
    </div>
  );
}
