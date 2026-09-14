#!/usr/bin/env bash
# Validate every fragment with native nginx and isolated CI stub dependencies.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
check_dir=$(mktemp -d)
trap 'rm -rf -- "$check_dir"' EXIT
nginx_image=nginxinc/nginx-unprivileged@sha256:2ddec616f1cb58bcac057aa388f28cb81e35137641ef4226d321714499329bd1
mkdir -p "$check_dir/wrappers" "$check_dir/tls"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$check_dir/tls/server.key" \
  -out "$check_dir/tls/server.crt" -days 1 -subj /CN=nginx-check.invalid >/dev/null 2>&1
# This ephemeral test certificate contains no production credential.
chmod 755 "$check_dir" "$check_dir/wrappers" "$check_dir/tls"
chmod 644 "$check_dir/tls/server.key"
for conf in "$repo_dir"/infra/nginx/*.conf; do
  name=${conf##*/}
  {
    echo 'pid /tmp/nginx.pid; error_log stderr; events {} http {'
    case "$name" in
      console.conf|play.conf) echo 'include /etc/nginx/snippets/http-shared.conf;' ;;
      security-headers.conf) echo 'include /etc/nginx/snippets/http-shared.conf; server { listen 8080;' ;;
    esac
    echo "include /etc/nginx/snippets/$name;"
    if [ "$name" = security-headers.conf ]; then echo '}'; fi
    echo '}'
  } > "$check_dir/wrappers/$name"
  echo "Checking infra/nginx/$name"
  docker run --rm --network none \
    --add-host backend:127.0.0.1 --add-host entrant:127.0.0.1 --add-host frontend:127.0.0.1 \
    -v "$repo_dir/infra/nginx:/etc/nginx/snippets:ro" \
    -v "$check_dir/wrappers:/check:ro" -v "$check_dir/tls:/run/shuttleworks/tls:ro" \
    --entrypoint nginx "$nginx_image" -t -c "/check/$name"
done
python3 "$repo_dir/tools/check-nginx-runtime.py" "$check_dir"
