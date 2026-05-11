/**
 * Suggestions Inbox UI smoke test.
 *
 * Backend coverage of the OPTIMIZE handler (real solver →
 * Suggestion stamp) lives in test_proposal_pipeline_integration.
 * The full populated-rail E2E (real solve → real suggestion →
 * Apply commits) needs (a) a seeded tournament fixture that's
 * geometrically packed enough that stayCloseWeight=5 finds an
 * improvement, and (b) the test stack rebuilt against the new
 * /schedule/suggestions endpoints (run with E2E_REBUILD=1).
 * Both are left for a follow-up.
 *
 * What this smoke verifies without a stack rebuild:
 *   - The Schedule page mounts cleanly with the rail wired in
 *     (no crash, no error boundary, AppShell hooks survive).
 *   - The rail's region is absent when no suggestions exist —
 *     no empty-card rendering.
 */
import { test, expect } from '@playwright/test';

test.describe('Suggestions Inbox', () => {
  test('schedule page mounts without errors when rail is wired', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-schedule').click();
    // Schedule pane renders. The rail's region only appears when
    // there are suggestions; a fresh test backend has none, so
    // the rail should be absent — never rendering an empty card.
    await expect(
      page.getByRole('region', { name: /suggestions/i }),
    ).toHaveCount(0);
    // No error boundaries fired on mount.
    await expect(page.locator('body')).not.toContainText(
      /something went wrong/i,
    );
  });
});
