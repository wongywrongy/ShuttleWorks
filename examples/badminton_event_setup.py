"""Manual PlayUnits -> bridge -> CP-SAT schedule (badminton-style singles).

Run from the repo root with ``scheduler_core`` installed:
  python examples/badminton_event_setup.py

scheduler_core is the scheduling layer only — the competition/generation layer
(pools, brackets, seeding) is NOT part of it. Callers build PlayUnits from their
own tournament model and hand them to the Bridge. This shows that supported path
with a 4-player round robin.
"""
from itertools import combinations

from scheduler_core import CPSATBackend, ScheduleConfig, SchedulingProblemBuilder
from scheduler_core.domain.tournament import (
    Participant,
    PlayUnit,
    PlayUnitKind,
    TournamentState,
)

# Participants
participants = [Participant(id=f"p{i}", name=f"Player {i}") for i in range(4)]

# Round-robin singles: one PlayUnit (match) per unordered pair of players.
play_units = {
    f"m{a}{b}": PlayUnit(
        id=f"m{a}{b}",
        event_id="MS",
        side_a=[f"p{a}"],
        side_b=[f"p{b}"],
        kind=PlayUnitKind.MATCH,
        expected_duration_slots=1,
    )
    for a, b in combinations(range(4), 2)
}

state = TournamentState(
    participants={p.id: p for p in participants},
    play_units=play_units,
)

# Bridge: state + ready unit ids -> ScheduleRequest
config = ScheduleConfig(total_slots=20, court_count=2)
request = SchedulingProblemBuilder().build(state, list(play_units), config)

# Schedule
result = CPSATBackend().solve(request)

print(f"Status: {result.status.value}, assignments: {len(result.assignments)}")
for a in result.assignments:
    print(f"  {a.match_id} -> slot {a.slot_id}, court {a.court_id}")
