# SP-ACTIVE-1 — active-state discipline

**Audit and ruling date:** 2026-08-31
**Phase 0:** read-only; the owner approved `action-primary` +
`text-on-accent` before implementation.

## Findings

The console had no shared selection primitive. Workspace navigation used an
inset left sliver, Match Inspector and roster tabs used accent underlines, and
other selectors independently used tint, border, or raised-tile treatments.
The old module dock and horizontal workspace tab bar no longer exist and were
not restored.

The inventoried chrome covered the global and workspace navigation, Account
sections, shared settings segments, Match Inspector facets, roster school and
seat tabs, Hub and match filters, InlineSearch filters, both Display previews,
Move Match mode, Plan auto-fit, contingency kind, and per-court policy. Data
rows, draw-format cards, match cards, player pickers, status controls, and
lifecycle steppers remain outside this visual primitive because they express
data selection, status, or progress rather than console navigation/view state.

Every inventoried component is console-local. `MatchInspector` is shared by
Meet Matches, Bracket Matches, Operations Plan, and Operations Live day. The
Meet and Bracket Display renderers also serve venue boards, but their selectable
view tabs render only for the Publish preview; the wall board is unchanged.
The entrant app imports none of the migrated components.

## Ruling and implementation

The approved active pair is `action-primary` fill with `text-on-accent` ink.
It measures **5.20:1** in light and **6.06:1** in dark. Against base, raised,
and hover surfaces its worst grayscale relative-luminance delta is **0.258**,
above the ruled **0.20** floor, and its worst fill/surface contrast is
**3.98:1**.

`ActiveChoice` is the single owner of active fill, ink, focus, and accessible
state. It supports row and segment geometry plus page, tab, radio, and pressed
semantics. Active focus uses the on-accent ink because the ordinary focus hue
is the same blue as the active fill. Inactive items have no resting background,
border, indicator, or reserved gutter. Conditional active-only font weight,
sliver elements, underline elements, and the Move Match ghost track were
removed.

The older `action-selected-*` tint remains because non-selection callouts still
reference it; it is not dead and changing those callouts is outside this task.

## Verification and negative controls

- Contrast gate: light 5.20:1; dark 6.06:1; luminance delta floor passes both
  themes. A temporary light-theme mapping to `blue-3` failed with seven
  violations, including **1.43:1** text contrast and **0.178** hover-surface
  luminance delta, then was restored.
- Banned-pattern guard: temporarily restoring the workspace-nav inset sliver
  failed with the exact `WorkspaceSidebar.tsx` path, then was restored.
- Inactive-bare test: temporarily adding a resting active fill to the inactive
  branch failed with `bg-action-primary`, then was restored.
- Semantics test: temporarily forcing an active tab to
  `aria-selected="false"` failed, then was restored.
- Permanent negative fixtures reject pale blue on white, a pale grayscale
  tint, a seeded sliver, and a seeded underline.

After restoration, the contrast gate and focused migration set pass
**8 files / 51 tests**, and TypeScript passes. The production console and docs
builds also pass. The complete console run reached
**222 passing files / 1,983 passing tests**; four unrelated pre-existing
contract failures remain in the already-dirty `DenseDataTable`,
`BracketRosterTab`, and `ParticipantPicker` files (em-dash/truncation guards).

The development compose stack was not running during final verification, so a
new authenticated surface capture was not fabricated. Component rendering,
both theme token pairs, the shared focus treatment, and the console production
bundle were verified locally; the existing venue-board path remains unchanged
because its view tabs are preview-only.
