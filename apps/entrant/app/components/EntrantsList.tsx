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
 */
import { eventCodeLabel } from '../lib/draws.types';
import type { PersonReferenceDTO } from '../lib/person.types';
import { personRefModel } from '../../public/assets/person-ref.js';
import { PersonRef } from './PersonRef';

interface DirectoryRow {
  playerKey: string;
  person: PersonReferenceDTO;
  club?: string | null;
  eventCodes: string[];
}

function searchableName(row: DirectoryRow): string {
  return personRefModel({ slug: '', identity: row.person.identity, state: row.person.resolution, label: row.person.label }).text;
}

function letterOf(row: DirectoryRow): string {
  const first = searchableName(row).charAt(0).toLocaleUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {`${entrants.length} ${entrants.length === 1 ? noun : `${noun}s`}`}
        </p>
        <div id="entrants-filter-root" className="w-full sm:w-72" />
      </div>

      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <section
            key={group.letter}
            data-letter-group
            className="min-w-0"
          >
            <h3 className="border-b border-rule-soft pb-1 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              {group.letter}
            </h3>
            <ul className="mt-2 grid gap-2.5">
              {group.rows.map((row) => (
                <li
                  key={row.playerKey}
                  data-entrant
                  data-name={searchableName(row).toLocaleLowerCase()}
                  data-club={(row.club ?? '').toLowerCase()}
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
                      aria-label={row.eventCodes.map(eventCodeLabel).join(' · ')}
                    >
                      {linkEventsToDraws ? row.eventCodes.map((code, index) => (
                        <span key={code}>
                          {index > 0 ? ' · ' : ''}
                          <a href={`/e/${encodeURIComponent(slug)}?tab=draws#draw-${encodeURIComponent(eventCodeLabel(code))}`} className="underline-offset-4 hover:underline">{eventCodeLabel(code)}</a>
                        </span>
                      )) : row.eventCodes.map(eventCodeLabel).join(' · ')}
                    </span>
                  ) : null}
                  {row.club ? (
                    <p className="text-xs text-muted-foreground">{row.club}</p>
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
