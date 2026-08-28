# Task E2E Report

## Outcome

The browser tier now has two explicit owners and no wildcard-discovered stale
specs:

| Workflow | Owner | Runner |
| --- | --- | --- |
| Public entrant layout, IA, CSP and headers | `10-entrant-r11-evidence.spec.ts` | `test-e2e` / `test-e2e-rebuild` on managed compose, or `test-e2e-dev` after `make full-dev` |
| Operator/Operations interactions, viewer lockout and public display | `interaction-smoke.spec.ts` | CI prepared fixture via `test:interaction-smoke` |

## Deletion Map

Retired audited stale specs: `00-sanity`, `02-inline-roster`,
`03-auto-generate-matches`, `04-solve-happy-path`, `05-drag-reschedule`,
`06-persistence`, `07-schedule-xlsx-import`, `08-suggestions-inbox`, and
`99-baseline-screenshots`.

Removed stale-only consumers: `fixtures/server-state.ts`, `fixtures/seed.ts`,
and `fixtures/schedule-full-rebuild.xlsx`. `rg` found no maintained consumer
for any of them. Backend/unit coverage remains unchanged and owns the behavior
formerly exercised by the deleted workflow specs.

## Display Successor

`seed-smoke.mjs` now emits `displayToken=<token>` for the owner fixture. CI
passes it as `SMOKE_DISPLAY_TOKEN`. Interaction smoke requires the token and
visits `/display?token=...`, asserting seeded live match content, no operator
editing chrome, and the deterministic `display-link-invalid` terminal state for
an invalid token.

## Contract Evidence

Red, before implementation:

```text
npm --prefix apps/entrant run test:unit -- tests/launch-scripts.test.ts
1 failed: expected e2e test:entrant-evidence script, received undefined
```

Green, after implementation:

```text
npm --prefix apps/entrant run test:unit -- tests/launch-scripts.test.ts
9 tests passed
```

The contract pins the two maintained spec files, exact package scripts, the
three Makefile runner recipes, required smoke inputs, seed token output, and
CI token wiring.

## Verification

- `npm run test:entrant-evidence -- --list`: 9 tests listed.
- `SMOKE_TID=dummy SMOKE_DISPLAY_TOKEN=dummy SMOKE_VIEWER_TID=dummy npm run test:interaction-smoke -- --list`: 17 tests listed.
- `SMOKE_TID=dummy npm run test:interaction-smoke -- --list`: failed fast with `SMOKE_DISPLAY_TOKEN is required`.
- `npx tsc --noEmit -p tests/e2e/tsconfig.json`: passed.
- `npm run lint:entrant`: passed.
- `ruff check tests/e2e`: passed.
- `git diff --check`: passed.
- `npm run docs:build`: passed.

## Limitation

The prepared backend, harness-enabled console preview, and Chromium stack for
interaction smoke were not available in this worktree, so the smoke was not
executed. CI-shaped listing and fail-fast checks were run instead. The entrant
spec was listed successfully; the managed compose execution remains the
appropriate full-stack verification for that owner.

## Commit

Commit SHA: `e8513579`
