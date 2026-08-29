.PHONY: help \
        scheduler scheduler-dev scheduler-rebuild \
        demo-up demo-rebuild demo-status demo-down demo-reset \
        demo-seed-preview demo-seed-apply demo-seed-resume demo-seed-status demo-seed-reset \
        entrant-dev full-dev local-dev \
        dev-postgres dev-postgres-stop \
        stop logs ps clean \
        test test-e2e test-e2e-install test-e2e-rebuild test-e2e-dev check check-full check-fast \
        sim sim-ephemeral sim-all sim-test \
        generate-api engine-readme

# SP-REORG-1 Phase 1 folded the former products/scheduler/Makefile into this
# file. There is no product directory left to delegate into, and the two-level
# arrangement had stopped paying for itself long before that: every target here
# was a one-line `$(MAKE) -C` forward to a target with a different name, so the
# name a developer typed and the name that failed were never the same name.
#
# Compose files live in infra/compose/ and are always addressed with an
# explicit -f. Compose resolves build contexts, bind mounts and secret files
# relative to the FILE, not to the working directory, so these run correctly
# from anywhere in the tree.
COMPOSE       := docker compose -f infra/compose/docker-compose.yml
COMPOSE_DEV   := docker compose -f infra/compose/docker-compose.dev.yml
COMPOSE_CLOUD := docker compose -f infra/compose/docker-compose.cloud.yml
DEMO_COMPOSE := bash tools/demo-compose.sh
DEMO_SEED_FILE := simulator/fixtures/bwf-recent-completed.txt
DEMO_SEED_NOTES := simulator/fixtures/bwf-recent-completed-notes.txt
DEMO_SEED_SOURCE_MAP := simulator/fixtures/bwf-full-match-sources.json
DEMO_SEED_KEY ?= bwf-recent
DEMO_SEED_RUN_DIR := .local-testing/demo/data/import-runs
DEMO_SEED := PYTHONPATH=simulator .venv/bin/python -m tournament_sim seed
DEMO_MATCH_DATA ?=
DEMO_JAPAN_RESULTS ?=
DEMO_CHINA_RESULTS ?=
DEMO_SEED_SOURCE_ARGS = $(if $(DEMO_MATCH_DATA),--match-data $(DEMO_MATCH_DATA)) \
	$(if $(DEMO_JAPAN_RESULTS),--daily-results T027=$(DEMO_JAPAN_RESULTS)) \
	$(if $(DEMO_CHINA_RESULTS),--daily-results T028=$(DEMO_CHINA_RESULTS)) \
	--source-map $(DEMO_SEED_SOURCE_MAP)

# Every Python tree ruff is expected to lint. Spelled out rather than `.`
# because pyproject.toml now sits at the repo root, so a bare `ruff check .`
# would walk archive/ and node_modules looking for reasons to fail.
PY_SOURCES := apps/api tests/backend tests/e2e simulator tools packages/scheduler-core

# Default target — list everything.
help:
	@echo "ShuttleWorks scheduler — meets + bracket draws on one stack."
	@echo ""
	@echo "Run:"
	@echo "  make scheduler          Build + start the scheduler stack"
	@echo "                          (console :80, api :8000, entrant :8081, docs :8082)"
	@echo "  make scheduler-dev      API in Docker, Vite dev server on :5173"
	@echo "  make scheduler-rebuild  Nuclear --no-cache rebuild"
	@echo "  make demo-up            Start the Tailscale-only tech demo"
	@echo "  make demo-rebuild       Rebuild and restart the tech demo"
	@echo "  make demo-status        Show tech demo container status and URLs"
	@echo "  make demo-down          Stop the tech demo"
	@echo "  make demo-reset         Archive demo data and start clean"
	@echo "  make demo-seed-preview  Validate the bundled BWF historical fixture"
	@echo "  make demo-seed-apply    Import the fixture into the running demo"
	@echo "  make demo-seed-status   Show the resumable import manifest"
	@echo "  make demo-seed-resume   Resume an interrupted fixture import"
	@echo "  make demo-seed-reset    Delete only workspaces owned by this seed run"
	@echo "  make entrant-dev        Public entrant site (SSR) on :5174 against a host API on :8600"
	@echo "  make full-dev           Both surfaces at once: operator :5173 + entrant :5174"
	@echo "                          (local only — see docs/how-to/running-locally)"
	@echo "  make dev-postgres       Local Postgres + API (exercise the cloud path)"
	@echo "  make stop               Stop the dev-facing stacks (default, dev, cloud)"
	@echo "  make logs               Tail container logs"
	@echo "  make ps                 Show running containers"
	@echo ""
	@echo "Tests:"
	@echo "  make test               Run the backend pytest suite"
	@echo "  make test-e2e           Run entrant evidence against the managed compose stack"
	@echo "  make test-e2e-dev       Run entrant evidence against dev origins (requires 'make full-dev')"
	@echo "  make check              Run the complete local check gate"
	@echo "  make check-full         Alias for the complete local check gate"
	@echo "  make check-fast         Run the fast local feedback checks"
	@echo ""
	@echo "Tournament simulator (internal dev tool, not in CI):"
	@echo "  make sim                Run a scenario vs a running API (SCENARIO=, SEED=, SIM_URL=)"
	@echo "  make sim-ephemeral      Same, against an isolated throwaway API"
	@echo "  make sim-all            Every scenario + all bracket formats (ephemeral)"
	@echo "  make sim-test           Simulator's own pytest (boundary guard + smoke)"
	@echo ""
	@echo "Misc:"
	@echo "  make generate-api       Regenerate apps/console/src/api/dto.generated.ts from the OpenAPI schema"
	@echo "  make clean              Down + remove images / volumes"
	@echo "  make engine-readme      Open the shared scheduler_core README"
	@echo ""
	@echo "  Server stacks are started explicitly and NOT touched by stop/clean:"
	@echo "    docker compose -f infra/compose/docker-compose.selfhost.yml ..."
	@echo "    docker compose -f infra/compose/docker-compose.worker.yml ..."

# === The scheduler stack (Docker) ===

scheduler:
	$(COMPOSE) up -d --build
	@echo ""
	@echo "Application starting..."
	@echo "  Console:  http://localhost"
	@echo "  API:      http://localhost:8000"
	@echo "  API docs: http://localhost:8000/docs"
	@echo "  Entrant:  http://localhost:8081"
	@echo "  Docs:     http://localhost:8082"
	@echo ""
	@echo "Run 'make logs' to view logs"

# Nuclear rebuild: stop, remove old images, rebuild from scratch with no layer
# cache. Use this when UI changes aren't showing up. Also forces a browser
# hard-refresh — nginx sends no-cache on index.html so a reload suffices after.
scheduler-rebuild:
	$(COMPOSE) down --rmi local --remove-orphans || true
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d
	@echo ""
	@echo "Fresh rebuild complete."
	@echo "  Console: http://localhost  (hard-refresh the browser: Cmd+Shift+R)"
	@echo "  API:     http://localhost:8000"
	@echo ""

# === Tailscale tech demo (production-shaped, disposable data) ===
#
# The launcher refuses to start without a 100.x Tailscale address and passes
# that address to Compose as the host bind address. The demo therefore never
# publishes its ports on the LAN or public interfaces. It uses the same
# backend/frontend/entrant images as the normal scheduler stack, but a
# separate Compose project and .local-testing/demo/data directory.

demo-up:
	$(DEMO_COMPOSE) up

demo-rebuild:
	$(DEMO_COMPOSE) rebuild

demo-status:
	$(DEMO_COMPOSE) status

demo-down:
	$(DEMO_COMPOSE) down

demo-reset:
	$(DEMO_COMPOSE) reset

demo-seed-preview:
	@$(DEMO_SEED) preview $(DEMO_SEED_FILE) --notes $(DEMO_SEED_NOTES) $(DEMO_SEED_SOURCE_ARGS)

demo-seed-apply:
	@$(DEMO_SEED) apply $(DEMO_SEED_FILE) --notes $(DEMO_SEED_NOTES) --seed-key $(DEMO_SEED_KEY) \
		$(DEMO_SEED_SOURCE_ARGS) --run-dir $(DEMO_SEED_RUN_DIR) --base-url http://$$($(DEMO_COMPOSE) ip):8092

demo-seed-resume:
	@$(DEMO_SEED) resume $(DEMO_SEED_FILE) --notes $(DEMO_SEED_NOTES) --seed-key $(DEMO_SEED_KEY) \
		$(DEMO_SEED_SOURCE_ARGS) --run-dir $(DEMO_SEED_RUN_DIR) --base-url http://$$($(DEMO_COMPOSE) ip):8092

demo-seed-status:
	@$(DEMO_SEED) status --seed-key $(DEMO_SEED_KEY) --run-dir $(DEMO_SEED_RUN_DIR)

demo-seed-reset:
	@$(DEMO_SEED) reset --seed-key $(DEMO_SEED_KEY) --confirm $(DEMO_SEED_KEY) \
		--run-dir $(DEMO_SEED_RUN_DIR) --base-url http://$$($(DEMO_COMPOSE) ip):8092

scheduler-dev:
	@echo "Starting development environment..."
	@echo "API: Docker | Console: npm dev server"
	@echo ""
	$(COMPOSE) up -d --build backend
	@echo "Waiting for the API..."
	@sleep 5
	@curl -s http://localhost:8000/health > /dev/null && echo "API ready!" || echo "API starting..."
	@echo ""
	@echo "Starting the console dev server..."
	npm run dev:scheduler

# Local Postgres + API, for exercising the cloud path without leaving the
# laptop. Also the quickest way to get a Postgres for the dual-dialect tests:
#   TEST_POSTGRES_URL=postgresql://scheduler:scheduler@localhost:5433/scheduler pytest
dev-postgres:
	$(COMPOSE_DEV) up -d --build

dev-postgres-stop:
	$(COMPOSE_DEV) down

# === Entrant tier (public SSR site) ===
#
# Local only — no nginx, no compose, no tunnel. See
# docs/how-to/running-locally.md for the full recipe and the
# Docker-stack trap (the SPA's /api proxy defaults to :8000, exactly where
# the Docker API listens, so a host API on :8600 goes silently unused
# unless the stack is stopped first).
#
# Two different variables, one per surface — do not swap them:
#   VITE_API_PROXY_TARGET  operator SPA only (apps/console/vite.config.ts dev proxy)
#   API_BASE_URL           entrant SSR server only (apps/entrant/app/lib/apiFetch.server.ts,
#                          which THROWS when it is unset)
# Ports are passed as `--port`, the only thing either dev server reads; a
# PORT env var is ignored and the loser of a race silently increments.
#
# `local-dev` backgrounds with `&`, so it needs a POSIX shell: run it from
# Git Bash (or any shell where GNU Make finds sh.exe on PATH). Under cmd.exe
# `&` sequences instead of backgrounding and the first server blocks forever.

entrant-dev:  ## Run the PUBLIC entrant site (SSR) at :5174 against a host API on :8600
	API_BASE_URL=http://localhost:8600 npm run dev:entrant -- --port 5174

local-dev:  ## Run BOTH surfaces: operator console :5173 + public entrant site :5174
	@echo "The API must already be running on :8600 — see docs/how-to/running-locally.md."
	@echo "  operator console     http://localhost:5173"
	@echo "  public entrant site  http://localhost:5174"
	VITE_API_PROXY_TARGET=http://localhost:8600 npm run dev:scheduler -- --port 5173 & \
	API_BASE_URL=http://localhost:8600 npm run dev:entrant -- --port 5174

# Explicit name used by the e2e developer runner and current docs. Keep the
# old local-dev spelling as a compatibility alias for existing checkouts.
full-dev: local-dev

# `stop` covers the stacks a developer actually starts on this machine.
# The selfhost and worker stacks run on servers, are started with an
# explicit -f, and are listed in `help` rather than torn down from here:
# a `make stop` that reaches into a production stack is a footgun, not a
# convenience. Leading `-` so a stack that was never up is not an error.
stop:
	-$(COMPOSE) down
	-$(COMPOSE_DEV) down
	-$(COMPOSE_CLOUD) down

logs:
	$(COMPOSE) logs -f

ps:
	@$(COMPOSE) ps || true

# === Tests ===

test:
	pytest

test-e2e-install:
	cd tests/e2e && npm install && npx playwright install --with-deps chromium

test-e2e:
	cd tests/e2e && FRONTEND_HOST_PORT=8090 PLAY_HOST_PORT=8091 DOCS_HOST_PORT=8092 E2E_BASE_URL=http://localhost:8090 E2E_PLAY_BASE_URL=http://localhost:8091 npm run test:entrant-evidence

test-e2e-rebuild:
	cd tests/e2e && FRONTEND_HOST_PORT=8090 PLAY_HOST_PORT=8091 DOCS_HOST_PORT=8092 E2E_BASE_URL=http://localhost:8090 E2E_PLAY_BASE_URL=http://localhost:8091 E2E_REBUILD=1 npm run test:entrant-evidence

test-e2e-dev:
	cd tests/e2e && E2E_BASE_URL=http://localhost:5173 E2E_PLAY_BASE_URL=http://localhost:5174 E2E_MANAGE_STACK=0 npm run test:entrant-evidence

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
#
# Regenerate the console's TS DTOs from the FastAPI OpenAPI schema. Imports
# the FastAPI app directly via tools/generate_openapi.py — no running API
# required, so the target is safe to run in CI.
#
# Contract types in apps/console/src/api/dto.ts are the curated view of the
# auto-generated dto.generated.ts: when schemas.py changes, run this target,
# inspect the diff in dto.generated.ts, and reconcile dto.ts by hand.
# Console-private types (SSE events, internal enums) stay in dto.ts and are
# NOT touched by this target.
generate-api:
	@echo "Dumping OpenAPI schema..."
	@python tools/generate_openapi.py apps/console/src/api/.openapi.json
	@echo "Generating apps/console/src/api/dto.generated.ts..."
	@cd apps/console && npx openapi-typescript ./src/api/.openapi.json --output ./src/api/dto.generated.ts
	@rm apps/console/src/api/.openapi.json
	@echo "Done. Inspect 'git diff apps/console/src/api/dto.generated.ts'."

# === Cleanup ===

clean:
	-$(COMPOSE) down -v --rmi local
	-$(COMPOSE_DEV) down -v
	-$(COMPOSE_CLOUD) down -v
	@echo "Cleaned up containers and images"

engine-readme:
	@$${PAGER:-less} packages/scheduler-core/scheduler_core/README.md

# === Local CI checks ===

check: check-full

check-full:
	npm run lint:scheduler
# The TYPE gate, and the reason it is spelled out here rather than left to
# `npm run build`. Until 2026-08-10 `make check` ran lint, vitest, depcruise,
# ruff and pytest and NO build — so it structurally could not catch a
# TypeScript error, while CLAUDE.md advertised it as "all local checks at
# once". A `tsc` break reached a branch through exactly that hole. CI does
# catch it (the interaction-smoke job runs `npm run build`, and `build` is
# `tsc -b && vite build`), so this closes a local/CI divergence, not a CI hole.
#
# `tsc -b` and not `npm run build`: the type check is the half that gates, the
# bundle is not, and `make check` is run often enough that the difference is
# felt (~7 s cold, near-nothing incrementally — `tsc -b` writes a
# .tsbuildinfo). `npx` rather than a new package.json script, because the
# command already exists inside `build` and a second declaration of it is a
# second thing to keep in step.
#
	cd apps/console && npx tsc -b
	npm --prefix apps/console run test:run
	npm run depcruise
# The entrant tier, and why it is four lines of its own rather than folded into
# the three above. It is a separate npm workspace with its own eslint config,
# its own vitest project and its own dependency-cruiser ruleset (server-only
# boundaries the console has no concept of), so every one of its gates is a
# separate invocation — nothing here is a duplicate of a console command.
#
# `typecheck` in particular cannot be merged into the `tsc -b` above: it runs
# `react-router typegen` first, and without the generated route types the type
# check there is meaningless.
#
# Only that typecheck was wired in until 2026-08-22 — `make check` typechecked
# the entrant tier and never linted, tested or boundary-checked it. That is the
# same hole the type gate above closed, one tier over: CI has run all four since
# the tier shipped (the `entrant` job), so an entrant-tier regression was
# invisible locally and surfaced only on push. Root already exposes each one for
# that job; these reuse them rather than declaring the commands a second time.
	npm run lint:entrant
	npm run typecheck:entrant
	npm run test:entrant
	npm run depcruise:entrant
	ruff check $(PY_SOURCES)
# The API's architecture contracts. Run from apps/api/src because that is the
# sys.path root the packages import from (R4: src is a ROOT, not a package);
# the config file stays beside the app at apps/api/.importlinter. Placed before
# pytest so a boundary break reports in seconds instead of after the ten-minute
# suite.
	cd apps/api/src && lint-imports --config ../.importlinter
	pytest
	@echo ""
	@echo "--- docs paths + build (blocking) ---"
	npm run test:docs
	npm run docs:paths
	npm run docs:build
	@echo "--- docs freshness (advisory — never fails the gate) ---"
	-npm run docs:freshness

# Fast local feedback keeps the complete gate's command coverage visible while
# replacing the entrant SSR tier and full backend suite with their iteration
# sized counterparts.
check-fast:
	npm run lint:scheduler
	cd apps/console && npx tsc -b
	npm --prefix apps/console run test:run
	npm run depcruise
	npm run lint:entrant
	npm run typecheck:entrant
	npm run test:entrant:unit
	npm run depcruise:entrant
	ruff check $(PY_SOURCES)
	cd apps/api/src && lint-imports --config ../.importlinter
	pytest tests/backend/unit -m 'not slow'
	@echo ""
	@echo "--- docs paths + build (blocking) ---"
	npm run test:docs
	npm run docs:paths
	npm run docs:build
	@echo "--- docs freshness (advisory — never fails the gate) ---"
	-npm run docs:freshness
