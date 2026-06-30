# How to wire a seam

**Goal:** add (or formally declare) a typed edge between two modules — and keep
the test-enforced module contract honest about it.

A "seam" is a named cross-module dependency. ShuttleWorks declares them in
`platform/contracts/moduleContract.ts`; the colocated test holds every
declaration to the real app, so you cannot claim a seam the code doesn't have —
or ship one the contract doesn't name.

::: info Requirements
Read [Module contracts](/contracts/) and [Data flow → the three wired
seams](/architecture/data-flow#the-three-wired-seams) first. A new seam is a
**behaviour change** — it ships with running code, not just a contract edit.
:::

## The contract vocabulary

Each module's `ModuleContract` declares what crosses its boundary:

| Field | Meaning |
|---|---|
| `produces` / `consumes` | DTO type names that cross the wire (compile-time `DtoName` union) |
| `ownedEndpoints` / `consumedEndpoints` | real `apiClient` methods (checked by referential identity) |
| `emits` / `reactsTo` | named `SeamEdge` store-subscription / poll edges |

`SeamEdge` is the honest set of edges: `'scheduleFinalized' | 'drawGenerated' |
'matchStateChanged'`. The three wired seams are **A** (Meet→Operations,
`scheduleFinalized`), **B** (Bracket→Operations, `drawGenerated`), and **D**
(Operations→Display, `matchStateChanged`).

## To wire a new edge

1. **Pick the transport.** A store-subscription/poll edge → add a `SeamEdge`
   name. A request/response handoff → it's an endpoint (use
   [add-an-api-endpoint](/how-to/add-an-api-endpoint)) listed as `consumedEndpoints`
   on the consumer, `ownedEndpoints` on the owner.
2. **Declare it honestly.** For an edge, add the name to the producer's `emits`
   and the consumer's `reactsTo`. For a DTO, add it to `produces`/`consumes`.
3. **Ship the behaviour in the same PR.** The contract test pins the edge set, so
   the literals and the runtime wiring must land together — that coupling is the
   point.

## Worked example — the unwired Seam C

Seam **C** (Operations → Bracket *advancement*) is **deliberately not wired**:
bracket advancement is intra-bracket, so `bracketContract.reactsTo` is `[]` and
the test asserts it stays empty ("Seam C stays unwired"). To wire it you would
add an `'advancementRequested'` `SeamEdge`, set `operationsContract.emits` +
`bracketContract.reactsTo`, and ship the runtime path — all in one behaviour PR.
The failing test is the forcing function.

::: warning Two things called "Seam C"
The code comment in `useBracketResultQueue.ts` calls the bracket-result **command
endpoint** ("SP-G1 Seam C") — that is bracket-owned result recording surfaced
through the Operations Run UI, **not** the unwired advancement edge above. The
canonical seam naming (A/B/C/D) lives in
[Data flow](/architecture/data-flow#the-three-wired-seams).
:::

## Verify

```bash
cd products/scheduler/frontend
npx vitest run src/platform/contracts   # the seam literals must match the honest set
```

## See also

- [Module contracts](/contracts/) · [Data flow](/architecture/data-flow)
- [How to add an API endpoint](/how-to/add-an-api-endpoint)
