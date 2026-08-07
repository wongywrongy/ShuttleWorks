# Entries — Design

**Date:** 2026-08-06
**Status:** Provisional — research and design complete, decisions awaiting review (SP-ENTRIES-R1)
**Scope:** Public self-service registration for tournaments: the domain model, the module
question, the commit-to-roster seam, the public-surface and identity model, the lifecycle
state machine, the dual-mode boundary, and a phased delivery plan. **No code changes.**

> **Reviewer note.** This spec was produced in a single continuous run rather than at the
> four STOP gates the brief specifies (user-approved deviation). Q1, Q3 and Q7 are genuine
> one-way doors and are written to stay cheap to reverse; treat them as proposals, not
> settled architecture.

---

## 1. Context and scope

ShuttleWorks today has no intake capability. Operators put players into workspaces by hand:
Meet rosters as a flat player list inside the `tournaments.data` JSON blob
(`backend/database/models.py:128-129`), Bracket participants through a per-event picker
backed by `bracket_participants` (`models.py:456`). Every public surface that exists is
read-only — the four display capability routes in `backend/api/display.py`, pinned as
mutation-free by `tests/test_display_public.py:101`.

**Entries** adds public self-service registration: players sign up for events within a
tournament, weeks before event day, and an operator reviews and commits them to the roster.
It is simultaneously the first public *write* surface, the first capability with a genuine
cloud dependency, and the first that runs on calendar time rather than event time. This
spec fixes the decisions that are expensive to reverse and defers everything else.

---

## 2. The dual-mode boundary statement

> **Entries is a cloud-mode capability whose dependency ends at commit.** Collecting
> entries requires public ingress, a reachable cloud database, rate limiting and email —
> none of which a laptop running offline can provide, and none of which ShuttleWorks will
> pretend to provide. But the artifact Entries produces is an ordinary roster: once the
> operator commits, the entries service is no longer on any critical path. The workspace
> schedules, solves, runs and displays exactly as a hand-built one does, with the internet
> down all day. Event day never reads an entry row. A local-only workspace keeps CSV and
> manual roster entry and loses nothing except the convenience of collection; it is not a
> degraded workspace, it is the same workspace with a different intake. The single leak in
> this story is deliberate and named: the review desk is an operator surface served by the
> cloud API, so *reviewing and committing* entries needs connectivity. Committing is a
> pre-event activity measured in days, not an event-day operation, and the offline
> guarantee attaches to event day.

---

## 3. Decisions

### Q1 — Is Entries a module? **Decision: yes — a Tier-1 module, seeded only in cloud mode.**

**Decision.** Entries becomes a fourth Tier-1 module with a `workspace_modules` row, a
module-catalog entry and a `moduleContract.ts` declaration — but the row is **seeded only
when the deployment is in cloud mode**. `derive_modules` (`models.py:620`) and
`normalize_module_seed` (`models.py:650`) become mode-aware and simply omit `entries` in
local mode; `_resolve_modules` (`api/workspace_modules.py:61`) already lazy-seeds on read,
so a database moved from local to cloud gains the row on first read with no migration. A
`MODULE_REQUIRES_CLOUD` rejection in `patch_module` (`api/workspace_modules.py:96`) is
defence-in-depth for the reverse move.

**Rationale.** The brief's framing — "modules are things that produce/operate/project
*matches*, and Entries performs no verb on matches" — does not survive the audit. **Display
produces and operates nothing**; it is a read-only projection and is nonetheless a Tier-1
module. ADR 0001's actual Tier-1 criterion is "**user-facing, enableable**", and Tier-2 is
reserved for "**architectural, always-on**" infrastructure. Entries is emphatically not
always-on — most workspaces will never open public registration, and local-only workspaces
can never have it — so Tier-2 is a category error. CLAUDE.md already names the anatomy as
**intake → engine → emit**; Entries is the missing intake verb, not a foreign concept.

The mode-aware seed is what makes this honest. ADR 0005 retired `coming_soon` precisely so
that "**every module a workspace shows is actionable: enable it, it works**". A module
permanently displayed-but-unenableable in local mode would resurrect exactly the state
ADR 0005 deleted. Omitting the seed means a local workspace never sees Entries at all — the
catalog stays fully actionable and the dual-mode principle is annotated, not violated.

**Rejected — (b) a core capability like Sharing or Members.** The nearest in-tree analogue
is Operations (Tier-2, real nav, no flag), and it fits badly: Operations is always-on
because every workspace with matches needs to run them. Entries is genuinely optional per
workspace, which is exactly what an enable flag is for. Rejecting the module also throws
away the module contract's ability to declare the Entries→Meet/Bracket commit edge as a
named seam, which is the one edge in this design most worth pinning with a test.

**Rejected — (c) a separate product surface.** It would need its own copy of tenancy,
membership and the uniform-404 seam (`app/dependencies.py:95-140`), and would still have to
write into the workspace. Unjustifiable duplication for a solo maintainer.

**What would change my mind.** If the mode-aware seed turns out to require threading
settings into `models.py` in a way that pollutes the pure model layer, option (b) becomes
cheaper and I would switch.

### Q2 — Where do entry settings live? **Decision: a new Entries-owned `entry_events` table.**

**Decision.** Entries owns `entry_events`, workspace-scoped, holding the entry-facing
configuration: code, discipline, entry type (singles/doubles), cap, fee, open/close
timestamps. It carries an **optional** `bracket_event_id` pointing at
`bracket_events` (`models.py:414`) when the workspace is Bracket-kind. Meet-kind workspaces
map `entry_events.code` onto the rank vocabulary Meet already uses — `PlayerDTO.ranks[]`
carries `MS1`/`MD1`/`XD1` codes (`frontend/src/api/dto.ts:261`), which is Meet's de-facto
division concept.

**Rationale.** The audit's sharpest finding is that **Meet has no events table at all**.
Extending `bracket_events` would make Entries a Bracket-only capability. A shared events
concept is the architecturally attractive answer and is also a large migration across the
legacy `kind` split — the brief explicitly asks for the option with the *least* coupling to
that split, and a separate intake-owned table has none: it references Bracket when Bracket
exists and degrades to a code string when it doesn't.

**Rejected — extend `bracket_events`.** Excludes Meet entirely.
**Rejected — promote a shared events concept now.** Correct long-term, wrong now: it is an
ADR-level change to the `kind` split that should be driven by engine needs, not by intake.
`entry_events` is designed so that promotion later is a re-point, not a rewrite.

### Q3 — Commit seam semantics. **Decision: re-runnable, additive, idempotent.**

**Decision.** Commit is not one-shot. It materializes every `confirmed` entry that has no
`committed_player_id` yet, and is safe to run repeatedly. Entries may therefore reopen after
a commit, and a second commit picks up the late arrivals. Traceability is a pair of
back-references: `entries.committed_player_id` and a `sourceEntryId` on the roster player.

**Post-commit withdrawal, end to end:** entry → `withdrawn`; the roster is **not** mutated;
`build_signals` raises `COMMITTED_ENTRY_WITHDREW`; the operator resolves it in the Entries
desk by either removing the player from the roster or dismissing the flag. Software flags,
the operator decides.

**Rationale.** The one-shot hypothesis does not match how TDs actually work. BWF's own model
separates the *entry* deadline from the *withdrawal* deadline, accepting online withdrawals
right up to the draw and treating post-deadline ones as a penalty matter rather than an
impossibility. A one-shot commit would force operators back to manual roster editing for
every late entry, which is the workflow Entries exists to remove.

**Implementation constraint (load-bearing).** For Meet-kind workspaces the roster lives in
the versioned state blob, and SP-CLOUD-4 made every blob write go through
`If-Match`/`state_version` with a fail-closed 409 (`repositories/local.py:217-256`). The
commit path must fetch-modify-retry on conflict rather than assuming it owns the blob.

**Rejected — one-shot commit with a locked entries list.** Simpler and wrong; see above.
**Rejected — live sync of entries into the roster.** Destroys the operator's review step and
would let a public actor mutate solver inputs directly.

### Q4 — Identity and public surface. **Decision: public slug for the page, capability token per entrant.**

**Decision.** Two distinct addresses, because they have two distinct security properties:

- **A public workspace slug** (`/e/{slug}`) addresses the *entry page*: what events exist,
  what they cost, whether they are open, and the submit form. It is discoverable and
  shareable by design. It exposes **no personal data** — no entrant list, no counts that
  identify anyone.
- **A per-entrant capability token** addresses *a specific entry* ("manage my entries").
  Same shape as the display token (`secrets.token_urlsafe(24)`, `api/display.py:49`), same
  uniform-404 on miss (`api/display.py:90-103`), and the raw tournament UUID never becomes a
  public key.

Identity is verified email plus that token — **no entrant accounts in v1**. `contact_email`
is retained as the future join key for a cross-tournament registry (deferred).

**Rationale.** The hypothesis proposes extending the display-token pattern, and the audit
shows exactly where that breaks: an entry page *wants* to be discoverable, which a
capability URL is specifically designed to prevent. Splitting the two addresses keeps the
capability pattern intact for the thing that actually needs it (an individual's PII) and
stops it being misapplied to a poster URL.

start.gg validates the no-accounts choice from the other direction: it lets organizers add
players by name + email with the account created later, and models a global `User`/`Player`
separately from a point-in-time `Participant`/`Entrant`. That is precisely our
entry-now/registry-later split.

**Anti-abuse stack** — most of it already exists (SP-SEC-1 Phase 3):
- *Edge:* a new `limit_req` zone alongside `sw_auth` and `sw_display`
  (`frontend/nginx.conf:47,52`), keyed on `CF-Connecting-IP` like the others.
- *Edge:* Cloudflare Turnstile on the form, **validated server-side** — a token that is only
  rendered client-side stops nothing, since bots post directly to the endpoint.
- *App:* double opt-in email verification through the existing seam
  (`services/email.py:59`); an entry is not reviewable until the address is confirmed.
- *App:* a DB-backed per-IP throttle reusing the `AuthThrottle` shape
  (`services/auth.py:387-471`) — no Redis, consistent with the offline-capable posture.
- *App:* the global 4 MB body cap already applies (`app/body_limit.py`).

**Two hard prerequisites, both outside the repo or outside this feature:**
1. **Cloudflare Access currently fronts the entire app**, with only `/display/*` excluded
   (`docs/programs/SEC_PROGRESS.md:66`). A public entry form is *unreachable* until
   `/entries/*` and the public SPA route get the same exclusion. This belongs in
   `docs/how-to/install-selfhost.md`, exactly as the display exclusion did.
2. **`tests/test_auth_surface.py` enumerates every session-free route with a stated reason**,
   and today contains **zero public writes to workspace data**. Adding Entries is a
   deliberate, reviewable edit to that allowlist — which is the point of the gate.

### Q5 — Lifecycle state machine. **Decision: see §6.** Dedup uses the client-supplied key.

Two dedup precedents exist. The solve rail takes a **client-supplied `Idempotency-Key`
header**, never a server-derived hash (`api/solve_jobs.py:102`, `services/solve_jobs.py:165`,
unique index `uq_solve_jobs_idempotency_key`); the command rail uses a client-generated UUID
`id` (`api/commands.py:52`). **Entries uses the solve-rail pattern** — an
`Idempotency-Key` header on submit — because the public client is a form that may be
re-posted on a flaky connection, and Stripe semantics ("return the original, don't create a
second") are exactly right.

That guards retries. A *separate* natural-key unique index on
`(entry_event_id, lower(contact_email))` guards the different failure of the same human
submitting twice from two devices. Both are needed; conflating them is the trap
`models.py:785-787` already warns about for solve jobs.

### Q6 — Doubles/pairs v1. **Decision: nominating entrant + email confirmation, operator-resolved conflicts.**

**In scope.** One player enters the pair and names the partner by email. The partner
receives a confirmation email carrying their own capability link; until they accept, the
entry sits `pending` with reason `awaiting_partner`. On acceptance the entry becomes
eligible for `confirmed`. If a named partner is already paired in the same event, **both**
entries are flagged and an operator resolves them — never auto-resolved.

**Rationale.** This is the incumbent's weakest area and the highest-value thing to get
right. BWF's system rejects "partner required" entries outright for international non-para
events, pushing the coordination problem back onto players with no tooling. Pickleball
Brackets does the confirmation flow well (search for an account, else name + email) but
then **auto-parks unpartnered teams on the waitlist** — conflating a partner problem with a
capacity problem. We keep them separate: unpartnered is `pending`, over-cap is `waitlisted`.

**Deferred:** partner-search pool ("looking for a partner" board), partner-initiated splits,
partner swap after confirmation, and duplicate-identity merging (a known unfixable pain in
the incumbent — Badminton Australia cannot merge duplicate accounts at all).

### Q7 — Dual-mode boundary. **Decision: see §2, quotable verbatim.**

The leak is stated rather than hidden: the review desk needs connectivity. Two options were
considered for closing it — serving the desk from a local instance over the tailnet, or
exporting entries to a file the local instance imports. **Neither is recommended for v1.**
Committing happens days before the event, when connectivity is a normal assumption; building
an offline path for it would double the seam count to remove an inconvenience nobody has
reported. If it ever matters, the export path is the cheaper of the two and does not
invalidate anything here.

### Q8 — Payments deferral line. **Decision: confirmed, with the integration boundary fixed now.**

**v1 records:** `fee_cents` on `entry_events`, and `paid_at` + `payment_note` on `entries`.
The operator marks paid/unpaid manually. `awaiting_payment` exists as a pending-reason from
day one.

**The later Stripe shape, fixed now so nothing is redone:** a Checkout Session is created at
submit; the entry carries `awaiting_payment`; the `checkout.session.completed` webhook clears
**exactly that one pending-reason** and nothing else. Webhook idempotency is a unique index
on the Stripe event id — Stripe re-delivers the same event and retries for up to three days,
so the handler must be replay-safe, mirroring `uq_solve_jobs_idempotency_key`. Because the
webhook and the browser redirect can arrive in either order, the state transition must be
atomic and order-independent.

Crucially, payment clears a *flag*; it never confirms an entry. Confirmation stays an
operator act — a paid entry over cap is still `waitlisted`.

### Q9 — Signals, phases, attention codes. **Decision: extend `_derive_phase`; six new codes.**

**A phase concept already exists** and the brief assumes it does not. `_derive_phase`
(`api/workspace_signals.py:297`) returns `setup | ready | live | complete`. Entries extends
it at the front, giving a seven-value vocabulary:

`announced → entries_open → entries_review → setup → ready → live → complete`

Derivation stays backend-side in `build_signals` (`workspace_signals.py:355`), consistent
with the established convention. SP-UI-1 consumes this vocabulary as a contract, so it is
deliberately minimal and additive — the four existing values keep their meanings exactly.

**Attention codes** (trigger conditions):

| Code | Triggers when |
|---|---|
| `ENTRIES_CLOSING_SOON` | entries open and close date within N days (N configurable, default 3) |
| `UNRESOLVED_PAIRS` | ≥1 entry with `awaiting_partner` past the close date, or any pair conflict |
| `AT_CAP_WITH_WAITLIST` | an event is at cap with ≥1 `waitlisted` entry |
| `ENTRIES_NOT_COMMITTED` | entries closed and ≥1 `confirmed` entry has no `committed_player_id` |
| `COMMITTED_ENTRY_WITHDREW` | an entry withdrew after being committed |
| `UNPAID_ENTRIES` | ≥1 `confirmed` entry with `awaiting_payment` past the close date |

**Adjacent finding worth acting on:** attention codes are currently bare string literals at
construction sites (`workspace_signals.py:368-380`) and are mirrored by hand in
`products/hub/nextAction.ts:7-11`. Six new codes doubles the count. Promoting them to one
shared constant is a small, in-scope cleanup — log it in the debt log if it is not taken.

### Q10 — GDPR delta. **Decision: does not block E1; blocks public launch; merges into the existing debt.**

Entrant PII genuinely widens the existing Size-L pre-launch debt (`docs/audits/debt-log.md:481`)
rather than creating a parallel workstream — but it widens it in a specific, awkward way:
**entrants have no account**, so every mechanism that would eventually serve users
(delete my account, export my data) does not reach them.

- **Lawful basis:** contract performance for the entry itself (name, email, event, partner);
  explicit consent for anything optional. Anything resembling health or accessibility data
  is a GDPR special category and should be out of scope for v1 entirely.
- **Deletion/export path:** the entrant capability link **is** the self-service path — it
  must offer withdraw-and-erase, not merely withdraw. This is the single most important
  GDPR design decision here and it is nearly free if built in E2, expensive if retrofitted.
- **Retention:** a retention field on `entry_events` plus a documented default (anonymize
  entrant PII N days after the event, keeping the aggregate row). Six or twelve months is
  the common convention.
- **Minors:** `SECURITY.md:26` already flags minors' data. Youth entries plausibly need
  guardian consent (under-16 by default under GDPR, lower in some member states). **This is
  unresolved and is called out in §9 as an open question** — it is a product/legal call, not
  a spec-time one.

**Verdict:** E1 is safe as a private slice against the operator's own club. Public launch is
blocked on the erasure path and the retention default, both of which land in E5.

---

## 4. Data model sketch

```
entry_events
  tournament_id      FK → tournaments, part of composite PK
  id                 uuid
  code               text        -- 'MS','XD1'; maps to Meet PlayerDTO.ranks[] or a bracket event
  discipline         text
  entry_type         text        -- 'singles' | 'doubles'
  bracket_event_id   uuid NULL   -- FK → bracket_events when kind='bracket'
  cap                int NULL
  fee_cents          int NULL
  opens_at           timestamptz NULL
  closes_at          timestamptz NULL
  retention_days     int NULL
  created_at / updated_at

entries
  tournament_id      FK, part of composite PK
  id                 uuid
  entry_event_id     FK → entry_events
  state              text        -- see §6
  pending_reasons    json        -- array of reason codes
  contact_name       text
  contact_email      text        -- normalized; future registry join key
  email_verified_at  timestamptz NULL
  partner_entry_id   uuid NULL   -- the paired entry, doubles only
  partner_email      text NULL   -- named before the partner acts
  manage_token_hash  text        -- capability token, hashed like auth_sessions
  idempotency_key    text NULL   -- unique; solve-rail semantics
  fee_cents          int NULL    -- snapshot at submit
  paid_at            timestamptz NULL
  payment_note       text NULL
  committed_player_id text NULL  -- traceability into the roster
  submitted_at / updated_at / withdrawn_at

  UNIQUE (entry_event_id, lower(contact_email))     -- human dedup
  UNIQUE (idempotency_key)                          -- retry dedup, NULLs exempt

entry_pages
  tournament_id      PK, FK → tournaments
  slug               text UNIQUE  -- public, discoverable
  is_open            bool
  intro_text         text NULL
```

Notes: `manage_token_hash` is stored hashed, following `auth_sessions.token_hash`
(`models.py:962-993`) rather than the display token's plaintext storage — entrant tokens
are numerous and long-lived, so the stronger precedent wins. All tables cascade from
`tournaments` like `display_tokens` and `tournament_members` do.

---

## 5. Seams (behavioral contracts)

### Seam A — the commit seam: Entries → Meet | Bracket

- **Input:** a workspace id, an operator with ≥ operator role, an optional event filter.
- **Output:** for every `confirmed` entry with no `committed_player_id`, a roster player
  (Meet: a `PlayerDTO` in the state blob with `ranks[]` derived from `entry_events.code`;
  Bracket: a `bracket_participants` row under the mapped `bracket_event_id`), plus the
  back-reference written on both sides.
- **Invariants:** idempotent (re-running commits nothing new); never mutates or deletes an
  existing roster player; never auto-removes on withdrawal; total commits ≤ total confirmed.
- **Failure modes:** a `state_version` conflict on the Meet blob → refetch and retry, never
  blind overwrite; an unmappable `entry_events.code` → the entry is skipped and reported,
  not guessed at; partial success is reported per-entry, not rolled back wholesale.

### Seam B — the public-surface seam: entrant → Entries

- **Input:** a public slug, an event id, entrant fields, a Turnstile token, an
  `Idempotency-Key`.
- **Output:** an entry in `unverified`, plus a verification email.
- **Invariants:** never reveals whether an email is already entered (uniform response);
  never returns another entrant's data; the raw tournament UUID never appears; a replayed
  `Idempotency-Key` returns the original entry rather than creating a second.
- **Failure modes:** cap reached → accepted as `waitlisted`, not rejected; event closed →
  uniform 404-shaped refusal; Turnstile invalid → refused server-side; rate limit → 429 from
  the edge before the app is reached.

---

## 6. Lifecycle state machine

```
                    ┌──────────────┐
   submit ─────────►│  unverified  │
                    └──────┬───────┘
              email confirmed (auto)
                           ▼
                    ┌──────────────┐
                    │   pending    │◄──── reasons: awaiting_partner,
                    └──┬────┬───┬──┘              awaiting_payment,
                       │    │   │                 over_cap, needs_review
      operator confirm │    │   │ operator reject
                       ▼    │   ▼
              ┌────────────┐│┌──────────┐
              │ confirmed  │││ rejected │
              └────────────┘│└──────────┘
                            │ auto at cap
                            ▼
                     ┌─────────────┐
                     │ waitlisted  │──── operator promote ──► pending/confirmed
                     └─────────────┘

   withdrawn: reachable from unverified, pending, waitlisted, confirmed (entrant or operator)
```

| Transition | Actor |
|---|---|
| submit → `unverified` | entrant (public) |
| `unverified` → `pending` | automatic, on email verification |
| → `waitlisted` | automatic, when the event is at cap |
| pair-conflict flag | automatic |
| `pending` → `confirmed` | **operator** |
| `pending` → `rejected` | **operator** |
| `waitlisted` → promoted | **operator** |
| mark paid | **operator** (later: Stripe webhook clears the reason only) |
| any live state → `withdrawn` | entrant (via capability link) or operator |

Nothing consequential is automatic. Auto-waitlisting is a *queue position*, not a decision,
and is always operator-reversible — matching RunSignup, whose waitlist promotion sends an
*invitation with a claim window* rather than silently registering someone.

---

## 7. Phased delivery

| Slice | Contents | Why here |
|---|---|---|
| **E1 — walking skeleton** | Cloud-only. One `entry_event`, singles only, no payment, no partner, no cap. Public slug page → submit → entry row → operator desk list → commit to roster. Access exclusion + allowlist entry + rate-limit zone + Turnstile. | **Tests the riskiest assumption first: that a public write can be exposed safely at all**, and that the commit seam survives the `If-Match` blob contract. Everything else is product surface on top of a proven pipe. |
| **E2 — lifecycle** | Email verification, capability "manage my entry" link **including withdraw-and-erase**, caps + waitlist, pending-reasons, operator confirm/reject/promote. | Erasure is nearly free here and expensive later (Q10). |
| **E3 — doubles** | Partner nomination, confirmation email, pair conflicts as operator-resolved flags. | The incumbent's weakest area; needs E2's email + token machinery. |
| **E4 — signals** | Phase extension, six attention codes, Hub next-action and Overview integration. | Needs real entry states to derive from. |
| **E5 — money & compliance** | Fee display, manual paid/unpaid, retention default + anonymization job. | Unblocks public launch. |
| *post-v1* | Stripe Checkout against the Q8 boundary. | — |

---

## 8. Non-goals

Payments processing (v1 records and displays only) · partner-search pool · entrant accounts
· cross-tournament player registry · Entries for local-only workspaces · seeding automation
from entry data · duplicate-identity merging · refund processing · waitlist lotteries.

---

## 9. Open questions for implementing agents

1. **All styling and visual design** — the public entry page is the first ShuttleWorks
   surface a non-operator ever sees; it is not an operator console and should not inherit
   the dense control-plane grammar uncritically.
2. **Minors / guardian consent** — whether v1 collects date of birth at all, and what
   happens for under-16 entrants. Product/legal call, blocks E5 not E1.
3. Whether `entry_events.code` → Meet `ranks[]` is the right mapping in practice, or whether
   Meet needs a thin events concept sooner than Q2 assumes.
4. Whether the Entries desk is its own nav section or a tab within an existing one.
5. Exact `ENTRIES_CLOSING_SOON` threshold and whether it is per-workspace configurable.
6. Whether to promote attention codes to a shared constant now (see Q9) or log it as debt.

---

## 10. Discrepancy log

Corrections to the task brief and the prior-thinking hypothesis, from the Phase 0 audit.
Future sessions should inherit these.

| # | Claim as stated | What the tree actually shows |
|---|---|---|
| 1 | "Operations was added as a module — the most recent precedent for adding one" | **False.** `MODULE_IDS = ("meet","bracket","display")` (`models.py:606`). Operations has no `workspace_modules` row; it is Tier-2 always-on (`ArchModuleId = ModuleId \| 'operations'`, `moduleContract.ts:62`; ADR 0001). The real precedent for adding a module is the `coming_soon → available` promotion migrations. |
| 2 | Phase 0 asks "whether any phase-like concept already exists" | It **does** — `_derive_phase` (`workspace_signals.py:297`), `setup\|ready\|live\|complete`. Q9 extends it rather than inventing a vocabulary. |
| 3 | Hypothesis: "players enter *events within* a tournament" has a landing spot | True for Bracket (`bracket_events`, `models.py:414`), **false for Meet** — no events table; flat roster in the `tournaments.data` blob (`models.py:128-129`). This is why Q2 introduces `entry_events`. |
| 4 | Hypothesis: entry management "extends the existing display-token pattern" | Partially. Display routes are **GET-only by pinned invariant** (`tests/test_display_public.py:101`) and `tests/test_auth_surface.py` contains **zero public writes to workspace data**. A public POST is a new pattern requiring a deliberate allowlist edit, not a reuse. |
| 5 | Brief implies anti-abuse posture is an open question | Largely shipped in SP-SEC-1 Phase 3: nginx `limit_req` zones (`nginx.conf:47,52`), DB-backed throttles (`services/auth.py:387-471`), body cap (`app/body_limit.py`), trusted-proxy client IP (`app/client_ip.py`). The real blocker is #6. |
| 6 | Not mentioned in the brief at all | **Cloudflare Access currently fronts the entire application**, with only `/display/*` excluded (`SEC_PROGRESS.md:66`, decided 2026-08-05). Entries v1 has a hard prerequisite that lives in the Cloudflare dashboard, not the repo. |
| 7 | Debt-log GDPR entry cites `owner_email` "mirrored into Supabase" | Stale — the Supabase mirror was removed entirely (ADR 0012, SP-CLOUD-3). The `owner_email` column itself still exists (`models.py:108`); only the mirror half of the concern died. |
| 8 | Brief: "Display... owns the public capability-token routes" | Correct, and worth noting revocation is **rotation** — there is no delete route (`api/display.py:71`). An entrant-token design should decide deliberately whether it copies that. |

---

## See also

- ADR 0001 — four-module split (the Tier-1/Tier-2 criterion Q1 turns on)
- ADR 0005 — `coming_soon` elimination (the actionability principle Q1 preserves)
- `docs/programs/ENTRIES_PROGRESS.md` — the SP-ENTRIES ledger
- `docs/audits/debt-log.md:481` — the GDPR pre-launch item Q10 extends
