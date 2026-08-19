/**
 * Which bracket-roster players are LOCKED because a generated draw uses them.
 *
 * The client mirror of the backend's ROSTER_LOCKED guard
 * (`repositories/local.py::player_ids_referenced_by_generated`): the union of
 * participant ids and their member ids across every event whose status is not
 * `draft`.
 *
 * Interaction-audit finding A3: the roster offered Delete on these players. The
 * server refused (409), but because roster state persists as a whole-blob PUT,
 * the rejected delete stayed in the store and poisoned EVERY later save — all
 * roster editing was dead until reload. `useTournamentState` now re-syncs on a
 * 409 so the cascade can't happen; this helper stops the bad press up front.
 */
import type { BracketTournamentDTO } from '../../api/bracketDto';

export function lockedPlayerIds(
  data: BracketTournamentDTO | null | undefined,
): Set<string> {
  const locked = new Set<string>();
  if (!data) return locked;

  for (const event of data.events ?? []) {
    // Absent status = a pre-status fixture, which the backend defaults to
    // 'draft'. Only a GENERATED draw pins its participants.
    if ((event.status ?? 'draft') === 'draft') continue;

    // An event's own `participants` attribute the entries to their draw; the
    // flat top-level list is the fallback for older payloads that lack it.
    const participants = event.participants ?? data.participants ?? [];
    for (const p of participants) {
      locked.add(p.id);
      for (const memberId of p.members ?? []) locked.add(memberId);
    }
  }
  return locked;
}

/** Why the delete is refused — shown on the disabled control. */
export const ROSTER_LOCKED_REASON =
  'Placed in a generated draw. Re-generate or reset the draw to remove this player.';
