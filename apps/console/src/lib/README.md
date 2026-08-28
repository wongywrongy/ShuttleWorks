# lib/

Pure helpers — no React, no store, no axios. If a function reads from the
store or calls an API, it belongs in `../hooks/` or `../api/` instead. If it
renders anything, it belongs in `../components/`. If it is cross-module DOMAIN
logic (the module model, the match contract), it belongs in
`../platform/domain/`.

The sorting rule is a table in `CODE_HEALTH.md` §1b, keyed on how many consumers
a thing has. SP-REORG-1 Phase 4 merged the old `utils/` in here: two drawers
with no rule for which one to open is worse than one drawer.

## Index

| File | Purpose |
|---|---|
| `bracketCommandQueue.ts` | Idempotent bracket-result command queue (the ADR 0007 path). |
| `bracketOccupancy.ts` | Court/time occupancy for bracket scheduling. |
| `bracketTabs.ts` | Live tab-id and view helpers for the Bracket module. |
| `commandQueue.ts` | The generic idempotent operator command queue, IndexedDB-backed. |
| `constraintChecker.ts` | Client-side constraint pre-checks before a solve is requested. |
| `disciplineNames.ts` | Discipline code to display name. |
| `eventColors.ts` | Per-event colour assignment, shared by chips and boards. |
| `getActiveAssignments.ts` | The currently-active assignment set for a match list. |
| `indexById.ts` | Index an array by id. |
| `matchUtils.ts` | `getMatchLabel()` and formatting that depends only on the match DTO. |
| `names.ts` | Person and school name formatting. |
| `pageVisibility.ts` | Page-visibility helper for pause-when-hidden polling. |
| `playerSlug.ts` | Row key for a HAND-ADDED bracket roster player, slugged from the typed name. Not an identity — that is `entryPlayerId` (R-DM-7(a)); the backend mints its own ids and derives no slug. |
| `pollPolicy.ts` | Poll intervals and backoff policy. |
| `schoolAccent.ts` | Per-school accent colour. |
| `selectableRow.ts` | Shared selectable-row behaviour for banded lists. |
| `stateWords.ts` | The one state vocabulary (SP-CONSOLE-2 X1). |
| `time.ts` | Time parsing/formatting; mirror of the API's time utils. |
| `timeFormatters.ts` | Display formatters for times and durations. |
| `trafficLight.ts` | Per-match readiness light given roster + schedule + live state. |
| `utils.ts` | `cn()` classname merge and small generic helpers. |
| `xlsxExportShared.ts` | Shared XLSX export helpers (formula-injection safe by construction). |
