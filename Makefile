.PHONY: help \
        scheduler scheduler-dev scheduler-rebuild \
        entrant-dev local-dev \
        stop logs ps clean \
        test test-e2e check \
        sim sim-ephemeral sim-all sim-test \
        engine-readme

# Default target — list everything.
help:
	@echo "ShuttleWorks scheduler — meets + bracket draws on one stack."
	@echo ""
	@echo "Run:"
	@echo "  make scheduler          Build + start the scheduler stack"
	@echo "                          (frontend :80, backend :8000, docs :8081)"
	@echo "  make scheduler-dev      Backend in Docker, Vite dev server on :5173"
	@echo "  make scheduler-rebuild  Nuclear --no-cache rebuild"
	@echo "  make entrant-dev        Public entrant site (SSR) on :5174 against a host backend on :8600"
	@echo "  make local-dev          Both surfaces at once: operator :5173 + entrant :5174"
	@echo "                          (local only — see docs/getting-started/running-locally)"
	@echo "  make stop               Stop the dev-facing stacks (default, dev, cloud)"
	@echo "  make logs               Tail container logs"
	@echo "  make ps                 Show running containers"
	@echo ""
	@echo "Tests:"
	@echo "  make test               Run scheduler pytest suite"
	@echo "  make test-e2e           Run scheduler Playwright e2e (boots stack)"
	@echo "  make check              Run all local checks (lint, vitest, depcruise, ruff, pytest)"
	@echo ""
	@echo "Tournament simulator (internal dev tool, not in CI):"
	@echo "  make sim                Run a scenario vs a running backend (SCENARIO=, SEED=, SIM_URL=)"
	@echo "  make sim-ephemeral      Same, against an isolated throwaway backend"
	@echo "  make sim-all            Every scenario + all bracket formats (ephemeral)"
	@echo "  make sim-test           Simulator's own pytest (boundary guard + smoke)"
	@echo ""
	@echo "Misc:"
	@echo "  make clean              Down + remove images / volumes"
	@echo ""
	@echo "  Server stacks are started explicitly and NOT touched by stop/clean:"
	@echo "    docker compose -f products/scheduler/docker-compose.selfhost.yml ..."
	@echo "    docker compose -f products/scheduler/docker-compose.worker.yml ..."
	@echo "  make engine-readme      Open the shared scheduler_core/ README"
	@echo ""
	@echo "The legacy ``make tournament`` target was retired in the"
	@echo "backend-merge arc (PR 4). Bracket draws now live in the Bracket"
	@echo "tab of the scheduler shell — boot via ``make scheduler``."

# === Scheduler product ===

scheduler:
	$(MAKE) -C products/scheduler run

scheduler-dev:
	$(MAKE) -C products/scheduler dev

scheduler-rebuild:
	$(MAKE) -C products/scheduler rebuild

# === Entrant product (public SSR site) ===
#
# Local only — no nginx, no compose, no tunnel. See
# docs/getting-started/running-locally.md for the full recipe and the
# Docker-stack trap (the SPA's /api proxy defaults to :8000, exactly where
# the Docker backend listens, so a host backend on :8600 goes silently
# unused unless the stack is stopped first).

entrant-dev:  ## Run the PUBLIC entrant site (SSR) at :5174 against a host backend on :8600
	VITE_API_PROXY_TARGET=http://localhost:8600 PORT=5174 npm run dev:entrant

local-dev:  ## Run BOTH surfaces: operator product :5173 + public entrant site :5174
	@echo "Backend must already be running on :8600 — see docs/getting-started."
	@echo "  operator product     http://localhost:5173"
	@echo "  public entrant site  http://localhost:5174"
	npm run dev:scheduler & npm run dev:entrant

# `stop` covers the stacks a developer actually starts on this machine.
# The selfhost and worker stacks run on servers, are started with an
# explicit -f, and are listed in `help` rather than torn down from here:
# a `make stop` that reaches into a production stack is a footgun, not a
# convenience. Leading `-` so a stack that was never up is not an error.
stop:
	$(MAKE) -C products/scheduler stop
	-cd products/scheduler && docker compose -f docker-compose.dev.yml down
	-cd products/scheduler && docker compose -f docker-compose.cloud.yml down

logs:
	$(MAKE) -C products/scheduler logs

ps:
	@cd products/scheduler && docker compose ps || true

# === Tests ===

test:
	cd products/scheduler && pytest

test-e2e:
	$(MAKE) -C products/scheduler test-e2e

# === Tournament simulator (internal dev tool) ===

sim:
	$(MAKE) -C products/scheduler sim

sim-ephemeral:
	$(MAKE) -C products/scheduler sim-ephemeral

sim-all:
	$(MAKE) -C products/scheduler sim-all

sim-test:
	$(MAKE) -C products/scheduler sim-test

# === Cleanup ===

clean:
	-$(MAKE) -C products/scheduler clean
	-cd products/scheduler && docker compose -f docker-compose.dev.yml down -v
	-cd products/scheduler && docker compose -f docker-compose.cloud.yml down -v

engine-readme:
	@$${PAGER:-less} scheduler_core/README.md

# === Local CI checks ===

check:
	npm run lint:scheduler
	npm --prefix products/scheduler/frontend run test:run
	npm run depcruise
	ruff check products/scheduler scheduler_core
	cd products/scheduler && pytest
	@echo ""
	@echo "--- docs freshness (advisory — never fails the gate) ---"
	-npm run docs:freshness
