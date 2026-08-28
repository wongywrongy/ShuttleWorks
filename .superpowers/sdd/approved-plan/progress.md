# SDD ledger - plan: .superpowers/approved-plan.md

## Pre-flight

| Tasks | Shared surface | Ruling |
| --- | --- | --- |
| 1 -> all | Baseline evidence | Baseline runs before tracked edits and sets comparison numbers. |
| 2 + 3 | Makefile, package scripts, e2e runners | One developer-loop slice owns both so target names and runner ownership cannot diverge. |
| 3 + 7 | Historical e2e references | Repoint or remove references before pruning the files they name. |
| 4 + 6 | Frontend/API modules | Remove verified dead state first; later decomposition preserves the surviving facade. |
| 5 + 6 | Bracket hydration/repository APIs | Query optimization defines the projection interface; decomposition moves it without redesigning it. |
| 6 + 7 | Architecture documentation | Code boundaries land first; live docs describe the final boundary once. |
| 7 + 8 | Docs gates | The new path checker runs after the historical tree is pruned and live paths are current. |

## Rulings

- `make check` remains the complete gate; `check-fast` is explicitly an iteration aid.
- No schema migration or public wire change belongs to this program.
- Historical documentation and frozen source leave HEAD only after live decisions and open work are distilled; Git history is the archive.
- Tests are deleted only when their unique behavior is mapped to one maintained owner.
- Bracket write transaction restructuring is deferred unless baseline profiling shows commit time is at least 20% of endpoint latency.
- Modal, DTO, conflict-dialect, and store-ownership consolidation remain out of scope because they require product decisions.

## Progress

- Task 1: complete
  - Console Vitest: 45.83s, 205 files, 1,868 passed.
  - Entrant Vitest: 39.21s, 37 files, 761 passed; emitted repeated `EMFILE` watcher and Vite HMR `EPERM` warnings.
  - Backend pytest: 611.93s, 1,957 passed, 66 skipped, 16 failed, 14 errors. Failures were confined to network-dependent Turnstile checks and solve subprocess `RLIMIT_AS` behavior in this environment.
  - Console build: 15.13s, 5,294 modules; largest chunk `exceljs` at 936.99 kB.
  - Entrant build: 5.07s, 4,727 client modules / 66 SSR modules; largest chunks 186.39 kB and 125.42 kB.
  - `jscpd`: 105 clones, 1,296 duplicated lines, 1.43%.
  - `knip`: three unused console files, 41 unused exports, one duplicate export; entrant reports one unused dependency, 40 unlisted test dependencies, one unused export, and 18 unused exported types.
  - Radon tail: `find_conflicts` F68; `my_entries` and `_plan_meet` F55; `player_page` F53; `put_tournament_state` F44; `_serialize_session` E38.
- Task 2: complete
  - Added explicit entrant unit/SSR tiers while preserving the complete suite.
  - Added `check-fast`; retained `make check` as an alias of the complete `check-full` gate.
  - Removed implicit dependency installation from e2e execution targets.
  - Halved CSP matrix navigations without changing its page/assertion matrix.
  - Independent review found three contract-test false-positive paths; all were fixed and mutation-tested.
  - Entrant unit: 7.64s versus 39.21s full baseline (80.5% shorter for entrant-only iteration).
- Task 3: complete
  - Removed 516 net lines and five tool-confirmed dead files.
  - Removed the unconsumed `liveState` aggregate and its 5-second rebuilds.
  - Shared one tested match-state merge implementation across both pollers.
  - Unchanged bracket display payloads and match-state maps now preserve object
    references while successful polls still advance freshness.
  - Independent review found two false-positive tests; both were mutation-fixed,
    and duplicate DTO equality logic was centralized.
- Task E2E: in progress
