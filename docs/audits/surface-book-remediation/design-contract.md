# Surface-book remediation — adopted design contract

Date: 2026-09-06. This records rules implemented and verified in local
console/display surfaces. It is a working contract, not a proposal matrix.

## Visual system

- Console uses Geist Variable for interface text, Archivo Variable for display
  headings, and JetBrains Mono for IDs, times, counts, and score lanes.
- Existing spacing uses `--space-0..10`: 0, 2, 4, 8, 12, 16, 24, 32, 48, 64,
  96px. Operator rows use shared cell density; names and errors may grow
  vertically rather than truncate.
- Controls stay compact (`h-8` through `h-11`); cards and panels use existing
  small-to-medium radii. Shadows are reserved for overlays; the retained
  ShuttleWorks mark shadow is the documented brand exception.
- Light console surfaces use `surface-sunken`, `surface-base`, and
  `surface-raised`; actions use the existing blue primary token. Components do
  not introduce raw hex values or a second brand accent.
- Status words accompany status treatment. Routine identity and progress are
  plain text; chips and solid fills are reserved for live, called, conflict,
  overdue, or other exceptional states. Winner indication may use the shared
  `WinnerDot` together with score/name treatment.

## Surface roles

- Overview is a command center: workspace identity, lifecycle phase, progress,
  next action, and links to owning surfaces. Counts name their units and scope.
- Plan is an operator schedule sheet. Rows lead with match reference and both
  sides, followed by honest planned time/court context. Source squares are
  omitted when the match reference already identifies the row.
- Live is the floor view. Court cards lead with player names, then state and
  match reference. Called and playing remain distinct; conflicts are explicit
  errors and never silently choose a record.
- Public Display is venue-first: large names and court labels, short state
  words, and a concrete next match when one exists. Empty courts say `No next
  match assigned` and never render a blank placeholder panel.

## Match identity and data

- `apps/console/src/platform/domain/matchIdentity.ts` is the display formatter.
  Bracket labels use persisted `event_id`, `round_index`, `match_index`,
  `segment`, and event format, producing stable `R32`, `QF`, `SF`, and `F`.
  Round-robin uses `R{round}·{sequence}`.
- Meet labels use authored event-rank coordinates. Full machine `matchId`
  remains available for routing, support, and exact selection keys.
- Workspace summaries carry decomposed identity metadata and optional resolved
  side names. Rescheduling changes time/court fields, never the reference.
- Bracket coordinates and names come from batched reads of `bracket_matches`,
  `bracket_events`, and `bracket_participants`; summaries do not infer identity
  from schedule order or opaque IDs.

## Vocabulary and exceptions

- Lifecycle is `setup → ready → live → complete`; entry phases are `announced`,
  `entries_open`, and `entries_review` before play phases.
- Match state words are `scheduled`, `called`, `playing`, and `finished`, with
  `retired` and `conflict` reserved for actual conditions. Dates use existing
  UTC/venue formatting helpers.
- Pair sides render each partner separately where available; `vs` separates
  sides. `Winner of …`, `Loser of …`, `Bye`, and `TBD` remain explicit bracket
  exceptions for unresolved sides.
- Names and references are shown in full at the initial mobile layout; the
  retained entrant bracket-node exception also exposes the same full value
  through its accessible label. The table empty mark is the sole em-dash
  exception.

## Public time and venue source

- Tournament overview reads the declared `timeZone` from the public page
  tournament object in `apps/entrant/app/routes/tournament.tsx`.
- Schedule rows and freshness text use `matches.timeZone` in
  `apps/entrant/app/routes/schedule.tsx`; UTC moments are converted by
  `apps/entrant/app/lib/format.ts` (`formatMomentInZone`).
- Venue identity is sourced from `page.venue.name` and
  `page.venue.address` in the tournament and regulations routes. No public
  surface substitutes the browser timezone for the tournament timezone.

Evidence is the focused component suite, `npm run test:classes`, the console
production build, and native local captures in `/tmp/sw-review`. The captures
are local-only and require no remote or offline service.
