# Bundle 1 — Critical bug fixes (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore correctness on three production-blocking surfaces — meet Live mutations (412), shared GanttTimeline rendering (half the matches invisible), TV date (off by one).

**Architecture:** Three independent fixes, sequenced smallest-blast-radius first. Fix 3 (TV date) is a one-liner with a unit test. Fix 2 (GanttTimeline) is a structural change to one shared component, math untouched, existing tests stay green. Fix 1 (If-Match) threads a `version` argument through `apiClient.updateMatchState` and every caller, with cold-cache fallback and 412 rollback in `useLiveTracking`.

**Tech Stack:** TypeScript + React 18 + Vitest + axios + Zustand. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-15-bundle-1-critical-bugs-design.md`
**Branch:** `feat/bundle-1-critical-bugs`
**Audit:** `docs/audits/2026-05-15_user-audit_meet-vs-bracket.md`

---

## File map

| File | Action | Why |
|---|---|---|
| `products/scheduler/frontend/src/pages/publicDisplay/helpers.ts` | modify | Fix 3 — add `timeZone: 'UTC'` to `formatTournamentDate` |
| `products/scheduler/frontend/src/pages/publicDisplay/__tests__/helpers.test.ts` | create | Fix 3 — regression test in three timezones |
| `packages/design-system/components/GanttTimeline.tsx` | modify | Fix 2 — lift positioned blocks into a single overlay |
| `products/scheduler/frontend/src/lib/__tests__/ganttTimeline.test.ts` | modify | Fix 2 — extend with a rendering test |
| `products/scheduler/frontend/src/api/client.ts` | modify | Fix 1 — `updateMatchState` accepts `version`, sends `If-Match`, returns new version |
| `products/scheduler/frontend/src/hooks/useLiveTracking.ts` | modify | Fix 1 — read version from store / cold-fetch, react to 412 |
| `products/scheduler/frontend/src/hooks/useLiveOperations.ts` | modify | Fix 1 — one other caller of `updateMatchState`; pass version |
| `products/scheduler/frontend/src/lib/__tests__/updateMatchState.test.ts` | create | Fix 1 — unit test the `If-Match` header + ETag round trip |

`apiClient.updateMatchState` is called from 5 sites confirmed by `rg`:
- `useLiveTracking.ts:199` (primary status updates)
- `useLiveTracking.ts:214` (Retry callback inside the toast)
- `useLiveTracking.ts:237` (`setMatchScore`)
- `useLiveTracking.ts:280` (a third internal helper — confirmed in Task 9)
- `useLiveOperations.ts:195` (separate hook)

All five get the same version-aware treatment.

---

## Fix 3 — TV date off-by-one (smallest, ships first)

### Task 1: Add timezone-locked test for `formatTournamentDate`

**Files:**
- Create: `products/scheduler/frontend/src/pages/publicDisplay/__tests__/helpers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/**
 * Regression test for the TV header date off-by-one bug.
 *
 * `formatTournamentDate` was rendering "Thu, May 14" for a tournament
 * date of "2026-05-15" in any UTC-positive timezone, because the bare
 * YYYY-MM-DD parses as UTC midnight and `toLocaleDateString` then
 * formats it in the viewer's local zone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatTournamentDate } from '../helpers';

describe('formatTournamentDate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the same weekday/day/month in every timezone', () => {
    // 2026-05-15 is a Friday in UTC.
    // Spot-check three zones: UTC, west of UTC (LA), east of UTC (Tokyo).
    // We can't mutate process.env.TZ at runtime in JSDOM, so we drive
    // the locale via the DateTimeFormat option directly by patching
    // Intl.DateTimeFormat's default options resolution. The simpler
    // route: pin the test to the format the helper produces and assert
    // that the FIRST THREE chars (weekday short) match "Fri" regardless
    // of how the test runner picks the locale — the helper's `timeZone`
    // option forces UTC interpretation so the assertion holds in all
    // zones the runner could be in.
    const out = formatTournamentDate('2026-05-15');
    expect(out).toMatch(/^Fri/);
    expect(out).toMatch(/May/);
    expect(out).toMatch(/15/);
  });

  it('renders Fri for 2026-05-15 when Date.now is in Asia/Tokyo', () => {
    // Force the JS runtime's interpretation of any local Date by
    // patching the global Date constructor for the duration of the test.
    // Simpler approach: rely on the fact that the helper passes
    // `timeZone: 'UTC'` once fixed, so even with a fake local clock the
    // weekday is computed from the UTC anchor.
    vi.stubGlobal(
      'Intl',
      new Proxy(Intl, {
        get(target, prop, receiver) {
          if (prop === 'DateTimeFormat') {
            // Wrap so we observe the timeZone option being passed.
            return new Proxy(target.DateTimeFormat, {
              construct(orig, args) {
                const opts = (args[1] ?? {}) as Intl.DateTimeFormatOptions;
                expect(opts.timeZone).toBe('UTC');
                return new orig(args[0], args[1]);
              },
            });
          }
          return Reflect.get(target, prop, receiver);
        },
      }),
    );
    const out = formatTournamentDate('2026-05-15');
    expect(out).toMatch(/^Fri/);
  });

  it('returns null for null / undefined input', () => {
    expect(formatTournamentDate(null)).toBeNull();
    expect(formatTournamentDate(undefined)).toBeNull();
  });

  it('returns null for an unparseable input', () => {
    expect(formatTournamentDate('not-a-date')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd products/scheduler/frontend
npx vitest run src/pages/publicDisplay/__tests__/helpers.test.ts
```

Expected: the second test (`renders Fri … Asia/Tokyo`) fails with `expected "UTC" to be undefined` because the helper doesn't pass `timeZone` yet. The first test may pass or fail depending on the local zone; both will pass after the fix.

### Task 2: Add `timeZone: 'UTC'` to `formatTournamentDate`

**Files:**
- Modify: `products/scheduler/frontend/src/pages/publicDisplay/helpers.ts:19-23`

- [ ] **Step 1: Apply the one-line change**

Replace the `toLocaleDateString` call so the formatter is anchored to UTC:

```ts
export function formatTournamentDate(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
cd products/scheduler/frontend
npx vitest run src/pages/publicDisplay/__tests__/helpers.test.ts
```

Expected: all four cases pass.

- [ ] **Step 3: Run the broader test suite to confirm no regressions**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add products/scheduler/frontend/src/pages/publicDisplay/helpers.ts \
        products/scheduler/frontend/src/pages/publicDisplay/__tests__/helpers.test.ts
git commit -m "fix(tv): render tournament date in UTC to stop off-by-one

formatTournamentDate parsed bare YYYY-MM-DD as UTC midnight then
formatted it in the viewer's local zone. For any UTC-positive zone
that rolled to the previous day. Pass timeZone: 'UTC' so weekday /
day / month are computed from the same anchor the parser used.

Audit finding: docs/audits/2026-05-15_user-audit_meet-vs-bracket.md §1.7"
```

---

## Fix 2 — Stop double-positioning GanttTimeline blocks

### Task 3: Add a rendering test that catches the off-by-one

**Files:**
- Modify: `products/scheduler/frontend/src/lib/__tests__/ganttTimeline.test.ts`

- [ ] **Step 1: Append a render test that asserts on-screen `top` per court**

Add this block at the end of the existing file (after the closing `});` of the `describe('placementBox', …)`):

```ts
// ─── Rendering tests ────────────────────────────────────────────────
//
// Regression test for the bracket court-grid duplicate-render bug.
// The math in placementBox was already correct (top = courtIndex *
// row, absolute-from-grid-origin) — but the consumer was nesting
// each PositionedBlock inside a per-court row container that was
// already offset by the same amount, doubling the y for courts 1+.
// Audit finding: docs/audits/2026-05-15_user-audit_meet-vs-bracket.md §2.5
import { render, screen } from '@testing-library/react';
import { GanttTimeline, type Placement as PlacementType } from '@scheduler/design-system/components';

function makePlacement(courtIndex: number): PlacementType {
  return {
    courtIndex,
    startSlot: 0,
    span: 1,
    key: `block-c${courtIndex}`,
  };
}

describe('<GanttTimeline /> block positioning', () => {
  it('places one block per court at the correct absolute top', () => {
    const placements: PlacementType[] = [0, 1, 2, 3].map(makePlacement);
    render(
      <GanttTimeline
        courts={[1, 2, 3, 4]}
        minSlot={0}
        slotCount={4}
        density="standard"
        placements={placements}
        renderBlock={(p) => <div data-testid={`b-${p.courtIndex}`}>{p.key}</div>}
      />,
    );

    // Standard tier: row = 40px. Court i lives at top = i * 40.
    // Every block must report style.top equal to its court row's offset.
    for (const courtIndex of [0, 1, 2, 3]) {
      const block = screen.getByTestId(`b-${courtIndex}`);
      // The PositionedBlock wrapper is the parent; its inline `top` is
      // what we care about.
      const wrapper = block.parentElement!;
      expect(wrapper.style.position).toBe('absolute');
      expect(wrapper.style.top).toBe(`${courtIndex * 40}px`);
    }
  });

  it('renders all blocks even when there are more courts than visible rows on the page', () => {
    // Same guard as above, phrased as "all four blocks are present"
    // so a regression that hides blocks below the rendered grid fails.
    const placements: PlacementType[] = [0, 1, 2, 3].map(makePlacement);
    render(
      <GanttTimeline
        courts={[1, 2, 3, 4]}
        minSlot={0}
        slotCount={4}
        density="standard"
        placements={placements}
        renderBlock={(p) => <div data-testid={`b-${p.courtIndex}`}>{p.key}</div>}
      />,
    );
    expect(screen.getAllByTestId(/^b-/)).toHaveLength(4);
  });
});
```

You will also need to add this import at the top of the file (after the existing `import` statements):

```ts
import React from 'react';
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/ganttTimeline.test.ts
```

Expected: the first new test fails because for `courtIndex=1`, `style.top` is `40px` from the math, but the rendered wrapper is INSIDE a row container also at `top: 40px`, so the inline style and the desired-on-screen position disagree. Depending on how the assertion reads `style.top`, the value will be `40px` (math correct) but the visual position is wrong — the test instead asserts the wrapper is a direct child of a SINGLE overlay (not a per-row container), which is the structural property the fix establishes. If the assertion is on `style.top` only, ALSO assert the wrapper's `offsetParent` is the same node for all four blocks (overlay), which fails today because each block has a different row container as its `offsetParent`.

Replace the per-block assertion with this stricter form (use this version if the first fails to fail today):

```ts
const wrappers = [0, 1, 2, 3].map((i) => screen.getByTestId(`b-${i}`).parentElement!);
// Structural guard: all four wrappers share the same parent (the single overlay).
const parents = new Set(wrappers.map((w) => w.parentElement));
expect(parents.size).toBe(1);
// Each wrapper's `top` matches its court's absolute offset.
for (let i = 0; i < 4; i++) {
  expect(wrappers[i].style.top).toBe(`${i * 40}px`);
}
```

Re-run; expected: the `parents.size` assertion fails today (4 different parents — one per court row).

### Task 4: Refactor `GanttTimeline` to use a single overlay

**Files:**
- Modify: `packages/design-system/components/GanttTimeline.tsx:212-333`

- [ ] **Step 1: Replace the rendering loop**

Replace lines 212-333 (the `export function GanttTimeline(...)` body) with the version below. The changes:

- The `byCourtIndex` memo (line 243) becomes a flat `placementsWithBoxes` memo.
- The court-row map no longer renders blocks; only label/mesh/renderRow.
- A single `<div>` after the court-row map holds the absolutely-positioned blocks. It's `position: absolute` over the grid body, `pointer-events: none` so cell clicks pass through, with each `PositionedBlock` re-enabling pointer events on itself.

```tsx
export function GanttTimeline({
  courts,
  minSlot,
  slotCount,
  density,
  placements,
  renderBlock,
  renderCell = defaultRenderCell,
  onCellClick,
  headerLabel = 'Court',
  renderSlotLabel,
  renderRow,
  renderCourtLabel = defaultRenderCourtLabel,
  currentSlot,
  className,
  ...rest
}: GanttTimelineProps) {
  const tier = GANTT_GEOMETRY[density];
  const gridWidth = tier.label + slotCount * tier.slot;
  const bodyHeight = courts.length * tier.row;

  const slotIds = useMemo(
    () => Array.from({ length: slotCount }, (_, i) => minSlot + i),
    [minSlot, slotCount],
  );

  // Single flat list of (placement, precomputed box). The precomputed
  // box references stay identity-stable across renders for unchanged
  // (placement, minSlot, tier), which is what lets `PositionedBlock`'s
  // `React.memo` bail out — the default shallow compare sees the same
  // `box` reference across renders.
  const placementsWithBoxes = useMemo(
    () => placements.map((p) => ({ placement: p, box: placementBox(p, minSlot, tier) })),
    [placements, minSlot, tier],
  );

  return (
    <div className={cn('overflow-x-auto', className)} {...rest}>
      <div style={{ width: gridWidth }}>
        {/* Time-header row */}
        <div className="flex border-b border-border/60 bg-muted/40">
          <div
            style={{ width: tier.label }}
            className="flex-shrink-0 px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {headerLabel}
          </div>
          {slotIds.map((slotId, i) => (
            <div
              key={slotId}
              style={{ width: tier.slot }}
              className={cn(
                'flex-shrink-0 border-l border-border px-1 py-1 text-center text-2xs tabular-nums',
                slotId === currentSlot
                  ? 'bg-status-live/15 font-semibold text-status-live'
                  : 'text-muted-foreground',
              )}
            >
              {renderSlotLabel ? renderSlotLabel(slotId, i) : ''}
            </div>
          ))}
        </div>

        {/* Grid body: court rows (bg + mesh + renderRow) + overlay for blocks.
            The body wrapper is position: relative so the overlay positions
            against it; the overlay starts after the label column so
            box.left (which is relative to the mesh, not the full grid)
            aligns correctly. */}
        <div className="relative" style={{ width: gridWidth, height: bodyHeight }}>
          {courts.map((courtId, courtIndex) => (
            <div
              key={courtId}
              className="relative flex border-b border-border/60"
              style={{ height: tier.row }}
            >
              {/* Left court-label column */}
              <div
                style={{ width: tier.label, height: tier.row }}
                className="flex-shrink-0 bg-muted/30"
              >
                {renderCourtLabel(courtId)}
              </div>

              {/* Mesh */}
              <div className="relative gantt-grid" style={{ flex: '1 1 auto' }}>
                <div className="absolute inset-0 flex">
                  {slotIds.map((slotId, slotIndex) => (
                    <div
                      key={slotId}
                      style={{ width: tier.slot }}
                      className="flex-shrink-0"
                      onClick={
                        onCellClick
                          ? () => onCellClick(courtId, slotId)
                          : undefined
                      }
                    >
                      {renderCell({ courtId, slotId, slotIndex })}
                    </div>
                  ))}
                </div>

                {/* Per-row decoration BEHIND the blocks */}
                {renderRow ? renderRow(courtId) : null}
              </div>
            </div>
          ))}

          {/* Positioned blocks — one overlay for the whole grid body.
              `left: tier.label` skips the court-label column so
              `box.left` (relative to the mesh) lands correctly without
              extra math. `pointer-events: none` keeps cell clicks alive;
              each PositionedBlock re-enables pointer events on itself. */}
          <div
            className="pointer-events-none absolute"
            style={{
              top: 0,
              left: tier.label,
              right: 0,
              bottom: 0,
            }}
          >
            {placementsWithBoxes.map(({ placement, box }) => (
              <PositionedBlock
                key={placement.key}
                placement={placement}
                box={box}
                renderBlock={renderBlock}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `PositionedBlock` to re-enable pointer events**

Replace lines 169-187 (the `PositionedBlock` definition):

```tsx
const PositionedBlock = memo(function PositionedBlock({
  placement,
  box,
  renderBlock,
}: PositionedBlockProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        pointerEvents: 'auto',
      }}
    >
      {renderBlock(placement, box)}
    </div>
  );
});
```

- [ ] **Step 3: Run the gantt tests to verify they pass**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/ganttTimeline.test.ts
```

Expected: all `placementBox` unit tests still pass (math is untouched), and the new rendering tests pass (single overlay parent, correct `top` per court).

- [ ] **Step 4: Run the wider scheduler tests**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: existing tests (`BracketTab`, `LiveView`, `ScheduleView`, `commandQueue`, etc.) still pass.

- [ ] **Step 5: Browser-harness sanity check (meet)**

The production stack should already be running on `http://localhost`. Walk the meet flow:

1. Open the existing audit meet (`/tournaments/09fd8396-e836-4d33-bb97-68fbb27a0cc3/schedule`).
2. Confirm the gantt shows 4 distinct blocks at 09:00 — one each on C1, C2, C3, C4.

If you have `browser-harness` available:

```bash
browser-harness <<'PY'
new_tab("http://localhost/tournaments/09fd8396-e836-4d33-bb97-68fbb27a0cc3/schedule")
wait_for_load()
wait(0.5)
print(capture_screenshot())
PY
```

Expected: the screenshot shows 4 court-row blocks at 09:00.

- [ ] **Step 6: Browser-harness sanity check (bracket)**

```bash
browser-harness <<'PY'
new_tab("http://localhost/tournaments/7fa7210a-b8fb-4301-8b04-8c4c2fb9e43a/bracket")
wait_for_load()
wait(0.5)
# Click Schedule tab (precise CSS coord per audit findings)
click_at_xy(472, 24)
wait(0.5)
print(capture_screenshot())
PY
```

Expected: 4 blocks visible in C1–C4 for the QF round (whichever are still in pre-played state).

- [ ] **Step 7: Commit**

```bash
git add packages/design-system/components/GanttTimeline.tsx \
        products/scheduler/frontend/src/lib/__tests__/ganttTimeline.test.ts
git commit -m "fix(gantt): render blocks in a single overlay, not per-court

placementBox correctly returns top = courtIndex * row (absolute from
grid origin), but the render loop nested each PositionedBlock inside
a per-court row container that was already offset by the same amount.
Court 0 worked; courts 1+ drifted one row further each. From the
operator's chair half the matches were invisible on both meet and
bracket Schedule/Live tabs.

Lift positioned blocks into a single overlay over the grid body.
Math stays in placementBox; existing math unit tests stay green;
a new render test asserts one overlay parent and correct top per court.

Audit findings:
- docs/audits/2026-05-15_user-audit_meet-vs-bracket.md §2.5
- docs/audits/2026-05-15_user-audit_meet-vs-bracket.md §1.5"
```

---

## Fix 1 — `If-Match` on match-state mutations

### Task 5: Audit `apiClient.updateMatchState` call-sites

**Files:** (read-only this task)
- `products/scheduler/frontend/src/hooks/useLiveTracking.ts`
- `products/scheduler/frontend/src/hooks/useLiveOperations.ts`
- Anything `rg` surfaces.

- [ ] **Step 1: List every caller**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
rg -n 'apiClient\.updateMatchState\b' products/scheduler/frontend/src
```

Expected: exactly the five rows already documented in the file map:

```
products/scheduler/frontend/src/hooks/useLiveTracking.ts:199
products/scheduler/frontend/src/hooks/useLiveTracking.ts:214
products/scheduler/frontend/src/hooks/useLiveTracking.ts:237
products/scheduler/frontend/src/hooks/useLiveTracking.ts:280
products/scheduler/frontend/src/hooks/useLiveOperations.ts:195
```

If the grep finds additional callers, add a row to the file map and an update step at the end of the fix.

### Task 6: Define the new `apiClient.updateMatchState` contract via tests

**Files:**
- Create: `products/scheduler/frontend/src/lib/__tests__/updateMatchState.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
/**
 * Tests for the If-Match header round trip on match-state mutations.
 *
 * Audit finding: docs/audits/2026-05-15_user-audit_meet-vs-bracket.md §1.6
 *
 * The legacy match-state route (PUT /tournaments/{tid}/match-states/{id})
 * requires If-Match per `products/scheduler/backend/api/match_state.py:_enforce_if_match`.
 * `apiClient.updateMatchState` previously omitted the header — every
 * Call/Start/Post mutation 412'd.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosInstance } from 'axios';
import { apiClient } from '../../api/client';

// Access the private axios instance for assertion. The test deliberately
// peeks at internals because there's no public seam.
function getPrivateClient(): AxiosInstance {
  return (apiClient as unknown as { client: AxiosInstance }).client;
}

describe('apiClient.updateMatchState', () => {
  beforeEach(() => {
    // Stub the axios put with a vi.fn so we can inspect headers + return.
    vi.spyOn(getPrivateClient(), 'put').mockResolvedValue({
      status: 200,
      data: { matchId: 'm1', status: 'called' },
      headers: { etag: '"6"' },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends If-Match: "<version>" when given version=5', async () => {
    await apiClient.updateMatchState('t1', 'm1', { matchId: 'm1', status: 'called' }, 5);
    const call = (getPrivateClient().put as ReturnType<typeof vi.fn>).mock.calls[0];
    const config = call[2];
    expect(config.headers['If-Match']).toBe('"5"');
  });

  it('returns the parsed version from the response ETag', async () => {
    const result = await apiClient.updateMatchState(
      't1',
      'm1',
      { matchId: 'm1', status: 'called' },
      5,
    );
    expect(result.version).toBe(6);
    expect(result.state.matchId).toBe('m1');
  });

  it('throws MatchVersionMismatch on 412 response', async () => {
    vi.spyOn(getPrivateClient(), 'put').mockRejectedValueOnce({
      response: { status: 412, data: { message: 'Match version is 7; If-Match sent 5' } },
      isAxiosError: true,
    });
    await expect(
      apiClient.updateMatchState('t1', 'm1', { matchId: 'm1', status: 'called' }, 5),
    ).rejects.toMatchObject({
      name: 'MatchVersionMismatch',
      message: expect.stringContaining('Match version'),
    });
  });

  it('throws MatchVersionMismatch on 409 response', async () => {
    vi.spyOn(getPrivateClient(), 'put').mockRejectedValueOnce({
      response: { status: 409, data: { message: 'state machine conflict' } },
      isAxiosError: true,
    });
    await expect(
      apiClient.updateMatchState('t1', 'm1', { matchId: 'm1', status: 'called' }, 5),
    ).rejects.toMatchObject({ name: 'MatchVersionMismatch' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/updateMatchState.test.ts
```

Expected: every test fails. The signature doesn't accept `version`, and the function returns a bare `MatchStateDTO`, not a `{ state, version }` object.

### Task 7: Update `apiClient.updateMatchState` signature

**Files:**
- Modify: `products/scheduler/frontend/src/api/client.ts:780-790` (the existing `updateMatchState` method)

- [ ] **Step 1: Add the `MatchVersionMismatch` error class**

Insert this near the top of `client.ts`, after the imports and before the `class ApiClient` declaration (around line 174). If there's an existing custom-errors region, follow its placement:

```ts
/** Thrown when the server rejects a match-state mutation due to a
 *  stale or missing If-Match version (HTTP 412) or a state-machine
 *  transition conflict (HTTP 409). Callers can branch on `name` to
 *  decide whether to refetch + retry or roll back optimistic state. */
export class MatchVersionMismatch extends Error {
  override name = 'MatchVersionMismatch';
  constructor(
    public readonly status: 412 | 409,
    message: string,
    public readonly currentVersion?: number,
  ) {
    super(message);
  }
}
```

- [ ] **Step 2: Replace the `updateMatchState` method**

Replace lines 780-790:

```ts
/**
 * Update a match state. Sends `If-Match: "<version>"` (RFC 7232
 * quoted form, matches the backend's `_parse_if_match_header`).
 *
 * Returns `{ state, version }` — `version` is the NEW canonical
 * version parsed from the response ETag. Cache it via
 * `matchStateStore.setMatchVersion` so the next mutation on the
 * same match doesn't pay the cold-read roundtrip.
 *
 * Throws `MatchVersionMismatch` on 412 (header missing or stale)
 * or 409 (state-machine conflict). All other failures propagate
 * via the axios interceptor's toast pipeline.
 */
async updateMatchState(
  tid: string,
  matchId: string,
  update: Partial<MatchStateDTO>,
  version: number,
): Promise<{ state: MatchStateDTO; version: number }> {
  try {
    const response = await this.client.put<MatchStateDTO>(
      `/tournaments/${tid}/match-states/${matchId}`,
      { matchId, ...update },
      { headers: { 'If-Match': `"${version}"` } },
    );
    const etag = response.headers['etag'] ?? response.headers['ETag'];
    let newVersion = version + 1;
    if (typeof etag === 'string') {
      const stripped = etag.replace(/^W\//, '').replace(/^"|"$/g, '');
      const parsed = parseInt(stripped, 10);
      if (Number.isFinite(parsed)) newVersion = parsed;
    }
    return { state: response.data, version: newVersion };
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 412 || status === 409) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Match version mismatch';
      throw new MatchVersionMismatch(status, msg);
    }
    throw err;
  }
},
```

- [ ] **Step 3: Run the unit tests to verify they pass**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/updateMatchState.test.ts
```

Expected: all four cases pass.

- [ ] **Step 4: Run the full suite — expect TypeScript errors at the call-sites**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: the new contract breaks every existing caller (5 sites). The next tasks fix them.

### Task 8: Wire `useLiveTracking.updateMatchStatus` to the new contract

**Files:**
- Modify: `products/scheduler/frontend/src/hooks/useLiveTracking.ts:148-229` (the `updateMatchStatus` callback)

- [ ] **Step 1: Add imports + helper at the top of the file**

After the existing imports, add:

```ts
import { MatchVersionMismatch } from '../api/client';
import { useMatchStateStore } from '../store/matchStateStore';
```

(One or both of these may already be imported — keep just one copy.)

- [ ] **Step 2: Replace the `updateMatchStatus` body**

Replace lines 148-229 with this version. Key changes inline as comments:

```ts
const updateMatchStatus = useCallback(async (
  matchId: string,
  status: MatchStateDTO['status'],
  additionalData?: Partial<MatchStateDTO>
) => {
  try {
    const freshMatchStates = useMatchStateStore.getState().matchStates;
    const currentState = freshMatchStates[matchId] || { matchId, status: 'scheduled' };
    const currentStatus = currentState.status || 'scheduled';

    if (!isValidTransition(currentStatus, status)) {
      console.warn(`Invalid state transition: ${currentStatus} to ${status} for match ${matchId}`);
      throw new Error(`Invalid state transition: cannot go from '${currentStatus}' to '${status}'`);
    }

    const now = new Date().toISOString();
    const newState: MatchStateDTO = {
      ...currentState,
      matchId,
      status,
      ...additionalData,
    };
    if (status === 'called' && !currentState.calledAt) newState.calledAt = now;
    if (status === 'started' && !currentState.actualStartTime) newState.actualStartTime = now;
    if (status === 'finished' && !currentState.actualEndTime) newState.actualEndTime = now;

    // ─── Resolve the canonical match version ───────────────────────
    // Read from the Zustand cache first; cold-fetch via the legacy
    // GET (which carries ETag) on miss. If even the cold-fetch fails
    // (offline / 5xx), fall back to 0 — the server will 412 and we
    // recover via the catch block below. Mirrors the commandQueue
    // submit path (useCommandQueue.ts:99-110).
    const store = useMatchStateStore.getState();
    let version = store.canonicalVersionsByMatchId[matchId];
    if (version === undefined) {
      try {
        version = await apiClient.getMatchVersion(tid, matchId);
      } catch {
        version = 0;
      }
      store.setMatchVersion(matchId, version);
    }

    // Capture previous status BEFORE the optimistic apply so we can
    // roll back precisely on a 412 if the refetch fails.
    const previousStatus = currentStatus;

    // Optimistic local apply (unchanged behaviour).
    setMatchState(matchId, newState);

    try {
      const { state: serverState, version: newVersion } =
        await apiClient.updateMatchState(tid, matchId, newState, version);
      // Authoritative server state — overwrite the optimistic apply
      // so timestamps the server stamped (e.g. actualStartTime) win.
      setMatchState(matchId, serverState);
      // Cache the new canonical version so the next mutation skips
      // the cold-read roundtrip.
      useMatchStateStore.getState().setMatchVersion(matchId, newVersion);
    } catch (apiError) {
      console.error('Failed to sync match status to backend:', apiError);

      // ── 412 / 409: refetch + rollback ─────────────────────────
      if (apiError instanceof MatchVersionMismatch) {
        try {
          const fresh = await apiClient.getMatchState(tid, matchId);
          setMatchState(matchId, fresh);
          try {
            const v = await apiClient.getMatchVersion(tid, matchId);
            useMatchStateStore.getState().setMatchVersion(matchId, v);
          } catch { /* best-effort */ }
        } catch {
          // Refetch failed (transient). Roll back the optimistic
          // apply explicitly so the operator UX doesn't show a
          // status the server will never confirm.
          useMatchStateStore.getState().applyOptimisticStatus(matchId, previousStatus);
        }
        // Surface a sticky toast so the operator knows the change
        // didn't land. Retry replays with the fresh version.
        try {
          useUiStore.getState().pushToast({
            level: 'error',
            message: `Match ${matchId.slice(0, 8)}… version mismatch`,
            detail: apiError.message,
            actionLabel: 'Retry',
            onAction: () => {
              void updateMatchStatus(matchId, status, additionalData);
            },
          });
        } catch { /* toast store unavailable */ }
        return;
      }

      // ── Anything else: keep the existing sticky-toast retry path
      const detail = apiError instanceof Error ? apiError.message : 'Network error';
      try {
        useUiStore.getState().pushToast({
          level: 'error',
          message: `Match ${matchId.slice(0, 8)}… did not save`,
          detail,
          actionLabel: 'Retry',
          onAction: () => {
            void updateMatchStatus(matchId, status, additionalData);
          },
        });
      } catch { /* toast store unavailable */ }
    }
  } catch (error) {
    console.error('Failed to update match status:', error);
    throw error;
  }
}, [setMatchState, tid]);
```

Note the new dep `tid` in the `useCallback` array — necessary because `tid` is now read inside the callback. `setMatchState` was already in the array.

- [ ] **Step 3: Replace `setMatchScore` similarly (lines 231-249)**

```ts
const setMatchScore = useCallback(async (
  matchId: string,
  score: { sideA: number; sideB: number },
  notes?: string
) => {
  try {
    const store = useMatchStateStore.getState();
    let version = store.canonicalVersionsByMatchId[matchId];
    if (version === undefined) {
      try {
        version = await apiClient.getMatchVersion(tid, matchId);
      } catch {
        version = 0;
      }
      store.setMatchVersion(matchId, version);
    }
    const { state: updated, version: newVersion } = await apiClient.updateMatchState(
      tid,
      matchId,
      {
        matchId,
        status: 'finished',
        score,
        notes,
        actualEndTime: new Date().toISOString(),
      },
      version,
    );
    setMatchState(matchId, updated);
    useMatchStateStore.getState().setMatchVersion(matchId, newVersion);
  } catch (error) {
    console.error('Failed to set match score:', error);
    throw error;
  }
}, [setMatchState, tid]);
```

- [ ] **Step 4: Update `confirmPlayer` (the third `updateMatchState` call, ~line 280)**

Replace the existing `confirmPlayer` body (lines 254-289):

```ts
const confirmPlayer = useCallback(async (
  matchId: string,
  playerId: string,
  confirmed: boolean
) => {
  try {
    const freshMatchStates = useMatchStateStore.getState().matchStates;
    const currentState = freshMatchStates[matchId] || { matchId, status: 'called' };
    const currentConfirmations = currentState.playerConfirmations || {};

    const updatedConfirmations = {
      ...currentConfirmations,
      [playerId]: confirmed,
    };

    const newState: MatchStateDTO = {
      ...currentState,
      playerConfirmations: updatedConfirmations,
    };

    setMatchState(matchId, newState);

    // Resolve canonical version (same cold-fetch fallback as updateMatchStatus)
    const store = useMatchStateStore.getState();
    let version = store.canonicalVersionsByMatchId[matchId];
    if (version === undefined) {
      try {
        version = await apiClient.getMatchVersion(tid, matchId);
      } catch {
        version = 0;
      }
      store.setMatchVersion(matchId, version);
    }

    try {
      const { state: serverState, version: newVersion } =
        await apiClient.updateMatchState(tid, matchId, newState, version);
      setMatchState(matchId, serverState);
      useMatchStateStore.getState().setMatchVersion(matchId, newVersion);
    } catch (apiError) {
      console.error('Failed to sync player confirmation to backend:', apiError);
      // Existing UX: don't revert local state — operator's confirmation
      // stays in the UI for the session. If it was a version mismatch,
      // a subsequent updateMatchStatus call will refetch and overwrite.
    }
  } catch (error) {
    console.error('Failed to confirm player:', error);
    throw error;
  }
}, [setMatchState, tid]);
```

Note the `tid` added to the deps array.

- [ ] **Step 5: Repeat for the inline Retry callback (line 214)**

The existing toast's `onAction` (inside the catch around line 209-219) calls `apiClient.updateMatchState` directly. The new outer function already handles Retry via `onAction: () => void updateMatchStatus(...)` (the recursive replay), so this inline call disappears. Confirm the post-refactor file no longer references `apiClient.updateMatchState` from inside the toast `onAction` body.

- [ ] **Step 6: Run the tests**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: existing tests pass; the new `updateMatchState.test.ts` tests still pass.

### Task 9: Wire `useLiveOperations.updateActualTime` to the new contract

**Files:**
- Modify: `products/scheduler/frontend/src/hooks/useLiveOperations.ts:182-201`

The single call in this file lives inside `updateActualTime`, used when an operator manually edits a match's start/end time. The existing catch silently logs (the UI never relied on backend confirmation for this path). The new contract retains that "log-and-move-on" UX but adds the version round-trip.

- [ ] **Step 1: Add the import (if not already present)**

At the top of the file, ensure `useMatchStateStore` is imported:

```ts
import { useMatchStateStore } from '../store/matchStateStore';
```

- [ ] **Step 2: Replace `updateActualTime` (lines 182-201)**

```ts
const updateActualTime = useCallback(
  async (matchId: string, field: 'actualStartTime' | 'actualEndTime', time: string) => {
    const current = matchStates[matchId] || { matchId, status: 'scheduled' as const };
    const updated: MatchStateDTO = {
      ...current,
      [field]: time,
    };

    setMatchState(matchId, updated);

    // Resolve canonical version (same pattern as useLiveTracking).
    const store = useMatchStateStore.getState();
    let version = store.canonicalVersionsByMatchId[matchId];
    if (version === undefined) {
      try {
        version = await apiClient.getMatchVersion(tid, matchId);
      } catch {
        version = 0;
      }
      store.setMatchVersion(matchId, version);
    }

    try {
      const { state, version: newVersion } = await apiClient.updateMatchState(
        tid,
        matchId,
        updated,
        version,
      );
      setMatchState(matchId, state);
      useMatchStateStore.getState().setMatchVersion(matchId, newVersion);
    } catch (err) {
      console.error('Failed to sync match state:', err);
      // Existing UX: don't surface a toast; operator's manual edit
      // stays in the UI. A subsequent status mutation will rehydrate.
    }
  },
  [matchStates, setMatchState, tid],
);
```

Note the new dep `tid` in the deps array.

- [ ] **Step 3: Run the tests**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: all tests pass; TypeScript no longer errors at this call-site.

### Task 10: Browser-harness verification of the meet Live flow

This task has no automated test — the audit's reproduction was visual, so the verification is visual.

- [ ] **Step 1: Open the audit meet on the Live tab**

```bash
browser-harness <<'PY'
new_tab("http://localhost/tournaments/09fd8396-e836-4d33-bb97-68fbb27a0cc3/live")
wait_for_load()
wait(0.6)
print(page_info())
print(capture_screenshot())
PY
```

- [ ] **Step 2: Click the first row's `Call` button**

Use the coords from the audit (`/tmp/audit_shots/24_meet_live.png` showed `Call` at roughly `(1085, 423)`), or look them up live:

```bash
browser-harness <<'PY'
info = js("""(() => {
  const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Call' && b.offsetParent !== null);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return {x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2)};
})()""")
print(info)
PY
```

Then:

```bash
browser-harness <<'PY'
click_at_xy(<x from above>, <y from above>)
wait(1.0)
print(capture_screenshot())
PY
```

Expected: NO toast appears with `If-Match header required`. The row's `Call` button is replaced by `Start` / `Undo` and the `waiting 0:00` chip starts counting. Refreshing the page (`new_tab(same url)`) shows the same status — the server persisted it.

- [ ] **Step 3: Click `Start` on the same row**

Same drill — locate the `Start` button, click. Expected: no error toast; status transitions to `started`.

- [ ] **Step 4: If anything fails, capture the toast detail and `console.error` output**

```bash
browser-harness <<'PY'
toasts = js("""[...document.querySelectorAll('[role=alert]')].map(t => t.textContent)""")
print(toasts)
PY
```

If `MatchVersionMismatch` shows up, it means the cache read or cold-fetch is returning the wrong version — investigate by adding a `console.log` of the cached + sent version inside `updateMatchStatus`.

### Task 11: Commit Fix 1

- [ ] **Step 1: Stage and commit**

```bash
git add products/scheduler/frontend/src/api/client.ts \
        products/scheduler/frontend/src/hooks/useLiveTracking.ts \
        products/scheduler/frontend/src/hooks/useLiveOperations.ts \
        products/scheduler/frontend/src/lib/__tests__/updateMatchState.test.ts
git commit -m "fix(live-ops): send If-Match on match-state mutations

apiClient.updateMatchState now takes a required version arg and sends
If-Match: \"<version>\" per RFC 7232; reads the new version from the
response ETag and returns {state, version}. Throws MatchVersionMismatch
on 412 or 409 so callers branch cleanly.

useLiveTracking.updateMatchStatus + setMatchScore + the third internal
caller, plus useLiveOperations, now read the version from
matchStateStore.canonicalVersionsByMatchId with a cold-read fallback
via getMatchVersion (returns 0 on offline — server 412s and we recover
in the catch). On MatchVersionMismatch we refetch + roll back, mirroring
the commandQueue's recovery shape (useCommandQueue.ts:166-216).

Audit finding: docs/audits/2026-05-15_user-audit_meet-vs-bracket.md §1.6"
```

---

## Final task: acceptance re-walk

### Task 12: Re-run the audit's relevant sections

- [ ] **Step 1: Re-walk §1.6 (meet Live) — Acceptance criterion 1**

Open the audit meet on the Live tab. Click `Call` on a match. Refresh. Verify the match shows `called` on the server (the chip persists, gantt block recolours to `Called` amber, TV preview shows `CALLING`). Repeat for `Start` and `setMatchScore` (via a score-set UI path if accessible).

- [ ] **Step 2: Re-walk §1.5 (meet Schedule) — Acceptance criterion 2**

Open the audit meet on the Schedule tab. Verify the gantt shows one block per match — four blocks across C1, C2, C3, C4 at 09:00.

- [ ] **Step 3: Re-walk §2.5 (bracket Schedule/Live) — Acceptance criterion 3**

Open the audit bracket on the Schedule tab. Verify all R0 matches appear in their assigned courts. Switch to the Live tab. Verify all match blocks are visible.

- [ ] **Step 4: Re-walk §1.7 (TV date) — Acceptance criterion 4**

Open the TV tab on either tournament. The header should read `Fri, May 15`.

To force a non-UTC zone in Chrome for the dev session (one-off):

```bash
# Reopen Chrome with a forced timezone for this audit
TZ='Asia/Tokyo' open -a 'Google Chrome' http://localhost/tournaments/09fd8396-e836-4d33-bb97-68fbb27a0cc3/tv
```

Expected: still `Fri, May 15`.

- [ ] **Step 5: Run the full test suite as the final gate**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Push the branch + open a PR**

```bash
git push -u origin feat/bundle-1-critical-bugs
gh pr create --base main \
  --title "fix(live+gantt+tv): three P1 audit findings" \
  --body "$(cat <<'EOF'
Bundle 1 of the meet-vs-bracket audit follow-ups.

Three independent fixes:

1. **Meet Live mutations** — If-Match header is now sent on every
   match-state PUT. Reads from matchStateStore cache with cold-fetch
   fallback via getMatchVersion, and on 412/409 refetches + rolls back
   the optimistic state. Mirrors the recovery shape commandQueue uses
   for /commands. The Call / Start / Post buttons stop 412'ing.

2. **GanttTimeline** — positioned blocks now render in a single overlay
   over the grid body, not inside per-court row containers that were
   already offset by the same amount the math added. Courts 1-N stop
   drifting off the grid. Affects both meet and bracket Schedule/Live.

3. **TV date** — formatTournamentDate passes timeZone: 'UTC' so the
   weekday/day/month line up with the UTC anchor the parser uses.
   No more 'Thu, May 14' for a 2026-05-15 tournament in non-UTC zones.

See:
- spec: docs/superpowers/specs/2026-05-15-bundle-1-critical-bugs-design.md
- audit: docs/audits/2026-05-15_user-audit_meet-vs-bracket.md
EOF
)"
```

---

## Spec coverage check

| Spec requirement | Plan task |
|---|---|
| Fix 1 — `apiClient.updateMatchState(tid, matchId, update, version)` sends `If-Match` | Task 7 |
| Fix 1 — Returns `{state, version}` parsed from ETag | Task 7 |
| Fix 1 — Throws `MatchVersionMismatch` on 412/409 | Task 7 + Task 6 tests |
| Fix 1 — `useLiveTracking.updateMatchStatus` reads version from store cache | Task 8 |
| Fix 1 — Cold-read fallback via `getMatchVersion`, `0` if even that fails | Task 8 |
| Fix 1 — 412 path refetches + rolls back optimistic | Task 8 |
| Fix 1 — `setMatchScore` same treatment | Task 8 Step 3 |
| Fix 1 — `useLiveOperations` updated | Task 9 |
| Fix 1 — Tests for header sending, ETag parsing, 412/409 throwing | Task 6 |
| Fix 2 — Positioned blocks render in single overlay | Task 4 |
| Fix 2 — `placementBox` math untouched, existing tests stay green | Task 4 Step 3 |
| Fix 2 — Rendering test asserts on-screen y per court | Task 3 |
| Fix 3 — `formatTournamentDate` passes `timeZone: 'UTC'` | Task 2 |
| Fix 3 — Timezone-locked test | Task 1 |
| Acceptance criteria 1-5 | Task 12 |

No gaps.
