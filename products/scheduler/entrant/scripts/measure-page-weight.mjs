#!/usr/bin/env node
/**
 * Measures the real gzipped weight of `/e/{slug}` — the entry page, the one
 * page spec §7's no-JS posture is about — on a production build.
 *
 * "Page weight" here is what a browser actually pays for: the server-
 * rendered HTML (what a no-JS visitor gets in full) PLUS the critical JS —
 * the client entry point, `root`, and the `:slug` route's own chunk, walked
 * out of the real build manifest rather than guessed at. Each file is
 * gzipped on its own and the compressed sizes are summed, because that is
 * how they cross the wire: as separate HTTP responses, not one concatenated
 * blob. CSS is deliberately not counted — the brief's "HTML plus critical
 * JS" is explicit, and `app-*.css` is reported separately, below the gate,
 * as a number a reader can still see.
 *
 * Renders through the REAL production server build (`build/server/index.js`,
 * the same `createRequestHandler` the running app uses), against a stubbed
 * backend — same idiom `tests/entry.render.test.ts` uses for the identical
 * route, with the identical fixture, so the measured HTML is the shape a
 * real entry page actually renders, not a stand-in.
 *
 * Run after `npm run build`: `node scripts/measure-page-weight.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const clientDir = path.join(root, 'build', 'client');
const serverEntry = path.join(root, 'build', 'server', 'index.js');

if (!fs.existsSync(serverEntry) || !fs.existsSync(clientDir)) {
  console.error(`Production build not found under ${path.join(root, 'build')}.`);
  console.error(`Run: npm --prefix products/scheduler/entrant run build`);
  process.exit(1);
}

// ---- the critical JS set, walked out of the real manifest ---------------

const manifestFile = fs
  .readdirSync(path.join(clientDir, 'assets'))
  .find((f) => /^manifest-.*\.js$/.test(f));
if (!manifestFile) {
  console.error('No client manifest (assets/manifest-*.js) in the production build.');
  process.exit(1);
}
const manifestSrc = fs.readFileSync(path.join(clientDir, 'assets', manifestFile), 'utf-8');
const match = manifestSrc.match(/window\.__reactRouterManifest\s*=\s*(\{.*\});?\s*$/);
if (!match) {
  console.error(`Could not parse __reactRouterManifest out of ${manifestFile}.`);
  process.exit(1);
}
const manifest = JSON.parse(match[1]);

/** module + imports for one manifest entry, as bare `/assets/...` paths. */
function filesFor(entry) {
  return [entry.module, ...(entry.imports ?? [])];
}

const entryRoute = manifest.routes['routes/entry'];
if (!entryRoute) {
  console.error('routes/entry is missing from the manifest — did routes.ts change?');
  process.exit(1);
}

// The client entry point (always shipped), `root` (always active), and the
// `:slug` route's own module — the union is exactly what a browser loads to
// hydrate `/e/{slug}`. `Set` dedupes the shared vendor chunk pulled in by
// more than one of the three.
const criticalAssetPaths = [
  ...new Set([
    ...filesFor(manifest.entry),
    ...filesFor(manifest.routes.root),
    ...filesFor(entryRoute),
  ]),
];

function gzipSizeOf(absPath) {
  return zlib.gzipSync(fs.readFileSync(absPath)).length;
}

const criticalJsBytes = criticalAssetPaths.reduce((sum, assetPath) => {
  // Manifest paths are `/assets/foo.js`, relative to `build/client`.
  const abs = path.join(clientDir, assetPath.replace(/^\//, ''));
  return sum + gzipSizeOf(abs);
}, 0);

// ---- the real server-rendered HTML for one entry page --------------------

process.env.API_BASE_URL ??= 'http://backend.invalid';

const PAGE = {
  tournament: { name: 'Spring Open', date: '2026-09-12' },
  org: { name: 'Kingsway BC' },
  venue: { name: 'Kingsway Centre', address: '4 Kingsway' },
  page: {
    slug: 'spring-open',
    introText: 'Entries close on the 1st.',
    regulationsText: 'BWF laws apply.',
    regulationsVersion: 3,
    paymentInstructions: 'Bank transfer on the day.',
    feeSchedule: { '2': 2500 },
  },
  policy: {
    maxEventsPerPerson: 2,
    disciplineCaps: null,
    collectPhone: false,
    waiverRequired: false,
  },
  events: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'MS',
      discipline: "Men's Singles",
      feeCents: 1500,
      genderConstraint: 'M',
      opensAt: null,
      closesAt: null,
      withdrawsUntil: null,
      isOpen: true,
      ageBracketed: false,
      entryCount: 7,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      code: 'WD',
      discipline: "Women's Doubles",
      feeCents: 2000,
      genderConstraint: 'F',
      opensAt: null,
      closesAt: null,
      withdrawsUntil: null,
      isOpen: true,
      ageBracketed: false,
      entryCount: 4,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      code: 'XD',
      discipline: 'Mixed Doubles',
      feeCents: 3000,
      genderConstraint: null,
      opensAt: null,
      closesAt: null,
      withdrawsUntil: null,
      isOpen: false,
      ageBracketed: false,
      entryCount: 1,
    },
  ],
  entrants: [{ name: 'Ada Lovelace', eventId: '11111111-1111-4111-8111-111111111111' }],
};

globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url === `${process.env.API_BASE_URL}/e/api/page/spring-open`) {
    return new Response(JSON.stringify(PAGE), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error(`measure-page-weight: unexpected fetch ${url}`);
};

const { createRequestHandler } = await import('react-router');
const build = await import(pathToFileURL(serverEntry).href);
const handler = createRequestHandler(build, 'production');

const response = await handler(new Request('http://weight-check.test/e/spring-open'));
if (response.status !== 200) {
  console.error(`Rendering /e/spring-open returned ${response.status}, not 200.`);
  console.error(await response.text());
  process.exit(1);
}
const html = await response.text();
const htmlGzipBytes = zlib.gzipSync(Buffer.from(html, 'utf-8')).length;

// ---- the gate --------------------------------------------------------

const totalBytes = htmlGzipBytes + criticalJsBytes;
const totalKb = totalBytes / 1024;
const BUDGET_KB = 100; // the brief's number
const SLACK_KB = BUDGET_KB * 1.1; // +10% slack in CI, per the brief

let cssNote = '';
const cssFile = fs.readdirSync(path.join(clientDir, 'assets')).find((f) => /^app-.*\.css$/.test(f));
if (cssFile) {
  const cssKb = gzipSizeOf(path.join(clientDir, 'assets', cssFile)) / 1024;
  cssNote = ` (not counted; app.css alone is ${cssKb.toFixed(1)} KB gzipped)`;
}

console.log(`HTML (gzipped):        ${(htmlGzipBytes / 1024).toFixed(1)} KB`);
console.log(`Critical JS (gzipped): ${(criticalJsBytes / 1024).toFixed(1)} KB  [${criticalAssetPaths.length} files]`);
console.log(`Total:                 ${totalKb.toFixed(1)} KB${cssNote}`);
console.log(`Budget:                ${BUDGET_KB} KB (+10% CI slack = ${SLACK_KB.toFixed(1)} KB)`);

if (totalKb <= SLACK_KB) {
  console.log('PASS');
  process.exit(0);
} else {
  console.error(`FAIL — exceeds the ${SLACK_KB.toFixed(1)} KB gate by ${(totalKb - SLACK_KB).toFixed(1)} KB`);
  process.exit(1);
}
