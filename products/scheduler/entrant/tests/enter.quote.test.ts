/**
 * "Update events and total" — the R14 quote round trip on `/e/{slug}/enter`,
 * unhydrated.
 *
 * Asserted on the bytes an entrant with JavaScript disabled receives, through
 * the REAL @react-router/dev pipeline and `createRequestHandler`. With no
 * script the button is a second submit control carrying `formaction` at
 * `POST /e/api/quote/{slug}`. That route answers a browser `Accept:
 * text/html` with a **307** back to this page (G0: `/e/{slug}/enter…#total`)
 * — method and body preserved, so the typing returns in the POST and only
 * the server's computed keys are in the query string. Everything below is
 * what this page does with both halves.
 *
 * The number never comes from here. It is `compute_fee_total`'s, read off
 * the query string; the write path runs the same call again, so an edited
 * URL reaches no record — but it is a GET, so it is also a link someone can
 * be *sent*, and everything it renders is bounded for that reason (a number,
 * or a refusal code mapped to fixed copy).
 */
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

const MS = '11111111-1111-4111-8111-111111111111';
const WD = '22222222-2222-4222-8222-222222222222';

/** The REAL nested projection (`api/entries_json.py`). */
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
      opensAtIso: null,
      closesAtIso: null,
      withdrawsUntilIso: null,
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
      opensAtIso: null,
      closesAtIso: null,
      withdrawsUntilIso: null,
      isOpen: true,
      ageBracketed: false,
      entryCount: 0,
    },
  ],
  entrants: [],
  // The anonymous viewer — the only projection a server-rendered page can be
  // handed. Held to the real route by `tests/test_entrant_ssr_contract.py`.
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
  return (await handle(new Request(`http://entrant.test/e/spring-open/enter${query}`))).text();
}

/**
 * The 307 landing: the browser re-posting the entrant's own body to this
 * page — same method, same urlencoded body, the server's `totalCents` in the
 * query string instead of the entrant's name.
 */
async function repost(body: string, query = ''): Promise<Response> {
  return handle(
    new Request(`http://entrant.test/e/spring-open/enter${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }),
  );
}

describe('the quote round trip, with no JavaScript', () => {
  it('offers a second submit control aimed at the quote route', async () => {
    const html = await render();

    const quoteButton =
      html.match(/<button[^>]*formaction="\/e\/api\/quote\/spring-open"[^>]*>/i)?.[0] ??
      '';

    expect(quoteButton).not.toBe('');
    expect(quoteButton).toContain('name="action"');
    expect(quoteButton).toContain('value="filter"');
    expect(quoteButton).toContain('type="submit"');
    // Not a claim that the form is finished: pressing it must not trip the
    // browser's own validation on a half-filled block.
    expect(quoteButton).toMatch(/formnovalidate=""/i);
    // The submit button still points at the write route — two controls, two
    // actions, and only one of them records anything.
    expect(html).toContain('action="/e/api/submit/spring-open"');
  });

  it('tells the quote route which of the two enter-page paths it is on', async () => {
    // E3's `/enter/signed-in` is the ONLY way this tier can say a sign-in
    // worked. The flag is on the quote URL, not in a hidden field, so the
    // write post never carries it; the backend reads it as presence and
    // appends its own suffix.
    const plain = await (
      await handle(new Request('http://entrant.test/e/spring-open/enter'))
    ).text();
    const signedIn = await (
      await handle(new Request('http://entrant.test/e/spring-open/enter/signed-in'))
    ).text();

    expect(plain).toMatch(/formaction="\/e\/api\/quote\/spring-open"/i);
    expect(signedIn).toMatch(/formaction="\/e\/api\/quote\/spring-open\?signedIn=1"/i);
    expect(signedIn).toContain('action="/e/api/submit/spring-open"');
  });

  it('recalculates by POST, so this tier never puts entrant detail in a URL', async () => {
    // **E1, the privacy control.** A GET here would carry the player's name,
    // club, birth year and free-text remarks in the query string — into nginx
    // access logs, browser history and any intermediary. The entry form is a
    // POST; the only GET forms in the document are discovery's search and
    // filters, which carry no entrant field.
    const html = await render();

    const entryForm = html.match(/<form[^>]*action="\/e\/api\/submit\/spring-open"[^>]*>/)?.[0];
    expect(entryForm).toBeTruthy();
    expect(entryForm).toMatch(/method="post"/i);
    // No second, GET-shaped route to the same act: not a link, and not a
    // submit control that overrides the method back to GET.
    expect(html).not.toMatch(/<a[^>]*href="[^"]*\/e\/api\/quote\//i);
    expect(html).not.toMatch(/formmethod="get"/i);
    // And no entrant-detail field is rendered into a URL, nor into any GET
    // form (the search form's only named control is `q`).
    for (const field of ['playerName', 'club', 'birthYear', 'remarks']) {
      expect(html).not.toContain(`?${field}=`);
      expect(html).not.toContain(`&${field}=`);
    }
    const getForms = html.match(/<form(?![^>]*method="post")[^>]*>[\s\S]*?<\/form>/gi) ?? [];
    for (const form of getForms) {
      expect(form).not.toMatch(/name="(playerName|club|birthYear|remarks|events)"/);
    }
  });

  it('takes the SAME path hydrated: nothing intercepts the submission', async () => {
    // This is a plain `<form>`, not React Router's `<Form>`, and no control
    // carries a handler — so a hydrated browser performs the same native
    // document POST to the same `formaction`. A fetch-and-navigate
    // enhancement would be a second copy of the round trip, which is a second
    // thing that can drift from `compute_fee_total` (R14).
    const source = readFileSync(
      new URL('../app/routes/enter.tsx', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');

    expect(source).not.toMatch(/<Form[\s>]/);
    expect(source).not.toMatch(/useFetcher|useSubmit|useNavigate/);
    expect(source).not.toMatch(/\bon(Click|Submit)=/);
    expect(source).not.toMatch(/(^|[^.\w])fetch\s*\(/);
  });

  it('never asks the API for a quote while server-rendering', async () => {
    // The quote carries the entrant's session and CSRF proof; the browser
    // sends it, node never does.
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
    const ticked = html.match(new RegExp(`<input[^>]*value="0:${WD}"[^>]*>`))?.[0] ?? '';
    expect(ticked).toContain('checked=""');
  });

  it('leaves an event the entrant did not tick unticked', async () => {
    // Gender left empty so nothing narrows: both events render, and only the
    // echoed one comes back checked.
    const html = await render(
      `?playerName=Ada&gender=&club=&birthYear=&remarks=&events=0%3A${WD}`,
    );

    const ticked = html.match(new RegExp(`<input[^>]*value="0:${WD}"[^>]*>`))?.[0] ?? '';
    expect(ticked).toContain('checked=""');
    const untouched = html.match(new RegExp(`<input[^>]*value="0:${MS}"[^>]*>`))?.[0] ?? '';
    expect(untouched).not.toBe('');
    expect(untouched).not.toContain('checked=""');
  });

  it('narrows the event list to the echoed gender', async () => {
    const html = await render('?playerName=Ada&gender=F&club=&birthYear=&remarks=');

    expect(html).toContain(`value="0:${WD}"`);
    expect(html).not.toContain(`value="0:${MS}"`);
  });

  it('restores the whole list when Show every event is echoed on', async () => {
    const html = await render(
      '?playerName=Ada&gender=F&club=&birthYear=&remarks=&showAllEvents=on',
    );

    expect(html).toContain(`value="0:${MS}"`);
    expect(html).toMatch(/name="showAllEvents"[^>]*checked=""/);
  });

  it('shows the echoed total in the bar as the quoted state', async () => {
    // A player block must exist for its events to count — `parseEcho` groups
    // events under players, exactly as `parse_players` does.
    const html = await render(`?playerName=Ada&gender=F&events=0%3A${WD}&totalCents=3500`);

    expect(html).toContain('35.00');
    expect(html).toContain('Quoted total');
    expect(html).toContain('1 event');
  });

  it('never posts the echoed total onward', async () => {
    // The total in the query is DISPLAY: the write path recomputes it. Add
    // `<input type="hidden" name="totalCents">` and this goes red.
    const html = await render('?totalCents=1');

    expect(html).not.toContain('name="totalCents"');
  });

  it('renders no total at all before the first round trip', async () => {
    const html = await render();

    expect(html).not.toContain('Quoted total');
    expect(html).toContain('Update total');
  });

  it('surfaces a policy refusal from the round trip', async () => {
    const html = await render('?refusalCode=MAX_EVENTS_PER_PERSON&refusalSubjects=0');

    expect(html).toContain('more events than this tournament allows');
    expect(html).toContain('Player 1');
  });

  it('renders no attacker text from the query string, only fixed copy', async () => {
    // This URL is a GET on the tournament's own host, so it is shareable: a
    // link is read by whoever was sent it.
    const html = await render(
      '?refusalCode=Pay+%C2%A340+cash+to+the+desk+or+your+entry+is+void&refusalSubjects=%3Cb%3Eyou%3C%2Fb%3E',
    );

    expect(html).not.toContain('cash to the desk');
    expect(html).not.toContain('&lt;b&gt;you');
    expect(html).toContain('cannot be entered as it stands');
  });

  it('says something safe for a refusal code it does not know', async () => {
    const html = await render('?refusalCode=SOME_FUTURE_RULE');

    expect(html).toContain('cannot be entered as it stands');
  });

  it('renders the re-posted body, so the typing never needs a query string', async () => {
    // **E1, the other half.** The quote route answers 307, so the browser
    // re-posts the entrant's own fields HERE. Without an `action` export this
    // is a 405 and the whole privacy fix is unshippable: delete the action
    // and this goes red on the status line alone.
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
    expect(html).toContain('cannot play before 6pm Saturday');
    expect(html).toContain('<option value="F" selected="">Female</option>');
    const ticked = html.match(new RegExp(`<input[^>]*value="0:${WD}"[^>]*>`))?.[0] ?? '';
    expect(ticked).toContain('checked=""');
    // The server's number came the other way, in the query string.
    expect(html).toContain('20.00');
    expect(html).toContain('Quoted total');
  });

  it('re-mints the form token on the landing, so the next post still proves itself', async () => {
    const res = await repost('playerName=Rin&gender=F');
    const html = await res.text();

    expect(res.headers.get('set-cookie')).toContain('sw_play_csrf=');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(html).toMatch(/name="_csrf"[^>]*value="[0-9a-f]{64}"/);
  });

  it('never asks the API for a quote on the landing either', async () => {
    await repost(`playerName=Rin&gender=F&events=0%3A${WD}`);

    expect(called).toEqual(['http://backend:8000/e/api/page/spring-open']);
  });

  it('renders a hand-edited total as nothing rather than as NaN', async () => {
    const html = await render('?totalCents=free');

    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Quoted total');
  });
});
