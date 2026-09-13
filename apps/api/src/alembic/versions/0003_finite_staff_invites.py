"""constraint — staff invitations expire within seven days of creation.

Batch-altered tables: invite_links.
Backfill caps existing deadlines without extending or deleting any invitation.
Revision-local declarations keep this migration independent of runtime policy.
"""
from datetime import timedelta, timezone

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    invites = sa.table(
        "invite_links",
        sa.column("id", sa.Uuid),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("expires_at", sa.DateTime(timezone=True)),
    )
    connection = op.get_bind()
    last_id = None
    while True:
        query = sa.select(invites).order_by(invites.c.id).limit(1000)
        if last_id is not None:
            query = query.where(invites.c.id > last_id)
        rows = connection.execute(query).all()
        if not rows:
            break
        for row in rows:
            created = row.created_at.replace(tzinfo=timezone.utc) if row.created_at.tzinfo is None else row.created_at
            deadline = created + timedelta(days=7)
            expiry = row.expires_at
            if expiry is not None and expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if expiry is None or expiry > deadline:
                connection.execute(
                    invites.update().where(invites.c.id == row.id).values(expires_at=deadline)
                )
        last_id = rows[-1].id
    with op.batch_alter_table("invite_links") as batch:
        batch.alter_column("expires_at", existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
