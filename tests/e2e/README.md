# e2e — Playwright tests

The maintained browser suites have explicit product contracts rather than a
generic click crawler:

| suite | validates | runner |
|---|---|---|
| entrant evidence | public layout, IA, CSP and security headers at real widths | `tests/e2e/tests/10-entrant-r11-evidence.spec.ts` against compose/local dev |
| console browser contracts | canonical Taipei/Korea data, live courts and queue, Plan grid, published Display, viewer lockout | `tests/e2e/tests/console-browser-contracts.spec.ts` against an isolated migrated SQLite database |

Unit tests remain the fast logic layer. Browser contracts cover composition
that mocked stores cannot prove, but they interact only with named controls and
observable outcomes. The retired interaction crawler pressed a changing set of
controls, swallowed detached-click failures, used stale routes, and could pass
with the wrong fixture; it is intentionally not a gate.

## Console browser contracts

From the repository root:

```bash
bash tests/e2e/run-console-contracts.sh
```

The runner owns the complete lifecycle:

1. creates a temporary SQLite database;
2. migrates it to Alembic head and runs `alembic check`;
3. starts the API with the local-only test clock at
   `2026-07-31T05:15:00+00:00`;
4. uses the canonical simulator to seed only T029 Taipei Open and T030 Korea
   Masters;
5. creates and accepts Taipei's viewer invite through supported HTTP APIs;
6. checks SQLite integrity, foreign keys, exact workspace IDs, and exact table
   counts;
7. builds/serves the console with the runtime error harness and runs Playwright;
8. stops both servers and deletes the temporary database.

It never reads or writes `data/local.db`, the demo Postgres volume, or a
committed database file. Set `CONSOLE_FIXTURE_KEEP=1` only while diagnosing a
failure; the runner prints the temporary directory it retained.

The canonical fixture assertions are deliberately non-vacuous:

- Taipei has six courts, six playing matches, a 24-match concrete queue, a
  court-by-time Plan, 50 results, and a public bracket display.
- Korea has a complete 155-match draw and Setup data but no played results; at
  the test clock it is upcoming.
- The separate registered viewer sees Taipei only and cannot send a mutation.

## Entrant evidence

The entrant evidence suite is an explicit compose/dev verification run, not a
PR gate. The CI browser gate runs the console contract suite against its
isolated canonical fixture; it does not silently substitute for entrant
evidence. Run entrant evidence when changing the public tier, nginx ingress,
security headers, or production-shaped images:

```bash
make test-e2e-install   # one-time browser install
make test-e2e           # managed compose stack
make test-e2e-rebuild   # rebuild images first
make full-dev
make test-e2e-dev       # use local dev origins
```

## Environment variables

| variable | default | effect |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost` | console origin under test |
| `E2E_PLAY_BASE_URL` | `http://localhost:8081` | entrant origin |
| `E2E_MANAGE_STACK` | `1` | set `0` when the runner already owns the stack |
| `E2E_REBUILD` | `0` | rebuild compose images |
| `E2E_KEEP_STACK` | `0` | retain the managed compose stack |
| `CONSOLE_FIXTURE_KEEP` | `0` | retain the disposable console fixture for diagnosis |
| `CONSOLE_CONTRACTS_SKIP_BUILD` | `0` | reuse an existing console build locally |

## Layout

```text
tests/e2e/
├── global-setup.ts
├── global-teardown.ts
├── playwright.config.ts
├── prepare-console-fixture.py
├── check-console-fixture.py
├── run-console-contracts.sh
└── tests/
    ├── 10-entrant-r11-evidence.spec.ts
    └── console-browser-contracts.spec.ts
```
