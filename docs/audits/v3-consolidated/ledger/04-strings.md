# Ledger — package 04a (public court and schedule projection)

Columns per plan §4: string key/file:line · surface · state · current text · verdict · final text · factual prerequisite · finding IDs · evidence.

## D9 — Schedule/draw placeholder apologies

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `MatchCard.tsx:75` footer | Schedule, Draw, Player cards | date missing, time present | `'Date to be confirmed'` | cut | (omitted — no date line) | Contract §3.2: a missing date is never announced beside a time that does exist | V3-PE09.2, V3-PE11.1 | `docs/reference/contracts/state-and-formatting.md` §3.2 |
| `MatchCard.tsx:76` footer | Schedule, Draw, Player cards | time missing | `'Time not assigned'` (gated behind `showAssignmentPlaceholders`) | change | `'Time to be confirmed'` (unconditional, via `schedulePublicStateLabel('time_tbc')`) | Contract §3.1/§3.2: the schedule domain's only two public strings are "Scheduled" / "Time to be confirmed" | V3-PE09.2, V3-PE11.1 | same |
| `MatchCard.tsx:77` footer | Schedule, Draw, Player cards | court missing | `'Court information unavailable'` (gated) | cut | (omitted — no court line) | Contract §3.2: a missing court line is omitted, not apologised for | V3-PE09.1, V3-PE11.1 | same |
| `schedule.tsx:137` `matchCourt` (per-card use removed; group heading remains) | Schedule "By court" group heading | court missing | `'Court pending'` | change | `'Court to be confirmed'` | Same banned-phrase list names "Court pending" as a per-card court line; a *group* still needs a name for the bucket it cannot place — reworded to the honest, non-banned phrasing rather than deleted outright, since deleting it would collapse dateless-court matches out of "By court" entirely | V3-PE09.1 | contract §3.2 banned-phrase list |
| `schedule.tsx:184` `showAssignmentPlaceholders: true` | Schedule route → MatchCard | n/a (flag) | flag forced true unconditionally | cut | flag and its type deleted entirely | Contract §3.2: omission is unconditional, not opt-in per view | V3-PE09.1, V3-PE09.2, V3-PE11.1 | same |
| `draw.tsx:164` `showAssignmentPlaceholders: true` | Draw route → MatchCard | n/a (flag) | flag forced true unconditionally | cut | flag deleted at call site | same | V3-PE10.x (regression avoidance), V3-PE11.1 | same |
| `schedule.tsx:478` `ByTime` group key | Schedule "By time" group heading | time missing | `'Time pending'` | change | `schedulePublicStateLabel('time_tbc')` → `'Time to be confirmed'` | Same canonical phrase as the per-card time line; two synonyms for the same fact is exactly what the contract forbids | V3-PE09.2 | contract §3.1 "no screen-local synonym" |

## D6 — Match-state label

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `MatchCard.tsx:90` `stateLabel` | Every MatchCard header/compact chip | any | 3-way `live ? 'Live' : decided ? 'Completed' : 'Scheduled'` — collapses called/retired/walkover/cancelled/delayed into "Scheduled" | change | delegates to `scheduleStateLabel(match.status)` (the 8-way tier authority); renders no chip at all for an unrecognised status | Contract §2.3: `scheduleStateLabel` is the tier's one speller; the card's own 3-way literal is deleted | (D6, package 11 owns the *word* "Live now"→"On court"; this package removes the *duplicate logic*) | contract §2.3/§2.4 D6 |

## D7/D8 — Backend truthfulness (wire enum values, not prose, but listed for completeness)

| value/file:line | surface | state | current value | verdict | final value | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `entries_site.py` `_meet_public_status` (was inlined at :2408-2415) | Public `/matches`, player ladder | unrecognised persisted status | coerced to `"scheduled"` | change | `None` (status field omitted from the item; excluded from `facets.states`) | Contract §2.2: never coerce unknown → scheduled | (D7) | contract §2.2, §9.4 |
| same | Public `/matches`, player ladder | `called`, results off | coerced to `"live"` | change | stays `"called"` | Contract §9.1 rule 1 | (D8) | contract §9.1 |
| same | Public `/matches`, player ladder | `finished`/`retired`, results off | previously collapsed to `"scheduled"` | change | stays `"completed"`/`"retired"` (score is what results-off hides, not the status) | Contract §9.1 rule 2 ("not a licence to reshape states") | (D8) | contract §9.1 |

## V3-PE09.3 — Day-heading count and card-level raw ISO date

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `schedule.tsx` `DayNavigation` consecutive-days `SegmentedNav` | Schedule day nav | any | date label + bare numeric `count` trailing figure (renders visually as e.g. "Friday, July 31 124") | change | label baked as `` `${scheduleDateLabel(day.day)} · ${count} matches` `` — the count always carries a noun; the bare `count` prop is no longer passed | "Counts have nouns" (V3-PE09.3 acceptance) | V3-PE09.3 | finding proposedChange: "Fri 31 Jul · 124 matches" |
| `schedule.tsx` `DayNavigation` non-consecutive months fallback | Schedule day nav | any | `(day.count)` bare parenthesized number | change | `(${count} matches)` via the same `dayMatchCountLabel` helper | same | V3-PE09.3 | same |
| `schedule.tsx` `scheduleToMatch` `playedOn` | Cards inside a day-scoped list (a `day` filter is active) | matches.length any | raw ISO `scheduledDate` (e.g. `2026-07-31`) printed verbatim in the footer | cut | omitted (`null`) — the active day nav/heading already states the date | Contract §3.2: "no date in the footer when the group already states it" | V3-PE09.3 | same |
| `schedule.tsx` `scheduleToMatch` `playedOn` | Cards when no day filter is active (list spans multiple days) | matches.length any | raw ISO `scheduledDate` printed verbatim | change | `scheduleDateLabel(scheduledDate)` (the same human date formatter the day heading uses) | D12: "do not add new raw-ISO prose" — this is pre-existing raw-ISO prose in scope for this package's MatchCard/schedule.tsx surface; full date-format unification stays package 11's job | V3-PE09.3 | plan §1 D11/D12 scope note |

## Deferred / not changed (logged, not fixed here)

- A literal "Day to be confirmed" **group heading** for a match with no date at all is not implemented in `schedule.tsx`'s By-time/By-court views (only the day-*navigation* facet silently excludes a dateless match). The per-card behavior — no date line when the date is missing — is implemented and tested; the grouping feature is logged as debt (see report and debt-log).
- `entries_json.py` / `entries_me.py`: audited for the "twins redirect to authority" delta (§9.4). Neither file duplicates match-schedule-status or court logic — their only status-shaped field is unrelated *entry application* status (pending/waitlisted/etc. in `entries_me.py`). No change made; noted in the report.
