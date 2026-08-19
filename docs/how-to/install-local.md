# Install: local mode (one machine, offline)

**Local mode is a first-class product mode, not a development shortcut.** It is
what a tournament director runs on a laptop in a gym with unreliable Wi-Fi: one
process, one SQLite file, no accounts, no email, no network. A tournament
completes cleanly with the internet down all day, because nothing in the write
path reaches out.

If you want the multi-tenant deployment instead, see
[Install: self-hosted](/how-to/install-selfhost).

## What you get

| | |
|---|---|
| Database | SQLite, one file |
| Identity | A single bootstrap operator (`local@dev`) — no signup, no login |
| Solving | Embedded worker inside the API process |
| Email | Console backend (invites and resets print to the log) |
| Network | None required |

## Prerequisites

Docker, or Python 3.11 + Node for a from-source run.

## Run it

```bash
git clone <repo> shuttleworks && cd shuttleworks
make scheduler
```

Frontend on `:80`, backend on `:8000`. On Windows hosts where port 8000 is in a
reserved range, prefix `BACKEND_HOST_PORT=8600`.

`make stop` shuts it down. `make scheduler-dev` runs Vite on `:5173` with HMR
instead.

That is the whole installation. Defaults in `apps/api/app/config.py`
already describe local mode — `ENVIRONMENT=local`, `AUTH_MODE=local`,
`EMBEDDED_WORKER=true`, `EMAIL_BACKEND=console` — so no `.env` is needed.

## What "no accounts" means

With `AUTH_MODE=local`, a request without a session cookie resolves to the
bootstrap identity rather than being rejected. That identity is a real row in
`users` (created at startup), owns the workspaces you create, and appears in
People & Access as `local@dev`. The same membership and role code runs as in
cloud mode — there is no bypass — it is just that everything is one person.

Consequences worth knowing:

- **Anyone who can reach the port is that operator.** Local mode assumes a
  trusted network. Do not expose it to the internet; if you need remote
  operators, that is [self-hosted mode](/how-to/install-selfhost).
- Member-management actions mostly do not apply. The bootstrap user is the sole
  owner, so "leave" and "demote" are correctly refused with a visible reason —
  a workspace must always have at least one owner.

## Backups, and the part people skip

The app ships **workspace backups**: Settings → Sync & Backups, or
`GET/POST /tournaments/{id}/backups` and
`POST /tournaments/{id}/backups/{filename}/restore`. Each is a full JSON
snapshot of workspace state, restorable in one click. Use them before anything
irreversible — regenerating a draw, clearing a schedule.

**Those backups live in the same SQLite file as the data they protect.** If the
disk dies, both go with it.

This is the same bargain every desktop application offers, and the remedy is the
same: **copy the data directory somewhere else.** With the Docker stack that is
`data/`; running from source it is wherever `DATA_DIR` points.

```bash
# Before an event, and after it.
cp -r data ~/backups/shuttleworks-$(date +%F)
```

A copy on a USB stick or a cloud drive is sufficient. There is no in-product
off-site replication, and adding one has been considered and rejected — see
[ADR 0012](/decisions/0012-remove-the-supabase-mirror), which removed the last
attempt at it (a one-way push with no restore path that was never once
configured). Off-site durability for a single operator on their own machine is
that operator's responsibility, and stating so plainly is more useful than
shipping a mechanism nobody verifies.

Cloud mode is different — there it is not optional, and
[Install: self-hosted](/how-to/install-selfhost#backup-and-restore) covers
`pg_dump` and the restore drill.

## Verifying

```bash
curl localhost:8000/health          # liveness
curl localhost:8000/health/ready    # database reachable + schema current
```

`ready` returning 503 with `"schemaCurrent": false` means migrations have not
run — check the backend logs for `alembic_upgrade_head_complete`.

## Upgrading

```bash
git pull
make scheduler          # rebuilds; migrations run automatically at startup
```

Take a copy of the data directory first. Migrations are one-way; the
downgrade path exists but is not a supported upgrade-rollback story.

## Moving to a shared deployment later

Local mode and cloud mode are the same codebase, and the data model is
identical. There is no in-product migration path today — you would recreate
workspaces on the new install — but nothing about running locally now forecloses
that later.
