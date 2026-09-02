# Long-term plan implementation status

This page records what the September 2026 architecture and observability plan
proves in the repository today. It is intentionally stricter than a feature
list: configuration templates and unit tests do not count as a production
rehearsal.

## Phase 1 boundary baseline

The repository now has a machine-readable, shrinking baseline for the
remaining persistence-boundary debt in
[architecture-boundary-inventory.json](./architecture-boundary-inventory.json).
The AST guard in `tests/backend/unit/test_architecture_boundary_inventory.py`
fails when a tracked module adds a raw `repo.session` access, commit call,
SQLAlchemy import, or `tournaments.data` reference. It does not treat the
baseline as approval: each count must only stay the same or decrease, and a
new leaking file must be assigned to an owner before it can merge.

The current non-migration baseline is 0 `repo.session` accesses, 68 commit
calls, 51 SQLAlchemy imports, and 18 `tournaments.data` references. Counts are
grouped by the responsible module owner below; the JSON file is authoritative
for per-file and use-case detail.

| Module owner | repo.session | commits | SQLAlchemy imports | tournaments.data |
|---|---:|---:|---:|---:|
| `entries-module-owner` | 0 | 1 | 20 | 1 |
| `identity-module-owner` | 0 | 0 | 9 | 0 |
| `meet-module-owner` | 0 | 0 | 0 | 0 |
| `workspace-module-owner` | 0 | 0 | 0 | 0 |
| `persistence-owner` | 0 | 37 | 11 | 9 |
| `platform-architecture-owner` | 0 | 0 | 1 | 3 |
| `display-module-owner` | 0 | 0 | 0 | 0 |
| `worker-owner` | 0 | 8 | 4 | 0 |
| `sync-module-owner` | 0 | 22 | 3 | 0 |
| `platform-oncall` | 0 | 0 | 2 | 0 |
| `bracket-module-owner` | 0 | 0 | 1 | 5 |
| `operations-module-owner` | 0 | 0 | 0 | 0 |

Alembic migration files are excluded from the import baseline because they are
persistence adapters by definition. The next Phase 1 work is to move live
commands behind application services and repositories, then lower these
counts; no unsupported normalization or migration is claimed here.

| Plan phase | Repository status | Evidence delivered | Work still required |
|---|---|---|---|
| Phase 0 — decisions and safety net | Substantially implemented | Hybrid/authority/release ADRs, authoritative offline matrix, release gate, pinned actions | Ratify owners, reference hardware/load model, cloud RPO, and failure-domain inventory |
| Phase 1 — boundaries and normalized persistence | Partial | Explicit composition roots; atomic bracket-result, match-state update/delete/reset/replace/merge, bracket assignment/action/pin, operator-command, schedule-commit, and tournament workspace identity/member slices; normalized bracket checkpoint data; shrinking architecture baseline | Normalize remaining live domains, operationize bracket create/delete and event generation, retire mutable `tournaments.data` authority, and remove raw session/commit access from all routes and domain modules |
| Phase 2 — event-node foundation | Partial | SQLite WAL profile, local worker/sync agent, Collector, encrypted verified backup scheduler, health status, signed transport-neutral package prototype, checked-out operator-policy import and event-scoped offline sessions, opt-in LAN TLS edge/preflight, isolated restore preflight, and deterministic WAN-blocked restart/browser-storage durability gate | Desktop installer/notarization and release signing integration, OS credential storage, production CA distribution/firewall and certificate-renewal rehearsal, full operator-function E2E coverage, reference-hardware clean-machine/RTO proof, abrupt power-loss proof, and 24-hour WAN-blocked soak |
| Phase 3 — checkout and synchronization | Repository implementation complete; deployment proof pending | Enrolled devices, signed grants and ready proofs, epochs, checkpoint import, ordered idempotent sync, write fencing, return/transfer/recovery, quarantine/reconciliation UI, atomic checkpoint-plus-receipted-operation cloud projection rebuild, current-plus-two archived wire fixtures, competing/stale-authority and chaos gates, digest-bound match-state replacement, deterministic bulk merge, exact-set reset, atomic idempotent bracket lifecycle/direct placement/pin operations, and direct signed checkout→ready→offline→drain→rebuild→digest-confirmed-return rehearsal | Run the same matrix with archived release binaries and deployed PostgreSQL/event nodes, then obtain operational sign-off; remaining normalized-write migration belongs to Phase 1 |
| Phase 4 — telemetry and operations | Repository assets and isolated deployment rehearsal implemented; production proof pending | Agent/gateway Collector configs, persistent node queue, database, backup, process, and Collector signals, dashboard/alerts/runbooks, deterministic local game day, containerized correlated OTLP outage→restart→drain rehearsal with scheduled evidence, checksummed PostgreSQL backup manifest, and safe PITR/failover/rejoin dry-run contracts | Deploy the backend, provision offsite archives/standby, deliver real alerts, prove production queue drain and correlation, add host/LAN monitoring, prove live PostgreSQL PITR and fenced promotion/rejoin, and measure reference-hardware 24/72-hour budgets |
| Phase 5 — security and release readiness | Partial | CodeQL/dependency/container scans, SBOM, provenance, keyless image signing, immutable action pins, signed transport-neutral event-node update/rollback metadata, cross-tenant route enumeration, and a machine-readable seven-surface threat/risk register | Desktop signing/staged updater, notarization, OS credential custody, penetration and hostile-LAN tests, administrator rulesets/approvals, production risk acceptance, beta events, and staffed support ownership |

The release may claim the implemented vertical slice, not completion of the
full three-to-five-year plan. The detailed tournament-critical acceptance
contract is the [offline operator-function matrix](./offline-operator-acceptance-matrix.md).

## Cross-phase recheck — 2026-09-01

This is a repository-evidence review, not production acceptance. The focused
cross-phase suite passed 147 tests; import boundaries, Ruff, bytecode
compilation, release-workflow structure, documentation paths/build, console
DTO parity/build, and diff hygiene also passed during the implementation run.

| Phase | Recheck verdict | Boundary before further work |
|---|---|---|
| 0 | Substantially implemented | Product owners still must ratify reference load/hardware, failure domains, and cloud RPO. |
| 1 | Partial, progressing | Raw `repo.session` access is eliminated; 68 commit calls remain in persistence/service/worker transaction owners, while broader normalization remains the principal code debt. |
| 2 | Repository foundation implemented, operational proof pending | Installer/notarization, OS credential custody, reference-hardware restore/power-loss, and 24/72-hour WAN-blocked runs remain external. |
| 3 | Repository implementation complete | External archived-binary/deployed-node chaos and operator sign-off remain release evidence, not missing repository behavior. |
| 4 | Repository assets and isolated deployment rehearsal implemented; production proof pending | The local game day, expanded signal/alert contract, containerized queue outage/restart/drain and correlation proof, backup manifest, and safe DR dry runs pass. Production alert delivery and queue drain, host/LAN signals, PostgreSQL PITR/promotion/rejoin, and reference-hardware capacity budgets require deployed infrastructure. |
| 5 | Partial | Desktop signing/updater integration, penetration/hostile-LAN testing, risk acceptance, beta events, and staffed support remain. |
