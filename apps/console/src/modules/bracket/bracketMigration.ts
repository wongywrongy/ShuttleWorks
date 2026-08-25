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

/**
 * Repair roster names an EARLIER run of this migration got wrong.
 *
 * `reconcileBracketRoster` runs once per bracket and its output is PERSISTED
 * (`bracketPlayers` on the tournament blob, gated by `bracketRosterMigrated`),
 * so the version of it that resolved a team member to its raw slug did not
 * leave a display bug behind — it left DATA behind, frozen against every
 * later fix. That is why the roster list, the draw participant picker and the
 * match detail panel still read `cormac-delahunt` after the fix landed while
 * the matches ROW read "Cormac Delahunt / Jae Hyun Choi": the row resolves
 * names from the live snapshot's participants, and the other three all read
 * the stored roster. One seam, one repair.
 *
 * `name === id` is the marker: a slug is what the broken path wrote, and
 * nothing else produces it — the roster's own add path slugs the name to make
 * the id ("Cormac Delahunt" → `cormac-delahunt`), so a real name never equals
 * its own id. An operator's edit is never overwritten.
 *
 * Returns the SAME array when nothing needs repair, so a caller can run it on
 * every poll without churning state or the autosave.
 */
export function healBracketRosterNames(
  roster: BracketPlayerDTO[],
  bracket: BracketTournamentDTO,
): BracketPlayerDTO[] {
  if (!roster.some((p) => p.name === p.id)) return roster;
  const derived = new Map(
    reconcileBracketRoster(bracket).map((p) => [p.id, p.name]),
  );
  let changed = false;
  const next = roster.map((p) => {
    if (p.name !== p.id) return p;
    const better = derived.get(p.id);
    if (!better || better === p.id) return p;
    changed = true;
    return { ...p, name: better };
  });
  return changed ? next : roster;
}
