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
import type { EntryPageDTO } from '../lib/entryPage.types';
import type { Route } from './+types/entry';

export interface EntryLoaderData {
  page: EntryPageDTO;
  idempotencyKey: string;
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
  return { page, idempotencyKey: crypto.randomUUID() };
}

export default function Entry({ loaderData }: Route.ComponentProps) {
  const { page, idempotencyKey } = loaderData;

  return (
    <main>
      <h1>{page.tournament.name}</h1>
      {/* The form itself is the next slice. What is here now is the one part
          the loader owns: the key, in the markup, reachable without a script. */}
      <form method="post">
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      </form>
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
