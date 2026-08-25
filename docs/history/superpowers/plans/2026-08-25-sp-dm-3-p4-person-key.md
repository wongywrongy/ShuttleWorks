# SP-DM-3 P4 — The people→competition link becomes a key

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** R-DM-2(a) — the only storage link between the people spine and the competition spine stops being an unconstrained String pointed *into* a JSON blob and becomes a real key: `bracket_participants.entry_player_id` (Uuid, composite FK), a typed `entryPlayerId` on both roster blob shapes, and the four independent `entry-{uuid}` derivations collapsed to one. Along the way the two R13 FKs the migration already has reach `models.py` (F-DM-11), `match_states` gains the composite FK it never declared (F-DM-22), and `ParticipantOut` stops dropping the provenance link (F-DM-09).

**Architecture:** Additive strangler. The legacy `entry-{uuid}` string stays the roster/participant PK and stays a read path for the whole slice; what changes is that a *second*, constrained pointer rides alongside it and every derivation of the legacy string goes through one function. No re-key (R-DM-7(a) forbids it), no blob rewrite, no backfill. The R-DM-2(c) Meet-roster extraction is the ratified end-state and is **a committed follow-on program, not part of P4**.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (`apps/api/src`, sys.path root — imports are `from entries import …`), pytest (repo root, repo `.venv`), React+Vite console, vitest, React Router 7 SSR entrant tier.

**Spec:** program card §C4 (`docs/history/superpowers/plans/2026-08-24-sp-dm-3-domain-unification-program.md:52-54`) · ruling R-DM-2 + R-DM-7 (`docs/history/programs/DM1_RULINGS.md:19-38,63-73`) · design doc §2 P4 (`docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md:143-152`) · audit F-DM-05/09/10/11/22 (`docs/history/audits/2026-08-24-domain-model-audit.md:452-474`).

**Branch:** `dm3/p4-person-key` off `main` @ `9f423053` (**controller ruling** — not stacked on any unmerged branch; P2 is merged).

---

## Global Constraints (inherited — read them, they bind every task)

The program plan's Global Constraints (`…-domain-unification-program.md:13-22`) apply verbatim. The four that actually bite in P4:

- **F-DM-11 same-commit rule.** Any FK reaching `models.py` lands with its migration in the **same commit**, and its negative control asserts `IntegrityError` against **migration-built** schema. Task 2 is the one deliberate exception and says why in-line.
- **R2 stands: no FK on `entry_events.bracket_event_id`.** That FK is ruled absent. Do **not** add it while adding others, and do not "notice" it in a Boy-Scout pass.
- **ADR 0006 / R-DM-7(a): no re-key.** `bracket_participants.id` keeps its String form. Nothing in this slice rewrites a slot blob, a `member_ids` list, or a participant id.
- Path-limited commits (`git commit -- <paths>`), never `git add .`. Gate the specific suite per task; `make check` at slice end.

---

## Judgment calls this plan makes (controller: these are the ones to overrule if you disagree)

1. **`ondelete="CASCADE"` on the `match_states` → `matches` FK is forced, and it is a behavior change.** The Meet projection (`repositories/local.py:483-486`) deletes a `matches` row whose id left `tournaments.data["matches"]`. With no FK today the `match_states` row survives **orphaned**. `RESTRICT`/no-action would make that delete raise `IntegrityError` and break the write path; `CASCADE` (the `commands` prior art, `db/models.py:283-288`) deletes the live-ops state with the match. So the card's NC3 ("blob-removed match id still deletes its `matches` row") is satisfied, at the cost of also deleting its state row. Task 1 characterizes today's orphaning **before** Task 3 changes it.
2. **No new index on `match_states`.** The card says "composite FK to `matches` + index". `match_states`' primary key is already `(tournament_id, match_id)` — the exact index an FK on those two columns would want. `commands` needs its explicit index because its index is `(tournament_id, match_id, applied_at)` and it has a surrogate PK; `match_states` has neither condition. Adding a redundant index is invented work. **Stated, not silently skipped.**
3. **No backfill of `entry_player_id`.** The column is nullable and additive; existing participant rows carry `meta.sourceEntryId`, and deriving the person from it is a data migration R-DM-2 did not ask for. New and re-committed entries get the key; old rows read null. P6 depends only on the FK existing, not on it being populated.
4. **No `tournaments.data` version bump.** Both roster blob shapes gain an **optional** field. Bumping `CURRENT_TOURNAMENT_SCHEMA_VERSION` 2→3 would make every P4-written document unreadable by a pre-P4 build (`db/blob_version.py::VersionedJSON.process_result_value` raises on `stored > version`) in exchange for nothing — an older reader ignores an unknown optional key. See "Pickup (d)" below for the full answer.
5. **The nine `MatchStateDTO` allow-list rows stay untouched.** `dtoParity.allowlist.json` says closing them "is P1/P4 work". They are the live-ops state-authority question (F-DM-28b), not the person key; R-DM-2(a) does not charter them. The ratchet cap stays **19**, unraised and unshrunk.
6. **`askBirthYear` aligns to the entry page's rule (open events), not the reverse.** Pickup (b) — the entry page is the surface that collects the year, so it is the authority; the partner preview is the copy that drifted.
7. **The participant FK cascades, and the destructive edge is accepted knowingly.** `SET NULL` is off the table (it would null a `NOT NULL` PK column — argued in Task 3 Step 3's notes), so deleting an `entry_players` row deletes that person's participant rows. Blast radius: `entry_players` rows die only on **tournament teardown** (where participants die anyway through `bracket_events`' own cascade, so no new loss) and on **`entrant_accounts` deletion** (`entry_players.account_id` is `ondelete="CASCADE"`, `db/models.py:1365-1367`). D7 erasure **scrubs and stamps `erased_at`, it does not delete** — that is the whole ruling — so the ordinary entrant path never reaches this edge. **Executor: verify before Task 3 Step 7 with `rg "delete\(.*EntrantAccount|DELETE FROM entrant_accounts" apps/api/src` (check `entries/retention.py` in particular). If a live code path deletes accounts, STOP and flag it to the controller** — silently deleting draw history when an account goes is a ruling, not an implementation detail.

---

## What the tree says that the card does not

Report these to the controller; they are facts, not deviations.

- **There are FOUR `entry-{uuid}` derivation sites, not three.** The audit names `entries/entries.py:227` (mint), `entries_site.py:88`, `entries_site.py:942`. A fourth landed after the audit SHA: `entries/entries_me.py:375` (`event_badges.get(f"entry-{entry.entry_player_id}")`). The deletion gate is unchanged in spirit — collapse **all** readers onto the minting site's helper.
- **F-DM-11's "same commit as any migration change" is already half-satisfied.** `(tournament_id, submission_id)` → `submissions` and `(tournament_id, entry_player_id)` → `entry_players` are **present in the migration** (`alembic/versions/s3d8f2b5c0e1_entries_accounts_and_submissions.py:367-382`) and **absent from `models.py:1517-1518`). Task 2 therefore adds no migration — it makes the models catch up. That is the F-DM-11 rule pointing the other way, and Task 2 states it in its commit message.
- **The generation path destroys `meta` today.** `brackets.py:2152-2160` and `:1442-1454` build engine `Participant`s with `metadata={"seed": …}` only — `p.meta` is dropped. The re-persist at `:2266-2287` then rebuilds the rows from those Participants. So **regenerating a draw already erases `meta.sourceEntryId`** (F-DM-09's generation half, live). Task 1 pins it; Task 4 fixes it, because `entry_player_id` would die the same way.
- **The console roster echo needs no allow-list edit.** `hooks/useTournamentState.ts:291` passes `players: state.players` as whole objects — the snapshot allow-list is at the *state-key* level, not the player-field level. `sourceEntryId` survives for that reason and `entryPlayerId` will too. Task 5 extends the existing round-trip test rather than editing a list.

---

## Pickup (d) — the P2 blob-version question, answered explicitly

P2 left a note in `db/blob_version.py:83-85`: if P4 versions or reshapes a registered blob column, flip its `BLOB_VERSIONS` entry and tighten `test_a_future_version_blob_refuses_to_load`.

**P4 reshapes none of P2's candidate columns.** `bracket_matches.side_a` / `side_b` / `slot_a` / `slot_b` / `dependencies` are columns on `bracket_matches`; P4 touches no draw topology and no resolved-side list (R-DM-7(a) forbids exactly that). The **two roster blob shapes** the card means are `PlayerDTO` and `BracketPlayerDTO` (`core/schemas.py:244-296`), and they live as `players[]` / `bracketPlayers[]` **inside `tournaments.data`** — which is P2's one already-wired `VersionedJSON` column. So:

- No `BLOB_VERSIONS` `None` is flipped. The count stays one wired column and `test_the_tournament_document_is_the_one_wired_column_today` stays green.
- No version bump (judgment call 4).
- `test_a_future_version_blob_refuses_to_load` is **already** tightened to the raise landing in `get_by_id` (`tests/backend/unit/test_repositories.py:631-632`) — P2 did it when it wired `tournaments.data`. Nothing to do.
- **One correction is owed** (Task 8): three `BLOB_VERSIONS` comment lines attribute `bracket_matches.side_a`/`side_b` to "P4" and `dependencies` to "P4/P6". P4 does not touch them. Re-attribute to P6 (the draw-topology phase) so the registry stops naming a phase that came and went without them.

## Pickup (e) — recorded for the future merge tool

The workspace-scoped duplicate advisory P3 shipped marks only the **later** half of an identity fork: `has_unresolvable_namesake` runs at mint time, so the first row is written before there is anything to collide with. **`entry_player_id` on `bracket_participants` is what makes both halves findable** — a merge tool can group participant rows by the key and see two keys under one name, rather than starting from a flagged entry and having to search backwards for its sibling. Recorded here, not built: the operator merge tool is a ruled deferral (`docs/reference/debt-log.md:78` region).

---

## File map (everything this slice may touch)

Backend:
- `apps/api/src/db/models.py` — `Entry.__table_args__` (+2 FKs), `BracketParticipant` (+column, +FK), `MatchState.__table_args__` (new).
- `apps/api/src/alembic/versions/y9e4f0a2b7c8_person_key_and_match_state_fk.py` — **new**.
- `apps/api/src/repositories/local.py` — `_insert_participants` (:721-750).
- `apps/api/src/bracket/brackets.py` — `ParticipantIn` (:201), `ParticipantOut` (:244), hydration (:794-807), three persist dicts (:1010-1031, :1999-2012, :2266-2287), two engine-`Participant` constructions (:1442-1454, :2152-2160), two `ParticipantOut` call sites (:1150-1158, :1190-1198).
- `apps/api/src/core/schemas.py` — `PlayerDTO` (:244-269), `BracketPlayerDTO` (:272-295).
- `apps/api/src/entries/entries.py` — `roster_id()` (new), `_player_id` (:210-227), `_plan_meet` payload (:392-405), `_plan_bracket` payload (:578-601).
- `apps/api/src/entries/entries_site.py` — `:88`, `:942`.
- `apps/api/src/entries/entries_me.py` — `:375`.
- `apps/api/src/entries/partners.py` — `accept()` (:177-264).
- `apps/api/src/entries/partner_routes.py` — `preview_partner_invite` (:190-210).
- `apps/api/src/db/blob_version.py` — three comment lines only.

Console:
- `apps/console/src/api/dto.generated.ts` — regenerated (never hand-edited).
- `apps/console/src/api/dto.ts` — `PlayerDTO`, `BracketPlayerDTO`.
- `apps/console/src/api/bracketDto.ts` — `Participant`, `ParticipantInput`.
- `apps/console/src/modules/bracket/rosterEvents.ts` — `toUpsertParticipant` (:150-165).

Tests: `tests/backend/unit/test_entries_migration.py`, `tests/backend/unit/test_entries_commit_seam.py`, `tests/backend/unit/test_repositories.py`, `tests/backend/unit/test_submission_service.py`, `tests/backend/test_partner_invites.py`, `tests/backend/test_bracket_*.py` (whichever covers upsert/generate — locate at Task 4), `apps/console/src/lib/__tests__/useTournamentState.test.ts`, `apps/console/src/modules/bracket/__tests__/rosterEvents.test.ts`.

**Run commands:** backend `.venv\Scripts\python.exe -m pytest <path> -q` from the repo root (or `pytest` with the venv active). Console `npm --prefix apps/console run test:run -- <path filter>`; type gate `npm --prefix apps/console run build`. DTO regen: `PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api`, then reconcile `apps/console/src/api/dto.ts` **by hand** in the same commit. Slice end: `make check`.

**Line numbers anchor to `9f423053`.** Re-anchor by symbol if the tree has moved.

---

### Task 1: Characterize before touching (no production code)

Four pins. Every one of them either records behavior a later task deliberately changes, or closes a carried-forward gap. **Nothing in this task edits `apps/`.**

**Files:** `tests/backend/unit/test_entries_commit_seam.py`, `tests/backend/unit/test_repositories.py`, `tests/backend/unit/test_submission_service.py`, plus one bracket test file located in Step 3.

- [ ] **Step 1: NC 2 — the documented commit crash window.** Read `entries/entries.py:239-249` (the docstring that describes it) and `tests/backend/unit/test_entries_commit_seam.py:490-510` (which already discusses `committed_player_id` pointing at a player). If a test already drives "roster written, back-references NOT written, re-run adopts instead of duplicating", **do not write a second one** — cite its name in the ledger and move on. If it does not, add one to that file:

```python
def test_a_crash_between_the_two_commits_adopts_instead_of_duplicating(...):
    """NC 2 (P4 card): the seam commits the roster and the back-references
    separately (``entries/entries.py:239-249``), and the window between them
    is closed by ``_adoptable``, not by rollback. Simulated by committing the
    roster and then clearing ``committed_player_id`` before re-running —
    which is exactly the state a crash leaves. Pinned BEFORE P4 touches the
    seam so a regression here is attributable."""
```

Assert: after the second run, the roster has **one** player for that person, and `entry.committed_player_id` is set. This is the pin the card asks for ("characterized before touching").

- [ ] **Step 2: The `match_states` orphan, as it is today.** In `tests/backend/unit/test_repositories.py`, near the projection tests, add:

```python
def test_a_blob_removed_match_deletes_its_matches_row_and_TODAY_orphans_its_state(session):
    """Baseline for P4's ``match_states`` FK (F-DM-22).

    ``repositories/local.py:483-486`` deletes a ``matches`` row whose id left
    ``data["matches"]``. ``match_states`` has no FK, so its row survives with
    no parent. P4 adds the composite FK with ``ondelete="CASCADE"`` (forced:
    RESTRICT would make this very delete raise), after which the state row
    goes with the match. THIS TEST IS EXPECTED TO CHANGE IN TASK 3 — that is
    the point of writing it now, so the change is a visible edit and not a
    silent one."""
```

Drive it through the real projection: upsert `data` with one match, write a `MatchState` row for that id, upsert `data` again without the match, then assert `session.get(Match, (tid, mid)) is None` **and** `session.get(MatchState, (tid, mid)) is not None`.

- [ ] **Step 3: The generation path already loses `meta` (F-DM-09, live).** Locate the bracket test file that exercises generate/regenerate (`rg "def test_.*generate" tests/backend | head`). Add a pin: create an event whose participant carries `meta={"sourceEntryId": "..."}`, generate the draw, re-read the participant rows, and assert `meta` is **empty** — i.e. record today's loss. Name it so the intent is unmissable:

```python
def test_regenerating_a_draw_TODAY_destroys_participant_meta(...):
    """F-DM-09's generation half, characterized. ``brackets.py:2152-2160``
    builds engine Participants with ``metadata={"seed": ...}`` only, and
    ``:2266-2287`` re-persists the rows FROM those Participants — so every
    regenerate wipes ``meta.sourceEntryId``. Task 4 flips this assertion;
    it is written first so the flip is evidence, not a claim."""
```

- [ ] **Step 4: Pickup (a) — withdrawn re-entry raises `needs_review_person`.** P3's ledger judged this correct but left it unpinned. `has_unresolvable_namesake` (`entries/submissions.py:322-356`) excludes only `erased_at`-stamped rows, so a person who withdrew and re-enters year-less collides with their own surviving row. Add to `tests/backend/unit/test_submission_service.py`, in the flags section:

```python
def test_re_entering_after_a_withdrawal_carries_the_weaker_advisory(session, world):
    """Carried from SP-DM-3 P3 (ledger, 2026-08-24) — judged CORRECT and
    pinned here. A withdrawn entry's ``entry_players`` row survives by
    design (only D7 erasure scrubs it), so a year-less re-entry under the
    same account collides with the person's own earlier row and rides
    ``needs_review_person``. That is the advisory doing its job: two rows
    exist and an operator should look. Not silence, and not a merge (I4)."""
```

Create a person, withdraw the entry (use the file's existing lifecycle helper — `rg "withdraw" tests/backend/unit/test_submission_service.py`; if none, drive `lifecycle` directly), then `_create` the same name with no birth year and assert `"needs_review_person" in ...pending_reasons`.

- [ ] **Step 5: Run the four**

```
pytest tests/backend/unit/test_entries_commit_seam.py tests/backend/unit/test_repositories.py tests/backend/unit/test_submission_service.py -q
```
plus the bracket file from Step 3. **Expected: ALL PASS.** These are characterization pins — a red one here means the tree does not do what this plan believes, and that is a STOP-and-report, not a fix-forward.

- [ ] **Step 6: Commit**

```bash
git commit -m "test(dm3-p4): characterize the crash window, the match_states orphan, the meta-losing regenerate, and withdrawn re-entry" -- tests/backend/unit/test_entries_commit_seam.py tests/backend/unit/test_repositories.py tests/backend/unit/test_submission_service.py <bracket test file>
```

---

### Task 2: The two R13 FKs reach `models.py` (F-DM-11)

**Files:** `apps/api/src/db/models.py` (`Entry.__table_args__`, :1577-1600) · `tests/backend/unit/test_entries_migration.py`.

**Interfaces:** consumes nothing new. Produces: the `create_all` schema the unit suites build now carries the same two constraints production has had since `s3d8f2b5c0e1`.

**Why this task carries no migration, and why that satisfies F-DM-11 rather than dodging it.** The rule is "models and migration agree, in one commit". Here the *migration* is the correct side and `models.py` is the drift (`…s3d8f2b5c0e1…:367-382` has both FKs). Adding a migration would create a duplicate constraint. State this in the commit message.

- [ ] **Step 1: Extend the drift test to constraints (the actual F-DM-11 hole).** `test_migration_matches_the_models_column_for_column` (:283-305) compares **columns only** — which is why this drift survived. Add beside it:

```python
def test_migration_matches_the_models_foreign_key_for_foreign_key(alembic_cfg):
    """F-DM-11's real hole: the column comparison above was green the whole
    time two FKs existed in production and not in the models, so the unit
    suites' ``create_all`` schema was WEAKER than production and an orphan
    was representable in tests where it raised in prod. Constraints, not
    just columns.

    Compared as (sorted local columns, referred table, sorted referred
    columns) triples — names are not compared, because SQLite auto-names
    unnamed constraints and the two sides would never agree on a label."""
```

Build the migrated set from `inspector.get_foreign_keys(table)` and the modelled set from `Base.metadata.tables[table].foreign_key_constraints`, over `ENTRIES_TABLES`. **Run it now and watch it FAIL** naming `entries` and the two missing FKs — that is the proof the test is real:

```
pytest tests/backend/unit/test_entries_migration.py -q -k foreign_key_for_foreign_key
```

- [ ] **Step 2: Add the two FKs.** In `db/models.py`, `Entry.__table_args__` (:1577), before the `ix_entries_event_player` index:

```python
        # R13's two spine pointers, FK'd in the migration since
        # ``s3d8f2b5c0e1`` and absent here until SP-DM-3 P4 (F-DM-11). The
        # gap was not cosmetic: the unit suites build schema with
        # ``Base.metadata.create_all``, so an orphaned entry was
        # REPRESENTABLE in every test while raising IntegrityError in
        # production. The relationships below stay ``viewonly`` +
        # ``primaryjoin`` — a relationship is a join, never a constraint.
        ForeignKeyConstraint(
            ["tournament_id", "submission_id"],
            ["submissions.tournament_id", "submissions.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["tournament_id", "entry_player_id"],
            ["entry_players.tournament_id", "entry_players.id"],
            ondelete="CASCADE",
        ),
```

- [ ] **Step 3: Run the migration suite, then the WHOLE backend suite.**

```
pytest tests/backend/unit/test_entries_migration.py -q
pytest tests/backend -q
```

**Expected:** the new FK test passes. The full sweep is not optional — `db/session.py:39-45` registers `PRAGMA foreign_keys=ON` on the SQLAlchemy `Engine` **class**, so these constraints are now enforced in every `create_all` fixture in the suite. Any test that wrote an `Entry` with a made-up `submission_id`/`entry_player_id` reddens here. **Fix such a test by giving it a real parent row, never by dropping the constraint** — a test that needed an orphan was asserting against a schema production never had. If a red test cannot be fixed that way, STOP and report it.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(db): the two R13 FKs reach models.py; drift test now compares constraints (F-DM-11)

No migration: s3d8f2b5c0e1 has had both FKs since the R13 reshape. models.py
was the drift, so the same-commit rule points models-side only." -- apps/api/src/db/models.py tests/backend/unit/test_entries_migration.py
```

---

### Task 3: The migration — `entry_player_id` and the `match_states` FK

**Files:** `apps/api/src/alembic/versions/y9e4f0a2b7c8_person_key_and_match_state_fk.py` (new) · `apps/api/src/db/models.py` (`BracketParticipant` :478-512, `MatchState` :303-330) · `tests/backend/unit/test_entries_migration.py` (`HEAD_REVISION`) · a new test module for the NCs.

**Interfaces:** produces `bracket_participants.entry_player_id: Mapped[Optional[uuid.UUID]]` with composite FK → `entry_players(tournament_id, id)`; `MatchState.__table_args__` with composite FK → `matches(tournament_id, id)`, `ondelete="CASCADE"`. Tasks 4 and 5 consume the column.

**F-DM-11: models.py and this migration land in ONE commit.**

- [ ] **Step 1: Write NC 1 first, against migration-built schema.** New file `tests/backend/unit/test_person_key_migration.py`. Copy the `alembic_cfg` fixture pattern verbatim from `test_entries_migration.py:66-95` (it purges backend modules and points `env.py` at a throwaway SQLite file — do not invent a variant).

```python
def test_a_dangling_entry_player_id_is_refused(alembic_cfg):
    """NC 1 (P4 card). MIGRATION-built schema, not ``create_all`` — that is
    the whole point of F-DM-11: the suites' schema is the weaker one, so a
    constraint asserted there proves nothing about production.

    The PRAGMA assertion is not decoration. SQLite defaults
    ``foreign_keys`` OFF per connection; ``db/session.py`` registers a
    listener on the Engine CLASS, so whether it is on here depends on
    whether that module has been imported — and ``purge_backend_modules``
    moves that around. Without the assertion this test can pass VACUOUSLY by
    never enforcing anything."""
```

Body: `import db.session  # noqa: F401 - registers the Engine-CLASS PRAGMA listener (db/session.py:39-49); without it, whether FKs are enforced depends on import order and purge_backend_modules moves that around`, then `command.upgrade(cfg, "head")`, `engine = sa.create_engine(url)`, then `with engine.begin() as conn:` assert `conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1`. Insert a tournament + a `bracket_events` row + a `bracket_participants` row whose `entry_player_id` is a UUID with no `entry_players` row, and wrap it in `pytest.raises(sa.exc.IntegrityError)`. **Negative control in the same test:** insert a real `entry_players` row and the same participant → accepted. (Bind UUIDs as **undashed 32-char hex** — SQLAlchemy's `Uuid` stores that on SQLite, and a dashed bind silently matches nothing. P2's ledger records this trap.)

```python
def test_a_match_state_whose_match_is_deleted_goes_with_it(alembic_cfg):
    """NC 3 (P4 card), the FK half. The Meet projection deletes a ``matches``
    row whose id left the blob; with this FK that delete must still SUCCEED
    (RESTRICT would break the write path — see the plan's judgment call 1)
    and must take the ``match_states`` row with it."""
```

Also assert the FK exists at all via `inspector.get_foreign_keys("match_states")` — an `IntegrityError` test alone cannot distinguish "FK present" from "test set up wrong".

```python
def test_deleting_a_tournament_with_a_person_keyed_participant_still_succeeds(alembic_cfg):
    """NC 4 (added by the plan's self-review): the cascade-ORDER control.

    Two composite cascades now converge on one row — ``bracket_events`` →
    ``bracket_participants`` and ``entry_players`` →
    ``bracket_participants`` — and ``tournaments`` cascades into all of
    them. This is the test that catches an unworkable ``ondelete``
    empirically rather than by reading a dialect manual: ``SET NULL`` on
    the participant FK would try to null ``tournament_id``, a NOT NULL
    primary-key column, and could take tournament deletion down with it.
    Migration-built schema, enforcement ON, or it proves nothing."""
```

Body: seed a tournament + `entry_players` row + `bracket_events` row + a `bracket_participants` row carrying a real `entry_player_id`, then `DELETE FROM tournaments WHERE id = …` and assert it succeeds and leaves no participant row. Add the mirror case — `DELETE FROM entry_players WHERE id = …` succeeds — so the accepted destructive edge in judgment call 7 is *asserted* rather than assumed.

- [ ] **Step 2: Run and watch them fail**

```
pytest tests/backend/unit/test_person_key_migration.py -q
```
Expected: FAIL — the column does not exist / no FK to cascade.

- [ ] **Step 3: The migration.** New `apps/api/src/alembic/versions/y9e4f0a2b7c8_person_key_and_match_state_fk.py`, `revision = "y9e4f0a2b7c8"`, `down_revision = "x8d3e9f1a6b7"` (the current head — verify with `rg 'down_revision' apps/api/src/alembic/versions | rg x8d3` and by reading `test_entries_migration.py:44`). Module docstring must carry: why the FK is composite (`entry_players` PK is `(tournament_id, id)`, so a single-column FK is not expressible); why `match_states` cascades rather than restricts; and why the orphan sweep exists.

Three operations, in this order:

```python
def upgrade() -> None:
    # 1. The new pointer. Nullable + no backfill: additive by design
    #    (R-DM-2(a)); a hand-added participant never came from a person,
    #    and deriving one from meta.sourceEntryId is a data migration this
    #    ruling did not ask for.
    with op.batch_alter_table("bracket_participants") as batch:
        batch.add_column(sa.Column("entry_player_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_bracket_participants_entry_player",
            "entry_players",
            ["tournament_id", "entry_player_id"],
            ["tournament_id", "id"],
            ondelete="CASCADE",
        )

    # 2. One-time sweep. ``match_states`` never had this FK on EITHER
    #    backend, so unlike u5f0b4d7e2a3 this is not a SQLite-only
    #    pre-enforcement problem and the PRAGMA-driven prior art does not
    #    apply: the projection at repositories/local.py:483 has been
    #    deleting parent ``matches`` rows and leaving these behind on
    #    Postgres too. Dialect-neutral SQL, so it runs on both.
    op.execute(
        "DELETE FROM match_states WHERE NOT EXISTS ("
        " SELECT 1 FROM matches m WHERE m.tournament_id ="
        " match_states.tournament_id AND m.id = match_states.match_id)"
    )

    # 3. The FK itself.
    with op.batch_alter_table("match_states") as batch:
        batch.create_foreign_key(
            "fk_match_states_match",
            "matches",
            ["tournament_id", "match_id"],
            ["tournament_id", "id"],
            ondelete="CASCADE",
        )
```

Notes the executor must respect:
- **`batch_alter_table` is mandatory** on both — SQLite cannot `ALTER TABLE … ADD CONSTRAINT` and rebuilds the table. `alembic/env.py` disables FK enforcement on the migration connection, which is what makes the rebuild safe (with enforcement on, SQLite's implicit `DELETE FROM` during a rebuild fires every child cascade — measured and documented at `u5f0b4d7e2a3…:60-70`). **Do not "fix" env.py.**
- **`ondelete="CASCADE"` on the participant FK — `SET NULL` is not expressible here and would be a live bug.** SQLite and portable Postgres apply `SET NULL` to **every** referencing column, `tournament_id` included — and `tournament_id` is part of `bracket_participants`' primary key and `NOT NULL`. The first `entry_players` deletion under a referencing participant would raise, and depending on cascade evaluation order that can break **tournament deletion itself**. CASCADE is also the exact prior art for this composite shape: `entries.(tournament_id, entry_player_id)` → `entry_players` is CASCADE (`s3d8f2b5c0e1…:377-382`). See judgment call 7 for the blast radius. Say all of this in the docstring.
- **`downgrade()` must be real and symmetric** — drop both constraints and the column, in reverse. `test_entries_migration.py` runs downgrade and replay; a `pass` downgrade reddens it.
- The sweep **logs what it removed** (`log.info` with the rowcount from `op.get_bind().execute(...)`) — silent deletion is worse than none, per the prior art's own reasoning.

- [ ] **Step 4: The models, same commit.** `BracketParticipant` (:492, after `meta`):

```python
    # R-DM-2(a) / SP-DM-3 P4: the FIRST constrained hop from the people
    # spine to the competition spine. ``id`` above stays the name-derived
    # String by ruling R-DM-7(a) — no re-key — so this is the identity for
    # every participant that resolves to a person, and ``id`` degrades to a
    # display/URL key. Nullable because a hand-added participant is nobody
    # in ``entry_players``. Composite because ``entry_players``' PK is
    # ``(tournament_id, id)``.
    entry_player_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, nullable=True
    )
```

and in `__table_args__` (:506):

```python
        ForeignKeyConstraint(
            ["tournament_id", "entry_player_id"],
            ["entry_players.tournament_id", "entry_players.id"],
            # CASCADE, not SET NULL: a composite SET NULL nulls EVERY
            # referencing column, ``tournament_id`` included - and that is
            # a NOT NULL primary-key column here. Same ondelete as the
            # ``entries`` FK onto the same parent (s3d8f2b5c0e1). Blast
            # radius argued in the plan's judgment call 7.
            ondelete="CASCADE",
        ),
```

`MatchState` (:303) gains its first-ever `__table_args__`, after the `tournament` relationship:

```python
    # F-DM-22: one Meet match is three records joined by an unconstrained
    # String(100), and this was the table with no ``__table_args__`` at
    # all. ``commands`` (same file, :283) is the prior art — composite
    # because ``matches.id`` alone is not unique.
    #
    # CASCADE is FORCED, not preferred: the Meet projection
    # (repositories/local.py:483) deletes a ``matches`` row whose id left
    # ``tournaments.data["matches"]``, and a RESTRICT would turn that
    # ordinary write into an IntegrityError. The consequence is real and
    # accepted — live-ops state for a match removed from the blob is now
    # deleted with it instead of surviving orphaned (characterized in
    # tests/backend/unit/test_repositories.py before the change).
    #
    # No extra Index: the primary key IS (tournament_id, match_id).
    # ``commands`` needs one because its index is
    # (tournament_id, match_id, applied_at) over a surrogate PK.
    __table_args__ = (
        ForeignKeyConstraint(
            ["tournament_id", "match_id"],
            ["matches.tournament_id", "matches.id"],
            ondelete="CASCADE",
        ),
    )
```

- [ ] **Step 5: Bump the head + flip the Task 1 baseline.** In `tests/backend/unit/test_entries_migration.py:44`, `HEAD_REVISION = "y9e4f0a2b7c8"` with a comment line naming P4. In `tests/backend/unit/test_repositories.py`, flip the Task 1 Step 2 test: rename it `test_a_blob_removed_match_takes_its_state_row_with_it`, change the surviving-orphan assertion to `session.get(MatchState, (tid, mid)) is None`, and replace the "EXPECTED TO CHANGE" paragraph with one citing this migration and judgment call 1. **This is a ruled behavior change, not test-editing-to-pass** — say so in the docstring.

- [ ] **Step 6: Run**

```
pytest tests/backend/unit/test_person_key_migration.py tests/backend/unit/test_entries_migration.py tests/backend/unit/test_repositories.py -q
pytest tests/backend -q
```
Expected: all green. Again the full sweep is required — the `match_states` cascade is now live for every fixture.

- [ ] **Step 7: Commit (models + migration + tests together — F-DM-11)**

```bash
git commit -m "feat(db): entry_player_id FK on bracket_participants + match_states composite FK (R-DM-2a, F-DM-22)" -- apps/api/src/db/models.py apps/api/src/alembic/versions/y9e4f0a2b7c8_person_key_and_match_state_fk.py tests/backend/unit/test_person_key_migration.py tests/backend/unit/test_entries_migration.py tests/backend/unit/test_repositories.py
```

---

### Task 4: The key survives every write path

The column exists; now it has to arrive and stay. Four hops, and the third is where it would silently die.

**Files:** `apps/api/src/entries/entries.py` (`_plan_bracket` :593-601) · `apps/api/src/repositories/local.py` (`_insert_participants` :734-745) · `apps/api/src/bracket/brackets.py` (hydration :794-807; persist :1010-1031, :1999-2012, :2266-2287; engine-`Participant` construction :1442-1454, :2152-2160).

**Interfaces:** the seam's insert dict gains `"entry_player_id"`; `_insert_participants` maps it to the column; the engine `Participant.metadata` carries `"entryPlayerId"` (str) between hydration and persist, **exactly as `seed` already does**; every persist dict pulls it back out and excludes it from `meta`.

- [ ] **Step 1: Write the failing tests.** In the bracket test file from Task 1 Step 3:

```python
def test_a_committed_entry_puts_the_person_key_on_its_participant(...):
    """R-DM-2(a) end to end: the commit seam knows the person
    (``entries.entry_player_id``), and now the participant row carries it as
    a constrained key instead of only as a name-derived id."""

def test_regenerating_a_draw_preserves_the_person_key_and_meta(...):
    """The flip of Task 1's characterization. ``brackets.py`` rebuilds
    participant rows FROM engine Participants on every generate and
    regenerate, so any column not lifted into ``Participant.metadata`` at
    hydration is destroyed by a regenerate. ``seed`` is the prior art for
    the lift; ``entry_player_id`` follows it, and ``meta`` — dropped
    entirely today (F-DM-09's generation half) — is carried with it."""
```

The second replaces the Task 1 Step 3 pin: rename it, invert the `meta` assertion, and add the key assertion. Cite Task 1's commit SHA in the docstring so the flip is traceable.

- [ ] **Step 2: Run and verify they fail**
```
pytest <bracket test file> -q -k "person_key or preserves_the_person_key"
```

- [ ] **Step 3: The seam emits it.** `entries/entries.py`, `_plan_bracket`'s `inserts.setdefault(...)` payload (:593-601), after `"member_ids": []`:

```python
                    # R-DM-2(a): the constrained half of the link. ``id``
                    # above is still the ``entry-{uuid}`` string and stays
                    # the PK (R-DM-7(a) — no re-key); this is the key
                    # anything joining a draw appearance to a human should
                    # use from now on.
                    "entry_player_id": entry.entry_player_id,
```

- [ ] **Step 4: The repository maps it.** `repositories/local.py`, `_insert_participants` (:734-745), after `meta=`:

```python
                entry_player_id=p.get("entry_player_id"),
```

One site serves both `bulk_create_participants` and `add_participants` — that is why the mapping lives here (the docstring at :727-731 already says so).

- [ ] **Step 5: Lift it at hydration, exactly like `seed`.** `bracket/brackets.py:798-807`, in the `metadata={...}` dict:

```python
                metadata={
                    **(dict(p.meta) if p.meta else {}),
                    **({"seed": p.seed} if p.seed is not None else {}),
                    # Columns ride in ``metadata`` between hydration and
                    # persist because the engine ``Participant`` is the only
                    # thing the generate/regenerate round trip preserves —
                    # see the three persist dicts, which rebuild rows FROM
                    # these objects. Same mechanism as ``seed``; a column
                    # not lifted here is destroyed by every regenerate.
                    **(
                        {"entryPlayerId": str(p.entry_player_id)}
                        if p.entry_player_id is not None
                        else {}
                    ),
                },
```

- [ ] **Step 6: Pull it back out at all three persist sites, and stop dropping `meta` at the two engine-`Participant` constructions.**

Persist dicts (`:1010-1031`, `:1999-2012`, `:2266-2287`) — add beside `"seed"`, and extend the `meta` comprehension's exclusion set:

```python
                "entry_player_id": (
                    uuid.UUID(p.metadata["entryPlayerId"])
                    if isinstance(p.metadata, dict) and p.metadata.get("entryPlayerId")
                    else None
                ),
                "meta": {
                    k: v
                    for k, v in (p.metadata or {}).items()
                    if k not in ("seed", "entryPlayerId")
                },
```

(`uuid` is already imported in this module — verify; the column is `Uuid`, and a bare string bind is a latent Postgres error even where SQLite tolerates it.)

At `:1999-2012` the source is `body.participants` (`ParticipantIn`), so the value comes from `p.entryPlayerId` — the field Task 5 adds. **Do this site in Task 5**, not here, and leave a `# Task 5` marker so the executor does not forget it.

Engine-`Participant` constructions (`:1442-1454`, `:2152-2160`) — `metadata=({"seed": …} if … else {})` drops everything else. Replace with the merge:

```python
            metadata={
                # F-DM-09, generation half: this construction dropped
                # ``p.meta`` outright, so every generate/regenerate erased
                # ``sourceEntryId`` — and would erase the person key the
                # same way. Characterized before the fix; see the test.
                **(dict(p.meta) if getattr(p, "meta", None) else {}),
                **({"seed": p.seed} if p.seed is not None else {}),
                **(
                    {"entryPlayerId": str(p.entry_player_id)}
                    if getattr(p, "entry_player_id", None)
                    else {}
                ),
            },
```

At `:1442-1454` the source is `ev.participants` (`ParticipantIn` — no `meta`, no `entry_player_id` until Task 5), which is why `getattr` guards are used rather than attribute access. Task 5 gives that path its field.

- [ ] **Step 7: Run**
```
pytest <bracket test file> tests/backend/unit/test_entries_commit_seam.py -q
pytest tests/backend -q
```
Expected: the two new tests pass; nothing else moves. If a test asserted `meta == {}` after a generate, it was pinning F-DM-09 — flip it with a docstring citing this task, and **report it** in the ledger.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(bracket): the person key survives commit, hydrate, generate and regenerate (R-DM-2a, F-DM-09 generation half)" -- apps/api/src/entries/entries.py apps/api/src/repositories/local.py apps/api/src/bracket/brackets.py <bracket test file>
```

---

### Task 5: The wire — `ParticipantOut`/`In` and both roster blob shapes

**Files:** `apps/api/src/bracket/brackets.py` (`ParticipantIn` :201-217, `ParticipantOut` :244-251, the two `ParticipantOut` call sites :1150-1158 / :1190-1198, the `:1999-2012` persist dict left over from Task 4) · `apps/api/src/core/schemas.py` (`PlayerDTO` :263, `BracketPlayerDTO` :294) · `apps/api/src/entries/entries.py` (`_plan_meet` payload :392-405, `_plan_bracket` payload :578-587) · `apps/console/src/api/dto.generated.ts` (regen) · `apps/console/src/api/dto.ts` · `apps/console/src/api/bracketDto.ts` · `apps/console/src/modules/bracket/rosterEvents.ts`.

**Interfaces:** produces wire fields `ParticipantOut.entryPlayerId`, `ParticipantOut.sourceEntryId`, `ParticipantIn.entryPlayerId`, `PlayerDTO.entryPlayerId`, `BracketPlayerDTO.entryPlayerId`.

**The `ParticipantIn` half is not optional and is not symmetry-for-its-own-sake.** `ParticipantIn` is a `StrictModel` (`extra=forbid`). The console echoes participants back through the upsert (`rosterEvents.ts::toUpsertParticipant`, and `bracketDto.ts:24-25` says so about `seed`). Adding a field to `Out` **without** `In` means the echo either 422s or has to strip the field — and stripping it erases the key on every roster edit. This is the SP-CONSOLE-4 write-echo class of bug; it is why the field goes on both.

- [ ] **Step 1: Write the failing tests.**
  - Backend, in the bracket test file: `GET` an event and assert `participants[0]["entryPlayerId"]` and `participants[0]["sourceEntryId"]` are present and correct for a committed entry (F-DM-09's exit half).
  - Backend: round-trip a `ParticipantOut` payload back through the upsert route and assert the participant row still carries `entry_player_id` — the echo test. **Note the new edge, so a reviewer does not file it as a regression:** on FK-enforced schema an upsert carrying a *fabricated* `entryPlayerId` now surfaces as a 500 (`IntegrityError`), not a 422 — the route echoes what it was given, and a key with no person behind it is a client bug failing loudly rather than a validation case. Do not add a pre-flight existence check to soften it; that is a second authority for a question the database already answers.
  - Console, `apps/console/src/modules/bracket/__tests__/rosterEvents.test.ts`: extend the `toUpsertParticipant` cases so a participant with `entryPlayerId` keeps it (and one without it still omits the key — the existing `seed: null` case is the shape to copy).
  - Console, `apps/console/src/lib/__tests__/useTournamentState.test.ts:329`: add `entryPlayerId` to the typed `committed: PlayerDTO` literal and to the `objectContaining` — proving the roster blob field survives hydrate → PUT. (No allow-list edit: `hooks/useTournamentState.ts:291` passes whole player objects.)

- [ ] **Step 2: Run and verify they fail.**

- [ ] **Step 3: Backend response + request models.** `ParticipantOut` (:251):

```python
    # F-DM-09: the Entries→Bracket provenance link lived in
    # ``bracket_participants.meta`` and reached NO layer above the table -
    # ``ParticipantOut`` dropped ``meta`` entirely, at both call sites and
    # at the generation path. These two are the exits it was missing.
    # ``entryPlayerId`` is the R-DM-2(a) key (join a draw node to a human);
    # ``sourceEntryId`` is the entry that produced it. Optional because a
    # hand-added participant has neither.
    entryPlayerId: Optional[str] = None
    sourceEntryId: Optional[str] = None
```

`ParticipantIn` (:217):

```python
    # Echoed back by the console's upsert path (``rosterEvents.ts``
    # ``toUpsertParticipant``). StrictModel forbids extras, so a field on
    # ``ParticipantOut`` that is missing here makes the echo a 422 - or, if
    # the client strips it, silently erases the key on every roster edit.
    entryPlayerId: Optional[str] = None
```

Both `ParticipantOut(...)` call sites (`:1150-1158`, `:1190-1198`) gain:

```python
                        entryPlayerId=(
                            p.metadata.get("entryPlayerId")
                            if isinstance(p.metadata, dict)
                            else None
                        ),
                        sourceEntryId=(
                            p.metadata.get("sourceEntryId")
                            if isinstance(p.metadata, dict)
                            else None
                        ),
```

The `:1999-2012` persist dict (Task 4's marker) gains `"entry_player_id": uuid.UUID(p.entryPlayerId) if p.entryPlayerId else None`, and the `:1442-1454` engine-`Participant` construction gains the `entryPlayerId` metadata key from `p.entryPlayerId`.

- [ ] **Step 4: Both roster blob shapes.** `core/schemas.py`, `PlayerDTO` after `sourceEntryId` (:263) and `BracketPlayerDTO` after `sourceEntryId` (:294), same field with a shape-appropriate comment:

```python
    # R-DM-2(a) / SP-DM-3 P4: the roster row's person key. ``sourceEntryId``
    # above points at ONE entry; this points at the HUMAN, who routinely
    # holds several. It is the same value ``entries/entries.py::roster_id``
    # encodes into ``id`` as ``entry-{uuid}`` - typed and readable here
    # instead of parsed out of a string prefix. Optional: a hand-added
    # roster player is nobody in ``entry_players``.
    #
    # ADDITIVE ONLY - no ``tournaments.data`` version bump. Bumping
    # CURRENT_TOURNAMENT_SCHEMA_VERSION would make P4-written documents
    # unreadable by a pre-P4 build (db/blob_version.py) in exchange for
    # nothing: an older reader ignores an unknown optional key.
    entryPlayerId: Optional[Identifier] = None
```

Then `entries/entries.py` writes it in both plan payloads — `_plan_meet` (:392-405) and `_plan_bracket` (:578-587), beside `"sourceEntryId"`:

```python
            "entryPlayerId": str(entry.entry_player_id) if entry.entry_player_id else None,
```

(These payloads are validated by `_valid(PlayerDTO, …)` / `_valid(BracketPlayerDTO, …)`, which is why the DTO field must land in the same commit — a `StrictModel` refuses the key otherwise and every commit becomes `INVALID_PLAYER`.)

- [ ] **Step 5: Regenerate + reconcile the console, same commit.**

```
PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api
```

Then by hand:
- `apps/console/src/api/dto.ts` — add `entryPlayerId?: string;` to `PlayerDTO` (after `sourceEntryId`, :309) and `BracketPlayerDTO` (:336), each with a short comment pointing at R-DM-2(a).
- `apps/console/src/api/bracketDto.ts` — add `entryPlayerId?: string | null;` to `Participant` (:20-27) and `entryPlayerId?: string;` to `ParticipantInput` (:29-34), with a one-liner mirroring the `seed` comment ("so an echo through the upsert preserves the person key").
- `apps/console/src/modules/bracket/rosterEvents.ts` — `toUpsertParticipant` (:150-165): carry it through with the same conditional-spread shape the `seed` line uses (`...(p.entryPlayerId != null ? { entryPlayerId: p.entryPlayerId } : {})`).

**Parity check, stated:** `dtoParity.test.ts` scans `dto.ts` only, and both sides of each pair gain the same key, so no allow-list entry is created and the cap stays 19. `ParticipantOut`/`In` and `bracketDto.ts` are not in the parity scan at all. The backend freshness oracle (`tests/backend/test_dto_generated_freshness.py`) **is** what forces the regen — it reddens on the Pydantic edit before any mirror is touched.

- [ ] **Step 6: Run everything the wire touches**

```
pytest tests/backend/test_dto_generated_freshness.py <bracket test file> tests/backend/unit/test_entries_commit_seam.py -q
npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts
npm --prefix apps/console run test:run -- src/modules/bracket/__tests__/rosterEvents.test.ts
npm --prefix apps/console run test:run -- src/lib/__tests__/useTournamentState.test.ts
npm --prefix apps/console run build
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(bracket,entries): entryPlayerId on the wire and both roster blob shapes; ParticipantOut stops dropping provenance (F-DM-09)" -- apps/api/src/bracket/brackets.py apps/api/src/core/schemas.py apps/api/src/entries/entries.py apps/console/src/api/dto.generated.ts apps/console/src/api/dto.ts apps/console/src/api/bracketDto.ts apps/console/src/modules/bracket/rosterEvents.ts <test paths>
```

---

### Task 6: Four `entry-{uuid}` derivations become one

**Files:** `apps/api/src/entries/entries.py` (`roster_id` new, `_player_id` :210-227) · `apps/api/src/entries/entries_site.py` (:88, :942) · `apps/api/src/entries/entries_me.py` (:375) · one test.

**Interfaces:** produces `entries.entries.roster_id(person_id: uuid.UUID | str) -> str`. `entries_site` and `entries_me` already import from sibling `entries.*` modules and `entries.entries` imports neither of them (`entries.py:43-68`), so a top-level import is cycle-free.

- [ ] **Step 1: Write the failing test.** In `tests/backend/unit/test_entries_commit_seam.py`:

```python
def test_the_roster_id_prefix_has_exactly_one_definition():
    """F-DM-05's deletion gate as an executable assertion, not a grep in a
    plan. The prefix was minted in one file and RE-DERIVED in three others
    (``entries_site.py`` twice, ``entries_me.py`` once), so renaming it
    silently orphaned every public player page. Read the sources and assert
    the literal appears once."""
```

Read the three modules' source with `pathlib` and assert `'"entry-' `/`f"entry-{` occurs in `entries.py` only. Cheap, and it is the gate that actually holds.

- [ ] **Step 2: Add the helper.** `entries/entries.py`, immediately above `_player_id` (:210):

```python
def roster_id(person_id) -> str:
    """The one place the ``entry-{uuid}`` roster/participant id is spelled.

    F-DM-05: this prefix was the ONLY storage link from the people spine to
    the competition spine, and it was minted here and independently
    re-derived in three other modules - so renaming it orphaned every
    public player page silently, in three directions at once.

    It survives P4 as a legacy READ path and as the participant PK
    (R-DM-7(a) forbids a re-key). What replaces it as the *identity* is
    ``bracket_participants.entry_player_id`` - a real, constrained key.
    This function is where the string dies when that day comes.
    """
    return f"entry-{person_id}"
```

`_player_id` becomes `return roster_id(entry.entry_player_id or entry.id)` — its docstring is unchanged and still explains the fallback.

- [ ] **Step 3: Route the three readers.**
- `entries_site.py:88` → `return {roster_id(pid): club for pid, club in rows}`
- `entries_site.py:942` → `roster_id_str = roster_id(person_id)` (keep the local name it already uses; only the right-hand side changes)
- `entries_me.py:375` → `resultBadge=event_badges.get(roster_id(entry.entry_player_id)),`

Each file adds `from entries.entries import roster_id` at the top with its existing `from entries…` imports.

- [ ] **Step 4: Run + the gate**

```
pytest tests/backend/unit/test_entries_commit_seam.py tests/backend/test_entries_site.py -q   # adjust the second path to what exists
rg '"entry-|f"entry-\{' apps/api/src apps/console/src apps/entrant/app
```
Expected: exactly **one** hit, inside `roster_id`. (`entries_site.py:76`'s docstring mentions the shape in prose — that is documentation, not a derivation; leave it, and note it in the ledger so a future reader of the gate is not surprised by a doc-only match.)

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(entries): one roster_id() authority for the entry-{uuid} prefix (F-DM-05)" -- apps/api/src/entries/entries.py apps/api/src/entries/entries_site.py apps/api/src/entries/entries_me.py tests/backend/unit/test_entries_commit_seam.py
```

---

### Task 7: The two carried P3 pickups (b) and (c)

**Files:** `apps/api/src/entries/partner_routes.py` (`preview_partner_invite` :190-210) · `apps/api/src/entries/partners.py` (`accept()` :177-264) · `tests/backend/test_partner_invites.py`.

**(c) is a debt-log row P4 owns** (`docs/reference/debt-log.md`, the "Partner acceptance raises no `needs_review_person`" bullet): P3's advisory never fires on the invite path because `accept()` calls `adopt_or_mint` without ever asking `has_unresolvable_namesake`. **(b)** is an `askBirthYear` parity drift — `partner_routes.py:196-199` computes over **all** the workspace's events, `apps/entrant/app/routes/enter.tsx:377` over **open** ones — and the `True` branch of the partner preview has no test at all. One age-bracketed fixture closes both.

- [ ] **Step 1: Write the failing tests.** In `tests/backend/test_partner_invites.py`:

```python
def test_an_unresolvable_namesake_flags_the_accepted_entry(client, world, mailbox):
    """Carried from SP-DM-3 P3 (debt-log; ruled P4's to close). The entry
    form flags a year-less collision with an existing namesake under the
    same account; acceptance through an invite reached the same
    ``adopt_or_mint`` and never asked. Same fork, one path silent."""

def test_the_preview_asks_for_a_birth_year_only_when_an_OPEN_event_is_age_bracketed(
    client, world, mailbox
):
    """Carried from SP-DM-3 P3 (ledger): the preview computed over ALL
    events while the entry page computes over OPEN ones, so an invite could
    ask for a year the nominator's own form never collected - or, worse,
    not ask where the form did. The entry page is the authority: it is the
    surface that collects the field (R12 posture unchanged - the field
    appears only where the page already asks).

    This is also the FIRST test of the true branch; the shipped
    ``askBirthYear`` had coverage on the False side only."""
```

The second needs a fixture with an age-bracketed event — check whether `world` already has one (`rg "age_bracket" tests/backend/test_partner_invites.py tests/backend/conftest.py`); if not, add the smallest local fixture that sets the flag, and assert **both** branches (age-bracketed + open → `True`; age-bracketed but closed → `False`).

- [ ] **Step 2: Run and verify they fail.**

- [ ] **Step 3: (c) — route acceptance through the namesake check.** In `partners.py::accept()`, after the `adopt_or_mint` call (:213-222):

```python
    from entries.submissions import has_unresolvable_namesake

    if not adopted and has_unresolvable_namesake(
        session, entry.tournament_id, account_id, spec, exclude_id=partner_player.id
    ):
        # Mirrors ``submissions._write``: the fork is flagged, never
        # merged (I4). Carried from P3, where the entry-form path got this
        # and the invite path did not - the same two rows arriving by a
        # different door were silent.
        reasons = list(partner_submission_entry.pending_reasons or [])
        if NEEDS_REVIEW_PERSON not in reasons:
            partner_submission_entry.pending_reasons = [*reasons, NEEDS_REVIEW_PERSON]
```

Capture `adopted` from `adopt_or_mint`'s tuple (currently discarded as `_` at :213) and hoist the `PlayerInput` into a named `spec` so both calls share it. Re-anchor the entry variable name to whatever `accept()` actually calls the newly-created entry. Import `NEEDS_REVIEW_PERSON` from `entries.entry_policy` at module top (no cycle — `entry_policy` imports nothing from `partners`).

- [ ] **Step 4: (b) — align `askBirthYear` to the entry page's rule.** In `partner_routes.py:196-199`, filter to open events using the same predicate `entries_public` uses for the entry page (`rg "open|is_open" apps/api/src/entries/entries_public.py` — reuse the existing helper, do **not** re-implement the window comparison), and add:

```python
    # Parity with the entry page (apps/entrant/app/routes/enter.tsx:377),
    # which asks over OPEN events only. The page is the authority: it is
    # the surface that collects the year, and an invite that asks for one
    # the nominator's own form never collected is a question with no
    # answer behind it. Carried from SP-DM-3 P3.
```

- [ ] **Step 5: Run**
```
pytest tests/backend/test_partner_invites.py tests/backend/unit/test_submission_service.py -q
```

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(entries): partner acceptance flags an unresolvable namesake; askBirthYear matches the entry page (SP-DM-3 P3 carry-forward)" -- apps/api/src/entries/partners.py apps/api/src/entries/partner_routes.py tests/backend/test_partner_invites.py
```

---

### Task 8: Deletion gates, registry correction, full gate, ledger

- [ ] **Step 1: Correct three `BLOB_VERSIONS` attributions.** `apps/api/src/db/blob_version.py:126-129`: `bracket_matches.side_a` / `side_b` say "P4" and `dependencies` says "P4/P6". P4 reshapes none of them (see "Pickup (d)"). Change to `P6` and `P6` respectively, and extend the file's `None`-family note with one line: *"P4 added `bracket_participants.entry_player_id` as a real COLUMN, not a blob key — the roster shapes it typed live inside `tournaments.data`, which is already versioned, and the field is additive so no bump was taken."* Comment-only; no behavior.

- [ ] **Step 2: The card's deletion gates**

```
rg '"entry-|f"entry-\{' apps/api/src apps/console/src apps/entrant/app
```
Expected: **one** hit — `entries/entries.py::roster_id`. (Plus the prose docstring at `entries_site.py:76`, which is not a derivation; if the pattern catches it, say so rather than editing prose to satisfy a grep.)

```
rg "committed_player_id" apps/api/src
```
Expected: the writer (`entries/entries.py`), the model, the migrations, and the read-only lifecycle/facts consumers — **no new derivation site**. The card's "writer + migration only" is the *end* state after R-DM-2(c) retires the column; P4 does not delete it and must not pretend to.

```
rg "entryPlayerId" apps/console/src --glob '!**/dto.generated.ts'
```
Expected: non-zero — `dto.ts` ×2, `bracketDto.ts` ×2, `rosterEvents.ts`, and the tests.

- [ ] **Step 3: The four negative controls, run as a set**

```
pytest tests/backend/unit/test_person_key_migration.py tests/backend/unit/test_entries_commit_seam.py tests/backend/unit/test_repositories.py <bracket test file> -q
```
NC 1 = dangling `entry_player_id` → `IntegrityError` on migration-built schema (Task 3). NC 2 = the crash window still adopts (Task 1, unchanged by the slice — re-run is the proof). NC 3 = a blob-removed match id still deletes its `matches` row, and now takes its state row (Task 3 Step 5). NC 4 = deleting a tournament with a person-keyed participant still succeeds, and deleting the person deletes the participant (Task 3 Step 1 — the cascade-order control).

- [ ] **Step 4: Full gate**

```
make check
```
Expected: green across both tiers (console lint/types/vitest/depcruise, entrant lint/types/vitest/depcruise, ruff, import-linter **15 kept 0 broken**, pytest). The `docs:freshness` step is advisory and never fails the gate. If something is red, fix it; if you believe it is pre-existing, prove that by running the same gate on a `main` worktree or reading CI — **never** with `git stash`.

- [ ] **Step 5: Ledger.** Append a P4 section to `docs/history/programs/DM3_PROGRESS.md` in the shape the P1/P2 entries use. It must state: the commit SHAs; that four `entry-` sites existed rather than three; that Task 2 carried no migration and why; the `match_states` CASCADE behavior change with the characterization SHA; the CASCADE on the participant FK and the result of the account-deletion grep (judgment call 7); that no backfill and no `tournaments.data` version bump were taken; that the allow-list cap stayed 19; every deviation from this plan; new debt rows; and the next-slice note. **P4 unblocks P6 and the two deferred SP-P7 items (highlight-player). The R-DM-2(c) Meet-roster extraction is now due as its own program.** Add or update debt rows for anything found and not fixed (D22 — `gender` on adoption — is explicitly *revisit with P4/P8*; if P4 did not rule it, say so).

- [ ] **Step 6: Commit the ledger, then stop**

```bash
git commit -m "docs: SP-DM-3 ledger - P4 slice landed" -- docs/history/programs/DM3_PROGRESS.md docs/reference/debt-log.md
```

Merging `dm3/p4-person-key` is Kyle's call (superpowers:finishing-a-development-branch). **Do not start P5 or P6 in the same session.**

---

## Self-review record (plan author, 2026-08-25)

- **Card coverage.** §C4's five code moves map to tasks: `entry_player_id` + composite FK → T3; typed `entryPlayerId` on both roster blob shapes → T5; the two missing R13 FKs → T2; `match_states.__table_args__` → T3; the `entry-{uuid}` collapse → T6; `ParticipantOut` provenance → T5. The three NCs map to T3 Step 1 (NC 1, NC 3) and T1 Step 1 (NC 2, characterized before touching, as the card demands). The deletion gate is T8 Step 2. The R-DM-2(c) follow-on is named as out of scope in the header and again in the ledger step.
- **Carried pickups.** (a) → T1 Step 4. (b) → T7 Step 4. (c) → T7 Step 3. (d) → answered in a dedicated section (no `BLOB_VERSIONS` flip, no version bump, the P2 test is already tightened) with the one owed correction at T8 Step 1. (e) → recorded in its own section; nothing built.
- **Ruled constraints honoured.** R2 (no `entry_events.bracket_event_id` FK) is restated in Global Constraints as a do-not-touch. R-DM-7(a) (no re-key) is restated three times, because Task 3 is exactly where somebody would be tempted. ADR 0006 and the `bracket_matches` blob columns are untouched.
- **F-DM-11 discipline.** T3 lands `models.py` + migration + NCs in one commit; its NC runs against **migration-built** schema via the `alembic_cfg` fixture copied from `test_entries_migration.py`, and asserts `PRAGMA foreign_keys == 1` first, because SQLite defaults it off per connection and `db/session.py`'s Engine-class listener makes its state depend on import order — without that assertion the NC can pass vacuously. T2 is the deliberate models-only exception and says why in its own commit message; it also closes the finding's deeper half by making the drift test compare **constraints**, which is what let this drift live.
- **Type consistency.** `entry_player_id` is `Uuid` on the column, `str` inside `Participant.metadata` (JSON has no UUID), converted back with `uuid.UUID(...)` at all three persist sites, and `Optional[str]`/`Optional[Identifier]` on every wire shape. `roster_id` takes a UUID-or-str and returns `str`. `has_unresolvable_namesake`'s signature in T7 matches the shipped one at `submissions.py:322-329` exactly (`exclude_id` keyword).
- **Known judgment calls, flagged not hidden.** Seven, listed up front: forced CASCADE on `match_states` (a real behavior change, characterized first), no invented index, no backfill, no blob version bump, `MatchStateDTO` allow-list untouched, `askBirthYear` aligns to the entry page, and CASCADE on the participant FK with its blast radius argued and an executor verification step attached.
- **A first draft of this plan specified `SET NULL` on the participant FK; review killed it.** SQLite and portable Postgres apply `SET NULL` to every referencing column, so a composite FK whose leading column is a `NOT NULL` primary-key column cannot use it — and the failure would have landed on tournament deletion, not on the new feature. Recorded because the reasoning ("deleting a person should not delete their draw appearance") is *good policy that the schema shape does not permit*, and the next person to reach for it deserves the counter-argument. NC 4 is the empirical guard that would have caught it.
- **Tree-vs-card contradictions.** Four `entry-` sites not three; F-DM-11's migration half already exists; the generation path drops `meta` outright today (so F-DM-09 is worse than "dropped at exits" — every regenerate erases it); the console roster echo needs no allow-list edit because `useTournamentState.ts:291` passes whole player objects. All four are in "What the tree says that the card does not".
- **Riskiest step, named.** T2 Step 3's full-suite sweep: turning on two FKs in `create_all` can redden any fixture that wrote a made-up parent id. The plan states the only acceptable fix (give it a real parent) and forbids the tempting one (drop the constraint). T4 Step 6 is second — three near-identical persist dicts, and missing one loses the key on exactly one code path.
- **Line numbers** anchor to `9f423053`; executors re-anchor by symbol.
