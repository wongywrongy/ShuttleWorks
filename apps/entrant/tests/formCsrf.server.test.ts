/**
 * The node-side half of a security primitive that now exists twice.
 *
 * Ruling R8-D moved the `sw_play_csrf` mint out of Python — where
 * `issue_play_csrf` had seven green tests and **zero production call sites**
 * — and into the React Router loader, where the pages that need it actually
 * live. Those seven properties came with it: they are asserted below against
 * the code that runs, not against a spare part.
 *
 * **The golden digests are the drift pin.** They are byte-identical to
 * `tests/backend/unit/test_form_csrf.py`'s `_GOLDEN`, which is the
 * incumbent Python derivation's captured output. That closes the loop the
 * other way from `tests/unit/test_form_csrf_cross_tier.py`: that file reads
 * THIS module's constants and recomputes these digests through them, so a
 * changed *constant* is red in pytest; this file runs the real derivation
 * against the same table, so a changed *algorithm* — sha1, base64, a dropped
 * encoding — is red in vitest even while every constant still matches.
 * Neither side can move alone, and both gates run in CI on every push.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  FORM_FIELD,
  PLAY_CSRF_COOKIE,
  formCsrfToken,
  mintFormCsrf,
} from '../app/lib/formCsrf.server';

/** Captured from the Python derivation before it had a twin. Same table as
 * `tests/unit/test_form_csrf.py::_GOLDEN`; changing one without the other is
 * what the cross-tier pytest exists to catch. */
const GOLDEN: ReadonlyArray<readonly [string, string]> = [
  ['tok-123', 'a7ce0306886041690f40c7c52244e594ceda3785f5db849bb25f7cdc36f4276e'],
  ['another-token', 'fc255256ce5cbc9b3d601d7060efbd28cf76c1edc6c12cf17072edf940b87980'],
  ['a-secret-nonce', '88498cc8b4bf91ae5536fe708e5ce8d40190759445727b249b8ce4e506ec5881'],
];

/** The `Set-Cookie` attributes, as a lowercased lookup. */
function attributes(header: string): Map<string, string> {
  return new Map(
    header.split(';').map((part) => {
      const [name, ...rest] = part.trim().split('=');
      return [name.toLowerCase(), rest.join('=')];
    }),
  );
}

function setCookie(): string {
  return mintFormCsrf().responseInit.headers['Set-Cookie'];
}

const ORIGINAL_SECURE = process.env.SESSION_COOKIE_SECURE;

afterEach(() => {
  if (ORIGINAL_SECURE === undefined) delete process.env.SESSION_COOKIE_SECURE;
  else process.env.SESSION_COOKIE_SECURE = ORIGINAL_SECURE;
});

describe('the derivation', () => {
  it('reproduces the Python digests exactly', () => {
    // If this goes red, the entrant tier is rendering a token FastAPI's
    // `secrets.compare_digest` will never match, and every unhydrated post
    // is refused with "this form has expired" — silently, with nothing
    // logged anywhere.
    for (const [secret, digest] of GOLDEN) {
      expect(formCsrfToken(secret)).toBe(digest);
    }
  });

  it('returns the empty "no proof available" value for no secret', () => {
    // Never a token to compare against: an empty expected value matching an
    // empty presented one is an open door for exactly the anonymous caller
    // this defends against. Python's `form_csrf_token` has the same guard.
    expect(formCsrfToken('')).toBe('');
  });

  it('does not share a token between two secrets', () => {
    expect(formCsrfToken('tok-123')).not.toBe(formCsrfToken('tok-124'));
  });

  it('names the hidden field the backend reads', () => {
    expect(FORM_FIELD).toBe('_csrf');
  });
});

describe('the minted nonce cookie', () => {
  it('sets a cookie whose nonce derives the token it returned', () => {
    // The contract in one line: the form carries the token, the browser
    // carries the cookie, and `require_form_csrf` re-derives one from the
    // other. If these two stop agreeing, every unhydrated post is refused.
    const minted = mintFormCsrf();
    const nonce = attributes(minted.responseInit.headers['Set-Cookie']).get(
      PLAY_CSRF_COOKIE.toLowerCase(),
    );

    expect(nonce).toBeTruthy();
    expect(minted.token).toBe(formCsrfToken(nonce as string));
    expect(minted.token).not.toBe(''); // not the "no proof available" value
  });

  it('is HttpOnly, Lax and origin-wide', () => {
    // **Negative control.** The whole double-submit argument is that the
    // attacker's page can make the browser *send* the cookie but can never
    // *read* it. Drop HttpOnly and a script on any page that can reach this
    // origin reads the nonce, computes the token, and the token proves
    // nothing at all.
    const attrs = attributes(setCookie());

    expect([...attrs.keys()]).toContain('httponly');
    expect(attrs.get('samesite')).toBe('Lax');
    expect(attrs.get('path')).toBe('/');
  });

  it('is unguessable and fresh per mint', () => {
    // A predictable nonce is a token anyone can compute at home. A counter
    // or a timestamp would satisfy "different" and fail the width check:
    // 32 bytes through base64url is 43 characters, and asserting the real
    // width rather than a round `>= 32` is what stops the entropy being
    // quietly cut by a quarter.
    const nonces = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      nonces.add(attributes(setCookie()).get(PLAY_CSRF_COOKIE.toLowerCase()) as string);
    }

    expect(nonces.size).toBe(25);
    for (const nonce of nonces) expect(nonce.length).toBeGreaterThanOrEqual(43);
  });

  it('expires after four hours', () => {
    // A judgement call rather than a derived value, pinned so changing it is
    // a visible act: long enough to be interrupted mid-form and come back,
    // short enough that a nonce left in a shared club laptop is not reusable
    // all week.
    expect(attributes(setCookie()).get('max-age')).toBe(String(4 * 60 * 60));
  });

  it('invalidates the first tab when a second page is rendered', () => {
    // **The multi-tab consequence, pinned as an accepted decision.** Path=/
    // means every mint overwrites the previous nonce for the whole origin,
    // so a first tab's embedded token stops matching and submitting it is
    // refused with "this form has expired — reload". The alternative is
    // several live nonces with an eviction policy, which is a server-side
    // token store in everything but name. Inherited knowledge, not a
    // surprise bug report: anyone who changes it changes a red test.
    const firstTab = mintFormCsrf();
    const secondTab = mintFormCsrf();
    const liveNonce = attributes(secondTab.responseInit.headers['Set-Cookie']).get(
      PLAY_CSRF_COOKIE.toLowerCase(),
    ) as string;

    expect(formCsrfToken(liveNonce)).toBe(secondTab.token);
    expect(formCsrfToken(liveNonce)).not.toBe(firstTab.token);
  });

  it('follows the deployment Secure flag, off by default', () => {
    // Same env var NAME the backend's `session_cookie_secure` reads, and the
    // same `false` default, so one knob configures both tiers on one origin.
    // Defaulting to `true` would be the worse failure: over plain HTTP the
    // browser drops the cookie silently and every post is refused, which
    // reads as a broken site rather than as a misconfiguration.
    delete process.env.SESSION_COOKIE_SECURE;
    expect([...attributes(setCookie()).keys()]).not.toContain('secure');

    process.env.SESSION_COOKIE_SECURE = 'true';
    expect([...attributes(setCookie()).keys()]).toContain('secure');
  });
});

describe('the module cannot relay a credential', () => {
  it('mints from no input at all — structurally, not by inspection', () => {
    // This module is the second documented exception to the route-tier relay
    // guard (after `apiFetch.server.ts`, which legitimately calls `fetch` and
    // sets headers). The exemption is earned rather than granted: a function
    // that takes no arguments has no parameter through which an inbound
    // cookie could reach it. Give `mintFormCsrf` a `request` and this is red
    // before the reviewer has to notice.
    expect(mintFormCsrf.length).toBe(0);
    expect(formCsrfToken.length).toBe(1);
  });

  it('reads no inbound request anywhere in its source', () => {
    const source = readFileSync(
      new URL('../app/lib/formCsrf.server.ts', import.meta.url),
      'utf8',
    )
      // Prose about cookies is the point of the file; it is code that reads
      // one that would be the finding.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(source).not.toMatch(/headers\s*\.\s*get\s*\(/);
    expect(source).not.toMatch(/\brequest\b/);
    expect(source).not.toMatch(/(^|[^.\w])fetch\s*\(/);
  });
});
