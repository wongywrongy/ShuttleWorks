# Canonical surface-book review — 2026-09-08

**Status: complete. All 81 surfaces and 568 PNGs visually reviewed.**
The source-based disposable fixture produced 36 operator surfaces (343 PNGs,
345 PDF pages) and 45 public surfaces (225 PNGs, 227 PDF pages). Both desktop
1440×900 and mobile 390×844 captures completed without failed viewports.
The only browser-console errors are the two expected HTTP 404s for the
withheld-player refusal, one per viewport.

Current books: `docs/screenshots/ui-review/operator-console-surface-book.pdf`
and `docs/screenshots/ui-review/public-entrant-surface-book.pdf`, with adjacent
HTML, manifests, and raw asset directories. The dated originals and browser
checks are under `docs/screenshots/ui-review/canonical-final-2026-09-08/`.

The books contain reachable canonical product surfaces and meaningful state or
continuation sheets. Retired compatibility URLs, fabricated capabilities,
unknown player identifiers, disabled routes, and duplicate pages are excluded.
Real credential- and token-backed forms remain where the disposable fixture
provides the required handles. Genuine product refusals remain expected-error
surfaces. Historical handovers remain available under their dated paths and
are not evidence of a long-lived deployed demo.

The current source and fixture review covers:

- fixed event chronology, including live multi-day classification;
- offset-aware venue-local Setup dates and UTC deadline storage;
- matching fee schedules and Setup data, meaningful names, Hub live phase,
  disabled-route filtering, mobile wrapping, and full-scroll image capture;
- capture provenance separating the capture checkout from the reviewed build,
  including the effective demo instant and dirty-tree fingerprint;
- canonical route validation, final destination checks, and raw per-sheet
  screenshots with batch PDF/HTML output.

## Fixture and evidence boundary

The review uses current working-tree source, not a claim about the long-lived
Tailscale deployment. The shared event instant is `2026-07-31T05:15:00Z`:
13:15 in Taipei and 14:15 in Korea. Security, token expiry, audit records, and
submission timestamps use the real clock. The captured build and checkout
record commit `fa52586b5fcf7d35f3f3f2987c09807aa96f78d5` plus local changes.
The final manifests report the dirty-tree fingerprint as `unavailable` because
the capture helper exceeded its Git output buffer and resolved untracked paths
from the wrong directory. Both issues are corrected, and the exact helper now
produces a valid SHA-256 value; no retrospective fingerprint has been substituted into these books.

The data now has completed matches before the live slot, feeder order and rest
spacing, six distinct live courts, and no planned court collision. Hub and
Overview agree on the live phase. Taipei Setup closes entries on 14 July at
23:59 venue time; Korea closes on 1 August at 23:59. Setup and public fees both
use 5000 minor units per event. Featured accounts have meaningful player names,
and the Meet fixture is F&K Junior League Summer 2026 (72 players, 73 matches).
The operator Taipei roster includes 253 players; the public view lists 252
because the withheld player is deliberately excluded.

Real fixture transactions provide the receipt, reset form, partner invitation,
and operator invitation. Missing optional capabilities are omitted, including
the bare partner-accepted page. Disabled Entries, authenticated console login,
empty earlier-season sections, and nonexistent Meet page 2 continuations are
omitted. Legacy aliases never become book pages or appended compatibility pages.

All 13 final browser checks pass: seven public surfaces render without
JavaScript; Players links to a profile natively; mobile singles and doubles
round controls reach the final; Hub opens enabled Live day; Setup dates match
venue-local deadlines; and the mobile Done filter is visible and operable.
The horizontal bracket viewport intentionally shows a subset of columns;
round navigation was exercised with touch emulation. Physical-device and
assistive-technology testing are outside this review.

Long lists have overlapping continuation images. A row fragment under a sticky
header is acceptable only when the complete row appears in the adjacent frame.
The capture uses actual scrollable containers and does not expose hidden UI.
Signup's human-check widget uses the fixture's explicit testing mode.

## Verification record

The recorded gates include frontend `2349` and `1196` passing tests, focused
signals `57`, Hub `56`, match `26`, and receipt `5`; backend `2529` passed and
`74` skipped, followed by the generated DTO freshness correction and `3`
freshness tests passing; seed tests now report `40` passing. Capture integration tests report `3` passing,
and all `13` final browser checks pass. Ruff, import
contracts, docs tests (`48` passed, `2` skipped), docs paths, and VitePress
build passed. The initial backend run's one DTO freshness failure was resolved
by regenerating the API DTO containing `SeasonRowDTO.endDate`.


## Visual ledger

Each row records desktop and mobile PNG counts, including continuations and scroll-end evidence. Every desktop, mobile, and continuation image has been visually inspected.

Review was split among the primary agent and three Luna subagents. Whole rows beneath sticky headers were checked against adjacent overlapping frames.

### Operator

| Sheet | Surface | Desktop PNGs | Mobile PNGs | Visual result |
| --- | --- | ---: | ---: | --- |
| S01 | Hub — workspace list | 1 | 1 | Reviewed |
| S02 | Hub — create workspace | 1 | 1 | Reviewed |
| S03 | Global settings | 1 | 1 | Reviewed |
| S04 | Overview | 1 | 2 | Reviewed |
| S05 | Setup · Details | 4 | 7 | Reviewed |
| S06 | Setup · Entry rules | 1 | 1 | Reviewed |
| S07 | Setup · Scoring | 1 | 1 | Reviewed |
| S08 | Setup · Public site | 3 | 4 | Reviewed |
| S09 | Participants · Roster | 6 | 10 | Reviewed |
| S10 | Bracket · Draws | 1 | 1 | Reviewed |
| S11 | Bracket · Draw canvas | 1 | 6 | Reviewed |
| S12 | Bracket · Matches | 11 | 40 | Reviewed |
| S13 | Bracket · Settings | 2 | 4 | Reviewed |
| S14 | Operations · Plan | 18 | 43 | Reviewed |
| S15 | Operations · Live day | 7 | 21 | Reviewed |
| S16 | Display · Board settings | 2 | 2 | Reviewed |
| S17 | Display · Board preview | 1 | 1 | Reviewed |
| S18 | Administration · Team | 1 | 1 | Reviewed |
| S19 | Administration · Modules | 1 | 1 | Reviewed |
| S20 | Administration · Backups | 2 | 3 | Reviewed |
| S21 | Administration · Activity | 2 | 4 | Reviewed |
| S22 | Administration · Lifecycle | 1 | 1 | Reviewed |
| S23 | Hub — past workspaces | 1 | 1 | Reviewed |
| S24 | Hub — live workspaces | 1 | 1 | Reviewed |
| S25 | Participants · Roster · bracket page 2 / 100 rows | 6 | 10 | Reviewed |
| S26 | Participants · Roster · bracket 25 rows | 3 | 4 | Reviewed |
| S27 | Bracket · Matches · page 2 / 100 rows | 6 | 19 | Reviewed |
| S28 | Bracket · Matches · 50 rows | 6 | 21 | Reviewed |
| S29 | Global settings · Security | 1 | 1 | Reviewed |
| S30 | Global settings · Sessions | 1 | 1 | Reviewed |
| S31 | Global settings · Appearance | 1 | 1 | Reviewed |
| S32 | Display · Fullscreen venue board | 1 | 2 | Reviewed |
| S33 | Invite · Valid token | 1 | 1 | Reviewed |
| S34 | Meet · Matches | 7 | 13 | Reviewed |
| S35 | Meet · Team structure | 1 | 3 | Reviewed |
| S36 | Meet · Participants roster | 1 | 3 | Reviewed |

### Public

| Sheet | Surface | Desktop PNGs | Mobile PNGs | Visual result |
| --- | --- | ---: | ---: | --- |
| S01 | Discovery · Season calendar | 1 | 2 | Reviewed |
| S02 | Tournament · Overview | 2 | 2 | Reviewed |
| S03 | Tournament · Players | 10 | 23 | Reviewed |
| S04 | Player detail | 2 | 2 | Reviewed |
| S05 | Tournament · Draws | 1 | 2 | Reviewed |
| S06 | Tournament · Schedule and live | 5 | 7 | Reviewed |
| S07 | Draw · Singles full bracket | 2 | 3 | Reviewed |
| S08 | Draw · Singles match list | 4 | 7 | Reviewed |
| S09 | Draw · Doubles detail | 3 | 3 | Reviewed |
| S10 | Regulations reader | 1 | 2 | Reviewed |
| S11 | Entry receipt | 2 | 2 | Reviewed |
| S12 | Entry form | 2 | 3 | Reviewed |
| S13 | Entry form · Signed-in outcome | 2 | 3 | Reviewed |
| S14 | Entry form · Account-created outcome | 2 | 3 | Reviewed |
| S15 | Account · Sign in | 1 | 1 | Reviewed |
| S16 | Account · Created outcome | 1 | 1 | Reviewed |
| S17 | Account · Failed sign-in outcome | 1 | 1 | Reviewed |
| S18 | Account · Signed-in outcome | 1 | 1 | Reviewed |
| S19 | Account · Create account | 2 | 2 | Reviewed |
| S20 | Account · Create account for tournament | 2 | 2 | Reviewed |
| S21 | Account · Verify address | 1 | 1 | Reviewed |
| S22 | Account · Verification complete | 1 | 1 | Reviewed |
| S23 | Account · Verification failed | 1 | 1 | Reviewed |
| S24 | Account · Verification email sent | 1 | 1 | Reviewed |
| S25 | Account · Forgot password | 1 | 1 | Reviewed |
| S26 | Account · Reset email sent | 1 | 1 | Reviewed |
| S27 | Account · Reset password | 1 | 1 | Reviewed |
| S28 | Account · Password reset complete | 1 | 1 | Reviewed |
| S29 | Account · Password reset failed | 1 | 1 | Reviewed |
| S30 | Account · New password failed | 1 | 1 | Reviewed |
| S31 | My entries (signed out) | 1 | 1 | Reviewed |
| S32 | Discovery · Search across seasons | 1 | 1 | Reviewed |
| S33 | Doubles partner invitation · token | 1 | 1 | Reviewed |
| S34 | Doubles partner failed | 1 | 1 | Reviewed |
| S35 | My entries (signed in) | 1 | 2 | Reviewed |
| S36 | Results tournament · Overview | 1 | 2 | Reviewed |
| S37 | Results tournament · Players | 9 | 23 | Reviewed |
| S38 | Results tournament · Draws | 1 | 2 | Reviewed |
| S39 | Results tournament · Schedule and live | 4 | 8 | Reviewed |
| S40 | Results draw · Singles full bracket | 2 | 3 | Reviewed |
| S41 | Results draw · Doubles full bracket | 3 | 3 | Reviewed |
| S42 | Results tournament · Regulations | 1 | 2 | Reviewed |
| S43 | Results tournament · Player detail with history | 2 | 2 | Reviewed |
| S44 | Results draw · Highlighted player path | 2 | 3 | Reviewed |
| S45 | Expected refusal · Player withheld from publication | 1 | 1 | Expected withheld-player refusal |
