#!/usr/bin/env python3
"""Run the containerized Phase 4 Collector outage/restart/drain rehearsal."""
from __future__ import annotations

import argparse
import json
import logging
import os
import statistics
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
API_SOURCE = ROOT / "apps/api/src"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(API_SOURCE) not in sys.path:
    sys.path.insert(0, str(API_SOURCE))

from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter  # noqa: E402
from opentelemetry.exporter.otlp.proto.http.metric_exporter import (  # noqa: E402
    OTLPMetricExporter,
)
from opentelemetry.exporter.otlp.proto.http.trace_exporter import (  # noqa: E402
    OTLPSpanExporter,
)
from opentelemetry.instrumentation.logging.handler import LoggingHandler  # noqa: E402
from opentelemetry.sdk._logs import LoggerProvider  # noqa: E402
from opentelemetry.sdk._logs.export import SimpleLogRecordProcessor  # noqa: E402
from opentelemetry.sdk.metrics import MeterProvider  # noqa: E402
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader  # noqa: E402
from opentelemetry.sdk.resources import Resource  # noqa: E402
from opentelemetry.sdk.trace import TracerProvider  # noqa: E402
from opentelemetry.sdk.trace.export import SimpleSpanProcessor  # noqa: E402

from tools.event_node_acceptance import run_acceptance  # noqa: E402


COMPOSE = ROOT / "infra/compose/docker-compose.observability-rehearsal.yml"
COLLECTOR_VERSION = "0.136.0"
SIGNAL_NAME = "shuttleworks.rehearsal.marker"
LOG_BODY = "phase4_rehearsal_marker"
FORBIDDEN_ATTRIBUTE = "http.request.header.authorization"


def _run(
    command: list[str],
    *,
    env: dict[str, str],
    check: bool = True,
    capture: bool = False,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        check=check,
        text=True,
        capture_output=capture,
    )


def _compose(env: dict[str, str], *args: str, **kwargs):
    return _run(["docker", "compose", "-f", str(COMPOSE), *args], env=env, **kwargs)


def _wait_http(url: str, *, timeout: float = 45.0) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urlopen(url, timeout=2) as response:  # noqa: S310 - loopback probe
                if response.status in {200, 404}:
                    return
        except Exception as exc:  # noqa: BLE001 - readiness is intentionally broad
            last_error = exc
        time.sleep(0.5)
    raise RuntimeError(f"timed out waiting for {url}: {last_error}")


def _collector_self_metrics(url: str) -> list[str]:
    required = [
        "otelcol_exporter_queue_capacity",
        "otelcol_exporter_queue_size",
        "otelcol_exporter_send_failed",
    ]
    with urlopen(url, timeout=5) as response:  # noqa: S310 - loopback probe
        body = response.read().decode("utf-8", errors="replace")
    missing = [name for name in required if name not in body]
    if missing:
        raise AssertionError(f"Collector self-metrics missing: {missing}")
    return required


def _emit_marker(endpoint: str, marker: str) -> None:
    resource = Resource(
        {
            "service.name": "shuttleworks-phase4-rehearsal",
            "service.instance.id": marker,
            "shuttleworks.deployment.profile": "event_node",
        }
    )
    tracer_provider = TracerProvider(resource=resource, shutdown_on_exit=False)
    tracer_provider.add_span_processor(
        SimpleSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces", timeout=5))
    )
    logger_provider = LoggerProvider(resource=resource, shutdown_on_exit=False)
    logger_provider.add_log_record_processor(
        SimpleLogRecordProcessor(OTLPLogExporter(endpoint=f"{endpoint}/v1/logs", timeout=5))
    )
    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=f"{endpoint}/v1/metrics", timeout=5),
        export_interval_millis=60_000,
        export_timeout_millis=5_000,
    )
    meter_provider = MeterProvider(
        metric_readers=[metric_reader], resource=resource, shutdown_on_exit=False
    )
    handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
    logger = logging.getLogger(f"phase4.rehearsal.{marker}")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)
    try:
        tracer = tracer_provider.get_tracer("io.shuttleworks.rehearsal")
        counter = meter_provider.get_meter("io.shuttleworks.rehearsal").create_counter(
            SIGNAL_NAME
        )
        with tracer.start_as_current_span("phase4.rehearsal") as span:
            span.set_attribute(FORBIDDEN_ATTRIBUTE, "Bearer must-not-arrive")
            logger.info(LOG_BODY)
            counter.add(1)
    finally:
        logger.removeHandler(handler)
        logger_provider.shutdown()
        tracer_provider.shutdown()
        meter_provider.shutdown()


def _copy_capture(env: dict[str, str], destination: Path) -> list[dict]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = _compose(
        env,
        "cp",
        "rehearsal-gateway:/evidence/signals.jsonl",
        str(destination),
        check=False,
        capture=True,
    )
    if result.returncode != 0 or not destination.exists():
        return []
    return [json.loads(line) for line in destination.read_text().splitlines() if line]


def _wait_for_marker(
    env: dict[str, str], marker: str, capture_path: Path, *, timeout: float = 45.0
) -> list[dict]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        records = _copy_capture(env, capture_path)
        selected = [record for record in records if record.get("serviceInstanceId") == marker]
        if {record.get("signal") for record in selected} == {"trace", "log", "metric"}:
            return selected
        time.sleep(1)
    raise RuntimeError(f"marker {marker} did not drain all three signals")


def _validate_marker(records: list[dict]) -> dict[str, object]:
    traces = [record for record in records if record.get("signal") == "trace"]
    logs = [record for record in records if record.get("signal") == "log"]
    metrics = [record for record in records if record.get("signal") == "metric"]
    marker_metrics = [record for record in metrics if record.get("name") == SIGNAL_NAME]
    if len(traces) != 1 or len(logs) != 1 or len(marker_metrics) != 1:
        raise AssertionError(
            "a marker must arrive exactly once for trace, log, and metric signals"
        )
    trace = traces[0]
    log = logs[0]
    correlated = bool(
        trace.get("traceId")
        and trace.get("traceId") == log.get("traceId")
        and trace.get("spanId") == log.get("spanId")
    )
    if not correlated:
        raise AssertionError("trace and log marker are not correlated")
    if log.get("body") != LOG_BODY:
        raise AssertionError("captured log marker body is incorrect")
    if FORBIDDEN_ATTRIBUTE in trace.get("attributes", {}):
        raise AssertionError("Collector did not redact the authorization attribute")
    return {
        "signals": ["trace", "log", "metric"],
        "correlated": True,
        "redacted": True,
        "exactlyOnce": True,
    }


def _command_latencies(directory: Path, count: int = 5) -> list[float]:
    directory.mkdir(parents=True, exist_ok=True)
    samples: list[float] = []
    for index in range(count):
        started = time.perf_counter()
        result = run_acceptance(directory / f"command-{uuid.uuid4()}-{index}.sqlite")
        elapsed_ms = (time.perf_counter() - started) * 1000
        if result.get("status") != "passed":
            raise AssertionError("event-node command durability proof failed")
        samples.append(elapsed_ms)
    return samples


def _p95(samples: list[float]) -> float:
    return max(samples) if len(samples) < 20 else statistics.quantiles(samples, n=20)[18]


def run_rehearsal(output_directory: Path, *, otlp_port: int = 14318) -> dict[str, object]:
    output_directory = output_directory.resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    project = f"shuttleworks-phase4-{os.getpid()}"
    env = {
        **os.environ,
        "COMPOSE_PROJECT_NAME": project,
        "PHASE4_OTLP_PORT": str(otlp_port),
        "PHASE4_HEALTH_PORT": str(otlp_port + 1),
        "PHASE4_METRICS_PORT": str(otlp_port + 2),
    }
    endpoint = f"http://127.0.0.1:{otlp_port}"
    capture_path = output_directory / "signals.jsonl"
    log_path = output_directory / "compose.log"
    evidence_path = output_directory / "evidence.json"
    evidence: dict[str, object] = {
        "schemaVersion": 1,
        "status": "failed",
        "collectorVersion": COLLECTOR_VERSION,
        "productionAcceptance": False,
    }
    try:
        _compose(env, "up", "-d", "--build")
        _wait_http(f"http://127.0.0.1:{otlp_port + 1}/", timeout=45)

        baseline_marker = f"baseline-{uuid.uuid4()}"
        _emit_marker(endpoint, baseline_marker)
        baseline = _validate_marker(
            _wait_for_marker(env, baseline_marker, capture_path)
        )

        with tempfile.TemporaryDirectory(prefix="phase4-command-") as temp:
            healthy_samples = _command_latencies(Path(temp) / "healthy")

        _compose(env, "stop", "rehearsal-gateway")
        outage_marker = f"outage-{uuid.uuid4()}"
        _emit_marker(endpoint, outage_marker)
        collector_metrics = _collector_self_metrics(
            f"http://127.0.0.1:{otlp_port + 2}/metrics"
        )
        before_restart = _copy_capture(env, capture_path)
        if any(
            record.get("serviceInstanceId") == outage_marker
            for record in before_restart
        ):
            raise AssertionError("outage marker reached a stopped gateway")

        with tempfile.TemporaryDirectory(prefix="phase4-command-") as temp:
            outage_samples = _command_latencies(Path(temp) / "outage")

        _compose(env, "restart", "otel-collector")
        _wait_http(f"http://127.0.0.1:{otlp_port + 1}/", timeout=45)
        _compose(env, "start", "rehearsal-gateway")
        outage = _validate_marker(_wait_for_marker(env, outage_marker, capture_path))

        healthy_p95 = _p95(healthy_samples)
        outage_p95 = _p95(outage_samples)
        latency_limit = max(healthy_p95 * 2, healthy_p95 + 100)
        if outage_p95 > latency_limit:
            raise AssertionError(
                f"outage command p95 {outage_p95:.2f}ms exceeded {latency_limit:.2f}ms"
            )
        evidence.update(
            status="passed",
            baseline=baseline,
            outageAccepted=True,
            collectorRestarted=True,
            queueDrained=True,
            collectorSelfMetrics=collector_metrics,
            outage=outage,
            commandLatency={
                "sampleCount": len(healthy_samples),
                "healthyP95Ms": round(healthy_p95, 3),
                "outageP95Ms": round(outage_p95, 3),
                "limitMs": round(latency_limit, 3),
                "passed": True,
            },
            artifacts={"signals": "signals.jsonl", "composeLogs": "compose.log"},
        )
        return evidence
    except Exception as exc:
        evidence["error"] = {"type": type(exc).__name__, "message": str(exc)}
        raise
    finally:
        logs = _compose(env, "logs", "--no-color", check=False, capture=True)
        log_path.write_text(logs.stdout + logs.stderr)
        _copy_capture(env, capture_path)
        evidence_path.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n")
        _compose(
            env,
            "down",
            "--volumes",
            "--remove-orphans",
            "--rmi",
            "local",
            check=False,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "artifacts/phase4-observability",
    )
    parser.add_argument("--otlp-port", type=int, default=14318)
    args = parser.parse_args()
    evidence = run_rehearsal(args.output, otlp_port=args.otlp_port)
    print(json.dumps(evidence, sort_keys=True))


if __name__ == "__main__":
    main()
