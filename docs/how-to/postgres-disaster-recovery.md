# Self-hosted PostgreSQL disaster recovery

Owner: platform-oncall. This runbook applies to the two-server self-hosted
cloud deployment. Server 1 is the normal primary; Server 2 is a warm physical
standby. Two servers do not provide automatic high availability: without an
independent witness and fencing, a network partition can leave both machines
believing they are primary. Automatic two-node promotion is therefore not
implemented.

## Required durability layers

Streaming replication reduces recovery time but is not a backup. It can copy
bad writes, deletions, corruption, or an attack. Keep encrypted, versioned
pgBackRest backups and WAL archives in storage independent of both servers.
The repository templates are:

- `infra/postgres/primary-standby.env.example`
- `infra/postgres/pgbackrest.conf.example`
- `infra/postgres/backup-manifest.sh`
- `infra/postgres/failover-rejoin.sh`
- `infra/postgres/restore-drill.sh`

Credentials, S3 keys, TLS keys, and the fencing provider belong to the host
secret manager. Do not put them in Compose files, shell history, or incident
messages.

After producing an isolated backup export, create and verify its portable
manifest before copying it to independent storage:

```bash
infra/postgres/backup-manifest.sh create /secure/staging/backup 2026-09-01T12:00:00Z
infra/postgres/backup-manifest.sh verify /secure/staging/backup
```

The creation timestamp must come from the backup event (rather than the
manifest script's wall clock) so the audit record is reproducible. The
manifest records schema/tool versions, stanza, payload count, and a sorted
payload inventory; every listed file and the manifest itself are covered by
SHA-256 checksums. Missing, extra, tampered, or wrong-stanza artifacts fail
verification.

## Daily health checks

Record these facts without changing database state:

1. Primary `pg_isready` and application `/health/ready` are successful.
2. Standby is in recovery, has current replay/receive timestamps, and has no
   unexplained replication lag.
3. `pgbackrest check` succeeds and the newest archived WAL timestamp is within
   the agreed RPO.
4. Server 1 and Server 2 have independent disk, power, and network failure
   domains documented. If they share a rack, ISP, router, or power circuit,
   record that Server 2 does not cover that failure.

## Fenced failover

Run the checklist in dry-run mode first:

```bash
DRY_RUN=1 infra/postgres/failover-rejoin.sh failover
```

The live mode requires both an operator-supplied independent fencing command
and the literal approval token `CONFIRM_FENCED_FAILOVER=I_UNDERSTAND_FENCED_DR`.
Fencing must be independently verified before promoting Server 2. A failed
SSH/health check is not evidence that Server 1 is stopped. Attach fencing,
replication, archive, and application-health evidence to the incident.

Only in an approved incident window, after reviewing the dry-run output, run:

```bash
PG_PRIMARY_HOST=server-1.internal \
PG_STANDBY_HOST=server-2.internal \
FENCE_PRIMARY_COMMAND='/approved/fencing-tool server-1.internal' \
CONFIRM_FENCED_FAILOVER=I_UNDERSTAND_FENCED_DR \
DRY_RUN=0 infra/postgres/failover-rejoin.sh failover
```

## Rejoin

Keep the old primary fenced and stop application writes on it. Rebuild or
rejoin it from the promoted primary using pgBackRest, then verify streaming and
archive freshness before restoring it as standby. Never rejoin an old writable
primary by simply starting its application container.

```bash
DRY_RUN=1 infra/postgres/failover-rejoin.sh rejoin
```

## PITR restore drill

Run monthly and after changing backup configuration. The drill target must be
a clean, isolated host/database and must never be the production `scheduler`
database. Start with:

```bash
DRY_RUN=1 infra/postgres/restore-drill.sh
```

On an explicitly isolated drill host, the executable preflight is:

```bash
RESTORE_DRILL_TARGET=shuttleworks_restore_drill_202609 \
PGBACKREST_STANZA=shuttleworks \
DRY_RUN=0 infra/postgres/restore-drill.sh
```

The script validates the archive and refuses production-looking target names;
the deployment-specific pgBackRest restore command remains owned by the
isolated host runbook because repository code cannot know its storage layout.

The drill records backup/WAL selection, restore duration, migration result,
`/health/ready`, representative reads/exports, row/hash evidence, and cleanup
of the isolated target. A successful standby health check does not satisfy this
restore-drill requirement.

## Explicit boundaries

This repository provides templates, precondition checks, and a dry-run
checklist. It does not choose a fencing vendor, provision object storage,
rotate credentials, or execute a real failover. Those are deployment-owner
decisions and must be rehearsed on the actual hardware before production.
