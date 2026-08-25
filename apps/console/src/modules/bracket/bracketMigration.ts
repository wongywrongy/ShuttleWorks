import type { BracketPlayerDTO } from '../../api/dto';
import type { BracketTournamentDTO } from '../../api/bracketDto';

/**
 * First-load reconcile for a LEGACY bracket: participants exist, but no
 * `bracketPlayers` roster does. Extract one roster row per person, keyed by
 * the id already baked into `bracket_participants` / `member_ids`.
 *
 * SP-DM-3 P6 (R-DM-7(a), card §C6) deleted the two name-decoding paths this
 * used to have — de-slugging an id back into a display name, and splitting a
 * TEAM's label on " / " to zip names onto `member_ids` positionally. Both
 * recovered a PERSON from a STRING a human can retype, which is the whole of
 * F-DM-04/F-DM-14. A member no PLAYER participant can name is now OMITTED
 * rather than guessed at — the ruled don't-invent posture for a person-shape
 * with no identity behind it (F-DM-19).
 *
 * That costs one thing, deliberately: a pre-roster-blob doubles-ONLY draw has
 * no PLAYER participants at all, so its roster comes back empty instead of
 * name-decoded. Every bracket the Entries commit seam has touched carries a
 * server-written roster with real names and never reaches this function.
 */
export function reconcileBracketRoster(
  bracket: BracketTournamentDTO,
): BracketPlayerDTO[] {
  // A PLAYER participant is the only thing that can name a person here: its
  // id IS the roster id and its name IS the display name.
  const playerNames = new Map<string, string>();
  for (const part of bracket.participants) {
    if (!part.members || part.members.length === 0) {
      playerNames.set(part.id, part.name);
    }
  }

  const byId = new Map<string, BracketPlayerDTO>();
  for (const part of bracket.participants) {
    if (part.members && part.members.length > 0) {
      for (const memberId of part.members) {
        const name = playerNames.get(memberId);
        if (name === undefined) continue; // unnameable: omit, never guess
        if (!byId.has(memberId)) byId.set(memberId, { id: memberId, name });
      }
    } else if (!byId.has(part.id)) {
      byId.set(part.id, { id: part.id, name: part.name });
    }
  }
  return Array.from(byId.values());
}
