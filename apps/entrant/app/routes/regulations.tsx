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
  text: string;
  version: number;
  updatedAt: string | null;
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
  const { slug, tournamentName, text, version, updatedAt } = loaderData;
  return (
    <PlayShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
        <a
          href={`/e/${encodeURIComponent(slug)}`}
          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          ← {tournamentName ?? 'Tournament page'}
        </a>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground">
          Tournament regulations
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {`Version ${version}`}
          {dateOfIso(updatedAt) ? ` · updated ${formatDateLong(dateOfIso(updatedAt))}` : ''}
        </p>
        <div className="mt-6 max-w-prose whitespace-pre-line text-base leading-7 text-foreground">
          {text}
        </div>
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
