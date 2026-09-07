# ADR 0026: SP-FIGMA-2 program rulings

**Status:** Proposed — 2026-09-03

## Context

A brief arrived proposing that the operator console and the public entrant tier be
separated in Figma before public-site design begins: a shared foundation, one file
per product, six new public components, and a Code Connect layer.

Its Phase 0 audit found eight premises that did not hold against this repository —
including the central one. The brief treats the public site as design work not yet
begun; the tier ships. Thirty-nine public surfaces are captured at two viewports
with zero console errors, ADR 0018 governs its identity model, and all six
components the brief asked to invent are implemented and tested. SP-FIGMA-2 is a
code → Figma mirroring program, not a greenfield design program.

Evidence for every finding is in `docs/audits/sp-figma-2-phase0.md`.

## Decision

### Posture

**R-PUB-0 — mirror, then cut.** Figma mirrors the shipped public surfaces; the
brief's reduction list is then applied as an explicit, item-by-item cut (R-CUT-1).
Designing greenfield from the brief would produce frames that do not describe the
running product.

### File topology

**R-FIG-3 — three files, of which this program creates one.**
`ShuttleWorks Foundation` (the existing library, renamed), `ShuttleWorks Console`
(already mandated by ADR 0025 R-FIG-1; SP-CONSOLE-6 owns it), and
`ShuttleWorks Public` (`ANo9UB8iCsCwBf3nhzvvym`, created by this program).

Foundation keeps the four component sets both tiers import — Button, TextField,
Notice, EmptyState — plus all four variable collections and the text and effect
styles. `StatusPill` and `Select` are console-only imports and belong in the
Console file. `Card`, `Separator` and `Button (Icon)` have no importing consumer in
either tier: their code counterparts are class-string vocabularies
(`PANEL_RADIUS`, `CARD`), so they stay in Foundation as the reference shape ADR
0020 ruled deliberately divergent.

The topology is buildable on a Professional seat, verified rather than assumed:
components, variables and styles all resolve cross-file by key. Only *enumeration*
is plan-gated, so cross-file work carries asset keys explicitly.

**R-FIG-3a — the detach check is refined.** ADR 0025 R-FIG-1 justified a separate
Console file by "a detached instance shows up as a local component". That stops
being true once each product file legitimately owns local masters. The check
becomes: an instance whose `mainComponent` page is neither Foundation nor this
file's own `* components` page.

**Sequencing.** SP-FIGMA-2 Phase 1 runs before SP-CONSOLE-6 Phase 1. With no
frames in any file, relocating sets costs nothing; after the console is framed it
means an instance swap. The Plugin API cannot move nodes across files at all —
relocation is a UI copy or a rebuild.

### Tokens

**R-FIG-4 — no `Product` mode; product variation stays at component level.**
Four reasons, in order of weight: the entrant tier has no token file, no overrides
and four `var(--…)` uses in the whole app; density already diverges as a
`[data-density]` CSS scope the console sets and the entrant never does — a scope,
not a product axis; the `Color` collection already carries Light/Dark, so a Product
axis forces a Public×Dark cell for a product where dark mode is an explicit
non-goal; and ADR 0020 already ruled the real divergences (Card radius, StatusPill
vs StatusChip, three EmptyStates, TextField vs inline inputs) deliberate and
component-level.

`module/*` and `display/*` are console-only semantics but stay in Foundation: they
are emitted by the one `tokens.css` both tiers import, and forking that file is
forbidden by the brief's own §4.2.

**Consequence: the brief's §4.2 is dropped.** There is no diff list to emit as a
`[data-product="public"]` scope.

**R-FIG-5 — Foundation needs two strong text styles, or the override is
documented.** Eighty-eight text nodes in the Public file carry a local font, and
they resolve to exactly two shapes: Geist SemiBold 14 (79 nodes) and Geist SemiBold
12 (9). Every other text node in the file is attached to a published style. The
cause is not sloppiness: the code emphasises with `font-[650]`, and Foundation
publishes no bold Body or Label style, so there is nothing to attach to. Either add
`Body/Strong` and `Label/Strong` to Foundation — a foundation change, which the
brief makes a STOP — or accept weight as a documented local override. **Open; the
owner rules.**

### Identity

**R-PUB-ID-1 — the public tier renders the served name verbatim; not BWF.**
`_public_identities` emits `EntryPlayer.full_name`, and `formatPersonIdentity` is a
documented pass-through — the one line a future canonical formatter would
supersede. ADR 0025 R-ID-1 states the two tiers are not merged; "SURNAME Given" is
the operator convention, and the brief's assumption that BWF is the *public*
convention is inverted. Changing this is a product ruling with test consequences,
not a Figma one.

### Scope

**R-PUB-1 — viewports 390×844 and 1440×900.** Not the brief's 1080: 1440×900 is
what `tools/surface-capture.mjs` captures, what all 39 public surfaces pass at, and
what SP-CONSOLE-6 R-A1 fixed for console frames. One secondary width across both
programs.

**R-PUB-2 — the 19 non-Entries public routes, in three states.** The 20 account and
entry routes defer with Entries. **The state axis is publication, not loading**:
the entrant tier is server-rendered with no framework hydration, so there is no
page-level loading state to frame. Frame pre-publish/empty, live, and complete. No
error frames.

**R-CUT-1 — the cut list is ruled item by item, because three of its four items hit
shipped, tested UI.**
- *Accepted:* remove the operator words "Called" and "Retired" from public state
  words (`apps/entrant/app/lib/schedule.types.ts`). Entrant-side only.
- *No action:* match ids are already never rendered — `matchKey` is a React key.
- *Open, and product questions rather than framing choices:* the "Schedule last
  updated" line is the poll-only tier's staleness signal, and the player, court and
  state filters are shipped facets with serializer fields and tests behind them.
  Removing either is a product change. Recorded on the Public file's
  `01 Vocabulary & fields` board as open.

### Dropped

**Code Connect (brief §4.1 and a Done condition) is dropped**, citing ADR 0025
R-FIG-2: it requires a Dev or Full seat on Organization or Enterprise, and this
account is Professional. Each component's Figma description names its source file,
its DTO fields and the ruling that governs it — the same substitute the console
uses.

## Consequences

`ShuttleWorks Public` (`ANo9UB8iCsCwBf3nhzvvym`) holds eight pages: `00 Read me`,
`01 Vocabulary & fields`, `02 Home & calendar`, `03 Tournament`, `04 Person`,
`05 Schedule`, `06 Draws & results`, `07 Public components`. The Read me states the
seven things that must never appear in the file; the vocabulary board carries the
serializer allow-list for the in-scope surfaces and the R-CUT-1 rulings.

Eight component sets are built on Foundation variables and text styles, each
described with its code path and fields: PersonRef (Resolved / Dead / Winner),
PersonGroup (Solo / Pair × Seed), StatusChip (Entries open / closed), MatchCard
(Upcoming / Live / Done), NowStrip, DayChip, DayRail, CalendarMonthGroup and
BracketCompact.

Four of the brief's Phase 2 specifications were corrected against the code: PersonRef
has no Pair variant (ADR 0018 R-U2 — a pair has no identity and no route) and no
club field (club belongs to the containing row); NowStrip has one variant, because
the server decides whether anything is live and "hidden" is the page not rendering
it; and MatchCard is named for the component it mirrors.

Eleven components in all: the nine above plus `PlayShell header` (two session
shapes, never both) and `TabBar` (links, not an ARIA tablist).

Sixteen surface frames are built across pages 02–06, every one composed from those
components and captioned with its route as a path — no hostname appears anywhere,
per invariant I1:

| Surface | Frames |
|---|---|
| Home & calendar (`/e/`) | live · 390, empty · 390, live · 1440 |
| Tournament (`/e/{slug}`) | overview · 390, pre-publish · 390, overview · 1440 |
| Person (`/e/{slug}/players/{id}`) | 390, no-matches-yet · 390, 1440 |
| Schedule (`/e/{slug}/schedule`) | live · 390, not-published · 390, live · 1440 |
| Draws & results (`/e/{slug}/draws/{event}`) | complete · 390, not-drawn-yet · 390, winners · 390, complete · 1440 |

Frames hug their content vertically rather than clipping to 844, so a reviewer sees
the whole page; the widths are the ruled 390 and 1440.

**Audit at STOP-3: 1,076 nodes, 0 unbound paints, 192 instances, 0 resolving to any
Console or third-party master, 0 person names outside a PersonRef instance,** and 88
text nodes carrying the two weights Foundation does not publish (R-FIG-5).

On the code side, the brief's §4.3 build guard already existed and needed
nothing: `apps/entrant/.dependency-cruiser.cjs`'s `entrant-no-operator-frontend`
rule forbids the public app reaching into `apps/console/src`, and
`apps/entrant/tests/boundaries.test.ts` carries its negative control. §4.2's
colour guard is added as `apps/entrant/tests/noRawColor.test.ts` — no hex literal
under the `apps/entrant/app/` tree, with a negative control and a URL-fragment control,
running in the tier's existing vitest job. It is scoped to this tier on purpose:
the operator console carries genuine hex in the public-display presets and the
school-accent map, and ruling on those belongs to SP-CONSOLE-6.

Open at STOP-3: R-FIG-5; the relocation of `StatusPill` and `Select`, which waits on
SP-CONSOLE-6 creating the Console file; the two open R-CUT-1 items; and owner
approval of the frames.
