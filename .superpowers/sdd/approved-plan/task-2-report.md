# Task 2 Report: Developer-loop and test-tier optimization

## Files changed

- `Makefile`
- `package.json`
- `apps/entrant/package.json`
- `apps/entrant/vitest.config.ts`
- `apps/entrant/vitest.unit.config.ts`
- `apps/entrant/vitest.ssr.config.ts`
- `apps/entrant/vitest.test-files.ts`
- `apps/entrant/tests/launch-scripts.test.ts`
- `tests/e2e/tests/10-entrant-r11-evidence.spec.ts`
- `apps/entrant/README.md`
- `docs/how-to/running-locally.md`

No production application code or `docs/history/**` files were changed.

## Red/green evidence

The focused contract test was extended before implementation and run red:

```text
$ /usr/bin/time -p npm --prefix apps/entrant run test:run -- tests/launch-scripts.test.ts
FAIL: 3 failed, 4 passed (7 tests)
  - explicit entrant test tiers were undefined
  - `check: check-full`, `check-full`, and `check-fast` were absent
  - e2e targets still contained `npm install`
real 0.89
```

After implementation, the same focused command was green:

```text
PASS: 1 file, 7 tests
real 0.54
```

## Verification and timings

| Command | Result | Wall time |
| --- | --- | ---: |
| `npm run test:entrant:unit` | 18 files, 392 tests passed | 7.64s |
| `npm run test:entrant:ssr` | 19 files, 372 tests passed | 32.33s |
| `npm run test:entrant` | 37 files, 764 tests passed | 38.63s |
| `npm --prefix apps/console run test:run` | 205 files, 1,868 tests passed | 46.62s |
| `npm run lint:entrant` | passed | 2.45s |
| `npm run typecheck:entrant` | passed | 2.89s |
| `make -n check` | passed; same commands as `check-full` | <1s |
| `make -n check-full` | passed | <1s |
| `make -n check-fast` | passed; unit entrant tests and non-slow backend unit tests | <1s |

The SSR and full entrant runs emit the pre-existing environment warnings from
React Router/Vite (`EPERM` for the HMR WebSocket and `EMFILE` watcher warnings)
and still exit successfully. Those warnings were documented rather than used
as a reason to weaken the tier or its tests.

## Compatibility notes

- `make check` remains a dependency alias of `check-full`; its complete command
  sequence is unchanged.
- `check-fast` keeps console lint/type/full Vitest/depcruise, entrant
  lint/typecheck/unit Vitest/depcruise, Ruff, API import-linter, and the
  non-slow backend unit suite, followed by advisory docs freshness output.
- `test:run` still discovers all entrant tests. The SSR config explicitly lists
  the 19 current `createServer(...)` files, inherits `fileParallelism: false`
  and both 60-second timeouts, and the unit config excludes exactly that list.
- `test-e2e-install` remains the explicit dependency/browser bootstrap;
  `test-e2e`, `test-e2e-rebuild`, and `test-e2e-dev` no longer install on every
  invocation.
- The entrant CSP matrix preserves every page and assertion while reusing one
  navigation response per page.
- CI coverage and production behavior were not changed.

## Review fixes

The contract suite was strengthened after review:

- `check-full` and `check-fast` are parsed into isolated recipe command arrays;
  required commands are matched as exact normalized lines, so `pytest` cannot
  satisfy a `pytest tests/backend/unit ...` requirement by substring.
- Entrant unit/SSR scripts now assert their exact config filenames. The SSR
  list is compared dynamically with every entrant test containing an actual
  `createServer({ ... })` call, and the discovered unit complement is checked
  as a complete disjoint partition. The contract currently verifies 19 SSR and
  18 unit files.
- Each e2e target is required to have a nonempty recipe and a Playwright test
  command before the no-`npm install` assertion runs.

For mutation/red evidence, `npm --prefix apps/entrant run test:run --
tests/launch-scripts.test.ts` was run after temporarily removing the
`npm run depcruise` line from `check-full`. It failed with 2 tests failing: the
isolated full-recipe assertion reported the missing line, and the dynamic SSR
oracle initially caught the contract test's own literal matcher. The recipe
line was restored and the matcher narrowed to actual `createServer({ ... })`
calls. The focused suite then passed `8/8` in `0.54s`; entrant lint passed in
`1.83s` and entrant typecheck passed in `2.61s`.

## Commit

Initial implementation commit SHA: `91352364`

Review-fix commit SHA: `28b58b00`

The report is committed separately as a Task 2 documentation commit so this
report can record the implementation SHAs without a self-referential hash.
