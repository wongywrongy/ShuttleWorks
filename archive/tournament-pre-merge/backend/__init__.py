"""Tournament product backend.

PR 2 of the backend-merge arc moved the bracket logic (draw,
advancement, formats, scheduler driver, state helpers, import/export
I/O) from ``products/tournament/tournament/`` to
``products/scheduler/backend/services/bracket/``. The tournament
backend keeps running in parallel through PR 2 — it just imports
the moved package from its new home.

This ``__init__.py`` adds the scheduler backend's parent directory
to ``sys.path`` at import time so ``from services.bracket.X import Y``
resolves whether you're running via ``uvicorn backend.main:app`` from
this product's tree or via the Docker image (which copies
``services/bracket/`` into ``/app/services/bracket/`` directly).

PR 3 retires this product entirely; this shim goes away with it.
"""
from __future__ import annotations

import os
import sys

_SCHEDULER_BACKEND = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "scheduler", "backend")
)
if _SCHEDULER_BACKEND not in sys.path:
    sys.path.insert(0, _SCHEDULER_BACKEND)
