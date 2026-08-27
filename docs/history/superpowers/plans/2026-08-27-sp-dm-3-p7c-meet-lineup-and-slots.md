# SP-DM-3 — P7c: Meet lineup on the server, and slot assignment — detailed plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (the
> program's workflow: fresh opus subagent per task, a separate reviewer per task, one whole-branch
> review, one fix wave, ff-merge). Steps use checkbox (`- [ ]`) syntax.

**Status:** authored 2026-08-27 against `main` @ **`cc38abc8`** (P7b merged and pushed, CI green,
working tree clean). Alembic head **`aa1b6c4e0d3f`**. **This slice adds no migration** — see
"No migration" below.

**Parent plan:** `docs/history/superpowers/plans/2026-08-25-sp-dm-3-p7-event-key-and-meet-event.md`
(the P7c card is at its tail, "scoped, not detailed").
**Rulings:** `docs/history/programs/DM1_RULINGS.md` — **R-DM-5** binds this slice (division-level
mapping, slot assignment is an operator-side action on a surface P7 builds). R-DM-11(b) and R-DM-10
were discharged by P7a and are not re-opened.
**Ledger:** `docs/history/programs/DM3_PROGRESS.md` — read at session start, update at session end.
**Prior slice, for shape:** `docs/history/superpowers/plans/2026-08-26-sp-dm-3-p7b-meet-event.md`.

**Goal:** move Meet's lineup generation out of the console and into the API, make a committed Meet
entry reachable by a generated match through an explicit operator seating action, and give
`_plan_meet` the pair projection P5 cut for lack of a reader.

**Resolves:** F-DM-08's server half (the client-side lineup construction), the Meet half of P5's
ruled pair work, and — as an unplanned first task — a **live console-side defect that destroys
P7b's output** (F-P7c-1 below). **Blocked-by:** P7b (merged). **Blocks:** nothing; this is the last
implementation slice in SP-DM-3.

**Tech stack:** FastAPI + Pydantic v2 (`StrictModel`) on `apps/api/src`; React 19 + Zustand +
vitest on `apps/console`; pytest on `tests/backend`. No new dependency is added by this plan.

---

## Line anchors in this document

Every `path:line` below was **printed from the tree at `cc38abc8`** in the session that wrote this
plan (the program's *produced, not predicted* rule). They will drift as tasks land. **Re-anchor by
symbol, not by number**, and treat a mismatch as staleness rather than as a finding.

---

# What P7c inherits, restated from the code

P7b gave Meet a real Event (`meet_events`, one row per **division**, `db/models.py:718`) and a
mapping column (`entry_events.meet_event_id`). It deliberately did **not** close the rank
disconnect, because closing it at intake is slot assignment and R-DM-5 forbids that (ruling P7b-13).
So today:

- `_plan_meet` (`apps/api/src/entries/entries.py:419`) writes `"ranks": [code]` where `code` is the
  **division** — `"MS"`, `"XD"` (payload at `entries.py:527-537`). That is correct per R-DM-5.
- The generator lives in the console: `RegenerateMenu.tsx` expands `rankCounts` into **numbered**
  ranks (`expandRanks`, `:24-30`) and filters `(p.ranks ?? []).includes(rank)` against them
  (`:88`, `:91`). `"MS" !== "MS1"`, so a committed entry matches no cell and generates no match.
- The gap is therefore the **generator's**, and P7c owns the generator.

Four inherited items, all confirmed against the tree:

1. **Port the generator** (`RegenerateMenu.tsx:81-106` `generated`, `:108-120` `incompletePairs`,
   `:69-79` `slotKey`, `:124-129` `keptCustom`) to the server. It is a `useMemo` producing
   `MatchDTO[]`; the port is a transcription, not a redesign.
2. **The operator slot-assignment surface** R-DM-5 requires. **See Ruling A — it already exists.**
3. **`_plan_meet`'s side construction**, the Meet half P5 cut. `_plan_bracket` calls `_pair_batch`
   (`entries.py:843`); `_plan_meet` does not, so a Meet doubles pair commits as two unrelated
   singleton players.
4. **Retire the mirror.** `tests/backend/unit/test_entries_commit_seam.py` carries
   `_generate_matches`, a hand transcription of the console generator, used at `:714` and `:728`
   with a negative control at `:731`. It is a disclosed staleness risk with no cross-tier gate.

Plus **D24**, re-ruled onto this slice at P7b's close. **See Ruling D — the premise does not hold
and it needs to go back to the owner.**

---

# Findings and rulings

## F-P7c-1 — a live defect: the roster cleanup destroys P7b's mapping (HEADLINE)

`RosterTab.tsx` runs a one-shot singles-invariant cleanup on mount (`:105-137`). It iterates
**every** value in `p.ranks ?? []` (`:116`) with no filter for "is this a lineup slot", asks
`isDoublesRank(r)` (`:122`), and strips the rank from every occupant after the first.

`isDoublesCode` is `code.replace(/\d+$/, '').endsWith('D')` (`lib/doubles.ts:25-27`). A **bare
division code** has no trailing digits, so the strip is a no-op and the question is asked of the
prefix itself: `isDoublesRank("MS")` → `false` → **treated as a singles lineup slot**.

So two committed entrants of the **same club** in the **same singles division** both carry
`ranks: ["BS"]` and the same `groupId`; the cleanup sees two occupants of "singles rank BS" and
**strips `"BS"` from the second**, which then autosaves. The entrant's division mapping — the thing
P7b shipped — is silently gone, and the player is left with `ranks: []`.

**Reproduced by transcription** of `:105-137` + `doubles.ts:25-27` run against the exact document
shape `_plan_meet` writes (two `Kingsway BC` / `BS` entrants, one `Riverside HS` / `BS`, two
`Kingsway BC` / `XD`): the second `BS` entrant is stripped; the `XD` pair and the other club
survive. **A transcription is not the component**, and Task 1 Step 1 replaces it with a real
mounted-component test — `__tests__/positionGrid.test.tsx` already mounts `RosterTab` (`:170`), so
the harness exists.

Severity: the affected shape is the **normal** one for a school meet (a club entering more than one
person in a singles division), and the real workspace config in P7b's ledger entry is
`{BS: 20, GS: 20, BD: 11, GD: 11, XD: 11}` — two of the five divisions are singles. Doubles
divisions are untouched, which is why it can look fine in a doubles-only fixture.

**This makes Task 1 a bug fix and it goes first.** It also re-frames the rest of the slice:
division-awareness in the roster is **defensive**, not cosmetic.

**The fix is not a digit test.** `/\d$/` would misread a director's `U10` division (a real shape —
`defaultEventOrder`'s docstring at `positionGrid/helpers.ts:34-39` records a junior league
configuring `U10`/`U11`) as a lineup slot. The correct scope is the **expanded slot set** derived
from `rankCounts`, which is also what the grid can actually hold.

## Ruling A — the slot-assignment surface already EXISTS; P7c extends it

The ledger's handoff calls the operator slot surface "the largest piece of net-new UI left in
SP-DM-3" with "**no prior art in the repo**". **That claim is wrong against the tree**, and the
plan is scoped on the tree.

`PositionGrid` **is** an operator slot-assignment surface. Its own header states the interaction
(`PositionGrid.tsx:1-19`): columns are events, rows are position numbers `1..N`, a cell holds the
player(s) whose `ranks[]` contain `` `${prefix}${row}` ``, and an operator assigns by dragging a
chip, by clicking a cell to open a searchable picker, or by `×` to unassign. The invariant has one
home already — `useRankAssignment` (`positionGrid/useRankAssignment.ts:26-59`: `assignRank`,
`unassignRank`, `moveRank`), extracted precisely because three surfaces drove it. Capacity and
occupancy are computed by `useRankValidation` (`hooks/useRankValidation.ts:73-100`: `maxPlayers`,
`isFull`, `assignedTo`). Column order and visibility are `usePositionGridColumns` (`:15-70`).

**Ruling: P7c does not build a new surface. It teaches the existing one about divisions** — an
unslotted-entrant affordance plus one explicit seat action — and reuses `useRankAssignment` as the
single mutation path, per the rule that file already enforces.

**Cost if wrong:** the seat action lands on a grid that turns out not to fit it, and a later slice
lifts it out. Against: building a second assignment surface beside `PositionGrid` would create a
second answer to "who holds MS1", which is the exact F-DM-13 shape this program has spent two
slices collapsing.

**Bookkeeping:** the "no prior art" claim is corrected in the **new dated ledger entry** written at
this slice's close. Per the program's standing convention, `history/` is never rewritten — do not
edit P7b's entry.

## Ruling B — the endpoint takes a POSTED document and writes nothing

The discriminating question is the **dirty store**: the console regenerates from roster edits that
may not be persisted yet. A server that re-read the blob would generate from a stale document.

The controlling prior art is the meet proposal seam, which takes the console's in-memory state in
the request body: `state: TournamentStateDTO` at `meet/schedule_proposals.py:227` and `:375`.

**Ruling: `POST /tournaments/{tournament_id}/meet/lineup` accepts a `TournamentStateDTO` body and
returns the generated matches. It performs no database write and no blob read.** The console keeps
persisting through the one existing funnel (`importMatches` → autosave → `PUT /state` →
`repositories/local.py::upsert_data`), so this slice adds **no second writer** and inherits no new
concurrency-token story. It also means the endpoint is trivially testable without a repository.

**On authority — `rankCounts` vs `meet_events`:** the two are equivalent *by construction*, because
`upsert_data` derives `meet_events` from `config.rankCounts` on every blob write (P7b's
`_sync_meet_events`). The generator reads `rankCounts` **off the posted document**, because that is
the only one of the two that reflects unsaved operator edits. Record this argument in the module
docstring; it is the reason a reviewer should not "fix" it into a join.

**Cost if wrong:** if a future caller needs generation without a client (a job, a CLI), it must
load and project the document itself — one `state_dto_from_document(row.data)` call, the same one
`schedule_proposals.py:269` already makes.

## Ruling C — the generator does not seat; the operator does, explicitly

R-DM-5 forbids **intake** seating. It does not forbid an operator action from seating — but a
generator that silently seated would make the roster grid **lie**: a player would show as unslotted
in the grid and appear in a generated match anyway.

**Ruling: `build_lineup` reads numbered ranks only, exactly as the console does today. Its
semantics are unchanged by the port.** The disconnect closes because P7c ships an **explicit
operator action** ("Seat entrants", Task 5) that moves a division-only player into a free numbered
slot through `useRankAssignment`, leaving the grid true at every moment.

**Cost if wrong:** an operator with 40 committed entrants presses one button instead of dragging 40
chips, but must press it. That is the ruling's intent — seating is a competition decision, and
R-DM-5 puts it in operator hands.

## Ruling D — D24's premise does not hold; route it back to the owner

D24 was re-ruled onto P7c at P7b's close on this reasoning: *"locking a published draw's key is only
affordable once regeneration has a first-class path — P7c is the slice that builds one."*

**The regeneration path P7c builds is Meet's.** D24 is about `bracket_events.id` — the entrant
tier's `drawKey` — set from the request body by `POST /bracket` and `POST /bracket/import`
(debt-log D24). Nothing in this plan touches a bracket draw key, a bracket route, or
`bracket_events`. The re-ruling repeated P7b's own error one slice later: it assumed the slice's
content before the slice was scoped.

**Ruling: P7c does not decide D24, and does not silently drop it either.** Task 7 records the
mismatch in the debt-log entry and returns D24 to the open-owner-rulings list where P7b's handoff
already counts it.

**Recommendation to the owner, one line:** *accept and document.* A publication lock blocks a
legitimate draw **rebuild**, not merely a rename; the warn-instead-of-block variant needs UI and is
more work than either alternative; and the behaviour is already characterized in
`tests/backend/test_event_code_unrenameable.py`. If a lock is ever wanted, it belongs to a
bracket-side slice that does for draws what P7c does for lineups.

## No migration in this slice

Nothing here adds or alters a column. `meet_events` and `entry_events.meet_event_id` shipped in
P7b's `aa1b6c4e0d3f`; the one new field (`PlayerDTO.partnerPlayerId`, Task 4) lives in the
`tournaments.data` blob, which is schemaless at the column level.

Therefore **F-DM-11 does not apply** (no column change, so no same-commit revision requirement) and
**the program's standing SQLite-only migration caveat does not apply to this slice's evidence** —
there is no migration for Postgres to disagree with. Say exactly that in the ledger; do not restate
the caveat as if it were carried.

**`partnerPlayerId` is additive and does NOT bump `CURRENT_TOURNAMENT_SCHEMA_VERSION`**, for the
reason already written on `entryPlayerId` at `core/schemas.py:271-275`: bumping would make new
documents unreadable to a pre-P7c build in exchange for nothing, since an older reader ignores an
unknown optional key.

---

# Global constraints (inherited verbatim — every task's requirements include these)

- **Produced, not predicted.** Every count in a commit message, a review or the ledger is produced
  by running the pattern against the tree. No gate may be satisfiable by rewording a comment.
- **No line anchor enters a permanent document unless it was printed from the tree in the session
  that writes it.** This failed six times over the program; treat it as load-bearing.
- **`history/` is a dated working record and is never rewritten.** A correction to an older entry
  goes in the newer entry.
- **Refactors do not change behaviour.** If a test would have to change to keep passing, **stop and
  flag it** rather than editing the test. (Task 6 is the one sanctioned exception in this plan, and
  it is sanctioned by name.)
- **Every workspace route needs a path param named exactly `tournament_id` plus
  `Depends(require_tournament_access(role))`.** `tests/backend/test_tenant_isolation.py` derives all
  such routes from OpenAPI and fails CI on a missing seam.
- **A new cross-module console edge is a depcruise ERROR.** Keep new code inside
  `modules/meet/**` or a shared layer (`lib/`, `components/`, `hooks/`, `store/`, `api/`).
- Import-linter: `meet` may import `core.*` and `shared.*`; `repositories` may not import `meet.*`.
  Run `cd apps/api/src && lint-imports --config ../.importlinter`.

## The three traps this program has already paid for

1. **`make check` needs the venv on `PATH`.** `export PATH="$PWD/.venv/Scripts:$PATH"` first, or it
   exits 2 at the first backend line for an environmental reason that looks exactly like a failure.
2. **`pytest | tail` reports *tail's* exit status.** An exit code cannot prove a suite green. Read
   the summary line.
3. **CRLF working tree.** Sources are checked out CRLF and `git diff` normalizes both sides, so a
   tool that rewrites a file with LF endings changes every line on disk **invisibly**. Prefer
   targeted edits; check `git diff --stat` is proportionate before every commit.

## Run commands

```bash
export PATH="$PWD/.venv/Scripts:$PATH"          # trap 1, first thing in every shell

pytest tests/backend/unit/test_meet_lineup.py -x -q
pytest tests/backend/unit/test_entries_commit_seam.py -x -q
npm --prefix apps/console run test:run -- src/modules/meet/roster/__tests__/positionGrid.test.tsx
npm --prefix apps/console run test:run -- src/modules/meet/matches
cd apps/api/src && lint-imports --config ../.importlinter && cd ../../..
make check                                      # the whole gate, both tiers
```

**Baseline to beat, from P7b's ledger entry (re-measure in Task 0, do not trust this number):**
pytest **1965 passed / 66 skipped**.

---

# Task 0 — Measure, before anything is designed against (S)

No production code. Every number below is recorded in the ledger at slice close and is what later
tasks' deletion gates are judged against.

- [ ] **Step 1: Re-measure the baseline suites.**

```bash
export PATH="$PWD/.venv/Scripts:$PATH"
pytest -q                                        # read the SUMMARY LINE (trap 2)
npm --prefix apps/console run test:run 2>&1 | tail -20
```

Record both counts. If pytest is not 1965/66, say so — the ledger's number is from P7b's tip.

- [ ] **Step 2: Reproduce F-P7c-1 against the mounted component, not the transcription.**

`__tests__/positionGrid.test.tsx:170` already mounts `RosterTab`. Seed the store with the exact
document shape `_plan_meet` writes and record whether the second same-club singles-division entrant
loses its rank. **Write this down as a yes/no with the observed `ranks` value.** If it does NOT
reproduce, stop and report — Task 1 is then wrong and the task order changes.

- [ ] **Step 3: Print the surface counts.** Record each number.

```bash
grep -rn "rankCounts" apps/console/src --include=*.ts --include=*.tsx | grep -v __tests__
grep -rn "expandRanks" apps/console/src
grep -rn "meetMode" apps/console/src apps/api/src --include=*.ts --include=*.tsx --include=*.py | grep -v test
```

`meetMode` matters: `TournamentStateDTO.meetMode`'s comment (`core/schemas.py:104-107`) claims *"the
auto-match generator … branch[es] on this value"*, but `RegenerateMenu.tsx:98` hardcodes
`matchType: 'dual'`. **Determine whether any `tri` generation path exists anywhere.** If none does,
the port transcribes the hardcode and the plan's claim is "no tri path exists" — a measured fact,
recorded in the ledger and in the new module's docstring. Do **not** invent a `tri` branch.

- [ ] **Step 4: Confirm no `partnerPlayerId`-shaped field already exists.**

```bash
grep -rn "partnerPlayerId\|partner_player_id" apps/api/src apps/console/src apps/entrant/app
```

Expected: nothing outside `entries` tables' `partner_entry_id`. If something exists, reuse it
(ladder rung 2) and say so rather than adding a second field.

- [ ] **Step 4b: Determine whether a pair's two halves can land in different schools.**

`_seat` (`entries/entries.py:589`) groups by the entrant's own free-text `club`, so two partners who
typed different spellings commit into two groups. Read `_pair_batch`'s predicate (`:750-825`) and
`_seat`, and record **yes or no**: can a mutually-accepted pair reach the document with two
different `groupId`s? Task 5's stated rule (seat such a pair as two singletons) assumes yes. If the
answer is no — some leg of the predicate or of intake forces one club — say so, and Task 5's rule
becomes a one-line assertion instead of a branch.

- [ ] **Step 5: Commit the measurements.** No code changed; the record is the deliverable.

```bash
git add -A && git commit -m "chore(dm3): P7c Task 0 measurements"
```

---

# Half A — the generator moves to the server

Half A is independently shippable: at its end the console generates through the API, behaviour is
unchanged, and nothing about seating has moved yet.

## Task 1: Stop the roster cleanup from eating division mappings (S — but first)

**Files:**
- Modify: `apps/console/src/modules/meet/roster/RosterTab.tsx` (the cleanup effect, `:105-137`)
- Modify: `apps/console/src/modules/meet/roster/positionGrid/helpers.ts` (add `expandRanks`)
- Test: `apps/console/src/modules/meet/roster/__tests__/positionGrid.test.tsx`

**Interfaces:**
- Produces: `expandRanks(counts: Record<string, number> | undefined): string[]` exported from
  `positionGrid/helpers.ts`. **Task 2 deletes the console generator's private copy
  (`RegenerateMenu.tsx:24-30`) and Task 5 consumes this one.** Body is the existing one, moved
  verbatim.
- Consumes: `usePositionGridColumns()` returns `{ events, allConfiguredEvents, defaultOrder,
  eventVisible, moveColumn, reorderColumns, toggleVisible, resetColumns }`
  (`usePositionGridColumns.ts:60-70`). **`events` is filtered by column VISIBILITY** (`:29-31`);
  the cleanup must not use it, or hiding a column would make the cleanup eat that division's ranks.
  Derive the slot set from `config.rankCounts` directly.

- [ ] **Step 1: Write the failing test.** Append to `positionGrid.test.tsx`, beside the existing
      `RosterTab` mount at `:170`:

```tsx
it('does not strip a bare DIVISION code from a second same-club entrant', async () => {
  // The exact shape entries/entries.py::_plan_meet writes after SP-DM-3 P7b:
  // ranks carries the DIVISION ("BS"), never a slot ("BS1"), and the group is
  // the entrant's club. Two entrants of one club in one SINGLES division is
  // the ordinary case for a school meet.
  seedStore({
    config: { rankCounts: { BS: 20, XD: 11 } },
    groups: [
      { id: 'g1', name: 'Kingsway BC' },
      { id: 'g2', name: 'Riverside HS' },
    ],
    players: [
      { id: 'p1', name: 'Ana Reyes', groupId: 'g1', ranks: ['BS'] },
      { id: 'p2', name: 'Bo Lin', groupId: 'g1', ranks: ['BS'] },
      { id: 'p3', name: 'Cy Okafor', groupId: 'g2', ranks: ['BS'] },
    ],
  });

  render(<RosterTab />);

  // The cleanup runs in a mount effect; let it flush.
  await waitFor(() => {
    const p2 = useTournamentStore.getState().players.find((p) => p.id === 'p2')!;
    expect(p2.ranks).toEqual(['BS']);
  });
});

it('still strips a duplicate SINGLES SLOT, which is the invariant it exists for', async () => {
  // The negative control: the cleanup must keep doing its job. Without this,
  // the fix above could be "delete the cleanup" and the test would pass.
  seedStore({
    config: { rankCounts: { BS: 20 } },
    groups: [{ id: 'g1', name: 'Kingsway BC' }],
    players: [
      { id: 'p1', name: 'Ana Reyes', groupId: 'g1', ranks: ['BS1'] },
      { id: 'p2', name: 'Bo Lin', groupId: 'g1', ranks: ['BS1'] },
    ],
  });

  render(<RosterTab />);

  await waitFor(() => {
    const p2 = useTournamentStore.getState().players.find((p) => p.id === 'p2')!;
    expect(p2.ranks).toEqual([]);
  });
});
```

**Match the file's existing store-seeding helper** — read the top of `positionGrid.test.tsx` and use
whatever it already does (`seedStore` above is a placeholder for that helper's real name). Do not
add a new seeding mechanism.

- [ ] **Step 2: Run it and watch the FIRST test fail.**

```bash
npm --prefix apps/console run test:run -- src/modules/meet/roster/__tests__/positionGrid.test.tsx
```

Expected: test 1 FAILS (`p2.ranks` is `[]`), test 2 PASSES. If test 1 passes, Task 0 Step 2 already
told you and you should not be here.

- [ ] **Step 3: Move `expandRanks` into `helpers.ts`.** Verbatim from `RegenerateMenu.tsx:24-30`:

```ts
/**
 * The lineup SLOTS a config declares: {MS: 2} -> ["MS1", "MS2"].
 *
 * A bare division code ("MS", or a junior league's "U10") is NOT in this
 * set. That distinction is load-bearing: since SP-DM-3 P7b the Entries
 * commit seam writes the DIVISION into `player.ranks` (R-DM-5 — intake
 * maps onto a division, never a slot), so any code that treats every
 * value in `ranks[]` as a slot will misread a committed entry. A digit
 * test cannot substitute: "U10" ends in a digit and is still a division.
 */
export function expandRanks(counts: Record<string, number> | undefined): string[] {
  const out: string[] = [];
  for (const [prefix, count] of Object.entries(counts ?? {})) {
    for (let i = 1; i <= count; i++) out.push(`${prefix}${i}`);
  }
  return out;
}
```

- [ ] **Step 4: Scope the cleanup to slots.** In `RosterTab.tsx`, inside the cleanup effect, before
      the group loop:

```ts
// Only a declared lineup SLOT can be over-occupied. A bare division code
// ("BS") is what the Entries seam writes for a committed entrant awaiting
// seating (R-DM-5), and it is legitimately held by every entrant of that
// division in the school — `isDoublesRank` reads it as a singles slot and
// this cleanup used to strip it, silently destroying the intake mapping
// on the next autosave. It also used to strip ranks for divisions that
// are no longer configured at all.
const slotRanks = new Set(expandRanks(config?.rankCounts));
```

and in the per-rank loop, as the first line of the body:

```ts
if (!slotRanks.has(r)) continue;
```

Import `expandRanks` from `./positionGrid/helpers`, and read `config` from the store the way the
component already reads `players` / `groups`. Add `config?.rankCounts` to the effect's dependency
array alongside the existing deps.

- [ ] **Step 5: Run both tests — and the whole meet console suite.**

```bash
npm --prefix apps/console run test:run -- src/modules/meet
```

Expected: both new tests PASS, no existing test reds. A red existing test here is a **stop and
flag**, not an edit.

- [ ] **Step 6: Commit.**

```bash
git add apps/console/src/modules/meet/roster
git commit -m "fix(meet): the roster cleanup no longer strips a committed entry's division

The one-shot singles-invariant cleanup iterated every value in ranks[] and
asked isDoublesRank of it. A bare division code carries no trailing digits,
so the digit strip is a no-op and 'BS' reads as a singles lineup slot: two
entrants of one club in one singles division, which is the ordinary shape
for a school meet, cost the second entrant the division mapping SP-DM-3 P7b
had just written -- silently, on the next autosave.

Scope the cleanup to the slot set expandRanks() derives from rankCounts. A
digit test would not do: a junior league's 'U10' division ends in a digit.
Also fixes a latent second case, where ranks of a no-longer-configured
division were stripped."
```

## Task 2: The server-side lineup generator (M)

**Files:**
- Create: `apps/api/src/meet/lineup.py`
- Modify: `apps/api/src/core/main.py` (one `include_router`, beside the other meet routers at
  `:425-432`)
- Test: `tests/backend/unit/test_meet_lineup.py` (create)

**Interfaces:**
- Consumes: `core.schemas.TournamentStateDTO`, `MatchDTO` (`schemas.py:324-338`), `StrictModel`,
  `Name`; `identity.deps.require_tournament_access` (whatever the other meet routers import — copy
  `schedule_advisories.py`'s import block verbatim rather than guessing the path).
- Produces, and **Task 3 depends on these names exactly**:
  - `meet.lineup.expand_ranks(rank_counts: Mapping[str, int]) -> list[str]`
  - `meet.lineup.is_doubles_rank(rank: str) -> bool`
  - `meet.lineup.build_lineup(state: TournamentStateDTO) -> LineupDTO`
  - `class LineupDTO(StrictModel)` with fields `generated: List[MatchDTO]`,
    `keptCustom: List[MatchDTO]`, `incompletePairs: List[Name]`
  - route `POST /tournaments/{tournament_id}/meet/lineup`, body `TournamentStateDTO`,
    `response_model=LineupDTO`, `dependencies=[Depends(require_tournament_access("operator"))]`

- [ ] **Step 1: Write the failing tests.** Create `tests/backend/unit/test_meet_lineup.py`:

```python
"""The Meet lineup generator, ported from the console (SP-DM-3 P7c, F-DM-08).

These tests are the PORT'S contract: each one states a property the console
generator has today, so a divergence reds here rather than at an event. The
console's own tests stay where they are until Task 3 deletes the code they
cover.
"""
import pytest

from core.schemas import TournamentStateDTO, state_dto_from_document
from meet.lineup import build_lineup, expand_ranks, is_doubles_rank


def _state(**over) -> TournamentStateDTO:
    """A minimal valid meet document, projected the way the real path does.

    ``TournamentStateDTO`` (core/schemas.py:1041) nests the config:
    ``config: Optional[TournamentConfig]`` at :1050, with ``rankCounts`` on
    TournamentConfig at :118 -- so the generator reads
    ``state.config.rankCounts``, not ``state.rankCounts``.

    TournamentConfig (:99) REQUIRES intervalMinutes, dayStart, dayEnd,
    courtCount, defaultRestMinutes and freezeHorizonSlots; omit any one and
    the projection raises, and every test below fails for the wrong reason.
    The block below is copied from
    ``test_entries_commit_seam.py::_meet_workspace`` (:97-117) so the two
    fixtures cannot drift on what a valid meet config is.
    """
    document: dict = {
        "config": {
            "tournamentName": "Spring Invitational",
            "intervalMinutes": 15,
            "dayStart": "08:00",
            "dayEnd": "18:00",
            "courtCount": 4,
            "defaultRestMinutes": 20,
            "freezeHorizonSlots": 0,
            "rankCounts": {},
        },
        "groups": [],
        "players": [],
        "matches": [],
    }
    config_over = over.pop("config", None)
    if config_over:
        document["config"] = {**document["config"], **config_over}
    document.update(over)
    return state_dto_from_document(document)


def test_expand_ranks_numbers_each_division():
    assert expand_ranks({"MS": 2}) == ["MS1", "MS2"]
    assert expand_ranks({}) == []
    # A junior league's own vocabulary, not the canonical five.
    assert expand_ranks({"U10": 1}) == ["U101"]


def test_is_doubles_rank_matches_the_console_suffix_convention():
    # lib/doubles.ts:25-27 -- strip trailing digits, then endswith("D").
    assert is_doubles_rank("XD2") is True
    assert is_doubles_rank("XD") is True
    assert is_doubles_rank("MS1") is False
    assert is_doubles_rank("BD") is True   # a director's own doubles code


def test_one_singles_slot_pairs_two_schools():
    state = _state(
        config={"rankCounts": {"MS": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[
            {"id": "p1", "name": "Ana", "groupId": "g1", "ranks": ["MS1"]},
            {"id": "p2", "name": "Bo", "groupId": "g2", "ranks": ["MS1"]},
        ],
    )
    out = build_lineup(state)
    assert len(out.generated) == 1
    m = out.generated[0]
    assert m.sideA == ["p1"] and m.sideB == ["p2"]
    assert m.eventRank == "MS1"
    assert m.matchType == "dual"
    assert m.durationSlots == 1


def test_a_bare_division_code_generates_NOTHING():
    """Ruling C: the generator does not seat. A committed entry carries the
    DIVISION until an operator seats it, and until then it plays no match.
    This is the property that makes the roster grid honest."""
    state = _state(
        config={"rankCounts": {"MS": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[
            {"id": "p1", "name": "Ana", "groupId": "g1", "ranks": ["MS"]},
            {"id": "p2", "name": "Bo", "groupId": "g2", "ranks": ["MS"]},
        ],
    )
    assert build_lineup(state).generated == []


def test_doubles_needs_two_a_side_and_an_incomplete_pair_is_reported():
    state = _state(
        config={"rankCounts": {"XD": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[
            {"id": "p1", "name": "Ana", "groupId": "g1", "ranks": ["XD1"]},
            {"id": "p2", "name": "Bo", "groupId": "g1", "ranks": ["XD1"]},
            {"id": "p3", "name": "Cy", "groupId": "g2", "ranks": ["XD1"]},
        ],
    )
    out = build_lineup(state)
    assert out.generated == []                       # g2 has one of the two
    assert out.incompletePairs == ["Riverside XD1"]  # group NAME, then rank


def test_pairs_are_strictly_ACROSS_groups():
    """Two entrants of one school never play each other -- the property
    P7b's club grouping made reachable at all."""
    state = _state(
        config={"rankCounts": {"MS": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}],
        players=[
            {"id": "p1", "name": "Ana", "groupId": "g1", "ranks": ["MS1"]},
            {"id": "p2", "name": "Bo", "groupId": "g1", "ranks": ["MS1"]},
        ],
    )
    assert build_lineup(state).generated == []


def test_a_custom_match_survives_and_a_lineup_slot_is_replaced():
    """The merge rule from RegenerateMenu.tsx:8-12: a match is a lineup slot
    keyed by (rank, the two schools, order-independent). Slots are rebuilt;
    everything else is kept."""
    state = _state(
        config={"rankCounts": {"MS": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[
            {"id": "p1", "name": "Ana", "groupId": "g1", "ranks": ["MS1"]},
            {"id": "p2", "name": "Bo", "groupId": "g2", "ranks": ["MS1"]},
        ],
        matches=[
            # Same slot key (MS1 | g1 | g2) -> rebuilt, so NOT kept.
            {"id": "old", "sideA": ["p1"], "sideB": ["p2"], "eventRank": "MS1"},
            # A hand-added exhibition -> kept.
            {"id": "custom", "sideA": ["p1"], "sideB": ["p2"], "eventRank": None},
        ],
    )
    out = build_lineup(state)
    assert [m.id for m in out.keptCustom] == ["custom"]
    assert len(out.generated) == 1
    assert out.generated[0].id not in {"old", "custom"}   # fresh identity
```

- [ ] **Step 2: Run them and watch every one fail.**

```bash
export PATH="$PWD/.venv/Scripts:$PATH"
pytest tests/backend/unit/test_meet_lineup.py -x -q
```

Expected: collection error / `ModuleNotFoundError: meet.lineup`.

- [ ] **Step 3: Write `apps/api/src/meet/lineup.py`.** A faithful transcription of
      `RegenerateMenu.tsx:24-30, 62-106, 108-120, 124-129`, plus the route.

```python
"""Meet lineup generation — the server half of F-DM-08 (SP-DM-3 P7c).

A meet's output IS its matches, and a lineup match is every feasible
CROSS-SCHOOL pairing at a numbered rank. This lived in the console as a
``useMemo`` (``RegenerateMenu.tsx``) until this slice, which is why the
Entries commit seam and the generator could hold two different ideas of
what a rank is (F-DM-23, closed by P7b) with nothing to notice.

**It takes a POSTED document and writes nothing.** The console regenerates
from roster edits that may not be persisted yet, so re-reading the blob
here would generate from a stale document; ``schedule_proposals`` takes the
state in the body for the same reason. Persistence stays where it was: the
console's autosave, through the single ``upsert_data`` funnel.

**Authority note, so a reviewer does not "fix" it into a join.** Divisions
are read from ``config.rankCounts`` on the posted document rather than from
the ``meet_events`` rows P7b added. The two are equivalent by construction
-- ``upsert_data`` derives the rows from that dict on every blob write --
and only the dict reflects an operator edit that has not been saved.

**It does not SEAT.** A player carries a bare DIVISION code ("MS") from the
Entries seam until an operator assigns them a numbered slot (R-DM-5: slot
assignment is an operator-side action). Such a player matches no rank here
and plays no match. Seating them silently would make the roster grid lie.
"""
```

Then, in order:

```python
def expand_ranks(rank_counts: Mapping[str, int]) -> list[str]:
    out: list[str] = []
    for prefix, count in (rank_counts or {}).items():
        for i in range(1, int(count) + 1):
            out.append(f"{prefix}{i}")
    return out


def is_doubles_rank(rank: str) -> bool:
    """The console's suffix convention (``lib/doubles.ts``), transcribed.

    The BACKEND's other answer -- ``entries/partners.py::is_doubles`` --
    reads ``entry_events.entry_type``, a column. It cannot serve here: this
    function is asked about a RANK on a blob player, and no
    ``entry_events`` row is in reach. Two answers, two key spaces, stated
    rather than silently duplicated (F-DM-13).
    """
    return re.sub(r"\d+$", "", rank).endswith("D")
```

`build_lineup(state)` then transcribes, keeping the console's ordering exactly (rank outer, then
`i`, then `j = i + 1`) so match numbering does not drift:

- `ranks = expand_ranks(state.config.rankCounts)`; `groups = state.groups`; `players = state.players`
- for each rank, `needed = 2 if is_doubles_rank(rank) else 1`
- for `i < j` over groups: collect side A / side B as the players of that group whose `ranks`
  contain the rank; `continue` if either has fewer than `needed`; else emit
  `MatchDTO(id=str(uuid4()), sideA=[...][:needed], sideB=[...][:needed], matchType="dual",
  eventRank=rank, durationSlots=1)`
- `incomplete_pairs`: for each doubles rank and each group, if exactly one player holds it, append
  `f"{group.name} {rank}"`
- `kept_custom`: `slot_key(m) = f"{m.eventRank or ''}|{s1}|{s2}"` where `s1, s2 = sorted(group of
  m.sideA[0], group of m.sideB[0])` with `"?"` for a missing lookup — **transcribe
  `RegenerateMenu.tsx:69-79` exactly, including the `"?"` fallback**; keep every `state.matches`
  whose key is not in the generated key set.

Guard `state.config is None` by returning an empty `LineupDTO`.

`matchType` is hard-coded `"dual"` because the console hard-codes it (`RegenerateMenu.tsx:98`).
**Write Task 0 Step 3's measured finding about `meetMode` into the docstring as a comment** — either
"no `tri` generation path exists anywhere in the tree, measured <date>" or, if one was found, cite
it. Do not add a `tri` branch this slice.

The router copies `schedule_advisories.py:46-49`'s shape:

```python
router = APIRouter(
    prefix="/tournaments/{tournament_id}/meet",
    tags=["meet-lineup"],
)


@router.post(
    "/lineup",
    response_model=LineupDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
async def generate_lineup(
    state: TournamentStateDTO,
    tournament_id: uuid.UUID = Path(...),
) -> LineupDTO:
    """Generate lineup matches from the POSTED roster. Writes nothing."""
    return build_lineup(state)
```

`tournament_id` is unused in the body **on purpose** — it is the tenancy seam
`test_tenant_isolation.py` derives from OpenAPI, and `require_tournament_access` resolves it BY
NAME. Say so in a comment or ruff/reviewers will call it dead.

- [ ] **Step 4: Mount the router.** In `core/main.py`, beside the other meet routers (`:425-432`):

```python
app.include_router(lineup.router, dependencies=_AUTH_DEP)
```

- [ ] **Step 5: Run the tests, the tenancy gate, and import-linter.**

```bash
export PATH="$PWD/.venv/Scripts:$PATH"
pytest tests/backend/unit/test_meet_lineup.py -q
pytest tests/backend/test_tenant_isolation.py -q
cd apps/api/src && lint-imports --config ../.importlinter; cd ../../..
```

Expected: all PASS. A tenancy failure means the path param or the dependency is missing.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/meet/lineup.py apps/api/src/core/main.py tests/backend/unit/test_meet_lineup.py
git commit -m "feat(meet): lineup generation moves to the server (F-DM-08 server half)

POST /tournaments/{tournament_id}/meet/lineup takes a posted
TournamentStateDTO and returns generated + kept-custom matches. It reads no
blob and writes nothing: the console regenerates from unsaved roster edits,
so the posted document is the only current one -- the same reason
schedule_proposals takes state in the body.

Semantics are the console's, transcribed: cross-group pairs only, two a side
for doubles, fresh ids for rebuilt slots, custom matches kept by slot key. A
bare division code still generates nothing; seating is the operator's
(R-DM-5) and arrives in a later task."
```

## Task 3: The console generates through the API (M)

**Files:**
- Modify: `apps/console/src/modules/meet/matches/RegenerateMenu.tsx` (delete `expandRanks` `:24-30`,
  `ranks` `:62`, `generated` `:81-106`, `incompletePairs` `:108-120`, `slotKey` `:69-79`,
  `generatedKeys`/`keptCustom` `:124-129`)
- Modify: `apps/console/src/api/client.ts` (add the call, following its neighbours)
- Modify: `apps/console/src/api/dto.ts` (`LineupDTO`)
- Modify: `apps/console/src/api/dto.generated.ts` (via `make generate-api`, not by hand)
- Test: `apps/console/src/modules/meet/matches/__tests__/` (follow whatever the folder already does)

**Interfaces:**
- Consumes: `LineupDTO` from Task 2 — `{ generated: MatchDTO[]; keptCustom: MatchDTO[];
  incompletePairs: string[] }`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Regenerate the DTOs and reconcile the hand mirror.**

```bash
export PATH="$PWD/.venv/Scripts:$PATH"
make generate-api
```

Then add `LineupDTO` to `apps/console/src/api/dto.ts` **by hand** to match. P0's parity oracle
compares the two and ratchets divergences to zero — if it reds, the hand mirror is wrong, not the
oracle. **`make generate-api` exits 2 on Windows even on success** (debt-log; its trailing `rm`),
and it calls bare `python`, so the venv must be on `PATH`. Judge it by the diff, not the exit code.

- [ ] **Step 2: Write the failing test.** The behaviour to pin is that pressing Regenerate calls the
      endpoint and imports what came back — not that the console computed anything:

```tsx
it('regenerates from the API response, not from a local computation', async () => {
  const generate = vi.fn().mockResolvedValue({
    generated: [{ id: 'srv-1', sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1',
                  matchType: 'dual', durationSlots: 1 }],
    keptCustom: [{ id: 'custom', sideA: ['p1'], sideB: ['p2'], matchType: 'dual',
                   durationSlots: 1 }],
    incompletePairs: [],
  });
  // ... mock the api client the way this folder's existing tests do ...

  render(<RegenerateMenu />);
  await userEvent.click(screen.getByTestId('regenerate-toggle'));
  // The fetch happens ON OPEN and `canGenerate` gates the confirm on the
  // response, so clicking confirm immediately no-ops against a disabled
  // button and the waitFor below times out. Wait for the enable first.
  await waitFor(() =>
    expect(screen.getByTestId('regenerate-confirm')).toBeEnabled(),
  );
  await userEvent.click(screen.getByTestId('regenerate-confirm'));

  await waitFor(() => {
    expect(generate).toHaveBeenCalledOnce();
    expect(useTournamentStore.getState().matches.map((m) => m.id))
      .toEqual(['srv-1', 'custom']);
  });
});
```

- [ ] **Step 3: Run it and watch it fail** (`generate` never called).

- [ ] **Step 4: Rewrite the component's data path.** Delete the six memos listed under **Files**.
      Fetch on open (so the info line and the incomplete-pairs warning have real content before the
      operator confirms), hold `{ generated, keptCustom, incompletePairs }` in state, and:

```tsx
const regenerate = () => {
  if (!lineup) return;
  importMatches([...lineup.generated, ...lineup.keptCustom]);
  setOpen(false);
};
```

`canGenerate` becomes `(lineup?.generated.length ?? 0) > 0`. The three `infoLine` branches
(`:154-164`) keep their exact copy; `ranks.length === 0` becomes a check on
`config?.rankCounts` being empty, since `ranks` is gone. **Keep every guard intact** — `resultsLocked`
(`:177`), the `isLiveDay` warning (`:199-209`), the non-primary button styling and its comment
(`:168-171`), and both `data-testid`s. Add a loading and an error state; a failed fetch must leave
the confirm button **disabled**, never silently generate nothing.

- [ ] **Step 5: Run the meet console suite.**

```bash
npm --prefix apps/console run test:run -- src/modules/meet
npm --prefix apps/console run test:run -- src/platform/contracts
```

The contract suite matters: `moduleContract.ts` declares `apiClient` endpoints **by reference**, so
a new endpoint may need a declaration + a baseline update. If it reds, update the contract
declaration — that is the contract working, not a failure to route around.

- [ ] **Step 6: Prove the deletion gate.**

```bash
grep -rn "expandRanks" apps/console/src/modules/meet/matches   # expect: 0 hits
```

- [ ] **Step 7: Commit.**

```bash
git add apps/console/src/api apps/console/src/modules/meet apps/console/src/platform
git commit -m "refactor(meet): RegenerateMenu generates through the API

Deletes the client-side lineup useMemo -- generation now has one home
(F-DM-08). Every guard is unchanged: the results lock, the live-day warning,
the deliberately non-primary button, both test ids. A failed request leaves
the confirm disabled rather than generating an empty lineup."
```

---

# Half B — seating, pairs, and the mirror

## Task 4: `_plan_meet` projects the pair (M)

**Files:**
- Modify: `apps/api/src/entries/entries.py` (`_plan_meet` `:419`; `_pair_batch` `:750` is reused
  unchanged; call site `:381`)
- Modify: `apps/api/src/core/schemas.py` (`PlayerDTO`, after `entryPlayerId` at `:275`)
- Modify: `apps/console/src/api/dto.ts` + `dto.generated.ts` (via `make generate-api`)
- Test: `tests/backend/unit/test_entries_commit_seam.py`

**Interfaces:**
- Consumes: `_pair_batch(candidates, events) -> dict[uuid.UUID, Entry]` (`entries.py:750-825`) —
  **already exists and is already the ruled authority**; `_plan_bracket` calls it at `:843`. It
  refuses to pair unless both halves carry `partner_accepted_at`, the link is mutual, and the event
  takes pairs. Do not re-implement or relax any leg.
- Produces: `PlayerDTO.partnerPlayerId: Optional[Identifier]`. **Task 5 is its only reader.**

- [ ] **Step 1: Write the failing test** in `test_entries_commit_seam.py`, beside the other
      `_plan_meet` tests:

```python
def test_a_confirmed_meet_pair_commits_as_two_players_who_point_at_each_other(repo, session):
    """R-DM-4's Meet half, which P5 cut for lack of a reader (P7c is it).

    A Meet doubles slot holds TWO players -- the pair is not one roster row
    the way a bracket TEAM participant is (ADR 0006: the match records do
    not merge, and neither do these). So the projection is a mutual pointer,
    not a merge, and it is what lets the operator seat both halves into one
    slot in a single action.
    """
    tid = _meet_workspace(repo, ranks=("XD",))
    ev = _entry_event(session, tid, code="XD", entry_type="doubles")
    a, b = _accepted_pair(session, tid, ev, "Ana Reyes", "Bo Lin", club="Kingsway BC")

    commit_entries(repo, tid)

    players = repo.tournaments.get_by_id(tid).data["players"]
    by_name = {p["name"]: p for p in players}
    assert len(players) == 2, "a Meet pair is two roster rows, never one"
    assert by_name["Ana Reyes"]["partnerPlayerId"] == by_name["Bo Lin"]["id"]
    assert by_name["Bo Lin"]["partnerPlayerId"] == by_name["Ana Reyes"]["id"]
    # R-DM-5 still holds: the division, never a slot.
    assert all(p["ranks"] == ["XD"] for p in players)


def test_a_HALF_accepted_meet_pair_commits_as_singletons_and_nothing_dangles(repo, session):
    """The negative control _pair_batch's own docstring demands: every leg of
    its predicate is a REFUSAL to pair, never a decision to un-pair. A
    nomination is not a pair; the director pairs it by hand (R-DM-4's ruled
    note)."""
    tid = _meet_workspace(repo, ranks=("XD",))
    ev = _entry_event(session, tid, code="XD", entry_type="doubles")
    a, b = _nominated_pair(session, tid, ev, "Ana Reyes", "Bo Lin")  # not accepted

    commit_entries(repo, tid)

    players = repo.tournaments.get_by_id(tid).data["players"]
    assert len(players) == 2
    assert all(p.get("partnerPlayerId") is None for p in players)
```

`_accepted_pair` / `_nominated_pair` stand in for whatever helpers the file already has — **read
the file and reuse them**; `_plan_bracket`'s pair tests already build both shapes.

- [ ] **Step 2: Run and watch both fail** (the field does not exist; the first `KeyError`s).

- [ ] **Step 3: Add the field** to `PlayerDTO`, after `entryPlayerId` (`schemas.py:275`):

```python
    # R-DM-4's Meet half (SP-DM-3 P7c). The OTHER roster row of a confirmed
    # doubles pair. A Meet doubles slot holds two players, so a pair is two
    # rows pointing at each other -- not one merged row, which is what
    # ``_plan_bracket`` builds for a bracket TEAM participant, whose key
    # space is different (ADR 0006).
    #
    # Written only by the commit seam, and only when ``_pair_batch``'s full
    # mutual-acceptance predicate holds. A director's hand-made pairing does
    # not set it: hand pairing stays the operator's, per R-DM-4's ruling
    # note, and seating reads occupancy from the grid either way.
    #
    # ADDITIVE ONLY - no ``CURRENT_TOURNAMENT_SCHEMA_VERSION`` bump, for the
    # reason written on ``entryPlayerId`` above.
    partnerPlayerId: Optional[Identifier] = None
```

- [ ] **Step 4: Wire `_plan_meet`.** Take `pairs` the way `_plan_bracket` does at `:843`, and after
      the candidate loop has produced every player payload, set the mutual pointer for both halves
      of each pair. **Two ordering hazards, both real:**
  - the pointer can only be written once **both** payloads have ids, so it is a second pass over
    `planned`, not an assignment inside the loop;
  - a half that was **skipped** (invalid player, unmappable event) leaves its partner with a
    dangling pointer — write the pointer only when **both** halves are in `planned`, and add a test
    for it if `_pair_batch`'s predicate does not already exclude the case (check before writing one).

Set `mutated = True` when a pointer is written, or the document will not persist.

- [ ] **Step 5: Run the seam suite and the parity oracles.**

```bash
export PATH="$PWD/.venv/Scripts:$PATH"
pytest tests/backend/unit/test_entries_commit_seam.py -q
make generate-api
npm --prefix apps/console run test:run -- src/api
npm --prefix apps/entrant run test:run
```

Add `partnerPlayerId` to `apps/console/src/api/dto.ts` by hand to match the generated shape. The
entrant tier does not read `PlayerDTO`; run its suite anyway to prove that.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src apps/console/src/api tests/backend
git commit -m "feat(entries): a committed Meet doubles pair keeps its partner (R-DM-4 Meet half)

_plan_meet now takes the same _pair_batch authority _plan_bracket does and
projects a confirmed pair as two roster rows pointing at each other. P5 cut
this half because a Meet pair field had no reader; the seat action in the
next task is that reader.

Two rows, not one: a Meet doubles slot holds two players, so nothing merges
(ADR 0006). A half-accepted pair still commits as singletons and the
director pairs it by hand, per R-DM-4's ruling note."
```

## Task 5: Seat the entrants — the operator action R-DM-5 requires (M)

**Files:**
- Modify: `apps/console/src/modules/meet/roster/positionGrid/useRankAssignment.ts`
- Modify: `apps/console/src/modules/meet/roster/RosterTab.tsx` (surface the action + the count)
- Test: `apps/console/src/modules/meet/roster/__tests__/useRankAssignment.test.ts`

**Interfaces:**
- Consumes: `expandRanks` from Task 1; `PlayerDTO.partnerPlayerId` from Task 4; the existing
  `assignRank` / `unassignRank` / `moveRank` and the store's `updatePlayer`.
- Produces: `seatUnslotted(schoolId: string): number` on `useRankAssignment`'s return — returns how
  many players it seated.

Per **Ruling A** this extends the existing surface. Per **Ruling C** it is the explicit action that
closes the disconnect.

- [ ] **Step 1: Write the failing tests** in `useRankAssignment.test.ts`:

```ts
it('seats a division-only entrant into the first free slot of that division', () => {
  seedStore({
    config: { rankCounts: { MS: 2 } },
    players: [
      { id: 'p1', groupId: 'g1', ranks: ['MS1'] },   // already seated
      { id: 'p2', groupId: 'g1', ranks: ['MS'] },    // committed entry, awaiting a slot
    ],
  });
  const { result } = renderHook(() => useRankAssignment());

  act(() => { expect(result.current.seatUnslotted('g1')).toBe(1); });

  const p2 = useTournamentStore.getState().players.find((p) => p.id === 'p2')!;
  expect(p2.ranks).toEqual(['MS2']);   // MS1 taken; the bare code is consumed
});

it('seats BOTH halves of a confirmed pair into the SAME doubles slot', () => {
  seedStore({
    config: { rankCounts: { XD: 2 } },
    players: [
      { id: 'p1', groupId: 'g1', ranks: ['XD'], partnerPlayerId: 'p2' },
      { id: 'p2', groupId: 'g1', ranks: ['XD'], partnerPlayerId: 'p1' },
    ],
  });
  const { result } = renderHook(() => useRankAssignment());

  act(() => { result.current.seatUnslotted('g1'); });

  const players = useTournamentStore.getState().players;
  expect(players.find((p) => p.id === 'p1')!.ranks).toEqual(['XD1']);
  expect(players.find((p) => p.id === 'p2')!.ranks).toEqual(['XD1']);
});

it('leaves an entrant unslotted when the division is full, and says how many', () => {
  seedStore({
    config: { rankCounts: { MS: 1 } },
    players: [
      { id: 'p1', groupId: 'g1', ranks: ['MS1'] },
      { id: 'p2', groupId: 'g1', ranks: ['MS'] },
    ],
  });
  const { result } = renderHook(() => useRankAssignment());

  act(() => { expect(result.current.seatUnslotted('g1')).toBe(0); });

  // Kept, never dropped: the operator raises the slot count in Configuration
  // or seats by hand. Losing the mapping is the F-P7c-1 defect.
  expect(useTournamentStore.getState().players.find((p) => p.id === 'p2')!.ranks)
    .toEqual(['MS']);
});

it('does not touch another school', () => {
  seedStore({
    config: { rankCounts: { MS: 2 } },
    players: [
      { id: 'p1', groupId: 'g1', ranks: ['MS'] },
      { id: 'p2', groupId: 'g2', ranks: ['MS'] },
    ],
  });
  const { result } = renderHook(() => useRankAssignment());

  act(() => { result.current.seatUnslotted('g1'); });

  expect(useTournamentStore.getState().players.find((p) => p.id === 'p2')!.ranks)
    .toEqual(['MS']);
});
```

- [ ] **Step 2: Run and watch them fail** (`seatUnslotted is not a function`).

- [ ] **Step 3: Implement `seatUnslotted`.** The algorithm, in one pass:

1. `slotRanks = expandRanks(config?.rankCounts)`; a player's **unslotted divisions** are the values
   in `ranks` that are not in `slotRanks` and that name a configured prefix.
2. Build current occupancy for the school: for every slot rank, how many of this school's players
   hold it (capacity is `isDoublesRank(rank) ? 2 : 1` — the same rule `useRankValidation.ts:94-97`
   already uses; **reuse it, do not restate it**).
3. Process divisions in `rankCounts` order and players in store order, so the result is
   deterministic. Seat a **confirmed pair together** into the first slot with two free places;
   seat a singleton into the first slot with one free place. When nothing is free, leave the bare
   code alone and do not count it.
4. Replace the bare division code with the slot rank in the player's `ranks`.

**A pair whose halves sit in DIFFERENT schools is seated as two singletons.** `partnerPlayerId`
comes from `_pair_batch`, but each half's `groupId` comes from their **own free-text `club`** — two
partners who typed different club spellings commit into two groups, and a slot belongs to one
school, so seating them together is not expressible. Treat the pointer as actionable **only when
both halves share a `groupId`**; otherwise seat each as a singleton. This is the same posture as
P7b's two-spellings-of-one-club ruling: visible in the grid and fixable by an operator moving one
player's school, rather than guessed at here. **Do not build handling beyond this rule** — no
cross-school slot, no auto-move, no refusal.

**The stale-closure trap is already documented in this file** (`useRankAssignment.ts:61-67`, on
`moveRank`): a naive loop of `assignRank` calls all read the same `players` closure, so the second
call re-adds what the first removed. **Compute the whole seating plan first, then issue exactly one
`updatePlayer` per affected player.** Do not call `assignRank` in a loop.

- [ ] **Step 4: Run the tests.**

```bash
npm --prefix apps/console run test:run -- src/modules/meet/roster
```

- [ ] **Step 5: Surface it in the roster.** In `RosterTab.tsx`, near the school's grid: when the
      active school has unslotted entrants, show the count and a button that calls
      `seatUnslotted(activeSchoolId)`.

Copy — do not re-derive — the surrounding surface's conventions: `EYEBROW_CLASS` /
`INTERACTIVE_BASE` from `lib/utils`, and the secondary button treatment
`RegenerateMenu.tsx:184` uses. **The copy must name the state, not the mechanism**: e.g.
*"3 entrants awaiting a position"* with a *"Seat entrants"* action. Nothing here is destructive, so
it needs no arm-and-confirm. **`window.confirm` is BANNED repo-wide (0 call sites) — do not add one.**

Add one component test that the affordance appears only when there is something to seat.

- [ ] **Step 6: Full meet suite + lint + types.**

```bash
npm --prefix apps/console run test:run -- src/modules/meet
npm run lint:scheduler
npm --prefix apps/console run build       # tsc -b runs inside build
```

- [ ] **Step 7: Commit.**

```bash
git add apps/console/src/modules/meet/roster
git commit -m "feat(meet): seat committed entrants into lineup positions (R-DM-5)

The operator-side slot assignment R-DM-5 requires, on the surface that
already does slot assignment: the position grid. A committed entry arrives
carrying its DIVISION; this seats it into the first free numbered position,
both halves of a confirmed pair into one doubles slot, and leaves anything
that does not fit alone rather than dropping it.

One updatePlayer per player, computed from a single plan -- the stale-closure
trap moveRank's comment already documents."
```

## Task 6: Retire the mirror (S)

**Files:**
- Modify: `tests/backend/unit/test_entries_commit_seam.py` (`_generate_matches` and its three uses
  at `:714`, `:728`, `:731`)

This is the one place in this plan where **an existing test changes on purpose**, and the program
authorized it in P7b's handoff: *"when P7c lands, re-invert the test … against the real server-side
generator, and delete the console-generator mirror with it."*

**How seating is simulated, stated so it is not over-read.** A backend test cannot press the
console's Seat button, and Ruling C keeps seating client-side. So the re-inverted test still seats
by **document substitution** — the same move the current test makes at `:710-713`. What changes is
that the substitution now mimics a **shipped operator capability** rather than standing in for one
that does not exist, and the generator half is the **real** `meet.lineup.build_lineup` rather than a
transcription. Do **not** read the handoff's "against the real server-side generator" as a licence to
build a server-side seat endpoint: that would be a second writer for `ranks` beside the console's
`updatePlayer`, against the architecture. The tension is one line in the ledger, not a task.

- [ ] **Step 1: Rewrite the assertion** to call `build_lineup` on a `TournamentStateDTO` projected
      from the committed document (`state_dto_from_document(document)`), with the players' `ranks`
      substituted from `["MS"]` to `["MS1"]` and a comment stating the two paragraphs above in
      short. Keep the existing inline control at `:719-728` — the pre-P7b invented-group shape must
      still generate nothing — now also through `build_lineup`.

- [ ] **Step 2: Delete `_generate_matches` and rename the test.**
      `test_a_committed_meet_entry_cannot_reach_a_generated_match` →
      `test_a_seated_meet_entry_reaches_a_generated_match`. Keep
      `test_the_same_fixture_generates_nothing_under_the_pre_p7b_shape` — it is now a control over
      the real generator, which is strictly better than what it was.

- [ ] **Step 3: Prove the deletion gate.**

```bash
grep -rn "_generate_matches" tests/ --include=*.py     # expect: 0 hits
```

- [ ] **Step 4: Run the suite.**

```bash
export PATH="$PWD/.venv/Scripts:$PATH"
pytest tests/backend/unit/test_entries_commit_seam.py -q
```

- [ ] **Step 5: Commit.**

```bash
git add tests/backend/unit/test_entries_commit_seam.py
git commit -m "test(entries): a SEATED Meet entry reaches a generated match, via the real generator

Deletes _generate_matches, the hand transcription of the console generator
that existed only because generation lived in the console -- a disclosed
staleness risk with no cross-tier gate. The assertion now runs
meet.lineup.build_lineup.

Seating is still simulated by document substitution: a backend test cannot
press the console's Seat button, and seating stays client-side by design
(one writer for ranks). The substitution now mimics a shipped capability
rather than standing in for a missing one."
```

## Task 7: Gate, records, and the two owner items (S)

**Files:**
- Modify: `docs/history/programs/DM3_PROGRESS.md` (append a new dated entry — **never edit an older
  one**)
- Modify: `docs/reference/debt-log.md` (D24; F-P7c-1's closure; any new rows)

- [ ] **Step 1: Run the whole gate.**

```bash
export PATH="$PWD/.venv/Scripts:$PATH"      # trap 1
make check
```

Read pytest's **summary line** (trap 2). Expect Task 0's baseline plus this slice's new tests.
`make check` does **not** run `npm run build`; CI's interaction-smoke job does. Task 3 Step 6 and
Task 5 Step 6 already ran it — if you skipped them, run it now.

- [ ] **Step 2: Write the ledger entry.** It must carry, because the SDD scratch ledger is deleted
      with the slice (the program's permanent-source rule):
  - the commit chain, one line each, with what each commit did;
  - **F-P7c-1 in full** — the defect, how it was reproduced against the mounted component, the shape
    it needed, and the fix's scope decision (`expandRanks`, not a digit test, because `U10`);
  - **the correction to P7b's handoff:** the slot-assignment surface had prior art —
    `PositionGrid` + `useRankAssignment` + `useRankValidation` — so "no prior art in the repo" was
    wrong, and P7c extended rather than built. Per the standing convention this correction lives
    **here**, in the new dated entry, not as an edit to P7b's;
  - **why this slice adds no migration**, and therefore that the program's SQLite-only caveat does
    not apply to its evidence;
  - Task 0's measured `meetMode` finding;
  - the seating-is-client-side tension from Task 6, one line;
  - Task 0's and the final gate's counts, both produced.

- [ ] **Step 3: Update the debt log.**
  - **D24:** append the Ruling D finding — the re-ruling's premise ("P7c builds a first-class
    regeneration path") was about **Meet** regeneration, while D24 is `bracket_events.id`; P7c
    touched no bracket route, draw key or table, so it informs the decision no more than P7b did.
    Return it to the owner with the one-line recommendation (accept and document). **Do not mark it
    ruled.** Append; the log is append-in-the-middle and rows are cited by title, not line.
  - **Close the F-P7c-1 row** if you opened one, or record it as found-and-fixed-in-slice.
  - Add any new rows the tasks turned up.

- [ ] **Step 4: Commit the records.**

```bash
git add docs/
git commit -m "docs: SP-DM-3 P7c ledger + debt-log (D24 returns to the owner)"
```

- [ ] **Step 5: Whole-branch review**, then one fix wave, then ff-merge to `main` per the program's
      standing instruction. Delete the branch at merge.

---

# Self-review

**Coverage of what P7c inherited.** (1) rank disconnect → Tasks 2, 3, 5 (generator ported; seating
shipped; Ruling C states why those are two things). (2) operator slot surface → Ruling A + Task 5.
(3) `_plan_meet` side construction → Task 4. (4) mirror retirement → Task 6. (5) D24 → Ruling D +
Task 7 Step 3, returned rather than decided. Plus F-P7c-1 → Task 1, which was not in the inheritance
because nobody had looked.

**What this plan deliberately does NOT do.**
- No migration, no new column, no `meet_events` change. P7b's entity is used as-is.
- No re-key of anything. R-DM-11(b) stands; `eventCode` is still the public key.
- No server-side seating endpoint (Task 6 states the reason).
- No `tri` generation branch — Task 0 measures whether one exists; the port transcribes the
  hard-coded `"dual"`.
- No move of the six console `rankCounts` readers P7b listed. That is console work with no backend
  content, and P7b's Ruling B already ruled it out of scope; it stays out.
- No `PlayerDTO.partnerPlayerId` reader beyond Task 5. One field, one writer, one reader.

**Shippable midpoint.** Half A (Tasks 0–3) is a complete, behaviour-preserving change plus one bug
fix. If Half B has to stop, Half A merges on its own and the slice's remainder re-plans against the
new tree.

**Ordering dependencies.** 1 → 2 → 3 (Task 1's `expandRanks` export is what Task 3 deletes the copy
of). 4 → 5 (`partnerPlayerId` is Task 5's pair input). 5 → 6 (the re-inversion needs seating to be a
real capability). 7 last.

**Open owner items this slice does not decide** (unchanged in number from P7b's handoff, D24 now
returned with a recommendation): D22 (gender on adoption) · the adoption-path divergence · the
orphan roster-blob row on a person-refusal · F-DM-55 (`match_states` String→DateTime) · F-DM-47
(may `api/dto.ts` name domain types) · **D24**.
