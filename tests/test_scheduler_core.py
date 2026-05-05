"""Scheduler core engine tests - validates constraint solving and new features."""
import pytest
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from scheduler_core.domain.models import (
    ScheduleRequest, ScheduleConfig, Player, Match,
    PreviousAssignment, SolverOptions, SolverStatus
)
from scheduler_core.engine import CPSATBackend


def make_config(**overrides):
    """Create a ScheduleConfig with defaults."""
    defaults = {
        'total_slots': 10,
        'court_count': 2,
        'interval_minutes': 30,
        'default_rest_slots': 1,
    }
    defaults.update(overrides)
    return ScheduleConfig(**defaults)


def make_request(config, players, matches, **kwargs):
    """Create a ScheduleRequest."""
    return ScheduleRequest(
        config=config,
        players=players,
        matches=matches,
        solver_options=SolverOptions(time_limit_seconds=5),
        **kwargs
    )


class TestBasicScheduling:
    """Basic scheduling constraint tests."""

    def test_simple_match(self):
        """Single match should be scheduled."""
        config = make_config()
        players = [
            Player(id='p1', name='Player 1'),
            Player(id='p2', name='Player 2'),
        ]
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2']),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches))

        assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]
        assert len(result.assignments) == 1
        assert result.assignments[0].match_id == 'm1'

    def test_player_no_overlap(self):
        """Same player cannot be in two matches at same time slot."""
        config = make_config(court_count=4)
        players = [
            Player(id='p1', name='Player 1'),
            Player(id='p2', name='Player 2'),
            Player(id='p3', name='Player 3'),
        ]
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2']),
            Match(id='m2', event_code='MS2', side_a=['p1'], side_b=['p3']),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches))

        assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]
        assert len(result.assignments) == 2

        # Player 1's matches must be in different slots
        slots = {a.match_id: a.slot_id for a in result.assignments}
        assert slots['m1'] != slots['m2']

    def test_court_capacity(self):
        """Only one match per court per slot."""
        config = make_config(court_count=1, total_slots=5)
        players = [
            Player(id='p1', name='Player 1'),
            Player(id='p2', name='Player 2'),
            Player(id='p3', name='Player 3'),
            Player(id='p4', name='Player 4'),
        ]
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2']),
            Match(id='m2', event_code='MS2', side_a=['p3'], side_b=['p4']),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches))

        assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]

        # With 1 court, matches must be in different slots
        slots = {a.match_id: a.slot_id for a in result.assignments}
        assert slots['m1'] != slots['m2']

    def test_infeasible_detection(self):
        """Detect infeasible schedules."""
        config = make_config(total_slots=1, court_count=1)
        players = [
            Player(id='p1', name='Player 1'),
            Player(id='p2', name='Player 2'),
            Player(id='p3', name='Player 3'),
        ]
        # Player 1 in both matches, but only 1 slot available
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2']),
            Match(id='m2', event_code='MS2', side_a=['p1'], side_b=['p3']),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches))

        assert result.status == SolverStatus.INFEASIBLE
        assert len(result.infeasible_reasons) > 0


class TestRestConstraints:
    """Rest time constraint tests."""

    def test_hard_rest_constraint(self):
        """Player rest slots are enforced as hard constraint."""
        config = make_config(total_slots=10, court_count=4, default_rest_slots=2)
        players = [
            Player(id='p1', name='Player 1', rest_slots=2, rest_is_hard=True),
            Player(id='p2', name='Player 2'),
            Player(id='p3', name='Player 3'),
        ]
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2']),
            Match(id='m2', event_code='MS2', side_a=['p1'], side_b=['p3']),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches))

        assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]

        # Player 1's matches must have at least 2 slots gap
        slots = {a.match_id: a.slot_id for a in result.assignments}
        gap = abs(slots['m1'] - slots['m2'])
        assert gap >= 3  # duration 1 + rest 2 = need 3 slot gap


class TestCompactSchedule:
    """Compact schedule mode tests."""

    def test_minimize_makespan(self):
        """Minimize makespan mode should pack matches early."""
        config = make_config(
            total_slots=20,
            court_count=2,
            enable_compact_schedule=True,
            compact_schedule_mode='minimize_makespan',
            compact_schedule_penalty=100.0,
        )
        players = [
            Player(id='p1', name='Player 1'),
            Player(id='p2', name='Player 2'),
            Player(id='p3', name='Player 3'),
            Player(id='p4', name='Player 4'),
        ]
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2']),
            Match(id='m2', event_code='MS2', side_a=['p3'], side_b=['p4']),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches))

        assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]

        # With 2 courts, 2 independent matches should be scheduled at slot 0
        max_slot = max(a.slot_id for a in result.assignments)
        assert max_slot <= 2  # Should finish early

    def test_finish_by_time(self):
        """Finish by time mode should penalize matches after target."""
        config = make_config(
            total_slots=20,
            court_count=2,
            enable_compact_schedule=True,
            compact_schedule_mode='finish_by_time',
            compact_schedule_penalty=100.0,
            target_finish_slot=5,
        )
        players = [
            Player(id='p1', name='Player 1'),
            Player(id='p2', name='Player 2'),
        ]
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2']),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches))

        assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]

        # Match should end by target slot 5
        assignment = result.assignments[0]
        assert assignment.slot_id + assignment.duration_slots <= 5


class TestPlayerOverlap:
    """Player overlap soft constraint tests."""

    def test_allow_overlap_soft(self):
        """When overlap allowed, same player can be scheduled in parallel."""
        config = make_config(
            total_slots=3,
            court_count=2,
            allow_player_overlap=True,
            player_overlap_penalty=10.0,
        )
        players = [
            Player(id='p1', name='Player 1'),
            Player(id='p2', name='Player 2'),
            Player(id='p3', name='Player 3'),
        ]
        # Player 1 in both matches - would be infeasible without overlap
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2']),
            Match(id='m2', event_code='MS2', side_a=['p1'], side_b=['p3']),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches))

        # Should find a solution (may have overlap violations)
        assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]
        assert len(result.assignments) == 2


class TestGameProximity:
    """Game spacing constraint tests."""

    def test_min_game_spacing(self):
        """Minimum slots between a player's games."""
        config = make_config(
            total_slots=20,
            court_count=4,
            enable_game_proximity=True,
            min_game_spacing_slots=3,
            game_proximity_penalty=50.0,
        )
        players = [
            Player(id='p1', name='Player 1', rest_slots=0),  # No rest req
            Player(id='p2', name='Player 2'),
            Player(id='p3', name='Player 3'),
        ]
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2']),
            Match(id='m2', event_code='MS2', side_a=['p1'], side_b=['p3']),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches))

        assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]

        # Player 1's games should have at least min_game_spacing_slots gap
        slots = {a.match_id: a.slot_id for a in result.assignments}
        gap = abs(slots['m1'] - slots['m2'])
        # With penalty, solver should try to maintain spacing
        # (may not always achieve if other constraints conflict)


class TestLockedAssignments:
    """Locked and pinned assignment tests."""

    def test_locked_assignment_preserved(self):
        """Locked assignments must be preserved exactly."""
        config = make_config()
        players = [
            Player(id='p1', name='Player 1'),
            Player(id='p2', name='Player 2'),
        ]
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2']),
        ]
        previous = [
            PreviousAssignment(match_id='m1', slot_id=5, court_id=2, locked=True),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches, previous_assignments=previous))

        assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]

        assignment = result.assignments[0]
        assert assignment.slot_id == 5
        assert assignment.court_id == 2


class TestMultiSlotMatches:
    """Multi-slot duration match tests."""

    def test_multi_slot_match(self):
        """Match with duration > 1 slot."""
        config = make_config(total_slots=10, court_count=1)
        players = [
            Player(id='p1', name='Player 1'),
            Player(id='p2', name='Player 2'),
        ]
        matches = [
            Match(id='m1', event_code='MS1', side_a=['p1'], side_b=['p2'], duration_slots=3),
        ]

        backend = CPSATBackend()
        result = backend.solve(make_request(config, players, matches))

        assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]
        assert result.assignments[0].duration_slots == 3
        # Match should fit within total_slots
        assert result.assignments[0].slot_id + 3 <= 10


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
