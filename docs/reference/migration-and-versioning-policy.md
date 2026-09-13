# Schema migration and versioning policy

**Accepted: 2026-09-12. Pre-launch policy v2.** The owner has declared that
there are no external users or databases outside the owner's control,
including the demo. Until GA, support is **latest version only**. A retired
revision, older blob, or unknown wire version requires resetting the database.
Never stamp a stale database to head or purge rows to make a constraint pass.

GA is the first installation of a tagged release by an external organization.
An internal semver tag alone does not activate the compatibility window. At
that external installation, record the tag and activate the parked policy
below before subsequent releases. Immutable tags and the CI release gate in
[ADR 0024](../explanation/decisions/0024-compatibility-and-release-governance.md)
remain in force throughout.

## Pre-launch revisions

The revision tree begins at `0001_baseline.py`, a frozen fresh-install schema
including the registration/competition cutover in
[ADR 0030](../explanation/decisions/0030-registration-competition.md).
Old revision IDs are deliberately unresolvable. Git history retains the old
tree; it is not an upgrade path. Empty databases upgrade to head; databases
from the retired tree must be recreated and seeded.

Changes are direct: drop, rename, tighten NOT NULL, and tighten CHECK in the
revision that needs the change. There is no expand/contract release,
dual-write path, compatibility parity suite, or automatic stale-data repair.
Necessary data conversions use Python and revision-local table definitions,
never imports from mutable application models or services.

The first docstring line names the change class (`additive`, `destructive`,
`data`, or `constraint`) and its ADR or ruling. List batch-altered tables.
Constraints are named. Scan before adding a constraint and abort with offending
keys; never delete records to satisfy it. Backfills must be idempotent.
Every downgrade raises `NotImplementedError("forward-only until GA")`.
Fix a faulty change forward, or [reset and reseed](../how-to/reset-prelaunch-database.md).

## Startup and verification

Migration errors abort startup and exit nonzero. Before an outstanding SQLite
upgrade, write `BACKEND_DATA_DIR/backups/pre-migration-<target-rev>-<UTC>.db`
and retain the newest five matching snapshots. SQLite's backup API includes
committed WAL pages, producing a consistent standalone copy. A backup failure
also aborts startup. PostgreSQL recovery uses the existing demo backup tools.

Migration connections disable SQLite foreign keys to avoid cascades during
batch table rebuilds and restore enforcement before reuse. After upgrade,
`PRAGMA foreign_key_check` must return no rows, including when already at head.
Violations abort startup and leave the offending records intact.

Backend tests create schema through Alembic, including in-memory fixtures.
CI upgrades an empty SQLite database and runs `alembic check` before pytest.
Baseline tests additionally check constraints, partial indexes, expression
indexes, triggers, catalogs, and foreign keys. Alembic's
[autogenerate comparison](https://alembic.sqlalchemy.org/en/latest/autogenerate.html)
has dialect limitations: review generated revisions and verify expression
indexes and trigger changes explicitly. Type comparison alone does not prove
CHECK-expression parity.

For each schema change: `alembic check` clean, backend tests green, and the
canonical fixture/browser tier green from an empty database. Rebuild the demo
from the verified code when its cutover is resumed; its existing owner-directed
deferral is recorded in the [registration/competition status](registration-competition-implementation.md).

## Current-only documents

Operation and checkpoint allow-lists are both `(1,)`. Their counters restart at
1; no older wire schema is supported. Preserve the allow-list predicates,
unknown-version quarantine, and update metadata reporting. The
[compatibility matrix](compatibility-matrix.md) records the single current/current
case and the current fixtures.

Tournament blobs also restart at 1. Writes stamp the current version; reads
refuse any different or malformed version. An absent version means 1; empty
objects stay empty. `VersionedJSON` remains the shared boundary guard.

## Registration and competition work

The three direct delivery slices are registration cleanup; competition tables
and roster/audit guards; then the bind seam and consumer switch together with
removal of retired mapping columns. There is no separate contract release.
The workspace's existing direct cutover is included in the baseline rather
than replayed through intermediate revisions. `competition_audit` retains the
ADR 0030 command audit; authority transitions retain their existing table.

## Parked until GA

At the first external installation, activate these post-GA requirements:

- Expand, migrate, then contract at N+3; retain the required compatibility
  paths until the window closes.
- No schema migration under an active authority epoch; upgrade nodes between
  epochs.
- Current plus two compatible wire releases, explicit blob compatibility
  windows, and semver discipline for breaking changes.
- A round-trip/restore harness with per-release fixture databases and actual
  release artifacts, alongside the existing immutable-tag and CI gates.

These requirements supersede the pre-launch exceptions at GA. The original
v1 policy file was not present in this checkout; this section preserves the
post-GA obligations supplied with the owner's v2 directive.
