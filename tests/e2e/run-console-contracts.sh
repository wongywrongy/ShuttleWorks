#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# This job's fixture is now generalised in tools/fixture-up.sh (v3
# consolidated plan work package 01) so the console-browser-contracts CI job
# and a developer's `make fixture-up` build the SAME Taipei/Korea database
# instead of two hand-maintained copies. The behaviour CI depends on is
# unchanged: a fresh SQLite db, the frozen clock, T029+T030 seeded through
# the HTTP API, a viewer invite, the row-count structural check, and a
# console preview server — then this Playwright suite, then teardown.
#
# Two deliberate differences from a bare `tools/fixture-up.sh` run:
#   - FIXTURE_APPLY_DEFECTS=0 — the post-seed defects pass adds a
#     supplementary entry/entry-event and a second bracket result, which
#     would move the exact row counts tests/e2e/check-console-fixture.py
#     pins. This job wants the pristine seed only.
#   - FIXTURE_SKIP_ENTRANT=1 — this suite drives the console only; standing
#     up the entrant SSR server here would be pure overhead for a job that
#     never navigates to it.
export FIXTURE_API_PORT="${CONSOLE_FIXTURE_API_PORT:-8600}"
export FIXTURE_CONSOLE_PORT="${CONSOLE_FIXTURE_CONSOLE_PORT:-4173}"
export FIXTURE_SEED_KEY="console-browser"
export FIXTURE_APPLY_DEFECTS=0
export FIXTURE_SKIP_ENTRANT=1
export FIXTURE_SKIP_CONSOLE_BUILD="${CONSOLE_CONTRACTS_SKIP_BUILD:-0}"
export FIXTURE_KEEP="${CONSOLE_FIXTURE_KEEP:-0}"

exec "${REPO_ROOT}/tools/fixture-up.sh" -- \
  npm --prefix "${REPO_ROOT}/tests/e2e" run test:console-contracts
