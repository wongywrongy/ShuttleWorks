/**
 * runActions — Operations Run write router.
 *
 * Routes RunActionKind → the correct backend seam (meet command queue,
 * bracket matchAction, bracket pinMatch) and guards every action with
 * the Run state machine's `can()` predicate.
 *
 * ─── BRACKET SEAM FINDINGS (verified 2026-06-29) ─────────────────────────
 *
 * 1. pinMatch TRIGGERS A FULL CP-SAT RE-SOLVE.
 *    `POST /bracket/pin` calls `driver.repin_and_resolve()` (scheduler.py:127).
 *    This re-schedules ALL non-locked bracket matches around the pinned
 *    position via the shared CP-SAT engine — wrong for a live Run assign.
 *    Additionally, `repin_and_resolve` raises ValueError for any play_unit
 *    that has no existing `state.assignments` entry (scheduler.py:157),
 *    which the route surfaces as 409 — so pinMatch CANNOT assign a queued
 *    bracket match (no assignment row yet). Live bracket auto-pull via
 *    pinMatch is therefore IMPOSSIBLE, not merely suboptimal. A non-solver
 *    single-placement endpoint is needed on the backend (follow-up work).
 *    CURRENT BEHAVIOUR: bracket `assign` calls pinMatch and will 409 for
 *    unscheduled matches. Flagged as DONE_WITH_CONCERNS.
 *
 * 2. matchAction('reset') does NOT un-assign the court.
 *    The backend reset path (brackets.py) only clears `actual_start_slot`
 *    and `actual_end_slot` on the TournamentAssignment. The assignment
 *    record (court, slot) persists — a postponed bracket match will
 *    continue to appear on its assigned court on the next poll.
 *    CURRENT BEHAVIOUR: bracket `postpone` calls matchAction({action:'reset'}).
 *    Flagged as DONE_WITH_CONCERNS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

import { can, type RunActionKind } from './runMachine';
import { nextEligible, type CourtLane, type RunMatch } from './runModel';
import type { MatchAction } from '../../../lib/commandQueue';

// Re-export so callers don't need a separate import.
export type { RunActionKind };

/** Minimal bracket API surface needed by runActions. Structural interface —
 *  lets tests pass vi.fn() mocks without importing the full BracketApi class
 *  (which has 20+ methods the mocks don't implement). */
export interface BracketApiSeam {
  matchAction: (body: {
    play_unit_id: string;
    action: 'start' | 'finish' | 'reset';
    slot?: number;
  }) => Promise<unknown>;
  pinMatch: (body: {
    play_unit_id: string;
    court_id: number;
    slot_id: number;
  }) => Promise<unknown>;
}

export interface RunSeams {
  /** Submit a meet command via the IndexedDB command queue. */
  meetSubmit: (
    action: MatchAction,
    matchId: string,
    payload: Record<string, unknown> | undefined,
  ) => void;
  /** Bracket engine API (partial surface — see BracketApiSeam). */
  bracketApi: BracketApiSeam;
  /** Record a bracket match result (Seam C). */
  bracketResult: (input: { matchId: string; winnerSide?: string }) => void;
  /** Toggle the Operations-local "called" flag for bracket matches. */
  setCalledBracket: (id: string, on: boolean) => void;
}

/**
 * Pure: the synthesized lane slot for a match newly placed on `court`.
 *
 * Returns `max(currentSlot, ...plannedSlot of that court's non-done matches) + 1`.
 * Orders the newcomer after every existing lane entry and never before "now".
 * Uses injected `currentSlot` — no clock read.
 */
export function slotForAssign(
  court: number,
  matches: RunMatch[],
  currentSlot: number,
): number {
  const courtSlots = matches
    .filter((m) => m.court === court && m.status !== 'done')
    .map((m) => m.plannedSlot)
    .filter((s): s is number => s != null);

  return Math.max(currentSlot, ...courtSlots) + 1;
}

/**
 * Pure: for each free court (`now == null`), take `nextEligible` from the
 * remaining queue — consuming it so two free courts cannot grab the same match.
 * Returns a deterministic list of `{ matchKey, court, slot }` assignments.
 * No clock read; uses injected `currentSlot`.
 */
export function planAutoPull(
  lanes: CourtLane[],
  queue: RunMatch[],
  allMatches: RunMatch[],
  currentSlot: number,
): Array<{ matchKey: string; court: number; slot: number }> {
  const result: Array<{ matchKey: string; court: number; slot: number }> = [];
  let remaining = [...queue];

  for (const lane of lanes) {
    if (lane.now != null) continue; // court is busy
    const match = nextEligible(remaining);
    if (!match) break; // queue exhausted — no more free courts can be filled
    remaining = remaining.filter((m) => m.key !== match.key);
    result.push({
      matchKey: match.key,
      court: lane.court,
      slot: slotForAssign(lane.court, allMatches, currentSlot),
    });
  }

  return result;
}

/**
 * Route a RunActionKind onto the correct backend seam.
 *
 * Guards every action with `can(match.status, kind)` — returns early on
 * illegal transitions without calling any seam. This is the single point
 * of authority for which seam handles which action.
 *
 * Seam map:
 *   Meet call → meetSubmit('call_to_court')
 *   Meet start → meetSubmit('start_match')
 *   Meet record → meetSubmit('finish_match')
 *   Meet assign → meetSubmit('assign_court', { court_id, time_slot })
 *   Meet postpone → meetSubmit('postpone_match', {})
 *   Bracket call → setCalledBracket(id, true)     [local flag only]
 *   Bracket start → bracketApi.matchAction({ action:'start' })
 *   Bracket record → bracketResult({ matchId, winnerSide })
 *   Bracket assign → bracketApi.pinMatch(...)      [CONCERN: re-solve, see top comment]
 *   Bracket postpone → bracketApi.matchAction({ action:'reset' }) [CONCERN: no unassign]
 */
export function runAction(
  match: RunMatch,
  kind: RunActionKind,
  target: { court?: number; slot?: number; winnerSide?: string } | undefined,
  seams: RunSeams,
): void {
  if (!can(match.status, kind)) return;

  if (match.source === 'meet') {
    switch (kind) {
      case 'call':
        seams.meetSubmit('call_to_court', match.id, undefined);
        break;
      case 'start':
        seams.meetSubmit('start_match', match.id, undefined);
        break;
      case 'record':
        seams.meetSubmit('finish_match', match.id, undefined);
        break;
      case 'assign': {
        const court_id = target?.court ?? match.court ?? 0;
        const time_slot = target?.slot;
        seams.meetSubmit('assign_court', match.id, { court_id, time_slot });
        break;
      }
      case 'postpone':
        seams.meetSubmit('postpone_match', match.id, {});
        break;
    }
  } else {
    // bracket source
    switch (kind) {
      case 'call':
        seams.setCalledBracket(match.id, true);
        break;
      case 'start':
        void seams.bracketApi.matchAction({ play_unit_id: match.id, action: 'start' });
        break;
      case 'record':
        seams.bracketResult({ matchId: match.id, winnerSide: target?.winnerSide });
        break;
      case 'assign': {
        // CONCERN (see top comment): pinMatch triggers a full CP-SAT re-solve
        // and cannot assign an unscheduled bracket match (409 if no assignment row).
        const court_id = target?.court ?? match.court ?? 0;
        const slot_id = target?.slot ?? match.plannedSlot ?? 0;
        void seams.bracketApi.pinMatch({ play_unit_id: match.id, court_id, slot_id });
        break;
      }
      case 'postpone':
        // CONCERN (see top comment): reset does NOT un-assign the court.
        void seams.bracketApi.matchAction({ play_unit_id: match.id, action: 'reset' });
        break;
    }
  }
}
