/**
 * Workflow Panel - Per Wireframe Design (Tailwind CSS)
 * Left: In Progress (~320px) with elapsed timer
 * Center: Tabbed Up Next / Finished with colored left borders
 */
import { useState, useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { ScheduleAssignment, MatchDTO, MatchStateDTO, TournamentConfig, SetScore, PlayerDTO } from '../../api/dto';
import type { TrafficLightResult } from '../../utils/trafficLight';
import { formatSlotTime } from '../../utils/timeUtils';
import { getMatchLabel } from '../../utils/matchUtils';
import { ElapsedTimer } from '../../components/common/ElapsedTimer';
import { MatchScoreDialog } from '../tracking/MatchScoreDialog';
import { BadmintonScoreDialog } from '../tracking/BadmintonScoreDialog';
import { EditMatchDialog } from './EditMatchDialog';
import { CourtSelectDialog } from './CourtSelectDialog';
import { INTERACTIVE_BASE } from '../../lib/utils';

// Shared button base used by every action pill on the match card:
// transition + focus-visible ring + active scale + disabled not-allowed.
// Kept terse so it composes cleanly with each action's colour classes.
const ACTION_BTN = `${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium`;

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
  players: PlayerDTO[];
  onSubstitute?: (matchId: string, oldPlayerId: string, newPlayerId: string) => void;
  onRemovePlayer?: (matchId: string, playerId: string) => void;
  onCascadingStart?: (matchId: string, courtId: number) => void;
  onUndoStart?: (matchId: string) => void;
}

// getMatchLabel and ElapsedTimer imported from shared utilities

// In Progress Card with Score Dialog
function InProgressCard({
  assignment,
  match,
  matchState,
  playerNames,
  config,
  isSelected,
  onSelect,
  onUpdateStatus,
  onUndoStart,
}: {
  assignment: ScheduleAssignment;
  match: MatchDTO | undefined;
  matchState: MatchStateDTO | undefined;
  playerNames: Map<string, string>;
  config: TournamentConfig | null;
  isSelected: boolean;
  onSelect: () => void;
  onUpdateStatus: (matchId: string, status: MatchStateDTO['status'], data?: Partial<MatchStateDTO>) => Promise<void>;
  onUndoStart?: (matchId: string) => void;
}) {
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const [updating, setUpdating] = useState(false);

  if (!match) return null;

  const sideANames = (match.sideA || []).map((id) => playerNames.get(id) || id).join(' & ');
  const sideBNames = (match.sideB || []).map((id) => playerNames.get(id) || id).join(' & ');

  // Use actual court if set, otherwise scheduled
  const displayCourtId = matchState?.actualCourtId ?? assignment.courtId;

  // Scoring format from config
  const useBadmintonScoring = config?.scoringFormat === 'badminton';
  const setsToWin = config?.setsToWin ?? 2;
  const pointsPerSet = config?.pointsPerSet ?? 21;
  const deuceEnabled = config?.deuceEnabled ?? true;

  const handleSimpleScoreSubmit = async (score: { sideA: number; sideB: number }, notes: string) => {
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, 'finished', { score, notes });
      setShowScoreDialog(false);
    } finally {
      setUpdating(false);
    }
  };

  const handleBadmintonScoreSubmit = async (sets: SetScore[], _winner: 'A' | 'B', notes: string) => {
    setUpdating(true);
    try {
      const setsWonA = sets.filter(s => s.sideA > s.sideB).length;
      const setsWonB = sets.filter(s => s.sideB > s.sideA).length;
      await onUpdateStatus(assignment.matchId, 'finished', {
        sets,
        score: { sideA: setsWonA, sideB: setsWonB },
        notes,
      });
      setShowScoreDialog(false);
    } finally {
      setUpdating(false);
    }
  };

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
    <>
      <div
        onClick={onSelect}
        style={{ gridTemplateColumns: 'auto auto auto 1fr auto auto' }}
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
        <button
          onClick={(e) => { e.stopPropagation(); setShowScoreDialog(true); }}
          disabled={updating}
          className={`${ACTION_BTN} bg-blue-600 text-white hover:bg-blue-700 !px-2 !py-0.5 !text-[11px]`}
          aria-label="Finish match and enter score"
        >
          {updating && <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />}
          Finish
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleUndo(); }}
          disabled={updating}
          className={`${ACTION_BTN} bg-muted text-foreground hover:bg-muted/80 !px-2 !py-0.5 !text-[11px]`}
          title={wasMoved ? 'Undo and restore to original position' : 'Undo to called status'}
          aria-label="Undo match state"
        >
          Undo
        </button>
      </div>

      {showScoreDialog && (
        useBadmintonScoring ? (
          <BadmintonScoreDialog
            matchName={getMatchLabel(match)}
            sideAName={sideANames}
            sideBName={sideBNames}
            setsToWin={setsToWin}
            pointsPerSet={pointsPerSet}
            deuceEnabled={deuceEnabled}
            onSubmit={handleBadmintonScoreSubmit}
            onCancel={() => setShowScoreDialog(false)}
            isSubmitting={updating}
          />
        ) : (
          <MatchScoreDialog
            matchName={getMatchLabel(match)}
            sideAName={sideANames}
            sideBName={sideBNames}
            onSubmit={handleSimpleScoreSubmit}
            onCancel={() => setShowScoreDialog(false)}
            isSubmitting={updating}
          />
        )
      )}
    </>
  );
}

// Up Next Card with colored left border and inline tooltip
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
  players,
  onSubstitute,
  onRemovePlayer,
  occupiedCourts,
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
  players: PlayerDTO[];
  onSubstitute?: (matchId: string, oldPlayerId: string, newPlayerId: string) => void;
  onRemovePlayer?: (matchId: string, playerId: string) => void;
  occupiedCourts: number[];
  onCascadingStart?: (matchId: string, courtId: number) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCourtDialog, setShowCourtDialog] = useState(false);
  const [showScoreDialog, setShowScoreDialog] = useState(false);

  if (!match) return null;

  // Format players for the edit dialog
  const sideAPlayersForEdit = (match.sideA || []).map(id => ({
    id,
    name: playerNames.get(id) || id,
    side: 'A' as const,
  }));
  const sideBPlayersForEdit = (match.sideB || []).map(id => ({
    id,
    name: playerNames.get(id) || id,
    side: 'B' as const,
  }));

  // Format player names with delay badges
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

  // Player confirmation tracking for called matches
  const allPlayerIds = [...(match.sideA || []), ...(match.sideB || [])];
  const confirmations = matchState?.playerConfirmations || {};
  const confirmedCount = allPlayerIds.filter(id => confirmations[id]).length;
  const allPlayersConfirmed = confirmedCount === allPlayerIds.length;
  const missingPlayers = allPlayerIds.filter(id => !confirmations[id]);

  // Border and background colors based on traffic light
  const borderColorClass = light === 'green'
    ? 'border-l-green-500'
    : light === 'yellow'
      ? 'border-l-yellow-400'
      : 'border-l-red-500';

  const bgColorClass = light === 'green'
    ? 'bg-card'
    : light === 'yellow'
      ? 'bg-yellow-50 dark:bg-yellow-500/10'
      : 'bg-red-50 dark:bg-red-500/10';

  const dotColorClass = light === 'green'
    ? 'bg-green-500'
    : light === 'yellow'
      ? 'bg-yellow-500'
      : 'bg-red-500';

  const handleCall = async () => {
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, 'called', { delayed: false });
    } finally {
      setUpdating(false);
    }
  };

  const handleStart = async (courtId: number) => {
    setUpdating(true);
    try {
      // Handle cascading shifts for conflicting matches
      // This also moves the starting match to the target court and correct slot
      onCascadingStart?.(assignment.matchId, courtId);

      // Start the match (court/slot already updated by cascading logic)
      await onUpdateStatus(assignment.matchId, 'started');
      setShowCourtDialog(false);
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
        allPlayerIds
          .filter((id) => !confirmations[id])
          .map((id) => onConfirmPlayer(assignment.matchId, id, true)),
      );
    } finally {
      setUpdating(false);
    }
  };

  const handlePostpone = async () => {
    setUpdating(true);
    try {
      const isPostponed = matchState?.postponed || false;
      await onUpdateStatus(assignment.matchId, 'scheduled', {
        postponed: !isPostponed,
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleUndo = async () => {
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, 'scheduled', { delayed: false });
    } finally {
      setUpdating(false);
    }
  };

  // Scoring config, mirrors InProgressCard so the dialog behaves the same
  // whether the match came from called-shortcut or the normal Start / Finish flow.
  const useBadmintonScoring = config?.scoringFormat === 'badminton';
  const setsToWin = config?.setsToWin ?? 2;
  const pointsPerSet = config?.pointsPerSet ?? 21;
  const deuceEnabled = config?.deuceEnabled ?? true;

  const handleSimpleScoreSubmit = async (
    score: { sideA: number; sideB: number },
    notes: string,
  ) => {
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, 'finished', { score, notes });
      setShowScoreDialog(false);
    } finally {
      setUpdating(false);
    }
  };

  const handleBadmintonScoreSubmit = async (
    sets: SetScore[],
    _winner: 'A' | 'B',
    notes: string,
  ) => {
    setUpdating(true);
    try {
      const setsWonA = sets.filter((s) => s.sideA > s.sideB).length;
      const setsWonB = sets.filter((s) => s.sideB > s.sideA).length;
      await onUpdateStatus(assignment.matchId, 'finished', {
        sets,
        score: { sideA: setsWonA, sideB: setsWonB },
        notes,
      });
      setShowScoreDialog(false);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <div
        onClick={onSelect}
        // Columns: dot · event · C·time · players (grows) · status tag · actions.
        // Inline style is used rather than a Tailwind arbitrary class to
        // avoid an edge case where the JIT dropped the arbitrary value.
        style={{ gridTemplateColumns: 'auto auto auto 1fr auto auto' }}
        className={[
          'grid cursor-pointer items-center gap-2 border-l-2 px-2 py-1 text-xs transition-colors',
          borderColorClass,
          isSelected ? 'bg-blue-50 dark:bg-blue-500/15' : `${bgColorClass} hover:brightness-[0.98]`,
        ].join(' ')}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotColorClass}`} />
        <span className="font-semibold text-foreground tabular-nums">{getMatchLabel(match)}</span>
        <span className="tabular-nums text-[11px] text-muted-foreground">C{assignment.courtId} · {scheduledTime}</span>
        <span className="truncate text-foreground" title={`${sideANames} vs ${sideBNames}`}>
          {hasDelayedPlayers ? (
            <>
              {sideAPlayers.map((p, i) => (
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
              ))}
              <span className="mx-1 text-muted-foreground">vs</span>
              {sideBPlayers.map((p, i) => (
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
              ))}
            </>
          ) : (
            <>
              {sideANames} <span className="text-muted-foreground">vs</span> {sideBNames}
            </>
          )}
        </span>
        <span className="flex items-center gap-1 whitespace-nowrap text-[10px]">
          {isCalled && matchState?.calledAt && (
            <span
              className="rounded bg-blue-100 px-1 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
              title={`Called at ${new Date(matchState.calledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            >
              waiting{' '}
              <ElapsedTimer startTime={matchState.calledAt} className="tabular-nums" />
            </span>
          )}
          {matchState?.postponed && (
            <span className="rounded bg-orange-100 px-1 font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-200">postponed</span>
          )}
          {isLate && !matchState?.postponed && (
            <span className="rounded bg-yellow-100 px-1 font-medium text-yellow-700 dark:bg-amber-500/15 dark:text-amber-200">late</span>
          )}
          {trafficLight?.reason && light !== 'green' && (
            <span
              className={[
                'max-w-[180px] truncate rounded px-1 font-medium',
                light === 'yellow'
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-amber-500/15 dark:text-amber-200'
                  : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200',
              ].join(' ')}
              title={trafficLight.reason}
            >
              {trafficLight.reason}
            </span>
          )}
        </span>
        <div className="flex gap-1">
            {isCalled ? (
              <>
                {!allPlayersConfirmed && onConfirmPlayer && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCheckInAll(); }}
                    disabled={updating}
                    className={`${ACTION_BTN} bg-blue-600 text-white hover:bg-blue-700 !px-2 !py-0.5 !text-[11px]`}
                    title={`Mark all ${missingPlayers.length} missing player${missingPlayers.length === 1 ? '' : 's'} as present`}
                    aria-label="Confirm all players present"
                  >
                    {updating
                      ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                      : <Check aria-hidden="true" className="h-3 w-3" />}
                    All in
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowCourtDialog(true); }}
                  disabled={updating}
                  className={`${ACTION_BTN} bg-green-600 text-white hover:bg-green-700 !px-2 !py-0.5 !text-[11px]`}
                  title={allPlayersConfirmed ? 'Start match' : 'Start — assumes all players present'}
                  aria-label="Start match"
                >
                  {updating && <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />}
                  Start
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowScoreDialog(true); }}
                  disabled={updating}
                  className={`${ACTION_BTN} bg-blue-600 text-white hover:bg-blue-700 !px-2 !py-0.5 !text-[11px]`}
                  title="Enter score without tracking start/finish times"
                  aria-label="Enter score"
                >
                  Score
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUndo(); }}
                  disabled={updating}
                  className={`${ACTION_BTN} bg-muted text-foreground hover:bg-muted/80 !px-2 !py-0.5 !text-[11px]`}
                  aria-label="Undo"
                >
                  Undo
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCall(); }}
                  disabled={updating || light === 'red'}
                  className={[
                    ACTION_BTN,
                    '!px-2 !py-0.5 !text-[11px]',
                    light === 'green'
                      ? 'bg-primary text-primary-foreground hover:brightness-110'
                      : light === 'yellow'
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-muted text-muted-foreground opacity-60',
                  ].join(' ')}
                  title={
                    light === 'yellow'
                      ? `Call anyway — ${trafficLight?.reason ?? 'player still resting'}`
                      : light === 'red'
                        ? trafficLight?.reason ?? 'Blocked'
                        : 'Call match'
                  }
                  aria-label="Call match"
                >
                  {updating && <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />}
                  Call
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowScoreDialog(true); }}
                  disabled={updating}
                  className={`${ACTION_BTN} bg-blue-600 text-white hover:bg-blue-700 !px-2 !py-0.5 !text-[11px]`}
                  title="Enter score directly — skips call / start"
                  aria-label="Enter score"
                >
                  Score
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
                <button
                  onClick={(e) => { e.stopPropagation(); setShowEditDialog(true); }}
                  disabled={updating}
                  className={`${ACTION_BTN} bg-muted text-foreground hover:bg-muted/80 !px-2 !py-0.5 !text-[11px]`}
                  aria-label="Edit match"
                >
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
      {/* Player check-in strip — only shown for called matches with
          unconfirmed players. Sits directly under the row, no extra
          card-level padding, so the strip behaves as a sub-line. */}
      {isCalled && onConfirmPlayer && (
        <div className="flex flex-wrap items-center gap-1 border-l-2 border-l-transparent bg-muted/40 px-2 py-0.5 text-[11px]">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Check in</span>
          {[...sideAPlayers, ...sideBPlayers].map((p) => {
            const isConfirmed = confirmations[p.id] || false;
            return (
              <button
                key={p.id}
                onClick={(e) => { e.stopPropagation(); handleConfirmPlayer(p.id); }}
                disabled={updating}
                className={[
                  INTERACTIVE_BASE,
                  'inline-flex items-center gap-0.5 rounded border px-1.5 py-0 font-medium',
                  isConfirmed
                    ? 'border-green-300 bg-green-100 text-green-700 hover:bg-green-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25'
                    : 'border-border bg-card text-foreground hover:bg-muted',
                ].join(' ')}
                title={isConfirmed ? `${p.name} confirmed` : `Click to confirm ${p.name}`}
                aria-label={isConfirmed ? `${p.name} confirmed present` : `Confirm ${p.name} present`}
                aria-pressed={isConfirmed}
              >
                {isConfirmed && <Check aria-hidden="true" className="h-3 w-3 flex-shrink-0" />}
                {p.name}
                {p.delayCount > 0 && (
                  <span
                    className="ml-0.5 rounded bg-yellow-100 px-0.5 text-[9px] font-semibold text-yellow-700 dark:bg-amber-500/15 dark:text-amber-200"
                    title={`${p.delayCount} delay(s)`}
                  >
                    {p.delayCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Edit Match Dialog */}
      {showEditDialog && (
        <EditMatchDialog
          matchName={getMatchLabel(match)}
          sideAPlayers={sideAPlayersForEdit}
          sideBPlayers={sideBPlayersForEdit}
          availablePlayers={players}
          onSubstitute={(oldPlayerId, newPlayerId) => {
            onSubstitute?.(assignment.matchId, oldPlayerId, newPlayerId);
          }}
          onRemovePlayer={(playerId) => {
            onRemovePlayer?.(assignment.matchId, playerId);
          }}
          onClose={() => setShowEditDialog(false)}
          isSubmitting={updating}
        />
      )}

      {showCourtDialog && config && (
        <CourtSelectDialog
          matchName={getMatchLabel(match)}
          scheduledCourt={assignment.courtId}
          courtCount={config.courtCount}
          occupiedCourts={occupiedCourts}
          onConfirm={handleStart}
          onCancel={() => setShowCourtDialog(false)}
          isSubmitting={updating}
        />
      )}

      {showScoreDialog && (
        useBadmintonScoring ? (
          <BadmintonScoreDialog
            matchName={getMatchLabel(match)}
            sideAName={sideANames}
            sideBName={sideBNames}
            setsToWin={setsToWin}
            pointsPerSet={pointsPerSet}
            deuceEnabled={deuceEnabled}
            onSubmit={handleBadmintonScoreSubmit}
            onCancel={() => setShowScoreDialog(false)}
            isSubmitting={updating}
          />
        ) : (
          <MatchScoreDialog
            matchName={getMatchLabel(match)}
            sideAName={sideANames}
            sideBName={sideBNames}
            onSubmit={handleSimpleScoreSubmit}
            onCancel={() => setShowScoreDialog(false)}
            isSubmitting={updating}
          />
        )
      )}
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
        aria-label="Undo finish"
      >
        {updating && <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />}
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
  players,
  onSubstitute,
  onRemovePlayer,
  onCascadingStart,
  onUndoStart,
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

  // Compute occupied courts (courts with in-progress matches)
  const occupiedCourts = useMemo(() => {
    return matchesByStatus.started.map((a) => {
      // Use actualCourtId if set, otherwise use scheduled courtId
      return matchStates[a.matchId]?.actualCourtId ?? a.courtId;
    });
  }, [matchesByStatus.started, matchStates]);

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

  // Single-column stack:
  //   1. In-Progress pinned strip at top (collapses entirely when no active matches)
  //   2. Tabbed Up Next / Finished below, filling remaining height
  // Mirrors the Schedule page's vertical rhythm. 3-column layout retired.
  const hasActive = startedSorted.length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      {hasActive && (
        <div className="flex-shrink-0 border-b border-border">
          <div className="px-2 py-1.5 flex items-center justify-between border-b border-border/60">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">In Progress</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{matchesByStatus.started.length} active</span>
          </div>
          <div className="p-1.5 max-h-44 overflow-auto">
            {startedSorted.map((assignment) => (
              <InProgressCard
                key={assignment.matchId}
                assignment={assignment}
                match={matchMap.get(assignment.matchId)}
                matchState={matchStates[assignment.matchId]}
                playerNames={playerNames}
                config={config}
                isSelected={selectedMatchId === assignment.matchId}
                onSelect={() => onSelectMatch?.(assignment.matchId)}
                onUpdateStatus={onUpdateStatus}
                onUndoStart={onUndoStart}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabbed Up Next / Finished */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('up_next')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                activeTab === 'up_next'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              Up Next ({upNextSorted.length})
            </button>
            <button
              onClick={() => setActiveTab('finished')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                activeTab === 'finished'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              Finished ({finishedSorted.length})
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {activeTab === 'up_next' && (
            upNextSorted.length === 0 ? (
              <div className="text-center text-muted-foreground text-[10px] py-4">No matches pending</div>
            ) : (
              upNextSorted.map((assignment) => (
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
                  players={players}
                  onSubstitute={onSubstitute}
                  onRemovePlayer={onRemovePlayer}
                  occupiedCourts={occupiedCourts}
                  onCascadingStart={onCascadingStart}
                />
              ))
            )
          )}
          {activeTab === 'finished' && (
            finishedSorted.length === 0 ? (
              <div className="text-center text-muted-foreground text-xs py-4">No completed matches</div>
            ) : (
              finishedSorted.map((assignment) => (
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
