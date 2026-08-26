/**
 * The pre-session double-submit nonce, minted by node (ruling R8-D).
 *
 * **Why this exists at all.** Node renders and never relays credentials:
 * `apiFetch.server.ts` sends a frozen `accept`-only allowlist, so its
 * `GET /e/api/page/{slug}` is *always anonymous*. `_optional_entrant`
 * (`api/entries_public.py:1053-1055`) reads a cookie node never sends, so the
 * projection's `viewer.signedIn` is always `false` and `viewer.formCsrf` is
 * always `""` — for a signed-in entrant exactly as much as for a stranger.
 * Rendering `_csrf` from the projection therefore rendered the empty string,
 * which `secrets.compare_digest` can never match, so every unhydrated post
 * would have been refused before its route ran.
 *
 * The fix keeps the no-relay rule intact rather than bending it: node mints a
 * **nonce of its own**, sets it as `sw_play_csrf` on the SSR document
 * response, and renders the digest of that nonce. The nonce names no
 * principal and grants no access, so node still never reads or forwards a
 * credential — it hands an anonymous visitor a random number and asks for it
 * back. The backend already accepts this: `require_form_csrf`
 * (`api/entries_json.py`) and `form_csrf_proves` (`app/form_csrf.py`) both
 * enumerate `PLAY_CSRF_COOKIE` as a second candidate secret, and
 * `settings.csrf_relevant_cookie_names` already carries it. **No backend
 * change was needed to make this work.**
 *
 * **This module reads nothing.** `mintFormCsrf` takes no arguments — it is
 * structurally incapable of relaying an inbound credential, which is why it,
 * like `apiFetch.server.ts`, is exempt from the route-tier relay guard and
 * carries its own dedicated coverage in `tests/formCsrf.server.test.ts`
 * instead. That exemption is asserted, not assumed: the test pins
 * `mintFormCsrf.length === 0`.
 *
 * **Drift with the Python derivation is the one real hazard here** and it is
 * pinned in two directions, because this is a second implementation of a
 * security primitive:
 *   - `tests/backend/unit/test_form_csrf_cross_tier.py` reads THIS
 *     FILE, extracts every constant below, and asserts each equals its
 *     `apps/api/src/core/form_csrf.py` counterpart — then recomputes the golden
 *     digests through the extracted prefix. Change the prefix on either side
 *     and it goes red.
 *   - `tests/formCsrf.server.test.ts` asserts this derivation's output against
 *     the same golden hex `tests/backend/unit/test_form_csrf.py`
 *     pins for the same inputs, so an algorithm change here (sha1, hex→base64,
 *     a dropped encoding) is red on the node side too.
 */
import { createHash, randomBytes } from 'node:crypto';

/**
 * Domain separator. **Byte-identical to `_FORM_CSRF_PREFIX` in
 * `apps/api/src/core/form_csrf.py`**, and held there by the cross-tier test above.
 * Changing it invalidates every form a browser currently holds.
 */
const FORM_CSRF_PREFIX = 'sw-play-form-csrf:';

/**
 * The hidden input's name — `app/form_csrf.FORM_FIELD`. Declared in
 * `./formField` and re-exported here so this module still reads as the one
 * place the form-CSRF vocabulary lives; the declaration had to move because
 * the rendered component needs it and cannot import a `.server` module. See
 * that file for the argument.
 */
export { FORM_FIELD } from './formField';

/** The pre-session nonce cookie — `app/form_csrf.PLAY_CSRF_COOKIE`. */
export const PLAY_CSRF_COOKIE = 'sw_play_csrf';

/**
 * How long an unsubmitted form stays valid, in seconds. Four hours, matching
 * the Python constant this replaced: long enough to be interrupted mid-form
 * and come back, short enough that a nonce left in a shared club laptop is
 * not reusable all week.
 */
const PLAY_CSRF_MAX_AGE = 60 * 60 * 4;

/** Bytes of entropy behind the nonce. 32 → 43 base64url characters, which is
 * exactly what Python's `secrets.token_urlsafe(32)` produced. */
const PLAY_CSRF_BYTES = 32;

/**
 * The hidden-field token derived from `secret`.
 *
 * Returns `""` when there is no secret, and callers must treat that as "no
 * proof is available" and never as a token to compare against — an empty
 * expected value matching an empty presented one is an open door for exactly
 * the anonymous caller this defends against. The backend's
 * `form_csrf_token` has the same guard for the same reason.
 */
export function formCsrfToken(secret: string): string {
  if (!secret) return '';
  return createHash('sha256')
    .update(FORM_CSRF_PREFIX + secret, 'utf8')
    .digest('hex');
}

/**
 * Whether the nonce cookie is issued with `Secure`.
 *
 * Reads the SAME environment variable name the backend's
 * `SESSION_COOKIE_SECURE` uses, and defaults to the same `false`, so the two
 * tiers on one origin are configured by one knob rather than by two that can
 * disagree. Defaulting to `true` instead would be the worse failure: over
 * plain HTTP the browser would silently drop the cookie and every post would
 * be refused with "this form has expired", which reads as a bug rather than
 * as a misconfiguration.
 */
function cookieSecure(): boolean {
  return (process.env.SESSION_COOKIE_SECURE ?? '').toLowerCase() === 'true';
}

export interface MintedFormCsrf {
  /** The digest to render into the form's `_csrf` field. */
  token: string;
  /**
   * `ResponseInit` carrying the `Set-Cookie` **and** the `Cache-Control` for
   * the SSR document. Both, together, because they are one fact.
   */
  responseInit: { headers: Record<string, string> };
}

/**
 * Mint a fresh nonce and return both halves: the token for the form, and the
 * `Set-Cookie` for the document response.
 *
 * **Takes no arguments, deliberately** — see the module docstring. There is no
 * parameter through which an inbound cookie could reach this function.
 *
 * `HttpOnly` is the load-bearing flag: the whole double-submit argument is
 * that a cross-site page can make the browser *send* this cookie but can never
 * *read* it. `SameSite=Lax` and `Path=/` match the Python issuance this
 * replaced, which means **last issuance wins for the whole origin**: open the
 * entry page in a second tab and the first tab's embedded token no longer
 * matches the cookie, so submitting that first tab is refused with "This form
 * has expired. Reload the entry page and try again." That is an inherited,
 * argued decision, not an oversight — keeping several nonces alive at once is
 * a server-side token store in everything but name, which is the property this
 * design exists to avoid. The failure is loud, recoverable in one action, and
 * says what to do.
 *
 * **`Cache-Control: no-store` rides with the cookie, and belongs to the mint
 * rather than to the route.** A document carrying both halves of a
 * double-submit — the `Set-Cookie` nonce and the matching digest in its body —
 * is a per-visitor secret in HTML clothing. Any shared cache that stores it
 * (nginx `proxy_cache`, a corporate proxy, a CDN rule on `/e/*`) replays one
 * visitor's nonce *and its matching token* to the next, which collapses the
 * whole scheme to a value an attacker obtains by fetching the public entry
 * page. The page this replaced set it explicitly for exactly this reason
 * (`api/entries_public.py:405`, "a cached copy is a wrong copy"); moving the
 * render to node is what dropped it. Emitting it here means every future
 * caller of the mint gets it without having to remember.
 */
export function mintFormCsrf(): MintedFormCsrf {
  const nonce = randomBytes(PLAY_CSRF_BYTES).toString('base64url');
  const attributes = [
    `${PLAY_CSRF_COOKIE}=${nonce}`,
    `Max-Age=${PLAY_CSRF_MAX_AGE}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (cookieSecure()) attributes.push('Secure');

  return {
    token: formCsrfToken(nonce),
    responseInit: {
      headers: {
        'Set-Cookie': attributes.join('; '),
        'Cache-Control': 'no-store',
      },
    },
  };
}
