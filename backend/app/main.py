"""Main FastAPI application - stateless scheduler for school sparring."""
import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api import schedule, match_state, tournament_state

log = logging.getLogger("scheduler.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup + graceful shutdown hooks.

    The scheduler is stateless per-request, but tournament_state and
    match_state flush their writes atomically in-request, so there's
    nothing to drain here beyond letting uvicorn finish inflight requests
    (its own timeout_graceful_shutdown handles that). We log shutdown so
    the user can see a clean exit in the container logs.
    """
    log.info("app_startup version=2.0.0")
    yield
    log.info("app_shutdown")


app = FastAPI(
    title="School Sparring Scheduler API",
    description="Stateless scheduling API for school sparring matches using CP-SAT solver",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS middleware - explicit dev origins for local development
DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",  # Vite alternate port
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",  # Vite preview
    "http://127.0.0.1:4173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_credentials=False,  # Set to False when not using cookies/session auth
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Stamp every request/response with an X-Request-ID.

    Honours an incoming header (so a reverse proxy or the frontend can
    propagate its own ID), else mints a uuid4. The ID is attached to the
    request state so downstream handlers and exception logs can reference
    it.
    """
    incoming = request.headers.get("X-Request-ID")
    rid = incoming or uuid.uuid4().hex
    request.state.request_id = rid
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


# Register API routers
app.include_router(schedule.router)
app.include_router(match_state.router)
app.include_router(tournament_state.router)


@app.get("/health")
async def health_check():
    """Shallow liveness probe — the container is up."""
    return {"status": "healthy", "version": "2.0.0"}


@app.get("/health/deep")
async def health_deep(request: Request):
    """Deep readiness probe.

    Verifies the data directory is writable and the CP-SAT solver module
    imports successfully. Used by the Docker HEALTHCHECK so orchestrators
    can catch "backend is up but can't persist" failure modes.
    """
    data_dir = Path(os.environ.get("BACKEND_DATA_DIR", "/app/data"))
    data_dir_writable = False
    data_error: str | None = None
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
        probe = data_dir / ".healthcheck.tmp"
        probe.write_text("ok")
        probe.unlink()
        data_dir_writable = True
    except OSError as e:
        data_error = str(e)

    solver_loaded = False
    solver_error: str | None = None
    try:
        from ortools.sat.python import cp_model  # noqa: F401
        solver_loaded = True
    except Exception as e:  # pragma: no cover - defensive, import should never fail in prod
        solver_error = str(e)

    healthy = data_dir_writable and solver_loaded
    return {
        "status": "healthy" if healthy else "degraded",
        "version": "2.0.0",
        "schemaVersion": tournament_state.CURRENT_SCHEMA_VERSION,
        "dataDirWritable": data_dir_writable,
        "solverLoaded": solver_loaded,
        "dataDirError": data_error,
        "solverError": solver_error,
        "requestId": getattr(request.state, "request_id", None),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
