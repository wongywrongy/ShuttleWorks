# ADR 0023: Docker-first event node and entrant freeze at checkout

**Status:** Accepted — 2026-09-01

## Context

The event node must be repeatable on a director's laptop, survive process and
browser restarts, and be recoverable on replacement hardware. Entrant
submissions and live tournament operations have different ownership and
availability requirements; allowing both to mutate implicitly during checkout
would create an untestable synchronization policy.

## Decision

- The first event-node distribution is an explicit Docker Compose profile with
  console, API, SQLite-WAL database, worker, synchronization agent, and local
  telemetry Collector. Signed desktop packaging is deferred until the Docker
  workflow is proven.
- The supported disconnected-operation target is 72 hours, with bounded local
  storage, operation retention, WAL/checkpoint monitoring, and verified
  portable backups.
- Entrant submissions freeze when an event is checked out. The cloud/public
  entrant surface may show its last synchronized projection; new entrant
  changes require an explicit pre-event or post-event policy, never accidental
  merge behavior.
- Every tournament-operational console function—reads, writes, solve jobs,
  displays, printing/export, audit, backup, and recovery—uses the local node
  while checked out. Cloud account and billing administration is outside the
  live-event promise.

## Consequences

Docker gives one reproducible runtime and a clear upgrade/restore boundary,
with a higher initial packaging dependency than a browser-only cache. Freezing
entrants simplifies authority ownership and protects live bracket integrity;
operators must communicate the freeze and use the explicit recovery/reopen
workflow for exceptional changes.
