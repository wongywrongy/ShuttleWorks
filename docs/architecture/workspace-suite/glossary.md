> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time analysis map from the 2026-06 workspace-suite redesign, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and the VitePress site. (Labeled in SP-REFACTOR Phase 6.)

# Workspace Suite — Glossary & Migration Rules

Companion to `docs/superpowers/specs/2026-06-23-workspace-suite-architecture-design.md`.
This is the canonical vocabulary for the suite. When code and docs disagree with
this file, this file wins for *user-facing* naming; internals may lag (see rules).

## Terms

- **Workspace** — the durable container for a real event lifecycle. Spans planning
  days, setup, meet-day ops, bracket play, display config, exports, backups, and
  post-event review. The new user-facing product noun. Implemented today by the
  `tournaments` table / `/tournaments/*` routes (internal name unchanged).
- **Workspace Module** (formerly "Product Mode") — Meet, Bracket, or Display, **enabled
  inside a workspace** (Ubiquiti/UniFi control-plane model, not Adobe-style separate
  apps). A workspace's module set is derived from `kind` for now — **`kind` is a
  temporary compatibility bridge** to a future persisted `modules[]` (not yet
  implemented). Module statuses: `enabled` / `available` / `not-enabled` / `coming-soon`.
- **Module Dock** — the in-workspace control that lists the workspace's modules and
  switches between the enterable ones (the old "product switcher"). Non-enabled modules
  stay visible with enablement copy ("Bracket is not enabled for this workspace.").
- **Module Catalog** — the full set of suite modules (Meet / Bracket / Display) and
  their per-workspace status; `modulesForWorkspace(kind)` derives it today.
- **Workspace Shell** — the common chrome shown once a workspace is open: workspace
  identity/status, the Module Dock, role/connection indicators, shared sync health.
  Stable and minimal; not a second dashboard.
- **Hub** — the pre-workspace control plane: workspace list (with enabled-module chips),
  recent, create/import, backups, sharing, global settings. Today: `products/hub/HubPage`;
  creation via the dedicated `products/hub/NewWorkspacePage` (`/new`, module templates).
- **Core Platform** — non-user-facing shared foundation: workspace identity, auth/
  roles, command queue, sync/outbox, API client, shared roster/courts/time, design
  system, scheduler-core integration.

## Vocabulary migration rules (Phase 1)

| Layer | Phase-1 name | Later name |
|---|---|---|
| User-facing UI (Hub + shell chrome) | Workspace | Workspace |
| Frontend domain facade | Workspace (`platform/domain/workspace.ts`) | Workspace |
| Deep Meet/Bracket UI internals | tournament (unchanged) | Workspace (gradual) |
| Backend public DTO facade | tournament (unchanged) | Workspace aliases where safe |
| API routes | `/tournaments/*` retained | add `/workspaces/*`, then deprecate |
| DB table | `tournaments` retained | rename only if worth the risk |
| Scheduler core models | `Tournament*` retained | rename only with focused tests |

**Hard rule for Phase 1:** the rename is confined to the Hub and shell chrome via the
frontend facade. No route, table, DTO, or scheduler-core rename. The kind badge that
labels a bracket event "TOURNAMENT" is a *separate* naming concern (event kind, not
container) and is intentionally left unchanged in this phase.
