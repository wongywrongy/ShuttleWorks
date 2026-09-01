"""Uniform, fail-open OpenTelemetry bootstrap for every backend process."""
from __future__ import annotations

import logging
import socket
import time
from contextlib import contextmanager
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from core.telemetry.privacy import (
    TelemetryLogFilter,
    normalize_solver_status,
    sanitize_readable_span,
    sanitize_span_attributes,
)
from core.telemetry.state import get_runtime, set_runtime
from core.version import APP_VERSION

_INSTRUMENTATION_SCOPE = "io.shuttleworks.application"
_OPERATIONAL_PATHS = (
    r"/health(?:\?.*)?$",
    r"/health/ready(?:\?.*)?$",
    r"/health/deep(?:\?.*)?$",
    r"/health/metrics(?:\?.*)?$",
    r"/version(?:\?.*)?$",
)


def _signal_endpoint(base: str, override: str, signal: str) -> str:
    if override:
        return override
    parsed = urlsplit(base)
    path = parsed.path.rstrip("/") + f"/v1/{signal}"
    return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, parsed.fragment))


class TelemetryRuntime:
    """Own all providers, processors, handlers and instrumentors for a process."""

    def __init__(self, settings, *, role: str, instance_id: str) -> None:
        # Imports live here, after the endpoint activation check in
        # configure_telemetry.  Disabled deployments never import the SDK.
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.logging.handler import LoggingHandler
        from opentelemetry.sdk._logs import LoggerProvider
        from opentelemetry.sdk._logs.export import (
            BatchLogRecordProcessor,
            LogRecordExportResult,
        )
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import (
            MetricExportResult,
            PeriodicExportingMetricReader,
        )
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExportResult

        class SanitizingSpanExporter(OTLPSpanExporter):
            def export(inner_self, spans):
                try:
                    return super(SanitizingSpanExporter, inner_self).export(
                        tuple(sanitize_readable_span(span) for span in spans)
                    )
                except Exception:
                    return SpanExportResult.FAILURE

        class SilentLogExporter(OTLPLogExporter):
            def export(inner_self, batch):
                try:
                    return super(SilentLogExporter, inner_self).export(batch)
                except Exception:
                    return LogRecordExportResult.FAILURE

        class SilentMetricExporter(OTLPMetricExporter):
            def export(inner_self, metrics_data, timeout_millis=10_000, **kwargs):
                try:
                    return super(SilentMetricExporter, inner_self).export(
                        metrics_data, timeout_millis=timeout_millis, **kwargs
                    )
                except Exception:
                    return MetricExportResult.FAILURE

        self._trace_api = trace
        self._shutdown = False
        self._instrumentors: list[Any] = []
        self._fastapi_instrumentor = None
        self._fastapi_app = None
        self._otel_logger = logging.getLogger("opentelemetry")
        self._otel_logger_previous_propagate = self._otel_logger.propagate
        self._otel_null_handler = logging.NullHandler()
        self._otel_logger.addHandler(self._otel_null_handler)
        self._otel_logger.propagate = False

        service_name = "shuttleworks-worker" if role == "worker" else "shuttleworks-api"
        # Construct directly instead of Resource.create(): create() runs the
        # generic environment detector and would admit arbitrary
        # OTEL_RESOURCE_ATTRIBUTES outside our privacy allow-list.
        resource = Resource(
            {
                "service.name": service_name,
                "service.version": APP_VERSION,
                "service.instance.id": instance_id,
                "deployment.environment.name": settings.environment,
            }
        )
        timeout = max(0.1, float(settings.otel_exporter_otlp_timeout))
        base = settings.otel_exporter_otlp_endpoint

        span_exporter = SanitizingSpanExporter(
            endpoint=_signal_endpoint(
                base, settings.otel_exporter_otlp_traces_endpoint, "traces"
            ),
            timeout=timeout,
        )
        self.tracer_provider = TracerProvider(resource=resource, shutdown_on_exit=False)
        self.tracer_provider.add_span_processor(
            BatchSpanProcessor(
                span_exporter,
                max_queue_size=2048,
                max_export_batch_size=256,
                export_timeout_millis=timeout * 1000,
            )
        )
        self.tracer = self.tracer_provider.get_tracer(_INSTRUMENTATION_SCOPE, APP_VERSION)

        metric_exporter = SilentMetricExporter(
            endpoint=_signal_endpoint(
                base, settings.otel_exporter_otlp_metrics_endpoint, "metrics"
            ),
            timeout=timeout,
        )
        metric_reader = PeriodicExportingMetricReader(
            metric_exporter,
            export_interval_millis=60_000,
            export_timeout_millis=timeout * 1000,
        )
        self.meter_provider = MeterProvider(
            metric_readers=[metric_reader], resource=resource, shutdown_on_exit=False
        )
        self.meter = self.meter_provider.get_meter(_INSTRUMENTATION_SCOPE, APP_VERSION)
        self._metric_instruments = self._create_metric_instruments(role, settings)

        log_exporter = SilentLogExporter(
            endpoint=_signal_endpoint(
                base, settings.otel_exporter_otlp_logs_endpoint, "logs"
            ),
            timeout=timeout,
        )
        self.logger_provider = LoggerProvider(resource=resource, shutdown_on_exit=False)
        self.logger_provider.add_log_record_processor(
            BatchLogRecordProcessor(
                log_exporter,
                max_queue_size=2048,
                max_export_batch_size=256,
                export_timeout_millis=timeout * 1000,
            )
        )
        self.log_handler = LoggingHandler(
            level=logging.NOTSET, logger_provider=self.logger_provider
        )
        self.log_handler.addFilter(TelemetryLogFilter())
        logging.getLogger().addHandler(self.log_handler)

        self._instrument_non_http_layers()

    def _create_metric_instruments(self, role: str, settings) -> dict[str, Any]:
        from opentelemetry.metrics import Observation

        instruments = {
            "solve_duration": self.meter.create_histogram(
                "shuttleworks.solve.duration", unit="s", description="CP-SAT solve time"
            ),
            "queue_wait": self.meter.create_histogram(
                "shuttleworks.solve_jobs.queue.wait",
                unit="s",
                description="Time from enqueue to execution",
            ),
            "job_outcome": self.meter.create_counter(
                "shuttleworks.solve_jobs.outcomes",
                unit="{job}",
                description="Terminal and retry solve-job outcomes",
            ),
            "state_conflict": self.meter.create_counter(
                "shuttleworks.http.state_conflicts",
                unit="{conflict}",
                description="Rejected optimistic-concurrency writes",
            ),
        }
        if role == "api":
            snapshot_cache: dict[str, Any] = {"at": 0.0, "value": None}

            def read_snapshot():
                from opentelemetry.instrumentation.utils import suppress_instrumentation

                now = time.monotonic()
                if snapshot_cache["value"] is not None and now - snapshot_cache["at"] < 1:
                    return snapshot_cache["value"]
                from db.session import SessionLocal
                from solve_rail.solve_jobs import queue_snapshot

                # Metric collection is infrastructure work, not a child of a
                # product request. Avoid root SQL spans on every collection.
                with suppress_instrumentation(), SessionLocal() as session:
                    value = queue_snapshot(
                        session, lease_seconds=settings.job_lease_seconds
                    )
                snapshot_cache.update(at=now, value=value)
                return value

            def queue_observations(_options):
                try:
                    snapshot = read_snapshot()
                    return [
                        Observation(count, {"job.state": state})
                        for state, count in snapshot["counts"].items()
                        if state in {"queued", "claimed", "running"}
                    ]
                except Exception:
                    return []

            def oldest_observations(_options):
                try:
                    snapshot = read_snapshot()
                    age = snapshot["oldest_queued_age_seconds"]
                    return [] if age is None else [Observation(age)]
                except Exception:
                    return []

            def lease_observations(_options):
                try:
                    snapshot = read_snapshot()
                    return [
                        Observation(count, {"lease.state": state})
                        for state, count in snapshot["leases"].items()
                    ]
                except Exception:
                    return []

            instruments["queue_depth"] = self.meter.create_observable_gauge(
                "shuttleworks.solve_jobs.queue.depth",
                callbacks=[queue_observations],
                unit="{job}",
                description="Jobs by bounded lifecycle state",
            )
            instruments["queue_oldest"] = self.meter.create_observable_gauge(
                "shuttleworks.solve_jobs.queue.oldest_age",
                callbacks=[oldest_observations],
                unit="s",
                description="Age of the oldest queued solve job",
            )
            instruments["leases"] = self.meter.create_observable_gauge(
                "shuttleworks.solve_jobs.leases",
                callbacks=[lease_observations],
                unit="{job}",
                description="Active solve-job leases by health",
            )
        return instruments

    def _instrument_non_http_layers(self) -> None:
        from opentelemetry.metrics import NoOpMeterProvider
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.instrumentation.urllib import URLLibInstrumentor

        from db.session import engine

        noop_meter = NoOpMeterProvider()
        sqlalchemy = SQLAlchemyInstrumentor()
        sqlalchemy.instrument(
            engine=engine,
            tracer_provider=self.tracer_provider,
            meter_provider=noop_meter,
            enable_commenter=False,
        )
        self._instrumentors.append(sqlalchemy)
        urllib = URLLibInstrumentor()
        urllib.instrument(
            tracer_provider=self.tracer_provider,
            meter_provider=noop_meter,
        )
        self._instrumentors.append(urllib)

    def instrument_fastapi(self, app) -> None:
        if self._fastapi_app is not None:
            return
        from opentelemetry.metrics import NoOpMeterProvider
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        instrumentor = FastAPIInstrumentor()
        instrumentor.instrument_app(
            app,
            tracer_provider=self.tracer_provider,
            meter_provider=NoOpMeterProvider(),
            excluded_urls=",".join(_OPERATIONAL_PATHS),
            exclude_spans=["receive", "send"],
        )
        self._fastapi_instrumentor = instrumentor
        self._fastapi_app = app

    def start_span(
        self,
        name: str,
        *,
        kind: str,
        attributes: dict[str, Any] | None,
        parent_context: Any | None,
    ):
        kinds = {
            "internal": self._trace_api.SpanKind.INTERNAL,
            "producer": self._trace_api.SpanKind.PRODUCER,
            "consumer": self._trace_api.SpanKind.CONSUMER,
            "client": self._trace_api.SpanKind.CLIENT,
        }
        safe, _ = sanitize_span_attributes(attributes)
        return self.tracer.start_as_current_span(
            name,
            context=parent_context,
            kind=kinds.get(kind, self._trace_api.SpanKind.INTERNAL),
            attributes=safe,
            record_exception=False,
            set_status_on_exception=True,
        )

    def inject_trace_context(self) -> dict[str, str]:
        from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

        carrier: dict[str, str] = {}
        TraceContextTextMapPropagator().inject(carrier)
        return dict(carrier)

    def extract_trace_context(self, carrier: dict[str, str] | None):
        from core.telemetry.context import normalize_trace_carrier
        from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

        return TraceContextTextMapPropagator().extract(
            carrier=normalize_trace_carrier(carrier) or {}
        )

    def record_metric(
        self, instrument: str, value: int | float, attributes: dict[str, Any]
    ) -> None:
        target = self._metric_instruments.get(instrument)
        if target is None:
            return
        try:
            target.record(value, attributes) if instrument in {
                "solve_duration",
                "queue_wait",
            } else target.add(value, attributes)
        except Exception:
            return

    @contextmanager
    def observe_scheduler_solve(self, stats: dict[str, Any]):
        from core.telemetry.instruments import record_solve

        attrs = _solver_stats_attributes(stats)
        started = time.perf_counter()
        with self.start_span(
            "scheduler.solve", kind="internal", attributes=attrs, parent_context=None
        ) as span:
            result_holder: dict[str, Any] = {}

            def finish(result) -> None:
                result_holder["result"] = result

            try:
                yield finish
            finally:
                result = result_holder.get("result")
                elapsed = time.perf_counter() - started
                status = "error"
                if result is not None:
                    raw_status = getattr(result, "status", "unknown")
                    status = normalize_solver_status(raw_status)
                    wall_time = max(0.0, float(getattr(result, "runtime_ms", 0.0))) / 1000
                    span.set_attribute("shuttleworks.solver.status", status)
                    span.set_attribute("shuttleworks.solver.wall_time_s", wall_time)
                    objective = getattr(result, "objective_score", None)
                    if objective is not None:
                        span.set_attribute("shuttleworks.solver.objective", float(objective))
                    record_solve(wall_time, status)
                else:
                    span.set_attribute("shuttleworks.solver.status", status)
                    span.set_attribute("shuttleworks.solver.wall_time_s", elapsed)
                    record_solve(elapsed, status)

    def shutdown(self) -> None:
        if getattr(self, "_shutdown", False):
            return
        self._shutdown = True
        fastapi_app = getattr(self, "_fastapi_app", None)
        fastapi_instrumentor = getattr(self, "_fastapi_instrumentor", None)
        if fastapi_app is not None and fastapi_instrumentor is not None:
            try:
                fastapi_instrumentor.uninstrument_app(fastapi_app)
            except Exception:
                pass
        for instrumentor in reversed(getattr(self, "_instrumentors", [])):
            try:
                instrumentor.uninstrument()
            except Exception:
                pass
        log_handler = getattr(self, "log_handler", None)
        if log_handler is not None:
            logging.getLogger().removeHandler(log_handler)
        logger_provider = getattr(self, "logger_provider", None)
        if logger_provider is not None:
            try:
                logger_provider.shutdown()
            except Exception:
                pass
        meter_provider = getattr(self, "meter_provider", None)
        if meter_provider is not None:
            try:
                meter_provider.shutdown(timeout_millis=2_000)
            except Exception:
                pass
        tracer_provider = getattr(self, "tracer_provider", None)
        if tracer_provider is not None:
            try:
                tracer_provider.shutdown()
            except Exception:
                pass
        otel_logger = getattr(self, "_otel_logger", None)
        otel_null_handler = getattr(self, "_otel_null_handler", None)
        if otel_logger is not None and otel_null_handler is not None:
            otel_logger.removeHandler(otel_null_handler)
            otel_logger.propagate = self._otel_logger_previous_propagate
        if get_runtime() is self:
            set_runtime(None)
        try:
            from scheduler_core.telemetry import configure_solve_observer

            configure_solve_observer(None)
        except Exception:
            pass


def _solver_stats_attributes(stats: dict[str, Any]) -> dict[str, Any]:
    mapping = {
        "num_matches": "shuttleworks.solver.matches",
        "num_players": "shuttleworks.solver.players",
        "num_intervals": "shuttleworks.solver.intervals",
        "num_no_overlap": "shuttleworks.solver.no_overlap_groups",
        "num_variables": "shuttleworks.solver.variables",
        "total_slots": "shuttleworks.solver.slots",
        "court_count": "shuttleworks.solver.courts",
        "locked_count": "shuttleworks.solver.locked_matches",
        "multi_match_players": "shuttleworks.solver.multi_match_players",
        "max_matches_per_player": "shuttleworks.solver.max_matches_per_player",
    }
    return {
        attribute: int(stats[key])
        for key, attribute in mapping.items()
        if key in stats and isinstance(stats[key], (int, float))
    }


def configure_telemetry(
    settings, *, role: str, instance_id: str | None = None
) -> TelemetryRuntime | None:
    """Configure all signals, or return immediately when explicitly off.

    Any setup error is intentionally swallowed.  Telemetry is diagnostic and
    cannot become a process-start dependency.
    """
    if not settings.otel_exporter_otlp_endpoint.strip():
        return None
    if settings.otel_exporter_otlp_protocol.strip().lower() != "http/protobuf":
        return None
    current = get_runtime()
    if current is not None:
        return current
    runtime_type = TelemetryRuntime
    runtime = runtime_type.__new__(runtime_type)
    try:
        runtime_type.__init__(
            runtime,
            settings,
            role=role,
            instance_id=instance_id or settings.worker_id or socket.gethostname(),
        )
        set_runtime(runtime)
        try:
            from scheduler_core.telemetry import configure_solve_observer

            configure_solve_observer(runtime.observe_scheduler_solve)
        except Exception:
            pass
        return runtime
    except Exception:
        # Construction may already have installed a root log handler or an
        # instrumentor before a later exporter/provider rejects its config.
        # Roll those pieces back so failed telemetry setup is indistinguishable
        # from disabled telemetry to the application.
        cleanup = getattr(runtime, "shutdown", None)
        if cleanup is not None:
            try:
                cleanup()
            except Exception:
                pass
        set_runtime(None)
        return None
