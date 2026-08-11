/**
 * SP-P6-2 Phase B — the ENTRY FLOW mockup (`/e/mock.enter`).
 *
 * **Mockup route. Deleted at Phase C.** The brief's §3 layout: a sectioned
 * single page off the hub scroll — Player(s) → events per player →
 * acknowledgment — with the sticky total bar (Z14: bottom bar on phones, a
 * sticky side rail from `lg:` up) and "Add another player" as an explicit
 * action, not a permanently rendered blank card.
 *
 * The add-player mechanism here is the real Z12 round trip: the button
 * submits the form to this route's own action, which re-parses the posted
 * body through the SAME `parseEcho` the real page uses and re-renders one
 * more block with the typing preserved. No endpoint is touched — the form
 * posts to itself. What does NOT run in a mockup: the quote 307 and the
 * submit 303 (their buttons post to the same inert action), and the CSRF /
 * idempotency mints, which carry over from `entry.tsx` verbatim at Phase C.
 *
 * The total is the fixture's — a literal standing in for the server's quote
 * (R14). Nothing here computes money; pressing "Update total" in the mockup
 * honestly drops to the unquoted state, because only the server may answer.
 */
import { Button, Notice, TextField } from '@scheduler/design-system/components';

import { narrowEvents, parseEcho, type PlayerEcho } from '../lib/echo';
import { formatCents } from '../lib/money';
import { chipState, parseMoment, totalBarState, visibleBlocks, type TotalBarState } from '../lib/phase';
import { MOCK_ENTER_ECHO, MOCK_NOW, MOCK_TOURNAMENT } from './mock.data';
import { PlayShell, StatusChip } from './mock.ui';
import type { Route } from './+types/mock.enter';

const TOURNAMENT_HREF = '/e/mock.tournament';

export const meta: Route.MetaFunction = () => [
  { title: `Enter — ${MOCK_TOURNAMENT.name} — ShuttleWorks` },
  { name: 'robots', content: 'noindex' },
];

/** The Z12 landing: re-render the posted typing plus one more block. Reads
 * the body and nothing else; no upstream call, no credential (R8-D). */
export async function action({ request }: { request: Request }) {
  const posted = new URLSearchParams(await request.text());
  return { echo: parseEcho(posted), addPlayer: posted.get('addPlayer') === '1' };
}

const NO_ECHO: PlayerEcho = Object.freeze({
  name: '',
  gender: '',
  club: '',
  birthYear: '',
  remarks: '',
  events: [],
});

const GENDERS = Object.freeze([
  ['', '—'],
  ['F', 'Female'],
  ['M', 'Male'],
] as const);

function PlayerBlock({ index, said, showAll }: { index: number; said: PlayerEcho; showAll: boolean }) {
  const openEvents = MOCK_TOURNAMENT.events.filter((event) => event.isOpen);
  const offered = narrowEvents(openEvents, said.gender, said.events, showAll);
  const ticked = new Set(said.events);
  const prefix = `p${index}`;

  return (
    <section className="grid gap-4 rounded-lg border border-rule-soft bg-surface-raised p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">
        Player {index + 1}
        {index === 0 ? null : (
          <span className="ml-2 text-sm font-normal text-muted-foreground">optional</span>
        )}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${prefix}name`}
          label="Full name"
          name="playerName"
          maxLength={200}
          required={index === 0}
          autoComplete="name"
          defaultValue={said.name}
        />
        <div>
          <label
            htmlFor={`${prefix}gender`}
            className="mb-1 block text-xs font-medium text-foreground"
          >
            Gender
          </label>
          <select
            id={`${prefix}gender`}
            name="gender"
            required={index === 0}
            defaultValue={said.gender}
            className="h-9 w-full rounded-sm border border-rule-control bg-bg-elev px-3 text-sm text-foreground"
          >
            {GENDERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <TextField
          id={`${prefix}club`}
          label="Club (optional)"
          name="club"
          maxLength={200}
          autoComplete="organization"
          defaultValue={said.club}
        />
        <TextField
          id={`${prefix}year`}
          label="Birth year"
          name="birthYear"
          inputMode="numeric"
          maxLength={4}
          defaultValue={said.birthYear}
          hint="Needed for the age-restricted events (O40 singles)."
        />
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-foreground">Events</legend>
        {offered.map((event) => {
          const value = `${index}:${event.id}`;
          return (
            <label
              key={event.id}
              className="flex flex-wrap items-center gap-2 rounded px-1 py-0.5 text-sm text-foreground"
            >
              <input type="checkbox" name="events" value={value} defaultChecked={ticked.has(value)} />
              <span>
                {event.discipline} <span className="text-muted-foreground">({event.code})</span>
              </span>
              {event.feeCents === null ? null : (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatCents(event.feeCents)}
                </span>
              )}
            </label>
          );
        })}
        {offered.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No event is usually open to this player. Tick &ldquo;Show every event&rdquo;
            below, then update the total.
          </p>
        ) : null}
      </fieldset>

      <div>
        <label
          htmlFor={`${prefix}remarks`}
          className="mb-1 block text-xs font-medium text-foreground"
        >
          Anything the organiser should know (optional)
        </label>
        <textarea
          id={`${prefix}remarks`}
          name="remarks"
          rows={2}
          maxLength={2000}
          placeholder="e.g. can't play before 6pm Saturday"
          defaultValue={said.remarks}
          className="w-full rounded-sm border border-rule-control bg-bg-elev p-2 text-sm text-foreground"
        />
      </div>
    </section>
  );
}

function TotalBar({ state }: { state: TotalBarState }) {
  return (
    <section
      aria-label="Total and submit"
      className="sticky bottom-0 grid gap-3 rounded-t-lg border border-rule-soft bg-surface-raised p-4 shadow-lg lg:bottom-auto lg:top-6 lg:rounded-lg lg:shadow-sm"
    >
      {state.kind === 'quoted' ? (
        <div className="flex items-baseline justify-between gap-4 lg:block">
          <p className="text-sm text-muted-foreground">
            Quoted total ·{' '}
            <span className="tabular-nums">
              {state.eventCount} {state.eventCount === 1 ? 'event' : 'events'}
            </span>
          </p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {formatCents(state.totalCents)}
          </p>
        </div>
      ) : state.kind === 'refused' ? (
        <Notice tone="warning">{state.copy}</Notice>
      ) : (
        <p className="text-sm text-muted-foreground">
          Prices are per event; bundles are cheaper. Press &ldquo;Update total&rdquo; to
          see what this selection comes to.
        </p>
      )}
      <div className="grid gap-2">
        <Button type="submit" name="action" value="filter" variant="outline" formNoValidate>
          Update total
        </Button>
        <Button type="submit" variant="brand">
          Submit entry
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The total is the organiser&rsquo;s quote and is confirmed on your receipt.
      </p>
    </section>
  );
}

export default function MockEnter({ actionData }: Route.ComponentProps) {
  const page = MOCK_TOURNAMENT;
  const echo = actionData?.echo ?? MOCK_ENTER_ECHO;
  const blocks = visibleBlocks(echo, actionData?.addPlayer ?? false);
  const bar = totalBarState(echo);
  const chip = chipState(page.events, parseMoment(MOCK_NOW)!);
  const tiers = Object.entries(page.feeSchedule).sort(([a], [b]) => Number(a) - Number(b));

  return (
    <PlayShell>
      <section className="border-b border-rule-soft bg-surface-raised">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 md:py-8">
          <p className="text-sm">
            <a href={TOURNAMENT_HREF} className="text-accent underline-offset-4 hover:underline">
              ← {page.name}
            </a>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Enter this tournament
            </h1>
            <StatusChip state={chip} />
          </div>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Up to {page.maxEventsPerPerson} events per person. Bundle pricing per player:{' '}
            {tiers
              .map(([count, cents]) => `${count} ${count === '1' ? 'event' : 'events'} — ${formatCents(cents)}`)
              .join('; ')}
            .
          </p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-4xl px-4 py-6 md:py-8">
        {/* Z15 — the shipped R8-E posture, restated: this page cannot know who
            is reading it, so it says what the write will require instead of
            guessing. The links are the sign-in handoff with a `next` return. */}
        <Notice tone="info">
          Submitting needs an entrant account.{' '}
          <a href="/e/login" className="underline underline-offset-4">
            Sign in
          </a>{' '}
          or{' '}
          <a href="/e/signup" className="underline underline-offset-4">
            create one
          </a>{' '}
          — you&rsquo;ll come straight back here. Until you are signed in, nothing is
          recorded.
        </Notice>

        <form method="post" className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-8">
          <div className="grid gap-5">
            {Array.from({ length: blocks }, (_, index) => (
              <PlayerBlock
                key={index}
                index={index}
                said={echo.players[index] ?? NO_ECHO}
                showAll={echo.showAllEvents}
              />
            ))}

            {/* Z12: an explicit action. A round trip, not a permanently
                rendered blank card — the parser drops untouched blocks. */}
            <Button
              type="submit"
              name="addPlayer"
              value="1"
              variant="outline"
              formNoValidate
              className="justify-self-start"
            >
              Add another player
            </Button>

            <label className="flex items-start gap-2 text-sm text-foreground">
              <input type="checkbox" name="showAllEvents" value="on" defaultChecked={echo.showAllEvents} />
              <span>
                Show every event, including ones not usually open to a player. A mismatch
                is accepted &mdash; the organiser sees a flag and decides.
              </span>
            </label>

            <section className="grid gap-3 rounded-lg border border-rule-soft bg-surface-raised p-5 shadow-sm">
              <h2 className="text-base font-semibold text-foreground">Before you submit</h2>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" name="acknowledged" value="on" required />
                <span>
                  I have read and accept the regulations, and I understand each
                  player&rsquo;s name will appear on this page&rsquo;s public entrant
                  list.
                </span>
              </label>
            </section>
          </div>

          <TotalBar state={bar} />
        </form>
      </main>
    </PlayShell>
  );
}
