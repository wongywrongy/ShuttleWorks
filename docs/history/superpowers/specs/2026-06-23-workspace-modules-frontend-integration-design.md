> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Workspace Modules — Frontend Integration (sub-project #2) — design

**Date:** 2026-06-23
**Status:** accepted (user approved continuing)
**Branch:** `dev/workspace-suite`
**Program:** Workspace-modules control plane. Builds on #1 (backend `workspace_modules` persistence, commit `6c261ea`).

## Goal

Make the frontend read **real persisted module state** from the backend (with `kind`-derived fallback), and turn the Module Dock into a true launcher with enable/configure/coming-soon/disabled states + working enable/disable actions. No backend or route changes (consumes #1's API).

## Backend contract (from #1)

- `GET /tournaments/{id}/modules` → `WorkspaceModuleDTO[]` where `WorkspaceModuleDTO = { moduleId: 'meet'|'bracket'|'display', status: 'enabled'|'available'|'disabled'|'coming_soon', config: object | null }`.
- `PATCH /tournaments/{id}/modules/{moduleId}` body `{ status?, config? }` → updated `WorkspaceModuleDTO`; 409 (with error code) on dependency / last-operational / has-data / coming_soon-immutable violations.
- `TournamentSummaryDTO.modules: WorkspaceModuleDTO[]` (already populated by #1).

## Status vocabulary alignment

Frontend `ModuleStatus` becomes the backend's exact set: `'enabled' | 'available' | 'disabled' | 'coming_soon'` (drop `'not-enabled'`; the foreign operator module is now `coming_soon`, matching the backend's `derive_modules`). Update `WorkspaceModule.note` copy accordingly:
- `coming_soon` foreign operator → "Bracket is not enabled for this workspace yet." / "Meet is not enabled for this workspace yet." (roadmap framing).
- `coming_soon` display (bracket) → "Display for bracket workspaces is coming."
- `disabled` → "{Label} is turned off — re-enable to use it."

`modulesForWorkspace(kind)` (the **fallback**) derives exactly the backend's seed: `meet` → `{meet:enabled, display:available, bracket:coming_soon}`; `bracket` → `{bracket:enabled, display:coming_soon, meet:coming_soon}`.

## Components

- `api/dto.ts`: add `WorkspaceModuleDTO`; add `modules?: WorkspaceModuleDTO[]` to `TournamentSummaryDTO`.
- `api/client.ts`: `getWorkspaceModules(tid): Promise<WorkspaceModuleDTO[]>`; `patchWorkspaceModule(tid, moduleId, body): Promise<WorkspaceModuleDTO>`.
- `platform/domain/moduleModel.ts`: new `ModuleStatus`; `modulesFromDto(dtos): WorkspaceModule[]` (maps DTO → WorkspaceModule with labels + notes); `modulesForWorkspace(kind)` updated to the backend-matching fallback; `isModuleEnterable` unchanged (enabled|available). Add `isModuleEnableable(status)` = `available | disabled`.
- `platform/domain/useWorkspaceModules.ts` (new hook): `useWorkspaceModules(tid)` → `{ modules, loading, enable(moduleId), disable(moduleId), refetch }`. Fetches `getWorkspaceModules`; `enable/disable` call `patchWorkspaceModule` then refetch; errors surface via the existing toast (axios interceptor already toasts 409s).
- `platform/product-shell/ModuleDock.tsx`: status-aware — `enabled` active/enter; `available`/`disabled` render an inline **Enable** control (calls `onEnable(id)`); `coming_soon` disabled with `note` tooltip. Props gain `onEnable?: (id) => void`. Keep the active-no-op guard for enter.
- `app/AppShell.tsx` (workspace shell): use `useWorkspaceModules(tid)`; pass real `modules` to `WorkspaceShell`/`ModuleDock` (fallback to `modulesForWorkspace(activeTournamentKind)` while loading/empty); wire `onEnable` to the hook's `enable`.
- `products/hub/HubPage.tsx`: `ModuleChips` reads `tournament.modules` (from the summary DTO) when present, else falls back to `modulesForWorkspace(kind)`.

## Constraints

- No backend/route/`kind` changes. Meet workflow untouched. `/tournaments/*` etc. preserved.
- Enable/disable only does what the backend allows (display enable on a meet is the functional case; operator/coming_soon enables are blocked by the backend 409 and surface as a toast — we do NOT fake success).
- tsc clean; full `npx vitest run` green; `npm run build` clean.

## Tests

- `moduleModel`: `modulesFromDto` maps DTO statuses/notes; `modulesForWorkspace` fallback matches backend derivation; `isModuleEnableable`.
- `ModuleDock`: `coming_soon` disabled + note; `available`/`disabled` show an Enable control that calls `onEnable`; `enabled` enters (onSelect), not onEnable.
- `useWorkspaceModules`: fetches modules; `enable` calls patch then refetch (mock apiClient).
- Hub: `ModuleChips` renders from `tournament.modules` DTO when provided; falls back to `kind` when absent.
- Update existing tests touched by the status-vocabulary change (ModuleDock.test, moduleModel.test, WorkspaceShell.test, HubPage.test) — keep them asserting the new statuses/notes.
- Run focused module/dock/hub tests, full Vitest, frontend build before committing.

## Acceptance criteria

1. The workspace shell shows modules from the real `GET /modules` (fallback to `kind` while loading).
2. ModuleDock renders enabled/available/disabled/coming_soon distinctly; Enable on an available/disabled module calls `PATCH` and refetches; coming_soon is non-interactive with a note.
3. Hub chips read the summary DTO's `modules[]` when present.
4. Backend 409s (e.g. enable display with no operator) surface as a toast, not faked success.
5. tsc + full suite + build green; no backend/route changes.

## Deferred

Per-module config UIs (#5 Settings); making a foreign operator module functional (hybrid); the in-dock "configure" deep-links; #3 Hub full redesign; #6 sharing.
