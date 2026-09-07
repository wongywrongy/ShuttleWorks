import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Uses the disposable canonical fixture, never the developer's working database.
const fixturePath = process.env.FIXTURE_JSON;
const fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null;
test.skip(!fixture, 'Run with tools/fixture-up.sh and FIXTURE_JSON');

test('large roster pages, selects across pages, searches offline and restores its URL', async ({ page, context }) => {
  await page.goto(`/tournaments/${fixture.koreaTid}/participants/people`);
  const rows = page.locator('[data-testid^="roster-row-"]');
  await expect(rows).toHaveCount(100);
  const firstIds = await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')));
  await page.getByRole('checkbox', { name: 'Select these 100', exact: true }).check();
  await expect(page.getByText('100 selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(page).toHaveURL(/bracket-roster.page=2/);
  await expect(rows).toHaveCount(100);
  await expect(page.locator('[data-list-scroll="bracket-roster"]')).toBeFocused();
  const secondIds = await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')));
  expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
  await expect(page.getByText('100 selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select all 253 matching players', exact: true }).click();
  await expect(page.getByText('253 selected', { exact: true })).toBeVisible();
  const list = page.locator('[data-list-scroll="bracket-roster"]');
  await list.evaluate((node) => { node.scrollTop = 500; node.dispatchEvent(new Event('scroll')); });
  const listUrl = page.url();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(listUrl);
  await expect(rows).toHaveCount(100);
  await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBe(500);
  const target = await rows.first().getAttribute('data-testid');
  const name = await rows.first().locator('td').nth(1).innerText();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
  await expect(rows).toHaveCount(100);
  await page.getByRole('textbox', { name: 'Search records' }).fill(name.trim());
  await expect(page.getByText('253 selected', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId(target!)).toBeVisible();
  await page.getByTestId(target!).click();
  await expect(page).toHaveURL(/player=/);
  await context.setOffline(false);
});

test('match inventory pages the whole collection and keeps court awareness', async ({ page, context }) => {
  await page.goto(`/tournaments/${fixture.koreaTid}/competition/matches`);
  const rows = page.locator('[data-testid^="bracket-match-row-"]');
  await expect(rows).toHaveCount(100);
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(rows).toHaveCount(55);
  await expect(page).toHaveURL(/bracket-matches.page=2/);
  await page.reload();
  await expect(rows).toHaveCount(55);
  await expect(page).toHaveURL(/bracket-matches.page=2/);
  await context.setOffline(true);
  await page.getByRole('combobox', { name: 'Rows per page' }).selectOption('25');
  await expect(rows).toHaveCount(25);
  await expect(page).toHaveURL(/pageSize=25/);
  await context.setOffline(false);
  await page.goto(`/tournaments/${fixture.taipeiTid}/operations/live`);
  await expect(page.locator('[data-testid^="run-card-"]')).toHaveCount(6);
  await expect(page.locator('[data-testid^="run-queue-row-"]')).toHaveCount(24);
});

test('a direct roster page-two link survives initial data loading', async ({ page }) => {
  await page.goto(`/tournaments/${fixture.koreaTid}/participants/people?bracket-roster.page=2`);
  await expect(page.locator('[data-testid^="roster-row-"]')).toHaveCount(100);
  await expect(page.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/bracket-roster.page=2/);
});
