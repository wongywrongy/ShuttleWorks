# Workspace templates

The presets behind the **New workspace** builder (route `/new`). This page is for
anyone who needs to know what each template enables, when to pick it, and how a
template's choice maps onto the backend's per-workspace module state. It also
points to the "build your own product on the engine" starter story.

## What a template actually is

A workspace is a [control plane](/architecture/workspace-model): a name, a legacy
`kind`, and a first-class set of **module rows** (`meet`, `bracket`, `display`),
each in one lifecycle status. A template is just a **named, explicit module seed**
plus a display title — nothing more. Picking one on `/new` pre-fills the
`modules[]` array that the create call persists; the modules, not the template
name, are what the rest of the app reads.

The presets live in one file —
`products/scheduler/frontend/src/products/hub/newWorkspaceTemplates.ts` — and the
`/new` surface that renders them is
`products/scheduler/frontend/src/products/hub/NewWorkspacePage.tsx`.

```ts
// newWorkspaceTemplates.ts — the shape every preset carries
export interface Template {
  id: TemplateId;            // 'meet-day' | 'bracket-tournament' | 'hybrid' | 'blank'
  title: string;
  blurb: string;
  kind: 'meet' | 'bracket';  // legacy schema-family selector (see below)
  seed: WorkspaceModuleDTO[]; // the explicit modules[] persisted on create
}
```

The module statuses a seed can carry are the control-plane lifecycle vocabulary
(`backend/database/models.py`): `enabled` (active now), `available` (installable
later, off for now), `disabled` (present but off). `coming_soon` is retired —
every module is fully built, and seeding it is rejected (see
[ADR 0005](/decisions/0005-coming-soon-elimination)).

## The four presets

| Template | `kind` | Meet | Bracket | Display | Pick it when… |
|---|---|---|---|---|---|
| **Meet Day** | `meet` | `enabled` | `available` | `enabled` | You're running a round-robin / pooled meet with a CP-SAT schedule, a live cockpit, and a venue display. |
| **Bracket Tournament** | `bracket` | `available` | `enabled` | `available` | You're running an elimination event — events, seeding, draw generation, advancement, and results. |
| **Hybrid Event** | `meet` | `enabled` | `enabled` | `enabled` | One workspace runs both a meet and brackets together, sharing courts and a display. |
| **Blank Workspace** | `meet` | `available` | `available` | `disabled` | You want to start empty and turn modules on from Settings as you go. |

A few things the table makes precise:

- **Meet Day turns the display on; the lazy fallback does not.** The Meet Day seed
  is `display: enabled`, deliberately. That is *not* the same as a meet workspace
  created without a seed — see [derive_modules](#templates-vs-derive_modules-the-lazy-fallback)
  below.
- **Hybrid is a real two-engine workspace**, not a label: both operational modules
  are `enabled`, so both appear in the sidebar and both can feed
  [Operations](/modules/operations) and the [display](/modules/display).
- **Blank enables nothing.** Both operators are `available` and display is
  `disabled`, so there is no enabled module to land on — the builder routes Blank
  to the Modules admin instead of a module home (see [Landing](#after-create-where-you-land)).

::: info Display can't be enabled without an operator
The Meet Day, Bracket Tournament, and Hybrid seeds all keep display valid: display
is only `enabled` where an operational module (`meet` or `bracket`) is also
`enabled`. This is the **display-dependency rule** — enforced on the seed at
create time, covered under [Custom](#the-custom-path) below.
:::

## The Custom path

Below the four cards, **Custom** opens a per-module tri-state builder
(`CustomModulesBuilder.tsx`, state in `customModules.ts`). Each of the three
modules is set independently to **Enabled**, **Available**, or **Off**, and that
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
`display_dependency_satisfied` (`backend/database/models.py`). If `display` is
`enabled` with neither `meet` nor `bracket` `enabled`, the create is rejected with
`400 INVALID_INPUT` *before* any workspace row is written — no orphan workspace is
left behind. The Custom builder's inline hint exists to keep you out of that state.
:::

Any module you leave unnamed in a custom seed is backfilled to `available` by
`normalize_module_seed`, so a partial seed is always completed to the full
three-module set.

## How a template reaches the backend

The builder sends one call regardless of which path you took:

```ts
// NewWorkspacePage.tsx
const modules = isCustom ? customSeed(custom) : tpl.seed;
const kind    = isCustom ? kindForSeed(custom) : tpl.kind;
const created = await apiClient.createTournament({
  name: name.trim() || null,    // name + date are optional
  kind,
  tournamentDate: date || null,
  modules,                       // the explicit seed
});
```

On the backend (`create_tournament`, `backend/api/tournaments.py`), a present
`modules[]` is normalised, dependency-checked, and persisted as real
`workspace_modules` rows. Because the rows exist up front, the lazy seeding path
never runs for a templated/custom workspace.

### `kind` vs the module seed

`kind` is **not** the module set — it is a legacy classifier that selects the
backend **schema/table family** (`meet_*` vs `bracket_*`), independent of which
modules a workspace enables. That is why three of the four presets are `kind:
'meet'` under the hood (Meet Day, Hybrid, Blank) and only Bracket Tournament is
`kind: 'bracket'`. Post-create routing is derived from the **returned modules**,
never from `kind`.

### Templates vs `derive_modules`: the lazy fallback

`derive_modules(kind)` is the **fallback seed** for a workspace created *without*
an explicit `modules[]` (legacy rows, or API clients that omit the field). It runs
lazily the first time anyone reads the workspace's modules, then persists the
result as real rows.

```python
# backend/database/models.py — the no-seed fallback, NOT the template seeds
def derive_modules(kind):
    if kind == "bracket":
        return {"bracket": "enabled", "display": "available", "meet": "available"}
    return {"meet": "enabled", "display": "available", "bracket": "available"}
```

The asymmetry worth internalising:

- `derive_modules("bracket")` matches the **Bracket Tournament** preset exactly.
- `derive_modules("meet")` does **not** match **Meet Day** — the fallback leaves
  `display: available`, whereas the Meet Day template deliberately ships
  `display: enabled`. A meet workspace created through the API without a seed comes
  up with its venue display *off*; the template turns it on for you.

So: presets always send an explicit seed (`normalize_module_seed` validates it and
`derive_modules` is never consulted); `derive_modules` only fills the gap when no
seed was sent.

## After create: where you land

The returned modules decide the landing route, not the template id
(`workspaceCreateFlow.ts`):

| Returned state | Lands on |
|---|---|
| Any module `enabled` | `/tournaments/{id}/overview` (the workspace readiness Overview) |
| Nothing `enabled` (Blank / available-only Custom) | `/tournaments/{id}/ws-modules` (the Modules admin, to turn one on) |

This keeps the entry point honest: a workspace with an active engine opens on its
readiness Overview; a workspace with nothing on opens where you can enable
something. From there, modules are turned on or off per the control-plane rules —
see [How to enable a module](/how-to/enable-a-module).

## Building your own product on the engine

The templates above all assemble the **shipped** modules. If you want to go further
— a brand-new enableable module, or your own scheduling product built on the pure
CP-SAT core — that is a code change, not a template:

- [How to build on the engine](/how-to/build-on-the-engine) — drive
  `scheduler_core` (no HTTP, no I/O — dataclasses in, a result out) from your own
  application; the scheduler in this repo is the worked example.
- [How to add a module](/how-to/add-a-module) — stand up a new enableable module
  end-to-end, including its row in `MODULE_IDS` and its default in
  `derive_modules`, so it can itself become part of a future workspace seed.

## See also

- [Workspace model](/architecture/workspace-model) — what a workspace and its modules are
- [How to enable a module](/how-to/enable-a-module) · [How to add a module](/how-to/add-a-module)
- [How to build on the engine](/how-to/build-on-the-engine)
- [Meet](/modules/meet) · [Bracket](/modules/bracket) · [Display](/modules/display)
- [ADR 0002 — Workspace as control plane](/decisions/0002-workspace-as-control-plane)
- [ADR 0005 — Coming-soon elimination](/decisions/0005-coming-soon-elimination)
