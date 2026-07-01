# 06 — Stale-Doc Findings (SP-REFACTOR Phase 6, Step 2)

**Captured:** 2026-07-01 · **Method:** grounded against **current code** via grep +
Read (codanna MCP was down — token expired, needs `/mcp` re-auth; per CLAUDE.md
fallback and the Phase-3 precedent, grep/Read against real code is the same source
of truth codanna indexes). Broad grounding fanned out to 4 read-only Explore
agents (package/READMEs, architecture, modules/contracts/api, getting-started/how-to)
plus a high-precision change-set pass (grepping canonical docs for everything the
SP-REFACTOR 3/5 program deleted or moved).

A "stale claim" here is a **concrete, checkable fact that is now false** — a file
path, route, store/symbol name, command, or count — not prose that merely reads
dated. Fixes were applied in Step 4 (commit `docs: consolidate …`).

---

## Fixed — canonical docs corrected to match code

| # | Doc | Stale claim | Now-true / fix | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `frontend/src/hooks/README.md` | Index listed `useRepair.ts`, `useMatches.ts`, `useRoster.ts`, `useRosterGroups.ts`, `usePlayerNames.ts` | All 5 removed — none exist (`useMatches`/`usePlayerNames` deleted in Phase 3). Also fixed `appStore`→`tournamentStore`, `/tournament-state`→`/tournaments/{id}/state`, and the `useLiveTracking` state-machine (`started`→`playing`, `+retired`). Added "representative index" note | `git ls-files hooks/` |
| 2 | `frontend/src/components/README.md` | Layout listed `roster/RosterTreeSelector.tsx`, `DensityToggle.tsx`, `LoadingSpinner.tsx`, `ThemeToggle.tsx` | All 4 removed — none exist. Added "representative layout" note | `git ls-files components/` |
| 3 | `frontend/src/api/README.md` | `useAppStore.getState().pushToast` | → `useUiStore` (the store that owns `pushToast`) | `client.ts:6,281` import/call `useUiStore` |
| 4 | `scheduler_core/README.md` | Layout listed `api_compat.py`; Tests said `cd src && pytest` | `api_compat.py` removed (doesn't exist); command → `cd products/scheduler && pytest` | `git ls-files scheduler_core/`; CLAUDE.md commands |
| 5 | `backend/README.md` | `tournament_state.py # /tournament-state`; `match_state.py # /match-state`; `cd backend && pytest`; tests under `src/tests/` | Banner added (partially superseded → `backend-structure.md` / `BACKEND.md`). `tournaments.py # /tournaments/{id}/state`; match-states route; `cd products/scheduler && pytest`; tests under `products/scheduler/tests/` | `git ls-files backend/api/` (no `tournament_state.py`); `tournaments.py:1` "Replaces the singleton /tournament/state" |
| 6 | `docs/architecture/data-flow.md:51` | `VALID_TRANSITIONS` = `playing → [finished, retired]` | → `playing → [finished, retired, scheduled]` (the `postpone` edge); diagram updated | `backend/services/match_state.py:48` |
| 7 | `docs/modules/operations.md:50` | `SourceChip.tsx` listed as `products/operations/` code + "read-only projection in `lib/operations/operationalMatch.ts`" | `SourceChip.tsx` is shared in `components/` (used by 3 products); `operationalMatch.ts` doesn't exist → `operationalWriteback.ts` | `components/SourceChip.tsx`; `OpsDetailRail.tsx:20` imports `../../components/SourceChip` |
| 8 | `docs/getting-started/repo-layout.md:22` | `app/ — … workspace nav model` | Nav model moved to `platform/product-shell/workspaceNav.ts` (ADR 0010) | `git ls-files` (workspaceNav under platform/) |
| 9 | `docs/how-to/build-on-the-engine.md:48` | `cd scheduler_core/src && pytest` | No `scheduler_core/src/` dir → `cd products/scheduler && pytest` | `ls scheduler_core/` |

---

## Verified CURRENT — notable "looked suspicious, actually correct"

- **`CLAUDE.md:61`** — "SourceChip … lives in `components/`" is **correct** (it was
  relocated there; the Phase-3 `git rm` was the old `operations/SourceChip.tsx`).
- **`docs/modules/bracket.md:64`** — `ScheduleView` in `products/bracket/` is **correct**
  (`products/bracket/ScheduleView.tsx` exists; the Phase-3 deletion was *meet's* ScheduleView).
- **`docs/modules/settings.md:59`** — correctly states `OverviewTab.tsx` "was removed."
- **All VitePress architecture docs** (11) except `data-flow.md` — CURRENT (Phase-4
  reconciliation held up).
- **All modules/contracts/api docs** except `operations.md:50` — CURRENT.
- **getting-started/how-to** — CURRENT except items #8, #9 above.

## Accepted as intentional (not stale)

- **`products/meet/` shorthand** in `how-to/add-a-module.md` + `add-a-surface.md`:
  the literal path is `products/scheduler/frontend/src/products/meet/`, but the docs
  use `products/meet/` as an established readability shorthand (the module system *is*
  the product; the modules docs use the same convention and were verified CURRENT). Not
  churned.
- **`slotToTime` / `formatSlotTime` duplicate** — a deliberate live alias (Phase 5).

## Labeled historical (banners, not "fixed") — see 06-doc-inventory.md

`docs/superpowers/**`, `docs/architecture/workspace-suite/**`, the `2026-06-25`
session-handoff, `architectural-roadmap.md`, and `tech-stack.md` are point-in-time
snapshots. They are **not** fixed to match present (STOP condition: don't rewrite a
roadmap/handoff into present-day code) — they are banner-labeled as superseded so a
future session can't mistake them for current truth.
