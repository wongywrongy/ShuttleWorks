import type { BracketPlayerDTO } from '../../api/dto';
import type { BracketTournamentDTO } from '../../api/bracketDto';

/**
 * Recover a display name from a player slug: `p-alexei-sorokin` →
 * `Alexei Sorokin`.
 *
 * Last resort only — it cannot restore punctuation or case the slugger threw
 * away ("O'Brien" comes back as "O Brien"). It exists because the alternative
 * shipped the raw slug into the roster's Player column and the draw picker
 * (defect D3): every name on the Bracket roster of a doubles-only draw read
 * `alexei-sorokin`, because a TEAM participant's members are slugs and there
 * was no PLAYER participant to look the name up from.
 */
function nameFromSlug(id: string): string {
  return id
    .replace(/^p-/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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
  // Second pass: a TEAM carries its members' names in its OWN display name
  // ("Alexei Sorokin / Ben Carter"), positionally aligned with `members`.
  // That is the only place a doubles-only draw keeps them, so read it before
  // falling back to de-slugging.
  for (const part of bracket.participants) {
    if (!part.members || part.members.length === 0) continue;
    const parts = part.name.split(' / ');
    if (parts.length !== part.members.length) continue;
    part.members.forEach((memberId, i) => {
      const name = parts[i].trim();
      if (name && !playerNames.has(memberId)) playerNames.set(memberId, name);
    });
  }

  const byId = new Map<string, BracketPlayerDTO>();
  for (const part of bracket.participants) {
    if (part.members && part.members.length > 0) {
      // TEAM: each member id is already a player slug.
      for (const memberId of part.members) {
        if (!byId.has(memberId)) {
          byId.set(memberId, {
            id: memberId,
            name: playerNames.get(memberId) ?? nameFromSlug(memberId),
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
