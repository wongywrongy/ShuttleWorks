/**
 * The no-JS contract, asserted on real server-rendered HTML.
 *
 * Rendered through the REAL @react-router/dev Vite pipeline and
 * `createRequestHandler` — request in, bytes out, no component mocking — the
 * same shape `design-system.test.ts` and `entry.loader.test.ts` already take,
 * and the same shape the backend's pytest+TestClient tests take. Everything
 * asserted here is therefore true of the bytes an entrant with JavaScript
 * disabled receives: it is the server response, before any hydration.
 *
 * (Deviation from the task brief, which proposed `createStaticHandler` in a
 * `.tsx` file under `app/routes/__tests__/`. This package's vitest `include`
 * is `tests/**\/*.test.ts` and its tsconfig only takes `tests/**\/*.ts`, so a
 * `.tsx` test there would not have run at all. Prior art already renders
 * through the real handler, which is a stronger assertion than a hand-built
 * static router anyway.)
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

/**
 * The REAL `GET /e/api/page/{slug}` projection (`api/entries_json.py:97-188`):
 * NESTED, `entryCount` not `entered`, `{name, eventId}` entrant rows, a
 * `policy` object and the three deadline fields. See the task report.
 *
 * **Shared with `scripts/measure-page-weight.mjs`, on purpose.** That script
 * renders the SAME route through the SAME handler to produce the number the
 * CI page-weight gate checks, and it used to carry a 60-line verbatim COPY of
 * this fixture. Drift there is silent and one-directional in the worst way: a
 * field dropped from the script's copy shrinks the measured HTML and buys
 * headroom against the gate that no real entry page has. One copy, in JSON,
 * because the two consumers share no module system — this file is TypeScript
 * run by vitest, that one is plain node.
 *
 * `viewer` is NOT in the JSON and is spread in below instead. The backend's
 * `tests/test_entrant_ssr_contract.py` polices every `viewer:` literal in this
 * directory by globbing `*.ts*` and cannot see a `.json` file; moving the
 * projection out of TypeScript would have quietly dropped that guard below its
 * own non-vacuity floor while looking like tidying. The one field under a
 * cross-tier control stays where the control can read it.
 */
import entryPageFixture from './helpers/entryPage.fixture.json';

// Derived from the fixture rather than restated, so the ids cannot drift out
// of step with the events they name.
const [MS, WD, SHUT] = entryPageFixture.events.map((event) => event.id);

const PAGE = {
  ...entryPageFixture,
  // **The only viewer projection a server-rendered page can ever receive.**
  // This used to read `{signedIn: true, formCsrf: 'csrf-token-abc'}`, which
  // the real backend cannot return to node: `apiFetch.server.ts` sends a
  // frozen `accept`-only allowlist, so `_optional_entrant` reads no cookie
  // and both fields are the anonymous values for every reader, signed in or
  // not. That fixture is what let the form ship gated on a flag that is
  // always false, carrying a token that could never match. The shape is now
  // held to the real route by `tests/test_entrant_ssr_contract.py` in the
  // backend suite, which fails on any fixture in this directory that claims
  // otherwise.
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

async function render(body: unknown = PAGE): Promise<string> {
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
  const res = await createRequestHandler(build, 'development')(
    new Request('http://entrant.test/e/spring-open'),
  );
  return res.text();
}

describe('the entry form, unhydrated', () => {
  it('is a plain form posting straight to FastAPI', async () => {
    // Not to an RR7 action: node renders and never relays a credential, so the
    // browser posts same-origin to the API tier directly.
    const html = await render();

    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toContain('action="/e/api/submit/spring-open"');
    // Case-insensitive because React 19's SSR stream emits the JSX spelling
    // verbatim — the observed bytes are `encType="application/x-www-form-
    // urlencoded"`. HTML attribute names are ASCII case-insensitive, so the
    // browser reads it as `enctype` either way; asserting the exact lowercase
    // spelling would be asserting React's serializer, not the contract.
    expect(html).toMatch(/enctype="application\/x-www-form-urlencoded"/i);
    // A form with no submit control is unsubmittable without script — the
    // whole point of this tier. `asChild`-ing the Button onto a non-submit
    // element, or dropping `type="submit"`, would leave every other
    // assertion in this file green.
    expect(html).toMatch(/<button[^>]*type="submit"/);
  });

  it('carries the double-submit token as a hidden field', async () => {
    // `_csrf` is `app/form_csrf.FORM_FIELD`. The value is the LOADER's
    // (R8-D) — a sha256 hex digest of the nonce minted for this very
    // response — and explicitly NOT the projection's `viewer.formCsrf`,
    // which is `''` above and always will be. Asserted as 64 hex characters
    // rather than as a fixed string, because the nonce is fresh per render;
    // the test below is the one that proves it is the RIGHT digest.
    const html = await render();

    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="_csrf"[^>]*value="[0-9a-f]{64}"/,
    );
    // The empty value the OLD code rendered — `viewer.formCsrf` — is
    // excluded by the `{64}` above; asserting `not.toContain('value=""')`
    // over the whole document instead would fail on the perfectly correct
    // empty `birthYear` fallback input.
    expect(html).not.toMatch(/name="_csrf" value=""/);
  });

  it('carries the loader-minted key in the field the backend reads', async () => {
    // `idempotencyKey`, NOT `Idempotency-Key`: the route reads
    // `form.get("idempotencyKey")` (`api/entries_json.py:617`); the hyphenated
    // spelling is the HEADER alias only, and a native form cannot send one.
    const html = await render();

    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="idempotencyKey"[^>]*value="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/,
    );
  });

  it('names the player fields exactly as parse_players reads them', async () => {
    const html = await render();

    for (const name of ['playerName', 'gender', 'club', 'birthYear', 'remarks']) {
      expect(html.match(new RegExp(`name="${name}"`, 'g'))).toHaveLength(2);
    }
  });

  it('renders a real birthYear input, not just the hidden fallback, when an open event is age-bracketed', async () => {
    // Every other fixture in this file sets `ageBracketed: false`, so the
    // `askBirthYear === true` branch (`entry.form.tsx:130-141`) was only ever
    // exercised via the hidden-input fallback — the occurrence count of 2
    // never proved the real `TextField` renders. Flip one open event.
    const html = await render({
      ...PAGE,
      events: PAGE.events.map((event) =>
        event.id === MS ? { ...event, ageBracketed: true } : event,
      ),
    });

    for (const name of ['playerName', 'gender', 'club', 'birthYear', 'remarks']) {
      expect(html.match(new RegExp(`name="${name}"`, 'g'))).toHaveLength(2);
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
    expect(html).toContain(`value="1:${WD}"`);
    // A closed event is not enterable, so it is absent from the form entirely
    // rather than present-and-refused.
    expect(html).not.toContain(`value="0:${SHUT}"`);
  });

  it('requires the acknowledgment in the markup itself', async () => {
    const html = await render();

    // Order-agnostic: React emits `required=""` BEFORE `name=` on this input,
    // so an ordered regex would pass or fail on the serializer's whim.
    const tag = html.match(/<input[^>]*name="acknowledged"[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('required=""');
    expect(tag).toContain('type="checkbox"');
  });

  it('renders the form whatever the viewer projection says (R8-E)', async () => {
    // The defect, as a test. The form was gated on `page.viewer.signedIn`,
    // which is `false` on every SSR page — so it was hidden from everyone,
    // and the copy shown instead linked to `/e/account/login`, a POST-only
    // route that answers 405.
    //
    // Fed BOTH projections: the real anonymous one, and the impossible
    // signed-in one the old fixtures used. The form renders either way,
    // because who may submit is decided by `Depends(get_current_entrant)` on
    // the write, which the browser reaches directly with its cookies.
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

  // The "no link into a FastAPI-owned prefix" control for THIS page lives in
  // `login.test.ts`, which reads every href out of the document and covers
  // login, signup and entry from one derived assertion. The hand-listed copy
  // that stood here named two URLs and could not see a third.

  it('states that submitting needs an account, since it cannot know', async () => {
    // The page CANNOT tell a signed-in reader from a stranger (see the
    // viewer fixture above), so the requirement is stated to everyone in
    // the same grammar as the caps and the bundle schedule, rather than
    // guessed at for anyone.
    expect(await render()).toContain('Submitting needs an entrant account');
  });

  it('prints per-event fees as the cents the server returned, formatted', async () => {
    const html = await render();

    expect(html).toContain('15.00');
    expect(html).toContain('20.00');
    // And no total: the total is the server's, from the quote/persist path.
    expect(html).toContain('The organiser confirms the total when they receive');
  });

  it('states the bundle schedule verbatim from the projection', async () => {
    // Carry-over from the Task 16 review: `entry.form.tsx` renders
    // `page.page.feeSchedule` and NOTHING asserted it, so the fixture's
    // `{ '2': 2500 }` could have vanished silently. R14 §4 requires the
    // pricing rule to be stated BEFORE submission, and the tier prices are
    // exactly the rule an entrant cannot infer from the per-event fees
    // (2500 is not 1500 + 2000). Formatted, never computed.
    const html = await render();

    expect(html).toContain('Bundle pricing');
    expect(html).toContain('2 events');
    expect(html).toContain('25.00');
  });

  it('states the per-discipline caps from the projection', async () => {
    // The Task 17 regression. `DISCIPLINE_CAP` refusal copy cannot name the
    // breached discipline (the echo carries a code and numeric subjects, and
    // re-deriving which cap broke would be a second implementation of
    // `_discipline_breach`), so the rule has to be READABLE BEFORE submission
    // — R14 §4, the same reason the bundle schedule is stated above. Before
    // this, `policy.disciplineCaps` was rendered nowhere in the entrant app
    // and an entrant was refused by a rule they were never shown.
    const html = await render({
      ...PAGE,
      policy: {
        ...PAGE.policy,
        disciplineCaps: { "Men's Singles": 1, 'Mixed Doubles': 2, Junk: 'lots' },
      },
    });

    // A non-integer cap is skipped exactly as `_discipline_breach` skips it,
    // so the form cannot state a limit the server would not enforce. Asserted
    // on the rendered sentence rather than the whole document, which is now
    // belt-and-braces: React used to stream the entire loader payload — junk
    // cap included — into `<Scripts/>`'s hydration script, so `html` contained
    // "Junk" either way. `app/root.tsx` no longer renders `<Scripts/>`, so it
    // does not; the narrow scope stays because the sentence is what this
    // asserts about.
    const sentence = /Per discipline:[\s\S]*?per person\./.exec(html)?.[0] ?? '';
    expect(sentence).toContain('1 Men&#x27;s Singles event');
    expect(sentence).toContain('2 Mixed Doubles events');
    expect(sentence).not.toContain('Junk');
  });

  it('renders no discipline line when the director set no caps', async () => {
    expect(await render()).not.toContain('Per discipline');
  });
});
