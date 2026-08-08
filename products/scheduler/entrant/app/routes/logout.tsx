/**
 * `GET /e/logout` — the page that lets a signed-in entrant end their session.
 *
 * **Why a page and not a link.** Signing out is a state change, so it is a
 * POST and nothing else. A `GET /e/account/logout` — or an `<a href>` dressed
 * as a button — is CSRF-able by construction: any `<img src>`, link prefetch,
 * antivirus URL scanner or chat-app unfurler that touches the URL destroys the
 * session, and none of them are attackers. So the *reachable* thing is this
 * document, and the only thing that logs anyone out is the form inside it.
 * `tests/logout.test.ts` pins both halves — one form, `method="post"`, and no
 * `<a href>` anywhere in the tier pointing into `/e/account/`.
 *
 * **Why the page and the POST are at different URLs.** Ruling R8-A (see
 * `react-router.config.ts`) hands nginx the whole `/e/account/` prefix, and a
 * prefix split cannot be a method split — a node GET inside it answers 405 in
 * every deployment that implements the ruling. That is how Task 19's signup
 * page first shipped; `tests/routeConfig.test.ts` now fails any route that
 * lands inside a backend prefix. The POST target is untouched.
 *
 * **Zero new backend routes and zero backend change.** `POST /e/account/logout`
 * has existed since SP-E1-2 and already accepts the urlencoded `_csrf` channel
 * (`logout_form_csrf`, `api/entrants.py:271`). This is the third and last of
 * the bodies the doors were missing.
 *
 * **The CSRF secret node can actually hold.** `logout_form_csrf` accepts
 * *either* candidate secret — the session cookie or the `sw_play_csrf` nonce —
 * and node has only the second: it never reads or relays the session cookie
 * (`apiFetch.server.ts`'s frozen allowlist, and the loader below takes no
 * arguments at all). So `mintFormCsrf()` mints the nonce onto this very
 * response and renders its digest, exactly as `login.tsx` does. That is not a
 * downgrade: both cookies are `HttpOnly`, so a cross-site page can make the
 * browser send either and read neither, which is the whole double-submit claim.
 *
 * **What the server actually does with the POST**, because "logged out" has a
 * weak reading and a strong one: `logout` revokes the presented session row
 * (`entrant_service.revoke_session` — a timestamp, never a delete, so an audit
 * still sees it) *and* clears the cookie. A cleared cookie over a live session
 * row would be no logout at all — anyone still holding the token would still
 * hold the account. Proved by replaying the pre-logout token in
 * `products/scheduler/tests/test_entrant_auth_routes.py`
 * (`test_a_form_logout_kills_the_session_and_lands_on_a_node_owned_get`).
 *
 * **Everything here works unhydrated.** A plain `<form>`, never React Router's
 * `<Form>`, so a scriptless browser posts exactly as a hydrated one does.
 */
import { Button } from '@scheduler/design-system/components';
import { data } from 'react-router';

import { FORM_FIELD } from '../lib/formField';
import { mintFormCsrf } from '../lib/formCsrf.server';
import type { Route } from './+types/logout';

/**
 * Where the browser lands once the session is gone.
 *
 * Rendered unconditionally and hardcoded, because the backend's own fallback
 * is `/e/account/login` (`api/entrants.py:569`) — POST-only, so a *successful*
 * sign-out would end on a 405. Unlike `login.tsx` this page reads no `next`
 * from the URL: there is no destination a caller could usefully choose that
 * the sign-in page does not already lead to, and not reading the query string
 * is what lets the loader below take no parameters at all.
 */
const NEXT = '/e/login';

export interface LogoutLoaderData {
  /** The double-submit token, minted together with the nonce set on this very
   * response. Node's own — it cannot derive one from a session it never
   * reads. */
  formCsrf: string;
}

/**
 * Takes no parameters, deliberately — `signup.tsx`'s proof, and the cheapest
 * one there is: there is no argument through which a request, and therefore an
 * inbound session cookie, could reach this function. A logout page has nothing
 * to read off the URL, so it reads nothing.
 */
export async function loader() {
  const csrf = mintFormCsrf();
  const payload: LogoutLoaderData = { formCsrf: csrf.token };
  return data(payload, csrf.responseInit);
}

/**
 * Forward the loader's headers onto the document — all of them, by reference.
 *
 * React Router does NOT do this by default: `getDocumentHeaders` copies only
 * `Set-Cookie` out of a loader's `ResponseInit` unless the route exports
 * `headers`, so `mintFormCsrf`'s `Cache-Control: no-store` would reach the
 * loader result and stop there, and this document — which carries BOTH halves
 * of a double-submit — would go out cacheable. A shared cache that stored it
 * replays one visitor's nonce and its matching token to the next. Enumerated
 * for every minting route in `tests/entry.loader.test.ts`, and pinned on this
 * route's real document response in `tests/logout.test.ts`.
 */
export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

export default function LogoutPage({ loaderData }: Route.ComponentProps) {
  const { formCsrf } = loaderData;

  return (
    <main className="mx-auto grid w-full max-w-md gap-6 p-4">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">Sign out</h1>
        <p className="text-sm text-muted-foreground">
          This signs you out on this device only. Entries you have already
          submitted are unaffected, and you can sign back in at any time.
        </p>
      </header>

      {/*
        Posts ACROSS the tier boundary, not to this page's own URL: all of
        `/e/account/*` is FastAPI's (R8-A). `encType` is omitted — urlencoded
        is the HTML default and is what `is_form_post` looks for.
      */}
      <form method="post" action="/e/account/logout" className="grid gap-4">
        {/* The `sw_play_csrf` nonce set on this very response is the secret;
            this is its digest. The NAME comes from `FORM_FIELD` rather than a
            literal, so the cross-tier pin against `app/form_csrf.FORM_FIELD`
            is load-bearing. */}
        <input type="hidden" name={FORM_FIELD} value={formCsrf} />
        {/* Never omitted: the route's own fallback is POST-only. */}
        <input type="hidden" name="next" value={NEXT} />

        <Button type="submit" className="justify-self-start">
          Sign out
        </Button>
      </form>

      <p className="text-sm">
        {/* Node-owned GETs, both. Linking to `/e/account/*` is a 405 in the
            entrant's face — and for logout it would be the CSRF hole this
            page exists to avoid. */}
        Already signed out? <a className="underline" href="/e/login">Go to sign in</a>.
      </p>
    </main>
  );
}
