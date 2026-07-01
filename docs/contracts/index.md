# What a module contract is

A **module contract** is an explicit, typed statement of what one architectural module *owns*,
what it *consumes*, and what crosses the boundary between two modules. In ShuttleWorks these are
not prose conventions — they are a **test-enforced descriptor layer** in
`frontend/src/platform/contracts/moduleContract.ts`. This page is for developers who need to see the
module seams without tracing every import.

## Why it matters

The four modules are coupled by real seams: Meet's schedule feeds Operations' live layout, Bracket's
draw feeds the same layout, and Operations' match state feeds the public Display. Historically that
coupling was *implicit* — a Zustand selector here, a polling hook there, no single place that said
"this is the boundary and this is who owns it." The contract layer makes the coupling **explicit and
honest**, so a developer can see the seams without tracing every import.

## How it works

`moduleContract.ts` declares one `ModuleContract` descriptor per architectural module. Each encodes:

| Field | Meaning |
| --- | --- |
| `id` | the `ArchModuleId` — `'meet' \| 'bracket' \| 'display'` (Tier-1) or `'operations'` (Tier-2) |
| `enableable` | whether it is a user-facing module with a `workspace_modules` row (Operations: `false`) |
| `ownedSegments` | the left-nav segments this module's section renders |
| `ownedEndpoints` / `consumedEndpoints` | **references to real `apiClient` methods** it owns vs consumes |
| `produces` / `consumes` | the DTO type names that cross the wire (a compile-time union, `DtoName`) |
| `emits` / `reactsTo` | the named cross-module edges — the `SeamEdge` union `scheduleFinalized \| drawGenerated \| matchStateChanged` |

**Honesty is the invariant.** The colocated test (`__tests__/moduleContract.test.ts`) turns each
field into a checked assertion:

- `ownedSegments` are asserted against the **real** nav model (`buildWorkspaceNav`).
- `ownedEndpoints` / `consumedEndpoints` are checked by **referential identity** (`fn === fn`), not
  string matching — rename or remove a client method and this breaks.
- `produces` / `consumes` are constrained to `DtoName`, a union of real DTO type names — a typo or a
  removed DTO is a *type error*.
- `emits` / `reactsTo` are pinned to the honest `SeamEdge` set, so a descriptor cannot claim an
  unwired seam.

::: info Purely additive
The contract file is imported **only by its test**. It is never on an app runtime path — it
registers nothing, mounts nothing, mutates no store, and adds no router dependency. It establishes
ownership by *referencing* existing seams, not by rewiring them. No slice moves; no control-plane
edit. This is why it can be "honest, not aspirational": it describes what the code does today.
:::

## The four descriptors and the four seams

The descriptors are `meetContract`, `bracketContract`, `operationsContract`, `displayContract`. The
design names four seams between them; **three are wired** and have a contract page:

| Seam | Pair | Named edge | Page |
| --- | --- | --- | --- |
| **A** | Meet → Operations | `scheduleFinalized` | [Meet → Operations](/contracts/meet-operations) |
| **B** | Bracket → Operations | `drawGenerated` | [Bracket → Operations](/contracts/bracket-operations) |
| **C** | Operations → Bracket (advancement) | *(none)* | *unwired — see below* |
| **D** | Operations → Display | `matchStateChanged` | [Operations → Display](/contracts/operations-display) |

::: warning Mind the lettering
The three contract pages are the **wired** seams A, B, and **D**. Seam **C** is a *different*,
**deliberately unwired** seam — Operations → Bracket advancement. Advancement is intra-bracket today
(recording a result via `POST …/bracket/commands` resolves the next play-unit locally, with no call
into Operations), and the contract test asserts `bracketContract.reactsTo === []` so this seam cannot
be silently claimed. It is documented in
[Data flow](/architecture/data-flow#the-three-wired-seams), not here.
:::

::: warning Two different "Seam C" names
The data-flow lettering above reserves **Seam C** for the *unwired* Operations → Bracket advancement
edge. A code comment on `apiClient.recordBracketResultCommand` also says "Seam C" — but that is an
SP-G1 name for the **bracket result command path** (`POST …/bracket/commands`,
`submit_bracket_command`), which is **bracket-owned recording** surfaced through the Operations Run
UI, *not* a cross-module seam. See [Bracket result command queue](/architecture/bracket-result-queue).
:::

## What "the intended clean interface" means here

Each contract page describes both the **current implementation** (a store-subscription edge or a
polling hook) and the **intended clean interface**. Per the module-architecture-modernization design,
the intended interface today is the **naming and typing** of the existing seam — not a transport
refactor. The design is explicit that it *re-wires nothing*: it does not insert an emit call into any
store action or add a cross-store bridge. So "intended clean interface" means "this seam now has a
name, an owner, and a typed payload, enforced by a test" — with any push-transport or
boundary-lint enforcement called out as an explicit, out-of-scope future.

Read the three seam pages next.

## See also

- [Meet → Operations (Seam A)](/contracts/meet-operations) · [Bracket → Operations (Seam B)](/contracts/bracket-operations) · [Operations → Display (Seam D)](/contracts/operations-display)
- [Data flow](/architecture/data-flow) — the whole-system seam picture · [System overview](/architecture/system-overview)
- [ADR 0009 — Universal match contract](/decisions/0009-universal-match-contract) · [ADR 0006 — Unified scheduling core](/decisions/0006-unified-scheduling-core)
