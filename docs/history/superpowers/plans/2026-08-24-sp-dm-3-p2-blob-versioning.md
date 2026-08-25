# SP-DM-3 · P2 — JSON-blob version discipline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** **24 JSON blob columns, one versioned — and that one versioned three incompatible ways** (F-DM-06). Every blob holding a domain concept (pair `member_ids`, draw `slot_a`/`dependencies`, result `score`, entry `pending_reasons`, money `fee_basis`) is an untyped, unversioned dict a future reader has no way to date. P2 installs the **mechanism** — in-blob version, absent ⇒ v1, stamped on write, a newer-than-known read **raises** — plus the **ratchet** that makes any *new* JSON column declare itself. **No Alembic migration. No backfill.** Versions are lazily stamped on the next write of each row.

**Ruled by:** **R-DM-8 option (a)** (`docs/history/programs/DM1_RULINGS.md:100-111`), verbatim: *"A `v` int inside each blob, absent ⇒ v1, stamped on next write; one read/write helper per blob column at the repository boundary. `tournaments.data`'s three schemes reconcile per the plan's sub-answer: `state_version` untouched (I8 concurrency token, not a schema version), `data["version"]` = schema version, `schema_version` documented as row-format version, one accessor."*

Resolves `F-DM-06` (23 of 24 unversioned), `F-DM-39` (the keyless whole-blob DTO — addressed as *documentation*, see "What P2 does NOT do"), `F-DM-53` (`non-scheduling-keys.json` has no `$schema`, no version, and a path-counting reader).

**Branch (controller ruling, 2026-08-24):** `dm3/p2-blob-versioning` off **`main` @ `fdc12db2`** — no stacking. P3, P0 and P1 are all merged to `main`; P2 consumes nothing they produced (it touches no response model and no DTO), so there is no branch to stack on.

```bash
git checkout main && git pull --ff-only && git checkout -b dm3/p2-blob-versioning
```

**Spec pointers:**
- Program card **§C2**: `docs/history/superpowers/plans/2026-08-24-sp-dm-3-domain-unification-program.md:49-50`.
- Design doc **P2 phase text**: `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md:123-130`.
- Ruling **R-DM-8**: `docs/history/programs/DM1_RULINGS.md:100-111`.
- Audit findings: `docs/history/audits/2026-08-24-domain-model-audit.md:453` (F-DM-06), `:492` (F-DM-39), `:511` (F-DM-53), `:572` (debt-log L1 carry-forward).
- **The full blob inventory** (24 columns, one row each, with `models.py` line and "does it hold a domain concept"): `.superpowers/sdd/2026-08-24-sp-dm-1-domain-model-audit/census-2a.md:157-192`. Task 1's registry is that table transcribed into code; re-derive from `models.py` and cross-check against it.
- Debt-log **D23** (`docs/reference/debt-log.md`, "the entrant tier's standings row is hand-written by necessity") names `packages/shared-contract/` as the candidate home for types both tiers may read, and says *"P2 is about to touch its versioning"* — that is why Task 4 makes it a real workspace package rather than aliasing a path.

---

## Global Constraints

These bind P2 exactly as they bind every phase (program plan `:13-22`):

- **No phase re-decides anything ruled.** No FK anywhere in this slice (R2); no match-record merge or shared match/score value object (ADR 0006) — relevant because `bracket_results.score` is one of the 24 registry rows and "while I'm here" is exactly how ADR 0006 gets violated; no rename of `tournaments`/`tournament_id`/`tournamentStore` (ADR 0014); the 2026-08-23 minting rule is untouched.
- **The F-DM-11 test-schema trap does not apply** — this slice adds no FK and no migration. Noted so a later reader does not go looking. (`Base.metadata.create_all` *is* used by the inventory test in Task 3, but only to enumerate column types, never to assert a constraint.)
- Backend list queries: stable tiebreaker `created_at DESC, id DESC` — not touched here.
- Commits are **path-limited** (`git commit -- <paths>`); never `git add .`.
- Gate before claiming done: the specific suite for the change, then `make check` at slice end.
- **No `make generate-api` in this slice.** P2 changes no Pydantic response model, no route signature and no DTO — the only wire-adjacent artifact it touches is a *comment* (Task 5). If a step ever forces a schema change, **stop and report**; it means the design drifted. Noted explicitly so a later reader does not go looking for the regen step P0/P1/P3 all carried.
- **Behavior preservation is the hard constraint.** Existing blobs keep working (absent `v` ⇒ 1). No reader breaks on a stamped write. The empty-dict NC in Task 2 is the specific place this is most likely to break — read it before writing the decorator.

---

## Design — read before Task 1

R-DM-8(a) asks for *"one read/write helper per blob column at the repository boundary."* Taken literally that is 24 hand-written function pairs plus a rewrite of ~20 raw `row.data` read sites across 8 modules. This plan implements the same semantics with **one 60-line module**, and the deviation is deliberate and flagged:

**The helper is a SQLAlchemy `TypeDecorator`, not a function pair.** `VersionedJSON` wraps the portable `JSON` type. `process_bind_param` stamps the version on every write; `process_result_value` raises on every read of a blob newer than the code. Declaring a column `VersionedJSON(2, "version")` instead of `JSON` puts the guard **at the ORM boundary — strictly tighter than the repository boundary** — and costs **zero call-site changes**. Every existing `tournament.data` read in `bracket/`, `display/`, `entries/`, `meet/`, `workspaces/` is guarded the moment the column type changes, without any of those files being edited. It emits the same SQL and the same column DDL, so **there is no migration**.

**Only `tournaments.data` is wired in this slice.** The other 23 columns get a **registry entry**, not a decorator. Two reasons, both concrete:

1. **Six of the 24 are JSON *lists*** (`bracket_participants.member_ids`, `bracket_matches.side_a`/`side_b`/`dependencies`/`child_unit_ids`, `entries.pending_reasons`). A list has nowhere to put a `v` key. Versioning them means *reshaping* them — which is a wire and storage change, i.e. exactly the work P4 and P5 are chartered to do. Doing it here would be P2 pre-empting two later phases.
2. **Several of the dict-shaped ones round-trip somewhere an extra key is not free**: `solve_jobs.params` is the *pinned determinism* input, `workspace_modules.config` carries the Display `tv*` layout straight to the console, `bracket_participants.meta` is documented "arbitrary round-trip", `submissions.fee_basis` is money provenance kept for disputes. Stamping those blind is a behavior change dressed as a mechanism.

So the deliverable is the **mechanism plus the ratchet** — which is what the design doc itself says: *"the mechanism, not the migration, is the deliverable"* (`:128`). The registry's `None` entries are the visible, enumerable list of blobs still unversioned, each with a one-line reason; the phase that reshapes a blob flips its own entry from `None` to `1` and changes its own column to `VersionedJSON`. The inventory test (Task 3) fails on any *new* JSON column that is in neither state.

### What P2 does NOT do

- **No migration, no backfill.** A row keeps its stored blob until something writes it.
- **`state_version` is not touched.** It is the I8 optimistic-concurrency token (`models.py:142`, `repositories/local.py:261`), not a schema version. Task 2 ships a test pinning that the two coexist and move independently.
- **`schema_version` is not dropped.** It is the row-format mirror that lets Alembic-level queries reason without parsing the blob (`models.py:130-132`). R-DM-8 rules it *documented*, not removed.
- **F-DM-39** (`TournamentStateDTO` silently drops undeclared sections) is resolved by **documentation**, not by making the DTO lossless — a lossless wire type is a P7-scale change. The reconciled comment in Task 2 Step 5 is the resolution.
- **debt-log L1's blob-PII half** (the retention job does not reach names inside workspace state blobs) is **recorded, not fixed** — Task 6 Step 4. It is an L-sized GDPR item, not a versioning item.
- **The design doc's deletion gate as written** — *"`rg '\.data\["|json\.loads\(' apps/api/src` finds no domain-blob access outside the helpers"* — is **unreachable under this design and is re-scoped**, deliberately: with the guard at the ORM boundary a raw `row.data["players"]` read is *correct*, because the version check already ran at load time. Task 6 Step 1 substitutes the gate that actually measures this design: the inventory ratchet is green and the registry accounts for all 24 columns.

---

## File map

**New:**
- `apps/api/src/db/blob_version.py` — `BlobVersionError`, `VersionedJSON`, `BLOB_VERSIONS`, `CURRENT_TOURNAMENT_SCHEMA_VERSION` (relocated).
- `tests/backend/unit/test_blob_version.py` — the mechanism's own unit tests (NC 1).
- `tests/backend/unit/test_blob_version_inventory.py` — the ratchet (NC 2).
- `packages/shared-contract/package.json` — makes the directory a real npm workspace (`packages/*` is already a workspace glob, root `package.json:6-10`).
- `packages/shared-contract/non-scheduling-keys.schema.json` — so `$schema` points at something real.

**Modified:**
- `apps/api/src/db/models.py` — `tournaments.data` column type (`:129`); the four-way-collision comment (`:130-142`).
- `apps/api/src/repositories/local.py` — `CURRENT_TOURNAMENT_SCHEMA_VERSION` becomes an import (`:87`).
- `apps/api/src/workspaces/config_lock.py` — reads the new object shape + the version guard (`:38-42`).
- `apps/api/src/display/display.py` — the `/state` decorator comment only (`:204-209`), P1 pickup rider.
- `apps/console/src/store/__tests__/nonSchedulingKeys.parity.test.ts` — stops counting `../` levels (`:12-18`).
- `packages/shared-contract/non-scheduling-keys.json` — array → `{$schema, version, keys}`.
- `apps/console/package.json` (+ root `package-lock.json`) — the workspace dependency.
- `tests/backend/unit/test_repositories.py` — coexistence + empty-dict NCs.
- `docs/reference/debt-log.md`, `docs/history/programs/DM3_PROGRESS.md` — carry-forward + ledger.

**Line anchors are as of `fdc12db2`.** Re-anchor by symbol, not by line, if the tree has moved.

## Run commands (this repo)

```bash
# backend, from the repo root with the repo .venv active
pytest tests/backend/unit/test_blob_version.py -x -q
pytest tests/backend/unit/test_blob_version_inventory.py -x -q
pytest tests/backend/unit/test_repositories.py tests/backend/unit/test_config_lock.py -q
# console
npm --prefix apps/console run test:run -- src/store/__tests__/nonSchedulingKeys.parity.test.ts
npm --prefix apps/console run build          # tsc -b type gate
# slice end
make check
```

---

### Task 1: The mechanism and the registry

**Files:**
- Create: `apps/api/src/db/blob_version.py`
- Create: `tests/backend/unit/test_blob_version.py`
- Modify: `apps/api/src/repositories/local.py` (`:87` — the constant relocates)

**Interfaces:**
- Consumes: `sqlalchemy.JSON`, `sqlalchemy.types.TypeDecorator`. Nothing else — this module sits at the bottom of the import graph and **must not import any domain package** (the `.importlinter` persistence-direction contract, `apps/api/.importlinter:69,92`).
- Produces: `db.blob_version.VersionedJSON(version: int, version_key: str = "v")`; `db.blob_version.BlobVersionError`; `db.blob_version.BLOB_VERSIONS: dict[str, int | None]`; `db.blob_version.CURRENT_TOURNAMENT_SCHEMA_VERSION: int = 2`. Tasks 2 and 3 rely on all four by those exact names.
- **Direction note:** `CURRENT_TOURNAMENT_SCHEMA_VERSION` lives in `repositories/local.py:87` today and `ops/health.py:66` imports it *from there*. `db` may not import `repositories`, and `models.py` (in `db`) now needs the number — so the constant **moves down** into `db/blob_version.py` and `local.py` imports it. Because `local.py` still binds the name, `ops/health.py`'s import keeps working untouched. **Do not edit `ops/health.py`.**

- [ ] **Step 1: Write the failing tests** — create `tests/backend/unit/test_blob_version.py`:

```python
"""Unit tests for the blob-version mechanism (R-DM-8a, SP-DM-3 P2).

These test the TypeDecorator in isolation - Task 2's tests exercise it
through a real ``tournaments`` row. Both matter: this file pins the rule,
that file pins the wiring.
"""
from __future__ import annotations

import pytest

from db.blob_version import BlobVersionError, VersionedJSON


def test_an_absent_version_reads_as_v1():
    """R-DM-8(a): 'absent => v1'. Every blob in the database today is in
    this state, so this is the compatibility promise the whole no-backfill
    decision rests on."""
    t = VersionedJSON(3, "v")
    assert t.process_result_value({"players": []}, None) == {"players": []}


def test_a_write_stamps_the_current_version():
    t = VersionedJSON(3, "v")
    assert t.process_bind_param({"players": []}, None) == {"players": [], "v": 3}


def test_a_newer_blob_raises_rather_than_mis_parsing():
    """NC 1: v2-read-by-v1 raises. The failure mode this replaces is
    silent - v1 code reading a v2 blob today gets whatever ``.get()``
    returns for a key that moved, and writes the misread back."""
    t = VersionedJSON(1, "v")
    with pytest.raises(BlobVersionError) as exc:
        t.process_result_value({"v": 2}, None)
    # The message has to name the column-less facts an operator can act on.
    assert "2" in str(exc.value) and "1" in str(exc.value)


def test_an_older_blob_is_readable():
    """Older is fine - that is what 'lazily stamped on next write' means."""
    t = VersionedJSON(3, "v")
    assert t.process_result_value({"v": 1}, None) == {"v": 1}


def test_an_empty_dict_is_left_alone_on_both_sides():
    """A freshly created workspace stores ``data={}``, and FOUR call sites
    read that emptiness as 'no state yet' (``display/display.py``'s 204,
    ``workspaces/tournaments.py``'s empty-state branch, and the two
    snapshot-worthiness checks in ``repositories/local.py``). Stamping
    ``{}`` into ``{"v": N}`` makes it truthy and flips all four. The
    version means nothing on an empty document anyway."""
    t = VersionedJSON(2, "version")
    assert t.process_bind_param({}, None) == {}
    assert t.process_result_value({}, None) == {}


def test_non_dict_values_pass_through_untouched():
    """List-shaped blobs have nowhere to put a version key. Passing them
    through is what lets a column be registered before it is reshaped -
    see BLOB_VERSIONS' None entries."""
    t = VersionedJSON(2, "v")
    assert t.process_bind_param(["a"], None) == ["a"]
    assert t.process_result_value(None, None) is None
```

- [ ] **Step 2: Run and verify they fail**

Run: `pytest tests/backend/unit/test_blob_version.py -q`
Expected: collection error — `ModuleNotFoundError: No module named 'db.blob_version'`. That is the correct red for a module that does not exist yet.

- [ ] **Step 3: Write the module** — create `apps/api/src/db/blob_version.py`:

```python
"""Version discipline for the JSON blob columns (R-DM-8(a), SP-DM-3 P2).

F-DM-06: 24 JSON columns, one versioned, and that one versioned three
incompatible ways. A blob with no version is a document nobody can date -
the reader guesses, and a reshape has no safe rollout.

**The rule** (ruled 2026-08-24, ``DM1_RULINGS.md:100-111``): a version int
lives INSIDE the blob; **absent means 1**; a write stamps the current
version; a read of a blob NEWER than the code raises rather than
mis-parsing. No migration and no backfill - every existing row is "absent
=> 1" and gets stamped whenever it is next written.

**Why a TypeDecorator and not a function pair.** The ruling says "one
read/write helper per blob column at the repository boundary". A type
decorator is that helper, declared once on the column, and it binds
*tighter*: every read anywhere in the app - including the ~20 raw
``tournament.data`` reads across bracket/, display/, entries/, meet/ and
workspaces/ - passes through ``process_result_value`` at load time, with
no call site edited and no chance of a new call site forgetting. It emits
the same SQL and the same DDL as bare ``JSON``, so switching a column to
it needs no Alembic revision.

**Empty dicts are never stamped.** A fresh workspace stores ``data={}``
and four call sites read that emptiness as "no state yet"; a stamped
``{"version": 2}`` is truthy and would flip all four. An empty document
has no schema to version.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import JSON
from sqlalchemy.types import TypeDecorator

# The schema version of the ``tournaments.data`` document. Relocated here
# from ``repositories/local.py`` because ``db`` may not import
# ``repositories`` (the persistence-direction contract) and ``models.py``
# now needs the number to declare the column. ``local.py`` imports it and
# so keeps the name bound - ``ops/health.py`` still reads it from there.
CURRENT_TOURNAMENT_SCHEMA_VERSION = 2


class BlobVersionError(RuntimeError):
    """A stored blob is newer than the code trying to read it.

    Deliberately fatal. The alternative - parse it anyway - is the exact
    silent mis-read this mechanism exists to prevent, and on a
    single-store product an operator seeing a loud error has a real
    remedy (restore a snapshot, or run the newer build).
    """


class VersionedJSON(TypeDecorator):
    """``JSON`` that carries and enforces an in-blob schema version.

    ``version_key`` is ``"v"`` for every column P2 registers except
    ``tournaments.data``, which already spells it ``"version"`` and keeps
    that spelling - renaming a key that ships on the wire in
    ``TournamentStateDTO`` would be a behavior change, not a mechanism.
    """

    impl = JSON
    cache_ok = True

    def __init__(self, version: int, version_key: str = "v", **kwargs) -> None:
        # Attribute names must match the constructor parameter names:
        # ``cache_ok = True`` lets SQLAlchemy build this type's cache key
        # by reading them back off the instance.
        self.version = version
        self.version_key = version_key
        super().__init__(**kwargs)

    def process_bind_param(self, value, dialect):
        if isinstance(value, dict) and value:
            return {**value, self.version_key: self.version}
        return value

    def process_result_value(self, value, dialect):
        if isinstance(value, dict) and value:
            stored = value.get(self.version_key, 1)
            if isinstance(stored, int) and stored > self.version:
                raise BlobVersionError(
                    f"stored blob is version {stored}; this build reads at "
                    f"most {self.version}. Refusing to parse it - run the "
                    f"newer build, or restore a snapshot taken before the "
                    f"upgrade."
                )
        return value


# ---------------------------------------------------------------------
# The inventory. Every JSON column in ``db/models.py`` appears here
# exactly once; ``tests/backend/unit/test_blob_version_inventory.py``
# fails if one is missing, which is the whole ratchet.
#
#   int  -> versioned; the column is declared ``VersionedJSON(that int)``
#   None -> registered, NOT yet versioned, with the reason on the line
#
# A ``None`` is not an oversight - it is an enumerated debt, and the
# phase that reshapes the blob flips it. Two families are None today:
# LIST-SHAPED blobs (nowhere to put a key without reshaping the value -
# P4/P5 work) and ROUND-TRIP-SENSITIVE blobs (an extra key reaches a
# consumer that did not ask for it).
#
# Recorded edge, not fixed: ``tournament_backups.snapshot`` is a frozen
# copy of ``tournaments.data`` stored in a plain ``JSON`` column, so it is
# unguarded on read, and restoring it writes it back through
# ``upsert_data`` - which re-stamps it at the CURRENT version. A snapshot
# taken by a future build therefore restores silently instead of raising.
# Versioning the snapshot column closes it; nothing in P2 needs it.
# ---------------------------------------------------------------------
BLOB_VERSIONS: dict[str, Optional[int]] = {
    # -- versioned ----------------------------------------------------
    "tournaments.data": CURRENT_TOURNAMENT_SCHEMA_VERSION,  # models.py:129
    # -- list-shaped: needs a reshape, owned by a later phase ----------
    "bracket_participants.member_ids": None,  # :472 - Pair membership; P5 reshapes
    "bracket_matches.side_a": None,  # :519 - resolved participants; P4
    "bracket_matches.side_b": None,  # :520 - same
    "bracket_matches.dependencies": None,  # :521 - draw topology; P4/P6
    "bracket_matches.child_unit_ids": None,  # :526 - draw topology
    "entries.pending_reasons": None,  # :1501 - entry lifecycle state (list of codes)
    # -- round-trip-sensitive: an extra key would reach a consumer -----
    "solve_jobs.params": None,  # :857 - PINNED determinism input; do not perturb
    "solve_jobs.input_snapshot": None,  # :859 - solver input, hashed alongside params
    "workspace_modules.config": None,  # :775 - Display tv* layout, goes to the console
    "bracket_participants.meta": None,  # :474 - documented "arbitrary round-trip"
    "bracket_matches.meta": None,  # :527 - same
    "submissions.fee_basis": None,  # :1275 - money provenance kept for disputes
    "bracket_results.score": None,  # :572 - Result; ADR 0006 forbids reshaping it here
    # -- not yet needed by any phase -----------------------------------
    "tournament_backups.snapshot": None,  # :317 - see the recorded edge above
    "commands.payload": None,  # :243 - operator command args
    "bracket_events.config": None,  # :435 - per-draw format knobs (SP-P11)
    "bracket_matches.slot_a": None,  # :517 - draw slot pointers; P4
    "bracket_matches.slot_b": None,  # :518 - same
    "solve_jobs.result": None,  # :863 - ScheduleDTO
    "solve_jobs.error": None,  # :864 - {code,message,detail}
    "solve_jobs.progress": None,  # :867 - live phase/objective
    "entry_pages.fee_schedule": None,  # :1688 - cumulative price ladder
    "entry_pages.discipline_caps": None,  # :1701 - entry policy
}
```

**Cross-check before moving on:** the census table (`census-2a.md:157-192`) lists 24 rows. `len(BLOB_VERSIONS)` must be 24 and Task 3's test proves it against the live metadata, not against the census.

- [ ] **Step 4: Relocate the constant** — in `apps/api/src/repositories/local.py`, delete line 87 (`CURRENT_TOURNAMENT_SCHEMA_VERSION = 2`) and add to the import block near `from db.session import SessionLocal` (`:80`):

```python
# Relocated to ``db`` in SP-DM-3 P2 so ``models.py`` can declare the
# column with it; re-bound here because ``ops/health.py`` imports the
# name from this module and there is no reason to churn that.
from db.blob_version import CURRENT_TOURNAMENT_SCHEMA_VERSION
```

Leave `_stamp_payload` (`:124-133`) exactly as it is — it also sets `updatedAt` and strips the legacy `_integrity` field, so it is not redundant with the decorator; the decorator is the backstop for writers that do not go through it.

- [ ] **Step 5: Run the unit tests + the import contracts**

Run: `pytest tests/backend/unit/test_blob_version.py -q`
Expected: all six PASS.

Run: `cd apps/api/src && lint-imports --config ../.importlinter`
Expected: green. `db/blob_version.py` imports only SQLAlchemy; if this reds, the module imported a domain package by accident.

Run: `ruff check apps/api`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
# `git add` first: two of these paths are NEW, and `git commit -- <path>`
# errors on a pathspec that matches nothing tracked.
git add apps/api/src/db/blob_version.py apps/api/src/repositories/local.py tests/backend/unit/test_blob_version.py
git commit -m "feat(db): in-blob version mechanism + the 24-column registry (R-DM-8a)" -- apps/api/src/db/blob_version.py apps/api/src/repositories/local.py tests/backend/unit/test_blob_version.py
```

---

### Task 2: Wire `tournaments.data`, and reconcile the three schemes

**Files:**
- Modify: `apps/api/src/db/models.py` (the `data` column `:129`; the collision comment `:130-142`)
- Test: `tests/backend/unit/test_repositories.py` (append to the Tournament section)

**Interfaces:**
- Consumes: `VersionedJSON`, `BlobVersionError`, `CURRENT_TOURNAMENT_SCHEMA_VERSION` from Task 1.
- Produces: no new symbol. `tournaments.data` reads and writes are guarded; every existing call site is unchanged.
- **The behavior contract:** `_stamp_payload` already writes `"version": 2` into the document on every `upsert_data` (`local.py:124-133,237`), so for the normal write path the decorator changes **nothing observable**. What is new is (a) the *read* guard, which now covers writers that bypass `upsert_data`, and (b) `row.data` assignments made anywhere else.

- [ ] **Step 1: Write the failing tests** — append to `tests/backend/unit/test_repositories.py`. **Note the `text()` planting trick in the third test** — a bind processor also runs on Core `update()`, so a future-version blob cannot be planted through SQLAlchemy's typed path; it would be re-stamped to 2 on the way in and the read guard could never fire:

```python
def test_state_version_and_the_schema_version_coexist_and_move_apart(session):
    """R-DM-8's sub-answer, pinned. ``tournaments.data['version']`` is the
    SCHEMA version and does not move when the document changes;
    ``state_version`` is the I8 optimistic-concurrency token and moves on
    every committed write. They are two different numbers on one row and
    P2 must not have collapsed them."""
    repo = LocalRepository(session)
    row = repo.tournaments.create(name="Coexistence")
    assert row.state_version == 0

    repo.tournaments.upsert_data(row.id, {"config": {"tournamentName": "Coexistence"}})
    repo.tournaments.upsert_data(row.id, {"config": {"tournamentName": "Renamed"}})

    session.expire_all()
    fresh = repo.tournaments.get_by_id(row.id)
    assert fresh.state_version == 2, "the OCC token counts writes"
    assert fresh.data["version"] == 2, "the schema version does not"
    assert fresh.schema_version == 2, "and the mirror column tracks the schema one"


def test_a_fresh_workspace_keeps_an_empty_document(session):
    """The empty-dict NC. ``create()`` stores ``data={}`` and four call
    sites read that emptiness as 'no state yet' - notably
    ``display/display.py``'s 204 branch. A version stamp would make it
    truthy and silently flip all four."""
    repo = LocalRepository(session)
    row = repo.tournaments.create(name="Fresh")
    session.expire_all()
    assert repo.tournaments.get_by_id(row.id).data == {}


def test_a_future_version_blob_refuses_to_load(session):
    """NC 1 end-to-end: v2 code meeting a v3 document raises instead of
    parsing it. The blob is planted with textual SQL ON PURPOSE - the bind
    processor would re-stamp it to 2 through any typed write, so a
    ``session.execute(update(...))`` plant would test nothing."""
    import json

    from sqlalchemy import text

    from db.blob_version import BlobVersionError

    repo = LocalRepository(session)
    row = repo.tournaments.create(name="From the future")
    repo.tournaments.upsert_data(row.id, {"config": {}})

    session.execute(
        text("UPDATE tournaments SET data = :d WHERE id = :i"),
        {"d": json.dumps({"version": 3, "config": {}}), "i": str(row.id)},
    )
    session.commit()
    session.expire_all()

    with pytest.raises(BlobVersionError):
        _ = repo.tournaments.get_by_id(row.id).data


def test_an_unversioned_blob_reads_as_v1_and_is_rewritten_stamped(session):
    """NC 1's other half - the compatibility promise the no-backfill
    decision rests on. Every row in a shipped database is in this state."""
    import json

    from sqlalchemy import text

    repo = LocalRepository(session)
    row = repo.tournaments.create(name="Legacy")
    repo.tournaments.upsert_data(row.id, {"config": {}})
    session.execute(
        text("UPDATE tournaments SET data = :d WHERE id = :i"),
        {"d": json.dumps({"config": {"tournamentName": "Legacy"}}), "i": str(row.id)},
    )
    session.commit()
    session.expire_all()

    legacy = repo.tournaments.get_by_id(row.id)
    assert "version" not in legacy.data, "planted unversioned"
    assert legacy.data["config"]["tournamentName"] == "Legacy", "reads as v1"

    repo.tournaments.upsert_data(row.id, dict(legacy.data))
    session.expire_all()
    assert repo.tournaments.get_by_id(row.id).data["version"] == 2
```

(If `test_repositories.py`'s Tournament fixtures name things differently — it builds its own in-memory `session` fixture at `:29+` and constructs `LocalRepository(session)` — follow the file's existing tests, they are the source of truth. Add `import pytest` only if absent; it is already imported at `:12`.)

- [ ] **Step 2: Run and verify they fail**

Run: `pytest tests/backend/unit/test_repositories.py -q -k "coexist or fresh_workspace or future_version or unversioned_blob"`
Expected: the future-version test FAILS (no guard yet — it loads the v3 blob happily). The other three may already PASS: they pin behavior the change must **not** break, which is exactly their job.

- [ ] **Step 3: Change the column type** — in `apps/api/src/db/models.py`, add to the import block:

```python
from db.blob_version import CURRENT_TOURNAMENT_SCHEMA_VERSION, VersionedJSON
```

and replace line 129:

```python
    data: Mapped[dict] = mapped_column(
        VersionedJSON(CURRENT_TOURNAMENT_SCHEMA_VERSION, "version"),
        nullable=False,
        default=dict,
    )
```

`JSON` stays imported — 23 other columns still use it.

- [ ] **Step 4: Run the backend tests**

Run: `pytest tests/backend/unit/test_repositories.py -q`
Expected: ALL pass, including the four new ones.

Run: `pytest tests/backend -q -x`
Expected: ALL pass. One named possibility: `tests/backend/unit/test_entries_migration.py`'s drift test compares model metadata against migration-built schema. If it compares column *types* by Python class, `VersionedJSON` will not equal `JSON` even though the compiled DDL is identical — the fix is comparing compiled DDL (or adding the decorator to the comparison), **never** reverting the column type. This is the broad regression check that matters most in this slice — the column type change is invisible at every call site *by design*, and a red here means it was not. **If something reds, do not edit the test**: read it, and if it asserts on `row.data`'s exact key set, the stamp changed a shape the plan claimed it would not. Stop and report.

- [ ] **Step 5: Reconcile the comment (R-DM-8's documentation half, F-DM-39)** — in `apps/api/src/db/models.py`, replace the comment block at `:124-142` (the one above `data`, `schema_version` and `state_version`, which currently says a fourth bare `version` "would be unreadable") with:

```python
    # The full ``TournamentStateDTO`` document - config + groups + players
    # + matches + schedule + history. One blob by choice; sub-entities
    # normalise out only when query needs warrant it.
    #
    # FOUR NUMBERS LIVE ON OR IN THIS COLUMN. Reconciled by R-DM-8(a)
    # (ruled 2026-08-24) - each one has exactly one job:
    #
    #   data["version"]        the SCHEMA version of the document. Absent
    #                          means 1. Stamped on write and checked on
    #                          read by ``VersionedJSON`` below; a document
    #                          newer than this build raises rather than
    #                          being mis-parsed.
    #   schema_version         a COLUMN MIRROR of data["version"], so
    #                          Alembic-level SQL can reason about payload
    #                          shape without parsing the blob. Never an
    #                          independent value.
    #   state_version          the OPTIMISTIC-CONCURRENCY token (I8,
    #                          SP-CLOUD-4). Counts committed writes; a
    #                          PUT /state carrying a stale one is refused.
    #                          NOT a schema version and never compared to
    #                          one - which is why it is not called
    #                          ``version``.
    #   data["scheduleVersion"]  the proposal-commit counter, a domain
    #                          value inside the document. Unrelated to all
    #                          three of the above.
    #
    # F-DM-39 stands and is documented rather than fixed: this document is
    # a superset of ``TournamentStateDTO``, and ``state_dto_from_document``
    # drops any section the DTO does not declare (``bracket_session``,
    # ``_integrity``). The wire type is a known-lossy filter over storage,
    # by design. Making it lossless is a wire change, not a versioning one.
    data: Mapped[dict] = mapped_column(
        VersionedJSON(CURRENT_TOURNAMENT_SCHEMA_VERSION, "version"),
        nullable=False,
        default=dict,
    )
    schema_version: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    state_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
```

(Fold Step 3's column edit into this block; the two steps touch the same lines and the split is only so the test goes green before the prose lands.)

- [ ] **Step 6: Re-run and commit**

Run: `pytest tests/backend/unit/test_repositories.py -q && ruff check apps/api`
Expected: green.

```bash
git commit -m "feat(db): guard tournaments.data at the ORM boundary + reconcile the four version numbers (R-DM-8a, F-DM-39)" -- apps/api/src/db/models.py tests/backend/unit/test_repositories.py
```

---

### Task 3: The ratchet — an inventory test that fails on a new JSON column

**Files:**
- Create: `tests/backend/unit/test_blob_version_inventory.py`

**Interfaces:**
- Consumes: `db.models.Base.metadata`, `db.blob_version.BLOB_VERSIONS` / `VersionedJSON` / `CURRENT_TOURNAMENT_SCHEMA_VERSION`.
- Produces: nothing importable. This is the mechanism's enforcement and the design doc's actual deliverable (`:128` — *"the mechanism, not the migration, is the deliverable"*).
- **The trap:** `VersionedJSON` is a `TypeDecorator`, **not** a subclass of `JSON`. An `isinstance(col.type, JSON)` filter silently *under-counts* — it would stop seeing `tournaments.data` the moment Task 2 landed, and the test would pass while measuring nothing. Both classes go in the tuple.

- [ ] **Step 1: Write the test**

```python
"""The blob-version ratchet (SP-DM-3 P2, R-DM-8a).

Adding a JSON column to ``db/models.py`` without deciding its version
story fails here. That is the entire point: F-DM-06 happened because 24
columns accumulated one at a time, each individually reasonable.

A registry value of ``None`` is a legitimate answer ("registered, not yet
versioned, reason on the line") - what is forbidden is silence.
"""
from __future__ import annotations

from sqlalchemy import JSON

from db.blob_version import (
    BLOB_VERSIONS,
    CURRENT_TOURNAMENT_SCHEMA_VERSION,
    VersionedJSON,
)
from db.models import Base


def _json_columns() -> dict[str, object]:
    """Every JSON-typed column in the schema, keyed ``table.column``.

    ``VersionedJSON`` is a TypeDecorator, not a JSON subclass - listing
    both is what keeps a wired column visible to this census.
    """
    return {
        f"{table.name}.{column.name}": column.type
        for table in Base.metadata.tables.values()
        for column in table.columns
        if isinstance(column.type, (JSON, VersionedJSON))
    }


def test_every_json_column_is_registered():
    live = set(_json_columns())
    registered = set(BLOB_VERSIONS)

    missing = sorted(live - registered)
    assert not missing, (
        "New JSON column(s) with no entry in db.blob_version.BLOB_VERSIONS: "
        f"{missing}. Add a line for each: an int if the blob is versioned "
        "(and declare the column VersionedJSON), or None with a one-line "
        "reason it is not yet. R-DM-8(a), SP-DM-3 P2."
    )

    stale = sorted(registered - live)
    assert not stale, (
        f"BLOB_VERSIONS names column(s) the schema no longer has: {stale}. "
        "Delete the entries - the registry only shortens."
    )


def test_a_registry_entry_cannot_lie_about_being_versioned():
    """An int in the registry claims the column enforces its version. This
    proves the column type backs the claim, so the registry can never
    drift into decoration."""
    types = _json_columns()
    for name, version in BLOB_VERSIONS.items():
        if version is None:
            continue
        column_type = types[name]
        assert isinstance(column_type, VersionedJSON), (
            f"{name} is registered at v{version} but its column is plain "
            "JSON - either declare it VersionedJSON or set the entry to None."
        )
        assert column_type.version == version, (
            f"{name}: registry says v{version}, column says "
            f"v{column_type.version}."
        )


def test_the_tournament_document_is_the_one_wired_column_today():
    """A deliberate pin on P2's scope, not an aspiration. The other 23
    columns are enumerated debt with reasons; the phases that reshape them
    (P4 member_ids/slots, P5 the pair, P7 the event blob) flip their own
    entries. When one does, this assertion changes WITH it - that edit is
    the phase declaring its scope, not drift."""
    wired = {n for n, v in BLOB_VERSIONS.items() if v is not None}
    assert wired == {"tournaments.data"}
    assert BLOB_VERSIONS["tournaments.data"] == CURRENT_TOURNAMENT_SCHEMA_VERSION
```

- [ ] **Step 2: Run it**

Run: `pytest tests/backend/unit/test_blob_version_inventory.py -q`
Expected: all three PASS. If `test_every_json_column_is_registered` reds, the registry transcription in Task 1 missed a column — fix the registry, **not** the test.

- [ ] **Step 3: Prove the ratchet actually ratchets (NC 2)**

This is a **probe, reverted immediately** — it is the only way to know the test would catch tomorrow's column. Temporarily add to any model in `apps/api/src/db/models.py`:

```python
    probe_blob: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
```

Run: `pytest tests/backend/unit/test_blob_version_inventory.py -q`
Expected: **FAIL**, naming `probe_blob` in the missing list.

Then **revert the probe line** (`git checkout -- apps/api/src/db/models.py` is safe here only if Task 2 is already committed — it is) and re-run to confirm green. Record the probe result in the Task 6 ledger note.

- [ ] **Step 4: Commit**

```bash
git add tests/backend/unit/test_blob_version_inventory.py
git commit -m "test(db): blob-version inventory ratchet - a new JSON column must declare itself" -- tests/backend/unit/test_blob_version_inventory.py
```

---

### Task 4: `non-scheduling-keys.json` gets `$schema` + a version, and stops being found by counting `../`

**Files:**
- Modify: `packages/shared-contract/non-scheduling-keys.json`
- Create: `packages/shared-contract/non-scheduling-keys.schema.json`
- Create: `packages/shared-contract/package.json`
- Modify: `apps/api/src/workspaces/config_lock.py` (`:38-42`)
- Modify: `apps/console/src/store/__tests__/nonSchedulingKeys.parity.test.ts`
- Modify: `apps/console/package.json` + root `package-lock.json`

**Interfaces:**
- Consumes: nothing new on the backend. On the console, an npm workspace resolution.
- Produces: the file's shape becomes `{"$schema", "version", "keys"}`. `config_lock.NON_SCHEDULING_KEYS` keeps its exact type (`frozenset[str]`) and contents, so **no consumer of that symbol changes**; `changed_scheduling_fields` is untouched.
- **Read this before editing `config_lock.py`:** F-DM-53 says *"both readers hard-code the relative path"*, but only one of them still does. The backend does **not** count levels — `_locate_shared()` (`:17-35`) walks up from its own file looking for the relative path, and its docstring is a nine-line argument for why counting is wrong. **Do not churn it.** F-DM-53's live half is the console test's `'../../../../../packages/shared-contract/non-scheduling-keys.json'` — five levels counted from a test file, which is exactly the fragility the backend comment warns about.
- **The version guard is written inline, not with `VersionedJSON`.** Different substrate: a file read at import time, not a database column. Two lines beat importing a database type into a config module (and `workspaces` importing `db.blob_version` would be a new cross-layer edge for no gain).

- [ ] **Step 1: Reshape the contract file** — `packages/shared-contract/non-scheduling-keys.json`:

```json
{
  "$schema": "./non-scheduling-keys.schema.json",
  "version": 1,
  "keys": [
    "scoringFormat",
    "setsToWin",
    "pointsPerSet",
    "deuceEnabled",
    "standingsMode",
    "tvDisplayMode",
    "tvAccent",
    "tvPreset",
    "tvGridColumns",
    "tvCardSize",
    "tvShowScores",
    "courtOrder",
    "hiddenCourts",
    "tournamentName",
    "clockShiftMinutes"
  ]
}
```

The 15 keys are **unchanged and in the same order** — verify with `git diff` that no key moved. A key change here changes what the CONFIG_LOCKED contract treats as scheduling-relevant, which is a behavior change P2 has no mandate for.

And `packages/shared-contract/non-scheduling-keys.schema.json`, so `$schema` points at something real rather than at a URL nobody serves:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ShuttleWorks non-scheduling config keys",
  "description": "The exempt list behind the CONFIG_LOCKED contract: config keys whose change never invalidates a solved schedule. Classification is fail-closed - anything NOT listed here is scheduling-relevant. Read by apps/api/src/workspaces/config_lock.py and by the console parity test.",
  "type": "object",
  "required": ["version", "keys"],
  "properties": {
    "$schema": { "type": "string" },
    "version": {
      "type": "integer",
      "minimum": 1,
      "description": "Schema version of THIS file (R-DM-8a). A reader that knows a lower version must refuse rather than guess."
    },
    "keys": {
      "type": "array",
      "items": { "type": "string" },
      "uniqueItems": true
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 2: Update the backend reader** — in `apps/api/src/workspaces/config_lock.py`, replace `:38-42`:

```python
_SHARED_JSON = _locate_shared()

# SP-DM-3 P2 (R-DM-8a) gave this file a version. Same rule as the blob
# columns: a file NEWER than this reader raises rather than being
# half-understood. Written inline rather than through
# ``db.blob_version.VersionedJSON`` - that guards a database column, this
# is a file read at import, and ``workspaces`` has no business importing a
# persistence type to check two integers.
_KNOWN_CONTRACT_VERSION = 1

_contract = json.loads(_SHARED_JSON.read_text(encoding="utf-8"))
_contract_version = _contract.get("version", 1)
if _contract_version > _KNOWN_CONTRACT_VERSION:
    raise RuntimeError(
        f"{_SHARED_JSON} is version {_contract_version}; this build knows "
        f"{_KNOWN_CONTRACT_VERSION}. Refusing to classify config keys against "
        "a contract it does not understand (CONFIG_LOCKED is fail-closed)."
    )

NON_SCHEDULING_KEYS: frozenset[str] = frozenset(_contract["keys"])
```

Also extend the module docstring's second sentence to name the shape: *"…a single file — now a versioned `{$schema, version, keys}` document (R-DM-8a) — read by this module AND by the console parity test…"*.

No back-compat with the old bare-array shape: the file and both readers ship in one commit of one repo, and the API image copies the package wholesale (`apps/api/Dockerfile:105`).

- [ ] **Step 3: Make `packages/shared-contract` a real workspace** — the root already globs `packages/*` (`package.json:6-10`); the directory is invisible to npm only because it has no manifest. Create `packages/shared-contract/package.json`:

```json
{
  "name": "@scheduler/shared-contract",
  "private": true,
  "version": "0.1.0",
  "description": "Data both tiers read. One file today: the CONFIG_LOCKED non-scheduling key exemption list, versioned per R-DM-8(a). Consumers import it by package name so neither side counts directory levels to reach it (F-DM-53).",
  "type": "module",
  "exports": {
    "./non-scheduling-keys.json": "./non-scheduling-keys.json"
  }
}
```

Add to `apps/console/package.json`'s `devDependencies` (the only consumer is a test):

```json
    "@scheduler/shared-contract": "*",
```

Then, from the repo root: `npm install` — it creates the `node_modules/@scheduler/shared-contract` symlink and updates `package-lock.json`. **Commit the lockfile in this task's commit.**

- [ ] **Step 4: Update the console reader** — rewrite `apps/console/src/store/__tests__/nonSchedulingKeys.parity.test.ts`:

```typescript
/**
 * Pins the console NON_SCHEDULING_KEYS to the shared contract the API
 * classifier loads. If this fails, one side changed the exempt list
 * without the other.
 *
 * The path is gone on purpose (F-DM-53). This used to reach the file by
 * counting five directory levels up — the exact fragility
 * `config_lock._locate_shared`'s docstring argues against, in a test five
 * directories deep. The contract is a workspace package now, so it is
 * imported by name and a move on either side is a resolution error, not a
 * silently wrong file.
 */
import { describe, expect, it } from 'vitest';
import contract from '@scheduler/shared-contract/non-scheduling-keys.json';
import { NON_SCHEDULING_KEYS } from '../tournamentStore';

describe('non-scheduling keys parity', () => {
  it('console list matches the shared contract', () => {
    expect([...NON_SCHEDULING_KEYS].sort()).toEqual([...contract.keys].sort());
  });

  it('reads a contract version this side understands', () => {
    // R-DM-8(a): the console half of the same refusal the backend makes.
    // A bumped version means the shape changed and this mirror is suspect.
    expect(contract.version).toBe(1);
  });
});
```

**If the JSON import does not typecheck**, add `"resolveJsonModule": true` to `apps/console/tsconfig.app.json`'s `compilerOptions` (it already sets `"moduleResolution": "bundler"`, which understands `exports`).

**Ruled fallback if the workspace link fights back** (a lockfile the executor cannot cleanly regenerate, or a resolution failure in vitest): revert the package.json/lockfile half and instead add a resolve alias to `apps/console/vitest.config.ts` —

```typescript
  resolve: { alias: { '@scheduler/shared-contract': path.resolve(__dirname, '../../packages/shared-contract') } },
```

— keeping the test file above exactly as written. That is strictly worse (the level count moves to a config file instead of vanishing) but it is a *declared* path rather than an embedded one, and it still closes F-DM-53's live half. Take the fallback only after the workspace route fails, and say so in the ledger.

- [ ] **Step 5: Run both sides**

Run: `pytest tests/backend/unit/test_config_lock.py tests/backend/unit/test_state_locks.py -q`
Expected: ALL pass, untouched — `NON_SCHEDULING_KEYS` has the same contents and the same type.

Run: `npm --prefix apps/console run test:run -- src/store/__tests__/nonSchedulingKeys.parity.test.ts`
Expected: both tests PASS.

Run: `npm --prefix apps/console run build`
Expected: PASS (`tsc -b` is the type gate for the JSON import).

- [ ] **Step 6: Commit**

```bash
# Two new files here (the schema + the manifest) - stage before committing.
git add packages/shared-contract/non-scheduling-keys.schema.json packages/shared-contract/package.json
git commit -m "feat(shared-contract): version the non-scheduling key list + import it by package name (F-DM-53)" -- packages/shared-contract/non-scheduling-keys.json packages/shared-contract/non-scheduling-keys.schema.json packages/shared-contract/package.json apps/api/src/workspaces/config_lock.py "apps/console/src/store/__tests__/nonSchedulingKeys.parity.test.ts" apps/console/package.json package-lock.json
```

---

### Task 5: P1 pickup rider — the display `/state` comment says something untrue

**Files:**
- Modify: `apps/api/src/display/display.py` (`:204-209`, the decorator comment only)

**Interfaces:** none. **This is a comment edit. No behavior changes, no test changes, `response_model_exclude_unset=True` stays.**

The comment claims `exclude_unset` is load-bearing because *"the board distinguishes an absent key from a null one."* It does not: `apps/console/src/modules/display/publicDisplay/useDisplaySync.ts:76-85` null-coalesces **every** field it reads (`remote.config ?? null`, `remote.groups ?? []`, …). The flag is still right — it keeps the wire byte-identical to what shipped before P1 gave the route a `response_model` — but the *stated reason* is a claim about a consumer that is false, and a future reader who checks it will either delete the flag or distrust the comment.

- [ ] **Step 1: Reword** — replace `:204-209`:

```python
    # The projection copies a key only when the blob HAS it
    # (``if k in t.data``). ``exclude_unset`` keeps that true through the
    # response model: a dict validated into the model marks exactly the
    # keys it carried as "set", so the wire key set is byte-for-byte what
    # it was before P1 gave this route a response_model - which the
    # key-set test above proves.
    #
    # This is conservatism about the wire, NOT a contract with the board:
    # the console's own consumer null-coalesces every field it reads
    # (``useDisplaySync.ts`` - ``remote.config ?? null`` and friends), so
    # it cannot tell an absent key from a null one. An earlier version of
    # this comment claimed it could. Other consumers of a public capability
    # URL are not enumerable, which is the real reason not to widen the
    # payload here.
```

- [ ] **Step 2: Verify nothing moved**

Run: `pytest tests/backend -q -k display`
Expected: ALL pass (a comment cannot change them; this is the proof, not a formality).

- [ ] **Step 3: Commit**

```bash
git commit -m "docs(display): the /state exclude_unset comment states its real justification (SP-DM-3 P1 pickup)" -- apps/api/src/display/display.py
```

---

### Task 6: Slice gates, the L1 carry-forward, and the ledger

**Files:** `docs/reference/debt-log.md`, `docs/history/programs/DM3_PROGRESS.md`. Everything else is verification.

- [ ] **Step 1: The re-scoped deletion gate**

The design doc's literal gate (`rg '\.data\["|json\.loads\(' apps/api/src` → nothing outside helpers) **does not apply to this design and is not run** — see "What P2 does NOT do". Run the gate that measures what P2 actually built:

Run: `pytest tests/backend/unit/test_blob_version_inventory.py -q`
Expected: green — 24 live JSON columns, 24 registry entries, one wired, and the probe in Task 3 Step 3 already proved a 25th would red it.

Run: `rg "CURRENT_TOURNAMENT_SCHEMA_VERSION = " apps/api/src`
Expected: exactly **one** definition (`db/blob_version.py`). Two literals is how the mirror column and the blob key drift apart.

Run: `rg "\.\./\.\./\.\./\.\./\.\./packages" apps/console/src`
Expected: **0** — F-DM-53's live half closed.

- [ ] **Step 2: The negative controls, named**

Run: `pytest tests/backend/unit/test_blob_version.py tests/backend/unit/test_blob_version_inventory.py tests/backend/unit/test_repositories.py tests/backend/unit/test_config_lock.py -q`
Expected: PASS, covering — **NC 1a** v2-read-by-v1 raises (`test_a_newer_blob_raises…`, `test_a_future_version_blob_refuses_to_load`); **NC 1b** unversioned reads as v1 and is rewritten stamped (`test_an_absent_version_reads_as_v1`, `test_an_unversioned_blob_reads_as_v1_and_is_rewritten_stamped`); **NC 2** a new JSON column without a helper fails the inventory (`test_every_json_column_is_registered` + the Task 3 probe); **coexistence** `state_version` and `data["version"]` move independently; **empty-dict** a fresh workspace still has `data == {}`.

- [ ] **Step 3: Full gate**

Run: `make check`
Expected: green across both tiers (console lint/types/vitest/depcruise, entrant lint/types/vitest/depcruise, ruff, import-linter, pytest). Fix anything red before proceeding; report honestly if a failure is pre-existing — verify that by running the same gate on a `main` worktree or reading CI, **never** with `git stash`.

- [ ] **Step 4: Carry debt-log L1 forward (record, do not fix)** — in `docs/reference/debt-log.md`, L1's "What is still owed" sentence, extend the blob half in place:

> …and a story for the PII carried on workspace state blobs (rosters are full of names and the retention job does not reach them) — **unchanged by SP-DM-3 P2, deliberately.** P2 gave `tournaments.data` a version and a load-time guard, which makes a future scrub *safe to roll out* (a scrubbing build can refuse a document it does not understand) but reaches no PII itself: versioning says what shape a blob is, never what is inside it. The retention job still stops at the table columns.

Also append one line to **D23**'s entry (it named `packages/shared-contract/` as the exit and said *"P2 is about to touch its versioning"*): *"P2 made it a real npm workspace package (`@scheduler/shared-contract`) with a versioned document — the mechanism D23 asks for now exists; what remains is the R-DM-9(c) decision about putting types in it."*

- [ ] **Step 5: Update the ledger** — `docs/history/programs/DM3_PROGRESS.md`: flip P2's row to DONE with the commit SHAs, and add a session-log entry recording:
  - the **24 → 1 wired / 23 registered** split and why (list-shaped vs round-trip-sensitive), so P4/P5/P7 find their own entries waiting;
  - the **TypeDecorator deviation** from "one helper per blob column" and that it is tighter, not looser;
  - the **re-scoped deletion gate** (the design doc's `rg` gate is unreachable under this design);
  - the **Task 3 probe** result (the ratchet was proved, then reverted);
  - whether Task 4 took the **workspace package** or the **alias fallback**;
  - that P4 and P5 are now unblocked, and P7 too.

- [ ] **Step 6: Commit the ledger (path-limited), then stop**

```bash
git commit -m "docs: SP-DM-3 ledger - P2 blob versioning landed" -- docs/history/programs/DM3_PROGRESS.md docs/reference/debt-log.md
```

Merging `dm3/p2-blob-versioning` is Kyle's call (superpowers:finishing-a-development-branch). **Do not start P4 or P5 in the same session without checking the ledger's next-slice note** — both are L-sized and both reshape blobs this slice deliberately left registered-but-unversioned.

---

## Self-review record (plan author, 2026-08-24)

- **Spec coverage.** Design doc P2 (`:123-130`) asks for four things: no migration (Task 1–2 use a `TypeDecorator`, same DDL, no Alembic revision); a read/write helper replacing bare JSON access (Task 1–2); `tournaments.data`'s three schemes reconciled by *documentation + one accessor* (Task 2 Step 5 — the comment IS the reconciliation R-DM-8 asks for, and `VersionedJSON(…, "version")` is the one accessor); `non-scheduling-keys.json` gaining `$schema` + a version with both readers freed from the hard-coded path (Task 4). Both NCs map: NC 1 → Task 1 Step 1 + Task 2 Step 1; NC 2 → Task 3 Steps 1–3, where Step 3's revert-after-probe is the only way to know the ratchet ratchets. The L1 carry-forward is Task 6 Step 4 and is explicitly a *record*, not a fix.
- **Judgment call 1 — the helper is a type, not a function pair (deviation, flagged).** R-DM-8(a)'s words are "one read/write helper per blob column at the repository boundary". A `TypeDecorator` binds at the **ORM** boundary, which is strictly *tighter* (it catches the ~20 raw `tournament.data` reads across five domain packages that a repository-level helper would miss, and catches future ones with no discipline required), and it costs **zero call-site edits** where the literal reading costs a 20-site rewrite in a slice whose own constraint is behavior preservation. The registry entry is the per-column declaration the ruling asks for. Controller: if you want the literal function-pair shape, this is the place to say so — it is a different Task 1 and roughly triple the diff.
- **Judgment call 2 — one column wired, 23 registered (scope choice, flagged).** Six of the 24 are JSON *lists* with nowhere to put a `v` key (versioning them = reshaping them = P4/P5's chartered work), and several dict-shaped ones round-trip somewhere an extra key is not free — `solve_jobs.params` is the pinned determinism input, `workspace_modules.config` carries `tv*` to the console, `bracket_results.score` is a shape ADR 0006 forbids touching here. Stamping all 24 blind would be a behavior change wearing a mechanism's clothes. The registry's 23 `None` entries each carry a one-line reason, and Task 3's third test *pins the count at one* so a later phase widening it does so deliberately. This is why the design doc's `rg '\.data\["'` deletion gate is re-scoped rather than run: under this design a raw `row.data[...]` read is correct, because the guard already ran at load.
- **Smaller calls.** (a) `$schema` points at a real sibling schema file rather than an unserved URL — 20 lines, and a dangling `$schema` is worse than none. (b) The `non-scheduling-keys` version guard is written inline in `config_lock.py` instead of reusing `VersionedJSON`: different substrate (a file read at import, not a column), and `workspaces` importing a persistence type to compare two integers would be a new cross-layer edge for no gain. (c) `config_lock._locate_shared()` is **left alone** — it already walks up rather than counting, and its docstring is the argument for why; F-DM-53's live half is the console test, and the plan says so twice so an executor does not "fix" good code. (d) Task 4 carries a ruled fallback (vitest alias) because the workspace-package route touches `package-lock.json`, which is the one step in this slice a plan cannot verify from the outside.
- **Type consistency.** `VersionedJSON(version: int, version_key: str = "v")` is constructed with that exact signature in Task 2 (`VersionedJSON(CURRENT_TOURNAMENT_SCHEMA_VERSION, "version")`) and asserted with those attribute names in Task 3. `BLOB_VERSIONS: dict[str, int | None]` is consumed as such in Task 3's two loops. `CURRENT_TOURNAMENT_SCHEMA_VERSION` has exactly one definition site after Task 1 Step 4 (gated in Task 6 Step 1), and `ops/health.py:66` keeps importing it from `repositories.local` untouched.
- **Traps written into the steps, not left for the executor.** The empty-dict regression (four call sites read `data == {}` as "no state"); the bind-processor trap (a future-version blob cannot be planted through a typed write — Task 2 Step 1 uses `text()` and says why); the `isinstance(col.type, JSON)` under-count (`VersionedJSON` is a TypeDecorator, not a JSON subclass — Task 3's filter lists both); the `cache_ok = True` requirement that constructor parameter names match instance attribute names.
- **Line numbers** are as of `fdc12db2` (P3 + P0 + P1 all merged to `main`). The live `grep` of `db/models.py` matched the pinned census (`e67633fe`) column-for-column, so the audit's inventory and the current tree agree: **24 JSON columns — 18 dict-shaped, 6 list-shaped.** Executors should re-anchor by symbol, not line.
