# Contract: Operations → Display (Seam D)

The Operations layer produces live match state; the Display reads it to render the public TV view.
This is **Seam D**, the `matchStateChanged` edge. This page is for developers working either side of
the floor-to-screen boundary.

| | |
| --- | --- |
| **Direction** | Operations → Display |
| **Named edge** | `matchStateChanged` |
| **Payload** | `MatchStateDTO` (plus `TournamentStateDTO`, `BracketTournamentDTO`) |
| **Transport today** | Display's own dual poll: ~5 s match-state + ~10 s tournament-state |
| **Status** | **wired** |

## What crosses the boundary

The live **`MatchStateDTO`** — per-match status (`scheduled / called / playing / finished /
retired`), actual start/end timestamps, and score. Display renders this as the public courts /
standings view. Display also reads two more DTOs to complete the picture:

- **`TournamentStateDTO`** — the persisted workspace state (config, roster, schedule) it draws the
  static layout from.
- **`BracketTournamentDTO`** — the bracket snapshot, for bracket events.

Display is **read-only**: it consumes these three and produces nothing. The edge it reacts to is the
match-state write — `matchStateChanged`.

## Which side owns what

| Artifact | Owner | Notes |
| --- | --- | --- |
| `MatchStateDTO` (live status) | **Operations** | `operationsContract.produces = ['MatchStateDTO']`; emits `matchStateChanged` |
| `/match-states*` routes | **Operations** | owned |
| `TournamentStateDTO` (`/state`) | **Control plane** | shared; Display consumes |
| `BracketTournamentDTO` (`/bracket`) | **Bracket** | Display consumes |
| The public TV rendering | **Display** | `displayContract.consumedEndpoints = [getTournamentState, getMatchStates, getBracket]`; `produces = []`, `emits = []` |

Display declares `reactsTo: ['matchStateChanged']` and `emits: []` — the read-only output module. It
owns **no backend route**.

## What the current implementation does

1. An operator action on the Operations **Run** surface flows through the command pipeline and writes
   a `match_states` row; that write **is** the `matchStateChanged` edge.
2. Display runs **two independent polling loops of its own** — ~5 s for `GET …/match-states`
   (`useLiveTracking`) and ~10 s for `GET …/state` (`useDisplaySync`) — plus a read of `…/bracket`
   for bracket events. It never subscribes to another module's Zustand store; it polls the API.
3. In **cloud-mirror mode**, the public `/display` page instead reads **Supabase Realtime** (the
   outbox mirrors the match/bracket writes), with the poll as fallback. Either way the data
   originates from the Operations-owned match state.

## What the intended clean interface looks like

The intended interface today is the **named, typed, read-only seam**: `matchStateChanged`, payload
`MatchStateDTO` (with the supporting `TournamentStateDTO` / `BracketTournamentDTO`), Operations as the
producer, Display as a strictly read-only consumer that owns no route and writes nothing. The design
proposes **no transport change** — the dual poll (and the Realtime path in cloud mode) is accepted
as-is.

The value of the contract is the guarantee it pins: Display **only reacts** and **emits nothing**
(`displayContract.emits === []`), so the public output can never become a writer or develop a
back-channel into another module without the contract — and its test — changing. A push-only,
single-subscription transport would be a cleaner future, but it is out of scope for the additive
contract layer.

## See also

- [Data flow](/architecture/data-flow) · [Display module](/modules/display) · [Operations module](/modules/operations)
- [Signals API](/api/signals) — the other read-only, poll-driven cross-cutting surface
