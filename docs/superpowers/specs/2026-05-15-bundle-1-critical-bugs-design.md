# Bundle 1 — Critical bug fixes (design)

**Date**: 2026-05-15
**Status**: design / awaiting approval
**Source**: `docs/audits/2026-05-15_user-audit_meet-vs-bracket.md` (findings P1.1, P1.2, P2.TV-date)

## Goal

Restore correctness on three production-blocking surfaces:

1. The meet **Live** tab — operators cannot call / start / post matches; every mutation 412s with `If-Match header required for match mutations`.
2. The shared **GanttTimeline** — half of all match blocks are invisible on both meet's Schedule/Live and bracket's Schedule/Live (court 0 always renders; courts 1+ drift off the rendered area).
3. The **TV** date header — shows the day before the tournament for any user east of UTC.

## Non-goals

- Migrating Call/Start/Post off the legacy `PUT /match-states/{id}` route onto the newer `/commands` API. (Bigger refactor; tracked separately.)
- Implementing TV `Schedule` / `Standings` view tabs.
- Setup auto-save, bracket roster bulk-import, picker overflow, or any other audit finding outside the three above.
- Visual / chrome unification between meet and bracket. (Bundle 2.)

## Fix 1 — `If-Match` header on match-state mutations

### Files touched
- `products/scheduler/frontend/src/api/client.ts` — `updateMatchState`
- `products/scheduler/frontend/src/hooks/useLiveTracking.ts` — `updateMatchStatus`, `setMatchScore`
- `products/scheduler/frontend/src/store/matchStateStore.ts` — no behavioral change; consumed for `canonicalVersionsByMatchId` + `setMatchVersion`
- Tests: `products/scheduler/frontend/src/lib/__tests__/updateMatchState.test.ts` (new)

### Behavior

#### `apiClient.updateMatchState(tid, matchId, update, version)`

Adds a required-in-practice fourth argument `version: number`. Sends:

```http
PUT /tournaments/{tid}/match-states/{matchId}
If-Match: "<version>"
```

On 200 OK, parses the response `ETag` header (same shape as `getMatchVersion`: optional `W/` prefix, optional quotes, integer body), returns `{ state, version }`.

On 412 or 409, throws a typed error `MatchVersionMismatch { current?: number, message: string }` so callers can branch on it rather than parsing strings.

On any other non-2xx, throws as today (axios interceptor toasts).

#### `useLiveTracking.updateMatchStatus(matchId, status, additionalData)`

Before the optimistic apply:

1. Capture `previousStatus = matchStates[matchId]?.status ?? 'scheduled'` (already done; preserved).
2. Resolve the canonical version:
   - Read from `matchStateStore.canonicalVersionsByMatchId[matchId]`.
   - If undefined, call `apiClient.getMatchVersion(tid, matchId)`.
   - If both fail → `version = 0`. The server will 412; we fall through to the conflict path below. **This is the documented fallback** (mirrors `useCommandQueue.ts:107`).
3. Apply optimistic state (unchanged).

After the PUT:

- **2xx**: `setMatchVersion(matchId, response.version)`. Continue as today.
- **`MatchVersionMismatch`**: same recovery shape as `useCommandQueue` (lines 166–195):
  - `clearPendingCommand(matchId)` is not relevant here (we don't enqueue), but we DO need to roll back the optimistic apply. Call `setMatchState(matchId, fresh)` after refetching `apiClient.getMatchState`, then refresh `setMatchVersion` from a fresh `getMatchVersion`. On refetch failure, `applyOptimisticStatus(matchId, previousStatus)` so the UI doesn't lie.
  - Surface the existing sticky error toast with a `Retry` action that re-invokes `updateMatchStatus` with the same args (which now has the refreshed cache). Today's toast already does this; we keep it.
- **Other errors**: unchanged — sticky toast with Retry, no rollback.

`setMatchScore` (same file, lines 231–249) gets the same treatment: read version, pass it, react to mismatch. Smaller surface — only one call-site, no optimistic apply to roll back, but the server still requires `If-Match`.

### Tests
- Mocked-axios test that `updateMatchState` sends `If-Match: "5"` when passed `version=5`.
- Mocked-axios test that a 412 response is converted to a `MatchVersionMismatch` throw.
- Mocked-axios test that the response `ETag: "6"` is parsed and returned.
- `useLiveTracking.updateMatchStatus` unit test (renderHook + vitest) that a cache-cold first call routes through `getMatchVersion` exactly once, then through `setMatchVersion` on success.
- Integration-shaped test that on `MatchVersionMismatch`, `applyOptimisticStatus(_, previousStatus)` is called (rollback) when the post-mismatch refetch ALSO fails.

## Fix 2 — Stop double-positioning GanttTimeline blocks

### Files touched
- `packages/design-system/components/GanttTimeline.tsx`
- Tests: `products/scheduler/frontend/src/lib/__tests__/ganttTimeline.test.ts` (extend; existing assertions stay green)
- Optionally: a render-level test using `@testing-library/react` to assert the on-screen `top` of a block matches the court row's `top`.

### Behavior

`placementBox` is correct and stays untouched — `top = courtIndex × tier.row` is an **absolute-from-grid-origin** coordinate, consistent with `left` being absolute-from-mesh-origin. The bug is that the render loop places `PositionedBlock` inside a per-court row container that's already offset by `courtIndex × tier.row`, so the absolute child gets shifted twice.

**Structural fix**: render positioned blocks in **one absolute overlay** that covers the entire grid body (below the time-header, above the per-row mesh and `renderRow` decoration). Court rows continue to render their bg, mesh, and `renderRow`. Blocks no longer live inside row containers.

Pseudocode of the new layout:

```tsx
<div className="overflow-x-auto">
  <div style={{ width: gridWidth }}>
    {/* Time-header row — unchanged */}
    <div className="flex border-b …">…</div>

    {/* NEW: grid body wrapper, position:relative, so the blocks overlay positions against it */}
    <div className="relative" style={{ width: gridWidth, height: courts.length * tier.row }}>
      {/* Court rows: bg + mesh + renderRow. No blocks here. */}
      {courts.map((courtId, courtIndex) => (
        <div className="relative flex border-b …" style={{ height: tier.row }}>
          {/* left label, mesh, renderRow — unchanged */}
        </div>
      ))}

      {/* Single overlay for all positioned blocks. Sits OVER all rows. */}
      <div
        className="pointer-events-none absolute top-0 bottom-0"
        style={{ left: tier.label, right: 0 }}
      >
        {placements.map(p => (
          <PositionedBlock
            key={p.key}
            placement={p}
            box={boxByKey.get(p.key)!}
            renderBlock={renderBlock}
          />
        ))}
      </div>
    </div>
  </div>
</div>
```

Notes:

- The overlay's `left: tier.label` accounts for the court-label column so `box.left` (which already represents "from mesh origin") aligns correctly without further math.
- `pointer-events-none` on the overlay keeps cell-click semantics intact; we re-enable pointer events on each `PositionedBlock` via `pointer-events: auto` so blocks remain clickable.
- The existing `byCourtIndex` memo (line 243) is **replaced** with a single flat `boxByKey: Map<string, GanttBlockBox>` memo'd off the same dependencies (`placements`, `minSlot`, `tier`). Each `box` reference stays identity-stable across renders for unchanged placements, so `PositionedBlock`'s `React.memo` continues to bail out the same way it does today.

### Tests

- The existing `placementBox` unit tests (assert `top: 80` for `courtIndex=2`, etc.) **continue to pass** — we did not change the math.
- New rendering test (`@testing-library/react`):
  - Mount `<GanttTimeline courts={[1,2,3,4]} placements={...4 blocks across 4 courts...} />`.
  - For each block, read the rendered element's `style.top` and assert it equals `courtIndex × 40` and that it matches the y of the corresponding court-label cell.
  - Specifically guards against the regression observed in audit: blocks for court 2/3/4 land *inside* their row, not below.

## Fix 3 — TV date off-by-one

### Files touched
- `products/scheduler/frontend/src/pages/publicDisplay/helpers.ts` — `formatTournamentDate`
- Tests: `products/scheduler/frontend/src/pages/publicDisplay/__tests__/helpers.test.ts` (new)

### Behavior

```diff
 export function formatTournamentDate(iso: string | null | undefined): string | null {
   if (!iso) return null;
   const d = new Date(iso);
   if (Number.isNaN(d.getTime())) return null;
   return d.toLocaleDateString(undefined, {
+    timeZone: 'UTC',
     weekday: 'short',
     month: 'short',
     day: 'numeric',
   });
 }
```

Rationale: bare `YYYY-MM-DD` parses as UTC midnight per ECMA-262. Formatting with `timeZone: 'UTC'` keeps the weekday/month/day aligned to the same UTC anchor regardless of the viewer's local zone.

### Tests

- `formatTournamentDate('2026-05-15')` returns `"Fri, May 15"` (asserted in three forced timezones: `UTC`, `America/Los_Angeles`, `Asia/Tokyo` via `process.env.TZ` rewrite or vitest's `vi.stubGlobal`).
- `formatTournamentDate(null)` → `null` (existing behavior, regression guard).
- `formatTournamentDate('not-a-date')` → `null` (existing behavior, regression guard).

## Acceptance criteria

The bundle is done when:

1. From the meet Live tab, clicking `Call` on a scheduled match transitions the match to `called` on the server (verified by refresh) without surfacing the `If-Match required` toast. Same for `Start`, `Post`, and `setMatchScore`.
2. On a meet with 4 matches scheduled across 4 courts, the Schedule and Live gantt views show 4 distinct blocks, one per court row, at the correct y position.
3. On a bracket SE event with 4 R0 matches assigned to courts 1–4, the bracket Schedule and Live views show all 4 blocks.
4. A tournament created with `tournament_date = "2026-05-15"` shows `Fri, May 15` in the TV header in `UTC`, `America/Los_Angeles`, and `Asia/Tokyo`.
5. All existing tests pass. New tests added per each fix above pass.
6. Browser-harness re-walk of the meet audit's §1.6 (Live) and §1.7 (TV) and the bracket audit's §2.5 (Schedule/Live grid) confirms the fixes visually.

## Risks / unknowns

- **`apiClient.updateMatchState` is called from other surfaces I haven't enumerated.** First step of the implementation plan: `rg -n "updateMatchState\b" products/scheduler/frontend/src` and update every call-site to pass `version`. Decision: `version` is a **required** argument (not optional-with-fallback) so the compiler surfaces every miss. The cold-cache fallback to `0` lives in the caller (`useLiveTracking`), not in the API client.
- **Pointer-events tweak on the gantt overlay** must not break the existing meet drag-Gantt interaction. The `LiveTimelineGrid` and `DragGantt` consumers go through the same scaffold; the implementation plan validates both paths.
- **`vi.stubGlobal('Intl', …)`** is one approach for forcing timezones in vitest; an alternative is running the test with `TZ=Asia/Tokyo` env var. Decide at plan time.

## Out of scope reminder

This bundle is bug fixes only. The audit's other findings (TV Schedule/Standings tabs, "Configure display" link target, Setup defaults persistence, bracket Events row affordance, bracket Roster bulk-import, meet picker overflow, sticky `RECONNECTING…` badge, and the entire chrome-unification ask) live in Bundles 2 and 3.
