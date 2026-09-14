"""additive — individual offline operator enrollment (security program P08).

Activation is scoped to imported membership and a node authority epoch. Only a
hash is stored; existing cloud identities gain no node password or MFA assurance.
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("node_operator_enrollments",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("user_id", sa.Uuid, nullable=False, unique=True),
        sa.Column("tournament_id", sa.Uuid, nullable=False),
        sa.Column("authority_epoch", sa.Integer, nullable=False),
        sa.Column("node_id", sa.Uuid, nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tournament_id", "user_id"], ["tournament_members.tournament_id", "tournament_members.user_id"], ondelete="CASCADE", name="fk_node_enrollment_member"),
        sa.ForeignKeyConstraint(["tournament_id", "authority_epoch"], ["tournament_authority_epochs.tournament_id", "tournament_authority_epochs.epoch"], ondelete="CASCADE", name="fk_node_enrollment_authority"),
        sa.CheckConstraint("status IN ('pending', 'consumed')", name="ck_node_enrollment_status"),
        sa.CheckConstraint("authority_epoch > 0 AND expires_at > created_at", name="ck_node_enrollment_bounds"),
    )


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
