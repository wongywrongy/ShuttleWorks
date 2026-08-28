# Task 4: Backend read-path and cache performance

## Goal

Remove measured/asymptotic database and cache waste while preserving response
payloads, ordering, error semantics, transactions, and schema.

## Scope

- `apps/api/src/bracket/response_cache.py`
- `_LocalTournamentRepo` and `_LocalBracketRepo` in
  `apps/api/src/repositories/local.py`
- `_hydrate_session` in `apps/api/src/bracket/brackets.py`
- tournament list filtering in `apps/api/src/workspaces/tournaments.py`
- bracket entry planning in `apps/api/src/entries/entries.py`
- focused backend unit/integration tests and current docs/comments affected by
  these exact changes

## Requirements

1. TDD. Land focused failing tests before each implementation group and record
   the red evidence.
2. Bound the in-process bracket response cache:
   - an expired `get` removes that key;
   - `put` opportunistically removes expired entries;
   - a documented maximum entry count evicts oldest entries when necessary;
   - namespace isolation and `invalidate(tournament_id)` semantics remain.
   Use deterministic monotonic-time tests; preserve the exact-TTL boundary
   unless an existing test says otherwise.
3. Add bulk bracket repository reads for participants, matches, and results
   across one tournament, grouped by event ID. Preserve the existing per-event
   orderings exactly. `_hydrate_session` must call each child-table query once
   and assemble events in `list_events()` order.
4. Add a SQLAlchemy query-count regression test for a cold bracket GET with
   multiple events. Baseline is `1 + 3N` bracket-table reads / approximately
   `4 + 3N` total route SQL. The new bound is four bracket-table reads and a
   constant total independent of N. Compare serialized JSON before/after or
   otherwise pin full response shape and event/child order.
5. Replace `list_all()` plus Python filtering on `GET /tournaments` with a
   repository query constrained to the caller's tournament IDs (or a
   membership join) while retaining role lookup, newest-first `(created_at,
   id)` ordering, no duplicates, empty-user behavior, modules, and signals.
   This is a row-materialization optimization, not a query-count claim.
6. In every bracket commit retry attempt, preload the tournament's bracket
   events into a map and pass that map into `_plan_bracket`; preserve dangling
   mappings and locked-draw skip reasons. Add a distinct-draw query-count test:
   bracket-event reads must be one for N=1/5/10. Participant reads may remain
   one per distinct draw in this slice.
7. Do not restructure write transactions, change commit boundaries, add schema
   migrations, alter public response/status/header shapes, or change cache
   coherence assumptions.

## Verification

- Focused red then green tests for all four groups.
- Query-count evidence at N=1 and at least N=5.
- Full `tests/backend/unit` excluding known environmental/network tests if a
  targeted marker/path exists; otherwise run the relevant domain suites.
- `ruff check` for touched Python.
- API import-linter.
- `pytest` for tournament listing, bracket repository/routes/cache, and entries
  commit suites.

## Report

Write `.superpowers/sdd/approved-plan/task-4-report.md` with baseline/new query
counts, red/green evidence, compatibility notes, verification, deferred work,
and commit SHA. Commit the task. Do not spawn subagents.
