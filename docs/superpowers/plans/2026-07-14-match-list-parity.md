# Match List Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Meet and Bracket match lists visually and semantically identical — shared status vocabulary, shared column geometry, code chips on both, compact rows — and give Bracket contingency actions (walkover / retired / forfeit) through the command path.

**Architecture:** Shared primitives in `components/control-plane/` (status vocabulary, column spec, row chrome); each module keeps its own `renderRow` because editability genuinely differs (Meet inline-edits, Bracket is read-only). Meet derives the same 4-state status from schedule assignments + Operations match states. Contingency flows through `POST /tournaments/{tid}/bracket/commands` with a new optional `reason` field; distinct routing semantics for retired/forfeit are deferred (debt-log).

**Tech Stack:** React + TypeScript + Zustand + Tailwind (frontend), FastAPI + Pydantic (backend), vitest, pytest.

## Global Constraints

- Frontend tests: `npm --prefix products/scheduler/frontend run test:run -- <path>` (repo root cwd).
- Frontend lint: `npm run lint:scheduler`. Boundaries: `npm run depcruise` — `products/*` may import `components/`, never each other.
- Backend tests: `cd products/scheduler && pytest <path>` (repo `.venv` active). Backend lint: `ruff check products/scheduler`.
- `window.confirm` is BANNED — destructive actions use `useConfirmClick` (two-click arm) from `src/hooks/useConfirmClick.ts`.
- Refactors must not change behavior; if a test must change to keep passing, stop and flag it.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Ft3AEr4oDorDSeqhWqRXTG
  ```
- All frontend paths below are relative to `products/scheduler/frontend/src/`.

---

### Task 1: Shared status vocabulary in control-plane

**Files:**
- Create: `components/control-plane/matchStatus.ts`
- Modify: `components/control-plane/index.ts`
- Modify: `products/bracket/BracketMatchesTab.tsx:29-33`
- Modify: `products/bracket/BracketMatchDetailPanel.tsx:31-35`
- Modify: `products/bracket/__tests__/BracketMatchDetailPanel.test.tsx:19`
- Delete: `products/bracket/matchStatus.ts`
- Test: `components/control-plane/__tests__/matchStatus.test.ts`

**Interfaces:**
- Produces: `MatchListStatus = 'done' | 'live' | 'ready' | 'pending'`, `STATUS_LABEL`, `STATUS_CLASS`, deprecated alias `BracketMatchStatus`, all exported from the `components/control-plane` barrel. Tasks 3, 4, 6 import these.

- [ ] **Step 1: Write the failing test**

Create `components/control-plane/__tests__/matchStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  STATUS_CLASS,
  STATUS_LABEL,
  type MatchListStatus,
} from '../matchStatus';

describe('shared match status vocabulary', () => {
  it('covers exactly the four canonical states with labels and classes', () => {
    const states: MatchListStatus[] = ['done', 'live', 'ready', 'pending'];
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([...states].sort());
    expect(Object.keys(STATUS_CLASS).sort()).toEqual([...states].sort());
    expect(STATUS_LABEL.done).toBe('Done');
    expect(STATUS_LABEL.live).toBe('Live');
    expect(STATUS_LABEL.ready).toBe('Ready');
    expect(STATUS_LABEL.pending).toBe('Pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/components/control-plane/__tests__/matchStatus.test.ts`
Expected: FAIL — `Cannot find module '../matchStatus'`.

- [ ] **Step 3: Create the shared module**

Create `components/control-plane/matchStatus.ts` (content moved from `products/bracket/matchStatus.ts`, generalized name):

```ts
/**
 * Shared match-status vocabulary — the read-only Done/Live/Ready/Pending
 * projection used by BOTH match lists (Meet Matches, Bracket Matches) and
 * their detail panels. Display-only: Operations owns run-state, so nothing
 * here is interactive and nothing writes.
 */
export type MatchListStatus = 'done' | 'live' | 'ready' | 'pending';

/** @deprecated Use MatchListStatus — kept so bracket call sites read naturally during migration. */
export type BracketMatchStatus = MatchListStatus;

export const STATUS_LABEL: Record<MatchListStatus, string> = {
  done: 'Done',
  live: 'Live',
  ready: 'Ready',
  pending: 'Pending',
};

export const STATUS_CLASS: Record<MatchListStatus, string> = {
  done: 'text-status-done',
  live: 'text-status-live',
  ready: 'text-status-warning',
  pending: 'text-muted-foreground',
};
```

Add to `components/control-plane/index.ts` (after the BandedTable export block):

```ts
export {
  STATUS_CLASS,
  STATUS_LABEL,
  type BracketMatchStatus,
  type MatchListStatus,
} from './matchStatus';
```

- [ ] **Step 4: Re-point the three importers and delete the old file**

In `products/bracket/BracketMatchesTab.tsx`, replace lines 29-33:

```ts
import {
  STATUS_CLASS,
  STATUS_LABEL,
  type BracketMatchStatus,
} from '../../components/control-plane';
```

(Fold into the existing `../../components/control-plane` import block at lines 17-23 — one import statement, alphabetical members.)

In `products/bracket/BracketMatchDetailPanel.tsx`, replace lines 31-35 the same way (existing control-plane import is at line 16: `import { DetailPanel } from '../../components/control-plane';` — extend it).

In `products/bracket/__tests__/BracketMatchDetailPanel.test.tsx:19`:

```ts
import type { BracketMatchStatus } from '../../../components/control-plane';
```

Delete `products/bracket/matchStatus.ts`.

Verify no stragglers: `grep -rn "from './matchStatus'\|from '../matchStatus'" products/scheduler/frontend/src` → no hits.

- [ ] **Step 5: Run tests and lint**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/components/control-plane/__tests__/matchStatus.test.ts src/products/bracket`
Expected: PASS (new test + all bracket tests).
Run: `npm run lint:scheduler` — clean.

- [ ] **Step 6: Commit**

```bash
git add -A products/scheduler/frontend/src
git commit -m "refactor(control-plane): promote match status vocabulary to shared home"
```
(with the Global Constraints trailer)

---

### Task 2: Shared column spec + row density pass

**Files:**
- Create: `components/control-plane/matchListColumns.ts`
- Modify: `components/control-plane/BandedList.tsx:32-33`
- Modify: `components/control-plane/index.ts`
- Modify: `products/bracket/BracketMatchesTab.tsx:41-55` (columns) and `:249-283` (renderRow)
- Test: `components/control-plane/__tests__/matchListColumns.test.ts`

**Interfaces:**
- Consumes: `BandedListColumn` from `./BandedList`.
- Produces: `MATCH_LIST_COLUMNS: BandedListColumn[]` — 7 columns: gutter `w-4`, `#` `w-8`, Event `w-20`, Side A `min-w-0 flex-[3]`, Side B `min-w-0 flex-[3]`, Status `w-[5.5rem] text-right`, action gutter `w-8`. Tasks 3 and 7 rely on this exact shape.

- [ ] **Step 1: Write the failing test**

Create `components/control-plane/__tests__/matchListColumns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MATCH_LIST_COLUMNS } from '../matchListColumns';

describe('MATCH_LIST_COLUMNS — the one column geometry both match lists share', () => {
  it('has the unified 7-column anatomy in order', () => {
    expect(MATCH_LIST_COLUMNS.map((c) => c.label)).toEqual([
      '', '#', 'Event', 'Side A', 'Side B', 'Status', '',
    ]);
    expect(MATCH_LIST_COLUMNS.map((c) => c.className)).toEqual([
      'w-4',
      'w-8',
      'w-20',
      'min-w-0 flex-[3]',
      'min-w-0 flex-[3]',
      'w-[5.5rem] text-right',
      'w-8',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/components/control-plane/__tests__/matchListColumns.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the spec and export it**

Create `components/control-plane/matchListColumns.ts`:

```ts
/**
 * MATCH_LIST_COLUMNS — the single column geometry shared by Meet Matches
 * and Bracket Matches. Anatomy: warning-icon gutter (Meet) / spacer
 * (Bracket) · per-group `#` · event code · two flex-[3] sides · Status ·
 * trailing action gutter (Meet: delete button, Bracket: contingency menu).
 * One spec so the two surfaces cannot drift; the parity test pins usage.
 */
import type { BandedListColumn } from './BandedList';

export const MATCH_LIST_COLUMNS: BandedListColumn[] = [
  { label: '', className: 'w-4' },
  { label: '#', className: 'w-8' },
  { label: 'Event', className: 'w-20' },
  { label: 'Side A', className: 'min-w-0 flex-[3]' },
  { label: 'Side B', className: 'min-w-0 flex-[3]' },
  { label: 'Status', className: 'w-[5.5rem] text-right' },
  { label: '', className: 'w-8' },
];
```

Add to `components/control-plane/index.ts`:

```ts
export { MATCH_LIST_COLUMNS } from './matchListColumns';
```

- [ ] **Step 4: Density pass on the shared row shell**

In `components/control-plane/BandedList.tsx:32-33`, tighten the canonical row (40px → 32px min-height; keep everything else — `px-5`, `gap-3`, hover wash — identical so the change is pure density):

```ts
export const BANDED_ROW_CLASSES =
  'flex min-h-[32px] items-center gap-3 border-b border-border px-5 transition-colors duration-fast ease-brand hover:bg-muted/30';
```

Update the doc comment above it (`min-h-[40px]` → `min-h-[32px]`).

- [ ] **Step 5: Bracket adopts the shared spec + trailing gutter**

In `products/bracket/BracketMatchesTab.tsx`:

1. Delete the local `MATCH_COLUMNS` constant (lines 41-55) and its `BandedListColumn` import member; import instead:

```ts
import {
  ActionsBar,
  BandedTable,
  EmptyState,
  MATCH_LIST_COLUMNS,
  STATUS_CLASS,
  STATUS_LABEL,
  type BandedTableGroup,
  type BracketMatchStatus,
} from '../../components/control-plane';
```

2. Change `columns={MATCH_COLUMNS}` (line 243) to `columns={MATCH_LIST_COLUMNS}`.

3. In `renderRow`, after the Status span (line 280), add the trailing action-gutter spacer (Task 6 fills it with the contingency menu):

```tsx
<span className="w-8 shrink-0" aria-hidden />
```

- [ ] **Step 6: Run tests, check for pinned row-height assertions**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/components/control-plane src/products/bracket`
Expected: PASS. If `BandedTable.test.tsx` or any test pins `min-h-[40px]`, STOP and flag per Global Constraints (do not silently edit a behavioral assertion) — a class-string constant assertion is presentation, and updating `40` → `32` there is acceptable ONLY if the test's stated purpose is "row shells share the canonical class string" (it is — then update it); anything else, flag.

- [ ] **Step 7: Commit**

```bash
git add -A products/scheduler/frontend/src
git commit -m "feat(control-plane): shared MATCH_LIST_COLUMNS spec + compact banded rows; bracket adopts"
```

---

### Task 3: Meet gains Status column, code chips, and detail-panel pill

**Files:**
- Create: `products/meet/matches/meetMatchStatus.ts`
- Modify: `products/meet/matches/MatchesSpreadsheet.tsx` (columns `:49-56`, groups `:180-188`, `MatchRow` `:262-418`, wiring `:63-248`)
- Modify: `products/meet/matches/MatchDetailPanel.tsx:27-64`
- Test: `products/meet/matches/__tests__/meetMatchStatus.test.ts`

**Interfaces:**
- Consumes: `MatchListStatus`, `STATUS_LABEL`, `STATUS_CLASS`, `MATCH_LIST_COLUMNS` from `../../../components/control-plane`; `useMatchStateStore` from `../../../store/matchStateStore`; `MatchStateDTO`, `ScheduleAssignment` from `../../../api/dto`.
- Produces: `meetMatchStatus(matchId: string, assignedIds: ReadonlySet<string>, matchStates: Record<string, MatchStateDTO>): MatchListStatus`. `MatchDetailPanel` gains optional prop `status?: MatchListStatus`.

- [ ] **Step 1: Write the failing test**

Create `products/meet/matches/__tests__/meetMatchStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MatchStateDTO } from '../../../../api/dto';
import { meetMatchStatus } from '../meetMatchStatus';

const state = (status: MatchStateDTO['status']): Record<string, MatchStateDTO> => ({
  m1: { matchId: 'm1', status },
});

describe('meetMatchStatus — same 4-state vocabulary as bracket', () => {
  it('is pending with no assignment and no state', () => {
    expect(meetMatchStatus('m1', new Set(), {})).toBe('pending');
  });
  it('is ready when scheduled (assignment exists)', () => {
    expect(meetMatchStatus('m1', new Set(['m1']), {})).toBe('ready');
  });
  it('stays ready while the match state is only scheduled', () => {
    expect(meetMatchStatus('m1', new Set(['m1']), state('scheduled'))).toBe('ready');
  });
  it('is live once Operations calls or starts it', () => {
    expect(meetMatchStatus('m1', new Set(['m1']), state('called'))).toBe('live');
    expect(meetMatchStatus('m1', new Set(['m1']), state('started'))).toBe('live');
  });
  it('is done when finished — even if the assignment is gone', () => {
    expect(meetMatchStatus('m1', new Set(['m1']), state('finished'))).toBe('done');
    expect(meetMatchStatus('m1', new Set(), state('finished'))).toBe('done');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/meet/matches/__tests__/meetMatchStatus.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the derivation**

Create `products/meet/matches/meetMatchStatus.ts`:

```ts
/**
 * Meet-side status derivation for the shared Done/Live/Ready/Pending
 * match-list vocabulary. Mirrors bracket's `statusOf`: results/run-state
 * win over the schedule, an assignment means Ready, nothing means Pending.
 * Operations owns run-state — this is a read-only projection.
 */
import type { MatchStateDTO } from '../../../api/dto';
import type { MatchListStatus } from '../../../components/control-plane';

export function meetMatchStatus(
  matchId: string,
  assignedIds: ReadonlySet<string>,
  matchStates: Record<string, MatchStateDTO>,
): MatchListStatus {
  const status = matchStates[matchId]?.status;
  if (status === 'finished') return 'done';
  if (status === 'called' || status === 'started') return 'live';
  if (assignedIds.has(matchId)) return 'ready';
  return 'pending';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/meet/matches/__tests__/meetMatchStatus.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the Status column, shared columns, and code chips into MatchesSpreadsheet**

In `products/meet/matches/MatchesSpreadsheet.tsx`:

1. Delete the local `MATCH_COLUMNS` (lines 46-56). Extend the control-plane import (lines 18-23):

```ts
import {
  BandedTable,
  ColumnHeaderRow,
  MATCH_LIST_COLUMNS,
  STATUS_CLASS,
  STATUS_LABEL,
  type BandedTableGroup,
} from '../../../components/control-plane';
```

Replace both usages: `columns={MATCH_COLUMNS}` → `columns={MATCH_LIST_COLUMNS}` (line 213) and `<ColumnHeaderRow columns={MATCH_COLUMNS} />` → `<ColumnHeaderRow columns={MATCH_LIST_COLUMNS} />` (line 206).

2. Status inputs — inside `MatchesSpreadsheet` after the existing store reads (line 79):

```ts
const schedule = useTournamentStore((s) => s.schedule);
const matchStates = useMatchStateStore((s) => s.matchStates);
const assignedIds = useMemo(
  () => new Set((schedule?.assignments ?? []).map((a) => a.matchId)),
  [schedule],
);
```

with `import { useMatchStateStore } from '../../../store/matchStateStore';` and `import { meetMatchStatus } from './meetMatchStatus';` added.

3. Code chips — in the `tableGroups` mapping (lines 180-188), add `code`:

```ts
const tableGroups: BandedTableGroup<MatchDTO>[] = orderedKeys.map((key) => {
  const label = key === '—' ? 'Unassigned' : EVENT_LABEL[key]?.full ?? key;
  return {
    key,
    label,
    code: key === '—' ? undefined : key,
    items: groupsByPrefix.get(key)!,
    testId: `match-group-${label}`,
  };
});
```

4. Pass status into each row — in the `renderRow` callback (line 223):

```tsx
renderRow={(m) => (
  <MatchRow
    match={m}
    index={matches.indexOf(m)}
    status={meetMatchStatus(m.id, assignedIds, matchStates)}
    players={players}
    /* …existing props unchanged… */
  />
)}
```

5. `MatchRow` — add to its props type `status: MatchListStatus;` (import the type), and render the Status cell between the second `PlayerCellEditor` (line 407) and `ConfirmDeleteButton` (line 410), matching Bracket's cell exactly (`BracketMatchesTab.tsx:276-280`):

```tsx
<span
  data-testid={`match-status-${match.id}`}
  className={`w-[5.5rem] text-right text-2xs font-semibold uppercase tracking-[0.08em] ${STATUS_CLASS[status]}`}
>
  {STATUS_LABEL[status]}
</span>
```

`ConfirmDeleteButton` keeps `className="w-8"` — it is now the trailing action gutter, same slot as Bracket's menu. `status` is a string prop, so the `memo` on `MatchRow` still works (re-renders only on real status change).

6. Detail panel pill — in `MatchDetailPanel.tsx`, add optional prop and pill (mirroring `BracketMatchDetailPanel.tsx:88-97`):

```tsx
import {
  DetailPanel,
  STATUS_CLASS,
  STATUS_LABEL,
  type MatchListStatus,
} from '../../../components/control-plane';
```

Props: `{ match, status, onClose }: { match: MatchDTO; status?: MatchListStatus; onClose: () => void }`. After the second `SideSection` (line 61), inside the same flex column:

```tsx
{status ? (
  <div className="flex flex-col gap-1">
    <span className={FIELD_LABEL_CLASSES}>Status</span>
    {/* Read-only pill — Operations owns run-state; never interactive. */}
    <span
      data-testid="match-status-pill"
      className={`inline-flex w-fit items-center rounded-sm border border-border bg-card px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  </div>
) : null}
```

And at the call site in `MatchesSpreadsheet.tsx:240-246`:

```tsx
<MatchDetailPanel
  key={selectedMatch.id}
  match={selectedMatch}
  status={meetMatchStatus(selectedMatch.id, assignedIds, matchStates)}
  onClose={() => setSelectedId(null)}
/>
```

- [ ] **Step 6: Run the meet suites**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/meet`
Expected: PASS. If any spreadsheet test pins the old 6-column header, apply the Task 2 Step 6 rule (presentation-constant update OK, behavioral change → flag).

- [ ] **Step 7: Commit**

```bash
git add -A products/scheduler/frontend/src
git commit -m "feat(meet): status column + event code chips + detail-panel pill — match-list parity with bracket"
```

---

### Task 4: Bracket search becomes URL-backed `?q=`

**Files:**
- Modify: `products/bracket/BracketMatchesTab.tsx:13,68,211-219`

**Interfaces:**
- Consumes: `useSearchParamState(key: string, initial?: string): [string, (next: string) => void]` from `../../hooks/useSearchParamState` (debounced URL writes built in).

- [ ] **Step 1: Swap local state for the URL param**

In `BracketMatchesTab.tsx` replace line 68:

```ts
const [query, setQuery] = useState('');
```

with:

```ts
// Same URL-backed `?q=` contract as Meet Matches — the URL is the shared
// source of truth, so a pasted link restores the operator's filter.
const [query, setQuery] = useSearchParamState('q', '');
```

Add `import { useSearchParamState } from '../../hooks/useSearchParamState';` and drop `useState` from the react import if now unused (`selectedId` still uses it — keep).

- [ ] **Step 2: Run bracket tests**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket`
Expected: PASS. (If a test renders `BracketMatchesTab` without a router and now throws from `useSearchParams`, wrap that test's render in `MemoryRouter` — the meet spreadsheet tests show the pattern.)

- [ ] **Step 3: Commit**

```bash
git add -A products/scheduler/frontend/src
git commit -m "feat(bracket): URL-backed ?q= match search — parity with meet"
```

---

### Task 5: Backend — `reason` on the record_result bracket command

**Files:**
- Modify: `products/scheduler/backend/app/schemas.py:624-646` (`BracketCommandRequest`)
- Test: `products/scheduler/tests/unit/test_bracket_command_reason.py` (create; if an existing bracket-commands test file already covers `POST /bracket/commands`, add these cases there instead and skip the new file)

**Interfaces:**
- Produces: `BracketCommandRequest.reason: Optional[Literal["walkover", "retired", "forfeit"]] = None`, with a validator forcing `walkover=True` when `reason == "walkover"`. Task 6's frontend sends this field. Distinct routing semantics for `retired`/`forfeit` (vs plain walkover BYE policy) are NOT implemented — Task 7 logs the debt.

- [ ] **Step 1: Write the failing test**

Create `products/scheduler/tests/unit/test_bracket_command_reason.py`:

```python
"""The record_result bracket command accepts a contingency `reason`.

Contract-only for now (spec 2026-07-14 §1): walkover routing already
exists; `retired` / `forfeit` ride the same result path and their
distinct routing semantics are deferred (debt-log). The model must
(a) accept the three reasons, (b) reject unknown ones, and
(c) normalize reason=="walkover" to walkover=True so the two fields
can't contradict.
"""
import uuid

import pytest
from pydantic import ValidationError

from app.schemas import BracketCommandRequest


def _body(**overrides):
    base = {
        "id": str(uuid.uuid4()),
        "kind": "record_result",
        "play_unit_id": "pu1",
        "winner_side": "A",
    }
    base.update(overrides)
    return base


@pytest.mark.parametrize("reason", ["walkover", "retired", "forfeit"])
def test_reason_accepted(reason):
    cmd = BracketCommandRequest(**_body(reason=reason))
    assert cmd.reason == reason


def test_reason_defaults_to_none():
    assert BracketCommandRequest(**_body()).reason is None


def test_unknown_reason_rejected():
    with pytest.raises(ValidationError):
        BracketCommandRequest(**_body(reason="rage_quit"))


def test_walkover_reason_forces_walkover_flag():
    cmd = BracketCommandRequest(**_body(reason="walkover", walkover=False))
    assert cmd.walkover is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/unit/test_bracket_command_reason.py -v`
Expected: FAIL — `reason` not a field (first tests error), validator missing.

- [ ] **Step 3: Extend the model**

In `products/scheduler/backend/app/schemas.py`, inside `BracketCommandRequest` (after `score`, line 646), add the field and validator (the file already imports `Optional`, `Literal`; add `model_validator` to the existing `pydantic` import if absent):

```python
    # Contingency annotation (spec 2026-07-14 §1): why the result was
    # awarded without (full) play. ``walkover`` keeps its existing BYE
    # routing; ``retired``/``forfeit`` currently ride the same result
    # path — distinct routing semantics are deferred (debt-log).
    reason: Optional[Literal["walkover", "retired", "forfeit"]] = None

    @model_validator(mode="after")
    def _walkover_reason_implies_flag(self) -> "BracketCommandRequest":
        if self.reason == "walkover":
            self.walkover = True
        return self
```

Also extend the class docstring's field notes with one line: `reason annotates contingency results (walkover/retired/forfeit).`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd products/scheduler && pytest tests/unit/test_bracket_command_reason.py -v`
Expected: 6 PASS.
Then the wider guard: `cd products/scheduler && pytest -k "bracket and command" -q` and `ruff check products/scheduler`
Expected: PASS / clean. (Pydantic ignores no fields here — the command handler consumes the validated model, so no route change is needed; `reason` rides into the idempotency payload wherever the handler persists `model_dump()`.)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/app/schemas.py products/scheduler/tests/unit/test_bracket_command_reason.py
git commit -m "feat(bracket-api): record_result command accepts contingency reason (walkover|retired|forfeit)"
```

---

### Task 6: Bracket contingency UI — row menu + detail-panel actions via the command path

**Files:**
- Modify: `products/scheduler/frontend/src/api/client.ts:1321-1338` (`recordBracketResultCommand` body type)
- Modify: `products/scheduler/frontend/src/api/bracketClient.tsx:56-68` (interface) and `:134-135` (impl)
- Modify: `products/bracket/BracketMatchesTab.tsx` (menu in the action gutter, contingency state)
- Modify: `products/bracket/BracketMatchDetailPanel.tsx` (Contingency section)
- Test: `products/bracket/__tests__/bracketContingency.test.tsx`

**Interfaces:**
- Consumes: Task 5's `reason` field; `OverflowMenu`/`OverflowItem` from `../../components/control-plane`; `useConfirmClick` from `../../hooks/useConfirmClick`; `apiClient.recordBracketResultCommand` + `apiClient.getBracket`.
- Produces: `BracketApi.recordResultCommand(body: { play_unit_id: string; winner_side: 'A' | 'B'; reason: ContingencyReason; seen_version?: number }): Promise<BracketTournamentDTO>`; `type ContingencyReason = 'walkover' | 'retired' | 'forfeit'` exported from `BracketMatchDetailPanel.tsx`.

- [ ] **Step 1: Write the failing test**

Create `products/bracket/__tests__/bracketContingency.test.tsx`. Model the render setup (providers, fixture DTO) on the existing `products/bracket/__tests__/BracketMatchesTab.test.tsx` if present — otherwise on `BracketMatchDetailPanel.test.tsx`'s fixtures. The behavioral assertions:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BracketMatchDetailPanel,
  type ContingencyReason,
} from '../BracketMatchDetailPanel';
// …reuse the DTO fixture helpers from BracketMatchDetailPanel.test.tsx
// (pu with resolved side_a/side_b, data with two participants) verbatim…

describe('bracket contingency actions', () => {
  it('renders the three contingency choices for a non-done match', () => {
    render(panelWith({ status: 'ready', onRecordContingency: vi.fn() }));
    expect(screen.getByTestId('contingency-walkover')).toBeInTheDocument();
    expect(screen.getByTestId('contingency-retired')).toBeInTheDocument();
    expect(screen.getByTestId('contingency-forfeit')).toBeInTheDocument();
  });

  it('hides contingency entirely for a done match', () => {
    render(panelWith({ status: 'done', onRecordContingency: vi.fn() }));
    expect(screen.queryByTestId('contingency-walkover')).toBeNull();
  });

  it('two-click arms, then records with kind + winner', () => {
    const onRecord = vi.fn();
    render(panelWith({ status: 'ready', onRecordContingency: onRecord }));
    fireEvent.click(screen.getByTestId('contingency-walkover'));
    const advanceA = screen.getByTestId('contingency-advance-A');
    fireEvent.click(advanceA);            // arm
    expect(onRecord).not.toHaveBeenCalled();
    fireEvent.click(advanceA);            // confirm
    expect(onRecord).toHaveBeenCalledWith('walkover' satisfies ContingencyReason, 'A');
  });
});
```

(`panelWith` is a local helper rendering `BracketMatchDetailPanel` with the reused fixtures plus the given props.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket/__tests__/bracketContingency.test.tsx`
Expected: FAIL — no `ContingencyReason` export, no testids.

- [ ] **Step 3: API plumbing**

`api/client.ts` — extend `recordBracketResultCommand`'s body type (line 1323-1331) with:

```ts
      reason?: 'walkover' | 'retired' | 'forfeit';
```

`api/bracketClient.tsx` — add to the `BracketApi` interface after `matchAction` (line 68):

```ts
  /** Contingency result (walkover / retired / forfeit) through the
   *  idempotent command path — never the legacy /bracket/results route. */
  recordResultCommand: (body: {
    play_unit_id: string;
    winner_side: 'A' | 'B';
    reason: 'walkover' | 'retired' | 'forfeit';
    seen_version?: number;
  }) => Promise<BracketTournamentDTO>;
```

and to the provider `value` after `matchAction` (line 135):

```ts
      recordResultCommand: guardMutation(async (body) => {
        await apiClient.recordBracketResultCommand(tournamentId, {
          id: crypto.randomUUID(),
          walkover: body.reason === 'walkover',
          ...body,
        });
        const next = await apiClient.getBracket(tournamentId);
        if (!next) throw new Error('Bracket not found after recording result');
        return next;
      }),
```

- [ ] **Step 4: Detail-panel Contingency section**

In `products/bracket/BracketMatchDetailPanel.tsx`:

```ts
export type ContingencyReason = 'walkover' | 'retired' | 'forfeit';

const CONTINGENCY_LABEL: Record<ContingencyReason, string> = {
  walkover: 'Walkover',
  retired: 'Retired (injury)',
  forfeit: 'Forfeit',
};
```

New props on `BracketMatchDetailPanel`:

```ts
  /** Pre-select a contingency kind (row menu deep-link). */
  initialContingency?: ContingencyReason | null;
  /** Record a contingency result; absent → section hidden (e.g. viewer). */
  onRecordContingency?: ((reason: ContingencyReason, winner: 'A' | 'B') => void) | null;
```

Render after the Status block (line 97), only when actionable:

```tsx
{onRecordContingency && status !== 'done' ? (
  <ContingencySection
    sideALabel={sideLabel(pu.side_a, pu.slot_a, {}, labelById)}
    sideBLabel={sideLabel(pu.side_b, pu.slot_b, {}, labelById)}
    initial={initialContingency ?? null}
    onRecord={onRecordContingency}
  />
) : null}
```

And the section component in the same file:

```tsx
function ContingencySection({
  sideALabel,
  sideBLabel,
  initial,
  onRecord,
}: {
  sideALabel: string;
  sideBLabel: string;
  initial: ContingencyReason | null;
  onRecord: (reason: ContingencyReason, winner: 'A' | 'B') => void;
}) {
  const [reason, setReason] = useState<ContingencyReason | null>(initial);
  // Two-click arm per side — window.confirm is banned (audit E1/F1).
  const confirmA = useConfirmClick(() => reason && onRecord(reason, 'A'));
  const confirmB = useConfirmClick(() => reason && onRecord(reason, 'B'));

  return (
    <div className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASSES}>Contingency</span>
      <div className="flex gap-1">
        {(['walkover', 'retired', 'forfeit'] as const).map((r) => (
          <button
            key={r}
            type="button"
            data-testid={`contingency-${r}`}
            aria-pressed={reason === r}
            onClick={() => {
              setReason(r);
              confirmA.reset();
              confirmB.reset();
            }}
            className={[
              'rounded-sm border px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em]',
              'transition-colors duration-fast ease-brand',
              reason === r
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {CONTINGENCY_LABEL[r]}
          </button>
        ))}
      </div>
      {reason ? (
        <div className="flex gap-1.5">
          {([['A', sideALabel, confirmA], ['B', sideBLabel, confirmB]] as const).map(
            ([side, label, confirm]) => (
              <button
                key={side}
                type="button"
                data-testid={`contingency-advance-${side}`}
                onClick={confirm.press}
                className={[
                  'flex-1 rounded-sm border px-2 py-1 text-xs',
                  'transition-colors duration-fast ease-brand',
                  confirm.armed
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-border text-foreground hover:bg-muted/40',
                ].join(' ')}
              >
                {confirm.armed
                  ? `Confirm — ${label} advances`
                  : `${label} advances`}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
```

Add `useConfirmClick` import: `import { useConfirmClick } from '../../hooks/useConfirmClick';`.

- [ ] **Step 5: Row menu + host wiring in BracketMatchesTab**

In `products/bracket/BracketMatchesTab.tsx`:

1. Imports: add `OverflowMenu` to the control-plane import; `import { type ContingencyReason } from './BracketMatchDetailPanel';` (extend the existing `BracketMatchDetailPanel` import).

2. State next to `selectedId` (line 69):

```ts
const [contingency, setContingency] = useState<ContingencyReason | null>(null);
```

3. Replace Task 2's trailing spacer in `renderRow` with the menu (hidden once done — nothing to award):

```tsx
<span
  className="flex w-8 shrink-0 items-center justify-center"
  onClick={(e) => e.stopPropagation()}
>
  {status !== 'done' ? (
    <OverflowMenu
      label={`Contingency for ${labelById.get(pu.id) ?? pu.id}`}
      items={(['walkover', 'retired', 'forfeit'] as const).map((r) => ({
        key: r,
        label: { walkover: 'Walkover…', retired: 'Retired (injury)…', forfeit: 'Forfeit…' }[r],
        onSelect: () => {
          setSelectedId(pu.id);
          setContingency(r);
        },
      }))}
    />
  ) : null}
</span>
```

4. Detail-panel call site (lines 294-305) gains:

```tsx
initialContingency={contingency}
onRecordContingency={async (reason, winner) => {
  const next = await api.recordResultCommand({
    play_unit_id: selected.id,
    winner_side: winner,
    reason,
    seen_version: selected.version,
  });
  onData?.(next);
  setContingency(null);
}}
```

and `onClose` becomes `() => { setSelectedId(null); setContingency(null); }`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/products/bracket src/api`
Expected: PASS, including the new contingency test and the bracketClient permission tests (verify `recordResultCommand` is covered by the guardMutation table test in `api/__tests__/bracketClient.permissions.test.tsx:63` — add a row for it, mirroring the `recordResult` row).

- [ ] **Step 7: Commit**

```bash
git add -A products/scheduler/frontend/src
git commit -m "feat(bracket): contingency actions (walkover/retired/forfeit) via the command path"
```

---

### Task 7: Parity pin, debt-log entry, full gates

**Files:**
- Create: `components/control-plane/__tests__/matchListParity.test.ts`
- Modify: `docs/audits/debt-log.md` (append)

**Interfaces:**
- Consumes: Tasks 1-6 landed. Produces: the drift guard the spec requires.

- [ ] **Step 1: Write the parity test (fails until it's green by construction)**

Create `components/control-plane/__tests__/matchListParity.test.ts`:

```ts
/**
 * Drift guard (spec 2026-07-14 §1): both match lists MUST consume the
 * shared column spec and shared status vocabulary — no local copies.
 * Source-scan style, same approach as the module-contract tests: the
 * cheapest honest way to pin "imports the shared thing, defines no rival".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

const SURFACES = [
  'products/meet/matches/MatchesSpreadsheet.tsx',
  'products/bracket/BracketMatchesTab.tsx',
];

describe('match-list parity', () => {
  for (const rel of SURFACES) {
    it(`${rel} uses the shared column spec and status vocabulary`, () => {
      const src = read(rel);
      expect(src).toContain('MATCH_LIST_COLUMNS');
      expect(src).not.toMatch(/const MATCH_COLUMNS/);
      expect(src).toContain('STATUS_LABEL');
      // No resurrected local vocabulary:
      expect(src).not.toMatch(/from '\.\/matchStatus'/);
    });
  }

  it('the old bracket-local vocabulary file is gone', () => {
    expect(() => read('products/bracket/matchStatus.ts')).toThrow();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm --prefix products/scheduler/frontend run test:run -- src/components/control-plane/__tests__/matchListParity.test.ts`
Expected: PASS (Tasks 1-6 made it true). If it fails, a task step was skipped — fix that task, not this test.

- [ ] **Step 3: Debt-log the deferred routing semantics**

Append to `docs/audits/debt-log.md` (follow the file's existing entry format — date, area, description, pointer):

```markdown
- **2026-07-14 · bracket/contingency** — `record_result` commands now carry
  `reason: walkover|retired|forfeit`, but retired/forfeit ride the plain
  result path: no distinct loser-routing (e.g. injured player withdrawing
  from OTHER draws, forfeit-specific BYE policy in consolation feeds).
  Contract + UI shipped (spec 2026-07-14 §1); routing semantics deferred.
  Entry points: `app/schemas.py BracketCommandRequest.reason`,
  `BracketMatchDetailPanel.ContingencySection`.
```

- [ ] **Step 4: Full gates**

Run: `npm --prefix products/scheduler/frontend run test:run` — all frontend tests PASS.
Run: `npm run lint:scheduler` and `npm run depcruise` — clean (shared imports flow products → components, allowed direction).
Run: `cd products/scheduler && pytest` — all backend tests PASS.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/frontend/src/components/control-plane/__tests__/matchListParity.test.ts docs/audits/debt-log.md
git commit -m "test(parity): pin shared match-list columns + status vocabulary; log deferred contingency routing"
```
