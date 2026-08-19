# SP-CLOUD-3 / 0.E — Supabase Mirror Removal Inventory

_Date: 2026-08-04. Branch: `dev/cloud-hardening` @ `600c7a1`._
_Status: **Phase 0 complete — awaiting sign-off.** No code changed._

---

## 0. Postgres test-leg question (asked in the prompt's verification gates)

**Answered, and the dual-dialect guarantee is intact.**

- All 36 extra local skips report exactly `TEST_POSTGRES_URL not set`, every one
  in `tests/unit/test_solve_jobs.py`.
- **CI does set it** — `.github/workflows/ci.yml` runs a `postgres:16-alpine`
  service on 5433 and passes
  `TEST_POSTGRES_URL: postgresql://scheduler:scheduler@localhost:5433/scheduler`
  to the pytest step. The dual-dialect leg runs on every PR and push.
- Verified locally rather than inferred: re-ran the full suite against a real
  Postgres 16 → **935 passed, 1 skipped**. The single remaining skip is the
  by-design one (`test_solve_jobs.py:286: postgres-only concurrency semantics`).
- The arithmetic reconciles exactly: documented baseline 925 + 10 tests added
  this session (4 client-IP, 6 invite-oracle) = **935**. Nothing regressed and
  nothing silently stopped being tested.

**Post-removal expectation:** 935 − (the deleted mirror tests, see §7) and the
baseline should be restated in the ledger so the next session doesn't read the
drop as a regression.

---

## 1. Database

**Model:** `SyncQueue`, `backend/database/models.py:269–310`.
Table `sync_queue`. Columns: `id` (Uuid PK, app-side default), `entity_type`
(String(20)), `entity_id` (String(100)), `payload` (portable `JSON`, not JSONB),
`created_at` (DateTime tz), `attempts` (Integer), `last_attempt` (DateTime tz
nullable).

**Indexes:** none beyond the primary key.
**FKs:** **none in either direction.** `entity_id` is a loose `String(100)`
precisely so it can hold both UUID-shaped tournament ids and String-shaped match
ids. Nothing references `sync_queue`; `sync_queue` references nothing.

*This is the single most important structural fact in the inventory:* the drop
migration has no dependency ordering to respect and cannot cascade.

**Exports:** `backend/database/__init__.py` lines 14 and 28 re-export `SyncQueue`
in the module's `__all__`.

**Creating migration:** `e2a5f3b8c1d6_step_e_sync_queue.py`.
**Current head:** `o8f2a6b0c4d5` — confirmed, not assumed: no file in
`alembic/versions/` carries `down_revision = "o8f2a6b0c4d5"`. The drop migration
lands directly on it.

---

## 2. Write path — the risky part (Rule 2)

**11 enqueue call sites, all in `backend/repositories/local.py`.** No other module
enqueues.

| Line | Method context | Entity |
|---|---|---|
| 218 | tournament upsert | `tournament` |
| 354 | match upsert | `match` |
| 457 | bulk match apply (loop) | `match` |
| 555, 596, 618 | bracket event create/update | `bracket_event` |
| 640 | bracket event delete | `bracket_event_delete` (tombstone) |
| 701 | participants bulk insert (loop) | `bracket_participant` |
| 776, 815 | bracket match write | `bracket_match` |
| 1023 | bracket result upsert | `bracket_result` |
| 1952 | command apply | `match` |

**Transaction semantics — identical at all 11 sites:**

```python
self.session.flush()                    # materialise ids/version for the payload
SyncService.enqueue_*(self.session, …)  # session.add(SyncQueue(...)) — never commits
self.session.commit()                   # commits primary write AND outbox row together
```

Every `enqueue_*` in `sync_service.py` is a `session.add(row)` with an explicit
"Caller commits" docstring. **No enqueue opens, commits, or rolls back a
transaction.** Removal deletes one `session.add` per site and leaves the commit
boundary, ordering, and error propagation untouched.

**Rule 2 verdict: NO entanglement, NO STOP condition.** The removal is
subtractive at every site.

**One judgment call I want on the record.** The `flush()` calls exist *solely* to
materialise generated ids and the incremented `version` before the outbox payload
is serialised — the comments say so explicitly. With the outbox gone they are
redundant, because `commit()` flushes anyway.

I propose **keeping them**, for two reasons:

1. `flush()`-then-`commit()` is semantically identical to `commit()` alone, but
   not *observationally* identical: an `IntegrityError` would surface from
   `flush()` rather than `commit()`. Rule 2 says "same error propagation," and
   keeping the flush is the provably-zero-change option.
2. They are the injection point the two atomicity tests need (§7).

The comments that reference Supabase get rewritten to explain the retained
purpose. If you'd rather see them go, it's a one-line-per-site follow-up; I'd log
it to the debt-log rather than fold it into a removal commit.

**Special case, line 640 (bracket event delete):** the enqueued row is a
*tombstone* whose only job was to make Supabase issue a matching DELETE. It has
no local effect whatsoever. After removal the method is
`session.delete(row); flush(); commit()` — local behavior unchanged.

---

## 3. Service layer and background drain

- **`backend/services/sync_service.py`** — the whole module. Contains
  `SyncService` (thread-based daemon), the seven `enqueue_*` staticmethods,
  `flush_queue()`, the Supabase client construction, and `_*_to_payload`
  serialisers.
- **Lifespan hook, `backend/app/main.py:105–113`** — constructs `SyncService`,
  stashes it on `app.state.sync_service`, and starts the thread **only when
  `supabase_url` and `supabase_anon_key` are both non-blank**. Since both are
  blank everywhere in the tree, the drain thread has never started.
- **Shutdown, `backend/app/main.py:142–143`** — `sync_service.stop()`.
- **Nothing depends on `SyncService`** other than the 11 call sites and the
  lifespan hook. Two other modules *mention* it only in prose comments —
  `services/solve_worker.py:13` ("Thread-based like `SyncService`") and
  `services/solve_jobs.py:6` — which describe the solve rail by analogy. Those
  comments need rewording, not code changes.
- `repositories/base.py:86` mentions "sync layers" in a docstring — prose only.

---

## 4. The seven entity types

`tournament`, `match`, `bracket_event`, `bracket_match`, `bracket_result`,
`bracket_participant`, `bracket_event_delete`.

**Confirmed: none carries mirror-specific logic another feature relies on.** Each
`_*_to_payload` function is a private serialiser used only by its own
`enqueue_*`, and each `enqueue_*` is called only from `repositories/local.py`.
The dispatch in `flush_queue` (`sync_service.py:284–325`) is the only consumer.
The payloads are dead-ended — nothing else reads them.

---

## 5. Config

| Location | Content |
|---|---|
| `backend/app/config.py:29–30` | `supabase_url: str = ""`, `supabase_anon_key: str = ""` |
| `backend/app/config.py:4` | module docstring names `SUPABASE_URL` / `SUPABASE_ANON_KEY` |
| `backend/.env.example:21–27` | both keys, blank, plus a "cloud form" comment |
| `backend/.env` (untracked, local) | both keys, blank |
| repo-root `.env.example:24,28,51,52` | backend pair **plus** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (frontend vars, dead since SP-CLOUD-2 deleted `lib/supabase.ts`) |
| `products/scheduler/docker-compose.yml:14` | comment only, no env var set |
| `docker-compose.dev.yml` / `.cloud.yml` / `.release.yml` | **no `SUPABASE_*` at all** |
| `.github/workflows/*.yml` | **no `SUPABASE_*` at all** |

**`_enforce_cloud_secrets` does NOT validate either key.** SP-CLOUD-2 already
demoted them to mirror-only and removed them from the cloud validator — its
comment says so explicitly. So removing them cannot affect startup validation in
either mode.

---

## 6. Dependencies

`backend/requirements.txt:27` — `supabase>=2.0.0`. Installed version 2.31.0,
pulling **`postgrest`, `realtime`, `storage3`, `supabase-auth`,
`supabase-functions`, `yarl`, `httpx`**.

- After removing `services/sync_service.py`, **nothing imports `supabase`**
  (verified: the only `import supabase` / `from supabase` in the tree is inside
  that module).
- **`httpx` is safe** — it is an explicit direct dev dependency
  (`requirements-dev.txt:10`, used by `fastapi.testclient.TestClient`), so it
  survives on its own merit.
- The other six transitives are supabase-only and go with it.

**Stale comment worth noting:** `requirements.txt:23–24` justifies the dependency
as *"used by `app/dependencies.get_current_user` to verify the JWT on every
protected route."* That has been false since SP-CLOUD-2 retired Supabase Auth —
the real and only consumer today is the outbox.

---

## 7. Tests

**Delete outright (purely mirror):**

| File / test | Lines |
|---|---|
| `tests/unit/test_sync_service.py` | 364 |
| `tests/unit/test_sync_service_characterization.py` | 346 |
| `test_create_bracket_stages_sync_rows` (`test_bracket_routes.py:235`) | ~25 |
| `test_record_result_stages_result_and_match_sync_rows` (`test_bracket_routes.py:528`) | ~28 |

Plus the `- outbox: …` bullet in the `test_bracket_routes.py` module docstring.

**Preserve intent, substitute mechanism — the confusing-breakage category:**

`tests/test_tournaments.py:755` and `:976` monkeypatch
`SyncService.enqueue_tournament` to raise `RuntimeError("simulated failure
between mutation and commit")`.

These are **not mirror tests.** They are **atomicity** tests: they assert that a
failure between mutation and commit rolls the whole transaction back, so neither
the cleared schedule nor the edited config leaks. The outbox is merely a
convenient injection point that happens to sit in that window.

Deleting them would silently drop real atomicity coverage. Deleting only the
assertions is impossible — the mirror *is* the mechanism. So these two need a
replacement injection point in the same window. With the `flush()` calls retained
(§2), patching `Session.flush` to raise reproduces the exact scenario; the
assertions and the tests' names and docstrings stay as they are.

**False positives — no action:** `tests/unit/test_solve_worker.py` (17 hits) and
`tests/unit/test_solve_jobs.py` (2 hits) match on `enqueue_job`, the solve-job
fixture. Unrelated to the outbox.

---

## 8. Frontend

Small surface, and only one live item:

| Location | Nature |
|---|---|
| `src/products/settings/GlobalSettingsPage.tsx:297–299` | **Live UI** — a settings row labelled `'Supabase sync'` with `envVar: 'ENVIRONMENT=cloud + SUPABASE_URL'`. Must be removed. |
| `src/hooks/useBracket.ts:33` | Comment: "Realtime via Supabase `postgres_changes` remains a deliberate…" — reword. |
| `src/api/dto.generated.ts:1173` | A backend docstring echoed into generated output ("without a Supabase auth join"). Clears itself on regen once the backend docstring changes. |
| repo-root `.env.example:51–52` | `VITE_SUPABASE_*`, dead since SP-CLOUD-2. |

**No DTO shape changes** — the mirror was never on the wire, so `dto.generated.ts`
only changes if a backend docstring does. No API surface change.

---

## 9. Docs

Split deliberately into **living docs** (describe the current system — must be
corrected) and **historical records** (audits, plans, specs, changelogs — these
are dated accounts of what was true then and should NOT be retro-edited).

**Living — must update:**

- `docs/tech-stack.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/data-flow.md`
- `docs/architecture/backend-structure.md`
- `docs/architecture/quality-attributes.md`
- `docs/architecture/operational-scenarios.md`
- `docs/architecture/workspace-suite/backend-ownership-map.md`
- `docs/deploy/cloud.md` — heavily; the mirror is a load-bearing part of its
  narrative
- `docs/getting-started/what-is-shuttleworks.md`, `repo-layout.md`,
  `running-locally.md`
- `docs/glossary.md`, `docs/index.md`, `docs/api/index.md`
- `docs/decisions/0003-sqlite-as-primary-persistence.md` — an ADR that references
  the mirror; **supersede rather than edit** (ADRs are immutable records; the new
  ADR links back)
- `docs/architectural-roadmap.md`
- `products/scheduler/backend/README.md`, `products/scheduler/BACKEND.md`
- `CLAUDE.md` — the Data paragraph explicitly describes the outbox
- repo-root `README.md`

**Historical — leave alone:** everything under `docs/audits/` (except my own
09/10 which are current), `docs/superpowers/**`, `docs/changes/2026-05-13.md`,
`docs/audits/00-dependency-graph-baseline.json`.

**Debt-log entries this closes:** the mirror `org_id` gap and the stale-Supabase-RLS
entry. Both die with the subsystem.

**Note:** `docs/.vitepress/cache/**` matches the grep but is build cache, gitignored.

---

## 10. Recovery parity (Rule 3) — READ THIS BEFORE SIGNING OFF

`tournament_backups` ships `GET/POST /tournaments/{id}/backups` and
`POST .../backups/{filename}/restore` (`api/tournaments.py:706/720/736`), storing
a full JSON `snapshot` of tournament state with a synthetic filename.

**For the recovery need people actually have — "I made a mess, undo it" — backups
are strictly better than the mirror ever was.** They are point-in-time, restorable
in-product, and cover the whole tournament state. The mirror had no restore path
at all: it was a one-way push, nothing ever read from it, and there is no code
anywhere that could reconstruct a tournament from Supabase.

**But there is one dimension where they are not equivalent, and I don't want to
paper over it.** `tournament_backups` rows live in the **same SQLite database** as
the data they back up. If the disk or the laptop dies, the backups die with it.
The mirror, *had it ever been configured*, would have put a copy in a different
system in a different building.

So, stated plainly:

- **Capability actually removed today: none.** The mirror was never configured,
  the drain thread has never started, no project was ever populated, and no
  credential has ever existed. Its real-world durability contribution is zero,
  and zero is what backups also provide off-site. Nothing regresses.
- **Theoretical capability removed: off-site durability for local mode.** After
  this slice, a local-mode user who loses their disk loses everything, and the
  product will contain no mechanism that would have prevented that.

I do not think this blocks the removal — a never-configured, restore-less,
one-way push is not a backup, and keeping dead code does not protect anyone. But
Rule 3 made this an explicit STOP-and-report condition, so: **confirming this is
your call, not mine.** My recommendation is proceed, and let the Phase 4
`install-local.md` cover off-site durability honestly as an operator
responsibility (copy the SQLite file / the `data/` directory somewhere else),
which is a documentation answer rather than a code one.

---

## 11. Proposed removal order

Matches the prompt's sequence; the only refinement is where the suite runs.

1. **Write paths** — delete the 11 enqueue calls + the `SyncService` import in
   `repositories/local.py`; retarget the `flush()` comments. **Run the full
   backend suite here, in isolation**, before anything else moves. Expect exactly
   the 4 purely-mirror tests and the 2 atomicity tests to fail, and nothing else
   — any other failure means a transaction-semantics regression and is a STOP.
2. **Tests** — delete the 4; re-point the 2 atomicity tests at `Session.flush`.
   Suite green again here.
3. **Service + lifespan** — delete `services/sync_service.py`, the `main.py`
   start/stop hooks, the `SyncQueue` re-exports in `database/__init__.py`, and
   reword the two analogy comments.
4. **Migration** — drop `sync_queue` on `o8f2a6b0c4d5`, downgrade recreates it.
   Verify: fresh SQLite; fresh Postgres; upgrade a copy of the real
   `products/scheduler/data/local.db`; downgrade→upgrade round-trip.
5. **Model + config + dependency** — remove `SyncQueue`, both settings keys, all
   `.env.example` entries (backend + root, including the dead `VITE_*` pair), and
   `supabase>=2.0.0`.
6. **Frontend** — the `GlobalSettingsPage` row; reword `useBracket.ts`; regen
   `dto.generated.ts`.
7. **Docs + ADR** — living docs per §9; ADR superseding `0003`; close the two
   debt-log entries; restate the test baseline in `CLOUD_PROGRESS.md`.

Steps 1–2 are where Rule 2 is actually tested. Everything after is mechanical.

---

## 12. Rule conflicts

**None**, with the single qualification in §10 that Rule 3's parity assumption
holds for in-product recovery but not for off-site durability — reported above
for your explicit sign-off rather than resolved unilaterally.

`scheduler_core/` and `archive/` are untouched by every item in this inventory.
