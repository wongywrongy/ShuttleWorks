"""Operational metrics remain bounded, privacy-safe, and fail-open."""
from __future__ import annotations

import json
from pathlib import Path

import yaml

from core.telemetry.instruments import (
    record_authority_rejection,
    record_authority_transition,
    record_recovery_outcome,
    record_sqlite_event,
    record_sync_retry,
    record_sync_upload,
)
from core.telemetry.privacy import validate_metric_attributes
from core.telemetry.state import set_runtime


ROOT = Path(__file__).resolve().parents[3]


class _Runtime:
    def __init__(self):
        self.points = []

    def record_metric(self, instrument, value, attributes):
        self.points.append((instrument, value, attributes))


def test_operational_facades_emit_only_bounded_dimensions():
    runtime = _Runtime()
    set_runtime(runtime)
    try:
        record_sync_upload("accepted")
        record_sync_retry("network_error")
        record_authority_transition("checkout")
        record_authority_rejection("invalid_capability")
        record_recovery_outcome("verify", "failed")
        record_sqlite_event("busy")
        assert len(runtime.points) == 6
        assert all("tournament" not in str(point[2]).lower() for point in runtime.points)
        assert validate_metric_attributes({"sync.outcome": "accepted"})
    finally:
        set_runtime(None)


def test_operational_metric_privacy_negative_control():
    try:
        validate_metric_attributes({"entrant.email": "alice@example.test"})
    except ValueError as exc:
        assert "entrant.email" in str(exc)
    else:  # pragma: no cover - makes the negative control explicit
        raise AssertionError("PII-bearing metric dimension was accepted")


def test_dashboard_and_alert_contract_are_versioned_and_have_runbooks():
    dashboard = json.loads(
        (ROOT / "infra/observability/shuttleworks-v1-dashboard.json").read_text()
    )
    alerts = (ROOT / "infra/observability/alerts.yaml").read_text()
    assert dashboard["version"] == 1
    assert len(dashboard["panels"]) >= 6
    assert "docs/how-to/observability-runbook.md" in dashboard["runbook"]
    assert "version: 1" in alerts
    assert "owner:" in alerts
    assert "docs/how-to/observability-runbook.md" in alerts
    assert "participant" in dashboard["cardinalityPolicy"]


def test_prometheus_rules_and_grafana_dashboard_are_directly_loadable():
    rules = yaml.safe_load(
        (ROOT / "infra/observability/prometheus-rules.yaml").read_text()
    )
    alerts = [
        rule
        for group in rules["groups"]
        for rule in group["rules"]
    ]
    assert len(alerts) >= 10
    assert all(rule.get("alert") and rule.get("expr") for rule in alerts)
    assert all(rule.get("annotations", {}).get("runbook_url") for rule in alerts)

    dashboard = json.loads(
        (ROOT / "infra/observability/shuttleworks-grafana-dashboard.json").read_text()
    )
    assert dashboard["schemaVersion"] >= 30
    assert dashboard["uid"] == "shuttleworks-production"
    assert len(dashboard["panels"]) >= 5
    assert all(
        {"gridPos", "targets", "type"} <= panel.keys()
        for panel in dashboard["panels"]
    )


def test_observability_assets_do_not_introduce_high_cardinality_labels():
    assets = "\n".join(
        path.read_text()
        for path in (
            ROOT / "infra/observability/prometheus-rules.yaml",
            ROOT / "infra/observability/shuttleworks-grafana-dashboard.json",
        )
    ).lower()
    for forbidden in ("tournament_id", "operation_id", "participant_id", "entrant_email"):
        assert forbidden not in assets
