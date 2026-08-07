/**
 * "Update events and total" — the R14 quote round trip, unhydrated.
 *
 * Asserted on the bytes an entrant with JavaScript disabled receives, through
 * the REAL @react-router/dev pipeline and `createRequestHandler` (the shape
 * `entry.render.test.ts` and `entry.loader.test.ts` already take), never on
 * component source. With no script the button is a second submit control
 * carrying `formaction` at `POST /e/api/quote/{slug}` — the incumbent's
 * `action=filter` mechanism (`api/entries_public.py:589`) repointed at the
 * route that writes nothing. That route answers a browser `Accept: text/html`
 * with a 303 back to this page carrying the posted body plus the server's
 * `totalCents`, and everything below is what this page does with it.
 *
 * The number never comes from here. It is `compute_fee_total`'s, read off the
 * query string; the write path runs the same call again
 * (`api/entries_json.py:610`), so a hand-edited URL misleads only its editor
 * and reaches no record.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

const MS = '11111111-1111-4111-8111-111111111111';
const WD = '22222222-2222-4222-8222-222222222222';

/** The REAL nested projection (`api/entries_json.py`): `page.page.slug`,
 * `entryCount`, a `policy` object, three deadline fields. */
const PAGE = {
  tournament: { name: 'Spring Open', date: null },
  org: null,
  venue: null,
  page: {
    slug: 'spring-open',
    introText: null,
    regulationsText: null,
    regulationsVersion: 1,
    paymentInstructions: null,
    feeSchedule: {},
  },
  policy: {
    maxEventsPerPerson: null,
    disciplineCaps: null,
    collectPhone: false,
    waiverRequired: false,
  },
  events: [
    {
      id: MS,
      code: 'MS',
      discipline: "Men's Singles",
      feeCents: 1500,
      genderConstraint: 'M',
      opensAt: null,
      closesAt: null,
      withdrawsUntil: null,
      isOpen: true,
      ageBracketed: false,
      entryCount: 0,
    },
    {
      id: WD,
      code: 'WD',
      discipline: "Women's Doubles",
      feeCents: 2000,
      genderConstraint: 'F',
      opensAt: null,
      closesAt: null,
      withdrawsUntil: null,
      isOpen: true,
      ageBracketed: false,
      entryCount: 0,
    },
  ],
  entrants: [],
  viewer: { signedIn: true, email: 'ada@example.com', formCsrf: 'csrf-token-abc' },
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

const called: string[] = [];

beforeEach(() => {
  called.length = 0;
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function render(query = ''): Promise<string> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      called.push(String(input instanceof Request ? input.url : input));
      return new Response(JSON.stringify(PAGE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  const res = await createRequestHandler(build, 'development')(
    new Request(`http://entrant.test/e/spring-open${query}`),
  );
  return res.text();
}

describe('the quote round trip, with no JavaScript', () => {
  it('offers a second submit control aimed at the quote route', async () => {
    const html = await render();

    // Order-agnostic and case-insensitive, for the reason already documented
    // on `encType` in `entry.render.test.ts`: React 19's SSR stream emits the
    // JSX spelling verbatim, so the observed bytes are `formAction=` and
    // `formNoValidate=`, and it reorders `name`/`value` at will. HTML
    // attribute names are ASCII case-insensitive, so the browser reads
    // `formaction` either way — pinning the exact lowercase spelling would
    // assert React's serializer rather than the contract.
    const quoteButton =
      html.match(/<button[^>]*formaction="\/e\/api\/quote\/spring-open"[^>]*>/i)?.[0] ??
      '';

    expect(quoteButton).not.toBe('');
    expect(quoteButton).toContain('name="action"');
    expect(quoteButton).toContain('value="filter"');
    expect(quoteButton).toContain('type="submit"');
    // Not a claim that the form is finished: pressing it must not trip the
    // browser's own validation on the half-filled second player block.
    expect(quoteButton).toMatch(/formnovalidate=""/i);
    // The submit button still points at the write route — two controls, two
    // actions, and only one of them records anything.
    expect(html).toContain('action="/e/api/submit/spring-open"');
  });

  it('never asks the API for a quote while server-rendering', async () => {
    // The quote carries the entrant's session and CSRF proof; the browser
    // sends it, node never does. If SSR reached that route, node would be
    // relaying a credential it must not hold.
    await render('?playerName=Ada&gender=F&club=&birthYear=&remarks=');

    expect(called).toEqual(['http://backend:8000/e/api/page/spring-open']);
  });

  it('puts the entrant typing back after the round trip', async () => {
    const html = await render(
      `?playerName=Ada+Lovelace&gender=F&club=Kingsway&birthYear=&remarks=&events=0%3A${WD}&totalCents=2000`,
    );

    expect(html).toContain('value="Ada Lovelace"');
    expect(html).toContain('value="Kingsway"');
    expect(html).toContain('<option value="F" selected="">Female</option>');
    // Order-agnostic: React's input serializer emits `checked` BEFORE `value`
    // (observed), so an ordered regex would pass or fail on its whim.
    const ticked = html.match(new RegExp(`<input[^>]*value="0:${WD}"[^>]*>`))?.[0] ?? '';
    expect(ticked).toContain('checked=""');
    // ...and an event the entrant did NOT tick stays untouched.
    const untouched = html.match(new RegExp(`<input[^>]*value="1:${WD}"[^>]*>`))?.[0] ?? '';
    expect(untouched).not.toBe('');
    expect(untouched).not.toContain('checked=""');
  });

  it('narrows the event list to the echoed gender', async () => {
    const html = await render('?playerName=Ada&gender=F&club=&birthYear=&remarks=');

    expect(html).toContain(`value="0:${WD}"`);
    expect(html).not.toContain(`value="0:${MS}"`);
    // Player two chose nothing, so their list is untouched.
    expect(html).toContain(`value="1:${MS}"`);
  });

  it('restores the whole list when Show every event is echoed on', async () => {
    const html = await render(
      '?playerName=Ada&gender=F&club=&birthYear=&remarks=&showAllEvents=on',
    );

    expect(html).toContain(`value="0:${MS}"`);
    expect(html).toMatch(/name="showAllEvents"[^>]*checked=""/);
  });

  it('shows the echoed total and labels it provisional', async () => {
    const html = await render('?totalCents=3500');

    expect(html).toContain('35.00');
    expect(html).toContain('Provisional');
  });

  it('never posts the echoed total onward', async () => {
    // The total in the query is DISPLAY. `compute_fee_total` runs again on the
    // write path (`api/entries_json.py:610`), so a hand-edited URL misleads
    // only its editor. Add `<input type="hidden" name="totalCents">` and this
    // goes red.
    const html = await render('?totalCents=1');

    expect(html).not.toContain('name="totalCents"');
  });

  it('renders no total at all before the first round trip', async () => {
    const html = await render();

    expect(html).not.toContain('Provisional');
    expect(html).toContain('Update events and total');
  });

  it('surfaces a policy refusal from the round trip', async () => {
    const html = await render('?refusal=At+most+2+events+per+person');

    expect(html).toContain('At most 2 events per person');
  });

  it('renders a hand-edited total as nothing rather than as NaN', async () => {
    // The query string is entrant-editable. `Number('free')` is NaN and
    // "NaN" on a page about money is worse than no number at all.
    const html = await render('?totalCents=free');

    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Provisional');
  });
});
