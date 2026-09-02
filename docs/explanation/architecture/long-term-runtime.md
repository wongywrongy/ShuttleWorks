# Long-term runtime architecture

ShuttleWorks is an offline-first hybrid system implemented as a modular
monolith with explicit cloud and event-node deployment profiles. This page is
the concise runtime reference; the accepted decisions below are normative
when an implementation choice is not obvious.

## Runtime boundary

The product has four explicit surfaces: the authenticated operator console;
the public/entrant site; the API/application layer; and persistence. The first
two are separate browser origins. The API remains one modular monolith with
cloud and event-node composition roots, and persistence is deliberately split
by deployment responsibility:

```text
Cloud control plane (PostgreSQL)
  organizations · identity · billing · pre-event collaboration
  event archive · operation ingestion · read projections · backups/WAL

Director event node (SQLite WAL)
  local console/API · worker · displays · backup/recovery · sync outbox
  authoritative live writes for one tournament authority epoch
```

The node is a real operational system, not a browser cache. Blocking WAN
traffic must leave tournament setup, planning, draws, scheduling, live-day
control, results, displays, print/export, audit, backup, and recovery usable.
The supported disconnected-operation target is 72 hours. Entrant submissions
freeze at checkout; the cloud can serve its last synchronized projection while
the node owns live operations.

## Data and synchronization

The cloud uses PostgreSQL with asynchronous physical streaming replication and
continuous WAL archiving as the initial two-server durability topology. Manual,
fenced promotion is the initial failover policy; Server 2 is not a backup
replacement. Encrypted, versioned backups and restore drills remain required.

The node commits normalized state, audit, immutable domain operation, and sync
outbox atomically. Operations carry an authority epoch, monotonic sequence,
aggregate/version information, schema version, and trace context. Cloud
ingestion is idempotent and ordered, with explicit gap/error/quarantine states;
generic last-write-wins is never used for semantic tournament changes.

Checkout creates a signed, node-scoped authority epoch and freezes cloud/live
entrant mutation. A planned transfer closes the drained source epoch before a
new node prepares; lost-node recovery additionally requires a digest-bound
backup plus the exact cloud-receipted operation suffix. Return to cloud is
accepted only when the declared node sequence equals the cloud cursor and the
rebuilt projection digest matches. Gaps and semantic conflicts are quarantined
as immutable evidence. Reconciliation links that evidence to a separately
applied, cloud-acknowledged correction operation; it never rewrites or silently
discards the rejected operation.

## Composition and release

Cloud and event-node composition roots bind their own persistence, workers,
sync, and telemetry adapters while sharing domain behavior. The named roots
are `shuttleworks.cloud.main`, `shuttleworks.event_node.main`,
`shuttleworks.worker.main`, and `shuttleworks.sync.main`. The legacy
`core.main` and `worker.py` entry points remain compatibility shims during the
transition so existing deployments do not change startup targets accidentally.

Release images are built only after successful CI for the exact source commit.
They carry a long commit-SHA tag and OCI revision metadata. Release Compose
requires an explicit `TAG`; it has no mutable `latest` fallback. The current
release plus the previous two compatible operation/checkpoint schema releases
are supported and covered by compatibility and restore checks.

Automated tests exercise these protocol and restore contracts. Physical
reference-hardware validation, abrupt-power testing, and the 24-hour and
72-hour disconnected soak rehearsals remain pending operational acceptance;
they are not implied by green unit or container tests.

See [ADR 0021](/explanation/decisions/0021-hybrid-persistence-and-cloud-wal),
[ADR 0022](/explanation/decisions/0022-authority-epochs-and-domain-operations),
[ADR 0023](/explanation/decisions/0023-docker-first-event-node-and-entrant-freeze),
and [ADR 0024](/explanation/decisions/0024-compatibility-and-release-governance).
