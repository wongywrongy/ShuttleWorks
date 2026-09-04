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
 * **Non-enumeration.** `api/entrants.py:login` answers one refusal for every
 * cause — unknown address, no password set, wrong password — and pays the
 * Argon2 cost on the miss as well, so neither body nor timing is an oracle
 * (`entrant_service.authenticate` returns an account or `None` and offers no
 * way to ask why). This tier must not add the distinction back.
 *
 * It renders exactly one refusal state, and the signal that reaches it is a
 * PATH (`/e/login/failed`), not a code: a form post that fails is a browser
 * navigation, so before this the entrant read
 * `{"detail":{"code":"AUTH_INVALID_CREDENTIALS",…}}` as the whole document
 * (found by a real-browser demo pass, 2026-08-10). What node is handed is
 * "that did not work" and nothing else — no address, no cause, nothing to
 * branch on — which is why the fix is a second bound path rather than the
 * `?error=` flash it would otherwise have been. The loader still reads
 * exactly one query parameter. `tests/login.test.ts` compares the rendered
 * documents for a fresh and an already-registered address byte for byte, and
 * pins that the only query parameter reaching the markup is `next`.
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
import { Button, Notice, TextField } from '@scheduler/design-system/components';
import { brandedTitle } from '@scheduler/brand';
import { data } from 'react-router';
import { useContext } from 'react';

import { PlayShell } from '../components/PlayShell';
import { FORM_FIELD } from '../lib/formField';
import { safeNext } from '../lib/nextTarget';
import { mintFormCsrf } from '../lib/formCsrf.server';
import { EntrantSessionContext } from '../lib/sessionContext';
import type { Route } from './+types/login';
import { CARD } from '../lib/ui';

/**
 * Where a successful sign-in lands when the link that brought the entrant here
 * did not say.
 *
 * It cannot be left empty: the backend's own fallback is `/e/account/login`
 * (`api/entrants.py`), which is POST-only and therefore a 405 — fine as a
 * default for a JSON caller that never follows it, useless for a browser. So
 * this page always posts a `next`, and the default is a node-owned GET.
 *
 * **It used to be the bare `/e/login`**, i.e. this page again with nothing
 * changed on it: sign up, sign in, and land back on a sign-in form, which is
 * exactly what a post that had silently done nothing looks like. That is the
 * whole flow for an entrant who reached signup without a tournament in hand
 * (every link that carries a real `next` was always fine — the entry page
 * sends `?next=/e/{slug}/signed-in`). It now lands on the variant below,
 * which says what happened and what to do next. Still not a claim this page
 * can verify — no page on this tier can read the session cookie (R8-D) — so
 * the copy states the outcome and grants nothing, the same posture the entry
 * page's `/signed-in` variant takes.
 */
const DEFAULT_NEXT = '/e/login/signed-in';

export interface LoginLoaderData {
  /** The pre-session double-submit token, minted together with the nonce set
   * on this very response. Node's own — there is no session to derive one
   * from, which is the whole point of the page. */
  formCsrf: string;
  /** Validated here, and validated again by `next_target` at the far end. */
  next: string;
  /**
   * Did the browser arrive here from a completed sign-up (E3)?
   *
   * Read from this request's own PATH — `/e/login/created`, the second route
   * bound to this module — and from nothing else. `POST /e/account/signup`
   * answers 303 to the form's `next` and answers it identically whether the
   * account was created or already existed, so this says "your sign-up
   * finished" and never "your address was new": the enumeration property the
   * backend pays an Argon2 hash to keep is untouched, and the two branches
   * still render byte-identical documents.
   */
  justSignedUp: boolean;
  /**
   * Did a sign-in just fail? Read from this request's PATH, `/e/login/failed`.
   *
   * **One flag for every cause, which is the point.** `api/entrants.py`'s
   * login answers unknown-address, no-password-set and wrong-password
   * identically and pays the Argon2 cost on the miss; the redirect that lands
   * here is that same single answer wearing a shape a browser can render. A
   * `?error=` query field would have carried a code this page then branched
   * on — one edit from "no account with that address" — so there is no code:
   * the path is the whole signal, and it has two values.
   */
  signInFailed: boolean;
  /**
   * Did a sign-in just succeed with nowhere in particular to go?
   *
   * `DEFAULT_NEXT`'s destination. The URL is typeable, so the route only
   * removes its form when root's boolean cookie-presence signal is true; it
   * never treats that signal as identity or authorization. The write remains
   * gated by FastAPI.
   */
  justSignedIn: boolean;
}

/**
 * The suffix of the second path bound to this module (`app/routes.ts`).
 *
 * A suffix rather than the whole URL, and no constant shared with
 * `signup.tsx`: the route table binds this module to exactly two paths, so
 * there is nothing else `/created` could be, and a route-to-route import to
 * spare one literal is a worse trade than the literal. The pair that could
 * actually drift — the `next` signup posts and the page that confirms it — is
 * held end to end in `tests/login.test.ts`, which reads the value off the
 * signup document and renders it.
 */
const SIGNED_UP_SUFFIX = '/created';

/** The other two, same argument. The route table binds this module to four
 * paths and nothing else can end in either of these. */
const FAILED_SUFFIX = '/failed';
const SIGNED_IN_SUFFIX = '/signed-in';

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
  // Read for its URL — its query for `next`, its path for which of this
  // module's two routes was matched — and for nothing that carries identity.
  // The structural guards in `tests/entry.loader.test.ts` hold that line.
  const url = new URL(request.url);
  const payload: LoginLoaderData = {
    formCsrf: csrf.token,
    next: safeNext(url.searchParams.get('next'), DEFAULT_NEXT),
    justSignedUp: url.pathname.endsWith(SIGNED_UP_SUFFIX),
    signInFailed: url.pathname.endsWith(FAILED_SUFFIX),
    justSignedIn: url.pathname.endsWith(SIGNED_IN_SUFFIX),
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

/**
 * Document title (2026-08-11 design audit, finding #4, deferred half).
 *
 * Root's `meta` only fires a fallback title when ITS OWN `ErrorBoundary`
 * renders (an unmatched path); every real route is supposed to name its own,
 * and this one never did, so a browser tab on `/e/login` carried no `<title>`
 * at all. Zero-arg, same shape as `discovery.tsx`'s: this page has no
 * loader-derived data worth titling with, and none of `LoginLoaderData`
 * (which carries `formCsrf`) needs to be in reach of a function that renders
 * into `<head>` at all.
 */
export const meta: Route.MetaFunction = () => [
  { title: brandedTitle('Sign in') },
];

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const { formCsrf, next, justSignedUp, signInFailed, justSignedIn } = loaderData;
  const signedIn = useContext(EntrantSessionContext);
  const showLoginForm = !(justSignedIn && signedIn);

  return (
    // E1: the page system, not a bare column. Brief §4 — "auth pages as small
    // centered cards" — so the shell holds a `max-w-md` column and the form
    // sits on the tier's own card skin (`rounded-lg border border-rule-soft
    // bg-surface-raised`, the one every Overview card wears).
    // The shell receives root's boolean cookie-presence signal and therefore
    // renders `My entries` for an authenticated redirect. The route outcome
    // still comes from its path; the boolean is never an identity or auth
    // decision, and only prevents a contradictory second credential form.
    <PlayShell signInLabel={justSignedIn ? 'Switch account' : 'Sign in'}>
      <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
        <header className="grid gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="text-sm text-muted-foreground">
            Use the entrant account you signed up with. One account enters you
            into any tournament on this site.
          </p>
        </header>

        {/* The sign-up outcome, in words (E3). Before this, a successful
            sign-up redirected here and said nothing at all, so it was
            indistinguishable from a form that had quietly failed.

            The copy is true on BOTH of the backend's branches — a new account
            is ready, and one that already existed is ready too — which is
            what keeps it from becoming the enumeration oracle the uniform 303
            exists to avoid. It states no address and no branch, so the
            documents for a fresh and a registered address stay
            byte-identical. */}
        {justSignedUp ? (
          <Notice tone="success">
            Your entrant account is ready. Sign in below with the address and
            password you just gave.
          </Notice>
        ) : null}

        {/* The refusal, in words (2026-08-10 browser pass). Before this, a
            wrong password painted `{"detail":{"code":
            "AUTH_INVALID_CREDENTIALS",…}}` across the whole window: a native
            form post is a navigation, so whatever the backend answers IS the
            document.

            **One sentence for every cause**, matching the single 401 it
            stands in for. It does not say whether the address is known,
            whether the account has a password, or which of the two fields was
            wrong — there is nothing here to say it WITH, because the signal
            that reaches this page is a path with two values and carries no
            code. "Check the address and password" is advice, not a
            diagnosis. */}
        {signInFailed ? (
          <Notice tone="warning">
            We could not sign you in. Check the email address and password, then
            try again. Nothing about your account has changed.
          </Notice>
        ) : null}

        {/* A sign-in that worked but had nowhere to go (`DEFAULT_NEXT`). A
            browser that followed the redirect carries the entrant cookie, so
            the session-aware branch below offers the next task and no second
            credential form. A direct visit without a cookie keeps the retry
            form available, but is not treated as proof of authentication. */}
        {justSignedIn ? (
          <Notice tone="success">
            {showLoginForm ? (
              'You are signed in on this device. Open the entry link your organizer gave you to enter a tournament. The form below signs in a different account.'
            ) : (
              'You are signed in on this device. Continue to My entries below.'
            )}
          </Notice>
        ) : null}

        {showLoginForm ? (
        <div className={`grid gap-6 ${CARD}`}>
          {/*
            Posts ACROSS the tier boundary, not to this page's own URL: all of
            `/e/account/*` is FastAPI's (R8-A). A plain `<form>`, never React
            Router's `<Form>`, so RR7 never intercepts and a hydrated browser
            posts exactly as a scriptless one does — one submission path, not
            two that can drift. `encType` is omitted: urlencoded is the HTML
            default.
          */}
          <form method="post" action="/e/account/login" className="grid gap-4">
            {/* Channel two, and the only one available here: there is no
                session on this page, so the proof-of-intent is the
                `sw_play_csrf` nonce set on this very response and this is its
                digest. The NAME comes from `FORM_FIELD` rather than a literal,
                so the cross-tier pin against `app/form_csrf.FORM_FIELD` is
                load-bearing. */}
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
              // No `minLength` here, unlike signup: a length rule on a sign-in
              // box publishes the shape of stored secrets and locks out any
              // account whose password predates the rule. The server decides.
              autoComplete="current-password"
              // **The reveal toggle is deleted, not fixed (E2).** `TextField`
              // gives every password box a "Show password" control by default,
              // and it is a `<button type="button">` driven by `onClick` — this
              // page deliberately has no route-scoped module to support it.
              // A dead control is worse than no control: it teaches the reader
              // that the page is broken on the one screen where they are typing
              // a credential. Making it work needs a script budget this tier
              // does not have on this page (`root.tsx` renders no `<Scripts/>`; the
              // CSP is `script-src 'self'`), so the affordance is logged in
              // `docs/reference/debt-log.md` rather than built.
              revealable={false}
            />

            <Button type="submit" className="justify-self-start">
              Sign in
            </Button>
            <a
              className="justify-self-start text-sm text-accent underline underline-offset-4"
              href={`/e/forgot?next=${encodeURIComponent(next)}`}
            >
              Forgot your password?
            </a>
          </form>

          <p className="border-t border-rule-soft pt-4 text-sm text-muted-foreground">
            {/* A node-owned GET. Linking to `/e/account/signup` — the POST — is
                a 405 in the entrant's face, which is the defect R8-E removed
                from the entry page; `tests/login.test.ts` reads every href in
                this document and fails on any under a FastAPI prefix. */}
            No account yet?{' '}
            <a className="text-accent underline underline-offset-4" href="/e/signup">
              Create one
            </a>
            .
          </p>
        </div>
        ) : (
          <section className={`grid gap-4 ${CARD}`}>
            <p className="text-sm text-muted-foreground">
              Your entrant account is ready to use on this device.
            </p>
            <a
              className="inline-flex min-h-10 items-center justify-center justify-self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent/90"
              href="/e/me/entries"
            >
              Continue to My entries
            </a>
          </section>
        )}
      </main>
    </PlayShell>
  );
}
