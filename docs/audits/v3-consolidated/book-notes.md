# V3 book notes — ratings, house rules, and open evidence gaps

Compiled verbatim-ish from `docs/screenshots/ui-review/reviewed-v3/operator-all.md` and
`docs/screenshots/ui-review/reviewed-v3/public-all.md` (both "EDITION 2" review books), plus the closing
evidence-gap list from `shuttleworks-v3-consolidated-plan.md` §7.

Note: both books' cover pages promise "full page coverage, copy changes, flow checks, ratings, and the ranked
register" as part of "the consolidated review." The extracted text in these two `-all.md` files does not contain a
separate flow-check section or a standalone ranked-register table — ratings appear inline per surface (the
`Quality U / C / K` line + severity/effort on each finding), and the "ranked register" and any dedicated "flow
checks" section, if they exist, live in source material not present in these two files. This is flagged as an
ambiguity in the final report.

## Cover / scope and decision

**Operator console book:**
> 70 source pages preserved in order. 40 distinct findings. 15 major, 23 minor, 2 cosmetic.
>
> Prioritize truthful states, direct recovery, and readable tournament language before cosmetic refinement.
> The consolidated review contains full page coverage, copy changes, flow checks, ratings, and the ranked
> register.
>
> Source-only inspection • single-rater • 6 September 2026
>
> The attached v3 book is the only product evidence. Prior context supplies the review rules, not findings.
> The source cover describes live demo data and route captures; no screenshot proves a successful mutation or
> synchronized state.

**Public / entrant site book:**
> 149 source pages preserved in order. 47 distinct findings. 11 major, 28 minor, 8 cosmetic.
>
> (Same "Prioritize truthful states..." and "Source-only inspection..." paragraphs as the operator book.)

## House rules retained (identical in both books)

- Reduction is the design. No decorative pills, badges, or tinted cards for ordinary states.
- Operators decide consequential outcomes; Display only projects Operations state.
- One match/status vocabulary. Preserve participant names and the public privacy boundary.
- Console below 1024 CSS px is not rated. Public mobile captures are in scope.
- No source-code, backend, security, or accessibility compliance claim is made.

## "How to read" (identical in both books)

> Original PDF page numbers remain unchanged. Pins identify a finding's primary evidence. Other pages point to
> the same ID rather than manufacturing additional defects. The right gutter is review material, never
> proposed website copy.
>
> Original screenshot preserved · Recommendations are review notes · Single-rater

## Legend and rating contract (identical in both books)

**Severity scale:**

| Value | Meaning |
|---|---|
| 4 | Catastrophe |
| 3 | Major |
| 2 | Minor |
| 1 | Cosmetic |
| 0 | Not a problem |

**Quality: U / C / K** — Usability from visible task support / clarity / completeness of visible content.
Scale 1–5, higher is better: 1 fragmented; 2 needs standardization; 3 mixed but usable; 4 coherent with limited
refinement; 5 consistently demonstrated across relevant states. K is not feature completeness.

**N/R** — The intended state was not reached, or the viewport is outside scope. Unshown interactions never
receive a positive score.

**Effort** — L: small wording/local change; M: frontend/state work, roughly a day; H: data or cross-surface
work. Estimates are provisional without source inspection.

## Finding identity and evidence boundary (identical in both books)

> Finding identity: V3-OCxx.n or V3-PExx.n. New v3 namespace avoids reusing historical IDs. Each note cites
> one primary rule and one finding. All are open and single-rater; no multi-auditor consensus is claimed.
>
> Evidence boundary: Cropped document continuations are not layout defects. Internal scroll areas and
> horizontal canvases show only their initial position. Query-string outcome notices are not proof of completed
> actions.

## Category codes observed

Each finding carries a short category code (e.g. `H8`, `F2`, `T3`) immediately before its severity/effort line.
Neither book prints a legend translating these codes to names; they are preserved verbatim in `findings.json`
as the `category` field. Codes observed:

- Operator book: C3, F1, F2, H1, H5, H6, H7, H8, H9, H10, I3, P1, P3, T1, T2, T3, T4, V1, V4, V5 (subset also
  reused in the public book).
- Both books share the same code namespace (H-, F-, T-, P-, V-, I-, C- prefixes).

## Cross-cutting review-context paragraphs

**Operator book:** "Operator console, using the demo operator identity. Primary tasks are tournament setup,
participant management, planning, live court control and deliberate publication."

**Public book:** "Public and entrant site, using a fresh signed-out browser. Primary tasks are finding an
event, reading draws and schedules, registering and managing an entry."

**Both books, "State matters":** "these are route captures, not completed journeys. Outcome URLs, missing
invitation tokens and placeholder receipt IDs do not prove a successful action. Redirects, signed-out prompts
and access refusals are evidence of the state actually reached. HTTP 200 alone is not a functional pass."

**Both books, "Design direction":** "preserve readable match identity and stored participant names; use
restrained semantic colour, flat ordinary surfaces, consistent property panels and explicit saved/unsaved
feedback. Backend terms belong in the UI only when they help a user make a decision."

**Both books, "Annotate":** "cite surface ID, viewport and segment, then state the observed problem, affected
task, severity, proposed change and measurable acceptance criterion. Distinguish a visual observation from an
interaction hypothesis."

**Both books, "Further validation":** "keyboard/focus order, screen-reader output, dark theme, form errors,
authenticated entry outcomes, offline recovery and physical venue viewing distance require separate testing.
Internal scroll panels, horizontal canvases and virtualized regions show their initial visible position only.
Document continuations do not scroll these panels."

## Viewports and fixture

- Desktop 1440 × 900 CSS px; mobile 390 × 844 CSS px. Light/default theme; reduced motion.
- Operator workspace: `9a885612-ac98-4fe6-9c98-7f16367cb04a`; public fixture: `2026-korea-masters-t030`.
- Public book uses workspace `a86a39b3-0eb4-4c12-9106-5ff1bd1e5aa2` internally, same public fixture
  `2026-korea-masters-t030`.
- Timing is live demo data, not a frozen cross-surface snapshot (both books make this disclaimer explicitly —
  it is the basis for V3-OC05.1's finding about the Overview/Live-day snapshot mismatch).

## Per-surface "Not demonstrated" notes (evidence still needed, primary-finding pages only)

These lines appear on pages that carry a real, numbered finding, marking what that specific capture did not
exercise. Repeated/duplicate-state pages instead say "Retained for source completeness; not rated" — those are
omitted here since they assert no new evidence gap beyond the desktop finding they reference.

### Operator book

| Surface | Page | Not demonstrated |
|---|---|---|
| OC02 | p.5 | Search, sorting, overflow menu, attention navigation, and empty results were not exercised. |
| OC03 | p.7 | Identity, Venue, Review, validation, cancellation, and successful creation are absent. |
| OC04 | p.9 | Only the local profile state is shown; the other account sections and actual upload are not captured. |
| OC05 | p.11 | Snapshot is not frozen; do not infer state synchronization defects from other captures. |
| OC06 | p.13 | Save, unsaved navigation, validation, and actual public-name propagation are unshown. |
| OC07 | p.15 | Internal panel continuation, date validation, timezone conversion, and session save are not shown. |
| OC08 | p.17 | The lock condition and editing destination are not exercised. |
| OC09 | p.19 | Event editing, eligibility details, and add/manage destination are not shown. |
| OC10 | p.21 | Scoring validation, event overrides, and consequences of changing rules after play are absent. |
| OC11 | p.23 | Enforcement, payment setup, approval transitions, and effects on existing entries are unknown. |
| OC12 | p.25 | Staff publication behavior and private access enforcement are not demonstrated. |
| OC13 | p.27 | Valid asset previews, failed-save handling, and URL changes are unshown. |
| OC14 | p.29 | Only the initial internal roster viewport is captured; 253 individual rows are not all visible. |
| OC15 | p.31 | Draw creation, sorting, and per-row open behavior are not demonstrated. |
| OC16 | p.33 | Only the initial canvas position is captured; finals, zoom, pan, score dialog, and keyboard alternatives are |
| OC17 | p.35 | Only initial table rows are visible. The mobile [object Object] rendering is retained as out-of-scope evidence, not |
| OC18 | p.37 | Scheduling preview, conflicts, drag alternative, saved state, readiness gate, and later internal rows are unshown. |
| OC19 | p.39 | No conflict correction, score entry, queue reordering, or offline recovery sequence is shown. |
| OC20 | p.41 | Dirty, saving, saved, failed, restricted-role, private, and unlisted states are absent. |
| OC22 | p.45 | Preview internal scrolling, link replacement, revocation confirmation, and refresh failure are unshown. |
| OC24 | p.49 | Real viewing distance, refresh behavior, stale/offline state, and whether staff acknowledged conflicts are |
| OC25 | p.53 | Role descriptions are collapsed; actual permission effects, delivery, expiration, acceptance, and revocation are |
| OC26 | p.55 | Disable/enable confirmations and actual data retention are not captured. |
| OC27 | p.57 | Sync completion, rejected-change correction, backup preview, restore confirmation, and restoration outcome |
| OC28 | p.59 | Actual before/after values, actor identity in signed-in use, and persistence of session events are not shown. |
| OC29 | p.61 | Confirmation, undo/unarchive, role enforcement, and deletion are not demonstrated. |
| OC30 | p.63 | The applicable next destination and enabled workflow are not exercised. |
| OC31 | p.65 | The title names a guard, but the actual screen is Checklist. Missing/blocked section variants are not shown. |
| OC32 | p.67 | The title names a guard, but an empty roster is shown. School creation and import are unshown. |
| OC33 | p.69 | The title names a guard, but an empty inventory is shown. Roster-to-match generation is unverified. |

### Public book

| Surface | Page | Not demonstrated |
|---|---|---|
| PE01 | p.3 | Filters, search results, no results, and actual navigation are unshown. |
| PE02 | p.15 | Filtering, sorting, result destination, and empty archive are unshown. |
| PE03 | p.21 | The rendered organizer description is demo data; no historical event facts are verified. |
| PE04 | p.24 | The requested Events route is showing Draws; event-details functionality is not independently demonstrated. |
| PE05 | p.27 | Individual profiles, club data, filtered matches, no results, and privacy enforcement are unshown. |
| PE09 | p.57 | Only page 1 of 5 and initial filter state are captured; by-court results, later result pages, and score refresh are |
| PE09 | p.58 | Only page 1 of 5 and initial filter state are captured; by-court results, later result pages, and score refresh are |
| PE10 | p.67 | The final is outside the initial horizontal viewport. Empty score cells are not proof that results are missing. |
| PE10 | p.69 | The final is outside the initial horizontal viewport. Empty score cells are not proof that results are missing. |
| PE11 | p.71 | The capture is a route-selected round; actual next/back operation is unverified. |
| PE12 | p.76 | Only Zhu is tested as a route state; no results, multiple results, path traversal, and focus movement are absent. |
| PE13 | p.80 | Dates differ from the aggregate schedule, but captures are live demo data rather than a frozen snapshot; verify |
| PE14 | p.91 | Round/List alternatives for doubles and later horizontal rounds are not captured. |
| PE15 | p.95 | Print/download behavior and the accuracy or authority of the supplied rules are outside this screenshot review. |
| PE16 | p.98 | No event selection, partner entry, fee, payment, consent, validation, or submission is visible. |
| PE19 | p.104 | Submission, focus, password-manager support, show-password, and return destination are unverified. |
| PE20 | p.106 | A true signup sequence and a verified account session are not shown. |
| PE21 | p.108 | No failed submit was observed; announcement, retained input, and rate limiting are unverified. |
| PE22 | p.110 | The actual authenticated destination and session validity are not established. |
| PE23 | p.112 | Submission, email delivery, optional-field handling, and non-test challenge states are absent. |
| PE24 | p.116 | The return path and successful handoff are not demonstrated. |
| PE25 | p.120 | Destination email, working resend, and actual verification are not shown. |
| PE26 | p.122 | This outcome URL does not establish that a token was accepted or entries delivered. |
| PE27 | p.124 | Token diagnosis and resend after sign-in are not observed. |
| PE28 | p.126 | Email sending and delivery are not observed. |
| PE29 | p.128 | Submitting the request and email delivery are unverified. |
| PE31 | p.132 | Delivery, token expiry, and account-enumeration behavior require implementation tests. |
| PE32 | p.134 | Password change and global session revocation are not demonstrated. |
| PE33 | p.136 | Invalid/expired/used token differentiation and recovery are unverified. |
| PE34 | p.138 | Default form, input retention, accessible error association, and successful resubmit are absent. |
| PE35 | p.140 | A valid invitation with partner identity, event, terms, and acceptance is absent. |
| PE36 | p.142 | Actual partner acceptance and changes to both entrants’ records are not shown. |
| PE37 | p.144 | The recovery link and authenticated invitation state are unverified. |
| PE38 | p.146 | No authenticated entries, pending/approved/rejected/withdrawn states, or sorting results are shown. |
| PE39 | p.148 | No verified receipt, fee calculation, partner state, payment result, or ownership test is shown. |

## "Evidence limit / next capture" notes (recapture targets, non-primary/incomplete-journey pages)

These appear on pages where the intended interaction state was not reached at all (e.g. sign-in, workspace
creation steps beyond the first, publication-flow confirmation) and name what a follow-up capture must
obtain.

### Operator book

- (OC01 (p.3)) Capture signed-out sign-in, validation, recovery, and return-to-task.
- (OC21 (p.43)) This is duplicate state evidence, not a second independent publication flow.
- (OC23 (p.47)) Duplicate state evidence; the link-replacement flow remains unverified.
- (OC24 (p.50), OC24 (p.51), OC24 (p.52)) Real viewing distance, refresh behavior, stale/offline state, and whether staff acknowledged conflicts are unverified.

### Public book

- (PE01 (p.4), PE01 (p.5), PE01 (p.6), PE01 (p.7), PE01 (p.8), PE01 (p.9), PE01 (p.10), PE01 (p.11)) Filters, search results, no results, and actual navigation are unshown.
- (PE02 (p.12), PE02 (p.13), PE02 (p.14), PE02 (p.16), PE02 (p.17), PE02 (p.18), PE02 (p.19), PE02 (p.20)) Filtering, sorting, result destination, and empty archive are unshown.
- (PE03 (p.22), PE03 (p.23)) The rendered organizer description is demo data; no historical event facts are verified.
- (PE04 (p.25), PE04 (p.26)) The requested Events route is showing Draws; event-details functionality is not independently demonstrated.
- (PE05 (p.28), PE05 (p.29), PE05 (p.30), PE05 (p.31), PE05 (p.32), PE05 (p.33), PE05 (p.34), PE05 (p.35), PE05 (p.36), PE05 (p.37), PE05 (p.38), PE05 (p.39), PE05 (p.40), PE05 (p.41), PE05 (p.42), PE05 (p.43), PE05 (p.44), PE05 (p.45), PE05 (p.46), PE05 (p.47)) Individual profiles, club data, filtered matches, no results, and privacy enforcement are unshown.
- (PE06 (p.48), PE06 (p.49), PE06 (p.50)) Opening a draw is not exercised by this route capture.
- (PE07 (p.51), PE07 (p.52), PE07 (p.53)) Capture actual seeded entries with real seed numbers and unseeded entrants.
- (PE08 (p.54), PE08 (p.55), PE08 (p.56)) Capture a completed event with its actual winners and final result.
- (PE09 (p.59), PE09 (p.60), PE09 (p.61), PE09 (p.62), PE09 (p.63), PE09 (p.64), PE09 (p.65), PE09 (p.66)) Only page 1 of 5 and initial filter state are captured; by-court results, later result pages, and score refresh are unshown.
- (PE10 (p.68), PE10 (p.70)) The final is outside the initial horizontal viewport. Empty score cells are not proof that results are missing.
- (PE11 (p.72), PE11 (p.73), PE11 (p.74), PE11 (p.75)) The capture is a route-selected round; actual next/back operation is unverified.
- (PE12 (p.77), PE12 (p.78), PE12 (p.79)) Only Zhu is tested as a route state; no results, multiple results, path traversal, and focus movement are absent.
- (PE13 (p.81), PE13 (p.82), PE13 (p.83), PE13 (p.84), PE13 (p.85), PE13 (p.86), PE13 (p.87), PE13 (p.88), PE13 (p.89), PE13 (p.90)) Dates differ from the aggregate schedule, but captures are live demo data rather than a frozen snapshot; verify source parity
- (PE14 (p.92), PE14 (p.93), PE14 (p.94)) Round/List alternatives for doubles and later horizontal rounds are not captured.
- (PE15 (p.96), PE15 (p.97)) Print/download behavior and the accuracy or authority of the supplied rules are outside this screenshot review.
- (PE16 (p.99)) No event selection, partner entry, fee, payment, consent, validation, or submission is visible.
- (PE17 (p.100), PE17 (p.101)) Capture a real signed-in entrant with an open entry window.
- (PE18 (p.102), PE18 (p.103)) Capture real account creation followed by the resumed open entry form.
- (PE19 (p.105)) Submission, focus, password-manager support, show-password, and return destination are unverified.
- (PE20 (p.107)) A true signup sequence and a verified account session are not shown.
- (PE21 (p.109)) No failed submit was observed; announcement, retained input, and rate limiting are unverified.
- (PE22 (p.111)) The actual authenticated destination and session validity are not established.
- (PE23 (p.113), PE23 (p.114), PE23 (p.115)) Submission, email delivery, optional-field handling, and non-test challenge states are absent.
- (PE24 (p.117), PE24 (p.118), PE24 (p.119)) The return path and successful handoff are not demonstrated.
- (PE25 (p.121)) Destination email, working resend, and actual verification are not shown.
- (PE26 (p.123)) This outcome URL does not establish that a token was accepted or entries delivered.
- (PE27 (p.125)) Token diagnosis and resend after sign-in are not observed.
- (PE28 (p.127)) Email sending and delivery are not observed.
- (PE29 (p.129)) Submitting the request and email delivery are unverified.
- (PE30 (p.130), PE30 (p.131)) Capture an actual valid reset link and the pristine new-password form.
- (PE31 (p.133)) Delivery, token expiry, and account-enumeration behavior require implementation tests.
- (PE32 (p.135)) Password change and global session revocation are not demonstrated.
- (PE33 (p.137)) Invalid/expired/used token differentiation and recovery are unverified.
- (PE34 (p.139)) Default form, input retention, accessible error association, and successful resubmit are absent.
- (PE35 (p.141)) A valid invitation with partner identity, event, terms, and acceptance is absent.
- (PE36 (p.143)) Actual partner acceptance and changes to both entrants’ records are not shown.
- (PE37 (p.145)) The recovery link and authenticated invitation state are unverified.
- (PE38 (p.147)) No authenticated entries, pending/approved/rejected/withdrawn states, or sorting results are shown.
- (PE39 (p.149)) No verified receipt, fee calculation, partner state, payment result, or ownership test is shown.

## Plan §7 "Evidence that must still be obtained" (cross-book synthesis)

From `shuttleworks-v3-consolidated-plan.md` §7, verbatim:

> Operator sign-in; remaining create-workspace steps and successful creation; account security/session
> actions; actual tool/guard behavior; open entry form and submission; authenticated My entries and receipt;
> valid password-reset form; valid invitation acceptance. Recapture route outcomes rather than manufacturing
> separate pages to match stale surface titles. Public seeded/winners routes that resolve to the draw index
> need routing/intent verification, not an assumed new-screen build.

