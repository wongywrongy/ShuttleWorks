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

FROM python:3.11-slim AS builder

WORKDIR /build

# scheduler_core is installed as a regular package via its pyproject.toml.
# The backend itself is not packaged — it ships as a source tree COPYed
# into the runtime stage and launched directly by uvicorn from WORKDIR.
COPY scheduler_core ./scheduler_core
COPY products/scheduler/backend/requirements.txt ./backend/requirements.txt

RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --prefix=/install \
        ./scheduler_core \
        -r ./backend/requirements.txt


FROM python:3.11-slim AS runtime

WORKDIR /app

# Installed Python packages from the builder stage. scheduler_core lives
# under /usr/local/lib/python3.11/site-packages/scheduler_core and is
# importable from anywhere — no sys.path bootstrap required.
COPY --from=builder /install /usr/local

# Build context is the repo root (set in products/scheduler/docker-compose.yml)
# so this Dockerfile can COPY the backend tree out of the monorepo.

# Product backend application code.
COPY products/scheduler/backend/app/ ./app/
COPY products/scheduler/backend/api/ ./api/
COPY products/scheduler/backend/adapters/ ./adapters/
COPY products/scheduler/backend/services/ ./services/

# Create a non-root user and a data dir it owns. The volume mount target
# inherits these permissions (bind mount uid is fixed up via `chown` at
# container start if a host volume is mounted with a different owner).
RUN useradd --create-home --uid 1001 app \
    && mkdir -p /app/data \
    && chown -R app:app /app

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
