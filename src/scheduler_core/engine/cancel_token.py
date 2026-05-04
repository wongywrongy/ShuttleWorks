"""Lightweight cancellation token.

Cooperative — solver code must poll. Backed by `threading.Event`
because OR-Tools solver callbacks run on its own C++ worker
threads (when ``num_workers > 1``), which can't reach the
asyncio event loop the calling coroutine lives in.
"""
import threading


class CancelToken:
    """A flip-once flag. ``cancel()`` is idempotent and thread-safe."""

    __slots__ = ("_event",)

    def __init__(self) -> None:
        self._event = threading.Event()

    def cancel(self) -> None:
        self._event.set()

    def is_cancelled(self) -> bool:
        return self._event.is_set()
