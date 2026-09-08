/**
 * The entrants search filter (SP-P7 §3.2) — the second page-scoped script
 * (`my-entries.js` documents the pattern: external ES module, no inline JS,
 * no CSP change).
 *
 * Progressive enhancement in the strict sense — but since P7 the baseline is
 * a WORKING search, not the absence of one: the SSR document ships the
 * native GET form, the rows (`data-name`/`data-club`) and a server-filtered
 * result, and this module only adds live filtering as you type. Filtering
 * hides rows (`hidden`), then hides any letter group with nothing left, and
 * shows the SSR'd no-matches line when the whole list is gone.
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

/** The field's accessible name. Since P7 it is SSR'd as an `sr-only` label
 * on the native search form, not minted here — but it is still one string,
 * and `EntrantsList` reads it from this module so the document and the
 * script can never disagree about what the field is called. */
export function findLabel(noun) {
  return noun === 'player' ? 'Find a player' : 'Find an entrant';
}

/**
 * Enhance the SSR'd search form: filter the rendered rows as the reader
 * types, instead of waiting for a round trip.
 *
 * P7 inverted this script's job. It used to CREATE the input (so a
 * scriptless reader had no search at all); the input is now part of the
 * document and this only adds the live filtering on top. The form still
 * submits natively — if the script never runs, or fails, Enter still
 * performs the same search on the server.
 */
export function boot(root) {
  const doc = root.ownerDocument;
  const input = root.querySelector('input[type="search"]');
  if (!input) return;
  input.addEventListener('input', () => {
    apply(doc, input.value);
  });
  // The server may already have filtered to `?q=`; re-applying it here is a
  // no-op on the rendered rows and keeps the count line consistent with the
  // register the script uses from the first keystroke on.
  if (input.value.trim() !== '') apply(doc, input.value);
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('entrants-filter-root');
  if (root) boot(root);
}
