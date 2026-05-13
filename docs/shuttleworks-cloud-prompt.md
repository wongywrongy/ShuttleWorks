# ShuttleWorks — Cloud Prep Implementation Prompt

Read all files in `docs/` before writing any code. The updated tech stack is in
`docs/tech-stack.md`. The implementation order is defined there — follow it exactly.

---

## Rules (apply to every session)

- After every meaningful decision or change, append a dated entry to
  `docs/changes/YYYY-MM-DD.md` describing what changed and why.
- If anything in the spec is unclear or contradicted, log it in
  `docs/changes/questions.md` and ask before proceeding.
- Do not relitigate decisions already marked in the tech stack doc.
- Each step must have passing tests before you move to the next.
- Do not start a step until I explicitly say so.

---

## Step 1 — Persistence layer

Replace all localStorage / JSON file reads and writes with SQLAlchemy + SQLite.

1. Install: `sqlalchemy`, `alembic`, `pydantic-settings` (add to `pyproject.toml`
   or `requirements.txt`).
2. Create `backend/app/config.py` with the `Settings` class exactly as specified
   in `docs/tech-stack.md`. Use `DATABASE_URL = "sqlite:///./local.db"` as default.
3. Create `backend/database/models.py` with all existing entities (Tournament,
   Match, Court, Player, School — whatever currently exists) as SQLAlchemy ORM
   models. Add `owner_id UUID nullable` to Tournament now (will be populated in
   Step 4; nullable so existing data isn't broken).
4. Run `alembic init alembic`, write the initial migration from those models,
   run `alembic upgrade head`, confirm it succeeds against a test SQLite file.
5. Create `backend/repositories/base.py` with Repository Protocol definitions
   for each entity.
6. Create `backend/repositories/local.py` with `LocalRepository` implementing
   all protocols against SQLAlchemy + SQLite sync sessions.
7. Wire `LocalRepository` into existing FastAPI routes — remove all direct
   localStorage / JSON file access from route handlers.
8. Write `backend/tests/unit/test_repositories.py`: create, get, list, update,
   delete for each entity against in-memory SQLite (`":memory:"`).
9. Run tests — all must pass.

Do not touch the frontend in this step. Do not start Step 2 until I say so.

---

## Step 2 — Multi-tournament API + frontend migration

Replace frontend localStorage calls with API calls. Add tournament list endpoint.

1. Add `GET /tournaments` — returns all tournaments (no auth yet; returns all rows).
2. Add `POST /tournaments` — creates a tournament, returns it.
3. Add `GET /tournaments/:id` — returns one tournament.
4. Add `PATCH /tournaments/:id` and `DELETE /tournaments/:id`.
5. Ensure all existing routes (`/schedule`, `/matches`, etc.) are scoped under
   `/tournaments/:id/` and read from the DB via repository, not localStorage.
6. In the frontend: replace every `localStorage.getItem` / `localStorage.setItem`
   call with `fetch` calls to the new endpoints. Zustand store `persist` middleware
   can be removed or scoped only to UI state (selected tab, panel widths, etc.) —
   not tournament data.
7. Add a minimal `TournamentListPage.tsx` at route `/` that lists tournaments and
   has a "New Tournament" button.
8. Add `TournamentPage.tsx` as the parent layout for `/tournaments/:id/*` — wraps
   existing pages.
9. All existing pages must still work. Run e2e tests to confirm.

Do not start Step 3 until I say so.

---

## Step 3 — Environment config

Ensure the app runs identically in local and cloud environments via env vars.

1. All hardcoded URLs, DB paths, ports, and keys must be read from `Settings`
   (Pydantic `BaseSettings`), not hardcoded.
2. Create `.env.example` with every variable the app needs (blank values for
   secrets, defaults for non-secrets).
3. Create `.env` (gitignored) for local dev.
4. Confirm: `DATABASE_URL=sqlite:///./local.db` works. `DATABASE_URL=postgresql://...`
   (a local Postgres via Docker Compose) also works without code changes.
5. Add a `docker-compose.dev.yml` that spins up a local Postgres for testing the
   cloud path — for dev use only, never shipped to users.

Do not start Step 4 until I say so.

---

## Step 4 — Supabase Auth

Add authentication. Users must log in before accessing any tournament data.

### Backend
1. Install `supabase` Python client.
2. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `Settings`.
3. Create `backend/app/dependencies.py` with `get_current_user` dependency exactly
   as specified in `docs/tech-stack.md`. It verifies the Supabase JWT and returns
   the user object.
4. Add `get_current_user` as a dependency to every protected route. Public routes:
   `GET /health`, `GET /invites/:token` only.
5. Write tests for the dependency (mock the Supabase client).

### Frontend
1. Install `@supabase/supabase-js`.
2. Create `src/lib/supabase.ts` that initialises the client with env vars
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Create `src/pages/LoginPage.tsx` — email/password form + Google SSO button.
   Use Supabase JS client directly; do not build custom auth state management.
4. Create an `AuthProvider` context that exposes `session` and `user`.
5. Wrap all routes except `/login` and `/invite/:token` with an auth guard that
   redirects to `/login` if no session.
6. Attach the Supabase JWT to every API `fetch` call via an `Authorization: Bearer`
   header.

Supabase project setup (do once manually, not in code):
- Create project at supabase.com
- Enable Email and Google providers
- Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY` into `.env`

Do not start Step 5 until I say so.

---

## Step 5 — Ownership and membership

Enforce that users only see tournaments they own or are members of.

1. Run Alembic migration to add `tournament_members` and `invite_links` tables
   as specified in `docs/tech-stack.md`.
2. Update `POST /tournaments` to set `owner_id` from the current user's id and
   create a `tournament_members` row with `role = 'owner'`.
3. Add a `require_tournament_access(min_role)` dependency that checks the
   `tournament_members` table. Use it on every `/tournaments/:id/*` route:
   - GET routes: `min_role = 'viewer'`
   - POST/PATCH write routes: `min_role = 'operator'`
   - DELETE and Settings routes: `min_role = 'owner'`
4. Update `GET /tournaments` to return only tournaments where the current user
   has a membership row.
5. Write tests covering: owner can read/write, operator can read/write, viewer
   can read but not write, non-member gets 403.

Do not start Step 6 until I say so.

---

## Step 6 — Dashboard

Build the tournament list dashboard as the app's home screen.

1. `GET /tournaments` response should include `role` for the current user and
   `owner_name` (join to users).
2. Update `TournamentListPage.tsx` to show two sections: "Your Tournaments"
   (owned) and "Shared with You" (member, not owner). Columns per the tech stack
   doc. "New Tournament" button top-right.
3. Status badge: draft (grey) / active (green) / archived (muted). Derive from
   a `status` field on Tournament — add if not present.
4. Clicking a row navigates to `/tournaments/:id`.
5. "New Tournament" opens a minimal creation dialog: name, date. On submit,
   calls `POST /tournaments` and navigates to the new tournament.
6. Keep it functional and clean — no charts, activity feeds, or onboarding in v1.

Do not start Step 7 until I say so.

---

## Step 7 — Invite links

Allow directors to share tournaments with other users via a link.

### Backend
1. `POST /tournaments/:id/invites` — requires `owner` role. Body: `{ role: 'operator' | 'viewer' }`.
   Creates an `invite_links` row, returns `{ token, url }`.
2. `GET /invites/:token` — public (no auth required for the lookup itself). Returns
   `{ tournament_name, role, valid: bool }`. Invalid if `revoked_at` is set or
   `expires_at` is past.
3. `POST /invites/:token/accept` — requires auth (user must be logged in). Creates
   a `tournament_members` row for the current user with the link's role. Idempotent —
   if the user is already a member, return 200 without error.
4. `DELETE /invites/:token` — requires `owner` role. Sets `revoked_at`.

### Frontend
1. In `Settings` for a tournament (accessible only to owners): add a "Share" section.
2. Show current members list (name, role, joined date).
3. "Generate link" picker: select role → button → shows generated URL → copy button.
4. List of active invite links with a Revoke button per link.
5. `/invite/:token` landing page: shows tournament name and role, "Accept invitation"
   button (prompts login first if not authenticated), then calls `POST /invites/:token/accept`
   and redirects to the tournament.

Do not start Step 8 until I say so.

---

## Step 8 — Cloud deployment

Switch from SQLite to Supabase Postgres and deploy the backend.

1. In Supabase dashboard: create the database. Run `alembic upgrade head` against
   the Supabase Postgres connection string. Confirm all tables created correctly.
2. Set `DATABASE_URL` to the Supabase Postgres URL in the deployment environment.
3. Deploy FastAPI to Fly.io or Render:
   - Write `Dockerfile` for the FastAPI app (Python 3.11, install deps, run
     `alembic upgrade head && uvicorn ...`).
   - Set all required env vars (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
     `CORS_ORIGINS`) in the deployment dashboard.
4. Update frontend `VITE_API_BASE_URL` to point to the deployed backend.
5. Deploy frontend to Vercel or Netlify (static build).
6. Smoke test: create account, create tournament, generate invite link, accept it
   from a second account, confirm access.