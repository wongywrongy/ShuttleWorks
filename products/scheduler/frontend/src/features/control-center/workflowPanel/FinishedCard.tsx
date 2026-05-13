/**
 * Finished Card — terminal-state row with score readout and Undo
 * (back to in-progress, clearing the score).
 */
import { useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import type { ScheduleAssignment, MatchDTO, MatchStateDTO } from '../../../api/dto';
import { getMatchLabel } from '../../../utils/matchUtils';
import { ACTION_BTN } from './styles';

export function FinishedCard({
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
  onUpdateStatus: (
    matchId: string,
    status: MatchStateDTO['status'],
    data?: Partial<MatchStateDTO>,
  ) => Promise<void>;
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
        'motion-enter grid cursor-pointer items-center gap-2 border-l-2 px-2 py-1 text-xs transition-colors',
        isSelected
          ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-500/15'
          : 'border-l-border bg-muted/40 hover:bg-muted/60',
      ].join(' ')}
    >
      <span className="font-semibold text-muted-foreground tabular-nums">
        {getMatchLabel(match)}
      </span>
      <span className="tabular-nums text-[11px] text-muted-foreground">
        C{assignment.courtId}
      </span>
      <span
        className="truncate text-muted-foreground"
        title={`${sideANames} vs ${sideBNames}`}
      >
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
        onClick={(e) => {
          e.stopPropagation();
          handleUndo();
        }}
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
