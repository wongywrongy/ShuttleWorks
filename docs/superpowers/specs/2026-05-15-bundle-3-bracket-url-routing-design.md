# Bundle 3 — Bracket URL routing parity (design)

**Date**: 2026-05-15
**Status**: design / approved (chat 2026-05-15)
**Source**: user audit `docs/audits/2026-05-15_user-audit_meet-vs-bracket.md` (§1 finding "URL/state desync — URL stays at `/setup?section=share` while the tab bar shows Roster active") + user complaint "going in al setup should be in setup it currently redirects which is bad ui/ux".

## Goal

Make every tab in both meet and bracket surfaces deep-linkable, refresh-safe, and shareable. Eliminate the "click into a bracket tournament → URL says `/bracket` regardless of which sub-tab you're on" confusion. Bring the meet's URL handling to the same standard along the way (today its tabs also don't update the URL on click, which the audit flagged).

## Non-goals

- Decomposing `BracketTab` into per-route components. The single-component dispatch stays in place; this bundle is purely URL/route wiring.
- Moving `eventId`, `selectedPlayUnitId`, `useBracket`, or `BracketViewHeader` out of `BracketTab`. All shared state stays where it is.
- New tab content. No new components are added beyond what's needed to make `<Navigate>` work for the legacy redirect.
- Meet URL segments. `/setup`, `/roster`, `/matches`, `/schedule`, `/live`, `/tv` continue to map to today's components.
- "Configure display" → wrong-section deep-link bug (audit §1.7) — separate query-string concern; not in scope here.
- The `?section=` query string used by the meet's Setup sidebar — unchanged.

## URL scheme

Each `AppTab` id maps 1:1 to its URL segment. No shared segments between kinds; no special-case translations.

| Kind | Tab ids | URL segments |
|---|---|---|
| meet | `setup`, `roster`, `matches`, `schedule`, `live`, `tv` | `/setup`, `/roster`, `/matches`, `/schedule`, `/live`, `/tv` (unchanged) |
| bracket | `bracket-setup`, `bracket-roster`, `bracket-events`, `bracket-draw`, `bracket-schedule`, `bracket-live` | `/bracket-setup`, `/bracket-roster`, `/bracket-events`, `/bracket-draw`, `/bracket-schedule`, `/bracket-live` (new) |
| legacy | `bracket` (internal-only after this bundle) | `/bracket` → redirect to `/bracket-setup` (backwards compat) |

After this bundle, `'bracket'` is no longer a valid `activeTab` value — only the six prefixed ids are. `TournamentPage`'s special-case `segment === 'bracket' ? 'bracket-setup' : segment` mapping is removed.

## Architecture

### Tab click → URL sync (new)

`TabBar.tsx` button `onClick` becomes:

```ts
onClick={() => {
  if (tid && !isDisabled) {
    navigate(`/tournaments/${tid}/${tab.id}`, { replace: true });
  }
  setActiveTab(tab.id);
}}
```

- `navigate` from `useNavigate()` (already imported elsewhere in the codebase).
- `tid` from `useTournamentId()`.
- `{ replace: true }` so tab-switching doesn't accumulate history entries — back-button jumps from any tab back to where the operator came from (dashboard, deep link, etc.), not to the previously visited tab. Addresses the original `TournamentPage` author's "back/forward-button surprise" caveat directly.
- Disabled tabs are still no-ops on click (existing `isDisabled` check preserved).
- `setActiveTab` is kept on the same handler. The store update + URL change are co-fired so the active-pill underline updates instantly without waiting for the URL→store sync loop.

This single change applies to both meet tabs and bracket tabs in the same `TabBar` — no kind-specific branch.

### URL → store sync (cleanup)

`TournamentPage.tsx` already has a `useLayoutEffect` that reads the trailing URL segment and sets `activeTab`. Two simplifications:

1. **Drop the `'bracket' → 'bracket-setup'` translation.** Each URL segment is now exactly the tab id. The set of recognized segments becomes `MEET_TAB_IDS ∪ BRACKET_TAB_IDS` (`bracketTabs.ts` exports both).
2. **Optimistic-kind derivation.** Today: `segment === 'bracket' ? 'bracket' : 'meet'`. New: `segment.startsWith('bracket-') ? 'bracket' : 'meet'`.

The existing `normalizeActiveTab` snap-on-kind-load behavior in `bracketTabs.ts` stays as-is — its job is to recover from stale `activeTab` values when kind flips (e.g. operator navigates between a meet and a bracket via the dashboard). It already snaps unknown bracket tabs to `'bracket-setup'`.

### Backwards-compat redirect

Old `/tournaments/:id/bracket` URLs (the dashboard had been emitting these; any shared links and bookmarks live in operator inboxes) must continue to work. Add a route inside `App.tsx`:

```tsx
<Route
  path="/tournaments/:id/bracket"
  element={<Navigate to="bracket-setup" replace />}
/>
```

`<Navigate>` is relative; the `replace` swap keeps history clean (the operator doesn't land on a back-button stop pointing at the legacy URL).

If `App.tsx`'s `<Routes>` ordering matters — and React Router 6 is strict about most-specific wins — this redirect route sits BEFORE the catch-all `/tournaments/:id/*` route. Verify on the implementation pass.

### Dashboard "Open" button

`TournamentListPage.openTournament` today:

```ts
const segment = t?.kind === 'bracket' ? 'bracket' : 'setup';
navigate(`/tournaments/${id}/${segment}`);
```

becomes:

```ts
const segment = t?.kind === 'bracket' ? 'bracket-setup' : 'setup';
navigate(`/tournaments/${id}/${segment}`);
```

Same shape, just the bracket segment swaps from the legacy `'bracket'` to the new `'bracket-setup'`. Bonus: the dashboard now lands on a real sub-tab URL instead of one that immediately redirects.

### Create-tournament flow

`TournamentListPage.handleCreate` today:

```ts
const destination = newKind === 'bracket' ? 'bracket' : 'setup';
navigate(`/tournaments/${created.id}/${destination}`);
```

becomes:

```ts
const destination = newKind === 'bracket' ? 'bracket-setup' : 'setup';
navigate(`/tournaments/${created.id}/${destination}`);
```

Same one-token swap.

## Files touched

| File | Change |
|---|---|
| `products/scheduler/frontend/src/app/TabBar.tsx` | `onClick` handler co-fires `navigate(...)` with `setActiveTab`; uses `replace` |
| `products/scheduler/frontend/src/pages/TournamentPage.tsx` | Drop `'bracket' → 'bracket-setup'` mapping; broaden recognized segments to `MEET_TAB_IDS ∪ BRACKET_TAB_IDS`; switch optimistic-kind to `startsWith('bracket-')` |
| `products/scheduler/frontend/src/app/App.tsx` | Add `<Route path="/tournaments/:id/bracket">` legacy-redirect to `bracket-setup` |
| `products/scheduler/frontend/src/pages/TournamentListPage.tsx` | `openTournament` + `handleCreate` segments swap `'bracket'` → `'bracket-setup'` |
| `products/scheduler/frontend/src/lib/bracketTabs.ts` | No behavioral change; verify exports include both id sets |
| Tests: 1-2 new test files | See Testing section |

## Testing

### Unit / integration tests

- **`TabBar.test.tsx`** (extend existing if present, else new file):
  - Clicking a meet tab calls `navigate('/tournaments/t1/<id>', { replace: true })` AND `setActiveTab('<id>')`.
  - Clicking a bracket tab does the same with the bracket-prefixed segment.
  - Clicking a DISABLED tab is a no-op (no navigate, no setActiveTab).
- **`TournamentPage.test.tsx`** (extend or new):
  - Mounting at `/tournaments/t1/bracket-roster` sets `activeTab = 'bracket-roster'` and `activeTournamentKind = 'bracket'` before paint.
  - Mounting at `/tournaments/t1/setup` sets `activeTab = 'setup'` and kind `meet`.
  - Mounting at `/tournaments/t1/bracket` (legacy) lands on `/bracket-setup` (the redirect resolves; final URL ends in `/bracket-setup`).
- **`bracketTabs.test.ts`**: existing assertions still hold; the helper isn't behaviorally changed. Add one case: `normalizeActiveTab('bracket', 'bracket')` returns `'bracket-setup'` (post-bundle, the bare `'bracket'` activeTab should be treated as stale and snapped).

### Manual browser walk

- Click into a bracket tournament from the dashboard → URL is `/tournaments/X/bracket-setup`. No flicker through `/bracket`.
- Click Roster → URL is `/tournaments/X/bracket-roster`. Refresh → still on Roster.
- Hit the old `/tournaments/X/bracket` URL by hand → redirects to `/bracket-setup`.
- Browser back from `/bracket-live` lands on the dashboard, NOT on `/bracket-schedule` (replace semantics).
- Open a meet tournament → click between Setup/Roster/Matches/Schedule/Live/TV → URL updates each time. Refresh on any of them lands on the same tab.

## Acceptance criteria

The bundle is done when:

1. The URL trailing segment matches the active tab id 1:1 for every tab in both surfaces, for every interaction path (click, deep link, refresh).
2. Old `/tournaments/X/bracket` URLs redirect to `/tournaments/X/bracket-setup` without an interactive intermediate stop.
3. The dashboard's Open button on a bracket tournament navigates to `/bracket-setup` directly (not `/bracket`).
4. The Create dialog for a bracket tournament navigates to `/bracket-setup` directly.
5. Tab clicks use `{ replace: true }` so back-button doesn't accumulate per-tab stops.
6. All existing tests pass. The new tests added in this bundle pass.
7. Manual walk: every step in the "Manual browser walk" section above passes.

## Risks / unknowns

- **`<Navigate>` query-string preservation.** React Router 6 `<Navigate>` with a relative path preserves the rest of the URL but I want to double-check the behavior for `?` query params (e.g. `/bracket?event=MS-1`). Implementation will verify; fallback is an inline redirect inside `TournamentPage` that explicitly preserves `location.search`.
- **Operator's open tab pool.** Operators who have multiple tournament tabs open at once may see the URL update on tab-switch in any one of them surprising. Mitigated by `replace`; no extra back-stops mean no surprise on back. No mitigation needed beyond docs.
- **Tab-click → URL nav loop.** The new `onClick` calls both `setActiveTab` AND `navigate`. The URL change re-triggers the `useLayoutEffect` in `TournamentPage`, which calls `setActiveTab` again with the same value. Zustand should bail out on same-value sets (it does), but if there's any subscribed selector with reference instability we could get a re-render. Acceptable cost; flag in code review.
- **`bracket-tabs.ts` schema.** The `AppTab` union currently includes `'bracket'` as a sentinel for "URL says bracket, normalize me". Removing `'bracket'` from `AppTab` could break callers — `bracketTabs.ts` normalization treats it as the stale-but-known case. Plan: leave `'bracket'` in `AppTab` but stop emitting it as a tab id; `normalizeActiveTab` continues to snap it to `'bracket-setup'` for safety on legacy URL fallback.

## Out of scope reminder

The audit's remaining smaller findings (TV Schedule/Standings tabs, Configure-display link target, Setup defaults dirty-state, bracket Roster bulk-import, bracket Events row-clickable, picker overflow on rightmost meet column, sticky RECONNECTING badge) live in a future Bundle 4. Bracket Setup chrome parity (extending Bundle 2's pattern to the Setup tab) also stays a future bundle.
