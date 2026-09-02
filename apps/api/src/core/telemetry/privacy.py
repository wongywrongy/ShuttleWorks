"""The allow-listed OTLP export surface.

Application telemetry is a public projection in the same sense as an API
serializer: fields are admitted deliberately.  Unknown fields are discarded
before export, and dynamic Python log arguments never enter the OTLP record.
The local console receives the original record unchanged.
"""
from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

# Standard semantic-convention attributes used by the instrumentations we pin.
# Values which can contain request paths, query strings, SQL, headers, bodies or
# exception text are deliberately absent.
SAFE_STANDARD_SPAN_ATTRIBUTES = frozenset(
    {
        "http.request.method",
        "http.response.status_code",
        "http.route",
        "http.method",  # pre-stable HTTP convention emitted by some contrib paths
        "http.status_code",
        "http.flavor",
        "url.scheme",
        "server.address",
        "server.port",
        "network.protocol.version",
        "network.transport",
        "network.type",
        "net.peer.name",
        "net.peer.port",
        "net.host.name",
        "net.host.port",
        "net.transport",
        "db.system",
        "db.system.name",
        "db.name",
        "db.namespace",
        "db.operation",
        "db.operation.name",
        "db.query.summary",
        "error.type",
        "exception.type",
        "exception.escaped",
        "messaging.system",
        "messaging.destination.name",
        "messaging.destination.template",
        "messaging.operation.name",
        "messaging.operation.type",
        "messaging.client.id",
    }
)

SAFE_CUSTOM_SPAN_ATTRIBUTES = frozenset(
    {
        "shuttleworks.job.id",
        "shuttleworks.job.type",
        "shuttleworks.job.attempt",
        "shuttleworks.tournament.id",
        "shuttleworks.worker.id",
        "shuttleworks.worker.topology",
        "shuttleworks.solver.matches",
        "shuttleworks.solver.players",
        "shuttleworks.solver.intervals",
        "shuttleworks.solver.no_overlap_groups",
        "shuttleworks.solver.variables",
        "shuttleworks.solver.slots",
        "shuttleworks.solver.courts",
        "shuttleworks.solver.locked_matches",
        "shuttleworks.solver.multi_match_players",
        "shuttleworks.solver.max_matches_per_player",
        "shuttleworks.solver.status",
        "shuttleworks.solver.objective",
        "shuttleworks.solver.wall_time_s",
        "shuttleworks.email.transport",
        "shuttleworks.email.outcome",
    }
)

SAFE_RESOURCE_ATTRIBUTES = frozenset(
    {
        "service.name",
        "service.version",
        "service.instance.id",
        "deployment.environment.name",
        "telemetry.sdk.language",
        "telemetry.sdk.name",
        "telemetry.sdk.version",
        "shuttleworks.deployment.profile",
        "shuttleworks.node.id",
        "shuttleworks.release.channel",
    }
)

SAFE_METRIC_ATTRIBUTES = frozenset(
    {
        "solve.status",
        "job.state",
        "job.outcome",
        "lease.state",
        "http.route",
        "sync.outcome",
        "sync.retry_reason",
        "authority.transition",
        "authority.rejection",
        "recovery.operation",
        "recovery.outcome",
        "sqlite.event",
        "backup.restore_status",
    }
)

SAFE_SOLVER_STATUSES = frozenset(
    {
        "optimal",
        "feasible",
        "infeasible",
        "unknown",
        "model_invalid",
        "error",
        "cancelled",
    }
)

SAFE_METRIC_ATTRIBUTE_VALUES: dict[str, frozenset[str]] = {
    "solve.status": SAFE_SOLVER_STATUSES,
    "job.state": frozenset({"queued", "claimed", "running"}),
    "job.outcome": frozenset(
        {
            "succeeded",
            "infeasible",
            "failed",
            "cancelled",
            "queued",
            "lease_lost",
        }
    ),
    "lease.state": frozenset({"healthy", "stale"}),
    "http.route": frozenset({"PUT /tournaments/{id}/state"}),
    "sync.outcome": frozenset({"accepted", "duplicate", "rejected", "empty"}),
    "sync.retry_reason": frozenset(
        {"network_error", "http_error", "invalid_capability", "protocol_error", "unknown"}
    ),
    "authority.transition": frozenset(
        {
            "checkout",
            "ready",
            "checkpoint_import",
            "return_to_cloud",
            "planned_transfer",
            "lost_node_recovery",
        }
    ),
    "authority.rejection": frozenset(
        {
            "already_granted",
            "invalid_capability",
            "hash_mismatch",
            "invalid_state",
            "schema",
            "not_found",
            "invalid_evidence",
            "same_node",
            "operations_not_drained",
            "sequence_behind",
            "no_active_authority",
            "target_exists",
            "invalid_checkpoint",
        }
    ),
    "recovery.operation": frozenset({"create", "verify", "restore"}),
    "recovery.outcome": frozenset({"succeeded", "failed"}),
    "sqlite.event": frozenset({"busy"}),
    "backup.restore_status": frozenset({"not_run", "passed", "failed"}),
}


def normalize_solver_status(value: Any) -> str:
    """Map solver output to the bounded status vocabulary used by telemetry."""
    raw = getattr(value, "value", value)
    status = str(raw or "unknown").lower()
    return status if status in SAFE_SOLVER_STATUSES else "unknown"


def sanitize_span_attributes(attributes: Mapping[str, Any] | None) -> tuple[dict[str, Any], set[str]]:
    """Return admitted span attributes and the rejected key set."""
    safe: dict[str, Any] = {}
    rejected: set[str] = set()
    for key, value in (attributes or {}).items():
        if key in SAFE_STANDARD_SPAN_ATTRIBUTES or key in SAFE_CUSTOM_SPAN_ATTRIBUTES:
            if key == "shuttleworks.solver.status":
                value = normalize_solver_status(value)
            safe[key] = value
        else:
            rejected.add(key)
    return safe, rejected


def sanitize_resource_attributes(
    attributes: Mapping[str, Any] | None,
) -> tuple[dict[str, Any], set[str]]:
    safe: dict[str, Any] = {}
    rejected: set[str] = set()
    for key, value in (attributes or {}).items():
        if key in SAFE_RESOURCE_ATTRIBUTES:
            safe[key] = value
        else:
            rejected.add(key)
    return safe, rejected


def validate_metric_attributes(attributes: Mapping[str, Any] | None) -> dict[str, Any]:
    """Validate the bounded metric dimension surface.

    This function raises for tests and development callers.  Runtime recording
    wrappers catch the error and drop the point, preserving fail-open behavior.
    """
    attrs = dict(attributes or {})
    forbidden = set(attrs) - SAFE_METRIC_ATTRIBUTES
    if forbidden:
        raise ValueError(f"forbidden metric attributes: {sorted(forbidden)}")
    unbounded = {
        key: value
        for key, value in attrs.items()
        if str(value) not in SAFE_METRIC_ATTRIBUTE_VALUES[key]
    }
    if unbounded:
        raise ValueError(f"unbounded metric attribute values: {unbounded}")
    return attrs


class TelemetryLogFilter(logging.Filter):
    """Replace a record with a correlation-preserving, PII-safe copy."""

    def filter(self, record: logging.LogRecord) -> logging.LogRecord | bool:
        if record.name.startswith("opentelemetry"):
            return False
        template = record.msg if isinstance(record.msg, str) else type(record.msg).__name__
        safe = logging.LogRecord(
            name=record.name,
            level=record.levelno,
            pathname="",
            lineno=0,
            msg=template,
            args=(),
            exc_info=None,
            func=None,
            sinfo=None,
        )
        safe.created = record.created
        safe.msecs = record.msecs
        safe.relativeCreated = record.relativeCreated
        return safe


def sanitize_readable_span(span):
    """Create the immutable sanitized span handed to the real exporter."""
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import Event, ReadableSpan
    from opentelemetry.trace import Link, Status

    attributes, _ = sanitize_span_attributes(span.attributes)
    resource_attributes, _ = sanitize_resource_attributes(span.resource.attributes)
    events = []
    for event in span.events:
        event_attributes, _ = sanitize_span_attributes(event.attributes)
        events.append(Event(event.name, event_attributes, event.timestamp))
    links = []
    for link in span.links:
        link_attributes, _ = sanitize_span_attributes(link.attributes)
        links.append(Link(link.context, link_attributes))
    return ReadableSpan(
        name=span.name,
        context=span.context,
        parent=span.parent,
        resource=Resource(resource_attributes),
        attributes=attributes,
        events=events,
        links=links,
        kind=span.kind,
        status=Status(span.status.status_code),
        start_time=span.start_time,
        end_time=span.end_time,
        instrumentation_scope=span.instrumentation_scope,
    )
