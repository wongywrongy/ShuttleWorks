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
	@echo "  make check              Run all local checks (lint, types, vitest, depcruise, ruff, pytest)"
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
#
# Two different variables, one per surface — do not swap them:
#   VITE_API_PROXY_TARGET  operator SPA only (frontend/vite.config.ts dev proxy)
#   API_BASE_URL           entrant SSR server only (entrant/app/lib/apiFetch.server.ts,
#                          which THROWS when it is unset)
# Ports are passed as `--port`, the only thing either dev server reads; a
# PORT env var is ignored and the loser of a race silently increments.
#
# `local-dev` backgrounds with `&`, so it needs a POSIX shell: run it from
# Git Bash (or any shell where GNU Make finds sh.exe on PATH). Under cmd.exe
# `&` sequences instead of backgrounding and the first server blocks forever.

entrant-dev:  ## Run the PUBLIC entrant site (SSR) at :5174 against a host backend on :8600
	API_BASE_URL=http://localhost:8600 npm run dev:entrant -- --port 5174

local-dev:  ## Run BOTH surfaces: operator product :5173 + public entrant site :5174
	@echo "Backend must already be running on :8600 — see docs/getting-started."
	@echo "  operator product     http://localhost:5173"
	@echo "  public entrant site  http://localhost:5174"
	VITE_API_PROXY_TARGET=http://localhost:8600 npm run dev:scheduler -- --port 5173 & \
	API_BASE_URL=http://localhost:8600 npm run dev:entrant -- --port 5174

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
# The entrant tier is a SEPARATE invocation because it needs a separate step:
# its `typecheck` runs `react-router typegen` first, and without the generated
# route types `tsc` there is meaningless. Root already exposes it for CI.
	cd products/scheduler/frontend && npx tsc -b
	npm run typecheck:entrant
	npm --prefix products/scheduler/frontend run test:run
	npm run depcruise
	ruff check products/scheduler scheduler_core
	cd products/scheduler && pytest
	@echo ""
	@echo "--- docs freshness (advisory — never fails the gate) ---"
	-npm run docs:freshness
