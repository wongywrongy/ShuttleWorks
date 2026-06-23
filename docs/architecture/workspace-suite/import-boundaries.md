# Import Boundary Rules

Dependency rules for the suite. These are *conventions* in Phase 1 (no lint
enforcement yet); a future task may encode them as ESLint `no-restricted-imports`
or an import-linter config. They derive from frontend-ownership-map.md and
backend-ownership-map.md.

## Frontend rules

1. **Product modes must not import each other's internals.** `features/bracket/*`
   must not import from `features/schedule/*`, `features/liveOps/*`, etc., and vice
   versa. Meet must not import Bracket internals; Bracket must not import Meet internals.
2. **Cross-product shared state flows through the platform layer** (`api/`, `hooks/`
   identity hooks, `store/`, `services/`) or a workspace-level facade — never by
   reaching into another product's store/UI.
3. **Display consumes read models / public data**, not operator stores. `pages/
   PublicDisplayPage.tsx` and `pages/publicDisplay/*` must not import operator-only
   feature internals.
4. **The user-facing container noun comes from `platform/domain/workspace.ts`.** Hub
   and shell chrome read display copy from the facade rather than hard-coding
   "tournament"/"workspace" strings. (Event-*kind* labels like "MEET"/"TOURNAMENT"
   badge are a separate concern, not governed by this rule yet.)
5. **The design system is a leaf.** `@scheduler/design-system` must not import from
   `products/scheduler/frontend/src/*`.

## Backend rules

6. **Product route modules use their own services + shared repositories.** No
   cross-product service imports (e.g., `api/brackets.py` must not import
   `services/schedule_impact.py`); cross-product needs go through workspace-level
   services or explicit APIs.
7. **Meet must not read Bracket service internals directly, and vice versa.**
8. **Display data is prepared as read models** for public output, not by exposing
   operator service internals.

## Allowed shared dependencies (both stacks)

- Workspace identity, shared roster/courts/time primitives, commands/write-status,
  realtime read models, and product-specific public APIs are the sanctioned
  cross-product contracts. Everything else is product-private.
