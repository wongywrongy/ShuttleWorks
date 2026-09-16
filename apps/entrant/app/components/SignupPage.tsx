/**
 * The sign-up form, as one component two routes render.
 *
 * **Why it is here and not in a route.** `/e/signup` and `/e/signup/failed`
 * are the same document with one difference — whether a policy refusal is
 * being reported — but they are NOT the same module, and that separation is
 * deliberate (B-1):
 *
 *   - `routes/signup.tsx` is the page the form posts FROM, and it exports no
 *     `action`. That absence is asserted (`tests/signup.test.ts`), because an
 *     action there would put the backend's 202/303 in node's hands and
 *     rendering a different page for "created" than for "already exists"
 *     would then be one edit away.
 *   - `routes/signupFailed.tsx` is where a **307** from
 *     `POST /e/account/signup` re-posts the form, so it must have an action
 *     to render anything at all. It never learns the account's fate — the
 *     refusal it renders was decided before the account was looked up.
 *
 * Sharing the view rather than the module is what lets the second route have
 * an action without giving one to the first.
 *
 * Every string here is fixed copy. Nothing the caller supplies becomes prose:
 * `failureReason` selects one of four sentences below and can never write
 * one, and `echo` reaches `defaultValue` attributes only.
 */
import { Button, Notice, TextField } from '@scheduler/design-system/components';

import { PlayShell } from './PlayShell';
import { FORM_FIELD } from '../lib/formField';
import { CARD, EYEBROW, PAGE_TITLE } from '../lib/ui';

/** The four `AuthError` codes `POST /e/account/signup` may hand back. */
export type SignupFailureReason =
  | 'INVALID_EMAIL'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_TOO_COMMON';

/**
 * The allowlist, as a narrowing function rather than a module-scope array:
 * the route-tier guards refuse any shared mutable container at module scope
 * (`tests/enter.loader.test.ts`), and a `readonly` annotation is a
 * compile-time claim the runtime object does not carry.
 */
export function knownReason(raw: string | null): SignupFailureReason | null {
  switch (raw) {
    case 'INVALID_EMAIL':
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
    case 'PASSWORD_TOO_COMMON':
      return raw;
    default:
      return null;
  }
}

/**
 * The sentence each reason renders as. Fixed copy here, never the backend's
 * prose relayed through a query string: the URL selects which of these four
 * strings appears and nothing more.
 */
export function failureMessage(reason: SignupFailureReason): string {
  switch (reason) {
    case 'INVALID_EMAIL':
      return 'That email address does not look right. Check it and try again.';
    case 'PASSWORD_TOO_SHORT':
      return 'Use at least 8 characters.';
    case 'PASSWORD_TOO_LONG':
      return 'Use at most 128 characters.';
    case 'PASSWORD_TOO_COMMON':
      return 'That password is on the list of most commonly breached passwords. Pick another one.';
  }
}

/**
 * The non-secret fields a refused submission carried, put back so the
 * entrant does not retype them.
 *
 * There is no `password` key and there is deliberately no room for one: the
 * refused password is the field that was wrong, and re-rendering a
 * credential into an HTML attribute is not a thing this page will do.
 */
export interface SignupEcho {
  email: string;
  displayName: string;
  phone: string;
}

/** Empty on every first visit. A function, not a shared frozen object, so no
 * caller can mutate one page's echo into another's. */
export function emptyEcho(): SignupEcho {
  return { email: '', displayName: '', phone: '' };
}

export interface SignupPageProps {
  turnstileSiteKey: string;
  /** The pre-session double-submit digest, minted on this very response. */
  formCsrf: string;
  /** Validated same-tier continuation. */
  next: string;
  /** The human tournament name, when this signup was reached from one. */
  tournamentName: string | null;
  /** Which policy rule the last submission broke, or `null` on a first visit. */
  failureReason: SignupFailureReason | null;
  echo: SignupEcho;
}

/**
 * Where a completed sign-up lands when this page was reached without a
 * tournament — the login page's "your account is ready" variant.
 */
export const ACCOUNT_READY_PAGE = '/e/login/created';

export function SignupPage({
  turnstileSiteKey,
  formCsrf,
  next,
  tournamentName,
  failureReason,
  echo,
}: SignupPageProps) {
  // Which field wears the message. `INVALID_EMAIL` is the email's; the three
  // password rules are the password's. Both also appear once above the form,
  // because a native form post reloads the page and the entrant needs to see
  // that something went wrong before they reach the field.
  const emailError = failureReason === 'INVALID_EMAIL' ? failureMessage(failureReason) : undefined;
  const passwordError =
    failureReason !== null && failureReason !== 'INVALID_EMAIL'
      ? failureMessage(failureReason)
      : undefined;
  const entryPath = next.match(/^\/e\/([^/]+)\/enter(?:\/created|\/signed-in)?$/);
  const invitationPath = next.match(/^\/e\/partner\/[^/]+$/);
  const formNext = entryPath ? `/e/${entryPath[1]}/enter/created` : next;
  const signInDestination = entryPath ? `/e/${entryPath[1]}/enter/signed-in` : invitationPath ? next : next === ACCOUNT_READY_PAGE ? '' : next;
  const signInHref = signInDestination
    ? `/e/login?next=${signInDestination}`
    : '/e/login';

  return (
    // E1: the page system, not a bare column. Brief §4 — "auth pages as small
    // centered cards" — the same shape `login.tsx` wears, so the two pages a
    // visitor bounces between read as one place.
    <PlayShell>
      <main className="mx-auto grid min-w-0 w-full max-w-md gap-6 px-4 py-10 md:py-14">
        <header className="grid min-w-0 gap-1">
          <h1 className={PAGE_TITLE}>
            {entryPath
              ? `Create your account to enter ${tournamentName ?? 'this tournament'}`
              : 'Create an account'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Use one account to manage your tournament entries. Creating an
            account does not submit an entry. The organizer sees your name and
            contact details on entries they receive.
          </p>
        </header>

        {/* The refusal, in words (B-1). Before this, a password the policy
            refused answered `{"detail":{"code":"AUTH_WEAK_PASSWORD",…}}` and,
            a native form post being a navigation, that JSON WAS the document.
            The sentence is picked by `failureMessage` from a name the backend
            allowlisted; it names a rule, never an account, so it says nothing
            about whether the address is registered. */}
        {failureReason ? (
          <Notice tone="warning">
            We could not create your account. {failureMessage(failureReason)}
          </Notice>
        ) : null}

        <div className={`grid min-w-0 gap-6 ${CARD}`}>
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
            be. A submission the password policy refuses is answered instead
            by a 307 to `/e/signup/failed`, which re-posts THIS body — see
            `routes/signupFailed.tsx`.
          */}
          <form method="post" action="/e/account/signup" className="grid min-w-0 gap-4">
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

                The value is a validated node-owned GET, which keeps the 303
                off a 405. */}
            <input type="hidden" name="next" value={formNext} />

            <TextField
              id="signup-email"
              label="Email"
              name="email"
              type="email"
              required
              maxLength={320}
              autoComplete="email"
              hint="Use the email where you want entry updates."
              // Put back from the RE-POSTED BODY after a refusal (B-1), so a
              // rejected password does not cost the entrant every other
              // field. Empty on a first visit, and never the password.
              defaultValue={echo.email}
              error={emailError}
              className="min-w-0"
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
              hint="Use at least 8 characters and avoid common passwords."
              // Deleted for the reason spelled out in `login.tsx`: `TextField`'s
              // default "Show password" toggle is a `<button type="button">`
              // with an `onClick`; this form's only module is reserved for the
              // Turnstile lifecycle, so the credential reveal stays absent.
              revealable={false}
              // NO `defaultValue`. The refused password is never carried back
              // and never rendered — not from a URL, and not from the body the
              // 307 re-posts.
              error={passwordError}
              className="min-w-0"
            />

            <TextField
              id="signup-name"
              label="Your name (optional)"
              name="displayName"
              maxLength={200}
              autoComplete="name"
              hint="Name shown to the organizer."
              defaultValue={echo.displayName}
              className="min-w-0"
            />

            <TextField
              id="signup-phone"
              label="Phone (optional)"
              name="phone"
              type="tel"
              maxLength={200}
              autoComplete="tel"
              hint="Only used if the organizer needs to reach you about an entry."
              defaultValue={echo.phone}
              className="min-w-0"
            />

            {/* Cloudflare's widget writes its solution into a hidden input
                named `cf-turnstile-response`, which `_payload` maps onto the
                JSON surface's `turnstileToken` — one spelling of one field, in
                one codebase (`api/entrants.py`). The sitekey comes from the
                backend's own config so it cannot drift from the secret it is
                paired with. */}
            {/* The one thing on this page that does not work without script,
                said where the check itself sits. The backend refuses an empty
                challenge token with no round trip
                (`services/turnstile.verify_turnstile`), so a scriptless
                submission is refused as "the human check did not pass" — which
                reads as an accusation rather than as a missing capability. */}
            <div className="grid min-w-0 gap-2 rounded-sm border border-rule-control bg-surface-sunken p-3">
              <p className={EYEBROW}>Human check</p>
              <div
                id="turnstile-widget"
                className="cf-turnstile"
                data-sitekey={turnstileSiteKey}
                data-action="signup"
              />
              <p
                id="turnstile-status"
                className="text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                Loading the human check
              </p>
              <p id="turnstile-help" className="text-xs text-muted-foreground">
                The human check needs JavaScript. With scripting turned off, the
                form still fills in and submits, but the check cannot run. Ask
                the organizer to set your account up instead.
              </p>
            </div>
            <script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
              data-cfasync="false"
              async
              defer
            />
            <script type="module" src="/e/assets/turnstile.js" defer />

            <Button type="submit" size="lg" className="justify-self-start">
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
            Already have one?{' '}
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
