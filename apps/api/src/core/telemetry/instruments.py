"""Dependency-free call-site facade for product spans and metrics."""
from __future__ import annotations

from contextlib import nullcontext
from typing import Any

from core.telemetry.privacy import validate_metric_attributes
from core.telemetry.state import get_runtime


class NoOpSpan:
    def set_attribute(self, _key: str, _value: Any) -> None:
        return None

    def set_status(self, _status: Any) -> None:
        return None

    def record_exception(self, _exception: BaseException) -> None:
        return None


def start_span(
    name: str,
    *,
    kind: str = "internal",
    attributes: dict[str, Any] | None = None,
    parent_context: Any | None = None,
):
    runtime = get_runtime()
    if runtime is None:
        return nullcontext(NoOpSpan())
    return runtime.start_span(
        name, kind=kind, attributes=attributes, parent_context=parent_context
    )


def record_solve(duration_seconds: float, status: str) -> None:
    _record("solve_duration", duration_seconds, {"solve.status": status})


def record_queue_wait(duration_seconds: float) -> None:
    _record("queue_wait", duration_seconds, {})


def record_job_outcome(outcome: str) -> None:
    _record("job_outcome", 1, {"job.outcome": outcome})


def record_state_conflict(route: str) -> None:
    _record("state_conflict", 1, {"http.route": route})


def record_sync_upload(outcome: str) -> None:
    _record("sync_upload", 1, {"sync.outcome": outcome})


def record_sync_retry(reason: str) -> None:
    _record("sync_retry", 1, {"sync.retry_reason": reason})


def record_authority_transition(transition: str) -> None:
    _record("authority_transition", 1, {"authority.transition": transition})


def record_authority_rejection(reason: str) -> None:
    _record("authority_rejection", 1, {"authority.rejection": reason})


def record_recovery_outcome(operation: str, outcome: str) -> None:
    _record(
        "recovery_outcome",
        1,
        {"recovery.operation": operation, "recovery.outcome": outcome},
    )


def record_sqlite_event(event: str) -> None:
    _record("sqlite_event", 1, {"sqlite.event": event})


def _record(instrument: str, value: int | float, attributes: dict[str, Any]) -> None:
    runtime = get_runtime()
    if runtime is None:
        return
    try:
        safe = validate_metric_attributes(attributes)
    except ValueError:
        return
    runtime.record_metric(instrument, value, safe)
