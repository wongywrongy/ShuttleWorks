"""Tiny OTLP/HTTP capture gateway for the Phase 4 repository rehearsal.

This module is not a production telemetry backend. It accepts the three OTLP
protobuf endpoints and appends a deliberately small, privacy-safe projection
to JSONL so the rehearsal can prove transport, restart, drain, correlation,
and Collector redaction without depending on a vendor product.
"""
from __future__ import annotations

import gzip
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterable

from opentelemetry.proto.collector.logs.v1.logs_service_pb2 import (
    ExportLogsServiceRequest,
    ExportLogsServiceResponse,
)
from opentelemetry.proto.collector.metrics.v1.metrics_service_pb2 import (
    ExportMetricsServiceRequest,
    ExportMetricsServiceResponse,
)
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
    ExportTraceServiceRequest,
    ExportTraceServiceResponse,
)


OUTPUT = Path(os.environ.get("REHEARSAL_CAPTURE_PATH", "/evidence/signals.jsonl"))
PORT = int(os.environ.get("REHEARSAL_CAPTURE_PORT", "4318"))
_LOCK = threading.Lock()


def _value(value) -> Any:
    selected = value.WhichOneof("value")
    if selected is None:
        return None
    if selected == "array_value":
        return [_value(item) for item in value.array_value.values]
    if selected == "kvlist_value":
        return {item.key: _value(item.value) for item in value.kvlist_value.values}
    return getattr(value, selected)


def _attributes(values: Iterable) -> dict[str, Any]:
    return {item.key: _value(item.value) for item in values}


def _resource(values: Iterable) -> dict[str, Any]:
    return _attributes(values)


def _trace_records(payload: bytes) -> list[dict[str, Any]]:
    request = ExportTraceServiceRequest.FromString(payload)
    records: list[dict[str, Any]] = []
    for resource_spans in request.resource_spans:
        resource = _resource(resource_spans.resource.attributes)
        for scope_spans in resource_spans.scope_spans:
            for span in scope_spans.spans:
                records.append(
                    {
                        "signal": "trace",
                        "serviceInstanceId": resource.get("service.instance.id"),
                        "traceId": span.trace_id.hex(),
                        "spanId": span.span_id.hex(),
                        "name": span.name,
                        "attributes": _attributes(span.attributes),
                    }
                )
    return records


def _log_records(payload: bytes) -> list[dict[str, Any]]:
    request = ExportLogsServiceRequest.FromString(payload)
    records: list[dict[str, Any]] = []
    for resource_logs in request.resource_logs:
        resource = _resource(resource_logs.resource.attributes)
        for scope_logs in resource_logs.scope_logs:
            for item in scope_logs.log_records:
                records.append(
                    {
                        "signal": "log",
                        "serviceInstanceId": resource.get("service.instance.id"),
                        "traceId": item.trace_id.hex(),
                        "spanId": item.span_id.hex(),
                        "body": _value(item.body),
                        "attributes": _attributes(item.attributes),
                    }
                )
    return records


def _metric_records(payload: bytes) -> list[dict[str, Any]]:
    request = ExportMetricsServiceRequest.FromString(payload)
    records: list[dict[str, Any]] = []
    for resource_metrics in request.resource_metrics:
        resource = _resource(resource_metrics.resource.attributes)
        for scope_metrics in resource_metrics.scope_metrics:
            for metric in scope_metrics.metrics:
                records.append(
                    {
                        "signal": "metric",
                        "serviceInstanceId": resource.get("service.instance.id"),
                        "name": metric.name,
                    }
                )
    return records


_ENDPOINTS = {
    "/v1/traces": (_trace_records, ExportTraceServiceResponse),
    "/v1/logs": (_log_records, ExportLogsServiceResponse),
    "/v1/metrics": (_metric_records, ExportMetricsServiceResponse),
}


class Handler(BaseHTTPRequestHandler):
    server_version = "ShuttleWorksPhase4Capture/1"

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"healthy"}')

    def do_POST(self) -> None:  # noqa: N802
        endpoint = _ENDPOINTS.get(self.path)
        if endpoint is None:
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        parser, response_type = endpoint
        try:
            payload = self.rfile.read(length)
            if self.headers.get("Content-Encoding", "").lower() == "gzip":
                payload = gzip.decompress(payload)
            records = parser(payload)
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            with _LOCK, OUTPUT.open("a", encoding="utf-8") as stream:
                for record in records:
                    stream.write(json.dumps(record, sort_keys=True) + "\n")
        except Exception as exc:
            print(f"capture rejected: {type(exc).__name__}", file=sys.stderr, flush=True)
            self.send_error(400, type(exc).__name__)
            return
        body = response_type().SerializeToString()
        self.send_response(200)
        self.send_header("Content-Type", "application/x-protobuf")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        return


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
