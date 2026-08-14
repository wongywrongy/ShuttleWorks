# How to enable a module

**Goal:** turn a module on or off for a workspace — and understand the
control-plane rules that the backend enforces so a workspace can never end up in
an invalid state.

Module enablement is first-class persisted state in the `workspace_modules`
table, mutated through one guarded route. The frontend Module Dock / catalog
drives it.

## The endpoint

```
PATCH /tournaments/{tournament_id}/modules/{module_id}
body: { status?: "enabled" | "disabled", config?: {...} }
```

`backend/api/workspace_modules.py` is the **single** place the rules are enforced
(the repository's `modules.update` is deliberately unguarded). Both body fields
are optional; an omitted field is preserved (`exclude_unset` — no data loss).

Rows are **seeded lazily** from the workspace `kind` via `derive_modules` the
first time any module path is touched, so a fresh workspace and an existing one
converge without a migration.

## The allowed transitions

```python
_ALLOWED_TRANSITIONS = {
    ("available", "enabled"),
    ("enabled", "disabled"),
    ("disabled", "enabled"),
}
```

`available` is a *derived seed* status, not an operator target — you enable from
it, you don't set it.

## The guards (each a 409 with a stable error code)

| Guard | Rule |
|---|---|
| **Immutable `coming_soon`** | A `coming_soon` module rejects any change. (Defensive only — every module is built, so `modulesFromDto` maps legacy `coming_soon` → `available`.) |
| **Display dependency** | Enabling `display` requires ≥1 enabled operational module (`display_dependency_satisfied`). |
| **No-data-loss disable** | A module with persisted data (meet→matches, bracket→bracket_events) cannot be disabled. |
| **Last operational** | The last enabled operational module (`OPERATIONAL_MODULES = meet, bracket`) cannot be disabled. |
| **Cloud-only** | A module in `CLOUD_ONLY_MODULES` (today: `entries`) cannot be enabled in local mode — `MODULE_REQUIRES_CLOUD`. It is not seeded there either, and an inherited row is filtered at read time. See [Entries](/modules/entries). |

## From the frontend

The Module Dock reads modules via `GET /tournaments/{id}/modules` (hydrated into
the `useWorkspaceModules` hook) and PATCHes a status change. `AppShell` reads the
**real persisted catalog** (never the kind-derived fallback) to decide gated
behaviour like the both-engines unified Operations surface, so an indeterminate
catalog fails safe to single-engine.

## See also

- [Workspace model](/architecture/workspace-model) · [How to add a module](/how-to/add-a-module)
- [ADR 0002 — Workspace as control plane](/decisions/0002-workspace-as-control-plane)
- [ADR 0005 — coming_soon elimination](/decisions/0005-coming-soon-elimination)
