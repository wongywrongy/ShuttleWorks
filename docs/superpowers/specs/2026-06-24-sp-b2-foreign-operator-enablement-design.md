> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# SP-B2 — Foreign-operator enablement — design

**Date:** 2026-06-24
**Status:** accepted (pending user spec review)
**Branch:** `dev/workspace-suite`
**Program:** "Control Plane First" → expanded SP-B (real multi-module workspaces).
SP-B2 makes the **foreign operator** (Bracket on a Meet workspace, Meet on a Bracket
workspace) actually usable. Builds on SP-B1 (module-driven chrome). Backend +
a small frontend-parity change.

## Goal

After SP-A, a single-kind workspace's foreign operator is seeded `coming_soon`
(immutable) — "we don't pretend it's enableable yet." SP-B1 made the chrome
module-driven. SP-B2 flips the foreign operator to `available`, which — because
`available` is already enterable (SP-B1) **and** `available → enabled` is already an
allowed PATCH transition — makes it both **immediately usable** (dock → its surface)
and **promotable to `enabled`** (Settings → Modules), with **no transition-rule or
guard changes**.

The result: any existing Meet workspace can use (or turn on) Bracket, and vice-versa
— the first real multi-module workspaces.

## Decisions locked in brainstorming

- **`available` = directly usable** (no semantic rework). Flipping the foreign
  operator to `available` is the whole behavioral change — consistent with how
  Display (already `available` on a meet workspace) works today. The explicit
  Enable (`available → enabled`) in Settings stays as an optional "make it a primary
  module" step (it then counts toward polling/signals).
- **Migrate existing rows** — an Alembic migration flips existing persisted
  `coming_soon` rows for `meet`/`bracket` → `available`, so existing workspaces
  benefit too. `display` rows are left untouched (Bracket Display is SP-B3).

## Changes

### 1. `derive_modules` (`backend/database/models.py`)

The foreign operator becomes `available` instead of `coming_soon`:

```python
def derive_modules(kind: Optional[str]) -> dict[str, str]:
    if kind == "bracket":
        return {"bracket": "enabled", "meet": "available", "display": "coming_soon"}
    # meet and any unknown / None kind.
    return {"meet": "enabled", "bracket": "available", "display": "available"}
```

- meet → `{meet: enabled, bracket: available, display: available}`
- bracket → `{bracket: enabled, meet: available, display: coming_soon}`

`display` is unchanged: `available` for meet (the public surface works), `coming_soon`
for bracket (the bracket public surface is SP-B3). Update the docstring to reflect
that the foreign operator is now enableable.

### 2. Alembic migration — flip existing rows

New revision chaining after the `workspace_modules` table migration:
`revision` = a fresh id (e.g. `i2d6e8f0a4b7`), `down_revision = "h1c5f4d8e2a9"`
(the current single head). Upgrade:

```sql
UPDATE workspace_modules
   SET status = 'available'
 WHERE module_id IN ('meet', 'bracket')
   AND status = 'coming_soon';
```

(Also bump `updated_at` to now if the table tracks it.) Downgrade is best-effort and
documented as lossy — it cannot distinguish a migrated foreign operator from a
legitimately-`available` seeded one, so it is a **no-op** (with a comment explaining
why). Existing workspaces' `display` `coming_soon` rows are deliberately not touched.

### 3. Frontend parity (`frontend/.../moduleModel.ts`)

`modulesForWorkspace(kind)` mirrors the backend `derive_modules` exactly, so update it
to the new shape: the foreign operator is `available` (not `coming-soon`). The
`moduleNote` for an `available` module already returns `undefined` (no "not enabled
yet" note), which is correct. No other frontend change is needed:

- `isModuleEnterable('available') === true` → the foreign operator is directly
  enterable via the SP-B1 chrome (dock click → its product mounts).
- The Hub `ModuleChips` filter already shows `available` chips, so Bracket now
  surfaces on a meet workspace's row/inspector.
- `ModulesSettingsTab` already offers Enable for an `available` module
  (`isModuleEnableable('available') === true`), so promoting to `enabled` works.

## No new rules

`_ALLOWED_TRANSITIONS` already contains `("available", "enabled")`. The
display-dependency, last-operational, and has-data disable guards are unaffected by
this change. Enabling the foreign operator goes through the existing PATCH handler
untouched; it is no longer blocked because the operator is no longer `coming_soon`
(immutable).

## Out of scope (follow-ups, not SP-B2)

- **Bracket Display** (SP-B3) — `display` stays `coming_soon` for bracket workspaces.
- **Hybrid-aware signals** — SP-A's `build_signals` computes readiness/attention by
  `kind` only, so a meet+bracket workspace's *bracket* readiness isn't reflected in
  the Hub signals yet. A worthwhile later refinement; it does not block using the
  module.
- **Hybrid identity/label** — the kind badge and "DELETE MEET vs TOURNAMENT" copy
  (the known deferred labeling concern).
- **New Workspace template-picker UI** that creates hybrids up front (separate —
  enabling via Settings is the path SP-B2 delivers; the create-time `modules[]` seed
  backend already exists from SP-A).

## Constraints

- `kind` preserved (identity + the frontend chrome fallback). No route-path changes.
- The change is additive to module *state* only; no module data is created or
  destroyed by enabling a foreign operator (the operator builds its data afterward;
  a `Tournament` row already holds meet state in `data` + bracket state in the
  relational `bracket_*` tables).
- Backend suite stays green (currently 521 pass / 1 pre-existing psycopg2 skip).
  Frontend gate: `tsc -b`, `vitest run` (250), `build` — from
  `products/scheduler/frontend`.
- The migration must be correct on a clean DB (alembic upgrade head runs the full
  chain). Tests use `create_all` (no alembic), so the `derive_modules` change covers
  freshly-created test workspaces; the migration covers existing prod/dev data.

## Tests

Backend (`python3 -m pytest` from `products/scheduler`):
- **`derive_modules` shape:** meet → `{meet: enabled, bracket: available, display:
  available}`; bracket → `{bracket: enabled, meet: available, display: coming_soon}`;
  unknown/None → the meet shape. (Update the existing derive check.)
- **Enable the foreign operator:** on a meet workspace, `PATCH .../modules/bracket
  {status: "enabled"}` returns 200 and persists `enabled` (this was a 409
  `MODULE_IMMUTABLE` before, when bracket was `coming_soon`). Same for meet on a
  bracket workspace.
- **Migration:** on a DB with a `coming_soon` bracket row (meet workspace) and a
  `coming_soon` display row, `alembic upgrade <rev>` flips the bracket row to
  `available` and leaves the display row `coming_soon`. (Static/SQL-level test;
  alembic isn't installed in the dev venv — verify the SQL + chaining, mirroring how
  SP-A's migration was validated.)
- Full backend suite green; no regression in the existing module rules.

Frontend (from `products/scheduler/frontend`):
- **`modulesForWorkspace` parity:** meet → bracket `available` (not `coming-soon`),
  display `available`; bracket → meet `available`, display `coming-soon`. (Update the
  existing `moduleModel.test` derive assertions; the `modulesFromDto` mapping test is
  unchanged — it maps whatever statuses the backend sends.)
- `tsc -b` + `vitest run` + `build` green.

## Acceptance criteria

1. `derive_modules` (backend) and `modulesForWorkspace` (frontend) both seed the
   foreign operator as `available`; new workspaces get a usable foreign operator.
2. A migration flips existing `coming_soon` meet/bracket rows to `available` and
   leaves `display` rows untouched; correct on a clean DB.
3. Enabling the foreign operator (`available → enabled`) succeeds via the existing
   PATCH (no rule/guard change); previously-blocking `coming_soon` immutability no
   longer applies to operators.
4. The foreign operator is reachable: directly enterable via the SP-B1 dock, shown as
   an `available` chip on the Hub, and Enable-able in Settings → Modules.
5. Backend suite green (521 / 1 skip); frontend `tsc`/`vitest`(250)/`build` green;
   `kind` preserved; no route changes.
