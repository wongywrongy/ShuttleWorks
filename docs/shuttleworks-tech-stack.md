# ShuttleWorks — Tech Stack (Updated)
_Last updated: 2026-05-13_

---

## Decision log (what changed and why)

| Decision | Previous | Now | Reason |
|---|---|---|---|
| Persistence | localStorage | SQLAlchemy + SQLite → Postgres | Cloud prep, multi-tournament |
| SQLAlchemy mode | Async (spec typo) | **Sync** | SQLite serialises writes; simpler tests/Alembic |
| Auth | Deferred | **Supabase Auth** | Cloud requires identity; Supabase bundles auth + Postgres |
| Cloud DB | TBD | **Supabase Postgres** | One vendor for auth + DB; reduces config surface |
| Sharing | Not designed | **Invite links** by role | Simplest multi-user model; no email infra needed |
| Dashboard | Not designed | **Tournament list page** | Required entry point for cloud multi-tournament |
| Roles | None | Owner / Operator / Viewer | Minimal RBAC; covers all real use cases |

---

## Full stack

### Backend

| Layer | Choice | Notes |
|---|---|---|
| Framework | FastAPI (sync) | Existing; sync `def` routes via threadpool |
| Solver | Google OR-Tools CP-SAT | Existing; do not touch |
| ORM | SQLAlchemy 2.0 (sync) | `declarative_base`, regular `Session` |
| Migrations | Alembic | `alembic upgrade head` on startup |
| DB (local dev) | SQLite | Zero infra; file at `./local.db` |
| DB (cloud) | Supabase Postgres | Connection string via `DATABASE_URL` env var |
| Auth (cloud) | Supabase Auth | JWT verification in FastAPI dependency |
| Config | Pydantic `BaseSettings` | Reads env vars; local defaults |
| Testing | pytest (sync) | No pytest-asyncio needed |

### Frontend

| Layer | Choice | Notes |
|---|---|---|
| Framework | React + Vite + TypeScript | Existing |
| State | Zustand + persist | Existing; migrate persist target from localStorage to API calls |
| Auth client | `@supabase/supabase-js` | Handles login, session, token refresh |
| Routing | React Router v6 | Add auth-guarded routes |
| Testing | Vitest + Playwright | Existing |

### Infrastructure

| Layer | Choice | Notes |
|---|---|---|
| Cloud host | Supabase | Auth + Postgres bundled |
| Backend deploy | Fly.io or Render | FastAPI + Alembic; single `Dockerfile` |
| Desktop packaging | Tauri | Existing plan; unchanged |

---

## Architecture

```
Browser / Tauri WebView
    │
    ├── Public routes (no auth)
    │     └── /login, /signup, /invite/:token
    │
    └── Protected routes (requires JWT)
          ├── /                   ← Dashboard (tournament list)
          ├── /tournaments/new
          └── /tournaments/:id/*  ← Existing app pages
                ├── Setup
                ├── Roster
                ├── Schedule
                ├── Live Ops (Gantt + workflow queue)
                └── Settings → Share (invite link generator)

FastAPI backend
    ├── POST /auth/verify          ← validate Supabase JWT, return user
    ├── GET  /tournaments          ← tournaments owned by or shared with user
    ├── POST /tournaments          ← create (sets owner)
    ├── GET  /tournaments/:id      ← requires membership check
    ├── ...existing endpoints...
    └── POST /tournaments/:id/invites   ← generate invite link by role
        GET  /invites/:token            ← resolve token → join tournament

Repository layer (protocol)
    ├── LocalRepository (SQLite)   ← used today and in local desktop app
    └── CloudRepository (Postgres) ← same interface, different connection string
```

---

## Data model additions for cloud

### `users` (managed by Supabase Auth — do not create manually)
```
id          UUID PK   (Supabase user id)
email       TEXT
```

### `tournament_members`
```
tournament_id   UUID FK → tournaments
user_id         UUID FK → users (Supabase id)
role            ENUM('owner', 'operator', 'viewer')
joined_at       DATETIME
PRIMARY KEY (tournament_id, user_id)
```

### `invite_links`
```
id              UUID PK
tournament_id   UUID FK → tournaments
role            ENUM('operator', 'viewer')
created_by      UUID FK → users
created_at      DATETIME
expires_at      DATETIME (nullable — null = no expiry)
revoked_at      DATETIME (nullable)
```

### `tournaments` (additions)
```
owner_id        UUID FK → users   ← NEW
```

---

## Auth flow

```
User opens app
    │
    ├── No session → /login (Supabase email/password or Google SSO)
    │       └── On success → redirect to /  (dashboard)
    │
    └── Valid session → / (dashboard)
            └── Supabase JS client attaches JWT to every API request
                    └── FastAPI dependency verifies JWT on every protected route
```

### FastAPI auth dependency
```python
# backend/app/dependencies.py
from supabase import create_client
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer

bearer = HTTPBearer()

def get_current_user(token = Depends(bearer)) -> dict:
    try:
        user = supabase.auth.get_user(token.credentials)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
```

---

## Sharing model

1. Director opens **Settings → Share** inside a tournament.
2. Picks a role: Operator or Viewer.
3. Clicks **Generate link** → backend creates `invite_links` row, returns URL.
4. Director copies and sends the link (Slack, email, text — their choice).
5. Recipient opens link → prompted to log in / sign up if needed → joined to tournament with that role.
6. Director can **Revoke** any link at any time (sets `revoked_at`).

No email sending required from the app. No invitation queue to manage.

---

## Dashboard (new top-level page)

Route: `/`

Two sections:

**Your Tournaments** (owned by current user)
- Columns: name, status (draft/active/archived), date, action button → Open
- "New Tournament" button top-right

**Shared with You** (member but not owner)
- Columns: name, your role, owner name, date
- Same Open button

No metrics, no activity feed, no onboarding wizard in v1.

---

## Configuration (`backend/app/config.py`)

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite:///./local.db"
    supabase_url: str = ""
    supabase_anon_key: str = ""
    environment: str = "local"   # local | cloud
    cors_origins: list[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"

settings = Settings()
```

Local dev: `.env` file with SQLite path. Cloud: environment variables set on Fly.io/Render with Supabase Postgres URL and keys. No code changes between environments.

---

## Implementation order

| Step | What | Prerequisite |
|---|---|---|
| 1 | SQLAlchemy models + Alembic + LocalRepository + tests | Nothing |
| 2 | Replace localStorage with API calls (multi-tournament) | Step 1 |
| 3 | Pydantic Settings + environment config | Step 1 |
| 4 | Supabase Auth: frontend login/signup, backend JWT dependency | Step 3 |
| 5 | `tournament_members` table + ownership check on all routes | Step 4 |
| 6 | Dashboard page (tournament list, create, open) | Step 5 |
| 7 | Invite links: generate, resolve, revoke | Step 6 |
| 8 | Switch DB to Supabase Postgres; deploy to Fly.io/Render | Step 7 |

Steps 1–3 are local-only. Auth lands in step 4. The app is fully usable locally through step 3 without any cloud account.