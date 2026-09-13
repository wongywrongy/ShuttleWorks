/**
 * Shared public player directory (SP-P7 §3.2): alphabetical, letter-grouped,
 * optional profile links, and event codes riding the row. The component name
 * is retained for compatibility with its original Entrants-only callers and
 * tests.
 *
 * **Aligned rows since the 2026-09-12 public refinement.** The directory used
 * to be three CSS columns of letter groups, which read as three separate
 * lists with no relation between a name, its club and its events. It is now
 * ONE list with three aligned columns — Player · Club · Events — under a
 * header row from `sm:` up; below `sm:` the club and the events stack under
 * the name. The letter groups survive as heading rows inside that list
 * (they are what the A–Z index jumps to), and every row grows with its
 * content: a long name wraps, nothing truncates.
 *
 * **Two filters, one native form (P7 + refinement).** The search box is a
 * server-rendered GET form over `?q=`, and the event control is a native
 * `<select name="event">` in the SAME form over `?event=`; both are applied
 * on the SERVER by the same `matchField`/code test the browser uses, so the
 * directory filters with scripting off — Enter (or the sr-only submit)
 * applies them, the URL carries them, the result is shareable. The
 * page-scoped script (`/e/assets/entrants-filter.js`) then enhances the same
 * controls to filter the rendered rows in place (`data-name`/`data-club`/
 * `data-events`); it mints no control of its own, so there is no second box
 * and no second count. Both filters run over the WHOLE roster: a tournament
 * directory is bounded, so it is never paginated.
 *
 * **The toolbar (public-visual-fixes P2).** Count, the filter form and the
 * A–Z index are ONE sticky element, not three things that scroll apart. It
 * sticks at `top-0` because nothing above it on this tier is sticky, and
 * `TOOLBAR_OFFSET` is the ONE place that decision is written down, shared
 * with the letter sections' `scroll-mt` so a letter jump can never land
 * underneath the bar it was clicked in. The A–Z index is kept because the
 * script hides any letter the filters emptied, so it stays consistent with
 * what is on screen.
 *
 * The searchable text is NORMALISED (`searchKey`) rather than merely
 * lowercased, and by the same function the browser script uses, so "Kjaer"
 * finds `Kjær` and "Arin" finds `Arın`.
 */
import { eventCodeLabel } from '../lib/draws.types';
import { eventLabel } from '../lib/eventLabels';
import type { PersonReferenceDTO } from '../lib/person.types';
import { LIST_CARD, SELECT_CONTROL } from '../lib/ui';
import { personRefModel } from '../../public/assets/person-ref.js';
import { findLabel, matchField, rowHasEvent, searchKey } from '../../public/assets/entrants-filter.js';
import { PersonRef } from './PersonRef';
import { SearchField } from './SearchField';

interface DirectoryRow {
  playerKey: string;
  person: PersonReferenceDTO;
  club?: string | null;
  eventCodes: string[];
}

/**
 * The sticky toolbar's own offset and the clearance every jump target needs
 * below it, stated once. `top-0` is a claim about what else is sticky on
 * this tier (nothing); if a sticky site header ever lands above this list,
 * this constant is the single place both halves move together.
 */
const TOOLBAR_OFFSET = 'top-0';
const JUMP_CLEARANCE = 'scroll-mt-28';

/** The row's grid, shared with the column header so the two align. */
const ROW_COLUMNS = 'sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_minmax(0,10rem)]';

function searchableName(row: DirectoryRow): string {
  return personRefModel({ slug: '', identity: row.person.identity, state: row.person.resolution, label: row.person.label }).text;
}

function letterOf(row: DirectoryRow): string {
  const first = searchableName(row).charAt(0).toLocaleUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/** A fragment-safe id for a letter-group section — `#` is a heading GLYPH,
 * not a legal URL fragment character, so the "other" group anchors on a
 * word instead of a bare hash. */
function anchorId(letter: string): string {
  return letter === '#' ? 'dir-other' : `dir-${letter}`;
}

function letterJumpLabel(letter: string): string {
  return letter === '#' ? 'Jump to names starting with a number or symbol' : `Jump to ${letter}`;
}

/** The public codes a row plays, normalised once for the filter and the
 * `data-events` attribute the script reads. */
function rowCodes(row: DirectoryRow): string[] {
  return [...new Set(row.eventCodes.map(eventCodeLabel))];
}

export function EntrantsList({
  slug,
  entrants,
  noun = 'entrant',
  linkEventsToDraws = false,
  query = '',
  event = '',
  action = '',
  hidden = [],
}: {
  slug: string;
  entrants: DirectoryRow[];
  noun?: 'entrant' | 'player';
  linkEventsToDraws?: boolean;
  /** The URL's own `?q=` — applied on the SERVER, so the search works with
   * no script at all (P7). The script re-applies it as you type. */
  query?: string;
  /** The URL's own `?event=` — a public event code, applied on the SERVER
   * exactly like `query`. An unknown code filters to nothing and says so. */
  event?: string;
  /** Where the search form submits; the page that renders this list. */
  action?: string;
  /** The other URL state the search must not drop (the `tab`, typically). */
  hidden?: readonly { name: string; value: string }[];
}) {
  const eventFilter = eventCodeLabel(event.trim());
  const filtering = query.trim() !== '' || eventFilter !== '';
  const matched = entrants.filter(
    (row) =>
      (query.trim() === '' || matchField(query, searchableName(row), row.club ?? '') !== '') &&
      rowHasEvent(rowCodes(row).join(' '), eventFilter),
  );
  const sorted = [...matched].sort((a, b) => searchableName(a).localeCompare(searchableName(b)));
  const groups: { letter: string; rows: DirectoryRow[] }[] = [];
  for (const row of sorted) {
    const letter = letterOf(row);
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.rows.push(row);
    else groups.push({ letter, rows: [row] });
  }
  // The event options come from the WHOLE roster, not the filtered rows, so
  // a reader can always move from one event to another.
  const eventOptions = [...new Set(entrants.flatMap(rowCodes))].sort((a, b) => a.localeCompare(b));
  const eventHref = (code: string) =>
    `/e/${encodeURIComponent(slug)}?tab=draws#draw-${encodeURIComponent(code)}`;

  return (
    <div className="grid gap-4">
      {/* ONE toolbar: the count, the filter form and the A–Z index travel
          together down the page. `-mx-4 px-4` lets the opaque band reach the
          gutters of the `max-w-6xl` main so rows do not show through its
          edges as they scroll under it. */}
      <div
        data-directory-toolbar
        className={`sticky ${TOOLBAR_OFFSET} z-20 -mx-4 grid gap-2 border-b border-rule-soft bg-surface-base px-4 pb-2 pt-3`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* V3-PE05.2: ONE count, updated in place by the filter script
              (`data-search-count`) — no second count appearing once the
              script boots beside the search input. */}
          <p data-search-count aria-live="polite" className="text-sm text-muted-foreground">
            {filtering
              ? `${sorted.length} ${sorted.length === 1 ? 'result' : 'results'}`
              : `${entrants.length} ${entrants.length === 1 ? noun : `${noun}s`}`}
          </p>
          {/* P7: a REAL native GET form, server-filtered. The label is real
              and `sr-only`; the script enhances these same fields to filter
              as you type instead of minting a second one. */}
          <form
            method="get"
            action={action}
            role="search"
            id="entrants-filter-root"
            data-filter-noun={noun}
            className="flex w-full min-w-0 flex-wrap items-stretch gap-2 sm:w-auto"
          >
            {hidden.map((field) => (
              <input key={field.name} type="hidden" name={field.name} value={field.value} />
            ))}
            {eventOptions.length > 1 ? (
              <>
                <label htmlFor="entrants-event" className="sr-only">
                  Event
                </label>
                <select
                  id="entrants-event"
                  name="event"
                  defaultValue={eventFilter}
                  className={`${SELECT_CONTROL} w-auto min-w-[9rem]`}
                >
                  <option value="">All events</option>
                  {eventOptions.map((code) => (
                    <option key={code} value={code}>
                      {eventLabel(code)}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <SearchField
              id="entrants-search"
              name="q"
              label={findLabel(noun)}
              placeholder="Name or club"
              defaultValue={query}
              className="min-w-0 flex-1 basis-56 sm:w-72"
            />
          </form>
        </div>

        {/* V3-PE05.1: a compact A–Z jump control tied to the letter sections
            already below — plain anchors, so it works with no JS and on
            mobile without a JS-only sticky index. Only letters that actually
            have a section get a link (never a dead jump to an empty letter),
            and the script hides any the filters empty. The links keep a real
            focus ring and an unabbreviated accessible name, because a
            one-glyph link is otherwise unreadable to anyone arriving on it
            by keyboard. */}
        {groups.length > 1 ? (
          <nav aria-label="Jump to letter" className="flex flex-wrap gap-1">
            {groups.map((group) => (
              <a
                key={group.letter}
                href={`#${anchorId(group.letter)}`}
                aria-label={letterJumpLabel(group.letter)}
                data-letter-jump={anchorId(group.letter)}
                className="rounded-xs px-1.5 py-1 text-xs font-semibold uppercase text-muted-foreground hover:bg-surface-sunken hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {group.letter}
              </a>
            ))}
          </nav>
        ) : null}
      </div>

      {groups.length > 0 ? (
        <div className={`min-w-0 ${LIST_CARD}`}>
          <div
            aria-hidden
            className={`hidden gap-x-4 px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:grid ${ROW_COLUMNS}`}
          >
            <span>Player</span>
            <span>Club</span>
            <span>Events</span>
          </div>
          {groups.map((group) => (
            <section
              key={group.letter}
              id={anchorId(group.letter)}
              data-letter-group
              /* `tabIndex={-1}` is what makes the jump a KEYBOARD jump: without
                 it the fragment moves the viewport but leaves focus behind, so
                 the next Tab returns to the toolbar instead of continuing into
                 the letter the reader just chose. */
              tabIndex={-1}
              className={`min-w-0 ${JUMP_CLEARANCE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent`}
            >
              <h3 className="border-t border-rule-soft bg-surface-sunken px-3 py-1 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
                {group.letter}
              </h3>
              <ul>
                {group.rows.map((row) => {
                  const codes = rowCodes(row);
                  return (
                    <li
                      key={row.playerKey}
                      data-entrant
                      data-name={searchKey(searchableName(row))}
                      data-club={searchKey(row.club ?? '')}
                      data-events={codes.join(' ')}
                      className={`grid gap-x-4 gap-y-0.5 border-t border-rule-soft px-3 py-2 text-sm sm:items-baseline ${ROW_COLUMNS} hover:bg-surface-sunken`}
                    >
                      <PersonRef
                        slug={slug}
                        identity={row.person.identity}
                        state={row.person.resolution}
                        label={row.person.label}
                        className="min-w-0 break-words font-medium"
                      />
                      {/* The club is the row's second searchable field, so it is
                          also the row's explanation when a query matched it and
                          not the name. `apply()` marks that case by promoting
                          this line out of the muted register (`data-club-match`).
                          A clubless row keeps an empty cell so the columns stay
                          aligned. */}
                      {row.club ? (
                        <p data-club-context className="min-w-0 break-words text-xs text-muted-foreground sm:text-sm">
                          {row.club}
                        </p>
                      ) : (
                        <span aria-hidden className="hidden sm:block" />
                      )}
                      {codes.length > 0 ? (
                        <p
                          className="text-xs text-muted-foreground sm:text-sm"
                          aria-label={codes.map(eventLabel).join(' · ')}
                        >
                          {linkEventsToDraws
                            ? codes.map((code, index) => (
                                <span key={code}>
                                  {index > 0 ? ' · ' : ''}
                                  <a href={eventHref(code)} className="underline-offset-4 hover:underline">
                                    {code}
                                  </a>
                                </span>
                              ))
                            : codes.join(' · ')}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      <p
        data-no-matches
        hidden={groups.length > 0 || undefined}
        className="text-sm text-muted-foreground"
      >
        {`No ${noun}s match your search.`}
      </p>
      <script type="module" src="/e/assets/entrants-filter.js" />
    </div>
  );
}
