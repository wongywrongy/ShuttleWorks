# Contract: Bracket → Operations (Seam B)

The Bracket engine produces a draw snapshot; the Operations layer lays out its bracket-origin matches
as live court rows. This is **Seam B**, the `drawGenerated` edge. This page is for developers working
either side of the draw-to-floor boundary.

| | |
| --- | --- |
| **Direction** | Bracket → Operations |
| **Named edge** | `drawGenerated` |
| **Payload** | `BracketTournamentDTO` |
| **Transport today** | ~2.5 s poll of `GET …/bracket` (`useBracket`) |
| **Status** | **wired** |
| **Criticality** | **High** for bracket-origin live layout, but **self-healing**: it is a poll, so a transient failure only delays a refresh (the next poll recovers) and Meet-origin matches are unaffected. No write crosses here, so nothing can be corrupted. |
| **Risk / fragility** | Up to ~2.5 s staleness; the coarse aggregate `BracketTournamentDTO` re-sends the whole snapshot on any change. Note the semantics: Operations **pulls** via `getBracket` and declares `reactsTo: ['scheduleFinalized']` only — it does *not* "react to" `drawGenerated`, so code that assumes a push notification on a new draw would be wrong. |

## What crosses the boundary

A **`BracketTournamentDTO`** — the full bracket snapshot. It is an aggregate: it carries the
granular `PlayUnitDTO` (the playable units), `AssignmentDTO` (their court/slot placements), and
`ResultDTO` (recorded outcomes), plus participants, *inside* it. Operations reads the snapshot to lay
out the bracket-origin matches in its **Plan** and **Run** surfaces. (Plan and Run were formerly
named *Courts* and *Live*.)

Note the granularity choice: the contract declares Operations `consumes: ['ScheduleDTO',
'BracketTournamentDTO']` — the bracket side is the **aggregate**, not the inner `PlayUnitDTO` /
`AssignmentDTO` / `ResultDTO` as standalone consumed types. Those ride inside the aggregate; treating
the snapshot as the unit of exchange keeps the seam coarse and honest.

## Which side owns what

| Artifact | Owner | Notes |
| --- | --- | --- |
| `BracketTournamentDTO` (the snapshot) | **Bracket** | `bracketContract.produces` includes `BracketTournamentDTO` (with `PlayUnitDTO` / `AssignmentDTO` / `ResultDTO`) |
| `/bracket*` routes incl. `getBracket` | **Bracket** | owned |
| Reading the snapshot for live layout | **Operations** | `operationsContract.consumedEndpoints = [apiClient.getBracket]` |
| The live court layout of bracket matches | **Operations** | built from the snapshot |

Bracket declares `emits: ['drawGenerated']`. Operations consumes the snapshot but — importantly —
declares `reactsTo: ['scheduleFinalized']` only; the bracket read is via the **`getBracket` poll**,
recorded as a `consumedEndpoint`, not a store-subscription edge it "reacts to".

## What the current implementation does

1. Bracket generates/updates a draw; the changes are persisted under `/tournaments/{id}/bracket`.
2. Operations (and the bracket Run surface) **poll** `GET …/bracket` (~2.5 s, `useBracket`) and
   receive the `BracketTournamentDTO`.
3. `bracketToOpsBlocks(data)` in `products/operations/opsBlock.ts` folds the snapshot into the
   canonical engine-agnostic `Match` / `OpsBlock` rows (ADR 0009) — the *same* shape the meet engine
   folds into, so both engines interleave on one board. The row carries layout and status only; it has
   **no score field**, so a bracket's `winner_side` (and any format-specific score) stays in the
   bracket result record, never on the operational row.
4. There is no push edge: `drawGenerated` names the existing poll-fed seam, it does not denote an
   event emission.

## What the intended clean interface looks like

The intended interface today is the **named, typed seam** — `drawGenerated`, payload
`BracketTournamentDTO`, with Bracket as producer and Operations as the consumer that reads via
`getBracket`. The design proposes **no transport change** for this seam: the ~2.5 s poll is accepted
as-is.

The honest caveat the descriptors encode is what is *not* here: **Seam C (Operations → Bracket
advancement) stays unwired.** Advancement is intra-bracket — recording a result through
`POST …/bracket/commands` (the bracket result command queue) resolves the next play-unit locally, with
no call into Operations. Wiring a bracket-origin match *finish* in Operations to drive advancement
would be new cross-module runtime behaviour — deferred to its own behaviour-change PR with correctness
tests. The contract test asserts `bracketContract.reactsTo === []` precisely so this cannot be silently
added without updating the contract and shipping the behaviour.

::: warning Recording is bracket-owned, not Seam C
The result-recording command path (`recordBracketResultCommand` → `POST …/bracket/commands`) is
**bracket-owned recording** surfaced through the Operations Run UI. A code comment calls it "Seam C",
but that is an SP-G1 name for the command path — distinct from the *data-flow* Seam C, the still-unwired
Operations → Bracket advancement edge described above. See
[Bracket result command queue](/architecture/bracket-result-queue).
:::

A genuinely cleaner future — a Realtime subscription replacing the bracket poll, mirroring the planned
push-transport work for live actions — is recognised and out of scope for the contract layer itself.

## See also

- [Data flow → the three wired seams](/architecture/data-flow#the-three-wired-seams)
- [Bracket result command queue](/architecture/bracket-result-queue) · [ADR 0007 — Bracket result command queue](/decisions/0007-bracket-result-command-queue)
- [Bracket module](/modules/bracket) · [Operations module](/modules/operations)
- [ADR 0009 — Universal match contract](/decisions/0009-universal-match-contract)
