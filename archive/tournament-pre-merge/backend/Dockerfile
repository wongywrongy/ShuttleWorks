# syntax=docker/dockerfile:1.7
# Tournament prototype — backend image.
#
# Multi-stage:
# - `builder`: resolves Python deps (prod extras only) into /install with
#   a BuildKit pip cache mount. ortools 9.8+ ships manylinux wheels for
#   cp312 on linux/amd64, so no compiler toolchain is needed.
# - `runtime` (default target): clean slim image with installed packages
#   from /install plus the app source. No pytest, no httpx, no tests/.
# - `dev`: extends runtime with the [dev] extras + tests/ for the
#   docker-compose.dev.yml override. Compose dev/test flows must pass
#   `target: dev`; the prod compose passes (and pins) `target: runtime`.

FROM python:3.12-slim AS builder

WORKDIR /build

# Build context is the repo root (set in products/tournament/docker-compose.yml)
# so this Dockerfile can COPY the shared engine sibling-to the product tree.
# PR 2 of the backend-merge arc moved the bracket package from
# ``products/tournament/tournament/`` to
# ``products/scheduler/backend/services/bracket/``; the Dockerfile follows
# the move so the tournament backend can still import ``services.bracket.X``
# from inside ``/app``.
COPY products/tournament/pyproject.toml products/tournament/README.md products/tournament/USAGE.md ./
COPY scheduler_core/ ./scheduler_core/
COPY products/scheduler/backend/services/bracket/ ./services/bracket/

RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --prefix=/install ".[backend]"


FROM python:3.12-slim AS runtime

WORKDIR /app

# Installed Python packages from the builder stage.
COPY --from=builder /install /usr/local

# App source (kept in the image so `uvicorn backend.main:app` works
# without bind mounts — dev compose overlays mounts on top for HMR).
COPY products/tournament/pyproject.toml products/tournament/README.md products/tournament/USAGE.md ./
COPY scheduler_core/ ./scheduler_core/
COPY products/scheduler/backend/services/bracket/ ./services/bracket/
COPY products/tournament/backend/ ./backend/

RUN useradd --create-home --uid 1001 app && chown -R app:app /app

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request,sys; r=urllib.request.urlopen('http://localhost:8000/healthz', timeout=5); sys.exit(0 if r.status==200 else 1)" || exit 1

USER app

EXPOSE 8000

# Plain uvicorn for the prod-style image. The dev compose override
# replaces this CMD with `--reload`.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "5"]


# Dev target — adds pytest + httpx for `make test-tournament` and copies
# tests/ as a self-contained fallback. The dev compose bind-mounts
# tests/ from the host on top of this so iteration doesn't need a
# rebuild.
FROM runtime AS dev

USER root
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install pytest pytest-benchmark httpx
COPY products/tournament/tests/ ./tests/
RUN chown -R app:app /app
USER app
