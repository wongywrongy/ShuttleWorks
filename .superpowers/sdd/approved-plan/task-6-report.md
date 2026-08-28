# Task 6 Report

## Outcome

The bracket projection and repository command hotspots now read as small stable
facades over cohesive helpers. Public routes, DTO identities, wire output,
ordering, query counts, transaction boundaries, schema, and scheduler behavior
are unchanged.

## Cover-before-modify evidence

- Existing bracket characterization pins the four Task 4 bulk reads, cold
  five-event response parity, ordering, cache monkeypatch seam, config, and
  empty-session behavior.
- Added explicit transaction tripwires before the repository refactor:
  a fresh apply commits once, its idempotent replay commits zero additional
  times, and a fresh rejection commits once.
- Mutation proof: inserting a commit in the replay branch made
  `test_apply_and_replay_preserve_commit_ownership` fail with `2 != 1`; the
  probe was removed and the test returned green before implementation.

## Implementation

- `_hydrate_session` remains the four-query repository facade. Session config,
  participants, play units, draws, event metadata, results, and assignments are
  assembled by focused private helpers in `bracket/brackets.py`.
- `_serialize_session` remains the `TournamentOut` facade. Participant, slot,
  play-unit, segment, and event projections are now named helpers while
  retaining insertion/repository order.
- `LocalRepository.process_command` retains all commit, refresh, rollback, and
  return ownership. Replay classification, rejection validation, transition
  validation, mutation, legacy `MatchState` mirroring, and command finalization
  are private helpers in `repositories/local.py`.
- DTOs stayed in place and no import boundary or transaction was redesigned.

## Complexity

| Function | Before | After |
| --- | ---: | ---: |
| `_hydrate_session` | E (33) | B (6) |
| `_serialize_session` | E (38) | A (5) |
| `LocalRepository.process_command` | D (27) | A (5) |

The largest new bracket helper is `_event_out` at C (13); the largest new
repository helper is `_mirror_command_state` at B (7). Complexity was reduced
and distributed rather than transferred to another comparable hotspot.

## Verification

- Focused bracket route/config/cache/hydration suites: 79 passed in 82.41s.
- Focused command/assign-postpone/match-state suites: 63 passed in 24.95s.
- Ruff on touched Python files: passed.
- API import-linter: 15 contracts kept, 0 broken.
- Independent bracket behavior review: no divergence found.
- `git diff --check`: passed.

## Commits

- Characterization + brief: `e327cc11`
- Implementation: `2704a50c`
