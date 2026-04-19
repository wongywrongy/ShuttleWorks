/**
 * Workflow Panel - Per Wireframe Design (Tailwind CSS)
 * Left: In Progress (~320px) with elapsed timer
 * Center: Tabbed Up Next / Finished with colored left borders
 */
import { useState, useMemo } from 'react';
import type { ScheduleAssignment, MatchDTO, MatchStateDTO, TournamentConfig, SetScore, PlayerDTO } from '../../api/dto';
import type { TrafficLightResult } from '../../utils/trafficLight';
import { formatSlotTime } from '../../utils/timeUtils';
import { getMatchLabel } from '../../utils/matchUtils';
import { ElapsedTimer } from '../../components/common/ElapsedTimer';
import { MatchScoreDialog } from '../tracking/MatchScoreDialog';
import { BadmintonScoreDialog } from '../tracking/BadmintonScoreDialog';
import { EditMatchDialog } from './EditMatchDialog';
import { CourtSelectDialog } from './CourtSelectDialog';

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
        className={`rounded border p-1.5 mb-1 cursor-pointer transition-all ${
          isSelected
            ? 'border-blue-500 ring-1 ring-blue-200 bg-blue-50'
            : 'border-green-200 bg-green-50 hover:border-green-300'
        }`}
      >
        <div className="flex justify-between items-center mb-0.5">
          <div className="flex items-center gap-1">
            <span className="font-medium text-xs text-gray-700">{getMatchLabel(match)}</span>
            <span className="text-[10px] text-gray-500">C{displayCourtId}</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setShowScoreDialog(true); }}
              disabled={updating}
              className="px-2.5 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 disabled:bg-gray-400"
            >
              Finish
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleUndo(); }}
              disabled={updating}
              className="px-2.5 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300 disabled:bg-gray-100"
              title={wasMoved ? 'Undo and restore to original position' : 'Undo to called status'}
            >
              Undo
            </button>
          </div>
        </div>
        <div className="text-[10px] text-gray-600 truncate">{sideANames} vs {sideBNames}</div>
        <div className="text-[10px] text-gray-500 flex items-center gap-1">
          <ElapsedTimer startTime={matchState?.actualStartTime} />
          {wasMoved && (
            <span className="text-[9px] text-orange-500">(moved)</span>
          )}
        </div>
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
    ? 'bg-white'
    : light === 'yellow'
      ? 'bg-yellow-50'
      : 'bg-red-50';

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
  // whether the match came from called-shortcut or the normal Start → Finish flow.
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
        className={`rounded border border-l-2 p-1.5 mb-1 cursor-pointer transition-all ${borderColorClass} ${
          isSelected ? 'border-blue-500 ring-1 ring-blue-200 bg-blue-50' : `${bgColorClass} hover:brightness-95`
        }`}
      >
        <div className="flex justify-between items-center mb-0.5">
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColorClass}`} />
            <span className="font-medium text-xs text-gray-700">{getMatchLabel(match)}</span>
            <span className="text-[10px] text-gray-500">C{assignment.courtId} · {scheduledTime}</span>
            {matchState?.postponed && <span className="text-[9px] text-orange-600 font-medium">(postponed)</span>}
            {isLate && !matchState?.postponed && <span className="text-[9px] text-yellow-600 font-medium">(late)</span>}
          </div>
          <div className="flex gap-1">
            {isCalled ? (
              <>
                {!allPlayersConfirmed && onConfirmPlayer && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCheckInAll(); }}
                    disabled={updating}
                    className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-400"
                    title={`Mark all ${missingPlayers.length} missing player${missingPlayers.length === 1 ? '' : 's'} as present`}
                  >
                    ✓ All
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowCourtDialog(true); }}
                  disabled={updating}
                  className="px-2.5 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:bg-gray-400"
                  title={allPlayersConfirmed ? 'Start match' : 'Start — assumes all players present'}
                >
                  Start
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowScoreDialog(true); }}
                  disabled={updating}
                  className="px-2.5 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 disabled:bg-gray-400"
                  title="Enter score without tracking start/finish times"
                >
                  Score
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUndo(); }}
                  disabled={updating}
                  className="px-2.5 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300 disabled:bg-gray-100"
                >
                  Undo
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCall(); }}
                  disabled={updating || light === 'red'}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${
                    light === 'green'
                      ? 'bg-gray-700 text-white hover:bg-gray-800 disabled:bg-gray-400'
                      : light === 'yellow'
                        ? 'bg-yellow-500 text-white hover:bg-yellow-600 disabled:bg-gray-400'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  title={
                    light === 'yellow'
                      ? `Call anyway — ${trafficLight?.reason ?? 'player still resting'}`
                      : light === 'red'
                        ? trafficLight?.reason ?? 'Blocked'
                        : 'Call match'
                  }
                >
                  Call
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowScoreDialog(true); }}
                  disabled={updating}
                  className="px-2.5 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 disabled:bg-gray-400"
                  title="Enter score directly — skips call / start"
                >
                  Score
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePostpone(); }}
                  disabled={updating}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    matchState?.postponed
                      ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {matchState?.postponed ? 'Restore' : 'Postpone'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowEditDialog(true); }}
                  disabled={updating}
                  className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300 disabled:bg-gray-100"
                >
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
        {/* Player names - clickable for check-in when called */}
        {isCalled && onConfirmPlayer ? (
          <div className="flex items-center gap-1.5 flex-wrap text-xs mt-1">
            <span className="flex items-center gap-1">
              {sideAPlayers.map((p, i) => {
                const isConfirmed = confirmations[p.id] || false;
                return (
                  <span key={p.id} className="flex items-center">
                    {i > 0 && <span className="mx-0.5 text-gray-400">&</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleConfirmPlayer(p.id); }}
                      disabled={updating}
                      className={`px-2 py-1 rounded font-medium transition-colors ${
                        isConfirmed
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                      }`}
                      title={isConfirmed ? `${p.name} confirmed` : `Click to confirm ${p.name}`}
                    >
                      {isConfirmed ? '✓ ' : ''}{p.name}
                    </button>
                    {p.delayCount > 0 && (
                      <span className="ml-0.5 px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[9px] font-medium" title={`${p.delayCount} delay(s)`}>
                        {p.delayCount}
                      </span>
                    )}
                  </span>
                );
              })}
            </span>
            <span className="text-gray-400 font-medium">vs</span>
            <span className="flex items-center gap-1">
              {sideBPlayers.map((p, i) => {
                const isConfirmed = confirmations[p.id] || false;
                return (
                  <span key={p.id} className="flex items-center">
                    {i > 0 && <span className="mx-0.5 text-gray-400">&</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleConfirmPlayer(p.id); }}
                      disabled={updating}
                      className={`px-2 py-1 rounded font-medium transition-colors ${
                        isConfirmed
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                      }`}
                      title={isConfirmed ? `${p.name} confirmed` : `Click to confirm ${p.name}`}
                    >
                      {isConfirmed ? '✓ ' : ''}{p.name}
                    </button>
                    {p.delayCount > 0 && (
                      <span className="ml-0.5 px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[9px] font-medium" title={`${p.delayCount} delay(s)`}>
                        {p.delayCount}
                      </span>
                    )}
                  </span>
                );
              })}
            </span>
          </div>
        ) : (
          <div className="text-[10px] text-gray-600 truncate flex items-center gap-1">
            {hasDelayedPlayers ? (
              <>
                <span className="flex items-center gap-0.5">
                  {sideAPlayers.map((p, i) => (
                    <span key={p.id} className="flex items-center">
                      {i > 0 && <span className="mx-0.5">&</span>}
                      <span>{p.name}</span>
                      {p.delayCount > 0 && (
                        <span className="ml-0.5 px-0.5 bg-yellow-100 text-yellow-700 rounded text-[8px] font-medium" title={`${p.delayCount} delay(s)`}>
                          {p.delayCount}
                        </span>
                      )}
                    </span>
                  ))}
                </span>
                <span className="text-gray-400">vs</span>
                <span className="flex items-center gap-0.5">
                  {sideBPlayers.map((p, i) => (
                    <span key={p.id} className="flex items-center">
                      {i > 0 && <span className="mx-0.5">&</span>}
                      <span>{p.name}</span>
                      {p.delayCount > 0 && (
                        <span className="ml-0.5 px-0.5 bg-yellow-100 text-yellow-700 rounded text-[8px] font-medium" title={`${p.delayCount} delay(s)`}>
                          {p.delayCount}
                        </span>
                      )}
                    </span>
                  ))}
                </span>
              </>
            ) : (
              <span>{sideANames} <span className="text-gray-400">vs</span> {sideBNames}</span>
            )}
          </div>
        )}

        {/* Conflict reason - always visible for yellow/red */}
        {trafficLight?.reason && light !== 'green' && (
          <div className={`mt-1 px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 ${
            light === 'yellow' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
          }`}>
            <span className={`w-1 h-1 rounded-full ${dotColorClass}`} />
            {trafficLight.reason}
          </div>
        )}
      </div>

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
      className={`rounded border p-1.5 mb-1 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 ring-1 ring-blue-200 bg-blue-50'
          : 'border-gray-200 bg-gray-50 hover:border-gray-300'
      }`}
    >
      <div className="flex justify-between items-center mb-0.5">
        <div className="flex items-center gap-1">
          <span className="font-medium text-xs text-gray-500">{getMatchLabel(match)}</span>
          <span className="text-[10px] text-gray-400">C{assignment.courtId}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {score && (
            <span className="font-medium text-xs text-purple-600">
              {score.sideA}-{score.sideB}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleUndo(); }}
            disabled={updating}
            className="px-2.5 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300 disabled:bg-gray-100"
          >
            Undo
          </button>
        </div>
      </div>
      <div className="text-[10px] text-gray-500 truncate">{sideANames} <span className="text-gray-400">vs</span> {sideBNames}</div>
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
        <div className="flex-shrink-0 border-b border-gray-200">
          <div className="px-2 py-1.5 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">In Progress</span>
            </div>
            <span className="text-[10px] text-gray-400">{matchesByStatus.started.length} active</span>
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
        <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('up_next')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                activeTab === 'up_next'
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Up Next ({upNextSorted.length})
            </button>
            <button
              onClick={() => setActiveTab('finished')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                activeTab === 'finished'
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Finished ({finishedSorted.length})
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {activeTab === 'up_next' && (
            upNextSorted.length === 0 ? (
              <div className="text-center text-gray-400 text-[10px] py-4">No matches pending</div>
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
              <div className="text-center text-gray-400 text-xs py-4">No completed matches</div>
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
