"""Variable creation and linking for CP-SAT model."""
from typing import Dict, Tuple

from ortools.sat.python import cp_model

from scheduler_core.domain.models import Match, ScheduleConfig


def create_variables(
    model: cp_model.CpModel,
    matches: Dict[str, Match],
    config: ScheduleConfig,
) -> Tuple[Dict[Tuple[str, int, int], cp_model.IntVar], Dict[str, cp_model.IntVar], Dict[str, cp_model.IntVar]]:
    """Create decision variables for the CP-SAT model.
    
    Returns:
        Tuple of (x variables, start_slot variables, end_slot variables)
    """
    T = config.total_slots
    C = config.court_count
    
    x: Dict[Tuple[str, int, int], cp_model.IntVar] = {}
    start_slot: Dict[str, cp_model.IntVar] = {}
    end_slot: Dict[str, cp_model.IntVar] = {}
    
    for match_id, match in matches.items():
        d = match.duration_slots
        max_start = T - d
        
        for t in range(max_start + 1):
            for c in range(1, C + 1):
                var_name = f"x_{match_id}_{t}_{c}"
                x[(match_id, t, c)] = model.NewBoolVar(var_name)
        
        start_slot[match_id] = model.NewIntVar(0, max_start, f"start_{match_id}")
        end_slot[match_id] = model.NewIntVar(d, T, f"end_{match_id}")
        model.Add(end_slot[match_id] == start_slot[match_id] + d)
    
    return x, start_slot, end_slot


def link_start_to_x(
    model: cp_model.CpModel,
    matches: Dict[str, Match],
    config: ScheduleConfig,
    x: Dict[Tuple[str, int, int], cp_model.IntVar],
    start_slot: Dict[str, cp_model.IntVar],
) -> None:
    """Link start slot variables to x decision variables."""
    T = config.total_slots
    C = config.court_count
    
    for match_id, match in matches.items():
        d = match.duration_slots
        max_start = T - d
        
        terms = []
        for t in range(max_start + 1):
            for c in range(1, C + 1):
                if (match_id, t, c) in x:
                    terms.append(t * x[(match_id, t, c)])
        
        if terms:
            model.Add(start_slot[match_id] == sum(terms))
