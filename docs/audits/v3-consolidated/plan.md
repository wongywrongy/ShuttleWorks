# ShuttleWorks v3 — consolidated UI/UX and copy plan

6 September 2026 · Proposed delivery plan · No product changes made

**Recommendation:** adopt the second pass’s system-level approach and the MatchCard family, with the corrections below. Deliver truthful operational state and readable foundations first; use a corrected component contract to repair match presentation; then complete the surface and copy sweep. Do not postpone consequential defects until every visual token is polished.

This plan reconciles the original 87-finding audit, `shuttleworks-v3-second-pass-review.md` (§§1–8), and the HTML mockup (sections A–D and CSS). The mockup was inspected as source, not verified as a rendered, interactive product. Measurements in the second pass remain that reviewer’s raster-derived measurements, not newly verified production CSS values.

## 1. Easy delivery checklist

All boxes start open. Check a row only after its acceptance evidence is recorded. **P0** blocks release of the affected flow; **P1** is required for the v3 UX completion milestone; **P2** is polish incorporated when touching the surface. Priority here is delivery priority, not a reassignment of audit severity. Owners are proposed roles, not assigned people.

| Done | ID | Priority | Work package | Depends on | Acceptance / done when | Lead |
|---|---|---|---|---|---|---|
| ☐ | 01 | P0 | Establish one reproducible tournament fixture | — | Clock, publication, permissions, entries and court state are known; both apps can show the same fixture | Engineering + QA |
| ☐ | 02 | P0 | Define match, schedule, identity and time contracts | 01 | State meanings and missing-data rules are documented; names, outcomes and timestamps have one authoritative source | Engineering + Product |
| ☐ | 03 | P0 | Repair conflict recovery and live counts | 01–02 | Conflicts open actionable assignments; disputed courts never count as verified free or occupied; recovery works offline | Engineering |
| ☐ | 04 | P0 | Repair public court and schedule projection | 02–03 | Approved times/courts reach public views; unknowns never acquire placeholder times or false “Scheduled” status | Engineering |
| ☐ | 05 | P0 | Remove consequential false claims | 01 | Staff privacy, tool disabling, local saves and email confirmation describe actual behavior; unknown consequences remain blocked for verification | Product + Engineering |
| ☐ | 06 | P0 | Fix contrast and text hierarchy | 01 | Computed colors and opacity are checked; active small text passes contrast; player names use primary ink | Frontend + Design |
| ☐ | 07 | P1 | Consolidate typography, spacing and visual states | 06 | Caption floor and density variants work without clipping; routine status decoration is removed; exceptions remain clear | Design + Frontend |
| ☐ | 08 | P1 | Standardize controls and form states | 01, 07 | Native semantics remain accessible; labels, dirty/clean/saving/error states and touch targets behave consistently | Frontend |
| ☐ | 09 | P0 | Correct the MatchCard specification and mockup | 02, 06–07 | All specification conflicts in §3 are resolved; long-name, live and exceptional fixtures are included | Design + Frontend |
| ☐ | 10 | P0 | Repair operator match rows and bracket geometry | 09 | Sides and game scores align; pairs never collide; winner and game result are unambiguous | Frontend |
| ☐ | 11 | P0 | Repair public match, round and bracket views | 04, 09 | Singles/doubles are readable on mobile; rounds are reachable; full names recoverable; no misleading score/time placeholders | Frontend |
| ☐ | 12 | P1 | Finish hub, overview, Plan and Live day hierarchy | 03, 07, 10 | Tournament names lead; on-court, next and unscheduled lists mean what they say; primary actions match prerequisites | Design + Frontend |
| ☐ | 13 | P1 | Finish tournament setup | 05, 08 | Dates, courts, capacities, scoring, entry instructions and public information are clear and actionable | Product + Frontend |
| ☐ | 14 | P1 | Finish roster, draw index and empty states | 08, 10 | Sorting is visible; counts have units; row navigation works by keyboard; empty inventories offer a valid next action | Frontend |
| ☐ | 15 | P0 | Verify publication and entrant privacy | 01, 04–05 | Same-fixture audience/content settings control public output; restricted personal data stays absent | Engineering + QA |
| ☐ | 16 | P1 | Simplify venue-board publishing | 15 | One board name, usable fullscreen preview and clear copy/replace-link consequences; tiny preview removed | Frontend |
| ☐ | 17 | P1 | Build and validate signage density | 03–04, 09, 16 | Court, names, time and authorized scores read at the intended distance; conflict/stale states are truthful | Design + QA |
| ☐ | 18 | P1 | Finish account, team, tools and settings | 05, 08 | Locked forms show a useful action; invitation mode matches content; tool and archive/delete effects are explicit | Frontend + Engineering |
| ☐ | 19 | P0 | Make backup, restore and sync decisions safe to understand | 02, 05 | Local/cloud state is truthful; recovery points are distinguishable; restore consequence and offline recovery are verified | Engineering + Product |
| ☐ | 20 | P1 | Make activity history readable | 02, 19 | Entries say what changed and when; diagnostics remain available; retention copy matches actual lifetime | Frontend |
| ☐ | 21 | P1 | Simplify public discovery, overview and directory | 06–07, 15 | One live action; meaningful counts; clear names/events; search promises match behavior; no repetitive filler | Design + Frontend |
| ☐ | 22 | P1 | Finish regulations and closed-entry pages | 02, 05 | Document controls have clear labels; organizer rules are confirmed; closed entries do not imply reopening or wrong auth state | Product + Frontend |
| ☐ | 23 | P0 | Verify account, confirmation and reset journeys | 05, 08 | Valid/error/expired/resend states work; messages only assert verified outcomes; field errors stay with fields | Engineering + QA |
| ☐ | 24 | P0 | Verify invitations, My entries and receipts | 15, 23 | Acceptance/submission/payment states are distinct; account gates preserve destination; reference design has lookup and access rules | Engineering + QA |
| ☐ | 25 | P1 | Complete the every-string ledger | 02; accompanies 05–24 | Every visible and accessible string has keep/change/cut/conditional verdict, owner, approved wording and state evidence | Content + QA |
| ☐ | 26 | P1 | Complete accessibility and responsive checks | 08, 10–24 | Keyboard, focus, zoom, names, errors and mobile targets work; console tested from 1024 px upward | QA + Frontend |
| ☐ | 27 | P0 | Close evidence gaps and recapture | 03–26 | Previously missing successful journeys captured; original IDs link to before/after evidence; no unresolved P0 in affected release | QA |
| ☐ | 28 | P2 | Finish small consistency and brand-seam cleanup | 07, 25 | Separators, icons, casing, borders and lockup ownership are consistent; pending rename stays deferred | Design + Frontend |

## 2. Delivery sequence and gates

**Phase A — truth and foundations (01–08).** Freeze a usable test fixture and establish semantic contracts. Start contrast repair immediately alongside conflict/projection work. Correct harmful copy as soon as behavior is known. A token change does not close a data defect, and a wording change does not prove the underlying action safe.

**Gate A:** counts, assignments, published times, privacy and consequential messages agree on one fixture. Computed contrast is verified. Unknown behavior has a named verification task.

**Phase B — match family (09–11).** Correct the supplied mockup, then implement shared identity/side/score primitives and context-specific renderers. Start with the operator result inventory and public doubles Round view: these expose score association and name capacity early. Then integrate the bracket and schedule. Do not mark the family complete after only its attractive completed-state examples work.

**Gate B:** singles, doubles, incomplete pair, unresolved predecessor, no scores, live game, completed match and supported exceptional outcomes all render correctly. Long names remain identifiable at the supported widths and text zoom.

**Phase C — complete journeys (12–24).** Apply the family and foundations across the existing surfaces. The text ledger runs continuously. Give publication, recovery and account state work the engineering attention it needs; those are not a last-minute “copy-only” batch.

**Gate C:** an operator can configure, publish, run, recover and review a tournament; a public visitor can find a match and an entrant can complete the supported account/entry journey. Display never performs operational resolution.

**Phase D — evidence and closure (25–28).** Finish string coverage, targeted accessibility checks and matched captures. Close findings individually; record superseded treatments and justified no-change decisions. Minor polish can travel with earlier packages rather than creating a separate redesign release.

No calendar estimate is asserted: repository structure, current workstream status and backend contracts have not been inspected. Use the review’s L/M/H as initial sizing only; re-estimate contracts, MatchCard integration, restore and account flows after Phase A. Named SP workstreams in the second pass are candidate routing labels, not verified active tickets.

## 3. Decisions on the recommendations

| Recommendation | Decision | Final treatment |
|---|---|---|
| System fixes before per-screen symptoms | Adopt with priority adjustment | Run foundations alongside P0 truth/recovery fixes. Avoid a serial token-first queue that delays operational blockers. |
| X1: delete the two failing color values | Adopt outcome, verify mechanism | Inspect computed foreground/background and opacity. A faded accent may be the source. Remove the failing treatment rather than relying only on a hex search. |
| X2: public names in primary ink | Adopt | All resolved names use primary ink, including the losing side. Winner uses weight plus a meaningful mark. Muted ink is for metadata. |
| X3/X7: remove tiny tracked labels | Adopt | 12 px minimum caption starting point; 13–14 px dense console body, 14–15 px public names. These are product targets, not claims of WCAG font-size requirements. |
| X4: replace native form controls | Adapt | Style shared controls while preserving native input behavior where useful. Native appearance alone is not a functional defect. Do not build custom date/select widgets solely for cosmetic uniformity. |
| X5: one five-word status vocabulary | Adapt | Share domain-specific formatters, not one enum spanning lifecycle, match readiness, scheduling and connectivity. “Time to be confirmed” is scheduling information, not the whole match state. |
| X6: three date styles; ISO never renders | Adapt | One locale/timezone-aware formatter with explicit named contexts, including year, deadlines, clock and diagnostic detail. No raw ISO in ordinary prose; machine attributes, exports and diagnostics may retain ISO. |
| X8: one fixed 36/52 row; §7 uses 40/48 | Resolve before implementation | Use 40/48 px as initial operator match-row minimums, 36 px roster minimum, with expansion at zoom. Shared side/ledger rules matter more than identical heights across unrelated contexts. Public cards and signage use their own density. |
| X9: fill every hairline-marked element | Adapt | A selected search result gets a clear filled highlight. Remove a decorative live-stat rule. A notice is not automatically a selection and does not need an extra filled box. |
| X12: gray Save means disabled; hide until dirty | Verify and adapt | Inspect actual state. Use one actionable primary treatment; stable Save placement with a clear disabled/saving state is acceptable. Hide locked-form Save; show Discard only for changes. Do not infer disabled behavior from gray pixels. |
| X16: remove all values that do not vary | Adapt | Remove redundant reassurance; retain stable headers, useful counts and discoverable controls. Do not hide a column merely because one filter result happens to be empty. Completed checklist items remain reachable. |
| Remove the tiny board preview instead of widening it | Adopt | Supersedes the treatment in V3-OC22.1. Use an explicit “Preview fullscreen” action; test board configuration and return path. |
| Dot + aria-label alone for hub health | Adapt | Omit routine health dots; retain visible exception text. Accessible names alone do not explain colored dots to sighted users. |
| Switch because selected Off is blue | Optional refinement | A selected Off option can correctly use selection color. Choose a switch for immediate binary behavior, not because blue universally means enabled. |
| Entire-row links; menus only on hover | Adapt | Preserve real links/buttons, keyboard focus and touch access. Hover reveal is optional polish, never the only route to actions. |
| One MatchCard component with identical DOM everywhere | Adapt | One data contract and shared person/side/ledger primitives, with semantic table, card, bracket and signage renderers. The supplied HTML already uses different DOM structures. |
| Per-game winner = higher current score | Correct | Higher live score is a lead, not a won game. Derive the winner only after game completion under configured rules; use authoritative match outcome for retirement/walkover and other supported outcomes. |
| Ellipsis + title, never wrap | Adapt | Stable stacked partners at normal density; keyboard/touch-accessible full-name detail is required. Public detail/zoom may grow. The HTML claims title tooltips but its name elements do not include them. |
| Collapse empty score cells | Adopt fully | Remove empty ledger width, padding, rule and mark when no scores/outcome need them. The supplied TBC card still reserves an invisible mark/ledger; empty bracket ledgers retain styling. |
| Match state “Live” vs “On court” | Resolve | Use “On court” for a match state; “Live now” may describe a section. Public schedule state is separately “Scheduled” or “Time to be confirmed.” No screen-local synonym list. |
| Remove “vs” everywhere | Adapt | Remove it where stacked sides and scores make opposition obvious. Keep “vs” or an equivalent accessible phrase in inline summaries. The board’s Next example needs explicit sides; two stacked names could otherwise read as one doubles pair. |
| Public bracket names at 12 px | Reject as final target | Contradicts the second pass’s own legibility fix. Begin at 14 px, enlarge nodes/canvas, and default mobile to Round view. Never shrink all names just to fit five rounds. |
| Board names at 30 px, “signage scale” | Reject as validation | The review separately proposes ≥48 px names/28 px courts/40 px clock. Use those as initial signage targets, then validate actual screen and distance. The mockup remains a desk-scale example. |
| Board scores always present | Conditional | Display may project authorized recorded scores. Verify publication and data availability first; absent scores are not zero. Do not invent scoring capability from the mockup. |
| Board conflict copy says “wait for next announcement” | Adapt | Use “Court assignment unavailable.” Add an announcement instruction only if that is a confirmed venue process. Never claim staff are already resolving it. |
| Replace Deuce with “Setting … cap 30” | Adapt | Prefer plain “Win by 2” with the actual configured cap. Do not hardcode a cap while formats offer different scoring configurations; confirm rules with product/organizer. |
| Enable import / say courts editable in Plan / promise all details editable later | Verify | These are capability claims. Do not enable unfinished import or direct users to an editor that cannot make that change. |
| Short entry reference | Adopt conditionally | Design generation, uniqueness, lookup and authorization together. Copy the same user-visible reference; an identifier is never access permission. |
| Rename and unified wordmark | Defer rename | Maintain one ownership seam; no new brand direction in this work. |

### MatchCard corrections required before approval

The HTML is a useful composition reference, but not an acceptance oracle. In addition to the decisions above:

- `.p` defaults to muted ink; only winners switch to primary ink. Correct both sides.
- Live cards lack the per-game bold styling promised by the notes; completed losing sides can also win individual games. Derive per-game presentation independently of match winner.
- A match-winner tick must be absent during an unfinished match and have an accessible meaning when present.
- The sample repeats the tournament name even though §7.2 says to omit repeated context. Remove it within tournament-scoped views.
- `Completed · 0:42` is ambiguous. Use “42 min” only when duration is known and useful.
- Demo weekdays/dates must be generated from timestamps. The sample “Sat 5 Aug” and “Sun 6 Aug” do not match its 2026 context.
- The bracket uses a fixed 236 + 40 + 236 px grid with no local mobile adaptation. Specify an actual narrow-screen mode.
- Bracket progression needs two feeder connections and a destination relationship, not simply one decorative horizontal rule.
- An incomplete doubles side and a future winner are not ordinary PersonRef arrays. Model unresolved sides explicitly; do not invent a person to fill a slot.
- Keep match identity/event context on board and compact variants where necessary to distinguish similarly named participants.

## 4. Text must behave like website text

**Every string needs a job:** identify something, enable a decision/action, explain a necessary condition, or report a verified outcome. Keep helpful content; cut repeated narration of the interface.

The second pass’s “Every string” tables become the input ledger, not an automatic bulk replacement script. Include the original audit’s alternatives and use the decisions in §3 to resolve conflicts. Existing visible-string reviews do not cover unseen interaction states.

| Text area | Rule | Example / acceptance |
|---|---|---|
| Page titles and navigation | One clear destination name; sentence case; match linked destination | “Tournament details”; “Venue board”; preserve a useful page title even when a count is zero |
| Buttons and links | Verb + object when needed; promise the actual result | “Review assignments”, “Open match”, “Resend email”; label format-bearing downloads when useful |
| Field labels | Persistent label; familiar domain language; units where needed | “Minimum rest between matches”; “32 pairs” versus “32 players” |
| Helpers | Only decision-relevant detail, next to the affected control | A public-change consequence next to Save; no repeated downstream architecture block |
| Status | Describe one domain fact; no routine badge or reassurance | “Completed”; “Waiting for a court”; keep entry status separate from match state |
| Dates and numbers | Format centrally; show timezone/year when interpretation needs them | A deadline includes date, time and zone; a count has a noun; avoid relative-only “15d” |
| People and matches | Names first; one participant per line within a pair; stable sides | No slash-assembled pair labels, flags or unsolicited profile imagery |
| Empty states | One explanation and a usable next step | Empty matches route to roster when roster is empty; generate only when prerequisites exist |
| Errors | Say what failed and how to recover; preserve input | Field validation is adjacent and associated; page failure has a relevant retry action |
| Success | Only verified completed outcomes | “Email confirmed.” Never infer entry submission, approval or payment from account confirmation |
| Destructive/recovery copy | State what changes, what is retained, and whether reversible | Restore identifies the snapshot and replacement consequence; tool disabling uses verified behavior |
| Accessibility text | Names describe action and target; status updates remain understandable without color | “Open match R32·1”; game scores identify side and game; winner mark has text equivalent |
| Organizer content | Preserve facts; edit system chrome separately | Confirm reporting-time rule; do not silently rewrite regulations or announce future entry windows |
| Hidden/interactive copy | Review loading, focus, validation, success, empty and permission states | Tooltips, menu items, screen-reader labels, resend cooldowns and reconnect messages enter the ledger |

**Ledger columns:** string key · route/surface · state · current text · keep/change/cut/conditional · final text · factual prerequisite · owner · original finding IDs · checked evidence. Shared chrome gets one entry with a usage list; organizer-authored body text is checked as content, not globally replaced.

Completion means zero unreviewed string keys in the audited scope, no unresolved consequential copy prerequisites, and no new string introduced by a fix without a verdict. Do not equate a shorter page with a successful edit if it removes information people need.

## 5. State and formatting contract

| Domain | Proposed contract |
|---|---|
| Tournament lifecycle | Maintain actual supported stages. Decide labels such as “Entries open”, “Configured”, “Live”, “Completed” without renaming backend meaning blindly. |
| Match readiness/play | Distinguish pending prerequisites, ready, called, on court and completed. Keep supported exceptional outcomes explicit. |
| Schedule | Assigned/approved timestamp and court are separate fields; truthful partial states are allowed. A pending participant can still have a genuinely approved slot. |
| Conflicts | A disputed court is neither safely free nor a verified single current match. Operator recovery identifies competing assignments and records the chosen resolution. |
| Score | Distinguish unplayed, zero recorded points, game in progress, game complete, match complete and supported special outcomes. |
| Identity | Shared person identity formatter; structured sides; stable match references; no reconstruction from slash-separated strings. |
| Time | Store/interpret according to existing domain rules; render in tournament timezone. Browser locale date order alone does not prove a timezone bug. Test round-trip editing and midnight boundaries. |
| Connectivity | Separate saved on this device, syncing, synced and needs attention. Never imply cloud durability from local acknowledgement. |
| Public visibility | Public serialization respects audience/content toggles and allowed person fields. Board projection follows its defined visibility rules. |

## 6. Verification matrix

These are meaningful behavior checks, not tests that simply assert the implementation’s chosen CSS spelling.

| Check | Cases | Required evidence |
|---|---|---|
| Operational truth | Two current assignments on one court; manual resolution; reconnect | Counts and all projections agree after the same event; no automatic operational decision |
| Scheduling | Approved slot; time missing; court missing; unresolved predecessor | Correct state/time/court on Plan, public Schedule, Round and board |
| Match layout | Singles; doubles; unequal/long names; incomplete pair; 1/3/5-game configurations where supported | No overlap; full-name access; aligned games; clear side association |
| Match outcome | Side A/B win; losing side wins a game; unfinished game lead; supported walkover/retirement | Correct game and match emphasis; no premature winner tick |
| Public permissions | Entrants off/on; results off/on; signed-out and authorized sessions | Same-fixture publication assertions; no restricted contact fields |
| Recovery | Offline change; failed sync; multiple backup points; restore | Distinguishable recovery point and clear consequence; confirmed recovery outcome |
| Account journeys | Sign-up; valid/expired confirmation; resend; valid reset; weak password; accepted/unavailable invitation | Actual successful and failed destinations, preserved context, truthful notices |
| Copy | Every ledger key, plural count, missing value, long title | Approved wording in the correct state; no speculative success claims |
| Accessibility | Keyboard, focus visibility, text zoom, labels, errors, contrast, touch | Operable actions and recoverable content; no color-only essential meaning |
| Responsive/signage | Console 1024/1440; public 320/390/768/1440; intended board screen/distance | Usable task at each relevant width; bracket scroll is deliberate; signage judged physically |

**Corrections to proposed negative controls:** `#5C6370` passes ordinary text contrast on the cited white background, so a contrast test must not be required to fail simply because a name uses it. Test hierarchy tokens separately from contrast. A CSS hex grep cannot detect opacity/compositing failures. Fixed `offsetHeight` assertions must not prevent text zoom. Test equivalent semantic outcomes across variants, not identical DOM or a prohibition on event-type branches. Test game completion, not merely which score is larger.

For accessibility acceptance, ordinary text normally needs at least 4.5:1 contrast; assess actual styles/backgrounds rather than treating all raster samples as production tokens. WCAG 2.2 AA’s minimum pointer target criterion is 24×24 CSS px with defined exceptions; 44 px is our proposed comfortable public-control target, not the AA minimum. APCA observations can inform design judgment but are not the WCAG 2.2 pass/fail gate. Sources: [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## 7. Coverage and closure rules

Original `V3-` IDs remain unchanged. Second-pass `V3B-` IDs remain separate; prefix cross-cutting items as `V3B-X1` etc. Duplicates share a delivery package but remain traceable. Agreement between reviewers does not convert fixture drift or unseen behavior into a proven defect. No findings are closed by this planning document.

Cross-cutting routing: X1/X2 → 06; X3/X7/X9/X11/X13 → 07; X4/X12 → 08; X5/X6/X17 → 02 (applied through surfaces); X8 → 09–11/14; X10 → 13/25; X14 → 28; X15 → 09/25; X16 → 12/14/19–21. MatchCard §7 → 09–11/17.

The inventory below maps all 72 declared original surfaces to work packages, including routes whose intended successful state was not captured. Package 25 (every-string ledger), 26 (accessibility) and 27 (evidence closure) apply to every row. Source second-pass surface sections travel with their corresponding row; absence of a second-pass section never removes an original surface from scope.

| Surface | Captured result | Packages | Original findings |
|---|---|---|---|
| OC01 | Workspaces shown; sign-in not reached | 18, 23 | Evidence/state coverage |
| OC02 | Workspace hub | 12 | V3-OC02.1, V3-OC02.2 |
| OC03 | Create workspace: first step only | 13 | V3-OC03.1 |
| OC04 | Local profile | 18 | V3-OC04.1 |
| OC05 | Tournament overview | 03, 12 | V3-OC05.1 |
| OC06 | Tournament details | 13 | V3-OC06.1 |
| OC07 | Dates and sessions | 13 | V3-OC07.1, V3-OC07.2, V3-OC07.3 |
| OC08 | Venue and courts, protected state | 13 | V3-OC08.1 |
| OC09 | Event catalog | 13 | V3-OC09.1 |
| OC10 | Formats and scoring | 13 | V3-OC10.1 |
| OC11 | Entry rules | 13 | V3-OC11.1 |
| OC12 | Private staff contacts | 05, 13, 15 | V3-OC12.1 |
| OC13 | Public information editor | 13, 15 | V3-OC13.1, V3-OC13.2 |
| OC14 | Populated player roster | 14 | V3-OC14.1 |
| OC15 | Draw index | 14 | V3-OC15.1 |
| OC16 | Draw canvas | 10 | V3-OC16.1, V3-OC16.2 |
| OC17 | Match inventory | 10 | V3-OC17.1 |
| OC18 | Scheduling plan | 03, 12 | V3-OC18.1, V3-OC18.2 |
| OC19 | Live day with court conflicts | 03, 12 | V3-OC19.1, V3-OC19.2 |
| OC20 | Publication audience and content | 15 | V3-OC20.1 |
| OC21 | Same Site page as S20 | 15 | Evidence/state coverage |
| OC22 | Venue display configuration | 16 | V3-OC22.1, V3-OC22.2 |
| OC23 | Same Displays page as S22 | 16 | Evidence/state coverage |
| OC24 | Venue board with conflict projection | 17 | V3-OC24.1, V3-OC24.2 |
| OC25 | Team access | 18 | V3-OC25.1 |
| OC26 | Tool availability and data consequences | 05, 18 | V3-OC26.1 |
| OC27 | Backups and pending sync | 19 | V3-OC27.1, V3-OC27.2 |
| OC28 | Activity log | 20 | V3-OC28.1 |
| OC29 | Workspace settings | 18 | V3-OC29.1 |
| OC30 | Entries unavailable | 14, 18 | V3-OC30.1 |
| OC31 | Readiness checklist; not an unavailable-configuration guard | 13 | V3-OC31.1 |
| OC32 | Empty school roster; not an unavailable-roster guard | 14 | V3-OC32.1 |
| OC33 | Empty match inventory; not an unavailable-matches guard | 14 | V3-OC33.1 |
| PE01 | Tournament discovery | 21 | V3-PE01.1, V3-PE01.2, V3-PE01.3 |
| PE02 | Completed tournament archive | 21 | V3-PE02.1 |
| PE03 | Tournament overview | 21 | V3-PE03.1, V3-PE03.2, V3-PE03.3 |
| PE04 | Draw index reached from Events | 14, 21 | V3-PE04.1, V3-PE04.2, V3-PE04.3 |
| PE05 | Published player directory | 21 | V3-PE05.1, V3-PE05.2 |
| PE06 | Draw index | 21 | Evidence/state coverage |
| PE07 | Draw index shown; seeded-entry view not reached | 14, 21 | Evidence/state coverage |
| PE08 | Draw index shown; winners view not reached | 14, 21 | Evidence/state coverage |
| PE09 | Schedule and live matches | 04, 11 | V3-PE09.1, V3-PE09.2, V3-PE09.3, V3-PE09.4 |
| PE10 | Singles bracket | 11 | V3-PE10.1, V3-PE10.2 |
| PE11 | Singles round view | 04, 11 | V3-PE11.1 |
| PE12 | Singles search-highlight state | 11 | V3-PE12.1 |
| PE13 | Singles match list | 11 | V3-PE13.1 |
| PE14 | Doubles bracket | 11 | V3-PE14.1 |
| PE15 | Regulations reader | 22 | V3-PE15.1, V3-PE15.2 |
| PE16 | Entries closed; entry form not reached | 22, 24 | V3-PE16.1, V3-PE16.2 |
| PE17 | Entries closed; signed-in entry outcome not established | 22, 24 | Evidence/state coverage |
| PE18 | Entries closed; account-created entry outcome not established | 22, 24 | Evidence/state coverage |
| PE19 | Sign-in form | 23 | V3-PE19.1 |
| PE20 | Account-created notice on sign-in | 23 | V3-PE20.1 |
| PE21 | Sign-in error notice | 23 | V3-PE21.1 |
| PE22 | Sign-in form shown; authenticated outcome not reached | 23 | V3-PE22.1 |
| PE23 | Account creation with test verification widget | 23 | V3-PE23.1, V3-PE23.2 |
| PE24 | Tournament-specific account creation | 23 | V3-PE24.1 |
| PE25 | Email confirmation instructions | 23 | V3-PE25.1 |
| PE26 | Email-confirmed notice | 23 | V3-PE26.1 |
| PE27 | Invalid confirmation notice | 23 | V3-PE27.1 |
| PE28 | Confirmation-email-sent notice | 23 | V3-PE28.1 |
| PE29 | Password-reset request | 23 | V3-PE29.1 |
| PE30 | Reset request shown; valid-token new-password form not reached | 23 | Evidence/state coverage |
| PE31 | Reset-email-sent notice | 23 | V3-PE31.1 |
| PE32 | Password-updated notice | 23 | V3-PE32.1 |
| PE33 | Invalid reset-link notice | 23 | V3-PE33.1 |
| PE34 | New-password validation error | 23 | V3-PE34.1 |
| PE35 | Invitation unavailable; valid invitation not reached | 24 | V3-PE35.1 |
| PE36 | Unverified partner result; acceptance not established | 24 | V3-PE36.1 |
| PE37 | Partner invitation failure | 24 | V3-PE37.1 |
| PE38 | Signed-out My entries | 24 | V3-PE38.1 |
| PE39 | Signed-out receipt gate with placeholder reference | 24 | V3-PE39.1 |

### Evidence that must still be obtained

Operator sign-in [decision by Kyle, 2026-09-06: under `AUTH_MODE=local` (the canonical fixture's mode) there is no sign-in boundary by design — credential-less requests resolve straight to the zero-UUID bootstrap operator (CLAUDE.md) — so a UI-form capture cannot exist here; cloud-mode credential auth is already evidenced at the API level by `console-browser-contracts.spec.ts`'s viewer login, and a UI-form capture is owed only if a cloud-mode fixture is ever built]; remaining create-workspace steps and successful creation; account security/session actions; actual tool/guard behavior; open entry form and submission; authenticated My entries and receipt; valid password-reset form; valid invitation acceptance. Recapture route outcomes rather than manufacturing separate pages to match stale surface titles. Public seeded/winners routes that resolve to the draw index need routing/intent verification, not an assumed new-screen build.

### Closure record

For each finding: original ID → package → adopted treatment (or superseded / verified no defect) → implementation reference → fixture + viewport → before/after evidence → acceptance result → remaining limitation. Keep both original observation and revised decision. P0 acceptance must be satisfied before the affected flow ships; P1 acceptance before calling the consolidated v3 UX pass complete.

**First concrete implementation slice:** packages 01–06, followed by 09: establish the shared fixture, repair conflicting live state/public scheduling and consequential claims, validate text contrast, then approve the corrected MatchCard contract. This gives the match-family work reliable data and agreed presentation rules.
