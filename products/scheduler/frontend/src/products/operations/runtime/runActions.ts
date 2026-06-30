/**
 * runActions — Operations Run write router.
 *
 * Routes RunActionKind → the correct backend seam (meet command queue,
 * bracket matchAction, bracket assignCourt/unassign) and guards every action
 * with the Run state machine's `can()` predicate.
 *
 * ─── BRACKET SEAM NOTES (updated 2026-06-29, Task 9b/9c) ─────────────────
 *
 * Live bracket court-ops use the non-solver endpoints added in Task 9b:
 *   - bracket `assign`   → bracketApi.assignCourt({ play_unit_id, court_id, slot_id })
 *     Directly places a play unit on a court+slot; no solver re-run; works for
 *     unscheduled units (no 409).  Backend: POST /bracket/assign-court.
 *   - bracket `postpone` → bracketApi.unassign({ play_unit_id })
 *     Removes the court assignment from a play unit, returning it to the queue;
 *     no solver, no result change.  Backend: POST /bracket/unassign.
 *
 * pinMatch (POST /bracket/pin) and matchAction('reset') are NOT used for live
 * court-ops: pinMatch re-runs CP-SAT and 409s for unscheduled units; reset
 * only clears timing fields and does not remove the court assignment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

import { can, type RunActionKind } from './runMachine';
import { nextEligible, type CourtLane, type RunMatch } from './runModel';
import type { MatchAction } from '../../../lib/commandQueue';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

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
  /** Task 9b non-solver placement — places a play unit on court+slot directly. */
  assignCourt: (body: {
    play_unit_id: string;
    court_id: number;
    slot_id: number;
  }) => Promise<unknown>;
  /** Task 9b non-solver removal — strips the court assignment, returns to queue. */
  unassign: (body: { play_unit_id: string }) => Promise<unknown>;
}

export interface RunSeams {
  /** Submit a meet command via the IndexedDB command queue. Returns the submit
   *  promise (or void) so the caller can await the round-trip — the store gets
   *  the assigned court on success, so awaiting is how an in-flight assign knows
   *  when to stop being treated as pending. */
  meetSubmit: (
    action: MatchAction,
    matchId: string,
    payload: Record<string, unknown> | undefined,
  ) => Promise<unknown> | void;
  /** Bracket engine API (partial surface — see BracketApiSeam). */
  bracketApi: BracketApiSeam;
  /** Record a bracket match result (Seam C). */
  bracketResult: (input: { matchId: string; winnerSide?: string }) => void;
  /** Toggle the Operations-local "called" flag for bracket matches. */
  setCalledBracket: (id: string, on: boolean) => void;
  /** Apply the authoritative bracket snapshot a non-solver call returns.
   *  bracketApi.matchAction/assignCourt/unassign all resolve the updated
   *  BracketTournamentDTO; applying it immediately (instead of waiting for the
   *  ~2.5s poll) is what keeps a just-assigned unit from lingering in the queue
   *  and being re-pulled onto a second court. Mirrors the Plan branch's
   *  `.then(setData)` and the Run record path's `onSettled`. */
  onBracketData: (dto: BracketTournamentDTO) => void;
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
 *   Bracket assign → bracketApi.assignCourt({ play_unit_id, court_id, slot_id })
 *   Bracket postpone → bracketApi.unassign({ play_unit_id })
 */
export function runAction(
  match: RunMatch,
  kind: RunActionKind,
  target: { court?: number; slot?: number; winnerSide?: string } | undefined,
  seams: RunSeams,
): Promise<void> {
  if (!can(match.status, kind)) return Promise.resolve();

  // Bracket non-solver calls resolve the updated snapshot — apply it, then
  // settle as Promise<void> AFTER it's applied so the caller (in-flight tracker)
  // sees the assignment reflected before it stops treating the assign as pending.
  const applyDto = (p: Promise<unknown>): Promise<void> =>
    p.then((dto) => seams.onBracketData(dto as BracketTournamentDTO)).catch(() => {});

  if (match.source === 'meet') {
    switch (kind) {
      case 'call':
        void seams.meetSubmit('call_to_court', match.id, undefined);
        return Promise.resolve();
      case 'start':
        void seams.meetSubmit('start_match', match.id, undefined);
        return Promise.resolve();
      case 'record':
        void seams.meetSubmit('finish_match', match.id, undefined);
        return Promise.resolve();
      case 'assign': {
        const court_id = target?.court ?? match.court ?? 0;
        const time_slot = target?.slot;
        // Awaitable: resolves after the submit round-trip (court set in the store
        // on success), so the in-flight overlay clears at the right moment.
        return Promise.resolve(
          seams.meetSubmit('assign_court', match.id, { court_id, time_slot }),
        ).then(() => {});
      }
      case 'postpone':
        void seams.meetSubmit('postpone_match', match.id, {});
        return Promise.resolve();
    }
  } else {
    // bracket source
    switch (kind) {
      case 'call':
        seams.setCalledBracket(match.id, true);
        return Promise.resolve();
      case 'start':
        return applyDto(seams.bracketApi.matchAction({ play_unit_id: match.id, action: 'start' }));
      case 'record':
        seams.bracketResult({ matchId: match.id, winnerSide: target?.winnerSide });
        return Promise.resolve();
      case 'assign': {
        const court_id = target?.court ?? match.court ?? 0;
        const slot_id = target?.slot ?? match.plannedSlot ?? 0;
        return applyDto(seams.bracketApi.assignCourt({ play_unit_id: match.id, court_id, slot_id }));
      }
      case 'postpone':
        return applyDto(seams.bracketApi.unassign({ play_unit_id: match.id }));
    }
  }
  return Promise.resolve();
}
