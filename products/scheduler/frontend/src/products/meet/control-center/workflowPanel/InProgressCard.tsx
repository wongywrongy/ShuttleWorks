/**
 * In Progress card — Score button (pops the rail's score editor) +
 * Undo button. The actual score entry lives in match details so the
 * rail can show the per-set badminton form.
 */
import { useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import type { ScheduleAssignment, MatchDTO, MatchStateDTO } from '../../../../api/dto';
import { ElapsedTimer } from '../../../../components/common/ElapsedTimer';
import { getMatchLabel } from '../../../../utils/matchUtils';
import { SELECTABLE_ROW_FOCUS, selectableRowProps } from '../../../../lib/selectableRow';
import { ACTION_BTN } from './styles';
import { useCanEdit } from '../../../../hooks/useCanEdit';

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
  // A viewer may not drive the live day (audit A2): fold the permission into
  // the in-flight flag so every action button here carries the `disabled`
  // vocabulary, which blocks pointer AND keyboard.
  const canEditWorkspace = useCanEdit();
  const locked = updating || !canEditWorkspace;

  if (!match) return null;

  const sideANames = (match.sideA || []).map((id) => playerNames.get(id) || id).join(' & ');
  const sideBNames = (match.sideB || []).map((id) => playerNames.get(id) || id).join(' & ');
  const displayCourtId = matchState?.actualCourtId ?? assignment.courtId;

  const handleUndo = async () => {
    setUpdating(true);
    try {
      if (onUndoStart) onUndoStart(assignment.matchId);
      // Undo returns the match to `scheduled`, not `called`: the server has no
      // playing→called edge, so the old target always 409'd (audit A1). The
      // match drops back into the queue to be called again.
      await onUpdateStatus(assignment.matchId, 'scheduled', { actualStartTime: undefined });
    } finally {
      setUpdating(false);
    }
  };

  // != null (not !== undefined): the DTO serializes these as explicit
  // ``null`` on every row, so the undefined-check branded EVERY in-progress
  // match "(moved)" once its match-state row existed.
  const wasMoved =
    matchState?.originalSlotId != null || matchState?.originalCourtId != null;

  return (
    <div
      {...selectableRowProps(onSelect, isSelected)}
      style={{ gridTemplateColumns: 'auto auto auto 1fr auto' }}
      className={[
        'motion-enter grid cursor-pointer items-center gap-2 border-l-2 px-2 py-1 text-xs transition-colors',
        SELECTABLE_ROW_FOCUS,
        isSelected
          ? 'border-l-status-started bg-status-started-bg'
          : 'border-l-status-live bg-status-live-bg/40 hover:bg-status-live-bg/60',
      ].join(' ')}
    >
      <span className="font-semibold text-foreground tabular-nums">
        {getMatchLabel(match)}
      </span>
      <span className="text-2xs text-muted-foreground">C{displayCourtId}</span>
      <span className="tabular-nums text-2xs text-muted-foreground">
        <ElapsedTimer startTime={matchState?.actualStartTime} />
      </span>
      <span className="min-w-0 break-words text-foreground">
        {sideANames} <span className="text-muted-foreground">vs</span> {sideBNames}
        {wasMoved && (
          <span className="ml-1 text-3xs text-accent">
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
            disabled={locked}
            className={`${ACTION_BTN} bg-accent text-accent-ink shadow-glow hover:brightness-110 !px-2 !py-0.5 !text-2xs`}
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
          disabled={locked}
          className={`${ACTION_BTN} bg-muted text-foreground hover:bg-muted/80 !px-2 !py-0.5 !text-2xs`}
          title="Undo start — returns the match to the queue"
          aria-label="Undo started match"
        >
          {updating && <CircleNotch aria-hidden="true" className="h-3 w-3 animate-spin" />}
          Undo
        </button>
      </div>
    </div>
  );
}
