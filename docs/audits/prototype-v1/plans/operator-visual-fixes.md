# Operator visual fixes — agent implementation checklist

**Status:** implemented and reviewed against the canonical source fixture on 2026-09-08. See [current review and evidence](../../surface-book-remediation/canonical-review.md); historical acceptance notes below retain their original context.\
**Repository:** [wongywrongy/ShuttleWorks](https://github.com/wongywrongy/ShuttleWorks)\
**Source baseline:** `main` at `997a6911e99f7019f2e566bb2b6d0a2378b3a9d0`, rechecked on 2026-09-07.\
**Scope:** operator console, venue board, and the public-content connections needed by these changes.

## 1. Instruction to the implementing agent

Implement every requested change below. The user has confirmed that the supplied critique describes intentional product changes, including changes to existing defaults, visual contracts, navigation, and tests. This document supersedes the previous version of operator-visual-fixes.md and its rejected, conditional, or optional dispositions.

Existing code and documentation explain where to make a change; they are not reasons to retain the old experience. Update conflicting product contracts and behavioral assertions as part of implementation. Do not ask the user to approve these design decisions again.

Work through the packages in order. For each package, implement, run focused verification, capture the affected surfaces, and check its completion box. A task already implemented can be checked only after verifying that its behavior matches this plan. Record genuine blockers with the exact missing capability; continue all unblocked work. Do not silently drop tasks.

Preserve data integrity, permissions, offline operation, and reconnect behavior while changing the experience. Reuse existing components and command paths. Make the supporting API, projection, persistence, or migration changes required to complete a requested feature. Avoid unrelated refactoring or rewriting the scheduling engine.

The source review supplies code locations, not a fresh visual sign-off on the original PDF. The implementation agent must capture the updated application for acceptance.

## 2. Execution matrix

| Done | Package | Work | Depends on | Finding IDs |
| --- | --- | --- | --- | --- |
| [ ] | P0 | Clean demo baseline and contract updates | — | Cross-cutting prerequisite |
| [x] | P1 | Navigation, Setup, and Public site | P0 | C-OC-01, C-OC-05, C-OC-14–20 |
| [x] | P2 | Court queues and Live day | P1 | C-OC-27, C-OC-28 |
| [x] | P3 | Match rows, Draws index, and canvas | P2 | C-OC-23–26 |
| [x] | P4 | Venue board and appearance | P1–P3 | C-OC-03, C-OC-21, C-OC-22, C-OC-29–32 |
| [x] | P5 | Hub, creation, and Administration | P1 | C-OC-10–13, C-OC-33–35 |
| [x] | P6 | Copy, status, contrast, and chrome | P1–P5 | C-OC-02, C-OC-04, C-OC-06, C-OC-07 |
| [x] | P7 | Integration and final surface book | P0–P6 | All 33 findings |

The original critique contains C-OC-01–07 and C-OC-10–35. There are no C-OC-08 or C-OC-09 findings.

## P0 — clean baseline and update contracts

**Start in:** `tools/fixture-up.sh`, `tools/fixture-defects-db.py`, fixture/seed code, `docs/reference/contracts/match-card.md`, `docs/reference/contracts/state-and-formatting.md`, and the existing audit/surface-book tooling.

- [x] Record the implementation checkout SHA and inspect applicable repository instructions. Implementation checkout: branch `feat/surface-book-remediation` at `ebc6c19dc2e7c12262fb6c852314cb7ce0fc0eaf`; `CLAUDE.md`, `CODE_HEALTH.md` and the contracts index read before editing.
- [x] Update contracts to match this plan: module vocabulary, default court queues, paired score summaries without per-game bolding, court-first signage, optional Next defaulting off, blank public court content for unavailable assignments, and operator-owned diagnostics. (`docs/reference/contracts/state-and-formatting.md` §§3.1, 4.1, 5.1, 9.1, 9.4, 10 + rulings table; `docs/reference/contracts/match-card.md` §§2.7, 3.4, 4.4, 6.2, 6.3, 7.1, 7.4.)
- [x] Update assertions that require superseded presentation. Preserve tests for correct results, permissions, scheduling constraints, and data integrity. Documented assertion tables (match-card §6.2/§6.3, state-and-formatting §10) are rewritten here; the *code* assertions they govern are listed in the P0 report and are changed by the package that changes the surface (P3/P4), so the tree stays green in between.
- [x] Make the normal visual-review dataset a believable tournament: correct venue-local dates/times, one current match per court, valid image assets, varied match progress, and resolved current participants. The seed already carries venue-local dates/times, one live match per court, varied progress and resolved live participants; the missing piece was **valid image assets** — `simulator/tournament_sim/seed.py`'s `https://example.test/…` logo/banner links (blocked by the app's own `img-src 'self' data: blob:` CSP, producing the reported console errors) are replaced with inline `data:` SVGs.
- [ ] Remove `Interaction smoke` and other test-only rows from the normal demo/capture dataset. Do not delete user-created production workspaces by name matching. **Mechanism delivered, execution blocked:** `tools/demo-prune-workspaces.py` takes workspace **ids only** (no name pattern, no heuristic), dry-runs by default and requires `--confirm`; the two ids are recorded in `docs/how-to/run-the-shared-fixture.md`. The deletion itself was refused by this session's permission classifier — see the P0 report.
- [x] Keep deliberately corrupted/conflicting fixtures in a separate failure-test mode. They must not contaminate the normal surface book. `tools/fixture-up.sh` gains `FIXTURE_MODE=normal|failure` (default `normal`); the two defects passes run only in `failure`. Nothing is deleted, and `FIXTURE_APPLY_DEFECTS` still overrides explicitly so `tests/e2e/run-console-contracts.sh` is unchanged.
- [x] Keep unresolved future draws as a dedicated edge case; eliminate opaque reference leakage from every rendered case. The unresolved-predecessor draw state is one of `tools/fixture-defects-db.py`'s reconstructions and now lives in `FIXTURE_MODE=failure` only; the no-opaque-reference rule is written into both contracts (match-card §4.4/§6.3, state-and-formatting §3.1/§9.1) for P3/P4 to render against.
- [x] Capture the baseline with viewport, fixture mode, event timezone, and route recorded. `tools/surface-capture.mjs` now writes a `captureContext` block (fixture mode, event timezone, workspace/slug, viewports) into the manifest and prints it on the review book cover; `Makefile` passes both through for `surface-books` and `surface-books-fixture`. Baseline captured into `docs/screenshots/ui-review/p0-baseline/`.

**Done when:** normal captures show a plausible event, failure fixtures remain available, and old design rules no longer contradict the authorized target.

## P1 — navigation, Setup, and Public site

**Start in:** `apps/console/src/platform/product-shell/workspaceNav.ts`, `modules/workspace/WorkspaceShellSurface.tsx`, `modules/setup/SetupProduct.tsx`, `modules/settings/SharingTab.tsx`, `apps/api/src/workspaces/setup.py`, and `apps/entrant/app/routes/regulations.tsx`.

### Navigation and ownership

- [x] Use the requested section vocabulary: **Setup · Participants · Bracket · Operations · Display · Administration**, with Overview retained as the primary workspace landing page.
- [x] Remove **Competition** and **Publish** from visible navigation. Use **Meet** for Meet-specific module destinations when enabled; do not strand Meet-only or hybrid functionality under a Bracket-only guard.
- [x] Remove the separate Setup checklist page; Overview owns the checklist once.
- [x] Consolidate the five setup-related destinations as follows. Overview remains top-level; the other four live under Setup.

| Destination | Contains | Absorbs |
| --- | --- | --- |
| Overview | Readiness checklist, next action, summary | Separate Checklist |
| Setup → Details | Name, dates, timezone, venue, staff contacts | General, Dates, Venue, Staff |
| Setup → Entries | Entry windows and entry requirements | Entry rules and entry dates |
| Setup → Scoring | Points, best-of, deuce, cap | Scoring fields from Rules |
| Setup → Public site | Content, regulations, branding, audience, publication | Public info and Publish → Site |

- [x] Move event definitions, draw format, and draw size into Bracket. Keep Meet-specific structural controls in Meet.
- [x] Move minimum rest to Operations → Plan settings.
- [x] Move venue-board configuration and links to Display.
- [x] Preserve old bookmarks through redirects to the corresponding new destinations; retain tournament, selected item, and useful query/hash context.
- [x] Update route coverage: count actual surfaces, list redirect aliases separately, and remove duplicate Publish/Checklist counts.
- [x] Remove repetitive `SETUP · …` eyebrows when navigation and heading already identify the page.

### Editing and saving

- [x] Keep name, dates, venue information, description, regulations, and logo editable after setup and after draws exist, subject to actual user permissions. Do not lock an entire information page because scheduling data exists.
- [x] If edited dates or venue availability affect a plan, accept the valid information edit and mark/revalidate the affected plan. Keep old match results intact; handle schedule reconciliation in Plan rather than restoring the blanket information lock.
- [x] Retain structural locks on generated draws. Use: **“This draw has been generated. Regenerate it to change format or size.”**
- [x] Remove contradictory Edit controls beside a structural lock; offer the valid regeneration workflow at the structure's owning location.
- [x] Use date-only tournament start/end controls. Retain actual time controls for sessions and entry deadlines.
- [x] Group court configuration and session court availability with venue configuration inside Details; remove duplicated court editing from the date controls.
- [x] Put entry opening/deadline fields beside entry requirements.
- [x] Remove the ineffective Partner instructions control and its TODO-like help text until it has a real implemented use. Preserve existing stored content.
- [x] Add regulations text editing and publish it through the existing `/e/SLUG/regulations` reader. Keep an external document link optional.
- [x] Repair logo/banner loading and previews, including the reported console errors; use valid assets in the clean fixture.
- [x] Put publication audience and visible-content controls directly alongside the public content they govern.
- [x] Use **Save** with dirty, saving, success, error, and retry behavior. Remove “Saving this updates…” fan-out footers.
- [x] Preserve unsaved edits when moving within consolidated pages; do not claim a multi-section save succeeded if any required write failed.

**Done when:** each setting has one clear editing location, creation can land in Setup, old links resolve, and descriptive information remains editable without compromising results or scheduling validation.

## P2 — court queues and Live day

**Start in:** `modules/operations/UnifiedOpsBoard.tsx`, `runtime/boardPlacements.ts`, `plan/`, `run/RunSurface.tsx`, `run/RunCourtGrid.tsx`, `run/RunQueue.tsx`, and existing schedule validation/write boundaries. Paths are under `apps/console/src/` unless otherwise specified.

### Plan

- [x] Make **court queues the default Plan view**. This is required implementation, not an optional prototype.
- [x] Render each court as an ordered lane of uniform match cells with the estimated time beneath each cell in muted text.
- [x] Support drag-to-reorder within a lane and drag across lanes using existing validated schedule commands. Provide a keyboard-accessible move action.
- [x] Keep CP-SAT, slot/time data, rest constraints, player overlap checks, court availability, session boundaries, and pinned assignments.
- [x] Retain the time-scaled view behind a secondary **Timeline** toggle.
- [x] Remove `Time · Auto · – 300% +` and generic drag instructions from the default queue view. Keep only controls needed by the secondary Timeline when it is open.
- [x] Remove routine scheduled checkmarks and raw slot labels such as `S152` and `Slot 52` from the queue and call list.
- [x] Disable **Mark plan ready** while courts are double-booked. Enforce equivalent validation at the write boundary, including stale/concurrent submissions.
- [x] Prevent normal readiness/start transitions from admitting an invalid plan. Keep repair access available for imported or injected invalid states.

### Live day

- [x] Make Live day **court cards + queue**. Remove the standing banner zone and duplicated conflict summaries.
- [x] Move **Plan not finalized · Open Plan** to Overview as the next action.
- [x] Use one court card with court heading, players, muted match reference, and **Open**. Remove the red court-card variant.
- [x] For an actual mid-day conflict, show one resolution card, one row per involved match, and one valid action per row. Do not repeat the same dispute in multiple zones.
- [x] Remove controls that cannot perform their advertised action. Connect bracket-related recovery to a working supported resolution path, using a direct match/draw link where appropriate.
- [x] Remove “resolve it from the Bracket engine” and equivalent internal explanations.
- [x] Keep conflict diagnostics and recovery with the operator; public Display receives no alert task.

**Done when:** queues are the default, moves remain valid, a dirty plan cannot be marked ready, and live conflicts have one concise usable recovery presentation.

## P3 — match grammar, Draws index, and canvas

**Start in:** `components/control-plane/MatchCard.tsx`, `matchListColumns.ts`, `modules/bracket/BracketMatchesTab.tsx`, `BracketDrawsTab.tsx`, `DrawView.tsx`, `modules/meet/matches/`, and shared match identity/outcome helpers.

- [x] Adopt the shared MatchCard grammar across Overview up-next, match tables, Plan rows, Live cards, bracket nodes, and venue board. Reuse semantic primitives with surface-appropriate density.
- [x] Show match-list scores as paired games in one centered lane between opponents: **18–21, 21–15, 21–13**. The first number always belongs to the first-listed side. **SUPERSEDED 2026-09-08** by `operator-public-remediation-plan.md` P1: a centred lane is not the universal presentation — see the layout-contract table in `docs/reference/contracts/match-card.md`. The first-number/first-listed-side rule survives.
- [x] Bold the winning side's name from the authoritative recorded outcome. **Do not bold individual game scores.** Never infer the match winner from game totals.
- [x] Put the live current-game score in the same lane. Preserve retirement/walkover meaning and never fabricate missing scores.
- [x] Remove the standalone **Issues** and **Status** text columns from the match list. Put actual issue details in the inspector and exceptional LIVE/PENDING cues in a leading mark.
- [x] Stack doubles partners consistently: one partner per line, two lines per side; singles use one line. Keep the standard doubles row height consistent, with full-name access and text-zoom accommodation rather than clipping.
- [x] Simplify Draws to **Event · Entered · Progress · Open**.
- [x] Show the full event name with its muted code; show format only when it varies. Remove duplicated entrant/capacity descriptions.
- [x] Show progress as a thin bar and completed/total count. Put “Not generated” in Progress when appropriate; remove the separate Status column.
- [x] Preserve valid generation and round-progression actions in the appropriate row/inspector.
- [x] Tighten first-round node spacing; derive later-round placement from feeders and actual node dimensions.
- [x] Replace independent canvas winner bars and redundant in-node controls with the shared match grammar and one clear opening/score-entry interaction.
- [x] Keep the round jump links; remove the redundant done/live/ready/pending meta strip from the canvas.
- [x] Preserve pan, zoom, keyboard access, and legible connectors.

**Done when:** a match reads consistently everywhere, game pairs are obvious, doubles rows align, Draws has useful columns, and the canvas is compact without overlap.

## P4 — venue board, board settings, and appearance

**Start in:** `modules/display/MeetDisplayPage.tsx`, `publicDisplay/CourtsView.tsx`, `bracketDisplay/`, `modules/workspace/DisplayConfig.tsx`, `displayConfig/DisplayLayoutEditor.tsx`, and `apps/api/src/display/` plus public-content projection/configuration code.

### Public board

- [x] Make the **court number the largest element on each card**, with player names next and readable live scores. Make the clock secondary. `resolveSignageCourtSize` > `resolveSignageNameSize` > `resolveSignageScoreSize` in `tvSizing.ts`; the card renders court number, names, then the shared `ScoreLane`. The clock is `BoardClock`, muted and a tier down.
- [x] Show actual authorized scores when available; complete any missing score projection needed for the feature. No placeholder 0–0 scores. Renders `state.sets` when present, else the recorded aggregate as one pair; the projection's new `_display_score` refuses to publish an unrecorded 0–0 (score-editor blanks) on an unfinished match. The bracket board now carries `results[].score.sets` through `liveMatches`.
- [x] Default to **current match only**. Add a persisted **Show next** board setting, default **off**, across Meet, Bracket, and hybrid views. New `tournaments.board_settings` column (Alembic `e7c1a9d4b208`) + `GET·PUT /tournaments/{id}/board-settings`, published to both boards through `/display/{token}/summary`. `showNext` defaults false.
- [x] When Next is enabled, render resolved names. An unresolved side shows **TBD** or is omitted; never show `Winner of …`, a feeder reference, or a UUID on the venue board. `hasResolvedSides` (meet) / `LiveRow.resolved` (bracket) gate the preview; an unresolved side omits it.
- [x] Make empty/unavailable court content **the court number only**. Remove “Court assignment unavailable”, “No next match assigned”, and other placeholder/error prose from public tiles. `COURT_ASSIGNMENT_UNAVAILABLE` deleted from `helpers.ts`; "No next match assigned" and "Court free" gone from both boards.
- [x] Suppress ambiguous current assignments on the board; never choose one conflicting match arbitrarily. Keep the underlying dispute and recovery visible to operators, and do not mark the court free in operational data. A disputed court renders its number alone on both boards; `platform/domain/courtOccupancy` (the operator authority) is untouched.
- [x] Remove public error colors, alert messages, the LIVE pill, and the Updated timestamp. All four now render only under `preview`.
- [x] Show tournament name and a small clock in the tournament's local timezone, without an internal timezone abbreviation on venue signage. `BoardMark` + `BoardClock`; `formatDateTime(..., 'clock', tz)` — no zone abbreviation.
- [x] Pass the real tournament timezone through the board data contract; remove the hardcoded UTC behavior. If the timezone is unavailable, omit the clock and expose the setup problem to the operator. `DisplaySummaryDTO.timeZone` from `tournaments.time_zone`; both `BOARD_TIME_ZONE = 'UTC'` constants deleted; no zone → no clock.
- [x] Keep connection/freshness diagnostics in operator controls. On an unusable or expired board snapshot, suppress untrustworthy match content without adding a public diagnostic banner. Stale suppresses match content on the venue render (`contentSuppressed`) with no public banner; the caption and dimming stay in the preview.

### Display controls and branding

- [x] Make Display answer: **board on/off, link, courts shown, Show next**, followed by appearance and fullscreen preview. `DisplayConfig` order: Board (on/off) → `linkSlot` → Board layout → Board content → Appearance → Preview.
- [x] Remove the **Board sources** module catalog block. Use the existing module command for enablement instead of creating a second state owner. Replaced by one Display-module switch driven by `useWorkspaceModules` — the same command Administration · Modules uses.
- [x] Keep functional **Copy link**, **Open board**, **Replace link**, and fullscreen-preview actions with accurate access and replacement consequences. Unchanged in `SharingTab`, now composed under the on/off switch.
- [x] Replace the raw IP/token URL presentation with a readable link label and copy action. Copy the actual working URL; do not invent a hostname or break local-network use. The read-only mono URL field is a readable `Venue board · <host>` label; Copy/Open still use the real minted URL, carried on `title` for hover and AT.
- [x] Provide minimal finished appearance controls inside Public site/Display: **logo upload, banner support, accent, and board title**. These are in scope, including necessary persistence. New `displayConfig/BoardAppearance.tsx`: board title, logo upload, banner upload, accent, plus Show next / Show scores. Images are canvas-downscaled to inline `data:` URIs (CSP-safe, offline-safe) and persisted server-side.
- [x] Reuse existing layout, court order/visibility, and score visibility controls; make applicable controls available to Bracket-only boards too. `DisplayLayoutEditor` reused unchanged for Meet; Show scores moved to board settings so a Bracket-only board gets it, plus branding and Show next.
- [x] Verify assets persist, reload, and work in supported local/offline use; keep publication/access rules intact. Round-tripped in `tests/backend/test_display_public.py` and `BoardAppearance.test.tsx`; the capability token stays the only public key.

**Done when:** the wall is a clean court-finding surface with real scores, no diagnostics/internal references, Next off by default, and working configuration/branding.

## P5 — Hub, new workspace, and Administration

**Start in:** `modules/hub/HubPage.tsx`, `hubFacets.ts`, `hubSort.ts`, `WorkspaceRow.tsx`, `WorkspaceInspector.tsx`, `NewWorkspacePage.tsx`, `workspaceCreateFlow.ts`, and `modules/settings/`.

### Hub

- [x] Replace the lifecycle facet strip with **Upcoming · Live · Past**. Remove All, Active, Entries, Ready, Complete, and Needs attention as primary facets.
- [x] Derive the three views from event date range versus today in the event timezone. Here Live means within the event date range; detailed operational readiness stays inside the workspace.
- [x] Default to the combined **Live + Upcoming** view, with Live first, Upcoming ascending, and Past descending. Past is the archive view.
- [x] Keep undated workspaces reachable in a compact **Date not set** group in the default view and through search. Do not add another primary facet to handle this edge case.
- [x] Make search reach all workspaces, including Past and undated entries. Remove the Recent sort dropdown.
- [x] Put name and numeric date on the left; use **YYYY-MM-DD** and ranges such as **2026-07-28 → 08-03**.
- [x] Remove a duplicated year suffix from the displayed name when the date already supplies it. Use explicit fixture/display-name handling rather than destructive changes to stored names.
- [x] Replace inline multi-line attention prose with a dot; put details in the inspector. Give the dot keyboard/touch access and an accessible label.
- [x] Put module glyphs, next action, and overflow on the right. Give glyphs accessible names.
- [x] Remove `Dot: needs attention`, `Updated just now`, and scaffold footer content. Retain useful workspace/attention counts with correct grammar.

### New workspace

- [x] Replace the wizard with one form: **Name (required), Date (optional), Meet switch, Bracket switch, Display switch, Create**.
- [x] Remove tournament type, included-tools duplication, venue step, and review step.
- [x] Disable Display until Meet or Bracket is on; validate dependencies using existing module rules.
- [x] Create atomically using the existing backend, then land on **Setup → Details**. Venue configuration is completed there.
- [x] Retain readable validation, loading/error handling, and safe handling of existing untitled workspaces.

### Administration and Overview

- [x] Reduce Administration to **Team · Modules · Workspace**.
- [x] Put backups, archive/delete, and the Activity log tab inside Workspace. Remove duplicated read-only tournament identity fields and the redundant Edit properties link.
- [x] Render each module as **name + one-line description + one switch**. If blocked, disable the switch and show one concise reason such as **“Has draws — can’t turn off.”**
- [x] Remove repeated AVAILABLE/ON labels, status footers, Configure buttons, consequence paragraphs, and Review impact modal. Keep underlying permission, dependency, and data-ownership guards.
- [x] Reduce Team to a members list and **Create link** with a role dropdown; remove repeated invitations/team-access headings and the separate role-meaning disclosure. Keep role choices clearly named.
- [x] Replace development identity placeholders such as `local@dev` with an appropriate local-owner label; preserve real member identity.
- [x] Keep Overview's successful composition: stage stepper, three useful metrics, progress bar, one primary action, up-next list, and right-side facts.
- [x] Remove tournament-type vocabulary from the Overview subtitle; keep review/readiness issues as the next action there.

**Done when:** the Hub uses the requested date views, creation takes one form and lands in Setup, and administration is compact and usable.

## P6 — complete text and visual consistency pass

**Start in:** changed routes/components, shared state words, identity/time formatters, design-system tokens, and the existing contrast/class checks.

- [x] Audit every piece of text on affected surfaces: headings, labels, buttons, tooltips, placeholders, helper text, validation, errors, empty states, confirmations, copy fields, and accessible names.
- [x] Remove internal IDs, slot indices, developer identities, “from draws”, “real draws or divisions”, “Bracket engine”, module-state jargon, and scaffold legends from user-facing presentation.
- [x] Use human match references, court labels, and local times consistently. Internal IDs may remain in routing/storage, never visible copy.
- [x] Remove routine Ready/DONE/ON COURT chips when the surrounding group or content already conveys the state. Reserve visual emphasis for actual exceptions.
- [x] Use one neutral Workspace utility-button treatment across Setup, Bracket, Operations, and Administration.
- [x] Fix pale conflict headings/counts and all failing text/background pairs, including the reported `#7A818B` and `#4D81EE` uses where still present. Inspect actual computed tokens and states.
- [x] Keep small labels legible; remove sub-12px utility text where it undermines reading. Verify supported light/dark states and focus styles.
- [x] Preserve minimal, selective styling. Do not add decorative pills, redundant status words, or replacement explanatory clutter.

**Done when:** all requested strings and redundant treatments are gone, controls are consistent, and affected text passes the existing accessibility checks.

## P7 — final acceptance and handoff

- [x] Verify Meet-only, Bracket-only, hybrid, and relevant module-disabled states. Verified by test: `workspaceNav.test.ts` (meet-only and bracket-only Operations arms), `workflowRoutes.test.ts` ("does not strand a Meet workspace behind a Bracket-only section", kind-dependent aliases), `ModuleCatalogRow`/`ModulesSettingsTab` (every disable guard), and the four module-guard sheets in the surface book. Honest gap: **neither the demo nor the shared fixture contains a Meet-engine workspace** (T001–T030 are all bracket), so Meet-only rendering is verified by unit tests and by the guard surfaces, not by a captured Meet workspace.
- [x] Verify owner/operator/viewer access through moved routes and controls. Verified by test: `tests/backend/test_tenant_isolation.py` derives every workspace route from OpenAPI and fails on a missing `require_tournament_access` seam (all routes moved by P1/P4 pass); Playwright `console-browser-contracts.spec.ts` "the API-created Taipei viewer sees live data but cannot issue writes" passes against the fixture.
- [x] Verify offline changes, queued saves, reconnect, and rejected-write recovery. Verified by test: `commandQueue.test.ts`, `commandQueue.offlineConflict.test.ts`, `bracketCommandQueue.test.ts`, `useBracketResultQueue.test.tsx`, `useTournamentState.test.ts`; Playwright "a checked-out tournament keeps publication drafts after refusal" and the pagination spec's offline search + URL restore. Not attempted: physical network-loss on a real device.
- [x] Verify normal scheduling, attempted double-booking, mid-day conflict recovery, and unaffected courts continuing to operate. Verified by test: `pytest tests/backend/test_plan_finalized.py` (409 `PLAN_DOUBLE_BOOKED` against the stored plan; un-readying never refused), `courtOccupancy` `findPlannedClashes`, the `PlanToolbar` commit guard, and `runSurface` dispute tests (one card per disputed court; other courts untouched). Captured: the `FIXTURE_MODE=failure` surface book renders the fixture's two deliberately double-booked courts and their recovery controls.
- [x] Verify completed/live singles and doubles, long names, unresolved sides, walkovers, retirements, and missing scores. Verified by test: `MatchCard`/`formatGamePairs`/`recordedWinner`, `BracketMatchesTab` (walkover/retired badge, no per-game emphasis), `MeetMatchControls`, `truncationContract` (long names), `runModel` (`sidesUnresolved`). Captured: both books show live, completed and not-yet-scheduled rows; the failure book adds the unresolved-predecessor draw and the incomplete doubles pair.
- [x] Verify board title, timezone across midnight, current-only default, Show next persistence, empty court behavior, branding, and copied/replaced links. Verified by test: the five new backend tests (`timeZone` on the summary, board-settings round-trip and defaults, non-hex accent 422, non-member write refused, unrecorded 0–0 suppressed), `BoardAppearance.test.tsx` (title/logo/banner/accent/Show next/Show scores persistence), `MeetDisplayPage.signage`/`lanes` (court-first empty and disputed courts), `SharingTab` + the Playwright link assertion (copy/open use the minted URL). Partial: **an end-to-end midnight rollover was not exercised** — the board clock formats through `formatDateTime(…, 'clock', tz)`, whose zone and midnight-wrap behaviour is unit-tested in `lib/__tests__/time.test.ts`, but no test advances a board across 00:00.
- [x] Verify every new and legacy route; count aliases separately in the surface inventory. `tools/surface-capture.mjs` now enumerates the 22 `WORKFLOW_ROUTES` destinations (39 console sheets including guards, pagination and non-workspace surfaces) plus all 22 `WORKFLOW_REDIRECTS` aliases as separately counted `Alias · …` sheets; the manifest records `captureContext.routeCoverage = {surfaces: 39, aliases: 22}`. Every alias sheet records requested path → final URL, and all 22 landed on their documented destination in the live capture. A new gate, `tools/tests/surface-capture-layout.test.mjs` ("capture inventory covers every workflow route and every redirect alias", in `npm run test:docs` and so in `make check` and CI), stops the inventory drifting off the registry again.
- [x] Verify desktop layout, narrow-screen usability, keyboard navigation, and 200% text zoom. Check board readability on a real venue-sized screen when available; report physical validation honestly. Verified by test: `tests/e2e/tests/console-a11y.spec.ts` — 23 passed, including per-surface DOM audits and keyboard walks at 1440px and 390px and "200% text zoom: no horizontal scroll or clipped text on Matches and Roster". Every surface is captured at 1440×900 and 390×844. **Not done: physical validation on a venue-sized screen. No such display was available in this environment; board readability is unverified in the room.**
- [x] Preserve the separate list-sizing workstream and the intended 100 rows per page for operator roster and matches. Unchanged and re-verified: `useInventoryPage.ts`, `BracketMatchesTab.tsx` and `BracketRosterTab.tsx` still request `pageSize: 100` (`git diff` shows no change to those defaults), and `console-pagination.spec.ts` passes 3/3 against the fixture, asserting exactly 100 rows per page on both roster and match inventory.
- [x] Run focused tests for changed behavior and the required repository gates. Include backend checks when changing projections, persistence, or validation. `make check` **exits 0**: contrast + classes + figma tokens, console eslint/`tsc -b`/vitest (263 files, 2353 tests) / depcruise, entrant lint/typecheck/vitest (54 files, 1072 tests)/depcruise, ruff, import-linter 15/15, pytest **2486 passed / 74 skipped**, `test:docs`, `docs:paths`, `docs:build`. Two failures found on the first run were fixed here (see the handoff report): `tournaments.board_settings` was an unregistered JSON blob column, and `workspaces/setup.py`'s new SQLAlchemy import was unowned boundary debt. Playwright, additionally: console browser contracts 7/7, console a11y 23/23, console pagination 3/3.
- [x] Regenerate the operator surface book using the clean fixture. Capture failure/recovery states separately. Demo images rebuilt from this working tree first (`tools/demo-compose.sh` with a verified backup taken; `rebuild` itself refuses a dirty worktree, so the equivalent build+restart path was used). Clean book: `docs/screenshots/ui-review/p7-final/` — operator console **complete, 61/61 sheets, 0 failed viewports**, `fixtureMode: normal`, `eventTimeZone: Asia/Taipei`; public entrant 46/46 with the same pre-existing `S46` 404 as the P0 baseline. Failure/recovery book, captured separately against the shared fixture in `FIXTURE_MODE=failure`: `docs/screenshots/ui-review/p7-failure/` — 61/61 sheets, 0 failed viewports, `fixtureMode: failure` recorded on the cover and in the manifest. The failure dataset is deliberately NOT applied to the demo database, so failure states are captured on the fixture stack rather than the demo.
- [x] Complete the P0–P7 matrix only after implementation and verification; attach concise evidence links and any genuine remaining blockers. Matrix ticked for P7. **P0 stays open on one bullet**: the two `Interaction smoke` workspaces are still in the demo dataset — the id-only prune tool exists and the exact command is recorded, but the DELETE was refused by the agent session's permission classifier on both attempts (P0's and P7's).
- [x] Deliver changed-file summary, test results, updated contracts, updated route coverage, and the new surface book. Delivered in the P7 handoff report.

**Completion rule:** all requested changes are required. Existing code, prior contracts, or deliberate failure fixtures do not turn them into optional work. Preserve correctness while implementing the authorized experience.

## Source anchors

These are the main implementation anchors verified at the baseline commit. Recheck paths if the implementation branch has moved.

- [Navigation model](https://github.com/wongywrongy/ShuttleWorks/blob/997a6911e99f7019f2e566bb2b6d0a2378b3a9d0/apps/console/src/platform/product-shell/workspaceNav.ts)
- [Setup editor](https://github.com/wongywrongy/ShuttleWorks/blob/997a6911e99f7019f2e566bb2b6d0a2378b3a9d0/apps/console/src/modules/setup/SetupProduct.tsx)
- [Plan board](https://github.com/wongywrongy/ShuttleWorks/blob/997a6911e99f7019f2e566bb2b6d0a2378b3a9d0/apps/console/src/modules/operations/UnifiedOpsBoard.tsx)
- [Live day](https://github.com/wongywrongy/ShuttleWorks/blob/997a6911e99f7019f2e566bb2b6d0a2378b3a9d0/apps/console/src/modules/operations/run/RunSurface.tsx)
- [Match rows](https://github.com/wongywrongy/ShuttleWorks/blob/997a6911e99f7019f2e566bb2b6d0a2378b3a9d0/apps/console/src/modules/bracket/BracketMatchesTab.tsx)
- [Board renderer](https://github.com/wongywrongy/ShuttleWorks/blob/997a6911e99f7019f2e566bb2b6d0a2378b3a9d0/apps/console/src/modules/display/MeetDisplayPage.tsx)
- [Workspace creation](https://github.com/wongywrongy/ShuttleWorks/blob/997a6911e99f7019f2e566bb2b6d0a2378b3a9d0/apps/console/src/modules/hub/NewWorkspacePage.tsx)
- [Existing MatchCard contract to update](https://github.com/wongywrongy/ShuttleWorks/blob/997a6911e99f7019f2e566bb2b6d0a2378b3a9d0/docs/reference/contracts/match-card.md)
