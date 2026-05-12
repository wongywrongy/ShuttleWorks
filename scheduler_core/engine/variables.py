"""Decision variables for the CP-SAT interval-based scheduling model.

Each match is an interval (start, size=duration, end) plus an integer court
variable. Per-court optional intervals are created so that court-level
``AddNoOverlap`` can enforce court capacity directly — replacing the
O(matches × slots × courts) boolean matrix used in the legacy model with an
O(matches × courts) set of booleans plus O(matches) integers.
"""
from dataclasses import dataclass, field
from typing import Dict, Tuple

from ortools.sat.python import cp_model

from scheduler_core.domain.models import Match, ScheduleConfig


@dataclass
class SchedulingVars:
    """Container for all decision variables used by the interval model."""

    start: Dict[str, cp_model.IntVar] = field(default_factory=dict)
    end: Dict[str, cp_model.IntVar] = field(default_factory=dict)
    interval: Dict[str, cp_model.IntervalVar] = field(default_factory=dict)
    court: Dict[str, cp_model.IntVar] = field(default_factory=dict)
    is_on_court: Dict[Tuple[str, int], cp_model.IntVar] = field(default_factory=dict)
    court_interval: Dict[Tuple[str, int], cp_model.IntervalVar] = field(default_factory=dict)


def create_variables(
    model: cp_model.CpModel,
    matches: Dict[str, Match],
    config: ScheduleConfig,
) -> SchedulingVars:
    """Create start/end/interval/court variables for every match.

    Also emits the hard-constraint linking each match to exactly one court and
    equating the integer court var to the selected court's index.
    """
    T = config.total_slots
    C = config.court_count
    vars_ = SchedulingVars()

    for match_id, match in matches.items():
        d = match.duration_slots
        max_start = max(T - d, 0)

        start_var = model.NewIntVar(0, max_start, f"start_{match_id}")
        end_var = model.NewIntVar(d, T, f"end_{match_id}")
        interval_var = model.NewIntervalVar(start_var, d, end_var, f"iv_{match_id}")
        court_var = model.NewIntVar(1, C, f"court_{match_id}")

        vars_.start[match_id] = start_var
        vars_.end[match_id] = end_var
        vars_.interval[match_id] = interval_var
        vars_.court[match_id] = court_var

        on_court_bools = []
        for c in range(1, C + 1):
            is_on = model.NewBoolVar(f"on_{match_id}_{c}")
            court_iv = model.NewOptionalIntervalVar(
                start_var, d, end_var, is_on, f"court_iv_{match_id}_{c}"
            )
            vars_.is_on_court[(match_id, c)] = is_on
            vars_.court_interval[(match_id, c)] = court_iv
            on_court_bools.append(is_on)

        # Every match lives on exactly one court.
        model.AddExactlyOne(on_court_bools)
        # Tie the integer court variable to the selected court index.
        model.Add(court_var == sum(c * vars_.is_on_court[(match_id, c)] for c in range(1, C + 1)))

    return vars_
