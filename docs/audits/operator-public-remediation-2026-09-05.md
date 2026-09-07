# Operator and public remediation — 2026-09-05

Implementation against the approved plan and the 29 operator / 22 public findings.
Baseline commit: `d387a9d0`; implementation is the working-tree diff. The reviewed
PDFs are source evidence, not captures of this implementation. Existing fixture
counts from different books are not a synchronization test.

## Decisions and ownership

- Setup owns tournament properties; Administration links to the same identity and dates.
- Publish Site owns audience and public content. Public information saves cannot publish.
- EntryPage is the enforced audience authority. New pages are private. Migration retains
  explicit stored intent for enabled pages; enabled pages without that value remain public;
  disabled pages remain private. The existing page-enable gate is preserved.
- Match references, participants, scores, times, and court state retain their domain authority.
- Offline support is unchanged: durable match commands replay; configuration and schedule
  saves require the service; publication, invitations, and recovery operations are not queued.
- Design changes retain the semantic palette, make ordinary surfaces flat, standardize
  property panels and text roles, and preserve accessible contrast in both themes.

## Operator findings

“Implemented” describes code and automated evidence; it does not certify every deployment,
input fixture, or physical venue. Browser evidence is recorded separately below.

| Finding | Treatment and evidence |
| --- | --- |
| OP02.1 | Hub lifecycle is readable text; Plan retains its readable state vocabulary. Hub and Operations tests. |
| OP02.2 | Hub routine completion states use plain text instead of filled pills. |
| OP03.1 | Creation type selects Meet/Bracket/Hybrid once. Engine inclusion is a readout; Display remains independently selectable. Wizard tests. |
| OP05.1 | Existing common match identity formatter retained; canonical names now flow through its consumers. Match identity contracts and match tests. |
| OP06.1 | Timezone suggestions use runtime IANA zones plus UTC; arbitrary valid stored IANA identifiers remain supported. |
| OP07.1 | Dates show the tournament timezone; display/edit conversion uses that timezone, not the workstation. DST gap, fold, and half-hour transition tests. |
| OP08.1 | Read-only Setup summaries no longer describe a save they cannot perform. |
| OP09.1 | Setup event rows open the existing contextual event configuration editor. Domain ownership and locks remain enforced. |
| OP10.1 | Rules distinguish missing format from explicit per-event/mixed format; legacy format/readiness normalization is part of the backend truth check. |
| OP11.1 | Entry rules already exists in capability-gated navigation; retain and test that rule rather than adding a duplicate. |
| OP13.1 | Audience and content share Publish Site with staged edits, explicit save/discard, failure recovery, and enforced API audience. |
| OP14.1 | Meet and Bracket rosters retain tables and selection with Event and Issues filters. |
| OP15.1 | Draw navigation is a quiet action rather than a repeated filled primary button. |
| OP16.1 | Losing names and historical scores remain readable; no strike-through. |
| OP17.1 | Existing named score rails and correction actions retained and exercised by match tests; verify every engine in final captures. |
| OP17.2 | Stored participant name order, casing, and diacritics preserved. No surname inference. Names and doubles-match tests. |
| OP19.1 | Six live courts use a balanced 3×2 layout at 1440px. |
| OP19.2 | Removed duplicate On deck strip; one ordered queue remains. |
| OP20.1 | Setup, Site, and administrative properties share PropertyPanel and a 52rem PageBody form bound. |
| OP21.1 | Removed publication relay navigation; old Draws/results URL redirects to Site. Browser and routing tests. |
| OP23.1 | Link replacement names revocation and retains the confirmation step; remote failure stays visible. |
| OP24.1 | Retained existing per-court current/next grouping, using canonical names and a stable court grid. |
| OP24.2 | Next assignment absence is explicit; an empty current court still reads Court free. Stale/read failures retain separate status. |
| OP25.1 | Email and manually shared invitations are deliberate modes with actual bearer-access semantics. Invitation tests. |
| OP27.1 | Recovery targets expose exact timestamp, origin, size, and filename; exact-target confirmation and safety backup retained. |
| OP28.1 | Activity uses current screen names; underlying target keys remain in technical details. |
| OP29.1 | Removed competing name/date inputs and Save from Workspace settings; links lead to canonical Setup editors. |
| OP30.1 | Module recovery actions name actual Setup/Entries/Displays or Administration Modules destinations. |
| OP31.1 | Removed repeated routine readiness descriptions from checklist rows and duplicate rollup in its toolbar. |

## Public and entrant findings

| Finding | Treatment and evidence |
| --- | --- |
| PU03.1 | Confirmed registrations and draw participants have distinct fields and labels. Component tests. |
| PU03.2 | Header shows date range and tournament timezone; schedule freshness uses that same timezone. |
| PU03.3 | Existing structured venue name/address rendering retained; imported-note quality needs representative fixture review. |
| PU04.1 | Existing event/discipline/round formatters retained across public routes. |
| PU06.1 | Existing explicit draw links retained; no new Draws self-action introduced. |
| PU09.1 | Freshness formats an actual instant for readers instead of raw ISO. SSR tests. |
| PU09.2 | Schedule and draw cards explicitly distinguish missing time and court assignment. |
| PU09.3 | Reduced mobile schedule heading/filter spacing while keeping accessible controls. |
| PU10.1 | Bracket scroll stays inside a labeled horizontal region; Round/List layouts reflow. Geometry browser suite. |
| PU12.1 | Player search announces positive/zero result counts through a live region. Filter tests. |
| PU14.1 | Person groups retain both doubles partners and canonical names. Long-name mobile rendering needs browser verification. |
| PU15.1 | Existing bounded regulations shell retained; long-content overflow is part of mobile verification. |
| PU17.1 | Closed registration removes the entire active entry journey, stepper, account handoff, and submit-specific controls. SSR regression test. |
| PU19.1 | Public shared card and native-control styles match the revised flat surface/spacing contract; JS style twins updated. |
| PU22.1 | Existing validated auth return destinations retained and regression-tested. |
| PU23.1 | Existing conditional human-check help retained; production challenge/provider interaction remains a live verification item. |
| PU24.1 | Existing tournament and invitation signup context retained. |
| PU26.1 | Receipt and invitation headings now depend on authorized outcomes rather than URL state. |
| PU36.1 | Accepted partner details resolve an exact entry ID through authenticated My Entries and display real tournament/event/partner identities. |
| PU37.1 | Safe form failure reasons distinguish verification, unusable invitation, and retry. Anonymous dead-token uniformity remains. |
| PU39.1 | Receipt starts neutral; only the authorized persisted receipt response establishes success. Unauthorized/missing/error states remain distinct. |

## Verification record

- Shared contrast gates: pass for all checked text/control/surface pairs in light and dark.
- Shared token-shaped class check: pass.
- Populated SQLite migration upgrade/schema-parity/downgrade/re-upgrade: pass.
- Publication endpoint suite: 13 passing, including audience/discovery matrix, conditional
  request revocation, ordinary-content save preservation, and legacy Setup write refusal.
- Final console regression suite: 229 files, 2,033 passing tests.
- Setup/timezone tests: 13 passing, including invalid DST input retention, save prevention,
  workstation independence, dirty-focus preservation, network failure, and discard.
- Canonical console browser suite: 7 passing against an isolated migrated SQLite fixture
  (Taipei six courts/24 queued matches, Korea upcoming, and an API-created viewer). Includes
  staged publication, discard without writes, persisted audience, legacy route redirects,
  and checked-out tournament refusal with draft retention. Inspected captures of the 1440px
  six-court overview and saved publication form in `tests/e2e/test-results/`.
- Entrant regression suites: 462 unit and 411 SSR tests passing; geometry browser suite:
  3 passing, covering mobile reflow and contained bracket scrolling.
- Both production builds pass. Console lint reports no errors (133 warnings).
- Setup backend suite: 13 passing, including Meet-only readiness and configured event capacity.
- Public page, draws, and schedule backend suites: 86 passing.
- Partner backend suite: 23 passing, including native acceptance and failure paths.

## Remaining evidence boundaries

Live physical venue distance, production human-check/email delivery, and real event-node
outage/reconciliation cannot be certified by a desktop fixture. Existing offline architecture
was preserved rather than expanded. No production database or external publication was
modified by this work. Do not mark these operational evidence gaps closed based on static
captures or unit tests. A PostgreSQL production-shaped migration rehearsal remains a release
check when that service is available; the migration uses dialect-aware UUID/JSON handling.
