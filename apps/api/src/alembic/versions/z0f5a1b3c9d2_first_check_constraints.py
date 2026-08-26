"""The schema's first CHECK constraints: four enum-shaped string columns.

SP-DM-3 P7a (F-DM-37). Before this revision the schema had **zero** CHECK
constraints. Twenty-two ``String(<=32)`` columns are candidates; four of them
are constrained here and the other eighteen are deliberately left for a later
slice. Not all of them belong under a CHECK at all: ``tournament_date`` holds
an ISO date string, and ``tournaments.status`` has a
vocabulary no single place in the code produces (its own column comment says
enforcement lives at the application layer). The full candidate list is
recorded in the P7a task report.

**The value sets were produced, not guessed.** Each comes from the one place
in the codebase that is authoritative for it, and each was checked against
real on-disk data (``data/local.db``, ``apps/api/local.db``,
``data/_probe2/local.db``) before being written — a CHECK over a value already
stored is a migration that fails on a director's laptop rather than in CI.
Every distinct value on disk was inside its set:

  ``tournaments.kind``         meet, bracket
      source: the validator in ``workspaces/tournaments.py`` ("kind must be
      'meet' or 'bracket'"). On disk: bracket, meet.
  ``matches.status``           scheduled, called, playing, finished, retired
      source: the ``MatchStatus`` enum in ``db/models.py``. On disk:
      finished, scheduled, playing, called.
  ``entries.state``            unverified, pending, waitlisted, confirmed,
                               rejected, withdrawn
      source: the six module constants in ``entries/lifecycle.py``. On disk:
      confirmed, pending.
  ``tournament_members.role``  viewer, operator, owner
      source: ``ROLES`` in ``identity/members.py``, the same three the
      ``_ROLE_LEVELS`` ladder in ``core/dependencies.py`` ranks. On disk:
      owner.

``tournaments.status`` ("draft"/"active"/"archived") is NOT constrained: its
column comment says enforcement lives at the application layer and no
validator in the API produces its allowed set, so its vocabulary could not be
*produced* the way the other four could.

**SQLite reality.** ``ALTER TABLE ... ADD CONSTRAINT`` does not exist there, so
every change goes through ``op.batch_alter_table``, which rebuilds the table
from reflection. Each constraint is explicitly named for exactly that reason —
batch mode has nothing to drop on the way down otherwise, and ``downgrade()``
has to actually work. The names match ``db/models.py`` character for character
(F-DM-11: models and migration land together, and the two must agree).

Like every migration this program has shipped, this one is **SQLite-verified
only**.

Revision ID: z0f5a1b3c9d2
Revises: y9e4f0a2b7c8
Create Date: 2026-08-25 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "z0f5a1b3c9d2"
down_revision: Union[str, Sequence[str], None] = "y9e4f0a2b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, constraint name, condition) — one tuple per constrained column.
# The conditions are byte-identical to the ``CheckConstraint`` strings in
# ``db/models.py``.
_CHECKS: tuple[tuple[str, str, str], ...] = (
    ("tournaments", "ck_tournaments_kind", "kind IN ('meet', 'bracket')"),
    (
        "matches",
        "ck_matches_status",
        "status IN ('scheduled', 'called', 'playing', 'finished', 'retired')",
    ),
    (
        "entries",
        "ck_entries_state",
        "state IN ('unverified', 'pending', 'waitlisted', 'confirmed',"
        " 'rejected', 'withdrawn')",
    ),
    (
        "tournament_members",
        "ck_tournament_members_role",
        "role IN ('viewer', 'operator', 'owner')",
    ),
)


def upgrade() -> None:
    for table, name, condition in _CHECKS:
        with op.batch_alter_table(table) as batch:
            batch.create_check_constraint(name, condition)


def downgrade() -> None:
    for table, name, _condition in reversed(_CHECKS):
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(name, type_="check")
