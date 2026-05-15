# Pre-Merge Audit Findings — 2026-05-15

Tracking document for all findings surfaced by four parallel audits run before
the dev2 → main merge. Findings fixed inline in this session are listed under
[What WAS Fixed](#what-was-fixed). Everything else is deferred and tracked here.

**Audits covered**

| # | Audit | Lead area |
|---|-------|-----------|
| A | Name-save bug investigation | Frontend race conditions |
| B | Data-integrity audit | Repository + model boundaries |
| C | Security audit | Auth bypass, input validation, info-disclosure |
| D | Audit-trail audit | Missing write history, command log gaps |

---

## Table of Contents

- [Critical Findings (CRIT-1 – CRIT-7)](#critical-findings)
  - [CRIT-1 — Auth-bypass default survives typos](#crit-1--auth-bypass-default-survives-typos)
  - [CRIT-2 — Tournament hard-delete leaves no tombstone](#crit-2--tournament-hard-delete-leaves-no-tombstone)
  - [CRIT-3 — bulk_project_from_schedule silently CASCADE-wipes command log](#crit-3--bulk_project_from_schedule-silently-cascade-wipes-command-log)
  - [CRIT-4 — match_state writes bypass the command log entirely](#crit-4--match_state-writes-bypass-the-command-log-entirely)
  - [CRIT-5 — generate_event_route is not atomic](#crit-5--generate_event_route-is-not-atomic)
  - [CRIT-6 — record_match_result is not atomic](#crit-6--record_match_result-is-not-atomic)
  - [CRIT-7 — commit_tournament_state spans three separate transactions](#crit-7--commit_tournament_state-spans-three-separate-transactions)
- [Important Findings (IMP-1 – IMP-20)](#important-findings)
  - [IMP-1 — Tournament has no optimistic-concurrency version column](#imp-1--tournament-has-no-optimistic-concurrency-version-column)
  - [IMP-2 — No body-size cap on JSON endpoints](#imp-2--no-body-size-cap-on-json-endpoints)
  - [IMP-3 — Solver routes carry no rate limiting](#imp-3--solver-routes-carry-no-rate-limiting)
  - [IMP-4 — Bracket solver accessible to any operator regardless of tournament ownership](#imp-4--bracket-solver-accessible-to-any-operator-regardless-of-tournament-ownership)
  - [IMP-5 — BracketMatch.version not enforced on all update paths](#imp-5--bracketmatchversion-not-enforced-on-all-update-paths)
  - [IMP-6 — match_states rows not FK-constrained to matches](#imp-6--match_states-rows-not-fk-constrained-to-matches)
  - [IMP-7 — _clear_bracket commits once per event](#imp-7--_clear_bracket-commits-once-per-event)
  - [IMP-8 — SQLite FK enforcement disabled (no PRAGMA foreign_keys)](#imp-8--sqlite-fk-enforcement-disabled-no-pragma-foreign_keys)
  - [IMP-9 — Frontend bracket API polling has no concurrency token](#imp-9--frontend-bracket-api-polling-has-no-concurrency-token)
  - [IMP-10 — Token-verification failure log may include token fragment](#imp-10--token-verification-failure-log-may-include-token-fragment)
  - [IMP-11 — 403 authorization rejection not logged](#imp-11--403-authorization-rejection-not-logged)
  - [IMP-12 — Free-text fields lack length caps on several DTOs](#imp-12--free-text-fields-lack-length-caps-on-several-dtos)
  - [IMP-13 — /health/deep is unauthenticated and leaks system info](#imp-13--healthdeep-is-unauthenticated-and-leaks-system-info)
  - [IMP-14 — Schedule history entries lack committedBy](#imp-14--schedule-history-entries-lack-committedby)
  - [IMP-15 — BracketResult has no recorded_by column](#imp-15--bracketresult-has-no-recorded_by-column)
  - [IMP-16 — InviteLink has no revoked_by column](#imp-16--invitelink-has-no-revoked_by-column)
  - [IMP-17 — TournamentMember role changes are not audited](#imp-17--tournamentmember-role-changes-are-not-audited)
  - [IMP-18 — PATCH /tournaments/{id} writes no audit entry](#imp-18--patch-tournamentsid-writes-no-audit-entry)
  - [IMP-19 — create_tournament does not stage a sync_queue row](#imp-19--create_tournament-does-not-stage-a-sync_queue-row)
  - [IMP-20 — request_id not propagated into log records](#imp-20--request_id-not-propagated-into-log-records)
- [Minor Findings](#minor-findings)
- [Follow-Up Plan](#follow-up-plan)
  - [Bucket 1 — Audit-log infrastructure](#bucket-1--audit-log-infrastructure)
  - [Bucket 2 — Transactional repository boundaries](#bucket-2--transactional-repository-boundaries)
  - [Bucket 3 — Concurrency tokens](#bucket-3--concurrency-tokens)
  - [Bucket 4 — Security hardening](#bucket-4--security-hardening)
  - [Bucket 5 — DB integrity small fixes](#bucket-5--db-integrity-small-fixes)
- [What WAS Fixed](#what-was-fixed)

---

## Critical Findings

### CRIT-1 — Auth-bypass default survives typos

**File:** `backend/app/config.py:33`  
**Scenario:** `environment` defaults to `"local"`. The `_enforce_cloud_secrets`
validator only fires when `environment == "cloud"` (exact string). A deployment
that sets `ENVIRONMENT=Cloud` or `ENVIRONMENT=staging` or omits the var
entirely skips all secret-presence checks and then falls through to
`dependencies.py:108-113` which returns `_LOCAL_DEV_USER` whenever
`supabase_url` is blank — granting unauthenticated callers full operator access
in production.  
**Fix suggestion:** Validate `environment` against an explicit allowlist
`{"local", "cloud"}` in the Settings validator; treat any other value as a
startup error rather than defaulting to the permissive path.  
**Effort:** S

---

### CRIT-2 — Tournament hard-delete leaves no tombstone

**File:** `backend/api/tournaments.py:266-283`  
**Scenario:** `DELETE /tournaments/{id}` calls `repo.tournaments.delete()` which
issues a single SQL `DELETE` with no prior audit row, no soft-delete flag, and
no `sync_queue` staging row. Replicated Supabase rows are orphaned on the remote
if the sync worker has not yet drained the queue, and there is no record of who
deleted the tournament or when.  
**Fix suggestion:** Write a `deleted_tournaments` tombstone row (or set a
`deleted_at` / `deleted_by` column) inside the same transaction before issuing
the DELETE; stage a `sync_queue` row for the delete event.  
**Effort:** M

---

### CRIT-3 — bulk_project_from_schedule silently CASCADE-wipes command log

**File:** `backend/repositories/local.py:420-433`  
**Related model:** `backend/database/models.py:237-254`  
**Scenario:** `bulk_project_from_schedule` identifies stale `Match` rows and
calls `self.session.delete(row)` for each. The `Command` model carries a FK
`(tournament_id, match_id) → matches(tournament_id, id) ON DELETE CASCADE`.
On Postgres (where FK enforcement is always on) every match deletion silently
wipes all `commands` rows for that match. On SQLite the same happens once
`PRAGMA foreign_keys = ON` is set (see IMP-8). Schedule regeneration therefore
permanently destroys the idempotency history for any match that gets re-keyed.  
**Fix suggestion:** Before deleting stale match rows, either reassign their
`commands` rows to a tombstone match or change the FK action to `SET NULL` /
`RESTRICT` and handle the constraint intentionally.  
**Effort:** M

---

### CRIT-4 — match_state writes bypass the command log entirely

**File:** `backend/api/match_state.py:339-425`  
**Scenario:** `PUT /match-state/{tournament_id}/{match_id}` and
`DELETE /match-state/{tournament_id}/{match_id}` call
`repo.match_states.upsert` and `repo.matches.set_status` respectively but never
call `repo.process_command`. The `commands` table is only written via
`api/commands.py`; direct match-state writes are invisible to the idempotent
command log, so replays and undo cannot account for them.  
**Fix suggestion:** Either route all match-state mutations through
`process_command` / the command log, or insert a `commands` row inside the same
transaction in `match_state.py` to record the operation.  
**Effort:** M

---

### CRIT-5 — generate_event_route is not atomic

**File:** `backend/api/brackets.py:1147-1360`  
**Scenario:** `POST /brackets/{tournament_id}/events/{event_id}/generate`
issues at minimum six separate database transactions: `delete_event` (commit),
`create_event` (commit), `bulk_create_participants` (commit),
`bulk_create_matches` (commit), then one `record_result` commit per R1 walkover.
A server crash or unhandled exception between any two commits leaves the bracket
in a partially-constructed state — e.g. the old event deleted but the new one
not yet created.  
**Fix suggestion:** Wrap the entire generate sequence in a single unit-of-work
(one SQLAlchemy `session.begin()` block or a `with session.begin():` context
manager) that commits once at the end and rolls back on any exception.  
**Effort:** L

---

### CRIT-6 — record_match_result is not atomic

**File:** `backend/api/brackets.py:1400-1487`  
**Scenario:** `POST /brackets/{tournament_id}/matches/{match_id}/result`
executes: `record_result` (commit), `set_event_status` (commit), then for each
downstream match: `update_match` (commit) and possibly another `record_result`
(commit). A partial failure after the first commit records the result but leaves
downstream advancement and event-status stale, producing an inconsistent bracket
state visible to all readers.  
**Fix suggestion:** Collect all ORM mutations (result + status + downstream
updates) inside one session and commit exactly once. If walkover advancement
must recurse, buffer all mutations before committing.  
**Effort:** L

---

### CRIT-7 — commit_tournament_state spans three separate transactions

**File:** `backend/repositories/local.py:1134-1167`  
**Scenario:** `commit_tournament_state` calls `backups.create` (commits in its
own method), `backups.rotate` (commits in its own method), then `upsert_data`
(commits in its own method). If the process dies after `backups.rotate` but
before `upsert_data` the backup exists but the live data was not updated,
leading to silent data loss on the next read (readers see the pre-commit state
while believing a commit succeeded).  
**Fix suggestion:** Pass the caller's session into each sub-method (or use a
single `session.begin()` that wraps all three) so the backup and the data update
are in the same transaction.  
**Effort:** L

---

## Important Findings

### IMP-1 — Tournament has no optimistic-concurrency version column

**File:** `backend/database/models.py:82-146`  
**Scenario:** The `Tournament` model has no `version` column. Concurrent PATCH
requests from two browser tabs both succeed; the second silently overwrites the
first. The `Match` and `BracketMatch` models do have `version` columns and
ETag/If-Match support, but the top-level tournament row (name, status, date) is
unguarded.  
**Fix suggestion:** Add `version = Column(Integer, nullable=False, default=1)`
to `Tournament`; increment it on every UPDATE; return it in `GET` responses and
require `If-Match` on `PATCH`.  
**Effort:** M

---

### IMP-2 — No body-size cap on JSON endpoints

**File:** `backend/app/main.py` (middleware section); `backend/api/schedule.py`  
**Scenario:** FastAPI does not impose a default body-size limit. A caller can
POST a multi-megabyte JSON payload to `/schedule` or `/brackets/*/generate`.
The schedule endpoint deserializes the entire body before the solver runs, so a
large payload causes unbounded memory consumption inside the request handler.  
**Fix suggestion:** Add a Starlette `ContentSizeLimitMiddleware` (or an
equivalent `http` middleware) capped at a reasonable limit (e.g. 1 MB) for all
non-streaming routes.  
**Effort:** S

---

### IMP-3 — Solver routes carry no rate limiting

**File:** `backend/app/main.py:212-226`  
**Scenario:** `POST /schedule`, `POST /schedule/repair`, `POST /schedule/warm-restart`,
and `POST /brackets/*/generate` all invoke the CP-SAT solver which is
CPU-bound and can run for seconds. There is no per-user or per-IP rate limit,
so a single authenticated user can saturate the server's CPU by firing requests
in a tight loop.  
**Fix suggestion:** Add a token-bucket or sliding-window rate limit (e.g. via
`slowapi` or a middleware counter in Redis/memory) scoped to the authenticated
user ID on all solver-triggering endpoints.  
**Effort:** M

---

### IMP-4 — Bracket solver accessible to any operator regardless of tournament ownership

**File:** `backend/api/brackets.py:96` (`_OPERATOR` dependency definition)  
**Scenario:** The `_OPERATOR` dependency verifies the caller has the `operator`
role for the tournament but does not verify that the tournament is in a state
that permits solver invocation (e.g. already-started events). Any operator
of any tournament can trigger `generate_event_route`, potentially regenerating
a bracket that is mid-play and wiping live results via the non-atomic path in
CRIT-5.  
**Fix suggestion:** Add a pre-condition check inside `generate_event_route` that
rejects the request (HTTP 409) when `is_event_started()` returns true and no
explicit force-regenerate flag is provided.  
**Effort:** S

---

### IMP-5 — BracketMatch.version not enforced on all update paths

**File:** `backend/database/models.py:534`; `backend/repositories/local.py:473`  
**Scenario:** `BracketMatch` has a `version` column, but the update path in
`_LocalBracketRepo.update_match` does not check an `expected_version` parameter
— it overwrites the row unconditionally. Only the ETag/If-Match path (used by
match-state endpoints) enforces the version. Internal callers such as
`record_match_result`'s downstream-advancement loop overwrite without checking.  
**Fix suggestion:** Pass `expected_version` through to `update_match` and raise
`ConflictError` when the DB version does not match, mirroring the pattern
already used by `Match`.  
**Effort:** M

---

### IMP-6 — match_states rows not FK-constrained to matches

**File:** `backend/database/models.py:304-323`  
**Scenario:** `MatchState` has a FK `tournament_id → tournaments.id` but no FK
to `matches`. When `bulk_project_from_schedule` deletes a `Match` row the
corresponding `MatchState` row is orphaned — it remains in the table with a
`match_id` that no longer exists. Subsequent reads return stale state for a
match that has been re-keyed.  
**Fix suggestion:** Add `ForeignKeyConstraint(["tournament_id", "match_id"],
["matches.tournament_id", "matches.id"], ondelete="CASCADE")` to `MatchState`,
with a migration.  
**Effort:** S

---

### IMP-7 — _clear_bracket commits once per event

**File:** `backend/api/brackets.py:799-809`  
**Scenario:** `_clear_bracket` iterates over events and calls
`repo.brackets.delete_event(tournament_id, event.id)` inside the loop. Each
`delete_event` call commits. If the process dies mid-loop, some events are
deleted and others are not, leaving the bracket partially cleared with no way to
distinguish which events were processed.  
**Fix suggestion:** Collect all deletions and issue a single commit after the
loop (or delete by tournament_id at the SQL level in one statement).  
**Effort:** S

---

### IMP-8 — SQLite FK enforcement disabled (no PRAGMA foreign_keys)

**File:** `backend/database/session.py:23-48`  
**Scenario:** The SQLAlchemy engine for SQLite is created without
`connect_args={"check_same_thread": False}` enabling FK pragmas, so
`PRAGMA foreign_keys` defaults to `OFF`. All `ON DELETE CASCADE` and
`ON DELETE RESTRICT` constraints in the schema are silently ignored in local
development. This masks CRIT-3 and IMP-6 locally; they only surface on
Postgres.  
**Fix suggestion:** Add a SQLAlchemy `event.listens_for(engine, "connect")`
hook that runs `PRAGMA foreign_keys = ON` on every new SQLite connection.  
**Effort:** S

---

### IMP-9 — Frontend bracket API polling has no concurrency token

**File:** `products/scheduler/frontend/src/` (BracketApi / polling hooks)  
**Scenario:** The frontend polls bracket state at a regular interval. No ETag
or `version` field is sent in the poll requests, so the server cannot return
HTTP 304 and always sends the full payload. More importantly, if two operator
tabs are open, the second tab's mutations overwrite the first's without any
conflict detection at the bracket level (only `BracketMatch`-level ETag is
enforced via the match-state path; bracket-level state has no version).  
**Fix suggestion:** Include a bracket-level `version` or `updatedAt` in poll
responses; have the frontend send `If-None-Match` / `ETag` and handle 304; show
a "stale — reload" banner when a version mismatch is detected mid-edit.  
**Effort:** M

---

### IMP-10 — Token-verification failure log may include token fragment

**File:** `backend/app/dependencies.py:124`  
**Scenario:** `log.warning("auth: token verification failed: %s", exc)` logs
the raw exception object. Supabase JWT parse errors sometimes embed the first N
characters of the token in the exception message. If those characters are sent
to a log aggregator (e.g. Supabase Logflare, Datadog) the token prefix is
persisted in log storage, facilitating offline brute-force of partial JWTs.  
**Fix suggestion:** Replace `%s` with `type(exc).__name__` or a manually
constructed message that does not include the exception string; never log the
token or any prefix of it.  
**Effort:** S

---

### IMP-11 — 403 authorization rejection not logged

**File:** `backend/app/dependencies.py:178-189`  
**Scenario:** When the RBAC check determines the caller lacks the required role,
`raise HTTPException(status_code=403)` is called with no prior `log.warning` or
`log.info`. There is no record in the logs of which user attempted to access
which tournament with which role, making it impossible to detect brute-force
privilege escalation attempts from log analysis.  
**Fix suggestion:** Add `log.warning("authz: user %s denied role %s for
tournament %s", user_id, required_role, tournament_id)` before raising.  
**Effort:** S

---

### IMP-12 — Free-text fields lack length caps on several DTOs

**File:** Multiple — `backend/api/match_state.py` (notes field `String(2000)`),
bracket DTOs, tournament name field  
**Scenario:** While `MatchState.notes` is capped at 2000 chars in the ORM
model, several DTO Pydantic schemas do not declare `max_length` validators for
string fields (tournament name, event discipline, participant name). A caller
can POST arbitrarily long strings that are truncated silently (SQLite) or raise
a DB-level error (Postgres) rather than a clean HTTP 422.  
**Fix suggestion:** Add `Field(max_length=N)` annotations to all free-text
fields in Pydantic DTOs; choose limits consistent with the ORM column lengths.  
**Effort:** S

---

### IMP-13 — /health/deep is unauthenticated and leaks system info

**File:** `backend/app/main.py:235-273`  
**Scenario:** `GET /health/deep` is registered without `dependencies=_AUTH_DEP`.
It returns `schemaVersion`, `dataDirWritable`, and `solverLoaded`. An
unauthenticated attacker can determine the backend schema version (to target
known migration-era vulnerabilities) and whether the data directory is writable.  
**Fix suggestion:** Either add `_AUTH_DEP` to the route (making it operator-only)
or strip `schemaVersion` and `dataDirWritable` from the response body, returning
only `status` and `version` for unauthenticated callers.  
**Effort:** S

---

### IMP-14 — Schedule history entries lack committedBy

**File:** `backend/services/bracket/state.py` (BracketSession); tournament data
blob (`ScheduleHistoryEntry` in `backend/app/schemas.py`)  
**Scenario:** `ScheduleHistoryEntry` records `committedAt` and the schedule
snapshot but does not record which authenticated user triggered the commit.
Re-plays and forensic audits cannot attribute a particular schedule version to
a specific operator.  
**Fix suggestion:** Add `committedBy: str` (user ID) to `ScheduleHistoryEntry`;
populate it from `get_current_user()` in the commit endpoint; include it in the
migration for the persisted JSON blob.  
**Effort:** S

---

### IMP-15 — BracketResult has no recorded_by column

**File:** `backend/database/models.py:564-600`  
**Scenario:** `BracketResult` stores the result of a bracket match (scores,
winner) but has no `recorded_by` column. There is no way to audit which user
entered or modified a result after the fact.  
**Fix suggestion:** Add `recorded_by = Column(String, nullable=True)` to
`BracketResult`; populate it from the authenticated user in
`brackets.py:record_match_result`; include a migration.  
**Effort:** S

---

### IMP-16 — InviteLink has no revoked_by column

**File:** `backend/database/models.py:377-404`  
**Scenario:** `InviteLink` has `revoked_at` (timestamp) but no `revoked_by`
column. If an invite is revoked, there is no record of which user performed the
revocation — important for security incident response.  
**Fix suggestion:** Add `revoked_by = Column(String, nullable=True)` to
`InviteLink`; populate it in the revoke endpoint; include a migration.  
**Effort:** S

---

### IMP-17 — TournamentMember role changes are not audited

**File:** `backend/repositories/local.py:982-994`  
**Scenario:** `_LocalMemberRepo.set_role` overwrites `role` in place with no
history row. If a member is promoted from `viewer` to `operator` (or demoted),
there is no record of the previous role, when it changed, or who changed it.
This is a gap for security-incident timelines.  
**Fix suggestion:** Add a `tournament_member_role_log` table (or a JSONB audit
column) and insert a row recording `(member_id, old_role, new_role, changed_by,
changed_at)` inside `set_role` in the same transaction.  
**Effort:** M

---

### IMP-18 — PATCH /tournaments/{id} writes no audit entry

**File:** `backend/api/tournaments.py:228-263`  
**Scenario:** `PATCH /tournaments/{id}` accepts `name`, `status`, and
`tournament_date` changes and writes them directly to the `Tournament` row with
no audit log entry. A tournament status transition (e.g. `draft → active →
completed`) is not recorded anywhere except the final column value.  
**Fix suggestion:** Stage a `sync_queue` row or write to a
`tournament_audit_log` table inside the same transaction capturing
`(field, old_value, new_value, changed_by, changed_at)`.  
**Effort:** M

---

### IMP-19 — create_tournament does not stage a sync_queue row

**File:** `backend/api/tournaments.py:170-200`  
**Scenario:** `POST /tournaments` calls `repo.tournaments.create()` which
inserts the `Tournament` row but does not stage a corresponding `sync_queue`
row. The Supabase sync worker will therefore never replicate the new tournament
to the remote until the next explicit `upsert_data` call (which only happens
during schedule commits, not on creation).  
**Fix suggestion:** Stage a `sync_queue` row for the new tournament inside the
`repo.tournaments.create` method (or in the route handler) in the same
transaction, mirroring the pattern used by `upsert_data`.  
**Effort:** S

---

### IMP-20 — request_id not propagated into log records

**File:** `backend/app/main.py:155-169`  
**Scenario:** `request_id_middleware` assigns a UUID to `request.state.request_id`
and returns it in the `X-Request-ID` response header. However, no logging
filter or `contextvars` binding injects the request ID into the Python `logging`
record. Log lines from within a request handler do not carry the ID, making it
impossible to correlate a specific `X-Request-ID` (from the frontend network
tab) with the server-side log lines that it produced.  
**Fix suggestion:** Add a `logging.Filter` subclass that reads the request ID
from a `contextvars.ContextVar` (set by the middleware) and injects it as a log
record attribute; configure this filter on the root logger or `scheduler.*`
namespace.  
**Effort:** S

---

## Minor Findings

- **MIN-1** — `_LOCAL_DEV_USER` hard-codes `user_id="local-dev"` with `role="owner"`; any local-dev schema
  migration that adds user_id FK constraints will break seeding if this literal ever becomes a real user.

- **MIN-2** — `settings.cors_origins` defaults to a hardcoded localhost list; there is no startup warning
  when `ENVIRONMENT=cloud` but `CORS_ORIGINS` still contains a `localhost` origin.

- **MIN-3** — `GET /health` returns `{"version": "2.0.0"}` hardcoded in two separate places
  (`/health` and `/health/deep`); the version string is not sourced from a single constant.

- **MIN-4** — `ScheduleHistoryEntry` has no max-length cap on the embedded JSON schedule blob; very large
  tournament states could inflate the `data` column unboundedly.

- **MIN-5** — `sync_queue` rows are never pruned; the table grows indefinitely for long-running
  deployments.

- **MIN-6** — `SuggestionsWorker` cooldown is hard-coded to 30 s in `lifespan`; it is not
  configurable via `settings`.

- **MIN-7** — `InviteLink.expires_at` is nullable; callers can create non-expiring invite links
  with no UI warning.

- **MIN-8** — `_LocalBackupRepo.rotate` silently swallows backup-count enforcement errors; a failed
  rotation leaves excess backup rows without alerting the caller.

- **MIN-9** — `Close repository middleware` comment says "sync routes are unaffected" but does not
  account for future streaming routes that might also use `get_repository`.

- **MIN-10** — `alembic/env.py` runs `command.upgrade(cfg, "head")` on every startup; on a large migration
  history this performs a full migration-history scan on every boot even if no migration is pending.

---

## Follow-Up Plan

### Bucket 1 — Audit-log infrastructure

Findings: CRIT-2, CRIT-4, IMP-11, IMP-14, IMP-15, IMP-16, IMP-17, IMP-18, IMP-20

All of these require writing an audit or history record for mutations that
currently produce no trail. They can share a single migration that adds the
needed columns / tables. The recommended sequencing is:

1. Decide on a unified audit pattern (dedicated `audit_log` table vs.
   per-entity `*_log` tables vs. JSONB `audit` column).
2. Add `recorded_by` to `BracketResult`, `revoked_by` to `InviteLink`
   (IMP-15, IMP-16) — these are additive column changes, low risk.
3. Add `committedBy` to `ScheduleHistoryEntry` (IMP-14) — JSON blob change,
   needs a migration + backfill strategy.
4. Route `PATCH /tournaments/{id}` through the audit pattern (IMP-18).
5. Log 403 rejections (IMP-11) and inject `request_id` into log records (IMP-20).
6. Add tombstone / `deleted_by` for tournament deletes (CRIT-2).
7. Route match-state mutations through the command log (CRIT-4).

**Estimated total effort:** L (4–8 dev-days)

---

### Bucket 2 — Transactional repository boundaries

Findings: CRIT-3, CRIT-5, CRIT-6, CRIT-7, IMP-7

All of these are multi-commit operations that need to collapse into single
transactions. They require the most refactoring because some sub-methods
(`backups.create`, `backups.rotate`, `delete_event`, `record_result`) currently
own their own `session.commit()` calls.

Recommended approach:

1. Introduce a `UnitOfWork` context manager (or pass a `session` parameter) to
   `commit_tournament_state`, `generate_event_route`, and
   `record_match_result`.
2. Defer `session.commit()` to the outermost caller in each chain.
3. Fix `_clear_bracket` (IMP-7) as a quick win before the larger refactor.
4. Fix CRIT-3 (`bulk_project_from_schedule` cascading into command log) either
   by changing FK action or by protecting command rows before deletion.

**Estimated total effort:** L (5–10 dev-days)

---

### Bucket 3 — Concurrency tokens

Findings: IMP-1, IMP-5, IMP-9

These are independent but related: `Tournament` lacks a version column (IMP-1),
`BracketMatch.update_match` ignores the existing version (IMP-5), and the
frontend polling loop has no ETag (IMP-9).

Recommended sequencing:

1. Add `version` to `Tournament` + migration + `If-Match` on `PATCH` (IMP-1).
2. Thread `expected_version` through `update_match` (IMP-5).
3. Add bracket-level `version` to poll responses; implement frontend 304 / stale
   banner (IMP-9).

**Estimated total effort:** M (2–4 dev-days)

---

### Bucket 4 — Security hardening

Findings: CRIT-1, IMP-2, IMP-3, IMP-4, IMP-10, IMP-13, IMP-19

These are mostly independent and can be addressed in any order. CRIT-1 is the
highest-priority single item in this bucket.

Recommended sequencing:

1. Harden `environment` allowlist (CRIT-1) — 30-min fix, deploy immediately.
2. Strip token from auth-failure logs (IMP-10) — 15-min fix.
3. Add `_AUTH_DEP` to `/health/deep` or scrub the response (IMP-13).
4. Add body-size middleware (IMP-2).
5. Add `is_event_started()` pre-condition to `generate_event_route` (IMP-4).
6. Add rate limiting to solver endpoints (IMP-3).
7. Stage sync_queue on `create_tournament` (IMP-19).

**Estimated total effort:** M (1–3 dev-days)

---

### Bucket 5 — DB integrity small fixes

Findings: IMP-6, IMP-8, IMP-12

These are all self-contained schema or middleware changes with low risk.

1. Enable `PRAGMA foreign_keys = ON` for SQLite (IMP-8) — one-liner in
   `session.py`.
2. Add FK from `match_states` to `matches` (IMP-6) — migration required.
3. Add Pydantic `max_length` to free-text DTO fields (IMP-12) — no migration,
   API-version-compatible.

**Estimated total effort:** S (< 1 dev-day combined)

---

## What WAS Fixed

The following four findings were resolved inline during this session
(dev2 branch); they are excluded from all deferred tracking above.

| Fix | Finding | Description | Commit |
|-----|---------|-------------|--------|
| FIX-1 | Name save bug (Audit A) | `forceSaveNow` race condition + `SetupTab` uncontrolled input + `create_tournament` config seeding (3 sub-fixes) | `6a19cb9` |
| FIX-2 | bracket_session wipe (Audit B) | `_stamp_payload` overwrote the `bracket_session` key on every `PUT /state`; fixed to preserve the key when present | `27fd860` |
| FIX-3 | A.1 alembic chain misaligned (visual sweep) | `down_revision` pointed at `f7a3c9b2e8d4` but the actual head was `a8b2d5e9f1c3` — TWO heads, migration never applied in deployments. Tests passed via SQLAlchemy `create_all` bypass. | `f2ea200` |
| FIX-4 | BracketTab `!data` blocked Setup/Roster/Events (visual sweep) | Empty-state CTA fired on tournaments with no events yet, hiding Setup form. Scoped the short-circuit to Draw/Schedule/Live only. | `8554f77` |

Placeholders will be replaced with actual commit SHAs once FIX-1 and FIX-2
branches land.
