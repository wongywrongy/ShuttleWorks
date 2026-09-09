#!/usr/bin/env bash
# Serve generated surface-book artifacts privately over the host's Tailscale IP.
# This helper manages only the dedicated read-only nginx container.
set -euo pipefail

container_name=${SURFACE_BOOKS_CONTAINER:-shuttleworks-surface-books}
listen_port=${SURFACE_BOOKS_PORT:-8093}
image=${SURFACE_BOOKS_IMAGE:-nginxinc/nginx-unprivileged:alpine}
ownership_label=com.shuttleworks.surface-books
ownership_value=managed
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
nginx_conf="$repo_root/tools/surface-books.nginx.conf"

usage() {
  cat >&2 <<'EOF'
usage: tools/serve-surface-books.sh COMMAND ARTIFACT_DIR

Commands: up, down, status, url
The artifact directory is mounted read-only at nginx's document root.
Set SURFACE_BOOKS_TAILSCALE_IP when automatic Tailscale discovery is unavailable.
EOF
}

if [[ $# -ne 2 ]]; then usage; exit 2; fi
command_name=$1
artifact_dir_input=$2

if [[ ! -d "$artifact_dir_input" ]]; then
  echo "Artifact directory does not exist: $artifact_dir_input" >&2; exit 1
fi
artifact_dir=$(realpath -e -- "$artifact_dir_input")
case "$artifact_dir" in
  /|"$HOME"|"$repo_root")
    echo "Refusing to serve a broad root directory: $artifact_dir" >&2; exit 1 ;;
esac
if [[ ! -e "$artifact_dir/operator-console-surface-book.pdf" &&
      ! -e "$artifact_dir/public-entrant-surface-book.pdf" ]]; then
  echo "Artifact directory must contain an operator or public PDF surface book." >&2
  exit 1
fi
if [[ ! -r "$nginx_conf" ]]; then
  echo "Missing nginx configuration: $nginx_conf" >&2; exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to serve surface books." >&2; exit 1
fi

container_exists() {
  docker container inspect "$container_name" >/dev/null 2>&1
}

require_owned_container() {
  local actual
  actual=$(docker inspect --format "{{ index .Config.Labels \"$ownership_label\" }}" "$container_name" 2>/dev/null || true)
  if [[ "$actual" != "$ownership_value" ]]; then
    echo "Refusing to modify unowned container $container_name (label $ownership_label=$actual)." >&2
    exit 1
  fi
}

if [[ "$command_name" == down ]]; then
  if container_exists; then
    require_owned_container
    docker rm -f "$container_name" >/dev/null
  fi
  exit 0
fi
if [[ "$command_name" == status ]]; then
  docker container inspect --format '{{.Name}} {{.State.Status}} {{.Config.Image}}' "$container_name" 2>/dev/null || echo "$container_name absent"
  exit 0
fi

tailscale_ip=${SURFACE_BOOKS_TAILSCALE_IP:-}
if [[ -z "$tailscale_ip" ]]; then
  command -v tailscale >/dev/null 2>&1 || { echo "Tailscale is required; set SURFACE_BOOKS_TAILSCALE_IP." >&2; exit 1; }
  tailscale_ip=$(tailscale ip -4 2>/dev/null | awk 'NR == 1 { print; exit }')
fi
if ! awk -F. '
  NF == 4 {
    for (i = 1; i <= 4; i++) {
      if ($i !~ /^[0-9]+$/ || length($i) > 3 || $i > 255 || (length($i) > 1 && substr($i, 1, 1) == "0")) exit 1
    }
    if ($1 == 100 && $2 >= 64 && $2 <= 127) ok = 1
  }
  END { exit(ok ? 0 : 1) }
' <<< "$tailscale_ip"; then
  echo "Refusing non-Tailscale IPv4 bind: ${tailscale_ip:-<none>}" >&2; exit 1
fi
if ! awk -v port="$listen_port" 'BEGIN { exit(port ~ /^[0-9]+$/ && port >= 1 && port <= 65535 ? 0 : 1) }'; then
  echo "Refusing invalid listen port: $listen_port" >&2; exit 1
fi

case "$command_name" in
  url) echo "http://$tailscale_ip:$listen_port/" ;;
  up)
    if container_exists; then
      require_owned_container
      docker rm -f "$container_name" >/dev/null
    fi
    docker run -d \
      --name "$container_name" \
      --label "$ownership_label=$ownership_value" \
      --restart unless-stopped \
      --publish "$tailscale_ip:$listen_port:8080" \
      --mount "type=bind,src=$artifact_dir,dst=/usr/share/nginx/html,readonly" \
      --mount "type=bind,src=$nginx_conf,dst=/etc/nginx/conf.d/default.conf,readonly" \
      "$image" nginx -g 'daemon off;' >/dev/null
    echo "Serving $artifact_dir at http://$tailscale_ip:$listen_port/"
    ;;
  *) usage; exit 2 ;;
esac
