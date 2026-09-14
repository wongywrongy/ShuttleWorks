#!/usr/bin/env bash
set -euo pipefail

sw_mfa_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$sw_mfa_root"
sw_mfa_fixture="$(mktemp -d /tmp/sw-operator-mfa.XXXXXX)"
sw_mfa_api_pid=''
sw_mfa_console_pid=''
cleanup() {
  if [ -n "$sw_mfa_console_pid" ]; then kill "$sw_mfa_console_pid" 2>/dev/null || true; fi
  if [ -n "$sw_mfa_api_pid" ]; then kill "$sw_mfa_api_pid" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  rm -rf "$sw_mfa_fixture"
}
trap cleanup EXIT
read -r sw_mfa_api_port sw_mfa_console_port < <(.venv/bin/python - <<'PY'
import socket
with socket.socket() as api, socket.socket() as console:
    api.bind(('127.0.0.1', 0))
    console.bind(('127.0.0.1', 0))
    print(api.getsockname()[1], console.getsockname()[1])
PY
)
export E2E_MFA_FIXTURE_DB="$sw_mfa_fixture/mfa.db"
export DATABASE_URL="sqlite:///$E2E_MFA_FIXTURE_DB"
export DATA_DIR="$sw_mfa_fixture"
export MFA_KEYRING_FILE="$sw_mfa_fixture/keys.json"
export AUTH_MODE=cloud ENVIRONMENT=local SHUTTLEWORKS_DEPLOYMENT_PROFILE=local
export EMAIL_BACKEND=console EMBEDDED_WORKER=false PROCESS_ROLE=api
export E2E_MANAGE_STACK=0 E2E_BASE_URL="http://127.0.0.1:$sw_mfa_console_port"
export VITE_API_PROXY_TARGET="http://127.0.0.1:$sw_mfa_api_port"
.venv/bin/python tools/operator-mfa-keyring.py create "$MFA_KEYRING_FILE" > "$sw_mfa_fixture/key.log"
npm --prefix apps/console run build
.venv/bin/python -m uvicorn core.main:app --app-dir apps/api/src --host 127.0.0.1 --port "$sw_mfa_api_port" > "$sw_mfa_fixture/api.log" 2>&1 &
sw_mfa_api_pid=$!
node node_modules/vite/bin/vite.js preview apps/console --host 127.0.0.1 --port "$sw_mfa_console_port" --strictPort > "$sw_mfa_fixture/console.log" 2>&1 &
sw_mfa_console_pid=$!
for sw_mfa_attempt in $(seq 1 60); do
  if ! kill -0 "$sw_mfa_api_pid" 2>/dev/null || ! kill -0 "$sw_mfa_console_pid" 2>/dev/null; then
    cat "$sw_mfa_fixture/api.log" "$sw_mfa_fixture/console.log"
    exit 1
  fi
  if curl --fail --silent "$E2E_BASE_URL/api/health" >/dev/null; then break; fi
  sleep 1
done
npm --prefix tests/e2e run test:operator-mfa
