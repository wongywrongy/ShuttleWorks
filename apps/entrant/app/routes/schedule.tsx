/** `/e/{slug}/schedule` — public, URL-backed matches document. */
import { Fragment } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";

import { EmptyState } from "../components/EmptyState";
import type { MatchCardData } from "../components/MatchCard";
import { MATCH_ROW_COLUMNS, MatchRow } from "../components/MatchRow";
import { MessagePage } from "../components/MessagePage";
import { PlayShell } from "../components/PlayShell";
import { SearchField } from "../components/SearchField";
import { SegmentedNav } from "../components/SegmentedNav";
import { TournamentFrame } from "../components/TournamentFrame";
import { ApiError, apiGet } from "../lib/apiFetch.server";
import { demoNowMs } from "../lib/demoClock.server";
import type { EntryPageDTO } from "../lib/entryPage.types";
import { eventDisciplineLabel } from "../lib/draws.types";
import { formatCalendarDayShort, formatInstantInZone } from "../lib/format";
import {
  SCHEDULE_STATES,
  schedulePublicState,
  schedulePublicStateLabel,
  scheduleDateLabel,
  scheduleStateLabel,
  type ScheduleDayFacetDTO,
  type ScheduleMatchesDTO,
  type ScheduleMatchDTO,
  type ScheduleState,
} from "../lib/schedule.types";
import { ACTION_LINK, ACTION_LINK_MUTED, EYEBROW, LIST_CARD, SELECT_CONTROL, TEXT_SECONDARY } from "../lib/ui";
import { Chevron } from "../components/Chevron";
import type { Route } from "./+types/schedule";

export type ScheduleOrganization = "time" | "court";
export interface ScheduleFilters {
  day: string;
  event: string;
  player: string;
  court: string;
  state: ScheduleState | "";
  page: number;
  organization: ScheduleOrganization;
}
export interface ScheduleLoaderData {
  page: EntryPageDTO;
  matches: ScheduleMatchesDTO;
  filters: ScheduleFilters;
  nowMs: number;
}

function hasScheduleFilters(filters: ScheduleFilters): boolean {
  return Boolean(
    filters.day ||
    filters.event ||
    filters.player ||
    filters.court ||
    filters.state ||
    filters.page > 1,
  );
}
function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

function parseFilters(request: Request): ScheduleFilters {
  const query = new URL(request.url).searchParams;
  const rawPage = Number.parseInt(query.get("page") ?? "1", 10);
  const state = query.get("state") ?? "";
  const organization = query.get("organization") ?? query.get("view") ?? "time";
  return {
    day: /^\d{4}-\d{2}-\d{2}$/.test(query.get("day") ?? "")
      ? (query.get("day") ?? "")
      : "",
    event: (query.get("event") ?? "").trim(),
    player: (query.get("player") ?? "").trim(),
    court: /^\d+$/.test(query.get("court") ?? "")
      ? (query.get("court") ?? "")
      : "",
    state: SCHEDULE_STATES.includes(state as ScheduleState)
      ? (state as ScheduleState)
      : "",
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    organization: organization === "court" ? "court" : "time",
  };
}
/** "124 matches" / "1 match" — a count always carries its noun (V3-PE09.3):
 * a bare number glued to a date reads as part of the date, not a count. */
function dayMatchCountLabel(count: number): string {
  return `${count} ${count === 1 ? "match" : "matches"}`;
}
function matchesPath(slug: string, filters: ScheduleFilters): string {
  const params = new URLSearchParams();
  if (filters.day) params.set("day", filters.day);
  if (filters.event) params.set("event", filters.event);
  if (filters.player) params.set("player", filters.player);
  if (filters.court) params.set("court", filters.court);
  if (filters.state) params.set("state", filters.state);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.organization !== "time")
    params.set("organization", filters.organization);
  const query = params.toString();
  return `/e/${encodeURIComponent(slug)}/schedule${query ? `?${query}` : ""}`;
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { slug?: string };
}) {
  const slug = params.slug;
  if (!slug) throw notFound();
  const filters = parseFilters(request);
  try {
    const page = await apiGet<EntryPageDTO>(
      `/e/api/page/${encodeURIComponent(slug)}`,
    );
    const query = new URLSearchParams();
    if (filters.day) query.set("day", filters.day);
    if (filters.event) query.set("event", filters.event);
    if (filters.player) query.set("player", filters.player);
    if (filters.court) query.set("court", filters.court);
    if (filters.state) query.set("state", filters.state);
    query.set("page", String(filters.page));
    const matches = await apiGet<ScheduleMatchesDTO>(
      `/e/api/page/${encodeURIComponent(slug)}/matches?${query.toString()}`,
    );
    return {
      page,
      matches,
      filters,
      nowMs: demoNowMs(),
    } satisfies ScheduleLoaderData;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }
}
export const meta: Route.MetaFunction = ({ data }) =>
  !data
    ? [{ title: "Schedule not found" }]
    : [{ title: `Schedule · ${data.page.tournament.name ?? "Tournament"}` }];

/**
 * "By court" groups matches under their assigned court; a match with no
 * approved court cannot go in a real court's queue, so it gets its own
 * honestly-named bucket instead of the banned per-card placeholder wording
 * (contract §3.2 forbids "Court pending" as a per-card court line, but a
 * group still needs some label for the matches it cannot yet place).
 */
function matchCourt(match: ScheduleMatchDTO): string {
  return match.court === null ? "Court to be confirmed" : `Court ${match.court}`;
}
function isCompleted(match: ScheduleMatchDTO): boolean {
  return (
    match.status === "completed" ||
    match.status === "walkover" ||
    match.status === "retired"
  );
}
/**
 * One anatomy: a schedule row dressed as the public MatchCard (ADR 0028).
 * Every name flows through the card's PersonGroup / PersonRef seam; this
 * adapter only reshapes the wire DTO and never reads an identity.
 */
function scheduleToMatch(
  match: ScheduleMatchDTO,
  options: { showDate: boolean } = { showDate: true },
): MatchCardData {
  const decided = isCompleted(match);
  // Contract §3.5/§5.1 rule 3 (public-visual-fixes P3): the winner comes
  // from the AUTHORITATIVE outcome the wire now publishes. This adapter used
  // to count games won and call the higher total the winner — which is
  // precisely the inference retirement and walkover break: a retired match's
  // ledger usually favours the side that did not win it, and a walkover has
  // no games at all.
  const winnerIndex =
    match.winnerSide === 'A' ? 0 : match.winnerSide === 'B' ? 1 : null;
  const sides = [0, 1].map((index) => {
    const side = match.sides[index];
    return {
      persons: side?.persons ?? [],
      placeholder: side?.placeholder ?? (side ? null : "To be decided"),
      unresolved: side?.unresolved ?? null,
      winner: winnerIndex === index,
      seed: side?.seed ?? null,
    };
  });
  return {
    eventCode: match.eventCode,
    roundLabel: match.roundLabel,
    // §6.1: a whole-day schedule is a MIXED-EVENT view, so it keeps the
    // event code — `MS R16·2 · 10:00 · Court 3`. Same authority, same
    // string as the operator's list and the bracket node; only the event
    // code's presence differs, and it differs because the context does.
    reference: match.reference ?? null,
    shortReference: match.shortReference ?? null,
    sides,
    score: match.score,
    liveScore: match.liveScore ?? null,
    decided,
    status: match.status,
    scheduledTime: match.scheduledTime,
    // Contract §3.2: no raw ISO date in card prose (D12) and no repeated
    // date on a card already inside a day-scoped context (V3-PE09.3) — the
    // day nav or heading already states it there. Elsewhere, a human date
    // label from the same authority the day heading uses, never the ISO
    // string verbatim.
    playedOn:
      options.showDate && match.scheduledDate
        ? scheduleDateLabel(match.scheduledDate)
        : null,
    court: match.court,
    updatedAt: match.updatedAt,
  };
}
/** `EYEBROW` recoloured in the live tone (kept literal for the Tailwind scan). */
const LIVE_EYEBROW = "text-xs font-bold uppercase tracking-[0.06em] text-status-live";
/**
 * One schedule match as one aligned ROW (public refinement 2026-09-12): the
 * card grid is gone from the main listing, so a spectator scans time and
 * court, event and round, the two sides and the score down fixed columns
 * instead of reading a wall of cards. The row is the shared `MatchRow`;
 * this adapter only reshapes the wire DTO.
 *
 * `showDate` is spelled INTO the first column when the list spans days:
 * the day nav or heading already states it otherwise (V3-PE09.3).
 */
function ScheduleMatchRow({
  match,
  slug,
  showDate = true,
}: {
  match: ScheduleMatchDTO;
  slug: string;
  showDate?: boolean;
}) {
  const data = scheduleToMatch(match, { showDate: false });
  return (
    <MatchRow
      match={data}
      slug={slug}
      context={showDate && match.scheduledDate ? "player" : "schedule"}
      dayLabel={showDate && match.scheduledDate ? scheduleDateLabel(match.scheduledDate) : null}
    />
  );
}

/** The column header over a run of rows, aligned to `MATCH_ROW_COLUMNS`.
 *  Decoration for a sighted reader at `md:` and up; each row already names
 *  its facts for assistive tech. */
function RowHeader() {
  return (
    <div
      aria-hidden
      className={`hidden gap-x-4 px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-[0.06em] ${TEXT_SECONDARY} md:grid ${MATCH_ROW_COLUMNS}`}
    >
      <span>Time · court</span>
      <span>Event · round</span>
      <span className="grid md:grid-cols-[minmax(0,1fr)_auto]">
        <span>Players</span>
        <span>Score · status</span>
      </span>
    </div>
  );
}

/** A run of rows under one heading, in the tier's list card. */
function RowList({
  slug,
  matches,
  showDate,
}: {
  slug: string;
  matches: ScheduleMatchDTO[];
  showDate: boolean;
}) {
  return (
    <div className={LIST_CARD}>
      <RowHeader />
      <ul>
        {matches.map((match) => (
          <ScheduleMatchRow key={match.matchKey} match={match} slug={slug} showDate={showDate} />
        ))}
      </ul>
    </div>
  );
}

function dayDistance(a: string, b: string): number {
  const first = Date.parse(`${a}T00:00:00Z`),
    second = Date.parse(`${b}T00:00:00Z`);
  return Number.isFinite(first) && Number.isFinite(second)
    ? Math.round(Math.abs(second - first) / 86400000)
    : 99;
}

/**
 * Human-readable freshness, converted into the tournament's own timezone.
 *
 * Contract §7.1 (public P0): the instant is CONVERTED to venue-local time —
 * removing a suffix from a UTC value would be a wrong time stated
 * confidently — but the rendered prose carries no zone abbreviation, offset
 * or IANA identifier, because the frame already said "All times local to the
 * venue" once. `timeZoneName: 'short'` is what left with P1.
 *
 * P7: it delegates to the entrant time authority (`lib/format.ts`) instead
 * of composing its own `Intl` format, which rendered this ONE date on the
 * tier in American order and on a 12-hour clock. An unparseable server value
 * is returned verbatim — at worst the server's own display string, never an
 * invented date.
 */
export function formatScheduleUpdated(value: string | null, timeZone: string): string {
  if (!value) return '';
  return formatInstantInZone(value, timeZone) ?? value;
}

/** The sticky row's offset, stated once — the same decision `EntrantsList`
 * writes down for the directory toolbar: nothing above it on this tier is
 * sticky, so it sits at the top of the viewport. */
const TOOLBAR_OFFSET = "top-0";
/**
 * The day control, in the one sticky row.
 *
 * A short, consecutive run of days stays a row of LINKS — the shape a
 * spectator can hit without opening anything, and one that needs no script.
 * A long or gappy run (a season-length archive) becomes a native `<select>`
 * inside the filter form instead of the month-grouped block of dozens of
 * anchors it used to be: that block could not live in one row, and the row
 * is the point (P7). Either way the mechanism is native — the select carries
 * a no-JS submit through the form's own `sr-only` control, and the
 * change-submit script only saves the second step.
 */
const DAY_LINK_LIMIT = 5;

function scheduleDays(filters: ScheduleFilters, matches: ScheduleMatchesDTO): ScheduleDayFacetDTO[] {
  const facets = matches.facets.days;
  return [
    ...facets,
    ...(filters.day && !facets.some((day) => day.day === filters.day)
      ? [{ day: filters.day, count: 0 }]
      : []),
  ]
    .filter(
      (day, index, list) =>
        list.findIndex((other) => other.day === day.day) === index,
    )
    .sort((a, b) => a.day.localeCompare(b.day));
}

function daysAreLinkable(days: ScheduleDayFacetDTO[]): boolean {
  return (
    days.length > 0 &&
    days.length <= DAY_LINK_LIMIT &&
    days.every((day, index) => index === 0 || dayDistance(days[index - 1].day, day.day) <= 1)
  );
}

function DayNavigation({
  slug,
  filters,
  days,
}: {
  slug: string;
  filters: ScheduleFilters;
  days: ScheduleDayFacetDTO[];
}) {
  if (!days.length) return null;
  // Refinement 2026-09-12: a SHORT day (`Wed 5 Aug`) with the count as a
  // tabular figure beside it, in ONE row that scrolls inside itself on a
  // phone — the long `Wednesday, August 5 · 64 matches` labels wrapped the
  // row three deep at 1280px. `aria-label` on each item keeps the full
  // spelling and the noun for assistive tech.
  return (
    <div className="-mx-4 overflow-x-auto px-4 scroll-px-4">
      <SegmentedNav
        label="Schedule days"
        wrap={false}
        segments={[
          {
            label: "All days",
            href: matchesPath(slug, { ...filters, day: "", page: 1 }),
            current: filters.day === "",
          },
          ...days.map((day) => ({
            label: formatCalendarDayShort(day.day),
            href: matchesPath(slug, { ...filters, day: day.day, page: 1 }),
            current: Boolean(filters.day) && day.day === filters.day,
            count: day.count,
            extra: (
              <span className="sr-only">{`, ${scheduleDateLabel(day.day)}, ${dayMatchCountLabel(day.count)}`}</span>
            ),
          })),
        ]}
      />
    </div>
  );
}

function DaySelect({
  filters,
  days,
}: {
  filters: ScheduleFilters;
  days: ScheduleDayFacetDTO[];
}) {
  return (
    <>
      <label className="sr-only" htmlFor="schedule-day">
        Day
      </label>
      <select
        id="schedule-day"
        name="day"
        defaultValue={filters.day}
        className={`${SELECT_CONTROL} w-auto`}
      >
        <option value="">All days</option>
        {days.map((day) => (
          <option key={day.day} value={day.day}>
            {`${scheduleDateLabel(day.day)} · ${dayMatchCountLabel(day.count)}`}
          </option>
        ))}
      </select>
    </>
  );
}

function OrganizationSwitch({
  slug,
  filters,
}: {
  slug: string;
  filters: ScheduleFilters;
}) {
  const href = (organization: ScheduleOrganization) =>
    matchesPath(slug, { ...filters, organization, page: 1 });
  return (
    <SegmentedNav
      label="Schedule organization"
      currentAttr="true"
      segments={[
        { label: "By time", href: href("time"), current: filters.organization === "time" },
        { label: "By court", href: href("court"), current: filters.organization === "court" },
      ]}
    />
  );
}

/**
 * ONE sticky control row (P7): day · By time / By court · search, with the
 * remaining facets folded into a disclosure that opens in place.
 *
 * It used to be two stacked cards — a day/organisation band above a
 * four-column filter grid with an "Apply" button — over an explanatory
 * sentence that repeated the controls in prose. Everything here is native:
 * the day and the organisation are links (or a select), the search is a GET
 * field whose Enter submits, and the only submit control is `sr-only`.
 */
function ScheduleControls({
  slug,
  filters,
  matches,
  page,
}: {
  slug: string;
  filters: ScheduleFilters;
  matches: ScheduleMatchesDTO;
  page: EntryPageDTO;
}) {
  const eventMetadata = new Map(page.events.map((event) => [event.code, event]));
  const events = [
    ...matches.facets.events,
    ...(filters.event && !matches.facets.events.includes(filters.event) ? [filters.event] : []),
  ].filter((code, index, list) => list.indexOf(code) === index).map((code) => ({
    code,
    label: eventMetadata.get(code)?.discipline ?? eventDisciplineLabel(code),
  }));
  const courts = [
    ...new Set(
      [...matches.facets.courts.map(String), filters.court].filter(Boolean),
    ),
  ].sort((a, b) => Number(a) - Number(b));
  const states = [
    ...new Set([...matches.facets.states, filters.state].filter(Boolean)),
  ] as ScheduleState[];
  const days = scheduleDays(filters, matches);
  const dayAsLinks = daysAreLinkable(days);
  const activeMore = [filters.event, filters.court, filters.state].filter(Boolean).length;
  return (
    <div
      className={`sticky ${TOOLBAR_OFFSET} z-20 -mx-4 border-b border-rule-soft bg-surface-base px-4 py-2`}
    >
      {/* Refinement 2026-09-12: TWO short rows instead of one that wrapped
          three deep. The days on their own scrolling strip; then the
          organisation, the player search and the secondary filters. */}
      <form
        method="get"
        action={`/e/${encodeURIComponent(slug)}/schedule`}
        data-schedule-filters
        aria-label="Filter schedule"
        className="grid gap-y-2"
      >
        <input type="hidden" name="organization" value={filters.organization} />
        {dayAsLinks ? <input type="hidden" name="day" value={filters.day} /> : null}
        {dayAsLinks ? (
          <DayNavigation slug={slug} filters={filters} days={days} />
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {!dayAsLinks && days.length ? <DaySelect filters={filters} days={days} /> : null}
          <OrganizationSwitch slug={slug} filters={filters} />
          <SearchField
            id="schedule-player"
            name="player"
            label="Search matches by player"
            placeholder="Search a player"
            defaultValue={filters.player}
            submitLabel="Search matches"
            className="min-w-0 flex-1 basis-48"
          />
          {/* The secondary filters. OPEN in the server document, so a reader
              without script sees them at every width; from `md:` up the
              summary is hidden and the selects sit inline in this row. Below
              `md:` the script closes the disclosure when none is active and
              labels it with the count, so a closed disclosure never hides a
              filter the list is under. */}
          <details
            data-schedule-more
            open
            className="group min-w-0 basis-full md:flex md:basis-auto md:items-center"
          >
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 text-sm font-medium text-foreground marker:hidden md:hidden">
              <span data-schedule-more-label>{activeMore > 0 ? `Filters · ${activeMore}` : "Filters"}</span>
              <Chevron direction="down" className="text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 md:mt-0 md:flex md:flex-wrap md:items-center">
              <div>
                <label className="sr-only" htmlFor="schedule-event">Event</label>
                <select
                  id="schedule-event"
                  name="event"
                  defaultValue={filters.event}
                  className={`${SELECT_CONTROL} md:w-auto`}
                >
                  <option value="">All events</option>
                  {events.map((event) => (
                    <option key={event.code} value={event.code}>
                      {event.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sr-only" htmlFor="schedule-court">Court</label>
                <select
                  id="schedule-court"
                  name="court"
                  defaultValue={filters.court}
                  className={`${SELECT_CONTROL} md:w-auto`}
                >
                  <option value="">All courts</option>
                  {courts.map((court) => (
                    <option key={court} value={court}>{`Court ${court}`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sr-only" htmlFor="schedule-state">Status</label>
                <select
                  id="schedule-state"
                  name="state"
                  defaultValue={filters.state}
                  className={`${SELECT_CONTROL} md:w-auto`}
                >
                  <option value="">Any status</option>
                  {states.map((state) => (
                    <option key={state} value={state}>
                      {scheduleStateLabel(state)}
                    </option>
                  ))}
                </select>
              </div>
              {/* The scriptless path: with no JavaScript a changed select is
                  applied by this control (or by Enter in the search field).
                  With the enhancement, changing a select applies it at once
                  and this is never needed. */}
              <button type="submit" className="sr-only">
                Apply filters
              </button>
            </div>
          </details>
          {hasScheduleFilters(filters) ? (
            <a
              href={`/e/${encodeURIComponent(slug)}/schedule?organization=${filters.organization}`}
              className={ACTION_LINK_MUTED}
            >
              Clear filters
            </a>
          ) : null}
        </div>
      </form>
      <script type="module" src="/e/assets/schedule-filters.js" />
    </div>
  );
}

function LiveBand({
  slug,
  matches,
  showDate,
}: {
  slug: string;
  matches: ScheduleMatchDTO[];
  showDate: boolean;
}) {
  if (!matches.length) return null;
  return (
    <section aria-labelledby="now-title">
      <h2
        id="now-title"
        className={LIVE_EYEBROW}
      >
        Live now
      </h2>
      {/* public-visual-fixes P3: the "Scores update as the desk records
          them" line is deleted. This tier ships no client framework and no
          polling — the document is what the server rendered — so the line
          promised an update the page cannot make, and a spectator watching a
          stale card wait for a score it will never receive is worse served
          than one who knows to reload. The freshness line below the list
          states what IS true: when this document was built. */}
      {/* v3-consolidated work package 26b: `min-w-0`. Same implicit-grid-
          track mechanism fixed on Discovery and Overview in this package
          (see `SeasonCalendar.tsx`'s comment): below `md:` this is a
          single-column grid with no explicit track, and a `MatchCard`
          article's own content (a long player name pair, at 200% text
          zoom) was measurably forcing this shared column past the
          viewport (plan §6 "Responsive/signage"). Both occurrences in
          this file share the fix. */}
      <div className="mt-2 min-w-0">
        <RowList slug={slug} matches={matches} showDate={showDate} />
      </div>
    </section>
  );
}
function ByTime({
  slug,
  matches,
  showDate,
}: {
  slug: string;
  matches: ScheduleMatchDTO[];
  showDate: boolean;
}) {
  const groups = new Map<string, ScheduleMatchDTO[]>();
  matches.forEach((match) => {
    const key =
      match.scheduledTime ?? schedulePublicStateLabel(schedulePublicState(match));
    groups.set(key, [...(groups.get(key) ?? []), match]);
  });
  return (
    <div className="grid gap-5">
      {[...groups.entries()].map(([time, group]) => (
        <section key={time} aria-labelledby={`time-${time}`}>
          <h2 id={`time-${time}`} className={`${EYEBROW} tabular-nums`}>
            {time}
          </h2>
          <div className="mt-2 min-w-0">
            <RowList slug={slug} matches={group} showDate={showDate} />
          </div>
        </section>
      ))}
    </div>
  );
}
function queueLabel(
  match: ScheduleMatchDTO,
  queue: ScheduleMatchDTO[],
  index: number,
): string | null {
  if (isCompleted(match)) return "Completed";
  if (match.status === "live") return "Now";
  const activeIndex =
    queue
      .slice(0, index + 1)
      .filter((item) => !isCompleted(item) && item.status !== "live").length -
    1;
  return activeIndex === 0 ? "Next" : activeIndex === 1 ? "Then" : null;
}
function ByCourt({
  slug,
  matches,
  showDate,
}: {
  slug: string;
  matches: ScheduleMatchDTO[];
  showDate: boolean;
}) {
  const queues = new Map<string, ScheduleMatchDTO[]>();
  [...matches]
    .sort((a, b) =>
      (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99"),
    )
    .forEach((match) => {
      const key = matchCourt(match);
      queues.set(key, [...(queues.get(key) ?? []), match]);
    });
  return (
    <div className="grid gap-5">
      {[...queues.entries()].map(([court, queue]) => (
        <section key={court} aria-labelledby={`court-${court}`}>
          <h2 id={`court-${court}`} className={EYEBROW}>
            {court}
          </h2>
          {/* One list per court, in queue order; the queue word (Now · Next
              · Then · Completed) leads each row's first column. */}
          <div className={`mt-2 ${LIST_CARD}`}>
            <RowHeader />
            <ul>
              {queue.map((match, index) => {
                const word = queueLabel(match, queue, index);
                return (
                  <Fragment key={match.matchKey}>
                    {word ? (
                      <li aria-hidden className={`border-t border-rule-soft px-3 pb-0.5 pt-2 ${EYEBROW}`}>
                        {word}
                      </li>
                    ) : null}
                    <ScheduleMatchRow match={match} slug={slug} showDate={showDate} />
                  </Fragment>
                );
              })}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}

export default function Schedule({ loaderData }: Route.ComponentProps) {
  const { page, matches, filters, nowMs } = loaderData;
  const slug = page.page.slug;
  const pages = Math.ceil(matches.total / matches.pageSize);
  const previous =
    filters.page > 1 ? { ...filters, page: filters.page - 1 } : null;
  const next =
    filters.page < pages ? { ...filters, page: filters.page + 1 } : null;
  const live = matches.items.filter((match) => match.status === "live");
  // §4.2 (P3): the repeated per-card date is deleted wherever the list is
  // already scoped to one day — the day navigation or the single date the
  // whole set shares already says it, and repeating it on every card is the
  // furniture the critique named. It RETURNS the moment the list actually
  // spans days, which is the case a day-scoped rule would silently break.
  const visibleDays = new Set(
    matches.items.map((match) => match.scheduledDate).filter(Boolean),
  );
  const showDate = !filters.day && visibleDays.size > 1;
  // The API already orders the complete filtered set live-first. Keep the
  // current queue visible on entry even when no day facet is selected; a
  // spectator should not have to know the tournament's local date first.
  const showNow = live.length > 0;
  return (
    <PlayShell>
      {/* Contract §11: Schedule had its OWN hero, with its own metadata, its
          own chip, its own freshness line and a timezone identifier repeated
          three times down the page. It now wears the one frame, with the
          Schedule tab current; freshness moved below the list. */}
      <TournamentFrame page={page} nowMs={nowMs} active="schedule" />
      {/* P7: the route's own "Schedule" title and its "Find matches by day,
          time, or court." sentence are gone. The frame's breadcrumb, its
          current tab and the browser tab all already name this page, and the
          sentence described the controls sitting immediately below it. The
          landmark keeps the name for assistive technology. */}
      <main className="mx-auto w-full max-w-6xl px-4 py-4 md:py-8" aria-label="Schedule">
        {!matches.published ? (
          <div className="mt-6">
            <EmptyState
              heading="Schedule is not published yet"
              body="The organizer will publish match times and courts when draws are ready. Check the tournament overview for updates."
            />
          </div>
        ) : (
          <div className="grid gap-4 md:gap-6">
            <ScheduleControls
              slug={slug}
              filters={filters}
              matches={matches}
              page={page}
            />
            {showNow ? (
              <LiveBand slug={slug} matches={live} showDate={showDate} />
            ) : null}
            {matches.items.length === 0 ? (
              <EmptyState
                heading="No matches found"
                body="Try another day, or clear a filter."
                action={
                  hasScheduleFilters(filters)
                    ? {
                        label: "View all matches",
                        href: `/e/${encodeURIComponent(slug)}/schedule`,
                      }
                    : undefined
                }
              />
            ) : (
              <>
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {`${matches.total} ${matches.total === 1 ? "match" : "matches"}`}
                  {filters.page > 1
                    ? ` · page ${filters.page} of ${pages}`
                    : ""}
                </p>
                {filters.organization === "court" ? (
                  <ByCourt slug={slug} matches={matches.items} showDate={showDate} />
                ) : (
                  <ByTime
                    slug={slug}
                    matches={showNow ? matches.items.filter((match) => match.status !== "live") : matches.items}
                    showDate={showDate}
                  />
                )}
                {previous || next ? (
                  <nav
                    aria-label="Schedule pages"
                    className="flex items-center justify-between"
                  >
                    <span>
                      {previous ? (
                        <a href={matchesPath(slug, previous)} className={ACTION_LINK}>
                          Previous
                        </a>
                      ) : (
                        <span />
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Page {filters.page} of {pages}
                    </span>
                    {next ? (
                      <a href={matchesPath(slug, next)} className={ACTION_LINK}>
                        Next
                      </a>
                    ) : null}
                  </nav>
                ) : null}
                {/* Contract §11.1/§7.1: the ONE freshness line, below the
                    thing it describes, in venue-local time and with no zone
                    identifier or offset in the prose. It used to sit in this
                    route's own hero, in two variants, with the IANA name
                    appended. */}
                {matches.updatedAt ? (
                  <p className="text-xs text-muted-foreground">
                    {`Updated ${formatScheduleUpdated(matches.updatedAt, matches.timeZone)}`}
                  </p>
                ) : null}
              </>
            )}
          </div>
        )}
      </main>
    </PlayShell>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404)
    return (
      <MessagePage
        heading="This tournament is not available"
        body="Check the link, or ask the organizer for the current one."
      />
    );
  return (
    <MessagePage
      heading="Schedule is unavailable"
      body="Please try again in a moment. Your filters are still safe in the URL."
    />
  );
}
