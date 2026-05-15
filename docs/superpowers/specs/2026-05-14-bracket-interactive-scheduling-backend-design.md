# Bracket Interactive-Scheduling Backend — Design

**Status:** Approved design — ready for implementation planning. Written 2026-05-14. Sub-project **#1** of `docs/superpowers/specs/2026-05-14-bracket-court-time-views-decomposition.md`.

**Goal:** Give the bracket surface the backend it needs for an interactive court×time Schedule Gantt — a per-match feasibility check and a pin-and-re-solve — mirroring what the meet surface already has (`/schedule/validate` + `pinAndResolve`).

## Context

The bracket backend (`api/brackets.py`) has no per-match scheduling endpoint — only `schedule-next` (round bulk-solve, append-only), `results`, and `match-action`. The shared CP-SAT engine *already* fully supports pinning/locking (`PreviousAssignment` + the `LocksAndPins` plugin); the bracket simply never uses it — `services/bracket/adapter.py` `build_problem` passes `previous_assignments=[]` unconditionally. This sub-project wires that up and adds the two endpoints. The interactive Gantt UI is out of scope — that is sub-project #3.

## The two endpoints

Both are keyed off the server-persisted bracket session. The backend already hydrates full state via `_hydrate_session` on every bracket route, so requests carry **only the proposed move** — no need to round-trip the assignment list the way the meet's `/schedule/validate` does.

### `POST /tournaments/{tid}/bracket/validate`

Request: `{ play_unit_id, slot_id, court_id }`. Response: `{ feasible: bool, conflicts: ValidationConflict[] }` (mirrors the meet's `ValidationResponseDTO`).

Behaviour: hydrate session → splice the proposed `(slot_id, court_id)` for `play_unit_id` into the current assignment set (replacing its existing entry) → run the feasibility check → return. Pure-Python, no CP-SAT — fast enough to be debounced on drag-move by the #3 frontend.

Feasibility = the subset of the meet's `scheduler_core` `find_conflicts` that applies to the bracket (court/slot overlap, player double-booking, player rest) **plus one new check — draw-dependency ordering**: the proposed slot must be ≥ every feeder match's end-slot (`feeder.slot_id + feeder.duration_slots`). Checked against the **full current assignment set**.

If `play_unit_id` is a *locked* match (see below), `/validate` returns `feasible: false` with a `locked` conflict — locked matches are not draggable.

### `POST /tournaments/{tid}/bracket/pin`

Request: `{ play_unit_id, slot_id, court_id }`. Response: the updated `TournamentDTO` (same shape `/results` and `/match-action` already return).

Behaviour: hydrate session → partition `state.assignments` into three sets → re-solve via the shared CP-SAT engine → write the resulting assignments back into `state.assignments` → persist → return the serialized session.

The partition:
- **locked** — has a result (played) **∪** has `actual_start_slot` set (started) **∪** ends in the past (`slot_id + duration_slots <= current_slot`). Emitted as `PreviousAssignment(locked=True)`.
- **pinned** — the single `play_unit_id` being dragged. Emitted as `PreviousAssignment(pinned_slot_id=slot_id, pinned_court_id=court_id)`.
- **free** — every other scheduled play_unit. Emitted as plain `Match`es, no `PreviousAssignment` — the solver re-places them.

The re-solve uses the session's existing `current_slot` **unchanged** — a re-pin re-optimises the *already-scheduled* set; it does not advance to a new round (that remains `schedule-next`'s job). The `(current_slot, total_slots)` player-availability window therefore keeps free matches from being re-placed into the past.

If `play_unit_id` is in the locked set, reject with `409` — a played/started/past match cannot be re-pinned.

## The validate↔pin contract

`/validate` is the cheap pure-Python predictor; `/pin` is the CP-SAT authority. `/validate` checks the proposed position against the **full current assignment set**; if the cell is clear, dependency-ordering holds, and no player conflict exists, it returns `feasible: true`.

The guarantee: **`feasible: true` reliably means `/pin` will succeed.** A position clear of *all* current matches is necessarily clear of the *locked* subset, and `/pin` then only has to fit the *free* matches around the pin — which had at least as much room before the drag (the dragged match vacated its old cell). `/validate` is deliberately **conservative, not a re-solve**: it cannot see that a re-solve would vacate an occupied cell, so it reports `feasible: false` there even when `/pin` could have worked — the same accepted behaviour as the meet's `/validate`. The asymmetry that must **never** happen is the reverse — `feasible: true` on a position `/pin` then rejects.

## Dependency ordering is forward-only

Only the forward check applies: proposed slot ≥ every feeder's end-slot. The reverse — dragging a match earlier than something that feeds *it* — cannot arise: a play_unit whose feeders aren't yet resolved is not "ready", so it is not in `state.assignments` at all, so it is not draggable.

## Backend changes

| File | Change |
|---|---|
| `services/bracket/validation.py` *(new)* | The pure-Python bracket feasibility check — reuses `scheduler_core` `find_conflicts`, adds the dependency-ordering check, maps results to the `ValidationConflict` response shape. |
| `services/bracket/adapter.py` | `build_problem` — extend to accept the locked/pinned/free partition and emit `PreviousAssignment`s accordingly (currently hardcodes `previous_assignments=[]`). This is the load-bearing change; the engine's `LocksAndPins` plugin already does the rest. |
| `services/bracket/scheduler.py` | `TournamentDriver` — add `repin_and_resolve(play_unit_id, slot_id, court_id)`: partition `state.assignments`, build the problem, solve, write back. Sits alongside the existing append-only `schedule_next_round()`. |
| `api/brackets.py` | The two new routes + their request/response Pydantic models. |
| `frontend/src/api/bracketClient.tsx` + `bracketDto.ts` | Two new client methods (`validateMove`, `pinMatch`) + DTO types — wiring only, no UI (UI is #3). |

## Out of scope (deliberate)

- **Persistent pins.** Each `/pin` re-solves with only the dragged match pinned; pins do **not** persist. A later drag can re-place an earlier one — the meet's behaviour, and the deferred "caveat." No `locked`/`pinned_*` serialization is added to the session blob; those `TournamentAssignment` placeholder fields stay unused until a future explicit "lock this match" affordance.
- **Freeze-horizon locking.** The bracket models no freeze horizon today; matches are not locked merely for being imminent — only played/started/past. A bracket freeze horizon is a separate concern.
- **Breaks / court closures** in the bracket solve — the adapter doesn't model them; unchanged here.
- **The interactive Gantt UI** — sub-project #3.

## Testing

pytest (`products/scheduler/tests/`):
- `/validate` — a feasible move, plus one infeasible case per conflict type: court overlap, player double-booking, player rest, dependency ordering, and a locked-match drag.
- `/pin` — re-solve correctness: locked matches keep their exact `(slot, court)`, the pinned match lands at its target, free matches re-optimise; and a `409` when `play_unit_id` is locked.
- The existing bracket pytest suite stays green.

## Decisions log

- **Two endpoints, server-state-keyed.** The bracket persists session state, so requests carry only the proposed move — no assignment-list round-trip.
- **`/validate` checks the full current assignment set** (meet-faithful conservatism), not the locked subset only — keeps the validate↔pin contract simple and sound.
- **Locked set = played ∪ started ∪ past.** Freeze-horizon locking explicitly deferred.
- **Transient pins** — meet-faithful; persistent locking deferred to a future affordance.
- **Reuse, don't reinvent** — `scheduler_core` `find_conflicts` for the check, the engine's existing `LocksAndPins` for the re-solve. The engine is not the gap; the adapter is.
