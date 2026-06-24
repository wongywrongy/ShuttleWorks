# Workspace Settings Center (sub-project #5, slice 1) — design

**Date:** 2026-06-23
**Status:** accepted (user said "continue")
**Branch:** `dev/workspace-suite`
**Program:** Workspace-modules control plane. Builds on #1/#2/#3. Pure frontend (uses existing endpoints).

## Why before #4

#4 (custom-module create) is gated by the backend's single-`kind` create — true hybrid/custom creation isn't functional yet, and the `/new` template flow already presents modules honestly. The high-value next step is the **Settings center**, which turns the persisted modules + dependency rules (#1) into a real management surface.

## Goal

A dedicated, professional **Workspace Settings** surface (additive route `/tournaments/:id/settings`) replacing the "raw form rows" feel. This slice ships the settings **shell + tabs** and three **functional** tabs — **General**, **Modules**, **Danger Zone** — using endpoints that already exist. The remaining tabs (People & Access, Sharing, Sync & Backups, Appearance) appear as labeled tabs with honest "coming in a later phase" placeholders (People/Sharing land in #6; Appearance/Sync reuse existing Meet panels in a later consolidation). Meet's existing Setup rail is left untouched this slice (additive, not a migration).

## Route + shell

- New additive route in `app/App.tsx`: `/tournaments/:id/settings` → `<AuthGuard><WorkspaceSettingsPage/></AuthGuard>` (lazy), mirroring `/new`. `/tournaments/:id/*` and all existing routes unchanged.
- `products/settings/WorkspaceSettingsPage.tsx` (new top-level product area `products/settings/`): standalone full-screen page (same header lockup as `/new`: `ShuttleWorksMark` + back-to-workspace). Left tab rail (vertical), right content pane. Tabs: General · Modules · People & Access · Sharing · Sync & Backups · Appearance · Danger Zone. Active tab via local state (default General).
- Reachable from: the Hub inspector ("Settings" link) and/or the workspace — this slice adds a **"Settings" entry from the Hub inspector** (a secondary button) → `/tournaments/:id/settings`. (Shell entry point is a later wire-up.)

## Functional tabs (this slice)

- **General** (`GeneralSettingsTab`): edit name, date, status (`draft|active|archived`) via `apiClient.updateTournament(tid, {...})`. Loads current values via `apiClient.getTournament(tid)`. Save button; success/again toasts via interceptor.
- **Modules** (`ModulesSettingsTab`): the management surface. Lists all modules (via `useWorkspaceModules(tid)`): each shows label, status badge, note, and an action by status — `enabled` → "Enabled" (+ Disable if allowed), `available`/`disabled` → **Enable**, `coming_soon` → disabled with roadmap note. Enable/Disable call the hook (`PATCH`); backend dependency / last-operational / has-data / coming_soon 409s surface as toasts (no faked success). Shows the dependency rules as helper text ("Display needs an enabled Meet or Bracket"; "A workspace keeps at least one operational module").
- **Danger Zone** (`DangerZoneTab`): **Archive** (`updateTournament status=archived`) and **Delete** (confirm modal → `deleteTournament` → navigate `/`). Clear consequence copy (reuse the Hub delete copy).

## Placeholder tabs (this slice)

People & Access, Sharing, Sync & Backups, Appearance render a centered muted panel: a one-line description + "Coming in a later phase." (People & Access + Sharing → #6; Appearance/Sync → reuse existing Meet panels in a later consolidation.) Honest — not fake controls.

## Components (`products/settings/`)

- `WorkspaceSettingsPage.tsx` — shell: header, tab rail, content switch, loads tournament summary.
- `settingsTabs.ts` — pure tab list (id, label) + a small `SETTINGS_TABS` const (unit-testable shape).
- `GeneralSettingsTab.tsx`, `ModulesSettingsTab.tsx`, `DangerZoneTab.tsx`, `ComingSoonTab.tsx`.
- Hub inspector gains a "Settings" secondary action (`WorkspaceInspector.tsx`).

## Constraints

- No backend/DB/DTO/solver changes; uses existing `getTournament`/`updateTournament`/`deleteTournament`/`/modules`. Routes additive (`/settings`); `/tournaments/*`, `/new`, Meet Setup untouched.
- Meet workflow unchanged; no edits to `products/meet/*` behavior.
- Module mutations only do what the backend allows; 409s surface as toasts.
- tsc clean; full `npx vitest run` green; `npm run build` clean.

## Tests

- `settingsTabs`: the tab list contains the seven expected tabs in order.
- `WorkspaceSettingsPage`: renders the tab rail; clicking a tab switches the content pane; default is General.
- `GeneralSettingsTab`: loads current name; Save calls `updateTournament` with edited values (mock apiClient).
- `ModulesSettingsTab`: renders modules from the hook; clicking Enable on an available module calls the patch (mock `useWorkspaceModules`/apiClient); coming_soon has no Enable.
- `DangerZoneTab`: Archive calls `updateTournament status=archived`; Delete (confirm) calls `deleteTournament` then navigates `/`.
- Hub inspector: shows a "Settings" action linking to `/tournaments/:id/settings`.
- Run focused settings tests, full Vitest, build before committing.

## Acceptance criteria

1. `/tournaments/:id/settings` renders a professional settings center with the seven tabs.
2. General edits persist via `updateTournament`; Modules enable/disable works via `/modules` with dependency 409s toasted; Danger Zone archives/deletes.
3. Placeholder tabs are honest ("coming in a later phase"), not fake controls.
4. Reachable from the Hub inspector; routes additive; Meet untouched; tsc + suite + build green.

## Deferred

People & Access + Sharing functional surfaces (#6); Appearance/Sync consolidation from Meet panels; removing the Meet Setup settings rail; per-module config editors; shell-level settings entry point.
