> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# SP-C — Frontend control-plane consumption — design

**Date:** 2026-06-24
**Status:** accepted (user brief)
**Branch:** `dev/workspace-suite`
**Program:** "Control Plane First". SP-C makes the frontend **consume** the real
backend control-plane foundation (SP-A modules + signals, SP-B1 module-driven chrome,
SP-B2/B3 enablement). Frontend-only. No Meet/Bracket/Display internals reworked
(except routing correctness). `kind` preserved; module status vocabulary unchanged;
no route-path changes.

## Reconciliation with work already on the branch

Some of the user's brief landed earlier this session and is refined here, not redone:
- **`TournamentCreateDTO.modules?`** — already added (SP-B4). ✓
- **NewWorkspacePage template seeds + Hybrid/Blank enabled** — already done (SP-B4).
  SP-C refines the **post-create routing** to use `primaryModuleForOpen` /
  `defaultTabForModule` from the **returned** modules (the brief's item 2), replacing
  the hardcoded per-template destinations.
- **Bracket Tournament → Display:** the brief says `coming_soon`, but **SP-B3 shipped
  the bracket display this session** and `derive_modules` now seeds bracket→display
  `available`. Seeding `coming_soon` would make that display unreachable on
  template-created bracket workspaces and contradict the backend. SP-C keeps
  **`available`** (the faithful post-B3 translation of "present but not primary").

## Required work

### 1. Frontend DTO parity (`api/dto.ts`)
Add the signals types mirroring the backend (`api/workspace_signals.py`):
```ts
export interface AttentionReasonDTO { code: string; label: string; }
export interface ModuleCountsDTO { enabled: number; available: number; disabled: number; comingSoon: number; }
export interface CollaborationDTO { memberCount: number; activeInviteCount: number; }
export interface WorkspaceSignalsDTO {
  health: 'good' | 'attention' | 'draft' | 'archived';
  attention: AttentionReasonDTO[];
  modules: ModuleCountsDTO;
  setup: Record<string, boolean>;
  collaboration: CollaborationDTO;
}
```
Add `signals?: WorkspaceSignalsDTO` to `TournamentSummaryDTO` (optional — backward
compatible). `modules?` already present.

### 2. NewWorkspacePage — open via the returned modules
After `createTournament`, derive the landing segment from the **returned** summary's
modules: `defaultTabForModule(primaryModuleForOpen(modulesFromDto(created.modules ??
[])))` (fall back to `modulesForWorkspace(created.kind)` when `modules` is absent).
Remove the per-template `destination` + the `'settings'` sentinel. The four seeds
(unchanged from SP-B4): Meet Day `{meet:enabled, bracket:available, display:enabled}`;
Bracket Tournament `{bracket:enabled, meet:available, display:available}`; Hybrid
`{meet:enabled, bracket:enabled, display:enabled}`; Blank `{meet:available,
bracket:available, display:disabled}`. Blank's primary-available module is Meet →
`setup` (the brief's "primary available module" option).

### 3. Hub + Inspector render `signals`
A small pure helper module `hubSignals.ts` derives display values from
`summary.signals` (with safe fallbacks when absent):
- **health/readiness** — a health dot/label (`good`/`attention`/`draft`/`archived`)
  + a readiness summary from `signals.setup` (e.g. "3/4 ready" counting true keys).
- **attention reasons** — `signals.attention[].label` (the inspector lists them; the
  row shows a count/dot).
- **module counts** — `signals.modules` (enabled/available) as a compact metric.
- **collaboration** — `signals.collaboration.memberCount` + `activeInviteCount`.

`HubPage` rows gain a compact signal cluster (health dot, readiness, attention count,
member/invite counts) in the existing dense row — no new card pile. `WorkspaceInspector`
gains a signals section (health + readiness checklist from `setup`, attention reasons,
module counts, collaboration) and **removes** the stale "Sharing & collaborators —
coming in a later phase." line (Settings already links sharing).

### 4. `hubFilters.ts` — signals-aware "Needs attention"
The `attention` predicate prefers signals when present:
`signals.health === 'attention' || signals.attention.length > 0`, falling back to the
current `role === 'owner' && status === 'draft'` when `signals` is absent. `filterCounts`
follows automatically (it uses the predicates).

### 5. Professionalism (no broad redesign)
Dense, calm, high-signal: rows + dividers + small tabular metrics + readiness/checklist
language, restrained accent. No decorative card stacks, no marketing copy, no large
empty surfaces. Reuse existing tokens.

## Tests
- **NewWorkspacePage** — Meet / Bracket / Hybrid / Blank: assert the `modules` seed
  payload AND that navigation goes to the primary module's tab derived from the
  returned modules (mock `createTournament` to return the seeded `modules`).
- **hubFilters** — `attention` filter + count driven by `signals` (a workspace with
  `health:'attention'` or non-empty `attention[]` counts as attention even if active;
  fallback path when `signals` absent).
- **Hub / Inspector render** — given a summary with `signals`, the row/inspector show
  the attention reasons, member/invite counts, and module counts.
- Gate from `products/scheduler/frontend`: `tsc -b`, `vitest run`, `build`. No backend
  changes → no backend tests.

## Constraints
- `kind` preserved (compatibility/fallback). Module status vocabulary unchanged.
- No route-path changes. No Meet-day functionality changes unless a bug is directly
  caused by this slice.
- Focused changes; clear SP-C commits.

## Acceptance criteria
1. Frontend `TournamentSummaryDTO.signals` mirrors the backend; `modules?` present.
2. NewWorkspacePage opens via `primaryModuleForOpen`/`defaultTabForModule` from the
   returned modules; all four templates create + route correctly.
3. Hub rows + Inspector render health/readiness, attention reasons, module counts, and
   member/active-invite counts from `signals`; stale "coming later" copy removed.
4. "Needs attention" filter/count use `signals` with a safe fallback.
5. `tsc` + `vitest` + `build` green; no backend/route changes; Meet untouched.
