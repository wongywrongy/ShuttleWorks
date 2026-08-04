.PHONY: build run rebuild stop logs clean dev dev-postgres dev-postgres-stop help test-e2e test-e2e-rebuild test-e2e-dev test-e2e-install generate-api sim sim-ephemeral sim-all sim-test

# Default target
help:
	@echo "Tournament Scheduler - Available Commands"
	@echo ""
	@echo "Production (Docker):"
	@echo "  make build             - Build Docker images"
	@echo "  make run               - Build and run production (http://localhost)"
	@echo "  make rebuild           - Fresh rebuild: stop, remove old images, rebuild with --no-cache, run"
	@echo "  make stop              - Stop all containers"
	@echo "  make logs              - View container logs"
	@echo "  make clean             - Stop and remove containers, images, volumes"
	@echo ""
	@echo "Development (Hybrid):"
	@echo "  make dev               - Run backend (Docker) + frontend (npm dev server)"
	@echo "  make dev-postgres      - Local Postgres + backend (exercise the cloud path)"
	@echo "  make dev-postgres-stop - Stop the Postgres dev stack"
	@echo ""
	@echo "End-to-end tests (Playwright):"
	@echo "  make test-e2e-install  - Install Playwright browsers (one-time)"
	@echo "  make test-e2e          - Boot stack + run smoke tests + tear down"
	@echo "  make test-e2e-rebuild  - Force rebuild images before running tests"
	@echo "  make test-e2e-dev      - Run tests against http://localhost:5173 (requires 'make dev')"
	@echo ""
	@echo "API contract:"
	@echo "  make generate-api      - Regenerate frontend/src/api/dto.generated.ts from FastAPI OpenAPI"
	@echo ""
	@echo "Tournament simulator (internal dev tool — see simulator/README.md):"
	@echo "  make sim               - Run a scenario vs a running backend (SCENARIO=, SEED=, SIM_URL=)"
	@echo "  make sim-ephemeral     - Same, against an isolated throwaway backend"
	@echo "  make sim-all           - Every scenario + all 6 bracket formats (ephemeral)"
	@echo "  make sim-test          - The simulator's own pytest (boundary guard + smoke)"
	@echo ""

# === Production Commands ===

build:
	docker compose build

run:
	docker compose up -d --build
	@echo ""
	@echo "Application starting..."
	@echo "  Frontend: http://localhost"
	@echo "  Backend:  http://localhost:8000"
	@echo "  API Docs: http://localhost:8000/docs"
	@echo "  Docs:     http://localhost:8081"
	@echo ""
	@echo "Run 'make logs' to view logs"

# Nuclear rebuild: stop, remove old images, rebuild both containers from
# scratch with no layer cache. Use this when UI changes aren't showing up.
# Also forces you to hard-refresh the browser — nginx is configured to
# send no-cache on index.html so a simple reload is enough going forward.
rebuild:
	docker compose down --rmi local --remove-orphans || true
	docker compose build --no-cache
	docker compose up -d
	@echo ""
	@echo "Fresh rebuild complete."
	@echo "  Frontend: http://localhost  (hard-refresh the browser: Cmd+Shift+R)"
	@echo "  Backend:  http://localhost:8000"
	@echo "  Docs:     http://localhost:8081"
	@echo ""

stop:
	docker compose down

logs:
	docker compose logs -f

clean:
	docker compose down -v --rmi local
	@echo "Cleaned up containers and images"

# === Development Commands ===

dev:
	@echo "Starting development environment..."
	@echo "Backend: Docker | Frontend: npm dev server"
	@echo ""
	docker compose up -d --build backend
	@echo "Waiting for backend..."
	@sleep 5
	@curl -s http://localhost:8000/health > /dev/null && echo "Backend ready!" || echo "Backend starting..."
	@echo ""
	@echo "Starting frontend dev server..."
	cd frontend && npm run dev

# Local Postgres + backend, for exercising the cloud path without
# leaving the laptop. docker-compose.dev.yml has advertised this target
# in its header since it was written; it did not exist until 2026-08-04.
# Also the quickest way to get a Postgres for the dual-dialect tests:
#   TEST_POSTGRES_URL=postgresql://scheduler:scheduler@localhost:5433/scheduler pytest
dev-postgres:
	docker compose -f docker-compose.dev.yml up -d --build

dev-postgres-stop:
	docker compose -f docker-compose.dev.yml down

# === End-to-end tests (Playwright) ===

test-e2e-install:
	cd e2e && npm install && npx playwright install --with-deps chromium

test-e2e:
	cd e2e && npm install --silent && npx playwright test

test-e2e-rebuild:
	cd e2e && npm install --silent && E2E_REBUILD=1 npx playwright test

test-e2e-dev:
	cd e2e && npm install --silent && E2E_BASE_URL=http://localhost:5173 E2E_MANAGE_STACK=0 npx playwright test

# === Tournament simulator (internal dev tool) ===
# Full-tournament workflow simulation over the real HTTP API. NOT part of
# 'make check' or CI — see simulator/README.md for the boundary rules.

SCENARIO ?= small-meet
SEED ?= 42
SIM_URL ?= http://localhost:8600
FORMAT ?= se

sim:
	PYTHONPATH=simulator python -m tournament_sim run --scenario $(SCENARIO) --seed $(SEED) --base-url $(SIM_URL) --format $(FORMAT)

sim-ephemeral:
	PYTHONPATH=simulator python -m tournament_sim run --scenario $(SCENARIO) --seed $(SEED) --ephemeral --format $(FORMAT)

sim-all:
	PYTHONPATH=simulator python -m tournament_sim run --scenario small-meet --seed $(SEED) --ephemeral
	PYTHONPATH=simulator python -m tournament_sim run --scenario full-meet --seed $(SEED) --ephemeral
	PYTHONPATH=simulator python -m tournament_sim run --scenario bracket --format se --seed $(SEED) --ephemeral
	PYTHONPATH=simulator python -m tournament_sim run --scenario bracket --format rr --seed $(SEED) --ephemeral
	PYTHONPATH=simulator python -m tournament_sim run --scenario bracket --format swiss --seed $(SEED) --ephemeral
	PYTHONPATH=simulator python -m tournament_sim run --scenario bracket --format monrad --seed $(SEED) --ephemeral
	PYTHONPATH=simulator python -m tournament_sim run --scenario bracket --format compass --seed $(SEED) --ephemeral
	PYTHONPATH=simulator python -m tournament_sim run --scenario bracket --format de --seed $(SEED) --ephemeral
	PYTHONPATH=simulator python -m tournament_sim run --scenario mixed --seed $(SEED) --ephemeral
	PYTHONPATH=simulator python -m tournament_sim run --scenario chaos --seed $(SEED) --ephemeral

sim-test:
	cd simulator && pytest

# === API contract generation ===

# Regenerate the frontend's TS DTOs from the FastAPI OpenAPI schema.
# Imports the FastAPI app directly via tools/generate_openapi.py — no
# running backend required, so the target is safe to run in CI.
#
# Contract types in frontend/src/api/dto.ts are the curated view of
# the auto-generated dto.generated.ts: when schemas.py changes, run
# this target, inspect the diff in dto.generated.ts, and reconcile
# dto.ts by hand. Frontend-private types (SSE events, internal enums)
# stay in dto.ts and are NOT touched by this target.
generate-api:
	@echo "Dumping OpenAPI schema..."
	@python tools/generate_openapi.py frontend/src/api/.openapi.json
	@echo "Generating frontend/src/api/dto.generated.ts..."
	@cd frontend && npx openapi-typescript ./src/api/.openapi.json --output ./src/api/dto.generated.ts
	@rm frontend/src/api/.openapi.json
	@echo "Done. Inspect 'git diff frontend/src/api/dto.generated.ts'."
