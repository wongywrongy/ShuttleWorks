# Export application telemetry

ShuttleWorks emits traces, logs and product metrics using OpenTelemetry
Protocol (OTLP) HTTP. The application has no telemetry dependency in the
command success path. Production/cloud deployments may send to a local host
Collector; the event-node Compose profile includes a Collector with a
disk-backed, bounded queue so telemetry survives a WAN outage and Collector
restart.

Telemetry is **off by default**. With `OTEL_EXPORTER_OTLP_ENDPOINT` absent or
empty, the application does not import the OpenTelemetry SDK, add a log handler,
start an exporter thread or make a connection attempt.

## Enable OTLP emission

For a direct cloud endpoint, set the same generic endpoint on the API and every
standalone worker:

```dotenv
OTEL_EXPORTER_OTLP_ENDPOINT=https://telemetry.example.net:4318
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer%20REDACTED
OTEL_EXPORTER_OTLP_TIMEOUT=2
# Stable HTTP semantic conventions (request duration + active requests).
OTEL_SEMCONV_STABILITY_OPT_IN=http
```

The HTTP/protobuf exporter sends to `/v1/traces`, `/v1/logs` and `/v1/metrics`
under that base URL. Signal-specific standard variables such as
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` may override a complete signal URL. Keep
`OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`; unsupported protocols leave
telemetry disabled rather than preventing the process from starting.

The self-host and worker environment templates contain these variables with an
empty endpoint. Enabling them requires only a container restart:

```bash
docker compose -f infra/compose/docker-compose.selfhost.yml up -d
docker compose -f infra/compose/docker-compose.worker.yml up -d
```

An unreachable receiver does not affect startup, requests or solves. Export is
batched, bounded and fail-open; failed telemetry is discarded without an
application warning. Diagnose the receiver and network independently rather
than expecting ShuttleWorks to provide backend health.

## Event-node Collector

Run the event-node profile when the director laptop needs offline-capable
collection:

```bash
docker compose \
  -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.event-node.yml \
  --profile event-node up -d --build
```

The API and worker target `http://otel-collector:4318` on the private Compose
network. The Collector stores its outbound queue in the named
`event_node_otel` volume and forwards to `OTEL_GATEWAY_ENDPOINT` when a gateway
is reachable:

```dotenv
OTEL_GATEWAY_ENDPOINT=https://telemetry.example.net:4318
OTEL_NODE_ID=node-7f3a9c
```

The queue is bounded at 2,048 requests and the Collector has a 128 MiB memory
limit. Keep the volume on a disk with an explicit quota and alert before it is
full; SQLite, backups, and the operation log always take priority over
telemetry. Collector health is available on loopback port 13133. Detailed
Collector self-metrics are available on loopback port 8888 for the queue and
export alert contract. The version-controlled configuration and defensive redaction processor live in
[`infra/otel/collector-event-node.yaml`](../../infra/otel/collector-event-node.yaml).

Cloud hosts can use [`infra/otel/collector-cloud.yaml`](../../infra/otel/collector-cloud.yaml)
as a loopback-bound agent in front of the gateway. It has bounded in-memory
retry rather than the event-node durable queue.

## Service identity

| Process | `service.name` | Instance source |
|---|---|---|
| API, including its embedded worker | `shuttleworks-api` | `WORKER_ID` when set, otherwise hostname |
| Standalone solve worker | `shuttleworks-worker` | worker CLI/configured ID |

Every signal also carries controlled `shuttleworks.deployment.profile` (`cloud`
or `event_node`), `shuttleworks.release.channel`, and, for an enrolled event
node, a pseudonymous `shuttleworks.node.id`. These are resource attributes,
not metric dimensions. Participant, event, operation, account, and free-form
labels are not admitted as metric attributes.

All processes use the same application version source and map `ENVIRONMENT` to
`deployment.environment.name`. Embedded work intentionally retains the API
process identity: a second provider inside one process would split automatic
HTTP, SQL and log correlation.

## What is emitted

- FastAPI server spans, excluding `/health`, `/health/ready`, `/health/deep`,
  `/health/metrics`, `/health/backups` and `/version`.
- SQLAlchemy and stdlib urllib child spans. SQL text, headers, bodies, query
  strings and dynamic exception text are removed before export.
- A `solve_jobs publish` producer span and a `solve_jobs process` consumer span.
  The database row carries W3C `traceparent`/`tracestate`, so a worker on another
  machine continues the originating request trace. Baggage is never persisted.
- A first-class `scheduler.solve` span with bounded solver outcome, objective,
  wall time and problem-size attributes.
- Existing Python logs correlated with the current trace and span. Console
  logging is unchanged. OTLP receives the literal message template, never its
  dynamic arguments, traceback, email body or arbitrary `extra` fields.
- Product metrics for solve duration, queue depth/age/wait, job outcomes, lease
  health and optimistic state conflicts. Metric dimensions are bounded enums or
  route templates; job, tournament, worker and person identifiers are refused.

`/health/metrics` remains a backward-compatible JSON endpoint. Its queue and
lease calculations are also the source of the native OTel gauges.

Event-node deployments additionally expose guarded `/health/backups`, a safe
status projection for the fail-open backup scheduler (last success, retained
generations, free disk, and restore-test status).

## SSE behavior

The bracket schedule stream has one HTTP server span for the complete stream
lifetime. It creates no span per SSE event and suppresses ASGI send/receive
spans. The request context is copied into the solver executor thread, so the
CP-SAT span remains a child of the stream. A client disconnect is a normal end,
not an error.

## Add telemetry to backend code

Use `core.telemetry.instruments` rather than importing the SDK into a domain
package. The facade is a no-op when telemetry is disabled and keeps provider
ownership in the composition root.

Before adding an attribute:

1. Add it to the relevant allow-list in `core.telemetry.privacy`.
2. Prove it cannot contain a player name, email address, phone number, token,
   request body, SQL value or dynamic exception message.
3. For metrics, prove both the key and every value are bounded. IDs are allowed
   on spans and logs but never on metric points.
4. Add a negative-control test that submits a forbidden key/value and observes
   rejection. A test that merely checks the current attributes is insufficient.

Span names and log templates must be static. Keep logging through the standard
library exactly as elsewhere; the OTLP handler supplies correlation and privacy
projection. Do not add a backend-specific exporter, resource key or SDK.

When adding a new asynchronous rail, persist only W3C Trace Context. Use a
direct consumer parent only for one-message processing without another ambient
server span; otherwise prefer a link and document the relationship.

## Verification commands

```bash
.venv/bin/pytest -q tests/backend/unit/test_telemetry.py
.venv/bin/pytest -q tests/backend/unit/test_telemetry_job_rail.py
make check
```

The telemetry tests include explicit controls for disabled startup, unreachable
export, PII rejection, cross-process trace continuity and metric cardinality.

The short containerized outage/restart/drain proof is intentionally separate
from the default test gate:

```bash
make phase4-observability-rehearsal
```

It writes versioned evidence under `artifacts/phase4-observability/` and is
also available through the scheduled/manual Phase 4 workflow.
