> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Module-Contract Modernization — Design

_Generated 2026-06-25 (branch dev/workspace-suite) by a read-only research workflow: 5 parallel mappers (module contract, frontend state, backend routes, cross-module seams, module internals) -> synthesize -> adversarial review -> revise. The reviewer caught control-plane touches + stale-behavior assumptions in the draft; this is the revised, additive-only design._

# Module-Contract Modernization Design — ShuttleWorks Scheduler (Rev. 2)

**What changed in this revision.** The review correctly showed that the v1 plan, despite its "modernize-not-rewrite" framing, *did* mutate the control plane and *did* depend on behavior that no longer exists. Rev. 2 removes every such move. The corrected thesis is stronger and narrower:

> **We make module ownership a typed, test-enforced layer of *additive* descriptors and read-facades. We move zero existing slices, edit zero existing routers, and add zero dependencies to any router. Nothing that exists today is re-wired; ownership is established by new files that reference the existing seams.**

This means: **no edit to `app/main.py`, no edit to `tournaments.py`, no edit to `uiStore.ts`, no `require_module_enabled`, no slice extraction, no emit-call insertion, no cross-store bridge, no `models/` package.** Every one of those was a control-plane touch, a behavior change, or a test-perturbation flagged by the review. They are gone. What remains is purely additive and behavior-preserving, keeping 316 vitest + 526 pytest green by construction (nothing they exercise is modified).

---

## 0. Review resolution map (every item)

| Review item | Resolution |
|---|---|
| **G1** `register_module` drops `_AUTH_DEP` | **Removed.** `app/main.py` is not edited at all. No `register_module`, no router re-wrap. Ownership is documented by descriptors and asserted by a **read-only** route-introspection test against the already-built app. Auth wiring is untouched, so auth tests can't flip. |
| **G2** Meet "owns /state" contradicts mechanism (handlers in `tournaments.router`) | **Removed.** `/state` PUT/GET stays in `tournaments.py` and is **not** claimed by Meet. The §4 ownership table now only assigns routers that are *already their own file/router instance* (`brackets.py`, `match_state.py`, `commands.py`, `schedule*`). `/state` is explicitly listed as **shared/control-adjacent, unassigned**. |
| **G3** Stale map: `bracketDataReady` is `BracketTab`-internal; `disruptionSummary` has zero readers; TabBar removed | **Corrected & de-constrained.** The "preserve a shell-read selector" constraint is deleted — there is no shell reader to preserve. `bracketDataReady` is documented as Bracket-internal. `disruptionSummary` is documented as **dead state** (left in place, untouched, flagged for separate cleanup — out of scope). |
| **G4** Cross-store re-export shim under-specified; `getState()` readers uncovered | **Eliminated by design.** We **do not move any slice**, so there is no shim and no cross-store bridge. Ownership is expressed by additive **read-facade hooks** that `select` from the existing store. `getState()` call sites keep working because the store is unchanged. |
| **G5** Frontend contract test is brittle string-matching | **Redefined.** Descriptors reference **imported symbols** (actual `apiClient` method references and route-constant strings the client already exports), not free-form strings. The test asserts referential identity and TS-compile-time `produces/consumes` typing — see §6. |
| **G6** `models/{meet,bracket,operations}.py` ambiguous second import root | **Removed.** No `models/` package. ORM stays solely in `database/models.py`. |
| **G7** `operationsContract` aspirational (`consumes` with no producer; Seam C unwired) | **Made honest.** Descriptors encode **only what exists.** `operations.consumes` lists the DTOs it actually reads off the wire today; Seam C advancement is marked `status: 'not-wired'` and is **out of scope** (see §3, Seam C). |
| **R1** Seam C is genuinely NEW runtime behavior | **Out of scope.** Documented as a *future* behavior-change PR with its own correctness/idempotency tests. This design only *names the gap*; it ships no call to `/bracket/results`. |
| **R2** `emitModuleEvent` perturbs `setSchedule` spies/snapshots | **Removed.** No emit calls inserted into any store action. Seam events are documented as **the existing store-subscription / poll edges**, named in descriptors only. No runtime helper, no insertion. |
| **R3** Non-blocking `require_module_enabled` still mutates dep list / OpenAPI | **Removed entirely.** No router dependency is added anywhere. Zero OpenAPI delta. |
| **R4** 14 `matchStateStore` importers churn | **De-risked.** The facade is **additive and optional**; existing imports stay valid forever (store unmoved). Migration is opportunistic, not required, and never in a slice-delete PR. |
| **R5** Repository facades change handler DI | **Made additive-only.** `MeetRepository`/`BracketRepository`/`OperationsRepository` are **new thin read-views over existing sub-repos, not injected into existing handlers.** Existing handlers keep calling `repo.matches/.brackets/.commands`. Facades exist for new code/tests and documentation. Optional/deferred. |
| **TB / CP touches** (main.py, tournaments.py, uiStore.ts edits; data→control coupling; displayContract cross-check) | All sources removed: no edits to those three files; no data→control dependency edge; descriptor test is **self-contained** and never cross-checks against `ModuleId`/`workspace_modules` to validate `enableable`. |

---

## 1. Two-tier module model (unchanged, and now the *only* thing the descriptors encode)

- **Tier 1 — Control-plane modules** (`meet`, `bracket`, `display`): have a `workspace_modules` row, a `ModuleId`, a Dock tile, enablement, dependency/seed tests. **Off-limits.** Not touched, not extended, not cross-checked at runtime.
- **Tier 2 — Architectural modules**: code-ownership boundaries, no enable flag. **Operations** is the load-bearing Tier-2 module (owns `matchStateStore`, command queue, `match_state.py` + `commands.py`). "Operations disabled" is not a real state; it is *defined as* "no enabled operational source (meet or bracket)." Degradation is upstream (no source) + downstream (Display tolerates stale/empty).

"**Domain events**" in this design are the **existing store-subscription and poll edges** (`scheduleFinalized`, `resultRecorded`, `matchStateChanged`), named for documentation. They are emphatically **not** the control-plane `WorkspaceSignalsDTO`, and this design never adds an emit call or a bus.

---

## 2. Module Interface Definition — additive descriptors, no runtime registry

New file `src/platform/contracts/moduleContract.ts` (**new types + descriptor objects only; imported by a test; never imported by app runtime paths**).

```ts
import type { ModuleId } from '../product-shell/types';

/** Tier-2 ids extend ModuleId with 'operations'. Type import only — no
 *  runtime read of workspace_modules / ModuleId vocabulary. */
export type ArchModuleId = ModuleId | 'operations';

/** A DTO type name that crosses the wire today (documentation reference). */
export type DtoName = string;

export interface ModuleContract {
  id: ArchModuleId;
  /** Literal flag. Operations=false. The TEST asserts the literal only;
   *  it does NOT validate this against workspace_modules/ModuleId. */
  enableable: boolean;

  /** Route-path constants this module's OWN router instance serves.
   *  These reference strings the api client already exports (see §6). */
  ownedRoutePrefixes: readonly string[];
  /** Endpoints this module reads but does not own. */
  consumedRoutePrefixes: readonly string[];

  /** DTOs this module produces / consumes ON EXISTING SEAMS — honest only. */
  produces: readonly DtoName[];
  consumes: readonly DtoName[];

  /** Named existing edges (store-subscription or poll). Documentation. */
  emits: readonly string[];
  reactsTo: readonly string[];
}
```

Four honest descriptors:

```ts
export const meetContract: ModuleContract = {
  id: 'meet', enableable: true,
  ownedRoutePrefixes: ['/schedule', '/tournaments/{id}/schedule'],
  consumedRoutePrefixes: ['/tournaments/{id}/state'],   // shared, not owned
  produces: ['ScheduleDTO'],
  consumes: ['TournamentConfig', 'PlayerDTO[]', 'MatchDTO[]', 'MatchStateDTO'],
  emits: ['scheduleFinalized'],          // = tournamentStore.setSchedule edge
  reactsTo: [],
};

export const bracketContract: ModuleContract = {
  id: 'bracket', enableable: true,
  ownedRoutePrefixes: ['/tournaments/{id}/bracket'],
  consumedRoutePrefixes: [],
  produces: ['BracketTournamentDTO', 'PlayUnitDTO', 'AssignmentDTO', 'ResultDTO'],
  consumes: ['BracketCreateIn', 'EventIn', 'ResultDTO'],
  emits: ['drawGenerated'],
  reactsTo: [],                          // advancement is intra-bracket today
};

export const operationsContract: ModuleContract = {
  id: 'operations', enableable: false,
  ownedRoutePrefixes: ['/tournaments/{id}/match-states', '/tournaments/{id}/commands'],
  consumedRoutePrefixes: ['/tournaments/{id}/bracket'], // reads bracket assignments
  produces: ['MatchStateDTO'],
  consumes: ['ScheduleDTO', 'BracketTournamentDTO'],     // both read off the wire today
  emits: ['matchStateChanged'],          // = match-state write edge
  reactsTo: ['scheduleFinalized'],       // = store subscription seeding live layout
};

export const displayContract: ModuleContract = {
  id: 'display', enableable: true,
  ownedRoutePrefixes: [],                // read-only; owns no route
  consumedRoutePrefixes: ['/tournaments/{id}/state', '/tournaments/{id}/bracket',
                          '/tournaments/{id}/match-states'],
  produces: [],
  consumes: ['TournamentStateDTO', 'MatchStateDTO', 'BracketTournamentDTO'],
  emits: [],
  reactsTo: ['matchStateChanged'],       // via its independent poll
};
```

`displayContract` duplicating the `display` identity is intentional and **safe** because the §6 test never cross-references descriptors against `ModuleId`/`workspace_modules` to validate `enableable`. It asserts the *literal* and the *route prefixes*, nothing control-plane.

**No backend `_module_router.py`, no `ModuleRouter` Protocol, no `register_module`.** That entire sketch is deleted (G1). Backend ownership is documented by a parallel descriptor + read-only test (§4, §6).

---

## 3. Cross-Module Seams as Explicit Contracts (named, not re-wired)

Each seam keeps its exact transport. We **name** the typed payload and the existing edge. **No emit call is inserted anywhere** (R2).

### Seam Meet → Operations
- **Transport (unchanged):** sync write `useSchedule → tournamentStore.setSchedule` + 5s match-state poll (`useLiveTracking`).
- **Typed payload:** `ScheduleDTO { assignments }` → Operations seeds live layout; `MatchStateDTO` via poll.
- **Named edge:** `scheduleFinalized` = the *existing* store-subscription on `schedule`. Operations already `reactsTo` it via its selector. We name it in the descriptor; we do **not** add an emit to `setSchedule`.
- **Degradation (Meet disabled):** no new schedule injected; Operations preserves last `matchStates`/schedule; poll continues read-only.

### Seam Bracket → Operations
- **Transport:** 2.5s poll of `GET /bracket`.
- **Typed payload:** `BracketTournamentDTO`; Operations consumes `AssignmentDTO` as live layout.
- **Named edge:** `drawGenerated`.
- **Degradation (Bracket disabled):** 404, `useBracket` returns null; live surface renders empty (already first-class).

### Seam Operations → Bracket (advancement) — **OUT OF SCOPE, documented gap only (G7, R1)**
- **Honest current state:** advancement is **intra-Bracket**. `POST /bracket/results → record_result()` materializes the winner. Operations results on a bracket-origin match do **not** feed advancement; there is **no** cross-module call today.
- **What this design does:** records the gap in `operationsContract` as `reactsTo: ['scheduleFinalized']` (no `resultRecorded→bracket` edge claimed) and in `bracketContract` as `reactsTo: []`. The descriptor test therefore asserts only what exists.
- **Explicitly deferred:** wiring an Operations bracket-origin finish to call `POST /bracket/results` is **new cross-module runtime behavior** and belongs in a separate behavior-change PR with its own correctness/idempotency tests. It is **not** part of this modernization.

### Seam Operations → Display
- **Transport:** 10s `GET /state` + 5s match-state poll; bracket display 10s `GET /bracket`.
- **Typed payload:** `TournamentStateDTO` + `MatchStateDTO` (meet) or `BracketTournamentDTO` (bracket). Display `produces` nothing.
- **Named edge:** `matchStateChanged` = existing match-state write; Display reacts via its independent poll (we name the pull; we add no push).
- **Degradation:** `LiveStatusPill` already degrades live → reconnecting → offline by sync age; empty `matchStates` renders blank, no crash.

---

## 4. Per-Module State Ownership — read-facades over *unmoved* stores

**Principle (corrected): do not move, do not extract, do not shim. Wrap with additive facades.** Every store keeps its file, identity, and every slice. Ownership is a naming/typing layer of new hooks that `select` from the existing store. This makes the highest-churn and most test-coupled steps of v1 disappear:

- `uiStore.ts` is **not edited** (it holds shell slices — editing it is editing the shell store, CP-touch). No solver/proposal/bracket-UI slice is extracted from it.
- `tournamentStore.ts` persistence blob is **not split** (would break save/restore pytest).
- `matchStateStore.ts` is **not moved** and **not duplicated** (single `create<>()` preserved — the 14 importers' shared-identity assumption holds, R4/TB).

| Slice(s) | Owner | Mechanism (additive only) |
|---|---|---|
| entire `matchStateStore` | **Operations** | New `useOperationsMatchState()` in `src/products/operations/state/` re-selects from the **existing** `useMatchStateStore`. Store unmoved; old imports valid forever. |
| `uiStore.solverHud / scheduleStats / generationProgress / isGenerating / generationError / solverLogs` | **Meet (solver)** | New `useMeetSolver()` selects these from `uiStore`. **`uiStore` untouched.** |
| `uiStore.activeProposal / advisories / suggestions / pendingAdvisoryReview / unlockModalState / pendingPin / lastValidation` | **Meet (workflow)** | New `useMeetWorkflow()` selects from `uiStore`. Untouched. |
| `uiStore.bracketDataReady / bracketSelectedMatchId / bracketScheduleEventFilter` | **Bracket** | New `useBracketUi()` selects from `uiStore`. `bracketDataReady` is **Bracket-internal** (read+written only in `BracketTab`, via `getState()`); there is **no shell reader** to preserve (G3). The facade simply documents ownership; `getState()` keeps working because nothing moved (G4). |
| `uiStore.disruptionSummary` | **Meet** (dead) | **Zero readers** (G3). Left in place, untouched. Flagged for separate dead-code cleanup — out of scope here. |
| `tournamentStore.bracketPlayers / bracketRosterMigrated` | **Bracket** | `useBracketRoster()` read-facade. Field stays in the single persisted `TournamentStateDTO`. |
| `tournamentStore.config / players / matches / schedule / groups / scheduleIsStale / isScheduleLocked / scheduleVersion / scheduleHistory` | **Meet (data)** | `useMeetData()` read-facade. Persistence unified, unchanged. |

**Shell slices stay in `uiStore`, untouched and unwrapped:** `activeTab`, `activeTournamentId/Kind/Status`, `persistStatus`, `lastSavedAt`, `lastSaveError`, `toasts`.

**Why facades, not extraction:** the review's getState()/cross-store-bridge gap (G4) and the "uiStore is the shell store" CP-touch only arise if slices *move*. By never moving them, both vanish, and the migration becomes additive: a component opting into `useMeetSolver()` is a pure import swap with identical runtime semantics, shippable one component at a time, with no shim to forget.

---

## 5. Backend Route & Repository Ownership — documentation + additive views, no re-wiring

**Goal restated:** give each module's *already-isolated* router a documented home and an additive repository view — **without editing `app/main.py`, without editing `tournaments.py`, without adding any router dependency.**

### Ownership table (only routers that are already their own instance)
| Module | Owns (existing router files) | Notes |
|---|---|---|
| **Meet** | `schedule.py` + `schedule_*` family | These are already separate routers. |
| **Bracket** | `brackets.py` | Already isolated. |
| **Operations** | `match_state.py`, `commands.py` | Already separate routers. |
| **Display** | none (read-only) | Owns no route. |
| **Shared / unassigned** | `tournaments.py` incl. `/state` PUT/GET, members, invites; `workspace_modules.py`; `workspace_signals.py` | **`/state` is NOT assigned to Meet** (G2). It coexists with control-plane CRUD in `tournaments.router` and is left as a shared, unowned surface. |

### Mechanism (all additive)
1. **Documentation descriptor, not router re-wrap.** A backend `api/_module_map.py` declares the ownership table as data (module → owned router-prefix list). It is imported by a **read-only pytest** that introspects the already-built `app.routes` and asserts each owned prefix is present and served — **without** calling `register_module`, **without** editing `main.py`, and therefore with **zero** change to auth wiring or OpenAPI (G1, R3, TB).
2. **Repository facades are additive read-views, not injected.** `MeetRepository`/`BracketRepository`/`OperationsRepository` are new classes wrapping the **existing** `_Local*Repo` sub-repos. Existing handlers keep calling `repo.matches/.brackets/.commands` unchanged. Facades exist for new code and for the ownership test; no handler signature or DI changes (R5).
3. **No `require_module_enabled`, anywhere.** Adding it — even non-blocking — mutates each data router's dependency list and OpenAPI signature and creates a data→control dependency edge that does not exist today (R3, CP-touch). It is **removed from the design entirely.**
4. **No `models/` package** (G6). ORM stays in `database/models.py`. No re-export shims.
5. **`bracket_session` invariant** (`commit_tournament_state`) is a frozen zone — but since we don't touch `tournaments.py` or `/state` at all, this is preserved trivially, not by careful wrapping.

---

## 6. Tests — enforced invariants without runtime change

**Frontend contract test (G5, redefined).** `moduleContract.test.ts`:
- Imports the descriptors **and** the `apiClient` route-prefix constants the client already exports. Asserts every `ownedRoutePrefixes` / `consumedRoutePrefixes` entry is a prefix the client actually references — **referential**, not free-form string matching. When a route constant is renamed/removed, the test fails at the import/identity level, not on a fuzzy string compare.
- `produces`/`consumes` are checked at **TS compile time**: each `DtoName` is constrained to a union of the exported DTO type names (a `keyof`-style registry of existing types), so a typo or a removed DTO is a type error, not a runtime string mismatch.
- Asserts `operations.enableable === false` and that no descriptor claims a seam edge that isn't listed in the honest §3 set. **Does not** import `ModuleId`/`workspace_modules` values to validate `enableable` (CP-touch avoided).

**Backend ownership test.** Read-only introspection of `app.routes` asserting each owned prefix in `api/_module_map.py` is registered and reachable. Because `main.py` is unedited, this **cannot** drop auth or change registration (it only observes). It explicitly does **not** assert `/state` ownership by Meet (G2).

**Preservation guarantees (why 316 vitest + 526 pytest stay green by construction):**
- No store file is edited → all direct-import store tests, `getState()` readers, and `setSchedule` spies/snapshots are byte-identical (G4, R2, R4, TB).
- No `uiStore.ts`, `tournaments.py`, or `main.py` edit → no shell-store, CRUD, or route-registration/auth test can move (CP-touches gone).
- No router dependency added → no OpenAPI/handler-signature/dependency-introspection test can break (R3, TB).
- No persisted-blob split → save/restore/backup pytest unaffected.
- Repository facades additive, not injected → repo-level pytest calling `.matches/.brackets/.commands` unchanged (R5).
- New tests are purely additive (vitest +N, pytest +2: the FE contract test and the BE ownership test).

---

## 7. Incremental Migration Plan (ordered, each independently shippable & revertible)

**Phase 0 — Contracts as enforced documentation (zero runtime change)**
1. Add `src/platform/contracts/moduleContract.ts` + four honest descriptors + `moduleContract.test.ts` (referential + compile-time, §6).
2. Add `backend/api/_module_map.py` + read-only ownership pytest (introspects existing `app.routes`; no `main.py` edit).

**Phase 1 — Frontend read-facades (additive; no slice moves)**
3. `useOperationsMatchState()` re-selecting from the unmoved `useMatchStateStore`; migrate components opportunistically (old imports stay valid).
4. `useMeetSolver()` over `uiStore` solver slices (uiStore untouched).
5. `useMeetWorkflow()` over `uiStore` proposal/advisory/unlock/pin/validation slices.
6. `useBracketUi()` over `uiStore` bracket slices (documented Bracket-internal; no shell reader to preserve).
7. `useMeetData()` / `useBracketRoster()` read-facades over `tournamentStore` (no field moves).

**Phase 2 — Backend additive views**
8. `MeetRepository`/`BracketRepository`/`OperationsRepository` as additive wrappers over existing sub-repos (not injected into existing handlers).

**Phase 3 — Seam typing (documentation only)**
9. Confirm descriptor seam edges (`scheduleFinalized`, `drawGenerated`, `matchStateChanged`) match the existing store-subscription/poll edges via the contract test. **No emit call inserted.**

**Out of scope (separate PRs, not this design):**
- Seam C Operations→Bracket advancement (new runtime behavior — own correctness/idempotency tests).
- Any router re-grouping in `main.py`, any `require_module_enabled`, any `/state` reassignment, any `uiStore`/`tournamentStore` slice extraction, any `models/` package, removal of dead `disruptionSummary`.

Every step is additive and revertible; no step depends on a later one; no step edits a control-plane or shell file.

---

## 8. Risks + residual notes

- **Facade adoption drift.** Because facades are optional, a component could bypass `useOperationsMatchState()` and import `matchStateStore` directly. This is *acceptable*: the boundary is documented and the descriptor test guards the contract surface, not every call site. Enforcement (e.g. an ESLint import boundary) is a possible future, non-blocking step — not required here.
- **Dead `disruptionSummary`.** Confirmed zero readers; intentionally left untouched to keep this design behavior-preserving. Removal is a separate cleanup.
- **Descriptor honesty is load-bearing.** The descriptors must encode only existing seams; the §6 tests are written to fail if a descriptor claims an unwired edge (notably Seam C). This converts "honest map" from a promise into an invariant.

**Untouched by this design (control plane + shell + chrome):** `ModuleId`, `workspace_modules` table, `derive_modules`, `display_dependency_satisfied`, `normalize_module_seed`, `workspace_signals.build_signals`, `useWorkspaceModules`, `ModulesSettingsTab`, Module Dock, sidebar shell, `app/main.py`, `tournaments.py` (incl. `/state` and `commit_tournament_state`), `uiStore.ts`, `tournamentStore.ts` (file/persistence), `matchStateStore.ts` (identity), all router dependency lists/OpenAPI, and all visual design.

**Relevant anchor files:** `src/platform/product-shell/types.ts`, `src/platform/domain/moduleModel.ts`, `src/store/matchStateStore.ts`, `src/store/uiStore.ts`, `src/store/tournamentStore.ts`, `src/products/bracket/BracketTab.tsx`, `backend/app/main.py` (read-only reference), `backend/api/{schedule,match_state,commands,brackets,tournaments,workspace_modules}.py`, `backend/database/models.py`, `backend/repositories/local.py`.

---

## Adversarial review (resolved in the design above)

```json
{
  "gaps": [
    "register_module sketch drops auth: app/main.py:211-224 registers EVERY data router with dependencies=_AUTH_DEP ([Depends(get_current_user)]). The design's register_module(app, mod) does a bare app.include_router(mod.router) with no dependencies. Unless ModuleRouter carries and register_module forwards _AUTH_DEP, the 'pure regroup, same auth' claim is false and router-level auth is silently removed. Not specified in the Protocol (it has no auth-deps field).",
    "Meet 'owns /state PUT/GET' contradicts the Phase-2 grouping mechanism. Those handlers (tournaments.py:419-505) live inside tournaments.router together with control-plane CRUD (POST/PATCH/DELETE /tournaments), members, and invite-management. Phase-2 step 8 only wraps WHOLE existing router instances; tournaments.router is cross-cutting and cannot be assigned to 'Meet'. Giving Meet /state requires moving handler bodies out of tournaments.py — which the design explicitly defers ('without moving handler bodies first'). The §4 ownership table is unachievable under its own stated mechanism.",
    "Design is built on a stale map for shell-read coupling. It treats bracketDataReady and disruptionSummary as 'written by modules but read by shell chrome (TabBar)' and erects a control-plane-preservation constraint around them. Actual code: bracketDataReady is read only inside BracketTab.tsx:77 (self read+write via getState()); disruptionSummary has zero readers anywhere. The post-sidebar re-arch removed the TabBar. The mitigation 'keep a re-export selector the shell already reads' guards a reader that does not exist.",
    "Cross-store re-export shim under-specified. If a slice (e.g. bracketDataReady) moves to bracketUiStore but a consumer still calls useUiStore(s => s.bracketDataReady) or useUiStore.getState().bracketDataReady (BracketTab does the latter), a static re-export in uiStore cannot reflect live writes to the new store without uiStore subscribing to bracketUiStore (a cross-store bridge). The design hand-waves 'thin re-export shims' without specifying this bridge; getState() destructuring readers are not covered by selector re-exports.",
    "Frontend contract test is hand-wavy. 'Assert each descriptor's ownedRoutes/produces match the real client method names' compares server-relative route strings to client method names with no defined mapping. As written it is a brittle string-match that rots, not an enforced invariant; produces/consumes (DTO name strings) cannot be type-checked against runtime at all.",
    "models/{meet,bracket,operations}.py location is ambiguous and unanchored. There is no models package today; the real ORM is database/models.py. Introducing a top-level backend/models/ package (re-export shims) creates a second 'models' import root and is not wired to any existing import; benefit unclear, drift risk real.",
    "operationsContract is partly aspirational. Operations owns match_state.py + commands.py routes, but its declared consumes (ScheduleDTO, BracketTournamentDTO) have no owned producer route and Seam C advancement is admittedly not wired. The descriptor encodes intended, not actual, seams — so the 'enforced invariant' test would have to assert behavior that does not exist yet."
  ],
  "risks": [
    "Seam C (Operations->Bracket advancement) deferred step is NOT just 'naming an existing seam' — today a bracket-origin finish in Operations records local match state only with NO call to /bracket/results. Adding that call is genuinely NEW cross-module runtime behavior, despite the 'no new transport' framing. It belongs in a behavior-change PR with its own correctness/idempotency tests, not under a 'modernize wiring' banner.",
    "emitModuleEvent + 'assert each seam emits its event' requires inserting emit calls at store write points (tournamentStore.setSchedule, match-state writes). Editing setSchedule — one of the most test-covered store actions — to emit is behavior-adjacent and can perturb spy/snapshot counts even if the helper is a no-op.",
    "Non-blocking require_module_enabled still mutates each data router's dependency list and OpenAPI signature. Any pytest that introspects route dependencies, asserts handler signatures, or snapshots the OpenAPI schema could break even though no 403 is returned. 'Annotation only' must be verified to be truly inert.",
    "14 matchStateStore importers must migrate to the facade (Phase 1 step 3). Re-export shim mitigates, but this is the highest-churn frontend step and any missed getState() call site silently bypasses the ownership boundary the design claims to establish.",
    "MeetRepository/BracketRepository/OperationsRepository facades injected into handlers change handler signatures/DI. pytest that constructs LocalRepository and calls .matches/.brackets/.commands directly stays green only if facades are strictly additive; if any route stops exposing the sub-repo path, dependency-injection or repo-level tests break."
  ],
  "testBreakage": [
    "register_module without forwarding _AUTH_DEP: protected-route auth tests (currently expecting 401 when unauthenticated) flip to reaching the handler — security/auth pytest breaks across schedule/match_state/commands/brackets/tournaments/workspace_modules.",
    "Phase-0 'every route still registered after switching main.py to register_module' test will pass on path/method but will NOT catch the dropped auth dependency — giving false confidence while auth tests elsewhere fail.",
    "Any pytest asserting that /tournaments/{id}/state is served by the tournaments router, or asserting an exact registered-route ownership set, breaks if /state is reorganized toward Meet.",
    "Extracting uiStore solver/proposal slices: vitest that imports useUiStore and reads solverHud/activeProposal/etc. directly (selector or getState destructure) breaks until the shim covers every read shape; getState() destructuring is not covered by a selector re-export.",
    "Adding emit at tournamentStore.setSchedule risks breaking tournamentStore vitest that spies on set() calls or snapshots state transitions.",
    "matchStateStore facade must not instantiate a second store; a duplicate create<>() would break the 14 importers' shared-identity assumption and any test asserting single-store state.",
    "Mounting require_module_enabled on meet/bracket/operations routers: tests that hit those routes for a workspace where the module is 'available' (not 'enabled') must still pass — only guaranteed if the dep is truly non-blocking; any accidental enforcement 403s large swaths of the 526 pytest."
  ],
  "controlPlaneTouches": [
    "Rewriting app/main.py include_router block to register_module edits the exact file that wires the control plane — workspace_modules.router and tournaments.router are registered in the same block (main.py:223-224). Even 'leaving those lines as-is' means editing the control-plane router-wiring file.",
    "require_module_enabled('meet'|'bracket') reads workspace_modules.status to annotate. That newly couples data-plane routers to the control-plane modules table/state — a dependency edge from data plane into control plane that does not exist today (the map states 'no explicit router-level gating today').",
    "displayContract (a Tier-2 descriptor) duplicates the identity of display, which IS a Tier-1 ModuleId. If the contract test cross-checks descriptors against ModuleId/workspace_modules to validate enableable=true, the test reaches into control-plane vocabulary.",
    "Extracting bracketDataReady/disruptionSummary/solver/proposal slices edits uiStore.ts — the same file holding shell slices (activeTab, activeTournamentId/Kind/Status, persistStatus, toasts). Touching this file is editing the shell store, even if shell slices are untouched line-by-line.",
    "Any Meet ownership of /state edits tournaments.py, the file that also holds tournament CRUD + members + invite management (control-plane surfaces)."
  ],
  "verdict": "needs-revision"
}
```

---

## Current-state coupling map (research input)

## Module-Contract: Core Interface and Wiring
## Module Definition

**Frontend Type (WorkspaceModule)** from `src/platform/product-shell/types.ts`:
- `id: ModuleId` - one of 'meet' | 'bracket' | 'display'
- `label: string` - display label ("Meet", "Bracket", "Display")
- `status: ModuleStatus` - 'enabled' | 'available' | 'disabled' | 'coming-soon'
- `note?: string` - tooltip for non-enterable states

**Backend DTO (WorkspaceModuleDTO)** from `backend/app/schemas.py`:
- `moduleId: str` - module identifier
- `status: str` - persistence status (all built; coming_soon is legacy-only)
- `config: Optional[Dict[str, Any]]` - per-module settings blob (null initially)

**Database Model (WorkspaceModule)** from `backend/database/models.py`:
- Table: `workspace_modules`
- Unique constraint: `(tournament_id, module_id)` - exactly one row per module per workspace
- Columns: `module_id` (str), `status` (str), `config` (JSON nullable), `created_at` (server-default), `updated_at` (server-default)
- FK: `tournament_id` (UUID) with CASCADE delete

## Module Catalog (Hardcoded)

Three modules always present per workspace:

**Meet** (operational):
- Capability: roster, CP-SAT scheduling, live match control
- Valid statuses at seed: enabled | available
- Required for Display enable
- Data guard: cannot disable if matches exist (meet-side data-loss prevention)

**Bracket** (operational):
- Capability: events, seeding, draw generation, advancement, results
- Valid statuses at seed: enabled | available  
- Required for Display enable
- Data guard: cannot disable if bracket_events exist (bracket-side data-loss prevention)

**Display** (output, read-only):
- Capability: public scoreboard, live matches, draw, results
- Valid statuses at seed: available | disabled (cannot seed as enabled)
- Dependency: requires enabled meet OR enabled bracket; 409 if enabling without one
- No data guard (pure read-only output)

## Enable/Disable + Dependency Enforcement

**Allowed Status Transitions** (from `backend/api/workspace_modules.py`):
```
(available, enabled) - user enables an installable module
(enabled, disabled) - user disables active module (with guards)
(disabled, enabled) - user re-enables a disabled module
```

Any other transition (e.g., enabled → available) is rejected.

**Enforcement Rules (PATCH /tournaments/{id}/modules/{moduleId}):**

1. **coming_soon Immutability**: Any mutation (status or config) fails with 409 MODULE_IMMUTABLE; coming_soon rows are never mutable.

2. **Display Dependency**: Enabling display requires at least one enabled operational module (meet or bracket). If display→enabled and no operational module is enabled, 409 MODULE_DEPENDENCY_UNMET.

3. **Data-Loss Prevention**: Disabling meet/bracket fails if the module has data:
   - Meet: count(matches) > 0 → 409 MODULE_HAS_DATA
   - Bracket: count(bracket_events) > 0 → 409 MODULE_HAS_DATA

4. **Last Operational Module Guard**: Cannot disable meet or bracket if it is the only enabled operational module left. 409 MODULE_LAST_OPERATIONAL ensures workspace always has at least one data-producing engine.

**Seeding at Create Time** (backend/api/tournaments.py):
When a workspace is created with explicit modules, `normalize_module_seed` validates and backfills:
- All three modules must be named (or unnamed → available)
- coming_soon is rejected as a seed status (defensive only)
- display_dependency_satisfied is checked: if display is enabled, at least one operational module must be enabled

## The Module Contract Seam

**Frontend Reads/Wires:**

1. **useWorkspaceModules Hook** (`src/platform/domain/useWorkspaceModules.ts`):
   - Fetches `GET /tournaments/{id}/modules` → `WorkspaceModuleDTO[]`
   - Exposes `enable(moduleId)`, `disable(moduleId)` mutations via `PATCH /tournaments/{id}/modules/{moduleId}`
   - 409s surface as toasts via axios interceptor; on error, falls back to kind-derived catalog
   - Returns `WorkspaceModulesHook { modules: WorkspaceModule[] | null, loading, enable, disable, refetch }`

2. **Sidebar Navigation** (`src/app/workspace/workspaceNav.ts`):
   - `buildWorkspaceNav(kind, enabledSet: Set<ModuleId>)` - constructs left sidebar sections (Meet, Bracket, Operations, Display) only for enabled modules
   - Operations section routes to active engine's schedule/live surfaces (meet-kind or bracket-kind)

3. **Module Outlet** (`src/app/workspace/ModuleOutlet.tsx`):
   - Mounts the module component based on `moduleForTab(activeTab, kind)` function
   - Routes: tab 'tv' → DisplayProduct, bracket-* → BracketProduct, else MeetProduct

4. **Fallback Catalog** (`modulesForWorkspace(kind)` in moduleModel.ts):
   - When backend modules unavailable, derives from `kind`:
     - meet-kind: meet enabled, bracket available, display available
     - bracket-kind: bracket enabled, meet available, display available

5. **Module Settings Tab** (`src/products/settings/ModulesSettingsTab.tsx`):
   - Renders module catalog with enable/disable buttons
   - `isModuleEnableable(status)` determines affordances (enabled → disable button; available/disabled → enable button)
   - Dependency notes and data-guard messages are displayed in ModuleCatalogRow

**Backend Reads/Wires:**

1. **Lazy Derive-and-Persist** (`backend/repositories/local.py`, `_LocalModuleRepo`):
   - `ensure_modules(tournament)` - idempotent write-on-read: if no module rows exist for tournament, insert the derived set (from `derive_modules(kind)`), commit, return rows
   - Ordered by module_id for stable output
   - Migration backfills all existing tournaments; tests use lazy derive

2. **Derive Function** (`database/models.py`, `derive_modules(kind)`):
   ```
   bracket-kind  → {bracket: enabled, meet: available, display: available}
   meet-kind/null → {meet: enabled, bracket: available, display: available}
   ```

3. **Control-Plane Signals** (`backend/api/workspace_signals.py`, `build_signals(row, modules, counts)`):
   - Reads module statuses (`{moduleId: status}`)
   - Exposes `WorkspaceSignalsDTO`:
     - `modules.enabled / .available / .disabled / .comingSoon` - counts per status
     - `attention[]` - codes like `NO_MODULES_ENABLED`, `DISPLAY_NO_SOURCE` when dependency violated
     - `setup{configured, roster, scheduled, results}` (meet) or `{events, bracketBuilt, results}` (bracket)
     - `health: 'draft' | 'attention' | 'good' | 'archived'` - derived from attention codes

4. **Dependency Validation** (`database/models.py`, `display_dependency_satisfied(statuses: dict)`):
   - Shared by create-time seed validation and PATCH handler
   - Returns `True` unless display is enabled AND no operational module is enabled

## Key Wiring Points (Frontend ↔ Backend)

| Path | Method | Request | Response | Rules |
|------|--------|---------|----------|-------|
| `/tournaments/{id}/modules` | GET | — | `WorkspaceModuleDTO[]` | Lazy seeds if missing; read-only, viewer role |
| `/tournaments/{id}/modules/{moduleId}` | PATCH | `{status?, config?}` | `WorkspaceModuleDTO` | Operator role; 409 on dependency/data-loss/immutability violations |

**Workspace Create Flow**:
- User selects template (Standard Meet, Standard Bracket, Custom)
- Custom UI (`CustomModulesBuilder`) allows per-module tri-state (Enabled / Available / Off)
- Payload includes `modules: WorkspaceModuleDTO[]` seed
- Backend validates seed, checks display_dependency_satisfied, seeds rows before any module read
- Later module operations use lazy derive as fallback only for pre-table tournaments

Key files:
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/platform/product-shell/types.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/platform/domain/moduleModel.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/platform/domain/useWorkspaceModules.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/app/workspace/workspaceNav.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/app/workspace/ModuleOutlet.tsx
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/settings/ModulesSettingsTab.tsx
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/workspace_modules.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/database/models.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/app/schemas.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/workspace_signals.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/repositories/local.py

Couplings:
- Frontend hook useWorkspaceModules calls apiClient.getWorkspaceModules(tid) and patchWorkspaceModule(tid, moduleId, {status}) — wires frontend ModulesSettingsTab enable/disable to backend PATCH route
- Backend PATCH route calls repo.modules.ensure_modules(tournament) before validation, enforcing lazy derive-and-persist seam
- Backend PATCH route checks display_dependency_satisfied(statuses) using the same function as create-time seed validation
- Backend PATCH route calls _module_has_data(module_id, tournament_id, repo) to guard meet/bracket disable with count(matches) and count(bracket_events)
- Frontend ModuleOutlet uses moduleForTab(activeTab, kind) to mount meet/bracket/display products based on active tab
- Frontend workspaceNav.buildWorkspaceNav(kind, enabledSet) builds sidebar sections only for enabled modules; uses Set<ModuleId> from modules.filter(status===enabled)
- Frontend ModulesSettingsTab reads useWorkspaceModules and renders ModuleCatalogRow per module; isModuleEnableable(status) determines button affordance
- Backend workspace_signals.build_signals reads module statuses dict and compute control-plane signals; DISPLAY_NO_SOURCE attention code triggers when display_dependency_satisfied fails
- Backend create-time seed normalization validates and backfills modules, checking display_dependency_satisfied before persisting
- Frontend fallback modulesForWorkspace(kind) mirrors backend derive_modules(kind) exactly for kind-derived catalog when backend unavailable

---

## Frontend State Architecture: Zustand Stores and Cross-Module Coupling
## Store-by-Store Breakdown

### 1. **TournamentStore** 
**File:** `C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/tournamentStore.ts`

**Purpose:** Persisted tournament data (config, roster, matches, schedule). Server-synced via `useTournamentState` hook with 500ms debounce to `/tournament-state` endpoint.

**Slices:**

| Slice | READ by | WRITE by | Type |
|-------|---------|----------|------|
| `config: TournamentConfig \| null` | meet (setup, roster), bracket (BracketTournamentSection), display (MeetDisplayPage), uiStore logic | meet (setup/config editors), bracket (config changes), suggestions (proposal apply) | Core |
| `groups: RosterGroupDTO[]` | meet (roster, standings display), display (MeetDisplayPage standings view) | meet (roster management) | Data |
| `players: PlayerDTO[]` | meet (roster, match-making), bracket (not used), display (standings, courts view) | meet (bulk ops, import) | Data |
| `bracketPlayers: BracketPlayerDTO[]` | bracket (BracketRosterTab, EventsTab), meet (not used) | bracket (roster migration, bulk ops) | Data |
| `bracketRosterMigrated: boolean` | bracket (BracketTab migration guard) | bracket (BracketTab one-time migrate) | Flag |
| `matches: MatchDTO[]` | meet (MatchesTab, schedule), bracket (not used), display (courts/schedule logic) | meet (import, add/edit/delete) | Data |
| `schedule: ScheduleDTO \| null` | meet (SchedulePage, live tracking, display logic), bracket (not used), display (courts/standings calculations) | meet (solve, manual edits, proposal apply) | Core |
| `scheduleIsStale: boolean` | meet (StaleBanner, guard solver), bracket (not used) | meet (config changes trigger, setConfig logic), suggestions (proposal apply resets) | Flag |
| `isScheduleLocked: boolean` | meet (lock guard, unlock modal), bracket (not used) | meet (setSchedule auto-lock, unlockSchedule) | Flag |
| `scheduleVersion: number` | meet (proposal pipeline, export) | meet (proposals apply), suggestions (proposal apply) | Audit |
| `scheduleHistory: ScheduleHistoryEntry[]` | meet (proposal pipeline audit), bracket (not used) | meet (proposals apply), suggestions (proposal apply) | Audit |

**Cross-Module Read/Write Patterns:**
- **Meet reads** entire store (setup/config, roster, matches, schedule, stale flag, lock state)
- **Bracket reads** bracketPlayers/bracketRosterMigrated + config (BracketTournamentSection sets config on blur)
- **Display reads** schedule + matches + config + groups + players via `useLiveTracking` + `useDisplaySync` polling (read-only)
- **Ephemeral slices** (scheduleVersion, scheduleHistory) tied to proposal review workflow

---

### 2. **MatchStateStore** 
**File:** `C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/matchStateStore.ts`

**Purpose:** Live match state persisted immediately (no debounce) to `/match-state`. **Conceptually Operations-owned** per store comment (lines 1-6: "live-ops match transitions flush immediately because mutations carry user intent").

**Slices:**

| Slice | READ by | WRITE by | Operations-Owned |
|-------|---------|----------|-----------------|
| `matchStates: Record<string, MatchStateDTO>` | meet (SchedulePage, MatchControlCenterPage, DirectorToolsPanel), display (MeetDisplayPage courts/standings), hooks (useLiveTracking, useCommandQueue) | meet via useLiveTracking (updateMatchStatus, setMatchScore, confirmPlayer), hooks (useCommandQueue submit flow), live tracking sync | **YES** |
| `liveState: LiveScheduleState \| null` | display (via useLiveTracking derivation) | hooks (useLiveTracking rebuilds on matchStates changes) | YES |
| `pendingCommandsByMatchId: Record<string, string>` | hooks (useCommandQueue reads for version tracking) | hooks (useCommandQueue optimistic flow: setPendingCommand, clearPendingCommand) | **YES** |
| `recentConflictsByMatchId: Record<string, ConflictRecord>` | components (ConflictBanner reads via selector) | hooks (useCommandQueue Step G: recordConflict on 409/conflict) | **YES** |
| `canonicalVersionsByMatchId: Record<string, number>` | hooks (useCommandQueue, useLiveTracking read for version resolution) | hooks (both set via setMatchVersion after successful commands) | **YES** |

**Cross-Module Read/Write Patterns:**
- **Meet SchedulePage/MatchControlCenterPage/DirectorToolsPanel read** matchStates to derive match layouts + statuses
- **Display reads** matchStates via `useLiveTracking` hook to show courts/standings/progress
- **Hooks (useLiveTracking, useCommandQueue) WRITE** via optimistic apply + server sync patterns
- **Conflict tracking** (Step G) ties to ConflictBanner UI in meet (not a global read)
- **Version cache** (canonicalVersionsByMatchId) is internal to command-queue audit trail

---

### 3. **UiStore** 
**File:** `C:/Users/avlis/OneDinge/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/uiStore.ts`

**Purpose:** Ephemeral UI state (never persisted, cleared on refresh). Holds workflow state, solver HUD, workflow proposals, and module coordination flags.

**Slices:**

| Slice | READ by | WRITE by | Module Scope |
|-------|---------|----------|--------------|
| `activeTab: AppTab` | meet (tab strip), bracket (BracketProduct), shell chrome | shell (setActiveTab on nav) | Shell |
| `activeTournamentId: string \| null` | useTournamentState (forceSaveNow reads for PUT routing), all hydrators | TournamentPage on mount | Shell |
| `activeTournamentKind: 'meet' \| 'bracket' \| null` | shell TabBar (filter tabs), kind-router (PublicDisplayPage) | useTournamentKind hook on mount | Shell |
| `activeTournamentStatus: 'draft' \| 'active' \| 'archived' \| null` | shell status badge | useTournamentKind hook on mount | Shell |
| `bracketDataReady: boolean \| null` | shell TabBar (disable draw/schedule/live until ready) | bracket BracketTab (setBracketDataReady on useBracket fetch) | **Bracket-only** |
| `disruptionSummary: { total, errors, warnings, severity }` | shell TabBar badge (meet validation count) | meet useDisruptionPublisher publishes from validation logic | **Meet-only** |
| `solverHud: SolverHudState` | meet SchedulePage (displays phase/progress stats) | meet solver integration (setSolverHud on progress events) | **Meet solver** |
| `pendingPin: PendingPin \| null` | meet DragGantt (shows drag-in-flight pin preview) | meet DragGantt (setPendingPin on mousedown) | **Meet schedule** |
| `lastValidation: ValidationSnapshot \| null` | meet DragGantt (shows conflicts during drag) | meet DragGantt (setLastValidation on validate-during-drag) | **Meet schedule** |
| `persistStatus: 'idle' \| 'dirty' \| 'saving' \| 'error'` | UnsavedBanner, meet chrome | useTournamentState setPersistStatus flow | Shell |
| `lastSavedAt: string \| null` | UnsavedBanner | useTournamentState on successful PUT | Shell |
| `lastSaveError: string \| null` | UnsavedBanner, AppStatusPopover | useTournamentState on PUT failure | Shell |
| `toasts: Toast[]` | Toast component list render | universal (pushToast: meet, bracket, hooks all push) | Shell |
| `scheduleStats: ScheduleGenerationStats \| null` | meet SchedulePage (shows solve stats when no live progress) | meet suggestion actions (on proposal apply success) | **Meet solver** |
| `isGenerating: boolean` | meet SchedulePage (show progress spinner) | solver integration (setIsGenerating) | **Meet solver** |
| `generationProgress: SolverProgressEvent \| null` | meet SchedulePage (displays progress), SolverProgressLog | solver websocket handler | **Meet solver** |
| `generationError: string \| null` | meet SchedulePage (error display) | solver error handler | **Meet solver** |
| `solverLogs: SolverLogEntry[]` | meet SolverProgressLog (displays last 50) | meet SolverProgressLog (addSolverLog) | **Meet solver** |
| `activeProposal: Proposal \| null` | meet control-center (MoveMatchDialog, DisruptionDialog, WarmRestartDialog), DirectorToolsPanel | meet suggestion actions (setActiveProposal on generate/accept/cancel) | **Meet proposals** |
| `advisories: Advisory[]` | meet advisory banner, suggestions rail | meet advisory hooks (setAdvisories) | **Meet advisories** |
| `suggestions: Suggestion[]` | meet suggestions rail | meet suggestion hooks | **Meet suggestions** |
| `pendingAdvisoryReview: Advisory \| null` | meet advisory modal | meet advisory flow | **Meet advisories** |
| `unlockModalState: UnlockModalState \| null` | UnlockModalHost (modal handshake) | meet lock guard (setUnlockModalState) | **Meet lock** |
| `bracketSelectedMatchId: string \| null` | bracket MatchDetailPanel (shows detail for selected ID) | bracket LiveView/LiveMatchList (setBracketSelectedMatchId) | **Bracket-only** |
| `bracketScheduleEventFilter: Record<string, boolean>` | bracket ScheduleView/LiveMatchList/EventsFilterStrip (read to filter events) | bracket EventsFilterStrip (setBracketScheduleEventFilter) | **Bracket-only** |

**Cross-Module Read/Write Patterns:**
- **Meet reads** solverHud, activeProposal, advisories, suggestions, scheduleStats, generationProgress, toasts, persistStatus
- **Bracket reads** activeTab, bracketDataReady, bracketSelectedMatchId, bracketScheduleEventFilter (bracket-scoped slices)
- **Display reads** nothing (read-only surface, no UI chrome)
- **Shell reads** activeTournamentId/Kind/Status, persistStatus, lastSaved*, activeTab, toasts
- **All modules write** toasts (via pushToast)

---

### 4. **PreferencesStore** 
**File:** `C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/preferencesStore.ts`

**Purpose:** Per-device UI preferences, persisted to localStorage only (`scheduler-app-preferences`). Never touched by import/export.

**Slices:**

| Slice | READ by | WRITE by |
|-------|---------|----------|
| `theme: ThemePreference` | all modules via useAppliedTheme hook | settings UI (setTheme) |
| `density: DensityPreference` | all modules via useAppliedDensity hook | settings UI (setDensity) |

**Cross-Module Pattern:** Purely read-only consumption via hooks; isolated from tournament data flows.

---

## Key Cross-Module Coupling Points

### 1. **Display → TournamentStore + MatchStateStore** (Read-Only)
- **File:** `src/products/display/publicDisplay/useDisplaySync.ts`
- **Pattern:** Standalone /display route (outside AppShell) runs independent polling loop every 10s to `getTournamentState`
- **Reads:** `config`, `groups`, `players`, `matches`, `schedule` from tournamentStore; `matchStates` via `useLiveTracking` hook
- **Type:** Read-only mirror; no writes. Display is a passive viewer of operator state.

### 2. **Bracket → UiStore** (Coordination Flags)
- **Slices:** `bracketDataReady`, `bracketSelectedMatchId`, `bracketScheduleEventFilter`
- **Pattern:** Bracket uses uiStore to signal data readiness to shell TabBar; shell filters tabs based on `bracketDataReady`
- **Coupling:** Shell TabBar reads `bracketDataReady` to enable/disable draw/schedule/live tabs; BracketTab writes on `useBracket` fetch completion
- **Files:** BracketTab.tsx (writes), TabBar (reads via shell)

### 3. **Bracket → TournamentStore** (Roster Data Isolation)
- **Slices:** `bracketPlayers`, `bracketRosterMigrated`
- **Pattern:** Bracket maintains separate roster from Meet via `bracketPlayers` slice (data isolation per spec)
- **Coupling:** BracketTab one-time migrates `players` → `bracketPlayers` on first load; EventsTab reads `bracketPlayers`
- **Mutually Exclusive:** Meet reads/writes `players`; Bracket reads/writes `bracketPlayers`. No overlap.

### 4. **Meet → MatchStateStore** (Live Operations Owns This)
- **Slices:** `matchStates`, `pendingCommandsByMatchId`, `recentConflictsByMatchId`, `canonicalVersionsByMatchId`
- **Pattern:** Operations (liveOps) controls match state machine via `useLiveTracking` (poll + sync) and `useCommandQueue` (command submission)
- **Coupling:** SchedulePage, MatchControlCenterPage, DirectorToolsPanel READ `matchStates` for layout; they call `updateMatchStatus`, `setMatchScore` via hooks to WRITE
- **Conflict Tracking (Step G):** ConflictBanner reads `recentConflictsByMatchId` to render stale-version / conflict rejections inline

### 5. **Meet Solver → UiStore** (Ephemeral Workflow)
- **Slices:** `solverHud`, `scheduleStats`, `generationProgress`, `isGenerating`, `generationError`, `solverLogs`
- **Pattern:** Solver progress events (websocket) update HUD; final stats land in `scheduleStats` when solve completes
- **Coupling:** SchedulePage reads these to show progress bar, stats, error messages; SolverProgressLog reads `solverLogs`

### 6. **Meet Proposals → UiStore** (Ephemeral Workflow)
- **Slices:** `activeProposal`, `advisories`, `suggestions`, `pendingAdvisoryReview`
- **Pattern:** Suggestion actions (useSuggestionActions hook) generate proposals → set `activeProposal` → operator reviews impact diff → approves/rejects
- **Coupling:** MoveMatchDialog, DisruptionDialog, WarmRestartDialog, DirectorToolsPanel all READ `activeProposal` to show modal; suggestions rail reads `suggestions`

### 7. **TournamentState Hydration → UiStore** (Coordination)
- **Pattern:** `useTournamentState` reads `activeTournamentId` from uiStore to route PUT requests; on success sets `persistStatus`, `lastSavedAt`
- **Coupling:** TournamentPage sets `activeTournamentId` on mount; useTournamentState reads it for debounced persistence

---

## Operations Module State Ownership

**Conceptually Operations-Owned (per design):**
- **MatchStateStore** (entire store): Live match state machine, command queue tracking, conflict records
- **UiStore.solverHud / scheduleStats / generationProgress**: Solver integration state
- **UiStore.activeProposal / advisories / suggestions**: Proposal review workflow

**NOT yet its own folder:** Operations is currently distributed across:
- `src/products/meet/liveOps/` (minimal test file only)
- `src/hooks/useLiveTracking.ts` (core live-ops logic)
- `src/hooks/useCommandQueue.ts` (command submission + conflict handling)
- `src/hooks/useProposals.ts` (proposal fetch)
- Various meet components (SchedulePage, MatchControlCenterPage, DirectorToolsPanel)

**Architectural Issue:** matchStateStore is global today but conceptually belongs to Operations. When Operations becomes a proper sidebar module, the store should be co-located or wrapped via a hook to enforce read/write boundaries.

---

## Store Slices by Persistence Model

**Server-persisted (useTournamentState debounce ~500ms):**
- tournamentStore: config, groups, players, bracketPlayers, bracketRosterMigrated, matches, schedule, scheduleIsStale, isScheduleLocked, scheduleVersion, scheduleHistory

**Server-persisted (immediate, no debounce):**
- matchStateStore: matchStates, liveState, pendingCommandsByMatchId, recentConflictsByMatchId, canonicalVersionsByMatchId (all to /match-state)

**LocalStorage-persisted:**
- preferencesStore: theme, density

**Ephemeral (never persisted, cleared on refresh):**
- uiStore: activeTab, activeTournamentId, activeTournamentKind, activeTournamentStatus, bracketDataReady, disruptionSummary, solverHud, pendingPin, lastValidation, persistStatus, lastSavedAt, lastSaveError, toasts, scheduleStats, isGenerating, generationProgress, generationError, solverLogs, activeProposal, advisories, suggestions, pendingAdvisoryReview, unlockModalState, bracketSelectedMatchId, bracketScheduleEventFilter

Key files:
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/tournamentStore.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/matchStateStore.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/uiStore.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/preferencesStore.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/hooks/useTournamentState.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/hooks/useLiveTracking.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/hooks/useCommandQueue.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/display/publicDisplay/useDisplaySync.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/display/MeetDisplayPage.tsx
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/bracket/BracketTab.tsx

Couplings:
- Display reads tournamentStore schedule/matches/config/groups/players via independent polling (useDisplaySync) and matchStateStore matchStates via useLiveTracking hook
- Bracket reads/writes bracketPlayers + bracketRosterMigrated from tournamentStore; reads/writes bracketDataReady + bracketSelectedMatchId + bracketScheduleEventFilter to uiStore
- Meet operations (liveOps) reads/writes entire matchStateStore (live match state machine, pending commands, conflicts); reads tournamentStore schedule for layout logic
- Meet reads tournamentStore config/schedule/matches/scheduleIsStale/isScheduleLocked for setup, roster, matches, schedule generation, and lock guards
- Meet solver integration writes solverHud/scheduleStats/generationProgress/isGenerating/generationError/solverLogs to ephemeral uiStore
- Meet proposal review writes activeProposal/advisories/suggestions to uiStore; reads activeProposal in control-center dialogs (MoveMatchDialog, DisruptionDialog, WarmRestartDialog)
- useTournamentState reads activeTournamentId from uiStore to route PUT persistence; writes persistStatus/lastSavedAt/lastSaveError back
- Shell TabBar reads activeTournamentKind to filter meet-only vs bracket-only tabs; reads bracketDataReady to disable bracket tabs until draw generated
- Preferences are read-only via hooks (useAppliedTheme, useAppliedDensity) by all modules; never written except by settings UI
- ConflictBanner reads recentConflictsByMatchId from matchStateStore to show inline rejection banners (Step G conflict tracking)

---

## Backend Route & Model Ownership Architecture
## Route Registration (app/main.py)

All routes are registered with `Depends(get_current_user)` except invites:

```
schedule, schedule_repair, schedule_warm_restart, schedule_advisories,
schedule_proposals, schedule_director, schedule_suggestions,
match_state, tournaments, commands, brackets, workspace_modules
→ all require viewer+ auth

invites
→ registered WITHOUT router-level auth (individual handlers decide)
```

## Route Structure by Module

### TOURNAMENTS (base CRUD + state)
**File:** `api/tournaments.py`  
**Prefix:** `/tournaments`  
**Routes:**
- `GET /tournaments` — list (newest-first, filtered to user's memberships + roles + module state + signals)
- `POST /tournaments` — create (seeds optional modules, optional initial config)
- `GET /tournaments/{id}` — summary (metadata + modules + signals)
- `PATCH /tournaments/{id}` — update name/status/date
- `DELETE /tournaments/{id}` — cascade delete (owner-only)

**State Management:**
- `GET /tournaments/{id}/state` — full TournamentStateDTO blob (204 if empty)
- `PUT /tournaments/{id}/state` — commit + snapshot + rotate backups
- `GET /tournaments/{id}/state/backups` — list backup entries
- `POST /tournaments/{id}/state/backup` — manual snapshot
- `POST /tournaments/{id}/state/restore/{filename}` — restore + re-project matches

**Members + Invites (scoped under tournament):**
- `GET /tournaments/{id}/members` — list all members + joined_at
- `POST /tournaments/{id}/invites` — create link (owner-only)
- `GET /tournaments/{id}/invites` — list all links (owner-only)

### SCHEDULE (Meet solver + runtime tools)
**File:** `api/schedule.py` + sub-routers  
**Prefix:** `/` (root) and `/tournaments/{id}/schedule`  
**Core Routes:**
- `POST /schedule` — solve (stateless, returns ScheduleDTO)
- `POST /schedule/stream` — solve + SSE progress (model_built → phase → progress → complete/error → done)

**Sub-router Family** (all scoped to `/tournaments/{id}/schedule`):
- **schedule_proposals.py:** proposal pipeline (lock/store/retrieve/commit/revert)
  - `POST /schedule/proposals` — build proposal from diff snapshot
  - `PUT /schedule/proposals/{key}` — commit proposal + rotate backups
  - etc.
- **schedule_advisories.py:** constraints + suggestions
  - `GET /schedule/advisories` — constraint list + detail
- **schedule_director.py:** runtime delay/blackout/court-reopen actions
  - `POST /schedule/director` — apply action (delay_start, insert_blackout, etc.)
- **schedule_warm_restart.py:** re-solve with new config
  - `POST /schedule/warm-restart` — full re-solve
- **schedule_suggestions.py:** speculative solve worker
  - (async background; no route-level exposure in this layer)
- **schedule_repair.py:** repair + recovery
  - Recovery routes for schedule inconsistencies

### MATCH STATE (Operations: runtime match state)
**File:** `api/match_state.py`  
**Prefix:** `/tournaments/{id}/match-states`  
**Routes:**
- `GET /tournaments/{id}/match-states` — list all (paginated or full)
- `GET /tournaments/{id}/match-states/{match_id}` — single match state (returns ETag for version)
- `PUT /tournaments/{id}/match-states/{match_id}` — update (called/started/finished + score, If-Match required)
- `DELETE /tournaments/{id}/match-states/{match_id}` — clear state (resets to scheduled)
- `POST /tournaments/{id}/match-states/reset-all` — bulk admin reset
- `POST /tournaments/{id}/match-states/import` — bulk seed from JSON (admin)
- `POST /tournaments/{id}/match-states/import.csv` — bulk seed from CSV (admin)

**State Machine:** MatchStatus enum (scheduled → called → playing → finished | retired). Dual-writes both `match_states` (legacy) and `matches` (new schema) tables. Enforces transitions via `assert_valid_transition`.

### COMMANDS (Operations: idempotent action log)
**File:** `api/commands.py`  
**Prefix:** `/tournaments/{id}/commands`  
**Routes:**
- `POST /tournaments/{id}/commands` — submit operator action (call/start/finish/retire/uncall)
  - Idempotent: client UUID is idempotency key
  - Returns 409 with ConflictError on illegal state transition or stale version
  - Dual-writes command log + match status

### BRACKETS (Bracket solver + draw management)
**File:** `api/brackets.py`  
**Prefix:** `/tournaments/{id}/bracket`  
**Routes:**
- `POST /tournaments/{id}/bracket` — create session + events (stateful)
- `GET /tournaments/{id}/bracket` — read full state (TournamentOut)
- `DELETE /tournaments/{id}/bracket` — clear all bracket data

**Event Management:**
- `POST /tournaments/{id}/bracket/events/{event_id}` — upsert event
- `POST /tournaments/{id}/bracket/events/{event_id}/generate` — generate draw (se/rr)
- `DELETE /tournaments/{id}/bracket/events/{event_id}` — delete event

**Round Scheduling + Results:**
- `POST /tournaments/{id}/bracket/schedule-next` — solve next round
- `POST /tournaments/{id}/bracket/results` — record match result
- `POST /tournaments/{id}/bracket/match-action` — start/finish/reset
- `POST /tournaments/{id}/bracket/validate` — feasibility check (drag without commit)
- `POST /tournaments/{id}/bracket/pin` — commit single drag + re-solve

**I/O:**
- `POST /tournaments/{id}/bracket/import` — import pre-paired JSON
- `POST /tournaments/{id}/bracket/import.csv` — import pre-paired CSV
- `GET /tournaments/{id}/bracket/export.json` — full state (alias for GET bracket)
- `GET /tournaments/{id}/bracket/export.csv` — order-of-play CSV
- `GET /tournaments/{id}/bracket/export.ics` — iCalendar feed

### WORKSPACE MODULES (Control plane: enable/disable modules)
**File:** `api/workspace_modules.py`  
**Prefix:** `/tournaments/{id}/modules`  
**Routes:**
- `GET /tournaments/{id}/modules` — list workspace modules (auto-seeded from kind if absent)
- `PATCH /tournaments/{id}/modules/{module_id}` — update status/config (enforces dependency rules)

**Module Vocabulary:**
- **Canonical IDs:** `"meet"`, `"bracket"`, `"display"`
- **Status Values:** `"enabled"`, `"available"`, `"disabled"`, `"coming_soon"`
- **Operational Modules:** `"meet"`, `"bracket"` (data-producing)
- **Display Dependencies:** Display may be enabled only if an operational module is enabled

**Rules (409 on violation):**
- `coming_soon` modules are immutable
- Last enabled operational module cannot be disabled
- Module with data (meet→matches, bracket→bracket_events) cannot be disabled
- Display enable requires ≥1 enabled operational module

### INVITES (Public sharing)
**File:** `api/invites.py`  
**Prefix:** `/invites` (public), routes also scoped under `/tournaments/{id}/invites` (owner management)  
**Routes:**
- `GET /invites/{token}` — public resolve (no auth; returns InviteResolveDTO with tournament name + role + valid status)
- `POST /invites/{token}/accept` — claim invite (authenticated; adds member row)
- `DELETE /invites/{token}` — revoke link (owner-only via tournament-scoped route in tournaments.py)

## Data Model Ownership

**Tournaments Table** (`database/models.Tournament`)
- Composite blob: `data: dict` (JSON column) holds full TournamentStateDTO
  - Schema version 2: contains `config`, `groups`, `players`, `matches`, `schedule`, `history`
  - Contains `bracket_session` for bracket state (not exposed in meet-side DTO, but preserved on commit)
- Denormalized scalar columns: `name`, `owner_id`, `owner_email`, `status`, `kind`, `tournament_date`, `schema_version`
- Relationships: matches (per-match ops), match_states (live legacy), backups, members, invite_links, bracket_events, modules

**MEET Module** — produces matches; writes Schedule
- Source: `Tournament.data["matches"]` (roster input)
- Solver output: `Tournament.data["schedule"]["assignments"]` (court/time_slot assignments)
- Persisted per-match ops: `matches` table (composite PK `tournament_id, id`; status, version, court_id, time_slot, created_at, updated_at)
- Live ops: `match_states` table (legacy: status, called_at, actual_start_time, actual_end_time, score, notes)

**BRACKET Module** — produces draws; writes bracket_* tables
- Events: `bracket_events` table (tournament_id, id, discipline, format, duration_slots, config, status, version)
- Participants: `bracket_participants` table (tournament_id, event_id, id, name, type, member_ids, seed, meta)
- Matches: `bracket_matches` table (tournament_id, event_id, id, round_index, match_index, kind, slot_a, slot_b, side_a, side_b, dependencies, expected_duration_slots, meta, version)
- Results: `bracket_results` table (tournament_id, event_id, match_id, winner_side, score, finished_at_slot, walkover)
- Session metadata: `Tournament.data["bracket_session"]` (courts, total_slots, rest_between_rounds, interval_minutes, assignments, start_time) — preserved on meet-side PUT

**OPERATIONS Module** — consumes from Meet OR Bracket; manages court assignment, match state
- Command log: `commands` table (tournament_id, match_id, action, submitted_by, applied_at, rejected_at, rejection_reason) — idempotent action log
- Match status: `matches` table (status enum: scheduled/called/playing/finished/retired, version for optimistic concurrency)
- Legacy live scratchpad: `match_states` table (kept for backward compatibility with existing routes)
- Outbox for sync: `sync_queue` table (entity_type, entity_id, payload for Supabase replication)

**DISPLAY Module** — read-only; consumes match state from Operations
- No dedicated tables; reads from `matches` (via Operations) or `bracket_matches` (via Bracket), statuses, assignments
- Control plane only: can be disabled if no operational module is enabled; enabling requires ≥1 operational module enabled

**Workspace Modules Table** (`database/models.WorkspaceModule`)
- Composite unique index: `(tournament_id, module_id)`
- Seeded lazily from `derive_modules(tournament.kind)`:
  - `kind="meet"` → `{meet: enabled, bracket: available, display: available}`
  - `kind="bracket"` → `{bracket: enabled, meet: available, display: available}`
- First-class state: status, config (per-module settings blob)

## Repository Layer Structure

**LocalRepository** (façade holding session + sub-repos)
```python
class LocalRepository:
    tournaments = _LocalTournamentRepo(session)
    matches = _LocalMatchRepo(session)        # meet + operations
    brackets = _LocalBracketRepo(session)     # bracket module
    match_states = _LocalMatchStateRepo(session) # legacy operations
    commands = _LocalCommandRepo(session)     # operations idempotent log
    backups = _LocalTournamentBackupRepo(session)
    members = _LocalMemberRepo(session)
    invite_links = _LocalInviteLinkRepo(session)
    modules = _LocalModuleRepo(session)       # control plane
```

**Key Methods by Sub-repo:**
- `tournaments.list_all(), get_by_id(), create(), update(), upsert_data()`
- `matches.bulk_project_from_schedule()` — projection from solver output
- `brackets.list_events(), list_matches(), list_participants(), list_results()`
- `modules.ensure_modules(), seed_modules(), update(), count_matches(), count_bracket_events()`
- `commands.create(), get_by_id()` — idempotent log reads/writes

## Module Gating

**Where Logic is Conditional on Module State:**
- **Workspace Signals** (`api/workspace_signals.py`): reads module statuses to compute `health` + `attention` codes (NO_MODULES_ENABLED, NO_BRACKET, etc.)
- **Tournament Summary** (`api/tournaments.py`): includes `modules: List[WorkspaceModuleDTO]` + `signals` computed from module state
- **PATCH /modules/{id}** (`api/workspace_modules.py`): enforces dependency rules (Display enable, last operational, data guards)
- **Bracket Hydration** (`api/brackets.py`): reads tournament.kind or control-plane module state to determine if bracket is enabled
- **No explicit router-level gating today:** meet/bracket routes are always present; module state is a control-plane signal (UI controls UI affordances, doesn't block routes)

## Cross-Module Routing Patterns

| Endpoint Path | Serves | Ownership | Auth |
|---|---|---|---|
| `POST /schedule` (stateless) | Meet solver | Adapter only | app-level |
| `POST /tournaments/{id}/state` (PUT) | Meet state blob | Tournaments + Matches projection | operator+ |
| `POST /tournaments/{id}/bracket/*` | Bracket events/results | Brackets sub-repo | operator+ |
| `POST /tournaments/{id}/match-states/*` | Live ops (legacy) | MatchStates + Matches dual-write | operator+ |
| `POST /tournaments/{id}/commands` | Operations idempotent log | Commands + Matches update | operator+ |
| `PATCH /tournaments/{id}/modules/{id}` | Control plane | WorkspaceModules table | operator+ |

## Per-Module Router Split: Disentanglement Needed

**Today:** All routes interleave with tournament-scoped paths; no structural separation.

**To achieve per-module routers (meets, brackets, operations_commands, display_signals):**

1. **Router Extraction:**
   - Create `api/meet_routes.py`: extract schedule family + match_state + state PUT
   - Create `api/bracket_routes.py`: extract bracket sub-routes (already partially isolated)
   - Create `api/operations_routes.py`: extract match_state + commands (currently mixed)
   - Create `api/display_routes.py`: signals/healthcheck

2. **Dependency Lifting:**
   - Today: `require_tournament_access("viewer"/"operator"/"owner")` inlined in route handlers
   - Lift to router-level dependency: `APIRouter(dependencies=[Depends(require_tournament_access("operator"))])`
   - Per-module routers inherit their canonical role gate

3. **Repository Separation:**
   - Today: `LocalRepository` is a flat facade; routes reach `.matches`, `.brackets`, `.commands` directly
   - Create `MeetRepository`, `BracketRepository`, `OperationsRepository` wrapping sub-repos
   - `LocalRepository` composes them; routes inject the module-scoped repo variant

4. **Schema Disentanglement:**
   - Meet: isolate `Tournament.data["matches"]`, `Tournament.data["schedule"]`, `matches` table reads/writes
   - Bracket: already isolated to `bracket_*` tables + `Tournament.data["bracket_session"]`
   - Operations: split between `match_states` (legacy) + `matches` + `commands` tables
   - Challenge: `commit_tournament_state` today merges bracket_session preservation; meets side must not erase it

5. **Module State Gating:**
   - Add route-level guard: `APIRouter(dependencies=[Depends(require_module_enabled("meet"))])`
   - `require_module_enabled(module_id)` checks `workspace_modules.status == "enabled"` for tournament
   - Bracket routes gate on `bracket` enabled; meet schedule routes gate on `meet` enabled
   - Display (signals) routes gate on `display` enabled (without blocking data routes)

6. **Outbox/Sync:**
   - Today: `SyncQueue` is global; any write enqueues
   - Per-module routers can push per-module sync events (entity_type: "match" vs "bracket_match" vs "command")

7. **Cross-Module Points to Preserve:**
   - Bracket → Operations: bracket matches must have ops state (called/playing/finished) — dual-write to `match_states` or new `bracket_assignment_state` table
   - Meet → Operations: meet matches already dual-write to `matches` table
   - Display ← Operations: reads from whichever module produced matches
   - Invite links + Members: stay global (tournament-level, no module scoping)


Key files:
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/app/main.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/tournaments.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/schedule.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/match_state.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/commands.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/brackets.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/workspace_modules.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/database/models.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/repositories/local.py

Couplings:
- schedule solver (stateless POST /schedule) → tournament state blob (PUT /tournaments/{id}/state) via TournamentStateDTO with matches+schedule fields
- match state routes (PUT /tournaments/{id}/match-states/{id}) ↔ matches table dual-write via assert_valid_transition + MatchStatus enum
- bracket routes (POST /tournaments/{id}/bracket/*) ↔ tournament.data['bracket_session'] preservation in commit_tournament_state (meet PUT must not erase bracket state)
- workspace_modules PATCH → display dependency rule enforces (display enabled requires meet OR bracket enabled)
- commands idempotent log (POST /tournaments/{id}/commands) → matches table status + version via process_command pipeline
- schedule_proposals (POST /tournaments/{id}/schedule/proposals) ↔ schedule_warm_restart (POST /schedule/warm-restart) via shared TournamentConfig mutation
- tournament summary (GET /tournaments) → workspace_modules (implicit lazy-seed from kind) + signals (workspace_signals.build_signals reads modules + row counts)
- bracket hydration (api/brackets.py _hydrate_session) reads tournament.data['config'] (camelCase from meet) + tournament.data['bracket_session'] (legacy)
- match projection (_project_matches_from_payload in LocalRepository) consumes Tournament.data['matches'] + Tournament.data['schedule']['assignments'], writes to matches table
- sync_queue outbox enqueued by every matches/bracket write; SyncService replicates to Supabase (crosses SQLite ↔ Postgres boundary)

---

## Cross-Module Data Seams: Meet → Operations, Bracket → Operations, Operations → Bracket Advancement, Operations/Match-State → Display
## SEAM A: Meet Schedule Finalize → Operations/Live Surface

**Flow (PULL):**
- Frontend calls `apiClient.generateScheduleWithProgress()` via `useSchedule()` hook → SSE stream to `/schedule/stream`
- Backend `schedule.py` stateless endpoint receives `GenerateScheduleRequest` (config, players, matches)
- Solver produces `ScheduleDTO` with `assignments: ScheduleAssignment[]` containing `{matchId, slotId, courtId, durationSlots}`
- **Frontend writes result to `useTournamentStore.setSchedule(schedule)`** — this is the seam: `ScheduleDTO.assignments` becomes the canonical schedule
- **No explicit "finalize" endpoint**: schedule is live once written to store; `useTournamentStore.lockSchedule()` is UI-side only (sets `isScheduleLocked: true`)
- **Match-state population triggered by:** `useLiveTracking()` hook polls `GET /tournaments/{tid}/match-states` every 5 seconds → feeds `useMatchStateStore.setMatchStates(mergedStates)`

**Data Contract:**
- Frontend: `ScheduleDTO { assignments: ScheduleAssignment[], activeCandidateIndex: number, objectiveScore: number }`
- Backend: `schedule.py` returns `ScheduleDTO` with assignments keyed by matchId
- Match state: separate from schedule; populated via `match_state.py` routes (`GET /tournaments/{tid}/match-states` returns `Record<string, MatchStateDTO>`)

**Trigger & Timing:**
- **Push:** Schedule push via `setSchedule()` is synchronous after solver returns (instant)
- **Pull:** Match-state poll is async every 5 s via `useLiveTracking()` in `useEffect` with interval
- **Contract:** Implicit — schedule DTO structure matches what frontend expects; no validation of assignment-to-matchId consistency

**Degradation when Meet is disabled:**
- If Meet module is disabled, `SchedulePage` and schedule generation are unavailable
- But `useLiveTracking()` still polls match-state independently of Meet
- If a schedule was finalized before disabling Meet, matchStateStore preserves it in store but no new synchronization occurs
- **Seam breaks:** No way to inject new matches or assignments once Meet is disabled; match-state becomes read-only

---

## SEAM B: Bracket Draw → Operations/Live Surface

**Flow (PULL + async mutation):**
- Frontend bracket module calls `useBracketApi().eventGenerate(eventId, body)` → `POST /tournaments/{tid}/bracket/events/{event_id}/generate`
- Backend `brackets.py` invokes `BracketSession.register_draw()` and solver → generates `play_units` (matches in bracket speak), `assignments` (slot+court per play_unit), and `results` (winner records)
- Backend writes to bracket schema tables; stages outbox row for Supabase Realtime
- **Frontend hook `useBracket()` polls `GET /tournaments/{tid}/bracket` every 2.5 s** → fetches full `BracketTournamentDTO { play_units: PlayUnitDTO[], assignments: AssignmentDTO[], results: ResultDTO[] }`
- **Key seam:** Bracket's `assignments` (with `play_unit_id`, `court_id`, `slot_id`, `actual_start_slot`) are SEPARATE from Meet's schedule assignments
- **Live surface reads:** `BracketLiveView` renders assignments as Gantt chips; `LiveMatchList` shows upcoming by assignment.slot_id

**Data Contract:**
- Frontend: `BracketTournamentDTO { events, play_units, assignments, results, participants, start_time, interval_minutes }`
- Play unit: `{ id, event_id, round_index, match_index, side_a: [participant_id], side_b: [participant_id], ...}`
- Assignment: `{ play_unit_id, court_id, slot_id, duration_slots, actual_start_slot?, ...}`
- Result: `{ play_unit_id, winner_side: 'A' | 'B', ... }`

**Trigger & Timing:**
- **Push:** Backend write to bracket tables is synchronous; Supabase Realtime notifies subscribed clients (real-time channel)
- **Pull:** Frontend uses timed polling (2.5 s interval) via `useBracketApi().get()`; no WebSocket or SSE in the bracket flow
- **Contract:** Explicit type contract in `bracketDto.ts`; REST API is the contract surface

**Degradation when Bracket is disabled:**
- `BracketTournamentDTO` is not fetched if module is disabled
- `useBracket()` returns null (404 on GET `/tournaments/{tid}/bracket`)
- **Seam breaks:** No live bracket data reaches Operations; MatchDetailPanel in bracket product is unavailable
- Bracket-generated play_units cannot feed into a hypothetical unified Operations surface if the module is off

---

## SEAM C: Operations Result/Score → Bracket Advancement (winner_side → next round)

**Flow (PUSH + mutation):**
- Frontend `MatchDetailPanel` (bracket product) calls `api.recordResult({ play_unit_id, winner_side: 'A' | 'B' })`
- This calls `apiClient.recordBracketResult(tournamentId, body)` → `POST /tournaments/{tid}/bracket/results`
- Backend `brackets.py` handler invokes `services.bracket.record_result()` (bracket service) which:
  - Validates play_unit_id exists and result not already recorded (409 if overwrite attempted)
  - **Queries the draw structure** (stored in `BracketSession`) to find advancement rule
  - **Advances winner** into the next round's feed slots (updates `play_units[next_round_slot_id].side_a` or `.side_b` with winner participant_id)
  - **Stores result in `results` table**
- Backend persists both result and updated play_units to bracket schema
- Frontend re-fetches `BracketTournamentDTO` (via 2.5 s poll) → sees new play_unit with populated side_a/side_b for next round

**Data Contract:**
- Request: `{ play_unit_id: string, winner_side: 'A' | 'B', finished_at_slot?: number, walkover?: boolean }`
- Response: Full updated `BracketTournamentDTO` (includes new play_units state with advanced participants)
- Advancement rule: Hardcoded in bracket service based on `event.format` (SE = single-elimination, RR = round-robin) and draw structure

**Trigger & Timing:**
- **Push:** Backend mutation is synchronous; frontend receives full updated state in response
- **Pull:** Frontend's 2.5 s poll picks up the result and updated play_units
- **Contract:** Implicit in response shape; no separate "advancement" field — advancement is materialized as populated side_a/side_b in the next round's play_units

**Advancement logic location:**
- **Backend:** `services.bracket.record_result()` and `services.bracket.draw.advance_participant()` (bracket service logic)
- **No explicit callback to Meet or Operations:** Bracket advancement is self-contained; no cross-module signal
- **Degradation:** If Bracket is disabled, no advancement occurs; results recorded in Meet (matchStateStore) do NOT feed bracket advancement

---

## SEAM D: Operations/Match-State → Display (read-only subscription)

**Flow (PULL):**
- **Live tracking (Meet):** `useLiveTracking()` hook in `MeetDisplayPage` and `MatchControlCenterPage` polls `GET /tournaments/{tid}/match-states` every 5 s
  - Fetches `Record<string, MatchStateDTO>` (matchId → status, scores, timestamps)
  - Writes to `useMatchStateStore` via `setMatchStates(mergedStates)`
  - Merges backend state with local state (preserves frontend-only fields like `postponed`, `playerConfirmations`)
- **Public Display (TV):** `useDisplaySync()` hook in `/display` route polls `GET /tournaments/{tid}/tournament-state` every 10 s (separate read-only hydration)
  - Fetches `TournamentStateDTO` which includes `schedule, config, matches, players, groups`
  - Writes to `useTournamentStore` (schedule + config needed for Gantt rendering)
  - **Separately,** `useLiveTracking()` is also called on `MeetDisplayPage` to get live matchStates
- **Display consumption:** `MeetDisplayPage` renders `<CourtsView>`, `<ScheduleView>`, `<StandingsView>` by reading `matchStates` via selector
  - Gantt Placements indexed by `matchStates[matchId].actualCourtId`, `actualStartTime`, `actualEndTime`
  - Status pills colored by `matchStates[matchId].status` (scheduled | called | started | finished)

**Data Contract:**
- `MatchStateDTO`: `{ matchId, status: 'scheduled' | 'called' | 'started' | 'finished', scores?: MatchScore, actualStartTime?: ISO8601, actualEndTime?: ISO8601, actualCourtId?: number, ... }`
- `TournamentStateDTO`: `{ config, groups, players, matches, schedule, scheduleIsStale, ... }`
- No WebSocket or SSE for live updates; polling is the subscription mechanism

**Trigger & Timing:**
- **Push:** Backend writes to match_states table; no explicit push notification
- **Pull:** Frontend polls every 5 s (match-state) and 10 s (tournament-state); liveness derived from last-successful-sync timestamp
- **Contract:** Two separate polling loops; if one fails, the other continues; liveness status shows 'live' / 'reconnecting' / 'offline' based on age

**Degradation when Operations is disabled:**
- `useLiveTracking()` hook is unconditionally called on both `MeetDisplayPage` and `MatchControlCenterPage`
- If no schedule has been finalized, `matchStates` is empty; Display shows blank state
- If a schedule was finalized before Operations was disabled, match-state data persists in store but is no longer updated (no writes possible)
- **Seam breaks:** No two-way linkage; Display cannot trigger match-state updates; Operations-to-Display is read-only by design

---

## Summary Table: Push vs Pull, Implicit vs Explicit

| Seam | Direction | Push/Pull | Trigger | Contract | Degrades When |
|------|-----------|-----------|---------|----------|---------------|
| A: Schedule → Ops | Meet → Ops | Push (sync) | `generateSchedule()` completed | Implicit (DTO shape) | Meet disabled; no new schedules injected |
| A: Match-state ← Ops | Ops ← Backend | Pull (async) | 5 s interval poll | Explicit (MatchStateDTO) | None; poll continues independently |
| B: Draw → Ops | Bracket → Ops | Pull (async) | 2.5 s interval poll | Explicit (BracketTournamentDTO) | Bracket disabled; 404 on GET bracket |
| C: Results → Advancement | Bracket (self) | Push (sync in response) | `recordResult()` POST | Implicit (response shape includes updated play_units) | Bracket disabled; no advancement logic runs |
| D: Match-state → Display | Ops → Display | Pull (async) | 5 s interval poll (match-state), 10 s (tournament-state) | Explicit (MatchStateDTO, TournamentStateDTO) | None; Display polls independently; shows stale data if Ops disabled |



Key files:
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/hooks/useSchedule.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/hooks/useLiveTracking.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/hooks/useBracket.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/matchStateStore.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/tournamentStore.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/api/bracketClient.tsx
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/display/MeetDisplayPage.tsx
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/display/publicDisplay/useDisplaySync.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/bracket/LiveView.tsx
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/schedule.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/match_state.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/brackets.py

Couplings:
- Frontend schedule generation (useSchedule hook) → Zustand tournamentStore.setSchedule() — synchronous write after solver completes; wires ScheduleDTO.assignments into store
- useLiveTracking() → apiClient.getMatchStates() → useMatchStateStore.setMatchStates() — 5 s polling loop; merges backend state with local
- useBracket hook → apiClient.getBracket() → BracketTournamentDTO in local React state — 2.5 s polling; separate from tournament store
- Bracket MatchDetailPanel → useBracketApi().recordResult() → POST /tournaments/{tid}/bracket/results → backend record_result() service → materialize advancement into play_units — synchronous mutation; response includes updated play_units with winners advanced
- MeetDisplayPage → useLiveTracking() + useDisplaySync() → reads matchStates from useMatchStateStore, tournament state from useTournamentStore — dual polling loops (5 s + 10 s) with independent liveness tracking
- Bracket advancement (record_result) is self-contained in bracket service; no callback to Meet module or a unified Operations module
- Operations/match-state and Bracket/play_unit assignments are dual-tracked; no cross-reference; both feed into Display independently

---

## Module Internals: Meet, Bracket, Operations, Display
## MEET MODULE

**Produces:**
- `ScheduleDTO` (with `ScheduleAssignment[]`, objective score, `ScheduleCandidate[]` pool, soft violations, infeasibility reasons)
- `Advisory` (live operations recommendations: overrun, no_show, running_behind, infeasibility_risk, start_delay_detected)
- `Suggestion` (pre-computed re-optimization proposals with dedup fingerprint)
- `Proposal` (pending schedule changes with impact diff, two-phase commit pipeline)
- `MatchStateDTO` mutations (status: scheduled→called→started→finished, actual_start_time, actual_end_time, score, notes)

**Consumes:**
- `TournamentConfig` (dayStart, dayEnd, intervalMinutes, courtCount, breaks, rankCounts, freezeHorizonSlots, solver options, constraints)
- `PlayerDTO[]` (id, name, groupId, ranks[], availability, minRestMinutes)
- `MatchDTO[]` (id, matchNumber, sideA[], sideB[], eventRank, durationSlots, preferredCourt)
- `MatchStateDTO` (live match transitions and actual times for impact analysis)
- `PreviousAssignmentDTO` (locked assignments for warm-restart/repair with frozen horizon)

**Surfaces/Components:**
- TournamentSetupPage (Setup tab) → TournamentConfigForm, RosterTab, MatchesTab
- SchedulePage (Schedule tab) → DragGantt, ScheduleView, CandidatesPanel, StaleBanner, WarmRestartDialog
- MatchControlCenterPage (Live tab) → GanttChart, WorkflowPanel (UpNextCard, InProgressCard, FinishedCard), MatchDetailsPanel, DisruptionDialog, MoveMatchDialog, DirectorToolsPanel
- SuggestionsRail (live inbox for re-optimize proposals)
- AdvisoryBanner, ConflictBanner (status/alert surfaces)

**API Endpoints Called:**
- POST `/schedule` → stateless single-shot solve returning ScheduleDTO
- POST `/schedule/stream` → SSE progress (model_built, phase transitions, progress events, complete, error)
- POST `/schedule/validate` → fast feasibility check for drag-target without solver
- POST `/schedule/proposals/{kind}` → create warm_restart/repair/manual_edit/director_action proposals
- GET `/schedule/proposals` → active proposals with TTL
- POST `/schedule/proposals/{id}/commit` → apply with optimistic-concurrency version check
- GET `/schedule/advisories` → current live recommendations (polled)
- GET `/schedule/suggestions` → pre-baked suggestions inbox (polled)
- POST `/schedule/director-action` → delay_start, insert_blackout, etc. with config mutation
- PUT `/tournament-state` → persist snapshot (config, players, matches, schedule, version, history)
- GET `/tournament-state` → hydrate on mount

**Data Models:**
- `ScheduleDTO` { assignments: ScheduleAssignment[], candidates: ScheduleCandidate[], softViolations, objectiveScore, status: SolverStatus, infeasibleReasons }
- `ScheduleAssignment` { matchId, slotId, courtId, durationSlots }
- `SoftViolation` { type, matchId, playerId, description, penaltyIncurred }
- `ValidationConflict` { type (court_conflict | player_overlap | availability | rest | break), description, matchId, courtId, slotId }
- `TournamentStateDTO` { version, config, groups, players, matches, schedule, scheduleVersion, scheduleHistory }
- `Proposal` { id, kind, proposedSchedule, proposedConfig, impact: Impact, fromScheduleVersion }
- `Impact` { movedMatches: MatchMove[], affectedPlayers: PlayerImpact[], affectedSchools: SchoolImpact[], metricDelta: MetricDelta }

---

## BRACKET MODULE

**Produces:**
- `PlayUnitDTO` (bracket match units: id, event_id, round_index, match_index, side_a[], side_b[], dependencies[], BracketSlotDTO slots)
- `AssignmentDTO` (bracket match scheduling: play_unit_id, slot_id, court_id, duration_slots, actual_start_slot, actual_end_slot, started, finished)
- `ResultDTO` (match results: play_unit_id, winner_side: "A" | "B" | "none", walkover, finished_at_slot)
- `TournamentDTO` (full bracket state: courts, total_slots, rest_between_rounds, interval_minutes, events[], participants[], play_units[], assignments[], results[])
- `BracketScheduleNextOut` (solver output: status, play_unit_ids[], started_at_current_slot, runtime_ms, infeasible_reasons[])
- `EventDTO` (per-event: id, discipline, format SE|RR, bracket_size, participant_count, rounds[][], status: draft|complete|published)

**Consumes:**
- `BracketCreateIn` (tournament setup: courts, total_slots, rest_between_rounds, interval_minutes, time_limit_seconds, events[])
- `EventIn` (event definition: id, discipline, format SE|RR, participants[], seeded_count, bracket_size, rr_rounds, duration_slots, randomize)
- `ParticipantInput` (participants: id, name, members[], seed)
- `ResultDTO` (for POST /bracket/results to record match outcomes)
- `MatchStateDTO` (via implicit consumption through /bracket API; transitions via bracket/match-action endpoint)

**Surfaces/Components:**
- BracketTab → BracketViewHeader, BracketScheduleSidebar, EventsTab, BracketTab, DrawView
- DrawView (seeded bracket bracket visualization with participant seeding)
- LiveView (Gantt×court timeline with live status rings per ChipState)
- ScheduleView (bracket schedule grid)
- EventsTab (event setup, participant input, format selection)
- BracketRosterTab (participant roster / team roster management)
- MatchDetailPanel (selected play-unit details)
- LiveMatchList (upcoming/in-progress queue)
- BracketEmptyState, BracketInlineNotice (UX guards)

**API Endpoints Called:**
- POST `/tournaments/{tid}/bracket` → create session + populate from CSV/JSON
- GET `/tournaments/{tid}/bracket` → full TournamentDTO (404 on "not yet configured")
- DELETE `/tournaments/{tid}/bracket` → clear all bracket data
- POST `/tournaments/{tid}/bracket/schedule-next` → solve next ready round
- POST `/tournaments/{tid}/bracket/results` → record ResultDTO
- POST `/tournaments/{tid}/bracket/match-action` → start/finish/reset transition with If-Match version header
- POST `/tournaments/{tid}/bracket/validate` → drag feasibility without solve
- POST `/tournaments/{tid}/bracket/pin` → re-pin play-unit + re-solve
- POST `/tournaments/{tid}/bracket/import` → import from JSON
- POST `/tournaments/{tid}/bracket/import.csv` → import pre-paired CSV
- GET `/tournaments/{tid}/bracket/export.{json|csv|ics}` → order-of-play export
- POST `/tournaments/{tid}/bracket/events/{eventId}` → upsert EventDTO
- POST `/tournaments/{tid}/bracket/events/{eventId}/generate` → generate round

**Data Models:**
- `PlayUnitDTO` { id, event_id, round_index, match_index, side_a[], side_b[], duration_slots, dependencies[], slot_a: BracketSlotDTO, slot_b: BracketSlotDTO }
- `AssignmentDTO` { play_unit_id, slot_id, court_id, duration_slots, actual_start_slot, actual_end_slot, started, finished }
- `ResultDTO` { play_unit_id, winner_side, walkover, finished_at_slot }
- `TournamentDTO` { courts, total_slots, rest_between_rounds, interval_minutes, start_time, events[], participants[], play_units[], assignments[], results[] }
- `EventDTO` { id, discipline, format, bracket_size, participant_count, rounds[][], status }
- `ParticipantDTO` { id, name, members[] }

---

## OPERATIONS (Currently Fused into Meet — NOT its own folder)

**Status:** Embedded in Meet's live surfaces. No separate folder yet; conceptually owns match-state mutations and live scheduling decisions.

**Conceptually Produces:**
- `MatchStateDTO` mutations (status transitions via command queue, score entries, timing)
- Impact analysis (overrun cascade detection: directlyImpacted[], cascadeImpacted[], suggestedAction)
- Reoptimization triggers (with frozen horizon freezing in-progress + finished matches)
- Disruption proposals (withdrawal, cancellation, court_closed reason)

**Conceptually Consumes:**
- `MatchStateDTO` (current match status, actual times, scores)
- `ScheduleDTO` (current assignments to compute impact)
- `TournamentConfig` (day structure, slot duration for time↔slot conversion)
- `MatchDTO[]` (player rosters for impact analysis)
- `PlayUnitDTO[]` / `AssignmentDTO[]` (from Bracket when bracket run exists; via implicit access)

**Current Surfaces (all in Meet):**
- GanttChart (timeline with status rings: scheduled | called | started | finished | late; colored by event)
- WorkflowPanel (match workflow: UpNextCard, InProgressCard, FinishedCard)
- MatchDetailsPanel (score editor, match notes, override actions)
- DirectorToolsPanel (court closure manager, start delay, warm restart)
- MatchControlCenterPage (full page: Gantt + Workflow + Details sidebar + Disruption dialog)

**API Endpoints (from Operations context):**
- PUT `/tournaments/{tid}/match-states/{matchId}` → update status/score with If-Match version header (optimistic concurrency)
- GET `/tournaments/{tid}/match-states` → bulk read
- POST `/tournaments/{tid}/commands` → idempotent command queue for match state mutations (Step C/F/G)
- POST `/schedule/director-action` → delay_start, insert_blackout, remove_blackout with config mutation
- POST `/schedule/proposals/warm-restart` → frozen-horizon re-solve with in-progress matches locked

**Global State (matchStateStore — Zustand):**
- `matchStates: Record<string, MatchStateDTO>` → live match status cache
- `liveState: LiveScheduleState | null` → computed derived state (currentTime, matchStates snapshot, lastSynced)
- `pendingCommandsByMatchId: Record<string, string>` → in-flight idempotent command IDs (Step F: command queue integration)
- `recentConflictsByMatchId: Record<string, ConflictRecord>` → last unresolved conflict per match (Step G: stale_version | conflict)
- `canonicalVersionsByMatchId: Record<string, number>` → observed matches.version for optimistic concurrency

**Key Hooks:**
- `useLiveOperations()` → impact analysis, actual-time tracking, trigger-reoptimize
- `useLiveTracking()` → periodic match-state polling (5s cadence)
- `useCommandQueue()` → idempotent command emission + conflict handling (Step F/G)

---

## DISPLAY MODULE

**Produces:**
- Rendered public scoreboard surfaces (read-only mirror; no data mutation)
- Live status indicator (connection state: live | reconnecting | offline)
- Preset-skinned layout (background color, accent, typography)

**Consumes:**
- `TournamentStateDTO` (config, schedule, players, matches) via 10s polling on `/tournament-state`
- `TournamentDTO` / `AssignmentDTO[]` / `ResultDTO[]` (when bracket display active) via 10s polling on `/bracket`
- `MatchStateDTO` (implicitly via TournamentStateDTO sync; no separate match-state poll)
- Display preset configuration (tvDisplayMode: strip|grid|list, tvPreset: court|pitch|midnight|ash|paper|chalk|daylight|sand, tvGridColumns, tvCardSize, tvShowScores, tvAccent)

**Surfaces/Components:**
- DisplayProduct (in-workspace display surface with "Open fullscreen" affordance)
- PublicDisplayPage (standalone /display route; read-only mirror outside AppShell)
- MeetDisplayPage (meet-kind) → CourtsView, ScheduleView, StandingsView
- BracketDisplayPage (bracket-kind) → BracketDrawView, BracketLiveView, BracketResultsView
- CourtsView (grid of live match states by court; color-coded by event + status ring)
- ScheduleView (schedule grid with match statuses)
- StandingsView (event standings/results leaderboard)
- FullscreenButton (fullscreen affordance + link target)
- LiveStatusPill (liveness indicator: green=live, yellow=reconnecting, red=offline)

**API Endpoints (read-only):**
- GET `/tournaments/{tid}/state` → TournamentStateDTO (polled every 10s; no writes)
- GET `/tournaments/{tid}/bracket` → TournamentDTO (polled every 10s when bracket display active; no writes)

**Data Models:**
- `TournamentStateDTO` (config, groups, players, matches, schedule, scheduleVersion, scheduleHistory)
- `ScheduleDTO` (assignments, softViolations, objectiveScore, status)
- `TournamentDTO` (events, participants, play_units, assignments, results)
- `AssignmentDTO` (play_unit_id, slot_id, court_id, actual_start_slot, actual_end_slot, started, finished)
- `ResultDTO` (play_unit_id, winner_side, walkover, finished_at_slot)
- Display preset (tvDisplayMode, tvPreset, tvGridColumns, tvCardSize, tvShowScores, tvAccent, scoringFormat)

---

## CRITICAL COUPLING POINTS

1. **Meet ↔ Operations (via matchStateStore)**
   - `matchStateStore` is **global** (not scoped to Operations folder yet)
   - Stores live match state: status (scheduled|called|started|finished), scores, actual_start_time, actual_end_time, notes
   - Read by MatchControlCenterPage (live tab) for workflow UI rendering and impact analysis
   - Mutations flow through `useLiveOperations.updateActualTime()` → `apiClient.updateMatchState()` → PUT /match-states/{matchId}
   - Step F: `pendingCommandsByMatchId` tracks in-flight idempotent commands for conflict UI
   - Step G: `recentConflictsByMatchId` records server-rejected commands (stale_version | hard-rule conflict)

2. **Operations → Meet (schedule, config, impact)**
   - `useLiveOperations()` reads `tournamentStore.schedule`, `tournamentStore.config`, `tournamentStore.matches`
   - Computes `analyzeImpact()` to detect overrun cascades (directlyImpacted[], cascadeImpacted[])
   - Triggers `triggerReoptimize()` which freezes in-progress/finished matches and calls POST /schedule with frozen horizon
   - Disruption dialog creates `Proposal` with kind=repair or director_action

3. **Display ← Meet / Bracket (read-only polling)**
   - Display polls `GET /tournament-state` every 10s (public /display route)
   - Display polls `GET /bracket` every 10s when bracket display active
   - No bidirectional coupling — TV is strictly **read-only**; updates to match state or schedule land via other surfaces' writes

4. **Bracket ↔ Match State (implicit via bracket/match-action)**
   - Bracket LiveView reads `AssignmentDTO.actual_start_slot`, `AssignmentDTO.actual_end_slot` (derived from assignments)
   - Bracket LiveView reads `ResultDTO` (winners, walkover, finished_at_slot) from `TournamentDTO.results[]`
   - Match state transitions via POST `/tournaments/{tid}/bracket/match-action` (not legacy /match-states endpoint)
   - Bracket does NOT directly consume legacy `MatchStateDTO`; has its own result model (`ResultDTO`)
   - Note: Bracket and Meet currently have **separate match-state persistence** (bracket uses results table, meet uses match_states table)

5. **Meet ↔ Global Stores (clean separation)**
   - `useTournamentStore` (Zustand) holds config, players, matches, schedule, scheduleVersion, scheduleHistory
   - `useMatchStateStore` (Zustand) holds live match state (status, scores, timing, pending commands, conflicts)
   - `useUiStore` (Zustand) holds navigation (activeTab, activeTournamentId, activeTournamentKind, toasts)
   - MatchControlCenterPage hydrates from both stores; operations mutate both stores

6. **Bracket ↔ TournamentStateDTO (shared persistence)**
   - Bracket config/events/participants persisted via PUT `/tournament-state` (same endpoint as Meet)
   - `TournamentStateDTO` has separate `bracketPlayers: BracketPlayerDTO[]` field for bracket roster (data isolation per spec)
   - Bracket stores its results in separate `ResultDTO` model; does not flow through MatchStateDTO

7. **Command Queue Integration (Step F/G)**
   - `useCommandQueue()` emits idempotent commands to POST `/tournaments/{tid}/commands`
   - Each command has client-generated UUID (idempotency key), seen_version (optimistic concurrency)
   - Server responds with status (applied | stale_version conflict | hard-rule conflict)
   - Pending commands tracked in `matchStateStore.pendingCommandsByMatchId` (drives pending-badge UI)
   - Conflicts recorded in `matchStateStore.recentConflictsByMatchId` (drives ConflictBanner)
   - Canonical versions tracked in `matchStateStore.canonicalVersionsByMatchId` (used on next command emit)


Key files:
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/meet/MeetProduct.tsx
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/meet/MatchControlCenterPage.tsx
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/schedule.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/match_state.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/bracket/BracketProduct.tsx
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/api/brackets.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/display/DisplayProduct.tsx
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/matchStateStore.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/store/tournamentStore.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/hooks/useLiveOperations.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/api/client.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/app/schemas.py
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/api/bracketDto.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/frontend/src/products/display/publicDisplay/useDisplaySync.ts
- C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/backend/services/bracket/scheduler.py

Couplings:
- matchStateStore (global Zustand) ← Operations mutations; read by MatchControlCenterPage
- useLiveOperations().triggerReoptimize() → POST /schedule with freezeHorizonSlots from config + locked assignments
- Operations → Display: no direct coupling; Display reads tournament-state independently via 10s poll
- Bracket LiveView reads AssignmentDTO.actual_start_slot via BracketTournamentDTO.assignments[]
- Bracket does NOT consume legacy MatchStateDTO; uses ResultDTO model instead
- useCommandQueue() → POST /tournaments/{tid}/commands with idempotency key + seen_version
- matchStateStore.pendingCommandsByMatchId drives pending-badge UI; matchStateStore.recentConflictsByMatchId drives ConflictBanner
- Meet and Bracket persist config via shared PUT /tournament-state endpoint; separate bracketPlayers[] field for data isolation
- Display is strictly read-only: GET /tournament-state (10s) + GET /bracket (10s); no writes
- TournamentStateDTO schema carries both meet config + bracketPlayers; single persistence snapshot for all data
