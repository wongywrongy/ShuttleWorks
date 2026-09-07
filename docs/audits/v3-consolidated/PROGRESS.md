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
| 27 evidence + recapture | P0 | done · 27a closure record 0e3a60f8; 27b recapture complete (this session) — 83/87 findings closed, 1 closing (V3-OC24.2, physical signage pending), 3 open (organizer/production-only, non-P0) | closure.md, runtime-findings.md, reports/27b-recapture.md |
| 28 consistency + brand seam | P2 | done · 51d4b3cf | reports/28-consistency.md |
| 16 venue-board publishing | P1 | done · ae9a07d3 | reports/16-venue-board.md |
| 29 structured sides on the wire | P1 (post-closure) | done · see git log — V3-10-1/10-2/11-1/11-3 retired, no import-linter ignore | reports/29-structured-sides.md |
| 30 short entry reference | P1 (post-closure) | done · see git log — V3-24-1 retired, no UUID fallback | reports/30-short-reference.md |


## Plan gates

- **Gate A** — **met.** Packages 01–06, 04b and 15 are committed; the same-fixture
  publication/privacy/conflict assertions were re-run clean in 27b's fixture pass.
- **Gate B** — **met**, one item physical. Packages 09, 10, 11 committed with the
  MC-01…MC-13 fixtures asserted on both tiers; the visual non-overlap/200%-zoom check
  package 27 owed is now proven by `console-a11y.spec.ts`/`entrant-a11y.spec.ts`'s
  zoom + full-name-access assertions (entrant 88/88; console 20/23, the 3 failures
  unrelated — `V3-RT-1`) plus 27b's visual review of the draw/bracket/schedule
  surfaces. The signage name-size floor (V3-OC24.2) still needs on-hardware validation.
- **Gate C** — **met.** Packages 12–24 are ALL committed (24 landed since this table was
  last updated); the journey script proves sign-up → verify → enter → receipt and reset,
  and 27b additionally drove the same journey through the browser end-to-end for a fresh
  account. Display projects only, unchanged.
- **Gate D** (Phase D completion, plan §2 — not a formally numbered gate in the plan
  text but stated as a phase) — **met**, three items open pending organizer/production
  input, none P0. See `closure.md` section (d) for the full verdict and evidence.

Full detail, evidence references and the two runtime findings surfaced while verifying
these gates: `closure.md` section (d), `runtime-findings.md`, `reports/27b-recapture.md`.

## Gate log

(append: date · command · result)

- 2026-09-06 · Wave 3 (packages 29 structured sides, 30 short entry reference) · full gate after one shared `make generate-api`: console 255 files / 2266 tests, tsc, eslint 0 errors, depcruise 0 errors; entrant 54 files / 1046 tests, typecheck, lint, depcruise clean; ruff clean; import-linter 15/15 (no new allowance); pytest 2440 passed / 72 skipped; `docs:build` clean. `npm run docs:paths` reports 70 missing path references, ALL pre-existing at e4ac9144 (72 then; the four this session introduced were fixed before commit) — see the follow-up docs pass.
- 2026-09-06 · Wave 2 (post-closure debt sweeps: V3-1, V3-2, V3-07-2/3/4, V3-16-1, V3-10-3, V3-13-2, V3-26-7, V3-26-5) · full gate: console 255 files / 2258 tests, tsc, eslint 0 errors, depcruise 0 errors; entrant 54 files / 1040 tests, typecheck, lint, depcruise clean; test:contrast, test:classes; ruff clean; import-linter 15/15; pytest 2422 passed / 72 skipped. `inkContract.test.ts` is now a codebase-wide scan. Ten debt rows retired.
- 2026-09-06 · FINAL · HEAD after 27b · `make check` on a detached worktree: console 256 files / 2260 tests, tsc, eslint, depcruise 0 errors; entrant 54 files / 1029 tests, typecheck, lint, depcruise; test:contrast, test:classes, figma:tokens:check; ruff; import-linter 15/15; pytest 2420 passed / 72 skipped; tools tests 43/43. CI console job on the shared fixture: console-browser-contracts 7/7, console-a11y 23/23; entrant-a11y 88/88.

- 2026-09-06 · HEAD a0a273f7 (packages 01–28 including 26b; work package 27b recapture) · `tools/fixture-up.sh` (defects pass + account journeys): fixture defects (a)-(g) verified, 10/10 account-journey checks verified; `tests/e2e/run-console-contracts.sh`: console-browser-contracts 7/7, console-a11y 20/23 (3 unrelated failures, stale `setup-strip` locator against a now-`ready` Setup·Dates section — `V3-RT-1`, debt-logged, not fixed here as `console-a11y.spec.ts` is outside this package's file scope); `entrant-a11y.spec.ts` 87/88 full run + 1/1 isolated re-run (dev-server contention timing, not a defect) = 88/88 effective; `make surface-books-fixture` 33 console + 39 entrant surfaces, 0 failed viewports; 17 supplementary successful-journey screenshots (operator create-workspace wizard to completion, a real open-entry submission + receipt, real mailed verify/reset tokens, authenticated My entries). `findings.json`: all 87 `afterEvidence` populated; 5 findings (PE35–39) closed against package 24 (landed since 27a, `8e07b9ea`+`d08f1bb3`); final tally 83 closed / 1 closing / 3 open (all P1, non-blocking). Zero product code changes were needed — no defect the recapture found had a one-line fix. See `reports/27b-recapture.md`.
- 2026-09-06 · HEAD d08f1bb3 (packages 01–28 except 26b/27b) · console 256 files / 2260 tests, tsc, eslint, depcruise; entrant 53 files / 967 tests, typecheck, lint; ruff; import-linter 15/15; pytest 2419 passed / 72 skipped after registering the pkg 24 allow-list flag; figma-tokens regenerated. Two stale console browser-contract expectations fixed (Venue board link label; Korea readiness — a real timezone bug in pkg 13's session-window check).
- 2026-09-06 · HEAD 6f347dd9 (packages 01, 02, 03, 04a, 05, 06, 09) · full gate: console 235 files / 2072 tests, tsc, eslint, depcruise 0 errors; entrant 51 files / 897 tests, typecheck, lint; ruff clean; import-linter 15/15; pytest 2383 passed / 72 skipped (run on a detached worktree of HEAD because agents were mid-edit in the main tree).
- 2026-09-06 · baseline f5ccfcef · `make check` equivalent: console eslint/tsc/vitest/depcruise green; entrant eslint/typecheck/vitest 885 green; ruff clean; import-linter 15/15 kept; pytest 2323 passed / 72 skipped.
- 2026-09-06 · package 03 (conflict recovery + counts) · `.venv/bin/pytest tests/backend -n auto` 2380 passed/72 skipped; `.venv/bin/ruff check apps/api/src tests/backend` clean; `lint-imports` 15/15 kept; `npm --prefix apps/console run test:run` 235 files / 2072 tests passed; `npx tsc -b apps/console` clean; `npm run lint:scheduler` 0 errors/134 pre-existing warnings; `npm run depcruise` 0 errors/16 pre-existing warnings; `make generate-api` diffed and accepted. See reports/03-conflicts.md.

## Decisions taken by the orchestrator (Kyle to confirm or overrule)

- 2026-09-06: moved the two v3 PDFs out of repo root into the gitignored `docs/screenshots/ui-review/reviewed-v3/`.
- 2026-09-06: committed the Codex v2 remediation as baseline f5ccfcef (precedent: 7cc638c2 for the v2 books) after the full gate went green with one type-declaration fix.
- 2026-09-06: wave 1 = packages 01, 02, 05, 06 in parallel with disjoint file scopes; 03/04 follow once the 02 contract is ruled; 09 follows 02 + 06.
- 2026-09-06: the missing second-pass review + mockup are not blocking; plan §3 is used as the ruling on their content.
- 2026-09-06: post-closure tidy-up approved by Kyle in three waves — Wave 1 (this bookkeeping pass: debt-log/closure/plan/runtime-findings normalization); Wave 2 (small debt sweeps: V3-07-2/07-3/1/2, V3-16-1/10-3/13-2/26-7, with V3-26-5 decided as "cap the day count"); Wave 3 (two numbered packages: 29 puts structured sides on the wire for V3-10-1/10-2/11-1/11-3, 30 adds a short entry reference for V3-24-1). PR to main follows the waves; signage physical validation (V3-OC24.2) stays open on main.
