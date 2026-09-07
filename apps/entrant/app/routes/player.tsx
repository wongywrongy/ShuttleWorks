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
 *
 * Profile v1 (public-visual-fixes P2) = **identity + tournament history**.
 * The history section is a list of the SAME human's other public
 * tournaments, joined server-side on the verified entrant account that owns
 * the row (`_person_history`) — this file never matches people by name and
 * never mints a person key. Each row's link is built by `personHref`, the
 * one shared link-target resolver the whole tier routes people through, so
 * a cross-tournament profile URL and an in-page name link are the same
 * decision made once. The current tournament stays in the list, marked
 * `aria-current`, so a person with no linked history still reads as a
 * history of one rather than an empty section.
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { MatchCard } from '../components/MatchCard';
import { PersonRef } from '../components/PersonRef';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { TournamentFrame } from '../components/TournamentFrame';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { eventCodeLabel } from '../lib/draws.types';
import { formatDateLong } from '../lib/format';
import type { PlayerPageDTO } from '../lib/player.types';
import { SECTION_TITLE } from '../lib/ui';
import { sectionHref, sectionLabel } from '../lib/tournamentFrame';
import { personHref, personRefModel } from '../../public/assets/person-ref.js';
import type { Route } from './+types/player';

export interface PlayerLoaderData {
  slug: string;
  tournamentName: string | null;
  tournamentDate: string | null;
  /** The full public projection: a tournament-scoped player page wears the
   * SAME frame as every other tournament route (contract §11.1), and the
   * frame is a pure function of this. */
  page: EntryPageDTO;
  player: PlayerPageDTO;
  /** SSR render instant, ms. */
  nowMs: number;
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
      page,
      player,
      nowMs: Date.now(),
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
  const { slug, tournamentDate, page, player, nowMs } = loaderData;
  const coming = player.matches.filter((match) => !match.decided);
  const played = player.matches.filter((match) => match.decided);
  const liveMatch = player.matches.find((match) => match.status === 'live');
  const playerName = personRefModel({
    slug,
    identity: player.person.identity,
    state: player.person.resolution,
    label: player.person.label ?? 'Player',
  }).text;
  // Absent on a payload minted before profile v1 — an older API answers a
  // page with no history section rather than an empty one.
  const history = player.history ?? [];

  return (
    <PlayShell>
      {/* Contract §11: the tournament-scoped player page is a tournament
          route, so it keeps the tournament hero, the tab bar with Players
          current, and a breadcrumb back through Players. The floating
          "← Tournament page" link it used to lead with is gone. */}
      <TournamentFrame
        page={page}
        nowMs={nowMs}
        active="players"
        trail={[
          { label: sectionLabel('players'), href: sectionHref(slug, 'players') },
          { label: playerName, href: null },
        ]}
      />
      <section className="border-b border-rule-soft bg-surface-raised">
        <div className="mx-auto w-full max-w-3xl px-4 py-5">
          <h2 className={SECTION_TITLE}>
            <PersonRef
              slug={slug}
              identity={player.person.identity}
              state={player.person.resolution}
              label={player.person.label}
              current
            />
          </h2>
          {player.club ? <p className="mt-1 text-sm text-muted-foreground">{player.club}</p> : null}
          {liveMatch ? (
            <div className="mt-4 border-s-2 border-s-status-live ps-4">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">On court now</p>
              <p className="mt-1 text-sm text-foreground">
                {[eventCodeLabel(liveMatch.eventCode), liveMatch.roundLabel, liveMatch.courtLabel ?? (liveMatch.court !== null ? `Court ${liveMatch.court}` : null)].filter(Boolean).join(' · ')}
              </p>
            </div>
          ) : null}
          {player.events.length > 0 ? (
            <ul className="mt-4 divide-y divide-rule-soft border-t border-rule-soft text-sm text-foreground">
              {player.events.map((event) => (
                <li key={`${event.code}-${event.discipline}`} className="flex flex-wrap items-baseline justify-between gap-4 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium">{eventCodeLabel(event.code)}</span>
                    <span className="text-muted-foreground">{` · ${event.discipline}`}</span>
                    {event.seed !== null && event.seed !== undefined ? <span className="text-muted-foreground"> {`[${event.seed}]`}</span> : null}
                    {event.partner ? <><span className="text-muted-foreground">{' with '}</span><PersonRef slug={slug} identity={event.partner.identity} state={event.partner.resolution === 'dead' ? 'dead' : 'resolved'} label={event.partner.label} /></> : null}
                  </span>
                  {event.drawPath.length ? (
                    <span className="basis-full text-xs text-muted-foreground">
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
        </div>
      </section>

      <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-2">
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

        {history.length > 0 ? (
          <section className="mt-8 border-t border-rule-soft pt-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Tournament history
            </h2>
            <ul className="mt-3 divide-y divide-rule-soft border-t border-rule-soft text-sm">
              {history.map((row) => {
                const href = personHref(row.slug, { id: row.playerKey, name: playerName });
                return (
                  <li key={`${row.slug}-${row.playerKey}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                    <span className="min-w-0">
                      {/* The current tournament is the page the reader is
                          already on: it is named, marked, and deliberately
                          not a link back to itself (the same rule the
                          breadcrumb trail's last segment follows). */}
                      {row.current || href === null ? (
                        <span className="font-medium text-foreground" aria-current={row.current ? 'page' : undefined}>
                          {row.tournamentName ?? row.slug}
                        </span>
                      ) : (
                        <a href={href} className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          {row.tournamentName ?? row.slug}
                        </a>
                      )}
                      {row.date ? (
                        <span className="block text-xs text-muted-foreground">{formatDateLong(row.date)}</span>
                      ) : null}
                    </span>
                    {row.eventCodes.length > 0 ? (
                      <span className="text-xs text-muted-foreground" aria-label={row.eventCodes.map(eventCodeLabel).join(' · ')}>
                        {row.eventCodes.map(eventCodeLabel).join(' · ')}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {player.matches.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
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
