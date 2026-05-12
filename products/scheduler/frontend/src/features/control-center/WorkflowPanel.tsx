/**
 * Workflow Panel - Per Wireframe Design (Tailwind CSS)
 * Left: In Progress (~320px) with elapsed timer
 * Center: Tabbed Up Next / Finished with colored left borders
 */
import { useState, useMemo } from 'react';
import { Check, CircleNotch } from '@phosphor-icons/react';
import type { ScheduleAssignment, MatchDTO, MatchStateDTO, TournamentConfig, PlayerDTO } from '../../api/dto';
import type { TrafficLightResult } from '../../utils/trafficLight';
import { formatSlotTime } from '../../lib/time';
import { getMatchLabel } from '../../utils/matchUtils';
import { ElapsedTimer } from '../../components/common/ElapsedTimer';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { InlineSearch } from '../../components/InlineSearch';
import { StatusPill } from '../../components/StatusPill';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { ACTION_BTN, LIGHT_STYLES, CALL_BTN_BG } from './workflowPanel/styles';

interface WorkflowPanelProps {
  matchesByStatus: {
    scheduled: ScheduleAssignment[];
    called: ScheduleAssignment[];
    started: ScheduleAssignment[];
    finished: ScheduleAssignment[];
  };
  matches: MatchDTO[];
  matchStates: Record<string, MatchStateDTO>;
  config: TournamentConfig | null;
  currentSlot: number;
  onUpdateStatus: (matchId: string, status: MatchStateDTO['status'], additionalData?: Partial<MatchStateDTO>) => Promise<void>;
  onConfirmPlayer?: (matchId: string, playerId: string, confirmed: boolean) => Promise<void>;
  selectedMatchId?: string | null;
  onSelectMatch?: (matchId: string) => void;
  trafficLights?: Map<string, TrafficLightResult>;
  playerNames: Map<string, string>;
  players?: PlayerDTO[];
  onSubstitute?: (matchId: string, oldPlayerId: string, newPlayerId: string) => void;
  onRemovePlayer?: (matchId: string, playerId: string) => void;
  onCascadingStart?: (matchId: string, courtId: number) => void;
  onUndoStart?: (matchId: string) => void;
  /** Request the side-rail score editor for a match. Selects the
   *  match and pops the panel into score-mode. */
  onRequestScore?: (matchId: string) => void;
}

// getMatchLabel and ElapsedTimer imported from shared utilities

// In Progress Card — Score button (pops the rail's score editor) +
// Undo button. The actual score entry lives in match details so the
// rail can show the per-set badminton form.
function InProgressCard({
  assignment,
  match,
  matchState,
  playerNames,
  isSelected,
  onSelect,
  onUpdateStatus,
  onUndoStart,
  onRequestScore,
}: {
  assignment: ScheduleAssignment;
  match: MatchDTO | undefined;
  matchState: MatchStateDTO | undefined;
  playerNames: Map<string, string>;
  isSelected: boolean;
  onSelect: () => void;
  onUpdateStatus: (matchId: string, status: MatchStateDTO['status'], data?: Partial<MatchStateDTO>) => Promise<void>;
  onUndoStart?: (matchId: string) => void;
  onRequestScore?: (matchId: string) => void;
}) {
  const [updating, setUpdating] = useState(false);

  if (!match) return null;

  const sideANames = (match.sideA || []).map((id) => playerNames.get(id) || id).join(' & ');
  const sideBNames = (match.sideB || []).map((id) => playerNames.get(id) || id).join(' & ');

  // Use actual court if set, otherwise scheduled
  const displayCourtId = matchState?.actualCourtId ?? assignment.courtId;

  const handleUndo = async () => {
    setUpdating(true);
    try {
      // Use onUndoStart to restore original position if available
      if (onUndoStart) {
        onUndoStart(assignment.matchId);
      }
      await onUpdateStatus(assignment.matchId, 'called', { actualStartTime: undefined });
    } finally {
      setUpdating(false);
    }
  };

  // Check if match was moved from original position
  const wasMoved = matchState?.originalSlotId !== undefined || matchState?.originalCourtId !== undefined;

  return (
    <div
      onClick={onSelect}
      style={{ gridTemplateColumns: 'auto auto auto 1fr auto' }}
      className={[
        'grid cursor-pointer items-center gap-2 border-l-2 px-2 py-1 text-xs transition-colors',
        isSelected
          ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-500/15'
          : 'border-l-green-500 bg-green-50/60 hover:bg-green-50 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15',
      ].join(' ')}
    >
      <span className="font-semibold text-foreground tabular-nums">{getMatchLabel(match)}</span>
      <span className="text-[11px] text-muted-foreground">C{displayCourtId}</span>
      <span className="tabular-nums text-[11px] text-muted-foreground">
        <ElapsedTimer startTime={matchState?.actualStartTime} />
      </span>
      <span className="truncate text-foreground" title={`${sideANames} vs ${sideBNames}`}>
        {sideANames} <span className="text-muted-foreground">vs</span> {sideBNames}
        {wasMoved && (
          <span className="ml-1 text-[10px] text-orange-500 dark:text-orange-300">(moved)</span>
        )}
      </span>
      <div className="flex gap-1">
        {onRequestScore && (
          <button
            onClick={(e) => { e.stopPropagation(); onRequestScore(assignment.matchId); }}
            disabled={updating}
            className={`${ACTION_BTN} bg-blue-600 text-white hover:bg-blue-700 !px-2 !py-0.5 !text-[11px]`}
            title="Enter score — opens score editor in the rail"
            aria-label="Enter score"
          >
            Score
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); handleUndo(); }}
          disabled={updating}
          className={`${ACTION_BTN} bg-muted text-foreground hover:bg-muted/80 !px-2 !py-0.5 !text-[11px]`}
          title="Undo to called"
          aria-label="Undo started match"
        >
          {updating && <CircleNotch aria-hidden="true" className="h-3 w-3 animate-spin" />}
          Undo
        </button>
      </div>
    </div>
  );
}

// Up Next Card — left border + inline status tag + quick lifecycle
// buttons. Scheduled rows: Call / Postpone. Called rows: Start /
// Undo, plus an inline player check-in strip when any player is
// still un-confirmed. Score entry and roster edit live in the rail.
function UpNextCard({
  assignment,
  match,
  matchState,
  playerNames,
  playerDelayCounts,
  trafficLight,
  isSelected,
  isCalled,
  config,
  currentSlot,
  onSelect,
  onUpdateStatus,
  onConfirmPlayer,
  onCascadingStart,
}: {
  assignment: ScheduleAssignment;
  match: MatchDTO | undefined;
  matchState: MatchStateDTO | undefined;
  playerNames: Map<string, string>;
  playerDelayCounts: Map<string, number>;
  trafficLight?: TrafficLightResult;
  isSelected: boolean;
  isCalled: boolean;
  config: TournamentConfig | null;
  currentSlot: number;
  onSelect: () => void;
  onUpdateStatus: (matchId: string, status: MatchStateDTO['status'], data?: Partial<MatchStateDTO>) => Promise<void>;
  onConfirmPlayer?: (matchId: string, playerId: string, confirmed: boolean) => Promise<void>;
  onCascadingStart?: (matchId: string, courtId: number) => void;
}) {
  const [updating, setUpdating] = useState(false);

  if (!match) return null;

  const formatPlayerWithBadge = (playerId: string) => {
    const name = playerNames.get(playerId) || playerId;
    const delayCount = playerDelayCounts.get(playerId) || 0;
    return { id: playerId, name, delayCount };
  };

  const sideAPlayers = (match.sideA || []).map(formatPlayerWithBadge);
  const sideBPlayers = (match.sideB || []).map(formatPlayerWithBadge);
  const sideANames = sideAPlayers.map(p => p.name).join(' & ');
  const sideBNames = sideBPlayers.map(p => p.name).join(' & ');
  const hasDelayedPlayers = [...sideAPlayers, ...sideBPlayers].some(p => p.delayCount > 0);
  const scheduledTime = config ? formatSlotTime(assignment.slotId, config) : '??:??';
  const isLate = currentSlot > assignment.slotId && !isCalled;

  const light = trafficLight?.status || 'green';
  const lightStyles = LIGHT_STYLES[light];

  // Per-player confirmation state — only relevant once the match is
  // Called. Used both by the inline check-in strip and the Start
  // gating below it.
  const allPlayerIds = [...(match.sideA || []), ...(match.sideB || [])];
  const confirmations = matchState?.playerConfirmations || {};
  const missingPlayers = allPlayerIds.filter(id => !confirmations[id]);

  // Quick lifecycle handlers. The card owns the high-frequency
  // actions (Call / Start / Postpone / Undo / per-player check-in);
  // Score and Roster edit live in the rail.
  const handleCall = async () => {
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, 'called', { delayed: false });
    } finally {
      setUpdating(false);
    }
  };

  const handleStart = async () => {
    setUpdating(true);
    try {
      // Use the assignment's scheduled court — court override goes
      // through the rail (cascading + court dialog still live there).
      onCascadingStart?.(assignment.matchId, assignment.courtId);
      await onUpdateStatus(assignment.matchId, 'started');
    } finally {
      setUpdating(false);
    }
  };

  const handlePostpone = async () => {
    setUpdating(true);
    try {
      const isPostponed = matchState?.postponed || false;
      await onUpdateStatus(assignment.matchId, 'scheduled', { postponed: !isPostponed });
    } finally {
      setUpdating(false);
    }
  };

  const handleUndoCalled = async () => {
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, 'scheduled', { delayed: false });
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmPlayer = async (playerId: string) => {
    if (!onConfirmPlayer) return;
    setUpdating(true);
    try {
      const isCurrentlyConfirmed = confirmations[playerId] || false;
      await onConfirmPlayer(assignment.matchId, playerId, !isCurrentlyConfirmed);
    } finally {
      setUpdating(false);
    }
  };

  const handleCheckInAll = async () => {
    if (!onConfirmPlayer) return;
    setUpdating(true);
    try {
      await Promise.all(
        missingPlayers.map((id) => onConfirmPlayer(assignment.matchId, id, true)),
      );
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <div
        onClick={onSelect}
        // Columns: dot · event · C·time · players (grows) · status · actions.
        // Inline style is used rather than a Tailwind arbitrary class to
        // avoid an edge case where the JIT dropped the arbitrary value.
        style={{ gridTemplateColumns: 'auto auto auto 1fr auto auto' }}
        className={[
          'grid cursor-pointer items-center gap-2 border-l-2 px-2 py-1 text-xs transition-colors',
          lightStyles.border,
          isSelected ? 'bg-blue-50 dark:bg-blue-500/15' : `${lightStyles.bg} hover:brightness-[0.98]`,
        ].join(' ')}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${lightStyles.dot}`} />
        <span className="font-semibold text-foreground tabular-nums">{getMatchLabel(match)}</span>
        <span className="tabular-nums text-[11px] text-muted-foreground">C{assignment.courtId} · {scheduledTime}</span>
        {/* Player names cell.
              On Called rows each name IS the check-in toggle. Otherwise
              we render plain text with optional delay badges. The
              ``renderSide`` helper takes either side and emits a list
              of ``<PlayerName>`` nodes joined by ``&``. */}
        <span
          className="truncate text-foreground inline-flex flex-wrap items-center gap-x-1 gap-y-0.5"
          title={`${sideANames} vs ${sideBNames}`}
        >
          {(() => {
            if (isCalled && onConfirmPlayer) {
              const renderPill = (p: { id: string; name: string }, i: number) => {
                const confirmed = confirmations[p.id] || false;
                return (
                  <span key={p.id} className="inline-flex items-center">
                    {i > 0 && <span className="mx-0.5 text-muted-foreground">&</span>}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleConfirmPlayer(p.id); }}
                      disabled={updating}
                      aria-pressed={confirmed}
                      className={[
                        INTERACTIVE_BASE,
                        'inline-flex items-center gap-0.5 rounded border px-1.5 py-0 text-[11px] font-medium',
                        confirmed
                          ? 'border-green-300 bg-green-100 text-green-700 hover:bg-green-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25'
                          : 'border-border bg-card text-foreground hover:bg-muted',
                      ].join(' ')}
                      title={confirmed ? `${p.name} checked in` : `Click to check in ${p.name}`}
                    >
                      {confirmed && <Check aria-hidden="true" className="h-3 w-3" />}
                      {p.name}
                    </button>
                  </span>
                );
              };
              return (
                <>
                  {sideAPlayers.map(renderPill)}
                  <span className="mx-1 text-muted-foreground">vs</span>
                  {sideBPlayers.map(renderPill)}
                  {missingPlayers.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleCheckInAll(); }}
                      disabled={updating}
                      className={`${INTERACTIVE_BASE} inline-flex items-center gap-0.5 rounded bg-blue-600 px-1.5 py-0 text-[10px] font-medium text-white hover:bg-blue-700`}
                      title={`Check in all ${missingPlayers.length} remaining`}
                      aria-label="Check in all"
                    >
                      <Check aria-hidden="true" className="h-3 w-3" />
                      All in
                    </button>
                  )}
                </>
              );
            }
            if (hasDelayedPlayers) {
              const renderName = (p: { id: string; name: string; delayCount: number }, i: number) => (
                <span key={p.id}>
                  {i > 0 && <span className="mx-0.5 text-muted-foreground">&</span>}
                  {p.name}
                  {p.delayCount > 0 && (
                    <span
                      className="ml-0.5 rounded bg-yellow-100 px-1 text-[9px] font-medium text-yellow-700 dark:bg-amber-500/15 dark:text-amber-200"
                      title={`${p.delayCount} delay(s)`}
                    >
                      {p.delayCount}
                    </span>
                  )}
                </span>
              );
              return (
                <>
                  {sideAPlayers.map(renderName)}
                  <span className="mx-1 text-muted-foreground">vs</span>
                  {sideBPlayers.map(renderName)}
                </>
              );
            }
            return (
              <>{sideANames} <span className="text-muted-foreground">vs</span> {sideBNames}</>
            );
          })()}
        </span>
        <span className="flex items-center gap-1 whitespace-nowrap text-[10px]">
          {isCalled && matchState?.calledAt && (
            <StatusPill
              tone="blue"
              title={`Called at ${new Date(matchState.calledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            >
              waiting{' '}
              <ElapsedTimer startTime={matchState.calledAt} className="tabular-nums" />
            </StatusPill>
          )}
          {matchState?.postponed && <StatusPill tone="amber">postponed</StatusPill>}
          {isLate && !matchState?.postponed && <StatusPill tone="yellow">late</StatusPill>}
          {trafficLight?.reason && light !== 'green' && (
            <StatusPill tone={light} className="max-w-[180px] truncate" title={trafficLight.reason}>
              {trafficLight.reason}
            </StatusPill>
          )}
        </span>
        {/* Quick lifecycle actions. Scheduled rows: Call / Postpone.
            Called rows: Start / Undo. Score and Roster live in the
            rail; the row stays high-frequency-only. */}
        <div className="flex gap-1">
          {!isCalled && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleCall(); }}
                disabled={updating || light === 'red'}
                className={`${ACTION_BTN} !px-2 !py-0.5 !text-[11px] ${CALL_BTN_BG[light]}`}
                title={
                  light === 'green'
                    ? 'Call match'
                    : `${light === 'yellow' ? 'Call anyway — ' : ''}${trafficLight?.reason ?? (light === 'red' ? 'Blocked' : 'player still resting')}`
                }
                aria-label="Call match"
              >
                {updating && <CircleNotch aria-hidden="true" className="h-3 w-3 animate-spin" />}
                Call
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handlePostpone(); }}
                disabled={updating}
                className={[
                  ACTION_BTN,
                  '!px-2 !py-0.5 !text-[11px]',
                  matchState?.postponed
                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-500/15 dark:text-orange-200 dark:hover:bg-orange-500/25'
                    : 'bg-muted text-foreground hover:bg-muted/80',
                ].join(' ')}
                aria-pressed={Boolean(matchState?.postponed)}
                title={matchState?.postponed ? 'Restore match' : 'Postpone match'}
              >
                {matchState?.postponed ? 'Restore' : 'Post'}
              </button>
            </>
          )}
          {isCalled && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleStart(); }}
                disabled={updating}
                className={`${ACTION_BTN} bg-green-600 text-white hover:bg-green-700 !px-2 !py-0.5 !text-[11px]`}
                title={
                  missingPlayers.length > 0
                    ? `Start — ${missingPlayers.length} player(s) not yet checked in`
                    : 'Start match'
                }
                aria-label="Start match"
              >
                {updating && <CircleNotch aria-hidden="true" className="h-3 w-3 animate-spin" />}
                Start
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleUndoCalled(); }}
                disabled={updating}
                className={`${ACTION_BTN} bg-muted text-foreground hover:bg-muted/80 !px-2 !py-0.5 !text-[11px]`}
                title="Undo to scheduled"
                aria-label="Undo call"
              >
                Undo
              </button>
            </>
          )}
        </div>
      </div>

    </>
  );
}

// Finished Card with Undo
function FinishedCard({
  assignment,
  match,
  matchState,
  playerNames,
  isSelected,
  onSelect,
  onUpdateStatus,
}: {
  assignment: ScheduleAssignment;
  match: MatchDTO | undefined;
  matchState: MatchStateDTO | undefined;
  playerNames: Map<string, string>;
  isSelected: boolean;
  onSelect: () => void;
  onUpdateStatus: (matchId: string, status: MatchStateDTO['status'], data?: Partial<MatchStateDTO>) => Promise<void>;
}) {
  const [updating, setUpdating] = useState(false);
  if (!match) return null;

  const sideANames = (match.sideA || []).map((id) => playerNames.get(id) || id).join(' & ');
  const sideBNames = (match.sideB || []).map((id) => playerNames.get(id) || id).join(' & ');
  const score = matchState?.score;

  const handleUndo = async () => {
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, 'started', {
        actualEndTime: undefined,
        score: undefined,
        sets: undefined,
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      onClick={onSelect}
      style={{ gridTemplateColumns: 'auto auto 1fr auto auto' }}
      className={[
        'grid cursor-pointer items-center gap-2 border-l-2 px-2 py-1 text-xs transition-colors',
        isSelected
          ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-500/15'
          : 'border-l-border bg-muted/40 hover:bg-muted/60',
      ].join(' ')}
    >
      <span className="font-semibold text-muted-foreground tabular-nums">{getMatchLabel(match)}</span>
      <span className="tabular-nums text-[11px] text-muted-foreground">C{assignment.courtId}</span>
      <span className="truncate text-muted-foreground" title={`${sideANames} vs ${sideBNames}`}>
        {sideANames} <span className="text-muted-foreground">vs</span> {sideBNames}
      </span>
      {score ? (
        <span className="font-mono text-xs font-semibold tabular-nums text-blue-700 dark:text-blue-300">
          {score.sideA}–{score.sideB}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground">no score</span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); handleUndo(); }}
        disabled={updating}
        className={`${ACTION_BTN} bg-muted text-foreground hover:bg-muted/80 !px-2 !py-0.5 !text-[11px]`}
        title="Undo finish — back to in progress"
        aria-label="Undo finish"
      >
        {updating && <CircleNotch aria-hidden="true" className="h-3 w-3 animate-spin" />}
        Undo
      </button>
    </div>
  );
}

export function WorkflowPanel({
  matchesByStatus,
  matches,
  matchStates,
  config,
  currentSlot,
  onUpdateStatus,
  onConfirmPlayer,
  selectedMatchId,
  onSelectMatch,
  trafficLights,
  playerNames,
  onCascadingStart,
  onUndoStart,
  onRequestScore,
}: WorkflowPanelProps) {
  const [activeTab, setActiveTab] = useState<'up_next' | 'finished'>('up_next');

  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const calledIds = useMemo(() => new Set(matchesByStatus.called.map((a) => a.matchId)), [matchesByStatus.called]);

  // Compute player delay counts from all match states
  const playerDelayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    Object.values(matchStates).forEach(state => {
      if (state.delayedPlayerId) {
        const current = counts.get(state.delayedPlayerId) || 0;
        counts.set(state.delayedPlayerId, current + 1);
      }
    });
    return counts;
  }, [matchStates]);

  // Sort Up Next by: 1) called first, 2) time slot, 3) court number
  const upNextSorted = useMemo(() => {
    return [...matchesByStatus.called, ...matchesByStatus.scheduled].sort((a, b) => {
      // Called matches first
      const aIsCalled = calledIds.has(a.matchId);
      const bIsCalled = calledIds.has(b.matchId);
      if (aIsCalled && !bIsCalled) return -1;
      if (!aIsCalled && bIsCalled) return 1;

      // Sort by time slot
      if (a.slotId !== b.slotId) return a.slotId - b.slotId;

      // Then by court number
      return a.courtId - b.courtId;
    });
  }, [matchesByStatus.called, matchesByStatus.scheduled, calledIds]);

  const finishedSorted = useMemo(() => {
    return [...matchesByStatus.finished].sort((a, b) => b.slotId - a.slotId);
  }, [matchesByStatus.finished]);

  const startedSorted = useMemo(() => {
    return [...matchesByStatus.started].sort((a, b) => a.slotId - b.slotId);
  }, [matchesByStatus.started]);

  // Free-text search across event code + player names. Applies to
  // every list in the panel (In Progress strip + Up Next/Finished
  // tabs) so the operator can sweep one player through their whole
  // state machine without losing them as the card moves.
  const [searchQuery, setSearchQuery] = useSearchParamState('q', '');
  const filterByQuery = (list: ScheduleAssignment[]) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter((a) => {
      const m = matchMap.get(a.matchId);
      if (!m) return false;
      if ((m.eventRank ?? '').toLowerCase().includes(q)) return true;
      const allIds = [...m.sideA, ...m.sideB, ...(m.sideC ?? [])];
      return allIds.some((id) => (playerNames.get(id) ?? '').toLowerCase().includes(q));
    });
  };
  const startedFiltered = filterByQuery(startedSorted);
  const upNextFiltered = filterByQuery(upNextSorted);
  const finishedFiltered = filterByQuery(finishedSorted);

  // Single-column stack:
  //   1. In-Progress pinned strip at top (collapses entirely when no active matches)
  //   2. Tabbed Up Next / Finished below, filling remaining height
  // Mirrors the Schedule page's vertical rhythm. 3-column layout retired.
  const hasActive = startedFiltered.length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      {/* Inline search bar — filters In Progress + Up Next + Finished
          simultaneously by event code or player name. */}
      <div className="flex-shrink-0 border-b border-border/60 px-2 py-1.5">
        <InlineSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Search event or player…"
          showClear
          onClearAll={() => setSearchQuery('')}
        />
      </div>
      {hasActive && (
        <div className="flex-shrink-0 border-b border-border/60">
          <div className="px-2 py-1.5 flex items-center justify-between border-b border-border/60">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">In Progress</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{matchesByStatus.started.length} active</span>
          </div>
          <div className="p-1.5 max-h-44 overflow-auto">
            {startedFiltered.map((assignment) => (
              <InProgressCard
                key={assignment.matchId}
                assignment={assignment}
                match={matchMap.get(assignment.matchId)}
                matchState={matchStates[assignment.matchId]}
                playerNames={playerNames}
                isSelected={selectedMatchId === assignment.matchId}
                onSelect={() => onSelectMatch?.(assignment.matchId)}
                onUpdateStatus={onUpdateStatus}
                onUndoStart={onUndoStart}
                onRequestScore={onRequestScore}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabbed Up Next / Finished */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-border/60 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('up_next')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                activeTab === 'up_next'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              Up Next ({upNextFiltered.length}{searchQuery ? `/${upNextSorted.length}` : ''})
            </button>
            <button
              onClick={() => setActiveTab('finished')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                activeTab === 'finished'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              Finished ({finishedFiltered.length}{searchQuery ? `/${finishedSorted.length}` : ''})
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {activeTab === 'up_next' && (
            upNextFiltered.length === 0 ? (
              <div className="text-center text-muted-foreground text-[10px] py-4">
                {searchQuery && upNextSorted.length > 0 ? 'No match for current search' : 'No matches pending'}
              </div>
            ) : (
              upNextFiltered.map((assignment) => (
                <UpNextCard
                  key={assignment.matchId}
                  assignment={assignment}
                  match={matchMap.get(assignment.matchId)}
                  matchState={matchStates[assignment.matchId]}
                  playerNames={playerNames}
                  playerDelayCounts={playerDelayCounts}
                  trafficLight={trafficLights?.get(assignment.matchId)}
                  isSelected={selectedMatchId === assignment.matchId}
                  isCalled={calledIds.has(assignment.matchId)}
                  config={config}
                  currentSlot={currentSlot}
                  onSelect={() => onSelectMatch?.(assignment.matchId)}
                  onUpdateStatus={onUpdateStatus}
                  onConfirmPlayer={onConfirmPlayer}
                  onCascadingStart={onCascadingStart}
                />
              ))
            )
          )}
          {activeTab === 'finished' && (
            finishedFiltered.length === 0 ? (
              <div className="text-center text-muted-foreground text-xs py-4">
                {searchQuery && finishedSorted.length > 0 ? 'No match for current search' : 'No completed matches'}
              </div>
            ) : (
              finishedFiltered.map((assignment) => (
                <FinishedCard
                  key={assignment.matchId}
                  assignment={assignment}
                  match={matchMap.get(assignment.matchId)}
                  matchState={matchStates[assignment.matchId]}
                  playerNames={playerNames}
                  isSelected={selectedMatchId === assignment.matchId}
                  onSelect={() => onSelectMatch?.(assignment.matchId)}
                  onUpdateStatus={onUpdateStatus}
                />
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}
