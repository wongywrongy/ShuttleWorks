/**
 * Operations-owned controls supplied to the shared MatchInspector.
 *
 * F-UNI-14/F-UNI-18: this module owns live-day verbs and match-state writes;
 * it does not own another match-detail component. The shared inspector decides
 * presentation while Live Day supplies only the actions it is entitled to.
 */
import { can, type RunActionKind } from '../runtime/runMachine';
import type { RunMatch } from '../runtime/runModel';
import { useConfirmClick } from '../../../hooks/useConfirmClick';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { READ_ONLY_MESSAGE } from '../../../platform/domain/permissions';
import { INTERACTIVE_BASE } from '../../../lib/utils';

const actionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded border border-border bg-card ` +
  `px-2 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground`;
const primaryBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded bg-accent px-2 py-1 ` +
  `text-2xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110`;
const armedBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded bg-destructive px-2 py-1 ` +
  `text-2xs font-medium text-destructive-foreground hover:brightness-110`;

export interface RunMatchControlProps {
  match: RunMatch;
  role: 'now' | 'next-later' | 'queued' | null;
  nowRef?: { code: string; court: number };
  freeCourt?: number;
  suppressRecord?: boolean;
  onAction: (kind: RunActionKind, opts?: { winnerSide?: 'A' | 'B'; court?: number }) => void;
}

export function RunAssignmentActions({
  match,
  role,
  nowRef,
  freeCourt,
  onAction,
}: RunMatchControlProps) {
  const canEdit = useCanEdit();

  if (role === 'queued') {
    return freeCourt != null ? (
      <button
        type="button"
        data-testid="run-act-send"
        className={primaryBtn}
        disabled={!canEdit}
        title={canEdit ? undefined : READ_ONLY_MESSAGE}
        onClick={() => onAction('assign', { court: freeCourt })}
      >
        Send to C{freeCourt}
      </button>
    ) : (
      <p className="text-sm text-muted-foreground">No court is free yet. Waiting for one to clear.</p>
    );
  }

  if (role === 'next-later' && nowRef) {
    return (
      <p className="text-sm text-muted-foreground">
        Queued behind {nowRef.code} on C{nowRef.court}. Advances when the court clears.
      </p>
    );
  }

  if (role === 'now' && can(match.status, 'postpone')) {
    return (
      <div>
        <button
          type="button"
          data-testid="run-act-postpone"
          className={actionBtn}
          disabled={!canEdit}
          title={canEdit ? undefined : READ_ONLY_MESSAGE}
          onClick={() => onAction('postpone')}
        >
          Postpone
        </button>
        <p className="mt-2 text-2xs text-muted-foreground">
          Returns the match to the queue. Nothing is lost.
        </p>
      </div>
    );
  }

  return null;
}

export function RunResultActions({ match, role, onAction, suppressRecord }: RunMatchControlProps) {
  const canEdit = useCanEdit();
  const record = useConfirmClick(() => onAction('record'));

  if (role !== 'now') return null;

  const showCall = can(match.status, 'call');
  const showStart = can(match.status, 'start');
  const showRecord = !suppressRecord && match.source === 'meet' && can(match.status, 'record');
  if (!showCall && !showStart && !showRecord) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {showCall ? (
        <button
          type="button"
          data-testid="run-act-call"
          className={primaryBtn}
          disabled={!canEdit}
          title={canEdit ? undefined : READ_ONLY_MESSAGE}
          onClick={() => onAction('call')}
        >
          Call
        </button>
      ) : null}
      {showStart ? (
        <button
          type="button"
          data-testid="run-act-start"
          className={primaryBtn}
          disabled={!canEdit}
          title={canEdit ? undefined : READ_ONLY_MESSAGE}
          onClick={() => onAction('start')}
        >
          Start
        </button>
      ) : null}
      {showRecord ? (
        <button
          type="button"
          data-testid="run-act-record"
          className={record.armed ? armedBtn : primaryBtn}
          disabled={!canEdit}
          onClick={record.press}
          onBlur={record.reset}
          title={
            record.armed
              ? 'Press again to record the result: a finished match cannot be reopened'
              : 'Record the result: this cannot be undone'
          }
          aria-label={record.armed ? 'Confirm the result: cannot be undone' : 'Record result'}
        >
          {record.armed ? 'Press again' : 'Record result'}
        </button>
      ) : null}
    </div>
  );
}
