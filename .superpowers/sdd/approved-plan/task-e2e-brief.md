# Task E2E: Retire stale browser specs and make ownership explicit

## Goal

Reduce the browser suite to executable, current workflows without losing unique
behavioral coverage, and make each maintained suite's runner/fixture ownership
explicit.

## Scope

- `tests/e2e/tests/`, stale-only fixtures, and e2e package/config/docs
- `tests/e2e/interaction-sweep/seed-smoke.mjs`
- interaction-smoke display coverage
- Makefile/root scripts and their contract tests
- `.github/workflows/ci.yml` interaction-smoke wiring
- current e2e/running-locally/debt documentation; no `docs/history/**`

## Requirements

1. TDD/contract-first. Add or extend a test that pins the maintained spec set,
   explicit runner commands, and the absence of retired specs before deletion.
   Record red evidence.
2. Delete these audited stale specs after preserving their ownership rationale
   in current docs: `00-sanity`, `02-inline-roster`, `03-auto-generate-matches`,
   `04-solve-happy-path`, `05-drag-reschedule`, `06-persistence`,
   `07-schedule-xlsx-import`, `08-suggestions-inbox`, and
   `99-baseline-screenshots`. Delete fixtures/helpers only when `rg` proves no
   maintained consumer.
3. Retain `interaction-smoke.spec.ts` as the CI-owned operator/Operations suite
   and `10-entrant-r11-evidence.spec.ts` as the compose/scheduled entrant suite.
4. Replace the public-display coverage lost with `00-sanity` by extending the
   current interaction fixture/smoke:
   - seed and output the workspace display capability token;
   - CI passes it explicitly;
   - visit the current `/display?token=...` composition, assert live match
     content and absence of operator editing chrome/actions;
   - cover invalid-token terminal UI if the existing component exposes it
     deterministically. Keep this small and current.
5. Make local runner ownership explicit:
   - `make test-e2e` and rebuild run only the entrant evidence spec against the
     managed compose stack;
   - `test-e2e-dev` targets that same entrant spec at the documented console and
     entrant dev origins and names the correct prerequisite (`make full-dev`);
   - add explicit package scripts for entrant evidence and interaction smoke;
   - interaction smoke remains the CI/prepared-fixture path and must fail fast
     without its required IDs/tokens.
6. Update script/Make contract tests to prevent wildcard discovery from
   reintroducing stale specs or accidentally running interaction smoke without
   fixtures.
7. Update current docs with a workflow-to-owner table and correct paths/serial
   execution. Remove stale historical references from current docs rather than
   preserving dead runbooks. Do not edit `docs/history/**`.
8. Do not weaken backend/unit coverage that owns the deleted specs' behavior.

## Verification

- Focused contract red then green.
- Playwright `--list` for entrant and interaction scripts.
- Existing launch-script tests.
- E2E TypeScript/lint or `ruff` checks used by the repo.
- `npm run docs:build`.
- Run the interaction smoke only if its prepared stack is available; otherwise
  rely on CI-shaped `--list` plus the later root browser verification and state
  that limitation in the report.

## Report

Write `.superpowers/sdd/approved-plan/task-e2e-report.md` with deletion map,
successor ownership, red/green evidence, verification, limitations, and commit
SHA. Commit the task. Do not spawn subagents.
