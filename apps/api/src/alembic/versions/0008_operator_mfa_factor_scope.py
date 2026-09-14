"""additive — one operator factor per account AND scope (security debt SGR-20260914-K6).

0006 made ``operator_mfa_factors.user_id`` unique while every read filters on
``(user_id, scope)``, so an account could hold only one factor across the cloud
scope and every event-node scope. Harmless while a database serves one scope;
this makes the schema say what the code means. Existing rows are unchanged: each
already has exactly one scope, so the wider key admits every current row.
"""
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # resolve_fks=False: SQLite batch mode would otherwise also reflect `users`,
    # whose expression index it cannot reflect (a warning on every migration).
    with op.batch_alter_table("operator_mfa_factors", reflect_kwargs={"resolve_fks": False}) as batch:
        batch.drop_constraint("uq_operator_mfa_factors_user", type_="unique")
        batch.create_unique_constraint("uq_operator_mfa_factors_user_scope", ["user_id", "scope"])


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
