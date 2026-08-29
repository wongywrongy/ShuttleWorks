# Task 8 report: full verification and measured closeout

## Result

Task 8 is complete. The performance/code-health branch passes the complete
local product gate, both maintained browser owners, production builds,
deployment-configuration validation, deterministic scheduler characterization,
and SQLite/Postgres persistence parity on the Linux development host.

The comparable `origin/main` and branch measurements below were taken on the
same Threadripper host from independent real dependency trees under `/tmp`.
They do not compare this server with Task 1's older machine.

## Environment

- Ubuntu 24.04.4, x86-64.
- AMD Threadripper PRO 5945WX: 12 cores / 24 threads; 125.6 GiB RAM.
- Node 24.11.0 and npm 11.6.1.
- Python 3.12.3 in the repository-local `.venv`.
- Docker 29.6.1 and Compose 5.3.0.
- Playwright 1.59.1 with cached Chromium/headless-shell revision 1217.

No system package or sudo command was required.

## Complete product gate

`PATH=.venv/bin:<managed-node-24>/bin:$PATH make check` passed:

- Console ESLint: 0 errors; 116 existing warnings.
- Console TypeScript build: passed.
- Console Vitest: 207 files / 1,870 tests passed in 23.26 s.
- Console dependency-cruiser: 0 errors; 16 recorded warnings.
- Entrant lint and React Router typecheck: passed.
- Entrant Vitest: 37 files / 767 tests passed in 57.65 s.
- Entrant dependency-cruiser: passed.
- Ruff: passed.
- API import-linter: 15 contracts kept, 0 broken.
- Backend pytest: 2,005 passed / 66 expected skips / 0 failed in
  1,404.96 s (23:24).
- Documentation checker: 10/10 passed.
- `docs:paths`: passed.
- VitePress production build: passed in 4.48 s.
- Freshness: all ten configured areas current.

The complete gate ran before the browser-only repair commit `2a8849b5`. The
affected post-commit gates were rerun proportionately: entrant lint, the ten
launch-contract tests, and both complete browser owners all passed.

## Same-host comparison

`origin/main` (`58cfb251`) and branch snapshot (`654cf115`) were extracted
with `git archive` into separate `/tmp/shuttleworks-task8-*` directories. Each
received its own real `npm ci --ignore-scripts --prefer-offline --no-audit
--no-fund` tree; no dependency directory was shared or symlinked. Frontend
numbers are medians of three wall-clock runs.

| Check | `origin/main` | Branch | Result |
| --- | ---: | ---: | --- |
| Console Vitest | 204 files / 1,840 tests / 23.40 s | 207 / 1,870 / 23.62 s | +30 tests; +0.94% time |
| Entrant Vitest | 37 files / 761 tests / 57.91 s | 37 / 767 / 57.83 s | +6 tests; -0.14% time |
| Backend pytest | 1,967 pass / 66 skip / 1,396.15 s | 2,005 / 66 / 1,404.96 s | +38 tests; +0.63% time |
| Console production build | 5,294 modules / 16.18 s | 5,294 / 16.00 s | -1.11% |
| Entrant production build | 4,727 client + 66 server modules / 4.76 s | 4,726 + 65 / 4.80 s | effectively flat |

The first isolated entrant timing attempt ran inside the syscall sandbox and
made the four nested dependency-cruiser contract tests fail identically on
both refs. It is not used above. All six official entrant runs were repeated
outside that sandbox: 3/3 green on each ref.

Largest production artifacts were effectively unchanged:

- Console: `exceljs` 936.99 kB / 270.75 kB gzip; UI vendor 235.52 kB;
  application index 213.09 kB on the branch versus 212.94 kB on main.
- Entrant: entry client 186.39 kB / 58.89 kB gzip; shared client chunk
  125.42 kB / 42.32 kB gzip; server bundle 185.46 kB.
- Entrant rendered-page budget: `/e/` 2.1 kB gzip,
  `/e/spring-open` 2.0 kB, `/e/spring-open/enter` 3.2 kB, and the
  eight-block entry form 3.7 kB. Every page passed the 4.4 kB CI ceiling and
  referenced zero client scripts.

Tracked Git blobs at closeout commit `2a8849b5`:

| Ref | Files | Bytes | MiB |
| --- | ---: | ---: | ---: |
| `origin/main` | 1,627 | 43,213,014 | 41.21 |
| Branch | 1,449 | 14,114,844 | 13.46 |

That is 178 fewer tracked files and 29,098,170 fewer bytes: a 67.34% tracked
size reduction. The final historical-plan prune reduces the branch further;
Git keeps all removed provenance.

## Backend query evidence

Task 4's deterministic SQL listeners and parity assertions record:

| Read path | `origin/main` structure | Branch |
| --- | ---: | ---: |
| Hydrate one bracket event | 4 bracket reads | 4 |
| Hydrate five bracket events | 16 bracket reads | 4 |
| Cold five-event GET | `1 + 3N` bracket reads | 4 |
| Cold five-event GET, total | approximately `4 + 3N` SELECTs | 7 observed |
| Entries event reads for 1 / 5 / 10 draws | 1 / 5 / 10 | 1 / 1 / 1 |

Serialized-field and ordering parity is asserted for the five-event cold GET.
Tournament listing is constrained by membership ids in SQL, with an empty-id
fast path and unchanged `(created_at, id)` descending order.

## Production and persistence verification

- Console and entrant production builds: passed in all six comparison runs
  per ref.
- `npm run docs:build`: passed.
- All six Compose files passed `docker compose -f <file> config -q` using the
  CI fail-fast environment. The self-host file emitted only the expected blank
  optional SMTP credential warnings.
- Scheduler golden masters:
  `test_backends_greedy_characterization.py`,
  `test_bridge_build_characterization.py`,
  `test_solve_job_determinism.py`, and `test_engine_build_order.py` — 36/36
  passed in 4.47 s.
- Postgres 16 parity with `TEST_POSTGRES_URL` over solve jobs, auth,
  membership, lease recovery, and worker startup — 140 passed / one
  explicitly dialect-inapplicable skip in 84.72 s. This closes Task 4's
  earlier host-only Postgres verification gap.

The temporary development stack was stopped and its SQLite/Postgres test data
removed. The ignored `data/` directory was restored empty and verified
writable by the API container's UID through Docker's user-namespace mapping.

## Browser evidence and repairs

### Managed entrant owner

`make test-e2e` uses the maintained 8090 / 8091 / 8092 host-port mapping.
The first successful stack boot exposed two stale owner assumptions:

1. readiness polled `/e/api/config`, a FastAPI route that could be healthy
   while entrant SSR still returned 502;
2. the test expected `frame-ancestors 'self'` even though the public-tier
   deployment deliberately enforces `frame-ancestors 'none'` and
   `X-Frame-Options: DENY`.

Commit `2a8849b5` now polls the real entrant `/e/health` endpoint and asserts
the deployed public security policy. The rerun passed 9/9 in 22.3 s, covering
both viewports, discovery and entry navigation, phase-gated tabs, CSP and
security headers, scoped Turnstile allowances, and the CSP violation watcher.
Compose teardown removed the stack.

### Interaction-smoke owner

The CI-equivalent harness used isolated SQLite, uvicorn on 8600, a production
console build with the error harness, Vite preview on 4173, and cached
Chromium. Its first run passed 16/17; the remaining assertion expected full
fixture names on a venue display whose intentional contract is surname-only.
The repaired exact labels passed with the complete owner:

- production harness build: 8.81 s;
- 13 interaction sweeps plus four real-store flows: 17/17 passed in 4.3 min;
- owner/viewer permissions, Operations transitions, and capability display
  all passed;
- no uvicorn, preview, Playwright, temp database, or ShuttleWorks container
  remained afterward.

## Review and known debt

The independent complete-diff review at `2a8849b5` found no blocker, high, or
medium issue and no
confirmed behavior, wire/schema, cache/query, gate, or documentation
regression. Its only findings were three trailing blank lines in active plan
records; commit `2a8849b5` removed them. A separate fresh-context browser
review independently confirmed the SSR readiness race and stale CSP
expectation before those repairs landed.

Known non-blocking output remains explicit:

- Vite reports the existing large `exceljs` chunk.
- Console dependency-cruiser reports the 16 recorded warnings.
- SQLAlchemy emits known concurrent-delete/reflection warnings.
- Production npm audit debt remains in `docs/reference/debt-log.md`:
  React Router and nanoid high advisories plus ExcelJS's transitive UUID
  moderate advisory. The current automatic fix has a peer-resolution conflict,
  so dependencies were not changed opportunistically.

## Commits

- Environment/tooling: `8c4e045a`.
- Backend read/cache optimization: `b4913e5f`, review fix `58e501ad`.
- Characterization/decomposition: `e327cc11`, `2704a50c`, report `2924a3a5`.
- Documentation distillation/prune: `c809825c`, `654cf115`.
- Browser-owner closeout repair: `2a8849b5`.
