# Settings

Administration and Setup are the per-workspace **control-plane** surfaces. The
phase-based navigation is Setup / Participants / Competition / Operations /
Publish / Administration; it is ratified product IA, while the legacy
`AppTab` values remain renderer keys behind canonical workflow URLs. This page
explains the control-plane owners and why they are deliberately *not* modules
in the engine sense.

## Settings is not a `ModuleId`

The user-facing module union is exactly four intake/engine/output modules:

```ts
// platform/product-shell/types.ts
export type ModuleId = 'meet' | 'bracket' | 'display' | 'entries';
```

There is no `settings` member, **no `workspace_modules` row for "settings"**, it
produces no cross-module DTO, and it has no entry in the module catalog. It is
not part of the module-contract layer either — there is no Settings ↔ X seam.
Settings is documented here as a "module" only because it is a distinct, owned
surface area you will work in; functionally it is composition over the existing
control-plane endpoints.

:::info Two scopes
This page covers the per-workspace control plane. Separately, the sidebar gear
opens an **app-wide** settings page
(`GlobalSettingsPage`, route `/settings` — Profile / Security / Sessions /
Modules defaults / Appearance / Notifications). That global page is account- and
browser-scoped, not workspace-scoped, and is out of scope here.
:::

## The workflow control-plane surfaces

`platform/product-shell/workspaceNav.ts` is the canonical route and label
model. `SetupProduct` owns `/setup` and `/setup/*`; `PublishProduct` owns
`/publish/*`; `WorkspaceShellSurface` composes Overview and Administration.
Legacy `ws-*` segments remain internal compatibility keys and are not
user-facing route vocabulary.

| Surface | Segment | Component | What it does |
| --- | --- | --- | --- |
| **Overview** | `overview` | `WorkspaceOverview` | phase summary and next actions |
| **Setup checklist and sections** | `setup`, `setup/*` | `SetupProduct` | one master readiness checklist; section editors or read-only domain summaries |
| **Site** | `publish/site` | `PublishProduct` → `SharingTab` | single owner of entrant, draw, and result publication flags |
| **Links and embeds** | `publish/links` | `PublishProduct` → `SharingTab` | capability links, embeds, and token rotation |
| **Team** | `administration/team` | `PeopleAccessTab` | members, real identities, roles, and invites |
| **Modules** | `administration/modules` | `ModulesSettingsTab` | module enablement and dependency guards |
| **Backups** | `administration/backups` | `SyncBackupsTab` | state-snapshot list, create, and restore |
| **Activity** | `administration/activity` | `ActivityTab` | workspace activity history |
| **Workspace settings** | `administration/lifecycle` | `GeneralSettingsTab` + `DangerZoneTab` | lifecycle summary, archive and unarchive, and destructive actions |

(`display-config` is also a shell-rendered surface, but it belongs to the
[Display module](/reference/modules/display), not to the admin block.)

The master readiness checklist lives only at `/setup`. Overview can summarize
phase and next actions, but it must not become a second checklist owner.

## Venue ownership

Setup Venue is the organizer-facing owner before a plan exists. Once schedule
assignments exist, the Setup API reports `authority: domain`, Setup renders the
actual schedule-backed summary, and editing moves to Operations · Plan. This is
the same no-parallel-truth rule Events uses once Competition owns draws.

Before that handoff, Setup stores venue identity, address, accessibility notes,
and the structured court rows in the existing workspace document through the
Setup facade. There is no parallel readiness table.

## Modules — enablement is real persisted state

The **Modules** surface (`ModulesSettingsTab` → `ModuleCatalogRow`) renders the
workspace's module catalog. Each row's status chip and Enable/Disable action go
through the `useWorkspaceModules` hook, which reads
`GET /tournaments/{id}/modules` and PATCHes a status change. The catalog the tab
shows is the frontend `ModuleId` set — **Meet**, **Bracket**, **Display**, and
**Entries** (cloud-only) — with
capability/dependency copy from `modules/settings/moduleCatalog.ts`.

Enablement is **not** a Settings concept; it is first-class state in the
`workspace_modules` table, and every rule (allowed transitions, the Display
dependency, no-data-loss disable, last-operational guard) is enforced server-side
in `apps/api/src/workspaces/workspace_modules.py`. Backend 409s surface as toasts — the UI
never fakes success. For the full transition table and guards, see
[How to enable a module](/how-to/enable-a-module).

:::tip Why the local builder shows three
`moduleCatalog.ts` includes Entries, but Entries is seeded only for cloud workspaces.
The local `/new` builder offers Meet, Bracket, and Display; the tab renders what an
operator can act on, not merely the raw table.
:::

## What it owns (backend)

The admin surfaces are served by the **control-plane** routes
(`apps/api/src/workspaces/tournaments.py`, `apps/api/src/workspaces/workspace_modules.py`,
`apps/api/src/identity/invites.py`), not a
module router:

| Concern | Routes |
| --- | --- |
| Workspace CRUD | `GET/POST /tournaments`, `GET/PATCH/DELETE /tournaments/{id}` |
| State + backups | `GET/PUT /tournaments/{id}/state`, `…/state/backups`, `…/state/backup`, `…/state/restore/{filename}` |
| Module catalog | `GET /tournaments/{id}/modules`, `PATCH …/modules/{moduleId}` |
| Collaboration | `GET …/members`, `POST …/invites` (link or email invites), and the public `/invites/{token}*` lookup/accept/delete |
| Display link | `GET /tournaments/{id}/display-token` · `POST …/display-token/rotate` (owner-gated; see [Display](/reference/modules/display)) |

See the [API reference](/reference/api/) for the full endpoint list and the
[Workspace model](/explanation/architecture/workspace-model) for the module catalog's rules.

## Notes

- **Settings is chrome, not a module.** Intentionally excluded from the `ModuleId`
  union and the module-contract layer — it composes existing control-plane
  endpoints rather than exposing a seam.
- **The shared workspace document remains the persistence.** Setup-owned values
  and general settings live in the tournament `data` blob; Backups are complete
  snapshots of that blob. Derived readiness is never persisted beside it.

## See also

- [Workspace model](/explanation/architecture/workspace-model) — the control-plane data model
- [How to enable a module](/how-to/enable-a-module) — the enablement route + guards
- [Display module](/reference/modules/display) — owner of the `display-config` surface
- [ADR 0002 — Workspace as control plane](/explanation/decisions/0002-workspace-as-control-plane)
