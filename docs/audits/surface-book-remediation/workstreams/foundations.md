# Foundations and Operations workstream

Status: in progress · owner: Luna · 2026-09-06

Reviewed evidence: operator v2 pages 109–110, 119–125 and public v2 page 197;
full notes in `book-notes.md`. The PDF renderer binaries (`pdftoppm`/`pdfinfo`)
are unavailable in this environment; source-page text and existing capture tests
were used for the initial implementation pass.

## Decisions and changes

- OC05.1: retain the existing `formatMatchIdentity` contract in
  `apps/console/src/platform/domain/matchIdentity.ts`; no competing formatter.
- OC24.1: Operations now exposes `CourtLane.conflict` when multiple live/called
  records claim one court, leaves `now` unset, and renders every record with an
  explicit resolution instruction. The display lane helper also refuses to
  promote an arbitrary duplicate to `now`.
- Existing planned-slot conflict checks remain in `constraintChecker.ts`; actual
  current-state conflicts are handled at the run-lane boundary.
- The canonical match command and match-state route now reject a second
  `playing` match on the same materialized court before persistence. A `called`
  match may coexist with one `playing` match because it is a pending call. This
  preserves the called→playing workflow while preventing the source from
  creating two current matches.
- Bracket venue display groups assignments by court and shows one current plus
  one next match per court. Duplicate started assignments remain a visible
  conflict card; empty court slots say `No next match assigned` without a fake
  `vs` contest. Doubles sides remain break-word, stacked names.

## Verification

- Added a run-model regression proving two live records produce no selected
  current match and preserve both conflict records.
- Existing formatter, court-lane, display-layout, and run-surface tests remain
  required. The focused console suite currently passes 62 tests; public display
  integration still needs a conflict-state fixture and screenshot review.
- Browser verification attempted 2026-09-06 at 1440×900 against the local
  console (screenshots `/tmp/sw-final-overview.png` and
  `/tmp/sw-final-draw.png`). The fixture session was unauthenticated and both
  routes rendered the sign-in gate, so no authenticated visual claim is made;
  the prior authenticated display capture remains `/tmp/sw-display.png`.

## Outstanding IDs

OC16.1, OC16.2, OC17.1, OC18.1, OC18.2, OC19.1, OC19.2, OC24.1, OC24.2,
OC24.3 remain open until their shared occurrences are integrated and recaptured.
