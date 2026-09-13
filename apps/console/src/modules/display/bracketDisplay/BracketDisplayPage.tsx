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
import { BoardBanner, BoardClock, BoardMark } from '../publicDisplay/boardChrome';
import { DEFAULT_BOARD_SETTINGS } from '../useDisplayKind';
import type { BoardSettingsDTO } from '../../../api/dto';
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

/** `hybrid` — this workspace also runs a Meet, so the header carries a switch
 *  back to that board (see `PublicDisplayPage` for why the two boards stay
 *  separate rather than merging).
 *
 *  `timeZone` and `board` arrive as props from `PublicDisplayPage`, which
 *  resolves them once for whichever board it renders. The hardcoded
 *  `BOARD_TIME_ZONE = 'UTC'` this page used to carry is gone: the zone is
 *  data now (match-card §4.4), and when it is absent the clock is omitted
 *  rather than guessed. */
export function BracketDisplayPage({
  hybrid = false,
  preview = false,
  name = null,
  timeZone = null,
  board = DEFAULT_BOARD_SETTINGS,
}: {
  hybrid?: boolean;
  preview?: boolean;
  name?: string | null;
  timeZone?: string | null;
  board?: BoardSettingsDTO;
} = {}) {
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

  // On an unusable or expired snapshot the VENUE board withholds the match
  // content rather than showing it behind a public warning (match-card
  // §4.4). The operator's preview keeps rendering it, dimmed and captioned,
  // because the operator is the one who has to act on it.
  const contentSuppressed = freshness === 'stale' && !preview;

  // 1 Hz clock drives the freshness derivation.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

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
      <BoardBanner bannerUrl={board.bannerUrl} />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        {/* Venue render drops the view tabs and the fullscreen button — the
            board is not operated from the wall (TV-8). */}
        <div className="flex items-center gap-2">
          <BoardMark
            logoUrl={board.logoUrl}
            title={board.title?.trim() || name?.trim() || null}
            className="mr-2"
          />
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
        {/* The clock is secondary and carries no zone abbreviation; it is
            omitted outright when the workspace has no usable timezone.
            Freshness diagnostics — the LIVE pill, the sync health dot and
            the "Updated …" stamp — are OPERATOR controls and render only in
            the operator's preview (§4.4 / state-and-formatting §8). */}
        <div className="flex items-center gap-3">
          <BoardClock now={now} timeZone={timeZone} />
          {preview ? (
            <>
              <LiveStatusPill status={freshness} />
              <SyncHealthIndicator
                lastSyncedAt={lastSyncedAt}
                error={syncError}
                terminal={terminal}
                nowMs={now.getTime()}
              />
              {lastSyncedAt ? (
                <time
                  data-testid="display-last-updated"
                  dateTime={
                    formatDateTime(new Date(lastSyncedAt).toISOString(), 'diagnostic') ?? undefined
                  }
                  className="whitespace-nowrap text-xs text-muted-foreground"
                >
                  Updated{' '}
                  {formatDateTime(
                    new Date(lastSyncedAt).toISOString(),
                    'datetime',
                    timeZone ?? undefined,
                  )}
                </time>
              ) : null}
              <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
            </>
          ) : null}
        </div>
      </header>

      {/* Nice-to-have parity with the meet board's stale treatment (not
          required by this task's scope — see task-4-report.md): a calm
          caption, no red/alarm styling. */}
      {/* An unusable snapshot SUPPRESSES the untrustworthy match content
          (below) rather than publishing a diagnostic banner over it. The
          caption is operator information and rides only the preview. */}
      {freshness === 'stale' && data && preview && (
        <div className="border-b border-border bg-muted/30 px-4 py-1.5 text-center text-sm text-muted-foreground">
          {staleCaption(lastSyncedAt ? now.getTime() - lastSyncedAt : STALE_MS)}
        </div>
      )}

      <main
        className={`min-h-0 flex-1 overflow-auto ${
          freshness === 'stale' && preview ? 'opacity-60 transition-opacity' : ''
        }`}
      >
        {!data || contentSuppressed ? (
          <div className="flex h-full items-center justify-center p-12 text-center">
            <p className="text-2xl text-muted-foreground">
              {!data && syncError ? 'Waiting to connect…' : !data ? 'Loading bracket…' : ''}
            </p>
          </div>
        ) : view === 'draw' ? (
          <BracketDrawView data={data} eventId={activeEventId} />
        ) : view === 'results' ? (
          <BracketResultsView data={data} isFullscreen={isFullscreen} />
        ) : (
          <BracketLiveView
            data={data}
            isFullscreen={isFullscreen}
            showNext={board.showNext}
            showScores={board.showScores}
            /* The bracket board used to ignore the operator's accent
               entirely, so the setting had a demonstrated effect on one of
               the two boards (D7). It reaches restrained chrome only. */
            accent={board.accent}
          />
        )}
      </main>
    </div>
  );
}
