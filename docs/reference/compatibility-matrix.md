# Cloud/node compatibility matrix

The [machine-readable matrix](./compatibility-matrix.json) uses policy
`current-only-until-ga`. Operation and checkpoint schemas both restart at 1.

| Document | Current | Supported |
| --- | --- | --- |
| Operation envelope | 1 | 1 |
| Checkpoint | 1 | 1 |
| Tournament blob | 1 | 1 |

The repository exercises one current-cloud/current-node case, one operation
fixture and one checkpoint fixture. Tests prove import, ingestion, idempotent
replay, and rejection of version 2 without advancing the accepted cursor.
Unknown operation versions are quarantined. Competing authority and stale
epoch rejection remain enforced.

The matrix describes repository tests; it does not claim external deployment
or rolling-binary evidence. `event_node/update.py` reports the same allow-lists.
A stale pre-launch database must be [reset](../how-to/reset-prelaunch-database.md).

The current-plus-two compatibility window activates at the first external
installation of a tagged release, as defined by the
[migration policy](migration-and-versioning-policy.md) and
[ADR 0024](../explanation/decisions/0024-compatibility-and-release-governance.md).
Immutable image tags and CI-verified release publication remain required now.
