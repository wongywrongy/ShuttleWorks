# ShuttleWorks v3 consolidated plan — PROGRESS

Program started 2026-09-06. Authority: `shuttleworks-v3-consolidated-plan.md` (repo root). Findings source: the two v3-reviewed surface books, kept gitignored at `docs/screenshots/ui-review/reviewed-v3/` with extracted text under `text/`. The second-pass review (`shuttleworks-v3-second-pass-review.md`) and the HTML MatchCard mockup it references are NOT on disk; plan §3 records every decision taken on them and is treated as the authority for those.

Role split: Claude (Fable) orchestrates — classifies, briefs, rules, reviews. Subagents implement and run gates. Nothing is closed without recorded acceptance evidence (plan §7 closure record).

## Baseline

- Branch `feat/surface-book-remediation`. The Codex v2 remediation (128 files, uncommitted at program start) is the working baseline; `make check` on it failed only on a missing `filterNoun` declaration in `apps/entrant/public/assets/entrants-filter.d.ts` (fixed 2026-09-06).
- Gate record for the baseline: see "Gate log" below.

## Package status (plan §1)

| Pkg | Priority | Status | Evidence |
|---|---|---|---|
| 01 fixture | P0 | done · b065ac72 + 01b (7/7 states asserted; (c) structurally impossible, debt V3-01-2) | reports/01-fixture.md, reports/01b-fixture-defects.md |
| 02 contracts | P0 | done · 871ee621 | docs/reference/contracts/state-and-formatting.md, ADR 0029, reports/02-contracts.md |
| 03 conflict recovery + counts | P0 | done (focused gates + full backend suite) · see git log | reports/03-conflicts.md |
| 04 public projection | P0 | 04a done · see git log; 04b (display consolidation) after 03 | reports/04a-public-projection.md, ledger/04-strings.md |
| 05 false claims | P0 | done (focused gates) · see git log | reports/05-false-claims.md, ledger/05-strings.md |
| 06 contrast + hierarchy | P0 | done (focused gates) · see git log | reports/06-contrast.md |
| 09 MatchCard spec | P0 | done · ce78d426 | docs/reference/contracts/match-card.md, reports/09-matchcard-spec.md |
| 07 typography/spacing/states | P1 | done · 26f8e3f2 | reports/07-typography.md |
| 08 controls + form states | P1 | done · see git log | reports/08-controls.md, ledger/08-strings.md |
| 10 operator match rows + bracket | P0 | done · 97449c07 + 10c | reports/10-operator-match-rows.md, reports/10c-result-inventory.md |
| 11 public match/round/bracket | P0 | done · e729500a | reports/11-public-match-views.md, ledger/11-strings.md |
| 19 backup/restore/sync | P0 | done · see git log | reports/19-backups.md, ledger/19-strings.md |
| 04b display consolidation | P0 | done · see git log | reports/04b-display.md |
| 15 publication + privacy | P0 | done · see git log | reports/15-publication-privacy.md |
| 12 hub/overview/Plan/Live | P1 | done · 854a885d | reports/12-hub-overview-plan-live.md |
| 13 setup | P1 | done · 74969629 + 05f93392 (timezone fix) | reports/13-setup.md |
| 14 roster/draw index/empty | P1 | done · 91d4acfc | reports/14-roster-draws-empty.md |
| 17 signage | P1 | done · 65a5084b (physical validation → 27b) | reports/17-signage.md |
| 18 account/team/tools/settings | P1 | done · f1736964 | reports/18-account-team-tools.md |
| 20 activity history | P1 | done · 74969629 | reports/20-activity.md |
| 21 public discovery/overview/directory | P1 | done · 3dde74cf + 8e07b9ea | reports/21-public-discovery.md |
| 22 regulations/closed entries | P1 | done · 5f25f761 | reports/22-regulations-closed.md |
| 23 account journeys | P0 | done · c5a73f48 | reports/23-account-journeys.md, evidence/account-journeys.md |
| 24 invitations/My entries/receipts | P0 | done · 8e07b9ea (short reference format → debt V3-24-1) | reports/24-invitations-entries-receipts.md |
| 25 every-string ledger | P1 | done · bd2d6e58 + 25b (zero unreviewed) | ledger/LEDGER.md, reports/25*.md |
| 26 accessibility + responsive | P1 | 26a done · 0e789a20; 26b (entrant) in progress | reports/26a-console-a11y.md |
| 27 evidence + recapture | P0 | 27a closure record · 0e3a60f8; 27b recapture not started | closure.md |
| 28 consistency + brand seam | P2 | done · 51d4b3cf | reports/28-consistency.md |
| 16 venue-board publishing | P1 | done · ae9a07d3 | reports/16-venue-board.md |


## Plan gates

- **Gate A** (plan §2: counts, assignments, published times, privacy and consequential messages agree on one fixture; computed contrast verified; unknown behaviour has a named verification task): packages 01–06 and 04b are committed. Publication/privacy same-fixture assertions are package 15 (not started) — - **Gate B** (plan §2: singles, doubles, incomplete pair, unresolved predecessor, no scores, live game, completed match and exceptional outcomes render correctly; long names identifiable): packages 09, 10, 11 committed with the MC-01…MC-13 fixtures asserted on both tiers; the visual non-overlap check at the supported widths and 200% zoom is package 27's recapture. Provisionally met.

- **Gate C** (plan §2: an operator can configure, publish, run, recover and review a tournament; a public visitor can find a match and an entrant can complete the supported account/entry journey; Display never performs operational resolution): packages 12–24 committed with per-finding tests; the journey script proves sign-up → verify → enter → receipt and reset; Display projects only. Provisionally met pending the 27b recapture.

Gate A met on the assertions side (package 15 matrix committed); the same-fixture recapture is package 27.

## Gate log

(append: date · command · result)

- 2026-09-06 · HEAD d08f1bb3 (packages 01–28 except 26b/27b) · console 256 files / 2260 tests, tsc, eslint, depcruise; entrant 53 files / 967 tests, typecheck, lint; ruff; import-linter 15/15; pytest 2419 passed / 72 skipped after registering the pkg 24 allow-list flag; figma-tokens regenerated. Two stale console browser-contract expectations fixed (Venue board link label; Korea readiness — a real timezone bug in pkg 13's session-window check).
- 2026-09-06 · HEAD 6f347dd9 (packages 01, 02, 03, 04a, 05, 06, 09) · full gate: console 235 files / 2072 tests, tsc, eslint, depcruise 0 errors; entrant 51 files / 897 tests, typecheck, lint; ruff clean; import-linter 15/15; pytest 2383 passed / 72 skipped (run on a detached worktree of HEAD because agents were mid-edit in the main tree).
- 2026-09-06 · baseline f5ccfcef · `make check` equivalent: console eslint/tsc/vitest/depcruise green; entrant eslint/typecheck/vitest 885 green; ruff clean; import-linter 15/15 kept; pytest 2323 passed / 72 skipped.
- 2026-09-06 · package 03 (conflict recovery + counts) · `.venv/bin/pytest tests/backend -n auto` 2380 passed/72 skipped; `.venv/bin/ruff check apps/api/src tests/backend` clean; `lint-imports` 15/15 kept; `npm --prefix apps/console run test:run` 235 files / 2072 tests passed; `npx tsc -b apps/console` clean; `npm run lint:scheduler` 0 errors/134 pre-existing warnings; `npm run depcruise` 0 errors/16 pre-existing warnings; `make generate-api` diffed and accepted. See reports/03-conflicts.md.

## Decisions taken by the orchestrator (Kyle to confirm or overrule)

- 2026-09-06: moved the two v3 PDFs out of repo root into the gitignored `docs/screenshots/ui-review/reviewed-v3/`.
- 2026-09-06: committed the Codex v2 remediation as baseline f5ccfcef (precedent: 7cc638c2 for the v2 books) after the full gate went green with one type-declaration fix.
- 2026-09-06: wave 1 = packages 01, 02, 05, 06 in parallel with disjoint file scopes; 03/04 follow once the 02 contract is ruled; 09 follows 02 + 06.
- 2026-09-06: the missing second-pass review + mockup are not blocking; plan §3 is used as the ruling on their content.
