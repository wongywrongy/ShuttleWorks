# Contract: Bracket → Operations (Seam B)

The Bracket engine produces a draw snapshot; the Operations layer lays out its bracket-origin matches
as live court rows. This is **Seam B**, the `drawGenerated` edge.

| | |
| --- | --- |
| **Direction** | Bracket → Operations |
| **Named edge** | `drawGenerated` |
| **Payload** | `BracketTournamentDTO` |
| **Transport today** | ~2.5 s poll of `GET …/bracket` |
| **Status** | **wired** |

## What crosses the boundary

A **`BracketTournamentDTO`** — the full bracket snapshot. It is an aggregate: it carries the
granular `PlayUnitDTO` (the playable units), `AssignmentDTO` (their court/slot placements), and
`ResultDTO` (recorded outcomes), plus participants, *inside* it. Operations reads the snapshot to lay
out the bracket-origin matches in its **Courts** and **Live** views.

Note the granularity choice: the contract declares Operations `consumes: ['BracketTournamentDTO']` —
the **aggregate** — not the inner `PlayUnitDTO` / `AssignmentDTO` / `ResultDTO` as standalone
consumed types. Those ride inside the aggregate; treating the snapshot as the unit of exchange keeps
the seam coarse and honest.

## Which side owns what

| Artifact | Owner | Notes |
| --- | --- | --- |
| `BracketTournamentDTO` (the snapshot) | **Bracket** | `bracketContract.produces` includes `BracketTournamentDTO` (with `PlayUnitDTO`/`AssignmentDTO`/`ResultDTO`) |
| `/bracket*` routes incl. `getBracket` | **Bracket** | owned |
| Reading the snapshot for live layout | **Operations** | `operationsContract.consumedEndpoints = [apiClient.getBracket]` |
| The live court layout of bracket matches | **Operations** | built from the snapshot |

Bracket declares `emits: ['drawGenerated']`. Operations consumes the snapshot but — importantly —
declares `reactsTo: ['scheduleFinalized']` only; the bracket read is via the **`getBracket` poll**,
recorded as a `consumedEndpoint`, not a store-subscription edge it "reacts to".

## What the current implementation does

1. Bracket generates/updates a draw; the changes are persisted under `/tournaments/{id}/bracket`.
2. Operations (and the bracket-live surfaces) **poll** `GET …/bracket` (~2.5 s, `useBracket`) and
   receive the `BracketTournamentDTO`.
3. `bracketToOperational(data)` in `lib/operations/operationalMatch.ts` folds the snapshot into the
   engine-agnostic `OperationalMatch` rows. Because brackets record only a winner (never a point
   tally), the operational `score` is always `undefined` for bracket rows.
4. There is no push edge: `drawGenerated` names the existing poll-fed seam, it does not denote an
   event emission.

## What the intended clean interface looks like

The intended interface today is the **named, typed seam** — `drawGenerated`, payload
`BracketTournamentDTO`, with Bracket as producer and Operations as the consumer that reads via
`getBracket`. The design proposes **no transport change** for this seam: the ~2.5 s poll is accepted
as-is.

The honest caveat the descriptors encode is what is *not* here: **Seam C (Operations → Bracket
advancement) stays unwired.** Advancement is intra-bracket (`POST …/bracket/results` materialises the
next play-unit locally, with no call into Operations). Wiring a bracket-origin match *finish* in
Operations to drive advancement would be new cross-module runtime behaviour — deferred to its own
behaviour-change PR with correctness tests. The contract test asserts `bracketContract.reactsTo === []`
precisely so this cannot be silently added without updating the contract and shipping the behaviour.

A genuinely cleaner future (a Realtime subscription replacing the bracket poll, mirroring the planned
`subscribeToBracketMatches` work for live actions) is recognised and out of scope for the contract
layer itself.

## See also

- [Data flow → the three wired seams](/architecture/data-flow#the-three-wired-seams)
- [Bracket module](/modules/bracket) · [Operations module](/modules/operations)
