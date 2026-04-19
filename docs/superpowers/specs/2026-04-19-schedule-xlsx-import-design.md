# Schedule XLSX import — disaster recovery for the Live page

## Problem

The Schedule XLSX export is the only artifact an operator is guaranteed to
have on a tournament day (it's the paper-backup everyone prints). If the
frontend state gets corrupted or `tournament.json` is lost *after matches
have already been authored*, the operator needs a way to rebuild the
schedule assignments so the Live page works again — without re-deriving
the schedule from scratch via the solver.

Roster and matches are assumed to still be present (restored from JSON
backup, re-entered, etc.). Only `schedule.assignments` needs recovery.

## Goal

Given a Schedule XLSX produced by `exportScheduleXlsx`, reconstruct
`ScheduleDTO.assignments` by matching each row's `(eventRank, Side A
names, Side B names)` against the matches already in app state, then
apply the assignments through the existing autosave path.

**The export is not changed.** The import adapts to the current export
format as-is.

## Non-goals

- Rebuilding players, roster groups, matches, match states, or
  `TournamentConfig` from the XLSX.
- Merging — the import fully replaces `schedule.assignments`.
- Hand-edited imports (rows moved in Excel, new matches added). If the
  import can't match a row to an existing match, it flags the row and
  skips it.
- Backend changes. No new endpoint, no new dependency.

## UX flow

1. Operator clicks **"Recover schedule from XLSX..."** in
   `frontend/src/features/setup/BackupPanel.tsx`, directly below the
   existing restore list. The button is disabled when `matches.length
   === 0` with a tooltip "Load roster + matches first".
2. File picker opens (accepts `.xlsx`).
3. File is parsed client-side with ExcelJS (already lazy-loaded for
   exports). No upload.
4. A modal appears showing:
   - **Summary**: `Matched N of M rows. K warnings.`
   - **Warnings list** (scrollable): per unmatched row, shows time,
     court, event, Side A names, Side B names, and a short reason
     (`no matching match`, `ambiguous: 2 candidates`, `time not on
     interval boundary`).
   - Buttons: **Cancel** and **Apply N assignments**.
5. On Apply:
   - `setSchedule({ assignments: [...] })` store action replaces
     `schedule.assignments` wholesale.
   - Existing autosave debounce flushes the PUT to
     `/tournament/state`.
   - Toast: `"Schedule recovered — N assignments applied, K rows
     skipped."` (success if K === 0, warn if K > 0).

## Parsing contract

The import trusts the sheet produced by `exportScheduleXlsx`. It does
not attempt to parse arbitrary Excel files.

- Worksheet: first sheet; name check (`Schedule`) is a soft signal, not
  a hard requirement.
- Header row: cells A1–H1 must read `Match Times | Court # | Called |
  Began | Event | Side A | Side B | Score` (case-insensitive, trimmed).
  If header doesn't match → hard fail with toast
  `"This doesn't look like a Tournament Scheduler schedule export"`.
- Warmup rows are identified by the merged `F:G` cell containing the
  text `Warm up` (case-insensitive). Those rows are skipped.
- Match rows: every row below the header, excluding warmup rows, whose
  `Match Times` cell is a non-empty string, `Court #` is a positive
  integer, and at least one of `Side A` / `Side B` is non-empty. Rows
  failing these shape checks are skipped silently (they're almost
  certainly blank separator rows).

## Row → assignment resolution

For each match row:

1. **Slot**: parse `Match Times` (e.g. `"10:30 AM"`) → minutes from
   midnight. Compute `slotId = (minutes - dayStartMinutes) /
   intervalMinutes`. If non-integer → warning `"time not on interval
   boundary"`, skip.
2. **Court**: parse `Court #` as integer. Out-of-range courts (≤ 0 or >
   `config.courts`) → warning, skip.
3. **Match lookup key**: build
   `{ event: "MD1", sideA: sorted lowercase names, sideB: sorted
   lowercase names }`. Names come from splitting the cell on ` & `
   (the export's exact delimiter) then trim + lowercase each.
4. Build the same key from every `MatchDTO` in app state (once,
   up-front). Look up this row's key. Sides are also checked swapped
   (A↔B) since the export picks a consistent side order but the app's
   match could have been authored in either order.
5. Candidates:
   - 0 → warning `"no matching match"`, skip.
   - 1 → emit `{ matchId, slotId, courtId }`.
   - 2+ → warning `"ambiguous: N candidates"`, skip.
6. After processing all rows, detect same `matchId` emitted twice →
   keep the first, flag the rest as `"duplicate assignment for
   match"`.

## Architecture

Three small pieces, each independently testable:

### `frontend/src/features/setup/importScheduleXlsx.ts` (new)

Pure TS module. Exports:

```ts
export interface ImportedAssignment {
  matchId: string;
  slotId: number;
  courtId: number;
}
export interface ImportWarning {
  row: number;          // 1-indexed Excel row
  timeLabel: string;
  court: string;
  event: string;
  sideA: string;
  sideB: string;
  reason: string;
}
export interface ImportResult {
  assignments: ImportedAssignment[];
  warnings: ImportWarning[];
  totalRows: number;     // excluding header + warmup
}

export async function parseScheduleXlsx(
  file: File,
  matches: MatchDTO[],
  players: PlayerDTO[],
  config: TournamentConfig,
): Promise<ImportResult>;
```

Lazy-imports ExcelJS so Setup bundle stays light. Pure function — no
store access, no fetch.

### `frontend/src/features/setup/ScheduleImportModal.tsx` (new)

Controlled modal. Props: `result: ImportResult`, `onApply()`,
`onCancel()`. Renders the summary + warnings table. No file parsing
here — receives the already-parsed result.

### `BackupPanel.tsx` integration (edit)

- New button row below the restore list: **"Recover schedule from
  XLSX..."** with hidden `<input type="file" accept=".xlsx">`.
- Handler: parse → open `ScheduleImportModal` with the result → on
  Apply, dispatch `setSchedule({ assignments })` from `appStore`.
- Add `setSchedule` action to `appStore` if it doesn't exist (check
  first — there's likely already a `setSchedule` or equivalent via
  `applyStateSnapshot`).

## Failure modes

| Scenario                                  | Behavior                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| User picks non-XLSX file                  | Toast: `"Not an XLSX file"`; file input rejects via accept=".xlsx"       |
| ExcelJS throws on parse                   | Toast: `"Could not read XLSX — file may be corrupted"`; modal not shown  |
| Header mismatch                           | Toast: `"This doesn't look like a Tournament Scheduler schedule export"` |
| All rows unmatched                        | Modal opens with 0 assignments; Apply button disabled                    |
| Some rows unmatched                       | Modal opens with warnings; Apply enabled (applies matched rows)          |
| `matches.length === 0` when button clicked | Button is disabled; tooltip explains                                     |
| Network failure during autosave PUT       | Existing autosave error toast + unsaved-changes banner handle this       |

## Testing

### Unit tests — `frontend/src/features/setup/__tests__/importScheduleXlsx.test.ts` (new)

Build fixtures by calling `exportScheduleXlsx` on synthetic state, then
feed the resulting blob back into `parseScheduleXlsx`.

1. **Round-trip**: export a 3-match 2-court schedule → parse → every
   assignment is matched, 0 warnings.
2. **Doubles side-order swap**: match authored as `[B, A] vs [D, C]`
   but exported as `"A & B" vs "C & D"` — still resolves (normalize +
   try swapped).
3. **Missing match**: parse a schedule whose XLSX references a match
   that isn't in the supplied `matches[]` → 1 warning
   `"no matching match"`, 0 assignments.
4. **Ambiguous match**: two matches with identical event + identical
   doubles pair (shouldn't happen in practice, but the guard is
   cheap) → warning `"ambiguous: 2 candidates"`.
5. **Bad time label**: manually fabricate an XLSX with `"10:37 AM"`
   when interval is 15 min → warning `"time not on interval
   boundary"`.
6. **Bad header row**: first cell reads `"Wrong Header"` → rejects
   with a thrown error containing `"schedule export"`.
7. **Warmup row skipped**: export a schedule → the 6 warmup rows
   contribute zero assignments, zero warnings.

### E2E — `e2e/tests/schedule-xlsx-import.spec.ts` (new)

One spec: author a small tournament → export schedule → delete
`schedule.assignments` via a store test hook or manual empty → import
the downloaded XLSX → verify the Live page shows the same matches at
the same times/courts. Uses Playwright's file chooser.

## Verification before merge

- `make test` (45 → 45+) passes.
- `make test-e2e` (8 → 9) passes.
- Manual smoke: author 12 matches across 4 courts, export, call
  `setSchedule({ assignments: [] })` via the React DevTools, re-import
  from the saved file, confirm Live page is identical to before.
- XLSX with a deliberately mangled header shows the right toast, not a
  JS error in the console.

## Out of scope

- Importing roster, matches, config, or match states from the schedule
  XLSX (users should restore the JSON backup for that — covered by the
  existing `BackupPanel`).
- Partial / merge imports.
- Score / Called / Began column round-trip. The export writes those
  blank; an ops-filled export is a separate feature and is explicitly
  not handled here.
- Hand-edited imports where match identities have changed.
