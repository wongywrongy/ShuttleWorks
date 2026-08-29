#!/usr/bin/env bash
# Production-parity launcher and recovery tooling for the private tech demo.
#
# The demo inherits the production application images and uses Postgres 16.
# Only ingress, cookie security, and bootstrap authentication differ. Runtime
# state, credentials, and backups stay outside Git; every destructive command
# takes a verified backup first and requires typed confirmation.

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: tools/demo-compose.sh COMMAND [BACKUP]

Commands:
  ip                    Print the Tailscale IPv4 address
  state-dir             Print the durable demo state directory
  backup-dir            Print the backup directory
  up                    Build and start the demo
  rebuild               Back up, rebuild without cache, and restart
  status                Show containers, URLs, state, and latest backup
  down                  Back up and stop the demo
  backup                Create and verify a database backup
  backup-verify [path]  Verify a backup (default: latest)
  restore-drill [path]  Restore into a throwaway database and compare counts
  restore [path]        Restore the live DB; DEMO_RESTORE_CONFIRM=restore-demo
  install-backup-timer  Install a daily systemd user backup timer
  reset                 Back up and quarantine state; DEMO_RESET_CONFIRM=reset-demo
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 2
fi

command_name=$1
shift
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
state_home=${XDG_STATE_HOME:-$HOME/.local/state}
default_state_dir="$state_home/shuttleworks/demo"
demo_state_dir=$(realpath -m -- "${DEMO_STATE_DIR:-$default_state_dir}")
backup_root=$(realpath -m -- "${DEMO_BACKUP_DIR:-$state_home/shuttleworks/demo-backups}")
data_dir="$demo_state_dir/data"
postgres_dir="$demo_state_dir/postgres"
secrets_dir="$demo_state_dir/secrets"
state_marker="$demo_state_dir/.shuttleworks-demo-state"
postgres_marker="$demo_state_dir/.postgres-initialized"
legacy_backup_marker="$demo_state_dir/.legacy-sqlite-backed-up"
password_file="$secrets_dir/postgres_password"
database_url_file="$secrets_dir/database_url"

case "$demo_state_dir" in
  /|"$HOME"|"$repo_root"|"$repo_root/data")
    echo "Refusing unsafe DEMO_STATE_DIR: $demo_state_dir" >&2
    exit 1
    ;;
esac
case "$backup_root" in
  "$demo_state_dir"|"$demo_state_dir"/*)
    echo "DEMO_BACKUP_DIR must be outside live state: $demo_state_dir" >&2
    exit 1
    ;;
esac

if [[ "$command_name" == state-dir ]]; then
  echo "$demo_state_dir"
  exit 0
fi
if [[ "$command_name" == backup-dir ]]; then
  echo "$backup_root"
  exit 0
fi

prepare_state() {
  if [[ "$demo_state_dir" != "$default_state_dir" && -d "$demo_state_dir" &&
        ! -e "$state_marker" && -n "$(find "$demo_state_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    if [[ "${DEMO_LEGACY_CONFIRM:-}" != adopt-legacy-demo || ! -s "$data_dir/local.db" ]]; then
      echo "Refusing to adopt a non-empty unmarked DEMO_STATE_DIR: $demo_state_dir" >&2
      echo "For a known legacy SQLite demo, set DEMO_LEGACY_CONFIRM=adopt-legacy-demo." >&2
      exit 1
    fi
    echo "Adopting explicitly confirmed legacy SQLite demo state: $demo_state_dir"
  fi
  mkdir -p "$data_dir" "$postgres_dir" "$secrets_dir" "$backup_root"
  chmod 0700 "$demo_state_dir"
  chmod 0770 "$data_dir" "$secrets_dir"
  chmod 0700 "$backup_root"
  : > "$state_marker"
  if [[ ! -s "$password_file" ]]; then
    if command -v openssl >/dev/null 2>&1; then
      openssl rand -hex 32 > "$password_file"
    else
      od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > "$password_file"
    fi
  fi
  # Compose implements local secrets as bind mounts, so the file retains host
  # permissions. The API joins the host group explicitly; group-read keeps the
  # non-root container working without making either credential world-readable.
  chmod 0640 "$password_file"
  local password
  password=$(<"$password_file")
  printf 'postgresql://scheduler:%s@postgres:5432/scheduler\n' "$password" > "$database_url_file"
  chmod 0640 "$database_url_file"
}

demo_ip="${DEMO_TAILSCALE_IP:-}"
needs_tailnet=false
case "$command_name" in
  ip|up|rebuild|status|restore) needs_tailnet=true ;;
esac
if [[ -z "$demo_ip" && "$needs_tailnet" == true ]]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "Tailscale is required for the demo (tailscale command not found)." >&2
    exit 1
  fi
  demo_ip=$(tailscale ip -4 2>/dev/null | awk 'NR == 1 { print; exit }')
fi
if [[ "$needs_tailnet" == true ]] && ! awk -F. '
  NF == 4 && $1 == 100 && $2 >= 64 && $2 <= 127 &&
  $3 >= 0 && $3 <= 255 && $4 >= 0 && $4 <= 255 { print 1 }
' <<< "$demo_ip" | grep -qx 1; then
  echo "Could not determine a Tailscale IPv4 address (got: ${demo_ip:-<none>})." >&2
  echo "Set DEMO_TAILSCALE_IP to this host's 100.64.0.0/10 address if needed." >&2
  exit 1
fi
# Backup, verification, reset, and stop are local administrative operations.
# A non-routable tailnet-shaped placeholder lets Compose render its unrelated
# web port declarations while Postgres is used entirely over the local socket.
if [[ -z "$demo_ip" ]]; then
  demo_ip=100.64.0.1
fi

prepare_state

# Serialize every operation that can start/stop containers or touch durable
# state. Seed writes take the same lock through the Makefile, so a timer backup,
# restore, rebuild, and import cannot race each other.
case "$command_name" in
  up|rebuild|down|backup|backup-verify|restore-drill|restore|reset)
    exec 9>"$demo_state_dir/.lifecycle.lock"
    if ! flock -w 300 9; then
      echo "Timed out waiting for another demo lifecycle operation to finish." >&2
      exit 1
    fi
    ;;
esac

compose=(
  docker compose
  -f "$repo_root/infra/compose/docker-compose.yml"
  -f "$repo_root/infra/compose/demo.override.yml"
)
compose_env=(
  env
  COMPOSE_PROJECT_NAME=shuttleworks-demo
  DEMO_TAILSCALE_IP="$demo_ip"
  DEMO_STATE_DIR="$demo_state_dir"
  DEMO_HOST_GID="$(id -g)"
)

run_compose() {
  "${compose_env[@]}" "${compose[@]}" "$@"
}

database_counts() {
  local database=$1
  run_compose exec -T postgres sh -eu -c '
    database=$1
    psql -U scheduler -d "$database" -At -c \
      "SELECT tablename FROM pg_tables WHERE schemaname = '\''public'\'' ORDER BY tablename" |
    while IFS= read -r table; do
      count=$(psql -U scheduler -d "$database" -At -c "SELECT count(*) FROM \"$table\"")
      printf "%s\t%s\n" "$table" "$count"
    done
  ' shuttleworks-demo-counts "$database"
}

database_has_schema() {
  [[ "$(run_compose exec -T postgres psql -U scheduler -d scheduler -At -c \
    "SELECT CASE WHEN to_regclass('public.tournaments') IS NOT NULL AND to_regclass('public.alembic_version') IS NOT NULL THEN 'ready' ELSE 'missing' END" \
    2>/dev/null)" == ready ]]
}

database_schema_is_current() {
  local expected actual
  expected=$(run_compose exec -T backend alembic heads | awk 'NR == 1 { print $1; exit }')
  actual=$(run_compose exec -T postgres psql -U scheduler -d scheduler -At -c \
    "SELECT version_num FROM alembic_version")
  if [[ -z "$expected" || "$actual" != "$expected" ]]; then
    echo "Demo schema is not current (database=${actual:-missing}, image=${expected:-missing})." >&2
    return 1
  fi
}

postgres_running() {
  [[ -n "$(run_compose ps --status running -q postgres 2>/dev/null)" ]]
}

start_backup_postgres() {
  BACKUP_STARTED_POSTGRES=false
  if ! postgres_running; then
    run_compose up -d --wait --wait-timeout 90 postgres
    BACKUP_STARTED_POSTGRES=true
  fi
}

stop_backup_postgres() {
  if [[ "${BACKUP_STARTED_POSTGRES:-false}" == true ]]; then
    run_compose stop postgres >/dev/null
  fi
}

new_backup_dir() {
  local stamp target
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="$backup_root/$stamp"
  if [[ -e "$target" || -e "$target.tmp" ]]; then
    target="$backup_root/${stamp}-$$"
  fi
  echo "$target"
}

write_common_metadata() {
  local target=$1 kind=$2
  {
    echo "format_version=1"
    echo "kind=$kind"
    echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "app_revision=$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"
    echo "compose_project=shuttleworks-demo"
    echo "postgres_image=postgres:16-alpine"
  } > "$target/metadata.env"
  if [[ -d "$data_dir/import-runs" ]]; then
    tar -C "$data_dir" -czf "$target/seed-manifests.tar.gz" import-runs
  fi
}

write_checksums() {
  local target=$1
  (
    cd "$target"
    find . -maxdepth 1 -type f ! -name SHA256SUMS -printf '%P\0' \
      | sort -z \
      | xargs -0 sha256sum > SHA256SUMS
  )
}

verify_backup_files() {
  local target=$1
  [[ -f "$target/metadata.env" && -f "$target/SHA256SUMS" ]] || {
    echo "Incomplete backup: $target" >&2
    return 1
  }
  (cd "$target" && sha256sum -c SHA256SUMS)
  if grep -qx 'kind=postgres' "$target/metadata.env"; then
    [[ -s "$target/database.dump" && -s "$target/globals.sql" && -s "$target/counts.tsv" && -s "$target/schema_revision.txt" ]] || {
      echo "Postgres backup is missing required files: $target" >&2
      return 1
    }
    run_compose exec -T postgres pg_restore --list < "$target/database.dump" >/dev/null
    grep -Eq '^CREATE ROLE scheduler;' "$target/globals.sql"
  elif grep -qx 'kind=legacy-sqlite' "$target/metadata.env"; then
    [[ -s "$target/local.db" ]] || {
      echo "Legacy SQLite backup is missing local.db: $target" >&2
      return 1
    }
    python3 -c 'import sqlite3, sys; connection = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True); result = connection.execute("PRAGMA integrity_check").fetchone()[0]; connection.close(); raise SystemExit(0 if result == "ok" else f"SQLite integrity check failed: {result}")' "$target/local.db"
  else
    echo "Unknown backup kind: $target" >&2
    return 1
  fi
}

resolve_backup() {
  local requested=${1:-latest} resolved
  if [[ "$requested" == latest ]]; then
    requested="$backup_root/latest"
  elif [[ "$requested" != /* ]]; then
    requested="$backup_root/$requested"
  fi
  resolved=$(realpath -e -- "$requested") || {
    echo "Backup does not exist: $requested" >&2
    return 1
  }
  case "$resolved" in
    "$backup_root"/*) echo "$resolved" ;;
    *) echo "Backup must be inside $backup_root (got: $resolved)." >&2; return 1 ;;
  esac
}

backup_legacy_sqlite() {
  if [[ ! -s "$data_dir/local.db" ]]; then
    echo "No initialized Postgres database or legacy SQLite database to back up." >&2
    return 1
  fi
  local target tmp
  target=$(new_backup_dir)
  tmp="$target.tmp"
  mkdir -m 0700 "$tmp"

  local -a running_ids=()
  mapfile -t running_ids < <(docker ps --filter label=com.docker.compose.project=shuttleworks-demo -q)
  if ((${#running_ids[@]})); then
    docker stop "${running_ids[@]}" >/dev/null
  fi
  if ! (
    cp -- "$data_dir/local.db" "$tmp/local.db"
    [[ ! -f "$data_dir/local.db-wal" ]] || cp -- "$data_dir/local.db-wal" "$tmp/local.db-wal"
    [[ ! -f "$data_dir/local.db-shm" ]] || cp -- "$data_dir/local.db-shm" "$tmp/local.db-shm"
    [[ ! -f "$data_dir/local.db-journal" ]] || cp -- "$data_dir/local.db-journal" "$tmp/local.db-journal"
    python3 -c 'import sqlite3, sys; connection = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True); result = connection.execute("PRAGMA integrity_check").fetchone()[0]; connection.close(); raise SystemExit(0 if result == "ok" else f"SQLite integrity check failed: {result}")' "$tmp/local.db"
    write_common_metadata "$tmp" legacy-sqlite
    write_checksums "$tmp"
    verify_backup_files "$tmp"
  ); then
    if ((${#running_ids[@]})); then
      docker start "${running_ids[@]}" >/dev/null || true
    fi
    mv -- "$tmp" "$target.failed"
    echo "Legacy backup failed verification; diagnostic snapshot retained at $target.failed" >&2
    return 1
  fi
  if ((${#running_ids[@]})); then
    if ! docker start "${running_ids[@]}" >/dev/null; then
      mv -- "$tmp" "$target.failed"
      echo "Legacy containers did not restart; verified snapshot retained at $target.failed" >&2
      return 1
    fi
  fi
  mv -- "$tmp" "$target"
  ln -sfn -- "$(basename "$target")" "$backup_root/latest"
  : > "$legacy_backup_marker"
  echo "Verified legacy SQLite backup: $target"
}

create_postgres_backup() {
  if [[ ! -e "$postgres_marker" ]]; then
    if [[ ! -s "$data_dir/local.db" ]]; then
      echo "No initialized demo database to back up." >&2
      return 2
    fi
    backup_legacy_sqlite
    return
  fi
  local target tmp
  target=$(new_backup_dir)
  tmp="$target.tmp"
  mkdir -m 0700 "$tmp"
  start_backup_postgres
  if ! database_has_schema; then
    stop_backup_postgres
    mv -- "$tmp" "$target.failed"
    echo "Postgres marker exists but the expected migrated schema does not; refusing an empty backup." >&2
    return 1
  fi
  if ! (
    run_compose exec -T postgres pg_dump -U scheduler -d scheduler -Fc --no-owner --no-privileges > "$tmp/database.dump"
    run_compose exec -T postgres pg_dumpall -U scheduler --globals-only > "$tmp/globals.sql"
    database_counts scheduler > "$tmp/counts.tsv"
    run_compose exec -T postgres psql -U scheduler -d scheduler -At -c "SELECT version_num FROM alembic_version" > "$tmp/schema_revision.txt"
    write_common_metadata "$tmp" postgres
    write_checksums "$tmp"
    verify_backup_files "$tmp"
  ); then
    stop_backup_postgres
    mv -- "$tmp" "$target.failed"
    echo "Postgres backup failed verification; diagnostic archive retained at $target.failed" >&2
    return 1
  fi
  stop_backup_postgres
  mv -- "$tmp" "$target"
  ln -sfn -- "$(basename "$target")" "$backup_root/latest"
  echo "Verified Postgres backup: $target"
}

backup_if_present() {
  if [[ -e "$postgres_marker" || -s "$data_dir/local.db" ]]; then
    create_postgres_backup
  else
    echo "No initialized demo database exists; no backup was needed."
  fi
}

restore_drill() {
  local target=$1 drill_db="shuttleworks_demo_drill_${$}_$(date -u +%s)" actual schema status=0
  grep -qx 'kind=postgres' "$target/metadata.env" || {
    echo "Restore drills require a Postgres backup; this is a legacy SQLite snapshot." >&2
    return 1
  }
  start_backup_postgres
  if ! verify_backup_files "$target"; then
    stop_backup_postgres
    return 1
  fi
  if ! run_compose exec -T postgres createdb -U scheduler "$drill_db"; then
    stop_backup_postgres
    return 1
  fi
  if ! run_compose exec -T postgres pg_restore -U scheduler -d "$drill_db" --no-owner --no-privileges < "$target/database.dump"; then
    status=1
  else
    if ! actual=$(database_counts "$drill_db"); then
      status=1
    elif [[ "$actual" != "$(<"$target/counts.tsv")" ]]; then
      echo "Restore drill row counts differ from the backup manifest." >&2
      diff -u "$target/counts.tsv" <(printf '%s\n' "$actual") || true
      status=1
    fi
    if ! schema=$(run_compose exec -T postgres psql -U scheduler -d "$drill_db" -At -c "SELECT version_num FROM alembic_version"); then
      status=1
    elif [[ "$schema" != "$(<"$target/schema_revision.txt")" ]]; then
      echo "Restore drill schema revision differs from the backup manifest." >&2
      status=1
    fi
  fi
  if ! run_compose exec -T postgres dropdb -U scheduler --if-exists --force "$drill_db"; then
    status=1
  fi
  stop_backup_postgres
  if ((status)); then
    return "$status"
  fi
  echo "Restore drill passed: $target"
}

restore_live() {
  local target=$1
  local candidate="shuttleworks_demo_candidate_${$}"
  local previous="shuttleworks_demo_previous_${$}"
  local recovery_marker="$demo_state_dir/restore-in-progress.env"
  local restore_phase=candidate-restore

  write_restore_marker() {
    local phase=$1
    restore_phase=$phase
    {
      echo "phase=$phase"
      echo "source_backup=$target"
      echo "candidate_database=$candidate"
      echo "previous_database=$previous"
    } > "$recovery_marker"
  }

  restore_interrupted() {
    trap - HUP INT TERM
    if [[ "$restore_phase" == candidate-restore ]]; then
      run_compose exec -T postgres dropdb -U scheduler --if-exists --force "$candidate" \
        >/dev/null 2>&1 || true
      rm -f -- "$recovery_marker"
      stop_backup_postgres
      echo "Restore interrupted before the live database was touched." >&2
    else
      run_compose up -d postgres >/dev/null 2>&1 || true
      if run_compose exec -T postgres psql -U scheduler -d postgres -At -c \
        "SELECT 1 FROM pg_database WHERE datname = 'scheduler'" 2>/dev/null | grep -qx 1; then
        run_compose up -d backend entrant frontend >/dev/null 2>&1 || true
      fi
      echo "Restore interrupted during $restore_phase." >&2
      echo "Recovery details are retained at $recovery_marker" >&2
    fi
    exit 130
  }

  trap restore_interrupted HUP INT TERM

  start_backup_postgres
  write_restore_marker candidate-restore
  if ! run_compose exec -T postgres createdb -U scheduler -O scheduler "$candidate"; then
    trap - HUP INT TERM
    rm -f -- "$recovery_marker"
    stop_backup_postgres
    return 1
  fi
  if ! run_compose exec -T postgres pg_restore -U scheduler -d "$candidate" --no-owner --no-privileges < "$target/database.dump"; then
    run_compose exec -T postgres dropdb -U scheduler --if-exists --force "$candidate" || true
    trap - HUP INT TERM
    rm -f -- "$recovery_marker"
    stop_backup_postgres
    echo "Candidate restore failed; the live database was not touched." >&2
    return 1
  fi

  write_restore_marker database-swap
  run_compose stop backend entrant frontend >/dev/null
  if ! run_compose exec -T postgres psql -U scheduler -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'scheduler' AND pid <> pg_backend_pid()" \
    -c "ALTER DATABASE scheduler RENAME TO $previous" \
    -c "ALTER DATABASE $candidate RENAME TO scheduler"; then
    if ! run_compose exec -T postgres psql -U scheduler -d postgres \
      -c "ALTER DATABASE $previous RENAME TO scheduler" >/dev/null 2>&1; then
      echo "Database swap and automatic rollback both failed." >&2
      echo "Recovery details are retained at $recovery_marker" >&2
      trap - HUP INT TERM
      return 1
    fi
    run_compose up -d --wait --wait-timeout 180 backend entrant frontend || true
    echo "Database swap failed; the original database was returned to service." >&2
    echo "Recovery details are retained at $recovery_marker" >&2
    trap - HUP INT TERM
    return 1
  fi

  write_restore_marker application-validation
  if ! run_compose up -d --wait --wait-timeout 180 backend entrant frontend; then
    run_compose stop backend entrant frontend >/dev/null 2>&1 || true
    if ! run_compose exec -T postgres psql -U scheduler -d postgres -v ON_ERROR_STOP=1 \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'scheduler' AND pid <> pg_backend_pid()" \
      -c "ALTER DATABASE scheduler RENAME TO $candidate" \
      -c "ALTER DATABASE $previous RENAME TO scheduler"; then
      echo "Application validation and automatic database rollback both failed." >&2
      echo "Recovery details are retained at $recovery_marker" >&2
      trap - HUP INT TERM
      return 1
    fi
    run_compose up -d --wait --wait-timeout 180 backend entrant frontend || true
    echo "Restored application failed health checks; rolled back to the pre-restore database." >&2
    echo "Recovery details are retained at $recovery_marker" >&2
    trap - HUP INT TERM
    return 1
  fi

  if ! run_compose exec -T postgres dropdb -U scheduler --if-exists --force "$previous"; then
    echo "Restore succeeded, but the previous database could not be removed: $previous" >&2
    echo "Recovery details are retained at $recovery_marker" >&2
    trap - HUP INT TERM
    return 1
  fi
  : > "$postgres_marker"
  rm -f -- "$recovery_marker"
  trap - HUP INT TERM
  echo "Live demo restored from $target"
}

retire_legacy_manifest() {
  local run_dir="$data_dir/import-runs" archive
  if [[ -d "$run_dir" && ! -e "$postgres_marker" ]]; then
    archive="$demo_state_dir/legacy-import-runs-$(date -u +%Y%m%dT%H%M%SZ)"
    mv -- "$run_dir" "$archive"
    mkdir -m 0770 "$run_dir"
    echo "Retired the SQLite seed manifest to $archive; Postgres will be seeded independently."
  fi
}

ensure_legacy_preserved() {
  if [[ ! -e "$postgres_marker" && -s "$data_dir/local.db" ]]; then
    if [[ ! -e "$legacy_backup_marker" ]]; then
      backup_legacy_sqlite
    fi
    retire_legacy_manifest
  fi
}

start_demo() {
  ensure_legacy_preserved
  run_compose up -d --build --wait --wait-timeout 180 backend entrant frontend "$@"
  database_schema_is_current
  : > "$postgres_marker"
}

case "$command_name" in
  ip)
    echo "$demo_ip"
    ;;
  up)
    start_demo "$@"
    cat <<EOF

ShuttleWorks private tech demo is ready.
  Operator console: http://$demo_ip:8090
  Entrant site:     http://$demo_ip:8091/e/
  API:              http://$demo_ip:8092
  API docs:         http://$demo_ip:8092/docs
  Durable state:    $demo_state_dir
  Backups:          $backup_root

Use 'make demo-status' to check readiness and 'make demo-down' for a backed-up stop.
EOF
    ;;
  rebuild)
    backup_if_present
    run_compose down --remove-orphans
    run_compose build --no-cache backend entrant frontend
    start_demo
    ;;
  status)
    run_compose ps
    echo ""
    echo "Demo URLs (Tailscale: $demo_ip):"
    echo "  Operator console: http://$demo_ip:8090"
    echo "  Entrant site:     http://$demo_ip:8091/e/"
    echo "  API:              http://$demo_ip:8092"
    echo "  Durable state:    $demo_state_dir"
    echo "  Backups:          $backup_root"
    if [[ -e "$backup_root/latest" ]]; then
      echo "  Latest backup:    $(realpath -e "$backup_root/latest")"
    else
      echo "  Latest backup:    none"
    fi
    ;;
  down)
    backup_if_present
    run_compose down --remove-orphans
    ;;
  backup)
    backup_if_present
    ;;
  backup-verify)
    target=$(resolve_backup "${1:-latest}")
    started=false
    if grep -qx 'kind=postgres' "$target/metadata.env"; then
      start_backup_postgres
      started=true
    fi
    if ! verify_backup_files "$target"; then
      [[ "$started" == false ]] || stop_backup_postgres
      exit 1
    fi
    [[ "$started" == false ]] || stop_backup_postgres
    echo "Backup verified: $target"
    ;;
  restore-drill)
    target=$(resolve_backup "${1:-latest}")
    restore_drill "$target"
    ;;
  restore)
    [[ "${DEMO_RESTORE_CONFIRM:-}" == restore-demo ]] || {
      echo "Restore refused. Re-run with DEMO_RESTORE_CONFIRM=restore-demo." >&2
      exit 1
    }
    [[ ! -e "$demo_state_dir/restore-in-progress.env" ]] || {
      echo "Restore refused: an earlier recovery marker still exists." >&2
      echo "Resolve it before removing $demo_state_dir/restore-in-progress.env" >&2
      exit 1
    }
    target=$(resolve_backup "${1:-latest}")
    restore_drill "$target"
    if [[ -e "$postgres_marker" ]]; then
      create_postgres_backup
    else
      echo "No initialized live Postgres database exists; proceeding after the successful restore drill."
    fi
    restore_live "$target"
    ;;
  install-backup-timer)
    unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
    mkdir -p "$unit_dir"
    escaped_script=$(printf '%q' "$repo_root/tools/demo-compose.sh")
    escaped_state=$(printf '%q' "$demo_state_dir")
    escaped_backups=$(printf '%q' "$backup_root")
    cat > "$unit_dir/shuttleworks-demo-backup.service" <<EOF
[Unit]
Description=Back up the ShuttleWorks demo database

[Service]
Type=oneshot
Environment=DEMO_STATE_DIR=$escaped_state
Environment=DEMO_BACKUP_DIR=$escaped_backups
ExecStart=/usr/bin/env bash $escaped_script backup
EOF
    cat > "$unit_dir/shuttleworks-demo-backup.timer" <<'EOF'
[Unit]
Description=Daily ShuttleWorks demo database backup

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now shuttleworks-demo-backup.timer
    echo "Installed daily backup timer. Enable user lingering once so it runs while logged out:"
    echo "  sudo loginctl enable-linger $USER"
    ;;
  reset)
    [[ "${DEMO_RESET_CONFIRM:-}" == reset-demo ]] || {
      echo "Reset refused. Re-run with DEMO_RESET_CONFIRM=reset-demo." >&2
      exit 1
    }
    backup_if_present
    run_compose down --remove-orphans
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    quarantine="$demo_state_dir/quarantine-$stamp"
    mkdir -m 0700 "$quarantine"
    [[ ! -e "$postgres_dir" ]] || mv -- "$postgres_dir" "$quarantine/postgres"
    [[ ! -e "$data_dir" ]] || mv -- "$data_dir" "$quarantine/data"
    rm -f -- "$postgres_marker" "$legacy_backup_marker"
    mkdir -m 0770 "$postgres_dir" "$data_dir"
    echo "Demo state quarantined at $quarantine. The verified backup remains at $backup_root/latest."
    ;;
  *)
    echo "unknown demo command: $command_name" >&2
    usage
    exit 2
    ;;
esac
