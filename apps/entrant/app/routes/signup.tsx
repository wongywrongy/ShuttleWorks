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
 * docstring). This tier must not reintroduce the distinction, so this route
 * reads no address and no reason at all — a `?email=` prefill is inert here.
 * `tests/signup.test.ts` compares the rendered documents for a fresh and an
 * already-registered address byte for byte.
 *
 * A submission the PASSWORD POLICY refuses is a different thing, decided
 * before the account is ever looked up, and it is handled by a different
 * module: `routes/signupFailed.tsx` (B-1). The view both render is
 * `components/SignupPage.tsx`; sharing the view rather than the module is
 * what lets that route have the `action` a 307 re-post needs while this one
 * keeps none.
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
import { brandedTitle } from '@scheduler/brand';
import { data } from 'react-router';

import { MessagePage } from '../components/MessagePage';
import { SignupPage } from '../components/SignupPage';
import { mintFormCsrf } from '../lib/formCsrf.server';
import { signupPageData, type SignupLoaderData } from '../lib/signupPage.server';
import type { Route } from './+types/signup';

export type { SignupLoaderData };

/**
 * Reads the request for its URL's `next`, and for nothing that names a
 * person.
 *
 * `readReason: false` is the other half: this route does not accept the
 * failure vocabulary either, so neither an address nor a refusal code can be
 * put on this page by whoever wrote the link. A loader that read one here
 * would be the way this tier reintroduced the distinction the backend pays
 * an Argon2 hash to avoid, and it would have to be added on this line —
 * a visible, reviewable act rather than a quiet one.
 */
export async function loader({ request }: { request: Request }) {
  const csrf = mintFormCsrf();
  const payload = await signupPageData(request, csrf.token, { readReason: false });
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
 * Document title (2026-08-11 design audit, finding #4, deferred half — see
 * `root.tsx`). Zero-arg, same shape as `discovery.tsx`'s: nothing
 * loader-derived is worth titling with, and `SignupLoaderData` carries
 * `formCsrf`, which has no business being in reach of a function that renders
 * into `<head>`.
 */
export const meta: Route.MetaFunction = () => [
  { title: brandedTitle('Create an account') },
];

export default function Signup({ loaderData }: Route.ComponentProps) {
  return <SignupPage {...loaderData} />;
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
