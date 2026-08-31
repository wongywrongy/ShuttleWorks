/** `/e/{slug}/schedule` — public, URL-backed matches document. */
import { isRouteErrorResponse, useRouteError } from "react-router";

import { EmptyState } from "../components/EmptyState";
import { HeroHeader } from "../components/HeroHeader";
import { MessagePage } from "../components/MessagePage";
import { PersonRef } from "../components/PersonRef";
import { PlayShell } from "../components/PlayShell";
import { TabBar } from "../components/TabBar";
import { ApiError, apiGet } from "../lib/apiFetch.server";
import type { EntryPageDTO } from "../lib/entryPage.types";
import { eventCodeLabel, eventDisciplineLabel } from "../lib/draws.types";
import { formatDateLong } from "../lib/format";
import { chipState, tournamentPhase, visibleTabs } from "../lib/phase";
import {
  SCHEDULE_STATES,
  scheduleDateLabel,
  scheduleIsStale,
  scheduleStateLabel,
  type ScheduleDayFacetDTO,
  type ScheduleMatchesDTO,
  type ScheduleMatchDTO,
  type ScheduleSideDTO,
  type ScheduleState,
} from "../lib/schedule.types";
import { SELECT_CONTROL } from "../lib/ui";
import type { PersonReferenceDTO } from "../lib/person.types";
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

function sideRefs(side: ScheduleSideDTO): PersonReferenceDTO[] {
  return side.persons;
}
function scoreForSide(score: number[][] | null, side: 0 | 1): string {
  if (!score) return "";
  return score
    .map((set) => String(set[side] ?? ""))
    .filter(Boolean)
    .join(" ");
}
function MatchSide({
  slug,
  side,
  score,
  sideIndex,
}: {
  slug: string;
  side: ScheduleSideDTO;
  score: number[][] | null;
  sideIndex: 0 | 1;
}) {
  const refs = sideRefs(side);
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        {refs.length ? (
          refs.map((ref, index) => (
            <p
              key={`${ref.identity?.id ?? ref.label ?? "ref"}-${index}`}
              className="break-words text-sm text-foreground"
            >
              <PersonRef
                slug={slug}
                identity={ref.identity}
                state={ref.resolution === "dead" ? "dead" : "resolved"}
                label={ref.label ?? side.placeholder}
              />
            </p>
          ))
        ) : (
          <p className="text-sm"><PersonRef slug={slug} identity={null} state="dead" label={side.placeholder ?? "TBD"} /></p>
        )}
      </div>
      {score ? (
        <span
          className="shrink-0 tabular-nums text-sm font-semibold text-foreground"
          aria-label={`Score ${scoreForSide(score, sideIndex)}`}
        >
          {scoreForSide(score, sideIndex)}
        </span>
      ) : null}
    </div>
  );
}
function matchCourt(match: ScheduleMatchDTO): string {
  return match.court === null ? "Court pending" : `Court ${match.court}`;
}
function isCompleted(match: ScheduleMatchDTO): boolean {
  return (
    match.status === "completed" ||
    match.status === "walkover" ||
    match.status === "retired"
  );
}
function MatchCard({
  match,
  slug,
  timeZone,
}: {
  match: ScheduleMatchDTO;
  slug: string;
  timeZone: string;
}) {
  const clock =
    isCompleted(match) && match.scheduledTime ? match.scheduledTime : null;
  const context = [
    eventCodeLabel(match.eventCode),
    match.discipline || eventDisciplineLabel(match.eventCode),
    match.roundLabel,
  ]
    .filter(Boolean)
    .filter((v, i, list) => list.indexOf(v) === i)
    .join(" · ");
  return (
    <article
      className="border-y border-rule-soft py-1"
      aria-label={`${context} · ${scheduleStateLabel(match.status)}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
          {context}
        </p>
        <p
          className={
            match.status === "live"
              ? "text-xs font-semibold text-status-live"
              : "text-xs text-muted-foreground"
          }
        >
          {scheduleStateLabel(match.status)}
        </p>
      </header>
      <div className="divide-y divide-rule-soft">
        <MatchSide
          slug={slug}
          side={
            match.sides[0] ?? {
              participantKey: null,
              persons: [],
              placeholder: "TBD",
            }
          }
          score={match.score}
          sideIndex={0}
        />
        <MatchSide
          slug={slug}
          side={
            match.sides[1] ?? {
              participantKey: null,
              persons: [],
              placeholder: "TBD",
            }
          }
          score={match.score}
          sideIndex={1}
        />
      </div>
      <footer className="flex flex-wrap gap-x-2 py-2 text-xs text-muted-foreground">
        {clock ? <span>{clock}</span> : null}
        <span>{matchCourt(match)}</span>
        <span>{timeZone}</span>
      </footer>
    </article>
  );
}

function dayDistance(a: string, b: string): number {
  const first = Date.parse(`${a}T00:00:00Z`),
    second = Date.parse(`${b}T00:00:00Z`);
  return Number.isFinite(first) && Number.isFinite(second)
    ? Math.round(Math.abs(second - first) / 86400000)
    : 99;
}
function monthLabel(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? month
    : new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}
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
      <nav aria-label="Schedule days" className="border-y border-rule-soft">
        <div className="flex min-w-max divide-x divide-rule-soft overflow-x-auto">
          {days.map((day) => {
            const active = Boolean(filters.day) && day.day === filters.day;
            return (
              <a
                key={day.day}
                href={matchesPath(slug, { ...filters, day: day.day, page: 1 })}
                aria-current={active ? "page" : undefined}
                className={`px-4 py-3 text-sm ${active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <span className="block">{scheduleDateLabel(day.day)}</span>
                <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                  {day.count} {day.count === 1 ? "match" : "matches"}
                </span>
              </a>
            );
          })}
        </div>
      </nav>
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
                  <span className="tabular-nums">({day.count})</span>
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
  const days = [
    ...new Set(
      matches.facets.days
        .map((day) => day.day)
        .concat(filters.day)
        .filter(Boolean),
    ),
  ];
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
      className="border-y border-rule-soft py-4"
      aria-label="Filter schedule"
    >
      <input type="hidden" name="organization" value={filters.organization} />
      <div className="grid gap-4 md:grid-cols-5">
        <label className="grid gap-1 text-sm font-medium text-foreground">
          Day
          <select
            name="day"
            defaultValue={filters.day}
            className={SELECT_CONTROL}
          >
            <option value="">All days</option>
            {days.map((day) => (
              <option key={day} value={day}>
                {scheduleDateLabel(day)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-foreground">
          Event
          <select
            name="event"
            defaultValue={filters.event}
            className={SELECT_CONTROL}
          >
            <option value="">All events</option>
            {events.map((event) => (
              <option key={event.code} value={event.code}>
                {event.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-foreground">
          Player
          <input
            name="player"
            defaultValue={filters.player}
            placeholder="Search a player"
            className={SELECT_CONTROL}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-foreground">
          Court
          <select
            name="court"
            defaultValue={filters.court}
            className={SELECT_CONTROL}
          >
            <option value="">All courts</option>
            {courts.map((court) => (
              <option key={court} value={court}>{`Court ${court}`}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-foreground">
          State
          <select name="state" defaultValue={filters.state}>
            <option value="">All states</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {scheduleStateLabel(state)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
        >
          Apply filters
        </button>
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
    <nav
      aria-label="Schedule organization"
      className="inline-flex border border-rule-control"
    >
      <a
        aria-current={filters.organization === "time" ? "page" : undefined}
        href={href("time")}
        className={`px-3 py-2 text-sm ${filters.organization === "time" ? "bg-surface-sunken font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        By time
      </a>
      <a
        aria-current={filters.organization === "court" ? "page" : undefined}
        href={href("court")}
        className={`border-l border-rule-control px-3 py-2 text-sm ${filters.organization === "court" ? "bg-surface-sunken font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        By court
      </a>
    </nav>
  );
}
function isToday(day: string, nowMs: number, timeZone: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(nowMs));
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return day === `${values.year}-${values.month}-${values.day}`;
  } catch {
    return false;
  }
}
function LiveBand({
  slug,
  matches,
  timeZone,
}: {
  slug: string;
  matches: ScheduleMatchDTO[];
  timeZone: string;
}) {
  if (!matches.length) return null;
  return (
    <section
      aria-labelledby="now-title"
      className="border-l-2 border-status-live pl-4"
    >
      <h2
        id="now-title"
        className="font-display text-lg font-bold text-foreground"
      >
        Now
      </h2>
      <p className="mb-3 mt-1 text-sm text-muted-foreground">Live on court</p>
      <div className="grid gap-4 md:grid-cols-2">
        {matches.map((match) => (
          <MatchCard
            key={match.matchKey}
            match={match}
            slug={slug}
            timeZone={timeZone}
          />
        ))}
      </div>
    </section>
  );
}
function ByTime({
  slug,
  matches,
  timeZone,
}: {
  slug: string;
  matches: ScheduleMatchDTO[];
  timeZone: string;
}) {
  const groups = new Map<string, ScheduleMatchDTO[]>();
  matches.forEach((match) => {
    const key = match.scheduledTime ?? "Time pending";
    groups.set(key, [...(groups.get(key) ?? []), match]);
  });
  return (
    <div className="grid gap-6">
      {[...groups.entries()].map(([time, group]) => (
        <section key={time} aria-labelledby={`time-${time}`}>
          <h2
            id={`time-${time}`}
            className="mb-2 border-b border-rule-soft pb-2 text-sm font-bold tabular-nums text-foreground"
          >
            {time}
          </h2>
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {group.map((match) => (
              <MatchCard
                key={match.matchKey}
                match={match}
                slug={slug}
                timeZone={timeZone}
              />
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
  timeZone,
}: {
  slug: string;
  matches: ScheduleMatchDTO[];
  timeZone: string;
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
          <h2
            id={`court-${court}`}
            className="border-b border-rule-soft pb-2 text-sm font-bold text-foreground"
          >
            {court}
          </h2>
          <div className="mt-2 grid gap-4">
            {queue.map((match, index) => (
              <div key={match.matchKey}>
                {queueLabel(match, queue, index) ? (
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
                    {queueLabel(match, queue, index)}
                  </p>
                ) : null}
                <MatchCard match={match} slug={slug} timeZone={timeZone} />
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
  const phase = tournamentPhase({
    publication: page.publication,
    events: page.events,
  });
  const stale = scheduleIsStale(matches.updatedAt, nowMs);
  const tabs = visibleTabs(page.events, page.entrants, page.publication);
  const pages = Math.ceil(matches.total / matches.pageSize);
  const previous =
    filters.page > 1 ? { ...filters, page: filters.page - 1 } : null;
  const next =
    filters.page < pages ? { ...filters, page: filters.page + 1 } : null;
  const live = matches.items.filter((match) => match.status === "live");
  const showNow = Boolean(
    filters.day && isToday(filters.day, nowMs, matches.timeZone) && live.length,
  );
  return (
    <PlayShell>
      <HeroHeader
        orgName={page.org?.name ?? null}
        title={page.tournament.name ?? slug}
        metaLine={[formatDateLong(page.tournament.date), page.venue?.name]
          .filter(Boolean)
          .join(" · ")}
        chip={chipState(page.events, new Date(nowMs))}
        cta={{ kind: "closed" }}
        phase={phase}
        phaseAction={
          phase === "entries_open"
            ? {
                label: "Enter this tournament",
                href: `/e/${encodeURIComponent(slug)}/enter`,
              }
            : null
        }
        freshness={
          matches.updatedAt
            ? `Schedule updated ${matches.updatedAt} · ${matches.timeZone}`
            : `Tournament time · ${matches.timeZone}`
        }
      >
        <TabBar
          tabs={tabs}
          active="schedule"
          hrefFor={(tab) =>
            tab === "overview"
              ? `/e/${encodeURIComponent(slug)}`
              : `/e/${encodeURIComponent(slug)}?tab=${tab}`
          }
          scheduleHref={`/e/${encodeURIComponent(slug)}/schedule`}
        />
      </HeroHeader>
      <main
        className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8"
        aria-labelledby="schedule-title"
      >
        <div className="grid gap-2">
          <h1
            id="schedule-title"
            className="font-display text-xl font-bold tracking-tight text-foreground"
          >
            Schedule / Live
          </h1>
          <p className="text-sm text-muted-foreground">
            Find matches by day, time, or court in tournament time (
            {matches.timeZone}).
          </p>
        </div>
        {stale ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Schedule last updated {matches.updatedAt}.
          </p>
        ) : null}
        {!matches.published ? (
          <div className="mt-6">
            <EmptyState
              heading="Schedule is not published yet"
              body="The organizer will publish match times and courts when draws are ready. Check the tournament overview for updates."
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-6">
            <DayNavigation slug={slug} filters={filters} matches={matches} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Filters
                slug={slug}
                filters={filters}
                matches={matches}
                page={page}
              />
              <OrganizationSwitch slug={slug} filters={filters} />
            </div>
            {showNow ? (
              <LiveBand
                slug={slug}
                matches={live}
                timeZone={matches.timeZone}
              />
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
                  <ByCourt
                    slug={slug}
                    matches={matches.items}
                    timeZone={matches.timeZone}
                  />
                ) : (
                  <ByTime
                    slug={slug}
                    matches={matches.items}
                    timeZone={matches.timeZone}
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
