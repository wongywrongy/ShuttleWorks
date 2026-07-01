"""SQLAlchemy engine + sessionmaker factory.

One process-wide engine, bound to ``settings.database_url``. For SQLite
we enable ``check_same_thread=False`` so FastAPI's threadpool — which is
what runs every sync ``def`` route under uvicorn — can hand a session
off to whichever worker thread picks up the request. For in-memory
SQLite URLs (the test fixture) we additionally pin to
``StaticPool`` so every connection in the same process reaches the
same database.
"""
from __future__ import annotations

from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings


def _enable_sqlite_wal(engine: Engine) -> None:
    """Set per-connection PRAGMAs on a file-backed SQLite engine.

    WAL lets readers run concurrently with a writer (the default
    rollback-journal mode locks the whole DB on write), and
    ``busy_timeout`` makes a contended connection wait+retry for 5 s
    instead of failing immediately with "database is locked" — which
    matters here because a single solve can hold a write for tens of
    seconds. Both are connection-scoped, so they must be issued on
    every checkout via the ``connect`` event, not passed as engine
    kwargs. In-memory SQLite (the test fixture) never reaches this.
    """

    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_connection, _connection_record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
        finally:
            cursor.close()


def _build_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        if ":memory:" in url:
            # Without StaticPool, every new connection on an in-memory
            # SQLite URL gets its own private database. Tests would
            # write rows the next session can't see.
            return create_engine(
                url,
                connect_args=connect_args,
                poolclass=StaticPool,
                future=True,
            )
        # File-backed SQLite: pre-allocate a fixed pool (no overflow) so
        # the connection ceiling is predictable under uvicorn's
        # threadpool, and turn on WAL + busy_timeout for write contention.
        engine = create_engine(
            url,
            connect_args=connect_args,
            pool_size=20,
            max_overflow=0,
            future=True,
        )
        _enable_sqlite_wal(engine)
        return engine
    return create_engine(url, future=True)


engine: Engine = _build_engine(settings.database_url)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=Session,
)


def get_session() -> Iterator[Session]:
    """FastAPI generator dependency — opens one session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
