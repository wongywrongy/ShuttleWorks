"""Tests targeting the interval-variable CP-SAT refactor.

These complement ``test_scheduler_core.py`` (outcome checks) and
``test_core_smoke.py`` (smoke) by exercising the specific constraint mechanisms
introduced in the refactor: availability via ``AddAllowedAssignments``,
per-court ``AddNoOverlap``, pin vs. lock, freeze horizon, and the standalone
``verify_schedule`` validator.
"""
import pytest

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
    SolverOptions,
    SolverStatus,
)
from scheduler_core.engine import CPSATBackend
from scheduler_core.engine.cpsat_backend import CPSATScheduler
from scheduler_core.engine.validation import (
    ScheduleValidationError,
    find_conflicts,
    verify_schedule,
)


def _request(config, players, matches, previous_assignments=None, time_limit=5.0):
    return ScheduleRequest(
        config=config,
        players=players,
        matches=matches,
        previous_assignments=previous_assignments or [],
        solver_options=SolverOptions(time_limit_seconds=time_limit),
    )


class TestAvailability:
    def test_availability_window_restricts_start(self):
        """A match's start must fit inside the intersection of availability windows."""
        config = ScheduleConfig(total_slots=10, court_count=2)
        players = [
            Player(id="p1", name="P1", availability=[(4, 10)]),
            Player(id="p2", name="P2", availability=[(0, 10)]),
        ]
        matches = [Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"], duration_slots=2)]
        result = CPSATBackend().solve(_request(config, players, matches))
        assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
        assert 4 <= result.assignments[0].slot_id <= 8

    def test_availability_intersection_across_players(self):
        """Only times inside every side-player's windows are allowed."""
        config = ScheduleConfig(total_slots=10, court_count=1)
        players = [
            Player(id="p1", name="P1", availability=[(0, 5)]),
            Player(id="p2", name="P2", availability=[(3, 10)]),
        ]
        matches = [Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"], duration_slots=2)]
        result = CPSATBackend().solve(_request(config, players, matches))
        assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
        # intersection is [3,5); with duration 2 → only start slot 3 fits
        assert result.assignments[0].slot_id == 3

    def test_availability_no_feasible_start_infeasible(self):
        config = ScheduleConfig(total_slots=10, court_count=2)
        players = [
            Player(id="p1", name="P1", availability=[(0, 2)]),
            Player(id="p2", name="P2", availability=[(5, 10)]),
        ]
        matches = [Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"], duration_slots=2)]
        result = CPSATBackend().solve(_request(config, players, matches))
        assert result.status == SolverStatus.INFEASIBLE


class TestBreakWindows:
    def test_match_avoids_break(self):
        """A match cannot start or run through a break window."""
        # 10 slots, break occupies [4, 6). Duration-2 match must start at 0,1,2 or 6,7,8.
        config = ScheduleConfig(total_slots=10, court_count=1, break_slots=[(4, 6)])
        players = [Player(id="p1", name="P1"), Player(id="p2", name="P2")]
        matches = [Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"], duration_slots=2)]
        result = CPSATBackend().solve(_request(config, players, matches))
        assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
        s = result.assignments[0].slot_id
        assert s + 2 <= 4 or s >= 6, f"match started at {s}, which overlaps break [4,6)"

    def test_break_with_no_player_availability(self):
        """Break alone (no player availability) still constrains starts."""
        # No availability data on players; break at [2, 4); duration-2 match.
        config = ScheduleConfig(total_slots=8, court_count=1, break_slots=[(2, 4)])
        players = [Player(id="p1", name="P1"), Player(id="p2", name="P2")]
        matches = [Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"], duration_slots=2)]
        result = CPSATBackend().solve(_request(config, players, matches))
        assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
        s = result.assignments[0].slot_id
        # Start 1 would run into break at slot 2; start 3 would overlap slot 3.
        assert s + 2 <= 2 or s >= 4, f"match started at {s}, which overlaps break [2,4)"

    def test_break_flagged_by_validator(self):
        """find_conflicts reports a 'break' conflict when an assignment overlaps a break."""
        cfg = ScheduleConfig(total_slots=10, court_count=2, break_slots=[(4, 6)])
        matches = {
            "m1": Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"], duration_slots=2),
        }
        # Start at 3, duration 2 → covers [3,5), overlaps break [4,6) at slot 4.
        bad = [Assignment(match_id="m1", slot_id=3, court_id=1, duration_slots=2)]
        conflicts = find_conflicts(
            config=cfg,
            players={"p1": Player(id="p1", name="P1"), "p2": Player(id="p2", name="P2")},
            matches=matches,
            assignments=bad,
        )
        assert any(c.type == "break" for c in conflicts)


class TestPinAndLock:
    def test_pinned_slot_only(self):
        config = ScheduleConfig(total_slots=10, court_count=3)
        players = [Player(id="p1", name="P1"), Player(id="p2", name="P2")]
        matches = [Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"])]
        previous = [PreviousAssignment(match_id="m1", slot_id=7, court_id=1, pinned_slot_id=7)]
        result = CPSATBackend().solve(_request(config, players, matches, previous))
        assert result.assignments[0].slot_id == 7
        # court is free to move
        assert 1 <= result.assignments[0].court_id <= 3

    def test_pinned_court_only(self):
        config = ScheduleConfig(total_slots=10, court_count=3)
        players = [Player(id="p1", name="P1"), Player(id="p2", name="P2")]
        matches = [Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"])]
        previous = [PreviousAssignment(match_id="m1", slot_id=0, court_id=2, pinned_court_id=2)]
        result = CPSATBackend().solve(_request(config, players, matches, previous))
        assert result.assignments[0].court_id == 2

    def test_locked_assignment_fully_fixed(self):
        config = ScheduleConfig(total_slots=10, court_count=3)
        players = [Player(id="p1", name="P1"), Player(id="p2", name="P2")]
        matches = [Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"])]
        previous = [PreviousAssignment(match_id="m1", slot_id=5, court_id=3, locked=True)]
        result = CPSATBackend().solve(_request(config, players, matches, previous))
        assert result.assignments[0].slot_id == 5
        assert result.assignments[0].court_id == 3

    def test_freeze_horizon_fixes_near_future(self):
        config = ScheduleConfig(
            total_slots=20,
            court_count=3,
            current_slot=0,
            freeze_horizon_slots=4,
        )
        players = [
            Player(id="p1", name="P1"),
            Player(id="p2", name="P2"),
            Player(id="p3", name="P3"),
            Player(id="p4", name="P4"),
        ]
        matches = [
            Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"]),
            Match(id="m2", event_code="MS2", side_a=["p3"], side_b=["p4"]),
        ]
        # m1 sits inside freeze horizon at slot 2, court 1 — must stay there.
        previous = [
            PreviousAssignment(match_id="m1", slot_id=2, court_id=1),
            PreviousAssignment(match_id="m2", slot_id=10, court_id=2),
        ]
        result = CPSATBackend().solve(_request(config, players, matches, previous))
        by_match = {a.match_id: a for a in result.assignments}
        assert by_match["m1"].slot_id == 2
        assert by_match["m1"].court_id == 1


class TestVerifySchedule:
    def _cfg(self):
        return ScheduleConfig(total_slots=10, court_count=2)

    def _match(self, id_, side_a, side_b, d=1):
        return Match(id=id_, event_code=f"EV-{id_}", duration_slots=d, side_a=side_a, side_b=side_b)

    def test_accepts_valid_schedule(self):
        cfg = self._cfg()
        matches = [self._match("m1", ["p1"], ["p2"]), self._match("m2", ["p3"], ["p4"])]
        assignments = [
            Assignment(match_id="m1", slot_id=0, court_id=1, duration_slots=1),
            Assignment(match_id="m2", slot_id=0, court_id=2, duration_slots=1),
        ]
        verify_schedule(
            config=cfg,
            players={f"p{i}": Player(id=f"p{i}", name=f"P{i}") for i in range(1, 5)},
            matches={m.id: m for m in matches},
            assignments=assignments,
        )

    def test_flags_court_conflict(self):
        cfg = self._cfg()
        matches = [self._match("m1", ["p1"], ["p2"]), self._match("m2", ["p3"], ["p4"])]
        bad = [
            Assignment(match_id="m1", slot_id=0, court_id=1, duration_slots=1),
            Assignment(match_id="m2", slot_id=0, court_id=1, duration_slots=1),
        ]
        conflicts = find_conflicts(
            config=cfg,
            players={f"p{i}": Player(id=f"p{i}", name=f"P{i}") for i in range(1, 5)},
            matches={m.id: m for m in matches},
            assignments=bad,
        )
        assert any(c.type == "court_conflict" for c in conflicts)

    def test_flags_player_overlap(self):
        cfg = self._cfg()
        matches = [self._match("m1", ["p1"], ["p2"]), self._match("m2", ["p1"], ["p3"])]
        bad = [
            Assignment(match_id="m1", slot_id=0, court_id=1, duration_slots=1),
            Assignment(match_id="m2", slot_id=0, court_id=2, duration_slots=1),
        ]
        conflicts = find_conflicts(
            config=cfg,
            players={f"p{i}": Player(id=f"p{i}", name=f"P{i}") for i in range(1, 4)},
            matches={m.id: m for m in matches},
            assignments=bad,
        )
        assert any(c.type == "player_overlap" and c.player_id == "p1" for c in conflicts)

    def test_flags_availability_breach(self):
        cfg = self._cfg()
        matches = [self._match("m1", ["p1"], ["p2"])]
        bad = [Assignment(match_id="m1", slot_id=8, court_id=1, duration_slots=1)]
        conflicts = find_conflicts(
            config=cfg,
            players={
                "p1": Player(id="p1", name="P1", availability=[(0, 5)]),
                "p2": Player(id="p2", name="P2"),
            },
            matches={m.id: m for m in matches},
            assignments=bad,
        )
        assert any(c.type == "availability" for c in conflicts)

    def test_raises_on_solved_result(self):
        """Solver output must pass the validator (solver correctness regression guard)."""
        cfg = ScheduleConfig(total_slots=8, court_count=2)
        players = [Player(id=f"p{i}", name=f"P{i}") for i in range(1, 5)]
        matches = [
            Match(id="m1", event_code="MS1", duration_slots=2, side_a=["p1"], side_b=["p2"]),
            Match(id="m2", event_code="MS2", duration_slots=2, side_a=["p3"], side_b=["p4"]),
            Match(id="m3", event_code="MS3", duration_slots=2, side_a=["p1"], side_b=["p3"]),
        ]
        result = CPSATBackend().solve(_request(cfg, players, matches))
        verify_schedule(
            config=cfg,
            players={p.id: p for p in players},
            matches={m.id: m for m in matches},
            assignments=result.assignments,
        )


class TestModelSize:
    """Regression guard: interval model should be dramatically smaller than legacy."""

    def test_boolean_var_reduction(self):
        """For a 14-match × 8-slot × 4-court tournament the interval model uses far fewer bools.

        Legacy: O(matches * slots * courts) ≈ 14 × 16 × 4 = 896 per-match bools.
        Interval: O(matches * courts) ≈ 14 × 4 = 56 per-match bools (is_on_court).
        We assert the interval count is at most 20 % of legacy.
        """
        cfg = ScheduleConfig(total_slots=16, court_count=4)
        players = [Player(id=f"p{i}", name=f"P{i}") for i in range(1, 21)]
        matches = []
        # 14 matches, no shared players (to avoid adding rest constraints that could
        # inflate variables asymmetrically).
        for i in range(14):
            matches.append(
                Match(
                    id=f"m{i}",
                    event_code=f"E{i}",
                    duration_slots=2,
                    side_a=[f"p{2 * i + 1}"],
                    side_b=[f"p{2 * i + 2}" if 2 * i + 2 <= 20 else "p1"],
                )
            )

        scheduler = CPSATScheduler(config=cfg)
        scheduler.add_players(players)
        scheduler.add_matches(matches)
        scheduler.build()

        interval_bools = len(scheduler.svars.is_on_court)  # per-match × per-court
        legacy_estimate = len(matches) * (cfg.total_slots - 1) * cfg.court_count
        assert interval_bools <= legacy_estimate * 0.2, (
            f"interval_bools={interval_bools} legacy_estimate={legacy_estimate}"
        )


class TestProgressCallback:
    def test_callback_receives_assignments(self):
        """ProgressCallback extracts current assignments from interval vars on each solution."""
        cfg = ScheduleConfig(total_slots=8, court_count=2)
        players = [Player(id=f"p{i}", name=f"P{i}") for i in range(1, 5)]
        matches = [
            Match(id="m1", event_code="MS1", side_a=["p1"], side_b=["p2"]),
            Match(id="m2", event_code="MS2", side_a=["p3"], side_b=["p4"]),
        ]
        progress_events = []

        def cb(event):
            progress_events.append(event)

        scheduler = CPSATScheduler(config=cfg, solver_options=SolverOptions(time_limit_seconds=5.0))
        scheduler.add_players(players)
        scheduler.add_matches(matches)
        scheduler.build()
        scheduler.solve(progress_callback=cb)

        assert progress_events, "expected at least one solution callback"
        first = progress_events[0]
        assert "current_assignments" in first
        assert len(first["current_assignments"]) == 2
        for assn in first["current_assignments"]:
            assert set(assn.keys()) == {"matchId", "slotId", "courtId", "durationSlots"}


class TestSolverDeterminism:
    """Seeding + single worker must produce byte-identical schedules."""

    def test_same_inputs_produce_identical_assignments(self):
        cfg = ScheduleConfig(total_slots=8, court_count=2)
        players = [
            Player(id=f"p{i}", name=f"P{i}") for i in range(1, 9)
        ]
        matches = [
            Match(id=f"m{i}", event_code=f"E{i}", duration_slots=1,
                  side_a=[f"p{2*i-1}"], side_b=[f"p{2*i}"])
            for i in range(1, 5)
        ]

        def run_once():
            scheduler = CPSATScheduler(
                config=cfg,
                solver_options=SolverOptions(
                    time_limit_seconds=5.0,
                    num_workers=1,
                    random_seed=42,
                ),
            )
            scheduler.add_players(players)
            scheduler.add_matches(matches)
            scheduler.build()
            r = scheduler.solve()
            return sorted(
                (a.match_id, a.slot_id, a.court_id) for a in r.assignments
            )

        assert run_once() == run_once()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
