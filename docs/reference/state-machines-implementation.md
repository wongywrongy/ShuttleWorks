# State Machines v2 implementation status

Source: [the v2 plan](../explanation/state-machines-v2-defined-plan.md).
Open choices: [ADR 0031](../explanation/decisions/0031-state-machine-schema-rulings.md).

The first delivery slice centralizes match, solve job, workspace module, and
entry graphs in `apps/api/src/core/state_machines.py`. Domain modules re-export
their definitions and derive their existing transition tables from them. The
engine is `apps/api/src/core/state_machine.py`. The [generated tables](./state-machines.md)
and `packages/shared-contract/state-machines.json` come from the registry.

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

## Missing specification for the remaining slice

The supplied v2 plan refers to `state-machines-read-and-plan.md` sections 2–3 for
all six new definitions and effects E-1 through E-7. The v2 plan is now filed
in the documentation, but its referenced v1 document is still absent and the
supplied v2 plan does not contain those tables. No competition rules have been
inferred in their place.

The current schema already has partner invitations, submissions, competition
units, memberships, and draw instances. Competition events have no status column.
That makes the missing event graph and CHECK vocabulary a schema requirement,
not something recoverable by exporting the existing ORM. The existing competition
service also supports roster restoration and re-pairing; its assignments alone
cannot establish intended terminal states or the seven specified effects.

Pending the source tables: S-3, the E-1…E-7 service functions and behavioral tests,
versions for the six new machines, schema vocabulary parity, and the fourth I4
allow-list entry (`unit.member_withdrew`). The current structural test allow-list
contains the three implemented queue transitions: entry verification, capacity
waitlisting, and solve reaping. S-8 retains today's operator withdrawal override
and non-gating payment behavior. No new ruling has been assumed for event start
or post-draw withdrawal.
