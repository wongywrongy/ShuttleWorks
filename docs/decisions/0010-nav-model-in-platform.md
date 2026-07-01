# ADR 0010 — Nav model in the platform layer; `platform ↛ app` enforced as error

**Status:** Accepted (2026-06-30, `dev/workspace-suite`, debt-paydown program)

## Context

The workspace left-sidebar nav model (`buildWorkspaceNav` + the `WsNav*` types
and `SHELL_SEGMENTS`/`ADMIN_SEGMENTS` constants) lived in `src/app/workspace/
workspaceNav.ts`. But its consumers — `WorkspaceShell` and `WorkspaceSidebar` —
live in `src/platform/product-shell/`, and the module contract test also imports
it. So `platform/` imported from `app/`, inverting the intended dependency
direction (the app shell composes the platform, not the reverse).

dependency-cruiser encoded this as `platform-no-app` at **warn** with a comment
that said, verbatim, "ratchet to error after the shared nav config is relocated
out of `app/`." The nav model only ever imported an `AppTab` type from `store/`
and a `ModuleId` type from `platform/product-shell/` — both already
platform-legal — so nothing forced it to live under `app/`.

## Decision

**Relocate the nav model into the platform layer and lock the boundary.**

- `git mv src/app/workspace/workspaceNav.ts → src/platform/product-shell/
  workspaceNav.ts` (with its test). A pure move: the file body is unchanged
  except one self-relative import; the export surface is identical.
- Ratchet the dependency-cruiser `platform-no-app` rule from **warn to error**.
  With the nav model relocated there are **0** `platform → app` imports, so the
  rule is honest, not aspirational.

## Consequences

- **Positive** — `platform/` is now a true foundation layer: it imports from
  neither `products/`/`pages/` (already error) nor `app/` (now error). Any future
  regression fails the build instead of adding to a warn pile.
- **Positive** — the nav model sits with the shell components that render it;
  `WorkspaceShell`/`WorkspaceSidebar` import it as a sibling.
- **Neutral** — `app/` and `pages/` importing the nav model from `platform/` is
  the correct direction (app/pages compose platform) and needs no rule.
- **Cost** — five importers were repointed; verified behavior-preserving by three
  independent reviewers + the full gate (`docs/audits/02-review-1.md`).

## See also

- `docs/audits/01-findings.md` (finding **F-ARCH-1**) · `02-review-1.md`
- [Workspace model](/architecture/workspace-model) · [ADR 0011 — Cross-product boundary policy](/decisions/0011-cross-product-boundary-policy)
