# Tournament draw formats

The Bracket module speaks six draw formats — single elimination (`se`), round robin
(`rr`), double elimination (`de`), Monrad (`monrad`), compass (`compass`), and Swiss
(`swiss`) — dispatched through a format registry on both sides of the wire
(`FORMAT_REGISTRY` in `apps/api/src/bracket/formats/`, `DRAW_FORMATS` in
`apps/console/src/modules/bracket/formatRegistry.tsx`). This page catalogs the format
vocabulary, records how each maps onto the data model, and tracks the remaining
roadmap (group stage, qualifying, ladder).

The headline: **a draw format is a play-unit DAG generator plus a renderer, not an
engine change.** Advancement is not a CP-SAT constraint — the bracket module
pre-resolves fully-formed matches and hands them to the shared solver (see
[Scheduling unification](/explanation/architecture/scheduling-unification) and
[System overview](/explanation/architecture/system-overview)). Any format whose structure can be
expressed as *play units with dependencies* rides the existing seams for free:
scheduling (`schedule-next` solves whichever play units are ready), result recording
(the idempotent command queue — [Bracket result queue](/explanation/architecture/bracket-result-queue)),
and Operations/Display consumption.

## Where formats live today

- **Generators** — `apps/api/src/bracket/formats/` holds
  `generate_single_elimination` (BWF-conformant seeding: seed 1 top, seed 2 bottom,
  seeds 3–4 in opposite quarters recursively; byes placed opposite the top seeds) and
  `generate_round_robin` (circle method). Both return a `Draw`: play units, a
  round-major `rounds` list, and a `slots` map.
- **The slot model** — `BracketSlot` (in `apps/api/src/bracket/draw.py`) is one side of a
  play unit and holds *exactly one of* `participant_id` or `feeder_play_unit_id`. A
  feeder reference means **"the winner of that play unit takes this slot"** — there
  is no loser reference. `advancement.py` propagates winners (and cascades `__BYE__`
  walkovers) into downstream slots when a result lands.
- **Dispatch** — generation and validation go **through the registry**, not a binary
  branch: `generate_event_route` in `apps/api/src/bracket/brackets.py` resolves `spec = get_format(body.format)`
  and generates via that format's generator, with `body.format` validated against
  `FORMAT_REGISTRY`. The frontend `DrawView.tsx` picks a renderer by the format's
  `renderer` key (`bracket | grid | segments | swiss`), not a hardcoded `se`/`rr` split.
- **Renderer** — the SE canvas draws a **mirrored** two-wing bracket converging on a
  centered Final (`computeBracketLayout`), panned/zoomed by `PanZoomCanvas` — see
  [Bracket draw canvas](/explanation/architecture/bracket-draw-canvas). Feeder slots render as
  "Winner of *M-R0-3*".

## Format catalog

| Format | Status | Notes |
| --- | --- | --- |
| Single elimination | **Shipped** | One-sided layout is the default; mirrored stays a wall-display option |
| Round robin | **Shipped** | Standings table (BWF tie-break chain) embedded in `EventOut.standings` |
| Double elimination | **Shipped** | Loser routing (`feeder_take`) + W/L/GF segments; optional grand-final reset (config) |
| Monrad / plate (classification) | **Shipped** | Full recursive classification (every position 1..N decided) or plate-only (config `consolation`) |
| Compass draw | **Shipped** | E/W/N/S/NE/NW/SE/SW spawn table; segments generated only when entries ≥ 2 |
| Swiss system | **Shipped** | R1 seed-fold + progressive `rounds/next` route (standings-driven pairing, bye rotation, no rematches) |
| Group stage (groups → knockout) | Roadmap | Phase-boundary resolution (generate the knockout from concrete pool standings) |
| Qualifying → main draw | Roadmap | Cross-draw *winner* feeds + "Qualifier" labeling (no loser routing needed) |
| Ladder | Roadmap | Not a draw; challenge-driven match creation — a different product surface |

:::info The per-format sections below are the original design analysis
The subsections that follow record the *design rationale* written before these
formats shipped — several read as "here's what it would need". For DE, Monrad,
compass, and Swiss that work is **done** (see [How the gaps were closed](#how-the-gaps-were-closed-2026-07-02));
read those sections as *why the shape maps onto the play-unit DAG*, not as open
work. Only group stage, qualifying, and ladder remain roadmap.
:::

### Single elimination (one-sided vs mirrored)

The classic knockout: lose once and you're out. Shipped and BWF-seeded. The only gap
is presentational — printed and televised brackets are almost always **one-sided**
(round 1 on the left, Final on the right), while the current canvas mirrors two wings
around a centered Final. A one-sided layout is a pure `computeBracketLayout` variant:
`N` columns instead of `2N − 1`, no wing split, same midpoint recursion.

### Round robin

Everyone plays everyone; used for small events and as the pool phase of larger ones.
Shipped (circle method, odd-count byes, multi-cycle `rr_rounds`). All play units have
concrete sides — no feeder slots — so nothing structural is missing. What *is*
missing is the payoff surface: a **standings table** (wins, then game/point
difference per BWF General Competition Regulations) next to the round grid.

### Group stage (groups → knockout)

The BWF Olympic format: pools of ~4 play round robin, the top 1–2 per pool advance to
a knockout. Each *phase* is already expressible (pools = N round-robin draws,
knockout = an SE draw). The composition is not: a knockout R1 slot needs to say
"1st of Group A" — a rank over a *set* of play units, which `feeder_play_unit_id`
(one play unit, winner-only) cannot express. Two options: extend the slot model with
a group-standings reference, or **resolve at the phase boundary** — generate the
knockout only once pools complete, placing concrete participants. The second is far
cheaper and matches how directors actually run it.

### Double elimination

Lose once, drop to the losers bracket; lose twice, you're out; brackets converge on a
grand final. Common in club/rec settings. Needs **loser routing**: a slot must be
able to say "the *loser* of M-R1-2 lands here". The `dependencies` DAG itself is
already general enough — the constraint is `BracketSlot` / `BracketSlotDTO` semantics
and the winner-only propagation in `advancement.py`. Rendering needs a second,
differently-shaped bracket stacked under the main one. Seeding is main-bracket-only;
byes create hollow early losers-bracket rounds.

### Monrad (classification / plate)

A knockout where every round's losers drop into consolation brackets and keep playing
until **every entrant has an exact final position** (1st through Nth). Very common in
badminton club and junior tournaments — everyone is guaranteed multiple matches.
Structurally it is single elimination plus loser-fed plate brackets, so it needs the
same loser routing as double elimination, plus **classification labels** ("5–8
bracket", "Position 7 match") instead of the current Final/SF/QF ladder. Byes distort
plate sizes when the entry count isn't a power of two — first-round bye "losers"
shouldn't drop into the plate.

### Compass draw

A non-elimination format (tennis/pickleball heritage, offered by Tournament
Planner–class software): winners go East, first-match losers go West, and each
subsequent loss moves you to another compass-point bracket (up to 8 mini-brackets).
Same structural need as Monrad — loser feeds — with a renderer that lays out a grid
of small one-sided brackets labeled by direction. Lower priority for badminton
specifically; Monrad covers the "everyone keeps playing" need in BWF culture.

### Qualifying draws

A pre-main knockout (BWF: up to 16 entries, up to 4 seeds) whose unbeaten survivors
fill designated **Qualifier** slots in the main draw; per BWF regulation the main
draw is published before qualifying finishes, with qualifier positions drawn by lot.
Notably this needs *no loser routing* — a qualifier is the **winner** of a qualifying
bracket's last round, so it is a winner-feed whose feeder lives in *another draw*.
The gaps are multi-draw plumbing (advancement currently propagates within one event's
draw) and "Qualifier" slot labeling.

### Swiss system

A fixed number of rounds, no elimination; each round pairs players on similar
cumulative scores, avoiding rematches. The DAG cannot be pre-generated — round `k+1`'s
pairings depend on round `k`'s results. But each generated round is round-robin-like
(concrete sides, no feeder slots), and the product already schedules **round by
round** (`schedule-next` — see [Bracket schedule streaming](/explanation/architecture/bracket-schedule-streaming)),
so Swiss fits the existing operational rhythm: *generate next round → schedule next
round*. What's needed is incremental generation (append rounds to a live draw — today
generation is all-rounds-upfront with `wipe=true` semantics), standings, and a
pairing algorithm.

### Ladder

A standing challenge ladder — players challenge upward, winners swap ranks. There is
no draw to generate and no natural event end; matches are created ad hoc. It shares
the progressive-generation machinery with Swiss but is really a different product
surface (a persistent ranking board), not a Bracket draw type. Deliberately last.

## How the gaps were closed (2026-07-02)

1. **Loser routing** — `BracketSlot.feeder_take: "winner" | "loser"` (default
   winner), threaded through generators, advancement, slot JSON (emitted only for
   loser feeds — persisted winner-only draws stay byte-identical), and labels
   ("Loser of X"). **Walkover policy:** a walkover has no real loser — byes and
   withdrawals feed `BYE` into consolation slots and the existing walkover sweep
   hollows the plate match (pinned by `test_advancement_loser_routing.py`).
   **Extended 2026-07-15:** a `retired` or `forfeit` loser is routed to BYE
   downstream the same way (its consolation / `feeder_take='loser'` slot becomes a
   BYE), but the stored `Result` keeps `walkover=False` and its `reason` set — a
   retirement is not reported as a walkover. The single predicate
   `advancement.py::loser_cannot_continue(walkover, reason)` gates all three; winner
   advancement is unchanged and there is deliberately no auto-withdrawal from the
   player's other draws.
2. **Format registry** — `FormatSpec {generate, progressive, has_standings,
   uses_bracket_size, normalize_config}`; DTO `format` fields are plain strings
   validated against the registry (adding a format = one entry, zero DTO churn).
   The frontend mirror (`FormatDescriptor`) carries the picker card copy, per-format
   config fields, and the renderer key (`bracket | grid | segments | swiss`).
3. **Segments** — `DrawSegment` + per-play-unit `segment` metadata (JSON `meta`
   column, no migration); `Draw.rounds` stays the global scheduling axis via
   dependency-wave layering (`formats/_waves.py`), so `round_index` / `match_index`
   keep their DB meaning and hydration round-trips.
4. **Progressive generation** — `POST /bracket/events/{id}/rounds/next` appends a
   standings-paired Swiss round with no wipe and no solver call; the new units are
   dependency-free and light up the existing *schedule next round* flow.
5. **Standings** — `apps/api/src/bracket/standings.py` (BWF chain: match wins → games
   ratio → points ratio → head-to-head → id; walkovers win with zero games/points),
   embedded in `EventOut.standings` for `has_standings` formats.
6. **Per-draw configuration** — the `BracketEvent.config` JSON column carries
   format knobs (DE `grand_final_reset`, Monrad `consolation`, Swiss
   `swiss_rounds`), validated by `normalize_config`; draft draws are edited via
   `PATCH /bracket/events/{id}` (config-only — never wipes participants).

Remaining (roadmap): group-stage phase composition, qualifying cross-draw feeds,
ladder, and real connector lines on the
[draw canvas](/explanation/architecture/bracket-draw-canvas).

## Roadmap — shipped and remaining

The original staged plan is mostly delivered. Status reflects the shipped
`FORMAT_REGISTRY`:

| Stage | Scope | Status |
| --- | --- | --- |
| **R1** | One-sided SE layout as the default (mirrored kept as a wall-display option) | ✅ **Shipped** |
| **R3** | Double elimination, Monrad, compass (loser routing + multi-segment renderer) | ✅ **Shipped** |
| **R4a** | Swiss (progressive `rounds/next` generation) | ✅ **Shipped** |
| **R2** | RR standings ✅ + group stage (pools → knockout via phase-boundary resolution) | ◑ **Standings shipped; group stage remaining** |
| **R4b** | Qualifying draws (cross-draw winner feeds) · ladder (persistent ranking board) | ⬜ **Remaining** |

What genuinely remains, and why it's harder than the shipped formats:

- **Group stage** delivers the most-requested real-world shape (the BWF
  group→knockout format). The pools and the knockout are each already expressible;
  what's missing is the *composition* — a knockout slot that says "1st of Group A"
  (a rank over a set of play units, which the winner-only `feeder_play_unit_id`
  can't express). The cheap path is phase-boundary resolution: generate the knockout
  with concrete participants once pools complete.
- **Qualifying** is cross-draw **winner**-feeds (a Qualifier is the winner of a
  qualifying draw's last round); it needs multi-draw advancement plumbing, since
  advancement currently propagates within one event's draw.
- **Ladder** shares Swiss's progressive-generation machinery but is really a
  different product surface (a persistent ranking board), not a Bracket draw type —
  deliberately last.
- **Presentation:** real connector lines on the [draw canvas](/explanation/architecture/bracket-draw-canvas).

## UI direction

:::info Largely shipped
The format-picker card grid and the per-format `DrawView` renderer registry
described below **shipped** with the draw-formats program — read this as the
delivered UI model (roadmap formats' cards render disabled), not a proposal.
:::

- **Format picker at draw creation.** Replace the `se`/`rr` dropdown with a card
  grid — one card per format, each with a mini-glyph (bracket tree, round grid,
  pools-then-tree, twin brackets, compass rose), a one-line description, and a
  "guaranteed matches" hint (the property directors actually choose formats by).
  Formats not yet implemented stay visible but disabled, which doubles as a roadmap.
- **Per-format canvas.** `DrawView` grows from a two-way branch into a registry keyed
  by format: one-sided/mirrored tree (SE), grid + standings (RR), pool cards feeding
  a tree (groups), stacked segments with named headers (DE/Monrad/compass), a
  round-column board (Swiss). All variants stay inside `PanZoomCanvas` so pan/zoom,
  fit-on-mount, and round-jump chips carry over unchanged.
- **Slot language.** Cells learn "Loser of X", "Qualifier 2", and "1st of Group A"
  alongside today's "Winner of X" and "Bye" — the slot model's semantics, surfaced.
