/**
 * Shared public player directory (SP-P7 §3.2): alphabetical,
 * letter-grouped, optional profile links with the club beneath, and event
 * codes riding the row. The component name is retained for compatibility
 * with its original Entrants-only callers and tests.
 *
 * This SUPERSEDES the by-event grouping (and its `#event-{code}` anchors):
 * "who is playing" is one alphabetical list of people, the incumbent's own
 * shape. The event dimension stays ON the row as codes. Club appears under
 * the C4 ruling — the acknowledgment copy now consents to "name and club".
 *
 * Multi-column via CSS columns, letter groups kept whole
 * (`break-inside-avoid`); single column at phone widths. The search filter
 * is progressive enhancement: rows carry `data-name`/`data-club`, and the
 * page-scoped script (`/e/assets/entrants-filter.js`) mounts an input into
 * `#entrants-filter-root` — without JS there is no dead search box,
 * because the box does not exist.
 *
 * **The toolbar (public-visual-fixes P2).** Count, search box and A–Z index
 * are ONE sticky element, not three things that scroll apart: on a 252-name
 * page the index used to leave the viewport in the first flick, which is
 * exactly when it starts being wanted. It sticks at `top-0` because nothing
 * above it on this tier is sticky — the shell header and the tournament
 * frame both scroll away — and `TOOLBAR_OFFSET` is the ONE place that
 * decision is written down, shared with the letter sections' `scroll-mt` so
 * a letter jump can never land underneath the bar it was clicked in.
 *
 * The searchable text is NORMALISED (`searchKey`) rather than merely
 * lowercased, and by the same function the browser script uses, so "Kjaer"
 * finds `Kjær` and "Arin" finds `Arın`. A directory whose search only
 * matches people who typed their own diacritics is a directory that hides
 * people.
 */
import { eventCodeLabel } from '../lib/draws.types';
import { eventLabel } from '../lib/eventLabels';
import type { PersonReferenceDTO } from '../lib/person.types';
import { personRefModel } from '../../public/assets/person-ref.js';
import { searchKey } from '../../public/assets/entrants-filter.js';
import { PersonRef } from './PersonRef';

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

export function EntrantsList({
  slug,
  entrants,
  noun = 'entrant',
  linkEventsToDraws = false,
}: {
  slug: string;
  entrants: DirectoryRow[];
  noun?: 'entrant' | 'player';
  linkEventsToDraws?: boolean;
}) {
  const sorted = [...entrants].sort((a, b) => searchableName(a).localeCompare(searchableName(b)));
  const groups: { letter: string; rows: DirectoryRow[] }[] = [];
  for (const row of sorted) {
    const letter = letterOf(row);
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.rows.push(row);
    else groups.push({ letter, rows: [row] });
  }

  return (
    <div className="grid gap-4">
      {/* ONE toolbar: the count, the search mount and the A–Z index travel
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
            {`${entrants.length} ${entrants.length === 1 ? noun : `${noun}s`}`}
          </p>
          <div id="entrants-filter-root" data-filter-noun={noun} className="w-full sm:w-72" />
        </div>

        {/* V3-PE05.1: a compact A–Z jump control tied to the letter sections
            already below — plain anchors, so it works with no JS and on
            mobile without a JS-only sticky index. Only letters that actually
            have a section get a link (never a dead jump to an empty letter).
            The links keep a real focus ring and an unabbreviated accessible
            name, because a one-glyph link is otherwise unreadable to anyone
            arriving on it by keyboard. */}
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

      <div className="grid items-start gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
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
            className={`min-w-0 ${JUMP_CLEARANCE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
          >
            <h3 className="border-b border-rule-soft pb-1 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              {group.letter}
            </h3>
            <ul className="mt-2 grid gap-2.5">
              {group.rows.map((row) => (
                <li
                  key={row.playerKey}
                  data-entrant
                  data-name={searchKey(searchableName(row))}
                  data-club={searchKey(row.club ?? '')}
                  className="rounded-md border border-transparent px-2 py-1 text-sm transition-colors hover:border-rule-soft hover:bg-surface-sunken"
                >
                  <PersonRef
                    slug={slug}
                    identity={row.person.identity}
                    state={row.person.resolution}
                    label={row.person.label}
                    className="font-medium"
                  />
                  {row.eventCodes.length > 0 ? (
                    <span
                      className="ml-2 text-xs text-muted-foreground"
                      aria-label={row.eventCodes.map(eventLabel).join(' · ')}
                    >
                      {linkEventsToDraws ? row.eventCodes.map((code, index) => (
                        <span key={code}>
                          {index > 0 ? ' · ' : ''}
                          <a href={`/e/${encodeURIComponent(slug)}?tab=draws#draw-${encodeURIComponent(eventCodeLabel(code))}`} className="underline-offset-4 hover:underline">{eventCodeLabel(code)}</a>
                        </span>
                      )) : row.eventCodes.map(eventCodeLabel).join(' · ')}
                    </span>
                  ) : null}
                  {/* The club is the row's second searchable field, so it is
                      also the row's explanation when a query matched it and
                      not the name. `apply()` marks that case by promoting
                      this line out of the muted register (`data-club-match`)
                      — otherwise a search for a club returns a screen of
                      names with no visible reason why any of them is there.
                      The SSR class list is the resting state; the script
                      swaps it and puts it back. */}
                  {row.club ? (
                    <p data-club-context className="text-xs text-muted-foreground">
                      {row.club}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p data-no-matches hidden className="text-sm text-muted-foreground">
        {`No ${noun}s match your search.`}
      </p>
      <script type="module" src="/e/assets/entrants-filter.js" />
    </div>
  );
}
