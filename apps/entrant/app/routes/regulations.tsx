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

/**
 * One block of an organizer's regulations: a paragraph, or a bulleted list.
 *
 * public-visual-fixes P6: the body used to be ONE `whitespace-pre-line`
 * paragraph per section, so a rules document's list of eligibility points
 * printed as a wall of soft-wrapped lines with no indentation and no
 * spacing. These are the shapes this tier renders — and the only ones. There
 * is deliberately no HTML shape: authored text is escaped by React and never
 * passed to `dangerouslySetInnerHTML`, so an uploaded `<script>` or a pasted
 * `<div>` reads as the characters the organizer typed.
 */
export type RegulationBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

export interface RegulationSection {
  id: string;
  title: string;
  blocks: RegulationBlock[];
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

/** `- item`, `* item`, `• item` — the bullets a director actually types.
 *  Numbered lines are NOT list items here: `1. Eligibility` is already this
 *  parser's heading shape, and one line cannot be both. */
const BULLET = /^\s*[-*•–]\s+(\S.*)$/;

/** Group an authored body into paragraphs and bulleted lists. A blank line
 *  ends a paragraph; consecutive bullets are one list. */
export function parseRegulationBlocks(body: string): RegulationBlock[] {
  const blocks: RegulationBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] | null = null;

  const flushParagraph = () => {
    const text = paragraph.join('\n').trim();
    if (text) blocks.push({ kind: 'paragraph', text });
    paragraph = [];
  };
  const flushList = () => {
    if (items && items.length > 0) blocks.push({ kind: 'list', items });
    items = null;
  };

  for (const line of body.split('\n')) {
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      items = items ?? [];
      items.push(bullet[1].trim());
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
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
    const blocks = parseRegulationBlocks(body);
    if (currentTitle !== null) {
      sections.push({ id: sectionId(currentTitle, used), title: currentTitle, blocks });
    } else if (body) {
      sections.push({ id: sectionId('Full regulations', used), title: 'Full regulations', blocks });
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
    : [{ id: 'regulations', title: 'Full regulations', blocks: parseRegulationBlocks(text.trim()) }];
}

/**
 * V3-PE15.2 / public-visual-fixes P6: an organizer's regulations routinely
 * carry an address — a citation ("Source reference: https://…"), a club's
 * entry page, the national federation's rulebook. As plain text those read
 * as unclickable technical strings in the middle of prose, so every http(s)
 * address in the authored text becomes a real link with a readable label
 * derived from the address itself.
 *
 * The organizer's own words are otherwise untouched (R1: content is not
 * rewritten, only its presentation as a link), trailing sentence punctuation
 * stays OUTSIDE the link where it belongs, and everything else on the page —
 * including anything that looks like markup — is escaped by React.
 */
const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/g;

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

function renderText(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const start = match.index ?? 0;
    // A sentence's full stop, comma or closing bracket is punctuation, not
    // part of the address: linking it produces a 404 on click.
    const href = match[0].replace(/[.,;:!?)\]}]+$/, '');
    if (!/^https?:\/\/\S+$/.test(href)) continue;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <a key={`${start}-${href}`} href={href} className="text-accent underline-offset-4 hover:underline">
        {urlLabel(href)}
      </a>,
    );
    cursor = start + href.length;
  }
  if (parts.length === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
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
  // The identity a PRINTED page needs and the screen already has from the
  // hero: who is playing what, and when. On screen it is duplicate furniture,
  // so it renders only on paper.
  const printIdentity = [tournamentName, formatDateLong(page.tournament.date), page.venue?.name]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
  return (
    <PlayShell>
      {/* Contract §11 (public P1): the reader used to carry a floating
          "← Tournament page" link, its own eyebrow/title/facts header, and a
          left column whose lower half restated the tab bar. All three are
          gone: this is the Documents section of the one tournament frame,
          reached through the Documents tab and the breadcrumb. */}
      <TournamentFrame page={page} nowMs={nowMs} active="documents" />
      {/* Print rules ride a page-scoped stylesheet rather than the shared
          `app.css`: they exist for THIS document and must not decide how any
          other public page prints. `media="print"` keeps them out of the
          screen cascade entirely. */}
      <link rel="stylesheet" media="print" href="/e/assets/regulations-print.css" />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        {/* public-visual-fixes P6: the document's own title band is ONE line.
            It used to be a section title repeating the word already in the
            breadcrumb, the tab and the browser tab, over a version/updated
            line, over an sr-only "Regulations document" heading — three
            names for one thing before a reader reached a single rule. What
            is left is the heading the page hierarchy needs (the frame owns
            the `h1`) and the provenance a rules document must carry. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className={SECTION_TITLE}>Regulations</h2>
          <p className="text-sm text-muted-foreground">
            {`Version ${version}`}
            {updatedDate ? ` · updated ${formatDateLong(updatedDate)}` : ''}
          </p>
          {/* Document actions stay with the document, inside the shared page
              hierarchy — they are not a second navigation. `Download` says
              what the button does and no more: it saves the text of this
              document, and calling that "Save as PDF" would be a lie about
              the file the reader gets. */}
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
              Download
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

        <article id="regulations-document" className="mt-8 min-w-0 max-w-3xl">
          {printIdentity ? (
            <p className="hidden text-sm text-muted-foreground print:block">{printIdentity}</p>
          ) : null}
          <div className="grid gap-8">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-6">
                <h3 className="font-display text-xl font-bold tracking-tight text-foreground">{section.title}</h3>
                {section.blocks.map((block, index) =>
                  block.kind === 'list' ? (
                    <ul
                      key={`${section.id}-${index}`}
                      className="mt-3 grid list-disc gap-2 ps-6 text-base leading-7 text-foreground marker:text-muted-foreground"
                    >
                      {block.items.map((item) => (
                        <li key={item} className="break-words [overflow-wrap:anywhere]">{renderText(item)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p
                      key={`${section.id}-${index}`}
                      className="mt-3 whitespace-pre-line break-words text-base leading-8 text-foreground [overflow-wrap:anywhere]"
                    >
                      {renderText(block.text)}
                    </p>
                  ),
                )}
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
