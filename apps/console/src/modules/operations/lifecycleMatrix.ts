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
