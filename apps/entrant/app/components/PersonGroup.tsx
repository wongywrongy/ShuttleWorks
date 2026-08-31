import type { PersonReferenceDTO } from '../lib/person.types';
import { PersonRef } from './PersonRef';

/** Composes person references; it deliberately owns no identity formatting. */
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
    return <PersonRef slug={slug} identity={null} state="dead" label={label ?? 'TBD'} className={className} />;
  }
  return (
    <span className={className}>
      {persons.map((person, index) => (
        <span key={`${person.identity?.id ?? person.label ?? index}`}>
          {index > 0 ? <span className="mx-1 text-muted-foreground" aria-hidden>/</span> : null}
          <PersonRef
            slug={slug}
            identity={person.identity}
            state={person.resolution === 'dead' ? 'dead' : state}
            label={person.label}
          />
        </span>
      ))}
      {seed !== null && seed !== undefined ? <span className="ms-1 text-muted-foreground">[{seed}]</span> : null}
    </span>
  );
}
