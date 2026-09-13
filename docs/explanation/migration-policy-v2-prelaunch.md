# ShuttleWorks — Schema Migration and Versioning Policy v2 (Pre-Launch)

**Date:** 2026-09-12 · **Status:** proposed · **Supersedes:** `migration-and-versioning-policy.md` §2.2, §2.3, §2.6 until GA; the rest of that document is parked as the post-GA policy (§5 below)
**Premise (owner's directive):** the product has no external users. Every backwards-compatibility mechanism that exists today is technical debt. Until the first tagged GA release, the schema policy is **latest version only**.
**Grounded in:** `apps/api/src/alembic/` (45 revisions, 4,360 lines), `core/main.py` (`_run_migrations`, `lifespan`), `sync/compatibility.py`, `docs/reference/compatibility-matrix.{md,json}`, `db/blob_version.py`, `tests/backend/_helpers.py` (`create_all`), `tools/fixture-up.sh`, `.github/workflows/ci.yml`, ADR 0021/0023/0024

---

## 1. What industry practice says

**Squash before you have users.** The Alembic maintainer's own recipe for collapsing history is to autogenerate a fresh baseline from the models at the cut point, splice it in with the old revision's id, and delete everything before it; he adds that heavy data migrations are better kept as scripts outside the revision tree entirely (Alembic discussion #1259). PyPI's Warehouse opened the same discussion at 246 sequential migrations because test setup replayed all of them, and named the one real cost: losing the ability to roll back to intermediate states, mitigable by choosing the cutoff (Warehouse issue #17590). SecureDrop made "squash between releases" a written policy (securedrop-docs issue #47). You are at 45 revisions with zero external databases; the cost side of that trade is currently zero.

**Forward-only is the modern default.** Stack Overflow's deployment writeup is the usual reference for forward-only migrations with no rollback scripts (cited by sqlite-forward-migrations). A recent public-sector Postgres project deferred writing down-migrations with the rationale that modern practice fixes a broken migration with a new forward one, that a parallel down tree doubles review burden and is rarely used in incidents, and that production rollback is base-backup plus PITR (GitLab canopy issue #345). Redgate's guidance is that once data has changed since a release, roll forward rather than back (Redgate, "Rolling back"). The HN summary is blunter: rollbacks work for easy changes and cannot work for the hard ones like dropping a field (Hacker News, Database Migrations thread). → §2.3.

**Drift detection belongs in CI.** Alembic ships `alembic check`, which runs the autogenerate comparison without writing a file and returns a non-zero code if a revision would be needed; the docs say outright it can be worked into CI to ensure incoming code does not warrant new revisions (Alembic docs, Auto Generating Migrations). Airflow filed the same as a CI task (apache/airflow #48998). → §3, M-3.

**Expand/contract is for later.** The pattern exists to ship large changes in small steps under immutable, forward-only migrations with zero downtime (Medium, Fluri). Zero downtime is a post-GA requirement. → §5.

---

## 2. Policy (in force until the GA tag)

### 2.1 One schema, one version
The schema is whatever `main` says it is. There is no supported older schema, older blob version, or older wire version. A database that is not at head is reset, not migrated across a gap.

### 2.2 Migrations are direct
Destructive changes (drop, rename, tighten NOT NULL, tighten CHECK) are written in the same revision as the change that needs them. No expand/contract, no dual-write, no parity tests between old and new paths. Data conversion that a change needs is done inside the revision, in Python, against the tables as they are at that revision.

The schema plan collapses accordingly: Phase 1 (registration cleanup) and Phase 2 (competition tables) stay as written; Phase 3's dual-write becomes a direct cutover of the commit seam in one PR with the Phase 4 consumer switch; the separate contract release disappears.

### 2.3 Forward-only
Every new revision's `downgrade()` is `raise NotImplementedError("forward-only until GA")`, set by the template. Existing downgrades disappear with the squash (§3, M-1). "Undo" in development is `make fixture-up` (re-seed from the simulator). "Undo" on the demo host is `make demo-rebuild`. There is no other undo, and no database exists that needs one.

### 2.4 Failure is loud
`_run_migrations()` failing at startup currently logs `alembic_upgrade_failed — continuing`. Pre-launch, a migration failure exits the process non-zero. A container that starts on a half-migrated schema is worse than one that does not start.

### 2.5 Keep the two cheap safety nets
- Pre-migration file copy on SQLite (`data/backups/pre-migration-<rev>-<ts>.db`, keep five). Costs one file copy; saves an afternoon when a direct migration is wrong.
- `PRAGMA foreign_key_check` after upgrade, refuse to start on rows. FKs are OFF during migration by design (`env.py`); this is the only thing that proves the result is consistent.

### 2.6 Compatibility windows are zero
- **Wire schema:** `SUPPORTED_OPERATION_SCHEMA_VERSIONS` and `SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS` become `(1,)`. The mechanism (allow-list, quarantine of unknown versions, `event_node/update.py` reporting) stays: it is small and correct. The fixtures for versions 1–3 and the `repositoryPolicyCases` in `compatibility-matrix.json` go; the matrix `policy` field reads `"current-only-until-ga"`. The version counter restarts at 1 because nothing on the wire has ever left the building.
- **Tournament blob:** `CURRENT_TOURNAMENT_SCHEMA_VERSION` resets to 1; `VersionedJSON` keeps refusing newer-than-code blobs and now also refuses older ones. A blob at any other version means a stale dev database; reset it.
- **ADR 0024's N-2 window** is amended to say: activates at GA. Until then, current-only. The immutable-tag and CI-gate parts of 0024 stay in force; they are not compatibility machinery.

### 2.7 Tests build the schema the way production does
`tests/backend/_helpers.py` builds schema with `Base.metadata.create_all`. `models.py` records the consequence: an orphaned entry was representable in every test while raising `IntegrityError` in production. After the squash there is one revision, so `alembic upgrade head` in test setup costs the same as `create_all`. Switch it. `tools/fixture-up.sh` already does `upgrade head` then `alembic check`; the unit tier should match the e2e tier.

### 2.8 Writing a revision (unchanged where it was already good)
First docstring line: change class (`additive | destructive | data | constraint`) and the ADR or ruling. Batch-altered tables named. Constraint additions scan first and abort with the offending keys; never delete to satisfy a constraint. Backfills idempotent. Named constraints. No `pass` downgrades.

---

## 3. Defined plan

### M-1 Squash to a single baseline
1. On a branch from `main`: `alembic revision --autogenerate -m baseline` against an empty SQLite database. Review the generated file line by line against `models.py`; autogenerate misses named CHECK constraints unless `compare_type`/check rendering is enabled, and it does not emit triggers or partial-index predicates as intended, so copy those from the current revisions (`z0f5a1b3c9d2` for checks, `_ACTIVE_SOLVE_JOB_PREDICATE` for the partial index, `y9e4f0a2b7c8` for the person-key index) into the baseline by hand.
2. Delete `alembic/versions/*` except the baseline. Set `down_revision = None`. Delete `u5f0b4d7e2a3`'s orphan purge entirely; it exists to repair databases that predate FK enforcement, and none will exist.
3. Delete the tests that pin intermediate revisions: `test_sync_migration.py`, `test_check_constraints_migration.py`, `test_short_reference_migration.py`, `test_person_key_migration.py` (1,148 lines with the compat test). Their surviving claims (a check constraint exists, a unique index exists) move into a single `test_baseline_schema.py` that asserts against a freshly upgraded database.
4. Run `alembic upgrade head` on an empty DB, then `alembic check` — must be clean. Run `pytest tests/backend` — green. Run `tools/fixture-up.sh` — green.
5. Reset every existing database: dev laptops (`make fixture-up`), demo host (`make demo-rebuild`), CI (fresh per run already). Document the one-line reset in `docs/how-to/`.

*Accept:* `ls alembic/versions | wc -l` is 1; `alembic check` clean; both test tiers green from an empty database.

### M-2 Forward-only template and loud startup
- `alembic/script.py.mako`: `downgrade()` body is the `NotImplementedError` raise; docstring stub has the class line.
- `core/main.py`: `_run_migrations()` failure re-raises after logging; lifespan does not continue. Add the pre-migration copy and the post-migration `foreign_key_check` around `command.upgrade`.

*Accept:* a deliberately broken revision on a branch makes the container exit non-zero; the backup file appears; a seeded FK violation blocks startup.

### M-3 Drift gate in the backend CI job
Add to the Backend job, before pytest: `alembic upgrade head` on a temp SQLite URL, then `alembic check`. Airflow-style: a PR that changes `models.py` without a revision fails here, not at fixture time.

*Accept:* a PR that adds a column to a model without a revision fails CI at this step.

### M-4 Tests build via Alembic
`tests/backend/_helpers.py`: replace `create_all` with `command.upgrade(cfg, "head")` against the test engine. Delete the `models.py` comment about representable orphans once green.

*Accept:* pytest green; a test that inserts an orphaned entry now raises `IntegrityError`.

### M-5 Collapse compatibility
- `sync/compatibility.py`: supported tuples → `(1,)`; `CURRENT_* = 1`.
- `tests/backend/fixtures/sync_compatibility/`: keep one checkpoint and one operation fixture at version 1; delete the rest.
- `docs/reference/compatibility-matrix.json`: `policy`, `current`, `supported` → current-only; `repositoryPolicyCases` → the single current/current case. Regenerate `compatibility-matrix.md` from it (or edit to match).
- `db/blob_version.py`: `CURRENT_TOURNAMENT_SCHEMA_VERSION = 1`; `process_result_value` raises on `stored != self.version`.
- `test_sync_compatibility.py`: rewrite to assert the single-version allow-list and that version 2 is quarantined.
- ADR 0024: add an "Amended 2026-09-xx" paragraph: window activates at GA; until then current-only.

*Accept:* grep for `previous-1`, `previous-2`, `(1, 2, 3)` across `apps/api`, `docs/reference`, `tests` returns nothing.

### M-6 Apply to the schema work
With M-1…M-5 merged, the schema plan runs as three direct PRs:
1. Registration cleanup (invitation table, `submissions.status`, `payments`, `player_representatives`, `entry_events` code uniqueness). One revision, destructive where needed (drops `partner_*`, `paid_at`, `payment_note` in the same file after copying).
2. Competition tables + roster trigger + `state_transitions`. One revision, additive.
3. Bind seam + consumer switch. One revision that drops `committed_player_id`, `bracket_event_id`, `meet_event_id` after the seam is live, plus the code change, in one PR.

Each PR: `alembic check` clean, both test tiers green from empty, demo host rebuilt.

### M-7 Order
M-1 first (everything else assumes one revision). M-2, M-3, M-4 together. M-5 in parallel. M-6 after all.

---

## 4. What is deliberately kept

- Immutable image tags and the CI-verified release gate (ADR 0024). Not compatibility; provenance.
- The wire-schema allow-list and quarantine mechanism. Small, correct, and the thing the N-2 window will re-activate against.
- `VersionedJSON`. The rule that blobs carry a version is right; only the window changes.
- The revision docstring discipline. It is better than most codebases'.

---

## 5. What activates at GA (parked, not deleted)

The v1 policy's §2.2 (expand → migrate → contract at N+3), §2.3 (no migration under an active authority epoch; nodes upgrade between epochs), §2.6 (blob and wire windows, semver rules), and the round-trip harness with per-release fixture databases. ADR 0024's window returns to current-plus-two. The trigger is the first semver tag that an external organization installs. Writing it down now means GA is a switch, not a scramble.

---

## 6. Rulings

1. Confirm the premise: no database outside the repo owner's control exists, including the public demo. (If one does, it is the first customer and this policy does not apply to it.)
2. Wire and blob versions restart at 1 (recommended) or keep 3/2 with a single-element window. Restarting is cleaner; keeping avoids touching fixture filenames.
3. GA definition: first external install, or first semver tag? Recommended: first external install.
4. Pre-migration backup and FK check: keep (recommended, §2.5) or drop with the rest.
