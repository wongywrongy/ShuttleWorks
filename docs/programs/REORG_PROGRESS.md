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
| 2 | import-linter contracts (before any backend move) | **Complete** 2026-08-19 |
| 3 | Backend vertical slices | **Complete** 2026-08-19 |
| 4 | Console finishing pass (`products`→`modules`, `utils`→`lib`, `settings`→`engine-config`) | **Complete** 2026-08-19 |
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
| R1 (Phase 3) | The five modules three or more domains import | File by CONSUMERS, not history. New `shared/` package for cross-domain domain logic; `core/` for infrastructure. `adapters/badminton`→`shared/sport`, `services/scheduling/params`→`shared/scheduling`, `services/email`→`core/email`, `services/turnstile`→`identity/`, the throttle→`core/throttle.py` by sanctioned cut-paste extraction |

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

---

## Phase 2 — import-linter contracts (complete)

Written against the **current flat layout**, deliberately before Phase 3 moves
anything. That ordering is the whole point: a seam map written after the move
would encode whatever the move produced.

`apps/api/.importlinter` — **11 contracts, 11 kept, 0 broken.**
Wired into `make check` (before pytest, so a boundary break reports in seconds
rather than after the ten-minute suite) and blocking in the CI backend job.
`import-linter>=2.13,<3` pinned in `apps/api/requirements-dev.txt`.

| # | Contract | Judges |
| --- | --- | --- |
| 1 | api > services > repositories > database | transitively |
| 2 | the shared kernel does not import the surfaces | transitively |
| 3 | `scheduler_core` knows nothing about the application | transitively, no allowances |
| 4 | **Operations does not reach into Bracket** (pinned absence) | transitively, no allowances |
| 5–11 | per-domain independence (operations, bracket, meet, entries, identity, display-as-leaf, ops) | directly |

**Direct vs indirect is a deliberate split.** Everything in the tree reaches
`database`, `repositories` and `app` — that is what a shared kernel is for — so
every domain is transitively connected to every other through it. A transitive
domain contract reports that as coupling, which it is not. The three contracts
where the question genuinely is "what does this drag in behind it" stay
transitive.

**The gate was falsified, not just run.** Planting
`from services import bracket` into `services/match_state.py` breaks contract 4
and nothing else; removing it restores 11/11 with a clean tree. A contract that
has never failed is not yet known to work.

### (a) Edges the seam map forgot — now documented, not fixed

The graph has 22 cross-domain edges. All are legitimate and named in the file.
The one that needed a ruling:

- **`api.entries_json -> services.auth` is not Entries depending on Identity.**
  The three symbols are `entries_key`, `throttle_check` and
  `throttle_record_entry` — the shared abuse throttle guarding the public submit
  path against a flood, which has nothing to do with who anyone is. It lives in
  the identity service only because that is where the first caller needed it.

### (b) Genuine leaks — allowed with `DEBT(REORG-1)`, code untouched

Four allowances, every one explained in the file. There are no unexplained
ignores.

- **L1 `app.form_csrf -> services.auth`** — the kernel's CSRF check resolves an
  operator session, opening its own `SessionLocal`. Either the check belongs
  above the kernel or `resolve_session` belongs below it.
- **L2 `repositories.local -> services.match_state`** — the repository applies a
  state transition inside the command transaction. The transaction boundary is
  genuinely at the repository and the transition table genuinely in the service,
  so this is not fixed by moving an import.
- **`services.solve_child -> api.schedule`** — the solve child re-enters the HTTP
  layer to reach the meet engine entry point, because `api/schedule.py` holds
  both the router and the problem-building call.

L1 and L2 are **function-local** imports. Deferring an import hides a cycle from
Python's import machinery, not from the architecture — which is why two edges
broke eight contracts on the first run, before they were declared.

### A Phase 1 trap this phase caught

`.gitignore` line 73 was `apps/`, commented "Old app folders (legacy)" — a rule
for a layout that has not existed for a long time. Choosing `apps/` as the new
application tier walked straight into it.

Nothing looked wrong: `git mv` keeps tracked files tracked, so all 783 moved
files stayed in the index. But every **new** file under `apps/` was invisible to
git. It surfaced only because `git add apps/api/.importlinter` refused — that is,
because this phase happened to create a file there. Had Phase 2 been docs-only,
the next person to add an API module would have committed a tree that does not
build, with a clean `git status` the whole way.

Removed, after verifying that `.env`, `data/`, `__pycache__`, `node_modules`,
`dist` and `*.db*` under `apps/` are each covered by their own rules and were
not relying on it. Import-linter's graph cache was the one thing that was; it
has an explicit rule now.

### The Phase 3 finding this phase produced

**Five modules are imported by three or more domains**, and the program's
Phase 3 target files each of them under exactly one:

| Module | Program files it under | Actually imported by |
| --- | --- | --- |
| `adapters/badminton.py` | bracket | meet, bracket, solve_rail |
| `services/scheduling/params.py` | meet | meet, bracket |
| `services/email.py` | entries | identity, workspaces |
| `services/turnstile.py` | entries | identity |
| the throttle inside `services/auth.py` | identity | identity, entries |

Filing any of them under one domain makes every other consumer violate a
boundary that is not really there. They want a shared tier. **This is the open
ruling for the Phase 3 gate.**

---

## Phase 3 — backend vertical slices (complete)

`apps/api/src/` is now one package per domain, each owning **its routers and its
services together**. `src/` is a sys.path ROOT, not a package (R4), so imports
read `from meet.schedule import ...` and never `from src.meet...`.

```
core  shared  db  repositories  alembic
workspaces  identity  meet  bracket  operations  display  entries  solve_rail  ops
```

173 files moved. Five files were renamed, and only where a router and a service
collided inside one package: `auth_routes`, `entrants_routes`, `entries_routes`,
`match_state_routes`, `solve_jobs_routes`. Nothing else was renamed to match a
template.

### The oracles

| Oracle | Result |
| --- | --- |
| OpenAPI paths / schemas | **99 / 163 — unchanged** |
| OpenAPI structure ignoring description text | **identical** |
| OpenAPI description text | 12 lines differ, each explained below |
| Alembic head | **`v6a1c5e8f3b4`, 25 revisions — unchanged** |
| import-linter | **15 contracts, 15 kept, 0 broken** |
| ruff | clean |

**The 12 OpenAPI description diffs are all the same thing**: a docstring that
named a module this phase moved now names where it is. FastAPI publishes route
and model docstrings as `description`, so correcting a pointer is visible in the
schema. Every one:

`services.bracket.player_constraints`, `services.bracket.standings.StandingRow`,
`services.meet.standings.compute_meet_standings`,
`services.config_lock.changed_scheduling_fields`, `services/entrants.authenticate`,
`app/config.py`, `app.form_csrf.form_csrf_proves`, `app.main` (×2),
`api/tournaments.py`, `api/entries_public.py` (×2), `services/bracket/response_cache.py`.

The alternative was to keep the old text and publish twelve pointers to files
that no longer exist. Routes, schemas, status codes, parameters and every other
field are byte-identical.

### The throttle extraction (ruling R1, the one sanctioned code split)

`entries_key`, `throttle_check`, `throttle_record_entry` moved to
`core/throttle.py`. Two things travelled with them because the moved bodies call
them and moving them was the only way to keep those bodies unedited:

- `throttle_record_attempt` — the counting engine all five throttle families
  share. Leaving it in identity would have made `core` import `identity`.
- `_utcnow` / `_aware` — to `core/time_utils.py`, keeping their leading
  underscore precisely so no call site inside a moved body changed.

**Verification: all seven moved bodies are byte-identical to their pre-move
source**, checked by parsing both files and comparing `ast.get_source_segment`
output. The KEY NAMESPACES stayed in `identity/auth.py`, because what matters
about them is a property of the SET — every namespace must be disjoint from
every other — and that is only reviewable where the list is.

The Phase 2 allowed edge (a) is **deleted**, not retained: `entries` no longer
imports `identity` for throttling.

### Contract 12, and its falsification

`shared/` only works while the arrow points one way. Contract 12 forbids
`shared` from naming any domain, transitively and with no allowances.

Falsified as required: planting `from bracket import brackets` into
`shared/scheduling/params.py` breaks **contract 12 alone** (14 kept, 1 broken);
removing it restores 15/15 on a clean tree.

### What the gates caught that reading would not have

- **`solve_runner` spawns `python -m services.solve_child` as a STRING.** No
  import rewriter sees that. The program named this trap; it was real.
- **Two `sys.modules.get("app.exceptions")` runtime lookups** — a dict key, not
  an import. Behaviour survived either way (a miss falls through to a fresh
  import) but the key had to name the real module to keep doing its job.
- **Four modules each counted parent directories to the same two places**, and
  did not agree on how (`parents[1]` in one, `parent.parent` in another). Every
  one moved a level deeper, changing what those counts meant without changing
  the counts. They are now `SRC_ROOT` / `API_ROOT` / `ALEMBIC_*` in
  `core/paths.py`, counted once. That file previously had **zero importers** and
  was logged as debt; it is now load-bearing, so that debt entry is closed by
  use rather than by deletion.
- **A prose sweep over docstrings over-matched twice** — it rewrote `app.` on
  the FastAPI *instance* (`app.include_router`) and mangled the ENTRANT tier's
  own `app/lib/*.server.ts` paths, which never moved. Caught by ruff (113
  undefined names) and by the OpenAPI oracle respectively. Both reverted
  precisely; the lesson is that a regex over prose cannot tell a package named
  `app` from a variable named `app`.

### Still true after Phase 3

The `conftest.py` sys.path insert survives, reduced from two entries to one
meaningful one. It cannot go to zero while the suite imports the API by bare
package name — which is exactly what the API does to itself. **The shadow-package
hazard IS gone**: the API's `app` package became `core`, so `apps/console/src/app`
is now the only `app` in the tree.

The three root leaks (L1 kernel→identity, L2 repository→operations,
L3 solve_child→meet) are unchanged and still declared. Fixing any of them moves
real logic.

---

## Phase 4 — console finishing pass (complete)

Three renames and one ratchet. No structural rethink: the console already had
the Bulletproof-React shape the industry converged on, and this finished it.

| New | Old | Files |
| --- | --- | --- |
| `src/modules/` | `src/products/` | 286 |
| `src/lib/{constraintChecker,matchUtils,trafficLight}` | `src/utils/*` | 7 |
| `src/platform/engine-config/` | `src/platform/settings/` | 8 |

**`modules/` is the product's own word.** ADR 0001 calls them modules; so do
`ModuleId`, `moduleContract.ts`, `buildWorkspaceNav`, `MODULE_ORDER` and the
backend's `MODULE_IDS`. `products/` was the last survivor of a layout that had
two products in it, and it had been contradicting every other layer for months.

**`utils/` merged into `lib/`** because two drawers with no rule for which one to
open is worse than one drawer. The rule is now written down in `CODE_HEALTH.md`
§1b as a four-row table keyed on consumer count, so "where does this go" stops
being a judgment call.

**`platform/settings/` became `platform/engine-config/`.** There were two things
called settings — the engine configuration form and the `settings` MODULE (the
workspace's Settings tabs) — and nothing named which was which. There turned out
to be no written gotcha note to delete: the ambiguity lived in the names, and
renaming is what removes it.

### The depcruise ratchet

The old rule warned on every cross-module edge, which meant a coupling
introduced today looked exactly like a two-year-old one nobody had ruled on. A
warning that cannot tell those apart is a number, not a signal.

Two rules over one boundary now:

| Rule | Severity | Scope |
| --- | --- | --- |
| `no-cross-module` | **ERROR** | any edge from a file not named in `KNOWN_CROSS_MODULE` |
| `no-cross-module-debt` | WARN | the three known clusters, enumerated by source |

The sixteen existing edges are unchanged and still warn — clearing them is a
design decision (debt-log D3, ADR 0011), not a path update. Retiring a cluster
means fixing its edges and deleting its line; **the list is the ratchet and it
only shortens.**

**Falsified:** planting `meet -> display/publicDisplay/courtLanes` into
`MeetProduct.tsx` produces `1 error, 16 warnings`; removing it restores
`0 errors, 16 warnings` on a clean tree.

One bug caught in the ratchet itself: written without a capture group in
`KNOWN_CROSS_MODULE`, the debt rule's `^src/modules/$1/` exclusion had nothing to
bind to, so it reported every INTERNAL import those six files make — 51 warnings
instead of 16. A boundary rule that over-reports is as useless as one that
under-reports; the module name is captured in every entry now, and the comment
says why.

### ADR 0013 — shared-UI promotion policy

Drafted (Proposed). A component lives at the lowest tier that has all its
consumers: one module, then the app's shared layer, then
`packages/design-system` once a second APP needs it. Promote by MOVING, never by
copying; promote on the second consumer, not in anticipation of one; demote when
consumers disappear; no new barrel files.

The enforcement is the ratchet above plus `entrant-no-operator-frontend`, which
holds the app-level half — the entrant tier may not reach into the console at
all, so `design-system` is the only thing the two tiers can share.

### Entrant re-verification (Phase 1 boundaries still hold)

| Check | Result |
| --- | --- |
| `depcruise:entrant` | **0 violations** (83 modules, 190 dependencies) |
| entrant suite | **35 files / 644 tests** |
| server-only boundary (`react-router build`) | builds; 1 server asset cleaned |
| page-weight budget | **PASS** — 2.1 / 2.2 / 3.4 / 3.9 KB against a 4 KB ceiling, **zero client JS** |

### Gates

eslint **0 errors, 115 warnings** · tsc clean · vitest **196 files / 1756 tests** ·
depcruise **0 errors, 16 warnings** · docs:build green. All baseline.
