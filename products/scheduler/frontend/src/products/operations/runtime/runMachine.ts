/**
 * runMachine — the Operations-owned match lifecycle contract.
 *
 * One state machine governs Run. Every surface (board, queue, inspector,
 * band) derives action availability from `can()` and never invents its own
 * status vocabulary. `late` is a derived flag (see deriveLate), never a state.
 */
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
  scheduled: 'Scheduled',
  called: 'Called',
  playing: 'Playing',
  done: 'Done',
};

/** Late = past planned start while still waiting. Cleared on play. Pure. */
export function deriveLate(input: { status: RunStatus; plannedSlot?: number; currentSlot?: number }): boolean {
  const { status, plannedSlot, currentSlot } = input;
  if (status !== 'scheduled' && status !== 'called') return false;
  if (plannedSlot == null || currentSlot == null) return false;
  return currentSlot >= plannedSlot;
}

/** Slots a playing match has run past its planned end (planned + span). Pure. */
export function deriveDriftSlots(input: {
  status: RunStatus; plannedSlot?: number; span?: number; currentSlot?: number;
}): number {
  const { status, plannedSlot, span = 1, currentSlot } = input;
  if (status !== 'playing' || plannedSlot == null || currentSlot == null) return 0;
  return Math.max(0, currentSlot - (plannedSlot + span));
}
