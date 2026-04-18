#!/usr/bin/env bash
# Tournament Scheduler launcher for macOS.
#
# Double-click this file in Finder to start the app. A terminal window
# opens with progress logs; leave it open while the tournament runs.
# Use "Stop Tournament Scheduler.command" (or just close this window)
# to shut everything down.
set -euo pipefail

# Jump to the directory this script lives in — Finder launches with $HOME
# as the working directory otherwise.
cd "$(dirname "$0")"

echo "🏸  Tournament Scheduler"
echo "   $(pwd)"
echo

if ! command -v docker >/dev/null 2>&1; then
    osascript <<'OSA' >/dev/null 2>&1 || true
display dialog "Docker isn't installed.

Tournament Scheduler runs inside Docker so it works the same on every machine. Install Docker Desktop, then run this launcher again." buttons {"Open Docker Website", "Cancel"} default button "Open Docker Website" with icon caution
if button returned of result is "Open Docker Website" then
    do shell script "open https://www.docker.com/products/docker-desktop/"
end if
OSA
    echo "Docker not found — install Docker Desktop and try again."
    echo "Press Enter to close this window…"
    read -r _
    exit 1
fi

# Pick the release compose file if it's present (pulls pre-built images),
# otherwise fall back to the dev compose file (builds locally).
if [ -f "docker-compose.release.yml" ]; then
    COMPOSE_FILE="docker-compose.release.yml"
    echo "Using pre-built images (docker-compose.release.yml)."
else
    COMPOSE_FILE="docker-compose.yml"
    echo "Using local build (docker-compose.yml)."
fi

echo "Starting containers…"
docker compose -f "$COMPOSE_FILE" up -d

echo
echo "Waiting for the app to become ready (this can take ~30s on first run)…"
for i in $(seq 1 60); do
    if curl -sf http://localhost:8000/health/deep | grep -q '"status":"healthy"'; then
        echo "Ready."
        open "http://localhost"
        echo
        echo "🎾  Tournament Scheduler is running at http://localhost"
        echo "    Leave this window open during the tournament."
        echo "    To stop: run 'Stop Tournament Scheduler.command' or close this window."
        # Hold the terminal open so the user can see status until they close it.
        while docker compose -f "$COMPOSE_FILE" ps --quiet backend >/dev/null 2>&1; do
            sleep 10
        done
        exit 0
    fi
    sleep 1
done

echo
echo "❌  Timed out waiting for the backend to become healthy."
echo "    Try: docker compose -f $COMPOSE_FILE logs backend"
echo "Press Enter to close this window…"
read -r _
exit 1
