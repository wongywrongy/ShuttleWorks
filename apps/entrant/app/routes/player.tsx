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
 * do not flip it** (§3.3, binding). Match-card scores and winner marks arrive
 * pre-gated by the published tournament projection.
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { MatchCard } from '../components/MatchCard';
import { PersonRef } from '../components/PersonRef';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { eventCodeLabel } from '../lib/draws.types';
import { formatDateLong } from '../lib/format';
import type { PlayerPageDTO } from '../lib/player.types';
import { personRefModel } from '../../public/assets/person-ref.js';
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
  const playerName = personRefModel({
    slug: data.slug,
    identity: data.player.person.identity,
    state: data.player.person.resolution,
    label: data.player.person.label ?? 'Player',
  }).text;
  return [
    {
      title: data.tournamentName
        ? `${playerName} · ${data.tournamentName}`
        : playerName,
    },
  ];
};

export default function Player({ loaderData }: Route.ComponentProps) {
  const { slug, tournamentName, tournamentDate, player } = loaderData;
  const coming = player.matches.filter((match) => !match.decided);
  const played = player.matches.filter((match) => match.decided);
  const liveMatch = player.matches.find((match) => match.status === 'live');

  return (
    <PlayShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
        <a
          href={`/e/${encodeURIComponent(slug)}`}
          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          ← {tournamentName ?? 'Tournament page'}
        </a>

        <section className="mt-4 border-b border-rule-soft pb-6">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              <PersonRef
                slug={slug}
                identity={player.person.identity}
                state={player.person.resolution}
                label={player.person.label}
                current
              />
            </h1>
            {player.club ? <p className="mt-1 text-sm text-muted-foreground">{player.club}</p> : null}
          </div>
          {liveMatch ? (
            <div className="mt-4 border-s-2 border-s-status-live ps-4">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">On court now</p>
              <p className="mt-1 text-sm text-foreground">
                {[eventCodeLabel(liveMatch.eventCode), liveMatch.roundLabel, liveMatch.courtLabel ?? (liveMatch.court !== null ? `Court ${liveMatch.court}` : null)].filter(Boolean).join(' · ')}
              </p>
            </div>
          ) : null}
          {player.events.length > 0 ? (
            <ul className="mt-4 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              {player.events.map((event) => (
                <li key={`${event.code}-${event.discipline}`}>
                  <span className="font-medium text-foreground">{eventCodeLabel(event.code)}</span>{` · ${event.discipline}`}
                  {event.seed !== null && event.seed !== undefined ? <span className="text-muted-foreground"> {`[${event.seed}]`}</span> : null}
                  {event.partner ? <><span>{' with '}</span><PersonRef slug={slug} identity={event.partner.identity} state={event.partner.resolution === 'dead' ? 'dead' : 'resolved'} label={event.partner.label} /></> : null}
                  {event.drawPath.length ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {event.drawPath.map((step, stepIndex) => (
                        <span key={`${step.roundLabel}-${stepIndex}`}>
                          {stepIndex > 0 ? <span className="mx-1" aria-hidden>→</span> : null}
                          <span className="me-1">{step.roundLabel}</span>
                          {step.opponents.map((opponent, opponentIndex) => (
                            <span key={`${opponent.identity?.id ?? opponent.label ?? opponentIndex}`}>
                              {opponentIndex > 0 ? <span className="mx-1" aria-hidden>/</span> : null}
                              <PersonRef slug={slug} identity={opponent.identity} state={opponent.resolution} label={opponent.label} />
                            </span>
                          ))}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
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
                <MatchCard key={index} match={match} slug={slug} />
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
                <MatchCard key={index} match={match} slug={slug} />
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
