/**
 * Match Status Card Component - Compact version
 * Displays match details with status and action buttons
 */
import { useState } from 'react';
import { Pin } from 'lucide-react';
import type { ScheduleAssignment, MatchDTO, MatchStateDTO, SetScore, TournamentConfig, DelayReason } from '../../api/dto';
import { formatSlotTime } from '../../utils/timeUtils';
import type { TrafficLightResult } from '../../utils/trafficLight';
import { MatchScoreDialog } from './MatchScoreDialog';
import { BadmintonScoreDialog } from './BadmintonScoreDialog';
import { DelayReasonDialog } from './DelayReasonDialog';
import { usePlayerNames } from '../../hooks/usePlayerNames';

interface MatchStatusCardProps {
  assignment: ScheduleAssignment;
  match: MatchDTO | undefined;
  matchState: MatchStateDTO | undefined;
  config: TournamentConfig | null;
  onUpdateStatus: (matchId: string, status: MatchStateDTO['status'], additionalData?: Partial<MatchStateDTO>) => Promise<void>;
  dimmed?: boolean;
  onSelect?: (matchId: string) => void;
  selected?: boolean;
  currentSlot?: number;
  trafficLight?: TrafficLightResult;
}

export function MatchStatusCard({
  assignment,
  match,
  matchState,
  config,
  onUpdateStatus,
  dimmed = false,
  onSelect,
  selected = false,
  currentSlot = 0,
  trafficLight,
}: MatchStatusCardProps) {
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const [showDelayDialog, setShowDelayDialog] = useState(false);
  const [updating, setUpdating] = useState(false);
  const { getPlayerNames } = usePlayerNames();

  if (!match) return null;

  const status = matchState?.status || 'scheduled';
  const sideANames = getPlayerNames(match.sideA || []).join(' & ');
  const sideBNames = getPlayerNames(match.sideB || []).join(' & ');
  const isPinned = matchState?.pinned === true;

  // Check if match is delayed: explicitly marked OR time-based
  const isExplicitlyDelayed = matchState?.delayed === true;
  const isTimeDelayed = currentSlot > assignment.slotId && (status === 'scheduled' || status === 'called');
  const isDelayed = isExplicitlyDelayed || isTimeDelayed;

  // Format scheduled time
  const scheduledTime = config ? formatSlotTime(assignment.slotId, config) : '??:??';

  // Get actual times from match state
  const actualStart = matchState?.actualStartTime;
  const actualEnd = matchState?.actualEndTime;

  // Scoring format
  const useBadmintonScoring = config?.scoringFormat === 'badminton';
  const setsToWin = config?.setsToWin ?? 2;
  const pointsPerSet = config?.pointsPerSet ?? 21;
  const deuceEnabled = config?.deuceEnabled ?? true;

  const handleStatusChange = async (newStatus: MatchStateDTO['status'], additionalData?: Partial<MatchStateDTO>) => {
    if (updating) return;
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, newStatus, additionalData);
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setUpdating(false);
    }
  };

  // Undo: go back to previous status
  const handleUndo = async () => {
    if (updating) return;
    const previousStatus: Record<string, MatchStateDTO['status']> = {
      'called': 'scheduled',
      'started': 'called',
      'finished': 'started',
    };
    const prev = previousStatus[status];
    if (prev) {
      // Clear relevant fields when undoing
      const clearData: Partial<MatchStateDTO> = { delayed: false };
      if (status === 'started') clearData.actualStartTime = undefined;
      if (status === 'finished') {
        clearData.actualEndTime = undefined;
        clearData.score = undefined;
        clearData.sets = undefined;
      }
      await handleStatusChange(prev, clearData);
    }
  };

  const handleSimpleScoreSubmit = async (score: { sideA: number; sideB: number }, notes: string) => {
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, 'finished', { score, notes });
      setShowScoreDialog(false);
    } catch (error) {
      console.error('Failed to submit score:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleBadmintonScoreSubmit = async (sets: SetScore[], _winner: 'A' | 'B', notes: string) => {
    setUpdating(true);
    try {
      // Calculate total sets won for simple score display
      const setsWonA = sets.filter(s => s.sideA > s.sideB).length;
      const setsWonB = sets.filter(s => s.sideB > s.sideA).length;
      await onUpdateStatus(assignment.matchId, 'finished', {
        sets,
        score: { sideA: setsWonA, sideB: setsWonB },
        notes,
      });
      setShowScoreDialog(false);
    } catch (error) {
      console.error('Failed to submit score:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleCardClick = () => {
    if (onSelect && !dimmed) {
      onSelect(assignment.matchId);
    }
  };

  const handleDelayWithReason = async (reason: DelayReason, notes?: string, delayedPlayerId?: string) => {
    if (updating) return;
    setUpdating(true);
    try {
      // Mark as delayed (yellow) and reset to scheduled if needed
      const newStatus = status === 'called' ? 'scheduled' : status;
      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      await onUpdateStatus(assignment.matchId, newStatus as MatchStateDTO['status'], {
        delayed: true,
        delayReason: reason,
        delayedPlayerId,
        notes: notes ? `Delayed at ${timestamp}: ${notes}` : `Delayed at ${timestamp}`,
      });
      setShowDelayDialog(false);
    } catch (error) {
      console.error('Failed to delay match:', error);
    } finally {
      setUpdating(false);
    }
  };

  // Get player info for delay dialog
  const allPlayerIds = [...(match.sideA || []), ...(match.sideB || [])];
  const playerInfoList = allPlayerIds.map(id => ({
    id,
    name: getPlayerNames([id]).join(''),
  }));

  const handleTogglePin = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      await onUpdateStatus(assignment.matchId, status, {
        pinned: !isPinned,
      });
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <div
        className={`rounded border p-1.5 transition-colors text-xs ${
          selected
            ? 'border-blue-500 ring-2 ring-blue-200 bg-white'
            : isDelayed
              ? 'border-yellow-400 bg-yellow-50'
              : dimmed
                ? 'border-gray-100 opacity-50 bg-white'
                : 'border-gray-200 hover:border-gray-300 bg-white'
        } ${onSelect && !dimmed ? 'cursor-pointer' : ''}`}
        onClick={handleCardClick}
      >
        {/* Row 1: Traffic light + Match label + Court/Time + Action */}
        <div className="flex items-center gap-2">
          {/* Traffic light indicator - only show for scheduled matches */}
          {trafficLight && status === 'scheduled' && (
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                trafficLight.status === 'green'
                  ? 'bg-green-500'
                  : trafficLight.status === 'yellow'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              }`}
              title={trafficLight.reason || 'Ready to call'}
            />
          )}
          <div className="font-semibold text-gray-900 w-14 flex-shrink-0 truncate flex items-center gap-0.5">
            {isPinned && (
              <Pin
                aria-label="Pinned to court and time"
                className="h-3 w-3 flex-shrink-0 text-orange-500"
              />
            )}
            {match.eventRank || `M${match.matchNumber || '?'}`}
          </div>
          <div className="flex-shrink-0 flex items-center gap-1">
            <span className="text-gray-500">C{assignment.courtId}</span>
            {/* Show scheduled time, with actual times if available */}
            {actualStart ? (
              <span className="text-green-600" title={`Scheduled: ${scheduledTime}`}>
                {actualStart}{actualEnd ? ` - ${actualEnd}` : ''}
              </span>
            ) : (
              <span className={isDelayed ? 'text-yellow-700 font-medium' : 'text-gray-500'}>
                {scheduledTime}
              </span>
            )}
            {isDelayed && !actualStart && (
              <span className="text-yellow-600 text-[10px]">(late)</span>
            )}
          </div>
          <div className="flex-1" />
          {/* Score if finished */}
          {matchState?.score && (
            <div className="font-semibold text-gray-900 flex-shrink-0" title={matchState.sets ? `Sets: ${matchState.sets.map(s => `${s.sideA}-${s.sideB}`).join(', ')}` : undefined}>
              {matchState.score.sideA}-{matchState.score.sideB}
            </div>
          )}
          {/* Action buttons */}
          <div className="flex-shrink-0 flex gap-1">
            {status === 'scheduled' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handleStatusChange('called', { delayed: false }); }}
                  disabled={updating || dimmed || trafficLight?.status !== 'green'}
                  className="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  title={trafficLight?.status !== 'green' ? trafficLight?.reason : undefined}
                >
                  Call
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDelayDialog(true); }}
                  disabled={updating || dimmed}
                  className="px-2 py-0.5 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Delay
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleTogglePin(); }}
                  disabled={updating || dimmed}
                  aria-label={isPinned ? 'Unpin match' : 'Pin match to court and time'}
                  aria-pressed={isPinned}
                  className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded ${isPinned ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                  title={isPinned ? 'Unpin match' : 'Pin to court/time'}
                >
                  <Pin aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {status === 'called' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handleStatusChange('started'); }}
                  disabled={updating}
                  className="px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                >
                  Start
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDelayDialog(true); }}
                  disabled={updating}
                  className="px-2 py-0.5 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-400"
                >
                  Delay
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUndo(); }}
                  disabled={updating}
                  className="px-2 py-0.5 bg-gray-400 text-white rounded hover:bg-gray-500 disabled:bg-gray-300"
                  title="Undo: back to scheduled"
                >
                  Undo
                </button>
              </>
            )}
            {status === 'started' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowScoreDialog(true); }}
                  disabled={updating}
                  className="px-2 py-0.5 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
                >
                  Finish
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUndo(); }}
                  disabled={updating}
                  className="px-2 py-0.5 bg-gray-400 text-white rounded hover:bg-gray-500 disabled:bg-gray-300"
                  title="Undo: back to called"
                >
                  Undo
                </button>
              </>
            )}
            {status === 'finished' && (
              <>
                <span className="text-green-600 font-medium">Done</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUndo(); }}
                  disabled={updating}
                  className="px-2 py-0.5 bg-gray-400 text-white rounded hover:bg-gray-500 disabled:bg-gray-300"
                  title="Undo: reopen match"
                >
                  Undo
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Players */}
        <div className="text-gray-600 truncate mt-0.5">
          {sideANames || '?'} vs {sideBNames || '?'}
        </div>
      </div>

      {showScoreDialog && (
        useBadmintonScoring ? (
          <BadmintonScoreDialog
            matchName={match.eventRank || 'Match'}
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
            matchName={match.eventRank || 'Match'}
            sideAName={sideANames}
            sideBName={sideBNames}
            onSubmit={handleSimpleScoreSubmit}
            onCancel={() => setShowScoreDialog(false)}
            isSubmitting={updating}
          />
        )
      )}

      {showDelayDialog && (
        <DelayReasonDialog
          matchName={match.eventRank || 'Match'}
          players={playerInfoList}
          onSubmit={handleDelayWithReason}
          onCancel={() => setShowDelayDialog(false)}
          isSubmitting={updating}
        />
      )}
    </>
  );
}
