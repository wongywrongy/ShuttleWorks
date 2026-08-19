/**
 * PlanToolbar — the Plan header's action cluster (SP-CONSOLE-4 B1).
 *
 * Everything that BUILDS or MUTATES the plan lives here, in tempo order
 * (R-H: schedule-mutation → Plan; dispatch → Floor):
 *
 *   solve group   — Generate meet / Re-plan day (armed re-solve; hardened
 *                   copy once the day is live) · Re-optimize remaining
 *                   (frozen-horizon, live day's verb — pins started/finished,
 *                   solves around bracket windows) · Schedule next round
 *   proposals     — Report a problem (repair) · Director tools ·
 *                   Re-plan, stay close (warm restart)
 *   exports       — meet XLSX + bracket JSON/CSV/ICS behind one Export menu
 *   commit        — Mark plan ready (the one glowing button)
 *
 * Lifecycle (CMP-1 via `opsPlanMode`): COMPLETE renders review mode — the
 * solve and proposal groups are ABSENT (no remaining day to re-plan);
 * exports stay (the record is what review is for).
 *
 * Read-only guard: every mutating button disables for viewers
 * (`useCanEdit`) with the canonical message — the guard the unified
 * Generate button lost in the first cut. `useProposals` re-guards the
 * proposal flows on the write path.
 */
import { useMemo, useRef, useState } from 'react';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import { useSchedule } from '../../../hooks/useSchedule';
import { useLiveOperations } from '../../../hooks/useLiveOperations';
import { useConfirmClick } from '../../../hooks/useConfirmClick';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { useTournamentId } from '../../../hooks/useTournamentId';
import { apiClient } from '../../../api/client';
import { READ_ONLY_MESSAGE } from '../../../platform/domain/permissions';
import { exportScheduleXlsx } from '../exports/scheduleXlsx';
import { PickerPopover } from '../../../components/control-plane';
import { INTERACTIVE_BASE } from '../../../lib/utils';
import type { WorkspacePhase } from '../../../platform/domain/lifecycle';
import { opsPlanMode } from '../lifecycleMatrix';
import type { PlanDialog } from './planDialogs';

const schedBtnBase =
  `${INTERACTIVE_BASE} inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-sm px-2.5 py-1 text-xs ` +
  `font-medium disabled:cursor-not-allowed disabled:opacity-50`;
const commitBtn =
  `${schedBtnBase} bg-accent text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110`;
const solveBtn =
  `${schedBtnBase} border border-border-control bg-card text-foreground hover:bg-muted/40`;
const solveArmedBtn =
  `${schedBtnBase} border border-destructive bg-destructive/10 text-destructive`;
const finalizedPillBtn =
  'inline-flex items-center rounded-full border border-status-done/30 bg-status-done/10 px-2.5 py-0.5 text-xs font-medium text-status-done transition-colors duration-fast ease-brand hover:bg-status-done/20';

export interface PlanToolbarProps {
  phase: WorkspacePhase | null;
  /** Which engines this workspace runs — meet actions and bracket actions
   *  each render only for workspaces that have the engine. */
  meetEnabled: boolean;
  bracketEnabled: boolean;
  /** Courts the bracket occupies, for the meet solve (parent's snapshot). */
  bracketWindows: number[][];
  schedulableCount: number;
  onOpenScheduleNext: () => void;
  planFinalized: boolean;
  planFinalizePending: boolean;
  onTogglePlanFinalized: () => void;
  onOpenDialog: (dialog: PlanDialog) => void;
}

export function PlanToolbar({
  phase,
  meetEnabled,
  bracketEnabled,
  bracketWindows,
  schedulableCount,
  onOpenScheduleNext,
  planFinalized,
  planFinalizePending,
  onTogglePlanFinalized,
  onOpenDialog,
}: PlanToolbarProps) {
  const canEdit = useCanEdit();
  const schedule = useTournamentStore((s) => s.schedule);
  const config = useTournamentStore((s) => s.config);
  const matches = useTournamentStore((s) => s.matches);
  const players = useTournamentStore((s) => s.players);
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const { generateSchedule, loading: generating } = useSchedule();
  const { triggerReoptimize, isReoptimizing } = useLiveOperations();

  // The legacy live-day guard, verbatim semantics: once any match has left
  // `scheduled`, a full re-plan is a destructive act — the armed copy says
  // so instead of inviting a casual re-plan.
  const liveDay = useMemo(
    () => Object.values(matchStates).some((ms) => ms.status && ms.status !== 'scheduled'),
    [matchStates],
  );

  const reSolve = useConfirmClick(() => void generateSchedule(bracketWindows));

  const [exportOpen, setExportOpen] = useState(false);
  const exportAnchor = useRef<HTMLDivElement | null>(null);
  const tid = useTournamentId();

  const review = opsPlanMode(phase) === 'plan-review';
  const busy = generating || isReoptimizing;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="plan-toolbar">
      {review ? (
        <span data-testid="plan-review-note" className="text-2xs text-muted-foreground">
          Day complete · reviewing the plan it ran
        </span>
      ) : (
        <>
          {meetEnabled ? (
            <>
              <button
                type="button"
                className={reSolve.armed ? solveArmedBtn : solveBtn}
                onClick={() => {
                  // Only a RE-solve arms: solving for the first time destroys
                  // nothing, and arming it would teach the operator to click
                  // twice out of habit.
                  if (schedule) reSolve.press();
                  else void generateSchedule(bracketWindows);
                }}
                onBlur={reSolve.reset}
                disabled={busy || !canEdit}
                data-testid="ops-generate-meet"
                title={
                  !canEdit
                    ? READ_ONLY_MESSAGE
                    : schedule
                      ? liveDay
                        ? 'Re-plan the day: matches have already run, so this replaces the rest of the plan'
                        : 'Re-plan the day: replaces the current plan'
                      : 'Solve the meet and place its matches'
                }
              >
                {generating
                  ? 'Generating…'
                  : reSolve.armed
                    ? liveDay
                      ? 'Press again: matches have started'
                      : 'Press again to replace the plan'
                    : schedule
                      ? 'Re-plan day'
                      : 'Generate meet'}
              </button>
              {/* The live day's solve verb: keep everything started or
                  finished exactly where it is, re-place only the rest.
                  Frozen-horizon — the migrated legacy Re-optimize. */}
              {phase === 'live' && schedule ? (
                <button
                  type="button"
                  className={solveBtn}
                  onClick={() => void triggerReoptimize()}
                  disabled={busy || !canEdit}
                  data-testid="ops-reoptimize"
                  title={
                    canEdit
                      ? 'Re-solve the remaining day; started and finished matches stay put'
                      : READ_ONLY_MESSAGE
                  }
                >
                  {isReoptimizing ? 'Re-optimizing…' : 'Re-optimize remaining'}
                </button>
              ) : null}
              {schedule && !reSolve.armed && !generating ? (
                <span data-testid="ops-replan-note" className="text-2xs text-muted-foreground">
                  A schedule is in place; Re-plan day replaces it.
                </span>
              ) : null}
            </>
          ) : null}

          {bracketEnabled && schedulableCount > 0 ? (
            <button
              type="button"
              className={solveBtn}
              onClick={onOpenScheduleNext}
              data-testid="ops-schedule-next"
            >
              Schedule next round ({schedulableCount})
            </button>
          ) : null}

          {meetEnabled && schedule ? (
            <>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
              {/* Proposal economy — every flow previews a diff and commits
                  atomically (useProposals two-phase). "Report a problem" is
                  the operator's verb for the repair flow: they report what
                  happened (withdrawal / court closed / overrun / cancel);
                  the system proposes the repair. */}
              <button
                type="button"
                className={solveBtn}
                onClick={() => onOpenDialog({ kind: 'disruption' })}
                disabled={!canEdit}
                data-testid="ops-report-problem"
                title={canEdit ? undefined : READ_ONLY_MESSAGE}
              >
                Report a problem
              </button>
              <button
                type="button"
                className={solveBtn}
                onClick={() => onOpenDialog({ kind: 'director' })}
                disabled={!canEdit}
                data-testid="ops-director-tools"
                title={canEdit ? undefined : READ_ONLY_MESSAGE}
              >
                Director tools
              </button>
              <button
                type="button"
                className={solveBtn}
                onClick={() => onOpenDialog({ kind: 'warm-restart' })}
                disabled={!canEdit}
                data-testid="ops-warm-restart"
                title={
                  canEdit
                    ? 'Re-plan with a stay-close weight: fewest moves that still fix the day'
                    : READ_ONLY_MESSAGE
                }
              >
                Re-plan, stay close
              </button>
            </>
          ) : null}
        </>
      )}

      {(meetEnabled && schedule) || bracketEnabled ? (
        <PickerPopover open={exportOpen} onOpenChange={setExportOpen}>
          <PickerPopover.Anchor asChild>
            <div ref={exportAnchor}>
              <button
                type="button"
                className={solveBtn}
                onClick={() => setExportOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={exportOpen}
                data-testid="ops-export"
              >
                Export
              </button>
            </div>
          </PickerPopover.Anchor>
          <PickerPopover.Panel aria-label="Export" align="end" className="w-56" guardRef={exportAnchor}>
            <div className="flex flex-col gap-0.5 p-1">
              {meetEnabled && schedule ? (
                <button
                  type="button"
                  className="rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted/40"
                  data-testid="ops-export-xlsx"
                  onClick={() => {
                    void exportScheduleXlsx(schedule, matches, players, config);
                    setExportOpen(false);
                  }}
                >
                  Meet schedule · XLSX
                </button>
              ) : null}
              {bracketEnabled
                ? (
                    // Optional-called: unit tests mock apiClient partially,
                    // and a URL builder is not worth a render crash.
                    [
                      ['JSON', apiClient.bracketExportJsonUrl?.(tid) ?? '#'],
                      ['CSV', apiClient.bracketExportCsvUrl?.(tid) ?? '#'],
                      ['ICS', apiClient.bracketExportIcsUrl?.(tid) ?? '#'],
                    ] as const
                  ).map(([label, url]) => (
                    <a
                      key={label}
                      href={url}
                      download
                      className="rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-muted/40"
                      data-testid={`ops-export-${label.toLowerCase()}`}
                      onClick={() => setExportOpen(false)}
                    >
                      Bracket · {label}
                    </a>
                  ))
                : null}
            </div>
          </PickerPopover.Panel>
        </PickerPopover>
      ) : null}

      {!review ? (
        <>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            className={planFinalized ? finalizedPillBtn : commitBtn}
            onClick={onTogglePlanFinalized}
            disabled={planFinalizePending || !canEdit}
            aria-busy={planFinalizePending}
            title={
              !canEdit
                ? READ_ONLY_MESSAGE
                : planFinalized
                  ? 'Press to un-ready the plan'
                  : undefined
            }
            data-testid="ops-plan-finalize-toggle"
          >
            {planFinalized ? 'Plan ready ✓' : 'Mark plan ready'}
          </button>
        </>
      ) : null}
    </div>
  );
}
