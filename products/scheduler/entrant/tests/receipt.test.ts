/**
 * `/e/{slug}/receipt/{submissionId}` — the G in POST/redirect/GET.
 *
 * `POST /e/api/submit/{slug}` answers 303 here (`api/entries_json.py:714-719`),
 * so the browser's history entry is a GET and a reload re-fetches a page
 * instead of re-posting an entry.
 *
 * **The security shape of this route is the whole task.** A submission id
 * travels in a `Location` header and then sits in an address bar: it is a
 * handle, never a capability. `services/submissions.find_for_account` exists so
 * that a reader of one act by id cannot forget to name the account. This route
 * calls it zero times — because it reads no submission at all. Node holds no
 * entrant credential (spec §3) and must not grow one, so the only fetch a
 * receipt loader can make is the same public projection `/e/{slug}` makes, and
 * the receipt renders the reference, the total the server itself put in the
 * redirect, and the page's own branding. What was entered is E2 "my entries"
 * (spec §1, Phase 7), and it will be fetched from the BROWSER, which has the
 * cookie, not from node, which must never.
 *
 * That makes "entrant B cannot read entrant A's receipt" a property of the
 * absence of a read rather than of a scoped one — so the controls below are
 * written to go red the moment a read appears: they pin the outbound call list
 * and they pin that the bytes served to entrant B, to entrant A and to an
 * anonymous stranger are the same bytes.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import { loader } from '../app/routes/receipt';
import {
  credentialRelayLines,
  moduleScopedMutableBindings,
  readAppSource,
  routeFiles,
} from './helpers/sourceGuards';

const SUBMISSION = '44444444-4444-4444-8444-444444444444';

/**
 * The REAL `GET /e/api/page/{slug}` projection (`api/entries_json.py:97-188`):
 * nested, `entryCount` not `entered`, `{name, eventId}` rows, slug under
 * `page.slug`. Same fixture shape as `entry.loader.test.ts`.
 */
const PAGE = {
  tournament: { name: 'Spring Open', date: '2026-09-12' },
  org: { name: 'Kingsway BC' },
  venue: { name: 'Kingsway Centre', address: '4 Kingsway' },
  page: {
    slug: 'spring-open',
    introText: 'Entries close on the 1st.',
    regulationsText: 'BWF laws apply.',
    regulationsVersion: 3,
    paymentInstructions: 'Bank transfer on the day.',
    feeSchedule: { '2': 2500 },
  },
  policy: {
    maxEventsPerPerson: 2,
    disciplineCaps: null,
    collectPhone: false,
    waiverRequired: false,
  },
  events: [],
  entrants: [],
  viewer: { signedIn: true, email: 'ada@example.com', formCsrf: 'csrf-token-abc' },
};

/**
 * The upstream stub answers EVERY url with the page projection *plus* a
 * submission-shaped body carrying entrant A's private data.
 *
 * Deliberate over-supply. A stub that only ever returns the public projection
 * makes "the receipt shows no private data" unfalsifiable — the data was never
 * on the wire to leak. This one puts it there: a loader that fetched a
 * submission route would get these fields back and a renderer that showed them
 * would put them in the markup, and both halves of every disclosure control
 * below would go red.
 */
const PRIVATE = {
  playerName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '07700 900000',
  remarks: 'cannot play before 6pm Saturday',
};

const sent: Request[] = [];

function stubUpstream(status = 200) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Request(input as RequestInfo, init));
    return new Response(JSON.stringify({ ...PAGE, submission: PRIVATE }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function get(
  slug: string | undefined,
  submissionId: string | undefined,
  query = '',
  headers: HeadersInit = {},
) {
  return loader({
    request: new Request(
      `http://entrant.test/e/${slug ?? ''}/receipt/${submissionId ?? ''}${query}`,
      { headers },
    ),
    params: { slug, submissionId },
  });
}

beforeEach(() => {
  sent.length = 0;
  process.env.API_BASE_URL = 'http://backend:8000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('receipt loader', () => {
  it('reads the reference and the server-stated total off the redirect target', async () => {
    vi.stubGlobal('fetch', stubUpstream());

    const data = await get('spring-open', SUBMISSION, '?totalCents=3500');

    expect(data.submissionId).toBe(SUBMISSION);
    expect(data.totalCents).toBe(3500);
    expect(data.page.tournamentName).toBe('Spring Open');
  });

  it('returns only the three page fields it renders, not the whole projection', async () => {
    // The loader's return value is serialized into the hydration payload
    // verbatim, so "the component does not render it" is not the same as "it
    // is not in the HTML". Pinning the key set is what makes the disclosure
    // control below able to fail: return the raw projection instead and both
    // this and the byte-equality test go red.
    vi.stubGlobal('fetch', stubUpstream());

    const data = await get('spring-open', SUBMISSION);

    expect(Object.keys(data.page).sort()).toEqual([
      'paymentInstructions',
      'tournamentName',
    ]);
  });

  it('fetches ONLY the public page projection — never a submission', async () => {
    // CONTROL. The receipt's whole safety argument is that there is no
    // account-scoped read here to get the scoping wrong on. Asserted on the
    // call list, because in a mocked test an unscoped read would succeed.
    vi.stubGlobal('fetch', stubUpstream());

    await get('spring-open', SUBMISSION);

    expect(sent.map((r) => r.url)).toEqual(['http://backend:8000/e/api/page/spring-open']);
    expect([...sent[0].headers.keys()]).toEqual(['accept']);
  });

  it('sends no Cookie upstream even when the inbound request carries one', async () => {
    vi.stubGlobal('fetch', stubUpstream());

    await get('spring-open', SUBMISSION, '', {
      cookie: 'sw_entrant_session=entrant-b-secret',
    });

    expect(sent[0].headers.get('cookie')).toBeNull();
    expect([...sent[0].headers.keys()]).toEqual(['accept']);
  });

  it('404s a missing submission id without calling the API at all', async () => {
    vi.stubGlobal('fetch', stubUpstream());

    await expect(get('spring-open', undefined)).rejects.toSatisfy(
      (thrown: unknown) => thrown instanceof Response && thrown.status === 404,
    );
    expect(sent).toEqual([]);
  });

  it('404s a submission id that is not a UUID, before rendering it', async () => {
    // The path segment is attacker-chosen and lands on a branded page as the
    // "Reference". React escapes it, so this is not XSS — it is content
    // injection: `/e/spring-open/receipt/YOUR%20ENTRY%20WAS%20REJECTED%20CALL…`
    // renders that sentence inside the organiser's own receipt. The redirect
    // only ever names a UUID, so anything else is refused at the boundary.
    vi.stubGlobal('fetch', stubUpstream());

    await expect(
      get('spring-open', 'YOUR ENTRY WAS REJECTED - CALL 555-0100'),
    ).rejects.toSatisfy(
      (thrown: unknown) => thrown instanceof Response && thrown.status === 404,
    );
    expect(sent).toEqual([]);
  });

  it('treats a junk or absent total as no total, never as 0.00', async () => {
    // `null` is not `0.00` (`app/lib/money.ts`): a zero on a receipt is a claim
    // about money nobody made, and the query string is entrant-editable.
    vi.stubGlobal('fetch', stubUpstream());

    expect((await get('spring-open', SUBMISSION)).totalCents).toBeNull();
    expect((await get('spring-open', SUBMISSION, '?totalCents=free')).totalCents).toBeNull();
    expect((await get('spring-open', SUBMISSION, '?totalCents=-1')).totalCents).toBeNull();
    expect((await get('spring-open', SUBMISSION, '?totalCents=35.5')).totalCents).toBeNull();
    // `Number('')` is `0`, not NaN — the hole this pins shut: present-but-empty
    // must not be read as "no total present" collapsing into a false zero.
    expect((await get('spring-open', SUBMISSION, '?totalCents=')).totalCents).toBeNull();
    // `Number()` accepts hex and exponent literals a plain digit regex must not.
    expect((await get('spring-open', SUBMISSION, '?totalCents=0x10')).totalCents).toBeNull();
    expect((await get('spring-open', SUBMISSION, '?totalCents=1e3')).totalCents).toBeNull();
  });

  it('404s an unknown slug, uniformly, carrying no upstream detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ detail: { code: 'TOURNAMENT_NOT_FOUND', message: 'x' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const thrown = (await get('nope', SUBMISSION).catch((e: unknown) => e)) as Response;

    expect(thrown.status).toBe(404);
    expect(await thrown.text()).not.toContain('TOURNAMENT_NOT_FOUND');
  });
});

describe('receipt module shape', () => {
  it('exports no action, so a reload can only re-issue the GET', async () => {
    const mod = await import('../app/routes/receipt');
    expect('action' in mod).toBe(false);
  });

  it('is covered by the enumerated route-tier guards', () => {
    // Non-vacuity for controls 4 and 5: `entry.loader.test.ts` runs those
    // guards over `routeFiles()`, and this asserts the enumeration actually
    // reaches the file this task added rather than silently skipping it.
    expect(routeFiles()).toContain('routes/receipt.tsx');
    expect(credentialRelayLines(readAppSource('routes/receipt.tsx'))).toEqual([]);
    expect(moduleScopedMutableBindings(readAppSource('routes/receipt.tsx'))).toEqual([]);
  });
});

// ---- request level: the route as three different callers get it -----------

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function fetchEntrant(path: string, headers: HeadersInit = {}): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(
    new Request(`http://entrant.test${path}`, { headers }),
  );
}

const RECEIPT = `/e/spring-open/receipt/${SUBMISSION}?totalCents=3500`;

describe('GET /e/{slug}/receipt/{submissionId}', () => {
  it('server-renders the reference, the recorded total and the payment terms', async () => {
    vi.stubGlobal('fetch', stubUpstream());

    const res = await fetchEntrant(RECEIPT);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain(SUBMISSION);
    expect(body).toContain('35.00');
    expect(body).toContain('Bank transfer on the day.');
    expect(body).toContain('href="/e/spring-open"');
    // Nothing to re-fire: no form on the page at all.
    expect(body).not.toContain('<form');
  });

  it('reads a replay exactly as it reads the original — one outcome, one page', async () => {
    // The ruling in `api/entries_json.py:711` and on `SubmissionResult.
    // replayed`: a replay answers the SAME receipt, because a retrying client
    // that saw a different answer would conclude its first attempt failed. So
    // the server sends no replay flag, and this page must not invent one from
    // a query string only a URL's author can set — that would let a stranger
    // tell an entrant their entry was a duplicate.
    vi.stubGlobal('fetch', stubUpstream());

    const plain = await (await fetchEntrant(RECEIPT)).text();
    const claimed = await (await fetchEntrant(`${RECEIPT}&replayed=1`)).text();

    expect(claimed).toBe(plain);
    expect(plain).toContain('Entry received');
    expect(plain).not.toContain('already recorded');
  });

  it('serves entrant B, entrant A and an anonymous stranger the SAME bytes', async () => {
    // CONTROLS 1 and 2, as one assertion, because they are one property.
    //
    // Entrant B pasting entrant A's receipt URL — the disclosure the 303's
    // `Location` made reachable and that `find_for_account` exists to close on
    // the read side — gets a page assembled from a public projection, an
    // attacker-supplied query string and a UUID they already typed. So does A.
    // So does a caller with no session at all. Byte equality is the strongest
    // available statement of "this route discloses nothing about an account",
    // and it is the assertion that goes red the moment anything account-shaped
    // reaches the markup: render `page.viewer.email` and the three bodies stop
    // matching (verified by mutation — see the task report).
    vi.stubGlobal('fetch', stubUpstream());

    const [aBody, bBody, anonBody] = await Promise.all(
      ([
        { cookie: 'sw_entrant_session=entrant-a' },
        { cookie: 'sw_entrant_session=entrant-b' },
        {},
      ] as HeadersInit[]).map(async (headers) =>
        (await fetchEntrant(RECEIPT, headers)).text(),
      ),
    );

    expect(bBody).toBe(aBody);
    expect(anonBody).toBe(aBody);
    // And none of it is A's submission, which the stub DID put on the wire.
    for (const secret of Object.values(PRIVATE)) {
      expect(aBody).not.toContain(secret);
    }
    // Every upstream call, for all three callers, was the public projection.
    expect(new Set(sent.map((r) => r.url))).toEqual(
      new Set(['http://backend:8000/e/api/page/spring-open']),
    );
  });

  it('is a genuine read: reloading issues GETs and changes nothing', async () => {
    // CONTROL 3. The 303 moved the browser off the POST; this is the other
    // half — the target itself never writes. Two loads, same bytes, and every
    // request the server made upstream was a GET.
    vi.stubGlobal('fetch', stubUpstream());

    const first = await (await fetchEntrant(RECEIPT)).text();
    const second = await (await fetchEntrant(RECEIPT)).text();

    expect(second).toBe(first);
    expect(sent).toHaveLength(2);
    expect(sent.map((r) => r.method)).toEqual(['GET', 'GET']);
  });

  it('renders a not-found page for an unknown slug, leaking neither cause nor topology', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ detail: { code: 'TOURNAMENT_NOT_FOUND', message: 'x' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const res = await fetchEntrant(`/e/does-not-exist/receipt/${SUBMISSION}`);
    const body = await res.text();

    expect(res.status).toBe(404);
    expect(body).not.toContain('TOURNAMENT_NOT_FOUND');
  });
});
