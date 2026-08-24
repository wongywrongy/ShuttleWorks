/**
 * Does this request carry an entrant session? A boolean, and nothing else.
 *
 * SP-P7 §3.8 needs the public header to render two exclusive states — `Sign in`
 * for a stranger, `My entries` for someone signed in. Before this, `PlayShell`
 * rendered BOTH links to everyone and said why in a comment: ruling **R8-D**,
 * node never relays credentials, so no server-rendered page can know who is
 * reading it. That reasoning is sound about *identity* and was over-applied to
 * *presence*.
 *
 * The distinction this module rests on:
 *
 * - **Relaying** a credential means sending it onward, where it authenticates
 *   somebody. That is what R8-D forbids and what `apiFetch.server.ts` makes
 *   structurally impossible (`OUTBOUND_HEADERS` is a frozen `accept`-only
 *   allowlist).
 * - **Observing** that a named cookie exists means asking one yes/no question
 *   of the request this process is already holding. Nothing leaves. Nothing is
 *   authenticated. The answer is one bit.
 *
 * So the return type is the guarantee. `boolean` cannot carry a token, cannot
 * be forwarded into a header, and cannot become an identity by accident — the
 * failure mode a `string | null` here would eventually invite. The cookie's
 * VALUE is never read, never returned, never logged. `sourceGuards.ts` names a
 * helper of exactly this shape as its known blind spot ("a new helper that
 * wraps `request.headers.get('cookie')` needs its own coverage"), which is why
 * `tests/session.server.test.ts` exists and scans this file directly.
 *
 * What this deliberately does NOT do: validate the session. A cookie that is
 * expired, revoked or forged reads as present here, so a stale cookie shows
 * signed-in chrome until the visitor clicks through to `/e/me/entries`, which
 * 401s and redirects to sign-in exactly as it does today. Validating would mean
 * a credentialed call to the API — the relay R8-D forbids — to decide the
 * colour of a link. The header is navigation, not authorization: nothing behind
 * `My entries` is readable without the real cookie reaching FastAPI on
 * `/e/api/`, where it is checked properly.
 *
 * `viewer.signedIn` in the page projection stays `false` for everyone and is
 * untouched (`test_entrant_ssr_contract.py` pins it). Header state is
 * deliberately NOT routed through that DTO: the projection is a public,
 * cacheable document, and this bit makes a response viewer-dependent — see the
 * `Vary`/`Cache-Control` pair in `entry.server.tsx`.
 */

/**
 * The entrant session cookie, host-only on `play.<domain>` (SP-HOST-1).
 *
 * Must stay in step with `settings.entrant_session_cookie_name` on the API
 * (`apps/api/src/core/config.py`) and with the outbound Cookie allowlist in
 * `infra/nginx/http-shared.conf` — nginx only forwards the cookies it names, so
 * a rename there makes this read `false` for everybody, silently and forever.
 * Both ends are pinned by `tests/session.server.test.ts`.
 */
export const ENTRANT_SESSION_COOKIE = 'sw_play_session';

/**
 * True when a cookie named {@link ENTRANT_SESSION_COOKIE} is present.
 *
 * Matched on the cookie NAME at a boundary — start-of-string or `; ` — rather
 * than by `includes()`, which would answer true for `not_sw_play_session=x` and
 * for a value that merely contained the name.
 */
export function hasEntrantSession(request: Request): boolean {
  const header = request.headers.get('cookie');
  if (!header) return false;

  return header
    .split(';')
    .some((pair) => pair.trim().startsWith(`${ENTRANT_SESSION_COOKIE}=`));
}
