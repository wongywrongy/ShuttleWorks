# State Machines v2 implementation status

Source: [the v2 plan](../explanation/state-machines-v2-defined-plan.md).
Open choices: [ADR 0031](../explanation/decisions/0031-state-machine-schema-rulings.md).

The first delivery slice centralizes match, solve job, workspace module, and
entry graphs in `apps/api/src/core/state_machines.py`. Domain modules re-export
their definitions and derive their existing transition tables from them. The
engine is `apps/api/src/core/state_machine.py`. The [generated tables](./state-machines.md)
and `packages/shared-contract/state-machines.json` come from the registry.

The security follow-up adds `display_capability`: issue/replacement and revocation
append history in the same transaction as hash/deadline storage. Its active state
is derived from row presence and real-clock expiry, rather than another status
column. Natural expiry performs no write; request resolution checks the deadline.

P08 adds `operator_mfa_factor` for enrollment, activation, authentication and
single-use recovery. `identity/mfa.py` supplies the operator UUID explicitly and
persists every successful transition through `repositories/mfa.py` inside the
caller's transaction. Refusals and failed session grants roll back both the
factor/code mutation and its history. Cloud and node HTTP ceremonies compose
factor verification with session rotation in that transaction. The console keeps
unsent forms mounted behind its session lock and resumes only the same identity.
`reissue_recovery_codes` replaces every recovery code and accepts only a current
authenticator code as proof. `disable` returns a voluntary factor to
`unconfigured`, bumps its generation and revokes the account's other sessions;
the API refuses it with `AUTH_MFA_ENFORCED` wherever deployment policy requires
MFA, so only a factor enrolled on a non-enforcing deployment can be turned off.

`node_operator_enrollment` records individual activation issuance and consumption.
The local administrator is attributed to the node UUID; activation is attributed
to the operator UUID. Explicit administrator recovery records its reason on both
enrollment and factor histories, revokes existing credentials, and returns the
factor to `unconfigured`. Because that recovery returns the same enrollment row
from `consumed` to `pending`, the graph has no terminal state, like
`display_capability`. It cannot be invoked through the LAN API. Migration
`0007` binds enrollment to the member, workspace and authority epoch with composite
foreign keys. See [the operating procedure](../how-to/security-operations.md).

Run `npm run state-machines:generate` after editing definitions and
`npm run state-machines:check` to check generated artifacts. The Documentation
CI job runs that check. The exporter uses only the Python standard library.
The JSON's `state_keys` and `event_keys` preserve literal TypeScript key types;
arrays remain convenient for iteration. Run and the older client transition
helper derive their rules from this contract. `started` remains the legacy
wire spelling of `playing`. `finished` is reopenable; `retired` is terminal.

## Transaction and identity contract

`check()` validates without mutation. `apply()` validates graph version, source,
event, actor type, and named guard before changing the subject. Entry rows use
`state`; the other three machines use `status`. Guard functions raise with their
existing refusal messages. Domain wrappers retain their existing exception
classes and idempotent behavior.

Each successful application returns a `TransitionRecord`. Its `persist(session)`
method adds one ORM history row without flushing or committing. Domain wrappers
call it in the caller's transaction. Refused transitions and idempotent no-ops
produce no history. Per-row graph versions are separate from optimistic row
versions. The migration-startup fixtures resolve the current head instead of
hard-coding the baseline; their backup and failure assertions remain intact.
The single `0001_baseline.py` revision includes the history table and pins
subjects to graph version 1. The uncommitted second revision was folded into
the baseline during the v2 acceptance review; retired heads require reset.

Authenticated operator and entrant dependencies attach identity to the request's
session. Explicit actor IDs take precedence. System claim records identify the
worker. Direct service calls without authenticated context may have null actor
IDs; the engine does not invent an identity for them.

Solve claims retain their guarded SQL compare-and-swap. Only the winning claim
adds history, using a source-state adapter after SQL succeeds. Match PUT and DELETE similarly
retains its version-checked repository write before adding the transition record.
Snapshots, imports, bulk resets, and sync projection writes remain the existing
operation-log paths; they are not modeled as normal lifecycle events. Their
conversion requires explicit graph semantics, particularly for restoring a
terminal match. Existing authority and competition command audit tables remain
in place; they record different commands from the lifecycle history.

## The registration and competition slice (S-3, 2026-09-15)

The v1 document the plan cited for the six machine tables was never filed. The
definitions were derived from the code instead — the CHECK constraints, ADR 0030,
`entries/lifecycle.py` and `competition/` — and filed as the
[S-3 appendix](../explanation/state-machines-v2-defined-plan.md) of the v2 plan,
which records the derivation edge by edge.

Eight machines join the registry. Six are the plan's: `partner_invitation` and
`submission`, whose wrappers live in `entries/lifecycle.py`, and
`competition_event`, `unit`, `unit_membership` and `draw_instance`, whose
wrappers live in `competition/lifecycle.py`. Two more close **SMV2-3**:
`sync_quarantine` and `authority_epoch` each had a CHECK constraint and
transition code and no machine, which left S-3's acceptance criterion
unmeetable. A test now derives that criterion from the models — every
`status IN (...)` or `state IN (...)` constraint maps to exactly one machine, and
their vocabularies must agree.

Competition events gained a status column and its CHECK in migration `0010`; the
other four competition tables already had one. Existing rows land on `scheduled`.

`unit.member_withdrew` is the fourth and final I4 allow-list entry: a complete
unit that loses a member returns to the roster queue, which refuses nobody and
is operator-reversible.

Two rulings are new behaviour rather than a port. **S-8.4**: after the draw, a
member withdrawal withdraws the unit and its remaining memberships instead of
returning it to the queue; re-pairing is an operator act that creates a new
unit. The ruling's opponent walkover is not implemented — bracket results enter
only through the HTTP command path, and giving them a service entry point is a
bracket-domain change; the appendix carries it as a marked TODO. **S-8.5**: an
event goes `scheduled` to `in_progress` on the first recorded result, attributed
to the system, which for a bracket event is its draw reaching `started`. The
Meet-side signal is not wired, for the same kind of reason: it lands in
`operations`, which may not name `competition`. S-8.1, S-8.2 and S-8.3 keep
today's behaviour.

`tests/backend/test_lifecycle_effects.py` asserts E-1 through E-7: for each
effect, the state of every table it touches and the whole ordered list of
history rows.

Three competition paths keep their raw writes under the snapshot/import
exclusion stated above — roster import, checkpoint restore, and the derived
projection — and the appendix names each one and why. Two further writes are
raw because they are roster-trigger preconditions rather than acts; each records
the real transition afterwards, from the state the act started in.

`competition` also joined `apps/api/.importlinter` (**SMV2-1**) with contracts
matching the other domains, so the ADR 0030 seam is named from both sides.
