# Task 3 Report

## Red/green evidence

- The new `mergeMatchStates` tests initially failed because the helper did not
  exist.
- The bracket display reference test initially failed because an unchanged
  poll installed a fresh DTO object.
- The store absence test failed against a temporary baseline-shaped
  `liveState: null` entry, then passed after that entry was removed.
- The strengthened bracket test failed under a temporary freshness-write
  suppression (`delayed` instead of `live` at a fake 30-second clock).
- The exact store-key assertion failed against the temporary baseline-shaped
  store because it exposed `liveState`.
- The shared `contentEqual` test initially failed because the helper did not
  exist.
- Focused green checks passed: 9 files, 41 tests; the final store/display
  focused check passed 30 tests.
- Final full console suite passed: 207 files, 1,870 tests.

## Implementation

- Added pure `mergeMatchStates(backend, local)` and used it in both polling
  hooks. Backend fields win; `postponed`, `playerConfirmations`, and local-only
  rows are retained.
- Extracted the shared generic `contentEqual` JSON comparison used by both
  bracket polling hooks, preserving `useBracket`'s prior semantics.
- Removed the dead `liveState`, `buildLiveState`, `setLastSynced`, and
  `LiveScheduleState` aggregate/type. `setMatchStates` remains a
  content-equality, reference-preserving no-op for unchanged data.
- Added bracket display DTO content equality while preserving freshness updates
  and clearing successful-poll errors.
- Deleted only the confirmed dead frontend/design-system files and their
  isolated MetricStat test/export references. Updated live README/design/debt
  references; `docs/history/**` was untouched.

## Files deleted

- `apps/console/src/hooks/useSmoothedAssignments.ts`
- `apps/console/src/lib/courtClosures.ts`
- `apps/console/src/components/Hint.tsx`
- `apps/console/src/components/control-plane/MetricStat.tsx`
- `packages/design-system/components/Hint.tsx`

## Compatibility

Routes, API wire DTOs, generated DTO output, and public route compatibility
code were not changed. The local match-state fields retain their previous
merge semantics, and all successful bracket polls still advance freshness and
clear an earlier error.

## Verification

- `npm --prefix apps/console run test:run`: pass, 207 files / 1,870 tests.
- Focused `test:run` checks: pass, including DTO parity, merge helper, store,
  polling, clock, local-field, visibility, and bracket-display tests.
- `npm --prefix apps/console run lint`: exit 0; repository retains its
  pre-existing warnings.
- `npm --prefix apps/console run build`: exit 0.
- `npm run docs:build`: exit 0.
- `npm --prefix apps/console run knip`: unused-file count is zero, but exits 1
  on the pre-existing 41 unused exports, 28 unused exported types, one
  duplicate export, and two configuration hints. Broad-warning exports were
  intentionally left intact per the brief.
- `git diff --check`: pass.

## Commit

Implementation commit: `af74105e` (`refactor console polling and remove dead frontend code`).
Review follow-up commit: `29367620` (`test shared polling equality and freshness`).
