# OpenTelemetry collection

The application remains vendor-neutral and fail-open.  The event-node
profile sends OTLP/HTTP to a local Collector and the Collector persists its
outbound queue in `file_storage`, so a WAN outage or Collector restart does
not discard telemetry already accepted by the node.  The queue is bounded
(`queue_size: 2048`) and must live on a dedicated data volume; operations,
SQLite, backups, and the operation log always take precedence when disk is
low.

`collector-event-node.yaml` is the offline-capable node agent.  Set
`OTEL_GATEWAY_ENDPOINT` to the cloud OTLP/HTTP gateway (for example,
`http://gateway:4318`) and run the `event-node` Compose profile.  The cloud
agent configuration binds its receiver to loopback and is intended for a
host/task collector in front of a gateway.

Both configurations use a local health endpoint on port 13133 and the three
OTLP signals.  Application privacy filtering remains the first boundary;
the Collector deletes common authorization, cookie, request-body, SQL, and
exception-message attributes as a second defensive boundary.

## Operational dashboard and alerts

The versioned, backend-neutral panel and alert contracts are in
[`infra/observability`](../observability/). Import the dashboard into the
chosen metrics backend and translate the PromQL-compatible alert expressions
if necessary. The owner, thresholds, privacy rules, and response steps are in
the [observability runbook](../../docs/how-to/observability-runbook.md).
