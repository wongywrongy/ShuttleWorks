# ADR 0002 — Workspace as the control plane

**Status:** Accepted (2026-06, branch `dev/workspace-suite`)

## Context

The product began as "one product = one surface": you opened the scheduler, or you opened the
bracket app. As ShuttleWorks grew to cover meets, brackets, live ops, and a public display for the
same event, that model broke down. A real tournament is **one event** that needs several of those
capabilities over its lifecycle (planning → setup → meet-day ops → bracket play → display → exports →
review). Forcing the operator to think in terms of separate apps — and to manage state across them —
did not match how a tournament is actually run.

We wanted the Ubiquiti/UniFi mental model: a **control plane** that lists your sites, where each site
enables the capabilities it needs — not Adobe-style separate applications.

## Decision

Adopt a **workspace control plane**:

- The landing page (`/`) is the **Hub** — a dashboard of every workspace, each with an operational
  [signal](/api/signals).
- A **workspace** is one event's control plane: the durable container for the whole event lifecycle.
- Inside a workspace you enable **modules** (Meet / Bracket / Display) and switch between them with a
  **module dock**; a **workspace shell** provides the common chrome.

Crucially, confine the rename to the **UI facade**. A workspace is implemented by the existing
`tournaments` table and `/tournaments/*` routes; the user-facing "Workspace" vocabulary lives only in
the Hub and shell chrome (via `platform/domain/workspace.ts`). **No route, table, DTO, or
scheduler-core rename** in this phase.

## Consequences

- **Positive** — the UX matches the real-world unit of work (an event), and multiple capabilities
  compose cleanly inside one container; the Hub gives an at-a-glance operational view across events.
- **Positive** — confining the rename to a frontend facade made the redesign low-risk: backend
  contracts and tests were untouched.
- **Negative / cost** — a **vocabulary split**: "workspace" in the UI is "tournament" in the backend.
  This is intentional and documented (the workspace-suite glossary), but it is a real cognitive tax
  for new contributors. A full `Tournament → Workspace` rename (entity, routes, store, DTOs) is
  recognised as a prerequisite for stable independent module packaging and is deferred to a phased,
  dual-path migration.
- **Negative / cost** — module status is currently **derived from the legacy `kind` column** as a
  compatibility bridge before being persisted in `workspace_modules`; `kind` therefore lingers as a
  seed source.

## See also

- [Workspace model](/architecture/workspace-model) · the on-disk `docs/architecture/workspace-suite/glossary.md`
