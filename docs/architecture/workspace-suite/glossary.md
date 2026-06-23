# Workspace Suite — Glossary & Migration Rules

Companion to `docs/superpowers/specs/2026-06-23-workspace-suite-architecture-design.md`.
This is the canonical vocabulary for the suite. When code and docs disagree with
this file, this file wins for *user-facing* naming; internals may lag (see rules).

## Terms

- **Workspace** — the durable container for a real event lifecycle. Spans planning
  days, setup, meet-day ops, bracket play, display config, exports, backups, and
  post-event review. The new user-facing product noun. Implemented today by the
  `tournaments` table / `/tournaments/*` routes (internal name unchanged).
- **Product Mode** — a full-screen focused surface inside an open workspace: Meet,
  Bracket, or Display. Replaces the "one app with many tabs" mental model.
- **Workspace Shell** — the common chrome shown once a workspace is open: workspace
  identity/status, product switcher, role/connection indicators, shared sync health.
  Stable and minimal; not a second dashboard.
- **Hub** — the pre-workspace surface: workspace list, recent, create/import,
  backups, sharing, global settings, product launcher. Today: `TournamentListPage`.
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
