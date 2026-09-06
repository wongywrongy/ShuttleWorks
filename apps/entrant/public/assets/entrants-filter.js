/**
 * The entrants search filter (SP-P7 §3.2) — the second page-scoped script
 * (`my-entries.js` documents the pattern: external ES module, no inline JS,
 * no CSP change).
 *
 * Progressive enhancement in the strict sense: the input EXISTS only when
 * this module runs — the SSR document ships rows with `data-name`/
 * `data-club` and an empty mount point, so a no-JS reader sees a complete
 * list and no dead search box. Filtering hides rows (`hidden`), then hides
 * any letter group with nothing left, and shows the SSR'd no-matches line
 * when the whole list is gone.
 */

/** Case-blind substring over name and club — the §3.2 contract. */
export function matches(query, name, club) {
  const q = (query ?? '').trim().toLowerCase();
  if (q === '') return true;
  return (name ?? '').includes(q) || (club ?? '').includes(q);
}

/** The directory noun supplied by SSR; legacy callers remain entrant lists. */
export function filterNoun(root) {
  const noun = root?.getAttribute?.('data-filter-noun');
  return noun === 'player' ? 'player' : 'entrant';
}

/** Apply a query to a rendered list; returns how many rows stay visible. */
export function apply(scope, query) {
  let visible = 0;
  for (const row of scope.querySelectorAll('[data-entrant]')) {
    const show = matches(query, row.getAttribute('data-name'), row.getAttribute('data-club'));
    row.hidden = !show;
    if (show) visible += 1;
  }
  for (const group of scope.querySelectorAll('[data-letter-group]')) {
    const any = [...group.querySelectorAll('[data-entrant]')].some((row) => !row.hidden);
    group.hidden = !any;
  }
  const empty = scope.querySelector('[data-no-matches]');
  if (empty) empty.hidden = visible > 0;
  const count = scope.querySelector('[data-search-count]');
  if (count) {
    const noun = filterNoun(scope.querySelector('#entrants-filter-root'));
    count.textContent = query.trim()
      ? `${visible} ${visible === 1 ? 'result' : 'results'}`
      : `${visible} ${visible === 1 ? noun : `${noun}s`}`;
  }
  return visible;
}

function boot(root) {
  const doc = root.ownerDocument;
  const noun = filterNoun(root);
  const input = doc.createElement('input');
  input.type = 'search';
  input.placeholder = 'Filter by name or club';
  input.setAttribute('aria-label', `Filter ${noun}s by name or club`);
  input.className =
    'h-10 w-full min-w-0 rounded-sm border border-rule-control bg-surface-raised px-3 text-sm text-foreground';
  input.addEventListener('input', () => {
    apply(doc, input.value);
  });
  root.appendChild(input);
  const scope = root.closest('section') ?? doc;
  const rows = scope.querySelectorAll('[data-entrant]').length;
  const count = doc.createElement('p');
  count.setAttribute('data-search-count', '');
  count.setAttribute('aria-live', 'polite');
  count.className = 'mt-1 text-xs text-muted-foreground';
    count.textContent = `${rows} ${rows === 1 ? noun : `${noun}s`}`;
  root.appendChild(count);
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('entrants-filter-root');
  if (root) boot(root);
}
