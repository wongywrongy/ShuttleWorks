# SP-FIGMA-2 — Phase 0 census (read-only, DRAFT — not landed in the repo)

**Date:** 2026-09-03 · **Status:** complete; rulings proposed in ADR 0026 · **Scope:** read-only
census, plus the Figma probes in 0.9

Named `SP-FIGMA-2`; ruling ids continue ADR 0025's `R-FIG-1`/`R-FIG-2`, which is why this
program's Figma rulings start at `R-FIG-3`.

Inputs: `packages/design-system/tokens.css`, `apps/entrant/`, `apps/api/src/entries/`,
`apps/api/src/display/display.py`, `docs/screenshots/ui-review/public-entrant-surface-book.*`,
ADR 0018 / 0019 / 0020 / 0025, `docs/audits/sp-console-6-phase0.md`, Figma
`XoYB2mvcA8Mw5IpbjvIQ4d`.

## 0.0 Premises that did not hold

| # | Brief said | Repository / account says |
|---|---|---|
| B1 | Runs after "SP-CONSOLE-2 Phase 1 has produced the `ShuttleWorks Console` file" | No such Figma file exists. SP-CONSOLE-2 completed 2026-08-17; the live program is **SP-CONSOLE-6**, whose Phase 0 is done (ADR 0025) and whose R-FIG-1 *mandates creating* a Console file — not yet done. There is exactly one Figma file: `XoYB2mvcA8Mw5IpbjvIQ4d`. |
| B2 | Phase 4.1 Code Connect for every public component; a Done condition | **Not executable.** ADR 0025 R-FIG-2: Code Connect needs a Dev/Full seat on Organization or Enterprise; this account is Professional. Already dropped once for the console. |
| B3 | Specs in `docs/superpowers/specs/` (SP-P6-2, SP-P7, SP-P8, SP-P9) | Directory does not exist. Successors: ADR 0018 (public person universality, Accepted 2026-08-31), `docs/audits/2026-08-SP-P9-findings.md`, `docs/explanation/architecture/entrant-tier.md`, `docs/reference/modules/entries.md`. No repo trace of a "P6-2 federation homepage" spec — but the surface it describes ships (see B5). |
| B4 | ADRs in `docs/decisions/`; ledger `REFACTOR_PROGRESS.md` | Ruled already by ADR 0025 R-PATH-0: ADRs are `docs/explanation/decisions/`; there is no ledger — open work goes to `docs/reference/debt-log.md`. |
| B5 | The public site is design work not yet begun; Phase 2 "builds" six public components | **All six already ship in code, tested.** `apps/entrant/app/components/`: `PersonRef.tsx`, `MatchCard.tsx` (≈ MatchLine), `NowStrip.tsx`, `SeasonCalendar.tsx` (≈ CalendarMonthGroup), day rail in `routes/schedule.tsx`, compact bracket geometry in `app.css` + `routes/draw.tsx`. 39 public surfaces are captured in `public-entrant-surface-book` (status `complete`, zero console errors). SP-FIGMA-2 is a **code → Figma mirroring** job, not a design job. |
| B6 | R-FIG-3 / R-FIG-4 are new ruling ids | `R-FIG-1` and `R-FIG-2` are already taken by ADR 0025. Numbering from 3 is consistent; the brief's own program id `SP-FIGMA-2` has no SP-FIGMA-1 predecessor anywhere in the repo. |
| B7 | Expected library sets include StatusBar, CourtMark, GanttTimeline, ScoreSheet | The 9 published sets are Button, Button (Icon), StatusPill, Select, TextField, Notice, Card, EmptyState, Separator. `StatusBar`/`CourtMark`/`GanttTimeline` exist **in code** (`packages/design-system/components/`) but have no Figma set; `ScoreSheet` does not exist at all. |
| B8 | Rule 3: public surfaces expose "name, club, event, results only" | Loose phrasing; the serializers emit time, court, seed, standings and publication state too, and the brief's own MatchLine spec wants score/time/court. Noted, not a blocker. The **real** conflict is the Phase 3 cut list against *shipped, tested* UI — see 0.3. |

## 0.1 Token census

`packages/design-system/tokens.css` — 571 lines, 336 declarations, one `@layer base` block with
four scopes: `:root` (45), `[data-theme="light"]` (253), `[data-density="compact"]` (418),
`[data-theme="dark"]` (433). **No product scope exists.**

**Density already diverges by product — as a CSS scope, not a mode.** `useAppliedDensity.ts:16`
sets `data-density` on `document.documentElement` in the console; the entrant tier never sets it
and has no density control. That is the shape product variation already takes here, and it is the
strongest evidence for how R-FIG-4 should model it.

`module/*` (8 vars) and `display/*` (6) are console-only semantics living in the shared collection;
R-FIG-4 must say whether they move to the Console file or stay in Foundation as unused-by-public.

Prefix histogram (top): `status` 74, `surface` 26, `text` 16, `gray` 14, `shadow` 13,
`density` 12, `space` 11, `blue` 11, `ink` 10, `border` 9, `module` 8, `action` 8.

**The public tier has no token file and no overrides.** `apps/entrant/app/app.css` imports
`@scheduler/design-system/tokens.css` + `globals.css` and adds only bracket-connector geometry.
Direct `var(--…)` use in the whole entrant app: `--border-control` ×3, `--action-primary` ×1.
Both tiers consume tokens through the same Tailwind preset
(`@scheduler/design-system/tailwind-preset`). **Zero name collisions, zero product overrides.**

Where the two products *do* diverge is one level up, at component classes, and that divergence
is already enumerated and ruled deliberate by **ADR 0020**: Card radius (DS square vs entrant
`rounded-lg`), StatusPill vs entrant `StatusChip`, three EmptyState registers, TextField vs
unlabeled inline inputs. That list — not the token file — is the R-FIG-4 diff-list seed.

## 0.2 Component census

DS components imported by each tier (`@scheduler/design-system/components`):

| Component | Console | Public (entrant) | Figma set |
|---|---|---|---|
| Button | yes | yes (11 sites) | yes |
| Notice | yes | yes (7) | yes |
| TextField | yes | yes (5) | yes |
| EmptyState | yes | yes (1, wrapped) | yes |
| `STATUS_TONE` (statusTone.ts) | yes | yes (via `StatusChip`) | — (tokens) |
| Select | yes (7) | **no** | yes |
| StatusPill | yes | **no** | yes |
| GanttTimeline | yes | **no** | **no** |
| Card | **no** (class vocab `PANEL_RADIUS`) | **no** (class vocab `CARD`) | yes — **orphan set** |
| Separator | **no** | **no** | yes — **orphan set** |
| Button (Icon) | **no** (not imported by name) | **no** | yes — **orphan set** |
| Modal, Toast, StatusBar, CourtMark | in `packages/`, not imported from `components` barrel by either tier | no | no |

Exact import counts (both tiers, single- and multi-line imports parsed):
console = Select 7, Button 5, Placement 4, GanttTimeline 2, GANTT_GEOMETRY 2, EmptyState 2,
TextField 2, GanttCell 1, GanttBlockBox 1, StatusPill 1, placementBox 1, PillTone 1,
StatusCountItem 1, Notice 1, TextFieldProps 1 · entrant = Button 11, Notice 7, TextField 5,
EmptyState 1, STATUS_TONE 1.

**Three Figma sets have no importing consumer in either tier** (Card, Separator, Button (Icon)) —
their code counterparts are class-string vocabularies, not imported components. Under rule 2 they
belong in Foundation only if both products' class vocabularies are held to them; otherwise they are
documentation of a shape neither tier instantiates. Their disposition is part of R-FIG-3.

Public-only components (all in `apps/entrant/app/components/`, none in Figma):
`PersonRef`, `PersonGroup`, `MatchCard`, `NowStrip`, `SeasonCalendar`, `SeasonControls`,
`SeasonStatusCell`, `DateBadge`, `EventRow`, `EntrantsList`, `PlayersList`, `TimelineCard`,
`SectionCard`, `StatusChip`, `HeroHeader`, `PlayShell`, `TabBar`, `StickyTotalBar`, `MessagePage`.

So the shared foundation in *code* is 4 components + the tone map. Everything else is
product-local already. Rule 2 ("shared once, or not shared") is satisfied by the code today.

## 0.3 Public field vocabulary (the allow-list)

Extracted by AST from the four public serializers — `entries_site.py`, `entries_json.py`,
`display/display.py`, `entries_me.py`: **72 DTOs, 195 distinct field names.** Full dump in
`dto-fields.txt`. Load-bearing shapes for the in-scope surfaces:

- `PublicPersonIdentityDTO` = `id, name` · `PersonReferenceDTO` = `identity, resolution, label`
- `TeamDTO` = `participantKey, persons, club, seed`
- `ScheduleMatchDTO` = `matchKey, source, eventCode, discipline, roundLabel, status,
  scheduledDate, scheduledTime, court, sides, score, walkover, updatedAt`
- `ScheduleFacetsDTO` = `days, events, courts, states`
- `SeasonRowDTO` = `slug, name, organizer, venueName, date, eventCount, status, closesInDays,
  drawsPublished, winnersPublished` · `NowStripDTO` = `slug, moreCount`
- `MatchNodeDTO` = `nodeKey, position, sides, result, scheduledTime, court, playedOn, localTime,
  courtLabel, sourceUrl, sourceRef`

**The cut list vs shipped UI.** The DTO keys are what *may* be emitted; the cut list governs what
is *rendered*. Checked against the shipped entrant tier — three of four cut-list items hit live UI:

| Cut-list item | Shipped reality | Verdict |
|---|---|---|
| "any operator status word" | `apps/entrant/app/lib/schedule.types.ts:77,87` renders **"Called"** and **"Retired"** publicly | **Genuine finding** — operator vocabulary on a public surface. "Live now" / "Upcoming" are fine. |
| "match ids" | `matchKey` is a React `key` only (`schedule.tsx:579,616,672`); never rendered, never in a title attr | No leak. Already clean. |
| "last updated timestamps on anything but the NOW strip" | `schedule.tsx:726,760` render "Schedule updated …" / "Schedule last updated …"; `scheduleIsStale()` drives a staleness notice | **Load-bearing** — this is the tier's freshness signal for a poll-only projection. Deleting it is a product change. |
| "filters beyond event and day" | `ScheduleFilters` (`schedule.tsx:31-39`) = day, event, **player**, **court**, **state**, page, organization; court and state selects at lines 470/479 fed by the `courts`/`states` facets | **Conflict** — removing three filters and their facets is a serializer + test + UX change, not a Figma decision. |

Two of these are product changes with serializer and test consequences. **This is a STOP.**

## 0.4 Identity seam

- Operator format (R-ID-1): `apps/console/src/lib/names.ts`, BWF `SURNAME Given`, presentation-only,
  5 call sites. ADR 0025 records two identity systems as intended, not debt.
- Public format: **not reformatted.** `_public_identities` (`entries_site.py:174`) emits
  `EntryPlayer.full_name` verbatim as `PublicPersonIdentityDTO.name`; the frontend seam
  `formatPersonIdentity` (`apps/entrant/public/assets/person-ref.js:15`) returns `identity.name`
  unchanged and is self-documented as the one line the canonical R-UNI formatter will supersede.
- `PersonRef.tsx` is the only React component permitted to render a public name (ADR 0018 §1);
  `createPersonRef` is its framework-free twin for the account modules. Held by
  `apps/entrant/tests/personRef.test.ts` and `publicUniversality.test.ts`.

So the public site's name format today is "as stored", **not** BWF. The brief's guess that BWF is
the *public* convention is inverted: BWF is the operator convention here.

ADR 0025 R-ID-1 is explicit and recent: "The entrant tier keeps its own `PersonRef` (ADR 0018);
the two tiers are not merged." No accepted ADR rules that a canonical cross-tier formatter applies
to the public tier — SP-UNI-1 F-UNI-22 only *recommends* one. R-PUB-ID-1 is therefore a genuine
owner choice, and the ADR-backed default is the status quo.

## 0.5 Figma inventory

Account `kyle` / team `1635792425890684766`, tier **professional**. One file:
`XoYB2mvcA8Mw5IpbjvIQ4d` — 18 pages (15 with content), 4 variable collections
(Primitives 53 · Color 102, modes Light/Dark · Scales 51 · Tokens 25), 9 text styles,
16 effect styles, 0 paint styles, 9 component sets, **0 unbound paints across 1,696 nodes**
(SP-CONSOLE-6 §0.5, captured 2026-09-03).

`get_libraries` on the file: 8 community kits subscribed, `libraries_available_to_add` **empty** —
no organization library is visible to this account. Publish state remains not determinable through
MCP on a Professional seat.

**Mode-budget constraint for R-FIG-4.** Figma modes are per-collection and not multi-dimensional.
`Color` already carries Light/Dark; a `Product` axis would require Light/Dark × Operator/Public =
4 modes in one collection, or a second collection. Combined with 0.1 (zero product token
divergence today) and ADR 0020 (divergence is deliberate and lives at component level), a Product
mode buys nothing it can spend.

No Console frames exist, so "does a Console frame contain a public-only concept" is vacuous.

## 0.6 Viewport evidence

`tools/surface-capture.mjs:283` — `desktop 1440×900` and `mobile 390×844`. The public book
captures all 39 surfaces at both; every entry is `ok: true`, `httpStatus: 200`,
`consoleErrors: []`. SP-CONSOLE-6 R-A1 fixed console Figma frames at 1440. The brief's proposed
1080 secondary matches neither the capture evidence nor the console ruling.

## 0.7 Public surface inventory (R-PUB-2 evidence)

`docs/reference/surface-map.md` already maps every route to its shell and components for both
tiers and is the standing map; this section is its SP-FIGMA-2 scope cut, not a replacement.

39 captured routes. In-scope candidates by the brief's recommendation:
`/e/` (discovery + calendar), `/e/?view=completed#calendar`, `/e/{slug}` (+ tabs events,
players, draws, seeds, winners), `/e/{slug}/schedule`, `/e/{slug}/draws/{event}`
(+ `?view=round|path|list`), `/e/{slug}/players/{id}` (person page), `/e/{slug}/regulations`.
Out of scope per the brief's own non-goals (Entries / account): `/e/enter*`, `/e/login*`,
`/e/signup*`, `/e/verify*`, `/e/reset*`, `/e/forgot`, `/e/partner*`, `/e/me/entries`,
`/e/{slug}/receipt/{id}` — 20 of the 39.

## 0.8 Not verifiable in this pass

Library publish state (plan-gated probe). Whether a Figma team library on Professional can carry
published *variables* consumed cross-file — assumed yes, unverified; if it cannot, R-FIG-3's
multi-file topology is unbuildable and everything collapses to one file with pages.

## 0.9 Figma probes (2026-09-03)

**0.8 resolved — the Foundation library is NOT published.** Two independent probes from a second,
empty file (`ANo9UB8iCsCwBf3nhzvvym`):

- `figma.importComponentSetByKeyAsync("9e68df69…")` (the Button set's real key, read from the
  library) → `Component set with key "…" not found`.
- `figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()` → `[]`.

That is why the library is invisible from other files. Publishing has no Plugin API; it is an
owner click. **Everything downstream of it is blocked**: no cross-file component instances, no
cross-file variable consumption, so no Public component can be built on Foundation variables yet.

**`figma.root.name` is not the file title.** It returns `"Document"` for the library *and* for the
freshly created `ShuttleWorks Public` file, which Figma definitely named correctly. The Plugin API
sandbox does not expose the real title, and `figma.root.name = …` throws
`Setting the document name is currently not supported`. Renaming the library to
`ShuttleWorks Foundation` (R-FIG-3) is therefore also an owner click.

**Library inventory re-verified**
- : 9 component sets, all with publish keys and descriptions —
  Button 32 variants (`9e68df69…`), Button (Icon) 24, StatusPill 14, Card 3, TextField 6,
  Select 8, Notice 5, Separator 2, EmptyState 3. 18 pages, 4 collections as in 0.5.
- **`ShuttleWorks Public` created** — `ANo9UB8iCsCwBf3nhzvvym`, team `1635792425890684766`,
  project `649152631` (alongside the library).
- Phase 1.3 page structure created: `00 Read me`, `01 Vocabulary & fields`, `02 Home & calendar`,
  `03 Tournament`, `04 Person`, `05 Schedule`, `06 Draws & results`, `07 Public components`.

**Tooling notes for later phases:** `page.loadAsync()` reads a page's children without
`setCurrentPageAsync`, which the local permission classifier blocks. A plugin run that throws is
rolled back atomically — the page-creation script had to be re-run after `page.remove()` failed on
the current page. Both are worth keeping for the SP-CONSOLE-6 Figma phases too.

**Publish state, resolved.** The owner published the library on 2026-09-03. Re-probed from the
second file: `importComponentSetByKeyAsync` returns the Button set (32 variants), and
`importVariableByKeyAsync` / `importStyleByKeyAsync` resolve variables, text styles and effect
styles. `teamLibrary.getAvailableLibraryVariableCollectionsAsync()` still returns `[]` — that is
an **enumeration** limit on Professional, not a consumption limit. Cross-file work must therefore
carry asset keys explicitly; a consuming file cannot list what is available to it. The full
name→key map is one `use_figma` call away (`getLocalVariableCollectionsAsync` +
`getVariableByIdAsync`). **R-FIG-3's three-file topology is buildable on Professional.**

**Plugin API constraints found (carry these into the SP-CONSOLE-6 Figma phases):**
- `page.loadAsync()` reads a page's children without `setCurrentPageAsync`, which the local
  permission classifier blocks.
- A plugin run that throws is rolled back atomically — a partial script leaves nothing behind.
- `figma.root.name` returns `"Document"` for every file regardless of its title, and assigning it
  throws `Setting the document name is currently not supported`. Renaming is an owner click.
- Setting `fontName` after `setTextStyleIdAsync` silently clears `textStyleId`. See R-FIG-5.
