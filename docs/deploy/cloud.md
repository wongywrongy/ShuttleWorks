# ShuttleWorks Deployment Guide

> **HISTORICAL — DO NOT FOLLOW. Superseded, and partly describing systems that no
> longer exist.**
>
> Everything below about **Supabase** — the data mirror, the `sync_queue` outbox,
> Realtime, RLS policies, schema/publication setup, and the `SUPABASE_*` env vars —
> refers to a subsystem **removed entirely in SP-CLOUD-3**. See
> [ADR 0012](../decisions/0012-remove-the-supabase-mirror.md). Supabase is absent
> from the product; persistence is single-store and reads are polling.
>
> The current deployment story lives in `docs/how-to/`:
> `install-local.md` (offline single machine), `install-selfhost.md` (the
> Cloudflare-Tunnel self-host runbook), `add-a-worker.md`, and `operations.md`.
> This file is kept only as a record of the pre-SP-CLOUD-3 arc. It is excluded
> from the docs site build (`srcExclude`) and is not linkable from it.

_Last updated: 2026-08-03 (post SP-CLOUD-1/2); superseded 2026-08-04._

This document covers deploying the post-merge system: a single
scheduler stack (FastAPI + React + SQLite) on the director's
laptop with Supabase as the cloud **data mirror** (mirror-only —
Supabase Auth is retired; identity is self-hosted cookie-session
auth, see below), and a Vercel-hosted TV display. The backend-merge
arc (PRs 1–4) folded the prior tournament product into the
scheduler — one stack now serves both meet schedules and bracket
draws. The standalone tournament product is archived at
`archive/tournament-pre-merge/`.

::: warning What SP-CLOUD-1/2 changed in this guide
- **Auth is self-hosted** (`AUTH_MODE=local|cloud`, Argon2id +
  cookie sessions, `/auth/*` endpoints). The old Supabase Auth /
  JWT / OAuth-provider setup is gone; the Supabase env vars feed
  only the outbox mirror.
- **The public TV link is a capability token** —
  `/display?token=…`, served by the backend's unauthenticated
  `/display/{token}/*` projection routes (minted/rotated from
  Settings → Sharing). It polls the director's backend; it does
  not subscribe to Supabase Realtime, and a raw `?id=` UUID is
  not a public key.
- **A true cloud API topology exists**:
  `products/scheduler/docker-compose.cloud.yml` runs the API +
  Postgres 16 + `--scale`-able solve-worker containers. See
  `products/scheduler/backend/README.md` ("Dual-mode runtime",
  "Auth & tenancy") for the authoritative env matrix.

Sections below that describe Supabase schema/publication setup for
the **data mirror** remain valid; anything that used to say "sign
in with a Supabase account" now means a self-hosted account.
:::

The cloud-prep arc shipped a Fly.io / Render-deployable FastAPI;
the architecture-adjustment arc replaced that with the local
sidecar model. Old `fly deploy` / Render web-service instructions
are *deliberately removed* — running the backend on a cloud host
is no longer the deployment story.

---

## Deployment overview

```
Director's laptop                    Supabase (mirror only)
─────────────────────                ──────────────────────
Tauri app                            Postgres   ←── outbox sync
  ├── FastAPI sidecar  ───── push ──→ matches, tournaments,
  │   (uvicorn, local)                bracket_* …
  ├── SQLite (source
  │   of truth)
  └── React WebView

Operator browsers  ── cookie-session auth + commands ──→ Director's FastAPI
                      (any device, LAN or tunnel)

TV browsers        ── GET /display/{token}/* (capability link,
                      unauthenticated, poll-only) ──→ Director's FastAPI
```

There are three deployable surfaces:

1. **The director's laptop** runs the Tauri app (FastAPI sidecar +
   React WebView + SQLite). This is the only place the backend
   runs in the local-first topology.
2. **Supabase project** holds the cloud Postgres **data mirror**
   (populated by the outbox). It no longer provides auth.
3. **Vercel** hosts the public TV display web app (read-only; it
   polls the backend's `/display/{token}/*` projection routes).

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

### Schema migrations on Supabase — what actually needs to land

The local Alembic chain has grown well past the backend-merge arc
(the SP-CLOUD migrations add `solve_jobs`, the auth/tenancy tables,
and `display_tokens` — all **local-only**, never mirrored). Of the
tables the outbox touches, **five need to exist on Supabase**:

| Table | Local SQLite | Supabase | Why |
|---|---|---|---|
| `matches` | ✅ | ✅ — **required** | The outbox pushes match rows; Realtime publication needs the table; operator browsers + TV display read it |
| `commands` | ✅ | ❌ — local-only | Audit log lives on the director's machine; no current sync path |
| `sync_queue` | ✅ | ❌ — local-only | The outbox is by definition a local-only construct |
| `bracket_events` | ✅ | ✅ — **required** | Bracket-tab views read it; included in `supabase_realtime` publication so operator browsers see live edits |
| `bracket_participants` | ✅ | ✅ — **required** | RLS reads by tournament members; rides along in the event-level Realtime payload (not in the publication itself) |
| `bracket_matches` | ✅ | ✅ — **required** | Slot tree + assignments; in the Realtime publication so advancement reflects live |
| `bracket_results` | ✅ | ✅ — **required** | Recorded outcomes; in the Realtime publication so the bracket UI animates on result-record |

Migrations applied to the Supabase project as a chain (each via
the MCP `apply_migration` tool):

1. `step_a_matches_table_and_rls` (architecture-adjustment arc)
   — `matches` table + RLS `_select_member` policy +
   `ALTER PUBLICATION supabase_realtime ADD TABLE public.matches`.
2. `step_t_a_bracket_schema_and_rls` (backend-merge arc PR 1) —
   the four `bracket_*` tables with composite PKs, FK CASCADEs to
   `public.tournaments(id)`, and RLS `_select_member` policies on
   each. No INSERT / UPDATE / DELETE policies on any table — only
   the backend's postgres role writes (via SyncService).
3. `step_t_d_bracket_realtime_publication` (backend-merge arc PR 2)
   — `ALTER PUBLICATION supabase_realtime ADD TABLE` for
   `bracket_events`, `bracket_matches`, `bracket_results`.
   `bracket_participants` is intentionally left out (changes are
   rare and the event-level Realtime payload covers re-renders).

If you're re-applying both arcs to a different Supabase project,
run the migrations in chain order before the director's sidecar
boots — otherwise the SyncService's outbox worker will push into
non-existent tables, fail, increment `attempts`, and eventually
cap at 10.

After applying, confirm via the MCP `list_tables` that all five
synced tables appear under `public`; via `pg_publication_tables`
that `matches`, `bracket_events`, `bracket_matches`, and
`bracket_results` are in `supabase_realtime`; and via
`get_advisors` that no `rls_disabled_in_public` or
`rls_enabled_no_policy` warnings fire on any new table.

### Realtime publication

The sidecar's frontend reads matches via Supabase Realtime; the
`matches` table needs to be included in Supabase's Realtime
publication, and after the backend-merge arc the three bracket
tables join it. The `step_t_d_bracket_realtime_publication`
migration above handles the bracket additions automatically; for
manual cleanup or a fresh project, from the Dashboard:
**Database → Publications → supabase_realtime → Tables** → add
`matches`, `bracket_events`, `bracket_matches`, `bracket_results`.

Optional: also add `tournaments` if you want the public TV display
to react to tournament-level metadata changes (name renames, etc.).
The sync service pushes to that table too.

### Auth — self-hosted (Supabase Auth retired)

There is nothing to configure in the Supabase Dashboard for auth.
Identity is self-hosted (SP-CLOUD-2): Argon2id passwords, opaque
cookie sessions in the local `auth_sessions` table, `/auth/*`
endpoints, and a custom-header CSRF check. Two modes
(`AUTH_MODE`, default `local`):

- **`local`** — zero-friction: a request without a session
  resolves to the bootstrap operator (`local@dev`); accounts are
  optional. Right for the single-laptop tournament.
- **`cloud`** — real accounts only; no session → 401. Startup
  refuses without `SESSION_COOKIE_SECURE=true` and an SMTP email
  backend (see the validator notes below).

Invites and password resets ride the email seam
(`EMAIL_BACKEND=console|smtp`): console logs the mail locally,
SMTP delivers it in cloud. See
`products/scheduler/backend/README.md` → "Auth & tenancy".

---

## Director's laptop — running the sidecar

The architecture-adjustment arc's target packaging is Tauri (a
native binary that bundles the FastAPI sidecar + the React WebView
+ a managed SQLite). **Tauri is not yet scaffolded in the repo.**
For now, run the equivalent stack via Docker Compose or via the
existing dev-server flow; both produce the same runtime behaviour
(local FastAPI on a port + nginx-served frontend pointing at it +
the background `SyncService` worker draining `sync_queue` to
Supabase every 5 seconds).

### Option A — Docker Compose (production-shape, recommended today)

`make scheduler` from the repo root starts the Compose stack. By
default it boots in **local-only mode** — SQLite source of truth,
no Supabase replication, no Realtime broadcast, the synthetic
local-dev user. This is the right mode for a single-laptop
tournament where the director is also the operator.

To enable the data mirror (the outbox worker pushes writes to the
Supabase Postgres), drop a `backend/.env` file in
`products/scheduler/backend/` — the mirror is keyed on
`SUPABASE_URL` being set, independent of `ENVIRONMENT`:

```bash
cd products/scheduler
cat > backend/.env <<EOF
SUPABASE_URL=https://<your-supabase-project>.supabase.co
SUPABASE_ANON_KEY=<your-publishable-key>
CORS_ORIGINS=https://<your-tv-display>.vercel.app,http://192.168.1.100
EOF

make scheduler          # → http://localhost (frontend), backend on :8000
```

The Compose backend service has `env_file: - path: backend/.env`
with `required: false`, so the stack boots cleanly with or without
the file. Values in `.env` override the inline `environment:`
defaults; the backend's `Settings` model picks them up at boot.
Do **not** set `ENVIRONMENT=cloud` for a mirror-only laptop
deployment: since SP-CLOUD-2 the `_enforce_cloud_secrets`
validator makes `ENVIRONMENT=cloud` refuse to start unless a
Postgres `DATABASE_URL`, `AUTH_MODE=cloud`,
`SESSION_COOKIE_SECURE=true`, and an SMTP email backend are all
configured — it is meant for a real hosted deployment
(`docker-compose.cloud.yml`), not the sidecar.

The Compose project namespaces ports + container names; runs
cleanly side-by-side with the tournament product.

### How to tell which mode you're in

After `make scheduler`, check the backend logs:

```bash
make logs-scheduler
# Look for one of these on startup:
#   sync_service started               → cloud mode
#   sync_service skipped (SUPABASE_URL blank — local-dev mode)  → local mode
```

Or hit `/health/deep` and inspect the response — it doesn't echo
the secrets but the `schemaVersion` is the same in both modes.

### Option B — Dev servers (Tauri WebView equivalent for development)

```bash
# Backend.
cd products/scheduler/backend
pip install -r requirements.txt
python -m app.main          # FastAPI on :8000

# Frontend (separate terminal).
cd products/scheduler/frontend
npm install
npm run dev                 # Vite on :5173 with HMR
```

Use this for iterative development. The Compose stack is what the
director would actually boot on tournament day.

### Option C — Tauri (future work, not yet scaffolded)

A native binary bundling the sidecar + WebView is the intended
end-state. Requires:
- Rust toolchain on the build machine.
- `@tauri-apps/cli` + `src-tauri/` scaffold.
- Sidecar binary configuration (`tauri.conf.json` `tauri.bundle.externalBin`)
  pointing at a packaged Python+uvicorn executable (PyInstaller or
  similar).
- Build commands wired into `products/scheduler/frontend/package.json`
  (`tauri`, `tauri dev`, `tauri build`).

This is a known follow-up — `npm run tauri build` will fail with
"missing script" until that work lands.

### Environment configuration

The sidecar reads its config from `backend/.env`. Mirror-on config
(replication to Supabase; note `ENVIRONMENT` stays `local` — see
the validator note above):

```
ENVIRONMENT=local
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

Auth knobs (both optional locally): `AUTH_MODE=local|cloud`,
`SESSION_COOKIE_SECURE`, `EMAIL_BACKEND=console|smtp` (+ `SMTP_*`),
`PUBLIC_APP_ORIGIN` (used in invite/reset links). Solve-job knobs
(`EMBEDDED_WORKER`, `SOLVE_*`, `JOB_*`) are tabulated in
`products/scheduler/backend/README.md`.

### Hosted cloud topology — `docker-compose.cloud.yml`

Separate from the laptop sidecar, SP-CLOUD-1 added a hosted
topology: `products/scheduler/docker-compose.cloud.yml` runs the
API against **Postgres 16** with the embedded worker off and
solve-worker containers (`python -m worker`) you can
`--scale worker=N`. Only the API container migrates the schema;
workers wait for it. A real internet-facing deployment of that
stack is what `ENVIRONMENT=cloud` (and its validator) is for.

```bash
cd products/scheduler
docker compose -f docker-compose.cloud.yml up -d --build
docker compose -f docker-compose.cloud.yml up -d --scale worker=2
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

The TV display is a read-only **poller of the backend's public
projection routes** (`GET /display/{token}/{summary,state,match-states,bracket}`)
— it no longer subscribes to Supabase Realtime (`supabase-js` was
uninstalled with SP-CLOUD-2), so the director's backend must be
reachable from the TV's network (LAN or tunnel).

```bash
# One-time:
npm install -g vercel
vercel login

# From products/scheduler/frontend (NOT the repo root):
cd products/scheduler/frontend

# Set env vars in the Vercel dashboard → Project → Settings → Environment Variables:
#   VITE_API_BASE_URL=https://<the-director-backend's-reachable-URL>

vercel --prod
```

The TV view is reached via the **capability link**
`https://<your-project>.vercel.app/display?token=<display-token>` —
mint / copy / rotate the token from Settings → Sharing (backed by
`GET /tournaments/{id}/display-token` and `POST …/rotate`).
Rotating kills the old link instantly. The raw
`/display?id=<tournament_id>` form works only against the
viewer-gated endpoints (in-shell preview / local mode) — it is
deliberately not a public key.

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
   (or the tunneled URL). Signs in with a self-hosted account
   (`POST /auth/login`; registered via the login page) that has
   operator role on the tournament — accept an invite link/email
   from Settings → Sharing to get the membership row. Sees the
   schedule via the normal API reads.
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
7. **Public TV display** at `https://<TV>.vercel.app/display?token=<display-token>`
   sees every status change within one poll interval (~5 s for
   match states) via the `/display/{token}/*` projection routes.

If any step fails, check:
- The director's `pip install` / `npm install` + the Tauri build
  succeeded (no import errors at sidecar startup).
- `CORS_ORIGINS` in `backend/.env` includes the operator's browser
  origin.
- The Supabase project has the five synced tables that need to land
  there: `matches` (architecture-adjustment arc), and `bracket_events`
  / `bracket_participants` / `bracket_matches` / `bracket_results`
  (backend-merge arc). `commands` and `sync_queue` are local-only by
  design — don't look for them on Supabase. Re-run the migrations in
  the Schema migrations section above if any are missing.
- `matches`, `bracket_events`, `bracket_matches`, and `bracket_results`
  are in Supabase's Realtime publication (`bracket_participants` is
  intentionally excluded — see the Realtime section above).

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
3. **Apply the matches schema to Supabase** (see the Schema
   migrations section above — already done on the `shuttleworks`
   project on 2026-05-13).
4. **Configure Realtime publication** on `matches` (also done).
5. **Boot the sidecar** on the director's laptop via Docker
   Compose (`make scheduler` from the repo root) with the
   mirror-on `.env`. The sidecar's Alembic step builds the local
   SQLite schema from scratch to the current head (the chain runs
   all prior migrations in order so a fresh install gets all
   tables).
6. **Import the tournament state** via the Setup → Backups → Import
   flow. The local DB is now seeded; the sync worker pushes
   everything to Supabase within a minute.
7. **Update operator client URLs** to point at the director's
   reachable address (LAN IP or tunnel URL) rather than the old
   Fly.io / Render URL.

After migration, the cloud-prep deployment topology can be retired.

## Known follow-ups for the deployment story

- **Tauri scaffolding** — `src-tauri/` + `@tauri-apps/cli` + sidecar
  bundling. The Docker Compose stack works today; Tauri is a
  packaging upgrade.
- **Sidecar reachability for browser operators** — production needs
  either LAN-only operation (operators on the same Wi-Fi as the
  director's laptop) or a tunnel (ngrok, Cloudflare Tunnel). The
  arc's architecture works under both but the choice is the
  director's; no automation in the repo for either.
- **Backup of the director's SQLite to durable storage** — the
  outbox replicates writes to Supabase but the canonical SQLite
  itself can die with the laptop. A cron-style copy of
  `data/local.db` to a USB drive or cloud bucket is a sensible
  follow-up.
