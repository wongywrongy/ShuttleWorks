"""constraint — golden rules R5: record authority epoch creation.

Batch-altered tables: tournament_authority_transitions.
The existing three transition types remain valid; no data conversion or purge.
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tournament_authority_transitions") as batch:
        batch.drop_constraint("ck_authority_transition_type", type_="check")
        batch.create_check_constraint(
            "ck_authority_transition_type",
            "transition_type IN ('return_to_cloud', 'planned_transfer', 'lost_node_recovery', "
            "'checkout', 'checkpoint_import', 'local_initialization')",
        )


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
