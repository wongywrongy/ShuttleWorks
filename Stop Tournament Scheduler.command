#!/usr/bin/env bash
# Stop the running Tournament Scheduler containers. Double-click to run.
set -euo pipefail
cd "$(dirname "$0")"

echo "Stopping Tournament Scheduler…"

if [ -f "docker-compose.release.yml" ]; then
    docker compose -f docker-compose.release.yml down || true
fi
docker compose -f docker-compose.yml down || true

echo "Stopped."
echo "Press Enter to close this window…"
read -r _
