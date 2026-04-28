"""Single place that puts ``src/scheduler_core`` on sys.path so backend
modules can ``from scheduler_core...`` without each one repeating the
bootstrap. Importing this module is enough — it has no side effects on
re-import.
"""
from __future__ import annotations

import os
import sys

_backend_dir = os.path.dirname(os.path.dirname(__file__))
_project_root = os.path.dirname(_backend_dir)
_scheduler_core_path = os.path.join(_project_root, "src")
if _scheduler_core_path not in sys.path:
    sys.path.insert(0, _scheduler_core_path)
