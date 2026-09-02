# ShuttleWorks operational observability runbook

Owner: platform-oncall. Event-operation questions are owned by
event-operations. The versioned dashboard and alert contract lives in the
repository at `infra/observability/`.

## First response

1. Confirm the signal is from the expected `service.name` and deployment
   profile. Node IDs are resource metadata, never metric labels.
2. Open the authority status page and record the authority epoch, checkpoint
   sequence, and pending count. Do not include participant names or operation
   payloads in an incident channel.
3. If the node is still serving play, preserve SQLite, backups, and the
   operation log before restarting or deleting telemetry data.

## API errors or latency

Alerts: `ShuttleWorksApiErrorRateHigh` and `ShuttleWorksApiLatencyHigh`.
Compare the HTTP status and latency panels with database availability, pool
pressure, and worker signals. Check one affected route locally from the same
network before restarting anything. On an event node, disconnect or stop the
Collector if necessary to rule out resource contention; tournament commands
must continue because OTLP export is asynchronous and fail-open. Preserve
request IDs and trace IDs, but never copy credentials or request bodies into
an incident record.

## Sync backlog or oldest age

Alerts: `sync_outbox_depth` and `sync_outbox_oldest_age`. Both use the
`sync-outbox` deduplication key; the oldest-age alert is suppressed while the
node is confirmed offline and pages only after its connected-live-event
condition remains true.

Check the sync-agent logs for `sync_batch_acknowledged`,
`sync_batch_rejected`, and `sync_network_unavailable`. Verify the capability
secret is mounted and the cloud URL is reachable. A retry is safe: operation
IDs and epoch-local sequence numbers make the upload idempotent. Do not edit
the outbox rows manually. If the authority capability is invalid, stop the
agent and follow the authority recovery procedure rather than rotating the
secret in place.

## SQLite WAL or disk alerts

Alerts: `sqlite_wal_bytes` and `sqlite_disk_free`. Both use the
`sqlite-storage` deduplication key; these remain actionable during a live event
even when the node is offline because storage exhaustion threatens local
operation.

Keep at least 5 GiB free for the database, recovery bundle, and temporary
restore. Copy a verified encrypted recovery bundle before maintenance. A WAL
alert is not permission to run an unbounded checkpoint during play; schedule
maintenance, capture the current bundle, then use the normal SQLite backup
procedure. `sqlite.busy_timeout` and `sqlite.events{sqlite.event=busy}` are
diagnostic only and never change command success behavior.

## Authority rejection alerts

Alert: `authority_rejections`, deduplicated with the `authority-rejection`
key. This is a live-event page condition; confirmed offline status does not
hide a rejection observed by the local authority.

Treat a sustained rejection rate as a protocol or enrollment incident. Check
the stable rejection reason (schema, capability, hash, state, or already
granted), the epoch, and the signed operator change record. Never put a
capability, checkpoint contents, token, or personal data in telemetry or
alerts.

## Recovery outcomes

Every create, verify, and restore attempt emits a bounded success/failure
counter. A failure counter means the command still failed closed; preserve the
original error locally, verify the passphrase and destination path, and retry
only after checking that an existing database will not be overwritten.

## Database availability or pool pressure

Alert: `database_unavailable`. Confirm `/health/ready` from the same deployment
profile, then inspect database reachability and pool utilization. A zero
availability gauge is produced by a bounded, suppressed `SELECT 1`; it is not
in a tournament command path. Do not restart the API repeatedly when the
database is unavailable, because that discards useful process and pool
evidence without restoring persistence.

For PostgreSQL, verify the primary role, connection limit, active sessions,
locks, archive health, and replication health. For SQLite, use the WAL and disk section
above. Pool gauges may be absent for SQLite pool implementations that do not
expose queue statistics; absence is not interpreted as zero pressure.

## Backup health

Alerts: `backup_stale` and `backup_restore_test_failed`. These signals use the
backup scheduler's secret-free status projection. Verify `/health/backups`,
free space, retained generations, and the most recent local bundle before
changing retention or retrying. A successful create with a failed restore test
is not a recoverable backup. Preserve the artifact and error locally, then run
the isolated restore preflight; never test restoration over the live database.

## Collector queue or export failure

Alerts: `collector_queue_utilization` and `collector_export_failures`. Scrape
the Collector's loopback-only `:8888/metrics` endpoint and check queue size,
capacity, failed sends, gateway DNS/TLS, and the persistent volume. A gateway
outage must not interrupt tournament commands. Do not delete the queue volume
to clear the alert: restore the gateway and allow the queue to drain. If disk
pressure threatens SQLite or backups, preserve tournament state first and
accept telemetry loss rather than exhausting the node.

For a telemetry outage, leave the API, worker, and sync agent running. Confirm
the event-node Collector queue volume is mounted, record queue utilization and
free disk, then restore gateway DNS/TLS and watch the queue drain. The Compose
profile intentionally has no application dependency on Collector health. If
the Collector itself is wedged, restart only that container; do not remove its
persistent volume. Verify new and queued markers arrive before closing the
incident.

## Certificate expiry

Alert: `ShuttleWorksCertificateExpiring`. The monitoring backend must probe
each public endpoint and the OTLP gateway so
`probe_ssl_earliest_cert_expiry` is present. Obtain a replacement certificate
and key through the deployment CA, verify their subject/SAN, validity window,
and matching public key, and update the mounted secret files atomically. Set
`OTEL_GATEWAY_TLS_MIN_VERSION` to `1.2` or `1.3`; never lower it. Restart the
Collector, verify its health and one mTLS export, then revoke the old client
certificate after all nodes have rotated. Do not commit certificates or keys.

## Failed or stalled workers

Alerts: `ShuttleWorksSolveWorkerStalled` and
`ShuttleWorksSolveWorkerLeaseStale`. Check `/health/metrics` for queued age,
running jobs, leases, and heartbeat age. A stale lease is recovered by the
normal reaper; do not edit queue rows. Inspect the worker log and database
reachability, restart only the failed worker process, and confirm the same job
is reclaimed without a duplicate terminal result.

## Repository game-day gate

Before wiring a deployment to a telemetry backend, run the deterministic local
proof from the repository root:

```bash
.venv/bin/python tools/observability_game_day.py
```

It captures representative sync, authority, backup, and SQLite metric-facade
calls plus sanitized HTTP and database span samples, checks privacy/cardinality
filtering, confirms that every alert rule fires above its threshold, and
confirms that exact threshold boundaries do not fire. It also verifies
per-alert owner, severity, section-linked runbook, event-mode, and
deduplication metadata. It uses no Collector, Prometheus, Grafana, or network
service, so it is a repository gate rather than production alert-delivery
evidence.

## Containerized transport rehearsal

Run the opt-in Collector proof on a Docker host:

```bash
make phase4-observability-rehearsal
```

It sends correlated trace, log, and metric markers through the pinned
Collector, stops the capture gateway, queues another marker, restarts the
Collector with the gateway still unavailable, then restores the gateway and
proves the marker drains. It also checks Collector redaction, self-metrics,
and compares a real event-node application command's local latency before and
during the exporter outage. Evidence and sanitized logs are written under
`artifacts/phase4-observability/`.

This short isolated run is scheduled in CI and can be manually dispatched. It
does not prove production alert delivery, reference-hardware latency, a
24/72-hour storage budget, or a live PostgreSQL recovery operation.
