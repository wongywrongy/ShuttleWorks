# SP-ENTRIES / SP-PROGRAM-1 — Public platform program ledger

**ABSOLUTE RULE:** read this file at session start, update it at session end.

**Master plan:** `docs/programs/SP-PROGRAM-1.md` (committed 2026-08-06 from the user's
program brief — that file is the plan; deviation is a STOP).

---

## SP-PROGRAM-1 phase table

| Phase | Name | Status | Gate outcome |
|---|---|---|---|
| 0 | Consolidate and baseline | **DONE 2026-08-06** | Merge sign-off delegated (see Phase 0 entry) |
| 1 | SP-ENTRIES-R2 spec delta | **DONE 2026-08-06** | STOP report presented; spec stays provisional until user confirms (flip = user's act) |
| 2 | Deploy on wongworks.dev | not started | — |
| 3 | SP-UI-1 appearance pass | **pre-executed** (see contradiction C1) | — |
| 4 | Dogfood (floating) | not started | — |
| 5 | E1 walking skeleton | not started | — |
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

**Decisions proposed at the STOP (see report):** cloud-mode predicate for R6 (spec's
`environment=="cloud"` collides with `docker-compose.cloud.yml`'s deliberate
`ENVIRONMENT=local` — S1); E1 lifecycle gap (no email verification + no confirm UI ⇒
nothing reaches `confirmed` ⇒ Seam A commits nothing — needs a ruling); public page
via hand-rolled `HTMLResponse` (Jinja2 not installed; rule 8); entries idempotency
index scoped per-tenant (deliberate divergence from the global solve-job index — a
cross-tenant disclosure vector on an unauthenticated route otherwise).

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
