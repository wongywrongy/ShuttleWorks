"""Deterministic repository proof for telemetry and alert game day."""
from __future__ import annotations

from tools.observability_game_day import (
    _alert_comparison,
    _fired_alerts,
    _threshold_boundary_values,
    _validate_alert_contract,
    run_game_day,
)


def test_golden_signals_and_alerts_fire_without_external_services():
    evidence = run_game_day()
    assert evidence["status"] == "passed"
    assert evidence["signals"] == [
        "http",
        "database",
        "sync",
        "authority",
        "backup",
        "sqlite",
        "process",
        "collector",
    ]
    assert evidence["sanitizedSpans"] == ["database", "http"]
    assert evidence["alertsFired"] == [
        "sync_outbox_depth",
        "sync_outbox_oldest_age",
        "sqlite_wal_bytes",
        "sqlite_disk_free",
        "authority_rejections",
        "database_unavailable",
        "backup_stale",
        "backup_restore_test_failed",
        "collector_queue_utilization",
        "collector_export_failures",
    ]
    assert evidence["externalServices"] is False
    assert evidence["privacyNegativeControl"] is True
    assert evidence["thresholdBoundaryAlerts"] == []


def test_alert_contract_metadata_and_threshold_controls():
    contract = _validate_alert_contract()
    boundary = _threshold_boundary_values(contract)
    assert _fired_alerts(boundary) == []

    safe = dict(boundary)
    for alert in contract["alerts"]:
        metric, operator, threshold = _alert_comparison(alert)
        safe[metric] = threshold - 1 if operator in {">", ">="} else threshold + 1
    assert _fired_alerts(safe) == []

    for alert in contract["alerts"]:
        metric, operator, threshold = _alert_comparison(alert)
        crossing = dict(boundary)
        crossing[metric] = threshold + 1 if operator in {">", ">="} else threshold - 1
        assert _fired_alerts(crossing) == [alert["name"]]

        assert alert["owner"]
        assert alert["severity"] in {"critical", "high", "warning", "info"}
        assert "#" in alert["runbook"]
        assert alert["deduplication"]["key"]
        assert alert["deduplication"]["window"]
