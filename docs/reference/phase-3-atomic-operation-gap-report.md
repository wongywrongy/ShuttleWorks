# Phase 3 atomic-operation gap report

This audit covers tournament-critical mutating HTTP paths against the Phase 3
rule: a live-event mutation must have one application boundary that commits
the normalized projection, immutable `event_operations` row, and sync outbox
entry atomically. The ranking is by risk to an offline event, not by code size.

## Ranked gaps

| Rank | Surface | Evidence | Risk | Recommended next slice |
| --- | --- | --- | --- | --- |
| 1 | Tournament metadata and workspace module mutations | `workspaces/tournaments.py` still contains direct `repo.session.commit()` paths for workspace/control-plane state | Medium: most fields are cloud preparation or administration, but the remaining field-level ownership classification is incomplete | Classify each field as cloud-only, checkpointed configuration, or live operation; operationize only live fields |
| 2 | Bracket create/delete and event generation | `bracket/brackets.py` still writes broad planning snapshots through repository-owned commits | Medium: these functions must remain available offline, but a failed multi-row write can acknowledge a partial plan | Split draw preparation from live round generation and move each accepted mutation behind a bounded application/UoW contract |
| 3 | Remaining normalized-model migration | Operational compatibility snapshots still coexist with mutable `tournaments.data` paths outside the completed slices | Medium: the operation log is replayable for covered commands, but JSON remains mutable authority elsewhere | Continue the Phase 1 normalization inventory in risk order and lower the checked architecture baseline with each slice |

## Existing covered slices

- `operations/match_state_application.py` atomically handles single-match
  update/delete, exact-set tournament reset, digest-bound full replacement,
  deterministic last-writer bulk merge, and the canonical operator command
  operation/outbox path.
- `bracket/application.py` atomically handles the canonical result/command
  routes, normalized advancement, immutable operation, and outbox append.
- `BracketMatchActionService` atomically handles start/finish/reset with an
  explicit retry UUID and `bracket.match_action.v1` replay projection.
- `BracketAssignmentService` atomically handles direct assign/unassign,
  normalized Operations match materialization, explicit retry UUIDs, and
  `bracket.assignment.v1` replay projection.
- `BracketPinService` runs CP-SAT outside the write transaction, then
  atomically commits the complete planning snapshot and `bracket.pin.v1`
  operation/outbox record. Reusing a command UUID with different pin inputs
  is rejected.
- `meet/schedule_application.py` atomically handles proposal-derived schedule
  commits and provides deterministic replay payloads.
- The old direct solve/warm-restart/repair routes return `410`; surviving
  director and suggestion flows create proposals, and every persistent apply
  delegates to `ScheduleCommitApplication`. No live schedule writer bypass was
  found in the current route set.
- `sync/service.py` validates signed command grants and rebuilds cloud match
  and schedule projections from accepted operations.

## Audit conclusion

The previously ranked high-risk gaps are implemented: destructive match-state
replacement is digest-bound, bulk merge records its explicit deterministic
last-writer payload, and bracket pin/re-solve records a complete planning
snapshot. Setup, destructive bracket imports, entrant intake, partner
acceptance, entrant withdrawal, and operator-desk roster mutations are now
frozen once checkout begins, matching the source-of-truth matrix. Remaining
work is dominated by broader Phase 1 normalization rather than an uncovered
small live-command boundary.

## Match-state bulk/import audit (2026-09-01)

The reset and import paths were reviewed as a bounded Phase 3 slice. The
exact-set `match_state.reset_all.v1`, digest-bound `match_state.replace.v1`,
and deterministic last-writer `match_state.bulk_upsert.v1` contracts are now
implemented with one commit owner across canonical matches, match states,
immutable operation, and outbox.

Implemented wire contracts:

- `match_state.reset_all.v1` now carries a caller idempotency key, sorted
  affected-match list, and complete post-reset versions/statuses. Replay
  changes exactly that recorded set rather than clearing future matches.
- `match_state.replace.v1` for `/import/upload` carries a caller-supplied idempotency
  key, import digest, source schema version, and a complete validated DTO
  snapshot.  The digest and key must be recorded with the operation so a retry
  cannot silently replace a different snapshot.
- `match_state.bulk_upsert.v1` for `/import-bulk` carries a caller-supplied
  idempotency key and a sorted, complete update map, with an explicit
  last-writer policy. The compatibility route deliberately preserves its
  previous merge behavior and records the resulting canonical versions.

Focused tests cover:

1. event-node success writes normalized rows, one immutable operation, and one
   outbox row in the same commit for reset, replacement, and merge;
2. injected failure rolls all three surfaces back for reset, replace, and
   merge;
3. retrying the same idempotency key returns the original result without a
   second operation, while reusing the key with a different digest/payload is
   rejected;
4. cloud replay of each operation produces the exact reset/replace/merge
   projection, and malformed payloads, wrong epochs, unsupported schemas, and
   gaps are quarantined or rejected without advancing the cursor; and
5. existing HTTP tests continue to assert the current response shapes and
   replacement-versus-merge behavior.

These routes now share `MatchStateApplication`; repository commit flags are
disabled inside the use cases so failures roll back every persistence surface.

## Follow-up slice: replacement upload implemented (2026-09-01)

The `/match-states/import/upload` replacement path now has a bounded
`MatchStateApplication.replace_import` boundary.  It validates the upload into
the existing DTOs, computes a deterministic full-snapshot digest, requires an
`Idempotency-Key`, and records one
`match_state.replace.v1` operation containing the source schema version,
sorted snapshot, digest, resulting canonical match versions, and original
response.  State rows, canonical status/version rows, the operation, and its
outbox entry commit together; injected append failure rolls them all back.
Same-key/same-digest retries return the original response, while same-key with
a different digest is rejected.  Cloud projection replay replaces its
match-state map from the recorded snapshot, so it does not depend on the
cloud's pre-existing rows.

Focused application and sync tests cover success, rollback, retry, key reuse,
and exact cloud replay. Reset and bulk merge retain their separate operation
contracts while sharing the same application boundary and replay pipeline.
