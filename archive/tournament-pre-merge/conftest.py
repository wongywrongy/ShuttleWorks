"""Shared pytest setup for the tournament product test suite.

PR 2 of the backend-merge arc moved the bracket package from
``products/tournament/tournament/`` to
``products/scheduler/backend/services/bracket/``. This conftest
mirrors the runtime shim in ``backend/__init__.py``: it adds the
scheduler backend's parent directory to ``sys.path`` so the test
imports (and the ``backend`` module's own imports during collection)
resolve cleanly.

PR 3 retires this product; this conftest goes away with it.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


_TESTS_DIR = Path(__file__).resolve().parent
_PRODUCT_ROOT = _TESTS_DIR  # conftest sits at the product root
_TOURNAMENT_BACKEND = str(_PRODUCT_ROOT / "backend" / "..")
_SCHEDULER_BACKEND = str(
    (_PRODUCT_ROOT / ".." / "scheduler" / "backend").resolve()
)

# Tournament product's own ``backend`` package — same level as the
# tests directory.
if str(_PRODUCT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRODUCT_ROOT))

# Scheduler backend — hosts ``services.bracket`` after PR 2.
if _SCHEDULER_BACKEND not in sys.path:
    sys.path.insert(0, _SCHEDULER_BACKEND)
