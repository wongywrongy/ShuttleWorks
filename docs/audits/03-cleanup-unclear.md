# 03 — Cleanup: Unclear / Kyle-decides

Deletion is a one-way door on a solo repo. Per SP-REFACTOR-3, anything ambiguous
defaults to **leave it alone** and lands here for Kyle. Nothing below is deleted.

## 1. Intentionally-retained "dead" hooks (do NOT delete without a call)

`src/products/meet/roster/hooks/useBulkOperations.ts`
`src/products/meet/roster/hooks/usePlayerSelection.ts`

Import-graph verdict: dead (0 importers). **But** `docs/superpowers/plans/
2026-06-25-position-grid-redesign.md` states verbatim: *"Three hooks are dead
code (defined, never imported): useBulkOperations, useRankValidation,
usePlayerSelection. Keep them — they become the Phase 2 engines
(validation→hints, bulk→quick-assign, selection→multi-select)."*

→ **Decision:** keep (honor the plan) or delete (plan is stale)? Default = keep.
(`useRankValidation` isn't on knip's list — it has a live caller — so only these
two are in question.)

## 2. Unused-export "needs-review" items

- `useMatchMap`, `useGroupMap`, `useAssignmentByMatchId` (`src/store/selectors.ts`)
  — 0 call sites, but `src/store/README.md` documents them as a designed trio
  alongside `usePlayerMap` (which IS used). Keep as intended API, or delete?
- `TournamentExportV2` (`src/api/dto.ts`) — only consumer is
  `TournamentFileManagement.tsx`, itself slated for deletion (§A1). Becomes
  truly-dead once that file is gone → delete together.
- `slotToTime | formatSlotTime` duplicate export (`src/lib/time.ts`) — **not
  dead**: `formatSlotTime` is an alias of `slotToTime` and BOTH names are
  imported/called across ~15 files. Needs a "pick one canonical name + update
  call sites" decision, not a deletion.

## 3. Source-edit cleanup (exports/types) — scope question

The ~23 truly-dead exports/types and ~69 "drop the `export`" items
(`03-cleanup-inventory.md` §C) are behavior-preserving but require **source
edits**, which the strict Phase-3 artifact-cleanup pass excludes. Do these as:
(a) a follow-up mini-refactor pass (each verified + gated), (b) fold into a later
Phase-2-style slice, or (c) skip? Default = (a), after the file deletions land.
