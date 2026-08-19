# SP-REORG-1 — repository reorganization

**Branch:** `dev/reorg-1` (off `main` at `e58a3c8`)
**Read at session start. Update at session end.**

Physical layout only: `apps/` + `packages/` + `infra/`, backend vertical slices,
console renames, a Diátaxis pass on the docs, and one new gate (import-linter).
The program changes ~zero runtime behaviour. Any diff that changes business
logic, API contracts, DB schema, or a test assertion beyond a path is out of
scope and is a violation.

| Phase | What | State |
| --- | --- | --- |
| 0 | Audit + baseline | **Complete** 2026-08-19 |
| 1 | `apps/` + `packages/` + `infra/` | **Complete** 2026-08-19 |
| 2 | import-linter contracts (before any backend move) | Not started |
| 3 | Backend vertical slices | Not started |
| 4 | Console finishing pass (`products`→`modules`, `utils`→`lib`, `settings`→`engine-config`) | Not started |
| 5 | Docs: Diátaxis quadrants + one history home | Not started |
| 6 | Vocabulary ADR + program report + CLAUDE.md | Not started |

---

## Owner rulings

These were decided at the gates and override the program prompt where they conflict.

| # | Question | Ruling |
| --- | --- | --- |
| R1 | Branch base — `main` was 279 commits behind `feat/p7-public-entrant` | Merge p7 into `main` first, branch `dev/reorg-1` off the merged tip |
| R2 | Branch name vs `CONTRIBUTING.md` ("avoid `dev/*`") | `dev/reorg-1` as written |
| R3 | Tests that encode repo paths as literal strings or read files off disk | In scope; path strings are path updates, not behaviour changes |
| R4 | Backend `src/` semantics | `src/` is a **sys.path root**, not a package: `from meet.schedule import …`, never `src.meet…` |
| R5 | `scheduler_core` folder naming | Nest: `packages/scheduler-core/scheduler_core/` |
| R6 | `shared/non-scheduling-keys.json` destination | `packages/shared-contract/` |
| R7 | `data/` + `secrets/` when compose moved | Repo root, mounts rewritten to `../../` |
| R8 | Product `Makefile` + `pyproject.toml` | Fold both into the repo root |
| R9 | `docker-compose.release.yml` project name | Pin explicitly as `shuttleworks-release` |
| R10 | `docs/nginx.conf` | Move to `infra/nginx/` with the other two; rename to say which surface each serves |
| R11 | Compose project `btp` | Rename to `shuttleworks*` |

---

## Phase 0 — audit (complete)

Baseline at `248cfc2`, all green:

| Gate | Baseline |
| --- | --- |
| eslint | **0 errors**, 115 warnings |
| `tsc -b` + `typecheck:entrant` | pass |
| vitest (console) | 196 files / 1756 tests |
| depcruise (console) | 0 errors, **16 warnings**, all `no-cross-product` |
| ruff | pass |
| pytest | **1648 passed, 66 skipped, 0 failed** |
| `docker compose config` | all six parse |
| `docs:build` | pass |
| OpenAPI | 99 paths, 163 schemas, `sha256 249beb24…4767836f` |

**Two baselines the program prompt asserted do not exist.** It named "~56
pre-existing eslint errors" (there are zero) and a "psycopg2 `test_config`
pytest failure" (`tests/unit/test_config.py` passes all 8). The tree was fully
green going in, so there is no failure budget to preserve — any red is ours.

Cleanup done at the gate: 9 fully-merged local branches deleted (tip SHAs
recorded in the gate report), stale `origin/dev` deleted, and `docs/progress/`
committed — it was nav-linked but untracked, so `docs:build` passed only on the
machine that authored it and would have failed on a clean clone.

---

## Phase 1 — `apps/` + `packages/` + `infra/` (complete)

### Move map

| New | Old |
| --- | --- |
| `apps/console/` | `products/scheduler/frontend/` |
| `apps/entrant/` | `products/scheduler/entrant/` |
| `apps/api/` | `products/scheduler/backend/` |
| `packages/scheduler-core/scheduler_core/` | `scheduler_core/` |
| `packages/shared-contract/` | `products/scheduler/shared/` |
| `infra/compose/` | 6 × `docker-compose*.yml` + 3 × `.env.*.example` |
| `infra/nginx/console.conf` | `frontend/nginx.conf` |
| `infra/nginx/docs.conf` | `docs/nginx.conf` |
| `infra/nginx/security-headers.conf` | `frontend/security-headers.conf` |
| `tests/backend/` | `products/scheduler/tests/` |
| `tests/e2e/` | `products/scheduler/e2e/` |
| `simulator/`, `tools/`, `legacy/` | `products/scheduler/{simulator,tools,legacy}/` |
| `tools/` (merged in) | root `scripts/` |
| `Makefile`, `pyproject.toml`, `uv.lock` | `products/scheduler/…` |
| `apps/api/BACKEND.md`, `apps/console/FRONTEND.md` | `products/scheduler/…` |
| `docs/PRODUCT.md`, `docs/SCHEDULER.md` | `products/scheduler/{PRODUCT,README}.md` |

`products/` no longer exists.

### Evidence

| Check | Phase 0 baseline | After Phase 1 |
| --- | --- | --- |
| eslint | 0 errors, 115 warnings | **0 errors, 115 warnings** |
| vitest (console) | 196 files / 1756 tests | **196 / 1756** |
| vitest (entrant) | 35 files / 644 tests | **35 / 644** |
| depcruise (console) | 0 errors, 16 warnings | **0 errors, 16 warnings** |
| depcruise (entrant) | 0 violations | **0 violations** |
| ruff | pass | **pass** |
| pytest | 1648 passed, 66 skipped | **1648 passed, 66 skipped** |
| `docker compose config` | six parse | **six parse, six distinct names** |
| `docs:build` | pass | **pass** |
| OpenAPI | `sha256 249beb24…4767836f` | **byte-identical** |

Nothing grew, nothing shrank. The OpenAPI byte-identity is the strongest single
proof the API surface did not move.

**Remote CI green on all five jobs** (`dev/reorg-1`, run 32214593045) — including
`interaction-smoke`, which the program names as the canary for path breakage
because it builds the console, boots the API and drives the real UI.

**Full Docker stack booted and verified.** All four images build (`Successfully
built scheduler-core` from the nested distribution); containers come up as
`shuttleworks-local-*`; `/health` returns healthy; the SPA serves its bundle;
`/api/*` and `/e/*` both route correctly through the relocated
`infra/nginx/console.conf`; the docs container serves through
`infra/nginx/docs.conf`. Inside the container, the relocated `data/local.db`
mounts live with its real content (13 tournaments, 10 orgs) and
`services/config_lock` resolves `/packages/shared-contract/` with all 15 keys.

Ports :80 and :8000 are occupied on this machine, so the boot used the
documented `FRONTEND_HOST_PORT=8090 BACKEND_HOST_PORT=8600` overrides.

- `git log --follow` verified through the renames on seven files, including the
  two-step `frontend/nginx.conf` → `infra/nginx/console.conf` (19 commits kept).
- The `package-lock.json` diff is **19 lines, every one a path**, zero version changes.

### The five silent-breakage traps this phase defused

1. **`entrant-no-operator-frontend` would have become a no-op.** The depcruise
   rule matched the literal regex `[/\\]frontend[/\\]src[/\\]`. Renaming the
   directory to `console` makes it match nothing — the boundary gate keeps
   reporting zero violations forever while enforcing nothing. `boundaries.test.ts`
   plants a real violation and proves the rule still fires.
2. **`.gitignore` keyed on a directory name.** `**/frontend/node_modules/` and
   friends would have silently un-ignored thousands of files under the new name.
   Re-keyed on the `apps/` tier.
3. **`docker-compose.release.yml` had no `name:`.** Compose derived the project
   name from the containing directory — `products/scheduler` gave `scheduler`;
   `infra/compose` would have given `compose`, renaming every production
   container and orphaning any volume addressed by project name. Now stated.
4. **`services/config_lock.py` counted parent directories.** `parents[2]/"shared"`
   worked in the repo and in the image only because the Dockerfile copied the
   file to `/shared` — a path chosen to make that one index come out right in a
   flatter container tree. Replaced with a walk-up search, correct in both
   layouts; the image now mirrors the repo path.
5. **The local stack would have collided with production.** Renaming `btp` to
   `shuttleworks` clashes with the selfhost stack, which already uses that name.
   The local stack became `shuttleworks-local`; production was not touched.

### What only the gates could have caught

Four of these are invisible to a grep for the old path, because none of them
contains the old path. They are path *arithmetic*, not path *text*.

- **Both `tailwind.config.js` files** scanned `../../../packages/design-system`,
  one level too far up from `apps/*`. Every class used only inside a shared
  component would have silently stopped being emitted. Caught by
  `entrant/tests/design-system.test.ts`.
- **Two console contract tests** (`emDashContract`, `motionContract`) count
  levels to the repo root. One needed one fewer, the other one more.
- **Six entrant tests** read real files off disk — the compose directory, API
  source, design-system CSS.
- **The backend suite's own package name.** 32 imports say `from tests._helpers
  import …`, which resolved only while that directory *was* the `tests`
  package. It is now `tests/backend`. Added a `tests/__init__.py` and rewrote
  the prefix to `tests.backend`, so the import path mirrors the directory path
  again. (Rejected the alternative: with no marker, pytest names the package
  `backend` — a top-level module called `backend` in a repo whose service is
  called `api`.)
- **`tests/e2e/global-setup.ts`** derived the compose directory as its own
  parent. Those are no longer the same place; it now names `infra/compose`.
- **`simulator/tournament_sim/server.py`** spawns the ephemeral API subprocess
  with `cwd=parents[2]/"backend"`. Repointed and verified to resolve.
- **`docs/SCHEDULER.md`** carried nine GitHub-relative links that only worked
  from its old home, and moving it into `srcDir` made the dead-link gate fail.
  Excluded from the site alongside `tech-stack.md` until Phase 5 quadrants it.

### Two mistakes made and corrected during the phase

- **`npm install` re-resolved dependencies** and gave `apps/console` a nested
  vitest 3.2.7 against root's 3.2.6. Two module identities meant
  `@testing-library/jest-dom` augmented the wrong one and `tsc -b` lost every
  matcher type. A dependency version change is out of scope: the lockfile was
  reverted and rewritten path-only, then `npm ci`.
- **Two repo-root path constants were miscounted** (`emDashContract`,
  `motionContract`). Both read real files off disk, so they failed loudly at
  collect time rather than passing vacuously — the good failure mode.

### Left for later, deliberately

- `uv.lock` has no consumer anywhere in the tree (`uv` appears only in dated
  2026-05/06 session records). Moved rather than deleted; **debt**.
- `apps/api/app/paths.py` has **zero importers**. Untouched; **debt**.
- `tools/docs-freshness.mjs` maps an area to
  `src/app/workspace/workspaceNav.ts`, which moved to `platform/product-shell/`
  before this program. Pre-existing staleness, left alone so it is not confused
  with reorg damage; **debt**.
- The `tests/backend/` internal shape still mirrors the old flat backend. It
  mirrors the new packages in Phase 3, once they exist.
- `docs/PRODUCT.md` and `docs/SCHEDULER.md` are ungoverned until Phase 5.

### Environment notes for the next session

- **codanna must be re-indexed** — every indexed path changed. The server was
  stopped during this phase because `codanna serve --http --watch` holds an open
  handle on the source tree and blocks `git mv` on Windows.
- A host `uvicorn` and the `btp` Docker stack were also stopped for the same
  reason. The API now starts from `apps/api`, and compose needs an explicit
  `-f infra/compose/<file>` (or just use the root `make` targets).
