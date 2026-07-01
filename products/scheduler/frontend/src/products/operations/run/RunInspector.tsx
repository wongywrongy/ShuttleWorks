/**
 * RunInspector — context-dependent match inspector for the Run surface.
 *
 * Shows match identity + state + the VALID actions for whatever is selected,
 * driven by the Run state machine's `can()` predicate. Visual design matches
 * the OpsDetailRail idiom: same token vocabulary, button styles, eyebrow
 * labels, and status pill colours.
 *
 * Role semantics:
 *   now        → the court's current match; full lifecycle buttons
 *   next-later → match queued behind a Now match on the same court
 *   queued     → match not yet on a court; may offer "Send to court"
 *   null       → nothing selected; invitation text
 */
import {
  can,
  RUN_STATUS_LABEL,
  deriveDriftSlots,
  type RunStatus,
  type RunActionKind,
} from '../runtime/runMachine';
import type { RunMatch } from '../runtime/runModel';
import { INTERACTIVE_BASE } from '../../../lib/utils';

// ── button styles (mirrors OpsDetailRail) ────────────────────────────────
const actionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded border border-border bg-card ` +
  `px-2 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground`;
const primaryBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded bg-primary px-2 py-1 ` +
  `text-2xs font-medium text-primary-foreground hover:opacity-90`;

// ── typography constants ──────────────────────────────────────────────────
const EYEBROW = 'text-2xs uppercase tracking-[0.16em] text-muted-foreground';

// ── status pill (RunStatus → token class) ────────────────────────────────
const STATUS_PILL: Record<RunStatus, string> = {
  scheduled: 'text-muted-foreground',
  called: 'text-status-called font-semibold',
  playing: 'text-status-live font-semibold',
  done: 'text-status-done font-semibold',
};

// ── source dot / label (mirrors RunBoard / RunQueue) ──────────────────────
const SOURCE_DOT: Record<'meet' | 'bracket', string> = {
  meet: 'bg-sky-500',
  bracket: 'bg-violet-500',
};
const SOURCE_LABEL: Record<'meet' | 'bracket', string> = {
  meet: 'Meet',
  bracket: 'Brkt',
};

// ── props ─────────────────────────────────────────────────────────────────
export interface RunInspectorProps {
  /** The selected match; null means nothing is selected. */
  match: RunMatch | null;
  /** Position role of the selected match in the Run layout. */
  role: 'now' | 'next-later' | 'queued' | null;
  /** For a next-later match: the Now match it waits behind. */
  nowRef?: { code: string; court: number };
  /** A court with an empty lane, if any (for queued Send action). */
  freeCourt?: number;
  /** Current time slot (for drift display on playing matches). */
  currentSlot?: number;
  /** slot→label formatter; falls back to `S{slot}` when absent. */
  formatSlot?: (slot: number) => string;
  /** Action dispatcher. */
  onAction: (kind: RunActionKind, opts?: { winnerSide?: 'A' | 'B'; court?: number }) => void;
}

// ── root ──────────────────────────────────────────────────────────────────
const RAIL =
  'w-72 flex-shrink-0 space-y-3 overflow-auto border-l border-border p-4';

export function RunInspector({
  match,
  role,
  nowRef,
  freeCourt,
  currentSlot,
  formatSlot,
  onAction,
}: RunInspectorProps) {
  // Empty / unselected state
  if (!match || !role) {
    return (
      <aside data-testid="run-inspector" className={`${RAIL} text-sm text-muted-foreground`}>
        <p data-testid="run-inspector-empty">
          Select a match to call it to a court, start play, or record the result.
        </p>
      </aside>
    );
  }

  return (
    <aside data-testid="run-inspector" className={RAIL}>
      {/* Identity header (shown for all roles) */}
      <MatchIdentity match={match} formatSlot={formatSlot} />

      {/* Role-specific content */}
      {role === 'now' && (
        <NowActions match={match} currentSlot={currentSlot} onAction={onAction} />
      )}

      {role === 'next-later' && nowRef && (
        <p className="text-sm text-muted-foreground">
          Queued behind {nowRef.code} on C{nowRef.court} — advances when the court clears.
        </p>
      )}

      {role === 'queued' && (
        freeCourt != null ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="run-act-send"
              className={primaryBtn}
              onClick={() => onAction('assign', { court: freeCourt })}
            >
              Send to C{freeCourt}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No court is free — waits for one to clear.
          </p>
        )
      )}
    </aside>
  );
}

// ── match identity section ────────────────────────────────────────────────
function MatchIdentity({
  match,
  formatSlot,
}: {
  match: RunMatch;
  formatSlot?: (slot: number) => string;
}) {
  const slotLabel =
    match.plannedSlot != null
      ? (formatSlot ? formatSlot(match.plannedSlot) : `S${match.plannedSlot}`)
      : null;

  return (
    <div className="space-y-2">
      {/* Source dot + eyebrow + match code */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`h-2 w-2 flex-shrink-0 rounded-full ${SOURCE_DOT[match.source]}`}
          title={SOURCE_LABEL[match.source]}
        />
        <span className={EYEBROW}>{SOURCE_LABEL[match.source]}</span>
        <span className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">
          {match.label}
        </span>
      </div>

      {/* Status pill */}
      <div className={`${EYEBROW} ${STATUS_PILL[match.status]}`}>
        {RUN_STATUS_LABEL[match.status]}
      </div>

      {/* Court + planned slot */}
      {(match.court != null || slotLabel != null) && (
        <div className="font-mono text-sm text-foreground">
          {match.court != null && `C${match.court}`}
          {match.court != null && slotLabel && ' · '}
          {slotLabel}
        </div>
      )}

      {/* Per-side players */}
      <div className="space-y-1">
        <div className="text-sm text-foreground">{match.sideA}</div>
        <div className={`${EYEBROW} text-2xs`}>vs</div>
        <div className="text-sm text-foreground">{match.sideB}</div>
      </div>
    </div>
  );
}

// ── now-role action buttons ───────────────────────────────────────────────
// Candidate set: call, start, record, postpone (never assign — that is for queued).
// Each button is rendered iff can(status, kind) is true.
function NowActions({
  match,
  currentSlot,
  onAction,
}: {
  match: RunMatch;
  currentSlot?: number;
  onAction: RunInspectorProps['onAction'];
}) {
  const driftSlots = deriveDriftSlots({
    status: match.status,
    plannedSlot: match.plannedSlot,
    span: match.span,
    currentSlot,
  });

  return (
    <div className="space-y-2">
      {/* Drift indicator — only when playing and running over */}
      {driftSlots > 0 && (
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-status-warning">
          Running over
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Call — scheduled only */}
        {can(match.status, 'call') && (
          <button
            type="button"
            data-testid="run-act-call"
            className={primaryBtn}
            onClick={() => onAction('call')}
          >
            Call
          </button>
        )}

        {/* Start — called only */}
        {can(match.status, 'start') && (
          <button
            type="button"
            data-testid="run-act-start"
            className={primaryBtn}
            onClick={() => onAction('start')}
          >
            Start
          </button>
        )}

        {/* Record — playing only; engine-specific presentation */}
        {can(match.status, 'record') && (
          match.source === 'bracket' ? (
            <>
              <button
                type="button"
                data-testid="run-act-win-a"
                className={primaryBtn}
                onClick={() => onAction('record', { winnerSide: 'A' })}
              >
                A wins
              </button>
              <button
                type="button"
                data-testid="run-act-win-b"
                className={primaryBtn}
                onClick={() => onAction('record', { winnerSide: 'B' })}
              >
                B wins
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="run-act-record"
              className={actionBtn}
              onClick={() => onAction('record')}
            >
              Record result
            </button>
          )
        )}

        {/* Postpone — called or playing */}
        {can(match.status, 'postpone') && (
          <button
            type="button"
            data-testid="run-act-postpone"
            className={actionBtn}
            onClick={() => onAction('postpone')}
          >
            Postpone
          </button>
        )}
      </div>
    </div>
  );
}
