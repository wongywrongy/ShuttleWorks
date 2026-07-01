# Contract: Meet → Operations (Seam A)

The Meet engine produces a solved schedule; the Operations layer turns it into a live court layout.
This is **Seam A**, the `scheduleFinalized` edge. This page is for developers working either side of
the schedule-to-floor boundary.

| | |
| --- | --- |
| **Direction** | Meet → Operations |
| **Named edge** | `scheduleFinalized` |
| **Payload** | `ScheduleDTO` (in) → `MatchStateDTO` (out, Operations-owned) |
| **Transport today** | store-subscription edge (`tournamentStore.setSchedule`) + ~5 s match-state poll |
| **Status** | **wired** |
| **Criticality** | **High** — Operations has nothing to lay out until a schedule exists. But it degrades *safely*: the edge is in-process (no network to partially fail), and a missing/stale schedule yields an empty or mislaid board, never corrupted state. The reverse `MatchStateDTO` poll is independent. |
| **Risk / fragility** | The edge is an *implicit* Zustand store subscription, not a typed push — a refactor that renames or bypasses `setSchedule` could silently stop seeding with **no compile error**. The contract test pins `emits`/`reactsTo`, but the transport itself is unenforced (a boundary-lint rule is a noted, out-of-scope future). |

## What crosses the boundary

A **`ScheduleDTO`** — the solved meet schedule: the court/slot **assignments** for every match.
Operations reads these assignments to build its **Plan** surface (which match is where, in which
slot) and to seed the per-match rows its **Run** surface tracks. (Plan and Run were formerly named
*Courts* and *Live*.)

The reverse direction is also part of this seam: Operations owns **`MatchStateDTO`**, and Meet
**consumes it back** (`getMatchStates`) as a solve input — a re-plan must respect matches that are
already `called` / `playing` / `finished`, which the solver pins via `LOCKED_STATUSES`
(`backend/services/match_state.py`). So the boundary carries a schedule *out* of Meet and live status
*back in*.

## Which side owns what

| Artifact | Owner | Notes |
| --- | --- | --- |
| `ScheduleDTO` (the plan) | **Meet** | `meetContract.produces = ['ScheduleDTO']` |
| `/schedule*` solver endpoints | **Meet** | owned |
| `MatchStateDTO` (live status) | **Operations** | `operationsContract.produces = ['MatchStateDTO']`; Meet lists it under `consumes` |
| The court layout / live view | **Operations** | seeds from the schedule |

Meet declares `emits: ['scheduleFinalized']`; Operations declares `reactsTo: ['scheduleFinalized']`.
The shared `/state` blob is **not** part of this seam — it is consumed by Meet, owned by the control
plane (it co-lives with the control-plane CRUD in the tournaments router).

## What the current implementation does

1. Meet solves (`/schedule/stream`, SSE) and the result lands via `tournamentStore.setSchedule`.
   That store write **is** the `scheduleFinalized` edge.
2. The Operations surfaces read `tournamentStore.schedule` through a Zustand selector — there is no
   event bus and no explicit `emit('scheduleFinalized')` call; the coupling is the shared store.
3. Operations' Run surface also runs an independent **~5 s poll** of `GET …/match-states`
   (`useLiveTracking`) for the live status it owns.
4. `meetToOpsBlocks(matches, schedule, matchStates, nameById, config)` in
   `products/operations/opsBlock.ts` folds the `MatchDTO` + `ScheduleDTO` + `MatchStateDTO` into the
   canonical engine-agnostic `Match` / `OpsBlock` row (ADR 0009). A live court override beats the
   planned court (`matchStates[id].actualCourtId ?? assignment.courtId`), and a `postponed` flag
   forces the row back into the queue.

## What the intended clean interface looks like

Per the module-architecture-modernization design (which is "honest, not aspirational"), the intended
interface today is the **named, typed seam itself** — `scheduleFinalized`, with `ScheduleDTO` as the
declared payload and clear producer/consumer ownership in the descriptors. The design **does not**
re-wire the transport: no `emit('scheduleFinalized')` call is inserted into `setSchedule`, and no
cross-store bridge is added. The seam is made explicit and test-enforced over the *existing*
store-subscription edge.

Genuinely cleaner transports — replacing the shared-store read with an explicit event, or the poll
with a subscription, or adding an ESLint boundary rule so a component cannot bypass the seam — are
recognised as possible futures and are **out of scope** by design (and non-blocking). The contract's
job is to make the boundary nameable and to fail a test if anyone claims an edge that does not exist.

## See also

- [System overview](/architecture/system-overview) · [Data flow](/architecture/data-flow)
- [Meet module](/modules/meet) · [Operations module](/modules/operations)
- [ADR 0009 — Universal match contract](/decisions/0009-universal-match-contract)
