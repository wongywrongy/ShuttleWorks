# ShuttleWorks — State Machines v2: Research, Codebase Read, Defined Plan

**Date:** 2026-09-12 · **Status:** proposed · **Supersedes:** `state-machines-read-and-plan.md` §4 (the tables in §2–§3 of that document stand)
**Grounded in:** `operations/match_state.py`, `solve_rail/solve_jobs.py`, `workspaces/workspace_modules.py`, `entries/lifecycle.py`, `shared/match_vocabulary.py`, `db/models.py` (`AuthorityTransition`), `apps/console/src/modules/operations/runtime/runMachine.ts`, `packages/shared-contract/`, ADR 0029, `.github/workflows/ci.yml`

---

## 1. What industry practice says

Four points, each with a source, each mapped to a decision below.

**Transitions are data, not scattered conditionals.** The standard implementation is a lookup keyed by `(current_state, event)` that yields the next state and an action; the table can live in a dict, a 2-D array, or external configuration, and its main advantages are that rules change without touching the engine and that the whole machine can be visualized and checked for completeness (Medium, State Design Pattern guide). Commercetools' guidance is blunter: define every transition explicitly and treat "no transitions defined means anything is allowed" as a defect, and document what each transition means (commercetools state-machine best practices). → Decision S-1.

**Record every transition, in a table.** Lawrence Jones (GoCardless, incident.io) describes the pattern of a dedicated transitions table per resource, where each state change is a row that can carry extra columns such as the ID that caused it, and notes it powers incident updates and audit history there (Lawrence Jones, "Use your database to power state machines"). The data-oriented-design literature makes the same point from the debugging side: logging every transition with its cause turns multi-day investigations into reading a log (Data-Oriented Design, "Finite State Machines"). → Decision S-4. You already do this for authority epochs (`tournament_authority_transitions`); the plan generalizes that table.

**Version the graph, pin the version on the row.** The newer Django library `vinta-django-state-machines` frames status as shared vocabulary, a versioned graph, and an append-only history, with the graph version pinned on each record so publishing a new graph never invalidates an existing row (PyPI, vinta-django-state-machines). Commercetools recommends adding new states rather than redefining existing ones so transitions can be gradual (commercetools). → Decision S-1 carries a `version` on each machine definition; pre-launch this stays at 1.

**One definition shared across tiers.** The generic advice for schema sharing is a single package both sides import so a change surfaces as a compile error rather than a silent divergence (Medium, shared-schema article). Your ADR 0029 found seventeen status vocabularies across three tiers, two of which each claimed to be canonical. → Decision S-5 exports the machines through `packages/shared-contract`, which exists for exactly this.

---

## 2. What the codebase says (deeper read)

**Four machines already exist, in three shapes.**

| Machine | File | Shape | Actor recorded | Guards |
|---|---|---|---|---|
| Match | `operations/match_state.py` | `dict[MatchStatus, list[MatchStatus]]` + `LOCKED_STATUSES` | no | none; `FINISHED → PLAYING` allowed as "undo finish" |
| Solve job | `solve_rail/solve_jobs.py` | `dict[str, frozenset[str]]` | no | none; `queued` re-entry for lease reap |
| Workspace module | `workspaces/workspace_modules.py` | `frozenset[(from, to)]` | implicit (operator) | server rules in route (Display needs operator, ≥1 enabled) |
| Entry | `entries/lifecycle.py` | named guard functions + constants | in docstring only | deadline, cap, verification |

Three different shapes for one concept is the drift ADR 0029 is about, one layer down. None records the actor in code; none writes a history row.

**The console duplicates the match machine with a different vocabulary.** `runMachine.ts` defines `scheduled | called | playing | done` and maps `finished → done`, dropping `retired`. `shared/match_vocabulary.py` was created to be the one authority for match states and the wire spelling map (`started ↔ playing`); the console does not consume it. This is a live instance of the seventeen-vocabularies finding.

**A transition-history table already exists for one domain.** `tournament_authority_transitions` (`transition_type`, `from_epoch`, `to_epoch`, `actor_id`, `device_id`, `reason`, `detail`) is the shape §1 recommends. It is per-domain; the plan makes it per-machine.

**The tier-sharing mechanism exists and is CI-checked.** `packages/shared-contract` exports `non-scheduling-keys.json` by package name; CI already has a "generated contract is current" gate pattern (`brand:check`, `figma:tokens:check`). A state-machine export slots into both.

**Tests.** `test_match_state.py` and `test_entrant_lifecycle_routes.py` pin current behavior; they are the characterization suite for the port in S-2. No test asserts anything structural (reachability, terminality) about any machine.

---

## 3. Defined plan

Each step names files, the change, and the acceptance criterion. Order is dependency order.

### S-1 One primitive: `apps/api/src/core/state_machine.py`

```python
@dataclass(frozen=True)
class Transition:
    event: str                 # "confirm", "withdraw"
    from_states: frozenset[str]
    to: str
    actor: Literal["entrant", "operator", "system", "bind"]
    guard: str | None = None   # name of a registered callable; None = no guard
    consequential: bool = True # False only for queue-position moves (I4)

@dataclass(frozen=True)
class Machine:
    name: str                  # "entry", "match"
    version: int               # 1 until GA
    states: frozenset[str]
    initial: frozenset[str]
    terminal: frozenset[str]
    transitions: tuple[Transition, ...]
```

`apply(machine, row, event, actor, *, guards: GuardRegistry, session)` looks up `(row.status, event)`, checks the actor matches, runs the named guard, sets the new state, and returns a `TransitionRecord` (for S-4). Refusals raise `TransitionError(code, message)`, which `LifecycleError` and the match `ConflictError` become subclasses of, so routes keep their existing `except` clauses. Guards are named strings, not callables, so the definition is pure data and exportable.

A module-level `REGISTRY: dict[str, Machine]` is what tests, the exporter, and the docs generator iterate.

*Accept:* module exists; property tests in S-6 pass against an empty registry.

### S-2 Port the four existing machines, behavior-preserving

- `operations/match_state.py`: `VALID_TRANSITIONS` becomes a derived view of a `MATCH` machine; `LOCKED_STATUSES` stays. Actor for all match events = `operator`. `FINISHED → PLAYING` keeps its comment as the transition's docstring.
- `solve_rail/solve_jobs.py`: `VALID_TRANSITIONS` derived from `SOLVE_JOB`; actors are `system` (worker) except `cancelled` = `operator`. Lease-reap re-entry `claimed/running → queued` is `consequential=False`.
- `workspaces/workspace_modules.py`: `_ALLOWED_TRANSITIONS` derived from `WORKSPACE_MODULE`; the two server rules become named guards (`display_has_operator`, `keeps_one_operational`).
- `entries/lifecycle.py`: constants stay; `withdraw`, `reject`, `promote`, `assert_confirmable`, `promote_verified_entries` become thin wrappers over `apply(ENTRY, ...)` with their guard bodies registered under names (`before_withdrawal_deadline`, `is_pending_exactly`). `LifecycleError` messages are unchanged.

*Accept:* `pytest tests/backend` green with zero test edits. That is the whole point: existing tests are the characterization.

### S-3 Define the five new machines

<!-- docs-paths-ignore-next-line: S-3 proposes creating competition/lifecycle.py; this is a planned file. -->
`entries/lifecycle.py` gains `PARTNER_INVITATION` and `SUBMISSION`. A new `apps/api/src/competition/lifecycle.py` gains `COMPETITION_EVENT`, `COMPETITION_UNIT`, `UNIT_MEMBERSHIP`, `DRAW_INSTANCE`. Definitions are the tables in `state-machines-read-and-plan.md` §2, transcribed; the cross-machine effects in §3 of that document become service functions in `competition/effects.py`, one per E-row, each a single session and no commit (matches the "nothing here commits" rule already in `lifecycle.py`).

*Accept:* every state in the schema plan's `CHECK` constraints appears in exactly one machine's `states`.

### S-4 Transition history table

One table, `state_transitions`, modeled on `tournament_authority_transitions`:

`id`, `tournament_id` (nullable for global subjects), `machine`, `machine_version`, `subject_type`, `subject_id`, `from_state`, `to_state`, `event`, `actor_type`, `actor_id` (nullable for `system`), `reason` (nullable), `detail` JSON, `occurred_at`. Index on `(subject_type, subject_id, occurred_at)`.

`apply()` returns the record; the caller's session adds it. Per-row timestamps (`confirmed_at`, `withdrawn_at`) stay as denormalized conveniences; the table is the audit source. The registration audit log proposed in the schema review is this table, not a second one.

*Accept:* every `apply()` in a request produces exactly one row; a test asserts row count equals transition count for the E-3 sequence.

### S-5 Export and single authority across tiers

- `tools/generate_state_machines.py` writes `packages/shared-contract/state-machines.json` (machines, states, transitions, actors, terminals; guards by name only) and `docs/reference/state-machines.md` (the tables, rendered).
- `package.json` gets `state-machines:check` (regenerate to a temp path, diff, fail on change), added to the CI Documentation job next to `brand:check`.
- `apps/console/src/modules/operations/runtime/runMachine.ts` imports `@scheduler/shared-contract/state-machines.json` for the match vocabulary and derives `RunStatus` from it. `done` is removed; `retired` reappears. This is the ADR 0029 fix for that surface.
- `shared/match_vocabulary.py` keeps the wire-spelling map (`started ↔ playing`) but reads its canonical set from `MATCH.states`.

*Accept:* CI check green; `runMachine.test.ts` updated to assert against the JSON, not literals; grep for `'done'` in `modules/operations` returns nothing.

### S-6 Structural and behavioral tests

`tests/backend/unit/test_state_machines.py`, parametrized over `REGISTRY`:

1. Every state is reachable from an initial state.
2. Every terminal state has zero outgoing transitions.
3. Every transition has an actor; no `(from, event)` pair appears twice.
4. Every `consequential=False` transition is in an explicit allow-list in the test file, so adding one is a reviewed edit (I4).
5. Every named guard resolves in the registry.

<!-- docs-paths-ignore-next-line: S-6 proposes creating test_lifecycle_effects.py; this is a planned file. -->
`tests/backend/test_lifecycle_effects.py`: one test per E-1…E-7, asserting the state of every touched table and the `state_transitions` row count. E-3 and E-6 first.

*Accept:* all pass; the allow-list contains exactly `entry.waitlist_at_cap`, `entry.verify`, `solve_job.reap`, `unit.member_withdrew`.

### S-7 Sequencing against the schema plan

S-1, S-2, S-5, S-6 (structural half) are independent of the schema and land first, on `main`, as one PR. S-3 and S-4 land with schema Phase 1 (the `state_transitions` and `partner_invitations` tables are one revision). Competition machines land with Phase 2; effects with Phase 3.

### S-8 Rulings (unchanged from v1)

1. Operator withdraw after `withdraws_until`: override or same deadline.
2. `awaiting_payment` gating confirm: no (today) or yes.
3. Submission `confirmed` state: dropped (recommended).
4. Post-draw member withdrawal: unit `withdrawn` + walkover (recommended).
5. Event `in_progress` by operator only, or by first result.

---

## 4. What this does not do

It does not adopt XState, `transitions`, or `python-statemachine`. The four existing machines are small, the actor and guard semantics are house-specific (I4, D7), and a library would add a second vocabulary for the thing ADR 0029 is trying to reduce to one. The primitive in S-1 is under 150 lines and is owned.
