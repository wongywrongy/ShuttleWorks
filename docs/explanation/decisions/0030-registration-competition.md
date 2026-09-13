# ADR 0030: Registration intent and competition membership

**Status:** Accepted — 2026-09-12

Registration records intent through submissions and entries. Competition
records realization through events, units, and memberships. Invitations belong
to entries and acceptance creates the partner's entry, never a unit.

- Binding is membership existence; the six entry states remain unchanged.
- An entry event's competition event is a default target. Membership is truth.
- Registration duplicates remain soft; competition enforces one player per
  event, one membership per entry, and one membership per unit slot.
- A membership moves on rebind, with an audit record. Withdrawn memberships
  and old units survive. Drawn units cannot be re-paired or moved.
- Roster bounds are checked by services and database triggers, including
  membership edits after confirmation. Pending units may be incomplete.
- Format and scoring versions are global catalogs, immutable after publication.
- Payments are a signed, append-only ledger. Corrections are new records.
- Tournament players reuse `entry_players`; representatives replace its
  account pointer. No global person identity is inferred.

## Development cutover

The owner explicitly waived old-data and old-API compatibility for this change.
Implement against the current workspace, append Alembic revisions, then recreate
and reseed development databases. Do not convert historical tournaments or
dual-write the retired schema. This is a scoped exception to ADR 0024, not a
removal of authority checks or current-version checkpoint integrity.

On 2026-09-12, the owner deferred the shared demo reset, deployment, and
reseeding while the codebase continues changing. Resume that cutover only when
the owner requests it, with fresh verification of the then-current code. The
completed empty development database upgrades and isolated rehearsal stand.

## Delivery

Registration services and schema; competition constraints and catalog; atomic
bind and projection; all roster consumers; tests and reseeding, in that order.
Draw slots and match-side foreign keys require a subsequent specification.

## Constraint and projection details

Roster confirmation uses ordinary triggers on both databases. Cross-references
from memberships to entries/players, invitation acceptance, and default event
targets use deferred foreign keys so tournament cascades complete correctly on
PostgreSQL as well as SQLite. These are portable foreign keys, not deferred
constraint triggers. The confirmed-unit mutation guards still fire immediately.

`bracket_participants` remains a projection with `unit_id`; its member list is
derived, including one-member lists for singles. JSON and CSV imports and event
replacement use one transaction for canonical records and projections. Missing
members and incomplete pairs are rejected before a draw is published.

The checkpoint schema is 1 after the pre-launch version reset on 2026-09-12.
Only this current canonical graph is supported; all other versions are rejected
under the [pre-launch policy](../../reference/migration-and-versioning-policy.md). Entrant credentials and live invitation
capabilities are excluded from checkpoint export.
