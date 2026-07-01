# What ShuttleWorks is

ShuttleWorks is a single product for running badminton (and adjacent racquet-sport)
tournaments off the director's laptop. It covers two kinds of event from one codebase:

- **Inter-school dual / tri-meets** — the same players play several events back-to-back,
  and an optimiser assigns courts and time slots.
- **Bracket-draw tournaments** — BWF-conformant single-elimination and round-robin draws,
  with seeding, advancement, and import/export.

It is designed for the operator running the day from a laptop in the corner of the gym:
drag-to-reschedule, live solver progress, a public TV display, and a
proposal → review → commit pipeline so the schedule never silently changes.

## The control-plane mental model

ShuttleWorks is organised as a **UniFi-style control plane**, not as a set of separate apps.
There are three nouns to learn:

```
Hub  ──lists──▶  Workspace  ──enables──▶  Modules
(/)              (one event)              (Meet · Bracket · Display)
```

- **Hub** — the landing page (`/`). A dashboard of every workspace you operate, each shown
  with an operational signal (health, readiness, attention, which modules are enabled).
- **Workspace** — one event's control plane. The durable container for a real event lifecycle:
  planning, setup, meet-day ops, bracket play, display config, exports, backups, review.
  *Internally a workspace is still a `tournaments` row* — see the
  [workspace model](/architecture/workspace-model) for why the names differ.
- **Modules** — the installable product systems you enable inside a workspace.

You create a workspace from a template (Meet Day / Bracket Tournament / Hybrid / Blank) or a
custom module mix, then switch between enabled modules with the **module dock**.

## The four-module model

The architecture is described in terms of **four modules**, split across two tiers:

| Module | Tier | User-enableable? | What it is |
| --- | --- | --- | --- |
| **Meet** | 1 (user) | ✅ Yes | The meet scheduling engine — roster, CP-SAT court assignments, drag-to-reschedule, the proposal/repair/suggestion pipeline. |
| **Bracket** | 1 (user) | ✅ Yes | The draw engine — seeding, single-elimination + round-robin draws, advancement, JSON/CSV/ICS import-export. |
| **Operations** | 2 (architectural) | ❌ No | The **live-ops layer** — court layout + live match status (call / start / finish / score) for whichever engine is running. Not something you "enable". |
| **Display** | 1 (user) | ✅ Yes | The read-only public TV output — live matches, draw, results — for the enabled engine. No auth. |

::: info Why Operations is "Tier-2"
The three **user-facing** modules — Meet, Bracket, Display — are the ones that appear in the
module catalog and have a row in the `workspace_modules` table (the `ModuleId` union is
`'meet' | 'bracket' | 'display'`). **Operations is an *architectural* module**: it owns real
nav, routes, and a store slice, but it is always-on and has no enable flag. In code this is the
`ArchModuleId = ModuleId | 'operations'` distinction in
`frontend/src/platform/contracts/moduleContract.ts`. See the
[system overview](/architecture/system-overview) and [module contracts](/contracts/).
:::

There is also a per-workspace **Settings** surface (Overview, Modules, People & Access, Sharing,
Sync & Backups, Venue & schedule). It is the workspace's admin chrome, not a `ModuleId` — see
the [Settings page](/modules/settings).

## Who uses it, and how

| Role | Device | How they connect |
| --- | --- | --- |
| **Tournament director** (operator) | The laptop running the stack | Drives everything: roster, schedule, live ops, director time-axis tools. The laptop's SQLite is the source of truth. |
| **Assistant operators** | Browser on any LAN device | Read live state via Supabase Realtime; write via the idempotent command queue back to the director's backend. |
| **The public / venue TV** | Browser / projector | Reads the public `/display` view from Supabase Realtime. No login. |

The director's SQLite is canonical; Supabase is a **mirror** populated by a background outbox.
A tournament can complete cleanly even if Supabase is unreachable for the entire day — see
[ADR 0003: SQLite as primary persistence](/decisions/0003-sqlite-as-primary-persistence) and the
[data-flow](/architecture/data-flow) page.

## Next

- [Running locally](/getting-started/running-locally) — get the stack up.
- [Repo layout](/getting-started/repo-layout) — where everything lives.
- [System overview](/architecture/system-overview) — the modules in depth.
