# Backend Dockerfile - Stateless API
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (build tools for OR-Tools native bits).
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Engine lives at the repo root; the rest of the legacy `src/` namespace
# (app, adapters) is still mounted under /app/src so backend imports
# `from app.X` and `from adapters.X` resolve the same way they do locally.
COPY scheduler_core ./scheduler_core
COPY src/app ./src/app
COPY src/adapters ./src/adapters

# Copy backend application code
COPY backend/app/ ./app/
COPY backend/api/ ./api/
COPY backend/adapters/ ./adapters/
COPY backend/services/ ./services/

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
