/**
 * INTERACTION SMOKE — the test layer the unit suite structurally cannot provide.
 *
 * Why this exists: the vitest suite was fully green while a viewer could not
 * edit anything, the Run view's Undo buttons 409'd on every press, and a
 * rejected roster delete silently killed all further saving. Unit tests mock the
 * handlers and the stores, so they validate LOGIC; nothing validated that
 * PRESSING THE UI in a real composition doesn't break. Both layers are required.
 *
 * What it asserts:
 *   1. Pressing every interactive element on each view produces ZERO runtime
 *      failures — no uncaught error, no unhandled rejection, no React
 *      error-boundary catch, and no native dialog (window.confirm is banned; it
 *      also blocks the event loop and would hang this suite).
 *   2. A handful of real user flows work end-to-end against real stores.
 *
 * The error harness (`src/platform/errorHarness.ts`) is baked into the build via
 * VITE_ERROR_HARNESS=1 and records every failure signal with the interaction
 * that triggered it, so a failure here names the button that broke.
 *
 * NOISE FILTER: `console.error` is deliberately NOT fatal on its own. The audit
 * calibrated three benign sources that would otherwise make this suite
 * permanently red:
 *   - the browser's own resource log for `GET /bracket` 404 (meaning "no bracket
 *     yet"; the client handles it and returns null)
 *   - a stale suggestion Apply (409/410 → handled, dropped, info toast)
 *   - React's act() / dev warnings, which don't apply to a prod build
 * Uncaught errors, unhandled rejections and boundary catches ARE fatal — those
 * are what "a button broke" actually looks like.
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Required, deliberately: this used to fall back to a hardcoded workspace id,
 * and that fallback hid a broken seed script for a whole session — against a
 * workspace that doesn't exist, the app renders an error page with almost no
 * controls, so "press everything" presses nothing and the suite passes VACUOUSLY.
 * A gate that goes green when its fixture is missing is worse than no gate.
 * Seed with interaction-sweep/seed-smoke.mjs, which prints `tid=`/`viewerTid=`.
 */
const TID = process.env.SMOKE_TID;
if (!TID) {
  throw new Error(
    'SMOKE_TID is required — seed a workspace with e2e/interaction-sweep/seed-smoke.mjs first',
  );
}
const DISPLAY_TOKEN = process.env.SMOKE_DISPLAY_TOKEN;
if (!DISPLAY_TOKEN) {
  throw new Error(
    'SMOKE_DISPLAY_TOKEN is required — seed a workspace with e2e/interaction-sweep/seed-smoke.mjs first',
  );
}
const VIEWER_TID = process.env.SMOKE_VIEWER_TID;
if (!VIEWER_TID) {
  throw new Error(
    'SMOKE_VIEWER_TID is required — create and demote a viewer workspace with the interaction-sweep fixture first',
  );
}

type HarnessEvent = {
  kind: 'error' | 'unhandledrejection' | 'console.error' | 'boundary';
  message: string;
  route: string;
  interaction: { selector: string; name: string } | null;
};

/** Failures that mean a press actually broke something. */
const FATAL = new Set(['error', 'unhandledrejection', 'boundary']);

async function drainHarness(page: Page): Promise<HarnessEvent[]> {
  return page.evaluate(() => {
    const h = (window as unknown as { __swErrorHarness?: { events: HarnessEvent[] } })
      .__swErrorHarness;
    if (!h) throw new Error(
      'error harness absent — build the app with VITE_ERROR_HARNESS=1',
    );
    return h.events.splice(0, h.events.length);
  }) as Promise<HarnessEvent[]>;
}

function describeFailures(events: HarnessEvent[]): string {
  return events
    .map(
      (e) =>
        `  [${e.kind}] ${e.message.split('\n')[0]}\n` +
        `      route: ${e.route}\n` +
        `      pressed: ${e.interaction?.name ?? '(unknown)'} — ${e.interaction?.selector ?? ''}`,
    )
    .join('\n');
}

const VIEWS = [
  'overview',
  'roster',
  'matches',
  'setup',
  'schedule',
  'live',
  'tv',
  'display-config',
  'ws-venue',
  'ws-members',
  'ws-sharing',
  'ws-modules',
  'ws-sync',
];

const CONTROL_SELECTOR =
  'button:visible:not([disabled]), [role="button"]:visible, [role="tab"]:visible, [role="switch"]:visible';

/** Destructive workspace-level actions: pressing them would destroy the fixture
 *  for every later test in the run. */
const SKIP = /delete workspace|sign out|reset bracket|delete permanently/i;

test.describe('interaction smoke — pressing the UI must not break it', () => {
  for (const view of VIEWS) {
    test(`no runtime failure when pressing everything on /${view}`, async ({ page }) => {
      // Pressing 30+ controls with settle time each is slow by nature.
      test.setTimeout(150_000);

      const nativeDialogs: string[] = [];
      page.on('dialog', async (d) => {
        nativeDialogs.push(`${d.type()}: ${d.message()}`);
        await d.dismiss();
      });

      const url = `/tournaments/${TID}/${view}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await drainHarness(page); // ignore load-time noise; we test PRESSES

      // A press mutates the DOM — it can navigate, open a dialog, or re-render
      // the list we're iterating. So re-query on every step and bail out when
      // the control is gone rather than holding a stale locator (which just
      // hangs). We press by index over a re-queried list: the exact coverage
      // shifts a little as the DOM changes, which is fine for a smoke crawl.
      const initial = await page.locator(CONTROL_SELECTOR).count();
      // Zero controls means the view didn't render (bad fixture, bad route) and
      // the crawl below would assert nothing at all. Fail loudly instead.
      expect(initial, `/${view} rendered no interactive controls to press`).toBeGreaterThan(0);
      const budget = Math.min(initial, 30);

      for (let i = 0; i < budget; i++) {
        const controls = page.locator(CONTROL_SELECTOR);
        if ((await controls.count()) <= i) break;

        const el = controls.nth(i);
        const name = (
          (await el.getAttribute('aria-label', { timeout: 1000 }).catch(() => null)) ??
          (await el.innerText({ timeout: 1000 }).catch(() => '')) ??
          ''
        ).trim();
        if (SKIP.test(name)) continue;

        await el.click({ timeout: 1500 }).catch(() => {
          /* covered, detached, or moved — not a failure of the app */
        });
        await page.waitForTimeout(150);
        // Dismiss anything the press opened so it doesn't block the next one.
        await page.keyboard.press('Escape').catch(() => {});

        // A press may have navigated away (nav items are controls too). Return
        // to the view under test so the remaining presses still exercise it.
        if (!page.url().includes(`/${view}`)) {
          await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
          await page.waitForTimeout(800);
        }
      }

      await page.waitForTimeout(600);
      const events = await drainHarness(page);
      const fatal = events.filter((e) => FATAL.has(e.kind));

      expect(
        nativeDialogs,
        `window.confirm/alert is banned (it blocks the event loop):\n${nativeDialogs.join('\n')}`,
      ).toEqual([]);
      expect(
        fatal,
        `pressing the UI on /${view} produced runtime failures:\n${describeFailures(fatal)}`,
      ).toEqual([]);
    });
  }
});

test.describe('interaction smoke — real flows against real stores', () => {
  test('the capability display shows live matches without operator chrome', async ({ page }) => {
    await page.goto(`/display?token=${encodeURIComponent(DISPLAY_TOKEN)}`, {
      waitUntil: 'domcontentloaded',
    });
    // Venue boards intentionally render surname-only labels. The synthetic
    // fixtures are named `Player 2` / `Player 6`, so their surname lines are
    // the exact visible labels `2` / `6` (the full names belong on operator
    // surfaces, not the hall display).
    await expect(page.getByText('2', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('6', { exact: true })).toBeVisible();
    await expect(page.getByText('Configure display')).toHaveCount(0);
    await expect(page.getByText('Open fullscreen')).toHaveCount(0);
    await expect(page.getByText('Workspace')).toHaveCount(0);

    await page.goto('/display?token=invalid-token', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('display-link-invalid')).toBeVisible({ timeout: 10_000 });
  });

  test('the Run view offers only transitions the server accepts', async ({ page }) => {
    // Audit A1: the client's state machine was a superset of the backend's, so
    // Undo 409'd on every press behind a misleading "version mismatch" toast.
    const conflicts: string[] = [];
    page.on('response', (r) => {
      if (r.status() === 409 && r.url().includes('/match-states/')) {
        conflicts.push(r.url());
      }
    });

    await page.goto(`/tournaments/${TID}/live`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await drainHarness(page);

    // Drive the return-transitions on the unified Run surface (SP-CONSOLE-4):
    // select each court card and press whatever legal backward step the
    // inspector / meet rail offers (undo-start, postpone).
    const cards = page.locator('[data-testid^="run-card-"]');
    const cardCount = await cards.count();
    for (let i = 0; i < cardCount; i++) {
      await cards.nth(i).click().catch(() => {});
      await page.waitForTimeout(300);
      for (const testId of ['meet-run-undo-start', 'run-act-postpone']) {
        const btn = page.locator(`[data-testid="${testId}"]:not([disabled])`).first();
        if ((await btn.count()) === 0) continue;
        await btn.click().catch(() => {});
        await page.waitForTimeout(1200);
        break; // the transition changed the lane — move to the next card
      }
    }
    // Undo-finish is the canon two-click arm: both presses inside the window.
    const undoFinish = page
      .locator('[data-testid^="run-finished-undo-"]:not([disabled])')
      .first();
    if ((await undoFinish.count()) > 0) {
      await undoFinish.click().catch(() => {});
      await undoFinish.click().catch(() => {});
      await page.waitForTimeout(1200);
    }

    const events = await drainHarness(page);
    expect(
      conflicts,
      'a match-state transition the UI offered was refused by the server (409) — the two state machines have drifted apart again',
    ).toEqual([]);
    expect(events.filter((e) => FATAL.has(e.kind))).toEqual([]);
  });

  test('the docked match detail pane coexists with the table (2026-07 rework)', async ({ page }) => {
    // The pane is a real layout column (DetailDock): the table must stay
    // visible and clickable while it's open, row-to-row clicks switch the
    // pane without closing it, Esc closes it, and on a narrow viewport the
    // dock falls back to an overlay. jsdom can't evaluate the container
    // queries or the width transition, so this scenario is the only gate on
    // the real reflow behavior.
    await page.goto(`/tournaments/${TID}/matches`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await drainHarness(page);

    const rows = page.locator('[data-testid^="match-row-"]');
    const rowCount = await rows.count();
    expect(rowCount, 'the smoke fixture must seed matches').toBeGreaterThan(1);

    // Open: pane docks, table rows remain visible and interactive.
    await rows.first().click();
    const dock = page.locator('[data-testid="detail-dock"]');
    const panel = page.locator('[data-testid="match-detail-panel"]');
    await expect(panel).toBeVisible();
    await expect(dock).toHaveAttribute('data-mode', 'docked');
    await expect(rows.first()).toBeVisible();
    await expect(rows.nth(1)).toBeVisible();

    // Row-to-row: the pane switches content without closing.
    await rows.nth(1).click();
    await expect(panel).toBeVisible();
    await expect(rows.nth(1)).toHaveAttribute('data-selected', 'true');

    // Esc closes (the dock animates shut, then unmounts the pane).
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden({ timeout: 2000 });

    // Narrow viewport: the dock yields to overlay mode instead of
    // squeezing the table below usefulness.
    await page.setViewportSize({ width: 900, height: 720 });
    await page.waitForTimeout(300);
    await rows.first().click();
    await expect(page.locator('[data-testid="match-detail-panel"]')).toBeVisible();
    await expect(dock).toHaveAttribute('data-mode', 'overlay');

    const events = await drainHarness(page);
    expect(events.filter((e) => FATAL.has(e.kind))).toEqual([]);
  });

  test('a viewer cannot mutate: no write leaves the browser', async ({ page }) => {
    const writes: string[] = [];
    page.on('request', (r) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && r.url().includes('/api/')) {
        writes.push(`${r.method()} ${r.url()}`);
      }
    });

    await page.goto(`/tournaments/${VIEWER_TID}/live`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // The PERSISTENT banner, by testid. A text locator for the phrase is
    // ambiguous: READ_ONLY_MESSAGE is deliberately reused by the refusal toast,
    // so `getByText(/view-only access/i)` resolves to three nodes (banner body +
    // toast title + toast body) and trips strict mode — reported, misleadingly,
    // as "element(s) not found". It passed only while the toast happened not to
    // be on screen.
    await expect(page.getByTestId('read-only-banner')).toBeVisible();
    await expect(page.getByTestId('read-only-banner')).toContainText(/view-only access/i);

    // Unified Run surface (SP-CONSOLE-4): the lifecycle buttons live in the
    // inspector, mounted by selecting a court card. The seed puts matches on
    // courts precisely so a card exists to select — a missing card means the
    // fixture is wrong and the loop below would prove nothing.
    const cards = page.locator('[data-testid^="run-card-"]');
    expect(
      await cards.count(),
      'no court cards rendered — the viewer fixture is wrong',
    ).toBeGreaterThan(0);
    await cards.first().click();

    const actions = page.locator('[data-testid^="run-act-"]');
    const n = await actions.count();
    expect(n, 'no live-day action buttons rendered — the viewer fixture is wrong').toBeGreaterThan(
      0,
    );
    for (let i = 0; i < n; i++) {
      expect(await actions.nth(i).isDisabled()).toBe(true);
    }
    expect(writes, 'a viewer must never reach the wire').toEqual([]);
  });
});
