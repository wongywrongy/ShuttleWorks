import { can, isRunComplete } from '../runtime/runMachine';
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
import { NavCaret, NAV_LINK_ROW } from '../../../components/NavCaret';
import { TEXT_SECONDARY } from '../../../lib/textRoles';
import type { RunMatch } from '../runtime/runModel';
import type { MeetRunOps } from './useMeetRunOps';
import { formatMatchIdentity } from '../../../platform/domain/matchIdentity';
import { formatGamePairs } from '../../../components/control-plane';

export interface RunFinishedProps {
  /** The full Run match list — this component filters to finished and retired matches. */
  matches: RunMatch[];
  /** Meet write seams; absent = every row read-only (no Undo). */
  meetOps?: MeetRunOps;
}

export function RunFinished({ matches, meetOps }: RunFinishedProps) {
  const done = matches
    .filter((m) => isRunComplete(m.status))
    .sort((a, b) => (b.plannedSlot ?? -1) - (a.plannedSlot ?? -1));
  if (done.length === 0) return null;

  return (
    // P4: history is collapsed by default. A finished day put a hundred
    // completed rows between the desk and the queue it actually works from;
    // the rows are one click away, in the same order, with the same Undo.
    <details data-testid="run-finished">
      <summary
        data-testid="run-finished-toggle"
        className={`${NAV_LINK_ROW} w-full cursor-pointer list-none px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint hover:text-foreground`}
      >
        <span className="inline-flex transition-transform duration-fast [details[open]_&]:rotate-90">
          <NavCaret />
        </span>
        Finished ({done.length})
      </summary>
      <ul className="divide-y divide-border/60 border-t border-border/60">
        {done.map((m) => (
          <FinishedRow key={m.key} match={m} meetOps={meetOps} />
        ))}
      </ul>
    </details>
  );
}

function FinishedRow({ match, meetOps }: { match: RunMatch; meetOps?: MeetRunOps }) {
  const canEdit = useCanEdit();
  const [updating, setUpdating] = useState(false);

  const undoable = match.source === 'meet' && !!meetOps && can(match.status, 'undo_finish');
  // SWP-1: the score rides the match itself (both engines fill `Match.score`
  // in their adapters), so bracket rows show their recorded sets here — the
  // old read went through `meetOps.matchStates`, a store bracket play-unit
  // ids can never appear in, which painted "no score" beside 155 scored
  // matches on a finished bracket day.
  const score = match.score ?? (undoable ? meetOps!.matchStates[match.id]?.score : undefined);
  const sets = match.score?.sets;
  // P1: one score speller per tier. This row used to build its own en-dash
  // join — a fourth spelling of `18–21, 21–15` in the console — so it now
  // goes through the shared `formatGamePairs`, in canonical A-then-B order.
  // A finished row with no per-game detail falls back to the recorded
  // aggregate, exactly as the match rows do; nothing is fabricated.
  const scoreLine =
    sets && sets.length > 0
      ? formatGamePairs(sets)
      : score
        ? formatGamePairs([score])
        : null;

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
      <span className={`${EYEBROW_CLASS} shrink-0 ${TEXT_SECONDARY}`}>{formatMatchIdentity(match.identity, match.id)}</span>
      {match.court != null && (
        <span className={`shrink-0 text-2xs tabular-nums ${TEXT_SECONDARY}`}>C{match.court}</span>
      )}
      <span className="min-w-0 flex-1 break-words text-muted-foreground">
        {match.sideA} <span className="text-muted-foreground">vs</span> {match.sideB}
      </span>
      {match.status === 'retired' && <span className="shrink-0 text-muted-foreground">Retired</span>}
      {scoreLine ? (
        <span className="sw-num shrink-0 text-xs font-semibold tabular-nums text-status-started">
          {scoreLine}
        </span>
      ) : null}
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
          className={`${INTERACTIVE_BASE} shrink-0 rounded px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
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
