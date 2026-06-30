# Examples

Small, copy-pasteable recipes for the seams a developer touches most: folding
both engines into one operational shape, deriving the Run board, submitting
operator and bracket-result commands optimistically, and solving a schedule from
the engine. Each recipe shows the **real signature** from source and links to the
fuller explanation. Snippets are intentionally minimal — read the linked page for
the nuance.

::: info Where these live
Frontend recipes are under `products/scheduler/frontend/src/`; the engine recipe
is the `scheduler_core` Python package at the repo root. File paths in the
comments are relative to those roots.
:::

## Fold both engines into one operational shape

Meet and Bracket have different native models, but Operations speaks **one**
interactive row. `meetToOpsBlocks` / `bracketToOpsBlocks`
(`products/operations/opsBlock.ts`) are the two adapters that fold each engine's
shape into an `OpsBlock`.

```ts
// products/operations/opsBlock.ts
import { meetToOpsBlocks, bracketToOpsBlocks, type OpsBlock } from
  './products/operations/opsBlock';

// Meet's native model → uniform blocks. Live match-state overlays the
// committed schedule (postpone/actual-slot win over the planned assignment).
const meetBlocks: OpsBlock[] = meetToOpsBlocks(
  matches,      // MatchDTO[]                     — the meet match list
  schedule,     // ScheduleDTO | null             — committed court/slot assignments
  matchStates,  // Record<string, MatchStateDTO>  — live status overlay
  nameById,     // Record<string, string>         — player id → display name
  config,       // TournamentConfig | null        — overnight-safe slot math
);

// Bracket's polled snapshot → the SAME shape.
const bracketBlocks: OpsBlock[] = bracketToOpsBlocks(bracketDto);
```

::: tip `OpsBlock` is now an alias of `Match`
`OpsBlock` is a kept `@deprecated` alias of the cross-module `Match` contract
(`platform/domain/match.ts`). New code should import `Match`; the adapters and
`packBlockLanes` still live in `opsBlock.ts`. See
[ADR 0009 — Universal match contract](/decisions/0009-universal-match-contract)
and [Unified Operations view](/architecture/unified-operations-view).
:::

## Derive the Run board: Now / Next / Later lanes + queue

The Run surface is built from `OpsBlock`s in two steps: convert to the Run
view-model with `toRunMatches`, then derive per-court lanes and the global queue
(`products/operations/runtime/runModel.ts`). Order is **derived, never persisted**,
so a refresh never loses the floor.

```ts
// products/operations/runtime/runModel.ts
import { toRunMatches, deriveCourtLanes, deriveQueue } from
  './products/operations/runtime/runModel';

// 1. Fold engine blocks into the Run view-model. Bracket has no persisted
//    `called`, so the Operations-local overlay sets are injected here.
const runMatches = toRunMatches([...meetBlocks, ...bracketBlocks], {
  calledBracketIds,    // ReadonlySet<string> — Operations-local "called" flag
  eligibleBracketIds,  // ReadonlySet<string> — bracket rows whose feeders resolved
});

// 2. Per-court Now / Next / Later. `late` is applied to the Now match only,
//    and only once the floor is `running` (wired to planFinalized).
const lanes = deriveCourtLanes(runMatches, courtCount, { running, currentSlot });

// 3. The global queue: unassigned, non-done, sorted by planned slot then key.
const queue = deriveQueue(runMatches);
```

The `late` derivation is lane- and run-state-aware on purpose — see the source
notes and [Operations](/modules/operations) for why a Next/Later match is never
late.

## Submit an operator command optimistically

Operator actions (call / start / finish / retire / uncall / assign / postpone)
flow through `useCommandQueue` (`hooks/useCommandQueue.ts`): mint a UUID
idempotency key, apply the optimistic status, enqueue in IndexedDB, then `POST
/tournaments/{id}/commands` and route the outcome.

```ts
// hooks/useCommandQueue.ts
import { useCommandQueue } from './hooks/useCommandQueue';

function CallToCourtButton({ matchId }: { matchId: string }) {
  const { submit } = useCommandQueue();

  async function onClick() {
    // UI flips to `called` immediately; the conflict banner is recorded in
    // matchStateStore by the hook, so the caller only reacts if it wants to.
    const { result } = await submit('call_to_court', matchId);
    if (result.kind === 'conflict' || result.kind === 'staleVersion') {
      // already surfaced inline — nothing more to do here
    }
  }
  // ...
}
```

The first argument is a `MatchAction`: `'call_to_court' | 'start_match' |
'finish_match' | 'retire_match' | 'uncall' | 'assign_court' | 'postpone_match'`.
The result is a discriminated union: `'ok' | 'staleVersion' | 'conflict' |
'networkError'`. See
[the command pipeline](/architecture/data-flow#the-command-pipeline-write-path).

## Record a bracket result through the command queue

Bracket has no `matchStateStore`, so `useBracketResultQueue`
(`hooks/useBracketResultQueue.ts`) takes **injected view-model handlers** and owns
only the queue, the UUID, the flush, and the outcome routing. The write routes
through `POST /tournaments/{id}/bracket/commands` as a `record_result` command.

```ts
// hooks/useBracketResultQueue.ts
import { useBracketResultQueue } from './hooks/useBracketResultQueue';

const { submit } = useBracketResultQueue({
  onOptimistic: (input) => { /* reflect the pending winner in your view-model */ },
  onSettled:    (dto)   => { /* replace it with the authoritative bracket DTO */ },
  onConflict:   (kind, message) => { /* kind: 'stale_version' | 'conflict' */ },
});

// The queue's UUID doubles as the idempotency key, so a replay never re-runs
// advancement.
await submit({
  matchId: playUnitId,
  winnerSide: 'A',     // 'A' | 'B'
  seenVersion,         // the PlayUnitDTO.version the client last observed
  finishedAtSlot,      // optional
  walkover: false,     // optional
  score,               // optional BracketScore | null
});
```

::: warning `seenVersion` is the conflict guard
Pass the `version` you last saw on the play unit. A stale value comes back as a
`409 stale_version` (recoverable — the hook refetches) versus a hard `conflict`.
This is what lets two operators record into the same bracket safely. See
[Bracket result queue](/architecture/bracket-result-queue) and
[ADR 0007](/decisions/0007-bracket-result-command-queue).
:::

## Build a schedule from the engine

`scheduler_core.schedule()` is the single batch entry point both products call to
drive CP-SAT. Hand it a `ScheduleRequest` (config + players + matches); it returns
a `ScheduleResult`.

```python
# scheduler_core/schedule.py
from scheduler_core import (
    schedule, ScheduleRequest, ScheduleConfig, Player, Match, SolverStatus,
)

request = ScheduleRequest(
    config=ScheduleConfig(total_slots=12, court_count=4),  # 12 slots over 4 courts
    players=[
        Player(id="p1", name="Alice"),
        Player(id="p2", name="Bob"),
    ],
    matches=[
        Match(id="m1", event_code="MS", side_a=["p1"], side_b=["p2"]),
    ],
)

result = schedule(request)  # -> ScheduleResult
if result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE):
    for a in result.assignments:        # Assignment(match_id, slot_id, court_id, ...)
        print(a.match_id, a.court_id, a.slot_id)
```

For a reproducible solve, pass `options=SolverOptions(deterministic=True,
random_seed=...)`; `result.solver_seed` echoes the seed actually used. See
[Scheduling unification](/architecture/scheduling-unification) and
[Build on the engine](/how-to/build-on-the-engine).

## Pack overlapping blocks into court sub-lanes

Meet and Bracket solve the same physical courts independently
([ADR 0006](/decisions/0006-unified-scheduling-core)), so they can double-book one
`(court, slot)`. `packBlockLanes` (`products/operations/opsBlock.ts`) assigns each
colliding block a sub-lane so they render side-by-side instead of z-fighting.

```ts
// products/operations/opsBlock.ts
import { packBlockLanes } from './products/operations/opsBlock';

const lanes = packBlockLanes([...meetBlocks, ...bracketBlocks]);
// Map keyed by OpsBlock.key → { laneIndex, laneCount }
const { laneIndex, laneCount } = lanes.get(block.key)!;
```

## See also

- [Unified Operations view](/architecture/unified-operations-view) — the full view-model behind these blocks
- [Operations](/modules/operations) — the module that owns the Run + Plan surfaces
- [Data flow](/architecture/data-flow#the-command-pipeline-write-path) — the optimistic command pipeline end to end
- [Bracket result queue](/architecture/bracket-result-queue) · [ADR 0007](/decisions/0007-bracket-result-command-queue)
- [Build on the engine](/how-to/build-on-the-engine) · [Scheduling unification](/architecture/scheduling-unification)
- [ADR 0009 — Universal match contract](/decisions/0009-universal-match-contract) · [ADR 0006 — Unified scheduling core](/decisions/0006-unified-scheduling-core)
