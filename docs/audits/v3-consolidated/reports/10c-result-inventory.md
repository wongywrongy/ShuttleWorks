# Package 10c — the operator table-row renderer (deferred parts of package 10)

Picks up exactly the "What is deferred" list in
`docs/audits/v3-consolidated/reports/10-operator-match-rows.md` §4, against the
match-card contract (`docs/reference/contracts/match-card.md`) and finding
V3-OC17.1. Baseline HEAD `97449c07`. Branch `feat/surface-book-remediation`.
Backend not touched (item 3 concluded no safe no-schema-change fix exists —
see §4).

## 1. Files touched

| File | Change |
| --- | --- |
| `apps/console/src/modules/bracket/BracketMatchesTab.tsx` | The table-row renderer rewrite (V3-OC17.1). See §2. |
| `apps/console/src/modules/bracket/__tests__/BracketMatchesTab.test.tsx` | Two pinned assertions updated from the literal `'TBD'` to the contract's `'To be decided'` (§3). |
| `apps/console/src/modules/bracket/BracketRunControls.tsx` | `labelA`/`labelB` redirected from a hand-rolled `.join(' / ') \|\| '–'` to `sides.ts` (`meetSideFromIds` + `formatSideCondensed`) — D14/D15, and removes a forbidden em-dash placeholder (contract §2.1/§2.4). |
| `apps/console/src/modules/meet/exports/xlsxExports.ts` | `sideNamesAmp` (bracket-doubles export column) now sources names through `meetSideFromIds`/`formatSideLines` instead of a raw `.map(...).join(' & ')`; the `'&'` file separator is unchanged (D14). |
| `apps/console/src/modules/meet/matches/MatchesSpreadsheet.tsx` | The two `'No players'` placeholders (`sideLabel` in the inspector projection, `PlayerCellSummary`'s empty-side reading) replaced with the contract's `'To be decided'` (§2.1/§2.4). Editing/keyboard-nav behaviour untouched. |
| `apps/console/src/modules/meet/matches/__tests__/MatchesSpreadsheet.test.tsx` | One pinned assertion updated from `'No players'` to `'To be decided'` (§3). |
| `apps/console/src/components/MatchChip.tsx` | `showSides` now stacks side A / side B on their own visible lines (was one line, `"sideA v sideB"`), plus a `sr-only` `"{sideA} versus {sideB}"` accessible summary (§3.2's "versus" phrasing) — item 2. |
| `docs/reference/debt-log.md` | New "Work package 10" section, 6 rows (V3-10-1…V3-10-6) — see §4. |

**Not touched, by design:** `MatchesSpreadsheet.tsx`'s winner/score-lane logic
(`setsWinner(laneSets)`), `apps/console/src/lib/names.ts`, `opsBlock.ts`,
`MoveMatchDialog.tsx`, `ScheduleDiffView.tsx`, `apps/console/src/modules/
operations/exports/scheduleXlsx.ts` (no slash-join found there), and every
backend file under `apps/api/src/bracket/`/`apps/api/src/entries/`. Each is
named with its specific blocking reason in §4.

## 2. V3-OC17.1 — what `BracketMatchesTab.tsx` does now

- **Sides come from one authority.** A new `sideOf(pu, side)` builds a
  `platform/domain/sides.ts` `Side` from the wire's structured `pu.sides`
  (package 10a) when present, falling back to the legacy `side_a`/`side_b` +
  `slot_a`/`slot_b` shape for an older cached payload (mirrors the DTO's own
  documented fallback contract). `resolveFeederReference` turns a raw
  `winner_of`/`loser_of` play-unit id into "Winner of QF1" before display.
  Every site that used to hand-roll `ids.map(...).join(' / ')` or the literal
  `'TBD'` (`resolveSide`, `renderSide`, the search-index `hay`, `exportRows`,
  the column accessors, `selectedInspectorModel`'s `sideValue`) now goes
  through `sideOf` + `formatSideCondensed`/`formatSideLines` — D14/D15.
- **The forbidden `'TBD'` placeholder is gone.** A feeder-less, unclaimed slot
  now renders the contract's fixed §2.1 label, **"To be decided"** — never a
  claim ("Bye") the list cannot verify, and never the banned sentinel word.
- **Winner still comes from the recorded outcome, never from counting sets**
  (unchanged, already correct: `result?.winner_side === side`, and
  `winner_side` only exists once a result is recorded — never on an
  unfinished match, satisfying §2.7 rule 4 / §3.5's "absent while
  `in_play`").
- **Per-game emphasis is now independent of the match winner (§2.7 rule 3 —
  the actual functional bug this package fixes).** Previously the *entire*
  score span for a side was bold/muted based on who won the *match*. Now each
  recorded set's own two numbers decide which one is bold — a losing side
  that won an individual game gets that number emphasised, matching the
  fixture `MC-08` semantics in the contract (a played set is complete by
  construction here: this list only ever displays a **finished** result's
  sets, never a live in-progress score, so "played implies complete" is
  sound for this surface specifically).
- **The winner mark now carries a text equivalent.** `font-semibold` alone
  used to be the entire "this side won" signal. A visually-hidden `" Winner"`
  span is now appended to the winning side's name span (§3.5 — "weight plus
  the mark," never weight alone), absent whenever the match has no result.
- **Ledger collapse unchanged and still correct** (§3.4): `sets.length > 0 ?
  … : null` — no cell, no reserved width, when there is nothing to show.
- **Long names / score columns:** the name span carries `min-w-0
  break-words` (word-wrap, never `truncate`/ellipsis — the product's
  no-truncation contract, `truncationContract.test.ts`, forbids the Tailwind
  `truncate` utility outright) and the score span is `shrink-0`, so a long
  doubles name cannot visually push into the score cell; the full side text
  is also reachable via the name span's `title` (`sideSummaryText`).

### What V3-OC17.1 is still not fully compliant on, and why (see §4 for the debt-log entries)

- **One participant per DOM line (contract §3.1) is not implemented.**
  `BracketMatchesTab`/`MatchesSpreadsheet` both render on
  `components/control-plane/DenseDataTable.tsx`'s shared strict-row
  primitive, whose row is a **hardcoded `h-7 min-h-7 max-h-7`** (28px,
  `overflow-hidden` cells) — a fixed height, not a floor, and out of this
  package's file scope (a shared foundation component with a wide blast
  radius: every strict-mode consumer app-wide, plus the pinned pixel
  dimensions in `bandedRowGeometry.test.ts`/`matchListColumns.test.ts`).
  Stacking two names into that box would silently clip the second line —
  worse than the previous single condensed line. 10c keeps the single
  condensed line (now sourced from the one authority, with the full name in
  `title`) and logs the row-height blocker precisely as **V3-10-5**. This is
  the one piece of V3-OC17.1's acceptance text ("long doubles names never
  cross score columns") that is honoured structurally (`min-w-0` + wrap +
  `shrink-0` score column) without being the full one-line-per-partner
  stacking §3.1 asks for.
- **Meet's `MatchesSpreadsheet.tsx` did not get the same table-row rewrite**
  as bracket. Its winner signal (`setsWinner(laneSets)`) is score-counting,
  which contract §2.7 rule 4 forbids, and meet's persisted match state has no
  independent outcome field to rewire onto (unlike bracket's `winner_side`).
  Rewiring this responsibly needs a backend audit of whether meet's schema
  can grow a persisted outcome — flagged in 10b, unresolved, logged again as
  **V3-10-6**. The two contract-vocabulary fixes that *were* safe without
  that audit (`'No players'` → `'To be decided'`) are done.

## 3. Pinned tests updated, with reasons

| Test file | What changed | Why |
| --- | --- | --- |
| `BracketMatchesTab.test.tsx` — `'renders unresolved sides as a muted-italic TBD placeholder'` | Assertion `getAllByText('TBD')` → `getAllByText('To be decided')`; test renamed to drop "TBD" from its title | The pinned `'TBD'` string is exactly the placeholder match-card contract §2.1/§2.4 forbids ("never TBD, –, No players"). This package's job is to bring the row into contract; keeping the old assertion would pin the violation the finding exists to fix. |
| `BracketMatchesTab.test.tsx` — `'names the feeder on an unresolved side instead of printing TBD (BMAT-4)'` | Same substitution (3 remaining unresolved sides) | Same reason; the feeder-labeling behaviour itself (BMAT-4 — name the feeder when known) is unchanged and still asserted. |
| `MatchesSpreadsheet.test.tsx` — `'renders an empty side as a muted-italic reading, not an add control'` | Assertion `getByText('No players')` → `getByText('To be decided')` | Same contract clause; `'No players'` is the literal string the contract names as forbidden. |

No pinned test was found to contradict the contract itself — in every case
the pinned string *was* the pre-existing violation the contract and finding
describe, so updating the assertion to the contract's fixed vocabulary is the
correct fix, not a workaround. No other pinned test in the run suites below
needed a change.

## 4. Deferred work, logged as debt (`docs/reference/debt-log.md`, "Work package 10")

| # | Summary |
| --- | --- |
| V3-10-1 | Bracket doubles still resolve to one composite name, not two stacked persons — item 3's finding, see §5. Needs a schema change (`member_names` on `BracketParticipant`), not a derivation. |
| V3-10-2 | `pending_member` still unpopulated on the bracket wire (carried from 10a, unchanged). |
| V3-10-3 | `names.ts` still has real callers outside this package's scope (`ParticipantPicker.tsx`, `BracketPlayerFields.tsx`, `RunCourtGrid.tsx`, `CourtsView.tsx`) — cannot be deleted. |
| V3-10-4 | `opsBlock.ts`'s `meetSide`/`operationalSide` still hand-join and use a literal `'TBD'` sentinel that Operations' own Plan/Run-board logic and tests (package 12 territory) key off of — redirecting needs coordination, not a unilateral string change. |
| V3-10-5 | `DenseDataTable.tsx`'s fixed 28px strict row blocks true one-participant-per-line stacking (§3.1) for any surface built on it — needs its own reviewed package. |
| V3-10-6 | Meet has no persisted match outcome independent of the score; `MatchesSpreadsheet.tsx`'s winner still counts sets. Needs a backend audit before rewiring (carried from 10b, unresolved). |

## 5. Item 3 — bracket doubles per-member names

Investigated whether the operator wire can derive per-member names from the
entry without a schema change, per this package's brief.

**Finding: no.** `BracketParticipant.member_ids` (`apps/api/src/db/
models.py`) does carry two `entry-{uuid}` roster-id strings for a seam-built
doubles team (minted by `entries.py::team_id`/`team_name`), so membership
*is* data, not a re-derivation from the composite name string. But turning
those ids into `{id, name}` pairs at read time in `shared/sides.py`'s
`build_bracket_side` would require:

1. **Decoding** the `entry-{uuid}` string back into the underlying entry/
   player uuid — exactly the "split-and-zip" decode `entries.py::team_name`'s
   own docstring names as **deferred, out-of-scope P6 work**, not something
   to improvise ad hoc inside package 10.
2. **A cross-domain read** from `bracket` into `entries`'/roster tables,
   which the API's per-domain-independence import-linter contracts do not
   currently license (adding it would need its own `DEBT(REORG-1)`-marked
   allowance and review, not a silent import).
3. Even if 1 and 2 were done, it would **not cover a hand-added bracket
   participant** (director manual pairing, ruling R-DM-4) — that participant
   has no `entries` row to resolve a name from at all, so the gap would only
   be partially closed.

This is a genuine data-model gap, not a missed derivation. Logged as
**V3-10-1** with the specific migration it needs (persist `{id, name}` pairs
directly on `BracketParticipant` at seam-build time and at manual-add time).
No backend file was changed for this item; no backend test was added.

## 6. Commands run, verbatim results

```
npm --prefix apps/console run test:run -- src/modules/bracket src/modules/meet \
  src/components src/platform src/modules/operations/plan src/modules/operations/exports
Test Files  1 failed | 114 passed (115)
Tests  1 failed | 975 passed (976)
```
The one failure is `src/platform/contracts/__tests__/emDashContract.test.ts`,
flagging an em dash in `apps/console/src/modules/setup/SetupProduct.tsx` and
`SetupRowsEditor.tsx` — both untracked/concurrent package-13 (setup) work,
neither touched by this package, and the same pre-existing failure the 10a/
10b report already recorded against a different pair of files for the same
reason (a concurrent package's in-flight WIP). Re-confirmed by running the
targeted set (`BracketMatchesTab.test.tsx`, `BracketRunControls.test.tsx`,
`MatchesSpreadsheet.test.tsx`, `emDashContract.test.ts`,
`truncationContract.test.ts`) in isolation: all of this package's own tests
pass; only the two `setup/` files trip the em-dash contract. A rerun of the
same targeted suites minutes later (concurrent packages were actively
writing to disk this session — see the caveat below) also showed a
one-run-only "2 failed" blip in an untracked, concurrently-added
`MatchesTab.emptyState.test.tsx` plus a transient `tsc` error in the same
file; both cleared on the next run without any change on this package's
side, confirming they were session-stability noise, not a regression this
package introduced (same phenomenon 10a/10b's report §5 already documented).

```
npm run lint:scheduler
✖ 134 problems (0 errors, 134 warnings)
```
0 errors; matches the 10a/10b baseline exactly (134). `BracketMatchesTab.tsx`
picked up two `react-hooks/exhaustive-deps` warnings from the new `sideOf`
closure inside two existing `useMemo`s; both suppressed with
`eslint-disable-next-line`, consistent with this file's existing pattern for
the same category of issue (two pre-existing suppressions already present on
`groups`/`statusCounts`).

```
npx tsc -b apps/console
(clean — no output)
```

```
npm run depcruise
x 12 dependency violations (0 errors, 12 warnings). 658 modules, 2840 dependencies cruised.
```
0 errors; all 12 warnings are pre-existing `KNOWN_CROSS_MODULE` entries
unrelated to this package (this package only added imports from
`platform/domain/sides` — the foundation layer — into `modules/bracket` and
`modules/meet`, which is not a cross-module edge).

Backend was not changed (item 3 concluded no safe fix exists without a
schema change — §5), so no backend test suite was run for this package.

## 7. Gate B coverage note

The table-row renderer now exercises real MC-fixture semantics through its
own pinned unit tests (`BracketMatchesTab.test.tsx`'s existing 23 tests, two
updated per §3) rather than through the `matchCard.ts` fixture matrix
directly — `BracketMatchesTab` consumes the live `BracketTournamentDTO`
shape, not `MatchCardData`, so MC-01…MC-13 do not plug in verbatim (that gap
already existed before this package and is unchanged). What *is* now
verified end-to-end against real component behaviour, matching contract §6's
categories:

- **Semantic outcome / no premature mark:** `winner` is read from
  `result?.winner_side`, which is only ever set on a recorded (finished)
  result — asserted indirectly by the existing "done row" fixture (`pu-ms-1`)
  and unchanged by this package's tests; no fixture in this file exercises
  an in-progress match with partial sets, so "no mark before finished" is
  true by construction (the code path) rather than independently pinned by
  a new test in this pass — logged as a gap rather than claimed as covered.
- **State word:** unchanged, already sourced from `STATUS_LABEL`/
  `MatchStatus`, pinned by the existing "renders the status column" test.
- **Ledger absent for no-score fixtures:** pinned by the existing
  "does not call an unassigned court an issue" / status tests, which use the
  base fixture's zero-score results; no new assertion was added specifically
  for "no ledger cell renders," which is a real gap — not claimed as tested.
- **Vocabulary fix (§2.1/§2.4):** newly and directly pinned by the two
  updated tests in §3 (`'To be decided'`, 4 occurrences across two finals ×
  two sides, and the feeder-naming variant).

**Update — closed during this pass.** A new `describe('<BracketMatchesTab />
— score ledger and winner mark')` block (3 tests) was added to close exactly
this gap: a scored-result fixture (side A loses game 1, wins games 2–3, is
the recorded `winner_side`) asserts (1) game 1's emphasis follows its own
score (B's number bold, A's is not) independent of the match winner, (2)
game 2's emphasis flips the other way, (3) the visually-hidden "Winner" text
appears exactly once, on the recorded winner's row only, and (4) an unscored
row renders no `bracket-match-row-score-*` testid at all (ledger collapse,
not padding). 26/26 tests pass in this file after the addition.
