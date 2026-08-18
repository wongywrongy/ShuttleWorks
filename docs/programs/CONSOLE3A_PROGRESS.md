# SP-CONSOLE-3A — Result side blocks & event assignment picker · ledger

Read at session start, update at session end. Companion slice to
SP-CONSOLE-3 (which closed first — INS-N1 **has landed**, so RES-2 takes
the landed branch: the side blocks evolve `ResultSides` inside the
state-exclusive panel structure). Branch **`design/console-3`**. Scope:
frontend presentation/interaction only; zero endpoint, DTO or store-shape
changes.

## Owner rulings (2026-08-18)

- **R-F — picker direction: Option A (smart full picker).** Player→events
  stays a complete surface: sections, open/occupied split, explicit
  replace (PICK-1..4 in full). Phase 0 reported the events→players
  direction (the roster position grid, same tab, with
  `onSelectPosition`/`highlightedRank` targeting already built) — owner
  chose the full picker anyway.
- **PICK-4 — full form via client derivation.** The has-results signal is
  NOT server-computed on the wire (the `hasData` precedent is per-module
  only, `workspace_modules.py::_module_has_data`). It IS purely
  client-derivable from data already on the wire: `matches[].eventRank` +
  side ids × `matchStateStore` (hydrated by the lightweight
  `useMatchStateSync(tid)` loader), with `useMeetResultsLock` as exact
  prior art. Owner ratified that reading — rows disable with the reason
  inline (WSMOD-2), no wire changes. Residual, accepted: before the store
  hydrates the guard is silently off (fail-open — the same documented
  caveat `useMeetResultsLock` carries).
- **PICK-5 — legitimate; leave as is.** Same player on two singles slots
  (demo's Dylan Marchetti, BS3+BS7) is model-legitimate multi-entry: the
  league seeder deliberately enters juniors 3–4 times via a per-band
  cycling queue, and nothing in frontend/backend/solver forbids
  same-discipline double-entry. No seed or model change.

## Phase 0 corrections worth remembering

- **The directive's "expected: bracket roster player expansion" was
  wrong.** The player→event checkbox surface is `EventPicker` (multiple)
  via `PlayerEventsField`, rendering on exactly two surfaces, both MEET:
  roster detail pane (`PlayerDetailPanel.tsx`) and Matches player-card
  expansion (`MatchSideSection.tsx`). Bracket's equivalent is a different
  component (`BracketPlayerFields.tsx` Enter/Entered toggles) that already
  hard-locks entries once a draw is generated — stronger than PICK-4 asks.
  **Picker scope = the two Meet surfaces; bracket untouched.**
- `EventPicker` is shared by single-select consumers (match event field,
  bracket ParticipantPicker ×2 — one of which is `multiple` too), so every
  new picker behavior is an **opt-in prop**; defaults leave the other
  five surfaces byte-identical.
- **What unassign-with-results actually does today** (the PICK-4 trap,
  verified): silent success. Ranks shrink → debounced autosave
  `PUT /state`; the played match keeps its players and recorded
  match-state. Destruction arrives LATER via Matches → Regenerate (fresh
  match identities orphan recorded state — RegenerateMenu documents it).
  Guard copy must say that, not claim immediate deletion.
- Result card was already one shared component pair
  (`ResultSides`/`ResultSideBlock` in `control-plane/MatchCard.tsx`) with
  exactly two consumers — the directive's "one shared component across
  both panels" done-condition was true at Phase 0; RES-1 reworks its
  anatomy in place. The meet control-center `MatchDetailsPanel` (live
  score entry) has no Result card — out of scope.
- Bracket set scores are on the wire (`result.score.sets`); Meet passes
  per-set `matchState.sets` or a single aggregate pair — both are
  `SetPair[]`, so the fixed-width score slot needs no adapters.

## Directives

| ID | Status | Notes |
|---|---|---|
| RES-1 | DONE | Rail (identity chip · reason · centered fixed-width score) per side; winner by block weight, dot removed from Result blocks only (lists/MatchCard keep `WinnerDot`); hairline `divide-y` between blocks; per-player chips suppressed in the finished block (identity moves to the expanded row). |
| RES-2 | DONE | Landed-INS-N1 branch: reworked in place inside the state-exclusive structure; both exclusivity tests pass unmodified. |
| PICK-1 | DONE | Removable selected-chips row pinned above the list (opt-in `selectedChips`); locked entries render chip without ×. |
| PICK-2 | DONE | Opt-in collapsible sections (open = player's entered disciplines; search overrides collapse); open-before-occupied sort in `PlayerEventsField`; occupied rows muted with occupant name; search matches occupant names via `occupiedBy`. **Known gap:** a HALF-open doubles seat shows its occupant via `meta` (open styling, correctly sorted as open) but that name is not in the search haystack — only FULL slots' occupants are searchable. The swap lookup the directive names targets full slots, so accepted; extend `occupiedBy` semantics if the desk asks for partner-search. |
| PICK-3 | DONE | Occupied-singles click arms an inline confirm naming the displaced player; assignment only on confirm. Silent displacement is dead on this surface (grid drag path unchanged — out of scope). |
| PICK-4 | DONE | Full form: `useEventResultsGuard` (started+finished, per `useMeetResultsLock` precedent) disables the row/chip with inline reason; covers unassign AND replace-of-occupant-with-results; `useMatchStateSync` mounted on RosterTab. Negative control recorded below. |
| PICK-5 | RULED | Legitimate — no change (see rulings). |

## Negative controls (CODE_HEALTH 3b)

- **PICK-4 guard:** stubbed `useEventResultsGuard`'s return to constant
  `false` (guard removed) → `playerEventsPicker.test.tsx` run: **3 failed
  | 4 passed** — the failures were exactly the three lock assertions
  ("locks the own-entry row and its chip", "locks replacing an occupant
  whose result it is", "refuses the unassign on the write path even past
  the DOM guard"). Reverted.
- **INS-N1 exclusivity (RES-2):** not re-proven — the SP-CONSOLE-3
  assertion tests pass UNMODIFIED against the reworked block (16/16 in
  `MatchDetailPanel.test.tsx`, 10/10 bracket), which is the requirement.

## Ratified baseline edits

- `rosterDetailPanel.test.tsx` (2 tests): PICK-2's collapsed-by-default
  sections changed the resting state those tests assumed — they now
  expand the section first; the D8 substance (every configured event
  offerable, operator codes have a home) still asserted.

## Test copy note

- The lock reason is `result recorded · locked` (middot) — an em dash
  here trips the rendered-text em-dash contract
  (`emDashContract.test.ts`), which is how the first `make check` run
  caught it.

## Screenshots

`docs/screenshots/console3a-2026-08-18/` (gitignored) — a-01 finished
Meet panel (games tally "2", NBA/MCS side chips, weight winner) ·
a-02 finished Bracket panel (three-set 21/16/12 columns, XDC [3] rail
badge) · a-03 picker with chips + locked XD1 + occupied sections (Tomas
Havel, Nashville) · a-04 picker resting, all sections collapsed ·
a-05 replace confirm ("Replace Aiden Nakamura in BS1?"). The replace shot
came from a throwaway workspace (F&K org) created and deleted in-session
— the real F&K league is fully played, so every occupied slot there is
correctly results-locked (the lock screenshotted in a-03 is the live
demo data, not staged). Replace was also exercised END-TO-END live
(Marco Silva displaced Aiden Nakamura, then the workspace was deleted).

## Gates (2026-08-18 close)

- `make check` **exit 0** (eslint + tsc -b + typecheck:entrant + vitest +
  depcruise + ruff + pytest; the docs-freshness BEHIND report is advisory
  as ever). The FIRST run failed on exactly one test — the em-dash
  contract against the new lock copy (see note above) — fixed and re-run.
- vitest **1795 passed / 0 failed**, 204 files (SP-CONSOLE-3 baseline
  1784; +11 = 7 `playerEventsPicker` + 4 `EventPicker` opt-in tests; the
  2 rosterDetailPanel edits are ratified above, count-neutral).
- eslint **0 errors / 122 warnings** — the SP-CONSOLE-3 baseline exactly;
  no new warnings.
- pytest green inside `make check` (backend untouched by this slice).
- Contrast: no new color pairs — occupied/locked rows and the side rail
  use `text-muted-foreground`/`text-foreground` only; chips reuse the
  `EventBadge` accent recipe. The existing both-themes contrast gate
  covers every pair.
