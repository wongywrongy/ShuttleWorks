# ADR 0022: Authority epochs and domain-operation synchronization

**Status:** Accepted — 2026-09-01

## Context

An event node can be offline for multiple days. Browser queues and database
replication are insufficient: browsers can be cleared, and valid SQL row
changes can still represent an invalid tournament state. Reconnection must not
create a hidden second writer or lose an operation that was acknowledged
locally.

## Decision

- Each checked-out tournament has exactly one live authority epoch. The
  director event node owns operational writes for that epoch; cloud operational
  endpoints are read-only for the event.
- The node commits normalized state, audit history, an immutable operation
  envelope, and its synchronization outbox in one local transaction before
  acknowledging the command.
- Synchronization uploads ordered, replayable domain operations. Operations are
  globally identified, carry tournament/node/epoch identity, a monotonic
  sequence, actor, command and aggregate versions, schema version, timestamps,
  and trace context.
- Cloud ingestion is idempotent and ordered. Duplicates are re-acknowledged;
  gaps, wrong epochs, unsupported schemas, invalid signatures/checksums, and
  semantic conflicts are explicitly rejected or quarantined. Divergent live
  histories are reconciled with an audited correction operation, never a
  direct row edit or generic last-write-wins merge.
- Returning authority to the cloud, recovery of a replacement node, and
  revocation are explicit audited epoch transitions.

## Consequences

The protocol is more work than replicating tables, but it has testable failure
semantics and deterministic replay. The UI can truthfully distinguish local
commit, cloud synchronization, freshness, and reconciliation state. Browser
storage remains a retry/UX aid and is never the source of truth.
