/**
 * `GET /e/signup` — the page that lets a human make an entrant account.
 *
 * **Why the page and the POST are at different URLs.** The form posts to
 * `/e/account/signup`, which is FastAPI's. Ruling R8-A (see
 * `react-router.config.ts`) hands nginx the whole `/e/account/` prefix, and a
 * prefix split cannot be a method split — a node GET inside it answers 405 in
 * every deployment that implements the ruling. Rather than teach ingress one
 * per-method exception, the page sits on a node-owned path. The POST target is
 * untouched; `tests/routeConfig.test.ts` fails any future route that lands
 * inside a backend prefix.
 *
 * **Why this file exists (F-E1-2-E1).** `POST /e/account/signup` has existed
 * since SP-E1-2 and the logged-out entry page named it, but nothing ever
 * rendered a form, so the endpoint was reachable only by a caller who already
 * knew it was there. **Zero new routes**, front or back: this is the missing
 * body for a door that was already hung.
 *
 * **It posts straight to FastAPI, not to a React Router action.** Same posture
 * as `entry.form.tsx` and for the same reason — every entrant write is browser
 * → nginx → FastAPI on one origin, so node holds the credential at no point in
 * the exchange. There is deliberately **no `action` export in this module**,
 * and that absence is asserted: an action would hand node the backend's answer,
 * and the moment node holds the answer, rendering a different page for
 * "created" than for "already exists" is one edit away. See below.
 *
 * **Non-enumeration is the invariant this page inherits.** The backend answers
 * a uniform 202 (303 for a form post) whether the address was registered or
 * not, spends an Argon2id hash on both branches so timing is not the oracle
 * either, and hands out no cookie on either (`api/entrants.py`, module
 * docstring). This tier must not reintroduce the distinction, so the loader
 * takes **no parameters at all** — it cannot be handed an address, from a
 * `?email=` prefill or from anywhere else, and therefore cannot branch on one.
 * `tests/signup.test.ts` compares the rendered documents for a fresh
 * and an already-registered address byte for byte.
 *
 * **CSRF on a page with no session.** There is no session yet — obtaining one
 * is what this page is for — which is exactly what the `sw_play_csrf` nonce
 * exists for. `mintFormCsrf()` mints it, the digest goes into `_csrf`, the
 * nonce goes onto this response, and `require_form_csrf` on `signup_body`
 * refuses a form post that carries neither candidate secret. The two halves are
 * minted in one call and cannot be shipped apart.
 *
 * **Turnstile needs JavaScript, and the page says so.** `verify_turnstile`
 * refuses an empty token outright with no round trip, so a scriptless browser
 * cannot complete a signup — a pre-existing gap in the anti-abuse design (Q4),
 * not one this page introduces. Stating it in the copy is the difference
 * between a missing capability and an inscrutable "the human check did not
 * pass" after filling the whole form in. Everything else here works unhydrated.
 */
import { Button, Notice, TextField } from '@scheduler/design-system/components';
import { data } from 'react-router';

import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { apiGet } from '../lib/apiFetch.server';
import { FORM_FIELD } from '../lib/formField';
import { safeNext } from '../lib/nextTarget';
import { mintFormCsrf } from '../lib/formCsrf.server';
import type { Route } from './+types/signup';

/** `EntrantConfigDTO` — `api/entries_json.py`. Exactly two keys, both public
 * by nature: a sitekey is rendered into every signup page, and the auth mode
 * is observable from whether an anonymous write is refused. */
interface EntrantConfig {
  turnstileSiteKey: string;
  authMode: string;
}

export interface SignupLoaderData {
  turnstileSiteKey: string;
  /** The pre-session double-submit token, minted together with the nonce set
   * on this very response. Node's own — there is no projection to read one
   * from here, and there is no session to derive one from. */
  formCsrf: string;
}

/**
 * Reads the request for nothing, because it is not given the request.
 *
 * The zero-arity signature is the enumeration control at its cheapest: a
 * function with no parameters cannot be handed an email address, so no amount
 * of later editing inside it can make the page differ for a registered address
 * versus a fresh one without first changing this line — which is a visible,
 * reviewable act rather than a quiet one. `mintFormCsrf` is pinned the same
 * way, for the same reason.
 */
export async function loader() {
  // The sitekey is fetched rather than duplicated into a node env var: its
  // pair, the secret, is validated only in the backend, and a sitekey that
  // drifts from its secret fails the challenge for every honest entrant while
  // looking like a Cloudflare outage. A failure here reaches the boundary
  // below as fixed copy — fail closed, since a signup with no widget is a
  // signup the backend will refuse anyway.
  const config = await apiGet<EntrantConfig>('/e/api/config');

  const csrf = mintFormCsrf();
  const payload: SignupLoaderData = {
    turnstileSiteKey: config.turnstileSiteKey,
    formCsrf: csrf.token,
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
 * of a double-submit, the nonce in `Set-Cookie` and its digest in the body —
 * would go out cacheable. A shared cache that stored it replays one visitor's
 * nonce and its matching token to the next. Pinned on the real document
 * response in `tests/signup.test.ts`, never on the mint's return
 * value: that is the only place the drop is observable.
 *
 * A pass-through, not `{'Cache-Control': 'no-store'}` — the value belongs to
 * the mint, which is where the argument for it lives. Copied from
 * `routes/entry.tsx`, which hit exactly this trap.
 */
export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

/**
 * Where a completed sign-up lands when this page was reached without a
 * tournament — the login page's "your account is ready" variant, which is
 * what the hidden field held unconditionally before E3.
 */
const ACCOUNT_READY_PAGE = '/e/login/created';

/**
 * The entry page this sign-up came from, or `''` (E3).
 *
 * **Composed from one path segment, never taken as a destination.** The link
 * that brings an entrant here carries a slug, not a URL, so there is no
 * free-form `next` for a crafted link to smuggle in; the slug is
 * percent-encoded and the result is then matched against `safeNext` — the
 * same allowlist `login.tsx` validates its own `next` with, and the
 * byte-identical twin of `_SAFE_NEXT`, which `next_target` applies again when
 * the form posts. Anything that is not slug-shaped stops being a path this
 * tier owns and falls back, so the destination cannot carry an
 * attacker-chosen value — the property the hard-coded constant existed for.
 *
 * It is derived in the COMPONENT, from route params, so the loader keeps its
 * zero-arity signature: the cheapest possible proof that no email address can
 * reach it, and the control `tests/signup.test.ts` pins.
 */
function entryPathFor(slug: string | undefined): string {
  return slug ? safeNext(`/e/${encodeURIComponent(slug)}/enter`, '') : '';
}

export default function SignupPage({ loaderData, params }: Route.ComponentProps) {
  const { turnstileSiteKey, formCsrf } = loaderData;
  // Both suffixes are literals from this file, appended to an already
  // validated path, so composing them cannot invalidate it.
  const entryPath = entryPathFor(params.slug);
  const next = entryPath === '' ? ACCOUNT_READY_PAGE : `${entryPath}/created`;
  const signInHref =
    entryPath === '' ? '/e/login' : `/e/login?next=${entryPath}/signed-in`;

  return (
    // E1: the page system, not a bare column. Brief §4 — "auth pages as small
    // centered cards" — the same shape `login.tsx` wears, so the two pages a
    // visitor bounces between read as one place.
    <PlayShell>
      <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
        <header className="grid gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Create an entrant account
          </h1>
          <p className="text-sm text-muted-foreground">
            One account enters you into any tournament on this site. The
            organiser sees your name and contact details on the entries they
            receive.
          </p>
        </header>

        {/* The one thing on this page that does not work without script, said
            before the entrant spends five minutes filling the form in. The
            backend refuses an empty challenge token with no round trip
            (`services/turnstile.verify_turnstile`), so a scriptless submission
            is refused as "the human check did not pass" — which reads as an
            accusation rather than as a missing capability. */}
        <Notice tone="info">
          The human check on this form needs JavaScript. With scripting turned
          off, everything below still fills in and submits, but the check cannot
          run — ask the organiser to set your account up instead.
        </Notice>

        <div className="grid gap-6 rounded-lg border border-rule-soft bg-surface-raised p-6 shadow-sm">
          {/*
            Posts ACROSS the tier boundary, not to this page's own URL: all of
            `/e/account/*` is FastAPI's (R8-A), and this page is node's, which
            is why the two URLs differ. `encType` is omitted — urlencoded is
            the HTML default for `method=post`.
            A plain `<form>`, never React Router's `<Form>`, so RR7 never
            intercepts and a hydrated browser posts exactly as a scriptless one
            does — one submission path, not two that can drift.

            The answer is a 303 to `/e/account/login` (Task 20) on BOTH
            branches: account created and account already present are
            indistinguishable by status, body and target alike. Nothing on this
            page is allowed to become the distinction the backend refuses to
            be.
          */}
          <form method="post" action="/e/account/signup" className="grid gap-4">
            {/* Channel two. There is no session on this page — obtaining one
                is what it is for — so the proof-of-intent is the `sw_play_csrf`
                nonce set on this very response, and this is its digest. The
                NAME comes from `FORM_FIELD` rather than a literal, so the
                cross-tier pin against `app/form_csrf.FORM_FIELD` is
                load-bearing. */}
            <input type="hidden" name={FORM_FIELD} value={formCsrf} />
            {/* Where the 303 goes. Without it the backend falls back to
                `/e/account/login` (`api/entrants.py:466`), which is POST-only —
                so a successful signup ended on a 405. A node-owned GET, and
                one that carries no per-visitor information, so it cannot
                become the distinction the uniform 202/303 exists to avoid.

                **`/created`, not bare `/e/login` (E3).** Both are this same
                login page; the suffix is the one signal node gets that a
                sign-up completed, because the backend redirects here on
                success and answers 401/422 without redirecting otherwise.
                Landing on the bare page said nothing, so a completed sign-up
                and a silently failed one rendered the same document.

                **And now the tournament, when there is one (E3).** The value
                is composed above from a route param and validated against
                `safeNext`; without one it is still the constant. Either way
                it names a node-owned GET, which is what keeps the 303 off a
                405 — `tests/signup.test.ts` derives that from the route
                table rather than listing the URL. */}
            <input type="hidden" name="next" value={next} />

            <TextField
              id="signup-email"
              label="Email"
              name="email"
              type="email"
              required
              maxLength={320}
              autoComplete="email"
              hint="Sign-in address, and where the organiser replies."
            />

            <TextField
              id="signup-password"
              label="Password"
              name="password"
              type="password"
              required
              // Stated before submission rather than discovered on refusal.
              // `services/auth.validate_password` is the authority
              // (`settings.password_min_length`, 8); this is the client-side
              // echo of it and the server decides either way, so a drift is a
              // form that asks for the wrong thing, never one that lets the
              // wrong thing in.
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              hint="At least 8 characters. Very common passwords are refused."
              // Deleted for the reason spelled out in `login.tsx`: `TextField`'s
              // default "Show password" toggle is a `<button type="button">`
              // with an `onClick`, and this tier ships no client JS, so it was
              // inert.
              revealable={false}
            />

            <TextField
              id="signup-name"
              label="Your name (optional)"
              name="displayName"
              maxLength={200}
              autoComplete="name"
              hint="How the organiser sees you on an entry."
            />

            <TextField
              id="signup-phone"
              label="Phone (optional)"
              name="phone"
              type="tel"
              maxLength={200}
              autoComplete="tel"
              hint="Only used if the organiser needs to reach you about an entry."
            />

            {/* Cloudflare's widget writes its solution into a hidden input
                named `cf-turnstile-response`, which `_payload` maps onto the
                JSON surface's `turnstileToken` — one spelling of one field, in
                one codebase (`api/entrants.py`). The sitekey comes from the
                backend's own config so it cannot drift from the secret it is
                paired with. */}
            <div
              className="cf-turnstile"
              data-sitekey={turnstileSiteKey}
              data-action="signup"
            />
            <script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              async
              defer
            />

            <Button type="submit" className="justify-self-start">
              Create account
            </Button>
          </form>

          <p className="border-t border-rule-soft pt-4 text-sm text-muted-foreground">
            {/* The other half of Task 20's wiring: the two account pages point
                at each other, and both targets are node-owned GETs.
                `/e/account/login` is FastAPI's POST — an `<a href>` to it is a
                405, which is what R8-E removed from the entry page.
                `tests/login.test.ts` reads every href in this document and
                fails on any under a backend prefix. */}
            Already have an account?{' '}
            <a className="text-accent underline underline-offset-4" href={signInHref}>
              Sign in
            </a>
            .
          </p>
        </div>
      </main>
    </PlayShell>
  );
}

/**
 * Renders refusals as copy, never as upstream prose — `entry.tsx`'s boundary,
 * for the same reason: `ApiError` constructs its own message, but a boundary
 * that rendered `error.message` would be one edit away from putting a stack
 * frame or an internal hostname on a public page.
 *
 * One branch, unlike `entry.tsx`'s two: nothing here can throw an
 * `ErrorResponse`. The only throw path is `apiGet`, which throws a plain
 * `ApiError`; `entry.tsx` converts a 404 of those into `notFound()`, which is
 * what makes a `isRouteErrorResponse` branch live THERE. This route has no
 * slug to be missing, so it has no such conversion and no such branch.
 */
export function ErrorBoundary() {
  return <MessagePage heading="Something went wrong" body="Please try again in a moment." />;
}
