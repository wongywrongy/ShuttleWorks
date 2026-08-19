# syntax=docker/dockerfile:1.7
# Backend Dockerfile — Stateless API (FastAPI + CP-SAT).
#
# Multi-stage:
# - `builder` resolves Python deps into /install. ortools 9.8+ ships
#   manylinux wheels for cp311 on linux/amd64, so no compiler toolchain
#   is needed; if a future dep starts requiring gcc, add it here only,
#   not in runtime. A BuildKit cache mount keeps the ~120MB ortools
#   wheel around between builds.
# - `runtime` is the final, slim image — just the installed packages
#   from /install plus the app source. No pip, no apt residue.
#
# Layer order is tuned for cache reuse: third-party deps change rarely,
# scheduler_core changes often, backend source changes most. Each gets
# its own layer so iterating on the engine doesn't reinstall ortools.

FROM python:3.11-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /build

# Third-party deps first — pinned in requirements.txt and rarely
# touched, so this layer stays cached across normal app/engine edits.
COPY apps/api/requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --prefix=/install -r ./requirements.txt

# scheduler_core is installed as a regular package via its pyproject.toml.
# Copied + installed in its own layer so engine edits don't invalidate
# the (much larger) third-party dep layer above.
COPY packages/scheduler-core ./scheduler-core
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --prefix=/install --no-deps ./scheduler-core


FROM python:3.11-slim AS runtime

# PYTHONDONTWRITEBYTECODE — keeps a read-only root filesystem actually
#   read-only by stopping the interpreter from scattering .pyc files
#   next to .py sources at import time.
# PYTHONUNBUFFERED — flushes stdout/stderr line-by-line so docker logs
#   shows uvicorn output without a 1-line lag on quiet traffic.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Create the runtime user BEFORE the source COPYs so we can use
# `--chown=app:app` and skip a recursive chown walk over /app at the
# end of the build.
RUN useradd --create-home --uid 1001 app \
    && mkdir -p /app/data \
    && chown app:app /app/data

# Installed Python packages from the builder stage. scheduler_core lives
# under /usr/local/lib/python3.11/site-packages/scheduler_core and is
# importable from anywhere — no sys.path bootstrap required.
COPY --from=builder /install /usr/local

# Build context is the repo root (set in infra/compose/docker-compose.yml)
# so this Dockerfile can COPY the API tree out of the monorepo.
#
# The image MIRRORS the repository: apps/api/src -> /app/src, with alembic.ini
# beside it at /app/alembic.ini, exactly as they sit on disk. That is not
# tidiness. `core/paths.py` derives SRC_ROOT and API_ROOT from its own
# __file__, and the whole point of doing it there is that one expression is
# correct in both places; flattening the tree here would reintroduce the
# two-sided coincidence SP-REORG-1 Phase 1 removed from config_lock.
#
# WORKDIR stays /app so every CWD-relative path (the ./data volume, a
# CWD-relative sqlite URL) means what it always meant. PYTHONPATH is what
# makes `core`, `meet`, `bracket` importable by bare name, since src/ is a
# sys.path ROOT and not a package (SP-REORG-1 R4).
#
# One COPY per domain package, so a change inside one only invalidates that
# layer and the ones below it.
COPY --chown=app:app apps/api/src/core/        ./src/core/
COPY --chown=app:app apps/api/src/shared/      ./src/shared/
COPY --chown=app:app apps/api/src/db/          ./src/db/
COPY --chown=app:app apps/api/src/repositories/ ./src/repositories/
COPY --chown=app:app apps/api/src/workspaces/  ./src/workspaces/
COPY --chown=app:app apps/api/src/identity/    ./src/identity/
COPY --chown=app:app apps/api/src/meet/        ./src/meet/
COPY --chown=app:app apps/api/src/bracket/     ./src/bracket/
COPY --chown=app:app apps/api/src/operations/  ./src/operations/
COPY --chown=app:app apps/api/src/display/     ./src/display/
COPY --chown=app:app apps/api/src/entries/     ./src/entries/
COPY --chown=app:app apps/api/src/solve_rail/  ./src/solve_rail/
COPY --chown=app:app apps/api/src/ops/         ./src/ops/
COPY --chown=app:app apps/api/src/alembic/     ./src/alembic/
COPY --chown=app:app apps/api/alembic.ini      ./alembic.ini
# Standalone solve-worker entry (cloud mode: `python -m worker`). The
# same image serves as API and worker; compose picks the command.
COPY --chown=app:app apps/api/src/worker.py    ./src/worker.py

ENV PYTHONPATH=/app/src
# API/console shared contract data. services/config_lock.py finds this by
# walking UP from its own file looking for packages/shared-contract, so the
# image mirrors the repository path rather than inventing a flat /shared.
# The old layout copied it to /shared purely to make a `parents[2]` index
# come out right in a container whose tree is flatter than the repo's - a
# coincidence that no longer has to be maintained on two sides.
COPY --chown=app:app packages/shared-contract/  /packages/shared-contract/

# Healthcheck hits /health/deep so we catch "backend is up but can't
# persist or can't import the solver" failure modes, not just liveness.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request,sys; r=urllib.request.urlopen('http://localhost:8000/health/deep', timeout=5); sys.exit(0 if __import__('json').load(r).get('status')=='healthy' else 1)" || exit 1

USER app

EXPOSE 8000

# ``--timeout-graceful-shutdown=5`` lets in-flight requests drain for up
# to 5 seconds on SIGTERM before uvicorn hard-kills them — the scheduler
# can finish whatever short synchronous work it's doing without dropping
# the client's connection.
CMD ["uvicorn", "core.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "5"]
