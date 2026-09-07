# Ledger — package 11 (public match, round and bracket views)

Columns per plan §4: string key/file:line · surface · state · current text · verdict · final text · factual prerequisite · finding IDs · evidence.

## V3-PE09.4 — no saturated band on a routine live card

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `MatchCard.tsx` header className (was `live ? 'bg-status-live text-accent-ink' : 'border-b … text-muted-foreground'`) | Public card / round / player list header | `live` | a solid green fill + inverted ink on every live card's header band | change | header is always `border-b border-rule-soft text-muted-foreground`; only the state word itself takes `text-status-live` when live | Contract §3.3: "a saturated band … reserved for genuinely exceptional states — not every live card"; the "Live now" section heading (`schedule.tsx`) was already plain, so the card's own band was the one remaining saturated encoding | V3-PE09.4 | contract §3.3 treatment rule |
| `MatchCard.tsx` bracket-node `border-s-2 border-s-status-live` | Bracket node | `live` | kept | keep | unchanged — a 2px border accent is not a saturated fill; it is the one remaining, restrained "this one is live" cue alongside the state word | same | V3-PE09.4 | §3.3 "colour never the only carrier of meaning; the word is always present" |

## D14 — the entrant aria-label seam (`sideSummaryPhrase`)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `MatchCard.tsx:85` (was) `persons.map(...).join(' / ')` used to build the card/bracket-node `aria-label` | every MatchCard variant, accessible name | any | slash-joined string, assembled ad hoc in the component | change | `sideSummaryPhrase(slug, match.sides)` (new `app/lib/side.ts`) — joins persons within a side with "and", sides with "versus" | Contract §6.1 D14: "deleted; call `sideSummaryPhrase`" | (D14) | state-and-formatting §6.1/§6.4 D14 row |

## §6.2 — the generic unresolved fallback

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `PersonGroup.tsx` empty-`persons` fallback | every card/bracket-node side with no persons and no caller-supplied label | any | `'TBD'` | change | `'To be decided'` | Contract §6.2: "Not TBD, not –, not No players, not empty string" | (general, not one finding) | contract §6.2 |
| `public/assets/person-ref.js` `personRefModel` default `label` | the framework-free browser twin of the same seam | any | `'TBD'` | change | `'To be decided'` | same | same | same |
| `schedule.tsx` `scheduleToMatch` synthetic-side placeholder | Schedule cards with a structurally absent side | side absent entirely | `'TBD'` | change | `'To be decided'` | same | same | same |

## V3-PE10.1 — the bracket node's own visible reference

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `MatchCard.tsx` bracket-node / card header, new element | every bracket node; compact list cards; full cards | `matchNumber` present | (absent — no visible reference on a source node) | add | `Match {matchNumber}` | `MatchNodeDTO.position` (1-based within round) is **already on the wire** — no backend change needed; wired through `draw.tsx`'s `nodeToMatch` as `matchNumber: node.position` | V3-PE10.1 | contract §3.6/§4.3; `apps/api/src/entries/entries_site.py:558` `position: int  # 1-based within its round` |

Note: the backend's own placeholder text ("Winner of R32 1", `entries_site.py::_placeholder`/`_side`) still spells the round in its SHORT form (`R32`) while the visible round heading and this new node label use the long form ("Round of 32") and a bare `Match N`. Aligning the three spellings exactly is a backend prose change outside this package's `apps/entrant/**` scope — logged as a blocked item in the package report rather than attempted here.

## V3-PE10.2 — mobile bracket default

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `draw.tsx` bracket canvas, mobile hint paragraph | Bracket canvas, `< md` | any | `"Wide bracket: scroll within this panel, or use Round view to move through each round."` | cut | (removed entirely) | Contract §4.3: "No 'this bracket is wide, scroll sideways' instruction in the default state" — and the default state is no longer bracket-only, so the instruction has no state left to apply in | V3-PE10.2 | contract §4.3 narrow-screen mode table |

## V3-PE12.1 — the search banner

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `draw.tsx` player-search banner | Draw page, `?player=` active | any | `"Showing matches for <name>."` + `"N match(es) in this draw"` (two sentences) | change | `"{N} match(es) found for '<name>'"` (one sentence, plural-aware) | Finding's own proposedChange: `"1 match found for 'Zhu'"` | V3-PE12.1 | findings.json V3-PE12.1 |
| `draw.tsx` clear-search link | same | `playerQuery` set | `"Clear player filter"` | change | `"Clear search"` | same finding: `"use 'Clear search' rather than 'Clear player filter'"` | V3-PE12.1 | same |

## V3-PE13.1 — timezone stated once beside the draw list

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `draw.tsx`, new line under the draw's meta row | Every draw page (list/round/bracket) | any | (absent) | add | `"All times in {page.tournament.timeZone}."` | `EntryPageDTO.tournament.timeZone` is already on the wire (`entryPage.types.ts:117`) — no backend change needed | V3-PE13.1 | contract §4.2 "the timezone stated once nearby" |

## D12 — raw ISO date in a draw-page card footer

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `draw.tsx` `nodeToMatch` `playedOn` | Draw List/Round cards with a played date | `node.playedOn` present | raw ISO `"2026-08-01"` printed verbatim | change | `formatCalendarDay(node.playedOn)` → `"Saturday, August 1"` (the same authority `scheduleDateLabel` now redirects to) | D12: "never print the raw ISO in prose" — this is the one instance package 04a explicitly left for package 11 (`draw.tsx` was out of 04a's scope beyond the placeholder flag) | (D12) | state-and-formatting §7.2/§7.4 D12 row |

## D11 — two second-formatters retired

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `schedule.types.ts` `scheduleDateLabel` | Schedule day headings + cards | any | own `Intl.DateTimeFormat` call (no change in rendered text) | change (implementation only) | delegates to `format.ts`'s `formatCalendarDay` (fixed-table, not `Intl`) | D11: "redirects to authority" | (D11) | `format.ts`'s own docstring: "Fixed English tables, not Intl … a locale lookup is a runtime variable" |
| `schedule.tsx` `monthLabel` | Schedule day-nav month fallback | any | own `Intl.DateTimeFormat` call (no change in rendered text) | change (implementation only) | `const monthLabel = formatCalendarMonth` | same | (D11) | same |
| `format.ts` `formatMomentInZone` | `tournament.tsx`'s Key Dates row (downstream consumer; not touched directly) | timestamp fails to parse | returned the raw wire string | change | returns `null` (the field is then simply not rendered, per §7.2) | Contract §7.2: "Timestamp fails to parse … OMITTED … never print the raw ISO in prose" | (D12) | state-and-formatting §7.2 |

## Not changed here — logged, not fixed

- The backend's short-form round spelling in "Winner of {reference}" placeholders (`R32` vs. the long-form round heading and the new `Match N` node label) — a prose change inside `apps/api/src/entries/entries_site.py`, outside this package's file scope. See the package report's "Blocked / deferred" section.
- `apps/entrant/app/lib/draws.types.ts`'s `SideDTO`/`MatchNodeDTO` do not carry a discriminated `unresolved` (contract §2.1's `pending_member`, etc.) — MC-04 in the fixture matrix pins the current, imperfect one-player-doubles-side behaviour rather than inventing UI for data the wire does not yet distinguish. Cross-cutting wire-shape work is package 10/10a's (ruling C4).
