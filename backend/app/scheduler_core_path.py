"""Single place that puts the project root and ``src/`` on sys.path so
backend modules can ``from scheduler_core...``, ``from app...``, and
``from adapters...`` without each one repeating the bootstrap.
Importing this module is enough — it has no side effects on re-import.
"""
from __future__ import annotations

import os
import sys

_backend_dir = os.path.dirname(os.path.dirname(__file__))
_project_root = os.path.dirname(_backend_dir)
# scheduler_core lives at <project_root>/scheduler_core; legacy app/adapters
# packages still live under <project_root>/src.
for _path in (_project_root, os.path.join(_project_root, "src")):
    if _path not in sys.path:
        sys.path.insert(0, _path)
