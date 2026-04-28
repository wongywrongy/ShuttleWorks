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
import { Maximize2, Minimize2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAppStore } from '../store/appStore';
import { useLiveTracking } from '../hooks/useLiveTracking';
import { formatSlotTime, parseMatchStartMs } from '../utils/timeUtils';
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

/**
 * Render a started timestamp as a human elapsed clock for the public
 * display. Matches the behaviour of ``components/common/ElapsedTimer.tsx``:
 *
 *   < 1 h    →  ``M:SS``
 *   < 24 h   →  ``H:MM:SS``
 *   ≥ 24 h   →  ``Xd Hh``  (stale data — operator should resolve)
 */
function formatElapsed(startIso: string | undefined | null): string | null {
  const started = parseMatchStartMs(startIso);
  if (started === null) return null;
  const secs = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const days = Math.floor(secs / 86400);
  if (days >= 1) {
    const hours = Math.floor((secs % 86400) / 3600);
    return `${days}d ${hours}h`;
  }
  const hours = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (hours >= 1) {
    return `${hours}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

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

  if (!schedule || !config) {
    return (
      <div
        ref={rootRef}
        className="min-h-screen bg-slate-950 text-white flex items-center justify-center"
      >
        <div className="absolute right-4 top-4 flex items-center gap-3">
          <LiveStatusPill status={liveStatus} error={syncError} />
          <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
        </div>
        <div className="text-center">
          <div className="text-6xl font-bold tracking-tight">Tournament Display</div>
          <div className="mt-3 text-2xl text-slate-400">
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
        ? 'bg-blue-600 text-white shadow-inner'
        : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
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
  // Background tone — picks a deep base. ``navy`` matches the rest
  // of the app; ``black`` is OLED pure; ``midnight`` is deep blue;
  // ``slate`` is neutral cool gray.
  const tvBgTone = config.tvBgTone ?? 'navy';
  const TV_BG: Record<string, string> = {
    navy: 'bg-slate-950',
    black: 'bg-black',
    midnight: 'bg-[#0a0e2a]',
    slate: 'bg-slate-900',
  };
  const TV_HEADER_BG: Record<string, string> = {
    navy: 'bg-slate-950/90',
    black: 'bg-black/90',
    midnight: 'bg-[#0a0e2a]/90',
    slate: 'bg-slate-900/90',
  };
  // Grid columns: explicit override (1-4), else auto.
  const tvGridColumns = config.tvGridColumns ?? null;
  // Card size — controls vertical density of strip + grid cards.
  const tvCardSize = config.tvCardSize ?? 'auto';
  const tvShowScores = config.tvShowScores !== false;
  // Public-display design rule: every court card is the same size,
  // regardless of state or content. Resolve a concrete pixel height
  // per ``tvCardSize`` mode so the audience can locate "Court 4" by
  // counting rows; long names truncate, per-set breakdowns become
  // tooltips. ``auto`` adapts to fullscreen vs admin preview.
  const cardHeightPx =
    tvCardSize === 'compact' ? 72 :
    tvCardSize === 'comfortable' ? 128 :
    tvCardSize === 'large' ? 176 :
    isFullscreen ? 128 : 96;
  // Type scale tracks the card height so big cards get big text.
  const courtNumSize =
    cardHeightPx >= 160 ? 'text-7xl' :
    cardHeightPx >= 120 ? 'text-6xl' :
    cardHeightPx >= 96 ? 'text-5xl' :
    'text-3xl';
  const eventCodeSize =
    cardHeightPx >= 160 ? 'text-4xl' :
    cardHeightPx >= 120 ? 'text-3xl' :
    cardHeightPx >= 96 ? 'text-2xl' :
    'text-base';
  const playerSize =
    cardHeightPx >= 160 ? 'text-4xl' :
    cardHeightPx >= 120 ? 'text-3xl' :
    cardHeightPx >= 96 ? 'text-2xl' :
    'text-base';
  const cardPadX = cardHeightPx >= 120 ? 'px-6' : 'px-4';

  return (
    <div
      ref={rootRef}
      className={`min-h-screen ${TV_BG[tvBgTone]} text-white selection:bg-blue-500/30`}
    >
      {/* ---------- Header ------------------------------------------------ */}
      <div className={`sticky top-0 z-10 border-b border-slate-800 ${TV_HEADER_BG[tvBgTone]} px-6 py-4 backdrop-blur`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-4 min-w-0">
            <div className="text-3xl font-bold tracking-tight">Tournament Status</div>
            {formatTournamentDate(config.tournamentDate) && (
              <div className="text-base text-slate-400 whitespace-nowrap">
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
            {/* Mode picker has moved into the Public-display settings
             *  card on the TV admin tab so the chrome the audience
             *  sees is just nav + clock + fullscreen. */}
            <div className="tabular-nums text-2xl text-slate-300">{currentTime}</div>
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
          <div className="flex w-full flex-col divide-y divide-slate-800 rounded border border-slate-800 bg-slate-900/40">
            {courtMatches.map(({ courtId, match, state, status, nextMatch, nextStartTime }) => {
              const elapsed = status === 'active' ? formatElapsed(state?.actualStartTime) : null;
              const aggregate = state?.score ? `${state.score.sideA}–${state.score.sideB}` : null;
              const sideA = match ? formatPlayers(match.sideA) : '';
              const sideB = match ? formatPlayers(match.sideB) : '';
              // Active uses the configured accent (inline style on
              // the left border); called keeps amber; idle stays
              // slate. Inline style is the cleanest path for an
              // arbitrary hex without polluting Tailwind safelists.
              const borderColor =
                status === 'active'
                  ? tvAccent
                  : status === 'called'
                    ? '#fbbf24' /* amber-400 */
                    : 'rgba(71,85,105,0.7)' /* slate-700ish */;
              return (
                <div
                  key={courtId}
                  className={`grid items-center gap-3 border-l-4 px-4 text-base text-slate-100 grid-cols-[3rem_3.5rem_1fr_5rem_5.5rem]`}
                  style={{ borderLeftColor: borderColor, height: 56 }}
                >
                  <span className="tabular-nums text-2xl font-bold">{courtId}</span>
                  <span className="tabular-nums text-base font-semibold text-slate-300">
                    {match ? match.eventRank || `M${match.matchNumber || '?'}` : '—'}
                  </span>
                  <span className="truncate">
                    {match ? (
                      <>
                        <span className="font-medium">{sideA}</span>
                        <span className="px-2 text-slate-500">vs</span>
                        <span className="font-medium">{sideB}</span>
                      </>
                    ) : nextMatch ? (
                      <span className="text-slate-400">
                        Next {nextStartTime ? `· ${nextStartTime}` : ''} · {formatPlayers(nextMatch.sideA)} vs {formatPlayers(nextMatch.sideB)}
                      </span>
                    ) : (
                      <span className="text-slate-500">Available</span>
                    )}
                  </span>
                  <span className="tabular-nums text-right font-semibold">
                    {tvShowScores ? (aggregate ?? '') : ''}
                  </span>
                  <span className="tabular-nums text-right text-slate-300">
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
            className={[
              'w-full',
              tvDisplayMode === 'grid'
                ? `grid gap-3 ${
                    tvGridColumns === 1
                      ? 'grid-cols-1'
                      : tvGridColumns === 2
                        ? 'grid-cols-1 md:grid-cols-2'
                        : tvGridColumns === 3
                          ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                          : tvGridColumns === 4
                            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                            : 'grid-cols-1 md:grid-cols-2'
                  }`
                : 'flex flex-col gap-2',
            ].join(' ')}
            style={
              tvDisplayMode === 'grid'
                ? { gridAutoRows: `${cardHeightPx}px` }
                : undefined
            }
          >
            {courtMatches.map(({ courtId, match, state, status, nextMatch, nextStartTime }) => {
              const elapsed = status === 'active' ? formatElapsed(state?.actualStartTime) : null;
              // Active card: subtle gradient + accent-colored left
              // border via inline style (the accent is a runtime hex
              // not in the Tailwind safelist). Called keeps amber.
              const cardBgClass =
                status === 'active'
                  ? 'bg-gradient-to-r from-slate-900/40 to-slate-900/60'
                  : status === 'called'
                    ? 'bg-gradient-to-r from-amber-950/60 to-slate-900/60'
                    : 'bg-slate-900/40';
              const cardBorderColor =
                status === 'active'
                  ? tvAccent
                  : status === 'called'
                    ? '#fbbf24'
                    : 'rgba(71,85,105,0.7)';
              const aggregate = state?.score
                ? `${state.score.sideA}–${state.score.sideB}`
                : null;
              const sideA = match ? formatPlayers(match.sideA) : '';
              const sideB = match ? formatPlayers(match.sideB) : '';

              return (
                <div
                  key={courtId}
                  className={`overflow-hidden rounded-xl border-l-4 border-y border-r border-y-slate-800 border-r-slate-800 shadow-lg ${cardBgClass}`}
                  style={{ borderLeftColor: cardBorderColor, height: cardHeightPx }}
                >
                  <div
                    className={`grid h-full items-center gap-3 ${cardPadX} grid-cols-[auto_auto_1fr_auto_auto]`}
                  >
                    {/* Court number — anchor of the strip */}
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
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
                      className={`min-w-[3.5rem] ${eventCodeSize} font-bold text-slate-200 tabular-nums`}
                    >
                      {match ? match.eventRank || `M${match.matchNumber || '?'}` : '—'}
                    </div>

                    {/* Players (grows). Always rendered on their own
                        lines so long doubles names never truncate —
                        there's plenty of horizontal room in the single-
                        column layout, and an operator watching the
                        scoreboard from across a gym must be able to
                        read every name in full. */}
                    <div
                      className={`min-w-0 ${playerSize} leading-tight text-slate-100`}
                    >
                      {match ? (
                        // Constant-height card means we can't let
                        // doubles names wrap unbounded. Truncate per
                        // line with title attr for the full text.
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="block truncate font-medium" title={sideA}>{sideA}</span>
                          <span
                            className={`${isFullscreen ? 'text-sm' : 'text-xs'} uppercase tracking-widest text-slate-500`}
                          >
                            vs
                          </span>
                          <span className="block truncate font-medium" title={sideB}>{sideB}</span>
                        </div>
                      ) : nextMatch ? (
                        // Empty court but next match is on the books —
                        // show a "Next up" preview so the audience can
                        // plan. Less visually loud than an active row
                        // (muted colors + a leading "Next" label) so the
                        // operator's eye still locks onto live matches
                        // first.
                        <div className="flex flex-col gap-0.5 text-slate-300">
                          <span
                            className={`${isFullscreen ? 'text-xs' : 'text-2xs'} font-semibold uppercase tracking-[0.18em] text-slate-500`}
                          >
                            Next up{nextStartTime ? ` · ${nextStartTime}` : ''}
                          </span>
                          <span className={`${isFullscreen ? 'text-2xl' : 'text-base'} font-medium`}>
                            {formatPlayers(nextMatch.sideA)} <span className="text-slate-500">vs</span> {formatPlayers(nextMatch.sideB)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500">Available</span>
                      )}
                    </div>

                    {/* Status pill — accent-colored when active */}
                    <div>
                      {status === 'active' && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full ${isFullscreen ? 'px-3.5 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'} font-bold uppercase tracking-wider`}
                          style={{
                            backgroundColor: `${tvAccent}33` /* ~20% alpha */,
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
                          className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 ${isFullscreen ? 'px-3.5 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'} font-bold uppercase tracking-wider text-amber-300`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Calling
                        </span>
                      )}
                    </div>

                    {/* Score + elapsed (tabular so vertical alignment stays steady) */}
                    <div className={`flex items-baseline gap-3 tabular-nums ${isFullscreen ? 'text-2xl' : 'text-lg'}`}>
                      {tvShowScores && aggregate && (
                        <span className="font-semibold text-slate-100">{aggregate}</span>
                      )}
                      {elapsed && (
                        <span className="text-slate-300 min-w-[4.5rem] text-right">
                          {elapsed}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Per-set breakdown lives inside the strip so the
                      card doesn't change geometry between sets and a
                      long badminton match doesn't push neighbours. */}
                  {tvShowScores && status === 'active' && state?.sets && state.sets.length > 0 && (
                    <div
                      className={`border-t border-slate-800/60 px-4 ${isFullscreen ? 'py-2.5 text-lg' : 'py-1.5 text-sm'} flex flex-wrap gap-1.5 font-mono`}
                    >
                      {state.sets.map((s, i) => (
                        <span
                          key={i}
                          className={`rounded bg-slate-800 ${isFullscreen ? 'px-2.5 py-1' : 'px-1.5 py-0.5'} tabular-nums text-slate-200`}
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
            <div className="mb-4 text-xl font-semibold uppercase tracking-widest text-slate-400">
              Up Next
            </div>
            {upcomingMatches.length === 0 ? (
              <div className="py-12 text-center text-xl text-slate-500">
                No upcoming matches
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingMatches.map(({ assignment, match }) => (
                  <div
                    key={assignment.matchId}
                    className="flex items-center gap-5 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4"
                  >
                    <div className="w-20 text-xl font-bold text-slate-100">
                      {match?.eventRank || `M${match?.matchNumber || '?'}`}
                    </div>
                    <div className="w-14 text-lg font-semibold text-blue-400">
                      C{assignment.courtId}
                    </div>
                    <div className="w-24 tabular-nums text-lg text-slate-300">
                      {formatSlotTime(assignment.slotId, config)}
                    </div>
                    <div className="flex-1 text-xl text-slate-100">
                      <span>{formatPlayers(match?.sideA)}</span>
                      <span className="mx-3 text-sm uppercase tracking-widest text-slate-500">
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
            <div className="mb-4 text-xl font-semibold uppercase tracking-widest text-slate-400">
              Team Standings
            </div>
            {standings.length === 0 ? (
              <div className="py-12 text-center text-xl text-slate-500">
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
                        : 'border-slate-800 bg-slate-900/60'
                    }`}
                  >
                    <div className="w-14 text-4xl font-black tabular-nums text-slate-400">
                      {index + 1}
                    </div>
                    <div className="flex-1 truncate text-3xl font-bold">{team.groupName}</div>
                    <div className="flex items-baseline gap-3 text-xl tabular-nums">
                      <span className="text-emerald-400">{team.wins}W</span>
                      <span className="text-slate-600">–</span>
                      <span className="text-rose-400">{team.losses}L</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------- Progress footer ------------------------------------- */}
      <div className={`fixed inset-x-0 bottom-0 border-t border-slate-800 ${TV_HEADER_BG[tvBgTone]} px-6 py-3 backdrop-blur`}>
        <div className="flex items-center justify-between text-base">
          <div className="text-slate-400">
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
            <span className="inline-flex items-center gap-2 text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {matchesByStatus.called.length} called
            </span>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, backgroundColor: tvAccent }}
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
      className={`${INTERACTIVE_BASE} inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 ${className}`}
      aria-pressed={isFullscreen}
    >
      {isFullscreen ? (
        <Minimize2 aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Maximize2 aria-hidden="true" className="h-4 w-4" />
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
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : status === 'reconnecting'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-red-500/40 bg-red-500/10 text-red-300';
  const dot =
    status === 'live'
      ? 'bg-emerald-400 animate-pulse'
      : status === 'reconnecting'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-400';
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
