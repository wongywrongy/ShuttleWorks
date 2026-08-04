.PHONY: help \
        scheduler scheduler-dev scheduler-rebuild \
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
	@echo "  make stop               Stop the stack"
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

stop:
	$(MAKE) -C products/scheduler stop

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

engine-readme:
	@$${PAGER:-less} scheduler_core/README.md

# === Local CI checks ===

check:
	npm run lint:scheduler
	npm --prefix products/scheduler/frontend run test:run
	npm run depcruise
	ruff check products/scheduler scheduler_core
	cd products/scheduler && pytest
