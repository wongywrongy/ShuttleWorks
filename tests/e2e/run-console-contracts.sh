#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="${PYTHON_BIN}"
elif [[ -x "${REPO_ROOT}/.venv/bin/python" ]]; then
  PYTHON_BIN="${REPO_ROOT}/.venv/bin/python"
else
  PYTHON_BIN="python3"
fi
API_PORT="${CONSOLE_FIXTURE_API_PORT:-8600}"
CONSOLE_PORT="${CONSOLE_FIXTURE_CONSOLE_PORT:-4173}"
API_URL="http://127.0.0.1:${API_PORT}"
CONSOLE_URL="http://127.0.0.1:${CONSOLE_PORT}"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/shuttleworks-console-contracts.XXXXXX")"
touch "${FIXTURE_ROOT}/.console-contract-fixture"
DATABASE_PATH="${FIXTURE_ROOT}/console-contracts.db"
RUN_DIR="${FIXTURE_ROOT}/import-runs"
MANIFEST_PATH="${RUN_DIR}/console-browser.json"
FIXTURE_JSON="${FIXTURE_ROOT}/fixture.json"
API_PID=""
CONSOLE_PID=""

cleanup() {
  if [[ -n "${CONSOLE_PID}" ]]; then kill "${CONSOLE_PID}" 2>/dev/null || true; fi
  if [[ -n "${API_PID}" ]]; then kill "${API_PID}" 2>/dev/null || true; fi
  if [[ "${CONSOLE_FIXTURE_KEEP:-0}" == "1" ]]; then
    echo "kept console fixture at ${FIXTURE_ROOT}"
  elif [[ -f "${FIXTURE_ROOT}/.console-contract-fixture" && "$(basename "${FIXTURE_ROOT}")" == shuttleworks-console-contracts.* ]]; then
    rm -rf -- "${FIXTURE_ROOT}"
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "${RUN_DIR}" "${FIXTURE_ROOT}/data"
export DATABASE_URL="sqlite:///${DATABASE_PATH}"
export BACKEND_DATA_DIR="${FIXTURE_ROOT}/data"
export ENVIRONMENT="local"
export AUTH_MODE="local"
export SHUTTLEWORKS_DEMO_NOW="2026-07-31T05:15:00+00:00"

echo "Creating disposable migrated database: ${DATABASE_PATH}"
(
  cd "${REPO_ROOT}/apps/api"
  "${PYTHON_BIN}" -m alembic upgrade head
  "${PYTHON_BIN}" -m alembic check
)

(
  cd "${REPO_ROOT}/apps/api/src"
  exec "${PYTHON_BIN}" -m uvicorn core.main:app \
    --host 127.0.0.1 --port "${API_PORT}" --log-level warning
) >"${FIXTURE_ROOT}/api.log" 2>&1 &
API_PID=$!

for _attempt in $(seq 1 60); do
  if curl -fsS "${API_URL}/health/ready" >/dev/null; then break; fi
  sleep 1
done
if ! curl -fsS "${API_URL}/health/ready" >/dev/null; then
  echo "backend failed to start; log follows" >&2
  sed -n '1,240p' "${FIXTURE_ROOT}/api.log" >&2
  exit 1
fi

echo "Seeding canonical Taipei and Korea fixtures through the HTTP API"
PYTHONPATH="${REPO_ROOT}/simulator" "${PYTHON_BIN}" -m tournament_sim seed apply \
  "${REPO_ROOT}/simulator/fixtures/bwf-recent-completed.txt" \
  --notes "${REPO_ROOT}/simulator/fixtures/bwf-recent-completed-notes.txt" \
  --source-map "${REPO_ROOT}/simulator/fixtures/bwf-full-match-sources.json" \
  --tournament T029 --tournament T030 \
  --seed-key console-browser --run-dir "${RUN_DIR}" --base-url "${API_URL}" \
  >"${FIXTURE_ROOT}/seed-output.json"

PYTHONPATH="${REPO_ROOT}/simulator" "${PYTHON_BIN}" \
  "${REPO_ROOT}/tests/e2e/prepare-console-fixture.py" \
  --base-url "${API_URL}" --manifest "${MANIFEST_PATH}" --output "${FIXTURE_JSON}"
"${PYTHON_BIN}" "${REPO_ROOT}/tests/e2e/check-console-fixture.py" \
  --database "${DATABASE_PATH}" --manifest "${MANIFEST_PATH}"

if [[ "${CONSOLE_CONTRACTS_SKIP_BUILD:-0}" != "1" ]]; then
  echo "Building the console with the runtime-error harness"
  (
    cd "${REPO_ROOT}/apps/console"
    VITE_ERROR_HARNESS=1 VITE_API_BASE_URL=/api npm run build
  )
fi

(
  cd "${REPO_ROOT}/apps/console"
  VITE_API_PROXY_TARGET="${API_URL}" exec node \
    "${REPO_ROOT}/node_modules/vite/bin/vite.js" preview \
    --port "${CONSOLE_PORT}" --strictPort --host 127.0.0.1
) >"${FIXTURE_ROOT}/console.log" 2>&1 &
CONSOLE_PID=$!

for _attempt in $(seq 1 45); do
  if curl -fsS "${CONSOLE_URL}/" >/dev/null; then break; fi
  sleep 1
done
if ! curl -fsS "${CONSOLE_URL}/" >/dev/null; then
  echo "console preview failed to start; log follows" >&2
  sed -n '1,240p' "${FIXTURE_ROOT}/console.log" >&2
  exit 1
fi

json_value() {
  "${PYTHON_BIN}" -c \
    'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))[sys.argv[2]])' \
    "${FIXTURE_JSON}" "$1"
}

export E2E_BASE_URL="${CONSOLE_URL}"
export E2E_MANAGE_STACK="0"
export E2E_TAIPEI_TID="$(json_value taipeiTid)"
export E2E_KOREA_TID="$(json_value koreaTid)"
export E2E_DISPLAY_TOKEN="$(json_value displayToken)"
export E2E_VIEWER_EMAIL="$(json_value viewerEmail)"
export E2E_VIEWER_PASSWORD="$(json_value viewerPassword)"

npm --prefix "${REPO_ROOT}/tests/e2e" run test:console-contracts
