> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Position Grid — Custom Redesign Plan

_Authored 2026-06-25. Decision: rebuild the meet roster "position grid" **fully custom** on the existing stack (React 19 + Compiler, Tailwind, **@dnd-kit/core v6**, Radix, `@scheduler/design-system`, Zustand) — NOT a data-grid library. Prior research confirmed every grid library (AG Grid, react-data-grid, Glide, Handsontable, MUI X, even headless TanStack Table) is a poor fit because this is a tiny fixed **assignment matrix** (≤5 event columns × ~6–8 position rows), where the value is the drag-drop + cell semantics, not tabular data handling. The most stable path is custom on the OSS primitives already vendored._

_Hard constraint: **Phase 1 preserves 100% of current functionality** — the inventory below is the acceptance checklist._

## Notable findings from the code read
- **No roster tests exist today.** The ~333 vitest baseline is bracket/hub/settings/display/infra — nothing touches `positionGrid/`, `RosterTab`, `PositionCell`, `PlayerSearchPicker`, `ColumnManager`. So Phase 1 must add characterization tests *before* refactoring.
- **Three hooks are dead code** (defined, never imported): `useBulkOperations`, `useRankValidation`, `usePlayerSelection`. Keep them — they become the Phase 2 engines (validation→hints, bulk→quick-assign, selection→multi-select).
- **The singles-displacement invariant is triplicated** verbatim across `RosterTab.onDragEnd`, `PositionCell.assignPlayer`, `PlayerDetailPanel.handleToggleRank` → centralize into one `useRankAssignment` hook.
- `RosterTab` is the sole entry (lazy import in `MeetProduct.tsx`).

---

## Functionality Inventory (Phase-1 acceptance checklist)
Every item must survive Phase 1 intact.

### Column configuration
- Columns derived from `config.rankCounts` (only events with count > 0); default order MD, WD, XD, WS, MS.
- Per-tournament column order (`config.eventOrder`) + visibility (`config.eventVisible`, absence = visible) + reset (both → undefined).
- Reorder columns by drag (ColumnManager nested DndContext writes `eventOrder`) **and** ▲/▼ keyboard fallback.
- Toggle visibility (eye button). `usePositionGridColumns` hook + `PositionGridColumnControls` standalone export (placed by `RosterTab`'s header next to Export).
- ColumnManager uses its OWN nested DndContext (PointerSensor, closestCenter), drag IDs = raw event prefixes — namespace must stay disjoint from the grid's `cell:`/`player:` IDs.

### Grid structure
- Rows = `max(event counts)`. Disabled cells (row > event count) render `—`, not droppable.
- Header: `#` column + per-event `<th>` with prefix + `doubles`/`singles` subtitle + per-event identity color (`EVENT_LABEL`). Body tint per event; disabled = `bg-muted/60`.
- Empty state: `events.length === 0` → "No events configured" prose, no table.
- `min-w-[780px]` + `overflow-x-auto` parent; `border-collapse`.
- Test IDs preserved: `position-grid-table`, `pos-cell-{schoolId}-{rank}`, `pos-cell-btn-{schoolId}-{rank}`.

### Assignment model (DATA MODEL UNCHANGED)
- Assignment = `updatePlayer(id, { ranks: string[] })`, ranks like `MS1`/`MD2`. Only mutation surface.
- `byRank` map derived per render from `schoolPlayers`.
- Singles invariant ≤1 occupant (displace any other holder in the same school). Doubles capacity 2 (block 3rd).
- All assignment/eligibility scoped to active school; cross-school drag rejected in `onDragEnd`.

### Pool → cell drag (existing)
- `DraggablePlayerChip` (`useDraggable`, data `{schoolId, playerId}`, id `player:{id}`). Heavy-load badge when eventCount ≥ 4. `pool-chip-{id}` testid.
- Sensors: MouseSensor (distance 4) + TouchSensor (delay 150, tol 5). **No KeyboardSensor yet** (keyboard assignment is via the picker — by design). DndContext lives in `RosterTab`.
- Drop target: `PositionCell` `useDroppable` id `cell:{schoolId}:{rank}`, data `{schoolId, rank, doubles, capacity}`, disabled when `disabled||isFull`.
- Three drag tints: `dragHover` (green, eligible+over), `dragReject` (red, ineligible+over), ambient ring on all non-disabled cells while dragging.
- No `DragOverlay` in Phase 1 (CSS.Translate on original node; overflow clipping is a known issue deferred to Phase 2).

### Click-to-assign (picker)
- Click cell button toggles `pickerOpen` (`data-noPicker` stops propagation). `PlayerSearchPicker` absolute below cell, `z-overlay`.
- Candidates = school players minus occupants, query-filtered, alpha-sorted; shows each candidate's other ranks (≤3 + ellipsis).
- Keyboard: ArrowDown/Up move, Enter picks, Esc closes; hover syncs active. Outside-click (mousedown) closes. Auto-focus input.
- Doubles half-filled → stay open after first pick (clear query); singles → close. Empty states distinguish "no match" vs "no more players".
- Test IDs: `picker-{schoolId}-{rank}`, `picker-search`, `picker-option-{playerId}`.

### Cell chip rendering
- Doubles full pair (2) → single bordered container, `divide-y-[0.5px]`, accent when either matches `highlightedPlayerId`.
- Singles / partial → standalone chips, accent per-chip on highlight. Doubles 1-occupant → `＋ add partner`. Empty → `＋ add player`/`＋ add pair`.
- Unassign × per row (`role=button`, `tabIndex=0`, `data-no-picker`, Enter/Space), hover-revealed, `aria-label="Unassign {name} from {rank}"`. `data-highlighted` on containers.

### Cross-highlight, detail panel, left panel, cleanup
- `highlightedPlayerId` flows RosterTab→Grid→Cell→Chips. Toggle-select dismiss; auto-dismiss when selected player leaves active school.
- `PlayerDetailPanel`: slide-up overlay (never pushes grid, always mounted), school `<Select>`, availability summary, min-rest, notes, rank pills (`aria-pressed`, enforce singles invariant). `player-detail-panel` testid; close ×.
- Left panel: school pills (`aria-pressed`, counts), add-school inline input (Enter/blur commit, Esc cancel), bulk-import (split on `\n`/`,`, `addPlayer` with `ranks:[]`), player list (drag chip + delete + toggle-select), inline search, empty states, auto-select first school. All existing test IDs (`school-pill-{id}`, `school-add-*`, `bulk-import-*`, `player-list`, `player-row-{id}`, `roster-left-panel`, `roster-right-panel`).
- One-shot `didCleanupRef` effect strips duplicate singles occupants from seeded data on mount.
- `PositionGridHeader` eyebrow + `{n} events · {m} positions`. Export XLSX (`exportRosterXlsx`, disabled when no schools/players, `export-roster` testid) uses canonical `EVENT_ORDER_ROSTER` and intentionally ignores order/visibility.

---

## Architecture decisions
1. **Keep the HTML `<table>` in Phase 1.** CSS Grid would force hand-rolling `role="grid"`/`aria-*`/roving tabindex — an a11y regression for zero layout gain. CSS-Grid+full-ARIA is reserved for the optional Phase 3 board view (where `<table>` is wrong anyway).
2. **Centralize the triplicated invariant** into `positionGrid/useRankAssignment.ts` (`assignRank`/`unassignRank`). Not a data-model change — still flows through `updatePlayer`. Callers keep the doubles-capacity guard.
3. **Defer `DragOverlay` + `KeyboardSensor` to Phase 2** (portal + measuring setup; avoids overflow-measuring regressions in Phase 1).
4. **`useRankValidation` is the Phase 2 hint engine** (already computes `isRankFull`/`hasIncompletePair`/`assignedTo`).

## Target module layout (`products/scheduler/frontend/src/products/meet/roster/`)
```
PositionGrid.tsx              MODIFY (keeps its 3 re-exports; delegates to sub-modules)
PlayerDetailPanel.tsx         MODIFY (uses useRankAssignment)
RosterTab.tsx                 MODIFY (onDragEnd uses useRankAssignment)
positionGrid/
  helpers.ts                  UNCHANGED
  useRankAssignment.ts        NEW  (single-invariant mutation helper)
  usePositionGridColumns.ts   NEW  (lifted verbatim from PositionGrid.tsx)
  CellChips.tsx               NEW  (lifted from PositionCell.tsx)
  GridTable/GridHeader/GridBody.tsx  NEW (extracted table markup, testIDs intact)
  PositionCell.tsx            MODIFY (uses useRankAssignment + imports CellChips)
  DraggablePlayerChip.tsx     MODIFY (visual: ⠿ → DotsSixVertical icon)
  PlayerSearchPicker.tsx      MODIFY (visual polish)
  ColumnManager.tsx           UNCHANGED
hooks/{useBulkOperations,useRankValidation,usePlayerSelection}.ts  KEEP (dead; wired Phase 2)
__tests__/positionGrid.test.tsx  NEW (characterization suite — write FIRST)
```

---

## Phased plan
### Phase 1 — faithful re-architecture + visual polish (preserves 100%)
1. **Write characterization tests first** (the acceptance gate): column derivation/empty-state/disabled cell; singles displacement; doubles capacity; picker open/close/keyboard/stay-open; highlight; chip shapes; unassign-× keyboard; onDragEnd school guard; column order/visibility/reset; invariant cleanup; export disabled.
2. Extract `useRankAssignment` (pure refactor; wire into PositionCell, PlayerDetailPanel, RosterTab.onDragEnd).
3. Extract `usePositionGridColumns` (verbatim).
4. Extract `CellChips`.
5. Extract `GridHeader`/`GridBody`/`GridTable` (all testIDs preserved).
6. Visual polish within the SOFT token system: braille `⠿` → `DotsSixVertical`, fullwidth `＋` → `Plus` icon, unify `rounded-[6px]`→standard radius, reconsider `border-b-2` header weight, verify `z-overlay`/`z-popover` tokens exist.
7. Run tests; fix regressions; commit.

### Phase 2 — interaction enhancements
- **2a Chip→chip reassignment drag:** chips become draggable (`chip:{schoolId}:{playerId}:{sourceRank}`); `onDragEnd` branches player:/chip:; add `DragOverlay` (fixes overflow clipping) + `KeyboardSensor` + `aria-live` announcements.
- **2b Eligibility/conflict hints:** wire `useRankValidation` into `PositionCell` (needs-partner, full, conflicting-slot in picker). No data-model change.
- **2c Quick-assign:** a "Quick Assign" mode — a rank-pill strip for the selected player (fixes the bulk-import "0 events" friction), calling `assignRank` directly.

### Phase 3 — optional board-as-events view (toggle; not a blocker)
- Kanban-style: events = columns, positions = cards. Reuses chips, `usePositionGridColumns`, `useRankAssignment`, the Phase-2 `DragOverlay`. Full `role="grid"` ARIA required here.

## Verification gate
From `products/scheduler/frontend`: `npx tsc -b && npx vitest run && npm run build`. Phase 1: zero new tsc errors (all 3 PositionGrid re-exports + helpers/xlsxExports public APIs unchanged), vitest ≥333 + new characterization tests green, build clean (ExcelJS/RosterTab lazy splits intact).

## Risks
1. **React Compiler:** the blocking pattern is `useMemo` with optional-chained deps — do NOT reintroduce it in the new hooks; plain `useMemo` (e.g. `byRank`) is fine.
2. **DnD ID namespace:** keep `player:` / `cell:` / `chip:` / ColumnManager raw-prefix disjoint; ColumnManager's nested DndContext must not move to the outer context.
3. **DragOverlay measuring (P2):** set `measuring.droppable.strategy = MeasuringStrategy.Always` due to the `overflow-auto` scroll container; test scroll-then-drag.
4. **Phase-1 drag clipping** is pre-existing — do not "fix" it in Phase 1 (charter = preserve behavior).
5. **`deleteGroup` throws on non-empty schools** — keep the constraint; no school-delete UI without a "move players first" flow.
6. **Export intentionally ignores order/visibility** (full data export, not a view screenshot) — document, don't "fix" unasked.
7. **a11y scope:** keyboard assignment = cell-button→picker + detail-panel pills; don't remove the cell `<button>` or picker keyboard handling. KeyboardSensor (P2) is an enhancement.
8. **`useRankValidation` has a divergent local `isDoublesRank`** — migrate it to import from `helpers.ts` when wiring in Phase 2 (don't add a 3rd impl).
