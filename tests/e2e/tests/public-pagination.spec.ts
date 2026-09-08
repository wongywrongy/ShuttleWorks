import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ENTRANT = resolve(ROOT, 'apps/entrant');
let vite: ViteDevServer;
let originalFetch: typeof globalThis.fetch;
let originalApiBase: string | undefined;

function row(index: number, status: 'in_progress' | 'in_progress_live' | 'completed_winners') {
  const completed = status === 'completed_winners';
  return {
    slug: `${completed ? 'completed' : 'current'}-${index}`,
    name: `${completed ? 'Completed' : 'Current'} Tournament ${index}`,
    organizer: 'Fixture Club', venueName: 'Fixture Hall', locality: 'Test City',
    date: completed ? `2026-${String(8 - Math.floor(index / 4)).padStart(2, '0')}-${String((index % 4) + 1).padStart(2, '0')}` : `2026-10-${String((index % 11) + 1).padStart(2, '0')}`,
    eventCount: 2, closesInDays: null, closesAt: null, timeZone: 'UTC',
    drawsPublished: completed, winnersPublished: completed, status,
  };
}

const fixture = {
  tournaments: [
    ...Array.from({ length: 11 }, (_, index) => row(index, index === 0 ? 'in_progress_live' : 'in_progress')),
    ...Array.from({ length: 29 }, (_, index) => row(index, 'completed_winners')),
  ],
  counts: { takingEntries: 0, completed: 29 },
  now: { slug: 'current-0', moreCount: 10 },
};

function productionCss(): string {
  const assets = resolve(ENTRANT, 'build/client/assets');
  const file = readdirSync(assets).find((name) => /^app-.+\.css$/.test(name));
  if (!file) throw new Error('Build the entrant app before pagination evidence');
  let css = readFileSync(resolve(assets, file), 'utf8');
  // `setContent` uses an about:blank document, so the built `/e/assets/...`
  // font URLs would otherwise fail silently and screenshots would use a
  // platform fallback. Inline the exact production font bytes instead.
  for (const asset of readdirSync(assets).filter((name) => name.endsWith('.woff2'))) {
    const url = `/e/assets/${asset}`;
    const data = `data:font/woff2;base64,${readFileSync(resolve(assets, asset)).toString('base64')}`;
    css = css.replaceAll(url, data);
  }
  return css;
}

async function render(path: string): Promise<string> {
  const build = (await vite.ssrLoadModule('virtual:react-router/server-build')) as unknown as ServerBuild;
  const response = await createRequestHandler(build, 'development')(new Request(`http://entrant.test${path}`));
  expect(response.status).toBe(200);
  return response.text();
}

async function load(page: Page, path: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const html = await render(path);
  await page.setContent(html.replace('<head>', '<head><base href="http://entrant.test/e/">'), { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: productionCss() });
}

test.beforeAll(async () => {
  originalFetch = globalThis.fetch;
  originalApiBase = process.env.API_BASE_URL;
  process.env.API_BASE_URL = 'http://backend.test';
  globalThis.fetch = (async () => new Response(JSON.stringify(fixture), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof globalThis.fetch;
  vite = await createServer({ root: ENTRANT, server: { middlewareMode: true }, appType: 'custom' });
});

test.afterAll(async () => {
  globalThis.fetch = originalFetch;
  if (originalApiBase === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = originalApiBase;
  await vite.close();
});

test('public discovery keeps one bounded, stable season at mobile and desktop widths', async ({ page }, testInfo) => {
  // P5 replaced the lifecycle segments and their pagination with ONE season:
  // upcoming ascending, then "Earlier this season" descending, all on one
  // page. What is bounded is the SEASON, not a page size — so the property
  // this evidence run holds is that the same season renders identically at
  // both widths and that no pager exists to disagree with.
  const idsAtWidth: string[][] = [];
  for (const width of [390, 1440]) {
    await load(page, '/e/', width);
    await expect(page.locator('#calendar li')).toHaveCount(40);
    await expect(page.locator('nav[aria-label="Tournament pages"]')).toHaveCount(0);
    await expect(page.locator('#past')).toHaveCount(1);
    idsAtWidth.push(await page.locator('#calendar li a[href^="/e/current-"]').evaluateAll((links) => links.map((link) => link.getAttribute('href'))));
    await page.screenshot({ path: testInfo.outputPath(`public-season-${width}.png`), fullPage: true });
  }
  expect(idsAtWidth[0]).toEqual(idsAtWidth[1]);
  // The past half is on the same page, muted, with no venue line and a
  // results-only action — no archive detour to follow.
  await load(page, '/e/', 1440);
  const past = page.locator('#past ~ ul li');
  await expect(past.first().locator('a[href$="?tab=draws"]')).toHaveText(/Results/);
  await expect(page.getByText('Looking for past results?')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('public-season-past.png'), fullPage: true });
});

test('one season is the content boundary — older seasons are not rendered at all', async ({ page }) => {
  // Ten seasons of history. Rendering all of them at once is the failure this
  // bounds against; the page must show the current season and offer the rest
  // as a selection.
  const decade = {
    ...fixture,
    tournaments: Array.from({ length: 500 }, (_, index) => ({
      ...row(index, 'completed_winners'),
      slug: `historic-${index}`,
      date: `${2017 + (index % 10)}-06-${String((index % 27) + 1).padStart(2, '0')}`,
    })),
    now: null,
  };
  globalThis.fetch = (async () => new Response(JSON.stringify(decade), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof globalThis.fetch;
  await load(page, '/e/?year=2019', 1440);
  const rendered = await page.locator('#calendar li').count();
  expect(rendered).toBeLessThan(decade.tournaments.length);
  await expect(page.locator('nav[aria-label="Season"] a')).not.toHaveCount(0);
});

test('signup form stays within a 320px viewport', async ({ page }, testInfo) => {
  await load(page, '/e/signup', 320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath('public-signup-320.png'), fullPage: true });
});
