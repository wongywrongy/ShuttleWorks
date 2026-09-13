# V1 prototype baseline

**Baseline scope confirmed by the owner: 2026-09-13.** This snapshot includes
all accumulated implementation, UI refinement, schema, test, simulator, tooling,
and documentation changes. It is the first v1 prototype baseline, not a GA
release or a claim that every proposed plan is complete. The Git commit and PR
identify the reproducible snapshot; application release counters are unchanged.

## Included work

| Area | Baseline contents |
| --- | --- |
| Operator console | Refined Hub, workspace navigation, Setup, Entries, roster, draws, result entry, Operations and Display surfaces. |
| Public entrant tier | Discovery, tournament pages, players, schedule, draws, registration, receipts and account settings; native HTML and bounded route scripts. |
| Registration and competition | Invitations, payment ledger, representatives, versioned catalogs, units, memberships, draw revisions, bind services and corresponding projections. |
| State machines | Shared primitive, four registered graphs, transaction history, generated JSON/Markdown, and the Run contract integration. |
| Database policy | One fresh-install Alembic baseline, forward-only revisions, fatal migration failures, SQLite backups/FK checking, and version-1-only wire/blob support. |
| Verification and tools | Updated tests, canonical simulator fixtures, capture/review tooling, audit findings and evidence. |

## Working references

- [Repository layout](repo-layout.md) and [architecture](../explanation/architecture/system-overview.md).
- [Registration/competition implementation](registration-competition-implementation.md),
  [schema ADR](../explanation/decisions/0030-registration-competition.md), and
  the schema source diagram at `docs/reference/diagrams/registration-competition.mermaid`.
- [Implemented state machines](state-machines.md), [implementation limits](state-machines-implementation.md),
  and the [full v2 plan](../explanation/state-machines-v2-defined-plan.md).
- [Current migration policy](migration-and-versioning-policy.md),
  [full v2 plan](../explanation/migration-policy-v2-prelaunch.md), and
  [database reset instructions](../how-to/reset-prelaunch-database.md).

## Open work carried into the prototype

The state-machine plan delegates six new graphs and E-1 through E-7 effects to
`state-machines-read-and-plan.md` sections 2–3. Those tables are absent from the
supplied sources. The baseline contains the four implemented graphs; it does
not invent the missing definitions, add inert allow-list entries, or claim
complete CHECK-state coverage. The earlier historical port-commit sequencing
cannot be established from the accumulated working tree.

The five state-machine rulings remain open in
[ADR 0031](../explanation/decisions/0031-state-machine-schema-rulings.md), and
four migration-policy rulings remain recorded as open in
[ADR 0032](../explanation/decisions/0032-prelaunch-migration-policy.md).
Prototype designation does not activate the parked GA compatibility window.
The [debt log](debt-log.md) carries implementation and architecture gaps.

## Preserved source material

These dated records describe their original review snapshots. Their unchecked
items and findings are not new implementation instructions or a current release
verdict; use the references above and the baseline PR checks for current status.

- [Operator refinement plan](../audits/prototype-v1/plans/operator-ui-refinement-plan.md)
  and [public refinement plan](../audits/prototype-v1/plans/public-ui-refinement-plan.md).
- [Operator/public remediation](../audits/prototype-v1/plans/operator-public-remediation-plan.md),
  [operator visual source](../audits/prototype-v1/plans/operator-visual-fixes.md),
  and [public visual source](../audits/prototype-v1/plans/public-visual-fixes.md).
- [Full-stack implementation audit](../audits/full-stack-implementation-audit.md)
  and its sibling `docs/audits/full-stack-implementation-evidence/` directory.
- [Public/frontend security findings](../audits/security/public-frontend-exposure-2026-09-12.md).
  Its referenced parent security plan was not supplied; findings remain a
  dated input for follow-up security work.

## Validation and deployment boundary

The pre-publication local review passed all seven requested gates: Ruff,
import-linter, the complete SQLite backend suite, console tests and dependency
boundaries, entrant lint/typecheck/tests, documentation/generated contracts,
and browser contracts with accessibility checks. The baseline PR runs the
repository's complete CI and security workflows, including PostgreSQL parity.
CI results belong to the exact commit being merged, not to an earlier local run.

The high-severity transitive `smol-toml` advisory was fixed by updating the
lockfile to 1.8.0; the high-severity npm audit gate passes. Remaining lower-severity
dependency findings stay in the debt log.

Publishing this baseline does not rebuild or reseed the demo host.
`make demo-rebuild` remains outside this task.
