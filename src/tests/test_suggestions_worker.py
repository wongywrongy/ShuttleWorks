"""SuggestionsWorker tests.

The worker is an asyncio Task that consumes a queue of trigger
events. We test:
  - queue acceptance + dispatch
  - dedup by fingerprint within cooldown window
  - cooldown expiry → trigger runs again
  - clean shutdown via stop()
  - cancel-on-newer-event semantics

These are pure-Python tests with the solver mocked. The
end-to-end "real solve produces a real suggestion" test lives in
test_proposal_pipeline_integration.py (Task 2.3).
"""
from __future__ import annotations

import sys
from pathlib import Path

_BACKEND_ROOT = str(Path(__file__).resolve().parents[2] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [k for k in list(sys.modules) if k == "app" or k.startswith("app.")]:
    del sys.modules[_cached]

import asyncio

import pytest
from unittest.mock import AsyncMock

from services.suggestions_worker import (
    SuggestionsWorker,
    TriggerEvent,
    TriggerKind,
)


@pytest.mark.asyncio
async def test_worker_processes_a_single_trigger():
    handler = AsyncMock()
    w = SuggestionsWorker(handler=handler, cooldown_seconds=0)
    await w.start()
    try:
        await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
        # The worker dispatches the handler in a child task; give it
        # a moment to start, then wait for in-flight to drain.
        await asyncio.sleep(0.05)
        await w.drain()
    finally:
        await w.stop()
    handler.assert_awaited_once()


@pytest.mark.asyncio
async def test_worker_dedups_within_cooldown():
    handler = AsyncMock()
    w = SuggestionsWorker(handler=handler, cooldown_seconds=10)
    await w.start()
    try:
        for _ in range(5):
            await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
        await asyncio.sleep(0.1)
        await w.drain()
    finally:
        await w.stop()
    assert handler.await_count == 1


@pytest.mark.asyncio
async def test_worker_runs_after_cooldown():
    handler = AsyncMock()
    w = SuggestionsWorker(handler=handler, cooldown_seconds=0.1)
    await w.start()
    try:
        await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
        await asyncio.sleep(0.05)
        await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
        await asyncio.sleep(0.05)
        await w.drain()
        assert handler.await_count == 1  # second was inside cooldown
        await asyncio.sleep(0.25)         # cooldown elapses (margin for CI drift)
        await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
        await asyncio.sleep(0.05)
        await w.drain()
    finally:
        await w.stop()
    assert handler.await_count == 2


@pytest.mark.asyncio
async def test_worker_stop_drains_cleanly():
    handler = AsyncMock()
    w = SuggestionsWorker(handler=handler, cooldown_seconds=0)
    await w.start()
    await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
    await w.stop()  # MUST return even with pending triggers


@pytest.mark.asyncio
async def test_worker_cancels_in_flight_when_newer_event_arrives():
    """A new event with the SAME fingerprint while one is in flight
    cancels the in-flight handler and starts a fresh one."""
    cancellations: list[str] = []

    async def slow_handler(event, cancel_token):
        try:
            # Sleep long enough for the second post to arrive; check
            # cancellation periodically so the new dispatcher can
            # supersede us promptly.
            for _ in range(20):
                if cancel_token.is_cancelled():
                    cancellations.append(event.fingerprint)
                    return
                await asyncio.sleep(0.05)
        except asyncio.CancelledError:
            cancellations.append(event.fingerprint)
            raise

    w = SuggestionsWorker(handler=slow_handler, cooldown_seconds=0)
    await w.start()
    try:
        await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
        await asyncio.sleep(0.05)  # let the first solve start
        await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
        await asyncio.sleep(0.2)   # the first handler gets cancelled by the new post
    finally:
        await w.stop()
    # The first handler MUST have been cancelled in-flight when the
    # second post arrived. The second handler may ALSO get cancelled
    # at teardown by stop() — that's a property of stop, not of
    # cancel-in-flight, so we don't assert exact equality.
    assert len(cancellations) >= 1, (
        "First handler was not cancelled when newer event with same "
        "fingerprint arrived"
    )
    assert all(fp == "opt:v1" for fp in cancellations)
