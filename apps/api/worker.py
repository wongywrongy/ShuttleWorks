"""Standalone solve-worker entry point (cloud mode).

Run from ``apps/api``::

    python -m worker [--concurrency N] [--worker-id ID]

Connects to ``DATABASE_URL`` and runs ``WORKER_CONCURRENCY`` solve
worker threads (default 1 — one solve owns the CPU; see
``app/config.py``). Workers never run migrations: the API owns the
schema (exactly-once), so this entry waits for it to appear before
claiming anything.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import threading
import time

# Declare the process role BEFORE anything imports ``app.config``, whose
# module-level ``Settings()`` runs the cloud validator at import time.
# A standalone worker validates only its database configuration — it
# serves no HTTP, sets no cookies, and sends no mail, so requiring SMTP
# and TLS-only cookies here would just teach operators to put fake
# credentials in a config file. `setdefault` so an explicit
# PROCESS_ROLE in the environment still wins.
os.environ.setdefault("PROCESS_ROLE", "worker")


def _wait_for_schema(timeout_seconds: float = 120.0) -> bool:
    """Block until the solve_jobs table exists (API ran migrations)."""
    from sqlalchemy import select

    from database.models import SolveJob
    from database.session import SessionLocal

    log = logging.getLogger("scheduler.worker")
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        session = SessionLocal()
        try:
            session.execute(select(SolveJob.id).limit(1))
            return True
        except Exception:
            log.info("waiting for schema (API applies migrations)…")
            time.sleep(2.0)
        finally:
            session.close()
    return False


def main(argv: list[str] | None = None) -> int:
    from app.config import settings
    from services.solve_worker import SolveWorker, default_worker_id

    parser = argparse.ArgumentParser(description="ShuttleWorks solve worker")
    parser.add_argument(
        "--concurrency",
        type=int,
        default=settings.worker_concurrency,
        help="solve worker threads (default: WORKER_CONCURRENCY env, 1)",
    )
    parser.add_argument(
        "--worker-id",
        default=settings.worker_id or default_worker_id(),
        help="stable worker identity stamped into claims",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    log = logging.getLogger("scheduler.worker")

    if not _wait_for_schema():
        log.error("schema never appeared; is the API up and migrated?")
        return 1

    workers = [
        SolveWorker(worker_id=f"{args.worker_id}-{i}" if args.concurrency > 1 else args.worker_id)
        for i in range(args.concurrency)
    ]
    for w in workers:
        w.start()
    log.info(
        "solve worker up: id=%s concurrency=%d db=%s",
        args.worker_id,
        args.concurrency,
        settings.database_url.split("@")[-1],  # no credentials in logs
    )

    stop = threading.Event()
    try:
        while not stop.is_set():
            stop.wait(timeout=5.0)
    except KeyboardInterrupt:
        log.info("shutting down…")
    finally:
        for w in workers:
            w.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
