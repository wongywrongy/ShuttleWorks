# SP-PUB-AUDIT-1 Phase 4: visual QA

**Date:** 2026-09-05 - **Status:** visual QA complete, read-only. **Scope:** the public entrant
tier as served by the demo stack, checked against the Claude Design mock and the drift already
ruled deliberate in `docs/audits/SP-PUB-AUDIT-1-phase0.md`.

**Stack and commit:** demo stack at `http://100.68.168.126:8091/e/`
(`shuttleworks-demo-entrant-1`, `shuttleworks-demo-backend-1`, `shuttleworks-demo-postgres-1`),
repo branch `feat/sp-pub-audit-1` at commit `1f2454cf`. Tournament used for detail screens:
`2025-denmark-open-t001` (Denmark Open, 2025), a completed tournament with `drawsPublished: true`
(no tournament in the demo's 30-row dataset carries an entries-open `status`, so a completed one
with published draws was used instead, per the task's fallback instruction). Draw key `MD`, player
key `player-bc020423f92af2b510a7b1c25b0fc9ffb27d966618c297f618f24518fb991332` (Aaron Chia).
Screenshots are full-page PNGs at 1280x900, plus a 390x844 pass for the discovery and tournament
overview pages, captured with Playwright/Chromium (`tests/e2e/node_modules/.bin/playwright`'s
bundled browser). All screenshot files are gitignored (`.playwright-mcp/`); paths below are
relative to the repo root.

## Screenshots and assertions

Per-route automated checks: (1) no element inside `main` computes a `border-radius` of `50%` or
`>= 9999px` (input[type=radio] excluded); (2) the page h1's computed `font-family` resolves to the
Archivo stack and `document.fonts.check('16px "Archivo"')` is true; (3) on `/e/`, the lead sentence
starts with "Badminton tournaments taking entries through"; (4) on `/e/{slug}/enter`, the page
contains "open event(s)" text outside any element carrying the `h-badge` class.

| # | Route | Screenshot | Mock screen | Drift kept and why |
|---|---|---|---|---|
| 1 | `/e/` (desktop) | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/01-discovery-desktop.png` | 2.1 Discovery | Sample content is demo BWF-tour data (Denmark Open, French Open, ...), not the mock's fictional names (Spring Open, Midsummer Shield). Real content, deliberate per phase 0 SS2.14. |
| 2 | `/e/` (mobile 390x844) | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/01-discovery-mobile.png` | 2.1 Discovery | Same as above; no overflow at 390px, season list reflows to one column. |
| 3 | `/e/2025-denmark-open-t001` (Overview) | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/02-overview-desktop.png` | 2.3 Overview | Rectangular status chip ("Entries closed") instead of a fully-round pill; no button glow on "View results" or the hero CTA. Real regulations "View" link (routes to `/e/{slug}/regulations`) instead of the mock's no-op click handler. |
| 4 | `/e/2025-denmark-open-t001` (mobile 390x844) | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/02-overview-mobile.png` | 2.3 Overview | Same drift as row 3; no overflow at 390px, key-dates/venue/fees/documents cards stack cleanly. |
| 5 | `?tab=draws` | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/03-overview-draws-desktop.png` | 2.4 Draws tab | Sample content differs (demo BWF draws vs. mock's fictional events); plain-text Open/Closed status per mock, no chip. |
| 6 | `?tab=players` | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/04-overview-players-desktop.png` | 2.5 Players tab | Sample content differs (real BWF player names vs. mock's Ada Lovelace/Alan Turing et al.). |
| 7 | `/e/2025-denmark-open-t001/schedule` | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/05-schedule-desktop.png` | 2.7 Schedule | Sample content differs; day-tab match-count badges present as designed. No round dot for "live" states seen (tournament is completed, so no Live now section renders). |
| 8 | `/e/2025-denmark-open-t001/draws/MD` | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/06-draw-desktop.png` | 2.6 Bracket | No pulsing round dot in the footnote area (G1-d: cut, confirmed never ported). Sample content differs (real BWF pairs vs. mock's Ada Lovelace / Alan Turing). Long pair names truncate with ellipsis in bracket cards at this width, matching the mock's fixed-width column design. |
| 9 | `/e/2025-denmark-open-t001/enter` | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/07-enter-desktop.png` | 2.8 Entry flow | "0 open events" renders as plain text (assertion 4 below found it outside any `h-badge` element), not the mock's neutral pill (G1-d). "Entries closed" and step-number badges are rectangular, not fully round. No button glow on any control. 36px-tall outline buttons ("View tournament information") instead of the mock's 32px. |
| 10 | `/e/login` | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/08-login-desktop.png` | 2.10 Sign in | No button glow on "Sign in". |
| 11 | `/e/signup` | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/09-signup-desktop.png` | 2.11 Sign up | No button glow on "Create account"; the human-check box renders the real self-hosted Cloudflare Turnstile test widget (visible "For testing only" banner) rather than the mock's static placeholder text. |
| 12 | `/e/me/entries` (signed in) | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/10-me-entries-desktop.png` | 2.12 My entries | Signed in successfully (see Signup/login below); the fresh account has no entries, so this captures the real empty state ("No entries yet. When you enter a tournament, it appears here."), not a fabricated card. |
| 13 | `/e/2025-denmark-open-t001/players/{personKey}` | <!-- docs-paths-ignore-next-line: gitignored screenshot -->`.playwright-mcp/sp-pub-audit-1/11-player-desktop.png` | 2.13 Player page | Not comparable to the mock: this route 500s on the demo stack for every player and tournament tried (see Findings). Screenshot shows the generic `MessagePage` error boundary, not the player page. |

### Signup / sign-in

The Turnstile "human check" on `/e/signup` uses Cloudflare's visible test sitekey
(`1x00000000000000000000AA`-class widget, labelled "For testing only. If seen, report to site
owner"). It auto-verifies without interaction after a few seconds once email + password are
filled in; no manual challenge was needed. A throwaway account
(`sp-pub-audit-<random>@example.com`) was created, then signed in, then `/e/me/entries` was loaded
signed in. The signed-in header changes from "Sign in" to "My entries", confirming an authenticated
session. The account has zero entries (freshly created, never entered a tournament), so the
screenshot is the genuine empty state, not fabricated content.

### Assertion results by route

| Route | Fully-round elements in `main` | Archivo applied to h1 | Lead-sentence check | "open event(s)" outside `h-badge` |
|---|---|---|---|---|
| `/e/` (desktop + mobile) | none found | `font-stretch: 84%`, `document.fonts.check` true | true, starts "Badminton tournaments taking entries through ..." | n/a |
| `/e/{slug}` (Overview, desktop + mobile) | none found | true | n/a | n/a |
| `?tab=draws` | none found | true | n/a | n/a |
| `?tab=players` | none found | true | n/a | n/a |
| `/e/{slug}/schedule` | none found | true | n/a | n/a |
| `/e/{slug}/draws/MD` | none found | true | n/a | n/a |
| `/e/{slug}/enter` | none found | true | n/a | true, "0 open events" found as plain text, not inside any `.h-badge` element |
| `/e/login` | none found | true | n/a | n/a |
| `/e/signup` | none found | true | n/a | n/a |
| `/e/me/entries` (signed in) | none found | true | n/a | n/a |
| `/e/{slug}/players/{personKey}` | none found (error page has no bracket/pill UI) | true | n/a | n/a |

Every route passed the no-fully-round-element check, the Archivo/font-stretch check, the
discovery lead-sentence check, and the enter-page plain-text "open events" check. No console
errors or page errors were observed on any route except the player detail route (see Findings).

## Findings

Unexpected or noteworthy items observed during this audit, not fixed here.

- `/e/{slug}/players/{personKey}`: the route 500s for every player key and every tournament tried
  (`2025-denmark-open-t001` with two different player keys, and `2026-india-open-t012` with a
  different player). `docker logs shuttleworks-demo-entrant-1` shows the SSR loader failing with
  `ApiError: API responded 422` from `apiGet` (`apps/entrant/build/server/index.js:1347`), then the
  route renders the generic `MessagePage` error boundary ("Something went wrong. Please try again
  in a moment.") with a 500 status. `curl` against the route directly also returns 500, confirming
  it is not a Playwright-specific artifact. This affects the one screen (2.13 Player page) that
  could not be visually compared to the mock at all in this pass; the backend endpoint behind it
  (`PlayerPageDTO` / `entries_site.py`, per the phase 0 inventory) appears to reject its own
  request parameters on this data. Root cause: the route validates `person_key` with `uuid.UUID()`
  before its own `_not_found()` gate, so a draw-participant hash from the sibling `/players` list
  rejects as 422 instead of 404, and the loader only maps 404 to the not-found page; pre-existing
  on main d478fb84, not introduced by this branch; logged in the debt log.
- `/e/2025-denmark-open-t001` (Overview): the facts row shows "Players entered: 0" despite the
  tournament having a full 32-pair Men's Doubles draw (and four other events) with dozens of named
  players visible on the Players tab. Likely a data/count mismatch in `EntryPageProjection.page`
  for demo-seeded (non-entry-flow) tournaments rather than a rendering bug, but the number is
  visibly wrong next to the Players tab's real count. Root cause: the overview facts list sums
  Entries-flow `entryCount` (confirmed `entries` rows), which stays 0 for imported tournaments,
  while the Players tab merges draw participants from a different directory; pre-existing on main
  d478fb84, not introduced by this branch; logged in the debt log.
- `/e/{slug}/enter` (all tournaments in this demo, since none has open entries): the page always
  shows a "Signed in on this device? You can sign out here." block with a "Sign out" button, even
  when the browser has never signed in. This reads as though the visitor is already authenticated
  and may confuse a genuinely signed-out user; worth checking whether this block should be
  conditional on an actual session. Root cause: the entry page footer posts to
  `/e/account/logout` unconditionally, pinned by a test on the premise that the page cannot know
  who is reading it, a premise the header's own session-aware branch already contradicts;
  pre-existing on main d478fb84, not introduced by this branch; logged in the debt log.
- No overflow, layout break, missing font, or CSP violation was observed at either 1280x900 or
  390x844 on any of the routes that render successfully.

## Gate output

Ran `npm run docs:paths && npm run docs:build`; tails below.

```
> cp-sat-scheduling-engine@0.0.0 docs:paths
> node tools/docs-paths.mjs

docs:paths - all live repository-relative documentation paths exist
```

```
> cp-sat-scheduling-engine@0.0.0 docs:build
> vitepress build docs

  vitepress v1.6.4

- building client + server bundles...
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
[32m OK [0m building client + server bundles...
- rendering pages...
[32m OK [0m rendering pages...
build complete in 5.67s.
```

Both gates passed.
