import { test, expect } from '@playwright/test';
import { SEED_TOURNAMENT } from '../fixtures/seed';
import { seedServer } from '../fixtures/server-state';

test.describe('auto-generate matches without matches of its own', () => {
  test.beforeEach(async ({ context, request }) => {
    // Push a matches-free tournament through the server so useTournamentState
    // hydrates without the persisted matches from whatever previous spec ran.
    await seedServer(request, {
      ...SEED_TOURNAMENT,
      state: { ...SEED_TOURNAMENT.state, matches: [] },
    });
    await context.addInitScript((seed) => {
      const withoutMatches = { ...seed, state: { ...seed.state, matches: [] } };
      window.localStorage.setItem('scheduler-storage', JSON.stringify(withoutMatches));
    }, SEED_TOURNAMENT);
  });

  test('inline auto-generate produces matches and the Matches tab becomes enabled', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('tab-matches').click();
    await expect(page.getByTestId('auto-generate-matches')).toBeEnabled();

    // Before generation: schedule/live tabs disabled because matches=0.
    await expect(page.getByTestId('tab-schedule')).toBeDisabled();

    await page.getByTestId('auto-generate-matches').click();

    // Rows populate.
    const rowCount = await page.locator('[data-testid^="match-row-"]').count();
    expect(rowCount).toBeGreaterThan(0);

    // Schedule tab should now be enabled (matches exist).
    await expect(page.getByTestId('tab-schedule')).toBeEnabled();
  });
});
