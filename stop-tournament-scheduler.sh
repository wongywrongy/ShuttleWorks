#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "Stopping Tournament Scheduler…"
[ -f "docker-compose.release.yml" ] && docker compose -f docker-compose.release.yml down || true
docker compose -f docker-compose.yml down || true
echo "Stopped."
