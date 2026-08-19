"""Running Alembic must not switch the application's logging off.

**The defect this pins.** ``alembic/env.py`` calls
``logging.config.fileConfig(alembic.ini)``, and ``fileConfig`` defaults
``disable_existing_loggers`` to True: every logger that already exists and
is not named in the ini gets ``disabled = True`` — permanently, for the
life of the process. The app runs its migrations from its own lifespan
(``app.main._run_migrations``), long after uvicorn has created
``uvicorn``, ``uvicorn.error`` and ``uvicorn.access``. So a few hundred
milliseconds into startup the server's entire log went dark.

Measured on the running stack before the fix: ``docker logs`` held 130
lines, all of them Alembic and pre-migration startup, after hundreds of
requests and dozens of 500 responses. No access log. No traceback —
uvicorn reports unhandled exceptions on ``uvicorn.error``, so a live
availability defect served bare ``Internal Server Error`` bodies with
nothing whatsoever written down. Observability failing silently is worse
than observability missing loudly, because the absence of errors in the
log reads as the absence of errors.

**Why the suite could not see it.** ``tests/unit/test_entries_migration.py``
builds its Alembic config *without* an ini file, and says so in a comment:
env.py skips ``fileConfig`` when ``config_file_name`` is None, "so running
migrations in-process does not reconfigure pytest's logging". The one test
that ran migrations for real had already routed around the hazard. This
test does the opposite on purpose — it uses the shipped ``alembic.ini``,
which is what the application uses.

``command.current`` is enough: it loads and executes env.py (where the
``fileConfig`` call lives) without applying a single revision.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import pytest

from _helpers import purge_backend_modules

_BACKEND = Path(__file__).resolve().parents[3] / "apps" / "api"

# Named because they are the ones that actually went dark: uvicorn's access
# log and the channel it reports unhandled exceptions on, plus one of the
# application's own loggers.
LOGGERS_THAT_MUST_SURVIVE = ("uvicorn", "uvicorn.error", "uvicorn.access", "scheduler.app")


@pytest.fixture
def _restore_logging():
    """Undo whatever ``fileConfig`` does to process-wide logging state.

    This test deliberately lets the real ini reconfigure logging, which
    would otherwise leak into every test that runs after it — including
    pytest's own capture handlers on the root logger.
    """
    root = logging.getLogger()
    saved_level, saved_handlers = root.level, root.handlers[:]
    saved_disabled = {
        name: obj.disabled
        for name, obj in logging.root.manager.loggerDict.items()
        if isinstance(obj, logging.Logger)
    }
    try:
        yield
    finally:
        root.handlers[:] = saved_handlers
        root.setLevel(saved_level)
        for name, was_disabled in saved_disabled.items():
            obj = logging.root.manager.loggerDict.get(name)
            if isinstance(obj, logging.Logger):
                obj.disabled = was_disabled


def test_alembic_env_leaves_existing_loggers_enabled(tmp_path, monkeypatch, _restore_logging):
    """env.py must pass ``disable_existing_loggers=False`` to ``fileConfig``."""
    url = f"sqlite:///{tmp_path / 'logging.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    if str(_BACKEND) in sys.path:
        sys.path.remove(str(_BACKEND))
    sys.path.insert(0, str(_BACKEND))
    purge_backend_modules()

    from alembic import command
    from alembic.config import Config

    # Exist *before* the migration runs — that ordering is the whole defect.
    for name in LOGGERS_THAT_MUST_SURVIVE:
        logging.getLogger(name)

    # The shipped ini, exactly as the application's lifespan loads it.
    cfg = Config(str(_BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND / "alembic"))
    try:
        command.current(cfg)
    finally:
        purge_backend_modules()

    still_dark = [n for n in LOGGERS_THAT_MUST_SURVIVE if logging.getLogger(n).disabled]
    assert not still_dark, f"Alembic disabled these loggers for the rest of the process: {still_dark}"


def test_app_startup_migrations_do_not_lower_the_root_log_level(
    tmp_path, monkeypatch, _restore_logging
):
    """The app's own migration run must not touch application logging.

    The other half of the same defect. Even with existing loggers left
    enabled, ``fileConfig`` still reconfigures the ROOT logger from the
    ini's ``[logger_root] level = WARNING`` — so the application's own
    ``scheduler.*`` INFO records were dropped from a moment after startup
    onwards, for the life of the process. ``app.main._run_migrations``
    now builds its Alembic ``Config`` without the ini for that reason;
    the ini configures the ``alembic`` CLI and has no business setting a
    running API's log level.

    Asserted on behaviour (the level a ``scheduler.*`` logger actually
    ends up with) rather than on how the Config is constructed, so the
    test still means something if the mechanism changes.
    """
    # An EMPTY database — the migrations build the schema themselves, so
    # the usual ``isolate_test_database`` (which runs ``create_all``)
    # would collide with them.
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'startup.db'}")
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    if str(_BACKEND) in sys.path:
        sys.path.remove(str(_BACKEND))
    sys.path.insert(0, str(_BACKEND))
    purge_backend_modules()

    logging.getLogger().setLevel(logging.INFO)

    from app.main import _run_migrations

    _run_migrations()

    assert logging.getLogger().level == logging.INFO, (
        "the startup migration reset the root logger's level; every "
        "application INFO record after startup would be discarded"
    )
    app_log = logging.getLogger("scheduler.app")
    assert not app_log.disabled
    assert app_log.isEnabledFor(logging.INFO)
