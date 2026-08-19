import { test, expect } from '@playwright/test';

test.describe('sanity: shell renders and tabs switch', () => {
  test('home route loads app shell with tab bar', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/schedul|tournament/i);
    await expect(page.getByTestId('tab-setup')).toBeVisible();
    await expect(page.getByTestId('tab-roster')).toBeVisible();
    await expect(page.getByTestId('tab-matches')).toBeVisible();
    await expect(page.getByTestId('tab-schedule')).toBeVisible();
    await expect(page.getByTestId('tab-live')).toBeVisible();
    await expect(page.getByTestId('tab-tv')).toBeVisible();
  });

  test('clicking tabs updates aria-current without crashing', async ({ page }) => {
    await page.goto('/');
    for (const tab of ['setup', 'roster', 'matches', 'schedule', 'live', 'tv'] as const) {
      const btn = page.getByTestId(`tab-${tab}`);
      const isDisabled = await btn.isDisabled();
      if (isDisabled) continue;
      await btn.click();
      await expect(btn).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('body')).not.toContainText(/something went wrong/i);
    }
  });

  test('public display route renders without shell', async ({ page }) => {
    await page.goto('/display');
    await expect(page).toHaveURL(/\/display$/);
    // Shell's TabBar is absent on /display.
    await expect(page.getByTestId('tab-setup')).toHaveCount(0);
  });

  test('backend health endpoint responds', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });
});
