/**
 * The public bracket, judged as geometry (match-card contract §4.3,
 * public-visual-fixes P4).
 *
 * This file used to assert a DOM SHAPE and two total-height ceilings — the
 * canvas under 600px for a 16 draw, under 1150px for a 32, every node at
 * least 44px with exactly two children. Every one of those is withdrawn by
 * the contract: a 44px node cannot hold a doubles side (two person lines at
 * the 14px floor), and a height ceiling on the whole draw is a budget that
 * can only be met by shrinking what the reader came to read. The tree is
 * bounded by its own scroll REGION now, not by a number, so what is worth
 * asserting is what a reader can actually do:
 *
 *   readable content — every name at or above the 14px floor, whole;
 *   non-overlap      — no two nodes share pixels, first-round separation in
 *                      the requested 8-12px band;
 *   reachability     — every round, including the Finals, reachable by
 *                      scrolling the region, with the PAGE never scrolling
 *                      sideways and the region named and keyboard-focusable;
 *   connectors       — each brace meets the node it feeds, at varied heights.
 */
import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ENTRANT = resolve(ROOT, 'apps/entrant');
const entryPage = JSON.parse(
  readFileSync(resolve(ENTRANT, 'tests/helpers/entryPage.fixture.json'), 'utf8'),
);

let vite: ViteDevServer;
let drawFixture: ReturnType<typeof makeDraw>;
let originalFetch: typeof globalThis.fetch;
let originalApiBase: string | undefined;

function reference(index: number, partner = false) {
  return {
    identity: { id: `person-${index}${partner ? '-partner' : ''}`, name: partner ? `Zoë-Linh Nguyễn ${index} — Élodie` : `Player ${index.toString().padStart(2, '0')} With A Long Name` },
    resolution: 'resolved',
    label: null,
  };
}

/** The round vocabulary the projection sends, and the short code the round
 *  controls render from it (`_short_round` / `roundShortLabel`). */
function roundLabel(total: number, index: number): string {
  const remaining = total - index;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semifinals';
  if (remaining === 3) return 'Quarterfinals';
  return `Round of ${2 ** remaining}`;
}

function shortRound(total: number, index: number): string {
  const remaining = total - index;
  if (remaining === 1) return 'F';
  if (remaining === 2) return 'SF';
  if (remaining === 3) return 'QF';
  return `R${2 ** remaining}`;
}

function makeDraw(size: 16 | 32, doubles = false) {
  const teams = Array.from({ length: size }, (_, index) => ({
    participantKey: `p${index}`,
    persons: doubles ? [reference(index), reference(index, true)] : [reference(index)],
    club: null,
    seed: index < 4 ? index + 1 : null,
  }));
  const roundCount = Math.log2(size);
  const rounds = Array.from({ length: roundCount }, (_, roundIndex) => {
    const matchCount = size / 2 ** (roundIndex + 1);
    return {
      label: roundLabel(roundCount, roundIndex),
      matches: Array.from({ length: matchCount }, (_, matchIndex) => {
        const first = (matchIndex * 2 ** (roundIndex + 1)) % size;
        const second = (first + 2 ** roundIndex) % size;
        const score = matchIndex === 0
          ? [[21, 18], [19, 21], [21, 17]]
          : matchIndex === 1
            ? [[21, 15], [21, 12]]
            : null;
        const short = `${shortRound(roundCount, roundIndex)}${
          matchCount > 1 ? `·${matchIndex + 1}` : ''
        }`;
        return {
          nodeKey: `r${roundIndex}-m${matchIndex}`,
          position: matchIndex + 1,
          // P3: the SHARED match reference, as the wire now carries it.
          reference: `${doubles ? 'MD' : 'MS'} ${short}`,
          shortReference: short,
          sides: [
            { participantKey: `p${first}`, placeholder: null, bye: false, feederNodeKey: roundIndex > 0 ? `r${roundIndex - 1}-m${matchIndex * 2}` : null, feederTake: roundIndex > 0 ? 'winner' : null },
            { participantKey: `p${second}`, placeholder: null, bye: false, feederNodeKey: roundIndex > 0 ? `r${roundIndex - 1}-m${matchIndex * 2 + 1}` : null, feederTake: roundIndex > 0 ? 'winner' : null },
          ],
          result: score ? { winnerSide: 'A', score, walkover: false } : null,
          scheduledTime: null,
          court: null,
          playedOn: null,
          localTime: null,
          courtLabel: null,
          sourceUrl: null,
          sourceRef: null,
        };
      }),
    };
  });
  return {
    drawKey: 'MS',
    eventCode: doubles ? 'MD' : 'MS',
    discipline: doubles ? "Men's Doubles" : "Men's Singles",
    kind: 'se',
    size,
    resultsPublished: true,
    matchCoverage: { imported: size - 1, expected: size - 1, missing: 0 },
    recordScope: 'full_draw',
    topologyScope: 'full_draw',
    historical: false,
    sourceUrl: null,
    identityScope: null,
    teams,
    segments: [{ id: 'MAIN', label: 'Draw', rounds }],
    standings: null,
  };
}

async function render(path: string): Promise<string> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  const response = await createRequestHandler(build, 'development')(
    new Request(`http://entrant.test${path}`),
  );
  expect(response.status).toBe(200);
  return response.text();
}

function productionCss(): string {
  const assets = resolve(ENTRANT, 'build/client/assets');
  const file = readdirSync(assets).find((name) => /^app-.+\.css$/.test(name));
  if (!file) throw new Error('Build the entrant app before running bracket geometry evidence');
  return readFileSync(resolve(assets, file), 'utf8');
}

test.beforeAll(async () => {
  originalFetch = globalThis.fetch;
  originalApiBase = process.env.API_BASE_URL;
  process.env.API_BASE_URL = 'http://backend.test';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://entrant.test').pathname;
    const body = path.endsWith('/draws/MS')
      ? drawFixture
      : {
          ...entryPage,
          page: {
            ...entryPage.page,
            slug: 'geometry-open',
          },
          publication: { entrants: true, draws: true, results: true },
          viewer: { signedIn: false, email: null, formCsrf: '' },
        };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  vite = await createServer({
    root: ENTRANT,
    server: { middlewareMode: true },
    appType: 'custom',
  });
});

test.afterAll(async () => {
  globalThis.fetch = originalFetch;
  if (originalApiBase === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = originalApiBase;
  await vite.close();
});

interface Box { x: number; y: number; width: number; height: number }

async function load(
  page: Page,
  size: 16 | 32,
  { doubles = false, width = 1440, query = '' } = {},
) {
  drawFixture = makeDraw(size, doubles);
  const html = await render(`/e/geometry-open/draws/MS${query}`);
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: productionCss() });
}

/** No horizontal scroll on the DOCUMENT — the region scrolls instead (R11). */
async function pageScrollsVerticallyOnly(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

test('names stay whole and at or above the 14px floor — nothing is shrunk to fit', async ({ page }) => {
  await load(page, 32);
  const names = await page.locator('[data-bracket-grid] .person-ref').evaluateAll((nodes) =>
    nodes.map((node) => ({
      size: Number.parseFloat(getComputedStyle(node).fontSize),
      // A name that has been clipped reports more content than box.
      clipped: node.scrollWidth > node.clientWidth + 1,
      text: (node.textContent ?? '').trim(),
    })),
  );
  expect(names.length).toBeGreaterThan(30);
  expect(names.every(({ size }) => size >= 14)).toBe(true);
  expect(names.filter(({ clipped }) => clipped)).toEqual([]);
  expect(names.every(({ text }) => text.length > 0)).toBe(true);
});

test('no two nodes overlap, and first-round neighbours keep 8-12px of air', async ({ page }) => {
  await load(page, 32);
  const boxes: Box[] = await page.getByTestId('public-bracket-node').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
  expect(boxes).toHaveLength(31);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlaps =
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height;
      expect(overlaps, `nodes ${i} and ${j} overlap`).toBe(false);
    }
  }

  // The first round is the densest column: its separation is the one the
  // contract puts a number on (8-12px to start, growing with node height).
  const first = await page
    .locator('[data-bracket-round]')
    .first()
    .locator('[data-testid="public-bracket-node"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }),
    );
  const gaps = first.slice(1).map((node, index) => node.top - first[index].bottom);
  expect(gaps.length).toBe(15);
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8);
  expect(Math.min(...gaps)).toBeLessThanOrEqual(12);
});

test('a doubles node grows for its second person line instead of squeezing it', async ({ page }) => {
  await load(page, 16);
  const singles = await page.getByTestId('public-bracket-node').first().boundingBox();
  await load(page, 16, { doubles: true });
  const doubles = await page.getByTestId('public-bracket-node').first().boundingBox();
  expect(doubles!.height).toBeGreaterThan(singles!.height);

  // Both partners are rendered, whole, one per line.
  const lines = await page
    .getByTestId('public-bracket-node')
    .first()
    .locator('.person-ref')
    .allTextContents();
  expect(lines.length).toBeGreaterThanOrEqual(4);
  expect(lines.some((line) => /Élodie/.test(line))).toBe(true);
  expect(lines.every((line) => !line.includes('…'))).toBe(true);
});

test('every round is reachable inside the region, and the page never scrolls sideways', async ({ page }) => {
  await load(page, 32);
  expect(await pageScrollsVerticallyOnly(page)).toBe(true);

  const region = page.locator('[data-bracket-scroll]');
  // §4.3: its own region — named, keyboard-reachable, bounded to the viewport.
  await expect(region).toHaveAttribute('tabindex', '0');
  await expect(region).toHaveAttribute('aria-label', /bracket/i);
  const metrics = await region.evaluate((node) => ({
    overflowX: getComputedStyle(node).overflowX,
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    clientHeight: node.clientHeight,
    viewport: window.innerHeight,
  }));
  expect(metrics.overflowX).toBe('auto');
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(metrics.clientHeight).toBeLessThanOrEqual(metrics.viewport);

  // The Finals column — the one a height ceiling used to clip — is reached
  // by scrolling the region, and lands fully inside it.
  await region.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  const visible = await page.evaluate(() => {
    const region = document.querySelector('[data-bracket-scroll]') as HTMLElement;
    const columns = [...document.querySelectorAll('[data-bracket-round]')] as HTMLElement[];
    const final = columns[columns.length - 1];
    const node = final.querySelector('[data-testid="public-bracket-node"]') as HTMLElement;
    const outer = region.getBoundingClientRect();
    const inner = node.getBoundingClientRect();
    return {
      insideLeft: inner.left >= outer.left - 1,
      insideRight: inner.right <= outer.right + 1,
      label: final.getAttribute('data-bracket-round'),
    };
  });
  expect(visible.label).toBe('Final');
  expect(visible.insideLeft && visible.insideRight).toBe(true);
  // ...and reaching the far edge of the tree still leaves the PAGE where it
  // was: the region scrolls, the document does not (R11).
  expect(await pageScrollsVerticallyOnly(page)).toBe(true);
});

test('round headers stay in view while the region scrolls', async ({ page }) => {
  await load(page, 32);
  const region = page.locator('[data-bracket-scroll]');
  await region.evaluate((node) => {
    node.scrollTop = 200;
  });
  const stuck = await page.evaluate(() => {
    const region = document.querySelector('[data-bracket-scroll]') as HTMLElement;
    const header = document.querySelector('.bracket-round-header') as HTMLElement;
    return {
      position: getComputedStyle(header).position,
      offset: header.getBoundingClientRect().top - region.getBoundingClientRect().top,
      text: header.textContent,
    };
  });
  expect(stuck.position).toBe('sticky');
  expect(Math.abs(stuck.offset)).toBeLessThan(2);
  expect(stuck.text).toBe('Round of 32');
});

test('the round controls are native anchors that bring their column into the region', async ({ page }) => {
  await load(page, 32);
  const controls = page.getByRole('navigation', { name: 'Rounds' });
  await expect(controls.locator('a')).toHaveText([
    /R32/,
    /R16/,
    /QF/,
    /SF/,
    /F/,
  ]);
  // Native, with no script loaded on this page at all: the anchor's target
  // is a real column id, and following it scrolls the REGION, not the page.
  const before = await page.locator('[data-bracket-scroll]').evaluate((n) => n.scrollLeft);
  await controls.getByRole('link', { name: /SF/ }).click();
  const after = await page.locator('[data-bracket-scroll]').evaluate((n) => n.scrollLeft);
  expect(after).toBeGreaterThan(before);
  expect(await pageScrollsVerticallyOnly(page)).toBe(true);
});

test('every brace meets the node it feeds, at varied node heights', async ({ page }) => {
  await load(page, 16, { doubles: true });
  const alignment = await page.evaluate(() => {
    const columns = [...document.querySelectorAll('[data-bracket-round]')] as HTMLElement[];
    const braceColumns = [...document.querySelectorAll('[data-bracket-links]')] as HTMLElement[];
    const centre = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.top + rect.height / 2;
    };
    const drift: number[] = [];
    braceColumns.forEach((braceColumn, index) => {
      // The Nth brace column sits before the (N+1)th round column.
      const destination = columns[index + 1];
      const braces = [...braceColumn.querySelectorAll('.bracket-link-slot')];
      const nodes = [...destination.querySelectorAll('[data-testid="public-bracket-node"]')];
      braces.forEach((brace, position) => {
        if (!nodes[position]) return;
        drift.push(Math.abs(centre(brace) - centre(nodes[position])));
      });
    });
    return { drift, braceColumns: braceColumns.length };
  });
  expect(alignment.braceColumns).toBe(3);
  expect(alignment.drift.length).toBe(7);
  expect(Math.max(...alignment.drift)).toBeLessThan(2);
});

test('at 390px the tree scrolls and snaps by round rather than shrinking names', async ({ page }) => {
  await load(page, 32, { width: 390 });
  expect(await pageScrollsVerticallyOnly(page)).toBe(true);
  const region = page.locator('[data-bracket-scroll]');
  const snap = await region.evaluate((node) => ({
    type: getComputedStyle(node).scrollSnapType,
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  expect(snap.type).toContain('x');
  expect(snap.scrollWidth).toBeGreaterThan(snap.clientWidth);
  const align = await page
    .locator('[data-bracket-round]')
    .first()
    .evaluate((node) => getComputedStyle(node).scrollSnapAlign);
  expect(align).toContain('start');
  // ...and the names are still the same size they are at 1440px.
  const sizes = await page
    .locator('[data-bracket-grid] .person-ref')
    .evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
});

test('a selected player path is painted server-side, with no JavaScript', async ({ page }) => {
  await load(page, 16, { query: '?view=path&player=person-0' });
  const grid = page.locator('[data-bracket-grid]');
  await expect(grid).toHaveClass(/has-person-path/);
  const lit = await page.locator('[data-bracket-grid] .is-person-path').count();
  expect(lit).toBeGreaterThan(0);
  // The rest of the tree is dimmed rather than removed: every node is still
  // in the document and still reachable.
  await expect(page.getByTestId('public-bracket-node')).toHaveCount(15);
  await expect(page.getByRole('link', { name: 'Clear path' })).toBeVisible();
});
