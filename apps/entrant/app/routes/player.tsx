/**
 * `/e/{slug}/players/{personKey}` — one person's tournament (SP-P7 §3.3).
 *
 * Keyed by the opaque person id, never the name (R-P7c: two entrants who
 * share a name are two pages). The loader makes two public reads — the
 * page projection for the tournament's identity, then the player
 * projection — and inherits every gate from the API: unpublished entrants,
 * an unknown person, and a pending-only person all answer the same uniform
 * 404 upstream, so this file has one error path.
 *
 * **"Coming up" renders above "Played" — a deliberate product decision;
 * do not flip it** (§3.3, binding). The record renders only when the API
 * sent one (results published); the match cards' scores and winner marks
 * arrive pre-gated the same way.
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { MatchCard } from '../components/MatchCard';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { eventCodeLabel } from '../lib/draws.types';
import { formatDateLong } from '../lib/format';
import type { PlayerPageDTO } from '../lib/player.types';
import type { Route } from './+types/player';

export interface PlayerLoaderData {
  slug: string;
  tournamentName: string | null;
  tournamentDate: string | null;
  player: PlayerPageDTO;
}

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export async function loader({ params }: { params: { slug?: string; personKey?: string } }) {
  const { slug, personKey } = params;
  if (!slug || !personKey) throw notFound();

  try {
    const page = await apiGet<EntryPageDTO>(
      `/e/api/page/${encodeURIComponent(slug)}`,
    );
    const player = await apiGet<PlayerPageDTO>(
      `/e/api/page/${encodeURIComponent(slug)}/players/${encodeURIComponent(personKey)}`,
    );
    const payload: PlayerLoaderData = {
      slug: page.page.slug,
      tournamentName: page.tournament.name,
      tournamentDate: page.tournament.date,
      player,
    };
    return payload;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }
}

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) return [{ title: 'Player not found' }];
  return [
    {
      title: data.tournamentName
        ? `${data.player.name} · ${data.tournamentName}`
        : data.player.name,
    },
  ];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export default function Player({ loaderData }: Route.ComponentProps) {
  const { slug, tournamentName, tournamentDate, player } = loaderData;
  const coming = player.matches.filter((match) => !match.decided);
  const played = player.matches.filter((match) => match.decided);
  const record = player.record;

  return (
    <PlayShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
        <a
          href={`/e/${encodeURIComponent(slug)}`}
          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          ← {tournamentName ?? 'Tournament page'}
        </a>

        {/* Header card (§3.3): avatar · name · club · events · record. */}
        <section className="mt-4 rounded-lg border border-rule-soft bg-surface-raised p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent font-display text-base font-bold text-accent-ink"
            >
              {initials(player.name)}
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                {player.name}
              </h1>
              {player.club ? (
                <p className="text-sm text-muted-foreground">{player.club}</p>
              ) : null}
            </div>
          </div>
          {player.events.length > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {player.events
                .map(
                  (event) =>
                    `${eventCodeLabel(event.code)} · ${event.discipline}` +
                    // §3.3: "CXD with Prashant Vurikiti". Absent for singles
                    // and while the partner is not publicly visible.
                    (event.partnerName ? ` with ${event.partnerName}` : ''),
                )
                .join('  |  ')}
            </p>
          ) : null}
          {record !== null ? (
            <div className="mt-3">
              <p className="text-sm text-foreground">
                <span className="font-semibold tabular-nums">
                  {`${record.wins}-${record.losses}`}
                </span>
                {` of ${record.played} played`}
              </p>
              {record.played > 0 ? (
                <div aria-hidden className="mt-1.5 flex h-1.5 w-40 gap-px">
                  <span
                    className="rounded-full bg-status-live"
                    style={{ width: `${(record.wins / record.played) * 100}%` }}
                  />
                  <span className="flex-1 rounded-full bg-rule-soft" />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {coming.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Coming up
            </h2>
            {tournamentDate ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateLong(tournamentDate)}
              </p>
            ) : null}
            <div className="mt-3 grid gap-3">
              {coming.map((match, index) => (
                <MatchCard key={index} match={match} />
              ))}
            </div>
          </section>
        ) : null}

        {played.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Played
            </h2>
            <div className="mt-3 grid gap-3">
              {played.map((match, index) => (
                <MatchCard key={index} match={match} />
              ))}
            </div>
          </section>
        ) : null}

        {player.matches.length === 0 ? (
          <p className="mt-6 text-muted-foreground">
            No matches to show yet. Draws and schedules appear here when the
            organizer publishes them.
          </p>
        ) : null}
      </main>
    </PlayShell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <MessagePage
        heading="This player page is not available"
        body="Check the link, or ask the organizer for the current one."
      />
    );
  }
  return (
    <MessagePage heading="Something went wrong" body="Please try again in a moment." />
  );
}
