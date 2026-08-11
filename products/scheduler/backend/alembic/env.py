"""Alembic environment.

Pulls the database URL from ``app.config.settings`` so a single env var
(``DATABASE_URL``) drives both runtime sessions and migrations. Target
metadata is the ``Base`` declarative base from ``database.models``;
``--autogenerate`` diffs the live database against that metadata.

Invoke from ``products/scheduler/backend/``:

  alembic upgrade head
  alembic revision --autogenerate -m "<message>"
"""
from __future__ import annotations

from logging.config import fileConfig

from sqlalchemy import engine_from_config, event, pool

from alembic import context

# ``prepend_sys_path = .`` in alembic.ini puts backend/ on sys.path so
# these imports resolve when alembic is run from products/scheduler/backend/.
from app.config import settings  # noqa: E402
from database.models import Base  # noqa: E402
from database.session import normalize_database_url  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override sqlalchemy.url from settings — keeps the canonical source of
# truth in one place. The ini file's placeholder is left blank.
config.set_main_option("sqlalchemy.url", normalize_database_url(settings.database_url))

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


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    if connectable.dialect.name == "sqlite":
        # ``database.session`` turns ``PRAGMA foreign_keys`` ON for every
        # SQLite connection so the models' ON DELETE CASCADE actually fires.
        # Migrations must opt back OUT: batch mode rebuilds a table by
        # DROPping the original, and with enforcement on SQLite runs an
        # implicit DELETE FROM before that DROP, firing every child CASCADE.
        # MEASURED: upgrading a populated pre-orgs database through
        # n7e1f5a9b3c4 (which batch-alters ``tournaments``) deleted every
        # matches / match_states / tournament_backups / tournament_members
        # row. Enforcement is connection-scoped, so this affects migrations
        # only — the application's own connections keep it on.
        #
        # It must go through the ``connect`` event, not
        # ``connection.exec_driver_sql``: SQLAlchemy 2.0 autobegins on the
        # first execute, the pragma is silently ignored inside a transaction,
        # and the leftover outer transaction rolls the entire migration back
        # when the connection closes. That failure is invisible — Alembic
        # still logs every "Running upgrade" line.
        @event.listens_for(connectable, "connect")
        def _fk_off_for_migrations(dbapi_connection, _connection_record):  # noqa: ANN001
            dbapi_connection.execute("PRAGMA foreign_keys=OFF")

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=settings.database_url.startswith("sqlite"),
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
