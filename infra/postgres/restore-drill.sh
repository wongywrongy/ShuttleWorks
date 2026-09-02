#!/usr/bin/env bash
set -Eeuo pipefail

# Non-destructive restore-drill checklist. It never restores over a live
# database. Use DRY_RUN=0 only with an isolated target database/host.
DRY_RUN="${DRY_RUN:-1}"
TARGET="${RESTORE_DRILL_TARGET:-}"
STANZA="${PGBACKREST_STANZA:-shuttleworks}"

[[ "$DRY_RUN" == "0" || "$DRY_RUN" == "1" ]] || { echo "DRY_RUN must be 0 or 1" >&2; exit 2; }
[[ "$DRY_RUN" == "1" || -n "$TARGET" ]] || { echo "RESTORE_DRILL_TARGET is required outside dry-run" >&2; exit 2; }

echo "Verify latest backup and WAL archive for stanza=$STANZA"
if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY-RUN: pgbackrest --stanza=$STANZA check"
  echo "DRY-RUN: restore to an isolated clean target=$TARGET"
  echo "DRY-RUN: run migrations, /health/ready, representative read/export checks"
  echo "DRY-RUN: destroy only the isolated drill target and record row/hash evidence"
  exit 0
fi

# The live path still refuses a production-looking target. An operator must
# supply an explicitly isolated target name, not the primary database name.
[[ "$TARGET" != "scheduler" && "$TARGET" != "production" ]] || {
  echo "refusing restore drill target that looks live" >&2
  exit 2
}
pgbackrest --stanza="$STANZA" check
echo "Restore commands are intentionally delegated to the isolated host/runbook: target=$TARGET"
