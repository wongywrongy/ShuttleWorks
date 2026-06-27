# Decisions (ADR log)

This is the Architecture Decision Record log — the *why* behind the shape of ShuttleWorks. Each
record states a **status**, the **context** that forced the decision, the **decision** itself, and
its **consequences**. They are deliberately short; the code and the architecture pages carry the
detail.

These records consolidate rationale from the on-disk design archive (`docs/changes/`,
`docs/architectural-roadmap.md`, `docs/superpowers/`, `docs/tech-stack.md`). Where a record
references a longer source, it names the file rather than duplicating it.

## Records

| # | Decision | Status |
| --- | --- | --- |
| [0001](/decisions/0001-four-module-split) | Four-module split (Meet · Bracket · Operations · Display) | Accepted |
| [0002](/decisions/0002-workspace-as-control-plane) | Workspace as the control plane | Accepted |
| [0003](/decisions/0003-sqlite-as-primary-persistence) | SQLite as primary persistence | Accepted |
| [0004](/decisions/0004-ortools-cpsat-engine) | OR-Tools CP-SAT as the scheduling engine | Accepted |
| [0005](/decisions/0005-coming-soon-elimination) | `coming_soon` elimination | Accepted |
| [0006](/decisions/0006-unified-scheduling-core) | Unify the scheduling core; do not merge the match record | Accepted |
| [0007](/decisions/0007-bracket-result-command-queue) | Bracket results through the command queue | Accepted |
| [0008](/decisions/0008-shared-scoring-fields) | Share the scoring field set; add Bracket Sets scoring without a migration | Accepted |

## Format

Each ADR uses:

- **Status** — Proposed / Accepted / Superseded (+ date and branch where relevant).
- **Context** — the forces and constraints in play.
- **Decision** — what was chosen.
- **Consequences** — what follows, good and bad.

When a decision changes, add a new ADR that supersedes the old one rather than editing history.
