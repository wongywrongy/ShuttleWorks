"""W3C context round-trip through a committed solve_jobs row."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.telemetry.context import enqueue_span
from core.telemetry.state import set_runtime
from db.models import Base, SolveJob, Tournament
from solve_rail import solve_jobs
from solve_rail.solve_runner import RunnerOutcome
from solve_rail.solve_worker import SolveWorker


class InMemoryRuntime:
    def __init__(self):
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor
        from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

        self.exporter = InMemorySpanExporter()
        self.provider = TracerProvider()
        self.provider.add_span_processor(SimpleSpanProcessor(self.exporter))
        self.tracer = self.provider.get_tracer("rail-test")
        self.metric_points = []

    def start_span(self, name, *, kind, attributes, parent_context):
        from opentelemetry.trace import SpanKind

        kinds = {
            "internal": SpanKind.INTERNAL,
            "producer": SpanKind.PRODUCER,
            "consumer": SpanKind.CONSUMER,
        }
        return self.tracer.start_as_current_span(
            name, context=parent_context, kind=kinds[kind], attributes=attributes
        )

    def inject_trace_context(self):
        from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

        carrier = {}
        TraceContextTextMapPropagator().inject(carrier)
        return carrier

    def extract_trace_context(self, carrier):
        from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

        return TraceContextTextMapPropagator().extract(carrier=carrier or {})

    def record_metric(self, instrument, value, attributes):
        self.metric_points.append((instrument, value, attributes))


@pytest.fixture
def Session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    try:
        yield sessionmaker(
            bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
        )
    finally:
        set_runtime(None)
        engine.dispose()


def _enqueue(Session, runtime: InMemoryRuntime, *, with_context: bool) -> SolveJob:
    set_runtime(runtime)
    with Session() as session:
        tournament = Tournament(name="telemetry-rail")
        session.add(tournament)
        session.commit()
        if with_context:
            with enqueue_span(
                {
                    "shuttleworks.tournament.id": str(tournament.id),
                    "shuttleworks.job.type": solve_jobs.MEET_SCHEDULE_SOLVE,
                }
            ) as carrier:
                job, _ = solve_jobs.enqueue(
                    session,
                    tournament_id=tournament.id,
                    type_=solve_jobs.MEET_SCHEDULE_SOLVE,
                    params={"wall_clock_ceiling_seconds": 1},
                    input_snapshot={"config": {}, "matches": [], "players": []},
                    trace_context=carrier,
                )
        else:
            job, _ = solve_jobs.enqueue(
                session,
                tournament_id=tournament.id,
                type_=solve_jobs.MEET_SCHEDULE_SOLVE,
                params={"wall_clock_ceiling_seconds": 1},
                input_snapshot={"config": {}, "matches": [], "players": []},
            )
        session.commit()
        session.refresh(job)
        return job


def test_committed_carrier_is_recovered_by_a_separate_worker_runtime(Session):
    producer_runtime = InMemoryRuntime()
    job = _enqueue(Session, producer_runtime, with_context=True)
    assert set(job.trace_context) <= {"traceparent", "tracestate"}
    producer = next(
        span
        for span in producer_runtime.exporter.get_finished_spans()
        if span.name == "solve_jobs publish"
    )

    worker_runtime = InMemoryRuntime()
    set_runtime(worker_runtime)
    settings = SimpleNamespace(
        job_poll_interval_seconds=0.01,
        job_lease_seconds=30.0,
        job_retention_days=30,
        solve_memory_limit_mb=128,
    )
    worker = SolveWorker(
        settings=settings,
        session_factory=Session,
        worker_id="remote-node",
        runner=lambda *_args, **_kwargs: RunnerOutcome(
            kind="ok",
            result={"status": "optimal", "runtimeMs": 12.5, "objectiveScore": 3},
        ),
    )
    assert worker.run_once() is True
    spans = worker_runtime.exporter.get_finished_spans()
    consumer = next(span for span in spans if span.name == "solve_jobs process")
    solver = next(span for span in spans if span.name == "scheduler.solve")
    assert consumer.context.trace_id == producer.context.trace_id
    assert consumer.parent.span_id == producer.context.span_id
    assert consumer.attributes["shuttleworks.worker.topology"] == "standalone"
    assert solver.parent.span_id == consumer.context.span_id


def test_missing_carrier_is_a_new_trace_negative_control(Session):
    producer_runtime = InMemoryRuntime()
    job = _enqueue(Session, producer_runtime, with_context=False)
    assert job.trace_context is None

    worker_runtime = InMemoryRuntime()
    set_runtime(worker_runtime)
    worker = SolveWorker(
        settings=SimpleNamespace(
            job_poll_interval_seconds=0.01,
            job_lease_seconds=30.0,
            job_retention_days=30,
            solve_memory_limit_mb=128,
        ),
        session_factory=Session,
        worker_id="remote-node",
        runner=lambda *_args, **_kwargs: RunnerOutcome(
            kind="ok", result={"status": "optimal"}
        ),
    )
    assert worker.run_once() is True
    consumer = next(
        span
        for span in worker_runtime.exporter.get_finished_spans()
        if span.name == "solve_jobs process"
    )
    assert consumer.parent is None
