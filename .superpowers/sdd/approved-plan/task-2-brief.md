# Task 2: Developer-loop and test-tier optimization

## Goal

Add a fast local feedback tier while preserving `make check` as the complete compatibility gate, and remove repeated dependency installation from e2e test invocations.

## Scope

- `Makefile`
- root `package.json`
- `apps/entrant/package.json`
- entrant Vitest configuration files
- existing script/Makefile contract tests under `apps/entrant/tests/`
- `tests/e2e/tests/10-entrant-r11-evidence.spec.ts` for the duplicated CSP navigation only

## Requirements

1. TDD: first extend an existing script/contract test so it fails for the missing commands/targets. Record the red command/output in the report.
2. Keep `make check` full. Implement it as an alias/dependency of `check-full`; do not reduce any command currently run by `make check`.
3. Add `check-fast` containing:
   - console lint, `tsc -b`, full console Vitest, console depcruise;
   - entrant lint, typecheck, pure/unit Vitest, entrant depcruise;
   - Ruff, API import-linter, and `pytest tests/backend/unit -m 'not slow'`;
   - the existing advisory docs-freshness output.
4. Split entrant tests into explicit `test:unit` and `test:ssr` scripts/configurations. The SSR set is exactly the 19 files that call `createServer(...)` today; the unit set is every other `tests/**/*.test.ts`. Keep SSR `fileParallelism: false` and the existing 60-second timeouts. `test:run` must still run every entrant test.
5. Add root pass-through scripts `test:entrant:unit` and `test:entrant:ssr`.
6. `test-e2e`, `test-e2e-rebuild`, and `test-e2e-dev` must no longer run `npm install`. `test-e2e-install` remains the explicit dependency/browser bootstrap.
7. In the entrant CSP e2e case, fetch each page once and reuse that response's headers for both assertions; preserve every assertion and page in the matrix.
8. Update `make help` and relevant current test documentation touched by these commands. Do not edit `docs/history/**`.
9. Do not change CI coverage or production code in this task.

## Verification

- Focused contract test red then green.
- `npm run test:entrant:unit`
- `npm run test:entrant:ssr`
- `npm run test:entrant`
- `npm --prefix apps/console run test:run`
- `make -n check`, `make -n check-full`, `make -n check-fast` inspection proving full parity and fast scope.
- ESLint/typecheck for touched workspaces.

## Report

Write `.superpowers/sdd/approved-plan/task-2-report.md` with files changed, red/green evidence, timing evidence, compatibility notes, and commit SHA. Commit the task on the current branch. Do not spawn subagents.
