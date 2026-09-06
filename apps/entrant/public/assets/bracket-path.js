/** Progressive path emphasis for the server-rendered public bracket. */

export function includesPerson(node, personId) {
  return (node?.dataset?.personIds ?? '').split(/\s+/).includes(personId);
}

export function applyPersonPath(root, personId) {
  const active = Boolean(personId);
  root.classList.toggle('has-person-path', active);
  for (const node of root.querySelectorAll('[data-person-ids]')) {
    node.classList.toggle('is-person-path', active && includesPerson(node, personId));
  }
}

/**
 * V3-PE12.1: the found match gets scrolled into view, not just highlighted —
 * a spectator who just searched should not have to hunt across a wide
 * canvas for the one node that changed. Finds the first node on the pinned
 * person's path and centers it; a no-op where `scrollIntoView` is absent
 * (jsdom in tests) or nothing matched.
 */
export function scrollPinnedPersonIntoView(root, personId) {
  if (!personId) return;
  // `[data-node-key]` narrows to actual match slots — the connector braces
  // between rounds carry `data-person-ids` too, and scrolling to one of
  // those would land beside a match rather than on it.
  for (const node of root.querySelectorAll('[data-node-key][data-person-ids]')) {
    if (includesPerson(node, personId)) {
      if (typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ block: 'center', inline: 'center' });
      }
      return;
    }
  }
}

export function mountBracketPath(root) {
  const pinned = root.dataset.pinnedPerson ?? '';
  applyPersonPath(root, pinned);
  scrollPinnedPersonIntoView(root, pinned);

  const personFrom = (target) => target?.closest?.('[data-person-id]')?.dataset?.personId ?? '';
  root.addEventListener('pointerover', (event) => {
    const personId = personFrom(event.target);
    if (personId) applyPersonPath(root, personId);
  });
  root.addEventListener('pointerout', (event) => {
    const from = personFrom(event.target);
    const to = personFrom(event.relatedTarget);
    if (from && from !== to) applyPersonPath(root, pinned);
  });
  root.addEventListener('focusin', (event) => {
    const personId = personFrom(event.target);
    if (personId) applyPersonPath(root, personId);
  });
  root.addEventListener('focusout', (event) => {
    const from = personFrom(event.target);
    const to = personFrom(event.relatedTarget);
    if (from && from !== to) applyPersonPath(root, pinned);
  });
}

if (typeof document !== 'undefined') {
  for (const root of document.querySelectorAll('[data-bracket-grid]')) mountBracketPath(root);
}
