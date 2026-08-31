/**
 * `/e/{slug}/draws/{drawKey}` — one draw, fully navigable (SP-P7 §3.4).
 *
 * Round robin renders the standings table (when results are published)
 * over the round-by-round match list; elimination renders rounds as
 * columns inside the card's own horizontal scroll (R11: the PAGE never
 * scrolls sideways — wide content scrolls in its container; scroll is not
 * truncation, every node stays whole and reachable). A multi-segment draw
 * (consolation, plates) gets a plain underlined segment navigation — `?segment=`, zero JS,
 * the tier's instant-apply-facet idiom.
 *
 * Nodes reuse the public MatchCard: one anatomy for a player's own match
 * and the same match seen in the tree (§3.3's shared-anatomy rule). Seeds
 * render as `[n]` after the name; byes as the muted "Bye" side; result
 * data arrives pre-gated by the API.
 */
import { Fragment } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";

import { MatchCard } from "../components/MatchCard";
import { PersonGroup } from "../components/PersonGroup";
import { EmptyState } from "../components/EmptyState";
import { MessagePage } from "../components/MessagePage";
import { PlayShell } from "../components/PlayShell";
import { TabBar } from "../components/TabBar";
import { ApiError, apiGet } from "../lib/apiFetch.server";
import type {
  DrawDetailDTO,
  MatchNodeDTO,
  SegmentDTO,
  TeamDTO,
} from "../lib/draws.types";
import {
  entryCountLabel,
  eventCodeLabel,
  eventDisciplineLabel,
  isRoundRobin,
  kindLabel,
  roundLabel,
} from "../lib/draws.types";
import type { EntryPageDTO } from "../lib/entryPage.types";
import { visibleTabs } from "../lib/phase";
import { INPUT_SKIN } from "../lib/ui";
import type { MatchCardData } from "../components/MatchCard";
import { personRefModel } from "../../public/assets/person-ref.js";
import type { Route } from "./+types/draw";

export interface DrawLoaderData {
  slug: string;
  tournamentName: string | null;
  page: EntryPageDTO;
  draw: DrawDetailDTO;
  /** Validated `?segment=` — a real segment id, defaulting to the first. */
  activeSegment: string;
  /** Scriptless presentation mode, persisted in the URL. */
  view: "bracket" | "round" | "list";
  roundIndex: number;
  playerQuery: string;
}

/** Clamp once at the loader boundary so every view/link sees the same round. */
export function normalizeRoundIndex(raw: string | null, roundCount: number): number {
  if (roundCount <= 0) return 0;
  const parsed = raw === null || raw.trim() === '' ? 0 : Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), roundCount - 1);
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { slug?: string; drawKey?: string };
}) {
  const { slug, drawKey } = params;
  if (!slug || !drawKey) throw notFound();

  try {
    const page = await apiGet<EntryPageDTO>(
      `/e/api/page/${encodeURIComponent(slug)}`,
    );
    const draw = await apiGet<DrawDetailDTO>(
      `/e/api/page/${encodeURIComponent(slug)}/draws/${encodeURIComponent(drawKey)}`,
    );
    const requested = new URL(request.url).searchParams.get("segment");
    const query = new URL(request.url).searchParams;
    const requestedView = query.get("view");
    const view =
      requestedView === "round" ||
      requestedView === "list"
        ? requestedView
        : "bracket";
    const activeSegment =
      draw.segments.find((segment) => segment.id === requested)?.id ??
      draw.segments[0]?.id ??
      "";
    const activeSegmentData = draw.segments.find((segment) => segment.id === activeSegment);
    const roundIndex = normalizeRoundIndex(query.get("round"), activeSegmentData?.rounds.length ?? 0);
    const payload: DrawLoaderData = {
      slug: page.page.slug,
      tournamentName: page.tournament.name,
      page,
      draw,
      activeSegment,
      view,
      roundIndex,
      playerQuery: query.get("player")?.trim() ?? "",
    };
    return payload;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }
}

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) return [{ title: "Draw not found" }];
  return [
    {
      title: data.tournamentName
        ? `${data.draw.discipline} · ${data.tournamentName}`
        : data.draw.discipline,
    },
  ];
};

/** One anatomy: a tree node dressed as the public MatchCard. */
function nodeToMatch(
  node: MatchNodeDTO,
  teams: Map<string, TeamDTO>,
  eventCode: string,
  round: string | null,
): MatchCardData {
  const decided =
    node.result?.winnerSide === "A" || node.result?.winnerSide === "B";
  return {
    eventCode: eventCodeLabel(eventCode),
    roundLabel: roundLabel(round),
    sides: node.sides.map((side, index) => {
      const team = side.participantKey
        ? teams.get(side.participantKey)
        : undefined;
      return {
        persons: team?.persons ?? [],
        seed: team?.seed,
        placeholder: side.bye ? "Bye" : side.placeholder,
        winner:
          decided && node.result?.winnerSide === (index === 0 ? "A" : "B"),
      };
    }),
    score: node.result?.score ?? null,
    decided,
    scheduledTime: node.scheduledTime,
    court: node.court,
    playedOn: node.playedOn,
    localTime: node.localTime,
    courtLabel: node.courtLabel,
    sourceUrl: node.sourceUrl,
    sourceRef: node.sourceRef,
  };
}

function StandingsTable({ draw, slug }: { draw: DrawDetailDTO; slug: string }) {
  const teams = new Map(draw.teams.map((team) => [team.participantKey, team]));
  if (draw.standings === null) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-rule-soft bg-surface-raised shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rule-soft text-left text-xs uppercase tracking-[0.06em] text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-semibold">Pos</th>
            <th scope="col" className="px-3 py-2 font-semibold">Player</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">PL</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">W</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">L</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">GM</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">PTS</th>
            <th scope="col" className="px-3 py-2 font-semibold">History</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule-soft">
          {draw.standings.map((row) => {
            const team = teams.get(row.participantKey);
            return (
              <tr key={row.participantKey}>
                <td className="px-3 py-2 tabular-nums font-semibold text-foreground">
                  {row.position}
                </td>
                <td className="px-3 py-2">
                  <PersonGroup slug={slug} persons={team?.persons ?? []} seed={team?.seed} />
                  {team?.club ? (
                    <span className="block text-xs text-muted-foreground">
                      {team.club}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.played}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.wins}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.losses}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {`${row.gamesWon}-${row.gamesLost}`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {`${row.pointsWon}-${row.pointsLost}`}
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {row.history.map((result, index) => (
                      <span
                        key={index}
                        className="inline-flex h-5 w-5 items-center justify-center border-b border-rule-soft text-xs font-semibold text-muted-foreground"
                      >
                        {result}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SegmentNavigation({
  slug,
  drawKey,
  segments,
  active,
  view,
  roundIndex,
  playerQuery,
}: {
  slug: string;
  drawKey: string;
  segments: SegmentDTO[];
  active: string;
  view: DrawLoaderData['view'];
  roundIndex: number;
  playerQuery: string;
}) {
  if (segments.length < 2) return null;
  const base = `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(drawKey)}`;
  const href = (segmentId: string) => {
    const params = new URLSearchParams({ segment: segmentId, view });
    if (view === 'round') params.set('round', String(roundIndex));
    if (playerQuery) params.set('player', playerQuery);
    return `${base}?${params}`;
  };
  return (
    <nav aria-label="Draw segments" className="flex flex-wrap gap-2">
      {segments.map((segment) => (
        <a
          key={segment.id}
          href={href(segment.id)}
          aria-current={segment.id === active ? "page" : undefined}
          className={`border-b-2 px-0.5 py-1.5 text-sm ${
            segment.id === active
              ? "border-action-primary font-medium text-foreground"
              : "border-rule-soft text-muted-foreground hover:border-rule-control"
          }`}
        >
          {segment.label || segment.id}
        </a>
      ))}
    </nav>
  );
}

function DrawViewLinks({
  slug,
  drawKey,
  segment,
  active,
  roundIndex,
  playerQuery,
}: {
  slug: string;
  drawKey: string;
  segment: string;
  active: DrawLoaderData["view"];
  roundIndex: number;
  playerQuery: string;
}) {
  const base = `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(drawKey)}`;
  const href = (view: DrawLoaderData["view"]) => {
    const params = new URLSearchParams({ segment, view });
    if (view === "round") params.set("round", String(roundIndex));
    if (playerQuery) params.set("player", playerQuery);
    return `${base}?${params}`;
  };
  return (
    <nav
      aria-label="Draw view"
      className="overflow-x-auto border-b border-rule-soft"
    >
      <div className="flex min-w-max gap-5">
        {(
          [
            ["bracket", "Bracket"],
            ["round", "Round"],
            ["list", "List"],
          ] as const
        ).map(([view, label]) => (
          <a
            key={view}
            href={href(view)}
            aria-current={active === view ? "page" : undefined}
            className={`shrink-0 border-b-2 px-0.5 pb-2 pt-1 text-sm ${active === view ? "border-action-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:border-rule-control hover:text-foreground"}`}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function RoundPager({
  base,
  segment,
  roundIndex,
  roundCount,
  playerQuery,
}: {
  base: string;
  segment: string;
  roundIndex: number;
  roundCount: number;
  playerQuery: string;
}) {
  if (roundCount < 2) return null;
  const previous = Math.max(0, roundIndex - 1);
  const next = Math.min(roundCount - 1, roundIndex + 1);
  const href = (index: number) => {
    const params = new URLSearchParams({ segment, view: 'round', round: String(index) });
    if (playerQuery) params.set('player', playerQuery);
    return `${base}?${params}`;
  };
  return (
    <nav
      aria-label="Draw round"
      className="flex items-center justify-between gap-3"
    >
      {roundIndex > 0 ? (
        <a
          className="text-sm font-medium text-accent hover:underline"
          href={href(previous)}
        >
          ← Previous round
        </a>
      ) : (
        <span />
      )}
      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Round {roundIndex + 1} of {roundCount}
      </span>
      {roundIndex < roundCount - 1 ? (
        <a
          className="text-sm font-medium text-accent hover:underline"
          href={href(next)}
        >
          Next round →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

function MatchList({
  rounds,
  teams,
  eventCode,
  slug,
}: {
  rounds: DrawDetailDTO["segments"][number]["rounds"];
  teams: Map<string, TeamDTO>;
  eventCode: string;
  slug: string;
}) {
  if (rounds.length === 0)
    return (
      <EmptyState
        heading="No matches found"
        body="Try a different player or pair name."
      />
    );
  return (
    <div className="grid gap-4">
      {rounds.map((round) => (
        <section key={round.label}>
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {round.label}
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {round.matches.map((node) => (
              <MatchCard
                key={node.nodeKey}
                slug={slug}
                match={nodeToMatch(node, teams, eventCode, round.label)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function nodePersonIds(node: MatchNodeDTO, teams: Map<string, TeamDTO>): string[] {
  const ids = new Set<string>();
  for (const side of node.sides) {
    const team = side.participantKey ? teams.get(side.participantKey) : undefined;
    for (const person of team?.persons ?? []) {
      if (person.identity?.id) ids.add(person.identity.id);
    }
  }
  return [...ids];
}

function ConnectorColumn({
  destination,
  nodeIndex,
  teams,
}: {
  destination: DrawDetailDTO['segments'][number]['rounds'][number];
  nodeIndex: Map<string, MatchNodeDTO>;
  teams: Map<string, TeamDTO>;
}) {
  return (
    <div className="flex w-8 shrink-0 flex-col" aria-hidden="true" data-bracket-links>
      <span className="h-4" />
      <div className="mt-3 flex flex-1 flex-col">
        {destination.matches.map((node) => {
          const ids = new Set(nodePersonIds(node, teams));
          for (const side of node.sides) {
            const feeder = side.feederNodeKey ? nodeIndex.get(side.feederNodeKey) : undefined;
            for (const id of feeder ? nodePersonIds(feeder, teams) : []) ids.add(id);
          }
          return <span key={node.nodeKey} className="bracket-link-slot flex-1" data-person-ids={[...ids].join(' ')} />;
        })}
      </div>
    </div>
  );
}

export default function Draw({ loaderData }: Route.ComponentProps) {
  const {
    slug,
    tournamentName,
    page,
    draw,
    activeSegment,
    view,
    roundIndex,
    playerQuery,
  } = loaderData;
  const teams = new Map(draw.teams.map((team) => [team.participantKey, team]));
  const selectedPersonId = playerQuery
    ? draw.teams.flatMap((team) => team.persons).find((person) => {
        if (person.identity?.id === playerQuery) return true;
        return person.identity
          ? personRefModel({ slug, identity: person.identity, state: person.resolution }).text.toLocaleLowerCase().includes(playerQuery.toLocaleLowerCase())
          : false;
      })?.identity?.id ?? null
    : null;
  const roundRobin = isRoundRobin(draw.kind);
  const segment =
    draw.segments.find((candidate) => candidate.id === activeSegment) ??
    draw.segments[0];
  const nodeIndex = new Map(
    (segment?.rounds.flatMap((round) => round.matches) ?? []).map((node) => [node.nodeKey, node]),
  );
  const pathRounds = segment
    ? segment.rounds
        .map((round) => ({
          ...round,
          matches: round.matches.filter((node) =>
            node.sides.some((side) => {
              const team = side.participantKey
                ? teams.get(side.participantKey)
                : undefined;
              if (playerQuery === "") return true;
              return team?.persons.some((person) => {
                if (person.identity?.id === (selectedPersonId ?? playerQuery)) return true;
                return person.identity
                  ? personRefModel({ slug, identity: person.identity, state: person.resolution }).text.toLocaleLowerCase().includes(playerQuery.toLocaleLowerCase())
                  : false;
              }) ?? false;
            }),
          ),
        }))
        .filter((round) => round.matches.length > 0)
    : [];
  const clearPlayerParams = new URLSearchParams({
    segment: activeSegment,
    view,
  });
  if (view === 'round') clearPlayerParams.set('round', String(roundIndex));
  const clearPlayerHref = `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(draw.drawKey)}?${clearPlayerParams}`;

  return (
    <PlayShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        <a
          href={`/e/${encodeURIComponent(slug)}?tab=draws`}
          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          ← {tournamentName ? `${tournamentName} · Draws` : "Draws"}
        </a>
        <div className="mt-5 border-b border-rule-soft">
          <TabBar
            tabs={visibleTabs(page.events, page.entrants, page.publication)}
            active="draws"
            hrefFor={(tab) =>
              tab === "overview"
                ? `/e/${encodeURIComponent(slug)}`
                : `/e/${encodeURIComponent(slug)}?tab=${tab}`
            }
            scheduleHref={`/e/${encodeURIComponent(slug)}/schedule`}
          />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground">
          {eventDisciplineLabel(draw.discipline)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[
            eventCodeLabel(draw.eventCode),
            kindLabel(draw.kind),
            entryCountLabel(draw.eventCode, draw.size),
          ].join(" · ")}
        </p>

        <div className="mt-5 grid gap-3">
          {!roundRobin ? (
            <DrawViewLinks
              slug={slug}
              drawKey={draw.drawKey}
              segment={activeSegment}
              active={view}
              roundIndex={roundIndex}
              playerQuery={playerQuery}
            />
          ) : null}
          {!roundRobin ? (
            <form method="get" className="flex max-w-xl flex-wrap items-center gap-2">
              <input type="hidden" name="view" value={view} />
              <input type="hidden" name="segment" value={activeSegment} />
              {view === 'round' ? <input type="hidden" name="round" value={roundIndex} /> : null}
              <label className="sr-only" htmlFor="draw-player">
                Find a player or pair
              </label>
              <input
                id="draw-player"
                name="player"
                defaultValue={playerQuery}
                placeholder="Find a player or pair"
                className={`h-9 min-w-0 flex-1 rounded px-3 ${INPUT_SKIN}`}
              />
                <button
                type="submit"
                className="h-9 border border-action-primary px-3 text-sm font-semibold text-foreground hover:bg-surface-sunken"
              >
                Find
              </button>
              {playerQuery ? (
                <a href={clearPlayerHref} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                  Clear player filter
                </a>
              ) : null}
            </form>
          ) : null}
        </div>

        <div className="mt-6 grid gap-6">
          {roundRobin ? (
            <>
              <StandingsTable draw={draw} slug={slug} />
              {segment
                ? segment.rounds.map((round) => (
                    <section key={round.label}>
                      <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
                        {round.label}
                      </h2>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {round.matches.map((node) => (
                          <MatchCard
                            key={node.nodeKey}
                            slug={slug}
                            match={nodeToMatch(
                              node,
                              teams,
                              draw.eventCode,
                              round.label,
                            )}
                          />
                        ))}
                      </div>
                    </section>
                  ))
                : null}
            </>
          ) : (
            <>
              <SegmentNavigation
                slug={slug}
                drawKey={draw.drawKey}
                segments={draw.segments}
                active={activeSegment}
                view={view}
                roundIndex={roundIndex}
                playerQuery={playerQuery}
              />
              {segment ? (
                view === "list" ? (
                  <MatchList
                    rounds={playerQuery ? pathRounds : segment.rounds}
                    teams={teams}
                    eventCode={draw.eventCode}
                    slug={slug}
                  />
                ) : view === "round" ? (
                  <>
                    <RoundPager
                      base={`/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(draw.drawKey)}`}
                      segment={activeSegment}
                      roundIndex={Math.min(
                        roundIndex,
                        Math.max(0, segment.rounds.length - 1),
                      )}
                      roundCount={segment.rounds.length}
                      playerQuery={playerQuery}
                    />
                    {segment.rounds[
                      Math.min(
                        roundIndex,
                        Math.max(0, segment.rounds.length - 1),
                      )
                    ] ? (
                      <MatchList
                        rounds={playerQuery
                          ? pathRounds.filter((round) => round.label === segment.rounds[Math.min(roundIndex, Math.max(0, segment.rounds.length - 1))].label)
                          : [segment.rounds[Math.min(roundIndex, Math.max(0, segment.rounds.length - 1))]]}
                        teams={teams}
                        eventCode={draw.eventCode}
                        slug={slug}
                      />
                    ) : null}
                  </>
                ) : (
                  <section
                    data-testid="public-bracket-canvas"
                    aria-label={`${eventDisciplineLabel(draw.discipline)} bracket`}
                    className="border-y border-rule-soft bg-surface-raised"
                  >
                    <div className="overflow-x-auto px-4 py-2 md:px-6">
                      <div
                        className="flex w-max min-w-full items-stretch"
                        data-bracket-grid
                        data-pinned-person={selectedPersonId ?? undefined}
                      >
                        {segment.rounds.map((round, roundPosition) => (
                          <Fragment key={round.label}>
                            {roundPosition > 0 ? <ConnectorColumn destination={round} nodeIndex={nodeIndex} teams={teams} /> : null}
                            <section data-bracket-round={round.label} className="flex w-64 shrink-0 flex-col">
                              <h2 className="h-4 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
                                {round.label}
                              </h2>
                              <div className="mt-3 flex flex-1 flex-col">
                                {round.matches.map((node) => (
                                  <div
                                    key={node.nodeKey}
                                    data-node-key={node.nodeKey}
                                    data-person-ids={nodePersonIds(node, teams).join(' ')}
                                    className="bracket-slot flex min-h-[50px] flex-1 items-center"
                                  >
                                    <MatchCard
                                      variant="bracket-node"
                                      slug={slug}
                                      match={nodeToMatch(
                                        node,
                                        teams,
                                        draw.eventCode,
                                        round.label,
                                      )}
                                    />
                                  </div>
                                ))}
                              </div>
                            </section>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                    <script type="module" src="/e/assets/bracket-path.js" />
                  </section>
                )
              ) : null}
            </>
          )}
        </div>
      </main>
    </PlayShell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <MessagePage
        heading="This draw is not available"
        body="Check the link, or ask the organizer for the current one."
      />
    );
  }
  return (
    <MessagePage
      heading="Something went wrong"
      body="Please try again in a moment."
    />
  );
}
