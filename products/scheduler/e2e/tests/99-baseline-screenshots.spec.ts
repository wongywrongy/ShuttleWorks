/**
 * Phase 0 follow-up — baseline screenshots for the design-unification
 * effort. Captures every operator tab + the /display route in both
 * light and dark modes, saved to `design/baseline/scheduler/` for the
 * Phase 7 visual-diff pass.
 *
 * Run with the rest of the e2e suite (`make test-e2e` from repo root)
 * — the global-setup brings up the docker stack, the spec walks the
 * routes, dumps PNGs, and exits. The screenshots are NOT compared
 * here; they're inputs for human visual review against future state.
 *
 * Output: design/baseline/scheduler/<route>-<mode>.png
 *   • setup-light.png      setup-dark.png
 *   • roster-light.png     roster-dark.png
 *   • matches-light.png    matches-dark.png
 *   • schedule-light.png   schedule-dark.png
 *   • live-light.png       live-dark.png
 *   • tv-light.png         tv-dark.png
 *   • display-light.png    display-dark.png
 */
import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// CommonJS-style `__dirname` is undefined under Playwright's ESM
// loader (the e2e package is type: "module"). Re-derive from
// import.meta so the spec loads regardless of module system.
const __dirname = dirname(fileURLToPath(import.meta.url));
const baselineDir = resolve(__dirname, '../../../../design/baseline/scheduler');

// Tabs the AppShell exposes. `display` is a top-level route handled
// separately (no tab bar there).
const TABS = ['setup', 'roster', 'matches', 'schedule', 'live', 'tv'] as const;
type Tab = (typeof TABS)[number];

test.describe('baseline screenshots — phase 0 follow-up', () => {
  test.beforeAll(() => {
    mkdirSync(baselineDir, { recursive: true });
  });

  for (const mode of ['light', 'dark'] as const) {
    test(`capture ${mode}-mode shots of every route`, async ({ page }) => {
      // Apply the theme by toggling the `.dark` class the design-system
      // CSS gates on. Set BEFORE first navigation so the very first
      // paint already reflects the right palette.
      await page.addInitScript((m) => {
        if (m === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }, mode);

      // Skip animations to avoid flaky frames during capture.
      await page.addStyleTag({
        content: `*, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
        }`,
      });

      for (const tab of TABS) {
        await page.goto('/');
        const btn = page.getByTestId(`tab-${tab}` as const);
        if (await btn.isDisabled()) {
          // Disabled tabs (no players / no matches yet) can't be
          // visited — capture the disabled view of the AppShell so
          // the visual diff still has a reference frame.
          await page.screenshot({
            path: `${baselineDir}/${tab as Tab}-${mode}-disabled.png`,
            fullPage: true,
          });
          continue;
        }
        await btn.click();
        await page.waitForLoadState('networkidle');
        await page.screenshot({
          path: `${baselineDir}/${tab as Tab}-${mode}.png`,
          fullPage: true,
        });
      }

      // /display route — separate top-level URL, no tab bar.
      await page.goto('/display');
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: `${baselineDir}/display-${mode}.png`,
        fullPage: true,
      });
    });
  }
});
