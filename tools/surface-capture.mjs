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
import { captureInteractions, interactionSections } from "./surface-interactions.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { tmpdir } from "node:os";

// Playwright is installed in the e2e workspace, not at the repo root, and ESM
// resolves from THIS file's location — so reach it through that package.
const req = createRequire(
  new URL("../tests/e2e/package.json", import.meta.url),
);
const { chromium } = req("playwright");
const brand = JSON.parse(
  readFileSync(new URL("../packages/brand/brand.json", import.meta.url), "utf8"),
);

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
// Meet pagination is only meaningful when the selected workspace actually
// has the Meet dataset. The production-parity default is a Bracket workspace,
// so never capture Meet query parameters against it and call that coverage.
const MEET_WS_ID = process.env.MEET_WS_ID ?? "";
const SLUG = process.env.SLUG ?? "2026-korea-masters-t030";
// A second public tournament whose RESULTS are published. `SLUG` above is the
// entry-taking workspace — the one the account and entry-form sheets need —
// and on that tournament every draw is unplayed, so a book captured from it
// alone shows no score, no resolved later round and no champion anywhere
// (public-visual-fixes.md P8). When `RESULTS_SLUG` names a different
// tournament, the content surfaces below are captured a second time against
// it, so one book carries both halves of the lifecycle. Empty (the default)
// leaves the inventory exactly as it was.
const RESULTS_SLUG = process.env.RESULTS_SLUG ?? "";
// Public person keys whose pages are SUPPOSED to refuse. They are captured as
// declared expected-error sheets, counted apart from product surfaces, so a
// reviewer can tell a designed refusal from a broken page.
const WITHHELD_PLAYER_KEY = process.env.WITHHELD_PLAYER_KEY ?? "";
const DRAW_KEY = process.env.DRAW_KEY ?? "MS";
const DOUBLES_DRAW_KEY = process.env.DOUBLES_DRAW_KEY ?? "MD";
// V3-24-1: the receipt path segment is an eight-character reference, and the
// route 404s anything else — a UUID default here would capture a 404 page.
const SUBMISSION_ID = process.env.SUBMISSION_ID ?? "";
const DISPLAY_TOKEN = process.env.DISPLAY_TOKEN ?? "";
const INVITE_TOKEN = process.env.INVITE_TOKEN ?? "";
const PARTNER_TOKEN = process.env.PARTNER_TOKEN ?? "";
const RESET_TOKEN = process.env.RESET_TOKEN ?? "";
const ENTRANT_EMAIL = process.env.ENTRANT_EMAIL ?? "";
const ENTRANT_PASSWORD = process.env.ENTRANT_PASSWORD ?? "";
const AUTH_ME_URL = process.env.AUTH_ME_URL ?? "";
const PLAYER_KEY = process.env.PLAYER_KEY ?? "";
// P0 (operator-visual-fixes.md): a review book must record WHICH dataset it
// shows and in WHICH event timezone, or a reader cannot tell a deliberate
// failure fixture from a product defect. `make surface-books-fixture` passes
// FIXTURE_MODE through from fixture.json; the Tailscale demo is always the
// clean dataset. EVENT_TIMEZONE is auto-resolved from the public page
// projection when it is not supplied.
const FIXTURE_MODE = process.env.FIXTURE_MODE ?? "normal";
// The commit the captured build was made from. Resolved from git rather than
// required as an argument so a book can never silently claim a baseline it was
// not captured at; CHECKOUT_SHA overrides it where the capture host is not a
// checkout (a container, a remote demo).
const CHECKOUT_SHA = (() => {
  if (process.env.CHECKOUT_SHA) return process.env.CHECKOUT_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dirname(fileURLToPath(import.meta.url)),
      encoding: "utf8",
    }).trim();
  } catch {
    return "unavailable";
  }
})();
// The checkout running this script is not necessarily the build served by
// `base` (the normal book uses a remote demo). Keep those claims separate:
// REVIEWED_BUILD_SHA is an explicit runtime/build fingerprint supplied by the
// capture host, while checkoutSha describes this script's local checkout.
const REVIEWED_BUILD_SHA = process.env.REVIEWED_BUILD_SHA ?? "unprovided";
const EFFECTIVE_DEMO_INSTANT = process.env.SHUTTLEWORKS_DEMO_NOW ?? "unprovided";
const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKING_TREE_FINGERPRINT = (() => {
  try {
    const diff = execFileSync("git", ["diff", "HEAD", "--binary"], {
      cwd: REPOSITORY_ROOT,
      encoding: "buffer",
      // A visual-review checkout can contain several source changes; the
      // default 1 MiB exec buffer made provenance silently become
      // "unavailable" before the capture even started.
      maxBuffer: 64 * 1024 * 1024,
    });
    const untracked = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "buffer",
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    const hash = createHash("sha256");
    hash.update(diff);
    for (const file of untracked.toString().split("\0").filter(Boolean)) {
      // Avoid pulling generated artifacts or large captures into provenance;
      // source and documentation files are enough to identify a dirty review.
      if (!/\.(?:[cm]?[jt]sx?|py|md|json|css|html|sh|toml|ya?ml)$/i.test(file)) continue;
      const contents = readFileSync(join(REPOSITORY_ROOT, file));
      if (contents.length > 2 * 1024 * 1024) continue;
      hash.update(file);
      hash.update(contents);
    }
    return hash.digest("hex");
  } catch {
    return "unavailable";
  }
})();
const EVENT_TIMEZONE_ENV = process.env.EVENT_TIMEZONE ?? "";
const SETTLE_MS = Number(process.env.CAPTURE_SETTLE_MS ?? "1800");
const CAPTURE_LIMIT = Number(process.env.CAPTURE_LIMIT ?? "0");
const CAPTURE_LABEL = process.env.CAPTURE_LABEL ?? "";
const normalizedBase = base.replace(/\/$/, "");
const AUTHENTICATED_CONSOLE_CAPTURE = await (async () => {
  if (tier !== "console" || !AUTH_ME_URL) return false;
  // Local mode deliberately returns the bootstrap identity from /auth/me, so
  // a /login navigation redirects to Hub and is not a sign-in page capture.
  // Cloud mode returns 401 when signed out and keeps the real login surface.
  return fetch(AUTH_ME_URL)
    .then((response) => response.ok)
    .catch(() => false);
})();

// The operator surface inventory. One entry per canonical destination in
// `apps/console/src/platform/product-shell/workspaceNav.ts` (`WORKFLOW_ROUTES`)
// plus non-workspace surfaces (auth, hub, global settings, venue board, invite)
// and pagination/scope states. Compatibility URLs are deliberately absent from
// current books: they are route-contract history, not user-facing surfaces.
const CONSOLE_SURFACES = [
  ["Hub — workspace list", "/"],
  ["Hub — create workspace", "/new"],
  ["Global settings", "/settings"],
  ["Overview", `/tournaments/${WS}/overview`],
  // Four Setup destinations, one per job (the checklist lives on Overview).
  ["Setup · Details", `/tournaments/${WS}/setup/details`],
  ["Setup · Entry rules", `/tournaments/${WS}/setup/entries`],
  ["Setup · Scoring", `/tournaments/${WS}/setup/scoring`],
  ["Setup · Public site", `/tournaments/${WS}/setup/public-site`],
  ["Participants · Entries", `/tournaments/${WS}/participants/entries`],
  ["Participants · Roster", `/tournaments/${WS}/participants/people`],
  ["Bracket · Draws", `/tournaments/${WS}/bracket/draws`],
  [
    "Bracket · Draw canvas",
    `/tournaments/${WS}/bracket/draw?event=${DRAW_KEY}`,
  ],
  ["Bracket · Matches", `/tournaments/${WS}/bracket/matches`],
  ["Bracket · Settings", `/tournaments/${WS}/bracket/settings`],
  ["Operations · Plan", `/tournaments/${WS}/operations/plan`],
  ["Operations · Live day", `/tournaments/${WS}/operations/live`],
  ["Display · Board settings", `/tournaments/${WS}/display/board`],
  ["Display · Board preview", `/tournaments/${WS}/display/preview`],
  ["Administration · Team", `/tournaments/${WS}/administration/team`],
  ["Administration · Modules", `/tournaments/${WS}/administration/modules`],
  ["Administration · Backups", `/tournaments/${WS}/administration/backups`],
  ["Administration · Activity", `/tournaments/${WS}/administration/activity`],
  ["Administration · Lifecycle", `/tournaments/${WS}/administration/lifecycle`],
  // Pagination and scope states are explicit interaction sheets; historical
  // surface IDs remain in the review register, while current books use this
  // canonical route inventory.
  ["Hub — past workspaces", "/?view=past"],
  ["Hub — live workspaces", "/?view=live"],
  [
    "Participants · Roster · bracket page 2 / 100 rows",
    `/tournaments/${WS}/participants/people?bracket-roster.page=2&bracket-roster.pageSize=100`,
  ],
  [
    "Participants · Roster · bracket 25 rows",
    `/tournaments/${WS}/participants/people?bracket-roster.pageSize=25`,
  ],
  [
    "Bracket · Matches · page 2 / 100 rows",
    `/tournaments/${WS}/bracket/matches?bracket-matches.page=2&bracket-matches.pageSize=100`,
  ],
  [
    "Bracket · Matches · 50 rows",
    `/tournaments/${WS}/bracket/matches?bracket-matches.pageSize=50`,
  ],
  ["Global settings · Security", "/settings?section=security"],
  ["Global settings · Sessions", "/settings?section=sessions"],
  ["Global settings · Appearance", "/settings?section=appearance"],
];

if (!(await AUTHENTICATED_CONSOLE_CAPTURE)) {
  CONSOLE_SURFACES.unshift(["Authentication · Sign in", "/login"]);
}

if (DISPLAY_TOKEN) {
  CONSOLE_SURFACES.push([
    "Display · Fullscreen venue board",
    `/display?token=${encodeURIComponent(DISPLAY_TOKEN)}`,
  ]);
}

if (INVITE_TOKEN) {
  CONSOLE_SURFACES.push(
    ["Invite · Valid token", `/invite/${encodeURIComponent(INVITE_TOKEN)}`],
  );
}

if (MEET_WS_ID) {
  CONSOLE_SURFACES.push(
    ["Meet · Matches", `/tournaments/${MEET_WS_ID}/meet/matches`],
    ["Meet · Team structure", `/tournaments/${MEET_WS_ID}/meet/team-structure`],
    [
      "Meet · Participants roster",
      `/tournaments/${MEET_WS_ID}/participants/people`,
    ],
  );
}

const ENTRANT_SURFACES = [
  ["Discovery · Season calendar", "/e/"],
  ["Discovery · Earlier this season", "/e/#past"],
  ["Tournament · Overview", `/e/${SLUG}`],
  ["Tournament · Players", `/e/${SLUG}?tab=players`],
  ["Tournament · Draws", `/e/${SLUG}?tab=draws`],
  ["Tournament · Schedule and live", `/e/${SLUG}/schedule`],
  ["Draw · Singles full bracket", `/e/${SLUG}/draws/${DRAW_KEY}`],
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
  [
    "Account · Create account for tournament",
    `/e/signup?next=${encodeURIComponent(`/e/${SLUG}/enter`)}`,
  ],
  ["Account · Verify address", "/e/verify"],
  ["Account · Verification complete", "/e/verify/done"],
  ["Account · Verification failed", "/e/verify/failed"],
  ["Account · Verification email sent", "/e/verify/sent"],
  ["Account · Forgot password", "/e/forgot"],
  ["Account · Reset email sent", "/e/reset/sent"],
  ["Account · Password reset complete", "/e/reset/done"],
  ["Account · Password reset failed", "/e/reset/failed"],
  ["Account · New password failed", "/e/reset/password-failed"],
  ["My entries (signed out)", "/e/me/entries"],
  // Public discovery scope states. P5 retired the lifecycle facets and the
  // pagination with them: the season list has no "Entries open" segment to
  // capture, and a page two of a two-item list was never a real surface. What
  // remains are the two states a reader actually reaches — a search, and a
  // season other than the current one.
  ["Discovery · Search across seasons", "/e/?q=Open&year=all#calendar"],
];

/**
 * Sheets that exist to show a REFUSAL working — a designed 404 or a
 * withheld-person page. They are captured with the product surfaces and
 * counted apart in `routeCoverage.expectedErrorSheets`, because a reviewer
 * paging through the book has no other way to tell "this page is supposed to
 * say no" from "this page is broken".
 */
const ENTRANT_EXPECTED_ERROR_SURFACES = [
];
if (WITHHELD_PLAYER_KEY) {
  ENTRANT_EXPECTED_ERROR_SURFACES.push([
    "Expected refusal · Player withheld from publication",
    `/e/${SLUG}/players/${encodeURIComponent(WITHHELD_PLAYER_KEY)}`,
  ]);
}

if (SUBMISSION_ID && ENTRANT_EMAIL && ENTRANT_PASSWORD) {
  ENTRANT_SURFACES.splice(
    ENTRANT_SURFACES.findIndex(([label]) => label === "Regulations reader") + 1,
    0,
    ["Entry receipt", `/e/${SLUG}/receipt/${encodeURIComponent(SUBMISSION_ID)}`],
  );
}

/**
 * Sheets whose point is a PROGRESSIVE-ENHANCEMENT state — a page-scoped
 * script's result, reachable by URL so the sheet is reproducible without a
 * scripted interaction. They are product states of a destination already
 * counted above, not new destinations, and are tallied apart so
 * `stateSheets` is not read as "screens".
 */
const ENTRANT_ENHANCED_SURFACES = [];

// Retired URLs still answer through the route loaders, but are route-contract
// history rather than user-facing pages and are deliberately absent here.
if (PARTNER_TOKEN) {
  ENTRANT_SURFACES.push(
    ["Doubles partner invitation · token", `/e/partner/${encodeURIComponent(PARTNER_TOKEN)}`],
  );
}
// A failed acceptance is a genuine reachable recovery outcome when an invite
// is rejected; retain the source route as an error state even without token.
ENTRANT_SURFACES.push(["Doubles partner failed", "/e/partner/failed"]);
if (tier === "entrant" && ENTRANT_EMAIL && ENTRANT_PASSWORD) {
  ENTRANT_SURFACES.push(["My entries (signed in)", "/e/me/entries"]);
}

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
  "Discovery · Season calendar":
    "Public front door: one month-grouped season, upcoming first, with the season selector and search.",
  "Discovery · Earlier this season":
    "The same page at its Earlier this season anchor, where the selected season's finished tournaments and their results sit.",
  "Discovery · Search across seasons":
    "Discovery search widened past the selected season.",
  "Discovery · Compatibility · completed tournaments":
    "Retired lifecycle URL: canonicalises onto the season calendar's past section.",
  "Discovery · Compatibility · entries-open segment":
    "Retired lifecycle URL: canonicalises onto the season calendar.",
  "Discovery · Compatibility · retired pagination":
    "Retired pagination URL: canonicalises onto the season calendar.",
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
  "Draw · Compatibility · round view":
    "Retired draw view: canonicalises onto the one bracket.",
  "Draw · Compatibility · path view":
    "Retired draw view: canonicalises onto the one bracket.",
  "Results tournament · Overview":
    "Public tournament summary for a tournament whose results are published.",
  "Results tournament · Players":
    "Published player directory for a tournament in play, with reached rounds.",
  "Results tournament · Draws":
    "Draw index showing real per-draw progress: complete, in play, and scheduled.",
  "Results tournament · Schedule and live":
    "Public schedule carrying live matches on court, finished scores, a walkover and a retirement.",
  "Results draw · Singles full bracket":
    "Singles tree with recorded scores, a resolved later round, and matches still to play.",
  "Results draw · Doubles full bracket":
    "Doubles tree carrying paired names, recorded scores and progression to a champion.",
  "Results tournament · Regulations":
    "Tournament regulations, policies, venue notes, and entry guidance.",
  "Results tournament · Player detail with history":
    "A published person’s profile with played results and cross-tournament history.",
  "Results draw · Highlighted player path":
    "Enhanced state: the same bracket with one person’s route through it highlighted, reached by URL and rendered without script.",
  "Expected refusal · Player withheld from publication":
    "Declared expected error: a person the organizer has not published must say so without naming them.",
});

function descriptionFor(label) {
  if (EXACT_DESCRIPTIONS[label]) return EXACT_DESCRIPTIONS[label];
  if (label.startsWith("Setup · ")) {
    return `Operator setup surface for ${label.slice("Setup · ".length).toLowerCase()} configuration and readiness.`;
  }
  if (label.startsWith("Participants · ")) {
    return "Operator participant workspace for roster identity, eligibility, and event involvement.";
  }
  if (label.startsWith("Bracket · Draws")) {
    return "Operator draw index for generation state, coverage, and opening an event bracket.";
  }
  if (label === "Bracket · Draw canvas") {
    return "Interactive operator bracket canvas for reviewing progression and recording results.";
  }
  if (label.startsWith("Bracket · Matches") || label.startsWith("Meet · Matches")) {
    return "Operator match inventory for search, review, corrections, and result entry.";
  }
  if (label === "Bracket · Settings") {
    return "Event definitions, draw format, and draw size for the bracket engine.";
  }
  if (label === "Meet · Team structure") {
    return "Operator team and lineup structure for a meet workspace.";
  }
  if (label.startsWith("Display · ")) {
    return `Venue board surface for ${label.slice("Display · ".length).toLowerCase()}.`;
  }
  if (label.startsWith("Operations · ")) {
    return `Day-of operator workflow for ${label.slice("Operations · ".length).toLowerCase()} scheduling and court control.`;
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

async function resolveEventTimeZone() {
  if (EVENT_TIMEZONE_ENV) return EVENT_TIMEZONE_ENV;
  // Same-origin only on the entrant tier; the console origin proxies /api and
  // does not serve /e/api, so a console run simply records "unavailable"
  // unless EVENT_TIMEZONE is supplied.
  try {
    const response = await fetch(
      `${normalizedBase}/e/api/page/${encodeURIComponent(SLUG)}/matches`,
    );
    if (!response.ok) return "";
    const payload = await response.json();
    return payload.timeZone ?? "";
  } catch {
    return "";
  }
}

async function resolvePublicPersonKey(
  slug = SLUG,
  override = PLAYER_KEY,
  // The draw the key has to be USABLE in. `?player=` pins a path inside one
  // draw, so a key resolved without this lands a doubles player on the
  // singles bracket, where the sheet can only show "0 matches found" beside
  // the key it was given. Empty means "any published person".
  preferredEvent = "",
) {
  if (override) return override;
  try {
    const response = await fetch(
      `${normalizedBase}/e/api/page/${encodeURIComponent(slug)}/players`,
    );
    if (!response.ok) return "";
    const payload = await response.json();
    const publishedPeople = (payload.players ?? []).filter(
      (player) =>
        player.person?.resolution === "resolved" &&
        typeof player.person?.identity?.id === "string" &&
        player.person.identity.id.length > 0,
    );
    const inPreferredEvent = preferredEvent
      ? publishedPeople.find((player) =>
          (player.eventCodes ?? []).includes(preferredEvent),
        )
      : null;
    return (inPreferredEvent ?? publishedPeople[0])?.person.identity.id ?? "";
  } catch {
    return "";
  }
}

let surfaces = tier === "console" ? [...CONSOLE_SURFACES] : [...ENTRANT_SURFACES];
const omittedOptionalStates = [];
if (tier === "console" && AUTHENTICATED_CONSOLE_CAPTURE) {
  omittedOptionalStates.push({
    label: "Authentication · Sign in",
    reason: "Capture auth probe returned an authenticated bootstrap/session; /login redirects to Hub",
  });
}
if (tier === "entrant") {
  const discoveryResponse = await fetch(`${normalizedBase}/e/`);
  const discoveryHtml = discoveryResponse.ok ? await discoveryResponse.text() : "";
  if (!/id=["']past["']/.test(discoveryHtml)) {
    surfaces = surfaces.filter(([label]) => label !== "Discovery · Earlier this season");
    omittedOptionalStates.push({ label: "Discovery · Earlier this season", reason: "The selected season has no earlier-tournament section to visit" });
  }
  // The bare success URL cannot establish that an invitation was accepted.
  // The real invitation form and reachable failure recovery remain separate.
  omittedOptionalStates.push({
    label: "Doubles partner accepted",
    reason: "No accepted invitation transaction was supplied; the bare success URL is excluded",
  });
  if (!ENTRANT_EMAIL || !ENTRANT_PASSWORD) {
    surfaces = surfaces.filter(([label]) => !["Entry form · Signed-in outcome", "Entry form · Account-created outcome"].includes(label));
    omittedOptionalStates.push({ label: "Authenticated entry continuations", reason: "No real entrant credentials were supplied" });
  }
  if (!RESET_TOKEN) {
    omittedOptionalStates.push({ label: "Account · Reset password", reason: "No real reset token was supplied by the fixture" });
  } else {
    const resetIndex = surfaces.findIndex(([label]) => label === "Account · Reset email sent") + 1;
    surfaces.splice(resetIndex, 0, ["Account · Reset password", `/e/reset?token=${encodeURIComponent(RESET_TOKEN)}`]);
  }
  if (!SUBMISSION_ID) {
    omittedOptionalStates.push({
      label: "Entry receipt",
      reason: "No real submission reference was supplied by the fixture",
    });
  }
  const playerKey = await resolvePublicPersonKey();
  if (playerKey) {
    const afterPlayers =
      surfaces.findIndex(([label]) => label === "Tournament · Players") + 1;
    surfaces.splice(afterPlayers, 0, [
      "Player detail",
      `/e/${SLUG}/players/${encodeURIComponent(playerKey)}`,
    ]);
  } else {
    // A player page requires an authorized, resolved public person identity.
    // Do not manufacture a 404 sheet when a fixture has no routable person.
    omittedOptionalStates.push({
      label: "Player detail",
      reason: "Selected fixture has no routable published person identity",
    });
  }

  // The published-results half of the lifecycle. Same routes, a tournament
  // where they carry scores, a resolved later round and a champion; captured
  // only when a second slug is supplied and it is not the one already walked.
  if (RESULTS_SLUG && RESULTS_SLUG !== SLUG) {
    const resultsPlayerKey = await resolvePublicPersonKey(RESULTS_SLUG, "");
    const resultsSurfaces = [
      ["Results tournament · Overview", `/e/${RESULTS_SLUG}`],
      ["Results tournament · Players", `/e/${RESULTS_SLUG}?tab=players`],
      ["Results tournament · Draws", `/e/${RESULTS_SLUG}?tab=draws`],
      ["Results tournament · Schedule and live", `/e/${RESULTS_SLUG}/schedule`],
      [
        "Results draw · Singles full bracket",
        `/e/${RESULTS_SLUG}/draws/${DRAW_KEY}`,
      ],
      [
        "Results draw · Doubles full bracket",
        `/e/${RESULTS_SLUG}/draws/${DOUBLES_DRAW_KEY}`,
      ],
      ["Results tournament · Regulations", `/e/${RESULTS_SLUG}/regulations`],
    ];
    if (resultsPlayerKey) {
      resultsSurfaces.push([
        "Results tournament · Player detail with history",
        `/e/${RESULTS_SLUG}/players/${encodeURIComponent(resultsPlayerKey)}`,
      ]);
      // The bracket's highlighted-path state. P4 resolves `?player=` by
      // IDENTITY ID only, so this is the URL a real "Show this player's path"
      // link produces — and it renders without a byte of script, which is the
      // point of capturing it here rather than scripting a click.
      const pathPlayerKey =
        (await resolvePublicPersonKey(RESULTS_SLUG, "", DRAW_KEY)) ||
        resultsPlayerKey;
      ENTRANT_ENHANCED_SURFACES.push([
        "Results draw · Highlighted player path",
        `/e/${RESULTS_SLUG}/draws/${DRAW_KEY}?player=${encodeURIComponent(pathPlayerKey)}`,
      ]);
    } else {
      omittedOptionalStates.push({
        label: "Results tournament · Player detail with history",
        reason: "Results fixture has no routable published person identity",
      });
    }
    surfaces.push(...resultsSurfaces);
  }

  // Enhanced states and genuine refusals follow the product surfaces. Retired
  // compatibility URLs are route-contract history, not book pages.
  surfaces.push(...ENTRANT_ENHANCED_SURFACES);
  surfaces.push(...ENTRANT_EXPECTED_ERROR_SURFACES);
}
// Product surfaces, progressive-enhancement states, and genuine refusals are
// the only sheets in a book. Retired URLs are covered by route tests/docs.
const enhancedLabels = new Set(
  tier === "entrant" ? ENTRANT_ENHANCED_SURFACES.map(([label]) => label) : [],
);
const expectedErrorLabels = new Set(
  tier === "entrant" ? ENTRANT_EXPECTED_ERROR_SURFACES.map(([label]) => label) : [],
);

surfaces = surfaces.map(([label, path]) => [
  label,
  path,
  descriptionFor(label),
]);
if (CAPTURE_LABEL) {
  surfaces = surfaces.filter(([label]) => label.includes(CAPTURE_LABEL));
}
if (CAPTURE_LIMIT > 0) {
  surfaces = surfaces.slice(0, CAPTURE_LIMIT);
}
// Route coverage describes product screens and separately identifies genuine
// refusals and enhanced states. Computed after optional filtering so the
// manifest matches the actual sheets in this run.
const isProduct = ([label]) =>
  !enhancedLabels.has(label) &&
  !expectedErrorLabels.has(label);
const productSurfaces = surfaces.filter(isProduct);
const canonicalDestinationCount = new Set(
  productSurfaces.map(([, path]) => path.split(/[?#]/, 1)[0]),
).size;
const routeCoverage = {
  canonicalDestinations: canonicalDestinationCount,
  stateSheets: productSurfaces.length,
  enhancedStateSheets: surfaces.filter(([label]) => enhancedLabels.has(label)).length,
  expectedErrorSheets: surfaces.filter(([label]) => expectedErrorLabels.has(label)).length,
};
const VIEWPORTS = [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
];

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// For text interpolated INSIDE an attribute value. `esc` alone leaves quotes
// intact, so a label containing `"` closes the attribute and everything after
// it is parsed as markup (2026-09-07, CodeQL
// js/incomplete-html-attribute-sanitization). Both quote forms are escaped so
// the helper is correct in single- and double-quoted attributes alike.
const escAttr = (s) =>
  esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const artifactStem = outPath.slice(0, -extname(outPath).length);
const manifestPath = `${artifactStem}.manifest.json`;
const runningPath = `${artifactStem}.running.json`;
const rawAssetDir = `${artifactStem}-assets`;
const rawAssetDirName = basename(rawAssetDir);
const startedAt = new Date();
const eventTimeZone = (await resolveEventTimeZone()) || "unavailable";
// The capture context every reviewer needs before reading a single sheet:
// which dataset, which event timezone, which viewports, which routes (the
// per-surface `path` / `finalUrl` below).
const captureContext = {
  // The five things a reader needs before a single sheet means anything
  // (public-visual-fixes.md, package P0): WHICH build, WHICH dataset, WHICH
  // window, WHICH clock, and WHICH route. The first four live here; the fifth
  // is per sheet — `baselineRoute` is this run's entry point and every sheet
  // additionally records its requested path and the final URL reached.
  checkoutSha: CHECKOUT_SHA,
  reviewedBuildSha: REVIEWED_BUILD_SHA,
  workingTreeFingerprint: WORKING_TREE_FINGERPRINT,
  effectiveDemoInstant: EFFECTIVE_DEMO_INSTANT,
  fixtureMode: FIXTURE_MODE,
  eventTimeZone,
  workspaceId: tier === "console" ? WS : null,
  publicSlug: tier === "entrant" ? SLUG : null,
  baselineRoute: surfaces.length ? surfaces[0][1] : null,
  viewports: VIEWPORTS.map(([name, width, height]) => ({ name, width, height, deviceScaleFactor: 2 })),
  routeCoverage,
  omittedStates: omittedOptionalStates,
};
const runState = {
  schemaVersion: 2,
  status: "running",
  tier,
  baseUrl: normalizedBase,
  captureContext,
  output: outPath,
  startedAt: startedAt.toISOString(),
  updatedAt: startedAt.toISOString(),
  surfaceCount: surfaces.length,
  completedSurfaces: 0,
  surfaces: [],
};
mkdirSync(dirname(outPath), { recursive: true });
mkdirSync(rawAssetDir, { recursive: true });
writeFileSync(runningPath, `${JSON.stringify(runState, null, 2)}\n`);

const browser = await chromium.launch();
const cards = [];
let cachedAuthMe = null;
let entrantStorageState;
if (tier === "entrant" && ENTRANT_EMAIL && ENTRANT_PASSWORD) {
  const authContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const authPage = await authContext.newPage();
  await authPage.goto(`${normalizedBase}/e/login?next=${encodeURIComponent('/e/me/entries')}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await authPage.locator("#login-email").fill(ENTRANT_EMAIL);
  await authPage.locator("#login-password").fill(ENTRANT_PASSWORD);
  await authPage.locator('button[type="submit"]').click();
  await authPage.waitForTimeout(500);
  if (!authPage.url().includes('/e/me/entries')) throw new Error(`Entrant authentication did not reach My entries: ${authPage.url()}`);
  entrantStorageState = await authContext.storageState();
  await authContext.close();
}
// Entries is a cloud-only capability and may be absent from local workspaces.
// Resolve the real catalog in an authenticated browser context before
// inventorying sheets; a hard-coded route would create an inaccessible book
// page that only demonstrates the module guard.
if (tier === "console") {
  const catalogContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const catalogPage = await catalogContext.newPage();
  try {
    await catalogPage.goto(`${normalizedBase}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await catalogPage.waitForTimeout(SETTLE_MS);
    const modules = await catalogPage.evaluate(async (workspaceId) => {
      const response = await fetch(`/api/tournaments/${workspaceId}/modules`, { credentials: "include" });
      if (!response.ok) return null;
      return response.json();
    }, WS);
    const entriesEnabled = Array.isArray(modules) && modules.some((module) => module?.moduleId === "entries" && module?.status === "enabled");
    if (!entriesEnabled) {
      surfaces = surfaces.filter(([label]) => label !== "Participants · Entries");
      omittedOptionalStates.push({
        label: "Participants · Entries",
        reason: "Workspace module catalog does not expose Entries as enabled",
      });
    }
  } finally {
    await catalogContext.close();
  }
}
// Catalog filtering happens after the initial inventory is assembled, so
// refresh the published counts and the already-created capture context.
const finalProductSurfaces = surfaces.filter(isProduct);
Object.assign(routeCoverage, {
  canonicalDestinations: new Set(finalProductSurfaces.map(([, path]) => path.split(/[?#]/, 1)[0])).size,
  stateSheets: finalProductSurfaces.length,
  enhancedStateSheets: surfaces.filter(([label]) => enhancedLabels.has(label)).length,
  expectedErrorSheets: surfaces.filter(([label]) => expectedErrorLabels.has(label)).length,
});
runState.surfaceCount = surfaces.length;
captureContext.baselineRoute = surfaces[0]?.[1] ?? null;
const expectedDestination = (path) => {
  const url = new URL(normalizedBase + path);
  return `${url.pathname}${url.search}`;
};

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
  const scrollEndShots = {};
  const viewportRuns = {};
  let note = "";
  for (const [vpName, width, height] of VIEWPORTS) {
    const usesEntrantSession = label === "My entries (signed in)" || label === "Entry receipt" ||
      label === "Entry form · Signed-in outcome" || label === "Entry form · Account-created outcome";
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: "reduce", ...(usesEntrantSession ? { storageState: entrantStorageState } : {}) });
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
      const declaredError = expectedErrorLabels.has(label);
      const final = new URL(page.url());
      const finalDestination = `${final.pathname}${final.search}`;
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const expectedDestinationMismatch = finalDestination !== expectedDestination(path);
      const unexpectedErrorPage = !declaredError && /(?:page not found|something went wrong|application error|module unavailable|unexpected error)/i.test(bodyText);
      const destinationError = expectedDestinationMismatch
        ? `Final URL ${finalDestination} does not match requested ${expectedDestination(path)}`
        : unexpectedErrorPage
          ? "Required surface rendered an error/guard page"
          : null;
      const documentHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, window.innerHeight));
      const scrollRegions = await page.evaluate(() => Array.from(document.querySelectorAll('*'))
        .filter((element) => {
          const style = window.getComputedStyle(element);
          return element.clientHeight > 40 && /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 4;
        })
        .slice(0, 40)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          role: element.getAttribute('role'),
          testId: element.getAttribute('data-testid'),
          width: element.clientWidth,
          height: element.clientHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
        })));
      shots[vpName] = [];
      // Fixed/sticky top chrome sits over document content after every scroll.
      // Step continuations by the visible content height so each row appears
      // fully below that chrome at least once. Full-height sidebars and panes
      // are excluded from this measurement.
      const stickyHeaderHeight = await page.evaluate(() => Math.max(0, ...Array.from(document.querySelectorAll('*')).map((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (!['fixed', 'sticky'].includes(style.position) || rect.width < window.innerWidth * 0.5 || rect.height > window.innerHeight * 0.4) return 0;
        if (style.position === 'fixed') return rect.top <= 4 ? rect.bottom : 0;
        const inset = Number.parseFloat(style.top);
        return Number.isFinite(inset) && inset >= 0 ? inset + rect.height : 0;
      })));
      const hasNonDocumentOverflow = await page.evaluate(() => Array.from(document.querySelectorAll('*')).some((element) => {
        if (['TEXTAREA', 'INPUT', 'SELECT', 'HTML', 'BODY'].includes(element.tagName)) return false;
        const style = window.getComputedStyle(element);
        return element.clientWidth > 300 && element.clientHeight > 200 &&
          /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 4;
      }));
      let previousActualTop = -1;
      const segmentStep = Math.max(1, height - stickyHeaderHeight);
      for (let top = 0; top < documentHeight && !(hasNonDocumentOverflow && top > 0); top += segmentStep) {
        const segmentHeight = Math.min(height, documentHeight - top);
        // Capture a viewport-sized continuation at the real document offset.
        // Combining fullPage with clip can rasterize the entire long document
        // first and then scale it down in the review book, making paginated
        // lists unreadable. Scrolling before a clipped viewport screenshot
        // preserves the route's actual page state and readable CSS scale.
        const actualTop = await page.evaluate((y) => {
          window.scrollTo(0, y);
          return window.scrollY;
        }, top);
        // A fixed shell/internal pane can make document.scrollY clamp at 0;
        // do not manufacture a blank document continuation in that case.
        if (top > 0 && actualTop === previousActualTop) break;
        previousActualTop = actualTop;
        // The final desired offset can exceed maxScroll because the viewport
        // is taller than the remaining document. Crop from the corresponding
        // point inside the clamped viewport so the tail is neither duplicated
        // nor omitted.
        const clipY = Math.max(0, top - actualTop);
        const clipHeight = Math.min(height - clipY, documentHeight - top);
        const png = await page.screenshot({ animations: "disabled", clip: { x: 0, y: clipY, width, height: clipHeight } });
        const assetName = `S${String(surfaceIndex + 1).padStart(2, "0")}-${vpName}-segment-${String(shots[vpName].length + 1).padStart(2, "0")}.png`;
        writeFileSync(join(rawAssetDir, assetName), png);
        shots[vpName].push({ png: png.toString("base64"), assetPath: `${rawAssetDirName}/${assetName}`, top, height: segmentHeight, width });
      }

      // Many console products keep the shell fixed while the main content
      // pane owns overflow. In that shape document scrolling stops at the
      // first viewport, so the regular loop above can produce a blank-looking
      // continuation. Capture the meaningful internal pane at each scroll
      // position, excluding textarea/input scrollports and small sidebars.
      const internalRegion = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('*'))
          .filter((element) => !['TEXTAREA', 'INPUT', 'SELECT'].includes(element.tagName))
          .filter((element) => {
            const style = window.getComputedStyle(element);
            return element.clientWidth > 300 && element.clientHeight > 200 &&
              /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 4;
          })
          .sort((a, b) => (b.scrollHeight * b.clientWidth) - (a.scrollHeight * a.clientWidth));
        const element = candidates[0];
        if (!element) return null;
        const key = 'capture-primary-scroll-region';
        element.setAttribute('data-capture-scroll-region', key);
        return { key, height: element.clientHeight, scrollHeight: element.scrollHeight };
      });
      if (internalRegion) {
        const internalStep = Math.max(1, internalRegion.height - stickyHeaderHeight);
        for (let scrollTop = internalStep; scrollTop < internalRegion.scrollHeight; scrollTop += internalStep) {
          const visible = await page.evaluate(({ key, scrollTop }) => {
            const element = document.querySelector(`[data-capture-scroll-region="${key}"]`);
            if (!element) return null;
            element.scrollTop = Math.min(scrollTop, element.scrollHeight - element.clientHeight);
            const top = Math.max(0, element.getBoundingClientRect().top + window.scrollY - 24);
            window.scrollTo(0, top);
            return { scrollTop: element.scrollTop, top, scrollHeight: element.scrollHeight };
          }, { key: internalRegion.key, scrollTop });
          if (visible === null) break;
          const png = await page.screenshot({ animations: "disabled", clip: { x: 0, y: 0, width, height } });
          const assetName = `S${String(surfaceIndex + 1).padStart(2, "0")}-${vpName}-segment-${String(shots[vpName].length + 1).padStart(2, "0")}.png`;
          writeFileSync(join(rawAssetDir, assetName), png);
          shots[vpName].push({ png: png.toString("base64"), assetPath: `${rawAssetDirName}/${assetName}`, top: visible.top, height, width, internalScrollTop: visible.scrollTop, internalScrollHeight: visible.scrollHeight });
        }
        await page.evaluate((key) => {
          const element = document.querySelector(`[data-capture-scroll-region="${key}"]`);
          if (element) { element.scrollTop = 0; element.removeAttribute('data-capture-scroll-region'); }
          window.scrollTo(0, 0);
        }, internalRegion.key);
      }
      scrollEndShots[vpName] = [];
      // Inventory surfaces can put the page-size/count controls below an
      // internal list viewport. Capture that endpoint only when the route is
      // known to be an inventory; never expand overflow or imply this is the
      // complete record set. The marker is assigned temporarily and removed
      // before the next route.
      if (tier === "console" && /Roster|Matches|Hub/.test(label)) {
        const regions = await page.evaluate(() => {
          let index = 0;
          return Array.from(document.querySelectorAll('*'))
            .filter((element) => element !== document.body && element !== document.documentElement)
            .filter((element) => {
              const style = window.getComputedStyle(element);
              return element.clientHeight > 40 && /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 4;
            })
            .slice(0, 3)
            .map((element) => {
              const key = `capture-scroll-${index++}`;
              element.setAttribute('data-capture-scroll-region', key);
              return { key, height: element.clientHeight, scrollHeight: element.scrollHeight };
            });
        });
        for (const region of regions) {
          const before = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
          const visible = await page.evaluate((key) => {
            const element = document.querySelector(`[data-capture-scroll-region="${key}"]`);
            if (!element) return null;
            element.scrollTop = element.scrollHeight;
            const top = Math.max(0, element.getBoundingClientRect().top + window.scrollY - 24);
            window.scrollTo(0, top);
            return { top, width: window.innerWidth, height: window.innerHeight, scrollTop: element.scrollTop, scrollHeight: element.scrollHeight };
          }, region.key);
          if (visible !== null) {
            const png = await page.screenshot({ animations: "disabled", clip: { x: 0, y: 0, width, height } });
            const assetName = `S${String(surfaceIndex + 1).padStart(2, "0")}-${vpName}-scroll-end-${String(scrollEndShots[vpName].length + 1).padStart(2, "0")}.png`;
            writeFileSync(join(rawAssetDir, assetName), png);
            scrollEndShots[vpName].push({
              png: png.toString("base64"), assetPath: `${rawAssetDirName}/${assetName}`, top: visible.top, height, width,
              kind: "scroll-end", region: region.key,
              scrollTop: visible.scrollTop, scrollHeight: visible.scrollHeight,
            });
          }
          await page.evaluate(({ key, x, y }) => {
            const element = document.querySelector(`[data-capture-scroll-region="${key}"]`);
            if (element) { element.scrollTop = 0; element.scrollLeft = 0; element.removeAttribute('data-capture-scroll-region'); }
            window.scrollTo(x, y);
          }, { key: region.key, ...before });
        }
      }
      // A DECLARED expected-error sheet is one whose whole point is the
      // refusal — an unknown token, a withheld person, an unknown key. Its
      // 404 is the evidence, not a failure, so it must not make the run
      // "partial" and send a reader hunting for a broken page. Anything else
      // it might answer (a 500, a 200 that leaked the record) still fails.
      const httpStatus = res?.status() ?? 0;
      viewportRuns[vpName] = {
        ok: !destinationError && (declaredError ? httpStatus === 404 : httpStatus < 400),
        expectedError: declaredError && httpStatus === 404 ? true : undefined,
        httpStatus,
        finalUrl: page.url(),
        consoleErrors: errors,
        viewport: { width, height, deviceScaleFactor: 2 },
        documentHeight,
        segments: shots[vpName].length,
        scrollRegions,
        stickyHeaderHeight,
        scrollEndSegments: scrollEndShots[vpName].length,
        assets: [
          ...(shots[vpName] ?? []).map((shot) => shot.assetPath),
          ...(scrollEndShots[vpName] ?? []).map((shot) => shot.assetPath),
        ],
      };
      if (!viewportRuns[vpName].ok) {
        viewportRuns[vpName].error = destinationError ?? (declaredError
          ? `HTTP ${httpStatus} — this sheet declares a refusal, and a refusal is a 404`
          : `HTTP ${httpStatus}`);
      }
      if (vpName === "desktop") {
        const status = res?.status() ?? 0;
        const title = await page.title();
        note = `HTTP ${status}${declaredError && status === 404 ? " (expected refusal)" : ""} · <code>${esc(title)}</code> · final <code>${esc(new URL(page.url()).pathname + new URL(page.url()).search)}</code>`;
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
  cards.push({ ref, label, path, description, note, shots, scrollEndShots, viewportRuns });
  runState.completedSurfaces = surfaceIndex + 1;
  runState.updatedAt = new Date().toISOString();
  runState.surfaces.push(surfaceRun);
  writeFileSync(runningPath, `${JSON.stringify(runState, null, 2)}\n`);
  console.log(
    `[${surfaceIndex + 1}/${surfaces.length}] ${ref} captured  ${label}`,
  );
}

const interactions = await captureInteractions({ browser, tier, surfaces, base: normalizedBase, viewports: VIEWPORTS, assetDir: rawAssetDir, assetDirName: rawAssetDirName, auth: cachedAuthMe });
runState.interactions = interactions.map(({ videoBase64, frames, ...record }) => ({ ...record, frames: frames.map(({ png, ...frame }) => frame) }));
const interactionHtml = interactionSections(interactions, esc);

const title =
  tier === "console"
    ? `${brand.productName} operator console — full surface report`
    : `Public site (${brand.publicProductName}) — full surface report`;

const reviewFocus = (label) => {
  if (/Publish|Sharing|partner|receipt|outcome/i.test(label)) return "Check that the visible outcome is supported by saved state. Can the reader understand access, consequences, failure and recovery without knowing backend steps?";
  if (/Setup|settings|Administration/i.test(label)) return "Check field grouping, labels, help, ownership, save/discard feedback and disabled-state explanations. Identify duplicate decisions and unnecessary handoffs.";
  if (/Draw|Match|Schedule|Operations|Display/i.test(label)) return "Check participant and score alignment, match references, tournament time basis, court assignment, scanning hierarchy and contained scrolling. Colour must not be the only state signal.";
  return "Check the primary task and action, reading order, text contrast, empty/error states and mobile reflow. Flag technical language that does not help the reader decide.";
};
const pages = cards.flatMap((card, index) => VIEWPORTS.flatMap(([viewport]) => {
  const regular = (card.shots[viewport]?.length ? card.shots[viewport] : [null])
    .map((shot, segment, all) => ({ card, index, viewport, shot, segment, count: all.length, kind: "document" }));
  const supplemental = (card.scrollEndShots?.[viewport] ?? [])
    .map((shot, segment, all) => ({ card, index, viewport, shot, segment, count: all.length, kind: "scroll-end" }));
  return [...regular, ...supplemental];
}));
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  * { box-sizing:border-box; }
  body { font:15px/1.5 Arial,sans-serif;color:#18202b;background:#eef1f5;margin:0; }
  h1 {font-size:30px;line-height:1.2;margin:0 0 16px;} h2 {font-size:21px;margin:0 0 8px;}
  p {margin:8px 0;} a {color:#174dbc;} code {font:12px monospace;overflow-wrap:anywhere;}
  .cover,.index,.sheet {background:white;max-width:1500px;margin:24px auto;padding:36px;}
  .eyebrow {font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#475569;}
  .meta,.path {font-size:12px;color:#475569;} .err {color:#9c2424;}
  .guide {max-width:100ch;} .index ul {columns:2;padding-left:20px;} .index li {font-size:13px;margin:6px 0;break-inside:avoid;}
  .frame {display:flex;gap:28px;align-items:flex-start;margin-top:16px;}
  .frame img {display:block;width:100%;height:auto;border:1px solid #cbd5e1;}
  .desktop .capture {width:100%;} .desktop aside {display:none;}
  .mobile .capture {width:390px;flex-shrink:0;} aside {max-width:580px;padding:20px;border-top:2px solid #dbe2eb;}
  .focus {font-size:13px;margin-top:10px;} .caption {font-size:12px;color:#475569;}
  @page {size:A3 landscape;margin:12mm;}
  @media print {
    .interaction-video {display:none;}
    body {background:white;font-size:13px;}
    .cover,.index,.sheet {max-width:none;margin:0;padding:0;break-after:page;}
    .sheet:last-child {break-after:auto;}
    .cover,.index {min-height:245mm;}
    .sheet {height:258mm;break-inside:avoid;}
    h2 {font-size:18px;margin-bottom:4px;} p {margin:4px 0;}
    .frame {margin-top:10px;}
    .desktop .capture {width:330mm;}
    /* A 390px viewport segment is 844px tall. At 97mm wide it remains more
       readable than the former 94mm setting while leaving enough room for
       the heading, caption, and review focus on one A3 continuation sheet. */
    .mobile .capture {width:97mm;}
    .scroll-end .focus {display:none;}
    .path,.caption {font-size:10px;}
  }
</style></head><body>
<section class="cover">
<p class="eyebrow">ShuttleWorks · UI / UX review evidence · edition 2</p>
<h1>${esc(title)}</h1>
<p>Captured ${new Date().toISOString()} from <code>${esc(normalizedBase)}</code>.</p>
<div class="guide">
<h2>How to read this book</h2>
<p>Each surface keeps its S-number. Desktop and mobile have separate sheets; long documents continue in numbered vertical segments rather than shrinking to fit. Screenshots are captured at 2× pixel density. PDF text and links remain selectable; screenshot text is raster evidence.</p>
<p><strong>Review context:</strong> ${tier === 'console' ? 'Operator console, using the demo operator identity. Primary tasks are tournament setup, participant management, planning, live court control and deliberate publication.' : 'Public and entrant site, using a fresh signed-out browser. Primary tasks are finding an event, reading draws and schedules, registering and managing an entry.'}</p>
<p><strong>State matters:</strong> these are route captures, not completed journeys. Outcome URLs, missing invitation tokens and placeholder receipt IDs do not prove a successful action. Redirects, signed-out prompts and access refusals are evidence of the state actually reached. HTTP 200 alone is not a functional pass.</p>
<p><strong>Design direction:</strong> preserve readable match identity and stored participant names; use restrained semantic colour, flat ordinary surfaces, consistent property panels and explicit saved/unsaved feedback. Backend terms belong in the UI only when they help a user make a decision.</p>
<p><strong>Annotate:</strong> cite surface ID, viewport and segment, then state the observed problem, affected task, severity, proposed change and measurable acceptance criterion. Distinguish a visual observation from an interaction hypothesis.</p>
<p><strong>Further validation:</strong> keyboard/focus order, screen-reader output, dark theme, form errors, offline recovery and physical venue viewing distance require separate testing. This run captures document continuations and user-scrollable internal panes; hidden overflow is never forced open. Receipt and signed-in My Entries sheets are included only after a real entrant sign-in, while signed-out account sheets remain signed out. Authentication, receipt, and other outcome states are recorded only when their real token or credential prerequisite is supplied. The demo instant applies to event-facing phase/date decisions; authentication and audit/security clocks continue using real time.</p>
<p><strong>Capture context:</strong> checkout <code>${esc(CHECKOUT_SHA)}</code> · reviewed build <code>${esc(REVIEWED_BUILD_SHA)}</code> · dirty-tree fingerprint <code>${esc(WORKING_TREE_FINGERPRINT)}</code> · baseline route <code>${esc(captureContext.baselineRoute ?? "unavailable")}</code> · fixture mode <code>${esc(FIXTURE_MODE)}</code>${FIXTURE_MODE === "normal" ? " (clean visual-review dataset — no deliberately corrupted or conflicting state)" : " (deliberate failure/recovery dataset — corrupted and conflicting state is EXPECTED here and is not a product defect)"} · effective demo instant <code>${esc(EFFECTIVE_DEMO_INSTANT)}</code> · event timezone <code>${esc(eventTimeZone)}</code>. Route coverage: <code>${esc(routeCoverage.canonicalDestinations)}</code> unique product surfaces across <code>${esc(routeCoverage.stateSheets)}</code> state/continuation sheets, plus <code>${esc(routeCoverage.enhancedStateSheets)}</code> enhanced-state and <code>${esc(routeCoverage.expectedErrorSheets)}</code> expected-error sheets. An enhanced-state sheet is a progressive-enhancement state of a surface already in the book; an expected-error sheet is a genuine refusal the product is SUPPOSED to give, not a defect. Retired compatibility URLs are excluded from the book and covered by route tests. Every sheet records its requested route and the final URL reached.</p>
<p class="meta">Viewports: desktop 1440 × 900 CSS px; mobile 390 × 844 CSS px. Light/default theme; static sheets use reduced motion. Interaction appendix uses normal motion with playable HTML recordings and PDF keyframes. Workspace: <code>${esc(WS)}</code>. Public fixture: <code>${esc(SLUG)}</code>. Effective demo instant: <code>${esc(EFFECTIVE_DEMO_INSTANT)}</code>; data is live from the captured stack and may vary between sheets. Optional states omitted from this fixture: <code>${esc(omittedOptionalStates.map((state) => `${state.label}: ${state.reason}`).join("; ") || "none")}</code>. See companion manifest for per-viewport HTTP status, final URL and console errors.</p>
</div></section>
<section class="index"><h1>Surface index</h1><p><a href="#interactions">Interaction recordings and selected states</a> · ${interactions.length} desktop/mobile sequences. Video playback is available in HTML; PDF includes every captured keyframe.</p><p>${cards.length} surfaces · ${pages.length} capture sheets. Existing audit references retain their original surface IDs.</p><ul>${cards.map((c,i)=>`<li><a href="#s${i}">${esc(c.ref)} · ${esc(c.label)}</a></li>`).join('')}</ul></section>
${pages.map(({card:c,index,viewport,shot,segment,count,kind})=>`<section class="sheet ${viewport} ${kind === 'scroll-end' ? 'scroll-end' : ''}" ${viewport==='desktop'&&segment===0&&kind==='document'?`id="s${index}"`:''}>
<p class="eyebrow">${esc(c.ref)} · ${viewport} · ${kind === 'scroll-end' ? 'supplemental list end' : `segment ${segment+1} / ${count}`}</p>
<h2>${esc(c.label)}</h2><p>${esc(c.description)}</p>
<p class="path">Requested <code>${esc(c.path)}</code> · ${esc(`HTTP ${c.viewportRuns[viewport]?.httpStatus ?? "unavailable"} · final ${c.viewportRuns[viewport]?.finalUrl ?? "unavailable"} · ${c.viewportRuns[viewport]?.consoleErrors?.length ?? 0} console errors`)}</p>
<div class="frame"><div class="capture">${shot?`<img src="data:image/png;base64,${shot.png}" alt="${escAttr(c.label)} ${escAttr(viewport)} ${kind === 'scroll-end' ? 'list end' : `segment ${segment+1}`}"><p class="caption">${shot.width} CSS px wide · document y=${shot.top}–${shot.top+shot.height} · 2× capture. ${kind === 'scroll-end' ? `Supplemental list-end view; internal region ${escAttr(shot.region)} at scroll ${shot.scrollTop}/${shot.scrollHeight}. This does not represent a complete record capture.` : segment?'Continuation of the same page; top navigation may be outside this segment.':'Initial document position; no interactive controls changed.'}</p>`:'<p class="err">Capture unavailable. Consult the manifest; do not treat this as an empty product state.</p>'}</div>
<aside><h2>Reviewer notes</h2><p>${esc(reviewFocus(c.label))}</p><p>Compare this surface with its desktop sheets. Review at a comfortable zoom; printed screenshot size is not the physical target size.</p><p>Record: observation → user impact → proposed treatment → acceptance criterion.</p></aside></div>
<p class="focus"><strong>Review focus:</strong> ${esc(reviewFocus(c.label))}</p></section>`).join('')}
${interactionHtml.replace('<section ', '<section id="interactions" ')}
</body></html>`;

const htmlPath =
  extname(outPath) === ".pdf" ? outPath.replace(/\.pdf$/, ".html") : outPath;
writeFileSync(htmlPath, html);
console.log(
  `\nwrote ${htmlPath} (${(html.length / 1024 / 1024).toFixed(1)} MB)`,
);

if (extname(outPath) === ".pdf") {
  // Hundreds of DPR-2 screenshots can exhaust Chromium's print renderer even
  // when the HTML loads successfully. Print bounded groups, then concatenate
  // their PDF pages without re-rasterizing the screenshots or selectable text.
  const sections = [...html.matchAll(/<section\b[\s\S]*?<\/section>/g)].map((match) => match[0]);
  const prefix = html.slice(0, html.indexOf("<body>") + "<body>".length);
  const chunkSize = 20;
  const chunkCount = Math.ceil(sections.length / chunkSize);
  const temporary = mkdtempSync(join(tmpdir(), "shuttleworks-book-pdf-"));
  const parts = [];
  try {
    for (let start = 0; start < sections.length; start += chunkSize) {
      const partNumber = parts.length + 1;
      const reportPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      try {
        await reportPage.setContent(prefix + sections.slice(start, start + chunkSize).join("") + "</body></html>", { waitUntil: "load", timeout: 120000 });
        await reportPage.emulateMedia({ media: "print", reducedMotion: "reduce" });
        const clippedSheets = await reportPage.locator('.sheet').evaluateAll((sheets) =>
          sheets.flatMap((sheet, index) => sheet.scrollHeight > sheet.clientHeight + 2 ? [index + 1] : []));
        if (clippedSheets.length) throw new Error(`Review-book content exceeds its sheets in PDF part ${partNumber}: ${clippedSheets.join(', ')}`);
        const partPath = join(temporary, `part-${partNumber}.pdf`);
        await reportPage.pdf({
          path: partPath,
          format: "A3", landscape: true, printBackground: true, preferCSSPageSize: true,
          displayHeaderFooter: true, headerTemplate: "<div></div>",
          footerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 12mm;font:10px -apple-system,'Segoe UI',sans-serif;color:#667085;display:flex;justify-content:space-between;align-items:center"><span>${esc(title)}</span><span>Part ${partNumber} / ${chunkCount} · Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
          margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
        });
        parts.push(partPath);
      } finally {
        await reportPage.close();
      }
    }
    if (parts.length === 1) {
      writeFileSync(outPath, readFileSync(parts[0]));
    } else {
      // pypdf is also used by the repository's surface-book text extractor.
      const repoPython = join(dirname(fileURLToPath(import.meta.url)), "../.venv/bin/python");
      const python = process.env.SURFACE_PDF_PYTHON ?? (existsSync(repoPython) ? repoPython : "python3");
      execFileSync(python, ["-c", "from pypdf import PdfWriter; import sys; writer = PdfWriter(); [writer.append(path) for path in sys.argv[2:]]; writer.write(sys.argv[1]); writer.close()", outPath, ...parts]);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
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
  status: failedViewports.length === 0 && interactions.every(record => record.ok) ? "complete" : "partial",
  updatedAt: finishedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  artifacts: {
    html: htmlPath,
    pdf: extname(outPath) === ".pdf" ? outPath : null,
    rawScreenshots: rawAssetDir,
  },
  expectedPdfPages: extname(outPath) === ".pdf" ? pages.length + 2 + interactions.reduce((sum, record) => sum + record.frames.length, 0) : null,
  failedViewports,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (existsSync(runningPath)) unlinkSync(runningPath);
console.log(
  `pipeline ${manifest.status}: ${cards.length} surfaces in ${(manifest.durationMs / 1000).toFixed(1)}s`,
);
console.log(`wrote ${manifestPath}`);
