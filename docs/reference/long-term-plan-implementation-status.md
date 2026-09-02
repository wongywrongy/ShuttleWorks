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
| Phase 1 — boundaries and normalized persistence | Partial | Explicit composition roots; atomic bracket-result, match-state update/delete/reset/replace/merge, bracket assignment/action/pin/lifecycle, onsite roster replacement, operator-command, schedule-commit, and workspace identity/member slices; normalized bracket checkpoint data; shrinking architecture baseline | Normalize remaining live domains, retire mutable `tournaments.data` authority incrementally, move remaining sync implementation internals behind the new boundary modules, and remove raw session/commit access from remaining routes/domain modules |
| Phase 2 — event-node foundation | Partial | SQLite WAL profile, local worker/sync agent, Collector, encrypted verified backup scheduler, health status, signed transport-neutral package prototype, checked-out operator-policy import and event-scoped offline sessions, opt-in LAN TLS edge/preflight, isolated restore preflight, and deterministic WAN-blocked restart/browser-storage durability gate | Desktop installer/notarization and release signing integration, OS credential storage, production CA distribution/firewall and certificate-renewal rehearsal, full operator-function E2E coverage, reference-hardware clean-machine/RTO proof, abrupt power-loss proof, and 24-hour WAN-blocked soak |
| Phase 3 — checkout and synchronization | Core repository behavior implemented; complete acceptance pending | Enrolled devices, node-key-bound signed grants/ready proofs, database-enforced live epochs, atomic sequence allocation, serialized/idempotent sync, write fencing, return/transfer, replay-complete recovery, acknowledged correction reconciliation, permanent-blocked surfacing, projection rebuild, archived wire fixtures, competing/stale-authority and chaos gates, and replayable match/bracket/roster/schedule operations | Add the remaining full-stack WAN-blocked operator-function scenarios, run the matrix with archived release binaries and deployed PostgreSQL/event nodes, and obtain operational sign-off; remaining normalized-write migration belongs to Phase 1 |
| Phase 4 — telemetry and operations | Repository assets and isolated deployment rehearsal implemented; production proof pending | Authenticated mTLS Collector templates, persistent node queue, host/filesystem/PostgreSQL/node-storage signals, directly loadable Prometheus rules and Grafana dashboard, redaction/cardinality/config validation, queue priority and 24/72-hour budgets, local game day and OTLP outage→restart→drain rehearsal, checksummed backup manifest, and safe DR dry-run contracts | Deploy certificates/Collectors/backend, provision offsite archives/standby, prove production queue drain/correlation and alert delivery, prove live PostgreSQL PITR/fenced promotion/rejoin, and measure the budgets on reference hardware |
| Phase 5 — security and release readiness | Partial | CodeQL and independent dependency audits, fail-closed clean container scans, CI-plus-security release prerequisite, SBOM, provenance, keyless image signing, immutable action/base-image pins, exact release/SHA tags, signed update/rollback metadata, cross-tenant route enumeration, and a machine-readable seven-surface threat/risk register | Desktop signing/staged updater, notarization, OS credential custody, penetration/hostile-LAN tests, administrator rulesets/approvals, production risk acceptance, beta events, and staffed support ownership remain |

The release may claim the implemented vertical slice, not completion of the
full three-to-five-year plan. The detailed tournament-critical acceptance
contract is the [offline operator-function matrix](./offline-operator-acceptance-matrix.md).

## Current repository gate blockers — 2026-09-02

ShuttleWorks is **not yet production-accepted**. All three runtime images now
pass the fail-closed high/critical scan: the backend final stage moved from the
affected Debian runtime to an immutable Ubuntu 24.04 digest while preserving
Python 3.12 and the pinned OR-Tools version. No vulnerability exception was
used.

The tournament-critical functions now have explicit offline domain operations,
but the authoritative matrix still requires full-stack WAN-blocked browser
coverage for each function. Unit, route, and deterministic operation-replay
evidence does not substitute for that end-to-end acceptance proof.

The route-facing sync transaction owner has moved to `sync/application.py`
and named boundary modules now define the intended authority, checkpoint,
operation-log, ingestion/projection, recovery and reconciliation seams.
Compatibility implementations still remain in `sync/service.py`; completing
that internal move without changing public contracts is maintainability work
still required by Phase 1, not a production capability claim.

## Cross-phase recheck — 2026-09-02

This is a repository-evidence review, not production acceptance. On 2026-09-02
the clean-container SQLite backend run passed 2,277 tests with 70
environment/optional-dialect skips; the focused PostgreSQL migration,
concurrency, authority, projection, recovery and tenancy checks passed, as did
the four canonical browser contracts. Import boundaries, Ruff, bytecode
compilation, release-workflow structure, documentation paths/build, console
DTO parity/build, Collector validation, Prometheus rule validation and diff
hygiene also passed. All runtime container vulnerability gates pass.

| Phase | Recheck verdict | Boundary before further work |
|---|---|---|
| 0 | Substantially implemented | Product owners still must ratify reference load/hardware, failure domains, and cloud RPO. |
| 1 | Partial, progressing | Raw `repo.session` access is eliminated; 68 commit calls remain in persistence/service/worker transaction owners, while broader normalization remains the principal code debt. |
| 2 | Repository foundation implemented, operational proof pending | Installer/notarization, OS credential custody, reference-hardware restore/power-loss, and 24/72-hour WAN-blocked runs remain external. |
| 3 | Core repository behavior implemented; acceptance incomplete | Full-stack WAN-blocked coverage for every matrix row plus archived-binary/deployed-node chaos and operator sign-off remain. |
| 4 | Repository assets and isolated deployment rehearsal implemented; production proof pending | The local game day, expanded signal/alert contract, containerized queue outage/restart/drain and correlation proof, backup manifest, and safe DR dry runs pass. Production alert delivery and queue drain, host/LAN signals, PostgreSQL PITR/promotion/rejoin, and reference-hardware capacity budgets require deployed infrastructure. |
| 5 | Partial | Runtime images pass the high/critical scan. Desktop signing/updater integration, penetration/hostile-LAN testing, risk acceptance, beta events, and staffed support remain. |
