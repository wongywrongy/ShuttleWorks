/**
 * `/e/{slug}` — the tournament page: hero band, phase-gated tab bar, one
 * server-rendered panel (SP-P6-2 §2).
 *
 * A poster URL, not a capability URL: the loader's one call is the public
 * projection and carries no credential (the structural guards in
 * `tests/enter.loader.test.ts` run over this file). There is no form on this
 * page — the entry flow lives at `/e/{slug}/enter` — so nothing is minted
 * and the document carries no secret.
 *
 * **Phase-gating is the pure functions', not this file's**: `visibleTabs`
 * decides which tabs exist (a tab renders only when its data does — rule 4:
 * no placeholders, no disabled tabs, no coming-soon under any state),
 * `activeTab` validates `?tab` (anything unknown or hidden renders
 * Overview), `chipState`/`ctaState` decide the hero. Tabs are links with
 * `aria-current`, deliberately not an ARIA tablist (Z6) — each switch is a
 * full, KB-scale document load.
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { EntrantsList } from '../components/EntrantsList';
import { EventRow } from '../components/EventRow';
import { FeeTable } from '../components/FeeTable';
import { HeroHeader } from '../components/HeroHeader';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { SectionCard } from '../components/SectionCard';
import { TabBar } from '../components/TabBar';
import { TimelineCard } from '../components/TimelineCard';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { formatDateLong } from '../lib/format';
import {
  activeTab,
  chipState,
  ctaState,
  timelineModel,
  visibleTabs,
  type Tab,
} from '../lib/phase';
import type { Route } from './+types/tournament';

export interface TournamentLoaderData {
  page: EntryPageDTO;
  tabs: Tab[];
  active: Tab;
  /** SSR render instant, ms — `now` is a parameter everywhere below. */
  nowMs: number;
}

/**
 * The uniform 404 — an unknown slug and a closed page answer identically.
 * Constructed fresh, never copied from upstream, so the two causes stay
 * byte-identical here as they already are in the backend
 * (`api/entries_public.py`).
 */
function notFound(): Response {
  return new Response('Not found', { status: 404 });
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

  let page: EntryPageDTO;
  try {
    page = await apiGet<EntryPageDTO>(`/e/api/page/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }

  const tabs = visibleTabs(page.events, page.entrants);
  const payload: TournamentLoaderData = {
    page,
    tabs,
    active: activeTab(new URL(request.url).searchParams.get('tab'), tabs),
    nowMs: Date.now(),
  };
  return payload;
}

/**
 * Per-route meta/OG tags, derived from the loader's one call — carried over
 * from the SP-P6-1 entry page verbatim, minus its `/signed-in` branch (that
 * variant now belongs to the enter route).
 *
 * **`data.page.viewer` is never read here, on purpose (I6)** — a `<meta>`
 * tag is more public than the page body. Only the director-authored content
 * fields are used, and the allowlist guard in `tests/tournament.meta.test.ts`
 * pins `data.page` as the only read. `data` is `undefined` when the loader
 * threw `notFound()`, so this inherits the uniform 404 structurally.
 */
export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) {
    return [{ title: 'Entry page not found' }];
  }

  const { tournament, org, venue, page } = data.page;
  const title = tournament.name ? `${tournament.name} · Enter now` : 'Enter now';
  const description = [tournament.date, venue?.name, page.introText]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const tags: ReturnType<Route.MetaFunction> = [{ title }];
  if (description) {
    tags.push({ name: 'description', content: description });
    tags.push({ property: 'og:description', content: description });
  }
  tags.push({ property: 'og:title', content: title });
  tags.push({ property: 'og:type', content: 'website' });
  if (org?.name) {
    tags.push({ property: 'og:site_name', content: org.name });
  }
  return tags;
};

function tabHref(slug: string, tab: Tab): string {
  const base = `/e/${encodeURIComponent(slug)}`;
  return tab === 'overview' ? base : `${base}?tab=${tab}`;
}

// ---- Overview --------------------------------------------------------------

function OverviewPanel({ page, now }: { page: EntryPageDTO; now: Date }) {
  const slug = page.page.slug;
  const moments = timelineModel(page.events, page.tournament.date, now);
  const feeTable = FeeTable({ feeSchedule: page.page.feeSchedule, events: page.events });
  // Collapsed only when long — short text renders open and plain (Z10). The
  // threshold is a display judgement made server-side, so it is testable.
  const regulations = page.page.regulationsText;
  const longRegulations = (regulations?.length ?? 0) > 400;

  return (
    <div className="grid gap-6">
      <h2 className="sr-only">Overview</h2>
      {page.page.introText ? (
        <p className="max-w-prose text-base text-foreground">{page.page.introText}</p>
      ) : null}

      <div className="grid items-start gap-6 md:grid-cols-2">
        {moments.length > 0 ? (
          <TimelineCard moments={moments} now={now} eventsHref={tabHref(slug, 'events')} />
        ) : null}

        {feeTable !== null || page.page.paymentInstructions ? (
          <div className="grid gap-6">
            {feeTable !== null ? <SectionCard title="Fees">{feeTable}</SectionCard> : null}
            {page.page.paymentInstructions ? (
              <SectionCard title="Payment">
                <p className="whitespace-pre-line">{page.page.paymentInstructions}</p>
              </SectionCard>
            ) : null}
          </div>
        ) : null}

        {regulations ? (
          <SectionCard title={`Regulations · v${page.page.regulationsVersion}`}>
            {longRegulations ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-accent">
                  Read the regulations
                </summary>
                <p className="mt-2 whitespace-pre-line">{regulations}</p>
              </details>
            ) : (
              <p className="whitespace-pre-line">{regulations}</p>
            )}
          </SectionCard>
        ) : null}

        {page.venue?.name || page.venue?.address ? (
          <SectionCard title="Venue">
            {page.venue.name ? <p className="font-medium">{page.venue.name}</p> : null}
            {page.venue.address ? (
              <p className="text-muted-foreground">{page.venue.address}</p>
            ) : null}
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

// ---- The page ---------------------------------------------------------------

export default function Tournament({ loaderData }: Route.ComponentProps) {
  const { page, tabs, active, nowMs } = loaderData;
  const now = new Date(nowMs);
  const slug = page.page.slug;
  const chip = chipState(page.events, now);
  const cta = ctaState(page.events, slug);
  const metaLine = [
    formatDateLong(page.tournament.date),
    [page.venue?.name, page.venue?.address].filter(Boolean).join(', '),
  ]
    .filter((part) => part !== '')
    .join(' · ');
  const entrantsHref = tabs.includes('entrants')
    ? (code: string) => `${tabHref(slug, 'entrants')}#event-${code}`
    : null;

  return (
    <PlayShell>
      <HeroHeader
        orgName={page.org?.name ?? null}
        title={page.tournament.name ?? slug}
        metaLine={metaLine}
        chip={chip}
        cta={cta}
      >
        <TabBar tabs={tabs} active={active} hrefFor={(tab) => tabHref(slug, tab)} />
      </HeroHeader>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        {active === 'overview' ? <OverviewPanel page={page} now={now} /> : null}
        {active === 'events' ? (
          <div className="grid gap-4">
            <h2 className="sr-only">Events</h2>
            <ul className="divide-y divide-rule-soft rounded-lg border border-rule-soft bg-surface-raised shadow-sm">
              {page.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  entrantsHref={entrantsHref === null ? null : entrantsHref(event.code)}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {active === 'entrants' ? (
          <>
            <h2 className="sr-only">Entrants</h2>
            <EntrantsList events={page.events} entrants={page.entrants} />
          </>
        ) : null}
      </main>
    </PlayShell>
  );
}

/** Reads the status and nothing else, so no upstream prose or topology can
 * reach a public page. The 404 copy is the SP-P6-1 posture, carried over;
 * what changed in E1 is the page around it — this is the document a mistyped
 * poster URL lands on, so it wears the shell like everything else. Both
 * branches hand `MessagePage` fixed copy, so the uniform 404 is unaffected. */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <MessagePage
        heading="This entry page is not available"
        body="Check the link, or ask the organiser for the current one."
      />
    );
  }

  return (
    <MessagePage heading="Something went wrong" body="Please try again in a moment." />
  );
}
