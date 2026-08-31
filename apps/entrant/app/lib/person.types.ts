/** Public, tournament-scoped identity carried by entrant projections. */
export interface PublicPersonIdentityDTO {
  /** Persisted person-in-tournament id. Null means the name cannot route. */
  id: string | null;
  /** Authoritative display value. PersonRef is the only renderer of it. */
  name: string;
}

export type PersonResolution = 'resolved' | 'dead';

/** A person reference on a match, draw, entry, or result surface. */
export interface PersonReferenceDTO {
  identity: PublicPersonIdentityDTO | null;
  resolution: PersonResolution;
  /** Only for non-person tokens such as Bye or Winner of QF 1. */
  label: string | null;
}

export function unresolvedPerson(name: string): PersonReferenceDTO {
  return {
    identity: { id: null, name },
    resolution: 'dead',
    label: null,
  };
}
