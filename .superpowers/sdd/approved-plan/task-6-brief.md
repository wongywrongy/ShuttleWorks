# Task 6: Decompose bracket and repository hotspots

## Outcome

Reduce the measured complexity and mixed responsibilities of the bracket
session projection and command-processing paths without changing any public
route, schema, payload, ordering, query count, transaction boundary, or facade
symbol.

## Scope

- `apps/api/src/bracket/brackets.py`
  - `_hydrate_session` remains the repository-reading compatibility facade.
  - `_serialize_session` remains the wire-projection compatibility facade.
  - Extract cohesive private helpers for row assembly and DTO projection in the
    same module. DTO relocation or consolidation is out of scope.
- `apps/api/src/repositories/local.py`
  - `LocalRepository.process_command` keeps its signature, return type, and
    ownership of every commit/refresh.
  - Extract private helpers for replay classification, preconditions,
    transition/mutation, match-state mirroring, and command finalization.
- Focused characterization tests may be added under `tests/backend/`.

## Baseline

Measured with repository-local Python 3.12 and Radon 6:

| Function | Baseline |
| --- | ---: |
| `bracket.brackets._hydrate_session` | E (33) |
| `bracket.brackets._serialize_session` | E (38) |
| `repositories.local.LocalRepository.process_command` | D (27) |

The existing Task 4 suites already characterize four bracket-table reads for
one or five events, cold multi-event response parity and ordering, cache facade
monkeypatching, and empty-session behavior. Command suites characterize apply,
replay, rejection, rollback, assign/postpone side effects, and the legacy
`match_states` mirror. Task 6 adds an explicit commit-count tripwire before
moving command logic.

## Guardrails

- Keep `_hydrate_session`, `_serialize_session`, and `process_command` at their
  current import/call sites as stable facades.
- `_hydrate_session` performs exactly the four Task 4 bracket bulk reads and no
  per-event reads.
- Preserve iteration and serialized ordering exactly; do not sort a collection
  that currently preserves insertion or repository order.
- Replay remains read-only. A fresh apply or rejection commits exactly once.
- Keep rollback/error behavior, command rejection reasons, and the existing
  Operations transition import allowance unchanged.
- Do not restructure bracket writes, change DTOs, add migrations, or touch the
  scheduler engine.

## Verification

1. Run the characterization suites before implementation.
2. Run focused bracket cache/hydration/route and command/match-state suites.
3. Run Ruff on touched Python files and all 15 API import contracts.
4. Re-measure Radon and ensure complexity is reduced rather than renamed into a
   comparably complex helper.
5. Run the non-slow backend unit gate, followed by the complete program gate in
   Task 8.
