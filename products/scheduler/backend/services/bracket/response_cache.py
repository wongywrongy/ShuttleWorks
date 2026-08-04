"""Bounded-staleness in-process cache for ``GET /tournaments/{id}/bracket``.

``GET /bracket`` is a full session rebuild on every request: ``_hydrate_session``
runs 1 + 3·N repo queries, reconstructs the ``TournamentState``/``Draw``
objects, and ``_serialize_session`` re-runs per-event rr/swiss
``compute_standings``. The frontend polls this every 2.5 s and refetches on
every bracket-surface re-entry, so the rebuild happens far more often than
the underlying data actually changes.

This module memoizes the serialized response per tournament for a short
TTL (below the poll period, so a stale hit self-heals within one poll tick
even with zero invalidation) and every mutating bracket route — plus
``clearSchedule`` on ``PUT /tournaments/{id}/state`` — calls ``invalidate()``
after a successful write so a write-then-read (e.g. the command path's
POST-then-immediate-GET) never observes a stale payload.

**Fail-safety property:** a missed invalidation call site degrades to at
most ``TTL_SECONDS`` of staleness, then self-heals on the next GET. It is
never permanently stale. This is a deliberate tradeoff for simplicity and
correctness-under-omission over a fully precise invalidation graph.

**Single-process assumption:** the backend runs as a single uvicorn
process (director's laptop — see CLAUDE.md). This cache has no
cross-process coherence and must not be relied on if that assumption ever
changes (e.g. multi-worker deployment).

Tests reset state via ``clear_all()`` and may monkeypatch ``TTL_SECONDS``
to exercise expiry without a real sleep-length TTL wait.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Dict, Tuple

# Below the frontend's 2.5 s poll period (see CLAUDE.md / debt-log) so a
# cache hit is bounded by, not additive to, existing poll latency.
TTL_SECONDS: float = 2.0

_cache: Dict[uuid.UUID, Tuple[float, Any]] = {}


def get(tournament_id: uuid.UUID) -> Any | None:
    """Return the cached payload for ``tournament_id`` if still fresh.

    Returns ``None`` on a miss or an expired entry (the entry is left in
    place; ``put`` will overwrite it on the next successful rebuild).
    """
    entry = _cache.get(tournament_id)
    if entry is None:
        return None
    stored_at, payload = entry
    if time.monotonic() - stored_at > TTL_SECONDS:
        return None
    return payload


def put(tournament_id: uuid.UUID, payload: Any) -> None:
    """Cache ``payload`` for ``tournament_id``, stamped with the current time."""
    _cache[tournament_id] = (time.monotonic(), payload)


def invalidate(tournament_id: uuid.UUID) -> None:
    """Drop any cached entry for ``tournament_id``. No-op if absent."""
    _cache.pop(tournament_id, None)


def clear_all() -> None:
    """Drop every cached entry (test seam)."""
    _cache.clear()
