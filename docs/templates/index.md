# Workspace templates

The module choices behind the **New workspace** builder (route `/new`). The current
surface is a custom tri-state builder, not a preset gallery: it lets an operator
choose which shipped modules start enabled, available, or off.

## What a workspace module choice is

A workspace is a [control plane](/explanation/architecture/workspace-model): a name, a legacy
`kind`, and a first-class set of **module rows** (`meet`, `bracket`, `display`,
`entries`), each in one lifecycle status. The module choices become an explicit
`modules[]` array that the create call persists; the modules, not the legacy `kind`,
are what the rest of the app reads.

The `/new` surface is implemented by
`apps/console/src/modules/hub/NewWorkspacePage.tsx`, with seed conversion in
`apps/console/src/modules/hub/customModules.ts`. There is no preset registry in the
current tree.

```ts
// customModules.ts — tri-state choices become persisted module statuses
type ModuleChoice = 'enabled' | 'available' | 'off';
```

The module statuses a seed can carry are the control-plane lifecycle vocabulary
(`apps/api/src/db/models.py`): `enabled` (active now), `available` (installable
later, off for now), `disabled` (present but off). `coming_soon` is retired —
every module is fully built, and seeding it is rejected (see
[ADR 0005](/explanation/decisions/0005-coming-soon-elimination)).

## The custom module choices

| Module | `enabled` | `available` | `off` |
|---|---|---|---|
| Meet, Bracket, Display, or Entries | on immediately | installable later | present but off |

A few things the builder makes precise:

- **Entries is cloud-only.** It is part of the catalog and can be seeded by the
  server, but the local `/new` builder currently offers Meet, Bracket, and Display.
- **Display depends on an operational module.** Display may be enabled only when
  Meet or Bracket is enabled.

::: info Display can't be enabled without an operator
Display is only `enabled` where an operational module (`meet` or `bracket`) is also
`enabled`. This is the **display-dependency rule**, enforced on the seed at create
time.
:::

## The Custom path

**Custom** opens a per-module tri-state builder
(`CustomModulesBuilder.tsx`, state in `customModules.ts`). Each local-builder
module is set independently to **Enabled**, **Available**, or **Off**, and that
maps straight onto seed statuses:

```ts
// customModules.ts — tri-state → persisted status
//   enabled   → 'enabled'    (on immediately)
//   available → 'available'  (installable later from Settings)
//   off       → 'disabled'   (present but turned off)
const toStatus = (s) => (s === 'off' ? 'disabled' : s);
```

The legacy `kind` for a custom build is derived, not chosen: bracket-only (bracket
`enabled` and meet not `enabled`) → `'bracket'`, everything else → `'meet'`
(`kindForSeed`). The builder shows a soft hint when display is on with no
operator enabled ("Display needs Meet or Bracket enabled to show anything"),
because the backend will reject that seed:

::: warning A display-only seed is a 400
`POST /tournaments` validates the seed with `normalize_module_seed` and then
`display_dependency_satisfied` (`apps/api/src/db/models.py`). If `display` is
`enabled` with neither `meet` nor `bracket` `enabled`, the create is rejected with
`400 INVALID_INPUT` *before* any workspace row is written — no orphan workspace is
left behind. The Custom builder's inline hint exists to keep you out of that state.
:::

Any module you leave unnamed in a custom seed is backfilled to `available` by
`normalize_module_seed`, so a partial seed is always completed to the module set.

## How a module choice reaches the backend

The builder sends one call regardless of which path you took:

```ts
// NewWorkspacePage.tsx
const modules = customSeed(custom);
const kind    = kindForSeed(custom);
const created = await apiClient.createTournament({
  name: name.trim() || null,    // name + date are optional
  kind,
  tournamentDate: date || null,
  modules,                       // the explicit seed
});
```

On the backend (`create_tournament`, `apps/api/src/workspaces/tournaments.py`), a present
`modules[]` is normalised, dependency-checked, and persisted as real
`workspace_modules` rows. Because the rows exist up front, the lazy seeding path
never runs for an explicitly seeded workspace.

### `kind` vs the module seed

`kind` is **not** the module set — it is a legacy classifier that selects the
backend **schema/table family** (`meet_*` vs `bracket_*`), independent of which
modules a workspace enables. Post-create routing is derived from the **returned
modules**, never from `kind`.

### Templates vs `derive_modules`: the lazy fallback

`derive_modules(kind)` is the **fallback seed** for a workspace created *without*
an explicit `modules[]` (legacy rows, or API clients that omit the field). It runs
lazily the first time anyone reads the workspace's modules, then persists the
result as real rows.

```python
# apps/api/src/db/models.py — the no-seed fallback, not the explicit custom seed
def derive_modules(kind):
    if kind == "bracket":
        return {"bracket": "enabled", "display": "available", "meet": "available"}
    return {"meet": "enabled", "display": "available", "bracket": "available"}
```

The asymmetry worth internalising:

- `derive_modules("bracket")` enables Bracket and leaves the other modules available.
- `derive_modules("meet")` enables Meet and leaves the other modules available.

So: custom builds send an explicit seed (`normalize_module_seed` validates it and
`derive_modules` is never consulted); `derive_modules` only fills the gap when no
seed was sent.

## After create: where you land

The returned modules decide the landing route, not a preset id
(`workspaceCreateFlow.ts`):

| Returned state | Lands on |
|---|---|
| Any module `enabled` | `/tournaments/{id}/overview` (the workspace readiness Overview) |
| Nothing `enabled` (available-only Custom) | `/tournaments/{id}/ws-modules` (the Modules admin, to turn one on) |

This keeps the entry point honest: a workspace with an active engine opens on its
readiness Overview; a workspace with nothing on opens where you can enable
something. From there, modules are turned on or off per the control-plane rules —
see [How to enable a module](/how-to/enable-a-module).

## Building your own product on the engine

The builder assembles the **shipped** modules. If you want to go further
— a brand-new enableable module, or your own scheduling product built on the pure
CP-SAT core — that is a code change, not a template:

- [How to build on the engine](/how-to/build-on-the-engine) — drive
  `scheduler_core` (no HTTP, no I/O — dataclasses in, a result out) from your own
  application; the scheduler in this repo is the worked example.
- [How to add a module](/how-to/add-a-module) — stand up a new enableable module
  end-to-end, including its row in `MODULE_IDS` and its default in
  `derive_modules`, so it can itself become part of a future workspace seed.

## See also

- [Workspace model](/explanation/architecture/workspace-model) — what a workspace and its modules are
- [How to enable a module](/how-to/enable-a-module) · [How to add a module](/how-to/add-a-module)
- [How to build on the engine](/how-to/build-on-the-engine)
- [Meet](/reference/modules/meet) · [Bracket](/reference/modules/bracket) · [Display](/reference/modules/display)
- [ADR 0002 — Workspace as control plane](/explanation/decisions/0002-workspace-as-control-plane)
- [ADR 0005 — Coming-soon elimination](/explanation/decisions/0005-coming-soon-elimination)
