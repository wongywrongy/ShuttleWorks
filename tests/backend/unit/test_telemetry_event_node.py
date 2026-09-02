"""Contract checks for the offline event-node telemetry profile."""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import yaml

from core.telemetry import bootstrap
from core.telemetry.privacy import sanitize_resource_attributes


REPO_ROOT = Path(__file__).resolve().parents[3]


def _settings(**overrides):
    values = {
        "otel_exporter_otlp_endpoint": "http://127.0.0.1:9",
        "otel_exporter_otlp_traces_endpoint": "",
        "otel_exporter_otlp_logs_endpoint": "",
        "otel_exporter_otlp_metrics_endpoint": "",
        "otel_exporter_otlp_protocol": "http/protobuf",
        "otel_exporter_otlp_timeout": 0.1,
        "environment": "local",
        "worker_id": "",
        "job_lease_seconds": 30.0,
        "otel_deployment_profile": "event_node",
        "otel_node_id": "node-test-1",
        "otel_release_channel": "stable",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_resource_identity_is_controlled_and_allowlisted():
    runtime = bootstrap.configure_telemetry(
        _settings(), role="api", instance_id="api-test-1"
    )
    assert runtime is not None
    try:
        attrs = runtime.tracer_provider.resource.attributes
        assert attrs["service.name"] == "shuttleworks-api"
        assert attrs["shuttleworks.deployment.profile"] == "event_node"
        assert attrs["shuttleworks.node.id"] == "node-test-1"
        assert attrs["shuttleworks.release.channel"] == "stable"

        safe, rejected = sanitize_resource_attributes(
            {**attrs, "entrant.email": "alice@example.test"}
        )
        assert "entrant.email" in rejected
        assert "entrant.email" not in safe
    finally:
        runtime.shutdown()


def test_event_node_collector_config_has_bounded_persistent_queues():
    config = (REPO_ROOT / "infra" / "otel" / "collector-event-node.yaml").read_text()
    assert "file_storage:" in config
    assert "create_directory: true" in config
    assert "storage: file_storage" in config
    assert "queue_size: 2048" in config
    assert "limit_mib: 128" in config
    assert "attributes/redact:" in config
    for signal in ("traces:", "metrics:", "logs:"):
        assert signal in config
    assert "http.request.header.authorization" in config
    assert "db.statement" in config


def test_event_node_compose_routes_apps_to_private_collector():
    compose = (
        REPO_ROOT / "infra" / "compose" / "docker-compose.event-node.yml"
    ).read_text()
    assert "profiles: [event-node]" in compose
    assert "OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318" in compose
    assert "OTEL_DEPLOYMENT_PROFILE=event_node" in compose
    assert "event_node_otel" in compose
    assert '127.0.0.1:${OTEL_HEALTH_HOST_PORT:-13133}:13133' in compose


def test_event_node_queue_volume_and_collector_restart_contract_are_explicit():
    """Repository gate for the restart half of the queue design.

    This checks that the deployed composition mounts the Collector's durable
    storage and uses Collector config validation. It deliberately does not
    claim a live outage/reconnect drain without running that composition.
    """
    compose = (REPO_ROOT / "infra" / "compose" / "docker-compose.event-node.yml").read_text()
    assert "event_node_otel:/var/lib/otelcol" in compose
    assert "chown -R 10001:10001 /var/lib/otelcol" in compose
    assert "condition: service_completed_successfully" in compose
    assert "restart: unless-stopped" in compose
    assert "otelcol-contrib" in compose and "validate" in compose
    assert "event_node_otel:" in compose


def test_versioned_collector_configs_are_structurally_valid():
    """Repository gate: both profiles must remain parseable collector configs.

    This validates shape and bounded queue/redaction contracts only. It does
    not claim a deployed Collector, exporter, or backend is reachable.
    """
    for filename in ("collector-event-node.yaml", "collector-cloud.yaml"):
        config = yaml.safe_load((REPO_ROOT / "infra" / "otel" / filename).read_text())
        assert isinstance(config, dict)
        assert {"receivers", "processors", "exporters", "service"} <= config.keys()
        assert "otlp" in config["receivers"]
        pipelines = config["service"]["pipelines"]
        assert {"traces", "metrics", "logs"} <= pipelines.keys()
        for signal in ("traces", "metrics", "logs"):
            pipeline = pipelines[signal]
            assert "otlp" in pipeline["receivers"]
            assert pipeline["processors"]
            assert pipeline["exporters"]
        assert config["processors"]["memory_limiter"]["limit_mib"] <= 256
        exporter = config["exporters"]["otlphttp/gateway"]
        assert exporter["tls"]["ca_file"]
        assert exporter["tls"]["cert_file"]
        assert exporter["tls"]["key_file"]


def test_collectors_cover_host_storage_and_postgres_signals():
    event = yaml.safe_load(
        (REPO_ROOT / "infra" / "otel" / "collector-event-node.yaml").read_text()
    )
    cloud = yaml.safe_load(
        (REPO_ROOT / "infra" / "otel" / "collector-cloud.yaml").read_text()
    )
    assert {"hostmetrics", "filelog/sqlite"} <= event["receivers"].keys()
    assert {"hostmetrics", "postgresql"} <= cloud["receivers"].keys()
