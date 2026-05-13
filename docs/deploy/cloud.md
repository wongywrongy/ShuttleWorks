# ShuttleWorks Deployment Guide
_Last updated: 2026-05-13 (post architecture-adjustment arc)_

This document covers deploying the post-arc system: a Tauri sidecar
on the director's laptop, a Supabase project as the read-mirror +
auth, and a Vercel TV display.

The cloud-prep arc shipped a Fly.io / Render-deployable FastAPI;
the architecture-adjustment arc replaces that with the local sidecar
model below. Old `fly deploy` / Render web-service instructions are
*deliberately removed* — running the backend on a cloud host is no
longer the deployment story.

---

## Deployment overview

```
Director's laptop                    Supabase                    Vercel
─────────────────────                ────────                    ──────
Tauri app                            Postgres   ←── sync ─── ┐   TV display
  ├── FastAPI sidecar  ───── push ──→ matches                │     (public)
  │   (uvicorn, local)              tournaments              │
  ├── SQLite (source                 sync_queue              │
  │   of truth)                       …                      │
  └── React WebView                                          │
                                     Auth         ←─ JWT ────┤
                                                             │
Operator browsers     ─── Realtime read ──→ matches table    │
                       (any device, LAN or internet)         │
                       ── Commands ──→ Director's FastAPI    │
                                                             │
TV browsers           ───────── Realtime read ───────────────┘
```

There are three deployable surfaces:

1. **The director's laptop** runs the Tauri app (FastAPI sidecar +
   React WebView + SQLite). This is the only place the backend
   runs.
2. **Supabase project** holds the cloud Postgres mirror + Auth +
   Realtime. Schema is the arc's six application tables + two
   audit tables (see `docs/tech-stack.md`).
3. **Vercel** hosts the public TV display web app (read-only,
   Realtime subscriber).

The Tauri sidecar is what the operator boots on tournament day. The
Supabase project and the Vercel TV display are one-time setups per
event.

---

## Supabase project

A Supabase project was provisioned for ShuttleWorks during the
cloud-prep arc (Step 8 on 2026-05-13). The project-specific values
below are templated — substitute your own project ID / region /
publishable key from the Supabase Dashboard (or your `.env` file).
**Never commit the real values to this repo** — see the
secret-hygiene audit entry in `docs/changes/`.

| Field | Value |
|---|---|
| Project ID | `<PROJECT_ID>` |
| Project ref | `<PROJECT_ID>` |
| Region | `<REGION>` (e.g. `us-west-1`) |
| Supabase URL | `https://<PROJECT_ID>.supabase.co` |
| Publishable key | `<YOUR_PUBLISHABLE_KEY>` |
| Postgres host (pooler) | `aws-0-<REGION>.pooler.supabase.com:6543` |
| Postgres host (direct) | `db.<PROJECT_ID>.supabase.co:5432` |

### Schema migrations (prerequisite — apply before any sidecar boots in cloud-mode)

The local Alembic chain on the director's machine ends at revision
`e2a5f3b8c1d6` (Step E's `sync_queue` table). The Supabase project
was migrated up to `c2e587494c07` during the cloud-prep arc — it is
**missing** the three arc-adjustment migrations:

- `b7e3a9f4c8d2_step_a_matches_table` (Step A)
- `d8c4f1a7e6b2_step_c_commands_table` (Step C)
- `e2a5f3b8c1d6_step_e_sync_queue` (Step E)

Apply them via the Supabase MCP `apply_migration` tool or the
Supabase CLI before the director's sidecar ever boots in cloud mode
— otherwise the outbox worker will push into non-existent tables,
fail, increment `attempts`, and eventually cap. Order:

1. Apply `step_a_matches` (creates `matches` table + composite PK +
   index). Include the SQL backfill from the local migration if the
   Supabase database has any pre-existing `tournaments.data` content
   that needs to be projected.
2. Apply `step_c_commands_table` (creates `commands` + composite FK
   to matches).
3. Apply `step_e_sync_queue` (creates `sync_queue`).

After applying, confirm via `mcp__plugin_supabase__list_tables` that
`matches`, `commands`, `sync_queue` all appear under `public`.

### Realtime publication

The sidecar's frontend reads matches via Supabase Realtime; the
`matches` table needs to be included in Supabase's Realtime
publication. From the Dashboard: **Database → Publications →
supabase_realtime → Tables** → add `matches`.

Optional: also add `tournaments` if you want the public TV display
to react to tournament-level metadata changes. The sync service
pushes to both tables.

### Supabase Auth providers

Unchanged from the cloud-prep arc — see the previous version of this
doc in git history (or the equivalent setup in your Supabase
Dashboard). Briefly:

1. **Email**: enabled by default.
2. **Google OAuth**: flip on, paste OAuth client id / secret per
   Supabase's guide. Authorized redirect URI:
   `https://<PROJECT_ID>.supabase.co/auth/v1/callback`.
3. **Site URL**: the deployed frontend domain
   (`https://<TV-DOMAIN>.vercel.app`).
4. **Additional Redirect URLs**: same domain + any
   `/invite/<token>` deep links.

The Tauri sidecar itself doesn't need OAuth — the operators using it
in-person on the director's laptop are already authenticated through
the WebView's session.

---

## Director's laptop — Tauri sidecar

The director boots a single binary (or `npm run tauri dev` during
development). The binary launches:

1. A Python uvicorn process serving the FastAPI sidecar on a local
   port (defaults to `8000`).
2. The React WebView pointing at that local port.
3. The background `SyncService` worker thread that drains
   `sync_queue` to Supabase Postgres every 5 seconds.

### One-time setup (per laptop)

```bash
# Python dependencies for the sidecar.
cd products/scheduler/backend
pip install -r requirements.txt

# Frontend build for the WebView.
cd ../frontend
npm install
npm run build

# Tauri bundling (production binary).
cd ..
npm run tauri build
```

The Tauri build produces a platform-native installer in
`src-tauri/target/release/bundle/`. Distribute that to the director.

### Environment configuration

The sidecar reads its config from `backend/.env`. Cloud-mode config
(replication on):

```
ENVIRONMENT=cloud
DATABASE_URL=sqlite:///./data/local.db
SUPABASE_URL=https://<PROJECT_ID>.supabase.co
SUPABASE_ANON_KEY=<YOUR_PUBLISHABLE_KEY>
CORS_ORIGINS=http://localhost:1420,http://localhost:5173
LOG_LEVEL=info
DATA_DIR=./data
```

Local-mode config (no replication — useful for offline tournament
days):

```
ENVIRONMENT=local
DATABASE_URL=sqlite:///./data/local.db
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

When `SUPABASE_URL` is blank the sync service is a no-op (the queue
still accumulates rows, but the worker doesn't drain). Operators
working from browsers won't see live updates in local-mode; they'd
need a direct connection to the director's FastAPI.

### Reachability for browser operators

Browser operators write to the director's FastAPI via the command
queue (Step F's `commandQueue.ts` → `POST /tournaments/{tid}/commands`).
The director's machine must be reachable on the operator's network.
Two common setups:

1. **Same LAN**: operators connect to `http://<director-lan-ip>:8000`.
   No additional config needed beyond setting `CORS_ORIGINS` to
   include the operator devices' origins.
2. **Internet-tunneled** (e.g. ngrok, Cloudflare Tunnel): the
   director runs a tunneling client that exposes the local FastAPI
   at a stable URL. `CORS_ORIGINS` includes the tunnel's URL.

Either way, the *sync path* (sidecar → Supabase) is independent —
that's outbound HTTPS and works through any operator-side network.

### Health check

The sidecar exposes `/health` (shallow — uvicorn is alive) and
`/health/deep` (DB writable + solver loadable). The Step G
`useReachability` hook polls `/health` every 5 seconds; an
intermittent failure flips the operator-facing connection indicator
to amber, sustained failure (>60 s combined with Realtime down) to
red.

---

## Public TV display — Vercel

Unchanged from the cloud-prep arc. The TV display is a read-only
subscriber to the Supabase Realtime `matches` table; no FastAPI
calls.

```bash
# One-time:
npm install -g vercel
vercel login

# From products/scheduler/frontend (NOT the repo root):
cd products/scheduler/frontend

# Set env vars in the Vercel dashboard → Project → Settings → Environment Variables:
#   VITE_API_BASE_URL=http://localhost:8000   (placeholder; TV doesn't issue writes)
#   VITE_SUPABASE_URL=https://<PROJECT_ID>.supabase.co
#   VITE_SUPABASE_ANON_KEY=<YOUR_PUBLISHABLE_KEY>

vercel --prod
```

The TV view is reached via `https://<your-project>.vercel.app/display?id=<tournament_id>`.

---

## Smoke test (post-arc)

Run from two browsers (or one regular + one incognito) to simulate
director + operator on different devices.

1. **Boot the sidecar** on the director's laptop (`npm run tauri dev`
   or the installed binary). Confirm `/health` returns 200 on the
   local port.
2. **Director (Tauri WebView)** signs in, creates a tournament,
   commits a schedule. Verify `matches` rows appear in Supabase via
   the SQL editor (the sync worker pushes within ~5 s of commit).
3. **Operator (browser on LAN)** opens `http://<director-ip>:8000`
   (or the tunneled URL). Signs in with a Supabase account that has
   operator role on the tournament. Sees the schedule via the
   Realtime read path.
4. **Operator clicks "Call to court"** on a scheduled match. The
   pending badge appears immediately; within ~200 ms the badge
   clears and the match shows `called` everywhere.
5. **Force a conflict**: open a third tab as the director, manually
   set the match status to `playing` via the legacy match-state
   route. Have the operator try to call it to court again — the
   inline ConflictBanner shows the rejection reason and the operator
   stays unblocked.
6. **Disconnect the director's network briefly** (~10 s). The
   operator's ConnectionIndicator goes amber. The operator can still
   click — commands queue in IndexedDB. Reconnect the director:
   `useReachability` fires the queue flush, pending commands apply,
   indicator goes back to green.
7. **Public TV display** at `https://<TV>.vercel.app/display?id=<tid>`
   sees every status change live via Realtime.

If any step fails, check:
- The director's `pip install` / `npm install` + the Tauri build
  succeeded (no import errors at sidecar startup).
- `CORS_ORIGINS` in `backend/.env` includes the operator's browser
  origin.
- The Supabase project has the arc's three new tables (matches,
  commands, sync_queue) — re-run the migration prerequisite above.
- The `matches` table is in Supabase's Realtime publication.

---

## Rollback / pause

If a tournament day goes wrong:

1. **Restore the SQLite source of truth from a backup.** The
   director's machine ships with rolling `tournament_backups` — the
   Setup → Backups panel offers a one-click restore. This bypasses
   the outbox; the sync worker re-pushes after the restore.
2. **Pause the Supabase project** entirely (free-tier projects can
   be paused) — Dashboard → Project Settings → Pause. The director's
   local sidecar continues to work; the outbox just accumulates
   rows that drain on resume.
3. **Roll back to the previous git revision** of the sidecar if the
   binary itself misbehaves. The local SQLite schema is forward-
   compatible (Alembic runs on every boot); rolling back the binary
   doesn't lose state.

The local-first design means a tournament can complete cleanly
even if Supabase is unreachable for the entire day. Browser
operators lose live updates; the director keeps running on local
SQLite.

---

## Migration from the cloud-prep deployment

If you have a Fly.io / Render-deployed backend from the cloud-prep
arc and are migrating to the post-arc sidecar model:

1. **Export tournament state** from the cloud-deployed backend via
   the Setup → Backups → Download flow.
2. **Stop the cloud-deployed backend** (Fly.io: `fly apps destroy`;
   Render: delete the service). The Supabase project keeps running.
3. **Apply the three arc-adjustment migrations to Supabase** (see
   the Schema migrations section above).
4. **Configure Realtime publication** on `matches`.
5. **Boot the Tauri sidecar** on the director's laptop with the
   cloud-mode `.env`. The sidecar's Alembic step builds the local
   SQLite schema from scratch at revision `e2a5f3b8c1d6`.
6. **Import the tournament state** via the Setup → Backups → Import
   flow. The local DB is now seeded; the sync worker pushes
   everything to Supabase within a minute.
7. **Update operator client URLs** to point at the director's
   reachable address rather than the old Fly.io / Render URL.

After migration, the cloud-prep deployment topology can be retired.
