# ADR 0021: PostgreSQL cloud control plane with SQLite event nodes

**Status:** Accepted — 2026-09-01

## Context

ShuttleWorks must keep tournament operations available through a complete WAN
outage, while the cloud must support organizations, identity, billing,
pre-event collaboration, and durable event history. A single database engine
does not serve both environments well: PostgreSQL is operationally appropriate
for the multi-tenant cloud, but a PostgreSQL server on every director laptop
adds installation and support burden without solving offline conflict handling.

Raw database replication is not the synchronization protocol. Row replication
cannot express whether a score, bracket advancement, or roster change is a
valid domain operation, and an offline laptop must be able to continue writing
without a cloud connection.

## Decision

- The self-hosted cloud control plane uses PostgreSQL.
- A checked-out tournament event node uses embedded SQLite in WAL mode. SQLite
  is an intentional edge deployment, not a development substitute.
- The event node is authoritative for live operational writes during its
  authority epoch. The cloud stores an ordered, replayable domain-operation
  stream and read projections.
- The initial two-server cloud topology uses PostgreSQL physical streaming
  replication, continuous WAL archiving, and scripted manual failover with
  fencing. Replication is asynchronous by default; the cloud RPO policy must be
  explicit before launch. A replica never replaces encrypted, versioned,
  independently retained backups.
- Cloud and edge migrations may differ physically, but canonical operation and
  checkpoint schemas are versioned and tested across the supported releases.

## Consequences

The cloud gets PostgreSQL concurrency and familiar backup/PITR tooling. The
event node remains installable, portable, and operational when disconnected.
Synchronization must be implemented at the application/domain layer, with
idempotency, ordering, authority checks, and quarantine for invalid input.
Two servers reduce recovery time but do not provide automatic split-brain-safe
HA; automatic promotion waits for independent quorum and fencing.
