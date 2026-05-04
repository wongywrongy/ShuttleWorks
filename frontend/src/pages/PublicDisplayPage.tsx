/**
 * Public Display Page — tournament status display for TVs, projectors,
 * and public viewing. Access via /display with optional query params:
 *
 *   ?view=courts (default) — current/called match on each court
 *   ?view=schedule        — upcoming matches
 *   ?view=standings       — school-vs-school leaderboard
 *
 * Designed to be readable from across a gym: oversized type, high
 * contrast, and a built-in fullscreen toggle so the operator can hit
 * F or a button to take over the display without F11 ceremony.
 *
 * The /display route mounts this page *outside* AppShell, so the
 * tournament-state hydrator (``useTournamentState``) is not in scope
 * here — we run a dedicated read-only polling loop below so the TV
 * stays fresh against the same backend without needing the operator
 * UI to be open.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowsOut, ArrowsIn } from '@phosphor-icons/react';
import { apiClient } from '../api/client';
import { useAppStore } from '../store/appStore';
import { useLiveTracking } from '../hooks/useLiveTracking';
import { useAdvisories } from '../hooks/useAdvisories';
import { AdvisoryBanner } from '../components/status/AdvisoryBanner';
import { formatSlotTime } from '../lib/time';
import { formatElapsed } from '../lib/timeFormatters';
import { INTERACTIVE_BASE } from '../lib/utils';
import type { ScheduleAssignment } from '../api/dto';

type ViewMode = 'courts' | 'schedule' | 'standings';
type LiveStatus = 'live' | 'reconnecting' | 'offline';

// Poll cadence. 10 s keeps server load negligible but new matches /
// state changes land in under ~20 s worst case (one 10 s gap + the
// pre-existing 5 s match-state poll in useLiveTracking).
const TOURNAMENT_POLL_MS = 10_000;
// How long we'll tolerate no successful fetch before flipping the
// status pill to "Reconnecting". Chosen to give the 10 s poll plus
// one retry room before alarming the operator.
const RECONNECTING_AFTER_MS = 25_000;
// After this long with no success we admit we're offline.
const OFFLINE_AFTER_MS = 60_000;

/** Safe parse for the ``tournamentDate`` config field. Returns null on
 *  any malformed / missing input so we don't render "Invalid Date". */
function formatTournamentDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function PublicDisplayPage() {
  const [searchParams] = useSearchParams();
  const viewParam = searchParams.get('view') as ViewMode | null;
  const [view, setView] = useState<ViewMode>(viewParam || 'courts');
  const [now, setNow] = useState<Date>(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { schedule, config, matches, matchStates, matchesByStatus } = useLiveTracking();
  const players = useAppStore((state) => state.players);
  const groups = useAppStore((state) => state.groups);

  // Standalone display surfaces critical advisories so spectators
  // (and any operator watching the TV) know a replan is imminent.
  // The hook is idempotent — when the page is embedded under
  // AppShell as the TV preview tab, the AppShell-level mount
  // already covers it; mounting again here is harmless.
  useAdvisories();

  // -----------------------------------------------------------------
  // Dedicated read-only polling loop.
  //
  // The standalone /display route does not mount AppShell, so the
  // tournament-state hydrator that normally runs there is absent. We
  // hydrate + refresh here. Writes are intentionally *never* issued
  // from this page; the TV is a read-only mirror of whatever the
  // operator is authoring on another tab / device.
  // -----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const pull = async () => {
      try {
        const remote = await apiClient.getTournamentState();
        if (cancelled) return;
        if (remote) {
          useAppStore.setState({
            config: remote.config ?? null,
            groups: remote.groups ?? [],
            players: remote.players ?? [],
            matches: remote.matches ?? [],
            schedule: remote.schedule ?? null,
            scheduleStats: (remote.scheduleStats as never) ?? null,
            scheduleIsStale: remote.scheduleIsStale ?? false,
          });
        }
        setLastSyncMs(Date.now());
        setSyncError(null);
      } catch (err) {
        if (cancelled) return;
        // Leave the last-known-good state on screen and let the
        // status pill flip to Reconnecting / Offline based on time
        // since the last success. A single failed poll is not a
        // reason to clear the display.
        setSyncError(err instanceof Error ? err.message : 'Connection lost');
      }
    };

    // Kick off immediately so a fresh /display tab doesn't stare at
    // an empty screen for 10 s waiting for the first interval tick.
    void pull();
    const t = window.setInterval(() => void pull(), TOURNAMENT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // 1 Hz tick drives both the wall clock and the elapsed timer on active matches.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Track fullscreen state so the button toggles correctly when the user
  // presses Esc or exits via the OS.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      // Request on the page root so overlay chrome stays hidden. We
      // surface any error to the console so the operator can look it
      // up instead of staring at a button that looks broken — the
      // Fullscreen API can reject quietly on iframes, kiosk browsers,
      // and insecure contexts.
      (rootRef.current ?? document.documentElement)
        .requestFullscreen?.()
        .catch((err) => {
          console.warn('[PublicDisplay] fullscreen request denied:', err);
        });
    } else {
      document.exitFullscreen?.().catch((err) => {
        console.warn('[PublicDisplay] exit fullscreen failed:', err);
      });
    }
  }, []);

  // 'F' keyboard shortcut for fullscreen toggle (ignored when user is typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFullscreen]);

  const currentTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Derive the liveness status from the last-successful sync rather
  // than the most recent attempt — that way a single flaky request
  // doesn't flash "Offline" on a healthy system.
  const liveStatus: LiveStatus = useMemo(() => {
    if (lastSyncMs === null) {
      // Pre-first-sync: be optimistic; a fail would have flipped this.
      return syncError ? 'reconnecting' : 'live';
    }
    const age = now.getTime() - lastSyncMs;
    if (age >= OFFLINE_AFTER_MS) return 'offline';
    if (age >= RECONNECTING_AFTER_MS) return 'reconnecting';
    return 'live';
  }, [lastSyncMs, now, syncError]);

  const playerNames = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const groupNames = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

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

  // Get current match on each court (active > called > empty).
  const courtMatches = useMemo(() => {
    if (!schedule || !config) return [];
    type Row = {
      courtId: number;
      match: (typeof matches)[number] | null;
      state: (typeof matchStates)[string] | null;
      status: 'active' | 'called' | 'empty';
      // When ``status === 'empty'``, the next scheduled assignment for
      // this court (if any). Used by the public TV to render a
      // "Next: <event> at <time>" preview instead of an inert
      // "Available" placeholder.
      nextMatch?: (typeof matches)[number] | null;
      nextStartTime?: string;
    };
    const courts: Row[] = [];

    // Build a per-court list of *future* scheduled assignments, sorted
    // by slot ascending. ``schedule.assignments`` is the source of
    // truth for upcoming play; ``matchStates`` is consulted to skip
    // anything already finished or in progress.
    const futureByCourt = new Map<number, ScheduleAssignment[]>();
    for (let c = 1; c <= config.courtCount; c++) futureByCourt.set(c, []);
    for (const a of schedule.assignments) {
      const s = matchStates[a.matchId]?.status;
      if (s === 'finished' || s === 'started' || s === 'called') continue;
      const list = futureByCourt.get(a.courtId);
      if (list) list.push(a);
    }
    futureByCourt.forEach((list) => list.sort((x, y) => x.slotId - y.slotId));

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
      const next = futureByCourt.get(courtId)?.[0] ?? null;
      courts.push({
        courtId,
        match: null,
        state: null,
        status: 'empty',
        nextMatch: next ? matchMap.get(next.matchId) || null : null,
        nextStartTime: next ? formatSlotTime(next.slotId, config) : undefined,
      });
    }
    return courts;
  }, [schedule, config, matchesByCourt, matchMap, matchStates]);

  // Next 10 scheduled matches.
  const upcomingMatches = useMemo(() => {
    if (!schedule) return [];
    return matchesByStatus.scheduled.slice(0, 10).map((a) => ({
      assignment: a,
      match: matchMap.get(a.matchId),
    }));
  }, [matchesByStatus.scheduled, matchMap, schedule]);

  // School-vs-school standings (dual-meet friendly).
  const standings = useMemo(() => {
    const groupScores: Record<string, { wins: number; losses: number; matchesPlayed: number }> = {};
    groups.forEach((g) => (groupScores[g.id] = { wins: 0, losses: 0, matchesPlayed: 0 }));
    // Index players by id so the inner loop is O(1) instead of O(N) scans.
    const playerById = new Map(players.map((p) => [p.id, p]));
    matchesByStatus.finished.forEach((assignment) => {
      const match = matchMap.get(assignment.matchId);
      const state = matchStates[assignment.matchId];
      if (!match || !state?.score) return;
      const sideAGroupId = match.sideA?.map((id) => playerById.get(id)?.groupId).find(Boolean);
      const sideBGroupId = match.sideB?.map((id) => playerById.get(id)?.groupId).find(Boolean);
      if (!sideAGroupId || !sideBGroupId || sideAGroupId === sideBGroupId) return;
      const aWon = state.score.sideA > state.score.sideB;
      const bWon = state.score.sideB > state.score.sideA;
      if (groupScores[sideAGroupId]) {
        groupScores[sideAGroupId].matchesPlayed++;
        if (aWon) groupScores[sideAGroupId].wins++;
        if (bWon) groupScores[sideAGroupId].losses++;
      }
      if (groupScores[sideBGroupId]) {
        groupScores[sideBGroupId].matchesPlayed++;
        if (bWon) groupScores[sideBGroupId].wins++;
        if (aWon) groupScores[sideBGroupId].losses++;
      }
    });
    return Object.entries(groupScores)
      .map(([groupId, scores]) => ({
        groupId,
        groupName: groupNames.get(groupId) || groupId,
        ...scores,
      }))
      .filter((s) => s.matchesPlayed > 0)
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  }, [matchesByStatus.finished, matchMap, matchStates, groups, groupNames, players]);

  const formatPlayers = (ids: string[] | undefined) => {
    if (!ids || ids.length === 0) return '—';
    return ids.map((id) => playerNames.get(id) || id).join(' & ');
  };

  // ===== Rendering =====================================================

  // ── Theme resolution ──────────────────────────────────────────
  // ``tvTheme`` lets the venue lock the public display to dark or
  // light independently of the operator's app theme. ``auto`` (or
  // unset) follows the app's current theme — read from the
  // ``.dark`` class that ``useAppliedTheme`` attaches to <html>.
  const tvTheme = config?.tvTheme ?? 'dark';
  const isDark = useMemo(() => {
    if (tvTheme === 'dark') return true;
    if (tvTheme === 'light') return false;
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
  }, [tvTheme, now]);
  const themeClass = isDark ? 'dark' : '';

  if (!schedule || !config) {
    return (
      <div
        ref={rootRef}
        className={`${themeClass} min-h-[100dvh] bg-background text-foreground flex items-center justify-center`}
      >
        <div className="absolute right-4 top-4 flex items-center gap-3">
          <LiveStatusPill status={liveStatus} error={syncError} />
          <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
        </div>
        <div className="text-center">
          <div className="text-6xl font-bold tracking-tight">Tournament Display</div>
          <div className="mt-3 text-2xl text-muted-foreground">
            {liveStatus === 'live'
              ? 'No schedule generated yet'
              : 'Waiting for connection to the server…'}
          </div>
        </div>
      </div>
    );
  }

  const finishedCount = matchesByStatus.finished.length;
  const totalCount = schedule.assignments.length;
  const progressPct = totalCount === 0 ? 0 : Math.round((finishedCount / totalCount) * 100);

  const tabClass = (mode: ViewMode) =>
    [
      INTERACTIVE_BASE,
      'rounded-lg px-4 py-2 text-lg font-semibold',
      view === mode
        ? 'bg-primary text-primary-foreground shadow-inner'
        : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    ].join(' ');

  // The director picks how courts render: tall strips, multi-column
  // grid, or one-line list. Stored on the tournament config so the
  // venue's setup stays consistent across reloads. The picker UI lives
  // in the Public-display settings card (admin TV tab) — never on the
  // standalone /display window.
  const tvDisplayMode: 'strip' | 'grid' | 'list' = config.tvDisplayMode ?? 'strip';

  // ---- TV theme + sizing knobs (per-tournament) -----------------------
  // Accent — hex string driving the LIVE border, LIVE pill, and the
  // bottom progress bar. Defaults to emerald (#10b981).
  const tvAccent = (config.tvAccent && /^#?[0-9a-fA-F]{6}$/.test(config.tvAccent.replace(/^#/, '')))
    ? (config.tvAccent.startsWith('#') ? config.tvAccent : `#${config.tvAccent}`)
    : '#10b981';
  // Background tone — only meaningful in dark mode. Light mode falls
  // through to the app's ``bg-background`` token.
  const tvBgTone = config.tvBgTone ?? 'navy';
  const TV_BG_DARK = {
    navy:     { bg: 'bg-slate-950',     header: 'bg-slate-950/90'     },
    black:    { bg: 'bg-black',         header: 'bg-black/90'         },
    midnight: { bg: 'bg-[#0a0e2a]',     header: 'bg-[#0a0e2a]/90'     },
    slate:    { bg: 'bg-slate-900',     header: 'bg-slate-900/90'     },
  } as const;
  const tvBgClass = isDark ? TV_BG_DARK[tvBgTone].bg : 'bg-background';
  const tvHeaderBgClass = isDark ? TV_BG_DARK[tvBgTone].header : 'bg-background/90';
  // Grid columns / card size / score visibility.
  const tvGridColumns = config.tvGridColumns ?? null;
  const tvCardSize = config.tvCardSize ?? 'auto';
  const tvShowScores = config.tvShowScores !== false;
  // Card size → height + matching type scale. Big cards get big text
  // so the audience can read every name from across a gym.
  const cardHeightPx =
    tvCardSize === 'compact' ? 72 :
    tvCardSize === 'comfortable' ? 128 :
    tvCardSize === 'large' ? 176 :
    isFullscreen ? 128 : 96;
  const sizeTier = cardHeightPx >= 160 ? 'xl' : cardHeightPx >= 120 ? 'lg' : cardHeightPx >= 96 ? 'md' : 'sm';
  // tracking-tighter on the giant court-number display — at 5xl-7xl the
  // default tracking reads as gappy across a gym; tightening pulls the
  // glyphs back into a single visual mass.
  const SIZES = {
    sm: { courtNum: 'text-3xl tracking-tight', eventCode: 'text-base', player: 'text-base', padX: 'px-4' },
    md: { courtNum: 'text-5xl tracking-tighter', eventCode: 'text-2xl', player: 'text-2xl', padX: 'px-4' },
    lg: { courtNum: 'text-6xl tracking-tighter', eventCode: 'text-3xl', player: 'text-3xl', padX: 'px-6' },
    xl: { courtNum: 'text-7xl tracking-tighter', eventCode: 'text-4xl', player: 'text-4xl', padX: 'px-6' },
  } as const;
  const { courtNum: courtNumSize, eventCode: eventCodeSize, player: playerSize, padX: cardPadX } = SIZES[sizeTier];

  // Grid columns. Tailwind safelist won't pick up dynamic class
  // names so we keep the literal strings; lookup beats a 4-deep
  // ternary at the callsite.
  const GRID_COLS: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };
  const gridColsClass = (tvGridColumns && GRID_COLS[tvGridColumns]) || GRID_COLS[2];

  return (
    <div
      ref={rootRef}
      className={`${themeClass} min-h-[100dvh] ${tvBgClass} text-foreground selection:bg-primary/30`}
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
      {/* Critical-only advisory banner (read-only on TV) */}
      <div className="px-6 pt-4 empty:hidden">
        <AdvisoryBanner readOnly />
      </div>
      {/* ---------- Header ------------------------------------------------ */}
      <div className={`sticky top-0 z-hud border-b border-border ${tvHeaderBgClass} px-6 py-4 backdrop-blur`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-4 min-w-0">
            <div className="text-3xl font-bold tracking-tight">Tournament Status</div>
            {formatTournamentDate(config.tournamentDate) && (
              <div className="text-base text-muted-foreground whitespace-nowrap">
                {formatTournamentDate(config.tournamentDate)}
              </div>
            )}
            <LiveStatusPill status={liveStatus} error={syncError} />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setView('courts')} className={tabClass('courts')}>
                Courts
              </button>
              <button
                type="button"
                onClick={() => setView('schedule')}
                className={tabClass('schedule')}
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={() => setView('standings')}
                className={tabClass('standings')}
              >
                Standings
              </button>
            </div>
            <div className="tabular-nums text-2xl text-muted-foreground">{currentTime}</div>
            <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
          </div>
        </div>
      </div>

      <div className="px-6 pb-28 pt-6">
        {/* ---------- Courts view ----------------------------------------
         *
         * Each court gets one compact horizontal strip. Courts are
         * peers — they run in parallel, never in conflict with each
         * other — so the visual metaphor is a set of independent
         * rails, not a deck of layered cards. Two-column grid on wide
         * screens halves the vertical footprint so a 6+ court
         * tournament still fits above the fold on a 1080p TV.
         */}
        {view === 'courts' && tvDisplayMode === 'list' && (
          // Compact list — one short row per court. Best for venues
          // with 16+ courts on a 1080p TV. Trades the giant court-
          // number anchor for one-line scannability. Full-span: no
          // max-width cap so the audience uses every pixel; rows are
          // constant-height for predictability.
          <div className="flex w-full flex-col divide-y divide-border rounded border border-border bg-card/40">
            {courtMatches.map(({ courtId, match, state, status, nextMatch, nextStartTime }) => {
              const elapsed = status === 'active' ? formatElapsed(state?.actualStartTime) : null;
              const aggregate = state?.score ? `${state.score.sideA}–${state.score.sideB}` : null;
              const sideA = match ? formatPlayers(match.sideA) : '';
              const sideB = match ? formatPlayers(match.sideB) : '';
              // Court is "closed *now*" when either:
              //   (a) it's in the legacy all-day closedCourts list, or
              //   (b) any time-bounded courtClosures entry covers the
              //       current wall-clock minute. Spectators only need
              //       the "now" view; the schedule tab shows future
              //       windows through normal match rendering.
              const nowMin = now.getHours() * 60 + now.getMinutes();
              const minToMin = (hhmm?: string | null) =>
                hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null;
              const isClosed =
                (config.closedCourts ?? []).includes(courtId) ||
                (config.courtClosures ?? []).some((c) => {
                  if (c.courtId !== courtId) return false;
                  const f = minToMin(c.fromTime) ?? 0;
                  const t = minToMin(c.toTime) ?? 24 * 60;
                  return nowMin >= f && nowMin < t;
                });
              // Row tint carries status — replaces the banned left-stripe.
              // Uses the same status tokens as the grid card mode so the
              // two display modes feel consistent.
              const rowTintClass =
                status === 'active'
                  ? 'bg-status-live-bg/60'
                  : status === 'called'
                    ? 'bg-status-called-bg/50'
                    : '';
              return (
                <div
                  key={courtId}
                  className={`grid items-center gap-3 px-4 text-base text-foreground grid-cols-[3rem_3.5rem_1fr_5rem_5.5rem] ${rowTintClass} ${
                    isClosed ? 'opacity-50' : ''
                  }`}
                  style={{ height: 56 }}
                >
                  <span className={`tabular-nums text-2xl font-bold ${isClosed ? 'line-through text-muted-foreground' : ''}`}>
                    {courtId}
                  </span>
                  <span className="tabular-nums text-base font-semibold text-muted-foreground">
                    {isClosed ? '—' : match ? match.eventRank || `M${match.matchNumber || '?'}` : '—'}
                  </span>
                  <span className="truncate">
                    {isClosed ? (
                      <span className="uppercase tracking-wider text-muted-foreground">Court closed</span>
                    ) : match ? (
                      <>
                        <span className="font-medium">{sideA}</span>
                        <span className="px-2 text-muted-foreground">vs</span>
                        <span className="font-medium">{sideB}</span>
                      </>
                    ) : nextMatch ? (
                      <span className="text-muted-foreground">
                        Next {nextStartTime ? `· ${nextStartTime}` : ''} · {formatPlayers(nextMatch.sideA)} vs {formatPlayers(nextMatch.sideB)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Available</span>
                    )}
                  </span>
                  <span className="tabular-nums text-right font-semibold">
                    {tvShowScores ? (aggregate ?? '') : ''}
                  </span>
                  <span className="tabular-nums text-right text-muted-foreground">
                    {elapsed ?? ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {view === 'courts' && tvDisplayMode !== 'list' && (
          // Strip = single-column, Grid = N-column responsive grid.
          // Both reuse the same court-card render below; only the
          // wrapping container differs. Public-display rules:
          //   • full span (no max-width cap) — venues use big TVs
          //   • constant cell height via ``grid-auto-rows`` (grid)
          //     or ``style.height`` on each card (strip)
          //   • Grid uses the operator's ``tvGridColumns`` override
          //     when set; otherwise auto-fits.
          <div
            className={`w-full ${tvDisplayMode === 'grid' ? `grid gap-3 ${gridColsClass}` : 'flex flex-col gap-2'}`}
            style={tvDisplayMode === 'grid' ? { gridAutoRows: `${cardHeightPx}px` } : undefined}
          >
            {courtMatches.map(({ courtId, match, state, status, nextMatch, nextStartTime }, idx) => {
              const elapsed = status === 'active' ? formatElapsed(state?.actualStartTime) : null;
              // Active / called cards get a tinted background carrying
              // the state. Replaces the old left-stripe accent (which
              // is a banned anti-pattern) with a full-card tint plus an
              // inset highlight ring on active. Backgrounds map to the
              // same status tokens used everywhere else, so theming
              // and dark mode stay consistent.
              const cardBgClass = status === 'active'
                ? 'bg-status-live-bg/80 ring-1 ring-status-live/30 shadow-[inset_0_0_0_1px_hsl(var(--status-live)/0.25)]'
                : status === 'called'
                  ? 'bg-status-called-bg/70 ring-1 ring-status-called/25'
                  : 'bg-card/60';
              const aggregate = state?.score
                ? `${state.score.sideA}–${state.score.sideB}`
                : null;
              const sideA = match ? formatPlayers(match.sideA) : '';
              const sideB = match ? formatPlayers(match.sideB) : '';

              return (
                <div
                  key={courtId}
                  className={`overflow-hidden rounded-xl border border-border shadow-lg animate-block-in ${cardBgClass}`}
                  style={{
                    height: cardHeightPx,
                    // Staggered entry — each tile arrives 60ms after the
                    // previous so the grid doesn't flash on every poll.
                    animationDelay: `${idx * 60}ms`,
                  }}
                >
                  <div
                    className={`grid h-full items-center gap-3 ${cardPadX} grid-cols-[auto_auto_1fr_auto_auto]`}
                  >
                    {/* Court number — anchor of the strip */}
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Court
                      </span>
                      <span
                        className={`${courtNumSize} font-black tabular-nums leading-none`}
                      >
                        {courtId}
                      </span>
                    </div>

                    {/* Event code */}
                    <div
                      className={`min-w-[3.5rem] ${eventCodeSize} font-bold text-foreground tabular-nums`}
                    >
                      {match ? match.eventRank || `M${match.matchNumber || '?'}` : '—'}
                    </div>

                    {/* Players (grows). Always rendered on their own
                        lines so long doubles names never truncate. */}
                    <div
                      className={`min-w-0 ${playerSize} leading-tight text-foreground`}
                    >
                      {match ? (
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="block truncate font-medium" title={sideA}>{sideA}</span>
                          <span
                            className={`${isFullscreen ? 'text-sm' : 'text-xs'} uppercase tracking-widest text-muted-foreground`}
                          >
                            vs
                          </span>
                          <span className="block truncate font-medium" title={sideB}>{sideB}</span>
                        </div>
                      ) : nextMatch ? (
                        <div className="flex flex-col gap-0.5 text-muted-foreground">
                          <span
                            className={`${isFullscreen ? 'text-xs' : 'text-2xs'} font-semibold uppercase tracking-[0.18em]`}
                          >
                            Next up{nextStartTime ? ` · ${nextStartTime}` : ''}
                          </span>
                          <span className={`${isFullscreen ? 'text-2xl' : 'text-base'} font-medium text-foreground`}>
                            {formatPlayers(nextMatch.sideA)} <span className="text-muted-foreground">vs</span> {formatPlayers(nextMatch.sideB)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Available</span>
                      )}
                    </div>

                    {/* Status pill */}
                    <div>
                      {status === 'active' && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full ${isFullscreen ? 'px-3.5 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'} font-bold uppercase tracking-wider`}
                          style={{
                            backgroundColor: `${tvAccent}33`,
                            color: tvAccent,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full animate-pulse"
                            style={{ backgroundColor: tvAccent }}
                          />
                          Live
                        </span>
                      )}
                      {status === 'called' && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 ${isFullscreen ? 'px-3.5 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'} font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
                          Calling
                        </span>
                      )}
                    </div>

                    {/* Score + elapsed */}
                    <div className={`flex items-baseline gap-3 tabular-nums ${isFullscreen ? 'text-2xl' : 'text-lg'}`}>
                      {tvShowScores && aggregate && (
                        <span className="font-semibold text-foreground">{aggregate}</span>
                      )}
                      {elapsed && (
                        <span className="text-muted-foreground min-w-[4.5rem] text-right">
                          {elapsed}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Per-set breakdown */}
                  {tvShowScores && status === 'active' && state?.sets && state.sets.length > 0 && (
                    <div
                      className={`border-t border-border px-4 ${isFullscreen ? 'py-2.5 text-lg' : 'py-1.5 text-sm'} flex flex-wrap gap-1.5 font-mono`}
                    >
                      {state.sets.map((s, i) => (
                        <span
                          key={i}
                          className={`rounded bg-muted ${isFullscreen ? 'px-2.5 py-1' : 'px-1.5 py-0.5'} tabular-nums text-foreground`}
                          title={`Set ${i + 1}`}
                        >
                          {s.sideA}–{s.sideB}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ---------- Schedule view -------------------------------------- */}
        {view === 'schedule' && (
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 text-xl font-semibold uppercase tracking-widest text-muted-foreground">
              Up Next
            </div>
            {upcomingMatches.length === 0 ? (
              <div className="py-12 text-center text-xl text-muted-foreground">
                No upcoming matches
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingMatches.map(({ assignment, match }) => (
                  <div
                    key={assignment.matchId}
                    className="flex items-center gap-5 rounded-xl border border-border bg-card/60 px-5 py-4"
                  >
                    <div className="w-20 text-xl font-bold text-foreground">
                      {match?.eventRank || `M${match?.matchNumber || '?'}`}
                    </div>
                    <div className="w-14 text-lg font-semibold text-blue-600 dark:text-blue-400">
                      C{assignment.courtId}
                    </div>
                    <div className="w-24 tabular-nums text-lg text-muted-foreground">
                      {formatSlotTime(assignment.slotId, config)}
                    </div>
                    <div className="flex-1 text-xl text-foreground">
                      <span>{formatPlayers(match?.sideA)}</span>
                      <span className="mx-3 text-sm uppercase tracking-widest text-muted-foreground">
                        vs
                      </span>
                      <span>{formatPlayers(match?.sideB)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------- Standings view ------------------------------------- */}
        {view === 'standings' && (
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 text-xl font-semibold uppercase tracking-widest text-muted-foreground">
              Team Standings
            </div>
            {standings.length === 0 ? (
              <div className="py-12 text-center text-xl text-muted-foreground">
                No matches completed yet
              </div>
            ) : (
              <div className="space-y-3">
                {standings.map((team, index) => (
                  <div
                    key={team.groupId}
                    className={`flex items-center gap-5 rounded-xl border px-5 py-4 ${
                      index === 0
                        ? 'border-yellow-500/60 bg-yellow-500/10'
                        : 'border-border bg-card/60'
                    }`}
                  >
                    <div className="w-14 text-4xl font-black tabular-nums text-muted-foreground">
                      {index + 1}
                    </div>
                    <div className="flex-1 truncate text-3xl font-bold">{team.groupName}</div>
                    <div className="flex items-baseline gap-3 text-xl tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">{team.wins}W</span>
                      <span className="text-muted-foreground">–</span>
                      <span className="text-rose-600 dark:text-rose-400">{team.losses}L</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------- Progress footer ------------------------------------- */}
      <div className={`fixed inset-x-0 bottom-0 border-t border-border ${tvHeaderBgClass} px-6 py-3 backdrop-blur`}>
        <div className="flex items-center justify-between text-base">
          <div className="text-muted-foreground">
            {finishedCount} / {totalCount} matches complete · {progressPct}%
          </div>
          <div className="flex items-center gap-5">
            <span
              className="inline-flex items-center gap-2"
              style={{ color: tvAccent }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: tvAccent }}
              />
              {matchesByStatus.started.length} active
            </span>
            <span className="inline-flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400" />
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

function FullscreenButton({
  isFullscreen,
  onToggle,
  className = '',
}: {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="tv-fullscreen-toggle"
      title={`${isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} (F)`}
      className={`${INTERACTIVE_BASE} inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground ${className}`}
      aria-pressed={isFullscreen}
    >
      {isFullscreen ? (
        <ArrowsIn aria-hidden="true" className="h-4 w-4" />
      ) : (
        <ArrowsOut aria-hidden="true" className="h-4 w-4" />
      )}
      <span>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
    </button>
  );
}

/**
 * Small pill showing whether the TV is still talking to the backend.
 * Driven by ``liveStatus`` derived from the last-successful sync age.
 */
function LiveStatusPill({
  status,
  error,
}: {
  status: LiveStatus;
  error: string | null;
}) {
  const styles =
    status === 'live'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : status === 'reconnecting'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300';
  const dot =
    status === 'live'
      ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse'
      : status === 'reconnecting'
        ? 'bg-amber-500 dark:bg-amber-400 animate-pulse'
        : 'bg-red-500 dark:bg-red-400';
  const label =
    status === 'live' ? 'Live' : status === 'reconnecting' ? 'Reconnecting…' : 'Offline';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${styles}`}
      title={error ?? `Live data ${status}`}
      data-testid="tv-live-status"
      role="status"
      aria-live="polite"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
