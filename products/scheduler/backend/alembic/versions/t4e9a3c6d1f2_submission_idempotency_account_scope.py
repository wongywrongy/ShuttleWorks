"""Narrow the submission idempotency index to the account.

SP-PROGRAM-1 Phase 6 §4. ``s3d8f2b5c0e1`` created
``uq_submissions_tournament_idempotency_key`` on
``(tournament_id, idempotency_key)`` — ruling D4, tenant-scoped, and
correct for as long as no real key could arrive. It could not: the entry
form was a native HTML form and a native form cannot send an
``Idempotency-Key`` header, so the column was NULL for every real entrant
and the index never compared two live keys.

Phase 6 mints the key in the loader and carries it as a hidden field. Keys
now flow, and a *guessed* key would resolve — ``services.submissions.replay``
hands back the found submission, i.e. another entrant's receipt.

The lookup is narrowed to the account, and this index narrows with it. That
pairing is not stylistic: ``create_submission`` recovers from a lost race by
re-running ``replay`` inside ``except IntegrityError`` and re-raising when
that lookup misses, so an index wider than the lookup turns a foreign
entrant's collision into an unhandled 500 — the same disclosure, wearing a
crash. Narrower than D4 is never wider than D4, so the cross-tenant probe
D4 exists to forbid remains impossible.

An index swap rather than a table rebuild: ``DROP INDEX`` / ``CREATE INDEX``
is valid on SQLite and Postgres alike (this is an index, not a table
constraint), so no ``batch_alter_table`` is needed.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "t4e9a3c6d1f2"
down_revision: Union[str, Sequence[str], None] = "s3d8f2b5c0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(
        "uq_submissions_tournament_idempotency_key", table_name="submissions"
    )
    op.create_index(
        "uq_submissions_tournament_account_idempotency_key",
        "submissions",
        ["tournament_id", "account_id", "idempotency_key"],
        unique=True,
    )


def downgrade() -> None:
    """Back to tenant scope.

    This can fail on data written under the narrower index — two accounts
    in one workspace legitimately holding the same key is exactly what the
    upgrade permits — and that is the honest behaviour: a downgrade that
    silently dropped one of those rows would destroy a real submission.
    """
    op.drop_index(
        "uq_submissions_tournament_account_idempotency_key", table_name="submissions"
    )
    op.create_index(
        "uq_submissions_tournament_idempotency_key",
        "submissions",
        ["tournament_id", "idempotency_key"],
        unique=True,
    )
