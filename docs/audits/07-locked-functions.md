# 07 — Locked Functions: Cover-and-Modify (SP-REFACTOR Phase 7)

Worked example of the `CODE_HEALTH.md` **Part 2** sequence (measure →
understand → cover → seam → decompose) applied to the two functions the Phase-5
measurement pass flagged as *locked* — high complexity **and** low coverage.

- **Scope:** exactly two functions —
  `scheduler_core/engine/backends.py :: GreedyBackend.solve` and
  `scheduler_core/engine/bridge.py :: SchedulingProblemBuilder.build`.
- **Prerequisite:** codanna authenticated (used for the call-graph tracing below).
- **ABSOLUTE RULE:** do not modify or regress behavior. This doc + the
  characterization tests are the *cover* half; any *modify* is gated on the
  Step-3→4 checkpoint (see §5).

---

## 1. Measure (CODE_HEALTH #10)

**Cyclomatic complexity** (`radon cc … -s`, repo `.venv`, 2026-07-01) — no drift
since the Phase-5 snapshot:

| Symbol | Rank |
| --- | --- |
| `GreedyBackend` (class) | **E (38)** |
| `GreedyBackend.solve` | **E (37)** |
| `SchedulingProblemBuilder` (class) | **C (20)** |
| `SchedulingProblemBuilder.build` | **C (19)** |
| (context) `bridge.py` helpers `_participant_ids_from_units` / `_participant_to_player` / `_expand_to_match_ids` | B (8/7/7) |
| (context) `live_ops.py :: reschedule` | B (7) |

**Coverage** (`pytest --cov=scheduler_core`, package form — the module-path form
`--cov=scheduler_core.engine.backends` trips a numpy "cannot load module more
than once per process" re-import under the tests' `sys.path` shadow-package
dance, so use the package form):

| File | Stmts | Miss | Cover | Missing ranges |
| --- | --- | --- | --- | --- |
| `scheduler_core/engine/backends.py` | 115 | 93 | **19%** | `57`, `68–187` (all of `GreedyBackend.solve` + `_player_ids`) |
| `scheduler_core/engine/bridge.py` | 81 | 66 | **19%** | `40–53`, `61–69`, `82–93`, `111–190` (all of `build` + its three helpers) |

Both target methods are **0% covered** — the 19% is only the module import +
dataclass/`BridgeOptions` definitions. Confirmed by grep: **no test file**
references `GreedyBackend`, `SchedulingProblemBuilder`, `backends`, `bridge`,
`reschedule`, or `live_ops` (the one substring hit,
`test_proposal_pipeline_integration.py`, is a *test name* — "reschedules" — on
the warm-restart HTTP path, not the engine).

### Call graph / blast radius (codanna `analyze_impact` + grep)

| Function | In-repo callers | Notes |
| --- | --- | --- |
| `GreedyBackend.solve` | **none** (`analyze_impact` → "symbol appears isolated") | Re-exported by `scheduler_core/engine/__init__.py` + `scheduler_core/__init__.py`; named only in docs (`scheduler_core/README.md`, `docs/how-to/build-on-the-engine.md`) + the frozen `archive/`. It is a *pluggable alternative* backend a consumer could pass to `reschedule(backend=…)` — nothing in this repo does. The production entry `scheduler_core/schedule.py` hard-wires `CPSATBackend`. |
| `SchedulingProblemBuilder.build` | **1**: `scheduler_core/engine/live_ops.py :: reschedule` (`bridge.py:99` called at `live_ops.py:98`) | `reschedule` itself has **no in-repo production caller** — only `examples/badminton_event_setup.py` (which calls `.build()` directly) and the frozen `archive/USAGE.md`. |

**Reframing finding (corrects the debt-log).** The debt-log claims a safety net
in `build` "guards every schedule build." That is **wrong**: neither production
schedule path goes through the bridge. `POST /schedule` constructs its
`ScheduleRequest(...)` directly (`products/scheduler/backend/api/schedule.py:111`)
using `build_schedule_config` for the config; the Bracket path likewise builds
`ScheduleRequest(...)` directly (`services/bracket/adapter.py:89`). The bridge is
a **library convenience** for the (currently in-repo-unused) live-ops reschedule
loop and the example. The debt-log entry is corrected in the same change as this
doc.

**Priority consequence.** Both functions are **public library surface that is
internally unused** — *not* deletable dead code (they are exported API with docs
+ an example), and *not* hot-path production code. Per the debt-log open
question, `GreedyBackend` is confirmed a **fallback/alternative**, not a live
path. This lowers the *value* of decomposing them (few callers would notice a
regression) while also lowering the *risk* — see §5.

---

## 2. Understand before covering (CODE_HEALTH #11, descriptive only)

No judgement of correct-vs-buggy here except where explicitly flagged; this
freezes *what happens today*.

### 2a. `GreedyBackend.solve(request) -> ScheduleResult`

First-feasible greedy placement. **Inputs used:** `config.total_slots` (T),
`config.court_count` (C), `config.current_slot`, `config.freeze_horizon_slots`;
`request.matches`, `request.players`, `request.previous_assignments`. **Ignores**
`request.solver_options` and `request.locked_assignments`. **Side effects:** none
external — mutates only local dicts; a pure, deterministic function of `request`
(iterates `request.matches` in list order; dict insertion order is stable → no
seed concern, unlike CP-SAT).

Flow:
1. `freeze_until = current_slot + freeze_horizon_slots`.
2. `locked` = every `previous_assignment` with `locked=True`, **plus** every
   `previous_assignment` with `slot_id < freeze_until and not locked`
   (freeze-implied lock).
3. **Loop 1 — pin locked/frozen:** for each match in `locked` that has a prev,
   place it at `(prev.slot_id, prev.court_id)` **iff** `prev.slot_id + duration ≤ T`,
   with `moved=False`. **No feasibility check** — a locked placement can collide
   with another locked placement (the occupancy map is overwritten; both still
   appear in the result). A locked match whose prev does *not* fit (`> T`) is left
   unplaced and falls through to Loop 2.
4. **Loop 2 — greedy fill:** for each not-yet-placed match, scan `t ∈ [0, T−d]`
   then `c ∈ [1, C]`, take the first `feasible` cell. `feasible` = fits within T,
   no court-slot collision, and for every player: not `player_busy` **and**
   `available`. `moved` / `moved_count` reflect a change from `prev` (Loop-2 only).
5. **Emit:** `assignments` follow `request.matches` order; `unscheduled` = anything
   unplaced; `status = FEASIBLE` if all placed else `INFEASIBLE` (+ one
   `infeasible_reasons` string); `locked_count = len(locked)`; `runtime_ms = 0.0`;
   `soft_violations = []`.

`available(pid, slot, d)` returns True if the player is missing or has no
availability, else True iff **one single** availability window fully covers
`[slot, slot+d)` — a match spanning two adjacent windows reads as unavailable
(pinned by test).

### 2b. `SchedulingProblemBuilder.build(state, ready_unit_ids, config, options) -> ScheduleRequest`

DTO/state → engine-request bridge. **Side effects:** none — constructs new
objects; a pure function of its args (reads `state` dicts).

Flow:
1. `unit_ids = _expand_to_match_ids(...)`: a `TIE` unit with `child_unit_ids`
   expands to its existing children; every other kind maps to itself; missing
   units are dropped.
2. **Truncate:** if `max_units is not None and >= 0`, `unit_ids = unit_ids[:max_units]`
   (so `max_units=0` → empty). Applied **after** expansion.
3. **Freeze/current-slot override** (if either given): rebuild `ScheduleConfig`
   from a **hand-listed** field set. ⚠️ **Latent bug** — see §4.
4. **Rolling-horizon shrink** (if `rolling_horizon_slots > 0` and
   `current_slot + rolling < total_slots`): rebuild config with
   `total_slots = current_slot + rolling` — **same hand-listed copy, same drop.**
5. `players` = `_participant_to_player` for each `sorted(pid)` in the units'
   sides, **including team `member_ids`** (`_participant_ids_from_units`).
   Availability comes from `participant.metadata["availability"]` (only 2-element
   list/tuple entries, coerced to tuples); `rest_slots` from
   `metadata["rest_slots"]` (default 1); a missing participant →
   `Player(id=pid, name=pid, availability=[], rest_slots=1)`.
6. `matches` = one `Match` per unit (`event_code = unit.event_id`,
   `duration_slots = unit.expected_duration_slots`, sides copied).
7. `previous_assignments` = one `PreviousAssignment` per `state.assignments`
   entry whose unit is in the (possibly truncated) `unit_id_set`.

---

## 3. Cover (CODE_HEALTH #11)

Characterization/golden-master tests committed **before any structural edit**:

- `products/scheduler/tests/test_backends_greedy_characterization.py`
- `products/scheduler/tests/test_bridge_build_characterization.py`

Coverage delta and the exact behaviors pinned are recorded in §6 after the tests
land. These freeze current behavior (bugs included) as a tripwire; they are
scaffolding (Feathers), expected to be rewritten if/when the functions are
decomposed.

---

## 4. Latent bug pinned (not fixed here) — `build` config field-drop

Steps 3 and 4 of `build` rebuild `ScheduleConfig` by **hand-listing** fields to
copy (`bridge.py:119–131` and `:136–148`). Both omit the newer fields:
`enable_court_utilization`, `court_utilization_penalty`, the game-proximity
knobs, the compact-schedule knobs, `allow_player_overlap`,
`player_overlap_penalty`, `break_slots`, `closed_court_windows`,
`closed_court_ids`. So **any** freeze/current-slot override or rolling-horizon
shrink silently **resets those fields to dataclass defaults**.

This is the *exact* class of bug `live_ops.handle_court_outage` was fixed for by
switching to `dataclasses.replace` (see its docstring, `live_ops.py:127`).

**Handling (per the STOP condition + advisor):** this is a real latent bug but is
**not** currently relied upon (no in-repo caller exercises the override path with
those fields set). Per `CODE_HEALTH.md` Part 2 and the phase STOP rule, we do
**not** fix it here. Instead:
- The characterization test **asserts the drop explicitly** (after a
  freeze/current-slot override, the newer fields come back as defaults), with a
  comment pointing at the debt-log entry — so if Kyle later fixes it with
  `dataclasses.replace`, the test fails **loudly and self-documents** rather than
  breaking silently.
- Logged in `docs/audits/debt-log.md` for Kyle's decision (fix vs. formalize).

---

## 5. Seam + decompose — routed to the Step-3→4 checkpoint

**Seam finding (CODE_HEALTH #12):** neither function is locked by *coupling*.
Both are **pure functions of their arguments** — no DB, no shared/global store,
no `matchStateStore`-style state reads, no inline instantiation of external
dependencies. They are locked by **complexity + zero tests**, and the
**characterization tests (§3), not a DI seam, are the safety mechanism.** Forcing
parameter-injection here would invent coupling that does not exist. For a
pure-but-tangled function, the seam and the decomposition are the *same act*: an
extracted, independently-callable sub-function
(`_compute_locked_set` / `_place_greedily` / `_build_result`;
`_derive_config` / `_build_players`) *is* the seam.

**Decomposition recommendation: HOLD (decompose-when-touched).** Because both
functions have **zero in-repo production callers** (§1), decomposition is
low-risk but also **low-value**, and `build`'s decomposition is entangled with
the field-drop bug (§4) — an extracted `_derive_config` helper would exist only
to reproduce a deliberately-wrong hand-copy, which is ugly and fix-tempting. This
matches the program's own value-proportional ethos (`CODE_HEALTH.md` #2/#13:
Boy-Scout-when-touched, don't force open-ended work). The **coverage already
achieves the risk-reduction goal** — these are no longer "locked."

This defers from the literal Phase-7 Done condition (which wants the complexity
score dropped), so it is surfaced explicitly at the checkpoint rather than
silently under-delivered *or* silently ground through. Reversible autonomous
default if the decision can't be reached: **coverage in, decomposition deferred +
logged** — nothing is lost, since the tests are the prerequisite for any future
decomposition.

---

## 6. Re-measure — coverage delivered (Step 3 done, `caf5275`)

**28 characterization tests** (commit `caf5275`, test-only — zero non-test files):

| File | Before | After | Still-missing lines |
| --- | --- | --- | --- |
| `scheduler_core/engine/backends.py` | 19% | **97%** | `117`, `132`, `154` |
| `scheduler_core/engine/bridge.py` | 19% | **96%** | `44`, `157`, `178` |

All 6 remaining lines are **defensive branches the loop bounds already guarantee
unreachable** (a match/unit lookup that cannot miss because the id set is derived
from the same collection; a `slot+d > T` guard the greedy loop's own range makes
impossible). Reaching them would require constructing states the callers cannot
produce — not worth contorting tests for; 96–97% with only defensive branches
open is well past the "trust a change not to break something" bar.

**Behaviors pinned (bugs/quirks included):**
- `GreedyBackend.solve`: first-cell placement; shared-player non-overlap;
  one-court serialization; multi-slot consecutive occupancy; locked-prev pinning
  (`moved=False`); **freeze-horizon implicit locking** of near-term non-locked
  prevs; prev outside the horizon re-placed + counted `moved`; prev at same cell
  not counted moved; **locked placements skip feasibility → two locks can overlap
  the same cell**; locked-prev that overflows `T` falls through to greedy;
  **availability satisfied only by a single covering window** (no straddling);
  unschedulable → `INFEASIBLE` + reason; `_player_ids` union.
- `SchedulingProblemBuilder.build`: unit→match / participant→sorted-player
  mapping; TIE→children expansion (and TIE-without-children → itself; missing
  unit dropped); `max_units` truncation after expansion (`0` → empty);
  **config field-drop on freeze/current-slot override AND rolling-horizon shrink
  (latent bug, §4 — asserted explicitly)**; rolling-no-shrink passthrough; team
  `member_ids` expansion; availability/rest metadata parsing (+ malformed-entry
  filtering + missing-participant default); empty/`None` side (bye) handling;
  in-scope-only previous_assignments; end-to-end bridge→CP-SAT solve.

**Gate:** full backend suite **618 passed** (590 baseline + 28) in 92s; ruff-F
clean on both new files.

**Verdict:** both functions are **no longer "locked"** — the highest-risk
category (high complexity **and** ~0% coverage) no longer applies; they are now
high-complexity-**but-covered**, i.e. decompose-*when-touched*, per the debt-log's
own second table. The remaining Part-2 steps (seam/decompose) are routed to the
checkpoint in §5.
