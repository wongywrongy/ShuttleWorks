"""Request validation logic for FastAPI adapter."""
from typing import List

from app.schemas import ScheduleRequest


def validate_request(request: ScheduleRequest) -> dict:
    """
    Validate a scheduling request without solving.
    
    Returns validation errors if the request is malformed.
    """
    errors = []
    
    # Check player references in matches
    player_ids = {p.id for p in request.players}
    for match in request.matches:
        for pid in match.sideA + match.sideB:
            if pid not in player_ids:
                errors.append(f"Match {match.id}: player {pid} not found")
    
    # Check previous assignment references
    match_ids = {m.id for m in request.matches}
    for assignment in request.previousAssignments:
        if assignment.matchId not in match_ids:
            errors.append(f"Previous assignment references unknown match {assignment.matchId}")
        if assignment.courtId > request.config.courtCount:
            errors.append(f"Previous assignment court {assignment.courtId} exceeds courtCount")
        if assignment.slotId >= request.config.totalSlots:
            errors.append(f"Previous assignment slot {assignment.slotId} exceeds totalSlots")
    
    # Check capacity
    total_match_slots = sum(m.durationSlots for m in request.matches)
    total_capacity = request.config.totalSlots * request.config.courtCount
    if total_match_slots > total_capacity:
        errors.append(
            f"Insufficient capacity: {total_match_slots} match-slots needed, "
            f"only {total_capacity} available"
        )
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "summary": {
            "players": len(request.players),
            "matches": len(request.matches),
            "totalSlots": request.config.totalSlots,
            "courtCount": request.config.courtCount,
            "previousAssignments": len(request.previousAssignments),
        }
    }
