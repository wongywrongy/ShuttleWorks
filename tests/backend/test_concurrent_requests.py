"""Parallel requests against DB-backed routes must not 500.

**Why this file exists.** The backend suite is ~1580 tests and the
simulator makes ~2000 requests, and both are strictly SEQUENTIAL — one
request at a time, one thread. So an entire failure class is invisible to
them: anything that only goes wrong when two requests are in flight at
once. That is not a hypothetical gap. A live stack served hundreds of
HTTP 500s on ordinary page loads (the SPA fires 4-6 requests in parallel)
while the whole suite was green, because nothing anywhere executed two
requests concurrently.

Uvicorn runs every ``def`` (non-``async``) route in a threadpool, so in
production N concurrent requests to a sync route are N OS threads inside
the app at once, each with its own ``SessionLocal`` off a shared engine
and pool. This module reproduces exactly that shape.

**What "pass" means here.** For the read burst, every response must be
200 — concurrent reads have no legitimate reason to fail. For the mixed
read/write burst the bar is deliberately different: a 409 or 412 is a
*correct* answer (two writers raced and optimistic concurrency did its
job), so the assertion is that nothing returns 5xx. A 5xx is an
unhandled exception, which is never a correct answer to a well-formed
request, and is the shape the live defect took.

**The negative control** is ``test_the_burst_fixture_is_actually_concurrent``.
Two ways this file could silently stop testing anything: the database
could become in-memory SQLite (which pins to ``StaticPool`` — one shared
connection, so the pool concurrency under test is gone), or the burst
helper could stop overlapping requests. Both are asserted directly,
because a concurrency test that has quietly become sequential passes
just as green as one that works.
"""
from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from _helpers import isolate_test_database

# 8 mirrors the measured live shape: a workspace page load fans out to
# 4-6 API calls, and the reproduction that first surfaced this used 8.
CONCURRENCY = 8
ROUNDS = 4


@pytest.fixture
def client(tmp_path, monkeypatch):
    """The **whole** application over a file-backed SQLite database.

    ``app.main:app``, not a bare ``FastAPI()`` with one router mounted —
    and that is the single most important line in this file. The
    per-request database session is opened by the ``get_repository``
    dependency and returned to the pool by ``close_repository_middleware``
    in ``app.main``; a test app assembled from routers alone has the
    dependency but not the middleware, so it leaks a connection per
    request and exhausts the pool no matter what the code under test
    does. Concurrency here has to be measured against the object that
    ships, because half of the mechanism lives in the app and not in the
    route.

    File-backed, not in-memory, for the reason the negative control at
    the bottom of this file spells out.
    """
    isolate_test_database(tmp_path, monkeypatch)

    from database.session import SessionLocal
    from services.auth import ensure_bootstrap_user

    # The lifespan normally materializes the local bootstrap operator,
    # and ``tournament_members.user_id`` is an FK to ``users``. TestClient
    # is used without ``with``, so no lifespan runs — deliberately, since
    # that would also start the migration run and both background workers.
    with SessionLocal() as boot:
        ensure_bootstrap_user(boot)
        boot.commit()

    from app.main import app

    return TestClient(app)


def _state(name: str = "Concurrency", schedule_version: int = 0) -> dict:
    return {
        "version": 2,
        "config": {
            "tournamentName": name,
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "groups": [],
        "players": [],
        "matches": [],
        "schedule": None,
        "scheduleStats": None,
        "scheduleIsStale": False,
        "scheduleVersion": schedule_version,
        "scheduleHistory": [],
    }


@pytest.fixture
def tournament_id(client) -> str:
    created = client.post("/tournaments", json={"name": "Concurrency"})
    assert created.status_code in (200, 201), created.text
    tid = created.json()["id"]
    assert client.put(f"/tournaments/{tid}/state", json=_state()).status_code == 200
    return tid


def _burst(fn, n: int = CONCURRENCY):
    """Run ``fn(i)`` on ``n`` threads at once and return every result."""
    with ThreadPoolExecutor(max_workers=n) as pool:
        return [f.result() for f in [pool.submit(fn, i) for i in range(n)]]


# ---- The controls ----------------------------------------------------


def test_parallel_reads_all_succeed(client, tournament_id):
    """N concurrent GETs on a DB-backed route: every one must be 200."""
    for _round in range(ROUNDS):
        codes = _burst(
            lambda i: client.get(f"/tournaments/{tournament_id}/state?cb={i}").status_code
        )
        assert codes == [200] * CONCURRENCY, f"parallel reads returned {codes}"


def test_parallel_reads_across_routes_all_succeed(client, tournament_id):
    """The SPA's real shape — several DIFFERENT DB-backed routes at once."""
    paths = [
        f"/tournaments/{tournament_id}",
        f"/tournaments/{tournament_id}/state",
        f"/tournaments/{tournament_id}/state/backups",
        f"/tournaments/{tournament_id}/members",
    ]
    for _round in range(ROUNDS):
        codes = _burst(lambda i: client.get(paths[i % len(paths)]).status_code)
        assert codes == [200] * CONCURRENCY, f"parallel mixed reads returned {codes}"


def test_parallel_writes_never_500(client, tournament_id):
    """Concurrent writers may conflict (409/412). They may not crash.

    A losing writer is a correct outcome — the state blob carries an
    optimistic-concurrency version precisely so one of two racing writes
    is refused. An unhandled exception is not: it tells the operator
    nothing, rolls back nothing on purpose, and is indistinguishable
    from the backend being broken.
    """
    for round_no in range(ROUNDS):
        codes = _burst(
            lambda i: client.put(
                f"/tournaments/{tournament_id}/state",
                json=_state(schedule_version=round_no * CONCURRENCY + i),
            ).status_code
        )
        assert not [c for c in codes if c >= 500], f"parallel writes returned {codes}"


def test_parallel_read_write_mix_never_500(client, tournament_id):
    """Readers and writers interleaved — the live traffic shape.

    SQLite is the local-mode production database, and a reader that
    shares a connection pool with a writer is where WAL, the busy
    timeout and lock upgrades all actually get exercised.
    """
    def one(i: int) -> int:
        if i % 3 == 0:
            return client.put(
                f"/tournaments/{tournament_id}/state", json=_state(schedule_version=i)
            ).status_code
        return client.get(f"/tournaments/{tournament_id}/state?cb={i}").status_code

    for _round in range(ROUNDS):
        codes = _burst(one)
        assert not [c for c in codes if c >= 500], f"mixed parallel traffic returned {codes}"


def test_parallel_requests_for_a_missing_tournament_are_all_404(client):
    """The uniform-404 seam must hold under concurrency too.

    Measured on the live stack: the same request for a workspace the
    caller cannot see returned an interleaved mix of 404 and 500 within
    the same second. Concurrency must not turn a decided answer into an
    undecided one.
    """
    missing = str(uuid.uuid4())
    codes = _burst(lambda i: client.get(f"/tournaments/{missing}/state?cb={i}").status_code)
    assert codes == [404] * CONCURRENCY, f"parallel misses returned {codes}"


# ---- Negative control ------------------------------------------------


def test_the_burst_fixture_is_actually_concurrent(client):
    """Guard the two ways this file could go vacuously green.

    1. An in-memory database pins SQLAlchemy to ``StaticPool`` — one
       connection shared by every thread — which removes the pool
       concurrency these tests exist to exercise.
    2. ``_burst`` must genuinely overlap its calls; a helper that ran
       them one after another would pass every assertion above while
       testing nothing.
    """
    from sqlalchemy.pool import StaticPool
    from database.session import engine

    assert not isinstance(engine.pool, StaticPool), (
        "the test database went in-memory; StaticPool shares one connection "
        "across threads, so nothing above tests concurrency any more"
    )

    import threading

    barrier = threading.Barrier(CONCURRENCY, timeout=10)

    def wait(_i: int) -> bool:
        # Only returns if all CONCURRENCY callers are inside at once.
        barrier.wait()
        return True

    assert _burst(wait) == [True] * CONCURRENCY
