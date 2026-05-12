# Tournament prototype — backend image.
#
# Single-stage build because the prototype API is small. The FastAPI
# app depends on scheduler_core (installed via the project's
# pyproject.toml extras) and ortools, which has a sizable native
# component pulled in by pip.
FROM python:3.12-slim

WORKDIR /app

# Build tools for ortools' native bits. Cleaned up after pip install
# to keep the image lean.
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
    && rm -rf /var/lib/apt/lists/*

# Build context is the repo root (set in products/tournament/docker-compose.yml)
# so this Dockerfile can COPY the shared engine sibling-to the product tree.
COPY products/tournament/pyproject.toml products/tournament/README.md products/tournament/USAGE.md ./
COPY scheduler_core/ ./scheduler_core/
COPY products/tournament/tournament/ ./tournament/
COPY products/tournament/backend/ ./backend/
# Tests live alongside the app code so `pytest tests` inside the
# container resolves to a real directory. The [dev] extra in
# pyproject.toml installs pytest + httpx for FastAPI TestClient.
COPY products/tournament/tests/ ./tests/

RUN pip install --no-cache-dir -e ".[backend,dev]"

RUN useradd --create-home --uid 1001 app && chown -R app:app /app

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request,sys; r=urllib.request.urlopen('http://localhost:8000/healthz', timeout=5); sys.exit(0 if r.status==200 else 1)" || exit 1

USER app

EXPOSE 8000

# Plain uvicorn for the prod-style image. The dev compose override
# replaces this CMD with `--reload`.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "5"]
