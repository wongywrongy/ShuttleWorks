"""data — hash staff invites and replace bearer IDs (security program P05).

Existing links retain their bounded validity. No child references invite IDs.
Revision-local hashing freezes the deployed token representation.
Batch-altered tables: invite_links.
"""
import hashlib
import uuid

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invite_links", sa.Column("token_hash", sa.String(64), nullable=True))
    invites = sa.table(
        "invite_links", sa.column("id", sa.Uuid), sa.column("token_hash", sa.String(64)),
    )
    connection = op.get_bind()
    while True:
        rows = connection.execute(
            sa.select(invites.c.id).where(invites.c.token_hash.is_(None)).limit(1000)
        ).all()
        if not rows:
            break
        for (old_id,) in rows:
            connection.execute(invites.update().where(invites.c.id == old_id).values(
                id=uuid.uuid4(), token_hash=hashlib.sha256(str(old_id).encode("utf-8")).hexdigest(),
            ))
    with op.batch_alter_table("invite_links") as batch:
        batch.alter_column("token_hash", existing_type=sa.String(64), nullable=False)
        batch.create_index("uq_invite_links_token_hash", ["token_hash"], unique=True)


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
