"""Make EntryPage the authority for public audience visibility."""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "aa1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "entry_pages",
        sa.Column("audience", sa.String(length=16), nullable=True),
    )
    # Preserve the old public behavior for open pages; closed pages become
    # explicitly private. New rows use private below via the server default.
    op.execute("UPDATE entry_pages SET audience = CASE WHEN is_open THEN 'public' ELSE 'private' END")
    # A prior Setup-only audience value is the more specific compatibility
    # source for pages that were already enabled. Keep this portable across
    # SQLite/Postgres by decoding the versioned JSON in Python.
    bind = op.get_bind()
    tournaments = sa.table(
        "tournaments", sa.column("id", sa.Uuid()), sa.column("data", sa.JSON()),
    )
    entry_pages = sa.table(
        "entry_pages", sa.column("tournament_id", sa.Uuid()),
        sa.column("audience", sa.String(16)), sa.column("is_open", sa.Boolean()),
    )
    rows = bind.execute(
        sa.select(tournaments.c.id, tournaments.c.data)
        .join(entry_pages, entry_pages.c.tournament_id == tournaments.c.id)
        .where(entry_pages.c.is_open.is_(True))
    )
    for tournament_id, document in rows:
        if not isinstance(document, dict):
            continue
        setup = document.get("setup")
        section = setup.get("public-info") if isinstance(setup, dict) else None
        data = section.get("data") if isinstance(section, dict) else None
        value = data.get("visibility") if isinstance(data, dict) else None
        if value not in {"private", "unlisted", "public"}:
            continue
        bind.execute(
            entry_pages.update().where(entry_pages.c.tournament_id == tournament_id)
            .values(audience=value)
        )
    with op.batch_alter_table("entry_pages") as batch:
        batch.alter_column("audience", nullable=False, server_default="private")
        batch.create_check_constraint(
            "ck_entry_pages_audience",
            "audience IN ('private', 'unlisted', 'public')",
        )


def downgrade() -> None:
    with op.batch_alter_table("entry_pages") as batch:
        batch.drop_constraint("ck_entry_pages_audience", type_="check")
    op.drop_column("entry_pages", "audience")
