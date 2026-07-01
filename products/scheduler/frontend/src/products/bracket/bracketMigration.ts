import type { BracketPlayerDTO } from '../../api/dto';
import type { BracketTournamentDTO } from '../../api/bracketDto';

/**
 * First-load reconcile: extract unique players from a legacy bracket's
 * participants and produce a BracketPlayerDTO list keyed by the slug
 * already baked into bracket_participants.member_ids. Same slugger as
 * lib/playerSlug.ts produces the same id.
 */
export function reconcileBracketRoster(
  bracket: BracketTournamentDTO,
): BracketPlayerDTO[] {
  // Pre-pass: build slug→name lookup from PLAYER participants so that TEAM
  // member ids (which are player slugs) can be resolved to display names.
  const playerNames = new Map<string, string>();
  for (const part of bracket.participants) {
    if (!part.members || part.members.length === 0) {
      playerNames.set(part.id, part.name);
    }
  }

  const byId = new Map<string, BracketPlayerDTO>();
  for (const part of bracket.participants) {
    if (part.members && part.members.length > 0) {
      // TEAM: each member id is already a player slug.
      for (const memberId of part.members) {
        if (!byId.has(memberId)) {
          // Resolve display name from PLAYER lookup; fall back to slug.
          byId.set(memberId, {
            id: memberId,
            name: playerNames.get(memberId) ?? memberId,
          });
        }
      }
    } else {
      // PLAYER: id = player slug, name = display name.
      if (!byId.has(part.id)) {
        byId.set(part.id, { id: part.id, name: part.name });
      }
    }
  }
  return Array.from(byId.values());
}
