# Interaction-bug audit — Stage 1 findings (report only) → GATE

> **STOP FOR SIGN-OFF. No fixes have been applied.** This is the Stage-1
> deliverable: an empirical map of what breaks when every interactive element is
> pressed in every reachable state. Fixes are Stage 2, per root-cause class,
> after sign-off.
>
> Branch `dev/workspace-suite`, 2026-07-10. Companion docs:
> `INTERACTION_INVENTORY.md` (static element census) and the raw sweep JSON in
> `products/scheduler/e2e/interaction-sweep/results/`.

## How this was produced

- **Error harness** (`src/platform/errorHarness.ts`, dev/test builds only; wired
  in `main.tsx`, gated on `import.meta.env.DEV || VITE_ERROR_HARNESS=1`): records
  (never swallows) `window.onerror`, `unhandledrejection`, `console.error`, and
  React error-boundary catches — each stamped with the route and the **last user
  interaction** (element selector + accessible name). `ErrorBoundary` now reports
  into it. This is the permanent layer the prompt asks Stage 3 to keep.
- **Sweep runner** (`products/scheduler/e2e/interaction-sweep/sweep.mjs`): drives
  a real Chromium against a **production build** (`vite preview` :4173) proxied to
  the host backend (:8600), with the harness baked in. Presses every enumerated
  element per view — including handler-bearing non-button rows found by a
  cursor-pointer heuristic — and records the outcome. Sub-states (settings
  sections, display tabs) and opened dialogs are swept too.
- **Fixtures**: the four seeded sim workspaces (mid-day meet, full meet, bracket
  DE, mixed) plus a disposable empty workspace created per run.

## Coverage matrix (prompt state-matrix × run status)

| Dimension | Ran? | How |
|---|---|---|
| Default press-everything | ✅ | 44 views, 2 037 presses |
| Pressed twice rapidly (double-fire) | ✅ | `doublefire.json`, 113 mutating elements |
| Pressed with API forced to fail (network-fail) | ✅ | `netfail.json`, mutations aborted via route interception |
| Pressed immediately after route entry (early-click) | ✅ | `earlyclick.json`, click before data settles |
| Empty-data state (no matches / no members) | ✅ | disposable empty workspace, all segments |
| Disabled / locked actually blocks handler | ✅ | recorded as `disabled-native` (26); empty-state guards verified holding |
| **Viewer role** (must no-op client-side, not 403-toast) | ✅ | midday temporarily demoted to `role='viewer'`, swept, then restored |
| In-flight (press while prior action pending) | ⚠️ partial | approximated by double-fire's rapid second press; not a separate long-latency pass |

**Aggregate default-pass outcomes** (2 037 presses across 44 views): `acted` 751,
`navigated` 741, `opened-dialog` 197, `unclickable` 155, `NO-OP` 135,
`disabled-native` 26, `console.error` 29, `error` 2, `skipped-destructive` 1.

## Calibrated out — NOT findings (so the real signal is visible)

These fire loudly but are correct behavior or tool artifacts. They matter because
the Stage-3 CI smoke gate must filter exactly these or it will never go green:

- **Browser resource-404 on `GET …/bracket`** (4 presses): `apiClient.getBracket`
  treats 404 as "no bracket yet" (`validateStatus` 200|404 → `null`). The app
  handles it; the browser still logs the raw resource 404. Noise.
- **Suggestion `Apply` → 410** (1): `useSuggestionActions` maps 409/410 to a benign
  "stale, refreshing" info toast and drops the row. Correct.
- **Clipboard / `window.open` NO-OPs** (Copy, Open fullscreen, Open): they act,
  just not observably in the DOM — the sweep can't see a clipboard write. False
  NO-OP.
- **Already-active toggle/tab/facet NO-OPs** (Comfortable density, "All" hub facet,
  active ConfigSurface section, active display tab): pressing the current value is
  a no-op by design.
- **`unclickable`: skip-link (40)** — the off-screen "Skip to content" link, visible
  only on focus; **dialog-timing races (73)** — a dialog button enumerated one tick
  before its dialog closed. Tool artifacts, not dead buttons.
- **Heuristic text-span NO-OPs (59)**: `cursor: pointer` text inside a real control
  that the heuristic caught. Not interactive.

**No confirmed dead/throwing `<button>` was found among the 155 `unclickable` or
135 `NO-OP` outcomes** beyond finding D1 below — they decompose entirely into the
categories above plus the accessibility items in class G.

## Fixture caveats (honesty)

- **`Sim Full Meet (seed 11)` was mis-seeded** with no `tournament_members` row for
  the local-dev user → every state fetch 403'd ("Not a member"). This produced the
  entire early-click "hydrate failed" cluster (24 entries, all fullmeet `ws-*`). It
  is a **fixture defect, not a product bug**. I inserted the owner row to confirm
  (403 → 404 "no state persisted": the fixture also never got a state blob), then
  **reverted the DB to its original state**. Fullmeet's data-bearing content got no
  real coverage; the mid-day meet workspace covers the same meet surfaces with
  intact data, so coverage is not lost — only redundancy.
- The DB was snapshotted before the sweep (`…/441501c9-…/scratchpad/audit-db-backup-presweep.db`).
- The **six `window.confirm` sites** (class E) were not empirically triggered: the
  bracket fixtures had no live match in a state that offers a Simple-mode winner
  button during the sweep. They are static/confirmed-by-code findings.

---

# Findings, by root-cause class, ranked by user impact

## Class A — State-vocabulary leak: the UI offers actions the backend refuses

The dominant class, and the one that hits the live day. In each case a control is
rendered enabled in a state where the server will always reject it; the optimistic
local apply then diverges from the server and the user is shown an error (often a
misleading one) with a retry that cannot succeed.

### A1 — Meet Run: frontend match state-machine is a superset of the backend's ⭐ #1
**Impact: high — live-day, reachable by a normal operator in two clicks.**
`useLiveTracking.ts:29-34` permits `started→called`, `finished→started`, and
`scheduled|called→finished`; the backend (`services/match_state.py:45-51`) forbids
all of them (`FINISHED`/`RETIRED` terminal; `PLAYING→CALLED` illegal). Every such
press optimistically applies, PUTs, gets **409**, and surfaces a toast reading
*"Cannot transition match m007 from 'playing' to 'called' — version mismatch"*
plus a **Retry button that can never succeed** (the transition is forbidden
regardless of version — the "version mismatch" framing is wrong and misleads the
operator into retrying).
- **Reproduction (normal operator):** Run view → a playing match shows **"Undo to
  called"** → click → 409 toast + Retry. Confirmed empirically (m007), plus
  "Undo finish" on finished matches (m002/m003/m006) via the Finished tab.
- **Root cause:** two independently-authored transition tables that disagree. The
  fix is to make the client table match the backend contract (or delete the client
  guard and trust the backend), and to stop labeling a contract violation as a
  version mismatch.
- Empirical: 5 console.errors in the default pass; more under double-fire.

### A2 — Viewer role: no client-side gating; the full editing UI is live
**Impact: high — anyone with a shared "viewer" link.**
Demoting the workspace to `role='viewer'` and reloading shows the **complete
editing UI, every control enabled, no read-only banner** (roster 51 enabled
buttons, matches 65, plan 43, run 48). The backend correctly gates writes
(`require_tournament_access('operator')`), so every viewer edit optimistically
applies, then **403-toasts** *"Role 'viewer' is insufficient (requires
'operator')"* with a futile **"Save now"** retry — and the optimistic local change
is left diverged from the server. This is exactly the prompt's "viewer must no-op
client-side, not 403-toast" case, and it fails.
- **Root cause:** the app never threads the caller's role into the surfaces; no
  read-only mode exists. This is a real design gap (surfaced here, flagged for the
  design decision the prompt says goes to the findings doc): the fix is a
  role-aware read-only treatment, not per-button patches.

### A3 — Bracket roster: locked-player controls poison the whole-blob autosave (cascading)
**Impact: high — one press disables all further editing on the view until reload.**
With a generated draw, the backend rejects removing a placed player, but the roster
UI still renders the delete ×, availability add/remove, and other edit controls as
live. Because roster state persists via a **whole-`TournamentState` blob PUT**, the
first rejected optimistic delete makes the blob invalid, and then **every
subsequent edit re-sends the same poisoned blob and also 409s** — availability
tweaks, "Save now", everything — until the operator reloads. 19 console.errors from
a single view sweep, all *"These players are placed in a generated draw and cannot
be removed: ev-de-c01"*.
- **Root cause:** (a) no client guard that placed players are locked; (b) the
  blob-PUT autosave has no rollback, so one bad optimistic edit contaminates all
  later saves. Both need addressing.

### A4 — ws-modules: Disable offered on modules the backend will always refuse
**Impact: medium.** "Disable" is live on the **last enabled operational module**
("cannot disable the last enabled operational module") and on a module **with data**
("module 'meet' has data and cannot be disabled"). Both 409. (The *error-path*
half of this is B1.)

### A5 — Ops MatchChip: `aria-disabled="true"` yet intentionally click-selectable
**Impact: low (a11y correctness).** Finished/"done" chips on the Operations boards
render `aria-disabled="true"` but remain selectable by design — so assistive tech
announces "disabled," keyboard activation is blocked, and Playwright treats them as
not-enabled, while a pointer click still works. The disabled vocabulary is being
used for "inert-drag," which it doesn't mean.

### A6 — Meet Plan: Generate enabled with zero matches
**Impact: low.** On an empty workspace, **Generate** is enabled and runs a full
solver round-trip (`POST /schedule/stream` + state PUT) against no matches. Should
be disabled-with-reason when there is nothing to schedule.

## Class B — No error path / unguarded rejection

### B1 — ws-modules Disable: no `.catch` → unhandled promise rejection ⭐
**Impact: medium; this is the class the harness was built to catch.** The
`disable(id)` handler has no rejection path; pressing Disable on a refused module
produces a genuine **`unhandledrejection`** (`patchWorkspaceModule` → rejected
promise), caught here only because a global rejection-to-toast bridge exists. The
harness attributed both cases to the exact press. A mutating action must route its
own failure to the canon inline-error/alert path, not rely on a global net.
- Empirical: 2 `error`-level harness events (the only two in the whole sweep).

### B2 — Unhydratable workspace logs an error and renders a partial shell
**Impact: low.** When a workspace can't be hydrated — `403` (not a member) or `404`
(not found) — `useTournamentState` logs a `console.error` and the admin shell still
renders partially, rather than showing a clean "you don't have access / workspace
not found" state. A user following a stale or revoked link gets console errors and a
half-rendered page. (Distinct from the fullmeet fixture artifact; this is the
code's response to the unhappy load.)

## Class C — Unguarded double-fire

### C1 — Several mutating actions double-submit on a rapid second press
**Impact: medium.** With no shared pending/in-flight wrapper, a rapid double-press
fires two mutations:
- **Create backup** → two `POST …/state/backup`
- **Plan-ready toggle** → two `POST …/plan-finalized`
- **Re-optimize / Re-solve meet** → two solves
- **Nuance:** **Generate** self-guards — `useSchedule.generateSchedule` aborts the
  prior `AbortController`, so the second press supersedes rather than duplicates.
The fix is one shared `useAction`/pending wrapper (disable + `pending` from the
vocabulary) so double-fire dies everywhere at once; don't flatten the Generate
nuance — it already self-guards and needs no per-button flag.

## Class D — Dead handler (**root cause UNRESOLVED — hand to Stage 2**)

### D1 — Bracket Plan timeline chips never select
**Impact: medium (a whole selection affordance is dead); mechanism open.**
On the bracket **Plan** (`ScheduleView`) timeline, the chips render `cursor-pointer`
and carry an `onClick`, but clicking never selects (no ring, sidebar stays "Click a
match to see details"). The **symptom is confirmed four ways**: real click, synthetic
bubbling click, and calling the element's own `props.onClick()` directly all no-op,
while the *identical* `setSelectedPlayUnitId` setter **works** from the table row
below.
- **Why the obvious diagnosis is not yet proven:** a `React.memo` stale-closure
  story doesn't fit — invoking the *current committed* `props.onClick` directly
  should call the stable setter with a raw `pu.id` and work. That it still no-ops,
  yet the same setter works from the sibling table, is genuinely unexplained. Report
  as **confirmed-dead / cause-unresolved**; Stage 2 should start from that specific
  contradiction (compare the chip vs table `onSelect` wiring in `BracketTab.tsx`),
  not assume a memo bug.

## Class E — Banned pattern: `window.confirm` (design canon prohibits it)

### E1 — Six `window.confirm` sites in bracket flows
**Impact: medium (blocks the automation gate; violates the canon; blocks the event
loop).** `BracketDrawsTab.tsx:468` (Re-generate), `BracketDataSection.tsx:76`
(Reset bracket), and the four Simple-mode winner buttons
(`LiveMatchList.tsx:158/167`, `bracket/MatchDetailPanel.tsx:174/190`). Static /
by-code; not triggered empirically (no eligible live bracket match in the fixture
during the sweep — the sweep also cannot proceed past a native dialog, which is
itself the point). Replace with the canon two-click guard or a Modal.

## Class F — Unguarded destructive one-click

### F1 — delete-player / delete-match have no confirm or undo
**Impact: medium.** `RosterTab.tsx:704` (delete player) and
`MatchesSpreadsheet.tsx:407` (delete match) are single-click, hover-revealed,
irreversible, with no guard — while the same app uses a two-click arm for
Generate-replace and Remove-player. Static (hover-revealed, so the sweep recorded
them as `unclickable` without a hover step).

## Class G — Accessibility / keyboard (from the inventory + sweep `unclickable`)

- **G1 — Mouse-only clickable rows (systemic):** `BandedTable` rows, `MatchesTable`
  / `BracketMatchesTable` `<tr>`, `ScheduleView` chips, `LiveMatchList` /
  `UnifiedOpsList` / `RunQueue` `<li>`, workflow cards, `GanttChart` block `<div>` —
  `onClick` but no `role`/`tabIndex`/key handler. No keyboard path to the row action.
  (In-repo proof it's fixable: `LiveView` chip and `MatchDetailsPanel` impacted row
  do it correctly.)
- **G2 — Unlabeled score inputs:** `ScoreEditor.tsx:136/150/371/383` number inputs
  and the Deuce checkbox (`342`) have visible labels only as sibling divs — no
  programmatic label.
- **G3 — Hover-revealed overflow triggers:** the bracket-roster "Actions for {name}"
  `OverflowMenu` buttons are `opacity-0` until row hover with no keyboard reveal —
  the cause of 15 of the sweep's `unclickable` results and a real keyboard gap.
- **G4 — Modal close affordance:** `Modal` closes via Escape/backdrop only; the
  backdrop `<div onClick>` has no accessible name and no dialog exposes a labeled
  Close button (callers add Cancel where present).

---

## Suggested Stage-2 fix order (by root-cause class, per the prompt)

1. **A1** (state-machine divergence) + **A2** (viewer gating) + **A3** (bracket blob
   poison) — the live-day breakers; A2 and A3 carry design decisions (role-aware
   read-only; blob-PUT rollback) that should be confirmed at sign-off.
2. **C1** — shared `useAction`/pending wrapper (kills double-fire class-wide;
   preserve the Generate self-guard).
3. **B1/B2** — failure paths on mutating actions (no naked rejection; clean
   unavailable-workspace state).
4. **E1** — replace `window.confirm` with the canon guard/Modal.
5. **A4/A5/A6/F1** — vocabulary + guard cleanups.
6. **D1** — dead handler; **start from the confirmed contradiction, not a guess.**
7. **G1–G4** — keyboard/label layer.

Then **Stage 3**: promote the sweep + a curated real-flow suite into a required CI
interaction-smoke gate that asserts zero harness events, with the calibrated-out
list above as its noise filter.

> **GATE — awaiting sign-off before any Stage-2 fix.**
