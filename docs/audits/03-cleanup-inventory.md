# 03 — Cleanup Inventory (SP-REFACTOR Phase 3A)

**Captured:** 2026-06-30 · **Baseline:** `pre-refactor-20260630` / Phase 2 head `e2cb413`
**Method:** the `sp-refactor-phase3-inventory` workflow (`wf_769efbab-f79`) — 8
read-only agents. knip re-run for the current list; each file verified against
current code via grep (static + `import()` + `React.lazy` + string/registry refs)
and a BFS reachability trace from the entry points (`src/main.tsx`,
`src/setupTests.ts`) over `00-dependency-graph-baseline.json`. Nothing deleted —
this is the inventory for Kyle to approve.

> Tooling note: codanna's MCP auth token had expired during the run, so agents
> used grep + dependency-graph BFS instead of `find_callers`. Two independent
> methods agreed on every verdict. (Re-authorize codanna via `/mcp` when convenient.)

---

## A. Dead source files (knip's 18, verified)

### A1 — Confirmed dead, safe to delete (15)
All verified to have **zero live/reachable importers**. Several form one
orphaned subtree (the leaf's only importer is itself an orphan), so they must be
deleted together — `tsc -b` in the gate will catch any inconsistency.

| File | Notes |
| --- | --- |
| `src/hooks/useMatches.ts` | only importer is the orphan `meet/schedule/ScheduleView.tsx` |
| `src/hooks/usePlayerNames.ts` | same — orphan importer |
| `src/platform/settings/SettingsPrimitives.tsx` | superseded by `SettingsControls.tsx` (10 live importers); its 2 importers are orphans |
| `src/products/meet/schedule/live/index.ts` | dead barrel |
| `src/products/meet/schedule/live/LiveScheduleGrid.tsx` | orphan |
| `src/products/meet/schedule/ScheduleDiagnostics.tsx` | orphan |
| `src/products/meet/schedule/ScheduleView.tsx` | orphan (live page is `SchedulePage.tsx`, not this) |
| `src/products/meet/setup/BackupPanel.tsx` | orphan |
| `src/products/meet/setup/ScheduleImportModal.tsx` | importer is orphan cluster |
| `src/products/meet/setup/importScheduleXlsx.ts` | importers are orphan cluster |
| `src/products/meet/tournaments/SetupGuide.tsx` | orphan |
| `src/products/meet/tournaments/TournamentFileManagement.tsx` | orphan (sole consumer of `TournamentExportV2` type) |
| `src/products/settings/OverviewTab.tsx` | dead **and** removes the `OverviewTab→hub` no-cross-product edge (F-ARCH-2) |
| `src/services/api.ts` | legacy pre-`api/client.ts` service; source of an eslint `no-explicit-any` warning |
| `src/types/schedule.ts` | type-only module; sole importer is orphan |

### A2 — Flagged for intentional retention (2) → Kyle decides
Import-graph says dead, but a design doc says keep. See `03-cleanup-unclear.md`.

| File | Why not auto-deleted |
| --- | --- |
| `src/products/meet/roster/hooks/useBulkOperations.ts` | `docs/superpowers/plans/2026-06-25-position-grid-redesign.md`: *"Three hooks are dead code … Keep them — they become the Phase 2 engines."* |
| `src/products/meet/roster/hooks/usePlayerSelection.ts` | same doc |

### A3 — Keep (1)
| File | Why |
| --- | --- |
| `src/types/fonts.d.ts` | ambient `.d.ts` — included implicitly by tsc, not imported; not dead |

---

## B. Artifacts

Repo is well-maintained: `git status --porcelain` is empty (all untracked paths
already gitignored); nothing bad is committed (no `node_modules`, `*.db`,
`dist`/`build`/`coverage`, `__pycache__` tracked).

| Path | Category | Action |
| --- | --- | --- |
| 29 root `*.png` (`b-config.png`, `sp-*.png`, `u-*.png`, …) | throwaway exploration screenshots (already gitignored, untracked) | delete from disk |
| `.playwright-mcp/` (~28 `console-*.log` / `page-*.yml`) | disposable MCP output (already gitignored) | delete from disk |
| `products/scheduler/frontend/src/products/meet/tournaments/__tests__/` | empty dir (git doesn't track it) | harmless; will vanish once `TournamentFileManagement` deletion lands |

### gitignore gaps (Phase 3B)
- `.ruff_cache/` — 3 copies exist; only self-masked by nested tool `.gitignore`. Add a root entry (mirror the existing `.pytest_cache/`).
- `**/e2e/shots/` — `products/scheduler/e2e/.gitignore` ignores `shots/` locally; add to root for consistency.

---

## C. Unused exports / types (knip's 98) — source edits, follow-up not this pass

These require editing source (dropping an `export` keyword or removing a decl),
so they are **out of scope for the Phase-3 delete/ignore pass** and are recorded
for a later mini-refactor. Near-exhaustively triaged (not sampled):

| Bucket | ~Count | Fix | Examples |
| --- | --- | --- | --- |
| un-export (used internally) — exports | ~19 | drop `export` | `useHint`, `markApplied/Rejected/Retryable` (×2 queues), `MEET_TABS`, `ADMIN_SEGMENTS`, `*_SEGMENTS` |
| un-export (used internally) — types | ~50 | drop `export` | `DtoName`/`DtoRegistry`, `MatchChip*`, `Toast`/`ToastLevel`/`SolverHudState`/… (uiStore.ts) |
| truly-dead exports | ~15 | delete | `cn`, `INPUT_CELL_STYLE`, `closuresForCourt`, `getSchoolAccent`, `computeMoveDelta`, `TextInput`/`DateInput`/`ColorSwatchRow`, `SettingsShell`, stale `usePositionGridColumns` re-export |
| truly-dead types | ~8 | delete | `TournamentConfigDTO`, `PlayerDelayEntry`, `RosterImportDTO`, `MatchType`, `MatchGenerationRule`, `MatchesImportDTO`, `GraphData`, `WorkspaceNoun` |
| needs-review | ~5 | Kyle | see `03-cleanup-unclear.md` |
| false-positive | 0 | — | none (tests are in knip's glob, so test-only usage is already counted) |

Note: `TournamentExportV2` (dto.ts) becomes truly-dead once
`TournamentFileManagement.tsx` (A1) is deleted — its only consumer.
