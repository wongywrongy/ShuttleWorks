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

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings


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
        return create_engine(url, connect_args=connect_args, future=True)
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
