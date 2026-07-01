> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Operations Live Board (SP-G1b) Implementation Plan

> **For agentic workers:** This plan is executed by a Workflow (sequential implementer + per-task reviewer per task). Each task is self-contained; read the named files before editing.

**Goal:** Unify Plan and Run onto the shared `GanttTimeline` court×time board. **Plan = planned/fixed** (uniform equal blocks). **Run = live/actual** (each chip spans real elapsed time, grows past its planned end as drift, zoomable). Both use one **state-toned** `MatchChip`.

**Architecture:** A pure placement model turns the unified `OpsBlock` list into `GanttTimeline` `Placement[]` + per-block render meta, in two modes (`planned` fixed-uniform / `live` actual-time). Plan's `UnifiedOpsBoard` and a new live board both render `GanttTimeline` + `MatchChip`. `RunSurface` swaps its positional `RunBoard` for the live board but KEEPS its queue, inspector, state machine, auto-pull, and in-flight assign overlay unchanged.

**Tech stack:** React 18 + TS, `@scheduler/design-system` `GanttTimeline`, `lib/time` (`getRenderSlot`, `msToSlot`, `timeToSlot`, `getCurrentSlot`), `runtime/runMachine` (`deriveDriftSlots`, `fromEngineStatus`), `components/MatchChip`.

## Global Constraints (every task)

- **Chips are state-toned on BOTH surfaces** — `MatchChip tone="state"` (scheduled neutral / called / playing / done); source = left edge. No discipline color on either board anymore.
- **Plan blocks are uniform**: every placement `span = 1` regardless of solver duration. Duration is NOT encoded as width. (Owner decision, confirmed.)
- **Run is live**: per court-assigned block —
  - `playing` (engine `started`): `startSlot = actualStartSlot`, `span = max(1, currentSlot − actualStartSlot)` (grows live). **Overrun** when `currentSlot > plannedStart + plannedSpan` — render the over portion in `status-warning`, driven by `deriveDriftSlots`.
  - `done` (`finished`): `startSlot = actualStartSlot`, `span = max(1, actualEndSlot − actualStartSlot)` (actual played length).
  - `scheduled` / `called`: `startSlot = plannedSlot`, `span = 1`. **late** when `currentSlot >= plannedSlot` and not started (no longer Now-only — the time axis shows it directly).
  - Missing actual-timing → fall back to planned slot/span (never throw).
- **Pure placement modules**: no `Date.now`/`new Date()`; `currentSlot` (and any timing) injected by the caller.
- **Reuse, don't reinvent**: `GanttTimeline`, `MatchChip`, `lib/time` helpers, `deriveDriftSlots`. KEEP `RunSurface`'s queue/inspector/auto-pull/overlay/`RunSummaryBand` and all seam logic.
- **Gates (run from `products/scheduler/frontend`)**: `npx tsc -b`, `npx vitest run` (targeted dir during tasks; full suite at the end), `npm run build`. Operations tests must stay 0 `act`-warnings.
- Do NOT commit on `main`; branch is `dev/workspace-suite`. Each task commits its own changes once its gates pass.

## File structure

- Create `products/scheduler/frontend/src/products/operations/runtime/boardPlacements.ts` — pure placement model (+ test).
- Modify `products/scheduler/frontend/src/products/operations/opsBlock.ts` — carry actual-timing.
- Create `products/scheduler/frontend/src/products/operations/run/RunLiveBoard.tsx` — live Gantt board (+ test).
- Modify `run/RunSurface.tsx` — swap board; keep everything else.
- Modify `UnifiedOpsBoard.tsx` — uniform span + state tone.
- Delete `run/RunBoard.tsx` + `__tests__/runBoard.test.tsx` (positional board, superseded).

---

### Task 1: Carry actual-timing on `OpsBlock`

**Files:** Modify `opsBlock.ts`; Test `__tests__/opsBlock.test.ts`.

**Interfaces — Produces:** `OpsBlock` gains `actualStartSlot?: number` and `actualEndSlot?: number`.

- Meet (`meetToOpsBlocks`): derive from `matchState` via the existing `lib/time` helpers — for `started`/`finished`, `actualStartSlot = msToSlot(parseMatchStartMs(actualStartTime), config)` (reuse `getRenderSlot` if it's the cleaner seam); `actualEndSlot` for `finished`. This adapter must receive `config` (add the param; update the one caller `OperationsProduct.tsx`). If `msToSlot` isn't exported, export it from `lib/time`.
- Bracket (`bracketToOpsBlocks`): `actualStartSlot = assignment.actual_start_slot ?? undefined`, `actualEndSlot = assignment.actual_end_slot ?? undefined`.
- Leave `court`/`slot`/`span`/`status` semantics unchanged (still the PLANNED schedule).

**Steps:** write failing test (a started meet block surfaces `actualStartSlot`; a finished bracket block surfaces both) → run (fail) → implement → run (pass) → `tsc -b` → commit.

---

### Task 2: Pure placement model `boardPlacements.ts`

**Files:** Create `runtime/boardPlacements.ts`; Test `__tests__/boardPlacements.test.ts`.

**Interfaces — Consumes:** `OpsBlock` (Task 1), `GanttTimeline` `Placement`, `runMachine.deriveDriftSlots`/`fromEngineStatus`.
**Produces:**
```ts
export interface BoardChip {
  key: string; placement: Placement;           // Placement.span carries the rendered width
  source: 'meet' | 'bracket'; state: 'scheduled'|'called'|'playing'|'done';
  late: boolean; overrunSlots: number;          // >0 => playing past planned end
  label: string; colorKey?: string;
  plannedSpan: number;                          // for the planned-end marker on live
}
export function buildPlanChips(blocks: OpsBlock[]): BoardChip[];      // uniform span=1, planned slot
export function buildLiveChips(blocks: OpsBlock[], currentSlot: number): BoardChip[]; // live spans per Global Constraints
```
Only court-assigned blocks (court+slot present) become chips; unassigned stay in the queue (handled by `RunSurface`). `courtIndex = court − 1`. Pure (no clock read).

**Steps:** failing tests for each Global-Constraint live case (playing grows; overrun>0 when past planned end; done = actual length; scheduled/called span=1 + late when overdue; missing timing falls back) AND plan uniform (span always 1) → fail → implement → pass → `tsc -b` → commit.

---

### Task 3: `RunLiveBoard` component

**Files:** Create `run/RunLiveBoard.tsx`; Test `__tests__/runLiveBoard.test.tsx`.

**Interfaces — Consumes:** `buildLiveChips` (Task 2), `GanttTimeline`, `MatchChip`.
**Produces:** `RunLiveBoard({ blocks, courtCount, currentSlot, selectedKey, onSelect })` — renders `GanttTimeline` (`currentSlot` now-line, `slotScale` zoom with the same Auto/±/% control idiom as `UnifiedOpsBoard`'s `zoomBar`) where each block paints a `MatchChip tone="state"`, clickable → `onSelect(key)`. Overrun renders the over-portion in `status-warning` (a ring or an inset bar past the planned-end marker). Preserve test ids: each chip keeps `data-testid={`run-card-${key}`}`, `data-source`, and a late marker `data-testid={`run-late-${key}`}` so existing Run assertions/idioms keep meaning. Empty board → the existing empty hint.

**Steps:** failing test (a started block renders a wider chip than a scheduled one at the same scale; `run-card-*`/`run-late-*` present; click fires `onSelect`) → fail → implement → pass → `tsc -b` → commit.

---

### Task 4: Wire `RunLiveBoard` into `RunSurface`

**Files:** Modify `run/RunSurface.tsx`; Test `__tests__/runSurface.test.tsx`.

Replace `<RunBoard .../>` with `<RunLiveBoard blocks={blocks} courtCount={courtCount} currentSlot={currentSlot} selectedKey={selectedKey} onSelect={setSelectedKey} />`. KEEP everything else verbatim: the queue, `RunInspector`, `RunSummaryBand`, `handleAction`, `handleAssignNext`, `computeAutoPull`, `fireAssign` + the optimistic overlay, all seams. `queueHasEligible`/Assign-next semantics stay (the board no longer needs the per-court "Assign next" button — assigning happens via the queue's inspector "Send to court"; if the board previously owned that affordance, move it to the queue/inspector and keep the existing tests' behavior green). Update existing `runSurface.test.tsx` expectations that assumed the positional board, preserving the in-flight-guard and auto-pull tests' intent.

**Steps:** adjust tests → implement → `tsc -b` + `vitest run src/products/operations` (0 act-warnings) → commit.

---

### Task 5: Plan board — uniform span + state tone

**Files:** Modify `UnifiedOpsBoard.tsx`; Test `__tests__/courtStatus.test.tsx` (+ any board test).

Build Plan placements via `buildPlanChips` (uniform `span=1`) instead of the duration/lane-packed placements, so meet and bracket render identical width. Switch `BlockView`/`StaticBlock` `MatchChip` to `tone="state"` (drop discipline color). Keep drag-to-reschedule (`useDraggable`, validate, `pinAndResolve`/`pinMatch`) intact — only the placement width + tone change. Overlap packing (`packBlockLanes`) may still split true double-bookings side-by-side; that's acceptable (it's a real conflict, not the meet-vs-bracket inconsistency).

**Steps:** adjust tests → implement → `tsc -b` + `vitest run src/products/operations` → commit.

---

### Task 6: Remove the superseded positional board

**Files:** Delete `run/RunBoard.tsx` + `__tests__/runBoard.test.tsx`. Grep for any remaining `RunBoard` import and remove. Confirm `RunSummaryBand` still consumes the summary (late count now from live chips — wire `deriveSummary`/the band to count `late` from the live chips/blocks consistently with Task 2).

**Steps:** delete → grep clean → `tsc -b` + `vitest run src/products/operations` → commit.

---

### Task 7: Full gates + consistency sweep

**Files:** none new — verification.

Run from `products/scheduler/frontend`: `npx tsc -b`, `npx vitest run` (full), `npm run build`. All green; operations tests 0 `act`-warnings. Confirm no `getEventColor`/discipline-tone references remain on either board, no dead `RunBoard`, and `MatchChip` is the only chip on both surfaces. Report the final diffstat + gate output.

---

## Out of scope
- The Plan→Run readiness pill, plan-finalized handoff, Seam C, command queue, bracket DTO apply, the in-flight overlay — all unchanged.
- Backend changes — none (actual-timing fields already exist on the DTOs).
- Visual live-verification in the running app + the frontend container rebuild — the **controller** does these after the workflow.

## Definition of done
- Plan and Run are the same court×time `GanttTimeline`, sharing one state-toned `MatchChip`.
- Plan blocks are uniform width (meet == bracket); Run chips span actual elapsed time, grow past the planned end as drift, flag late, and zoom.
- Queue/inspector/auto-pull/overlay/summary preserved; positional `RunBoard` gone.
- `tsc -b` + full `vitest` + `build` green; operations tests 0 act-warnings.
