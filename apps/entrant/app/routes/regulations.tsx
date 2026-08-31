/**
 * `/e/{slug}/regulations` — the regulations reader (SP-P7 §3.7).
 *
 * A ROUTED page rather than a modal, deliberately: this tier's grammar is a
 * full document per click, the text is director-authored and can run to
 * many pages, and a routed reader is deep-linkable — "see regulation 4" in
 * a club chat can point here. The overview keeps only the document row.
 *
 * Same loader posture as `tournament.tsx`: one public projection call, no
 * credential, uniform 404 (unknown slug ≡ closed page ≡ a page whose
 * director wrote no regulations — a reader with nothing to read does not
 * exist, rather than existing emptily).
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { dateOfIso, formatDateLong } from '../lib/format';
import type { Route } from './+types/regulations';

export interface RegulationsLoaderData {
  slug: string;
  tournamentName: string | null;
  organizerName: string | null;
  venueName: string | null;
  venueAddress: string | null;
  tournamentDate: string | null;
  text: string;
  version: number;
  updatedAt: string | null;
}

export interface RegulationSection {
  id: string;
  title: string;
  body: string;
}

function sectionId(title: string, used: Set<string>): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

function headingLine(line: string): string | null {
  const value = line.trim().replace(/^#{1,3}\s+/, '');
  if (!value || value.length > 120) return null;
  if (/^(?:section\s+)?\d+(?:\.\d+)*[.)]?\s+\S/i.test(value)) return value;
  if (/^[A-Z][A-Z0-9 &'()/.,:-]{3,}$/.test(value) && /[A-Z]/.test(value)) {
    return value;
  }
  return null;
}

/**
 * Turns director-authored plain text into a small semantic outline. Numbered
 * and all-caps lines are treated as headings; unstructured text remains one
 * readable document instead of being guessed into a misleading outline.
 */
export function parseRegulationSections(text: string): RegulationSection[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sections: RegulationSection[] = [];
  const used = new Set<string>();
  let currentTitle: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    const body = currentBody.join('\n').trim();
    if (currentTitle !== null) {
      sections.push({ id: sectionId(currentTitle, used), title: currentTitle, body });
    } else if (body) {
      sections.push({ id: sectionId('Full regulations', used), title: 'Full regulations', body });
    }
    currentTitle = null;
    currentBody = [];
  };

  for (const line of lines) {
    const heading = headingLine(line);
    if (heading !== null) {
      flush();
      currentTitle = heading;
    } else {
      currentBody.push(line);
    }
  }
  flush();
  return sections.length > 0
    ? sections
    : [{ id: 'regulations', title: 'Full regulations', body: text.trim() }];
}

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export async function loader({ params }: { params: { slug?: string } }) {
  const slug = params.slug;
  if (!slug) throw notFound();

  let page: EntryPageDTO;
  try {
    page = await apiGet<EntryPageDTO>(`/e/api/page/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }
  if (!page.page.regulationsText) throw notFound();

  const payload: RegulationsLoaderData = {
    slug: page.page.slug,
    tournamentName: page.tournament.name,
    organizerName: page.org?.name ?? null,
    venueName: page.venue?.name ?? null,
    venueAddress: page.venue?.address ?? null,
    tournamentDate: page.tournament.date ?? null,
    text: page.page.regulationsText,
    version: page.page.regulationsVersion,
    updatedAt: page.page.regulationsUpdatedAt,
  };
  return payload;
}

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) return [{ title: 'Regulations not found' }];
  return [
    {
      title: data.tournamentName
        ? `Regulations · ${data.tournamentName}`
        : 'Tournament regulations',
    },
  ];
};

export default function Regulations({ loaderData }: Route.ComponentProps) {
  const {
    slug,
    tournamentName,
    organizerName,
    venueName,
    venueAddress,
    tournamentDate,
    text,
    version,
    updatedAt,
  } = loaderData;
  const sections = parseRegulationSections(text);
  const updatedDate = dateOfIso(updatedAt);
  const title = tournamentName ? `${tournamentName} regulations` : 'Tournament regulations';
  return (
    <PlayShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={`/e/${encodeURIComponent(slug)}`}
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            ← {tournamentName ?? 'Tournament page'}
          </a>
          <div id="regulations-actions" hidden className="flex flex-wrap gap-2" data-document-title={title}>
            <button
              type="button"
              data-regulations-print
              className="inline-flex min-h-10 items-center rounded-md border border-rule-soft bg-surface-raised px-3 py-2 text-sm font-semibold text-foreground hover:border-action-primary"
            >
              Print
            </button>
            <button
              type="button"
              data-regulations-download
              className="inline-flex min-h-10 items-center rounded-md border border-rule-soft bg-surface-raised px-3 py-2 text-sm font-semibold text-foreground hover:border-action-primary"
            >
              Download text
            </button>
          </div>
        </div>

        <header className="mt-6 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Organizer-published document
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
            Tournament regulations
          </h1>
          {tournamentName ? <p className="mt-1 text-base text-foreground">{tournamentName}</p> : null}
          <p className="mt-2 text-sm text-muted-foreground">
            {`Version ${version}`}
            {updatedDate ? ` · updated ${formatDateLong(updatedDate)}` : ''}
          </p>
          <dl className="mt-5 grid gap-3 border-y border-rule-soft py-4 text-sm sm:grid-cols-3">
            {tournamentDate ? (
              <div>
                <dt className="text-xs text-muted-foreground">Tournament date</dt>
                <dd className="mt-1 font-medium text-foreground">{tournamentDate}</dd>
              </div>
            ) : null}
            {venueName || venueAddress ? (
              <div>
                <dt className="text-xs text-muted-foreground">Venue</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {venueName}
                  {venueAddress ? <span className="block font-normal text-muted-foreground">{venueAddress}</span> : null}
                </dd>
              </div>
            ) : null}
            {organizerName ? (
              <div>
                <dt className="text-xs text-muted-foreground">Organizer</dt>
                <dd className="mt-1 font-medium text-foreground">{organizerName}</dd>
              </div>
            ) : null}
          </dl>
        </header>

        <div className="mt-8 grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)] md:items-start">
          <aside className="md:sticky md:top-4" aria-label="Document navigation">
            <nav className="rounded-lg border border-rule-soft bg-surface-raised p-4">
              <h2 className="font-display text-sm font-bold tracking-tight text-foreground">On this page</h2>
              <ol className="mt-3 grid gap-2 text-sm">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="text-accent underline-offset-4 hover:underline">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="mt-4 grid gap-2 text-sm">
              <a href={`/e/${encodeURIComponent(slug)}`} className="text-accent underline-offset-4 hover:underline">Tournament overview</a>
              <a href={`/e/${encodeURIComponent(slug)}?tab=events`} className="text-accent underline-offset-4 hover:underline">View events</a>
              <a href={`/e/${encodeURIComponent(slug)}?tab=players`} className="text-accent underline-offset-4 hover:underline">View entrants</a>
            </div>
          </aside>

          <article id="regulations-document" className="min-w-0 max-w-3xl" aria-labelledby="regulations-heading">
            <h2 id="regulations-heading" className="sr-only">Regulations document</h2>
            <div className="grid gap-7">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-6">
                  <h3 className="font-display text-xl font-bold tracking-tight text-foreground">{section.title}</h3>
                  {section.body ? (
                    <p className="mt-3 whitespace-pre-line text-base leading-8 text-foreground">{section.body}</p>
                  ) : null}
                </section>
              ))}
            </div>
            <p className="mt-10 border-t border-rule-soft pt-4 text-sm text-muted-foreground">
              Source: this document is published by the tournament organizer through ShuttleWorks.
              {organizerName ? ` Organizer: ${organizerName}.` : ''}
              {' Contact details are not published on this page.'}
            </p>
          </article>
        </div>
        <noscript>
          <p className="mt-6 text-sm text-muted-foreground">Use your browser&rsquo;s print command to print or save this document. The regulations remain readable without JavaScript.</p>
        </noscript>
        <script type="module" src="/e/assets/regulations.js" />
      </main>
    </PlayShell>
  );
}

/** Same posture as the tournament page's boundary: fixed copy, both ways. */
export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <MessagePage
        heading="These regulations are not available"
        body="Check the link, or ask the organizer for the current one."
      />
    );
  }
  return (
    <MessagePage heading="Something went wrong" body="Please try again in a moment." />
  );
}
