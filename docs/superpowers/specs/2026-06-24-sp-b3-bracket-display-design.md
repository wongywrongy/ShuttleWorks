# SP-B3 — Bracket Display — design

**Date:** 2026-06-24
**Status:** accepted (pending user spec review)
**Branch:** `dev/workspace-suite`
**Program:** "Control Plane First" → expanded SP-B (real multi-module workspaces).
SP-B3 is the **final** piece: make the Display module usable on a bracket workspace.
Backend (trivial, mirrors SP-B2) + a real frontend half (a new read-only, modular
bracket display surface).

## Goal

The public display (`/display?id=` + the in-shell `tv` surface, both rendered by
`PublicDisplayPage`) is today entirely meet-oriented (`courts | schedule | standings`
from the meet state blob); it has no bracket awareness, and `display` is seeded
`coming_soon` on a bracket workspace. SP-B3:

1. Flips bracket → `display` from `coming_soon` to `available` (so Display can be
   enabled on a bracket workspace, like SP-B2 did for the foreign operator).
2. Adds a **new read-only, modular bracket display**: when the director enables
   Display on a bracket workspace, the TV can show **live matches**, a **draw tree**,
   or **results** — the director chooses the view. The Bracket operator components
   are left untouched.

## Decisions locked in brainstorming

- **Customizable / modular:** three selectable, read-only TV views — **Live**,
  **Draw**, **Results** — the director picks the active one (extending the existing
  `?view=` switcher); designed so more views can be added later.
- **New read-only surface** (not reusing the interactive `DrawView`/`LiveView`): the
  Bracket operator components keep their pin/result interactivity and stay untouched;
  the display gets dedicated read-only components.
- **Branch by `kind`:** a bracket workspace → the bracket display; a meet workspace →
  today's meet display, unchanged.
- **Auth is unchanged:** `GET /tournaments/:id/bracket` is `viewer`-gated exactly like
  the meet display's `GET /state`, so the bracket display works in the same
  logged-in-browser context as the meet display today.

## Part 1 — Backend (mirrors SP-B2)

### `derive_modules` (`backend/database/models.py`)

```python
if kind == "bracket":
    return {"bracket": "enabled", "meet": "available", "display": "available"}
# meet and unknown / None:
return {"meet": "enabled", "bracket": "available", "display": "available"}
```

Only the bracket branch changes: `display` `coming_soon` → `available`. After SP-B3,
`display` is `available` for both kinds. Enabling it follows the existing PATCH path —
`display_dependency_satisfied` already permits enabling `display` when an operator
(bracket) is enabled, and `coming_soon` is no longer in the way.

### Alembic migration

New revision chaining after the current head (`i2d6e8f0a4b7` from SP-B2):
`down_revision = "i2d6e8f0a4b7"`. Upgrade:

```sql
UPDATE workspace_modules SET status = 'available'
 WHERE module_id = 'display' AND status = 'coming_soon';
```

This promotes existing bracket workspaces' `display` rows. (Only bracket workspaces
have a `coming_soon` display row, so scoping to `module_id = 'display'` is exact.)
Downgrade is a documented no-op (lossy, same rationale as SP-B2).

### Frontend derive parity (`moduleModel.modulesForWorkspace`)

The `display` branch becomes `available` for both kinds:
`if (id === 'display') return 'available';` (drop the `isBracket ? 'coming-soon'`
case). Update the `modulesForWorkspace('bracket')` display assertion in
`moduleModel.test`. The bracket-display `moduleNote('display','coming-soon')` copy
("Display for bracket workspaces is coming.") is now unreachable from derive; leave
the note function as-is (still valid if a DTO ever sends `coming_soon`).

## Part 2 — Frontend bracket display

All new code lives under `products/display/bracketDisplay/`; the meet display
(`CourtsView`/`ScheduleView`/`StandingsView`, `useDisplaySync`) is untouched.

### Data source: `useBracketDisplaySync(tid)`

A read-only polling loop over `apiClient.getBracket(tid)` (returns
`BracketTournamentDTO`: `events[]`, `play_units[]`, `results[]`, court assignments),
mirroring `useDisplaySync`'s cadence + stale/live derivation. No `BracketApiProvider`,
no mutations — pure read. Returns `{ data, liveStatus, syncError }`.

### The three read-only views (`bracketDisplay/`)

TV-styled (oversized, high-contrast, matching the existing display surface):

- **`BracketLiveView`** — the default. The bracket analog of the meet "courts" view:
  matches currently on court + called-next, derived from `play_units` with court
  assignments. Each card shows the two sides, court, and live/called status.
- **`BracketDrawView`** — a read-only bracket tree for the selected event
  (`events[].rounds` → the round columns; `play_units` → the matchups; `results` →
  who advanced). Read-only: no pin/drag/result controls.
- **`BracketResultsView`** — completed matches / winners per event, and the
  champion/finalists when an event is decided (from `results[]` + the final round).

### View selection (the "director chooses")

`PublicDisplayPage` already keeps a `view` state + URL `?view=` param + a view
switcher. Extend it: when the workspace is a bracket, the view set is
`live | draw | results` (default `live`) and the switcher renders those; the bracket
views read `useBracketDisplaySync`. URL-addressable so a saved TV link locks to one
view. The draw/results views need an **event selector** when the bracket has more
than one event (default to the first / a `?event=` param).

### Branching in `PublicDisplayPage`

`PublicDisplayPage` resolves the workspace `kind` (a small fetch of the summary —
`viewer`-gated, same context the page already runs in — or a dedicated
`useDisplayKind(tid)` hook) and branches: `kind === 'bracket'` → render the bracket
display (bracket switcher + views + `useBracketDisplaySync`); otherwise → today's meet
display, unchanged. Both the public `/display?id=` route and the in-shell
`DisplayProduct` (`tv`) get the branch automatically (both render `PublicDisplayPage`).

## Out of scope (follow-ups, not SP-B3)

- **Hybrid display source** — for a workspace running both Meet and Bracket with
  Display enabled (`kind === 'meet'`, bracket also enabled), choosing which module's
  views the TV shows (or interleaving both) is a richer cross-module config. SP-B3
  branches on `kind`, which cleanly covers bracket-only workspaces; the hybrid
  "director picks across modules" selection is a noted follow-up.
- **Persisted display presets / auto-rotation** for the bracket views (the meet
  display has a presets concept; SP-B3 delivers the selectable views — saved
  presets/rotation is a fast-follow if wanted).
- **Hybrid identity/label** (the long-standing deferred labeling concern).

## Constraints

- `kind` preserved; no route-path changes. The meet display is untouched (additive
  branch + new components only).
- Read-only: the bracket display performs no mutations; it polls `getBracket`.
- Existing design tokens / the existing display surface style; no new colors.
- Backend suite stays green (currently 523 pass / 1 pre-existing psycopg2 skip).
  Frontend gate from `products/scheduler/frontend`: `npx tsc -b`, `npx vitest run`
  (250+), `npm run build`.
- The migration must be correct on a clean DB (chains after `i2d6e8f0a4b7`).

## Tests

Backend (`python3 -m pytest` from `products/scheduler`):
- `derive_modules("bracket")` → `display: available` (update the existing derive
  check); meet unchanged.
- Enable Display on a bracket workspace: `PATCH .../modules/display {enabled}` returns
  200 (bracket is enabled, so the display-dependency rule is satisfied), where it was
  409 `MODULE_IMMUTABLE` before (display was `coming_soon`).
- Migration SQL-logic test: a `display` `coming_soon` row flips to `available`; a
  non-display `coming_soon` row (if any) is untouched. (SQL-logic test mirroring the
  migration's statement, as SP-B2 did — alembic isn't installed in the dev venv.)

Frontend (from `products/scheduler/frontend`):
- `modulesForWorkspace('bracket')` → `display: available` (update the assertion).
- `useBracketDisplaySync` — polls `getBracket`, exposes `{data, liveStatus,
  syncError}`; stale/live derivation (mock the client).
- Each bracket view renders its content from a `BracketTournamentDTO` fixture:
  `BracketLiveView` shows on-court/called matches; `BracketDrawView` renders the
  rounds + advancement; `BracketResultsView` shows winners/champion. Empty-state when
  no matches/draw yet.
- `PublicDisplayPage` branches: a bracket workspace renders the bracket switcher +
  default Live view (not the meet `courts` view); a meet workspace is unchanged
  (existing PublicDisplayPage tests stay green).
- `tsc -b` + `vitest run` + `build` green.

## Acceptance criteria

1. `derive_modules` + `modulesForWorkspace` seed bracket → `display: available`; a
   migration promotes existing bracket-display `coming_soon` rows; enabling Display on
   a bracket workspace succeeds via the existing PATCH.
2. A bracket workspace's display (`/display?id=` and the in-shell `tv`) renders a
   read-only bracket surface with a **Live / Draw / Results** view switcher, polling
   `getBracket`; Live is the default.
3. The director can switch views (URL-addressable); draw/results select an event when
   there are multiple.
4. The meet display is unchanged (its views, sync, and tests untouched); the bracket
   rendering is an additive branch + new components.
5. Backend suite green (523 / 1 skip); frontend `tsc`/`vitest`/`build` green; `kind`
   preserved; no route changes.
