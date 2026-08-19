# SP-CLOUD-3 — Phase 0 Audit Report

_Date: 2026-08-04. Branch audited: `dev/cloud-tenancy` @ `af543d8`._
_Status: **awaiting user decisions on 0.A (trunk) and 0.E (mirror)**. No feature code written._

Findings are grounded in the tree, not in the program prompt. Where the prompt
predicted a defect and none exists, that is stated plainly.

---

## 0.A — Branch consolidation (USER DECISION)

### Divergence

The stack is **strictly linear** — every branch is an ancestor of the next. There
is no merge conflict risk in any direction.

| Range | Commits |
|---|---|
| `main` → `dev/workspace-suite` | 490 ahead, 0 behind |
| `dev/workspace-suite` → `dev/cloud-tenancy` | 7 ahead, 0 behind |
| `main` → `dev/cloud-tenancy` | 497 ahead, 0 behind |

`dev/cloud-runtime` and `dev/workspace-suite` point at the **same commit**
(`7b1a647`) — `dev/cloud-runtime` is a fully-merged leftover label.

The 7 commits unique to `dev/cloud-tenancy` are the whole of SP-CLOUD-2:

```
af543d8 docs: state-of-codebase snapshot 08 (post-SP-CLOUD) + CLAUDE.md refresh
50afeb4 fix(tests): kill the backup-list flake — stamp created_at explicitly
a610dfa fix(audit): session-expiry UX + cloud SMTP fail-closed; docs refresh
171b3e6 feat(deploy+docs): cloud auth mode, extended round-trips, seam docs — Phase 4
44dcd2f feat(auth+display): email seam, capability display link, session frontend — Phase 3
703a62c feat(tenancy): org model + 404 enforcement seam + isolation suite — Phase 2
7b578a7 feat(auth): self-hosted identity & cookie sessions — Phase 1
```

### The one real complication: `origin/main` is ahead of local `main`

Local `main` (`cab713d`) is **290 behind** `origin/main` (`3c6afa8`). More
importantly, `origin/main` carries **2 commits that are not in the stack**:

```
3c6afa8 Merge pull request #11 from wongywrongy/dev/workspace-suite
0a52888 Create LICENSE
```

`git merge-base --is-ancestor origin/main dev/cloud-tenancy` → **NO**.

The only file consequence is **`LICENSE`, which exists on `origin/main` and is
absent from `dev/cloud-tenancy`.** `0a52888` was committed directly on GitHub
(web UI) and never flowed down. Everything else in `3c6afa8` is the merge of an
older `dev/workspace-suite`, already contained in the stack.

So consolidation is a fast-forward *plus* recovering one file. Nothing else is
at risk.

### Options

**Option 1 — Fast-forward `main`, keep it as trunk (RECOMMENDED).**
Merge `dev/cloud-tenancy` into `main`; `LICENSE` survives automatically because
the merge keeps `main`'s tree contribution. Retire `dev/cloud-runtime` and
`dev/workspace-suite` labels. Branch `dev/cloud-hardening` from `main`.

- Keeps `origin/HEAD -> main` correct, keeps the GitHub default branch meaningful,
  keeps CI's `main` gate the real gate.
- One PR (#12-shaped), reviewable as the SP-CLOUD program landing.
- Cost: a 497-commit merge into a branch nobody has been reading. Low risk given
  the linearity, but the PR diff is large (603 files).

**Option 2 — Declare `dev/workspace-suite` the trunk, retire `main`.**
Requires re-pointing `origin/HEAD`, updating CI branch filters, and manually
cherry-picking `LICENSE`. Leaves a repo whose default branch is named after a
finished feature program.

**Recommendation: Option 1.** The stack is linear so the merge is mechanically
trivial, and the naming stays honest — a shipped product's trunk should be
`main`, not `dev/workspace-suite`. Do it as a real PR so the SP-CLOUD program
has a landing artifact, then delete `dev/cloud-runtime` and `dev/workspace-suite`.

**Blocking question:** approve Option 1, or choose otherwise?

---

## 0.B — Member-management audit

### Current state

`tournament_members` (`database/models.py:361`) — composite PK
`(tournament_id, user_id)`, `role` free string, `user_id` FKs `users` with
`ON DELETE CASCADE`. Roles `viewer < operator < owner` (`_ROLE_LEVELS`,
duplicated in `app/dependencies.py:92` and `api/invites.py:101`).

`org_members` (`database/models.py:979`) — `(org_id, user_id)`, roles
`owner | member`. **`orgs` exist in the schema but have no HTTP surface at all.**

### Membership creation paths (complete list)

1. `POST /tournaments` → `api/tournaments.py:358` — creator becomes `owner`.
2. `POST /invites/{token}/accept` → `api/invites.py:232` — invitee gets the
   invite's role, upgrade-only (never downgrades, never overwrites `owner`).
3. `ensure_personal_org` at registration — org membership only.
4. The SP-CLOUD-2 backfill migration.

### What is missing over HTTP

The repository layer (`repositories/local.py:1169` `_LocalMemberRepo`) **already
implements** `set_role`, `remove_member`, `list_for_tournament`,
`list_roles_for_user`, `count_by_tournament`. The gap is purely the API layer:

| Operation | Repo support | HTTP route |
|---|---|---|
| List members | ✅ | ✅ `GET /tournaments/{id}/members` (viewer-gated) |
| Remove member | ✅ `remove_member` | ❌ **missing** |
| Change role | ✅ `set_role` | ❌ **missing** |
| Transfer ownership | — | ❌ **missing** |
| Leave (self-removal) | ✅ `remove_member` | ❌ **missing** |
| Revoke pending invite | ✅ | ✅ **`DELETE /invites/{token}` already exists** |
| Org-level equivalents | partial | ❌ no org routes exist |

**Correction to the program prompt:** Phase 1 lists "revoke pending invite" as
missing. It is not — `api/invites.py:252` implements it, owner-gated via
`_require_invite_owner`. Phase 1 should scope-down to the five genuinely absent
operations. (It does need the 0.C uniform-response treatment, see below.)

### Does removal take effect immediately? — **YES, already.**

This is the question the prompt flagged as needing to be "immediately" by end of
slice. It already is, and no work is required to make it so:

- `require_tournament_access._check` calls `repo.members.get_role(...)` on
  **every request** (`app/dependencies.py:127`) — a live `session.get()`, no memoization.
- There is **no membership cache anywhere**. The only cache in the backend is
  `services/bracket/response_cache.py`, which is keyed by `tournament_id` only
  and sits *behind* the enforcement seam — a removed member is 404'd before
  reaching it, so it cannot leak data to an ex-member.
- Sessions are identity-only (`auth_sessions` → user), and carry no cached role.

So removal is effective on the removed user's very next request. Phase 1 must
simply **not introduce** a cache; the "invalidate any membership caching" task
is a no-op. I recommend adding a regression test that pins this property rather
than building invalidation machinery for a cache that doesn't exist.

### Last-owner invariant — currently violable, but only theoretically

No code path can currently demote or remove an owner (no routes exist), so the
invariant is not violated today. It becomes violable the moment Phase 1 lands.
`add_member`/`set_role`/`remove_member` each `commit()` internally with no
guard, so Phase 1 must add a service-layer check and, for the concurrent case,
either a `SELECT ... FOR UPDATE` on the owner rows (Postgres) or rely on the
composite-PK row locks (SQLite). Note the repo methods' internal `commit()`
conflicts with a "service layer owns the transaction" guard — Phase 1 will need
either non-committing variants or a check-and-act inside one transaction.

---

## 0.C — Invite-token oracle characterization

### Confirmed: the oracle is real, and the code contradicts its own docstring

`api/invites.py:152` `resolve_invite` carries this docstring:

> "Intentionally does not 404 on missing tokens — an attacker probing random
> UUIDs gets the same shape (with `valid: false`) as a revoked or expired invite."

The code immediately below it does exactly the opposite:

```python
invite = repo.invite_links.get(token)
if invite is None:
    raise HTTPException(status_code=404, detail="invite not found")
```

The intent was written down and then not implemented. That is the defect.

### Response matrix (derived from source; `GET /invites/{token}`)

| Token state | Status | Body |
|---|---|---|
| Nonexistent | **404** | `{"detail": "invite not found"}` |
| Valid, unused | 200 | full DTO, `valid: true` |
| Valid, used (still live) | 200 | full DTO, `valid: true` |
| Expired | 200 | full DTO, `valid: false`, `expiresAt` set |
| Revoked | 200 | full DTO, `valid: false`, `revokedAt` set |
| Belongs to another org | 200 | full DTO — **org is not consulted at all** |

`POST /invites/{token}/accept` leaks the same distinction on a second axis:
**404** for nonexistent vs **410 Gone** for revoked/expired.

Severity is bounded — tokens are UUIDv4 (122 bits), so blind enumeration is not
feasible. The real exposure is a *leaked or shoulder-surfed* link: a holder can
determine whether a workspace still exists, whether their access was
deliberately revoked vs merely expired, and — via `tournamentName` on a still-valid
token — the workspace's name without ever authenticating.

**Additional leak worth fixing in the same pass:** a 200 response returns
`tournamentName` to a fully unauthenticated caller. That is by design for the
join page, but it means any valid token is a workspace-name disclosure. Keep it
(the join page needs it) but note it in the ADR.

### Proposed uniform response

One shape for every non-acceptable state on `GET`:

- `404` + `{"code": "INVITE_NOT_FOUND", "message": "Invite not found or no longer valid"}`
  for nonexistent, expired, revoked — indistinguishable.
- `200` + the resolve DTO **only** when `is_invite_valid(invite)` is true; drop
  `valid`, `expiresAt`, `revokedAt` from the public DTO entirely (a 200 now
  means "valid", so the flags are redundant and only serve to leak).
- `POST .../accept`: collapse 404 and 410 into the same `404`.

**Timing:** the current path is a single indexed PK lookup either way, so timing
skew is small but nonzero (the nonexistent case skips the `tournaments.get_by_id`
follow-up query and the DTO build). Rather than import the dummy-hash pattern —
which exists for Argon2's ~100 ms cost and is overkill for two point queries —
the cheaper equalization is to **always perform the tournament lookup** and build
a discarded DTO before branching. I will measure both branches and pin the
delta in a regression test, and only reach for artificial padding if the measured
delta is resolvable over a network. (Flagging as an open call I'll resolve with
data in Phase 2, per the prompt's "open questions you may resolve yourself".)

### Display tokens — assessed, **not** the same issue

`/display/{token}/*` resolves via `_resolve` (`api/display.py:90`), which is
**already uniform**: one `404 TOURNAMENT_NOT_FOUND` for a missing token, a token
whose tournament was deleted, and an empty token alike. There is no `valid`
flag and no state to distinguish — revocation is row-deletion/rotation, so a
revoked token is byte-identical to a token that never existed.

Tokens are 64-char urlsafe strings (`display_tokens.token`), higher entropy than
the invite UUIDs. **No change needed.** The prompt's concern ("public read-only
and enumerable are different properties") is valid in general but does not apply
here — SP-CLOUD-2 got this surface right.

---

## 0.D — Sorted-iteration scope

### Root cause — single, and narrower than the debt-log implies

```python
# scheduler_core/engine/diagnostics.py:8
def get_player_ids(match: Match) -> set[str]:
    return set(match.side_a) | set(match.side_b)
```

Returning a `set[str]` is the *only* source of hash-order nondeterminism in the
model build. Everything upstream is already ordered:

- `add_matches` / `add_players` (`cpsat_backend.py:388`, `:396`) already
  `sorted(...)` by id, with a comment explaining exactly why.
- `bridge._build_players` (`bridge.py:144`) already does
  `for pid in sorted(pids)`.
- `self.matches` is therefore a dict in sorted-id insertion order.

### The one construct that actually changes the model

`cpsat_backend._player_matches()` (`:418`):

```python
out: Dict[str, List[Match]] = defaultdict(list)
for match in self.matches.values():        # deterministic (sorted)
    for pid in get_player_ids(match):      # HASH-ORDERED  ← the defect
        out[pid].append(match)
return out
```

Dicts preserve insertion order, so `out`'s **key order is inherited from the
hash order of the first match's player set**. Its three consumers all iterate
`.items()` and emit constraints in that order:

- `constraints/player_no_overlap.py:28`
- `constraints/rest.py:35`
- `constraints/game_proximity.py:40`

Different key order → different CP-SAT variable/constraint creation order →
different search-tree tie-breaking → a different (equally optimal) schedule.
**This is the whole bug.**

### Full call-site inventory and per-site verdict

| Site | Verdict | Fix |
|---|---|---|
| `cpsat_backend.py:421` `_player_matches` | **REAL — changes the model** | sort |
| `cpsat_backend.py:446` `_allowed_starts` | Safe — result is a set *intersection* (commutative); order cannot change the frozenset | sort anyway, free |
| `cpsat_backend.py:568` `_compute_model_stats` | Safe — pure counting into a dict, read via `.values()` | sort anyway |
| `diagnostics.py:35` | Safe — `Counter` accumulation | sort anyway |
| `validation.py:165` | **Cosmetic** — `conflicts` list *order* varies | sort |
| `validation.py:190` | **Cosmetic** — same | sort |
| `validation.py:266` | **Cosmetic** — `by_player` key order varies, changes conflict emission order | sort |

The `validation.py` sites don't change *which* conflicts are found, only the
order they appear in the returned list. That still surfaces to users (advisory
ordering) and to any test asserting on `conflicts[0]`, so it's worth fixing.

### Recommended fix — one line, at the source

Change the return type rather than patching seven call sites:

```python
def get_player_ids(match: Match) -> list[str]:
    """Player IDs in a match, de-duplicated, in stable sorted order.

    Sorted (not incidental) order is load-bearing: `_player_matches`
    inherits its dict key order from this, and that order determines
    CP-SAT constraint creation order and therefore the chosen schedule.
    """
    return sorted(set(match.side_a) | set(match.side_b))
```

Every call site is a `for pid in ...` or a membership test, so the `set → list`
change is source-compatible at all seven. I checked: no caller relies on set
algebra on the return value.

This stays inside Rule 5's bounds — engine-internal ordering, no I/O, no config.
Also verified: **no `os.listdir` / `glob` / `iterdir` anywhere** in
`scheduler_core/` or `backend/services/`, and no unordered DB read feeds
constraint creation (the bridge is the only path in, and it sorts).

### Blast radius on determinism fixtures

Model *structure* is unchanged (same variables, same constraints, same
objective) — only **creation order** changes. So:

- Model **fingerprints will change** for any tournament where at least one match
  has ≥2 players whose ids hash-order differently from sorted order — i.e. in
  practice, nearly all of them.
- Objective **values should be identical** (same feasible set, same optimum);
  only the tie-broken assignment may differ.
- Byte-identity double-solve must still pass, and should now pass *without*
  `PYTHONHASHSEED=0`.

**Before/after plan:** capture current fingerprints + full solve output on the
existing determinism fixtures with `PYTHONHASHSEED=0` (today's pinned baseline),
apply the fix, then capture again **unpinned, twice, on two different hash
seeds**. Acceptance: the two unpinned runs are byte-identical to each other. Both
fingerprint sets get recorded in `CLOUD_PROGRESS.md`. If objective values move,
that's a red flag to investigate, not to re-baseline past.

### Rule 7 — the three compensations, re-evaluated together

| Compensation | Recommendation |
|---|---|
| `PYTHONHASHSEED=0` in `solve_runner`'s child env | **Remove** — the mask is gone once the real fix lands |
| `solve_child` hard-refusal to run unpinned | **Remove** — it would otherwise block the now-correct unpinned path |
| `services/determinism.py` `warn_if_unpinned` | **Remove the module** — see below |

The warning's own docstring states its entire justification: *"the engine's model
build iterates hash-ordered sets (`cpsat_backend._player_matches`)"*. Once that
sentence is false, the warning is not just unnecessary — it is **actively
misleading**, telling operators determinism is at risk when it is not. Keeping it
"just in case" is exactly the mask-beside-the-fix pattern Rule 7 forbids.

The honest replacement is a **test**, not a runtime warning: a double-solve
byte-identity test that runs unpinned and would fail loudly if hash-ordered
iteration is ever reintroduced. That is a real regression guard; a log line is not.

Removal touches `test_determinism_guard.py`, which must be rewritten to the new
contract rather than deleted.

---

## 0.E — Mirror decision brief (USER DECISION)

### What it does today

`services/sync_service.py` is a crash-safe outbox: writes land in the local
`sync_queue` table inside the same transaction as the domain write, and a
background pump pushes them to Supabase. Seven entity types are mirrored:
`tournament`, `match`, `bracket_event`, `bracket_match`, `bracket_result`,
`bracket_participant`, `bracket_event_delete`. Push is a `client.table(...).upsert(...)`
per row. It is a **one-way push**; nothing reads back. It no-ops entirely when
`supabase_url` / `supabase_anon_key` are blank (`sync_service.py:375`), which is
the default and therefore the local-mode state.

### The `org_id` gap — confirmed

`_tournament_to_payload` (`sync_service.py:407`) emits:

```python
{"id", "owner_id", "owner_email", "name", "status",
 "tournament_date", "data", "schema_version"}
```

**No `org_id`.** So the mirror carries a tenancy model one generation stale: it
knows about `owner_id` (pre-SP-CLOUD-2 single-owner) but not the org that
actually owns the workspace. Any RLS policy written against the mirror cannot
express "members of this org can read this workspace" — the column isn't there.

### Supabase RLS state

I found **no RLS policy definitions in the repository** — no `.sql` files, no
migrations, no policy-management code. The only mention is prose in
`docs/changes/2026-05-13.md`. Whatever policies exist were applied by hand in the
Supabase dashboard and are **not under version control**. They were written for a
world where Supabase Auth issued the JWTs that RLS keyed on — and SP-CLOUD-2
retired Supabase Auth. So the policies are, at best, keying on an `auth.uid()`
that no longer corresponds to any live session.

**This is worse than the prompt assumed.** It's not "stale RLS" — it's
unversioned, unreviewable RLS protecting a database that receives production
tournament data, whose auth basis has been removed. I cannot verify what those
policies currently allow. If the anon key is broad and the policies are
JWT-dependent, the mirror may be effectively unprotected right now.

### What the mirror means under the Section 2 topology

The outbox's founding premise — *"SQLite on a laptop is the source of truth and
needs a cloud copy"* — is **void in cloud mode**. In the target topology,
Postgres on cayde *is* the durable primary, backed up by `pg_dump`. Pushing a
partial, denormalized copy to a second vendor's Postgres adds no availability and
no recovery capability that `pg_dump` doesn't already provide better.

In **local mode** the premise still holds, and this is where the feature has real
value: a director's laptop dies mid-tournament and the mirror is the only copy.

### Options

**(a) Mirror off in cloud mode; retained as a local-only feature (RECOMMENDED).**
Gate the pump on `environment != "cloud"` (or make it explicit:
`MIRROR_ENABLED`, defaulting off in cloud). Local behavior unchanged. Delete
nothing.

- Honors Rule 1 — local-first parity keeps its laptop-loss story intact.
- Removes the unversioned-RLS exposure from the cloud deployment entirely,
  because cloud never pushes.
- Sidesteps the `org_id` gap: local mode is single-org by construction, so
  `org_id` adds nothing there.
- Cost: two code paths keep existing. Small — the gate is one condition, and the
  push path is already fully no-op-able.
- **Also required regardless of choice:** tear down or lock the existing Supabase
  policies, since they're unversioned and their auth basis is gone.

**(b) Retain as a cloud backup channel; add `org_id`, rewrite RLS.**
Costs: define `org_id` in the payload + Supabase schema migration, author RLS
from scratch against service-role or a new key model, get those policies into
version control, and own a second datastore's security posture forever. Buys a
backup channel strictly worse than `pg_dumpall` — partial (7 entity types, not
the full schema), eventually-consistent, and not restorable into the app.
**Not recommended.** It is real ongoing security surface for redundant value.

**(c) Remove entirely.**
Cleanest cloud story, but **deletes the local-mode laptop-loss backup**, which is
a genuine product capability for the solo director — the exact user Rule 1
protects. Recommend against unless you consider that capability dead already.
Worth asking: has the mirror ever actually been used to recover a tournament?
If never, (c) becomes attractive and removes ~450 lines plus a whole vendor
dependency.

**Recommendation: (a)**, with the Supabase-side policies torn down as part of the
same change and an ADR recording that the mirror is a local-mode-only backup, not
part of the cloud architecture.

**Blocking question:** (a), (b), or (c)? And — has the mirror ever been used for
a real recovery? That answer would move me between (a) and (c).

---

## 0.F — Deployment audit

### 0.F.1 — Proxy headers and scheme detection: **NO DEFECT** (prompt expectation not borne out)

I grepped the entire backend for `request.url`, `url.scheme`, `base_url`,
`X-Forwarded-Proto`, and every spelling of forwarded-proto. **There are zero
scheme-sensitive branches in the codebase.** The only `*_url` hits are
`database_url` and `supabase_url` — config strings, not request scheme.

The session cookie's `Secure` flag is **already configuration-driven**:
`session_cookie_secure: bool = False` (`config.py:122`), set on the cookie
directly and validated by `_enforce_cloud_secrets` (`config.py:179`) which
*requires* it true when `ENVIRONMENT=cloud`.

So the tunnel's "API sees `http` while the browser leg is HTTPS" problem
**cannot manifest** — nothing consults the scheme. `_enforce_cloud_secrets` will
pass under the tunnel with `SESSION_COOKIE_SECURE=true` and no code change.
SP-CLOUD-2 got this right by never sniffing in the first place.

**One genuine gap:** uvicorn runs with **no `--proxy-headers` and no
`--forwarded-allow-ips`** (`backend/Dockerfile:95`):

```
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "5"]
```

This is currently *fail-safe* (forwarded headers are ignored, so nothing can be
spoofed) but it's why 0.F.2 below is broken. Phase 3 should enable
`--proxy-headers --forwarded-allow-ips=<connector-ip>` — scoped, never `*`.

### 0.F.2 — Client IP under the tunnel: **CONFIRMED DEFECT**

```python
# api/auth.py:97
def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
```

Used at four sites, all throttle keys: `register` (:142), `login` (:177),
and two more at :292 and :340 (password-reset paths).

Under the tunnel, `request.client.host` is the **cloudflared container's address
for every request on the planet**. With `auth_throttle_max_failures = 5`, the
fifth failed login from anyone locks the `ip:` bucket — and
`_throttle_guard(repo, account_key, ip_key)` checks that bucket **before**
validating credentials, so **every user is locked out globally**, with the
doubling backoff compounding to the 15-minute cap. This is a full
denial-of-service on login, trivially triggered, and it fires on day one of the
deployment.

Note the account-key throttle is unaffected and still correct.

**Proposed fix, with the trust boundary stated explicitly:**

1. Add `trusted_proxy_ips: list[str] = []` to settings (empty = trust nothing).
2. `_client_ip` reads `CF-Connecting-IP` **only when
   `request.client.host` is in `trusted_proxy_ips`**; otherwise it returns
   `request.client.host` and ignores the header entirely.
3. Empty list is the local-mode default → local behavior byte-identical, header
   never consulted (Rule 1).
4. Move `_client_ip` out of `api/auth.py` into a shared module — it is now
   security-relevant infrastructure, not an auth-router helper.

**Rule 8 test obligations:** (i) spoofed `CF-Connecting-IP` from an untrusted
source is ignored and the socket IP is used; (ii) the header *is* honored from a
trusted source; (iii) two different `CF-Connecting-IP` values behind the same
trusted proxy get **independent** throttle buckets — the regression test for the
actual bug; (iv) with `trusted_proxy_ips` empty, the header is inert.

`CF-Connecting-IP` is the right header for this topology (Cloudflare sets it
unconditionally and it is not client-controllable through the edge), but it is
only trustworthy *because* step 2 pins the source. A header trusted from anywhere
is a bypass — which is precisely Rule 8's point.

### 0.F.3 — Streaming and timeouts

- **SSE:** one remaining stream, the bracket schedule-next progress endpoint.
  The known Vite-dev-proxy buffering issue is a different, dev-only path and
  does not predict tunnel behavior. cloudflared does not buffer
  `text/event-stream` by default, so this should work — but "should" isn't
  verification. **Test method:** stand up the tunnel, run a solve long enough to
  emit multiple progress events, and assert events arrive incrementally
  (timestamped `curl -N` against the public hostname, checking inter-event
  arrival rather than total time). I will not mark this verified without that.
- **Edge timeout:** Cloudflare Free's proxy read timeout is 100 s. The async
  solve rail protects the expensive path. Candidates that could still block:
  CSV import (`services/csv_importer.py`), backup restore, XLSX export, and the
  interactive ≤10 s solves (repair/warm-restart/proposals/director/bracket —
  bounded by decision C3, so fine). Phase 3 should measure the import and
  restore paths at realistic sizes rather than assume.
- **Body size cap:** cloudflared/Cloudflare Free caps request bodies at
  **100 MB**. The largest legitimate upload is a roster CSV — kilobytes. Backup
  *restore* is the only path that could approach it; needs a measured worst case.

### 0.F.4 — Remote worker connectivity and least privilege

**STOP condition NOT triggered — no worker path reads an identity table.**

I traced every import and DB access in `worker.py`, `services/solve_worker.py`,
`services/solve_jobs.py`, `services/solve_runner.py`, `services/solve_child.py`.

**The worker touches exactly one table: `solve_jobs`.**

- `worker.py` imports `SolveJob` + `SessionLocal`, nothing else.
- `solve_jobs.py` imports `SolveJob, SolveJobStatus`, nothing else.
- `solve_worker.py`'s five DB helpers (`_claim`, `_beat`, `_is_cancelled`,
  `_record_outcome`, maintenance) each `session.get(SolveJob, ...)` and nothing more.
- `solve_runner.py` / `solve_child.py` have **no database imports at all** —
  the child receives its problem as JSON via a temp file and returns JSON.

This works because the API writes the entire solve input into `solve_jobs.payload`
at submit time. The worker never resolves a tournament, never reads a user.

So an `sw_worker` role needs precisely:
`GRANT SELECT, INSERT, UPDATE, DELETE ON solve_jobs` (DELETE for
`prune_terminal`), plus `USAGE` on the schema. It can be denied `users`,
`auth_sessions`, `auth_throttle`, `orgs`, `org_members`, `tournament_members`,
`invite_links`, `display_tokens`, and every domain table. The least-privilege
model in the prompt is **sound and implementable as specified**.

Two caveats for Phase 3:

- `alembic_version` must be readable if the worker's schema-wait polls it; grant
  `SELECT` only, never `CREATE`. Migrations stay API-owned — `worker.py` waits
  for schema and never migrates, which I confirmed.
- API and worker holding different `DATABASE_URL`s is already supported: both
  read `settings.database_url` from their own process env, and
  `docker-compose.cloud.yml` sets it per-service. No code change needed for the split.

**Reconnect behavior — the real gap.** `_build_engine` (`database/session.py:91`)
is a process-wide engine. I did **not** find `pool_pre_ping` or a connect-retry
wrapper for the Postgres path. Each worker helper opens a session, does its work
in `try/except Exception: log.exception`, and closes in `finally` — so a tailnet
blip surfaces as a logged exception and the loop continues. That's survivable but
unproven at the edges:

- A drop **during** `_beat` means missed heartbeats → after `job_lease_seconds`
  (30 s) the job is reaped and retried by another worker, while the original
  child may still be solving. `job_max_attempts = 2` bounds the damage, and
  `_record_outcome` re-checks status before writing — but the "reaps and
  completes **exactly once**" guarantee needs a test, not an argument.
- `pool_pre_ping=True` should be added for the Postgres path; without it a
  pooled connection killed by the tunnel is handed to the next caller dead.

### 0.F.5 — Config and secrets

**`release-compose DATABASE_URL` — confirmed.** `docker-compose.release.yml`
defines the backend service with `image:` but **no `DATABASE_URL` at all**, so it
silently falls back to `sqlite:///./local.db` — CWD-relative inside the
container, i.e. an ephemeral database that vanishes on recreate. Real bug, exactly
as the debt-log says.

**Env split by host:**

| Variable | cayde (app) | neo (worker) |
|---|---|---|
| `DATABASE_URL` | ✅ local postgres | ✅ tailnet host, `sw_worker` role |
| `ENVIRONMENT=cloud` | ✅ | ✅ |
| `AUTH_MODE=cloud` | ✅ | not read |
| `SESSION_COOKIE_SECURE=true` | ✅ | not read |
| `EMAIL_BACKEND=smtp`, `SMTP_*` | ✅ | not read |
| `PUBLIC_APP_ORIGIN` | ✅ | not read |
| `CORS_ORIGINS` | ✅ | not read |
| `EMBEDDED_WORKER` | `true` (cayde runs one) | n/a |
| `WORKER_ID` | derived | set explicitly per host |
| `TRUSTED_PROXY_IPS` (new, 0.F.2) | ✅ | not read |
| `SUPABASE_*` | per 0.E decision | no |

**Caveat:** `_enforce_cloud_secrets` fires on `ENVIRONMENT=cloud` and demands
`AUTH_MODE`, `SESSION_COOKIE_SECURE`, and SMTP — **none of which the worker
uses**. A worker container with `ENVIRONMENT=cloud` must therefore carry
otherwise-pointless auth/SMTP config just to boot. Phase 3 should scope the
validator to the API process (or make the worker set `ENVIRONMENT` differently),
otherwise `docker-compose.worker.yml` needs dummy SMTP credentials to start —
which is exactly the kind of papering-over the prompt asks about.

**On the `ENVIRONMENT=local` workaround:** it papered over TLS and SMTP only.
Re-reading `_enforce_cloud_secrets`, the four checks are Postgres, `AUTH_MODE`,
cookie-secure, and SMTP. Nothing else keys on `environment` for security. So
dropping the workaround is safe once real SMTP and `SESSION_COOKIE_SECURE=true`
are set — no hidden third thing.

**Secrets today** enter as inline env (`environment:` blocks, `${POSTGRES_PASSWORD}`
interpolation). Moving to file-based injection needs a `*_FILE` convention:
pydantic-settings has no built-in for it, so Phase 3 would add a small
`model_validator` reading `<VAR>_FILE` and overriding `<VAR>`. Worth doing for
`POSTGRES_PASSWORD`, `SMTP_PASSWORD`, and the worker's DB URL.

### 0.F.6 — Health surface

Current state:

- `GET /health` — liveness only, static `{"status": "healthy", "version": "2.0.0"}`.
- `GET /health/deep` — checks **data-dir writability** and **ortools import**.
  Notably it does **not** touch the database at all, so it reports `healthy` with
  Postgres completely unreachable. As a readiness probe under the target
  topology, it is misleading.

Missing entirely: DB reachability, schema currency (`alembic_version` vs head),
queue depth, oldest-queued-job age, per-worker last-heartbeat age.

**Minimum proposal** to satisfy "no worker has claimed anything in N minutes":

Extend `/health/deep` with a DB round-trip and `alembic_version` check, and add
`GET /health/queue` returning:

```json
{"queued": 0, "running": 1, "oldestQueuedAgeSeconds": 0,
 "workers": [{"workerId": "neo-1", "lastHeartbeatAgeSeconds": 3, "jobId": "..."}]}
```

All derivable from `solve_jobs` alone (`status`, `claimed_by`, `heartbeat_at`,
`created_at`) — one grouped query, no new table. The alert is then
`oldestQueuedAgeSeconds > N AND running == 0`, and per-worker staleness is
`lastHeartbeatAgeSeconds > job_lease_seconds`.

**Access control:** this endpoint exposes operational data and must not be public
under the tunnel. Simplest correct answer is to leave it off the tunnel ingress
entirely and scrape it over the tailnet.

**OTLP path:** neo already runs a SigNoz/OTLP collector. Least-effort wiring is
`opentelemetry-instrumentation-fastapi` + OTLP exporter pointed at the collector
over the tailnet, plus a tiny periodic gauge export for the three queue numbers.
Rule 1 requires this be **off by default** and enabled only when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set — local mode must not emit telemetry or
reach the network.

---

## 0.G — Docs inventory

### What documents install/operation today

| Doc | Covers | State under Section 2 topology |
|---|---|---|
| `docs/deploy/cloud.md` | The deployment guide | **Substantially stale.** Describes "director's laptop + Tauri sidecar + Supabase mirror" as *the* deployment story, and explicitly says running the backend on a cloud host "is no longer the deployment story" — which the tunnel topology reverses. Has an SP-CLOUD-1/2 warning block bolted on top, but the body still describes the old model. |
| `backend/README.md` | Dual-mode runtime, auth & tenancy env matrix | Authoritative for env vars; needs the tunnel ingress + `TRUSTED_PROXY_IPS` + worker-role sections. Prompt asks for this update explicitly. |
| `docs/getting-started/running-locally.md` | Local dev | Fine; `install-local.md` should link it rather than duplicate. |
| `docs/how-to/*.md` (8 files) | All *extension* guides (add-a-module, add-an-api-endpoint, wire-a-seam, …) | **No install or operations how-to exists at all.** All four Phase 4 docs are net-new. |
| `docs/architecture/quality-attributes.md`, `backend-structure.md` | Reference prose mentioning deploy | Minor updates. |

**Phase 4 creates:** `install-local.md`, `install-selfhost.md`, `add-a-worker.md`,
`operations.md` — all four new.
**Phase 4 updates:** `backend/README.md`, `docs/deploy/cloud.md` (rewrite or
supersede — my recommendation is to make it a pointer to the new how-tos rather
than maintain two overlapping deployment narratives), `docs/how-to/index.md`
(nav), and `docs/.vitepress/config.mts` (sidebar entries).

### Gate mechanics (so Phase 4 keeps them green)

- **`npm run docs:build`** → `vitepress build docs`. VitePress fails the build on
  **dead internal links**. Every relative link in the new pages must resolve to a
  real file, and new pages must be reachable from the sidebar in
  `docs/.vitepress/config.mts`. Note the CLAUDE.md-recorded hazard: pages
  excluded via `srcExclude` **cannot be linked to** — linking one is a build failure.
- **`npm run docs:freshness`** → `scripts/docs-freshness.mjs`, advisory (flags
  docs lagging code), not a hard gate. New docs start fresh by definition.

I have not yet read `docs-freshness.mjs` to confirm exactly what it keys on
(git mtime vs a front-matter stamp); I will before writing Phase 4 so the new
pages are stamped correctly. Marking that as **unverified** rather than guessing.

---

## Summary of decisions and corrections

**Blocking on you:**

1. **0.A** — Option 1 (fast-forward `main`, keep as trunk, recover `LICENSE`)?
2. **0.E** — Mirror (a), (b), or (c)? And: has the mirror ever been used for a
   real recovery?

**Corrections to the program prompt (no rule conflicts, but scope changes):**

- **0.F.1 predicted a defect; there is none.** No scheme sniffing exists; the
  cookie flag is already config-driven. The real 0.F.1 work is just uvicorn
  `--proxy-headers` scoping.
- **Revoke-pending-invite already exists** (`DELETE /invites/{token}`). Phase 1
  drops from six operations to five.
- **Membership revocation is already immediate** — no cache exists. Phase 1's
  "invalidate any membership caching" is a no-op; it needs a pinning test instead.
- **Display tokens are already uniform** — 0.C's display work is assessment-only,
  no fix needed.
- **0.E is worse than assumed:** Supabase RLS policies are entirely unversioned
  (hand-applied, not in the repo) and their auth basis was removed with Supabase
  Auth. Their current effect cannot be verified from the tree.
- **New finding not in the prompt:** `_enforce_cloud_secrets` will force the neo
  worker container to carry meaningless SMTP/auth config just to boot under
  `ENVIRONMENT=cloud`. Needs scoping in Phase 3.
- **New finding not in the prompt:** `/health/deep` never touches the database,
  so it reports healthy with Postgres down — actively misleading as a readiness
  probe in the target topology.

**No ABSOLUTE RULE conflicts found. No STOP conditions triggered** — in
particular, 0.F.4's identity-table check came back clean.
