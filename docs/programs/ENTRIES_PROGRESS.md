# SP-ENTRIES / SP-PROGRAM-1 — Public platform program ledger

**ABSOLUTE RULE:** read this file at session start, update it at session end.

**Master plan:** `docs/programs/SP-PROGRAM-1.md` (committed 2026-08-06 from the user's
program brief — that file is the plan; deviation is a STOP).

---

## SP-PROGRAM-1 phase table

| Phase | Name | Status | Gate outcome |
|---|---|---|---|
| 0 | Consolidate and baseline | **DONE 2026-08-06** | Merge sign-off delegated (see Phase 0 entry) |
| 1 | SP-ENTRIES-R2 spec delta | **next** | — |
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
