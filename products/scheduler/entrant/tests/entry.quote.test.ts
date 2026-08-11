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
 * (`api/entries_json.py:610`), so an edited URL reaches no record — but it is
 * a GET, so it is also a link someone can be *sent*, and everything it renders
 * is bounded for that reason (a number, or a refusal code mapped to fixed
 * copy). The control on that is below.
 */
import { readFileSync } from 'node:fs';
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
  // The anonymous viewer — the only projection a server-rendered page can be
  // handed, because node's fetch carries no cookie for `_optional_entrant` to
  // read. Held to the real route by `tests/test_entrant_ssr_contract.py`.
  viewer: { signedIn: false, email: null, formCsrf: '' },
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

async function handle(request: Request): Promise<Response> {
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
  return createRequestHandler(build, 'development')(request);
}

async function render(query = ''): Promise<string> {
  return (await handle(new Request(`http://entrant.test/e/spring-open${query}`))).text();
}

/**
 * The 307 landing: the browser re-posting the entrant's own body to this page.
 *
 * Exactly what `POST /e/api/quote/{slug}` now sends a browser to do — same
 * method, same urlencoded body, and the server's `totalCents` in the query
 * string instead of the entrant's name. Driven through the real handler, so
 * this is the document a scriptless browser receives.
 */
async function repost(body: string, query = ''): Promise<Response> {
  return handle(
    new Request(`http://entrant.test/e/spring-open${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }),
  );
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

  it('tells the quote route which of the two entry-page paths it is on', async () => {
    // E3's `/e/{slug}/signed-in` is the ONLY way this tier can say a sign-in
    // worked — it cannot read the session cookie (R8-D). A recalculation used
    // to come back to the bare page, so pressing "Update events and total"
    // silently retracted that. The flag is on the quote URL, not in a hidden
    // field, so the write post never carries it; the backend reads it as
    // presence and appends its own suffix.
    const plain = await (
      await handle(new Request('http://entrant.test/e/spring-open'))
    ).text();
    const signedIn = await (
      await handle(new Request('http://entrant.test/e/spring-open/signed-in'))
    ).text();

    expect(plain).toMatch(/formaction="\/e\/api\/quote\/spring-open"/i);
    expect(signedIn).toMatch(/formaction="\/e\/api\/quote\/spring-open\?signedIn=1"/i);
    // The write target is the same on both: this is transport for the quote
    // round trip only.
    expect(signedIn).toContain('action="/e/api/submit/spring-open"');
  });

  it('recalculates by POST, so this tier never puts entrant detail in a URL', async () => {
    // **E1, the privacy control.** A GET here would carry the player's name,
    // club, birth year and free-text remarks in the query string — into nginx
    // access logs, browser history and any intermediary — and junior events
    // collect a birth year, so that is personal data of minors in logs never
    // scoped to hold it. The mechanism that prevents it is entirely native:
    // the form's `method` and the button's `formaction`. Both are pinned, and
    // EVERY form in the document is checked rather than the one this file is
    // about — a second form added as a GET is the same defect.
    //
    // The other half of it used to undo this one: the quote route answered
    // 303 and reflected the posted body into its `Location`, so the PII
    // reached the address bar anyway. It answers 307 now — body preserved,
    // nothing of it in the URL — and the tests below are this tier's half of
    // that (`test_a_browser_quote_never_puts_entrant_detail_in_a_url` in
    // `tests/test_entries_json_routes.py` is the backend's).
    const html = await render();

    const forms = [...html.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]);
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) {
      expect(form).toMatch(/method="post"/i);
    }
    // No second, GET-shaped route to the same act: not a link, and not a
    // submit control that overrides the method back to GET.
    expect(html).not.toMatch(/<a[^>]*href="[^"]*\/e\/api\/quote\//i);
    expect(html).not.toMatch(/formmethod="get"/i);
    // And no field that carries entrant detail is rendered into a URL.
    for (const field of ['playerName', 'club', 'birthYear', 'remarks']) {
      expect(html).not.toContain(`?${field}=`);
      expect(html).not.toContain(`&${field}=`);
    }
  });

  it('takes the SAME path hydrated: nothing intercepts the submission', async () => {
    // Why there is one path and not two. This is a plain `<form>`, not React
    // Router's `<Form>`, and the button carries no handler — so a hydrated
    // browser performs the same native document POST to the same
    // `formaction`, gets the same 303, and lands on the same URL the bytes
    // above render. A `fetch`-and-navigate enhancement existed here and was
    // deleted: it produced an identical result through a second copy of the
    // round trip, and a second copy is a second thing that can drift from
    // `compute_fee_total` (R14).
    const source = readFileSync(
      new URL('../app/routes/entry.form.tsx', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');

    expect(source).not.toMatch(/from ['"]react-router['"]/);
    expect(source).not.toMatch(/\bon(Click|Submit)=/);
    expect(source).not.toMatch(/(^|[^.\w])fetch\s*\(/);
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
    // write path (`api/entries_json.py:610`), so a hand-edited URL reaches no
    // record — it does NOT follow that it misleads only its editor: this URL
    // is a shareable GET on the tournament's own host, so a hand-edited one is
    // read by whoever was sent it. That is why the tests below pin the refusal
    // to fixed copy. Add `<input type="hidden" name="totalCents">` and this
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
    const html = await render('?refusalCode=MAX_EVENTS_PER_PERSON&refusalSubjects=0');

    expect(html).toContain('more events than this tournament allows');
    expect(html).toContain('Player 1');
  });

  it('renders no attacker text from the query string, only fixed copy', async () => {
    // The owed negative control. This URL is a GET on the tournament's own
    // host, so it is shareable: a link is read by whoever was sent it. Before
    // the code mapping, `?refusal=<anything>` printed that text verbatim
    // inside the warning Notice on the official entry page.
    const html = await render(
      '?refusalCode=Pay+%C2%A340+cash+to+the+desk+or+your+entry+is+void&refusalSubjects=%3Cb%3Eyou%3C%2Fb%3E',
    );

    expect(html).not.toContain('cash to the desk');
    expect(html).not.toContain('&lt;b&gt;you');
    // ...and it does not fail silently either: an unknown code still says
    // something true.
    expect(html).toContain('cannot be entered as it stands');
  });

  it('says something safe for a refusal code it does not know', async () => {
    const html = await render('?refusalCode=SOME_FUTURE_RULE');

    expect(html).toContain('cannot be entered as it stands');
  });

  it('renders the re-posted body, so the typing never needs a query string', async () => {
    // **E1, the other half.** The quote route answers 307, so the browser
    // re-posts the entrant's own fields HERE. Without an `action` export this
    // is a 405 and the whole privacy fix is unshippable, which is what makes
    // this the regression test rather than a nicety: delete the action and
    // this goes red on the status line alone.
    const res = await repost(
      `playerName=Rin+Matsuda&gender=F&club=Kingsway+BC&birthYear=2012` +
        `&remarks=cannot+play+before+6pm+Saturday&events=0%3A${WD}` +
        `&_csrf=deadbeef&idempotencyKey=aaaaaaaa-bbbb&showAllEvents=on`,
      '?totalCents=2000',
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('value="Rin Matsuda"');
    expect(html).toContain('value="Kingsway BC"');
    // `birthYear` is not asserted here: no event in this fixture is
    // age-bracketed, so the form renders it as an empty positional hidden
    // field and there is nothing to echo. It is the field that made this a
    // privacy defect rather than an untidiness, so it is pinned where it can
    // be — on the redirect itself, in `test_entries_json_routes.py`.
    expect(html).toContain('cannot play before 6pm Saturday');
    expect(html).toContain('<option value="F" selected="">Female</option>');
    const ticked = html.match(new RegExp(`<input[^>]*value="0:${WD}"[^>]*>`))?.[0] ?? '';
    expect(ticked).toContain('checked=""');
    // The server's number came the other way, in the query string, and is
    // rendered from there — one document, two channels, one parser.
    expect(html).toContain('20.00');
    expect(html).toContain('Provisional');
  });

  it('re-mints the form token on the landing, so the next post still proves itself', async () => {
    // The re-rendered form carries a NEW `_csrf` digest and the response
    // carries the matching nonce. If the action short-circuited the loader —
    // or `headers` stopped forwarding the mint — the entrant's next press
    // would answer 403 "This form has expired" with nothing to explain it.
    const res = await repost('playerName=Rin&gender=F');
    const html = await res.text();

    expect(res.headers.get('set-cookie')).toContain('sw_play_csrf=');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(html).toMatch(/name="_csrf"[^>]*value="[0-9a-f]{64}"/);
  });

  it('never asks the API for a quote on the landing either', async () => {
    // The action must not become a relay: node holds no entrant credential,
    // so re-posting through it must still cost exactly the one public
    // projection read the GET costs.
    await repost(`playerName=Rin&gender=F&events=0%3A${WD}`);

    expect(called).toEqual(['http://backend:8000/e/api/page/spring-open']);
  });

  it('renders a hand-edited total as nothing rather than as NaN', async () => {
    // The query string is entrant-editable. `Number('free')` is NaN and
    // "NaN" on a page about money is worse than no number at all.
    const html = await render('?totalCents=free');

    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Provisional');
  });
});
