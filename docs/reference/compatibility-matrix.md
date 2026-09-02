# Cloud/node compatibility matrix

The checked-in [machine-readable matrix](./compatibility-matrix.json) is the
release compatibility contract for checkout and synchronization. The current
build supports the current operation and checkpoint schema plus the previous
two versions (`1`, `2`, and `3`). The runtime uses an explicit allow-list, so a
future or skipped version is rejected before it can mutate state.

The matrix records repository evidence only. It does not claim that a cloud
and node release have been deployed together or that a hardware rehearsal has
passed. Its generation labels exercise wire-schema policy in the current
build, not archived previous binaries. Actual rolling binary pairs still
require release artifacts and deployment evidence.

The repository gate keeps archived wire fixtures for checkpoint and operation
schema versions 1, 2, and 3 under
`tests/backend/fixtures/sync_compatibility/`. The compatibility tests import
each checkpoint fixture, ingest the operation fixtures across the supported
adjacent versions, and replay one operation to prove idempotence. Unsupported
versions are refused before any event operation or cursor is written (the
quarantine record is retained as intentional rejection evidence).

Competing checkout requests are rejected while an authority is preparing or
active. Operations from a closed, recovered, unknown, or otherwise stale epoch
are quarantined and do not advance the accepted cursor. A new authority epoch
is created only by the audited return, transfer, or lost-node recovery paths.
