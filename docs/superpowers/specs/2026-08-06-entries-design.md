# Entries — Design

**Date:** 2026-08-06
**Status:** Provisional — research and design complete, decisions awaiting review (SP-ENTRIES-R1)
**Amended by SP-ENTRIES-R2 (SP-PROGRAM-1 Phase 1), 2026-08-06** — standing rulings R5–R7
folded in as decision sections, the three-surface architecture added (§2A), Q4/Q5/§4/§7
amended, open question #6 resolved, R6 feasibility verified against the tree and written
into Q1.
**Scope:** Public self-service registration for tournaments: the domain model, the module
question, the commit-to-roster seam, the public-surface and identity model, the lifecycle
state machine, the dual-mode boundary, and a phased delivery plan. **No code changes.**

> **Reviewer note.** This spec was produced in a single continuous run rather than at the
> four STOP gates the brief specifies (user-approved deviation). Q1, Q3 and Q7 are genuine
> one-way doors and are written to stay cheap to reverse; treat them as proposals, not
> settled architecture.

> **Amendment note (R2).** New material is numbered so nothing renumbers: the surface
> architecture lands as **§2A** (between the dual-mode statement it depends on and the
> decisions that consume it), and the two new decision sections are **Q11** (regulations &
> waiver, from ruling R5) and **Q12** (contact/player model, from ruling R7). Q12
> **supersedes the second half of Q5** — read them together. The rulings encoded here were
> decided by the user in `docs/programs/SP-PROGRAM-1.md` (STANDING RULINGS R1–R9); they are
> recorded, not reopened.

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

**Why this is not a clone of the incumbent.** Tournament Software collects entries into a
list a human then arranges. Here the entry *is* solver input: what an entrant tells us —
which events, when they cannot play, what they need noted — flows through the commit seam
into the same `ScheduleConfig` the CP-SAT engine reads
(`backend/services/scheduling/params.py`), so intake and scheduling are one pipeline rather
than two products joined by a spreadsheet. That is the structural differentiator, and it is
why the entry form collects availability-shaped data (the `remarks` field, §4) that a pure
registration product would have no use for.

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

## 2A. Surface architecture — three hostnames, two frontends

Entries forces a question the product has so far avoided: ShuttleWorks now has an audience
that is not an operator. The answer is a **hostname split**, decided at program level and
recorded here because every subsequent decision in §3 assumes it.

### The three surfaces

| Surface | Hostname (prototype) | Audience | Frontend | Protection |
|---|---|---|---|---|
| **Apex / marketing** | `wongworks.dev` | anyone | static site (Cloudflare Pages), deferred | none |
| **Operator console + API** | `app.wongworks.dev` | operators | the existing React SPA, desktop-only | **Cloudflare Access over the whole hostname** |
| **Public tournament site** | `play.wongworks.dev` | entrants, players, spectators | a distinct **mobile-first** frontend | no Access; WAF + rate limits + the §Q4 anti-abuse stack |

**Access is scoped by hostname, never by path.** Today Access fronts the entire application
with a single path exclusion for `/display/*` (`docs/programs/SEC_PROGRESS.md:66`) — a
mechanism that works exactly once and then rots: every new public route becomes another
exclusion to remember, and a forgotten one fails *closed* (invisible outage) or, worse, a
too-broad one fails open. Putting every public surface on `play.*` means the policy is
"`app.*` requires Access; `play.*` does not", and stays that sentence forever. The existing
`/display/*` exclusion is therefore **scheduled for retirement**: Display's capability links
migrate under `play.*`, and the exclusion is deleted once they have (program Phase 11).

### Two frontends, one design system, one backend

`play.*` is a **separate frontend application**, not a route inside the SPA:

- It imports **design tokens from `packages/design-system`** — the two surfaces are visibly
  one product — but it does **not** inherit the operator console's dense control-plane
  grammar (open question §9.1 is about the visual half of this).
- It calls **the same FastAPI backend** as the console. There is no second API, no BFF, and
  no duplicated tenancy/uniform-404 seam (the reason Q1 rejected a separate product surface
  applies here too, and is not reopened — this is a *presentation* split, not a service one).
- It is **mobile-first and stays mobile-first** (program invariant I7); the operator console
  stays desktop-only and is not made responsive by this program.
- The framework is deliberately **not chosen here** (ruling R8): the decision is made in
  program Phase 6 against the real E1 page, judged on mobile weight, SSR/unfurl quality,
  design-token reuse, and solo maintainability. E1 ships its page from **FastAPI templates**
  precisely so the framework decision has evidence rather than a guess behind it.

### Spec invariant — domain is configuration, never code (program I1)

> **Every absolute URL the product emits — verification emails, entrant capability links,
> share links, QR targets, unfurl metadata — is composed from a base-URL setting, never a
> literal. Internal navigation is relative. A CI grep guard fails the build on a hardcoded
> hostname outside config, docs and tests.**

This is cheap to hold now and expensive to retrofit, and the tree is currently on the right
side of it by accident rather than by design: the backend generates **no absolute URLs at
all** today — the invite route deliberately returns a *relative* path and lets the frontend
absolutize it (`backend/api/invites.py:75`), and `app/config.py` has no base-URL setting to
extend. Entries changes that: a verification email must carry a clickable absolute link, and
it must point at `play.*` while the console lives on `app.*`. Two settings (`APP_BASE_URL`,
`PUBLIC_BASE_URL`, names finalized against config conventions in program Phase 2) are
therefore introduced **before** the first email is sent, not after.

### Prototype domain and cutover (ruling R9)

`wongworks.dev` is a **prototype** domain, not the product's home. The cutover to the
production domain is a Phase 11 checklist, planned now so nothing is built that resists it:

1. New zone + DNS; tunnel ingress and Access policies re-declared on the new hostnames.
2. Turnstile re-keyed (site keys are domain-bound).
3. SPF/DKIM/DMARC re-established on the new sending domain.
4. **The two base-URL env vars flip. No code changes.** That is the I1 invariant's final
   exam — rehearsed before it is executed.
5. Cloudflare redirect rules from the `wongworks.dev` hostnames retained for **at least the
   entry-retention window** (§Q10), because printed QR codes and old emails outlive domains.
6. **Old capability tokens keep resolving** — the token is the credential, the hostname is
   only where it is presented. Nothing in the token design may bind to a hostname.

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
cheaper and I would switch. **R2 update: verified against the tree — it does not.** See the
mechanism below; the model layer stays settings-free.

#### Q1 (R2) — the cloud→local read-path filter, verified (ruling R6)

**The problem.** The seed half is easy: in local mode, never create an `entries` row. But a
workspace can *arrive* in local mode already carrying one — restored from a cloud backup, or
a database file copied from the cloud deployment to a laptop. Ruling R6 says such a row is
**filtered at read time**, mirroring the seed logic, so local mode never renders a module it
cannot operate (which is the ADR 0005 actionability principle Q1 exists to preserve).

**Verdict: feasible, and not awkward.** Three call sites, two queries, one settings read.
Every module read in the backend funnels through `_LocalModuleRepo`:

- `api/workspace_modules.py:73` (`_resolve_modules` → `repo.modules.ensure_modules`) — serves
  both `GET /tournaments/{id}/modules` and `PATCH .../modules/{module_id}`.
- `api/tournaments.py:159` (`_modules_for` → `ensure_modules`) — the single-workspace summary.
- `api/tournaments.py:304` (`ensure_modules_for`) — the batched Hub list path.

There is no fourth reader: `list_for_tournament` (`repositories/local.py:1385-1390`) simply
delegates to `ensure_modules`, and `update()` (`local.py:1460`) reaches rows through `get()`
after the route has already resolved them.

**Mechanism (four small changes, all in existing seams):**

1. **`database/models.py` stays pure.** Add a constant `CLOUD_ONLY_MODULES = ("entries",)`
   next to `MODULE_IDS` (`models.py:606`) and give `derive_modules`
   (`models.py:620`) / `normalize_module_seed` (`models.py:650`) an explicit
   `include_cloud_only: bool` parameter. No settings import enters the model layer — the
   caller supplies the mode. This is what closes the "what would change my mind" clause above.
2. **The repository decides the mode.** `repositories/local.py` gains
   `from app.config import settings` and a one-line predicate reading
   `settings.environment == "cloud"` **at call time**. This is not a new layer dependency:
   `local.py` already imports `app.time_utils` (`local.py:58`) and `database.session`
   (`local.py:75`), which itself imports settings (`database/session.py:20`). Reading the
   attribute at call time — rather than capturing a boolean at import — is what makes it
   testable, matching the established `monkeypatch.setattr(settings, …)` pattern used across
   `tests/unit/test_dependencies.py`, `tests/test_client_ip_trust.py` and
   `tests/test_abuse_limits.py`.
3. **The filter goes in exactly two queries.** `_rows_for` (`local.py:1441-1448`) — which is
   the return value of *both* branches of `ensure_modules` (`local.py:1400-1415`) — and the
   batched `select` in `ensure_modules_for` (`local.py:1428-1432`), which reads
   `WorkspaceModule` directly and therefore does **not** inherit `_rows_for`'s filter. Both
   get `.where(WorkspaceModule.module_id.notin_(CLOUD_ONLY_MODULES))` in local mode. Missing
   the second one is the obvious bug; the test for it is "restore a cloud DB, hit the Hub
   list path, assert no `entries`".
4. **Rows are filtered, never deleted.** The inherited row stays in the table untouched, so
   moving the same database back to a cloud deployment restores the module with its status
   and config intact. Filtering is a projection, not a migration.

**Interaction with the `MODULE_REQUIRES_CLOUD` guard (R1).** With the filter in place,
`patch_module` (`api/workspace_modules.py:96`) resolves a module list that has no `entries`
entry, so `by_id.get("entries")` is `None` and the route already 404s. That is correct
behavior but a *misleading* error, so the route additionally checks
`module_id in CLOUD_ONLY_MODULES` **before** the generic 404 and returns the specific
`MODULE_REQUIRES_CLOUD` code. Defence-in-depth, and a better message.

**Create path (not a read path, flagged so it is not missed).** `normalize_module_seed`
backfills over `MODULE_IDS`; in local mode it must omit `entries` from the backfill *and*
reject an explicitly-named `entries` seed with a 400 rather than silently persisting a row
the read path will then hide.

**Frontend mirror.** `platform/domain/moduleModel.ts:74` documents itself as mirroring
`derive_modules(kind)` exactly. It is a *display* mirror of a backend truth, and the backend
now filters before the DTO is built — so the mirror needs the new module id in its ordering
and label tables, but needs no mode awareness of its own. Keeping mode logic out of the
client is deliberate: the client must not be the thing deciding what a deployment can run.

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
  what they cost, whether they are open, the submit form, and — see the R2 amendment below —
  **the entrant list, names and events only**. It is discoverable and shareable by design.
  It exposes **no contact data**: never an email, phone, address, or anything an entrant did
  not knowingly publish.
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

#### Q4 (R2) — the entrant list is public by default: names and events only

**Decision.** The entry page shows **who has entered**, per event, by default. The published
fields are exactly **display name + the events they entered** — nothing else, ever. Three
things make this safe rather than careless:

1. **Notice at the point of consent.** The acknowledgment checkbox that gates submission
   (§Q11) carries the sentence that the entrant's name will appear on the public entrant
   list for this tournament. Notice sits next to the action, not in a policy page nobody
   opens.
2. **A per-entrant opt-out**, `entries.list_opt_out` (§4). An entrant who opts out is absent
   from the public list and still fully entered — the flag governs *publication*, never
   *participation*. Operator surfaces always see everyone.
3. **Contact data is structurally excluded**, not filtered. The public projection selects
   the name and event columns; it does not select contact columns and then hide them (the
   same strict-projection discipline the display routes already hold — see the discrepancy
   log, item 4).

**Rationale.** A published entrant list is the norm across the incumbent stack and its
peers, and entrants expect it: Tournament Software's public surface is name-centric (a
"Players" tab where a player clicks their own name to reach their matches), and federation
practice pairs the name with club/country/state on draws. The same sources are equally clear
about the other half of the rule — contact details are collected but never published;
Badminton England's membership system states that only the member and a small internal team
can see a member's personal information. Publishing names while withholding contact data is
therefore the *conventional* posture, not a liberty we are taking.

There is also a workflow reason. The single most common pre-tournament question is "did my
entry go through?", and a visible list answers it without an email, a login, or a phone call
to the organiser.

**Publication is not live-by-accident — but it is live by default here, deliberately.**
Tournament Software's public player list updates only "when the referee re-publishes the
tournament", typically after the entry deadline and after the draw; a player's absence from
it proves nothing, which is precisely why players still email organisers to ask. That
snapshot model exists because TS's public site is a *published file*, not a live view of the
entry table — an architectural constraint we do not have. We publish live and gain the
confirmation loop, and we keep the operator's control where it belongs: the operator can
close the page or turn the list off, and **entry state is never inferable from the list** —
it shows entrants, not their `pending`/`confirmed`/`waitlisted` status. Acceptance and
reserve lists are a *separate*, post-close, deliberately-published surface (program Phase 9),
which is the distinction the federation regulations draw: entry is not acceptance, and
acceptance is confirmed by the organiser in writing (for international events, within seven
days of entry close).

**Rejected — opt-in publication.** It produces a list that is systematically incomplete and
therefore useless for the confirmation loop, while giving no additional protection to the
one field that actually matters (contact data is excluded under both models). No source
found for an opt-out norm in the incumbent stack in either direction; the ruling follows the
GDPR-shaped instinct that publication of a name in a sporting context is expected and
minimal, and pairs it with a working escape hatch.

**Rejected — no public list at all.** This is the status quo of nothing, and it pushes the
"am I in?" question onto the organiser's inbox — the exact manual work this module exists to
delete.

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
   (`docs/programs/SEC_PROGRESS.md:66`). A public entry form is *unreachable* until that is
   addressed. **R2 amendment: it is addressed by hostname, not by another path exclusion**
   (§2A) — the public entry page is served under `play.*`, which has no Access policy at
   all, so no `/entries/*` exclusion is ever created. This still belongs in
   `docs/how-to/install-selfhost.md`, exactly as the display exclusion did, but as ingress +
   policy configuration rather than as a growing exclusion list.
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

That guards retries, and it stays exactly as written.

> **Superseded by Q12 (R2).** R1 paired the idempotency key with a *second*, natural-key
> unique index on `(entry_event_id, lower(contact_email))` to guard "the same human
> submitting twice from two devices". Ruling R7 removes that index: the premise that one
> email means one human is false in this domain. The idempotency-key index survives
> untouched — the two guards were always separate failures, and only one of them was
> mis-specified. See **Q12**.

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
construction sites (`workspace_signals.py:368-380`) and are mirrored by hand on the
frontend. Six new codes doubles the count. **R2: resolved — promote to one shared constant,
in program Phase 3, not as debt.** See §9.6 for the reasoning and the current mirror sites
(the R1 citation `products/hub/nextAction.ts:7-11` is stale: SP-UI-1 moved that mapping to
`platform/domain/setupChecklist.ts`).

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

### Q11 (R2) — Regulations & waiver. **Decision: director-discretion, versioned, acknowledgment gates submission.**

*Encodes standing ruling R5.*

**Decision.** Four moving parts, all of them boring on purpose:

1. **The text lives on `entry_pages`** (`regulations_text`), authored by the director in
   their own words. ShuttleWorks ships no template, no default legal copy, and no opinion
   about its content. It is the director's document; we are the delivery mechanism.
2. **`entry_pages.waiver_required` is a director-discretion boolean.** Some events need a
   liability waiver; a club ladder does not. The software does not decide which is which,
   and it never *requires* a waiver on the operator's behalf.
3. **Acknowledgment gates submission from day one** — the checkbox is in E1, not deferred
   with the rest of the lifecycle. An entry cannot be created without it. This is one of the
   few places where the software genuinely refuses, and it refuses because a waiver
   acknowledged after the fact is not an acknowledgment.
4. **Everything is versioned.** `entry_pages.regulations_version` bumps whenever the text is
   edited; every entry records `regulations_accepted_at` and the exact
   `regulations_version_accepted`. "They agreed to *something* at some point" is not a
   record; "they agreed to v3 at 14:02 on 12 March" is.

**Guardian consent lives in the waiver text, at the director's discretion.** The spec does
not build a guardian-consent workflow, a minor-detection rule, or an age gate. A director
running a junior event writes the guardian language into their own regulations and the
guardian acknowledges it as part of the entry. This is a deliberate scope refusal:
under-16 thresholds vary by member state, "who counts as a guardian" is a legal question we
are not qualified to encode, and a half-built consent workflow is worse than an honest text
field. Open question §9.2 narrows accordingly — it is now about whether *we* need anything
beyond this, not about designing a mechanism.

**Date of birth / birth year is a plain eligibility field**, collected when the director's
events need it (U15, O40) and treated as ordinary entry data — not as a trigger for any
automatic behavior. It is emphatically **not** a GDPR special category; the special-category
line (health, accessibility, medical) stays out of scope entirely, as §Q10 already says.

**The waiver does not waive GDPR.** No text an entrant checks a box on removes their right
to erasure or shortens our retention obligations. Withdraw-and-erase still ships in E2, and
the retention default plus anonymization job still ship in E5. This sentence exists because
the opposite assumption ("we have a waiver, so we're covered") is the single most common
way small organisations get this wrong.

**Rejected — ShuttleWorks ships default regulations text.** It reads as legal advice from a
solo-maintained product to a director in a jurisdiction we know nothing about. Refused.

**Rejected — waiver mandatory for all events.** Software deciding a legal posture on the
operator's behalf, and false friction for the club ladder. It is invariant I4 ("software
flags; operators decide") applied to compliance.

**Rejected — an unversioned single text field.** Cheaper by one column and worthless in the
only moment the field matters: a dispute about what was agreed.

### Q12 (R2) — Contact vs player model. **Decision: no natural-key uniqueness; soft duplicate flag; split-ready shape.**

*Encodes standing ruling R7. Supersedes the second half of Q5.*

**Decision.** Three parts:

1. **Drop the `(entry_event_id, lower(contact_email))` unique index.** One email address may
   legitimately submit several entries to the same event.
2. **Duplicate suspicion becomes a soft attention flag**, not a rejection. Trigger: same
   event **+** same normalized email **+** same player name. That conjunction is what
   actually smells like a double-submit; email alone does not. The operator resolves it
   (invariant I4).
3. **The row is shaped for a later split.** Player-identifying fields (`player_name`,
   `birth_year`, `remarks`) are kept structurally distinct from submitter/contact fields
   (`contact_name`, `contact_email`, and the manage token) inside `entries`, so extracting an
   `entry_players` table later is a **migration, not a redesign** — move columns, add an FK,
   leave every other seam intact.

**Rationale — the rejected index would have broken real, common cases.** A parent entering
two children shares one email by definition. A club representative entering eight players
shares one email eight times. The unique index rejects the second child with a duplicate
error, and the entrant's only recourse is to invent an email address — which corrupts the
one field we are keeping as the future registry join key. The failure mode is silent data
poisoning, produced by a constraint added to prevent data poisoning.

The industry evidence is that the incumbent stack **does** support one submitter acting for
many players — it just does so at a different tier. BWF sanctioned events at Levels 2–4 and
junior international events are entered online **by the Member Association**, which also
creates player IDs, updates profiles, and withdraws entries on players' behalf. USA
Swimming's Online Meet Entry is the same shape at the other end of the sport spectrum: a
coach starts the entry, is shown the team's athlete roster, may add unregistered athletes to
it, and needs no per-athlete approval. Delegated multi-player entry is not an edge case; it
is how the federation tier of the incumbent works.

Where the incumbent *is* one-account-per-player — Tournament Software's consumer flow, where
each player self-registers with their own profile and even doubles is two independent
entries, each player paying their own fee and nominating the partner by Member ID — the
uniqueness lives on **the account**, not on the entry. Pickleball Brackets is explicit about
this: a player changing email must edit their existing profile rather than create a second
account. Our v1 has **no accounts at all** (Q4), so there is no account for uniqueness to
attach to. Copying an index whose semantics come from an account model we deliberately do
not have is exactly the kind of borrowed constraint this section rejects.

Two evidence caveats, recorded rather than smoothed over: whether Tournament Software
permits one parent account to enter several minors is **unverified** (its help pages sit
behind a cookie wall that defeats automated fetch), and no source was found stating whether
it enforces email uniqueness at the *entry* level. The verified precedents for
many-players-per-submitter are BWF Member-Association group entry and swim-meet coach entry,
and the ruling rests on those.

**Rejected — the hard `UNIQUE (entry_event_id, lower(contact_email))` index** (as specified
in R1's Q5). Rejected because: (a) it is wrong on the merits above; (b) a unique index is a
*hard* answer to a *soft* question — "is this the same human?" is a judgment, and judgments
belong to the operator, not to a constraint that returns 409; (c) it is the expensive
direction to reverse, since dropping it later means reconciling data that could never be
entered while it existed, whereas adding uniqueness later is a deduplication pass we can do
deliberately; and (d) it conflates human duplication with retry duplication — the precise
trap `models.py:785-787` already documents for solve jobs, which R1 correctly identified and
then walked into from the other side.

**Rejected — a full `entry_players` table in v1.** Correct destination, wrong moment. E1
does not need it, and building the submitter/player join before doubles (E3) exercises the
model would be designing against imagination. Part 3 of the decision is what makes deferring
it safe.

**Kept — `UNIQUE (idempotency_key)`.** Untouched by this ruling. It guards a genuinely
mechanical failure (a form re-posted on a flaky connection) with genuinely mechanical
semantics (return the original, do not create a second). Solve-rail precedent, unchanged.

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

  -- ---- submitter / contact block (Q12) ------------------------------
  -- Who submitted and how we reach them. May repeat across entries: one
  -- parent, several children; one club rep, several players.
  contact_name       text
  contact_email      text        -- normalized; future registry join key
  email_verified_at  timestamptz NULL
  manage_token_hash  text        -- capability token, hashed like auth_sessions

  -- ---- player block (Q12) -------------------------------------------
  -- Who is actually playing. Deliberately NOT interleaved with the block
  -- above: these are the columns that move, whole, into `entry_players`
  -- if/when the split happens. Keep additions to this block in this block.
  player_name        text        -- the entrant; published on the public list
  birth_year         int NULL    -- plain eligibility field (Q11), never a trigger
  remarks            text NULL   -- free-text availability note; see below

  -- ---- doubles ------------------------------------------------------
  partner_entry_id   uuid NULL   -- the paired entry, doubles only
  partner_email      text NULL   -- named before the partner acts

  -- ---- publication & consent ----------------------------------------
  list_opt_out       bool NOT NULL DEFAULT false  -- Q4: absent from the public
                                 -- entrant list; still fully entered
  regulations_accepted_at        timestamptz NULL
  regulations_version_accepted   int NULL         -- Q11: what they agreed to

  -- ---- money / traceability -----------------------------------------
  idempotency_key    text NULL   -- unique; solve-rail semantics
  fee_cents          int NULL    -- snapshot at submit
  paid_at            timestamptz NULL
  payment_note       text NULL
  committed_player_id text NULL  -- traceability into the roster
  submitted_at / updated_at / withdrawn_at

  UNIQUE (idempotency_key)                          -- retry dedup, NULLs exempt
  -- NO natural-key unique index on (entry_event_id, lower(contact_email)).
  -- Deliberate, ruled out in Q12: shared emails are legitimate. Duplicate
  -- suspicion (same event + same email + same player_name) is a soft
  -- attention flag an operator resolves.
  INDEX (entry_event_id, lower(contact_email))      -- non-unique; powers the flag

entry_pages
  tournament_id      PK, FK → tournaments
  slug               text UNIQUE  -- public, discoverable
  is_open            bool
  intro_text         text NULL
  regulations_text   text NULL    -- Q11: the director's own words
  waiver_required    bool NOT NULL DEFAULT false   -- Q11: director discretion
  regulations_version int NOT NULL DEFAULT 1       -- bumps on every text edit
```

Notes: `manage_token_hash` is stored hashed, following `auth_sessions.token_hash`
(`models.py:962-993`) rather than the display token's plaintext storage — entrant tokens
are numerous and long-lived, so the stronger precedent wins. All tables cascade from
`tournaments` like `display_tokens` and `tournament_members` do.

**`remarks` — the free-text availability note.** One field, deliberately unstructured:
"can't play before 6pm Saturday", "sharing a lift with X, please keep us on the same day",
"leaving at 4". It is carried through the commit seam **onto the roster player**, where it
sits next to the availability controls the operator already uses (SP-D7's
`AvailabilityControl` grammar), so the operator can turn a sentence into a real constraint
in one place instead of hunting through an inbox. This is the §1 differentiator made
concrete: an entrant's words reach the thing that builds the schedule. It is **not** parsed,
never inferred from, and never fed to the solver directly — a free-text field that silently
became a constraint would be the worst kind of automatic decision (I4). It is an operator
input, presented where the decision is made.

**No `entries` row is ever a module row.** Per Q1's R2 mechanism, the mode filter lives on
`workspace_modules`, not here: a local-mode deployment hides the Entries *module* but leaves
inherited entry data intact and readable by a cloud deployment later. Nothing in this schema
is mode-aware.

---

## 5. Seams (behavioral contracts)

### Seam A — the commit seam: Entries → Meet | Bracket

- **Input:** a workspace id, an operator with ≥ operator role, an optional event filter.
- **Output:** for every `confirmed` entry with no `committed_player_id`, a roster player
  (Meet: a `PlayerDTO` in the state blob with `ranks[]` derived from `entry_events.code`;
  Bracket: a `bracket_participants` row under the mapped `bracket_event_id`), plus the
  back-reference written on both sides, plus the entrant's `remarks` carried onto the roster
  player verbatim (never parsed, never turned into a constraint by the seam — §4).
- **Invariants:** idempotent (re-running commits nothing new); never mutates or deletes an
  existing roster player; never auto-removes on withdrawal; total commits ≤ total confirmed.
- **Failure modes:** a `state_version` conflict on the Meet blob → refetch and retry, never
  blind overwrite; an unmappable `entry_events.code` → the entry is skipped and reported,
  not guessed at; partial success is reported per-entry, not rolled back wholesale.

### Seam B — the public-surface seam: entrant → Entries

- **Input:** a public slug, an event id, entrant fields (contact block + player block, §4),
  a regulations acknowledgment, a Turnstile token, an `Idempotency-Key`.
- **Output:** an entry in `unverified`, plus a verification email whose links are composed
  from `PUBLIC_BASE_URL` (§2A, invariant I1) — never a literal hostname.
- **Invariants:** never reveals whether an email is already entered (uniform response) — and
  this survives Q12, because a repeat email is now a *legitimate* submission, not a
  detectable collision; never returns another entrant's data; the raw tournament UUID never
  appears; a replayed `Idempotency-Key` returns the original entry rather than creating a
  second; submission is refused without an acknowledgment, and the accepted
  `regulations_version` is recorded at that moment, not later.
- **Public read (Q4):** the entrant-list projection selects `player_name` + event only,
  excludes rows with `list_opt_out`, and exposes no entry state.
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

**R2 amendment: the slices are now mapped onto SP-PROGRAM-1 phases.** The slice contents are
unchanged; what changed is that each has a numbered home in the program, and two program
phases (2 and 6) supply infrastructure the slices depend on. `docs/programs/SP-PROGRAM-1.md`
is authoritative for phase entry/exit conditions and sign-off gates; this table is the
mapping only.

| Slice | Program phase | Contents | Why here |
|---|---|---|---|
| **E1 — walking skeleton** | **Phase 5** | Cloud-only. One `entry_event`, singles only, no payment, no partner, no cap. Public slug page → submit → entry row → operator desk list → commit to roster. Rate-limit zone + Turnstile + allowlist entry; page served from FastAPI templates under `play.*` (no framework — §2A). | **Tests the riskiest assumption first: that a public write can be exposed safely at all**, and that the commit seam survives the `If-Match` blob contract. Everything else is product surface on top of a proven pipe. |
| *(public-site scaffold)* | **Phase 6** | Not an Entries slice: the `play.*` frontend app (framework decision R8 / §2A), design-token import, SEO + unfurl, and the transactional email provider with SPF/DKIM/DMARC. | E2 sends real email to real strangers; the delivery infrastructure has to exist and be *proven* before the lifecycle depends on it. The framework decision waits for E1 so it is judged against a real page. |
| **E2 — lifecycle** | **Phase 7** | Email verification, capability "manage my entry" link **including withdraw-and-erase**, caps + waitlist, pending-reasons, operator confirm/reject/promote, regulations versions finalized (Q11), entrant-list opt-out honored (Q4), `remarks` through the commit seam. | Erasure is nearly free here and expensive later (Q10). |
| **E3 — doubles** | **Phase 8** | Partner nomination, confirmation email, pair conflicts as operator-resolved flags. | The incumbent's weakest area; needs E2's email + token machinery. |
| **E4 — signals** | **Phase 9** | Phase extension, six attention codes, Hub next-action and Overview integration, plus the public read surfaces on `play.*` (entrant lists, post-close acceptance/reserve lists). | Needs real entry states to derive from. |
| **E5 — money & compliance** | **Phase 10** | Fee display, manual paid/unpaid, retention default + anonymization job, GDPR verification pass. | Unblocks public launch. |
| *post-v1* | post-program | Stripe Checkout against the Q8 boundary. | — |

Two program phases carry Entries prerequisites and are named here so no slice silently
assumes them: **Phase 2** (deployment on `wongworks.dev`, the hostname split, the I1
base-URL seam and its CI guard) precedes E1, and **Phase 3** (the appearance pass) owns the
attention-code shared constant that E4 consumes — see §9.6.

---

## 8. Non-goals

Payments processing (v1 records and displays only) · partner-search pool · entrant accounts
· cross-tournament player registry · Entries for local-only workspaces · seeding automation
from entry data · duplicate-identity merging · refund processing · waitlist lotteries.

---

## 9. Open questions for implementing agents

1. **All styling and visual design** — the public entry page is the first ShuttleWorks
   surface a non-operator ever sees; it is not an operator console and should not inherit
   the dense control-plane grammar uncritically. §2A settles the *architecture* of this
   (separate mobile-first frontend, shared design tokens, framework decided in Phase 6); the
   visual language itself remains open.
2. **Minors / guardian consent** — **narrowed by Q11 (R2), not closed.** The mechanism
   question is answered: guardian language lives in the director's waiver text, and
   birth year is a plain eligibility field. What remains open is whether *we* need anything
   beyond that for under-16 entrants in the jurisdictions the product actually operates in.
   Product/legal call, blocks E5 (Phase 10), not E1.
3. Whether `entry_events.code` → Meet `ranks[]` is the right mapping in practice, or whether
   Meet needs a thin events concept sooner than Q2 assumes.
4. Whether the Entries desk is its own nav section or a tab within an existing one.
5. Exact `ENTRIES_CLOSING_SOON` threshold and whether it is per-workspace configurable.
6. ~~Whether to promote attention codes to a shared constant now (see Q9) or log it as
   debt.~~ **RESOLVED (R2): promote, in program Phase 3.** Not debt. The codes are bare
   string literals at their backend construction sites
   (`api/workspace_signals.py:368-380`, with the vocabulary re-stated in a docstring at
   `workspace_signals.py:89`) and are hand-mirrored on the frontend — since SP-UI-1 in *two*
   places, `platform/domain/setupChecklist.ts:62` (`REASON_ACTION`) and a literal comparison
   in `products/workspace/overview/PhasePanels.tsx:92`. E4 (Phase 9) adds six more codes,
   doubling the vocabulary across three hand-maintained mirrors, and Phase 3 is already
   editing exactly these surfaces. Doing it there is a rename inside files that are open;
   doing it in Phase 9 is a rename plus six new codes plus a redesign, all at once. The
   promotion is therefore **assigned to program Phase 3 scope** (recorded in
   `SP-PROGRAM-1.md` Phase 3 amendment (a)), and E4 consumes the constant rather than
   creating it.

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

Added by the SP-ENTRIES-R2 pass (2026-08-06):

| # | Claim as stated | What the tree actually shows |
|---|---|---|
| 9 | R1's Q9: attention codes are "mirrored by hand in `products/hub/nextAction.ts:7-11`" | **Stale as of SP-UI-1.** `nextAction.ts` now imports `REASON_ACTION` from `platform/domain/setupChecklist.ts:62`, and a *third* hand-written mirror appeared at `products/workspace/overview/PhasePanels.tsx:92` (a literal `'NO_MODULES_ENABLED'` comparison). Three mirrors, not two — which strengthens §9.6's resolution rather than weakening it. |
| 10 | Program I1 assumes absolute URLs are generated "wherever they are generated today" | **They are not generated at all today.** `app/config.py` has no base-URL setting, and no backend module composes an absolute product URL — the invite route deliberately returns a *relative* path for the frontend to absolutize (`api/invites.py:75`). I1 is therefore a greenfield seam introduced in program Phase 2, not a refactor of existing call sites. Good news, recorded so nobody goes hunting for the call sites. |
| 11 | R6 assumed the read-path filter might be awkward enough to STOP | **It is not.** All module reads funnel through `_LocalModuleRepo` and there are exactly two queries to filter (`repositories/local.py:1441-1448` and the batched select at `1428-1432`); the settings read sits in a layer that already depends on settings transitively (`database/session.py:20`). Full mechanism in Q1 (R2). The one non-obvious trap: `ensure_modules_for` does **not** route through `_rows_for`, so filtering only `_rows_for` would leave the Hub list path leaking the module. |

---

## See also

- `docs/programs/SP-PROGRAM-1.md` — the master program: standing rulings R1–R9 (encoded
  here), program invariants I1–I8, and the phase table §7 maps onto
- ADR 0001 — four-module split (the Tier-1/Tier-2 criterion Q1 turns on)
- ADR 0005 — `coming_soon` elimination (the actionability principle Q1 preserves)
- `docs/programs/ENTRIES_PROGRESS.md` — the SP-ENTRIES ledger
- `docs/audits/debt-log.md:481` — the GDPR pre-launch item Q10 extends
