/**
 * SP-PROGRAM-1 Phase 6 — R11 evidence for the entrant application.
 *
 * **Scope, and why it is much smaller than the plan's Task 30 proposed.**
 * That task was written before the cut-over (Task 31, commit 84b73a3) landed
 * and assumed it would have to re-home all eighteen render-level claims of
 * the retired `tests/test_entries_public_routes.py`. The cut-over got there
 * first and homed fourteen of them in `products/scheduler/entrant/tests/`,
 * where they run inside a REQUIRED CI gate (`.github/workflows/ci.yml`, the
 * `entrant` job). Restating them here would move a green claim out of the
 * gate and into a suite CI deliberately never runs — a downgrade dressed as
 * coverage. `tests/test_entries_migration_parity.py` is the ledger and it
 * already points those rows at their real successors; it is unchanged by
 * this file.
 *
 * What is left is the two things NOTHING else in the repo can hold, because
 * both need a real browser in front of a real deployed stack:
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
 *   cd products/scheduler && FRONTEND_HOST_PORT=8090 BACKEND_HOST_PORT=8600 \
 *     docker compose up -d backend entrant frontend
 *   cd e2e && E2E_BASE_URL=http://localhost:8090 E2E_MANAGE_STACK=0 \
 *     npx playwright test tests/10-entrant-r11-evidence.spec.ts
 *
 * NOT in the PR gate: e2e boots Docker and the gates are deliberately lean.
 * That is an accepted limit, not an oversight — see the task report. It is
 * still a real executable control, which is more than R11 had before.
 */
import { expect, test, type Page } from '@playwright/test';
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
 * A workspace with an OPEN entry page and three events.
 *
 * `isOpen: true` is load-bearing: a closed page and an unknown slug answer
 * the same uniform 404 by design, so a seed that forgets it produces a spec
 * that screenshots an error page and asserts nothing about layout.
 *
 * The slug is unique per run because the stack keeps its SQLite file in a
 * bind mount across runs, and a slug is unique per deployment.
 */
async function seed(page: Page): Promise<string> {
  const slug = `spring-open-${Date.now().toString(36)}`;

  const created = await page.request.post('/api/tournaments', {
    headers: CSRF,
    data: { name: 'Riverside Spring Open' },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const tid = (await created.json()).id as string;

  const put = await page.request.put(`/api/tournaments/${tid}/entry-page`, {
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
    const res = await page.request.post(`/api/tournaments/${tid}/entry-events`, {
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const bucket: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = bucket;
    document.addEventListener('securitypolicyviolation', (e) => {
      bucket.push(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`);
    });
  });
});

test.beforeAll(() => {
  mkdirSync(shotDir, { recursive: true });
});

test.describe('entrant app — R11 evidence', () => {
  /**
   * The dual-width control AND the reviewable artefact, in one pass, because
   * they need the identical setup and splitting them would double a seed and
   * a page load to assert the same two viewports twice.
   */
  test('every entrant page holds both co-equal widths without overflowing', async ({
    page,
  }) => {
    const slug = await seed(page);
    const pages = [
      ['entry', `/e/${slug}`],
      ['signup', '/e/signup'],
      ['login', '/e/login'],
    ] as const;

    for (const { label, width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      for (const [name, path] of pages) {
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

  test('every entrant page carries the nginx security headers', async ({ page }) => {
    const slug = await seed(page);
    for (const path of [`/e/${slug}`, '/e/signup', '/e/login']) {
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
    const csp = async (path: string) =>
      (await page.goto(path))!.headers()['content-security-policy'];

    expect(await csp('/e/signup')).toContain(
      "script-src 'self' https://challenges.cloudflare.com",
    );
    expect(await csp('/e/signup')).toContain(
      "frame-src 'self' https://challenges.cloudflare.com",
    );
    for (const path of [`/e/${slug}`, '/e/login', '/']) {
      expect(await csp(path), path).not.toContain('challenges.cloudflare.com');
      expect(await csp(path), path).toContain("script-src 'self';");
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

  test('the entry page and the login page emit zero CSP violations', async ({
    page,
  }) => {
    const consoleHits = watchCsp(page);
    const slug = await seed(page);
    for (const path of [`/e/${slug}`, '/e/login']) {
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
