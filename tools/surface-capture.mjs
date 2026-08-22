/**
 * Surface capture — walks every page of one tier and writes a self-contained
 * HTML report with an embedded screenshot per surface.
 *
 * Same shape as the earlier console reports in docs/history/audits/: one card
 * per surface, base64 PNGs inline so the file opens anywhere with no asset
 * directory beside it.
 *
 *   node tools/surface-capture.mjs console  http://127.0.0.1:5173  out.html
 *   node tools/surface-capture.mjs entrant  http://127.0.0.1:5180  out.html
 *
 * Not wired into CI: it needs a running stack and is an authoring tool.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

// Playwright is installed in the e2e workspace, not at the repo root, and ESM
// resolves from THIS file's location — so reach it through that package.
const req = createRequire(new URL('../tests/e2e/package.json', import.meta.url));
const { chromium } = req('playwright');

const [tier, base, outPath] = process.argv.slice(2);
if (!tier || !base || !outPath) {
  console.error('usage: surface-capture.mjs <console|entrant> <baseUrl> <out.html>');
  process.exit(2);
}

// Workspace + tournament seeded for review (see the session that produced this).
// The default was a MALFORMED uuid (`…-8fea-3b3237a72dcee4` — a 13-char final
// group), so every run without an explicit WS_ID 422'd on the API and captured
// error surfaces. Corrected to the real id of the seeded review workspace.
const WS = process.env.WS_ID ?? '678379de-7eec-4582-8feb-3237a72dcee4';
const SLUG = process.env.SLUG ?? 'dfw-lewisville-2026';

const CONSOLE_SURFACES = [
  ['Hub — workspace list', '/'],
  ['Overview', `/tournaments/${WS}/overview`],
  ['Operations · Plan (queue mode)', `/tournaments/${WS}/schedule`],
  ['Operations · Run (live)', `/tournaments/${WS}/live`],
  ['Meet · Roster', `/tournaments/${WS}/roster`],
  ['Meet · Matches', `/tournaments/${WS}/matches`],
  ['Meet · Setup', `/tournaments/${WS}/setup`],
  ['Bracket · Draws', `/tournaments/${WS}/bracket-draws`],
  ['Bracket · Roster', `/tournaments/${WS}/bracket-roster`],
  ['Bracket · Matches', `/tournaments/${WS}/bracket-matches`],
  ['Bracket · Setup', `/tournaments/${WS}/bracket-setup`],
  ['Entries · Desk', `/tournaments/${WS}/entries`],
  ['Display · Board config', `/tournaments/${WS}/display-config`],
  ['Settings · Venue & schedule', `/tournaments/${WS}/ws-venue`],
  ['Settings · Sharing', `/tournaments/${WS}/ws-sharing`],
  ['Settings · People & access', `/tournaments/${WS}/ws-members`],
  ['Settings · Modules', `/tournaments/${WS}/ws-modules`],
  ['Settings · General', `/tournaments/${WS}/ws-settings`],
  ['Settings · Backups', `/tournaments/${WS}/ws-sync`],
];

const ENTRANT_SURFACES = [
  ['Discovery — find a tournament', '/e/'],
  ['Tournament · Overview', `/e/${SLUG}`],
  ['Tournament · Events', `/e/${SLUG}?tab=events`],
  ['Tournament · Entrants', `/e/${SLUG}?tab=entrants`],
  ['Tournament · Draws', `/e/${SLUG}?tab=draws`],
  ['Tournament · Seeded entries', `/e/${SLUG}?tab=seeds`],
  ['Tournament · Winners', `/e/${SLUG}?tab=winners`],
  ['Draw — finished (U11 BS)', `/e/${SLUG}/draws/u11-bs`],
  ['Draw — in progress (U13 BS)', `/e/${SLUG}/draws/u13-bs`],
  ['Draw — not started (U19 BS)', `/e/${SLUG}/draws/u19-bs`],
  ['Regulations reader', `/e/${SLUG}/regulations`],
  ['Entry form', `/e/${SLUG}/enter`],
  ['Sign in', '/e/login'],
  ['Create an account', '/e/signup'],
  ['My entries (signed out)', '/e/me/entries'],
  ['Unpublished tournament (gated tabs)', '/e/dave-freeman-jr-2026'],
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

for (const [label, path] of surfaces) {
  const shots = {};
  let note = '';
  for (const [vpName, width, height] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 200));
    });
    try {
      // `domcontentloaded` + a fixed settle, NOT `networkidle`: some pages
      // hold a connection open (dev-server sockets, embedded widgets) so
      // networkidle never fires and the capture times out on a page that
      // actually serves in milliseconds.
      const res = await page.goto(base + path, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1800);
      shots[vpName] = (await page.screenshot({ fullPage: true })).toString('base64');
      if (vpName === 'desktop') {
        const status = res?.status() ?? 0;
        const title = await page.title();
        note = `HTTP ${status} · <code>${esc(title)}</code>`;
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

await browser.close();

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
  .shot { background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px 16px 12px; margin:20px 0; }
  .shot h2 { font-size:15px; margin:0 0 3px; }
  .shot .path { font-size:12px; color:#5a6172; margin:0 0 4px; }
  .shot .note { font-size:12px; color:#3c4250; margin:0 0 12px; }
  .err { color:#b42318; font-weight:600; }
  code { background:#f2f4f7; padding:1px 4px; border-radius:3px; font-size:12px; }
  .pair { display:grid; grid-template-columns: 1fr 320px; gap:14px; align-items:start; }
  .pair img { width:100%; border:1px solid #e5e7eb; border-radius:4px; display:block; }
  .cap { font-size:11px; color:#7a8194; margin:4px 0 0; }
  @media (max-width: 900px) { .pair { grid-template-columns: 1fr; } .toc ul { columns:1; } }
</style></head><body>
<header>
  <h1>${esc(title)}</h1>
  <p class="meta">Captured ${new Date().toISOString().slice(0, 10)} against the local stack
  (API :8600 on <code>data/local.db</code>). Desktop 1440&times;900 and mobile 390&times;844, full-page,
  for every surface. Source tournament: <code>${esc(SLUG)}</code> — 70 entrants, 9 events, all three
  publication flags on, results deliberately staged so some events are finished, some mid-draw and
  some untouched. Generated by <code>tools/surface-capture.mjs</code>.</p>
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

writeFileSync(outPath, html);
console.log(`\nwrote ${outPath} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
