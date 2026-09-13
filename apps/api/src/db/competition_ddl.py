"""Database backstops for competition invariants on both supported dialects.

Services report readable failures first. These guards protect direct SQL too.
All trigger names and messages are constants; no user input enters DDL.
"""

from sqlalchemy import event


def trigger_specs():
    confirmed = "EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = {row}.tournament_id AND u.id = {row}.unit_id AND u.status = 'confirmed')"
    specs = [
        (
            "units_insert_pending",
            "competition_units",
            "INSERT",
            "NEW.status = 'confirmed'",
            "Create the unit pending before adding members",
        ),
        (
            "units_confirm_roster",
            "competition_units",
            "UPDATE OF status",
            "NEW.status = 'confirmed' AND NOT EXISTS (SELECT 1 FROM competition_events e JOIN event_format_versions f ON f.id = e.format_version_id WHERE e.tournament_id = NEW.tournament_id AND e.id = NEW.competition_event_id AND (SELECT count(*) FROM unit_memberships m WHERE m.tournament_id = NEW.tournament_id AND m.unit_id = NEW.id AND m.status = 'active') BETWEEN f.roster_min AND f.roster_max)",
            "Roster size is outside format bounds",
        ),
        (
            "members_insert_pending",
            "unit_memberships",
            "INSERT",
            confirmed.format(row="NEW"),
            "Move the unit to pending before editing its roster",
        ),
        (
            "members_update_pending",
            "unit_memberships",
            "UPDATE OF unit_id, competition_event_id, player_id, entry_id, slot, status",
            f"{confirmed.format(row='NEW')} OR {confirmed.format(row='OLD')}",
            "Move both units to pending before editing their roster",
        ),
        (
            "members_delete_pending",
            "unit_memberships",
            "DELETE",
            confirmed.format(row="OLD"),
            "Move the unit to pending before editing its roster",
        ),
        (
            "events_format_fixed",
            "competition_events",
            "UPDATE OF format_version_id",
            "NEW.format_version_id <> OLD.format_version_id AND EXISTS (SELECT 1 FROM competition_units u WHERE u.tournament_id = OLD.tournament_id AND u.competition_event_id = OLD.id)",
            "Cannot change format after units exist",
        ),
        (
            "units_event_fixed",
            "competition_units",
            "UPDATE OF competition_event_id",
            "NEW.competition_event_id <> OLD.competition_event_id",
            "Move memberships to another unit instead",
        ),
        ("payments_immutable", "payments", "UPDATE", "1 = 1", "Payment records are append only"),
        (
            "payments_keep_history",
            "payments",
            "DELETE",
            "EXISTS (SELECT 1 FROM tournaments t WHERE t.id = OLD.tournament_id)",
            "Payment records are append only",
        ),
        (
            "submissions_delete_draft",
            "submissions",
            "DELETE",
            "OLD.status <> 'draft' AND EXISTS (SELECT 1 FROM tournaments t WHERE t.id = OLD.tournament_id)",
            "Only draft submissions may be deleted",
        ),
    ]
    return specs


def statements(dialect):
    for name, table, operation, condition, message in trigger_specs():
        if dialect == "sqlite":
            yield f"CREATE TRIGGER IF NOT EXISTS {name} BEFORE {operation} ON {table} WHEN {condition} BEGIN SELECT RAISE(ABORT, '{message}'); END"
        elif dialect == "postgresql":
            row = "OLD" if operation == "DELETE" else "NEW"
            yield f"CREATE FUNCTION {name}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF {condition} THEN RAISE EXCEPTION '{message}' USING ERRCODE = '23514'; END IF; RETURN {row}; END $$"
            yield f"CREATE TRIGGER {name} BEFORE {operation} ON {table} FOR EACH ROW EXECUTE FUNCTION {name}_fn()"


def install(connection):
    for sql in statements(connection.dialect.name):
        connection.exec_driver_sql(sql)


def register(metadata):
    @event.listens_for(metadata, "after_create")
    def create_guards(target, connection, **kw):
        install(connection)
