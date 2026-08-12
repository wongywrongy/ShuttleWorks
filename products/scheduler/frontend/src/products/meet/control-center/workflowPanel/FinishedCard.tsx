/**
 * Finished Card — terminal-state row with score readout and Undo
 * (back to in-progress, clearing the score).
 *
 * Undo sits INSIDE the row's own click target, and that click target means
 * "show me this match". A Finished tab is a wall of these rows — 73 of them on
 * a real meet day — each carrying one control that discards a recorded score,
 * 8px from the row edge. It is the only destructive control here, so it arms:
 * `useConfirmClick`, the canon two-click guard (Escape cancels, the window
 * decays on its own), rather than a confirm dialog on a row you brush past.
 */
import { useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import type { ScheduleAssignment, MatchDTO, MatchStateDTO } from '../../../../api/dto';
import { getMatchLabel } from '../../../../utils/matchUtils';
import { SELECTABLE_ROW_FOCUS, selectableRowProps } from '../../../../lib/selectableRow';
import { ACTION_BTN } from './styles';
import { useCanEdit } from '../../../../hooks/useCanEdit';
import { useConfirmClick } from '../../../../hooks/useConfirmClick';

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
  // A viewer may not drive the live day (audit A2): fold the permission into
  // the in-flight flag so every action button here carries the `disabled`
  // vocabulary, which blocks pointer AND keyboard.
  const canEditWorkspace = useCanEdit();
  const locked = updating || !canEditWorkspace;

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
  // Declared above the `!match` bail so it runs on every render (rules of hooks).
  const confirmUndo = useConfirmClick(() => void handleUndo());

  if (!match) return null;

  const sideANames = (match.sideA || []).map((id) => playerNames.get(id) || id).join(' & ');
  const sideBNames = (match.sideB || []).map((id) => playerNames.get(id) || id).join(' & ');
  const score = matchState?.score;

  return (
    <div
      {...selectableRowProps(onSelect, isSelected)}
      style={{ gridTemplateColumns: 'auto auto 1fr auto auto' }}
      className={[
        'motion-enter grid cursor-pointer items-center gap-2 border-l-2 px-2 py-1 text-xs transition-colors',
        SELECTABLE_ROW_FOCUS,
        isSelected
          ? 'border-l-status-started bg-status-started-bg'
          : 'border-l-status-done bg-muted/40 hover:bg-muted/60',
      ].join(' ')}
    >
      <span className="font-semibold text-muted-foreground tabular-nums">
        {getMatchLabel(match)}
      </span>
      <span className="tabular-nums text-2xs text-muted-foreground">
        C{assignment.courtId}
      </span>
      <span className="min-w-0 break-words text-muted-foreground">
        {sideANames} <span className="text-muted-foreground">vs</span> {sideBNames}
      </span>
      {score ? (
        <span className="sw-num text-xs font-semibold tabular-nums text-status-started">
          {score.sideA}–{score.sideB}
        </span>
      ) : (
        <span className="text-3xs text-muted-foreground">no score</span>
      )}
      <button
        type="button"
        data-testid={`finished-undo-${assignment.matchId}`}
        onClick={(e) => {
          e.stopPropagation();
          confirmUndo.press();
        }}
        onBlur={confirmUndo.reset}
        disabled={locked}
        className={`${ACTION_BTN} !px-2 !py-0.5 !text-2xs ${
          confirmUndo.armed
            ? 'bg-destructive text-destructive-foreground sw-pulse'
            : 'bg-muted text-foreground hover:bg-muted/80'
        }`}
        title={
          confirmUndo.armed
            ? 'Press again to undo: the recorded score is discarded'
            : 'Undo finish: back to in progress, clearing the score'
        }
        aria-label={confirmUndo.armed ? 'Confirm undo: the score is discarded' : 'Undo finish'}
      >
        {updating && <CircleNotch aria-hidden="true" className="h-3 w-3 animate-spin" />}
        {confirmUndo.armed ? 'Press again' : 'Undo'}
      </button>
    </div>
  );
}
