# Tournament prototype on top of scheduler_core

**Branch:** `tournament-prototype` (off `engine-only`)
**Status:** design — implementation in progress

## Goal

Reuse the extracted `scheduler_core` CP-SAT engine to power **standard
tournament formats** — single elimination (R32 → R16 → QF → SF → F) and
round robin — without dragging in BTP's dual-meet UI. Tournament
directors generate a draw, then schedule matches; the same engine
handles court assignment, rest, and compactness.

The prototype is Python-first: a `tournament` package + CLI demo + tests.
A web UI is out of scope for this spec; that's a follow-on once the
domain model is steady.

## Non-goals

- No frontend in this branch. (BTP's existing control center is
  desk-meet specific; a tournament UI is its own design pass later.)
- No persistence layer. State lives in memory; the CLI takes/emits JSON.
- No double elimination, consolation, compass, or other exotic formats.
- No live-ops integrations beyond what the engine already exposes
  (`reschedule`, `handle_overrun`, `handle_court_outage`). The
  prototype calls these as-is.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    tournament/                          │
│                                                         │
│  formats/single_elimination.py — bracket generation     │
│  formats/round_robin.py        — pool generation        │
│  draw.py                       — Draw + dependency DAG  │
│  state.py                      — TournamentState        │
│  advancement.py                — winners → next round   │
│  adapter.py                    — Draw → engine input    │
│  scheduler.py                  — round-by-round driver  │
│  cli.py                        — JSON-in / JSON-out     │
└──────────────────────┬──────────────────────────────────┘
                       │ engine dataclasses
                       ▼
              scheduler_core.schedule(...)
```

The package never imports anything outside `scheduler_core` and the
standard library. `scheduler_core` doesn't change.

## Data model

Reuse `scheduler_core.domain.tournament` types where they fit:

- `Participant` — a player or team. Already defined.
- `Event` — a single draw within a tournament. Already defined.
- `PlayUnit` — a match in the draw. Already defined; `dependencies`
  captures bracket precedence (R16-M1 depends on R32-M1 and R32-M2).
- `TournamentState` — already defined; we add helpers.

Add one new type:

```python
@dataclass
class BracketSlot:
    """A bracket leaf — concrete participant OR pointer to an unresolved match."""
    participant_id: ParticipantId | None = None
    feeder_play_unit_id: PlayUnitId | None = None  # winner-of feeder
```

For SE round 1, every slot has a `participant_id` (or a `BYE` sentinel).
For round ≥ 2, slots start with `feeder_play_unit_id` and are filled in
by `advancement.advance_round(...)` once the feeder PlayUnit's `Result`
is recorded.

## Format generation

### Single elimination

Inputs: a list of seeded `Participant`s and a target bracket size
(power of two: 8, 16, 32, 64, 128). Pads with `BYE` to the next power.

Pairing: the standard seeded bracket (1 vs 32, 16 vs 17, 8 vs 25, …).
Implemented by recursive interleave on `[0, N)` then mapping to seeds.

Output: a `Draw` with PlayUnits for every round. Round-1 PlayUnits
have concrete `side_a`/`side_b`; later rounds have `dependencies`
pointing at their two feeders, with `side_a` and `side_b` left `None`
until advancement fills them in. BYEs auto-advance — a R1 PlayUnit
where one side is `BYE` is created with `Result(walkover=True,
winner_side=A)` so its R2 child has one side resolved immediately.

### Round robin

Inputs: a list of `Participant`s (no seeding required) and an optional
`rounds` count (default 1 — single round robin).

Pairing: standard circle method (one participant fixed, others rotate)
producing `(N-1)` rounds when `N` even, `N` rounds when odd (one bye
per round). Output: PlayUnits with no `dependencies`. The engine
schedules them all at once.

## Adapter — Draw → engine input

`adapter.build_problem(state, ready_play_units, config) -> SchedulingProblem`:

1. Collect `Participant`s referenced by `ready_play_units`. Map each to
   a `scheduler_core.Player` (id = participant id; for teams, expand to
   one Player per member so player-no-overlap covers both sides of a
   doubles match).
2. Map each ready PlayUnit to a `scheduler_core.Match` with
   `event_code = event_id` (carries draw round in `metadata`),
   `side_a`/`side_b` flattened to player ids,
   `duration_slots = expected_duration_slots`.
3. Apply `previous_assignments` for any PlayUnit already scheduled in
   a prior solve (so the engine can warm-start and respect freeze
   horizon).
4. Return the assembled `SchedulingProblem`.

The adapter never schedules a PlayUnit whose dependencies are unresolved
— that's handled in the driver below.

## Scheduling driver — `scheduler.schedule_next_round(state, config)`

Round-by-round flow:

1. Pick "ready" PlayUnits — those with all dependencies in `state.results`,
   or with no dependencies (RR). Skip ones that already have a
   `TournamentAssignment`.
2. If nothing ready, return an empty `RoundResult` (caller knows the
   tournament is paused waiting on results).
3. Build problem via the adapter. Set
   `config.current_slot = max(end-slot of completed PlayUnits) + 1`
   and `config.freeze_horizon_slots` so prior matches stay put.
4. Call `scheduler_core.schedule(problem)`.
5. Translate `Assignment`s back into `TournamentAssignment`s; update
   `state.assignments`.

This is layered scheduling: each call advances one wave of matches.
Real tournaments operate this way — you don't know who plays in R16
until R32 finishes — so the prototype matches the operational reality.

For round robin, step 1 picks every PlayUnit at once and step 4
schedules the entire pool in one solve.

## Result reporting & advancement

`state.record_result(play_unit_id, winner_side, finished_at_slot)`:

1. Store a `Result` on the state.
2. Find PlayUnits that depend on this one. For each, if **all** their
   feeders have results, replace the relevant `BracketSlot` with the
   winner participant id and clear the feeder pointer. The PlayUnit
   becomes "ready" for the next `schedule_next_round` call.

Walkovers (BYEs) call `record_result` immediately at draw-creation time
with `walkover=True`, which cascades through `advance_round` so any
chains of byes resolve in one pass.

## CLI demo (`tournament/cli.py`)

A single command for the prototype:

```bash
python -m tournament.cli demo --format se --players 32 --courts 4 --slot-min 30
```

It runs end-to-end: generates a 32-player SE draw, schedules R32,
fakes results (top seed wins each match), schedules R16, repeats
through the final, and prints the full Gantt-style assignment table.
This is the smoke test of the design.

A second command takes an actual tournament file:

```bash
python -m tournament.cli plan tournament.json > schedule.json
```

The JSON shape is documented in `tournament/cli.py`'s module
docstring; it's small (participants, format, courts, slot length).

## Tests

Under `tests/tournament/`:

- `test_single_elimination.py` — bracket generation: 8/16/32/64
  player draws have correct round counts and feeder dependencies;
  bye padding works for non-power-of-two participant counts; seed
  pairings are correct (1v32, etc.).
- `test_round_robin.py` — every pair plays once; correct match
  count `N(N-1)/2`; circle method produces N-1 rounds for even N.
- `test_advancement.py` — recording a R32 result resolves the
  participant id on the right side of the corresponding R16
  PlayUnit; double byes propagate.
- `test_adapter.py` — `build_problem` produces an engine-valid
  `SchedulingProblem`; team participants expand to per-member players.
- `test_scheduler_driver.py` — schedule_next_round on a 16-player
  SE: R16 schedules cleanly, fake results, R8 schedules without
  conflicts and starts after R16 ends, repeat through final.
- `test_round_robin_end_to_end.py` — schedule a 6-player RR, every
  match scheduled, no player overlap, fits in expected slot count.

Engine tests stay untouched.

## Risks & open questions

- **Court count vs round size mismatch.** A 32-player R32 is 16 matches.
  With 4 courts, that's 4+ slot-rounds for R32 alone. The engine handles
  this fine — no issue, just notable for capacity planning.
- **Rest between rounds.** A player who wins R32 is in R16 next round.
  Default `rest_slots=1` already covers this. If we want a longer rest,
  the engine has `Player.rest_slots` per participant.
- **Bracket dependency vs slot precedence.** Layered scheduling enforces
  R16 ≥ R32-finish at the *caller* level (via `current_slot`). It does
  NOT prevent the solver from placing a R32 match at slot 9 and another
  R32 match at slot 0 — that's fine, all R32 matches are independent.
  But within one solver call, R16 cannot be scheduled until R32 results
  are in. This is by design.
- **Duration estimation.** `expected_duration_slots` defaults to 1 in
  `PlayUnit`. For real tournaments, we'd want sport-typical defaults
  (e.g. badminton singles: 45 min ≈ 2 slots at 30-min). The CLI
  accepts a `--duration-slots` flag; per-event variation is a
  follow-on.
- **Frontend.** Deferred entirely. Once the Python core is steady,
  a separate spec covers the draw/Gantt/control-center UI.

## Done definition

- All tests above pass: `pytest` from the worktree root.
- The CLI demo (`python -m tournament.cli demo --format se --players 32`)
  prints a complete schedule with no player conflicts and no R16
  match starting before its R32 feeders end.
- The `round_robin` demo (`python -m tournament.cli demo --format rr
  --players 6`) prints a complete pool schedule.
