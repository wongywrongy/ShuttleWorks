#!/usr/bin/env bash
# Tailscale-only launcher for the disposable production-shaped tech demo.
#
# This file intentionally owns address discovery and Compose environment in
# one place so every target (up/status/down/reset) addresses the same project
# and data directory. It is invoked through `bash` by the Makefile, so
# executable-bit drift cannot make the documented targets fail.

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: $0 {ip|up|rebuild|status|down|reset}" >&2
  exit 2
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
compose=(
  docker compose
  -f "$repo_root/infra/compose/docker-compose.yml"
  -f "$repo_root/infra/compose/demo.override.yml"
)

demo_ip="${DEMO_TAILSCALE_IP:-}"
if [[ -z "$demo_ip" ]]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "Tailscale is required for the demo (tailscale command not found)." >&2
    exit 1
  fi
  demo_ip=$(tailscale ip -4 2>/dev/null | awk 'NR == 1 { print; exit }')
fi

# Tailscale IPv4 addresses are allocated from 100.64.0.0/10. Requiring the
# tailnet range prevents a typo from turning a demo start into a LAN/public
# bind. DEMO_TAILSCALE_IP is an explicit testing/administration override, but
# it is subject to the same guard.
if ! awk -F. '
  NF == 4 && $1 == 100 && $2 >= 64 && $2 <= 127 &&
  $3 >= 0 && $3 <= 255 && $4 >= 0 && $4 <= 255
  { print 1 }
' <<< "$demo_ip" | grep -qx 1; then
  echo "Could not determine a Tailscale IPv4 address (got: ${demo_ip:-<none>})." >&2
  echo "Set DEMO_TAILSCALE_IP to this host's 100.64.0.0/10 address if needed." >&2
  exit 1
fi

demo_data_dir="${DEMO_DATA_DIR:-$repo_root/.local-testing/demo/data}"
# The demo is intentionally disposable and local to this checkout. Resolve
# existing symlinks and missing path components before checking the boundary;
# this prevents an override such as `data/demo/../../..` or a symlink from
# making reset move an unrelated directory.
data_root=$(realpath -m -- "$repo_root/data")
local_testing_root=$(realpath -m -- "$repo_root/.local-testing/demo")
demo_data_dir=$(realpath -m -- "$demo_data_dir")
case "$demo_data_dir" in
  "$data_root"/*|"$local_testing_root"/*) ;;
  *)
    echo "DEMO_DATA_DIR must be below $data_root or $local_testing_root (got: $demo_data_dir)." >&2
    exit 1
    ;;
esac

compose_env=(
  env
  COMPOSE_PROJECT_NAME=shuttleworks-demo
  DEMO_TAILSCALE_IP="$demo_ip"
  DEMO_DATA_DIR="$demo_data_dir"
  DEMO_HOST_GID="$(id -g)"
)

run_compose() {
  "${compose_env[@]}" "${compose[@]}" "$@"
}

case "$1" in
  ip)
    echo "$demo_ip"
    ;;
  up)
    shift
    mkdir -p "$demo_data_dir"
    run_compose up -d --build --wait --wait-timeout 180 backend entrant frontend "$@"
    cat <<EOF

ShuttleWorks Tailscale tech demo is starting.
  Operator console: http://$demo_ip:8090
  Entrant site:     http://$demo_ip:8091/e/
  API:              http://$demo_ip:8092
  API docs:         http://$demo_ip:8092/docs
  Data:             $demo_data_dir

Use 'make demo-status' to check readiness and 'make demo-down' to stop it.
EOF
    ;;
  rebuild)
    run_compose down --remove-orphans
    mkdir -p "$demo_data_dir"
    run_compose build --no-cache backend entrant frontend
    run_compose up -d --wait --wait-timeout 180 backend entrant frontend
    ;;
  status)
    run_compose ps
    echo ""
    echo "Demo URLs (Tailscale: $demo_ip):"
    echo "  Operator console: http://$demo_ip:8090"
    echo "  Entrant site:     http://$demo_ip:8091/e/"
    echo "  API:              http://$demo_ip:8092"
    ;;
  down)
    run_compose down --remove-orphans
    ;;
  reset)
    run_compose down --remove-orphans
    if [[ -e "$demo_data_dir" ]]; then
      archive_dir="${demo_data_dir}.archive-$(date -u +%Y%m%dT%H%M%SZ)"
      mv -- "$demo_data_dir" "$archive_dir"
      echo "Archived demo data at $archive_dir"
    fi
    mkdir -p "$demo_data_dir"
    echo "Demo data reset. Run 'make demo-up' to start with an empty database."
    ;;
  *)
    echo "unknown demo command: $1" >&2
    echo "usage: $0 {ip|up|rebuild|status|down|reset}" >&2
    exit 2
    ;;
esac
