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
 *
 * A `@scheduler/design-system/components` barrel rewrite was tried and
 * disproved: `GanttTimeline-*.js` in the critical set is a Rollup CHUNK
 * NAME (the shared design-system chunk, named after one module in its
 * group), not the component — `GANTT_GEOMETRY`/`placementBox`/
 * `laneOrientation` appear in NO file under `build/client/assets/`, it is
 * already tree-shaken out. Deep-importing all six route modules measured
 * 126.9 KB, 0.3 KB WORSE (extra chunk boundaries cost more than the
 * nothing they removed). Reverted.
 *
 * `entry.client-*.js` (57.5 KB) + the shared vendor `chunk-*.js` (41.3 KB)
 * = 98.8 KB of the 122.5 KB critical JS is react-dom's client runtime and
 * the React Router runtime, before a single line of this app runs. That is
 * the FRAMEWORK FLOOR for hydrating any route on this stack — fixed cost,
 * not trimmable by import changes here.
 *
 * OWNER RULING R8-F (2026-08-07): the original 100 KB target in the
 * implementation plan predated ruling R8 choosing React Router 7 SSR, and
 * was never achievable once that landed — 98.8 KB of framework alone
 * already blows most of it. BUDGET_KB below is derived, not aspirational:
 * FRAMEWORK_FLOOR (98.8 KB, measured above) + this app's actual footprint
 * (~27.8 KB: 23.7 KB app JS + 4.0 KB HTML) + real growth headroom. The
 * gate STAYS BLOCKING — raising the number does not soften it. A future
 * overage past the ceiling below means the APP side grew (or the
 * framework floor itself moved — recheck `entry.client-*.js` +
 * `chunk-*.js` to tell which). See `docs/audits/debt-log.md`.
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

// The SAME fixture `tests/entry.render.test.ts` renders, not a copy of it.
// These two render the same route through the same handler, and this one turns
// its HTML into the number the CI gate checks — so a divergence here does not
// fail, it silently SHRINKS the measured page and buys headroom no real entry
// page has. It WAS a 60-line verbatim duplicate; hoisted to JSON because these
// two consumers share no module system (that one is TypeScript under vitest,
// this is plain node). `viewer` is absent by design; see the fixture's note in
// `tests/entry.render.test.ts`.
const PAGE = JSON.parse(
  fs.readFileSync(path.join(root, 'tests', 'helpers', 'entryPage.fixture.json'), 'utf-8'),
);

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

// R8-F: 123 KB base = ~98.8 KB measured framework floor (react-dom's client
// runtime + the React Router runtime — entry.client-*.js + the shared vendor
// chunk) + ~24.2 KB app allowance. +10% CI slack -> 135.3 KB enforced
// ceiling, i.e. ~36.5 KB of total app-attributable room (HTML + app JS)
// against this app's current ~27.8 KB, leaving ~8.7 KB of real growth
// headroom before this gate goes red again. See the file header for the
// R8-F ruling and docs/audits/debt-log.md for the record of why this moved.
const BUDGET_KB = 123;
const SLACK_KB = BUDGET_KB * 1.1; // +10% CI slack

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
