# Professional UI Polish Pass (sub-project #7, slice 1) — design

**Date:** 2026-06-23
**Status:** accepted (user said "continue")
**Branch:** `dev/workspace-suite`
**Program:** Workspace-modules control plane. Final sub-project. Pure frontend, behavior-preserving.

## Goal

Address the two specific UI complaints from the program brief that the earlier slices didn't:
1. "Active module styling feels like a **tab**, not an installed module."
2. "Module **chips** are too weak to communicate installed capabilities."

Strengthen the **Module Dock** and the **Hub module chips** to read as installed/active modules with clear status — using existing tokens, restrained accent, crisp borders. No behavior, testid, or layout-structure changes (so all 244 tests stay green).

## Module Dock (`platform/product-shell/ModuleDock.tsx`)

The dock is the in-workspace module launcher. Make each module read as a module with a **status dot**, and the active one read as "running", not a selected tab:
- **Status dot** before the label: `enabled` → filled accent dot; `available` → accent ring (hollow); `disabled` → muted filled; `coming-soon` → muted hollow/dashed. Small (`h-1.5 w-1.5`).
- **Active module:** keep `bg-accent/10 text-accent` but add a subtle bottom accent rule / stronger weight so it reads as the running module, not a tab highlight. Non-active enterable modules stay quiet.
- Preserve: `role="tab"`, `data-testid="module-<id>"`, `aria-selected`, `disabled`, `title`, the `· enable` affordance for disabled, and all click behavior (onSelect / onEnable / coming-soon no-op).

## Hub module chips (`products/hub/HubPage.tsx` `ModuleChips`)

Strengthen the chips so installed capability is obvious:
- Add a small status dot inside each chip (filled accent for `enabled`, ring for `available`, muted for `coming-soon`).
- Keep crisp borders; `enabled` stays accent-tinted, others bordered. Keep `data-testid="chip-<id>"`, the `· soon` suffix, and the coming-soon filter (omit foreign operator, keep Display soon). No structural change.

## Constraints

- Existing design tokens only (`@scheduler/design-system` / Tailwind theme); restrained accent; crisp `border-border`. No new colors, no shadow stacks.
- **No behavior/testid/aria changes** — purely additive styling. All 244 tests stay green.
- Meet operator surfaces unchanged in behavior; the dock styling applies uniformly (it's shared chrome).
- tsc clean; full `npx vitest run` green; `npm run build` clean.

## Tests

- Existing `ModuleDock.test` and `HubPage.test` must stay green unchanged (testids/behavior preserved). No new tests required for pure styling; if a status-dot element is given a testid, it may be asserted, but keep assertions on behavior, not classes.

## Acceptance criteria

1. Module Dock shows per-module status dots; the active module reads as the running module, not a tab; all dock behavior + tests preserved.
2. Hub chips carry a status dot and read as installed capabilities; chip behavior + tests preserved.
3. Existing-token, restrained, crisp; tsc + 244 suite + build green; behavior unchanged.

## Deferred

Broader spacing/typography sweep across all surfaces; Sync & Backups / Appearance settings-tab consolidation from Meet panels; icon set for modules; #4 custom-module create.
