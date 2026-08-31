import type { PublicPersonIdentityDTO } from '../../app/lib/person.types';

export type PersonRefState = 'resolved' | 'winner' | 'dead';

export interface PersonRefInput {
  slug: string;
  identity: PublicPersonIdentityDTO | null;
  state?: PersonRefState;
  label?: string | null;
  className?: string;
}

export function formatPersonIdentity(identity: PublicPersonIdentityDTO | null): string;
export function personHref(
  slug: string,
  identity: PublicPersonIdentityDTO | null,
): string | null;
export interface PersonRefModel {
  text: string;
  href: string | null;
  personId: string | null;
  className: string;
}
export function personRefModel(input: PersonRefInput): PersonRefModel;
export function createPersonRef(
  doc: Document,
  input: PersonRefInput,
): HTMLAnchorElement | HTMLSpanElement;
