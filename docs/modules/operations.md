# Operations

**Tier-2, architectural module — not user-enableable.** Operations is the
**live-ops layer**: it turns an engine's *plan* into a *court layout of live
matches*, and owns the match-state machine and the idempotent command queue. It
is always-on for any workspace with an operational engine, so it has **no enable
flag and no `workspace_modules` row** — it is the `'operations'` arm of
`ArchModuleId = ModuleId | 'operations'`, not a member of the user-facing
`ModuleId` union.

## What it does

- Lays out the **Plan** surface (the drag-to-reschedule court board) and the
  **Run** surface (the live, day-of control board) for whichever engine(s) are
  active. (Plan / Run were formerly *Courts* / *Live*.)
- Owns the **canonical match-state machine** — the `MatchStatus` enum
  `scheduled → called → playing → finished | retired` (with `uncall`:
  `called → scheduled`), terminal states `finished` / `retired`, and
  `LOCKED_STATUSES` the solver pins. See
  [Data flow](/architecture/data-flow#the-match-state-machine).
- Runs the **idempotent command pipeline** (call / start / finish / retire /
  uncall) with optimistic UI and inline conflict handling.

## The Run surface

The live surface is `products/operations/run/RunSurface.tsx`, driven by an
**Operations-owned state machine** in `runtime/`:

- `runMachine.ts` — a `RunStatus` view-machine `scheduled → called → playing →
  done`, mapping onto the canonical enum (`started → playing`, `finished → done`);
  `late` is a derived flag, never stored.
- `runModel.ts` — derives each court's **Now / Next / Later** lanes, the global
  queue, and the summary band from `court + slot + status` (so a refresh never
  loses the floor).
- `runActions.ts` — the write router: meet actions through the command queue,
  bracket actions through non-solver `assignCourt` / `unassign` + the
  [result command queue](/architecture/bracket-result-queue).

When both engines are enabled these surfaces interleave both engines' matches —
see [Unified Operations view](/architecture/unified-operations-view).

## What it owns

| Kind | Owned |
| --- | --- |
| **Nav surfaces** | Plan · Run — pointed at the active engine (`schedule`/`live` for Meet, `bracket-schedule`/`bracket-live` for Bracket) |
| **Backend routes** | `/tournaments/{id}/match-states*` (get/put with `ETag`/`If-Match`, reset, export/import) and `/tournaments/{id}/commands` |
| **`apiClient` methods** | `getMatchStates`, `getMatchState`, `getMatchVersion`, `updateMatchState`, `resetMatchStates`, `submitCommand`, `exportMatchStates`, `importMatchStates`, `importMatchStatesBulk` |
| **Store slice** | `matchStateStore` (match states, optimistic command state, conflict records, canonical versions) |
| **Frontend code** | `products/operations/` — `opsBlock.ts` (the uniform block), `run/` + `runtime/` (the Run surface + its machine), `UnifiedOpsBoard.tsx` / `UnifiedOpsList.tsx` (the Plan board), `OpsDetailRail.tsx`, `SourceChip.tsx`, and the read-only projection in `lib/operations/operationalMatch.ts` |
| **Backend** | `services/match_state.py`; tables `match_states`, `commands` |

## The uniform block

`products/operations/opsBlock.ts` defines `OpsBlock` — the engine-agnostic
interactive row both surfaces speak — with `meetToOpsBlocks` /
`bracketToOpsBlocks` adapters folding each engine's native shape. `SourceChip`
renders an engine-tinted provenance badge (Meet vs Bracket). See
[Unified Operations view](/architecture/unified-operations-view) for the full
view-model.

## What it produces

- **`MatchStateDTO`** — live match status. Consumed by **Meet** (as a solve input)
  and by **[Display](/modules/display)** via [Seam D](/contracts/operations-display).
  The write edge it emits is `matchStateChanged`.

## What it consumes

- **`ScheduleDTO`** from Meet ([Seam A](/contracts/meet-operations)) — reacts to
  `scheduleFinalized` to seed the live layout.
- **`BracketTournamentDTO`** from Bracket ([Seam B](/contracts/bracket-operations))
  — read via `getBracket` to lay out bracket-origin live matches.

## Status & notes

- **A first-class product.** Operations now has its own `products/operations/`
  home (the Run surface, runtime machine, Plan board, and uniform block all live
  there) — the earlier "extract Operations as a first-class product" structural
  bet is done. It remains **Tier-2 by design**: always-on, `enableable: false`,
  no `WorkspaceModule` row — the answer to "separate installable module, or
  always-on cross-cutting concern?" is the latter.
- **`matchStateStore` location.** The store lives in the global `src/store/`
  rather than under `products/operations/`, though only Operations-driving hooks
  write it — see [State management](/architecture/state-management#known-debt-matchstatestore).
