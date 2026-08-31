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
import { createRequire } from "node:module";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";

// Playwright is installed in the e2e workspace, not at the repo root, and ESM
// resolves from THIS file's location — so reach it through that package.
const req = createRequire(
  new URL("../tests/e2e/package.json", import.meta.url),
);
const { chromium } = req("playwright");

const [tier, base, outPath] = process.argv.slice(2);
if (!tier || !base || !outPath) {
  console.error(
    "usage: surface-capture.mjs <console|entrant> <baseUrl> <out.html|out.pdf>",
  );
  process.exit(2);
}
if (
  !["console", "entrant"].includes(tier) ||
  ![".html", ".pdf"].includes(extname(outPath))
) {
  console.error(
    "tier must be console or entrant; output must end in .html or .pdf",
  );
  process.exit(2);
}

// Current production-parity demo defaults. Override these for another seed run;
// the selected values are printed into the report so a review is reproducible.
const WS = process.env.WS_ID ?? "a86a39b3-0eb4-4c12-9106-5ff1bd1e5aa2";
const SLUG = process.env.SLUG ?? "2026-korea-masters-t030";
const DRAW_KEY = process.env.DRAW_KEY ?? "MS";
const DOUBLES_DRAW_KEY = process.env.DOUBLES_DRAW_KEY ?? "MD";
const SUBMISSION_ID =
  process.env.SUBMISSION_ID ?? "11111111-1111-4111-8111-111111111111";
const DISPLAY_TOKEN = process.env.DISPLAY_TOKEN ?? "";
const AUTH_ME_URL = process.env.AUTH_ME_URL ?? "";
const PLAYER_KEY = process.env.PLAYER_KEY ?? "";
const SETTLE_MS = Number(process.env.CAPTURE_SETTLE_MS ?? "1800");
const normalizedBase = base.replace(/\/$/, "");

const CONSOLE_SURFACES = [
  ["Authentication · Sign in", "/login"],
  ["Hub — workspace list", "/"],
  ["Hub — create workspace", "/new"],
  ["Global settings", "/settings"],
  ["Overview", `/tournaments/${WS}/overview`],
  ["Setup · General", `/tournaments/${WS}/setup/general`],
  ["Setup · Dates", `/tournaments/${WS}/setup/dates`],
  ["Setup · Venue", `/tournaments/${WS}/setup/venue`],
  ["Setup · Events", `/tournaments/${WS}/setup/events`],
  ["Setup · Rules", `/tournaments/${WS}/setup/rules`],
  ["Setup · Entry rules", `/tournaments/${WS}/setup/entries`],
  ["Setup · Staff", `/tournaments/${WS}/setup/people`],
  ["Setup · Public information", `/tournaments/${WS}/setup/public-info`],
  ["Participants · Roster", `/tournaments/${WS}/participants/people`],
  ["Competition · Draws", `/tournaments/${WS}/competition/draws`],
  [
    "Competition · Draw canvas",
    `/tournaments/${WS}/competition/draw?event=${DRAW_KEY}`,
  ],
  ["Competition · Matches", `/tournaments/${WS}/competition/matches`],
  ["Operations · Plan", `/tournaments/${WS}/operations/plan`],
  ["Operations · Live day", `/tournaments/${WS}/operations/live`],
  ["Publish · Site", `/tournaments/${WS}/publish/site`],
  ["Publish · Draws and results", `/tournaments/${WS}/publish/draws-results`],
  ["Publish · Displays", `/tournaments/${WS}/publish/displays`],
  ["Publish · Links", `/tournaments/${WS}/publish/links`],
  [
    DISPLAY_TOKEN
      ? "Display · Fullscreen venue board"
      : "Display · Missing capability",
    DISPLAY_TOKEN
      ? `/display?token=${encodeURIComponent(DISPLAY_TOKEN)}`
      : "/display",
  ],
  ["Administration · Team", `/tournaments/${WS}/administration/team`],
  ["Administration · Modules", `/tournaments/${WS}/administration/modules`],
  ["Administration · Backups", `/tournaments/${WS}/administration/backups`],
  ["Administration · Activity", `/tournaments/${WS}/administration/activity`],
  ["Administration · Lifecycle", `/tournaments/${WS}/administration/lifecycle`],
  ["Module guard · Entries unavailable", `/tournaments/${WS}/entries`],
  ["Module guard · Meet configuration unavailable", `/tournaments/${WS}/setup`],
  ["Module guard · Meet roster unavailable", `/tournaments/${WS}/roster`],
  ["Module guard · Meet matches unavailable", `/tournaments/${WS}/matches`],
];

const ENTRANT_SURFACES = [
  ["Discovery · Season", "/e/"],
  ["Discovery · Completed tournaments", "/e/?view=completed#calendar"],
  ["Tournament · Overview", `/e/${SLUG}`],
  ["Tournament · Events", `/e/${SLUG}?tab=events`],
  ["Tournament · Players", `/e/${SLUG}?tab=players`],
  ["Tournament · Draws", `/e/${SLUG}?tab=draws`],
  ["Tournament · Seeded entries", `/e/${SLUG}?tab=seeds`],
  ["Tournament · Winners", `/e/${SLUG}?tab=winners`],
  ["Tournament · Schedule and live", `/e/${SLUG}/schedule`],
  ["Draw · Singles full bracket", `/e/${SLUG}/draws/${DRAW_KEY}`],
  [
    "Draw · Singles round view",
    `/e/${SLUG}/draws/${DRAW_KEY}?view=round&round=1`,
  ],
  [
    "Draw · Singles player path",
    `/e/${SLUG}/draws/${DRAW_KEY}?view=path&player=Zhu`,
  ],
  ["Draw · Singles match list", `/e/${SLUG}/draws/${DRAW_KEY}?view=list`],
  ["Draw · Doubles detail", `/e/${SLUG}/draws/${DOUBLES_DRAW_KEY}`],
  ["Regulations reader", `/e/${SLUG}/regulations`],
  ["Entry form", `/e/${SLUG}/enter`],
  ["Entry form · Signed-in outcome", `/e/${SLUG}/enter/signed-in`],
  ["Entry form · Account-created outcome", `/e/${SLUG}/enter/created`],
  ["Account · Sign in", "/e/login"],
  ["Account · Created outcome", "/e/login/created"],
  ["Account · Failed sign-in outcome", "/e/login/failed"],
  ["Account · Signed-in outcome", "/e/login/signed-in"],
  ["Account · Create account", "/e/signup"],
  ["Account · Create account for tournament", `/e/signup/${SLUG}`],
  ["Account · Verify address", "/e/verify"],
  ["Account · Verification complete", "/e/verify/done"],
  ["Account · Verification failed", "/e/verify/failed"],
  ["Account · Verification email sent", "/e/verify/sent"],
  ["Account · Forgot password", "/e/forgot"],
  ["Account · Reset password", "/e/reset"],
  ["Account · Reset email sent", "/e/reset/sent"],
  ["Account · Password reset complete", "/e/reset/done"],
  ["Account · Password reset failed", "/e/reset/failed"],
  ["Account · New password failed", "/e/reset/password-failed"],
  ["Doubles partner invitation", "/e/partner"],
  ["Doubles partner accepted", "/e/partner/accepted"],
  ["Doubles partner failed", "/e/partner/failed"],
  ["My entries (signed out)", "/e/me/entries"],
  ["Entry receipt", `/e/${SLUG}/receipt/${SUBMISSION_ID}`],
];

const EXACT_DESCRIPTIONS = Object.freeze({
  "Authentication · Sign in":
    "Operator authentication entry point and recovery handoff.",
  "Hub — workspace list":
    "Operator landing page for finding, opening, and reviewing tournament workspaces.",
  "Hub — create workspace":
    "Guided workspace creation flow for choosing a tournament engine and initial details.",
  "Global settings":
    "Account-wide preferences that apply outside any individual tournament.",
  Overview:
    "At-a-glance tournament state, readiness, next actions, and operational health.",
  "Display · Fullscreen venue board":
    "Audience-facing venue display rendered from the current tournament state.",
  "Display · Missing capability":
    "Safe missing-token state for a venue display link without access.",
  "Module guard · Entries unavailable":
    "Capability guard shown when the Entries module is unavailable.",
  "Module guard · Meet configuration unavailable":
    "Capability guard for Meet configuration in a bracket workspace.",
  "Module guard · Meet roster unavailable":
    "Capability guard for Meet roster tools in a bracket workspace.",
  "Module guard · Meet matches unavailable":
    "Capability guard for Meet match tools in a bracket workspace.",
  "Discovery · Season":
    "Public tournament discovery page for browsing the active season.",
  "Discovery · Completed tournaments":
    "Historical discovery view focused on completed tournaments.",
  "Tournament · Overview":
    "Public tournament summary, dates, venue, status, and primary calls to action.",
  "Tournament · Events":
    "Published event catalog with formats and entry status.",
  "Tournament · Players":
    "Published player directory derived from entrant and draw rosters.",
  "Tournament · Draws":
    "Published draw index across all tournament disciplines.",
  "Tournament · Seeded entries": "Published seed order grouped by event.",
  "Tournament · Winners": "Tournament honors and decided-event results.",
  "Tournament · Schedule and live":
    "Filterable public match schedule with courts, timing, and live state.",
  "Draw · Singles full bracket":
    "Complete singles elimination tree with scores and feeder connections.",
  "Draw · Singles round view":
    "Focused single-round reading mode for smaller screens and quick review.",
  "Draw · Singles player path":
    "Searchable route through the draw for one player or pair.",
  "Draw · Singles match list":
    "Linear, accessible list of every match in the selected draw.",
  "Draw · Doubles detail":
    "Complete doubles draw with paired names, results, and progression.",
  "Regulations reader":
    "Tournament regulations, policies, venue notes, and entry guidance.",
  "Entry form":
    "Public tournament entry workflow before authentication or submission.",
  "Entry form · Signed-in outcome":
    "Entry workflow resumed after a successful sign-in.",
  "Entry form · Account-created outcome":
    "Entry workflow resumed after account creation.",
  "My entries (signed out)":
    "Entrant account home in its signed-out recovery state.",
  "Entry receipt":
    "Submission receipt and recovery state for a tournament entry.",
  "Player detail":
    "One player’s tournament events, draw paths, upcoming matches, and completed matches.",
});

function descriptionFor(label) {
  if (EXACT_DESCRIPTIONS[label]) return EXACT_DESCRIPTIONS[label];
  if (label.startsWith("Setup · ")) {
    return `Operator setup surface for ${label.slice("Setup · ".length).toLowerCase()} configuration and readiness.`;
  }
  if (label.startsWith("Participants · ")) {
    return "Operator participant workspace for roster identity, eligibility, and event involvement.";
  }
  if (label.startsWith("Competition · Draws")) {
    return "Operator draw index for generation state, coverage, and opening an event bracket.";
  }
  if (label === "Competition · Draw canvas") {
    return "Interactive operator bracket canvas for reviewing progression and recording results.";
  }
  if (label === "Competition · Matches") {
    return "Operator match inventory for search, status review, corrections, and result entry.";
  }
  if (label.startsWith("Operations · ")) {
    return `Day-of operator workflow for ${label.slice("Operations · ".length).toLowerCase()} scheduling and court control.`;
  }
  if (label.startsWith("Publish · ")) {
    return `Publication control surface for ${label.slice("Publish · ".length).toLowerCase()} visibility and sharing.`;
  }
  if (label.startsWith("Administration · ")) {
    return `Workspace administration for ${label.slice("Administration · ".length).toLowerCase()} management.`;
  }
  if (label.startsWith("Account · ")) {
    return `Public account flow showing the ${label.slice("Account · ".length).toLowerCase()} state.`;
  }
  if (label.startsWith("Doubles partner ")) {
    return `Doubles partner invitation flow in its ${label.slice("Doubles partner ".length)} state.`;
  }
  return "Product surface captured for visual design and user-flow review.";
}

async function resolvePublicPersonKey() {
  if (PLAYER_KEY) return PLAYER_KEY;
  try {
    const response = await fetch(
      `${normalizedBase}/e/api/page/${encodeURIComponent(SLUG)}/players`,
    );
    if (!response.ok) return "";
    const payload = await response.json();
    return payload.players?.find((player) => player.personKey)?.personKey ?? "";
  } catch {
    return "";
  }
}

let surfaces =
  tier === "console" ? [...CONSOLE_SURFACES] : [...ENTRANT_SURFACES];
if (tier === "entrant") {
  const playerKey = await resolvePublicPersonKey();
  if (playerKey) {
    const afterPlayers =
      surfaces.findIndex(([label]) => label === "Tournament · Players") + 1;
    surfaces.splice(afterPlayers, 0, [
      "Player detail",
      `/e/${SLUG}/players/${encodeURIComponent(playerKey)}`,
    ]);
  }
}

surfaces = surfaces.map(([label, path]) => [
  label,
  path,
  descriptionFor(label),
]);
const VIEWPORTS = [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
];

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const artifactStem = outPath.slice(0, -extname(outPath).length);
const manifestPath = `${artifactStem}.manifest.json`;
const runningPath = `${artifactStem}.running.json`;
const startedAt = new Date();
const runState = {
  schemaVersion: 1,
  status: "running",
  tier,
  baseUrl: normalizedBase,
  output: outPath,
  startedAt: startedAt.toISOString(),
  updatedAt: startedAt.toISOString(),
  surfaceCount: surfaces.length,
  completedSurfaces: 0,
  surfaces: [],
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(runningPath, `${JSON.stringify(runState, null, 2)}\n`);

const browser = await chromium.launch();
const cards = [];
let cachedAuthMe = null;

// The production nginx auth budget is intentionally 10 requests/minute. A
// hard navigation per surface would spend it on the same read-only `/auth/me`
// bootstrap dozens of times and capture rate-limit pages instead of product
// UI. Capture that stable local-demo identity once, then fulfill the repeated
// browser bootstrap locally. Other API reads still exercise the live stack.
if (tier === "console" && AUTH_ME_URL) {
  const response = await fetch(AUTH_ME_URL);
  if (!response.ok)
    throw new Error(`AUTH_ME_URL returned HTTP ${response.status}`);
  cachedAuthMe = {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "application/json",
    body: await response.text(),
  };
}

for (const [surfaceIndex, [label, path, description]] of surfaces.entries()) {
  const surfaceStartedAt = Date.now();
  const shots = {};
  const viewportRuns = {};
  let note = "";
  for (const [vpName, width, height] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    if (tier === "console") {
      await page.route("**/api/auth/me", async (route) => {
        if (cachedAuthMe === null) {
          const response = await route.fetch();
          cachedAuthMe = {
            status: response.status(),
            contentType:
              response.headers()["content-type"] ?? "application/json",
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
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    try {
      // `domcontentloaded` + a fixed settle, NOT `networkidle`: some pages
      // hold a connection open (dev-server sockets, embedded widgets) so
      // networkidle never fires and the capture times out on a page that
      // actually serves in milliseconds.
      const res = await page.goto(normalizedBase + path, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(SETTLE_MS);
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      shots[vpName] = (await page.screenshot({ fullPage: true })).toString(
        "base64",
      );
      viewportRuns[vpName] = {
        ok: (res?.status() ?? 0) < 400,
        httpStatus: res?.status() ?? 0,
        finalUrl: page.url(),
        consoleErrors: errors,
      };
      if ((res?.status() ?? 0) >= 400) {
        viewportRuns[vpName].error = `HTTP ${res.status()}`;
      }
      if (vpName === "desktop") {
        const status = res?.status() ?? 0;
        const title = await page.title();
        note = `HTTP ${status} · <code>${esc(title)}</code> · final <code>${esc(new URL(page.url()).pathname + new URL(page.url()).search)}</code>`;
        if (errors.length) {
          note += ` · <span class="err">${errors.length} console error(s): ${esc(errors[0])}</span>`;
        }
      }
    } catch (err) {
      viewportRuns[vpName] = {
        ok: false,
        error: err.message.split("\n")[0],
        consoleErrors: errors,
      };
      if (vpName === "desktop")
        note = `<span class="err">FAILED: ${esc(err.message.split("\n")[0])}</span>`;
    }
    await ctx.close();
  }
  const ref = `S${String(surfaceIndex + 1).padStart(2, "0")}`;
  const surfaceRun = {
    ref,
    label,
    path,
    description,
    durationMs: Date.now() - surfaceStartedAt,
    viewports: viewportRuns,
  };
  cards.push({ ref, label, path, description, note, shots });
  runState.completedSurfaces = surfaceIndex + 1;
  runState.updatedAt = new Date().toISOString();
  runState.surfaces.push(surfaceRun);
  writeFileSync(runningPath, `${JSON.stringify(runState, null, 2)}\n`);
  console.log(
    `[${surfaceIndex + 1}/${surfaces.length}] ${ref} captured  ${label}`,
  );
}

const title =
  tier === "console"
    ? "Operator console — full surface report"
    : "Public site (ShuttleWorks Tournaments) — full surface report";

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
  .shot .description { font-size:13px; color:#3c4250; margin:0 0 5px; }
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
      box-sizing:border-box;
      height:255mm;
      overflow:hidden;
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
    .pair img { max-height:220mm; object-fit:contain; object-position:top left; }
  }
</style></head><body>
<header>
  <h1>${esc(title)}</h1>
  <p class="meta">Captured ${new Date().toISOString()} from <code>${esc(normalizedBase)}</code>.
  Desktop 1440&times;900 and mobile 390&times;844, full-page. Workspace <code>${esc(WS)}</code>;
  public tournament <code>${esc(SLUG)}</code>. Generated by
  <code>tools/surface-capture.mjs</code>.</p>
  <div class="toc"><strong>${cards.length} surfaces</strong>
    <ul>${cards.map((c, i) => `<li><a href="#s${i}">${esc(c.ref)} · ${esc(c.label)}</a></li>`).join("")}</ul>
  </div>
</header>
<main>
${cards
  .map(
    (c, i) => `<section class="shot" id="s${i}">
  <h2>${esc(c.ref)} · ${esc(c.label)}</h2>
  <p class="description">${esc(c.description)}</p>
  <p class="path"><code>${esc(c.path)}</code></p>
  <p class="note">${c.note}</p>
  <div class="pair">
    <div>${c.shots.desktop ? `<img src="data:image/png;base64,${c.shots.desktop}" alt="${esc(c.label)} desktop">` : "<em>no desktop capture</em>"}<p class="cap">desktop 1440&times;900</p></div>
    <div>${c.shots.mobile ? `<img src="data:image/png;base64,${c.shots.mobile}" alt="${esc(c.label)} mobile">` : "<em>no mobile capture</em>"}<p class="cap">mobile 390&times;844</p></div>
  </div>
</section>`,
  )
  .join("\n")}
</main></body></html>`;

const htmlPath =
  extname(outPath) === ".pdf" ? outPath.replace(/\.pdf$/, ".html") : outPath;
writeFileSync(htmlPath, html);
console.log(
  `\nwrote ${htmlPath} (${(html.length / 1024 / 1024).toFixed(1)} MB)`,
);

if (extname(outPath) === ".pdf") {
  const reportPage = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  await reportPage.setContent(html, { waitUntil: "load", timeout: 120000 });
  await reportPage.emulateMedia({ media: "print", reducedMotion: "reduce" });
  await reportPage.pdf({
    path: outPath,
    format: "A3",
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 12mm;font:10px -apple-system,'Segoe UI',sans-serif;color:#667085;display:flex;justify-content:space-between;align-items:center">
      <span>${esc(title)}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`,
    margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
  });
  console.log(`wrote ${outPath}`);
}

await browser.close();

const finishedAt = new Date();
const failedViewports = runState.surfaces.flatMap((surface) =>
  Object.entries(surface.viewports)
    .filter(([, result]) => !result.ok)
    .map(([viewport, result]) => ({
      ref: surface.ref,
      viewport,
      error: result.error,
    })),
);
const manifest = {
  ...runState,
  status: failedViewports.length === 0 ? "complete" : "partial",
  updatedAt: finishedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  artifacts: {
    html: htmlPath,
    pdf: extname(outPath) === ".pdf" ? outPath : null,
  },
  expectedPdfPages: extname(outPath) === ".pdf" ? cards.length + 1 : null,
  failedViewports,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (existsSync(runningPath)) unlinkSync(runningPath);
console.log(
  `pipeline ${manifest.status}: ${cards.length} surfaces in ${(manifest.durationMs / 1000).toFixed(1)}s`,
);
console.log(`wrote ${manifestPath}`);
