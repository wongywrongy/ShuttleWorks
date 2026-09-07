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
 *
 * `searchKey` is exported because SSR uses it too: `EntrantsList` writes
 * `data-name`/`data-club` through this same function, so the text the reader
 * types and the text the document carries are normalised by ONE
 * implementation. A second, lowercase-only normaliser on either side is how
 * "Kjaer" stops finding `Kjær`.
 */

/**
 * The one normalisation for searchable public text: case-folded, accent- and
 * mark-stripped, whitespace-collapsed.
 *
 * Diacritics are the point. A club directory holds `Kjær`, `Arın`,
 * `Nguyễn Thùy Linh`; a reader types `kjaer`, `arin`, `nguyen`. NFKD splits
 * a letter from its combining marks so the marks can be dropped, and the
 * handful of letters that carry their mark INSIDE the codepoint (ø, æ, ð, þ,
 * ł, đ) are mapped explicitly — Unicode has no decomposition for them, so
 * without this table they simply never match.
 */
const FOLDED = {
  æ: 'ae',
  ø: 'o',
  å: 'a',
  ð: 'd',
  þ: 'th',
  ß: 'ss',
  ł: 'l',
  đ: 'd',
  ı: 'i',
  œ: 'oe',
};

export function searchKey(value) {
  return (value ?? '')
    .normalize('NFKD')
    // Combining marks (U+0300–U+036F) are what NFKD just separated out.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[æøåðþßłđıœ]/g, (char) => FOLDED[char] ?? char)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case- and accent-blind substring over name and club — the §3.2 contract.
 *  Returns which FIELD matched, so the caller can explain a club-only hit:
 *  `''` (no match), `'name'`, `'club'` or `'both'`. */
export function matchField(query, name, club) {
  const q = searchKey(query);
  if (q === '') return 'both';
  const inName = searchKey(name).includes(q);
  const inClub = searchKey(club).includes(q);
  if (inName && inClub) return 'both';
  if (inName) return 'name';
  if (inClub) return 'club';
  return '';
}

/** The boolean twin, kept as the module's original contract. */
export function matches(query, name, club) {
  return matchField(query, name, club) !== '';
}

/** The directory noun supplied by SSR; legacy callers remain entrant lists. */
export function filterNoun(root) {
  const noun = root?.getAttribute?.('data-filter-noun');
  return noun === 'player' ? 'player' : 'entrant';
}

/** The muted resting register of a row's club line, and the promoted one it
 *  wears while the club is the REASON the row survived the query. */
const CLUB_RESTING = 'text-xs text-muted-foreground';
const CLUB_PROMOTED = 'text-xs font-medium text-foreground';

/** Apply a query to a rendered list; returns how many rows stay visible. */
export function apply(scope, query) {
  let visible = 0;
  for (const row of scope.querySelectorAll('[data-entrant]')) {
    const field = matchField(query, row.getAttribute('data-name'), row.getAttribute('data-club'));
    const show = field !== '';
    row.hidden = !show;
    // A query that matched the club and not the name needs the club to be
    // legible, or the result reads as an unexplained name.
    const clubOnly = field === 'club';
    if (clubOnly) row.setAttribute('data-club-match', '');
    else row.removeAttribute('data-club-match');
    const club = row.querySelector('[data-club-context]');
    if (club) club.className = clubOnly ? CLUB_PROMOTED : CLUB_RESTING;
    if (show) visible += 1;
  }
  for (const group of scope.querySelectorAll('[data-letter-group]')) {
    const any = [...group.querySelectorAll('[data-entrant]')].some((row) => !row.hidden);
    group.hidden = !any;
  }
  // The A–Z index must not offer a jump to a letter the query emptied: a
  // dead anchor is worse than a missing one, because it looks like the
  // filter failed rather than like the letter has nobody in it.
  for (const jump of scope.querySelectorAll('[data-letter-jump]')) {
    const target = scope.querySelector(`[id="${jump.getAttribute('data-letter-jump')}"]`);
    jump.hidden = Boolean(target && target.hidden);
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

/** V3-PE05.2: "Find a player" — a persistent VISIBLE label, not just a
 * placeholder that vanishes the moment someone types. The label survives a
 * query; a placeholder alone does not. */
export function findLabel(noun) {
  return noun === 'player' ? 'Find a player' : 'Find an entrant';
}

function boot(root) {
  const doc = root.ownerDocument;
  const noun = filterNoun(root);
  const inputId = 'entrants-filter-input';
  const label = doc.createElement('label');
  label.setAttribute('for', inputId);
  label.className = 'mb-1 block text-xs font-medium text-foreground';
  label.textContent = findLabel(noun);
  const input = doc.createElement('input');
  input.id = inputId;
  input.type = 'search';
  input.placeholder = 'Name or club';
  input.className =
    'h-10 w-full min-w-0 rounded-sm border border-rule-control bg-surface-raised px-3 text-sm text-foreground';
  input.addEventListener('input', () => {
    apply(doc, input.value);
  });
  root.appendChild(label);
  root.appendChild(input);
  // The result count is SSR-rendered once, beside the mount point
  // (`EntrantsList`'s `[data-search-count]`) — `apply()` updates that same
  // node on every keystroke rather than this script minting a second one,
  // which used to leave two counts on the page (V3-PE05.2).
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('entrants-filter-root');
  if (root) boot(root);
}
