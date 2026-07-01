# 01 — Findings Backlog (SP-REFACTOR)

**Captured:** 2026-06-30 · **Baseline:** `pre-refactor-20260630` (`6d8d6e8`)
**Method:** codanna + depcruise + jscpd + knip + coverage, every claim confirmed
against current code (grep/read), not the prior write-up.

Ordered **by blast radius ascending** — smallest/safest first. SP-REFACTOR-2
consumes this order directly; deletion items route to SP-REFACTOR-3, doc items to
SP-REFACTOR-4. "Blast radius" = number of files a fix likely touches. "Risk" =
does it touch a live/critical path (match state, scheduling, sync outbox).

> **Headline:** the prior audit's four coupling problems have **materially
> shifted** since the module-contract modernization landed. One is fully
> **resolved**; the other three are now **declared and test-pinned** by
> `moduleContract.ts` but structurally still present. Phase 2 has *less*
> load-bearing architectural work than the prior write-up implied, and *more*
> low-risk cleanup (dead code) than it listed. This is exactly why the workflow
> says not to trust the prior write-up blindly.

---

## Re-validation of the 4 known coupling findings (Phase 1B)

| # | Prior finding | Status today | Evidence |
| --- | --- | --- | --- |
| K1 | No formal module contract | **RESOLVED** | `src/platform/contracts/moduleContract.ts` + `__tests__/moduleContract.test.ts` (23 tests, passing). Typed, reference-identity-enforced ownership of segments/endpoints/DTOs/seams. |
| K2 | Globally-shared Zustand store (`matchStateStore` "belongs to Operations") | **PRESENT, re-scoped** | `src/store/matchStateStore.ts` is consumed by **Meet** (`MatchControlCenterPage`, `SchedulePage`, `DirectorToolsPanel`), **Operations** (`OperationsProduct`), **Bracket** (`LiveView`), and shared `hooks/` + `components/ConflictBanner` + `api/client`. It is *not* Operations-exclusive → see **F-ARCH-3**. |
| K3 | Modules reaching into shared API routes | **PRESENT, now declared** | Single `apiClient`; `meetContract.consumedEndpoints` documents `getMatchStates` ("owned by Operations") + shared `/state`. Structural coupling remains (one client, `/state` co-located with control-plane CRUD) → **F-ARCH-4**. |
| K4 | Implicit cross-module data flow at 3 seams | **NAMED + test-pinned, impl still implicit** | `moduleContract.ts` `emits`/`reactsTo` name `scheduleFinalized` / `drawGenerated` / `matchStateChanged` and the test pins them — but the contract "is never on an app runtime path"; actual flow is still store-subscription/poll edges → **F-ARCH-5**. |
| — | 16 known WARN cross-product violations | **17 today** (14 `no-cross-product` + 3 `platform-no-app`) | see `00-baseline.md`; drift from "16" → **F-DOC-1**. |

---

## Backlog (blast radius ascending)

| ID | Finding | Blast | Risk | Phase |
| --- | --- | --- | --- | --- |
| F-DOC-1 | CLAUDE.md says "16" cross-product violations; actual is 17 | 1 | none | 4-DOCS |
| F-DOC-2 | Bracket advancement route drift: contract comment says `POST /bracket/results`, CLAUDE.md says `/bracket/commands` | ~2 | none | 4-DOCS |
| F-DEAD-1 | `src/services/api.ts` — dead file, zero importers; source of an eslint `no-explicit-any` warning | 1 | none | 3-CLEANUP |
| F-DEAD-2 | `src/products/settings/OverviewTab.tsx` — dead file; removing it also erases 1 `no-cross-product` violation (→`hubSignals`) | 1 | none | 3-CLEANUP |
| F-DEAD-3 | 3 dead selector exports in `src/store/selectors.ts` (`useMatchMap`, `useGroupMap`, `useAssignmentByMatchId`); `usePlayerMap` stays (used) | 1 | none | 3-CLEANUP |
| F-DEAD-4 | 16 remaining knip "unused files" (mostly `products/meet/{roster,schedule,setup,tournaments}`) — each independent, verify-then-delete | ~16 | low | 3-CLEANUP |
| F-DEAD-5 | 37 unused exports + 59 unused exported types — many are "un-export (used internally)" not "delete" (e.g. `DtoName`/`DtoRegistry`); triage each | many | low | 3-CLEANUP |
| F-DEP-1 | 12 unused deps + 2 unused devDeps in frontend `package.json` (incl. several `@radix-ui/*`) — **knip dep-detection over-reports**; verify each import path before removing | 1 | low | 3-CLEANUP |
| F-DUP-1 | Duplication 2.38% (107 clones) — low; no action beyond opportunistic dedup when a slice is already in the file | varies | low | defer / opportunistic |
| F-COV-1 | Backend 0%-coverage modules — confirm used-vs-dead first: `bracket/cli.py` (129 LOC), `csv_importer.py` (69), `round_robin.py` (13%) | ~3 | med | 3 (if dead) / 2 (safety-net if live) |
| F-SAFETY-1 | Safety-net-first: characterization tests for critical low-coverage before ANY refactor touches them — `sync_service.py` (72%, crash-safe outbox), `matchStateStore.ts` (36%/16% funcs) | tests only | **high path** | 2-REFACTOR (prereq) |
| F-LINT-1 | 87 eslint warnings (34 `set-state-in-effect`, 22 `no-explicit-any`, 14 `exhaustive-deps`, 9 `only-export-components`). Ratchet candidates — but fixing the hooks rules **changes behavior**, so out of scope for a behavior-preserving program | many | med | note / defer (not Phase 2) |
| F-ARCH-1 | `platform-no-app` (3): `WorkspaceSidebar`/`WorkspaceShell`/`moduleContract.test` → `src/app/workspace/workspaceNav.ts`. Fix = relocate `workspaceNav` out of `app/` into a platform-visible layer | ~4 | med | 2-REFACTOR |
| F-ARCH-2 | `no-cross-product` (14) — ratchet WARN→ERROR via strangler-fig. Clusters: workspace→settings (6), operations→bracket (3), +hub/meet edges. Some vanish with F-DEAD-2 | varies | med | 2-REFACTOR |
| F-ARCH-3 | `matchStateStore` ownership — cross-cutting (Meet+Operations+Bracket). Prior "move to Operations" would **create** cross-product imports from Meet/Bracket. **Two reasonable approaches, no clear winner from code** | many | **high** | **2 — STOP/escalate to Kyle** |
| F-ARCH-4 | Shared API-route coupling — single `apiClient`, `/state` co-located with control-plane CRUD in the tournaments router; declared but not separated. Large, architectural | many | high | 2 / ADR / defer |
| F-ARCH-5 | Seams (`scheduleFinalized`/`drawGenerated`/`matchStateChanged`) named+pinned but implementation still implicit store/poll edges. May be **intentional** (contract is documentation-only by design) | many | high | 4-ADR / defer |

---

## Detail & evidence

### F-DOC-1 — depcruise count drift (docs)
CLAUDE.md "Architecture boundaries" cites "16 known WARN-level cross-product
import violations." Actual (`00-dependency-graph-baseline.json`): 17 = 14
`no-cross-product` + 3 `platform-no-app`. Fix in Phase 4; also update after
F-DEAD-2 / F-ARCH-2 reduce the count.

### F-DOC-2 — bracket advancement route drift (docs, verify)
`moduleContract.ts` (bracketContract, ~line 172) comments "advancement is
intra-bracket today (`POST /bracket/results`)". CLAUDE.md says result recording
"flows through the command path `POST /bracket/commands` (idempotent), not the
legacy `/bracket/results`." One of these is stale — resolve against the actual
router in Phase 4A (check `backend/api/brackets.py`), not from memory.

### F-DEAD-1 / F-DEAD-2 / F-DEAD-3 — confirmed dead (spot-verified)
- `services/api.ts`: grep for any `from '…/services/api'` import → **0 hits**.
  knip agrees. It is the legacy pre-`api/client.ts` service. Safe delete.
- `products/settings/OverviewTab.tsx`: **0** importers; knip agrees; it is the
  `from`-side of `no-cross-product: OverviewTab → hubSignals`. Delete removes the
  violation for free.
- `store/selectors.ts`: knip flags exactly `useMatchMap`/`useGroupMap`/
  `useAssignmentByMatchId` (not `usePlayerMap`, which `MatchesTab` +
  `MatchesSpreadsheet` import). Precise — remove the 3 dead exports, keep the file.

> **knip calibration:** on the items spot-checked, knip was precise (correct dead
> `ScheduleView` among 3 same-named files; per-export granularity). Treat its
> file/export findings as **high-confidence but still verify-each** in Phase 3
> (`codanna retrieve callers`), because "unused export" sometimes means
> "used internally, drop the `export`" — not "delete."

### F-DEP-1 — unused deps: low confidence
knip lists 9 `@radix-ui/*` + `date-fns` + `class-variance-authority` +
`tailwindcss-animate` as unused. This is the **least trustworthy** knip category
(misses re-exports through the design-system, dynamic/tailwind usage). Each must
be proven unused by a real import search before removal. Low priority.

### F-SAFETY-1 — the safety net that gates Phase 2
Per SP-REFACTOR-2 "Safety net first": before any refactor slice touches these,
write characterization tests pinning **current** behavior:
- `backend/services/sync_service.py` — 72%, and it is the crash-safe outbox
  (mirrors SQLite→Supabase). A regression here is silent data-mirror loss.
- `src/store/matchStateStore.ts` — 35.95% lines / 16.66% funcs, and it is the
  live match-state store on the Operations run path.
These two are the highest risk×exposure in the codebase and must be safety-netted
regardless of which architectural finding is tackled first.

### F-ARCH-3 — the judgment call (likely STOP)
`matchStateStore` lives in the shared `src/store/` layer, which is *allowed* by
the documented layer conventions (`src/store/README.md`: shared stores live
here). The prior audit's "move it to Operations" would relocate it under
`products/operations/`, at which point **Meet** (3 files) and **Bracket**
(`LiveView`) importing it become `no-cross-product` violations — trading a
legal shared-layer store for new boundary breaks. There is **no clear winner
from the code alone**; this is a Kyle decision (SP-REFACTOR-2 STOP condition:
"two reasonable architectural approaches, no clear winner"). Options to bring
him: (a) leave in shared `store/`, formalize ownership via the contract only
(cheap, honest); (b) split into an Operations-owned core + a thin shared
read-selector; (c) full move + accept/relocate the Meet/Bracket consumers.

### F-ARCH-4 / F-ARCH-5 — declared, not separated
K3/K4 are now *documented* by the contract but the underlying structure (one
`apiClient`, `/state` co-located with CRUD; seam data-flow via store/poll) is
unchanged. Whether to physically separate them is a large, high-risk
architectural bet — candidates for an ADR (Phase 4) and Kyle's prioritization,
not an unattended Phase-2 slice.

---

## Recommended Phase-2 entry point
Start with the **zero-risk, blast-1 items** to build momentum and shrink the
violation count before the architectural work: F-DEAD-1 → F-DEAD-2 → F-DEAD-3
(all Phase 3 deletions, but so cheap and de-risking they can precede the harder
slices), then **F-SAFETY-1** (characterization tests) as the mandatory gate
before any of F-ARCH-1/2. Escalate **F-ARCH-3** to Kyle before touching it.

## Explicitly out of scope for the behavior-preserving program
- F-LINT-1 hook-rule fixes (change behavior) and the broad ruff set (1506
  stylistic findings) — both are separate quality initiatives, not this program.
- F-DUP-1 beyond opportunistic dedup (2.38% is already low).
