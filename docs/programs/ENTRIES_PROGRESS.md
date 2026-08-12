# SP-ENTRIES / SP-PROGRAM-1 — Public platform program ledger

**ABSOLUTE RULE:** read this file at session start, update it at session end.

**Master plan:** `docs/programs/SP-PROGRAM-1.md` (committed 2026-08-06 from the user's
program brief — that file is the plan; deviation is a STOP).

---

## SP-PROGRAM-1 phase table

| Phase | Name | Status | Gate outcome |
|---|---|---|---|
| 0 | Consolidate and baseline | **DONE 2026-08-06** | Merge sign-off delegated (see Phase 0 entry) |
| 1 | SP-ENTRIES-R2 spec delta | **DONE 2026-08-06** | **SIGNED OFF 2026-08-07** — combined R2+R3 gate; spec flipped provisional→accepted (user's recorded act: "confirm") |
| 2 | Deploy on wongworks.dev | not started | — |
| 3 | SP-UI-1 appearance pass | **pre-executed** (see contradiction C1) | — |
| 4 | Dogfood (floating) | not started | — |
| 5 | E1 walking skeleton | **E1 SHIPPED 2026-08-06** (merged `86182af`, under Amendment A1); **phase open** — delta slice E1-2 (SP-ENTRIES-R3) not started | public-exposure [USER SIGN-OFF] gate still owed, after Phase 2 |
| 6 | play.* scaffold + email | **steps 1/2/4 COMPLETE 2026-08-10**; step 3 (email) deferred entirely | **SHIPPABLE.** The one BLOCKING defect (the signup page's Turnstile script blocked by our own CSP → *every* signup 403) is **RESOLVED**: the CSP now admits `challenges.cloudflare.com` in `script-src`/`frame-src` on `/e/signup` only, verified end to end in a browser (see the Phase 6 entry, "The ship blocker — resolved"). Exit gate's "a real verification-class email lands in a real inbox" clause stays **OPEN by ruling** |
| 7 | E2 lifecycle | not started | — |
| 8 | E3 doubles | not started | — |
| 9 | E4 signals/phases | not started | — |
| 10 | E5 money/retention | not started | — |
| 11 | Cutover + marketing | not started | — |

## Phase 0 — Consolidate and baseline: DONE (2026-08-06)

**Operating directive for this run (recorded per program rule 4):** the user instructed
"you are autonomous… questions are answered by researching online and using best industry
practice." Sign-offs that the program marks [USER SIGN-OFF] are therefore executed under
that delegated authority and *recorded here for after-the-fact review*; anything
irreversible or externally-facing still stops. Phase 1's spec-acceptance flip and R7
confirmation are presented for review in the Phase 1 entry.

### Contradictions found by the Phase 0 audit (program rule 1)

- **C1 — SP-UI-1 (program Phase 3) was already substantially executed before the program
  started**, on `feat/sp-ui-1-control-plane`: monogram lockup (`dec469c`), Hub row
  hierarchy (`58a4f4b`), phase-keyed Overview (`d49ee31`), date-column fix + ledger record
  (`ea1d071`), and the phase-keyed Hub facets follow-up (`3aeac18`, committed 18:34 by the
  user's other session; validated by this session's full gate run). Phase 3, when reached,
  becomes a **verification/completion pass**: confirm SP-UI-1 done conditions, plus the two
  program amendments (attention-code shared constant — still open, assigned by Phase 1.7;
  seven-value phase-enum tolerance — partially in place via `resolvePhase`'s
  unknown→`setup` default, needs the Q9 vocabulary check).
- **C2 — `SP-UI-1.md` is not in the repo.** The executed plan lives at
  `~/.claude/plans/sp-ui-1-control-plane-partitioned-dragon.md`; the live appearance record
  is `docs/audits/15-frontend-design-review.md`.
- **C3 — the outstanding branch is `feat/sp-ui-1-control-plane`, not
  `dev/cloud-audit-fixes`** (the program itself allows "or whatever the ledger shows
  outstanding"). Ancestry is linear: main ⊂ dev ⊂ feat/sp-ui-1-control-plane, so one merge
  consolidates everything and `dev` becomes fully merged.

### Baseline (2026-08-06, tree = feat/sp-ui-1-control-plane @ 3aeac18)

- **Frontend:** vitest **172 files / 1385 tests, all passing** (104.1s).
- **Backend:** pytest **1018 passed, 66 skipped** (245.6s).
- **Lint:** eslint 0 errors / 104 warnings (lean-gate downgrades); ruff `All checks passed`.
- **depcruise:** 0 errors / **14 warnings** (CLAUDE.md says ~11 known — count crept by ~3
  during the design phases; ratchet candidates, noted, not a gate failure).
- **Build:** `npm run build:scheduler` green (tsc -b inside), 7.9s; chunk-size warning only.
- **Compose round-trips:** all six files (`docker-compose{,.dev,.release,.cloud,.selfhost,.worker}.yml`)
  pass `docker compose config -q` with the CI dummy-env set.
- **Alembic head:** `q1b4c8d2e6f7_tournament_state_version`.

### Actions

- Committed the program master doc as `docs/programs/SP-PROGRAM-1.md`.
- Merged `feat/sp-ui-1-control-plane` (11 commits ahead, superset of `dev`) into `main`
  (no-ff) and pushed. Merge sign-off: delegated per the operating directive above.
- **C4 (found while opening Phase 1):** the bare `dev` branch blocked the program's
  mandated `dev/prog1-p<N>-<slug>` namespace. Local `dev` + `feat/sp-ui-1-control-plane`
  (both fully merged) deleted; **remote `origin/dev` deletion was permission-blocked** —
  user follow-up: `git push origin --delete dev` (it is fully merged and will block
  pushing any `dev/...` phase branch until removed).

---

## Phase 1 — SP-ENTRIES-R2 spec delta pass: DONE (2026-08-06)

**Branch:** `dev/prog1-p1-spec-delta` (local; push blocked by origin's `dev` ref, see C4).
**Execution:** fresh-context Opus agent workflow (`wf_bab49b2d-2b7`, 3 agents / 268k
tokens): research → amend → adversarial verify, orchestrated and monitored by the session.

- **Deliverable discipline held:** one commit (`abd1005`), one file changed —
  `docs/superpowers/specs/2026-08-06-entries-design.md` (+472/−35). Zero production code.
- **All eight Phase 1 items verified present and faithful** by an independent Opus
  verifier that checked clause-by-clause against SP-PROGRAM-1's rulings, opened every
  cited file/line, and confirmed the R1 text contradicting the new rulings (Q4's
  "no entrant list" bullet, §4's hard email unique index) was genuinely deleted.
  New sections: Q11 (R5 regulations/waiver), Q12 (R7 contact/player model with the
  rejected hard-index option and four reasons), §2A (three-surface architecture +
  R9 cutover checklist + I1 as spec invariant); Q4/§4/§7/§9.6 amended per items 3-7.
- **R6 feasibility (item 8): feasible, no STOP owed.** Mechanism written into Q1 with
  fifteen exact citations (all independently re-verified): the read-path filter lives at
  the three `workspace_modules` read call sites in `repositories/local.py`
  (`ensure_modules` 1400-1415, `ensure_modules_for` 1428-1432, `_rows_for` 1441-1448);
  repo-wide grep confirms no fourth reader besides the `seed_modules` create path.
- **Verifier verdict: DEVIATIONS → fixed.** One real defect: Q12's rejection reason (d)
  cited `models.py:785-787` for the dedup-conflation trap that actually sits at
  `models.py:778-784` (range inherited from R1). Fixed, plus two sub-threshold drifts
  (`setupChecklist.ts:62`→`58`, `api/display.py:49`→`50`), in the follow-up commit.
- **Gate:** `npm run docs:build` green (run by both amend and verify agents).
- **R7 confirmation (owed at this STOP):** grounded by the research agent — the
  incumbent's own stack supports one authenticated submitter acting for many players
  (BWF Online Group Entry via Member Associations; Badminton Scotland club secretaries
  creating accounts; Pickleball Brackets manual partner-add), and swim-meet entry is
  natively multi-player-per-submitter. A hard per-event email-unique index would encode
  the *consumer* flow of the incumbent and forbid its *delegated* flow. R7 stands as
  ruled: soft attention flag, operator resolves.

**STOP [USER SIGN-OFF] — presented in the session report.** Spec header remains
**provisional**; per the program, the provisional→accepted flip is the user's act and is
NOT taken under delegated authority. On approval, edit the spec header status line.

**Next task:** Phase 2 (deploy on wongworks.dev). Requires access to `cayde`/`neo` and
the Cloudflare dashboard — cannot proceed from this session without them.

---

## PROGRAM AMENDMENT A1 (user-authorized, 2026-08-06 — recorded verbatim per SP-E1-1)

> **AMENDMENT A1 (user-authorized):** Phase 5 development proceeds locally before Phase 2.
> The original ordering protected against *public exposure* on an unvalidated deployment;
> development does not expose anything. The Phase 5 **[USER SIGN-OFF] public-exposure
> security gate is preserved in full** and now sits after Phase 2 completes: no tunnel
> ingress, DNS record, or Access change for entries may be made in this or any session
> until that gate is passed. Phase 2 remains blocked on user-provided infrastructure
> access; Phase 3's open item (attention-code shared constant) remains Phase 3 scope.

## Phase 5 / SP-E1-1 — E1 walking skeleton, locally: IN PROGRESS (2026-08-06)

**Branch:** `dev/prog1-p5-e1`. **Prompt:** SP-E1-1 (replaces SP-VERIFY-1).

### Phase A — audit + plan: DONE (2026-08-06). STOP passed — user go-ahead "go begin",
accepting all four recommendations (recorded as rulings D1–D4 in
`docs/programs/SP-E1-1.md`, which is now committed to the repo as the executing prompt).

**Gates re-confirmed at baseline on the branch:** frontend 1385/172 green, backend
1018 passed / 66 skipped — exactly the Phase 0 numbers.

**Mapping:** five parallel Opus agents (`wf_18b696b7-a13`, 526k tokens), domains =
modules / security surface / write paths / infra / Turnstile research. All citations
verified by the agents opening files. Full maps in the session transcript; the
load-bearing facts and the contradiction list are in the STOP report (session of
2026-08-06). Key landing zones confirmed: `MODULE_IDS` `models.py:606` +
`derive_modules:620` + `normalize_module_seed:650`; module reads at `local.py:1400-1448`
(3 sites) + `seed_modules:1485`; PATCH rules `api/workspace_modules.py:91-186`;
auth-surface allowlist `tests/test_auth_surface.py:34-51` (mechanism: OpenAPI-derived,
pass = 401/403/404); uniform-404 `app/dependencies.py:95-140` +
`tests/test_tenant_isolation.py` (`_PARAM_FILLERS:25-33` needs an `entry_id` filler);
hashing precedent `services/auth.py:281-296` (SHA-256 of `token_urlsafe(32)`,
`AuthSession.token_hash` `models.py:962-992`) vs display plaintext anti-precedent
(`api/display.py:49-50`); `AuthThrottle` `models.py:995-1015` + engine
`services/auth.py:387-477` (blessed for reuse, callers own commits); body cap
`app/body_limit.py` (4 MB, route-agnostic); client IP `app/client_ip.py`
(CF-Connecting-IP, trusted-proxy gated); CSRF does NOT cover cookie-less public writes
(`main.py:233-260`); Idempotency-Key replay contract `api/solve_jobs.py:98-156` +
`services/solve_jobs.py:165-225`; Meet blob CAS `repositories/local.py:199-259` +
`commit_tournament_state:1555-1606`; bracket participants `models.py:447-481` +
`bulk_create_participants` `local.py:670-699` (NO additive path exists);
`build_signals`/`_derive_phase` pure (`workspace_signals.py:297-414`), E1 adds nothing
there; alembic head `q1b4c8d2e6f7`, next id `r2…`, migrations NOT exercised by tests
(`tests/_helpers.py` uses `create_all`); email seam `services/email.py` confirmed
UNUSED by E1; base-URL seam EXISTS (`public_app_origin` `config.py:216-218` — spec
discrepancy #10 is itself wrong); nginx zones `nginx.conf:47,52` + SPA-fallback trap
`:171-177` + CSP blocks Turnstile (`security-headers.conf:50`); Turnstile dummy keys +
siteverify contract confirmed from Cloudflare docs (secret drives outcome; dummy token
literal usable in tests).

### Phases B–D — implemented (2026-08-06), via sequential fresh-context Opus workflow

Workflow `wf_8d56337b-c8f`: 4 implementation stages + 1 adversarial verify (1.07M tokens,
505 tool calls, ~2h). 18 commits, 60 files, +7630/−71.

- **Foundations** (`b10fa98`, `ebb34fe`): migration `r2c7e1f4a9b3` = the full amended §4
  schema (D4 tenant-scoped idempotency unique index; non-unique email index, Q12;
  contact/player block separation preserved in models AND migration); module system —
  `CLOUD_ONLY_MODULES`, mode via `cloud_modules_enabled()` (`auth_mode=="cloud"`, D2),
  both read queries filtered, `MODULE_REQUIRES_CLOUD` on PATCH + create. First
  programmatic alembic round-trip test in the repo (6 tests) + 16 module-mode tests.
- **Commit seam** (`9fc9b4f`…`6def4dc`): 5 characterization tests golden-mastering the
  blob CAS (incl. the `expire_on_commit=False` stale-identity trap); `PlayerDTO`/
  `BracketPlayerDTO` gain `sourceEntryId`+`remarks`; additive `add_participants`;
  `services/entries.py` Seam A (idempotent, additive, CAS retry w/ rollback+expire_all,
  per-entry partial reporting, skip reasons); desk routes list/confirm(D1)/commit;
  tenant-isolation coverage 67→70 ops. Backend 1097.
- **Public write** (4 commits): Turnstile service (stdlib urllib, fail-closed, dummy-key
  defaults); `GET /e/{slug}` server-rendered page (D3 — every interpolation escaped,
  strict entrant-list projection, page-scoped CSP, 390px-usable) + `POST /e/{slug}/submit`
  (uniform-404, Turnstile, `entry:<ip>` throttle triple, acknowledgment gating + version
  recording, D4 replay semantics w/ IntegrityError re-read, R7 soft flag `needs_review`,
  hashed manage token returned raw once); auth-surface allowlist + docstring rewrite +
  sibling guard tests; `sw_entries` nginx zone + `/e/` location + install-docs rows
  ("activated at Phase 2"). Backend 1167.
- **Desk** (`0a32f0a`…`a55e429`): all six frontend module-id unions (a 6th found:
  `WorkspaceRow` glyph title ternary), `SectionRole += 'intake'`, contract + baselines,
  AppShell fail-closed guard, snapshot round-trip of the new player fields, EntriesDesk
  (list, confirm, commit + result summary). Frontend 1433/175.

**Adversarial verify: FINDINGS.** All gates green and counts strictly up (backend
1167/66sk vs 1018 baseline; frontend 1433 vs 1385); scope guard clean (zero operator
in-module files touched); all rulings D1–D4 hold; **seven negative controls proven real
by guard inversion** (Turnstile, D4 scoping, batched-path filter, escaping, throttle,
operator-only, uniform-404). One MAJOR: `ensure_modules` early-return means pre-existing
workspaces never gain the entries row in cloud mode (spec Q1(R2) "lazy-seeds on read"
fails for the non-empty case) — plus 4 minors (guard ordering Turnstile-before-throttle;
speculative nginx `/api/entries/` block; body-cap control not colocated; no real path to
create `entry_pages`/`entry_events`, colliding with Phase E "seed through real paths").
**All five dispatched to a fix agent** (Phase E enabler routes: PUT entry-page + POST
entry-events, operator-only, recorded as a deliberate scope addition).

**Fix pass (same day, 5 commits `f725249`…`96f7410`): all five closed.** Cloud-mode
backfill now unions missing `CLOUD_ONLY_MODULES` rows on both read paths (idempotent,
one commit per Hub page, zero steady-state cost; +5 tests); throttle lock is read before
Turnstile so a locked IP costs no outbound call (+2, transport-must-not-be-called
control); speculative nginx `/api/entries/` block removed (zone + `/e/` kept, docs
updated); body-cap negative control colocated (+1 — padding split across fields because
Starlette caps a single form field at 1 MB); operator config routes `PUT entry-page` /
`POST entry-events` (Q11.4 version-bump-only-on-change, slug conflict 409 without naming
the holder; tenant-isolation auto-coverage now 72 ops; +22).
**Backend after fixes: 1197 passed / 66 skipped.** ruff clean; all six compose files
validate.

### Phase E — end-to-end demo: DONE (2026-08-06/07), servers left running

**Stack:** `docker compose -p sw-e1-demo -f docker-compose.cloud.yml` (fresh disposable
Postgres volume scoped to project `sw-e1-demo` — no real-data DB anywhere near this) +
Vite dev on **:5174** (5173 was taken) with `VITE_API_PROXY_TARGET=http://localhost:8600`.
Migration chain ran clean on Postgres through `r2c7e1f4a9b3`.

**Walkthrough (screenshots in `.playwright-mcp/sp-e1/`, untracked by design):**
1. Seeded through real paths only: `POST /auth/register` (director@example.com),
   `POST /tournaments` (Meet kind), module PATCH `entries available→enabled` (the row was
   auto-seeded by cloud mode — R1 visible), `PUT entry-page` (slug `wongworks-open`,
   waiver on, regulations v1), `POST entry-events` (MS1, fee 2500).
2. `01-public-page-390px` — the public page at 390px: events, fee, regulations + version,
   acknowledgment checkbox with the entrant-list notice, Turnstile (dummy keys).
3. Submitted Alex Silva from the form → `02-entry-received-390px` — success page with the
   one-time manage token (hashed at rest). Public list then shows "Alex Silva MS1" —
   names + events only (I6).
4. **Replay demo:** same `Idempotency-Key` twice → same reference id, 201 then 200,
   one row. **R7 demo:** Sam Silva on the same contact email accepted CLEAN (the
   parent-two-children case — no flag, per spec Q12); a second "Alex Silva" on the same
   email+event flagged `needs_review`. (SP-E1-1 Phase E wording says "different player
   name → soft flag"; the spec's trigger is same-name — both sides demonstrated, spec
   followed.)
5. `03-entries-desk` — desk shows 4 entries, states, attention chip, remarks; confirmed
   the three legitimate entries, left the flagged duplicate pending (operator judgment).
6. Commit → `04-commit-result` "3 committed to the roster."; second commit → "Nothing
   new to commit" (Seam A idempotency proven in the UI, matching the test proof).
7. `05-roster-committed` — Meet roster shows the 3 players; state blob carries
   `sourceEntryId` + verbatim remarks + group per event code.
8. **I3/R6 negative, live:** a one-off backend container with `AUTH_MODE=local` on the
   SAME database — new workspace seeds without entries, GET shows none, PATCH answers
   `409 MODULE_REQUIRES_CLOUD`. Stopped after the demonstration.

**No tunnel, DNS, Access, or Cloudflare-dashboard change of any kind was made** (asserted
per Amendment A1; Turnstile ran on the documented dummy keypair).

### Findings from the live run (inputs to later phases)

- **F-E1 (real, for E2/Phase 7 design + spec §9.3): the Meet rank-slot mapping is wrong
  in practice.** `rankCounts: {MS: 3}` declares SLOTS MS1/MS2/MS3 (one player per school
  per singles slot — `useRankValidation.ts`), but the seam maps every entrant of event
  "MS1" onto the SAME slot in the SAME seam-created group, so the roster UI's
  normalization stripped `ranks` from the 2nd and 3rd players on its next autosave
  (state v3/v4 were SPA autosaves; v2 was the commit). Players, remarks, sourceEntryId
  and groups all survived — only the rank slot collided. This is spec open question §9.3
  answered concretely: entry events map onto a *division* (MS), not a *slot* (MS1);
  the seam needs either slot assignment or a division-level mapping. Do NOT patch ad hoc.
- **F-E2 (observation): the operator SPA autosaves the state blob and will normalize
  seam-written data** through Meet's domain rules. Any future seam-written field must
  either round-trip the SPA store (as sourceEntryId/remarks now do, by test) or be
  written to survive normalization. Worth a characterization test in E2.

**Servers left running:** operator app http://localhost:5174 (director@example.com),
public page http://localhost:8600/e/wongworks-open, API :8600, stack `sw-e1-demo`
(`make stop` will NOT stop it — use `docker compose -p sw-e1-demo -f
products/scheduler/docker-compose.cloud.yml down`; add `-v` to discard the demo data).

---

## SP-ENTRIES-R3 — Master amendment (R10–R14): RULE-4 STOP (2026-08-07)

**Branch:** `dev/prog1-r3-amendment`. **Prompt rule 4 triggered:** `dev/prog1-p5-e1` is
not merely non-empty — **SP-E1-1 was fully implemented, adversarially verified, demoed
end-to-end, and merged to `main` (`86182af`) before this prompt arrived.** Divergence
report below; NO document amendments made pending the STOP outcome. (Locating note: the
E1 prompt lives at `docs/programs/SP-E1-1.md`, in-repo — no amended copy under
`docs/superpowers/plans/` is needed.)

### Divergence report — what already landed that R10–R14 reshape

**Schema (migration `r2c7e1f4a9b3`, deployed to the demo Postgres and to every dev
SQLite from now on):**
- `entries` carries the R7 *soft* split (contact block / player block in one row) — R13
  now mandates the hard `account → submission → entries → players` shape. The
  idempotency key, regulations acceptance (`regulations_accepted_at` +
  `regulations_version_accepted`) and `fee_cents` snapshot all live **on the entry**;
  R13 moves all three to a new `submissions` table. `UNIQUE (tournament_id,
  idempotency_key)` (ruling D4) becomes submission-level.
- **`manage_token_hash` exists and the raw token is already minted and returned once on
  the public success page** — R10 retires this entire path (login-gated "my entries").
  The E1 success-page copy ("Keep this code…") and its tests pin the behavior R10
  deletes.
- No account/principal rows for entrants anywhere; `contact_email`/`contact_name` are
  plain entry columns (R10 turns these into account-linked data).
- `entry_events` has `cap/fee_cents/opens_at/closes_at/retention_days` but **no
  `withdraws_until`, no gender/`gender_constraint`, no policy fields** (R12/R14 adds).
- `entry_pages` has regulations/waiver/version but **no `payment_instructions`, no fee
  schedule, no phone toggle** (R14/R12 adds).

**Routes/behavior (all tested, ~230 entries tests pin them):**
- `POST /e/{slug}/submit` is **anonymous + Turnstile-guarded** — R10 moves Turnstile to
  signup and puts submission behind a `play.*`-scoped session. The auth-surface
  allowlist entries + rewritten docstring (`tests/test_auth_surface.py`) encode the
  now-superseded "anonymous public write" posture.
- One form act = one entry, single event — R13's 1–N-event submission with running fee
  total (R14) replaces the form and the submit contract.
- Public page built to the 390px bar (ruling D3/E1) — R11 replaces the bar with
  co-equal dual-width.
- Operator desk, Seam A commit, confirm action, entry-page/entry-event config routes:
  **substantially unaffected by R10–R14** (Seam A contract survives; commit traceability
  gains the submission hop).

**Consequences for the amendment the prompt did not anticipate:**
1. **The rulings now imply a schema *migration and behavior rework*, not greenfield
   design** — entries/submissions reshape, token-path retirement, form rebuild, and the
   deliberate unwinding of allowlisted public-write tests. The spec amendment should
   speak in "supersedes the shipped E1 shape" terms and the E1-prompt amendment (Phase D)
   describes a **delta slice over a shipped E1** (suggest naming it SP-E1-2), not a
   rewrite of an unexecuted prompt.
2. E1's Phase E walkthrough artifacts (success-page token copy, anonymous submit demos,
   R7 flag at entry level) are recorded in this ledger as *completed history* — the
   amendment must not retroactively edit that record.
3. Live-run finding F-E1 (rank-slot mapping, spec §9.3) is untouched by R10–R14 and
   stays open.
4. The demo stack `sw-e1-demo` still runs the shipped shape; nothing in this session
   changes it.

**STOP presented to the user; go-ahead given 2026-08-07** — the amendment proceeds as a
*supersedes-a-shipped-shape* pass (see the amendment record below). The standing
[CONFIRM AT STOP] item (password vs passwordless default) stands as the default and its
marker stays in the spec until the sign-off is recorded; it is re-presented at SP-E1-2's
Phase A STOP.

**Decisions proposed at the STOP (see report):** cloud-mode predicate for R6 (spec's
`environment=="cloud"` collides with `docker-compose.cloud.yml`'s deliberate
`ENVIRONMENT=local` — S1); E1 lifecycle gap (no email verification + no confirm UI ⇒
nothing reaches `confirmed` ⇒ Seam A commits nothing — needs a ruling); public page
via hand-rolled `HTMLResponse` (Jinja2 not installed; rule 8); entries idempotency
index scoped per-tenant (deliberate divergence from the global solve-job index — a
cross-tenant disclosure vector on an unauthenticated route otherwise).

### Amendment executed (2026-08-07) — documents only, four stages

**Branch:** `dev/prog1-r3-amendment`. **Discipline held: zero source, zero migrations, zero
tests.** `git diff 86182af..HEAD --name-status` = four documents, nothing else.

| Stage | Commit | File |
|---|---|---|
| B — spec | `b84ef14` | `docs/superpowers/specs/2026-08-06-entries-design.md` (+1026/−171) |
| C — program | `137519a` | `docs/programs/SP-PROGRAM-1.md` (+127/−12) |
| D — delta prompt | `23ffd7f` | `docs/programs/SP-E1-2.md` (new, 148 lines) |
| E — adversarial consistency pass | this entry's commit | the three above + this ledger |

**What landed.** R10–R14 transcribed verbatim into SP-PROGRAM-1's standing rulings (R4 struck
through and pointed at R10, R7 re-headed "hardened by R13", I5/I6/I7 rewritten, the
"entrant accounts" global non-goal struck); the spec gains **Q13** (the entrant account),
**Q14** (pricing/deadlines/policy), a rewritten §4 four-level schema with a per-table
migration-posture table, a rewritten Seam B, an §2A responsive subsection, an E1-2 row in §7,
open question #7 and discrepancy-log rows 12–21; **SP-E1-2** is the delta prompt over the
shipped E1 (deletion table, the 152-backend/18-frontend test-unwind inventory, four Phase-A
decisions, clean-rebuild migration conditional on a data-premise verification).

**Two judgment calls recorded for review:** the venue card is **answered, not deferred** —
`venue_name` + `venue_address` as free text on `entry_pages`, off the state blob so an address
can never 409 against the fail-closed `CONFIG_LOCKED` guard; and SP-E1-2 rule 6 **pre-resolves**
a spec/prompt disagreement (spec §4 says additive-then-narrowing with backfills; the prompt
orders a clean rebuild) by making it conditional on a Phase-A verification that every entries
store is disposable — STOP and execute the spec's posture if it is not.

**Phase E (adversarial pass) — what it found and fixed.** All R10–R14 text verified
**verbatim** against the ruling; every new tree citation opened and confirmed (models/auth/
config/main/dependencies/entries_public/entries/invites/tournaments/test_auth_surface/dto.ts/
workspaceNav.ts); SP-E1-2's per-file test counts re-counted and exact (47/17/15/23/21/16/7/6 =
152 backend, 11+7 = 18 frontend); `SP-E1-1.md` untouched by the diff; §9.3 (F-E1) still open;
the `[CONFIRM AT STOP]` marker present in spec Q13 §4, §9 and SP-E1-2 Phase A. **Seven
inconsistencies fixed**, all of them sentences that survived the amendment carrying a
superseded premise:

1. **Q8 still put the payment record on the entry** and described per-event pricing as the
   v1 model — amended to move `paid_at`/`payment_note`/the total to `submissions` (R13/R14)
   with Q8's boundary and the "payment never confirms an entry" rule intact.
2. **Q11 item 4 still read "every *entry* records `regulations_accepted_at`"** — R13 puts the
   acceptance pair on the submission; amended in place with the reasoning.
3. **§6 stranded E1-2's entries.** The R3 note said an unverified account's entries "sit in
   `unverified`", whose only exit is the verification transition — which E1-2 does not build,
   while Seam A commits only `confirmed`. Ruling **D1 restated as unamended**: entries land in
   `pending` until E2 gates the transition. Mirrored into the §6 table row, Seam B's output,
   SP-E1-2 Phase B and program Phase 5 (delta).
4. **A three-way scope contradiction on verification/reset:** program Phase 5 (delta) put both
   in E1-2, spec §7's E1-2 row put reset in E1-2, while SP-E1-2's non-goals, spec §7's E2 row
   and program Phase 7 put both in E2. Resolved to **E2** in all three documents.
5. **Seam B forbade a Turnstile challenge at submit** while Q4 explicitly left it to the E1-2
   audit ("requires it at signup, does not forbid it at submit") — Seam B now states the floor,
   not a prohibition.
6. **The spec's I1 invariant still listed "entrant capability links"** among the absolute URLs
   the product emits — replaced by verification / reset / invite links, with the change noted
   as an example change, not an invariant change.
7. **Cross-document gaps closed:** program Phase 1 annotated as historical (its "mobile-first"
   and entry-level acceptance instructions are superseded by R11/R13, not re-run); Phase 9
   gained the R14 §6 public tournament page IA that spec §7's E4 row assigns to it; Phase 10
   gained account deletion + export (R10) alongside withdraw-and-erase; the program's done
   condition and companion-document list updated. Also fixed: discrepancy-log row 19 was
   missing its Cost cell.

**Not fixed, recorded instead:** the spec's status line still reads **Provisional** (the
provisional→accepted flip is the user's act, per Phase 1); and R12's gender-mismatch flag has
no named home in Q9's six attention codes — it reads as an entry-level flag on R7's
`needs_review` precedent, which is how SP-E1-2 Phase C specifies it, but the vocabulary is not
stated outright. Input to the SP-E1-2 audit.

**Gate:** `npm run docs:build` green (link gate) after every stage.

**Next task:** SP-E1-2 Phase A (audit + STOP) on branch `dev/prog1-p5-e1-2`.

---

**Context.** ShuttleWorks has no intake capability — operators put players into workspaces
by hand (Meet: a flat roster in the `tournaments.data` blob; Bracket: a per-event
participant picker). Entries adds public self-service registration: players sign up for
events within a tournament weeks before event day, and an operator reviews and commits them
to the roster. It is the first public **write** surface, the first capability with a genuine
cloud dependency, and the first that runs on calendar time rather than event time.

**Design spec:** `docs/superpowers/specs/2026-08-06-entries-design.md`.

---

## SP-ENTRIES-R1 — Research & design: DONE (2026-08-06)

Research and design only. **No production code, tests, migrations or config were touched** —
the session produced exactly two new files (the spec and this ledger) and modified nothing.

### What the audit overturned

The brief and its prior-thinking hypothesis were both wrong in ways that changed the design,
which is the main product of this session. Full discrepancy log lives in §10 of the spec;
the three that mattered:

1. **Operations is not a module.** The brief called it "the most recent precedent for adding
   a module". `MODULE_IDS = ("meet","bracket","display")` (`database/models.py:606`);
   Operations has no `workspace_modules` row at all and is Tier-2 always-on per ADR 0001.
   The brief's derived argument — "modules perform verbs on matches, Entries doesn't, so it
   isn't one" — collapses on the same reading: **Display performs no verb on matches either**
   and is a Tier-1 module. ADR 0001's real criterion is "user-facing, enableable".
2. **Meet has no events concept.** Bracket has `bracket_events` + per-event
   `bracket_participants`; Meet has a flat player list inside the JSON blob. The hypothesis's
   "entries attach to events" had a landing spot in exactly one of the two workspace kinds.
3. **A public write is currently unreachable.** Every public route today is a GET;
   `tests/test_auth_surface.py` enumerates the session-free surface with a reason per entry
   and contains zero public writes to workspace data; and **Cloudflare Access fronts the
   whole application** with only `/display/*` excluded (`SEC_PROGRESS.md:66`). Entries v1 has
   a hard prerequisite that lives in the Cloudflare dashboard, not in this repo.

### Decisions taken (all provisional pending review)

- **Q1 — Entries IS a Tier-1 module**, but its `workspace_modules` row is **seeded only in
  cloud mode**. This is what keeps ADR 0005 ("every module a workspace shows is actionable")
  true: a local workspace never sees Entries at all, rather than seeing a module it can
  never enable. Rejected: core-capability-like-Sharing (Tier-2 means always-on, which Entries
  is not), and a separate product surface (would duplicate tenancy and the uniform-404 seam).
- **Q2 — a new Entries-owned `entry_events` table**, with an optional `bracket_event_id` and,
  for Meet, a mapping onto the `PlayerDTO.ranks[]` code vocabulary. Least coupling to the
  legacy `kind` split; a shared events concept stays possible later as a re-point.
- **Q3 — the commit seam is re-runnable and additive, not one-shot.** BWF separates the entry
  deadline from the withdrawal deadline and TDs handle late entries routinely; a one-shot
  commit would push them back to manual roster editing. Post-commit withdrawal never mutates
  the roster — it raises `COMMITTED_ENTRY_WITHDREW` for an operator.
- **Q4 — two addresses, not one.** A discoverable public slug for the entry *page*; a
  per-entrant capability token for a specific *entry*. The hypothesis wanted to extend the
  display-token pattern wholesale, but an entry page needs to be shareable, which is exactly
  what a capability URL exists to prevent.
- **Q5 — dedup uses the solve-rail `Idempotency-Key` header** (client-supplied, never
  server-derived), *plus* a separate natural-key unique index on
  `(entry_event_id, lower(contact_email))`. Two different failures; conflating them is the
  trap `models.py:785-787` already documents for solve jobs.
- **Q6 — doubles v1 is nominate-by-email + confirmation link.** Unpartnered stays `pending`;
  over-cap is `waitlisted`. Pickleball Brackets conflates the two by auto-waitlisting
  unpartnered teams; we deliberately do not.
- **Q7 — the dual-mode boundary statement** is quotable verbatim from §2 of the spec. The one
  leak is named rather than hidden: the review desk needs connectivity. Committing is a
  pre-event activity; the offline guarantee attaches to event day.
- **Q8 — payments deferred, integration boundary fixed now.** The Stripe webhook clears
  exactly one pending-reason (`awaiting_payment`) and never confirms an entry.
- **Q9 — the phase vocabulary extends `_derive_phase`**, which already exists
  (`api/workspace_signals.py:297`) and which the brief assumed did not. Three new values in
  front of the existing four; the four keep their meanings exactly, because SP-UI-1 consumes
  this as a contract.
- **Q10 — GDPR does not block E1, does block public launch.** The load-bearing detail:
  entrants have no account, so the capability link *is* their erasure path and must offer
  withdraw-and-erase, not merely withdraw. Nearly free in E2, expensive retrofitted.

### Traps recorded for the implementing session

- **The Meet roster is behind the `If-Match`/`state_version` contract** from SP-CLOUD-4
  (`repositories/local.py:217-256`, fail-closed 409). The commit path must fetch-modify-retry,
  not assume it owns the blob.
- **Turnstile validated client-side is worth nothing** — bots post directly to the endpoint.
  Server-side token validation or don't bother.
- **Attention codes are bare string literals** (`workspace_signals.py:368-380`) hand-mirrored
  in `products/hub/nextAction.ts:7-11`. Entries adds six, doubling the count. Promote to a
  shared constant or log it as debt.
- Adding a module touches more than the backend: `ModuleId`, `MODULE_IDS`/`derive_modules`,
  `AppTab`, `buildWorkspaceNav`, `moduleModel.ts`, `ModuleOutlet`, `moduleContract.ts` **and**
  its test baselines.

### Delivery plan

E1 walking skeleton (public write proven end to end, cloud-only, singles, no payment) → E2
lifecycle + erasure → E3 doubles → E4 signals/phases → E5 fees + retention. Stripe post-v1.
E1 is ordered first specifically to test the riskiest assumption — that a public write can be
exposed safely at all.

### Gates

None applicable — nothing executable changed. `git status` verified: two new untracked files
(`docs/superpowers/specs/2026-08-06-entries-design.md`, `docs/programs/ENTRIES_PROGRESS.md`),
zero modified.

### Deliberately not done

- **No STOP-gate reports.** The brief specified four hard phase gates; the user chose a single
  continuous run. The cost is real and is flagged in the spec header: Q1, Q3 and Q7 are
  one-way doors reviewed after the fact rather than steered. They are written to stay cheap
  to reverse.
- **The attention-code constant cleanup** — in scope for the implementing session, not for a
  design session that changes no code.
- **The Cloudflare Access exclusion runbook entry** (`docs/how-to/install-selfhost.md`) — it
  documents a real deployment step, so it belongs with the slice that makes the route exist.
- **Minors / guardian consent** — a product and legal call, not a spec-time one. Open question
  §9.2; blocks E5, not E1.

### Open questions / stops

See §9 of the spec. The two that need a human: **minors/DOB collection**, and whether the
`entry_events.code` → Meet `ranks[]` mapping holds up in practice or Meet needs a thin events
concept sooner than Q2 assumes.

---

## Combined R2+R3 sign-off: RECORDED (2026-08-07)

The user confirmed both acts with "confirm":
1. **Spec status flipped provisional → ACCEPTED** (header edited; covers the R2 and R3
   amendment passes together — this also closes the Phase 1 gate open since 2026-08-06).
2. **Password-based entrant auth confirmed as the default** (Q13 §4 marker discharged;
   passwordless email-code stays recorded as rejected). SP-E1-2 Phase A must not re-ask.

**Next task:** SP-E1-2 Phase A (audit: account storage, session scoping + CSRF trap,
player-level physical form, migration data premise → STOP report).

---

## SP-E1-2 Phase A — audit and plan: DONE (2026-08-07). STOP presented; awaiting go-ahead.

**Branch:** `dev/prog1-p5-e1-2`. **Baseline re-confirmed:** backend 1197/66sk, frontend
1433/175. Audit by fresh-context Opus agent (217k tokens), all citations file-verified.

**The four decisions (evidence in the session STOP report):**
- **D-A2 — account storage: sibling `entrant_accounts` table; `users` reuse REFUSED.**
  Decisive evidence beyond the spec: **27 session-gated routes carry no `{tournament_id}`**
  and sit outside the OpenAPI-derived tenancy test — incl. `POST /tournaments`
  (`api/tournaments.py:322-395`, an entrant would create and own a workspace) and
  `POST /invites/{token}/accept` (`api/invites.py:234-275`, an entrant with a leaked token
  becomes a member). Reuse = discriminator checks on 27 untested routes (fail-open);
  sibling table makes entrant-membership unrepresentable via the FK to `users`. Password/
  throttle/token-hash helpers are principal-agnostic module functions — reused, not forked.
- **D-A3 — sessions: separate `entrant_sessions` table + `sw_play_session` cookie +
  `get_current_entrant` resolver (no bootstrap fallback).** Unconfusable-by-construction
  over a fail-open discriminator. CSRF fix: `session_cookie_names` tuple in config,
  `main.py:250` checks any-of, plus a cookie-name registry guard test.
- **D-A4 — player level: `entry_players` table.** The spec's §4 index
  `(entry_event_id, entry_player_id)` requires it; `remarks` at player level demands it.
- **D-A5 — data premise VERIFIED: 4 entries rows exist in the world, all demo**
  (`sw-e1-demo` Postgres = the Phase E walkthrough; every dev SQLite predates the entries
  migration). **Clean rebuild authorised** per rule 6, recorded as an evidence-resolved
  deviation from spec §4's additive posture.

**New finding F-E1-2 (reported, not patched):** multi-event submissions break the
per-entry ≡ per-human coincidence — Seam A's `entry-<id>` roster ids will produce
duplicate roster players per human (one per event). Compounds F-E1 (§9.3); recommend
ruling in E2/Phase 7; Seam A stays byte-for-byte in this slice.

**Proposal for confirmation:** `gender_mismatch` is an entry-level `pending_reason`
(R7 `needs_review` precedent), NOT one of Q9's six workspace attention codes.

Landing-zone map, 19-task test-first plan, and the per-ruling unwind inventory are in the
STOP report. Untouched-by-design list includes `test_entries_commit_seam.py` (edit = STOP).

**Go-ahead recorded (2026-08-07, "yes go ahead"):** the four Phase A decisions, the
F-E1-2 deferral (Seam A byte-for-byte; ruling owed in E2/Phase 7 with F-E1), and
`gender_mismatch` as an entry-level pending_reason are all accepted. Phases B-E proceed.

### SP-E1-2 Phase B: DONE (2026-08-07, backend 1305/66sk, +108). Rule-1 STOP at Phase C, resolved.

Phase B landed across two runs (a session-limit outage split it; B0-B2 then B3-B8, commits
`168a46e`..`80d10b7`): entrant principal (accounts/sessions/service), CSRF any-of fix +
cookie registry guard, throttle namespaces (director-lockout isolation proven), signup/
login/logout/me as a JSON API (deliberate D3 divergence, reasoned: a form post cannot send
the CSRF header its own cookie requires), cross-principal controls both directions,
auth-surface preamble rewrite, infra docs. Unwound: 0 tests (comment blocks only).

### SP-E1-2 Phases C-D + adversarial verify: DONE (2026-08-07)

Resumed workflow (`wf_dc5cc1bd-c13`): Phase C landed the clean-rebuild migration
`s3d8f2b5c0e1` (deviation recorded in a 40-line docstring; `r2c7e1f4a9b3` untouched),
`submissions`/`entry_players`/re-pointed `entries` with association-proxy reads keeping
Seam A byte-for-byte (verified: 0-byte diff on `services/entries.py`; the 23 seam tests'
only touched "assert" is in a docstring), the submission service (replay returns the
original act + all entries), server-side fee seam, policy refusals, `gender_mismatch`
flag, and the submit re-gate (anonymous-submit controls inverted in the same commits).
Notable Phase C deviation, accepted: form CSRF via a session-bound double-submit token
(SameSite=Lax alone rejected on Chrome's Lax+POST evidence; fetch rejected because the
page ships `script-src 'none'`), with exactly one anchored middleware exemption.
Phase D landed the multi-event form (R14 §6 IA, gender filter + override, server-computed
running total, R11 both-width CSS), the manage-token close-out, desk submission grouping,
and the frontend reshape. Backend **1418/66sk** (+221 over the slice baseline), frontend
**1442/175**; all eight gates green; depcruise edge count held at 2268.

**Verify:** all four Phase A decisions + D4 + Seam A verified against the tree; **five
negative controls proven by inversion** (bootstrap resolver, cross-resolver fallback,
cookie-registry narrowing, second fee implementation, form double-submit). Unwind tally
reconstructed from git: every modified group ruling-named; the untouchable files all have
empty diffs. Four minor findings → fix agent (Turnstile fail-closed successors at signup;
fee-card normalization divergence incl. a public 500; SameSite docstring contradiction;
**F-E1-2-D1** — config routes lacked the R12/R14 fields Phase E seeds through, extended
additively per the Phase A plan's own allowance). Fifth finding (entrant-account CASCADE
pre-decides E2 erasure) recorded in the debt-log as a **ruling owed before E2**.

**Rule-1 STOP (Phase C agent, correct):** SP-E1-2 demanded both "schema removes
player_name/remarks/contact/manage_token_hash from entries" and "the 23 commit-seam tests
pass unedited" — the tests' FIXTURES construct Entry with those columns. Measured: the
collision is 11 construction lines, zero assertions; the seam module needs zero edits
(association-proxy reads proven by probe). **Orchestrator ruling under delegated
authority:** fixture construction may be mechanically adapted (dedicated flagged commit,
R13/D-A4); assertions and services/entries.py remain untouchable. SP-E1-2.md done-condition
amended in place with the dated ruling; workflow resumed.

### SP-E1-2 Phase C (C1-C6 + the submit re-gate): DONE (2026-08-07, backend 1390/66sk, +85)

Commits `0c0c1a4`..`22684ce` on `dev/prog1-p5-e1-2`. Gates: backend
**1390 passed / 66 skipped** (Phase B baseline 1305/66 — **+85**, skips
unchanged, zero regressions); `ruff check backend tests` clean. The
frontend is untouched by this phase.

**What landed, in commit order.** `entry_fees` (R14 §1 — cumulative totals
by DISTINCT event count PER PLAYER, per-event fallback, `None` not `0` when
nothing is priced) → `entry_policy` (caps refuse with the rule stated;
`check_policy` structurally cannot see a gender, so Q14 §5's soft flag
cannot be turned hard by a later branch) → the schema levels →
`services/submissions.py` (one act; replay returns the original submission
**and all its entries**; the whole write inside the IntegrityError guard,
because the unique index refuses at the flush that inserts the submission,
before any entry exists) → the re-gated submit → the narrowing + fixture
adaptation → migration `s3d8f2b5c0e1`.

**Seam A is byte-for-byte intact.** `git diff` on `services/entries.py`
across the whole phase is **empty**. The amendment's mechanism worked as
predicted: `Entry.player_name` / `.remarks` are association proxies onto
`entry_players`, and `.contact_name` / `.contact_email` are read-through
properties onto the submitting account, so both the seam and
`EntryDeskRowDTO` are unedited. In the seam's 23 tests the only line this
phase touched containing the word "assert" is a docstring sentence saying
so (verified by diff).

**Two decisions worth the next stage's attention.**

1. **The form CSRF token.** Phase B's handoff flagged that a session-gated
   native form post would be refused by the CSRF middleware, and listed
   three options. Chosen: **a double-submit token derived from the session
   cookie** (`api/entries_public.py::_form_csrf`), plus one anchored
   middleware exemption for `POST /e/{slug}/submit`. The SameSite=Lax-alone
   argument was **rejected on evidence**: Chrome's Lax+POST intervention
   sends Lax cookies on cross-site POST for two minutes after they are set,
   which is exactly the window after a login. `fetch` was rejected because
   the page now has `script-src 'none'` and a form needing JavaScript is
   degraded functionality at the widths R11 makes co-equal. The exemption
   is pinned as the only one (`test_csrf_cookie_registry.py`, +3).
2. **The page tightened to `script-src 'none'`** — a second-order effect of
   the challenge moving to signup, and a real improvement, since the
   acknowledgment gate was always the HTML `required` attribute.

**Test unwind tally, per ruling.**

| Ruling | File | Change |
|---|---|---|
| R10 | `test_auth_surface.py` | allowlist entry for `POST /e/{slug}/submit` **removed**; preamble bullet + note rewritten. **7 tests replaced by 2**: the challenge pair moved with the challenge to `test_entrant_auth_routes.py`, flood/idempotency moved with the route's new shape, and "the always-pass secret WRITES the entry" **inverts** into "an anonymous submit is rejected" + its signed-in control. 14 → 9 |
| R10/R13/R14 | `test_entries_public_routes.py` | rewritten for the gated surface. 47 → 64 |
| R10 | `test_cross_principal_sessions.py` | submit joins `ENTRANT_REACHABLE` (a logged-in entrant reaching its own route is the intent) |
| R13/D-A4 | `test_entries_commit_seam.py` | **fixture construction only, 0 assertions**, in its own flagged commit |
| R13/D-A4 | `test_entries_desk_routes.py` | same, plus **one negative control replaced**: the manage-token leak test would have survived as a trivial truth about a deleted column, so it becomes a leak test against the credential material that exists now (password hash, session token) |
| rule 6 | `test_entries_migration.py` | migration-shape unwind. **No assertion weakened; 3 added** — the two superseded indexes asserted ABSENT by name, `entry_players.gender` NOT NULL in the production DDL, and the case-insensitive account index exercised. 6 → 9 |

Superseded negative controls **replaced in the same commit** in all three
places they arose; none deleted.

**Deviations, all recorded rather than worked around.**

- **Migration posture** — spec §4's "additive then narrowing" backfill was
  not executed; the clean rebuild authorised by D-A5 was, with the
  evidence paragraph in the migration docstring. `upgrade` destroys entry
  data by design and says so.
- **Known-red window, disclosed in the commit that opened it.** The
  reshape series carried exactly one failing test —
  `test_migration_matches_the_models_column_for_column` — from the commit
  that added the levels until `s3d8f2b5c0e1` landed, because a single
  clean-rebuild revision can only be written against the final model shape.
  Nothing else moved. Restored green at `22684ce`.
- **A transitional dual-write** of the contact/player block existed for two
  commits so the desk projection kept agreeing with the level boundary;
  removed in the narrowing commit as promised. It never shipped.
- **Minimal form markup landed with the route**, not with Phase D: two
  player blocks, a checkbox per open event carrying the player index, the
  fee schedule *stated* rather than totalled live, and the venue/payment
  blocks. The running total, gender filtering, the timeline and the R11
  both-width pass are Phase D's work on this same markup — the route could
  not be re-gated without a form that posts the payload it now takes.

**Open for Phase D/E.** `EntryDeskRowDTO` still has no submission grouping
or fee total (Phase D item 3). `partner_invite_id` from spec §4 is not
created — it is an E3 column and was outside C2's list. F-E1-2 stands
unchanged: multi-event submissions produce one roster player per entry, so
a human in three events reaches the roster three times; the ruling is owed
in E2/Phase 7 alongside F-E1.

### SP-E1-2 Phase D (D1-D4): DONE (2026-08-07, backend 1418/66sk, frontend 1442/175)

Commits `2f4af8d`..`2c99d5f` on `dev/prog1-p5-e1-2`. Gates: backend
**1418 passed / 66 skipped** (Phase C baseline 1390/66 — **+28**, skips
unchanged, zero regressions); frontend **1442 passed / 175 files**
(baseline 1433 — **+9**); `ruff check backend tests` clean; eslint **0
errors / 104 warnings** (unchanged); depcruise **14 warnings, 2268 edges**
(unchanged — see below); `vite build` (with the `tsc -b` gate) green.

**D1 — the multi-event form.** The incumbent's information architecture
(R14 §6) rendered from fields this design created: a timeline card
(`opens_at → closes_at → withdraws_until →` tournament date, each stated
in UTC, and **"Varies by event"** rather than a headline date that would
be false about the other event), fee schedule + payment prose, venue,
organiser (`orgs.name` — the only field the audit found behind that card),
and per-event entry counts drawn from the same projection the public list
uses so the number and the names cannot disagree.

**The mechanism decision worth carrying forward: gender filtering and the
running total are server round trips, not script.** The page has
`script-src 'none'` (Phase C's tightening), so the form's second submit
button posts `action=filter` and the route re-renders with the list
narrowed and the total recomputed, writing nothing and spending no entry
budget. JavaScript was rejected twice over — it would loosen the CSP of a
page whose whole posture is that it runs no script, and it would make the
total shown a **second implementation** of the fee rules, which is exactly
what Seam B's "the total shown is the total recorded" forbids.
`_total_markup` calls `services.entry_fees.compute_fee_total`, and a test
asserts the rendered number equals the stored `fee_total_cents` for the
same selection.

Three things keep the filter a default rather than a gate: an
already-ticked event is **never hidden** (a selection vanishing off screen
is R14 §4's silent drop through a side door), the override checkbox puts
everything back **marked**, and a submitted mismatch is still accepted
carrying `gender_mismatch` (Q14 §5).

**R11 both-width.** The page keeps its phone-first stylesheet and earns a
second column at 60rem. The "no horizontal scroll" half is mechanical
rather than aspirational — nothing is sized in pixels (a test greps the
stylesheet for `width: <n>px`) and long unbroken strings wrap. Screenshots
at both widths are Phase E's.

**D2 — manage token.** Verification, mostly: Phase C had already deleted
the column, the mint and the success card, each with its successor test in
the same commit. What was left was two docstrings still claiming to
withhold a column that no longer exists, and a missing guard on the
**mint** (rather than on the output) — `secrets.token_*` now provably
absent from the public module.

**D3 — desk delta, minimal.** `GET .../entries` only; confirm and commit
byte-for-byte unchanged. `EntryDeskRowDTO` loses `contactName` /
`contactEmail` to a `submission` block (id as the grouping key, account
address, act fee total). **It costs no extra query** — both hops are
already `lazy="joined"`, so it stays one SELECT with two joins, and
`test_the_grouping_costs_no_extra_query_per_row` counts the statements,
because that is a loader-configuration property one edit away from an N+1.

**D4 — frontend.** Rows band by act (`groupBySubmission`, a pure function
keeping the **server's** order — re-sorting would compete with the
documented ordering and move an operator's place between reads); the
address and total sit on the band once. `GroupBandHeader` gained an
optional `detail` **string** (an email in the eyebrow's uppercase reads as
shouting); the first cut typed it `ReactNode` and **raised the depcruise
edge count by one**, so it was narrowed back — the count is unchanged at
2268.

**Test unwind tally, per ruling.**

| Ruling | File | Change |
|---|---|---|
| — | `test_entries_public_routes.py` | **+23, none unwound** (64 → 87). Every prior assertion holds, including the 390px bar, which R11 widens rather than replaces |
| — | `test_entries_desk_routes.py` | **+5, none unwound** (17 → 22). No backend test ever asserted the contact block, so the R13 removal had no backend successor to write. `_seed_entries` gained two fixture-only knobs (`act`, `fee_total_cents`); zero assertions touched |
| R13 | `EntriesDesk.test.tsx` | **1 edited, 0 deleted.** "shows the contact email" → "shows the submitting address on the act": same claim (this is the operator surface, not the public projection), same address asserted on screen, different place. +3 added (banding, once-per-act total, the gender flag *and* its confirmability) |
| R12 / Q14 §5 | `entryDisplay.test.ts` | **1 edited, 0 deleted.** "hasAttention is true only when needs_review" widens to "the reasons that are a question for the operator". No assertion weakened; the negative control gained two members (`awaiting_payment`, `awaiting_partner` must NOT light up) |

**Deviations and findings, reported rather than worked around.**

1. **FINDING F-E1-2-D1 (blocks Phase E as written).** SP-E1-2's CONTEXT
   lists the entry-page / entry-event **config routes as explicitly
   unaffected — "treat a need to touch as a finding"** — while **Phase E
   step 1 requires seeding through them with the R14 fields**
   (`PUT entry-page` carrying fee schedule / payment instructions / venue /
   policy caps; `POST entry-events` carrying `gender_constraint` and
   `withdraws_until`). `EntryPageUpsertDTO` and `EntryEventCreateDTO` carry
   none of those fields and the routes write none of them, so today those
   columns are reachable only by writing SQL — which Phase E's "seeded
   through real paths only" forbids. Phase D did not touch them. **Phase E
   needs a ruling:** widen the two config DTOs (a small, additive change
   this finding recommends), or accept a documented deviation in the
   walkthrough.
2. **The birth-year trigger is a heuristic, deliberately.** R12 asks for a
   birth year "only where an age-bracketed event requires it" and the
   schema has **no age-bracket field**, so `_AGE_BRACKET_RE` reads the two
   strings a director already writes (`U15`, `Under-15`, `40+`, `O40`) off
   the code and the discipline. Broad rather than clever, because the
   permissive error shows an optional field nobody fills in and the strict
   error hides one. A structured column is the honest fix and belongs with
   the config surface.
3. **`entry_pages.collect_phone` is still unread.** The column exists
   (Phase C) and the form offers no phone field: the phone lands on the
   **account**, and editing an account is E2's "my account". Recorded so
   the column's silence is a decision rather than an oversight.
4. **Two Phase-D tests were corrected while red**, both written in the same
   commit and both asserting the wrong thing about my own markup (the
   hidden positional `birthYear` input; `"0.00"` matching `"40.00"` in the
   fee card). No pre-existing assertion was involved.
5. **`install-selfhost.md` §4b's CSP paragraph was false** — it said the
   entry page allows `challenges.cloudflare.com`. The challenge moved to
   signup in Phase C and the page is `script-src 'none'`; the open question
   is now restated against the route it actually applies to (rule 10).

**Open for Phase E.** Finding 1 above is the first thing to settle. F-E1-2
stands unchanged (multi-event submissions produce one roster player per
entry, so a human in three events reaches the roster three times — the
ruling is owed in E2/Phase 7 alongside F-E1). Nothing in this phase touched
`services/entries.py`, `api/entries.py`'s confirm/commit routes, the module
system, or the `GET /e/{slug}` allowlist entry.

### SP-E1-2 adversarial-review fix pass: DONE (2026-08-07, backend 1454/66sk)

Commits `da18f19`..`aed00ce` on `dev/prog1-p5-e1-2`, one per finding. Gates:
backend **1454 passed / 66 skipped** (Phase D baseline 1418/66 — **+36**, skips
unchanged, zero regressions); `ruff check products/scheduler scheduler_core`
clean. The frontend is untouched by this pass.

| Finding | Fix | Tests |
|---|---|---|
| 1 — coverage regression | Commit `81458f1` moved the Turnstile challenge to signup (R10) and dropped two negative controls that had **no route-level successor**: the unreachable-verifier fail-closed control and the "refusal leaks nothing" control. Restored at `/e/account/signup`, where the challenge now lives. **No production change** — this is coverage the unwind owed | `test_entrant_auth_routes.py` 39 → 43. Includes the `verdict.retryable` branch asserted against the other branch's message rather than a literal. Proven as controls by mutation: with `verify_turnstile`'s transport handler returning `success=True`, three of the four fail |
| 2 — public 500 + price divergence | `_money_markup` iterated `page.fee_schedule` **raw** while the pricing read it normalized. A string-valued tier reached `_money`'s division → `TypeError` on the one route an anonymous visitor can reach; a dropped tier printed a price the total never charges. `entry_fees._schedule` promoted to the public **`normalize_fee_schedule`** — now the single reader of that column (card, total, and the config route below) | `test_entries_public_routes.py` 87 → 90 (TDD: the first two failed with the `TypeError`). Negative control: a clean three-tier schedule still prints all three |
| 4 — contradictory docstring | `_set_entrant_cookie` claimed `samesite=lax` means "a cross-site form post never carries it", contradicting `entries_public._form_csrf`'s own Chrome Lax+POST reasoning — on the function that *sets* the cookie, where the next author decides whether a new write needs CSRF proof. Rewritten to state what Lax buys and why it is insufficient alone, pointing at the header and the double-submit token | Docstring-only commit |
| 5 — **F-E1-2-D1** (blocked Phase E) | The config routes never learned the R12/R14 fields, so Phase E step 1's "seeded through real paths" was impossible. `PUT entry-page` gains all seven page fields; `POST entry-events` gains `genderConstraint` (closed vocabulary) and `withdrawsUntil`. Additive: every field optional, PUT whole-state semantics unchanged. Unusable fee tiers and discipline caps are **refused with the rule stated**, never silently dropped — the writer refuses coercion as well as dropping, and consults `normalize_fee_schedule` for tier collisions a type check cannot see. Validation precedes the write, so a rejected tier cannot cost a director the page they had | `test_entries_config_routes.py` 22 → 51, **the 22 existing tests unedited**; every refusal paired with its control |

**No tests were edited or deleted in this pass** — the four commits are
additive plus one docstring, so there is no unwind tally. Untouched, as the
slice requires: `services/entries.py`, the confirm/commit/desk routes, Seam A,
the module system, the `GET /e/{slug}` allowlist entry. **F-E1-2-D1 is closed;
Phase E's step 1 can now seed through real routes.**

### SP-E1-2 Phase E — dual-width demo: DONE (2026-08-07), servers left running

**Stack:** `docker compose -p sw-e1-2-demo -f docker-compose.cloud.yml` — fresh disposable
Postgres (old `sw-e1-demo` torn down with `-v`; its 4 demo rows were the only entries data
in existence, per D-A5). Migration chain ran clean through `s3d8f2b5c0e1` on first boot.
Vite dev on :5174 (HMR picked up the branch live).

**Walkthrough (screenshots in `.playwright-mcp/sp-e1-2/`, both widths):**
1. Seeded through real routes only: operator register + workspace + module enable;
   `PUT entry-page` with tiered `feeSchedule {1:2500,2:4000,3:5000}`, payment
   instructions, venue name/address, `maxEventsPerPerson`; three `POST entry-events`
   with `genderConstraint` (M/F/mixed) and `withdrawsUntil`.
2. `01-public-page-390px` / `06-public-page-1440px` — the R14 §6 IA at both widths:
   Timeline (withdrawal deadline distinct), Fees (tier list), Payment, Venue, Organiser,
   Events with live entered-counts, Regulations, entrant list.
3. Entrant signup (Turnstile dummy keys, server-side; non-enumerating 202) → login →
   `sw_play_session`. **Finding F-E1-2-E1:** the logged-out page names the account
   endpoints but ships no HTML signup/login form (the JSON-API divergence) — a human
   cannot self-serve an account without the Phase 6 `play.*` scaffold; demo used the API
   + cookie injection. Recorded as a Phase 6 input (below).
4. `02-form-total-390px` — the multi-event form: two player blocks, gender-filtered
   events, override control with honest copy, server-round-trip running total
   (**80.00 = 40.00 × 2 players at the 2-event tier** — per-person tiered pricing, R14).
5. `03-submission-received-390px` — **R13's headline: one act → submission `03160a43`,
   four entries across two players, one acceptance, one total**, payment instructions,
   and a success page pointing at "my entries" (E2) with no token.
6. **Replay at submission level:** same `Idempotency-Key` → same submission `3b17a6bd`,
   201 then 200, one act. **Gender override:** Riley Chen (F) into MS accepted with
   `gender_mismatch`. **Duplicate:** second "Alex Silva" into MS → `needs_review`.
   **Anonymous submit → 401** (the E1 headline behavior, inverted).
7. `04-desk-grouped-1440px` — desk bands by act ("Entered by maria… · 80.00 (4)"),
   both flag chips. Confirmed the 5 legitimate entries, left both flagged pending.
8. `05-commit-result-1440px` — "5 committed to the roster."; second commit → "Nothing
   new" (Seam A idempotent, contract untouched). Roster shows 5 players with
   `sourceEntryId` + verbatim remarks — **and F-E1-2 demonstrated as predicted:**
   Alex ×2 / Sam ×2 roster players (one per entry), the E2 ruling input.
9. **Dual-mode negative retained:** one-off `AUTH_MODE=local` backend on the same DB —
   no Entries on create/read, PATCH → `409 MODULE_REQUIRES_CLOUD`.

**No tunnel/DNS/Access/dashboard change of any kind** (Amendment A1 asserted again).

**Findings for Phase 6/7:** F-E1-2-E1 (no human-usable entrant auth UI until the play.*
scaffold — Phase 6 must treat signup/login pages as first-class scope); F-E1-2 (per-entry
roster duplication, ruling owed in E2/Phase 7 with F-E1); entrant-account CASCADE ruling
owed before E2 (debt-log).

**Servers running:** public page http://localhost:8600/e/wongworks-open · operator app
http://localhost:5174 (director@example.com) · entrant maria.silva@example.com · stack
`sw-e1-2-demo` (`docker compose -p sw-e1-2-demo -f
products/scheduler/docker-compose.cloud.yml down -v` to discard).

---

## Phase 6 — the entrant application: COMPLETE (2026-08-10)

**Design:** `docs/superpowers/specs/2026-08-07-phase6-entrant-app-design.md` (approved by the
owner 2026-08-07). **Plan:** `docs/superpowers/plans/2026-08-07-phase6-entrant-app.md`.
**Task ledger:** `.superpowers/sdd/2026-08-07-phase6-entrant-app/progress.md` — the running
record of every task, review, fix round and finding; read it before re-opening any decision here.
**Executes:** Phase 6 steps 1, 2 and 4. **Step 3 (email) is deferred entirely.**
**Branch:** `dev/prog1-p6-entrant-app`, 61 commits off `4dc3a93`.

### THE SHIP BLOCKER — RESOLVED 2026-08-10 (Task 33)

**Kept in full, because how it was found is the reusable part.** For two days this phase was
code-complete and shipped a product that did not work. The defect, the way it surfaced, and
what the fix cost:

#### The defect

`products/scheduler/entrant/app/routes/signup.tsx` renders
`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">` **directly into its own
markup**. The nginx CSP (`products/scheduler/frontend/security-headers.conf`) sends
`script-src 'self'`, which does not allow that host, so Chromium blocks it:
`script-src-elem blocked https://challenges.cloudflare.com/turnstile/v0/api.js`. The widget
never renders, so the form posts no `cf-turnstile-response`, so `verify_turnstile("")` refuses
without a round trip: **every entrant signup answers `403 AUTH_CHALLENGE_FAILED`.** Because
ruling R10 puts entry submission behind an entrant session, and a session requires an account,
**the entrant surface is unusable end to end.** Reproduced in Chromium *and* with curl against
the real containerised stack (Task 30).

Dropping `<Scripts/>` from `app/root.tsx` (Task 22 fix A1) never touched this: that removed
React Router's hydration scripts, not a tag a route writes itself. "This tier ships zero client
JS" is true of the entry page and **false of the signup page**.

It was recorded rather than fixed on the spot, because both available fixes were policy calls
and neither was an evidence pass's to make (Amendment A1): **(1)** allow Turnstile's origin in
`script-src`/`frame-src` — the vendor's documented requirement, and a real weakening of the
policy that stops XSS on a money page; or **(2)** re-site or drop Turnstile from a route already
covered by the `esignup:<ip>` throttle and the `sw_entries` nginx zone, which is what R10's own
reasoning points at.

#### How it was caught, and the mechanism worth keeping

Nothing in the unit gates could see this. The policy comes from **nginx**, so no dev server and
no jsdom test is ever sent one: `react-router dev` sends no CSP at all, and the entrant suite's
269 tests were green throughout. It took a real browser in front of the real containerised
stack — which is exactly the class of regression the plan predicted a unit suite structurally
cannot hold, and the reason Task 30 exists.

It was then pinned as an **executable, self-clearing marker**: the case "the signup page emits
zero CSP violations" shipped as `test.fail()`, so it *ran*, and the day the defect was fixed it
passed unexpectedly and turned the suite red — forcing the stale marker out rather than letting
it rot as a skip nobody reads. That is the mechanism to reuse for any defect found without a
mandate to fix it.

#### The resolution (Task 33)

**The owner chose option 1: allow Turnstile in the CSP.** It is
[Cloudflare's documented requirement](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
and it restores the behaviour `signup.tsx` was already written to have.

**Scoped to one path, via a `map` rather than a wider snippet.** `frontend/nginx.conf` gains
`map $uri $sw_turnstile_origin` yielding `" https://challenges.cloudflare.com"` for
`~^/e/signup` and `""` everywhere else; `security-headers.conf` interpolates it into
`script-src 'self'$sw_turnstile_origin` and a newly-**explicit** `frame-src
'self'$sw_turnstile_origin` (`frame-src` was absent and inheriting `default-src 'self'` —
spelling it out admits the widget's iframe without widening `default-src` and every other
fetch directive that falls back to it). A per-location *variant snippet* was rejected on
mechanics, not taste: nginx cannot override an `add_header`, so a variant means duplicating the
whole header list, and two `Content-Security-Policy` headers are enforced as their
**intersection** — which would block Turnstile just the same. The map also touches no proxy
block, so it comes nowhere near the `proxy_set_header Cookie` line whose duplication is the
real hazard in that file.

**What it cost, stated plainly.** The origin now trusts one third-party script host, on one
public page. That is not free — the accepted risk below (same origin fuses the entrant and
operator blast radii) is precisely why the scoping matters: `/e/login`, `/e/{slug}`, `/api/`
and the operator SPA at `/` are still sent the previous policy byte for byte, verified with
curl against the running stack. Phase 11's origin split remains the real exit.

**Verified end to end in Chromium against the containerised stack**: zero CSP violations on
`/e/signup`, the widget renders, the `challenges.cloudflare.com` frame attaches, and a signup
**succeeds** — `POST /e/account/signup → 303`, with a subsequent login on the new credentials
issuing `sw_play_session` where a bogus address issues none. The stack runs Cloudflare's
always-pass **test** keys (the shipped defaults), so that proves the CSP and the wiring rather
than Cloudflare's own scoring path. The `test.fail()` marker is now a live control, joined by a
sibling that fails if any path other than `/e/signup` names that host; both go red on removing
the origin from `script-src` (executed). Amendment A1 held throughout — no Cloudflare
dashboard, DNS, tunnel or Access change was involved, only our own nginx header.

**Phase 6 is done, and the product works.** Nothing downstream is blocked on it.

### What shipped

- **The entrant surface is a real application.** React Router 7 in framework mode at
  `products/scheduler/entrant/`, served same-origin with the API (R8-A): nginx routes
  `/e/api/` and `/e/account/` to FastAPI and everything else under `/e/` to node, so there is
  no CORS, no cookie widening and no preflight anywhere in the flow. R8 spends SP-PROGRAM-1
  rule 4's single sanctioned new-dependency exception. **The node tier never relays a
  credential** — `apiFetch.server.ts` freezes an accept-only outbound header allowlist, and
  that property is held by structural guards enumerated over `app/routes/` from disk, not by
  one hardcoded path.
- **F-E1-2-E1 is closed in code.** First-class HTML signup and login pages exist (`/e/signup`,
  `/e/login`, node-owned; the forms POST to the unchanged FastAPI routes at `/e/account/*`).
  The E1-2 walkthrough recorded that the logged-out page *named* `/e/account/*` and shipped no
  form, so no human could self-serve an account; that demo used API calls and cookie injection.
  Signup was 403ing on the CSP until Task 33; it now succeeds end to end in a real browser
  (see "The ship blocker — resolved").
- **The throwaway HTML module is retired**, and the path-based CSRF exemption with it, in one
  commit (`84b73a3`) — they were the same fact, since the exemption could not be deleted while
  the route it named still existed. `api/entries_public.py` went 1313 to ~350 lines, and its
  router, its registration and the `main.py` import were deleted outright (an empty
  registration reads like a public surface and is none). A cookie-carrying write now proves
  itself with the custom header **or** a cookie-derived double-submit token (R8-B) — two
  enumerated channels rather than one channel and an escape hatch.
  **Correction to the plan's framing:** `_FORM_CSRF_ROUTES` was **not** the form-field proof
  channel. It was a *bypass of the header check*. The field channel is
  `app/form_csrf.form_csrf_proves()`, an awaited, path-independent clause that already ran
  first for every route. Deleting the pattern removed a bypass and took no proof channel with
  it — proven by re-running the mutation after the commit.
- **`UNIQUE (tournament_id, idempotency_key)` became reachable for the first time**, and that
  made a latent defect live: a native form cannot send a header, so a real entrant's key was
  always `NULL`; the loader now mints one and carries it as a field. `submissions.replay` was
  scoped by `(tournament_id, key)` only, so a guessed key returned **another entrant's
  receipt**. Migration `t4e9a3c6d1f2` narrows the index to
  `(tournament_id, account_id, idempotency_key)`, and `find_for_account` takes `account_id` as
  a **required positional** so a loader that forgets it gets a `TypeError`, not a leak. No test
  asserted the buggy behaviour — it survived as a *coverage* failure, not a wrong-assertion
  failure.
- **The tier ships zero client JavaScript.** Deleting `<Scripts/>` took the entry page from
  **126.6 KB to 2.5 KB** and the enforced page-weight budget from 123 KB to **4 KB**, still
  blocking. The inline `window.__reactRouterContext` payload went with it, so the viewer object
  (an entrant **email**) is no longer in the document at all.

### Rulings taken during the phase

| # | Ruling | Status |
|---|---|---|
| **R8** | React Router 7, framework mode (SSR) — spends the single sanctioned new-dependency exception | in force |
| **R8-A** | Same origin as the API; nginx splits by prefix. No `play.*` subdomain in this phase | in force; **it is also the accepted risk below** |
| **R8-B** | Two enumerated CSRF proof channels: the custom header **or** a cookie-derived double-submit token | in force |
| **R8-C** | The R14 fee quote stays session-gated | in force |
| **R8-D** | Node mints the `sw_play_csrf` nonce itself and renders its digest; no credential relay, no backend change | in force |
| **R8-E** | Always render the entry form; `Depends(get_current_entrant)` on the submit route produces the sign-in outcome — it is not a render condition | in force |
| **R8-F** | Raise the page-weight budget to the measured framework floor (123 KB), gate stays blocking | **SUPERSEDED 2026-08-10.** Task 22 fix A1 deleted `<Scripts/>`, so the floor the ruling was derived from no longer exists: 126.6 KB to 2.5 KB, budget to **4 KB**, still blocking. Recorded rather than deleted — it was the right call against the framework floor that existed when it was made |

R8-D and R8-E were taken mid-phase after a seam investigation returned **BROKEN**: node's
projection fetch is always anonymous, so `viewer.signedIn` was always `false` and
`viewer.formCsrf` always `""` on every server-rendered page. Cutting over without them would
have rendered the form to nobody and 403'd anything that did submit. It was invisible because
two test fixtures stubbed `viewer: {signedIn: true, formCsrf: 'csrf-token-abc'}` — **a shape
the real projection can never return to node.** The suite was green because the fixtures
assumed away the constraint the tier lives under.

### The 92 tests: migrated, not deleted

`tests/test_entries_public_routes.py` (92 tests, not the plan's 90) was removed at the
cut-over. Every claim has a named successor or a written reason, held by
`tests/test_entries_migration_parity.py`, whose assertions **inverted** at the cut-over: the
predecessor-side rows became `test_the_superseded_file_is_gone`, which is strictly stronger
post-cut-over because it fails if anyone reintroduces the old tests.

| Group | Successor home | Count |
|---|---|---|
| page projection, entrant list, IA cards, fee schedule, escaping, uniform 404, viewer block, registration | `tests/test_entries_page_api.py` | 25 |
| session gate, CSRF channels, acknowledgment, policy, fees, throttle, idempotency, soft flags, cross-tenant, body cap | `tests/test_entries_submit_api.py` | 53 |
| render-level markup claims | `products/scheduler/entrant/tests/*` (inside the **required** CI gate) | 14 |
| **deliberate drops, with written reasons** | — | **4** |

74 + 18 = 92, machine-checked. The ruling in every migrated case: **submission behaviour is
unchanged; only the serving context moves** from f-string HTML to RR7 plus a JSON route.

**The 4 drops are a real coverage loss, reported rather than absorbed.** Three
(`test_the_page_is_built_for_a_390px_screen`,
`test_the_page_carries_both_a_phone_layout_and_a_desktop_layout`,
`test_nothing_in_the_stylesheet_fixes_a_pixel_width`) asserted the contents of a hand-rolled
inline `<style>` block **that no longer exists** — the entrant tier renders through the design
system's Tailwind build, so a successor would be a class-name *spelling* check, which the
entrant suite already says in its own words is not viewport coverage. The fourth
(`test_the_success_page_points_at_my_entries_without_pretending_it_exists`) belonged to a
success page the receipt route replaced.

### R11 evidence — and precisely what it is and is not

Task 30 replaced the three lost viewport claims with a genuine control: at 390px and at 1440px,
against the **real Tailwind build in a real browser in front of the real containerised stack**,
`scrollWidth > clientWidth` must be false on the entry, signup and login pages. Layout needs a
layout engine; jsdom computes none, so vitest cannot see this at any price. Screenshots at both
widths land in the gitignored `.playwright-mcp/` under explicit paths (per the CLAUDE.md
bare-filename hazard); the committed artefact is the spec.

It also proves CSP **as a browser enforces it** — the policy comes from nginx, not the app, so
no dev server and no unit test is ever sent one — with its own negative control, because "no
violations observed" is the easiest green in this repo to fake: a browser that was never sent a
policy reports the same empty array as a clean page. An injected inline script must be both
*reported* and *prevented from running*.

**State it plainly: `products/scheduler/e2e` is not in the PR gate** (it boots the Docker
stack; the gates are deliberately lean). So R11 moved from "held by the design system and by
review" to **"a control that exists and can be run"** — not to "enforced". That is the honest
improvement available without standing up a new CI job, and it is the one thing a reader of
this entry should not round up.

Related, logged as debt: **`products/scheduler/e2e` is in no eslint project at all.** Only
`lint:scheduler` and `lint:entrant` exist, and neither covers that directory. It matters
because that directory is now being asked to host enforced controls.

### Two phase-long verification gaps are now CLOSED

Every task from 22 onward reported these as unverifiable for want of a running daemon. Docker
came up during Task 30 and both were checked on the real stack:

- **The entrant image builds** (exit 0) — so the Dockerfile CMD path
  `./node_modules/@react-router/serve/bin.js`, previously verified only from package-lock
  reasoning, resolves inside the image.
- **`nginx -t` passes** inside the running frontend container — the first time it has been run
  against an `nginx.conf` that three separate agents edited.

### The exit gate: the email clause stays OPEN, by ruling

Phase 6's exit gate includes "a real verification-class email lands in a real inbox". **It is
not met, and it is recorded as deferred rather than quietly dropped** (design §1, §10.6).
Step 3 needs an SMTP seam, a provider and DNS; Phase 2 (deploy on `wongworks.dev`) is not done,
and Amendment A1 forbids the DNS work the step requires. The clause is carried, not closed.
Phase 6 is code-complete against steps 1, 2 and 4 only, and this paragraph is the record that
the difference is deliberate.

### Accepted risk, logged

Same origin (R8-A) fuses two blast radii that were previously separate: script anywhere on the
origin can read the `_csrf` field out of the DOM, and can attach `X-ShuttleWorks-CSRF: 1`
itself and drive `/api/*` with the httponly `sw_session`. Taken knowingly; in-phase mitigations
are the per-response nonce CSP on the SSR tier, no user-supplied HTML in loader output, and the
resolution of the CSP-duplication tension. **Named exit: Phase 11's origin split.** Logged to
`docs/audits/debt-log.md`.

### Two lessons the phase earned, for `CODE_HEALTH.md`

1. **"Controls that cannot fail" was the dominant defect class — 13+ found across the phase.**
   Not wrong assertions: assertions no mutation can redden. A regex matching only `let|var`
   while citing `const x = new Map()`; a Set-Cookie relay assertion with no upstream Set-Cookie
   to relay; `expect(credentials).toBe('same-origin')` where the default already is; a Makefile
   control asserting a port literal that stayed green through two Criticals. Worst of all, one
   was **already shipped**: `test_an_operator_session_does_not_authorize_a_submit` claimed an
   operator cookie cannot submit, but the fixture never minted one, so `in (401, 403)` was
   satisfied by the route's CSRF guard alone — proven by degrading the identity gate and
   watching it stay green while both neighbours went red. **Every control owes an executed
   mutation.** That question — "what edit makes this red?" — caught all 13, and asking it is
   cheap.
2. **Ten consecutive tasks were bitten by plan-vs-shipped DTO drift.** The plan's assumed
   projection shape was wrong every time, and its test bodies would have `KeyError`'d, or
   compiled clean and been `undefined` at runtime. The fix that worked was procedural: every
   dispatch from Task 15 onward carried "reconcile the brief field-by-field against the shipped
   type before writing a line". **A plan is a hypothesis about the code; verify it against the
   code at dispatch, not at review.**

### Deliberately not done

Email (above); a `play.*` subdomain (R8-A — Phase 11); E2 lifecycle (withdrawals, partner
confirmation, payment state, "my entries" — Phase 7); F-E1 (entry events map onto a Meet
division, not a slot — still open, not patched ad hoc); the receipt page reads no submission at
all, so any well-formed UUID renders one (uniform, so no enumeration oracle, but a receipt is
therefore not evidence of anything — a Phase 7 follow-up in the debt log). **Nothing touched
the Cloudflare dashboard, DNS, tunnel config or Access** (Amendment A1) — including the ship
blocker's fix, which is a header our own nginx sends and touches none of the four.

Two smaller things also logged rather than fixed, both found by Task 30's dual-width capture:
the entry page renders a **"Sign out" button to anonymous visitors**, in the same document that
tells them to "Sign in or create an entrant account to enter" (the footer is unconditional and
the SSR viewer projection is anonymous for every reader); and `/e` with no trailing slash
serves a **soft 404** — React Router matches `root.tsx` on the basename and returns `200` with
an empty `<body>`, which is indexable by a crawler and a white screen to a human.

### Gates at the close (2026-08-10)

| Gate | Result |
|---|---|
| `make check` (eslint + vitest + depcruise + ruff + pytest) | **exit 0** |
| Backend `pytest` | **1560 passed / 66 skipped** (Phase 0 baseline 1018/66; Phase 6 branch start 1454/66) |
| Entrant `test:run` | **269/269** |
| `npm run docs:build` (hard gate — broken internal links) | clean |
| `docker compose config -q`, all six stacks | clean |
| `nginx -t` | successful, **inside the running frontend container** (first run of the phase) |
| Entrant image build | exit 0 (first build of the phase) |
| `e2e/tests/10-entrant-r11-evidence.spec.ts` | **6/6 green** against the containerised stack. Shipped as 5 cases with 1 `test.fail()` marking the ship blocker; Task 33 flipped it to a live control and added the scoping sibling. Not in the PR gate |

The backend count is **down 91 from the pre-cut-over 1651**, and that is expected: the deleted
file contributed 92 and `test_csrf_cookie_registry.py` gained 1. It is up **542** on the
Phase 0 baseline. The 18 render claims left pytest for the entrant vitest suite and the e2e
spec, so "strictly up in pytest alone" was never the right check — the sum across suites is.

### Task order actually run

`1-3 · 4-7 · 8-13 · 14-18 (+18b) · 19-21 · 21b · 25-27 · 22-24 · 28-29 · 31 · 30 · 32`.
Deployment (22-24) moved to last-but-one by owner amendment (build locally first,
internet-facing work last) — **not** last, because the cut-over deletes the FastAPI `/e/{slug}`
routes while nginx still points `/e/` at the backend until Task 22. Task **31 ran before 30** by
owner sequencing, so the R11 evidence pass captured final post-cut-over state. The plan's text
for Tasks 30 and 32 assumes the original order and is stale wherever the two disagree: Task 30
did not need to re-home 18 render claims (the cut-over had already homed 14 of them inside the
required CI gate), and Task 32's proposed parity-ledger edits describe assertions the cut-over
had already replaced.

## SP-P6-2 Phase C — the public IA, built and wired: COMPLETE (2026-08-11)

Branch `dev/prog1-p6-2-public-ia`. The Phase B sign-off (recorded in
`docs/superpowers/specs/2026-08-11-sp-p6-2-public-ia-design.md`, with the owner rulings and
final gate verdicts) preceded every wiring commit, per the brief's done-condition.

### What shipped

- **The three pages, wired to real endpoints.** `/e/` discovery (the G1 decline path: the
  loader fans out one `GET /e/api/page/{slug}` per listed slug — correct, N+1; a slug that
  404s mid-flight is dropped, not an error), `/e/{slug}` tournament page (hero band,
  phase-gated `?tab` links with `aria-current`, exactly one server-rendered panel), and
  `/e/{slug}/enter` (+`/enter/signed-in`) — the entry flow off the hub scroll, carrying the
  SP-P6-1 mint/echo/307-landing mechanics verbatim, ONE player block by default with
  "Add another player" as a real form round trip (Z12).
- **G0 (owner-approved backend change):** `_echo_redirect` now answers
  `/e/{slug}/enter[/signed-in]?…#total` and `entrant_or_back_to_form` answers
  `/e/{slug}/enter?refusalCode=NOT_SIGNED_IN#enter`. Server-authored fixed paths; the
  no-body-loop property, code-not-prose refusals and the `next_target` allowlist unchanged.
- **The component inventory** under `entrant/app/components/` (DateBadge, StatusChip,
  TournamentCard, FilterStrip, HeroHeader, TabBar, SectionCard, TimelineCard, FeeTable,
  EventRow, EntrantsList, StickyTotalBar, EmptyState, PlayShell), each state-tested by SSR
  string renders; the structural guards (`sourceGuards`) enumerate the new directory in the
  same change that created it.
- **The four sign-off refinements:** actionable-first "closing soonest" discovery order;
  the card chip in a fixed right-aligned position (a float, so long names keep the card's
  width); the nearest deadline restated inside the sticky total bar; the 390px filter sheet
  replaced by an always-visible compact strip (the checkbox-disclosure is gone).
- **Owner design correction (mid-phase):** desktop-first composition — hero CTA stays
  right-aligned on the title row, the enter page is a genuine two-column desktop layout
  (max-w-5xl main + 18rem sticky side rail, two-column event checkboxes), and every
  repeated gap now sits on the design system's 4/8/12/16/24/32 spacing scale.

### What was deleted (parity proven first)

`entry.tsx`, `entry.form.tsx`, and the five Phase B `mock.*` modules. Every old URL serves
its superior replacement (`/e/{slug}` → tournament page; the form → `/e/{slug}/enter`), and
the `/{slug}/signed-in` variant's two producers both moved to `/enter/signed-in` with G0.

### Parity evidence (live, through nginx on :8090, seeded demo)

sitemap.xml and robots.txt byte-compatible; closed page vs unknown slug **byte-identical
404s** (cmp-verified); OG/meta derived from the loader on `/e/{slug}`; reserved slugs still
derived from the route table (no new top-level static segment); `_csrf` double-submit and
loader-minted idempotency key on the live form; anonymous submit → 303
`/enter?refusalCode=NOT_SIGNED_IN#enter`; signed-in quote → **307**
`/enter/signed-in?totalCents=4500#total` with the re-posted body rendering the quoted
total; submit → 303 receipt; replay → identical Location; the operator Entries desk
received the submission (id f10ec0b8…, fee 4500, R12 gender flag intact). `/e/` answers a
real page (the front door), never a blank 200.

### Gates

entrant vitest **530/530** (Phase C baseline 399); typecheck + eslint clean;
root depcruise **0 errors**; backend pytest **1596 passing / 66 skipped** (one
migration-parity ledger repoint for the renamed test files); page-weight gate (blocking,
4 KB/page): `/e/` **2.0 KB**, `/e/{slug}` **2.1 KB**, `/e/{slug}/enter` **3.2 KB** gzipped,
**0 script tags each** — G6's re-derivation not needed. Dual-width screenshots in
`docs/screenshots/sp-p6-2/` (390 + 1280, every page). **A2 restated: nothing touched
exposure, DNS, tunnels or keys — the stack is local.**

## SP-P6-2 Phase D — the demo walk: COMPLETE (2026-08-11)

Branch `dev/prog1-p6-2-public-ia`. The rebuilt public site walked end to end in a real browser
against the seeded demo stack (`:8090` nginx / `:8600` API, `AUTH_MODE=cloud`), console and
network panels open on every page. The stack is left running.

### Seed: the states discovery filters on

The demo scenario produces two open entry pages and one closed one, which is not enough to
demonstrate a status facet or a date preset. A new **`entry-states` simulator scenario**
(`simulator/tournament_sim/scenarios/entry_states.py`) adds three more through the operator's own
API — `bay-late-summer-2026` (open, closes in 2d, played in 5), `cardinal-fall-2026` (published,
entries closed, still upcoming) and `golden-gate-spring-2026` (published, entries closed, already
played). It is **additive** — it creates its own workspaces and touches nothing already there —
unlike `demo`, which is a from-scratch seeder. Deadlines and dates are computed from the moment of
the run, never fixed, because `_event_is_open` measures `closes_at` against the wall clock.

**There is no "unlisted" state, and none was faked.** The brief asked for a tournament that renders
by direct slug but stays off discovery. `EntryPage.is_open` decides both questions at once — off is
the uniform 404 (`_resolve`), on is public *and* on `GET /e/api/pages`, which discovery and the
sitemap read. The model cannot express a third position. Five listed tournaments + the 404,
rather than four listed + an invented flag.

### The walk

Discovery → filter by status (`open` 3/5, `upcoming` 1/5, `past` 1/5) → filter by date preset
(`7d` 1/5) → empty state → card → tournament page, all three tabs → Enter → sign in
(`coach.reyes@example.test`, `next` returned to the enter page) → two players, three events →
`Add another player` round trip preserving every typed field → **`Update total` → 115.00, 3 events**
(70.00 + 45.00 against the published per-player bundle schedule) → submit → 303 receipt
`ca849a8e-…-6520aea1f700`, **Amount recorded 115.00** → the two players appear on the public
entrant list (71 → 73 entrants, 85 → 88 entries). Then the closed page: **404, byte-identical to an
unknown slug** (same MD5). Screenshots of every page at 390px and 1280px in
`docs/screenshots/sp-p6-2/` (`walk-*`).

### Defects found (public surface, 2026-08-11) — all OPEN

| | | |
|---|---|---|
| **E1** | Sign-in, sign-up, the receipt and the 404 never got the page system | No `PlayShell` — no header, no footer, no way back to the listing. The 404 is default browser typography at the top-left of an empty page. Brief §4 asked for these "re-skinned into the same system, auth pages as small centered cards"; they were centred, not carded, and not shelled. |
| **E2** | The discovery card title wraps around the chip at 390px | `TournamentCard`'s own docstring says *"On phones it stays the bottom row"*; the code has an unconditional `float-right` with no breakpoint. **Not fixed here**: `components.test.ts` pins that float unconditionally, so the fix needs a test change — stop-and-flag per CLAUDE.md. |
| **E3** | The sign-up handoff loses the tournament | On `/e/{slug}/enter` the sign-in link carries `next`; the "create one" link is a bare `/e/signup`, whose redirect target is a hard-coded constant (deliberately, so it can never carry an attacker-chosen value). The newest possible entrant gets the worst journey. |
| **E4** | The header offers "Sign in" to a signed-in entrant | Structural: the node tier is forbidden from reading the session cookie (R8-D), which is why STOP-1 deferred signed-in states. Same cause puts an unconditional, primary-weight **Sign out** button at the foot of the entry page for signed-out visitors. |
| **E5** | Smaller: fees carry no currency symbol (no currency field exists — the renderer refuses to invent one); the 390px sticky bar costs a third of the screen and overlaps the field above it; the closed tournament page says "Entries closed" twice on one line; a GET filter form echoes empty params into the URL. |  |

Nothing else: no JavaScript errors, no failed requests, no hydration warnings, no horizontal
scrolling at either width on any page, no control that did nothing when pressed.

### R11's viewport control, repointed

`e2e/tests/10-entrant-r11-evidence.spec.ts` was aimed at SP-P6-1's three pages and the markup they
measured is deleted. It now covers the whole signed-out inventory — seven pages × two widths — plus
three IA claims a screenshot cannot distinguish from its failure mode (the seeded tournament really
appears as a discovery card; the gated-off tab is absent *and* unaddressable by `?tab=`; the hero
CTA navigates rather than scrolling). It signs in when the deployment has accounts (once per file —
nginx limits `/api/auth/` to 10r/m burst=5) and deletes its own workspaces in `afterAll`, because an
open entry page is now a card on the front door. **9 passed** against the demo stack.
e2e remains outside the PR gate by design.

### Gates

entrant vitest **530/530**; backend pytest **1596 passed / 66 skipped**; `make check` green
(eslint, `tsc -b` ×2, frontend vitest, depcruise, ruff, pytest); `npm run docs:build` green;
page-weight gate (blocking, 4 KB/page) **`/e/` 2.0 KB · `/e/{slug}` 2.1 KB · `/e/{slug}/enter`
3.2 KB gzipped, 0 script tags each**. The owner walkthrough at
`docs/screenshots/demo/walkthrough.html` §10 was rewritten around the new IA (that path is
gitignored, so it is a local artefact and carries no commit). **A2 restated: nothing touched
exposure, DNS, tunnels or keys — the stack is local.**

## SP-P6-2 Phase E — the demo-walk defects, closed (2026-08-11)

Branch `dev/prog1-p6-2-public-ia`. All five Phase D findings fixed, one commit each, each
with a regression test that was red before it and green after. The seeded stack was left
running throughout (`:8090` nginx / `:8600` API) and every fix was re-checked in a real
browser at 390px and 1280px.

| | Fix | Commit |
|---|---|---|
| **E1** | `MessagePage` puts sign-in, sign-up, the receipt and every not-found state inside `PlayShell` — one component for five boundaries, not four page chromes. `root.tsx` gains an ErrorBoundary so a path matching NO route (`/e/a/b/c`) stops answering React Router's "Unhandled Thrown Response!" page, which also carried an inline `<script>` the CSP blocks. Auth pages become the small centred cards brief §4 specified. | `de48ece` |
| **E2** | The discovery card's chip float is now `sm:`-scoped; below that the content column is a flex column and the chip is `order-last` — the bottom row the component's docstring always claimed, with no duplicated markup. Desktop is unchanged: one vertical line of chips, names at full card width. | `88e490a` |
| **E3** | `/e/{slug}/enter`'s "create one" carries the tournament as a path segment (`/e/signup/{slug}`); `signup.tsx` composes the return URL and validates it with `safeNext`, hoisted into `app/lib/nextTarget.ts` so both account pages share the one allowlist. A non-slug falls back to the old constant. Signup's loader keeps its zero-arity signature. `/e/{slug}/enter/created` is the landing. | `5c99c2a` |
| **E4** | "Sign out" drops to the outline variant. It stays unconditional (the tier cannot know who is reading) and the hedged copy above it is unchanged; the glow now belongs only to "Submit entry". The header half of the finding is untouched — structural, STOP-1/R8-D. | `cf334a7` |
| **E5** | Sticky bar: `pb-24` on the scrolling column so the acknowledgment clears it, and a slimmer bar on phones (`p-3`, buttons 2-up) — **176px, 21% of an 844px viewport**. The closed hero states "Entries closed" once (the chip; the CTA slot is empty when there is no action). Discovery canonicalises its query, so a blank filter apply lands on `/e/` rather than `/e/?q=&status=&preset=&from=&to=`. Fees still render `45.00` with no currency, deliberately — written up as **gate proposal G7** in the design document. | `dfa04e5` |

**Three test assertions changed, all reported rather than quietly edited**, because each had
pinned the defect: `components.test.ts`'s unconditional `float-right` (E2 — now
`sm:float-right` present *and* a bare `float-right` forbidden, with the phone bottom row
added); `login.test.ts`'s bare `/e/signup` on the entry page (E3 — now
`/e/signup/spring-open`); and `receipt.test.ts`'s `not.toContain('<form')` (E1 — now
`not.toMatch(/<form[^>]*method="post"/)`, since the page wears the shell's GET search form
and the property was always "nothing here can re-fire the entry POST").
`tests/unit/test_form_csrf_cross_tier.py` was repointed at `nextTarget.ts` — the same
byte-identity check, at the constant's new address, exactly as that file instructs.

### Live verification (seeded stack, both widths)

- **Uniform 404 re-proven with `cmp`**: `/e/dave-freeman-classic-2026` (published page,
  entries shut) and `/e/no-such-thing-2026` (unknown slug) are **byte-identical**, 3085 bytes
  each, and both now render the full page system.
- **Sign-up journey end to end in the browser**: `/e/bay-late-summer-2026/enter` → "create
  one" → `/e/signup/bay-late-summer-2026` → submit → **303 to
  `/e/bay-late-summer-2026/enter/created`**, which says the account is ready and offers a
  sign-in that returns to the same page. A crafted slug (`%2F%2Fevil.example`) renders the
  `/e/login/created` constant instead.
- **390px card titles** no longer wrap around the chip; no page overflows 390px
  horizontally; the acknowledgment checkbox is clear of the sticky bar at full scroll.
- Screenshots: `docs/screenshots/sp-p6-2/fix-*.png` (390 + 1280).

### Gates

entrant vitest **561/561** (was 530); typecheck, eslint and `depcruise app` clean; root
`npm run depcruise` **0 errors** (14 pre-existing warnings); backend pytest **1596 passed /
66 skipped**; ruff clean; page-weight gate (blocking, 4 KB/page) **`/e/` 2.0 KB ·
`/e/{slug}` 2.1 KB · `/e/{slug}/enter` 3.3 KB gzipped, 0 script tags each**. **A2 restated:
nothing touched exposure, DNS, tunnels or keys — the stack is local, and left running.**
