"""additive — persist Meet game scores (security/debt program P11, D19).

Existing aggregate scores survive unchanged. No games are inferred from totals.
No batch-altered tables; the new match_states column is nullable.
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("match_states", sa.Column("set_scores", sa.JSON(), nullable=True))


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
