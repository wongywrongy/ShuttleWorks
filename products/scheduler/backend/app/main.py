"""Main FastAPI application - stateless scheduler for school sparring."""
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import (
    auth as auth_api,  # SP-CLOUD-2 — self-hosted accounts + cookie sessions
    health as health_api,  # SP-CLOUD-3 — liveness / readiness / queue metrics
    display as display_api,  # SP-CLOUD-2 — capability-token spectator display
    schedule,
    solve_jobs as solve_jobs_api,  # SP-CLOUD-1 — async solve rail
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
    workspace_modules,  # Workspace-modules program #1 — per-workspace module state
)
from app.body_limit import BodyLimitMiddleware
from app.config import settings
from app.dependencies import get_current_user
from app.exceptions import ConflictError, PreconditionFailedError

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

    # SP-CLOUD-2: materialize the local bootstrap identity so the
    # zero-friction solo-operator flow has a real users row (one code
    # path with registered accounts). Cloud mode skips it — every
    # principal there is a real account.
    if settings.auth_mode == "local":
        try:
            from database.session import SessionLocal
            from services.auth import ensure_bootstrap_user

            with SessionLocal() as _boot_session:
                ensure_bootstrap_user(_boot_session)
                _boot_session.commit()
            log.info("bootstrap_user_ensured")
        except Exception:
            log.exception("bootstrap_user_ensure_failed — continuing")

    from services.suggestions_worker import SuggestionsWorker
    from api.schedule_suggestions import build_handler

    worker = SuggestionsWorker(
        handler=build_handler(app),
        cooldown_seconds=30.0,
    )
    app.state.suggestions_worker = worker
    await worker.start()
    log.info("suggestions_worker started")

    # SP-CLOUD-1: the embedded solve worker — local mode's zero-config
    # job executor (one thread, concurrency 1). Cloud mode sets
    # EMBEDDED_WORKER=false and runs ``python -m worker`` containers
    # against the same queue instead; the loop code is identical.
    from services.solve_worker import SolveWorker
    solve_worker = SolveWorker()
    app.state.solve_worker = solve_worker
    if settings.embedded_worker:
        solve_worker.start()
        log.info("embedded solve worker started (%s)", solve_worker.worker_id)
    else:
        log.info("embedded solve worker disabled (EMBEDDED_WORKER=false)")

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
        solve_worker.stop()
        log.info("solve_worker stopped")
        log.info("app_shutdown")


# Interactive API docs are local-mode only (SP-SEC-1, SEC-04).
#
# /docs, /redoc and /openapi.json carried no auth dependency, so a public
# deployment published the complete route table and every request/response
# schema for all 77 paths. That is not a vulnerability by itself — it is a
# free, complete map for anyone probing the rest of the surface, and ASVS
# v5.0.0-13.4.5 calls it out.
#
# They stay ON in local mode, where they are genuinely useful and the API is
# bound to the operator's own machine. Gating on ENVIRONMENT rather than
# AUTH_MODE deliberately: this is about who can reach the process, not about
# how a caller authenticates.
# A function, not an inline conditional, so the decision is testable
# without constructing a cloud app: ENVIRONMENT=cloud makes Settings()
# itself refuse to build without the full cloud secret set (a postgres DSN,
# OPS_TOKEN, SMTP), so an in-process cloud app is not something a unit test
# can have. The live 404s are verified against the real deployment in
# Phase 4 (Rule 6) — this covers the branch, cayde covers the behaviour.
def docs_urls(environment: str) -> tuple[str | None, str | None, str | None]:
    """``(docs_url, redoc_url, openapi_url)`` for FastAPI, per environment."""
    if environment == "cloud":
        return (None, None, None)
    return ("/docs", "/redoc", "/openapi.json")


_docs_url, _redoc_url, _openapi_url = docs_urls(settings.environment)

app = FastAPI(
    title="School Sparring Scheduler API",
    description="Stateless scheduling API for school sparring matches using CP-SAT solver",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
)

# CORS middleware — origins read from ``settings.cors_origins`` so a
# deployment can extend (or replace) the dev allowlist via the
# ``CORS_ORIGINS`` env var without rebuilding the image.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Cookie-session auth (SP-CLOUD-2) requires credentialed CORS. Safe
    # because ``cors_origins`` is an explicit allowlist, never "*".
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    # ``If-Match`` and ``ETag`` carry the state-blob concurrency token
    # (SP-CLOUD-4). Neither is CORS-safelisted, so on a genuinely
    # cross-origin deployment — which CORS_ORIGINS exists to support — the
    # browser would refuse to send the request header and would hide the
    # response header from JS, making every state write 412 with no way for
    # the client to ever obtain a token. Same-origin stacks never notice,
    # which is exactly why it would have shipped broken.
    allow_headers=[
        "Authorization", "Content-Type", "Accept", "Origin",
        "X-Requested-With", "If-Match",
    ],
    expose_headers=["X-Request-ID", "ETag"],
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
async def csrf_middleware(request: Request, call_next):
    """Custom-header CSRF check for cookie-authenticated writes.

    OWASP's SameSite + custom-request-header double for cookie-auth
    SPAs: a cross-site form/img can send our SameSite=Lax cookie on
    top-level GETs but can never attach a custom header without a CORS
    preflight we won't approve. Enforcement triggers only when a
    state-changing request actually carries the session cookie —
    bearer-token requests, local bootstrap requests (no cookie), and
    all GET/HEAD/OPTIONS are untouched, so nothing existing breaks
    before the frontend migrates.
    """
    if (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and settings.session_cookie_name in request.cookies
        and request.headers.get("X-ShuttleWorks-CSRF") != "1"
    ):
        return JSONResponse(
            status_code=403,
            content={
                "detail": {
                    "code": "AUTH_CSRF_REQUIRED",
                    "message": "Missing X-ShuttleWorks-CSRF header",
                }
            },
        )
    return await call_next(request)


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

    Requests that never touch ``get_repository`` (``/health``) have no
    ``request.state.repository`` and are a no-op.

    STREAMING ROUTES — read this before adding one. This runs after
    ``call_next`` returns, which for a ``StreamingResponse`` is *before*
    the body has been streamed. So the repository is closed while the
    generator is still running, and a generator that touched ``repo``
    after its first yield would find a returned-to-pool session.

    Today nothing does. The one live streaming route
    (``schedule_next_round_stream`` in ``api/brackets.py``) does depend
    on ``get_repository`` — the previous version of this comment claimed
    no streaming route did, and that ``api/schedule.py`` was the only
    file using ``StreamingResponse``; both stopped being true when the
    bracket stream landed. It is safe for a specific reason worth
    stating: it fully materializes its data *before* constructing the
    response (``_hydrate_session`` returns a Pydantic ``BracketSession``
    built from plain dicts, not a lazily-bound ORM row), so the
    generator closes over values, not a session.

    That is a real invariant with no test behind it. A future streaming
    route that lazy-loads inside its generator would break in production
    under a shape unit tests do not reproduce. Logged in the debt log.
    """
    try:
        return await call_next(request)
    finally:
        repo = getattr(request.state, "repository", None)
        if repo is not None:
            repo.close()


# Body-size ceiling (SP-SEC-1, SEC-01). Registered LAST on purpose.
#
# ``add_middleware`` does ``user_middleware.insert(0, …)``, so the most
# recently registered middleware is the OUTERMOST one. Registering this
# above (next to the CORS call, where it reads more naturally) puts it
# *innermost* instead — verified by inspecting ``app.user_middleware``,
# not assumed from the call order. Outermost is what we want: an
# oversized body is refused before CORS, CSRF, the request-id stamp, or
# a database session get involved.
#
# The cost of being outermost: the 413 does not pass back through
# ``CORSMiddleware``, so it carries no ``Access-Control-Allow-Origin``.
# That is invisible in every shipped stack — nginx serves the SPA and
# proxies ``/api/`` on one origin, and the Vite dev proxy does the same —
# but a genuinely cross-origin client would see an opaque network error
# instead of the 413 body. Accepted: the guard's job is to refuse cheaply
# and unconditionally, and the alternative hides it behind three layers
# that all have to run first.
app.add_middleware(
    BodyLimitMiddleware, max_bytes=settings.max_request_body_bytes
)


# Step 4 — every data router is guarded by ``get_current_user``. The
# ``/health*`` endpoints are excluded from *that* dependency because a
# probe has no session, but they are not ungoverned: ``/health`` is
# deliberately public (liveness must answer without a credential) while
# ``/health/ready|deep|metrics`` carry their own ``OPS_TOKEN`` guard —
# see ``api/health.py``. Until 2026-08-04 this comment claimed the
# tunnel would keep them private; the tunnel publishes a hostname, not a
# route list, so it never did.
_AUTH_DEP = [Depends(get_current_user)]

app.include_router(schedule.router, dependencies=_AUTH_DEP)
app.include_router(solve_jobs_api.router)  # carries its own auth + role deps
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
app.include_router(workspace_modules.router, dependencies=_AUTH_DEP)
# Invites: registered WITHOUT the router-level auth dep so the public
# ``GET /invites/{token}`` resolve endpoint stays unauthenticated. The
# accept + revoke endpoints declare their own auth requirements.
app.include_router(invites.router)
# Auth: register/login/reset are necessarily public; /me and
# /change-password declare ``get_current_user`` themselves.
app.include_router(auth_api.router)
# Display: the public projection routes are the app's only
# unauthenticated data plane (capability token, read-only — Rule 8);
# the manage router carries its own owner-role dependency.
app.include_router(display_api.public_router)
app.include_router(display_api.manage_router)
app.include_router(health_api.router)





if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
    )
