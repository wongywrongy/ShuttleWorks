/**
 * RunInspector — context-dependent match inspector for the Run surface.
 *
 * Shows match identity + state + the VALID actions for whatever is selected,
 * driven by the Run state machine's `can()` predicate.
 *
 * Pure pane CONTENT: `RunSurface` mounts it inside a `DetailPanel` (identity
 * header, close, dismissal) inside a `DetailDock` (width, narrow fallback).
 * Every group here is a `DetailPanel.Section`; the rail used to be one
 * `space-y-3 p-4` stack of eight unlabelled fields carrying its own private
 * copy of the eyebrow recipe plus two inline re-types. One recipe, imported.
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
import { useCanEdit } from '../../../hooks/useCanEdit';
import { READ_ONLY_MESSAGE } from '../../../platform/domain/permissions';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../../lib/utils';
import { DetailPanel } from '../../../components/control-plane';
import { SourceChip } from '../../../components/SourceChip';
import { Row } from '../../../platform/engine-config/SettingsControls';

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

// ── status pill (RunStatus → token class) ────────────────────────────────
const STATUS_PILL: Record<RunStatus, string> = {
  scheduled: 'text-muted-foreground',
  called: 'text-status-called font-semibold',
  playing: 'text-status-live font-semibold',
  done: 'text-status-done font-semibold',
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
  /** Suppress the static Players section — set when a richer panel below
   *  (the meet rail) renders the interactive player rows instead. */
  hidePlayers?: boolean;
}

// ── root ──────────────────────────────────────────────────────────────────
export function RunInspector({
  match,
  role,
  nowRef,
  freeCourt,
  currentSlot,
  formatSlot,
  onAction,
  hidePlayers,
}: RunInspectorProps) {
  // A viewer may not drive the live day (audit A2): every action button
  // carries the `disabled` vocabulary — the command-queue seam refuses as
  // the backstop for anything this misses.
  const canEdit = useCanEdit();
  // Empty / unselected state
  if (!match || !role) {
    return (
      <aside data-testid="run-inspector" className="w-full p-4 text-sm text-muted-foreground">
        <p data-testid="run-inspector-empty">
          Select a match to call it to a court, start play, or record the result.
        </p>
      </aside>
    );
  }

  return (
    <aside data-testid="run-inspector" className="w-full">
      <StatusSection match={match} currentSlot={currentSlot} formatSlot={formatSlot} />

      {!hidePlayers && (
        <DetailPanel.Section eyebrow="Players" testId="run-inspector-players">
          <div className="space-y-1">
            <div className="text-sm text-foreground">{match.sideA}</div>
            <div className={`${EYEBROW_CLASS} text-muted-foreground`}>vs</div>
            <div className="text-sm text-foreground">{match.sideB}</div>
          </div>
        </DetailPanel.Section>
      )}

      {role === 'now' && <NowActions match={match} onAction={onAction} canEdit={canEdit} />}

      {role === 'next-later' && nowRef && (
        <DetailPanel.Section eyebrow="Actions" testId="run-inspector-actions">
          <p className="text-sm text-muted-foreground">
            Queued behind {nowRef.code} on C{nowRef.court}. Advances when the court clears.
          </p>
        </DetailPanel.Section>
      )}

      {role === 'queued' && (
        <DetailPanel.Section eyebrow="Actions" testId="run-inspector-actions">
          {freeCourt != null ? (
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
            <p className="text-sm text-muted-foreground">
              No court is free yet. Waiting for one to clear.
            </p>
          )}
        </DetailPanel.Section>
      )}
    </aside>
  );
}

/**
 * Record result — the one TERMINAL action on this rail.
 *
 * `runMachine`'s `done` has no outgoing edge and Meet ships no reopen, so this
 * press cannot be taken back; Postpone can. Three guards carry that difference:
 * the canon two-click arm (`useConfirmClick`, same as bracket's `WinnerButton`
 * — `window.confirm` is banned and blocks the event loop); accent weight when
 * idle, destructive when armed, while Postpone keeps the neutral border; and
 * DISTANCE — Postpone now sits in its own section rather than 10px away in the
 * same flex row, which is a misclick rather than a decision.
 */
function RecordButton({ onRecord, disabled }: { onRecord: () => void; disabled?: boolean }) {
  const confirm = useConfirmClick(onRecord);
  return (
    <button
      type="button"
      data-testid="run-act-record"
      className={confirm.armed ? armedBtn : primaryBtn}
      disabled={disabled}
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

// ── status section ────────────────────────────────────────────────────────
// The engine is named by the shared `SourceChip` ("Meet" / "Bracket") rather
// than this file's own abbreviation table, which said "Brkt" while the queue
// square beside it said "B". One vocabulary.
function StatusSection({
  match,
  currentSlot,
  formatSlot,
}: {
  match: RunMatch;
  currentSlot?: number;
  formatSlot?: (slot: number) => string;
}) {
  const slotLabel =
    match.plannedSlot != null
      ? (formatSlot ? formatSlot(match.plannedSlot) : `S${match.plannedSlot}`)
      : null;
  const driftSlots = deriveDriftSlots({
    status: match.status,
    plannedSlot: match.plannedSlot,
    span: match.span,
    currentSlot,
  });

  return (
    <DetailPanel.Section eyebrow="Status" testId="run-inspector-status">
      <Row pane
        label="State"
        control={
          <span className={`${EYEBROW_CLASS} ${STATUS_PILL[match.status]}`}>
            {RUN_STATUS_LABEL[match.status]}
          </span>
        }
      />
      {/* The engine badge used to ride the section's right slot, where it read
          as the section's own value — a second, unlabeled status. It is a
          different fact about the match, so it gets a labeled row like every
          other fact (LIVE-4). */}
      <Row pane label="Source" control={<SourceChip source={match.source} />} />
      <Row pane
        label="Court"
        control={
          <span className="sw-num text-sm text-foreground">
            {match.court != null ? `C${match.court}` : 'Not on a court'}
          </span>
        }
      />
      <Row pane
        label="Planned"
        control={
          <span className="sw-num text-sm text-foreground">{slotLabel ?? 'Not planned'}</span>
        }
        last
      />
      {/* Drift — only when playing and running over */}
      {driftSlots > 0 && (
        <p className={`${EYEBROW_CLASS} pt-2 text-status-warning`}>Running over</p>
      )}
    </DetailPanel.Section>
  );
}

// ── now-role action sections ──────────────────────────────────────────────
// Candidate set: call, start, record, postpone (never assign — that is for
// queued). Each button renders iff can(status, kind) is true. Postpone gets
// its OWN section: separated, not armed — arming a reversible action teaches
// the operator that the arm means nothing.
function NowActions({
  match,
  onAction,
  canEdit,
}: {
  match: RunMatch;
  onAction: RunInspectorProps['onAction'];
  canEdit: boolean;
}) {
  const showCall = can(match.status, 'call');
  const showStart = can(match.status, 'start');
  // Record — playing only, and MEET only. A playing bracket match is recorded
  // in the bracket's own MatchDetailPanel, which RunSurface mounts below this
  // rail: set-by-set scores, Undo start, and the canon armed winner buttons
  // labelled with the real side names.
  const showRecord = match.source === 'meet' && can(match.status, 'record');
  const showPostpone = can(match.status, 'postpone');

  return (
    <>
      {(showCall || showStart || showRecord) && (
        <DetailPanel.Section eyebrow="Actions" testId="run-inspector-actions">
          <div className="flex flex-wrap gap-2">
            {showCall && (
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
            )}
            {showStart && (
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
            )}
            {showRecord && <RecordButton onRecord={() => onAction('record')} disabled={!canEdit} />}
          </div>
        </DetailPanel.Section>
      )}

      {showPostpone && (
        <DetailPanel.Section eyebrow="Reschedule" testId="run-inspector-reschedule">
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
        </DetailPanel.Section>
      )}
    </>
  );
}
