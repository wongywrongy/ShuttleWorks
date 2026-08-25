# SP-DM-3 P6 — The bracket person stops being their name

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** R-DM-7(a) — the bracket console stops reading identity out of display names. The two routines that do it die: `bracketMigration.ts`'s **decode-from-label** (`nameFromSlug` + the `split(' / ')` positional zip onto `member_ids`) and its **`p.name === p.id` corruption repair**, whose output is persisted so a wrong guess becomes data. Nothing is re-keyed, no slot blob is rewritten, no migration is written. The one positive move is that P4's `bracket_participants.entry_player_id` starts doing identity work at the commit seam, where "already in this draw" is answered by participant id alone today.

**Architecture:** Deletion, with one seam guard. The card's framing — "demote `playerSlug.ts` to at most a URL helper" — is **not achievable and not intended**: R-DM-7(a) itself keeps hand-added participants slug-keyed and explicitly accepts the same-name collision as a known residual, and `playerSlug()` has exactly **one** production caller (the hand-add mint at `BracketRosterTab.tsx:137`). So P6 does not touch the mint direction on either tier. What it deletes is the **read** direction — every place the console tries to recover a person, or a person's name, from a string a human can retype. After P6, a bracket person is named by a key (`entry_player_id`, or the roster row's own `id`) and never inferred from a label.

**Tech Stack:** React + Vite console, vitest (`apps/console`); FastAPI + SQLAlchemy (`apps/api/src`, sys.path root — imports are `from entries import …`), pytest at the repo root with the repo `.venv`.

**Spec:** program card §C6 (`docs/history/superpowers/plans/2026-08-24-sp-dm-3-domain-unification-program.md:59-60`) · ruling **R-DM-7** (`docs/history/programs/DM1_RULINGS.md:63-73`) · design doc §2 P6 (`docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md:163-171`) + its amended traceability rows (`:227-229`) · audit **F-DM-04 / 14 / 15 / 19** (`docs/history/audits/2026-08-24-domain-model-audit.md:451,466,467,471`) and the register-collision warning at `:568`.

**Branch:** `dm3/p6-person-demotion` off `main` @ `ca15d7d7` (P5 merged; the branch already exists).

**All line numbers in this plan anchor to `ca15d7d7`.** Re-anchor by symbol if the tree has moved.

---

## Global Constraints (inherited — read them, they bind every task)

The program plan's Global Constraints (`…-domain-unification-program.md:13-22`) apply verbatim. The ones that actually bite in P6:

- **R-DM-7(a) is the ceiling: no re-key, no slot-blob rewrite.** `bracket_participants.id` keeps its `String(100)` form. `bracket_matches.side_a/side_b/slot_a/slot_b/dependencies` are not reshaped. Hand-added participants stay slug-keyed and render as plain text (F-DM-19). If a task starts to want a re-key or a blob reshape, **STOP and report** — that is R-DM-7(b), which was ruled against.
- **I4: flags, never resolutions**, and never a 409. The one seam change in this slice (Task 5) is a **refusal to insert a second row**, never a merge, a removal, or an error.
- **F-DM-11:** any FK reaching `models.py` lands with its migration in the SAME commit, with a negative control asserting `IntegrityError` against **migration-built** schema. **P6 adds no FK, no column and no migration.** If a task starts to want one, STOP and report.
- **StrictModel same-commit rule.** A DTO field and the payload write that fills it land in the same commit, with `PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api` regen in that commit (a bare `python` fails), then `apps/console/src/api/dto.ts` reconciled **by hand**. **P6 adds no DTO field** — Task 6 edits one Python *docstring* that the generator copies into `dto.generated.ts`, so that task carries a regen and nothing else.
- **Parity ratchet cap stays 19.** `apps/console/src/api/__tests__/dtoParity.allowlist.json` is untouched. Raising the cap (`dtoParity.test.ts:209`) would be a ruling, not an implementation detail.
- **R2** (no FK on `entry_events.bracket_event_id`), **ADR 0006** (no match merge), **ADR 0014** (no renames), **R7/R13** (no hard contact unique index), **D7** (scrub, keep rows), the 2026-08-23 minting rule (same account · same normalized name · same birth year, all present) — all stand untouched.
- **Console architecture boundaries are machine-checked**: `platform/` must not import `modules/` or `pages/`; a NEW cross-module edge between feature modules is an **ERROR**; shared code lives in `lib/`. Baseline is **16 warnings / 0 errors** — P6 deletes code inside one module and adds no import, so the number must not move.
- Backend list queries need the stable tiebreaker `created_at DESC, id DESC`. P6 adds no list query.
- Path-limited commits (`git commit -- <paths>`), never `git add .`. Gate the specific suite per task; `make check` at slice end (~15 min, both tiers).
- **Standing program caveat, restated:** all migration and FK evidence in this program to date is **SQLite only; Postgres is untested.** P6 carries no migration, so it adds nothing to that debt — but the ledger keeps saying it.
- **Register collision — the one naming rule this slice must not break.** `bracketMigration.ts:11` cites defect **D3**. That is the **bracket defect series**, *not* debt-log D3 (which is the depcruise `no-cross-product` warns). Every reference in code, tests, commit messages and the ledger cites it as **`bracketMigration.ts:8-14`** or "the D3 narrative in that comment" — **never** "debt-log D3" (`…-domain-model-audit.md:568`).

**Run commands:** console `npm --prefix apps/console run test:run -- <path filter>`; type gate `npm --prefix apps/console run build`. Backend `.venv\Scripts\python.exe -m pytest <path> -q` from the repo root (or `pytest` with the venv active). DTO regen: `PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api`. Slice end: `make check`.

---

## Judgment calls this plan makes (controller: these are the ones to overrule if you disagree)

1. **`playerSlug()` survives, unchanged, as the hand-add id mint. P6 does not demote it.** This is the largest deviation from the card's wording and the first one to overrule if you disagree — but overruling it **reopens R-DM-7, not just this plan**. The ruling's own text is the argument: *"Hand-added participants remain slug-keyed and render as plain text per the ruled caveat (F-DM-19) … Known residual: two hand-added same-named participants still collide; accepted under the plain-text caveat"* (`DM1_RULINGS.md:66-70`). That residual can only exist if the mint at `BracketRosterTab.tsx:137` — `playerSlug()`'s **only** production caller — survives. What P6 delivers against F-DM-04 is what the ruling delivers: **identity for everything that resolves to a person is `entry_player_id`**, and the slug is demoted from *identity* to *a locally-unique row id an operator typed into existence*. **Cost if overruled:** hand-adds mint `p-{crypto.randomUUID()}`, the collision disappears, the ruling's residual sentence becomes false, and `BracketRosterTab`'s silent-bail-on-duplicate (`:138-142`) has to become a real UX decision (two identically-named rows an operator cannot tell apart). S in code, a ruling in substance.

2. **`reconcileBracketRoster` is TRIMMED, not deleted.** It keeps the PLAYER-participant extraction and the TEAM-member flatten; it loses the label decode and the de-slug fallback. A TEAM member that no PLAYER participant can name is **omitted from the roster** rather than named by a guess — F-DM-19's don't-invent posture applied to the only population that still hits this path. **Cost if overruled** (delete the whole module + `BracketTab`'s effect): the singles-legacy first-load migration goes with it for no extra card compliance, and `bracketRosterMigrated` becomes a dead wire field on a versioned blob — a DTO deletion, a `tournaments.data` shape question, and a P0 parity conversation this slice does not need.

3. **`DrawView.tsx:989` — the last remaining `split(' / ')` — is KEPT, with a comment.** It splits a label **the console itself minted from ids two lines earlier** (`labelFor` → `side.map(id => nameById[id]).join(" / ")`, `:1200`), purely to render a doubles side one member per line on a card. No identity flows out of it and nothing is persisted; it is a line-breaking device on a string that never left the render. **Cost if overruled:** resolve member names from `participantById[teamId].members` + `bracketPlayers`, with a fallback for legacy teams whose member ids are roster slugs the snapshot cannot name — ~S, `DrawView.tsx` only, and it re-introduces exactly the "member id may not resolve" branch P6 is deleting elsewhere.

4. **The blob-vs-column double-store row (`debt-log.md:98`) is IN, as an ASSERTION ONLY — P6 writes no backfill.** The row's attached edge ("a P6 backfill must key the blob in the same pass, or a roster re-save rebuilds from the blob and undoes it") is honoured by **not backfilling**: there is nothing to backfill *from* for legacy slug rows (no person behind them), and seam rows are born with both copies in one plan. So the edge stays counterfactual and P6's deliverable is the agreement assertion the row says is missing, at the seam where both copies are written (Task 4). **Cost if overruled** (write the backfill): a migration, in a slice that R-DM-7(a) scoped to have none, and the plan must then key `tournaments.data["bracketPlayers"]` in the same statement — which is a `tournaments.data` write from Alembic, a pattern this repo has never used.

5. **The leg-7 person-key row (`debt-log.md:78`) is IN, as a cuttable Task 5 — and it is M, not the S the row estimates.** It is the only place P6 makes P4's key *do work* rather than delete something, and the row names P6 by name. But the naive implementation has a **re-run idempotency trap** that a fresh subagent will fall into: a seam-built TEAM carries `members[0]`'s key, so a key check inside the pair legs makes the pair refuse itself on the second run and emit a stray singleton for `members[1]`. Task 5 spells the trap and the shape that avoids it. **Cost if overruled:** cut Task 5 whole (it touches no other task) and re-home the row with a loud ledger sentence — it is then unowned, because P7 and P9 have no claim on it.

6. **No `BLOB_VERSIONS` flip, and five owner comments are owed a correction.** Answered in full in "Pickup (a)". **Cost if overruled:** reshaping `side_a`/`side_b`/`slot_a`/`slot_b`/`dependencies` is precisely the blob rewrite R-DM-7(a) ruled against.

7. **The deletion gate is scoped to `apps/`.** `rg "p\.name === p\.id"` unscoped returns the card, the design doc, the audit and **this plan file** — all of which quote the pattern on purpose. The binding gate is `rg "p\.name === p\.id" apps/` → 0. Same for the decode gate. **Cost if overruled:** the gate can never pass and the slice can never close.

8. **The four `bracketMigration.test.ts` decode/heal cases and the whole `BracketTab.test.tsx` heal describe are DELETED, by ruling.** They pin exactly what card §C6 says to delete. Per the P3 precedent (a flipped test is renamed and cites its ruling, never silently edited), each deletion carries the ruling cite in the commit message and the ledger. **Cost if overruled:** the deletions cannot land at all — these tests *are* the behavior.

---

## What the tree says that the card does not

Report these to the controller; they are facts, not deviations. All anchored to `ca15d7d7`.

1. **F-DM-14's "five render sites" is ONE.** The audit (`:466`) lists `DrawView.tsx:989,1200`, `bracketLabels.ts:147`, `BracketMatchesTab.tsx:137`, `opsBlock.ts:25` as repetitions of the same split. Four of them are **joins, not splits** — `side.map((id) => nameById[id] ?? id).join(' / ')` at `DrawView.tsx:1200`, `bracketLabels.ts:157`, `BracketMatchesTab.tsx:137`, `opsBlock.ts:25` (plus a fifth the audit missed, `MatchDetailPanel.tsx:87-88`). That is the **correct** direction: ids → names. A repo-wide `rg "\.split\(' / '\)|\.split\(\" / \"\)"` over `apps/console/src`, `apps/entrant/app` and `packages` returns exactly **two** hits: `bracketMigration.ts:47` (the real decode) and `DrawView.tsx:989` (presentation only, judgment call 3). **F-DM-14's read half is one function, not five.**

2. **`toPlayerSlug` is a phantom.** The design doc's deletion gate (`:170`) greps for `playerSlug|toPlayerSlug|nameFromSlug`; `toPlayerSlug` matches nothing anywhere in the tree. This is the same class of defect P5 found in its own inherited gate (a pattern that could never match).

3. **That gate can never reach 0, and "URL helper" describes nothing that exists.** `playerSlug` has exactly one production caller (`BracketRosterTab.tsx:137`) and **no URL consumer anywhere** — no route, no query param, no public link is built from a slug. "Demote to a URL helper" is aspiration, not description, and R-DM-7(a) forbids the demotion anyway (judgment call 1). The honest gate is stated in Task 6.

4. **The decode's only remaining population is pre-roster-blob legacy brackets — and P5 shrank it to zero for new data.** `BracketTab.tsx:136` runs `reconcileBracketRoster` only when `!bracketRosterMigrated && bracketPlayers.length === 0`. The commit seam **always** appends a real-named row per person to `document["bracketPlayers"]` (`entries/entries.py:731-738`, `_bracket_payload` at `:588-606`), for both halves of a TEAM. So any bracket the Entries flow touched has a non-empty roster and never enters the migration at all. The decode and the repair both serve exactly one population: brackets whose participants predate the roster blob. **Both deletions have the same blast radius, which is why they belong in one slice.**

5. **The split-and-zip is correct today by luck, and the plan should say so out loud.** `entries.py::team_name(members[0], members[1])` (`:244-261`) writes the label in the same order `member_ids` is built (`:774-799`), so `bracketMigration.ts:47-53` zips a seam-built team correctly **by construction**. That is not a contract — nothing asserts it, `bracket_participants.name` is operator-editable, and a hand-added team from `BracketPlayerFields.tsx` mints its label from a different pair of variables. The correctness is an accident of two independently-written functions agreeing, which is the argument for deleting the reader rather than pinning the accident.

6. **`p.name === p.id` appears ONCE in `apps/`, not twice.** The audit cites `bracketMigration.ts:102,108`; `:108` is the negated form (`p.name !== p.id`). The card's gate matches one line. Both lines die together.

7. **NC 1 ("two Li Wei are two rows") is already TRUE for the resolvable population and already false for the hand-added one — P6 changes neither.** Two seam-committed entries named "Li Wei" mint two `entry_players` (the 2026-08-23 rule needs a birth-year match to adopt), so `_player_id` yields two distinct `entry-{uuid}` participant ids, each carrying its own `entry_player_id` (P4). Two hand-adds named "Li Wei" both slug to `p-li-wei` and the second is **silently discarded** by `BracketRosterTab.tsx:138-142`. NC 1 is therefore a **characterization pin on both halves** — the delivered half and the ruled-residual half — not new behavior. Task 1 pins both, following P5's precedent of pinning the gap it is not closing.

8. **NC 2 ("a rename changes no id") is structurally true and needs only a pin.** The only rename path is `tournamentStore.updateBracketPlayer(id, updates)` (`:222-227`), a keyed `map` that never touches `p.id`, reached from `BracketRosterTab.tsx:349` and `BracketMatchDetailPanel.tsx:103`. A rename does **not** propagate to `bracket_participants.name` — the participant keeps the old label until the draw is regenerated. That divergence is real, pre-existing, and **not** P6's (fixing it would need the participant row to render from the roster, which is a read-path change R-DM-7(a) neither asks for nor forbids). Pin the id-stability, record the divergence.

9. **Two docstrings assert something P4 and the seam already made false.** `apps/api/src/core/schemas.py:287-288` says `BracketPlayerDTO.id` "is the stable slug produced by the frontend `playerSlug()` helper" — false for every seam-built row, whose id is `entry-{uuid}` from `entries.py::roster_id` (`:210-223`). `apps/console/src/lib/README.md:30` says the slug is "the stable player slug **both tiers** derive" — the backend derives no slug and never has. The first one is copied verbatim into `dto.generated.ts:3341`, so fixing it carries a regen.

10. **The console already round-trips `entryPlayerId` from the blob into the column.** `BracketDrawsTab.tsx:250`, `DrawDetailPanel.tsx:93`, `ParticipantPicker.tsx:161,219`, `BracketPlayerFields.tsx:205-206` and `rosterEvents.ts:154-161` all copy `entryPlayerId` from the roster row onto the participant they build. That is the mechanism behind `debt-log.md:98`'s edge: **the blob is upstream of the column on the operator path**, so a column value with no blob value behind it is erased on the first participant re-save. It is also why the agreement assertion (Task 4) is worth writing and a backfill is not.

---

## Pickup (a) — the P2 blob-version question, answered explicitly

`db/blob_version.py` registers five entries with **P6** named as owner: `bracket_matches.side_a` (`:134`), `.side_b` (`:135`), `.dependencies` (`:136`), `.slot_a` (`:151`), `.slot_b` (`:152`).

**P6 reshapes none of them, and cannot.** R-DM-7(a) forbids the slot-blob rewrite in exactly those words (`DM1_RULINGS.md:66`); R-DM-7(b), which would have rewritten them, was ruled against as "the riskiest [migration] in the plan [buying] nothing R-DM-2 doesn't already deliver". P6 touches no backend blob writer at all except the seam's insert dict, and that dict's `member_ids`/`side_*` shapes are unchanged.

So:
- **No `BLOB_VERSIONS` entry is flipped.** `tests/backend/unit/test_blob_version_inventory.py::test_the_tournament_document_is_the_one_wired_column_today` stays green, untouched.
- **No `tournaments.data` version bump.** P6 adds no field to `BracketPlayerDTO` or `PlayerDTO`.
- **Five comment corrections are owed** (Task 6 Step 1) — the same move P4 Task 8 and P5 Task 7 Step 1 each made for their own stale owner line. "P6" as owner is wrong the moment P6 ships without reshaping them, and it will be read as an oversight rather than a ruling unless the line says which ruling forbade it. Re-word to name R-DM-7(a) and leave the owner **unassigned**, because no phase in the current sequence claims them.
- **Two P2 traps recorded for anyone who does wire a column later** (not needed by this slice, kept here so they stay findable): `Tournament.id` is SQLAlchemy `Uuid` storing **32-char undashed hex** on SQLite, so a `str(row.id)` bind in `text()` matches zero rows — bind `row.id.hex`; and `tests/backend/_helpers.py::purge_backend_modules` needs `db.blob_version` in `_PURGE_EXEMPT` or `BlobVersionError` class identity breaks `pytest.raises`.

## Pickup (b) — the adjacent debt rows, ruled

Each of these is decided here so it is not discovered mid-slice.

- **`debt-log.md:98` — the blob-vs-column double-store: IN, assertion only, no backfill.** Task 4. Reasoning in judgment call 4. The row's attached edge is honoured by not creating the state it describes; Task 6 Step 3 rewrites the row to say the assertion landed and that a future backfill still owes the same-pass blob keying.
- **`debt-log.md:78` — leg 7 recognises "already in this draw" by participant id only: IN, cuttable.** Task 5. Reasoning in judgment call 5.
- **`debt-log.md:100` — the doubles picker has no remove/unpair affordance: OUT.** P5 residue, an operator-surface affordance, nothing to do with demoting a name to a key. Nothing in P6 makes it worse.
- **`debt-log.md:101` — `commitPicks` emits `members: undefined`: OUT.** XS serializer hygiene in a file P6 does not open.
- **`debt-log.md:102` — `PickedPair.members` widened to `string[] | undefined`: OUT.** Type strength only, explicitly filed as "a follow-up, not a redo".
- **`debt-log.md:75` — `ParticipantIn` has no `meta`: OUT.** A wire-contract decision, untouched by P6; P6 does not widen its blast radius (it adds no `meta` key).
- **`debt-log.md:103` — `bracketDto.ts::Participant` declares `entryPlayerId` but not `sourceEntryId`: OUT.** One line, but it is a P0 parity-oracle question (a hand shape that should probably be a generated alias), not a demotion question.

---

## File map (everything this slice may touch)

Console:
- `apps/console/src/modules/bracket/bracketMigration.ts` — delete `nameFromSlug` (`:4-22`), the split-and-zip pre-pass (`:41-53`), and `healBracketRosterNames` (`:77-115`); trim `reconcileBracketRoster`.
- `apps/console/src/modules/bracket/BracketTab.tsx` — the heal call and its comment (`:144-151`), the import (`:24`).
- `apps/console/src/modules/bracket/DrawView.tsx` — one comment above `:988-989`. No behavior change.
- `apps/console/src/lib/README.md` — the `playerSlug.ts` row (`:30`).
- `apps/console/src/api/dto.generated.ts` — regenerated (never hand-edited) after the `schemas.py` docstring fix.

Backend:
- `apps/api/src/core/schemas.py` — `BracketPlayerDTO`'s docstring (`:284-294`). Docstring only; the field list is untouched.
- `apps/api/src/db/blob_version.py` — five owner comments (`:134-136`, `:151-152`).
- `apps/api/src/entries/entries.py` — `_plan_bracket` (`:686-833`), Task 5 only.

Tests:
- `apps/console/src/modules/bracket/__tests__/bracketMigration.test.ts` — four cases deleted, two kept, one added.
- `apps/console/src/modules/bracket/__tests__/BracketTab.test.tsx` — the heal `describe` (`:214-258`) deleted.
- `apps/console/src/modules/bracket/__tests__/BracketRosterTab.test.tsx` — NC 1's hand-add residual pin, NC 2's rename pin.
- `tests/backend/unit/test_entries_commit_seam.py` — NC 1's resolvable half, the blob/column agreement assertion, Task 5's controls.
- `tests/backend/test_dto_generated_freshness.py` — reddens on the docstring change until regen.

Docs:
- `docs/reference/debt-log.md` — two rows rewritten, one row's owner re-stated.
- `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md` — the P6 deletion-gate line (`:170`) corrected the way P5 corrected its own (`:160`).
- `docs/history/programs/DM3_PROGRESS.md` — ledger.

---

### Task 1: Characterize before deleting (no production code) — **M**

Six pins. Every one either records behavior a later task deliberately changes, or records a gap P6 is **not** closing so the ledger can name it honestly. **Nothing in this task edits `apps/` outside `__tests__`.** P5's experience is the argument: its pins caught two defects that would otherwise have shipped.

**Files:** `apps/console/src/modules/bracket/__tests__/bracketMigration.test.ts` · `apps/console/src/modules/bracket/__tests__/BracketRosterTab.test.tsx` · `tests/backend/unit/test_entries_commit_seam.py`.

**Interfaces:** consumes only what exists — `reconcileBracketRoster`, `healBracketRosterNames`, `tournamentStore.updateBracketPlayer`, and the seam helpers `_bracket_workspace`, `_draft_event`, `_entry_event`, `_entry`, `_players` (`test_entries_commit_seam.py:88-258`). Produces no new symbol.

- [ ] **Step 1: Pin the decode's accidental correctness (the thing Task 2 deletes).** Append to the `reconcileBracketRoster` describe in `bracketMigration.test.ts`:

```typescript
  /**
   * SP-DM-3 P6 Task 1 — a PIN ON BEHAVIOUR TASK 2 DELETES, kept only long
   * enough to prove the deletion is deliberate. The zip is positional: it
   * assumes the label's Nth name belongs to `members[N]`. That holds for a
   * seam-built team by pure construction (`entries/entries.py::team_name`
   * takes `members[0], members[1]` in the same order `member_ids` is built),
   * and holds for nothing else — `bracket_participants.name` is operator
   * editable and a hand-added team mints its label from different variables.
   * Delete this case with the decode; do not port it forward.
   */
  it('zips the label onto members POSITIONALLY, right or wrong', () => {
    const bracket = {
      participants: [
        {
          id: 'MD-T1',
          // The label's order is the OPPOSITE of the member order.
          name: 'Ben Carter / Alexei Sorokin',
          members: ['p-alexei-sorokin', 'p-ben-carter'],
        },
      ],
    } as unknown as BracketTournamentDTO;
    const byId = new Map(
      reconcileBracketRoster(bracket).map((p) => [p.id, p.name]),
    );
    // Both names are now on the wrong person, and nothing notices.
    expect(byId.get('p-alexei-sorokin')).toBe('Ben Carter');
    expect(byId.get('p-ben-carter')).toBe('Alexei Sorokin');
  });
```

- [ ] **Step 2: Pin what a doubles-only legacy draw does AFTER the decode is gone** — the behaviour judgment call 2 chooses, written now as a `.skip` so Task 2 flips one word instead of writing a new test:

```typescript
  /**
   * SP-DM-3 P6 Task 2 unskips this. A TEAM member no PLAYER participant can
   * name is OMITTED, not guessed — F-DM-19's don't-invent posture. The old
   * behaviour named it by de-slugging (`nameFromSlug`) or by splitting the
   * team label; both are identity read out of a display string, which is
   * what R-DM-7(a) demotes.
   */
  it.skip('omits a TEAM member no participant can name', () => {
    const bracket = {
      participants: [
        {
          id: 'MD-T1',
          name: 'Alexei Sorokin / Ben Carter',
          members: ['p-alexei-sorokin', 'p-ben-carter'],
        },
      ],
    } as unknown as BracketTournamentDTO;
    expect(reconcileBracketRoster(bracket)).toEqual([]);
  });
```

- [ ] **Step 3: Pin NC 1's ruled residual — the hand-add collision R-DM-7(a) accepts.** In `BracketRosterTab.test.tsx`, using that file's existing render helper and store setup:

```typescript
  /**
   * NC 1, the RESIDUAL half. R-DM-7(a) (`DM1_RULINGS.md:66-70`) keeps
   * hand-added participants slug-keyed and accepts in writing that "two
   * hand-added same-named participants still collide". `playerSlug('Li Wei')`
   * is `p-li-wei` for both, and `commitAdd` silently discards the second.
   * P6 does NOT close this — it is pinned so the ledger can say the residual
   * is a ruling, not an oversight. The delivered half of NC 1 is pinned in
   * `test_entries_commit_seam.py` (Task 1 Step 4).
   */
  it('silently discards a second hand-added player with the same name (ruled residual)', async () => {
    // …seed the store with one { id: 'p-li-wei', name: 'Li Wei' } roster row,
    // render, open the add affordance, type "Li Wei", commit…
    expect(useTournamentStore.getState().bracketPlayers).toHaveLength(1);
  });
```

  (Adapt the add interaction to whatever `BracketRosterTab.test.tsx` already does for `commitAdd` — its existing add case is the source of truth for the affordance, not this snippet.)

- [ ] **Step 4: Pin NC 1's delivered half.** In `tests/backend/unit/test_entries_commit_seam.py`, beside `test_a_committed_entry_puts_the_person_key_on_its_participant` (`:1122`):

```python
def test_two_people_with_the_SAME_NAME_are_two_participants_with_two_keys(
    repo, session
):
    """NC 1 (SP-DM-3 P6, card §C6), delivered half.

    Two humans named "Li Wei" enter one draw. Under the 2026-08-23 minting
    rule they are two ``entry_players`` (adoption needs a birth-year match,
    and ``_entry`` mints a fresh person per call), so the seam emits two
    participants with two distinct ``entry_player_id`` values - the P4 FK
    doing the work R-DM-7(a) says it does instead of a re-key. A slug of
    the display name would have collapsed them into one row.
    """
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    first = _entry(session, tid, ev, player_name="Li Wei")
    second = _entry(session, tid, ev, player_name="Li Wei")

    commit_entries(repo, tid)

    session.expire_all()
    participants = repo.brackets.list_participants(tid, "MS")
    assert len(participants) == 2
    assert [p.name for p in participants] == ["Li Wei", "Li Wei"]
    keys = {p.entry_player_id for p in participants}
    assert keys == {first.entry_player_id, second.entry_player_id}
    assert len(keys) == 2
    # And the ids are distinct without being a slug of anything.
    assert participants[0].id != participants[1].id
```

- [ ] **Step 5: Pin NC 2 — a rename changes no id.** In `BracketRosterTab.test.tsx` (or `BracketMatchDetailPanel.test.tsx` if that file already exercises `updateBracketPlayer`; pick whichever already has the harness and say which in the commit message):

```typescript
  /**
   * NC 2 (SP-DM-3 P6, card §C6): renaming a participant changes no id and
   * orphans no match or result. Structurally true — `updateBracketPlayer`
   * is a keyed map that never writes `id` (`tournamentStore.ts:222-227`) —
   * and pinned because P6's whole claim is that the name is not the key.
   *
   * Recorded divergence, NOT fixed here: the rename does not propagate to
   * `bracket_participants.name`, so a renamed roster player keeps the old
   * label in the draw until it is regenerated. Pre-existing; making the
   * participant render from the roster is a read-path change R-DM-7(a)
   * neither asks for nor forbids.
   */
  it('a rename keeps the id and every reference to it', () => {
    useTournamentStore.setState({
      bracketPlayers: [{ id: 'p-li-wei', name: 'Li Wei' }],
    });
    useTournamentStore.getState().updateBracketPlayer('p-li-wei', {
      name: 'Li Wei (Sr.)',
    });
    const [row] = useTournamentStore.getState().bracketPlayers;
    expect(row.id).toBe('p-li-wei');
    expect(row.name).toBe('Li Wei (Sr.)');
  });
```

- [ ] **Step 6: Pin the heal's contract before deleting it** — the three properties Task 3 must prove are no longer needed. Append to the `healBracketRosterNames` describe:

```typescript
  /**
   * SP-DM-3 P6 Task 3 deletes this whole describe. Pinned first so the
   * deletion commit can name what it is giving up: the repair (a) only ever
   * fires on a row whose stored name IS its own id, (b) never overwrites an
   * operator's typing, and (c) returns the same array reference otherwise.
   * (a) is the reason deletion is safe — see Task 3 Step 1, which proves no
   * live write path can produce that row any more.
   */
  it('never fires on a row whose name is not its own id', () => {
    const stored = roster({ id: 'cormac-delahunt', name: 'Cormac Delahunt' });
    expect(healBracketRosterNames(stored, doublesDraw)).toBe(stored);
  });
```

- [ ] **Step 7: Run the pins**

Run: `npm --prefix apps/console run test:run -- src/modules/bracket/__tests__/bracketMigration.test.ts src/modules/bracket/__tests__/BracketRosterTab.test.tsx`
Run: `.venv\Scripts\python.exe -m pytest tests/backend/unit/test_entries_commit_seam.py -q -k "SAME_NAME"`
Expected: all PASS except the one `it.skip`, which is reported skipped. **If Step 4's test fails, STOP** — NC 1's delivered half is not delivered and P4/P5 did not land what the ledger says they did.

- [ ] **Step 8: Commit**

```bash
git commit -m "test(bracket): pin the name-as-identity behavior P6 deletes (NC 1, NC 2)" -- "apps/console/src/modules/bracket/__tests__/bracketMigration.test.ts" "apps/console/src/modules/bracket/__tests__/BracketRosterTab.test.tsx" tests/backend/unit/test_entries_commit_seam.py
```

**Record this commit's SHA in the ledger** — Tasks 2 and 3 cite it as the pin they flip.

---

### Task 2: Delete the decode-from-label (F-DM-14 read half, F-DM-04) — **M**

**Files:** `apps/console/src/modules/bracket/bracketMigration.ts` (`:1-75`) · `apps/console/src/modules/bracket/__tests__/bracketMigration.test.ts`.

**Interfaces:** `reconcileBracketRoster(bracket: BracketTournamentDTO): BracketPlayerDTO[]` keeps its exact signature and its one caller (`BracketTab.tsx:137`). `nameFromSlug` — module-private, one call site — ceases to exist.

**What must be true before this deletion is safe** (verified during planning at `ca15d7d7`, re-verify if the tree moved):
- The function's **only** caller is the first-load migration gated on `bracketPlayers.length === 0` (`BracketTab.tsx:136`), and `healBracketRosterNames` (deleted in Task 3).
- The commit seam writes a real-named roster row for every person, both halves of a TEAM included (`entries.py:731-738`), so **no bracket the Entries flow has touched can reach this code**.
- The remaining population is pre-roster-blob legacy brackets, whose doubles-only draws lose auto-derived member names — the accepted cost of judgment call 2.

- [ ] **Step 1: Delete `nameFromSlug` and the split-and-zip pre-pass.** In `bracketMigration.ts`, remove the whole `nameFromSlug` block (`:4-22`, docstring included) and the second `for` loop (`:41-53`, comment included). Rewrite the surviving function as:

```typescript
import type { BracketPlayerDTO } from '../../api/dto';
import type { BracketTournamentDTO } from '../../api/bracketDto';

/**
 * First-load reconcile for a LEGACY bracket: participants exist, but no
 * `bracketPlayers` roster does. Extract one roster row per person, keyed by
 * the id already baked into `bracket_participants` / `member_ids`.
 *
 * SP-DM-3 P6 (R-DM-7(a), card §C6) deleted the two name-decoding paths this
 * used to have — de-slugging an id back into a display name, and splitting a
 * TEAM's label on " / " to zip names onto `member_ids` positionally. Both
 * recovered a PERSON from a STRING a human can retype, which is the whole of
 * F-DM-04/F-DM-14. A member no PLAYER participant can name is now OMITTED
 * rather than guessed at — the ruled don't-invent posture for a person-shape
 * with no identity behind it (F-DM-19).
 *
 * That costs one thing, deliberately: a pre-roster-blob doubles-ONLY draw has
 * no PLAYER participants at all, so its roster comes back empty instead of
 * name-decoded. Every bracket the Entries commit seam has touched carries a
 * server-written roster with real names and never reaches this function.
 */
export function reconcileBracketRoster(
  bracket: BracketTournamentDTO,
): BracketPlayerDTO[] {
  // A PLAYER participant is the only thing that can name a person here: its
  // id IS the roster id and its name IS the display name.
  const playerNames = new Map<string, string>();
  for (const part of bracket.participants) {
    if (!part.members || part.members.length === 0) {
      playerNames.set(part.id, part.name);
    }
  }

  const byId = new Map<string, BracketPlayerDTO>();
  for (const part of bracket.participants) {
    if (part.members && part.members.length > 0) {
      for (const memberId of part.members) {
        const name = playerNames.get(memberId);
        if (name === undefined) continue; // unnameable: omit, never guess
        if (!byId.has(memberId)) byId.set(memberId, { id: memberId, name });
      }
    } else if (!byId.has(part.id)) {
      byId.set(part.id, { id: part.id, name: part.name });
    }
  }
  return Array.from(byId.values());
}
```

- [ ] **Step 2: Retire the pinned cases.** In `bracketMigration.test.ts`:
  - **Delete** `'reads TEAM member names off the team display name (doubles-only draw)'` (`:43-58`) and its D3 comment, `'de-slugs members the team name cannot account for'` (`:60-75`), and Task 1 Step 1's `'zips the label onto members POSITIONALLY, right or wrong'`. All three pin the decode; card §C6 rules it deleted, not fixed.
  - **Unskip** Task 1 Step 2's `'omits a TEAM member no participant can name'` (`it.skip` → `it`).
  - **Keep** `'extracts unique players from PLAYER participants'`, `'flattens TEAM members and dedupes by id'` and `'returns empty when bracket has no participants'` unchanged — they exercise the surviving key-based path.
  - Add one line above the describe naming the ruling:

```typescript
/**
 * SP-DM-3 P6 (card §C6, R-DM-7(a)): the decode-from-label cases that used to
 * live here were DELETED, not ported — the behaviour they pinned is what the
 * ruling removed. Their pins are in the Task 1 commit if the history matters.
 */
```

- [ ] **Step 3: Run the console suite for the module**

Run: `npm --prefix apps/console run test:run -- src/modules/bracket/__tests__/bracketMigration.test.ts src/modules/bracket/__tests__/BracketTab.test.tsx`
Expected: `bracketMigration.test.ts` PASSES. **`BracketTab.test.tsx`'s heal describe (`:214-258`) is expected to FAIL** — its doubles-only fixture relies on the decode to produce better names. That failure is Task 3's; do not fix it here and do not delete it here.

- [ ] **Step 4: Deletion gate for this half**

Run: `rg -n "nameFromSlug" apps/`
Expected: **no matches** (rg exits 1).
Run: `rg -n "\.split\(' / '\)|\.split\(\" / \"\)" apps/console/src apps/entrant/app packages`
Expected: exactly **one** hit — `DrawView.tsx:989`, kept by judgment call 3.

- [ ] **Step 5: Add the comment that makes the survivor deliberate.** In `DrawView.tsx`, above `:988`:

```typescript
  // SP-DM-3 P6 kept this split deliberately (plan judgment call 3): the
  // string being split is one `labelFor` produced from ids two lines above
  // (`side.map(id => nameById[id]).join(" / ")`), so this is line-breaking a
  // label we just minted, not decoding identity out of one. Nothing is
  // persisted and no member id is recovered. The decode that DID recover
  // identity — `bracketMigration.ts`'s split-and-zip — is gone.
```

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(bracket)!: delete the decode-from-label, a person is not their label (F-DM-14, R-DM-7a)" -- apps/console/src/modules/bracket/bracketMigration.ts "apps/console/src/modules/bracket/__tests__/bracketMigration.test.ts" apps/console/src/modules/bracket/DrawView.tsx
```

---

### Task 3: Delete the `p.name === p.id` repair (F-DM-15) — **M**

**Files:** `apps/console/src/modules/bracket/bracketMigration.ts` (`:77-115`) · `apps/console/src/modules/bracket/BracketTab.tsx` (`:24`, `:121-152`) · `apps/console/src/modules/bracket/__tests__/bracketMigration.test.ts` · `apps/console/src/modules/bracket/__tests__/BracketTab.test.tsx`.

**Interfaces:** `healBracketRosterNames` ceases to exist. `BracketTab`'s migration effect keeps its dependency array minus `bracketPlayers` — **read Step 3 before touching the deps**, the removal changes when the effect re-runs.

**What the repair actually protects against — and what must be TRUE for its removal to be safe.** The comment is `bracketMigration.ts:77-97`; the defect narrative it inherits is `bracketMigration.ts:8-14`, which reads verbatim:

> *"It exists because the alternative shipped the raw slug into the roster's Player column and the draw picker (defect D3): every name on the Bracket roster of a doubles-only draw read `alexei-sorokin`, because a TEAM participant's members are slugs and there was no PLAYER participant to look the name up from."*

(That **D3 is the bracket defect series**, not debt-log D3 — `…-domain-model-audit.md:568`. Cite it as `bracketMigration.ts:8-14`.)

The repair is not a guard on the *live* path. `reconcileBracketRoster` output is **persisted** into `tournaments.data["bracketPlayers"]` and gated by a one-shot `bracketRosterMigrated` flag, so the D3 fix could never reach a workspace an older build had already migrated — the repair exists to heal **frozen data written by a pre-fix build** (defect V3, `BracketTab.test.tsx:210-219`). Three things must be true for removal to be safe:

1. **No live write path can produce `name === id` any more.** The four writers: the commit seam (`entries.py:597-603` — id `entry-{uuid}`, name `entry.player_name`; equal only if a human is literally named `entry-<uuid>`); the hand-add (`BracketRosterTab.tsx:137,143` — id is `playerSlug(name)`, always `p`-prefixed and lower-cased, so it can never equal the name a human typed); the trimmed `reconcileBracketRoster` (Task 2 — copies a participant's `name`, never derives one from an id); an operator rename (`updateBracketPlayer` — writes what was typed). **Step 1 pins this as an executable property**, which is what makes the deletion evidence rather than assertion.
2. **A workspace opened even once on a healing build stayed healed.** The heal's output goes through `setBracketPlayers` → the whole-blob autosave, so the repair is idempotent-and-permanent, not per-session.
3. **The residual is unverifiable from the repo and must be ratified, not hidden.** A workspace that has *never* been opened since the heal shipped, and whose legacy doubles-only roster still carries `name === id` rows, will show slug names after this deletion. That is data on directors' laptops; nothing in the tree can measure it. **Note the failure mode is not the same defect:** D3 rendered a slug *as if it were a name*; post-P6 the trimmed reconcile omits unnameable members instead, so a fresh migration shows *fewer rows*, never *wrong names*. Only an already-frozen pre-fix blob can still show a slug, and only until an operator retypes it — which is now the only path that writes a person's name, by design.

- [ ] **Step 1: Write NC 3 as an executable property, BEFORE deleting.** New describe in `bracketMigration.test.ts`:

```typescript
/**
 * NC 3 (SP-DM-3 P6, card §C6): removing the repair must not resurrect the
 * defect its comment described (`bracketMigration.ts:8-14` — the BRACKET
 * DEFECT SERIES D3, not debt-log D3; two registers, same number). The repair
 * healed roster rows a pre-fix build had FROZEN as `name === id`. Deleting it
 * is safe only if nothing can write such a row any more, so that is what this
 * asserts — on the one writer P6 owns. The other three are structural: the
 * seam writes `entry-{uuid}` + a person's name, `playerSlug` always prefixes
 * `p-` so a slug never equals the name it came from, and a rename writes what
 * the operator typed.
 */
describe('NC 3 — no surviving path writes a name that is its own id', () => {
  it('reconcile never emits a row whose name equals its id', () => {
    const bracket = {
      participants: [
        { id: 'p-alex-tan', name: 'Alex Tan' },
        { id: 'MD-T1', name: 'Alex Tan / Ben Carter', members: ['p-alex-tan', 'p-ben-carter'] },
        // The shape that USED to produce a self-named row: an unnameable
        // member. It is now omitted rather than named after itself.
        { id: 'MD-T2', name: 'Two Others', members: ['p-nobody', 'p-else'] },
      ],
    } as unknown as BracketTournamentDTO;
    const rows = reconcileBracketRoster(bracket);
    expect(rows.some((p) => p.name === p.id)).toBe(false);
    expect(rows.map((p) => p.id)).toEqual(['p-alex-tan']);
  });

  it('the hand-add mint can never produce one either', () => {
    for (const name of ['Alex Tan', "O'Brien", 'p-alex-tan', 'Li Wei']) {
      expect(playerSlug(name)).not.toBe(name);
    }
  });
});
```

  (Import `playerSlug` from `../../../lib/playerSlug` at the top of the test file. `'p-alex-tan'` is in the list on purpose: it is the only input a reader would guess round-trips, and it does not — `playerSlug('p-alex-tan')` is `'p-p-alex-tan'`.)

- [ ] **Step 2: Run it against the CURRENT code**

Run: `npm --prefix apps/console run test:run -- src/modules/bracket/__tests__/bracketMigration.test.ts -t "NC 3"`
Expected: **PASS** before the deletion. That is the point — the property must already hold, otherwise deleting the repair really would resurrect the defect and this task must STOP and report.

- [ ] **Step 3: Delete the repair and its call.**
  - `bracketMigration.ts`: remove `healBracketRosterNames` and its docstring entirely (`:77-115`). The file is then two imports and one function.
  - `BracketTab.tsx:24`: `import { healBracketRosterNames, reconcileBracketRoster } from './bracketMigration';` → `import { reconcileBracketRoster } from './bracketMigration';`
  - `BracketTab.tsx:133-152`: drop the heal branch and its comment (`:144-151`), leaving:

```tsx
  useEffect(() => {
    if (!data) return;
    if (data.participants.length === 0) return;
    if (bracketRosterMigrated || bracketPlayers.length > 0) return;
    const derived = reconcileBracketRoster(data);
    if (derived.length > 0) setBracketPlayers(derived);
    setBracketRosterMigrated(true);
  }, [data, bracketPlayers, bracketRosterMigrated, setBracketPlayers, setBracketRosterMigrated]);
```

    **Keep `bracketPlayers` in the dependency array.** It is still read in the guard, so removing it is an exhaustive-deps lint error and a stale-closure bug. The effect now no-ops after the first run instead of re-scanning on every 2.5s poll — that is the deletion's other payoff.
  - Rewrite the comment above `:121` to say what is now true:

```tsx
  // First-load migration: a LEGACY bracket (participants, no `bracketPlayers`)
  // gets its roster extracted once, gated by `bracketRosterMigrated` so a
  // 2.5s poll cannot re-derive a roster the operator has since edited.
  // SP-DM-3 P6 deleted the name-repair pass that used to run beside it on
  // every poll: it decided a stored row was corrupt by testing
  // `p.name === p.id` and PERSISTED its guess (F-DM-15), which is identity
  // repair keyed on a name equalling a slug. Nothing writes such a row any
  // more — pinned by `bracketMigration.test.ts`'s "NC 3" describe.
```

- [ ] **Step 4: Retire the heal's tests, by ruling.**
  - `bracketMigration.test.ts`: delete the entire `healBracketRosterNames` describe (`:83-137`, V3 preamble included) plus Task 1 Step 6's added case.
  - `BracketTab.test.tsx`: delete the entire `'BracketTab — an already-migrated roster still gets its names fixed'` describe (`:210-258`, V3 preamble included) and its `doublesOnlyBracket` helper. Nothing else in that file uses it — confirm with `rg -n "doublesOnlyBracket" apps/console/src` before deleting.
  - Leave one tombstone comment where the `bracketMigration.test.ts` describe was:

```typescript
/**
 * `healBracketRosterNames` was DELETED by SP-DM-3 P6 (card §C6, R-DM-7(a)):
 * "the `p.name === p.id` repair is deleted, not fixed". Its cases went with
 * it — they pinned the behaviour the ruling removed. What replaces them is
 * the "NC 3" describe below, which asserts no surviving path can write the
 * row the repair existed to heal.
 */
```

- [ ] **Step 5: Run the console gates**

Run: `npm --prefix apps/console run test:run -- src/modules/bracket`
Expected: ALL pass, including `BracketTab.test.tsx` (its remaining describes never touched the heal).
Run: `npm --prefix apps/console run build`
Expected: PASS — `tsc -b` catches a missed import or an unused symbol.
Run: `npm run depcruise`
Expected: **16 warnings / 0 errors**, unchanged. P6 removes an import and adds none.

- [ ] **Step 6: The card's deletion gate**

Run: `rg -n "p\.name === p\.id" apps/`
Expected: **no matches** (rg exits 1). Scoped to `apps/` per judgment call 7 — the card, the design doc, the audit and this plan all quote the pattern deliberately.

- [ ] **Step 7: Commit**

```bash
git commit -m "refactor(bracket)!: delete the p.name===p.id repair, it persisted a guess (F-DM-15, R-DM-7a)" -- apps/console/src/modules/bracket/bracketMigration.ts apps/console/src/modules/bracket/BracketTab.tsx "apps/console/src/modules/bracket/__tests__/bracketMigration.test.ts" "apps/console/src/modules/bracket/__tests__/BracketTab.test.tsx"
```

---

### Task 4: The two person-key copies must agree (`debt-log.md:98`) — **S**

**Files:** `tests/backend/unit/test_entries_commit_seam.py` only. **No production code.**

**Interfaces:** consumes `repo.brackets.list_participants`, `repo.tournaments.get_by_id(tid).data["bracketPlayers"]`, and the `_pair`/`_doubles_draw` helpers (`:208`, `:660`). Produces no symbol.

This is the deliverable judgment call 4 chose in place of a backfill: P4 deliberately double-stores the person key (`bracket_participants.entry_player_id` **and** `BracketPlayerDTO.entryPlayerId` inside `tournaments.data`) with nothing asserting the copies agree. The console is the reason it matters — `BracketDrawsTab.tsx:250`, `DrawDetailPanel.tsx:93`, `ParticipantPicker.tsx:161,219`, `rosterEvents.ts:154-161` all build a participant's key **from the blob row**, so the blob is upstream of the column on every operator re-save.

- [ ] **Step 1: Write the assertion**

```python
def test_the_person_key_agrees_between_the_column_and_the_roster_blob(
    repo, session
):
    """SP-DM-3 P6 (`debt-log.md:98`): P4 double-stores the person key on
    purpose - once as ``bracket_participants.entry_player_id`` (a real
    column) and once as ``entryPlayerId`` on the roster row inside
    ``tournaments.data``. Nothing asserted the two copies agreed.

    They cannot diverge at birth, because the seam writes both in one plan -
    which is exactly why this is cheap to pin and expensive to discover
    later: the console builds a participant's key FROM the blob row on every
    re-save (``BracketDrawsTab.tsx:250`` and four siblings), so the blob is
    upstream of the column on the operator path. A future backfill that sets
    the column without keying the blob in the same pass would be undone by
    the first roster edit. P6 writes no backfill, so that edge stays
    counterfactual.
    """
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    _entry(session, tid, ev, player_name="Alex Tan")

    commit_entries(repo, tid)

    session.expire_all()
    roster_key = {
        row["id"]: row.get("entryPlayerId")
        for row in repo.tournaments.get_by_id(tid).data["bracketPlayers"]
    }
    participants = repo.brackets.list_participants(tid, "MS")
    assert participants, "expected a committed participant"
    for p in participants:
        assert p.id in roster_key, f"participant {p.id} has no roster row"
        assert str(p.entry_player_id) == roster_key[p.id]


def test_a_seam_TEAM_carries_the_key_of_the_roster_row_it_names_first(
    repo, session
):
    """The pair shape of the same agreement. A TEAM has no roster row of its
    own - its two members do - and P4/P5 ruled that the row carries
    ``members[0]``'s key. So the agreement to assert is between the TEAM's
    column and the roster row named by ``member_ids[0]``. Both member keys
    remain recoverable from ``member_ids``, which are ``entry-{uuid}``
    strings by construction.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid, code="XD")
    _pair(session, tid, ev)

    commit_entries(repo, tid)

    session.expire_all()
    roster_key = {
        row["id"]: row.get("entryPlayerId")
        for row in repo.tournaments.get_by_id(tid).data["bracketPlayers"]
    }
    team = repo.brackets.list_participants(tid, "XD")[0]
    assert team.type == "TEAM"
    assert str(team.entry_player_id) == roster_key[team.member_ids[0]]
```

  (`_pair`'s exact signature is at `:208`; mirror whatever `test_a_confirmed_pair_commits_as_ONE_team_with_real_member_ids` (`:668`) does to build a committed pair, rather than this snippet, if they differ.)

- [ ] **Step 2: Run**

Run: `.venv\Scripts\python.exe -m pytest tests/backend/unit/test_entries_commit_seam.py -q -k "agrees_between or roster_row_it_names_first"`
Expected: both PASS immediately. They are a **pin**, not a fix — the row was ruled "no agreement assertion" at P4's merge precisely because the seam cannot produce a disagreement today. If either fails, STOP and report: the double-store has already drifted and that is a defect, not a planning item.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(entries): the person key must agree between column and roster blob (debt-log.md:98)" -- tests/backend/unit/test_entries_commit_seam.py
```

---

### Task 5: "Already in this draw" starts meaning the PERSON (`debt-log.md:78`) — **M, cuttable**

**Files:** `apps/api/src/entries/entries.py` (`_plan_bracket`, `:686-833`) · `tests/backend/unit/test_entries_commit_seam.py`.

**Interfaces:** no signature changes. `_plan_bracket` gains one local `existing_keys: dict[str, set[uuid.UUID]]` alongside `existing_ids` (`:697`).

**This task is cuttable whole** — nothing else in the slice depends on it. Cut it and Task 6 Step 3 re-homes the debt row instead of striking it.

**THE TRAP, read this before writing code.** The obvious implementation — add the person-key check to the pair's leg 7 — **breaks re-run idempotency**, and the seam is re-runnable by design (module docstring, spec Q3). A seam-built TEAM carries `members[0].entry_player_id` in its column. On a second run, `existing_keys` therefore contains `members[0]`'s key; a naive leg-7 key check makes the pair refuse **itself**, `partner` falls back to `None`, and `members[1]` is inserted as a stray singleton PLAYER beside the team that already holds them. The shape that avoids it is below: the pair's own candidate team id short-circuits the check.

- [ ] **Step 1: Write the failing test + the idempotency control**

```python
def test_a_person_already_in_the_draw_under_ANOTHER_id_is_not_entered_twice(
    repo, session
):
    """`debt-log.md:78`, closed by SP-DM-3 P6: the seam recognised "already
    in this draw" by participant ID alone, so a participant row under an
    arbitrary id - a hand-added roster row, a legacy import, a console
    re-save - naming the same human was invisible to it and the person
    entered twice. P4 gave every such row a real key
    (``bracket_participants.entry_player_id``, carried from the roster blob
    by the console: ``BracketDrawsTab.tsx:250``), so the recognition can now
    ask about the PERSON. R-DM-7(a) said the FK is the identity; this is the
    seam acting on it.

    I4: the seam DECLINES to add a second row. It removes nothing, merges
    nothing, and raises nothing - the entry still commits and still
    back-references its own roster seat.
    """
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    entry = _entry(session, tid, ev, player_name="Alex Tan")

    # The same human, already a participant under a hand-typed id.
    repo.brackets.add_participants(
        tid,
        "MS",
        [
            {
                "id": "p-alex-tan",
                "name": "Alex Tan",
                "type": "PLAYER",
                "member_ids": [],
                "entry_player_id": entry.entry_player_id,
                "seed": None,
                "meta": {},
            }
        ],
    )

    commit_entries(repo, tid)

    session.expire_all()
    participants = repo.brackets.list_participants(tid, "MS")
    assert [p.id for p in participants] == ["p-alex-tan"], (
        "the seam must not enter the same human a second time"
    )
    # The entry still commits; only the duplicate ROW is refused.
    assert entry.committed_player_id is not None


def test_two_DIFFERENT_people_with_one_name_are_still_two_participants(
    repo, session
):
    """The negative control for the guard above, and NC 1 restated against
    it: the check is on the KEY, so two humans who happen to share a name
    are unaffected. A name-based check here would have collapsed them - that
    is the whole of F-DM-04.
    """
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    _entry(session, tid, ev, player_name="Li Wei")
    _entry(session, tid, ev, player_name="Li Wei")

    commit_entries(repo, tid)

    session.expire_all()
    assert len(repo.brackets.list_participants(tid, "MS")) == 2


def test_a_committed_pair_survives_a_SECOND_run_without_a_stray_singleton(
    repo, session
):
    """The idempotency control for the person-key guard (SP-DM-3 P6 Task 5's
    documented trap). A seam-built TEAM carries ``members[0]``'s person key,
    so a naive key check inside the pair legs makes the pair refuse ITSELF on
    the second run and emit a lone PLAYER row for ``members[1]``. The draw
    must look identical after run two.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid, code="XD")
    _pair(session, tid, ev)

    commit_entries(repo, tid)
    before = [(p.id, p.type) for p in repo.brackets.list_participants(tid, "XD")]
    commit_entries(repo, tid)
    session.expire_all()
    after = [(p.id, p.type) for p in repo.brackets.list_participants(tid, "XD")]

    assert before == after
    assert [t for _, t in after] == ["TEAM"]
```

- [ ] **Step 2: Run and verify the first one fails**

Run: `.venv\Scripts\python.exe -m pytest tests/backend/unit/test_entries_commit_seam.py -q -k "ANOTHER_id or DIFFERENT_people or stray_singleton"`
Expected: `…under_ANOTHER_id…` FAILS (two participants today); the other two PASS (they are controls on behavior that must not change).

- [ ] **Step 3: Add the key set.** In `_plan_bracket`, beside `existing_ids` (`:697`):

```python
    existing_keys: dict[str, set[uuid.UUID]] = {}
```

  and fill it in the same block that fills `existing_ids` (`:723-729`), from the same one query — bind the participant list to a local so it is not fetched twice:

```python
        if event.bracket_event_id not in existing_ids:
            current = repo.brackets.list_participants(
                tournament_id, event.bracket_event_id
            )
            existing_ids[event.bracket_event_id] = {p.id for p in current}
            existing_keys[event.bracket_event_id] = {
                p.entry_player_id for p in current if p.entry_player_id is not None
            }
```

  and take the second handle beside `in_draw` (`:740`): `in_keys = existing_keys[event.bracket_event_id]`.

- [ ] **Step 4: Hoist the pair's candidate id, then widen leg 7.** Inside the `if partner is not None:` pre-check block (`:742-768`), compute the id the pair *would* get **before** the legs, because leg 7's key check has to be able to recognise the pair's own row:

```python
        partner = pairs.get(entry.id)
        if partner is not None:
            partner_seat = _adoptable(roster, partner) or _player_id(partner)
            # The id this pair WOULD carry, computed before the legs so leg 7
            # can tell "this very pair is already committed" (a re-run) apart
            # from "one of these humans is in the draw some other way".
            # Member order is fixed the same way the TEAM branch fixes it.
            _members = sorted((entry, partner), key=lambda e: (e.submitted_at, e.id))
            candidate_team_id = team_id(
                tuple(m.entry_player_id or m.id for m in _members)
            )
            already_ours = candidate_team_id in in_draw
            if not (
                already_ours
                or (
                    _valid(
                        BracketPlayerDTO,
                        _bracket_payload(partner, partner_seat),
                        partner,
                    )
                    and participant_id not in in_draw
                    and partner_seat not in in_draw
                    # Leg 7b (SP-DM-3 P6, `debt-log.md:78`): neither half may
                    # already be in this draw AS A PERSON either. Leg 7 asked
                    # by id, so a row under an arbitrary id naming the same
                    # human was invisible and the person entered twice. Guarded
                    # by ``already_ours`` above: on a re-run the existing TEAM
                    # carries ``members[0]``'s key, and without that guard the
                    # pair would refuse itself and drop a stray singleton for
                    # the other half.
                    and (
                        entry.entry_player_id is None
                        or entry.entry_player_id not in in_keys
                    )
                    and (
                        partner.entry_player_id is None
                        or partner.entry_player_id not in in_keys
                    )
                    and partner_seat != participant_id
                )
            ):
                partner = None  # fall through to the singleton insert
```

  **Do not restructure the rest of the branch.** The TEAM branch below re-derives `members`/`person_ids` today; leave it, or have it reuse `_members` — but if you reuse it, prove by test that `team_id(person_ids)` still equals `candidate_team_id` (it must; both are the same sorted tuple).

- [ ] **Step 5: Widen the insert dedupe** (`:824-826`) so the singleton path is guarded too, and so the key set stays current within a run:

```python
        key = insert.get("entry_player_id")
        if insert["id"] not in in_draw and (key is None or key not in in_keys):
            inserts.setdefault(event.bracket_event_id, []).append(insert)
            in_draw.add(insert["id"])
            if key is not None:
                in_keys.add(key)
```

  Note what this deliberately does **not** do: it never removes, edits or merges an existing row (I4), and the entry still reaches `planned.append((entry, participant_id))` two lines below, so its back-reference and its roster seat are unchanged.

- [ ] **Step 6: Run the whole seam suite — not just the new tests**

Run: `.venv\Scripts\python.exe -m pytest tests/backend/unit/test_entries_commit_seam.py -q`
Expected: ALL pass, including every P5 pair case (`:668-1120`), the two idempotence tests (`test_re_running_the_seam_commits_nothing_new` `:307`, `test_bracket_commit_is_idempotent` `:1281`), `test_a_member_already_entered_by_hand_is_not_double_entered_as_a_team` (`:1086`) and `test_one_person_in_two_draws_is_one_roster_row_in_both_participant_lists` (`:1138` — two **different** draws, so `in_keys` is per-event and must not collapse them). **If `:1138` fails, `existing_keys` is not keyed per bracket event — fix that, do not weaken the guard.**

Run: `.venv\Scripts\python.exe -m pytest tests/backend -q -k "entries or commit_seam"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(entries): the seam recognises a person by key, not by participant id (debt-log.md:78)" -- apps/api/src/entries/entries.py tests/backend/unit/test_entries_commit_seam.py
```

---

### Task 6: Stale prose, deletion gates, full gate, ledger — **M**

**Files:** `apps/api/src/db/blob_version.py` · `apps/api/src/core/schemas.py` · `apps/console/src/api/dto.generated.ts` (regen) · `apps/console/src/lib/README.md` · `docs/reference/debt-log.md` · `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md` · `docs/history/programs/DM3_PROGRESS.md`.

- [ ] **Step 1: Correct the five `BLOB_VERSIONS` owner comments** (Pickup (a)). In `apps/api/src/db/blob_version.py`, `:134-136` and `:151-152` currently name **P6** as the owner of a reshape P6 is forbidden to do:

```python
    "bracket_matches.side_a": None,  # resolved participants; see the R-DM-7(a) note
    "bracket_matches.side_b": None,  # same
    "bracket_matches.dependencies": None,  # draw topology; see the R-DM-7(a) note
    …
    "bracket_matches.slot_a": None,  # draw slot pointers; see the R-DM-7(a) note
    "bracket_matches.slot_b": None,  # same
```

  and add to the `None`-family note above the dict (after P5's paragraph):

```python
# P6 was named as the owner of the five ``bracket_matches`` list blobs
# (``side_a``, ``side_b``, ``dependencies``, ``slot_a``, ``slot_b``). It is
# NOT: R-DM-7(a) ruled against the slot-blob rewrite in those words, choosing
# ``bracket_participants.entry_player_id`` as the identity instead of a
# re-key, so P6 shipped without opening any of them. They are UNOWNED - a
# reshape needs its own ruling, not a phase pickup.
```

- [ ] **Step 2: Fix the two docstrings that assert a slug is the id** ("What the tree says" §9). In `apps/api/src/core/schemas.py`, `BracketPlayerDTO` (`:287-288`):

```python
    ``id`` is the roster row's own key, and where it came from depends on
    who made the row: the commit seam mints ``entry-{entry_player_id}``
    (``entries/entries.py::roster_id``, the one definition), while a
    hand-added row is slugged from the typed name by the console's
    ``playerSlug()``. It is NOT an identity - ``entryPlayerId`` is
    (R-DM-2(a)/R-DM-7(a)); the id is a locally-unique row key that matches
    ``bracket_participants.member_ids``.
```

  and in `apps/console/src/lib/README.md:30`:

```markdown
| `playerSlug.ts` | Row key for a HAND-ADDED bracket roster player, slugged from the typed name. Not an identity — that is `entryPlayerId` (R-DM-7(a)); the backend mints its own ids and derives no slug. |
```

- [ ] **Step 3: Regenerate the DTOs** (the `schemas.py` docstring is copied into `dto.generated.ts:3341`)

Run: `PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api`
Run: `.venv\Scripts\python.exe -m pytest tests/backend/test_dto_generated_freshness.py -q`
Expected: PASS. **No hand edit to `dto.ts` is needed** — the change is comment-only and adds no field, so the parity allow-list and the cap of 19 are untouched (verify: `npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts`).

- [ ] **Step 4: Update the debt log.**
  - **`:98` (blob-vs-column double-store)** — rewrite, do not strike: the assertion landed, the backfill did not happen and the edge still applies to whoever writes one.

```markdown
- **The bracket person key is double-stored; the two copies are now asserted to agree, and a backfill still owes the blob.** … **Partially closed 2026-08-25 by SP-DM-3 P6 Task 4** — `tests/backend/unit/test_entries_commit_seam.py` now asserts the column and the roster-blob copy agree for both a PLAYER and a seam-built TEAM (which carries `member_ids[0]`'s roster row's key). **P6 wrote no backfill**, by ruling: R-DM-7(a) scoped the slice to no migration, and a legacy slug row has no person to backfill *from*. The attached edge is therefore still live for whoever does write one — **a backfill must key `tournaments.data["bracketPlayers"]` in the same pass**, because the console builds a participant's key from the blob row on every re-save (`BracketDrawsTab.tsx:250` + four siblings), so a keyed column under an unkeyed blob row is erased by the first roster edit. Owner: **unassigned** — it needs a ruling, not a phase.
```

  - **`:78` (leg 7 by participant id)** — if Task 5 landed, strike it citing the SHA; if Task 5 was cut, **replace its closing sentence** ("…which is exactly the identity consolidation P6 owns") with: *"P6 shipped without it — see `DM3_PROGRESS.md`. The blind spot is unowned; closing it is the `_plan_bracket` change SP-DM-3 P6's plan Task 5 specifies, including its re-run idempotency trap."*
  - **Add one row** for the residual judgment call 2 accepts:

```markdown
- **A pre-roster-blob doubles-ONLY draw now migrates to an EMPTY roster.** SP-DM-3 P6 deleted `reconcileBracketRoster`'s label decode and de-slug fallback (F-DM-04/14/15), so a TEAM member no PLAYER participant can name is omitted rather than guessed at (F-DM-19's don't-invent posture). The affected population is brackets whose participants predate the roster blob — every bracket the Entries commit seam has touched carries a server-written roster with real names and never enters that path. The old behaviour recovered names by splitting the team label positionally, which was correct only by construction and only for seam-built teams. Recovery is retyping the name on the Roster tab. Unmeasurable from the repo (it is data on directors' laptops); recorded so it is a ruling, not a surprise. Found by SP-DM-3 P6 Task 2.
```

- [ ] **Step 5: Correct the design doc's P6 deletion gate**, the way P5 corrected its own (`:160`). Amend `…-domain-model-unification-design.md:170`:

```markdown
- **Deletion gate:** `rg "p\.name === p\.id" apps/` → 0. *Amended 2026-08-25 at the P6 ratification: the other half of this gate — `rg "playerSlug|toPlayerSlug|nameFromSlug" apps/console/src` → 0 outside a URL helper — is **unachievable and was never intended**. `toPlayerSlug` matches nothing in the tree (a phantom symbol); no URL consumer of a slug exists anywhere, so "a URL helper" describes nothing; and R-DM-7(a) itself keeps hand-added participants slug-keyed and accepts the same-name collision in writing, which requires `playerSlug`'s single caller (`BracketRosterTab.tsx:137`) to survive. The achievable gates are `rg "nameFromSlug" apps/` → 0 and one remaining `split(' / ')` in the whole console (`DrawView.tsx:989`, presentation-only). Related: F-DM-14's "five presentation-direction splits" is **one** — four of the five cited sites are `join(' / ')`, the correct id→name direction.*
```

- [ ] **Step 6: Run every deletion gate together and record the output**

```bash
rg -n "p\.name === p\.id" apps/            # expect: no matches (exit 1)
rg -n "nameFromSlug" apps/                 # expect: no matches (exit 1)
rg -n "\.split\(' / '\)|\.split\(\" / \"\)" apps/console/src apps/entrant/app packages
                                           # expect: exactly 1 — DrawView.tsx:989
rg -n "playerSlug" apps/console/src --glob '!**/dto.generated.ts'
                                           # expect: exactly 3 — the definition,
                                           # BracketRosterTab's import and its one call.
                                           # NOT zero; see judgment call 1.
rg -n "healBracketRosterNames" apps/       # expect: no matches (exit 1)
```

- [ ] **Step 7: Full gate**

Run: `make check`
Expected: green across both tiers (console lint/types/vitest/depcruise at **16 warnings / 0 errors**, entrant lint/types/vitest/depcruise, ruff, import-linter's fifteen contracts, pytest). Fix anything red before proceeding; if a failure is pre-existing, verify that by running the same gate on a `main` worktree or reading CI — **never** with `git stash`.

- [ ] **Step 8: Update the ledger** — `docs/history/programs/DM3_PROGRESS.md`, in the shape P4 and P5 used: P6's row flipped to DONE with the commit SHAs; what shipped and what did not (**the mint survives on both tiers, by ruling**); the negative controls and where each lives (NC 1 → Task 1 Steps 3+4 and Task 5's control; NC 2 → Task 1 Step 5; NC 3 → Task 3 Step 1); the residual (empty legacy doubles-only roster); the `bracketMigration.ts:8-14` D3 citation restated with the register warning; whether Task 5 landed or was cut; the standing SQLite-only caveat; and the **Next** note for P7 (which inherits F-DM-08's server-route half and P5's Meet rank-disconnect row — neither touched here).

- [ ] **Step 9: Commit, then stop**

```bash
git commit -m "docs(bracket): the id is a row key, not an identity; P6 gates + ledger" -- apps/api/src/db/blob_version.py apps/api/src/core/schemas.py apps/console/src/api/dto.generated.ts apps/console/src/lib/README.md docs/reference/debt-log.md docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md docs/history/programs/DM3_PROGRESS.md
```

Merging `dm3/p6-person-demotion` follows the standing merge-and-proceed instruction (superpowers:finishing-a-development-branch). **Do not start P7 in the same session without checking the ledger's next-slice note** — P7 is program-scale and R-DM-5-gated.

---

## Self-review record (plan author, 2026-08-25)

- **Card coverage.** §C6's four clauses map as: *no re-key / no slot-blob rewrite* → Global Constraints + Pickup (a) (no `BLOB_VERSIONS` flip, five owner comments corrected); *`playerSlug.ts` demotes* → judgment call 1, which **declines** it and argues from R-DM-7(a)'s own residual sentence, with the design-doc gate corrected in Task 6 Step 5; *decode deleted* → Task 2; *repair deleted* → Task 3. The three NCs map to Task 1 Steps 3+4 and Task 5's control (NC 1, both halves), Task 1 Step 5 (NC 2), Task 3 Step 1 (NC 3). The card's gate `rg "p\.name === p\.id"` → 0 is Task 3 Step 6, scoped to `apps/` and verified achievable (one match today, at `bracketMigration.ts:102`).
- **Deletion is the deliverable, and each deletion states its precondition.** Task 2's is that the seam always writes a real-named roster row so no Entries-touched bracket reaches the decode; Task 3's is a three-part safety argument with the one unverifiable part named for ratification, plus an executable property (Step 1) run **before** the deletion so the claim is evidence rather than assertion.
- **The D3 citation rule is honoured everywhere**: `bracketMigration.ts:8-14` is quoted verbatim in Task 3, and the register collision is restated in Global Constraints, in the NC 3 docstring and in the ledger step. The string "debt-log D3" appears nowhere in this plan except this sentence saying it must not.
- **Known judgment calls (flagged, not hidden):** eight, listed up front with the cost of overruling each. The two that change the slice's shape are #1 (playerSlug survives — overruling it reopens R-DM-7) and #5 (leg 7 in scope, M not S, cuttable).
- **Type consistency.** `reconcileBracketRoster` keeps `(BracketTournamentDTO) => BracketPlayerDTO[]` in Task 2 and at its one call site. `existing_keys` is `dict[str, set[uuid.UUID]]` in Task 5 Step 3 and compared against `entry.entry_player_id` (a `uuid.UUID`) in Steps 4 and 5 — never against a `str`; the roster blob's copy is a `str` and is only ever compared to `str(p.entry_player_id)` (Task 4).
- **The risky task is Task 5**, and its documented trap (a re-run refusing its own pair and emitting a stray singleton) is the reason it is planned rather than left to the debt row's "S once the key is the identity" estimate. Its Step 6 names four pre-existing tests that must stay green, including the per-event one (`:1138`) that catches the wrong data structure.
- **Line numbers** anchor to `ca15d7d7`. Every task names its symbol as well as its line; re-anchor by symbol if the tree has moved.
- **Standing caveat:** P6 carries no migration, so it adds nothing to the program's SQLite-only evidence — the ledger still says it.
