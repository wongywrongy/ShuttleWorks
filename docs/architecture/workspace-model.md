# Workspace model

A **workspace** is one event's control plane — the durable container for a real event lifecycle.
This page explains what a workspace is, how its modules are persisted, and the module status
lifecycle.

## Workspace = a `tournaments` row

The user-facing noun is **Workspace**, but the implementation noun is still **tournament**. This
is deliberate and confined: the workspace-suite redesign renamed the concept in the Hub and shell
chrome via a frontend facade, while leaving the route, table, DTO, and scheduler-core names
unchanged.

| Layer | Name today |
| --- | --- |
| User-facing UI (Hub + shell) | **Workspace** |
| Frontend domain facade (`platform/domain/workspace.ts`) | **Workspace** |
| Deep Meet/Bracket UI internals | tournament |
| Backend DTOs, API routes (`/tournaments/*`), DB table (`tournaments`) | tournament |
| Scheduler-core models | `Tournament*` |

So "create a workspace" is `POST /tournaments`, and "the workspace's state" is
`GET/PUT /tournaments/{id}/state`. When you read **workspace** in the UI and **tournament** in the
backend, they are the same thing. See [ADR 0002](/decisions/0002-workspace-as-control-plane).

The `tournaments` row carries a `kind` column (`meet | bracket`), a `status`
(`draft | active | archived`), the `tournament_date`, and a `data` JSON blob holding the full
workspace state (config, roster, matches, schedule). `schema_version` defaults to `2`.

## How modules are persisted

Each workspace's enabled modules live in the **`workspace_modules`** table — one row per
`(tournament_id, module_id)` pair:

| Column | Notes |
| --- | --- |
| `tournament_id` | FK → `tournaments` (cascade delete), indexed |
| `module_id` | `'meet' | 'bracket' | 'display'` |
| `status` | the module status (see below) |
| `config` | optional JSON per-module config |
| `id`, `created_at`, `updated_at` | surrogate PK + audit; unique on `(tournament_id, module_id)` |

Rows are **lazily seeded** the first time a workspace's modules are read, by `derive_modules(kind)`
in `database/models.py`:

- `kind == "bracket"` → `{ bracket: enabled, display: available, meet: available }`
- otherwise (meet / null / unknown) → `{ meet: enabled, display: available, bracket: available }`

`kind` is therefore a **temporary compatibility bridge** to the persisted `modules[]`: it seeds the
initial module set, after which the `workspace_modules` rows are authoritative. At create time a
caller may also pass an explicit `modules[]` seed, validated by `normalize_module_seed` (known id,
no duplicates, valid status; `coming_soon` is rejected as a seedable status; missing modules
backfilled as `available`).

## Module status lifecycle

The status values (constants in `database/models.py`) are:

| Status | Meaning |
| --- | --- |
| `enabled` | Active and operable. The module's surfaces render and its routes accept data. |
| `available` | Installable but off. Shown in the dock with enablement copy. |
| `disabled` | Turned off by the operator. |
| `coming_soon` | **Retired.** Immutable; only ever seeded by migrations, never on create. All modules are fully built, so nothing is genuinely "coming soon" — see [ADR 0005](/decisions/0005-coming-soon-elimination). |

```
        seed (derive_modules / normalize_module_seed)
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
        available ──enable──▶   enabled
            ▲                       │
            └───────disable─────────┘   (guarded — see rules)

  coming_soon ── immutable ──▶ (cannot be modified)
```

### Server-enforced transition rules

`PATCH /tournaments/{id}/modules/{module_id}` enforces four rules, each returning **409**:

1. **Immutability** — a `coming_soon` module cannot be modified (`MODULE_IMMUTABLE`).
2. **Display dependency** — enabling `display` requires an enabled **operational** module
   (`meet` or `bracket`) (`MODULE_DEPENDENCY_UNMET`). Enforced by `display_dependency_satisfied()`.
3. **Data-loss guard** — a module that has data cannot be disabled (`MODULE_HAS_DATA`): disabling
   `meet` requires zero matches, disabling `bracket` requires zero bracket events.
4. **Last operational module** — you cannot disable the last enabled operational module; a
   workspace always keeps ≥1 of `meet`/`bracket` enabled (`MODULE_LAST_OPERATIONAL`).

"Operational modules" are `meet` and `bracket` — the data-producing engines. `display` is an
output and `operations` is architectural (always-on, no row), so neither participates in the
last-operational rule.

## The workspace shell

Once a workspace is open, the **workspace shell** renders the common chrome: workspace
identity/status, the **module dock** (which switches between enterable modules), role and
connection indicators, and sync health. The left sidebar is built by `buildWorkspaceNav(kind,
enabled)` in `app/workspace/workspaceNav.ts`, which emits:

- **Overview** (always, top).
- One **section per enabled module** — Meet / Bracket (engines), Operations (shared), Display
  (output) — each tagged with a role badge.
- A **Workspace** admin block (always, bottom): Venue & schedule, Members, Sharing, Modules,
  Sync and backups, Settings.

The Operations section points at the *active engine's* schedule/live surfaces (single-engine ships
today; a hybrid cross-engine merge is a planned follow-on). See the [Settings page](/modules/settings)
for the admin block and the [Operations module](/modules/operations) for the live-ops surfaces.

## Signals: a workspace's operational health

The Hub shows each workspace with a computed **signal** — health, an attention list, a setup
readiness checklist, module counts, and collaboration counts — produced by `build_signals` in one
batched pass. This is the most important cross-cutting backend feature; it has its own page under
[API reference → Signals](/api/signals).
