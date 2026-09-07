# Work package 11 — repair public match, round and bracket views

Branch `feat/surface-book-remediation`, HEAD at delivery `26f8e3f2` (baseline named
in the brief); the branch moved under concurrent packages during this slice —
see "Working conditions" below. Scope: `apps/entrant/app/**`,
`apps/entrant/public/assets/**` + `.d.ts` twins, `apps/entrant/tests/**`,
`docs/audits/v3-consolidated/**`. No `apps/api/**` file was written; two were
read to confirm a field was already on the wire (see §3). Nothing was
committed.

## Working conditions — a shared, concurrently-edited working tree

Several other packages (04b, 07's entrant-tier follow-on, 15's V3-PE15.2,
19, and an unidentified auth-flow change touching `login.tsx`/`logout.tsx`/
`signup.tsx`/`recovery.tsx`/`entry-wizard.js`) were live on this same
checkout throughout the session, and the tree was reset to `HEAD` out from
under this package's own edits twice, mid-session, by something outside
this package's control (every edit made before the reset point was silently
gone from disk seconds later; only files this package created untracked —
`lib/side.ts`, the two new test files — survived, since a reset does not
touch untracked files). Both times the fix was to redo the affected edits
and re-verify with `git diff --stat` immediately afterward. The very last
full-suite run (`npm run -w apps/entrant test:run`, unscoped) also shows 18
failures across `login`/`logout`/`signup`/`recovery`/`launch-scripts` and
2 in `dtoParity` — all in files this package never touched, from that other
in-flight auth work and a `SideDTO` naming collision introduced by a
concurrent backend package (`entries__entries_site__SideDTO` vs.
`shared__sides__SideDTO` in `apps/console/src/api/dto.generated.ts`, not yet
reconciled in `apps/entrant/tests/dtoParity.test.ts`'s pairing table). A
scoped rerun of every file this package touches or is responsible for is
green (§6). Report this as an environment condition, not a package-11
finding.

## Files changed

- **`apps/entrant/app/components/MatchCard.tsx`** — the anatomy fixes:
  - **V3-PE09.4**: the header's `live ? 'bg-status-live text-accent-ink' : …`
    saturated-fill ternary is deleted. The header is now always
    `border-b border-rule-soft text-muted-foreground`; only the state word
    itself takes `text-status-live` when live. The "Live now" section
    heading (`schedule.tsx`) was already plain — this was the one remaining
    saturated encoding of the same fact.
  - **Ledger padding (contract §3.4)**: `gameColumns` is now `score?.length
    ?? 0` in every variant — the old `compact ? GAME_COLUMNS(3) : …` padded
    every bracket-node ledger to 3 columns regardless of games played,
    rendering `aria-hidden` empty cells the contract's §6.1 explicitly bans
    ("assert the ledger container is absent, not that it is empty"). MC-13
    now gets exactly 1/3/5 columns, never padded.
  - **D14**: the aria-label's `competitors` string used to be assembled by
    `persons.map(...).join(' / ')` inline. It is now
    `sideSummaryPhrase(slug, match.sides)` from the new `app/lib/side.ts`
    — joins persons within a side with "and", sides with "versus", and
    folds an unresolved side in by its label rather than a slash.
  - **V3-PE10.1**: `MatchCardData` gained an optional `matchNumber`. When
    present, both the bracket-node and the card/compact-list header render
    `Match {n}` — a visible reference on every node, not just the ones a
    placeholder points at. The bracket-node article gained a third grid
    row for this (`grid-rows-[auto_auto_auto]`, `min-h-[58px]`, up from
    `grid-rows-[auto_auto]`/`min-h-[44px]`) — a genuine geometry change,
    not a cosmetic one, since the node needed somewhere to put it.
- **`apps/entrant/app/lib/side.ts`** (new) — `sideNamePhrase`/
  `sideSummaryPhrase`, the entrant tier's D14 authority named in the
  contract's §6.3 authority table ("new `apps/entrant/app/lib/side.ts` for
  `sideSummaryPhrase`").
- **`apps/entrant/app/components/PersonGroup.tsx`** — **V3-PE14.1**: partners
  now render one per line (`className="block"` per person), and the
  slash-separator span (`<span aria-hidden>/</span>`) is deleted outright,
  not restyled. The empty-`persons` fallback label changed from `'TBD'` to
  `'To be decided'` (contract §6.2).
- **`apps/entrant/public/assets/person-ref.js`** — the same `'TBD'` →
  `'To be decided'` fix in the framework-free twin of the same seam
  (`personRefModel`'s default `label`).
- **`apps/entrant/app/lib/format.ts`**:
  - New `formatCalendarDay`/`formatCalendarMonth` — fixed-table (not
    `Intl`) formatters for a bare `YYYY-MM-DD` calendar day / `YYYY-MM`
    month, matching this module's own stated reason to exist ("Fixed
    English tables, not `Intl`… a locale lookup is a runtime variable").
  - `formatMomentInZone` now returns `string | null` — a parse failure
    returns `null` (contract §7.2: "OMITTED… never print the raw ISO in
    prose") instead of the previous raw-wire fallback. Its one existing
    caller (`tournament.tsx`'s Key Dates row, outside this package's file
    scope) renders nothing for that case, which is strictly the correct
    behaviour and needed no code change there — `null` is a valid React
    child.
- **`apps/entrant/app/lib/schedule.types.ts`** — `scheduleDateLabel` now
  delegates to `formatCalendarDay` (D11) instead of its own
  `Intl.DateTimeFormat` call; identical output, one fewer formatter.
- **`apps/entrant/app/routes/schedule.tsx`**:
  - `monthLabel` now aliases `formatCalendarMonth` (D11), same reasoning.
  - The synthetic "structurally absent side" placeholder changed from
    `'TBD'` to `'To be decided'`.
- **`apps/entrant/app/routes/draw.tsx`** — the largest file in scope:
  - **V3-PE10.2 / P5**: `DrawLoaderData['view']` is now `"bracket" |
    "round" | "list" | null`; the loader no longer defaults an absent
    `?view=` to `"bracket"`. With no explicit `?view=`, the page renders
    **both** the Round block (current round, `RoundPager` + `MatchList`)
    and the Bracket canvas in the same response — `<div class="md:hidden">`
    around the Round block, `<div class="hidden md:block">` around the
    Bracket canvas — so a `< 768px` viewport shows Round and a `≥ 768px`
    one shows Bracket, purely by CSS, with no client redirect and no
    JavaScript. An explicit `?view=bracket|round|list` always wins at
    every width and renders only that one. The old mobile "Wide bracket:
    scroll within this panel, or use Round view…" hint paragraph is
    deleted entirely — the contract bans it in the default state, and the
    default state is no longer bracket-only.
  - **V3-PE10.1**: `nodeToMatch` now passes `matchNumber: node.position` —
    already on the wire (`MatchNodeDTO.position`, "1-based within its
    round" per its own backend docstring) — no backend change needed.
  - **D12**: `nodeToMatch`'s `playedOn` is now
    `node.playedOn ? formatCalendarDay(node.playedOn) : null` instead of
    the raw ISO string verbatim — the one raw-ISO-in-prose site 04a's
    report explicitly left for this package ("`draw.tsx`: … no other
    schedule-state/time/court logic lives here").
  - **V3-PE13.1**: a new line under the draw's meta row states
    `"All times in {page.tournament.timeZone}."` — `timeZone` is already on
    `EntryPageDTO.tournament` (`entryPage.types.ts:117`); no backend change
    needed. Shown on every view (List/Round/Bracket), since match times
    appear in all three.
  - **V3-PE12.1**: the player-search banner changed from two sentences
    ("Showing matches for X." + "N matches in this draw") to the finding's
    own wording, one sentence, plural-aware: `"{N} match(es) found for
    '<name>'"`. "Clear player filter" → "Clear search". The bracket canvas
    is never filtered by a search (it highlights the path instead, via
    `bracket-path.js`) — the wording covers both cases honestly, since
    "found" does not claim filtering.
  - Minor: the hidden `view` form field and the segment/view-nav href
    builders were made null-safe (`...(view ? { view } : {})`) rather than
    ever emitting a literal `"null"` into a query string.
- **`apps/entrant/public/assets/bracket-path.js`** + `.d.ts`:
  **V3-PE12.1** "scrolled into view" — new `scrollPinnedPersonIntoView`,
  called from `mountBracketPath` on load. Finds the first actual match slot
  (`[data-node-key][data-person-ids]`, not a connector brace) carrying the
  pinned person and calls `scrollIntoView({block:'center',
  inline:'center'})`, guarded for environments without it (jsdom). Kept the
  existing highlight mechanism (`is-person-path`/`has-person-path`) as the
  "clear... highlight" half — it already dims everything off the path and
  brightens the connector braces, which reads as a clear highlight without
  inventing a second visual language for "the one found match" specifically
  (the search can match more than one node, e.g. a player's whole draw
  path — scrolling to the first is the reasonable choice and is documented
  as such in the code).
- **New tests**:
  - `apps/entrant/tests/helpers/matchCardFixtures.ts` — the Gate B fixture
    matrix, MC-01…MC-13 (§5.1 of the contract), built on the entrant's real
    `MatchCardData` wire shape rather than the contract's aspirational
    tier-neutral one — see "Fixture matrix fidelity" below.
  - `apps/entrant/tests/matchCard.contract.render.test.ts` — 36 assertions
    against those fixtures: banned-vocabulary scan, winner-mark
    presence/absence, ledger collapse and non-padding, state-word vocabulary
    ("On court" never "Live", no saturated fill), the bracket node's visible
    match number, doubles stacking (never slash-joined), long-diacritic
    names surviving whole, and the "and"/"versus" accessible summary.

## Updates to pinned tests, and why

- **`apps/entrant/tests/draw.render.test.ts`** — `"renders rounds as columns
  with seeds, byes, placeholders and results"` renamed and rewritten to
  `"renders both the Round default and the Bracket canvas, CSS-toggled by
  width"`. Reason: the test pinned the OLD default (`?view=` absent →
  bracket-only, no match detail visible) which V3-PE10.2/P5 explicitly
  overturns — the new default renders both blocks. Also updated: the raw
  `"2026-08-01"` assertion is now `not.toContain` (D12 fix humanizes it),
  and the `<article>` count changed from 3 (bracket-only) to 5 (2 Round-
  block cards + 3 bracket nodes). Added sub-checks for the new
  `?view=bracket` and `?view=round` explicit modes.
  `"makes a player-path search visibly identifiable…"` updated for the
  V3-PE12.1 copy change (`"Showing matches for"` → `"{n} matches found
  for"`, `"Clear player filter"` → `"Clear search"`).
- **`apps/entrant/tests/publicUniversality.test.ts`** — `"pins two-line
  nodes, CSS-grid braces…"` renamed `"pins three-row nodes…"`; the pinned
  `min-h-[44px]`/`grid-rows-[auto_auto]` literals became
  `min-h-[58px]`/`grid-rows-[auto_auto_auto]`. Reason: V3-PE10.1 requires a
  visible reference on every source node, which needed a third grid row —
  the underlying invariant this test protects (fixed CSS-grid geometry, no
  measured layout, no `<svg>`) is unchanged; only the literal numbers moved.
- No test contradicted the contract in a way I could not reconcile by
  updating it; nothing was stopped/flagged as a genuine conflict.

## Fixture matrix fidelity — where the entrant wire falls short of the contract

The match-card contract's §2 `MatchCardData` is tier-neutral and
aspirational; the entrant tier's actual wire (`PlayerMatchDTO`/
`MatchNodeDTO`/`SideDTO`) predates it and does not yet carry:

- a discriminated `Side.unresolved` (§2.1) — `persons: []` plus a
  `placeholder` string is all the wire has. MC-04 (`incompletePair`) is
  built and tested against the CURRENT, imperfect behaviour: a doubles side
  one player short renders exactly as a resolved singles side, with no
  "partner to be confirmed" text, because the wire cannot distinguish the
  two cases. Logged as `V3-11-1` in the debt log.
- `outcome.kind`/`Game.state` — the entrant tier infers "unfinished" from
  `status`/`decided` and "which game a side won" was already correctly
  independent of the match winner (`side.winner` on `PlayerMatchSideDTO`
  is set per the match `result`, not derived from the ledger client-side).
  No entrant-side bug existed here; the fixtures model this with `winner`
  set directly, matching how the backend already projects it.

This is why `matchCardFixtures.ts` is built on the entrant's real
`MatchCardData` type (imported from `MatchCard.tsx`) with inline comments
at each gap, rather than a literal transcription of the contract's §2
shape. Closing these gaps is package 10/10a's wire-shape work (ruling C4);
this package pins today's honest behaviour and flags exactly what changes
once that lands.

## Per-finding acceptance

- **V3-PE09.1–.3** (04a's territory) — re-verified, not redone. `git log`
  confirms 04a's fixes (`schedulePublicStateLabel`, the deleted placeholder
  footer, `dayMatchCountLabel`) are present and their tests
  (`scheduleState.test.ts`, the relevant `schedule.test.ts`/
  `components.test.ts` cases) still pass unmodified.
- **V3-PE09.4** — Fixed. The saturated `bg-status-live` header fill is
  deleted from every MatchCard variant; the "Live now" section heading was
  already plain. `matchCard.contract.render.test.ts`'s `"a routine live
  card carries no saturated fill"` asserts `not.toContain('bg-status-live')`
  on `liveWithLead` (MC-07).
- **V3-PE10.1** — Fixed. Every bracket node (and compact list/card header)
  shows `Match {n}` from the wire's own `node.position`. Not a byte-for-byte
  match to the backend's own "Winner of R32 1" short-round spelling — see
  debt-log `V3-11-2` — but the acceptance criterion ("resolves to a visible
  labelled source match without counting rows") is met: the round heading
  names the round, the node states its own number.
- **V3-PE10.2** — Fixed. No explicit `?view=` now renders both blocks,
  CSS-toggled at the 768px breakpoint; the full Bracket tab stays an
  explicit, always-available option (`DrawViewLinks`); an explicitly chosen
  view is preserved through every internal link (segment switch, player
  search, round pager) because `view` only appears in a link's query string
  when it is non-null.
- **V3-PE11.1** (04a's territory, entrant side) — re-verified: `MatchCard`'s
  footer construction is unchanged from 04a's fix; "Time to be confirmed"
  never coexists with a real time, and no court line reads "unavailable".
- **V3-PE12.1** — Fixed. Banner text is exactly `"{n} matches found for
  '<name>'"` (singular `"match"` at n=1), "Clear search" replaces "Clear
  player filter", and the bracket canvas gets a scroll-into-view on the
  first matching node in addition to its existing path highlight.
- **V3-PE13.1** — Fixed. `"All times in {timeZone}."` renders once per draw
  page load, sourced from the DTO's own `tournament.timeZone`, on every
  view (list/round/bracket) — a direct link to any of them states the zone
  without a trip back to Overview.
- **V3-PE14.1** — Fixed. `PersonGroup` stacks each partner in its own
  `block` element; the slash separator is deleted. Verified against MC-03's
  long, unequal-length, diacritic-bearing pairs in
  `matchCard.contract.render.test.ts` — names render whole (no truncation
  anywhere on this tier, by the site-wide policy `noTruncation.test.ts`
  already enforces), and node height grows naturally with the extra line
  since nothing sets a fixed height (`min-h-[58px]` is a floor).

## Blocked / deferred items

- **Backend round-spelling unification** (`entries_site.py`'s "R32"/"QF"
  short forms vs. the long-form round heading and the new "Match N" node
  label) — outside `apps/entrant/**`. Logged as `V3-11-2`.
- **`pending_member` on the wire** (contract §2.1's discriminated
  `UnresolvedSide`) — cross-cutting wire-shape work, ruling C4, package
  10/10a. Logged as `V3-11-1`/`V3-11-3`.
- **The console/display/board renderers** (§4.1, §4.4, §4.5 of the match-
  card contract) are explicitly out of this package's scope (packages 10
  and 17); nothing under `apps/console/**` or `apps/api/src/display/**` was
  touched.

## Gate B fixture coverage table

| Fixture | Entrant card | Entrant bracket node | Notes |
| --- | --- | --- | --- |
| MC-01 `singlesScheduled` | ✓ (banned-vocab, state-word) | ✓ (match number) | |
| MC-02 `doublesScheduled` | via fixtures | ✓ (stacking, "and"/"versus") | |
| MC-03 `longNamesDoubles` | via fixtures | ✓ (survives whole, no ellipsis) | |
| MC-04 `incompletePair` | via fixtures | banned-vocab only | pins the wire gap, `V3-11-1` |
| MC-05 `unresolvedPredecessor` | banned-vocab, winner-absent | ✓ (label, match number) | |
| MC-06 `noSchedule` | ✓ (winner-absent, "Time to be confirmed") | via fixtures | |
| MC-07 `liveWithLead` | ✓ (winner-absent, "On court", no fill, ledger count) | via fixtures | |
| MC-08 `completedLoserWonAGame` | ✓ (winner mark, 3-column ledger) | via fixtures | |
| MC-09 `walkover` | ✓ (winner mark, ledger collapse) | via fixtures | |
| MC-10 `retirement` | ✓ (winner mark) | via fixtures | |
| MC-11 `withheldSide` | via fixtures | ✓ (dead-reference label) | |
| MC-12 `bye` | ✓ (winner-absent) | ✓ ("Bye" label) | |
| MC-13 `formats` | ✓ (1/3/5-column ledger, never padded) | via fixtures | |

"via fixtures" = the fixture is defined and exercised by at least one of
the two renderer test blocks above, but no dedicated assertion names it —
every fixture in the matrix is rendered at least once under
`matchCard.contract.render.test.ts`'s `it.each` banned-vocabulary scan.

## Commands run and results (verbatim)

```
npm run typecheck:entrant
> react-router typegen && tsc
(clean, no output)

npm run lint:entrant
> eslint .
(clean, no output)

npm run depcruise:entrant
✔ no dependency violations found (110 modules, 322 dependencies cruised)

npm run depcruise            # console — unaffected by this package's files
x 16 dependency violations (0 errors, 16 warnings). 652 modules, 2806 dependencies cruised.
  (pre-existing KNOWN_CROSS_MODULE baseline debt; report-only per CLAUDE.md)

npm run -w apps/entrant test:run     # UNSCOPED — see "Working conditions"
 Test Files  6 failed | 47 passed (53)
      Tests  18 failed | 923 passed (941)
 (all 18 failures are in login.test.ts / logout.test.ts / signup.test.ts /
  recovery.render.test.ts / launch-scripts.test.ts — a concurrent, in-flight
  auth-flow change this package never touched — and dtoParity.test.ts's
  SideDTO-naming-collision failure, caused by a concurrent backend package;
  see "Working conditions" above)

npx -w apps/entrant vitest run \
  tests/matchCard.contract.render.test.ts tests/draw.render.test.ts tests/schedule.test.ts \
  tests/scheduleState.test.ts tests/components.test.ts tests/publicUniversality.test.ts \
  tests/noTruncation.test.ts tests/uiTwins.test.ts tests/bracket-path.script.test.ts \
  tests/personRef.test.ts tests/player.render.test.ts tests/discovery.render.test.ts \
  tests/tournament.render.test.ts tests/myEntries.render.test.ts
 Test Files  14 passed (14)
      Tests  231 passed (231)
```

## Files in scope, for reference

`apps/entrant/app/components/MatchCard.tsx`,
`apps/entrant/app/components/PersonGroup.tsx`,
`apps/entrant/app/lib/side.ts` (new),
`apps/entrant/app/lib/format.ts`,
`apps/entrant/app/lib/schedule.types.ts`,
`apps/entrant/app/routes/schedule.tsx`,
`apps/entrant/app/routes/draw.tsx`,
`apps/entrant/public/assets/person-ref.js`,
`apps/entrant/public/assets/bracket-path.js` + `.d.ts`,
`apps/entrant/tests/helpers/matchCardFixtures.ts` (new),
`apps/entrant/tests/matchCard.contract.render.test.ts` (new),
`apps/entrant/tests/draw.render.test.ts`,
`apps/entrant/tests/publicUniversality.test.ts`,
`docs/audits/v3-consolidated/ledger/11-strings.md` (new),
`docs/reference/debt-log.md` ("Work package 11" section, new).
