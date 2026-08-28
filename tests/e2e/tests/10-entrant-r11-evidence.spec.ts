/**
 * SP-PROGRAM-1 Phase 6 — R11 evidence for the entrant application.
 *
 * **Scope, and why it is much smaller than the plan's Task 30 proposed.**
 * That task was written before the cut-over (Task 31, commit 84b73a3) landed
 * and assumed it would have to re-home all eighteen render-level claims of
 * the retired `tests/test_entries_public_routes.py`. The cut-over got there
 * first and homed fourteen of them in `apps/entrant/tests/`,
 * where they run inside a REQUIRED CI gate (`.github/workflows/ci.yml`, the
 * `entrant` job). Restating them here would move a green claim out of the
 * gate and into a suite CI deliberately never runs — a downgrade dressed as
 * coverage. `tests/test_entries_migration_parity.py` is the ledger and it
 * already points those rows at their real successors; it is unchanged by
 * this file.
 *
 * What is left is the things NOTHING else in the repo can hold, because they
 * need a real browser in front of a real deployed stack — the two below, plus
 * the three IA controls SP-P6-2 added (see "Repointed", further down):
 *
 * 1. **R11's two co-equal widths.** The four claims the ledger records as
 *    deliberate drops (`test_the_page_is_built_for_a_390px_screen`,
 *    `test_the_page_carries_both_a_phone_layout_and_a_desktop_layout`,
 *    `test_nothing_in_the_stylesheet_fixes_a_pixel_width`, and the receipt's
 *    copy claim) all asserted the contents of a hand-rolled inline `<style>`
 *    block the entrant tier no longer emits. The ledger says plainly that a
 *    class-name spelling check is not viewport coverage, and it is right.
 *    Layout needs a layout engine: jsdom computes none, so vitest cannot see
 *    this at any price. Here it is asserted directly — the document does not
 *    scroll horizontally at 390px or at 1440px, against the real Tailwind
 *    build — and the screenshots are the reviewable artefact.
 *
 * **Repointed at the SP-P6-2 page system (Phase D).** This file was written
 * against SP-P6-1's inventory, where `/e/{slug}` WAS the entry form and there
 * were three public pages. SP-P6-2 replaced that with an information
 * architecture — discovery at `/e/`, a tabbed tournament page at `/e/{slug}`,
 * a separate entry flow at `/e/{slug}/enter` — and deleted the markup the
 * three page visits below used to measure. A viewport control aimed at pages
 * that no longer exist is not a weaker control, it is a green one that checks
 * nothing, so the inventory is the new one and it is now SEVEN pages rather
 * than three. `PAGES` below is the whole public surface a signed-out visitor
 * can reach: everything with a `<PlayShell>` and everything without one.
 *
 * The Entrants tab is deliberately NOT in that list. It renders only when the
 * entrant list is non-empty (brief rule 4, no placeholder tabs), and an entry
 * can only be created by a real public submission — an entrant account, a
 * session cookie, a form CSRF token and a Turnstile solve. Rather than seed
 * all of that to screenshot one more panel, the phase-gating fact is asserted
 * directly instead: with events but no entrants, the tab bar has exactly two
 * tabs and the third is absent from the document.
 *
 * Three IA claims came with the repoint, each one a thing a screenshot cannot
 * tell from its failure mode: the seeded tournament actually appears on
 * discovery as a card (otherwise the discovery measurement is of an empty
 * results panel), the gated-off tab is absent AND unaddressable by `?tab=`,
 * and the hero CTA NAVIGATES to `/e/{slug}/enter` rather than scrolling to a
 * form on the same document — which is the entire content of brief §3.
 *
 * 2. **CSP, enforced by a browser.** The policy comes from nginx
 *    (`frontend/security-headers.conf`), not from the app, so no dev server
 *    and no unit test is ever sent one. `entry.render.test.ts` already
 *    proves the STRUCTURAL half in the gate — the rendered entry page
 *    contains no `<script>` at all, and a document with no scripts cannot
 *    violate `script-src`. That is strictly stronger than observing zero
 *    violations, and it is why the entry page below is expected clean.
 *    It does not generalise: `routes/signup.tsx` writes its own
 *    `<script src="https://challenges.cloudflare.com/...">` directly into
 *    the markup, outside the `<Scripts/>` that `root.tsx` dropped, so that
 *    one page needs — and gets, on that path only — a CSP that admits it.
 *    This pass found `script-src 'self'` blocking it and 403ing every
 *    entrant signup; the two tests below are what keep that fixed.
 *
 * Output: `.playwright-mcp/entrant-<page>-<width>.png` at the repo root —
 * gitignored, and the documented home for screenshots (CLAUDE.md, "Known
 * hazards"): an explicit path, never a bare filename.
 *
 * Run against an already-running stack (the ports below are overridable
 * because :80 and :8000 are frequently taken on a dev box):
 *
 *   FRONTEND_HOST_PORT=8090 PLAY_HOST_PORT=8091 BACKEND_HOST_PORT=8600 \
 *     docker compose up -d backend entrant frontend
 *   cd tests/e2e && E2E_BASE_URL=http://localhost:8090 \
 *     E2E_PLAY_BASE_URL=http://localhost:8091 E2E_MANAGE_STACK=0 \
 *     npx playwright test tests/10-entrant-r11-evidence.spec.ts
 *
 * TWO base URLs since SP-HOST-1: the operator origin (8080 in the container)
 * and the public one (8081). They are separate hostnames in a real
 * deployment; here they are the frontend container's two published ports.
 *
 * NOT in the PR gate: e2e boots Docker and the gates are deliberately lean.
 * That is an accepted limit, not an oversight — see the task report. It is
 * still a real executable control, which is more than R11 had before.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
type SessionCookies = Awaited<ReturnType<BrowserContext['cookies']>>;

/** The `playwright` worker fixture's type; only `request.newContext` is used. */
type PlaywrightT = {
  request: {
    newContext: (options: {
      baseURL: string;
      storageState?: { cookies: SessionCookies; origins: [] };
    }) => Promise<import('@playwright/test').APIRequestContext>;
  };
};
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// CommonJS-style `__dirname` is undefined under Playwright's ESM loader (the
// e2e package is `type: "module"`). Re-derive it from import.meta.
const shotDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.playwright-mcp',
);

/** R11's two co-equal widths: a phone held in one hand, and a laptop. */
const WIDTHS = [
  { label: '390px', width: 390, height: 844 },
  { label: '1440px', width: 1440, height: 900 },
] as const;

const CSRF = { 'X-ShuttleWorks-CSRF': '1' };

/**
 * A submission id shaped like the real thing, for a receipt that was never
 * submitted.
 *
 * Not a shortcut — it is the receipt route's documented property, exercised.
 * `receipt.tsx` performs NO account-scoped read (node holds no entrant
 * credential and must not grow one), so the page is assembled from the public
 * projection, the query string and the UUID in the path. Any well-formed UUID
 * therefore renders the identical page, which is exactly what
 * `entrant/tests/receipt.test.ts` pins. That makes the receipt reachable here
 * without seeding an entry, and a v4-shaped literal keeps it obvious that no
 * real submission is being impersonated.
 */
const RECEIPT_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Every public page a signed-out visitor can reach, as `(name, path)` of a
 * seeded slug. `?tab=` panels count as separate pages: the tournament route
 * renders one server-side panel per tab (no JS), so Events is a different
 * document from Overview and a different thing to lay out.
 */
const PAGES = (slug: string) =>
  [
    ['discovery', '/e/'],
    ['tournament-overview', `/e/${slug}`],
    ['tournament-events', `/e/${slug}?tab=events`],
    ['enter', `/e/${slug}/enter`],
    ['receipt', `/e/${slug}/receipt/${RECEIPT_ID}?totalCents=5500`],
    ['signup', '/e/signup'],
    ['login', '/e/login'],
  ] as const;

/**
 * A workspace with an OPEN entry page, a date, a venue and three events.
 *
 * `isOpen: true` is load-bearing: a closed page and an unknown slug answer
 * the same uniform 404 by design, so a seed that forgets it produces a spec
 * that screenshots an error page and asserts nothing about layout.
 *
 * `tournamentDate` and the venue fields are load-bearing for the same reason
 * one layer up: discovery's card anatomy is a date badge, a name, a venue
 * locality, an events count and a status chip, and every one of those
 * collapses when its field is absent (deliberately — rule 4 forbids
 * placeholders). Seeding them all is what makes the card measured here the
 * card an entrant sees. The date is a fortnight out so the chip reads
 * "Entries open" rather than a countdown that changes with the calendar.
 *
 * The slug is unique per run because the stack keeps its SQLite file in a
 * bind mount across runs, and a slug is unique per deployment.
 */
/**
 * The operator identity the seeds run as, and the session obtained ONCE for
 * the whole file.
 *
 * `AUTH_MODE=local` resolves a credential-less request to the bootstrap
 * operator, so the seed below used to post anonymously and that worked
 * everywhere this spec had ever run. It stops working the moment the stack is
 * the one the demo actually uses (`AUTH_MODE=cloud`), where every write 401s
 * `{"detail":"Not signed in"}` — a seed failure reported as a layout failure,
 * in every test at once.
 *
 * **Once per file, not once per test, because nginx says so.**
 * `frontend/nginx.conf` rate-limits `/api/auth/` at `10r/m burst=5`. Signing
 * in inside `seed()` put two auth requests in front of every test and the
 * later ones came back 429 from the edge before the backend ever saw them.
 * That limit is production's and is not the thing under test here, so the
 * session is obtained once in `beforeAll` and replayed onto each test's
 * context as cookies — total cost, two auth requests per run.
 *
 * The mode is ASKED rather than assumed, and asked of the cheap route:
 * `/e/api/config` publishes `authMode` (it exists so the entrant tier can
 * learn exactly this) and sits under the far looser `sw_entries` limit.
 *
 * **Login first, register only on 401 — the order is not arbitrary.** Both
 * per-IP budgets are charged by FAILURES: a failed login charges the
 * credential bucket (5 per 15 min) and a successful register charges the
 * registration bucket (5 per hour). A fixed identity, registered once and
 * logged into thereafter, costs one charged request in the lifetime of a
 * database; a fresh account per run would burn the registration budget.
 */
const OPERATOR = {
  email: 'e2e-entrant-evidence@simulator.example.test',
  password: 'E2eOperator2026!',
  displayName: 'Entrant evidence (e2e)',
};

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost';

/**
 * The PUBLIC tier's own base URL (SP-HOST-1).
 *
 * `/e/*` moved off the operator origin. In production the two are separate
 * HOSTNAMES on one Cloudflare tunnel; in a compose stack they are the two
 * published ports of the one `frontend` container, 8080 and 8081. Either way
 * a page under `/e/` is no longer reachable from `BASE_URL`, and the operator
 * `/api/` is no longer reachable from here — the play tier has no `/api/`
 * location at all, by design.
 *
 * So this file navigates against the play origin and reaches the operator API
 * by ABSOLUTE url in its setup and teardown. The two halves are named
 * separately rather than derived from each other, because the relationship
 * between them is a deployment's to decide.
 *
 * **A caveat this spec is the natural place to record.** Port-based
 * separation isolates JS-visible storage but NOT cookies: cookie scope
 * ignores the port, so `http://localhost:8080` and `http://localhost:8081`
 * share one jar. The isolation is real only where the two are different
 * hostnames, which is the deployed shape. Locally, the thing keeping the
 * operator session off the entrant tier is the nginx Cookie allowlist —
 * which is precisely why SP-HOST-1 kept it instead of deleting it as
 * redundant.
 */
const PLAY_BASE_URL = process.env.E2E_PLAY_BASE_URL ?? 'http://localhost:8081';

/** Empty in local mode, where no credential is needed. */
let sessionCookies: SessionCookies = [];

/**
 * Every workspace this file created, deleted in `afterAll`.
 *
 * Not tidiness. This spec is documented to run against the DEMO stack, and
 * since SP-P6-2 an open entry page is not a private URL any more — it is a
 * card on `/e/`, the site's front door. Nine tests each seeding one
 * "Riverside Spring Open" therefore used to leave nine fixture tournaments in
 * front of whoever the demo is being shown to, growing by nine every run. The
 * old inventory had no discovery page and so no way to notice.
 */
const created: string[] = [];

async function establishSession(playwright: PlaywrightT): Promise<void> {
  const api = await playwright.request.newContext({ baseURL: BASE_URL });
  try {
    const config = await api.get(`${PLAY_BASE_URL}/e/api/config`);
    expect(config.ok(), await config.text()).toBeTruthy();
    if ((await config.json()).authMode !== 'cloud') return;

    const login = await api.post('/api/auth/login', {
      headers: CSRF,
      data: { email: OPERATOR.email, password: OPERATOR.password },
    });
    if (!login.ok()) {
      const registered = await api.post('/api/auth/register', {
        headers: CSRF,
        data: OPERATOR,
      });
      expect(registered.ok(), await registered.text()).toBeTruthy();
    }
    sessionCookies = (await api.storageState()).cookies;
  } finally {
    await api.dispose();
  }
}

async function seed(page: Page): Promise<string> {
  const slug = `spring-open-${Date.now().toString(36)}`;
  const date = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const workspace = await page.request.post(`${BASE_URL}/api/tournaments`, {
    headers: CSRF,
    data: { name: 'Riverside Spring Open', tournamentDate: date },
  });
  expect(workspace.ok(), await workspace.text()).toBeTruthy();
  const tid = (await workspace.json()).id as string;
  created.push(tid);

  const put = await page.request.put(`${BASE_URL}/api/tournaments/${tid}/entry-page`, {
    headers: CSRF,
    data: {
      slug,
      isOpen: true,
      introText: 'All welcome. Entries close two weeks before the first match.',
      regulationsText:
        'Play fair. Bring your own shuttles. The referee decides, and that is that.',
      feeSchedule: { '1': 4000, '2': 5500 },
      paymentInstructions:
        'Zelle to treasurer@riverside.example, quoting your entry reference.',
      venueName: 'Riverside Sports Hall',
      venueAddress: '12 Mill Lane, Riverside',
    },
  });
  expect(put.ok(), await put.text()).toBeTruthy();

  for (const event of [
    { code: 'MS', discipline: "Men's Singles", entryType: 'singles', genderConstraint: 'M' },
    { code: 'WS', discipline: "Women's Singles", entryType: 'singles', genderConstraint: 'F' },
    { code: 'XD', discipline: 'Mixed Doubles', entryType: 'doubles', genderConstraint: 'mixed' },
  ]) {
    const res = await page.request.post(`${BASE_URL}/api/tournaments/${tid}/entry-events`, {
      headers: CSRF,
      data: event,
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }

  return slug;
}

/**
 * Collect CSP violations the way a browser reports them.
 *
 * Two channels because they catch different failures: the DOM
 * `securitypolicyviolation` event fires for blocked inline/eval/src, and a
 * console message is what a blocked EXTERNAL script produces. Installed via
 * `addInitScript` so it is in place before the first document runs, and the
 * console hook is attached before any navigation.
 */
function watchCsp(page: Page): string[] {
  const hits: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) hits.push(msg.text());
  });
  return hits;
}

async function drainCsp(page: Page, consoleHits: string[]): Promise<string[]> {
  const fromDom = await page.evaluate(
    () => (window as unknown as { __csp?: string[] }).__csp ?? [],
  );
  return [...new Set([...consoleHits, ...fromDom])];
}

/**
 * The mechanical half of R11's "two co-equal widths": the document must not
 * scroll sideways.
 *
 * `scrollWidth > clientWidth` on the root element IS the horizontal
 * scrollbar — it is the property a person actually experiences, so it is the
 * assertion. The element sweep only builds the failure message, naming the
 * widest offenders so a red run says which box burst rather than only that
 * one did. `+ 1` absorbs sub-pixel layout rounding, which is not overflow.
 */
async function expectNoOverflow(page: Page, where: string): Promise<void> {
  const report = await page.evaluate(() => {
    const root = document.documentElement;
    const limit = root.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => el.getBoundingClientRect().right > limit + 1)
      .slice(0, 5)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(/\s+/)[0]}` : ''} right=${Math.round(r.right)}`;
      });
    return { scrollWidth: root.scrollWidth, clientWidth: limit, offenders };
  });

  expect(
    report.scrollWidth,
    `${where}: the document scrolls horizontally (scrollWidth ${report.scrollWidth} > clientWidth ${report.clientWidth}). Widest boxes: ${report.offenders.join(', ') || 'none identified'}`,
  ).toBeLessThanOrEqual(report.clientWidth + 1);
}

test.beforeEach(async ({ page, context }) => {
  // Replay the one session onto this test's fresh jar. `page.request` shares
  // it, so the seed's writes and the navigations after them are one identity.
  if (sessionCookies.length > 0) await context.addCookies(sessionCookies);
  await page.addInitScript(() => {
    const bucket: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = bucket;
    document.addEventListener('securitypolicyviolation', (e) => {
      bucket.push(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`);
    });
  });
});

test.beforeAll(async ({ playwright }) => {
  mkdirSync(shotDir, { recursive: true });
  await establishSession(playwright as unknown as PlaywrightT);
});

test.afterAll(async ({ playwright }) => {
  // Built FROM the stored session rather than signing in again — a teardown
  // must not spend more of the `sw_auth` budget than the run itself.
  const api = await (playwright as unknown as PlaywrightT).request.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: sessionCookies, origins: [] },
  });
  try {
    for (const tid of created.splice(0)) {
      await api.delete(`${BASE_URL}/api/tournaments/${tid}`, { headers: CSRF });
    }
  } finally {
    await api.dispose();
  }
});

test.describe('entrant app — R11 evidence', () => {
  // Every `page.goto()` below is a path under `/e/`, which lives on the
  // public origin since SP-HOST-1. The operator API calls in `seed()` and the
  // hooks above name `BASE_URL` explicitly for the same reason.
  test.use({ baseURL: PLAY_BASE_URL });

  /**
   * The dual-width control AND the reviewable artefact, in one pass, because
   * they need the identical setup and splitting them would double a seed and
   * a page load to assert the same two viewports twice.
   */
  test('every entrant page holds both co-equal widths without overflowing', async ({
    page,
  }) => {
    const slug = await seed(page);

    for (const { label, width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      for (const [name, path] of PAGES(slug)) {
        const res = await page.goto(path);
        // A 404 renders too, and would screenshot and measure perfectly
        // happily while proving nothing about the page under test.
        expect(res?.status(), `${name} at ${label}`).toBe(200);
        await expectNoOverflow(page, `${name} at ${label}`);
        await page.screenshot({
          path: resolve(shotDir, `entrant-${name}-${label}.png`),
          fullPage: true,
        });
      }
    }
  });

  /**
   * The seeded tournament is on the list, and the list is the front door.
   *
   * Without this the discovery screenshot above is satisfiable by an empty
   * calendar: `/e/` answers 200 and lays out perfectly with no rows at all,
   * so "no horizontal scroll" would be measuring the empty state while
   * claiming to measure the season calendar. Asserting the seeded row is
   * present — by its own link, not by a count, since the demo database this
   * runs against carries other tournaments — is what makes the measurement
   * about the thing it is named after. (`#calendar` is the SeasonCalendar
   * card's anchor since SP-P8; the pre-P8 `#results` panel no longer exists.)
   */
  test('discovery lists the seeded tournament as a calendar row', async ({ page }) => {
    const slug = await seed(page);
    await page.goto('/e/');
    await expect(page.locator(`#calendar a[href="/e/${slug}"]`)).toHaveText(
      'Riverside Spring Open',
    );
    await expect(page.locator('#calendar')).toContainText('Entries open');
  });

  /**
   * Phase-gating, at the only altitude that can see it (brief rule 4: a tab
   * renders when its data exists, and never as a placeholder or a disabled
   * control).
   *
   * The seed creates three entry EVENTS and no entries, so Overview and
   * Events must both be tabs and Entrants must be absent from the document —
   * not greyed, not "no entrants yet", absent. `visibleTabs` is unit-tested
   * as a pure function; what is asserted here is that the running page obeys
   * it, and that a `?tab=` naming a gated-off panel falls back to Overview
   * rather than rendering an empty one.
   */
  test('a tab with no data does not render, and is not addressable by ?tab=', async ({
    page,
  }) => {
    const slug = await seed(page);
    await page.goto(`/e/${slug}`);

    // `aria-label` rather than a class: `TabBar` names the bar for screen
    // readers and that name is the contract, so this breaks if the labelling
    // regresses too.
    const tabs = page.locator('nav[aria-label="Tournament sections"] a');
    await expect(tabs).toHaveText(['Overview', 'Events']);

    // The panel, not just the tab: asking for the gated-off one must land on
    // Overview, which is the intro text and the card grid.
    await page.goto(`/e/${slug}?tab=entrants`);
    await expect(page.locator('[aria-current="page"]')).toHaveText('Overview');
  });

  /**
   * The entry flow is a SEPARATE page, and the CTA is a link or it is text —
   * never a disabled button (design §6, Z8).
   *
   * This is the one IA element that a screenshot cannot distinguish from its
   * failure mode: an `Enter` that scrolls to a form further down the same
   * document looks identical to one that navigates, and the whole point of
   * the brief's §3 is that it navigates.
   */
  test('the tournament CTA navigates to the separate entry page', async ({ page }) => {
    const slug = await seed(page);
    await page.goto(`/e/${slug}`);
    await page.getByRole('link', { name: /Enter this tournament/i }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${slug}/enter$`));
    // `#enter` by id: the page carries three forms (the header search and the
    // sign-out POST are the others), and only this one is the entry.
    await expect(page.locator('form#enter')).toContainText('Player 1');
  });

  test('every entrant page carries the nginx security headers', async ({ page }) => {
    const slug = await seed(page);
    for (const [, path] of PAGES(slug)) {
      const res = await page.goto(path);
      const headers = res!.headers();
      // The policy under which the CSP tests below mean anything. Asserted
      // per path because nginx drops every INHERITED add_header the moment a
      // location declares one of its own — the exact trap
      // security-headers.conf exists to prevent, and one that shows up as a
      // silently unprotected location, never as an error.
      expect(headers['content-security-policy'], path).toContain("script-src 'self'");
      expect(headers['content-security-policy'], path).toContain(
        "frame-ancestors 'self'",
      );
      expect(headers['x-content-type-options'], path).toBe('nosniff');
    }
  });

  /**
   * The Turnstile allowance is SCOPED, and this is what holds it there.
   *
   * `$sw_turnstile_origin` (frontend/nginx.conf) adds
   * challenges.cloudflare.com to `script-src`/`frame-src` on `/e/signup` and
   * nowhere else, because both tiers share one origin and the operator
   * console has no use for a third-party script host. Replacing the map's
   * `~^/e/signup` with `~^/e/`, or moving the origin into the snippet's
   * literal policy, turns this red — which is the only way that widening
   * would otherwise be noticed.
   *
   * The operator SPA at `/` is checked too, and it is the one that matters
   * most: it is the surface an XSS would be worth something on.
   */
  test('only the signup page trusts challenges.cloudflare.com', async ({ page }) => {
    const slug = await seed(page);
    const headersFor = async (path: string) => (await page.goto(path))!.headers();

    const signupHeaders = await headersFor('/e/signup');
    const signupCsp = signupHeaders['content-security-policy'];
    expect(signupCsp).toContain(
      "script-src 'self' https://challenges.cloudflare.com",
    );
    expect(signupCsp).toContain(
      "frame-src 'self' https://challenges.cloudflare.com",
    );
    // Every other public page, plus the operator SPA at `/`. Sweeping the
    // whole inventory rather than a sample is what makes a widened `map`
    // regex fail here: `~^/e/` would match discovery and the enter page, and
    // a two-path sample would happily miss both.
    const others = PAGES(slug)
      .map(([, path]) => path)
      .filter((path) => path !== '/e/signup');
    for (const path of [...others, '/']) {
      const csp = (await headersFor(path))['content-security-policy'];
      expect(csp, path).not.toContain('challenges.cloudflare.com');
      expect(csp, path).toContain("script-src 'self';");
    }
  });

  /**
   * The NEGATIVE CONTROL for the two CSP tests below, and the reason they
   * are not vacuous.
   *
   * "Zero violations observed" is the single easiest green in this repo to
   * fake: a browser that was never sent a policy, or a watcher wired to an
   * event that never fires, reports exactly the same empty array as a page
   * that is genuinely clean. This injects an inline script — which
   * `script-src 'self'` with no `'unsafe-inline'` and no nonce must block —
   * and requires that the watcher SEES it. If this goes green while the
   * others do too, the others mean something.
   */
  test('the CSP watcher is not blind: an injected inline script is reported', async ({
    page,
  }) => {
    const consoleHits = watchCsp(page);
    await page.goto('/e/login');
    await page
      .addScriptTag({ content: 'window.__cspProbeRan = true;' })
      .catch(() => {
        // Playwright rejects when the injected tag never executes, which IS
        // the blocking this test is here to observe. Swallowed so the
        // assertions below are what decide the verdict.
      });
    const violations = await drainCsp(page, consoleHits);
    expect(violations.join('\n')).toMatch(/script-src/);
    // Belt and braces: the script must not have RUN, not merely have been
    // reported. A policy that reports and permits is report-only by another
    // name.
    expect(
      await page.evaluate(
        () => (window as unknown as { __cspProbeRan?: boolean }).__cspProbeRan ?? false,
      ),
    ).toBe(false);
  });

  test('every page but signup emits zero CSP violations', async ({ page }) => {
    const consoleHits = watchCsp(page);
    const slug = await seed(page);
    // Signup is excluded because it is the one page that legitimately loads a
    // third-party script; it has its own test below, which additionally
    // proves the widget actually renders.
    for (const [, path] of PAGES(slug).filter(([, p]) => p !== '/e/signup')) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    expect(await drainCsp(page, consoleHits)).toEqual([]);
  });

  /**
   * WAS the pinned ship blocker; now the control that keeps it fixed.
   *
   * This case shipped as a `test.fail()` — a defect that RUNS, so the day it
   * was fixed the suite went red on an unexpected pass and forced the marker
   * out. That is what happened. The defect: `routes/signup.tsx` renders
   * `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">`
   * straight into the markup (`root.tsx` dropping `<Scripts/>` removed React
   * Router's hydration scripts, not a tag a route writes itself), and nginx
   * sent `script-src 'self'`, so the browser blocked the widget, the form
   * posted no `cf-turnstile-response`, and `verify_turnstile('')` refused with
   * no round trip: every entrant signup answered 403 AUTH_CHALLENGE_FAILED in
   * every deployed stack, and since R10 puts entry submission behind an
   * entrant session, no entrant could enter a tournament at all.
   *
   * Fixed by `$sw_turnstile_origin` in `frontend/nginx.conf` — Cloudflare's
   * documented `script-src`/`frame-src` requirement, scoped to this one path.
   *
   * The widget assertions are not decoration. Zero violations is satisfiable
   * by a page that stopped rendering the widget at all — the same 403 by a
   * quieter route. So both directives are checked by their EFFECT: the token
   * input is what only the script can populate, and the challenge frame is
   * what only `frame-src` can admit. All three, or none of them means much.
   */
  test('the signup page renders the Turnstile widget and emits zero CSP violations', async ({
    page,
  }) => {
    const consoleHits = watchCsp(page);
    await page.goto('/e/signup');
    // NOT `waitForLoadState('networkidle')` — the two tests above can use it
    // and this one cannot. A live Turnstile widget keeps a connection open, so
    // this page never goes idle and the wait burns the whole timeout.
    //
    // The token input is the whole point of the page: `api.js` creates it and
    // writes the solved challenge into it, the form posts it as
    // `cf-turnstile-response`, and `verify_turnstile` refuses an empty one
    // with no round trip. Non-empty here IS "a signup can succeed".
    //
    // Asserted on the INPUT and the FRAME rather than on `.cf-turnstile
    // iframe`, which never matches: Turnstile puts its iframe in a CLOSED
    // shadow root, which Playwright's selector engine cannot pierce (its CSS
    // pierces open roots only). Verified against the real widget.
    await expect(page.locator('input[name="cf-turnstile-response"]')).not.toHaveValue(
      '',
    );
    expect(
      page.frames().map((f) => f.url()),
      'no challenges.cloudflare.com frame attached — frame-src is blocking it',
    ).toContainEqual(expect.stringContaining('https://challenges.cloudflare.com/'));
    expect(await drainCsp(page, consoleHits)).toEqual([]);
  });
});
