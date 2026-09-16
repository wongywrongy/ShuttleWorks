"""additive — competition events carry a lifecycle status (state machines v2, S-3).

The other four competition tables (units, memberships, draw instances, partner
invitations) each carry a status column with a CHECK that names its vocabulary.
`competition_events` carried neither, so the `competition_event` machine had no
column to write to and "has this event started" was re-derived from the draw at
every call site. Existing rows land on `scheduled`, which is what they are.

SQLite needs batch mode, because it cannot attach a table CHECK to an existing
table. `resolve_fks=False` keeps the reflection off `tournaments` and
`event_format_versions`; the composite foreign keys that point AT this table
follow the batch rename. The competition triggers are dropped and reinstalled
around it: `units_confirm_roster` names `competition_events` in its body, and
SQLite refuses the batch rename while a trigger references a table that the
copy-and-swap has momentarily removed. Postgres needs none of that.
"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

COLUMN = sa.Column("status", sa.String(20), nullable=False, server_default="scheduled")
CHECK = "status IN ('scheduled', 'in_progress', 'completed')"
NAME = "ck_competition_events_status"


def upgrade() -> None:
    connection = op.get_bind()
    if connection.dialect.name != "sqlite":
        op.add_column("competition_events", COLUMN)
        op.create_check_constraint(NAME, "competition_events", CHECK)
        return
    from db.competition_ddl import install, trigger_specs

    names = [spec[0] for spec in trigger_specs()]
    for name in names:
        connection.exec_driver_sql(f"DROP TRIGGER IF EXISTS {name}")
    with op.batch_alter_table("competition_events", reflect_kwargs={"resolve_fks": False}) as batch:
        batch.add_column(COLUMN)
        batch.create_check_constraint(NAME, CHECK)
    install(connection)


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
