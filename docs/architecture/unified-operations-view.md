# Unified Operations view (Meet · Bracket)

When a workspace has **both** the Meet and the Bracket modules enabled,
the Operations **Courts** and **Live** surfaces render ONE cross-engine
view: the two engines' matches interleaved on a single court plan, each
row tagged with the engine it came from. Single-engine workspaces are
unchanged — they keep their existing engine-specific Operations surfaces.

This page describes the view-model that folds the two engines together,
how the unified surfaces route operator actions back to the right engine,
and why the feature is a render-swap rather than a navigation change.

## The engine-agnostic row

`lib/operations/operationalMatch.ts` defines `OperationalMatch` — the
normalised row both Operations surfaces speak, regardless of source. It
carries a stable `id`, a `source` (`'meet' | 'bracket'`), an optional
`courtLabel` (`C{n}`) and `slot`, resolved display names for `sideA` /
`sideB` (joined with `/` for doubles, `TBD` when a side is unknown), an
optional point `score`, and a unified `status`.

Two pure adapters produce these rows:

- **`meetMatchesToOperational(...)`** folds the meet engine's native
  shape — `MatchDTO` + `ScheduleDTO` + `MatchStateDTO` — into rows,
  resolving player UUIDs to names. A match-state court override
  (`actualCourtId`) wins over the planned court, mirroring the live-ops
  display logic.
- **`bracketToOperational(...)`** folds the polled `BracketTournamentDTO`
  snapshot (play units + assignments + results), resolving side names
  through the shared `playUnitSideLabels` helper (confirmed participants,
  a feeder reference, or `Bye` / `TBD`).

Both adapters emit ONE row per match — including unassigned ("waiting")
matches — so the operational list is complete.

::: info Status is unified, but the engines differ
The unified `status` is `scheduled | called | started | finished`. Meet
emits all four. Bracket has **no distinct `called` state** in its DTO, so
bracket rows only ever take `scheduled | started | finished`. The
clock-derived "late" decoration is **not** a persisted status — the
adapters are pure and deterministic (no `Date.now()`), so it is excluded
from the view-model and stays a render-time concern.
:::

`score` is **meet-only**. Bracket records a `winner_side`, never a point
tally, so `score` is always undefined on bracket rows — an expected
asymmetry between the engines, not a gap.

## The hybrid merge

`mergeOperational(meet, bracket)` concatenates the two adapters' output
into one list and sorts it deterministically:

1. Assigned rows (those with both a court and a slot) come before waiting
   (unassigned) rows.
2. Assigned rows sort by court index — numeric, so court 2 precedes court
   10 — then by slot.
3. A cross-engine tie on the same court and slot breaks meet-before-
   bracket, then by `id`. This only keeps the order stable; it is never a
   claim that two matches truly share a court and slot.
4. Waiting rows keep their concatenation order (meet rows first, then
   bracket rows).

Both unified surfaces — `products/operations/UnifiedCourtsView.tsx` and
`UnifiedLiveView.tsx` — call `mergeOperational` and render the merged
list. Each row carries a per-row `SourceChip` keyed on
`OperationalMatch.source` (Meet tinted sky, Bracket tinted violet) so a
mixed list still reads apart at a glance. **Courts** is the read-oriented
spatial overview; **Live** mirrors it but adds operator actions per row.

## Write-back routes by source

On the Live surface a single operator action must reach the API of the
engine that produced the row. `operationalWriteback.ts` is the pure
dispatcher: `routeOperationalAction(row, action, router)` inspects
`row.source` and forwards to the matching handler. One surface owns ONE
router; the engines never cross wires.

`OperationsProduct.tsx` wires the two handlers:

| Source | Honoured actions | Path |
|---|---|---|
| `meet` | `call` / `start` / `finish` | `useCommandQueue` (the same command queue the single-engine Live surface uses) |
| `bracket` | `recordWinner` | `useBracketResultQueue` (the SP-F3 bracket result queue) |

The action vocabulary is the shared subset each engine can honour, and
each handler decides what (if anything) an action means for its engine:
meet honours the lifecycle verbs and ignores `recordWinner`; bracket
honours only `recordWinner` and returns nothing for the lifecycle verbs.
In the UI, a bracket row's "record winner" buttons stay **disabled until
the match is on a court** (`canRecord = row.courtLabel != null`). Per
[ADR 0006](/decisions/0006-unified-scheduling-core) the two engines keep
separate match models, so there is no merged write path — only this
per-source routing.

`OperationsProduct` wraps its body in a `BracketApiProvider` keyed on the
tournament id, because the bracket rows need `useBracket`, which only
resolves inside that provider (the meet surfaces never mount it). Keying
on the id remounts the provider when the operator switches workspaces, so
bracket data never lingers from the previous tournament.

## Why a render-swap, not a navigation change

The feature is gated, not navigated. `AppShell.tsx` resolves
`bothEnginesEnabled = meetEnabled && bracketEnabled`, where both flags
read the **real persisted module catalog** (`useWorkspaceModules`), never
the kind-derived fallback. An indeterminate or still-loading catalog
therefore fails safe to single-engine. That flag is passed to
`ModuleOutlet`, which performs the swap:

```
ModuleOutlet(bothEnginesEnabled):
  if bothEnginesEnabled and isOperationsSegment(activeTab):
        → <OperationsProduct/>        (unified cross-engine surface)
  else  → the owning engine's product (Meet / Bracket / Display)
```

Crucially, the unified surface **reuses the existing Operations segment
ids** (`schedule` / `bracket-schedule` for Courts, `live` / `bracket-live`
for Live — see `operationsSegments.ts`) rather than minting new ones.

::: tip Deliberately not a workspaceNav change
Reusing the segment ids and swapping only the rendered surface keeps the
sidebar navigation model and the module-contract ownership invariant
exactly as shipped. A new "unified Operations" nav entry would have had to
claim segment ownership, touching the `moduleContract` ownership
invariants. The render-swap avoids that entirely: single-engine
workspaces resolve the same segments to their own engine-specific views,
and only the both-engines case resolves them to `OperationsProduct`.
:::

## See also

- [ADR 0006 — Unified scheduling core, non-merged match record](/decisions/0006-unified-scheduling-core)
- [Scheduling unification](/architecture/scheduling-unification)
- [Operations module](/modules/operations) · [Meet module](/modules/meet) · [Bracket module](/modules/bracket)
