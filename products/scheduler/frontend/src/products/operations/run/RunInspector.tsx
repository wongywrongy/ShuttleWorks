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
import { useConfirmClick } from '../../../hooks/useConfirmClick';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../../lib/utils';

// ── button styles (mirrors OpsDetailRail) ────────────────────────────────
const actionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded border border-border bg-card ` +
  `px-2 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground`;
const primaryBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded bg-accent px-2 py-1 ` +
  `text-2xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110`;
// Armed state of a terminal action — same vocabulary as bracket's WinnerButton.
const armedBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded bg-destructive px-2 py-1 ` +
  `text-2xs font-medium text-destructive-foreground hover:brightness-110`;

// ── typography constants ──────────────────────────────────────────────────
const EYEBROW = 'text-2xs uppercase tracking-[0.08em] text-muted-foreground';

// ── status pill (RunStatus → token class) ────────────────────────────────
const STATUS_PILL: Record<RunStatus, string> = {
  scheduled: 'text-muted-foreground',
  called: 'text-status-called font-semibold',
  playing: 'text-status-live font-semibold',
  done: 'text-status-done font-semibold',
};

// ── source dot / label (mirrors RunBoard / RunQueue) ──────────────────────
const SOURCE_DOT: Record<'meet' | 'bracket', string> = {
  meet: 'bg-module-meet',
  bracket: 'bg-module-bracket',
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
// Pure rail CONTENT — geometry (width, border, the narrow-viewport overlay
// fallback) is owned by the `DetailDock` host this mounts into, exactly as
// OpsDetailRail does on the Plan branch. The former `w-72 flex-shrink-0`
// hard-coded a 288px column that never shrank, which collapsed the
// board+queue column to 0px at tablet width.
// Scrolling belongs to the dock column too: on a live bracket match the
// bracket's own MatchDetailPanel stacks below this rail in the same column.
const RAIL = 'w-full space-y-3 p-4';

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
          Queued behind {nowRef.code} on C{nowRef.court}. Advances when the court clears.
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
            No court is free yet. Waiting for one to clear.
          </p>
        )
      )}
    </aside>
  );
}

/**
 * Record result — the one TERMINAL action on this rail.
 *
 * `runMachine`'s `done` has no outgoing edge and Meet ships no reopen, so this
 * press cannot be taken back; Postpone next to it can. Two guards carry that
 * difference, both already in the codebase:
 *
 *   - the canon two-click arm (`useConfirmClick`), same as bracket's
 *     `WinnerButton`. `window.confirm` is banned here and blocks the event
 *     loop; a modal would cost a second surface on a desk used at speed. The
 *     arm decays on its own, so a stray press on a busy floor is harmless and
 *     the repeated task pays nothing extra when it goes right.
 *   - weight: accent when idle (this IS the desk's main verb), destructive
 *     when armed. Postpone keeps the neutral border, so at a glance the
 *     irreversible action is never the same shape as the reversible one.
 */
function RecordButton({ onRecord }: { onRecord: () => void }) {
  const confirm = useConfirmClick(onRecord);
  return (
    <button
      type="button"
      data-testid="run-act-record"
      className={confirm.armed ? armedBtn : primaryBtn}
      onClick={confirm.press}
      onBlur={confirm.reset}
      title={
        confirm.armed
          ? 'Press again to record the result: a finished match cannot be reopened'
          : 'Record the result: this cannot be undone'
      }
      aria-label={
        confirm.armed ? 'Confirm the result: cannot be undone' : 'Record result'
      }
    >
      {confirm.armed ? 'Press again' : 'Record result'}
    </button>
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
        <span className="sw-num text-2xs uppercase tracking-[0.08em] text-muted-foreground">
          {match.label}
        </span>
      </div>

      {/* Status pill */}
      <div className={`${EYEBROW} ${STATUS_PILL[match.status]}`}>
        {RUN_STATUS_LABEL[match.status]}
      </div>

      {/* Court + planned slot */}
      {(match.court != null || slotLabel != null) && (
        <div className="sw-num text-sm text-foreground">
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
        <p className={`${EYEBROW_CLASS} text-status-warning`}>
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

        {/* Record — playing only, and MEET only. A playing bracket match is
            recorded in the bracket's own MatchDetailPanel, which RunSurface
            mounts below this rail: it carries set-by-set scores, Undo start,
            and the canon armed winner buttons labelled with the real side
            names. Two identical accent buttons reading "A wins"/"B wins" four
            pixels apart used to live here instead. */}
        {match.source === 'meet' && can(match.status, 'record') && (
          <RecordButton onRecord={() => onAction('record')} />
        )}

        {/* Postpone — called or playing. Reversible (it just returns the match
            to the queue), so it stays one press and keeps the neutral border:
            the accent weight belongs to the action that cannot be taken back. */}
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
