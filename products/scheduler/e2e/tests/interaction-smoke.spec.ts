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
 * permanently red (see docs/programs/design-plan/INTERACTION_FINDINGS.md):
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

    // Drive the undo affordances the audit found broken.
    for (const label of ['Undo started match', 'Undo finish', 'Undo call']) {
      const btn = page.locator(`button[aria-label="${label}"]:not([disabled])`).first();
      if ((await btn.count()) === 0) continue;
      await btn.click().catch(() => {});
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
    // Audit A2. Requires a workspace the caller only has `viewer` on; skipped
    // when SMOKE_VIEWER_TID isn't provided so the suite stays runnable locally.
    const viewerTid = process.env.SMOKE_VIEWER_TID;
    test.skip(!viewerTid, 'set SMOKE_VIEWER_TID to a viewer-role workspace');

    const writes: string[] = [];
    page.on('request', (r) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && r.url().includes('/api/')) {
        writes.push(`${r.method()} ${r.url()}`);
      }
    });

    await page.goto(`/tournaments/${viewerTid}/live`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.getByText(/view-only access/i)).toBeVisible();

    const actions = page.locator('button[aria-label*="Call"], button[aria-label*="Start"]');
    const n = await actions.count();
    // The seed puts matches on courts precisely so these controls exist. If they
    // don't, the loop below would assert nothing and the test would pass while
    // proving nothing — the failure mode this whole suite exists to prevent.
    expect(n, 'no live-day action buttons rendered — the viewer fixture is wrong').toBeGreaterThan(
      0,
    );
    for (let i = 0; i < n; i++) {
      expect(await actions.nth(i).isDisabled()).toBe(true);
    }
    expect(writes, 'a viewer must never reach the wire').toEqual([]);
  });
});
