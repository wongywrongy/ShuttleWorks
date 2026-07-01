> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Bracket Sibling Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bracket mode a first-class sibling of meet mode, with behavior-preserving UI polish first and test-first backend hardening second.

**Architecture:** Work in reviewable slices. First create an audit map that names the exact bracket UI/backend gaps against meet patterns. Then add small shared bracket UI primitives and apply them view-by-view without changing actions or data flow. Finally, add failing backend tests for confirmed bracket reliability gaps and fix only those gaps.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind, Zustand, `@scheduler/design-system`, Vitest/RTL, FastAPI, SQLAlchemy, pytest.

---

## File Structure

Planned files and responsibilities:

- Create `docs/audits/2026-06-10_bracket-sibling-parity-map.md` — records the meet-reference patterns, bracket-specific differences to preserve, and confirmed parity gaps.
- Modify `products/scheduler/frontend/src/features/bracket/BracketTab.tsx` — only if audit confirms the top-level empty/error layout needs a sibling-mode wrapper.
- Create `products/scheduler/frontend/src/features/bracket/BracketEmptyState.tsx` — one focused component for bracket empty states.
- Create `products/scheduler/frontend/src/features/bracket/BracketInlineNotice.tsx` — one focused component for loading/error/info notices that match meet tone.
- Modify `products/scheduler/frontend/src/features/bracket/EventsTab.tsx` — polish Events layout, empty state, and action hierarchy without changing API calls.
- Modify `products/scheduler/frontend/src/features/bracket/DrawView.tsx` — polish no-draw and selected-event states without changing draw behavior.
- Modify `products/scheduler/frontend/src/features/bracket/ScheduleView.tsx`, `BracketScheduleHeader.tsx`, `BracketMatchesTable.tsx`, `BracketScheduleSidebar.tsx` — polish schedule hierarchy and empty/loading/error states without changing scheduling behavior.
- Modify `products/scheduler/frontend/src/features/bracket/LiveView.tsx`, `MatchDetailPanel.tsx` — polish live empty/status states without changing start/finish/reset/result behavior.
- Add/modify tests under `products/scheduler/frontend/src/lib/__tests__/` for every changed bracket component.
- Modify backend tests under `products/scheduler/tests/unit/test_bracket_routes.py`, `test_bracket_event_routes.py`, and `test_bracket_interactive_scheduling.py` only after the audit identifies concrete bugs.
- Modify `products/scheduler/backend/api/brackets.py` and/or `products/scheduler/backend/repositories/local.py` only to fix failing backend tests.

---

### Task 1: Confirm Baseline and Write Parity Map

**Files:**
- Create: `docs/audits/2026-06-10_bracket-sibling-parity-map.md`
- Read-only reference: `products/scheduler/frontend/src/features/roster/RosterTab.tsx`
- Read-only reference: `products/scheduler/frontend/src/features/matches/MatchesTab.tsx`
- Read-only reference: `products/scheduler/frontend/src/pages/SchedulePage.tsx`
- Read-only reference: `products/scheduler/frontend/src/pages/MatchControlCenterPage.tsx`
- Read-only reference: `products/scheduler/frontend/src/features/bracket/*.tsx`

- [ ] **Step 1: Run baseline status and note unrelated dirty files**

Run:

```bash
git status --short --branch
```

Expected: branch is `feat/bracket-sibling-parity-spec`; unrelated dirty files may include `packages/design-system/components/Toast.tsx`, `.superpowers/`, and `products/scheduler/uv.lock`. Do not stage or edit those unless the user explicitly asks.

- [ ] **Step 2: Run existing focused frontend tests**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/BracketTab.test.tsx src/lib/__tests__/EventsTab.test.tsx src/lib/__tests__/LiveView.test.tsx src/lib/__tests__/ScheduleView.test.tsx --run
```

Expected: PASS. If tests fail before edits, record the failure in the audit map and ask whether to investigate before continuing.

- [ ] **Step 3: Run existing focused backend bracket tests**

Run:

```bash
cd products/scheduler
pytest tests/unit/test_bracket_routes.py tests/unit/test_bracket_event_routes.py tests/unit/test_bracket_interactive_scheduling.py -q
```

Expected: PASS. If tests fail before edits, record the failure in the audit map and ask whether to investigate before continuing.

- [ ] **Step 4: Create the audit map**

Create `docs/audits/2026-06-10_bracket-sibling-parity-map.md` with this content:

```markdown
# Bracket sibling parity map

**Date:** 2026-06-10
**Branch:** `feat/bracket-sibling-parity-spec`
**Reference spec:** `docs/superpowers/specs/2026-06-10-bracket-sibling-parity-design.md`

## Meet patterns to reuse

- View headers use compact context, action clusters, and clear status language.
- Empty states explain the next operator action without adding new workflow steps.
- Error states are inline and recoverable where possible.
- Primary actions sit near the state they affect.
- Destructive or reset actions are visually quieter than creation/scheduling actions.
- Dense data views rely on lines, spacing, and typography rather than nested cards.

## Bracket differences to preserve

- Bracket remains event/draw-first, not a renamed meet schedule.
- Events and Draw stay first-class workflow concepts.
- Schedule and Live can borrow more heavily from meet because they are operational phases.
- Existing bracket API calls, route shapes, and user actions remain unchanged during the UI pass.

## Confirmed UI gaps

| Area | Current issue | Target pattern | Files |
| --- | --- | --- | --- |
| Events | Table starts cold and the add action sits after the table, so an empty event list has weak direction | Meet-like dense table with a composed empty state and a primary add action near the header | `EventsTab.tsx` |
| Draw | No-draw state is informational but not visually aligned with meet empty states | Draw-aware empty state that explains the Events dependency without adding a new action path | `DrawView.tsx` |
| Schedule | Schedule view has useful pieces but weaker hierarchy between schedule controls, table, and side detail | Operational schedule hierarchy with clear header, timeline/table relationship, and side detail weight | `ScheduleView.tsx`, `BracketScheduleHeader.tsx`, `BracketMatchesTable.tsx`, `BracketScheduleSidebar.tsx` |
| Live | No-scheduled-match state is plain text and does not match meet's live-operation confidence | Status-forward live empty state and clearer result/action panel hierarchy | `LiveView.tsx`, `MatchDetailPanel.tsx` |

## Confirmed backend gaps

| Route or behavior | Current issue | Expected meet-style guarantee | Test file |
| --- | --- | --- | --- |
| Result replay | Duplicate result submission needs explicit regression coverage | Same winner replay is safe or rejected without duplicate/corrupt state; different winner is rejected | `tests/unit/test_bracket_routes.py` |
| Match action transitions | Finish-before-start needs explicit regression coverage | Illegal live-state transitions return conflict and do not mutate assignment state | `tests/unit/test_bracket_routes.py` |

## Out of scope for this pass

- New bracket capabilities.
- Meet redesign.
- Full frontend commandQueue migration.
- Cloud-scale or multi-worker redesign.
```

- [ ] **Step 5: Refine the initial audit findings**

Read the referenced meet and bracket files. Keep the provided findings, tighten them with file-specific evidence, or remove a row if current code already satisfies it. The finished audit file must contain no unfinished marker text.

Run:

```bash
rg -n "T[B]D|T[O]DO|F[I]XME" docs/audits/2026-06-10_bracket-sibling-parity-map.md
```

Expected: no matches.

- [ ] **Step 6: Commit the audit map**

Run:

```bash
git add docs/audits/2026-06-10_bracket-sibling-parity-map.md
git commit -m "docs: map bracket sibling parity gaps"
```

Expected: commit succeeds and stages only the audit map.

---

### Task 2: Add Shared Bracket UI Primitives

**Files:**
- Create: `products/scheduler/frontend/src/features/bracket/BracketEmptyState.tsx`
- Create: `products/scheduler/frontend/src/features/bracket/BracketInlineNotice.tsx`
- Test: `products/scheduler/frontend/src/lib/__tests__/BracketEmptyState.test.tsx`
- Test: `products/scheduler/frontend/src/lib/__tests__/BracketInlineNotice.test.tsx`

- [ ] **Step 1: Write failing tests for empty state and notice primitives**

Create `products/scheduler/frontend/src/lib/__tests__/BracketEmptyState.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BracketEmptyState } from '../../features/bracket/BracketEmptyState';

describe('BracketEmptyState', () => {
  it('renders title, body, and primary action when provided', () => {
    render(
      <BracketEmptyState
        eyebrow="Draw"
        title="No draws generated"
        body="Add participants and generate an event before opening the draw."
        actionLabel="Go to Events"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText('Draw')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No draws generated' })).toBeInTheDocument();
    expect(screen.getByText('Add participants and generate an event before opening the draw.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Events' })).toBeInTheDocument();
  });

  it('omits the action button when no action is provided', () => {
    render(
      <BracketEmptyState
        eyebrow="Live"
        title="No live matches"
        body="Scheduled matches will appear here when play begins."
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

Create `products/scheduler/frontend/src/lib/__tests__/BracketInlineNotice.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BracketInlineNotice } from '../../features/bracket/BracketInlineNotice';

describe('BracketInlineNotice', () => {
  it('renders an error notice with alert semantics', () => {
    render(
      <BracketInlineNotice
        tone="error"
        title="Bracket failed to load"
        message="Refresh the bracket or check the connection."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Bracket failed to load');
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh the bracket or check the connection.');
  });

  it('renders info notice without alert semantics', () => {
    render(
      <BracketInlineNotice
        tone="info"
        title="Waiting for a draw"
        message="Generate an event to continue."
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for a draw')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/BracketEmptyState.test.tsx src/lib/__tests__/BracketInlineNotice.test.tsx --run
```

Expected: FAIL because `BracketEmptyState` and `BracketInlineNotice` do not exist.

- [ ] **Step 3: Implement `BracketEmptyState`**

Create `products/scheduler/frontend/src/features/bracket/BracketEmptyState.tsx`:

```tsx
import { Button } from '@scheduler/design-system';

interface BracketEmptyStateProps {
  eyebrow: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function BracketEmptyState({
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
}: BracketEmptyStateProps) {
  return (
    <section className="mx-auto flex min-h-[280px] max-w-3xl flex-col justify-center px-6 py-10">
      <div className="border-t border-border pt-5">
        <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mt-2 max-w-[58ch] text-sm leading-6 text-muted-foreground">
          {body}
        </p>
        {actionLabel && onAction ? (
          <div className="mt-5">
            <Button type="button" variant="brand" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implement `BracketInlineNotice`**

Create `products/scheduler/frontend/src/features/bracket/BracketInlineNotice.tsx`:

```tsx
type NoticeTone = 'info' | 'error' | 'warning';

interface BracketInlineNoticeProps {
  tone: NoticeTone;
  title: string;
  message?: string;
}

const TONE_CLASS: Record<NoticeTone, string> = {
  info: 'border-border bg-card text-card-foreground',
  warning: 'border-status-called/40 bg-status-called/10 text-foreground',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function BracketInlineNotice({
  tone,
  title,
  message,
}: BracketInlineNoticeProps) {
  const role = tone === 'error' ? 'alert' : undefined;
  return (
    <div
      role={role}
      className={`mx-4 mt-4 rounded-sm border px-3 py-2 text-sm ${TONE_CLASS[tone]}`}
    >
      <div className="font-medium">{title}</div>
      {message ? (
        <div className="mt-0.5 text-xs opacity-80">{message}</div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/BracketEmptyState.test.tsx src/lib/__tests__/BracketInlineNotice.test.tsx --run
```

Expected: PASS.

- [ ] **Step 6: Commit shared primitives**

Run:

```bash
git add products/scheduler/frontend/src/features/bracket/BracketEmptyState.tsx \
  products/scheduler/frontend/src/features/bracket/BracketInlineNotice.tsx \
  products/scheduler/frontend/src/lib/__tests__/BracketEmptyState.test.tsx \
  products/scheduler/frontend/src/lib/__tests__/BracketInlineNotice.test.tsx
git commit -m "feat: add bracket sibling state primitives"
```

Expected: commit succeeds.

---

### Task 3: Polish Bracket Top-Level Empty and Error States

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/BracketTab.tsx`
- Test: `products/scheduler/frontend/src/lib/__tests__/BracketTab.test.tsx`

- [ ] **Step 1: Add failing tests for no-draw and error states**

In `products/scheduler/frontend/src/lib/__tests__/BracketTab.test.tsx`, add tests near existing fresh-tournament tests:

```tsx
it('renders a composed empty state when draw-dependent views have no bracket data', () => {
  useUiStore.getState().setActiveTab('bracket-draw');

  render(<BracketTab />, { wrapper: MemoryRouterWrapper('/tournaments/t1/bracket-draw') });

  expect(screen.getByRole('heading', { name: 'No draws generated' })).toBeInTheDocument();
  expect(screen.getByText(/Open Events to add events and generate draws/i)).toBeInTheDocument();
});

it('renders bracket load errors as inline alerts', () => {
  mockUseBracket.mockReturnValue({
    data: null,
    setData: vi.fn(),
    loading: false,
    error: 'Network failed',
    refresh: vi.fn(),
  });

  render(<BracketTab />, { wrapper: MemoryRouterWrapper('/tournaments/t1/bracket-draw') });

  expect(screen.getByRole('alert')).toHaveTextContent('Bracket data is unavailable');
  expect(screen.getByRole('alert')).toHaveTextContent('Network failed');
});
```

If this test file uses different local helper names, adapt only the wrapper/mock names to the existing file. Keep the assertions above.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/BracketTab.test.tsx --run
```

Expected: FAIL because the current text is the old paragraph/error block.

- [ ] **Step 3: Replace the top-level no-data and error blocks**

Modify `products/scheduler/frontend/src/features/bracket/BracketTab.tsx`:

```tsx
import { BracketEmptyState } from './BracketEmptyState';
import { BracketInlineNotice } from './BracketInlineNotice';
```

Replace the `needsBracketData && !data` return with:

```tsx
  if (needsBracketData && !data) {
    return (
      <div className="min-h-full bg-background">
        {error ? (
          <BracketInlineNotice
            tone="error"
            title="Bracket data is unavailable"
            message={error}
          />
        ) : null}
        <BracketEmptyState
          eyebrow={view}
          title="No draws generated"
          body="Open Events to add events and generate draws. Setup controls the venue and schedule settings for those draws."
        />
      </div>
    );
  }
```

Replace the lower `error && <div ...>` block with:

```tsx
      {error && (
        <BracketInlineNotice
          tone="error"
          title="Bracket data is unavailable"
          message={error}
        />
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/BracketTab.test.tsx src/lib/__tests__/BracketEmptyState.test.tsx src/lib/__tests__/BracketInlineNotice.test.tsx --run
```

Expected: PASS.

- [ ] **Step 5: Commit top-level bracket state polish**

Run:

```bash
git add products/scheduler/frontend/src/features/bracket/BracketTab.tsx \
  products/scheduler/frontend/src/lib/__tests__/BracketTab.test.tsx
git commit -m "feat: polish bracket empty and error states"
```

Expected: commit succeeds.

---

### Task 4: Polish Events Tab Without Behavior Changes

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/EventsTab.tsx`
- Test: `products/scheduler/frontend/src/lib/__tests__/EventsTab.test.tsx`

- [ ] **Step 1: Add failing empty-state test**

In `products/scheduler/frontend/src/lib/__tests__/EventsTab.test.tsx`, add:

```tsx
it('renders a composed empty state when no events exist', () => {
  mockUseBracket.mockReturnValue({
    data: {
      courts: 2,
      total_slots: 64,
      rest_between_rounds: 1,
      interval_minutes: 30,
      events: [],
      participants: [],
      play_units: [],
      assignments: [],
      results: [],
    },
    setData: vi.fn(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  });

  render(<EventsTab />);

  expect(screen.getByRole('heading', { name: 'No bracket events yet' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Add event/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/EventsTab.test.tsx --run
```

Expected: FAIL because the table renders without the composed empty state.

- [ ] **Step 3: Implement empty state and meet-like table shell**

Modify `products/scheduler/frontend/src/features/bracket/EventsTab.tsx`:

```tsx
import { BracketEmptyState } from './BracketEmptyState';
```

Inside the returned `<main>`, before the `<table>`, add:

```tsx
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Events
            </p>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              Draw events
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAddingRow(true)}>
            Add event
          </Button>
        </div>
        {events.length === 0 && !addingRow ? (
          <BracketEmptyState
            eyebrow="Events"
            title="No bracket events yet"
            body="Add the first event, choose the draw format, then enter participants before generating the draw."
            actionLabel="Add event"
            onAction={() => setAddingRow(true)}
          />
        ) : null}
```

Then wrap the existing table so it only renders when there is content or the add row is active:

```tsx
        {events.length > 0 || addingRow ? (
          <table className="w-full border-collapse text-sm">
            {/* keep existing thead/tbody content */}
          </table>
        ) : null}
```

Remove the old bottom `Add event` button to avoid duplicate actions.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/EventsTab.test.tsx src/lib/__tests__/BracketEmptyState.test.tsx --run
```

Expected: PASS.

- [ ] **Step 5: Commit Events polish**

Run:

```bash
git add products/scheduler/frontend/src/features/bracket/EventsTab.tsx \
  products/scheduler/frontend/src/lib/__tests__/EventsTab.test.tsx
git commit -m "feat: polish bracket events workflow"
```

Expected: commit succeeds.

---

### Task 5: Polish Draw and Live Empty States

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/DrawView.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/LiveView.tsx`
- Test: `products/scheduler/frontend/src/lib/__tests__/LiveView.test.tsx`
- Test: `products/scheduler/frontend/src/lib/__tests__/DrawView.test.tsx` if present; otherwise add focused assertions to the existing bracket view test that covers Draw.

- [ ] **Step 1: Add failing Live empty-state test**

In `products/scheduler/frontend/src/lib/__tests__/LiveView.test.tsx`, add:

```tsx
it('renders a composed empty state when no bracket matches are scheduled live', () => {
  render(
    <LiveView
      data={{
        courts: 2,
        total_slots: 64,
        rest_between_rounds: 1,
        interval_minutes: 30,
        events: [],
        participants: [],
        play_units: [],
        assignments: [],
        results: [],
      }}
      eventId=""
      onChange={vi.fn()}
    />,
  );

  expect(screen.getByRole('heading', { name: 'No scheduled bracket matches' })).toBeInTheDocument();
  expect(screen.getByText(/Schedule a round before running live play/i)).toBeInTheDocument();
});
```

Adapt prop names to the current `LiveView` signature if the file already defines a fixture helper.

- [ ] **Step 2: Run Live test to verify it fails**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/LiveView.test.tsx --run
```

Expected: FAIL because `LiveView` currently renders the old plain message.

- [ ] **Step 3: Implement Live empty state**

Modify `products/scheduler/frontend/src/features/bracket/LiveView.tsx`:

```tsx
import { BracketEmptyState } from './BracketEmptyState';
```

Replace the `placements.length === 0` branch with:

```tsx
  if (placements.length === 0) {
    return (
      <BracketEmptyState
        eyebrow="Live"
        title="No scheduled bracket matches"
        body="Schedule a round before running live play. Once matches are assigned to courts, live status and result actions appear here."
      />
    );
  }
```

- [ ] **Step 4: Add or update Draw empty-state test**

If `products/scheduler/frontend/src/lib/__tests__/DrawView.test.tsx` exists, add:

```tsx
it('renders a composed empty state when no draw exists for the selected event', () => {
  render(
    <DrawView
      data={{
        courts: 2,
        total_slots: 64,
        rest_between_rounds: 1,
        interval_minutes: 30,
        events: [{ id: 'MS', discipline: 'MS', format: 'se', participant_count: 0, rounds: [] }],
        participants: [],
        play_units: [],
        assignments: [],
        results: [],
      }}
      eventId="MS"
      onChange={vi.fn()}
      refresh={vi.fn()}
    />,
  );

  expect(screen.getByRole('heading', { name: 'No draw generated' })).toBeInTheDocument();
});
```

If that file does not exist, create it with the test above and copy the project's existing bracket test setup imports from `LiveView.test.tsx`.

- [ ] **Step 5: Run Draw test to verify it fails**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/DrawView.test.tsx --run
```

Expected: FAIL if the composed empty state is not already present.

- [ ] **Step 6: Implement Draw empty state**

Modify `products/scheduler/frontend/src/features/bracket/DrawView.tsx`:

```tsx
import { BracketEmptyState } from './BracketEmptyState';
```

Where the view currently returns an empty/no-draw message for the selected event, render:

```tsx
      <BracketEmptyState
        eyebrow="Draw"
        title="No draw generated"
        body="Open Events, enter participants for this event, then generate the draw."
      />
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/LiveView.test.tsx src/lib/__tests__/DrawView.test.tsx src/lib/__tests__/BracketEmptyState.test.tsx --run
```

Expected: PASS.

- [ ] **Step 8: Commit Draw/Live polish**

Run:

```bash
git add products/scheduler/frontend/src/features/bracket/DrawView.tsx \
  products/scheduler/frontend/src/features/bracket/LiveView.tsx \
  products/scheduler/frontend/src/lib/__tests__/DrawView.test.tsx \
  products/scheduler/frontend/src/lib/__tests__/LiveView.test.tsx
git commit -m "feat: polish bracket draw and live states"
```

Expected: commit succeeds.

---

### Task 6: Backend Hardening Bug 1 — Result Recording Idempotency Audit

**Files:**
- Modify test first: `products/scheduler/tests/unit/test_bracket_routes.py`
- Modify implementation only if test fails for a real bug: `products/scheduler/backend/api/brackets.py` and/or `products/scheduler/backend/repositories/local.py`

- [ ] **Step 1: Add failing or confirming test for duplicate result recording**

Append to `products/scheduler/tests/unit/test_bracket_routes.py` near result tests:

```python
def test_record_result_replay_does_not_duplicate_or_corrupt_advancement(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    sched = client.post(_bracket_url(tid, "schedule-next"))
    assert sched.status_code == 200, sched.text
    first_match = sched.json()["play_unit_ids"][0]

    r1 = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_match, "winner_side": "A"},
    )
    assert r1.status_code == 200, r1.text

    r2 = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_match, "winner_side": "A"},
    )
    assert r2.status_code in (200, 409), r2.text

    state = client.get(_bracket_url(tid))
    assert state.status_code == 200
    matching_results = [
        r for r in state.json()["results"] if r["play_unit_id"] == first_match
    ]
    assert len(matching_results) == 1
    assert matching_results[0]["winner_side"] == "A"
```

This test allows either safe replay (`200`) or explicit conflict (`409`), but forbids duplicate/corrupt persisted state.

- [ ] **Step 2: Run test to classify current behavior**

Run:

```bash
cd products/scheduler
pytest tests/unit/test_bracket_routes.py::test_record_result_replay_does_not_duplicate_or_corrupt_advancement -q
```

Expected: either PASS, proving this specific behavior is already safe, or FAIL with duplicate/corrupt result behavior. If it passes, keep the test as regression coverage and skip to Step 5.

- [ ] **Step 3: If failing, implement minimal backend fix**

If duplicate result recording corrupts state, update the result-recording path in `products/scheduler/backend/api/brackets.py` so recording the same winner for an already-recorded match is idempotent and recording a different winner returns `409`.

Add this guard immediately before the existing `record_result(...)` call:

```python
    existing = next(
        (r for r in session.state.results if r.play_unit_id == body.play_unit_id),
        None,
    )
    if existing is not None:
        if existing.winner_side.value == body.winner_side:
            return _serialize_session(session)
        raise HTTPException(
            status_code=409,
            detail="Result already recorded for this match",
        )
```

Adjust enum/string access to match the actual `Result.winner_side` type in the file.

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
cd products/scheduler
pytest tests/unit/test_bracket_routes.py::test_record_result_replay_does_not_duplicate_or_corrupt_advancement -q
```

Expected: PASS.

- [ ] **Step 5: Run bracket route suite**

Run:

```bash
cd products/scheduler
pytest tests/unit/test_bracket_routes.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit result hardening**

Run:

```bash
git add products/scheduler/tests/unit/test_bracket_routes.py products/scheduler/backend/api/brackets.py
git commit -m "fix: harden bracket result replay"
```

Expected: commit succeeds. If implementation was unnecessary, stage and commit only the test file with message `test: cover bracket result replay`.

---

### Task 7: Backend Hardening Bug 2 — Match Action Transition Audit

**Files:**
- Modify test first: `products/scheduler/tests/unit/test_bracket_routes.py`
- Modify implementation only if test fails for a real bug: `products/scheduler/backend/api/brackets.py`

- [ ] **Step 1: Add failing or confirming test for illegal finish-before-start**

Append:

```python
def test_bracket_match_action_rejects_finish_before_start(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    sched = client.post(_bracket_url(tid, "schedule-next"))
    assert sched.status_code == 200, sched.text
    match_id = sched.json()["play_unit_ids"][0]

    r = client.post(
        _bracket_url(tid, "match-action"),
        json={"play_unit_id": match_id, "action": "finish"},
    )

    assert r.status_code == 409
```

- [ ] **Step 2: Run test to verify current behavior**

Run:

```bash
cd products/scheduler
pytest tests/unit/test_bracket_routes.py::test_bracket_match_action_rejects_finish_before_start -q
```

Expected: PASS if already guarded, FAIL if finish-before-start is currently allowed.

- [ ] **Step 3: If failing, implement minimal route guard**

In `products/scheduler/backend/api/brackets.py`, inside the match-action route, before applying `"finish"`:

```python
    if body.action == "finish" and not assignment.started:
        raise HTTPException(
            status_code=409,
            detail="Cannot finish a bracket match before it has started",
        )
```

Use the actual local assignment variable name from the route.

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
cd products/scheduler
pytest tests/unit/test_bracket_routes.py::test_bracket_match_action_rejects_finish_before_start -q
```

Expected: PASS.

- [ ] **Step 5: Run all bracket backend unit tests**

Run:

```bash
cd products/scheduler
pytest tests/unit/test_bracket_routes.py tests/unit/test_bracket_event_routes.py tests/unit/test_bracket_interactive_scheduling.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit transition hardening**

Run:

```bash
git add products/scheduler/tests/unit/test_bracket_routes.py products/scheduler/backend/api/brackets.py
git commit -m "fix: guard bracket match transitions"
```

Expected: commit succeeds. If implementation was unnecessary, commit only the test with message `test: cover bracket match transition guard`.

---

### Task 8: Final Verification and Follow-Up Decision

**Files:**
- Modify: `docs/audits/2026-06-10_bracket-sibling-parity-map.md`
- Optional create: `docs/superpowers/specs/2026-06-10-bracket-command-bridge-followup.md` only if command bridge is deferred.

- [ ] **Step 1: Run frontend focused suite**

Run:

```bash
cd products/scheduler/frontend
npm test -- src/lib/__tests__/BracketTab.test.tsx src/lib/__tests__/EventsTab.test.tsx src/lib/__tests__/DrawView.test.tsx src/lib/__tests__/LiveView.test.tsx src/lib/__tests__/BracketEmptyState.test.tsx src/lib/__tests__/BracketInlineNotice.test.tsx --run
```

Expected: PASS.

- [ ] **Step 2: Run backend focused suite**

Run:

```bash
cd products/scheduler
pytest tests/unit/test_bracket_routes.py tests/unit/test_bracket_event_routes.py tests/unit/test_bracket_interactive_scheduling.py -q
```

Expected: PASS.

- [ ] **Step 3: Update audit map with results**

In `docs/audits/2026-06-10_bracket-sibling-parity-map.md`, add:

```markdown
## Verification results

- Frontend focused bracket suite: PASS (`npm test -- ... --run`)
- Backend focused bracket suite: PASS (`pytest tests/unit/test_bracket_routes.py tests/unit/test_bracket_event_routes.py tests/unit/test_bracket_interactive_scheduling.py -q`)

## Command bridge decision

The first pass keeps frontend commandQueue migration deferred. Backend hardening landed as behavior-compatible route fixes and regression tests. A command bridge should be planned only after reviewing the result/action semantics with the UI pending/conflict states.
```

- [ ] **Step 4: Run forbidden-marker scan on docs**

Run:

```bash
rg -n "T[B]D|T[O]DO|F[I]XME" docs/audits/2026-06-10_bracket-sibling-parity-map.md docs/superpowers/plans/2026-06-10-bracket-sibling-parity.md
```

Expected: no matches.

- [ ] **Step 5: Commit final audit update**

Run:

```bash
git add docs/audits/2026-06-10_bracket-sibling-parity-map.md
git commit -m "docs: record bracket parity verification"
```

Expected: commit succeeds.

- [ ] **Step 6: Report remaining work**

Summarize:

- UI slices completed.
- Backend hardening tests/fixes completed.
- Any skipped backend bug candidates because current behavior was already safe.
- Command bridge deferred or ready for a new spec.
- Tests run and their final pass/fail status.
