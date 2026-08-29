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

interface DirectoryRow {
  playerKey?: string;
  personKey?: string | null;
  name: string;
  club?: string | null;
  eventCodes: string[];
}

function letterOf(name: string): string {
  const first = (name[0] ?? '').toUpperCase();
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
  const sorted = [...entrants].sort((a, b) => a.name.localeCompare(b.name));
  const groups: { letter: string; rows: DirectoryRow[] }[] = [];
  for (const row of sorted) {
    const letter = letterOf(row.name);
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

      <div className="gap-6 sm:columns-2 lg:columns-3">
        {groups.map((group) => (
          <section
            key={group.letter}
            data-letter-group
            className="mb-6 break-inside-avoid"
          >
            <h3 className="border-b border-rule-soft pb-1 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              {group.letter}
            </h3>
            <ul className="mt-2 grid gap-2">
              {group.rows.map((row) => (
                <li
                  key={row.playerKey ?? row.personKey ?? row.name}
                  data-entrant
                  data-name={row.name.toLowerCase()}
                  data-club={(row.club ?? '').toLowerCase()}
                  className="text-sm"
                >
                  {row.personKey ? (
                    <a
                      href={`/e/${encodeURIComponent(slug)}/players/${encodeURIComponent(row.personKey)}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">{row.name}</span>
                  )}
                  {row.eventCodes.length > 0 ? (
                    <span
                      className="ml-2 inline-flex flex-wrap gap-1"
                      aria-label={row.eventCodes.map(eventCodeLabel).join(' · ')}
                    >
                      {row.eventCodes.map((code) => (
                        linkEventsToDraws ? (
                          <a
                            key={code}
                            href={`/e/${encodeURIComponent(slug)}?tab=draws#draw-${encodeURIComponent(eventCodeLabel(code))}`}
                            className="rounded-full border border-rule-soft bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground"
                          >
                            {eventCodeLabel(code)}
                          </a>
                        ) : (
                          <span
                            key={code}
                            className="rounded-full border border-rule-soft bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground"
                          >
                            {eventCodeLabel(code)}
                          </span>
                        )
                      ))}
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
