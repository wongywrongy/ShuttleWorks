# ADR 0003 — SQLite as primary persistence

**Status:** Accepted (2026, architecture-adjustment arc)

## Context

ShuttleWorks runs on the tournament director's laptop, in a gym, where Wi-Fi is unreliable. An early
cloud-prep direction targeted a cloud-hosted backend with Supabase Postgres as the primary store. But
the operating reality is unforgiving: the schedule is solved and mutated **on the director's machine**
during a live event, and **the day cannot stop because the network did**. A solve can take ~30 s;
operators on the LAN need sub-second reads; the tournament must complete even with the internet down
for hours.

That reversed the question from "how do we host this in the cloud" to "what is the source of truth,
and where does it live."

## Decision

Make the **director's local SQLite (via SQLAlchemy 2.0, with Alembic migrations) the canonical source
of truth.** Supabase Postgres is a **mirror**, not the primary, populated asynchronously:

- All reads/writes for the event go to local SQLite, fronted by `repositories/local.py`.
- A crash-safe **outbox** (`services/sync_service.py`) drains a `sync_queue` table to Supabase; the
  queue row is inserted *in the same transaction* as the data write, so a write can never go unmirrored
  and recovery is idempotent.
- Operators and the public TV read mirrored writes via **Supabase Realtime** (with polling fallback);
  `commands`, `sync_queue`, and `match_states` stay local-only.

The packaging end-state is a Tauri desktop app shipping the FastAPI backend as a sidecar (today:
Docker Compose). See `docs/deploy/cloud.md`.

## Consequences

- **Positive** — the tournament is **resilient**: it completes cleanly even if Supabase is unreachable
  for the entire day; the mirror catches up via the outbox when connectivity returns.
- **Positive** — local reads/writes are fast and simple; no network round-trip on the hot path.
- **Negative / cost** — **two copies of truth** (local SQLite + Supabase Postgres) whose schemas must
  stay in lockstep via Alembic; the mirror can lag.
- **Negative / cost** — **single-writer assumptions.** The model is "one director's laptop is the
  truth." Multi-worker / Postgres-as-primary deployments would need real concurrency control (e.g.
  `SELECT … FOR UPDATE` around the `matches.version` check) — flagged as out of envelope.
- **Known tuning debt** — under contention a long solve plus the default SQLite pool can surface
  "database is locked"; enabling WAL + a `busy_timeout` and pre-allocating the pool is the highest
  impact-per-effort fix on the audit list.

## See also

- [Data flow](/architecture/data-flow#the-outbox-and-the-cloud-mirror) · [Backend structure](/architecture/backend-structure)
