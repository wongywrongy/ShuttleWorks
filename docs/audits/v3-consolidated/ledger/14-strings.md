# Ledger — package 14 (roster, draw index, empty states)

Columns per plan §4: string key/file:line · surface · state · current text · verdict · final text · factual prerequisite · finding IDs · evidence.

## V3-OC32.1 — Empty school roster

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `RosterTab.tsx` `EmptyState body` | Meet Roster, no schools | `groups.length === 0` | "A school is a roster of players; their positions are what matches get built from. Add a school from the actions bar to start." | change | "Add a school, then add its players and positions." | The `Add school` action already renders directly below this text (`AddSchoolMenu` in `MeetActionsBar`, testid `school-add-button`) — the copy no longer directs the reader away from it | V3-OC32.1 | `apps/console/src/modules/meet/roster/RosterTab.tsx` empty-state block, unchanged adjacent action |

## V3-OC33.1 — Empty match inventory

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `MatchesTab.tsx` actions bar `add-match-row` | Meet Matches, empty inventory | `matches.length === 0` | Rendered (enabled if 2+ players, else disabled) | cut (withheld in this state) | Not rendered while `matches.length === 0`; reappears once at least one match exists | A first-time operator has nothing to override yet — "Add match" is a de-emphasized override of an existing lineup, not a valid first step | V3-OC33.1 | `apps/console/src/modules/meet/matches/MatchesTab.tsx` toolbar |
| `MatchesTab.tsx` `EmptyState body`, roster not ready | Meet Matches, empty inventory | `players.length < 2` | "Matches come from the position grid on Roster. Use Regenerate from roster above to build them, then lay them out in Operations → Plan." | change | "Matches can be generated once players are on the roster." | Matches the plan §4 "Empty states" example verbatim | V3-OC33.1 | plan.md §4 row "Empty states" |
| `MatchesTab.tsx` `EmptyState action`, roster not ready | Meet Matches, empty inventory | `players.length < 2` | "Add players in Roster" (muted, dashed-border secondary style) | change | "Add players" (primary, accent-filled), navigates to Roster | One valid next step, given roster readiness | V3-OC33.1 | acceptance: "primary 'Add players' + explanatory text" |
| `MatchesTab.tsx` `EmptyState body`, roster ready | Meet Matches, empty inventory | `players.length >= 2` | (same four-sentence copy as above) | change | "Matches come from the position grid on Roster." | Shorter, one why-line; the action below states the next step | V3-OC33.1 | — |
| `MatchesTab.tsx` `EmptyState action`, roster ready | Meet Matches, empty inventory | `players.length >= 2` | "Add match by hand" (muted secondary, adds one blank custom row) | change | "Generate matches" (primary, accent-filled), triggers the same preview/generate flow as the toolbar control | Ruling: roster ready + no matches → primary "Generate matches" for the first generation | V3-OC33.1 | acceptance |
| `RegenerateMenu.tsx` toggle button / popover heading | Meet Matches toolbar | `matches.length === 0` | "Regenerate from roster" | change | "Generate matches" | "Regenerate" implies a prior generation; before any match exists this is the first build | V3-OC33.1 | acceptance: "'Regenerate from roster' appears only after a generation exists" |
| `RegenerateMenu.tsx` toggle button / popover heading | Meet Matches toolbar | `matches.length > 0` | "Regenerate from roster" | keep | "Regenerate from roster" | Unchanged — a generation already exists | V3-OC33.1 | — |

## V3-OC14.1 — Sort visibility, populated roster

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| n/a (interaction state, not copy) | Bracket Roster table | default (no user interaction yet) | `denseState.sort === null` — table opens in raw insertion order, no header shows `aria-sort` | change | Opens sorted by Player ascending (`useDenseDataState({ sort: { id: 'player', direction: 'asc' } }, 'bracket-roster')`); `DenseDataTable`'s existing `aria-sort` + `SortIcon` then show it | `DenseDataTable` already renders `aria-sort` and a visible caret once `state.sort` is set, and its header button already changes it — no new toolbar needed | V3-OC14.1 | `apps/console/src/components/control-plane/DenseDataTable.tsx` (`sortLabel`, `SortIcon`, header `<button onClick={() => sort(column.id)}>`) |

## V3-OC15.1 — Draw index action column header

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `BracketDrawsTab.tsx` `DRAW_COLUMNS[6].label` | Bracket Draws (draw index) | any | `""` (no accessible name at all — column header rendered no text and no `aria-label`) | change | `"Action"` | The Status column (`DRAW_COLUMNS[5]`) already contains only real states (Draft/Generated/derived Live/Complete); the trailing column already contains only verbs ("Generate", "Open draw", overflow items) — only the missing header name was the defect | V3-OC15.1 | `apps/console/src/modules/bracket/BracketDrawsTab.tsx` `ActionCell`/`DrawStatusCell` |

## V3-PE04.1 — Event label casing (console mirror)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| new: `apps/console/src/platform/domain/eventLabels.ts` `EVENT_LABEL_MAP` | Console (mirrors the entrant tier's approved public labels) | n/a | (file did not exist) | add | `{ MS: "Men's singles", WS: "Women's singles", MD: "Men's doubles", WD: "Women's doubles", XD: 'Mixed doubles' }` | Package 21 owns the entrant `EVENT_LABEL_MAP` (`apps/entrant/app/lib/eventLabels.ts`); this is the console's copy, pinned equal by `apps/console/src/platform/domain/__tests__/eventLabels.test.ts` (reads the entrant file from disk) | V3-PE04.1 | new test file |

## Not changed here (other packages' scope)

- `apps/console/src/lib/disciplineNames.ts` and `apps/console/src/lib/eventColors.ts` keep their existing Title-Case discipline names ("Men's Singles") — those serve operator-facing chrome elsewhere in the console and are out of this package's scope; only the new `eventLabels.ts` mirror uses the approved public sentence-case wording.
- `apps/console/src/modules/bracket/BracketMatchesTab.tsx`, `MatchesSpreadsheet.tsx`, `MatchChip.tsx` — package 10c.
- `apps/console/src/app/workspace/ModuleUnavailablePanel.tsx` (V3-OC30.1) — package 18, not touched.
