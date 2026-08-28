# Task 4 Report

## Outcome

Backend reads now stay bounded as the number of bracket events or total
workspaces grows. Public routes, payloads, ordering, transactions, cache
namespaces, invalidation behavior, and the database schema are unchanged.

## Red/green evidence

- Cache baseline (`be35dc73`) with the new deterministic tests: 3 failed / 2
  passed. Expired `get` retained its key, `put` retained expired entries, and
  no `MAX_ENTRIES` bound existed. Exact-TTL freshness and namespace isolation
  already passed and remain unchanged.
- Tournament-wide bracket reads initially failed because all three grouped
  methods were absent. Hydration at five events performed 16 bracket-table
  reads (`1 + 3N`); one event performed 4.
- The tournament repository tests initially failed because `list_by_ids` did
  not exist, and the HTTP test failed when `list_all` was mutation-blocked.
- Entries commit initially read `bracket_events` 1 / 5 / 10 times for 1 / 5 /
  10 distinct draws. The new bound is 1 / 1 / 1.

All focused red tests pass after the implementation.

## Implementation

- The in-process bracket/display cache now removes an expired key on `get`,
  scavenges expired entries on `put`, and caps the shared namespace cache at
  256 entries by evicting the oldest live entry. The exact TTL boundary stays
  fresh and `invalidate(tournament_id)` still clears every namespace.
- `_LocalBracketRepo` now exposes tournament-wide participant, match, and
  result reads grouped by event. SQL ordering adds event id ahead of each
  pre-existing per-event order: participant id; match round/index; result
  match id.
- `_hydrate_session` reads bracket events and the three child tables once each,
  then assembles events in `list_events()` order.
- `GET /tournaments` resolves the caller's role map once and constrains the
  tournament query to those ids. Empty id collections execute no tournament
  query; `(created_at, id)` descending order is preserved.
- Each Entries bracket CAS attempt preloads the tournament's bracket events
  into a map and passes it to `_plan_bracket`. Dangling mappings and locked-draw
  skip reasons are unchanged; participant reads remain per distinct draw.

## Query evidence

| Path | Baseline | New |
| --- | ---: | ---: |
| Hydrate, 1 event, bracket tables | 4 | 4 |
| Hydrate, 5 events, bracket tables | 16 | 4 |
| Cold GET, 5 populated events, bracket tables | `1 + 3N` structure | 4 |
| Cold GET, 5 populated events, total SELECTs | approximately `4 + 3N` structure | 7 observed |
| Entries event reads, 1 / 5 / 10 draws | 1 / 5 / 10 | 1 / 1 / 1 |

The five-event cold GET also compares every serialized field against the
characterized persisted response and pins event, participant, round, and match
ordering.

## Compatibility and deferred work

- No URL, method, payload field, status, header, schema, commit boundary, or
  cache invalidation call site changed.
- Route parity characterized one pre-existing POST/cold-GET mismatch: POST
  echoes request `courts` and nullable `seeded_count`, while hydration prefers
  `config.courtCount` and materializes the database default `seeded_count=0`.
  Task 4 preserves this behavior; it is recorded as D25 in the debt log.
- PostgreSQL execution was not available on this host. The new statements use
  existing SQLAlchemy `IN`, `ORDER BY`, and scalar APIs already exercised by
  both dialects; SQLite response/query parity is covered directly.

## Verification

- Focused Task 4 suites: 286 passed in 140.16s.
- Full backend unit gate (`-m 'not slow'`): 1,015 passed, 65 skipped, 1
  deselected in 301.51s pytest time / 323.51s wall time.
- Cache module/route suite: 16 passed.
- Bracket repository + hydration suites: 43 passed.
- Ruff on all touched Python files: passed.
- API import-linter: 15 contracts kept, 0 broken.
- `git diff --check`: passed.

The environment used repository-local Python 3.12 because this server has no
Python 3.11 or system `venv` package. Dependencies were bootstrapped into the
gitignored `.venv`; no system package or Git configuration was changed.

## Commit

Implementation commit: `b4913e5f` (`perf(api): bound cache and batch backend reads`).
