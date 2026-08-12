# Operator console: information architecture proposal

Written 2026-08-12. **Analysis and proposal only. Nothing in here has been implemented.**

Commissioned by the owner: *"go through every single menu, a lot of panels are so information dense...
in meet and bracket rosters when we click on a row it should bring up a side panel for changes not a
direct row replacement... the event selection is very rudimentary... the side panels have so much info
with no organization."*

Evidence: a walk of every nav destination in both a dual-engine workspace (Nashville, meet+bracket+display)
and a meet-only workspace (F&K) at 1280px, plus two source traces. Control counts are interactive
controls in the content area, excluding the global rail, top bar and sidebar.

---

## 0. The premise that does not hold, and what you almost certainly saw

**Neither roster edits inline.** Both open a docked side panel on row click, and have since July:
Meet at `RosterTab.tsx:715`, Bracket at `BracketRosterTab.tsx:207`, both onto `DetailDock` at `e149caa`.
There is no `editingId`-style state anywhere in the frontend. The browser walk confirms it independently:
**no surface in the app replaces a row with inline edit fields.**

Two things in the product do behave the way the complaint describes, and both are real problems:

| What | Where | Why it reads as "row replacement" |
| --- | --- | --- |
| **The Meet Matches Event cell** | `MatchesSpreadsheet.tsx:285` | Every row carries a live `Select`, a text input, four player buttons and five delete buttons. Each calls `stopPropagation` **specifically so the row click does not open the panel**. The row is the editor. |
| **The Meet Roster lineup cells** | `CellChips.tsx:39` | Each player chip carries an inline `✕` unassign that fires immediately, inside a cell whose click means "open the panel". |

A third possibility I cannot rule out from source: **the dock silently degrades to a covering overlay
when the window is too narrow.** `DetailDock.tsx:64` falls back to an absolute right-edge layer when
`containerWidth - width < minContentWidth`. Meet roster passes `minContentWidth={820}` with `width=380`,
so it needs a **≥1200px container** to dock; Bracket needs ≥940px. Below that the panel covers the table
rather than reflowing beside it, which would look exactly like the row being replaced. `debt-log.md:120`
already records that this fallback keeps `role="complementary"` and has no outside-click dismissal.

**This changes what to build.** "Migrate the rosters to a side panel" is a no-op. The work that answers
the complaint is: get the editors out of the Matches rows, get the destructive controls out of every
row, and make the dock stop degrading silently. Those are addressed in §1 and §2.

**Do not accidentally re-open a settled decision.** Structural convergence of the two rosters (Meet =
school tabs + position grid + drawer; Bracket = flat list + detail) was explicitly deferred as a product
call, not an oversight: *"layout convergence would be a redesign, not a re-skin"* (`FRONTEND_PROGRESS.md:231`,
`:258`, still open at `:581`). Nothing proposed here requires re-opening it.

---

## Theme 1. Destructive controls live inside the click target that means "just look at this"

This is the strongest finding in the pass and the real substance behind the misclick complaint. The
pattern repeats on eleven surfaces: a row or cell whose click is a *safe, informational* gesture
contains a control whose click is *destructive and immediate*.

| # | Surface | The hazard | Separation |
| --- | --- | --- | --- |
| 1.1 | Meet Roster lineup | **24 `✕` unassign targets on screen at once**, one per seat, each beside the name button. No confirm, no undo (`CellChips.tsx:39`) | ~4px |
| 1.2 | Meet Roster pool row | The whole row is a dnd-kit drag source with `MouseSensor` activating at **4px of travel** (`RosterTab.tsx:146`). A click that drifts four pixels becomes a drag | n/a |
| 1.3 | Bracket Matches dock | **Walkover / Retired (injury) / Forfeit** — three buttons that each write a match result, in a row | ~8px |
| 1.4 | Operations Run dock | **Record result** (terminal by design) next to **Postpone** | ~10px |
| 1.5 | Operations Plan header | **Re-solve meet** (discards the plan) and **Plan ready ✓** (commits it) as two same-size, same-colour buttons | 8px |
| 1.6 | Legacy Plan header | Five buttons, with **Generate** (replaces the entire schedule) styled as the primary | 8px |
| 1.7 | Legacy Run, Finished tab | **73 `Undo` buttons**, one inside each row's own click target | ~8px from edge |
| 1.8 | Workspace › Sync | **10 `Restore` buttons** (each replaces current state), bare text styled identically to the row text around them | 65px apart |
| 1.9 | Workspace › Sharing | **Rotate link** (revokes the live venue display immediately) beside **Copy** and **Open fullscreen**, identical styling | 24px |
| 1.10 | Meet Matches row | `✕` remove-player and `✕` remove-match, both at the row's right edge | 23px |
| 1.11 | Hub row "…" | `Settings` and `Delete` as adjacent 32px menu items, no separator, no gap | 0px |

Two-click arming already exists in this codebase and is proven (`ConfirmDeleteButton.tsx`, and the Run
inspector's Record button, which arms and disarms on Escape). It is applied to **two** of the eleven.

### Proposal 1

- **A destructive control never shares a click target with a safe one.** Where a row opens a panel, the
  row's own destructive actions move into the panel or into an overflow menu. This alone resolves 1.1,
  1.7, 1.10 and most of 1.3.
- **Every irreversible action arms.** Extend the existing `ConfirmDeleteButton` / Record pattern to
  Restore, Rotate link, Generate, Re-solve, Disable module, and the contingency trio. No new component.
- **Destructive never wears the primary style.** 1.5 and 1.6 are colour bugs as much as spacing bugs.
- **Raise the drag threshold** on the roster pool from 4px to the ~8px the platform conventionally uses,
  or require a drag handle. 4px is inside normal click jitter.

---

## Theme 2. Three panel systems, and none of them has a content grammar

Thirteen detail panels exist. They run on **three unrelated systems**:

1. `detail-dock` + `DetailPanel` (380px, caps-eyebrow section labels) — both rosters, both match lists, draws
2. The Operations `run-inspector` — no headings, no rules, no eyebrow at all
3. The legacy always-mounted right rail (Details / Candidates tabs + an alerts feed) — legacy Plan and Run

**Six of thirteen bypass `DetailPanel`'s chrome; three of those also bypass `DetailDock`** and hard-code
their own widths (`BracketScheduleSidebar.tsx:69`, `ScheduleSidebar.tsx:109`, `WorkspaceInspector.tsx:110`)
— which is the exact pattern `DetailDock`'s own docblock says it was built to replace. Already logged at
`debt-log.md:119`.

The root cause of "so much info with no organization" is a deliberate design decision that was never
followed up: **`DetailPanel` owns no content opinion** (`DetailPanel.tsx:14`). It provides a header, a
close button and a scroll body, and stops. So every consumer invents its own field layout, and:

- **Meet's roster panel puts 10 editable controls** (a doubles position renders the whole 7-block form
  **twice**, stacked, with no separating label) under a single flat `flex flex-col gap-3`. No headings,
  no rules, no fieldset (`PlayerDetailPanel.tsx:104`).
- **Bracket's roster panel** uses the same flat container for 4 fields, in a **different order**, with a
  **different label recipe** (`BracketRosterTab.tsx:318`).
- **Four competing label recipes** exist across the thirteen: imported `EYEBROW_CLASS`; `EYEBROW_CLASS`
  re-typed inline; `text-xs font-medium`; and `text-3xs` variants. `MatchDetailsPanel.tsx` uses three of
  them in one file.

Meanwhile a `Section` / `Row` / `FieldRow` grammar **already exists** and is used by all 13 config
surfaces (`SettingsControls.tsx`). **Zero panels import any of it.** And `SectionCard`, whose own
docstring says it is "used to group inspector / settings sections", has exactly one consumer, which is
not an inspector.

> Correction to the brief I was given: `docs/audits/15-frontend-design-review.md` §6 does **not** describe
> an unfinished effort. It reports the config-surface unification as complete (~56 hand-copied label
> instances replaced across 40 files, Bracket switcher retired). §6 never mentions detail panels at all.
> The honest statement is not "the grammar effort stopped partway" but **"the grammar was never in scope
> for panels."**

### Proposal 2

- **Give `DetailPanel` a content grammar** by extending it with the primitives that already exist, rather
  than inventing a second system: `SectionCard` for grouping, and the `Section`/`FieldRow` pair for the
  fields inside. One label recipe, imported, never re-typed.
- **Fix the order disagreement.** The two roster panels present the same four concepts in two different
  orders. Pick one (Identity, Availability, Events, Notes reads best: who they are, when they can play,
  what they play, free text last) and apply it to both. This is a re-skin, not the deferred structural
  convergence.
- **Split the doubles position panel.** Two occupants stacked with no separator is the single densest
  thing in the app. Two labelled sections, or a seat switcher.
- **Fold the three systems into one.** The Operations inspector adopting `DetailPanel` closes the largest
  gap; the three hard-coded rails are already logged debt and can follow.
- **Fix the dock's silent degradation** (§0): below its width threshold it should either say it is an
  overlay and dismiss on outside click, or the surface should drop to a different layout deliberately.

---

## Theme 3. Event selection is five unrelated controls and has no home in the nav

There is **no event picker component**. `EventsControl` is shared *chrome* only; its docblock says it has
"no write path and no semantics of its own". Every actual selection mechanism was built independently:

| Where | Control | Problem |
| --- | --- | --- |
| Meet roster | Events are **fixed table columns** with per-column hide toggles | Not a picker; adding an event is a Configuration trip |
| Meet Matches | Radix `Select` **with 74 options in one flat ungrouped list**, no search, popover 703px tall | Measured on the 73-match workspace |
| Player dock | Chip grid inside an accordion (11 chips for XD1…XD11) | **Expanding a discipline marked "Not entered" opens an empty body with no control to enter the player** |
| Bracket draws / matches | Group headers, **no picker at all** | Grouping substituting for selection |
| Draw dock | **76 checkboxes in a 380px pane**, no search, no filter, Commit ~800px down | 79 controls in one dock |
| Bracket Draw view | Radix `Select`, label `id · discipline` | |
| Bracket Schedule view | Hand-rolled unicode ☑/☐ buttons, **no `aria-pressed`**, and it **dims rather than filters** | Same header component, one view over |
| Public display board | The same Radix `Select`, **relabelled to discipline-only**, id dropped | Same data, two labels |
| Operations Plan / Run | **Nothing.** No event filter or search on either board | |

Three further inconsistencies for one concept:

- **Assigning a player to an event has three interaction models in Meet alone** — drag a chip to a grid
  cell, click an empty cell for a search combobox, or open the dock and toggle rank chips. All three
  write the same `player.ranks` field and share no code.
- **Declaring a discipline is validated in Meet** (regex, uppercase, deduped, length-capped) and is a
  **bare free-text input defaulting to the literal string `"MS"` in Bracket** (`BracketDrawsTab.tsx:844`).
- **The nav has no "Events" destination at all.** Event definition lives inside Configuration on both
  engines, which is why it feels like there is no event surface: there is not one.

### Proposal 3

- **Build one event picker component** and use it in all nine places. It needs: search once the option
  count passes ~10, grouping by discipline, and context in the option (entry count, draw size, status) —
  the Draws list already proves the context is available and useful.
- **Give events a home.** A single Events destination per engine, listing every event with its counts and
  status, is what "rudimentary" is really pointing at. Definition currently hides inside Configuration.
- **Make the 74-option Select the first customer.** It is the worst instance and the easiest win.
- **Fix the two-source label bug** (see Defect D1) while you are in there.
- **Decide whether the Schedule strip filters or dims** and make its ARIA state match either way.

---

## Theme 4. Density: the numbers, and what is actually removable

| Surface | Controls (above fold, 1280px) | Note |
| --- | --- | --- |
| Meet Roster | **105** | 4 event columns, XD clipped; F&K has 5 columns, GD clipped |
| Meet Matches | **102** (251 in DOM) | F&K: 101 above fold, **583 in DOM** |
| Legacy Plan | **86** | 8 courts × 8 columns + list + permanent rail |
| Legacy Run | **83** | |
| Draw detail dock | **79** | 76 of them checkboxes, inside 380px |
| Operations Plan (unified) | 45 | |
| Operations Run (unified) | 35 | |
| Display Configuration | 28 | |
| Meet Configuration | 24 | |

The honest reading: the boards and the roster grid are *legitimately* dense, because a court-by-time grid
is the job. **The removable density is concentrated in three places** — the 74-option select, the
76-checkbox dock, and the Matches row that carries ten controls per row because the editors never moved
into the panel. Fixing those three removes more perceived density than any amount of restyling.

Two surfaces are pure duplication and can go: **Global Settings › Modules** is a read-only 0-control
duplicate of the per-workspace Modules tab, and the Notifications section is an empty placeholder.

---

## Theme 5. Two nav labels, four surfaces

`Operations › Plan` and `Operations › Run` each render **entirely different surfaces** depending on
whether the Bracket engine is enabled. Same label, same route, disjoint affordances:

- Run, dual-engine: KPI tiles, queue with statuses, Record result / Postpone, `run-detail-dock`
- Run, meet-only: 8×8 read-only grid, Up Next / Finished tabs, 73 Undo buttons, legacy right rail

They "share a nav label and nothing else". This is already on the books as debt-log **D4**, which I
sharpened earlier today with the reachability consequence: `ModuleOutlet.tsx:52` routes Operations
segments away from `MeetProduct` whenever both engines are enabled, so fixes landed in the meet
control-center reach single-engine workspaces only.

**Proposal 5:** this is a product decision (converge or name them differently), not a styling one. It is
listed here because a user cannot learn one console while this is true, and because it silently decides
where a fix lands.

---

## Defects found along the way

These are bugs, not design opinions. Each was found while doing the above and is independently fixable.

| # | Defect | Where |
| --- | --- | --- |
| D1 | **Renders the literal text "BS1 - undefined 1"** for any operator-defined event code. A hardcoded `RANK_LABELS = {MS,WS,MD,WD,XD}` is interpolated into a user-visible label, while Meet Setup explicitly supports arbitrary codes | `useRankValidation.ts:100` |
| D2 | `'rounded-sm border px-2 py-0.5 ${EYEBROW_CLASS}'` is **single-quoted**, so the literal `${EYEBROW_CLASS}` ships into the className and the three contingency buttons lose their typography | `BracketMatchDetailPanel.tsx:171` |
| D3 | **Bracket roster shows raw slugs** as player names (`alexei-sorokin`) | Bracket Roster |
| D4 | Draws PROGRESS cell **overflows its 104px column to 904px** and collides with the STATUS chip at 1280px | Bracket Draws |
| D5 | Banner claims "Settings are read-only while matches are in play" while **only 6 of 43 controls are disabled** | Meet Configuration |
| D6 | Workspace Settings shows status **"Draft"** while the header and Hub show **LIVE** | Workspace › Settings |
| D7 | Display Configuration's Preview renders **sample data**, not this workspace's matches | Display Config |
| D8 | Expanding a "Not entered" discipline in the player dock opens an **empty body with no way to enter the player** | Meet Roster dock |
| D9 | **Escape discards a pending edit silently.** Bracket's roster fields are uncontrolled and commit on blur; Escape unmounts the input and React does not reliably fire blur on unmount. No test covers it | `BracketRosterTab.tsx:323`, `DetailPanel.tsx:68` |
| D10 | **A 409 clobbers in-flight edits.** `hydrate()` does a wholesale `setState`; Meet's controlled fields replace the operator's text as they type, Bracket's uncontrolled fields silently diverge from the store | `useTournamentState.ts:94`, `:307` |
| D11 | Hub row click **silently drops the Modules column** to make room for the panel | Hub |
| D12 | `EventsFilterStrip` uses unicode ☑/☐ glyph buttons with **no `aria-pressed`** | Bracket Schedule |
| D13 | Position-grid **reassign is double-click on a `div`** — no keyboard path | `PositionCell.tsx:118` |
| D14 | **Export CSV** on Bracket Matches; every other surface says Export XLSX | Bracket Matches |
| D15 | Venue & schedule **saves on change with no Save button**, beneath a banner warning that saving clears the committed schedule | Workspace › Venue |
| D16 | Every Meet roster keystroke sets `scheduleIsStale: true` and re-arms a 500ms whole-blob PUT. **Typing a note invalidates the schedule** | `tournamentStore.ts:197` |

---

## Proposed sequence

Ordered by (harm prevented) ÷ (cost). Nothing here has been started.

**Phase A — stop the misclicks.** Theme 1 in full, plus D9. No new components: extend the existing
two-click arm and move destructive controls out of shared click targets. This is the owner's actual
complaint and the highest-harm set.

**Phase B — the panel grammar.** Theme 2: extend `DetailPanel` with `SectionCard` + `FieldRow`, one label
recipe, one field order, split the doubles panel. Fold the Operations inspector in. Fixes D2 on the way.

**Phase C — the event picker.** Theme 3: one component, nine call sites, starting with the 74-option
select and the 76-checkbox dock. Fixes D1, D12 on the way. **Needs an owner ruling first** on whether
events get their own nav destination.

**Phase D — the defect sweep.** D3–D8, D10, D11, D13–D16. Independent, mostly small.

**Phase E — the two-surfaces problem.** Theme 5 / debt-log D4. **Owner decision, not a task.**

### What needs a ruling before anything starts

1. **Which surface produced the original complaint** (§0): the Matches row editors, or the dock
   overlaying because the window was under 1200px. The answer changes Phase A's first task.
2. **Do events get a nav destination**, or stay inside Configuration (Phase C).
3. **Plan/Run convergence** (Phase E), which is debt-log D4 and predates this pass.

---

## Corrections, written 2026-08-12 after execution

Phases A to D were executed by four agents working from this document. Two of its findings did not
survive contact with the code, and one was right for the wrong reason. Recorded here rather than
edited away, because the difference between what a browser pass can see and what is true is the
useful part.

**1.3 was wrong. The contingency trio does not write results.** This document listed "Walkover /
Retired (injury) / Forfeit, three buttons that each write a match result, ~8px apart" as a top
misclick hazard. They do not write anything: `BracketMatchDetailPanel.tsx:159` shows each one calls
`setReason(r)` and nothing else. The write happens on the separate `contingency-advance-A/B` buttons,
which **already** ran the two-click arm with a global Escape disarm. The browser pass saw three
destructive-looking buttons in a row and inferred a hazard from their appearance.

No arm was added. The behaviour was pinned instead (a test walks all three kinds plus a first advance
press and asserts nothing is recorded), and the row gained `role="group"` so it announces as a choice
rather than as three actions. **Appearance was the entire defect, and appearance is what changed.**

**D5's "only 6 of 43 controls report disabled" was a measurement artifact.** Meet Configuration
already wraps its form in `<LockedFieldset locked={resultsLocked}>` driven by the same flag that
renders the banner. Measured properly: **28 controls rendered, 0 carrying a `disabled` attribute,
28/28 matching `:disabled`.** The native `fieldset[disabled]` cascade makes every descendant
actually-disabled without writing the attribute on any of them, so counting `[disabled]` finds only
the few that carry it for unrelated reasons. **The banner was telling the truth.**

Chasing the wrong hypothesis found a real bug one nav item away: `VenueScheduleTab` carried only the
*schedule* lock, so court count, slot duration and the day window — by that file's own comment "the
MOST scheduling-structural fields in the product" — stayed editable with results recorded. A director
who had just read "Settings are read-only while matches are in play" could move the day window on the
next tab, autosaving, unguarded. Now behind the same lock.

**D6 was right, and the side was not obvious.** Both values are correct facts: `status` is the stored
column the Settings pane edits, and every other surface shows `lifecycleBadge(signals.phase, status)`,
derived from play state. One word, two meanings, and Settings was the only surface using it for the
stored one. Both now appear there, labelled, and **only when they disagree**.

**Two findings turned out to be data-loss bugs rather than the ergonomic ones reported.**

- The Bracket draw's participant picker opened **empty**, and Commit *replaces* the participant list,
  so anyone the operator did not re-tick was silently dropped. Reported here only as "76 checkboxes,
  no search". It now seeds from the existing participants.
- The raw-slug player names (D3) were not a formatting slip: `bracketMigration.ts:31` builds its
  slug-to-name map from *player* participants only, so a doubles-only draw has none and every name
  falls back to its id.

### What was deliberately not done, and why

- **`ScheduleSidebar`'s hard-coded `w-80` stays.** It looks like the pattern `DetailDock` replaced,
  but it is not a detail pane: it is always mounted and hosts an alerts feed plus a tab strip.
  `DetailDock` is selection-keyed, and its narrow fallback would make an always-on alerts rail
  *cover* the Gantt rather than shrink beside it. `debt-log.md:119` stays accurate for it.
- **`Restore` was not armed.** `useConfirmClick`'s own docblock says a two-click arm is "for the
  reversible-ish and the merely-irreversible, not the catastrophic", and Restore already has a Modal
  naming the target file. Arming on top would make it three clicks and substitute a weaker guard for
  a stronger one. It was restyled and given per-backup accessible names instead (ten identical
  "Restore" announcements was its own defect).
- **`Postpone` was not armed**, only separated from `Record result`. Arming a reversible action
  devalues the arm.
- **The Bracket highlight strip was not made a filter.** It has only ever dimmed; the label now reads
  `HIGHLIGHT:` instead of implying a filter it does not perform.
- **Phase E (Plan/Run convergence) was not touched.** It remains debt-log D4 and an owner decision.
