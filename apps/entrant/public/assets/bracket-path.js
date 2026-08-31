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

export function mountBracketPath(root) {
  const pinned = root.dataset.pinnedPerson ?? '';
  applyPersonPath(root, pinned);

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
