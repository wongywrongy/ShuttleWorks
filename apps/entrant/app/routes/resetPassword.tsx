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
import { CARD } from '../lib/ui';
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

  const payload: ResetLoaderData = {
    formCsrf: csrf.token,
    view,
    token,
    next: safeNext(url.searchParams.get('next'), ''),
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
  const { formCsrf, view, token, next } = loaderData;

  return (
    <PlayShell>
      <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
        <header className="grid gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {view === 'set' || view === 'password-failed'
              ? 'Choose a new password'
              : 'Reset your password'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {view === 'set' || view === 'password-failed'
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
              <Button type="submit" className="justify-self-start">
                Email me a link
              </Button>
            </form>
            <p className="border-t border-rule-soft pt-4 text-sm text-muted-foreground">
              Remembered it?{' '}
              <a className="text-accent underline underline-offset-4" href="/e/login">
                Sign in
              </a>
              .
            </p>
          </div>
        ) : null}

        {view === 'sent' ? (
          <div className={FORM_CARD}>
            {/* The conditional is the point — see the module note. */}
            <Notice tone="info">
              If that address has an account, a reset link is on its way. It is
              good for one hour. Check the spam folder before asking again.
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
            {view === 'password-failed' ? (
              <Notice tone="warning">
                That password does not meet the requirements. Choose at least
                eight characters and avoid very common passwords. Your reset
                link is still valid.
              </Notice>
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
                // No reveal toggle: this SSR-first route does not load a
                // password-control module. Same call as `login.tsx`.
                revealable={false}
              />
              <Button type="submit" className="justify-self-start">
                Set new password
              </Button>
            </form>
          </div>
        ) : null}

        {view === 'done' ? (
          <div className={FORM_CARD}>
            <Notice tone="success">
              Your password is set. You have been signed out everywhere else.
              Sign in again with the new one.
            </Notice>
            <Button asChild className="justify-self-start">
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
              That reset link is no longer usable. Ask for a fresh link and try
              again; no password was changed.
            </Notice>
            <Button asChild variant="outline" className="justify-self-start">
              <a href={next ? `/e/forgot?next=${encodeURIComponent(next)}` : '/e/forgot'}>
                Email me a new link
              </a>
            </Button>
          </div>
        ) : null}
      </main>
    </PlayShell>
  );
}
