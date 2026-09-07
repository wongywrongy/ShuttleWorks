/** `/e/{slug}/schedule` — public, URL-backed matches document. */
import { isRouteErrorResponse, useRouteError } from "react-router";

import { Button } from "@scheduler/design-system/components";

import { EmptyState } from "../components/EmptyState";
import { MatchCard, type MatchCardData } from "../components/MatchCard";
import { MessagePage } from "../components/MessagePage";
import { PlayShell } from "../components/PlayShell";
import { SegmentedNav } from "../components/SegmentedNav";
import { TournamentFrame } from "../components/TournamentFrame";
import { ApiError, apiGet } from "../lib/apiFetch.server";
import type { EntryPageDTO } from "../lib/entryPage.types";
import { eventDisciplineLabel } from "../lib/draws.types";
import { formatCalendarMonth } from "../lib/format";
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
import { EYEBROW, FIELD_INPUT, LIST_CARD, SELECT_CONTROL } from "../lib/ui";
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
      nowMs: Date.now(),
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
function gamesWon(score: number[][], side: 0 | 1): number {
  return score.filter((game) => (game[side] ?? 0) > (game[side === 0 ? 1 : 0] ?? 0)).length;
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
  const winnerIndex =
    decided && match.score?.length
      ? gamesWon(match.score, 0) > gamesWon(match.score, 1)
        ? 0
        : gamesWon(match.score, 1) > gamesWon(match.score, 0)
          ? 1
          : null
      : null;
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
    sides,
    score: match.score,
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
function ScheduleMatchCard({
  match,
  slug,
  showDate = true,
}: {
  match: ScheduleMatchDTO;
  slug: string;
  showDate?: boolean;
}) {
  return (
    <MatchCard match={scheduleToMatch(match, { showDate })} variant="card" slug={slug} />
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
 */
export function formatScheduleUpdated(value: string | null, timeZone: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(date);
  } catch {
    return value;
  }
}

// D11: redirects to the entrant time authority (`lib/format.ts`) — see
// `scheduleDateLabel`'s note; the same second-formatter defect applied here.
const monthLabel = formatCalendarMonth;
function DayNavigation({
  slug,
  filters,
  matches,
}: {
  slug: string;
  filters: ScheduleFilters;
  matches: ScheduleMatchesDTO;
}) {
  const facets = matches.facets.days;
  const days = [
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
  if (!days.length) return null;
  const consecutive = days.every(
    (day, index) =>
      index === 0 || dayDistance(days[index - 1].day, day.day) <= 1,
  );
  if (consecutive)
    return (
      <SegmentedNav
        label="Schedule days"
        segments={days.map((day) => ({
          label: `${scheduleDateLabel(day.day)} · ${dayMatchCountLabel(day.count)}`,
          href: matchesPath(slug, { ...filters, day: day.day, page: 1 }),
          current: Boolean(filters.day) && day.day === filters.day,
        }))}
      />
    );
  const months = new Map<string, ScheduleDayFacetDTO[]>();
  days.forEach((day) => {
    const month = /^\d{4}-\d{2}/.exec(day.day)?.[0] ?? day.day;
    months.set(month, [...(months.get(month) ?? []), day]);
  });
  return (
    <nav
      aria-label="Schedule days"
      className="grid gap-4 border-y border-rule-soft py-4"
    >
      {[...months.entries()].map(([month, monthDays]) => (
        <section key={month}>
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {monthLabel(month)}
          </h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {monthDays.map((day) => {
              const active = Boolean(filters.day) && day.day === filters.day;
              return (
                <a
                  key={day.day}
                  href={matchesPath(slug, {
                    ...filters,
                    day: day.day,
                    page: 1,
                  })}
                  aria-current={active ? "page" : undefined}
                  className={`text-sm underline-offset-4 hover:underline ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                >
                  {scheduleDateLabel(day.day)}{" "}
                  <span className="tabular-nums">
                    ({dayMatchCountLabel(day.count)})
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

function Filters({
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
  return (
    <form
      method="get"
      action={`/e/${encodeURIComponent(slug)}/schedule`}
      className="grid items-center gap-2 border-t border-rule-soft px-4 py-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]"
      aria-label="Filter schedule"
    >
      <input type="hidden" name="organization" value={filters.organization} />
      <input type="hidden" name="day" value={filters.day} />
      <input
        name="player"
        defaultValue={filters.player}
        placeholder="Search a player"
        aria-label="Player"
        className={FIELD_INPUT}
      />
      <details className="group md:contents" open={Boolean(filters.event || filters.court || filters.state) || undefined}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-sm border border-rule-soft px-3 text-sm font-medium text-foreground marker:hidden md:hidden">
          More filters
          <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="grid gap-2 md:contents">
          <select
            name="event"
            defaultValue={filters.event}
            aria-label="Event"
            className={SELECT_CONTROL}
          >
            <option value="">All events</option>
            {events.map((event) => (
              <option key={event.code} value={event.code}>
                {event.label}
              </option>
            ))}
          </select>
          <select
            name="court"
            defaultValue={filters.court}
            aria-label="Court"
            className={SELECT_CONTROL}
          >
            <option value="">All courts</option>
            {courts.map((court) => (
              <option key={court} value={court}>{`Court ${court}`}</option>
            ))}
          </select>
          <select
            name="state"
            defaultValue={filters.state}
            aria-label="State"
            className={SELECT_CONTROL}
          >
            <option value="">All states</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {scheduleStateLabel(state)}
              </option>
            ))}
          </select>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
        {hasScheduleFilters(filters) ? (
          <a
            href={`/e/${encodeURIComponent(slug)}/schedule?organization=${filters.organization}`}
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            Clear filters
          </a>
        ) : null}
      </div>
    </form>
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
      <p className="mt-0.5 text-xs text-muted-foreground">
        Scores update as the desk records them
      </p>
      {/* v3-consolidated work package 26b: `min-w-0`. Same implicit-grid-
          track mechanism fixed on Discovery and Overview in this package
          (see `SeasonCalendar.tsx`'s comment): below `md:` this is a
          single-column grid with no explicit track, and a `MatchCard`
          article's own content (a long player name pair, at 200% text
          zoom) was measurably forcing this shared column past the
          viewport (plan §6 "Responsive/signage"). Both occurrences in
          this file share the fix. */}
      <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-2">
        {matches.map((match) => (
          <ScheduleMatchCard key={match.matchKey} match={match} slug={slug} showDate={showDate} />
        ))}
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
    <div className="grid gap-6">
      {[...groups.entries()].map(([time, group]) => (
        <section key={time} aria-labelledby={`time-${time}`}>
          <h2 id={`time-${time}`} className={`${EYEBROW} tabular-nums`}>
            {time}
          </h2>
          <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-2">
            {group.map((match) => (
              <ScheduleMatchCard key={match.matchKey} match={match} slug={slug} showDate={showDate} />
            ))}
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
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {[...queues.entries()].map(([court, queue]) => (
        <section key={court} aria-labelledby={`court-${court}`}>
          <h2 id={`court-${court}`} className={EYEBROW}>
            {court}
          </h2>
          <div className="mt-3 grid gap-4">
            {queue.map((match, index) => (
              <div key={match.matchKey}>
                {queueLabel(match, queue, index) ? (
                  <p className={`mb-1 ${EYEBROW}`}>
                    {queueLabel(match, queue, index)}
                  </p>
                ) : null}
                <ScheduleMatchCard match={match} slug={slug} showDate={showDate} />
              </div>
            ))}
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
      <main
        className="mx-auto w-full max-w-6xl px-4 py-4 md:py-8"
        aria-labelledby="schedule-title"
      >
        <div className="grid gap-1 md:gap-2">
          <h2
            id="schedule-title"
            className="type-display text-2xl tracking-[-0.02em] text-foreground"
          >
            Schedule
          </h2>
          <p className="text-sm text-muted-foreground">
            Find matches by day, time, or court.
          </p>
        </div>
        {!matches.published ? (
          <div className="mt-6">
            <EmptyState
              heading="Schedule is not published yet"
              body="The organizer will publish match times and courts when draws are ready. Check the tournament overview for updates."
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-4 md:mt-6 md:gap-6">
            <div className={LIST_CARD}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 md:gap-3 md:px-4 md:py-3">
                <DayNavigation slug={slug} filters={filters} matches={matches} />
                <OrganizationSwitch slug={slug} filters={filters} />
              </div>
              <Filters
                slug={slug}
                filters={filters}
                matches={matches}
                page={page}
              />
            </div>
            {showNow ? (
              <LiveBand slug={slug} matches={live} showDate={!filters.day} />
            ) : null}
            {matches.items.length === 0 ? (
              <EmptyState
                heading="No matches found"
                body="Try clearing a filter or choosing another day, event, court, or state."
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
                  <ByCourt slug={slug} matches={matches.items} showDate={!filters.day} />
                ) : (
                  <ByTime
                    slug={slug}
                    matches={showNow ? matches.items.filter((match) => match.status !== "live") : matches.items}
                    showDate={!filters.day}
                  />
                )}
                {previous || next ? (
                  <nav
                    aria-label="Schedule pages"
                    className="flex items-center justify-between"
                  >
                    <span>
                      {previous ? (
                        <a
                          href={matchesPath(slug, previous)}
                          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
                        >
                          ← Previous
                        </a>
                      ) : (
                        <span />
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Page {filters.page} of {pages}
                    </span>
                    {next ? (
                      <a
                        href={matchesPath(slug, next)}
                        className="text-sm font-medium text-accent underline-offset-4 hover:underline"
                      >
                        Next →
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
