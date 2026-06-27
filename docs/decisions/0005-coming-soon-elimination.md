# ADR 0005 — `coming_soon` elimination

**Status:** Accepted (2026-06, branch `dev/workspace-suite`)

## Context

The module status lifecycle was designed when not every module was finished. A `coming_soon` status
let the module catalog advertise a module that existed in the UI but was not yet usable — the dock
could show it greyed out with "coming soon" copy. By the workspace-suite redesign, **all three
user-facing modules (Meet, Bracket, Display) are fully built and shippable.** Nothing is genuinely
"coming soon" any more, and keeping `coming_soon` as a live, settable status created traps: a module
could be seeded into a status that the dependency rules and UI then had to special-case, and an
operator could land a workspace in a non-actionable state.

## Decision

**Retire `coming_soon` as an active, seedable status** without removing the enum value (so historical
rows and migrations remain valid):

- The settable statuses are `enabled`, `available`, `disabled`.
- `coming_soon` is **immutable** — `PATCH …/modules/{moduleId}` on a `coming_soon` module returns
  `409 MODULE_IMMUTABLE`.
- It is **never seeded on create** — `normalize_module_seed` rejects `coming_soon` in an explicit
  `modules[]` seed, and `derive_modules(kind)` only ever produces `enabled` / `available`.
- It survives in the data model **only** where a migration explicitly seeded it; new workspaces never
  reach it.

## Consequences

- **Positive** — every module a workspace shows is **actionable**: enable it, it works. The dock and
  the dependency rules no longer special-case an "exists but unusable" state.
- **Positive** — the [signals](/api/signals) layer still counts `comingSoon` modules (the
  `ModuleCountsDTO.comingSoon` field remains) so any legacy rows are visible, without making the status
  reachable for new data.
- **Negative / cost** — the enum value lingers as dead-ish surface area; a future cleanup could drop it
  entirely once no migrated rows remain. Retiring-without-removing was chosen to keep the change
  behaviour-preserving for existing databases.

## See also

- [Workspace model → module status lifecycle](/architecture/workspace-model#module-status-lifecycle)
