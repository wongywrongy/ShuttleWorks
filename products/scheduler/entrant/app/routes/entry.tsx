/**
 * `/e/{slug}` — the public entry page.
 *
 * A poster URL, not a capability URL: reading it never requires an account
 * (`api/entries_json.py:210-224`), so the loader's one call is a public
 * projection and carries no credential. It reads the inbound `request` for
 * nothing at all — see the structural guard in `tests/entry.loader.test.ts`,
 * which is the tier-level half of what `apiFetch.server.ts` promises: node
 * renders, and never relays identity in either direction.
 *
 * **The Idempotency-Key is minted here, in the loader.** Not at submit: a
 * double-click on an unhydrated form fires two POSTs, and a key minted at
 * submit time would mint two keys and record two entries. Minted once per
 * rendered form, both POSTs carry the same key and the second is a replay
 * against `UNIQUE (tournament_id, account_id, idempotency_key)` — an index
 * that until Phase 6 no legitimate row could reach, because a native form
 * cannot send a header and every real row had the column NULL. Not in the
 * browser either: the form must work with no JavaScript at all (spec §7), so
 * the key travels in the HTML, in the hidden field the backend already reads
 * (`api/entries_json.py:617`).
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { ApiError, apiGet } from '../lib/apiFetch.server';
import { parseEcho, type FormEcho } from '../lib/echo';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { formatCents } from '../lib/money';
import { EntryForm } from './entry.form';
import type { Route } from './+types/entry';

export interface EntryLoaderData {
  page: EntryPageDTO;
  idempotencyKey: string;
  /** The "Update events and total" round trip, coming back. Query-string
   * only: the quote route redirects a native form post here with the posted
   * body plus the server's total, and the hydrated path navigates to the same
   * shape. Nothing in it is trusted — see `parseEcho`. */
  echo: FormEcho;
}

/**
 * The uniform 404 — an unknown slug and a closed page answer identically.
 *
 * The backend already refuses to distinguish them (same code, same message,
 * `api/entries_public.py:219-226`), so anyone can be told "no" without being
 * told which workspaces exist. Nothing from upstream is copied into this: not
 * the code, not the message. Constructed fresh, so the two causes stay
 * byte-identical here too.
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
}): Promise<EntryLoaderData> {
  const slug = params.slug;
  if (!slug) throw notFound();

  let page: EntryPageDTO;
  try {
    page = await apiGet<EntryPageDTO>(`/e/api/page/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }

  // One key, one rendered form. A plain value, never a getter: two reads
  // during one render must be the same string or the double-click property
  // above is lost.
  // The URL is read for its query string and for nothing that carries
  // identity — the relay guards in `tests/entry.loader.test.ts` hold that
  // line structurally.
  return {
    page,
    idempotencyKey: crypto.randomUUID(),
    echo: parseEcho(new URL(request.url).searchParams),
  };
}

export default function Entry({ loaderData }: Route.ComponentProps) {
  const { page, idempotencyKey, echo } = loaderData;
  const next = encodeURIComponent(`/e/${page.page.slug}`);
  const openEvents = page.events.filter((event) => event.isOpen);

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">{page.tournament.name}</h1>
        {page.tournament.date ? (
          <p className="text-sm text-muted-foreground">{page.tournament.date}</p>
        ) : null}
        {page.venue?.name ? (
          <p className="text-sm text-muted-foreground">
            {page.venue.name}
            {page.venue.address ? `, ${page.venue.address}` : ''}
          </p>
        ) : null}
        {page.page.introText ? (
          <p className="mt-2 text-sm">{page.page.introText}</p>
        ) : null}
      </header>

      <section>
        <h2 className="text-lg font-semibold">Events</h2>
        <ul className="grid gap-1 text-sm">
          {page.events.map((event) => (
            <li key={event.id}>
              {event.discipline} ({event.code}) — {event.isOpen ? 'Open' : 'Closed'}
              {event.feeCents === null ? '' : ` · ${formatCents(event.feeCents)}`} ·{' '}
              {event.entryCount} entered
            </li>
          ))}
          {page.events.length === 0 ? <li>No events yet.</li> : null}
        </ul>
      </section>

      <section id="enter">
        <h2 className="text-lg font-semibold">Enter</h2>
        {openEvents.length === 0 ? (
          <p className="text-sm">No event is taking entries right now.</p>
        ) : page.viewer.signedIn ? (
          <EntryForm page={page} idempotencyKey={idempotencyKey} echo={echo} />
        ) : (
          // No session is a login path, never a wall.
          <p className="text-sm">
            Entries are made from an entrant account.{' '}
            <a className="underline" href={`/e/account/login?next=${next}`}>
              Sign in
            </a>{' '}
            or{' '}
            <a className="underline" href={`/e/account/signup?next=${next}`}>
              create one
            </a>
            , then come back to this page.
          </p>
        )}
      </section>

      {page.page.regulationsText ? (
        <section>
          <h2 className="text-lg font-semibold">Regulations</h2>
          <p className="whitespace-pre-line text-sm">{page.page.regulationsText}</p>
        </section>
      ) : null}

      {page.page.paymentInstructions ? (
        <section>
          <h2 className="text-lg font-semibold">Payment</h2>
          <p className="whitespace-pre-line text-sm">
            {page.page.paymentInstructions}
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold">Who has entered</h2>
        <ul className="grid gap-1 text-sm">
          {page.entrants.map((row, i) => (
            <li key={`${row.eventId}-${i}`}>{row.name}</li>
          ))}
          {page.entrants.length === 0 ? <li>Nobody yet.</li> : null}
        </ul>
      </section>
    </main>
  );
}

/**
 * Renders refusals as copy, never as upstream prose.
 *
 * `ApiError` already constructs its own message rather than copying one, but a
 * boundary that rendered `error.message` would be one edit away from putting a
 * stack frame or an internal hostname on a public page. This one reads the
 * status and nothing else.
 */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <main>
        <h1>This entry page is not available</h1>
        <p>Check the link, or ask the organiser for the current one.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Something went wrong</h1>
      <p>Please try again in a moment.</p>
    </main>
  );
}
