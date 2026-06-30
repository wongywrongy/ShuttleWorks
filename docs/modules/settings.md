# Settings

Settings is the per-workspace **control-plane admin** — the chrome for managing a
workspace itself (its venue, people, modules, backups, and lifecycle). This page
is for engineers working in those admin surfaces; it explains what they own and
why Settings is deliberately *not* a module in the engine sense.

## Settings is not a `ModuleId`

The user-facing module union is exactly three engines/outputs:

```ts
// platform/product-shell/types.ts
export type ModuleId = 'meet' | 'bracket' | 'display';
```

There is no `settings` member, **no `workspace_modules` row for "settings"**, it
produces no cross-module DTO, and it has no entry in the module catalog. It is
not part of the module-contract layer either — there is no Settings ↔ X seam.
Settings is documented here as a "module" only because it is a distinct, owned
surface area you will work in; functionally it is composition over the existing
control-plane endpoints.

:::info One word, two surfaces
"Settings" is overloaded. This page covers the whole per-workspace admin block.
Separately, the sidebar gear opens an **app-wide** Settings page
(`GlobalSettingsPage`, route `/settings` — Profile / Security / Sessions /
Modules defaults / Appearance / Notifications). That global page is account- and
browser-scoped, not workspace-scoped, and is out of scope here.
:::

## The admin surfaces

Every surface below is rendered by the shell, not by a module router:
`products/workspace/WorkspaceShellSurface.tsx` switches on the URL segment
(`uiStore.activeTab`) and mounts the matching component. The set of shell-owned
segments is fixed in `app/workspace/workspaceNav.ts` (`SHELL_SEGMENTS` =
`overview`, `display-config`, plus the six `ADMIN_SEGMENTS`).

In the left nav, **Overview** sits at the top (it is `buildWorkspaceNav`'s
always-present `nav.overview` item), and the six `ws-*` segments form the
**Workspace** admin section (`nav.admin.items`) pinned at the bottom.

| Surface | Segment | Component | What it does |
| --- | --- | --- | --- |
| **Overview** | `overview` | `WorkspaceOverview` | the workspace **readiness checklist** — event name/date/type, attention items, and named setup steps with done/incomplete states (incomplete steps link to their section). Not a metrics dashboard. |
| **Venue & schedule** | `ws-venue` | `VenueScheduleTab` | the shared venue + day-window fields (see below) |
| **Members** | `ws-members` | `PeopleAccessTab` | People & Access — lists members and their roles |
| **Sharing** | `ws-sharing` | `SharingTab` | public display link vs collaborator invite links |
| **Modules** | `ws-modules` | `ModulesSettingsTab` | the module catalog — enable / disable per the dependency rules |
| **Sync and backups** | `ws-sync` | `SyncBackupsTab` | state-snapshot list / create / restore |
| **Settings** | `ws-settings` | `GeneralSettingsTab` + `DangerZoneTab` | general details (name / date / status) + the danger zone (archive, delete) |

(`display-config` is also a shell-rendered surface, but it belongs to the
[Display module](/modules/display), not to the admin block.)

:::warning Overview renders `WorkspaceOverview`, not `OverviewTab`
`products/settings/OverviewTab.tsx` is a superseded, counts-oriented variant that
is no longer wired into the shell. The live Overview is the readiness-checklist
`WorkspaceOverview` in `products/workspace/`.
:::

## Venue & schedule — a shared surface worth noting

`VenueScheduleTab` (`products/workspace/VenueScheduleTab.tsx`) is a
workspace-level surface that hoists the venue + day-window fields that were
previously duplicated in both the Meet and Bracket Configuration tabs:

- **Venue** — Courts (`courtCount`, 1–32) and Slot duration (`intervalMinutes`,
  5–240 min).
- **Day window** — Start time (`dayStart`) and End time (`dayEnd`).

It reads and writes the same `tournamentStore.config` fields the two engines use
(via `setConfig`), persisting through the AppShell-mounted `useTournamentState`
(the debounced `PUT …/state`). No data-model change — it is a single, shared
editing surface over existing config. Engine-specific timing (rest between
matches/rounds, breaks) stays in each engine's own Configuration.

## Modules — enablement is real persisted state

The **Modules** surface (`ModulesSettingsTab` → `ModuleCatalogRow`) renders the
workspace's module catalog. Each row's status chip and Enable/Disable action go
through the `useWorkspaceModules` hook, which reads
`GET /tournaments/{id}/modules` and PATCHes a status change. The catalog the tab
shows is the frontend `ModuleId` set — **Meet**, **Bracket**, **Display** — with
capability/dependency copy from `products/settings/moduleCatalog.ts`.

Enablement is **not** a Settings concept; it is first-class state in the
`workspace_modules` table, and every rule (allowed transitions, the Display
dependency, no-data-loss disable, last-operational guard) is enforced server-side
in `backend/api/workspace_modules.py`. Backend 409s surface as toasts — the UI
never fakes success. For the full transition table and guards, see
[How to enable a module](/how-to/enable-a-module).

:::tip Why the catalog only shows three
`moduleCatalog.ts` describes the user-facing engines/outputs. The backend may
hold additional rows (e.g. a foreign-operator row) that the catalog deliberately
does not surface — the tab renders what an operator can act on, not the raw
table.
:::

## What it owns (backend)

The admin surfaces are served by the **control-plane** routes
(`backend/api/tournaments.py`, `workspace_modules.py`, `invites.py`), not a
module router:

| Concern | Routes |
| --- | --- |
| Workspace CRUD | `GET/POST /tournaments`, `GET/PATCH/DELETE /tournaments/{id}` |
| State + backups | `GET/PUT /tournaments/{id}/state`, `…/state/backups`, `…/state/backup`, `…/state/restore/{filename}` |
| Module catalog | `GET /tournaments/{id}/modules`, `PATCH …/modules/{moduleId}` |
| Collaboration | `GET …/members`, `POST …/invites`, and the public `/invites/{token}*` lookup/accept/delete |

See the [API reference](/api/) for the full endpoint list and the
[Workspace model](/architecture/workspace-model) for the module catalog's rules.

## Notes

- **Settings is chrome, not a module.** Intentionally excluded from the `ModuleId`
  union and the module-contract layer — it composes existing control-plane
  endpoints rather than exposing a seam.
- **The shared `/state` blob is the persistence.** Venue & schedule and the
  general settings (name / date / status) live in the tournament `data` blob,
  written through the same debounced snapshot path as the rest of the workspace
  document; backups under Sync are full snapshots of that blob.

## See also

- [Workspace model](/architecture/workspace-model) — the control-plane data model
- [How to enable a module](/how-to/enable-a-module) — the enablement route + guards
- [Display module](/modules/display) — owner of the `display-config` surface
- [ADR 0002 — Workspace as control plane](/decisions/0002-workspace-as-control-plane)
