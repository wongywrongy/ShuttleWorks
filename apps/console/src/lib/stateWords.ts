/**
 * The console's operational state vocabulary: one word per state, defined
 * once (SP-CONSOLE-2 X1).
 *
 * Before this module the same words were spelled out in four places that had
 * quietly drifted apart: the Run court band, the public Display court band,
 * and the two bracket progress strips. A match was PLAYING in the Run
 * inspector but Live in the match lists, WAITING in the queue but Pending in
 * the lists, and PEND in the bracket strips.
 *
 * **Casing is not part of the vocabulary.** Every word is defined in sentence
 * case exactly once here; surfaces that want the board's uppercase treatment
 * take it from CSS (`uppercase`, via `EYEBROW_CLASS` or a band's own class),
 * never from a second string constant. That is what stops the two tiers
 * drifting again: there is no uppercase literal left to drift.
 *
 * `due` / `late` / `overdue` are the timeliness escalation, not statuses. A
 * match is DUE when its slot arrives, LATE one slot past it, OVERDUE two or
 * more. See `deriveTimeliness` in `modules/operations/runtime/runMachine.ts`
 * for the thresholds and `docs/explanation/console-naming.md` for the ruling.
 */
export type StateWord =
  | 'live'
  | 'called'
  | 'due'
  | 'late'
  | 'overdue'
  | 'ready'
  | 'pending'
  | 'done'
  | 'scheduled'
  | 'free'
  | 'closed'
  | 'onCourt';

export const STATE_WORD: Record<StateWord, string> = {
  live: 'Live',
  called: 'Called',
  due: 'Due',
  late: 'Late',
  // Same word as `late`, louder treatment: the tier shows in the color, not
  // in a second adjective the operator would have to learn.
  overdue: 'Late',
  ready: 'Ready',
  pending: 'Pending',
  done: 'Done',
  scheduled: 'Scheduled',
  free: 'Free',
  closed: 'Closed',
  // A queued match whose player is mid-rally on another court. Not a status
  // of the match but a fact about its people, and the desk reads it in the
  // same column as the others, so it lives in the same vocabulary.
  onCourt: 'On court',
};
