# Contract: state, identity, time and formatting

**Status:** Proposed — 2026-09-06, v3 consolidated plan work package 02. Baseline `f5ccfcef`.
Documentation only: nothing in this page has been implemented yet.

This page makes plan §5's contract table concrete. It is the reference every later package cites
when it asks "what does this state mean, what do we render when the value is missing, and who owns
the answer?" It is deliberately a *contract*, not a style guide: it fixes meanings, labels,
fallbacks and ownership, and leaves visual treatment to the design packages (06–09).

::: info Why one authority per domain, and not one enum
Plan §3 adapts recommendation X5: share **domain-specific formatters, not one enum spanning
lifecycle, match readiness, scheduling and connectivity**. "Time to be confirmed" is scheduling
information; it is not a match state. Each of the nine domains below therefore gets its own
canonical set and its own single authority module. See
[ADR 0029](/explanation/decisions/0029-state-and-formatting-contract).
:::

::: danger Amended 2026-09-07 — operator visual fixes, package P0
`operator-visual-fixes.md` is approved product direction and **supersedes** the rules below wherever
they disagree. Six changes, each also applied in place below and marked *(P0)*:

1. **Module vocabulary.** The operator sections are **Setup · Participants · Bracket · Operations ·
   Display · Administration**, with **Overview** the workspace landing page. *Competition* and
   *Publish* are retired as section words; **Meet** names Meet-specific destinations where the Meet
   module is enabled. Every label, breadcrumb, accessible name and route-coverage count in this
   contract's scope uses that set.
2. **Court queues are the default Plan view** (§3). The time-scaled board is a secondary
   **Timeline** toggle. Raw slot labels (`S152`, `Slot 52`) are internal identifiers and never
   appear in operator copy.
3. **Paired score summaries, no per-game bolding** (§5.1). See the match-card contract §2.7/§3.4.
4. **Court-first signage with no public diagnostics** (§9.1). A board tile's court number is its
   largest element; an empty, unavailable or disputed court renders the court number alone.
5. **A board "Next" preview is a persisted setting, default off** (§9.1).
6. **Diagnostics are operator-owned** (§4, §8, §9). Conflict detail, connection state, freshness
   and recovery live in operator surfaces; the public board receives no alert, no banner and no
   task.
:::

::: danger Amended 2026-09-07 — public visual fixes, package P0
`public-visual-fixes.md` is approved product direction for the **public entrant tier** and
supersedes the rules below wherever they disagree. It extends, and does not reverse, the operator
amendment above: everything that amendment fixes about the operator's vocabulary, paired scores and
operator-owned diagnostics still holds. Five changes, each also applied in place below:

1. **One tournament frame** (§11, new). Every tournament-scoped public route — Overview, Schedule,
   Draws, a draw detail, Players, a tournament-scoped player page, Regulations — renders inside one
   shared frame: the same hero, the same tab bar, and one breadcrumb trail rendered once, above the
   hero. Per-page back links, per-page heroes and a page's own second navigation are deleted.
2. **A public empty side is empty** (§6.1, §6.2). The public tier renders an unresolved side as
   **empty participant slots plus one muted feeder line**; the operator keeps "Winner of
   {reference}". Neither tier ever renders a machine id, and the *public* tier never renders the
   phrase "Winner of".
3. **Paired scorelines, publicly too** (§5.1). A published score reads as paired games —
   `21–16, 22–20` — in first-listed-side order, with no per-game emphasis, right-aligned in a
   bracket node and clearly attached to its side on a schedule card.
4. **One match reference, both tiers** (§6.1). A public bracket node and the operator's match list
   name the same match with the **same string**, produced by the same identity authority. `Match 1`,
   `Match 2` and any per-surface renumbering are deleted.
5. **Venue-local time, no technical strings** (§7). Public copy states "All times local to the
   venue" once, in the tournament hero, and then prints venue-local dates and times with **no IANA
   identifier and no GMT/UTC offset**. The timezone stays in the data and in machine attributes; it
   leaves the prose.
:::

## How to read a domain section

Every section has the same four parts.

| Part | What it fixes |
| --- | --- |
| **1. Canonical states** | the state set, the meaning of each state, the exact operator label, the exact public label |
| **2. Missing data** | what renders when a time, court, opponent, score or predecessor is absent — with the exact fallback wording |
| **3. Authority** | the one module that owns the set, the labels and the derivation, per tier |
| **4. Implementation delta** | every divergent site from the code map's D1–D20 that belongs to this domain, its verdict, and the package that carries it |

The four verdicts in part 4 are fixed:

- **becomes authority** — this site is promoted; other sites redirect to it.
- **redirects to authority** — this site keeps its call sites but imports its answer.
- **deleted** — this site's logic goes away entirely.
- **kept as a documented view-local rule** — the divergence is intended; the section says why.

Evidence: `docs/audits/v3-consolidated/maps/02-04-contracts.md` (D1–D20 with `file:line`). A sample
of those was re-verified against the tree at `f5ccfcef` before this page was written — see
[Verification of the code map](#verification-of-the-code-map).

---

## 1. Tournament lifecycle

### 1.1 Canonical states

The lifecycle is a **prefix of entries phases followed by a play state**, which is what the backend
already derives (`_entries_phase` returns `None` to fall through to play state). That structure is
kept; only the labels are fixed.

| State | Meaning | Operator label | Public label |
| --- | --- | --- | --- |
| `announced` | The public page exists; no entry window has opened and nothing has been entered. | Announced | Announced |
| `entries_open` | At least one event is inside its entry window. | Entries open | Entries open |
| `entries_review` | Every window has closed and the desk still has undecided or uncommitted entries. | Entries to review | Entries closed |
| `setup` | Entries are settled; configuration or draws are incomplete. | In setup | Entries closed |
| `draws_published` | At least one draw is public; play has not started. | Ready | Draws published |
| `live` | Play is under way. | Live | Live now |
| `complete` | Every scheduled match has a terminal outcome. | Completed | Complete |
| `archived` | The workspace is retained read-only. | Archived | Archived |

Two rules follow from plan §3's "Match state Live vs On court" ruling:

- **"Live now" is a lifecycle/section word, never a match state.** A tournament is *Live now*; a
  match is *On court*. The public tier already spells the lifecycle this way
  (`apps/entrant/app/lib/phase.ts`, `phaseLabel('live') === 'Live now'`) and keeps it.
- `entries_review` and `setup` are **operator-only distinctions**. Publicly both read *Entries
  closed*: a spectator has no interest in which desk task is outstanding, and publishing the
  distinction leaks organiser workload.

### 1.2 Missing data

| Absent | Renders |
| --- | --- |
| No public page (`page_open` false) | The workspace has no lifecycle chip at all on the public tier. The operator tier shows the play state alone. |
| Phase unknown / unrecognised value | Nothing. Never fall back to a positive phase. `normalizeTournamentPhase` already returns `null` for unknown values and that behaviour is contractual. |
| No dates configured | Operator: "Dates not set". Public: the key-dates block is omitted, not filled with a placeholder date. |

### 1.3 Authority

| Tier | Module | Note |
| --- | --- | --- |
| Backend derivation | **new** `workspaces/lifecycle.py` | Lifts `_entries_phase` / play-state fall-through out of `workspace_signals.py` so both the signals DTO and the public site projection call one function. |
| Console labels | **new** `apps/console/src/platform/domain/lifecycle.ts` | State set + `lifecycleLabel()`. |
| Entrant labels | `apps/entrant/app/lib/phase.ts` (**becomes authority**) | Already the tier's single speller; gains `entries_review`/`setup` collapsing to *Entries closed*. |

### 1.4 Implementation delta

| Site | Verdict | Package |
| --- | --- | --- |
| `apps/api/src/workspaces/workspace_signals.py` `_entries_phase` + play-state fall-through | becomes authority (relocated to `workspaces/lifecycle.py`) | 02→03 |
| `apps/entrant/app/lib/phase.ts` `phaseLabel` | becomes authority (entrant tier) | 21 |
| `apps/entrant/app/lib/phase.ts` `normalizeTournamentPhase` compatibility spellings | kept as a documented view-local rule — it is a wire-compat shim for older projections, not a second vocabulary | 21 |
| Hub / Overview lifecycle words in `apps/console/src/modules/hub/` and `workspace/overview/` | redirects to authority | 12 |

---

## 2. Match readiness and play

### 2.1 Canonical states

The canonical set is the Operations state machine (`apps/api/src/operations/match_state.py`,
`scheduled → called → playing → finished | retired`) plus two **derived readiness** values that are
not persisted statuses and must never be written to the wire as if they were.

| State | Persisted? | Meaning | Operator label | Public label |
| --- | --- | --- | --- | --- |
| `pending` | derived | A prerequisite is unmet: an unresolved predecessor match, an incomplete pair, or an unstarted feeder round. | Pending | *(not published — see 2.2)* |
| `ready` | derived | Every prerequisite is met; the match can be called. | Ready | Scheduled |
| `scheduled` | yes | Persisted resting state. Says nothing about whether a slot or court is approved — that is the **schedule** domain (§3). | Scheduled | Scheduled |
| `called` | yes | Players have been called to a court; the court is not yet occupied. | Called | Called |
| `playing` | yes | The match is being played on a court. | **On court** | **On court** |
| `finished` | yes | Play completed and a result was recorded. | Completed | Completed |
| `retired` | yes | Terminal, adjudicated: a side retired. | Retired | Retired |

Three additional **outcomes** are carried on the result, not the status (see §5.1): `walkover`,
`cancelled`, `no_result`. The public schedule DTO's eight-value union
(`apps/entrant/app/lib/schedule.types.ts`) is the *projection* of status × outcome, not a second
state machine; §9 fixes the projection.

Ruling constraints applied here:

- **"On court" is the match-state word for `playing`.** The console's `STATE_WORD.live` (*Live*)
  stops being a match state; it survives only as the lifecycle/section word of §1. A *section* may
  be headed "Live now"; a *match* is never labelled "Live".
- `called` is **outside** court occupancy for counting purposes (§4) but **inside** the "this court
  has been committed" set for assignment purposes. These are two different questions and get two
  differently-named predicates, which is the fix for D20.
- `pending` and `ready` are console-derived. The backend does not persist them and must not start
  to; the derivation lives with the domain that knows the prerequisite (Bracket feeders, Entries
  pair completeness).

### 2.2 Missing data

| Absent | Renders |
| --- | --- |
| Status unknown / unrecognised | Operator: the match renders with **no state chip** and a diagnostic in the row's detail panel. Public: the match is **omitted from state facets** and rendered with no state chip. **Never coerce an unknown status to `scheduled`** — that is D7 and it is the mechanism by which a cancelled match reappears as an upcoming one. |
| Predecessor unresolved | Operator: *Pending*, with the blocking match named ("Waiting on QF1"). Public: the match still appears in the draw with an unresolved side (§6.2); its state chip is *Scheduled* only if it has an approved slot, otherwise §3's *Time to be confirmed*. |
| `pending` reaches a public projection | It must not. Public projection maps `pending` → the schedule domain's answer, never a match-state word. A spectator cannot act on a desk prerequisite. |
| Result missing on a `finished` match | Operator: *Completed · result not recorded*, and the row offers "Record result". Public: *Completed*, with no score ledger (§5.2). Never render `0–0`. |

### 2.3 Authority

| Tier | Module | Note |
| --- | --- | --- |
| Backend state machine | `apps/api/src/operations/match_state.py` (**becomes authority**, unchanged in behaviour) | Already owns `VALID_TRANSITIONS` / `LOCKED_STATUSES`. |
| Backend vocabulary + wire aliases | **new** `apps/api/src/shared/match_vocabulary.py` | The canonical set, the **bidirectional** legacy alias map (`started ↔ playing`, and the `retired` case D4 currently drops), the public projection map, and the two occupancy predicates. Lives in `shared/` because Operations, Entries, Display and Workspaces all need it and no one of them may import another (`apps/api/.importlinter`, per-domain independence). |
| Console words | `apps/console/src/lib/stateWords.ts` (**becomes authority** for the words) | Keeps its role as the one place a word is spelled; `live` is retired from the match-state role and `onCourt` becomes the `playing` label. |
| Console state model | **new** `apps/console/src/platform/domain/matchState.ts` | The state set, the derivation of `pending`/`ready`, and `matchStateLabel()`; imports the words from `stateWords.ts`. |
| Entrant | `apps/entrant/app/lib/schedule.types.ts` (**becomes authority**) | `scheduleStateLabel` is the tier's one speller; `MatchCard`'s three-way literal is deleted. |

### 2.4 Implementation delta

| D | Site | Verdict | Package |
| --- | --- | --- | --- |
| D4 | `apps/api/src/operations/match_state_routes.py` `_LEGACY_TO_CANONICAL` (one-directional, drops `retired`) | redirects to authority (`shared/match_vocabulary.py`), made bidirectional and total | 03 |
| D4 | `apps/api/src/display/display.py` legacy `started` in `/match-states` | redirects to authority | 04 |
| D5 | `apps/console/src/lib/stateWords.ts` | becomes authority | 09 |
| D5 | `apps/console/src/components/control-plane/matchStatus.tsx` `STATUS_LABEL` | redirects to authority — it already imports `STATE_WORD`; its four-value `MatchListStatus` becomes a documented **view-local projection** of the canonical set, named as such | 10 |
| D5 | `apps/console/src/modules/operations/plan/PlanCallList.tsx:22-27` literal `'Playing'` | deleted (use *On court*) | 03 |
| D5 | `apps/console/src/modules/operations/UnifiedOpsList.tsx:127` own vocabulary | deleted | 03 |
| D5 | `apps/console/src/modules/display/bracketDisplay/BracketLiveView.tsx:48` | redirects to authority | 17 |
| D5 | `apps/console/src/modules/display/publicDisplay/CourtsView.tsx:259-270` band words | redirects to authority | 17 |
| D5 | `apps/console/src/modules/display/publicDisplay/LiveStatusPill.tsx:29` | redirects to authority | 17 |
| D5 | `apps/console/src/modules/operations/runtime/runMachine.ts` `RUN_STATUS_LABEL` | redirects to authority | 03 |
| D6 | `apps/entrant/app/components/MatchCard.tsx:90` three-way `stateLabel` | deleted; call `scheduleStateLabel` | 11 |
| D6 | `apps/entrant/app/lib/schedule.types.ts:72-91` | becomes authority (entrant) | 11 |
| D7 | `apps/api/src/entries/entries_site.py:2409` and `:2316-2323` unknown → `scheduled` | deleted; unknown yields "state omitted" per 2.2 | 04 |
| D20 | `match_state.py:174-178`, `workspace_signals.py:568-570`, `runModel.ts:174-182,120`, `MeetDisplayPage.tsx:165-167` `called` in/out of occupancy | redirects to authority — two named predicates (§4.3) replace four ad-hoc rules | 03, 04 |

---

## 3. Schedule

### 3.1 Canonical states

**Schedule state is separate from match state** (plan §3, "Match state Live vs On court"). A match
has one of each. The schedule domain answers only: *does this match have an approved time and an
approved court?*

The two underlying fields are independent, as plan §5 requires:

| Field | Meaning |
| --- | --- |
| `approvedSlot` | A time slot the operator has approved for publication. A solver *proposal* is not an approved slot. |
| `approvedCourt` | A court the operator has approved for publication. |

| State | Meaning | Operator label | Public label |
| --- | --- | --- | --- |
| `slot_approved` | An approved time exists (court may or may not). | *(the time itself; no chip)* | **Scheduled** |
| `slot_pending` | No approved time. | Not scheduled | **Time to be confirmed** |

**The public schedule state is exactly one of two strings: "Scheduled" or "Time to be confirmed".**
No third public spelling, and no screen-local synonym.

A pending *participant* does not make a slot pending: plan §5 is explicit that "a pending
participant can still have a genuinely approved slot". A match whose second side is *Winner of QF1*
and whose 14:00 slot is approved is publicly **Scheduled · 14:00**.

::: warning Presentation of the schedule *(P0, 2026-09-07)*
Two presentation rules travel with this domain, from `operator-visual-fixes.md`:

1. **Court queues are the default Plan view.** Each court is an ordered lane of uniform match cells
   with the estimated time beneath each cell in muted text. The time-scaled board stays available
   behind a secondary **Timeline** toggle, and the zoom/`Time · Auto` controls belong to that
   toggle alone. Reordering within and across lanes goes through the existing validated schedule
   commands, with a keyboard-accessible equivalent; CP-SAT, slot/time data, rest constraints,
   overlap checks, court availability, session boundaries and pinned assignments are unchanged.
2. **Slot indices are storage, never copy.** `S152`, `Slot 52` and every equivalent raw slot label
   are removed from the queue, the call list and every other operator surface. A slot is rendered
   as its wall-clock time (§7) or not at all. Routine "scheduled" checkmarks are removed too: the
   lane already conveys that the match is scheduled.
:::

### 3.2 Missing data

This is where the current tier lies, and the rules are absolute.

| Absent | Renders — operator | Renders — public |
| --- | --- | --- |
| Time | "Not scheduled" | **"Time to be confirmed"**. Never a placeholder time, never `00:00`, never a *Scheduled* chip. |
| Court, time approved | "Court not assigned" | The time renders alone. The court line is **omitted** — not "Court information unavailable", not "Court pending". |
| Court and time | "Not scheduled" | **"Time to be confirmed"** alone. |
| Date | "Date not set" | The match is grouped under **"Day to be confirmed"**; the footer shows no date. Never "Date to be confirmed" beside a time that does exist. |
| Court withheld because the court is disputed (§4) | Operator sees the dispute (§4). | The court is omitted and the schedule state is unchanged. A disputed court is never published as a court. |

::: danger The rule this replaces
`apps/entrant/app/components/MatchCard.tsx:76-82` renders `'Date to be confirmed'`, `'Time not
assigned'` and `'Court information unavailable'` as *footer content*, switched on by
`showAssignmentPlaceholders: true`, which `apps/entrant/app/routes/schedule.tsx:183` sets
unconditionally. Line 90 then labels the same match **"Scheduled"**. An unscheduled, uncourted match
therefore reads as a positively scheduled one with three apologies underneath. The fallback for a
missing value is **omission plus one honest state word**, never a row of placeholders.
:::

### 3.3 Authority

| Tier | Module | Note |
| --- | --- | --- |
| Backend | **new** `apps/api/src/shared/schedule_slots.py` | Slot index → wall-clock, and the `slot_approved` / `slot_pending` predicate. Absorbs `entries_site.py:_hhmm_plus`, `entries_site.py:_slot_time` and `workspace_signals.py:_slot_time_label` (D10). |
| Console | `apps/console/src/lib/time.ts` `slotToTime` (**becomes authority**) | Delegates its wall-clock rendering to §7's formatter. |
| Entrant | `apps/entrant/app/lib/schedule.types.ts` | Gains `schedulePublicState(match)` returning exactly `'scheduled' \| 'time_tbc'` and its two labels. |

### 3.4 Implementation delta

| D | Site | Verdict | Package |
| --- | --- | --- | --- |
| D9 | `apps/entrant/app/components/MatchCard.tsx:76-82` placeholder footer | deleted | 04, 11 |
| D9 | `apps/entrant/app/routes/schedule.tsx:183` `showAssignmentPlaceholders: true` | deleted (the whole flag goes) | 04 |
| D9 | `apps/entrant/app/routes/schedule.tsx:136-138` `"Court pending"` | deleted | 04 |
| D9 | `apps/console/src/hooks/useLiveOperations.ts:298` `'00:00'` fallback | deleted — render "Not scheduled" | 03 |
| D10 | `entries_site.py:420 _hhmm_plus`, `:1012 _slot_time`, `workspace_signals.py:238 _slot_time_label` | redirect to authority (`shared/schedule_slots.py`) | 04 |
| D10 | `apps/console/src/lib/time.ts:51 slotToTime` | becomes authority (console) | 03 |
| — | `apps/entrant/app/components/MatchCard.tsx:90` "Scheduled" for an unassigned match | deleted; call `schedulePublicState` | 04, 11 |

---

## 4. Conflicts

### 4.1 Canonical states

Plan §5: *a disputed court is neither safely free nor a verified single current match.* That makes
court occupancy a **three-value** answer, not a boolean, and D2/D3 exist because two of the current
implementations answer it with a boolean and disagree about which bucket the third value falls in.

| Court state | Meaning | Operator label | Public label |
| --- | --- | --- | --- |
| `free` | No match is on this court and none is disputed. | Free | Court free |
| `occupied` | Exactly one match is `playing` on this court. | On court | On court |
| `disputed` | Two or more matches claim this court as currently in play. | **Needs resolution** | *(P0, 2026-09-07)* **no public label and no match content — the court number alone.** The board never picks one of the competing claims, and the court is **not** reported free in operational data. |

Two predicates replace the four ad-hoc occupancy rules (D20), and the difference between them is the
`called` question:

- `occupiesCourtNow(status)` — true for `playing` only. Feeds **counts** (`playing`, `courtsFree`)
  and conflict detection. `called` is excluded: players are still walking.
- `holdsCourtCommitment(status)` — true for `called`, `playing`, `finished`, `retired`. Feeds
  **assignment** decisions and the solver's `LOCKED_STATUSES`, which already spells exactly this set.

Counting rules, fixing D2 and D3 together:

- `courtsFree` = courts whose state is `free`. A `disputed` court is **not free**.
- `playing` = the number of **courts in state `occupied`**, plus a separate `disputedCourts` count.
  A disputed court contributes **one** entry to `disputedCourts` and **zero** to `playing`. Today
  `runModel.ts:275` counts both matches as playing while `:289` excludes the lane from free — the
  same court is simultaneously two occupied courts and not-free, which is D3.
- Every surface that publishes a court tally publishes `disputedCourts` alongside. A tally that
  cannot show it must show none of them.

### 4.2 The operator conflict record

Plan §5 requires that "operator recovery identifies competing assignments and records the chosen
resolution", and plan §1 package 03 requires that "conflicts open actionable assignments". Today
nothing does: `apps/api/src/operations/conflict_metrics.py` is a process-local counter, the Run
surface's banners come from *rejected commands* rather than from detection (D18), and a
pre-existing double assignment produces no banner and no task at all.

**Shape.** A `CourtDispute`:

| Field | Type | Meaning |
| --- | --- | --- |
| `courtId` | int | The physical court in dispute. |
| `claims` | `CourtClaim[]` | One per competing match: `matchKey`, `matchIdentity` (§6), `status`, `startedAt`, `source` (`meet \| bracket`), `version`. |
| `detectedAt` | instant | When the authority first observed the dispute. |
| `resolution` | `CourtResolution \| null` | `null` while open. |

A `CourtResolution`: `chosenMatchKey`, `displacedMatchKeys[]`, `action`
(`keep_and_move \| keep_and_unassign \| keep_and_finish`), `decidedBy`, `decidedAt`, `note`.

**Persisted vs derived — recommendation: derive the dispute, persist the resolution.**

- The **dispute is derived**, on demand, by the one authority module (§4.3) from the current match
  rows. Rationale: a dispute is a pure function of state the database already holds. Persisting it
  creates a second truth that goes stale the instant an operator moves a match by any other route,
  and it would need its own reconciliation job — a new consistency problem introduced to describe a
  consistency problem.
- The **resolution is persisted**, as an ordinary idempotent entry on the existing command path
  (`apps/api/src/operations/commands.py`, and `apps/console/src/lib/commandQueue.ts` offline). It is
  an operator decision, it must survive a reload, it must be auditable in the activity log
  (package 20), and it must be queueable offline (plan §1 package 03: "recovery works offline"). The
  command queue already gives idempotency keys, `seen_version` and 409 mapping; a resolution is
  exactly the kind of thing it exists for.
- Consequence: a resolved dispute stops being derived because the underlying rows changed. There is
  no "resolved but still detected" state to reconcile, which is the point.
- **Actionability**: the derived dispute is surfaced as an **assignment** — an item in the Run
  surface's work list, with the competing claims named and each resolution action a button. It is
  not a banner. A banner is not an assignment, and D18's banners disappear on reload.

::: tip Ruled — C1 (confirmed 2026-09-06: derive the dispute, persist the resolution)
Derive-the-dispute / persist-the-resolution is the recommendation, not a settled product decision.
The alternative is a `court_disputes` table with an explicit open/closed lifecycle, which buys a
durable `detectedAt` for post-event review and an unambiguous "who saw it first" across event nodes
(ADR 0022 authority epochs), at the cost of a reconciliation path. Confirm before package 03 starts.
:::

::: tip Ruled — C2 (confirmed 2026-09-06: only the court field is withheld)
Whether a dispute blocks the *public* projection of the whole court (current behaviour of
`_merge_live_bracket_courts`, which pops the court for both matches) or only the court field while
both matches stay visible. This page assumes the latter — both matches remain listed, neither shows
a court — because hiding a match from the public schedule because staff made a desk error is a worse
failure than showing it without a court.
:::

### 4.3 Authority

| Tier | Module | Note |
| --- | --- | --- |
| Backend | **new** `apps/api/src/shared/court_occupancy.py` | `occupiesCourtNow` / `holdsCourtCommitment`, `deriveCourtStates(matches) -> {courtId: free\|occupied\|disputed}`, `deriveDisputes(matches) -> CourtDispute[]`, and the `courtsFree` / `disputedCourts` counts. `shared/` because Operations, Workspaces, Entries and Display all need it. |
| Backend write guard | `apps/api/src/operations/match_state.py` `assert_court_available` (**becomes authority** for the *write* rejection) | Keeps rejecting a second `playing` match; its predicate comes from `shared/court_occupancy.py`. The duplicate inline copy in `repositories/local.py:2469-2504` is deleted. |
| Console | **new** `apps/console/src/platform/domain/courtOccupancy.ts` | The console twin. `runModel.ts` and `courtLanes.ts` both call it. |
| Console surfacing | `apps/console/src/modules/operations/run/RunSurface.tsx` | Renders disputes from the derived list, not from the command-rejection store. |

### 4.4 Implementation delta

| D | Site | Verdict | Package |
| --- | --- | --- | --- |
| D1 | `apps/api/src/operations/match_state.py:164-194` `assert_court_available` | becomes authority (write guard); predicate redirects | 03 |
| D1 | `apps/api/src/repositories/local.py:2469-2504` inline duplicate | deleted | 03 |
| D1 | `apps/console/src/modules/operations/runtime/runModel.ts:118-124` | redirects to authority | 03 |
| D1 | `apps/console/src/modules/display/publicDisplay/courtLanes.ts:43-62, 92-101` | redirects to authority | 04 |
| D1 | `apps/console/src/modules/display/MeetDisplayPage.tsx:151-169` own detector | deleted | 04 |
| D1 | `apps/api/src/entries/entries_site.py:2058-2095` `_merge_live_bracket_courts` | redirects to authority; withhold rule restated per C2 | 04 |
| D2 | `apps/api/src/workspaces/workspace_signals.py:370, 501` conflict-blind `courtsFree` | redirects to authority | 03 |
| D2 | `apps/console/src/modules/operations/runtime/runModel.ts:280-286` comment claiming unification | deleted — the comment is false and the code it describes is being replaced | 03 |
| D3 | `runModel.ts:275` disputed court counted as two playing matches | redirects to authority; `playing` becomes a court count with a sibling `disputedCourts` | 03 |
| D18 | `apps/console/src/modules/operations/run/RunSurface.tsx:148-166, 446-481` banners from rejected commands | redirects to authority — rejections stay as *toasts for the action*, disputes become *assignments* | 03 |
| D18 | `apps/console/src/modules/operations/run/RunCourtGrid.tsx:176` lane-state banner | redirects to authority | 03 |
| D19 | `apps/console/src/modules/display/publicDisplay/courtLanes.ts:9-29` public vs operator "now" | **kept as a documented view-local rule** — the board's "now" window is deliberately wider than the desk's so a court does not blink empty between matches. The *rule* moves into the authority module as a named, parameterised window (`nowWindow: 'desk' \| 'board'`) so it is a documented option rather than an undocumented divergence. | 04, 17 |
| — | `apps/api/src/operations/conflict_metrics.py` process-local counter | kept as a documented view-local rule (it is a metric, not a state source); gains a docstring saying so | 03 |

---

## 5. Score

### 5.1 Canonical states

Plan §5 requires five score conditions plus supported special outcomes. They are two orthogonal
axes: the **ledger** (what points exist) and the **outcome** (how the match ended).

**Ledger, per game:**

| Ledger state | Meaning | Operator | Public |
| --- | --- | --- | --- |
| `unplayed` | The game has not started. | *(cell omitted)* | *(cell omitted)* |
| `in_progress` | Points are being recorded; the game has not met the completion rule. | the two scores, neither emphasised | the two scores, neither emphasised |
| `complete` | The game met the configured completion rule. | the two scores, **neither emphasised** *(P0, 2026-09-07 — per-game emphasis is deleted everywhere)* | same |

**Ledger, per match:** `no_games_recorded` (the whole ledger is absent) vs `partial` vs `complete`.

**Outcome, per match:**

| Outcome | Meaning | Operator label | Public label |
| --- | --- | --- | --- |
| `in_play` | No outcome yet. | *(no outcome word)* | *(no outcome word)* |
| `decided` | A side won under the configured rules. | Completed | Completed |
| `retired` | A side retired mid-match. | Retired | Retired |
| `walkover` | A side did not play. | Walkover | Walkover |
| `cancelled` | The match will not be played. | Cancelled | Cancelled |
| `no_result` | Abandoned without a decision. | No result | No result |

**Per-game winner derives only from completed games.** Plan §3 corrects the mockup outright: *higher
live score is a lead, not a won game.* The rule is:

1. A game is `complete` only when the **configured scoring rules** say so — the workspace's
   `scoringFormat` (`simple \| badminton`), `pointsPerSet`, `deuceEnabled` and, where configured,
   `setsToWin` (`apps/api/src/workspaces/setup.py:139, 640`).
2. Only a `complete` game has a winner. *(P0, 2026-09-07)* **No game score carries emphasis**,
   complete or not: the recorded games render as one centred pair sequence — `18–21, 21–15, 21–13`
   — whose first number always belongs to the first-listed side. Winner emphasis is carried by the
   winning side's **name** and nothing else.
3. **The match winner is never inferred from the ledger.** It comes from the authoritative match
   outcome. Retirement and walkover in particular can contradict the point totals entirely.
4. **A losing side can win individual games**, and that stays legible from the numbers in the
   paired sequence rather than from ink *(P0, 2026-09-07 — this rule previously required per-game
   emphasis independent of the match-winner mark; that emphasis is now deleted)*.
5. **The match-winner mark is absent during an unfinished match** and carries an accessible text
   equivalent when present (e.g. `aria-label="Winner"` on the mark, or visually hidden text) — never
   a bare glyph.
6. **The public tier follows the same rule, in its own layouts** *(P0, 2026-09-07)*. A published
   score reads as the paired sequence `21–16, 22–20`, first number to the first-listed side, no
   per-game emphasis, winner shown only by the winning side's name. On a **bracket node** the
   sequence is right-aligned against the node's trailing edge; on a **schedule card** each side's
   games sit on that side's own row so the association is positional rather than inferred. Where
   live scores are published, the **current game** is shown; where they are not, no promise of
   updating scores is displayed. **An absent score renders nothing** — never `0–0`, never a dash —
   and a retirement or walkover keeps whatever was actually played (a walkover has no games at all).

::: tip Ruled — C3 (confirmed 2026-09-06)
The configuration carries `deuceEnabled` but **no point cap field**. Plan §3 rules out hardcoding
"cap 30" and prefers plain "Win by 2" with *the actual configured cap*. Either a cap becomes a real
configuration field, or the copy says "Win by 2" with no cap claim. Recommendation: add
`pointCap` (nullable) to the scoring configuration in package 13 and have the formatter print the cap
only when set. Confirm before packages 09/13.
:::

### 5.2 Missing data

| Absent | Renders |
| --- | --- |
| No games recorded at all | **Collapse the ledger completely** (plan §3, "Collapse empty score cells" — *adopt fully*). No empty cells, no reserved width, no padding, no rule, no invisible winner mark. A card with no scores has no score column. |
| Some games recorded | Render only the recorded games. Never pad to the configured game count with empty cells. |
| Score withheld by publication settings | Public renders **no ledger**, and the accessible summary says "Score not published". **Absent scores are not zero** (plan §3, "Board scores always present" — conditional). |
| Outcome `retired` / `walkover` with a partial ledger | Render the partial ledger **and** the outcome word. The outcome, not the ledger, determines the winner mark. |
| `finished` with no result recorded | See §2.2: operator gets a "Record result" action; public gets *Completed* with no ledger. |

### 5.3 Authority

| Tier | Module | Note |
| --- | --- | --- |
| Scoring rules | **new** `domain/scoring.py` (in `packages/scheduler-core/scheduler_core/`) **or** `shared/sport/scoring.py` | `apps/api/src/shared/sport/` already exists and is exactly "cross-domain sport rules" per `.importlinter`; **recommendation: put it there**, since game completion is a rule about a sport, not about the solver. |
| Backend outcome | `apps/api/src/operations/match_state.py` + the result record | `retired` is a status; `walkover` / `cancelled` / `no_result` are result fields. The projection to a single public outcome word lives in `shared/match_vocabulary.py` (§2.3). |
| Console | **new** `platform/domain/score.ts` | `gameState(game, rules)`, `gameWinner(game, rules)`, `matchOutcome(match)`. No component computes a winner. |
| Entrant | **new** `lib/score.ts` (entrant) | The tier twin; `MatchCard`'s `side.winner` prop stops being a per-side boolean and becomes derived per game plus a match-level outcome. |

### 5.4 Implementation delta

| Site | Verdict | Package |
| --- | --- | --- |
| `apps/entrant/app/components/MatchCard.tsx:60-68` per-game cell emphasis keyed on `side.winner` (match winner) | redirects to authority — emphasis becomes per-game | 09, 11 |
| `apps/entrant/app/components/MatchCard.tsx` empty `<span>` per game column when `score?.[set] === undefined` | deleted — collapse the ledger | 09, 11 |
| `apps/console/src/modules/bracket/` and `meet/matches/` score cells | redirect to authority | 10 |
| `apps/console/src/modules/display/bracketDisplay/bracketDisplayData.ts` score shaping | redirects to authority | 17 |
| Mockup's `Completed · 0:42` duration | deleted — render "42 min" only when duration is known and useful (plan §3) | 09 |

---

## 6. Identity

### 6.1 Canonical model

Plan §5: *shared person identity formatter; structured sides; stable match references; no
reconstruction from slash-separated strings.* Plan §3 adds: *an incomplete doubles side and a future
winner are not ordinary PersonRef arrays — model unresolved sides explicitly; do not invent a person
to fill a slot.*

**A side is structured.** The model, in both tiers:

```
Side = {
  persons: PersonRef[]          // 0..n resolved or dead person references
  unresolved: UnresolvedSide | null
  seed: number | null
  participantKey: string | null
}

UnresolvedSide =
  | { kind: 'bye' }
  | { kind: 'pending_member', known: PersonRef[], missing: number }
  | { kind: 'winner_of', matchIdentity: MatchIdentity }
  | { kind: 'loser_of',  matchIdentity: MatchIdentity }
  | { kind: 'undetermined' }
```

`persons` and `unresolved` are **not** mutually exclusive: a doubles side with one confirmed player
and one outstanding partner is `persons: [A], unresolved: {kind:'pending_member', known:[A],
missing:1}`. That is the case the current code cannot express, which is why it invents a person or
prints `TBD`.

**Labels, per unresolved kind** *(public column rewritten by P0, 2026-09-07)*:

| Kind | Operator label | Public label |
| --- | --- | --- |
| `bye` | Bye | Bye |
| `pending_member` | the known names, then "partner to be confirmed" | the known names, then "partner to be confirmed" |
| `winner_of` | "Winner of {match reference}" | **empty participant slots + one muted feeder line naming the feeding match: "from {match reference}"** |
| `loser_of` | "Loser of {match reference}" | **empty participant slots + one muted feeder line: "from {match reference}"** |
| `undetermined` | "To be decided" | **empty participant slots, no label** |

**The public empty side, specified** *(P0)*. A future match has no players yet, and the public tier
says so by *showing no players* — the side's person slots render at their normal height, empty, and
the relationship to the earlier match is carried by (a) the connector/`feederNodeKey` data that is
already on the wire and (b) at most one muted line per node. Concretely:

- The phrase **"Winner of"** is deleted from the public tier. It reads as a player's name in a slot
  that is otherwise full of names, which is the defect: a reader scanning a bracket sees "Winner of
  SF 1" where every neighbouring row holds a person.
- A feeder line names the feeding match by its **match reference** (§6.1 below), never by a
  `nodeKey`, play-unit id, participant key, slot index or any other machine identifier.
- A side that is **partly** known keeps what is known: a doubles side with one confirmed player
  renders that player and one empty slot, never a second invented person and never a collapse to a
  single line that reads as singles.
- **Bye** and **withheld** stay distinct from an unknown feeder. A bye is a real, known outcome and
  says "Bye"; a person who exists but is not published renders "Player not published" (§6.2); an
  unresolved side renders neither.
- Empty is not a placeholder. There is no `—`, no `TBD`, no `?`, no grey silhouette and no
  zero-height row: the node keeps its geometry so a column of nodes does not jump as results land.

**Pair labels are never assembled or parsed from slash strings.** Seven builders, two separators and
four different unresolved fallbacks exist today (D14); `lib/names.ts:21-57` splits
on `' / '` or `' & '` and *always rejoins with `' / '`*, so a side that arrived as `A & B` leaves as
`A / B` (D15). That round-trip is deleted, not standardised — `lib/names.ts` and its test were
retired in the Wave 2 debt sweep, and the pre-joined-string shim now lives in `platform/domain/sides.ts`.

**One formatter per tier** renders a side:

| Tier | Formatter | Renders |
| --- | --- | --- |
| Console | **new** `platform/domain/side.ts` → `renderSide(side, {density})` | Returns *structured lines*, one person per line at normal density (plan §4: "one participant per line within a pair"); a single condensed line only for the board density, where it uses the board's own rule. Never returns a joined string for the general case. |
| Entrant | `apps/entrant/app/components/PersonGroup.tsx` (**becomes authority**) | Already renders `persons[]` as elements with a rendered `/` separator element rather than a string. `PersonRef.tsx` stays "the only React component permitted to render a person's public name". |

**The accessible inline phrase.** Plan §3 adapts "Remove `vs` everywhere": remove it where stacked
sides and scores make opposition obvious; **keep it in inline summaries**. So:

- **Visual:** stacked sides carry no "vs".
- **Accessible name / inline summary:** exactly one phrase, `"{sideA} versus {sideB}"`, produced by
  the same formatter (`sideSummaryPhrase(match)`). The entrant tier already uses the word `versus`
  in `MatchCard`'s aria-label and that spelling is adopted; but it must be built from the structured
  side, not from `persons.map(...).join(' / ')` as it is at `MatchCard.tsx:85`.
- Within a side the accessible phrase joins persons with **"and"**, not a slash: "Ana Silva and Ben
  Ito versus Chidi Okeke and Dan Reyes".
- The venue board's "Next" example needs **explicit sides**, because two stacked names could
  otherwise read as one doubles pair (plan §3). The board therefore renders a visible side separator
  even though the card does not.

**Match references are stable and derived once.** `apps/console/src/platform/domain/matchIdentity.ts`
is already the source-aware identity value object and explicitly "does not parse or rebuild an opaque
machine id". It becomes the authority for the console; the **round label** it produces becomes the
one speller, replacing four spellings (D16).

**One reference, both tiers** *(P0, 2026-09-07)*. A public bracket node and the operator's match
list **must name the same match with the same string**. A reader who is told `MS R32·11` at the desk
and `Match 11` on the public draw has been given two identities for one match, and neither can be
used to talk to the other.

- The grammar is the identity authority's: event code, stage, sequence — `MS R32·11`, `WD R16·1`,
  `MS QF2`, `MS F`. (`public-visual-fixes.md` writes this as `MS R32-11`; that is the same
  reference, and the separator the authority emits — U+00B7 — is the spelling that ships.)
- It is **derived from the identity coordinates**, never recomputed from rendered order, never
  renumbered per surface, and never tournament-wide. The bare public labels `Match 1`, `Match 2`
  are deleted, as is the public tier's separate `"SF 1"` speller.
- The public wire therefore has to carry the coordinates the console already receives. Until it
  does, a public surface has no reference to render and this rule is unimplementable — that is a
  wire gap, recorded in §6.4, not a licence to renumber locally.
- In a view whose event is already unambiguous (a single draw), the reference may drop the event
  code and read `R16-2 · 10:00 · Court 3`. In a mixed-event view (a whole-day schedule) it keeps
  the event code.

### 6.2 Missing data

| Absent | Renders |
| --- | --- |
| A person is not published | `PersonReferenceDTO(resolution='dead', label='Player not published')` — already the backend behaviour and it is correct; the label is fixed here. |
| A side has no persons and no known unresolved kind | "To be decided". **Not** `TBD`, **not** `–`, **not** `No players`, **not** empty string — those four fallbacks (D14) are deleted. |
| A doubles side is one player short | The known player's name, then "partner to be confirmed". **Never** invent a second person, and never render the single name as if the side were singles. |
| A predecessor match has not been played | **Operator:** "Winner of {reference}". **Public:** empty participant slots and one muted feeder line, "from {reference}" *(P0)*. Both use the same round/sequence speller as everything else. |
| A round label cannot be derived | The bare sequence ("Match 12"). Never an empty header. |

### 6.3 Authority

| Tier | Module | Note |
| --- | --- | --- |
| Backend person projection | `apps/api/src/entries/entries_site.py:_person_ref` (**becomes authority**) | Already the single mint for a public person reference; its `TBD` default label changes to the §6.2 wording and the `label` parameter carries the unresolved kind. |
| Backend side projection | **new** `apps/api/src/shared/sides.py` | Builds the structured `Side` including `unresolved`; replaces `_side_names` and `team_name` string minting for wire purposes. |
| Backend round labels | **new** `shared/round_labels.py` | One speller; absorbs `workspace_signals.py:270-321` and `entries_site.py:743-766`. |
| Console identity | `apps/console/src/platform/domain/matchIdentity.ts` (**becomes authority**) | Unchanged in role; gains the round-label speller other sites redirect to. |
| Console sides | **new** `platform/domain/side.ts` | See above. |
| Entrant | `PersonRef.tsx` / `PersonGroup.tsx` (**become authority**) + **new** `apps/entrant/app/lib/side.ts` for `sideSummaryPhrase` | |

### 6.4 Implementation delta

| D | Site | Verdict | Package |
| --- | --- | --- | --- |
| D14 | `apps/api/src/workspaces/workspace_signals.py:324-328 _side_names` | redirects to authority | 03 |
| D14 | `apps/api/src/bracket/io/export_schedule.py:219` | **kept as a documented view-local rule** — an export file format, not a UI string; it calls the authority for the names and applies its own file separator | 10 |
| D14 | `apps/api/src/entries/entries.py::team_name` | kept as authority for the *stored* participant name; must not be used for wire side rendering | 04 |
| D14 | `apps/console/src/modules/bracket/bracketLabels.ts:152-192` | redirects to authority | 10 |
| D14 | `apps/console/src/modules/operations/opsBlock.ts:36-38` | redirects to authority | 03 |
| D14 | `apps/console/src/modules/display/bracketDisplay/bracketDisplayData.ts:16-33` (`'–'` fallback) | redirects to authority | 17 |
| D14 | `apps/console/src/modules/meet/matches/MatchesSpreadsheet.tsx:220-231` (`'No players'`) | redirects to authority | 10 |
| D14 | `apps/console/src/modules/bracket/BracketRunControls.tsx:64-65` | redirects to authority | 10 |
| D14 | `apps/entrant/app/components/MatchCard.tsx:85` slash-joined aria label | deleted; call `sideSummaryPhrase` | 11 |
| D14 | `apps/console/src/modules/display/publicDisplay/helpers.ts:30-43 formatPlayers` (`' & '`, `'TBD'`) | redirects to authority (board density) | 17 |
| D14 | `apps/console/src/modules/operations/plan/MoveMatchDialog.tsx:205-208`, `plan/ScheduleDiffView.tsx:461` | redirect to authority | 03 |
| D14 | `apps/console/src/modules/meet/exports/xlsxExports.ts:147, 194-208` | kept as a documented view-local rule (export format, as above) | 10 |
| D15 | `lib/names.ts:21-57` split/rejoin | deleted — retired in the Wave 2 debt sweep, ahead of package 10; superseded by `platform/domain/sides.ts` | 10 |
| D15 | `apps/console/src/modules/display/publicDisplay/CourtsView.tsx:313` feeding `' & '` | deleted | 17 |
| D15 | `apps/console/src/modules/bracket/bracketMigration.ts:41-53` split-decode | kept as a documented view-local rule — it is a one-way **migration** reader of legacy stored strings, explicitly not a rendering path; gains a docstring saying so | 10 |
| D16 | `workspace_signals.py:270-321`, `entries_site.py:743-766`, `bracketDisplayData.ts:97` | redirect to authority | 03, 04, 17 |
| D16 | `apps/console/src/platform/domain/matchIdentity.ts` | becomes authority | 10 |
| D17 | `apps/console/src/platform/domain/match.ts:52-53` pre-joined side strings | **becomes structured** — the console adopts the entrant tier's `persons[]` shape; this is the largest single change in this contract | 10 |
| P0 | Public wire carries **no match reference**: `MatchNodeDTO` has `position`, `ScheduleMatchDTO` has `matchKey` + `roundLabel`, and `PublicUnresolvedSideDTO.reference` spells its own `"SF 1"` | **CLOSED (P3)** — `apps/api/src/shared/match_reference.py` is the backend twin of `matchIdentity.ts` and publishes `reference` / `shortReference` on `MatchNodeDTO`, `ScheduleMatchDTO` and `PlayerMatchDTO`; `_feeder_reference` now spells the shared reference off the same authority, so the local `"SF 1"` speller is gone. Parity is machine-checked by `tests/backend/unit/test_match_reference.py`, whose case table is transcribed from the console's own `matchIdentity.test.ts` | public P3 |
| P0 | `apps/entrant/app/components/MatchCard.tsx` `Match {position}` | **deleted (P3)** — replaced by the shared reference above; `matchNumber` is gone from `MatchCardData` entirely | public P3 |
| P0 | `apps/entrant/app/lib/side.ts` `Winner of ${reference}` | **deleted on the public tier (P3)** — `feederLabel` renders `from {reference}` into an empty participant slot (`data-feeder-slot`), for `winner_of` and `loser_of` alike (§6.1/§6.2) | public P3 |
| P3 | `bracketLabels.ts` and `shared/match_reference.py` both treat **only** `rr` as round-robin, so a `swiss` draw's reference reads with elimination stage names while its round LABEL reads "Round 3" | **kept, deliberately** — the two tiers agree, which is the invariant this row exists to protect; fixing the stage ladder is a both-tiers change logged in `docs/reference/debt-log.md` | future |

::: tip Ruled — C4 (confirmed 2026-09-06)
D17 requires the console's operator match model to carry structured sides, which touches the Meet
and Bracket DTOs and therefore `make generate-api` + `apps/console/src/api/dto.ts`. That is real
backend work inside a package (10) scoped as frontend. Recommendation: split it — a package 10a
"structured sides on the wire" that lands the DTO change ahead of the presentation work. Confirm
before package 10 is briefed.
:::

---

## 7. Time

### 7.1 Canonical contexts

Plan §3 adapts X6: **one locale/timezone-aware formatter with explicit named contexts**. No raw ISO
in ordinary prose; machine attributes, exports and diagnostics may retain ISO.

Everything renders in the **tournament timezone** (`ScheduleMatchesDTO.timeZone`), not the browser's,
except where the context below says otherwise.

| Context | Renders | Example | Where |
| --- | --- | --- | --- |
| `clock` | Time of day, no date, tournament tz | `14:30` | Match slots, court bands, board clock |
| `clock_with_zone` | Time of day + zone abbreviation | `14:30 SAST` | Anywhere a reader might be in another zone: public schedule headers, emails |
| `date` | Weekday, day, month, tournament tz | `Sat 8 August` | Day groupings |
| `date_with_year` | As `date` plus year | `Sat 8 August 2026` | Anything outside the current tournament's span; archives; directories |
| `datetime` | `date` + `clock` | `Sat 8 August, 14:30` | Activity log, receipts |
| `deadline` | `date_with_year` + `clock_with_zone` | `Sat 8 August 2026, 23:59 SAST` | **Every deadline**, per plan §4 |
| `relative` | Elapsed/remaining, with an absolute companion | `in 20 min (14:30)` | Live surfaces only. **Never relative-only** (plan §4 forbids "15d"). |
| `duration` | Whole minutes with a unit | `42 min` | Match duration, only when known and useful |
| `diagnostic` | Full ISO 8601 with offset | `2026-08-08T14:30:00+02:00` | Diagnostics panels, `datetime=` attributes, exports, `data-*` |

**Machine attributes are required, not optional.** Every rendered time is wrapped in `<time
datetime="…">` carrying the `diagnostic` ISO value, so the machine-readable value is always present
even though it is never the prose.

**Venue-local presentation on the public tier** *(P0, 2026-09-07)*. A spectator, a player and a
parent are all reading about one venue, and the venue has one clock. So on every public tournament
surface:

- The tournament hero states **"All times local to the venue"** — **once per tournament frame**, not
  once per card, once per day heading and once per section as it is today.
- Having said it once, public prose then prints **bare venue-local dates and times**: `14:30`,
  `Sat 1 August`, `closes 1 Aug`. It contains **no IANA identifier** (`Asia/Seoul`), **no offset**
  (`GMT+9`, `+09:00`) and **no zone abbreviation** (`KST`) — which supersedes `clock_with_zone` and
  the zone half of `deadline` **for public tournament pages**. Operator surfaces, emails and
  anything a reader may open outside the venue keep the zone, because there the reader has no venue
  clock to read.
- **Removing the suffix is not the fix.** The instant must be *converted* into the event's timezone
  before it is formatted; a UTC value with the "UTC" trimmed off is a wrong time presented
  confidently. The timezone identifier stays in the data, in `<time datetime>`, and in every
  computation — it simply never reaches the prose.
- **Dates alone where a date is enough** (an entry deadline day, a play date). Precise local times
  are retained where the time is the point: a scheduled match, a session start, a deadline instant.
  A real deadline is never rounded to make it read better.
- **Midnight and cross-zone cases are fixture-checked**, not reasoned about: converting must not
  move an intended date across a day boundary, and the rendering must not change when the reader's
  browser is in another timezone. The shared fixture carries venue-local entry windows written with
  the venue's real offset for exactly this.

**Browser locale date order alone does not prove a timezone bug** (plan §5). A reviewer seeing
`8/8/2026` where they expected `8 Aug 2026` has found a locale observation, not a defect; the named
contexts above are explicit enough that locale order is never load-bearing.

**Round-trip editing and midnight boundaries must be tested** (plan §5) — see §10.

### 7.2 Missing data

| Absent | Renders |
| --- | --- |
| Timestamp is `null` | The field is **omitted**. Never `00:00`, never `—` in a time slot, never the epoch. |
| Timestamp fails to parse | The field is **omitted** and the raw value goes to the diagnostic channel. **Never print the raw ISO in prose** — that is D12 and it happens in four places today. |
| Timezone unknown | Fall back to UTC **and label it**: `14:30 UTC`. A silent UTC assumption dressed as local time is the D11 failure. |
| Duration unknown | Omit it. Do not render `0:42`-style ambiguity or a zero. |
| "Last updated" never succeeded | "No successful update yet" — already the wording in `SyncHealthIndicator`, adopted here. |

### 7.3 Authority

| Tier | Module | Note |
| --- | --- | --- |
| Console | **new** `apps/console/src/lib/formatDateTime.ts` | The named contexts above, tournament-tz-aware. Absorbs `lib/timeFormatters.ts:12-16 formatIsoClock` and generalises `lib/timezoneLocal.ts:17-35` (today the only tz-aware pair, used in Setup only). |
| Entrant | `apps/entrant/app/lib/format.ts` (**becomes authority**) | Already has the tz-aware `formatMomentInZone`; the named contexts are added there and the UTC-only helpers become thin wrappers over it. |
| Backend | `apps/api/src/shared/schedule_slots.py` (§3.3) | Slot→wall-clock only. The backend does not format prose. |

### 7.4 Implementation delta

| D | Site | Verdict | Package |
| --- | --- | --- | --- |
| D11 | `apps/entrant/app/lib/schedule.types.ts:103-112 scheduleDateLabel` hardcoded UTC | redirects to authority | 11 |
| D11 | `apps/entrant/app/routes/schedule.tsx:221-230 monthLabel` | redirects to authority | 11 |
| D11 | `apps/entrant/app/lib/format.ts:36-40 formatDateLong` UTC-only | redirects to authority | 11 |
| D11 | `apps/entrant/app/lib/format.ts:58-72 formatMomentInZone` | becomes authority (entrant) | 11 |
| D11 | `apps/console/src/lib/timezoneLocal.ts:17-35` | becomes authority (generalised into `formatDateTime.ts`) | 07 |
| D12 | `format.ts:55, 60`; `schedule.tsx:206`; `schedule.types.ts:105` raw ISO in prose | deleted | 11 |
| P0 | Rendered `Asia/Seoul` / GMT offsets in public tournament copy (hero, schedule header, deadlines) | deleted — one "All times local to the venue" line in the frame, bare venue-local values thereafter | public P7 |
| P0 | `ScheduleMatchDTO.scheduledDate` published as the tournament's start date for **every** match | **fixed 2026-09-07** — `entries_site.py::_slot_date` + `shared/schedule_slots.py::slot_day_offset` derive the calendar day from the plan slot, so a six-day event no longer groups every match under day one | public P0 |
| D13 | `apps/console/src/lib/timeFormatters.ts:12-16` | redirects to authority | 07 |
| D13 | `useLiveOperations.ts:298`, `settings/PeopleAccessTab.tsx:25-29`, `SyncBackupsTab.tsx:25-46`, `SharingTab.tsx:27`, `hub/WorkspaceRow.tsx:84`, `workspace/overview/railRows.ts:37`, `plan/SolverProgressLog.tsx:156`, `components/SyncHealthIndicator.tsx:22` inline `toLocale*` | redirect to authority | 07, 12, 18, 19, 20 |
| D13 | `display/publicDisplay/helpers.ts:19-20` (forces UTC), `MeetDisplayPage.tsx:122, 530-535`, `BracketDisplayPage.tsx:59, 135-138` | redirect to authority — the board renders the **tournament** timezone, which is the venue's | 17 |
| — | `apps/api/src/entries/entries_site.py:420 _hhmm_plus`, `workspace_signals.py:238 _slot_time_label` | redirect to `shared/schedule_slots.py` | 04 |
| — | `scheduledTime` as a naive venue-local `"HH:MM"` printed verbatim | **kept as a documented view-local rule** — the wire field is deliberately a wall-clock string in the tournament timezone, which is the right representation for a venue schedule; the contract is that it is **always** paired with `timeZone` and is never parsed as an instant | 04 |

---

## 8. Connectivity

### 8.1 Canonical states

Plan §5: *separate saved on this device, syncing, synced and needs attention. Never imply cloud
durability from local acknowledgement.* The four states are about **the durability of a write**, and
are distinct from `SyncHealthState` in `apps/console/src/components/SyncHealthIndicator.tsx`, which
is about the **freshness of a read**. Both are kept; they are named differently so they stop being
confused.

**Write durability** — `WriteDurability`:

| State | Meaning | Operator label |
| --- | --- | --- |
| `local` | The change is committed on this device and will be sent when possible. | **Saved on this device** |
| `sending` | The change is in flight or queued behind one that is. | **Syncing** |
| `remote` | The server has acknowledged the change. | **Synced** |
| `attention` | The change was rejected, conflicted, or has exceeded its retry budget. | **Needs attention** |

These map onto the existing queue statuses (`apps/console/src/lib/commandQueue.ts:36`,
`'pending' | 'applied' | 'rejected' | 'conflict'`): `pending` → `local` or `sending` depending on
whether a send is in flight; `applied` → `remote`; `rejected` and `conflict` → `attention`. The
queue's field names are storage; the four words above are the contract.

**Read freshness** — `SyncHealthState`, kept as-is (`connected` / `refreshing` / `stale` /
`offline`), with its labels unchanged.

**The durability rule.** *Saved on this device* must never be worded, coloured, or iconified so that
it reads as *Synced*. In local mode (`AUTH_MODE=local`, SQLite on the director's laptop) `remote` is
not reachable at all and the surface must **say so once**, not print a permanently pending *Syncing*.

::: tip Ruled — C5 (confirmed 2026-09-06)
In pure local mode there is no remote. Recommendation: the durability chip reads **"Saved on this
device"** and the surface explains recovery is via backups (`tournament_backups`), with no *Syncing*
or *Synced* state offered. The alternative — treating the local commit as `remote` — is exactly the
false cloud-durability claim plan §1 package 19 exists to remove. Confirm before package 19.
:::

### 8.2 Missing data

| Absent | Renders |
| --- | --- |
| No sync has ever succeeded | "No successful update yet" (freshness) / "Saved on this device" (durability). Never "Synced". |
| Backend unreachable | Freshness `offline`; durability stays at whatever it actually is. The two are shown separately. |
| A backup's timestamp is missing | The recovery point is listed with its sequence and origin and **no time**; it is never listed with an invented time, because plan §1 package 19 requires recovery points be *distinguishable*. |

### 8.3 Authority

| Tier | Module | Note |
| --- | --- | --- |
| Console durability | **new** `platform/domain/durability.ts` | The four states, the mapping from queue status, and the labels. |
| Console freshness | `apps/console/src/components/SyncHealthIndicator.tsx` `deriveSyncHealth` (**becomes authority**) | Unchanged; documented as *read freshness*, not durability. |
| Queue storage | `apps/console/src/lib/commandQueue.ts` + `lib/bracketCommandQueue.ts` | Storage only; no labels. |

### 8.4 Implementation delta

| Site | Verdict | Package |
| --- | --- | --- |
| `apps/console/src/components/SyncHealthIndicator.tsx` | becomes authority (freshness) | 19 |
| `apps/console/src/modules/settings/SyncBackupsTab.tsx` sync wording | redirects to authority | 19 |
| `apps/console/src/hooks/useTournamentBackups.ts` recovery-point labelling | redirects to authority | 19 |
| Any surface wording a local save as a cloud save | deleted | 05, 19 |

---

## 9. Public visibility

### 9.1 Canonical rules

Plan §5: *public serialization respects audience/content toggles and allowed person fields. Board
projection follows its defined visibility rules.*

| Toggle | Governs | When off |
| --- | --- | --- |
| Audience (published / unpublished) | Whether the workspace has a public tier at all | `published: false`; no projection is served |
| Entrants content | Whether person identities are published | `_person_ref` yields `resolution='dead'`, `label='Player not published'` |
| Results content | Whether scores and outcomes are published | No ledger, no outcome word beyond *Completed*; accessible summary says "Score not published" |
| Per-event visibility | Whether a given event's people are published | `visible_events` gate in `_person_ref` |

**Allowed person fields** are the `PublicPersonIdentityDTO` allowlist and nothing else (ADR 0018).
Contact fields never cross the boundary in any state.

**Two rules the projection breaks today and must stop breaking:**

1. **`called` must not be published as `live`.** `apps/api/src/entries/entries_site.py:2408`
   currently maps both `playing` and `called` to `live` when results are off, so a match that has
   merely been called reads publicly as being on court (D8). With results off the public state is
   the **schedule** state (§3) plus at most `called`; it is never upgraded.
2. **Results-off must not synthesise a play state.** Turning results off hides *scores*; it is not a
   licence to reshape *states*.

**Board projection** *(rewritten by P0, 2026-09-07)* follows the same rules plus its own density
(§6.1), and is governed by one further rule: **the venue board carries no diagnostics.**

- The **court number is the largest element** on a board card; names next; live scores readable;
  the clock secondary.
- An empty, unavailable or **disputed** court renders **the court number alone**. The strings
  "Court assignment unavailable.", "No next match assigned" and every equivalent placeholder or
  error prose are deleted from public signage. (This supersedes the plan §3 conflict-copy ruling.)
- No public error colours, alert messages, LIVE pill or "Updated …" timestamp. Connection and
  freshness diagnostics stay in operator controls (§8); an unusable or expired snapshot
  **suppresses** the untrustworthy match content rather than adding a public banner.
- A **"Next" preview is a persisted board setting defaulting to off**, on Meet, Bracket and hybrid
  boards alike. When on, only resolved names render; an unresolved side reads **TBD** or is
  omitted — never `Winner of …`, a feeder reference, or a UUID.
- The board shows the tournament name and a small clock in the **tournament's own timezone**,
  passed through the board data contract, **with no zone abbreviation** on venue signage. If the
  timezone is unavailable the clock is **omitted** and the setup problem is surfaced to the
  operator.

### 9.2 Missing data

| Absent | Renders |
| --- | --- |
| Person not published | "Player not published" — a dead reference, deliberately unlinked. Never a blank, never an initial, never an invented name. |
| Results not published | No ledger; "Score not published" in the accessible summary. |
| Nothing published for a workspace | The public route answers its normal not-published response. No partial leak, no placeholder tournament. |

### 9.3 Authority

| Tier | Module | Note |
| --- | --- | --- |
| Backend projection | `apps/api/src/entries/entries_site.py` (**becomes authority**) | Already the single public serializer; `entries_json.py` and `entries_me.py` twins redirect to its helpers. |
| Person allowlist | `_person_ref` + `PublicPersonDirectory` (**become authority**) | Per ADR 0018. |
| State projection | `apps/api/src/shared/match_vocabulary.py` (§2.3) | The status → public-state map moves here so Display and Entries share one map. |
| Board | `apps/console/src/modules/display/` | Consumes; owns no visibility rule. |

### 9.4 Implementation delta

| D | Site | Verdict | Package |
| --- | --- | --- | --- |
| D8 | `entries_site.py:2408` `called` → `live` when results off | deleted | 04, 15 |
| D7 | `entries_site.py:2409`, `:2316-2323` unknown → `scheduled` | deleted (see §2.4) | 04 |
| D17 | `entries_site.py` structured `persons[]` | becomes authority — the console adopts this shape, not the reverse | 04, 10 |
| — | `entries_json.py:296, 374, 574-600`; `entries_me.py:171-200` twins | redirect to authority | 04 |
| — | `apps/console/src/modules/display/publicDisplay/CourtsView.tsx:302-309` "Two current matches claim this court." | *(P0, 2026-09-07)* operator wording stays *Needs resolution*; the public/board string is **deleted** — a disputed court renders the court number alone | 17, P4 |

---

## 11. The public tournament frame

*(New, P0, 2026-09-07 — `public-visual-fixes.md`. This section is the public counterpart of §1's
module vocabulary: it fixes what a tournament-scoped public page is made of, not how it looks.)*

### 11.1 Canonical model

Every tournament-scoped public route renders inside **one frame**, composed once:

```
breadcrumbs          Tournaments › Korea Masters › Draws › Men's Singles
tournament hero      name · dates · venue · status · "All times local to the venue" · live CTA
tab bar              Overview · Schedule · Draws · Players · Documents
page content         the route's own content, and nothing that repeats the three rows above
```

The routes in scope: Overview, Schedule, Draws index, a draw detail, Players, a tournament-scoped
player page, and Regulations.

**Rules.**

- **The hero is built once, from one source.** Every route in scope is fed the same hero data. A
  route may not implement its own hero, restate the timezone, restate the entries status, or add its
  own freshness line.
- **Breadcrumbs are rendered by the frame, above the hero, once.** Ancestor segments are native
  links; the current segment is marked as the current page and is not a link. Labels come from real
  tournament and event data, never from a route pattern or a slug.
- **No floating back links.** `← Tournament`, `← Tournament · Draws` and every per-page text-arrow
  back control are deleted; the breadcrumb is the route back.
- **One navigation system.** A nested page highlights its parent tab. A page may not introduce a
  second, competing tab bar or side navigation of its own; Regulations is reached through
  Documents and the breadcrumb.
- **Depth does not cost identity.** At any depth a reader can still see which tournament they are
  in, the live call-to-action when there is one, and a route back — including on a draw detail and
  on a tournament-scoped player page.
- **The frame stays reachable on a narrow screen.** The hero is compact enough that the page's
  primary content is not pushed below the fold at 320 px.

### 11.2 Missing data

| Absent | Renders |
| --- | --- |
| A breadcrumb label cannot be derived from real data | the segment is **omitted**, not filled with a slug, an id or a route name |
| No live match | the live CTA is omitted; nothing takes its place |
| No documents published | the Documents tab is omitted rather than shown leading to an empty page |
| Tournament dates unknown | the hero omits the date line; it never fabricates a date to fill the slot |

### 11.3 Authority

| Tier | Module | Note |
| --- | --- | --- |
| Entrant | `apps/entrant/app/components/PlayShell.tsx` + `HeroHeader.tsx` + `TabBar.tsx` (**become the frame**) | The frame owns hero, tabs and breadcrumbs; routes render content only. |
| Entrant | `apps/entrant/app/routes/*` tournament routes | **redirect to authority** — each drops its own hero/back-link/second-nav. |
| Backend | `apps/api/src/entries/entries_site.py` page projection | The one source of the hero's tournament identity, dates, venue, timezone and publication state. |

### 11.4 Implementation delta

| D | Site | Verdict | Package |
| --- | --- | --- | --- |
| P0 | `schedule.tsx`'s own hero, repeated timezone, entries-status and freshness lines | deleted; fed by the frame | public P1 |
| P0 | `regulations.tsx`'s separate left navigation and facts/header frame | deleted | public P1, P6 |
| P0 | per-page `← Tournament` / `← Tournament · Draws` links | deleted | public P1 |

---

## Verification of the code map

The following were re-read in the tree at `f5ccfcef` before this page was written, and the code map's
claim confirmed: D1 (`match_state.py:164-194` `assert_court_available`, `playing` only), D2/D3
(`runModel.ts:265-296` counts matches as `playing` while excluding conflicted lanes from
`courtsFree`; `workspace_signals.py:345-375` computes `courtsFree` from `busy_courts` with no
conflict notion), D5 (`stateWords.ts` and `matchStatus.tsx` both claiming a canonical role), D6
(`MatchCard.tsx:90` three-way vs `schedule.types.ts:72-91` eight-way), D7/D8
(`entries_site.py:2401-2409`), D9 (`MatchCard.tsx:74-78`), D11/D12
(`schedule.types.ts:103-112`, UTC hardcoded), D15 (`names.ts` split-and-rejoin), D20
(`workspace_signals.py:563-570` `_IN_PLAY` excludes `called`, with a comment explaining why, against
`match_state.py`'s `LOCKED_STATUSES` which includes it).

Two refinements to the map were found: `workspace_signals.py`'s `_IN_PLAY` is
`{"started", "playing"}` — it carries the legacy `started` spelling too, so D4's alias problem
reaches the counting path as well; and the scoring configuration
(`apps/api/src/workspaces/setup.py:139, 640`) carries `scoringFormat`, `setsToWin`, `pointsPerSet`
and `deuceEnabled` but **no point-cap field**, which is why C3 exists.

---

## 10. Test plan

Plan §6's verification matrix, mapped to concrete files. Each row names the file a package must add
or extend and the assertion in one line. These are behaviour checks, not assertions about the
implementation's chosen CSS spelling.

Plan §6's **corrections to negative controls** are binding on every row below: do not require a
contrast test to fail on `#5C6370` over white (it passes); do not grep hex values to detect
opacity/compositing failures; do not assert fixed `offsetHeight` (it forbids text zoom); assert
equivalent **semantic outcomes** across variants rather than identical DOM or an absence of
event-type branches; and test **game completion**, not which score is larger.

| §6 row | File (new unless noted) | Assertion | Pkg |
| --- | --- | --- | --- |
| Operational truth | `tests/backend/unit/test_court_occupancy.py` | Two `playing` matches on one court yield exactly one `disputed` court, zero `occupied`, zero `free` for that court, and one `CourtDispute` with two claims | 03 |
| Operational truth | `tests/backend/unit/test_workspace_signals.py` (extend) | With a disputed court, `courtsFree` excludes it and `playing` counts courts, not matches; `disputedCourts` is 1 | 03 |
| Operational truth | `apps/console/src/platform/domain/__tests__/courtOccupancy.test.ts` | Console derivation returns byte-identical bucket counts to the backend fixture's expected values for the same match list | 03 |
| Operational truth | `apps/console/src/modules/operations/__tests__/runSummaryBand.test.tsx` (extend) | The band never renders a disputed court as free **or** as two playing matches | 03 |
| Operational truth | `tests/backend/unit/test_court_dispute_resolution.py` | Resolving a dispute through the command path is idempotent under a repeated idempotency key, and the dispute stops being derived afterwards | 03 |
| Operational truth | `apps/console/src/lib/__tests__/commandQueue.offlineConflict.test.ts` | A dispute resolution queued offline replays once on reconnect and surfaces `attention` on a 409 | 03, 19 |
| Operational truth | `tests/backend/test_display_public.py` (extend) | Board and public schedule report the same court states as the operator signals for one fixture | 04 |
| Scheduling | `tests/backend/test_public_schedule_api.py` (extend) | A match with no approved slot is published with public state `time_tbc`; the string "Scheduled" appears nowhere in its projection | 04 |
| Scheduling | `tests/backend/test_public_schedule_api.py` (extend) | An approved slot with an unresolved second side is published as `scheduled` with its time | 04 |
| Scheduling | `apps/entrant/tests/scheduleState.test.ts` | `MatchCard` renders no time, date or court line when the corresponding field is null — no `Time not assigned`, `Date to be confirmed`, `Court information unavailable`, `Court pending` anywhere in the tree | 04, 11 |
| Scheduling | `tests/backend/unit/test_slot_formatting.py` | `shared/schedule_slots.py` reproduces the exact outputs of the three replaced helpers over a slot/interval matrix including a midnight crossing | 04 |
| Scheduling | `__tests__/planScheduleState.test.tsx` (operations) | Plan, public Schedule, Round and board show the same schedule state for each of: approved slot, missing time, missing court, unresolved predecessor | 03, 04 |
| Match layout | `matchCard.layout.test.tsx` (entrant) | Singles, doubles, unequal and long names, and an incomplete pair each render one person per line with no clipped or overlapping text and a reachable full name | 09, 11 |
| Match layout | `__tests__/matchRowLayout.test.tsx` (operations) | Game columns align across rows for 1/3/5-game configurations; each score cell is associated with a named side | 10 |
| Match layout | `matchCard.emptyLedger.test.tsx` (entrant) | With no games recorded the ledger contributes no cells, no reserved width and no winner mark to the DOM | 09, 11 |
| Match outcome | `platform/domain/__tests__/score.test.ts` | A game leading 15–12 under `pointsPerSet: 21` has no winner; 21–19 does; 20–19 with `deuceEnabled` does not | 09, 10 |
| Match outcome | `platform/domain/__tests__/score.test.ts` | *(P0, 2026-09-07; replaces "the losing side retains per-game emphasis")* **no game score carries emphasis** on any fixture, and the paired sequence's first number is the first-listed side | 09, 10, P3 |
| Match outcome | `matchCard.outcome.test.tsx` (entrant) | A retirement shows the partial ledger, the word *Retired*, and the winner mark on the side the **outcome** names, not the side with more points | 09, 11 |
| Match outcome | `matchCard.outcome.test.tsx` (entrant) | No winner mark exists in the DOM while the match outcome is `in_play`; when present the mark has an accessible text equivalent | 09, 11 |
| Public permissions | `tests/backend/test_entries_site_api.py` (extend) | With results off, a `called` match is published as `called` — never `live` — and an unknown status is omitted rather than coerced to `scheduled` | 04, 15 |
| Public permissions | `tests/backend/test_entries_site_api.py` (extend) | Entrants-off yields `resolution='dead'` with `label='Player not published'` and no field outside the `PublicPersonIdentityDTO` allowlist, signed-out and authorized alike | 15 |
| Public permissions | `apps/entrant/tests/publicUniversality.test.ts` (extend) | Every rendered person name in the tier originates from `PersonRef`; no component joins names into a string | 11, 15 |
| Recovery | `hooks/__tests__/useTournamentBackups.test.ts` | Two recovery points are distinguishable by origin and sequence when one has no timestamp; neither is given an invented time | 19 |
| Recovery | `platform/domain/__tests__/durability.test.ts` | Queue statuses map to exactly the four durability words; a local commit never yields *Synced* | 19 |
| Account journeys | `tests/e2e/` (existing entrant journey specs, extend) | Sign-up, valid/expired confirmation, resend, valid reset, weak password and accepted/unavailable invitation each reach their actual destination with context preserved | 23, 24 |
| Copy | `apps/console/src/lib/__tests__/stateWords.test.ts` | The canonical word set contains no match state spelled *Live*; `playing` is *On court* | 09 |
| Copy | `tests/backend/unit/test_match_vocabulary.py` | The legacy alias map is total and bidirectional over the canonical set, `retired` included | 03 |
| Copy | `apps/entrant/tests/schedule.test.ts` (extend) | Every rendered state string comes from `scheduleStateLabel`; no literal state word exists in a component | 11 |
| Accessibility | `matchCard.a11y.test.tsx` (entrant) | The match's accessible name is `"{sideA} versus {sideB}"` built from the structured side, joins partners with "and", and never contains a slash | 11, 26 |
| Accessibility | `apps/console/src/modules/operations/__tests__/conflictAssignment.a11y.test.tsx` | A dispute is a focusable, keyboard-operable assignment with named actions — not a banner | 03, 26 |
| Responsive / signage | `matchCard.responsive.test.tsx` (entrant) | At 320 px a doubles card keeps both sides distinguishable and no name is truncated without a reachable full value; no fixed-height assertion is used | 11, 26 |
| Responsive / signage | `__tests__/boardDensity.test.tsx` (display) | *(P0, 2026-09-07)* The board renders an explicit side separator so two stacked names cannot read as one pair; the **court number is its largest element**; an empty/unavailable/disputed court renders the court number alone, with no conflict copy, no LIVE pill and no "Updated …" value | 17, P4 |
| Responsive / signage | `__tests__/boardDensity.test.tsx` (display) | *(P0)* The "Next" preview is absent by default and renders only resolved names (or `TBD`) when the persisted setting is on | 17, P4 |

---

## Rulings on the open questions

All five were **confirmed by the orchestrator on 2026-09-06** as written; the recommendations below are now rulings.

| # | Question | Ruling | Applies to |
| --- | --- | --- | --- |
| C1 | Is a court dispute derived or persisted? | Derive the dispute; persist the resolution on the existing command path (§4.2) | 03 |
| C2 | Does a disputed court hide the matches, or only the court field? | ~~Only the court field; both matches stay publicly visible.~~ **Superseded 2026-09-07 (P0):** on the **venue board** a disputed court renders the court number alone — the board never picks arbitrarily between competing claims. Elsewhere on the public tier the §4.2 rule stands, and the dispute plus its recovery stay operator-owned (§9.1). | 04, P4 |
| C3 | Is there a configured point cap? | Add a nullable `pointCap` in package 13; until then print "Win by 2" with no cap claim (§5.1) | 09, 13 |
| C4 | Does structured sides on the operator wire get its own slice? | Yes — split package 10 into 10a (DTO) and 10b (presentation) (§6.4) | 10 |
| C5 | What does the durability chip say in pure local mode? | "Saved on this device", with backups named as the recovery route; no *Syncing* / *Synced* offered (§8.1) | 19 |

## See also

- [ADR 0029 — one state and formatting authority per domain](/explanation/decisions/0029-state-and-formatting-contract)
- [What a module contract is](/reference/contracts/) · [Operations → Display (Seam D)](/reference/contracts/operations-display)
- [ADR 0006 — Unified scheduling core](/explanation/decisions/0006-unified-scheduling-core) · [ADR 0009 — Universal match contract](/explanation/decisions/0009-universal-match-contract) · [ADR 0018 — Public person universality](/explanation/decisions/0018-public-person-universality)
- [ADR 0011 — Cross-product boundary policy](/explanation/decisions/0011-cross-product-boundary-policy) · [ADR 0013 — Shared-UI promotion policy](/explanation/decisions/0013-shared-ui-promotion-policy) · [ADR 0014 — Workspace vs tournament vocabulary](/explanation/decisions/0014-workspace-vs-tournament-vocabulary)
- [ADR 0027 — Curated data components](/explanation/decisions/0027-curated-data-components) · [ADR 0028 — Entrant site port](/explanation/decisions/0028-entrant-site-port)
- [Debt log](/reference/debt-log) · [Glossary](/reference/glossary)
