/**
 * runMachine — Operations adapters for the shared match lifecycle contract.
 *
 * One state machine governs Run. Every surface (board, queue, inspector,
 * band) derives action availability from `can()` and never invents its own
 * status vocabulary. `late` is a derived flag (see deriveLate), never a state.
 */
import stateMachines from '@scheduler/shared-contract/state-machines.json';
import { STATE_WORD } from '../../../lib/stateWords';
import type { MatchStatus } from '../../../platform/domain/match';

const MATCH = stateMachines.machines.match;
export type RunStatus = keyof typeof MATCH.state_keys;
export type RunActionKind = 'call' | 'start' | 'record' | 'postpone' | 'assign' | 'clearCourt';
export type MatchEvent = keyof typeof MATCH.event_keys;

/** Legal status→status edges. `assign` is a court change, not a status edge,
 *  so it is handled separately (keeps the match `scheduled`). `clearCourt` is
 *  its inverse and the same shape: it withdraws the published court while the
 *  match stays planned at its slot, so it too resolves to `scheduled`, and
 *  only from `scheduled` — a called or playing match leaves the court through
 *  `postpone`, which is a real status edge (OPR-0908-8). */
export function transition(status: RunStatus, action: RunActionKind | MatchEvent): RunStatus | null {
  if (action === 'assign' || action === 'clearCourt') {
    return status === 'scheduled' ? status : null;
  }
  const edge = MATCH.transitions.find((t) => t.from_states.includes(status) && t.event === action);
  return edge ? edge.to as RunStatus : null;
}
export function can(status: RunStatus, action: RunActionKind | MatchEvent): boolean {
  return transition(status, action) !== null;
}

export function fromEngineStatus(s: MatchStatus): RunStatus {
  if (s === 'started') return 'playing';
  return s; // scheduled | called | finished | retired
}

// Redirects to the one authority (contract §2.3/§2.4 D5): `playing` is
// "On court", never "Live" — "Live" survives only as the *lifecycle* word
// (a whole tournament section may read "Live now"; a match never does).
export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  scheduled: STATE_WORD.scheduled,
  called: STATE_WORD.called,
  playing: STATE_WORD.onCourt,
  finished: STATE_WORD.done,
  retired: STATE_WORD.retired,
};

/**
 * How far past its planned start a waiting match is.
 *
 * Thresholds are in SLOTS, not minutes, because `currentSlot` is a floored
 * slot index (`lib/time.ts#getCurrentSlot`) — with the default 30-minute
 * slot, minute-based thresholds could only ever read 0 or 30, so an amber
 * tier expressed in minutes would never appear.
 *
 *   0 slots past  -> 'due'      the slot has arrived; not an alarm
 *   1 slot past   -> 'late'     amber
 *   2+ slots past -> 'overdue'  red
 *
 * This is why the board used to render "LATE +0": the old boolean was
 * `currentSlot >= plannedSlot`, so a match went late the instant its own
 * slot began. `+0` was always the due case, never a late one.
 */
export type Timeliness = 'ontime' | 'due' | 'late' | 'overdue';

export function deriveTimeliness(input: {
  status: RunStatus;
  plannedSlot?: number;
  currentSlot?: number;
}): Timeliness {
  const { status, plannedSlot, currentSlot } = input;
  if (status !== 'scheduled' && status !== 'called') return 'ontime';
  if (plannedSlot == null || currentSlot == null) return 'ontime';
  const slotsPast = currentSlot - plannedSlot;
  if (slotsPast < 0) return 'ontime';
  if (slotsPast === 0) return 'due';
  if (slotsPast === 1) return 'late';
  return 'overdue';
}

/** Past its planned start while still waiting — the DUE tier counts, so this
 *  stays exactly as wide as it was before the tiers existed. Callers that
 *  need to tell DUE from LATE want `deriveTimeliness`. Pure. */
export function deriveLate(input: { status: RunStatus; plannedSlot?: number; currentSlot?: number }): boolean {
  return deriveTimeliness(input) !== 'ontime';
}

/** Slots a playing match has run past its planned end (planned + span). Pure. */
export function deriveDriftSlots(input: {
  status: RunStatus; plannedSlot?: number; span?: number; currentSlot?: number;
}): number {
  const { status, plannedSlot, span = 1, currentSlot } = input;
  if (status !== 'playing' || plannedSlot == null || currentSlot == null) return 0;
  return Math.max(0, currentSlot - (plannedSlot + span));
}

/** Finished is reopenable; both finished and retired leave the active queues. */
export function isRunComplete(status: RunStatus): boolean {
  return status === 'finished' || status === 'retired';
}
