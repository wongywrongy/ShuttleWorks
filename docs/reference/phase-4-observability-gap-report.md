# Phase 4 observability gap report

The repository now contains the Phase 4 telemetry contracts: privacy and
cardinality enforcement, cloud/event-node Collector configurations with a
bounded persistent event-node queue, versioned dashboard/alert contracts, and
runbook references. A deterministic synthetic game-day now exercises the
application telemetry facades, privacy boundary, alert thresholds, dashboard
links, and runbook ownership. These are repository-level guarantees,
validated by the telemetry test suite; they do not prove OTLP ingestion or
alert delivery at a real backend.

An opt-in containerized rehearsal now goes beyond that synthetic proof: it
sends correlated OTLP traces, logs, and metrics through the pinned Collector,
forces a gateway outage, restarts the Collector, verifies durable reconnect
drain and boundary redaction, checks Collector self-metrics, and compares a
real local event-node command before and during the exporter outage. A weekly
and manually dispatched workflow retains the evidence. This is still an
isolated repository deployment, not a production backend or reference node.

The repository also validates the PostgreSQL DR boundary without touching a
server: portable backup manifests record an explicit creation timestamp,
schema/tool versions, and a sorted payload inventory before checksums are
created and tamper-checked; missing or extra files and stanza mismatches are
rejected. PITR restore checks refuse live-looking targets, and promotion/rejoin
dry runs prove fencing and ordering preconditions. These tests are
structural/safe simulations only.

The remaining definition-of-done items require deployed infrastructure and
are intentionally not claimed by the short rehearsal: real alert delivery and
backend correlation, host/LAN signals, reference-hardware command latency,
PostgreSQL WAL/PITR and standby drills, production queue drain, and measured
24/72-hour cardinality/cost/disk budgets.

The machine-readable inventory is
[`phase-4-observability-gap-report.json`](./phase-4-observability-gap-report.json).
The emitted/configured/presented signal mapping is recorded separately in the
[`phase-4-telemetry-signal-audit`](./phase-4-telemetry-signal-audit.md).
