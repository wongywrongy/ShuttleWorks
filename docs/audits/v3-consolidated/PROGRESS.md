# ShuttleWorks v3 consolidated plan — PROGRESS

Program started 2026-09-06. Authority: `shuttleworks-v3-consolidated-plan.md` (repo root). Findings source: the two v3-reviewed surface books, kept gitignored at `docs/screenshots/ui-review/reviewed-v3/` with extracted text under `text/`. The second-pass review (`shuttleworks-v3-second-pass-review.md`) and the HTML MatchCard mockup it references are NOT on disk; plan §3 records every decision taken on them and is treated as the authority for those.

Role split: Claude (Fable) orchestrates — classifies, briefs, rules, reviews. Subagents implement and run gates. Nothing is closed without recorded acceptance evidence (plan §7 closure record).

## Baseline

- Branch `feat/surface-book-remediation`. The Codex v2 remediation (128 files, uncommitted at program start) is the working baseline; `make check` on it failed only on a missing `filterNoun` declaration in `apps/entrant/public/assets/entrants-filter.d.ts` (fixed 2026-09-06).
- Gate record for the baseline: see "Gate log" below.

## Package status (plan §1)

| Pkg | Priority | Status | Evidence |
|---|---|---|---|
| 01 fixture | P0 | wave 1 in progress | maps/01-fixture.md |
| 02 contracts | P0 | wave 1 in progress (docs only) | maps/02-04-contracts.md |
| 03 conflict recovery + counts | P0 | mapped; waits on 02 | maps/02-04-contracts.md |
| 04 public projection | P0 | mapped; waits on 02–03 | maps/02-04-contracts.md |
| 05 false claims | P0 | wave 1 in progress | maps/05-06-copy-contrast.md |
| 06 contrast + hierarchy | P0 | wave 1 in progress | maps/05-06-copy-contrast.md |
| 09 MatchCard spec | P0 | not started | — |
| 07–08, 10–28 | — | not started | — |

## Gate log

(append: date · command · result)

- 2026-09-06 · baseline f5ccfcef · `make check` equivalent: console eslint/tsc/vitest/depcruise green; entrant eslint/typecheck/vitest 885 green; ruff clean; import-linter 15/15 kept; pytest 2323 passed / 72 skipped.

## Decisions taken by the orchestrator (Kyle to confirm or overrule)

- 2026-09-06: moved the two v3 PDFs out of repo root into the gitignored `docs/screenshots/ui-review/reviewed-v3/`.
- 2026-09-06: committed the Codex v2 remediation as baseline f5ccfcef (precedent: 7cc638c2 for the v2 books) after the full gate went green with one type-declaration fix.
- 2026-09-06: wave 1 = packages 01, 02, 05, 06 in parallel with disjoint file scopes; 03/04 follow once the 02 contract is ruled; 09 follows 02 + 06.
- 2026-09-06: the missing second-pass review + mockup are not blocking; plan §3 is used as the ruling on their content.
