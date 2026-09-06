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
| 07 typography/spacing/states | P1 | in progress | — |
| 04b display consolidation | P0 | in progress | — |
| 08, 10–28 | — | not started | — |

## Gate log

(append: date · command · result)

- 2026-09-06 · HEAD 6f347dd9 (packages 01, 02, 03, 04a, 05, 06, 09) · full gate: console 235 files / 2072 tests, tsc, eslint, depcruise 0 errors; entrant 51 files / 897 tests, typecheck, lint; ruff clean; import-linter 15/15; pytest 2383 passed / 72 skipped (run on a detached worktree of HEAD because agents were mid-edit in the main tree).
- 2026-09-06 · baseline f5ccfcef · `make check` equivalent: console eslint/tsc/vitest/depcruise green; entrant eslint/typecheck/vitest 885 green; ruff clean; import-linter 15/15 kept; pytest 2323 passed / 72 skipped.
- 2026-09-06 · package 03 (conflict recovery + counts) · `.venv/bin/pytest tests/backend -n auto` 2380 passed/72 skipped; `.venv/bin/ruff check apps/api/src tests/backend` clean; `lint-imports` 15/15 kept; `npm --prefix apps/console run test:run` 235 files / 2072 tests passed; `npx tsc -b apps/console` clean; `npm run lint:scheduler` 0 errors/134 pre-existing warnings; `npm run depcruise` 0 errors/16 pre-existing warnings; `make generate-api` diffed and accepted. See reports/03-conflicts.md.

## Decisions taken by the orchestrator (Kyle to confirm or overrule)

- 2026-09-06: moved the two v3 PDFs out of repo root into the gitignored `docs/screenshots/ui-review/reviewed-v3/`.
- 2026-09-06: committed the Codex v2 remediation as baseline f5ccfcef (precedent: 7cc638c2 for the v2 books) after the full gate went green with one type-declaration fix.
- 2026-09-06: wave 1 = packages 01, 02, 05, 06 in parallel with disjoint file scopes; 03/04 follow once the 02 contract is ruled; 09 follows 02 + 06.
- 2026-09-06: the missing second-pass review + mockup are not blocking; plan §3 is used as the ruling on their content.
