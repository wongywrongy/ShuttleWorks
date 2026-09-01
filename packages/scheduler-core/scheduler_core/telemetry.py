"""Optional application-owned observer for solver execution.

``scheduler_core`` remains independently usable and has no OpenTelemetry
dependency.  A composing application may install a context-manager factory;
without one the observer is a no-op.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Callable, Iterator

SolveObserver = Callable[[dict[str, Any]], Any]
_observer: SolveObserver | None = None


def configure_solve_observer(observer: SolveObserver | None) -> None:
    global _observer
    _observer = observer


@contextmanager
def observe_solve(stats: dict[str, Any]) -> Iterator[Callable[[Any], None]]:
    observer = _observer
    if observer is None:
        yield lambda _result: None
        return
    with observer(stats) as finish:
        yield finish
