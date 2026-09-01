# Export application telemetry

ShuttleWorks can emit traces, logs and product metrics directly to any
OpenTelemetry Protocol (OTLP) HTTP receiver. It does not require or deploy a
collector, storage backend, dashboard or vendor SDK.

Telemetry is **off by default**. With `OTEL_EXPORTER_OTLP_ENDPOINT` absent or
empty, the application does not import the OpenTelemetry SDK, add a log handler,
start an exporter thread or make a connection attempt.

## Enable OTLP emission

Set the same generic endpoint on the API and every standalone worker:

```dotenv
OTEL_EXPORTER_OTLP_ENDPOINT=https://telemetry.example.net:4318
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer%20REDACTED
OTEL_EXPORTER_OTLP_TIMEOUT=2
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

## Service identity

| Process | `service.name` | Instance source |
|---|---|---|
| API, including its embedded worker | `shuttleworks-api` | `WORKER_ID` when set, otherwise hostname |
| Standalone solve worker | `shuttleworks-worker` | worker CLI/configured ID |

All processes use the same application version source and map `ENVIRONMENT` to
`deployment.environment.name`. Embedded work intentionally retains the API
process identity: a second provider inside one process would split automatic
HTTP, SQL and log correlation.

## What is emitted

- FastAPI server spans, excluding `/health`, `/health/ready`, `/health/deep`,
  `/health/metrics` and `/version`.
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
