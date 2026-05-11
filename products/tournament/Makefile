.PHONY: help up dev down logs ps clean rebuild test bare-backend bare-frontend

# Default target prints help.
help:
	@echo "Tournament Prototype — Docker workflow"
	@echo ""
	@echo "  make up        Build + start prod-style stack (frontend + backend)"
	@echo "                 Frontend: http://localhost:\$${FRONTEND_HOST_PORT:-5174}"
	@echo "                 Backend:  http://localhost:\$${BACKEND_HOST_PORT:-8765}"
	@echo "  make dev       Start stack with hot reload (source-mounted, foreground)"
	@echo "  make down      Stop + remove containers"
	@echo "  make rebuild   Stop, drop images, rebuild --no-cache, start fresh"
	@echo "  make logs      Tail container logs"
	@echo "  make ps        Show running containers"
	@echo "  make clean     Down + remove volumes + remove project images"
	@echo "  make test      Run pytest inside the backend container"
	@echo ""
	@echo "Bare-metal (no Docker):"
	@echo "  make bare-backend   .venv/bin/uvicorn on host port 8765"
	@echo "  make bare-frontend  vite dev on host port 5173 (proxies to 8765)"

# Docker-Compose workflow
up:
	docker compose up -d --build

dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

down:
	docker compose down

rebuild:
	docker compose down
	docker compose build --no-cache
	docker compose up -d

logs:
	docker compose logs -f

ps:
	docker compose ps

clean:
	docker compose down -v --rmi local

# Run the test suite inside the backend container — useful to confirm
# container parity with the host's bare-metal pytest run. The dev
# override mounts the source tree (including tests/) into /app so the
# slim prod image doesn't need to ship the test directory.
test:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --no-deps backend pytest tests

# Bare-metal fallbacks (no Docker daemon required)
bare-backend:
	.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload

bare-frontend:
	cd frontend && npm run dev
