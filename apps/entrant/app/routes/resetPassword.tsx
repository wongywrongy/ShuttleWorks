/**
 * The password-reset pages (E2, program Phase 7) — five paths, one module.
 *
 * `/e/forgot` asks for an address · `/e/reset?token=` sets a new password ·
 * `/e/reset/sent`, `/e/reset/done`, `/e/reset/failed` are the three outcomes
 * the backend's 303 lands on. One module because they are one flow and share
 * one chrome; five paths because each is a distinct thing to say, and because
 * a path carries no attacker-chosen value the way a `?status=` would
 * (`login.tsx`'s argument, unchanged).
 *
 * **`/e/reset/sent` is the non-enumeration surface and its copy is
 * load-bearing.** `POST /e/account/request-password-reset` answers 202 and
 * redirects here whether or not the address is registered — R10 extends the
 * rule to reset explicitly — so this page must state what *would* happen and
 * never confirm that it did. "If that address has an account" is the whole
 * sentence, and rewriting it to "We've sent you an email" would undo, in
 * copy, a property the backend pays a throttle charge to keep.
 *
 * Same posture as the other account pages: posts straight to FastAPI across
 * the tier boundary (R8-A), no `action` export, no session read (R8-D), the
 * `sw_play_csrf` nonce as the proof of intent because there is no session to
 * derive one from — which on these pages is the point, not a limitation.
 */
import { Button, Notice, TextField } from '@scheduler/design-system/components';
import { brandedTitle } from '@scheduler/brand';
import { data } from 'react-router';

import { PlayShell } from '../components/PlayShell';
import { FORM_FIELD } from '../lib/formField';
import { mintFormCsrf } from '../lib/formCsrf.server';
import { safeNext } from '../lib/nextTarget';
import { CARD, PAGE_TITLE } from '../lib/ui';
import type { Route } from './+types/resetPassword';

const SENT_SUFFIX = '/sent';
const DONE_SUFFIX = '/done';
const FAILED_SUFFIX = '/failed';
const PASSWORD_FAILED_SUFFIX = '/password-failed';

/** See `verify.tsx` — same clamp, same reason. */
const MAX_TOKEN = 200;

/** Which of the five this request matched. A closed set, so the component
 * renders one branch and never has to reason about combinations. */
type ResetView = 'request' | 'set' | 'sent' | 'done' | 'failed' | 'password-failed';

export interface ResetLoaderData {
  formCsrf: string;
  view: ResetView;
  token: string;
  next: string;
  /** `sent` view only: the configured reset-link TTL, carried on the
   * backend's redirect query (`?ttlMinutes=`) — same value on every
   * request regardless of whether the address has an account, so reading
   * it here does not reopen the enumeration question. `null` when absent
   * or unparseable; the page omits the duration sentence rather than guess. */
  ttlMinutes: number | null;
}

/** "60" -> "1 hour", "90" -> "90 minutes", "120" -> "2 hours". */
function formatTtl(minutes: number): string {
  if (minutes > 0 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export async function loader({ request }: { request: Request }) {
  const csrf = mintFormCsrf();
  const url = new URL(request.url);
  const raw = url.searchParams.get('token') ?? '';
  const token = raw.length > MAX_TOKEN ? '' : raw;

  let view: ResetView;
  if (url.pathname.endsWith(PASSWORD_FAILED_SUFFIX)) view = 'password-failed';
  else if (url.pathname.endsWith(SENT_SUFFIX)) view = 'sent';
  else if (url.pathname.endsWith(DONE_SUFFIX)) view = 'done';
  else if (url.pathname.endsWith(FAILED_SUFFIX)) view = 'failed';
  else if (url.pathname.endsWith('/forgot')) view = 'request';
  // `/e/reset` with no token is not a form we can post — fall back to asking
  // for the address, which is the step that produces a usable link.
  else view = token ? 'set' : 'request';

  const rawTtl = Number(url.searchParams.get('ttlMinutes'));
  const ttlMinutes = Number.isFinite(rawTtl) && rawTtl > 0 ? Math.round(rawTtl) : null;

  const payload: ResetLoaderData = {
    formCsrf: csrf.token,
    view,
    token,
    next: safeNext(url.searchParams.get('next'), ''),
    ttlMinutes,
  };
  return data(payload, csrf.responseInit);
}

export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

export const meta: Route.MetaFunction = () => [
  { title: brandedTitle('Reset your password') },
];

const FORM_CARD = `grid gap-4 ${CARD}`;

export default function ResetPasswordPage({ loaderData }: Route.ComponentProps) {
  const { formCsrf, view, token, next, ttlMinutes } = loaderData;

  return (
    <PlayShell>
      <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
        <header className="grid gap-1">
          <h1 className={PAGE_TITLE}>
            {view === 'done'
              ? 'Password updated'
              : view === 'set' || view === 'password-failed'
              ? 'Choose a new password'
              : 'Reset your password'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {view === 'done'
              ? "You've been signed out everywhere else, on every device."
              : view === 'set' || view === 'password-failed'
              ? 'This signs you out everywhere else, on every device.'
              : 'We will email you a link that lets you set a new one.'}
          </p>
        </header>

        {view === 'request' ? (
          <div className={FORM_CARD}>
            <form
              method="post"
              action="/e/account/request-password-reset"
              className="grid gap-4"
            >
              <input type="hidden" name={FORM_FIELD} value={formCsrf} />
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <TextField
                id="reset-email"
                label="Email"
                name="email"
                type="email"
                required
                maxLength={320}
                autoComplete="email"
              />
              <Button type="submit" size="lg" className="justify-self-start">
                Send reset link
              </Button>
            </form>
            <p className="border-t border-rule-soft pt-4 text-sm text-muted-foreground">
              <a className="text-accent underline underline-offset-4" href="/e/login">
                Back to sign in
              </a>
            </p>
          </div>
        ) : null}

        {view === 'sent' ? (
          <div className={FORM_CARD}>
            {/* The conditional is the point — see the module note. */}
            <Notice tone="info">
              If an account uses this email, we&apos;ve sent a password reset
              link.{ttlMinutes ? ` It expires in ${formatTtl(ttlMinutes)}.` : ''}{' '}
              Check your spam folder if it doesn&apos;t arrive.
            </Notice>
            <Button asChild variant="outline" className="justify-self-start">
              <a href={next ? `/e/login?next=${encodeURIComponent(next)}` : '/e/login'}>
                Back to sign in
              </a>
            </Button>
          </div>
        ) : null}

        {view === 'set' || view === 'password-failed' ? (
          <div className={FORM_CARD}>
            {/* V3-PE34.1: the reset link is still valid regardless of which
                field failed, so that reassurance stays at the top; the
                specific rejection moves onto the field itself (below) rather
                than repeating the general requirements a second time. */}
            {view === 'password-failed' ? (
              <Notice tone="warning">Your reset link is still valid. Fix the password below and try again.</Notice>
            ) : null}
            <form method="post" action="/e/account/reset-password" className="grid gap-4">
              <input type="hidden" name={FORM_FIELD} value={formCsrf} />
              <input type="hidden" name="token" value={token} />
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <TextField
                id="reset-password"
                label="New password"
                name="newPassword"
                type="password"
                required
                // The floor the server enforces, stated where it is typed —
                // a length refusal after the round trip is a worse way to
                // learn a rule that is not a secret. (The sign-IN box carries
                // no minLength, for the opposite reason: there the rule would
                // describe stored secrets.)
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                // Persistent requirements helper (V3-PE34.1): visible before
                // any submission, not only discoverable by triggering the
                // error. `TextField` swaps this for `error` below while one
                // is present, and restores it once the field is corrected —
                // the same requirements are visible on both sides of a
                // failed submission.
                hint="At least 8 characters. Avoid common passwords."
                // The specific rejection, beside the field it belongs to
                // (`aria-describedby`, wired by `TextField`) rather than only
                // in a banner above the whole form.
                error={
                  view === 'password-failed'
                    ? 'That password is too common or too short.'
                    : undefined
                }
                // No reveal toggle: this SSR-first route does not load a
                // password-control module. Same call as `login.tsx`.
                revealable={false}
              />
              <Button type="submit" size="lg" className="justify-self-start">
                Set new password
              </Button>
            </form>
          </div>
        ) : null}

        {/* V3-PE32.1: one success statement (the heading), one session
            consequence (the subheading above), one next action. The prior
            copy repeated "signed out" and the sign-in instruction across the
            heading, the subheading and a second success notice. */}
        {view === 'done' ? (
          <div className={FORM_CARD}>
            <Button asChild size="lg" className="justify-self-start">
              <a href={next ? `/e/login?next=${encodeURIComponent(next)}` : '/e/login'}>
                {next ? 'Sign in and continue' : 'Sign in'}
              </a>
            </Button>
          </div>
        ) : null}

        {view === 'failed' ? (
          <div className={FORM_CARD}>
            {/* Expired, used and never-valid are one message, for the reason
                `verify.tsx` gives. Asking again is the fix in all three. */}
            <Notice tone="warning">
              This reset link is invalid or has expired. Your password
              hasn&apos;t changed.
            </Notice>
            <Button asChild variant="outline" className="justify-self-start">
              <a href={next ? `/e/forgot?next=${encodeURIComponent(next)}` : '/e/forgot'}>
                Request a new reset link
              </a>
            </Button>
          </div>
        ) : null}
      </main>
    </PlayShell>
  );
}
