#!/usr/bin/env bash
set -Eeuo pipefail

# Fenced, manual DR checklist. It is deliberately a dry-run by default.
# This script never infers that the primary is dead from network reachability:
# a partition can leave both hosts writable. The operator must provide an
# independent fencing command/witness and an explicit approval token.

MODE="${1:-check}"
DRY_RUN="${DRY_RUN:-1}"
APPROVAL="${CONFIRM_FENCED_FAILOVER:-}"
FENCE_COMMAND="${FENCE_PRIMARY_COMMAND:-}"
PRIMARY="${PG_PRIMARY_HOST:-server-1.internal}"
STANDBY="${PG_STANDBY_HOST:-server-2.internal}"

say() { printf '%s\n' "$*"; }
die() { say "ERROR: $*" >&2; exit 2; }
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    say "DRY-RUN: $*"
  else
    "$@"
  fi
}

[[ "$MODE" =~ ^(check|failover|rejoin)$ ]] || die "usage: $0 [check|failover|rejoin]"
[[ "$DRY_RUN" == "0" || "$DRY_RUN" == "1" ]] || die "DRY_RUN must be 0 or 1"

say "ShuttleWorks PostgreSQL DR mode=$MODE primary=$PRIMARY standby=$STANDBY"
say "Server 2 is a standby, not a backup. Offsite pgBackRest/WAL archives remain required."
say "Automatic two-node promotion is disabled; this procedure requires fencing."

if [[ "$MODE" == "check" ]]; then
  say "CHECK: verify independent witness/fencing control exists."
  say "CHECK: verify latest pgBackRest full/differential backup and WAL archive are restorable."
  say "CHECK: verify replication lag, archive freshness, and application maintenance window."
  say "CHECK: confirm the standby is not receiving application writes."
  exit 0
fi

[[ -n "$FENCE_COMMAND" ]] || die "FENCE_PRIMARY_COMMAND is required; never promote on reachability alone"
[[ "$APPROVAL" == "I_UNDERSTAND_FENCED_DR" ]] || die "CONFIRM_FENCED_FAILOVER=I_UNDERSTAND_FENCED_DR is required"

if [[ "$MODE" == "failover" ]]; then
  say "STEP 1: fence primary through the independent witness/power-control system."
  run bash -lc "$FENCE_COMMAND"
  say "STEP 2: independently verify primary fencing and record evidence."
  run ssh "$STANDBY" "sudo -n systemctl stop shuttleworks-api shuttleworks-worker"
  say "STEP 3: inspect standby replay/restore state; operator must confirm it is consistent."
  run ssh "$STANDBY" "sudo -n -u postgres pg_controldata /var/lib/postgresql/data"
  say "STEP 4: promote only after fencing evidence and consistency checks pass."
  run ssh "$STANDBY" "sudo -n -u postgres pg_ctl -D /var/lib/postgresql/data promote"
  say "STEP 5: point the application at the promoted host and run health/restore checks."
  run ssh "$STANDBY" "sudo -n systemctl start shuttleworks-api"
else
  say "STEP 1: keep application writes stopped until old primary is fenced."
  run bash -lc "$FENCE_COMMAND"
  say "STEP 2: verify the promoted primary and archive before rejoining old primary."
  run ssh "$PRIMARY" "sudo -n systemctl stop shuttleworks-api shuttleworks-worker"
  say "STEP 3: reclone/rejoin old primary using the documented pgBackRest procedure."
  run ssh "$PRIMARY" "sudo -n -u postgres pgbackrest --stanza=shuttleworks check"
  say "STEP 4: verify streaming replication and archive freshness; do not enable promotion automation."
fi

if [[ "$DRY_RUN" == "1" ]]; then
  say "No commands were executed. Re-run only during an approved maintenance window."
else
  say "Commands executed under explicit approval; attach fencing and health evidence to the incident."
fi
