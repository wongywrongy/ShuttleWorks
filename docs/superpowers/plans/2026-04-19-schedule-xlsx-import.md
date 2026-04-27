# Schedule XLSX Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator recover a lost `schedule.assignments` from an unmodified Schedule XLSX export (matches + roster still present), so the Live page works again without re-solving.

**Architecture:** Pure TypeScript parser (ExcelJS, already lazy-loaded for exports) produces `{assignments, warnings}`. A modal shows the preview; Apply dispatches the existing `setSchedule` store action and the existing autosave PUTs it to the backend. Zero backend changes.

**Tech Stack:** React 19 + TypeScript + Vite + Zustand + ExcelJS + Playwright (e2e).

**Testing strategy:** The frontend has no unit-test runner (deliberate — v1.0 scope rejects adding CI/test tooling). All verification goes through one Playwright spec that does a real export→delete→import round-trip, plus two negative cases. Parser edge-case coverage is visible to reviewers through the fixture scenarios in that spec.

**Design reference:** `docs/superpowers/specs/2026-04-19-schedule-xlsx-import-design.md`

---

## File Structure

- **Create** `frontend/src/features/setup/importScheduleXlsx.ts` — pure parser module. No React, no store, no fetch. Exports `parseScheduleXlsx(file, matches, players, config)` plus the `ImportResult` / `ImportWarning` / `ImportedAssignment` types.
- **Create** `frontend/src/features/setup/ScheduleImportModal.tsx` — controlled modal. Props only. No parsing logic.
- **Modify** `frontend/src/features/setup/BackupPanel.tsx` — add a hidden `<input type="file">`, a button, and the modal host. Reuses `useAppStore.getState()` for the match list.
- **Create** `e2e/tests/07-schedule-xlsx-import.spec.ts` — round-trip + bad-header + unmatched-row.

---

### Task 1: Pure parser module — types + header validation

**Files:**
- Create: `frontend/src/features/setup/importScheduleXlsx.ts`

- [ ] **Step 1: Create the parser module with types and a header-validation scaffold**

```ts
/**
 * Parse a Schedule XLSX export back into ScheduleAssignment rows.
 *
 * This is a disaster-recovery tool: given an unmodified file produced by
 * exportScheduleXlsx, rebuild schedule.assignments by looking each row's
 * (eventRank, sideA names, sideB names) up against the matches already in
 * the app state. The export is not round-trippable for roster / config /
 * match-state — only the schedule assignments. See
 * docs/superpowers/specs/2026-04-19-schedule-xlsx-import-design.md.
 */
import type ExcelJSNs from 'exceljs';
type ExcelJSType = typeof ExcelJSNs;

import type { MatchDTO, PlayerDTO, TournamentConfig } from '../../api/dto';

export interface ImportedAssignment {
  matchId: string;
  slotId: number;
  courtId: number;
  durationSlots: number;
}

export interface ImportWarning {
  row: number; // 1-indexed Excel row number
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
  totalRows: number;
}

const EXPECTED_HEADERS = [
  'Match Times',
  'Court #',
  'Called',
  'Began',
  'Event',
  'Side A',
  'Side B',
  'Score',
];

function normalizeHeader(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

export async function parseScheduleXlsx(
  file: File,
  matches: MatchDTO[],
  players: PlayerDTO[],
  config: TournamentConfig,
): Promise<ImportResult> {
  const ExcelJS: ExcelJSType = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0];
  if (!sheet) {
    throw new Error('schedule export: workbook has no sheets');
  }

  const header = sheet.getRow(1);
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (normalizeHeader(header.getCell(i + 1).value) !== EXPECTED_HEADERS[i].toLowerCase()) {
      throw new Error(
        `This doesn't look like a Tournament Scheduler schedule export (column ${i + 1} header mismatch)`,
      );
    }
  }

  void matches;
  void players;
  void config;
  return { assignments: [], warnings: [], totalRows: 0 };
}
```

- [ ] **Step 2: Verify the file compiles with the rest of the frontend**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/setup/importScheduleXlsx.ts
git commit -m "feat(import): scaffold schedule XLSX parser — types + header check"
```

---

### Task 2: Row → assignment resolution

**Files:**
- Modify: `frontend/src/features/setup/importScheduleXlsx.ts`

- [ ] **Step 1: Add the helpers and the row-processing loop**

Replace the three `void`s and the empty return at the bottom of `parseScheduleXlsx` with the full implementation. The final body of the function should look like this (keep the header check from Task 1 above it):

```ts
  // --- Warm-up detection ----------------------------------------------
  // The export merges F:G across the warmup block and writes "Warm up".
  // Collect those row numbers and skip them in the main loop.
  const warmupRows = new Set<number>();
  sheet.mergedCells.forEach((range) => {
    const addr = typeof range === 'string' ? range : String(range);
    const m = /^F(\d+):G(\d+)$/.exec(addr);
    if (!m) return;
    const r1 = Number(m[1]);
    const r2 = Number(m[2]);
    const top = sheet.getCell(`F${r1}`).value;
    if (typeof top === 'string' && top.trim().toLowerCase() === 'warm up') {
      for (let r = r1; r <= r2; r++) warmupRows.add(r);
    }
  });

  // --- Build match lookup keys ----------------------------------------
  const playerNameById = new Map(players.map((p) => [p.id, p.name ?? '']));
  const nameKey = (ids: string[] | undefined): string =>
    (ids ?? [])
      .map((id) => (playerNameById.get(id) ?? '').trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join('|');

  // key = `${eventRank}::${sideA}::${sideB}`. We also insert a second
  // entry with A/B swapped so exporter's side-order choice never breaks
  // resolution.
  const matchByKey = new Map<string, MatchDTO[]>();
  const addKey = (k: string, m: MatchDTO) => {
    const arr = matchByKey.get(k);
    if (arr) arr.push(m);
    else matchByKey.set(k, [m]);
  };
  for (const m of matches) {
    const ev = (m.eventRank ?? '').trim();
    if (!ev) continue;
    const ka = nameKey(m.sideA);
    const kb = nameKey(m.sideB);
    if (!ka || !kb) continue;
    addKey(`${ev}::${ka}::${kb}`, m);
    addKey(`${ev}::${kb}::${ka}`, m);
  }

  // --- Time parsing ---------------------------------------------------
  const [dh, dm] = config.dayStart.split(':').map((x) => parseInt(x, 10));
  const dayStartMin = dh * 60 + (dm || 0);
  const interval = config.intervalMinutes;

  function parseAmPm(s: string): number | null {
    const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(s);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const pm = m[3].toUpperCase() === 'PM';
    if (h === 12) h = 0;
    if (pm) h += 12;
    return h * 60 + mm;
  }

  function splitSide(s: string): string[] {
    return s
      .split('&')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .sort();
  }

  // --- Main row loop --------------------------------------------------
  const assignments: ImportedAssignment[] = [];
  const warnings: ImportWarning[] = [];
  const seenMatchIds = new Set<string>();
  let totalRows = 0;

  const lastRow = sheet.actualRowCount ?? sheet.rowCount ?? 1;
  for (let r = 2; r <= lastRow; r++) {
    if (warmupRows.has(r)) continue;
    const row = sheet.getRow(r);
    const timeLabel = String(row.getCell(1).value ?? '').trim();
    const courtRaw = row.getCell(2).value;
    const event = String(row.getCell(5).value ?? '').trim();
    const sideA = String(row.getCell(6).value ?? '').trim();
    const sideB = String(row.getCell(7).value ?? '').trim();

    // Skip structurally-empty rows (blank separators, etc.)
    if (!timeLabel && !courtRaw && !event && !sideA && !sideB) continue;

    totalRows++;
    const push = (reason: string) =>
      warnings.push({ row: r, timeLabel, court: String(courtRaw ?? ''), event, sideA, sideB, reason });

    if (!timeLabel || courtRaw == null || courtRaw === '' || !event || (!sideA && !sideB)) {
      push('incomplete row');
      continue;
    }

    const mins = parseAmPm(timeLabel);
    if (mins === null) {
      push('unparseable time');
      continue;
    }
    const delta = mins - dayStartMin;
    if (delta < 0 || delta % interval !== 0) {
      push('time not on interval boundary');
      continue;
    }
    const slotId = delta / interval;

    const courtId = typeof courtRaw === 'number' ? courtRaw : parseInt(String(courtRaw), 10);
    if (!Number.isInteger(courtId) || courtId <= 0 || courtId > config.courtCount) {
      push('court out of range');
      continue;
    }

    const key = `${event}::${splitSide(sideA).join('|')}::${splitSide(sideB).join('|')}`;
    const candidates = matchByKey.get(key) ?? [];
    const uniqueIds = new Set(candidates.map((m) => m.id));
    if (uniqueIds.size === 0) {
      push('no matching match');
      continue;
    }
    if (uniqueIds.size > 1) {
      push(`ambiguous: ${uniqueIds.size} candidates`);
      continue;
    }
    const matchId = [...uniqueIds][0];
    if (seenMatchIds.has(matchId)) {
      push('duplicate assignment for match');
      continue;
    }
    seenMatchIds.add(matchId);

    const match = candidates.find((m) => m.id === matchId)!;
    assignments.push({
      matchId,
      slotId,
      courtId,
      durationSlots: match.durationSlots ?? 1,
    });
  }

  return { assignments, warnings, totalRows };
```

- [ ] **Step 2: Remove the stub return and the three `void` lines**

The old stub `return { assignments: [], warnings: [], totalRows: 0 };` and `void matches; void players; void config;` must be deleted. The real implementation from Step 1 replaces them.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/setup/importScheduleXlsx.ts
git commit -m "feat(import): resolve rows to match IDs with A↔B swap fallback"
```

---

### Task 3: Preview modal component

**Files:**
- Create: `frontend/src/features/setup/ScheduleImportModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
/**
 * Preview dialog for schedule-XLSX recovery imports.
 *
 * Shows the matched count, a scrollable warning list, and Apply / Cancel.
 * All parsing is done upstream — this component is pure presentation.
 */
import type { ImportResult } from './importScheduleXlsx';

interface Props {
  result: ImportResult;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}

export function ScheduleImportModal({ result, busy, onApply, onCancel }: Props) {
  const { assignments, warnings, totalRows } = result;
  const canApply = assignments.length > 0 && !busy;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import schedule"
      data-testid="schedule-import-modal"
    >
      <div className="w-full max-w-lg rounded-md bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-gray-800">
          Recover schedule from XLSX
        </h2>
        <p className="mt-1 text-xs text-gray-600" data-testid="schedule-import-summary">
          Matched <strong>{assignments.length}</strong> of {totalRows} rows.
          {warnings.length > 0 ? ` ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.` : ''}
        </p>

        {warnings.length > 0 && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-2 py-1 font-medium">Row</th>
                  <th className="px-2 py-1 font-medium">Time</th>
                  <th className="px-2 py-1 font-medium">Court</th>
                  <th className="px-2 py-1 font-medium">Event</th>
                  <th className="px-2 py-1 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {warnings.map((w, i) => (
                  <tr key={i} data-testid={`schedule-import-warning-${i}`}>
                    <td className="px-2 py-1 text-gray-500">{w.row}</td>
                    <td className="px-2 py-1 text-gray-700">{w.timeLabel || '—'}</td>
                    <td className="px-2 py-1 text-gray-700">{w.court || '—'}</td>
                    <td className="px-2 py-1 text-gray-700">{w.event || '—'}</td>
                    <td className="px-2 py-1 text-orange-700">{w.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!canApply}
            data-testid="schedule-import-apply"
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Applying…' : `Apply ${assignments.length} assignment${assignments.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/setup/ScheduleImportModal.tsx
git commit -m "feat(import): preview modal for schedule XLSX recovery"
```

---

### Task 4: Wire into BackupPanel

**Files:**
- Modify: `frontend/src/features/setup/BackupPanel.tsx`

- [ ] **Step 1: Add the imports and state hooks**

At the top of `BackupPanel.tsx`, replace the existing imports block with:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import type { BackupEntryDTO, ScheduleDTO, TournamentStateDTO } from '../../api/dto';
import { useAppStore } from '../../store/appStore';
import { parseScheduleXlsx, type ImportResult } from './importScheduleXlsx';
import { ScheduleImportModal } from './ScheduleImportModal';
```

- [ ] **Step 2: Add the import state inside the `BackupPanel` component**

Inside the `BackupPanel` function body, just below the existing `const [confirmRestore, setConfirmRestore] = useState<string | null>(null);` line, add:

```tsx
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const pushToast = useAppStore((s) => s.pushToast);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    const { matches, players, config } = useAppStore.getState();
    if (!config) {
      pushToast({ level: 'error', message: 'Load a tournament config first' });
      return;
    }
    if (matches.length === 0) {
      pushToast({ level: 'error', message: 'Load matches first — nothing to match against' });
      return;
    }

    try {
      const result = await parseScheduleXlsx(file, matches, players, config);
      setImportResult(result);
    } catch (err) {
      pushToast({
        level: 'error',
        message: err instanceof Error ? err.message : 'Could not read XLSX',
      });
    }
  };

  const handleApplyImport = async () => {
    if (!importResult) return;
    setImporting(true);
    try {
      const current = useAppStore.getState().schedule;
      const next: ScheduleDTO = current
        ? { ...current, assignments: importResult.assignments }
        : {
            assignments: importResult.assignments,
            unscheduledMatches: [],
            softViolations: [],
            objectiveScore: null,
            infeasibleReasons: [],
            status: 'feasible',
          };
      useAppStore.getState().setSchedule(next);
      pushToast({
        level: importResult.warnings.length > 0 ? 'warn' : 'success',
        message: `Schedule recovered — ${importResult.assignments.length} assignment${importResult.assignments.length === 1 ? '' : 's'} applied${importResult.warnings.length > 0 ? `, ${importResult.warnings.length} row${importResult.warnings.length === 1 ? '' : 's'} skipped` : ''}.`,
      });
      setImportResult(null);
    } finally {
      setImporting(false);
    }
  };
```

- [ ] **Step 3: Add the button and hidden input inside the panel's JSX**

In the `BackupPanel`'s returned JSX, just after the closing `</ul>` (or the `else` branch that renders "No backups yet") and before the final closing `</div>` pair, insert:

```tsx
      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-gray-700">Recover schedule</div>
            <p className="text-xs text-gray-500">
              Rebuild schedule assignments from a Schedule XLSX export.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busyAction !== null}
            data-testid="schedule-import-open"
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Recover from XLSX…
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          data-testid="schedule-import-file"
          onChange={handleFileSelected}
        />
      </div>

      {importResult && (
        <ScheduleImportModal
          result={importResult}
          busy={importing}
          onApply={handleApplyImport}
          onCancel={() => setImportResult(null)}
        />
      )}
```

Insert this block *before* the panel's outermost closing `</div>` so the button appears inside the panel card.

- [ ] **Step 4: Verify TypeScript compiles and lint passes**

```bash
cd frontend && npx tsc --noEmit && npx eslint src/features/setup
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/setup/BackupPanel.tsx
git commit -m "feat(import): wire schedule XLSX recovery into BackupPanel"
```

---

### Task 5: Manual smoke test in the browser

- [ ] **Step 1: Build and run the stack fresh**

```bash
make rebuild
```

Expected: containers come up, frontend reachable at `http://localhost`.

- [ ] **Step 2: Author a tiny tournament**

In the browser:
1. Setup tab → create a 2-school, 1-match-per-event minimal config (or load any saved state that has matches).
2. Run a solve so `schedule.assignments` is populated.
3. Schedule tab → Export XLSX. Save the file to disk.

- [ ] **Step 3: Simulate data loss**

In the browser devtools console:

```js
useAppStore.setState({ schedule: { assignments: [], unscheduledMatches: [], softViolations: [], objectiveScore: null, infeasibleReasons: [], status: 'unknown' } });
```

Note: `useAppStore` needs to be globally exposed or imported via `window.__zustandStore__` if the dev hook isn't wired. Alternative: use the React DevTools store inspector, or just kill the backend `schedule` field manually via `PUT /api/tournament/state` in another tab.

- [ ] **Step 4: Verify Live tab is empty**

Live tab should show no assignments.

- [ ] **Step 5: Re-import**

Setup tab → Recover schedule section → click **Recover from XLSX…** → pick the file saved in Step 2 → modal appears → click **Apply N assignments** → toast confirms.

- [ ] **Step 6: Verify Live tab matches the original**

Live tab should once again show the same matches at the same times + courts as before Step 3.

- [ ] **Step 7: If anything is broken, fix and commit**

```bash
git add -p && git commit -m "fix(import): <specific issue>"
```

No commit needed if the smoke test passes cleanly.

---

### Task 6: Playwright spec — round-trip + bad header + unmatched row

**Files:**
- Create: `e2e/tests/07-schedule-xlsx-import.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SEED_TOURNAMENT } from '../fixtures/seed';

async function seedServerFromFixture(page: Page): Promise<void> {
  const s = SEED_TOURNAMENT.state;
  await page.request.put('/api/tournament/state', {
    data: {
      version: 1,
      config: s.config,
      groups: s.groups,
      players: s.players,
      matches: s.matches,
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
    },
  });
}

async function resetServerState(page: Page): Promise<void> {
  await page.request.put('/api/tournament/state', {
    data: {
      version: 1,
      config: null,
      groups: [],
      players: [],
      matches: [],
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
    },
  });
}

test.describe('schedule XLSX import — disaster recovery', () => {
  test.beforeEach(async ({ page }) => {
    await resetServerState(page);
    await seedServerFromFixture(page);
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('round-trip: export then re-import restores the same schedule', async ({ page }) => {
    await page.goto('/');

    // 1. Solve so schedule.assignments is populated.
    await page.getByTestId('tab-schedule').click();
    await page.getByRole('button', { name: /Generate|Re-generate/ }).click();
    await expect(page.getByTestId('schedule-table-row').first()).toBeVisible({ timeout: 30_000 });

    // 2. Capture current assignments via the API.
    const before = await page.request.get('/api/tournament/state');
    const beforeJson = await before.json();
    const beforeAssignments: Array<{ matchId: string; slotId: number; courtId: number }> =
      (beforeJson.schedule?.assignments ?? [])
        .map((a: { matchId: string; slotId: number; courtId: number }) => ({
          matchId: a.matchId,
          slotId: a.slotId,
          courtId: a.courtId,
        }))
        .sort((a: { matchId: string }, b: { matchId: string }) => a.matchId.localeCompare(b.matchId));
    expect(beforeAssignments.length).toBeGreaterThan(0);

    // 3. Download the XLSX.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Export XLSX/i }).click(),
    ]);
    const tmp = path.join(os.tmpdir(), `schedule-${Date.now()}.xlsx`);
    await download.saveAs(tmp);

    // 4. Blow away schedule.assignments on the server.
    await page.request.put('/api/tournament/state', {
      data: {
        version: 1,
        config: beforeJson.config,
        groups: beforeJson.groups,
        players: beforeJson.players,
        matches: beforeJson.matches,
        schedule: {
          assignments: [],
          unscheduledMatches: [],
          softViolations: [],
          objectiveScore: null,
          infeasibleReasons: [],
          status: 'unknown',
        },
        scheduleStats: null,
        scheduleIsStale: false,
      },
    });
    await page.reload();

    // 5. Upload the XLSX through the BackupPanel.
    await page.getByTestId('tab-setup').click();
    const fileInput = page.getByTestId('schedule-import-file');
    await fileInput.setInputFiles(tmp);

    // 6. Apply the import.
    await expect(page.getByTestId('schedule-import-modal')).toBeVisible();
    await page.getByTestId('schedule-import-apply').click();
    await expect(page.getByTestId('schedule-import-modal')).not.toBeVisible();

    // 7. Re-read the server state and diff.
    await expect.poll(async () => {
      const r = await page.request.get('/api/tournament/state');
      const j = await r.json();
      return j.schedule?.assignments?.length ?? 0;
    }, { timeout: 10_000 }).toBe(beforeAssignments.length);

    const after = await page.request.get('/api/tournament/state');
    const afterJson = await after.json();
    const afterAssignments = (afterJson.schedule?.assignments ?? [])
      .map((a: { matchId: string; slotId: number; courtId: number }) => ({
        matchId: a.matchId,
        slotId: a.slotId,
        courtId: a.courtId,
      }))
      .sort((a: { matchId: string }, b: { matchId: string }) => a.matchId.localeCompare(b.matchId));
    expect(afterAssignments).toEqual(beforeAssignments);

    await fs.unlink(tmp).catch(() => {});
  });

  test('bad header is rejected with a toast', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-setup').click();

    // Upload this very spec file — not an XLSX. The accept=".xlsx" filter
    // is advisory on setInputFiles, so the parse attempt runs and fails.
    const bogus = path.join(os.tmpdir(), `bogus-${Date.now()}.xlsx`);
    await fs.writeFile(bogus, 'not a real spreadsheet');
    await page.getByTestId('schedule-import-file').setInputFiles(bogus);

    await expect(page.getByText(/Could not read XLSX|schedule export/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId('schedule-import-modal')).not.toBeVisible();

    await fs.unlink(bogus).catch(() => {});
  });
});
```

- [ ] **Step 2: Run the spec against the running stack**

```bash
make test-e2e
```

Expected: all 7 previous specs pass plus the 2 new scenarios in 07 pass.

If the first spec times out waiting for the Export XLSX button or the schedule table row, check the actual button/test-id names in the Schedule page (`frontend/src/pages/SchedulePage.tsx` or similar) and update the selectors to match — the plan assumes `Export XLSX` button text and a `schedule-table-row` test id, adjust if the UI uses different labels.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/07-schedule-xlsx-import.spec.ts
git commit -m "test(e2e): schedule XLSX round-trip + bad-header"
```

---

### Task 7: Final sweep + ship

- [ ] **Step 1: Run the full test suite one more time**

```bash
make test          # backend pytest, should still be 45+
make test-e2e      # all Playwright specs including 07
```

Expected: both pass.

- [ ] **Step 2: Lint sweep**

```bash
cd frontend && npx eslint src/features/setup src/store src/components
```

Expected: no new errors.

- [ ] **Step 3: Check git log**

```bash
git log --oneline dev..HEAD
```

Expected: 6 new commits all prefixed `feat(import):` or `test(e2e):` — clean history, ready to merge to `main` or PR.

- [ ] **Step 4: No extra commits needed — ship**

At this point the feature is complete. If the user wants to merge to `main` or push to `origin/dev`, do that as a separate step (don't auto-push).

---

## Self-Review Notes

**Spec coverage:**
- UX flow (modal, Apply, toast) → Task 3 + Task 4.
- Parsing contract (header check, warmup skip, row shape filter) → Task 1 + Task 2.
- Row resolution (slot, court, event-keyed match lookup, A↔B swap) → Task 2.
- Failure modes table → covered across Task 2 warnings + Task 4 file-selected handler + Task 6 tests.
- Guards (disabled when no matches, empty config) → Task 4 Step 2 `handleFileSelected`.
- E2E round-trip + bad-header → Task 6.

**Placeholder scan:** No TBDs. Every code step has the actual implementation. The one caveat in Task 6 Step 2 (selector names may need adjustment) is flagged as verification, not a placeholder.

**Type consistency:** `ImportResult`, `ImportedAssignment`, `ImportWarning` used consistently across Tasks 1–4. `ScheduleDTO` import added in Task 4 Step 1 matches the `setSchedule` signature at `appStore.ts:163`. `config.courtCount` used (not `courts`) matching `dto.ts:13`.

**Open call-outs for implementor:**
- `sheet.mergedCells.forEach` in Task 2 Step 1 iterates the ExcelJS merge ranges. If the runtime shape differs (older ExcelJS versions expose `.mergeCells` as a plain object with stringified ranges as values), swap to `Object.keys(sheet._merges ?? {})`.
- In the e2e spec, the Schedule-tab button text "Export XLSX" and any test-ids on rendered rows need to match the current UI. If they've drifted, the spec's Step 2 note says to adjust.
