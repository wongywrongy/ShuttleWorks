/**
 * In Progress card — Score button (pops the rail's score editor) +
 * Undo button. The actual score entry lives in match details so the
 * rail can show the per-set badminton form.
 */
import { useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import type { ScheduleAssignment, MatchDTO, MatchStateDTO } from '../../../api/dto';
import { ElapsedTimer } from '../../../components/common/ElapsedTimer';
import { getMatchLabel } from '../../../utils/matchUtils';
import { ACTION_BTN } from './styles';

export function InProgressCard({
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
  onUpdateStatus: (
    matchId: string,
    status: MatchStateDTO['status'],
    data?: Partial<MatchStateDTO>,
  ) => Promise<void>;
  onUndoStart?: (matchId: string) => void;
  onRequestScore?: (matchId: string) => void;
}) {
  const [updating, setUpdating] = useState(false);

  if (!match) return null;

  const sideANames = (match.sideA || []).map((id) => playerNames.get(id) || id).join(' & ');
  const sideBNames = (match.sideB || []).map((id) => playerNames.get(id) || id).join(' & ');
  const displayCourtId = matchState?.actualCourtId ?? assignment.courtId;

  const handleUndo = async () => {
    setUpdating(true);
    try {
      if (onUndoStart) onUndoStart(assignment.matchId);
      await onUpdateStatus(assignment.matchId, 'called', { actualStartTime: undefined });
    } finally {
      setUpdating(false);
    }
  };

  const wasMoved =
    matchState?.originalSlotId !== undefined ||
    matchState?.originalCourtId !== undefined;

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
      <span className="font-semibold text-foreground tabular-nums">
        {getMatchLabel(match)}
      </span>
      <span className="text-[11px] text-muted-foreground">C{displayCourtId}</span>
      <span className="tabular-nums text-[11px] text-muted-foreground">
        <ElapsedTimer startTime={matchState?.actualStartTime} />
      </span>
      <span className="truncate text-foreground" title={`${sideANames} vs ${sideBNames}`}>
        {sideANames} <span className="text-muted-foreground">vs</span> {sideBNames}
        {wasMoved && (
          <span className="ml-1 text-[10px] text-orange-500 dark:text-orange-300">
            (moved)
          </span>
        )}
      </span>
      <div className="flex gap-1">
        {onRequestScore && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRequestScore(assignment.matchId);
            }}
            disabled={updating}
            className={`${ACTION_BTN} bg-blue-600 text-white hover:bg-blue-700 !px-2 !py-0.5 !text-[11px]`}
            title="Enter score — opens score editor in the rail"
            aria-label="Enter score"
          >
            Score
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleUndo();
          }}
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
