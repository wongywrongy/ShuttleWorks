# ShuttleWorks Cloud Deployment Guide (Step 8)

This document picks up after the 8-step cloud-prep migration. The
Supabase project + schema are already provisioned via MCP; this guide
covers the remaining hand-off work — deploying the FastAPI backend and
the React frontend, then smoke-testing the cross-account invite flow.

The MCP can't authenticate against Fly.io / Render / Vercel / Netlify
for you. The commands below are what you run from your terminal.

---

## Supabase project

A Supabase project was provisioned for ShuttleWorks in Step 8. The
project-specific values below are templated — substitute your own
project ID / region / publishable key from the Supabase Dashboard
(or your `.env` file). **Never commit the real values to this repo**
— see the secret-hygiene audit entry in `docs/changes/` for the
guardrails enforcing that.

| Field | Value |
|---|---|
| Project ID | `<PROJECT_ID>` |
| Project ref | `<PROJECT_ID>` |
| Region | `<REGION>` (e.g. `us-west-1`; the MCP enum doesn't accept `us-west-2`) |
| Supabase URL | `https://<PROJECT_ID>.supabase.co` |
| Publishable key | `<YOUR_PUBLISHABLE_KEY>` (Dashboard → Project Settings → API Keys → publishable) |
| Legacy anon key (JWT) | available via Dashboard → Project Settings → API Keys |
| Postgres host | `db.<PROJECT_ID>.supabase.co` |

Schema applied via the Supabase MCP `apply_migration` tool:

1. `step1_initial_persistence` — tournaments / match_states / tournament_backups + `alembic_version` table stamped at `c6361600d776`.
2. `step5_membership_invites` — tournament_members + invite_links; bump to `7a473c9e7048`.
3. `step6_owner_email` — adds `tournaments.owner_email`; bump to `c2e587494c07`.
4. `step8_rls_and_policies` — RLS on every public table + per-user policies (defense in depth; the backend bypasses RLS via the postgres role).

When the deployed FastAPI app boots, its lifespan calls `_run_migrations()` which runs `alembic upgrade head`. Alembic sees `version_num='c2e587494c07'` and no-ops — the schema is already there.

### Database password

The MCP doesn't expose your Postgres password. To build `DATABASE_URL`:

1. Open https://supabase.com/dashboard/project/<PROJECT_ID>/settings/database
2. Reset the database password (the dashboard has a "Reset password" affordance). Copy the new password.
3. Use the **Connection pooler** (Supavisor) URL, transaction mode (port 6543) — recommended for Fly.io / Render-style deploys:

   ```
   postgresql://postgres.<PROJECT_ID>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres
   ```

4. Or the direct connection (port 5432) if your host pins long-lived connections:

   ```
   postgresql://postgres:<PASSWORD>@db.<PROJECT_ID>.supabase.co:5432/postgres
   ```

   Append `?sslmode=require` if your host doesn't default to TLS.

---

## Backend deployment — Fly.io

```bash
# One-time: install flyctl and authenticate.
curl -L https://fly.io/install.sh | sh
fly auth login

# From the repo root.
fly launch --copy-config --name shuttleworks-api \
  --dockerfile products/scheduler/backend/Dockerfile \
  --no-deploy

# Set env vars (substitute the Postgres password you reset above).
fly secrets set \
  DATABASE_URL='postgresql://postgres.<PROJECT_ID>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres' \
  SUPABASE_URL='https://<PROJECT_ID>.supabase.co' \
  SUPABASE_ANON_KEY='<YOUR_PUBLISHABLE_KEY>' \
  CORS_ORIGINS='https://<YOUR-FRONTEND-DOMAIN>.vercel.app' \
  ENVIRONMENT='cloud' \
  LOG_LEVEL='info' \
  DATA_DIR='/app/data'

fly deploy
```

Note: `fly launch` writes a `fly.toml`. Make sure `[[services]]`
exposes port 8000 over HTTPS, and the health-check path is
`/health/deep`.

---

## Backend deployment — Render (alternative)

```bash
# Render uses git + a config file. From the repo root:
#  1. New Web Service → connect this repo.
#  2. Runtime = Docker; Dockerfile path = products/scheduler/backend/Dockerfile.
#  3. Set the env vars listed above (same names, same values).
#  4. Health-check path: /health/deep
#  5. Free or starter tier is sufficient for v1.
```

The blue-green deploy semantics on Render run `alembic upgrade head` on
each new instance start via the lifespan, so no manual migrate step is
needed.

---

## Frontend deployment — Vercel

```bash
# One-time:
npm install -g vercel
vercel login

# From products/scheduler/frontend (NOT the repo root):
cd products/scheduler/frontend

# Set env vars (paste these in the Vercel dashboard → Project → Settings → Environment Variables):
#   VITE_API_BASE_URL=https://shuttleworks-api.fly.dev   (or your Render URL)
#   VITE_SUPABASE_URL=https://<PROJECT_ID>.supabase.co
#   VITE_SUPABASE_ANON_KEY=<YOUR_PUBLISHABLE_KEY>

vercel --prod
```

After the first deploy, Vercel surfaces the production URL (typically
`https://<project>.vercel.app`). Copy that domain into the backend's
`CORS_ORIGINS` env var and redeploy the backend so CORS allows the
real origin.

---

## Frontend deployment — Netlify (alternative)

```bash
# One-time:
npm install -g netlify-cli
netlify login

# From products/scheduler/frontend:
netlify init  # connects this folder to a new Netlify site
netlify env:set VITE_API_BASE_URL https://shuttleworks-api.fly.dev
netlify env:set VITE_SUPABASE_URL https://<PROJECT_ID>.supabase.co
netlify env:set VITE_SUPABASE_ANON_KEY <YOUR_PUBLISHABLE_KEY>
netlify deploy --prod
```

Same CORS callout: once the production domain is known, update the
backend's `CORS_ORIGINS` and redeploy the backend.

---

## Supabase Auth setup

Before users can log in, enable the providers:

1. Open https://supabase.com/dashboard/project/<PROJECT_ID>/auth/providers
2. **Email** — leave enabled (default). Optionally enable confirmation emails.
3. **Google** — flip on, paste OAuth client id / secret per Supabase's guide. The Google Cloud console "Authorized redirect URI" should be:

   ```
   https://<PROJECT_ID>.supabase.co/auth/v1/callback
   ```

4. Set the **Site URL** under Auth → URL configuration to your deployed frontend domain (`https://<project>.vercel.app`). This is the default redirect after email confirmation / OAuth.
5. Add the same frontend domain to **Additional Redirect URLs** so OAuth's `redirectTo` works for nested routes (e.g. `/invite/<token>`).

---

## Smoke test (the spec's acceptance criterion)

Run from two browsers (or one regular + one incognito) to simulate two
accounts.

1. **Account A** signs up at `https://<frontend>/login`. Confirms email if required.
2. Account A creates a tournament from the dashboard. Configures roster / matches / schedule.
3. Account A opens **Settings → Share**, picks role `operator`, clicks **Generate**, copies the URL.
4. **Account B** opens the URL from incognito → bounces to login → signs up.
5. After login Account B lands back on `/invite/:token`, sees the tournament name + operator role, clicks **Accept invitation**.
6. Account B should land on `/tournaments/{id}/setup` with operator-level access (can edit roster + matches; cannot delete the tournament).
7. Open Account A's dashboard: the tournament still appears under **Your Tournaments**.
8. Open Account B's dashboard: the same tournament appears under **Shared with You**, with role `operator` and Account A's email as the owner name.
9. Account A revokes the invite from Settings → Share → Revoke. Account B's existing membership remains (revocation invalidates the link, not the membership it already granted).

If any step fails, check:
- Browser devtools network tab for the failing request — is it a 401 (auth header missing)? 403 (role check)? 500 (backend error)?
- Fly.io / Render logs: `fly logs` or the Render dashboard's Logs tab.
- Supabase logs: Dashboard → Logs → Postgres / Auth tabs.

---

## Rollback / pause

If the production data goes wrong:

1. Supabase Dashboard → Database → Backups → restore from the latest PITR snapshot.
2. To pause the project entirely (free-tier projects can be paused): Dashboard → Project Settings → Pause.

The local dev stack continues to work unchanged regardless of cloud state — `DATABASE_URL=sqlite:///./local.db` is still the default and `SUPABASE_URL=""` flips into local-dev auth bypass.
