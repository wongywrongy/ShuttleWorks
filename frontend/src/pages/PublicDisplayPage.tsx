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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useLiveTracking } from '../hooks/useLiveTracking';
import { formatSlotTime, parseMatchStartMs } from '../utils/timeUtils';
import { INTERACTIVE_BASE } from '../lib/utils';

type ViewMode = 'courts' | 'schedule' | 'standings';

function formatElapsed(startIso: string | undefined): string | null {
  const started = parseMatchStartMs(startIso);
  if (started === null) return null;
  const secs = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function PublicDisplayPage() {
  const [searchParams] = useSearchParams();
  const viewParam = searchParams.get('view') as ViewMode | null;
  const [view, setView] = useState<ViewMode>(viewParam || 'courts');
  const [now, setNow] = useState<Date>(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { schedule, config, matches, matchStates, matchesByStatus } = useLiveTracking();
  const players = useAppStore((state) => state.players);
  const groups = useAppStore((state) => state.groups);

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
      // Request on the page root so overlay chrome stays hidden.
      (rootRef.current ?? document.documentElement).requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
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

  const playerNames = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const groupNames = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

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
      const active = matchesByStatus.started.find((a) => (matchStates[a.matchId]?.actualCourtId ?? a.courtId) === courtId);
      if (active) {
        courts.push({
          courtId,
          match: matchMap.get(active.matchId) || null,
          state: matchStates[active.matchId] || null,
          status: 'active',
        });
        continue;
      }
      const called = matchesByStatus.called.find((a) => (matchStates[a.matchId]?.actualCourtId ?? a.courtId) === courtId);
      if (called) {
        courts.push({
          courtId,
          match: matchMap.get(called.matchId) || null,
          state: matchStates[called.matchId] || null,
          status: 'called',
        });
        continue;
      }
      courts.push({ courtId, match: null, state: null, status: 'empty' });
    }
    return courts;
  }, [schedule, config, matchesByStatus, matchMap, matchStates]);

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
    matchesByStatus.finished.forEach((assignment) => {
      const match = matchMap.get(assignment.matchId);
      const state = matchStates[assignment.matchId];
      if (!match || !state?.score) return;
      const sideAGroupId = players.find((p) => match.sideA?.includes(p.id))?.groupId;
      const sideBGroupId = players.find((p) => match.sideB?.includes(p.id))?.groupId;
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
        <FullscreenButton
          isFullscreen={isFullscreen}
          onToggle={toggleFullscreen}
          className="absolute right-4 top-4"
        />
        <div className="text-center">
          <div className="text-6xl font-bold tracking-tight">Tournament Display</div>
          <div className="mt-3 text-2xl text-slate-400">No schedule generated yet</div>
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
            {config.tournamentDate && (
              <div className="text-base text-slate-400 whitespace-nowrap">
                {new Date(config.tournamentDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            )}
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
        {/* ---------- Courts view ---------------------------------------- */}
        {view === 'courts' && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courtMatches.map(({ courtId, match, state, status }) => {
              const elapsed = status === 'active' ? formatElapsed(state?.actualStartTime) : null;
              const borderClass =
                status === 'active'
                  ? 'border-emerald-500/80 bg-emerald-950/40'
                  : status === 'called'
                    ? 'border-amber-400/80 bg-amber-950/40'
                    : 'border-slate-800 bg-slate-900/40';
              return (
                <div
                  key={courtId}
                  className={`rounded-2xl border-2 p-6 shadow-lg transition ${borderClass}`}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Court
                    </div>
                    <div className="text-5xl font-black tabular-nums leading-none">
                      {courtId}
                    </div>
                  </div>
                  <div className="mt-4 min-h-[7.5rem]">
                    {match ? (
                      <>
                        <div className="text-2xl font-bold text-slate-100">
                          {match.eventRank || `M${match.matchNumber || '?'}`}
                        </div>
                        <div className="mt-2 space-y-1 text-xl leading-tight text-slate-100">
                          <div className="truncate" title={formatPlayers(match.sideA)}>
                            {formatPlayers(match.sideA)}
                          </div>
                          <div className="text-sm uppercase tracking-widest text-slate-500">
                            vs
                          </div>
                          <div className="truncate" title={formatPlayers(match.sideB)}>
                            {formatPlayers(match.sideB)}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center text-lg text-slate-500">
                        Available
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    {status === 'called' && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-sm font-bold uppercase tracking-wider text-amber-300">
                        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                        Now Calling
                      </span>
                    )}
                    {status === 'active' && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-bold uppercase tracking-wider text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        In Progress
                      </span>
                    )}
                    {elapsed && (
                      <span className="tabular-nums text-lg text-slate-300">{elapsed}</span>
                    )}
                  </div>
                  {status === 'active' && state?.sets && state.sets.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 text-base font-mono">
                      {state.sets.map((s, i) => (
                        <span
                          key={i}
                          className="rounded bg-slate-800 px-2 py-1 tabular-nums text-slate-200"
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
