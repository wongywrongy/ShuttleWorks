"""Alembic environment.

Pulls the database URL from ``core.config.settings`` so a single env var
(``DATABASE_URL``) drives both runtime sessions and migrations. Target
metadata is the ``Base`` declarative base from ``db.models``;
``--autogenerate`` diffs the live database against that metadata.

Invoke from ``apps/api/``:

  alembic upgrade head
  alembic revision --autogenerate -m "<message>"
"""
from __future__ import annotations

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# ``prepend_sys_path = src`` in alembic.ini puts apps/api/src on sys.path,
# so these imports resolve when alembic is run from apps/api/.
from core.config import settings  # noqa: E402
from db.models import Base  # noqa: E402
from db.session import normalize_database_url  # noqa: E402

config = context.config

if config.config_file_name is not None:
    # ``disable_existing_loggers=False`` is load-bearing, not tidiness.
    # ``fileConfig`` defaults it to True, which disables every logger that
    # already exists and is not named in the ini. The app runs migrations
    # from its own lifespan (``core.main._run_migrations``), by which point
    # uvicorn has already created ``uvicorn``, ``uvicorn.error`` and
    # ``uvicorn.access`` — so the default silently switched the server's
    # entire log off a few hundred milliseconds into startup. The effect
    # was total and invisible: no access log line, and no traceback for
    # any unhandled exception (uvicorn logs those on ``uvicorn.error``),
    # so 500s were served with a bare ``Internal Server Error`` body and
    # nothing at all in ``docker logs``. It hid a live availability defect
    # for as long as it existed. Guarded by
    # ``tests/unit/test_logging_survives_migrations.py``.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Explicit programmatic URLs take precedence; CLI defaults come from settings.
# The ini URL is blank so DATABASE_URL remains the normal entry point.
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", normalize_database_url(settings.database_url).replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # SQLite needs batch mode for ALTER TABLE; harmless on Postgres.
        render_as_batch=url.startswith("sqlite"),
    )

    with context.begin_transaction():
        context.run_migrations()


def render_item(kind, obj, autogen_context):
    # Freeze the SQL type in revisions, never import a mutable application type.
    from db.blob_version import VersionedJSON
    if kind == "type" and isinstance(obj, VersionedJSON):
        return "sa.JSON()"
    return False


def migrate_connection(connection) -> None:
    sqlite = connection.dialect.name == "sqlite"
    raw = connection.connection.driver_connection if sqlite else None
    foreign_keys = raw.execute("PRAGMA foreign_keys").fetchone()[0] if sqlite else None
    if sqlite:
        if raw.in_transaction:
            raise RuntimeError("SQLite migrations require a connection outside a transaction")
        # Batch rebuilds must not fire child cascades when dropping originals.
        raw.execute("PRAGMA foreign_keys=OFF")
    try:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=sqlite,
            compare_type=True,
            render_item=render_item,
        )
        with context.begin_transaction():
            context.run_migrations()
    finally:
        if sqlite:
            # Alembic commits its own transaction. On failure, roll it back
            # before returning a pooled connection with enforcement restored.
            if connection.in_transaction():
                connection.rollback()
            raw.execute(f"PRAGMA foreign_keys={foreign_keys}")


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        migrate_connection(connection)
        return
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    try:
        with connectable.connect() as connection:
            migrate_connection(connection)
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
