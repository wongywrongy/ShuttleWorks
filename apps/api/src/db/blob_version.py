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
