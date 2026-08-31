import type { PublicPersonIdentityDTO } from '../lib/person.types';
import {
  personRefModel,
  type PersonRefState,
} from '../../public/assets/person-ref.js';

export interface PersonRefProps {
  slug: string;
  identity: PublicPersonIdentityDTO | null;
  state?: PersonRefState;
  label?: string | null;
  className?: string;
  current?: boolean;
}

/** The only React component permitted to render a person's public name. */
export function PersonRef({
  slug,
  identity,
  state = 'resolved',
  label,
  className = '',
  current = false,
}: PersonRefProps) {
  const model = personRefModel({ slug, identity, state, label, className });

  if (!model.href) return <span className={model.className}>{model.text}</span>;
  return (
    <a href={model.href} className={model.className} aria-current={current ? 'page' : undefined} data-person-id={model.personId ?? undefined}>
      {model.text}
    </a>
  );
}
