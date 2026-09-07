# Package 29 — structured sides on the wire

Closes the last cluster of the v3 consolidated plan that left a contract
section unmet: `docs/reference/contracts/match-card.md` §2.1 (`Side` =
`persons[] + unresolved: UnresolvedSide|null`) and
`docs/reference/contracts/state-and-formatting.md` §6.1 (the fixed labels).
Debt rows **V3-10-1**, **V3-10-2**, **V3-11-1**, **V3-11-3**.

Baseline HEAD `937f6356`. Branch `feat/surface-book-remediation`. Not
committed. A sibling agent was implementing package 30 in the same worktree;
its files (`entries/submissions.py`, `entries_me.py`, `entries_json.py`,
`receipt.tsx`, `myEntries.tsx`, the migrations and their tests) are **not**
part of this package and appear in the shared `git diff` only because the
tree is shared.

---

## 1. The resolution path chosen for V3-10-1

The debt row concluded "the real fix is a schema change". **It is not**, and
no migration, no `.importlinter` `DEBT` ignore and no cross-domain import
were needed. Every one of the fifteen API import contracts is still `KEPT`.

`bracket_participants.member_ids` already carries the two roster ids for a
pair — the entries seam writes the two seats there (`entries.py`'s `team_id`
branch) and the console's `ParticipantPicker` writes
`members: [pickedA.id, pickedB.id]` for a hand-built one. What was missing
was a *name* for each id, and the row assumed recovering one meant either
decoding `entry-{uuid}` back to a UUID or reading an `entries` table from
`bracket`.

Neither is necessary: **the names are already in a blob the bracket domain
loads anyway.** `tournaments.data.bracketPlayers` is the bracket roster;
`brackets.py` already reads that exact blob at hydrate time for
`player_extras`, and the PUBLIC tier has resolved pairs through it since
package 04 (`entries_site.py::_bracket_roster_names`). So the fix is
option (b) from the brief — a kernel-level resolver both domains may
import:

- `shared/sides.py::roster_display_names(data_blob)` — the resolver, in the
  kernel, a documented twin of `_bracket_roster_names` (which keeps the
  public tier's extra privacy gates layered on top);
- `BracketSession.roster_names` — populated at hydrate from the blob already
  in hand, and at the three session constructions that bypass hydrate
  (create-from-body, JSON import, CSV import) via `_roster_names_for(repo,
  tournament_id)`. Modelled on the existing `player_extras` field, so all 23
  `_serialize_session` call sites needed no change;
- `brackets.py::_participant_side` — the new builder `_bracket_side`
  delegates to.

Option (a) (persist per-member names at the seam) was rejected for two
reasons: it needs a migration *and* a `ParticipantIn` wire field for the
hand-added case (the upsert path clears `meta` by design), and it would store
a second copy of a name that already exists one table away, free to go stale
when the operator renames a roster player.

**Where a member id has no roster row**, the stored composite label is the
only text that names everybody, and it is emitted as ONE `PersonRefDTO` —
unchanged from before. It is never split on `' / '` to fake two people (D15).

---

## 2. Files in scope

### Backend

| File | Change |
| --- | --- |
| `apps/api/src/shared/sides.py` | `roster_display_names`, `is_pair_discipline`/`PAIR_DISCIPLINES`, `team_side` (persons + optional `pending_member`). Module docstring rewritten: the two "logged debt" paragraphs it carried are now the description of what the module does. Unused `withheld_side` builder deliberately **not** added — see §5. |
| `apps/api/src/bracket/state.py` | `BracketSession.roster_names: Dict[str, str]`. |
| `apps/api/src/bracket/brackets.py` | `_participant_side` (new); `_bracket_side` takes `roster_names` + `pair_event`; `_play_unit_out` / `_draw_play_units_out` thread `pair_event`, decided once per event from the discipline; `_roster_names_for`; `_hydrate_session` and the three non-hydrate session constructions populate `roster_names`. |
| `apps/api/src/entries/entries_site.py` | `PublicUnresolvedSideDTO` (new); `unresolved` on `SideDTO`, `PlayerMatchSideDTO`, `ScheduleSideDTO`; `scoresPublished` on `PlayerMatchDTO`; `_feeder_reference` and `_pending_pair_keys` (new); `_side` rewritten to emit the discriminant on every branch; `_placeholder` **deleted** (fully replaced — one spelling of a reference, not two); three call sites pass `pending_keys` and copy `projected.unresolved` onto the side they build. |

### Console

| File | Change |
| --- | --- |
| `apps/console/src/platform/domain/sides.ts` | Docstring only. The model already expressed everything (`pending_member`, multi-person `persons`); package 10b built it correctly ahead of the wire. |
| `apps/console/src/modules/bracket/DrawView.tsx` | The draw card's `membersOf` and the mobile inspector's `formatMobileSide` now read `pu.sides` through `sideFromWire`. **The last `' / '` split in the console is gone** — it survived SP-DM-3 P6 as a deliberate line-break hack, and the structured wire retires it. Legacy fallback kept for a payload with no `sides`. |
| `apps/console/src/modules/display/bracketDisplay/bracketDisplayData.ts` | `sideFromPlayUnit` prefers `pu.sides`; the slot/id derivation is the fallback. |

`BracketMatchesTab` already consumed `sideFromWire` (package 10c) and needed
no change — it simply started receiving two persons and `pending_member`.
`publicDisplay/helpers.ts` is the MEET board and reads meet player ids
through `meetSideFromIds`, which has had per-person fidelity all along; it is
untouched by design. The Wave-2 compatibility shim
(`formatPersonName`/`formatSideName`/`sideNameLines`) was **not** reduced —
its remaining callers still hold pre-joined strings from surfaces outside
this package's scope, and widening to them was explicitly optional.

### Entrant

| File | Change |
| --- | --- |
| `apps/entrant/app/lib/side.ts` | `UnresolvedSideDTO`, `PENDING_MEMBER_LABEL`, `unresolvedLabel`, `isPendingPair`, `sideFallbackLabel`. `sideNamePhrase` appends "partner to be confirmed" as its own "and"-joined term. |
| `apps/entrant/app/components/PersonGroup.tsx` | Takes `unresolved`; renders the §6.1 label from the discriminant instead of the placeholder sentence, and renders the pending-partner line as a dead reference beside the known names. |
| `apps/entrant/app/components/MatchCard.tsx` | Passes `side.unresolved` to `PersonGroup`; `scoreLabel` no longer says "Score not published" over an unplayed match. |
| `apps/entrant/app/lib/{player,draws,schedule}.types.ts` | `unresolved` on the three side mirrors; `scoresPublished` on `PlayerMatchDTO`. |
| `apps/entrant/app/routes/draw.tsx`, `schedule.tsx` | Adapters carry `unresolved` through; `draw.tsx` threads `resultsPublished` into `scoresPublished`. |
| `apps/entrant/public/assets/person-ref.js` | **Not changed.** It is the identity/link seam (one person, one href) and knows nothing about sides; the side vocabulary lives in `side.ts`/`PersonGroup.tsx`, which is where §6.1 puts it. No `public/assets` twin renders a side. |

### Docs and tests

`docs/reference/contracts/match-card.md` (new §2.0, amended §2.1, corrected
status line); `tests/backend/unit/test_bracket_side_dto.py` (+9 cases);
`tests/backend/test_entries_site_api.py` (+1); `tests/backend/unit/
test_public_person_contract.py` and `tests/backend/test_public_schedule_api.py`
(keyset allowlists: `unresolved` on the two public side DTOs, `scoresPublished`
on `PlayerMatchDTO`); `apps/entrant/tests/helpers/matchCardFixtures.ts` and
`matchCard.contract.render.test.ts`; `apps/console/src/modules/bracket/
__tests__/DrawView.test.tsx` and `.../bracketDisplay/__tests__/
bracketDisplayData.test.ts`.

`apps/console/src/api/dto.ts` needed **no** hand reconciliation: everything
added is either an entrant-tier public DTO the console does not mirror, or a
VALUE change inside the bracket `SideDTO` the console already hand-mirrors in
`bracketDto.ts` (its `unresolved` field has existed since package 10a).
`make generate-api` was run; `dto.generated.ts` picked up
`PublicUnresolvedSideDTO` and `scoresPublished`.

---

## 3. Ruling by ruling against §2.1 / §6.1

| Contract clause | Before | Now |
| --- | --- | --- |
| §2.1 `Side.persons` — 0..n resolved references | Bracket doubles pair = ONE composite `PersonRefDTO` | Two `PersonRefDTO`, each with its own roster id, resolved from `member_ids` |
| §2.1 `pending_member` with `known` + `missing` | Reserved in the union, emitted by nothing | Emitted on the operator wire (`known` populated) and the public wire (`known` empty by design — §5) |
| §2.1 "`persons` and `unresolved` are not mutually exclusive" | Unexpressible on the entrant wire | Both tiers carry both; MC-04 is now that exact shape |
| §2.1 `bye` | `bye: true` + a `"Bye"` string | `unresolved.kind == 'bye'` beside the legacy pair |
| §2.1 `winner_of` / `loser_of` | Operator: raw feeder id (correct, D16). Public: a sentence only | Both carry a `kind`; the public `reference` is the formatted "SF 1" from the SAME locator that spells `placeholder`, so the two cannot disagree |
| §2.1 `undetermined` | Public wire sent the banned literal `"TBD"` in `placeholder` | `unresolved.kind == 'undetermined'`; the renderer reads the discriminant and prints "To be decided". `placeholder` keeps `"TBD"` only as the legacy field for a pre-29 client |
| §2.1 `withheld` | Not emitted | Still not emitted — deliberately, and §2.0 of the contract now says why (§5 below) |
| §6.1 label table | Entrant inferred every label from `placeholder`; the console's `formatSideLines` was already correct | Both tiers render from `kind`. A test feeds a placeholder that contradicts the discriminant and asserts the discriminant wins |
| §6.1 "never assembled or parsed from slash strings" | `DrawView.tsx` split a participant name on `' / '` to line-break a pair | Deleted. The card stacks the wire's two persons |
| §6.1 accessible phrase ("and" within a side) | `"Ada Lovelace"` for a half-pair — indistinguishable from singles | `"Ada Lovelace and partner to be confirmed versus …"` |

### How `pending_member` is decided

Two **structural** signals, identical on both tiers (`_participant_side` and
`_pending_pair_keys`), never inferred from a name:

1. a TEAM participant carrying exactly **one** member id;
2. an **entry-backed** lone person (`entryPlayerId` or `meta.sourceEntryId`)
   in a **pair discipline** — the entries seam drops an entrant whose partner
   invite is unaccepted into the draw as a singleton for the director to pair
   by hand (`entries.py::_pair_batch` leg 3: "both carry
   `partner_accepted_at` — a nomination is not a pair").

An imported or hand-added PLAYER row in a doubles draw is **excluded**: a
historical importer may legitimately store a whole pair under one name, and
"partner to be confirmed" over it would be a false statement about someone
else's draw. Two negative-control tests pin both exclusions (singles draw;
non-entry-backed row). `is_pair_discipline` reads the CODE (MD/WD/XD/BD/GD),
with the event id's trailing code as the documented second chance
(`T027-MD`); a free-text discipline like `"Mixed Doubles"` is **not** treated
as a pair draw, because guessing would put the phrase under a singles
player's name.

---

## 4. V3-11-3 — closing the contract-vs-wire gap

The brief said: add `outcome.kind`, `Game.state` and the two `publication`
booleans **if the data exists to derive them honestly**; otherwise amend the
contract to describe reality. Ruling, member by member — now written into the
contract itself as a new **§2.0 table**, so the page can be used as an oracle:

- **`publication.scoresPublished` — ADDED.** The data exists
  (`page.results_published`) and the gap was a real defect: `score === null`
  does not mean "withheld", because an unplayed match has no score either, so
  the entrant card announced *"Score not published"* over every future match
  on the calendar. `PlayerMatchDTO.scoresPublished` now carries the fact and
  the accessible summary omits the term when the score is simply not yet
  recorded (§2.4's "omitted, never placeheld").
- **`publication.personsPublished` — NOT added, and not needed.** Person
  publication is gated per PERSON and already arrives applied, as
  `PersonReferenceDTO(resolution='dead', label='Player not published')`.
  There is no per-match person-publication fact left for a renderer to read.
- **`outcome.kind` — NOT added.** `status` + `decided` + the per-side
  `winner` already state the outcome; an `outcome` object would re-project
  them. And its `retiredSide`/`absentSide` members are **not derivable from
  anything stored**: a bracket result holds `winner_side`, `walkover` and a
  free-text `reason`. Inventing them was the one thing the brief forbade.
- **`Game.state` — NOT added.** The score is a flat `number[][]` of recorded
  games. Completion is a function of the scoring configuration
  (`pointsPerSet`, `deuceEnabled`, `setsToWin`) and the public tier does not
  carry that configuration, so `state` cannot be computed honestly there —
  and §2.7 rule 2 forbids deriving it from "which number is larger". §2.7's
  four rules still bind every renderer; they are enforced by the renderer
  (per-game emphasis keyed off the game, never the match winner — already
  done in package 10c), not by a field.

§2.0 also records the two intentional public-tier divergences (`known` empty,
`reference` formatted rather than a `MatchIdentity`) and the fact that
`identity`/`reference`/`matchState` are console-only. The page's status line
no longer claims "nothing on this page has been implemented yet".

---

## 5. Judgment calls, stated

1. **`withheld` is still emitted by nobody.** A side can hold one published
   and one withheld person; a side-level flag cannot say that, and the
   per-person dead reference already does. The union member stays for a tier
   that ever needs a whole-side gate. MC-11's fixture comment and contract
   §2.0 both record the reason, so this is a decision, not an omission.
2. **`unresolved.known` is empty on the public tier.** The side's own
   `persons` (or the joined `TeamDTO`) is the known set and has been through
   the publication and erasure gates once, in `_participant_people`. A second
   projection of the same identities on the same wire is two copies free to
   diverge under the gate. The operator wire, which has no gate, populates it.
   `PersonGroup` reads `persons`, so nothing renders worse for it.
3. **`_placeholder` was deleted rather than left beside `_feeder_reference`.**
   Two functions spelling the same match reference off the same locator is
   the D16 failure in miniature; the new one produces both the discriminant
   and the legacy string.
4. **Sessions built from a wire payload with no workspace roster** (only
   reachable through the ephemeral engine paths) fall back to the composite
   name. `_roster_names_for` covers all three routed constructions.
5. **The one-member-TEAM signal is NOT gated on the discipline; the lone-person
   signal is.** A TEAM row is itself the claim "this participant is a pair" and
   is trustworthy where a free-text discipline string ("Mixed Doubles" rather
   than "MD") is not. A lone PERSON is only a half-pair if the draw takes
   pairs, so that branch needs the code. Both tiers apply the pair of rules
   identically (`_participant_side` / `_pending_pair_keys`).
6. **A one-member TEAM whose member id has no roster row still says
   `pending_member`.** The shape is a pair slot one short whether or not the
   name resolved; only the *name* degrades to the stored label. Losing the
   discriminant to a missing roster row would be the wrong trade.
7. **`ScheduleSideDTO.unresolved` is populated but the entrant schedule route
   does not yet branch on it** beyond carrying it into `MatchCardData` — the
   schedule card renders through the same `MatchCard`/`PersonGroup`, so it
   gets the §6.1 labels for free.

---

## 6. Debt-row dispositions

I did not edit `docs/reference/debt-log.md` (out of scope for this agent).
Proposed status for the orchestrator:

| Row | Status | Why |
| --- | --- | --- |
| **V3-10-1** | **RETIRE** | A bracket doubles pair now emits two `PersonRefDTO`s from `member_ids`, resolved against the bracket roster. Both the seam-built and the HAND-ADDED case the row called out are covered (the row assumed hand-added had "no `entries` row to resolve at all" — true, and irrelevant: it resolves against the roster blob, not `entries`). No migration, no cross-domain read, all 15 import contracts kept. The row's premise that "the real fix is a schema change" is superseded and the retiring note should say so. |
| **V3-10-2** | **RETIRE** | `pending_member` is emitted on both wires from two structural signals, with two negative controls pinning what it deliberately does not claim. |
| **V3-11-1** | **RETIRE** | The entrant wire carries the discriminated `Side.unresolved` with the same field names as the operator wire. MC-04 is a real `pending_member` fixture, not the one-person approximation; the render tests assert the known name AND "partner to be confirmed", plus the "and"-joined accessible phrase. |
| **V3-11-3** | **RETIRE** | The gap is closed the way the brief specified: `scoresPublished` added (real data, real defect fixed); `outcome.kind`, `Game.state` and `personsPublished` ruled not derivable/not needed, with the reason for each recorded in the contract's new §2.0 rather than left as an aspiration. The contract now describes reality. |

Nothing was left open. Two things were noticed and NOT fixed, and belong in
the log only if the orchestrator wants them tracked:

- `apps/console/src/api/bracketDto.ts` still marks `side_a`/`side_b`
  `@deprecated ... Kept for one release`. Several consumers still read them
  as the fallback; the removal is a separate, deliberate cut.
- `tests/backend/unit/test_architecture_boundary_inventory.py` counts the
  literal string `tournaments.data` with `str.count` over the whole file, so a
  **docstring** naming the blob reads as new persistence-boundary debt. Two
  docstrings here were reworded to avoid it ("the workspace `data` document's
  `bracketPlayers` list"). The metric should count code references, not prose;
  contorting a comment to satisfy a grep is a small tax that will be paid
  again.
- `entries_site.py::_side` still sets the legacy `placeholder: "TBD"` string
  on an undetermined side for pre-29 clients. Once the entrant tier is the
  only reader, that literal can go; the discriminant already carries the
  meaning and no renderer prints "TBD".

---

## 7. Gate tails (verbatim)

`npm --prefix apps/console run test:run`

```
 Test Files  255 passed (255)
      Tests  2266 passed (2266)
```

`npx tsc -b apps/console` — no output, exit 0.

`npm run lint:scheduler`

```
✖ 134 problems (0 errors, 134 warnings)
  0 errors and 3 warnings potentially fixable with the `--fix` option.
```

`npm run depcruise`

```
x 12 dependency violations (0 errors, 12 warnings). 665 modules, 2890 dependencies cruised.
```

`npm --prefix apps/entrant run test:run`

```
 Test Files  54 passed (54)
      Tests  1046 passed (1046)
```

`npm run typecheck:entrant` — no output, exit 0.
`npm run lint:entrant` — no output, exit 0.

`npm run -w apps/entrant depcruise`

```
✔ no dependency violations found (111 modules, 332 dependencies cruised)
```

`.venv/bin/ruff check apps/api tests/backend`

```
All checks passed!
```

`cd apps/api/src && ../../../.venv/bin/lint-imports --config ../.importlinter`

```
Contracts: 15 kept, 0 broken.
```

`PYTEST_WORKERS=6 make test`

```
========== 2440 passed, 72 skipped, 73 warnings in 486.25s (0:08:06) ===========
```

`git diff --stat`

```
49 files changed, 1660 insertions(+), 267 deletions(-)
```

That total is the SHARED worktree — it includes the sibling package-30 agent's
files. This package's own footprint is 27 files: 4 backend source, 3 console
source, 8 entrant source, 1 contract page, this report, and 10 test files.
