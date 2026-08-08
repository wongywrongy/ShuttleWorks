/**
 * `GET /e/login` — the page that lets a human sign in to an entrant account.
 *
 * **Why the page and the POST are at different URLs.** The form posts to
 * `/e/account/login`, which is FastAPI's. Ruling R8-A (see
 * `react-router.config.ts`) hands nginx the whole `/e/account/` prefix, and a
 * prefix split cannot be a method split — a node GET inside it answers 405 in
 * every deployment that implements the ruling. That is exactly how Task 19's
 * signup page first shipped; `tests/routeConfig.test.ts` now fails any route
 * that lands inside a backend prefix. The POST target is untouched.
 *
 * **Zero new backend routes.** `POST /e/account/login` has existed since
 * SP-E1-2. F-E1-2-E1 is a missing-UI finding, and this is the second of the two
 * bodies the doors were always missing — the first being `signup.tsx`.
 *
 * **It posts straight to FastAPI, not to a React Router action**, same posture
 * as `signup.tsx` and `entry.form.tsx`: browser → nginx → FastAPI on one
 * origin, so node holds the credential at no point. There is deliberately **no
 * `action` export in this module** and the absence is asserted. On login the
 * argument is sharper than on signup: an action would hand node the backend's
 * 401-vs-303, and a page that renders "no account with that address" from it is
 * then one edit away.
 *
 * **Non-enumeration.** `api/entrants.py:login` answers one 401 for every cause
 * — unknown address, no password set, wrong password — and pays the Argon2 cost
 * on the miss as well, so neither body nor timing is an oracle
 * (`entrant_service.authenticate` returns an account or `None` and offers no
 * way to ask why). This tier must not add the distinction back. It therefore
 * renders **no error state at all**: a failed form post never reaches node,
 * because the browser posts across the tier boundary and the backend answers
 * it. There is nothing here to branch on, which is a stronger property than
 * branching identically. `tests/login.test.ts` compares the rendered documents
 * for a fresh and an already-registered address byte for byte, and pins that
 * the only query parameter reaching the markup is `next`.
 *
 * **CSRF on a page with no session.** There is none — obtaining one is what
 * this page is for — which is what the `sw_play_csrf` nonce exists for.
 * `mintFormCsrf()` mints the pair, the digest goes into `_csrf`, the nonce goes
 * onto this response, and `require_form_csrf` on `login_body` refuses a form
 * post carrying neither candidate secret. The two halves are minted in one call
 * and cannot be shipped apart.
 *
 * **Everything here works unhydrated.** Unlike signup there is no Turnstile —
 * `verify_turnstile` guards signup only — so this page has no no-JS gap at all.
 */
import { Button, TextField } from '@scheduler/design-system/components';
import { data } from 'react-router';

import { FORM_FIELD } from '../lib/formField';
import { mintFormCsrf } from '../lib/formCsrf.server';
import type { Route } from './+types/login';

/**
 * Where a successful sign-in lands when the link that brought the entrant here
 * did not say.
 *
 * It cannot be left empty: the backend's own fallback is `/e/account/login`
 * (`api/entrants.py:532`), which is POST-only and therefore a 405 — fine as a
 * default for a JSON caller that never follows it, useless for a browser. So
 * this page always posts a `next`, and the default is a node-owned GET.
 * Returning to this page after signing in is not ideal — the page cannot see
 * the session cookie and so cannot say "you are signed in" — but a page is
 * strictly better than a 405, and every link that matters carries a real
 * `next` (the entry page sends `?next=/e/{slug}`).
 */
const DEFAULT_NEXT = '/e/login';

/**
 * The one prefix the entrant tier owns — **byte-identical to `_SAFE_NEXT` in
 * `api/entrants.py`**, deliberately, because the two validate the same value
 * for the same reason at two tiers.
 *
 * Anchored, so `//host` and `https://host` both fail. Matching an allowlist
 * rather than stripping is the argued choice: a stripper has to anticipate
 * every encoding and a matcher does not.
 */
const SAFE_NEXT = /^\/e\/[A-Za-z0-9/_.~-]*$/;

/**
 * The post-login destination, or the fallback.
 *
 * An open redirect on a login route is a phishing primitive: the victim types
 * real credentials on the real origin and is then handed to an attacker's page
 * carrying whatever the link said. The backend refuses a crafted value; this
 * page renders one into the markup, so it refuses one too rather than trusting
 * that the far end will. `..` is excluded separately because a browser
 * normalises `/e/../admin` to `/admin` before the request is ever made, so the
 * traversal never even reaches the pattern.
 */
export function safeNext(raw: string | null): string {
  const value = raw ?? '';
  if (value.includes('..') || !SAFE_NEXT.test(value)) return DEFAULT_NEXT;
  return value;
}

export interface LoginLoaderData {
  /** The pre-session double-submit token, minted together with the nonce set
   * on this very response. Node's own — there is no session to derive one
   * from, which is the whole point of the page. */
  formCsrf: string;
  /** Validated here, and validated again by `next_target` at the far end. */
  next: string;
}

/**
 * Reads the URL for exactly one field, and one that names no person.
 *
 * `signup.tsx`'s loader takes no parameters at all, which is the cheapest
 * possible proof that it cannot be handed an address. This one cannot do that
 * — it has a legitimate query field to read — so the property is held at the
 * seam instead: `next` is the only parameter read, and it is validated before
 * it reaches the payload. Nothing else in the query string exists as far as
 * this function is concerned, so a `?email=` prefill or an `?error=` flash
 * cannot be rendered without adding a line that a reviewer sees.
 */
export async function loader({ request }: { request: Request }) {
  const csrf = mintFormCsrf();
  const payload: LoginLoaderData = {
    formCsrf: csrf.token,
    next: safeNext(new URL(request.url).searchParams.get('next')),
  };
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
 * replays one visitor's nonce and its matching token to the next. Pinned on the
 * real document response in `tests/login.test.ts`, never on the mint's return
 * value: that is the only place the drop is observable. A pass-through, not a
 * literal `no-store`, because the value belongs to the mint.
 */
export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const { formCsrf, next } = loaderData;

  return (
    <main className="mx-auto grid w-full max-w-md gap-6 p-4">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Use the entrant account you signed up with. One account enters you
          into any tournament on this site.
        </p>
      </header>

      {/*
        Posts ACROSS the tier boundary, not to this page's own URL: all of
        `/e/account/*` is FastAPI's (R8-A). A plain `<form>`, never React
        Router's `<Form>`, so RR7 never intercepts and a hydrated browser posts
        exactly as a scriptless one does — one submission path, not two that
        can drift. `encType` is omitted: urlencoded is the HTML default.
      */}
      <form method="post" action="/e/account/login" className="grid gap-4">
        {/* Channel two, and the only one available here: there is no session
            on this page, so the proof-of-intent is the `sw_play_csrf` nonce
            set on this very response and this is its digest. The NAME comes
            from `FORM_FIELD` rather than a literal, so the cross-tier pin
            against `app/form_csrf.FORM_FIELD` is load-bearing. */}
        <input type="hidden" name={FORM_FIELD} value={formCsrf} />
        {/* Validated on the way in (`safeNext`) and again on the way out
            (`next_target`). Rendered unconditionally so the backend's own
            POST-only fallback is never the destination. */}
        <input type="hidden" name="next" value={next} />

        <TextField
          id="login-email"
          label="Email"
          name="email"
          type="email"
          required
          maxLength={320}
          autoComplete="email"
        />

        <TextField
          id="login-password"
          label="Password"
          name="password"
          type="password"
          required
          // No `minLength` here, unlike signup: a length rule on a sign-in box
          // publishes the shape of stored secrets and locks out any account
          // whose password predates the rule. The server decides.
          autoComplete="current-password"
        />

        <Button type="submit" className="justify-self-start">
          Sign in
        </Button>
      </form>

      <p className="text-sm">
        {/* A node-owned GET. Linking to `/e/account/signup` — the POST — is a
            405 in the entrant's face, which is the defect R8-E removed from
            the entry page; `tests/login.test.ts` reads every href in this
            document and fails on any under a FastAPI prefix. */}
        No account yet? <a className="underline" href="/e/signup">Create one</a>.
      </p>
    </main>
  );
}
