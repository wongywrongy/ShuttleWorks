"""Main FastAPI application - stateless scheduler for school sparring."""
import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api import (
    schedule,
    match_state,
    tournament_state,
    schedule_repair,
    schedule_warm_restart,
    schedule_advisories,
    schedule_proposals,
    schedule_director,
    schedule_suggestions,  # <-- added
)

log = logging.getLogger("scheduler.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup + graceful shutdown hooks.

    SuggestionsWorker spawns one asyncio.Task that consumes a
    queue of speculative-solve triggers. Handler is built in
    api.schedule_suggestions to keep solver imports out of this
    top-level module.
    """
    log.info("app_startup version=2.0.0")

    from services.suggestions_worker import (
        SuggestionsWorker,
        TriggerEvent,
        TriggerKind,
    )
    from api.schedule_suggestions import build_handler

    worker = SuggestionsWorker(
        handler=build_handler(app),
        cooldown_seconds=30.0,
    )
    app.state.suggestions_worker = worker
    await worker.start()
    log.info("suggestions_worker started")

    # Periodic 90 s heartbeat: post an OPTIMIZE trigger so the inbox
    # refreshes even when no commit has happened recently. The worker
    # dedups by fingerprint, so back-to-back ticks within the cooldown
    # are no-ops. Cancellation in the finally is required so shutdown
    # is clean (the task otherwise runs forever).
    async def _periodic_optimize_tick() -> None:
        while True:
            try:
                await asyncio.sleep(90.0)
            except asyncio.CancelledError:
                break
            try:
                await worker.post(TriggerEvent(
                    kind=TriggerKind.PERIODIC,
                    fingerprint="opt:periodic",
                ))
            except Exception:
                log.exception("periodic optimize tick: post failed")

    periodic_task = asyncio.create_task(
        _periodic_optimize_tick(), name="periodic-optimize",
    )
    log.info("periodic_optimize_tick started")

    try:
        yield
    finally:
        periodic_task.cancel()
        try:
            await periodic_task
        except asyncio.CancelledError:
            pass
        await worker.stop()
        log.info("suggestions_worker stopped")
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
app.include_router(schedule_repair.router)
app.include_router(schedule_warm_restart.router)
app.include_router(schedule_advisories.router)
app.include_router(schedule_proposals.router)
app.include_router(schedule_director.router)
app.include_router(schedule_suggestions.router)
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
