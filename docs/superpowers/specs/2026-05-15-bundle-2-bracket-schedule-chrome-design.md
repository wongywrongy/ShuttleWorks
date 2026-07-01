> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Bundle 2 — Bracket Schedule chrome parity (design)

**Date**: 2026-05-15
**Status**: design / approved (chat 2026-05-15)
**Source**: `docs/audits/2026-05-15_user-audit_meet-vs-bracket.md` and the user's follow-up complaint that the bracket Schedule tab renders "only the grid but not the left or match details and no controls".

## Goal

Bring the bracket Schedule tab to visual parity with the meet Schedule by giving it the same three chrome elements that frame the meet's `<DragGantt>`:

1. A **controls header** above the grid.
2. A **matches table** below the grid.
3. A **details sidebar** to the right.

The grid itself stays the existing display-only `<ScheduleView>`. **No drag, no pin, no /validate calls** — the bracket Schedule remains read-only by the locked decision from the 2026-05-15 bracket-entry work. Operators look at this surface; they mutate from the Live tab or from Draw's inline `↵ wins`.

## Non-goals

- Bracket Live chrome (already has MatchDetailPanel right rail from the bracket-entry work).
- Wiring bracket `/validate` or `/pin` to enable drag-to-reschedule on the bracket Schedule. Backend endpoints exist; the locked design keeps Schedule display-only.
- Extracting a shared `<TournamentScheduleLayout>` primitive that both meet and bracket consume. Considered as Approach 2 and rejected — meaningful refactor scope on currently-working meet code with no user-visible upside.
- The remaining audit bundle-2 candidates: TV Schedule/Standings tabs, picker overflow, Configure-display link, Setup dirty-state, bracket roster bulk-import, bracket Events row affordance, sticky RECONNECTING badge. All deferred to a future bundle.
- Any backend changes. No new API calls. No DTO additions.

## Architecture

Three new bracket-namespaced components compose around the existing display-only `ScheduleView`. `BracketTab`'s Schedule branch is the only existing file that changes (Live branch untouched).

```
BracketTab.Schedule:
  <div className="flex h-full flex-col overflow-hidden">
    <BracketScheduleHeader data={data} />                                  ← NEW
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 overflow-x-auto border-b border-border px-4 py-3">
          <ScheduleView data={data} selectedId={selectedId}                ← unchanged*
                        onSelect={setSelectedId} />
        </div>
        <BracketMatchesTable data={data}                                   ← NEW
                             selectedId={selectedId}
                             onSelect={setSelectedId} />
      </div>
      <BracketScheduleSidebar data={data} selectedId={selectedId} />       ← NEW
    </div>
  </div>
```

\* `ScheduleView` gains two optional props (`selectedId`, `onSelect`) — additive only. Existing callers (the test file at minimum) keep working. The block click currently does nothing; with the new props it fires `onSelect(play_unit_id)` and renders a thin ring around the selected block.

Selection state (`selectedPlayUnitId: string | null`) is local to `BracketTab`. Threads through to all four consumers.

## Components

### `features/bracket/BracketScheduleHeader.tsx`  (~80 LOC)

A single-row header above the grid. Three slots:

- **Left**: status text — `"{N} play units scheduled across {M} courts"`, derived from `data.assignments.length` and `data.courts`.
- **Middle**: empty (no LiveMetricsBar — bracket has no solver run).
- **Right**: Export menu — three buttons or a single-button + dropdown linking to the existing API client URLs:
  - `apiClient.bracketExportJsonUrl(tid)` → "Export JSON"
  - `apiClient.bracketExportCsvUrl(tid)` → "Export CSV"
  - `apiClient.bracketExportIcsUrl(tid)` → "Export ICS"

  Each is a plain `<a href={url} download>...</a>` — no new API calls, the URL builders already exist on the client. Tournament id comes from `useTournamentId()`.

No "Generate" button — bracket draws are generated per-event from the Events tab, and the Schedule is post-generation read-only.

### `features/bracket/BracketMatchesTable.tsx`  (~150 LOC)

Mirrors `pages/schedule/MatchesTable` shape, adapted for bracket DTOs.

- **Header strip**: `MATCHES   {N} of {N} scheduled` + view toggle (`By Time` / `By Court`) + an inline search input.
- **Search**: filters by event id, side participant name, court id, or play_unit id. Plain `.toLowerCase().includes(q)` over the row's text.
- **View `By Time`**: rows grouped by `assignment.slot_id`. Each row shows `time · court · play_unit_id · side A vs side B`. Time is formatted via the bracket's slot-to-time helper if one exists; otherwise the absolute slot is shown (see Risks).
- **View `By Court`**: rows grouped by `assignment.court_id`. Same per-row content.
- **Row click**: fires `onSelect(playUnit.id)`; the selected row gets the same accent treatment as meet's table (`bg-accent/10 ring-1 ring-accent/30`).
- **No URL-backed filter state**: bracket doesn't have the multi-tab search-share affordance the meet has. Local `useState`.

Joins data the same way `ScheduleView`'s `buildTooltip` already does:

```ts
const puById = new Map(data.play_units.map(p => [p.id, p]));
const participantById = new Map(data.participants.map(p => [p.id, p]));
const eventById = new Map(data.events.map(e => [e.id, e]));
```

### `features/bracket/BracketScheduleSidebar.tsx`  (~120 LOC)

Right rail, 240–280 px wide, single Details pane (no tabs — there's no Candidates analogue and no Director/Re-plan in this design).

When `selectedId == null`: one-line empty state, `"Click a match to see details."`.

When `selectedId` resolves to a play unit:

```
{discipline}  R{round_index+1} M{match_index+1}
Court C{court_id} · Slot {slot_id}   (or formatted time when helper exists)
─────────────────────────────────────
Side A: {resolved participant names, "/" separated, "TBD" when null}
Side B: {resolved participant names, "/" separated, "TBD" when null}
─────────────────────────────────────
State: {ready | live | done}   (with the existing state-ring color)
{when done:}   Winner: Side {A | B}
```

When `selectedId` is set but doesn't resolve in `data.play_units` (stale after a regenerate), falls back to the empty state.

No Director, no Re-plan, no Disruption, no Move/Postpone — those are meet-only solver affordances that don't apply to the bracket's pre-generated draws.

### `features/bracket/BracketTab.tsx`  (~20 LOC modified)

Only the Schedule branch changes. Add `selectedPlayUnitId` local state. Wrap `<ScheduleView ... />` with the new chrome per the Architecture diagram. The Live branch keeps its current `<LiveView ... />` (which already has MatchDetailPanel).

## Data flow

- **Source of truth**: `data: BracketTournamentDTO` (already passed to `ScheduleView` and `LiveView`).
- **Selection**: `selectedPlayUnitId` in `BracketTab`. Reset to `null` when `data.id` changes (covers regenerate / event switch).
- **No mutations**: every component is read-only over `data`.
- **No new API calls**: Export buttons link to pre-existing URL builders on `apiClient`.

## Error handling

- **Empty bracket (`data.assignments.length === 0`)**: `ScheduleView`'s existing empty state covers the grid; `BracketScheduleHeader` shows `"0 play units scheduled"`; `BracketMatchesTable` shows `"No matches yet — generate from the Events tab."`; `BracketScheduleSidebar` shows the empty-state hint. No crashes.
- **Stale selection**: when `selectedId` doesn't resolve in `data.play_units`, `BracketScheduleSidebar` falls back to the empty state. (Implementation plan verifies whether the `data` prop has a stable identity per regenerate — if so, also add a `useEffect` that resets selection on `data` change; if `data` is mutated in place by the upstream `setData` callback in `BracketTab`, the fallback alone is sufficient.)
- **Missing participants** (placeholder slots before feeders land): the side-resolver renders `"TBD"` for null sides — matches the existing `ScheduleView.buildTooltip` behavior.

## Testing

Vitest only (no e2e in this bundle). New files mirror the existing pattern under `src/lib/__tests__/`.

- `BracketScheduleHeader.test.tsx`:
  - renders "0 play units scheduled across 4 courts" for an empty bracket
  - renders "8 play units scheduled across 4 courts" for an 8-play-unit dataset
  - Export buttons have the correct `href` (built via `apiClient.bracketExport*Url`)

- `BracketMatchesTable.test.tsx`:
  - renders one row per assignment
  - search by participant name narrows to expected rows
  - search by event id narrows to expected rows
  - row click fires `onSelect` with the right `play_unit_id`
  - "By Court" view groups rows under court headers
  - "By Time" view groups rows under slot headers
  - empty-bracket state renders the "No matches yet" message

- `BracketScheduleSidebar.test.tsx`:
  - empty state when `selectedId == null`
  - empty state when `selectedId` doesn't resolve in `data.play_units` (stale)
  - selected play unit renders discipline + round + match + court + slot + both sides
  - "TBD" rendered for null sides
  - "Winner: Side A" renders when state is `done` with `winner_side == 'A'`

- Existing test updates:
  - `BracketTab.test.tsx` — add assertion that the Schedule branch renders all three new chrome elements (header + table + sidebar) when `data` has at least one assignment.
  - `ScheduleView.test.tsx` — add assertion that `onSelect` fires when a block is clicked, with the right id. (The current test only renders; doesn't exercise selection.)

## Risks / unknowns

- **Slot-to-time formatting on the bracket side**: meet has `formatSlotTime(slot, config)` driven by `config.dayStart` + `config.intervalMinutes`. Bracket's `BracketTournamentDTO` has its own `interval_minutes` and `start_time` (added in the bracket-entry work). The MatchesTable's "By Time" view needs a small helper. If the helper isn't trivially available, the bundle falls back to showing absolute slot numbers (`Slot 0`, `Slot 1`, …) for v1 — the operator can correlate against the time-header row of the grid one click away. Decision deferred to implementation; preferred is the formatted-time path if `interval_minutes` + `start_time` are both on the DTO. **Verify on plan day**.

- **`ScheduleView` selection prop addition**: today `ScheduleView` renders blocks with no click affordance. Adding `selectedId` + `onSelect` is additive on the prop type but adds a click handler on the rendered block. Existing tests for `ScheduleView.test.tsx` and `EventsFilterStrip.test.tsx` import it directly — both must continue to pass with the new optional props.

- **Sidebar width on smaller screens**: meet's sidebar is roughly 300 px. Bracket layout already has a `BracketViewHeader` row above; combined with the new chrome the grid + table column may compress on a 1280-wide canvas. Spec sets sidebar to `w-64` (256 px) as default; revisit if it looks cramped during the implementation pass.

## Acceptance criteria

The bundle is done when:

1. On a bracket tournament with at least one generated event:
   - The Schedule tab renders a header row above the grid showing the play-unit count and Export buttons that resolve to the correct backend URLs.
   - The Schedule tab renders a matches table below the grid with By Time / By Court toggle and a working search input. Row click selects.
   - The Schedule tab renders a right-rail Details sidebar that updates on selection.
2. Selection state is shared — clicking a block in the grid OR a row in the table highlights both and updates the sidebar.
3. Bracket Schedule remains display-only: no drag interaction, no pin actions, no `/validate` calls.
4. Bracket Live tab is unchanged.
5. Meet Schedule + Live are unchanged.
6. All existing tests pass. New tests added per the Testing section pass.
7. `npm run test:run`, `npm run build`, and a manual browser walk-through of an 8-player SE bracket pass cleanly.

## Out-of-scope reminder

The audit's other bundle-2 candidates (TV Schedule + Standings, picker overflow, Configure-display link, Setup dirty-state, bracket roster bulk-import, bracket Events row-clickable, sticky RECONNECTING badge) live in **Bundle 3**. The chrome-unification ask is narrow on purpose: ship one slice that closes the meet/bracket asymmetry the user explicitly flagged today, validate it in the browser, then move to the next bundle.
