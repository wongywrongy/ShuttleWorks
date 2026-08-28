# ADR 0010 — Nav model in the platform layer; `platform ↛ app` enforced as error

**Status:** Accepted (2026-06-30, `dev/workspace-suite`, debt-paydown program)

## Context

The workspace left-sidebar nav model (`buildWorkspaceNav` + the `WsNav*` types
and `SHELL_SEGMENTS`/`ADMIN_SEGMENTS` constants) lived in the old app workspace
nav. But its consumers — `WorkspaceShell` and `WorkspaceSidebar` — lived in the
old platform shell, and the module contract test also imported it. So `platform/`
imported from the old app layer, inverting the intended dependency
direction (the app shell composes the platform, not the reverse).

dependency-cruiser encoded this as `platform-no-app` at **warn** with a comment
that said, verbatim, "ratchet to error after the shared nav config is relocated
out of the old app layer." The nav model only ever imported an `AppTab` type from the store
and a `ModuleId` type from the platform shell — both already
platform-legal — so nothing forced it to live under application code.

## Decision

**Relocate the nav model into the platform layer and lock the boundary.**

- The nav model moved into the current console platform shell (with its test). A
  pure move: the file body is unchanged
  except one self-relative import; the export surface is identical.
- Ratchet the dependency-cruiser `platform-no-app` rule from **warn to error**.
  With the nav model relocated there are **0** `platform → app` imports, so the
  rule is honest, not aspirational.

## Consequences

- **Positive** — `platform/` is now a true foundation layer: it imports from
  neither product/page modules (already error) nor app code (now error). Any future
  regression fails the build instead of adding to a warn pile.
- **Positive** — the nav model sits with the shell components that render it;
  `WorkspaceShell`/`WorkspaceSidebar` import it as a sibling.
- **Neutral** — application page code importing the nav model from `platform/` is
  the correct direction (application pages compose platform) and needs no rule.
- **Cost** — five importers were repointed; verified behavior-preserving by three
independent reviewers + the full gate.

## See also

- The archived review findings (including **F-ARCH-1**) are superseded by this accepted decision.
- [Workspace model](/explanation/architecture/workspace-model) · [ADR 0011 — Cross-product boundary policy](/explanation/decisions/0011-cross-product-boundary-policy)
