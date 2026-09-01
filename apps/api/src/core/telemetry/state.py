"""Tiny dependency-free registry used by telemetry call sites.

The disabled application never imports the OpenTelemetry packages.  Call sites
therefore consult this registry and become ordinary no-ops when bootstrap did
not install a runtime.
"""
from __future__ import annotations

from typing import Any

_runtime: Any | None = None


def get_runtime() -> Any | None:
    return _runtime


def set_runtime(runtime: Any | None) -> None:
    global _runtime
    _runtime = runtime
