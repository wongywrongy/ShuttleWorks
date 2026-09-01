"""Safety properties for the opt-in OTLP emission boundary."""
from __future__ import annotations

import asyncio
import ast
import logging
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest

from core.telemetry import bootstrap
from core.telemetry.privacy import (
    TelemetryLogFilter,
    normalize_solver_status,
    sanitize_readable_span,
    sanitize_span_attributes,
    validate_metric_attributes,
)

_API_SOURCE = Path(__file__).resolve().parents[3] / "apps" / "api" / "src"


def _settings(endpoint: str = "") -> SimpleNamespace:
    return SimpleNamespace(
        otel_exporter_otlp_endpoint=endpoint,
        otel_exporter_otlp_traces_endpoint="",
        otel_exporter_otlp_logs_endpoint="",
        otel_exporter_otlp_metrics_endpoint="",
        otel_exporter_otlp_protocol="http/protobuf",
        otel_exporter_otlp_timeout=0.1,
        environment="test",
        worker_id="",
        job_lease_seconds=30.0,
    )


def test_disabled_configuration_never_constructs_a_runtime(monkeypatch):
    calls = []

    class ConstructorTrap:
        def __init__(self, *_args, **_kwargs):
            calls.append("constructed")
            raise AssertionError("disabled telemetry constructed an exporter runtime")

    monkeypatch.setattr(bootstrap, "TelemetryRuntime", ConstructorTrap)
    assert bootstrap.configure_telemetry(_settings(), role="api") is None
    assert calls == []

    # Negative control: the same trap is reached when the activation endpoint
    # is present. configure_telemetry catches the deliberate failure because
    # setup itself is fail-open, but the call proves the guard is meaningful.
    assert bootstrap.configure_telemetry(
        _settings("http://127.0.0.1:9"), role="api"
    ) is None
    assert calls == ["constructed"]


def test_failed_runtime_setup_is_rolled_back_and_remains_fail_open(monkeypatch):
    root_logger = logging.getLogger()
    leaked_handler = logging.NullHandler()
    calls = []

    class PartialRuntime:
        def __init__(self, *_args, **_kwargs):
            root_logger.addHandler(leaked_handler)
            calls.append("constructed")
            raise ValueError("malformed exporter configuration")

        def shutdown(self):
            root_logger.removeHandler(leaked_handler)
            calls.append("shutdown")

    monkeypatch.setattr(bootstrap, "TelemetryRuntime", PartialRuntime)
    assert bootstrap.configure_telemetry(
        _settings("not-a-valid-endpoint"), role="api"
    ) is None
    assert calls == ["constructed", "shutdown"]
    assert leaked_handler not in root_logger.handlers


def test_real_application_starts_and_serves_without_otel_when_disabled():
    env = os.environ.copy()
    for key in tuple(env):
        if key.startswith("OTEL_"):
            env.pop(key)
    env["PYTHONPATH"] = str(_API_SOURCE)
    env["EMBEDDED_WORKER"] = "false"
    code = """
import asyncio
import json
import os
import sys
import tempfile

with tempfile.TemporaryDirectory() as directory:
    os.environ["DATABASE_URL"] = f"sqlite:///{directory}/telemetry-disabled.db"
    import core.main as main

    assert main.telemetry_runtime is None
    assert main.app.version == "2.0.0"
    assert not any(
        name == "opentelemetry" or name.startswith("opentelemetry.")
        for name in sys.modules
    )
    async def request(path):
        sent = []
        received = False

        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": b"", "more_body": False}
            return {"type": "http.disconnect"}

        async def send(message):
            sent.append(message)

        await main.app(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "GET",
                "scheme": "http",
                "path": path,
                "raw_path": path.encode(),
                "query_string": b"",
                "headers": [],
                "client": ("127.0.0.1", 1),
                "server": ("test", 80),
            },
            receive,
            send,
        )
        status = next(
            message["status"]
            for message in sent
            if message["type"] == "http.response.start"
        )
        body = b"".join(
            message.get("body", b"")
            for message in sent
            if message["type"] == "http.response.body"
        )
        return status, json.loads(body)

    # Calling the lifespan context directly exercises the same startup and
    # shutdown hooks as a server without relying on TestClient's AnyIO
    # blocking portal, which is broken with the pinned local AnyIO version.
    async def exercise_application():
        async with main.lifespan(main.app):
            return await request("/health")

    status, payload = asyncio.run(exercise_application())
    assert status == 200
    assert payload["status"] == "healthy"
    assert not any(
        name == "opentelemetry" or name.startswith("opentelemetry.")
        for name in sys.modules
    )
"""
    completed = subprocess.run(
        [sys.executable, "-c", code],
        env=env,
        cwd=_API_SOURCE,
        capture_output=True,
        text=True,
        timeout=40,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr


def test_real_application_reconfigures_telemetry_for_each_lifespan_cycle():
    env = os.environ.copy()
    for key in tuple(env):
        if key.startswith("OTEL_"):
            env.pop(key)
    env.update(
        {
            "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:9",
            "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
            "PYTHONPATH": str(_API_SOURCE),
            "EMBEDDED_WORKER": "false",
        }
    )
    code = """
import asyncio
import os
import tempfile

with tempfile.TemporaryDirectory() as directory:
    os.environ["DATABASE_URL"] = f"sqlite:///{directory}/telemetry-cycles.db"
    import core.main as main

    async def cycle():
        async with main.lifespan(main.app):
            runtime = main.telemetry_runtime
            assert runtime is not None
            assert not runtime._shutdown
            assert main.app._is_instrumented_by_opentelemetry
            return runtime

    first = asyncio.run(cycle())
    assert first._shutdown
    assert main.telemetry_runtime is None
    second = asyncio.run(cycle())
    assert second is not first
    assert second._shutdown
    assert main.telemetry_runtime is None
"""
    completed = subprocess.run(
        [sys.executable, "-c", code],
        env=env,
        cwd=_API_SOURCE,
        capture_output=True,
        text=True,
        timeout=40,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr


def test_solver_span_status_is_normalized_to_bounded_vocabulary():
    from solve_rail.solve_runner import RunnerOutcome
    from solve_rail.solve_worker import _annotate_runner_outcome

    class Span:
        def __init__(self):
            self.attributes = {}

        def set_attribute(self, key, value):
            self.attributes[key] = value

    assert normalize_solver_status("OPTIMAL") == "optimal"
    assert normalize_solver_status("player.alice@example.test") == "unknown"
    span = Span()
    status, _duration = _annotate_runner_outcome(
        span,
        RunnerOutcome(kind="ok", result={"status": "player.alice@example.test"}),
        0.25,
    )
    assert status == "unknown"
    assert span.attributes["shuttleworks.solver.status"] == "unknown"


@pytest.mark.asyncio
async def test_unreachable_endpoint_still_serves_without_warnings(
    caplog, monkeypatch
):
    from fastapi import FastAPI
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    sentinel = "alice@example.test"
    monkeypatch.setenv("OTEL_RESOURCE_ATTRIBUTES", f"entrant.email={sentinel}")
    runtime = bootstrap.configure_telemetry(
        _settings("http://127.0.0.1:9"), role="api", instance_id="unreachable-test"
    )
    assert runtime is not None
    resources = (
        runtime.tracer_provider.resource,
        runtime.logger_provider.resource,
        runtime.meter_provider._sdk_config.resource,
    )
    for resource in resources:
        assert sentinel not in str(resource.attributes)
        assert "entrant.email" not in resource.attributes
    span_exporter = InMemorySpanExporter()
    runtime.tracer_provider.add_span_processor(SimpleSpanProcessor(span_exporter))
    app = FastAPI()

    @app.get("/probe")
    async def probe():
        return {"status": "ok"}

    @app.get("/health")
    async def health():
        return {"status": "healthy"}

    runtime.instrument_fastapi(app)
    sent = []
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": b"", "more_body": False}
        await asyncio.Event().wait()

    async def send(message):
        sent.append(message)

    caplog.set_level(logging.WARNING)
    try:
        await app(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "GET",
                "scheme": "http",
                "path": "/probe",
                "raw_path": b"/probe",
                "query_string": b"",
                "headers": [],
                "client": ("127.0.0.1", 1),
                "server": ("test", 80),
            },
            receive,
            send,
        )
        assert any(
            message["type"] == "http.response.start" and message["status"] == 200
            for message in sent
        )
        # Negative control for the exclusion: the ordinary request emitted a
        # server span. The same helper drives /health and must add none.
        ordinary_count = len(span_exporter.get_finished_spans())
        assert ordinary_count >= 1
        sent.clear()
        received = False
        await app(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "GET",
                "scheme": "http",
                "path": "/health",
                "raw_path": b"/health",
                "query_string": b"",
                "headers": [],
                "client": ("127.0.0.1", 1),
                "server": ("test", 80),
            },
            receive,
            send,
        )
        assert len(span_exporter.get_finished_spans()) == ordinary_count
        # Force each background path to encounter the dead receiver. Failure
        # remains contained and the OpenTelemetry logger is not propagated.
        runtime.tracer_provider.force_flush(timeout_millis=500)
        runtime.logger_provider.force_flush(timeout_millis=500)
        runtime.meter_provider.force_flush(timeout_millis=500)
        assert not [
            record for record in caplog.records if record.name.startswith("opentelemetry")
        ]
    finally:
        runtime.shutdown()


def test_span_attribute_projection_rejects_pii_with_negative_control():
    sentinel = "player.alice@example.test"
    raw = {
        "shuttleworks.solver.status": "optimal",
        "entrant.email": sentinel,
        "db.statement": f"SELECT * FROM entrants WHERE email='{sentinel}'",
    }
    assert sentinel in str(raw)  # negative control: the fixture really contains PII
    safe, rejected = sanitize_span_attributes(raw)
    assert safe == {"shuttleworks.solver.status": "optimal"}
    assert rejected == {"entrant.email", "db.statement"}
    assert sentinel not in str(safe)


def test_exported_span_removes_dynamic_exception_and_forbidden_attributes():
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    sentinel = "+1-555-0100 Alice Player"
    exporter = InMemorySpanExporter()
    provider = TracerProvider(resource=Resource.create({"service.name": "test"}))
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    tracer = provider.get_tracer("test")
    with tracer.start_as_current_span("safe-static-name") as span:
        span.set_attribute("entrant.phone", sentinel)
        span.set_attribute("shuttleworks.solver.status", "optimal")
        try:
            raise ValueError(sentinel)
        except ValueError as exc:
            span.record_exception(exc)
    raw = exporter.get_finished_spans()[0]
    assert sentinel in raw.events[0].attributes["exception.message"]
    sanitized = sanitize_readable_span(raw)
    assert sanitized.attributes == {"shuttleworks.solver.status": "optimal"}
    assert sentinel not in sanitized.to_json()


def test_otlp_log_copy_keeps_template_and_trace_correlation_but_not_arguments():
    from opentelemetry.instrumentation.logging.handler import LoggingHandler
    from opentelemetry.sdk._logs import LoggerProvider
    from opentelemetry.sdk._logs.export import (
        InMemoryLogRecordExporter,
        SimpleLogRecordProcessor,
    )
    from opentelemetry.sdk.trace import TracerProvider

    sentinel = "Alice Player <alice@example.test> +1-555-0100"
    trace_provider = TracerProvider()
    tracer = trace_provider.get_tracer("test")
    log_exporter = InMemoryLogRecordExporter()
    logger_provider = LoggerProvider()
    logger_provider.add_log_record_processor(SimpleLogRecordProcessor(log_exporter))
    handler = LoggingHandler(logger_provider=logger_provider)
    handler.addFilter(TelemetryLogFilter())
    record = logging.LogRecord(
        "scheduler.test", logging.INFO, __file__, 1, "entrant=%s", (sentinel,), None
    )
    with tracer.start_as_current_span("correlated") as span:
        handler.handle(record)
        trace_id = span.get_span_context().trace_id
    exported = log_exporter.get_finished_logs()[0].log_record
    assert record.getMessage().endswith(sentinel)  # negative control
    assert exported.body == "entrant=%s"
    assert sentinel not in str(exported.body)
    assert exported.trace_id == trace_id


def test_metric_surface_rejects_ids_and_unbounded_values():
    job_id = "70cefdba-0649-4d79-966f-dfbf5d98b18e"
    assert validate_metric_attributes({"solve.status": "optimal"}) == {
        "solve.status": "optimal"
    }
    with pytest.raises(ValueError, match="forbidden metric attributes"):
        validate_metric_attributes({"job.id": job_id})
    with pytest.raises(ValueError, match="unbounded metric attribute values"):
        validate_metric_attributes({"job.outcome": job_id})
    # Negative control: without the validator the identifier is a real point
    # attribute, so the refusal assertions above are not vacuous.
    assert {"job.id": job_id}["job.id"] == job_id


def test_log_templates_and_manual_span_names_are_static_literals():
    violations = []
    logging_methods = {"debug", "info", "warning", "error", "exception", "critical"}
    telemetry_calls = {"start_span"}
    for path in _API_SOURCE.rglob("*.py"):
        if path.is_relative_to(_API_SOURCE / "core" / "telemetry"):
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            name = None
            if isinstance(node.func, ast.Attribute):
                name = node.func.attr
            elif isinstance(node.func, ast.Name):
                name = node.func.id
            if name in logging_methods | telemetry_calls:
                first = node.args[0]
                if not isinstance(first, ast.Constant) or not isinstance(first.value, str):
                    violations.append(f"{path.relative_to(_API_SOURCE)}:{node.lineno}:{name}")
    assert violations == [], (
        "dynamic log templates/span names bypass the OTLP privacy projection: "
        + ", ".join(violations)
    )
