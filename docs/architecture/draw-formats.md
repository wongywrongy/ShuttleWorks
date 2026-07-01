# Tournament draw formats

The Bracket module supports two draw formats today — single elimination (`se`) and
round robin (`rr`). This page catalogs the formats a badminton scheduling product is
eventually expected to speak (the vocabulary of BWF events and of Tournament
Planner–class software), assesses each against the existing data model, and lays out
a staged roadmap.

The headline: **a draw format is a play-unit DAG generator plus a renderer, not an
engine change.** Advancement is not a CP-SAT constraint — the bracket module
pre-resolves fully-formed matches and hands them to the shared solver (see
[Scheduling unification](/architecture/scheduling-unification) and
[System overview](/architecture/system-overview)). Any format whose structure can be
expressed as *play units with dependencies* rides the existing seams for free:
scheduling (`schedule-next` solves whichever play units are ready), result recording
(the idempotent command queue — [Bracket result queue](/architecture/bracket-result-queue)),
and Operations/Display consumption.

## Where formats live today

- **Generators** — `backend/services/bracket/formats/` holds
  `generate_single_elimination` (BWF-conformant seeding: seed 1 top, seed 2 bottom,
  seeds 3–4 in opposite quarters recursively; byes placed opposite the top seeds) and
  `generate_round_robin` (circle method). Both return a `Draw`: play units, a
  round-major `rounds` list, and a `slots` map.
- **The slot model** — `BracketSlot` (in `services/bracket/draw.py`) is one side of a
  play unit and holds *exactly one of* `participant_id` or `feeder_play_unit_id`. A
  feeder reference means **"the winner of that play unit takes this slot"** — there
  is no loser reference. `advancement.py` propagates winners (and cascades `__BYE__`
  walkovers) into downstream slots when a result lands.
- **Dispatch** — `generate_event_route` in `api/brackets.py` branches on
  `event.format` (`"se"` else `"rr"`); the frontend `DrawView.tsx` branches the same
  way between the mirrored bracket canvas and `RoundRobinView`.
- **Renderer** — the SE canvas draws a **mirrored** two-wing bracket converging on a
  centered Final (`computeBracketLayout`), panned/zoomed by `PanZoomCanvas` — see
  [Bracket draw canvas](/architecture/bracket-draw-canvas). Feeder slots render as
  "Winner of *M-R0-3*".

## Format catalog

| Format | Fits the play-unit DAG today? | What's missing |
| --- | --- | --- |
| Single elimination | **Yes** (shipped) | One-sided layout option (most real brackets are one-sided) |
| Round robin | **Yes** (shipped) | Standings table + tie-breaks |
| Group stage (groups → knockout) | Structurally yes | Phase boundary: "winner of Group A" is a *standings* reference, not a single-feeder reference |
| Double elimination | No | **Loser routing** in the slot model + advancement |
| Monrad / plate (classification) | No | Loser routing + classification labels (positions 1..N) |
| Compass draw | No | Loser routing + multi-segment canvas |
| Qualifying → main draw | Almost | Cross-draw *winner* feeds + "Qualifier" labeling (no loser routing needed) |
| Swiss system | Structurally different | **Progressive generation** — pairings computed between rounds |
| Ladder | Weak fit | Not a draw; challenge-driven match creation |

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
round** (`schedule-next` — see [Bracket schedule streaming](/architecture/bracket-schedule-streaming)),
so Swiss fits the existing operational rhythm: *generate next round → schedule next
round*. What's needed is incremental generation (append rounds to a live draw — today
generation is all-rounds-upfront with `wipe=true` semantics), standings, and a
pairing algorithm.

### Ladder

A standing challenge ladder — players challenge upward, winners swap ranks. There is
no draw to generate and no natural event end; matches are created ad hoc. It shares
the progressive-generation machinery with Swiss but is really a different product
surface (a persistent ranking board), not a Bracket draw type. Deliberately last.

## Gap analysis

1. **Loser routing** — the load-bearing gap for double elimination, Monrad, and
   compass. `BracketSlot` (backend) and `BracketSlotDTO` (frontend, in
   `api/bracketDto.ts`) express "winner of feeder" only; `_record_and_propagate`
   moves winners only; `labelFor` in `DrawView.tsx` prints only "Winner of X".
   The fix is one new field with a default — e.g. `feeder_take: "winner" | "loser"`
   — threaded through slot construction, advancement, serialization, and labels.
   The walkover sweep needs care: a bye's "loser" must not advance into a plate.
2. **Format registry** — `"se" | "rr"` is hardwired in the `EventIn` DTO, the DB
   column, the generate-route branch, and the `DrawView` branch. `Event` already
   carries `format_plugin_name`; new formats should extend that into a real
   generator/renderer registry rather than growing if-chains.
3. **Multi-phase composition** — no phase concept: no group-standings slot
   references, no cross-draw feeders. Phase-boundary resolution (generate the next
   phase from concrete standings) avoids most of this.
4. **Progressive generation** — Swiss/ladder need "append a round to a live draw";
   today regeneration wipes. The scheduling side already works round-by-round.
5. **Standings + tie-breaks** — no ranking computation for RR pools, groups, or
   Swiss (BWF tie-break chain: matches won → games ratio → points ratio → head-to-head).
6. **Segment labeling** — round labels assume one bracket (Final/SF/QF). Monrad and
   compass need named segments ("Plate", "5–8", "West") and classification outcomes.
7. **Renderer variants** — one-sided SE layout; stacked multi-bracket canvases;
   pools-plus-knockout composite view; real connector lines (already a known
   follow-up on the [draw canvas](/architecture/bracket-draw-canvas)).

## Recommended roadmap

| Stage | Scope | Effort | Touches |
| --- | --- | --- | --- |
| **R1** | One-sided SE layout — **make it the default**, keep mirrored as an option | Small | Renderer only |
| **R2** | RR standings + group stage (pools → knockout via phase-boundary resolution) | Medium | New generator glue + standings service + composite view |
| **R3** | Double elimination, Monrad, compass | Large | Slot model + DTO + advancement + generators + multi-segment renderer |
| **R4** | Qualifying draws, Swiss, ladder | Medium–large each | Cross-draw feeds (qualies); progressive generation (Swiss/ladder) |

- **R1** is pure `DrawView.tsx`: a second layout function beside
  `computeBracketLayout`, a toggle, one-sided by default. Real brackets read
  left-to-right; the mirrored view stays as the "wall display" option.
  `DrawView.centered.test.tsx` pins the mirrored geometry today and would be
  re-pinned around the new default.
- **R2** delivers the single most-requested real-world shape (the BWF group→knockout
  format) without touching the slot model, and gives round robin its missing payoff.
- **R3** is the structural investment. Land loser routing once, and double
  elimination, Monrad, and compass become three generators over the same primitive.
  Prioritize **Monrad** among them — it is the badminton-native consolation format.
- **R4** rides R2/R3 machinery: qualifying is cross-draw winner-feeds; Swiss and
  ladder are progressive formats whose between-rounds generation step slots into the
  existing *schedule next round* rhythm rather than fighting it.

## UI direction

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
