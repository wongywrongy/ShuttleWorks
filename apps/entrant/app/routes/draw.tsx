/**
 * `/e/{slug}/draws/{drawKey}` — one draw, fully navigable (SP-P7 §3.4).
 *
 * Round robin renders the standings table (when results are published)
 * over the round-by-round match list; elimination renders rounds as
 * columns inside the bracket's own scroll region (R11: the PAGE never
 * scrolls sideways — wide content scrolls in its container; scroll is not
 * truncation, every node stays whole and reachable). A multi-segment draw
 * (consolation, plates) gets a plain underlined segment navigation — `?segment=`, zero JS,
 * the tier's instant-apply-facet idiom.
 *
 * **public-visual-fixes P4 — the bracket is the draw.** Round is no longer a
 * page MODE beside Bracket: it is navigation INSIDE the bracket (match-card
 * §4.3). The tree renders once, at every width, inside one `overflow: auto`
 * region that is bounded to the viewport, named, keyboard-reachable and
 * snap-scrolled by round on narrow screens; sticky round headers and the
 * `R32 · R16 · QF · SF · F` anchor controls replace the previous/next
 * round pager, which repeated the round heading twice on one page. The
 * legacy `?view=round` and `?view=path` links still resolve here — the
 * first positions the requested round, the second keeps the selected
 * player's path lit with no JavaScript at all. The useful List view stays.
 *
 * Nodes reuse the public MatchCard: one anatomy for a player's own match
 * and the same match seen in the tree (§3.3's shared-anatomy rule). Seeds
 * render as `[n]` after the name; byes as the muted "Bye" side; result
 * data arrives pre-gated by the API.
 */
import { Fragment } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";

import { MatchCard } from "../components/MatchCard";
import { SearchField } from "../components/SearchField";
import { PersonGroup } from "../components/PersonGroup";
import { EmptyState } from "../components/EmptyState";
import { MessagePage } from "../components/MessagePage";
import { PlayShell } from "../components/PlayShell";
import { SegmentedNav } from "../components/SegmentedNav";
import { TournamentFrame } from "../components/TournamentFrame";
import { ApiError, apiGet } from "../lib/apiFetch.server";
import { demoNowMs } from "../lib/demoClock.server";
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
  roundShortLabel,
} from "../lib/draws.types";
import type { EntryPageDTO } from "../lib/entryPage.types";
import { ACTION_LINK, ACTION_LINK_MUTED, SECTION_TITLE } from "../lib/ui";
import { sectionHref, sectionLabel } from "../lib/tournamentFrame";
import { formatCalendarDay } from "../lib/format";
import type { MatchCardData } from "../components/MatchCard";
import { personRefModel } from "../../public/assets/person-ref.js";
// The tier's ONE folding for searchable public text (P2): the reader types
// `nguyen`, the roster holds `Nguyễn`. A second lowercase-only comparison
// here is exactly how that search stops matching.
import { searchKey } from "../../public/assets/entrants-filter.js";
import type { Route } from "./+types/draw";

export interface DrawLoaderData {
  slug: string;
  tournamentName: string | null;
  page: EntryPageDTO;
  draw: DrawDetailDTO;
  /** Validated `?segment=` — a real segment id, defaulting to the first. */
  activeSegment: string;
  /**
   * Scriptless presentation mode, persisted in the URL. Since P4 there are
   * exactly two: the bracket (the default at every width — round navigation
   * lives inside it) and the flat List. The legacy `?view=round` and
   * `?view=path` spellings resolve to the bracket rather than 404ing or
   * silently dropping their round/player, so old links keep working.
   */
  view: "bracket" | "list" | null;
  roundIndex: number;
  /** Whether the URL asked for a particular round (`?round=`, or the legacy
   *  `?view=round`) — what positions the scroll region on arrival. */
  roundRequested: boolean;
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
    // P4: `round` and `path` were page modes; they are now positions and
    // selections INSIDE the bracket, so both resolve to it.
    const view: DrawLoaderData["view"] =
      requestedView === "list"
        ? "list"
        : requestedView === "bracket" ||
            requestedView === "round" ||
            requestedView === "path"
          ? "bracket"
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
      roundRequested: query.has("round") || requestedView === "round",
      playerQuery: query.get("player")?.trim() ?? "",
      nowMs: demoNowMs(),
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
    // P7: the APPROVED day when there is one — `playedOn` is the source
    // record's date, so a live or rescheduled match read a day the desk does
    // not agree with. The card gains no date it did not already have.
    playedOn: node.playedOn
      ? formatCalendarDay(node.scheduledDate ?? node.playedOn)
      : null,
    localTime: node.localTime,
    courtLabel: node.courtLabel,
    sourceUrl: node.sourceUrl,
    sourceRef: node.sourceRef,
    scoresPublished,
    // Contract §3.6/§4.3/§6.1 (public-visual-fixes P3): the SHARED human
    // match reference, spelled once server-side and shown verbatim — the
    // same string the operator's match list carries for this match. This
    // page has ONE event, so it takes the event-code-dropped spelling
    // (`R32·11`), which is what makes the compact line read
    // `R16·2 · 10:00 · Court 3`. The old `Match {position}` label is gone:
    // it renumbered per surface and could not be used to talk to the desk.
    reference: node.shortReference ?? null,
    shortReference: node.shortReference ?? null,
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
  playerQuery,
}: {
  slug: string;
  drawKey: string;
  segments: SegmentDTO[];
  active: string;
  view: DrawLoaderData['view'];
  playerQuery: string;
}) {
  if (segments.length < 2) return null;
  const base = `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(drawKey)}`;
  const href = (segmentId: string) => {
    const params = new URLSearchParams({ segment: segmentId, ...(view ? { view } : {}) });
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

/**
 * Two modes, not three (P4). "Round" was never a different VIEW of the draw —
 * it was one column of the same tree, reached by a pager that repeated the
 * round heading on the page it was already on. Rounds are now navigation
 * inside the bracket (`RoundControls`); List stays, because a flat
 * chronological read of every match is genuinely a different question.
 */
function DrawViewLinks({
  slug,
  drawKey,
  segment,
  active,
  playerQuery,
}: {
  slug: string;
  drawKey: string;
  segment: string;
  active: DrawLoaderData["view"];
  playerQuery: string;
}) {
  const base = `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(drawKey)}`;
  const href = (view: "bracket" | "list") => {
    const params = new URLSearchParams({ segment, view });
    if (playerQuery) params.set("player", playerQuery);
    return `${base}?${params}`;
  };
  return (
    <SegmentedNav
      label="Draw view"
      segments={(
        [
          ["bracket", "Bracket"],
          ["list", "List"],
        ] as const
      ).map(([view, label]) => ({
        label,
        href: href(view),
        // No `?view=` at all is the bracket: it is this page's default.
        current: view === "bracket" ? active !== "list" : active === view,
      }))}
    />
  );
}

/** A stable, human-readable anchor per round column — what the native
 *  round controls jump to with no JavaScript at all. */
export function roundAnchorId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `draw-round-${slug || "x"}`;
}

/**
 * `R32 · R16 · QF · SF · F` (match-card §4.3), adapted to whatever rounds
 * this draw actually has — including a round-robin's `R1 · R2 · R3` and an
 * organizer's own round names, which `roundShortLabel` passes through rather
 * than inventing a code for.
 *
 * They are NATIVE anchors: with scripting off, the browser scrolls the
 * bracket's own scroll region to the column, which is the whole requirement.
 * `bracket-path.js` upgrades the same elements to a smooth in-region scroll
 * that does not push a `#hash` onto the URL.
 */
function RoundControls({
  rounds,
  activeIndex,
}: {
  rounds: DrawDetailDTO["segments"][number]["rounds"];
  activeIndex: number | null;
}) {
  if (rounds.length < 2) return null;
  return (
    <nav aria-label="Rounds" className="flex flex-wrap items-center gap-1 text-sm">
      {rounds.map((round, index) => (
        <Fragment key={round.label}>
          {index > 0 ? (
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
          ) : null}
          <a
            href={`#${roundAnchorId(round.label)}`}
            data-round-jump={roundAnchorId(round.label)}
            aria-current={index === activeIndex ? "true" : undefined}
            className={`rounded-sm px-1.5 py-1 font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              index === activeIndex ? "text-foreground underline" : "text-accent"
            }`}
          >
            <span className="sr-only">Jump to </span>
            {roundShortLabel(round.label) ?? round.label}
          </a>
        </Fragment>
      ))}
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

/** The sticky round-header height, spelled once: the connector column has to
 *  reserve exactly the same strip, or every brace sits one header off its
 *  nodes. */
const ROUND_HEADER_HEIGHT = 'h-6';

function ConnectorColumn({
  destination,
  nodeIndex,
  teams,
  selectedPersonId,
}: {
  destination: DrawDetailDTO['segments'][number]['rounds'][number];
  nodeIndex: Map<string, MatchNodeDTO>;
  teams: Map<string, TeamDTO>;
  /** Painted server-side so the path survives with JavaScript off (§4.3). */
  selectedPersonId?: string | null;
}) {
  return (
    <div className="flex w-8 shrink-0 flex-col" aria-hidden="true" data-bracket-links>
      <span className={ROUND_HEADER_HEIGHT} />
      <div className="mt-3 flex flex-1 flex-col">
        {destination.matches.map((node) => {
          const ids = new Set(nodePersonIds(node, teams));
          for (const side of node.sides) {
            const feeder = side.feederNodeKey ? nodeIndex.get(side.feederNodeKey) : undefined;
            for (const id of feeder ? nodePersonIds(feeder, teams) : []) ids.add(id);
          }
          const onPath = Boolean(selectedPersonId && ids.has(selectedPersonId));
          return (
            <span
              key={node.nodeKey}
              className={`bracket-link-slot flex-1${onPath ? ' is-person-path' : ''}`}
              data-person-ids={[...ids].join(' ')}
            />
          );
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
    roundRequested,
    playerQuery,
    nowMs,
  } = loaderData;
  const teams = new Map(draw.teams.map((team) => [team.participantKey, team]));
  const persons = draw.teams.flatMap((team) => team.persons);
  // P4 (P2's flagged defect): `?player=` resolves by STABLE IDENTITY — the
  // tournament-person id the profile route and `data-person-ids` are keyed
  // on. The old resolution took the first person whose displayed name merely
  // CONTAINED the query, so `?player=Ada` claimed "Adaline Tan"'s identity,
  // pinned her path and labelled the banner with her name. A typed name is
  // still useful, so it survives as a SEARCH — case- and accent-blind
  // through the tier's one folding — but it asserts no identity: it
  // highlights and filters every side it matches and pins nobody's path.
  const selectedPerson =
    playerQuery !== ''
      ? persons.find((person) => person.identity?.id === playerQuery) ?? null
      : null;
  const selectedPersonId = selectedPerson?.identity?.id ?? null;
  const selectedPersonLabel = selectedPerson
    ? personRefModel({
        slug,
        identity: selectedPerson.identity,
        state: selectedPerson.resolution,
      }).text
    : null;
  // P8: `?player=` carries a MINTED person key (`entry-{uuid}` or the
  // importer's `player-{sha}`), and a key resolves inside one draw only. When
  // it names someone who is not in THIS draw, echoing it would print a
  // 71-character internal identifier into the search box and the status line
  // - the raw-id leak the plan forbids, and the exact shape the surface book
  // recorded. A typed name never wears those prefixes.
  const identityQuery = /^(entry|player)-/.test(playerQuery);
  const identityNotInThisDraw = identityQuery && !selectedPerson;
  /** The name search — set only when the query did NOT resolve to an id. */
  const nameQuery =
    playerQuery !== '' && !selectedPerson && !identityNotInThisDraw ? playerQuery : '';
  const queryLabel = selectedPersonLabel ?? playerQuery;
  const roundRobin = isRoundRobin(draw.kind);
  const segment =
    draw.segments.find((candidate) => candidate.id === activeSegment) ??
    draw.segments[0];
  const nodeIndex = new Map(
    (segment?.rounds.flatMap((round) => round.matches) ?? []).map((node) => [node.nodeKey, node]),
  );
  const personMatchesQuery = (person: (typeof persons)[number]): boolean => {
    if (selectedPersonId) return person.identity?.id === selectedPersonId;
    if (nameQuery === '') return true;
    const text = personRefModel({
      slug,
      identity: person.identity,
      state: person.resolution,
      label: person.label,
    }).text;
    return searchKey(text).includes(searchKey(nameQuery));
  };
  const pathRounds = segment
    ? segment.rounds
        .map((round) => ({
          ...round,
          matches: round.matches.filter((node) =>
            node.sides.some((side) => {
              if (playerQuery === "") return true;
              const team = side.participantKey
                ? teams.get(side.participantKey)
                : undefined;
              return team?.persons.some(personMatchesQuery) ?? false;
            }),
          ),
        }))
        .filter((round) => round.matches.length > 0)
    : [];
  /**
   * The one person a NAME search matched, when it matched exactly one — the
   * no-JavaScript way into a pinned path (`?view=path&player={id}`), and the
   * only place a name is allowed to become an identity: the reader picks it
   * from the offer, the page never assumes it (the P2-flagged defect).
   */
  const soleNameMatch =
    nameQuery !== ''
      ? (() => {
          const found = new Map(
            persons
              .filter((person) => person.identity?.id && personMatchesQuery(person))
              .map((person) => [person.identity!.id, person]),
          );
          return found.size === 1 ? [...found.values()][0] : null;
        })()
      : null;
  const base = `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(draw.drawKey)}`;
  const clearPlayerParams = new URLSearchParams({
    segment: activeSegment,
    ...(view ? { view } : {}),
  });
  const clearPlayerHref = `${base}?${clearPlayerParams}`;
  const matchCount = pathRounds.reduce((count, round) => count + round.matches.length, 0);
  const clampedRoundIndex = Math.min(roundIndex, Math.max(0, (segment?.rounds.length ?? 1) - 1));
  const initialRound =
    roundRequested && segment?.rounds[clampedRoundIndex]
      ? roundAnchorId(segment.rounds[clampedRoundIndex].label)
      : undefined;

  /**
   * The bracket (contract §4.3, P4). ONE tree at every width, inside one
   * `overflow: auto` region that is bounded to the viewport, carries an
   * accessible name, is reachable by keyboard (`tabIndex`) and snaps by
   * round below `md` — the narrow-screen answer that does not shrink a name
   * to fit another column on screen. Round headers stick to the top of that
   * region; the round controls above it are native anchors into the columns.
   */
  const bracketBlock = segment ? (
    <section
      data-testid="public-bracket-canvas"
      className="min-w-0 border-y border-rule-soft bg-surface-raised"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-2 pt-3 md:px-6">
        <RoundControls
          rounds={segment.rounds}
          activeIndex={roundRequested ? clampedRoundIndex : null}
        />
        {/* The script's mount point (the `entrants-filter.js` idiom): the
            "Highlight path" toggle, its reset and the selected player's
            "View profile" link exist only where JavaScript runs, so a
            no-JS reader is never shown a dead control. The server-rendered
            half below is the no-JS path state itself — `?player={id}`,
            which the Find form and `?view=path` links both produce. */}
        <div data-bracket-toolbar className="flex flex-wrap items-center gap-2 text-sm" />
        {selectedPersonId ? (
          <p className="flex flex-wrap items-center gap-2 text-sm" data-path-summary>
            <span className="text-muted-foreground">
              Path: <strong className="font-semibold text-foreground">{selectedPersonLabel}</strong>
            </span>
            <a href={clearPlayerHref} className={ACTION_LINK}>
              Clear path
            </a>
          </p>
        ) : null}
      </div>
      {/* `relative` is load-bearing, not decoration: the sr-only spans inside
          the tree ("Winner: ") are `position: absolute`, and with no
          positioned ancestor here their containing block is the document — so
          they escape this container's clip at the scrolled-out right edge and
          give the PAGE 33px of horizontal scroll (§4.3's "the page never
          scrolls horizontally"; the geometry spec catches it). */}
      <div
        role="region"
        tabIndex={0}
        aria-label={`${eventDisciplineLabel(draw.discipline)} bracket`}
        data-bracket-scroll
        className="bracket-scroll relative snap-x snap-mandatory overflow-auto px-4 pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:snap-none md:px-6"
      >
        <div
          className={`flex w-max min-w-full items-stretch${selectedPersonId ? ' has-person-path' : ''}`}
          data-bracket-grid
          data-pinned-person={selectedPersonId ?? undefined}
          data-initial-round={initialRound}
        >
          {segment.rounds.map((round, roundPosition) => (
            <Fragment key={round.label}>
              {roundPosition > 0 ? (
                <ConnectorColumn
                  destination={round}
                  nodeIndex={nodeIndex}
                  teams={teams}
                  selectedPersonId={selectedPersonId}
                />
              ) : null}
              <section
                id={roundAnchorId(round.label)}
                data-bracket-round={round.label}
                className="flex w-72 shrink-0 snap-start flex-col"
              >
                <h2
                  className={`bracket-round-header ${ROUND_HEADER_HEIGHT} flex items-center text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground`}
                >
                  {round.label}
                </h2>
                <div className="mt-3 flex flex-1 flex-col">
                  {round.matches.map((node) => {
                    const ids = nodePersonIds(node, teams);
                    const onPath = Boolean(selectedPersonId && ids.includes(selectedPersonId));
                    return (
                      <div
                        key={node.nodeKey}
                        data-node-key={node.nodeKey}
                        data-person-ids={ids.join(' ')}
                        className={`bracket-slot flex flex-1 items-center${onPath ? ' is-person-path' : ''}`}
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
                          highlightPersonName={nameQuery || null}
                        />
                      </div>
                    );
                  })}
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
              playerQuery={playerQuery}
            />
          ) : null}
          {/* P7: the visible "Find" button is gone. The field is the tier's
              one search treatment — icon, real (`sr-only`) label, invisible
              submit — and the form is still a native GET that keeps the view
              and the segment in the URL. */}
          {!roundRobin ? (
            <form method="get" role="search" className="flex max-w-xl flex-wrap items-center gap-3">
              {view ? <input type="hidden" name="view" value={view} /> : null}
              <input type="hidden" name="segment" value={activeSegment} />
              <SearchField
                id="draw-player"
                name="player"
                label="Find a player or pair"
                placeholder="Find a player or pair"
                // P6: an identity query is NOT display text. When
                // `?player=` resolved to a person, the box shows their NAME
                // (which is also what a re-submit searches for), never the
                // raw key the URL carries — a 71-character `player-<sha>` in
                // a search box is the raw-identifier leak the plan forbids.
                defaultValue={selectedPersonLabel ?? (identityNotInThisDraw ? '' : playerQuery)}
                submitLabel="Find in this draw"
                className="min-w-0 flex-1 basis-56"
              />
              {playerQuery ? (
                <a href={clearPlayerHref} className={ACTION_LINK_MUTED}>
                  Clear search
                </a>
              ) : null}
            </form>
          ) : null}
          {playerQuery ? (
            // V3-PE12.1: name the actual behaviour exactly — a plural-aware
            // count of what was found, not "Showing matches for X" (which
            // does not say whether that is filtering, highlighting, or the
            // whole draw). The bracket is never filtered — it lights the
            // path and dims the rest of the tree instead — so "found"
            // covers both the filtered List view and the highlighted
            // bracket honestly. P4: the quoted term is what the reader
            // actually asked for — a resolved person's name when the query
            // was an identity, the typed text otherwise. A name search
            // names nobody: it never re-prints someone else's full name as
            // though the reader had picked them.
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-s-2 border-action-primary bg-surface-sunken px-3 py-2 text-sm" role="status">
              <span>
                {identityNotInThisDraw ? (
                  'That player is not in this draw.'
                ) : (
                  <>
                    {matchCount} {matchCount === 1 ? 'match' : 'matches'} found for &lsquo;<strong>{queryLabel}</strong>&rsquo;
                  </>
                )}
              </span>
              {soleNameMatch?.identity ? (
                <a
                  href={`${base}?${new URLSearchParams({
                    segment: activeSegment,
                    view: 'path',
                    player: soleNameMatch.identity.id!,
                  })}`}
                  className={ACTION_LINK}
                >
                  Show{' '}
                  {
                    personRefModel({
                      slug,
                      identity: soleNameMatch.identity,
                      state: soleNameMatch.resolution,
                    }).text
                  }
                  &rsquo;s path
                </a>
              ) : null}
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
                playerQuery={playerQuery}
              />
              {/* P4: ONE tree, one response, every width. The old pair of
                  CSS-toggled blocks shipped the draw twice and made "Round"
                  a page mode; rounds are navigation inside the bracket now,
                  so the narrow-screen answer is the same tree, snapped by
                  round, with names at full size. */}
              {segment ? (view === "list" ? (
                <MatchList
                  rounds={playerQuery ? pathRounds : segment.rounds}
                  teams={teams}
                  eventCode={draw.eventCode}
                  slug={slug}
                  scoresPublished={draw.resultsPublished}
                  highlightPersonId={selectedPersonId}
                  highlightPersonName={nameQuery || null}
                />
              ) : (
                bracketBlock
              )) : null}
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
