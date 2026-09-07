# SP-PUB-AUDIT-1 phase 0: entrant site design-to-codebase gap audit

**Date:** 2026-09-05 · **Status:** Phase 0 complete, G1 ruled 2026-09-05, Phases 2-3 implemented · **Scope:** public
entrant tier only (`apps/entrant`, its backend public routes, and `packages/design-system`
tokens). Read-only apart from this one file.

Binding design artifact: the Claude Design mock `ShuttleWorks Entrant Site.dc.html`, 13 screens,
in Claude Design project `57917b85-0e8e-4d79-97bc-45a326e4cad2`. The `_ds/` foundation bundle
saved alongside it is reference material, not a rendered dependency (see D-INVENTORY).

**Historical-handoff note.** The originating brief for this audit named two handoff files,
`codex_recap` and `claude_implemnetation_handoff`, as inputs. Neither is present in the Claude
Design project's file list. Only `github.md` (a screen map) and the `_ds/` bundle are. Nothing
from those two named files is cited or refuted below; there is simply nothing to draw from them.

## 1. Premise checks

These change the shape of the register below and are stated here rather than silently absorbed.

1. **The mock was already ported.** ADR 0028 (Accepted 2026-09-04, branch
   `feat/curated-design-system`, now on local `main`) restyled every entrant route to this exact
   file, including the four-tab merge, fonts, and key-date rows. The register is therefore
   dominated by the `Exists` class, and visual drift is near zero. The audit's value is the
   handful of `Partial` / `Backend-serializer` / `Cut` rows and the decoration-budget findings.
2. **The mock contains no Blocked features.** No notifications, bell, follow, subscribe, ratings,
   rankings, "coming soon", or cross-tournament profile appears anywhere in it. The player screen
   is `/e/{slug}/players/{id}`, single-tournament, and already ships. So R-DM-2 gates zero rows in
   this register; this document instead records which profile fields would pass the privacy seam
   if a cross-tournament person spine ever lands (name, club, event, published results) and which
   would not (email, phone, birth year, fee, account id), per
   `tests/backend/unit/test_public_person_contract.py::test_the_identity_and_contact_privacy_seams_stay_separate`.
3. **No "I1 CI grep guard" exists.** Nothing in `.github/workflows/ci.yml`, `tools/`, the root
   `Makefile`, or the entrant test suite greps for sport-domain strings. The closest guards today
   are `apps/api/.importlinter` (engine purity) and `packages/shared-contract/non-scheduling-keys.json`.
   This document records the absence as a finding; whether to create such a guard is ruling G1-f
   below, not this document's scope.
4. **"Reduction over addition" and "Display projects and never originates" are not written down
   anywhere in `docs/`.** The nearest standing statement of the privacy seam is
   `docs/audits/2026-08-SP-P9-findings.md:40`. Both principles are applied as stated by the
   originating brief throughout this register; their absence from the docs tree is noted here as
   a finding, not fixed by this document.
5. `packages/design-system/tokens.css` is confirmed as the single token source for both tiers,
   fonts are self-hosted via `@fontsource-variable` (see C-INVENTORY §4), and `docs/audits/`
   already holds dated `sp-<program>-phase0.md` records this document follows the shape of. The
   filename `SP-PUB-AUDIT-1-phase0.md` is used verbatim as instructed.
6. The two handoff files named by the originating brief (`codex_recap`,
   `claude_implemnetation_handoff`) are not in the Claude Design project's file list; see the
   historical-handoff note above.

## 2. D-INVENTORY (from the saved mock)

Source: the dc.html mock, extracted from the saved tool-result envelope for this session
(`json.load(...)['content']`), 1141 lines. Component names below are the mock's own semantic
groupings (aria-labels, headings, ids), not code identifiers; code identifiers are cross-referenced
in the C-INVENTORY where they exist.

### 2.1 Discovery `/e/`
- **Now playing strip** (conditional on `showNow`): eyebrow "Live today", tournament name
  ("Midsummer Shield"), date/venue line, link "Draws & results →". A hairline bottom edge carries
  an animated sweep gradient (`sw-sweep`).
- **Header**: h1 "Tournaments", intro copy "Badminton tournaments taking entries through
  ShuttleWorks. Every entry is confirmed by the organizer." (the "Badminton" noun is hardcoded,
  flagged below).
- **Calendar view segmented nav**: "Season" (current), "Taking entries · 3", "Completed · 1" ,
  counts baked into the segment labels.
- **Search**: a `role="search"` box, placeholder "Search tournaments", label "Search tournaments,
  organizers or venues", and a "Filters" popover-trigger button (icon + label, no visible popover
  body in the mock).
- **Season calendar**: month-group headings ("September 2026", "October 2026", "Date to be
  confirmed", "Completed"); each row is a 56x56 date badge (month abbreviation + day-of-month, or
  "TBC"), tournament name link, venue/city line, event count ("3 events"), and a right-aligned
  status cell. Status cell text varies by row: "Entries open · closes in 9d" (live-tinted text,
  no chip), "Entries open" (no countdown), "Entries closed" (muted), "Dates to be confirmed"
  (muted), or a "Results →" link (decided/completed row). No dot, pill, or badge shape appears on
  this screen; every status is plain colored text.
- **Nav edges**: tournament name → `goTournament`; "Draws & results →" and "Results →" →
  `goBracket`/`goDraws`; header brand mark → `goDiscovery`; header right slot → `goMyEntries` or
  the mock's "Sign in" link (`PlayShell` renders exactly one, per the code's C-INVENTORY entry).

### 2.2 Tournament hero (shared by tabs)
- Org eyebrow (not populated with distinct text in the mock beyond the section wrapper), h1
  tournament title ("Spring Open"), a `Tournament sections` nav with the four tabs, and an "Enter
  this tournament" call-to-action button carrying an inline glow shadow
  `box-shadow: 0 0 22px rgba(36,99,235,0.22)` on hover-brighten. Nav edge: CTA → `goEnter`.

### 2.3 Overview `/e/{slug}`
- Intro paragraph ("Three events across one day at Kingsway Centre, run to BWF laws. Draws are
  published once seeding is complete.") beside a facts `<dl>`: **Events** (3), **Players entered**
  (12), **Tournament time** ("Europe/London").
- **Key dates** card: Entries open, Entries close ("Varies by event · see Events", a link to the
  Draws/Events tab), Withdrawal deadline, Tournament (date). All plain label/value rows, no chips.
- **Venue** card: Hall, Address.
- **Fees & payment** card: Pricing row with "Go to entry form" link.
- **Documents** card: "Tournament regulations", "Version 3 · updated 12 August 2026", "View" link
  (the mock's link is a no-op `onClick`; the shipped code links to `/e/{slug}/regulations`, which
  is a real document reader, so code is ahead of the mock here, see gap register).
- Footer line: "Information updated Wednesday 12 August 2026".

### 2.4 Draws tab `?tab=draws`
- Header row: "Event", "Entered", "Entries" (visually hidden fourth column header for the action
  buttons).
- Per-event row: name + code in parens ("Men's Singles (MS)"), a sub-line
  ("Single elimination · Men · 16 entries · 4 rounds"), an "Entered" count ("7 entered"), a status
  word ("Open" in live-tinted text, "Closed" in muted/done-tinted text, plain text, no chip), and
  two buttons: "Entrants" → `goPlayers`, "Draw" → `goBracket`.

### 2.5 Players tab `?tab=players`
- Header: "12 players" count + "Filter players" search input.
- Three-column A-Z grouped list; each letter group is a heading, then rows: player name link →
  `goPlayer`, event codes joined by " · " ("MS · WD"), and an optional club line beneath.

### 2.6 Bracket `/e/{slug}/draws/{key}`
- Back link "← Spring Open · Draws" → `goEvents`; h1 event name ("Men's Singles"); sub-line
  "MS · Single elimination · 8 entries".
- **Draw view nav**: "Bracket" (current), "Round", "List", all three are real, separately
  addressable views.
- **Find** form: text input "Find a player or pair" + "Find" button, a plain GET-shaped control,
  no client JS assumed.
- **Bracket columns**: round headings ("Quarter-finals", "Semi-finals", "Final"), each column a
  stack of two-row match cards (name + up to two set scores per side), connector lines drawn with
  plain border-box divs between columns (no SVG). Winner emphasis is bold text weight on the
  winning row plus a bold score cell; no color-only signal. Seeds render as `[n]` suffixed onto
  the name string (e.g. "Alan Turing [1]").
- **Footnote** below the bracket: a small pulsing round dot
  (`background: var(--status-live); animation: sw-breathe`) beside the text "The final is on court
  now. Scores update as the desk records them." This is the one fully-round pulsing state marker
  in the whole mock.

### 2.7 Schedule `/e/{slug}/schedule`
- h1 "Schedule / Live", sub-copy "Find matches by day, time, or court in tournament time
  (Europe/London)."
- **Day segments** with counts baked into the tab labels ("Sat 12 Sep 42", "Sun 13 Sep 19").
- **Organization toggle**: "By time" (current) / "By court".
- **Filter form**: Player search input, Event select (All events / Men's Singles / Women's
  Doubles / Mixed Doubles), Court select (All courts / Court 1 / Court 2 / Court 3), State select
  (All states / Live / Scheduled / Finished), "Clear" link.
- **Live now** section: eyebrow in live-tint color, sub-copy "Scores update as the desk records
  them", a two-column grid of match cards with a filled/tinted header row carrying a context label
  and a state label (e.g. "Now").
- **Time-grouped match list**: repeating time headings (a mustache time placeholder, tabular numerals), each
  with its own two-column card grid. Total count line "42 matches". Match cards: header (context +
  state), two side rows (name + per-game score cells), footer (time/court or freshness text).

### 2.8 Entry flow `/e/{slug}/enter`
- Header: back link "← Spring Open", h1 "Enter this tournament", a **fully-round status pill** with
  a small round dot: "Entries open · closes in 9d" (`border-radius: 999px`, tinted background
  `var(--status-live-bg)`, border `rgba(21,128,61,0.4)`). This is the pill shape ADR 0027 already
  cut in code (ships as a rectangular `StatusChip`, no dot).
  Sub-copy: "Up to 2 events per person. Bundle pricing per player: 2 events · 25.00."
- **7-step progress nav** ("Entry progress"): numbered steps, active/done state carried by a
  step-number square style.
- **"Before you begin" card**: eyebrow "Before you begin", h2 "Check eligibility and cost", and a
  **neutral pill** "2 open events" (`border-radius: 999px`, plain `--border-control` border, muted
  text, no live-state color). Facts `<dl>`: Tournament date, Entry deadline, Fees.
- **Account banner** (`role="status"`): info-tinted box with an "i" glyph, text "Submitting needs
  an entrant account. Sign in or create one, and you'll come straight back here. Until you are
  signed in, nothing is recorded."
- **Participant card** ("Player 1"): Full name, Gender select, Club (optional); an Events
  checkbox fieldset (Men's Singles (MS) 15.00, Women's Doubles (WD) 20.00) with a conditional
  "Partner's email for WD" field and helper copy; a free-text remarks textarea. "Add another
  player" button. An "eligibility override" checkbox below the card.
- **"Before you submit" card**: consent checkbox referencing regulations and public entrant-list
  publication.
- **Sticky total/submit panel**: "Quoted total · 2 events", "25.00" (unitless), a re-statement of
  the open/closes/deadline line, "Update total" button, "Submit entry" primary button carrying the
  same `box-shadow: 0 0 22px rgba(36,99,235,0.22)` glow on hover, and a footnote that the total is
  the organizer's quote, confirmed on the receipt.

### 2.9 Receipt `/e/{slug}/receipt/{submissionId}`
- h1 "Entry received" (motion-enter class), sub-copy.
- **Your entry** card: Tournament (name), Reference (a UUID rendered in a `<code>` block, monospace).
- **Entered events** card: per-event fee lines (fee amounts, e.g. "15.00", "20.00"), a note
  "partner invited" on the doubles line, and a "Total, bundle applied" summary row ("25.00").
- **Payment** card: "Bank transfer on the day.", "Payment instructions are the organizer's own.
  ShuttleWorks does not take payment."
- Back link "Back to the tournament page" → `goTournament`.

### 2.10 Sign in
- h1 "Sign in", sub-copy about one account entering any tournament on the site.
- Form: Email, Password, "Sign in" primary button (same glow shadow), "Forgot your password?"
  link, footer "No account yet? Create one." → `goSignup`.

### 2.11 Sign up
- h1 "Create an entrant account", sub-copy.
- Form: Email, Password (helper: "At least 12 characters. The server checks it against known
  breached passwords."), a "Human check" placeholder box (no widget rendered, text only: "Complete
  the check to create the account. It loads on this page only."), "Create account" primary button
  (same glow), footer "Already have one? Sign in." → `goLogin`.

### 2.12 My entries `/e/me/entries`
- h1 "My entries", sub-copy.
- **Per-tournament card**: header (tournament name link, venue/date line, a right-aligned status
  word, "Confirmed" in live tint, "Completed" in done/muted tint, plain text, no chip); body:
  per-event line items (code, discipline, optional partner name, fee amount; a completed card's
  line additionally carries an outcome clause "out in quarter-final" and a full set-score string
  "21-17 · 19-21 · 21-15" on the same line); footer: "Total {amount}" (plus, on the still-open
  card, "· withdrawal open until {deadline}") on the left, and a right-aligned link, "View
  receipt" on the open card, "View your matches" on the completed card.

### 2.13 Player page `/e/{slug}/players/{id}`
- Back link "← Spring Open" → `goPlayers`; h1 name ("Ada Lovelace"); club line ("Analytical BC");
  an events list with seed suffix ("Men's Singles [2]") and, for doubles, an inline partner link
  ("Women's Doubles with Grace Hopper").
- **Coming up** section: date sub-heading, then match cards with a **filled, tinted header** (
  `background: var(--status-live)`, light-on-dark text) carrying a context label ("MS · Final")
  and a state word ("Now"); two side rows with per-game score cells.
- **Played** section: match cards with a plain (untinted) header, state word "Completed", same
  side-row/score-cell shape; winning side rendered in a heavier font weight.
- Cross-tournament history or a standalone profile identity does not appear anywhere in this mock
  and is absent, not merely unrendered; see premise check 2. If a cross-tournament person spine is
  ever built, such a screen would be `Blocked` on R-DM-2 today: zero rows are affected by this
  audit.

### 2.14 Hardcoded strings in the mock

Sample domain content throughout (none of it is code, all of it is illustrative): tournament
names ("Spring Open", "Midsummer Shield", "Riverside Junior Circuit", "Northgate Autumn Classic",
"Harbour Doubles Invitational", "Westfield Winter Series"), club/venue/org names ("Kingsway
Centre", "Analytical BC", "Bletchley BC", "Orbit SC"), person names ("Ada Lovelace", "Alan
Turing", "Grace Hopper", "Katherine Johnson"), event codes MS / WD / XD, "Court 1"/"Court 2"/
"Court 3", round names ("Quarter-finals", "Semi-finals", "Final"), 21-point set scores
("21-17", "19-21", "21-15"), the timezone string `Europe/London`, and unitless money amounts
("15.00", "20.00", "25.00").

The one hit that is a product-code concern rather than mock filler: the copy "Badminton
tournaments taking entries through ShuttleWorks" is a hardcoded sport noun (see gap register,
G1-f).

Inline colour literals in the mock: 33 total. 23 occurrences of the card shadow
`rgba(15,17,20,0.08)` (`box-shadow: 0 1px 2px rgba(15,17,20,0.08)`, used on essentially every
card/section surface), 4 occurrences of the button glow `rgba(36,99,235,0.22)` (the CTA/submit/
sign-in/sign-up button hover shadows), 2 occurrences of `#fff`-family literals, and a handful of
one-off status-tint borders (e.g. `rgba(21,128,61,0.4)` on the entry-flow status pill,
`rgba(3,98,150,0.3)` on the account-banner border, `rgba(255,255,255,0.08)`/`rgba(255,255,255,0.12)`
in the sticky preview chrome). None of these literals appear in the shipped tree, `noRawColor.test.ts`
guards against exactly this class of regression (see C-INVENTORY §3).

`support.js`, saved alongside the mock, is the generated dc-runtime (the canvas-editor scaffolding
that makes mustache interpolation and `sc-if`/`sc-for` directives render inside Claude Design's
preview). It carries zero product content and was never copied into the repository.

The `_ds/` foundation bundle saved with this project is a design-token export, not a runtime
dependency of the mock or of the shipped app:

<!-- docs-paths-ignore-next-line: path inside the Claude Design project, not this repo -->
- `_ds/main-shuttleworks-system-167bfecf-6a05-438c-bc32-dc4291e0e334/_adherence.oxlintrc.json`
<!-- docs-paths-ignore-next-line: path inside the Claude Design project, not this repo -->
- `_ds/main-shuttleworks-system-167bfecf-6a05-438c-bc32-dc4291e0e334/_ds_bundle.js`
<!-- docs-paths-ignore-next-line: path inside the Claude Design project, not this repo -->
- `_ds/main-shuttleworks-system-167bfecf-6a05-438c-bc32-dc4291e0e334/_ds_manifest.json`
<!-- docs-paths-ignore-next-line: path inside the Claude Design project, not this repo -->
- `_ds/main-shuttleworks-system-167bfecf-6a05-438c-bc32-dc4291e0e334/readme.md`
<!-- docs-paths-ignore-next-line: path inside the Claude Design project, not this repo -->
- `_ds/main-shuttleworks-system-167bfecf-6a05-438c-bc32-dc4291e0e334/styles.css`
<!-- docs-paths-ignore-next-line: path inside the Claude Design project, not this repo -->
- `_ds/main-shuttleworks-system-167bfecf-6a05-438c-bc32-dc4291e0e334/components/fig-tokens.css`
<!-- docs-paths-ignore-next-line: path inside the Claude Design project, not this repo -->
- `_ds/main-shuttleworks-system-167bfecf-6a05-438c-bc32-dc4291e0e334/tokens/base.css`
<!-- docs-paths-ignore-next-line: path inside the Claude Design project, not this repo -->
- `_ds/main-shuttleworks-system-167bfecf-6a05-438c-bc32-dc4291e0e334/tokens/fonts.css`
<!-- docs-paths-ignore-next-line: path inside the Claude Design project, not this repo -->
- `_ds/main-shuttleworks-system-167bfecf-6a05-438c-bc32-dc4291e0e334/tokens/motion.css`
<!-- docs-paths-ignore-next-line: path inside the Claude Design project, not this repo -->
- `_ds/main-shuttleworks-system-167bfecf-6a05-438c-bc32-dc4291e0e334/tokens/shadows.css`

None of these files is imported at runtime by the mock, by the shipped entrant app, or by
`packages/design-system`. `fig-tokens.css` specifically is discussed as a design-time export in
T-DIFF below; it is not loaded by anything that ships.

## 3. C-INVENTORY (from the tree)

### 3.1 Frontend routes

Source: `apps/entrant/app/routes.ts` (route declarations only; loader/page-script mapping cross-
checked against the route modules under `apps/entrant/app/routes/` and their page scripts under
`apps/entrant/public/assets/`).

| URL | Module | Notes |
|---|---|---|
| `/e/` (index) | `routes/discovery.tsx` | Discovery / season calendar. |
| `/e/health` | `routes/health.tsx` | Liveness resource route. |
| `/e/sitemap.xml` | `routes/sitemap.tsx` | Resource route, no default component. |
| `/e/robots.txt` | `routes/robots.tsx` | Resource route. |
| `/e/signup`, `/e/signup/:slug`, `/e/signup/partner/:token` | `routes/signup.tsx` | Node-owned GET page; the POST is FastAPI's `/e/account/signup`. |
| `/e/login`, `/e/login/created`, `/e/login/failed`, `/e/login/signed-in` | `routes/login.tsx` | Same module at four paths, one per outcome; loader reads only `next`. |
| `/e/verify`, `/e/verify/done`, `/e/verify/failed`, `/e/verify/sent` | `routes/verify.tsx` | Account-confirmation outcomes. |
| `/e/forgot`, `/e/reset`, `/e/reset/sent`, `/e/reset/done`, `/e/reset/failed`, `/e/reset/password-failed` | `routes/resetPassword.tsx` | Password reset ask/set/outcomes. |
| `/e/partner`, `/e/partner/:token`, `/e/partner/accepted`, `/e/partner/failed` | `routes/partner.tsx` | Doubles invitation preview + outcomes. |
| `/e/me/entries` | `routes/myEntries.tsx` | Signed-in entrant home; anonymous SSR shell, identity resolved browser-side. |
| `/e/{slug}/receipt/{submissionId}` | `routes/receipt.tsx` | GET target of the entry-submit 303. |
| `/e/{slug}/schedule` | `routes/schedule.tsx` | Public match list. |
| `/e/{slug}/enter`, `/e/{slug}/enter/signed-in`, `/e/{slug}/enter/created` | `routes/enter.tsx` | Entry wizard + two post-auth outcome paths. |
| `/e/{slug}/regulations` | `routes/regulations.tsx` | Regulations reader. |
| `/e/{slug}/players/:personKey` | `routes/player.tsx` | One person's tournament page. |
| `/e/{slug}/draws/:drawKey` | `routes/draw.tsx` | One draw (bracket/round/list views). |
| `/e/{slug}` | `routes/tournament.tsx` | Hero + Overview/Draws/Players/Schedule tabs, catch-all last. |

Empty/error handling: every listed route uses an `EmptyState` component for a legitimately-empty
published surface (e.g. no matches for the selected filters) and an `ErrorBoundary` that renders
`MessagePage` for a hard failure (not-found workspace, unpublished gate, etc.), the general shape
followed by every entrant route module.

### 3.2 Public backend endpoints and exact allow-listed key sets

Field names below are copied verbatim from the Pydantic model definitions (not renamed, not
reordered from how the model declares them).

**`apps/api/src/entries/entries_json.py`**
- `EntryPageProjection` = `tournament, org, venue, page, policy, publication, events, entrants,
  reserves, viewer` (plus the model also privately composes `TournamentDTO`, `NamedDTO`,
  `VenueDTO`, `PageDTO`, `PolicyDTO`, `PublicationDTO`, `EventDTO`, `EntrantRowDTO`,
  `ReserveRowDTO`, `ViewerDTO`, each with its own field set, e.g. `EventDTO` = `id, code,
  discipline, feeCents, genderConstraint, entryType, opensAt, closesAt, withdrawsUntil,
  opensAtIso, closesAtIso, withdrawsUntilIso, isOpen, ageBracketed, entryCount`).
- `EntrantConfigDTO` = `turnstileSiteKey, authMode`.
- `SeasonListDTO` = `tournaments, counts, now`; `SeasonRowDTO` = `slug, name, organizer,
  venueName, date, eventCount, status, closesInDays, drawsPublished, winnersPublished`;
  `SeasonCountsDTO` = `takingEntries, completed`; `NowStripDTO` = `slug, moreCount`.
- `QuoteResponse` = `totalCents, feeBasis, refusal, resolved` (plus `RefusalDTO` =
  `code, message, subjects`).

**`apps/api/src/entries/entries_site.py`**
- `DrawsIndexDTO` = `published, resultsPublished, draws, divisions`.
- `DrawCardDTO` = `drawKey, eventCode, discipline, kind, size, hasConsolation, matchCoverage,
  recordScope, topologyScope, roundCount, champions, finalists, remainingMatchCount, historical,
  sourceUrl`.
- `DrawDetailDTO` = `drawKey, eventCode, discipline, kind, size, resultsPublished, matchCoverage,
  recordScope, topologyScope, historical, sourceUrl, identityScope, teams, segments, standings`.
- `PlayersDTO` = `published, players, referencedPlayerCount, missingNameCount`; `DrawPlayerDTO` =
  `playerKey, person, club, eventCodes`.
- `SeedsDTO` = `published, events`; `SeedsEventDTO` = `eventCode, discipline, seeds`;
  `SeedLineDTO` = `seed, persons, club`.
- `WinnersDTO` = `published, events`; `WinnersEventDTO` = `eventCode, discipline, decided, winner,
  runnerUp, semifinalists, finalScore, finalists`; `HonorDTO` = `persons, club`.
- `PlayerPageDTO` = `person, club, events, matches`; `PlayerEventDTO` = `code, discipline,
  partner, seed, drawPath`; `PlayerMatchDTO` = `eventCode, roundLabel, sides, score, decided,
  scheduledTime, court, playedOn, localTime, courtLabel, status, durationMinutes, updatedAt`;
  `PlayerMatchSideDTO` = `persons, placeholder, winner, seed`.
- `ScheduleMatchesDTO` = `published, items, facets, page, pageSize, total, timeZone, updatedAt,
  revision`; `ScheduleMatchDTO` = `matchKey, source, eventCode, discipline, roundLabel, status,
  scheduledDate, scheduledTime, court, sides, score, walkover, updatedAt`; `ScheduleSideDTO` =
  `participantKey, persons, placeholder`; `ScheduleFacetsDTO` = `days, events, courts, states`
  (`ScheduleDayFacetDTO` = `day, count`).
- `PersonReferenceDTO` = `identity, resolution, label`; `PublicPersonIdentityDTO` = `id, name`;
  `TeamDTO` = `participantKey, persons, club, seed`.

**`apps/api/src/entries/partner_routes.py`**
- `PartnerInviteDTO` = `tournamentName, slug, eventCode, discipline, invitedBy, askBirthYear`.

**`apps/api/src/entries/entries_me.py`**, these are session-gated entrant routes
(`/e/api/me/*`), not anonymous public projections.
- `MyEntriesDTO` = `tournaments, emailVerified`; `MyTournamentCardDTO` = `slug, tournamentName,
  orgName, entrantsPublished, resultsPublished, date, venueName, status, feeTotalCents,
  submittedAt, events`; `MyEntryLineDTO` = `eventCode, discipline, player, state, entryId,
  canWithdraw, resultBadge, partner`.
- `SubmissionReceiptDTO` = `submissionId, slug, tournamentName, orgName, venueName, submittedAt,
  status, feeTotalCents, paymentState, paymentNote, paymentInstructions,
  regulationsVersionAccepted, events`; `ReceiptEntryLineDTO` = `eventCode, discipline, player,
  partner, state`.

**`apps/api/src/identity/entrants_routes.py`**
- `EntrantDTO` = `id, email, displayName, emailVerified`; `SignupResponse` = `status, message`.

**`apps/api/src/display/display.py`**
- `DisplaySummaryDTO` = `kind, name`; `DisplayStateDTO` = `config, groups, players, matches,
  schedule, scheduleIsStale, standings` (six of the seven fields are typed `Any` pass-throughs of
  a legacy state blob; `standings` alone is a typed `List[MeetStandingRowDTO]`).

### 3.3 Key-set tests

- `tests/backend/unit/test_public_person_contract.py` holds an explicit `EXPECTED` map from model
  class to its exact allowed field set for eighteen DTOs spanning `entries_json.py`,
  `entries_site.py`, and `entries_me.py` (`PublicPersonIdentityDTO`, `PersonReferenceDTO`,
  `EntrantRowDTO`, `ReserveRowDTO`, `DrawCardDTO`, `DrawPlayerDTO`, `TeamDTO`, `SeedLineDTO`,
  `HonorDTO`, `WinnersEventDTO`, `PlayerDrawPathDTO`, `PlayerEventDTO`, `PlayerMatchSideDTO`,
  `PlayerMatchDTO`, `PlayerPageDTO`, `ScheduleDayFacetDTO`, `ScheduleSideDTO`, `ScheduleMatchDTO`,
  `ScheduleFacetsDTO`, `MyEntryLineDTO`, `ReceiptEntryLineDTO`). Three tests run against it:
  `test_every_sp_p9_serializer_has_its_exact_allow_list` (the guard itself),
  `test_negative_control_an_unregistered_key_is_rejected_by_the_guard` (proves the guard would
  actually fail on drift), and `test_the_identity_and_contact_privacy_seams_stay_separate` (asserts
  every registered model's key set is disjoint from `{email, phone, feeCents, submission,
  accountId}`).
- **`MyTournamentCardDTO` is not in the `EXPECTED` map today**, even though its sibling
  `MyEntryLineDTO` is. This is the gap the register's G1-a rows depend on: any new field added to
  `MyTournamentCardDTO` currently has no allow-list test to fail against.
- `tests/backend/test_entries_json_routes.py`, `tests/backend/test_season_listing.py`, and
  `tests/backend/test_display_public.py` cover route-level behavior (publication gating,
  season-list shape, display-token projection) for the DTOs above.
- `tests/backend/test_public_schedule_api.py` covers `ScheduleMatchesDTO` end to end,
  including `test_schedule_query_count_is_bounded_as_matches_scale` (around lines 330-386), which
  installs a SQLAlchemy `before_cursor_execute` listener and asserts the statement count stays
  constant as the match count scales, the N+1 guard pattern referenced by the register's
  Phase 3 test plan for any future `MyTournamentCardDTO` extension.

### 3.4 Domain model: no cross-tournament person entity

`apps/api/src/db/models.py` has no entity representing a person across tournaments. `EntryPlayer`
(table `entry_players`) has a **composite primary key** `(tournament_id, id)`, there is no bare
`id`-only person row anywhere upstream of it. `BracketParticipant.entry_player_id` (introduced by
migration `apps/api/src/alembic/versions/y9e4f0a2b7c8_person_key_and_match_state_fk.py`, comment
"R-DM-2(a)") is a **composite foreign key** back onto `(entry_players.tournament_id,
entry_players.id)`, which is the first constrained hop from the people spine to the competition
spine and is scoped to one tournament by construction. On the frontend,
`apps/entrant/app/lib/player.types.ts` states outright (line 7) that cross-tournament records are
"intentionally not part of this person-in-tournament projection." No code path anywhere in the
public tier assembles a person identity that spans more than one `tournament_id`.

### 3.5 Invariant guards

- **Identity rendering**: `PersonRef` / `PersonGroup` are the only components permitted to render
  a public name (per ADR 0018), enforced by `apps/entrant/tests/publicUniversality.test.ts`.
- **Style discipline**: `apps/entrant/tests/noRawColor.test.ts` (no literal color values outside
  `tokens.css`), `noTruncation.test.ts`, `noEmDash.test.ts`, and `uiTwins.test.ts` (parity between
  a component and its non-hydrated HTML twin) all run as part of the entrant vitest suite.
- **Page weight**: `apps/entrant/scripts/measure-page-weight.mjs` enforces a payload budget per
  route.
- **Backend import boundaries**: `apps/api/.importlinter` holds the fifteen architectural
  contracts described in `CLAUDE.md` (persistence direction, `scheduler_core` purity, per-domain
  independence, the pinned Operations→Bracket absence, etc.); none of them is specific to the
  public tier's *content* vocabulary.
- **Absence, stated plainly**: no I1-style CI grep guard for sport-domain vocabulary exists
  anywhere in this repository today (see premise check 3). There is no test analogous to
  `noRawColor.test.ts` for hardcoded sport nouns.

### 3.6 Design tokens

`packages/design-system/tokens.css` (571 lines) is the single token source for both tiers,
organized as one `@layer base` block scoped by `:root`, `[data-theme="light"]`,
`[data-density="compact"]`, and `[data-theme="dark"]`. Groups present:
- **Primitives**: `gray-0` through `gray-13`, `blue-*`, `green-*`, `amber-*`, `red-*`, plus `sky`
  and `violet` scales, each a numbered ramp.
- **Space, radius, motion, density**: numbered spacing and radius scales, motion duration/easing
  variables, and a `[data-density="compact"]` scope that the console sets on `documentElement`
  (the entrant tier never sets density and has no density control).
- **Type scale and fonts**: a type-size ramp plus font-family variables backing Geist, Archivo,
  and JetBrains Mono.
- **Semantic aliases**, light and dark: `surface-*`, `text-*`, `border-*`, `action-*`, `status-*`
  (the largest group by variable count), `module-*` (console-only module tinting), and a set of
  shadcn-compatible aliases (`background`, `foreground`, `card`, `card-foreground`, `popover`,
  `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `muted`,
  `muted-foreground`, `accent`, `border`, `ring`, etc.).
- **Shadows and glows**: a small set of `shadow-*` and `glow-*` variables (`--glow-accent`,
  `--glow-accent-lg`, `--glow-live`, `--page-glow`), the code-side equivalent of the mock's inline
  shadow/glow literals, expressed as tokens rather than repeated raw values.

`packages/design-system/tailwind-preset.js` is the shared Tailwind preset both tiers consume, and
`packages/design-system/globals.css` carries the small set of hand-written utility classes layered
on top of the tokens, including `.type-display` (the display-heading treatment used by every h1 in
the entrant tier via `apps/entrant/app/lib/ui.ts`'s `PAGE_TITLE`/`SECTION_TITLE` constants).

## 4. Gap register

One row per design feature. Classes: Exists · Partial · Frontend-only · Backend-serializer ·
Blocked · Cut.

### Discovery `/e/`
| Feature | Class | Note |
|---|---|---|
| Season calendar, month groups, date badges, venue/org line, event count | Exists | `SeasonCalendar`, `DateBadge` |
| Segments Season / Taking entries · n / Completed · n | Exists | `SeasonControls` -> `SegmentedNav` |
| Search box + Filters popover | Exists | GET form, `<details>` |
| "Live today" strip with sweep, "Draws & results ->" | Exists | `NowStrip`; `now` is a publication fact, not arithmetic |
| Status text: Entries open · closes in Nd / closed / TBC / Results -> | Exists | `SeasonStatusCell`, plain text |
| Header Sign in / My entries | Exists | `PlayShell` renders exactly one of the two |
| Copy "Badminton tournaments taking entries through ..." | Flag | Hardcoded sport noun at `discovery.tsx:113,134`; `BRAND` has no sport field. Ruling G1-f |

### Tournament hero + tabs
| Feature | Class | Note |
|---|---|---|
| Org eyebrow, title, date · venue, status line, "Enter this tournament", Overview/Schedule/Draws/Players | Exists | `HeroHeader`, `TabBar` |

### Overview `/e/{slug}`
| Feature | Class | Note |
|---|---|---|
| Intro, facts dl (Events / Players entered / Tournament time) | Exists | |
| Key dates rows incl. "Varies by event · see Draws" | Exists | `timelineModel` -> `SectionRow` |
| Venue (Hall/Address), Fees & payment, Documents "View" | Exists | View -> `/e/{slug}/regulations` (mock's link is a no-op; code is better) |
| "Information updated ..." | Exists | |

### Draws tab `?tab=draws`
| Feature | Class | Note |
|---|---|---|
| Event / Entered / Entries header, per-event row with facts, Open/Closed, Entrants + Draw buttons | Exists | `EventRow`; code additionally shows champion line |

### Players tab `?tab=players`
| Feature | Class | Note |
|---|---|---|
| "N players", filter, A-Z groups, event tags, club | Exists | `PlayersList`/`EntrantsList`, names via `PersonRef` only |

### Bracket `/e/{slug}/draws/{key}`
| Feature | Class | Note |
|---|---|---|
| Back link, h1, sub, Draw view Bracket/Round/List, Find, bracket columns + connectors, seeds `[n]`, winner emphasis | Exists | Round/List are real views; Find is SSR GET |
| Footnote "The final is on court now..." with pulsing round dot | Cut | Dot is a fully-round pulsing marker (ADR 0027: no dots, no `rounded-full`). Sentence "Scores update as the desk records them" already lives on Schedule; not duplicated (reduction) |

### Schedule `/e/{slug}/schedule`
| Feature | Class | Note |
|---|---|---|
| Day segments with counts, By time / By court, filter form (player, Event, Court, State, Clear), Live now, time groups, match cards with filled live header + "Now" | Exists | shared `MatchCard` |

### Entry flow `/e/{slug}/enter`
| Feature | Class | Note |
|---|---|---|
| 7-step wizard, Before you begin card, account banner, participant/events/partner/remarks, consent, sticky total, Submit | Exists | |
| Status pill "Entries open · closes in 9d", fully round + dot | Exists (shape already Cut) | ships as rectangular `StatusChip`, no dot |
| "2 open events" pill | Cut | Neutral count in a chip; decoration budget says chips are exceptional-state only. Render as plain muted text. `enter.tsx:481` |
| Primary button glow `0 0 22px` | Cut (already) | ADR 0027; not ported |
| Step-number squares (`rounded-xs`, accent when active/done) | Exists | Encode wizard progress state; kept |

### Receipt `/e/{slug}/receipt/{submissionId}`
| Feature | Class | Note |
|---|---|---|
| Your entry (Tournament, Reference), Entered events + total, Payment note, back link | Exists | `receipt.js` reads `/e/api/me/submissions/{id}` |

### Sign in / Sign up
| Feature | Class | Note |
|---|---|---|
| Forms, "Forgot your password?", human check, cross links | Exists | Forgot -> `/e/forgot`; human check = Turnstile |

### My entries `/e/me/entries`
| Feature | Class | Note |
|---|---|---|
| Year heading, card (title link, org · date, status word), line items, price footer | Exists | |
| "View receipt" link | Backend-serializer | `MyTournamentCardDTO` lacks `submissionId`; `Submission` rows are already loaded in `entries_me.py` (no new query). Route `/e/{slug}/receipt/{id}` exists. Debt D39 |
| "withdrawal open until {deadline}" | Backend-serializer | `EntryEvent.withdraws_until` already loaded; only `canWithdraw` bool reaches the DTO. Expose `withdrawsUntil` (min over the card's entered events, ISO string). D39 |
| "View your matches" | Partial | Ships as "View results" -> player page. Label only; recommend keep code label |
| "out in quarter-final" + set scores on a line | Backend-serializer | Would need per-line match outcome on the card; the player page already shows it one click away. Recommend reject (reduction) |

### Player page `/e/{slug}/players/{id}`
| Feature | Class | Note |
|---|---|---|
| Back link, name (PersonRef), club, events with partner links and seeds, Coming up / Played match cards, duration | Exists | single-tournament by design (`player.types.ts`) |
| Cross-tournament history / profile identity | (absent in mock) | Would be Blocked on R-DM-2; zero rows today |

### Cross-cutting
| Feature | Class | Note |
|---|---|---|
| Fonts Geist / Archivo / JetBrains Mono | Exists | self-hosted, CSP `font-src 'self'` |
| Public `/seeds` and `/winners` projections | Cut (candidate) | No consumer since ADR 0028 (D37). Retire routes, DTOs, `draws.types.ts` mirrors and parity pairs, or keep for export. Ruling G1-d |
| Honours detail (runner-up, semifinalists, final score) | Partial | D38; no design screen shows it. Recommend leave as debt |
| `_ds/` bundle, `support.js` | reference only | `support.js` is the generated dc-runtime, zero product content; never copied |

### Hardcoded-domain scan of the mock
Sample content only (tournament, club, venue, person names, MS/WD/XD codes, Court n, round names,
21-point scores, `Europe/London`, unitless money). None of it is code. Product-code hits: the
single "Badminton" copy string above. Inline colour literals in the mock: 33 uses (23x the card
shadow `rgba(15,17,20,0.08)`, 4x button glow, 2x `#fff`), none in the tree (`noRawColor.test.ts`).

## 5. T-DIFF

`fig-tokens.css` is a bit-exact Figma export of `tokens.css`: every `rgb` value in it equals the
code's `hsl` value.

**No equivalent (Figma-only, not a token).** None among custom properties. `.sw-press` (from
`motion.css`) is a class, not a token.

**Same intent, different name.**
| Figma name | Code name |
|---|---|
| `--accent-accent` | `--accent` |
| `--bg-bg` | `--bg` |
| `--card-card` | `--card` |
| `--ink-ink` | `--ink` |
| `--primary-primary` | `--primary` |
| `--rule-rule` | `--rule` |
| `--muted-muted` | `--muted` |
| `--secondary-secondary` | `--secondary` |
| `--destructive-destructive` | `--destructive` |
| `--info-info` | `--info` |
| `--success-success` | `--success` |
| `--warning-warning` | `--warning` |
| `--radius-radius` | `--radius` |
| `--dur-dur` | `--dur` |
| `--ease-ease` | `--ease` |
| `--border-border` | `--border` |
| `--foreground-foreground` | `--foreground` |
| `--background-background` | `--background` |
| `--popover-popover` | `--popover` |
| `--m-*` (motion.css shorthand) | `--motion-*` |
| `--e-*` (motion.css shorthand) | `--ease-*` |

These are Figma collection flattenings: a Figma variable collection cannot alias to a bare name
the way a CSS custom property can, so the export doubles the group name into the variable name.

**Same name, different value.**
| Name | Difference |
|---|---|
| `--font-*` | Figma export collapses each to a bare family name; code keeps the full font-stack value. |
| spacing / radius / density / text-size tokens | Figma stores unitless floats; code stores px/rem with units. |
| font loading | Figma export references a Google Fonts CDN import; code self-hosts via `@fontsource-variable`. |
| `sw-sheen` | Figma alpha `.45`; code alpha `.55`. |
| `sw-phase-glow` / `sw-scan` | Figma bakes a light-mode `rgba(...)` literal; code computes `hsl(var(--accent))`. |

**Recommended G1-c policy: every row is "map" or "reject"; zero "add."** Under this policy, Phase
1 (token edits) is empty, and its negative-control step (remove one token, prove a test fails) is
moot, recorded here as such rather than executed against nothing.

## 6. Open rulings for G1

With recommendations, for the owner to confirm, reject, or amend at gate G1:

- **R-DM-2**, nothing in this design depends on it. Recommend: no action here; this document
  records the seam-passing field list (name, club, event, published results in; email, phone,
  birth year, fee, account id out) for a future SP if a cross-tournament person spine is ever
  proposed.
- **G1-a**, in scope: the two My-entries `Backend-serializer` rows (`submissionId`,
  `withdrawsUntil`) and their frontend consumption in `my-entries.js`. Out of scope: per-line
  match outcome. Recommend: in.
- **G1-b**, no `Blocked` routes exist in this register; nothing to omit. Recommend: confirm.
- **G1-c**, map or reject every T-DIFF row as above; no `tokens.css` change. Recommend: confirm.
- **G1-d**, `Cut` rows: the bracket pulsing dot (already absent from the shipped code; confirm it
  is never ported), the "N open events" pill (render as plain text instead), and the
  `/seeds` + `/winners` route retirement. Recommend: cut all three.
- **G1-e**, SP-P7 sections 3.4-3.6 are already superseded by ADR 0028; SP-P8 and SP-P9 are
  untouched (their key-set tests are the ones this audit's Phase 3 plan would extend). Recommend:
  this document reorders nothing in either program.
- **G1-f (new)**, the "Badminton" copy string and the missing I1 vocabulary guard. Options:
  (1) add a `sport` / `publicTagline` field to `packages/brand/brand.json` and read it in
  `discovery.tsx`; (2) leave as is. A CI grep guard is its own small SP either way. Recommend:
  (1) in a later implementation phase, guard deferred to the debt log.

When any of the above is later implemented other than as ruled here, record the deviation inline
at the point of change using this exact format:

`DEVIATION — <phase> — <what the ruling said> — <what was done instead> — <why> — <what the owner must decide>`

## 7. G1 rulings (2026-09-05)

- **R-DM-2**: no dependent rows. Confirmed; nothing in this register is `Blocked` on a
  cross-tournament person spine, and this document's seam-passing field list stands as the
  reference for a future SP.
- **G1-a**: in scope is the My-entries `submissionId` and `withdrawsUntil` fields on
  `MyTournamentCardDTO` and their consumption in `my-entries.js`. Per-line match outcome
  ("out in quarter-final" plus set scores on a My-entries line) is rejected: the player page
  already carries it one click away, and reduction wins.
- **G1-b**: nothing to omit. No `Blocked` routes exist in this register.
- **G1-c**: every T-DIFF row is map or reject, as recommended; `tokens.css` is unchanged; Phase 1
  (token edits) is empty, as recorded above.
- **G1-d**: the "N open events" pill is cut to plain text; the public `/seeds` and `/winners`
  routes and their DTOs are retired (`entries_site.py`, `dto.generated.ts`,
  `draws.types.ts`, and the `dtoParity.test.ts` pairs); the bracket footnote's pulsing round dot
  is confirmed never ported (ADR 0027's no-dot rule already excluded it from the shipped tree).
- **G1-e**: nothing reordered. SP-P7 sections 3.4-3.6 stay superseded by ADR 0028; SP-P8/SP-P9 are
  untouched.
- **G1-f**: `sportName` is added to `packages/brand/brand.json` and read by
  `apps/entrant/app/routes/discovery.tsx`, replacing the hardcoded "Badminton" copy string. The CI
  sport-noun grep guard is deferred to the debt log (no guard exists in this repository today; see
  premise check 3 and `docs/reference/debt-log.md`).

## 8. Negative controls

The key-set guard's negative control was exercised directly against the running suite rather than
assumed. A temporary `bogusLeakedField: str = "x"` was added to `MyTournamentCardDTO`, and
`pytest tests/backend/unit/test_public_person_contract.py -q` was run before, during, and after:

- With the field present, pytest's own set-diff reported exactly:
  `Extra items in the left set: 'bogusLeakedField'`, and the run reported 2 failed, 2 passed (the
  two tests keyed to `MyTournamentCardDTO`'s exact allow-list failed; the other two, unrelated to
  that model, passed).
- The field was reverted and the same command reported 4 passed.

The batching claim (A6, no N+1 as the account's history grows) was exercised the same way:
`pytest tests/backend/test_entries_me_api.py::test_public_my_entries_no_n_plus_one -q -s` was run
with the statement counters printed. One card cost 8 statements; eight cards, after the loop
seeded seven more workspaces, also cost 8 statements.
