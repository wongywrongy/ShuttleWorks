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
 *
 * **The `_csrf` token is minted here too, and NOT read from the projection**
 * (ruling R8-D). `viewer.formCsrf` is derived from a cookie node never sends,
 * so it is `""` on every server-rendered page — for a signed-in entrant as
 * much as for a stranger — and an empty token can never match. `mintFormCsrf`
 * mints a `sw_play_csrf` nonce instead, set on this response, which the
 * backend already accepts as a second candidate secret. The nonce names no
 * principal, so the no-relay rule is untouched. See
 * `app/lib/formCsrf.server.ts`.
 */
import { data, isRouteErrorResponse, useRouteError } from 'react-router';

import { ApiError, apiGet } from '../lib/apiFetch.server';
import { parseEcho, type FormEcho } from '../lib/echo';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { mintFormCsrf } from '../lib/formCsrf.server';
import { formatCents } from '../lib/money';
import { EntryForm } from './entry.form';
import type { Route } from './+types/entry';

export interface EntryLoaderData {
  page: EntryPageDTO;
  idempotencyKey: string;
  /**
   * The double-submit token for this rendered form — node's own, never the
   * projection's. Minted together with the nonce set on this very response;
   * the two cannot be separated.
   */
  formCsrf: string;
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

  // One key, one rendered form. A plain value, never a getter: two reads
  // during one render must be the same string or the double-click property
  // above is lost.
  // The URL is read for its query string and for nothing that carries
  // identity — the relay guards in `tests/entry.loader.test.ts` hold that
  // line structurally.
  //
  // The nonce and its token are minted in one call and returned together:
  // the token goes into the form, the nonce goes onto this response, and
  // nothing here can ship one without the other. `mintFormCsrf` takes no
  // arguments, so this route still reads no credential of any kind.
  const csrf = mintFormCsrf();
  const payload: EntryLoaderData = {
    page,
    idempotencyKey: crypto.randomUUID(),
    formCsrf: csrf.token,
    echo: parseEcho(new URL(request.url).searchParams),
  };
  return data(payload, csrf.responseInit);
}

/**
 * Forward the loader's headers onto the document — all of them, by reference.
 *
 * React Router does NOT do this by default: `getDocumentHeaders` copies only
 * `Set-Cookie` out of a loader's `ResponseInit` unless the route exports
 * `headers`, so `mintFormCsrf`'s `Cache-Control: no-store` reached the loader
 * result and stopped there, and the document went out cacheable while
 * carrying both halves of a double-submit. (Verified against the running
 * framework by `entry.loader.test.ts`, which asserts the header on the real
 * document response rather than on the loader's return value — the reason
 * this gap was findable at all.)
 *
 * Deliberately a pass-through and not `{'Cache-Control': 'no-store'}`: the
 * value belongs to the mint, which is where the argument for it lives. This
 * route only refuses to drop what the mint decided.
 */
export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

export default function Entry({ loaderData }: Route.ComponentProps) {
  const { page, idempotencyKey, formCsrf, echo } = loaderData;
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
        {/*
          **The link R8-E could not yet make (F-E1-2-E1).** The old copy here
          pointed at `/e/account/login`, which is FastAPI's POST — a 405 — so
          it was removed and nothing replaced it, which left both account
          pages reachable only by typing their URLs. Tasks 19-20 built them at
          node-owned GET paths, so this is the wiring.

          Rendered unconditionally, exactly like the form above it and for the
          same reason: `viewer.signedIn` is `false` on every server-rendered
          page (node's fetch is always anonymous), so a gate here would hide
          the link from everyone. A signed-in entrant seeing "sign in" is a
          redundancy; a signed-out one seeing nothing is a dead end.

          `next` sends the entrant back to THIS page after signing in —
          validated at both ends (`safeNext` in `routes/login.tsx`,
          `next_target` in `api/entrants.py`), and the slug is encoded because
          it is the one part of this URL that comes from data.
        */}
        <p className="text-sm">
          <a className="underline" href={`/e/login?next=/e/${encodeURIComponent(page.page.slug)}`}>
            Sign in
          </a>{' '}
          or <a className="underline" href="/e/signup">create an entrant account</a> to
          enter.
        </p>
        {/*
          **The form is rendered unconditionally (ruling R8-E).** It used to be
          gated on `page.viewer.signedIn`, which is a value this page cannot
          have: node's fetch of `GET /e/api/page/{slug}` is always anonymous
          (`apiFetch.server.ts` sends `accept` and nothing else), so
          `_optional_entrant` reads no cookie and `signedIn` is `false` for a
          signed-in entrant exactly as much as for a stranger. The gate
          therefore hid the form from EVERYONE, and the "sign in" copy it
          rendered instead pointed at `/e/account/login`, which is POST-only —
          a 405. Both links are gone until Tasks 19-21 build those pages;
          a link to a route that 405s is worse than no link.

          Who may submit is decided where it can be decided: by
          `Depends(get_current_entrant)` on `POST /e/api/submit/{slug}`, which
          the browser reaches directly, with its cookies, on one origin. An
          anonymous submitter is navigated back here with a notice — see
          `entrant_or_back_to_form` in `api/entries_json.py` and the
          `NOT_SIGNED_IN` copy in `lib/echo.ts`.
        */}
        {openEvents.length === 0 ? (
          <p className="text-sm">No event is taking entries right now.</p>
        ) : (
          <EntryForm
            page={page}
            idempotencyKey={idempotencyKey}
            formCsrf={formCsrf}
            echo={echo}
          />
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
