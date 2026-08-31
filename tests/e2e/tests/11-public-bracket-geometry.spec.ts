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

function reference(index: number) {
  return {
    identity: { id: `person-${index}`, name: `Player ${index.toString().padStart(2, '0')} With A Long Name` },
    resolution: 'resolved',
    label: null,
  };
}

function makeDraw(size: 16 | 32) {
  const teams = Array.from({ length: size }, (_, index) => ({
    participantKey: `p${index}`,
    persons: [reference(index)],
    club: null,
    seed: index < 4 ? index + 1 : null,
  }));
  const roundCount = Math.log2(size);
  const rounds = Array.from({ length: roundCount }, (_, roundIndex) => {
    const matchCount = size / 2 ** (roundIndex + 1);
    return {
      label: roundIndex === roundCount - 1 ? 'Final' : `Round ${roundIndex + 1}`,
      matches: Array.from({ length: matchCount }, (_, matchIndex) => {
        const first = (matchIndex * 2 ** (roundIndex + 1)) % size;
        const second = (first + 2 ** roundIndex) % size;
        const score = matchIndex === 0
          ? [[21, 18], [19, 21], [21, 17]]
          : matchIndex === 1
            ? [[21, 15], [21, 12]]
            : null;
        return {
          nodeKey: `r${roundIndex}-m${matchIndex}`,
          position: matchIndex + 1,
          sides: [
            { participantKey: `p${first}`, placeholder: null, bye: false, feederNodeKey: null, feederTake: null },
            { participantKey: `p${second}`, placeholder: null, bye: false, feederNodeKey: null, feederTake: null },
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
    eventCode: 'MS',
    discipline: "Men's Singles",
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

async function load(page: Page, size: 16 | 32, view: 'bracket' | 'round' | 'list') {
  drawFixture = makeDraw(size);
  const html = await render(`/e/geometry-open/draws/MS?view=${view}`);
  await page.setViewportSize({ width: view === 'bracket' ? 1440 : 390, height: 900 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: productionCss() });
}

test('four rounds render below 450px with fixed three-game score rails', async ({ page }) => {
  await load(page, 16, 'bracket');
  const canvas = page.getByTestId('public-bracket-canvas');
  const box = await canvas.boundingBox();
  expect(box?.height).toBeLessThan(450);
  await expect(page.getByTestId('public-bracket-node')).toHaveCount(15);
  const geometry = await page.getByTestId('public-bracket-node').evaluateAll((nodes) =>
    nodes.map((node) => ({
      height: node.getBoundingClientRect().height,
      rows: node.children.length,
      columns: getComputedStyle(node.children[0] as Element).gridTemplateColumns,
    })),
  );
  expect(geometry.every(({ height, rows }) => height === 44 && rows === 2)).toBe(true);
  expect(new Set(geometry.map(({ columns }) => columns)).size).toBe(1);
});

test('a full 32 draw stays two-line and below the agreed 850px ceiling', async ({ page }) => {
  await load(page, 32, 'bracket');
  const box = await page.getByTestId('public-bracket-canvas').boundingBox();
  expect(box?.height).toBeLessThan(850);
  await expect(page.getByTestId('public-bracket-node')).toHaveCount(31);
  expect(
    await page.getByTestId('public-bracket-node').evaluateAll((nodes) =>
      nodes.every((node) => node.getBoundingClientRect().height === 44 && node.children.length === 2),
    ),
  ).toBe(true);
});

test('Round and List modes reflow at 390px without horizontal page scroll', async ({ page }) => {
  for (const view of ['round', 'list'] as const) {
    await load(page, 32, view);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);
    await expect(page.getByText('Player 00 With A Long Name').first()).toBeVisible();
  }
});
