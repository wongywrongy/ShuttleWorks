/**
 * lifecycleMatrix — the CMP-1 route/state matrix (SP-CONSOLE-4 B2).
 *
 * Operations was lifecycle-blind: neither `ModuleOutlet` nor
 * `OperationsProduct` read `signals.phase`, so a COMPLETE workspace still
 * offered "Re-plan day" and a LIVE one still led with Plan. This module is
 * the one place phase maps to Operations behavior:
 *
 *   phase      | default segment | Plan surface
 *   -----------|-----------------|--------------------------------------
 *   setup      | Plan            | full planning (solve + proposals)
 *   ready      | Plan            | full planning (solve + proposals)
 *   live       | Floor (live)    | planning; full re-plan copy hardens
 *   complete   | Plan            | REVIEW — solver + proposal actions absent
 *
 * `phase` is the server-derived `signals.phase` cached on the uiStore by
 * `useTournamentKind` (re-polled ~30s) — the same source the shell badge
 * and hub facets read. `null`/unknown behaves as setup (the
 * `resolvePhase` convention).
 */
import type { WorkspacePhase } from '../../platform/domain/lifecycle';
import type { AppTab } from '../../store/uiStore';

export type OpsPlanMode = 'plan' | 'plan-review';

/** Which Operations segment a workspace class leads with, by phase —
 *  LIVE days land on the Floor, everything else on Plan. `opsBracket`
 *  mirrors `buildWorkspaceNav`'s segment choice for the workspace class. */
export function defaultOperationsSegment(
  phase: WorkspacePhase | null | undefined,
  opsBracket: boolean,
): AppTab {
  const live = phase === 'live';
  if (opsBracket) return live ? 'bracket-live' : 'bracket-schedule';
  return live ? 'live' : 'schedule';
}

/** COMPLETE reviews the day it ran: the board and list stay readable, but
 *  solver and proposal actions are absent — there is no remaining day to
 *  re-plan, and a stray "Re-plan day" on a finished workspace is exactly
 *  the destructive-by-accident press the matrix exists to prevent. */
export function opsPlanMode(phase: WorkspacePhase | null | undefined): OpsPlanMode {
  return phase === 'complete' ? 'plan-review' : 'plan';
}

/** Whether Run's header shows the plan-readiness chips at all (SP-OPCON-1
 *  SWP-1). On a COMPLETE day there is no plan left to finalize: "Plan not
 *  finalized · Open Plan" over 155/155 played matches is a demand to prepare
 *  a day that already happened (evidence S19), and the finalized variant's
 *  "ready for live day" is equally stale. Every other phase keeps both —
 *  the handoff indicator is the point of the chip while a day is upcoming
 *  or running. The fuller lifecycle matrix for `planFinalized`'s OTHER
 *  consumers (lateness/running semantics in RunSurface) is ledger-noted,
 *  not changed here. */
export function showPlanReadinessChips(
  phase: WorkspacePhase | null | undefined,
): boolean {
  return phase !== 'complete';
}
