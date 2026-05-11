"""
FastAPI application for the scheduling API.

This is a thin adapter layer that wraps the scheduler_core library.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app import __version__
from src.app.schemas import HealthResponse, ScheduleRequest, ScheduleResponse
from src.adapters.fastapi.routes import create_schedule, health_check, validate_request_endpoint

app = FastAPI(
    title="Tournament Scheduling API",
    description="""
## CP-SAT Tournament Match Scheduler

A stateless scheduling algorithm API using Google OR-Tools CP-SAT solver.

### Features
- **Constraint-based scheduling**: Handles court capacity, player conflicts, availability windows
- **Soft constraints**: Rest time, disruption minimization, late finish penalties
- **Re-optimization**: Supports locked/pinned assignments and freeze horizons
- **Diagnostics**: Returns detailed infeasibility reasons

### How it works
1. Send a POST request to `/schedule` with matches, players, and config
2. The solver finds an optimal assignment of matches to time slots and courts
3. Returns assignments along with any soft constraint violations

### Input
- `config`: Tournament settings (slots, courts, penalties)
- `players`: List of players with availability and rest constraints
- `matches`: List of matches with player assignments
- `previousAssignments`: (Optional) Previous schedule for re-optimization

### Output
- `status`: optimal, feasible, infeasible, unknown
- `assignments`: Match → (slot, court) mappings
- `softViolations`: Any soft constraint violations
- `infeasibleReasons`: Why scheduling failed (if applicable)
    """,
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS - allow all origins for standalone use
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health():
    """Health check endpoint."""
    return await health_check()


@app.post("/schedule", response_model=ScheduleResponse, tags=["Scheduling"])
async def schedule(request: ScheduleRequest):
    """Generate an optimized schedule for the given matches."""
    return await create_schedule(request)


@app.post("/validate", tags=["Scheduling"])
async def validate(request: ScheduleRequest):
    """Validate a scheduling request without solving."""
    return await validate_request_endpoint(request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("adapters.fastapi.main:app", host="0.0.0.0", port=8000, reload=True)
