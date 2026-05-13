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
COPY products/scheduler/backend/requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --prefix=/install -r ./requirements.txt

# scheduler_core is installed as a regular package via its pyproject.toml.
# Copied + installed in its own layer so engine edits don't invalidate
# the (much larger) third-party dep layer above.
COPY scheduler_core ./scheduler_core
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --prefix=/install --no-deps ./scheduler_core


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

# Build context is the repo root (set in products/scheduler/docker-compose.yml)
# so this Dockerfile can COPY the backend tree out of the monorepo.
# Each top-level package gets its own COPY so a change inside one
# directory only invalidates that layer (and the ones below it).
COPY --chown=app:app products/scheduler/backend/app/      ./app/
COPY --chown=app:app products/scheduler/backend/api/      ./api/
COPY --chown=app:app products/scheduler/backend/adapters/ ./adapters/
COPY --chown=app:app products/scheduler/backend/services/ ./services/

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
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "5"]
