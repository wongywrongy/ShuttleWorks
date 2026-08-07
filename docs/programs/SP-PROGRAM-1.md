# SP-PROGRAM-1 — ShuttleWorks Public Platform Program

**Type:** Master program document. Multi-session. Claude Code executes phases in order.
**Companion documents:** `docs/superpowers/specs/2026-08-06-entries-design.md` (the Entries spec, provisional, amended by SP-ENTRIES-R2 and SP-ENTRIES-R3), `SP-UI-1.md` (appearance pass), `docs/programs/ENTRIES_PROGRESS.md` (the program ledger — create in Phase 0 if absent), `docs/programs/SP-E1-1.md` (the executed Phase 5 prompt — history) and `docs/programs/SP-E1-2.md` (the Phase 5 delta prompt).

---

## HOW TO USE THIS DOCUMENT (session protocol)

1. **Every session starts by reading, in order:** this document → `docs/programs/ENTRIES_PROGRESS.md` → the most recent ledger entries of any other active program → `git log --oneline -20`. The ledger tells you which phase is active and what its last session finished. Never infer program state from memory or from older docs.
2. **One phase per session** unless the ledger shows the active phase is nearly complete and the next is small. Never start a phase whose entry conditions are unmet.
3. **Every session ends by updating the ledger:** phase, tasks completed with commits, gates run and their results, deviations (should be none — see rule 3 below), and the exact next task.
4. **STOP gates are hard.** Where a phase says STOP, halt and report to the user. Do not proceed in the same run. Gates marked **[USER SIGN-OFF]** additionally require explicit user approval recorded in the ledger before the next phase may begin.
5. This program runs alongside real life. A dogfood event (Phase 4) is calendar-bound and floats; all other phases are strictly ordered.

---

## ABSOLUTE RULES (apply to every phase, every session)

1. **This document is the plan. Deviation is a STOP, not a judgment call.** If reality contradicts this document — a file doesn't exist, a decision doesn't fit, a better idea appears — stop, write the contradiction in the ledger, and report. Do not improvise a workaround and do not silently "improve" the plan.
2. **Audit before edit.** Each phase begins with its stated audit step. Claims about the current system must cite file paths. The tree and the ledger outrank every other document, including this one's assumptions.
3. **TDD for behavior; screenshots for visuals.** Characterization tests before touching load-bearing code. Every safety-relevant test gets a negative control (CODE_HEALTH rule 3b — it has caught three fake-passing tests; it is not optional).
4. **No new runtime dependencies without a STOP.** This includes frontend frameworks (Phase 6 is the single sanctioned exception, and it has its own gate), component libraries, brokers, and services.
5. **Verification gates per phase are non-negotiable:** frontend typecheck + full Vitest + production build; backend full pytest; compose round-trips when compose files change. Re-baseline test counts in Phase 0; after that, counts only go up.
6. **Docs update in the same commit as the code they describe.** The selfhost install docs are load-bearing: any compose/infra change that isn't reflected in them is a broken deliverable.
7. **Commit per task; branch per phase** (`dev/prog1-p<N>-<slug>`); merge decisions are [USER SIGN-OFF].
8. **Boy Scout Rule bounded to touched files.** No opportunistic refactors outside phase scope.

---

## PROGRAM INVARIANTS (violating any of these is a defect, in any phase)

- **I1 — Domain is configuration, never code.** All generated absolute URLs (emails, capability links, share links, QR targets) flow through `APP_BASE_URL` / `PUBLIC_BASE_URL` (name per existing settings conventions found in audit). Internal navigation is relative. A CI guard greps for hardcoded hostnames (`wongworks`, and later the production domain) outside config, docs, and tests — added in Phase 2, kept forever.
- **I2 — Prototype domain is `wongworks.dev`.** `app.wongworks.dev` = operator console + API (Cloudflare Access over the whole hostname). `play.wongworks.dev` = public tournament site (no Access; WAF + rate limits). Apex marketing is deferred to Phase 11. Access policy is **hostname-scoped only** — the moment Phase 2 completes, no path-based Access exclusions may remain necessary for new work, and Display's `/display/*` exclusion is scheduled for retirement when its links migrate to `play.*`.
- **I3 — The dual-mode boundary:** Entries is cloud-only; **the cloud dependency ends at commit**. Event day never reads an entry row. Local mode never sees the Entries module (mode-aware seed omits the row; local mode also filters an inherited row at read time — see R6). No `coming_soon` state may exist in any form, ever, including placeholder phases or "future" UI slots.
- **I4 — Software flags; operators decide.** No consequential outcome (confirm, reject, promote, default, remove-from-roster) is ever automatic. Auto-waitlist at cap is a queue position, not a decision. Payment clears exactly one pending-reason and never confirms an entry.
- **I5 — Public writes are deliberate.** Every session-free route is an explicit, justified entry in the auth-surface test. **Amended by R10:** the session-free public write is now **account signup**, and it is the surface that carries server-side Turnstile validation; **entry submission sits behind an authenticated `play.*`-scoped session** and is no longer session-free. Both carry edge + nginx (`sw_entries` zone) + DB-backed app throttles (entrant credentials get their own throttle namespace) and the global body cap; uniform-404 behavior is unchanged. The client `Idempotency-Key` (solve-rail semantics) attaches at the **submission** level, not the entry level (R13). Any token that survives — public read links, the E3 partner invite — is stored **hashed** (auth_sessions precedent, not the display-token plaintext precedent); the entrant *manage* token is retired (R10).
- **I6 — Entrant-facing data rules.** Public entry pages show names + events only — never emails or contact data. Entrant list is published by default with notice at the acknowledgment checkbox. Regulations/waiver text is versioned; **every submission records `regulations_accepted_at` + the accepted version** (R13 moved acceptance from the entry to the submission — one form act, one acceptance). **Erasure rides the account machinery** (R10): withdraw-and-erase and data export are account operations, not capability-link operations, and still ship in E2 (Phase 7), not later. Retention still anonymizes entry PII post-event while accounts persist.
- **I7 — Surface split (replaced by R11).** Operator app stays desktop-only — unchanged. **`play.*` is responsive with desktop and mobile as co-equal first-class layouts**: the entry flow is desktop-comfortable *and* fully usable at phone width; read surfaces lean mobile; the checkable bar is **no horizontal scrolling and no degraded functionality at either width**. Meet/Bracket/Operations/Display in-module operator UIs are untouched by this program except where a phase explicitly says otherwise. (Superseded text, kept for the record: *"Everything on `play.*` is mobile-first."* See spec §2A (R3).)
- **I8 — Seams over sync.** Entries → roster is the re-runnable, additive, idempotent commit seam (Seam A in the spec); Meet-blob writes go through `If-Match`/`state_version` fetch-modify-retry, never blind overwrite.

## STANDING RULINGS (decided by the user; encode, do not relitigate)

- **R1** — Entries is a Tier-1 module, mode-aware seed, `MODULE_REQUIRES_CLOUD` guard (spec Q1).
- **R2** — `entry_events` is Entries-owned; optional `bracket_event_id`; Meet maps via rank codes (spec Q2).
- **R3** — Commit is re-runnable/additive/idempotent; entries may reopen; post-commit withdrawal = attention flag (spec Q3).
- **R4 — SUPERSEDED BY R10 (2026-08-07). Kept, not deleted:** ~~Public slug for the page + hashed capability token per entrant; no entrant accounts (spec Q4).~~ The public slug for the *page* survives; the no-accounts half is reversed and the per-entrant capability token retires from the manage path. R4's original reasoning is preserved as a rejected alternative with the reversal rationale in **spec Q13** (and Q4's rejected-alternative block).
- **R5** — Regulations & waiver: director-discretion `waiver_required`, versioned text on `entry_pages`, acknowledgment gates submission; guardian language lives in waiver text at director's discretion; DOB/birth-year is a plain eligibility field. The waiver does not waive GDPR; retention + erasure still ship (E5/E2 respectively).
- **R6** — Cloud→local inheritance: a workspace restored into local mode has its Entries module row filtered at read time, mirroring the seed logic. Verify feasibility in Phase 1; if the read-path filter is awkward, STOP with alternatives.
- **R7 — Contact/player model (confirmed at the Phase 1 STOP; HARDENED BY R13, 2026-08-07).** R13 turns R7's "stay forward-compatible with a later contact/players split" into a **mandatory schema** — `account → submission → entries → players` — so the extraction R7 kept cheap is now required rather than optional. **R7's soft-duplicate flag survives unchanged.** Original text: drop the hard `(entry_event_id, lower(contact_email))` unique index. Shared emails are legitimate (parent entering two children; club rep entering many players). Duplicate suspicion (same event + email + same player name) raises a **soft attention flag**, operator resolves. Schema stays forward-compatible with a later contact/players split: keep player-identifying fields distinct from contact fields in the `entries` row so extraction into an `entry_players` table is a migration, not a redesign. The idempotency-key unique index stays (it guards retries, a different failure).
- **R8** — Framework for `play.*` is decided in Phase 6, not before, against the real E1 page. Candidates: Astro + React islands; React Router SSR. Decision criteria: mobile weight, SEO/unfurl, design-system reuse, solo maintainability.
- **R9** — Domain cutover is a Phase 11 checklist item, not a background worry: new zone, DNS, tunnel ingress + Access on new hostnames, re-key Turnstile, re-do SPF/DKIM, flip the two base-URL vars, Cloudflare redirect rules from wongworks hostnames kept for ≥ the entry-retention window, old capability tokens keep resolving (token is the credential, not the hostname).

### Added by the SP-ENTRIES-R3 master amendment (user-decided 2026-08-07)

R10–R14 are transcribed below as ruled, not paraphrased. They arrived **after E1 shipped and
merged** (`86182af`), so every one of them supersedes a shipped shape rather than a design on
paper; the divergence report is in `docs/programs/ENTRIES_PROGRESS.md` ("SP-ENTRIES-R3 —
Master amendment (R10–R14): RULE-4 STOP") and the spec-side encoding is in
`docs/superpowers/specs/2026-08-06-entries-design.md` §2A (R3), Q4, Q12 (R3), **Q13**, **Q14**.

- **R10** — Entrant accounts REQUIRED, superseding R4's no-accounts model (R4's original
  reasoning must survive as a rejected alternative + reversal rationale). Account =
  SUBMITTER not player; one account enters many players (parent→children, club rep→members);
  self-entering player is the common case not the model. Second principal type through the
  EXISTING auth machinery (Argon2id, NIST 800-63B sessions, DB-backed throttles); no org
  membership, no operator roles; sessions scoped to the public host (`play.*` cookie,
  separate from `app.*`, no sharing). Users-table-vs-sibling-table is an audit-informed
  implementation decision the spec FRAMES, not fixes. Password-based auth is the DEFAULT
  `[CONFIRM AT STOP` — marker stays in the text until the user's recorded sign-off; note the
  user let the default stand on 2026-08-07`]`; rejected alternative recorded: passwordless
  email-code. Capability tokens RETIRE from the entrant manage path (login-gated "my
  entries"); tokens remain for public read links (display); E3 partner confirmation becomes
  an INVITE-TOKEN flow (existing invite-link precedent) driving account creation. GDPR
  reshape: deletion/export ride account machinery; retention still anonymizes entry PII
  post-event while accounts persist; minors: accounts held by submitters (typically adults),
  waiver guardian language covers entered players; a self-entering minor holds an account as
  on the incumbent platform.
- **R11** — Responsive posture: public site responsive with desktop and mobile CO-EQUAL
  first-class layouts. Entry flow desktop-comfortable AND fully usable at phone width; read
  surfaces lean mobile. Amends invariant I7's "everything on `play.*` is mobile-first";
  replaces E1's "390px is the bar" with "both widths, no horizontal scrolling, no degraded
  functionality at either."
- **R12** — Field policy (GDPR minimization governs): per player: name, GENDER (required —
  MS/WD/XD event filtering impossible without it), club (free-text optional). Per
  account/submitter: email (login identity), phone (director-toggleable per tournament, off
  by default). Never in v1: postal address, federation/member IDs, DOB except as plain
  eligibility field where an age-bracketed event requires it (R5). Gender enforcement SOFT:
  form filters eligible events by default, override path exists, mismatch =
  operator-resolvable attention flag, never a hard block.
- **R13** — Submission model, R7's split now MANDATORY schema: account → submission →
  entries → players. A submission = one form act covering 1–N events; `Idempotency-Key`,
  regulations acceptance (timestamp+version), computed fee total attach to the SUBMISSION;
  entries remain per event per player-unit; player identity in its own rows/fields (audit
  decides `entry_players` table vs structured fields; spec states the invariant: player
  fields never mixed into contact/account fields). R7's soft-duplicate flag survives
  unchanged (same player name same event across submissions → flag, operator resolves, no
  hard unique index).
- **R14** — Pricing/deadlines/policy: TIERED per-person pricing primary (tournament-level fee
  schedule 1/2/3 events → cumulative price; per-event `fee_cents` fallback); form shows
  running total; v1 payment manual (R8 boundary untouched); `payment_instructions` free-text
  on `entry_pages` (Zelle/Venmo/at-the-desk norm) rendered publicly. `withdraws_until` joins
  `opens_at`/`closes_at` (BWF separates withdrawal from entry deadline; feeds E2 withdrawal +
  `COMMITTED_ENTRY_WITHDREW`). Entry policy per tournament: max events per person, optional
  per-discipline caps; form-enforced, operator can override at the desk (I4). Public
  tournament page adopts the incumbent's proven IA as a rendering of fields we have:
  fee/instructions block, timeline (opens→closes→withdrawal deadline→start), events+entry
  counts, organization+venue cards, prominent Enter action. AUDITED FACT: the tree has NO
  venue name/address anywhere — "venue" is structural scheduling data only
  (courtCount/intervalMinutes/dayStart/dayEnd, `api/tournaments.py:697-698`); the org card can
  draw only the org name. The venue card therefore needs a new field (state where it should
  live) or is explicitly deferred — say which.

*(R14's venue question is answered in the spec, not here: Q14 §6 adds `venue_name` +
`venue_address` as free text on `entry_pages` — off the state blob deliberately, so a venue
address can never 409 against the fail-closed `CONFIG_LOCKED` guard.)*

**Note on R8:** R14's phrase "R8 boundary untouched" refers to the **payments** deferral
boundary, which this program numbers **Q8** in the spec. Program ruling R8 (the `play.*`
framework decision) is a different thing and is likewise untouched — see Phase 6.

---

## PHASES

### Phase 0 — Consolidate and baseline

**Entry:** none. **Branch:** none (merge work).
1. Audit branch state; merge `dev/cloud-audit-fixes` (or whatever the ledger shows outstanding) to main. **[USER SIGN-OFF]** on the merge.
2. Re-baseline: record backend/frontend test counts, compose round-trip status, alembic head in the ledger.
3. Create `docs/programs/ENTRIES_PROGRESS.md` with this program's phase table and the baseline.
**Exit:** single up-to-date main; ledger exists. **Done check:** `git branch` shows no stacked dev branches pending; ledger committed.

### Phase 1 — SP-ENTRIES-R2: spec delta pass

**STATUS (historical): DONE 2026-08-06.** The instructions below are kept as the executed
record and are **not re-run**. Two of them were superseded the following day by the
SP-ENTRIES-R3 amendment and are annotated inline so nobody re-executes them as written:
item 2's "**mobile-first** frontend" (→ **R11**: co-equal desktop and mobile) and item 4's
entry-level acceptance fields (→ **R13**: the acceptance pair moves to the submission).

**Entry:** Phase 0 complete. **Deliverable: spec amendments only — zero production code** (same discipline as R1: `git status` = spec + ledger changes only).
Amend `2026-08-06-entries-design.md`:
1. Fold in rulings R5–R7 as decision sections with rejected alternatives (R7: record the rejected hard-index option and why).
2. New section: **three-surface architecture** — apex/app/play hostname model, Access-by-hostname, the public site as a distinct mobile-first frontend sharing design tokens and backend, Display's public views migrating under `play.*` over time; `wongworks.dev` prototype domain + R9 cutover plan; invariant I1 stated as a spec invariant.
3. Amend Q4: entrant list public-by-default ruling (names + events only), notice at acknowledgment, per-entrant opt-out flag in schema.
4. Amend §4 schema: regulations/waiver fields (`entry_pages`: text, `waiver_required`, `regulations_version`; `entries`: `regulations_accepted_at`, accepted version, list-opt-out), R7 shape (drop natural-key index; separate contact vs player fields), R6 note.
5. Add the remarks field (free-text availability note carried through commit onto the roster player) + one context sentence: entries feeding the CP-SAT solver is the structural differentiator vs the incumbent.
6. Amend §7 delivery to match this program's phase mapping (E1→Phase 5, scaffold→6, E2→7, E3→8, E4→9, E5→10).
7. Resolve spec open question #6 now: attention codes promote to a shared constant — assign it to Phase 3 scope.
8. Verify R6 feasibility against the tree; write the mechanism into Q1.
**STOP [USER SIGN-OFF]:** present the delta summary + explicit R7 confirmation. Spec status flips provisional → accepted on approval.

### Phase 2 — Track B: deploy on wongworks.dev

**Entry:** Phase 1 signed off (hostname plan is an input here — this is why deploy waits).
1. Audit `docs/how-to/install-selfhost.md` + compose files against the tree.
2. Introduce the I1 base-URL config seam in backend settings + wherever absolute URLs are generated today (display links, invite emails); add the CI hostname-grep guard.
3. Execute install-selfhost.md **on cayde, literally, fixing the doc at every divergence** — the doc is the deliverable as much as the deployment. Tunnel ingress: `app.wongworks.dev` → nginx; `play.wongworks.dev` reserved in DNS + tunnel config but routed to a 404/placeholder. Access policy: whole-hostname on `app.*`. Postgres tailnet-bound. neo: standalone worker + tunnel replica (origins via cayde's tailnet address, so the replica survives cayde's cloudflared dying — document that it does **not** survive cayde itself; that SPOF is accepted per the no-orchestrator decision).
4. Backups live: pg_dump + globals to neo and B2; run one restore drill; record it.
5. Health/readiness/metrics reachable via ops token; smoke-test a full tournament round-trip from an external network.
**STOP [USER SIGN-OFF]:** deployment live, doc corrected, drill logged. **Exit condition: the user can run a tournament from any browser via `app.wongworks.dev`.**

### Phase 3 — SP-UI-1: appearance pass

**Entry:** Phase 2 complete. **Execute `SP-UI-1.md` as written** (its own rules, gates, and STOPs apply), with two program amendments: (a) the attention-code shared-constant promotion is **in scope** (assigned here by Phase 1.7); (b) the phase-enum contract must anticipate the seven-value vocabulary from spec Q9 — unknown values render the safe default, tested.
**Exit:** SP-UI-1 done conditions met. Guard: no operator in-module surfaces modified (`git diff --stat` check).

### Phase 4 — Dogfood (floating, calendar-bound)

Runs at the first real event after Phase 2; does not block Phases 3/5 from proceeding around it. Before the event: fresh backup + restore-drill confirmation. After: a ledger entry of operational findings, explicitly tagged as inputs to the Entries desk design (Phase 7) and Overview live-phase (already-shipped SP-UI-1 debt log if gaps found). **No code during the event window.**

### Phase 5 — E1: the walking skeleton (public-write pipe)

**STATUS (2026-08-07): E1 is SHIPPED and merged (`86182af`), executed locally under program
AMENDMENT A1** (user-authorized: development proceeds before Phase 2; the [USER SIGN-OFF]
public-exposure gate below is preserved in full and now sits after Phase 2). **The phase is
not closed** — SP-ENTRIES-R3 adds a delta slice, E1-2, inside this same phase. Do not
renumber; the two slices are 5 and 5-delta.

**Entry:** Phase 2 complete; Phase 3 recommended-complete. **Scope is the spec's E1, amended by Phase 1 — nothing more.** Cloud-only; one `entry_event`; singles; no payment/partner/cap/email-verification.
1. Backend: migrations for the Phase-1-amended schema (create all E1-relevant tables/columns now to avoid churn, use only the E1 subset); module row + mode-aware seed + `MODULE_REQUIRES_CLOUD` (R1); public routes: slug page data, submit (I5 stack complete), operator desk list, commit (Seam A contract from the spec, including `If-Match` retry — characterization-test the Meet blob path first).
2. Auth-surface test: the deliberate allowlist edits, each justified.
3. Public page: **served straight from FastAPI templates, deliberately minimal, mobile-usable.** No frontend framework. Regulations acknowledgment checkbox included (it gates submission from day one; versioning fields recorded).
4. Infra: `sw_entries` nginx zone; Turnstile server-side validation; Cloudflare Access exclusion is **not** needed if `play.*` hosts the page — route the public page under `play.wongworks.dev` now (first real use of the reserved hostname). Update install docs in the same commits.
5. Negative controls on every security test (Turnstile bypass attempt, throttle, idempotency replay, uniform-404, cross-tenant probe).
**STOP [USER SIGN-OFF] before DNS/tunnel makes the form publicly reachable** — a security review gate: present the auth-surface diff, the defense stack evidence, and the negative-control results. Then: end-to-end proof — a phone on mobile data submits an entry; the operator commits it; the player appears on the roster; the workspace then runs **offline** (I3 demonstrated, recorded in the ledger).
**Done check:** if no migration files and no auth-surface test edits exist, the phase did not complete.

#### Phase 5 (delta) — E1-2: the R3 slice over a shipped E1

**Entry:** E1 merged (done) + the SP-ENTRIES-R3 documents amended. **Scope is spec §7's
E1-2 row — a delta over working code, not a rewrite.** Prompt: SP-E1-2. The E1 record above
and its Phase E ledger entry are **history and must not be retro-edited**.

1. **Audit first (rule 2), and it owes three answers the spec deliberately left open:**
   entrant storage — `users` table vs sibling table (spec Q13 §3, recorded bias toward a
   sibling table, four questions to close); session scoping and the **CSRF trap** — the
   middleware triggers on a *single* cookie name (`app/main.py:250`), so an entrant cookie
   under a different name would fall outside enforcement, and the audit must close this
   explicitly (Q13 §2); whether player identity is an `entry_players` table or structured
   fields (R13).
2. **Accounts in the pipe** (R10 / Q13): signup, login, logout, all on the existing
   machinery; `play.*`-scoped session; entrant throttle namespace; **Turnstile moves from
   submit to signup** (I5 as amended). **Email verification and password reset are NOT in
   this slice** — they are E2 / Phase 7 (spec §7, SP-E1-2 non-goals). Until they exist,
   an unverified account may submit and its entries land in **`pending`** (ruling D1,
   unamended by R10–R14 — spec §6); `unverified` stays unentered, because its only exit is
   the verification transition and Seam A commits only `confirmed`.
3. **The submission model** (R13): `account → submission → entries → players`; multi-event
   form; `Idempotency-Key`, regulations acceptance and computed fee total move to the
   submission; `UNIQUE (tournament_id, idempotency_key)` (ruling D4) becomes submission-level.
   R7's soft duplicate flag is preserved verbatim in behavior.
4. **Fields** (R12/R14): gender required with **soft** filtering + attention flag; club;
   director-toggled phone; fee schedule + running total; `payment_instructions`;
   `withdraws_until`; entry policy caps; venue fields on `entry_pages`. **Migration posture:
   additive-then-narrowing** — every step keeps a green suite behind it. `gender` is the one
   lossy backfill (no source on existing rows): mark unknown-and-flagged, never guess.
5. **Token retirement** (R10): drop `Entry.manage_token_hash`, delete the success-page code
   card, remove the `POST /e/{slug}/submit` auth-surface allowlist entry and rewrite the
   preamble sentence that says an entrant has no account. Each removal is an auth-surface
   test edit and is justified in the diff — the allowlist only ever shrinks silently by
   mistake.
6. **R11** applies to whatever renders the form; if that is still the throwaway E1
   `HTMLResponse` page, the co-equal-width bar lands as a **Phase 6 acceptance criterion**
   rather than a retrofit (spec §2A (R3)).

**Unaffected by design, and a check on scope creep:** the operator desk, the Seam A commit
contract, the entry-page/entry-event config routes, and the module system. Finding **F-E1**
(Meet rank-slot mapping, spec §9.3) stays open and is **not** in this slice — do not patch it
ad hoc.
**Done check:** `manage_token_hash` is gone from the models *and* the tests; a submission row
carries the idempotency key; test counts strictly up despite the deletions.

### Phase 6 — Public-site scaffold + email infrastructure

**Entry:** Phase 5 exit proof done.
1. **Framework decision (R8): STOP [USER SIGN-OFF]** — present both candidates *against the real E1 page* with a one-page tradeoff (mobile weight, SSR/unfurl, token reuse, maintenance). **Amended by R11: the criteria are no longer mobile-weight-first.** Candidates are judged on serving **co-equal desktop and mobile layouts** for a **form-heavy** flow — multi-event selection with a running fee total (R14) is a table-shaped interaction — plus authenticated session rendering (R10) alongside the public read pages. A candidate that is excellent at static mobile reads and poor at a wide authenticated form now loses on the primary criterion, not a secondary one. On approval, this is the sanctioned new-dependency exception.
2. Scaffold the `play.*` app as the fourth compose service: design tokens imported from the shared design system; the E1 FastAPI page's routes re-served through it; SEO basics (meta, OG unfurl, sitemap for slugs); light-page budget stated and measured. **R11 acceptance criterion (inherited from the E1-2 slice): no horizontal scrolling and no degraded functionality at either width**, checked on the entry flow and the read surfaces, screenshots at both.
3. Transactional email provider: pick (Postmark/SES/Resend-class), configure SMTP backend via the existing seam, SPF/DKIM/DMARC on wongworks.dev, deliverability-test verification + partner emails. Start DNS records on day one of the phase (propagation). **R10 raises the stakes here:** account verification and password reset are login-path dependencies, which is one of the three reasons passwordless was rejected (spec Q13 §4) — deliverability is now a login concern, not only a notification concern.
4. Install docs + compose docs updated; CI guard extended if the provider introduces URLs.
**Exit:** `play.*` serves the entry page from the new app at both widths; a real verification-class email lands in a real inbox.

### Phase 7 — E2: lifecycle

**Entry:** Phase 6 complete. Spec E2 **as amended by R10/R14**: **account** email verification (double-opt-in) and **password reset** finalized on the existing machinery; a **login-gated "my entries"** surface carrying manage / withdraw / **withdraw-and-erase** — this **replaces the hashed capability-link manage path**, which E1-2 already retired (I6: erasure is in this phase by design, it is nearly free here, and cheaper still riding the account than a token the entrant must still possess); **withdrawal is checked against `withdraws_until`** (R14), and a post-commit withdrawal still raises `COMMITTED_ENTRY_WITHDREW` rather than mutating the roster (R3); caps + waitlist (auto-waitlist = queue position only, I4); pending-reasons; operator desk confirm/reject/promote; regulations acknowledgment recording finalized **at the submission level** (versions bump on edit); entrant-list opt-out honored on the public page; remarks field through the commit seam. Uniform-response rule: nothing public ever reveals whether an email already entered — **and R10 extends it to signup and reset**, which must not become account-enumeration oracles.
**Exit gates:** full suites + a lifecycle state-machine test module covering every transition and actor from spec §6, with negative controls on the operator-only transitions.

### Phase 8 — E3: doubles

**Entry:** Phase 7 complete. Spec E3 **as amended by R10**: partner nomination by email; partner confirmation via an **invite token on the existing invite-link precedent**, which **drives account creation** — the invited partner signs up or logs in and *then* accepts, so acceptance is an authenticated act by a principal rather than possession of a link (this replaces "their own capability link"); the invite token is stored hashed (I5); `awaiting_partner` pending-reason; pair conflicts double-flagged and operator-resolved (never auto). Unpartnered ≠ over-cap: the two states stay independent (the incumbent-beating design point — preserve it). Deferred items stay deferred (partner pool, swaps, splits, identity merge).

### Phase 9 — E4: signals, phases, public reads

**Entry:** Phase 8 complete (needs real entry states).
1. Extend `_derive_phase` to the seven-value vocabulary (spec Q9) — additive; the four existing values keep exact meanings; workspaces without the Entries module still derive only the original four.
2. Six attention codes with spec trigger conditions, via the Phase-3 shared constant; Hub next-action mappings; Overview absorbs the new phases through the SP-UI-1 panel seam (this should be data + panels, not redesign — if it isn't, STOP: the seam failed and that's a finding).
3. Public read surfaces on `play.*`: entrant lists per event (opt-outs honored), and post-close acceptance/reserve lists in order. **Plus the R14 §6 public tournament page IA** (spec §7's E4 row): fee + `payment_instructions` block, the `opens_at → closes_at → withdraws_until →` start timeline with timezones, events + entry counts, org and venue cards, prominent **Enter** action — the real rendering of what E1-2 sketched on the throwaway page.
**Exit:** phase/attention behavior fully unit-tested; Overview screenshots across entries phases.

### Phase 10 — E5: money, retention, compliance

**Entry:** Phase 9 complete. Fee display + operator manual paid/unpaid **at the submission level** (R13/R14: the total and the payment record are properties of one act) + `awaiting_payment` reason; retention default + the anonymization job (entry PII scrubbed N days post-event, aggregate rows kept, **accounts persist** — I6/R10; job is idempotent and tested); GDPR verification pass covering **both layers** (R10): withdraw-and-erase actually erases (test proves the PII is gone), **account deletion and account-level data export** work and are tested, retention documented, the debt-log GDPR entry updated to reflect what Entries added and resolved. Stripe remains **post-program** — the Q8 boundary is documented, not built.
**Exit:** the public-launch blockers named in spec Q10 are closed.

### Phase 11 — Cutover + marketing (post-prototype; entry condition is the user declaring prototyping done)

1. Execute the R9 cutover checklist onto the production domain. Rehearse first: prove the two env vars + re-keyed Turnstile + redirects produce a working system with zero code edits — **that is the I1 invariant's final exam.**
2. Marketing site on Cloudflare Pages at the new apex (static; content is the user's; structure only).
3. Retire the `/display/*` Access path exclusion once display links live under the public host.
**Exit:** program complete; ledger closed with a final state summary.

---

## WHY THIS ORDER (do not reorder)

Deploy waits for the spec delta because the hostname plan is deployment input — deploying single-hostname and re-doing ingress/Access is the exact rework this document exists to prevent. E1 waits for a validated deployment because a public write surface on an unvalidated stack is the one sequencing error with real blast radius. The framework decision waits for E1 because choosing a frontend architecture before the pipe it serves exists is speculation. Erasure lands in E2 because it costs almost nothing at form-build time and a retrofit is expensive. Signals wait for real entry states. Money and compliance close the launch gate. Cutover is last and must be boring.

## GLOBAL NON-GOALS (entire program)

Stripe processing · partner-search pool · ~~entrant accounts~~ **(R10, 2026-08-07: no longer a non-goal — entrant accounts are v1; see the R10 ruling above and spec Q13)** · cross-tournament registry · Entries in local mode · seeding automation · duplicate-identity merging · refunds · waitlist lotteries · mobile/responsive work on the operator app · any redesign of Meet/Bracket/Operations/Display operator surfaces · orchestrators/HA beyond the stated two-node posture · logo design.

## PROGRAM DONE CONDITIONS

- [ ] Every phase's STOP/sign-off recorded in the ledger with date and outcome
- [ ] All invariants I1–I8 hold; the I1 grep guard is green in CI
- [ ] Spec status: accepted, amended through Phase 1 **and the SP-ENTRIES-R3 master amendment (R10–R14)**, discrepancies inherited forward
- [ ] Test counts strictly above the Phase 0 baseline; all gates green on main
- [ ] Install/selfhost docs accurate to the deployed reality (verified by the Phase 2 literal walkthrough and kept current per rule 6)
- [ ] The I3 demonstration (entry submitted publicly → committed → event runs offline) is recorded in the ledger
- [ ] Cutover rehearsal proved zero-code-domain-change before execution
