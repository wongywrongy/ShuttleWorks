/**
 * "Is this event doubles?" — the console's one answer (F-DM-13).
 *
 * The audit found four independent answers; the tree carried SIX. Two
 * RULES were behind them: the D-suffix convention (`MD`, `WD`, `XD`, and a
 * director's own `BD`), declared verbatim in four places, and a closed
 * `['MD','WD','XD']` list, declared verbatim in four more. They agree on
 * every code the product ships and disagree on anything a director types,
 * which is the worst kind of duplication: correct in the demo, wrong in
 * the field, and silent either way.
 *
 * The suffix convention wins because it is the one the product already
 * DOCUMENTS as its rule (`platform/engine-config/MeetEventsSection.tsx`).
 * The digit strip is what lets one function serve both key spaces: a
 * bracket EVENT is keyed by discipline (`"XD"`), a meet POSITION by rank
 * (`"XD2"`), and they are the same question about the same event.
 *
 * The BACKEND's single answer is `entries/partners.py::is_doubles`, which
 * reads `entry_events.entry_type` — a column, not a string convention. The
 * two tiers cannot share one implementation because the console's bracket
 * surfaces never see an `entry_events` row; they see `BracketEventDTO`,
 * which carries `discipline` and no entry type. Closing THAT gap is P7's
 * one-Event-key work, not this function's.
 */
export function isDoublesCode(code: string): boolean {
  return code.replace(/\d+$/, '').endsWith('D');
}
