#!/usr/bin/env node
/**
 * Measures the real gzipped weight of the public pages — discovery (`/e/`),
 * the tournament page (`/e/{slug}`) and the enter page (`/e/{slug}/enter`)
 * — on a production build. Spec §7's no-JS posture, as a number.
 *
 * "Page weight" here is what a browser actually pays for: the server-
 * rendered HTML (what a no-JS visitor gets in full) PLUS every script the
 * HTML actually references. Each file is gzipped on its own and the
 * compressed sizes are summed, because that is how they cross the wire: as
 * separate HTTP responses, not one concatenated blob. CSS is deliberately
 * not counted — the brief's "HTML plus critical JS" is explicit, and
 * `app-*.css` is reported separately, below the gate, as a number a reader
 * can still see.
 *
 * **The script set is read OUT OF THE RENDERED HTML, not walked out of the
 * build manifest.** It used to be the manifest — the client entry, `root`
 * and the `:slug` route's chunk — and that number stopped being true the day
 * `app/root.tsx` dropped `<Scripts/>`: the manifest still lists 122.5 KB of
 * client bundle, the build still writes it to `build/client/assets/`, and no
 * browser ever asks for a byte of it. A page-weight gate reading the
 * manifest would keep charging the app for a download it does not make.
 * Reading the document is both smaller and honest, and it re-arms by itself:
 * restore `<Scripts/>` and the framework floor lands straight back in this
 * number.
 *
 * Renders through the REAL production server build (`build/server/index.js`,
 * the same `createRequestHandler` the running app uses), against a stubbed
 * backend — same idiom `tests/entry.render.test.ts` uses for the identical
 * route, with the identical fixture, so the measured HTML is the shape a
 * real entry page actually renders, not a stand-in.
 *
 * Run after `npm run build`: `node scripts/measure-page-weight.mjs`.
 *
 * OWNER RULING R8-F (2026-08-07) set BUDGET_KB to 123 to cover a ~98.8 KB
 * react-dom + React Router hydration floor. THAT FLOOR IS GONE: this tier
 * ships no client JS (see the note in `app/root.tsx` — the CSP blocked the
 * inline `<Scripts/>` output in every deployed stack anyway, so no visitor
 * ever ran it). The budget below is re-derived from the measurement, not
 * inherited. The gate STAYS BLOCKING.
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

function gzipSizeOf(absPath) {
  return zlib.gzipSync(fs.readFileSync(absPath)).length;
}

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
  if (url === `${process.env.API_BASE_URL}/e/api/pages`) {
    // Discovery's list — one slug, so the fan-out below hits the same page.
    return new Response(JSON.stringify([{ slug: 'spring-open' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
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

/**
 * SP-P6-2: three measured documents, one gate each — discovery (`/e/`), the
 * tournament page (`/e/{slug}`) and the enter page (`/e/{slug}/enter`). The
 * enter page carries the real CSRF + idempotency fields; the tournament page
 * is the sitemap-listed poster URL; discovery is the front door.
 */
const MEASURED = ['/e/', '/e/spring-open', '/e/spring-open/enter'];

/**
 * 2026-08-11 design audit, finding #7 ("the page-weight gate cannot see the
 * state that breaks its own budget"). Every measurement above is a bare GET,
 * and a bare GET's `echo.players` is always `[]` — so `visibleBlocks()`
 * (`app/lib/phase.ts`) was structurally incapable of returning anything but
 * `1`, no matter how the enter page is actually used. The form's own worst
 * case is the "Add another player" round trip clamped at 8 blocks (Z12's
 * documented display bound), and each block re-renders the full open-events
 * checkbox list with no dedup — the growth driver.
 *
 * Reached the SAME way a real entrant reaches it: a POST to the enter
 * route's own action with `addPlayer=1` (no backend call, no credential —
 * see `action()` in `routes/enter.tsx`), which is exactly what the "Add
 * another player" button's `formAction` does. Player content is irrelevant
 * to weight (the checkbox list dominates it), so one POST carrying 7 echoed
 * players + `addPlayer=1` reaches the 8-block ceiling in a single request
 * rather than 7 sequential round trips.
 */
function enterCeilingRequestInit() {
  const body = new URLSearchParams();
  body.set('addPlayer', '1');
  for (let i = 0; i < 7; i++) {
    body.append('playerName', `Player ${i + 1}`);
    body.append('gender', '');
    body.append('club', '');
    body.append('birthYear', '');
    body.append('remarks', '');
  }
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  };
}

async function measure(pathname, init, label = pathname) {
  const response = await handler(new Request(`http://weight-check.test${pathname}`, init));
  if (response.status !== 200) {
    console.error(`Rendering ${pathname} returned ${response.status}, not 200.`);
    console.error(await response.text());
    process.exit(1);
  }
  const html = await response.text();
  const htmlGzipBytes = zlib.gzipSync(Buffer.from(html, 'utf-8')).length;

  // The scripts the document actually asks for. Inline scripts are already
  // inside `htmlGzipBytes`, so only `src=` costs anything extra; URLs are
  // `${publicPath}assets/…` per the build itself.
  const scriptSrcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  const criticalJsBytes = scriptSrcs.reduce((sum, url) => {
    const rel = url.startsWith(build.publicPath) ? url.slice(build.publicPath.length) : url;
    const abs = path.join(clientDir, rel.replace(/^\//, ''));
    if (!fs.existsSync(abs)) {
      console.error(`The page references ${url}, which is not in build/client — 404 in prod.`);
      process.exit(1);
    }
    return sum + gzipSizeOf(abs);
  }, 0);

  return { pathname: label, htmlGzipBytes, criticalJsBytes, scriptCount: scriptSrcs.length };
}

const measured = [];
for (const pathname of MEASURED) {
  measured.push(await measure(pathname));
}
measured.push(
  await measure(
    '/e/spring-open/enter',
    enterCeilingRequestInit(),
    '/e/spring-open/enter [8 blocks]',
  ),
);

// 4 KB per document, all of it HTML, because this tier ships no client JS.
// With the +10% CI slack that is a 4.4 KB ceiling per page.
//
// The old number was 123 KB. R8-F derived that from a ~98.8 KB react-dom +
// React Router HYDRATION FLOOR, and that floor no longer exists — `root.tsx`
// renders no `<Scripts/>`. The 4 KB figure was then derived from the
// SP-P6-1 document (2.5 KB measured); the SP-P6-2 redesign's three pages
// measure inside it (G6 stays open — if the enter page outgrows it once
// real content lands, the budget is re-derived from measurement, gate
// blocking, per the R8-F precedent).
const BUDGET_KB = 4;
const SLACK_KB = BUDGET_KB * 1.1; // +10% CI slack

let cssNote = '';
const cssFile = fs.readdirSync(path.join(clientDir, 'assets')).find((f) => /^app-.*\.css$/.test(f));
if (cssFile) {
  const cssKb = gzipSizeOf(path.join(clientDir, 'assets', cssFile)) / 1024;
  cssNote = ` (not counted; app.css alone is ${cssKb.toFixed(1)} KB gzipped)`;
}

let failed = false;
for (const { pathname, htmlGzipBytes, criticalJsBytes, scriptCount } of measured) {
  const totalKb = (htmlGzipBytes + criticalJsBytes) / 1024;
  const verdict = totalKb <= SLACK_KB ? 'PASS' : 'FAIL';
  if (verdict === 'FAIL') failed = true;
  console.log(
    `${pathname.padEnd(24)} HTML ${(htmlGzipBytes / 1024).toFixed(1)} KB gz` +
      ` + JS ${(criticalJsBytes / 1024).toFixed(1)} KB [${scriptCount} scripts]` +
      ` = ${totalKb.toFixed(1)} KB  ${verdict}`,
  );
}
console.log(`Budget:                ${BUDGET_KB} KB per page (+10% CI slack = ${SLACK_KB.toFixed(1)} KB)${cssNote}`);

if (!failed) {
  console.log('PASS');
  process.exit(0);
} else {
  console.error(`FAIL — at least one page exceeds the ${SLACK_KB.toFixed(1)} KB gate`);
  process.exit(1);
}
