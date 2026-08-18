/**
 * runMachine — the Operations-owned match lifecycle contract.
 *
 * One state machine governs Run. Every surface (board, queue, inspector,
 * band) derives action availability from `can()` and never invents its own
 * status vocabulary. `late` is a derived flag (see deriveLate), never a state.
 */
import { STATE_WORD } from '../../../lib/stateWords';

export type RunStatus = 'scheduled' | 'called' | 'playing' | 'done';
export type RunActionKind = 'call' | 'start' | 'record' | 'postpone' | 'assign';

/** Legal status→status edges. `assign` is a court change, not a status edge,
 *  so it is handled separately (keeps the match `scheduled`). */
const TRANSITIONS: Record<RunStatus, Partial<Record<RunActionKind, RunStatus>>> = {
  scheduled: { call: 'called', assign: 'scheduled' },
  called: { start: 'playing', postpone: 'scheduled' },
  playing: { record: 'done', postpone: 'scheduled' },
  done: {},
};

export function transition(status: RunStatus, action: RunActionKind): RunStatus | null {
  return TRANSITIONS[status][action] ?? null;
}
export function can(status: RunStatus, action: RunActionKind): boolean {
  return transition(status, action) !== null;
}

export function fromEngineStatus(s: 'scheduled' | 'called' | 'started' | 'finished'): RunStatus {
  if (s === 'started') return 'playing';
  if (s === 'finished') return 'done';
  return s; // scheduled | called
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  scheduled: STATE_WORD.scheduled,
  called: STATE_WORD.called,
  playing: STATE_WORD.live,
  done: STATE_WORD.done,
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
