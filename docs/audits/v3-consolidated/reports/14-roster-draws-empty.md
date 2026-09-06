# Work package 14 — roster, draw index and empty states

Plan: `docs/audits/v3-consolidated/plan.md` §3 X8 (36px roster row minimum
floor), X16, "Entire-row links; menus only on hover"; §4 rows "Field labels"
(units: pairs vs players), "Empty states" (one explanation + a usable next
step; empty matches route to roster when roster is empty; generate only when
prerequisites exist), "Buttons and links". Cross-cutting routing: X8 →
09-11/14; X16 → 12/14/19-21.

Findings: V3-OC14.1, V3-OC15.1, V3-OC32.1, V3-OC33.1 (full text), and the
console half of V3-PE04.1/04.2/04.3.

## Scope actually touched

- `apps/console/src/modules/meet/roster/RosterTab.tsx` — empty-state copy
  (V3-OC32.1); keyboard access on player-list rows.
- `apps/console/src/modules/meet/matches/MatchesTab.tsx` — empty-inventory
  copy/actions by roster readiness, withheld toolbar "Add match" (V3-OC33.1).
- `apps/console/src/modules/meet/matches/RegenerateMenu.tsx` — toggle/dialog
  label reads "Generate matches" before any match exists, "Regenerate from
  roster" after (V3-OC33.1).
- `apps/console/src/modules/bracket/BracketDrawsTab.tsx` — trailing action
  column header named "Action" (V3-OC15.1).
- `apps/console/src/modules/bracket/BracketRosterTab.tsx` — opens sorted by
  Player ascending; strict rows opt into the 36px roster floor
  (V3-OC14.1, X8).
- `apps/console/src/components/control-plane/DenseDataTable.tsx` — new
  `strictRowHeight` prop (`"compact"` 28px default / `"roster"` 36px),
  threaded through the strict-row cell/lane classes. `ParticipantPicker.tsx`
  (the table's only other `strictRows` consumer) is unaffected — it keeps
  the default and was not touched.
- New: `apps/console/src/platform/domain/eventLabels.ts` (console mirror of
  the entrant tier's `EVENT_LABEL_MAP`) + parity test
  `apps/console/src/platform/domain/__tests__/eventLabels.test.ts`.
- Tests: `apps/console/src/modules/meet/roster/__tests__/RosterTab.v3.test.tsx`
  (new), `apps/console/src/modules/meet/matches/__tests__/MatchesTab.emptyState.test.tsx`
  (new), `apps/console/src/modules/bracket/__tests__/BracketDrawsTab.test.tsx`
  (added a describe block), `apps/console/src/modules/bracket/__tests__/BracketRosterTab.test.tsx`
  (added a describe block; updated the pinned `h-7`/`max-h-7` row-height
  assertion — see below).
- `docs/audits/v3-consolidated/ledger/14-strings.md` (new).

**Read but not changed**: `apps/console/src/modules/bracket/BandedList.tsx`
(the column-header renderer already supports a label-less spacer column
correctly; `BracketDrawsTab`'s fix only needed a non-empty `label`, not a
change here), `apps/console/src/components/control-plane/BandedTable.tsx`
and `apps/console/src/lib/selectableRow.ts` (row keyboard/focus contract for
`BandedTable`/`DenseDataTable` rows was already correct — `role="button"`,
`tabIndex=0`, Enter/Space activation, visible focus ring — nothing to fix
there; RosterTab's separate hand-rolled player-list `<li>` had not been
migrated to that contract and needed its own fix, see below).

**Explicitly not touched** (other packages' concurrent scope):
`apps/console/src/modules/bracket/BracketMatchesTab.tsx`,
`apps/console/src/modules/meet/matches/MatchesSpreadsheet.tsx`,
`apps/console/src/components/MatchChip.tsx` (10c);
`apps/console/src/app/workspace/ModuleUnavailablePanel.tsx` (V3-OC30.1,
package 18); `apps/console/src/lib/disciplineNames.ts` /
`apps/console/src/lib/eventColors.ts` (existing Title-Case discipline names
used elsewhere for operator chrome — left as-is; only the new
`eventLabels.ts` mirror carries the approved sentence-case public wording).

## Per-finding acceptance

### V3-OC14.1 — sort visibility on a populated roster

Acceptance: "the current sort is explicit and can be changed without adding
a new toolbar row."

`DenseDataTable` (used by `BracketRosterTab`, the "populated player roster"
surface) already rendered `aria-sort` and a visible caret (`SortIcon`) once
`state.sort` was set, and its column-header button already called
`onStateChange(setDenseSort(...))` — no new toolbar was needed. The actual
defect was that `BracketRosterTab` opened with `sort: null` (raw insertion
order), so a 253-player roster read as unordered noise with no visible
current-sort state at all. Fixed by giving `useDenseDataState` a default
sort of `{ id: 'player', direction: 'asc' }`. Evidence:
`BracketRosterTab.test.tsx` "sort visibility" describe block — asserts
`aria-sort="ascending"` on the Player header on mount, and that clicking the
existing header button (not a new control) changes it to `"descending"`.

### V3-OC15.1 — draw-index action column

Acceptance: "Status columns contain states only; action columns contain
verbs."

`BracketDrawsTab` (the "Draw index" surface) already separated a `Status`
column (real states only: "○ Draft" / "Generated" / silent once
started/completed — see `DrawStatusCell`) from a trailing column holding
only verbs ("Generate", "Open draw", overflow "Configure"/"Re-generate"/
"Next round" — see `ActionCell`). The only defect was that the trailing
column's header (`DRAW_COLUMNS[6]`) had `label: ""` — no visible text and no
accessible name at all, not even "Status" (the original finding's literal
observation, "STATUS" over "Open draw", does not reproduce against current
`main`; it appears to have already been split into two columns by prior
work, leaving this one header gap). Fixed by naming it `"Action"`. Evidence:
`BracketDrawsTab.test.tsx` "action column header" describe block — asserts a
`columnheader` named "Action" distinct from the one named "Status".

### V3-OC32.1 — empty school roster

Acceptance: "the empty state describes the next domain step without
directions to a distant toolbar."

`RosterTab`'s no-schools `EmptyState` body changed from "A school is a
roster of players; their positions are what matches get built from. Add a
school from the actions bar to start." to the ruling's exact wording: "Add a
school, then add its players and positions." The adjacent `Add school`
action (rendered directly below the copy) is unchanged — no second action
was added. Evidence: `RosterTab.v3.test.tsx` "empty school roster" describe
block.

### V3-OC33.1 — empty match inventory

Acceptance: "The empty state presents one valid next step based on roster
readiness; 'Regenerate' is used only after generation."

- Roster not ready (`players.length < 2`): body "Matches can be generated
  once players are on the roster."; primary action "Add players" (accent
  button, routes to Roster). Matches the plan §4 "Empty states" row's own
  example wording verbatim.
- Roster ready, no matches: body "Matches come from the position grid on
  Roster."; primary action "Generate matches" (accent button), which
  triggers the same preview/generate flow the toolbar's `RegenerateMenu`
  uses (`document.querySelector('[data-testid="regenerate-toggle"]')?.click()`
  — the same in-repo pattern `RosterTab`'s own empty state already uses for
  its `Add school` button).
- The toolbar's `RegenerateMenu` control itself now reads "Generate matches"
  while `matches.length === 0` and "Regenerate from roster" once a match
  exists — so "Regenerate" never appears before a first generation, on
  either the empty-state action or the persistent toolbar control.
- The toolbar's disabled "Add match" (a de-emphasized override of an
  *existing* lineup) is withheld entirely while `matches.length === 0`,
  rather than shown disabled; it reappears once a match exists.

Evidence: `MatchesTab.emptyState.test.tsx` — one describe block per roster
state, plus a "toolbar once matches exist" block proving `Add match`
reappears and the toggle relabels back to "Regenerate from roster".

### V3-PE04.1/04.2/04.3 — console half (units, event labels, "View draw")

This package's console-side responsibility, per the assignment, was solely
to mirror package 21's entrant `EVENT_LABEL_MAP` so the two tiers cannot
drift on the approved wording ("Men's singles", not "Mens Singles" or the
Title-Case "Men's Singles"). Added
`apps/console/src/platform/domain/eventLabels.ts` exporting an identical
`EVENT_LABEL_MAP`, and
`apps/console/src/platform/domain/__tests__/eventLabels.test.ts`, which
reads `apps/entrant/app/lib/eventLabels.ts` from disk and asserts the two
maps are equal key-for-key (plus a sentence-case shape check on the console
copy). The actual "32 pairs"/"32 players" unit fix and the "View draw"/no
duplicated "Draw published" copy on the public draw-index rows were found
to already be implemented on the *operator* side in
`BracketDrawsTab.tsx` (`{row.targetSize} {isDoublesCode(...) ? 'pairs' :
'players'}`) — the public-tier PE04 surface itself (units, "View draw",
"Draw published" duplication) is package 21's implementation; nothing
further was required here.

### Row floor and keyboard navigation (X8, "Entire-row links; menus only on
hover")

- `BracketRosterTab`'s strict rows now use the 36px roster floor (was 28px,
  the table's generic default) via a new `strictRowHeight="roster"` prop on
  `DenseDataTable`. The prop is opt-in; `ParticipantPicker.tsx`, the table's
  only other `strictRows` consumer, keeps the 28px default and its own
  pinned row-height test is unaffected (verified: unchanged, still passes).
  `BracketRosterTab.test.tsx`'s existing pinned assertion (`toHaveClass('h-7',
  'max-h-7')` on a long-name row) was updated to `'h-9', 'max-h-9'` — this is
  the intended behavior change from X8, not an unrelated break.
- `BandedTable`/`DenseDataTable` rows (used by `BracketDrawsTab`'s draw
  index and `BracketRosterTab`'s roster) already exposed real
  keyboard-operable rows (`role="button"`, `tabIndex=0`, Enter/Space via
  `selectableRowProps` — a prior fix, per that file's own doc comment,
  covering "Matches + both rosters"). No hover-only menu triggers were found
  in this package's scope files (`OverflowMenu`, `ConfirmDeleteButton` both
  already use `focus-visible:opacity-100` alongside their hover reveal).
- `RosterTab`'s Meet-side player list (`PlayerListSection`, a hand-rolled
  `<li>` list separate from `BandedTable`) had NOT been migrated to that
  contract: the row toggled selection on click only, with no `tabIndex`, no
  role, and no keyboard handler. Fixed directly on the `<li>` (not via
  `selectableRowProps`, to avoid changing existing click semantics around
  the nested drag-handle chip button): added `role="button"`,
  `tabIndex={0}`, `aria-pressed`, an explicit `aria-label` (name-from-content
  would otherwise merge the player name, event-count badge, and delete
  button into one flattened label), the shared `SELECTABLE_ROW_FOCUS` ring,
  and an `onKeyDown` that toggles on Enter/Space only when the row itself
  (not a nested control) has focus. Evidence: `RosterTab.v3.test.tsx`
  "player row keyboard access" describe block (focusable + named, Enter,
  Space, and unchanged click behavior).

## Debt logged / not fixed here

- The public `EVENT_LABEL_MAP` is not yet consumed everywhere on the
  entrant tier that renders a discipline name — per package 21's own
  in-repo comment, `draw.tsx`'s heading should adopt it in a follow-up. Out
  of this package's scope (entrant tier is package 21's).
- `apps/console/src/lib/disciplineNames.ts` and `lib/eventColors.ts` keep
  Title-Case discipline names for operator chrome; reconciling those with
  the public sentence-case wording (if ever desired) is a separate,
  unscoped decision, not requested by any V3- finding routed to this
  package.

## Commands run and results

```
npm --prefix apps/console run test:run -- src/modules/meet src/modules/bracket src/components src/platform
```
113 files passed, 1 file failed (972 tests: 971 passed, 1 failed). The one
failure — `src/platform/contracts/__tests__/emDashContract.test.ts` flagging
an em dash in `apps/console/src/modules/setup/SetupProduct.tsx` and
`SetupRowsEditor.tsx` — is pre-existing, unrelated to this package's scope
(those files belong to package 13, currently in flight), and was not
introduced or touched by this work.

```
npm run lint:scheduler
```
0 errors, 134 warnings (all pre-existing `warn`-level rules per
`CLAUDE.md`'s CI philosophy — `react-hooks/set-state-in-effect`,
`react-refresh/only-export-components`, etc. — none newly introduced in this
package's files beyond pre-existing warnings at unrelated line numbers).

```
npx tsc -b apps/console
```
Clean, no output.

```
npm run depcruise
```
0 errors, 12 pre-existing `warn`-level `no-cross-module-debt` findings
(none touching this package's files).
