"""SP-COURT-1 Phase 2 — the queue encoding: pool plan, colouring, determinism,
lock/pin survival, and the CP8-v1 closed-window fallback."""
import pytest

from scheduler_core.domain.models import (
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
    SolverStatus,
)
from scheduler_core.engine.court_pool import colour_left_edge, plan_pool, sort_key
from scheduler_core.schedule import schedule


def _queue_cfg(**kw) -> ScheduleConfig:
    return ScheduleConfig(total_slots=8, court_count=4, court_policy="queue", **kw)


def test_plan_pool_is_empty_under_pinned_policy():
    plan = plan_pool(ScheduleConfig(total_slots=8, court_count=4), {}, {}, set())
    assert plan.policy == "pinned"
    assert plan.pool_courts == []
    assert plan.pooled == set()


def test_plan_pool_respects_the_per_court_override():
    matches = {"m1": Match(id="m1", event_code="E", side_a=["a"], side_b=["b"])}
    plan = plan_pool(_queue_cfg(court_overrides={1: "pinned"}), matches, {}, set())
    assert plan.pool_courts == [2, 3, 4]


def test_closed_windows_force_pinned_v1():
    plan = plan_pool(_queue_cfg(closed_court_windows=[(1, 0, 3)]), {}, {}, set())
    assert plan.policy == "pinned"
    # legacy all-day closures trigger it too
    plan = plan_pool(_queue_cfg(closed_court_ids=[2]), {}, {}, set())
    assert plan.policy == "pinned"


def test_a_lock_on_a_POOL_court_forces_pinned():
    """Soundness, not convenience: a forced court inside the pool can make the
    cumulative admit a solution no colouring can realise (two reserved windows
    on two courts, one long pool match fitting neither). v1 steps aside."""
    matches = {"m1": Match(id="m1", event_code="E", side_a=["a"], side_b=["b"])}
    prev = {"m1": PreviousAssignment(match_id="m1", slot_id=0, court_id=2, locked=True)}
    plan = plan_pool(_queue_cfg(), matches, prev, {"m1"})
    assert plan.policy == "pinned"


def test_a_lock_on_a_PINNED_OVERRIDE_court_keeps_queue_mode():
    """The real-world hybrid: the final is locked to show-court 1 (pinned by
    override); the body of the draw still queues on courts 2-4."""
    matches = {
        "m1": Match(id="m1", event_code="E", side_a=["a"], side_b=["b"]),
        "m2": Match(id="m2", event_code="E", side_a=["c"], side_b=["d"]),
    }
    prev = {"m1": PreviousAssignment(match_id="m1", slot_id=0, court_id=1, locked=True)}
    plan = plan_pool(_queue_cfg(court_overrides={1: "pinned"}), matches, prev, {"m1"})
    assert plan.policy == "queue"
    assert plan.pool_courts == [2, 3, 4]
    assert plan.pooled == {"m2"}          # the locked match keeps its court vars


def test_colouring_produces_a_legal_timetable():
    order = [(0, 2, "m1"), (0, 2, "m2"), (0, 2, "m3")]
    colours = colour_left_edge(order, [1, 2, 3])
    assert sorted(colours.values()) == [1, 2, 3]


def test_colouring_reuses_a_court_once_it_frees():
    assert colour_left_edge([(0, 2, "m1"), (2, 2, "m2")], [1, 2]) == {"m1": 1, "m2": 1}


def test_NEGATIVE_CONTROL_colouring_refuses_when_overlap_exceeds_courts():
    """The safety property, proven by making it fail (CODE_HEALTH 3b). If the
    cumulative is ever dropped or mis-capacitied, this is what stops a
    physically impossible timetable reaching the floor."""
    with pytest.raises(ValueError, match="courts"):
        colour_left_edge([(0, 2, "m1"), (0, 2, "m2"), (0, 2, "m3")], [1, 2])


def _big_request(court_policy="queue", n=6, courts=3, **cfg_kw) -> ScheduleRequest:
    cfg = ScheduleConfig(
        total_slots=12,
        court_count=courts,
        interval_minutes=30,
        court_policy=court_policy,
        **cfg_kw,
    )
    players = [Player(id=f"p{i}", name=f"p{i}") for i in range(2 * n)]
    matches = [
        Match(id=f"m{i}", event_code="E", side_a=[f"p{2 * i}"], side_b=[f"p{2 * i + 1}"])
        for i in range(n)
    ]
    return ScheduleRequest(config=cfg, players=players, matches=matches)


def _span(result) -> int:
    return max(a.slot_id + a.duration_slots for a in result.assignments)


def test_queue_mode_solves_and_every_assignment_still_carries_a_court():
    result = schedule(_big_request())
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert result.effective_policy == "queue"
    assert len(result.assignments) == 6
    for a in result.assignments:
        assert 1 <= a.court_id <= 3        # the wire contract does not change shape
    # and the coloured timetable is legal: no two matches share a court-slot
    for a in result.assignments:
        for b in result.assignments:
            if a.match_id != b.match_id and a.court_id == b.court_id:
                assert (
                    a.slot_id + a.duration_slots <= b.slot_id
                    or b.slot_id + b.duration_slots <= a.slot_id
                )


def test_queue_and_pinned_reach_the_same_makespan():
    """The equal-objective property: pooling changes the encoding, not the answer."""
    assert _span(schedule(_big_request("queue"))) == _span(schedule(_big_request("pinned")))


def test_queue_order_is_stable_across_identical_solves():
    a = schedule(_big_request())
    b = schedule(_big_request())
    assert [(x.match_id, x.slot_id, x.court_id) for x in a.assignments] == [
        (x.match_id, x.slot_id, x.court_id) for x in b.assignments
    ]


def test_queue_order_does_not_depend_on_input_order():
    """Permuting the input must not permute the day. Without a stable
    tiebreaker the colouring sweep would follow dict order, so the same
    tournament entered in a different order would call matches to different
    courts — a difference the desk would see and could not explain."""
    forward = _big_request()
    permuted = _big_request()
    permuted.matches = list(reversed(permuted.matches))
    a = {x.match_id: (x.slot_id, x.court_id) for x in schedule(forward).assignments}
    b = {x.match_id: (x.slot_id, x.court_id) for x in schedule(permuted).assignments}
    assert a == b


def test_sort_key_is_the_one_definition_of_queue_order():
    assert sort_key(3, "b") < sort_key(3, "c") < sort_key(4, "a")


def test_closed_windows_solve_falls_back_and_says_so():
    """CP8-v1: correctness beats the feature; the hybrid arrives in Phase 5."""
    result = schedule(_big_request(closed_court_windows=[(1, 0, 6)]))
    assert result.effective_policy == "pinned"
    for a in result.assignments:           # the fallback is real, not cosmetic
        if a.court_id == 1:
            assert a.slot_id >= 6


def test_NEGATIVE_CONTROL_queue_without_closed_windows_stays_queue():
    assert schedule(_big_request()).effective_policy == "queue"


def test_court_change_penalty_is_a_no_op_for_pooled_matches():
    """A re-solve with previous assignments must not crash or score courts.
    'Which court did it move to' is a meaningless question about a match the
    model never assigned a court to — the colouring answers that afterwards."""
    req = _big_request()
    req.previous_assignments = [
        PreviousAssignment(match_id="m0", slot_id=0, court_id=1),
        PreviousAssignment(match_id="m1", slot_id=1, court_id=2),
    ]
    result = schedule(req)                 # KeyError before the guard
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert result.effective_policy == "queue"


def test_a_LOCKED_match_keeps_its_exact_court_in_queue_mode():
    """A pin is a promise — queue mode must not relocate it (spec 7)."""
    req = _big_request(court_overrides={1: "pinned"})
    req.previous_assignments = [
        PreviousAssignment(match_id="m0", slot_id=2, court_id=1, locked=True),
    ]
    result = schedule(req)
    assert result.effective_policy == "queue"
    m0 = next(a for a in result.assignments if a.match_id == "m0")
    assert (m0.slot_id, m0.court_id) == (2, 1)
    # and no pooled match was coloured onto the pinned court
    for a in result.assignments:
        if a.match_id != "m0":
            assert a.court_id != 1


def test_a_recoloured_pooled_match_is_not_MOVED():
    """The spurious `(moved)` tag, killed at the root (SP-COURT-1 Phase 4).

    A pooled match's court is colouring, not a promise — a re-solve that
    keeps its TIME but recolours its court did not move anything the desk
    was told. Feed the previous assignments back with every court shifted:
    the times re-solve identically (disruption penalty + same instance), so
    every `moved` flag would come from the court diff alone."""
    first = schedule(_big_request())
    assert first.effective_policy == "queue"

    rerun = _big_request()
    rerun.previous_assignments = [
        PreviousAssignment(
            match_id=a.match_id,
            slot_id=a.slot_id,
            # a court the colouring cannot possibly agree with everywhere
            court_id=(a.court_id % 3) + 1,
        )
        for a in first.assignments
    ]
    second = schedule(rerun)
    same_slot = {a.match_id: a.slot_id for a in second.assignments} == {
        a.match_id: a.slot_id for a in first.assignments
    }
    assert same_slot, "precondition: times must re-solve identically"
    assert second.moved_count == 0
