# ADR 0001 — Four-module split (Meet · Bracket · Operations · Display)

**Status:** Accepted (2026-06, branch `dev/workspace-suite`) · **extended 2026-08-06** — a fifth
module, **Entries**, joined Tier-1 in SP-PROGRAM-1. The decomposition below is unchanged; the set it
enumerates grew.

::: info What changed, and what did not
`ModuleId` is now `'meet' | 'bracket' | 'display' | 'entries'`, `entriesContract` is the fifth
descriptor, and `entriesCommitted` is a fourth named `SeamEdge`. The two-tier split, the
enableable-versus-always-on distinction, and the test-enforced descriptor layer all survived the
addition without change — which is the outcome this record was betting on. Entries adds one wrinkle
the original set did not have: it is Tier-1 but **cloud-only** (`CLOUD_ONLY_MODULES`), so
"user-enableable" is now conditioned on deployment mode. See [Entries](/reference/modules/entries) and the program ledger
`docs/history/programs/ENTRIES_PROGRESS.md` (repo working record, outside this site).
:::

## Context

ShuttleWorks serves two genuinely different event shapes — optimiser-driven meets and draw-based
bracket tournaments — and feeds a public TV display, all while an operator runs live ops on the day.
After the backend-merge arc folded the two legacy products into one, the live-ops concern (court
layout, match-state machine, the command pipeline) was scattered across Meet-named folders and route
files with no explicit owner. The coupling between "the engine that plans" and "the layer that runs
it live" and "the screen that shows it" was implicit.

We needed a decomposition that (a) reflects how the system actually divides responsibility, (b)
distinguishes what a *user enables* from what is *always-on infrastructure*, and (c) can be made
explicit and enforced rather than living in tribal knowledge.

## Decision

Describe the architecture as **four modules across two tiers**:

- **Tier 1 — user-facing, enableable** (`ModuleId = 'meet' | 'bracket' | 'display'`):
  **Meet** (scheduling engine), **Bracket** (draw engine), **Display** (read-only output). Each has a
  `workspace_modules` row and appears in the module catalog.
- **Tier 2 — architectural, always-on**: **Operations** (the live-ops layer). It owns real nav,
  routes, and a store slice, but has no enable flag — `ArchModuleId = ModuleId | 'operations'`.

Make the split **explicit and test-enforced** via the additive descriptor layer
`frontend/src/platform/contracts/moduleContract.ts`, which declares each module's owned/consumed
endpoints, produced/consumed DTOs, and the named cross-module edges, asserted honest by a colocated
test. See [Module contracts](/reference/contracts/).

## Consequences

- **Positive** — the seams are nameable and checkable; ownership of `/schedule*`, `/bracket*`,
  `/match-states*`+`/commands`, and the (route-less) Display is unambiguous; the contract test fails
  loudly if anyone claims an edge that does not exist.
- **Positive** — the user-facing surface stays simple (three enableable modules), while the
  always-on live-ops layer is still a first-class architectural citizen.
- **Negative / cost** — Operations is currently a *logical* module whose code still lives under
  `products/meet/` and Meet-named handlers; the descriptor names the ownership ahead of the folder
  move. Whether Operations should become a separately installable module or remain an always-on
  concern is an open product question (documented as a structural bet in the audit). For now it is
  Tier-2, always-on.

## See also

- [System overview](/explanation/architecture/system-overview) · [Operations module](/reference/modules/operations) · [Module contracts](/reference/contracts/)
