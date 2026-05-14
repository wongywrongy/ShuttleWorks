# Bracket Chrome Unification — Design

**Status:** Approved design — ready for implementation planning. Written 2026-05-14.

**Goal:** Make the bracket (tournament-kind) surface navigate on the same axis as the meet surface — a horizontal top `TabBar` — so the two products read as one. Today the meet is topbar-dominant and the bracket is sidebar-dominant; this converges them on the meet's model, structurally *and* visually.

---

## Context — how the mismatch arose

The scheduler hosts two tournament kinds in one shell (`AppShell`):

- **Meet** — primary nav is the horizontal `TabBar` (`Setup · Roster · Matches · Schedule · Live · TV`). Each tab is a full page that owns its own header strip (`border-b border-border bg-card px-4 py-3`, eyebrow + bold subject + right-cluster controls — see `MatchesTab`, `RosterTab`).
- **Bracket** — primary nav is `SettingsShell`'s left rail (`01 Draw · 02 Schedule · 03 Live`), with a second stacked `TopBar` context bar above it.

The bracket's left rail was introduced by commit `5c8d49e` ("structural mirror of meet design language"). That commit mirrored the meet's **Setup sub-page** (which legitimately uses `SettingsShell`) rather than the meet's **app shell**. The result: the bracket adopted what is the meet's *secondary* nav pattern as its *primary* nav, and the two surfaces now navigate on different axes — "no visual unification."

**User decision (2026-05-14):** converge on the meet's **top primary nav**, addressing **both** structure and visual treatment.

---

## The unified model

Both surfaces share one shape:

```
TabBar (horizontal tabs, app chrome)
  └─ per-tab <header> strip  (border-b border-border bg-card px-4 py-3)
       └─ scrollable content
```

The meet already does this. The bracket adopts the identical shape — that *is* the unification. `SettingsShell` is retained, but only in the role it was designed for: the **setup-wizard rail**, used by the meet's Setup tab *and* the bracket's pre-creation `SetupForm`. It is never primary nav again.

What is reversed from commit `5c8d49e`: only `BracketTabBody → SettingsShell` as *post-creation* primary nav. The rest of that commit — the design-system primitive cleanup inside the bracket view files — is kept.

---

## Section 1 — Chrome architecture

### TabBar

`app/TabBar.tsx` `BRACKET_TABS` is populated:

```ts
const BRACKET_TABS: TabDef[] = [
  { id: 'bracket-draw',     label: 'Draw' },
  { id: 'bracket-schedule', label: 'Schedule' },
  { id: 'bracket-live',     label: 'Live' },
];
```

- **Tab ids are uniformly `bracket-`-prefixed.** Not reusing the meet's bare `'schedule'` / `'live'` ids — those would collide, and the prefix keeps dispatch and stale-tab detection unambiguous and greppable. `'bracket-draw'` is prefixed too, for symmetry within the set.
- `AppTab` (in `store/uiStore.ts`) extends to include the three new ids.
- `BRACKET_TABS` renders through the **same** `TabBar` markup as `MEET_TABS` — same accent underline, same `aria` wiring, same disabled treatment. No bracket-specific tab JSX.
- The `"Tournament"` fallback `<span>` label is removed — it existed only because `BRACKET_TABS` was empty.

### Dispatch — stays in `BracketTabBody`

`AppShell` is **untouched**. It still renders `<BracketTab />` directly when `activeTournamentKind === 'bracket'`. Pushing the Draw/Schedule/Live dispatch up into `AppShell` would force `eventId` to be lifted into a store; keeping it in `BracketTabBody` keeps `eventId` a local `useState`.

`BracketTabBody`:

- `if (!data)` → render `<SetupForm />` (pre-creation wizard — unchanged).
- else → read `activeTab` from `useUiStore`, `switch` on it → `<DrawView />` / `<ScheduleView />` / `<LiveView />`, with `<BracketViewHeader />` rendered directly above the content area (see Section 2).
- `SettingsShell` is removed from `BracketTabBody`.
- `eventId` `useState` stays in `BracketTabBody`. Because `BracketTabBody` never unmounts across tab switches, `eventId` persists naturally and remains the single source of truth for the per-view header.

### `activeTab` normalization

`activeTab` defaults to `'setup'` and may be stale from prior meet use (e.g. `'roster'`). When `activeTournamentKind` resolves to `'bracket'`, a small effect normalizes: if `activeTab` is not one of the `bracket-*` ids, snap it to `'bracket-draw'`. A symmetric guard handles bracket→meet (if `activeTab` is a `bracket-*` id when kind is `meet`, snap to `'setup'`).

This effect lives in `BracketTab` (not `useTournamentKind`, which stays a pure fetch-and-cache hook).

### Pre-creation tab disabling

`TabBar` lives in `AppShell`, **outside** `BracketApiProvider`, so it cannot call `useBracket()`. Instead:

- `BracketTab` writes a `bracketDataReady: boolean | null` flag into `useUiStore` (`null` while loading, `false` no draw, `true` draw exists), derived from `useBracket().data`.
- `TabBar` reads `bracketDataReady`. When kind is `bracket` and the flag is not `true`, all three bracket tabs render **disabled** (reusing the existing disabled-tab styling and `aria-disabled` wiring).
- Pre-creation, `SetupForm` fills the content area and keeps its own `SettingsShell` wizard rail. Once a draw is generated, the flag flips to `true` and the tabs enable.

This matches the meet's convention — tabs always visible, disabled by prerequisite — and avoids coupling `TabBar` to bracket internals or the `BracketApiProvider`.

---

## Section 2 — `BracketViewHeader` + data flow

### The component

`features/bracket/BracketViewHeader.tsx` — **new**. The bracket's per-view header strip, built to the meet's exact view-header pattern:

```
<header className="flex shrink-0 flex-wrap items-center justify-between gap-3
                    border-b border-border bg-card px-4 py-3">
  <div> {/* left cluster, items-baseline gap-3 */}
    <span eyebrow>DRAW | SCHEDULE | LIVE</span>
    <select event />            {/* event selector */}
    <span muted>{formatLabel}</span>
  </div>
  <div> {/* right cluster, items-center gap-2 */}
    <StatusBar items={…} />     {/* counters */}
    <ExportMenu />
    <Button size="sm" variant="outline">Reset</Button>
  </div>
</header>
```

- **Props:** `{ view: 'draw' | 'schedule' | 'live', data, eventId, onEventId, onReset }`. `view` is the bare form (it drives the eyebrow label); `BracketTabBody` derives it from `activeTab` by stripping the `bracket-` prefix.
- The `buckets` helper, `Counters`, and `ExportMenu` move into this file from `TopBar.tsx`. `StatusBar` (already extracted to `@scheduler/design-system`) renders the counts.
- The `ALL · …D · …L · …R` global sub-line currently in `TopBar`'s `Counters` is preserved.

### How "Option C" is realized

The user chose Option C — per-event controls inside each view's header, no separate chrome bar. This is realized by `BracketTabBody` rendering **one** `<BracketViewHeader />` directly above the content switch:

```tsx
// view: 'draw' | 'schedule' | 'live' — derived from activeTab ('bracket-draw' → 'draw')
return (
  <div className="flex h-full flex-col bg-background">
    <BracketViewHeader
      view={view}
      data={data}
      eventId={eventId}
      onEventId={setEventId}
      onReset={handleReset}
    />
    {error && <ErrorBanner />}
    <div className="min-h-0 flex-1 overflow-auto">
      {/* switch(activeTab) → DrawView | ScheduleView | LiveView */}
    </div>
  </div>
);
```

This is visually identical to authoring the header inside each view file — a `bg-card` header strip atop the view's content, exactly like every meet tab — but the header **mounts once**, parameterized by a `view` prop. The "event selector renders 3× / must stay in sync" risk noted on the approaches wireframe **does not arise**: there is one header instance and one `eventId` source.

If a view ever needs view-specific header content, `BracketViewHeader` gains a `children` (or `extra`) slot. Not needed today — all three views require identical controls.

### Data flow

```
useBracket() ──data──▶ BracketTabBody
                         ├─ eventId  (useState, persists across tab switches)
                         ├─ writes bracketDataReady → useUiStore
                         └─ renders BracketViewHeader(view, data, eventId, onEventId, onReset)
                                                    └─ counters/export/reset, all local to the header

useUiStore.activeTab ──▶ BracketTabBody switch ──▶ DrawView | ScheduleView | LiveView
                                                    (receive data, eventId, onChange, refresh — unchanged)
```

The three view files no longer render any header or section eyebrow of their own; their content becomes just the scrollable body.

---

## Section 3 — File-by-file changes

| File | Change |
|---|---|
| `store/uiStore.ts` | `AppTab` += `'bracket-draw' \| 'bracket-schedule' \| 'bracket-live'`; add `bracketDataReady: boolean \| null` field + `setBracketDataReady` setter; include in `INITIAL` (value `null`) and `reset()`. |
| `app/TabBar.tsx` | Populate `BRACKET_TABS` (3 tabs). Remove the `"Tournament"` fallback `<span>` and the now-dead `tabs.length > 0` branch. Add bracket disabled-logic: kind `bracket` + `bracketDataReady !== true` → all three disabled. |
| `features/bracket/BracketTab.tsx` | Write `bracketDataReady` to `useUiStore` from `useBracket().data` (effect). Add the `activeTab` normalization effect. `BracketTabBody`: remove `SettingsShell` + the `sections` array; add `activeTab` switch; render `<BracketViewHeader />` above the content area. Keep `eventId` `useState`, `handleReset`, the `!data` → `SetupForm` branch, and the error banner. |
| `features/bracket/BracketViewHeader.tsx` | **NEW.** Absorbs `buckets`, `Counters`, `ExportMenu`, the event `<select>`, and the `Reset` button from `TopBar.tsx`. Meet view-header pattern. |
| `features/bracket/TopBar.tsx` | **DELETED.** All three concerns relocated (chrome lockup was already removed in `59c6502`; the rest moves into `BracketViewHeader`). |
| `features/bracket/DrawView.tsx` | Remove the Phase-3 internal section eyebrow (`<div className="px-4 pt-4">…DRAW…</div>`); the view renders only its scrollable body. No prop changes. |
| `features/bracket/ScheduleView.tsx` | Same — remove the `SCHEDULE` eyebrow. |
| `features/bracket/LiveView.tsx` | Same — remove the `LIVE` eyebrow. |
| `features/settings/SettingsShell.tsx`, `SettingsNav.tsx` | **Unchanged.** Still used by the meet's Setup tab and the bracket's `SetupForm`. |
| `features/bracket/SetupForm.tsx` | **Unchanged.** Keeps its `SettingsShell` wizard (`01 Configuration · 02 Events · 03 Generate`). |

---

## Visual treatment ("both structure and treatment")

The user asked for visual convergence as well as structural. This is delivered *by* the structural fix — there is no separate polish phase:

- Primary chrome becomes the literal meet `TabBar` component — same height, `bg-card`, border, tab styling, accent underline, disabled treatment. Byte-identical by construction.
- `BracketViewHeader` is built to the literal meet view-header pattern (`border-b border-border bg-card px-4 py-3`, eyebrow + clusters, `h-7` controls).
- The bracket view bodies (`DrawView` etc.) already consume `@scheduler/design-system` primitives from Phase 3 of the earlier design-unification work.

The browser-harness sweep (below) is the confirmation step, not a polish step.

---

## Verification

- `npx tsc -b` clean from `products/scheduler/frontend`.
- `npm run build:scheduler` succeeds.
- `npm run lint:scheduler` clean.
- **Browser-harness sweep:**
  - Pre-creation: bracket tournament with no draw — three disabled tabs in the `TabBar`, `SetupForm` (with its `SettingsShell` wizard) in the content area.
  - Post-creation: `bracket-draw` / `bracket-schedule` / `bracket-live` — each shows the unified `TabBar` + a `BracketViewHeader` strip + the view body. Event selector switches all three.
  - Light **and** dark.
  - Side-by-side against a meet tab (`MatchesTab`) — confirm chrome parity: same `TabBar`, same header-strip rhythm, same corners/shadows.
- `make test` + `make test-e2e` — meet regression (no bracket E2E specs exist; failures must be meet-side).

---

## Out of scope

- The meet surface — it is the reference; it does not change.
- `SettingsShell` / `SettingsNav` internals — unchanged.
- `SetupForm` internals — unchanged (keeps the `SettingsShell` wizard).
- The `GanttTimeline` unification (`docs/superpowers/plans/2026-05-13-gantt-timeline-unification.md`) — independent effort.
- Bracket realtime/subscription work — already a separate deferred PR per `useBracket` notes.

---

## Open questions / risks

1. **`AppShell` `animate-block-in` re-key.** For meet tabs, `AppShell` re-keys the content `<div key={activeTab}>` so each tab switch re-runs the entry animation. For bracket-kind it renders `<div key="bracket">` — a single key, so switching `bracket-draw` → `bracket-schedule` will *not* re-trigger `animate-block-in`. Decide during planning whether the bracket sub-tab switch should re-key on `activeTab` (consistent with the meet) or stay a hard cut. Low stakes — default to matching the meet (re-key on `activeTab`).
2. **Disabled-tab click while pre-creation.** Confirm the existing `TabBar` disabled handling (`disabled` attr + `aria-disabled`) fully blocks selection so a disabled `bracket-schedule` can't be activated via keyboard. Existing meet behavior should cover this; verify in the sweep.
3. **`bracketDataReady` lifecycle on reset.** When the operator hits `Reset` (`handleReset` sets `data` to `null`), `bracketDataReady` must flip back to `false` and the tabs must re-disable, landing the operator on `SetupForm`. The effect deriving the flag from `data` covers this; call it out in the plan's verification.

---

## Decisions log

- **Converge on topbar, not sidebar** — user chose the meet's top primary nav (2026-05-14).
- **Option C** — per-event controls in the view header, not a second chrome bar, not crammed into the `TabBar`. Realized as a single `BracketViewHeader` rendered by `BracketTabBody` (parameterized by `view`), which eliminates the multi-instance sync risk.
- **Dispatch stays in `BracketTabBody`** — keeps `eventId` a local `useState`; `AppShell` untouched.
- **`bracket-`-prefixed tab ids** — avoids collision with meet `'schedule'`/`'live'`; uniform prefix for greppability.
- **Pre-creation disabling via a `useUiStore` flag** — `TabBar` can't reach `useBracket` (provider boundary); the flag decouples them.
- **`SettingsShell` retained** — as the setup-wizard rail on both surfaces; only its misuse as bracket primary nav is reversed.
