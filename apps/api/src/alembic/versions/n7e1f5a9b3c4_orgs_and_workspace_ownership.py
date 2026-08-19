"""orgs + workspace ownership backfill (SP-CLOUD-2 Phase 2)

Introduces the owning entity (org) and maps ALL existing data into the
new model losslessly (Rule 11):

1. every distinct user UUID referenced by ``tournament_members``,
   ``tournaments.owner_id`` or ``invite_links.created_by`` gets a
   ``users`` row (UUID preserved; email from ``owner_email`` where
   known, unique placeholder otherwise; the zero-UUID synthetic user
   becomes the local bootstrap identity),
2. every user gets a personal org + owner membership,
3. every tournament gets ``org_id`` = its owner's personal org
   (owner_id → sole owner-role member → bootstrap, in that order —
   no workspace can come out unowned),
4. ``tournament_members.user_id`` gains a real FK to ``users``.

Downgrade removes the org layer and the FK; ``tournament_members`` /
``tournaments`` data is untouched in either direction. Seeded ``users``
rows are left in place on downgrade (they live in the previous
revision's table and removing them would strand sessions).

Revision ID: n7e1f5a9b3c4
Revises: m6d0e4f8a2b3
Create Date: 2026-08-03
"""
from __future__ import annotations

import uuid as uuid_mod
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

revision = "n7e1f5a9b3c4"
down_revision = "m6d0e4f8a2b3"
branch_labels = None
depends_on = None

BOOTSTRAP_UUID = uuid_mod.UUID("00000000-0000-0000-0000-000000000000")

# Lightweight typed table handles so UUID/datetime binding is handled
# per-dialect by SQLAlchemy (SQLite stores undashed hex — never build
# raw string literals for Uuid columns).
_users = sa.table(
    "users",
    sa.column("id", sa.Uuid()),
    sa.column("email", sa.String()),
    sa.column("password_hash", sa.String()),
    sa.column("display_name", sa.String()),
    sa.column("email_verified", sa.Boolean()),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)
_orgs = sa.table(
    "orgs",
    sa.column("id", sa.Uuid()),
    sa.column("name", sa.String()),
    sa.column("created_at", sa.DateTime(timezone=True)),
)
_org_members = sa.table(
    "org_members",
    sa.column("org_id", sa.Uuid()),
    sa.column("user_id", sa.Uuid()),
    sa.column("role", sa.String()),
    sa.column("created_at", sa.DateTime(timezone=True)),
)
_tournaments = sa.table(
    "tournaments",
    sa.column("id", sa.Uuid()),
    sa.column("owner_id", sa.Uuid()),
    sa.column("owner_email", sa.String()),
    sa.column("org_id", sa.Uuid()),
)
_members = sa.table(
    "tournament_members",
    sa.column("tournament_id", sa.Uuid()),
    sa.column("user_id", sa.Uuid()),
    sa.column("role", sa.String()),
)
_invites = sa.table(
    "invite_links",
    sa.column("created_by", sa.Uuid()),
)


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    bind = op.get_bind()

    # -- 1. org layer ---------------------------------------------------
    op.create_table(
        "orgs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "org_members",
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("org_id", "user_id"),
    )
    op.create_index("ix_org_members_user", "org_members", ["user_id"])

    with op.batch_alter_table("tournaments") as batch:
        batch.add_column(sa.Column("org_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_tournaments_org", "orgs", ["org_id"], ["id"], ondelete="RESTRICT"
        )

    # -- 2. seed users for every historical UUID ------------------------
    existing_users = {u for (u,) in bind.execute(sa.select(_users.c.id))}
    existing_emails = {
        e.lower() for (e,) in bind.execute(sa.select(_users.c.email))
    }

    owner_email_by_uuid: dict = {}
    tournament_rows = bind.execute(
        sa.select(
            _tournaments.c.id,
            _tournaments.c.owner_id,
            _tournaments.c.owner_email,
        )
    ).fetchall()
    for _tid, owner_id, owner_email in tournament_rows:
        if owner_id is not None and owner_email:
            owner_email_by_uuid.setdefault(owner_id, owner_email)

    referenced: set = set()
    for (uid,) in bind.execute(sa.select(_members.c.user_id).distinct()):
        referenced.add(uid)
    for (uid,) in bind.execute(sa.select(_tournaments.c.owner_id).distinct()):
        if uid is not None:
            referenced.add(uid)
    for (uid,) in bind.execute(sa.select(_invites.c.created_by).distinct()):
        if uid is not None:
            referenced.add(uid)

    def _seed_user(uid) -> None:
        if uid in existing_users:
            return
        if uid == BOOTSTRAP_UUID:
            email, display, verified = "local@dev", "Local Operator", True
        else:
            email = owner_email_by_uuid.get(uid) or ""
            if not email or email.lower() in existing_emails:
                email = f"user-{uid.hex[:12]}@unmigrated.local"
            display, verified = None, False
        bind.execute(
            _users.insert().values(
                id=uid,
                email=email,
                password_hash=None,
                display_name=display,
                email_verified=verified,
                created_at=now,
                updated_at=now,
            )
        )
        existing_users.add(uid)
        existing_emails.add(email.lower())

    for uid in referenced:
        _seed_user(uid)

    # -- 3. personal org per user + workspace ownership -----------------
    org_by_user: dict = {}
    for uid in existing_users:
        if uid == BOOTSTRAP_UUID:
            org_name = "Local Workspace"
        else:
            email_row = bind.execute(
                sa.select(_users.c.email, _users.c.display_name).where(
                    _users.c.id == uid
                )
            ).first()
            base = (email_row.display_name or email_row.email.split("@")[0]) if email_row else "Personal"
            org_name = f"{base}'s workspace"[:200]
        org_id = uuid_mod.uuid4()
        bind.execute(
            _orgs.insert().values(id=org_id, name=org_name, created_at=now)
        )
        bind.execute(
            _org_members.insert().values(
                org_id=org_id, user_id=uid, role="owner", created_at=now
            )
        )
        org_by_user[uid] = org_id

    def _bootstrap_org():
        if BOOTSTRAP_UUID not in org_by_user:
            _seed_user(BOOTSTRAP_UUID)
            org_id = uuid_mod.uuid4()
            bind.execute(
                _orgs.insert().values(
                    id=org_id, name="Local Workspace", created_at=now
                )
            )
            bind.execute(
                _org_members.insert().values(
                    org_id=org_id,
                    user_id=BOOTSTRAP_UUID,
                    role="owner",
                    created_at=now,
                )
            )
            org_by_user[BOOTSTRAP_UUID] = org_id
        return org_by_user[BOOTSTRAP_UUID]

    owner_member_by_tid: dict = {}
    for tid, uid, role in bind.execute(
        sa.select(_members.c.tournament_id, _members.c.user_id, _members.c.role)
    ):
        if role == "owner":
            owner_member_by_tid.setdefault(tid, uid)

    for tid, owner_id, _owner_email in tournament_rows:
        anchor = owner_id or owner_member_by_tid.get(tid)
        org_id = org_by_user.get(anchor) if anchor is not None else None
        if org_id is None:
            org_id = _bootstrap_org()  # catch-all: no workspace is orphaned
        bind.execute(
            _tournaments.update()
            .where(_tournaments.c.id == tid)
            .values(org_id=org_id)
        )

    # -- 4. real FK on tournament_members.user_id -----------------------
    with op.batch_alter_table("tournament_members") as batch:
        batch.create_foreign_key(
            "fk_tournament_members_user",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.create_index("ix_tournament_members_user", ["user_id"])


def downgrade() -> None:
    with op.batch_alter_table("tournament_members") as batch:
        batch.drop_index("ix_tournament_members_user")
        batch.drop_constraint("fk_tournament_members_user", type_="foreignkey")
    with op.batch_alter_table("tournaments") as batch:
        batch.drop_constraint("fk_tournaments_org", type_="foreignkey")
        batch.drop_column("org_id")
    op.drop_index("ix_org_members_user", table_name="org_members")
    op.drop_table("org_members")
    op.drop_table("orgs")
