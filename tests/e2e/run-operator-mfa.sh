#!/usr/bin/env bash
set -euo pipefail

sw_mfa_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$sw_mfa_root"
# CI installs the API into the runner's interpreter; locally it is the repo venv.
sw_python="${SW_PYTHON:-.venv/bin/python}"
case "$sw_python" in
  */*) E2E_PYTHON="$(cd "$(dirname "$sw_python")" && pwd)/$(basename "$sw_python")" ;;
  *) E2E_PYTHON="$(command -v "$sw_python")" ;;
esac
export E2E_PYTHON  # absolute: Playwright runs from tests/e2e
sw_mfa_fixture="$(mktemp -d /tmp/sw-operator-mfa.XXXXXX)"
sw_mfa_pids=()
cleanup() {
  for sw_mfa_pid in "${sw_mfa_pids[@]}"; do kill "$sw_mfa_pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  rm -rf "$sw_mfa_fixture"
}
trap cleanup EXIT
wait_for() {  # url, then the pids that must stay alive, then their logs
  local url="$1"; shift
  for sw_mfa_attempt in $(seq 1 60); do
    for sw_mfa_pid in "${sw_mfa_pids[@]}"; do
      if ! kill -0 "$sw_mfa_pid" 2>/dev/null; then cat "$sw_mfa_fixture"/*.log; exit 1; fi
    done
    if curl --fail --silent "$url" >/dev/null; then return 0; fi
    sleep 1
  done
  cat "$sw_mfa_fixture"/*.log
  exit 1
}
read -r sw_mfa_api_port sw_mfa_console_port sw_node_api_port sw_node_console_port < <("$sw_python" - <<'PY'
import socket
sockets = [socket.socket() for _ in range(4)]
for s in sockets:
    s.bind(('127.0.0.1', 0))
print(*(s.getsockname()[1] for s in sockets))
for s in sockets:
    s.close()
PY
)

# ---- Cloud phase: AUTH_MODE=cloud, one disposable SQLite database ---------
export E2E_MFA_FIXTURE_DB="$sw_mfa_fixture/mfa.db"
export DATABASE_URL="sqlite:///$E2E_MFA_FIXTURE_DB"
export DATA_DIR="$sw_mfa_fixture"
export MFA_KEYRING_FILE="$sw_mfa_fixture/keys.json"
export AUTH_MODE=cloud ENVIRONMENT=local SHUTTLEWORKS_DEPLOYMENT_PROFILE=local
export EMAIL_BACKEND=console EMBEDDED_WORKER=false PROCESS_ROLE=api
export E2E_MANAGE_STACK=0 E2E_BASE_URL="http://127.0.0.1:$sw_mfa_console_port"
"$sw_python" tools/operator-mfa-keyring.py create "$MFA_KEYRING_FILE" > "$sw_mfa_fixture/key.log"
npm --prefix apps/console run build
"$sw_python" -m uvicorn core.main:app --app-dir apps/api/src --host 127.0.0.1 --port "$sw_mfa_api_port" > "$sw_mfa_fixture/api.log" 2>&1 &
sw_mfa_pids+=($!)
VITE_API_PROXY_TARGET="http://127.0.0.1:$sw_mfa_api_port" \
  node node_modules/vite/bin/vite.js preview apps/console --host 127.0.0.1 --port "$sw_mfa_console_port" --strictPort > "$sw_mfa_fixture/console.log" 2>&1 &
sw_mfa_pids+=($!)
wait_for "$E2E_BASE_URL/api/health"

# ---- Event-node phase: its own database, node id and key ring ------------
# The node API refuses anonymous bootstrap, so the only way in is the real
# individual activation: a checked-out workspace, an active authority epoch for
# this node, and a one-use file from the local administrator tool.
sw_node_dir="$sw_mfa_fixture/node"
mkdir -m 700 "$sw_node_dir"
sw_node_id="$("$sw_python" -c 'import uuid; print(uuid.uuid4())')"
sw_node_env=(
  DATABASE_URL="sqlite:///$sw_node_dir/node.db" DATA_DIR="$sw_node_dir"
  MFA_KEYRING_FILE="$sw_node_dir/keys.json" AUTH_MODE=local ENVIRONMENT=local
  SHUTTLEWORKS_DEPLOYMENT_PROFILE=event_node SHUTTLEWORKS_NODE_ID="$sw_node_id"
  AUTHORITY_SIGNING_PUBLIC_KEY_FILE="$sw_node_dir/trust.pem" NODE_SIGNING_KEY_FILE="$sw_node_dir/node.pem"
)
"$sw_python" tools/operator-mfa-keyring.py create "$sw_node_dir/keys.json" > "$sw_mfa_fixture/node-key.log"
env "${sw_node_env[@]}" PROCESS_ROLE=api \
  "$sw_python" -m uvicorn core.main:app --app-dir apps/api/src --host 127.0.0.1 --port "$sw_node_api_port" > "$sw_mfa_fixture/node-api.log" 2>&1 &
sw_mfa_pids+=($!)
wait_for "http://127.0.0.1:$sw_node_api_port/health"
sw_node_seed="$(env "${sw_node_env[@]}" PROCESS_ROLE=admin "$sw_python" - <<'PY'
import os, sys, uuid
sys.path.insert(0, 'apps/api/src')
from core.tokens import _hash_token
from db.models import Tournament, TournamentAuthority, TournamentMember, User
from db.session import SessionLocal
user_id, workspace_id = uuid.uuid4(), uuid.uuid4()
with SessionLocal() as session:
    session.add(User(id=user_id, email=f"node-{user_id.hex[:8]}@example.test"))
    session.add(Tournament(id=workspace_id, name="Event-node MFA journey", data={}, schema_version=1))
    session.flush()
    session.add(TournamentMember(tournament_id=workspace_id, user_id=user_id, role="operator"))
    session.add(TournamentAuthority(tournament_id=workspace_id, epoch=1, node_id=uuid.UUID(os.environ["SHUTTLEWORKS_NODE_ID"]),
        state="active", checkpoint_hash="a" * 64, checkpoint_schema_version=1,
        capability_digest=_hash_token(uuid.uuid4().hex)))
    session.commit()
print(workspace_id, user_id)
PY
)"
read -r sw_node_workspace sw_node_operator <<<"$sw_node_seed"
export E2E_NODE_ACTIVATION_FILE="$sw_node_dir/activation.json"
env "${sw_node_env[@]}" "$sw_python" tools/node-operator-enrollment.py \
  --workspace "$sw_node_workspace" --operator "$sw_node_operator" --output "$E2E_NODE_ACTIVATION_FILE" > /dev/null
export E2E_NODE_BASE_URL="http://127.0.0.1:$sw_node_console_port"
VITE_API_PROXY_TARGET="http://127.0.0.1:$sw_node_api_port" \
  node node_modules/vite/bin/vite.js preview apps/console --host 127.0.0.1 --port "$sw_node_console_port" --strictPort > "$sw_mfa_fixture/node-console.log" 2>&1 &
sw_mfa_pids+=($!)
wait_for "$E2E_NODE_BASE_URL/api/health"

npm --prefix tests/e2e run test:operator-mfa
