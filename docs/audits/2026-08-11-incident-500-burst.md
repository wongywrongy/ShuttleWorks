# OPEN INCIDENT: 118 × HTTP 500 under ordinary concurrency

**Status: open. Never explained. Has not reproduced.** Moved here from `docs/audits/debt-log.md`
on 2026-08-12 so the log could stay scannable; the log's own rule is that narration belongs in the
audit doc it came from. Nothing about the incident has changed. This is not a defect entry, it is an
unexplained production-shaped incident kept open deliberately.

> **If you are reading this because you just saw it again, that is new evidence.** Go straight to
> `docker logs` and capture the traceback. The first occurrence did not leave one.

## What was observed

2026-08-10, a full-scale browser pass against the seeded cloud-mode demo stack. nginx's access log
recorded **118 responses with status 500**.

- In each concurrent batch, roughly **two requests succeeded and every other one failed instantly**,
  about 15 ms, not a timeout.
- The SPA fans out to 4 to 6 requests per page load, so it fired on **ordinary navigation**, not
  under load. The container was idle at 0.18% CPU and 145 MB of 1 GB. The connection pool is 20.
- **Path-independent and data-independent.** Reproduced identically against the backend's published
  port and through nginx, so neither a proxy nor a browser artefact, and it hit public surfaces too
  (`/display/{token}/summary`).
- Every failing route was **synchronous, DB-backed, and resolved through `get_repository`**.
  `/health`, the one dependency-free `async` route, never failed once.
- The response body was a bare `Internal Server Error` as `text/plain`: an unhandled exception, not
  a deliberate rejection.
- Ramping concurrency on a single endpoint showed a **hard ceiling of two**.

## What has been ruled out

A dedicated diagnosis pass **could not reproduce it**: ~1,300 requests across parallel bursts against
the current tree, all clean. It established that the container serving the 500s was running an
**older image**, and that rebuilding *that* tree did not reproduce it either.

**No change has been made that would explain the original behaviour, so nothing here is a fix and the
incident must not be recorded as closed.**

## The soak

"Latent state in a long-lived process" is the leading reading, and short bursts against a fresh
container are exactly the test that would miss it. So, 2026-08-11: **25 minutes** of continuous
browser-shaped load against the live demo container, as a 15-minute segment, a two-minute idle probe,
then a 10-minute segment.

Four concurrent drivers (two authenticated sessions across one meet and three bracket workspaces,
plus an anonymous driver on the public display and entrant surfaces), hitting ~30 distinct DB-backed
routes rather than one route repeated, direct to `:8600` **and** through nginx `:8090`, up to 24
requests in flight at ~46 req/s.

**68,619 requests, zero non-200 responses**, zero tracebacks in the container log.

- Mean latency flat across the whole run. Segment 1 by 3-minute bucket: 61.9 / 58.9 / 62.6 / 54.2 /
  56.8 ms. Segment 2 by 2-minute bucket: 68.8 / 67.0 / 65.6 / 76.3 / 59.0 ms. Noise, no trend.
- Threads 37 to 49 under load, returning to 30 at idle. File descriptors 50 to 63. TCP connections
  4 to 19.
- RSS rose ~20 MB over the first ten minutes (161 to ~180 MB) then **plateaued** (~184 MB after a
  further ten) and did not return to baseline when load stopped. Consistent with allocator/pool
  warm-up rather than a leak, but **it is the one number worth re-checking on a run measured in
  hours**.

The soak was **read-only**, because the demo data was in use. A concurrent *write* mix over hours is
the one shape still unexercised outside the test suite.

Harness: a shell loop plus `curl -Z`, no new dependency. Scripts were scratch, not committed.

## What now exists to catch it

1. **The backend logs again.** `alembic/env.py` called `fileConfig` without
   `disable_existing_loggers=False`, so running migrations at startup switched off every logger
   uvicorn had configured *for the life of the process*. That is why hundreds of 500s left no access
   log and not one traceback, and why this took a browser to find rather than a log tail (`efeb08c`).
2. **`products/scheduler/tests/test_concurrent_requests.py`** (`7cae310`) fires genuinely parallel
   requests at the **whole** `app.main:app` over file-backed SQLite: reads, writes, a read/write mix,
   and the uniform-404 seam. It carries a negative control asserting the burst really overlaps and
   that the DB has not gone in-memory, since `StaticPool` would silently remove the concurrency under
   test. Before it, the ~1,580-test suite and the ~2,000-request simulator were both strictly
   sequential, so this entire failure class was invisible to every gate.

Size: unknown by construction. It is an investigation, not a task.
