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
import { SegmentedNav } from "../components/SegmentedNav";
import { TournamentFrame } from "../components/TournamentFrame";
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
import { FIELD_INPUT, SECTION_TITLE } from "../lib/ui";
import { sectionHref, sectionLabel } from "../lib/tournamentFrame";
import { formatCalendarDay } from "../lib/format";
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
  /**
   * Scriptless presentation mode, persisted in the URL. `null` means no
   * `?view=` was given: the DEFAULT, adaptive state (contract §4.3/P5,
   * V3-PE10.2) — the response renders both the Round and Bracket markup,
   * CSS-toggled by viewport width (Round below 768px, Bracket at or above
   * it), so a first mobile visit gets Round without a client-side redirect
   * or any JavaScript. An explicit `?view=` always wins at every width.
   */
  view: "bracket" | "round" | "list" | null;
  roundIndex: number;
  playerQuery: string;
  /** SSR render instant, ms — the frame's one clock parameter. */
  nowMs: number;
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
      requestedView === "list" ||
      requestedView === "bracket"
        ? requestedView
        : null;
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
      nowMs: Date.now(),
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
  /** Contract §2.3: publication is data. A null score means "withheld" only
   *  when this is false; otherwise the match simply has no score yet
   *  (v3 package 29, V3-11-3). */
  scoresPublished: boolean,
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
        unresolved: side.unresolved ?? null,
        winner:
          decided && node.result?.winnerSide === (index === 0 ? "A" : "B"),
      };
    }),
    score: node.result?.score ?? null,
    decided,
    scheduledTime: node.scheduledTime,
    court: node.court,
    // D12: never the raw ISO date in prose — the same human date label the
    // schedule route already uses for its cards (`scheduleDateLabel`, now
    // itself redirected to the entrant time authority).
    playedOn: node.playedOn ? formatCalendarDay(node.playedOn) : null,
    localTime: node.localTime,
    courtLabel: node.courtLabel,
    sourceUrl: node.sourceUrl,
    sourceRef: node.sourceRef,
    scoresPublished,
    // Contract §3.6/§4.3, V3-PE10.1: the node's own 1-based position within
    // its round, already on the wire (`MatchNodeDTO.position`) — rendered as
    // a small visible reference so "Winner of {reference}" resolves to a
    // labelled source node without counting rows.
    matchNumber: node.position,
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
    const params = new URLSearchParams({ segment: segmentId, ...(view ? { view } : {}) });
    if (view === 'round') params.set('round', String(roundIndex));
    if (playerQuery) params.set('player', playerQuery);
    return `${base}?${params}`;
  };
  return (
    <SegmentedNav
      label="Draw segments"
      segments={segments.map((segment) => ({
        label: segment.label || segment.id,
        href: href(segment.id),
        current: segment.id === active,
      }))}
    />
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
  const href = (view: "bracket" | "round" | "list") => {
    const params = new URLSearchParams({ segment, view });
    if (view === "round") params.set("round", String(roundIndex));
    if (playerQuery) params.set("player", playerQuery);
    return `${base}?${params}`;
  };
  return (
    <SegmentedNav
      label="Draw view"
      segments={(
        [
          ["bracket", "Bracket"],
          ["round", "Round"],
          ["list", "List"],
        ] as const
      ).map(([view, label]) => ({ label, href: href(view), current: active === view }))}
    />
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
  scoresPublished,
  highlightPersonId,
  highlightPersonName,
}: {
  rounds: DrawDetailDTO["segments"][number]["rounds"];
  teams: Map<string, TeamDTO>;
  eventCode: string;
  slug: string;
  scoresPublished: boolean;
  highlightPersonId?: string | null;
  highlightPersonName?: string | null;
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
                match={nodeToMatch(node, teams, eventCode, round.label, scoresPublished)}
                highlightPersonId={highlightPersonId}
                highlightPersonName={highlightPersonName}
                compactList
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
    page,
    draw,
    activeSegment,
    view,
    roundIndex,
    playerQuery,
    nowMs,
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
  const selectedPerson = selectedPersonId
    ? draw.teams.flatMap((team) => team.persons).find((person) => person.identity?.id === selectedPersonId)
    : null;
  const selectedPersonLabel = selectedPerson
    ? personRefModel({ slug, identity: selectedPerson.identity, state: selectedPerson.resolution }).text
    : playerQuery;
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
    ...(view ? { view } : {}),
  });
  if (view === 'round') clearPlayerParams.set('round', String(roundIndex));
  const clearPlayerHref = `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(draw.drawKey)}?${clearPlayerParams}`;
  const matchCount = pathRounds.reduce((count, round) => count + round.matches.length, 0);
  const clampedRoundIndex = Math.min(roundIndex, Math.max(0, (segment?.rounds.length ?? 1) - 1));

  /** Round view, at the currently selected round (contract §4.3/P5's
   *  mobile default) — shared by the explicit `?view=round` branch and the
   *  adaptive default below it. */
  const roundBlock = segment ? (
    <>
      <RoundPager
        base={`/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(draw.drawKey)}`}
        segment={activeSegment}
        roundIndex={clampedRoundIndex}
        roundCount={segment.rounds.length}
        playerQuery={playerQuery}
      />
      {segment.rounds[clampedRoundIndex] ? (
        <MatchList
          rounds={playerQuery
            ? pathRounds.filter((round) => round.label === segment.rounds[clampedRoundIndex].label)
            : [segment.rounds[clampedRoundIndex]]}
          teams={teams}
          eventCode={draw.eventCode}
          slug={slug}
          scoresPublished={draw.resultsPublished}
          highlightPersonId={selectedPersonId}
          highlightPersonName={selectedPersonLabel}
        />
      ) : null}
    </>
  ) : null;

  /** The horizontal bracket canvas (contract §4.3 — enlarges rather than
   *  shrinking names; scrolls in its own labelled region). Shared by the
   *  explicit `?view=bracket` branch and the adaptive default below it. */
  const bracketBlock = segment ? (
    <section
      data-testid="public-bracket-canvas"
      aria-label={`${eventDisciplineLabel(draw.discipline)} bracket`}
      className="min-w-0 border-y border-rule-soft bg-surface-raised"
    >
      <div className="overflow-x-auto px-4 pb-2 pt-3 md:px-6">
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
                      className="bracket-slot flex min-h-[46px] flex-1 items-center"
                    >
                      <MatchCard
                        variant="bracket-node"
                        slug={slug}
                        match={nodeToMatch(
                          node,
                          teams,
                          draw.eventCode,
                          round.label,
                          draw.resultsPublished,
                        )}
                        highlightPersonId={selectedPersonId}
                        highlightPersonName={selectedPersonLabel}
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
  ) : null;

  return (
    <PlayShell>
      {/* Contract §11: a draw detail keeps the tournament's identity, its
          live CTA and the Draws tab highlighted; the breadcrumb ends at this
          draw's own discipline, which replaces the floating
          "← Tournament · Draws" link this page used to carry. */}
      <TournamentFrame
        page={page}
        nowMs={nowMs}
        active="draws"
        trail={[
          { label: sectionLabel("draws"), href: sectionHref(slug, "draws") },
          { label: eventDisciplineLabel(draw.discipline), href: null },
        ]}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        <h2 className={SECTION_TITLE}>
          {eventDisciplineLabel(draw.discipline)}
        </h2>
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
              {view ? <input type="hidden" name="view" value={view} /> : null}
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
                className={`${FIELD_INPUT} flex-1`}
              />
              <button
                type="submit"
                className="h-10 rounded-sm border border-action-primary bg-surface-raised px-3 text-sm font-semibold text-foreground hover:bg-surface-sunken"
              >
                Find
              </button>
              {playerQuery ? (
                <a href={clearPlayerHref} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                  Clear search
                </a>
              ) : null}
            </form>
          ) : null}
          {playerQuery ? (
            // V3-PE12.1: name the actual behaviour exactly — a plural-aware
            // count of what was found, not "Showing matches for X" (which
            // does not say whether that is filtering, highlighting, or the
            // whole draw). The bracket canvas is never filtered — it dims
            // the rest of the tree instead (`bracket-path.js`) — so "found"
            // covers both the filtered List/Round views and the highlighted
            // Bracket view honestly.
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-s-2 border-action-primary bg-surface-sunken px-3 py-2 text-sm" role="status">
              <span>
                {matchCount} {matchCount === 1 ? 'match' : 'matches'} found for &lsquo;<strong>{selectedPersonLabel}</strong>&rsquo;
              </span>
            </div>
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
                              draw.resultsPublished,
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
                    scoresPublished={draw.resultsPublished}
                    highlightPersonId={selectedPersonId}
                    highlightPersonName={selectedPersonLabel}
                  />
                ) : view === "round" ? (
                  roundBlock
                ) : view === "bracket" ? (
                  bracketBlock
                ) : (
                  // No explicit `?view=` (contract §4.3/P5, V3-PE10.2): both
                  // markups render in one response, CSS-toggled by viewport
                  // width — Round below 768px (the mobile default), Bracket
                  // canvas at or above it. No client redirect, no JS.
                  <>
                    <div className="md:hidden">{roundBlock}</div>
                    <div className="hidden md:block">{bracketBlock}</div>
                  </>
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
