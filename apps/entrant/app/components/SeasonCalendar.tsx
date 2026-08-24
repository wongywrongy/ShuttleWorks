/**
 * §2.4: the season calendar — one card, one row per tournament, month
 * headers between them.
 *
 * The three views are three SHAPES of the same rows, all decided in
 * `lib/phase.ts`: `season` is ascending month sections with completed and
 * undated tournaments trailing; `completed` is month sections most-recent
 * first; `open` is one ungrouped list already ordered by closing deadline.
 * Nothing is grouped or sorted here — `groupByMonth` walks CONSECUTIVE rows,
 * so the caller's order is the answer and re-sorting would overrule it.
 *
 * **An undated tournament is always listed.** "Date to be confirmed" is a
 * real state a director is in, not missing data to hide, and the month
 * groupers necessarily drop rows they cannot place — so both dated views
 * carry a trailing undated section built from the rows the grouper skipped.
 * Rendering `monthGroupsDesc` alone silently lost an undated completed
 * tournament, which is the gap this file's ruling closes.
 *
 * Whole-row navigation is the `TournamentCard` stretched-link idiom: the name
 * carries an `::after` overlay covering the row, and the status cell's own
 * links sit above it (`relative z-10`, `SeasonStatusCell`).
 */
import { formatDateLong } from '../lib/format';
import {
  monthGroupsDesc,
  parseIsoDate,
  seasonSections,
  statusCell,
  type MonthGroup,
  type SeasonRow,
  type View,
} from '../lib/phase';
import { DateBadge } from './DateBadge';
import { SeasonStatusCell } from './SeasonStatusCell';

const UNDATED_LABEL = 'Date to be confirmed';

/** The month header's register: the small-caps micro-label `DateBadge` uses. */
function SectionHeader({ label }: { label: string }) {
  return (
    // No ground of its own and no `overflow-hidden` on the card to clip one
    // to the corner radius: this tier bans that class outright
    // (`noTruncation.test.ts`), and a header that is only type does not need
    // it. The rows' own top rules are what separate the header from its list.
    <h3 className="px-4 pb-1 pt-4 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </h3>
  );
}

function CalendarRow({ row }: { row: SeasonRow }) {
  // `DateBadge` is `aria-hidden` decoration, so the long date is spelled out
  // for assistive tech — and only when there is one to spell (an empty
  // `sr-only` element is an announcement of nothing).
  const dateText = formatDateLong(row.date);
  const meta = [row.venueName, row.organizer].filter((part) => part !== null && part !== '');
  return (
    <li className="relative flex items-center gap-4 border-t border-rule-soft px-4 py-3 transition-colors duration-fast ease-brand hover:bg-surface-sunken">
      <DateBadge date={row.date} />
      <div className="min-w-0 flex-1">
        <a
          href={`/e/${encodeURIComponent(row.slug)}`}
          className="font-medium text-foreground after:absolute after:inset-0 hover:underline"
        >
          {row.name ?? row.slug}
        </a>
        {dateText === '' ? null : <span className="sr-only">{dateText}</span>}
        {meta.length === 0 ? null : (
          <p className="break-words text-sm text-muted-foreground">{meta.join(' · ')}</p>
        )}
      </div>
      {/* The event count is the first thing to go at 380px: the name, the
          date and the status are the row's answer; the count is texture. */}
      <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">
        {`${row.eventCount} ${row.eventCount === 1 ? 'event' : 'events'}`}
      </span>
      <div className="flex min-w-[8rem] shrink-0 justify-end">
        <SeasonStatusCell cell={statusCell(row)} />
      </div>
    </li>
  );
}

function Section({ label, rows }: { label: string | null; rows: readonly SeasonRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      {label === null ? null : <SectionHeader label={label} />}
      <ul>
        {rows.map((row) => (
          <CalendarRow key={row.slug} row={row} />
        ))}
      </ul>
    </>
  );
}

function Months({ groups }: { groups: readonly MonthGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <Section key={group.key} label={group.label} rows={group.rows} />
      ))}
    </>
  );
}

export function SeasonCalendar({ rows, view }: { rows: SeasonRow[]; view: View }) {
  const undated = rows.filter((row) => parseIsoDate(row.date) === null);
  const sections = view === 'season' ? seasonSections(rows) : null;
  return (
    // `id`: the NOW strip's "+N more" lands here, so the band's second link
    // is a jump down this page rather than a second listing.
    <section
      id="calendar"
      aria-label="Season calendar"
      className="rounded-lg border border-rule-soft bg-surface-raised pb-2 shadow-sm"
    >
      {sections === null ? (
        view === 'completed' ? (
          <>
            <Months groups={monthGroupsDesc(rows)} />
            <Section label={UNDATED_LABEL} rows={undated} />
          </>
        ) : (
          <Section label={null} rows={rows} />
        )
      ) : (
        <>
          <Months groups={sections.months} />
          <Section label={UNDATED_LABEL} rows={sections.undated} />
          <Section label="Completed" rows={sections.completed} />
        </>
      )}
    </section>
  );
}
