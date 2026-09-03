"""Contracts for the opt-in Phase 4 containerized telemetry rehearsal."""
from __future__ import annotations

import json
import importlib
from pathlib import Path

import pytest
import yaml

from core.telemetry.bootstrap import TelemetryRuntime
from core.telemetry.privacy import validate_metric_attributes
from tools.observability_rehearsal import (
    FORBIDDEN_ATTRIBUTE,
    LOG_BODY,
    SIGNAL_NAME,
    _validate_marker,
)


ROOT = Path(__file__).resolve().parents[3]


class _Meter:
    def __getattr__(self, name):
        if name != "create_observable_gauge":
            raise AttributeError(name)

        def create(_metric_name, *, callbacks, **_kwargs):
            return callbacks[0]

        return create


def _runtime() -> TelemetryRuntime:
    runtime = TelemetryRuntime.__new__(TelemetryRuntime)
    runtime.meter = _Meter()
    runtime._backup_status_provider = None
    runtime._started_at = 0.0
    return runtime


def test_backup_observations_are_absent_until_safe_provider_is_attached():
    runtime = _runtime()
    instruments = runtime._create_backup_observations()
    assert instruments["backup_generations"](None) == []
    assert instruments["backup_restore_test"](None) == []

    runtime.set_backup_status_provider(
        lambda: {
            "generationCount": 2,
            "freeBytes": 4096,
            "restoreTestStatus": "passed",
            "lastSuccessAt": "2026-09-01T12:00:00+00:00",
        }
    )
    assert instruments["backup_generations"](None)[0].value == 2
    restore = instruments["backup_restore_test"](None)[0]
    assert restore.value == 1
    assert restore.attributes == {"backup.restore_status": "passed"}
    assert validate_metric_attributes(restore.attributes) == restore.attributes


def test_backup_provider_failure_and_invalid_values_fail_open():
    runtime = _runtime()
    instruments = runtime._create_backup_observations()

    def broken():
        raise OSError("status unavailable")

    runtime.set_backup_status_provider(broken)
    assert instruments["backup_disk_free"](None) == []
    runtime.set_backup_status_provider(
        lambda: {"freeBytes": "secret", "restoreTestStatus": "arbitrary"}
    )
    assert instruments["backup_disk_free"](None) == []
    assert instruments["backup_restore_test"](None) == []


def test_database_observations_cover_available_pool_and_fail_open(monkeypatch):
    db_session = importlib.import_module("db.session")
    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def exec_driver_sql(self, statement):
            assert statement == "SELECT 1"
            return self

        def scalar(self):
            return 1

    class Pool:
        checkedout = lambda self: 3
        size = lambda self: 5
        overflow = lambda self: 1

    engine = type("Engine", (), {"pool": Pool(), "connect": lambda self: Connection()})()
    monkeypatch.setattr(db_session, "engine", engine)
    instruments = _runtime()._create_database_observations()
    assert instruments["database_available"](None)[0].value == 1
    assert instruments["database_pool_checked_out"](None)[0].value == 3
    assert instruments["database_pool_capacity"](None)[0].value == 5
    assert instruments["database_pool_overflow"](None)[0].value == 1

    broken = type(
        "BrokenEngine",
        (),
        {"pool": object(), "connect": lambda self: (_ for _ in ()).throw(OSError())},
    )()
    monkeypatch.setattr(db_session, "engine", broken)
    failed = _runtime()._create_database_observations()
    assert failed["database_available"](None)[0].value == 0
    assert failed["database_pool_checked_out"](None) == []


def test_process_observations_are_non_negative():
    instruments = _runtime()._create_process_observations()
    assert instruments["process_uptime"](None)[0].value >= 0
    memory = instruments["process_resident_memory"](None)
    assert memory == [] or memory[0].value >= 0


def test_marker_validation_requires_correlation_redaction_and_exact_set():
    marker = "marker"
    records = [
        {
            "signal": "trace",
            "serviceInstanceId": marker,
            "traceId": "01",
            "spanId": "02",
            "attributes": {},
        },
        {
            "signal": "log",
            "serviceInstanceId": marker,
            "traceId": "01",
            "spanId": "02",
            "body": LOG_BODY,
        },
        {"signal": "metric", "serviceInstanceId": marker, "name": SIGNAL_NAME},
    ]
    assert _validate_marker(records)["correlated"] is True

    with pytest.raises(AssertionError, match="exactly once"):
        _validate_marker(records + [dict(records[0])])
    leaked = [dict(record) for record in records]
    leaked[0]["attributes"] = {FORBIDDEN_ATTRIBUTE: "Bearer secret"}
    with pytest.raises(AssertionError, match="redact"):
        _validate_marker(leaked)
    uncorrelated = [dict(record) for record in records]
    uncorrelated[1]["traceId"] = "different"
    with pytest.raises(AssertionError, match="correlated"):
        _validate_marker(uncorrelated)


def test_rehearsal_compose_and_collector_contract_are_isolated_and_pinned():
    compose_path = ROOT / "infra/compose/docker-compose.observability-rehearsal.yml"
    compose = yaml.safe_load(compose_path.read_text())
    collector = compose["services"]["otel-collector"]
    expected_image = "otel/opentelemetry-collector-contrib:0.155.0"
    assert collector["image"] == expected_image
    event_node = yaml.safe_load(
        (ROOT / "infra/compose/docker-compose.event-node.yml").read_text()
    )
    assert event_node["services"]["otel-collector"]["image"] == expected_image
    assert expected_image in (ROOT / ".github/workflows/ci.yml").read_text()
    assert "127.0.0.1:${PHASE4_OTLP_PORT:-14318}:4318" in collector["ports"]
    assert "phase4_queue:/var/lib/otelcol" in collector["volumes"]
    assert compose["services"]["rehearsal-gateway"]["read_only"] is True

    config = yaml.safe_load((ROOT / "infra/otel/collector-rehearsal.yaml").read_text())
    exporter = config["exporters"]["otlphttp/gateway"]
    assert exporter["sending_queue"]["storage"] == "file_storage"
    assert exporter["retry_on_failure"]["max_elapsed_time"] == "0s"
    actions = config["processors"]["attributes/redact"]["actions"]
    assert {action["key"] for action in actions} >= {FORBIDDEN_ATTRIBUTE, "db.statement"}


def test_rehearsal_dashboard_exposes_new_operational_surfaces():
    dashboard = json.loads(
        (ROOT / "infra/observability/shuttleworks-v1-dashboard.json").read_text()
    )
    metrics = {panel["metric"] for panel in dashboard["panels"]}
    assert {
        "shuttleworks.database.available",
        "shuttleworks.backup.last_success.age",
        "shuttleworks.process.memory.resident",
        "otelcol_exporter_queue_size",
    } <= metrics
