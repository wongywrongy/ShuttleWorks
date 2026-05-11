"""Single place that puts the repo root and product root on sys.path so
backend modules can ``from scheduler_core...``, ``from app...``, and
``from adapters...`` without each one repeating the bootstrap.
Importing this module is enough — it has no side effects on re-import.

Layout assumed:
    <repo_root>/scheduler_core/                shared engine
    <repo_root>/products/scheduler/app/        legacy DTO stub
    <repo_root>/products/scheduler/adapters/   sport adapters
    <repo_root>/products/scheduler/backend/    this package
"""
from __future__ import annotations

import os
import sys

_backend_dir = os.path.dirname(os.path.dirname(__file__))
_product_root = os.path.dirname(_backend_dir)
_repo_root = os.path.dirname(os.path.dirname(_product_root))

# scheduler_core lives at <repo_root>/scheduler_core/.
# app/, adapters/ live flat under <product_root>/.
for _path in (_repo_root, _product_root):
    if _path not in sys.path:
        sys.path.insert(0, _path)
