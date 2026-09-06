import type { PersonReferenceDTO } from '../lib/person.types';
import { PersonRef } from './PersonRef';

/**
 * Composes person references; it deliberately owns no identity formatting.
 *
 * Contract §3.1/§6.1 (D14/D15): partners are STACKED, one per line — never
 * assembled into a slash-joined string. The old `' / '` separator element
 * is deleted outright, not restyled; each person renders in its own block
 * element instead, so a doubles side reads as two names, not one string
 * with a glyph in the middle (V3-PE14.1).
 */
export function PersonGroup({
  slug,
  persons,
  state = 'resolved',
  className = '',
  label,
  seed,
}: {
  slug: string;
  persons: PersonReferenceDTO[];
  state?: 'resolved' | 'winner';
  className?: string;
  label?: string | null;
  seed?: number | null;
}) {
  if (!persons.length) {
    // Contract §6.2: the generic unresolved fallback is "To be decided" —
    // never "TBD" — when the caller supplies no more specific label.
    return <PersonRef slug={slug} identity={null} state="dead" label={label ?? 'To be decided'} className={className} />;
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
      {seed !== null && seed !== undefined ? <span className="block text-muted-foreground">[{seed}]</span> : null}
    </span>
  );
}
