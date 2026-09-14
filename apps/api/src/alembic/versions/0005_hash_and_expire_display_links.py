"""data — hash display links and bound their validity (security program P05).

Dated links retain access through the event's final day plus seven venue-local
calendar days. Undated or malformed legacy rows expire at migration time: the
owner must explicitly choose an expiry before issuing a replacement.
Batch-altered tables: display_tokens. Historical backups may contain raw links.
"""
import hashlib
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("display_tokens", sa.Column("token_hash", sa.String(64), nullable=True))
    op.add_column("display_tokens", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    links = sa.table("display_tokens", sa.column("tournament_id", sa.Uuid),
                     sa.column("token", sa.String), sa.column("token_hash", sa.String),
                     sa.column("expires_at", sa.DateTime(timezone=True)))
    workspaces = sa.table("tournaments", sa.column("id", sa.Uuid),
                          sa.column("tournament_date", sa.String),
                          sa.column("tournament_end_date", sa.String), sa.column("time_zone", sa.String))
    connection = op.get_bind()
    now = datetime.now(timezone.utc)
    while True:
        rows = connection.execute(sa.select(links.c.tournament_id, links.c.token,
            workspaces.c.tournament_date, workspaces.c.tournament_end_date, workspaces.c.time_zone)
            .join(workspaces, links.c.tournament_id == workspaces.c.id)
            .where(links.c.token_hash.is_(None)).limit(1000)).all()
        if not rows:
            break
        for workspace_id, token, start, end, zone in rows:
            expiry = now
            try:
                last_day = date.fromisoformat(end or start or "")
                expiry = datetime.combine(last_day + timedelta(days=8), time.min,
                                          ZoneInfo(zone)).astimezone(timezone.utc)
            except (ValueError, OverflowError, ZoneInfoNotFoundError):
                pass
            connection.execute(links.update().where(links.c.tournament_id == workspace_id).values(
                token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(), expires_at=expiry))
    with op.batch_alter_table("display_tokens") as batch:
        batch.drop_index("uq_display_tokens_token")
        batch.drop_column("token")
        batch.alter_column("token_hash", existing_type=sa.String(64), nullable=False)
        batch.alter_column("expires_at", existing_type=sa.DateTime(timezone=True), nullable=False)
        batch.create_index("uq_display_tokens_token_hash", ["token_hash"], unique=True)


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
