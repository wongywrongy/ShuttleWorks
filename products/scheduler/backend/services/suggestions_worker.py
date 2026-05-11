"""Background re-optimization worker.

Owns one asyncio.Task that consumes a queue of TriggerEvents and
fires speculative solves. Mutates ``app.state.suggestions`` and
``app.state.proposals`` via the supplied handler — the worker
itself is dependency-free and only knows about events and tokens.

Cooldown prevents thrashing when many triggers post the same
fingerprint in quick succession. In-flight cancellation lets a
newer event supersede a stale solve so the operator never sees a
suggestion that's already wrong.

Mutations to live tournament state (schedule, match states,
config) happen elsewhere — when an operator clicks Apply, NOT
here.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Awaitable, Callable, Dict, Optional, Tuple

import app.scheduler_core_path  # noqa: F401
from scheduler_core.engine.cancel_token import CancelToken

log = logging.getLogger("scheduler.suggestions")


class TriggerKind(str, Enum):
    """Input vocabulary for the worker queue.

    OPTIMIZE and REPAIR correspond to ``Suggestion.kind`` values in
    ``backend/app/schemas.py`` — those are the kinds an OPTIMIZE or
    REPAIR trigger can produce. PERIODIC is internal to the worker
    (the 90s heartbeat from the lifespan) and produces an OPTIMIZE
    suggestion via the same handler. The Suggestion schema's
    ``"director"`` and ``"candidate"`` kinds are not currently
    triggered through the worker queue.
    """
    OPTIMIZE = "optimize"
    REPAIR = "repair"
    PERIODIC = "periodic"


@dataclass(frozen=True)
class TriggerEvent:
    """One queued request to (potentially) produce a suggestion.

    `fingerprint` is the dedup key — events with the same
    fingerprint within the cooldown window collapse to a single
    handler invocation. The handler itself decides whether to
    actually stamp a suggestion based on solver output.
    """
    kind: TriggerKind
    fingerprint: str
    payload: Dict[str, object] = field(default_factory=dict)


HandlerFn = Callable[[TriggerEvent, CancelToken], Awaitable[None]]


class SuggestionsWorker:
    """One asyncio Task per app. Consumes a queue, runs handlers.

    Lifecycle:
        worker = SuggestionsWorker(handler=...)
        await worker.start()
        await worker.post(event)
        ...
        await worker.stop()

    Public surface:
        - ``post(event)``     enqueue a trigger
        - ``drain()``         wait for in-flight handlers to finish
        - ``start()`` / ``stop()`` lifecycle

    The worker holds no application state itself — `handler` is
    where suggestion mutation happens.
    """

    def __init__(
        self,
        handler: HandlerFn,
        cooldown_seconds: float = 30.0,
        queue_max: int = 64,
    ) -> None:
        self._handler = handler
        self._cooldown = cooldown_seconds
        self._queue: asyncio.Queue[TriggerEvent] = asyncio.Queue(maxsize=queue_max)
        # fingerprint -> monotonic timestamp of last dispatch start
        self._last_run: Dict[str, float] = {}
        # fingerprint -> (asyncio.Task running the handler, CancelToken)
        self._inflight: Dict[str, Tuple[asyncio.Task, CancelToken]] = {}
        self._task: Optional[asyncio.Task] = None
        self._stopping = asyncio.Event()

    async def start(self) -> None:
        """Spawn the consumer task. Idempotent."""
        if self._task is not None:
            return
        self._stopping.clear()
        self._task = asyncio.create_task(self._run(), name="suggestions-worker")

    async def stop(self) -> None:
        """Signal stop, cancel all in-flight handlers, await consumer."""
        self._stopping.set()
        for fp, (task, token) in list(self._inflight.items()):
            token.cancel()
            task.cancel()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        # The consumer may have started one final dispatch in the tick
        # between the snapshot above and the consumer's own exit.
        # Cancel and await each remaining entry to be safe — without
        # the explicit cancel, a handler that ignores its token could
        # run to completion past stop().
        for fp, (task, token) in list(self._inflight.items()):
            token.cancel()
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self._inflight.clear()

    async def post(self, event: TriggerEvent) -> None:
        """Enqueue a trigger. Drops the event with a warning if the
        queue is full — back-pressure rather than silent unbounded
        growth."""
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            log.warning("suggestions queue full; dropping %s", event.fingerprint)

    async def drain(self) -> None:
        """Await any in-flight handlers (test affordance)."""
        # Snapshot is needed because completed handlers remove
        # themselves from the dict in their `finally`.
        for _fp, (task, _token) in list(self._inflight.items()):
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    async def _run(self) -> None:
        """Consume the queue; dispatch handlers under cooldown rules."""
        while not self._stopping.is_set():
            try:
                # 0.5s timeout bounds stop() latency: worst-case from
                # _stopping.set() to consumer exit is one timeout
                # tick. Shorter values raise CPU; longer values delay
                # clean shutdown.
                event = await asyncio.wait_for(self._queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue

            now = time.monotonic()
            last = self._last_run.get(event.fingerprint, -1e18)
            if now - last < self._cooldown:
                log.debug("suggestion cooldown skip %s", event.fingerprint)
                continue

            # Cancel any in-flight task for this fingerprint so the
            # newer event supersedes it cleanly.
            existing = self._inflight.pop(event.fingerprint, None)
            if existing is not None:
                prev_task, prev_token = existing
                prev_token.cancel()
                prev_task.cancel()
                try:
                    await prev_task
                except (asyncio.CancelledError, Exception):
                    pass

            token = CancelToken()
            task = asyncio.create_task(
                self._dispatch(event, token),
                name=f"suggestion-{event.fingerprint}",
            )
            self._inflight[event.fingerprint] = (task, token)
            self._last_run[event.fingerprint] = now

    async def _dispatch(self, event: TriggerEvent, token: CancelToken) -> None:
        try:
            await self._handler(event, token)
        except asyncio.CancelledError:
            log.info("suggestion cancelled mid-flight: %s", event.fingerprint)
            raise
        except Exception:
            log.exception("suggestion handler failed for %s", event.fingerprint)
        finally:
            # Only remove the entry if it still points at THIS task —
            # a newer dispatch may have replaced it already.
            current = self._inflight.get(event.fingerprint)
            if current is not None and current[0] is asyncio.current_task():
                self._inflight.pop(event.fingerprint, None)
