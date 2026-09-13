"""additive — pre-launch policy v2 / ADR 0024, ADR 0030: baseline

Batch-altered tables: none (all tables created fresh).
Constraint additions scan first and abort with offending keys; never purge.
Data conversions use revision-local tables and idempotent backfills.

Revision ID: 0001
Revises:
Create Date: 2026-09-12 13:56:34.345432

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_SQLITE_TRIGGERS = [
    "CREATE TRIGGER units_insert_pending BEFORE INSERT ON competition_units WHEN NEW.status = 'confirmed' BEGIN SELECT RAISE(ABORT, 'Create the unit pending before adding members'); END",
    "CREATE TRIGGER units_confirm_roster BEFORE UPDATE OF status ON competition_units WHEN NEW.status = 'confirmed' AND NOT EXISTS (SELECT 1 FROM competition_events e JOIN event_format_versions f ON f.id = e.format_version_id WHERE e.tournament_id = NEW.tournament_id AND e.id = NEW.competition_event_id AND (SELECT count(*) FROM unit_memberships m WHERE m.tournament_id = NEW.tournament_id AND m.unit_id = NEW.id AND m.status = 'active') BETWEEN f.roster_min AND f.roster_max) BEGIN SELECT RAISE(ABORT, 'Roster size is outside format bounds'); END",
    "CREATE TRIGGER members_insert_pending BEFORE INSERT ON unit_memberships WHEN EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = NEW.tournament_id AND u.id = NEW.unit_id AND u.status = 'confirmed') BEGIN SELECT RAISE(ABORT, 'Move the unit to pending before editing its roster'); END",
    "CREATE TRIGGER members_update_pending BEFORE UPDATE OF unit_id, competition_event_id, player_id, entry_id, slot, status ON unit_memberships WHEN EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = NEW.tournament_id AND u.id = NEW.unit_id AND u.status = 'confirmed') OR EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = OLD.tournament_id AND u.id = OLD.unit_id AND u.status = 'confirmed') BEGIN SELECT RAISE(ABORT, 'Move both units to pending before editing their roster'); END",
    "CREATE TRIGGER members_delete_pending BEFORE DELETE ON unit_memberships WHEN EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = OLD.tournament_id AND u.id = OLD.unit_id AND u.status = 'confirmed') BEGIN SELECT RAISE(ABORT, 'Move the unit to pending before editing its roster'); END",
    "CREATE TRIGGER events_format_fixed BEFORE UPDATE OF format_version_id ON competition_events WHEN NEW.format_version_id <> OLD.format_version_id AND EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = OLD.tournament_id AND u.competition_event_id = OLD.id) BEGIN SELECT RAISE(ABORT, 'Cannot change format after units exist'); END",
    "CREATE TRIGGER units_event_fixed BEFORE UPDATE OF competition_event_id ON competition_units WHEN NEW.competition_event_id <> OLD.competition_event_id BEGIN SELECT RAISE(ABORT, 'Move memberships to another unit instead'); END",
    "CREATE TRIGGER payments_immutable BEFORE UPDATE ON payments WHEN 1 = 1 BEGIN SELECT RAISE(ABORT, 'Payment records are append only'); END",
    "CREATE TRIGGER payments_keep_history BEFORE DELETE ON payments WHEN EXISTS (SELECT 1 FROM tournaments t WHERE t.id = OLD.tournament_id) BEGIN SELECT RAISE(ABORT, 'Payment records are append only'); END",
    "CREATE TRIGGER submissions_delete_draft BEFORE DELETE ON submissions WHEN OLD.status <> 'draft' AND EXISTS (SELECT 1 FROM tournaments t WHERE t.id = OLD.tournament_id) BEGIN SELECT RAISE(ABORT, 'Only draft submissions may be deleted'); END",
]

_POSTGRES_TRIGGERS = [
    "CREATE FUNCTION units_insert_pending_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'confirmed' THEN RAISE EXCEPTION 'Create the unit pending before adding members' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$",
    "CREATE TRIGGER units_insert_pending BEFORE INSERT ON competition_units FOR EACH ROW EXECUTE FUNCTION units_insert_pending_fn()",
    "CREATE FUNCTION units_confirm_roster_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'confirmed' AND NOT EXISTS (SELECT 1 FROM competition_events e JOIN event_format_versions f ON f.id = e.format_version_id WHERE e.tournament_id = NEW.tournament_id AND e.id = NEW.competition_event_id AND (SELECT count(*) FROM unit_memberships m WHERE m.tournament_id = NEW.tournament_id AND m.unit_id = NEW.id AND m.status = 'active') BETWEEN f.roster_min AND f.roster_max) THEN RAISE EXCEPTION 'Roster size is outside format bounds' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$",
    "CREATE TRIGGER units_confirm_roster BEFORE UPDATE OF status ON competition_units FOR EACH ROW EXECUTE FUNCTION units_confirm_roster_fn()",
    "CREATE FUNCTION members_insert_pending_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = NEW.tournament_id AND u.id = NEW.unit_id AND u.status = 'confirmed') THEN RAISE EXCEPTION 'Move the unit to pending before editing its roster' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$",
    "CREATE TRIGGER members_insert_pending BEFORE INSERT ON unit_memberships FOR EACH ROW EXECUTE FUNCTION members_insert_pending_fn()",
    "CREATE FUNCTION members_update_pending_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = NEW.tournament_id AND u.id = NEW.unit_id AND u.status = 'confirmed') OR EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = OLD.tournament_id AND u.id = OLD.unit_id AND u.status = 'confirmed') THEN RAISE EXCEPTION 'Move both units to pending before editing their roster' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$",
    "CREATE TRIGGER members_update_pending BEFORE UPDATE OF unit_id, competition_event_id, player_id, entry_id, slot, status ON unit_memberships FOR EACH ROW EXECUTE FUNCTION members_update_pending_fn()",
    "CREATE FUNCTION members_delete_pending_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = OLD.tournament_id AND u.id = OLD.unit_id AND u.status = 'confirmed') THEN RAISE EXCEPTION 'Move the unit to pending before editing its roster' USING ERRCODE = '23514'; END IF; RETURN OLD; END $$",
    "CREATE TRIGGER members_delete_pending BEFORE DELETE ON unit_memberships FOR EACH ROW EXECUTE FUNCTION members_delete_pending_fn()",
    "CREATE FUNCTION events_format_fixed_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.format_version_id <> OLD.format_version_id AND EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = OLD.tournament_id AND u.competition_event_id = OLD.id) THEN RAISE EXCEPTION 'Cannot change format after units exist' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$",
    "CREATE TRIGGER events_format_fixed BEFORE UPDATE OF format_version_id ON competition_events FOR EACH ROW EXECUTE FUNCTION events_format_fixed_fn()",
    "CREATE FUNCTION units_event_fixed_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.competition_event_id <> OLD.competition_event_id THEN RAISE EXCEPTION 'Move memberships to another unit instead' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$",
    "CREATE TRIGGER units_event_fixed BEFORE UPDATE OF competition_event_id ON competition_units FOR EACH ROW EXECUTE FUNCTION units_event_fixed_fn()",
    "CREATE FUNCTION payments_immutable_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF 1 = 1 THEN RAISE EXCEPTION 'Payment records are append only' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$",
    "CREATE TRIGGER payments_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION payments_immutable_fn()",
    "CREATE FUNCTION payments_keep_history_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM tournaments t WHERE t.id = OLD.tournament_id) THEN RAISE EXCEPTION 'Payment records are append only' USING ERRCODE = '23514'; END IF; RETURN OLD; END $$",
    "CREATE TRIGGER payments_keep_history BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION payments_keep_history_fn()",
    "CREATE FUNCTION submissions_delete_draft_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status <> 'draft' AND EXISTS (SELECT 1 FROM tournaments t WHERE t.id = OLD.tournament_id) THEN RAISE EXCEPTION 'Only draft submissions may be deleted' USING ERRCODE = '23514'; END IF; RETURN OLD; END $$",
    "CREATE TRIGGER submissions_delete_draft BEFORE DELETE ON submissions FOR EACH ROW EXECUTE FUNCTION submissions_delete_draft_fn()",
]


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "auth_throttle",
        sa.Column("key", sa.String(length=200), nullable=False),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_auth_throttle")),
    )
    op.create_table(
        "entrant_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("email_verified", sa.Boolean(), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("reset_token_hash", sa.String(length=64), nullable=True),
        sa.Column("reset_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verify_token_hash", sa.String(length=64), nullable=True),
        sa.Column("verify_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_entrant_accounts")),
    )
    op.create_table(
        "orgs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_orgs")),
    )
    op.create_table(
        "scoring_profile_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("profile_key", sa.String(length=60), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("rules", sa.JSON(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.CheckConstraint("version > 0", name="ck_scoring_profile_versions_1"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scoring_profile_versions")),
        sa.UniqueConstraint(
            "profile_key", "version", name=op.f("uq_scoring_profile_versions_profile_key_version")
        ),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("email_verified", sa.Boolean(), nullable=False),
        sa.Column("reset_token_hash", sa.String(length=64), nullable=True),
        sa.Column("reset_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_auth_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_sessions")),
    )
    with op.batch_alter_table("auth_sessions", schema=None) as batch_op:
        batch_op.create_index("ix_auth_sessions_user", ["user_id"], unique=False)
        batch_op.create_index("uq_auth_sessions_token_hash", ["token_hash"], unique=True)

    op.create_table(
        "entrant_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["entrant_accounts.id"],
            name=op.f("fk_entrant_sessions_account_id_entrant_accounts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_entrant_sessions")),
    )
    with op.batch_alter_table("entrant_sessions", schema=None) as batch_op:
        batch_op.create_index("ix_entrant_sessions_account", ["account_id"], unique=False)
        batch_op.create_index("uq_entrant_sessions_token_hash", ["token_hash"], unique=True)

    op.create_table(
        "event_format_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("format_key", sa.String(length=60), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("roster_min", sa.Integer(), nullable=False),
        sa.Column("roster_max", sa.Integer(), nullable=False),
        sa.Column("gender_rule", sa.String(length=30), nullable=False),
        sa.Column("scoring_profile_version_id", sa.Uuid(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "gender_rule IN ('event', 'mixed', 'open')", name="ck_event_format_versions_2"
        ),
        sa.CheckConstraint(
            "version > 0 AND roster_min > 0 AND roster_max >= roster_min",
            name="ck_event_format_versions_1",
        ),
        sa.ForeignKeyConstraint(
            ["scoring_profile_version_id"],
            ["scoring_profile_versions.id"],
            name=op.f(
                "fk_event_format_versions_scoring_profile_version_id_scoring_profile_versions"
            ),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_event_format_versions")),
        sa.UniqueConstraint(
            "format_key", "version", name=op.f("uq_event_format_versions_format_key_version")
        ),
    )
    op.create_table(
        "event_node_devices",
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("public_key", sa.String(length=128), nullable=False),
        sa.Column("enrolled_by", sa.Uuid(), nullable=False),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revocation_reason", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["orgs.id"],
            name=op.f("fk_event_node_devices_org_id_orgs"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("device_id", name=op.f("pk_event_node_devices")),
        sa.UniqueConstraint("public_key", name="uq_event_node_devices_public_key"),
    )
    with op.batch_alter_table("event_node_devices", schema=None) as batch_op:
        batch_op.create_index(
            "ix_event_node_devices_org_revoked", ["org_id", "revoked_at"], unique=False
        )

    op.create_table(
        "org_members",
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"], ["orgs.id"], name=op.f("fk_org_members_org_id_orgs"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_org_members_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("org_id", "user_id", name=op.f("pk_org_members")),
    )
    with op.batch_alter_table("org_members", schema=None) as batch_op:
        batch_op.create_index("ix_org_members_user", ["user_id"], unique=False)

    op.create_table(
        "tournaments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=True),
        sa.Column("org_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("owner_email", sa.String(length=320), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("tournament_date", sa.String(length=32), nullable=True),
        sa.Column("tournament_end_date", sa.String(length=32), nullable=True),
        sa.Column("time_zone", sa.String(length=64), server_default="UTC", nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("state_version", sa.Integer(), nullable=False),
        sa.Column("board_settings", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('meet', 'bracket')", name="ck_tournaments_kind"),
        sa.ForeignKeyConstraint(
            ["org_id"], ["orgs.id"], name=op.f("fk_tournaments_org_id_orgs"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tournaments")),
    )
    op.create_table(
        "bracket_events",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("discipline", sa.String(length=200), nullable=False),
        sa.Column("format", sa.String(length=20), nullable=False),
        sa.Column("duration_slots", sa.Integer(), nullable=False),
        sa.Column("bracket_size", sa.Integer(), nullable=True),
        sa.Column("seeded_count", sa.Integer(), nullable=False),
        sa.Column("rr_rounds", sa.Integer(), nullable=True),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_bracket_events_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_bracket_events")),
    )
    op.create_table(
        "cloud_event_projections",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("last_sequence", sa.Integer(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_cloud_event_projections_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", name=op.f("pk_cloud_event_projections")),
    )
    op.create_table(
        "competition_audit",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("actor_id", sa.String(length=100), nullable=True),
        sa.Column("request_id", sa.String(length=100), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_competition_audit_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_competition_audit")),
    )
    op.create_table(
        "competition_events",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("category_code", sa.String(length=100), nullable=False),
        sa.Column("format_version_id", sa.Uuid(), nullable=False),
        sa.Column("gender_category", sa.String(length=20), nullable=True),
        sa.Column("age_group", sa.String(length=40), nullable=True),
        sa.Column("level", sa.String(length=40), nullable=True),
        sa.Column("bracket_event_id", sa.String(length=100), nullable=True),
        sa.Column("meet_event_id", sa.String(length=40), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["format_version_id"],
            ["event_format_versions.id"],
            name=op.f("fk_competition_events_format_version_id_event_format_versions"),
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_competition_events_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_competition_events")),
        sa.UniqueConstraint(
            "tournament_id",
            "category_code",
            name=op.f("uq_competition_events_tournament_id_category_code"),
        ),
    )
    op.create_table(
        "display_tokens",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_display_tokens_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", name=op.f("pk_display_tokens")),
    )
    with op.batch_alter_table("display_tokens", schema=None) as batch_op:
        batch_op.create_index("uq_display_tokens_token", ["token"], unique=True)

    op.create_table(
        "entry_pages",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("is_open", sa.Boolean(), nullable=False),
        sa.Column("audience", sa.String(length=16), server_default="private", nullable=False),
        sa.Column("intro_text", sa.Text(), nullable=True),
        sa.Column("regulations_text", sa.Text(), nullable=True),
        sa.Column("waiver_required", sa.Boolean(), nullable=False),
        sa.Column("regulations_version", sa.Integer(), nullable=False),
        sa.Column("regulations_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entrants_published", sa.Boolean(), nullable=False),
        sa.Column("draws_published", sa.Boolean(), nullable=False),
        sa.Column("results_published", sa.Boolean(), nullable=False),
        sa.Column("fee_schedule", sa.JSON(), nullable=True),
        sa.Column("fee_currency", sa.String(length=3), nullable=True),
        sa.Column("payment_instructions", sa.Text(), nullable=True),
        sa.Column("max_events_per_person", sa.Integer(), nullable=True),
        sa.Column("discipline_caps", sa.JSON(), nullable=True),
        sa.Column("collect_phone", sa.Boolean(), nullable=False),
        sa.Column("venue_name", sa.String(length=200), nullable=True),
        sa.Column("venue_address", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "audience IN ('private', 'unlisted', 'public')", name="ck_entry_pages_audience"
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_entry_pages_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", name=op.f("pk_entry_pages")),
    )
    with op.batch_alter_table("entry_pages", schema=None) as batch_op:
        batch_op.create_index("uq_entry_pages_slug", ["slug"], unique=True)

    op.create_table(
        "entry_players",
        sa.Column("roster_key", sa.String(length=100), nullable=True),
        sa.Column("roster_attributes", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("gender", sa.String(length=20), nullable=False),
        sa.Column("club", sa.String(length=200), nullable=True),
        sa.Column("representation", sa.String(length=3), nullable=True),
        sa.Column("representation_public", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("birth_year", sa.Integer(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("erased_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_entry_players_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_entry_players")),
    )
    op.create_table(
        "invite_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_invite_links_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invite_links")),
    )
    op.create_table(
        "matches",
        sa.Column("machine_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("court_id", sa.Integer(), nullable=True),
        sa.Column("time_slot", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('scheduled', 'called', 'playing', 'finished', 'retired')",
            name="ck_matches_status",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_matches_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_matches")),
    )
    with op.batch_alter_table("matches", schema=None) as batch_op:
        batch_op.create_index(
            "ix_matches_tournament_status", ["tournament_id", "status"], unique=False
        )

    op.create_table(
        "meet_events",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("slot_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_meet_events_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_meet_events")),
    )
    op.create_table(
        "solve_jobs",
        sa.Column("machine_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("input_snapshot", sa.JSON(), nullable=False),
        sa.Column("trace_context", sa.JSON(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.JSON(), nullable=True),
        sa.Column("progress", sa.JSON(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=64), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("claimed_by", sa.String(length=64), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_solve_jobs_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_solve_jobs")),
    )
    with op.batch_alter_table("solve_jobs", schema=None) as batch_op:
        batch_op.create_index(
            "ix_solve_jobs_claimable",
            ["priority", "created_at"],
            unique=False,
            sqlite_where=sa.text("status = 'queued'"),
            postgresql_where=sa.text("status = 'queued'"),
        )
        batch_op.create_index(
            "uq_solve_jobs_active",
            ["tournament_id", "type"],
            unique=True,
            sqlite_where=sa.text("status IN ('queued', 'claimed', 'running')"),
            postgresql_where=sa.text("status IN ('queued', 'claimed', 'running')"),
        )
        batch_op.create_index(
            "uq_solve_jobs_idempotency_key", ["tournament_id", "idempotency_key"], unique=True
        )

    op.create_table(
        "submissions",
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("fee_currency", sa.String(length=3), nullable=True),
        sa.Column("short_reference", sa.String(length=8), nullable=False),
        sa.Column("idempotency_key", sa.String(length=64), nullable=True),
        sa.Column("regulations_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("regulations_version_accepted", sa.Integer(), nullable=True),
        sa.Column("fee_total_cents", sa.Integer(), nullable=True),
        sa.Column("fee_basis", sa.JSON(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'cancelled')", name="ck_submissions_status"
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["entrant_accounts.id"],
            name=op.f("fk_submissions_account_id_entrant_accounts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_submissions_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_submissions")),
    )
    with op.batch_alter_table("submissions", schema=None) as batch_op:
        batch_op.create_index("ix_submissions_account", ["account_id"], unique=False)
        batch_op.create_index("uq_submissions_short_reference", ["short_reference"], unique=True)
        batch_op.create_index(
            "uq_submissions_tournament_account_idempotency_key",
            ["tournament_id", "account_id", "idempotency_key"],
            unique=True,
        )

    op.create_table(
        "sync_checkpoints",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("highest_contiguous_sequence", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_sync_checkpoints_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "tournament_id", "authority_epoch", name=op.f("pk_sync_checkpoints")
        ),
    )
    op.create_table(
        "sync_inbox",
        sa.Column("operation_id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_sync_inbox_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("operation_id", name=op.f("pk_sync_inbox")),
        sa.UniqueConstraint(
            "tournament_id", "authority_epoch", "sequence", name="uq_sync_inbox_epoch_sequence"
        ),
    )
    op.create_table(
        "sync_quarantine",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=True),
        sa.Column("authority_epoch", sa.Integer(), nullable=True),
        sa.Column("operation_id", sa.Uuid(), nullable=True),
        sa.Column("reason_code", sa.String(length=80), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.Uuid(), nullable=True),
        sa.Column("resolution_operation_id", sa.Uuid(), nullable=True),
        sa.Column("resolution_note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('open', 'resolved')", name="ck_sync_quarantine_status"),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_sync_quarantine_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sync_quarantine")),
    )
    with op.batch_alter_table("sync_quarantine", schema=None) as batch_op:
        batch_op.create_index(
            "ix_sync_quarantine_tournament_created", ["tournament_id", "created_at"], unique=False
        )
        batch_op.create_index(
            "ix_sync_quarantine_tournament_status", ["tournament_id", "status"], unique=False
        )

    op.create_table(
        "tournament_authority_epochs",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("epoch", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("state", sa.String(length=24), nullable=False),
        sa.Column("checkpoint_hash", sa.String(length=64), nullable=False),
        sa.Column("checkpoint_schema_version", sa.Integer(), nullable=False),
        sa.Column("capability_digest", sa.String(length=64), nullable=False),
        sa.Column("grant", sa.JSON(), nullable=True),
        sa.Column("grant_signature", sa.String(length=128), nullable=True),
        sa.Column("grant_key_id", sa.String(length=128), nullable=True),
        sa.Column("allowed_command_classes", sa.JSON(), nullable=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recovery_reason", sa.String(length=500), nullable=True),
        sa.CheckConstraint(
            "state IN ('preparing', 'active', 'closed', 'recovered', 'cloud')",
            name="ck_tournament_authority_state",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_tournament_authority_epochs_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "tournament_id", "epoch", name=op.f("pk_tournament_authority_epochs")
        ),
    )
    with op.batch_alter_table("tournament_authority_epochs", schema=None) as batch_op:
        batch_op.create_index(
            "ix_tournament_authority_node_state", ["node_id", "state"], unique=False
        )
        batch_op.create_index(
            "uq_tournament_authority_one_live_epoch",
            ["tournament_id"],
            unique=True,
            sqlite_where=sa.text("state IN ('preparing', 'active')"),
            postgresql_where=sa.text("state IN ('preparing', 'active')"),
        )

    op.create_table(
        "tournament_authority_transitions",
        sa.Column("transition_id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("transition_type", sa.String(length=40), nullable=False),
        sa.Column("from_epoch", sa.Integer(), nullable=True),
        sa.Column("to_epoch", sa.Integer(), nullable=True),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("declared_last_sequence", sa.Integer(), nullable=True),
        sa.Column("evidence_hash", sa.String(length=128), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "transition_type IN ('return_to_cloud', 'planned_transfer', 'lost_node_recovery')",
            name="ck_authority_transition_type",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_tournament_authority_transitions_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("transition_id", name=op.f("pk_tournament_authority_transitions")),
    )
    with op.batch_alter_table("tournament_authority_transitions", schema=None) as batch_op:
        batch_op.create_index(
            "ix_authority_transitions_tournament_created",
            ["tournament_id", "created_at"],
            unique=False,
        )

    op.create_table(
        "tournament_backups",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(length=260), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("origin", sa.String(length=16), server_default="auto", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_tournament_backups_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tournament_backups")),
    )
    op.create_table(
        "tournament_members",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "role IN ('viewer', 'operator', 'owner')", name="ck_tournament_members_role"
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_tournament_members_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_tournament_members_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "user_id", name=op.f("pk_tournament_members")),
    )
    with op.batch_alter_table("tournament_members", schema=None) as batch_op:
        batch_op.create_index("ix_tournament_members_user", ["user_id"], unique=False)

    op.create_table(
        "workspace_modules",
        sa.Column("machine_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_workspace_modules_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workspace_modules")),
        sa.UniqueConstraint(
            "tournament_id", "module_id", name="uq_workspace_modules_tournament_module"
        ),
    )
    with op.batch_alter_table("workspace_modules", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_workspace_modules_tournament_id"), ["tournament_id"], unique=False
        )

    op.create_table(
        "bracket_matches",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("bracket_event_id", sa.String(length=100), nullable=False),
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("round_index", sa.Integer(), nullable=False),
        sa.Column("match_index", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("slot_a", sa.JSON(), nullable=False),
        sa.Column("slot_b", sa.JSON(), nullable=False),
        sa.Column("side_a", sa.JSON(), nullable=False),
        sa.Column("side_b", sa.JSON(), nullable=False),
        sa.Column("dependencies", sa.JSON(), nullable=False),
        sa.Column("expected_duration_slots", sa.Integer(), nullable=False),
        sa.Column("duration_variance_slots", sa.Integer(), nullable=False),
        sa.Column("child_unit_ids", sa.JSON(), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id", "bracket_event_id"],
            ["bracket_events.tournament_id", "bracket_events.id"],
            name=op.f("fk_bracket_matches_tournament_id_bracket_event_id_bracket_events"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "tournament_id", "bracket_event_id", "id", name=op.f("pk_bracket_matches")
        ),
    )
    with op.batch_alter_table("bracket_matches", schema=None) as batch_op:
        batch_op.create_index(
            "ix_bracket_matches_event_round",
            ["tournament_id", "bracket_event_id", "round_index"],
            unique=False,
        )

    op.create_table(
        "commands",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("match_id", sa.String(length=100), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("submitted_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["tournament_id", "match_id"],
            ["matches.tournament_id", "matches.id"],
            name=op.f("fk_commands_tournament_id_match_id_matches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_commands_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_commands")),
    )
    with op.batch_alter_table("commands", schema=None) as batch_op:
        batch_op.create_index(
            "ix_commands_submitted_by_created", ["submitted_by", "created_at"], unique=False
        )
        batch_op.create_index(
            "ix_commands_tournament_match_applied",
            ["tournament_id", "match_id", "applied_at"],
            unique=False,
        )

    op.create_table(
        "competition_units",
        sa.Column("projection_key", sa.String(length=100), nullable=True),
        sa.Column("seed", sa.Integer(), nullable=True),
        sa.Column("attributes", sa.JSON(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("competition_event_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'withdrawn')", name="ck_competition_units_1"
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "competition_event_id"],
            ["competition_events.tournament_id", "competition_events.id"],
            name=op.f("fk_competition_units_tournament_id_competition_event_id_competition_events"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_competition_units")),
        sa.UniqueConstraint(
            "tournament_id",
            "id",
            "competition_event_id",
            name=op.f("uq_competition_units_tournament_id_id_competition_event_id"),
        ),
    )
    op.create_table(
        "draw_instances",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("competition_event_id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft', 'generated', 'started', 'completed', 'superseded')",
            name="ck_draw_instances_2",
        ),
        sa.CheckConstraint("revision > 0", name="ck_draw_instances_1"),
        sa.ForeignKeyConstraint(
            ["tournament_id", "competition_event_id"],
            ["competition_events.tournament_id", "competition_events.id"],
            name=op.f("fk_draw_instances_tournament_id_competition_event_id_competition_events"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_draw_instances")),
        sa.UniqueConstraint(
            "tournament_id",
            "competition_event_id",
            "revision",
            name=op.f("uq_draw_instances_tournament_id_competition_event_id_revision"),
        ),
    )
    op.create_table(
        "entry_events",
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("discipline", sa.String(length=200), nullable=False),
        sa.Column("entry_type", sa.String(length=20), nullable=False),
        sa.Column("cap", sa.Integer(), nullable=True),
        sa.Column("fee_cents", sa.Integer(), nullable=True),
        sa.Column("gender_constraint", sa.String(length=20), nullable=True),
        sa.Column("opens_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("withdraws_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retention_days", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("competition_event_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["tournament_id", "competition_event_id"],
            ["competition_events.tournament_id", "competition_events.id"],
            name=op.f("fk_entry_events_tournament_id_competition_event_id_competition_events"),
            initially="DEFERRED",
            deferrable=True,
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_entry_events_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_entry_events")),
        sa.UniqueConstraint(
            "tournament_id", "code", name=op.f("uq_entry_events_tournament_id_code")
        ),
    )
    op.create_table(
        "event_operation_sequences",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("next_sequence", sa.Integer(), nullable=False),
        sa.CheckConstraint("next_sequence >= 1", name="ck_event_operation_sequence_positive"),
        sa.ForeignKeyConstraint(
            ["tournament_id", "authority_epoch"],
            ["tournament_authority_epochs.tournament_id", "tournament_authority_epochs.epoch"],
            name=op.f(
                "fk_event_operation_sequences_tournament_id_authority_epoch_tournament_authority_epochs"
            ),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "tournament_id", "authority_epoch", name=op.f("pk_event_operation_sequences")
        ),
    )
    op.create_table(
        "event_operations",
        sa.Column("operation_id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("command_type", sa.String(length=100), nullable=False),
        sa.Column("aggregate_type", sa.String(length=50), nullable=False),
        sa.Column("aggregate_id", sa.String(length=200), nullable=False),
        sa.Column("expected_version", sa.Integer(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("occurred_at_local", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at_node", sa.DateTime(timezone=True), nullable=False),
        sa.Column("traceparent", sa.String(length=128), nullable=True),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id", "authority_epoch"],
            ["tournament_authority_epochs.tournament_id", "tournament_authority_epochs.epoch"],
            name=op.f(
                "fk_event_operations_tournament_id_authority_epoch_tournament_authority_epochs"
            ),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_event_operations_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("operation_id", name=op.f("pk_event_operations")),
        sa.UniqueConstraint(
            "tournament_id",
            "authority_epoch",
            "sequence",
            name="uq_event_operations_epoch_sequence",
        ),
    )
    with op.batch_alter_table("event_operations", schema=None) as batch_op:
        batch_op.create_index(
            "ix_event_operations_aggregate",
            ["tournament_id", "aggregate_type", "aggregate_id"],
            unique=False,
        )

    op.create_table(
        "match_states",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("match_id", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("called_at", sa.String(length=40), nullable=True),
        sa.Column("actual_start_time", sa.String(length=40), nullable=True),
        sa.Column("actual_end_time", sa.String(length=40), nullable=True),
        sa.Column("score_side_a", sa.Integer(), nullable=True),
        sa.Column("score_side_b", sa.Integer(), nullable=True),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("original_slot_id", sa.Integer(), nullable=True),
        sa.Column("original_court_id", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id", "match_id"],
            ["matches.tournament_id", "matches.id"],
            name=op.f("fk_match_states_tournament_id_match_id_matches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_match_states_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "match_id", name=op.f("pk_match_states")),
    )
    op.create_table(
        "offline_operator_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("authority_epoch", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revocation_reason", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(
            ["tournament_id", "authority_epoch"],
            ["tournament_authority_epochs.tournament_id", "tournament_authority_epochs.epoch"],
            name=op.f(
                "fk_offline_operator_sessions_tournament_id_authority_epoch_tournament_authority_epochs"
            ),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_offline_operator_sessions_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_offline_operator_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_offline_operator_sessions")),
    )
    with op.batch_alter_table("offline_operator_sessions", schema=None) as batch_op:
        batch_op.create_index(
            "ix_offline_operator_sessions_scope", ["tournament_id", "user_id"], unique=False
        )
        batch_op.create_index(
            "uq_offline_operator_sessions_token_hash", ["token_hash"], unique=True
        )

    op.create_table(
        "payments",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("submission_id", sa.Uuid(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("actor_id", sa.String(length=100), nullable=False),
        sa.Column("request_id", sa.String(length=100), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_cents <> 0", name="ck_payments_1"),
        sa.CheckConstraint(
            "length(currency) = 3 AND currency = upper(currency)", name="ck_payments_2"
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "submission_id"],
            ["submissions.tournament_id", "submissions.id"],
            name=op.f("fk_payments_tournament_id_submission_id_submissions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_payments")),
        sa.UniqueConstraint(
            "tournament_id",
            "submission_id",
            "request_id",
            name=op.f("uq_payments_tournament_id_submission_id_request_id"),
        ),
    )
    op.create_table(
        "player_representatives",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("player_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["entrant_accounts.id"],
            name=op.f("fk_player_representatives_account_id_entrant_accounts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "player_id"],
            ["entry_players.tournament_id", "entry_players.id"],
            name=op.f("fk_player_representatives_tournament_id_player_id_entry_players"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "tournament_id", "player_id", "account_id", name=op.f("pk_player_representatives")
        ),
    )
    op.create_table(
        "bracket_participants",
        sa.Column("unit_id", sa.Uuid(), nullable=True),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("bracket_event_id", sa.String(length=100), nullable=False),
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("member_ids", sa.JSON(), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=False),
        sa.Column("entry_player_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id", "bracket_event_id"],
            ["bracket_events.tournament_id", "bracket_events.id"],
            name=op.f("fk_bracket_participants_tournament_id_bracket_event_id_bracket_events"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "entry_player_id"],
            ["entry_players.tournament_id", "entry_players.id"],
            name=op.f("fk_bracket_participants_tournament_id_entry_player_id_entry_players"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "unit_id"],
            ["competition_units.tournament_id", "competition_units.id"],
            name=op.f("fk_bracket_participants_tournament_id_unit_id_competition_units"),
        ),
        sa.PrimaryKeyConstraint(
            "tournament_id", "bracket_event_id", "id", name=op.f("pk_bracket_participants")
        ),
    )
    op.create_table(
        "bracket_results",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("bracket_event_id", sa.String(length=100), nullable=False),
        sa.Column("bracket_match_id", sa.String(length=100), nullable=False),
        sa.Column("winner_side", sa.String(length=10), nullable=False),
        sa.Column("score", sa.JSON(), nullable=True),
        sa.Column("finished_at_slot", sa.Integer(), nullable=True),
        sa.Column("walkover", sa.Boolean(), nullable=False),
        sa.Column("reason", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id", "bracket_event_id", "bracket_match_id"],
            [
                "bracket_matches.tournament_id",
                "bracket_matches.bracket_event_id",
                "bracket_matches.id",
            ],
            name=op.f(
                "fk_bracket_results_tournament_id_bracket_event_id_bracket_match_id_bracket_matches"
            ),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "tournament_id", "bracket_event_id", "bracket_match_id", name=op.f("pk_bracket_results")
        ),
    )
    op.create_table(
        "entries",
        sa.Column("machine_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entry_event_id", sa.Uuid(), nullable=False),
        sa.Column("submission_id", sa.Uuid(), nullable=True),
        sa.Column("entry_player_id", sa.Uuid(), nullable=True),
        sa.Column("state", sa.String(length=20), nullable=False),
        sa.Column("pending_reasons", sa.JSON(), nullable=False),
        sa.Column("list_opt_out", sa.Boolean(), nullable=False),
        sa.Column("fee_cents", sa.Integer(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "state IN ('unverified', 'pending', 'waitlisted', 'confirmed', 'rejected', 'withdrawn')",
            name="ck_entries_state",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "entry_event_id"],
            ["entry_events.tournament_id", "entry_events.id"],
            name=op.f("fk_entries_tournament_id_entry_event_id_entry_events"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "entry_player_id"],
            ["entry_players.tournament_id", "entry_players.id"],
            name=op.f("fk_entries_tournament_id_entry_player_id_entry_players"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "submission_id"],
            ["submissions.tournament_id", "submissions.id"],
            name=op.f("fk_entries_tournament_id_submission_id_submissions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_entries_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_entries")),
        sa.UniqueConstraint(
            "tournament_id",
            "id",
            "entry_player_id",
            name=op.f("uq_entries_tournament_id_id_entry_player_id"),
        ),
    )
    with op.batch_alter_table("entries", schema=None) as batch_op:
        batch_op.create_index(
            "ix_entries_event_player", ["entry_event_id", "entry_player_id"], unique=False
        )
        batch_op.create_index("ix_entries_submission", ["submission_id"], unique=False)

    op.create_table(
        "sync_outbox",
        sa.Column("operation_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("permanently_blocked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["operation_id"],
            ["event_operations.operation_id"],
            name=op.f("fk_sync_outbox_operation_id_event_operations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("operation_id", name=op.f("pk_sync_outbox")),
    )
    with op.batch_alter_table("sync_outbox", schema=None) as batch_op:
        batch_op.create_index(
            "ix_sync_outbox_pending",
            ["acknowledged_at", "permanently_blocked_at", "next_attempt_at"],
            unique=False,
        )

    op.create_table(
        "partner_invitations",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("inviting_entry_id", sa.Uuid(), nullable=False),
        sa.Column("accepted_entry_id", sa.Uuid(), nullable=True),
        sa.Column("recipient_email", sa.String(length=320), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("mail_sent", sa.Boolean(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status <> 'accepted' OR (accepted_entry_id IS NOT NULL AND accepted_at IS NOT NULL)",
            name="ck_partner_invitations_3",
        ),
        sa.CheckConstraint(
            "status IN ('sent', 'accepted', 'expired', 'revoked')", name="ck_partner_invitations_1"
        ),
        sa.CheckConstraint(
            "accepted_entry_id IS NULL OR accepted_entry_id <> inviting_entry_id",
            name="ck_partner_invitations_2",
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "accepted_entry_id"],
            ["entries.tournament_id", "entries.id"],
            name=op.f("fk_partner_invitations_tournament_id_accepted_entry_id_entries"),
            initially="DEFERRED",
            deferrable=True,
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "inviting_entry_id"],
            ["entries.tournament_id", "entries.id"],
            name=op.f("fk_partner_invitations_tournament_id_inviting_entry_id_entries"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_partner_invitations")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_partner_invitations_token_hash")),
    )
    with op.batch_alter_table("partner_invitations", schema=None) as batch_op:
        batch_op.create_index(
            "uq_partner_invitations_sent",
            ["tournament_id", "inviting_entry_id"],
            unique=True,
            sqlite_where=sa.text("status = 'sent'"),
            postgresql_where=sa.text("status = 'sent'"),
        )

    op.create_table(
        "unit_memberships",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("unit_id", sa.Uuid(), nullable=False),
        sa.Column("competition_event_id", sa.Uuid(), nullable=False),
        sa.Column("player_id", sa.Uuid(), nullable=False),
        sa.Column("entry_id", sa.Uuid(), nullable=True),
        sa.Column("slot", sa.Integer(), nullable=False),
        sa.Column("origin", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "(origin = 'manual' AND entry_id IS NULL) OR (origin = 'entry' AND entry_id IS NOT NULL)",
            name="ck_unit_memberships_3",
        ),
        sa.CheckConstraint("status IN ('active', 'withdrawn')", name="ck_unit_memberships_2"),
        sa.CheckConstraint("slot > 0", name="ck_unit_memberships_1"),
        sa.ForeignKeyConstraint(
            ["tournament_id", "entry_id", "player_id"],
            ["entries.tournament_id", "entries.id", "entries.entry_player_id"],
            name=op.f("fk_unit_memberships_tournament_id_entry_id_player_id_entries"),
            initially="DEFERRED",
            deferrable=True,
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "player_id"],
            ["entry_players.tournament_id", "entry_players.id"],
            name=op.f("fk_unit_memberships_tournament_id_player_id_entry_players"),
            initially="DEFERRED",
            deferrable=True,
        ),
        sa.ForeignKeyConstraint(
            ["tournament_id", "unit_id", "competition_event_id"],
            [
                "competition_units.tournament_id",
                "competition_units.id",
                "competition_units.competition_event_id",
            ],
            name=op.f(
                "fk_unit_memberships_tournament_id_unit_id_competition_event_id_competition_units"
            ),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "id", name=op.f("pk_unit_memberships")),
        sa.UniqueConstraint(
            "tournament_id",
            "competition_event_id",
            "player_id",
            name=op.f("uq_unit_memberships_tournament_id_competition_event_id_player_id"),
        ),
        sa.UniqueConstraint(
            "tournament_id", "entry_id", name=op.f("uq_unit_memberships_tournament_id_entry_id")
        ),
        sa.UniqueConstraint(
            "tournament_id",
            "unit_id",
            "slot",
            name=op.f("uq_unit_memberships_tournament_id_unit_id_slot"),
        ),
    )
    op.create_table(
        "state_transitions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tournament_id", sa.Uuid(), sa.ForeignKey("tournaments.id", ondelete="CASCADE")),
        sa.Column("machine", sa.String(80), nullable=False),
        sa.Column("machine_version", sa.Integer(), nullable=False),
        sa.Column("subject_type", sa.String(80), nullable=False),
        sa.Column("subject_id", sa.String(200), nullable=False),
        sa.Column("from_state", sa.String(40), nullable=False),
        sa.Column("to_state", sa.String(40), nullable=False),
        sa.Column("event", sa.String(80), nullable=False),
        sa.Column("actor_type", sa.String(20), nullable=False),
        sa.Column("actor_id", sa.String(100)),
        sa.Column("reason", sa.Text()),
        sa.Column("detail", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("machine_version > 0", name="ck_state_transitions_version"),
        sa.CheckConstraint("actor_type IN ('entrant', 'operator', 'system', 'bind')", name="ck_state_transitions_actor"),
    )
    op.create_index("ix_state_transitions_subject", "state_transitions", ["subject_type", "subject_id", "occurred_at"])

    op.create_index("uq_users_email_lower", "users", [sa.text("lower(email)")], unique=True)
    op.create_index(
        "uq_entrant_accounts_email_lower",
        "entrant_accounts",
        [sa.text("lower(email)")],
        unique=True,
    )
    dialect = op.get_bind().dialect.name
    for sql in _SQLITE_TRIGGERS if dialect == "sqlite" else _POSTGRES_TRIGGERS:
        op.execute(sql)
    profiles = sa.table(
        "scoring_profile_versions",
        sa.column("id", sa.Uuid()),
        sa.column("profile_key", sa.String()),
        sa.column("version", sa.Integer()),
        sa.column("rules", sa.JSON()),
        sa.column("published", sa.Boolean()),
    )
    formats = sa.table(
        "event_format_versions",
        sa.column("id", sa.Uuid()),
        sa.column("format_key", sa.String()),
        sa.column("version", sa.Integer()),
        sa.column("roster_min", sa.Integer()),
        sa.column("roster_max", sa.Integer()),
        sa.column("gender_rule", sa.String()),
        sa.column("scoring_profile_version_id", sa.Uuid()),
        sa.column("published", sa.Boolean()),
    )
    import uuid

    scoring_id = uuid.UUID("dcc04c70-10fa-53bb-9950-ef5ed81ed212")
    op.bulk_insert(
        profiles,
        [
            {
                "id": scoring_id,
                "profile_key": "badminton",
                "version": 1,
                "rules": {
                    "scoring": "badminton",
                    "pointsPerSet": 21,
                    "deuceEnabled": True,
                    "pointCap": 30,
                    "setsToWin": 2,
                },
                "published": True,
            }
        ],
    )
    op.bulk_insert(
        formats,
        [
            {
                "id": uuid.UUID("1e784de2-99ce-5d48-89f1-9a475ef7e3d8"),
                "format_key": "singles",
                "version": 1,
                "roster_min": 1,
                "roster_max": 1,
                "gender_rule": "event",
                "scoring_profile_version_id": scoring_id,
                "published": True,
            }
        ],
    )
    op.bulk_insert(
        formats,
        [
            {
                "id": uuid.UUID("d0b32878-53e5-5dd5-9ed2-aadd5dda355c"),
                "format_key": "doubles",
                "version": 1,
                "roster_min": 2,
                "roster_max": 2,
                "gender_rule": "event",
                "scoring_profile_version_id": scoring_id,
                "published": True,
            }
        ],
    )
    op.bulk_insert(
        formats,
        [
            {
                "id": uuid.UUID("efc8fd0b-044d-5ee4-9068-cecf86802a07"),
                "format_key": "mixed",
                "version": 1,
                "roster_min": 2,
                "roster_max": 2,
                "gender_rule": "mixed",
                "scoring_profile_version_id": scoring_id,
                "published": True,
            }
        ],
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    raise NotImplementedError("forward-only until GA")
