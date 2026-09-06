# Contract: the match card family

**Status:** Proposed — 2026-09-06, v3 consolidated plan work package 09. Baseline `37168e03`.
Amended by work package 29 (structured sides on the wire): §2.0 below records, member by member,
what each tier's wire actually carries — the page no longer describes anything unimplemented
without saying so.

This page is the **acceptance oracle for packages 10, 11 and 17**. Package 09's brief was to
"correct the MatchCard specification and mockup". The second pass's HTML mockup is not in the
repository; plan §3 records every decision taken on it, and this page is the corrected
specification that replaces it. Where the mockup and plan §3 disagree, **§3 wins and this page
states the corrected rule**; §7 below maps every one of plan §3's ten "MatchCard corrections
required before approval" bullets and every MatchCard-related §3 decision row to the section that
resolves it.

It builds directly on [State, identity, time and formatting](/reference/contracts/state-and-formatting)
(package 02). That page fixes *meanings*; this page fixes the *anatomy* that renders them. Any
conflict is resolved in favour of the state-and-formatting contract.

[[toc]]

---

## 1. Scope and the governing ruling

### 1.1 The ruling

Plan §3, row "One MatchCard component with identical DOM everywhere" — **Adapt**:

> One data contract and shared person/side/ledger primitives, with semantic table, card, bracket
> and signage renderers. The supplied HTML already uses different DOM structures.

So the family is **one data contract + four renderers**, not one component:

| Layer | What is shared | What is not |
| --- | --- | --- |
| **Data** (§2) | `MatchCardData` — one tier-neutral shape every renderer consumes | nothing; there is exactly one shape |
| **Primitives** (§3) | `PersonLine`, `SideBlock`, `Ledger`, `StateWord`, `IdentityChip` — the semantics, ink rules and text | their layout, which each renderer owns |
| **Renderers** (§4) | the *behaviour* they must exhibit, asserted semantically | their DOM. A table row is a `tr`; a card is an `article`; a bracket node is a positioned `article`; the board is a court tile. |

**A test may never require identical DOM across renderers**, and may never forbid a branch on
renderer type (plan §6, corrections to negative controls). It asserts *equivalent semantic
outcomes*: the same winner, the same games, the same accessible summary, the same absent tick.

### 1.2 In scope

Every surface that renders a match as an identifiable unit:

- console operator tables and inventories (`apps/console/src/modules/meet/matches/`,
  `apps/console/src/modules/bracket/`, the Operations Plan/Run lists);
- `apps/console/src/components/control-plane/MatchCard.tsx` and `ResultSides`;
- `apps/console/src/components/MatchChip.tsx` (the compact board chip — a *degenerate* renderer,
  §4.5);
- `apps/console/src/modules/bracket/DrawView.tsx` draw nodes;
- `apps/console/src/modules/display/publicDisplay/CourtsView.tsx` and
  `bracketDisplay/BracketLiveView.tsx` (signage);
- `apps/entrant/app/components/MatchCard.tsx` with its `card`, `canvas` and `bracket-node`
  variants, and `PersonGroup.tsx` / `PersonRef.tsx` / `public/assets/person-ref.js`.

### 1.3 Out of scope

Draw *generation*, scheduling, the command queue, and every backend rule other than the
projections that state-and-formatting §§2–9 already fixes. This page prescribes no CSS spelling
and no class names — only semantics, ink *roles*, size *floors* and behaviour.

---

## 2. The data contract

Tier-neutral, TypeScript-style. Both tiers converge on this shape; the console's move from
pre-joined side strings to structured sides is the D17 change already ruled in
state-and-formatting §6.4 (and split into package 10a by ruling C4).

::: warning §2.0 — what the wire carries today (amended, v3 package 29)
This page was written as an acceptance oracle before any of it shipped, and the shape below is
still the target. Three of its members are **not on either wire**, and this section says so
rather than leaving the page describing an aspiration (V3-11-3). A contract that overstates what
exists cannot be used to judge anything.

| Contract member | On the wire? | What the wire carries instead, and why |
| --- | --- | --- |
| `Side.persons` / `Side.unresolved` (§2.1) | **Yes**, both tiers | Operator: `PlayUnitOut.sides` (`shared/sides.py`). Public: `SideDTO.unresolved` / `PlayerMatchSideDTO.unresolved` / `ScheduleSideDTO.unresolved` (`entries_site.py`). Every discriminant in §2.1 is emitted except `withheld` (see below). |
| `unresolved: { kind: 'withheld' }` | **No, deliberately** | Person publication is gated **per person**, not per side: one side may hold one published and one withheld person, which a side-level flag cannot say. The backend already mints the withheld one as `PersonReferenceDTO(resolution: 'dead', label: 'Player not published')` and the renderer prints it (§2.3). The `withheld` member stays in the union for a tier that ever needs a whole-side gate; nothing emits it today. |
| `unresolved.known` on the PUBLIC tier | Present but **always empty** | The side's own `persons` (or, on `SideDTO`, the `TeamDTO` joined by `participantKey`) is the known set and has already been through the publication and erasure gates. Projecting the same people a second time would put two gated copies of one identity on one wire, free to diverge. The operator wire, which has no publication gate, populates it. |
| `unresolved.winner_of.matchIdentity` | **Not a `MatchIdentity`** | The operator wire carries the RAW feeder play-unit id in `reference`, and `matchIdentity.ts` / `bracketLabels.ts` resolve it — §6.3/D16 keeps one round-label speller per tier. The public wire, which has no such authority, carries the already-formatted human reference ("SF 1") in the same field, from the same locator that spells the legacy `placeholder` string. |
| `outcome: MatchOutcome` with `kind` | **No** | The public wire states the same fact as `status` (`scheduled` / `called` / `live` / `delayed` / `completed` / `walkover` / `retired` / `cancelled`, `null` when unrecognised — never coerced, D7) plus `decided` and a per-side `winner` boolean. `retiredSide` / `absentSide` are **not stored anywhere**: a bracket result records `winner_side`, `walkover` and a free-text `reason`, so which side retired is not a fact the product holds. Adding an `outcome` object would re-project `status` and invent the other half. |
| `Game.state` / `Game.winner` | **No** | The score is a flat `number[][]` of recorded game scores. Per-game completion is a function of the scoring configuration (`pointsPerSet`, `deuceEnabled`, `setsToWin`) and the public tier does not carry that configuration, so `state` cannot be computed honestly there — and §2.7 rule 2 forbids deriving it from "which number is larger". §2.7's four rules still bind every renderer; they are enforced by the renderer never emphasising a cell off the match winner, not by a `state` field. |
| `publication.scoresPublished` | **Yes**, added in package 29 | `PlayerMatchDTO.scoresPublished`. It is not recoverable from `score === null` — an unplayed match has no score either — and before it existed the accessible summary announced "Score not published" over every future match on the calendar. |
| `publication.personsPublished` | **No, and not needed** | Same reason as `withheld`: person publication arrives already applied, per person, as a dead reference with the fixed label. There is no per-match person-publication fact for a renderer to read. |
| `identity` / `reference` / `matchState` | Console only | `matchIdentity.ts` derives them console-side. The public tier carries `MatchNodeDTO.position` (rendered as "Match {n}") and `status`. |

Everything else in §2 is implemented on both tiers.
:::

```ts
interface MatchCardData {
  /** Stable, derived once. Never parsed back out of an opaque machine id. */
  identity: MatchIdentity;          // console: platform/domain/matchIdentity.ts
  /** The one human reference, e.g. "R32·1", "QF2", "R3·7", "MS1", "M12". */
  reference: string;
  eventLabel: string;               // "Men's singles", "MD"
  roundLabel: string | null;        // "Round of 32" | null when underivable (§2.4)
  /** Present ONLY where the view is not already tournament-scoped (§2.5). */
  tournamentName?: string;

  sides: [Side, Side];

  scheduleState: 'slot_approved' | 'slot_pending';
  /** All three are ABSENT when unknown. There is no placeholder member. */
  startsAt?: Instant;               // an instant + the tournament tz (§2.6)
  day?: CalendarDay;
  court?: CourtRef;

  matchState: 'pending' | 'ready' | 'scheduled' | 'called' | 'playing'
            | 'finished' | 'retired';

  outcome: MatchOutcome;
  games: Game[];                    // [] when no games are recorded — see Ledger, §3.4
  /** Whole minutes, only when known AND useful. Never 0, never "0:42". */
  durationMinutes?: number;

  /** Publication facts, not styling. The renderer must not infer them. */
  publication: {
    personsPublished: boolean;      // entrants content toggle
    scoresPublished: boolean;       // results content toggle
  };
}
```

### 2.1 `Side` — a discriminated model, not a person array

Plan §3: *"An incomplete doubles side and a future winner are not ordinary PersonRef arrays. Model
unresolved sides explicitly; do not invent a person to fill a slot."* This is
state-and-formatting §6.1's model, restated with the card's fields:

```ts
interface Side {
  persons: PersonRef[];             // 0..n RESOLVED or dead references
  unresolved: UnresolvedSide | null;
  seed: number | null;
  club?: string | null;             // optional; operator-only unless published
  participantKey: string | null;
}

type UnresolvedSide =
  | { kind: 'bye' }
  | { kind: 'pending_member'; known: PersonRef[]; missing: number }
  | { kind: 'winner_of'; matchIdentity: MatchIdentity }
  | { kind: 'loser_of';  matchIdentity: MatchIdentity }
  | { kind: 'withheld' }            // not published (§2.3)
  | { kind: 'undetermined' };
```

`persons` and `unresolved` are **not mutually exclusive**. A doubles side with one confirmed
player is `persons: [A], unresolved: { kind: 'pending_member', known: [A], missing: 1 }`. Renderers
show the known name **and** "partner to be confirmed"; they never invent a person, never render the
side as singles, and never emit `TBD`, `–`, `No players` or `''`.

Labels are fixed by state-and-formatting §6.1 and are identical operator-side and public-side:
**Bye**, *(known names) · partner to be confirmed*, **Winner of {reference}**, **Loser of
{reference}**, **To be decided**. `withheld` renders **"Player not published"** as a dead reference
(§2.3) — and see §2.0: that dead reference is how withholding actually reaches both tiers; no
producer emits the side-level `withheld` discriminant.

**How `pending_member` is decided (v3 package 29).** It is a *structural* fact, never inferred from
a name. Exactly two signals produce it, on both tiers, from the same rule:

- a TEAM participant carrying **one** member id — a pair slot with a member missing outright. Not
  gated on the discipline: the TEAM type is itself the claim "this participant is a pair", and it
  is trustworthy where a free-text discipline ("Mixed Doubles") is not.
- an **entry-backed** lone person in a pair discipline (MD/WD/XD/BD/GD) — the entries seam drops an
  entrant whose partner invite is not accepted into the draw as a singleton for the director to
  pair by hand, so a lone entry-backed person in a doubles draw *is* a side one player short.

An imported or hand-added PLAYER row in a doubles draw is deliberately **excluded**: a historical
importer may legitimately store a whole pair under one name, and printing "partner to be confirmed"
over it would be a false statement about someone else's draw.

**Where the two persons of a pair come from.** `bracket_participants` stores a doubles pair as one
row with a composite `name` ("Ana Silva / Ben Ito") and two roster ids in `member_ids`. Both tiers
resolve those ids against `tournaments.data.bracketPlayers` — `shared/sides.py::roster_display_names`
operator-side, `entries_site.py::_bracket_roster_names` public-side — and emit one `PersonRef` per
member. The composite label is **never split** on `' / '` to get there (D15). Where a member id has
no roster row, the composite label is the only text that names everybody and is emitted as ONE
person.

::: warning `bye` is a side, not an absence
A bye side renders the word "Bye" in the side's own block, in the same ink and at the same size as
a name. It is never a blank row, and the ledger stays collapsed (§3.4).
:::

### 2.2 Identity and context

| Field | Rule |
| --- | --- |
| `reference` | Derived once by the tier's identity authority (`matchIdentity.ts` console-side) and rendered *verbatim* on every renderer, including the board and the compact chip (plan §3 correction 10). Never re-spelled per view. |
| `eventLabel` / `roundLabel` | One speller per tier (state-and-formatting §6.3). When the round label cannot be derived, the bare sequence ("Match 12") is used — never an empty header. |
| `tournamentName` | **Omitted inside a tournament-scoped view.** The mockup repeated it on every card; plan §3 correction 4 removes it. It is present only where cards from more than one workspace can appear on one screen: the hub, a cross-workspace search result, an entrant's own "my matches" list, and email. |
| slot indexes | **Never rendered.** V3-OC16.1: "slot 52 · court 5" is replaced by the tournament-timezone time and court; the slot index is not user-facing at any density. |

### 2.3 Publication is data, not styling

`publication.personsPublished === false` means the backend already minted dead references
(`resolution: 'dead'`, `label: 'Player not published'`); the renderer prints the label it was
given. `publication.scoresPublished === false` means `games` is `[]` **and** the accessible summary
says "Score not published" (state-and-formatting §9.2). **Absent scores are never zero** and a
renderer never synthesises a ledger to fill space.

### 2.4 Missing values are omitted, never placeheld

This is the rule the entrant tier breaks today
(`apps/entrant/app/components/MatchCard.tsx:76-82` plus the unconditional
`showAssignmentPlaceholders: true` at `routes/schedule.tsx:183`). Restating
state-and-formatting §3.2 in card terms:

| Absent | Operator card | Public card |
| --- | --- | --- |
| time | "Not scheduled" | **"Time to be confirmed"** — never a clock value, never "Scheduled" |
| court, time present | "Court not assigned" | the time renders alone; the court element is **not rendered** |
| day | "Date not set" | grouped under "Day to be confirmed"; the footer carries no date |
| duration | element absent | element absent |
| court disputed (§4 of the state contract) | the operator sees the dispute | the court element is absent; the schedule state is unchanged |

The failure mode being removed is a card that says **Scheduled** above *"Date to be confirmed ·
10:00 · Court information unavailable"* (V3-PE11.1) — a confident status over three apologies.

### 2.5 Duration

`durationMinutes` renders as `42 min` (state-and-formatting §7.1 `duration` context). The mockup's
`Completed · 0:42` is ambiguous between 42 seconds and 42 minutes and is deleted (plan §3
correction 5). A duration of 0, or a duration on an unfinished match, is **not rendered**.

### 2.6 Days and weekdays are computed

Plan §3 correction 6: demo weekdays and dates are generated from the timestamp in the tournament
timezone through the §7 `date` / `date_with_year` contexts. No literal weekday string appears in a
fixture, a mock, a demo seed or a component. Every rendered time is wrapped in
`<time datetime="…">` carrying the ISO `diagnostic` value.

### 2.7 The score ledger

```ts
type GameState = 'unplayed' | 'in_progress' | 'complete';

interface Game {
  index: number;                    // 1-based
  a: number; b: number;
  state: GameState;
  /** Present ONLY when state === 'complete'. Derived from the configured rules. */
  winner?: 'a' | 'b';
}

type MatchOutcome =
  | { kind: 'in_play' }
  | { kind: 'decided';   winner: 'a' | 'b' }
  | { kind: 'retired';   winner: 'a' | 'b'; retiredSide: 'a' | 'b' }
  | { kind: 'walkover';  winner: 'a' | 'b'; absentSide: 'a' | 'b' }
  | { kind: 'cancelled' }
  | { kind: 'no_result' };
```

Four rules, all from state-and-formatting §5.1, all of which the mockup violated:

1. **A lead is not a win.** `state: 'in_progress'` is set whenever points exist and the configured
   completion rule has not been met. `winner` is absent. A live 19–17 gets **no emphasis on
   either score**.
2. **Game completion comes from the configured rules** (`scoringFormat`, `pointsPerSet`,
   `deuceEnabled`, `setsToWin`), computed by the score authority — never by a component and never
   by "which number is larger".
3. **Per-game emphasis is independent of the match winner.** A losing side can win games, and does
   in fixture MC-08. The mockup keyed the per-game cell off the *match* winner; that is deleted.
4. **The match winner comes from `outcome`, never from the ledger.** Retirement and walkover
   contradict the point totals by construction.

The match-winner mark (§3.5) is **absent while `outcome.kind === 'in_play'`**, and carries the text
equivalent "Winner" when present.

::: tip Scoring copy — ruled (C3)
Until a nullable `pointCap` exists in the scoring configuration (package 13), scoring copy is plain
**"Win by 2"** with **no cap claim**. "Setting … cap 30" is not written anywhere. When `pointCap`
lands, the formatter prints the cap only where one is configured.
:::

---

## 3. The shared primitives

Five primitives carry the semantics. Every renderer composes these; none re-implements them.

### 3.0 Ink and size rules that apply to all five

**Ink roles** (plan §3 row X2, already implemented for contrast in package 06):

| Role | Treatment |
| --- | --- |
| every resolved participant name, **including the losing side** | **primary ink** |
| the winning side | primary ink **plus weight (600)** **plus** the winner mark |
| metadata — time, court, round, reference, state word, seed, club | muted ink |
| any text | never faded with `opacity` or an alpha colour (package 06, R2) |

**Size floors** (plan §3 rows X3/X7 and the two rejected mockup targets). These are *product
targets*, not claims about WCAG font-size requirements:

| Context | Floor |
| --- | --- |
| captions / metadata anywhere | **12 px** |
| dense console body | **13–14 px** |
| public names | **14–15 px** |
| bracket node names (both tiers) | **≥ 14 px** — 12 px is **rejected as a final target** |
| signage names / court labels / clock | **≥ 48 px / ≥ 28 px / ≥ 40 px** initial targets, then validated at the actual screen and distance |

**Row minimums** (plan §3 row X8 — the mockup's single 36/52 rule is replaced):

| Row | Minimum |
| --- | --- |
| operator match row | **40 px**, **48 px** where the row carries two stacked sides |
| roster row | **36 px** |
| public card, bracket node, signage tile | own their density; no shared height rule applies |

**All minimums are floors, not fixed heights.** A row grows for doubles, for wrapping, and under
text zoom. `DESIGN.md`: *"Never clip names or essential content to satisfy a fixed row height."*

### 3.1 `PersonLine`

Renders exactly **one participant**.

| Aspect | Rule |
| --- | --- |
| DOM | an inline element; a link (`a`) when a public person page exists, otherwise a `span`. This is `PersonRef` / `personRefModel` on the entrant tier and stays the only component permitted to render a public name. |
| stacking | **one participant per line within a pair** (plan §4, People and matches). Partners are *stably stacked* — the same partner is on the same line in every renderer and across re-renders; order comes from the data, never from sort-by-length. |
| joining | never assembled from, or parsed out of, a slash string. `' / '` and `' & '` round-trips are deleted (state-and-formatting §6.1, D15). |
| overflow | at normal density the line **wraps or ellipsises** per the renderer (§4). Where it truncates, the **full name must be reachable by keyboard and by touch**. |
| accessible detail | a `title` attribute is **NOT sufficient** — plan §3, row "Ellipsis + title, never wrap". `title` is invisible to touch and unreliable to keyboard. The required mechanisms, any one of which satisfies this: (a) the name is a **link** whose accessible name is the full name and whose destination shows it; (b) a **disclosure** the row already offers (the operator inspector, the public match page); (c) `aria-label`/visually-hidden text carrying the full name *plus* a non-hover route to see it. A `title` may be added *in addition*, never *instead*. |
| ink | primary ink always (§3.0). Diacritics, order and display form are preserved; surnames are never inferred. |
| seed / club | muted, after the name; `[3]` for a seed. Club only where the tier is permitted to show it. |

### 3.2 `SideBlock`

One side of the match: its `PersonLine`s, or its unresolved label, plus the side's ledger cells.

| Aspect | Rule |
| --- | --- |
| DOM | a grouping element with an accessible name equal to the side's full text (`sideSummaryPhrase` builds it from the structured side, never from a joined string). |
| content | resolved persons stacked; an unresolved side renders **the §2.1 label in the same ink and size as a name**, so an unresolved side is never a hole. `pending_member` renders the known names *and* "partner to be confirmed" on their own line. |
| winner | weight + the winner mark (§3.5). Never a fill, never colour alone. |
| sizing | the side sizes to its **tallest** content, and the match sizes to its tallest side (V3-PE14.1). A pair block never spills into an adjacent row's space. |
| the "vs" rule | **omitted** where the two sides are stacked and the ledger makes opposition obvious. **Kept** — as the word `versus` — in every inline summary and accessible name: `"{sideA} versus {sideB}"`, joining persons *within* a side with **"and"**. The **board's Next line renders an explicit visible side separator** (plan §3), because two stacked names there would otherwise read as one doubles pair. |

### 3.3 `StateWord`

| Aspect | Rule |
| --- | --- |
| vocabulary | exactly state-and-formatting §2.1. `playing` is **"On court"** in both tiers. **"Live" is not a match state** — it survives only as a *section* heading ("Live now"). |
| schedule words | the public schedule state is exactly **"Scheduled"** or **"Time to be confirmed"** (§3.1 of the state contract) and is a *different* word from the match state. A card may carry both; it never conflates them. |
| unknown state | **no chip at all** — never coerced to `scheduled` (D7). |
| treatment | a plain word in muted ink for routine states. A saturated band or solid fill is reserved for genuinely exceptional states — and **not** for every live card (V3-PE09.4: a green header, under a "LIVE NOW" heading, with "Now" on every card, is three encodings of one fact). One live band per *group*, a plain word per *card*. |
| colour | never the only carrier of meaning; the word is always present. |

### 3.4 `Ledger`

The per-game scores for both sides, aligned in columns.

| Aspect | Rule |
| --- | --- |
| **collapse** | when `games` is empty **and** no outcome word is needed, the ledger renders **nothing at all**: no cell, no reserved width, no padding, no separating rule, no invisible winner mark. Plan §3, "Collapse empty score cells" — *adopt fully*. The current entrant card emits an `aria-hidden` empty `span` per game column; that is deleted. |
| padding | never padded to the configured game count. Three columns are rendered when three games exist, one when one does. |
| alignment | both sides' game *n* occupy the same column, so a reader compares vertically (V3-OC17.1). Tabular figures; the column is wide enough for a two-digit pair without changing width between cards on the same screen. |
| emphasis | per game, from `game.winner`, which exists only for a `complete` game. An `in_progress` game emphasises neither side. |
| special outcomes | a partial ledger from a retirement or walkover renders **with** the outcome word; the outcome, not the ledger, decides the winner mark. |
| accessible text | each game identifies side and game — "Game 2, Ana Silva 21, Ben Ito 19" (plan §4, Accessibility text). |
| withheld scores | no ledger; the accessible summary says "Score not published". |

### 3.5 The winner mark

| Aspect | Rule |
| --- | --- |
| presence | **absent** for every unfinished match (`outcome.kind === 'in_play'`), including one where a side leads two games to none. |
| meaning | when present it carries a text equivalent — visually-hidden "Winner", or an `aria-label` — never a bare glyph or a bare dot (plan §3 correction 3). The console's `WinnerDot` keeps its role but its `aria-label` becomes the sentence-case word **"Winner"**. |
| source | `outcome.winner`, never `setsWinner(sets)`. `apps/console/src/components/control-plane/MatchCard.tsx`'s `winner ?? setsWinner(sets)` fallback is deleted: counting games is exactly the inference rule that retirement and walkover break. |
| redundancy | weight and mark together are the winner cue. Colour alone never is. |

### 3.6 `IdentityChip`

The match reference, and where needed the event and round.

| Aspect | Rule |
| --- | --- |
| content | `reference`, plus `eventLabel` and `roundLabel` where the surrounding context does not already supply them. |
| presence | required on the **board** and on **compact** variants (plan §3 correction 10): two similarly named participants must be distinguishable, and the board's "next: R32·1" must resolve to a visible labelled node. |
| bracket | every **source** node carries a visible reference, so "Winner of R32·1" resolves without counting rows (V3-PE10.1). |
| treatment | muted ink, tabular figures, 12 px floor. It is metadata, not a badge; it needs no fill. |
| stability | rescheduling changes time and court, never the reference. |

---

## 4. The four renderers

Each renderer states what it **must** show, what it **must never** show, and the width/zoom
envelope it is judged at. Plan §6's responsive row fixes the widths: console **1024 / 1440**;
public **320 / 390 / 768 / 1440**; **200% text zoom** everywhere; signage judged physically.

### 4.1 Operator table row — the result inventory

Owner: package 10. Primary defect: V3-OC17.1.

**Must show.** The match reference; both sides **stacked**, one participant per line; **aligned
game-score columns** shared by the two sides; the match state word; honest planned time and court;
the winner by weight + mark.

**Must never show.** Side A's scores before Side B's name, or Side B's scores as a second distant
group (the current layout, and the reason score-reading errors happen). A slot index. A fixed row
height that clips a name. A winner mark on an unfinished match. `No players` or `TBD`.

**Envelope.** 1024 px: the two sides and every game column are visible without horizontal scroll of
the *page*; a table that must scroll does so inside its own labelled scroll region. 1440 px: same
layout, more breathing room — never a different information set. 200% zoom: rows grow; nothing
clips.

**Density.** 40 px minimum, 48 px where both sides stack, 36 px for roster rows (§3.0).

### 4.2 Public card — schedule, round view, match list

Owner: package 11. Primary defects: V3-PE09.1–.4, V3-PE11.1, V3-PE13.1.

**Must show.** Event · round as the card's heading; both sides stacked with full names; the
**public schedule word** ("Scheduled" / "Time to be confirmed") *or* the match state word ("On
court", "Completed"), each meaning what it says; the time and court **when they exist**; the
timezone stated **once nearby** — beside the day heading or the list, not on every card; the ledger
when scores are published, collapsed when not.

**Must never show.** A "Scheduled" chip over a card with no approved time. A placeholder clock, a
placeholder court line, or "Court information unavailable" as routine card furniture. The
tournament name inside a tournament-scoped view. A saturated header band on every ordinary live
card. A repeated ISO date on each card under a day heading that already carries the date. "Live" as
a match state.

**Envelope.** 320 px: both sides, the state word and the ledger are all visible; names wrap rather
than truncate; the card never scrolls horizontally. 390/768/1440: progressively more metadata on
one line, never more *information*. 200% zoom at 320 px: the card grows vertically; no element
overlaps another (§6.4).

### 4.3 Bracket node

Owners: package 11 (entrant) and package 10 (console `DrawView`). Primary defects: V3-PE10.1,
V3-PE10.2, V3-PE14.1.

**Must show.** Both sides, one participant per line, at **≥ 14 px**; a visible match reference on
every source node; the unresolved-side label where the side is unresolved; the ledger only when
games exist; **two feeder connections and a destination relationship** for every non-first-round
node — the connector geometry says *these two matches feed this one, and this one feeds that one*,
which a single decorative horizontal rule does not (plan §3 correction 8).

**Must never show.** Slash-joined pair strings. A name shrunk below 14 px to fit more rounds. A
node sized so a long pair spills into the row below. A fixed `236 + 40 + 236 px` grid with no
narrow-screen behaviour (plan §3 correction 7) — **rejected**.

**The narrow-screen mode, specified.**

| Width | Behaviour |
| --- | --- |
| < 768 px | the **Round view is the default**; the full Bracket tab remains an explicit, labelled option, and an explicitly chosen view is preserved in navigation. No "this bracket is wide, scroll sideways" instruction in the default state. |
| ≥ 768 px | the bracket canvas renders. It **enlarges rather than shrinking names**: node width and height grow to fit the tallest side at the ≥ 14 px floor, and the canvas scrolls inside its own labelled region rather than widening the document. |
| any width | zoom-out is a *canvas* transform the reader chooses; it is never the default that makes names unreadable. |

The console's current `BRACKET_CARD_HEIGHT = 160` comment already records the correct instinct —
budget the worst case its own data produces, because "the canvas auto-fit absorbs the extra height;
truncation and overlap may not". This contract makes that a rule: **node geometry is derived from
the tallest rendered side, not from a constant chosen for a typical name.**

**Envelope.** 320/390: Round view. 768/1440: canvas, no node overlap, connectors meeting the right
sides. 200% zoom: nodes grow; the canvas scrolls; names stay whole.

### 4.4 Signage / venue board

Owner: package 17. Primary defects: V3-OC24.1, V3-OC24.2, and state-and-formatting §9.

**Must show.** The court, at **≥ 28 px**; both sides' names at **≥ 48 px** with an **explicit
visible side separator** (the "Next" line especially); the match reference (§3.6); the time in the
**tournament timezone with the zone stated**, and a distinctly labelled last-updated value that
stays unambiguous across midnight; the state word from the shared vocabulary; **authorized recorded
scores only**; a clock at **≥ 40 px**.

**Must never show.** A staff-action claim. The board's conflict copy is exactly:

> **Court assignment unavailable.**

with an announcement instruction added **only** if that is a confirmed venue process, and never a
claim that anyone is already resolving it. Also never: a synthesised score where none is published
(absent scores are not zero); `called` published as on-court; a bare clock with no date or zone; a
blank placeholder panel where a court has no next match — that says **"No next match assigned"**.

**Stale state is truthful.** When the board's data is older than its freshness budget it says so in
words, keeps rendering the last known values, and does not present them as current.

**Envelope.** The board is judged **physically** — at the intended screen size and viewing
distance. The 48/28/40 px figures are *initial targets* to validate, not a conclusion; the mockup
remains a desk-scale example and its 30 px names are rejected as validation.

### 4.5 The compact chip (a degenerate renderer)

`MatchChip` on the Plan and Run boards renders a match too small for sides at full density. It is
bound by the same contract in reduced form: it carries the **reference** (§3.6), it uses the shared
**state vocabulary**, its optional side line uses the same structured sides (never a pre-joined
string), and it renders **no winner mark** for an unfinished match. Where the chip cannot show a
name legibly it shows none — it never shows a truncated one with no route to the full value.

---

## 5. The Gate B fixture matrix

Gate B (plan §2) requires: *"singles, doubles, incomplete pair, unresolved predecessor, no scores,
live game, completed match and supported exceptional outcomes all render correctly. Long names
remain identifiable at the supported widths and text zoom."*

These thirteen fixtures are that set. They are **named so tests can import them** — one exported
module per tier, `matchCardFixtures`, keyed `MC-01`…`MC-13`, built on package 01's tournament
fixture so both apps show the same data. Every timestamp is a real instant; **no weekday or date
string is hardcoded** (§2.6).

### 5.1 The fixtures

| ID | Name | Shape |
| --- | --- | --- |
| MC-01 | `singlesScheduled` | singles, both sides resolved, approved slot + court, no games |
| MC-02 | `doublesScheduled` | doubles, four resolved persons, approved slot + court, no games |
| MC-03 | `longNamesDoubles` | doubles, the long strings below, unequal side lengths |
| MC-04 | `incompletePair` | doubles, side B is `pending_member` with one known player |
| MC-05 | `unresolvedPredecessor` | side A resolved, side B `winner_of` QF1; slot approved, court absent |
| MC-06 | `noSchedule` | both sides resolved, `slot_pending`, no time, no court, no day |
| MC-07 | `liveWithLead` | `playing`, game 1 complete 21–17 to A, game 2 `in_progress` 19–17 to A |
| MC-08 | `completedLoserWonAGame` | `finished`, `decided` to A, games 21–15 / 18–21 / 21–19 |
| MC-09 | `walkover` | `finished`, `walkover`, winner A, absent side B, `games: []` |
| MC-10 | `retirement` | `retired`, winner A, retired side B, partial ledger 21–12 / 11–8 |
| MC-11 | `withheldSide` | side B `withheld`; `personsPublished: false`; scores unpublished |
| MC-12 | `bye` | side B `bye`, no games, no outcome |
| MC-13 | `formats` | three variants — `oneGame`, `bestOfThree`, `bestOfFive` — each with a complete and a partial ledger |

**The long-name strings (MC-03), verbatim.** Each is ≥ 28 characters, and they are deliberately
mixed with short ones so unequal side heights are exercised:

- `Aleksandra Wiśniewska-Kowalczyk` (31)
- `Ratchanok Intanon-Wongsuwannakit` (32)
- `Hugo Marchetti-Silva Fernandes` (30)
- `Chidiebere Okonkwo-Adeyemiola` (29)
- short partners for contrast: `Li Na` (5), `Tao Ming Zhu` (12)

The diacritics are load-bearing: they must survive every renderer, every export path and every
accessible name.

### 5.2 Expected rendering, per renderer

`—` means the element is **absent**, which is itself the assertion.

| Fixture | Operator table row | Public card | Bracket node | Board |
| --- | --- | --- | --- | --- |
| MC-01 | two stacked names, ledger —, "Scheduled", time + court | "Scheduled" + time + court, ledger — | two names, ledger —, reference visible | shown only when it is a court's current or next match; explicit sides |
| MC-02 | four names on four lines, row ≥ 48 px | four names, card grows | node height from the taller side | two lines per side, side separator visible |
| MC-03 | no name crosses a score column; full name reachable | names wrap, no clip at 320 px | node **widens/heightens**; names ≥ 14 px; no spill into the row below | names may use the board's own condensed rule but never a slash-joined string |
| MC-04 | "…, partner to be confirmed"; no invented person | same | same; the side is not rendered as singles | same |
| MC-05 | "Winner of QF1"; court cell "Court not assigned" | "Winner of QF1"; **"Scheduled · 14:00"** (an approved slot with a pending participant is genuinely scheduled); court element — | "Winner of QF1"; QF1's node shows the reference `QF1` | not projected until the side resolves, unless it is the court's next match, where it shows "Winner of QF1" |
| MC-06 | "Not scheduled" | **"Time to be confirmed"**; time —, court —, day group "Day to be confirmed" | node shows sides only | — |
| MC-07 | game 1 emphasises A; game 2 emphasises **neither**; winner mark — | same; state word **"On court"**; no green band on the card itself | same | live tile; scores only if authorized |
| MC-08 | three columns; game 2 emphasises **B**; winner mark on **A** only | same | same | final score if authorized |
| MC-09 | "Walkover" + winner mark on A; ledger **collapsed entirely** | same | same | "Walkover" |
| MC-10 | partial ledger **plus** "Retired"; winner mark on A despite B leading nothing | same | same | "Retired" |
| MC-11 | side B "Player not published"; ledger — ; accessible summary "Score not published" | same | same | same |
| MC-12 | side B "Bye"; ledger — | same | same; the node still shows a reference | not projected |
| MC-13 | 1 / 3 / 5 columns exactly — never padded to the configured maximum | same | same | same |

---

## 6. Verification plan

Per plan §6, these are **behaviour** checks. The corrections to the proposed negative controls are
binding: **no fixed `offsetHeight` assertion**; **test equivalent semantic outcomes across
variants, not identical DOM**; **no prohibition on branching by renderer type**; **test game
completion, not which score is larger**; and **contrast is tested separately from hierarchy tokens**
(already delivered in package 06).

### 6.1 Package 11 — entrant tier

New: `apps/entrant/tests/matchCard.contract.render.test.ts`, driving every MC fixture through
`card`, `canvas` and `bracket-node`.

| Assertion | Fixtures |
| --- | --- |
| the accessible name is `"{sideA} versus {sideB}"` built from structured sides, joining within a side with "and" | MC-02, MC-03 |
| no rendered text matches `/^TBD$/`, `/^–$/`, `/No players/` | all |
| an unresolved side renders its §2.1 label exactly | MC-04, MC-05, MC-11, MC-12 |
| **no element** is emitted for a game that does not exist — assert the ledger container is absent, not that it is empty | MC-01, MC-06, MC-09, MC-12 |
| the winner mark is absent | MC-01, MC-05, MC-06, MC-07, MC-12 |
| the winner mark carries the accessible word "Winner" | MC-08, MC-09, MC-10 |
| game 2 of MC-07 emphasises neither side; game 2 of MC-08 emphasises the **losing** side | MC-07, MC-08 |
| the state word is "On court", never "Live" | MC-07 |
| the public schedule word is "Scheduled" or "Time to be confirmed" and nothing else | MC-01, MC-05, MC-06 |
| no placeholder footer text: `/Date to be confirmed/`, `/Time not assigned/`, `/Court information unavailable/` never appear on a card | MC-06 |
| the tournament name is absent inside a tournament-scoped route | all |
| every rendered time has a `<time datetime>` with a parseable ISO value equal to the fixture instant | MC-01, MC-07 |
| duration renders as `42 min` when set and is absent when 0 or unset | MC-08, MC-01 |
| the full name is reachable without hover: for each truncating name, either the element is a link whose accessible name is the full string, or a visually-hidden full-name node exists **and** a non-hover disclosure references it. `title` alone fails the assertion. | MC-03 |

### 6.2 Package 10 — console operator surfaces

<!-- docs-paths-ignore-next-line: proposed test file per this contract, not yet created (package 10 leaves it open; console match-card coverage today lives in control-plane/__tests__/ per-component tests) -->
New: `apps/console/src/components/control-plane/__tests__/matchCardContract.test.tsx` plus
per-module cases in the Bracket and Meet match tests.

| Assertion | Notes |
| --- | --- |
| **game completion is computed by the score authority**, with a table-driven case set: 21–19 complete, 20–19 not complete under `deuceEnabled`, 21–20 not complete, 30–29 complete where a cap exists, 15–3 complete under a 15-point format | this is the replacement for "which score is larger" |
| `setsWinner()`-style inference is not called on any render path | assert `outcome.winner` drives the mark; MC-09/MC-10 fail loudly under a counting implementation |
| both sides' game *n* share one column index in the rendered row | MC-02, MC-03, MC-08 |
| the row exposes a *minimum* height and no maximum: assert the computed `min-height` intent via the component's declared density prop, **never a measured `offsetHeight` equality** | plan §6 |
| the same fixture rendered by the table row and by `MatchCard` produces the **same** winner, the same game count, the same state word and the same accessible summary — a *semantic* equality across two different DOM shapes | the corrected version of "identical DOM everywhere" |
| no rendered string matches `/slot \d+/` | V3-OC16.1 |
| state words come from the single authority; no module-local literal `'Playing'`, `'Live'`, `'done'` | V3-OC16.2 |

### 6.3 Package 17 — display and board

New cases in the existing display tests, plus board projection cases.

| Assertion |
| --- |
| the conflict tile's text is exactly "Court assignment unavailable." and contains no staff-action or "being resolved" claim |
| a `called` match is never rendered with the on-court treatment or word |
| the board renders no score when `scoresPublished` is false, and never a zero |
| the clock and last-updated values carry the tournament zone and remain distinguishable across a midnight boundary (a fixture at 23:59 and 00:01) |
| the "Next" line renders an explicit visible side separator |
| every board tile carries the match reference |
| a court with no next match renders "No next match assigned" |

### 6.4 Overlap and legibility — measured without a fixed `offsetHeight`

Overlap is a *layout* fact, so it is measured in the existing browser-contract job (Playwright),
not in jsdom, and it is measured **relationally**:

1. For each pair of sibling boxes that must not collide (side A vs side B; the last name element vs
   the first ledger cell; adjacent bracket nodes; a node and the node below it), read
   `getBoundingClientRect()` for both and assert **non-intersection**: `a.right <= b.left + ε` or
   `a.bottom <= b.top + ε`, with `ε = 0.5 px` for sub-pixel rounding.
2. For each name container, assert **nothing is clipped**: `el.scrollWidth <= el.clientWidth + ε`
   and `el.scrollHeight <= el.clientHeight + ε`, *or* the element is a deliberately-ellipsising one
   that satisfies the §6.1 full-name-access assertion.
3. Assert the page does not scroll horizontally: `document.documentElement.scrollWidth <=
   window.innerWidth + ε` at each supported width. A bracket canvas is exempt **only** inside its
   own labelled scroll region, which is asserted to be the scrolling element.
4. Run 1–3 at console **1024 / 1440**, public **320 / 390 / 768 / 1440**, each also at **200% text
   zoom** (emulated by doubling the root font size, not by page zoom, so the check is a *text*-zoom
   check).

No assertion anywhere compares a height to a constant. A row minimum is expressed as
`rect.height >= 40` — a floor, never an equality.

### 6.5 What stays a visual or physical check

- **Signage** at the real screen and the real viewing distance: the 48/28/40 px figures are the
  starting point, and the verdict is physical (plan §3, "Board names at 30 px" — rejected as
  validation).
- **Colour rendering** on the venue panel, and the board's legibility under venue lighting.
- **The bracket at 1440 px with a full 32-draw** — connector legibility across a whole canvas is a
  judgement, though non-overlap is automated per §6.4.
- **Matched captures** for the closure record (packages 25–28).

---

## 7. Resolution table

### 7.1 The ten "MatchCard corrections required before approval"

| # | Plan §3 correction | Resolved by |
| --- | --- | --- |
| 1 | `.p` defaults to muted ink; only winners switch to primary. Correct both sides. | **§3.0** ink roles — every resolved name, including the loser's, is primary ink; the winner adds weight + mark. Already implemented for contrast in package 06 (R3). |
| 2 | Live cards lack per-game bold; completed losing sides can win games. Derive per-game presentation independently of the match winner. | **§2.7** rules 1–3 and **§3.4** — `game.winner` exists only for a `complete` game and is independent of `outcome.winner`. Fixtures MC-07, MC-08; assertions §6.1, §6.2. |
| 3 | A winner tick must be absent during an unfinished match and have an accessible meaning when present. | **§3.5**. Fixtures MC-01/05/06/07/12 (absent) and MC-08/09/10 (present with "Winner"). |
| 4 | The sample repeats the tournament name; §7.2 says omit repeated context. | **§2.2** — `tournamentName` is optional and omitted inside tournament-scoped views; asserted §6.1. |
| 5 | `Completed · 0:42` is ambiguous. Use "42 min" only when known and useful. | **§2.5**, using the state contract's `duration` context; asserted §6.1. |
| 6 | Demo weekdays/dates must be generated from timestamps; "Sat 5 Aug"/"Sun 6 Aug" do not match the 2026 context. | **§2.6** — no literal weekday anywhere; `<time datetime>` asserted §6.1. |
| 7 | The bracket uses a fixed 236 + 40 + 236 px grid with no local mobile adaptation. | **§4.3** — the grid is rejected; the narrow-screen mode is specified (Round view default below 768 px; canvas enlarges rather than shrinking names; node geometry derived from the tallest side). |
| 8 | Bracket progression needs two feeder connections and a destination relationship, not one decorative rule. | **§4.3** "Must show", third bullet; overlap/geometry assertions §6.4. |
| 9 | An incomplete doubles side and a future winner are not ordinary PersonRef arrays. | **§2.1** — the discriminated `UnresolvedSide`, with `persons` and `unresolved` coexisting for `pending_member`. Fixtures MC-04, MC-05; assertions §6.1. |
| 10 | Keep match identity/event context on board and compact variants. | **§3.6** and **§4.4/§4.5** — the reference is required on the board and on every compact renderer; asserted §6.3. |

### 7.2 Plan §3 decision rows

| §3 row | Decision | Resolved by |
| --- | --- | --- |
| One MatchCard component with identical DOM everywhere | Adapt | **§1.1** — one data contract + shared primitives + four semantic renderers; **§6.2** replaces DOM equality with semantic equality. |
| X2: public names in primary ink | Adopt | **§3.0** ink roles. |
| X3/X7: remove tiny tracked labels | Adopt | **§3.0** size floors (12 / 13–14 / 14–15 px). |
| X8: one fixed 36/52 row vs §7's 40/48 | Resolve before implementation | **§3.0** row minimums — 40/48 operator, 36 roster, public and signage own their density; floors, never fixed heights. |
| X9: fill every hairline-marked element | Adapt | **§3.4** — an empty ledger loses its rule entirely rather than gaining a fill; no decorative rule is added to a card. |
| Per-game winner = higher current score | Correct | **§2.7** rules 1–2; **§6.2**'s completion table. |
| Ellipsis + title, never wrap | Adapt | **§3.1** — stable stacked partners; `title` is explicitly insufficient; §6.1's full-name-access assertion. |
| Collapse empty score cells | Adopt fully | **§3.4** collapse rule; §6.1 asserts container absence, not emptiness. |
| Match state "Live" vs "On court" | Resolve | **§3.3** — "On court" is the match state; "Live now" is a section heading only. |
| Remove "vs" everywhere | Adapt | **§3.2** the "vs" rule — omitted visually where stacked, kept as `versus` in every inline summary and accessible name, explicit separator on the board's Next line. |
| Public bracket names at 12 px | Reject as final target | **§3.0** (≥ 14 px bracket floor) and **§4.3** (enlarge the canvas; mobile defaults to Round view). |
| Board names at 30 px, "signage scale" | Reject as validation | **§3.0** and **§4.4** — 48/28/40 px initial targets, verdict is physical (**§6.5**). |
| Board scores always present | Conditional | **§2.3** and **§4.4** — authorized recorded scores only; absent scores are not zero. Publication and data availability are verified first. |
| Board conflict copy says "wait for next announcement" | Adapt | **§4.4** — exactly "Court assignment unavailable."; asserted §6.3. |
| Replace Deuce with "Setting … cap 30" | Adapt | **§2.7** tip — "Win by 2" with no cap claim until `pointCap` exists (ruling C3). |
| Remove the tiny board preview instead of widening it | Adopt | Out of this contract's scope — a board *configuration* surface, package 17. Recorded here only so the row is not lost. |
| Entire-row links; menus only on hover | Adapt | **§3.1** — the same principle applied to names: no essential access is hover-only. |

There is **no X13 row** in plan §3; the brief's mention of one has no referent, and nothing has
been invented to fill it.

### 7.3 Findings this contract is designed to make impossible

| Finding | Package | Made impossible by |
| --- | --- | --- |
| V3-OC16.1 slot indexes on draw cards | 10 | §2.2, §4.1, §6.2 |
| V3-OC16.2 four vocabularies for one state | 10 | §3.3 |
| V3-OC17.1 separated Side A/Side B score blocks | 10 | §3.4 alignment, §4.1, §6.2 |
| V3-OC24.1 board claims staff are resolving a conflict | 17 | §4.4, §6.3 |
| V3-OC24.2 board clock with no date or zone | 17 | §4.4, §6.3 |
| V3-PE09.1 "Court information unavailable" as routine furniture | 04, 11 | §2.4, §4.2 |
| V3-PE09.2 dependent rounds shown with fabricated equal start times | 04, 11 | §2.4, §4.2, MC-05/MC-06 |
| V3-PE09.3 repeated ISO dates under a day heading | 04, 11 | §2.6, §4.2 |
| V3-PE09.4 saturated live band on every card | 04, 11 | §3.3 treatment rule |
| V3-PE10.1 "Winner of R32 1" with no visible source reference | 11 | §3.6, §4.3 |
| V3-PE10.2 mobile bracket opens in horizontal scroll | 11 | §4.3 narrow-screen mode |
| V3-PE11.1 "Scheduled" over three apologies | 04, 11 | §2.4, §4.2, MC-06 |
| V3-PE13.1 draw list with no timezone | 11 | §4.2 ("stated once nearby"), §2.6 |
| V3-PE14.1 slash-joined pairs spilling into adjacent rows | 11 | §3.1, §3.2 sizing, §4.3, §6.4 |

### 7.4 Product-level items — ruled by the orchestrator (2026-09-06)

These are not resolvable inside a documentation package.

| # | Item | Recommendation |
| --- | --- | --- |
| P1 | **`pointCap`** — the configuration has `deuceEnabled` but no cap field (ruling C3). | Add a nullable `pointCap` in package 13; until then no cap is printed. Already ruled; restated so package 10/11 do not re-open it. **Ruled 2026-09-06: as restated (C3).** |
| P2 | **Is match duration actually available**, and on which matches? §2.5 renders it only when known. | Confirm the field exists on the result record before package 10 renders it at all; if it does not, the element is simply never present and MC-08's duration assertion is dropped. **Ruled 2026-09-06: package 10 verifies the field on the result record first; absent field → element never present, MC-08 duration assertion dropped.** |
| P3 | **Are board scores publishable for the demo fixture?** Plan §3 marks this Conditional. | Verify publication settings and data availability on the package 01 fixture before package 17 renders any board score. Do not infer scoring capability from the mockup. **Ruled 2026-09-06: verify on the package 01 fixture; no board score until publication + data are confirmed.** |
| P4 | **Venue announcement process** — may the board add "Please wait for the next court announcement" after "Court assignment unavailable."? | Only if the organiser confirms that announcements actually happen. Default: the four words alone. **Ruled 2026-09-06: the four words alone; no announcement sentence.** |
| P5 | **Mobile default = Round view** (V3-PE10.2) changes a default destination, which is a product decision, not a rendering one. | Adopt as specified in §4.3, with the explicitly chosen view preserved in navigation. Confirm before package 11. **Ruled 2026-09-06: adopt — mobile defaults to Round view; an explicitly chosen view is preserved in navigation.** |
| P6 | **Club on `Side`** — §2.1 marks it optional. Public exposure of a club is an audience question, not a layout one. | Operator-only unless the public person allowlist (ADR 0018) already carries it. Confirm before package 11. **Ruled 2026-09-06: operator-only unless the ADR 0018 public allowlist already carries club.** |
| P7 | **Signage physical validation** — the 48/28/40 px targets need a real screen and distance. | Schedule the physical check in package 17; until then they are targets, and no test asserts them as passing criteria. **Ruled 2026-09-06: targets only; physical check scheduled in package 17.** |

---

## See also

- [State, identity, time and formatting](/reference/contracts/state-and-formatting) — the vocabulary this page renders
- [ADR 0029 — one state and formatting authority per domain](/explanation/decisions/0029-state-and-formatting-contract)
- [What a module contract is](/reference/contracts/) · [Operations → Display (Seam D)](/reference/contracts/operations-display)
- [ADR 0009 — Universal match contract](/explanation/decisions/0009-universal-match-contract) · [ADR 0018 — Public person universality](/explanation/decisions/0018-public-person-universality) · [ADR 0028 — Entrant site port](/explanation/decisions/0028-entrant-site-port)
- [ADR 0013 — Shared-UI promotion policy](/explanation/decisions/0013-shared-ui-promotion-policy) · [ADR 0027 — Curated data components](/explanation/decisions/0027-curated-data-components)
- [Debt log](/reference/debt-log) · [Glossary](/reference/glossary)
