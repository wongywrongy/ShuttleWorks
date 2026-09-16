/**
 * `/e/signup/failed` — where a sign-up the password policy refused lands.
 *
 * **The defect (B-1).** A native form post is a NAVIGATION: whatever the
 * server answers IS the document. So a mistyped password on step 2 of the
 * only revenue path painted
 * `{"detail":{"code":"AUTH_WEAK_PASSWORD","message":…}}` across the whole
 * window — no title, no lang, no main, no form, and every typed field gone.
 *
 * **Why a 307 and not a 303.** `POST /e/account/signup` answers a **307** to
 * this path, so the browser RE-POSTS the same body here and the typed fields
 * survive the round trip without ever being written into a URL. That is the
 * decision `entries/entries_json.py`'s `_echo_redirect` already took for the
 * quote round trip, after a 2026-08-10 browser pass read an entrant's name
 * and club back out of the address bar: a 303 re-issues as GET, so a form
 * body can only survive it as a query string, and a query string is written
 * into the browser's history, into every nginx access log, and into any
 * intermediary's — none of which is scoped to hold an entrant's name, email
 * or phone number. The redirect this page answers to carries two
 * server-authored keys, `reason` and `next`, and no field the caller sent.
 *
 * The cost is the same one that path accepts: this is not
 * POST/redirect/GET, so reloading re-posts and the browser asks. Acceptable
 * here for the same reason — the `action` below writes nothing, so a re-post
 * is a re-render.
 *
 * **Why this is its own module rather than a second path on `signup.tsx`.**
 * A 307 lands a POST on a node route, and a node route needs an `action` to
 * answer a POST at all. `routes/signup.tsx` must NOT have one: an action
 * there would put `POST /e/account/signup`'s answer in node's hands, and
 * rendering a different page for "created" than for "already exists" would
 * then be one edit away — the absence is asserted in `tests/signup.test.ts`.
 * Splitting the module keeps that true while giving this page the action it
 * structurally requires. The view both render is `components/SignupPage.tsx`.
 *
 * **This route still learns nothing.** It is reached only on the branch that
 * runs BEFORE the account lookup — the password policy and the address
 * syntax check — so the refusal it renders says exactly as much about whether
 * the address is registered as a syntax error does: nothing. The `reason` is
 * one of four allowlisted NAMES and selects one of four fixed sentences, so a
 * crafted link can pick a sentence and can never write one.
 *
 * **The password is read by nothing here.** The re-posted body contains it —
 * that is unavoidable once the browser re-posts, and it is the same exposure
 * the quote round trip already accepts for entry data — but the action below
 * names three fields and `password` is not among them, so it is never read,
 * never echoed, never rendered, and never logged. `tests/signup.test.ts`
 * asserts this file never names it.
 */
import { brandedTitle } from '@scheduler/brand';
import { data } from 'react-router';

import { MessagePage } from '../components/MessagePage';
import { SignupPage, type SignupEcho } from '../components/SignupPage';
import { mintFormCsrf } from '../lib/formCsrf.server';
import { signupPageData } from '../lib/signupPage.server';
import type { Route } from './+types/signupFailed';

/** The cap on a value put back into a `defaultValue`, matching the field's own
 * `maxLength`, so an oversized paste cannot paint the page. */
const ECHO_LIMIT = 320;

function field(posted: URLSearchParams, name: string): string {
  return (posted.get(name) ?? '').slice(0, ECHO_LIMIT);
}

/**
 * Take the three non-secret fields out of the re-posted body.
 *
 * An explicit three, not a loop over the body: a loop would put every future
 * field on the page by default, including the next credential somebody adds
 * to this form. The privacy property is structural that way rather than a
 * denylist somebody has to keep in step.
 *
 * Returns only the echo. The CSRF mint, the sitekey and the continuation
 * stay in the loader below, which React Router runs after this — two mints
 * in one response would race their own `Set-Cookie`.
 */
export async function action({ request }: { request: Request }): Promise<{ echo: SignupEcho }> {
  const posted = new URLSearchParams(await request.text());
  return {
    echo: {
      email: field(posted, 'email'),
      displayName: field(posted, 'displayName'),
      phone: field(posted, 'phone'),
    },
  };
}

/**
 * The document's facts, including the refusal `reason` — which only this
 * route reads. Runs on the re-post (after `action`) and on a plain GET, which
 * is what someone typing or sharing this URL gets: the same page with the
 * same sentence and an empty form, because there is no body to put back.
 */
export async function loader({ request }: { request: Request }) {
  const csrf = mintFormCsrf();
  const payload = await signupPageData(request, csrf.token, { readReason: true });
  return data(payload, csrf.responseInit);
}

/**
 * Forward the loader's headers onto the document — all of them, by reference.
 * Same trap and same argument as `routes/signup.tsx`: without this export,
 * `mintFormCsrf`'s `Cache-Control: no-store` never reaches the wire and a
 * shared cache can replay one visitor's nonce and matching digest to the
 * next.
 */
export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

/** The same title as the form it is: this page is the sign-up, being retried. */
export const meta: Route.MetaFunction = () => [
  { title: brandedTitle('Create an account') },
];

export default function SignupFailed({ loaderData, actionData }: Route.ComponentProps) {
  // `actionData` exists only on the re-post. A GET renders the same page with
  // the loader's empty echo.
  return <SignupPage {...loaderData} echo={actionData?.echo ?? loaderData.echo} />;
}

/** Refusals as copy, never upstream prose — `routes/signup.tsx`'s boundary. */
export function ErrorBoundary() {
  return <MessagePage heading="Something went wrong" body="Please try again in a moment." />;
}
