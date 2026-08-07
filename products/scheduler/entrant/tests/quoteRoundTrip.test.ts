/**
 * The hydrated half of "Update events and total".
 *
 * Same round trip, no full page reload — and deliberately the same *renderer*:
 * `requestQuote` posts the form to FastAPI, then hands back the echo query
 * string, and the route navigates to it. The loader re-runs, `parseEcho` reads
 * it, and every pixel after that is the code path the unhydrated post already
 * produces. There is no second implementation of the total, of the narrowing,
 * or of the refusal — which is the only way "hydrated and unhydrated agree"
 * can be a property rather than a hope.
 *
 * **The browser makes this request, not node.** It runs in an event handler,
 * so the entrant's session cookie is attached by the browser and
 * `X-ShuttleWorks-CSRF: 1` is attached by a same-origin script. Manufactured
 * in node, that header would stop proving "a same-origin browser sent this"
 * and start proving "a node process asked" (spec §3) — which is why this
 * module is never called from a loader, asserted in `entry.quote.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestQuote } from '../app/lib/quoteRoundTrip';

const WD = '22222222-2222-4222-8222-222222222222';

function filledForm(): FormData {
  const body = new FormData();
  body.append('_csrf', 'csrf-token-abc');
  body.append('idempotencyKey', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  body.append('playerName', 'Ada Lovelace');
  body.append('gender', 'F');
  body.append('club', 'Kingsway');
  body.append('birthYear', '');
  body.append('remarks', '');
  body.append('events', `0:${WD}`);
  return body;
}

let sent: Request[] = [];

function stub(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Request(`http://entrant.test${String(input)}`, init));
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

beforeEach(() => {
  sent = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestQuote', () => {
  it('posts the form to the session-gated quote route on this origin', async () => {
    stub({ totalCents: 2000, feeBasis: {}, refusal: null });

    await requestQuote('spring-open', filledForm());

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('http://entrant.test/e/api/quote/spring-open');
    expect(sent[0].method).toBe('POST');
    // Same wire shape as the native post, so one Python parser reads both.
    expect(sent[0].headers.get('content-type')).toMatch(
      /application\/x-www-form-urlencoded/,
    );
  });

  it('carries both CSRF channels and the browser-held session', async () => {
    // Channel one is the custom header a cross-site page cannot attach without
    // a preflight we do not approve; channel two is the cookie-derived
    // double-submit token already in the form body
    // (`app/form_csrf.form_csrf_proves`). Drop either and the middleware or
    // `require_form_csrf` refuses the request — so both are pinned.
    stub({ totalCents: null, feeBasis: {}, refusal: null });

    await requestQuote('spring-open', filledForm());

    expect(sent[0].headers.get('X-ShuttleWorks-CSRF')).toBe('1');
    expect(sent[0].credentials).toBe('same-origin');
    expect(await sent[0].text()).toContain('_csrf=csrf-token-abc');
  });

  it('escapes the slug rather than pasting it into a path', async () => {
    stub({ totalCents: null, feeBasis: {}, refusal: null });

    await requestQuote('../admin', filledForm());

    expect(sent[0].url).toBe('http://entrant.test/e/api/quote/..%2Fadmin');
  });

  it("returns an echo carrying the typing and the SERVER's total", async () => {
    stub({ totalCents: 2000, feeBasis: {}, refusal: null });

    const search = new URLSearchParams(await requestQuote('spring-open', filledForm()));

    expect(search.getAll('playerName')).toEqual(['Ada Lovelace']);
    expect(search.get('gender')).toBe('F');
    expect(search.getAll('events')).toEqual([`0:${WD}`]);
    expect(search.get('totalCents')).toBe('2000');
  });

  it('drops the CSRF token, the idempotency key and the action from the echo', async () => {
    // They are transport, not typing. The key especially: it is minted per
    // rendered form in the loader, and a re-run mints a fresh one — echoing
    // the old one into the URL would pin a stale key into the address bar.
    stub({ totalCents: 2000, feeBasis: {}, refusal: null });
    const body = filledForm();
    body.append('action', 'filter');

    const search = new URLSearchParams(await requestQuote('spring-open', body));

    expect(search.get('_csrf')).toBeNull();
    expect(search.get('idempotencyKey')).toBeNull();
    expect(search.get('action')).toBeNull();
  });

  it('surfaces a policy refusal with the rule stated', async () => {
    stub({
      totalCents: 3500,
      feeBasis: {},
      refusal: { code: 'ENTRY_POLICY', message: 'At most 2 events per person', subjects: [] },
    });

    const search = new URLSearchParams(await requestQuote('spring-open', filledForm()));

    expect(search.get('refusal')).toBe('At most 2 events per person');
  });

  it('shows no total when the round trip fails, and no upstream prose either', async () => {
    // A stale number left on screen would be a number the entrant believes.
    // Fixed local copy: a 500 body can carry a stack frame or a hostname.
    stub({ detail: 'IntegrityError at /app/api/entries_json.py:214' }, 500);

    const search = new URLSearchParams(await requestQuote('spring-open', filledForm()));

    expect(search.get('totalCents')).toBeNull();
    expect(search.get('refusal')).toBe(
      'Could not work out the total just now. Press the button again, or submit and the organiser will confirm.',
    );
    expect(search.get('refusal')).not.toContain('entries_json.py');
  });

  it('survives the network being gone, which is the offline case', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const search = new URLSearchParams(await requestQuote('spring-open', filledForm()));

    expect(search.getAll('playerName')).toEqual(['Ada Lovelace']);
    expect(search.get('totalCents')).toBeNull();
    expect(search.get('refusal')).toContain('Could not work out the total');
  });

  it('computes no total of its own — a null answer stays null', async () => {
    // R14's whole point. If this module ever "helpfully" summed the ticked
    // events when the server declined to price them, the number on screen
    // would stop being the number recorded.
    stub({ totalCents: null, feeBasis: {}, refusal: null });

    const search = new URLSearchParams(await requestQuote('spring-open', filledForm()));

    expect(search.get('totalCents')).toBeNull();
  });

  it('reads no credential out of anything it was handed', async () => {
    // The documented blind spot in `sourceGuards.credentialRelayLines` is that
    // it is a one-hop lexical scan of `app/routes/` only — a helper one module
    // away is invisible to it. This module is that helper, so it gets its own
    // coverage: it may talk to the API, but it must never READ a credential
    // (an inbound header, a cookie jar) to do it. The browser attaches the
    // session; nothing here goes looking for it.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../app/lib/quoteRoundTrip.ts', import.meta.url),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(source).not.toMatch(/\bcookie\b/i);
    expect(source).not.toMatch(/headers\s*\.\s*get\s*\(/);
    expect(source).not.toMatch(/\bRequest\b/);
    expect(source).not.toMatch(/\.server['"]/);
  });
});
