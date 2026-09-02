#!/usr/bin/env bash
set -Eeuo pipefail

# Create or verify a checksummed, portable PostgreSQL backup artifact. This
# wrapper does not invoke pg_dump/pgBackRest and never restores or deletes
# database data; it is intended to be run after an isolated backup export.

MODE="${1:-}"
TARGET="${2:-}"
STANZA="${PGBACKREST_STANZA:-shuttleworks}"
MANIFEST_SCHEMA_VERSION=1
TOOL_VERSION="shuttleworks-postgres-backup-manifest/1"
MANIFEST_NAME="backup-manifest.env"
CHECKSUMS_NAME="SHA256SUMS"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 2
}

[[ "$MODE" == "create" || "$MODE" == "verify" ]] || \
  die "usage: $0 [create|verify] BACKUP_DIRECTORY [CREATED_AT_UTC]"
[[ -n "$TARGET" && -d "$TARGET" && ! -L "$TARGET" ]] || \
  die "backup directory must be an existing non-symlink directory"
[[ "$STANZA" =~ ^[A-Za-z0-9_.-]+$ ]] || die "PGBACKREST_STANZA contains unsafe characters"

if [[ "$MODE" == "create" ]]; then
  CREATED_AT="${3:-}"
  [[ "$CREATED_AT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || \
    die "create requires CREATED_AT_UTC in YYYY-MM-DDTHH:MM:SSZ format"
else
  [[ -z "${3:-}" ]] || die "verify accepts only BACKUP_DIRECTORY"
fi

TARGET="$(realpath -e -- "$TARGET")"
[[ "$TARGET" != "/" ]] || die "refusing to operate on filesystem root"

manifest="$TARGET/$MANIFEST_NAME"
checksums="$TARGET/$CHECKSUMS_NAME"

if [[ "$MODE" == "create" ]]; then
  mapfile -t payloads < <(
    find "$TARGET" -maxdepth 1 -type f \
      ! -name "$MANIFEST_NAME" ! -name "$CHECKSUMS_NAME" \
      -printf '%f\n' | LC_ALL=C sort
  )
  ((${#payloads[@]} > 0)) || die "backup directory contains no payload files"
  for payload in "${payloads[@]}"; do
    [[ "$payload" =~ ^[A-Za-z0-9._-]+$ ]] || \
      die "backup payload filename contains unsupported characters: $payload"
  done

  manifest_tmp="$(mktemp "$TARGET/.backup-manifest.XXXXXX")"
  checksums_tmp="$(mktemp "$TARGET/.SHA256SUMS.XXXXXX")"
  cleanup() {
    rm -f -- "$manifest_tmp" "$checksums_tmp"
  }
  trap cleanup EXIT

  {
    printf 'manifest_version=%s\n' "$MANIFEST_SCHEMA_VERSION"
    printf 'schema_version=%s\n' "$MANIFEST_SCHEMA_VERSION"
    printf 'tool_version=%s\n' "$TOOL_VERSION"
    printf 'created_at=%s\n' "$CREATED_AT"
    printf 'artifact=postgresql\n'
    printf 'stanza=%s\n' "$STANZA"
    printf 'payload_count=%s\n' "${#payloads[@]}"
    for payload in "${payloads[@]}"; do
      printf 'payload_file=%s\n' "$payload"
    done
  } > "$manifest_tmp"
  mv -- "$manifest_tmp" "$manifest"

  # The manifest is itself covered by the checksum list. SHA256SUMS is the
  # only excluded file because it necessarily contains its own contents.
  (
    cd -- "$TARGET"
    sha256sum -- "$MANIFEST_NAME" "${payloads[@]}"
  ) > "$checksums_tmp"
  mv -- "$checksums_tmp" "$checksums"
  trap - EXIT
  printf 'Created backup manifest: %s\n' "$TARGET"
else
  [[ -s "$manifest" ]] || die "backup manifest is missing"
  [[ -s "$checksums" ]] || die "SHA256SUMS is missing"
  grep -qx "manifest_version=$MANIFEST_SCHEMA_VERSION" "$manifest" || die "unsupported backup manifest"
  grep -qx "schema_version=$MANIFEST_SCHEMA_VERSION" "$manifest" || die "backup schema version is invalid"
  grep -qx "tool_version=$TOOL_VERSION" "$manifest" || die "backup tool version is invalid"
  grep -Eq '^created_at=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$manifest" || die "backup creation timestamp is invalid"
  grep -qx 'artifact=postgresql' "$manifest" || die "backup artifact is not PostgreSQL"
  grep -qx "stanza=$STANZA" "$manifest" || die "backup stanza does not match"
  payload_count="$(sed -n 's/^payload_count=//p' "$manifest")"
  [[ "$payload_count" =~ ^[0-9]+$ ]] || die "backup payload count is invalid"
  mapfile -t listed_payloads < <(sed -n 's/^payload_file=//p' "$manifest")
  [[ "$payload_count" == "${#listed_payloads[@]}" ]] || die "backup payload count does not match inventory"
  mapfile -t actual_payloads < <(
    find "$TARGET" -maxdepth 1 -type f \
      ! -name "$MANIFEST_NAME" ! -name "$CHECKSUMS_NAME" \
      -printf '%f\n' | LC_ALL=C sort
  )
  [[ "$payload_count" == "${#actual_payloads[@]}" ]] || die "backup payload inventory does not match"
  expected_inventory="$(printf '%s\n' "${actual_payloads[@]}")"
  listed_inventory="$(printf '%s\n' "${listed_payloads[@]}" | LC_ALL=C sort)"
  [[ "$expected_inventory" == "$listed_inventory" ]] || die "backup payload inventory does not match"
  (
    cd -- "$TARGET"
    sha256sum -c -- "$CHECKSUMS_NAME"
  )
  printf 'Verified backup manifest: %s\n' "$TARGET"
fi
