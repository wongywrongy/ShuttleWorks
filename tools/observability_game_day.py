#!/usr/bin/env python3
"""Run the repository-only telemetry and alert game-day proof.

This is intentionally deterministic and service-free. It exercises the
application telemetry facades with representative golden signals, validates
their privacy/cardinality boundary, and evaluates the versioned alert
expressions against a synthetic incident sample. It does not claim a live
Collector, Prometheus/Grafana, or production alert delivery.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml

API_SOURCE = Path(__file__).resolve().parents[1] / "apps/api/src"
if str(API_SOURCE) not in sys.path:
    sys.path.insert(0, str(API_SOURCE))

from core.telemetry.instruments import (  # noqa: E402
    record_authority_rejection,
    record_authority_transition,
    record_recovery_outcome,
    record_sqlite_event,
    record_sync_retry,
    record_sync_upload,
)
from core.telemetry.privacy import (  # noqa: E402
    sanitize_span_attributes,
    validate_metric_attributes,
)
from core.telemetry.state import get_runtime, set_runtime  # noqa: E402


ROOT = API_SOURCE.parents[2]
ALERTS = ROOT / "infra/observability/alerts.yaml"
DASHBOARD = ROOT / "infra/observability/shuttleworks-v1-dashboard.json"
RUNBOOK = ROOT / "docs/how-to/observability-runbook.md"
_COMPARISON = re.compile(r"(>=|<=|>|<)\s*([0-9.]+)")
_METRIC = re.compile(r"((?:shuttleworks|otelcol)_[a-z0-9_]+)")


class GoldenRuntime:
    """Minimal runtime sink used to capture facade output without OTLP."""

    def __init__(self) -> None:
        self.metrics: list[dict[str, Any]] = []

    def record_metric(self, instrument: str, value: int | float, attributes: dict[str, Any]) -> None:
        self.metrics.append(
            {"instrument": instrument, "value": value, "attributes": dict(attributes)}
        )


def _load_alert_contract() -> dict[str, Any]:
    contract = yaml.safe_load(ALERTS.read_text())
    if not isinstance(contract, dict):
        raise AssertionError("alert contract must be a mapping")
    return contract


def _alert_comparison(alert: dict[str, Any]) -> tuple[str, str, float]:
    expression = alert.get("expr", "")
    metric_match = _METRIC.search(expression)
    threshold_match = _COMPARISON.search(expression)
    if metric_match is None or threshold_match is None:
        raise AssertionError(f"unsupported game-day alert expression: {expression}")
    metric = metric_match.group(1)
    if expression.startswith("sum(rate("):
        metric = f"{metric}_rate"
    operator, raw_threshold = threshold_match.groups()
    return metric, operator, float(raw_threshold)


def _validate_alert_contract() -> dict[str, Any]:
    """Validate metadata that keeps alert pages actionable and bounded."""
    contract = _load_alert_contract()
    top_runbook = contract.get("runbook")
    if not isinstance(top_runbook, str) or not (ROOT / top_runbook).is_file():
        raise AssertionError("alert contract is not linked to its runbook")
    runbook_text = (ROOT / top_runbook).read_text()
    headings = {
        "#" + re.sub(r"[^a-z0-9 -]", "", heading.lower()).strip().replace(" ", "-")
        for heading in re.findall(r"^#{1,6}\s+(.+)$", runbook_text, flags=re.MULTILINE)
    }
    alerts = contract.get("alerts")
    if not isinstance(alerts, list) or not alerts:
        raise AssertionError("alert contract must contain alerts")
    names: set[str] = set()
    for alert in alerts:
        if not isinstance(alert, dict):
            raise AssertionError("each alert must be a mapping")
        name = alert.get("name")
        if not isinstance(name, str) or not name or name in names:
            raise AssertionError(f"alert names must be non-empty and unique: {name!r}")
        names.add(name)
        if not isinstance(alert.get("owner"), str) or not alert["owner"]:
            raise AssertionError(f"{name} is missing an owner")
        if alert.get("severity") not in {"critical", "high", "warning", "info"}:
            raise AssertionError(f"{name} has an invalid severity")
        runbook = alert.get("runbook")
        if not isinstance(runbook, str) or "#" not in runbook:
            raise AssertionError(f"{name} needs a section-linked runbook")
        runbook_path, anchor = runbook.split("#", 1)
        if not (ROOT / runbook_path).is_file() or f"#{anchor}" not in headings:
            raise AssertionError(f"{name} points at a missing runbook section")
        context = alert.get("event_context")
        if not isinstance(context, dict) or context.get("applies_to") != "live_event":
            raise AssertionError(f"{name} needs explicit live-event context")
        if context.get("offline_behavior") not in {"suppress", "page", "informational"}:
            raise AssertionError(f"{name} needs an explicit offline behavior")
        deduplication = alert.get("deduplication")
        if not isinstance(deduplication, dict):
            raise AssertionError(f"{name} needs deduplication metadata")
        if not isinstance(deduplication.get("key"), str) or not deduplication["key"]:
            raise AssertionError(f"{name} needs a deduplication key")
        if not isinstance(deduplication.get("window"), str) or not re.fullmatch(
            r"[0-9]+[smhd]", deduplication["window"]
        ):
            raise AssertionError(f"{name} needs a bounded deduplication window")
        _alert_comparison(alert)
    return contract


def _threshold_boundary_values(contract: dict[str, Any]) -> dict[str, float]:
    """Return exact trigger thresholds for strict non-firing controls."""
    return {
        _alert_comparison(alert)[0]: _alert_comparison(alert)[2]
        for alert in contract["alerts"]
    }


def _fired_alerts(values: dict[str, float]) -> list[str]:
    contract = _load_alert_contract()
    fired: list[str] = []
    for alert in contract["alerts"]:
        metric, operator, threshold = _alert_comparison(alert)
        actual = values[metric]
        comparisons = {
            ">": actual > threshold,
            ">=": actual >= threshold,
            "<": actual < threshold,
            "<=": actual <= threshold,
        }
        if comparisons[operator]:
            fired.append(alert["name"])
    return fired


def run_game_day() -> dict[str, Any]:
    """Return deterministic evidence for the repository observability gate."""
    runtime = GoldenRuntime()
    previous = get_runtime()
    set_runtime(runtime)
    try:
        # Product facades cover sync, authority, backup/recovery, and SQLite.
        record_sync_upload("accepted")
        record_sync_retry("network_error")
        record_authority_transition("checkout")
        record_authority_rejection("invalid_capability")
        record_recovery_outcome("create", "succeeded")
        record_sqlite_event("busy")
    finally:
        set_runtime(previous)

    # HTTP and database are represented as golden span attribute samples. The
    # same sanitizer used by the OTLP runtime proves their admitted shape.
    span_samples = {
        "http": {"http.request.method": "GET", "http.route": "/health/metrics", "http.response.status_code": 200},
        "database": {"db.system": "sqlite", "db.operation.name": "SELECT"},
    }
    sanitized_spans: dict[str, dict[str, Any]] = {}
    for signal, attrs in span_samples.items():
        sanitized, rejected = sanitize_span_attributes(attrs)
        if rejected:
            raise AssertionError(f"golden {signal} sample was unexpectedly rejected: {rejected}")
        sanitized_spans[signal] = sanitized

    for point in runtime.metrics:
        validate_metric_attributes(point["attributes"])
        if any(token in str(point["attributes"]).lower() for token in ("tournament", "email", "participant", "node.id")):
            raise AssertionError("golden metric contains an unbounded or private identity")
    try:
        validate_metric_attributes({"entrant.email": "alice@example.test"})
    except ValueError:
        privacy_negative_control = True
    else:  # pragma: no cover - the gate must fail if the boundary opens
        privacy_negative_control = False
    if not privacy_negative_control:
        raise AssertionError("privacy negative control unexpectedly passed")

    values = {
        "shuttleworks_sync_outbox_depth": 101,
        "shuttleworks_sync_outbox_oldest_age_seconds": 301,
        "shuttleworks_sqlite_wal_bytes": 268435457,
        "shuttleworks_sqlite_disk_free_bytes": 5368709119,
        "shuttleworks_authority_rejections_total_rate": 0.11,
        "shuttleworks_database_available": 0,
        "shuttleworks_backup_last_success_age_seconds": 7201,
        "shuttleworks_backup_restore_test": 1,
        "otelcol_exporter_queue_size": 0.81,
        "otelcol_exporter_send_failed_spans_rate": 0.1,
    }
    contract = _validate_alert_contract()
    fired = _fired_alerts(values)
    expected_alerts = [alert["name"] for alert in contract["alerts"]]
    if fired != expected_alerts:
        raise AssertionError(f"golden alert sample fired {fired}, expected {expected_alerts}")
    if not RUNBOOK.is_file():
        raise AssertionError("observability runbook is missing")
    dashboard = json.loads(DASHBOARD.read_text())
    dashboard_alerts = {
        panel.get("alert") for panel in dashboard["panels"] if panel.get("alert")
    }
    if set(expected_alerts) - dashboard_alerts:
        raise AssertionError("dashboard is missing an alert panel")
    dashboard_runbooks = {
        panel.get("alert"): panel.get("runbook")
        for panel in dashboard["panels"]
        if panel.get("alert")
    }
    for alert in contract["alerts"]:
        if dashboard_runbooks.get(alert["name"]) != alert["runbook"]:
            raise AssertionError(f"dashboard runbook does not match {alert['name']}")

    boundary_values = _threshold_boundary_values(contract)
    boundary_fired = _fired_alerts(boundary_values)
    if boundary_fired:
        raise AssertionError(f"alert threshold boundary unexpectedly fired: {boundary_fired}")

    return {
        "status": "passed",
        "signals": [
            "http",
            "database",
            "sync",
            "authority",
            "backup",
            "sqlite",
            "process",
            "collector",
        ],
        "metricPoints": len(runtime.metrics),
        "privacyNegativeControl": privacy_negative_control,
        "sanitizedSpans": sorted(sanitized_spans),
        "alertsFired": fired,
        "thresholdBoundaryAlerts": boundary_fired,
        "runbook": str(RUNBOOK.relative_to(ROOT)),
        "externalServices": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    print(json.dumps(run_game_day(), sort_keys=True))


if __name__ == "__main__":
    main()
