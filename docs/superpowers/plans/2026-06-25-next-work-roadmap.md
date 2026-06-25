# Next-work roadmap (post-workspace-restructure)

_Authored 2026-06-25. Derived from the two research reports in this folder: `2026-06-25-codebase-audit.md` and `2026-06-25-module-architecture-modernization-design.md`. Sequenced by risk/value: cheap+safe first, big structural arcs last. Every phase keeps the suite green (frontend `npx tsc -b && npx vitest run && npm run build` from `products/scheduler/frontend`; backend `pytest` — 526 must stay green). Branch `dev/workspace-suite`, nothing pushed without sign-off._

## Context
The workspace-suite restructure (Hub redesign, global settings, left-sidebar IA, surface-collapse, Phase-B groundwork) is done and gate-green (310 vitest). Two independent reports converged on the same backend/structural debt. This roadmap turns that into ordered, shippable work. Phases 1–3 are immediately executable and low-risk; Phase 4 is the convergent "bigger bets" — each its own design + PR, not a single change.

---

## Phase 1 — Quick-win cleanup PR  *(S effort, high value, low risk — do first)*
One small PR. Backend + frontend; gate both.
- **SQLite WAL + busy_timeout + pool resize** — `backend/database/session.py:24–37`, `backend/app/main.py:184–189`. Add `connect_args` with `PRAGMA journal_mode=WAL` + `busy_timeout=5000`; `pool_size=20, max_overflow=0`. *Highest impact-per-effort in the audit.* Verify pytest (526) stays green + a manual concurrent-write smoke if practical.
- **Drop `react-force-graph-2d`** — `frontend/package.json:39` (zero imports).
- **Delete dead files** (re-confirm zero imports with grep first): `frontend/src/utils/importers.ts`, `frontend/src/utils/exporters.ts`, `frontend/src/lib/rosterMigration.ts`.
- **Tidy single-source-of-truth** — drop `export` on file-internal `isOvernightSchedule()`/`getAdjustedEndMinutes()` (`lib/time.ts`); replace the private `getMatchPlayerIds()` (`utils/constraintChecker.ts:42–48`) with the authoritative `trafficLight.ts` one.
- **Radix deps** — `npm ls @radix-ui/react-*`; remove only confirmed direct-and-unused (leave transitives). *Verify, don't delete blind.*

## Phase 2 — Solver event-loop fix  *(M effort, high value, backend)*
- Wrap the 5 blocking solver calls in `loop.run_in_executor` mirroring the existing correct pattern at `api/schedule.py:220`: `api/schedule.py:94–98`, `api/schedule_repair.py:315`, `api/schedule_warm_restart.py:139`, `api/schedule_proposals.py:365,396`. Preserve signatures.
- Bundle the cancellation guard: pass a `CancelToken` + progress callback to the non-streaming `/schedule` (as the streaming route does at `schedule.py:170,229–230`).
- Verify pytest green + a concurrency smoke (a solve must not freeze a parallel `/health`).

## Phase 3 — Additive module descriptors  *(M effort, locks boundaries, test-green by construction)*
Implement the **additive-only** layer from the module-architecture design (NOT the slice moves it explicitly rejected):
- New `frontend/src/platform/contracts/moduleContract.ts` — types + four honest descriptors (meet/bracket/display/operations) declaring owned routes, consumed endpoints, produced/consumed DTOs, named existing edges.
- A **read-only route-introspection test** asserting ownership against the already-built app + referential identity of `apiClient` methods (no string-matching, no control-plane cross-check).
- **Zero edits** to `app/main.py`, `api/tournaments.py`, `store/uiStore.ts`; no slice extraction, no router changes. Builds on the Phase-B `OperationalMatch` view-model already landed (`lib/operations/operationalMatch.ts`).

---

## Phase 4 — Bigger bets  *(L effort — each its own design + PR; sequence matters)*
Both reports converged here. Order chosen so each unblocks the next.
1. **Retire the legacy `:8765`-ported bracket backend** (`api/brackets.py`, "PR 3") **bundled with its perf debt** — the N+1 hydration (`_hydrate_session`, bulk-load → 4 queries) and the double-serialization on writes live entirely in this file, so fix them as one arc, not twice. Also folds in normalizing the `tournaments.data` JSON blob. *Prereq for Bracket as a clean module.*
2. **Extract Operations as a first-class product** — first DECIDE + document in `PRODUCT.md`: installable module vs. always-on cross-cutting concern. Then (if separate) create `products/operations/`, move `meet/{control-center,director,liveOps}`, group backend under `services/operations/`. Gated by the module-contract direction.
3. **Tournament → Workspace rename** — phased with a dual-path deprecation shim: (1) entity + API routes, (2) frontend imports/routes, (3) store files/types (`tournamentStore.ts` → `workspaceStore.ts`, `TournamentStateDTO` → `WorkspaceStateDTO`). One tracked refactor; not piecemeal.

Opportunistic doc hygiene (do alongside the bet that touches it): `backend/adapters/README.md`, `frontend/src/platform/README.md`, `legacy/README.md`-or-delete, mirror `services/bracket/` substructure for the flat `services/match_state.py`.

---

## What we are NOT doing (and why)
- **No blanket lint fix** — 36 of 57 errors are `react-hooks/set-state-in-effect` flagging intentional patterns across 45 files; that's a real refactor, not cleanup. Scope the rule or do a deliberate per-file pass separately.
- **No full hybrid cross-engine Operations merge yet** — dual-dataset load + dual write-back + the Ops→Bracket advancement seam (`not-wired`) is real new runtime behavior; it gets its own PR with correctness/idempotency tests after the descriptors + legacy-bracket retirement land.
- **No control-plane edits** — Hub/signals/workspace_modules/Settings/Module Dock/shell stay off-limits (the design is additive precisely to avoid this).
- **Merge `dev/workspace-suite` → main** — user's decision (~135 commits ahead).

## Suggested execution order after compaction
Phase 1 → Phase 2 → Phase 3, each as its own gate-green commit. Then pause for a design pass on Phase 4.1 before starting it.
