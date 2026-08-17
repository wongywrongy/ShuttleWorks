/**
 * Meet Display Page — the meet workspace's TV / projector surface. Rendered
 * by ``PublicDisplayPage`` (the kind-router) for meet-kind workspaces; the
 * bracket equivalent is ``bracketDisplay/BracketDisplayPage``. Query params:
 *
 *   ?view=courts (default) — current/called match on each court
 *   ?view=schedule        — upcoming matches
 *
 * Designed to be readable from across a gym: oversized type, high
 * contrast, and a built-in fullscreen toggle so the operator can hit
 * F or a button to take over the display without F11 ceremony.
 *
 * Standings (school-vs-school leaderboard, server-computed — Task 9) are
 * NOT a manually-selectable tab: `config.standingsMode` (director-set, or
 * "Auto" derived from court count — see ./publicDisplay/standingsLayout.ts)
 * decides whether they render as a persistent side panel next to the
 * courts grid, or periodically take over the whole content area on a
 * timer ("rotate"). Hidden entirely whenever there's nothing to show
 * (Meet disabled / no scored pool play yet).
 *
 * The /display route mounts this page *outside* AppShell, so the
 * tournament-state hydrator (``useTournamentState``) is not in scope
 * here — we run a dedicated read-only polling loop below so the TV
 * stays fresh against the same backend without needing the operator
 * UI to be open.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTournamentStore } from '../../store/tournamentStore';
import { useLiveTracking } from '../../hooks/useLiveTracking';
import { formatSlotTime } from '../../lib/time';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { useDisplaySync } from './publicDisplay/useDisplaySync';
import { STALE_CAPTION } from './publicDisplay/freshness';
import { useFullscreen } from './publicDisplay/useFullscreen';
import { formatTournamentDate } from './publicDisplay/helpers';
import { FullscreenButton } from './publicDisplay/FullscreenButton';
import { BoardSwitch } from './publicDisplay/BoardSwitch';
import { LiveStatusPill } from './publicDisplay/LiveStatusPill';
import { ScheduleView } from './publicDisplay/ScheduleView';
import { StandingsView } from './publicDisplay/StandingsView';
import { CourtsView } from './publicDisplay/CourtsView';
import { assignLanes, type LaneItem } from './publicDisplay/courtLanes';
import { DEFAULT_PRESET_ID } from './publicDisplay/displayPresets';
import { orderCourts, visibleCourts, defaultColumns } from './publicDisplay/courtLayout';
import { standingsPlacement } from './publicDisplay/standingsLayout';
import {
  resolveTvAccent,
  resolveCardHeightPx,
  resolveCardSizeClasses,
  resolveGridColsClass,
} from './publicDisplay/tvSizing';

// How often the ROTATE placement (Task 9) swaps the main content area
// between the current view (courts/schedule) and a full-bleed standings
// screen. Symmetric — same dwell time on each side — since the brief
// doesn't call for asymmetric timing and a single interval is simplest
// to reason about (and to fake-timer test) than a ping-pong of two
// different durations.
const ROTATION_INTERVAL_MS = 15_000;

type ViewMode = 'courts' | 'schedule';

/** `hybrid` — this workspace also runs a Bracket. Adds the board switch and,
 *  crucially, SCOPES the progress footer: `finishedCount / totalCount` counts
 *  meet assignments only, so on a hybrid workspace an unqualified
 *  "12 / 24 matches complete · 50%" is an authoritative-looking claim about a
 *  tournament half of which it cannot see. Meet and Bracket match records are
 *  non-merged by design (ADR 0006) — there is no cross-engine denominator to
 *  state, so the honest fix is to name the half being counted. */
export function MeetDisplayPage({ hybrid = false }: { hybrid?: boolean } = {}) {
  const [searchParams] = useSearchParams();
  // Whitelist, not a blind cast: a stale bookmarked/QR'd URL from before
  // task 9 (`?view=standings` was a real, documented param) must still
  // resolve to a real view — falling through to 'courts' rather than a
  // dead `view` value that matches neither render branch and would leave
  // the content area blank on an unattended venue TV.
  const viewParam = searchParams.get('view');
  const [view, setView] = useState<ViewMode>(viewParam === 'schedule' ? 'schedule' : 'courts');
  const [now, setNow] = useState<Date>(() => new Date());
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { schedule, config, matches, matchStates, matchesByStatus } = useLiveTracking();
  const players = useTournamentStore((state) => state.players);
  // Server-computed Meet pool standings (Task 2 + 9) — see
  // ./publicDisplay/standingsLayout.ts for the panel-vs-rotation decision
  // and useDisplaySync.ts / hooks/useTournamentState.ts for how this field
  // is hydrated onto the store for the standalone board vs. the in-shell
  // embed respectively. Empty for bracket-kind/Meet-disabled workspaces.
  const standings = useTournamentStore((state) => state.standings);

  // No `useAdvisories()` here, deliberately. Display projects, never
  // operates (CLAUDE.md's module model), so the public board renders no
  // operator-facing advisory — and the hook was dead weight on both routes
  // that mount this page: on standalone `/display?id=` it reads its
  // tournament id from a route PATH param only, so the id is null and its
  // effect returns before firing; in the embedded TV-preview tab `AppShell`
  // already mounts it globally, so the call was a duplicate 15s poll.

  // 1 Hz tick drives both the wall clock and the elapsed timer on active matches.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Read-only polling + freshness derivation. See ./publicDisplay/useDisplaySync.ts.
  // `linkDead` = the link itself can never work (invalid/revoked token, deleted
  // workspace); polling has already stopped.
  const { freshness, terminal: linkDead } = useDisplaySync(now);

  // Fullscreen toggle + F-key shortcut. See ./publicDisplay/useFullscreen.ts.
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);

  const currentTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const playerNames = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  // ---- Standings placement (task 9) -------------------------------------
  // `config?.courtCount` defaults to 0 (-> 'side' tier) before the first
  // hydrate lands; harmless since `hasStandings` is false until real data
  // arrives, so nothing renders either way. Hide entirely — never an empty
  // panel — whenever Meet isn't enabled or there's no scored pool play yet:
  // the server returns `[]` for both cases (see MeetStandingRowDTO's doc
  // comment), so a single length check covers both.
  const hasStandings = standings.length > 0;
  const resolvedStandingsPlacement = standingsPlacement(
    config?.courtCount ?? 0,
    config?.standingsMode,
  );
  const showStandingsSidePanel = hasStandings && resolvedStandingsPlacement === 'side';
  const rotateStandings = hasStandings && resolvedStandingsPlacement === 'rotate';

  // Timed rotation: alternate the main content area between the current
  // view (courts/schedule) and a full-bleed standings screen. Only ticks
  // while rotation is actually active; flips back to "showing the normal
  // view" the instant rotation stops (mode change, standings disappear,
  // Meet gets disabled), so switching away never leaves the board stuck
  // mid-rotation on a screen that's no longer supposed to exist.
  const [rotationShowingStandings, setRotationShowingStandings] = useState(false);
  useEffect(() => {
    if (!rotateStandings) {
      setRotationShowingStandings(false);
      return;
    }
    const t = window.setInterval(() => {
      setRotationShowingStandings((prev) => !prev);
    }, ROTATION_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [rotateStandings]);

  // Indexing helpers we'll reuse below. O(1) by-matchId lookups so the
  // courts / standings derivations don't re-scan the full matchesByStatus
  // array on every tick.
  const matchesByCourt = useMemo(() => {
    const active = new Map<number, string>();
    const called = new Map<number, string>();
    for (const a of matchesByStatus.started) {
      const courtId = matchStates[a.matchId]?.actualCourtId ?? a.courtId;
      active.set(courtId, a.matchId);
    }
    for (const a of matchesByStatus.called) {
      const courtId = matchStates[a.matchId]?.actualCourtId ?? a.courtId;
      if (!active.has(courtId)) called.set(courtId, a.matchId);
    }
    return { active, called };
  }, [matchesByStatus.started, matchesByStatus.called, matchStates]);

  // ---- Relative Now/Next/Later lanes (task 8) --------------------------
  // Retires the drifting wall-clock preview: the board's PRIMARY label per
  // court is now a relative lane, not an absolute time that silently goes
  // stale during delays. `now` is strictly LIVE-gated (only matches that
  // have actually started/been called go in `nowIds`) — an idle court
  // never gets a manufactured "now". Everything else on a court is ordered
  // by its planned slot into `next`/`later`. This is deliberately a
  // board-local helper (publicDisplay/courtLanes.ts), NOT shared with
  // Operations' always-occupied `deriveCourtLanes` — see that file's doc
  // comment and task-8-report.md for why forcing a shared extraction
  // would risk the shipped Run surface for a divergent `now` rule.
  const laneItems = useMemo((): LaneItem[] => {
    if (!schedule) return [];
    return schedule.assignments
      .filter((a) => matchStates[a.matchId]?.status !== 'finished')
      .map((a) => ({
        id: a.matchId,
        court: matchStates[a.matchId]?.actualCourtId ?? a.courtId,
        plannedSlot: a.slotId,
      }));
  }, [schedule, matchStates]);

  const nowIds = useMemo(
    () => new Set<string>([...matchesByCourt.active.values(), ...matchesByCourt.called.values()]),
    [matchesByCourt],
  );

  const lanes = useMemo(() => assignLanes(laneItems, nowIds), [laneItems, nowIds]);

  const assignmentByMatchId = useMemo(
    () => new Map((schedule?.assignments ?? []).map((a) => [a.matchId, a])),
    [schedule],
  );

  // Per-court preview ids — `assignLanes` guarantees at most one `next` and
  // one `later` per court.
  const previewByCourt = useMemo(() => {
    const next = new Map<number, string>();
    const later = new Map<number, string>();
    for (const item of laneItems) {
      const lane = lanes.get(item.id);
      if (lane === 'next') next.set(item.court, item.id);
      else if (lane === 'later') later.set(item.court, item.id);
    }
    return { next, later };
  }, [laneItems, lanes]);

  // Get current match on each court (active > called > empty), plus a
  // Next/Later preview for idle courts.
  const courtMatches = useMemo(() => {
    if (!schedule || !config) return [];
    type Row = {
      courtId: number;
      match: (typeof matches)[number] | null;
      state: (typeof matchStates)[string] | null;
      status: 'active' | 'called' | 'empty';
      // When ``status === 'empty'``, the Next/Later lane preview for this
      // court (if any). Used by the public TV to render relative
      // "Next"/"Later" labels (de-emphasized planned clock) instead of an
      // inert "Available" placeholder.
      nextMatch?: (typeof matches)[number] | null;
      nextStartTime?: string;
      laterMatch?: (typeof matches)[number] | null;
      laterStartTime?: string;
    };
    const courts: Row[] = [];

    for (let courtId = 1; courtId <= config.courtCount; courtId++) {
      const activeId = matchesByCourt.active.get(courtId);
      if (activeId) {
        courts.push({
          courtId,
          match: matchMap.get(activeId) || null,
          state: matchStates[activeId] || null,
          status: 'active',
        });
        continue;
      }
      const calledId = matchesByCourt.called.get(courtId);
      if (calledId) {
        courts.push({
          courtId,
          match: matchMap.get(calledId) || null,
          state: matchStates[calledId] || null,
          status: 'called',
        });
        continue;
      }
      const nextId = previewByCourt.next.get(courtId) ?? null;
      const nextAssignment = nextId ? assignmentByMatchId.get(nextId) : undefined;
      const laterId = previewByCourt.later.get(courtId) ?? null;
      const laterAssignment = laterId ? assignmentByMatchId.get(laterId) : undefined;
      courts.push({
        courtId,
        match: null,
        state: null,
        status: 'empty',
        nextMatch: nextId ? matchMap.get(nextId) || null : null,
        nextStartTime: nextAssignment ? formatSlotTime(nextAssignment.slotId, config) : undefined,
        laterMatch: laterId ? matchMap.get(laterId) || null : null,
        laterStartTime: laterAssignment ? formatSlotTime(laterAssignment.slotId, config) : undefined,
      });
    }
    return courts;
  }, [schedule, config, matchesByCourt, matchMap, matchStates, previewByCourt, assignmentByMatchId]);

  // Director-controlled arrangement: manual order first, then hide
  // (presentation-only — see courtLayout.ts's doc comment). This is the
  // ONLY place hide/order apply; `courtMatches` above still computes
  // every court's real state regardless of visibility, so a hidden
  // court's live match keeps tracking normally in Operations — it's
  // just never handed to CourtsView. A hidden court with a live match
  // does NOT auto-reappear here (Q9); it stays hidden until the
  // director restores it from the editor.
  const displayedCourtRows = useMemo(() => {
    if (courtMatches.length === 0) return courtMatches;
    const byId = new Map(courtMatches.map((row) => [row.courtId, row]));
    const ordered = orderCourts(courtMatches.map((row) => row.courtId), config?.courtOrder);
    const visible = visibleCourts(ordered, config?.hiddenCourts);
    return visible.map((id) => byId.get(id)).filter((row): row is (typeof courtMatches)[number] => row != null);
  }, [courtMatches, config?.courtOrder, config?.hiddenCourts]);

  // Next 10 scheduled matches.
  const upcomingMatches = useMemo(() => {
    if (!schedule) return [];
    return matchesByStatus.scheduled.slice(0, 10).map((a) => ({
      assignment: a,
      match: matchMap.get(a.matchId),
    }));
  }, [matchesByStatus.scheduled, matchMap, schedule]);

  // ===== Rendering =====================================================

  // ── Preset resolution ─────────────────────────────────────────
  // ``tvPreset`` selects a complete substrate (bg + text + border)
  // for the TV. Applied as a `data-tv-preset` attribute on the
  // page root; the matching CSS in displayPresets.css overrides
  // --bg / --ink / --rule-soft / --muted so every Tailwind token
  // (bg-background, text-foreground, text-muted-foreground,
  // border-border, bg-card) inside re-themes via the cascade.
  // Independent of the operator's app theme — venues with sun-lit
  // screens can pick a light preset while the operator stays dark.
  const tvPreset = config?.tvPreset ?? DEFAULT_PRESET_ID;

  if (!schedule || !config || linkDead) {
    return (
      <div
        ref={rootRef}
        data-tv-preset={tvPreset}
        className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center"
      >
        <div className="absolute right-4 top-4 flex items-center gap-3">
          {/* A freshness pill on a dead link promises a recovery that can never
              come; the board is not "Delayed", it is finished. */}
          {linkDead ? null : <LiveStatusPill status={freshness} />}
          <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
        </div>
        {linkDead ? (
          <div className="text-center" data-testid="display-link-invalid">
            <div className="text-6xl font-bold tracking-tight">Display link not valid</div>
            <div className="mt-3 text-2xl text-muted-foreground">
              This link has been turned off or never existed. Ask the tournament
              desk for a new one.
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-6xl font-bold tracking-tight">Tournament Display</div>
            <div className="mt-3 text-2xl text-muted-foreground">
              {freshness === 'live' ? 'No schedule generated yet' : 'Waiting to connect…'}
            </div>
          </div>
        )}
      </div>
    );
  }

  const finishedCount = matchesByStatus.finished.length;
  const totalCount = schedule.assignments.length;
  const progressPct = totalCount === 0 ? 0 : Math.round((finishedCount / totalCount) * 100);

  // TV view tabs: rounded 1px-border chip in sentence-case sans, active
  // = accent (azure) border + tinted bg + accent text. Readable across a
  // gym without the mono-uppercase shouting.
  // Takes the active flag rather than the view id, so the hybrid board switch
  // (which is never one of this board's views) wears the same chrome.
  const tabClass = (active: boolean) =>
    [
      INTERACTIVE_BASE,
      'rounded border px-4 py-2 text-base font-semibold',
      active
        ? 'border-accent bg-accent/15 text-accent'
        : 'border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/40 hover:text-foreground',
    ].join(' ');

  // The director picks how courts render: tall strips, multi-column
  // grid, or one-line list. Stored on the tournament config so the
  // venue's setup stays consistent across reloads. The picker UI lives
  // in the Public-display settings card (admin TV tab) — never on the
  // standalone /display window.
  const tvDisplayMode: 'strip' | 'grid' | 'list' = config.tvDisplayMode ?? 'strip';

  // ---- TV sizing + accent knobs (per-tournament) -----------------------
  // Shared with DisplayPreview — see publicDisplay/tvSizing.ts for the
  // single source of truth (previously duplicated verbatim in both
  // files; extracted as part of task 7 to remove that drift risk).
  const tvAccent = resolveTvAccent(config.tvAccent);
  const tvCardSize = config.tvCardSize ?? 'auto';
  const tvShowScores = config.tvShowScores !== false;
  const cardHeightPx = resolveCardHeightPx(tvCardSize, isFullscreen);
  const { courtNumSize, eventCodeSize, playerSize, cardPadX } = resolveCardSizeClasses(cardHeightPx);

  // Grid columns — director override wins; otherwise a responsive
  // default derived from how many courts are actually visible (see
  // courtLayout.ts#defaultColumns). Hidden courts never count toward
  // the column math since they're never on screen.
  const resolvedColumns = defaultColumns(displayedCourtRows.length, config.tvGridColumns ?? null);
  const gridColsClass = resolveGridColsClass(resolvedColumns);

  // Built once and reused verbatim whether or not the SIDE standings panel
  // is present (task 9) — the panel only wraps this in a flex row, it
  // never changes the props CourtsView itself receives.
  const courtsViewNode = (
    <CourtsView
      courts={displayedCourtRows}
      config={config}
      now={now}
      displayMode={tvDisplayMode}
      gridColsClass={gridColsClass}
      cardHeightPx={cardHeightPx}
      cardPadX={cardPadX}
      courtNumSize={courtNumSize}
      eventCodeSize={eventCodeSize}
      playerSize={playerSize}
      tvAccent={tvAccent}
      tvShowScores={tvShowScores}
      isFullscreen={isFullscreen}
      playerNames={playerNames}
    />
  );

  return (
    <div
      ref={rootRef}
      data-tv-preset={tvPreset}
      /* `relative` anchors the progress footer below. It used to be
         viewport-`fixed`, which is right on the real fullscreen board but
         wrong in the in-shell Preview: the bar spanned the whole window and
         ran underneath the icon rail and the workspace sidebar. */
      className="relative min-h-[100dvh] bg-background text-foreground selection:bg-accent/30"
    >
      {/* Subtle film-grain overlay — adds a barely-there texture to the
          full-screen TV surface so the pure flats don't read as
          sterile. Fixed + pointer-events-none keeps it off the GPU's
          continuous-repaint path during scroll. Inline data-URL avoids
          a network request for the 100-byte SVG. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-modal opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
      {/* ---------- Header ------------------------------------------------ */}
      <div className="sticky top-0 z-hud border-b border-border bg-background/90 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
            {/* Tournament name when set, else a generic "Live ops" label
                so the header still anchors the page when the operator
                hasn't named their tournament. */}
            <div className="min-w-0 break-words text-3xl font-bold tracking-tight">
              {config.tournamentName?.trim() || 'Tournament status'}
            </div>
            {formatTournamentDate(config.tournamentDate) && (
              <div className="whitespace-nowrap text-base text-muted-foreground tabular-nums">
                {formatTournamentDate(config.tournamentDate)}
              </div>
            )}
            <LiveStatusPill status={freshness} />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView('courts')}
                className={tabClass(view === 'courts')}
              >
                Courts
              </button>
              <button
                type="button"
                onClick={() => setView('schedule')}
                className={tabClass(view === 'schedule')}
              >
                Schedule
              </button>
              {hybrid ? <BoardSwitch to="bracket" className={tabClass(false)} /> : null}
            </div>
            <div className="tabular-nums text-2xl text-muted-foreground">{currentTime}</div>
            <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
          </div>
        </div>
      </div>

      {/* View swap area. `key` + `motion-enter` so changing tabs (or the
          ROTATE placement taking over the screen) materializes the new
          content via the brand recipe rather than snapping in — visible
          from across a gym. */}
      <div
        key={rotateStandings && rotationShowingStandings ? 'standings-rotation' : view}
        className="motion-enter px-6 pb-28 pt-6"
      >
        {rotateStandings && rotationShowingStandings ? (
          // ROTATE placement (task 9): periodically takes over the whole
          // content area instead of a permanent side panel — for larger
          // venues where a persistent panel would crowd an already-busy
          // court grid. See ./publicDisplay/standingsLayout.ts.
          <div data-testid="standings-rotation-screen">
            <StandingsView standings={standings} />
          </div>
        ) : (
          <>
            {view === 'courts' && (
              <>
                {freshness === 'stale' && (
                  <div className="mb-4 text-center text-base text-muted-foreground">
                    {STALE_CAPTION}
                  </div>
                )}
                <div className={freshness === 'stale' ? 'opacity-60 transition-opacity' : ''}>
                  {showStandingsSidePanel ? (
                    // SIDE placement (task 9): a persistent panel next to
                    // the court grid — shrinks the space available to it,
                    // it never resizes the grid's own column math (that
                    // stays viewport-keyed via defaultColumns/CourtsView's
                    // responsive classes, unrelated to this panel's width).
                    <div className="flex flex-col gap-6 xl:flex-row">
                      <div className="min-w-0 flex-1">{courtsViewNode}</div>
                      <div
                        className="w-full flex-none xl:w-96"
                        data-testid="standings-side-panel"
                      >
                        <StandingsView standings={standings} />
                      </div>
                    </div>
                  ) : (
                    courtsViewNode
                  )}
                </div>
              </>
            )}

            {view === 'schedule' && (
              <ScheduleView
                upcomingMatches={upcomingMatches}
                config={config}
                playerNames={playerNames}
              />
            )}
          </>
        )}
      </div>

      {/* ---------- Progress footer ------------------------------------- */}
      <div className="sticky inset-x-0 bottom-0 border-t border-border bg-background/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between text-base">
          <div className="text-muted-foreground">
            {finishedCount} / {totalCount} {hybrid ? 'meet matches' : 'matches'} complete ·{' '}
            {progressPct}%
          </div>
          <div className="flex items-center gap-5">
            {/* Same token as the card LIVE band (one status, one hue — D1.3);
                the arbitrary tvAccent hex is brand chrome, not a status. */}
            <span className="inline-flex items-center gap-2 text-status-live">
              <span className="h-2 w-2 rounded-full bg-status-live" />
              {matchesByStatus.started.length} active
            </span>
            <span className="inline-flex items-center gap-2 text-status-called">
              <span className="h-2 w-2 rounded-full bg-status-called sw-pulse" />
              {matchesByStatus.called.length} called
            </span>
          </div>
        </div>
        {/* Track stays full-width; the fill animates via transform: scaleX
            so we never trip a layout reflow on the parent grid each tick. */}
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
        >
          <div
            className="h-full origin-left rounded-full transition-transform duration-500 ease-brand"
            style={{ transform: `scaleX(${progressPct / 100})`, backgroundColor: tvAccent }}
          />
        </div>
      </div>
    </div>
  );
}

