> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Bundle 2 — Bracket Schedule chrome parity (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the bracket Schedule tab the same three chrome elements that frame the meet Schedule — a controls header above the grid, a matches table below, and a details sidebar to the right — while keeping the bracket Schedule read-only.

**Architecture:** Three new bracket-namespaced components (`BracketScheduleHeader`, `BracketMatchesTable`, `BracketScheduleSidebar`) compose around the existing `ScheduleView`. Selection state lives in `BracketTab` and threads through to the grid, table, and sidebar. No backend changes, no new API calls, no drag/pin/validate.

**Tech Stack:** TypeScript + React 18 + Vitest + @testing-library/react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-15-bundle-2-bracket-schedule-chrome-design.md`
**Branch:** `feat/bundle-2-bracket-schedule-chrome`
**Base SHA:** `cb323b6` (post-Bundle-1 merge on main)

---

## File map

| File | Action | Why |
|---|---|---|
| `products/scheduler/frontend/src/features/bracket/ScheduleView.tsx` | modify | Add optional `selectedId` + `onSelect` props; render selection ring; fire `onSelect` on block click |
| `products/scheduler/frontend/src/features/bracket/formatBracketSlot.ts` | create | Pure slot→time helper using `interval_minutes` + `start_time`; falls back to absolute slot when `start_time` is null |
| `products/scheduler/frontend/src/lib/__tests__/formatBracketSlot.test.ts` | create | Unit tests for the slot-time helper |
| `products/scheduler/frontend/src/features/bracket/BracketScheduleHeader.tsx` | create | "{N} play units across {M} courts" + Export JSON/CSV/ICS buttons |
| `products/scheduler/frontend/src/lib/__tests__/BracketScheduleHeader.test.tsx` | create | Render assertions for the header |
| `products/scheduler/frontend/src/features/bracket/BracketMatchesTable.tsx` | create | By Time / By Court table with inline search, row-click selection |
| `products/scheduler/frontend/src/lib/__tests__/BracketMatchesTable.test.tsx` | create | Tests for rendering, search, view toggle, selection |
| `products/scheduler/frontend/src/features/bracket/BracketScheduleSidebar.tsx` | create | Right-rail details pane keyed off `selectedId` |
| `products/scheduler/frontend/src/lib/__tests__/BracketScheduleSidebar.test.tsx` | create | Tests for empty state, stale id, populated, winner badge |
| `products/scheduler/frontend/src/features/bracket/BracketTab.tsx` | modify | Add `selectedPlayUnitId` state; rewire the Schedule branch to compose the four pieces |
| `products/scheduler/frontend/src/lib/__tests__/BracketTab.test.tsx` | modify | Add assertion that the Schedule branch renders header + table + sidebar |
| `products/scheduler/frontend/src/lib/__tests__/ScheduleView.test.tsx` | modify | Add an `onSelect` interaction assertion |

---

## Task 1: Extend `ScheduleView` with optional selection props

### Red — write the failing assertion

**Files:**
- Modify: `products/scheduler/frontend/src/lib/__tests__/ScheduleView.test.tsx`

- [ ] **Step 1: Read the existing test file**

```bash
cat products/scheduler/frontend/src/lib/__tests__/ScheduleView.test.tsx | head -60
```

Note the existing fixture builders + import shape.

- [ ] **Step 2: Append a new test case at the bottom of the existing `describe` block**

```tsx
  it('fires onSelect with the play_unit_id when a block is clicked', async () => {
    const onSelect = vi.fn();
    const data = makeBracketDataWithOneAssignment();
    const { container } = render(<ScheduleView data={data} onSelect={onSelect} />);
    // The block carries a data-testid we add for selectability.
    const block = container.querySelector('[data-testid^="bracket-block-"]');
    expect(block).not.toBeNull();
    await userEvent.click(block!);
    expect(onSelect).toHaveBeenCalledWith(data.play_units[0].id);
  });

  it('renders a selection ring when selectedId matches a block', () => {
    const data = makeBracketDataWithOneAssignment();
    const { container } = render(
      <ScheduleView data={data} selectedId={data.play_units[0].id} />,
    );
    const block = container.querySelector('[data-testid^="bracket-block-"]');
    expect(block).not.toBeNull();
    expect(block?.className).toMatch(/ring-/);
  });
```

If `userEvent` isn't imported, add the import:

```ts
import userEvent from '@testing-library/user-event';
```

If `makeBracketDataWithOneAssignment` doesn't exist, add this helper above the new tests:

```ts
function makeBracketDataWithOneAssignment() {
  return {
    courts: 2,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [{
      id: 'MS-1', discipline: 'MS', format: 'se' as const,
      bracket_size: 2, participant_count: 2, rounds: [], status: 'generated' as const,
    }],
    participants: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    play_units: [{
      id: 'pu1', event_id: 'MS-1', round_index: 0, match_index: 0,
      side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [],
      slot_a: { type: 'participant' as const, participant_id: 'p1' },
      slot_b: { type: 'participant' as const, participant_id: 'p2' },
    }],
    assignments: [{
      play_unit_id: 'pu1', slot_id: 0, court_id: 1, duration_slots: 1,
      actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
    }],
    results: [],
  };
}
```

If the test file already builds its data inline, mirror that pattern instead of using this helper — the goal is one assignment, one play_unit, two participants.

- [ ] **Step 3: Run the failing tests**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/ScheduleView.test.tsx
```

Expected: the two new tests fail. The first because `onSelect` isn't a prop and the click handler doesn't fire it; the second because there's no `selectedId` prop and no ring class.

### Green — minimal implementation

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/ScheduleView.tsx`

- [ ] **Step 4: Add the optional props to `ScheduleView`**

In `ScheduleView.tsx`, change the `Props` interface and the function signature:

```tsx
interface Props {
  data: BracketTournamentDTO;
  /** Currently selected play_unit_id. Block with this id renders with a
   *  selection ring. Null/undefined = no selection. */
  selectedId?: string | null;
  /** Fires when an operator clicks a block. Receives the play_unit_id.
   *  Block click is a no-op when `onSelect` is undefined. */
  onSelect?: (playUnitId: string) => void;
}

export function ScheduleView({ data, selectedId, onSelect }: Props) {
```

- [ ] **Step 5: Render the selection ring + click handler inside `renderBlock`**

Find the existing `renderBlock` definition (uses `useCallback`). Replace its body:

```tsx
const renderBlock = useCallback(
  (placement: Placement) => {
    const pu = puById[placement.key];
    const discipline = pu
      ? data.events.find((e) => e.id === pu.event_id)?.discipline
      : undefined;
    const color = getEventColor(discipline);
    const tooltip = pu ? buildTooltip(pu, data) : '';
    const dimmed = pu ? eventFilter[pu.event_id] === false : false;
    const isSelected = pu?.id === selectedId;

    const baseClasses = `h-full w-full rounded-sm border px-2 py-1 ${color.bg} ${color.border}`;
    const stateClasses = [
      dimmed ? 'opacity-40' : '',
      isSelected ? 'ring-2 ring-accent ring-offset-1' : '',
      onSelect ? 'cursor-pointer' : '',
    ].filter(Boolean).join(' ');

    return (
      <div
        data-testid={pu ? `bracket-block-${pu.id}` : undefined}
        className={`${baseClasses} ${stateClasses}`}
        title={tooltip}
        onClick={pu && onSelect ? () => onSelect(pu.id) : undefined}
      >
        <div className="text-2xs font-mono truncate tracking-[0.18em]">{pu?.id}</div>
      </div>
    );
  },
  [puById, data, eventFilter, selectedId, onSelect],
);
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/ScheduleView.test.tsx
```

Expected: all tests pass (existing + 2 new).

- [ ] **Step 7: Run the wider suite**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: 118 tests pass (was 116). Every existing caller of `ScheduleView` should continue to work because the new props are optional.

- [ ] **Step 8: Commit**

```bash
git add products/scheduler/frontend/src/features/bracket/ScheduleView.tsx \
        products/scheduler/frontend/src/lib/__tests__/ScheduleView.test.tsx
git commit -m "feat(bracket): ScheduleView accepts selectedId + onSelect

Optional props for block selection — selectedId renders a ring,
onSelect fires on block click with the play_unit_id. Both default
to undefined so existing callers are unchanged.

Foundation for Bundle 2's bracket Schedule chrome (the click target
the new BracketMatchesTable + BracketScheduleSidebar listen to)."
```

---

## Task 2: `formatBracketSlot` pure helper

### Red

**Files:**
- Create: `products/scheduler/frontend/src/lib/__tests__/formatBracketSlot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/**
 * Unit tests for the bracket slot-to-time helper used by
 * BracketMatchesTable's "By Time" view and BracketScheduleSidebar.
 *
 * `start_time` is the wall clock at slot 0; `interval_minutes` is the
 * duration of one slot. The helper formats `slot_id + start_time +
 * interval * slot_id` minutes as `HH:MM`. When `start_time` is null
 * the helper returns the absolute-slot fallback `"Slot {n}"`.
 */
import { describe, expect, it } from 'vitest';
import { formatBracketSlot } from '../../features/bracket/formatBracketSlot';

describe('formatBracketSlot', () => {
  it('formats slot 0 against a 09:00 start in 30-min intervals', () => {
    expect(formatBracketSlot(0, { start_time: '09:00', interval_minutes: 30 })).toBe('09:00');
  });

  it('formats slot 4 against a 09:00 start in 30-min intervals', () => {
    expect(formatBracketSlot(4, { start_time: '09:00', interval_minutes: 30 })).toBe('11:00');
  });

  it('rolls minutes correctly across the hour', () => {
    expect(formatBracketSlot(3, { start_time: '09:00', interval_minutes: 25 })).toBe('10:15');
  });

  it('falls back to "Slot N" when start_time is null', () => {
    expect(formatBracketSlot(5, { start_time: null, interval_minutes: 30 })).toBe('Slot 5');
  });

  it('falls back to "Slot N" when start_time is an empty string', () => {
    expect(formatBracketSlot(2, { start_time: '', interval_minutes: 30 })).toBe('Slot 2');
  });

  it('handles a non-HH:MM start_time by falling back', () => {
    expect(formatBracketSlot(1, { start_time: 'noon', interval_minutes: 30 })).toBe('Slot 1');
  });

  it('zero-pads single-digit hours', () => {
    expect(formatBracketSlot(0, { start_time: '09:00', interval_minutes: 30 })).toBe('09:00');
    expect(formatBracketSlot(2, { start_time: '08:00', interval_minutes: 30 })).toBe('09:00');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/formatBracketSlot.test.ts
```

Expected: file fails to resolve (`formatBracketSlot` doesn't exist).

### Green

**Files:**
- Create: `products/scheduler/frontend/src/features/bracket/formatBracketSlot.ts`

- [ ] **Step 3: Write the helper**

```ts
/**
 * Pure slot-to-time helper for the bracket Schedule chrome.
 *
 * Given a 0-based slot id and the bracket's `interval_minutes` +
 * `start_time` config, return an `HH:MM` wall-clock string. When
 * `start_time` is null / empty / unparseable, return the absolute
 * `"Slot N"` fallback so the operator still sees a stable label.
 */
export interface BracketSlotContext {
  /** ISO-like HH:MM wall-clock string, or null for a tournament that
   *  hasn't pinned a start time. */
  start_time: string | null | undefined;
  /** Minutes per slot. */
  interval_minutes: number;
}

const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

export function formatBracketSlot(
  slotId: number,
  ctx: BracketSlotContext,
): string {
  const { start_time, interval_minutes } = ctx;
  if (!start_time) return `Slot ${slotId}`;
  const m = HHMM_RE.exec(start_time.trim());
  if (!m) return `Slot ${slotId}`;
  const startHours = parseInt(m[1], 10);
  const startMinutes = parseInt(m[2], 10);
  if (!Number.isFinite(startHours) || !Number.isFinite(startMinutes)) {
    return `Slot ${slotId}`;
  }
  const totalMinutes = startHours * 60 + startMinutes + slotId * interval_minutes;
  const hh = Math.floor(totalMinutes / 60) % 24;
  const mm = totalMinutes % 60;
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/formatBracketSlot.test.ts
```

Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/frontend/src/features/bracket/formatBracketSlot.ts \
        products/scheduler/frontend/src/lib/__tests__/formatBracketSlot.test.ts
git commit -m "feat(bracket): formatBracketSlot helper for slot-to-time labels

Pure (slot_id, {interval_minutes, start_time}) -> 'HH:MM' helper.
Falls back to 'Slot N' when start_time is null / empty / unparseable
so the matches table and sidebar still render a stable label.

Used by BracketMatchesTable (By Time view) and BracketScheduleSidebar."
```

---

## Task 3: `BracketScheduleHeader`

### Red

**Files:**
- Create: `products/scheduler/frontend/src/lib/__tests__/BracketScheduleHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * Tests for BracketScheduleHeader — the controls strip above the
 * bracket Schedule grid. Renders the play-unit count summary and
 * three Export buttons (JSON / CSV / ICS) linked to the api-client
 * URL builders.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketScheduleHeader } from '../../features/bracket/BracketScheduleHeader';
import type { BracketTournamentDTO } from '../../api/bracketDto';

// Mock useTournamentId so the header sees a stable tid in the test.
vi.mock('../../hooks/useTournamentId', () => ({
  useTournamentId: () => 't1',
}));

function makeData(assignments: number, courts: number): BracketTournamentDTO {
  return {
    courts,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [],
    participants: [],
    play_units: [],
    assignments: Array.from({ length: assignments }, (_, i) => ({
      play_unit_id: `pu${i}`, slot_id: 0, court_id: 1, duration_slots: 1,
      actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
    })),
    results: [],
  };
}

describe('<BracketScheduleHeader />', () => {
  it('renders the empty-bracket count', () => {
    render(<BracketScheduleHeader data={makeData(0, 4)} />);
    expect(screen.getByText(/0 play units scheduled across 4 courts/i)).toBeInTheDocument();
  });

  it('renders the populated count', () => {
    render(<BracketScheduleHeader data={makeData(8, 4)} />);
    expect(screen.getByText(/8 play units scheduled across 4 courts/i)).toBeInTheDocument();
  });

  it('renders three Export buttons with the correct hrefs', () => {
    render(<BracketScheduleHeader data={makeData(8, 4)} />);
    const json = screen.getByRole('link', { name: /export json/i });
    const csv = screen.getByRole('link', { name: /export csv/i });
    const ics = screen.getByRole('link', { name: /export ics/i });
    expect(json.getAttribute('href')).toMatch(/\/t1\/.*\.json/i);
    expect(csv.getAttribute('href')).toMatch(/\/t1\/.*\.csv/i);
    expect(ics.getAttribute('href')).toMatch(/\/t1\/.*\.ics/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketScheduleHeader.test.tsx
```

Expected: file fails to resolve.

### Green

**Files:**
- Create: `products/scheduler/frontend/src/features/bracket/BracketScheduleHeader.tsx`

- [ ] **Step 3: Write the component**

```tsx
/**
 * Controls strip above the bracket Schedule grid. Mirrors the shape
 * of the meet's Schedule header (left-aligned status, right-aligned
 * actions) but with no Generate / Re-optimize buttons — bracket draws
 * are generated per-event from the Events tab, and the Schedule is
 * post-generation read-only.
 */
import { apiClient } from '../../api/client';
import { useTournamentId } from '../../hooks/useTournamentId';
import type { BracketTournamentDTO } from '../../api/bracketDto';

interface Props {
  data: BracketTournamentDTO;
}

export function BracketScheduleHeader({ data }: Props) {
  const tid = useTournamentId();
  const count = data.assignments.length;
  const linkClasses =
    'inline-flex items-center rounded-sm border border-border bg-card px-2 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40';

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 py-2">
      <p className="text-2xs text-muted-foreground">
        {count} play unit{count === 1 ? '' : 's'} scheduled across {data.courts} court{data.courts === 1 ? '' : 's'}
      </p>
      <div className="flex items-center gap-1">
        <a className={linkClasses} href={apiClient.bracketExportJsonUrl(tid)} download>Export JSON</a>
        <a className={linkClasses} href={apiClient.bracketExportCsvUrl(tid)} download>Export CSV</a>
        <a className={linkClasses} href={apiClient.bracketExportIcsUrl(tid)} download>Export ICS</a>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketScheduleHeader.test.tsx
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/frontend/src/features/bracket/BracketScheduleHeader.tsx \
        products/scheduler/frontend/src/lib/__tests__/BracketScheduleHeader.test.tsx
git commit -m "feat(bracket): BracketScheduleHeader controls strip

Play-unit count summary + Export JSON/CSV/ICS links. No Generate or
Re-optimize — bracket Schedule is post-generation read-only.

Uses the existing apiClient.bracketExport*Url URL builders; no new
backend calls."
```

---

## Task 4: `BracketMatchesTable`

This is the biggest component in the bundle — table with view toggle, search, and selection. Single TDD pass with multiple test cases.

### Red — write all test cases

**Files:**
- Create: `products/scheduler/frontend/src/lib/__tests__/BracketMatchesTable.test.tsx`

- [ ] **Step 1: Write the failing test file**

```tsx
/**
 * Tests for BracketMatchesTable. Renders one row per assignment with
 * play_unit / participants / court / time. Supports By Time / By Court
 * view toggle, inline search filtering, and row-click selection.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BracketMatchesTable } from '../../features/bracket/BracketMatchesTable';
import type { BracketTournamentDTO } from '../../api/bracketDto';

function makeTwoMatchData(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [{
      id: 'MS-1', discipline: 'MS', format: 'se',
      bracket_size: 4, participant_count: 4, rounds: [], status: 'generated',
    }],
    participants: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
      { id: 'p4', name: 'Dan' },
    ],
    play_units: [
      {
        id: 'pu1', event_id: 'MS-1', round_index: 0, match_index: 0,
        side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [],
        slot_a: { type: 'participant', participant_id: 'p1' },
        slot_b: { type: 'participant', participant_id: 'p2' },
      },
      {
        id: 'pu2', event_id: 'MS-1', round_index: 0, match_index: 1,
        side_a: ['p3'], side_b: ['p4'], duration_slots: 1, dependencies: [],
        slot_a: { type: 'participant', participant_id: 'p3' },
        slot_b: { type: 'participant', participant_id: 'p4' },
      },
    ],
    assignments: [
      {
        play_unit_id: 'pu1', slot_id: 0, court_id: 1, duration_slots: 1,
        actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
      },
      {
        play_unit_id: 'pu2', slot_id: 0, court_id: 2, duration_slots: 1,
        actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
      },
    ],
    results: [],
  };
}

describe('<BracketMatchesTable />', () => {
  it('renders one row per assignment', () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    // Both play units should be in the document.
    expect(screen.getByText('pu1')).toBeInTheDocument();
    expect(screen.getByText('pu2')).toBeInTheDocument();
  });

  it('shows the "X of Y scheduled" summary in the header', () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/2 of 2 scheduled/i)).toBeInTheDocument();
  });

  it('narrows rows when the search input filters by participant name', async () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    const search = screen.getByPlaceholderText(/search/i);
    await userEvent.type(search, 'Alice');
    expect(screen.queryByText('pu1')).toBeInTheDocument();
    expect(screen.queryByText('pu2')).not.toBeInTheDocument();
    expect(screen.getByText(/1 of 2 scheduled/i)).toBeInTheDocument();
  });

  it('narrows rows when the search input filters by event id', async () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    const search = screen.getByPlaceholderText(/search/i);
    await userEvent.type(search, 'MS-1');
    expect(screen.getByText('pu1')).toBeInTheDocument();
    expect(screen.getByText('pu2')).toBeInTheDocument();
  });

  it('fires onSelect with the play_unit_id when a row is clicked', async () => {
    const onSelect = vi.fn();
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    const row = screen.getByText('pu1').closest('tr')!;
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('pu1');
  });

  it('groups rows by court header in the "By Court" view', async () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    const byCourt = screen.getByRole('button', { name: /by court/i });
    await userEvent.click(byCourt);
    expect(screen.getByText(/court c1/i)).toBeInTheDocument();
    expect(screen.getByText(/court c2/i)).toBeInTheDocument();
  });

  it('groups rows by slot header in the "By Time" view (default)', () => {
    render(
      <BracketMatchesTable
        data={makeTwoMatchData()}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    // start_time 09:00 + slot 0 = '09:00' label
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
  });

  it('renders the empty-bracket state when there are no assignments', () => {
    const data = makeTwoMatchData();
    data.assignments = [];
    render(
      <BracketMatchesTable
        data={data}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/no matches yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketMatchesTable.test.tsx
```

Expected: file fails to resolve.

### Green

**Files:**
- Create: `products/scheduler/frontend/src/features/bracket/BracketMatchesTable.tsx`

- [ ] **Step 3: Write the component**

```tsx
/**
 * Matches table below the bracket Schedule grid.
 *
 * Mirrors the meet's pages/schedule/MatchesTable shape, adapted for
 * bracket DTOs and stripped of meet-only affordances:
 *   - No URL-backed filter state (bracket doesn't have the multi-tab
 *     search-share affordance the meet has)
 *   - No event filter chips (single global event filter lives on
 *     BracketViewHeader, not here)
 *   - Two views: By Time (group by slot_id), By Court (group by court_id)
 *
 * Row click selects the play_unit; the parent threads selection back
 * to the grid and sidebar.
 */
import { useMemo, useState } from 'react';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { formatBracketSlot } from './formatBracketSlot';

type View = 'time' | 'court';

interface Props {
  data: BracketTournamentDTO;
  selectedId: string | null;
  onSelect: (playUnitId: string) => void;
}

export function BracketMatchesTable({ data, selectedId, onSelect }: Props) {
  const [view, setView] = useState<View>('time');
  const [query, setQuery] = useState('');

  const puById = useMemo(
    () => new Map(data.play_units.map((p) => [p.id, p])),
    [data.play_units],
  );
  const participantById = useMemo(
    () => new Map(data.participants.map((p) => [p.id, p])),
    [data.participants],
  );

  const totalCount = data.assignments.length;

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return data.assignments;
    return data.assignments.filter((a) => {
      const pu = puById.get(a.play_unit_id);
      if (!pu) return false;
      const haystackParts: string[] = [
        pu.id,
        pu.event_id,
        `c${a.court_id}`,
        ...(pu.side_a ?? []).map((id) => participantById.get(id)?.name ?? ''),
        ...(pu.side_b ?? []).map((id) => participantById.get(id)?.name ?? ''),
      ];
      return haystackParts.join(' ').toLowerCase().includes(q);
    });
  }, [data.assignments, query, puById, participantById]);

  const filteredCount = filtered.length;

  // Group assignments per the current view.
  const groups = useMemo(() => {
    const map = new Map<number, typeof data.assignments>();
    const key = (a: typeof data.assignments[number]) =>
      view === 'time' ? a.slot_id : a.court_id;
    for (const a of filtered) {
      const k = key(a);
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [filtered, view, data.assignments]);

  if (totalCount === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-auto px-4 py-6 text-sm text-muted-foreground">
        No matches yet — generate from the <strong>Events</strong> tab.
      </div>
    );
  }

  const resolveSide = (ids: string[] | null): string => {
    if (!ids || ids.length === 0) return 'TBD';
    return ids.map((id) => participantById.get(id)?.name ?? id).join(' / ');
  };

  const tabClasses = (active: boolean) =>
    `${active ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'} rounded-sm border border-border px-2 py-1 text-2xs`;

  return (
    <div className="flex-1 min-h-0 overflow-auto border-t border-border">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-4 py-2">
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Matches
        </div>
        <div className="text-2xs tabular-nums text-muted-foreground">
          {filteredCount} of {totalCount} scheduled
        </div>
        <div className="ml-2 flex items-center gap-1">
          <button type="button" className={tabClasses(view === 'time')} onClick={() => setView('time')}>By Time</button>
          <button type="button" className={tabClasses(view === 'court')} onClick={() => setView('court')}>By Court</button>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search event, player, court…"
          className="ml-auto w-56 rounded-sm border border-border bg-card px-2 py-1 text-2xs"
        />
      </div>
      <table className="w-full text-2xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-1 text-left">Time</th>
            <th className="px-4 py-1 text-left">Ct</th>
            <th className="px-4 py-1 text-left">Match</th>
            <th className="px-4 py-1 text-left">Players</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([groupKey, rows]) => (
            <ScopeGroupRows
              key={groupKey}
              view={view}
              groupKey={groupKey}
              rows={rows}
              data={data}
              puById={puById}
              selectedId={selectedId}
              onSelect={onSelect}
              resolveSide={resolveSide}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Inline sub-component: one group's header row + its match rows.
// Pulled out so the parent's JSX stays scannable.
function ScopeGroupRows({
  view,
  groupKey,
  rows,
  data,
  puById,
  selectedId,
  onSelect,
  resolveSide,
}: {
  view: View;
  groupKey: number;
  rows: typeof data.assignments;
  data: BracketTournamentDTO;
  puById: Map<string, BracketTournamentDTO['play_units'][number]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  resolveSide: (ids: string[] | null) => string;
}) {
  const header =
    view === 'time'
      ? formatBracketSlot(groupKey, { start_time: data.start_time, interval_minutes: data.interval_minutes })
      : `Court C${groupKey}`;
  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={4} className="px-4 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {header}
        </td>
      </tr>
      {rows.map((a) => {
        const pu = puById.get(a.play_unit_id);
        if (!pu) return null;
        const sideA = resolveSide(pu.side_a);
        const sideB = resolveSide(pu.side_b);
        const isSelected = pu.id === selectedId;
        const time = formatBracketSlot(a.slot_id, {
          start_time: data.start_time,
          interval_minutes: data.interval_minutes,
        });
        return (
          <tr
            key={pu.id}
            onClick={() => onSelect(pu.id)}
            className={`cursor-pointer border-b border-border/40 hover:bg-muted/40 ${
              isSelected ? 'bg-accent/10 ring-1 ring-accent/30' : ''
            }`}
          >
            <td className="px-4 py-1 tabular-nums">{time}</td>
            <td className="px-4 py-1 tabular-nums">C{a.court_id}</td>
            <td className="px-4 py-1 font-mono">{pu.id}</td>
            <td className="px-4 py-1">
              {sideA} <span className="text-muted-foreground">vs</span> {sideB}
            </td>
          </tr>
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketMatchesTable.test.tsx
```

Expected: 8/8 pass.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/frontend/src/features/bracket/BracketMatchesTable.tsx \
        products/scheduler/frontend/src/lib/__tests__/BracketMatchesTable.test.tsx
git commit -m "feat(bracket): BracketMatchesTable below the Schedule grid

Mirrors meet's MatchesTable shape — By Time / By Court toggle, inline
search by participant/event/court, row-click selection. Read-only; no
URL-backed filter state (bracket doesn't have the multi-tab search-share
the meet uses).

Uses formatBracketSlot for the time column."
```

---

## Task 5: `BracketScheduleSidebar`

### Red

**Files:**
- Create: `products/scheduler/frontend/src/lib/__tests__/BracketScheduleSidebar.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
/**
 * Tests for BracketScheduleSidebar — right-rail details pane keyed
 * off selectedId. Renders play unit metadata + sides + state badge.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketScheduleSidebar } from '../../features/bracket/BracketScheduleSidebar';
import type { BracketTournamentDTO } from '../../api/bracketDto';

function makeData(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [{
      id: 'MS-1', discipline: 'MS', format: 'se',
      bracket_size: 2, participant_count: 2, rounds: [], status: 'generated',
    }],
    participants: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    play_units: [{
      id: 'pu1', event_id: 'MS-1', round_index: 0, match_index: 0,
      side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [],
      slot_a: { type: 'participant', participant_id: 'p1' },
      slot_b: { type: 'participant', participant_id: 'p2' },
    }],
    assignments: [{
      play_unit_id: 'pu1', slot_id: 0, court_id: 1, duration_slots: 1,
      actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
    }],
    results: [],
  };
}

describe('<BracketScheduleSidebar />', () => {
  it('renders the empty hint when selectedId is null', () => {
    render(<BracketScheduleSidebar data={makeData()} selectedId={null} />);
    expect(screen.getByText(/click a match to see details/i)).toBeInTheDocument();
  });

  it('renders the empty hint when selectedId does not resolve', () => {
    render(<BracketScheduleSidebar data={makeData()} selectedId="stale-id" />);
    expect(screen.getByText(/click a match to see details/i)).toBeInTheDocument();
  });

  it('renders discipline + round + match + court + slot when a play unit is selected', () => {
    render(<BracketScheduleSidebar data={makeData()} selectedId="pu1" />);
    expect(screen.getByText(/MS/i)).toBeInTheDocument();
    expect(screen.getByText(/R1 M1/i)).toBeInTheDocument();
    expect(screen.getByText(/C1/i)).toBeInTheDocument();
    expect(screen.getByText(/09:00/i)).toBeInTheDocument();
  });

  it('renders the side rosters', () => {
    render(<BracketScheduleSidebar data={makeData()} selectedId="pu1" />);
    expect(screen.getByText(/Alice/i)).toBeInTheDocument();
    expect(screen.getByText(/Bob/i)).toBeInTheDocument();
  });

  it('renders "TBD" for null sides', () => {
    const data = makeData();
    data.play_units[0].side_a = null;
    render(<BracketScheduleSidebar data={data} selectedId="pu1" />);
    expect(screen.getAllByText(/TBD/i).length).toBeGreaterThan(0);
  });

  it('renders a "Ready" state badge when no result exists', () => {
    render(<BracketScheduleSidebar data={makeData()} selectedId="pu1" />);
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
  });

  it('renders "Winner: Side A" when a winner result exists', () => {
    const data = makeData();
    data.results = [{ play_unit_id: 'pu1', winner_side: 'A', walkover: false, finished_at_slot: 0 }];
    render(<BracketScheduleSidebar data={data} selectedId="pu1" />);
    expect(screen.getByText(/winner: side a/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketScheduleSidebar.test.tsx
```

Expected: file fails to resolve.

### Green

**Files:**
- Create: `products/scheduler/frontend/src/features/bracket/BracketScheduleSidebar.tsx`

- [ ] **Step 3: Write the component**

```tsx
/**
 * Right-rail details pane for the bracket Schedule. Keyed off
 * `selectedId`. Read-only by design — no Director, Re-plan, or Move/
 * Postpone affordances (those are meet-only solver actions).
 */
import { useMemo } from 'react';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { formatBracketSlot } from './formatBracketSlot';

interface Props {
  data: BracketTournamentDTO;
  selectedId: string | null;
}

export function BracketScheduleSidebar({ data, selectedId }: Props) {
  const pu = useMemo(
    () => (selectedId ? data.play_units.find((p) => p.id === selectedId) : undefined),
    [data.play_units, selectedId],
  );
  const assignment = useMemo(
    () => (selectedId ? data.assignments.find((a) => a.play_unit_id === selectedId) : undefined),
    [data.assignments, selectedId],
  );
  const event = useMemo(
    () => (pu ? data.events.find((e) => e.id === pu.event_id) : undefined),
    [data.events, pu],
  );
  const result = useMemo(
    () => (selectedId ? data.results.find((r) => r.play_unit_id === selectedId) : undefined),
    [data.results, selectedId],
  );
  const participantById = useMemo(
    () => new Map(data.participants.map((p) => [p.id, p])),
    [data.participants],
  );

  if (!pu || !assignment) {
    return (
      <aside className="w-64 shrink-0 border-l border-border bg-background px-4 py-6 text-sm text-muted-foreground">
        Click a match to see details.
      </aside>
    );
  }

  const resolveSide = (ids: string[] | null): string => {
    if (!ids || ids.length === 0) return 'TBD';
    return ids.map((id) => participantById.get(id)?.name ?? id).join(' / ');
  };

  const time = formatBracketSlot(assignment.slot_id, {
    start_time: data.start_time,
    interval_minutes: data.interval_minutes,
  });

  const state = result
    ? 'done'
    : assignment.started
      ? 'live'
      : 'ready';
  const stateClasses =
    state === 'done'
      ? 'bg-status-done/15 text-status-done'
      : state === 'live'
        ? 'bg-status-live/15 text-status-live'
        : 'bg-muted text-muted-foreground';

  return (
    <aside className="w-64 shrink-0 overflow-auto border-l border-border bg-background px-4 py-4">
      <div className="mb-3">
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {event?.discipline ?? '—'}
        </div>
        <div className="text-sm font-medium text-foreground">
          R{pu.round_index + 1} M{pu.match_index + 1}
        </div>
        <div className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
          C{assignment.court_id} · {time}
        </div>
      </div>
      <div className="space-y-1 border-t border-border pt-3 text-2xs">
        <div>
          <span className="text-muted-foreground">Side A:</span>{' '}
          <span className="text-foreground">{resolveSide(pu.side_a)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Side B:</span>{' '}
          <span className="text-foreground">{resolveSide(pu.side_b)}</span>
        </div>
      </div>
      <div className="mt-3 border-t border-border pt-3 text-2xs">
        <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 font-medium capitalize ${stateClasses}`}>
          {state}
        </span>
        {result ? (
          <div className="mt-1 text-foreground">
            Winner: Side {result.winner_side}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketScheduleSidebar.test.tsx
```

Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/frontend/src/features/bracket/BracketScheduleSidebar.tsx \
        products/scheduler/frontend/src/lib/__tests__/BracketScheduleSidebar.test.tsx
git commit -m "feat(bracket): BracketScheduleSidebar right-rail details

Read-only details pane keyed off selectedId. Renders discipline +
round + match + court + slot + sides + state badge. Winner: Side X
when a result exists. Empty hint when no selection or stale selection.

No Director/Re-plan/Move-Postpone — those are meet-only solver
affordances that don't apply to bracket's pre-generated draws."
```

---

## Task 6: Wire `BracketTab` Schedule branch

### Red — extend `BracketTab.test.tsx`

**Files:**
- Modify: `products/scheduler/frontend/src/lib/__tests__/BracketTab.test.tsx`

- [ ] **Step 1: Add new test case**

The existing file mocks `useBracket` once at the top to always return `{ data: null, ... }`. The new test needs a populated payload, so override the mock per-test with `vi.mocked(useBracket).mockReturnValue(...)`.

Add these imports at the top of `BracketTab.test.tsx` (if not already present):

```ts
import { useBracket } from '../../hooks/useBracket';
import type { BracketTournamentDTO } from '../../api/bracketDto';
```

Add a fixture helper near the top of the file (after the existing `renderBracketTab` helper, before the first `describe`):

```ts
function makePopulatedBracket(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [{
      id: 'MS-1', discipline: 'MS', format: 'se',
      bracket_size: 2, participant_count: 2, rounds: [], status: 'generated',
    }],
    participants: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    play_units: [{
      id: 'pu1', event_id: 'MS-1', round_index: 0, match_index: 0,
      side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [],
      slot_a: { type: 'participant', participant_id: 'p1' },
      slot_b: { type: 'participant', participant_id: 'p2' },
    }],
    assignments: [{
      play_unit_id: 'pu1', slot_id: 0, court_id: 1, duration_slots: 1,
      actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
    }],
    results: [],
  };
}
```

Add this new `describe` block AFTER the existing `describe('BracketTab — fresh tournament (data === null)', ...)` block:

```tsx
describe('BracketTab — Schedule chrome (data populated)', () => {
  it('renders header + table + sidebar on bracket-schedule tab', () => {
    // Override the default null-data mock for this test only.
    vi.mocked(useBracket).mockReturnValue({
      data: makePopulatedBracket(),
      setData: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    useUiStore.setState({ activeTab: 'bracket-schedule' });
    renderBracketTab();

    // Header: play-unit count summary.
    expect(screen.getByText(/play unit.*scheduled across/i)).toBeInTheDocument();

    // Table: the "X of Y scheduled" header strip.
    expect(screen.getByText(/of 1 scheduled/i)).toBeInTheDocument();

    // Sidebar: empty hint by default (nothing selected).
    expect(screen.getByText(/click a match to see details/i)).toBeInTheDocument();
  });
});
```

If `vi.mocked` raises a TS error (`useBracket` not a mocked module), prepend the file with:

```ts
vi.mocked; // touch the helper so vitest types it correctly
```

…or use `(useBracket as ReturnType<typeof vi.fn>).mockReturnValue(...)` instead.

- [ ] **Step 2: Run to verify failure**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketTab.test.tsx
```

Expected: the new assertion fails — the current Schedule branch only renders the grid (no header/table/sidebar yet).

### Green — rewire the Schedule branch

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/BracketTab.tsx`

- [ ] **Step 3: Add the new imports**

At the top of `BracketTab.tsx`:

```tsx
import { BracketScheduleHeader } from './BracketScheduleHeader';
import { BracketMatchesTable } from './BracketMatchesTable';
import { BracketScheduleSidebar } from './BracketScheduleSidebar';
```

- [ ] **Step 4: Add selection state inside the `BracketTab` component**

Find where the component declares its other useState/useMemo (near `eventId`, `data`, etc.) and add:

```tsx
const [selectedPlayUnitId, setSelectedPlayUnitId] = useState<string | null>(null);

// Reset selection when the bracket data identity changes (regenerate,
// event switch). `data` is replaced wholesale by the setData callback,
// not mutated in place, so a reference check is sufficient.
useEffect(() => {
  setSelectedPlayUnitId(null);
}, [data]);
```

If `useEffect` isn't already imported, add it to the existing `react` import.

- [ ] **Step 5: Replace the Schedule branch**

Find the existing line:

```tsx
{view === 'schedule' && data && (
  <ScheduleView
    data={data}
  />
)}
```

Replace with:

```tsx
{view === 'schedule' && data && (
  <div className="flex h-full min-h-0 flex-col overflow-hidden">
    <BracketScheduleHeader data={data} />
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 overflow-x-auto px-4 py-3">
          <ScheduleView
            data={data}
            selectedId={selectedPlayUnitId}
            onSelect={setSelectedPlayUnitId}
          />
        </div>
        <BracketMatchesTable
          data={data}
          selectedId={selectedPlayUnitId}
          onSelect={setSelectedPlayUnitId}
        />
      </div>
      <BracketScheduleSidebar
        data={data}
        selectedId={selectedPlayUnitId}
      />
    </div>
  </div>
)}
```

- [ ] **Step 6: Run the tests**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: all tests pass, including the new BracketTab Schedule assertion.

- [ ] **Step 7: TypeScript check**

```bash
cd products/scheduler/frontend
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add products/scheduler/frontend/src/features/bracket/BracketTab.tsx \
        products/scheduler/frontend/src/lib/__tests__/BracketTab.test.tsx
git commit -m "feat(bracket): wire Schedule branch with header + table + sidebar

The Schedule view now composes BracketScheduleHeader (above the grid),
BracketMatchesTable (below), and BracketScheduleSidebar (right rail).
ScheduleView gains selection via the new optional props from Task 1.

Selection state lives in BracketTab; clicking a block or a table row
highlights both and updates the sidebar. Reset to null when data
identity changes (regenerate / event switch).

Live tab is unchanged. Meet tabs are unchanged.

Closes Bundle 2 of the meet-vs-bracket audit follow-ups."
```

---

## Task 7: Browser walk-through (manual verification)

This task verifies the visual end-state and the interaction loop. No automated test — the spec's acceptance criterion 7 explicitly calls for a manual walk-through.

- [ ] **Step 1: Start the dev server**

```bash
cd products/scheduler/frontend
npm run dev
```

Note the port (Vite picks the first free one starting at 5173).

- [ ] **Step 2: Open the audit bracket on the Schedule tab**

URL: `http://localhost:<port>/tournaments/7fa7210a-b8fb-4301-8b04-8c4c2fb9e43a/bracket-schedule`
(or navigate from the dashboard → click into Audit Tournament 2026 → click Schedule tab)

- [ ] **Step 3: Verify the three chrome elements render**

- Header strip above the grid: shows "{N} play units scheduled across 4 courts" and three Export buttons.
- Matches table below the grid: shows the matches list with By Time / By Court tabs and a search input.
- Sidebar on the right: shows "Click a match to see details." initially.

- [ ] **Step 4: Verify selection round-trip**

- Click a block in the grid → sidebar updates.
- Click a row in the table → grid block gets a ring, sidebar updates.
- Click another block → previous selection clears, new one highlighted.

- [ ] **Step 5: Verify search**

- Type a participant name in the search box → table narrows.
- Clear → all rows return.

- [ ] **Step 6: Verify Export links**

- Right-click "Export JSON" → "Copy link" → paste; URL should match `/api/v1/tournaments/<tid>/bracket/export.json`. Same for CSV and ICS.
- (Don't need to download — just verify the URLs resolve.)

- [ ] **Step 7: Verify the Live tab is unchanged**

- Switch to Live tab; visual layout should be identical to before this bundle (MatchDetailPanel + court grid as it was).

- [ ] **Step 8: Verify the meet Schedule is unchanged**

- Open the audit meet's Schedule tab (`/tournaments/09fd8396-e836-4d33-bb97-68fbb27a0cc3/schedule`).
- Header, gantt, matches table, details panel all render as before. Bundle 1's gantt fix is still in effect (all 4 court rows populated).

- [ ] **Step 9: Stop the dev server**

```bash
# Ctrl-C in the dev server terminal
```

- [ ] **Step 10: Push the branch + open PR**

```bash
git push -u origin feat/bundle-2-bracket-schedule-chrome
gh pr create --base main \
  --title "feat(bracket): Schedule chrome parity (header + table + sidebar)" \
  --body "$(cat <<'EOF'
Bundle 2 of the meet-vs-bracket audit follow-ups.

Brings the bracket Schedule tab to visual parity with the meet
Schedule by adding the three chrome elements that frame the meet's
gantt:

1. **Header strip** above the grid — play-unit count + Export
   JSON/CSV/ICS.
2. **Matches table** below the grid — By Time / By Court toggle,
   inline search, row-click selection.
3. **Right-rail details sidebar** — discipline / round / match /
   court / slot / sides / state badge / winner.

Bracket Schedule remains display-only by design: no drag, no pin,
no /validate calls. Operators mutate from the Live tab or from
Draw's inline ↵ wins.

Selection state lives in BracketTab and threads to the grid + table
+ sidebar so clicking either updates the other two.

Bracket Live tab and all meet tabs are unchanged.

See:
- spec: docs/superpowers/specs/2026-05-15-bundle-2-bracket-schedule-chrome-design.md
- plan: docs/superpowers/plans/2026-05-15-bundle-2-bracket-schedule-chrome.md
EOF
)"
```

---

## Spec coverage check

| Spec requirement | Plan task |
|---|---|
| `ScheduleView` accepts `selectedId` + `onSelect` (additive) | Task 1 |
| Block click fires `onSelect`; selected block gets ring | Task 1 |
| `BracketScheduleHeader` — count summary + 3 Export links | Task 3 |
| `BracketMatchesTable` — one row per assignment, View toggle, search, selection | Task 4 |
| Search filters by event/participant/court | Task 4 |
| Empty-bracket state in the table | Task 4 |
| `BracketScheduleSidebar` — empty when null/stale, populated otherwise | Task 5 |
| "TBD" for null sides | Task 5 |
| Winner: Side X when a result exists | Task 5 |
| Slot-to-time helper used by table and sidebar | Task 2 |
| Fallback to `Slot N` when start_time is null | Task 2 |
| `BracketTab.Schedule` composes the four pieces with shared selection state | Task 6 |
| `useEffect` resets selection when data identity changes | Task 6 |
| Bracket Live tab unchanged | Task 6 — Live branch untouched |
| Meet Schedule + Live unchanged | every task — no meet files modified |
| Existing tests pass | Tasks 1, 6 |
| Manual browser walk-through | Task 7 |

No gaps.
