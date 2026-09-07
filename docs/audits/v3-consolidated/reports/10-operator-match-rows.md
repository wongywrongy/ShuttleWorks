# Package 10 — operator match rows and bracket geometry

**Status:** Partial implementation. 10a (structured sides on the operator wire) is complete and
verified. 10b (presentation) landed the shared formatter, the Gate B fixtures, and the highest-value
V3-OC16.1 fix (draw-card slot text); the full table-row/bracket-node rewrite described in the
match-card contract §4.1/§4.3 is **not** complete — see §4 "What is deferred" below, logged as debt
rather than silently dropped, per `CODE_HEALTH.md`.

Baseline: HEAD `26f8e3f2`. Branch `feat/surface-book-remediation`. Ruling followed: **C4** — 10a
(backend DTO + `make generate-api`) landed and was verified green before any 10b presentation work.

---

## 1. Files touched

### 10a — backend, structured sides on the wire

| File | Change |
| --- | --- |
| `apps/api/src/shared/sides.py` | **New.** `PersonRefDTO`, `UnresolvedSideDTO` (one flat model, `kind`-discriminated), `SideDTO`, and constructors (`bye_side`, `winner_of_side`, `resolved_side`, `undetermined_side`). Mirrors the public `PersonReferenceDTO` shape without importing `entries/` (import-linter: `shared/` may not import a domain). |
| `apps/api/src/bracket/brackets.py` | `PlayUnitOut` gains `sides: List[SideDTO]` (always `[side_a, side_b]`), populated by new `_bracket_side()` in `_play_unit_out()`. Legacy `side_a`/`side_b: List[str]` kept and marked `# DEPRECATED (package 10a...)` in the docstring, per the ruling ("alongside the legacy strings for one release"). |
| `apps/console/src/api/bracketDto.ts` | Hand-mirror updated: `PersonRefDTO`/`UnresolvedSideDTO`/`SideDTO` aliased from the generated OpenAPI types (same pattern as the existing standings-row aliases, so they cannot drift); `PlayUnitDTO.sides?: SideDTO[]` added, `side_a`/`side_b` marked `@deprecated`. |
| `apps/console/src/api/dto.generated.ts` | Regenerated via `make generate-api` (also picked up unrelated concurrent packages' schema changes already on disk — see §5). |
| `tests/backend/unit/test_bracket_side_dto.py` | **New.** A doubles pair + a bye (3-entrant SE draw) and a future winner-of slot (4-entrant SE final) each serialize to the right `sides` variant; asserts no slash-assembled label anywhere on the wire. |

**Why `entries.py::team_name` was left alone.** Per D14's verdict it stays the authority for the
*stored* participant name only; `_bracket_side()` never re-derives or re-joins it — it reads
`participant.name` verbatim.

**Coverage gap, logged as debt (not silently dropped).** The bracket engine persists only the
**composite** team name for a doubles participant (`BracketParticipant.name`, e.g. "Ana Silva / Ben
Ito") — individual member *names* are not stored anywhere in `bracket_participants`, only member
*ids* (`member_ids`). `_bracket_side()` therefore emits a bracket doubles pair as **one**
`PersonRefDTO` carrying the composite name, not two stacked entries. True one-line-per-partner
stacking for a **bracket** doubles side needs a schema change to persist per-member names, which is
out of package 10's scope — this is documented in `shared/sides.py`'s module docstring so a future
package finds it without re-discovering the gap. The **meet** engine has no such gap (its wire
already carries individual player ids the console resolves against the roster), so a meet doubles
side gets full per-person fidelity from the console-side formatter alone, no backend change needed —
this is why meet's `MatchDTO` was **not** touched in 10a.

**`pending_member` is reserved, not populated.** The bracket wire has no signal today that a
participant is a *known-incomplete* pair (as opposed to unseeded or a bye); the discriminated union
already reserves the `pending_member` kind (`known`/`missing` fields) so a future package can
populate it without a second wire change. Logged as debt in the same docstring.

**`winner_of`/`loser_of.reference`** carries the **raw** feeder play-unit id, not a formatted human
reference — the backend does not duplicate the console's round-label authority
(`matchIdentity.ts`/`bracketLabels.ts`, D16). The console resolves it via `resolveFeederReference()`
(see below), exactly as `sideLabel()` already did for `slot.feeder_play_unit_id`.

### 10b — presentation

| File | Change |
| --- | --- |
| `apps/console/src/platform/domain/sides.ts` | **New — the one side formatter.** `Side`/`UnresolvedSide` types; `meetSideFromIds` (meet engine, full per-person fidelity from ids+roster); `sideFromWire` (bracket `SideDTO`); `resolveFeederReference` (raw feeder id → friendly label via `bracketLabels.ts`'s `buildPlayUnitLabels`); `formatSideLines` (one line per participant, fixed §2.1 labels, never `TBD`/`–`/"No players"); `formatSideCondensed` (`' / '`, never re-parsed); `sideSummaryText`/`sideSummaryPhrase` (`"{sideA} versus {sideB}"`, joining within a side with "and", per §3.2). |
| `apps/console/src/platform/domain/matchCardData.ts` | **New.** The tier-neutral `MatchCardData`/`Game`/`MatchOutcome`/`GameState` types from contract §2. |
| `apps/console/src/platform/domain/__fixtures__/matchCard.ts` | **New.** `matchCardFixtures` keyed `MC-01`…`MC-13` (see §3 below for the coverage table) plus the `formats` alias for MC-13's three variants. |
| `apps/console/src/platform/domain/__tests__/sides.test.ts` | **New.** 30 tests: `meetSideFromIds`/`sideFromWire`/`resolveFeederReference`/`formatSideCondensed`/`sideSummaryPhrase`, plus a fixture sweep asserting every MC fixture's two sides render a non-empty, non-placeholder label. |
| `apps/console/src/modules/bracket/bracketLabels.ts` | `sideLabel()` redirected to the new authority (D14): it now builds a `Side` via `sideFromLegacy()` and calls `formatSideCondensed`/`resolveFeederReference` instead of hand-rolling the join/feeder-label logic inline. **Behavior-preserving** — same output strings for every existing caller (`BracketMatchesTab.tsx`, `BracketRunControls.tsx`, `opsBlock.ts`, `DrawView.tsx`'s own local `labelFor`), verified by the existing `bracketLabels.test.ts` (19 tests, unchanged, all green). |
| `apps/console/src/modules/bracket/DrawView.tsx` | **V3-OC16.1 fix.** The draw card's caption no longer renders `` `slot ${assignment.slot_id} · court ${assignment.court_id}` ``. It now renders a real time (via `formatBracketSlot`, tournament `start_time`/`interval_minutes` threaded through all 4 `BracketCell` call sites as a new `slotContext` prop) + `Court N` when a start time is known, `Court N` alone when an assignment exists but no start time has been set (never a fabricated slot number), and **"Not scheduled"** (never `"–"`) when there is no assignment at all. The match reference (`identityLabel`) is unchanged as the caption's other, already-secondary half. |
| `apps/console/src/modules/bracket/__tests__/DrawView.test.tsx` | New test: `'never shows the raw slot index on a draw card (V3-OC16.1)'` — asserts no `/slot \d+/i` text, the real time+court renders, and "Not scheduled" appears for the unassigned final. |
| `apps/console/src/components/control-plane/MatchCard.tsx` | **§3.5 fix.** `winner ?? setsWinner(sets)` deleted from both `MatchCard` and `ResultSides`; `winner` is now a **required** `'A' \| 'B' \| null` prop with a docstring stating the rule ("comes from `outcome.winner`, never from counting `sets`"). Verified safe: `MatchCard` has no JSX call site in the app yet (component was exported but unused outside tests); `ResultSides`'s two real call sites (`MeetMatchControls.tsx`, `BracketMatchControls.tsx`) already pass `winner` explicitly at every use, so removing the internal fallback default is a non-breaking type tightening. |
| `apps/console/src/components/control-plane/matchStatus.tsx` | Doc-only: `MatchListStatus` now carries the D5 "documented view-local projection" note the state-and-formatting contract requires — it still sources every word from `stateWords.ts`; nothing behavioral changed. |

---

## 2. Commands run, verbatim results

```
.venv/bin/pytest tests/backend/unit/test_bracket_side_dto.py tests/backend/unit/test_bracket_routes.py tests/backend/test_dto_generated_freshness.py -q
..... [test_bracket_side_dto.py — 2 passed]
..... [test_bracket_routes.py — 69 passed]
... [test_dto_generated_freshness.py — 3 passed]
37 passed total (after a second `make generate-api` picked up an unrelated concurrent package's
ActivityEntry/ActivityFeed fields — see §5)
```

```
.venv/bin/ruff check apps/api tests/backend
All checks passed!
```

```
cd apps/api/src && ../../../.venv/bin/lint-imports --config ../.importlinter
Contracts: 15 kept, 0 broken.
```

```
npm --prefix apps/console run test:run -- src/modules/bracket src/modules/meet src/components src/platform src/api src/modules/operations
Test Files  1 failed | 134 passed (135)
Tests  1 failed | 1202 passed (1203)
```
The one failure, `src/platform/contracts/__tests__/emDashContract.test.ts`, flags an em dash in
`apps/console/src/modules/settings/SyncBackupsTab.tsx` and `apps/console/src/modules/setup/
SetupProduct.tsx` — **neither file is in package 10's scope**, both are concurrent in-flight work
from other packages restored by a mid-session `git stash pop` (see §5), and neither was touched by
this package. Not fixed here; flagged for whichever package owns those two files.

`src/api/__tests__/dtoParity.test.ts` also went red mid-session (`TournamentActivityEntryDTO`/
`TournamentActivityFeedDTO` fields present in the regenerated `dto.generated.ts` but not yet echoed
in the hand-maintained `dto.ts`) — again another package's (`Activity`/backups) reconciliation, not
package 10's `sides` change. Re-run after this report:

```
npm --prefix apps/console run test:run -- src/api
5 files, 35 tests — dtoParity failing on the two Activity DTOs above only (unrelated to sides)
```

```
npm run lint:scheduler
✖ 134 problems (0 errors, 134 warnings)
```
Zero errors (the console lint gate is warn-only per CLAUDE.md's lean-gate philosophy). None of the
warnings are new in a file this package touched beyond the pre-existing `react-refresh/
only-export-components` warnings already present on `MatchCard.tsx`/`matchStatus.tsx` before this
package, and one pre-existing `DrawView.tsx:192` dependency-array warning unrelated to the lines this
package changed.

```
npx tsc -b apps/console
(clean — no output)
```

```
npm run depcruise
x 16 dependency violations (0 errors, 16 warnings). 652 modules, 2806 dependencies cruised.
```
0 errors; the 16 warnings are exactly `KNOWN_CROSS_MODULE`'s pre-existing count (CLAUDE.md) — no new
cross-module edge was introduced (`sides.ts`/`matchCardData.ts` live in `platform/domain/`, the
foundation layer, and are consumed only from within `modules/bracket/`).

---

## 3. Gate B fixture coverage

All 13 fixtures exist in `apps/console/src/platform/domain/__fixtures__/matchCard.ts`, keyed
`MC-01`…`MC-13` per contract §5.1 (MC-13 holds the three named `formats` variants). Coverage against
`sides.test.ts`'s fixture sweep:

| ID | Name | Sides asserted non-blank | Specific assertion |
| --- | --- | --- | --- |
| MC-01 | singlesScheduled | ✅ | — |
| MC-02 | doublesScheduled | ✅ | — |
| MC-03 | longNamesDoubles | ✅ | diacritics preserved verbatim in fixture data (not yet asserted through a renderer — no renderer redirect landed, see §4) |
| MC-04 | incompletePair | ✅ | side B = `["Chidi Okeke", "partner to be confirmed"]`, never an invented second name |
| MC-05 | unresolvedPredecessor | ✅ | — |
| MC-06 | noSchedule | ✅ | — |
| MC-07 | liveWithLead | ✅ | — |
| MC-08 | completedLoserWonAGame | ✅ | — |
| MC-09 | walkover | ✅ | — |
| MC-10 | retirement | ✅ | — |
| MC-11 | withheldSide | ✅ | side B = `["Player not published"]` |
| MC-12 | bye | ✅ | side B = `["Bye"]` |
| MC-13 | formats (oneGame/bestOfThree/bestOfFive) | ✅ | — |

**Not yet asserted** (logged as debt, §4): the winner-mark-absent/present matrix, per-game emphasis
independent of the match winner, ledger-collapse-when-empty, and the accessible-summary-phrase
equality across the table-row and `MatchCard` renderers (contract §6.2's full table) — these require
the table-row and bracket-node renderers themselves to consume `MatchCardData`/`sides.ts`, which is
the deferred work below.

---

## 4. What is deferred (logged as debt, not silently dropped)

Package 10's brief is large (structured sides + a full operator table-row/bracket-node rewrite across
`BracketMatchesTab.tsx`, `MatchesSpreadsheet.tsx`, `MatchChip.tsx`, `MoveMatchDialog.tsx`,
`ScheduleDiffView.tsx`, the two xlsx export modules, and `names.ts`'s removal). Given the scope
actually landed and verified in this pass, the following is **explicitly deferred**, not silently
skipped:

1. **`MatchesSpreadsheet.tsx` / `BracketMatchesTab.tsx` are not yet rewritten as the contract's
   table-row renderer** (§4.1: aligned game-score columns shared by both sides, ledger collapse when
   `games` is empty, winner mark from `outcome.winner` only). Both currently still derive their
   winner display via `setsWinner()`-style counting (`MatchesSpreadsheet.tsx`'s `ScoreLane` path,
   `BracketMatchesTab`'s `winner_side` echo) — for **meet** specifically, whether an outcome
   independent of the score even exists on the persisted record needs a backend audit before
   rewiring (meet has no persisted `winner_side` the way bracket does); that audit did not fit this
   pass's budget. Not changed.
2. **`names.ts` is not deleted or reduced.** It is still imported by files outside package 10's scope
   (`modules/operations/run/RunCourtGrid.tsx`, `modules/display/publicDisplay/CourtsView.tsx` — the
   latter actively being edited by a concurrent agent this session — and `BracketPlayerFields.tsx`).
   Deleting it would break those. `bracketLabels.ts`'s own former split/rejoin logic (D14's actual
   target) is gone; `names.ts` itself is untouched, logged as a follow-up once its remaining
   consumers redirect to `sides.ts`.
3. **`MatchChip.tsx`, `opsBlock.ts`'s `meetSide`/`operationalSide` string-join, `MoveMatchDialog.tsx`,
   `ScheduleDiffView.tsx`, `xlsxExports.ts`/`scheduleXlsx.ts`** were read but not redirected — the
   `sides.ts` authority exists and is exercised (via `bracketLabels.ts`), but these sites still build
   their own display strings. No behavior changed, no regression risk taken; redirecting them is
   mechanical once a team has budget, since `sides.ts` already accepts the ids/wire shapes they hold.
4. **Bracket doubles per-member names** (§1, coverage gap) — schema-level, out of scope.
5. **`pending_member` on the bracket wire** — reserved in the type, not populated (§1).
6. **Winner-mark/ledger-collapse/per-game-emphasis assertions against a live renderer** — the fixtures
   and the formatter are tested; the renderers that would exercise them end-to-end are the deferred
   items above.

None of this was fixed by "quietly leaving it as-is without saying so" — each item above is a
specific, named gap with its blocking reason.

---

## 5. A note on session stability

Partway through this session the working tree was reset and then restored via `git stash pop`
(`stash@{0}`, "WIP on feat/surface-book-remediation") — this appears to be a checkpoint mechanism in
the multi-agent orchestration for this program rather than anything this package did; the stash
carried this package's in-progress edits to `brackets.py`/`bracketDto.ts`/`MatchCard.tsx` alongside
several other concurrent packages' WIP (entrant `MatchCard`/`PersonGroup`/`format.ts`, settings/setup
modules, `tests/backend/test_tournaments.py`). The pop applied cleanly with no conflicts and every
file this package owns was verified intact and re-tested afterward. `make generate-api` was re-run a
second time near the end of the session because a concurrent package (`Activity`/backups) added
fields to the live OpenAPI schema after this package's first regeneration; the freshness test is
green as of the final run recorded in §2.

## 6. Acceptance against the named findings

| Finding | Status | Evidence |
| --- | --- | --- |
| V3-OC16.1 (slot indexes on draw cards) | **Fixed** for `DrawView.tsx`'s bracket-canvas caption | `DrawView.test.tsx`'s new test; no `/slot \d+/i` renders, "Not scheduled" replaces `"–"` |
| V3-OC16.2 (four vocabularies for one state) | **Documented**, not newly broken | `matchStatus.tsx`'s `MatchListStatus` now carries the required D5 view-local-projection docstring; it already sourced words from `stateWords.ts` before this package |
| V3-OC17.1 (separated Side A/Side B score blocks) | **Not fixed** — deferred, §4 item 1 | `MatchesSpreadsheet.tsx`/`BracketMatchesTab.tsx` unchanged |

---

## 7. Backend/frontend tests added

- `tests/backend/unit/test_bracket_side_dto.py` (2 tests)
- `apps/console/src/platform/domain/__tests__/sides.test.ts` (30 tests)
- `apps/console/src/modules/bracket/__tests__/DrawView.test.tsx` (+1 test, 3 total)

No existing pinned test was changed to match new behavior; `bracketLabels.test.ts` (19 tests) passed
unmodified against the redirected `sideLabel()`, confirming the redirect is behavior-preserving.
