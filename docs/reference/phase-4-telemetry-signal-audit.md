# Phase 4 telemetry signal audit

This is a repository audit of plan sections 8.4, 8.8, and 8.9. It does not
claim a deployed Collector or telemetry backend.

| Area | Emitted/configured evidence | Dashboard/alert | Result |
| --- | --- | --- | --- |
| Sync outbox depth/age | `bootstrap.py` observable gauges | Dashboard + alerts | Mapped |
| Sync upload/retry outcomes | `instruments.py` counters | Dashboard (retry panel added in this audit) | Mapped |
| Authority/recovery | `instruments.py` counters | Dashboard; authority alert | Mapped |
| SQLite WAL/disk/busy | `bootstrap.py` observations + `instruments.py` busy events | Dashboard + WAL/disk alerts | Mapped |
| Solve/job/conflict | `bootstrap.py` instruments | No operations dashboard panel | Emitted but presentation gap |
| Standard HTTP metrics | FastAPI instrumentation is wired with the runtime meter provider | No dashboard panel/alert | Repository wiring exists; backend emission requires deployed/runtime verification |
| Database pool/query/transaction health | SQLAlchemy tracing plus availability and bounded pool gauges | Dashboard + availability alert | Mapped; deployed PostgreSQL behavior still requires rehearsal |
| Backup/restore | Recovery outcomes plus scheduler age, generations, free-space, and restore-test gauges | Dashboard + stale/restore alerts | Mapped |
| Process health | Process uptime and resident-memory gauges | Dashboard | Mapped; thresholds remain hardware-specific |
| Collector queue/exporter health | Detailed Collector self-metrics on loopback | Dashboard + queue/export alerts | Mapped; real backend scraping and alert delivery remain deployment gaps |
| Host and LAN health | No host agent or LAN probe receiver is configured | No dashboard/alert | Deployment-only gap |

No phantom dashboard metrics were found: every dashboard metric maps to an
instrument or observable gauge in `core/telemetry`. Alert names intentionally
use the Prometheus-normalized form of the dotted metric names.

The repository now also contains an opt-in containerized transport rehearsal.
It proves correlated OTLP delivery, Collector-boundary redaction, durable queue
survival across a gateway outage and Collector restart, reconnect drain, and a
bounded local command-latency comparison. Host/LAN signals, real backend
scraping and alert delivery, reference-hardware budgets, and production
PostgreSQL behavior still require deployed receiver validation.
