"""additive — app-owned operator MFA and bounded sessions (security program P08).

Existing session lifetimes are capped at twelve hours from their original issue.
No existing row is asserted to have completed MFA: production callers must enroll
and authenticate through the new flow. Factor seeds are encrypted, recovery codes
are hashes, and node factors are never part of an event checkpoint.
"""
from datetime import timedelta, timezone

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("auth_sessions", "offline_operator_sessions"):
        op.add_column(name, sa.Column("authenticated_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(name, sa.Column("mfa_generation", sa.Integer, nullable=True))
        table = sa.table(name, sa.column("id", sa.Uuid), sa.column("created_at", sa.DateTime(timezone=True)),
                         sa.column("expires_at", sa.DateTime(timezone=True)))
        connection = op.get_bind()
        for row in connection.execute(sa.select(table).execution_options(yield_per=1000)):
            issued = row.created_at
            if issued.tzinfo is None:
                issued = issued.replace(tzinfo=timezone.utc)
            expires = row.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            cap = issued + timedelta(hours=12)
            if expires > cap:
                connection.execute(table.update().where(table.c.id == row.id).values(expires_at=cap))
    op.create_table("operator_mfa_factors",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("user_id", sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope", sa.String(80), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("generation", sa.Integer, nullable=False),
        sa.Column("revision", sa.Integer, nullable=False),
        sa.Column("secret_ciphertext", sa.LargeBinary),
        sa.Column("key_id", sa.String(16)),
        sa.Column("pending_ciphertext", sa.LargeBinary),
        sa.Column("pending_key_id", sa.String(16)),
        sa.Column("pending_expires_at", sa.DateTime(timezone=True)),
        sa.Column("pending_session_id", sa.Uuid),
        sa.Column("last_counter", sa.BigInteger, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_operator_mfa_factors_user"),
        sa.CheckConstraint("status IN ('unconfigured', 'active')", name="ck_operator_mfa_factor_status"),
        sa.CheckConstraint("generation >= 0 AND revision >= 0 AND last_counter >= -1", name="ck_operator_mfa_factor_versions"),
        sa.CheckConstraint("status != 'active' OR (secret_ciphertext IS NOT NULL AND key_id IS NOT NULL AND generation > 0)", name="ck_operator_mfa_factor_active_secret"),
        sa.CheckConstraint("(pending_ciphertext IS NULL AND pending_key_id IS NULL AND pending_expires_at IS NULL AND pending_session_id IS NULL) OR (pending_ciphertext IS NOT NULL AND pending_key_id IS NOT NULL AND pending_expires_at IS NOT NULL AND pending_session_id IS NOT NULL)", name="ck_operator_mfa_factor_pending_secret"),
    )
    op.create_table("operator_recovery_codes",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("factor_id", sa.Uuid, sa.ForeignKey("operator_mfa_factors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("uq_operator_recovery_codes_token_hash", "operator_recovery_codes", ["token_hash"], unique=True)
    op.create_index("ix_operator_recovery_codes_factor", "operator_recovery_codes", ["factor_id"])


def downgrade() -> None:
    raise NotImplementedError("forward-only until GA")
