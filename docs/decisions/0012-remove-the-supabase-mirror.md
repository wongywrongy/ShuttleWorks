# ADR 0012 — Remove the Supabase mirror

**Status:** Accepted (2026-08-04, SP-CLOUD-3 / 0.E)
**Supersedes the mirror half of** [ADR 0003](/decisions/0003-sqlite-as-primary-persistence).
ADR 0003's primary decision — local SQLite as the canonical source of truth in
local mode — **still stands**. Only its "Supabase Postgres is a mirror" clause is
retired here.

## Context

ADR 0003 established a crash-safe outbox: a `sync_queue` table drained by
`services/sync_service.py` into a Supabase Postgres project, with the queue row
written in the same transaction as the data write. Operators and the public TV
display were to read mirrored writes via Supabase Realtime.

Three things changed between that decision and this one.

**1. The premise inverted.** The outbox exists because "SQLite on a laptop is the
only copy, and it needs a cloud copy." SP-CLOUD-1 and SP-CLOUD-2 introduced a
real cloud mode where **Postgres is the primary**, backed up by `pg_dump`.
Pushing a partial, denormalised copy of seven entity types into a second vendor's
Postgres adds no availability and no recovery capability that `pg_dump` does not
already provide better.

**2. Its consumers went away.** The public TV display no longer subscribes to
Supabase Realtime — SP-CLOUD-2 replaced it with capability-token projection
routes (`/display/{token}/*`) that poll the director's own backend. Supabase Auth
was retired in the same slice. By 2026-08-04 the outbox had no reader at all.

**3. It was never operated.** The SP-CLOUD-3 Phase 0 audit found that no Supabase
credential or project reference has ever been committed (`git log -S` across all
branches on both `eyJ` and `.supabase.co` returns only placeholders), and every
`SUPABASE_*` value in the tree is blank. The drain thread only starts when both
`SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, so it never started. The real
`local.db` was carrying **827 undrained `sync_queue` rows** at the time of
removal — writes accumulated from Step E onward and pushed nothing, ever.

There was also a security dimension. Whatever row-level-security policies existed
on the Supabase side were applied by hand through the dashboard, were never in
version control, and keyed on an `auth.uid()` that stopped existing when Supabase
Auth was retired. Their effect could not be verified from the repository.

## Decision

**Remove the mirror entirely.** Not "disable in cloud mode" — remove.

Deleted: `services/sync_service.py`, the eleven enqueue call sites in
`repositories/local.py`, the `SyncQueue` model, the lifespan start/stop hooks,
the `supabase` dependency (with `postgrest`, `realtime`, `storage3`,
`supabase-auth`, `supabase-functions`, `yarl`), both `SUPABASE_*` settings, and
every trace of them from env templates, compose files, and the Settings UI.
Migration `p9a3b7c1d5e6` drops `sync_queue` on both dialects.

**After this ADR, Supabase is entirely absent from the product.**

### Why not keep it as a local-mode-only backup channel

That was the audit's initial recommendation and it is the option we rejected. It
sounds conservative but keeps the outbox writer, the `sync_queue` table, the
Supabase project, and the unverifiable policies alive — running only in local
mode, where nobody is watching. Unowned code writing data into a system with
unknown access controls is the worst of both states, not a middle ground.

### Why removing it takes away no recovery capability

The mirror was **one-way**. Nothing in the codebase ever read from Supabase, and
no code path could reconstruct a tournament from it. It was a data-export pipe
pointed at a project that never existed. A recovery mechanism you cannot recover
from is not a recovery mechanism.

In-product recovery is `tournament_backups` — `GET/POST
/tournaments/{id}/backups` plus `POST .../backups/{filename}/restore`, storing
full JSON snapshots of tournament state. It is actually used: the real database
held 29 backups at removal time. For the failure people actually hit ("I made a
mess, undo it") it is strictly better than the mirror ever was.

## Consequences

**Local mode gains no in-product off-site durability, and never had any.**
`tournament_backups` rows live in the same SQLite file as the data they protect,
so a lost disk loses both. This is the honest residual gap, and it is where it
belongs: local mode is a single operator running software on their own machine,
and off-site durability there is the operator's responsibility in exactly the way
it is for any desktop application. `docs/how-to/install-local.md` states this
plainly rather than apologetically. Logged in the debt-log so a future reader
finds it as a known choice rather than an oversight.

**Cloud mode is where off-site durability is not optional, and it has a real
answer** — `pg_dump` plus `pg_dumpall --globals-only` (the least-privilege roles
are cluster objects and are *not* in a plain `pg_dump`), encrypted, off-host, with
a monthly restore drill. Documented in `docs/how-to/install-selfhost.md`.

**Data loss on migration is intended and total.** Undrained `sync_queue` rows are
entries for a destination that does not exist and no consumer can read. The
downgrade recreates the table's structure so the chain round-trips, but cannot
resurrect rows.

**Two debt-log entries die with the subsystem:** the mirror `org_id` gap (the
tournament payload carried `owner_id` but never `org_id`, so no policy could
express org-scoped access) and the stale-RLS story.

**One dependency-hygiene lesson worth keeping.** The `supabase` requirement
justified itself in a comment as *"used by `app/dependencies.get_current_user` to
verify the JWT on every protected route."* That stopped being true a slice
earlier. A dependency justified by a reason that has quietly expired is exactly
how unused packages survive audits.

## Revisiting

Cloud replication would be back on the table if ShuttleWorks needed
read-scaling across regions, or a genuine hot standby with automatic failover.
Neither is plausible at the current scale — one office host and one home worker,
serving events that run for a day.

If it ever is needed, the answer is **Postgres-native** (streaming replication or
logical replication to a managed replica), not an application-level outbox to a
third-party BaaS. An application outbox re-implements, badly, what the database
already does correctly: it cannot guarantee ordering across entity types, it
silently diverges when a push fails permanently, and — as this one demonstrated —
it can run for months writing rows nobody reads.
