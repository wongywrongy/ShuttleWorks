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

function formatElapsed(startIso: string | undefined | null): string | null {
  const started = parseMatchStartMs(startIso);
  if (started === null) return null;
  const secs = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
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
      courts.push({ courtId, match: null, state: null, status: 'empty' });
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

  return (
    <div
      ref={rootRef}
      className="min-h-screen bg-slate-950 text-white selection:bg-blue-500/30"
    >
      {/* ---------- Header ------------------------------------------------ */}
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 px-6 py-4 backdrop-blur">
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
        {view === 'courts' && (
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 lg:grid-cols-2">
            {courtMatches.map(({ courtId, match, state, status }) => {
              const elapsed = status === 'active' ? formatElapsed(state?.actualStartTime) : null;
              const accentClass =
                status === 'active'
                  ? 'border-l-emerald-500 bg-gradient-to-r from-emerald-950/60 to-slate-900/60'
                  : status === 'called'
                    ? 'border-l-amber-400 bg-gradient-to-r from-amber-950/60 to-slate-900/60'
                    : 'border-l-slate-700 bg-slate-900/40';
              const aggregate = state?.score
                ? `${state.score.sideA}–${state.score.sideB}`
                : null;

              return (
                <div
                  key={courtId}
                  className={`rounded-xl border-l-4 border-y border-r border-y-slate-800 border-r-slate-800 shadow-lg ${accentClass}`}
                >
                  <div className="grid items-center gap-3 px-4 py-3 grid-cols-[auto_auto_1fr_auto_auto]">
                    {/* Court number — anchor of the strip */}
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Court
                      </span>
                      <span className="text-4xl font-black tabular-nums leading-none">
                        {courtId}
                      </span>
                    </div>

                    {/* Event code */}
                    <div className="min-w-[3.5rem] text-xl font-bold text-slate-200 tabular-nums">
                      {match ? match.eventRank || `M${match.matchNumber || '?'}` : '—'}
                    </div>

                    {/* Players (grows) */}
                    <div className="min-w-0 text-xl leading-tight text-slate-100">
                      {match ? (
                        <div className="truncate" title={`${formatPlayers(match.sideA)} vs ${formatPlayers(match.sideB)}`}>
                          {formatPlayers(match.sideA)}
                          <span className="mx-2 text-sm uppercase tracking-widest text-slate-500">vs</span>
                          {formatPlayers(match.sideB)}
                        </div>
                      ) : (
                        <span className="text-slate-500">Available</span>
                      )}
                    </div>

                    {/* Status pill */}
                    <div>
                      {status === 'active' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Live
                        </span>
                      )}
                      {status === 'called' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Calling
                        </span>
                      )}
                    </div>

                    {/* Score + elapsed (tabular so vertical alignment stays steady) */}
                    <div className="flex items-baseline gap-3 tabular-nums">
                      {aggregate && (
                        <span className="text-lg font-semibold text-slate-100">{aggregate}</span>
                      )}
                      {elapsed && (
                        <span className="text-lg text-slate-300 min-w-[3.5rem] text-right">
                          {elapsed}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Per-set breakdown lives inside the strip so the
                      card doesn't change geometry between sets and a
                      long badminton match doesn't push neighbours. */}
                  {status === 'active' && state?.sets && state.sets.length > 0 && (
                    <div className="border-t border-slate-800/60 px-4 py-1.5 flex flex-wrap gap-1.5 text-sm font-mono">
                      {state.sets.map((s, i) => (
                        <span
                          key={i}
                          className="rounded bg-slate-800 px-1.5 py-0.5 tabular-nums text-slate-200"
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
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between text-base">
          <div className="text-slate-400">
            {finishedCount} / {totalCount} matches complete · {progressPct}%
          </div>
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-2 text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
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
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
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
