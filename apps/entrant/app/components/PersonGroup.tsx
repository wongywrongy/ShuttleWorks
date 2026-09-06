import type { PersonReferenceDTO } from '../lib/person.types';
import { PENDING_MEMBER_LABEL, sideFallbackLabel, unresolvedLabel, type UnresolvedSideDTO } from '../lib/side';
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
    // Contract §6.2: the generic unresolved fallback is "To be decided" —
    // never "TBD". The discriminant wins over the caller's placeholder
    // string wherever the wire carries one.
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
