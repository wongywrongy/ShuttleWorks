#!/usr/bin/env bash
# One reproducible tournament fixture for BOTH tiers — v3 consolidated plan
# work package 01 (docs/audits/v3-consolidated/plan.md §1 row 01).
#
# Generalises the console-only fixture that used to live entirely inside
# `tests/e2e/run-console-contracts.sh`: a disposable SQLite database, a
# frozen clock, the canonical T029 (Taipei, live)/T030 (Korea, upcoming)
# seed, a viewer invite, a structural row-count check, the console preview
# server, AND — new here — the entrant SSR server pointed at the same API,
# plus an idempotent post-seed "defects" pass that reconstructs a handful of
# known-messy operational states so both tiers can be reviewed against
# something closer to a live event than a pristine demo.
#
# Usage:
#   tools/fixture-up.sh                    # start everything, block until Ctrl-C, tear down
#   tools/fixture-up.sh -- some command...  # start everything, run the command, tear down
#
# `tests/e2e/run-console-contracts.sh` calls this script with
# FIXTURE_APPLY_DEFECTS=0 (defects would change bracket_results/entry_pages
# row counts that script's own check pins) and a trailing Playwright command,
# so its CI behaviour is unchanged.
#
# Env knobs (all optional):
#   FIXTURE_API_PORT           default 8600
#   FIXTURE_CONSOLE_PORT       default 4173
#   FIXTURE_ENTRANT_PORT       default 5174
#   FIXTURE_SEED_KEY           default "shared-fixture"
#   FIXTURE_APPLY_DEFECTS      default 1 — run tools/fixture-defects.py + its check
#   FIXTURE_SKIP_CONSOLE_BUILD default 0 — skip `npm run build` (reuse a prior build)
#   FIXTURE_SKIP_ENTRANT       default 0 — skip starting the entrant SSR server entirely
#   FIXTURE_CHECK_ACCOUNT_JOURNEYS default 1 — run tests/e2e/check-account-journeys.py
#                              (work package 23: signup/confirm/login/reset over real HTTP)
#   FIXTURE_KEEP               default 0 — keep the temp dir on exit (debugging)
#   PYTHON_BIN                 default .venv/bin/python, else python3
set -euo pipefail

# A leading `--` (as in `tools/fixture-up.sh -- some command...`) is purely
# documentation at the call site; strip it so `"$@"` below is the command.
if [[ "${1:-}" == "--" ]]; then
  shift
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="${PYTHON_BIN}"
elif [[ -x "${REPO_ROOT}/.venv/bin/python" ]]; then
  PYTHON_BIN="${REPO_ROOT}/.venv/bin/python"
else
  PYTHON_BIN="python3"
fi

API_PORT="${FIXTURE_API_PORT:-8600}"
CONSOLE_PORT="${FIXTURE_CONSOLE_PORT:-4173}"
ENTRANT_PORT="${FIXTURE_ENTRANT_PORT:-5174}"
SEED_KEY="${FIXTURE_SEED_KEY:-shared-fixture}"
APPLY_DEFECTS="${FIXTURE_APPLY_DEFECTS:-1}"
SKIP_CONSOLE_BUILD="${FIXTURE_SKIP_CONSOLE_BUILD:-0}"
SKIP_ENTRANT="${FIXTURE_SKIP_ENTRANT:-0}"
CHECK_ACCOUNT_JOURNEYS="${FIXTURE_CHECK_ACCOUNT_JOURNEYS:-1}"

API_URL="http://127.0.0.1:${API_PORT}"
CONSOLE_URL="http://127.0.0.1:${CONSOLE_PORT}"
ENTRANT_URL="http://127.0.0.1:${ENTRANT_PORT}"

FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/shuttleworks-fixture.XXXXXX")"
touch "${FIXTURE_ROOT}/.shuttleworks-fixture"
DATABASE_PATH="${FIXTURE_ROOT}/fixture.db"
RUN_DIR="${FIXTURE_ROOT}/import-runs"
MANIFEST_PATH="${RUN_DIR}/${SEED_KEY}.json"
FIXTURE_JSON="${FIXTURE_ROOT}/fixture.json"

API_PID=""
CONSOLE_PID=""
ENTRANT_PID=""

cleanup() {
  local status=$?
  if [[ -n "${ENTRANT_PID}" ]]; then kill "${ENTRANT_PID}" 2>/dev/null || true; fi
  if [[ -n "${CONSOLE_PID}" ]]; then kill "${CONSOLE_PID}" 2>/dev/null || true; fi
  if [[ -n "${API_PID}" ]]; then kill "${API_PID}" 2>/dev/null || true; fi
  if [[ -n "${FIXTURE_STATE_FILE:-}" ]]; then rm -f -- "${FIXTURE_STATE_FILE}"; fi
  if [[ "${FIXTURE_KEEP:-0}" == "1" ]]; then
    echo "kept fixture at ${FIXTURE_ROOT}"
  elif [[ -f "${FIXTURE_ROOT}/.shuttleworks-fixture" && "$(basename "${FIXTURE_ROOT}")" == shuttleworks-fixture.* ]]; then
    rm -rf -- "${FIXTURE_ROOT}"
  fi
  exit "${status}"
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

echo "Seeding canonical Taipei (T029, live) and Korea (T030, upcoming) fixtures through the HTTP API"
PYTHONPATH="${REPO_ROOT}/simulator" "${PYTHON_BIN}" -m tournament_sim seed apply \
  "${REPO_ROOT}/simulator/fixtures/bwf-recent-completed.txt" \
  --notes "${REPO_ROOT}/simulator/fixtures/bwf-recent-completed-notes.txt" \
  --source-map "${REPO_ROOT}/simulator/fixtures/bwf-full-match-sources.json" \
  --tournament T029 --tournament T030 \
  --seed-key "${SEED_KEY}" --run-dir "${RUN_DIR}" --base-url "${API_URL}" \
  >"${FIXTURE_ROOT}/seed-output.json"

PYTHONPATH="${REPO_ROOT}/simulator" "${PYTHON_BIN}" \
  "${REPO_ROOT}/tests/e2e/prepare-console-fixture.py" \
  --base-url "${API_URL}" --manifest "${MANIFEST_PATH}" --output "${FIXTURE_JSON}"

# The row-count gate runs against the PRISTINE seed, before the defects pass
# below adds a supplementary entry/entry-event and a second bracket result —
# both of which would move the exact counts this check pins.
"${PYTHON_BIN}" "${REPO_ROOT}/tests/e2e/check-console-fixture.py" \
  --database "${DATABASE_PATH}" --manifest "${MANIFEST_PATH}"

json_value() {
  "${PYTHON_BIN}" -c \
    'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))[sys.argv[2]])' \
    "${FIXTURE_JSON}" "$1"
}

if [[ "${SKIP_ENTRANT}" != "1" ]]; then
  echo "Starting the public entrant SSR server on :${ENTRANT_PORT} against ${API_URL}"
  (
    cd "${REPO_ROOT}/apps/entrant"
    API_BASE_URL="${API_URL}" SESSION_COOKIE_SECURE=false \
      exec npm run dev -- --port "${ENTRANT_PORT}" --strictPort --host 127.0.0.1
  ) >"${FIXTURE_ROOT}/entrant.log" 2>&1 &
  ENTRANT_PID=$!

  for _attempt in $(seq 1 60); do
    if curl -fsS "${ENTRANT_URL}/e/health" >/dev/null; then break; fi
    sleep 1
  done
  if ! curl -fsS "${ENTRANT_URL}/e/health" >/dev/null; then
    echo "entrant server failed to start; log follows" >&2
    sed -n '1,240p' "${FIXTURE_ROOT}/entrant.log" >&2
    exit 1
  fi
fi

if [[ "${CHECK_ACCOUNT_JOURNEYS}" == "1" ]]; then
  # v3 consolidated plan work package 23: API-level proof that signup,
  # confirmation, login and password-reset actually work against a real
  # running server with real mailed tokens (`console` email backend logged
  # into api.log above). Independent of ${SKIP_ENTRANT} — it drives
  # `/e/account/*` on the API directly, never the SSR pages — and of
  # ${APPLY_DEFECTS} — it only ever touches its own throwaway accounts, never
  # the seeded tournament rows the row-count gate and the defects pass care
  # about. Cheap: a handful of HTTP calls plus polling one log file, well
  # under a second in practice.
  echo "Checking account, confirmation and reset journeys against ${API_URL}"
  PYTHONPATH="${REPO_ROOT}/simulator" "${PYTHON_BIN}" \
    "${REPO_ROOT}/tests/e2e/check-account-journeys.py" \
    --base-url "${API_URL}" --api-log "${FIXTURE_ROOT}/api.log"
fi

if [[ "${APPLY_DEFECTS}" == "1" ]]; then
  echo "Applying the post-seed operational-defects pass (idempotent)"
  PYTHONPATH="${REPO_ROOT}/simulator" "${PYTHON_BIN}" \
    "${REPO_ROOT}/tools/fixture-defects.py" \
    --base-url "${API_URL}" --fixture "${FIXTURE_JSON}"

  # Direct-ORM pass (work package 01b): reconstructs the four bracket
  # court/scheduling states no HTTP write path can produce (debt-log
  # V3-01-2). Deliberately run with uvicorn still up, against the same
  # SQLite file: WAL journal mode (already enabled for every file-backed
  # engine by apps/api/src/db/session.py) lets this short, single-transaction
  # writer complete without blocking or being blocked by the running API,
  # and every read that follows (below, and in the console/entrant tiers)
  # goes through a fresh per-request session, so there is no in-process
  # cache to go stale. See tools/fixture-defects-db.py's module docstring
  # for exactly which of the four states are genuine writes vs. states this
  # fixture already contains naturally.
  "${PYTHON_BIN}" "${REPO_ROOT}/tools/fixture-defects-db.py" \
    --database "${DATABASE_PATH}" --fixture "${FIXTURE_JSON}"

  PYTHONPATH="${REPO_ROOT}/simulator" "${PYTHON_BIN}" \
    "${REPO_ROOT}/tests/e2e/check-fixture-defects.py" \
    --base-url "${API_URL}" --fixture "${FIXTURE_JSON}"
fi

if [[ "${SKIP_CONSOLE_BUILD}" != "1" ]]; then
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

# Record the ports/urls the caller needs into the SAME fixture.json the
# handle producer wrote above, so one file is the single source of truth
# for every id, credential and base URL a consumer (surface-books-fixture,
# a developer's browser tab, a follow-up script) needs.
"${PYTHON_BIN}" - "${FIXTURE_JSON}" "${CONSOLE_URL}" "${ENTRANT_URL}" "${API_URL}" "${SKIP_ENTRANT}" <<'PYEOF'
import json
import sys

path, console_url, entrant_url, api_url, skip_entrant = sys.argv[1:6]
data = json.loads(open(path, encoding="utf-8").read())
data["consoleBaseUrl"] = console_url
data["apiBaseUrl"] = api_url
data["entrantBaseUrl"] = None if skip_entrant == "1" else entrant_url
open(path, "w", encoding="utf-8").write(json.dumps(data, indent=2, sort_keys=True) + "\n")
PYEOF

export E2E_BASE_URL="${CONSOLE_URL}"
export E2E_MANAGE_STACK="0"
export E2E_TAIPEI_TID="$(json_value taipeiTid)"
export E2E_KOREA_TID="$(json_value koreaTid)"
export E2E_DISPLAY_TOKEN="$(json_value displayToken)"
export E2E_VIEWER_EMAIL="$(json_value viewerEmail)"
export E2E_VIEWER_PASSWORD="$(json_value viewerPassword)"
export FIXTURE_JSON

if [[ -n "${FIXTURE_STATE_FILE:-}" ]]; then
  # A stable pointer file so a caller that starts this script in the
  # background (`make fixture-up`) can find the fixture without parsing
  # this run's mktemp path — `make fixture-down`/`surface-books-fixture`
  # read it back.
  printf '{"pid": %s, "fixtureJson": "%s"}\n' "$$" "${FIXTURE_JSON}" >"${FIXTURE_STATE_FILE}"
fi

if [[ $# -gt 0 ]]; then
  echo "Fixture ready — running: $*"
  "$@"
  exit $?
fi

cat <<INFO

Fixture ready.
  console   ${CONSOLE_URL}
  entrant   $( [[ "${SKIP_ENTRANT}" == "1" ]] && echo "(skipped)" || echo "${ENTRANT_URL}/e/" )
  api       ${API_URL}
  fixture   ${FIXTURE_JSON}

Press Ctrl-C to tear down.
INFO

while true; do sleep 3600; done
