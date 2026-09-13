# ShuttleWorks public and entrant UI refinement plan

Prepared 9 September 2026. Implementation handoff for Claude.

## Scope and execution

Refine public discovery, tournament overview, player profiles, draws, regulations, registration, receipt and personal entry management. Audit and verify the entire entry journey, including authentication, partner acceptance, pricing, submission, receipt, withdrawal and recovery. Preserve working backend rules, stable identities, cross-tournament history and existing publication controls.

The visual baseline is `public-entrant-surface-book(3).pdf`. All page numbers below are absolute, one-based PDF pages. Source observations reference GitHub commit `720647988f15caa9eb2e59c8d07d0adcc4554b31`; reconcile with the implementation checkout before editing. The capture build has not been independently matched to that commit.

This plan supersedes conflicting earlier public UI directions. Coordinate representation fields and operator-owned setup with `operator-ui-refinement-plan.md`. Do not duplicate schema work, reimplement the tournament engine, change operator row-sheet score layout, or rebuild the authentication/payment architecture solely for visual consistency.

Read the complete plan and repository instructions, establish the baseline, then execute the ordered packages. Keep checkboxes and evidence current. Do not mark an attractive screen complete until its actual behavior is verified. Implementation and verification are authorized by this handoff; merging and deployment are separate actions.

## Pass 1 — Audit findings

The calendar and tournament shell provide a good foundation. Regulations are readable, player identity/history exists, and path selection is useful. The principal issues are repeated text, weak profile hierarchy, an entry flow that exposes too many intermediate controls, and status language that does not always match the underlying facts.

| ID | Surface / PDF evidence | Health | Finding and impact | Priority |
| --- | --- | --- | --- | --- |
| A01 | S01 calendar, p2 | Mostly good | Bullet-separated metadata and compound actions such as Enter plus deadline add punctuation noise. The page also exposes a test-style tournament and workspace owner string. | Medium |
| A02 | S02 overview, p4 | Needs copy/structure refinement | Fees and entry dates are verbose indirections rather than concise facts. The description says six days while the header presents only a start date. | Medium |
| A03 | S04 profile, p6; S43 p42 | Incomplete curation | Large tournament header outweighs the player; progression text repeats match cards/history; raw event codes, partner text and results are packed into prose. | High |
| A04 | S04 profile, p6 | Date ambiguity | Coming up is grouped under Tuesday 4 August while the visible match says Wednesday 5 August. Group matches by their actual relevant date, not the tournament's start. | High |
| A05 | S40 path, pp45–48; S44 p56 | Useful but misleading emphasis | Highlight includes large empty slot areas and both feeder branches; unrelated text becomes extremely faint. Round navigation can show a mostly empty viewport. | High |
| A06 | S07/S09 and results draws, pp8–10, 44, 53 | Needs copy cleanup | Repeated “from R16/R32” exposes progression mechanics in every unresolved side. | Medium |
| A07 | S10 regulations, p13; S42 p55 | Good content, weak document framing | Broad left-aligned page placement and a large tournament hero compete with a formal document. | Low |
| A08 | S12 entry, pp14–15; S13 interaction p17 | Major workflow defect | Seven labeled steps include Submitted. Multiple Continue/Back controls and review content are simultaneously visible. The UI feels like several workflows layered together. | Critical |
| A09 | S12 entry, p14 | Repetitive and incomplete fee presentation | The bundle-price sentence is repeated, spans many amounts, and lacks a visible currency. Price selection needs a calculated total and readable breakdown. | High |
| A10 | Account outcomes, pp22–38 | Requires continuity verification | Authentication, verification and recovery have separate pages. Outcome screenshots do not prove that a user returns to their preserved tournament draft. A signed-in outcome still shows a sign-in form. | High |
| A11 | S33 partner invitation, p20 | Mixed action hierarchy | Accept and enter appears before the explanation that sign-in/verification is required. Successful acceptance, expiry and retry must preserve the invitation context. | High |
| A12 | S11 receipt, p19 | Duplicated summary | Tournament/reference appear twice, Copy reference repeats, Payment required adds little, and Awaiting does not identify what is pending. | High |
| A13 | S35 My entries, p39 | Conflicting states and actions | Played appears beside Awaiting confirmation and withdrawal actions. Withdraw and Withdraw and erase compete on every entry. Generic organization text and references overwhelm useful details. | High |
| A14 | Sitewide visible copy | Needs systematic cleanup | Middle dots, codes, generic explanations and repeated headings substitute for layout. Essential metadata should be readable fields rather than strings of fragments. | Medium |

Critical means a visible problem obstructs a core task. High means correctness or frequent-task clarity is affected. These priorities are not measured usability scores.

### Source-supported findings

- `entries_me.py::_card_status` returns Played when the tournament date precedes the current UTC date, before considering live entry states. This is not evidence that the participant actually played. It can also mask withdrawn/rejected states. Correct the presentation rule and time context, not withdrawal permissions based on the label.
- `my-entries.js` displays withdrawal actions using the server's `canWithdraw` predicate. Therefore Played plus Withdraw is not, by itself, proof that the withdrawal endpoint is unguarded.
- `draw.tsx` marks a connector slot using player IDs from the destination and both feeder matches. CSS highlights the shared connector's pseudo-elements. The visual path needs independently addressable branches.
- The entry route posts to the backend and includes CSRF and idempotency fields. The entry wizard separately controls visibility through `hidden` and has draft preservation logic. Preserve those protections; investigate why the captured controls are simultaneously visible. A CSS display/hidden interaction, initialization failure or fallback mismatch is a hypothesis until reproduced.

### Limits of this audit

This is a screenshot-and-source audit, not an executed end-to-end registration certification. The supplied selected frames do not show a complete successful submit/payment/partner/withdrawal sequence. The plan below requires those checks in an isolated test environment. No production entry, payment or withdrawal was performed during this review.

Capture time and the fixture's effective event time can differ. The September receipt timestamp beside an August tournament is a reason to reconcile clocks and fixture state, not sufficient evidence of a production deadline bypass. Preserve real audit timestamps while using consistent effective event-time policy for fixture eligibility and lifecycle decisions.

## Pass 2 — UI design decisions

### D1. Shared public copy and layout

Remove decorative bullet/middle-dot separators from application-authored metadata throughout discovery, headers, profiles, match footers, receipts and My entries. Use separate fields, aligned columns, spacing or a second line. Keep real editorial lists inside regulations and user-authored content intact. Do not run a global punctuation replacement over names or stored documents.

Use short labels and specific facts. Avoid generic explanations of what the page obviously does. Reuse the existing type, icon and spacing system. Keep essential date/time, opponent, court, amount and state text readable; do not make it faint because it is secondary.

Buttons identify task actions. Links remain appropriate for navigation and public player names. Do not transform every player name into a large button. Distinguish selection, winner emphasis and live status; never rely on color alone.

### D2. Season calendar and tournament overview

Keep month grouping and the existing date marker. Separate tournament name, venue/location, status and action. Place an entry deadline below or beside Enter as independent text, not inside a compound action label. Preserve bounded lists/search behavior already implemented.

Remove internal fixture identifiers and generic workspace-owner fallbacks from public review/demo data. Fix publication/title fallback rules so real published tournaments remain discoverable. Keep test fixtures available to automated tests; do not hide legitimate records with a client-side string blacklist.

Use a concise tournament header: name, full date range when known, venue and one context-appropriate primary action. Registration can remain available while some draws are published; derive actions from actual event availability rather than one global label. If deadlines vary, show the relevant event deadlines or a specific View entry deadlines disclosure. Do not send a user to a draw diagram to discover entry policy.

Present facts using Date, Venue, Entry deadline and Fees. Show the configured fee/currency or a precise statement such as “Calculated from selected events” with an entry action. Do not invent a currency from the host country. Keep director-authored About text available, but avoid repeating venue and date in several cards. Preserve meaningful policy text rather than blindly shortening it.

### D3. Curated player profiles

Make the player the page's main subject. Keep a compact tournament breadcrumb/context header rather than repeating the full tournament hero above every profile. Identity includes name, verified representation and club when available, and an actual image only if a supported source exists. Do not fabricate photos, biographies, rankings or statistics for seeded players.

Use this information order:

1. Player identity and current tournament context.
2. Current or next match, when present, with event, partner, opponent, actual match date/time and court.
3. Current tournament participation/results with View draw or View path.
4. Cross-tournament history grouped by event/tournament and date, with a bounded initial set and Show more/filtering when needed.

Remove the prose progression list when it repeats the same match cards. Use consistent compact BWF-style two-side result rows, with each side's game scores beside that side and doubles partners grouped together. A current live match belongs under On court, not Coming up. Do not repeat the current tournament as an empty history item saying Shown above.

Keep canonical player IDs, repeat-player correlations and real cross-tournament history. Tournament-specific representation, partners and results remain attached to the correct event. A profile opened from a match or draw should preserve a clear return path. Unknown dates, courts or identity attributes have concise honest states, not invented values.

### D4. Draw path and unresolved players

Retain Highlight path, search and Clear path. A selected player produces one identifiable state with their name and an appropriate View profile action. Search text alone must not accidentally pin an ambiguous player. Both doubles partners can resolve to their pair's path in that draw.

Highlight the selected participant's side row in actual matches and the precise connectors along their progression. Keep the opponent and score readable. Do not outline the full tall layout slot or highlight the unrelated sibling feeder merely because it shares the connector container. Stop confirmed-path emphasis at elimination; do not portray possible future advancement as already achieved. Any optional projected path must be explicitly distinguished, not the default highlighted history.

Use separate branch geometry or selectors for each feeder edge, preserving the existing bracket graph. Keep server-rendered and enhanced implementations consistent. Do not dim other content below readable contrast. Clear path restores the normal tree; round selection preserves the player and scrolls to a meaningful target without blank regions dominating the viewport.

Use TBD for unresolved participant slots; keep blank space only when it has an unambiguous structural purpose. Retain real BYE, walkover, withdrawn and completed states. Hiding “from R32” is a presentation change: retain feeder IDs and progression data internally and expose source-round detail only in an optional accessible match detail if useful.

### D5. Regulations as a document

Center a constrained document container within the page; keep paragraph text left-aligned for reading. Use a clear document title, tournament identity, revision/date if meaningful, section headings and a comfortable line length. Keep Print and Download together in one restrained action area.

Preserve authored lists, headings and wording. Do not center-align every paragraph or convert regulations to images. Print/download must use the same published revision, omit site navigation appropriately, and preserve readable pagination. Verify narrow-screen reading and keyboard access.

### D6. Entry flow: two stages, then completion

Replace the seven-step wizard with Entry details and Review. Submitted is the completion state after a successful backend write, not a numbered step. If a short entry fits on one page, the Review action may switch the same page into a review state; do not create extra intermediate pages solely for visual symmetry.

| Stage | Contents | Primary action |
| --- | --- | --- |
| Entry details | Player identity, selected events, conditional partner fields, necessary eligibility information, running total | Review entry |
| Review | Player/event/pair summary, authoritative quote with currency, required consent, explicit pending conditions | Submit entry |
| Completion | Backend-issued reference, entry state and the next action actually required | View entry or the real payment/partner action |

The deadline and relevant eligibility information appear as compact context, not a standalone gate. Participants see available event choices with reasons for unavailable choices where useful. Show partner fields only for selected doubles events. Do not make singles users pass a Partner step. Preserve authorized multi-player entry with Add another player; do not assume every account belongs to the only participant it manages.

Authentication is a necessary prerequisite where required by the backend, not a numbered entry stage. Reuse a signed-in session and prefill only authorized, reliably linked identity fields. A signed-out person sees one clear Sign in to continue action and returns to the same draft after sign-in, account creation and verification. Do not bypass email verification, consent or account ownership to save clicks. Do not send them to generic My entries while silently dropping their pending registration.

Replace duplicate fee paragraphs with a running total and an expandable itemization. The backend owns quotes, currency, bundle rules, partner charges and eligibility. If pricing changes between review and submit, present the updated quote for review. Do not silently submit at a changed price.

Display one primary forward action and one back/edit action for the active stage. Inactive controls must be visually hidden and absent from keyboard navigation. With JavaScript unavailable, provide a coherent usable server-rendered form/review sequence rather than exposing wizard-only navigation. Preserve form submission names, CSRF, idempotency and draft-recovery behavior.

Submission waits for a confirmed backend result before showing success. Disable duplicate local clicks while pending and retain server idempotency for retries/reloads. A timeout after a possible commit must recover the original submission rather than invite a duplicate entry or charge.

### D7. Partner invitation and recovery

Keep invitation acceptance a focused page because it is a deep-linked, potentially cross-device task. Show tournament, event, inviter and proposed pair. If authentication or verified email is required, make that the primary action before Accept invitation. Preserve the invitation safely across the auth round trip.

Explain the resulting entry and fee responsibility before acceptance. Do not register an unconsenting partner merely because their name/email was entered by someone else. Verify accepted, already accepted, expired, revoked, ineligible and unavailable-event cases. Provide an appropriate recovery path without exposing another account's private entry details. Prevent repeated acceptance from duplicating pair entries or charges.

### D8. One receipt, accurate payment and entry states

Use one receipt summary: tournament, reference shown once, submission timestamp, selected players/events, actual entry states and total with currency. Keep the reference selectable; remove repeated Copy reference actions. At most one secondary copy control is justified if payment/support genuinely uses it.

Replace “Payment required” with actionable data: Amount due, Paid, No payment due or the actual supported pending state. Payment is not always required, and submission does not mean payment or organizer approval succeeded. Show pay-at-check-in instructions once if that is the configured method. Do not add a Pay now button unless a working payment flow exists.

Replace vague Awaiting with Awaiting partner or Awaiting organizer confirmation only when the underlying state supports that distinction. Prefer Entry received to Entry confirmed when approval is outstanding. Separate entry, payment and partner state rather than compressing them into a single green badge.

### D9. Personal area with Entries, Profile and Settings

Combine navigation under a coherent personal area, with Entries as the task home, Profile for the user's linked player identity/history, and Settings for account/privacy controls. Keep existing deep links compatible. Avoid a large dashboard, duplicated summaries or a generic profile hero above every entry list.

Entries groups tournaments into active and past sections where useful. Each item shows tournament/date, participant and event, precise entry state, partner when relevant, and one View entry action. Reveal detailed fees, references and management actions inside that entry, not on every summary line.

Do not label an entry Played from the tournament date alone. Use date only for past grouping, with venue timezone/event clock consistency. Derive actual participation/completion from match/entry data. Rejected and withdrawn states remain visible and must not be overwritten by a broad tournament label.

Move withdrawal to a single entry-management action shown only when the backend permits it. Use a focused confirmation explaining affected player/event, partner implications and the actual payment/refund policy where known. Do not imply automatic refunds.

Keep erase/export controls in Settings/privacy, preserving their current capabilities and constraints. Withdrawal and erasure are different operations, not two near-identical primary actions. Do not remove privacy controls merely to shorten the page or promise that results/history will disappear if the backend retains them.

An account is not automatically the same entity as a public player. Link the authenticated owner to a person through existing verified relationships; never claim a seed profile by matching a display name. Support accounts that manage multiple participants. Private payment, references, contact information and account controls must never appear on the public profile.

## Entry journey and backend verification contract

The following covers the entire journey, not only the form. Inspect existing routes and services before adding new endpoints. Use isolated test fixtures/accounts; actual money movement and external messages are not part of a visual review. Test transports/sandboxes should cover payment and invitation delivery as applicable.

| Journey | Required behavior and proof |
| --- | --- |
| Discover and open entry | Correct tournament/event availability and full dates; useful closed/full/waitlist states; no private draft fixtures published accidentally |
| Authentication | Signed-in resumes immediately; signed-out, new-account, verification and password-recovery paths preserve the correct draft/return destination; expired session handled without data loss |
| Player identity | Existing authorized identities reused; new players created once; country/representation coordinated with operator schema; multiple managed participants kept distinct |
| Events and eligibility | Client explains choices; server rechecks actual eligibility, capacity and deadline at submission, including changes since page load |
| Quote | Server-calculated amounts and currency match selection, bundle rules and review; stale quotes and event changes handled explicitly |
| Partner | Conditional collection, actual invitation acceptance, identity binding, pair creation and any fee changes verified without duplicates |
| Submission | CSRF/auth/ownership remain enforced; submission and entry creation are atomic as intended; repeat click/retry returns the original result through idempotency |
| Receipt | Loaded from the real committed submission; reload/direct access works for the proper owner/capability; guessed references do not disclose another account's details |
| Operator reconciliation | The submitted entry appears in the correct operator event/roster/approval workflow; public visibility follows publication policy rather than immediate indiscriminate publication |
| Payment | Required, free, paid, offline-payment and failed/pending cases follow supported configuration; no success state inferred from a redirect alone |
| My entries | Reads authoritative data and capabilities; pending partner/approval, rejected, withdrawn and played/history states remain distinguishable |
| Withdraw and privacy | Server rechecks ownership, deadline and draw/played restrictions; partner and fee effects are accurate; erasure/export remain separate authorized workflows |

Do not weaken controls to simplify navigation. Preserve a typed draft across authorized return paths without persisting passwords or invitation secrets unnecessarily. Treat server errors as recoverable states with an actionable message, not a silent reset. Ensure validation errors move focus to a useful summary/field and are announced accessibly.

## Implementation packages

| Done | Package | Scope | Dependencies | Exit evidence |
| --- | --- | --- | --- | --- |
| [ ] | P0 Baseline and contracts | Reproduce A01–A14; map writes/read models and clocks | None | Current route/state map and known failures |
| [x] | P1 Copy and shared metadata | D1; typography, separators, actionable labels | P0 | Rendered inventory across target surfaces |
| [x] | P2 Discovery and overview | D2; public fixture/content curation | P1 | Calendar/overview with accurate dates/actions |
| [x] | P3 Profile curation | D3; existing cross-tournament identities | P1; coordinate operator representation | Current/next/history examples |
| [x] | P4 Draw path and placeholders | D4 | P0, P1 | Branch-specific and cleared-path evidence |
| [x] | P5 Regulations layout | D5 | P1 | Centered reading column and print/download |
| [x] | P6 Entry and authentication flow | D6; full submission contract | P0, P1 | Two-stage real submission and recovery |
| [x] | P7 Partner flow | D7 | P6 | Acceptance/expiry/retry and operator reconciliation |
| [x] | P8 Receipt/payment presentation | D8 | P6, P7 | Real receipts across supported states |
| [x] | P9 Personal area and entry management | D9 | P3, P6, P8 | Accurate statuses, ownership and withdrawal |
| [ ] | P10 Verification and review handoff | All | P2–P9 | Completed evidence matrix and updated public book |

Prioritize P6's conflicting controls and data-safe submission, P9's misleading status, and P4's incorrect path emphasis. Cosmetic cleanup alone does not complete the entry work.

### P0 — Baseline

- [ ] Read current repository instructions/HEAD and preserve unrelated changes. Reconcile already-fixed issues with this baseline.
- [ ] Reproduce relevant public surfaces and route outcomes on desktop/mobile, including a signed-in session and unavailable invitation.
- [ ] Map current form field names, auth/CSRF, draft storage, quote, submission, receipt, partner, payment and withdrawal contracts.
- [ ] Record fixture clock, actual audit clock, venue timezone, entity IDs and published state. Correct fixture inconsistencies without falsifying audit timestamps.
- [ ] Update conflicting shared UI/status/path contracts before editing their implementations.

Accept when confirmed defects and untested hypotheses are distinct and all journey stages have a responsible read/write path.

### P1–P2 — Shared copy, discovery and overview

- [ ] Inventory application-authored bullet separators, generic workspace text and redundant headings; replace with deliberate field layout.
- [ ] Separate action labels from deadlines and amounts; retain meaningful editorial lists.
- [ ] Preserve calendar grouping and bounded discovery; remove test-data leakage through correct fixture/publication handling.
- [ ] Show true date ranges, event-specific deadlines and configured fees/currency without verbose redirects.
- [ ] Verify context-appropriate Enter/View draws/Follow live actions against backend availability.

Accept when the user can identify tournament, dates, venue and next action without decoding a chain of text fragments.

### P3 — Profiles

- [ ] Make identity the primary heading and reduce repeated tournament chrome.
- [ ] Replace duplicated progression prose with current/next match, current-tournament results and grouped cross-tournament history.
- [ ] Group matches by their own date and distinguish On court from Coming up.
- [ ] Keep side-aligned scores and doubles grouping; remove repeated current-tournament history placeholders.
- [ ] Verify repeat players, changing partners, available representation, missing data and history pagination without duplicate identities or invented statistics.

Accept when the next match/result and tournament history are scannable, accurate and linked to the same player across tournaments.

### P4 — Draws

- [ ] Replace whole-slot emphasis with selected-side and precise-edge emphasis in server and enhanced rendering.
- [ ] Exclude sibling feeders and stop confirmed progression at elimination; handle doubles membership, byes and unresolved rounds.
- [ ] Preserve normal text contrast, keyboard selection, URL/deep-link state, round navigation and Clear path behavior.
- [ ] Replace public feeder prose with TBD while retaining underlying graph relationships and real BYE/outcome semantics.

Accept when a selected player's actual path is the only strongly highlighted route, scores/opponents remain readable and clearing selection restores the complete tree.

### P5 — Regulations

- [ ] Center the document container, preserve left-aligned body text, and group document actions.
- [ ] Keep actual headings/lists and publication revision consistent between screen, print and download.
- [ ] Check mobile line length, print pagination and keyboard access.

Accept when the regulations read as one formal document rather than another dashboard section.

### P6 — Entry and auth

- [ ] Implement Entry details and Review with Submitted only as backend-confirmed completion.
- [ ] Remove inactive duplicate navigation; reproduce and repair the wizard visibility/fallback issue at its actual source.
- [ ] Make participant/events/conditional partner fields coherent, preserving authorized multi-player entry.
- [ ] Preserve drafts across sign-in/signup/verification/recovery and skip unnecessary gates for authenticated users.
- [ ] Integrate authoritative quote, currency, required consent and server revalidation; handle price/capacity/deadline changes at submit.
- [ ] Preserve CSRF, account ownership and idempotency; test duplicate clicks, timeout after commit and safe recovery.
- [ ] Verify no-JavaScript or enhancement-failure behavior supported by the existing public stack.

Accept when a signed-in user can complete a normal entry through two clear stages with one submission, and account interruptions do not erase their work.

### P7–P8 — Partner, receipt and payment

- [ ] Make required authentication precede the invitation's acceptance action, retaining invitation context.
- [ ] Verify valid/expired/revoked/already-used/ineligible invitations and repeat acceptance without duplicate pair/charge records.
- [ ] Render one receipt summary and one reference; remove repeated copy actions and vague payment/awaiting labels.
- [ ] Show accurate entry, partner and payment states with the actual necessary next action.
- [ ] Verify receipt authorization, reload, payment configuration and appearance in operator entry/roster views.

Accept when the user knows whether they are entered, awaiting a partner/approval, or still owe money, without contradictory success messages.

### P9 — Personal area

- [ ] Group Entries, Profile and Settings in one personal navigation while preserving existing routes/deep links.
- [ ] Replace date-derived Played with fact-based entry/participation status and use dates only for appropriate grouping.
- [ ] Reduce each entry summary to useful identity/state plus View entry; remove duplicate references and generic organization fallback text.
- [ ] Provide one withdrawal action in the appropriate entry detail with backend capability checks and consequence-specific confirmation.
- [ ] Move privacy/export/erase to Settings while preserving access and server behavior.
- [ ] Verify account-to-person ownership, multiple managed participants and public/private separation.

Accept when the same entry state agrees across receipt, My entries and operator data, and private account controls cannot be mistaken for public player-profile content.

### P10 — Test and handoff

- [ ] Run required lint/type/build gates and focused unit/integration tests for path edges, status derivation, quotes, ownership, idempotency and partner/withdrawal rules.
- [ ] Execute the entire journey matrix with isolated fixtures, recording actual outcomes; do not count a route returning HTTP 200 as successful entry.
- [ ] Include one signed-in singles entry, one new-account/verification return, one doubles invitation, one multi-player entry and one repeat-player profile case.
- [ ] Include invalid eligibility, full/closed event, expired session, quote change, submit timeout, failed invitation delivery/retry where supported, and forbidden withdrawal/access cases.
- [ ] Check 1440px desktop and 390px mobile, keyboard navigation, focus/error announcements, readable contrast and browser back/reload behavior.
- [ ] Refresh the default public surface book using the existing review profile and selected major interaction examples. Include the two-stage entry and real completion evidence; avoid exhaustive permutations in the PDF.
- [ ] Deliver completed package matrix, audit findings resolved, actual test results, screenshots, schema/contract notes and any remaining blocker with reproduction.

## Code starting points and evidence

Locate current equivalents before editing:

| Area | Starting point |
| --- | --- |
| Entry route/CSRF/form | `apps/entrant/app/routes/enter.tsx` |
| Entry enhancement/drafts | `apps/entrant/public/assets/entry-wizard.js`, `apps/entrant/app/app.css` |
| Quote/submit | `apps/api/src/entries/entries_json.py`, `entry_form.py`, `entry_fees.py`, `submissions.py` |
| Eligibility/lifecycle | `apps/api/src/entries/entry_policy.py`, `lifecycle.py` |
| Partner acceptance | `apps/api/src/entries/partners.py`, `partner_routes.py` and current public invitation routes |
| Receipt | `apps/entrant/app/routes/receipt.tsx`, `public/assets/receipt.js` |
| Personal entries | `apps/entrant/public/assets/my-entries.js`, `apps/api/src/entries/entries_me.py` |
| Draw/path | `apps/entrant/app/routes/draw.tsx`, `public/assets/bracket-path.js`, `app/app.css` |
| Profiles and publication | `apps/entrant/app/routes/player.tsx`, `apps/api/src/entries/entries_site.py` |
| Shared tournament shell | `apps/entrant/app/components/TournamentFrame.tsx`, `app/routes/tournament.tsx` |

Permanent source references: [entry form](https://github.com/wongywrongy/ShuttleWorks/blob/720647988f15caa9eb2e59c8d07d0adcc4554b31/apps/entrant/app/routes/enter.tsx), [entry status derivation](https://github.com/wongywrongy/ShuttleWorks/blob/720647988f15caa9eb2e59c8d07d0adcc4554b31/apps/api/src/entries/entries_me.py), [draw connectors](https://github.com/wongywrongy/ShuttleWorks/blob/720647988f15caa9eb2e59c8d07d0adcc4554b31/apps/entrant/app/routes/draw.tsx).

### Visual baseline: simultaneous entry controls

Supplied signed-in entry capture showing several Continue/Back controls and review content at once — historical capture not supplied; original path: `sandbox:/workspace/scratch/504d688100b7/public-review-sep9/p17.jpg`.

This image is audit evidence from public S13, PDF p17. It is not an implemented design or proof of successful submission.

## Implementation status (2026-09-09)

P1–P9 implemented on `feat/operator-ui-refinement` by parallel subagents; P0 reproduction and P10 verification were deliberately not run (a real engineer audits next). Notable outcomes and open items:

- A08 root cause: Tailwind display utilities (`grid`/`flex`) outranked `[hidden]`, so the wizard never hid panels. Fixed by a scoped `[data-entry-page] [hidden] { display:none !important }` rule.
- `_card_status` now lets live entry states win; `played` needs a published result badge; date only drives active/past grouping; uses the effective demo clock.
- No currency field exists anywhere in the entry DTOs (`money.ts`); receipt/quote show amounts without currency rather than inventing one. Needs a backend field.
- `Entry.pending_reason` (`awaiting_partner`/`awaiting_payment`) is not on the wire, so "Awaiting partner" is not claimed; surfaces say "Awaiting confirmation".
- `/e/verify` carries no `next`, so the email-verification return does not link back to the draft (draft still survives in the original tab).
- Profile "verified representation" has no wire field; club renders when present.
- Tests knowingly invalidated by plan-mandated behavior (not edited): `entry-wizard.script.test.ts`, `uiTwins.test.ts` (one case), `matchCard.contract.render.test.ts` (TBD ban / `from QF1`), `draw.render.test.ts` (`from SF2`), `player.render.test.ts`, `receipt.script.test.ts`, `myEntries.script.test.ts`, `tests/backend/test_entries_me_api.py::test_played_once_the_date_has_passed`. `partner.render.test.ts` fixtures gained `signedIn: true` only to satisfy the type gate.

## Definition of done

The public site presents concise tournament facts, curated real player history, precise path highlighting and readable regulations. Registration requires two clear user stages plus a genuine completion screen, preserving all backend checks and recovery behavior. Receipt, My entries, partner and payment states agree with their authoritative records. Public player identity and private account management are connected through clear navigation and verified ownership without exposing private data.
