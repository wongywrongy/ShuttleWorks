"""Process-local conflict counter (SP-CLOUD-4, 0.F).

``/health/metrics`` states its own design rule in its docstring: *"No new table
and no new bookkeeping: every number here is derivable from columns the queue
already maintains."*

A conflict is an **event**, not a state. It is not derivable from any column,
so honouring that rule literally would mean not counting conflicts at all —
which loses the one signal that tells you whether an optimistic-concurrency
surface is actually conflicting in practice, or whether the guard is inert.

So this is the smallest thing that answers the question: an in-memory counter,
no table, no migration, no dependency, exposed under the ``conflicts`` key
of ``GET /health/metrics`` (ops-token gated, see ``ops/health.py``).

**Stated plainly, because it matters for how the number is read:** it resets on
restart and it is per-process. In a multi-container cloud deployment you get
per-instance counts, not a fleet total. That is acceptable for the purpose —
the question is "is this surface conflicting a lot?", a design signal, not
billing-grade accounting. Persisting conflicts to a table would be the
alternative and it does not earn its migration here.

The structured ``log.warning`` at each conflict site is the other half, and in
practice the more useful one: the log is what you read when someone reports
that their change vanished.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Dict, Optional

# A plain lock rather than itertools.count or a bare int: the API process is
# threaded (FastAPI runs sync endpoints in a threadpool), so two conflicting
# writes really can land concurrently. The critical section is three
# statements long and is never held across IO.
_lock = threading.Lock()
_total = 0
_by_path: Dict[str, int] = {}
_last_at: Optional[str] = None


def record(path: str) -> None:
    """Count one rejected stale write against ``path``."""
    global _total, _last_at
    with _lock:
        _total += 1
        _by_path[path] = _by_path.get(path, 0) + 1
        _last_at = datetime.now(timezone.utc).isoformat()


def snapshot() -> dict:
    """Current counts, shaped for the ``/health/metrics`` payload."""
    with _lock:
        return {
            "total": _total,
            "byPath": dict(_by_path),
            "lastConflictAt": _last_at,
        }


def reset() -> None:
    """Test seam. Not called by application code."""
    global _total, _last_at
    with _lock:
        _total = 0
        _by_path.clear()
        _last_at = None
