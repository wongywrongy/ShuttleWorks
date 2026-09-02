# OpenTelemetry collection

The application remains vendor-neutral and fail-open.  The event-node
profile sends OTLP/HTTP to a local Collector and the Collector persists its
outbound queue in `file_storage`, so a WAN outage or Collector restart does
not discard telemetry already accepted by the node.  The queue is bounded
(`queue_size: 2048`) and must live on a dedicated data volume; operations,
SQLite, backups, and the operation log always take precedence when disk is
low.

`collector-event-node.yaml` is the offline-capable node agent.  Set
`OTEL_GATEWAY_ENDPOINT` to the HTTPS cloud OTLP/HTTP gateway and provide
`OTEL_GATEWAY_CA_FILE`, `OTEL_GATEWAY_CLIENT_CERT_FILE`, and
`OTEL_GATEWAY_CLIENT_KEY_FILE`. The gateway must validate the client
certificate against the private deployment CA; mTLS is the authenticated
transport and the client key remains a mounted OS/Compose secret.
Run the `event-node` Compose profile only after those files are mounted. The cloud
agent configuration binds its receiver to loopback and is intended for a
host/task collector in front of a gateway.

The event-node profile collects host/filesystem/disk signals and node-local
SQLite log files in addition to application OTLP. The cloud profile collects
host signals and PostgreSQL metrics; use a read-only monitoring role and a
TLS endpoint. PostgreSQL replication lag and last successful backup age must
also be exported by the standby/backup jobs under the metric names used by
the Prometheus rules.

## Queue and outage budget

The persistent queue holds 2,048 batches of at most 1,024 items. Capacity is
an item budget, not a time guarantee: validate it against measured event load.
At 80% utilization, discard low-priority debug logs first, then non-error
traces; never let telemetry storage consume the reserved SQLite, operation-log,
or verified-backup headroom. Metrics, error logs, authority/recovery audit
signals, and operation synchronization data have highest retention priority.

The repository target is no loss for a 24-hour WAN outage at the ratified
reference load, with a documented degradation plan through 72 hours. Those
budgets require a reference-hardware soak and cannot be proven by configuration
validation or unit tests.

Both configurations use a local health endpoint on port 13133 and the three
OTLP signals.  Application privacy filtering remains the first boundary;
the Collector deletes common authorization, cookie, request-body, SQL, and
exception-message attributes as a second defensive boundary.

## Operational dashboard and alerts

The versioned contracts, directly loadable Prometheus rules, and importable
Grafana dashboard are in [`infra/observability`](../observability/). The
owner, thresholds, privacy rules, and response steps are in
the [observability runbook](../../docs/how-to/observability-runbook.md).
