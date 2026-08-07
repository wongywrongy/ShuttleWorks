# SP-E1-2 — Reshape the shipped E1 intake for R10–R14 (the delta slice)

**Type:** Implementation. Executes **SP-PROGRAM-1 Phase 5 (delta)**, spec §7 row **E1-2**, under the same user-authorized amendment A1 that put E1 ahead of Phase 2. **Deliverable:** entrant accounts in the pipe, the mandatory submission model, the R12 field policy and the R14 pricing/deadline/policy fields — landed over a *working, merged* E1, with the commit seam's contract untouched.

**Predecessor:** `docs/programs/SP-E1-1.md` — the **executed** E1 prompt. It is history. **Its Phase E record is never retro-edited**, and neither are the ledger entries that describe what E1 shipped.

---

## CONTEXT — this slice supersedes a shipped shape, not a design on paper

E1 was implemented, adversarially verified, demoed end to end and **merged to `main` as `86182af`** on 2026-08-06. Rulings **R10–R14** arrived the next day. The amended spec (`docs/superpowers/specs/2026-08-06-entries-design.md`, SP-ENTRIES-R3 pass, commit `b84ef14`) is the source of truth for every contract below and states, per section, what E1 shipped and what changes.

**Shipped behaviors this slice deletes** (each is live in `main` and pinned by tests):

| Shipped | Where | Becomes |
|---|---|---|
| Anonymous, Turnstile-guarded `POST /e/{slug}/submit` | `backend/api/entries_public.py`; allowlist `tests/test_auth_surface.py:75` | session-gated submit; **Turnstile moves to entrant signup** (spec Q4 anti-abuse stack, Seam B) |
| `Entry.manage_token_hash` + the raw token returned once on the success page | `backend/database/models.py:1181-1184`; card `api/entries_public.py:512-517`, minted `:675`, returned `:715` | dropped; managing an entry is login-gated "my entries" (E2 builds the page — this slice only removes the token path) |
| Idempotency, regulations acceptance and `fee_cents` **on the entry**, with `UNIQUE (tournament_id, idempotency_key)` on `entries` | `models.py:1131-1257` | all three on **`submissions`**; ruling D4's tenant scoping survives the move up a level (spec Q5 amendment) |
| One form act = one entry, one event | the public page form | one submission covering **1–N events**, each bound to a player, with a **running fee total** (R14) |
| "Usable at 390px — that is the bar" | `api/entries_public.py:291`, `:298` | R11: **desktop and mobile co-equal** — no horizontal scrolling, no degraded functionality at either width |
| `contact_name` / `contact_email` / `email_verified_at` as plain entry columns | `models.py:1171-1180` | replaced by the account link (spec Q13 §6) |

**The test unwinding this implies.** The entries surface is pinned by **152 backend tests across eight entries-named files** (`tests/test_entries_public_routes.py` 47, `test_entries_config_routes.py` 17, `test_entries_desk_routes.py` 15, `unit/test_entries_commit_seam.py` 23, `unit/test_entries_module_mode.py` 21, `unit/test_turnstile.py` 16, `unit/test_entries_roster_fields.py` 7, `unit/test_entries_migration.py` 6 — counted 2026-08-07) plus **18 frontend tests** (`frontend/src/products/entries/__tests__/`), plus derived coverage in `tests/test_auth_surface.py` and the OpenAPI-derived `tests/test_tenant_isolation.py` (72 ops). The ledger's "~230 tests pinning these" is that total including derived coverage.

**A large fraction of those tests assert behavior a user ruling has superseded, and editing them is legitimate — but only under the CODE_HEALTH discipline, never silently:**

1. Every edited or deleted test is called out **in its own commit message**, with the ruling (R10–R14) and the spec section that supersedes it.
2. A test is only edited when its *behavior* is superseded. A test failing because the implementation regressed is a bug, not an unwind. If you cannot name the ruling, **STOP**.
3. Deleting a negative control is forbidden. A superseded negative control is **replaced by its successor in the same commit** (e.g. "anonymous submit succeeds" does not vanish — it becomes "anonymous submit is rejected").
4. The session ledger entry lists the edited-test tally against the ruling that justified each group.

**Explicitly unaffected — do not touch, and treat a need to touch as a finding:** the operator desk's existing routes (`backend/api/entries.py`), **Seam A's contract** (`backend/services/entries.py`, spec §5 — "unchanged by R10–R14" is the load-bearing survival of this amendment), the entry-page / entry-event config routes (`api/entries.py:224`, `:301`), the module system (`CLOUD_ONLY_MODULES`, `cloud_modules_enabled()`), and `GET /e/{slug}` as a public read (its allowlist entry **stays**).

**Still open and NOT in scope: finding F-E1** (spec §9.3 — entry events map onto a Meet *division*, not a *slot*; the rank-slot collision observed in E1's live run). It needs its own design ruling. **Do not patch it ad hoc.**

---

## ABSOLUTE RULES

1. **SP-PROGRAM-1's invariants (I1–I8), standing rulings (R1–R14) and session protocol apply in full**, as amended: **R10 supersedes R4** (accounts are v1 and are no longer a program non-goal) and **R11 amends I7's `play.*` clause** (co-equal widths, not mobile-first). The amended spec is the contract. **Where this prompt and the spec disagree, STOP and report — do not pick one silently.** (One disagreement is pre-resolved below, in rule 6.)
2. **Scope is the E1-2 delta exactly**, in this order: entrant **signup** (Turnstile-guarded, dummy keys locally) → **login** (password default, `play.*`-scoped session per Q13) → **multi-event submission** (R12 fields, gender-filtered events with an override path, running fee total per the R14 fee schedule with the per-event fallback, acknowledgment gating at the *submission* level, `remarks` per player) → **desk** gains submission grouping and the gender-mismatch / duplicate flags → **Seam A commit, contract unchanged**. Anything from E2+ that "would be easy while you're in there" is a scope violation.
3. **No public exposure.** Amendment A1 stands in full: nothing in this session touches the Cloudflare dashboard, DNS, tunnel config or Access. nginx/compose changes are written and validated locally only. Turnstile runs on the documented dummy keypair.
4. **TDD with negative controls (CODE_HEALTH 3b) on every security-relevant behavior.** Carried forward from SP-E1-1 and **extended** — the new controls are non-negotiable:
   - **unauthenticated submit is rejected** (the inversion of E1's headline behavior);
   - **entrant signup throttle** fires in its own key namespace and does not lock the operator surfaces (`ip:` / `reg:` / `entry:` stay independent — `services/auth.py:447-449`);
   - **session-scoping, both directions:** an `app.*` operator session must not authorize a `play.*` submit, **and** an entrant session must not authorize any operator route or resolve as a `tournament_members` principal;
   - **CSRF covers the entrant cookie** (see rule 9);
   - retained from E1: Turnstile rejection (now at signup), throttle-before-outbound-call ordering, idempotency replay (now submission-level), uniform-404, cross-tenant probe, operator-only desk/commit, local-mode module absence, body cap, HTML escaping.
   A safety test without its negative control is not done.
5. **Characterization tests before touching load-bearing code** — this slice enters the **auth machinery**, which is more load-bearing than anything E1 touched. Golden-master, before modifying: the session create/resolve path (`services/auth.py:281-296`, `app/dependencies.py:73`), the CSRF middleware trigger (`app/main.py:248-252`), the throttle engine (`services/auth.py:387-431`), and `require_tournament_access`'s uniform 404 (`app/dependencies.py:95-140`). E1's blob-CAS characterization tests stay green untouched — if a Seam A characterization test needs editing, the seam changed, which rule 2 forbids: **STOP**.
6. **The schema migration is a clean rebuild, not a backfill — conditional on a Phase A verification.** New revision, id beginning `s3` (next after `r2c7e1f4a9b3`; suggested `s3d8f2b5c0e1_entries_accounts_and_submissions`).
   - **The spec's stated posture (§4 delta table) is "additive then narrowing" with backfills** — one account per distinct `contact_email`, one submission and one player per existing entry. That posture is written for a world that has data.
   - **There is none.** Every `entries` row in existence is demo data: the throwaway `sw-e1-demo` Postgres volume and local dev SQLite files. No deployment serves entries (Phase 2 has not run; A1 forbids exposure). **Phase A must verify this** — enumerate every reachable database, count rows in `entries` / `entry_pages` / `entry_events`, and confirm each is a dev or demo store. **If any store holds data that is not disposable, STOP** and execute the spec's backfill posture instead.
   - **Given that verification, prefer the clean rebuild:** drop and recreate the entries tables in the new shape. Reasons, in order: (a) a backfill of `entry_players.gender` has **no source** and is the one genuinely lossy step the spec names — a clean rebuild deletes the problem rather than shipping unknown-and-flagged rows nobody will ever resolve; (b) compatibility shims (both column sets alive, dual-write, a narrowing migration later) are code that exists only to serve rows that do not exist, and each shim is a place for a fail-open bug in a slice that is *adding authentication*; (c) the migration chain must stay clean and linear — one revision, `upgrade` and `downgrade` both exercised by the programmatic alembic round-trip test E1 introduced (`tests/unit/test_entries_migration.py`), no squash, no edit of `r2c7e1f4a9b3`.
   - Record this as a **deviation from the spec's stated posture, resolved by evidence**, in the ledger and in the migration's docstring.
7. **No new runtime dependencies.** Everything this slice needs exists: Argon2id (`argon2-cffi`), the session/reset/throttle machinery, the stdlib Turnstile client E1 wrote, the email seam (**unused here** — verification is E2). A framework for `play.*` is Phase 6 and is the program's single sanctioned exception; **this slice does not take it**. The multi-event form is rendered the way E1's page was (ruling D3: `HTMLResponse`, `html.escape()` on every interpolation, page-scoped CSP).
8. **R11 is the width bar, and it is testable:** the form and the public page render with **no horizontal scrolling and no degraded functionality** at both a phone width (390px) and a desktop width (≥1280px). Both widths are screenshotted in Phase E. The E1 page is still throwaway — meeting the bar here does not pre-empt Phase 6's framework decision. **This is a deliberate strengthening of the spec, not a disagreement with it (rule 1):** spec §2A (R3) and program Phase 5 (delta) item 6 let the co-equal bar land as a *Phase 6 acceptance criterion* rather than a retrofit of a page scheduled for deletion. That concession was written for E1's page as-is; this slice **replaces** that page's form with a new multi-event one, and shipping new UI at one width is how the retrofit the spec is avoiding gets created. Applying the bar to what this slice writes costs a media query; it does not reopen R8.
9. **The named traps are closed explicitly, not incidentally.** Two, both from the spec's framing sections:
   - **CSRF (Q13 §2):** the middleware triggers on `settings.session_cookie_name in request.cookies` — a **single** name (`app/main.py:250`). An entrant cookie under a different name would fall silently outside CSRF enforcement. Close it, with a negative control proving an entrant-cookie write without the CSRF header is refused.
   - **The uniform-404 seam (Q13 §3):** an entrant principal must be **provably outside** `require_tournament_access`, or provably inside it and always 404ing. `tests/test_tenant_isolation.py` derives its route list from OpenAPI — whatever routes this slice adds must land correctly in it, not be excluded from it.
10. **Branch `dev/prog1-p5-e1-2`; commit per task; docs update in the same commit** (install/compose docs for any infra change; `backend/README.md`'s "Auth & tenancy" section for the second principal type). Ledger updated at session end with tasks, commits, gate results, edited-test tally and findings.

---

## PHASE A — Audit and plan (STOP at end)

1. **Read**, in order: `docs/programs/ENTRIES_PROGRESS.md` (whole ledger, including the SP-ENTRIES-R3 divergence report) → the amended spec end to end, chain **Q4 → Q13 → Q12 → Q14 → §4 → §5 → §6 → §7** → `SP-PROGRAM-1.md` → this file → `SP-E1-1.md` (history) → `git log --oneline -20`. Re-run the gates and record the baseline: backend **1197 passed / 66 skipped**, frontend **1433 / 175 files** (the post-fix-pass E1 numbers). Counts only go up.
2. **Answer spec open question #7 — where entrant accounts are stored** (`users` rows vs a sibling table). The spec **frames and does not fix** this; the ruling assigns it here. Q13 §3 states the four questions any answer must close — role/org columns an entrant never fills; the uniform-404 seam and its OpenAPI-derived test; the global `uq_users_email_lower` namespace; throttle key namespacing — and records a **bias toward a sibling table** with the burden of proof on reuse. Read the resolver and the middleware; do not reason from the spec.
3. **Decide the session-scoping mechanism** (Q13 §2): cookie name and attributes, and whether the principal kind is a discriminator on `AuthSession` or a separate session table. State which of the two failure modes you are buying — a resolver that forgets to check a discriminator (**fail-open**) versus a table that cannot be confused by construction. Name the CSRF fix in the same breath (rule 9).
4. **Decide the physical form of the player level** (Q12 R3): an `entry_players` table versus namespaced fields on the entry. The spec fixes the invariant (*player fields are never mixed into contact/account fields*) and leaves the storage here. Its two concrete questions: does a player need identity **across submissions within one tournament** (a parent adding a second event for the same child a week later)? does the commit seam want one roster player **per human** or **per entry**? Answer both against the tree.
5. **Verify rule 6's data premise.** Enumerate every reachable entries store; count rows; classify each as disposable or not. This gates the migration strategy.
6. **Map the landing zones with file paths**, at minimum: signup/login route placement and their auth-surface consequences; where the entrant session cookie is set and resolved; the throttle namespace registration and its settings triple; Turnstile's move from submit to signup; the fee-schedule computation seam (one place, server-side — the form's running total is a *display* of it, never the source of truth); the desk's grouping query; `build_signals` (this slice adds nothing there — confirm and say so).
7. **Produce a task list with test-first ordering**, and state which existing tests each task will unwind, with the ruling per group.

**STOP.** Report: the map, the four decisions (2, 3, 4, 5), the plan, the unwind inventory, and any spec/tree contradiction. Wait for go-ahead. The standing **`[CONFIRM AT STOP]`** item — password-based auth as the default (Q13 §4; the user let it stand on 2026-08-07) — is re-presented here for the recorded sign-off.

## PHASE B — The entrant principal (signup, login, session)

1. **Storage and model**, per the Phase A ruling. Password hashing, policy, reset-token shape and session hashing are **reused, not re-implemented** (Q13 §1 table). If a mechanism cannot be reused, that is a **finding to report, not a licence to write a parallel stack**.
2. **`POST` signup:** Turnstile validated **server-side** (dummy keys locally, the real code path), entrant-namespace throttle checked **before** the outbound call (the ordering E1's fix pass established), NIST-800-63B password policy, uniform response that never reveals whether an address is already registered (Seam B's non-enumeration invariant now applies to signup, "where email enumeration is the classic leak"). Account lands **unverified**; per spec §6 an unverified account **may submit** in this slice — a slice-ordering statement, not a permanent design. Verification is E2, and **until it exists the entries a submission creates land in `pending`** (ruling D1, unamended by R10–R14): `unverified`'s only exit is the verification transition, and Seam A commits only `confirmed`, so parking entries there would ship a pipe that cannot reach the roster.
3. **`POST` login / logout:** credential throttle in the entrant namespace, session created with the `play.*`-scoped cookie, revocation as a timestamp (never a delete).
4. **Auth-surface allowlist edits, each individually justified:** signup and login are session-free by nature and go **in**; `POST /e/{slug}/submit` comes **out** (it is no longer session-free); `GET /e/{slug}` **stays**; the file preamble's "an entrant has no account and never will (spec Q4)" is **rewritten** to describe the new posture (`tests/test_auth_surface.py:38-40`, and the restatement at `:77`).
5. **Negative controls (rule 4):** cross-principal, both directions; CSRF on the entrant cookie; signup throttle isolation; Turnstile rejection at signup.
6. **`sw_entries` nginx zone widens** to cover the entrant auth paths (it is path-scoped; the zone itself is unchanged). Compose round-trips + install docs in the same commit, keeping the "activated at Phase 2" note.

## PHASE C — Schema reshape and the submission model

1. **Migration `s3…`** per rule 6, creating the amended spec §4 shape: the account level, `submissions` (idempotency key + acceptance pair + `fee_total_cents` + `fee_basis` + payment record, `UNIQUE (tournament_id, idempotency_key)`), the player level, the R12/R14 columns on `entry_events` (`gender_constraint`, `withdraws_until`) and `entry_pages` (`fee_schedule`, `payment_instructions`, `max_events_per_person`, `discipline_caps`, `collect_phone`, `venue_name`, `venue_address`), the re-pointed `entries` (`submission_id`, `entry_player_id`, no idempotency key, no `manage_token_hash`, no contact block), and the non-unique `(entry_event_id, entry_player_id)` index that powers the soft duplicate flag. **No unique index on any natural key, at any level** — R7 preserved verbatim by R13. Upgrade **and** downgrade exercised by the round-trip test.
2. **Comment-block discipline is retained and is load-bearing** (`models.py:1131-1257` is the prior art the spec cites): a block boundary is a level boundary, and additions belong inside the block that describes them.
3. **Submission service:** one act → one `submissions` row + one `entries` row per selected event. Idempotency replay returns **the original submission and all its entries**, never a partial re-creation. Acceptance (`regulations_accepted_at` + `regulations_version_accepted`) is recorded **at that moment, on the submission**. The fee total is computed **server-side** from the fee schedule (cumulative totals by event count) with the per-event `fee_cents` sum as the fallback, and the total shown to the entrant **is** the total recorded — never recomputed silently afterwards.
4. **Policy and flags:** `max_events_per_person` and `discipline_caps` are **refused in the form with the rule stated** (never a silent drop) and remain operator-overridable at the desk (I4). A **gender mismatch is accepted with an attention flag, never refused** (Q14 §5). The soft duplicate flag survives unchanged: same player name + same event across submissions → `needs_review`, operator resolves.
5. **`remarks` moves to the player level** and reaches the roster player through Seam A exactly as it does today — verbatim, never parsed, never a solver constraint.

## PHASE D — The public form (multi-event) and the desk delta

1. **The form**, still hand-rendered (rule 7): login state visible; player fields per R12 (name, **gender required**, club optional, birth year only where an age-bracketed event needs it, `remarks`); **1–N event selection** with events **filtered by gender by default and an explicit override path**; **running fee total**; `payment_instructions` and the timeline (`opens_at` → `closes_at` → `withdraws_until` → tournament date) rendered; venue and org cards per Q14 §6; the acknowledgment checkbox gating **the submission**; the entrant-list notice at the point of consent. No session → the login/signup path, **not a 404**. **R11 bar at both widths** (rule 8).
2. **Delete the manage-token path:** the success page's "keep this code" card, the mint, the column. The success state now points at "my entries" as an E2 destination — it does not build the page.
3. **Desk delta, minimal:** entries **grouped by submission** (with the account and the act's fee total), plus the gender-mismatch and duplicate attention flags surfaced next to the existing ones. Confirm and commit are **unchanged**. No withdraw, no reject, no promote, no manage UI.
4. **Frontend tests** for the grouping and the new flags; module contract and baselines updated only if the module surface actually changed (it should not).

## PHASE E — Local end-to-end demo (leave it running)

Same discipline as E1: the local **cloud-mode** stack on a **fresh disposable database** (name it; never a real-data DB), seeded **through real paths only**. Screenshots at **both widths** (rule 8).

1. Operator setup through real routes: org + operator, workspace, module enable, `PUT entry-page` (now carrying a fee schedule, payment instructions, venue, policy caps), `POST entry-events` (now carrying `gender_constraint` and `withdraws_until`).
2. **Signup** (Turnstile dummy keypair, server-side validation) → **login** → the entry form. Signup and login **precede** any submit; show that submitting logged-out lands on the login path.
3. **One submission, two events, one player** — the running total matches the fee schedule and matches `fee_total_cents` on the stored submission.
4. **Second player under the same account, one submission, two events** — R13 demonstrated: one act, one acceptance record, one total, four entries across two players. This is the parent-with-two-children case the whole model exists for.
5. **Replay demo at the submission level:** the same `Idempotency-Key` posted twice returns the same submission with all its entries; **no second submission and no duplicate entries**.
6. **Soft-flag demo, unchanged in meaning:** a repeated player name in the same event across submissions raises `needs_review`; a *different* player under the same account stays clean.
7. **Gender demo:** the form filters events by default; the override path produces an accepted entry carrying an attention flag, **not** a refusal.
8. **Desk → commit:** submission grouping visible; confirm the legitimate entries; commit; the roster shows the players with `sourceEntryId` and verbatim `remarks`; a second commit reports nothing new (Seam A idempotency, unchanged).
9. **Dual-mode negative, retained:** a local-mode backend against the same database shows no Entries module anywhere; PATCH answers `409 MODULE_REQUIRES_CLOUD` (I3/R6).
10. Run all gates. Leave the stack and dev servers running; report every URL.

---

## NON-GOALS

- **Email verification and password reset** (E2 / Phase 7) — the seam exists and stays unused; an unverified account may submit in this slice by design (spec §6).
- **The "my entries" manage page, withdrawal, withdraw-and-erase** (E2). This slice *removes* the token path; it does not build its replacement.
- **The doubles / partner invite flow** (E3 / Phase 8), including `invite_links` reuse for partners.
- **Payment processing.** Q8's boundary is untouched; v1 payment is manual and `payment_instructions` is prose.
- **The `play.*` frontend scaffold and the framework decision** (R8 / Phase 6). Meeting the R11 width bar on a throwaway page is not a framework choice.
- **Fixing F-E1** (rank-slot mapping, spec §9.3) — it needs its own design ruling.
- Caps/waitlist, pending-reason lifecycle UI, signals/phases and the six attention codes, retention/anonymization, the attention-code shared constant (Phase 3), cross-tournament registry, structured surcharges, refund policy, federation/member-ID identity, any operator-console responsive work.
- **Deployment, tunnel, DNS, Access, real Turnstile keys** (A1, rule 3).

## DONE CONDITIONS

- [ ] Phase A's four decisions (account storage, session scoping + CSRF, player-level storage, migration data premise) are recorded in the ledger with the evidence that decided them; spec open question **#7 is closed**
- [ ] Migration `s3…` exists, upgrade **and** downgrade both exercised; the chain is linear and `r2c7e1f4a9b3` is unedited — **if no migration file exists, the task did not complete**
- [ ] `tests/test_auth_surface.py` shows the deliberate edits: signup/login **added**, `POST /e/{slug}/submit` **removed**, `GET /e/{slug}` **kept**, preamble rewritten — **if the allowlist is unchanged, the task did not complete**
- [ ] Every rule-4 negative control exists and passes, including both directions of cross-principal session scoping and CSRF on the entrant cookie
- [ ] Every edited or deleted test is justified by a named ruling in its commit message, and the tally is in the ledger
- [ ] Seam A's contract is byte-for-byte intact in behavior: its characterization and idempotency tests pass **unedited**
- [ ] All gates green; counts strictly above 1197 backend / 1433 frontend
- [ ] Phase E walkthrough complete, screenshots at **both widths**, servers left running, URLs reported — including the two-player single-submission demo and the submission-level replay
- [ ] No tunnel/DNS/Access/dashboard change of any kind (assert in the ledger)
- [ ] Ledger session entry complete: tasks, commits, gate results, deviations, findings for Phases 6/7
