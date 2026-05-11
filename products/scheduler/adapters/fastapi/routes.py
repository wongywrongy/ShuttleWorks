"""FastAPI routes for the scheduling API.

Delegates to scheduler_core. Does not import ortools.
"""
from fastapi import HTTPException

from app import __version__
from app.schemas import HealthResponse, ScheduleRequest, ScheduleResponse
from adapters.fastapi.validation import validate_request
from scheduler_core import schedule_from_api
from scheduler_core.domain.errors import FrameworkError, InfeasibleError, ValidationError


async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", version=__version__)


async def create_schedule(request: ScheduleRequest) -> ScheduleResponse:
    """
    Generate an optimized schedule for the given matches.

    Delegates to scheduler_core.schedule_from_api. Maps framework exceptions
    to HTTP errors (ValidationError -> 400, InfeasibleError -> 422, FrameworkError -> 500).

    **Hard Constraints** (always enforced):
    - Each match scheduled exactly once
    - No resource conflicts (one match per court per slot)
    - No player conflicts (player can't be in two matches at once)
    - Player availability windows
    - Locked/pinned assignments

    **Returns**: `optimal` | `feasible` | `infeasible` with assignments or infeasibleReasons.
    """
    try:
        return schedule_from_api(request)
    except InfeasibleError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FrameworkError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def validate_request_endpoint(request: ScheduleRequest) -> dict:
    """
    Validate a scheduling request without solving.
    
    Returns validation errors if the request is malformed.
    """
    return validate_request(request)
