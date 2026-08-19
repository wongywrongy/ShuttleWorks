/**
 * `/e/{slug}/draws/{drawKey}` — one draw, fully navigable (SP-P7 §3.4).
 *
 * Round robin renders the standings table (when results are published)
 * over the round-by-round match list; elimination renders rounds as
 * columns inside the card's own horizontal scroll (R11: the PAGE never
 * scrolls sideways — wide content scrolls in its container; scroll is not
 * truncation, every node stays whole and reachable). A multi-segment draw
 * (consolation, plates) gets a link-pill toggle — `?segment=`, zero JS,
 * the tier's instant-apply-facet idiom.
 *
 * Nodes reuse the public MatchCard: one anatomy for a player's own match
 * and the same match seen in the tree (§3.3's shared-anatomy rule). Seeds
 * render as `[n]` after the name; byes as the muted "Bye" side; result
 * data arrives pre-gated by the API.
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { MatchCard } from '../components/MatchCard';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type {
  DrawDetailDTO,
  MatchNodeDTO,
  SegmentDTO,
  TeamDTO,
} from '../lib/draws.types';
import { isRoundRobin, kindLabel } from '../lib/draws.types';
import type { EntryPageDTO } from '../lib/entryPage.types';
import type { PlayerMatchDTO } from '../lib/player.types';
import type { Route } from './+types/draw';

export interface DrawLoaderData {
  slug: string;
  tournamentName: string | null;
  draw: DrawDetailDTO;
  /** Validated `?segment=` — a real segment id, defaulting to the first. */
  activeSegment: string;
}

function notFound(): Response {
  return new Response('Not found', { status: 404 });
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
    const requested = new URL(request.url).searchParams.get('segment');
    const activeSegment =
      draw.segments.find((segment) => segment.id === requested)?.id ??
      draw.segments[0]?.id ??
      '';
    const payload: DrawLoaderData = {
      slug: page.page.slug,
      tournamentName: page.tournament.name,
      draw,
      activeSegment,
    };
    return payload;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }
}

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) return [{ title: 'Draw not found' }];
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
  roundLabel: string | null,
): PlayerMatchDTO {
  const decided = node.result?.winnerSide === 'A' || node.result?.winnerSide === 'B';
  return {
    eventCode: '',
    roundLabel,
    sides: node.sides.map((side, index) => {
      const team = side.participantKey ? teams.get(side.participantKey) : undefined;
      return {
        names: team
          ? team.names.map((name) =>
              team.seed !== null ? `${name} [${team.seed}]` : name,
            )
          : side.participantKey
            ? [side.participantKey]
            : [],
        placeholder: side.bye ? 'Bye' : side.placeholder,
        winner: decided && node.result?.winnerSide === (index === 0 ? 'A' : 'B'),
      };
    }),
    score: node.result?.score ?? null,
    decided,
    scheduledTime: node.scheduledTime,
    court: node.court,
  };
}

function StandingsTable({ draw }: { draw: DrawDetailDTO }) {
  const teams = new Map(draw.teams.map((team) => [team.participantKey, team]));
  if (draw.standings === null) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-rule-soft bg-surface-raised shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rule-soft text-left text-xs uppercase tracking-[0.06em] text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Pos</th>
            <th className="px-3 py-2 font-semibold">Player</th>
            <th className="px-3 py-2 text-right font-semibold">PL</th>
            <th className="px-3 py-2 text-right font-semibold">W</th>
            <th className="px-3 py-2 text-right font-semibold">L</th>
            <th className="px-3 py-2 text-right font-semibold">GM</th>
            <th className="px-3 py-2 text-right font-semibold">PTS</th>
            <th className="px-3 py-2 font-semibold">History</th>
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
                  <span className="text-foreground">
                    {team ? team.names.join(' / ') : row.participantKey}
                  </span>
                  {team?.club ? (
                    <span className="block text-xs text-muted-foreground">
                      {team.club}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.played}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.wins}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.losses}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {`${row.gamesWon}-${row.gamesLost}`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {`${row.pointsWon}-${row.pointsLost}`}
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {row.history.map((pill, index) => (
                      <span
                        key={index}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                          pill === 'W'
                            ? 'bg-status-live-bg text-status-live'
                            : 'bg-surface-sunken text-muted-foreground'
                        }`}
                      >
                        {pill}
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

function SegmentPills({
  slug,
  drawKey,
  segments,
  active,
}: {
  slug: string;
  drawKey: string;
  segments: SegmentDTO[];
  active: string;
}) {
  if (segments.length < 2) return null;
  const base = `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(drawKey)}`;
  return (
    <nav aria-label="Draw segments" className="flex flex-wrap gap-2">
      {segments.map((segment) => (
        <a
          key={segment.id}
          href={`${base}?segment=${encodeURIComponent(segment.id)}`}
          aria-current={segment.id === active ? 'page' : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${
            segment.id === active
              ? 'border-action-primary font-medium text-foreground'
              : 'border-rule-soft text-muted-foreground hover:border-rule-control'
          }`}
        >
          {segment.label || segment.id}
        </a>
      ))}
    </nav>
  );
}

export default function Draw({ loaderData }: Route.ComponentProps) {
  const { slug, tournamentName, draw, activeSegment } = loaderData;
  const teams = new Map(draw.teams.map((team) => [team.participantKey, team]));
  const roundRobin = isRoundRobin(draw.kind);
  const segment =
    draw.segments.find((candidate) => candidate.id === activeSegment) ??
    draw.segments[0];

  return (
    <PlayShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        <a
          href={`/e/${encodeURIComponent(slug)}?tab=draws`}
          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          ← {tournamentName ? `${tournamentName} · Draws` : 'Draws'}
        </a>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground">
          {draw.discipline}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[draw.eventCode, kindLabel(draw.kind), `${draw.size} entries`].join(' · ')}
        </p>

        <div className="mt-6 grid gap-6">
          {roundRobin ? (
            <>
              <StandingsTable draw={draw} />
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
                            match={nodeToMatch(node, teams, null)}
                          />
                        ))}
                      </div>
                    </section>
                  ))
                : null}
            </>
          ) : (
            <>
              <SegmentPills
                slug={slug}
                drawKey={draw.drawKey}
                segments={draw.segments}
                active={activeSegment}
              />
              {segment ? (
                <div className="overflow-x-auto pb-2">
                  <div className="flex items-stretch gap-4">
                    {segment.rounds.map((round) => (
                      <div key={round.label} className="w-64 shrink-0">
                        <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
                          {round.label}
                        </h2>
                        <div className="mt-3 flex h-full flex-col justify-around gap-3">
                          {round.matches.map((node) => (
                            <MatchCard
                              key={node.nodeKey}
                              match={nodeToMatch(node, teams, null)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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
    <MessagePage heading="Something went wrong" body="Please try again in a moment." />
  );
}
