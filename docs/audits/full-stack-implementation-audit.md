# ShuttleWorks full-stack implementation audit

**Verdict: Not ready.** The reviewed build is not ready to hand off as completion of O0–O11/P0–P10. It can advance the wrong winner, cannot correct that result, uses the wrong configured score cap, accepts a changed fee/consent revision without renewed review, and can create asymmetric doubles pairs under overlapping acceptance. Several presentation improvements are real, and important authorization, persistence and synchronization mechanisms work in the tested cases. They do not establish end-to-end correctness.

This verdict applies only to the working tree and fixtures identified below. It is **not a production-readiness certification**. No production data, external invitations, payment-provider charges, merges or deployments were involved. No application behavior or existing test expectations were changed during this audit. The only existing tracked-file edit retained is a narrow `.gitignore` exception allowing this requested root report; generated ledger output was restored.

## 1. Review identity and evidence rules

- Branch: `feat/operator-ui-refinement`; HEAD: `720647988f15caa9eb2e59c8d07d0adcc4554b31`. Both refinement plans name this commit as their source baseline; the implementation under review is the substantial **uncommitted** diff on top, including staged deletions and the untracked representation migration. Initial status contained 123 entries. The commit alone does not identify this build. Final verification confirmed all 119 hashed existing dirty files and the complete original tracked diff were unchanged; see [preservation record](full-stack-implementation-evidence/preservation.json).
- Read `CLAUDE.md`, `CODE_HEALTH.md`, both complete refinement plans, current architecture/data-flow/backend/offline documentation, relevant contracts, debt-log entries and implementation changes. No applicable `AGENTS.md` was found in the repository or checked parent locations. Historical reports and checked boxes were treated as reproduction leads.
- Runtime: Python 3.12.3; Node 24.11.0. Fresh console and entrant builds succeeded. Current source hashes and allowlisted process configuration are retained in [identity.json](full-stack-implementation-evidence/identity.json).
- Recovered isolated runtime: API `127.0.0.1:8601`, console Vite `127.0.0.1:5173`, entrant Vite SSR `127.0.0.1:5175`. Host process inspection confirmed API cwd `apps/api/src`, frontend cwd for each application, and both frontend proxies targeting **8601**. API PID 726658 and frontend PIDs 773087/760751 use the reviewed checkout; no baked production image was substituted. This is a source-served development runtime, not a production ingress test. Fresh TestClient reproductions import the current code separately from the long-lived server. A further host check established that all 248 API/scheduler Python files predate API startup: latest source edit 20:52:52 UTC, process start 21:23:46 UTC. See [runtime source order](full-stack-implementation-evidence/runtime-source-order.json).
- Database: recovered disposable `scratchpad/env/audit.db`, **not** `data/local.db`. Its migration revision is `f8a2b6c0d1e3`; integrity check `ok`, zero foreign-key violations. At continuation baseline it contained 9 workspaces, 25 submissions, 525 entries, 519 entry players and 4 authority epochs. Claude had already added audit records; original seed counts are not its current state.
- Fresh disposable migration database: upgrade through `f8a2b6c0d1e3`, `alembic check` and heads inspection succeeded. SQLite cannot reflect the expression index `uq_users_email_lower` for autogenerate comparison; the warning is a dialect limitation, not proof that the index was verified. PostgreSQL migration/concurrency parity was not executed: no isolated `TEST_POSTGRES_URL` was supplied.
- Browser fixture event clock: `2026-07-31T05:15:00+00:00`, applied in API, SSR and console. Actual audit/write timestamps remain September 9, 2026 UTC. Taipei uses its venue timezone; Korea uses its own. Do not replace real submission, consent, erasure or operation timestamps with the demo clock.
- Stable fixtures: Taipei `4576799f-f4c8-4566-a129-47beec0751f7` / `2026-taipei-open-t029`; Korea `d8f56e82-65b2-4078-bcd2-53dfd8a3cb45` / `2026-korea-masters-t030`; Meet `475f2911-041a-4a11-810c-f3af33228e81`. Browser entry checks used Korea's one currently open XD event, without sending an invitation or submitting from that browser.

**Evidence labels:** E1 = fresh gates; E2 = fresh operator database reproductions; E3 = fresh partner/quote/identity database reproductions; E4 = current rendered/DOM/browser checks; E5 = same-ID projection comparison; E6 = fresh offline/auth/concurrency tests; H = recovered Claude evidence, explicitly not freshly replayed. Pass applies only to the stated requirement slice. Source alone can confirm a missing interface or a deterministic faulty branch, but cannot establish a visual or end-to-end Pass.

The retained observation probes deliberately assert the **observed defects**, so their successful exit means reproduction succeeded. They are not regression acceptance tests and are outside normal test discovery. Repairs must replace those observations with assertions of the intended behavior.

## 2. Actual architecture, ownership and propagation

| Fact / mutation | Canonical owner and write boundary | Consumers / propagation | Material qualification |
| --- | --- | --- | --- |
| Workspace identity, modules, dates, lifecycle and setup | `workspaces/tournaments.py`, `workspaces/setup.py::patch_setup_section`; tournament row/setup document and section concurrency preconditions | Hub summaries; Setup; config mirror; entry-page/public projections | Calendar grouping is not lifecycle. Setup is preparation and freezes after authority checkout. |
| Meet roster and schedule | Workspace state plus normalized Meet records; roster/state application operations and scheduling application boundaries | Zustand `tournamentStore`; Operations; display; public schedule | Preserve Meet team/lineup semantics. A browser cache is not the authoritative event store. |
| Bracket participants, draw topology, assignments and results | Bracket domain/repository; `bracket/application.py`, generation/advancement; normalized bracket records and serialized snapshots | `GET /tournaments/{id}/bracket`, console draw/inventory/Live; public `entries_site`; display capability projection | Bracket records remain distinct from Meet. Wrong result input is propagated consistently: projection parity does not cure a bad canonical winner. |
| Match state / live court | Operations commands and bracket match actions; versioned normalized writes with operation/outbox transaction | Operator polling/store subscriptions; public schedule and venue board | Future solver court, actual operational court and imported historical court label are different facts. Do not force them into one field. |
| Entrant account and private ownership | `EntrantAccount`, entrant session; authenticated entry routes | Own receipts, My entries, privacy/export/erasure | Operator `User`/workspace membership and entrant account are distinct. Local bootstrap authorization cannot prove cloud tenancy. |
| Entry player / entry / submission / partner / money | `entries/submissions.py`, `partners.py`, `lifecycle.py`, `money.py`; submission and entry rows, explicit partner links | Private receipt/My entries; operator desk; confirm then `entries.py::commit_entries` into roster | Submitted, accepted partner, paid, organizer-confirmed and roster-committed are separate facts. Partner acceptance currently bypasses parts of the ordinary initialization/validation path. |
| Public identity/history | `entries_site.py` public directory and history joins; account-backed and imported identity spines | Draw member links, player pages and cross-tournament history | Imported identity must not claim an account. Representation is tournament-scoped; public identity DTO currently lacks it. Same-name managed-person misattribution is confirmed in F15. |
| Effective scoring | Setup rules/config, shared scoring summary; read-only draw default summary | Setup, public regulations; result form should consume the same values | Result editor instead derives its own cap. Backend does not enforce score legality. |
| Board content/appearance/layout/capability | Board settings and module state; owner-controlled capability mint/rotation | Public display summary/state/bracket polling; saved preview iframe; fullscreen renderer | Meet layout scope differs from Bracket. Preserve saved renderer reuse; per-setting open-wall propagation remains incompletely verified. |
| Event authority and offline sync | `sync/authority.py`, `operation_log.py`, `application.py`, `agent.py`, ingestion/recovery; SQLite event node versus PostgreSQL cloud | Immutable sequenced operations + durable outbox → authenticated batch upload → inbox/receipt + cloud projection → public reads | Existing architecture, not Supabase. Epoch, sequence, schema and version conflicts retain quarantine evidence. Never add another source of truth to hide divergence. |

The console has IndexedDB command queues (`commandQueue.ts`, `bracketCommandQueue.ts`) for retry/optimistic UX. A locally queued browser command, a committed node operation and a cloud-acknowledged operation are distinct durability states. The event node holds authoritative SQLite WAL state during checkout; setup/intake freezes protect its checkpoint. Offline operator sessions are tournament/device/epoch/role scoped and hash-stored. Cloud credentials are not a substitute.

The public application is React Router SSR with native form writes and bounded enhancement scripts, **not framework hydration**. SSR loaders use allowlisted API projections; native form/JSON writes authenticate at the API. Separate operator/public origins are part of deployment security; the recovered local rig is not evidence that production nginx/cookies implement that boundary correctly.

Propagation includes bounded polling (roughly 2.5 seconds for bracket operator data and 5–10 seconds for relevant state/display hooks), response caches and explicit invalidation, plus the durable node/cloud transport. Public reads can legitimately omit unpublished results or future planning courts. Compare IDs at a stable revision before diagnosing a contradiction. Solve jobs use the existing database-backed worker rail; interactive bracket scheduling remains its existing in-request path. Telemetry/retry/quarantine mechanisms exist; this audit did not certify a production collector or delivery service.

**Documentation deviation:** `CLAUDE.md` still claims “no replication layer,” while current source and the authoritative offline matrix implement ordered domain-operation synchronization. Update that stale paragraph; do not remove the working sync subsystem. The imported canonical match/identity paths and the normalized operational paths must both be represented in future documentation.

## 3. Plan traceability

### Operator O0–O11

| Requirement slice | Frontend / control | API / domain | Persistence / projection | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| O0 baseline and ownership | Both plans and current controls | Actual routes, auth, sync boundaries | Build/diff/fixture/migration identity above | E1–E6; remaining gaps explicit | Partial |
| O1 common controls / dialogs | `ActiveChoice`, `ResultEntryForm`, `RecordResultModal`, `PartnerPickerModal` | Existing mutation seams retained | No new domain owner | E1 2,386 console tests; E4 selected renders; full focus/zoom/theme sweep absent | Partial |
| O2 explicit Hub columns, Active/Past, undated draft | `HubPage`, `WorkspaceRow`, `workspaceStatusLabel` | Workspace summaries | Lifecycle plus temporal grouping | E4 settled Hub; E1 Hub tests; H create/open/select traces | Partial |
| O2 predictable Open/Settings; overview and naming | `WorkspaceRow`, `WorkspaceInspector`, `workspaceNav` | Existing workspace/setup routes | Routes retained | E1 Hub/navigation tests; H opened Overview; no complete new mobile action pass | Partial |
| O3 one scoring owner / effective summary | `ScoringFields`, `BracketDrawDefaults` read-only scoring link | Setup rules; `shared/scoring_rules.py` | Structured rules mirror/public summary | E1 scoring tests; direct source ownership trace | Partial |
| O3 actual editor rules agree with settings | Canvas/inventory/Live result editor | Unvalidated result operation | Configured cap discarded by editor | E2 cap probe; F02 | Fail |
| O3 error-aware save / public details | `SetupProduct` grouped Save | `PATCH …/setup/{section}` | ETag; checkout fence | E2 actual CONFIG_LOCKED; F13; H ordinary save/reload | Partial |
| O4 validated representation and unknown | Bracket/Meet identity controls | `core/representation.py`, schemas | Nullable `entry_players.representation`, participant metadata | E1 representation tests; H TPE/tpe/XXX/null round trips; fresh migration | Partial |
| O4 import/export/public history round trip | Import + public profile | `_build_draw_from_import`, public identity DTO | Import drops accepted code; no public representation field | E2 fresh import/database; F08 | Fail |
| O5 proposed pair / explicit commit | `PartnerPickerModal`, `pairingMutation.ts::commitBracketPairing` | Whole event upsert with draft restriction | One participant-set write | H cancel/no-write, reciprocal UI and reconnect assignment; E1 pairing tests | Partial |
| O5 eligibility / concurrent pair edits / entry reconciliation | Roster detail / picker | Upsert, `ensure_entries_editable` | Draw participants distinct from intake partner links | Draft restriction source/tests; concurrent operator reassignment and intake reconciliation not reproduced | Not verified |
| O6 centered row scores versus BWF nodes | Meet `MatchesSpreadsheet`, Bracket inventory, shared card | Distinct Meet/Bracket DTOs | Existing domain records retained | E1 row/score tests; E4 BWF public cards; fresh operator comparison absent | Partial |
| O6 filters, 100-row default, selection scope | Bracket/Meet inventory toolbars | Existing list/filter paths | Pagination/state | E1 console suites; dense current rendered selection/query-state test absent | Partial |
| O7 bounded editor / valid new result | `RecordResultModal`, shared Live form | `POST …/bracket/commands`, legacy results | Atomic advancement operation | E1 editor tests; H dialog/new result; E2 backend counterexample | Partial |
| O7 server validation and correction | Save / Correct result | `BracketResultService.apply` | Wrong winner advances; existing result rejected | E2; F01–F03 | Fail |
| O7 offline queued / durable / synchronized status | `useBracketResultQueue` | Idempotent versioned command and outbox | Browser IndexedDB vs node/cloud state | E6 generic queue/node proofs; full new-result browser restart/reconnect not run | Partial |
| O8 real consolation topology and schedule | SE + plate maps to `monrad`, not a fake toggle | Monrad generation/advancement and scheduler | Main/PLATE loser feeders + dependencies | H 13-person/22-match generated fixture, loser routing, 9 assignments/zero dependency violations; E1 format tests | Partial |
| O8 byes, correction, withdrawal, publication | Draw/result controls | Existing format and result restrictions | Bye sentinel; corrections absent | E1 n6/n8 tests; F03; published consolation end-to-end not completed | Partial |
| O9 compact queues and preserved timeline | `PlanCourtQueues`, existing timeline | Pin/validate and match-state constraints | Assignments / operational state | E1 queue tests; H pin→board agreement; no fresh full drag/time/reconnect browser pass | Partial |
| O10 grouped controls, draft/application, modes | `DisplayConfig`, `BoardAppearance`, Meet layout editor | Board settings, module/capability commands | Saved preview uses public renderer | E1 display tests; H settings round trips; full per-setting wall effects absent | Partial |
| O11 verification/handoff | This audit; existing capture tooling | Gates and isolated probes | Sanitized evidence retained | F14; books not refreshed; coverage ledger below | Partial |

### Public P0–P10

| Requirement slice | Frontend / control | API / domain | Persistence / projection | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| P0 reproducible baseline/contracts | Public routes and form/enhancement | Quote/submit/auth/partner/receipt paths | Clocks, publication, fixtures | E1–E6; explicitly incomplete journeys | Partial |
| P1 copy and shared metadata | Calendar, header, receipt/profile changes | Existing projections | No invented metadata | E4 discovery; E1 obsolete-copy failures separated; decorative separators remain in draw/entry | Partial |
| P2 useful discovery and publication | `SeasonCalendar`, `SeasonStatusCell` | Public season/page projection | Two public fixture tournaments | E4 desktop/mobile; no audit workspaces in discovery | Pass |
| P2 full date range, deadlines, available actions | `tournamentFrame`, overview key dates | Entry page has `endDate` and event availability | Header drops end date; lifecycle CTA overrides open-entry context | E4 Korea overview versus discovery/entry; F10 | Fail |
| P3 person-first profile / curated matches | `player.tsx` | `player_page`, public directory | Account/import identity and per-event publication | E1 profile tests include failures; fresh profile layout/managed-name edge coverage incomplete | Partial |
| P3 same-name managed identities | Public player/history links | `_canonical_person_key` versus `submissions.same_person` | Different birthdays ignored by history join | E3 public GET + SQL; F15 | Fail |
| P3 bounded history, representation | History `<details>` and identity | `_person_history`, `_expand_history_rows` | All historical rows expanded; representation absent | Source F08/F12; no fabricated N+1 claim | Fail |
| P4 precise eliminated singles path and Clear | `draw.tsx`, `bracket-path.js` | Draw feeder graph | Same match IDs in both rendering modes | E4 two selected matches/two edge elements; no sibling branch; Clear empties selection | Pass |
| P4 doubles, round jumping, keyboard and all placeholders | Same controls | Pair-member and feeder metadata | Public BYE/TBD/result gates | E4 readable TBD/BWF; exact both-member and round-focus journeys incomplete | Partial |
| P5 document layout / screen-print-download parity | Regulations page/actions | Published regulations version | Director-authored document plus structured summary | Source and E1 tests; no fresh print/PDF/mobile document inspection | Not verified |
| P6 two enhanced stages and draft persistence | `entry-wizard.js`, scoped `[hidden]` CSS | Native submit unchanged | Session storage draft; server receipt required | E4 details/review, reload and reconnect; no false completion | Pass |
| P6 authoritative Review, stale quote / consent protection | Review/Update total/Submit | Quote and submit separately calculate current values | No reviewed-price/version binding | E3/E4; F05 | Fail |
| P6 signed-in singles, multi-player, receipt persistence | Native form + account session | Submission service, receipt ownership | Committed submissions/entries and short reference | H signed-in/multi-player/retry SQL; E1 backend tests; new browser-completed singles receipt absent | Partial |
| P6 authentication return, expired session, no-JS review | Login/signup/verify and draft | Required auth/CSRF maintained | Verification ends at My entries; native form has no enforced review boundary | E4 no-JS; source F09; H auth tests | Partial |
| P7 authenticated acceptance, sequential reuse | Invitation page | Verified principal + token resolution | Own submission; reciprocal links | E3 plus existing partner tests; sequential reuse refused | Pass |
| P7 concurrency, validation, fee and consent | Accept and enter | `partner_routes`, `partners.accept` | Duplicate/asymmetric links; missing applicable entry facts | E3; F04/F06 | Fail |
| P8 genuine receipt / separate money | `receipt.tsx`, `receipt.js` | Account-scoped submission projection | Real short reference, stored fee/paid fact | H owner/foreign/anonymous receipts; E1 route tests; no provider flow invented | Partial |
| P8 configured currency and precise pending conditions | Receipt/My entries | DTOs lack currency and pending detail | Monetary amount and partner/payment reasons diverge | E3/source; F06/F11 | Fail |
| P9 date is not Played | `_card_status`, `my-entries.js` | Result-backed participation derivation | Withdrawn/rejected/pending not overwritten by date | Current source and state-specific suite assertions; old date-derived test is superseded | Partial |
| P9 truthful withdrawal and surviving partner | Entry management | `_can_withdraw`, withdrawal route, lifecycle | Checkout capability mismatch; survivor still appears partnered | E3/H/source; F07 | Fail |
| P9 account privacy/export/erase/history | Settings navigation / own-entry controls | Account ownership, retention/erasure services | Retained sport history separate from private data | H disposable export/erase; E1 tests; new complete browser privacy journey absent | Partial |
| P10 complete verification and handoff | This report and selected current captures | Gates / integration probes | Actual outcomes and gaps | F14; full journey/book completion not established | Partial |

## 4. Confirmed findings and minimal repairs

### F01 — High — Backend accepts and advances an impossible winner

**Violates:** O7/O8 result integrity and server-owned validation. **Origin:** canonical mutation, not renderer.

`apps/api/src/core/schemas.py:1286` accepts an arbitrary score dictionary; `bracket/application.py:192–218` checks record/version/participants but passes the score into advancement without scoring validation. In E2 workspace `4d6c6953-afa5-4140-bb99-a0eb74d0b3e2`, POST results for `MS-R0-0` with A winning and games `5–21, 7–21` returned 200. Fresh GET stored the contradiction and `MS-R1-0` advanced P1/A. This is a legal score *shape*, not an artifact of sending arrays instead of objects. The canonical command route uses the same service; H also exercised it.

**Smallest repair:** validate score shape, game completion/count, effective rules, winner agreement and non-played outcome combinations inside the application transaction before any result/advancement/outbox write. Share interpretation across entry points; preserve an explicit historical-import policy. **Completion:** rejected counterexample leaves result, feeders and outbox unchanged; valid supported formats/outcomes pass on command and legacy routes.

### F02 — High — Result editor ignores configured point cap

**Violates:** O3/O7; valid custom/no-limit results are blocked and invalid results can be described as complete.

`ResultEntryForm.tsx:65–86` derives cap 30 from 21-point deuce without accepting `pointCap`; `:195` prohibits scores above it. `ScoreEditor.tsx:231` also omits cap. Actual exported functions returned cap 30 for configured **null, 25 and 35**. At cap 25, valid 25–24 has no winner; with no cap or cap 35, 30–29 incorrectly has a winner and valid 31–29 exceeds the form bound. Setup `ScoringFields.tsx:68` and API `shared/scoring_rules.py:46` honor the configured cap, so published text and editor disagree.

**Smallest repair:** carry nullable effective cap through canvas, inventory and Live; null means unbounded. Align winner derivation/input bounds with F01's backend rules and preserve legitimate scoring variants. **Completion:** same fixtures yield the same effective sentence and legality on Setup, result editors and public regulations; test custom cap, no cap, retirement with partial games and extra games after a decided match.

### F03 — High — Result correction is advertised but has no domain operation

**Violates:** O7 and O8 downstream correction.

A new write changing the recorded winner returns 409 “Result already recorded for this match” (`bracket/application.py:192–203`). Command DTO supports only `record_result` (`core/schemas.py:1280`). `RecordResultModal.tsx` nevertheless says a correction “re-runs progression for everything downstream.” E2 reproduced refusal through the actual route; H reproduced both commands and legacy results.

**Smallest repair:** add a narrowly scoped correction command with current-version precondition and atomic affected-frontier recalculation/invalidation, including consolation losers and scheduling dependencies. Refuse corrections that conflict with played descendants until the operator explicitly resolves that frontier. Use the existing operation log/sync policy. **Completion:** correct main/plate result, verify both branches and public/board projections; retry is idempotent, stale edit rejected, no orphaned advancement. Never prescribe deleting the whole draw as a correction workflow.

### F04 — High — Overlapping invitation acceptance creates an asymmetric pair

**Violates:** P7 atomicity/idempotency and coherent pair ownership.

`partner_routes.py:300` resolves the invitation before the write transaction at `:341`; `partners.accept:255–278` does not atomically claim or revalidate it. E3 forced **two independent sessions** to resolve the same live invitation; A accepted/committed, then B accepted its stale resolved row/committed. Fresh SQL showed two accepted partner entries pointing to the nominator, which pointed only to B. This is deterministic service-level overlapping-read evidence through the route's service sequence, **not a simultaneous HTTP or PostgreSQL run**. Sequential token reuse correctly fails and does not close this race.

**Smallest repair:** transactionally claim/revalidate the current invitation before creating any partner submission/player/entry; losing acceptance creates nothing. Add a database/concurrency guard compatible with both supported dialects. **Completion:** forced interleave plus concurrent HTTP and PostgreSQL tests yield exactly one reciprocal pair and one accepted submission; existing token expiry/replacement/authorization behavior stays intact.

### F05 — High — Review does not bind price or the regulations accepted

**Violates:** P6 authoritative quote and renewed review on material changes.

E3 quoted 4000 at regulations v3, changed only the disposable fixture to fee 9000/v4, then submitted normally. Response 303; SQL stored **9000 and v4** without a revised review/consent challenge. `entries_json.py:1249,1383` independently calculate quote/submit; `:1359` checks boolean acknowledgment, and `submissions.py:510–511` records the current version. No payment-provider charge was made.

E4 additionally filled details and clicked Review: **zero quote requests**, followed by Submit and prose claiming the total is the organizer's quote, with no numeric total. `entry-wizard.js:318–326` switches stage directly. No-JS renders one native form with Update total and Submit, not an enforced server review boundary. Browser focus remained on the now-hidden Review button immediately after switching; focus transfer needs repair.

**Smallest repair:** obtain an authoritative quote before Review; bind basket/price/currency/regulations revision to final submission, compare server-side and return recoverable revised Review on changes. Preserve CSRF, consent, authorized participants, input and retry key. Carry the same contract through native form fallback. **Completion:** unchanged review commits once; changed price/version cannot commit until renewed consent; timeout-after-commit recovers original receipt; focus moves to the active stage/error summary.

### F06 — High — Partner acceptance creates incomplete money/consent facts and bypasses intake checks

**Violates:** P7/P8 supported eligibility, capacity, fee and consent semantics.

E3: paid acceptance stored submission total 5000 but entry `fee_cents=NULL`, no `awaiting_payment`, and `regulations_version_accepted=NULL` when page version was 7. `partners.py:240–268` omits ordinary initialization from `submissions.py:550–580`. It writes `regulations_accepted_at` despite `PartnerAcceptRequest` having no acknowledgment/version field; partner UI says fees follow on receipt rather than presenting required review/consent.

A second E3 fixture closed both page/event, set already-occupied cap=1 and male-only event, then accepted a female partner: 200, `pending`, no `over_cap` or gender advisory. The ordinary flow waitlists at capacity and flags gender mismatch. A distinct invitation deadline policy could be deliberate, but no explicit exception justifying all these omissions was found. **Gender is a soft advisory, not grounds to invent a hard refusal.** Missing fee/reason does not prove money was lost: submission-level total remains present.

**Smallest repair:** reuse applicable fee/reason/consent initialization and eligibility/capacity checks inside F04's transaction; explicitly encode any invitation-specific deadline exception. Show actual fee/consent before acceptance. **Completion:** free/paid/offline-payment acceptance produces complete records and truthful receipt/desk states; closed/full/changed policy is handled consistently; no external payment integration added.

### F07 — Medium — Withdrawal leaves misleading partner readiness; advertised capability can disagree with API

**Violates:** P9 truthful state and withdrawal consequences.

E3 accepted a pair, withdrew one half through its authenticated API, then read the survivor's My entries: withdrawn partner still rendered as the resolved partner, survivor `pending`, no `awaiting_partner` or equivalent signal. `lifecycle.py:236–274` changes only the withdrawn entry; `entries_me.py:438–450` builds the partner reference without lifecycle qualification.

Separately, `_can_withdraw` (`entries_me.py:284–297`) checks only lifecycle/deadline, while the route `:840–895` also rejects checked-out tournaments. H observed `canWithdraw:true` followed by 409 `EVENT_CHECKED_OUT`; current code confirms the mismatch.

**Smallest repair:** update survivor readiness/advisory and private projection transactionally; derive displayed withdrawal capability from the same applicable checkout/ownership/state/deadline rules. **Preserve historical links, fees under existing policy, and committed roster links**: automatic draw removal/refund is not the contract. **Completion:** both accounts and desk agree after success/rejection; retained history remains; a button is not promised when the known checkout fence prohibits it.

### F08 — Medium — Representation is accepted on import then lost; public support is incomplete

**Violates:** O4 and P3 representation/identity round trip.

E2 JSON import into `e083231e-cfb1-4491-8508-1517f18c3faf` accepted players a=TPE, b=KOR; fresh GET returned null, direct `bracket_participants.meta` was `{}` for both. `_build_draw_from_import` (`bracket/io/import_matches.py:291–306`) omits the validated field. Entry form/profile public DTOs also do not expose the complete new representation path (`entries_site.py::PublicPersonIdentityDTO`, entrant player types), despite operator fields and nullable database support.

**Smallest repair:** retain normalized representation through import/export and the existing roster/entry commit seam; expose per-tournament representation on intended public/entrant fields only after aligning the current name/club-only consent and publication contract (debt OUR-0909-3). Reuse canonical people; null remains Unknown. **Completion:** edit/import/export/reimport/reseed keeps IDs and event-specific representation; unsupported values rejected, unknown unchanged, and publication/consent authorization tested. Do not infer nationality or merge people from country/name.

### F09 — Medium — Email verification does not return to the entry draft

**Violates:** P6 authentication continuity.

`apps/entrant/app/routes/verify.tsx:112–123` routes successful verification to My entries. Its loader does not carry the original entry destination. This is a confirmed missing return path, not proof of lost session storage: E4 shows ordinary draft reload survives. New-account verification, recovery and expired-session browser completion remain unverified.

**Smallest repair:** propagate a validated same-origin return destination through signup/verification/recovery using existing auth primitives; resume the correct draft without storing credentials or invitation secrets unnecessarily. **Completion:** same and new-tab verification, expired session and recovery return to the correct participant basket while preserving required auth/consent.

### F10 — Medium — Public overview still drops full dates and sends deadline lookup to Draws

**Violates:** P2 full date range and useful entry availability/actions.

E4 Korea overview shows only Tuesday 4 August although its backend/Hub range ends 9 August and About explicitly says six days. `tournamentFrame.ts:210` builds metadata solely from `tournament.date`, ignoring available `endDate`. Its phase CTA can prioritize View draws while the calendar offers Enter and the entry route has an open XD event. Overview key dates says “Varies by event — see Draws,” reproducing the prohibited indirection. This is frontend derivation, not missing database dates.

**Smallest repair:** format supplied start/end dates and link event-specific deadlines to entry policy/details; choose an entry action from actual open events without removing legitimate draw/live navigation. **Completion:** identical fixture facts agree in calendar, overview and entry at desktop/mobile and across venue-date boundaries.

### F11 — Medium — Entry/partner/payment and result reasons remain incomplete on the wire

**Violates:** P8/P9 and cross-surface state agreement.

`MyEntryLineDTO` / `MyTournamentCardDTO` in `entries_me.py:67–158` do not carry pending reasons or complete payment state; `_ENTRY_STATE` collapses waitlisted to awaiting. Currency is absent from fee contracts; `money.ts` prints bare amounts. Not inventing a symbol is correct, but **currency was explicitly required by these plans**, so this is missing scope, not an informational non-defect. `NodeResultDTO` (`entries_site.py:799`) carries winner/score/walkover but not the stored retired/forfeit reason; result-reason parity remains incomplete.

**Smallest repair:** expose minimum authoritative public/private fields appropriate to each projection, including configured currency and distinct pending/partner/payment/participation states, and permitted outcome reason. Do not expose internal notes or payment details on player profiles. **Completion:** free, paid, offline-payment, waitlisted, awaiting-partner/approval, withdrawn and played cases agree across receipt/My entries/desk; non-played result reason agrees across sporting surfaces.

### F12 — Medium — Public history is visually folded but unbounded

**Violates:** P3 bounded initial history and performance requirement.

`entries_site.py::_person_history:2858–2865` explicitly expands every non-current tournament, “no cap.” `_expand_history_rows:2561` batches those targets; `player.tsx:373–378,546–557` places the remaining complete rows under `<details>`. Folding is not pagination: the API and HTML still contain the entire career. This is a demonstrable unbounded code path, **not measured latency and not an N+1 allegation**; the detail queries are batched.

**Smallest repair:** bounded deterministic history paging through the existing projection, with a native/enhanced Show more path. Preserve ordering, publication gates and stable identity. **Completion:** representative large history has bounded response/HTML/query volume while later pages remain reachable; no new polling/subscription architecture.

### F13 — Medium — Setup reports a checkout lock as a stale edit

**Violates:** O3 truthful save/error feedback.

E2 setup after a locally logged bracket operation returns `CONFIG_LOCKED`. `SetupProduct.tsx:717–723` maps every 409 to “This page changed elsewhere. Reload before saving again”; `api/client.ts:365–382` suppresses generic lock feedback. Reload cannot solve the authority fence. Source confirms the branch; H includes rendered lock feedback, not freshly recaptured here.

**Smallest repair:** distinguish lock, actual version conflict and transport failure; retain draft and explain the supported recovery. **Do not broadly remove the lock:** preparation freeze after checkout is documented. Whether standalone local authority should trigger the same fence is a contract question, not proof of a severe bug. **Completion:** each 409 code produces its real remedy and retains user input.

### F14 — Medium — Verification contracts are not reconciled; required gates fail

**Violates:** O11/P10 review handoff.

Fresh console build/tests pass, but entrant lint fails at `app/lib/side.ts:61` (`_reference` unused). Entrant tests have 50 failures; some explicitly assert superseded separators, seven-stage wizard or feeder prose, while others expose real heading/DTO discrepancies. `dtoParity.test.ts` reports `MyTournamentCard.isPast hand-only`: backend added it but generated console DTOs were not reconciled. Do not relabel every failed assertion as a product defect or every failure as an obsolete test.

**Smallest repair:** first restore domain invariants above, then update genuinely superseded contracts against both approved plans; fix real accessibility/type issues and regenerate/reconcile DTOs from the actual schema. **Completion:** required gates pass without weakening authorization, score geometry or behavioral assertions; new integration regressions fail against this reviewed implementation and pass against repairs.

### F15 — Medium — Public history merges different managed participants with the same name

**Violates:** O4/P3/P9 stable person identity and accurate cross-tournament history.

E3 used one verified account managing Alex Chen born 1975 in `audit-senior` (MS) and Alex Chen born 2010 in `audit-junior` (U17). Distinct persisted birthdays make the writer's `submissions.same_person` reject adoption. Anonymous public GETs nevertheless cross-link their histories in both directions; the father's profile includes the son's U17 event. `entries_site.py:2148–2170` keys history by account/name, its query at `:2217–2229` omits birth year, and `:2267` applies the weaker key. This is public sporting-history misattribution, not demonstrated private-data disclosure or mutation of the two player rows.

**Smallest repair:** align history discrimination with the writer's existing person identity rules; keep ambiguous/unknown identities separate instead of guessing. Preserve publication gates and the distinct imported-person spine. **Completion:** same-name/different-birth-year managed people do not cross-link; a verified repeat person still links across events/partners/representation changes. The isolated identity reproduction (`docs/audits/full-stack-implementation-evidence/test_identity_observed.py`) confirms the current defect.

## 5. Risks, rejected hypotheses and already-fixed items

- **Court discrepancy narrowed:** H's solver-court versus imported `courtLabel` comparison is not sufficient to report wrong live court. `entries_site.py::_merge_live_bracket_courts` intentionally publishes running claims; `MatchCard.tsx:150–156` already prioritizes the operational court. Remaining hypothesis: a null court withheld during a live dispute may fall back to historical text because fallback is not status-gated. Needs a disputed-live-match fixture before confirming a defect.
- **GET/PUT shapes and versions:** a read DTO containing derived/server-owned fields is not automatically a defective write contract; schema version and concurrency version being different is legitimate. No new repair endpoint or tolerant mass assignment is recommended solely to make GET→PUT echo succeed.
- **Clock distinction:** real audit timestamps are correct. Fixture inconsistency is possible where demo eligibility reads and withdrawal/invitation deadline checks use different clocks; test actual boundary decisions separately. Do not “fix” timestamps by freezing every write.
- **Unknown board URL fields:** accepting an unusable image URL or ignoring an unsupported key does not demonstrate XSS or a missing supported layout. No Critical security claim follows from those earlier observations.
- **Authority fences:** local operations can create an active standalone authority; not universally “the first result.” Do not remove checkpoint protections to make a later setup/publish test pass. H consolation publication was attempted after the fence; its failure is a test-order gap, not proof consolation cannot be published.
- **State improvement confirmed:** `_card_status` no longer declares Played merely because a date passed. Pending/withdrawn/rejected precedence is preserved. Its positive participation evidence currently comes from published result badges; ordinary early-round participation still needs broader verification.
- **Path/visibility improvement confirmed:** E4 scoped hidden behavior removes simultaneous enhanced Details/Review panels. Precise singles branch selection matches SSR/enhancement and clears correctly; opponents stay readable. Existing tests that demand the superseded behavior need intentional updates.
- **Other unproven risks:** operator whole-event pairing concurrency, representation loss during reseed/checkpoint serialization, live board propagation in every mode, capacity races in ordinary submit and private-profile behavior under a real two-origin ingress. These are not marked Pass because nearby unit tests are green.

## 6. Test record and material coverage gaps

### Fresh command outcomes

Full command records, selected logs and source identity are in the evidence directory: [gate summary](full-stack-implementation-evidence/gates.json), [failure names](full-stack-implementation-evidence/gate-failures.txt). Long raw gate logs remain under `/tmp/sw-final-audit`; the retained gate summary records outcomes without sensitive runtime data.

| Command / scenario | Actual outcome | Interpretation |
| --- | --- | --- |
| `make check PYTEST_WORKERS=4` with repo venv on PATH | Failed at entrant eslint | Earlier contrast/classes/token, console lint/type/tests/dependency checks ran; later gates were executed independently. |
| `npm run build:all` | Console + entrant builds passed | Buildability, not workflow correctness; browser evidence uses source-served runtime. |
| `npm run test:scheduler` | 268 files / 2,386 tests passed | Includes Hub, result editor, pairing, queue, display and contracts. |
| `npm run lint:entrant` | 1 unused-variable error | F14. |
| `npm run test:entrant` on host | 19 files failed / 39 passed; 50 tests failed / 1,166 passed | Obsolete expectations and actual gaps coexist; retained failure list. |
| `npm run depcruise`; `npm run depcruise:entrant`; API `lint-imports` | Passed | No detected dependency-contract violations. |
| `ruff check apps/api tests/backend tests/e2e simulator tools packages/scheduler-core` | Passed | Existing scoped source lint. |
| `npm run test:docs` | Host rerun: 57 passed / 6 skipped, zero failures | Sandbox runner initially reported string-ledger failure; isolated and full host reruns passed. Generated tracked scan restored to baseline. |
| `npm run docs:paths`; `npm run docs:build` | Passed independently | Documentation path/build gates completed despite earlier failure. |
| Fresh `alembic upgrade head`, `alembic check`, `alembic heads` | Passed on disposable SQLite; head f8a2b6c0d1e3 | PostgreSQL unverified; expression-index warning noted above. |
| Focused sync agent/concurrency/quarantine/offline sessions + tenant isolation/auth surface/concurrent state writes | 59 passed / 5 PostgreSQL cases skipped, 66.43 s | `test_tenant_isolation.py`, `test_auth_surface.py`, `test_concurrent_state_writes.py` plus the four named sync/offline files in gates.json; not a production-origin test. |
| `tools/event_node_acceptance.py --database /tmp/sw-final-audit/offline-node.sqlite3` | Passed | WAN connection creation blocked; local state/operation/outbox survived engine/session reopen and deletion of cache sentinel. Not a browser cache test or OS process/power-loss restart. |
| `test_operator_observed.py` | Defects reproduced, exit 0 | Persisted wrong winner/advancement, correction refusal, lock, representation loss. |
| Partner observation probes | 4 reproduced / 10.71 s | Fee/consent omissions, policy bypass, forced overlapping-read pair race, withdrawn-survivor projection. Mocked mail only. |
| Managed namesake identity probe | 1 reproduced / 2.99 s | Distinct birthdays, writer rejects merge, public history cross-links. |
| Quote observation probe | 1 reproduced / 3.27 s | Stale amount and regulations accepted without revised review. |
| Actual exported score-rule cap probe | null/25/35 all became cap 30 | F02; source export execution, not a renderer assertion. |
| `browser.mjs`, `browser-interactions.mjs` | Selected desktop/mobile and no-JS renders; draft/review checks | Initial Hub loading captures rejected and replaced with settled desktop capture. Initial gender selector error corrected before successful run. |
| `parity-check.py` | 155 same match IDs / 103 published results compared; zero result mismatches; operator snapshot stable before/after | Winner, ordered game scores and walkover agree for published results across five Taipei draws. Does not assert every participant/publication/date/court/profile/board field. |

**Backend full-suite outcome:** `make test PYTEST_WORKERS=4` on the host completed in 676.96 seconds: **2,554 passed, 5 failed, 74 skipped** (exit 2 from Make). Failures were `test_public_person_contract.py::test_every_sp_p9_serializer_has_its_exact_allow_list`, `::test_public_my_entries_keyset_rejects_extra_field`, `test_dto_generated_freshness.py::test_generated_schema_keys_match_the_live_schema_keys`, `test_entries_me_api.py::test_card_and_line_key_sets_are_exact`, and `::test_played_once_the_date_has_passed`. The last expectation is superseded by P9; exact-key/generated-schema failures need contract reconciliation, not removal of privacy allowlists. Skips include PostgreSQL/optional environments; they are not passes. The initial sandbox run stalled under the documented AnyIO/socket limitation and was stopped; the host run is authoritative.

### Recovered work and what it does not establish

Claude's `operator/report.md`, `journeys/report.md`, raw scenario outputs and browser scripts were recovered from `/tmp/claude-1000/-home-kyle-code-ShuttleWorks/8f735d3f-484e-4819-ab67-77b9d152d814/scratchpad`. They include actual isolated singles submissions/SQL receipts, quotes for one/multiple events and managed participants, same-key retry/race, cross-account receipt denial, partner acceptance/expiry, organizer confirm/pay/commit, withdrawal/export/erase, representation validation, real Monrad topology/scheduling and board settings round trips. Those scenarios are labelled **H**, not recast as fresh browser completion. Some prior conclusions were rejected above. Raw credential-bearing files were not copied into this report's evidence directory.

Specific remaining gaps:

1. **Operator:** fresh complete create→setup→public save browser journey; same-workspace Meet/Bracket row comparison and full filter/selection behavior; operator partner reassignment interruption/concurrency and intake reconciliation; complete consolation publication/withdrawal/correction; full result entry from all three controls; drag/keyboard timeline cross-midnight constraints; every board setting before/after on already-open preview/fullscreen across Meet/Bracket/hybrid.
2. **Entrant:** fresh browser signed-in singles receipt and My entries→desk reconciliation; signup→email verification and password recovery back to draft; expired-session recovery; both doubles members' complete keyboard path/round navigation; invitation mail delivery failure/retry through existing transport; native server review completion; whole privacy/export/erase browser journey. Existing service tests and H evidence provide narrower support, not a blanket Pass.
3. **Offline:** generic durable operation, retry and conflict tests ran. A real event-node/cloud process pair with WAN cut/reconnect and subsequent public SSR/board convergence was not run. The cache sentinel is not genuine IndexedDB deletion and engine reopen is not OS restart. Representation/pairing changed-flow offline replay remains incomplete. No new architecture is proposed to fill this gap.
4. **Security:** fresh scoped authorization suites and account-isolated integration fixtures support tested API boundaries. No demonstrated severe unauthorized access was found. Production two-origin ingress, capability cache replacement on an already-open wall, and every horizontal private endpoint have not been independently exercised in deployment shape.
5. **Time/performance/accessibility:** no representative career-scale latency/load benchmark, screen-reader audit, complete dialog focus trap/restoration, zoom/theme contrast or print pagination test. Source demonstrates unbounded history; it does not prove a particular response time. No blanket accessibility claim. Event-date grouping uses start date in some private derivations and remains a boundary-test target for multi-day/venue-midnight cases.

### Selected current captures

1. **Discovery — working for tested fixture.** Only the two published tournaments appear, with separate entry deadline/action. [Desktop capture](full-stack-implementation-evidence/discovery-1440.png).
2. **Overview — incomplete facts/actions.** Korea's full range is omitted and deadline lookup points to Draws. [Mobile capture](full-stack-implementation-evidence/overview-390.png).
3. **Entry details — improved stage visibility.** The inactive enhanced Review is hidden. [Details capture](full-stack-implementation-evidence/entry-1440.png).
4. **Review — broken quote contract.** Submit is offered with no computed total; this capture followed zero quote requests. [Review capture](full-stack-implementation-evidence/entry-review-unquoted.png).
5. **Native fallback — partial.** Complete form remains reachable, but review is not enforced. [No-JS capture](full-stack-implementation-evidence/entry-nojs.png).
6. **Selected singles path — working in tested branch.** Two actual matches and precise connecting branch; no emphasis beyond elimination. [Enhanced](full-stack-implementation-evidence/path-1440.png), [SSR/no-JS](full-stack-implementation-evidence/path-nojs.png).
7. **Hub — improved desktop structure.** Explicit columns, single Active/Past selection and honest undated drafts. [Settled capture](full-stack-implementation-evidence/hub-settled.png).

## 7. Ordered minimal repair checklist

No demonstrated Critical issue is claimed. Order follows observed transaction/result impact, then broken journeys, consistency and verification; dependencies are explicit.

- [ ] **Batch 1a: result correctness (F01/F02).** One effective rules interpretation at the domain boundary and correct nullable cap in all result editors. Evidence: valid/invalid format matrix plus atomic no-write failures, correct main/plate advancement and score/text agreement.
- [ ] **Batch 1b: acceptance and review transactions (F04/F05/F06).** Atomically claim invites; bind reviewed basket/price/consent; initialize partner money/reasons and apply policy consistently. Independent of 1a. Evidence: forced overlap, stale fee/version, full/closed event and free/paid acceptance; SQL counts/reciprocal links; no false receipt.
- [ ] **Batch 2: supported corrections (F03), after 1a.** Add versioned correction through existing command/outbox with defined played-descendant restriction and invalidation. Evidence: both main/consolation branches, scheduler dependencies, duplicate retry, offline replay and public convergence.
- [ ] **Batch 3: coherent entry management (F07/F09/F11), after 1b.** Survivor readiness, truthful withdraw capability, actual pending/payment/currency, safe auth return. Evidence: both pair accounts/desk agree; verification/session interruption resumes correct basket; withdrawn history and privacy retention remain correct.
- [ ] **Batch 4: representation and identity/history (F08/F12/F15).** Repair import/public field round trips and bound history using existing stable identity/publication rules. Evidence: repeated import/seed/checkpoint, unknown codes, historical representation, same-name managed persons and bounded large history.
- [ ] **Batch 5: scoped consistency (F10/F13).** Full dates/actions/deadlines; honest setup lock versus stale-write message. No authority-fence removal without resolving the standalone-authority contract. Evidence: same-ID public/operator dates and code-specific save failures retaining drafts.
- [ ] **Closure (F14), following affected batches.** Reconcile superseded assertions/DTOs, fix the identified heading and Review-focus defects, and verify remaining contrast/focus cases, run all required gates and missing targeted browser/offline journeys. Refresh only default books and selected major interactions through existing tooling if completing O11/P10; inspect them and retain machine-verifiable writes separately.

## 8. Preserve list

- Distinct Meet and Bracket domain records, lineup/advancement ownership and shared scheduler; no forced universal renderer or model merger.
- BWF side-aligned bracket/stacked scores versus centered paired row-sheet scores; doubles remain grouped inside their side.
- Approved timeline, current-match locking, 100-row operator defaults and existing route compatibility.
- Workspace scoring as the setup-owned default and draw settings' read-only link, with the result-cap repair above.
- Actual Monrad plate/main generation, loser feeders and scheduler dependencies; it is implemented engine behavior, not a fake checkbox.
- Explicit partner proposal/commit UX and draft-only generation restrictions; improve transaction guarantees behind it without replacing the picker.
- Scoped API authorization, verified entrant acceptance/withdrawal, private no-store receipts and public projection gates. Do not infer ownership by matching a seeded name.
- Existing SQLite event-node authority, operation/outbox/inbox/receipt/quarantine system, offline session policy, idempotent command replay and recovery; no synchronization rewrite.
- Nullable representation meaning Unknown; real per-event history; do not fabricate nationality, profile photos or achievements.
- Improved hidden-panel CSS, two-stage enhanced presentation, recoverable ordinary/offline public draft, precise tested path branches and readable opponents.
- Separate submission/payment/approval/commit and withdrawal/erasure semantics; retained sporting history and no automatic refund or draw removal.

The next repair batch is result validation/effective caps plus invitation/quote transaction integrity. These are demonstrated failures with small reproduction probes. Cosmetic completion and green builds cannot substitute for fixing them; the remaining coverage gaps must stay visible through the next product-testing handoff.

## Authorized repair follow-up — 2026-09-09

The assessment above records the original reviewed dirty build. The user subsequently authorized its minimal repairs, default surface-book regeneration and private Tailscale update. This follow-up distinguishes implemented repairs from the original audit evidence; it does not retroactively turn an unexecuted audit scenario into a pass.

| Finding | Repair in this checkout | Verification / remaining boundary |
| --- | --- | --- |
| F01/F02 | `bracket/result_validation.py` validates live score commands before writes; the shared `ResultEntryForm` honors nullable/custom caps, legal endings, decided-match limits and interrupted outcomes. Live uses that editor as well. | Invalid commands leave results/feeders unchanged; configured-cap and interruption regressions. Historical imports retain their existing contract. |
| F03 | `correct_result` uses the existing versioned command/outbox. `bracket/correction.py` verifies topology, restores dependent slots, replays retained siblings and invalidates downstream planning and published assignments atomically. Canvas, inventory and Live expose correction. | Reload, duplicate command, stale version and materialized-assignment checks. A started/recorded descendant, already-paired later Swiss round, or unverifiable imported topology is explicitly refused. Re-pairing played rounds is outside this repair. |
| F04/F06 | Partner acceptance locks intake before atomically claiming an unexpired invitation, then uses ordinary submission initialization for policy, capacity, consent version and fees. | Forced overlapping reads, paid acceptance, closure, reciprocal links and rollback/retry use disposable records and mocked mail. |
| F05 | Quote returns an opaque fingerprint of normalized basket, current price/currency and regulations version. Submission refreshes locked facts and refuses stale review without creating an entry. | Missing/stale review, fresh submission and idempotent receipt replay after closure. Native/enhanced Review requests the server quote; no payment-provider flow was introduced. |
| F07 | Withdrawal retains historical links but marks the survivor as awaiting a partner. Public/private active-partner projections exclude the withdrawn half. Advertised permission uses the same checkout fact as the write gate. | Both halves and the surviving account projection checked. Authority lookup is batched across My entries. |
| F08 | JSON/CSV roster paths retain validated representation. Entrant representation is optional and controlled; public projection requires explicit publication consent. Existing/unknown values are not assigned a country. | New migration defaults historical publication consent to false. Operator/import data does not itself grant entrant publication consent. |
| F09 | Signup, verification, resend and recovery preserve a narrowly allowed entrant return destination. Malformed destinations fall back safely. | Existing auth/CSRF/ownership gates retained; verification recovery tests updated to check the destination. |
| F10 | Public overview uses the full date range, backend entry action and entry deadline destination. | Rendered route tests and the default book capture. |
| F11 | Payment, pending reasons, waitlist, withdrawal and past grouping remain separate facts. Currency is explicitly configured or shown as unrecorded; submission fee basis freezes the receipt currency. Public results retain outcome reason. | Private DTO allowlists, entry-card tests, receipt tests and persisted partner fee assertions. Historical unknown currency is not inferred or backfilled. |
| F12/F15 | Public history uses the same account/name/birth-year discriminator as adoption, or explicit imported identity provenance. Expanded history is paginated ten other tournaments at a time. | Same-account namesakes remain separate; supported same-person links remain. Unknown birth years do not authorize a name-based join. Header discovery still precedes bounded detail expansion. |
| F13 | Setup distinguishes configuration/authority locks from stale-version conflicts and retains the draft. | No authority fence was removed. |
| F14 | Generated/manual DTOs and superseded assertions are reconciled; entry heading order and Back focus corrected. | Full gate outcomes and capture/deployment identity are recorded below when completed. Existing warnings and uncovered accessibility scenarios are not certification. |

Independent CODE_HEALTH reviews additionally caught and prompted repairs for PostgreSQL lock ordering, closed-page receipt shells, materialized correction assignments, Swiss pairing dependencies, Live duplicate controls, and repeated full snapshots inside per-match cloud projection records. Bracket serialization locks and version increments now belong to the repository. Locks expire the ORM identity map before fresh hydration. The pin solver remains outside the transaction and checks the baseline again under the write lock.

Preserved: separate Meet/Bracket models and presentation, generated consolation, existing scheduling constraints, local command/outbox storage, consent/authentication/tenant boundaries, existing payment modes, and unrelated working-tree changes. No production records, real invitations, charges, seed reset, merge or public Internet deployment are part of this work.

Remaining audit coverage limits: these repairs do not establish a complete event-node/cloud WAN-disconnection rehearsal. The accepted-operation projection now carries the latest bracket snapshot without duplicating it per result, but ordinary public/board reads still need separate verification against a real checked-out cloud/node pair. The initial audit's end-to-end reconnect, physical board viewing, screen-reader, erasure-retention and remaining workflow gaps remain gaps unless explicitly supplemented by executed evidence below. There is no new synchronization architecture.

### Repair verification record

**Repair-review verdict: Ready with conditions for further product testing.** The confirmed repair cases below pass; this is not a production-readiness certification or completion of every initially unverified workflow. The original matrix remains evidence for the pre-repair build.

- `make check PYTEST_WORKERS=8`: passed the blocking gates, including 2,391 console tests, 1,214 entrant tests and 2,583 backend tests. The default backend run skipped 74 optional dialect checks. Ruff, both type gates, dependency boundaries, import contracts, design token/contrast/class checks, documentation tests/paths/build passed. Documentation freshness remained advisory; existing lint/build warnings were retained.
- Later focused changes: complete entrant suite passed 1,215 tests after the recovery action; the final draft suite passed six cases, including actual event save/restore and deselect-all. The display/architecture follow-up passed 25 tests including two simultaneous absent-token reads. No failed check was counted as passing: earlier runs exposed obsolete fixtures and repair defects, each corrected and retested.
- Disposable PostgreSQL (`postgres:16-alpine`, localhost-only port 55439): 96 migration, sync concurrency, authentication and membership tests passed. This is additional dialect evidence, not a claim that all optional PostgreSQL scenarios ran.
- `test_audit_quote_repairs`, `test_audit_partner_repairs`, `test_audit_identity_repairs`, `test_bracket_result_score`, `test_swiss_round_route`, and the full public profile suite cover missing/stale quote, receipt replay after closure, partner money/consent, forced acceptance overlap, failed-claim rollback, survivor withdrawal, namesakes, bounded history, score validation, correction replay/version and assignment invalidation. The public profile suite passed 51 tests; the large-history regression spans fourteen isolated tournaments.
- Real Playwright browser, same normal fixture as the books: signed-in Review issued exactly one quote request, carried a server fingerprint and unticked consent; Back focused “Entry details”. An offline local edit produced no receipt and was recoverable after reconnect using “Restore saved draft”. Restoration clears quote and consent. No entry was submitted in this browser check.
- Visual capture exposed an additional confirmed defect: simultaneous first opens of board settings could both insert a display token and yield a 500 toast. Creation and rotation now serialize on their owning tournament; a forced-overlap regression confirms one stable capability. This was not excused as a successful screenshot capture.
- CODE_HEALTH review also found that old draft serialization stored event checkboxes as `on`, which could expand a recovered basket. Drafts now retain actual event IDs, compare both saved/current field sets, and recover an empty selection accurately. Old ambiguous `on` values do not select every event.

Initial documentation subprocess checks hit sandbox `spawnSync EPERM`; the same gates passed on the host. Fixtures, browser credentials and raw process logs remain local; only sanitized observations belong in this report. The migration head for the repair is `a9d3e7f1b5c8` (nullable fee currency and representation publication provenance), following `f8a2b6c0d1e3`. Existing currency/consent is not guessed during upgrade.

### Private demo update and final capture

`make demo-update` completed successfully after verifying backup `20260909T232553Z`. It preserved the existing durable PostgreSQL data without reseeding. Backend, entrant and frontend images all report the same source revision: `720647988f15caa9eb2e59c8d07d0adcc4554b31-dirty-a72bd30bb07b3d0a802bebc0f1e4bd2b39628e0b0c59c74c24bbb0032462cd79`. A read-only SQL query confirmed migration `a9d3e7f1b5c8`. This is the image's recorded dirty-source identity; subsequent evidence/report edits are not application changes.

Read-only live checks returned HTTP 200 for the [operator console](http://100.68.168.126:8090/), [entrant site](http://100.68.168.126:8091/e/) and API health endpoint; health reported `healthy`. Playwright rendered Workspaces and the season calendar with no page errors. The applications use the existing demo event clock and durable dataset; visual books use a separate disposable normal fixture, not the demo database.

The final browser regression also confirmed **exact event selection** after offline draft recovery. The normal fixture used T029/T030, review extras and event clock `2026-07-31T05:15:00Z`; security and audit timestamps remained real. An interrupted detached-fixture capture failed with connection refusal and was discarded. The replacement ran the fixture in a persistent foreground session. This was an environment lifecycle failure, not an accepted product test result.

Sanitized machine-readable repair/build/browser evidence is in [repair-validation.json](full-stack-implementation-evidence/repair-validation.json). The original audit evidence and unverified limits remain preserved.

Final default books: [operator PDF](http://100.68.168.126:8093/operator-console-surface-book.pdf), **37 surfaces / 47 pages**; [public PDF](http://100.68.168.126:8093/public-entrant-surface-book.pdf), **45 surfaces / 60 pages**. Both manifests are complete with zero failed viewports and all twelve selected interactions successful. All 91 operator and 107 public desktop/mobile/interaction images were inspected in contact sheets; result editor, disabled-board settings, settled Review, receipt and highlighted path also received full-size inspection. The two public console messages are the declared withheld-player 404 on desktop/mobile. Final fixture API/entrant logs contain no HTTP 500s.

The existing `surface-books-serve` workflow published only the PDFs. Both downloads returned HTTP 200 and `application/pdf`; downloaded bytes match the reviewed files exactly (8,214,808 and 8,798,240 bytes). PDF page objects match the manifests. Raw print markup returned 404. Capture directory: `docs/screenshots/ui-review/review-20260909T230025Z`.

Bounded visual/fixture limits remain visible: the existing mobile board-link field wraps excessively; discovery captures include the auxiliary `V3-PER-18 Open` workspace created by the isolated account-journey check. That fixture workspace was not seeded into the durable demo. The books are default surface evidence, not proof of submission, payment or synchronization; the separate integration/browser evidence above supplies the executed repair checks.
