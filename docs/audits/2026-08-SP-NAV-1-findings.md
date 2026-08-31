# SP-NAV-1 — Phase 0 findings and rulings

**Audit date:** 2026-08-30
**Audit base:** `f0920a91` plus the existing operator-console working tree
**Gate:** Phase 0 was read-only. The owner approved every recommendation on
2026-08-30 before implementation resumed.

## Track A — active-state contrast

| ID | Finding | Evidence | Classification | Blast radius | Correction |
| --- | --- | --- | --- | --- | --- |
| F-NAV-A1 | The selected leaf combines the tinted `action-selected-bg` with `text-on-accent`, which is authored for a solid accent. | `WorkspaceSidebar.tsx`; `tokens.css` aliases `accent-bg` and `accent-ink` | token-defect | Active workflow leaf | Add and consume a semantic selected foreground paired with the tint. |
| F-NAV-A2 | The pair measures about 1.08:1 in light and 1.21:1 in dark, below 4.5:1. | computed from shipped token hex values | token-defect | Both supported themes | Assert the pair in CI. |
| F-NAV-A3 | Dark theme is shipped, selectable, and persisted. | theme preferences and both token scopes in `tokens.css` | works-as-designed | All token consumers | Keep both themes in scope. |
| F-NAV-A4 | Related selected/pressed consumers also combine translucent accent backgrounds with accent or on-accent text; several dark-theme pairs are below 4.5:1. | repo consumers of `bg-accent/10`, `bg-accent/15`, `text-accent-ink` | token-defect | settings segments, filters, selected counters, board controls | Move selected interactive states to the same semantic pair. |
| F-NAV-A5 | No automated console-token contrast assertion existed. | test/CI search | never-existed | Every interactive token pair | Add a deterministic assertion wired through the console suite in CI. |

## Track B — nomenclature

The canonical code model is Meet, Bracket, Operations, and Display, with
Entries as an optional intake capability. Operations is always-on and therefore
has no `workspace_modules` row.

| Rendered instance | Source | Identity before correction | Correct? |
| --- | --- | --- | --- |
| Module catalog rows | `moduleCatalog.ts` metadata | Meet, Bracket, Display, Entries | Yes for enableable capabilities |
| Workflow group headers | `workspaceNav.ts` | Phase names including Operations | Yes; these are IA groups, not badges |
| Plan / Live day badge | engine heuristic | Meet or Bracket | No; Operations owns the surfaces |
| Other nav badges | per-item module id | M/B/D/E | No; ordinary-state ink and redundant |
| Operations row provenance | `Match.source` | Meet or Bracket | Yes where rows vary |
| Module dock | no current renderer | removed | Deliberate cut; do not restore |

| ID | Finding | Evidence | Classification | Blast radius | Correction |
| --- | --- | --- | --- | --- | --- |
| F-NAV-B1 | Operations is a first-class architectural module but is deliberately non-enableable. | `moduleContract.ts::operationsContract`; `ArchModuleId` | works-as-designed | Catalog/nav interpretation | Keep the four-module architectural model plus optional Entries. |
| F-NAV-B2 | Plan and Live day badges derived from the workspace engine and attributed Operations UI to Meet/Bracket. | `workspaceNav.ts`; `WorkspaceSidebar.tsx` | component-defect | Different workspace kinds | Delete per-item badges and pin route ownership separately. |
| F-NAV-B3 | Default-state M/B/D/E badge containers violate X6. | `WorkspaceSidebar.tsx` | component-defect | All workflow leaves | Delete rendering and derivation, not merely CSS-hide it. |
| F-NAV-B4 | Canonical labels already have a shared source, but a local badge-glyph source could drift. | `product-shell/types.ts::MODULE_LABELS`; local `MODULE_MARK` | component-defect | Catalog, guards, nav | Use canonical metadata and remove glyph derivation. |
| F-NAV-B5 | Stable workflow groups are available across workspace kinds; child availability is capability-derived. | `workspaceNav.ts`; route tests for two kinds | works-as-designed | All workspace navs | Keep one phase-group shape; vary only enabled child destinations. |

## Approved rulings

- **R-NAV-1:** selected tint background + normal dark foreground + accent
  rule. The explicit pair is `action-selected-bg` with the new semantic
  `action-selected-foreground`.
- **R-NAV-2:** dark theme remains fully supported and tested.
- **R-NAV-3:** fix every sub-threshold interactive pair found in this audit.
- **R-NAV-4:** canonical architecture is Meet, Bracket, Operations, Display,
  plus optional Entries; Operations remains non-enableable.
- **R-NAV-5:** delete per-item module badges. Retain Meet/Bracket provenance
  only where row sources vary.
- **R-NAV-6:** phase groups are stable across workspace kinds. Enabled
  capabilities determine child destinations; kind selects the renderer only.

## Phase 0 baseline

- Console: 217 files, 1,948 tests passed.
- Focused workflow navigation: 17 tests passed.
- No contrast assertion existed before this correction.

## Implementation and gate closure

The owner's approval of all recommended rulings cleared all NAV stop gates.
The selected treatment is now one semantic pair everywhere:
`action-selected-bg` plus `action-selected-foreground`, with the existing
accent rule. That pair measures **16.35:1** in light and **13.25:1** in dark.
Every audited tinted selected/pressed consumer was moved to the same pair.
The deterministic contrast script is exposed as `npm run test:contrast`, runs
from both Make check targets, and is wired into the frontend CI job.

Visible workflow items no longer contain or render a module field/badge.
`MODULE_LABELS` remains the label source, Operations owns Plan and Live day,
and Meet/Bracket provenance remains row data only. Meet and Bracket workspaces
share the same phase groups, with enabled capabilities selecting children.

Rule-3b mutation evidence, restored immediately after each run:

| Property removed | Demonstrated failure |
| --- | --- |
| Selected tint uses normal foreground | Contrast gate failed at **1.08:1 light** and **1.21:1 dark** |
| Retired labels cannot return | Replacing Links and embeds with Sharing failed `copyContract.test.ts` |
| Per-item badges stay deleted | Adding a `module` field failed `workflowRoutes.test.ts` |

After restoration, the contrast gate and the focused navigation/display set
passed **55 tests**; the complete console result is **219 files / 1,970 tests**.
The refreshed operator book captured all **33** surfaces at desktop and mobile
with zero failed viewports and zero browser-console errors.

The production failure mechanism was an unasserted semantic mismatch: a
solid-accent foreground token was paired with a pale selected wash. The CI
contrast matrix and source-level selected-state contract now prevent that pair.
