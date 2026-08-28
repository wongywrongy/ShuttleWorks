# ShuttleWorks Performance and Code-Health Program

## Constraints

- Developer-cycle time leads; measured runtime work follows.
- Preserve all console, entrant, API, persistence, scheduling, auth, offline, and display behavior.
- Keep `make check` as the complete gate; add a fast iteration target.
- Preserve accepted ADRs and shipped Alembic migrations.
- Distill current status, then remove historical plans/audits/archives from HEAD; Git retains provenance.
- Performance changes require before/after evidence and must not regress another tracked metric materially.

## Tasks

1. Establish a reproducible dependency and timing baseline.
2. Add fast/full developer checks and split expensive test tiers without dropping maintained coverage.
3. Prune stale e2e work, duplicate waits/navigation, and repeated e2e installation work.
4. Remove verified dead code and eliminate no-op polling/store work.
5. Optimize measured backend query/cache paths with response and query-count parity tests.
6. Decompose the bracket and repository hotspots behind stable facades.
7. Distill current documentation, prune historical trees, and add fail-closed documentation path checks.
8. Run full verification, browser workflows, performance comparison, and final code review.

## Public Interface Guarantees

- No URL, method, payload, status, header, OpenAPI-name, entrant HTML, capability-link, queue, solver-result, or database-schema changes.
- New public developer commands are limited to fast/full check targets, split test targets, and docs checks.

## Verification

- Full console, entrant, backend, architecture, docs, and maintained Playwright gates.
- SQLite/Postgres query and response parity where persistence changes.
- Deterministic scheduler golden masters unchanged.
- Browser validation of operator, entrant, Operations, and Display workflows.
- Before/after timings, query counts, bundle sizes, and repository-size report.
