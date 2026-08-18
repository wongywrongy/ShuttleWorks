/**
 * RunFinished — the Finished section below the Run queue (SP-CONSOLE-4 C4).
 *
 * Done matches leave the lanes and the queue, so without this list a
 * mis-recorded result was unreachable on the Run surface. Each meet row
 * carries the recorded score and the armed Undo (back to playing, score
 * discarded) on the versioned per-match state route — no wire change.
 * Bracket rows are read-only here: a bracket result is corrected in the
 * bracket's own surface (advancement hangs off it).
 */
import { CircleNotch } from '@phosphor-icons/react';
import { useState } from 'react';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { useConfirmClick } from '../../../hooks/useConfirmClick';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../../lib/utils';
import type { RunMatch } from '../runtime/runModel';
import type { MeetRunOps } from './useMeetRunOps';

export interface RunFinishedProps {
  /** The full Run match list — this component filters to `done` itself. */
  matches: RunMatch[];
  /** Meet write seams; absent = every row read-only (no Undo). */
  meetOps?: MeetRunOps;
}

export function RunFinished({ matches, meetOps }: RunFinishedProps) {
  const done = matches
    .filter((m) => m.status === 'done')
    .sort((a, b) => (b.plannedSlot ?? -1) - (a.plannedSlot ?? -1));
  if (done.length === 0) return null;

  return (
    <div data-testid="run-finished">
      <div className="px-4 pb-1 pt-3 text-3xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
        Finished
      </div>
      <ul className="divide-y divide-border/60 border-t border-border/60">
        {done.map((m) => (
          <FinishedRow key={m.key} match={m} meetOps={meetOps} />
        ))}
      </ul>
    </div>
  );
}

function FinishedRow({ match, meetOps }: { match: RunMatch; meetOps?: MeetRunOps }) {
  const canEdit = useCanEdit();
  const [updating, setUpdating] = useState(false);

  const undoable = match.source === 'meet' && !!meetOps;
  const score = undoable ? meetOps!.matchStates[match.id]?.score : undefined;

  const handleUndo = async () => {
    if (!meetOps) return;
    setUpdating(true);
    try {
      // Back to in-progress, clearing the recorded result — same contract as
      // the legacy FinishedCard (finished → started on the state route).
      await meetOps.updateMatchStatus(match.id, 'started', {
        actualEndTime: undefined,
        score: undefined,
        sets: undefined,
      });
    } finally {
      setUpdating(false);
    }
  };
  const confirmUndo = useConfirmClick(() => void handleUndo());
  const locked = updating || !canEdit;

  return (
    <li className="flex items-center gap-2 px-4 py-1.5 text-xs">
      <span className={`${EYEBROW_CLASS} shrink-0 text-muted-foreground`}>{match.label}</span>
      {match.court != null && (
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">C{match.court}</span>
      )}
      <span className="min-w-0 flex-1 break-words text-muted-foreground">
        {match.sideA} <span className="text-muted-foreground/70">vs</span> {match.sideB}
      </span>
      {score ? (
        <span className="sw-num shrink-0 text-xs font-semibold tabular-nums text-status-started">
          {score.sideA}–{score.sideB}
        </span>
      ) : (
        <span className="shrink-0 text-3xs text-muted-foreground">no score</span>
      )}
      {undoable && (
        <button
          type="button"
          data-testid={`run-finished-undo-${match.id}`}
          onClick={(e) => {
            e.stopPropagation();
            confirmUndo.press();
          }}
          onBlur={confirmUndo.reset}
          disabled={locked}
          className={`${INTERACTIVE_BASE} shrink-0 rounded px-2 py-0.5 text-2xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
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
          {updating && <CircleNotch aria-hidden="true" className="mr-1 inline h-3 w-3 animate-spin" />}
          {confirmUndo.armed ? 'Press again' : 'Undo'}
        </button>
      )}
    </li>
  );
}
