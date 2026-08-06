# SP-CLOUD-4 Phase 0 — Concurrency Audit

**Branch:** `dev/cloud-concurrency` · **Status:** Phase 0 complete, awaiting confirmation
**Reproduction:** `products/scheduler/tests/test_concurrent_state_writes.py` (commit `f5a297f`, 3 failing by design)

---

## Headline

The suspect named in the brief is confirmed, and it is worse than "one debounced
PUT is risky": **`PUT /tournaments/{id}/state` is the only unversioned
whole-object write left in the codebase, and it carries essentially the entire
product.** Config, roster, groups, matches, schedule, bracket roster and the
plan-finalized flag all travel in one blob on a 500 ms debounce.

Three optimistic-concurrency mechanisms already exist here — and they disagree
with each other. This slice should converge them, not add a fourth.

---

## 0.A — Write-path inventory

62 write operations in the OpenAPI schema. Grouped by verdict; the full
enumeration is reproducible with `app.openapi()`.

### AT RISK

| Path | Shape | Granularity | Client | Loss window | Told? |
|---|---|---|---|---|---|
| `PUT /tournaments/{id}/state` | whole blob | **everything**: config, groups, players, matches, schedule, scheduleIsStale, scheduleVersion, scheduleHistory, bracketPlayers, bracketRosterMigrated, planFinalized | debounced **500 ms**, hydrate-once | total — the loser's every field reverts | **no, 200** |
| `POST /bracket/results` | intent + **optional** `seen_version` | one match result | immediate | none *if* the caller sends `seen_version`; unguarded if omitted | 409 only when sent |
| `POST /state/restore/{filename}` | whole blob | everything | explicit user action | total — restores over concurrent edits | no |

### SAFE, and why

| Path(s) | Why |
|---|---|
| `PUT /match-states/{match_id}` | **`If-Match` required**, checked against `matches.version`; 412 on missing *or* stale. Fail-closed — a caller that omits the header is rejected. |
| `POST /tournaments/{id}/commands`, `POST /bracket/commands` | Idempotent intent-based commands keyed by `command_id`; replays return the original outcome. Intents don't clobber. |
| `PATCH /tournaments/{id}` | Genuine field-level partial — only keys present in the body are assigned. Two editors touching different fields cannot conflict. |
| `PATCH /tournaments/{id}/modules/{module_id}` | One row per module, field-level, invariant-guarded server-side. |
| `PATCH|DELETE /members/{user_id}`, `/members/me`, `/transfer-ownership` | Row-scoped, guarded by the `MEMBER_LAST_OWNER` invariant, which is enforced server-side rather than by client state. |
| `POST /invites`, `DELETE /invites/{token}`, `POST /invites/{token}/accept` | Append-only / single-row lifecycle with a server-side existence check. |
| `POST /display-token/rotate` | Single-column overwrite whose whole purpose is last-write-wins. |
| `POST /state/backup` | Append-only. |
| Solve rail (`POST /solve-jobs`, `/cancel`) | Idempotency keys + partial unique index + lease guards. Already the reference pattern. |
| `/schedule`, `/schedule/repair`, `/schedule/warm-restart`, `/schedule/stream`, `/schedule/validate` | 410 tombstones. Present in OpenAPI, not live. |
| `/auth/*` | Per-user rows; no shared-document semantics. |
| Display module | Read-only. Its only write is the operator-side token rotate above; the public `/display/{token}/*` routes are strict projections. **Confirmed it cannot write.** |

### Deliberately noted, not classified

`POST /bracket/assign|unassign|pin|match-action|schedule-next/commit` and the
bracket event CRUD are the known 2.5 s-polling debt. They are **not** whole-blob
writes — each is a narrow, targeted mutation — so they are not lost-update
sources in the §2 sense. The polling debt is a staleness/UX problem, not a
silent-data-loss problem. Out of scope per Non-Goals; unchanged by this audit.

---

## 0.B — The reproduction

`products/scheduler/tests/test_concurrent_state_writes.py`, three tests, all
failing as intended:

```
LOST UPDATE: the tablet's roster addition vanished. players=['Alice'].
             The laptop's PUT returned 200 with no warning.
LOST UPDATE: the laptop's court-count change was reverted to 4 by the
             tablet's stale blob.
A write based on a superseded revision was accepted with 200.
```

**The loss is total, not partial.** `useTournamentState.snapshot()` sends every
persisted field on every save, so the losing writer doesn't lose only the field
it touched — it loses every field the winner had changed since it loaded.

Two aggravating factors found in the tree, both worse than the brief assumed:

1. **The client never refetches.** `useTournamentState.ts:74` — *"only a 409
   re-hydrates."* There is currently no 409 on this path, so in practice a tab
   hydrates once at page load and its copy is stale for the entire session.
   The loss window is not the 500 ms debounce; it is *hours*.
2. **The debounce coalesces.** A tab that changed five things over a minute
   sends one PUT carrying all five plus its stale view of everything else.

The existing `CONFIG_LOCKED` / `ROSTER_LOCKED` guards on this route do **not**
help. They compare prior-vs-incoming to protect a *committed schedule* from
config drift. They say nothing about *who last wrote*, and both tabs in the
reproduction pass them cleanly.

---

## 0.C — Per-path recommendation

| Path | Recommendation | Notes |
|---|---|---|
| `PUT /state` | **Both: narrow it AND version it** | See below — this is the substance of Phase 1. |
| `POST /bracket/results` | **Version check — make `seen_version` required** | It is currently `Optional` with legacy callers "keeping the un-guarded behavior". That is a fail-**open** guard: the protection is opt-in, so any caller that forgets is silently unprotected. Contrast `_enforce_if_match`, which rejects a *missing* header. Small change, real risk reduction. |
| `POST /state/restore` | **Accept, with reason** | Restore is an explicit, deliberate, destructive operator action against a named snapshot. Last-write-wins is the correct semantic. Worth a confirmation surface, not a version check. |

### Why `PUT /state` needs both halves

Rule 3 says narrowing beats conflict machinery, and it is right — but narrowing
alone cannot close this. The blob's fields are not independent: `schedule`,
`scheduleIsStale` and `scheduleVersion` must move together, and the
`CONFIG_LOCKED` guard is defined as a *relation* between incoming config and
persisted schedule. Splitting into per-field PATCHes would either fragment those
invariants across requests or require a transaction spanning them.

The tractable narrowing, in descending value:

1. **`players` / `bracketPlayers` → their own endpoint.** This alone kills the
   §2 tournament-day scenario, because roster and court settings stop sharing a
   request. Highest value, most contained.
2. **`planFinalized` → already has a dedicated POST.** It rides along in the
   blob purely so Pydantic defaults don't reset it. Once the blob stops being
   whole-object, drop it from the snapshot.
3. **`config` stays whole-object** and gets the version check — it is small,
   single-surface, and entangled with the schedule guards.

So: narrow the roster out, version what remains.

---

## 0.D — Mechanism

**Recommendation: `If-Match` / `ETag`, extending the convention `match_state.py`
already ships — but returning 409-with-body rather than a bare 412.**

### The codebase already has three conventions

| Where | Mechanism | Failure code | Enforcement |
|---|---|---|---|
| `PUT /match-states/{id}` | `If-Match` header vs `matches.version`, `ETag` on response | **412** | fail-closed (missing header rejected) |
| `POST /bracket/results` | `seen_version` field in the DTO | **409** `stale_version` | **fail-open** (optional) |
| Proposal commit | `scheduleVersion` int inside the state blob | 409 | scoped to schedule commits only |

A fourth would be indefensible. `If-Match` is the right one to standardise on:
it is the HTTP-native form, it is already fail-closed, it keeps the concurrency
token out of the resource body, and it has a working client-side counterpart
(`MatchVersionMismatch` in `client.ts:199`).

### Reconciling with Rule 4 — a genuine conflict to resolve

**Rule 4 mandates 409 carrying current server state. The existing `If-Match`
prior art returns a bare 412.** These cannot both be followed without a choice.
Strict HTTP semantics favour 412 for a failed precondition; the brief's Rule 4
and the frontend's existing inline-409 idiom favour 409.

**Proposed:** use `If-Match` as the *transport*, but answer a version mismatch
with **409 + `STATE_VERSION_CONFLICT` + the current state in the body**, per
Rule 4. Reserve 412 for a *missing or malformed* header — a client bug, not a
user-facing conflict. This satisfies Rule 4, keeps a meaningful 412, and leaves
`match_state`'s existing behaviour untouched (its 412-on-stale is already
covered by tests and by the `MatchVersionMismatch` client class; changing it is
out of scope and would be a breaking API change for a working path).

**Flagging for your call:** this leaves 412-on-stale in `match_state` and
409-on-stale in `/state`. That is deliberate but it is still two behaviours. The
alternative — migrating `match_state` to 409 too — is a breaking change to a
shipped, tested path and is not in this slice's scope. I recommend divergence
now plus a debt-log entry, but you may prefer full convergence.

### Naming trap — do not call it `version`

Three near-collisions already exist on this exact object:

- `TournamentStateDTO.version` — the **schema** version (currently 2)
- `Tournament.schema_version` — the column mirroring it
- `TournamentStateDTO.scheduleVersion` — the proposal-commit counter

Proposed: column `tournaments.state_version`, error code
`STATE_VERSION_CONFLICT`, ETag value the bare integer (matching
`match_state`'s `"<n>"` form).

### On `version_id_col` (brief §4)

The brief anticipates that `version_id_col` may already be in play. **It is
not** — `grep` finds no `__mapper_args__` and no `version_id_col` anywhere in
`database/models.py`. The three existing `version` columns (`matches`,
`bracket_events`, `bracket_matches`) are maintained by hand.

The brief's §4 point stands and is worth restating because it is the subtle
half: `version_id_col` would only protect two *server-side transactions*
racing. It does nothing for the actual §2 scenario, where a human holds a stale
copy across minutes. **Cross-request checking is the load-bearing mechanism
here; `version_id_col` is defence-in-depth.** Given that the single writer of
`row.data` is `commit_tournament_state` and every caller is request-scoped, I'd
add `version_id_col` for the tournaments mapper but treat it as secondary.

Both dialects: an integer column plus a compare-and-swap `UPDATE ... WHERE
state_version = :seen` behaves identically on SQLite and Postgres. No dialect
-specific SQL, no `RETURNING`, no advisory locks.

---

## 0.E — Local-mode impact (Rule 1)

**Verdict: inert for a solo operator, with one specific hazard that must be
handled in Phase 2 or Rule 1 breaks.**

Good news first — the only writer of `tournaments.data` is
`repositories/local.py:205`, reached solely through `commit_tournament_state`,
and every one of its callers is request-scoped:

- `api/tournaments.py:393` — create/seed
- `api/tournaments.py:682` — `PUT /state`
- `api/schedule_proposals.py:238` — proposal commit

**The async solve worker does not write the blob.** Solve results land in
`solve_jobs`; the client commits them. So there is no background writer to bump
the version under an idle operator — the core Rule 1 risk is absent.

### The hazard: proposal commit bumps the version server-side

`POST /schedule/proposals/{id}/commit` writes the blob in-request. A solo
operator would then hold a stale version through no fault of their own, and
their **next debounced PUT would 409** — a spurious conflict, exactly what
Rule 1 forbids.

It is fixable and the fix is already half-built: `useProposals.ts:219-226`
already applies the commit response back into the store field-by-field
(`setSchedule`, `setScheduleVersion`, `setScheduleHistory`, `setConfig`).
**Phase 2 must add the new state version to that list.** Any server response
that rewrites the blob must feed its new version back, or solo mode breaks.

Same requirement applies to `POST /plan-finalized` and any future blob writer —
worth stating as a rule in the how-to guide rather than as three patches.

### The two scenarios the brief asks about

- **Edit → offline → resume.** No spurious conflict. The version only advances
  when a write commits; an offline client's copy stays valid because nothing
  else wrote. On reconnect its PUT carries a still-current version.
- **Page reload mid-edit.** Safe: reload re-hydrates via GET and picks up the
  current version. In-flight local edits are lost to the reload itself — that
  is existing behaviour, unchanged by this slice.

---

## 0.F — Conflict observability

`/health/metrics` states its design rule in its own docstring: *"No new table
and no new bookkeeping: every number here is derivable from columns the queue
already maintains."*

A conflict is an **event**, not a state, so it is not derivable from any column
— honouring that rule literally would mean not counting conflicts at all.

**Proposed:** a process-local in-memory counter exposed under a `conflicts` key
on `/health/metrics` — `{total, byPath}` since process start, alongside a
`lastConflictAt`. No table, no migration, no new dependency, consistent with the
existing surface being ops-token-gated.

Tradeoff, stated plainly: **it resets on restart and is per-process**, so in a
multi-container cloud deployment you get per-instance counts, not a fleet total.
That is acceptable for the stated purpose — the brief wants a *design signal*
("is this surface conflicting a lot?"), not billing-grade accounting. Persisting
conflicts to a table would be the alternative and I don't think it earns its
migration here.

Also recommend a structured `log.warning` per conflict with the path and both
versions, since the log is what you'll actually read when diagnosing a report of
"my change vanished."

---

## Rule conflicts and open items

1. **Rule 4 (409 + state) vs. shipped `If-Match` prior art (bare 412).**
   Resolution proposed in 0.D; needs your sign-off because it deliberately
   leaves two behaviours in the tree.
2. **Prerequisite not met:** the brief says `dev/cloud-audit-fixes` is "merged
   and tagged". It is merged (`main` @ `14fb182`) but **no SP-CLOUD-3 tag
   exists** — `git tag` shows only `v0.1.0`, `pre-refactor-20260630` and two
   archive tags. I did not invent a tag name. `dev/cloud-concurrency` was
   branched from `main` at the merge commit, which is the intended point.
3. **`seen_version` is fail-open.** Not strictly in scope, but it is an
   optimistic-locking guard that silently does nothing when omitted, which is
   the same class of defect as this slice. Recommend making it required in
   Phase 1; flag if you'd rather it stay put.
4. **Phase 0 leaves the backend suite red** by design (3 failing). The gate will
   not be green again until Phase 1 lands.

---

## Recommended Phase 1 order

1. `tournaments.state_version` column + migration (both dialects, downgrade).
2. Single conflict seam: `StaleDataError` and version mismatch → 409 +
   `STATE_VERSION_CONFLICT` + current state.
3. `If-Match` on `PUT /state`; `ETag` on `GET /state` and on the PUT response.
4. Narrow the roster out of the blob (the 0.C item that kills the §2 scenario).
5. Make `seen_version` required on `/bracket/results`.
6. Conflict counter on `/health/metrics`.
7. Rule 3b negative controls for each new safety test, recorded in the ledger.
