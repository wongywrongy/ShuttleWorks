/**
 * Draw progress tally — how many play units in a draw (or in the whole
 * bracket) are done / live / ready / pending.
 *
 * Pure, and deliberately NOT in a component file. It used to live inside
 * `BracketViewHeader`, which was fine while the header was its only reader;
 * when the draw canvas started rendering the same tally in its own toolbar
 * strip (SP-CONSOLE-2 DRAW-2), importing it back out of the header closed a
 * cycle — the header already imports `BracketLayoutMode` from `DrawView`.
 * A derivation two components share belongs to neither.
 */
import type { TournamentDTO } from '../../api/bracketDto';
import type { MatchListStatus } from '../../components/control-plane';

/** Counts keyed by the shared match-list vocabulary, so the result feeds
 *  `statusTallyItems` directly and cannot drift from the lists' wording. */
export function drawProgress(
  data: TournamentDTO,
  eventId: string | null,
): Record<MatchListStatus, number> {
  const resultsById = new Set(data.results.map((r) => r.play_unit_id));
  const assignmentByPu = new Map(data.assignments.map((a) => [a.play_unit_id, a]));
  let done = 0;
  let live = 0;
  let ready = 0;
  let pending = 0;
  for (const pu of data.play_units) {
    if (eventId && pu.event_id !== eventId) continue;
    if (resultsById.has(pu.id)) {
      done += 1;
      continue;
    }
    const a = assignmentByPu.get(pu.id);
    if (a?.started && !a.finished) {
      live += 1;
      continue;
    }
    if (a) {
      ready += 1;
      continue;
    }
    pending += 1;
  }
  return { done, live, ready, pending };
}
