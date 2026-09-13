# Decisions (ADR log)

This is the Architecture Decision Record log — the *why* behind the shape of ShuttleWorks. Each
record states a **status**, the **context** that forced the decision, the **decision** itself, and
its **consequences**. They are deliberately short; the code and the architecture pages carry the
detail.

These records consolidate the current architectural rationale. Where a record
references a longer source, it names the file rather than duplicating it.

## Records

| # | Decision | Status |
| --- | --- | --- |
| [0001](/explanation/decisions/0001-four-module-split) | Four-module split (Meet · Bracket · Operations · Display) | Accepted (extended 2026-08-06 — Entries joined Tier-1) |
| [0002](/explanation/decisions/0002-workspace-as-control-plane) | Workspace as the control plane | Accepted |
| [0003](/explanation/decisions/0003-sqlite-as-primary-persistence) | SQLite as primary persistence | Accepted (mirror clause superseded by 0012) |
| [0004](/explanation/decisions/0004-ortools-cpsat-engine) | OR-Tools CP-SAT as the scheduling engine | Accepted |
| [0005](/explanation/decisions/0005-coming-soon-elimination) | `coming_soon` elimination | Accepted |
| [0006](/explanation/decisions/0006-unified-scheduling-core) | Unify the scheduling core; do not merge the match record | Accepted |
| [0007](/explanation/decisions/0007-bracket-result-command-queue) | Bracket results through the command queue | Accepted |
| [0008](/explanation/decisions/0008-shared-scoring-fields) | Share the scoring field set; add Bracket Sets scoring without a migration | Accepted |
| [0009](/explanation/decisions/0009-universal-match-contract) | Universal match contract | Accepted |
| [0010](/explanation/decisions/0010-nav-model-in-platform) | Nav model in the platform layer; `platform ↛ app` enforced as error | Accepted |
| [0011](/explanation/decisions/0011-cross-product-boundary-policy) | Cross-product boundary policy (accept legit edges, relocate misplaced code, defer debt) | Accepted |
| [0012](/explanation/decisions/0012-remove-the-supabase-mirror) | Remove the Supabase mirror | Accepted |
| [0013](/explanation/decisions/0013-shared-ui-promotion-policy) | Shared-UI promotion policy | Accepted |
| [0014](/explanation/decisions/0014-workspace-vs-tournament-vocabulary) | Workspace is the product word; tournament is the storage word | Accepted |
| [0015](/explanation/decisions/0015-court-policy) | Court policy: queue-run vs court-tied scheduling | Accepted |
| [0016](/explanation/decisions/0016-demo-production-parity-and-durability) | Private demo production parity and durability | Accepted |
| [0017](/explanation/decisions/0017-domain-derived-setup-readiness) | Derive Setup readiness from domain state; domain-owned sections are read-only | Accepted |
| [0018](/explanation/decisions/0018-public-person-universality) | Public person universality and tournament-scoped identity | Accepted (2026-08-31) |
| [0019](/explanation/decisions/0019-design-system-consolidation-pass) | Design-system consolidation pass and its recorded deferrals | Accepted (2026-08-31) |
| [0020](/explanation/decisions/0020-design-language-resolutions) | Design-language resolutions: per-tier radius, one status-tone source, EmptyState variants, dialog primaries | Accepted (2026-08-31) |
| [0021](/explanation/decisions/0021-hybrid-persistence-and-cloud-wal) | PostgreSQL cloud control plane with SQLite event nodes and asynchronous WAL replication | Accepted (2026-09-01) |
| [0022](/explanation/decisions/0022-authority-epochs-and-domain-operations) | Authority epochs and ordered domain-operation synchronization | Accepted (2026-09-01) |
| [0023](/explanation/decisions/0023-docker-first-event-node-and-entrant-freeze) | Docker-first event node, 72-hour offline target, and entrant freeze at checkout | Accepted (2026-09-01) |
| [0024](/explanation/decisions/0024-compatibility-and-release-governance) | Two-release compatibility and tested immutable image publication | Accepted (2026-09-01) |
| [0025](/explanation/decisions/0025-sp-console-6-program-rulings) | SP-CONSOLE-6 program rulings: vocabulary oracle, ADR 0014 upheld, Code Connect dropped | Accepted (2026-09-03) |
| [0026](/explanation/decisions/0026-sp-figma-2-program-rulings) | SP-FIGMA-2 program rulings: three Figma files, no product token mode, public name format, cut list ruled item by item | Proposed (2026-09-03) |
| [0027](/explanation/decisions/0027-curated-data-components) | The curated Claude Design library is the visual source for the shared data components: Card, StatusPill, Badge, Avatar | Accepted (2026-09-04) |
| [0028](/explanation/decisions/0028-entrant-site-port) | The public entrant site takes the curated Claude Design mock: four tournament tabs, webfonts on the public tier, key dates as rows | Accepted (2026-09-04) |
| [0029](/explanation/decisions/0029-state-and-formatting-contract) | One state and formatting authority per domain: nine domains, explicit missing-data rules, no global enum | Proposed (2026-09-06) |
| [0030](/explanation/decisions/0030-registration-competition) | Registration intent and competition membership | Accepted (2026-09-12) |
| [0031](/explanation/decisions/0031-state-machine-schema-rulings) | State-machine schema rulings and missing source tables | Proposed; five open rulings (2026-09-13) |
| [0032](/explanation/decisions/0032-prelaunch-migration-policy) | Pre-launch migration policy and rollout rulings | Proposed; four open rulings (2026-09-13) |

## Format

Each ADR uses:

- **Status** — Proposed / Accepted / Superseded (+ date and branch where relevant).
- **Context** — the forces and constraints in play.
- **Decision** — what was chosen.
- **Consequences** — what follows, good and bad.

When a decision changes, add a new ADR that supersedes the old one rather than editing history.
