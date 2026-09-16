/**
 * The reads both sign-up routes make, in one place.
 *
 * `routes/signup.tsx` and `routes/signupFailed.tsx` render one document and
 * therefore need one set of facts: the Turnstile sitekey, the validated
 * continuation, and the tournament's human name when the signup was reached
 * from an entry page. They are separate MODULES for a reason the component's
 * banner spells out (only one of them may have an `action`), so the shared
 * part lives here rather than in either of them.
 *
 * **`mintFormCsrf` is deliberately NOT called here.** The guard in
 * `tests/enter.loader.test.ts` finds every route that mints a nonce by
 * scanning route sources for `mintFormCsrf(` and requires each to export
 * `headers`; moving the call behind this helper would empty that list and
 * retire the guard rather than satisfy it. Each route mints its own and
 * passes the digest in.
 *
 * Nothing here reads an address. The one caller that has an entrant's typing
 * to put back hands it in as `echo`, already extracted from the re-posted
 * body — this module never sees a request body and never sees a password.
 */
import { apiGet } from './apiFetch.server';
import type { EntryPageDTO } from './entryPage.types';
import { safeNext } from './nextTarget';
import {
  ACCOUNT_READY_PAGE,
  emptyEcho,
  knownReason,
  type SignupEcho,
  type SignupFailureReason,
  type SignupPageProps,
} from '../components/SignupPage';

/** `EntrantConfigDTO` — `api/entries_json.py`. Exactly two keys, both public
 * by nature: a sitekey is rendered into every signup page, and the auth mode
 * is observable from whether an anonymous write is refused. */
interface EntrantConfig {
  turnstileSiteKey: string;
  authMode: string;
}

/** The loader payload of both sign-up routes. */
export type SignupLoaderData = SignupPageProps;

/**
 * Build the document's facts.
 *
 * `readReason` is `false` on the bare `/e/signup` page and `true` on the
 * failure variant. Scoping it to the caller is what keeps `/e/signup?reason=…`
 * inert, and with it the byte-identical comparison in `tests/signup.test.ts`:
 * a page that branched on a query field the plain route accepted would be
 * the seam through which this tier reintroduced a difference the backend
 * pays an Argon2 hash to avoid.
 */
export async function signupPageData(
  request: Request,
  formCsrf: string,
  options: { readReason: boolean; echo?: SignupEcho },
): Promise<SignupLoaderData> {
  // The sitekey is fetched rather than duplicated into a node env var: its
  // pair, the secret, is validated only in the backend, and a sitekey that
  // drifts from its secret fails the challenge for every honest entrant while
  // looking like a Cloudflare outage. A failure here reaches the route's
  // boundary as fixed copy — fail closed, since a signup with no widget is a
  // signup the backend will refuse anyway.
  const config = await apiGet<EntrantConfig>('/e/api/config');

  const url = new URL(request.url);
  const failureReason: SignupFailureReason | null = options.readReason
    ? knownReason(url.searchParams.get('reason'))
    : null;
  const requestedNextRaw = safeNext(url.searchParams.get('next'), ACCOUNT_READY_PAGE);
  // `/login/signed-in` is the login page's generic completion state. Signup
  // has its own completion state, so do not carry that presentation URL into
  // the signup POST as if it were a destination.
  const requestedNext =
    requestedNextRaw === '/e/login/signed-in' ? ACCOUNT_READY_PAGE : requestedNextRaw;

  // V3-PE24.1: name the tournament on the page, not just "this tournament".
  // Best-effort — the same anonymous read `enter.tsx` already performs for
  // this slug — and never blocks the page: a lookup failure (closed
  // tournament, race with deletion) falls back to the generic heading
  // rather than turning a signup page into a 404 the entry page itself
  // has not raised.
  const contextMatch = requestedNext.match(/^\/e\/([^/]+)\/enter(?:\/created|\/signed-in)?$/);
  let tournamentName: string | null = null;
  if (contextMatch) {
    try {
      const page = await apiGet<EntryPageDTO>(
        `/e/api/page/${encodeURIComponent(contextMatch[1])}`,
      );
      tournamentName = page?.tournament?.name ?? null;
    } catch {
      // Best-effort only: any failure — a 404, a network error, or a shape
      // this page did not expect — falls back to the generic heading rather
      // than surfacing at all.
      tournamentName = null;
    }
  }

  return {
    turnstileSiteKey: config.turnstileSiteKey,
    formCsrf,
    next: requestedNext,
    tournamentName,
    failureReason,
    echo: options.echo ?? emptyEcho(),
  };
}
