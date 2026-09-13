/**
 * P5: ONE season calendar — one card, one row per tournament, month headers
 * between them, and no lifecycle segments to switch between.
 *
 * The page reads top to bottom as time does: what is being played NOW, once,
 * under its own "Live now" header (public refinement 2026-09-12 — the
 * separate banner that used to repeat the same tournament above the list is
 * gone); then what is still to come, ascending, in full visual weight; then
 * "Earlier this season", where the same season's finished tournaments sit
 * descending, muted, with a Results action and no venue line. There is no
 * archive elsewhere and no "looking for past results?" detour, because the
 * past is already on this page.
 *
 * Nothing is grouped, ordered or decided here — `seasonModel` (`lib/phase.ts`)
 * hands over the sections already built, and `groupByMonth` walks CONSECUTIVE
 * rows, so re-sorting anything in this file would silently overrule it.
 *
 * **An undated tournament is always listed.** "Date to be confirmed" is a real
 * state a director is in, not missing data to hide, and the month grouper
 * necessarily drops rows it cannot place — so each half of the page carries
 * the rows the grouper skipped rather than losing them. Nothing here invents a
 * date to put a tournament in a month.
 *
 * Whole-row navigation is the stretched-link idiom: the name carries an
 * `::after` overlay covering the row, and the action slot's own links sit
 * above it (`relative z-10`, `SeasonStatusCell`).
 */
import { formatDateLong } from '../lib/format';
import {
  actionCell,
  displayTitle,
  type MonthGroup,
  type SeasonModel,
  type SeasonRow,
} from '../lib/phase';
import { DateBadge } from './DateBadge';
import { SeasonStatusCell } from './SeasonStatusCell';

const UNDATED_LABEL = 'Date to be confirmed';

/** The month header's register: the small-caps micro-label `DateBadge` uses. */
function SectionHeader({ label, live = false }: { label: string; live?: boolean }) {
  return (
    // No ground of its own and no `overflow-hidden` on the card to clip one
    // to the corner radius: this tier bans that class outright
    // (`noTruncation.test.ts`), and a header that is only type does not need
    // it. The rows' own top rules are what separate the header from its list.
    // The live header carries the live TONE in its text (ADR 0028: text, no
    // tinted band, no dot) — the one visual distinction between a tournament
    // being played and one still to come.
    <h3 className={`px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.06em] ${live ? 'text-status-live' : 'text-muted-foreground'}`}>
      {label}
    </h3>
  );
}

/**
 * One row. `past` is the whole difference between the two halves of the page:
 * a muted title, no venue line (a finished tournament's hall is not what a
 * reader is here for), and the results-only action `actionCell` already
 * decided.
 */
function CalendarRow({ row, past }: { row: SeasonRow; past: boolean }) {
  // `DateBadge` is `aria-hidden` decoration, so the long date is spelled out
  // for assistive tech — and only when there is one to spell (an empty
  // `sr-only` element is an announcement of nothing).
  const dateText = formatDateLong(row.date);
  // P1/D2: separate venue, locality, and organizer into independent text
  // lines rather than joining with punctuation. Past tournaments show only
  // the name and action.
  const venueLine = past ? null : [row.venueName, row.locality]
    .filter((part) => part !== null && part !== '')
    .join(', ');
  // The organizer, when the projection names one. The API omits the
  // bootstrap workspace's placeholder since 2026-09-12; the guard stays for
  // an older API still on the wire, because the placeholder names nobody.
  const organizerLine =
    past || !row.organizer || row.organizer === 'Local Workspace' ? null : row.organizer;

  return (
    <li className="relative flex items-center gap-4 border-t border-rule-soft px-4 py-2.5 transition-colors duration-fast ease-brand hover:bg-surface-sunken">
      <DateBadge date={row.date} />
      {/* Task 11 QA, 380px: the action cell used to be a sibling of the date
          badge with an unconditional `min-w-[8rem] shrink-0`. That set the
          card's min-content width to ~364px against a 348px content box, so
          the page scrolled sideways and the control row could not wrap —
          against R11. Below `sm:` the badge keeps its line with the name and
          the action drops UNDER the name block (this column), where it has
          the full remaining width; from `sm:` up the column is a row again
          and the original one-line anatomy is unchanged. Same shape as
          `TournamentCard`'s breakpoint-scoped float: the defect was the
          unconditional property, not the property. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <a
            href={`/e/${encodeURIComponent(row.slug)}`}
            /* P7: a completed tournament's NAME is still the row's primary
               text, so it reads in normal ink; what makes the past section
               quieter is that its rows carry no venue/organizer line and no
               entry action, not that the name itself was greyed to the
               muted register. */
            className={`after:absolute after:inset-0 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              past ? 'text-foreground' : 'font-medium text-foreground'
            }`}
          >
            {displayTitle(row)}
          </a>
          {dateText === '' ? null : <span className="sr-only">{dateText}</span>}
          {/* Venue and location on one line (when both exist), organizer on
              its own line below. P1/D2: no decorative separators. */}
          {venueLine ? (
            <p className="break-words text-sm text-muted-foreground">{venueLine}</p>
          ) : null}
          {organizerLine ? (
            <p className="break-words text-sm text-muted-foreground">{organizerLine}</p>
          ) : null}
        </div>
        {/* v3-consolidated work package 26b: `min-w-0` below `sm:`. This
            flex item had no width constraint below `sm:` at all (the
            `sm:`-prefixed utilities are inert here), so its one child — a
            plain `<span>`, promoted to a flex item's block layout by
            becoming a flex child — took its unwrapped preferred width
            instead of wrapping at its own spaces. `min-w-0` lets it shrink
            to the column's width and wrap like the sibling `<p>` already
            does. */}
        <div className="flex min-w-0 sm:min-w-[8rem] sm:shrink-0 sm:justify-end">
          <SeasonStatusCell cell={actionCell(row, past)} />
        </div>
      </div>
    </li>
  );
}

function Section({ label, rows, past, live = false }: {
  label: string | null;
  rows: readonly SeasonRow[];
  past: boolean;
  live?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      {label === null ? null : <SectionHeader label={label} live={live} />}
      <ul>
        {rows.map((row) => (
          <CalendarRow key={row.slug} row={row} past={past} />
        ))}
      </ul>
    </>
  );
}

function Months({ groups, past }: { groups: readonly MonthGroup[]; past: boolean }) {
  return (
    <>
      {groups.map((group) => (
        <Section
          key={`${group.key}:${group.rows[0]?.slug}`}
          label={group.label}
          rows={group.rows}
          past={past}
        />
      ))}
    </>
  );
}

export function SeasonCalendar({ model }: { model: SeasonModel }) {
  const hasPast = model.past.length > 0 || model.pastUndated.length > 0;
  const hasUpcoming = model.upcoming.length > 0 || model.upcomingUndated.length > 0;
  return (
    // `id`: the slice and season controls land here, so a filter change
    // scrolls to the list rather than the masthead.
    <section
      id="calendar"
      aria-label="Season calendar"
      // v3-consolidated work package 26b: `min-w-0`. This section is a CSS
      // Grid item of `discovery.tsx`'s implicit-track wrapper, and a grid
      // item's default `min-width: auto` was measured forcing the shared
      // column to ~330px at a 320px viewport, driven by one calendar row's
      // longest unbroken text run. `min-w-0` is what caps this card — and
      // with it, the shared column — at the grid's real available width.
      className="min-w-0 rounded-lg border border-rule-soft bg-surface-raised pb-2 shadow-sm"
    >
      {/* Live first, ONCE: the rows being played now, under a header in the
          live tone. They are not repeated under their month below. */}
      {model.live.length > 0 ? (
        <>
          <h2 className="sr-only">Live now</h2>
          <Section label="Live now" rows={model.live} past={false} live />
        </>
      ) : null}
      {hasUpcoming ? (
        <>
          {/* The upcoming half has no visible heading — it is the top of the
              page and the month headers name it — but the month headers are
              still subordinate to something, so the outline says what they
              are under. */}
          <h2 className="sr-only">Upcoming tournaments</h2>
          <Months groups={model.upcoming} past={false} />
          <Section label={UNDATED_LABEL} rows={model.upcomingUndated} past={false} />
        </>
      ) : null}
      {hasPast ? (
        <>
          {/* `id`: the retired `?view=completed` deep link lands here, so an
              old shared URL still reaches the results it named — without a
              lifecycle segment existing to select. The heading is omitted
              when the reader has asked for the past alone: the slice control
              already names it. */}
          <h2
            id="past"
            className={
              model.show === 'past'
                ? 'sr-only'
                : `scroll-mt-4 px-4 pb-1 pt-4 text-sm font-semibold text-foreground${
                    model.live.length > 0 || hasUpcoming ? ' border-t border-rule-soft' : ''
                  }`
            }
          >
            {model.season === null ? 'Earlier tournaments' : 'Earlier this season'}
          </h2>
          <Months groups={model.past} past />
          <Section label={UNDATED_LABEL} rows={model.pastUndated} past />
        </>
      ) : null}
    </section>
  );
}
