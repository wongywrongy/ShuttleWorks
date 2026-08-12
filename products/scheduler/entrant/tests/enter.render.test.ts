/**
 * The no-JS contract of `/e/{slug}/enter`, asserted on real server-rendered
 * HTML.
 *
 * Rendered through the REAL @react-router/dev Vite pipeline and
 * `createRequestHandler` — request in, bytes out, no component mocking — the
 * same shape the rest of this directory takes. Everything asserted here is
 * therefore true of the bytes an entrant with JavaScript disabled receives.
 *
 * Carried over from the SP-P6-1 entry page (`entry.render.test.ts`) when the
 * form moved to its own route (SP-P6-2 §3 / G0). Two deliberate behaviour
 * changes ride along, both owner-approved: the form renders ONE player block
 * by default ("Add another player" is an explicit round trip, Z12 — the
 * permanent second blank card is gone), and the unquoted state's copy moved
 * into the sticky total bar.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

/**
 * The REAL `GET /e/api/page/{slug}` projection — see the fixture's note.
 * **Shared with `scripts/measure-page-weight.mjs`, on purpose**: that script
 * renders the SAME routes through the SAME handler to produce the numbers the
 * CI page-weight gate checks, and a drifted copy would silently shrink the
 * measured page. One copy, in JSON, because the two consumers share no module
 * system.
 *
 * `viewer` is NOT in the JSON and is spread in below instead. The backend's
 * `tests/test_entrant_ssr_contract.py` polices every `viewer:` literal in this
 * directory by globbing `*.ts*` and cannot see a `.json` file; the one field
 * under a cross-tier control stays where the control can read it.
 */
import entryPageFixture from './helpers/entryPage.fixture.json';

// Derived from the fixture rather than restated, so the ids cannot drift out
// of step with the events they name.
const [MS, WD, SHUT] = entryPageFixture.events.map((event) => event.id);

const PAGE = {
  ...entryPageFixture,
  // **The only viewer projection a server-rendered page can ever receive.**
  // Held to the real route by `tests/test_entrant_ssr_contract.py`, which
  // fails on any fixture in this directory that claims otherwise.
  viewer: { signedIn: false, email: null, formCsrf: '' },
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function handle(request: Request, body: unknown = PAGE): Promise<Response> {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(request);
}

async function render(body: unknown = PAGE, path = '/e/spring-open/enter'): Promise<string> {
  return (await handle(new Request(`http://entrant.test${path}`), body)).text();
}

describe('the entry form, unhydrated', () => {
  it('is a plain form posting straight to FastAPI', async () => {
    // Not to an RR7 action: node renders and never relays a credential, so the
    // browser posts same-origin to the API tier directly.
    const html = await render();

    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toContain('action="/e/api/submit/spring-open"');
    expect(html).toMatch(/enctype="application\/x-www-form-urlencoded"/i);
    // A form with no submit control is unsubmittable without script.
    expect(html).toMatch(/<button[^>]*type="submit"/);
  });

  it('carries the double-submit token as a hidden field', async () => {
    // `_csrf` is `app/form_csrf.FORM_FIELD`; the value is the LOADER's mint
    // (R8-D), never the projection's always-empty `viewer.formCsrf`.
    const html = await render();

    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="_csrf"[^>]*value="[0-9a-f]{64}"/,
    );
    expect(html).not.toMatch(/name="_csrf" value=""/);
  });

  it('carries the loader-minted key in the field the backend reads', async () => {
    // `idempotencyKey`, NOT `Idempotency-Key`: the hyphenated spelling is the
    // HEADER alias, and a native form cannot send one.
    const html = await render();

    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="idempotencyKey"[^>]*value="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/,
    );
  });

  it('renders ONE player block by default — the permanent blank card is gone (Z12)', async () => {
    const html = await render();

    for (const name of ['playerName', 'gender', 'club', 'birthYear', 'remarks']) {
      expect(html.match(new RegExp(`name="${name}"`, 'g'))).toHaveLength(1);
    }
    expect(html).toContain('Player 1');
    expect(html).not.toContain('Player 2');
    // The explicit action that replaces it: a submit round trip to this
    // route's own action, never a backend call.
    const add = html.match(/<button[^>]*name="addPlayer"[^>]*>/i)?.[0] ?? '';
    expect(add).toContain('value="1"');
    expect(add).toMatch(/formaction="\/e\/spring-open\/enter"/i);
    expect(add).toMatch(/formnovalidate/i);
  });

  it('adds a second block on the add-player round trip, preserving the typing', async () => {
    // The Z12 mechanism end to end: the button posts the form body to this
    // route's action, which re-parses it through the SAME `parseEcho` and
    // renders one more block. No endpoint is touched; it works signed-out.
    const res = await handle(
      new Request('http://entrant.test/e/spring-open/enter', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `addPlayer=1&playerName=Ada+Lovelace&gender=F&club=Kingsway&birthYear=&remarks=&events=0%3A${WD}`,
      }),
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('Player 1');
    expect(html).toContain('Player 2');
    expect(html.match(/name="playerName"/g)).toHaveLength(2);
    expect(html).toContain('value="Ada Lovelace"');
    const ticked = html.match(new RegExp(`<input[^>]*value="0:${WD}"[^>]*>`))?.[0] ?? '';
    expect(ticked).toContain('checked=""');
    // ...and the new block's checkboxes carry the second positional prefix.
    expect(html).toContain(`value="1:${MS}"`);
  });

  it('renders a real birthYear input, not just the hidden fallback, when an open event is age-bracketed', async () => {
    const html = await render({
      ...PAGE,
      events: PAGE.events.map((event) =>
        event.id === MS ? { ...event, ageBracketed: true } : event,
      ),
    });

    for (const name of ['playerName', 'gender', 'club', 'birthYear', 'remarks']) {
      expect(html.match(new RegExp(`name="${name}"`, 'g'))).toHaveLength(1);
    }
    const birthYearTag = html.match(/<input[^>]*name="birthYear"[^>]*>/g) ?? [];
    expect(birthYearTag.some((tag) => !tag.includes('type="hidden"'))).toBe(true);
  });

  it('uses a native select for gender — Radix Select cannot submit unhydrated', async () => {
    const html = await render();

    expect(html).toMatch(/<select[^>]*name="gender"[^>]*required=""/);
    expect(html).toContain('<option value="F">Female</option>');
  });

  it('prefixes every event checkbox with its player index', async () => {
    const html = await render();

    expect(html).toContain(`value="0:${MS}"`);
    // A closed event is not enterable, so it is absent from the form entirely
    // rather than present-and-refused.
    expect(html).not.toContain(`value="0:${SHUT}"`);
  });

  it('requires the acknowledgment in the markup itself', async () => {
    const html = await render();

    const tag = html.match(/<input[^>]*name="acknowledged"[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('required=""');
    expect(tag).toContain('type="checkbox"');
  });

  it('states at the point of consent that the name will be published', async () => {
    // Q4: notice belongs where consent is given. The checkbox and its wording
    // are one <label>.
    const label =
      (await render()).split('name="acknowledged"')[1]?.slice(0, 600) ?? '';

    expect(label).toContain('public entrant list');
  });

  it('leaves club optional while gender is required', async () => {
    const html = await render();

    expect(html).toMatch(/<input[^>]*name="club"[^>]*>/);
    expect(html.match(/<input[^>]*name="club"[^>]*>/)?.[0]).not.toContain(
      'required',
    );
  });

  it('carries no script and no challenge widget at all', async () => {
    const html = await render();

    expect(html).not.toContain('<script');
    expect(html).not.toContain('cf-turnstile');
    expect(html).not.toContain('challenges.cloudflare.com');
  });

  it('renders the form whatever the viewer projection says (R8-E)', async () => {
    for (const body of [
      PAGE,
      // impossible-projection: the shape the OLD fixtures claimed and the
      // real backend can never return to node. Fed on purpose, so this test
      // proves the gate is gone rather than merely absent from one payload.
      // The marker is the opt-out `tests/test_entrant_ssr_contract.py`
      // requires — see that file for why it is loud rather than silent.
      { ...PAGE, viewer: { /* impossible-projection */ signedIn: true, email: 'a@b.c', formCsrf: '' } },
    ]) {
      const html = await render(body);
      expect(html).toContain('action="/e/api/submit/spring-open"');
    }
  });

  it('states that submitting needs an account, since it cannot know', async () => {
    expect(await render()).toContain('Submitting needs an entrant account');
  });

  it('prints per-event fees as the cents the server returned, formatted', async () => {
    const html = await render();

    expect(html).toContain('15.00');
    expect(html).toContain('20.00');
    // And no total before the first round trip: the total is the server's.
    // The unquoted copy lives in the sticky bar now.
    expect(html).toContain('Prices are per event');
    expect(html).not.toContain('Quoted total');
  });

  it('states the bundle schedule verbatim from the projection', async () => {
    const html = await render();

    expect(html).toContain('Bundle pricing');
    expect(html).toContain('2 events');
    expect(html).toContain('25.00');
  });

  it('restates the nearest deadline inside the sticky bar (refinement 3)', async () => {
    // The nearest OPEN deadline — the closed XD event's earlier moment must
    // not become the countdown.
    const html = await render();

    expect(html).toContain('14 Aug 2026, 23:59 UTC');
    expect(html).not.toContain('1 Aug 2026');
  });

  it('states the per-discipline caps from the projection', async () => {
    // R14 §4: refusal copy cannot name the breached discipline, so the rule
    // has to be READABLE BEFORE submission. A non-integer cap is skipped
    // exactly as `_discipline_breach` skips it.
    const html = await render({
      ...PAGE,
      policy: {
        ...PAGE.policy,
        disciplineCaps: { "Men's Singles": 1, 'Mixed Doubles': 2, Junk: 'lots' },
      },
    });

    const sentence = /Per discipline:[\s\S]*?per person\./.exec(html)?.[0] ?? '';
    expect(sentence).toContain('1 Men&#x27;s Singles event');
    expect(sentence).toContain('2 Mixed Doubles events');
    expect(sentence).not.toContain('Junk');
  });

  it('renders no discipline line when the director set no caps', async () => {
    expect(await render()).not.toContain('Per discipline');
  });

  it('says no event is taking entries — with a way back — when none is', async () => {
    // The 0-open-events state: no form (there is nothing to submit to), a
    // sentence and a link back to the tournament page. NOT a placeholder: the
    // page states a fact and offers an action.
    const html = await render({
      ...PAGE,
      events: PAGE.events.map((event) => ({ ...event, isOpen: false })),
    });

    expect(html).toContain('No event is taking entries right now');
    expect(html).toContain('href="/e/spring-open"');
    expect(html).not.toContain('action="/e/api/submit/spring-open"');
  });
});

// ---- the outcome of signing in, on the page it lands on --------------------

describe('signing in says so on the page the browser lands on', () => {
  /**
   * **E3, and the limit of what this tier can claim.** node's projection
   * fetch is anonymous by construction, so no document can state WHO is
   * reading it. What it can state is what just happened: `POST
   * /e/account/login` answers 303 to `next` only on success, so landing on
   * `/e/{slug}/enter/signed-in` is an outcome, not an identity. Who may
   * submit is still decided at the write.
   */
  it('confirms the sign-in on the /signed-in variant and nowhere else', async () => {
    const confirmed = await render(PAGE, '/e/spring-open/enter/signed-in');
    const plain = await render();

    expect(confirmed).toContain('You are signed in');
    expect(plain).not.toContain('You are signed in');
    // Non-vacuity: both really are the enter page, not an error boundary.
    expect(confirmed).toContain('action="/e/api/submit/spring-open"');
    expect(plain).toContain('action="/e/api/submit/spring-open"');
  });

  it('drops the sign-in invitation once the reader has signed in', async () => {
    const confirmed = await render(PAGE, '/e/spring-open/enter/signed-in');

    expect(confirmed).not.toContain('create one');
    expect(await render()).toContain('create one');
  });

  it('sends the sign-in handoff back to THIS route, confirming variant', async () => {
    // `next` names the /enter/signed-in variant, so the entrant lands back on
    // the form with the outcome stated — validated by `safeNext` here and
    // `next_target` at the far end.
    const html = await render();

    expect(html).toContain('/e/login?next=/e/spring-open/enter/signed-in');
  });

  it('keeps the sign-out control off the "you might not be signed in" claim', async () => {
    const plain = await render();
    const confirmed = await render(PAGE, '/e/spring-open/enter/signed-in');

    expect(plain).toContain('Signed in on this device?');
    expect(confirmed).not.toContain('Signed in on this device?');
    for (const html of [plain, confirmed]) {
      expect(html).toContain('action="/e/account/logout"');
    }
  });

  it('leaves room under the last field for the sticky bar to hover (E5)', async () => {
    // At 390px the bar is `position: sticky; bottom: 0`, so while the page
    // scrolls it sits OVER whatever is behind it — which was the
    // acknowledgment checkbox, the last thing an entrant has to read before
    // submitting. The native answer is padding on the scrolling content, so
    // the last field can scroll clear of the bar; from `lg:` up the bar is a
    // side rail and the padding goes away.
    const html = await render();
    const column =
      (html.match(/class="[^"]*grid gap-6[^"]*"/g) ?? []).find((a) => a.includes('pb-')) ?? '';

    expect(column).toMatch(/ pb-[0-9]/);
    expect(column).toContain('lg:pb-0');
  });

  it('sends the sign-UP handoff back to this tournament too (E3)', async () => {
    // The defect the demo walk found: "Sign in" carried a `next` and "create
    // one" was a bare `/e/signup`, so signing up lost the tournament the
    // entrant was in the middle of entering. The slug travels in the path —
    // one segment, no free-form destination — and `signup.tsx` composes the
    // return URL from it under the same allowlist.
    const html = await render();

    expect(html).toContain('href="/e/signup/spring-open"');
  });

  it('confirms a completed sign-up on the /created variant and nowhere else', async () => {
    // Where `POST /e/account/signup`'s 303 now lands. Same argument as
    // `/signed-in`: the backend redirects to `next` only after the sign-up
    // completed, so arriving here is an OUTCOME, not an identity — and the
    // copy grants nothing, because this tier cannot read a session either
    // way. The account exists; the entrant still has to sign in, and the
    // handoff beside it already carries the destination.
    const created = await render(PAGE, '/e/spring-open/enter/created');
    const plain = await render();

    expect(created).toContain('Your entrant account is ready');
    expect(plain).not.toContain('Your entrant account is ready');
    expect(created).toContain('/e/login?next=/e/spring-open/enter/signed-in');
    // Non-vacuity: it is the enter page, not an error boundary.
    expect(created).toContain('action="/e/api/submit/spring-open"');
  });

  it('keeps both variants of the workflow page out of search results', async () => {
    // The /signed-in variant says "You are signed in" to a crawler that is
    // not; the plain form page's canonical, linkable face is /e/{slug}. Both
    // carry noindex; the tournament page (covered in
    // `tournament.meta.test.ts`) is the indexable one.
    for (const path of ['/e/spring-open/enter', '/e/spring-open/enter/signed-in']) {
      expect(await render(PAGE, path)).toMatch(
        /<meta[^>]*name="robots"[^>]*content="noindex"/,
      );
    }
  });
});
