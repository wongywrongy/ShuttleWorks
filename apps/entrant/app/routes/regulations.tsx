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
import type { ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { TournamentFrame } from '../components/TournamentFrame';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { dateOfIso, formatDateLong } from '../lib/format';
import { SECTION_TITLE } from '../lib/ui';
import type { Route } from './+types/regulations';

export interface RegulationsLoaderData {
  slug: string;
  tournamentName: string | null;
  /** The public projection the shared frame is built from (contract §11.1).
   * The venue/organizer/date facts this route used to restate in its own
   * header dl are the hero's now, so they arrive here as part of one payload
   * rather than as four hand-copied fields. */
  page: EntryPageDTO;
  text: string;
  version: number;
  updatedAt: string | null;
  /** SSR render instant, ms. */
  nowMs: number;
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
 * V3-PE15.2: a director's regulations sometimes end a line with a bare
 * "Source: <url>." or "Source reference: <url>." citation (the historical
 * demo data does this, quoting an upstream results page). Rendered as plain
 * text that reads as an unclickable technical address in the middle of
 * prose. This turns *only* the trailing URL into a link with a readable
 * label derived from the URL itself — the organizer's words are otherwise
 * untouched (R1: content is not rewritten, only its presentation as a link).
 */
const SOURCE_URL_RE = /(Source(?: reference)?:\s*)(https?:\/\/\S+?)(\.?)(\s*)$/;

function urlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    if (!last) return parsed.hostname;
    return decodeURIComponent(last).replace(/_/g, ' ');
  } catch {
    return url;
  }
}

function renderBody(body: string): ReactNode {
  const match = SOURCE_URL_RE.exec(body);
  if (!match) return body;
  const [, prefix, url, trailingDot] = match;
  const before = body.slice(0, match.index);
  return (
    <>
      {before}
      {prefix}
      <a href={url} className="text-accent underline-offset-4 hover:underline">
        {urlLabel(url)}
      </a>
      {trailingDot}
    </>
  );
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
    page,
    text: page.page.regulationsText,
    version: page.page.regulationsVersion,
    updatedAt: page.page.regulationsUpdatedAt,
    nowMs: Date.now(),
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
  const { tournamentName, page, text, version, updatedAt, nowMs } = loaderData;
  const sections = parseRegulationSections(text);
  const updatedDate = dateOfIso(updatedAt);
  const title = tournamentName ? `${tournamentName} regulations` : 'Tournament regulations';
  return (
    <PlayShell>
      {/* Contract §11 (public P1): the reader used to carry a floating
          "← Tournament page" link, its own eyebrow/title/facts header, and a
          left column whose lower half restated the tab bar. All three are
          gone: this is the Documents section of the one tournament frame,
          reached through the Documents tab and the breadcrumb. */}
      <TournamentFrame page={page} nowMs={nowMs} active="documents" />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={SECTION_TITLE}>Tournament regulations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {`Version ${version}`}
              {updatedDate ? ` · updated ${formatDateLong(updatedDate)}` : ''}
            </p>
          </div>
          {/* Document actions stay with the document, inside the shared page
              hierarchy — they are not a second navigation. */}
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

        {/* The in-document outline is the document's own table of contents,
            not a page navigation: it names only sections of the text below
            it, and sits above the document rather than beside it. */}
        {sections.length > 1 ? (
          <nav aria-label="Document sections" className="mt-6 max-w-3xl rounded-lg border border-rule-soft bg-surface-raised p-4">
            <h3 className="font-display text-sm font-bold tracking-tight text-foreground">On this page</h3>
            <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-accent underline-offset-4 hover:underline">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <article id="regulations-document" className="mt-8 min-w-0 max-w-3xl" aria-labelledby="regulations-heading">
          <h3 id="regulations-heading" className="sr-only">Regulations document</h3>
          <div className="grid gap-7">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-6">
                <h4 className="font-display text-xl font-bold tracking-tight text-foreground">{section.title}</h4>
                {section.body ? (
                  <p className="mt-3 whitespace-pre-line break-words text-base leading-8 text-foreground [overflow-wrap:anywhere]">{renderBody(section.body)}</p>
                ) : null}
              </section>
            ))}
          </div>
        </article>
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
