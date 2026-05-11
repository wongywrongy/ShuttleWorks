.PHONY: help \
        scheduler scheduler-dev scheduler-rebuild \
        tournament tournament-dev tournament-rebuild \
        both stop stop-scheduler stop-tournament \
        logs logs-scheduler logs-tournament \
        ps clean \
        test test-scheduler test-tournament test-e2e \
        engine-readme

# Default target — list everything.
help:
	@echo "Monorepo entry point — pick a product."
	@echo ""
	@echo "Scheduler (day-of operator tool, ports 80 / 8000):"
	@echo "  make scheduler          Build + start the scheduler stack"
	@echo "  make scheduler-dev      Backend in Docker, Vite dev server on :5173"
	@echo "  make scheduler-rebuild  Nuclear --no-cache rebuild of the scheduler"
	@echo "  make stop-scheduler     Stop the scheduler stack"
	@echo "  make logs-scheduler     Tail scheduler container logs"
	@echo ""
	@echo "Tournament (bracket draws, ports 5174 / 8765):"
	@echo "  make tournament         Build + start the tournament stack"
	@echo "  make tournament-dev     Hot-reload stack (Vite + uvicorn --reload)"
	@echo "  make tournament-rebuild Nuclear --no-cache rebuild of the tournament"
	@echo "  make stop-tournament    Stop the tournament stack"
	@echo "  make logs-tournament    Tail tournament container logs"
	@echo ""
	@echo "Both at once:"
	@echo "  make both               Bring up both products side-by-side"
	@echo "  make stop               Stop both"
	@echo "  make ps                 Show running containers for both"
	@echo ""
	@echo "Tests:"
	@echo "  make test-scheduler     Run scheduler pytest suite"
	@echo "  make test-tournament    Run tournament pytest suite (Docker)"
	@echo "  make test-e2e           Run scheduler Playwright e2e (boots stack)"
	@echo "  make test               test-scheduler + test-tournament"
	@echo ""
	@echo "Misc:"
	@echo "  make clean              Down + remove images / volumes for both"
	@echo "  make engine-readme      Open the shared scheduler_core/ README"

# === Scheduler product ===

scheduler:
	$(MAKE) -C products/scheduler run

scheduler-dev:
	$(MAKE) -C products/scheduler dev

scheduler-rebuild:
	$(MAKE) -C products/scheduler rebuild

stop-scheduler:
	$(MAKE) -C products/scheduler stop

logs-scheduler:
	$(MAKE) -C products/scheduler logs

test-scheduler:
	cd products/scheduler && pytest

test-e2e:
	$(MAKE) -C products/scheduler test-e2e

# === Tournament product ===

tournament:
	$(MAKE) -C products/tournament up

tournament-dev:
	$(MAKE) -C products/tournament dev

tournament-rebuild:
	$(MAKE) -C products/tournament rebuild

stop-tournament:
	$(MAKE) -C products/tournament down

logs-tournament:
	$(MAKE) -C products/tournament logs

test-tournament:
	$(MAKE) -C products/tournament test

# === Both at once ===

both:
	$(MAKE) scheduler
	$(MAKE) tournament

stop:
	$(MAKE) stop-scheduler || true
	$(MAKE) stop-tournament || true

ps:
	@echo "=== scheduler (btp) ==="
	@cd products/scheduler && docker compose ps || true
	@echo ""
	@echo "=== tournament ==="
	@cd products/tournament && docker compose ps || true

logs:
	@echo "Pass a specific target: make logs-scheduler or make logs-tournament"

# === Tests ===

test: test-scheduler test-tournament

# === Cleanup ===

clean:
	-$(MAKE) -C products/scheduler clean
	-$(MAKE) -C products/tournament clean

engine-readme:
	@$${PAGER:-less} scheduler_core/README.md
