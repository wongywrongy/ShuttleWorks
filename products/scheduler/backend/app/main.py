"""Main FastAPI application - stateless scheduler for school sparring."""
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import (
    schedule,
    match_state,
    tournaments,  # Step 2 — replaces the legacy /tournament/state singleton router
    schedule_repair,
    schedule_warm_restart,
    schedule_advisories,
    schedule_proposals,
    schedule_director,
    schedule_suggestions,
    invites,  # Step 7 — invite-link generate / resolve / accept / revoke
    commands,  # Arch-adjustment Step C — idempotent operator command log
    brackets,  # Backend-merge arc PR 2 — bracket draws / advancement / I/O
)
from app.config import settings
from app.dependencies import get_current_user
from app.exceptions import ConflictError, PreconditionFailedError
from repositories.local import (
    CURRENT_TOURNAMENT_SCHEMA_VERSION as _CURRENT_TOURNAMENT_SCHEMA_VERSION,
)

log = logging.getLogger("scheduler.app")

# Backend root — used by Alembic to locate alembic.ini at startup so the
# upgrade runs from whichever working directory uvicorn was launched in.
_BACKEND_DIR = Path(__file__).resolve().parents[1]


def _run_migrations() -> None:
    """Apply outstanding Alembic migrations on startup.

    Idempotent: a no-op once the database is at the latest revision.
    Tests that build their own schema via ``Base.metadata.create_all``
    skip this entirely (they don't invoke the lifespan).
    """
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup + graceful shutdown hooks.

    Startup applies any outstanding Alembic migrations, then spins up the
    SuggestionsWorker (one asyncio.Task that consumes a queue of
    speculative-solve triggers; handler built in
    ``api.schedule_suggestions``).
    """
    log.info("app_startup version=2.0.0")

    try:
        _run_migrations()
        log.info("alembic_upgrade_head_complete")
    except Exception:
        log.exception("alembic_upgrade_failed — continuing; reads will surface")

    from services.suggestions_worker import SuggestionsWorker
    from api.schedule_suggestions import build_handler

    worker = SuggestionsWorker(
        handler=build_handler(app),
        cooldown_seconds=30.0,
    )
    app.state.suggestions_worker = worker
    await worker.start()
    log.info("suggestions_worker started")

    # Step E: Supabase outbox replicator. Skip in local-dev mode
    # (SUPABASE_URL blank) — the worker would have no client and
    # would idle. The enqueue path still writes to ``sync_queue``
    # regardless; the queue just doesn't drain.
    from services.sync_service import SyncService
    sync_service = SyncService()
    app.state.sync_service = sync_service
    if settings.supabase_url and settings.supabase_anon_key:
        sync_service.start()
        log.info("sync_service started")
    else:
        log.info("sync_service skipped (SUPABASE_URL blank — local-dev mode)")

    # The single-tournament 90 s OPTIMIZE heartbeat retired in Step 2 —
    # post-commit and advisory-driven triggers now carry an explicit
    # ``tournament_id``, and a global periodic tick has no obvious way
    # to fan out without a tournament-list scan that the worker isn't
    # built for. Inbox staleness is bounded by commit cadence and the
    # 30 s cooldown.

    try:
        yield
    finally:
        await worker.stop()
        log.info("suggestions_worker stopped")
        sync_service.stop()
        log.info("sync_service stopped")
        log.info("app_shutdown")


app = FastAPI(
    title="School Sparring Scheduler API",
    description="Stateless scheduling API for school sparring matches using CP-SAT solver",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS middleware — origins read from ``settings.cors_origins`` so a
# deployment can extend (or replace) the dev allowlist via the
# ``CORS_ORIGINS`` env var without rebuilding the image.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,  # Set to False when not using cookies/session auth
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["X-Request-ID"],
)


@app.exception_handler(ConflictError)
async def _conflict_error_handler(request: Request, exc: ConflictError) -> JSONResponse:
    """Translate the domain ``ConflictError`` into an HTTP 409 response.

    The structured body lets the frontend branch on ``error`` (either
    ``conflict`` for state-machine violations or ``stale_version`` for
    optimistic-concurrency mismatches) without parsing a string.
    """
    return JSONResponse(status_code=409, content=exc.to_dict())


@app.exception_handler(PreconditionFailedError)
async def _precondition_failed_handler(
    request: Request, exc: PreconditionFailedError
) -> JSONResponse:
    """Translate the domain ``PreconditionFailedError`` into HTTP 412.

    Body shape matches the 409 handler — flat, no ``detail`` wrapper —
    so the frontend has one parser across both error families.
    """
    return JSONResponse(status_code=412, content=exc.to_dict())


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


@app.middleware("http")
async def close_repository_middleware(request: Request, call_next):
    """Close the per-request DB session opened by ``get_repository``.

    ``get_repository`` (``repositories/local.py``) opens a ``SessionLocal``
    per request and stashes the repository on ``request.state.repository``
    rather than using a generator dependency — its docstring delegates
    cleanup to "a ``http`` middleware in ``app.main`` that calls
    ``repo.close()``". This is that middleware; without it the session is
    never returned to the SQLAlchemy pool.

    The leak is invisible until load: the default ``QueuePool`` for a
    file-backed SQLite URL is ``pool_size=5`` + ``max_overflow=10`` = 15
    connections. After 15 leaked sessions every further ``SessionLocal()``
    blocks for ``pool_timeout`` (30 s) then raises, and because each
    blocked call is a sync route running in uvicorn's threadpool the pool
    wedges — sync routes hang while the async ``/health`` keeps answering.

    Streaming routes are unaffected: ``api/schedule.py`` is the only file
    using ``StreamingResponse`` and it never depends on ``get_repository``,
    so closing here (after ``call_next`` returns, before the body is
    streamed) can't pull a session out from under an in-flight stream.
    Requests that never touch ``get_repository`` (``/health``) have no
    ``request.state.repository`` and are a no-op.
    """
    try:
        return await call_next(request)
    finally:
        repo = getattr(request.state, "repository", None)
        if repo is not None:
            repo.close()


# Step 4 — every data router is guarded by ``get_current_user``. The
# ``/health`` and ``/health/deep`` endpoints are intentionally excluded
# so liveness probes don't require a token; Step 7's
# ``GET /invites/:token`` will be added to the public set when it
# lands.
_AUTH_DEP = [Depends(get_current_user)]

app.include_router(schedule.router, dependencies=_AUTH_DEP)
app.include_router(schedule_repair.router, dependencies=_AUTH_DEP)
app.include_router(schedule_warm_restart.router, dependencies=_AUTH_DEP)
app.include_router(schedule_advisories.router, dependencies=_AUTH_DEP)
app.include_router(schedule_proposals.router, dependencies=_AUTH_DEP)
app.include_router(schedule_director.router, dependencies=_AUTH_DEP)
app.include_router(schedule_suggestions.router, dependencies=_AUTH_DEP)
app.include_router(match_state.router, dependencies=_AUTH_DEP)
app.include_router(commands.router, dependencies=_AUTH_DEP)
app.include_router(brackets.router, dependencies=_AUTH_DEP)
app.include_router(tournaments.router, dependencies=_AUTH_DEP)
# Invites: registered WITHOUT the router-level auth dep so the public
# ``GET /invites/{token}`` resolve endpoint stays unauthenticated. The
# accept + revoke endpoints declare their own auth requirements.
app.include_router(invites.router)


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
    data_dir = Path(settings.data_dir)
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
        "schemaVersion": _CURRENT_TOURNAMENT_SCHEMA_VERSION,
        "dataDirWritable": data_dir_writable,
        "solverLoaded": solver_loaded,
        "dataDirError": data_error,
        "solverError": solver_error,
        "requestId": getattr(request.state, "request_id", None),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
    )
