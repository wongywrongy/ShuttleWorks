# Draws as a Dense Table — Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bracket Draws card grid with a dense `BandedTable` (grouped by discipline, inline action buttons per row) and move the participant picker into a right-docked `DetailPanel`, per spec §2 of `docs/superpowers/specs/2026-07-14-meet-bracket-unification-design.md`.

**Architecture:** `BracketDrawsTab.tsx` keeps everything it owns today (data flow via `useBracket`, `NewDrawModal`, `DrawConfigModal`, `ActionCell`, `StatusPillFor`, `drawCountsByEvent`, the format-field helpers) but swaps its card grid for the shared `BandedTable` shell — the exact pattern `BracketMatchesTab.tsx` already uses (grouped table + `relative` container + docked panel). A new `DrawDetailPanel.tsx` wraps the shared `DetailPanel` and hosts the relocated `ParticipantPicker` plus a config summary. Row click opens the panel; the old whole-card→open-draw click is replaced by the explicit "Open draw →" button (still present per row).

**Tech Stack:** React + TypeScript, vitest + @testing-library/react, Tailwind utility classes, existing design-system components (`Button`, `StatusBar`, `StatusPill`).

## Global Constraints

- **Ordering:** Plan A (`docs/superpowers/plans/2026-07-14-match-list-parity.md`) lands FIRST. It may tighten `BANDED_ROW_CLASSES` density in `components/control-plane/BandedList.tsx` / `BandedTable.tsx`. **This plan must NOT edit those two files** — consume their chrome as-is.
- Frontend test command: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket/__tests__/BracketDrawsTab.test.tsx` (swap the path per file). Run from the repo root `C:\Users\avlis\OneDrive\Documentos\Projects\ShuttleWorks`.
- Lint gate: `npm run lint:scheduler` (repo root).
- `window.confirm` is BANNED in this repo — destructive confirms use the two-click `useConfirmClick` pattern (already in place for Re-generate; keep it).
- Products must not import other products' internals (depcruise). Everything in this plan stays inside `src/products/bracket/` + imports from `components/`, `hooks/`, `lib/`, `api/` — all legal.
- Do not change API calls or payloads: `eventUpsert` / `eventGenerate` / `eventPatch` / `eventNextRound` keep their exact shapes (existing tests pin them).
- Every commit message ends with:

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Ft3AEr4oDorDSeqhWqRXTG
  ```

## File Structure

- **Modify:** `products/scheduler/frontend/src/products/bracket/BracketDrawsTab.tsx` — card grid → grouped `BandedTable`; selection state; picker moves out; modals/helpers unchanged.
- **Create:** `products/scheduler/frontend/src/products/bracket/DrawDetailPanel.tsx` — `DetailPanel` consumer: draw identity header, config summary, progress strip, `ParticipantPicker`.
- **Modify:** `products/scheduler/frontend/src/products/bracket/__tests__/BracketDrawsTab.test.tsx` — card assertions → row assertions; picker-in-panel flow.
- **Create:** `products/scheduler/frontend/src/products/bracket/__tests__/DrawDetailPanel.test.tsx` — panel unit tests.

---

### Task 1: Table skeleton — draw rows replace draw cards

**Files:**
- Modify: `products/scheduler/frontend/src/products/bracket/BracketDrawsTab.tsx`
- Test: `products/scheduler/frontend/src/products/bracket/__tests__/BracketDrawsTab.test.tsx`

**Interfaces:**
- Consumes: `BandedTable` / `BandedTableGroup` / `BandedListColumn` from `../../components/control-plane`; `disciplineOrderIndex` from `../../lib/eventColors`; existing `StatusPillFor`, `drawCountsByEvent`, `DrawCounts`.
- Produces: a `DrawRow` interface and `DRAW_COLUMNS` const (module-private, used by Tasks 2–3); row test-id `bracket-draw-row-<eventId>`; group test-id `bracket-draw-group-<discipline>`. Task 2 renders into the row's trailing actions cell; Task 3 adds `onRowClick`.

- [ ] **Step 1: Rewrite the card-oriented tests as row-oriented tests**

In `__tests__/BracketDrawsTab.test.tsx`, replace the two describe blocks `BracketDrawsTab — draw cards` and the swiss meta assertion inside `BracketDrawsTab — swiss progressive cards` with row equivalents. Replace the whole `BracketDrawsTab — draw cards` block with:

```tsx
describe('BracketDrawsTab — draw rows', () => {
  it('renders a row per draw with format, size, and entered meta', () => {
    mockBracketData = makeBracketData({ participantCount: 3, bracketSize: 8 });
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    expect(within(row).getByText('Single elimination')).toBeInTheDocument();
    expect(within(row).getByText('3/8')).toBeInTheDocument();
  });

  it('groups draws under a discipline band', () => {
    renderDraws();
    expect(screen.getByTestId('bracket-draw-group-MS')).toBeInTheDocument();
    expect(screen.getByTestId('bracket-draw-row-MS')).toBeInTheDocument();
  });

  it('colors the entered count as a warning while short of the target size', () => {
    mockBracketData = makeBracketData({ participantCount: 3, bracketSize: 8 });
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    expect(within(row).getByText('3/8')).toHaveClass('text-status-warning');
  });

  it('renders the entered count muted once the draw is full', () => {
    mockBracketData = makeBracketData({ participantCount: 4, bracketSize: 4 });
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    expect(within(row).getByText('4/4')).not.toHaveClass('text-status-warning');
  });

  it('shows an empty state with a New draw action when there are no draws', () => {
    mockBracketData = { ...makeBracketData(), events: [] };
    renderDraws();
    expect(screen.getByText('No draws yet')).toBeInTheDocument();
  });

  it('shows the DONE/LIVE/READY/PEND progress strip when the draw has matches', () => {
    mockBracketData = makeBracketData({
      status: 'started',
      playUnits: [
        makePlayUnit('pu-1'),
        makePlayUnit('pu-2'),
        makePlayUnit('pu-3'),
        makePlayUnit('pu-4'),
      ],
      assignments: [
        { play_unit_id: 'pu-2', slot_id: 1, court_id: 1, duration_slots: 1, actual_start_slot: null, actual_end_slot: null, started: true, finished: false },
        { play_unit_id: 'pu-3', slot_id: 2, court_id: 2, duration_slots: 1, actual_start_slot: null, actual_end_slot: null, started: false, finished: false },
      ],
      results: [
        { play_unit_id: 'pu-1', winner_side: 'A', walkover: false, finished_at_slot: null },
      ],
    });
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    expect(within(row).getByText('DONE').parentElement).toHaveTextContent(/DONE\s*1/);
    expect(within(row).getByText('LIVE').parentElement).toHaveTextContent(/LIVE\s*1/);
    expect(within(row).getByText('READY').parentElement).toHaveTextContent(/READY\s*1/);
    expect(within(row).getByText('PEND').parentElement).toHaveTextContent(/PEND\s*1/);
  });

  it('shows a placeholder instead of the strip while the draw has no matches', () => {
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    expect(within(row).queryByText('DONE')).not.toBeInTheDocument();
  });
});
```

In `BracketDrawsTab — swiss progressive cards` (rename the describe to `BracketDrawsTab — swiss progressive rows`), change the two `getByTestId('bracket-draw-card-MS')` lookups to `getByTestId('bracket-draw-row-MS')` and keep the `Round\s*1\s*of\s*3` assertion — the round meta moves into the Format cell but keeps the same words.

In `BracketDrawsTab — status + generate`, no changes yet (pills and buttons survive the move).

In `BracketDrawsTab — open draw`, DELETE the last two tests (`opens the draw when the card itself is clicked once generated` and `does not navigate on card click while the draw is draft`) — whole-card click is replaced by row-click→panel in Task 3. Keep the two button tests.

In `BracketDrawsTab — participant picker`, mark the whole describe with `describe.skip(...)` for now — Task 3 rewrites it for the panel flow. (Skipping, not deleting, keeps the intent visible mid-plan.)

- [ ] **Step 2: Run the test file to verify the new tests fail**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket/__tests__/BracketDrawsTab.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="bracket-draw-row-MS"]` (cards still render).

- [ ] **Step 3: Swap the card grid for a grouped BandedTable**

In `BracketDrawsTab.tsx`:

**3a.** Extend the imports:

```tsx
import { StatusBar } from '@scheduler/design-system'; // already imported — keep Card OUT after 3d
import {
  ActionsBar,
  BandedTable,
  EmptyState,
  type BandedListColumn,
  type BandedTableGroup,
} from '../../components/control-plane';
import { disciplineOrderIndex } from '../../lib/eventColors';
```

(Concretely: add `BandedTable`, `BandedListColumn`, `BandedTableGroup` to the existing control-plane import; add the `disciplineOrderIndex` import; the design-system import keeps `Button, StatusBar, StatusPill` and drops `Card` in step 3d.)

**3b.** Below the `DrawCounts` interface, add the row model + columns (module scope, above `BracketDrawsTab`):

```tsx
/** One draws-table row — a draw plus everything its cells need, computed
 *  once so renderRow stays a pure projection. */
interface DrawRow {
  ev: BracketEventDTO;
  status: BracketEventStatus;
  partCount: number;
  targetSize: number;
  counts?: DrawCounts;
  generated: boolean;
  isSwiss: boolean;
  swissRounds?: number;
  roundComplete: boolean;
  completed: boolean;
}

/** Column set for the draws table. The trailing unlabeled column hosts the
 *  per-row action buttons (Generate / Configure / Next round / Open). */
const DRAW_COLUMNS: BandedListColumn[] = [
  { label: 'Code', className: 'w-16' },
  { label: 'Format', className: 'w-44 min-w-0' },
  { label: 'Size', className: 'w-12 text-right' },
  { label: 'Entered', className: 'w-16 text-right' },
  { label: 'Progress', className: 'min-w-0 flex-1' },
  { label: 'Status', className: 'w-28 text-right' },
  { label: '', className: 'w-80' },
];
```

**3c.** Inside `BracketDrawsTab`, after the `countsByEvent` memo, build rows + groups:

```tsx
  // Row models — one pass over events so every cell (and later the panel)
  // reads precomputed facts instead of re-deriving them in renderRow.
  const drawRows = useMemo<DrawRow[]>(
    () =>
      events.map((ev) => {
        const status: BracketEventStatus = ev.status ?? 'draft';
        const partCount = ev.participant_count ?? 0;
        const targetSize = ev.bracket_size ?? partCount;
        const counts = countsByEvent.get(ev.id);
        const isSwiss = ev.format === 'swiss';
        const rawSwissRounds = isSwiss ? ev.config?.swiss_rounds : undefined;
        const swissRounds =
          typeof rawSwissRounds === 'number' ? rawSwissRounds : undefined;
        const roundComplete =
          !!counts && counts.live === 0 && counts.ready === 0 && counts.pending === 0;
        return {
          ev,
          status,
          partCount,
          targetSize,
          counts,
          generated: status !== 'draft',
          isSwiss,
          swissRounds,
          roundComplete,
          completed:
            !!counts &&
            counts.done > 0 &&
            roundComplete &&
            (!isSwiss || (swissRounds !== undefined && ev.rounds.length >= swissRounds)),
        };
      }),
    [events, countsByEvent],
  );

  // Discipline bands, same ordering convention as Bracket Matches.
  const tableGroups = useMemo<BandedTableGroup<DrawRow>[]>(() => {
    const byDiscipline = new Map<string, DrawRow[]>();
    for (const row of drawRows) {
      const arr = byDiscipline.get(row.ev.discipline) ?? [];
      arr.push(row);
      byDiscipline.set(row.ev.discipline, arr);
    }
    return [...byDiscipline.entries()]
      .sort(([a], [b]) => disciplineOrderIndex(a) - disciplineOrderIndex(b))
      .map(([discipline, items]) => ({
        key: discipline,
        code: discipline,
        label: disciplineLabel(discipline),
        items,
        testId: `bracket-draw-group-${discipline}`,
      }));
  }, [drawRows]);
```

`BracketEventDTO` is already imported from `./eventUpsertPayload`; `useMemo` is already imported.

**3d.** Replace the entire card grid — the `<div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">…</div>` block including its `events.map` body (currently everything between the `events.length === 0` ternary's `:` and the closing of the scroll container) — with the table. The scroll container becomes:

```tsx
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {events.length === 0 ? (
            <EmptyState
              title="No draws yet"
              body="A draw is one event's bracket. Create a draw, enter its participants, then generate — it’ll appear here and feed Matches and Operations."
              action={
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className={`${INTERACTIVE_BASE} inline-flex h-8 items-center gap-1 rounded-sm bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90`}
                >
                  ＋ New draw
                </button>
              }
            />
          ) : (
            <BandedTable
              columns={DRAW_COLUMNS}
              groups={tableGroups}
              rowId={(row) => row.ev.id}
              rowTestId={(row) => `bracket-draw-row-${row.ev.id}`}
              renderRow={(row) => (
                <>
                  <span
                    className="w-16 truncate text-sm font-semibold text-accent sw-num"
                    title={row.ev.id}
                  >
                    {row.ev.id}
                  </span>
                  <span className="w-44 min-w-0 truncate text-xs text-muted-foreground">
                    {formatLabel(row.ev.format)}
                    {row.isSwiss && row.swissRounds !== undefined && row.generated ? (
                      <span className="ml-1.5 sw-num">
                        Round {row.ev.rounds.length} of {row.swissRounds}
                      </span>
                    ) : null}
                  </span>
                  <span className="w-12 text-right text-xs text-muted-foreground sw-num">
                    {row.targetSize}
                  </span>
                  <span
                    className={`w-16 text-right text-xs sw-num ${
                      row.partCount < row.targetSize
                        ? 'text-status-warning'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {row.partCount}/{row.targetSize}
                  </span>
                  <span className="min-w-0 flex-1">
                    {row.counts ? (
                      <StatusBar
                        items={[
                          { tone: 'done', label: 'DONE', count: row.counts.done },
                          { tone: 'green', label: 'LIVE', count: row.counts.live },
                          { tone: 'amber', label: 'READY', count: row.counts.ready },
                          { tone: 'idle', label: 'PEND', count: row.counts.pending },
                        ]}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </span>
                  <span className="flex w-28 justify-end">
                    <StatusPillFor status={row.status} completed={row.completed} />
                  </span>
                  {/* Actions cell — populated in the next change (Task 2). */}
                  <span className="flex w-80 items-center justify-end gap-3" />
                </>
              )}
            />
          )}
        </div>
      </div>
```

Delete the now-dead card-only pieces from the component body: the `openPickerFor` state, the `pickerOpen`/`isDoubles` locals, the in-card `ParticipantPicker` block, and the `Card` import — **but keep** `players`, the `ParticipantPicker` import, and the seed-preserving commit logic parked as-is if TypeScript complains, by moving it verbatim into a `commitPicks` callback (it is consumed in Task 3):

```tsx
  // Seed-preserving participants commit — relocated from the old in-card
  // picker; the Draw detail panel (Task 3) drives it.
  const commitPicks = useCallback(
    async (ev: BracketEventDTO, picks: PickedSingle[] | PickedPair[]) => {
      const isDoubles = ['MD', 'WD', 'XD'].includes(ev.discipline);
      const seedOf = (id: string): number | undefined => {
        const s = (ev.participants ?? []).find((x) => x.id === id)?.seed;
        return s == null ? undefined : s;
      };
      const participants = isDoubles
        ? (picks as PickedPair[]).map((p) => {
            const seed = seedOf(p.id);
            return { id: p.id, name: p.name, members: p.members, ...(seed != null ? { seed } : {}) };
          })
        : (picks as PickedSingle[]).map((p) => {
            const seed = seedOf(p.id);
            return { id: p.id, name: p.name, ...(seed != null ? { seed } : {}) };
          });
      const next = await api.eventUpsert(ev.id, buildEventUpsertPayload(ev, participants));
      setData(next);
    },
    [api, setData],
  );
```

The old footer's `ActionCell` and the three quiet buttons disappear with the card markup — Task 2 restores them inside the actions cell. Temporarily suppress the resulting `unused` lint errors by keeping `handleGenerate` / `handleNextRound` / `openDraw` / `configFor` in place (they are referenced again in Task 2; if eslint blocks the commit, add a single `// eslint-disable-next-line @typescript-eslint/no-unused-vars` above each — Task 2 removes them).

- [ ] **Step 4: Run the test file**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket/__tests__/BracketDrawsTab.test.tsx`
Expected: the new `draw rows` describe PASSES; `status + generate` tests that click Generate/Re-generate FAIL (actions cell is empty until Task 2) — that is the known intermediate state. The `swiss progressive rows` Round-meta test PASSES; its Next-round click tests FAIL (same reason). If anything in `draw rows` fails, fix before proceeding.

- [ ] **Step 5: Commit the skeleton (test suite partially red is expected mid-plan — commit only the passing-scope work)**

Actually: do NOT commit with red tests. Proceed straight into Task 2 and commit both together — Task 2's commit message covers the pair. (This step exists so the executor doesn't commit a red suite.)

---

### Task 2: Inline actions cell — Generate / Configure / Next round / Open

**Files:**
- Modify: `products/scheduler/frontend/src/products/bracket/BracketDrawsTab.tsx`
- Test: `products/scheduler/frontend/src/products/bracket/__tests__/BracketDrawsTab.test.tsx`

**Interfaces:**
- Consumes: `DrawRow`, the empty actions cell from Task 1; existing `ActionCell`, `handleGenerate`, `handleNextRound`, `openDraw`, `setConfigFor`, `useConfirmClick` (inside `ActionCell`, unchanged).
- Produces: populated actions cell with the existing test-ids `bracket-configure-<id>`, `bracket-next-round-<id>`, `bracket-open-draw-<id>`; every button calls `e.stopPropagation()` so Task 3's row click stays clean.

- [ ] **Step 1: Confirm the failing tests**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket/__tests__/BracketDrawsTab.test.tsx`
Expected: FAIL in `status + generate` (`Unable to find role button /Generate/i`), `swiss progressive rows` (next-round button missing), `open draw` (button missing), `configure a draft draw` (testid missing). These are the tests this task turns green — no new test code needed first; the existing suite is the spec.

- [ ] **Step 2: Populate the actions cell**

Replace the empty `<span className="flex w-80 items-center justify-end gap-3" />` from Task 1 with:

```tsx
                  <span
                    className="flex w-80 items-center justify-end gap-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ActionCell
                      status={row.status}
                      eventReady={row.partCount > 0 && row.partCount === row.targetSize}
                      onGenerate={() => handleGenerate(row.ev.id, false)}
                      onRegenerate={() => handleGenerate(row.ev.id, true)}
                    />
                    {row.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => setConfigFor(row.ev.id)}
                        data-testid={`bracket-configure-${row.ev.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        Configure
                      </button>
                    )}
                    {row.isSwiss && row.generated && (
                      <button
                        type="button"
                        onClick={() => handleNextRound(row.ev.id)}
                        disabled={!row.roundComplete}
                        data-testid={`bracket-next-round-${row.ev.id}`}
                        title={
                          row.roundComplete
                            ? 'Pair the next Swiss round from standings'
                            : 'Record every result in the current round first'
                        }
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next round
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openDraw(row.ev.id)}
                      disabled={!row.generated}
                      data-testid={`bracket-open-draw-${row.ev.id}`}
                      title={row.generated ? `Open the ${row.ev.id} draw` : 'Generate the draw first'}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Open draw →
                    </button>
                  </span>
```

Remove any temporary `eslint-disable` lines added in Task 1 — every handler is consumed again. `ActionCell` itself is untouched: draft→Generate (disabled unless `eventReady`), generated→two-click Re-generate (`useConfirmClick`), started→"— (locked)".

- [ ] **Step 3: Run the test file to verify it passes**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket/__tests__/BracketDrawsTab.test.tsx`
Expected: PASS everywhere except the `describe.skip`ped participant-picker block. Specifically green: `disables Generate when participant count != size`, `enables Generate when participant count == size`, `shows Re-generate when generated`, `shows locked when started`, `calls eventGenerate with wipe=false`, both remaining `open draw` button tests, both `configure a draft draw` tests, all three swiss tests.

- [ ] **Step 4: Commit Tasks 1+2 together**

```bash
git add products/scheduler/frontend/src/products/bracket/BracketDrawsTab.tsx products/scheduler/frontend/src/products/bracket/__tests__/BracketDrawsTab.test.tsx
git commit -m "feat(bracket): draws surface as dense BandedTable with inline row actions

Cards -> grouped table (discipline bands), same generate/configure/
next-round/open rules and test-ids; participant picker relocation
lands next with the draw detail panel.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ft3AEr4oDorDSeqhWqRXTG"
```

---

### Task 3: DrawDetailPanel — row click opens the docked panel with the participant picker

**Files:**
- Create: `products/scheduler/frontend/src/products/bracket/DrawDetailPanel.tsx`
- Create: `products/scheduler/frontend/src/products/bracket/__tests__/DrawDetailPanel.test.tsx`
- Modify: `products/scheduler/frontend/src/products/bracket/BracketDrawsTab.tsx`
- Modify: `products/scheduler/frontend/src/products/bracket/__tests__/BracketDrawsTab.test.tsx`

**Interfaces:**
- Consumes: `DetailPanel` from `../../components/control-plane` (props: `label`, `value`, `sub`, `mono`, `onClose`, `children`, `testId`); `ParticipantPicker` (props: `mode: 'singles' | 'doubles'`, `eventId`, `players`, `initialIds`, `onCommit(picks)`, `onCancel`); `commitPicks(ev, picks)` from Task 1; `formatLabel`/`disciplineLabel`.
- Produces: `DrawDetailPanel` component with props `{ ev: BracketEventDTO; players: { id: string; name: string }[]; onClose: () => void; onCommitPicks: (picks: PickedSingle[] | PickedPair[]) => Promise<void> }`; panel test-id `draw-detail-panel`.

- [ ] **Step 1: Write the failing panel unit tests**

Create `__tests__/DrawDetailPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DrawDetailPanel } from '../DrawDetailPanel';
import type { BracketEventDTO } from '../eventUpsertPayload';

const onClose = vi.fn();
const onCommitPicks = vi.fn().mockResolvedValue(undefined);

const ev: BracketEventDTO = {
  id: 'MS',
  discipline: 'MS',
  format: 'se',
  bracket_size: 4,
  participant_count: 1,
  rounds: [],
  status: 'draft',
  participants: [{ id: 'p-alex', name: 'Alex Tan', seed: 1 }],
} as BracketEventDTO;

const players = [
  { id: 'p-alex', name: 'Alex Tan' },
  { id: 'p-ben', name: 'Ben Carter' },
];

beforeEach(() => {
  onClose.mockReset();
  onCommitPicks.mockClear();
});

describe('DrawDetailPanel', () => {
  it('renders the draw identity header and config summary', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    const panel = screen.getByTestId('draw-detail-panel');
    expect(within(panel).getByText('MS')).toBeInTheDocument();
    expect(within(panel).getByText(/Single elimination/)).toBeInTheDocument();
    expect(within(panel).getByText('Bracket size')).toBeInTheDocument();
    expect(within(panel).getByText('4')).toBeInTheDocument();
  });

  it('hosts the participant picker and forwards commits', async () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    expect(screen.getByText(/Pick participants/i)).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole('button', { name: /^Commit$/i }));
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    const picks = onCommitPicks.mock.calls[0][0];
    expect(picks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'p-alex' })]),
    );
  });

  it('closes via the panel close button', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Close detail/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

Note: if `BracketEventDTO` requires more fields than the literal provides, satisfy the type with the `as BracketEventDTO` cast shown (the panel only reads the listed fields). If `ParticipantPicker`'s picker copy is not literally "Pick participants", mirror whatever heading the existing `BracketDrawsTab` picker test asserted (`/Pick participants/i` — it did).

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket/__tests__/DrawDetailPanel.test.tsx`
Expected: FAIL — `Cannot find module '../DrawDetailPanel'`.

- [ ] **Step 3: Implement DrawDetailPanel**

Create `products/scheduler/frontend/src/products/bracket/DrawDetailPanel.tsx`:

```tsx
/**
 * DrawDetailPanel — the right-docked detail drawer for one draw (spec:
 * meet/bracket unification §2). Hosts what the old draw card kept
 * inline: a config summary and the participant picker. Actions stay on
 * the table row; this panel is for inspecting and entering.
 */
import { DetailPanel } from '../../components/control-plane';
import { ParticipantPicker, type PickedSingle, type PickedPair } from './ParticipantPicker';
import type { BracketEventDTO } from './eventUpsertPayload';
import { formatLabel, disciplineLabel } from './bracketLabels';

const SECTION_LABEL =
  'text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground';

export function DrawDetailPanel({
  ev,
  players,
  onClose,
  onCommitPicks,
}: {
  ev: BracketEventDTO;
  players: { id: string; name: string }[];
  onClose: () => void;
  /** Seed-preserving upsert lives with the surface that owns the data
   *  flow (BracketDrawsTab.commitPicks); the panel only forwards picks. */
  onCommitPicks: (picks: PickedSingle[] | PickedPair[]) => Promise<void>;
}) {
  const isDoubles = ['MD', 'WD', 'XD'].includes(ev.discipline);
  const configEntries = Object.entries(ev.config ?? {});
  return (
    <DetailPanel
      label="Draw"
      value={ev.id}
      sub={`${disciplineLabel(ev.discipline)} · ${formatLabel(ev.format)}`}
      mono
      onClose={onClose}
      testId="draw-detail-panel"
    >
      <div className="space-y-4 p-3">
        <section>
          <h3 className={SECTION_LABEL}>Configuration</h3>
          <dl className="mt-1.5 space-y-1 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Format</dt>
              <dd>{formatLabel(ev.format)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Bracket size</dt>
              <dd className="sw-num">{ev.bracket_size ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Entered</dt>
              <dd className="sw-num">{ev.participant_count ?? 0}</dd>
            </div>
            {configEntries.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{key.replaceAll('_', ' ')}</dt>
                <dd className="sw-num">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className={SECTION_LABEL}>Participants</h3>
          <div className="mt-1.5 rounded-sm bg-bg-elev p-2">
            <ParticipantPicker
              mode={isDoubles ? 'doubles' : 'singles'}
              eventId={ev.id}
              players={players}
              initialIds={[]}
              onCommit={onCommitPicks}
              onCancel={onClose}
            />
          </div>
        </section>
      </div>
    </DetailPanel>
  );
}
```

If `ParticipantPicker`'s `onCommit` prop type is narrower than `(picks: PickedSingle[] | PickedPair[]) => Promise<void>` (e.g. it types by mode), match its actual signature — read `ParticipantPicker.tsx` and adjust the forwarding wrapper accordingly, e.g. `onCommit={(picks) => onCommitPicks(picks)}`.

- [ ] **Step 4: Run the panel tests**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket/__tests__/DrawDetailPanel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the panel into BracketDrawsTab + rewrite the picker tests**

**5a.** In `BracketDrawsTab.tsx`: add selection state and row click, render the panel inside the `relative` container from Task 1 (sibling of the scroll div, exactly like `BracketMatchesTab`):

```tsx
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRow = selectedId
    ? drawRows.find((r) => r.ev.id === selectedId) ?? null
    : null;
```

On the `BandedTable`, add:

```tsx
              onRowClick={(row) => setSelectedId(row.ev.id)}
              selectedId={selectedId}
```

After the scroll `<div className="min-h-0 flex-1 overflow-auto">…</div>` closes (still inside the `relative` wrapper):

```tsx
        {selectedRow ? (
          <DrawDetailPanel
            key={selectedRow.ev.id}
            ev={selectedRow.ev}
            players={players}
            onClose={() => setSelectedId(null)}
            onCommitPicks={async (picks) => {
              await commitPicks(selectedRow.ev, picks);
              setSelectedId(null);
            }}
          />
        ) : null}
```

Add the import: `import { DrawDetailPanel } from './DrawDetailPanel';`. Remove the now-unused direct `ParticipantPicker` import from `BracketDrawsTab.tsx` if nothing else references it (the `PickedSingle`/`PickedPair` types are still needed by `commitPicks` — keep the type-only import: `import type { PickedSingle, PickedPair } from './ParticipantPicker';`).

**5b.** In `__tests__/BracketDrawsTab.test.tsx`, replace the skipped `BracketDrawsTab — participant picker` block with:

```tsx
describe('BracketDrawsTab — draw detail panel', () => {
  it('opens the panel on row click and closes on Escape', () => {
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-draw-row-MS'));
    expect(screen.getByTestId('draw-detail-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('draw-detail-panel')).not.toBeInTheDocument();
  });

  it('commits singles picks from the panel via eventUpsert', async () => {
    mockBracketData = makeBracketData({ status: 'draft' });
    const next = { ...mockBracketData };
    mockEventUpsert.mockResolvedValue(next);
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-draw-row-MS'));
    const panel = screen.getByTestId('draw-detail-panel');
    const checkboxes = within(panel).getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(within(panel).getByRole('button', { name: /^Commit$/i }));
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith(
        'MS',
        expect.objectContaining({
          discipline: 'MS',
          format: 'se',
          participants: expect.arrayContaining([
            expect.objectContaining({ id: 'p-alex', name: 'Alex Tan' }),
            expect.objectContaining({ id: 'p-ben', name: 'Ben Carter' }),
          ]),
        }),
      ),
    );
    expect(mockSetData).toHaveBeenCalledWith(next);
  });

  it('row action buttons do not open the panel', () => {
    mockBracketData = makeBracketData({ status: 'generated' });
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-open-draw-MS'));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('draw-detail-panel')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the full BracketDrawsTab test file**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket/__tests__/BracketDrawsTab.test.tsx`
Expected: PASS — all describes, no skips remaining.

- [ ] **Step 7: Commit**

```bash
git add products/scheduler/frontend/src/products/bracket/DrawDetailPanel.tsx products/scheduler/frontend/src/products/bracket/__tests__/DrawDetailPanel.test.tsx products/scheduler/frontend/src/products/bracket/BracketDrawsTab.tsx products/scheduler/frontend/src/products/bracket/__tests__/BracketDrawsTab.test.tsx
git commit -m "feat(bracket): draw detail panel hosts the participant picker

Row click docks the shared DetailPanel (config summary + picker);
actions stay inline on the row and stopPropagation past the row click.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ft3AEr4oDorDSeqhWqRXTG"
```

---

### Task 4: Gates — full suite, lint, boundaries

**Files:**
- No new files; fixes only if a gate fails.

**Interfaces:**
- Consumes: everything above.
- Produces: a green verification state for the Draws-table feature.

- [ ] **Step 1: Full frontend test suite**

Run: `npm --prefix products/scheduler/frontend run test:run`
Expected: PASS. Watch for collateral failures in `BracketTab.test.tsx` (it mounts the Draws view) — if it asserted card test-ids, update those assertions to the row equivalents (`bracket-draw-row-*`), nothing else.

- [ ] **Step 2: Lint + dependency boundaries**

Run: `npm run lint:scheduler`
Expected: PASS (warnings allowed; no new errors).
Run: `npm run depcruise`
Expected: no NEW violations (the ~11 known cross-product warns are pre-existing; `DrawDetailPanel` imports only from `components/`, `products/bracket/`, so it must add none).

- [ ] **Step 3: Commit (only if fixes were needed)**

```bash
git add -A
git commit -m "test(bracket): reconcile collateral assertions with the draws table

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ft3AEr4oDorDSeqhWqRXTG"
```

---

## Spec §2 coverage check

- Card grid → BandedTable grouped by discipline: Task 1. ✓
- Columns Code/Format/Size/Entered(amber-short)/Progress/Status/Actions: Task 1 (`DRAW_COLUMNS`; spec's "Discipline" reads from the group band, matching Matches). ✓
- Inline actions with existing rules (Generate gating, two-click Re-generate, locked-when-started, draft-only Configure, Swiss Next-round gating, Open draw): Task 2, reusing `ActionCell` + preserved test-ids. ✓
- Row click → DetailPanel with relocated participant picker + config summary: Task 3. ✓
- "＋ New draw" stays in ActionsBar with `NewDrawModal`: untouched (Task 1 leaves the ActionsBar and both modals alone). ✓
- StatusPillFor / status derivation reused, not rewritten: `StatusPillFor`, `drawCountsByEvent`, completion rule move verbatim into `DrawRow`. ✓

**Known deviation:** the whole-card-click→open-draw affordance is intentionally replaced by row-click→panel (spec §2 sanctions this); "Open draw →" remains the navigation control.
