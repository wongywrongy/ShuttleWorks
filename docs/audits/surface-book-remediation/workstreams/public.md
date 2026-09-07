# Public entrant workstream
This is an intermediate workstream note; the authoritative public capture and final findings register are elsewhere in this folder.

Status: implementation in progress. Shared route/component slices are landed;
remaining public findings and final screenshot recapture continue under this
workstream and `/root` integration review.

## Boundary and evidence

This workstream owns `apps/entrant`, public entrant tests, and the public
schedule projection in `apps/api/src/entries/entries_site.py` plus
`tests/backend/test_public_schedule_api.py`. Existing dirty changes in the
repository were preserved. The reviewed v2 PDF was read page by page through
the supplied extraction and its annotated raster pages were inspected,
including PE01, PE03, PE09, PE10, PE12, PE15, PE22 and PE39. The review book
is baseline evidence; it is not treated as a current-build screenshot.

The public runtime remains publication-gated and privacy-scoped. Authentication
continuation uses the existing safe return target and token/CSRF checks. No
entry, payment, invitation, verification, or receipt success is claimed from a
local render alone.

## Decisions and implementation

- Discovery and tournament pages use consumer-facing tournament language and
  keep local workspace metadata out of the public identity. Event, round,
  player/pair, count, publication, and timezone labels identify their scope.
- The shared public match anatomy is used by schedule, list, round, bracket,
  player-path, and doubles views. Full names and doubles partners remain
  readable; score columns stay attached to their side; state is written in
  text. Bracket nodes grow for long names instead of permanently truncating
  identity on narrow screens.
- Draw navigation preserves segment, view, round, and player context. Round
  navigation is visible; player filtering shows a selected-person explanation
  and a clear action; the list and bracket remain alternate views of the same
  projection.
- Schedule filters keep day/player immediately available and place event,
  court, and state under a labelled mobile disclosure. The current queue is
  presented on entry when live records exist. The API applies live-first,
  upcoming, then completed ordering to the complete filtered result before
  pagination, with chronological and match-key tie-breakers.
- Regulations are a direct, mobile-readable document. A single-section
  document skips an unnecessary contents block; prose wraps naturally and
  remains available without JavaScript.
- Open, closed, unavailable, signed-in, pending, expired, failed, and receipt
  states retain truthful headings and next actions. Public references remain
  copyable and protected content remains protected.

## Finding coverage

All 34 baseline public IDs are listed in the parent implementation register.
The family table records implementation boundaries; final dispositions require
runtime and visual evidence from the continuing pass.

| Family | IDs | Verification boundary |
| --- | --- | --- |
| Discovery and tournament identity | PE01.1–3, PE02.1, PE03.1–4 | Public page, completed view, overview, event/player counts and declared timezone |
| Events and player directory | PE04.1–3, PE05.1–2 | Events/draw index, zero-round copy, event expansion, long/diacritic names |
| Schedule and live | PE09.1–3 | Global API ordering, mobile filter disclosure, current/next court wording and pagination |
| Draw views and player path | PE10.1–3, PE12.1 | Long doubles names, visible round controls, view context, selected player and clear action |
| Match list and regulations | PE13.1–2, PE15.1–2 | Explicit dates, grouped match boundaries, 390px and 200% text zoom |
| Entry/auth/recovery | PE16.1, PE19.1, PE22.1, PE23.1, PE24.1, PE26.1, PE37.1 | Truthful lifecycle headings, signed-in continuation, safe return, token and invitation states |
| Receipt | PE39.1–3 | Loading versus sign-in-required, one gate action, stable copyable reference |

The 39 baseline surface IDs PE01–PE39 and the separately captured player
detail regression are included in the integrated capture
`docs/screenshots/ui-review/remediation-2026-09-06/integrated-public.html`.
Its manifest is complete (39/39, HTTP 200); selected native-size images for
discovery, overview, schedule, draw, regulations, account, and receipt were
inspected. Surfaces without unique findings remain regression surfaces.

## Current per-ID disposition

This is the implementation checkpoint; “implemented” means the current code
has a focused test or harness assertion, while final acceptance still requires
the parent’s full native-size screenshot pass.

| IDs | Current disposition |
| --- | --- |
| PE01.1, PE01.2, PE01.3, PE02.1, PE03.1, PE03.2, PE03.3, PE03.4 | Implemented in discovery/tournament routes; final fixture evidence pending |
| PE04.1 | Implemented: event rows show confirmed registrations and draw participants with explicit units; native `/e/2026-korea-masters-t030?tab=events` desktop/mobile captures inspected |
| PE04.2 | Implemented: event titles no longer include the round-level “Final”; component test and native Events captures inspected |
| PE04.3 | Implemented: zero-round draws explain that rounds remain to be scheduled; component regression test added |
| PE05.1, PE05.2 | Implemented in player directory; final fixture evidence pending |
| PE09.1, PE09.2, PE09.3 | Implemented in schedule projection and responsive route; backend test plus browser harness, final live fixture evidence pending |
| PE10.1, PE10.2, PE10.3 | Partial: shared match card and draw navigation pass geometry tests, but integrated capture shows a later long-name vertical overlap on PE10.1 |
| PE12.1 | Partial: search/filter/clear works, but the integrated Zhu path lacks visible selected-person emphasis |
| PE13.1, PE13.2 | Implemented in match-list/card date and grouping presentation; production draw geometry suite and native Events captures inspected |
| PE15.1, PE15.2 | Implemented in regulations route; 360px and 200% harness passes, final book viewport review pending |
| PE16.1 | Implemented and covered by `tests/enter.render.test.ts`: closed heading and adjacent tournament-information action |
| PE19.1 | Existing account/entry separation retained and covered by signup/login render tests; final screenshot pending |
| PE22.1 | Implemented and covered by login tests: signed-in continuation plus alternate-account escape |
| PE23.1 | Implemented: human-check help hides on provider success; provider success itself is outside local fixture boundary |
| PE24.1 | Implemented and covered by signup tests: tournament context heading and safe `/enter/created` return |
| PE26.1 | Implemented: verification and password-reset success headings identify the verified outcome; focused recovery tests pass |
| PE37.1 | Implemented: invalid invitation has an orienting heading and recovery copy; focused partner tests pass |
| PE39.1, PE39.2 | Partial: route/script state tests pass, but integrated settled capture retains loading/gate duplication |
| PE39.3 | Implemented: exact full reference has SSR/client Copy reference action; receipt script and route tests pass |

## Individual register evidence

| ID | Actual code boundary | Evidence / disposition |
| --- | --- | --- |
| PE01.1 | `SeasonCalendar.tsx`, `HeroHeader.tsx`, `tournament.tsx` | Local Workspace suppressed; discovery/tournament render tests; final native recapture pending |
| PE01.2 | `discovery.tsx` | Task-specific discovery copy; discovery render tests |
| PE01.3 | `PlayShell.tsx`, `SegmentedNav.tsx` | Slanted mark retained as the small signature; shell is neutral and active navigation uses an underline; component tests and fresh shell captures |
| PE02.1 | `discovery.tsx` | Completed view leads with archive heading; render test and S02 capture inspected |
| PE03.1 | `format.ts`, `tournament.tsx`, `schedule.tsx` | Declared timezone used for display; date-boundary schedule tests |
| PE03.2 | `EventRow.tsx`, `tournament.tsx`, `PlayersList.tsx` | Registrations and draw participants named separately; component tests and Events captures |
| PE03.3 | `tournament.tsx` | Hero no longer repeats date/venue/timezone facts; overview capture inspected |
| PE03.4 | `tournament.tsx` | Closed fee state has no unavailable entry link; tournament render tests |
| PE04.1 | `EventRow.tsx` | Explicit registration/participant units and single-line desktop action; component tests and native Events captures |
| PE04.2 | `EventRow.tsx` | Event-level title separated from round title; component test and native captures |
| PE04.3 | `EventRow.tsx` | Zero-round exception explains rounds to be scheduled; component regression test |
| PE05.1 | `EntrantsList.tsx`, `PlayersList.tsx` | Content-sized alphabet groups; player render tests; final directory capture pending |
| PE05.2 | `PlayersList.tsx`, `EntrantsList.tsx` | Event abbreviations expand in-place; render tests |
| PE09.1 | `entries_site.py`, `schedule.tsx` | Global live-first ordering before pagination; API regression and schedule harness |
| PE09.2 | `entries_site.py`, `MatchCard.tsx`, `schedule.tsx` | Currently running Operations assignments project court by play-unit id when no materialized value exists; future plans stay unavailable and current conflicts are withheld; 11-test backend suite |
| PE09.3 | `schedule.tsx` | Secondary filters disclosed under More filters; 390/360 browser harness |
| PE10.1 | `MatchCard.tsx`, `draw.tsx` | Long doubles names wrap in content-aware nodes; production geometry suite |
| PE10.2 | `draw.tsx` | Visible wide-bracket guidance and Round/List route; geometry suite |
| PE10.3 | `draw.tsx` | Compact discrete view links; draw render tests |
| PE12.1 | `draw.tsx`, `MatchCard.tsx` | Person name and matching rows emphasized with text decoration, count and clear action; render/geometry tests |
| PE13.1 | `MatchCard.tsx`, `draw.tsx` | Date or date-to-be-confirmed shown with declared timezone; draw tests |
| PE13.2 | `draw.tsx`, `MatchCard.tsx` | Compact List uses one round heading, restrained row rules, and per-row state/date/scores; `/tmp/public-list-measure.json` confirms 31 rows, zero repeated match headings, and no 390px overflow |
| PE15.1 | `regulations.tsx` | Natural wrapping at 390/360 and 200% text zoom; browser harness |
| PE15.2 | `regulations.tsx` | Single-section document omits contents panel; regulations tests and harness |
| PE16.1 | `enter.tsx` | Closed/open/unavailable headings match lifecycle; enter render tests |
| PE19.1 | `login.tsx`, `signup.tsx` | Account and entry described as separate actions; login/signup render tests |
| PE22.1 | `login.tsx` | Valid signed-in continuation and explicit switch-account branch preserve safe next; login tests |
| PE23.1 | `signup.tsx` | Provider-success state removes technical troubleshooting; signup/provider tests |
| PE24.1 | `signup.tsx`, `login.tsx` | Tournament context retained through safe return target; signup/login tests |
| PE26.1 | `verify.tsx`, `resetPassword.tsx` | Verified outcome headings follow token result; recovery tests |
| PE37.1 | `partner.tsx` | Invalid/expired invitation heading and recovery action; partner tests |
| PE39.1 | `receipt.tsx`, `receipt.js` | Loading and settled sign-in-required copy separated; route/script tests |
| PE39.2 | `receipt.tsx`, `receipt.js` | One gate explanation and continuation action; route/script tests |
| PE39.3 | `receipt.tsx`, `receipt.js` | Exact copyable full reference; receipt script/route tests |

## Verification

Passed:

- `npm run typecheck` in `apps/entrant`.
- `npm run test:run -- --reporter=dot tests/schedule.test.ts tests/draw.render.test.ts tests/regulations.unit.test.ts` (22 tests).
- `.venv/bin/pytest -q tests/backend/test_public_schedule_api.py` (11 tests, including live bracket court projection and conflict/precedence branches).

The backend schedule test covers publication gating, privacy allowlisting,
filters, pagination, ETag invalidation, Operations-owned court assignment, and
live/upcoming/completed ordering before pagination. The fresh runtime capture
at the original book viewports is
`docs/screenshots/ui-review/remediation-2026-09-06/public-final-v2.html` with
39/39 surfaces complete and HTTP 200. The focused browser harness covers
390px/360px and 200% text zoom. External email delivery, payment, and a full
assistive-technology audit remain outside local verification.

### Complete finding register with source metadata

The machine-readable 34-entry disposition register is
`docs/audits/surface-book-remediation/evidence/public-dispositions.json`.

`Implemented` below means code and focused verification exist; `native final
capture pending` remains where integration owns the final post-API-restart
visual pass. Initial severity is retained for comparison; remaining severity is
shown after the semicolon.

| ID | Source p. / review p. | Initial severity | Disposition, actual boundary, remaining severity |
| --- | ---: | ---: | --- |
| PE01.1 | 3 / 211 | 2 | Implemented — SeasonCalendar/HeroHeader/tournament; native final capture pending; 0 |
| PE01.2 | 3 / 199 | 2 | Implemented — discovery; render tests; 0 |
| PE01.3 | 3 / 212 | 1 | Implemented — PlayShell/SegmentedNav; visual final capture pending; 0 |
| PE02.1 | 12 / 202 | 2 | Implemented — discovery completed view; render test; 0 |
| PE03.1 | 21 / 200 | 2 | Implemented — format/tournament/schedule timezone formatting; boundary tests; 0 |
| PE03.2 | 21 / 203 | 2 | Implemented — EventRow/tournament count scopes; component tests; 0 |
| PE03.3 | 21 / 203 | 2 | Implemented — tournament overview no repeated hero facts; native v2 inspection, final post-shell capture pending; 0 |
| PE03.4 | 21 / 204 | 2 | Implemented — tournament fee state/link; render tests; 0 |
| PE04.1 | 25 / 204 | 2 | Implemented — EventRow units/actions; native Events inspection; 0 |
| PE04.2 | 25 / 200 | 2 | Implemented — EventRow event/round labels; component tests; 0 |
| PE04.3 | 25 / 205 | 2 | Implemented — zero-round EventRow state; regression test; 0 |
| PE05.1 | 30 / 205 | 2 | Implemented — EntrantsList/PlayersList group sizing; render tests, final visual pending; 0 |
| PE05.2 | 29 / 201 | 2 | Implemented — directory event expansion; render tests; 0 |
| PE09.1 | 69 / 197 | 3 | Implemented — entries_site global ordering and schedule; API/browser tests; 0 |
| PE09.2 | 69 / 206 | 2 | Implemented — entries_site live Operations court projection + MatchCard wording; backend 11-test suite; 0 |
| PE09.3 | 66 / 206 | 2 | Implemented — schedule mobile disclosure; 390/360 browser harness and live capture; 0 |
| PE10.1 | 72 / 197 | 3 | Implemented pending recapture — bracket rows now use intrinsic auto rows so long partner names cannot overlap the next border; geometry suite 4/4; 0 |
| PE10.2 | 74 / 207 | 2 | Implemented — draw wide-bracket guidance and Round/List; geometry suite; 0 |
| PE10.3 | 72 / 212 | 1 | Implemented — draw compact view links; render test; 0 |
| PE12.1 | 81 / 198 | 3 | Implemented pending recapture — MatchCard highlights by permitted display name when public identity ID is unavailable; firsthand `/tmp/public-flow-check-selected.json`; 0 |
| PE13.1 | 85 / 207 | 2 | Implemented — MatchCard date/date-confirmation and timezone; draw tests; 0 |
| PE13.2 | 85 / 208 | 2 | Implemented — draw/MatchCard grouped boundaries; render/geometry tests; 0 |
| PE15.1 | 101 / 198 | 3 | Implemented — regulations wrapping; browser 390/360/200% harness; 0 |
| PE15.2 | 100 / 213 | 1 | Implemented — regulations single-section navigation; route tests/harness; 0 |
| PE16.1 | 103 / 201 | 2 | Implemented — enter lifecycle headings; render tests; 0 |
| PE19.1 | 109 / 211 | 1 | Implemented — login/signup account-entry copy; 54 auth tests; 0 |
| PE22.1 | 115 / 199 | 3 | Implemented — login signed-in continuation/switch branch; login tests; 0 |
| PE23.1 | 117 / 208 | 2 | Implemented — signup provider-success copy; focused tests; external provider delivery unverified, 1 |
| PE24.1 | 121 / 209 | 2 | Implemented — signup/login safe tournament return; focused tests; 0 |
| PE26.1 | 127 / 213 | 1 | Implemented — verify/reset outcome headings; recovery tests; token delivery boundary, 1 |
| PE37.1 | 149 / 209 | 2 | Implemented — partner invalid heading/recovery; focused tests; external invitation delivery unverified, 1 |
| PE39.1 | 153 / 202 | 2 | Implemented pending recapture — removed duplicate SSR noscript gate; client script owns settled loading/sign-in state; 0 |
| PE39.2 | 153 / 210 | 2 | Implemented pending recapture — one client-rendered gate action remains; 0 |
| PE39.3 | 154 / 210 | 2 | Implemented — receipt exact copyable reference; route/script tests; 0 |
