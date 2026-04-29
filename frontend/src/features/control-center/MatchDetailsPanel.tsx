/**
 * Match Details Panel - Shows selected match details
 */
import { useMemo, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { ImpactAnalysis } from '../../hooks/useLiveOperations';
import type { MatchDTO, MatchStateDTO, ScheduleAssignment, ScheduleDTO, PlayerDTO, RosterGroupDTO, TournamentConfig } from '../../api/dto';
import type { TrafficLightResult } from '../../utils/trafficLight';
import { getMatchLabel } from '../../utils/matchUtils';
import { getMatchPlayerIds } from '../../utils/trafficLight';
import { ElapsedTimer } from '../../components/common/ElapsedTimer';
import { timeToSlot } from '../../lib/time';
import { formatIsoClock, formatDuration } from '../../lib/timeFormatters';
import { buildGroupIndex, getPlayerSchoolAccent } from '../../lib/schoolAccent';
import { SchoolDot } from '../../components/SchoolDot';
import { ScoreEditor } from './ScoreEditor';
import { StatusPill } from '../../components/StatusPill';
import { indexById } from '../../store/selectors';

// Map traffic-light status → pill tone + label for the Ready / Resting
// / Blocked badge on scheduled matches.
const LIGHT_LABEL = { green: 'Ready', yellow: 'Resting', red: 'Blocked' } as const;

interface MatchDetailsPanelProps {
  assignment?: ScheduleAssignment;
  match: MatchDTO | undefined;
  matchState: MatchStateDTO | undefined;
  matches: MatchDTO[];
  trafficLight?: TrafficLightResult;
  analysis?: ImpactAnalysis | null;
  playerNames: Map<string, string>;
  slotToTime: (slot: number) => string;
  onSelectMatch?: (matchId: string) => void;
  schedule?: ScheduleDTO | null;
  matchStates?: Record<string, MatchStateDTO>;
  players?: PlayerDTO[];
  groups?: RosterGroupDTO[];
  config?: TournamentConfig | null;
  currentSlot?: number;
  onUpdateStatus?: (
    matchId: string,
    status: MatchStateDTO['status'],
    additionalData?: Partial<MatchStateDTO>,
  ) => Promise<void>;
  onConfirmPlayer?: (matchId: string, playerId: string, confirmed: boolean) => Promise<void>;
  onSubstitute?: (matchId: string, oldPlayerId: string, newPlayerId: string) => void;
  onRemovePlayer?: (matchId: string, playerId: string) => void;
  onCascadingStart?: (matchId: string, courtId: number) => void;
  onUndoStart?: (matchId: string) => void;
  /** Optional parent-controlled mode override. When provided the
   *  panel renders that editor mode and ignores its internal state —
   *  lets the WorkflowPanel rows pop the score editor directly. */
  mode?: 'idle' | 'score' | 'roster';
  onModeChange?: (mode: 'idle' | 'score' | 'roster') => void;
  /** Open the disruption-repair dialog with type+matchId pre-filled.
   *  Lets the per-match shortcuts (Cancel / Mark overrun) call into
   *  the page-level dialog without each row owning the modal state. */
  onRequestDisruption?: (
    type: 'cancellation' | 'overrun' | 'court_closed',
    matchId: string,
  ) => void;
  /** Open the Move/Postpone dialog with matchId pre-filled. The
   *  everyday "this match is just running late" path that doesn't
   *  rise to a full disruption. */
  onRequestMove?: (matchId: string) => void;
}

/**
 * Calculate rest time since a player's last finished match
 */
function getPlayerRestTime(
  playerId: string,
  matchStates: Record<string, MatchStateDTO>,
  matches: MatchDTO[],
  schedule: ScheduleDTO,
  config: TournamentConfig,
  currentSlot: number,
  excludeMatchId?: string
): { restSlots: number; restMinutes: number; lastMatchLabel?: string } | null {
  let latestEnd = -1;
  let lastMatchLabel: string | undefined;

  for (const m of matches) {
    if (excludeMatchId && m.id === excludeMatchId) continue;

    const state = matchStates[m.id];
    if (state?.status !== 'finished') continue;

    const playerIds = getMatchPlayerIds(m);
    if (!playerIds.includes(playerId)) continue;

    const assignment = schedule.assignments.find((a) => a.matchId === m.id);
    if (!assignment) continue;

    let endSlot: number;
    if (state.actualEndTime) {
      endSlot = timeToSlot(state.actualEndTime, config);
    } else {
      endSlot = assignment.slotId + assignment.durationSlots;
    }

    if (endSlot > latestEnd) {
      latestEnd = endSlot;
      lastMatchLabel = m.eventRank || `M${m.matchNumber || '?'}`;
    }
  }

  if (latestEnd < 0) return null;

  const restSlots = currentSlot - latestEnd;
  const restMinutes = restSlots * config.intervalMinutes;

  return { restSlots, restMinutes, lastMatchLabel };
}

export function MatchDetailsPanel({
  assignment,
  match,
  matchState,
  matches,
  trafficLight,
  analysis,
  playerNames,
  slotToTime,
  onSelectMatch,
  schedule,
  matchStates,
  players,
  groups,
  config,
  currentSlot,
  onUpdateStatus,
  onConfirmPlayer,
  onSubstitute,
  onRemovePlayer,
  onCascadingStart,
  onUndoStart,
  mode: modeProp,
  onModeChange,
  onRequestDisruption,
  onRequestMove,
}: MatchDetailsPanelProps) {
  const matchMap = useMemo(() => indexById(matches), [matches]);
  // ``mode`` toggles the panel between its default read mode and the
  // inline score editor. Roster edits (substitute / remove player)
  // live directly on the player rows now and don't need a mode of
  // their own. Mode can be either controlled (via the parent) or
  // self-managed.
  const [internalMode, setInternalMode] = useState<'idle' | 'score' | 'roster'>('idle');
  const mode = modeProp ?? internalMode;
  const setMode = (next: 'idle' | 'score' | 'roster') => {
    if (onModeChange) onModeChange(next);
    else setInternalMode(next);
  };
  const [updating, setUpdating] = useState(false);
  // Which player row, if any, is currently expanded into a substitute
  // picker. ``null`` = no row expanded. The picker drops down below
  // the player row so the rest of the panel stays in place.
  const [subPickingFor, setSubPickingFor] = useState<string | null>(null);

  // Look up each player by id so we can resolve their school for the
  // accent dot. groups are optional — when missing we just skip the dot.
  const playerMap = useMemo(() => indexById(players ?? []), [players]);
  const groupIndex = useMemo(
    () => buildGroupIndex(groups ?? []),
    [groups],
  );

  // Calculate rest times for all players in the match
  const playerRestTimes = useMemo(() => {
    const restMap = new Map<string, { restSlots: number; restMinutes: number; lastMatchLabel?: string } | null>();
    if (!match || !schedule || !matchStates || !config || currentSlot === undefined) return restMap;

    const allPlayerIds = [...(match.sideA || []), ...(match.sideB || [])];
    for (const playerId of allPlayerIds) {
      const restTime = getPlayerRestTime(
        playerId,
        matchStates,
        matches,
        schedule,
        config,
        currentSlot,
        match.id
      );
      restMap.set(playerId, restTime);
    }
    return restMap;
  }, [match, matches, schedule, matchStates, config, currentSlot]);

  // Empty state
  if (!match || !assignment) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Click a match to see details
      </div>
    );
  }

  const status = matchState?.status || 'scheduled';
  const scheduledTime = slotToTime(assignment.slotId);
  const light = trafficLight?.status || 'green';

  // Get all player IDs for impact analysis
  const allPlayerIds = [...(match.sideA || []), ...(match.sideB || [])];

  // Display court (use actual if set)
  const actualCourtId = matchState?.actualCourtId;
  const displayCourtId = actualCourtId ?? assignment.courtId;
  const courtChanged = actualCourtId !== undefined && actualCourtId !== assignment.courtId;

  // School summary — `<dot> School A vs <dot> School B`. Resolves the
  // first player on each side; the dual-meet invariant guarantees one
  // school per side. Skipped silently if either side lacks a known group.
  const sideASchool = match.sideA?.[0]
    ? getPlayerSchoolAccent(playerMap.get(match.sideA[0]), groupIndex)
    : null;
  const sideBSchool = match.sideB?.[0]
    ? getPlayerSchoolAccent(playerMap.get(match.sideB[0]), groupIndex)
    : null;
  const showSchools = !!(sideASchool?.name && sideBSchool?.name);

  // ─── Lifecycle handlers ──────────────────────────────────────────
  // Mirror the WorkflowPanel handlers verbatim so the panel and the
  // workflow rows behave identically — anything that works in one
  // place works in the other. Each handler is a no-op when the
  // matching callback prop wasn't provided (read-only schedule view).
  const handleCall = async () => {
    if (!onUpdateStatus) return;
    setUpdating(true);
    try {
      await onUpdateStatus(match.id, 'called', { delayed: false });
    } finally {
      setUpdating(false);
    }
  };

  const handleStart = async () => {
    if (!onUpdateStatus) return;
    setUpdating(true);
    try {
      onCascadingStart?.(match.id, displayCourtId);
      await onUpdateStatus(match.id, 'started');
    } finally {
      setUpdating(false);
    }
  };

  const handlePostpone = async () => {
    if (!onUpdateStatus) return;
    setUpdating(true);
    try {
      const isPostponed = matchState?.postponed || false;
      await onUpdateStatus(match.id, 'scheduled', { postponed: !isPostponed });
    } finally {
      setUpdating(false);
    }
  };

  const handleResetCalled = async () => {
    if (!onUpdateStatus) return;
    setUpdating(true);
    try {
      onUndoStart?.(match.id);
      await onUpdateStatus(match.id, 'called', { actualStartTime: undefined });
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmPlayer = async (playerId: string) => {
    if (!onConfirmPlayer) return;
    const isCurrentlyConfirmed = matchState?.playerConfirmations?.[playerId] || false;
    setUpdating(true);
    try {
      await onConfirmPlayer(match.id, playerId, !isCurrentlyConfirmed);
    } finally {
      setUpdating(false);
    }
  };

  // Buttons fall back to a shared style — same chrome the Schedule
  // header uses so the panel feels like an extension of the page.
  const actionBtn =
    `${INTERACTIVE_BASE} inline-flex items-center justify-center gap-1 rounded border border-border ` +
    `bg-card px-2 py-1 text-[11px] font-medium text-card-foreground ` +
    `hover:bg-accent hover:text-accent-foreground ` +
    `disabled:cursor-not-allowed disabled:opacity-50`;
  const primaryActionBtn =
    `${INTERACTIVE_BASE} inline-flex items-center justify-center gap-1 rounded ` +
    `bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground ` +
    `hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50`;

  return (
    <div className="h-full overflow-auto p-2">
      {/* Header */}
      <div className="mb-3">
        <div className="text-sm font-bold text-foreground mb-0.5">
          {getMatchLabel(match)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          C{displayCourtId}{courtChanged && ` (sched: C${assignment.courtId})`} · {scheduledTime}
        </div>
        {showSchools && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-foreground">
            <SchoolDot accent={sideASchool!} size="sm" />
            <span className="truncate">{sideASchool!.name}</span>
            <span className="text-muted-foreground">vs</span>
            <SchoolDot accent={sideBSchool!} size="sm" />
            <span className="truncate">{sideBSchool!.name}</span>
          </div>
        )}
      </div>

      {/* Status badge */}
      {status === 'scheduled' && (
        <StatusPill tone={light} dot className="mb-3">{LIGHT_LABEL[light]}</StatusPill>
      )}
      {status === 'called' && <StatusPill tone="blue" className="mb-3">Called</StatusPill>}
      {status === 'started' && <StatusPill tone="green" className="mb-3">In Progress</StatusPill>}
      {status === 'finished' && (() => {
        const score = matchState?.score;
        const sets = matchState?.sets ?? [];
        const winner: 'A' | 'B' | null = score
          ? score.sideA > score.sideB
            ? 'A'
            : score.sideB > score.sideA
              ? 'B'
              : null
          : null;
        const winnerIds = winner === 'A' ? match.sideA : winner === 'B' ? match.sideB : [];
        const winnerNames = (winnerIds ?? []).map((id) => playerNames.get(id) ?? id).join(' & ');

        return (
          <div className="mb-3 rounded border border-border bg-card px-2 py-2 text-xs text-foreground">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Done
              </span>
              {onUpdateStatus && mode === 'idle' && (
                <button
                  type="button"
                  onClick={() => setMode('score')}
                  className={`${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/15`}
                  title="Edit score"
                  aria-label="Edit score"
                >
                  Edit score
                </button>
              )}
            </div>
            {winner && winnerNames ? (
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Winner
                  </span>{' '}
                  <span className="font-semibold text-blue-800 dark:text-blue-300">{winnerNames}</span>
                </span>
                {score && (
                  <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                    {score.sideA}–{score.sideB}
                    <span className="ml-1 text-[10px] font-medium text-muted-foreground">sets</span>
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-1 text-muted-foreground">Tied</div>
            )}
            {sets.length > 0 ? (
              <div className="mt-2 space-y-0.5">
                {sets.map((s, i) => {
                  const setWinner = s.sideA > s.sideB ? 'A' : s.sideB > s.sideA ? 'B' : null;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded bg-card px-1.5 py-0.5 font-mono text-[11px]"
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Set {i + 1}
                      </span>
                      <span className="tabular-nums">
                        <span
                          className={setWinner === 'A' ? 'font-bold text-foreground' : 'text-muted-foreground'}
                        >
                          {s.sideA}
                        </span>
                        <span className="mx-0.5 text-muted-foreground/70">–</span>
                        <span
                          className={setWinner === 'B' ? 'font-bold text-foreground' : 'text-muted-foreground'}
                        >
                          {s.sideB}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-1 text-[10px] text-muted-foreground">
                No per-set scores recorded — tap Edit to fill them in.
              </div>
            )}
          </div>
        );
      })()}

      {/* Reason for yellow/red */}
      {status === 'scheduled' && trafficLight?.reason && light !== 'green' && (
        <div className={`px-2 py-1.5 rounded text-[10px] mb-3 ${
          light === 'yellow'
            ? 'bg-yellow-50 border border-yellow-200 text-yellow-700 dark:bg-yellow-500/15 dark:border-yellow-500/40 dark:text-yellow-200'
            : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-500/15 dark:border-red-500/40 dark:text-red-200'
        }`}>
          {trafficLight.reason}
        </div>
      )}

      {/* Lifecycle actions — same Call/Start/Score/Roster surface that
          the WorkflowPanel rows expose, but text-only. Score and
          Roster editors render inline below this row instead of
          popping a modal — keeps every interaction in the rail. */}
      {onUpdateStatus && mode === 'idle' && (
        <div className="mb-3">
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Actions
          </div>
          <div className="flex flex-wrap gap-1">
            {status === 'scheduled' && (
              <>
                <button
                  type="button"
                  onClick={handleCall}
                  disabled={updating || light === 'red'}
                  className={primaryActionBtn}
                  title={light === 'red' ? trafficLight?.reason ?? 'Blocked' : 'Call match — players head to court'}
                >
                  Call
                </button>
                <button
                  type="button"
                  onClick={handlePostpone}
                  disabled={updating}
                  className={actionBtn}
                  title={matchState?.postponed ? 'Restore match' : 'Postpone match'}
                >
                  {matchState?.postponed ? 'Restore' : 'Postpone'}
                </button>
              </>
            )}
            {status === 'called' && (
              <>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={updating}
                  className={primaryActionBtn}
                  title="Start match — court is now in play"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => setMode('score')}
                  disabled={updating}
                  className={actionBtn}
                  title="Skip ahead — record final score"
                >
                  Score
                </button>
              </>
            )}
            {status === 'started' && (
              <>
                <button
                  type="button"
                  onClick={() => setMode('score')}
                  disabled={updating}
                  className={primaryActionBtn}
                  title="Record final score"
                >
                  Score
                </button>
                <button
                  type="button"
                  onClick={handleResetCalled}
                  disabled={updating}
                  className={actionBtn}
                  title="Step back to Called"
                >
                  Undo start
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Inline score editor — renders in place of the Actions row
          while ``mode === 'score'``. Format-aware: simple = two
          numbers, badminton = per-set rows with a per-match override
          for sets-to-win / points / deuce. */}
      {mode === 'score' && onUpdateStatus && (
        <ScoreEditor
          match={match}
          matchState={matchState}
          config={config ?? null}
          playerNames={playerNames}
          onSubmit={async ({ score, sets, notes }) => {
            setUpdating(true);
            try {
              await onUpdateStatus(match.id, 'finished', { score, sets, notes });
              setMode('idle');
            } finally {
              setUpdating(false);
            }
          }}
          onCancel={() => setMode('idle')}
          isSubmitting={updating}
        />
      )}


      {/* Players */}
      <div className="mb-3">
        <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Players
        </div>
        {(() => {
          const score = matchState?.score;
          const winner: 'A' | 'B' | null =
            status === 'finished' && score
              ? score.sideA > score.sideB
                ? 'A'
                : score.sideB > score.sideA
                  ? 'B'
                  : null
              : null;
          const sideClass = (side: 'A' | 'B') =>
            winner === side
              ? 'text-green-700 dark:text-green-300 font-semibold'
              : winner && winner !== side
                ? 'text-muted-foreground line-through decoration-1'
                : 'text-foreground';
          const showCheckIn = status === 'called' && !!onConfirmPlayer;
          // Substitute / remove are available on every row whenever
          // the parent wired the callbacks AND the match isn't yet
          // finished. No need for a separate edit mode.
          const canSub = !!onSubstitute && status !== 'finished';
          const canRemove = !!onRemovePlayer && status !== 'finished';
          const inMatchIds = new Set([...(match.sideA ?? []), ...(match.sideB ?? [])]);
          const subCandidates = (players ?? []).filter(
            (p) => !inMatchIds.has(p.id) && p.status !== 'withdrawn',
          );

          const renderRow = (playerId: string, side: 'A' | 'B', key: number) => {
            const name = playerNames.get(playerId) || playerId;
            const restInfo = playerRestTimes.get(playerId);
            const accent = getPlayerSchoolAccent(playerMap.get(playerId), groupIndex);
            const confirmed = matchState?.playerConfirmations?.[playerId] || false;
            const isPicking = subPickingFor === playerId;
            return (
              <div key={key} className="space-y-0.5">
                <div className="flex items-center justify-between gap-1">
                  <span className={`${sideClass(side)} inline-flex items-center gap-1.5 min-w-0`}>
                    {winner === side && (
                      <span className="rounded bg-blue-100 px-1 text-[9px] font-semibold uppercase tracking-wide text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
                        Won
                      </span>
                    )}
                    {accent.name && <SchoolDot accent={accent} size="sm" />}
                    <span className="truncate">{name}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    {showCheckIn && (
                      <button
                        type="button"
                        onClick={() => handleConfirmPlayer(playerId)}
                        disabled={updating}
                        title={confirmed ? 'Mark as not checked in' : 'Check in'}
                        aria-label={confirmed ? 'Mark as not checked in' : 'Check in'}
                        className={`inline-flex items-center justify-center rounded h-4 w-4 text-[10px] ${
                          confirmed
                            ? 'bg-green-600 text-white'
                            : 'border border-border bg-card text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {confirmed ? <Check aria-hidden="true" className="h-2.5 w-2.5" /> : null}
                      </button>
                    )}
                    {restInfo ? (
                      <span
                        className="text-[9px] text-foreground"
                        title={`Since ${restInfo.lastMatchLabel || 'last match'}`}
                      >
                        {restInfo.restMinutes >= 60
                          ? `${Math.floor(restInfo.restMinutes / 60)}h${
                              restInfo.restMinutes % 60 > 0 ? ` ${restInfo.restMinutes % 60}m` : ''
                            }`
                          : `${restInfo.restMinutes}m`}{' '}
                        rest
                      </span>
                    ) : (
                      <span className="text-[9px] text-muted-foreground">1st</span>
                    )}
                    {canSub && (
                      <button
                        type="button"
                        onClick={() => setSubPickingFor(isPicking ? null : playerId)}
                        className={`rounded border border-border bg-card px-1 text-[9px] font-medium ${
                          isPicking
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                        title="Substitute player"
                        aria-label={`Substitute ${name}`}
                        aria-expanded={isPicking}
                      >
                        Sub
                      </button>
                    )}
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => onRemovePlayer?.(match.id, playerId)}
                        className="rounded border border-red-300 bg-red-50 px-1 text-[9px] text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
                        title="Remove player from match"
                        aria-label={`Remove ${name}`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                </div>
                {isPicking && (
                  <div className="ml-3 max-h-32 overflow-y-auto rounded border border-border bg-card text-[11px]">
                    {subCandidates.length === 0 && (
                      <div className="px-1.5 py-1 text-[10px] text-muted-foreground">No available players.</div>
                    )}
                    {subCandidates.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSubstitute?.(match.id, playerId, p.id);
                          setSubPickingFor(null);
                        }}
                        className="block w-full truncate px-1.5 py-0.5 text-left text-foreground hover:bg-accent"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          };
          return (
            <div className="text-xs space-y-0.5">
              {(match.sideA || []).map((id, i) => renderRow(id, 'A', i))}
              <div className="text-[10px] text-muted-foreground">vs</div>
              {(match.sideB || []).map((id, i) => renderRow(id, 'B', i))}
            </div>
          );
        })()}
      </div>

      {/* Timing — shows every lifecycle stamp the match has accrued
          so the operator can audit waits vs. runs at a glance. */}
      {(matchState?.calledAt || matchState?.actualStartTime || matchState?.actualEndTime) && (
        <div className="mb-3">
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Timing
          </div>
          <div className="space-y-0.5 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Scheduled</span>
              <span className="tabular-nums text-foreground">{scheduledTime}</span>
            </div>
            {matchState?.calledAt && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">Called</span>
                <span className="tabular-nums text-foreground">
                  {formatIsoClock(matchState.calledAt)}
                  {matchState.actualStartTime ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      · waited {formatDuration(matchState.calledAt, matchState.actualStartTime)}
                    </span>
                  ) : (
                    <span className="ml-1 text-[10px] text-blue-600">
                      · {formatDuration(matchState.calledAt, new Date().toISOString())} ago
                    </span>
                  )}
                </span>
              </div>
            )}
            {matchState?.actualStartTime && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">Started</span>
                <span className="tabular-nums text-foreground">
                  {formatIsoClock(matchState.actualStartTime)}
                  {status === 'started' && (
                    <span className="ml-1 text-[10px] text-green-700">
                      · playing{' '}
                      <ElapsedTimer
                        startTime={matchState.actualStartTime}
                        className="tabular-nums"
                      />
                    </span>
                  )}
                </span>
              </div>
            )}
            {matchState?.actualEndTime && matchState?.actualStartTime && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">Finished</span>
                <span className="tabular-nums text-foreground">
                  {formatIsoClock(matchState.actualEndTime)}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    · ran {formatDuration(matchState.actualStartTime, matchState.actualEndTime)}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Impacted Matches — single-line per row to fit a long list
          in the rail. Each row is ``<event> · <shared player>``. */}
      {analysis && analysis.directlyImpacted.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Impacted ({analysis.directlyImpacted.length})
          </div>
          <div className="divide-y divide-border rounded border border-border bg-card">
            {analysis.directlyImpacted.map((matchId) => {
              const impactedMatch = matchMap.get(matchId);
              const currentPlayerIds = new Set(allPlayerIds);
              const impactedPlayerIds = [
                ...(impactedMatch?.sideA || []),
                ...(impactedMatch?.sideB || []),
              ];
              const sharedPlayerIds = impactedPlayerIds.filter((id) => currentPlayerIds.has(id));
              const sharedPlayerNames = sharedPlayerIds.map((id) => playerNames.get(id) || id);
              const eventLabel = impactedMatch?.eventRank || getMatchLabel(impactedMatch, matchId);

              return (
                <div
                  key={matchId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectMatch?.(matchId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectMatch?.(matchId);
                    }
                  }}
                  className="flex items-center gap-1.5 px-1.5 py-0.5 cursor-pointer hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={sharedPlayerNames.join(', ')}
                >
                  <span className="text-[11px] font-medium text-foreground tabular-nums w-12 flex-shrink-0">
                    {eventLabel}
                  </span>
                  <span className="flex-1 truncate text-[10px] text-muted-foreground">
                    {sharedPlayerNames.join(', ') || '—'}
                  </span>
                  <ChevronRight aria-hidden="true" className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reschedule + Disruption shortcuts — pre-fill the page-level
          dialogs with this match's id so the operator doesn't have to
          find it again. Move/postpone is the lighter, "match is just
          running late" path; the disruption row is the nuclear option. */}
      {(onRequestDisruption || onRequestMove) && match && status !== 'finished' && (
        <div className="px-3 py-2 border-t border-border/60 bg-muted/30 space-y-1.5">
          {onRequestMove && assignment && (
            <>
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Reschedule
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onRequestMove(match.id)}
                  className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-2xs text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
                  title="Postpone or move this match to another time/court"
                >
                  Move / postpone…
                </button>
              </div>
            </>
          )}
          {onRequestDisruption && (
            <>
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Disruption
              </div>
              <div className="flex flex-wrap gap-1.5">
                {status === 'started' && (
                  <button
                    type="button"
                    onClick={() => onRequestDisruption('overrun', match.id)}
                    className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-2xs text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                    title="Mark as overrunning — slide successors back"
                  >
                    Mark overrun
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRequestDisruption('cancellation', match.id)}
                  className="rounded border border-red-300 bg-red-50 px-2 py-0.5 text-2xs text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                  title="Cancel and free the slot for a later match"
                >
                  Cancel
                </button>
                {assignment && (
                  <button
                    type="button"
                    onClick={() => onRequestDisruption('court_closed', match.id)}
                    className="rounded border border-border bg-card px-2 py-0.5 text-2xs text-muted-foreground hover:bg-accent"
                    title={`Close court ${assignment.courtId} and re-route its matches`}
                  >
                    Close court {assignment.courtId}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

