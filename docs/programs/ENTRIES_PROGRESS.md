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
| 6 | play.* scaffold + email | not started | — |
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
