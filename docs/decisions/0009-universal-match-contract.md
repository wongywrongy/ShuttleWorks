# 9. Universal match contract (`Match`)

Date: 2026-06-30

## Status

Accepted

## Context

"A match is a match — the only difference is where it came from." Across the
app, the same conceptual object — a scheduled unit of play — was represented by
**six** different shapes:

| Shape | Where | Role |
|---|---|---|
| `MatchDTO` | meet API | engine-native (meet) |
| `PlayUnitDTO` | bracket API | engine-native (bracket) |
| `OperationalMatch` | `lib/operations/operationalMatch` | read-only cross-engine projection |
| `OpsBlock` | `products/operations/opsBlock` | the richer cross-engine shape the boards/list/detail speak |
| `RunMatch` | `operations/runtime/runModel` | Run view-model (adds `late`/`eligible`) |
| `BoardChip` | `operations/runtime/boardPlacements` | board placement view-model |

The two **engine-native** shapes are legitimately separate (ADR 0006 keeps the
engines apart). But `OperationalMatch` and `OpsBlock` were two *parallel*
cross-engine projections of the same thing — and `OperationalMatch`'s adapters
(`meetMatchesToOperational` / `bracketToOperational` / `mergeOperational`) had
gone dead (only their own test referenced them). The cross-engine match shape
already existed implicitly as `OpsBlock`; it just wasn't **named, documented, or
singular**.

## Decision

Formalize the implicit `OpsBlock` shape as the one canonical cross-module match
contract, `Match`, in the shared domain layer (`platform/domain/match.ts`):

- `Match` carries `source`, `id`, `key` (`matchKey(source, id)`), `label`,
  `colorKey`, `court`, `slot`, `span`, `status`, `sideA`/`sideB`, `done`,
  `started`, `actualStartSlot`/`actualEndSlot`.
- The **only** seam where engine-native → canonical happens is the two adapters
  in `products/operations/opsBlock.ts` (`meetToOpsBlocks` / `bracketToOpsBlocks`).
- `OpsBlock` becomes a deprecated **alias** of `Match` (no churn across its ~16
  importers); new code imports `Match`.
- `RunMatch` and `BoardChip` stay as **view-models** derived from `Match` — they
  add surface-specific facts (`late`, `eligible`, placement geometry), so they
  are not duplicates of the contract.
- `OperationalMatch` + its dead adapters + their test are **removed**; the shared
  `MatchSource` / `MatchStatus` types move into `platform/domain/match`.

## Consequences

- One named contract; one adapter seam; `−1` redundant shape and a chunk of dead
  code gone.
- **A deliberate seam remains:** `Match.status` uses the engine vocabulary
  (`scheduled | called | started | finished`) because that is what both engines
  persist. View-models that need the operator vocabulary (`playing` / `done`) —
  the Run state machine / `RunMatch` — map at their own boundary via
  `fromEngineStatus`. The contract is "universal" in *shape*, not in status
  vocabulary; that split is intentional, not an omission.
- Adoption is incremental: the alias means existing code keeps compiling; future
  work migrates `OpsBlock` references to `Match` opportunistically.
