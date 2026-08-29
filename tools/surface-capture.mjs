/**
 * Surface capture — walks every page of one tier and writes a self-contained
 * HTML/PDF review book with an embedded screenshot per surface.
 *
 * One card per surface, with base64 PNGs inline so the file opens anywhere
 * without an asset directory beside it.
 *
 *   node tools/surface-capture.mjs console  http://127.0.0.1:5173  out.pdf
 *   node tools/surface-capture.mjs entrant  http://127.0.0.1:5180  out.pdf
 *
 * Not wired into CI: it needs a running stack and is an authoring tool.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname } from 'node:path';

// Playwright is installed in the e2e workspace, not at the repo root, and ESM
// resolves from THIS file's location — so reach it through that package.
const req = createRequire(new URL('../tests/e2e/package.json', import.meta.url));
const { chromium } = req('playwright');

const [tier, base, outPath] = process.argv.slice(2);
if (!tier || !base || !outPath) {
  console.error('usage: surface-capture.mjs <console|entrant> <baseUrl> <out.html|out.pdf>');
  process.exit(2);
}
if (!['console', 'entrant'].includes(tier) || !['.html', '.pdf'].includes(extname(outPath))) {
  console.error('tier must be console or entrant; output must end in .html or .pdf');
  process.exit(2);
}

// Current production-parity demo defaults. Override these for another seed run;
// the selected values are printed into the report so a review is reproducible.
const WS = process.env.WS_ID ?? 'a86a39b3-0eb4-4c12-9106-5ff1bd1e5aa2';
const SLUG = process.env.SLUG ?? '2026-korea-masters-t030';
const DRAW_KEY = process.env.DRAW_KEY ?? 'MS';
const DOUBLES_DRAW_KEY = process.env.DOUBLES_DRAW_KEY ?? 'MD';
const SUBMISSION_ID = process.env.SUBMISSION_ID ?? '11111111-1111-4111-8111-111111111111';
const DISPLAY_TOKEN = process.env.DISPLAY_TOKEN ?? '';
const AUTH_ME_URL = process.env.AUTH_ME_URL ?? '';
const SETTLE_MS = Number(process.env.CAPTURE_SETTLE_MS ?? '1800');
const normalizedBase = base.replace(/\/$/, '');

const CONSOLE_SURFACES = [
  ['Authentication · Sign in', '/login'],
  ['Hub — workspace list', '/'],
  ['Hub — create workspace', '/new'],
  ['Global settings', '/settings'],
  ['Overview', `/tournaments/${WS}/overview`],
  ['Bracket · Configuration', `/tournaments/${WS}/bracket-setup`],
  ['Bracket · Roster', `/tournaments/${WS}/bracket-roster`],
  ['Bracket · Draws index', `/tournaments/${WS}/bracket-draws`],
  ['Bracket · Draw canvas', `/tournaments/${WS}/bracket-draw`],
  ['Bracket · Matches', `/tournaments/${WS}/bracket-matches`],
  ['Operations · Plan', `/tournaments/${WS}/bracket-schedule`],
  ['Operations · Live day', `/tournaments/${WS}/bracket-live`],
  ['Display · Preview', `/tournaments/${WS}/tv`],
  ['Display · Board config', `/tournaments/${WS}/display-config`],
  [
    DISPLAY_TOKEN ? 'Display · Fullscreen venue board' : 'Display · Missing capability',
    DISPLAY_TOKEN ? `/display?token=${encodeURIComponent(DISPLAY_TOKEN)}` : '/display',
  ],
  ['Settings · Venue & schedule', `/tournaments/${WS}/ws-venue`],
  ['Settings · People & access', `/tournaments/${WS}/ws-members`],
  ['Settings · Sharing', `/tournaments/${WS}/ws-sharing`],
  ['Settings · Modules', `/tournaments/${WS}/ws-modules`],
  ['Settings · Backups', `/tournaments/${WS}/ws-sync`],
  ['Settings · General and danger zone', `/tournaments/${WS}/ws-settings`],
  ['Module guard · Entries unavailable', `/tournaments/${WS}/entries`],
  ['Module guard · Meet configuration unavailable', `/tournaments/${WS}/setup`],
  ['Module guard · Meet roster unavailable', `/tournaments/${WS}/roster`],
  ['Module guard · Meet matches unavailable', `/tournaments/${WS}/matches`],
];

const ENTRANT_SURFACES = [
  ['Discovery · Season', '/e/'],
  ['Discovery · Completed tournaments', '/e/?view=completed#calendar'],
  ['Tournament · Overview', `/e/${SLUG}`],
  ['Tournament · Events', `/e/${SLUG}?tab=events`],
  ['Tournament · Players', `/e/${SLUG}?tab=players`],
  ['Tournament · Draws', `/e/${SLUG}?tab=draws`],
  ['Tournament · Seeded entries', `/e/${SLUG}?tab=seeds`],
  ['Tournament · Winners', `/e/${SLUG}?tab=winners`],
  ['Draw · Singles detail', `/e/${SLUG}/draws/${DRAW_KEY}`],
  ['Draw · Doubles detail', `/e/${SLUG}/draws/${DOUBLES_DRAW_KEY}`],
  ['Regulations reader', `/e/${SLUG}/regulations`],
  ['Entry form', `/e/${SLUG}/enter`],
  ['Entry form · Signed-in outcome', `/e/${SLUG}/enter/signed-in`],
  ['Entry form · Account-created outcome', `/e/${SLUG}/enter/created`],
  ['Account · Sign in', '/e/login'],
  ['Account · Created outcome', '/e/login/created'],
  ['Account · Failed sign-in outcome', '/e/login/failed'],
  ['Account · Signed-in outcome', '/e/login/signed-in'],
  ['Account · Create account', '/e/signup'],
  ['Account · Create account for tournament', `/e/signup/${SLUG}`],
  ['Account · Verify address', '/e/verify'],
  ['Account · Verification complete', '/e/verify/done'],
  ['Account · Verification failed', '/e/verify/failed'],
  ['Account · Forgot password', '/e/forgot'],
  ['Account · Reset password', '/e/reset'],
  ['Account · Reset email sent', '/e/reset/sent'],
  ['Account · Password reset complete', '/e/reset/done'],
  ['Account · Password reset failed', '/e/reset/failed'],
  ['Doubles partner invitation', '/e/partner'],
  ['Doubles partner accepted', '/e/partner/accepted'],
  ['Doubles partner failed', '/e/partner/failed'],
  ['My entries (signed out)', '/e/me/entries'],
  ['Entry receipt', `/e/${SLUG}/receipt/${SUBMISSION_ID}`],
];

const surfaces = tier === 'console' ? CONSOLE_SURFACES : ENTRANT_SURFACES;
const VIEWPORTS = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const browser = await chromium.launch();
const cards = [];
let cachedAuthMe = null;

// The production nginx auth budget is intentionally 10 requests/minute. A
// hard navigation per surface would spend it on the same read-only `/auth/me`
// bootstrap dozens of times and capture rate-limit pages instead of product
// UI. Capture that stable local-demo identity once, then fulfill the repeated
// browser bootstrap locally. Other API reads still exercise the live stack.
if (tier === 'console' && AUTH_ME_URL) {
  const response = await fetch(AUTH_ME_URL);
  if (!response.ok) throw new Error(`AUTH_ME_URL returned HTTP ${response.status}`);
  cachedAuthMe = {
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/json',
    body: await response.text(),
  };
}

for (const [label, path] of surfaces) {
  const shots = {};
  let note = '';
  for (const [vpName, width, height] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    if (tier === 'console') {
      await page.route('**/api/auth/me', async (route) => {
        if (cachedAuthMe === null) {
          const response = await route.fetch();
          cachedAuthMe = {
            status: response.status(),
            contentType: response.headers()['content-type'] ?? 'application/json',
            body: await response.text(),
          };
        }
        await route.fulfill({
          status: cachedAuthMe.status,
          contentType: cachedAuthMe.contentType,
          body: cachedAuthMe.body,
        });
      });
    }
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 200));
    });
    try {
      // `domcontentloaded` + a fixed settle, NOT `networkidle`: some pages
      // hold a connection open (dev-server sockets, embedded widgets) so
      // networkidle never fires and the capture times out on a page that
      // actually serves in milliseconds.
      const res = await page.goto(normalizedBase + path, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(SETTLE_MS);
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      shots[vpName] = (await page.screenshot({ fullPage: true })).toString('base64');
      if (vpName === 'desktop') {
        const status = res?.status() ?? 0;
        const title = await page.title();
        note = `HTTP ${status} · <code>${esc(title)}</code> · final <code>${esc(new URL(page.url()).pathname + new URL(page.url()).search)}</code>`;
        if (errors.length) {
          note += ` · <span class="err">${errors.length} console error(s): ${esc(errors[0])}</span>`;
        }
      }
    } catch (err) {
      if (vpName === 'desktop') note = `<span class="err">FAILED: ${esc(err.message.split('\n')[0])}</span>`;
    }
    await ctx.close();
  }
  cards.push({ label, path, note, shots });
  console.log(`captured  ${label}`);
}

const title =
  tier === 'console'
    ? 'Operator console — full surface report'
    : 'Public site (ShuttleWorks Tournaments) — full surface report';

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { font: 14px/1.55 -apple-system, "Segoe UI", sans-serif; color:#1a1d23; margin:0; background:#f6f7f9; }
  header, main { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
  header { padding: 40px 24px 8px; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  .meta { color:#5a6172; font-size:13px; max-width: 80ch; }
  .toc { background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:14px 20px; margin:20px 0; }
  .toc ul { margin:6px 0 0; padding-left:18px; columns:2; }
  .toc li { font-size:13px; margin:3px 0; }
  .shot { background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px 16px 12px; margin:20px 0; break-inside:avoid; }
  .shot h2 { font-size:15px; margin:0 0 3px; }
  .shot .path { font-size:12px; color:#5a6172; margin:0 0 4px; }
  .shot .note { font-size:12px; color:#3c4250; margin:0 0 12px; }
  .err { color:#b42318; font-weight:600; }
  code { background:#f2f4f7; padding:1px 4px; border-radius:3px; font-size:12px; }
  .pair { display:grid; grid-template-columns: 1fr 320px; gap:14px; align-items:start; }
  .pair img { width:100%; border:1px solid #e5e7eb; border-radius:4px; display:block; }
  .cap { font-size:11px; color:#7a8194; margin:4px 0 0; }
  @media (max-width: 900px) { .pair { grid-template-columns: 1fr; } .toc ul { columns:1; } }
  @page { size: A3 landscape; margin: 10mm; }
  @media print {
    body { background:#fff; }
    header, main { max-width:none; padding:0; }
    header { padding:0; }
    .toc { break-after:page; page-break-after:always; }
    .shot {
      min-height:265mm;
      border:0;
      border-radius:0;
      margin:0;
      padding:0;
      break-before:page;
      break-inside:avoid;
      page-break-before:always;
      page-break-inside:avoid;
    }
    .pair { grid-template-columns:minmax(0, 1fr) 300px; }
    .pair img { max-height:245mm; object-fit:contain; object-position:top left; }
  }
</style></head><body>
<header>
  <h1>${esc(title)}</h1>
  <p class="meta">Captured ${new Date().toISOString()} from <code>${esc(normalizedBase)}</code>.
  Desktop 1440&times;900 and mobile 390&times;844, full-page. Workspace <code>${esc(WS)}</code>;
  public tournament <code>${esc(SLUG)}</code>. Generated by
  <code>tools/surface-capture.mjs</code>.</p>
  <div class="toc"><strong>${cards.length} surfaces</strong>
    <ul>${cards.map((c, i) => `<li><a href="#s${i}">${esc(c.label)}</a></li>`).join('')}</ul>
  </div>
</header>
<main>
${cards
  .map(
    (c, i) => `<section class="shot" id="s${i}">
  <h2>${esc(c.label)}</h2>
  <p class="path"><code>${esc(c.path)}</code></p>
  <p class="note">${c.note}</p>
  <div class="pair">
    <div>${c.shots.desktop ? `<img src="data:image/png;base64,${c.shots.desktop}" alt="${esc(c.label)} desktop">` : '<em>no desktop capture</em>'}<p class="cap">desktop 1440&times;900</p></div>
    <div>${c.shots.mobile ? `<img src="data:image/png;base64,${c.shots.mobile}" alt="${esc(c.label)} mobile">` : '<em>no mobile capture</em>'}<p class="cap">mobile 390&times;844</p></div>
  </div>
</section>`,
  )
  .join('\n')}
</main></body></html>`;

mkdirSync(dirname(outPath), { recursive: true });
const htmlPath = extname(outPath) === '.pdf' ? outPath.replace(/\.pdf$/, '.html') : outPath;
writeFileSync(htmlPath, html);
console.log(`\nwrote ${htmlPath} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);

if (extname(outPath) === '.pdf') {
  const reportPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await reportPage.setContent(html, { waitUntil: 'load', timeout: 120000 });
  await reportPage.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
  await reportPage.pdf({
    path: outPath,
    format: 'A3',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
  });
  console.log(`wrote ${outPath}`);
}

await browser.close();
