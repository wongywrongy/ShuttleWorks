# SP-E1-1 — Develop the E1 walking skeleton, locally (replaces SP-VERIFY-1)

**Type:** Implementation. Executes **SP-PROGRAM-1 Phase 5 (E1)** ahead of Phase 2, under a user-authorized program amendment (below). **Deliverable:** the public-write pipe working end-to-end on a local cloud-mode stack, with dev servers left running so the user can click through the public entry page.

---

## PROGRAM AMENDMENT (record verbatim in the ledger before any code)

> **AMENDMENT A1 (user-authorized):** Phase 5 development proceeds locally before Phase 2. The original ordering protected against *public exposure* on an unvalidated deployment; development does not expose anything. The Phase 5 **[USER SIGN-OFF] public-exposure security gate is preserved in full** and now sits after Phase 2 completes: no tunnel ingress, DNS record, or Access change for entries may be made in this or any session until that gate is passed. Phase 2 remains blocked on user-provided infrastructure access; Phase 3's open item (attention-code shared constant) remains Phase 3 scope.

---

## ABSOLUTE RULES

1. **SP-PROGRAM-1's invariants (I1–I8), rulings (R1–R9), and session protocol apply in full.** The amended Entries spec (`docs/superpowers/specs/2026-08-06-entries-design.md`, including Q11/Q12/§2A from the R2 pass) is the source of truth for every contract in this prompt. Where this prompt and the spec disagree, STOP and report — do not pick one silently.
2. **Scope is E1 exactly:** cloud-only · one entry_event per demo · singles only · no payment, no partner flow, no caps/waitlist, no email verification, no manage-entry link. Pipe: public slug page → submit → entry row → operator desk list → commit to roster. Anything from E2+ that "would be easy while you're in there" is a scope violation.
3. **No public exposure.** Nothing in this session touches the Cloudflare dashboard, DNS, tunnel config, or Access. nginx/compose changes are written and validated locally only.
4. **TDD with negative controls (CODE_HEALTH 3b) on every security-relevant behavior:** Turnstile rejection, throttle, idempotency replay, uniform-404, cross-tenant probe, operator-only desk/commit routes, local-mode module absence. A safety test without its negative control is not done.
5. **Characterization tests before touching load-bearing code** — specifically the Meet state-blob write path the commit seam enters (`If-Match`/`state_version`, fail-closed 409). Golden-master the current behavior first.
6. **Migrations are additive; the full Phase-1-amended schema is created now** (all E1-relevant tables/columns from spec §4 as amended, including regulations/waiver fields, R7 shape with contact-vs-player fields kept distinct, entrant-list opt-out flag) — but only the E1 subset is *used*. This avoids migration churn in E2/E3.
7. **Branch `dev/prog1-p5-e1`; commit per task; docs (including install/compose docs for any compose change) update in the same commit.** Ledger updated at session end with the amendment, tasks, commits, and gate results.
8. **No new runtime dependencies.** The public page is FastAPI-served templates by design (R8 defers the framework decision to Phase 6, against this real page).

---

## PHASE A — Audit and plan (STOP at end)

1. Read: the ledger → the amended spec end-to-end (Q1–Q12, §2A, §4, §5 seams, §6 state machine, §7) → the program document → `git log --oneline -20`. Confirm gates are green on main at the recorded baseline (1385 frontend / 1018 backend); re-run them.
2. Map the landing zones with file paths: where module ids/seeds live (`MODULE_IDS`, `derive_modules`, `normalize_module_seed`, `_resolve_modules`), the module PATCH rules, the auth-surface test, the uniform-404 dependency, the display-token issuance (the hashing precedent is `auth_sessions`, not display's plaintext), the email seam (not used in E1 — confirm and say so), nginx zones, the cloud compose stack, `AuthThrottle`, body cap, client-IP handling, the Meet roster blob write path, `bracket_participants` write path, `build_signals`.
3. Decide and state: which compose stack is the local cloud-mode dev environment; how Turnstile runs locally (**Cloudflare's documented always-pass/always-fail test keypairs via env config** — the server-side validation code path must be real; real keys are Phase 2); where the FastAPI templates for the public page live.
4. Produce a task list with test-first ordering.
**STOP.** Report the map, the plan, any spec/tree contradictions. Wait for go-ahead.

## PHASE B — Backend: module, schema, public write

1. **Module (R1/R6):** add `entries` to the module vocabulary; mode-aware seed (cloud seeds it, local omits it); read-path filter for inherited rows in local mode (R6 mechanism from Q1 — all three call sites); `MODULE_REQUIRES_CLOUD` rejection on PATCH in local mode. Tests both modes; negative control: a local-mode workspace with a smuggled row must not render the module.
2. **Migrations:** spec §4 as amended (rule 6 above). Alembic upgrade+downgrade both tested.
3. **Public routes** (each one an explicit, individually justified auth-surface allowlist edit):
   - `GET` slug page data: events, open/close state, fee display, regulations text + version, entrant names list (I6: names + events only, opt-outs honored — field exists even though E1 has no UI for it).
   - `POST` submit: full I5 stack — server-side Turnstile validation, DB-backed per-IP throttle (AuthThrottle shape), global body cap applies, client `Idempotency-Key` with solve-rail replay semantics (replay returns the original), R7 soft-duplicate flag (no hard email index), regulations acknowledgment required + `regulations_accepted_at` + accepted version recorded, uniform responses that never reveal whether an email already entered, uniform-404 shape for unknown/closed slugs.
   - Entrant capability token: **generated and stored hashed** (auth_sessions precedent) even though E1 has no manage page — the token goes into the success response for E2 to use later. Cheap now, churn later.
4. **Operator routes** (session + role guarded, uniform-404 tenancy): desk list (entries for a workspace, states + flags + remarks), commit endpoint implementing **Seam A verbatim from spec §5**: re-runnable, additive, idempotent; Meet path via fetch-modify-retry on `state_version` (characterization tests from rule 5 first); Bracket path via `bracket_participants` under the mapped event; per-entry partial success reporting; unmappable codes skipped-and-reported, never guessed.
5. **nginx `sw_entries` zone + compose:** written, `docker compose config`-validated, exercised as far as the local stack allows; documented in the install docs in the same commit with an explicit "activated at Phase 2 deployment" note.

## PHASE C — The public page (FastAPI-served, deliberately minimal, mobile-usable)

Slug page: tournament name/date, events with open/closed state, fee display, regulations block, entrant names list, entry form (name, email, event, remarks free-text, acknowledgment checkbox gating submit), Turnstile widget (test keys), success state showing the entry was received. Server-rendered, no build step, no SPA. Usable at 390px width — that is the bar; pretty is Phase 6's job. Base URLs through the I1 config seam from the first line (the CI grep guard itself is Phase 2 scope; the seam is not).

## PHASE D — Operator desk (minimal, in the operator SPA)

Module presence drives nav (the module system should give this for free — if it doesn't, that's a finding, STOP). Desk surface: entries list with state, flags, remarks; a commit action with a result summary (committed / skipped-with-reason). Frontend tests for the list and the commit result rendering. Nothing else — no confirm/reject/promote UI (E2).

## PHASE E — Local end-to-end demo (the user's payoff; leave it running)

1. Bring up the local **cloud-mode** stack on a fresh disposable database (name which; never a real-data DB).
2. Seed through real paths: an org + operator, a workspace, one entry_event, regulations text with `waiver_required` on.
3. Walk the pipe and record it: submit an entry from a 390px viewport (screenshot) → desk shows it (screenshot) → commit → player on the roster with `source_entry_id` and the remark carried through (screenshot) → **submit a replay with the same Idempotency-Key and show no second entry** → submit a second entry with the same email, different player name, and show the soft flag (R7 demonstrated).
4. Dual-mode negative: bring up the local-mode stack briefly and show the same workspace concept has no Entries module anywhere (I3/R6 demonstrated).
5. Run all gates. Leave the cloud-mode stack and dev servers running; report every URL (operator app, public slug page) so the user can click through immediately.

## NON-GOALS

Everything E2+ (verification emails, manage/withdraw page, caps, waitlist, confirm/reject/promote, doubles, signals/phases, acceptance lists, fees beyond display, retention) · deployment, tunnel, DNS, Access, real Turnstile keys · the `play.*` app and the framework decision · marketing · attention-code constant (Phase 3) · any styling beyond mobile-usable.

## DONE CONDITIONS

- [ ] Amendment A1 recorded in the ledger before the first code commit
- [ ] Migration files exist; auth-surface test contains the new justified entries — **if either is absent, the task did not complete**
- [ ] Every rule-4 negative control exists and passes; Seam A idempotency proven by test AND by the Phase E replay demo
- [ ] All gates green; test counts strictly above 1385/1018
- [ ] Phase E walkthrough completed with screenshots; servers left running; URLs reported
- [ ] No tunnel/DNS/Access/dashboard changes of any kind (assert in the ledger)
- [ ] Ledger session entry complete: tasks, commits, gate results, findings for Phase 2/3/6

---

## PHASE A STOP RULINGS (user go-ahead 2026-08-06 — encode, do not relitigate)

- **D1 — E1 lifecycle:** E1 submissions land directly in **`pending`** (the `unverified` state exists in the schema/state vocabulary but is entered only once E2's email verification ships). E1 adds one minimal operator **confirm** action (`pending → confirmed`: backend route + a plain desk button). Phase D's "no confirm/reject/promote UI" is read as "no full lifecycle-management UI"; the bare confirm is required for Seam A (commits only `confirmed`) to be demonstrable. Reject/promote stay E2.
- **D2 — Cloud-mode predicate:** the R6/Q1 `CLOUD_ONLY_MODULES` seed-and-filter keys on **`settings.auth_mode == "cloud"`**, NOT `settings.environment` (the spec's stated mechanism collides with `docker-compose.cloud.yml`'s deliberate `ENVIRONMENT=local`). Rationale: Entries is meaningless without real operator accounts; the smoke stack and selfhost both run `AUTH_MODE=cloud`; plain local stacks do not; the auth-surface fixture (`AUTH_MODE=cloud, ENVIRONMENT=local`) sees the module. Spec Q1(R2) gets a short amendment paragraph recording this.
- **D3 — Public page rendering:** **no Jinja2, no template engine** — a FastAPI route returning `HTMLResponse` built from Python f-strings with `html.escape()` on every interpolated value. No new runtime dependency; nothing extra to COPY into the Docker image. The page is throwaway by design — Phase 6 (R8) decides the real `play.*` framework against it.
- **D4 — Idempotency scoping:** the entries idempotency index is **`UNIQUE (tournament_id, idempotency_key)`** with a tenant-scoped lookup — a deliberate divergence from the global solve-rail index, because on an unauthenticated route a global lookup is a cross-tenant disclosure vector. Spec §4 gets a short amendment recording this.
