# SP-B2 — Foreign-operator enablement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the foreign operator (Bracket on a Meet workspace / Meet on a Bracket workspace) usable by seeding it `available` instead of `coming_soon` — directly enterable via SP-B1's chrome and promotable to `enabled` via Settings — with no transition-rule or guard changes.

**Architecture:** Change `derive_modules` so the foreign operator is `available`; add an Alembic migration to flip existing persisted `coming_soon` meet/bracket rows to `available`; mirror the shape in the frontend `modulesForWorkspace`. The existing `available→enabled` PATCH transition does the rest.

**Tech Stack:** Python 3.11, SQLAlchemy 2.0, Alembic, FastAPI, pytest; React/TS/Vitest on the frontend.

## Global Constraints

- Branch `dev/workspace-suite`. `kind` preserved (identity + frontend chrome fallback); no route-path changes.
- Module status vocab exactly `enabled | available | disabled | coming_soon` (backend) / `coming-soon` hyphenated (frontend).
- `display` stays `coming_soon` for bracket workspaces (Bracket Display is SP-B3) and `available` for meet workspaces (unchanged).
- The change is to module *state* only — no module data is created/destroyed by enabling a foreign operator.
- Backend suite stays green (currently 521 pass / 1 pre-existing psycopg2 `test_config` skip). Run backend tests with `python3 -m pytest <path> -v` from `products/scheduler`.
- Frontend gate from `products/scheduler/frontend`: `npx tsc -b`, `npx vitest run` (250), `npm run build`.
- Migrations must NOT drift from the app: the migration carries a frozen copy of intent, like the existing `h1c5f4d8e2a9` migration.

---

### Task 1: Backend `derive_modules` — foreign operator `available`

Flip the foreign operator to `available` and prove the consequence: enabling it now works.

**Files:**
- Modify: `products/scheduler/backend/database/models.py` (`derive_modules` ~line 631)
- Test: `products/scheduler/tests/unit/test_workspace_modules.py`

**Interfaces:**
- Produces: `derive_modules(kind)` → meet: `{meet: enabled, bracket: available, display: available}`; bracket: `{bracket: enabled, meet: available, display: coming_soon}`.

- [ ] **Step 1: Update the failing tests**

In `products/scheduler/tests/unit/test_workspace_modules.py`, update the existing `test_derive_modules_status_maps` (≈line 112) to the new shape:

```python
    assert derive_modules("meet") == {
        "meet": "enabled",
        "display": "available",
        "bracket": "available",
    }
    assert derive_modules("bracket") == {
        "bracket": "enabled",
        "display": "coming_soon",
        "meet": "available",
    }
    assert derive_modules("nonsense") == derive_modules("meet")
    assert derive_modules(None) == derive_modules("meet")
```

Add the enable-foreign-operator test (uses the existing `client` fixture in that file):

```python
def test_enable_foreign_operator_on_meet_workspace(client):
    # A meet workspace now seeds bracket as 'available' (was coming_soon).
    tid = seed_tournament(client, "Hybrid via enable")
    # Enabling the foreign operator succeeds (available -> enabled), where it
    # was a 409 MODULE_IMMUTABLE before.
    r = client.patch(f"/tournaments/{tid}/modules/bracket", json={"status": "enabled"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "enabled"
    # And it sticks.
    mods = {m["moduleId"]: m["status"] for m in client.get(f"/tournaments/{tid}/modules").json()}
    assert mods["bracket"] == "enabled"
    assert mods["meet"] == "enabled"
```

Ensure `seed_tournament` is imported at the top of the file (it already is — used by the `tid` fixture).

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -k "derive_modules_shapes or enable_foreign_operator" -v`
Expected: FAIL — derive still returns `coming_soon` for the foreign operator; and `PATCH .../modules/bracket {enabled}` returns 409 `MODULE_IMMUTABLE` (bracket is `coming_soon`).

- [ ] **Step 3: Change `derive_modules`**

In `products/scheduler/backend/database/models.py`, replace the `derive_modules` body + docstring:

```python
def derive_modules(kind: Optional[str]) -> dict[str, str]:
    """Map a tournament's legacy ``kind`` to its seed module status set.

    The kind's own operator is ``enabled``; the foreign operator is
    ``available`` (installable / directly usable, and promotable to
    ``enabled`` via the control plane — SP-B2 multi-module enablement).
    ``display`` is ``available`` for meet (the public surface works) and
    ``coming_soon`` for bracket (the bracket public surface is not built —
    SP-B3). Unknown / ``None`` kinds fall back to the meet shape.
    """
    if kind == "bracket":
        return {"bracket": "enabled", "meet": "available", "display": "coming_soon"}
    # ``meet`` and any unknown / None kind.
    return {"meet": "enabled", "bracket": "available", "display": "available"}
```

- [ ] **Step 4: Run to verify they pass**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -k "derive_modules_shapes or enable_foreign_operator" -v`
Expected: PASS.

- [ ] **Step 5: Update the OTHER derive-path tests that now break**

Three more tests in `tests/unit/test_workspace_modules.py` assert the **derived** shape (no explicit seed) and will fail after Step 3. Update exactly these:

1. `test_summary_includes_modules` (≈line 159) — a meet workspace's summary:
   change `assert modules["bracket"]["status"] == "coming_soon"` → `== "available"`.
2. The `ensure_modules` backfill test (the `meet_mods`/`bracket_mods` asserts, ≈lines 251–261):
   - `meet_mods` → `{"meet": "enabled", "display": "available", "bracket": "available"}`
   - `bracket_mods` → `{"bracket": "enabled", "display": "coming_soon", "meet": "available"}`
3. `test_create_without_seed_unchanged` (≈line 416) — a `kind=bracket` create with NO seed:
   change `{"bracket": "enabled", "display": "coming_soon", "meet": "coming_soon"}` →
   `{"bracket": "enabled", "display": "coming_soon", "meet": "available"}` (update the
   inline comment too — only display stays coming_soon now).

**Do NOT touch** the `normalize_module_seed` / explicit-`modules[]`-seed tests
(≈lines 299, 333, 370, 377): those assert seed-backfill behavior, which SP-B2 does
not change. `normalize_module_seed` already backfills the foreign operator to
`available`; only `derive_modules` changed.

Then run the whole backend suite:

Run: `python3 -m pytest -q`
Expected: green — zero new failures; the 1 pre-existing psycopg2 `test_config` skip unchanged. If a test you didn't anticipate fails, check whether it's a derive-path assertion (update it) or a seed test (leave it and investigate); report any beyond the four named above.

- [ ] **Step 6: Commit**

```bash
git add products/scheduler/backend/database/models.py products/scheduler/tests/unit/test_workspace_modules.py
git commit -m "feat(modules): derive foreign operator as available (enableable), not coming_soon"
```

---

### Task 2: Alembic migration — flip existing `coming_soon` operator rows

Migrate existing persisted rows so deployed workspaces benefit too.

**Files:**
- Create: `products/scheduler/backend/alembic/versions/i2d6e8f0a4b7_foreign_operator_available.py`
- Test: `products/scheduler/tests/unit/test_workspace_modules.py` (SQL-logic test)

**Interfaces:**
- Produces: revision `i2d6e8f0a4b7`, `down_revision = "h1c5f4d8e2a9"`. Upgrade flips `coming_soon` → `available` for `module_id IN ('meet','bracket')`; leaves `display` rows. Downgrade is a documented no-op.

- [ ] **Step 1: Write the SQL-logic test**

Add to `products/scheduler/tests/unit/test_workspace_modules.py` (mirrors the migration's UPDATE so the flip logic is exercised without alembic, which isn't installed in the dev venv):

```python
def test_migration_flip_sql_promotes_coming_soon_operators(client, tid):
    import uuid as _uuid
    from sqlalchemy import text
    from repositories import open_repository

    # Mirrors alembic i2d6e8f0a4b7.upgrade()'s statement verbatim.
    FLIP_SQL = (
        "UPDATE workspace_modules SET status = 'available' "
        "WHERE module_id IN ('meet', 'bracket') AND status = 'coming_soon'"
    )
    with open_repository() as repo:
        t = repo.tournaments.get_by_id(_uuid.UUID(tid))
        repo.modules.ensure_modules(t)
        # Stage a legacy pre-B2 state: foreign operator + display both coming_soon.
        repo.modules.update(t.id, "bracket", {"status": "coming_soon"})
        repo.modules.update(t.id, "display", {"status": "coming_soon"})
        repo.session.execute(text(FLIP_SQL))
        repo.session.commit()
        after = {m.module_id: m.status for m in repo.modules.ensure_modules(t)}
        assert after["bracket"] == "available"   # operator promoted
        assert after["display"] == "coming_soon" # display left untouched
        assert after["meet"] == "enabled"        # unaffected
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py::test_migration_flip_sql_promotes_coming_soon_operators -v`
Expected: FAIL — staging bracket to `coming_soon` then running the UPDATE: this test actually passes once the SQL is correct, so before writing the migration confirm the test exercises the staged flip. (If it already passes here, that's fine — the SQL is inline; Step 3 still adds the migration file the SQL mirrors. The test's purpose is to lock the flip semantics.)

- [ ] **Step 3: Create the migration**

Create `products/scheduler/backend/alembic/versions/i2d6e8f0a4b7_foreign_operator_available.py`:

```python
"""foreign-operator enablement: coming_soon -> available for meet/bracket.

SP-B2. Promotes every existing workspace's foreign operator (meet or
bracket) from ``coming_soon`` to ``available`` so it can be used / enabled,
matching ``database.models.derive_modules`` after SP-B2. ``display`` rows
are intentionally left as-is (Bracket Display is SP-B3).

Tests build the schema via ``Base.metadata.create_all`` and rely on the
repository's derive-and-persist (which now seeds ``available`` directly), so
they never run this migration — correctness does NOT depend on it. This
migration exists so production (Postgres) promotes rows that predate SP-B2.

Revision ID: i2d6e8f0a4b7
Revises: h1c5f4d8e2a9
Create Date: 2026-06-24 00:00:00.000000
"""
from __future__ import annotations

from alembic import op


revision = "i2d6e8f0a4b7"
down_revision = "h1c5f4d8e2a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE workspace_modules SET status = 'available' "
        "WHERE module_id IN ('meet', 'bracket') AND status = 'coming_soon'"
    )


def downgrade() -> None:
    # Lossy / no-op: an UPDATE back to 'coming_soon' cannot distinguish a
    # foreign operator promoted by this migration from one that was seeded
    # 'available' on purpose (e.g. a create-time modules[] seed). Leaving the
    # rows as 'available' on downgrade is the safe choice.
    pass
```

- [ ] **Step 4: Run to verify the SQL-logic test passes + static-check the migration**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py::test_migration_flip_sql_promotes_coming_soon_operators -v`
Expected: PASS. Then confirm the migration file's UPDATE statement is character-identical to the test's `FLIP_SQL`, `down_revision == "h1c5f4d8e2a9"` (the current single head), and the new `revision` doesn't collide with any existing id under `alembic/versions/`.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/alembic/versions/i2d6e8f0a4b7_foreign_operator_available.py products/scheduler/tests/unit/test_workspace_modules.py
git commit -m "feat(migration): promote existing coming_soon foreign operators to available"
```

---

### Task 3: Frontend `modulesForWorkspace` parity

Mirror the new derive shape in the frontend fallback catalog.

**Files:**
- Modify: `products/scheduler/frontend/src/platform/domain/moduleModel.ts` (`modulesForWorkspace` ~line 62; the doc comment)
- Test: `products/scheduler/frontend/src/platform/domain/__tests__/moduleModel.test.ts` (the `modulesForWorkspace` block)

**Interfaces:**
- Produces: `modulesForWorkspace('meet')` → bracket `available`; `modulesForWorkspace('bracket')` → meet `available`, display `coming-soon`.

- [ ] **Step 1: Update the failing tests**

In `src/platform/domain/__tests__/moduleModel.test.ts`, replace the `describe('modulesForWorkspace', …)` block with the new shape:

```ts
describe('modulesForWorkspace', () => {
  it('meet: Meet enabled, Bracket available, Display available', () => {
    const m = modulesForWorkspace('meet');
    expect(m.map((x) => x.id)).toEqual(['meet', 'bracket', 'display']);
    expect(m.find((x) => x.id === 'meet')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'bracket')!.status).toBe('available');
    expect(m.find((x) => x.id === 'display')!.status).toBe('available');
  });
  it('bracket: Bracket enabled, Meet available, Display coming-soon', () => {
    const m = modulesForWorkspace('bracket');
    expect(m.find((x) => x.id === 'bracket')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'meet')!.status).toBe('available');
    const display = m.find((x) => x.id === 'display')!;
    expect(display.status).toBe('coming-soon');
    expect(display.note).toBe('Display for bracket workspaces is coming.');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/platform/domain/__tests__/moduleModel.test.ts` (from `products/scheduler/frontend`)
Expected: FAIL — the foreign operator is still `coming-soon`.

- [ ] **Step 3: Update `modulesForWorkspace`**

In `src/platform/domain/moduleModel.ts`, change the `status` helper inside `modulesForWorkspace` so the foreign operator is `available`, and update the doc comment:

```ts
/** The kind-derived module catalog — the FALLBACK used before/without real
 *  backend module state. Mirrors the backend's `derive_modules(kind)` exactly:
 *  meet → meet enabled, bracket available, display available; bracket →
 *  bracket enabled, meet available, display coming-soon. */
export function modulesForWorkspace(kind: Kind): WorkspaceModule[] {
  const isBracket = kind === 'bracket';
  const status = (id: ModuleId): ModuleStatus => {
    if (id === 'display') return isBracket ? 'coming-soon' : 'available';
    const isThisOperator = (id === 'bracket') === isBracket;
    return isThisOperator ? 'enabled' : 'available';
  };
  return MODULE_ORDER.map((id) => {
    const s = status(id);
    return { id, label: MODULE_LABELS[id], status: s, note: moduleNote(id, s) };
  });
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/platform/domain/__tests__/moduleModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate + commit**

Run: `npx vitest run` then `npx tsc -b` then `npm run build`
Expected: all green/clean. (No other frontend consumer asserts the foreign-operator-is-coming-soon shape; the Hub chip filter, ModuleDock, and Settings already handle `available`.)

```bash
git add products/scheduler/frontend/src/platform/domain/moduleModel.ts products/scheduler/frontend/src/platform/domain/__tests__/moduleModel.test.ts
git commit -m "feat(modules): frontend modulesForWorkspace parity — foreign operator available"
```

---

## Self-Review

**Spec coverage:**
- `derive_modules` foreign operator `available` (backend) → Task 1. ✓
- Migration flips existing `coming_soon` meet/bracket → available, leaves display → Task 2. ✓
- Frontend `modulesForWorkspace` parity → Task 3. ✓
- Enable foreign operator via existing PATCH (available→enabled), no rule change → proven by Task 1's enable test (no `_ALLOWED_TRANSITIONS`/guard edits anywhere). ✓
- `display` stays coming_soon for bracket → Task 1 derive + Task 2 leaves display + Task 3 parity. ✓

**Placeholder scan:** none. Task 1 Step 5 carries a concrete contingency (update any existing assertion that hard-coded the old `coming_soon` foreign-operator shape, reporting each) — a real instruction, not a vague one. Task 2 Step 2 explicitly notes the SQL-logic test may pass immediately (the SQL is inline) and states the test's purpose.

**Type/value consistency:** the derive shapes are identical across Task 1 (backend), Task 2 (migration leaves display, flips operators), and Task 3 (frontend): meet → `{meet enabled, bracket available, display available}`; bracket → `{bracket enabled, meet available, display coming_soon}`. The migration `revision`/`down_revision` (`i2d6e8f0a4b7` / `h1c5f4d8e2a9`) match the confirmed current head. The `FLIP_SQL` in the Task 2 test is character-identical to the migration's `op.execute` string.
