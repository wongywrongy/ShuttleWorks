import type { PersonReferenceDTO } from '../lib/person.types';
import {
  PENDING_MEMBER_LABEL,
  feederLabel,
  isFeederSide,
  sideFallbackLabel,
  unresolvedLabel,
  type UnresolvedSideDTO,
} from '../lib/side';
import { PersonRef } from './PersonRef';

/**
 * Composes person references; it deliberately owns no identity formatting.
 *
 * Contract §3.1/§6.1 (D14/D15): partners are STACKED, one per line — never
 * assembled into a slash-joined string. The old `' / '` separator element
 * is deleted outright, not restyled; each person renders in its own block
 * element instead, so a doubles side reads as two names, not one string
 * with a glyph in the middle (V3-PE14.1).
 *
 * Since v3 package 29 the group renders the DISCRIMINATED reason a side is
 * unresolved (§2.1's `UnresolvedSide`) rather than inferring one from a
 * placeholder sentence: `pending_member` prints the known names AND a
 * "partner to be confirmed" line, which is the one shape that stops a
 * half-formed pair reading as an ordinary singles side. The line is a DEAD
 * reference, in the same block flow and ink as a name — never a blank row,
 * never an invented person.
 *
 * **public-visual-fixes P3.** A side fed by an unplayed match is an EMPTY
 * PARTICIPANT SLOT carrying one muted feeder line (`from QF2`), not a
 * name-shaped "Winner of QF2" (state-and-formatting §6.2, match-card §4.3).
 * The slot keeps a resolved name's own line height and block flow, so
 * nothing jumps as results land, and the muted register is what separates
 * "nobody yet" from a real person — which is exactly the distinction the old
 * treatment lost. `bye` and `withheld` stay in the NAME register on purpose:
 * both are settled facts about this slot, not an absence waiting to be
 * filled, and the reader must be able to tell all three apart.
 *
 * `seed` stays an option here for the callers that have no row of their own
 * to hang it on (the round-robin standings table). `MatchCard` passes none:
 * since P3 a match side renders its seed in the row's own trailing cell, so
 * the seed sits beside the side it belongs to rather than under its last
 * partner's name (match-card §4.2, "Seeds render beside the side they
 * belong to"; §4.3, right-aligned in a node).
 */
export function PersonGroup({
  slug,
  persons,
  state = 'resolved',
  className = '',
  label,
  seed,
  unresolved = null,
}: {
  slug: string;
  persons: PersonReferenceDTO[];
  state?: 'resolved' | 'winner';
  className?: string;
  label?: string | null;
  seed?: number | null;
  unresolved?: UnresolvedSideDTO | null;
}) {
  const pending = unresolved?.kind === 'pending_member';
  if (!persons.length) {
    // §6.2 (P3): an unplayed predecessor is an empty slot plus a muted
    // feeder line — no "Winner of", no node key, no slot index. Every other
    // unresolved kind keeps the name register ("Bye", "Player not
    // published", "To be decided" — never "TBD").
    if (isFeederSide({ persons, placeholder: label, unresolved })) {
      return (
        <span className={className} data-feeder-slot="">
          {/* P7: the feeder line is subordinate, not faint — it is the only
              thing an empty slot says, so it sits one register below the
              name ink (`text-secondary`) rather than in the muted register
              used for card furniture. */}
          <span className="block text-text-secondary">
            {feederLabel(unresolved?.reference)}
          </span>
        </span>
      );
    }
    return <PersonRef slug={slug} identity={null} state="dead" label={unresolvedLabel(unresolved) ?? sideFallbackLabel({ persons, placeholder: label })} className={className} />;
  }
  return (
    <span className={className}>
      {persons.map((person, index) => (
        <span key={`${person.identity?.id ?? person.label ?? index}`} className="block">
          <PersonRef
            slug={slug}
            identity={person.identity}
            state={person.resolution === 'dead' ? 'dead' : state}
            label={person.label}
          />
        </span>
      ))}
      {pending ? (
        <span className="block">
          <PersonRef slug={slug} identity={null} state="dead" label={PENDING_MEMBER_LABEL} />
        </span>
      ) : null}
      {seed !== null && seed !== undefined ? <span className="block text-muted-foreground">[{seed}]</span> : null}
    </span>
  );
}
