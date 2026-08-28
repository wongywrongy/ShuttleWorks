# Task 3: Frontend polling and dead-code cleanup

## Goal

Remove verified dead frontend work and prevent unchanged polling responses from
causing avoidable React/Zustand updates, without changing routes, wire types, or
visible behavior.

## Scope

- `apps/console/src/hooks/useLiveTracking.ts`
- `apps/console/src/hooks/useMatchStateSync.ts`
- a new pure match-state merge helper and focused tests
- `apps/console/src/store/matchStateStore.ts` and its tests
- `apps/console/src/modules/display/bracketDisplay/useBracketDisplaySync.ts`
  and its tests
- hand-written DTO parity allowlist/tests affected by deleting the dead local
  aggregate
- proven-dead console/design-system files and their live documentation/export
  references

## Requirements

1. TDD. Add focused failing tests before implementation for:
   - backend-wins/local-extras match-state merging, including local-only rows;
   - unchanged bracket-display poll data retaining the prior DTO reference while
     freshness still advances;
   - `matchStateStore` containing only its consumed state, with unchanged
     `setMatchStates` remaining a reference-preserving no-op.
2. Extract one pure `mergeMatchStates(backend, local)` helper and use it in both
   polling hooks. Preserve `postponed` and `playerConfirmations` semantics.
3. Remove `liveState`, `buildLiveState`, `setLastSynced`, and the hand-written
   `LiveScheduleState` type together. Repoint the old clock regression test at
   the surviving `matchStates` reference/no-write behavior; do not simply delete
   the performance guard.
4. Add the bracket display content-equality guard using the same DTO comparison
   semantics as `useBracket`; every successful poll must still update freshness
   and clear an earlier error.
5. Delete only statically and tool-confirmed dead files:
   - `apps/console/src/hooks/useSmoothedAssignments.ts`
   - `apps/console/src/lib/courtClosures.ts`
   - `apps/console/src/components/Hint.tsx`
   - `packages/design-system/components/Hint.tsx` and its barrel export
   - `apps/console/src/components/control-plane/MetricStat.tsx`, its barrel
     export, and its isolated test case
   Update current READMEs/design docs that name those deleted files/components.
6. Do not remove generated DTO files, route compatibility code, or exports whose
   only evidence is a broad knip warning. Do not edit `docs/history/**`.

## Verification

- Focused red then green tests.
- `npm --prefix apps/console run test:run -- <focused files>`.
- `npm --prefix apps/console run lint`.
- `npm --prefix apps/console run build` or the repo's equivalent type/build gate.
- `npm --prefix apps/console run knip`; expected unused-file count becomes zero.
- `npm run docs:build` for touched live documentation.

## Report

Write `.superpowers/sdd/approved-plan/task-3-report.md` with red/green evidence,
files deleted, compatibility notes, verification, and commit SHA. Commit the
task. Do not spawn subagents.
