# Settings

Settings is the per-workspace **admin surface** — the chrome for managing a workspace itself. It is
**not a `ModuleId`**: there is no `workspace_modules` row for "settings", it produces no cross-module
DTO, and it does not appear in the module dock. It is documented here as a module because it is a
distinct, owned surface area you will work in.

## What it covers

Rendered by `products/workspace/WorkspaceShellSurface.tsx`, the admin block in the left nav
(`buildWorkspaceNav`'s "Workspace" section) routes these `ws-*` segments:

| Surface | Segment | What it does |
| --- | --- | --- |
| **Overview** | `overview` | the workspace readiness summary (the in-shell view of the Hub signal) |
| **Venue & schedule** | `ws-venue` | the shared venue + day-window fields (see below) |
| **Members** | `ws-members` | People & Access — list members, their roles |
| **Sharing** | `ws-sharing` | the public display link vs collaborator invite links |
| **Modules** | `ws-modules` | the module catalog — enable / disable, subject to the dependency rules |
| **Sync and backups** | `ws-sync` | sync health + state snapshot list / create / restore |
| **Settings** | `ws-settings` | general settings + the danger zone (delete) |

(`display-config` is also a shell-rendered surface, but it belongs to the
[Display module](/modules/display), not to the admin block.)

## Venue & schedule — a shared surface worth noting

`VenueScheduleTab` (`products/workspace/VenueScheduleTab.tsx`) is a workspace-level surface that
hoists the venue + day-window fields that were previously duplicated in both the Meet and Bracket
Configuration tabs:

- **Venue** — Courts (`courtCount`, 1–32) and Slot duration (`intervalMinutes`, 5–240 min).
- **Day window** — Start time (`dayStart`) and End time (`dayEnd`).

It reads and writes the same `tournamentStore.config` fields the two engines use (`setConfig`),
persisting through the AppShell-mounted `useTournamentState` (the debounced `PUT …/state`). No
data-model change — it is a single, shared editing surface over existing config.

## What it owns (backend)

The admin surfaces are served by the **control-plane** routes, not a module router:

- `GET/POST /tournaments`, `GET/PATCH/DELETE /tournaments/{id}` — workspace CRUD.
- `GET/PUT /tournaments/{id}/state` + `…/state/backups`, `…/state/backup`, `…/state/restore/{file}`.
- `GET /tournaments/{id}/modules`, `PATCH …/modules/{moduleId}` — the module catalog.
- `GET /tournaments/{id}/members`, `…/invites`, and `/invites/*` — collaboration.

See [API reference](/api/) for the full endpoint list and [Workspace model](/architecture/workspace-model)
for the module catalog's rules.

## Known notes

- **"Settings" is chrome, not a module.** It is intentionally excluded from the `ModuleId` union and
  the module-contract layer — there is no Settings ↔ X seam. It composes the existing control-plane
  endpoints.
- **The shared `/state` blob is the persistence.** Venue & schedule and most general settings live
  inside the tournament `data` blob, written through the same debounced snapshot path as the rest of
  the workspace document.
