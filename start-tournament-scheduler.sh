#!/usr/bin/env bash
# Tournament Scheduler launcher for Linux.
# Run from this folder:  ./start-tournament-scheduler.sh
set -euo pipefail

cd "$(dirname "$0")"

echo "🏸  Tournament Scheduler"
echo

if ! command -v docker >/dev/null 2>&1; then
    if command -v zenity >/dev/null 2>&1; then
        zenity --warning --title="Docker not found" \
            --text="Tournament Scheduler runs in Docker. Install Docker Engine first: https://docs.docker.com/engine/install/" \
            >/dev/null 2>&1 || true
    fi
    echo "Docker not found — install Docker Engine and try again."
    exit 1
fi

COMPOSE_FILE="docker-compose.yml"
[ -f "docker-compose.release.yml" ] && COMPOSE_FILE="docker-compose.release.yml"
echo "Using $COMPOSE_FILE."

echo "Starting containers…"
docker compose -f "$COMPOSE_FILE" up -d

echo
echo "Waiting for the app to become ready…"
for i in $(seq 1 60); do
    if curl -sf http://localhost:8000/health/deep | grep -q '"status":"healthy"'; then
        echo "Ready."
        if command -v xdg-open >/dev/null 2>&1; then
            xdg-open "http://localhost" >/dev/null 2>&1 || true
        fi
        echo
        echo "🎾  Running at http://localhost"
        echo "    Stop with: ./stop-tournament-scheduler.sh"
        exit 0
    fi
    sleep 1
done

echo
echo "❌  Timed out. Try: docker compose -f $COMPOSE_FILE logs backend"
exit 1
