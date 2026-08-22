# SP-CONSOLE-5 — Phase 0 audit

Audit-and-STOP. Evidence: `docs/history/audits/2026-08-19-operator-console-report.html`
(19 console surfaces × desktop 1440×900 + mobile 390×844, workspace
`dfw-lewisville-2026`), read against the code at `main` (`57aa831`).

Findings are anchored to files and lines. **Six of the prompt's directives
rest on a premise the code contradicts** — those are called out as
CORRECTIONS, not carried forward silently (rule 6).

---

## 0.1 — Sequencing gate (rule 2)

**PASS.** SP-CONSOLE-4 Phase A merged as `f7e88d9` on
`feat/p7-public-entrant`, confirmed at `1e4d0b7`; both are ancestors of
`main`. Phase B (B3 flip, B4 legacy deletion, viewer guard `b940c6d`) also
landed. Working tree clean apart from untracked `.local-testing/logs/`.

Baseline recorded at the SP-CONSOLE-4 close: vitest 196 files / 1756
passed · pytest 1648 passed / 66 skipped · depcruise 0 errors / 16
warnings · `make check` green.

---

## 0.2 — Content container per surface

Measured from source, not from the screenshots. Sidebar is `w-56` (224px);
at 1440 the content area is 1216px.

| Family | Surfaces | Container | Left edge @1440 |
|---|---|---|---|
| Full-bleed data | `/`, `/matches`, `/roster`, `/bracket-*` lists, `/entries`, Plan/Run | `ActionsBar` + `flex min-h-0 flex-1`, page gutter `px-4` | 224 + 16 |
| **Overview** | `/overview` | `mx-auto w-full max-w-[1180px] px-8 py-6` | 224 + 18 |
| Config | `/setup`, `/bracket-setup` | `ConfigSurface` content `px-4` + form `mx-auto max-w-3xl` | ≈448 |
| Settings | `/ws-*`, `/display-config` | `mx-auto max-w-3xl … p-6` | ≈448, text at ≈472 |

**CORRECTION to LAY-1's premise.** The prompt describes "config ≈443px
anchor" and "settings ≈467px anchor" as two families. They are **one
container measured twice**: both are `max-w-3xl` (768px) centred in the
same 1216px area, so both boxes start at ≈448. The 24px delta is the
settings pages' inner `p-6`, which the config pages spend as an outer
`px-4` on the scroll region instead. There is no 443/467 anchor drift to
resolve — there is an inconsistent *gutter* (16 outer vs 24 inner).

The genuine outlier the prompt does not list is **`/overview` at
`max-w-[1180px] px-8`** — a fourth family, and the only one whose gutter is
32px.

So the real drift is: **four families, three gutter values (16 / 24 / 32),
two content widths (768 / 1180)**, plus full-bleed. `TabSkeleton` adds a
fifth width (`max-w-[1400px] px-4`), which flashes at a different anchor
than the surface it precedes.

`prose` (65–70ch) does not exist anywhere. `BracketEmptyState` is the only
component in the tree that bounds text by characters (`max-w-[58ch]`);
`EmptyState` bounds by `max-w-sm` (384px ≈ 55ch at 14px) — close, but a
px value, so it does not track the type scale.

---

## 0.3 — Empty-state / instructional string inventory

### Duplicates

**`/roster` — three simultaneous zero-messages, confirmed.** Three
sibling components each render their own, and on a zero-school roster all
three mount at once:

- `RosterTab.tsx:469` (school tab strip) — "No schools yet. Add one from the actions bar above."
- `RosterTab.tsx:714` (player list) — "Select a school above."
- `RosterTab.tsx:397` (position grid) — "Add a school from the actions bar to start rostering."

Two of the three tell the operator to use the actions bar; the middle one
tells them to select a school that cannot exist yet.

**`/entries` — the duplicate is a fallback, confirmed.**
`ModuleUnavailablePanel.tsx:31` renders the title "Entries isn't available
in this workspace"; the `note` beneath it comes from `AppShell.tsx:83`,
whose **fallback string is the same sentence uncontracted**. The note is
only distinct when the backend supplies a real `note`. Deleting the
fallback (render the note only when the catalog gives one) fixes it with
one deletion.

### Stale nav references

- **`MatchesTab.tsx:149`** — "…then schedule in **Operations → Courts**."
  There is no Courts destination. `buildWorkspaceNav` gives Operations
  exactly two: **Plan** (`schedule`) and **Live day** (`live`). The correct
  destination is **Operations → Plan**.
- **`BracketMatchesTab.tsx:326`** — "Add events and generate draws in the
  **Events and Draw tabs**." The Events tab was folded into Draws
  (2026-06-26); the bracket nav is Roster / Draws / Matches /
  Configuration. Correct destination: **Bracket → Draws**. *This one is not
  in the prompt.*

### Other empty states (each already one message + at most one action)

| Surface | Title | Action |
|---|---|---|
| `/` | "No workspaces yet" | Create workspace |
| `/matches` | "No matches yet" | Add match by hand (+ 4-sentence body) |
| `/bracket-draws` | "No draws yet" | ＋ New draw |
| `/bracket-matches` | "No matches yet" | none |
| `/entries` | "No entries yet" | none |
| `/ws-sync` | "No backups yet" | none |

### Guard-scope trap for COPY-5

A naive repo-wide grep guard fires on **comments, not copy**. `coming soon`
appears twice (`api/dto.ts:647`, `platform/domain/moduleModel.ts:111`) and
both are doc comments explaining that the state is never rendered.
`Live tab` appears four times, all comments — two of them
(`MatchDetailPanel.tsx`) referencing `LiveView.tsx`, a file B4 deleted.
`tap ` matches `bracketCommandQueue.ts:14` inside a word. The guards must
match **JSX text / string literals**, not raw file content, or they land
red on day one.

---

## 0.4 — The save models, on the wire

Three presentations; **two resources; one of the three "saves" never
touches the network by itself.**

| Surface | Control | What actually happens |
|---|---|---|
| `/ws-venue` | none | `setConfig` → `tournamentStore` → `useTournamentState` **500 ms debounced `PUT /tournaments/{id}/state`** |
| `/display-config` | none | `DisplayLayoutEditor` coalesces its own PUT (`DisplayLayoutEditor.tsx:9`) |
| `/setup`, `/bracket-setup` | "Save" | `EngineConfigForm` submit → `useTournament.updateConfig` → **`setConfig` only**. `useTournament.ts` is documented "no API calls". The wire write is the *same* 500 ms debounce. The button commits local form state to the store; it is not a network save. |
| `/ws-settings` | "Save changes" | `apiClient.updateTournament(tid, {name, tournamentDate})` — a **real** call, on a **different** resource (the `tournaments` row) |

Consequences for R-K:

- `/ws-venue` and `/setup` write the **same fields of the same blob** by
  two different UI models. `EngineConfigForm.tsx:11` already carries a
  dirty-check "so an autosave from another tab can't clobber" — the
  collision is known and defended against, not designed away.
- **Option A is cheaper than it looks.** Giving `/ws-venue` a Save means
  copying the local-`formData`-then-commit pattern `EngineConfigForm`
  already implements. Prior art, same file family.
- **Option A is not complete at `/display-config`.** That surface is a
  drag-and-drop layout editor; an explicit Save on a direct-manipulation
  canvas is the wrong pattern, and the cited guidance ("explicit save for
  *declarative controls* — text inputs, checkbox/radio groups") does not
  reach it. It needs an explicit carve-out either way.
- **Option B is not free either.** Autosaving `/ws-settings` means
  debouncing a name field into a real PATCH, which is new plumbing on a
  resource that has none.
- Under **either** option, `/setup`'s button changes meaning: today it is
  a stage-to-store control wearing the word "Save".

---

## 0.5 — Signal contradictions

### (a) `/live` "courts free" — **two live definitions ship today**

- **Frontend** (`runtime/runModel.ts:243`):
  `courtsFree = lanes.filter(l => l.now == null).length`, and `lane.now` is
  the highest-ranked **non-done match assigned to that court, any status**
  (`deriveCourtLanes`, LANE_RANK playing > called > scheduled). So a court
  holding a `scheduled` 14:00 match is **not free**. = **Option A**.
- **Backend** (`workspaces/workspace_signals.py:251`):
  `courtsFree = courtCount − |courts with a PLAYING match|`.
  = **Option B**.

The same metric name, computed two ways, rendered on three surfaces: the
Run band (frontend rule) and the Hub inspector + Overview
(`WorkspaceInspector.tsx:211`, `PhasePanels.tsx:190` — backend rule).

On the captured workspace — 4 courts, 4 scheduled matches, 0 playing — the
Run band says **0 courts free** and the Hub inspector says **4 courts
free**, simultaneously, about the same workspace.

So the band/cards mismatch the report saw is **not a bug in the band**: it
is internally consistent under Option A. The actual defect is one metric
with two definitions across the product.

**Cost of each ruling:** Option B = change one line in `runModel.ts` +
its tests (the server already means B, and B is what "free" means to a
caller looking for somewhere to send players). Option A = change
`workspace_signals.py` and the two Hub/Overview readouts. Option C = both
sides gain a second number.

### (b) `/bracket-draws` progress bars — **CORRECTION**

`DrawProgressCell` (`BracketDrawsTab.tsx:528`) renders a **stacked
segmented bar**: `done` (green `status-success-fg`) · `live`
(`status-live-solid`) · `ready` (`status-started`) over an unpainted
`pending` track. **The segments do sum to the total** — the prompt's
"segments must sum to one total" condition is already met.

The "blue bar at 0/7 rendered ~40% filled" is the **READY** segment:
0 done, 0 live, ~3 of 7 assigned-but-not-started. The math is right; the
presentation is not — the numeral says `done/total` and the bar says
something else, with no legend, in one cell.

Two further corrections:

- **The bar does not use the accent.** `--status-started` is
  `--status-info-fg`, a status token, so ACC-N1's "progress bars use status
  tokens, never the accent" is **already satisfied**. It reads as accent
  because info-blue and action-blue are the same hue family. The fix is
  perceptual (drop the ready segment, or re-tone it), not a token swap.
- **Re-generate is already confirm-gated.** `ActionCell` wraps it in
  `useConfirmClick` — the two-click arm the canon mandates since the
  `window.confirm` ban. The prompt's "inline and unguarded" is wrong. What
  is genuinely missing is the **disabled-with-reason when the draw has
  results** half (WSMOD-2 pattern).
- **STATUS blanking is deliberate and ledgered.** `DrawStatusCell`
  (`BracketDrawsTab.tsx:562`) renders "○ Draft" and "Generated" and returns
  `null` for started/completed, per **DRW-N2 + X6-D** ("a full bar with an
  n/n fraction IS the status"). SIG-4 asks to un-blank it, which reverses a
  standing X6 ruling — and its own next clause ("if GENERATED is the only
  non-exceptional value it does not render at all") would instead delete
  the Draft label. The two halves of SIG-4 contradict each other.

### (c) `/bracket-matches` STATUS column — **CORRECTION: premise is false**

READY and PENDING **do** render text. `BracketMatchesTab.tsx:407` calls
`<MatchStatus status={status} />` whenever there is no score;
`MatchStatus` renders `<span className={TEXT_CLASS[status]}>Ready</span>` /
`Pending`, and **`MatchStatus.test.tsx` asserts exactly that in the DOM**
for ready / pending / done, with the negative control re-demonstrated at
the Phase A merge head.

The text is `text-2xs` (10px) `text-muted-foreground`, right-aligned. The
report renders a 1440px full-page capture inside an ~830px column — a
~58% downscale, which puts that text at ~6px. **The cells are faint in the
report, not empty in the product.** X6's text variants were neither
dropped nor un-wired.

If there is a real finding here it is contrast/size at scan distance, which
is a different and much smaller change than SIG-5 describes — and one that
must not reintroduce chips (X6).

---

## 0.6 — Mobile: cause of the header overlap

**Cause found; it is not z-index.** `WorkspaceShell.tsx:89`:

```
sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center …
```

`h-12` is a **fixed 48px**, and its child `WorkspaceIdentityBar` is
`flex-wrap items-baseline` around a `break-words` workspace name, a date
and a status pill. At 390px "DFW Lewisville 2026 · Oct 1, 2026 · [pill]"
wraps to two or three lines inside a box that cannot grow, and the bar has
no `overflow-hidden` — so the wrapped lines paint over the surface below.

Every workspace-scoped mobile capture shows it because every one of them
has the same long identity string; the Hub is unaffected because it has no
identity bar.

**Cost to fix: one class** — `h-12` → `min-h-12` (the shell is a flex
column; the surface below reflows). The same latent bug exists at
`NewWorkspacePage.tsx:121` (`sticky … h-12`), and `HubPage.tsx:241` uses
`h-12 shrink-0` with `whitespace-nowrap` children, which will clip rather
than spill.

This materially changes R-J's economics: Option A's "P0 defect" is a
one-line change, not a responsive programme.

---

## 0.7 — Item-by-item reality check on Parts 1–4

Directives whose premise the code contradicts, restated:

| Item | Status |
|---|---|
| LAY-1 | Premise partly wrong — 443/467 are one container, not two. Real drift is four families / three gutters / two widths (+ `TabSkeleton`'s fifth). |
| LAY-2 | **Confirmed.** `NextUpList.tsx` code slot is `w-9` (36px), no truncation. But the bracket code is `str(play_unit_id)` (`workspace_signals.py:344`) — `{drawId}-R{n}-{i}` with an operator-supplied draw id. **Unbounded**, so "measure the longest generated code" is not achievable; truncate + `title` is the only correct answer. (Meet's branch builds a friendly `MS1`; bracket leaks the raw id — arguably the deeper fix.) |
| LAY-3 | Partly done: `UnifiedOpsBoard.tsx:377` already has `overflow-x-auto`. Missing: edge indicator + sticky COURT column. **The court column lives inside `GanttTimeline`, a design-system component** — so LAY-3 is a `packages/design-system` change with other consumers, not a console-local one. |
| COPY-1 | Confirmed on all three surfaces; `/bracket-matches` carries a fourth stale nav reference the prompt does not list. |
| COPY-2 | Confirmed. `OperationsProduct.tsx:244,247` (both subtitles) and `UnifiedOpsBoard.tsx:394` (the grid-adjacent drag hint, which is the one to keep). No first-run hint mechanism exists. |
| COPY-3 | Confirmed. `ModulesSettingsTab.tsx:40` header restates the has-data rule; `BracketStructureSection.tsx:52` "Active disciplines". |
| COPY-4 | Confirmed. `BracketRosterTab.tsx:50` header is `'Events · [n] seed'`. `EventBadge` already carries `title={`${code} · seeded ${seed}`}` — the inline explanation the directive asks for exists; only the header needs cutting. |
| COPY-5 | Feasible, but must match JSX text/string literals, not file content (see 0.3). |
| SIG-1 | Blocked on R-L; the deeper defect is frontend/backend disagreement, not band/cards. |
| SIG-2 | **Confirmed.** `OperationsProduct.tsx:283` — the blocker is bare `text-xs text-muted-foreground`; the *resolved* state gets the full pill. Weight is inverted. `planFinalized` gates lateness derivation and the whole running posture. |
| SIG-3 | Verb confirmed: `sendFromQueue` (`RunSurface.tsx:371`) finds the first free lane and calls `fireAssign` → **"Assign"**, not "Call". Also: it **silently no-ops when no court is free** while the button stays enabled. **ON DECK is a collision** — see below. |
| SIG-4 | Three of its four clauses rest on wrong premises (see 0.5b). |
| SIG-5 | Premise false (see 0.5c). |
| SIG-6 | Confirmed. `ModuleCatalogRow.tsx:96` renders `Enable` as a default `Button` (primary weight) while in-use modules get ghost text. |
| SIG-7 | Confirmed, with a different mechanism than reported. `healthColorClass` maps 4 backend values to 3 colors: `good`→green, `attention`→amber, **`draft` AND `archived` both → `bg-muted-foreground`**. The dot's `title` leaks the raw enum (`Health: good`). Gray therefore means "not started" and "retired" identically. |
| ACC-N1 | Confirmed and **broader than stated**. `text-accent` on codes at `BracketMatchesTab.tsx:372` (110 rows), `MatchesSpreadsheet.tsx:389` (meet list, same defect), `MatchDetailPanel.tsx:347`, and `EventsControl.tsx:109` (`EventBadge` — accent border + accent bg + accent text, used across rosters). Prior art to follow is already in-repo: `BracketDrawsTab.tsx:316-324` ruled body ink under **DRW-2** with the reasoning written out. |

### SIG-3 / ON DECK — direct collision with SP-COURT-1

The ON DECK strip is **CP5**, shipped `501de7a` on 2026-08-19 — one day
before this prompt — under an owner-ratified SP-COURT-1 ruling. It is not
a duplicate of the first three queue rows by construction: `onDeck()`
(`runModel.ts:184`) filters to eligible **and** assignable **and**
players-off-court, while the queue lists everything. On the captured
fixture (nothing called, nobody busy) the two coincide, which is what the
screenshot shows.

SIG-3's stated default — "delete" — would revert a feature shipped
yesterday under a standing ruling, on evidence from a fixture that cannot
distinguish it. Flagging rather than acting (rule 3 / rule 6).

---

## 0.8 — What Phase 1 would touch (scope preview, not yet actioned)

`apps/console/src/`: `platform/product-shell/WorkspaceShell.tsx`,
`platform/engine-config/{EngineConfigForm,ConfigSurface}.tsx`,
`components/control-plane/{EmptyState,NextUpList,EventsControl,matchStatus}.tsx`,
`components/control-plane/HealthDot.tsx`,
`modules/meet/{matches/MatchesTab,matches/MatchesSpreadsheet,roster/RosterTab}.tsx`,
`modules/bracket/{BracketDrawsTab,BracketMatchesTab,BracketRosterTab,BracketStructureSection}.tsx`,
`modules/operations/{OperationsProduct,UnifiedOpsBoard,run/RunQueue,run/RunSurface,runtime/runModel}.tsx|ts`,
`modules/settings/{ModulesSettingsTab,ModuleCatalogRow}.tsx`,
`modules/workspace/{VenueScheduleTab,WorkspaceOverview}.tsx`,
`modules/hub/WorkspaceRow.tsx`, `app/AppShell.tsx`.
`packages/design-system/components/GanttTimeline.tsx` (LAY-3 only).
`apps/api/src/workspaces/workspace_signals.py` (only if R-L = Option A).
