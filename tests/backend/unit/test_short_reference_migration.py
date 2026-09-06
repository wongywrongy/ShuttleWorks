"""Upgrade a POPULATED pre-reference database, not just an empty schema.

`short_reference` is `NOT NULL` and unique, and every laptop and the demo
database already hold `submissions` rows. That is the whole reason V3-24-1
is two revisions — add nullable and backfill (`c3d8e2f6a1b5`), then tighten
(`c4e9f3a7b2c6`) — and a test that only ever runs the pair against an empty
table would be green for a migration that cannot run anywhere real.

Same shape as `test_audience_migration.py`, for the same reason it exists.
"""
from __future__ import annotations

import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from _helpers import purge_backend_modules

_BACKEND = Path(__file__).resolve().parents[3] / "apps" / "api"

_PRE = "b1c6d0e5f2a7"  # the revision before the reference existed
_ADDED = "c3d8e2f6a1b5"
_ALPHABET = set("23456789ABCDEFGHJKMNPQRSTUVWXYZ")


def test_existing_submissions_are_backfilled_and_then_the_column_is_required(
    tmp_path, monkeypatch
):
    from alembic import command
    from alembic.config import Config

    url = f"sqlite:///{tmp_path / 'reference.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    monkeypatch.syspath_prepend(str(_BACKEND / "src"))
    purge_backend_modules()
    cfg = Config()
    cfg.set_main_option("script_location", str(_BACKEND / "src" / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    try:
        command.upgrade(cfg, _PRE)
        engine = sa.create_engine(url)
        now = "2026-09-05 00:00:00"
        # Two workspaces, so the backfill is exercised across the composite
        # primary key it has to name rows by — updating on ``id`` alone
        # would be a different (and wrong) migration.
        wanted = 6
        with engine.begin() as conn:
            for index in range(wanted):
                tid = uuid.uuid4().hex
                account = uuid.uuid4().hex
                conn.exec_driver_sql(
                    "INSERT INTO tournaments (id,name,status,schema_version,data,created_at,updated_at)"
                    " VALUES (?,?,'draft',1,'{}',?,?)",
                    (tid, f"Tournament {index}", now, now),
                )
                conn.exec_driver_sql(
                    "INSERT INTO entrant_accounts (id,email,password_hash,created_at,updated_at)"
                    " VALUES (?,?,'x',?,?)",
                    (account, f"entrant{index}@example.com", now, now),
                )
                conn.exec_driver_sql(
                    "INSERT INTO submissions (tournament_id,id,account_id,submitted_at,updated_at)"
                    " VALUES (?,?,?,?,?)",
                    (tid, uuid.uuid4().hex, account, now, now),
                )

        command.upgrade(cfg, "head")
        command.check(cfg)

        with engine.begin() as conn:
            references = [
                row[0]
                for row in conn.exec_driver_sql(
                    "SELECT short_reference FROM submissions"
                ).all()
            ]
            assert len(references) == wanted
            # Every pre-existing row got one, and no two rows share one —
            # the property a `server_default` would have quietly broken.
            assert len(set(references)) == wanted
            assert all(len(value) == 8 for value in references)
            assert all(set(value) <= _ALPHABET for value in references)

            column = next(
                c
                for c in sa.inspect(conn).get_columns("submissions")
                if c["name"] == "short_reference"
            )
            assert column["nullable"] is False

            # The tightening is real, and the index survived the SQLite
            # table rebuild batch mode performs.
            with pytest.raises(sa.exc.IntegrityError):
                conn.exec_driver_sql(
                    "UPDATE submissions SET short_reference = NULL"
                )
        with engine.begin() as conn:
            with pytest.raises(sa.exc.IntegrityError):
                conn.exec_driver_sql(
                    "UPDATE submissions SET short_reference = 'H4KJ29QW'"
                )

        # And the pair reverses: down to the add, then off entirely.
        command.downgrade(cfg, _ADDED)
        command.downgrade(cfg, _PRE)
        assert "short_reference" not in {
            c["name"] for c in sa.inspect(engine).get_columns("submissions")
        }
        command.upgrade(cfg, "head")
        engine.dispose()
    finally:
        purge_backend_modules()
