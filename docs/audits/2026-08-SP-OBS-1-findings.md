# SP-OBS-1 — application telemetry findings

**Status:** implemented 2026-08-31.

The Phase 0 audit found no existing OpenTelemetry pipeline or backend coupling.
The monitoring surface consisted of standard-library logs, the guarded JSON
`/health/metrics` response and a process-local optimistic-conflict counter.
Those compatibility surfaces remain in place and now feed the native OTLP
product signals.

The implemented rulings are:

- one programmatic OTLP/HTTP bootstrap, activated only by the standard generic
  endpoint variable;
- request → enqueue producer → database W3C carrier → worker consumer as one
  trace, including retries as sibling consumer attempts;
- process identity for the embedded topology (`shuttleworks-api`) and a worker
  identity only for standalone processes (`shuttleworks-worker`);
- one long-lived SSE server span with explicit executor-context propagation;
- an allow-listed export projection which removes dynamic log arguments, SQL,
  request content and exception detail;
- bounded product metric dimensions, with queue/lease state derived from the
  same query used by `/health/metrics`;
- maintained VitePress guidance rather than resurrecting the retired
  `REFACTOR_PROGRESS.md` ledger.

See [Export application telemetry](/how-to/observability) for operation and
future-development rules.
