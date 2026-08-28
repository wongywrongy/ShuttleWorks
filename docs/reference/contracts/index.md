# What a module contract is

A **module contract** is an explicit, typed statement of what one architectural module *owns*,
what it *consumes*, and what crosses the boundary between two modules. In ShuttleWorks these are
not prose conventions — they are a **test-enforced descriptor layer** in
`frontend/src/platform/contracts/moduleContract.ts`. This page is for developers who need to see the
module seams without tracing every import.

## Why it matters

The five modules are coupled by real seams: Entries' confirmed entries become roster players, Meet's
schedule feeds Operations' live layout, Bracket's draw feeds the same layout, and Operations' match
state feeds the public Display. Historically that
coupling was *implicit* — a Zustand selector here, a polling hook there, no single place that said
"this is the boundary and this is who owns it." The contract layer makes the coupling **explicit and
honest**, so a developer can see the seams without tracing every import.

## How it works

`moduleContract.ts` declares one `ModuleContract` descriptor per architectural module. Each encodes:

| Field | Meaning |
| --- | --- |
| `id` | the `ArchModuleId` — `'meet' \| 'bracket' \| 'display' \| 'entries'` (Tier-1) or `'operations'` (Tier-2) |
| `enableable` | whether it is a user-facing module with a `workspace_modules` row (Operations: `false`) |
| `ownedSegments` | the left-nav segments this module's section renders |
| `ownedEndpoints` / `consumedEndpoints` | **references to real `apiClient` methods** it owns vs consumes |
| `produces` / `consumes` | the DTO type names that cross the wire (a compile-time union, `DtoName`) |
| `emits` / `reactsTo` | the named cross-module edges — the `SeamEdge` union `scheduleFinalized \| drawGenerated \| matchStateChanged \| entriesCommitted` |

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

### Meet lineup boundary

Meet owns `apiClient.generateMeetLineup`, which posts the caller's current
`TournamentStateDTO` to `POST /tournaments/{tournament_id}/meet/lineup`. The endpoint is a pure
preview over that posted state: authorization reads workspace membership, while generation itself
does not load or write tournament state, persist anything, change a state version, or invoke CP-SAT.
It considers configured numbered positions (`MS1`, `XD1`, and so on), while a bare division code
(`MS`, `U10`) remains unseated until the operator explicitly uses the roster's seating action.
Confirmed doubles are projected across two `PlayerDTO` rows linked by mutual division-keyed
`partnerPlayerIds`; the pair occupies one numbered doubles position rather than becoming a merged
roster row. Ambiguous same-division partner projections are refused rather than overwritten, and
interactive roster consumers cap persisted position counts at Meet Setup's 20-position limit. The
current generator emits dual matches only because no tri-generation path exists in the tree. This
contract keeps seating before the server's pure lineup preview as two distinct steps.

## The five descriptors and the seams

The descriptors are `meetContract`, `bracketContract`, `operationsContract`, `displayContract` and
`entriesContract`. The design letters four seams between the original four modules; **three are
wired** and have a contract page:

| Seam | Pair | Named edge | Page |
| --- | --- | --- | --- |
| **A** | Meet → Operations | `scheduleFinalized` | [Meet → Operations](/reference/contracts/meet-operations) |
| **B** | Bracket → Operations | `drawGenerated` | [Bracket → Operations](/reference/contracts/bracket-operations) |
| **C** | Operations → Bracket (advancement) | *(none)* | *unwired — see below* |
| **D** | Operations → Display | `matchStateChanged` | [Operations → Display](/reference/contracts/operations-display) |

A fifth wired edge joined them with the Entries module and is deliberately **outside that
lettering**:

| Seam | Pair | Named edge | Page |
| --- | --- | --- | --- |
| **the commit seam** | Entries → Meet \| Bracket | `entriesCommitted` | [Entries](/reference/modules/entries#the-commit-seam) |

::: warning `entriesCommitted` is not a store subscription
The other three edges are poll or store-subscription edges. This one is an **operator-pressed,
server-side commit** that writes roster players. It is named in the same union because the honesty
rule is about whether an edge *exists*, not about which mechanism carries it. Note also that the
Entries design spec letters its own seams and calls this one "Seam A" — unrelated to Seam A above.
Use the edge name, not the letter.
:::

::: warning Mind the lettering
The three contract pages are the **wired** seams A, B, and **D**. Seam **C** is a *different*,
**deliberately unwired** seam — Operations → Bracket advancement. Advancement is intra-bracket today
(recording a result via `POST …/bracket/commands` resolves the next play-unit locally, with no call
into Operations), and the contract test asserts `bracketContract.reactsTo === []` so this seam cannot
be silently claimed. It is documented in
[Data flow](/explanation/architecture/data-flow#the-three-wired-seams), not here.
:::

::: warning Two different "Seam C" names
The data-flow lettering above reserves **Seam C** for the *unwired* Operations → Bracket advancement
edge. A code comment on `apiClient.recordBracketResultCommand` also says "Seam C" — but that is an
SP-G1 name for the **bracket result command path** (`POST …/bracket/commands`,
`submit_bracket_command`), which is **bracket-owned recording** surfaced through the Operations Run
UI, *not* a cross-module seam. See [Bracket result command queue](/explanation/architecture/bracket-result-queue).
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

- [Meet → Operations (Seam A)](/reference/contracts/meet-operations) · [Bracket → Operations (Seam B)](/reference/contracts/bracket-operations) · [Operations → Display (Seam D)](/reference/contracts/operations-display)
- [Data flow](/explanation/architecture/data-flow) — the whole-system seam picture · [System overview](/explanation/architecture/system-overview)
- [ADR 0009 — Universal match contract](/explanation/decisions/0009-universal-match-contract) · [ADR 0006 — Unified scheduling core](/explanation/decisions/0006-unified-scheduling-core)
- [Glossary](/reference/glossary) — seam, module, contract, and the rest of the vocabulary · [Operational scenarios](/explanation/architecture/operational-scenarios) — the seams in a day's flow
