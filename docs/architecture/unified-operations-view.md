# Unified Operations view (Meet · Bracket)

When a workspace has **both** the Meet and the Bracket modules enabled, the
Operations **Plan** and **Run** surfaces render ONE cross-engine view: the two
engines' matches interleaved on a single court layout, each row tagged with the
engine it came from. (Plan and Run were formerly labelled *Courts* and *Live* —
the rename landed with the Run surface.)

This page describes the uniform block both surfaces speak, the live **Run**
surface and its Operations-owned state machine, how operator actions route back
to the right engine, and why the feature is a render-swap rather than a
navigation change.

## The engine-agnostic block

`products/operations/opsBlock.ts` defines `OpsBlock` — the uniform interactive
shape both Operations surfaces speak, regardless of source. It carries a stable
`key` (`${source}:${id}`), a `source` (`'meet' | 'bracket'`), `court` / `slot` /
`span`, resolved `sideA` / `sideB` names, a `colorKey`, an engine `status`, and
the `done` / `started` lifecycle flags. Two pure adapters produce these blocks:

- **`meetToOpsBlocks(matches, schedule, matchStates, names)`** folds the meet
  engine's `MatchDTO` + `ScheduleDTO` + `MatchStateDTO`, with a live match-state
  court override (`actualCourtId`) beating the planned court.
- **`bracketToOpsBlocks(data)`** folds the polled `BracketTournamentDTO` snapshot
  (play units + assignments + results), resolving side names through
  `playUnitSideLabels`.

`packBlockLanes` then lane-packs court-assigned blocks so overlapping ones render
side-by-side instead of z-fighting (the two engines solve the same physical
courts independently per [ADR 0006](/decisions/0006-unified-scheduling-core), so
they can double-book a `(court, slot)`).

::: info `OpsBlock` vs `OperationalMatch`
`OpsBlock` is the richer shape the interactive surfaces need. The older
`lib/operations/operationalMatch.ts` `OperationalMatch` is the lighter **read-only
chip projection** (with `meetMatchesToOperational` / `bracketToOperational`
adapters) — kept for read-only consumers, not the interactive Plan/Run surfaces.
:::

## The Plan surface

`Plan` is the planning board: `UnifiedOpsBoard.tsx` (drag-to-reschedule across
courts and slots, for both engines) plus `UnifiedOpsList.tsx` (the match
overview), with an `OpsDetailRail` overlay for the selected match. It is where you
build and adjust the plan before the day starts.

## The Run surface — an Operations-owned state machine

`Run` is the live, day-of control surface: `products/operations/run/RunSurface.tsx`
composes a summary band, a court board, a global queue, and a match inspector,
**all derived from one Operations-owned state machine**.

- **`runtime/runMachine.ts`** is the contract. `RunStatus` is
  `scheduled → called → playing → done`, with `assign` (a court change, keeps
  `scheduled`) and `postpone` (back to `scheduled`) as the off-status edges. Every
  surface derives action availability from `can(status, action)` — no surface
  invents its own vocabulary. `late` is a **derived** flag (`deriveLate`), never a
  stored state, and the modules stay pure (no `Date.now()` — the current slot is
  injected).
- **`runtime/runModel.ts`** derives the view from `court + slot + status`:
  `toRunMatches` maps blocks → `RunMatch` (overlaying an Operations-local `called`
  for bracket, which has no persisted `called`); `deriveCourtLanes` builds each
  court's **Now / Next / Later** lanes (and applies `late` to the Now match once
  the floor is running); `deriveQueue` orders the unassigned matches by planned
  slot (refresh-durable — a postponed match returns to its planned position, not
  the tail); `deriveSummary` feeds the band.

Because lane and queue order are **derived**, a mid-event refresh never loses the
floor.

## Write-back routes by source

On the Run surface an operator action must reach the API of the engine that
produced the row. `runtime/runActions.ts` is the Operations write router: it
guards every action with `can()` and routes by `RunMatch.source`.

| Source | Path |
|---|---|
| `meet` | the IndexedDB **command queue** (`meetSubmit`) — `call_to_court` / `start_match` / `finish_match` / `assign_court` / `postpone_match` |
| `bracket` | non-solver **`assignCourt`** / **`unassign`** (`POST /bracket/assign` · `/bracket/unassign`), `matchAction` for start, and `bracketResult` for recording (the [bracket result command queue](/architecture/bracket-result-queue)) |

The bracket live court-ops deliberately avoid `pinMatch` (which re-runs CP-SAT and
409s for unscheduled units) and `matchAction('reset')` (which only clears timing,
not the court) — see the seam notes atop `runActions.ts`. Per
[ADR 0006](/decisions/0006-unified-scheduling-core) the two engines keep separate
match models, so there is no merged write path — only this per-source routing.

`OperationsProduct` wraps its body in a `BracketApiProvider` keyed on the
tournament id so bracket data never lingers when the operator switches workspaces.

## Why a render-swap, not a navigation change

The feature is gated, not navigated. `AppShell.tsx` resolves
`bothEnginesEnabled = meetEnabled && bracketEnabled` from the **real persisted
module catalog** (`useWorkspaceModules`), never the kind-derived fallback, so an
indeterminate catalog fails safe to single-engine. `ModuleOutlet` performs the
swap:

```
ModuleOutlet(bothEnginesEnabled):
  if bothEnginesEnabled and isOperationsSegment(activeTab):
        → <OperationsProduct/>        (unified cross-engine Plan + Run)
  else  → the owning engine's product (Meet / Bracket / Display)
```

The unified surface **reuses the existing Operations segment ids** (`schedule` /
`bracket-schedule` for Plan, `live` / `bracket-live` for Run — see
`operationsSegments.ts`) rather than minting new ones.

::: tip Deliberately not a workspaceNav change
Reusing the segment ids and swapping only the rendered surface keeps the sidebar
model and the `moduleContract` ownership invariant exactly as shipped. A new
"unified Operations" nav entry would have had to claim segment ownership; the
render-swap avoids that — single-engine workspaces resolve the same segments to
their own engine views, and only the both-engines case resolves them to
`OperationsProduct`.
:::

## See also

- [Operations module](/modules/operations) · [Data flow](/architecture/data-flow)
- [Bracket result command queue](/architecture/bracket-result-queue)
- [ADR 0006 — Unified scheduling core, non-merged match record](/decisions/0006-unified-scheduling-core)
