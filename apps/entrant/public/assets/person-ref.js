/**
 * The entrant tier's sole identity display and route seam.
 *
 * This file is deliberately browser-safe plain ESM. React SSR imports the
 * same source by relative path, while credentialed browser modules import it
 * from `/e/assets/person-ref.js`. Do not copy any of these decisions into a
 * caller.
 */

/**
 * Temporary R-UNI adapter: the current public projection already owns the
 * authoritative display value. Replacing this return expression is the one
 * frontend line the canonical R-UNI formatter will supersede.
 */
export function formatPersonIdentity(identity) {
  return identity?.name ?? '';
}

/** A public person URL exists only for a persisted tournament-person id. */
export function personHref(slug, identity) {
  if (!slug || !identity?.id) return null;
  return `/e/${encodeURIComponent(slug)}/players/${encodeURIComponent(identity.id)}`;
}

/**
 * The single presentation model shared by React SSR and the framework-free
 * account modules. Callers may compose this model, but must not repeat its
 * identity/link decisions. `text` remains the one formatter seam above.
 */
export function personRefModel({ slug, identity, state = 'resolved', label, className = '' }) {
  const text = identity ? formatPersonIdentity(identity) : (label ?? 'TBD');
  const href = state === 'dead' ? null : personHref(slug, identity);
  return {
    text,
    href,
    personId: href ? identity.id : null,
    className: [
      'person-ref',
      href ? 'text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent' : 'text-muted-foreground',
      state === 'winner' && href ? 'font-[650]' : '',
      className,
    ].filter(Boolean).join(' '),
  };
}

/**
 * Framework-free PersonRef adapter for the account-scoped browser modules.
 * Missing identity/id and explicit dead state always produce a span.
 */
export function createPersonRef(doc, { slug, identity, state = 'resolved', label, className = '' }) {
  const model = personRefModel({ slug, identity, state, label, className });
  const node = doc.createElement(model.href ? 'a' : 'span');
  node.className = model.className;
  node.textContent = model.text;
  if (model.href) {
    node.href = model.href;
    node.dataset.personId = model.personId;
  }
  return node;
}
