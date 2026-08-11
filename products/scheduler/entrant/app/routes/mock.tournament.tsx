/**
 * SP-P6-2 Phase B — the TOURNAMENT PAGE mockup (`/e/mock.tournament`).
 *
 * **Mockup route. Deleted at Phase C.** Renders the frozen fixture through
 * the real page system: hero band with the phase-dependent CTA (Z8), the
 * link-based tab bar with `aria-current` (Z6 — deliberately not an ARIA
 * tablist: these are navigations), exactly one server-rendered panel chosen
 * by `activeTab`, the timeline with the current position marked (Z9), and
 * `<details>` regulations (Z10). No placeholders anywhere: tabs exist only
 * because their data does (`visibleTabs`), and a closed tournament's CTA is
 * status text, never a disabled button.
 *
 * The Entrants panel is the G5a shape (grouped by event) — mocked, since the
 * live projection lost the event dimension in the 2026-08-10 dedup. If G5a
 * is declined, this panel falls back to the flat name list + per-event counts.
 */
import { Fragment } from 'react';

import { formatCents } from '../lib/money';
import {
  activeTab,
  chipState,
  ctaState,
  parseMoment,
  timelineModel,
  visibleTabs,
  type Tab,
  type TimelineMoment,
} from '../lib/phase';
import { MOCK_NOW, MOCK_TOURNAMENT, type MockEvent } from './mock.data';
import { formatDateLong, formatMoment, PlayShell, SectionCard, StatusChip } from './mock.ui';
import { Button } from '@scheduler/design-system/components';
import type { Route } from './+types/mock.tournament';

const SELF = '/e/mock.tournament';
const ENTER_HREF = '/e/mock.enter';

export function loader({ request }: { request: Request }) {
  const tabs = visibleTabs(MOCK_TOURNAMENT.events, MOCK_TOURNAMENT.entrants);
  const active = activeTab(new URL(request.url).searchParams.get('tab'), tabs);
  return { tabs, active };
}

export const meta: Route.MetaFunction = () => [
  { title: `${MOCK_TOURNAMENT.name} — ShuttleWorks` },
  { name: 'robots', content: 'noindex' },
];

const TAB_LABELS: Readonly<Record<Tab, string>> = Object.freeze({
  overview: 'Overview',
  events: 'Events',
  entrants: 'Entrants',
});

function tabHref(tab: Tab): string {
  return tab === 'overview' ? SELF : `${SELF}?tab=${tab}`;
}

function genderLabel(constraint: string | null): string {
  if (constraint === null) return 'Open to all';
  const folded = constraint.toLowerCase();
  if (folded === 'm') return 'Men';
  if (folded === 'f') return 'Women';
  return constraint;
}

// ---- Overview -------------------------------------------------------------

function Timeline({ moments }: { moments: readonly TimelineMoment[] }) {
  const currentAt = moments.findIndex((m) => m.state === 'current');
  const firstFuture = moments.findIndex((m) => m.state === 'future');
  // Where the standalone "you are here" row goes when no moment straddles
  // now: before the first future moment, or at the very end if all are past.
  const insertAt = currentAt !== -1 ? -1 : firstFuture !== -1 ? firstFuture : moments.length;

  const marker = (
    <li className="relative text-sm font-medium text-accent" aria-current="date">
      <span
        aria-hidden
        className="absolute -start-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-accent"
      />
      You are here — {formatMoment(MOCK_NOW)}
    </li>
  );

  return (
    <ol className="relative ms-1.5 grid gap-4 border-s border-rule-control ps-5">
      {moments.map((moment, index) => (
        <Fragment key={moment.label}>
          {index === insertAt ? marker : null}
          <li className="relative">
            <span
              aria-hidden
              className={`absolute -start-[1.42rem] top-1.5 h-2 w-2 rounded-full ${
                moment.state === 'past'
                  ? 'bg-rule-strong'
                  : 'border border-rule-strong bg-surface-raised'
              }`}
            />
            <p className="text-sm font-medium text-foreground">
              {moment.label}
              {moment.state === 'current' ? (
                <span className="ml-2 font-medium text-accent">← you are here</span>
              ) : null}
            </p>
            <p className="text-sm text-muted-foreground">
              {moment.variance === 'per-event' ? (
                <>
                  Varies by event — see{' '}
                  <a
                    href={tabHref('events')}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    Events
                  </a>
                </>
              ) : moment.label === 'Tournament' ? (
                formatDateLong(moment.at)
              ) : (
                formatMoment(moment.at!)
              )}
            </p>
          </li>
        </Fragment>
      ))}
      {insertAt === moments.length ? marker : null}
    </ol>
  );
}

function OverviewPanel() {
  const page = MOCK_TOURNAMENT;
  const now = parseMoment(MOCK_NOW)!;
  const moments = timelineModel(page.events, page.date, now);
  const tiers = Object.entries(page.feeSchedule).sort(([a], [b]) => Number(a) - Number(b));
  // Collapsed only when long — a short text renders open (Z10; the threshold
  // is a display judgement, server-side and testable at Phase C).
  const longRegulations = page.regulationsText.length > 400;

  return (
    <div className="grid gap-6">
      <h2 className="sr-only">Overview</h2>
      <p className="max-w-prose text-base text-foreground">{page.introText}</p>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <SectionCard title="Key dates">
          <Timeline moments={moments} />
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard title="Fees">
            <table className="w-full text-sm">
              <tbody>
                {tiers.map(([count, cents]) => (
                  <tr key={count} className="border-b border-rule-soft last:border-b-0">
                    <td className="py-1.5 text-foreground">
                      {count} {count === '1' ? 'event' : 'events'}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-foreground">
                      {formatCents(cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground">
              Per player. Your exact total is quoted on the entry form before you
              submit.
            </p>
          </SectionCard>

          <SectionCard title="Payment">
            <p className="whitespace-pre-line">{page.paymentInstructions}</p>
          </SectionCard>
        </div>

        <SectionCard title={`Regulations · v${page.regulationsVersion}`}>
          {longRegulations ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-accent">
                Read the regulations
              </summary>
              <p className="mt-2 whitespace-pre-line">{page.regulationsText}</p>
            </details>
          ) : (
            <p className="whitespace-pre-line">{page.regulationsText}</p>
          )}
        </SectionCard>

        <SectionCard title="Venue">
          <p className="font-medium">{page.venueName}</p>
          <p className="text-muted-foreground">{page.venueAddress}</p>
        </SectionCard>
      </div>
    </div>
  );
}

// ---- Events ---------------------------------------------------------------

function EventRow({ event }: { event: MockEvent }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-medium text-foreground">
          {event.discipline} <span className="font-normal text-muted-foreground">· {event.code}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {genderLabel(event.genderConstraint)}
          {event.ageBracketed ? ' · Age-restricted' : ''}
        </p>
      </div>
      <p className="text-sm tabular-nums text-muted-foreground">
        {event.entryCount}
        {event.cap === null ? '' : ` of ${event.cap}`} entered
      </p>
      <p
        className={`text-sm font-medium ${
          event.isOpen ? 'text-status-live' : 'text-status-done'
        }`}
      >
        {event.isOpen ? 'Open' : 'Closed'}
      </p>
      <a
        href={`${SELF}?tab=entrants#event-${event.code}`}
        className="text-sm text-accent underline-offset-4 hover:underline"
      >
        See entrants
      </a>
    </li>
  );
}

function EventsPanel() {
  return (
    <div className="grid gap-4">
      <h2 className="sr-only">Events</h2>
      <ul className="divide-y divide-rule-soft rounded-lg border border-rule-soft bg-surface-raised shadow-sm">
        {MOCK_TOURNAMENT.events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </ul>
    </div>
  );
}

// ---- Entrants -------------------------------------------------------------

function EntrantsPanel() {
  const page = MOCK_TOURNAMENT;
  return (
    <div className="grid gap-6">
      <h2 className="sr-only">Entrants</h2>
      {page.events.map((event) => {
        const rows = page.entrants.filter((row) => row.eventCode === event.code);
        if (rows.length === 0) return null;
        return (
          <section
            key={event.code}
            id={`event-${event.code}`}
            className="rounded-lg border border-rule-soft bg-surface-raised p-5 shadow-sm"
          >
            <h3 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-foreground">
              {event.discipline}
              <span className="text-sm font-normal text-muted-foreground">
                {event.code} · {rows.length} entered
              </span>
            </h3>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm text-foreground sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row, i) => (
                <li key={`${row.name}-${i}`}>{row.name}</li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ---- The page -------------------------------------------------------------

export default function MockTournament({ loaderData }: Route.ComponentProps) {
  const { tabs, active } = loaderData;
  const page = MOCK_TOURNAMENT;
  const now = parseMoment(MOCK_NOW)!;
  const chip = chipState(page.events, now);
  const cta = ctaState(page.events, page.slug);

  return (
    <PlayShell>
      <section className="border-b border-rule-soft bg-surface-raised">
        <div className="mx-auto w-full max-w-6xl px-4 pt-8 md:pt-10">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pb-6">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{page.orgName}</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground md:text-[1.75rem]">
                {page.name}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {formatDateLong(page.date)} · {page.venueName}, {page.venueAddress}
              </p>
              <div className="mt-3">
                <StatusChip state={chip} />
              </div>
            </div>
            {/* ONE phase-dependent CTA (Z8): a real link when entries are
                open; plain status text when closed — never a disabled
                control pretending to be actionable. */}
            {cta.kind === 'enter' ? (
              <Button asChild variant="brand" size="lg">
                <a href={ENTER_HREF}>Enter this tournament</a>
              </Button>
            ) : (
              <p className="text-sm font-medium text-muted-foreground">
                Entries closed
              </p>
            )}
          </div>
          {/* Z6: links, not widgets. The loader validated `?tab`, exactly one
              panel renders below, and the bar itself exists only when there
              is more than one tab to show. */}
          {tabs.length < 2 ? null : (
            <nav aria-label="Tournament sections" className="-mb-px">
              <ul className="flex gap-6 text-sm">
                {tabs.map((tab) => (
                  <li key={tab}>
                    <a
                      href={tabHref(tab)}
                      aria-current={tab === active ? 'page' : undefined}
                      className={`inline-block border-b-2 pb-2.5 pt-1 ${
                        tab === active
                          ? 'border-action-primary font-medium text-foreground'
                          : 'border-transparent text-muted-foreground hover:border-rule-control hover:text-foreground'
                      }`}
                    >
                      {TAB_LABELS[tab]}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        {active === 'overview' ? <OverviewPanel /> : null}
        {active === 'events' ? <EventsPanel /> : null}
        {active === 'entrants' ? <EntrantsPanel /> : null}
      </main>
    </PlayShell>
  );
}
