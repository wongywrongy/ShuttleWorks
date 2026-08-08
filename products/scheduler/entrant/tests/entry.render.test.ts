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

const MS = '11111111-1111-4111-8111-111111111111';
const WD = '22222222-2222-4222-8222-222222222222';
const SHUT = '33333333-3333-4333-8333-333333333333';

/**
 * The REAL `GET /e/api/page/{slug}` projection (`api/entries_json.py:97-188`):
 * NESTED, `entryCount` not `entered`, `{name, eventId}` entrant rows, a
 * `policy` object and the three deadline fields. See the task report.
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
      entryCount: 7,
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
      entryCount: 4,
    },
    {
      id: SHUT,
      code: 'XD',
      discipline: 'Mixed Doubles',
      feeCents: 3000,
      genderConstraint: null,
      opensAt: null,
      closesAt: null,
      withdrawsUntil: null,
      isOpen: false,
      ageBracketed: false,
      entryCount: 1,
    },
  ],
  entrants: [{ name: 'Ada Lovelace', eventId: MS }],
  viewer: { signedIn: true, email: 'ada@example.com', formCsrf: 'csrf-token-abc' },
};

function signedOut() {
  return { ...PAGE, viewer: { signedIn: false, email: null, formCsrf: '' } };
}

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
    // `_csrf` is `app/form_csrf.FORM_FIELD`; the value is the projection's
    // `viewer.formCsrf`, never re-derived here.
    const html = await render();

    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="_csrf"[^>]*value="csrf-token-abc"/,
    );
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

  it('shows a sign-in path instead of a form when signed out', async () => {
    // No session is a login path, never a 404.
    const html = await render(signedOut());

    expect(html).not.toContain('action="/e/api/submit/spring-open"');
    expect(html).toContain('href="/e/account/login?next=%2Fe%2Fspring-open"');
    expect(html).toContain('href="/e/account/signup?next=%2Fe%2Fspring-open"');
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
    // on the rendered sentence, not on the whole document: React streams the
    // entire loader payload — junk cap included — into the hydration script,
    // so `html` contains "Junk" either way.
    const sentence = /Per discipline:[\s\S]*?per person\./.exec(html)?.[0] ?? '';
    expect(sentence).toContain('1 Men&#x27;s Singles event');
    expect(sentence).toContain('2 Mixed Doubles events');
    expect(sentence).not.toContain('Junk');
  });

  it('renders no discipline line when the director set no caps', async () => {
    expect(await render()).not.toContain('Per discipline');
  });
});
