/**
 * `GET /e/verify` — the page a confirmation link opens (E2, program Phase 7).
 *
 * **The link is a GET and the confirmation is a POST, and that gap is the
 * whole design of this file.** A verification URL that flipped the flag on
 * GET would be consumed by every mail scanner, link-preview bot and
 * prefetching client between us and the entrant — who would then click a
 * link that had already been spent and be told it was invalid, with no way
 * to tell that from an attack. So the mail links here, this page renders the
 * token into a one-button form, and `POST /e/account/verify` does the work.
 * One human action, one consumption.
 *
 * Three paths, one module, on `login.tsx`'s precedent: the bare page, and the
 * two outcomes the backend's 303 lands on. The outcome is a PATH rather than
 * a `?status=` for the same reason the sign-in refusal is — a query field is
 * something an attacker can set and this page would then render.
 *
 * **The failed page says nothing about why.** Expired, already used, and
 * never valid are one message, because a page that distinguished them would
 * confirm to somebody holding a forwarded link that it had once been real.
 * `consume_verification_token` returns `None` for all three and offers the
 * route no way to ask which.
 *
 * No session is read here — no page on this tier can (R8-D) — so the token in
 * the URL is the only thing this page knows, and it is carried straight back
 * out in a hidden field without ever being interpreted.
 */
import { Button, Notice } from '@scheduler/design-system/components';
import { data } from 'react-router';
import { useContext } from 'react';

import { PlayShell } from '../components/PlayShell';
import { FORM_FIELD } from '../lib/formField';
import { mintFormCsrf } from '../lib/formCsrf.server';
import { EntrantSessionContext } from '../lib/sessionContext';
import type { Route } from './+types/verify';
import { CARD } from '../lib/ui';

/** Suffixes of the two outcome paths bound to this module (`app/routes.ts`). */
const DONE_SUFFIX = '/done';
const FAILED_SUFFIX = '/failed';
const SENT_SUFFIX = '/sent';

/**
 * Upper bound on the token we will echo back into a form.
 *
 * The real token is 43 base64url characters (`secrets.token_urlsafe(32)`) and
 * the backend's `Name` bound refuses anything long anyway. Clamping here as
 * well keeps a hand-crafted multi-kilobyte `?token=` out of the rendered
 * document — it would be refused on post, but it would have been *rendered*
 * first, and a page that will paste any length of attacker text into its own
 * HTML is one escaping bug away from being a problem.
 */
const MAX_TOKEN = 200;

export interface VerifyLoaderData {
  formCsrf: string;
  /** Verbatim from the query, length-clamped. Never parsed, never decoded. */
  token: string;
  verified: boolean;
  failed: boolean;
  sent: boolean;
}

export async function loader({ request }: { request: Request }) {
  const csrf = mintFormCsrf();
  const url = new URL(request.url);
  const raw = url.searchParams.get('token') ?? '';
  const payload: VerifyLoaderData = {
    formCsrf: csrf.token,
    token: raw.length > MAX_TOKEN ? '' : raw,
    verified: url.pathname.endsWith(DONE_SUFFIX),
    failed: url.pathname.endsWith(FAILED_SUFFIX),
    sent: url.pathname.endsWith(SENT_SUFFIX),
  };
  return data(payload, csrf.responseInit);
}

/** Forward `Cache-Control: no-store` with the nonce — see `login.tsx`. */
export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

export const meta: Route.MetaFunction = () => [
  { title: 'Confirm your email · ShuttleWorks Tournaments' },
];

export default function VerifyPage({ loaderData }: Route.ComponentProps) {
  const { formCsrf, token, verified, failed, sent } = loaderData;
  const signedIn = useContext(EntrantSessionContext);

  return (
    <PlayShell>
      <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10 md:py-14">
        <header className="grid gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Confirm your email
          </h1>
          <p className="text-sm text-muted-foreground">
            Organizers accept entries from confirmed addresses. This is a
            one-time step for your account, not for each tournament.
          </p>
        </header>

        {verified ? (
          <div className={`grid gap-4 ${CARD}`}>
            <Notice tone="success">
              Your email address is confirmed. Any entries you already sent are
              now with the organizer.
            </Notice>
            <Button asChild className="justify-self-start">
              <a href="/e/me/entries">See my entries</a>
            </Button>
          </div>
        ) : null}

        {failed ? (
          /* One message for expired, already-used and never-valid — see the
             module note. "Ask for a new one" is the action, and it works in
             every one of those cases, which is why no diagnosis is owed. */
          <div className={`grid gap-4 ${CARD}`}>
            <Notice tone="warning">
              That confirmation link is no longer usable. Your saved entries
              are unchanged, and a fresh link will replace this one.
            </Notice>
            {signedIn ? (
              <form method="post" action="/e/account/resend-verification">
                <input type="hidden" name={FORM_FIELD} value={formCsrf} />
                <Button type="submit">Send a new confirmation email</Button>
              </form>
            ) : (
              <Button asChild variant="outline" className="justify-self-start">
                <a href="/e/login?next=/e/verify/failed">Sign in to request a new link</a>
              </Button>
            )}
          </div>
        ) : null}

        {sent ? (
          <div className={`grid gap-4 ${CARD}`}>
            <Notice tone="success">
              A fresh confirmation link has been sent to your account email.
              Open the newest message; your saved entries are unchanged.
            </Notice>
            <p className="text-sm text-muted-foreground">
              Delivery can take a few minutes. Check spam or junk mail before
              requesting another link.
            </p>
            <Button asChild variant="outline" className="justify-self-start">
              <a href="/e/me/entries">See my entries</a>
            </Button>
          </div>
        ) : null}

        {!verified && !failed && !sent ? (
          <div className={`grid gap-4 ${CARD}`}>
            {token ? (
              <form method="post" action="/e/account/verify" className="grid gap-4">
                <input type="hidden" name={FORM_FIELD} value={formCsrf} />
                <input type="hidden" name="token" value={token} />
                <p className="text-sm text-muted-foreground">
                  Press the button to confirm this address.
                </p>
                <Button type="submit" className="justify-self-start">
                  Confirm my email
                </Button>
              </form>
            ) : (
              /* Reached by typing the URL, or by a link that lost its query
                 in a mail client's rewriting. Not an error state — nothing
                 was attempted — so it reads as instructions. */
              <p className="text-sm text-muted-foreground">
                Open the confirmation link from the email we sent you. If you
                cannot find it,{' '}
                <a className="text-accent underline underline-offset-4" href="/e/login">
                  sign in
                </a>{' '}
                and ask for a new one.
              </p>
            )}
          </div>
        ) : null}
      </main>
    </PlayShell>
  );
}
