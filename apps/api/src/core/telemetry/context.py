"""W3C Trace Context propagation for the database-backed job rail."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from core.telemetry.instruments import NoOpSpan
from core.telemetry.state import get_runtime

TRACE_CONTEXT_KEYS = frozenset({"traceparent", "tracestate"})


@contextmanager
def enqueue_span(attributes: dict[str, Any]) -> Iterator[dict[str, str] | None]:
    runtime = get_runtime()
    if runtime is None:
        yield None
        return
    with runtime.start_span(
        "solve_jobs publish",
        kind="producer",
        attributes=attributes,
        parent_context=None,
    ):
        yield runtime.inject_trace_context()


@contextmanager
def process_span(
    carrier: dict[str, str] | None, attributes: dict[str, Any]
) -> Iterator[Any]:
    runtime = get_runtime()
    if runtime is None:
        yield NoOpSpan()
        return
    parent = runtime.extract_trace_context(carrier)
    with runtime.start_span(
        "solve_jobs process",
        kind="consumer",
        attributes=attributes,
        parent_context=parent,
    ) as span:
        yield span


def normalize_trace_carrier(carrier: dict[str, str] | None) -> dict[str, str] | None:
    """Reject baggage and arbitrary persisted carrier fields."""
    if not carrier:
        return None
    normalized = {
        key: value
        for key, value in carrier.items()
        if key in TRACE_CONTEXT_KEYS and isinstance(value, str) and value
    }
    return normalized or None
