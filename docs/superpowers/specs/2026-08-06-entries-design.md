# Entries — Design

**Date:** 2026-08-06
**Status:** Provisional — research and design complete, decisions awaiting review (SP-ENTRIES-R1)
**Amended by SP-ENTRIES-R2 (SP-PROGRAM-1 Phase 1), 2026-08-06** — standing rulings R5–R7
folded in as decision sections, the three-surface architecture added (§2A), Q4/Q5/§4/§7
amended, open question #6 resolved, R6 feasibility verified against the tree and written
into Q1.
**Amended by SP-ENTRIES-R3 (master amendment), 2026-08-07** — standing rulings **R10–R14**
folded in. **This amendment supersedes a shipped shape, not a design on paper:** E1 was
implemented, adversarially verified, demoed end to end and merged to `main` (`86182af`)
before these rulings arrived. Every section that touches shipped behavior says what E1
shipped, what changes, and the migration posture.
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

> **Amendment note (R3).** Same numbering discipline: the two new decision sections are
> **Q13** (the entrant account model, from ruling R10) and **Q14** (pricing, deadlines and
> entry policy, from ruling R14). **Q13 supersedes the identity half of Q4** and **Q12's
> "no accounts at all" premise**; **Q12 is hardened by R13** from a split-*ready* row into a
> mandatory `account → submission → entries → players` shape. R11 (responsive posture)
> amends §2A and program invariant I7; R12 (field policy) rewrites the entrant fields in §4.
> Read Q4 → Q13 → Q12 → Q14 → §4 as one chain.
>
> **Divergence posture.** R10–R14 arrived *after* E1 shipped. Where a ruling reshapes
> behavior that already exists in the tree, the section names the shipped shape and states
> the migration posture — **additive migration** (new tables/columns, old ones backfilled and
> then dropped) or **rework** (behavior and its tests deliberately unwound). Sections marked
> *unaffected* are load-bearing too: the operator desk, the Seam A contract, the entry-page /
> entry-event config routes and the module system survive R10–R14 intact.

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
| **Public tournament site** | `play.wongworks.dev` | entrants, players, spectators | a distinct **responsive** frontend (R11 — desktop and mobile are co-equal; see below) | no Access; WAF + rate limits + the §Q4 anti-abuse stack |

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
- It is **responsive, with desktop and mobile as co-equal first-class layouts** (ruling R11 —
  see the subsection below, which amends program invariant I7). The operator console stays
  desktop-only and is not made responsive by this program.
- The framework is deliberately **not chosen here** (ruling R8): the decision is made in
  program Phase 6 against the real E1 page, judged on **both-width** rendering weight,
  SSR/unfurl quality, design-token reuse, and solo maintainability. E1 ships its page from
  **FastAPI templates** precisely so the framework decision has evidence rather than a guess
  behind it.

### §2A (R3) — Responsive posture: two first-class widths, not one (ruling R11)

**Decision.** `play.*` is **responsive with desktop and mobile as co-equal first-class
layouts.** Concretely, and testably:

- **The entry flow is desktop-comfortable *and* fully usable at phone width.** Multi-event
  selection with a running fee total (Q14) is a table-shaped interaction that a
  360–390px-only design would compress into something worse than the incumbent's; a
  desktop-only design would fail the entrant standing in a sports hall.
- **Read surfaces lean mobile** — tournament page, entrant lists, acceptance/reserve lists,
  and later the display projections. These are glanced at on a phone far more often than
  they are studied on a laptop, and leaning is a priority, not an exclusion.
- **The bar, stated so it can be checked:** *no horizontal scrolling and no degraded
  functionality at either width.* Not "works if you pinch"; not "the desktop layout, smaller".

**What this supersedes.** Two things, both shipped:

1. **Program invariant I7** currently reads "everything on `play.*` is mobile-first". R11
   amends the second clause only — the operator-console half of I7 (desktop-only, untouched
   by this program) stands exactly as written.
2. **The shipped E1 page was built to "usable at 390px — that is the bar"** (SP-E1-1 Phase C,
   and the comment that encodes it in the page's own stylesheet,
   `backend/api/entries_public.py:291`, with the single `max-width: 34rem` column at `:298`).
   That bar is replaced, not merely raised. **Migration posture: rework, and cheap** — the
   E1 page is throwaway by design (ruling D3: hand-built `HTMLResponse`, no template engine),
   so the co-equal-width requirement lands as a Phase 6 acceptance criterion on the real
   `play.*` app rather than as a retrofit of a page that is scheduled for deletion.

**Rationale.** The incumbent is the counter-example. TournamentSoftware's public surface is
a desktop-era layout that phones tolerate; its entry flow assumes a keyboard and a wide
viewport. Entrants, however, arrive from a WhatsApp link on a phone and organisers arrive
from a laptop, and the *same page* serves both. Choosing one width as primary means
deliberately serving one of those two badly, and neither is the minority.

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
   `settings.environment == "cloud"` **at call time**.

   > **Amended by ruling D2 (SP-E1-1 Phase A STOP), recorded here at R3 because the
   > amendment was owed and never written.** The shipped predicate keys on
   > **`settings.auth_mode == "cloud"`**, not `settings.environment` — the spec's stated
   > mechanism collides with `docker-compose.cloud.yml`, which sets `ENVIRONMENT=local`
   > deliberately. The implemented helper is `cloud_modules_enabled()`
   > (`backend/app/config.py:368-386`, whose docstring names the
   > `monkeypatch.setattr(settings, "auth_mode", …)` testability pattern this bullet
   > describes). Rationale, unchanged from D2: Entries is meaningless without real operator
   > accounts; the smoke stack and selfhost both run `AUTH_MODE=cloud`; plain local stacks do
   > not. Everything else in this mechanism shipped as written. **Untouched by R10–R14.** This is not a new layer dependency:
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

### Q4 — Identity and public surface. **Decision (R3, superseding R1/R4): public slug for the page, an entrant *account* for the person.**

*Amended by ruling R10. The public-page half of R1's decision stands verbatim; the identity
half is reversed. The mechanism of the account lives in **Q13**; this section keeps the
address model and the anti-abuse stack that hang off it.*

**Decision.** Still two distinct things, because they still have two distinct security
properties — but the second one is now a principal, not a token:

- **A public workspace slug** (`/e/{slug}`) addresses the *entry page*: what events exist,
  what they cost, whether they are open, the entry action, and — see the R2 amendment below —
  **the entrant list, names and events only**. It is discoverable and shareable by design.
  It exposes **no contact data**: never an email, phone, address, or anything an entrant did
  not knowingly publish. **Unchanged by R10.**
- **An entrant account** addresses *a person's entries* ("my entries"). Managing an entry —
  viewing it, withdrawing it, erasing it — is **login-gated**, on a session scoped to the
  public host (Q13). The per-entrant capability token is **retired from this path**.

**Capability tokens are not abolished; they are re-scoped.** They remain exactly what they
have always been good at — *public read links that a person shares* (the display token,
`api/display.py`, whose whole point is that a venue TV has no account). What they stop being
is an authentication substitute for a human who acts repeatedly over weeks. And E3's partner
flow does not lose its token either: it becomes an **invite token** on the invite-link
precedent (`api/invites.py`) whose acceptance drives *account creation*, not entry mutation
(Q6, Q13).

**Rationale for the page half (unchanged).** The R1 hypothesis proposed extending the
display-token pattern wholesale, and the audit shows exactly where that breaks: an entry page
*wants* to be discoverable, which a capability URL is specifically designed to prevent.
Splitting the page address from the person keeps the capability pattern intact for the thing
that actually needs it and stops it being misapplied to a poster URL.

#### Rejected — the no-accounts model (R1's Q4 / ruling R4). Its reasoning, then why it reversed.

**The original reasoning, recorded intact rather than paraphrased away**, because it was not
foolish and the reversal is a change of weighting, not a correction of a blunder:

> Identity is verified email plus a per-entrant capability token — **no entrant accounts in
> v1**. A per-entrant capability token addresses a specific entry; same shape as the display
> token (`secrets.token_urlsafe(24)`), same uniform-404 on miss, and the raw tournament UUID
> never becomes a public key. `contact_email` is retained as the future join key for a
> cross-tournament registry (deferred).
>
> start.gg validates the no-accounts choice from the other direction: it lets organizers add
> players by name + email with the account created later, and models a global `User`/`Player`
> separately from a point-in-time `Participant`/`Entrant`. That is precisely our
> entry-now/registry-later split.
>
> The friction argument: an account is a signup wall in front of the one act we most want to
> succeed. A parent registering a child at 11pm should not have to invent a password first.

**Why it reversed (ruling R10), in the order the reasons actually bite:**

1. **Industry alignment.** The incumbent is not account-optional — it is
   account-*mandatory*, and thinly so. TournamentSoftware's signup form
   (`https://www.tournamentsoftware.com/user/Signup`, observed 2026-08-07) asks for first /
   middle / last name, sport, a **separate login name**, email, password, confirm password,
   and one consent checkbox; **gender, date of birth, club and address are not on it** —
   they are profile fields you complete afterward, and federation guides uniformly say sign
   up → activate via emailed link → log in → *then* fill in birthdate, gender and address
   before you can enter. Every federation source describing the entry flow starts at "log
   in". A product whose entrants have no account is not simplifying the incumbent's model;
   it is diverging from the one thing every entrant in this sport already knows how to do.
2. **GDPR simplification.** This is the largest practical gain and it inverts R1's Q10. With
   no account, the capability link *is* the erasure path, which means erasure depends on the
   entrant still possessing a one-time code shown once on a success page — an erasure right
   that a cleared browser history quietly deletes. With an account, deletion and export ride
   the machinery a `users` row already implies, and they cover *every* entry the account ever
   made rather than one at a time.
3. **Manage-path UX.** "Keep this code. It is shown once" (the shipped success-page copy,
   `backend/api/entries_public.py:514`) is a support burden with a known failure mode: the
   code is lost, and the only recovery is emailing the organiser — the exact manual work this
   module exists to delete. A login is a recovery mechanism that already exists
   (`POST /auth/request-password-reset`).
4. **The submitter is not the player.** R13's mandatory
   `account → submission → entries → players` shape needs something durable for the submitter
   half to hang off. A token per *entry* cannot express "these six entries are mine".

**What the account is, and is not** (this is the sentence to quote): **an entrant account is
a SUBMITTER, not a player.** One account enters many players — a parent entering two
children, a club representative entering eight members. The self-entering player is the
**common case, not the model**: they are simply a submitter whose only player is themselves.
This is where the incumbent's model is genuinely worse and we keep the difference:
TournamentSoftware is one login = one player (each doubles partner submits and pays
separately; Badminton BC's documented workaround for partner requests is a free-text
*remarks* box), and its guardian checkbox is a consent affordance for creating a child's own
account, not a delegated-entry feature. No club-rep bulk-entry surface was found on the
public product. Our account model is the incumbent's plus the delegation the federation tier
of the incumbent already has (BWF Member-Association group entry; USA Swimming coach entry —
the evidence behind Q12).

#### Q4 (R3) — what the shipped E1 identity path loses

**Shipped:** `POST /e/{slug}/submit` is anonymous; the route mints
`secrets.token_urlsafe(...)`, stores `Entry.manage_token_hash` (SHA-256, the `AuthSession`
precedent — `backend/database/models.py:1181-1184`), and returns the **raw token once** on
the success page (`backend/api/entries_public.py:492-520`, minted and returned at `:675` and
`:715`). Two `tests/test_auth_surface.py` allowlist entries record the anonymous-write
posture as deliberate (`PUBLIC_BY_DESIGN`, `products/scheduler/tests/test_auth_surface.py:52`, entries at `:69`
and `:75`), and the file's rewritten preamble (`:29-51`) states in prose that "an entrant has
no account and never will (spec Q4)".

**Migration posture: rework, deliberately.** `manage_token_hash` is dropped once entries hang
off accounts; the success-page "keep this code" card is deleted; the `POST /e/{slug}/submit`
allowlist entry is **removed** from `PUBLIC_BY_DESIGN` (the route is no longer session-free)
and the preamble's "never will" sentence is rewritten to describe the new posture. The
`GET /e/{slug}` allowlist entry **stays** — the page is still public by design. This is the
unwinding the R3 divergence report flagged: the tests that pin the shipped behavior are
edited *because the behavior is superseded by a user ruling*, which is the one sanctioned
reason to edit a passing test.

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

**Anti-abuse stack (R3 — restacked around the account).** The pieces are the same; **which
act each one guards moves.** With R10, the public *unauthenticated* act is no longer
submission — it is **signup**. Submission sits behind a session. So:

- *Edge:* the `sw_entries` `limit_req` zone alongside `sw_auth` and `sw_display`
  (`frontend/nginx.conf`), keyed on `CF-Connecting-IP` like the others. **Unchanged** — it is
  path-scoped, and the paths it guards simply widen to include entrant signup/login.
- *Edge + app:* **Cloudflare Turnstile moves to signup**, still **validated server-side** (a
  token only rendered client-side stops nothing, since bots post directly to the endpoint).
  Signup is now the cheapest bot target and the one act with no session behind it. Whether
  submission *also* keeps a challenge is an implementation call for the E1-2 audit; the
  ruling requires it at signup and does not forbid it at submit.
- *App:* **throttles cover both acts, in separate key namespaces.** The engine already exists
  and is already generic: `throttle_record_attempt` takes its budget as parameters precisely
  so different surfaces can share the counting mechanism without sharing a budget
  (`backend/services/auth.py:396-431`; `throttle_check` at `:387-394`). Three namespaces exist
  today — `ip:` (credentials), `reg:` (`registration_key`, `services/auth.py:444`) and
  `entry:` (`entries_key`, `services/auth.py:471`, with `throttle_record_entry` at `:484`) —
  and each has its own settings triple, the entries one at
  `backend/app/config.py:251-253` (`entries_max_per_ip = 20`, `entries_window_seconds = 600`,
  `entries_lock_seconds = 300`). **Entrant signup gets a fourth namespace rather than
  borrowing `reg:`** — for exactly the reason the existing comment gives for keeping `reg:`
  separate from `ip:` (`services/auth.py:447-449`): a flood against one surface must not lock
  a venue out of another. Operator registration and entrant registration are different
  surfaces with different volumes.
- *App:* double opt-in email verification through the existing seam
  (`backend/services/email.py:59`) — now verifying the **account**, not the entry. See §6 for
  what an unverified account may still do.
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
   and at R1 time contained **zero public writes to workspace data**. Adding Entries is a
   deliberate, reviewable edit to that allowlist — which is the point of the gate.
   **R3 status: this happened, and now reverses.** E1 added both `/e/{slug}` and
   `POST /e/{slug}/submit` to `PUBLIC_BY_DESIGN`
   (`products/scheduler/tests/test_auth_surface.py:69`, `:75`). R10 removes the *write* entry
   again and keeps the read. The gate did its job in both directions, which is the argument
   for the gate.

### Q5 — Lifecycle state machine. **Decision: see §6.** Dedup uses the client-supplied key.

Two dedup precedents exist. The solve rail takes a **client-supplied `Idempotency-Key`
header**, never a server-derived hash (`api/solve_jobs.py:102`, `services/solve_jobs.py:165`,
unique index `uq_solve_jobs_idempotency_key`); the command rail uses a client-generated UUID
`id` (`api/commands.py:52`). **Entries uses the solve-rail pattern** — an
`Idempotency-Key` header on submit — because the public client is a form that may be
re-posted on a flaky connection, and Stripe semantics ("return the original, don't create a
second") are exactly right.

That guards retries, and the *mechanism* stays exactly as written.

> **Amended by Q12/R13 (R3) — the key moves up a level.** The `Idempotency-Key` header, its
> replay semantics ("return the original, don't create a second") and its client-supplied
> provenance are all unchanged. What changes is **what it is unique against**. E1 shipped
> `UNIQUE (tournament_id, idempotency_key)` **on the `entries` table** — tenant-scoped by
> ruling D4, because a global lookup on an unauthenticated route is a cross-tenant disclosure
> vector (`backend/database/models.py:1247-1254`; the reasoning is in the `Entry` docstring
> at `:1140-1147`). R13 makes a **submission** the unit of one form act, so the index becomes
> `UNIQUE (tournament_id, idempotency_key)` **on `submissions`** and the column leaves
> `entries` entirely. One re-posted form now replays one submission covering 1–N events
> rather than N independent replays that could half-succeed.
>
> **Ruling D4's tenant scoping survives the move**, and its justification actually weakens
> in a good way: the submit route is no longer unauthenticated (Q13), so the disclosure
> vector is smaller — but the scoping costs nothing and a narrower index is never the wrong
> answer. **Migration posture: additive** — create `submissions` with the index, backfill one
> submission per existing entry, then drop `entries.idempotency_key`.

> **Superseded by Q12 (R2).** R1 paired the idempotency key with a *second*, natural-key
> unique index on `(entry_event_id, lower(contact_email))` to guard "the same human
> submitting twice from two devices". Ruling R7 removes that index: the premise that one
> email means one human is false in this domain. The idempotency-key index survives
> untouched — the two guards were always separate failures, and only one of them was
> mis-specified. See **Q12**.

### Q6 — Doubles/pairs v1. **Decision: nominating entrant + email confirmation, operator-resolved conflicts.**

**In scope.** One submitter enters the pair and names the partner by email. The partner
receives an email carrying an **invite token**; until they accept, the entry sits `pending`
with reason `awaiting_partner`. On acceptance the entry becomes eligible for `confirmed`. If
a named partner is already paired in the same event, **both** entries are flagged and an
operator resolves them — never auto-resolved.

> **Amended by R10 (R3) — the partner link is an invite token, not a capability token.**
> R1's "their own capability link" made the partner's link an authenticator for mutating an
> entry, which is exactly the pattern R10 retires (Q4). The replacement is the one the tree
> already runs for operators: **`invite_links`** (`backend/database/models.py:359-389`) with
> its three-route shape in `backend/api/invites.py` — a **public unauthenticated preview**
> (`GET /invites/{token}`, `api/invites.py:204`, deliberately minimal so a 200 does not leak
> the invitee's address or become an existence oracle — see the `InviteResolveDTO` docstring
> at `:87-98`), and an **acceptance that requires a logged-in principal**
> (`POST /invites/{token}/accept`, `api/invites.py:239`).
>
> Applied to partners, that yields: *preview without an account* (the partner sees "Alex has
> entered you for XD at Wongworks Open" without logging in) → *accept requires an entrant
> account* (sign up or log in, then accept). **The invite drives account creation; it never
> mutates an entry on its own.** That is the difference from a capability link, and it is
> the whole point.
>
> The invite URL follows the same relative-path discipline as the operator invite (`url` is
> `/invite/{token}`, absolutized by the client — `api/invites.py:75`), except that an emailed
> partner invite must be absolute and therefore composes from `public_app_origin`
> (`backend/app/config.py:223`) per invariant I1.
>
> **Consequence for the incumbent comparison, in our favour.** TournamentSoftware requires
> both halves of a doubles pair to submit *and pay* separately (Badminton WA states this
> outright), and Badminton BC's documented practice is typing "I would like to play XD with
> John Doe" into a free-text remarks box. An invite that creates the partner's account and
> attaches them to an existing entry is strictly better than either, and it costs us one
> reuse of machinery that already exists.

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
rather than creating a parallel workstream.

*R1 wrote this section around the awkwardness that "entrants have no account, so every
mechanism that would eventually serve users (delete my account, export my data) does not
reach them". **R10 removes the awkwardness.** The reshape below is the single largest
practical benefit of the reversal, and it is why GDPR appears in Q4's reversal rationale.*

- **Lawful basis:** contract performance for the entry itself (player name, gender, events,
  submitter email); explicit consent for anything optional. Anything resembling health or
  accessibility data is a GDPR special category and stays out of scope for v1 entirely. R12's
  minimization list (§4, Q13) is the operative field policy: what is not collected needs no
  lawful basis.
- **Deletion and export ride the account machinery (R10).** The self-service path is
  "log in → my entries → withdraw-and-erase", and the same login gives account-level export
  and account deletion. This is one mechanism serving both the entry and the person, rather
  than a per-entry link that must be re-issued, re-found and re-hashed. **It supersedes R1's
  "the capability link *is* the erasure path"**, which made the right to erasure contingent
  on the entrant still holding a code shown once on a success page. Still nearly free in E2;
  still expensive retrofitted.
- **Retention still anonymizes entry PII after the event, while accounts persist.** These are
  two different lifetimes and conflating them would be a mistake in both directions. The
  retention field stays on `entry_events` with a documented default (anonymize the *entry's*
  personal fields N days after the event, keeping the aggregate row — six or twelve months is
  the common convention). The **account** is not deleted by retention: it is a live
  relationship the person can use next season, and it is deleted only when the person asks.
  Erasure-on-request must therefore reach both layers.
- **Minors, reshaped by R10.** `SECURITY.md:26` already flags minors' data. The account model
  makes the common case cleaner, not murkier: **accounts are held by submitters, who are
  typically adults**, and the entered players may be children who hold nothing. Guardian
  consent language lives in the director's waiver text (Q11) and covers the *entered players*.
  A **self-entering minor holds an account** — which is exactly what happens on the incumbent
  platform today, whose signup consent checkbox reads "I am at least 16 years old, or as a
  parent / guardian I hereby declare that I consent to the processing of my child's personal
  data for the purpose of creating an account"
  (`https://www.tournamentsoftware.com/user/Signup`, observed 2026-08-07). We are not
  inventing a posture here; we are matching the one the sport already runs on. What remains a
  product/legal call is narrow and stays in §9.

**Verdict:** unchanged in shape. E1/E1-2 are safe as private slices against the operator's own
club. Public launch is blocked on the erasure path and the retention default, both of which
land in E5 — but the erasure path is now a login, which is materially cheaper to build and to
prove.

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

### Q12 (R2, hardened by R3) — Submitter vs player model. **Decision: no natural-key uniqueness; soft duplicate flag; and — since R13 — a mandatory four-level shape.**

*Encodes standing rulings R7 (R2) and **R13** (R3). Supersedes the second half of Q5.*

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
   **→ R13 (R3) calls that later.** Part 3 was a promise; R13 collects on it. See the R3
   subsection at the end of this section — the *shape* becomes mandatory, and part 3's real
   contribution turns out to be that collecting on it is cheap. E1 kept the discipline in
   both the model (`backend/database/models.py:1171-1198`, blocks labelled and un-interleaved)
   and the migration, exactly as specified, which is why the R13 reshape is an additive
   migration rather than an archaeology exercise.

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
account. R1's v1 had **no accounts at all**, so there was no account for uniqueness to attach
to, and copying an index whose semantics come from an account model we deliberately did not
have was exactly the kind of borrowed constraint this section rejects.

> **R3 note — we now have accounts (R10), and the ruling is unchanged.** Uniqueness lives on
> the **account's email** (login identity, Q13), which is precisely where the incumbent puts
> it. It does **not** descend onto the entry: one account legitimately enters the same event
> for several different players. The soft flag stays soft (R13 preserves R7 verbatim). What
> the account actually fixes is the *reason* the index was tempting — "is this the same
> human?" is now answerable for the submitter without a constraint, because the submitter is
> a row rather than a repeated string.

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
trap `models.py:778-784` already documents for solve jobs, which R1 correctly identified and
then walked into from the other side.

**Rejected — a full `entry_players` table in v1.** Correct destination, wrong moment. E1
does not need it, and building the submitter/player join before doubles (E3) exercises the
model would be designing against imagination. Part 3 of the decision is what makes deferring
it safe. **R3: this rejection expires.** R13 makes the destination mandatory now, and the
reason it can be reached now without designing against imagination is that R10 supplied the
missing half — the submitter is a real principal, so the join has something real to join to.

**Kept — `UNIQUE (idempotency_key)`.** Untouched by this ruling. It guards a genuinely
mechanical failure (a form re-posted on a flaky connection) with genuinely mechanical
semantics (return the original, do not create a second). Solve-rail precedent, unchanged.
**R3: kept, and moved up a level** — the unit of a form act is now a *submission* (see the
Q5 amendment).

#### Q12 (R3) — the mandatory submission model (ruling R13)

**Decision.** The four-level shape is no longer split-*ready*; it is **the schema**:

```
entrant account  →  submission  →  entries  →  players
   (who acts)      (one form act)   (one per     (who plays)
                                   event per
                                  player-unit)
```

**What attaches where, and why the boundary is where it is:**

| Level | Carries | Because |
|---|---|---|
| **account** | login identity (email), password hash, verification, optional phone (R12) | the durable person; survives every tournament |
| **submission** | `Idempotency-Key`, regulations acceptance (timestamp **+** version), the **computed fee total** (R14), payment record | these are properties of **one act**, not of one event. A form act covering three events is one agreement, one retry unit and one payment |
| **entry** | event, state, pending reasons, publication opt-out, commit back-reference | one per event **per player-unit** (singles: one player; doubles: a pair) |
| **player** | name, gender, club, birth year, remarks (R12) | the human being entered, who may appear in several entries and may not hold the account |

**The invariant that binds regardless of physical layout:** *player fields are never mixed
into contact/account fields.* R7 stated this as a block discipline inside one row; R13 states
it as a level boundary. It is the same rule and it is why E1's schema comments are worth
preserving as prior art (`backend/database/models.py:1134-1138`, "the block discipline in
this class is load-bearing").

**Left to the E1-2 audit, deliberately (the spec frames, the audit decides):** whether the
player level is its own `entry_players` table or structured, namespaced fields on the entry
row. R13 says the invariant, not the storage. The audit questions are concrete: does a player
need identity across submissions within one tournament (a parent adding a second event for
the same child a week later)? does the commit seam want one roster player per human or one
per entry? Both point at a table; neither is decided here.

**What E1 shipped, and the migration posture.** E1 shipped the R7 *soft* split: one `entries`
row carrying contact block + player block, with `idempotency_key`, `regulations_accepted_at`,
`regulations_version_accepted` and `fee_cents` all **on the entry**
(`backend/database/models.py:1131-1257`). R13 moves the first three up to `submissions` and
re-bases the fee on R14's tiered total. **Posture: additive migration, then a narrowing.**
Create `entrant_accounts`, `submissions` and the player level; backfill one account per
distinct `contact_email`, one submission per existing entry, one player per existing entry;
re-point `entries`; then drop the superseded columns. No entry data is lost and no operator
surface changes — the desk reads entries, and entries still exist.

**Rejected — keep R7's single-row shape and add accounts beside it.** Cheaper by one
migration and wrong in the one place it matters: without a submission level, a 1–N-event form
act has no home for its acceptance record, its retry key or its computed total, so those
either duplicate across N entries (three rows claiming to be "the" fee total) or get
reconstructed by grouping on a timestamp. R13 exists because the multi-event form makes the
act a first-class thing.

**Preserved from R7, explicitly, so nobody re-derives it:** the soft duplicate flag. Same
player name **+** same event across submissions raises an operator-resolved attention flag.
**No hard unique index**, at any level. (E1 demonstrated both halves live — a second child on
one email accepted clean, a repeated name flagged `needs_review`.)

### Q13 (R3) — The entrant account. **Decision: a second principal type through the existing auth machinery.**

*Encodes standing ruling R10. Supersedes the identity half of Q4 and Q12's no-accounts
premise.*

**Decision, in one sentence:** entrants get real accounts, built out of the authentication
machinery ShuttleWorks already runs, with **no org membership, no operator roles**, and
sessions scoped to the public host.

#### 1. What is reused, verified against the tree

Nothing here is new cryptography or a new session design. Every piece already exists and is
already tested:

| Need | Existing mechanism | Location |
|---|---|---|
| Password storage | **Argon2id** via `argon2-cffi`, RFC-9106 defaults | `backend/services/auth.py:36-46` (`PasswordHasher`), `hash_password` `:137`, `verify_password` `:141`; the PHC string lands in a column documented as Argon2id at `backend/database/models.py:926-927` |
| Password policy | **NIST 800-63B**: length only, no composition rules, no rotation | `backend/app/config.py:200-203` (`password_min_length = 8`, `password_max_length = 128`) |
| Session records | opaque random token in the cookie; only its **SHA-256** is stored, so a DB dump cannot be replayed | `AuthSession`, `backend/database/models.py:1009-1039`; `_hash_token` `services/auth.py:281-282`, `create_session` `:285-288` |
| Revocation | a timestamp, not a delete (audit survives) | `AuthSession.revoked_at`, `models.py:1032` |
| Reset flow | SHA-256 of a mailed token, single active token, cleared on use | `users.reset_token_hash` `models.py:930-935`; `services/auth.py:370-381` |
| Throttling | DB-backed, no Redis, per-namespace budgets | `AuthThrottle` `models.py:1042-1062`; engine `services/auth.py:387-431` |
| Email delivery | the existing seam (console in local, SMTP in cloud) | `backend/services/email.py:59` |

**The rule this section is really enforcing:** an entrant account must not become a second,
subtly-different authentication stack. If a mechanism above cannot be reused for entrants,
that is a finding to report, not a licence to write a parallel one.

#### 2. Session scoping to `play.*` — framed honestly against the tree

The ruling requires entrant sessions to be **scoped to the public host** and **not shared**
with the operator console: an entrant session must never authenticate anything on `app.*`,
and an operator session must never authenticate an entrant action.

**The complication, stated plainly: today one FastAPI application serves both hosts.**
`app/main.py` registers the public entries router with no auth dependency
(`app.include_router(entries_public_api.router)`, `backend/app/main.py:377`) and the auth
router (`:384`) and every session-gated router into the *same* app. There is exactly one
session cookie name in the whole system — `settings.session_cookie_name`, default
`sw_session` (`backend/app/config.py:170`) — set at `backend/api/auth.py:83-97`, read at
`backend/app/dependencies.py:73`, and used as the trigger condition for the CSRF middleware
at `backend/app/main.py:250`. So "scoped to `play.*`" is **not** free; it is a design
decision with at least these components:

1. **A separate cookie.** A distinct name (and, with `session_cookie_domain` blank by
   default — `config.py:176` — host-only cookies already keep `app.*` and `play.*` cookie
   jars apart, which is the mechanism doing the real work). `session_cookie_secure` must be
   true in cloud for both (`config.py:174`, enforced by the cloud validator at `:332-335`).
2. **A way for the resolver to know which principal a session denotes.** Two shapes, and the
   spec does not pick: an **audience/kind discriminator on the session row**, or a
   **separate session table** for entrants. The first reuses `AuthSession` wholesale and
   risks a resolver that forgets to check the discriminator (a fail-*open* mistake); the
   second cannot be confused by construction and costs a table.
3. **CSRF coverage.** The middleware at `main.py:248-252` triggers on
   `settings.session_cookie_name in request.cookies` — a **single** name. An entrant cookie
   under a different name would silently fall outside CSRF enforcement. This is a concrete,
   findable defect waiting to happen and the audit must close it explicitly.

**Frame, do not fix.** The choice among these belongs to the E1-2 audit, which can read the
resolver and the middleware rather than reason about them from a spec. What the spec fixes is
the *requirement*: no cookie shared across hosts, no session that authenticates both
principals, and CSRF coverage for whichever cookie carries an authenticated write.

#### 3. Users table vs sibling table — an audit-informed decision the spec frames, not fixes

Both options are live. The spec's job is to name the questions that decide it:

- **Role and tenancy columns.** `users` sits inside a tenancy model — `orgs` /
  `org_members` (`models.py:972-1006`), `tournament_members`, and
  `require_tournament_access` (`backend/app/dependencies.py:95-137`). An entrant has **no org
  and no role**. Reusing `users` means every membership query must be correct for rows that
  will never have a membership, forever.
- **The uniform-404 seam.** `require_tournament_access` answers a uniform 404 to a caller
  with no membership (`dependencies.py:120-124`, with the reasoning in the comment at
  `:115-119`), and `tests/test_tenant_isolation.py` derives every workspace route from
  OpenAPI to enforce it. An entrant principal that can reach a `tournament_id` route must be
  provably outside that seam — or provably inside it and always 404ing. Which is easier to
  prove is a real input to the table decision.
- **Email uniqueness namespace.** `uq_users_email_lower` is a global functional unique index
  (`models.py:943-945`). Sharing the table means a director and an entrant cannot share an
  address; separating the tables means one human may hold two accounts on one address, which
  is a product question (probably fine, possibly confusing) rather than a technical one.
- **Throttle key namespaces.** Whatever is chosen, entrant credentials get their **own**
  namespace (Q4's anti-abuse stack), because `ip:` / `reg:` / `entry:` are already separate
  for exactly this reason (`services/auth.py:447-449`).

**Recorded bias, not a decision:** the questions above lean toward a sibling table, because
three of the four are "make sure the operator machinery never mistakes an entrant for a
member" and a separate table answers that by construction. The audit may find reuse cheaper;
if so it must show how each of the four is closed.

#### 4. Password-based auth is the default

**Decision: password + email verification, matching the incumbent.** `[CONFIRM AT STOP]` —
*this marker stays in the text until the user's recorded sign-off. Noted: at the
2026-08-07 STOP the user let the default stand.*

Grounding: TournamentSoftware is login-name + password with email activation, and **no
code/magic-link auth appears anywhere in its flow** (signup form observed 2026-08-07,
`https://www.tournamentsoftware.com/user/Signup`). Entrants in this sport already have this
mental model. Internally it is also the option with zero new machinery: hashing, policy,
reset and throttling all exist (table in §1 above).

**Rejected — passwordless email-code (magic link / OTP).** Genuinely attractive: nothing to
forget, nothing to reset, no password database, and it collapses "verify your email" and "log
in" into one act. Rejected for v1 on three counts: (a) it makes **every** login depend on
email deliverability, and the transactional-email provider does not exist until program Phase
6 — a login path that fails when DMARC is misconfigured is worse than a password; (b) it is
*more* machinery, not less — a new token table, a new expiry policy, a new enumeration
surface — against an existing password stack that is already tested; (c) it diverges from the
one flow entrants already know. Revisit post-v1 as an **additional** factor, not a
replacement.

#### 5. What entrant accounts explicitly do NOT get

No org, no `org_members` row, no `tournament_members` row, no role, no operator-console
access, no workspace visibility beyond the public projections. An entrant account is a
credential for acting on **their own submissions**, and nothing else. This is the sentence
that keeps the tenancy model from acquiring a second meaning.

#### 6. Consequences for shipped E1 behavior (the deletion list)

- `Entry.manage_token_hash` (`models.py:1181-1184`) — **dropped**.
- The success-page "keep this code" card (`api/entries_public.py:512-517`, token minted at
  `:675`, returned at `:715`) — **deleted**.
- The `POST /e/{slug}/submit` allowlist entry (`tests/test_auth_surface.py:75`) — **removed**;
  the file's preamble sentence "an entrant has no account and never will" (`:38-40`, and its
  restatement inside the allowlist entry itself at `:77`) —
  **rewritten**.
- `entries.contact_name` / `contact_email` / `email_verified_at` (`models.py:1171-1180`) —
  **replaced** by the account link; the *values* are what the account backfill is built from.

**Unaffected, and worth stating:** the operator desk (`backend/api/entries.py`), Seam A
(`backend/services/entries.py`), the entry-page and entry-event config routes
(`api/entries.py:224`, `:301`), the module system (`CLOUD_ONLY_MODULES`,
`backend/database/models.py:622`), and the `GET /e/{slug}` public read.

### Q14 (R3) — Pricing, deadlines and entry policy. **Decision: tiered per-person pricing, a withdrawal deadline of its own, and form-enforced policy the operator can override.**

*Encodes standing ruling R14. Q8's payment-integration boundary is untouched.*

#### 1. Pricing — tiered per person is primary; per-event fee is the fallback

**Decision.** A tournament carries a **fee schedule**: a cumulative price for entering 1, 2,
3, … events (`{"1": 4000, "2": 5500, "3": 6000}` — cents, cumulative *totals*, not
increments). The entry form shows a **running total** as events are selected. Where no
schedule is configured, the existing per-event `entry_events.fee_cents` sums as a fallback.

**Rationale — this is the US club norm, verified.** Mad Town Badminton Open 2026 publishes
early-bird $40 / $55 / $60 / $65 for 1/2/3/4 events (regular $50 / $65 / $70 / $75); Egret
Chicago Championship charges $70 for the first event and $50 for each additional. The
federation idiom is different — CAN-AM San Jose Open is flat per entry but tiered **by
flight** ($50 A flight, $30 all others, max 3 events) — which is why the per-event fallback
survives rather than being deleted: `fee_cents` on `entry_events` already expresses
per-flight pricing exactly.

**Cumulative totals, not per-event increments**, because that is how the prices are
*published*. "$40 / $55 / $60" is a price list a director copies; "$40 then +$15 then +$5" is
a derivation they would have to perform, and get wrong.

**Not modelled in v1, recorded so it is a decision and not an oversight:** stacked mandatory
surcharges (USA Badminton's $15 Technical Official Fee per player; Badminton WA's $17
non-member event membership; Badminton Alberta's membership + licence + entry stack). These
are real and common at sanctioned level. v1 expresses them in `payment_instructions` prose;
a structured surcharge list is an E5 candidate.

#### 2. Payment stays manual in v1, and the instructions are a first-class field

**Decision.** `entry_pages.payment_instructions` — free text, rendered publicly on the entry
page. Zelle / Venmo / "cash at check-in" / a PayPal address, in the director's own words.

**Rationale, and the asymmetry that matters.** TournamentSoftware carries a first-class
`Payment:` field in its tournament Overview block (observed reading "PayPal" on both live
pages examined), and the federation model is strict: *"your entry is not completed if you
haven't made the payment"*. **The US club norm is the opposite.** CAN-AM San Jose Open
publishes PayPal / Zelle / cash at check-in and the rule *"entry fees must be paid before the
start of their 1st match in order to play"*. So an entry must be **complete and valid while
payment is pending, with payment settled at the desk** — which is precisely the posture Q8
already fixed (`awaiting_payment` is a pending-*reason*; payment clears a flag and never
confirms an entry; confirmation is an operator act). R14 changes nothing there; it adds the
prose field that makes the manual path usable in public.

*(One evidence caveat, recorded rather than smoothed: Zelle appears in a primary source;
**Venmo was not verified**. The field is free text, so this costs nothing — but do not write
"Venmo" into product copy as an established norm.)*

#### 3. `withdraws_until` joins `opens_at` / `closes_at`

**Decision.** `entry_events.withdraws_until` — a third first-class datetime, separate from
the entry close.

**Rationale — the incumbent models exactly this, as five separate fields.** A
TournamentSoftware tournament page renders *Entry opens / Closing deadline / **Withdrawal
deadline** / Start tournament / End tournament*, each with an explicit timezone (verified on
the NZ Nationals page; the Dutch-locale Belgian Senior Open page shows the identical
structure: *Inschrijven start / Inschrijving gesloten / **Annuleringsdeadline** / Start
toernooi / Einde toernooi*). Both examples had close and withdrawal set to the *same* instant
— but Badminton Ontario deliberately separates them by a day (registration closes Tuesday
23:59 ET; withdrawals accepted until Wednesday 23:59 ET), which is the evidence that the
two-field model earns its keep. It also matches BWF practice, which Q3 already relies on for
the re-runnable commit seam.

**What it feeds:** E2's withdrawal path and the `COMMITTED_ENTRY_WITHDREW` attention code
(Q9). The software does **not** enforce a refund policy — refund rules ("full refund before
entries close; after close, refund minus a $10 admin charge with a doctor's certificate";
"if your partner withdraws, you get a full refund"; "no refunds after the deadline") are
organiser policy living in the regulations text (Q11), exactly as they do on the incumbent,
which enforces nothing visible here either.

#### 4. Entry policy — form-enforced, desk-overridable

**Decision.** Per tournament: **max events per person**, plus **optional per-discipline
caps**. The entry form enforces both; the operator can override at the desk.

**Rationale.** "Maximum 3 events per player" is standard published prose (CAN-AM; Badminton
WA's flat max). On the incumbent this is enforced by *humans reading a prospectus* — the
research could not verify any in-form eligibility block, and organiser-side rules ("a player
may not jump flight", "semifinalists in a higher flight are auto-removed from the lower
bracket") are applied after the fact. Enforcing it in the form is a genuine improvement.
Making it overridable at the desk is **invariant I4** applied to policy: the software flags
and prevents the accident, the operator decides the exception. A director who lets a
fourth-event entry through on the day must not have to edit a config to do it.

#### 5. Gender enforcement is SOFT (ruling R12, stated here because it is a form behavior)

The form **filters eligible events by gender by default** (MS/WD/XD filtering is the reason
gender is required at all — see §4). An **override path exists**. A mismatch is an
**operator-resolvable attention flag**, never a hard block. This follows the same evidence as
policy above: the incumbent's own enforcement is profile-driven offering plus human
judgement, and **no in-form "you are not eligible" refusal could be verified**. Do not
implement against a claim that the incumbent hard-blocks.

#### 6. The public tournament page — the incumbent's IA, rendered from fields we have

**Decision.** Adopt the incumbent's proven information architecture, because it is proven and
because entrants already read it:

| Block | Fields behind it |
|---|---|
| Fee + payment | fee schedule (§1) + `payment_instructions` (§2) |
| Timeline | `opens_at` → `closes_at` → `withdraws_until` → tournament date, each with timezone |
| Events + entry counts | `entry_events` + a count of published entries per event |
| Organization card | the **org name** (`orgs.name`, `backend/database/models.py:984`) |
| Venue card | *see below — this is the one block with no field behind it* |
| Prominent **Enter** action | the entry flow (login-gated, Q4/Q13) |

**AUDITED FACT — the tree has no venue name or address anywhere.** "Venue" in ShuttleWorks is
**structural scheduling data only**: `courtCount` / `intervalMinutes` / `dayStart` / `dayEnd`,
named as "the structural venue fields" in the config-lock guard
(`backend/api/tournaments.py:697-698`) and surfaced in the operator UI as the "Venue &
schedule" settings tab (`frontend/src/platform/product-shell/workspaceNav.ts:154`). The
`tournaments` table carries no location column, and `TournamentConfig`
(`frontend/src/api/dto.ts:18`) has no venue name, address or location field. The org card
can therefore draw the org name and nothing else.

**Decision on the venue card: add the field, on `entry_pages`.** Two free-text columns —
`venue_name` and `venue_address` — live on `entry_pages` (§4), **not** on `tournaments` and
**not** in the state blob. Three reasons: (a) they are *publication* data whose only consumer
is the public page, which is what `entry_pages` is; (b) putting them in the blob would drag
them past `changed_scheduling_fields`, the fail-closed CONFIG_LOCKED guard that treats
everything non-exempt as scheduling-relevant (`api/tournaments.py:691-703`) — a venue
*address* must never be able to 409 because a schedule is committed; (c) it keeps the
audited fact true, that structural venue data and venue *identity* are different things that
merely share a word.

**Rejected — defer the venue card.** An address is the second thing an entrant looks for
after the date, and "we have no field for it" is not a reason to ship a tournament page
without it when the field costs two nullable text columns on a table this design already
creates.
**Rejected — put it on `tournaments`.** It would be workspace-wide data that only the public
page reads, in the one table whose write path is the most guarded in the product.

---

## 4. Data model sketch

**R3: this section is rewritten, and it supersedes a shipped schema.** Migration
`r2c7e1f4a9b3` created the R2 version of this sketch and it is live in every dev database and
in the demo Postgres. The sketch below is the target; the deltas from what shipped are called
out per table, and the posture is **additive migration then narrowing** except where marked
*rework*.

*Comment-block discipline is retained from the shipped schema (`backend/database/models.py:1131-1257`)
and is load-bearing: a block boundary here is a level boundary in Q12/R13, and additions
belong inside the block that describes them.*

```
entrant_accounts                    -- Q13/R10. NEW. See the framing note below:
                                    -- whether this is a distinct table or rows in
                                    -- `users` is an audit decision, not a spec one.
  id                 uuid PK
  email              text        -- login identity; unique case-insensitively
                                 -- WITHIN the entrant namespace (Q12: uniqueness
                                 -- lives here and NEVER descends onto an entry)
  password_hash      text        -- Argon2id PHC string (services/auth.py:137)
  display_name       text NULL
  email_verified     bool NOT NULL DEFAULT false
  email_verified_at  timestamptz NULL
  -- R12: the ONLY optional contact field. Collected only where the
  -- director turned it on (entry_pages.collect_phone), off by default.
  phone              text NULL
  reset_token_hash   text NULL    -- SHA-256, single active token (users:930-935)
  reset_token_expires_at timestamptz NULL
  created_at / updated_at

  -- No org_id. No role. No tournament_members row. Ever. (Q13 §5.)
  -- Sessions: a `play.*`-scoped cookie, distinct from the operator
  -- session — mechanism framed in Q13 §2, NOT fixed here.

submissions                         -- R13. NEW. One form act, 1-N events.
  tournament_id      FK → tournaments, part of composite PK
  id                 uuid
  account_id         FK → the entrant account that submitted

  -- ---- the act (R13) -------------------------------------------------
  -- These three moved UP from `entries`. They describe ONE agreement,
  -- ONE retry unit and ONE payment — not one per event.
  idempotency_key    text NULL   -- solve-rail semantics; see the index below
  regulations_accepted_at        timestamptz NULL
  regulations_version_accepted   int NULL         -- Q11: what they agreed to

  -- ---- money (R14, Q8 boundary untouched) ----------------------------
  fee_total_cents    int NULL    -- computed at submit from the fee schedule
                                 -- (or summed per-event fallback); the running
                                 -- total the form showed, snapshotted
  fee_basis          json NULL   -- how the total was derived (schedule version
                                 -- + per-event components), so a later dispute
                                 -- is answerable without re-deriving prices
  paid_at            timestamptz NULL
  payment_note       text NULL
  submitted_at / updated_at

  -- D4's tenant scoping SURVIVES the move up a level (Q5 amendment).
  UNIQUE (tournament_id, idempotency_key)           -- NULLs exempt both dialects

entry_players                       -- R13 leaf. PHYSICAL FORM IS AN AUDIT
                                    -- DECISION (own table vs namespaced fields
                                    -- on `entries`) — Q12(R3). The INVARIANT is
                                    -- fixed either way: player fields are NEVER
                                    -- mixed into contact/account fields.
  tournament_id      FK, part of composite PK
  id                 uuid
  account_id         FK → entrant_accounts   -- who may act for this player
  full_name          text        -- R12; published on the public entrant list
  gender             text        -- R12: REQUIRED. Without it MS/WD/XD event
                                 -- filtering is impossible. Enforcement is SOFT
                                 -- (Q14 §5): filters by default, override path
                                 -- exists, mismatch is an attention flag.
  club               text NULL   -- R12: free text, optional. Never validated
                                 -- against a club registry we do not have.
  birth_year         int NULL    -- R5/Q11 plain eligibility field, never a
                                 -- trigger. Collected only where an age-bracketed
                                 -- event requires it.
  remarks            text NULL   -- free-text availability note; see below.
                                 -- Lives HERE, not on the entry: it describes a
                                 -- human's availability, and the commit seam
                                 -- writes it onto a roster PLAYER.
  created_at / updated_at

  -- R12 NEVER-IN-V1 list, recorded as a schema comment because absence is
  -- a decision: no postal address, no federation/member id, no DOB beyond
  -- birth_year-as-eligibility. GDPR minimization governs (Q10).

entry_events
  tournament_id      FK → tournaments, part of composite PK
  id                 uuid
  code               text        -- 'MS','XD1'; maps to Meet PlayerDTO.ranks[] or a bracket event
  discipline         text
  entry_type         text        -- 'singles' | 'doubles'
  bracket_event_id   uuid NULL   -- deliberately UNCONSTRAINED pointer at
                                 -- bracket_events (an unmappable code is skipped
                                 -- and reported; a real FK would cascade)
  cap                int NULL
  fee_cents          int NULL    -- R14: the PER-EVENT FALLBACK, kept. It is how
                                 -- flight-tiered pricing (CAN-AM: $50 A, $30
                                 -- others) is expressed. Unused when the
                                 -- tournament carries a fee schedule.
  gender_constraint  text NULL   -- R12: 'M' | 'F' | 'mixed' | NULL(open).
                                 -- Drives the form's default event filtering.
                                 -- SOFT: never a hard block (Q14 §5).
  opens_at           timestamptz NULL
  closes_at          timestamptz NULL
  withdraws_until    timestamptz NULL  -- R14. SEPARATE from closes_at, because
                                 -- the incumbent models them separately and
                                 -- organisers use the gap (Q14 §3). Feeds E2's
                                 -- withdrawal path and COMMITTED_ENTRY_WITHDREW.
  retention_days     int NULL
  created_at / updated_at

entries                             -- one per EVENT per PLAYER-UNIT (R13)
  tournament_id      FK, part of composite PK
  id                 uuid
  submission_id      FK → submissions     -- the act this entry belongs to
  entry_event_id     FK → entry_events
  entry_player_id    FK → entry_players   -- the player-unit's primary player
  state              text        -- see §6
  pending_reasons    json        -- array of reason codes

  -- ---- doubles (E3) --------------------------------------------------
  partner_entry_id   uuid NULL   -- the paired entry
  partner_invite_id  uuid NULL   -- the INVITE token that will create/attach the
                                 -- partner's account (Q6/R10) — not a capability
                                 -- token, and it never mutates this row by itself
  partner_email      text NULL   -- named before the partner acts

  -- ---- publication ---------------------------------------------------
  list_opt_out       bool NOT NULL DEFAULT false  -- Q4: absent from the public
                                 -- entrant list; still fully entered. RETAINED
                                 -- exactly as shipped.

  -- ---- money / traceability ------------------------------------------
  fee_cents          int NULL    -- this entry's component of the submission
                                 -- total; nullable because tiered pricing prices
                                 -- the PERSON, not the event (Q14 §1)
  committed_player_id text NULL  -- traceability into the roster
  submitted_at / updated_at / withdrawn_at

  -- NO idempotency_key here any more — it lives on `submissions` (Q5/R13).
  -- NO natural-key unique index, at any level. Deliberate, ruled out in Q12
  -- and PRESERVED by R13: shared submitters are legitimate. Duplicate
  -- suspicion (same player name + same event across submissions) is a soft
  -- attention flag an operator resolves.
  INDEX (entry_event_id, entry_player_id)           -- non-unique; powers the flag
  INDEX (submission_id)

entry_pages                         -- the tournament-level public/config row
  tournament_id      PK, FK → tournaments
  slug               text UNIQUE  -- public, discoverable
  is_open            bool
  intro_text         text NULL
  regulations_text   text NULL    -- Q11: the director's own words
  waiver_required    bool NOT NULL DEFAULT false   -- Q11: director discretion
  regulations_version int NOT NULL DEFAULT 1       -- bumps on every text edit

  -- ---- money & payment (R14) -----------------------------------------
  fee_schedule       json NULL    -- {"1":4000,"2":5500,"3":6000} — CUMULATIVE
                                 -- totals in cents by event count, because that
                                 -- is how directors publish them. NULL = fall
                                 -- back to summing entry_events.fee_cents.
  payment_instructions text NULL  -- free text, rendered publicly. Zelle / cash
                                 -- at check-in / a PayPal address. v1 payment is
                                 -- manual; Q8's integration boundary is untouched.

  -- ---- entry policy (R14) --------------------------------------------
  max_events_per_person int NULL  -- form-enforced; operator overrides at the desk
  discipline_caps    json NULL    -- {"XD":1} — optional per-discipline caps,
                                 -- same enforcement posture (I4)

  -- ---- field policy (R12) --------------------------------------------
  collect_phone      bool NOT NULL DEFAULT false   -- director toggle, OFF by
                                 -- default; phone lands on the ACCOUNT, not the
                                 -- entry, because it is submitter contact data

  -- ---- public page identity (R14 §6) ---------------------------------
  -- AUDITED FACT: the tree has NO venue name or address anywhere. "Venue"
  -- is structural scheduling data only (courtCount / intervalMinutes /
  -- dayStart / dayEnd, api/tournaments.py:697-698). These two columns are
  -- the new field the venue card needs, and they live HERE — publication
  -- data, read only by the public page, deliberately outside the state
  -- blob so a venue address can never 409 against CONFIG_LOCKED.
  venue_name         text NULL
  venue_address      text NULL
  created_at / updated_at
```

**Deltas from the shipped schema, per table, with posture:**

| Table | Shipped (`r2c7e1f4a9b3`) | R3 target | Posture |
|---|---|---|---|
| `entrant_accounts` | does not exist | new | **additive**; backfill one account per distinct `entries.contact_email` |
| `submissions` | does not exist | new | **additive**; backfill one submission per existing entry, carrying its `idempotency_key`, acceptance pair and `fee_cents` |
| `entry_players` | player block *inside* `entries` | own level | **additive**; backfill one player per entry from `player_name` / `birth_year` / `remarks`. `gender` has no source and must be backfilled as unknown + flagged — the one genuinely lossy step, and it is the reason R12 makes gender required going forward |
| `entry_events` | no `withdraws_until`, no `gender_constraint` | both added | **additive**, nullable |
| `entries` | contact block, player block, `idempotency_key`, acceptance pair, `manage_token_hash`, `UNIQUE(tournament_id, idempotency_key)` | those columns removed; `submission_id` + `entry_player_id` added | **additive then narrowing** — add and backfill first, drop only after |
| `entry_pages` | slug, is_open, intro, regulations, waiver, version | + fee schedule, payment instructions, policy, `collect_phone`, venue | **additive**, all nullable/defaulted |
| `manage_token_hash` | shipped, minted, returned once | **deleted** | **rework** — Q13 §6 |

**Notes.**

- **The `manage_token_hash` note from R2 is retired.** It read: *"stored hashed, following
  `auth_sessions.token_hash` rather than the display token's plaintext storage — entrant
  tokens are numerous and long-lived, so the stronger precedent wins."* That reasoning was
  correct and E1 implemented it exactly (`backend/database/models.py:1181-1184`). R10 removes
  the column's reason to exist; the *precedent* it established (hash entrant-facing tokens;
  `AuthSession`, not `DisplayToken`) carries forward to the E3 partner invite token.
- All tables cascade from `tournaments` like `display_tokens` and `tournament_members` do —
  except `entrant_accounts`, which is **not** workspace-scoped: an account outlives any one
  tournament, which is the whole point of it.
- **`remarks` — the free-text availability note.** One field, deliberately unstructured:
  "can't play before 6pm Saturday", "sharing a lift with X, please keep us on the same day",
  "leaving at 4". It is carried through the commit seam **onto the roster player**, where it
  sits next to the availability controls the operator already uses (SP-D7's
  `AvailabilityControl` grammar), so the operator can turn a sentence into a real constraint
  in one place instead of hunting through an inbox. This is the §1 differentiator made
  concrete: an entrant's words reach the thing that builds the schedule. It is **not** parsed,
  never inferred from, and never fed to the solver directly — a free-text field that silently
  became a constraint would be the worst kind of automatic decision (I4). It is an operator
  input, presented where the decision is made. **R3 moves it from the entry to the player**,
  because the seam's target is a roster player and three events for one child should not carry
  three copies of one sentence.
- **No `entries` row is ever a module row.** Per Q1's R2 mechanism, the mode filter lives on
  `workspace_modules`, not here: a local-mode deployment hides the Entries *module* but leaves
  inherited entry data intact and readable by a cloud deployment later. Nothing in this schema
  is mode-aware — **including `entrant_accounts`**, which is the one table where the
  temptation would be strongest.

---

## 5. Seams (behavioral contracts)

### Seam A — the commit seam: Entries → Meet | Bracket

**Unchanged by R10–R14. This is the load-bearing survival in the whole amendment:** the seam
that E1 shipped, tested and demoed keeps its contract exactly, so the reshape above is intake
work rather than a rewrite of the thing that touches the roster.

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
- **R3 — traceability gains one hop, and only that.** The seam still reads **entries** and
  still writes `entries.committed_player_id` + `sourceEntryId` on the roster player. What
  changes is that an entry is now reachable *within a submission*, so an operator asking "what
  else came in on this form?" or "was this act paid?" follows `entry → submission → account`
  instead of grouping on a repeated email string. The seam does not read submissions and must
  not start: its unit is and stays the entry.
- **R3 — the player level makes the seam's target more honest.** `remarks` now arrives from
  `entry_players`, which is what the seam was always writing onto (a roster *player*). Live
  finding **F-E1** (§9.3) is untouched by any of this and stays open.

### Seam B — the public-surface seam: entrant → Entries

**R3: the input side is rewritten (R10/R13); the projection and refusal rules survive.**

- **Input:** an **authenticated submission** — a `play.*`-scoped entrant session (Q13), a
  public slug, **1–N event selections each bound to a player** (§4), a regulations
  acknowledgment, and an `Idempotency-Key`. **No Turnstile token here**: the challenge moved
  to signup, which is now the public unauthenticated act (Q4 anti-abuse stack).
- **Guarding, restated so the move is unambiguous:** *Turnstile at signup, session at submit.*
  Throttles cover both, in separate key namespaces.
- **Output:** one `submissions` row plus one `entries` row per selected event, each in
  `pending` (or `unverified` where the account is unverified — §6), plus the account
  verification email whose links are composed from the base-URL setting
  (`public_app_origin`, `backend/app/config.py:223`) per §2A / invariant I1 — never a literal
  hostname.
- **Invariants:** never reveals whether an email is already entered (uniform response) — this
  survived Q12 and survives R13, because a repeat submitter is a *legitimate* act, not a
  detectable collision, and it now additionally applies to **signup**, where email enumeration
  is the classic leak; never returns another entrant's data; the raw tournament UUID never
  appears; a replayed `Idempotency-Key` returns the original **submission** (all its entries)
  rather than creating a second; submission is refused without an acknowledgment, and the
  accepted `regulations_version` is recorded on the submission at that moment, not later;
  the **running fee total shown to the entrant is the total recorded** (`fee_total_cents`),
  never recomputed silently afterwards.
- **Public read (Q4):** the entrant-list projection selects the player's name + event only,
  excludes rows with `list_opt_out`, and exposes no entry state. **Unchanged.**
- **Failure modes:** cap reached → accepted as `waitlisted`, not rejected; event closed →
  uniform 404-shaped refusal; **entry policy exceeded (Q14 §4) → refused in the form with the
  rule stated, never a silent drop, and always overridable at the desk**; **gender mismatch →
  accepted with an attention flag, never refused** (Q14 §5); no session → the login/signup
  path, not a 404; rate limit → 429 from the edge before the app is reached.

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

**R3: the entry states are UNCHANGED.** `unverified → pending → confirmed | rejected |
waitlisted → withdrawn` survives R10–R14 exactly. What R10 adds is an **account dimension**,
and it goes in the **same table** — there is deliberately **no parallel account state
machine**, because two state machines governing one act is how a lifecycle becomes
unreasonable-about.

| Transition | Actor | Account requirement (R3) |
|---|---|---|
| submit → `unverified` | entrant (public, **logged in**) | an account exists; **verification not yet required** — see the note below |
| `unverified` → `pending` | automatic, on **account** email verification | verified account. *R1 read this as verifying the entry's email; R10 makes it the account's — one verification covers every entry that account ever makes* |
| → `waitlisted` | automatic, when the event is at cap | none (an automatic queue position, not an act) |
| pair-conflict flag | automatic | none |
| `pending` → `confirmed` | **operator** | operator session; the entrant's account state is an input to the operator's judgement, never a gate |
| `pending` → `rejected` | **operator** | operator session |
| `waitlisted` → promoted | **operator** | operator session |
| mark paid | **operator** (later: Stripe webhook clears the reason only) | operator session |
| any live state → `withdrawn` | **entrant (logged in, via "my entries")** or operator | **verified account** for the entrant path — this is the transition that used to ride the capability token (Q4/Q13) |
| withdraw-and-**erase** | entrant (logged in) | **verified account**; rides the account machinery (Q10) |
| partner accepts a doubles invite | partner | an account, created or logged into **through the invite** (Q6) |

**Unverified accounts may exist, and — per the E1-2 slice — may submit locally.** E2 adds
verification; until it does, an account that has signed up but not verified can submit, and
its entries sit in `unverified` exactly as the state name says. This is the same posture
ruling D1 took for E1 (submissions landed directly in `pending` because the verification
machinery did not exist yet), applied one slice later to the account rather than the entry.
It is a **slice-ordering** statement, not a permanent design: once E2 ships, `unverified →
pending` is gated on a verified account and nothing else changes.

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

**R3 amendment: E1 is SHIPPED, and a delta slice is inserted after it.** The rulings arrived
after the walking skeleton was implemented, verified, demoed and merged, so the plan gains a
row rather than rewriting one. E1's row below is kept as the historical record it now is.

| Slice | Program phase | Contents | Why here |
|---|---|---|---|
| **E1 — walking skeleton** ✅ **SHIPPED** (2026-08-06, merged `86182af`) | **Phase 5** | Cloud-only. One `entry_event`, singles only, no payment, no partner, no cap. Public slug page → **anonymous Turnstile-guarded** submit → entry row → operator desk list → commit to roster. Rate-limit zone + allowlist entries; page served from a hand-built `HTMLResponse` under `play.*` (ruling D3, no framework — §2A). | **Tested the riskiest assumption first: that a public write can be exposed safely at all**, and that the commit seam survives the `If-Match` blob contract. It did. Everything else is product surface on top of a proven pipe — which is exactly why R10–R14 reshape intake without touching the pipe. |
| **E1-2 — the R3 delta** *(new)* | **Phase 5** (delta) | **Entrant accounts in the pipe** (Q13: signup / login / reset, `play.*`-scoped session, throttle namespace, Turnstile moved to signup) · **the mandatory submission model** (R13: `account → submission → entries → players`, multi-event form, idempotency at submission level) · **R12 fields** (gender required + soft filtering, club, phone behind the director toggle) · **R14 fields** (fee schedule + running total, `payment_instructions`, `withdraws_until`, entry policy, venue) · **token retirement** (`manage_token_hash` dropped, success-page code deleted, the `POST /e/{slug}/submit` allowlist entry removed) · **R11 both-width** acceptance on whatever renders the form. | The rulings supersede a shipped shape. Doing this as a delta over a working pipe is strictly cheaper than doing it as part of E2, because the migration is additive-then-narrowing and every step has a green suite behind it. **Its Phase E record must not be retro-edited** — E1 happened. |
| *(public-site scaffold)* | **Phase 6** | Not an Entries slice: the `play.*` frontend app (framework decision R8 / §2A), design-token import, SEO + unfurl, and the transactional email provider with SPF/DKIM/DMARC. **R11 is a framework criterion here**: candidates are judged on serving **co-equal desktop and mobile layouts** for a **form-heavy** flow (multi-event selection with a running total), not on mobile weight alone. | E2 sends real email to real strangers; the delivery infrastructure has to exist and be *proven* before the lifecycle depends on it. The framework decision waits for E1 so it is judged against a real page. |
| **E2 — lifecycle** | **Phase 7** | **Account email verification + password reset** (R10) · **login-gated "my entries"** with manage / withdraw / **withdraw-and-erase** (R10 — replaces the capability-link manage path) · caps + waitlist, pending-reasons, operator confirm/reject/promote, regulations versions finalized (Q11), entrant-list opt-out honored (Q4), `remarks` through the commit seam, withdrawal against `withdraws_until` (R14). | Erasure is nearly free here and expensive later (Q10) — and R10 makes it cheaper still, because it rides the account rather than a token the entrant must still possess. |
| **E3 — doubles** | **Phase 8** | Partner nomination by email → **invite token** on the `invite_links` precedent → partner signs up or logs in and accepts → pair conflicts as operator-resolved flags. | The incumbent's weakest area; needs E2's email machinery and the account model R10 supplies. |
| **E4 — signals** | **Phase 9** | Phase extension, six attention codes, Hub next-action and Overview integration, plus the public read surfaces on `play.*` (entrant lists, post-close acceptance/reserve lists) and the R14 §6 public tournament page IA. | Needs real entry states to derive from. |
| **E5 — money & compliance** | **Phase 10** | Fee schedule display finalized, manual paid/unpaid at the submission level, retention default + anonymization job (entry PII anonymized; **accounts persist** — Q10), GDPR verification pass covering account deletion **and** export. | Unblocks public launch. |
| *post-v1* | post-program | Stripe Checkout against the Q8 boundary; structured mandatory surcharges (Q14 §1). | — |

Two program phases carry Entries prerequisites and are named here so no slice silently
assumes them: **Phase 2** (deployment on `wongworks.dev`, the hostname split, the I1
base-URL seam and its CI guard) precedes E1, and **Phase 3** (the appearance pass) owns the
attention-code shared constant that E4 consumes — see §9.6.

**Cross-document consequence, flagged not fixed (this spec cannot edit the program):**
`SP-PROGRAM-1.md` lists "entrant accounts" under both **§8 non-goals here** and its own
GLOBAL NON-GOALS, states ruling **R4** as "no entrant accounts", and states invariant **I7**
as "everything on `play.*` is mobile-first". R10 and R11 supersede all four. The program
document is amended in its own pass; this spec records the collision so the two cannot drift
silently.

---

## 8. Non-goals

Payments processing (v1 records and displays only) · partner-search pool ·
~~entrant accounts~~ **(R10: no longer a non-goal — see Q13; entrant accounts are v1)** ·
cross-tournament player registry · Entries for local-only workspaces · seeding automation
from entry data · duplicate-identity merging · refund processing · waitlist lotteries.

**Added as explicit non-goals by R3**, so their absence reads as a decision:

- **Operator capability for entrants.** An entrant account never gets an org, a role, a
  membership row, or console access (Q13 §5).
- **Passwordless / magic-link authentication.** Rejected for v1 in Q13 §4; revisitable
  post-v1 as an *additional* factor, never as the only one.
- **Structured mandatory surcharges** (technical-official fees, insurance/event membership,
  licence stacking). Real and common at sanctioned level; expressed as prose in
  `payment_instructions` for v1 (Q14 §1).
- **Automated refund policy.** `withdraws_until` is a deadline, not a refund engine; refund
  rules stay organiser prose in the regulations text (Q14 §3), exactly as on the incumbent.
- **Hard eligibility blocking.** Gender and entry policy are enforced softly, at the form,
  with an operator override (Q14 §4–5, invariant I4).
- **Federation/member-ID identity.** The incumbent anchors identity on a federation Member ID
  (Badminton Scotland verifies Member ID + DOB + competing gender against JustGo). We
  deliberately do not collect one (R12), which means we also do not inherit its verification
  problem — or its ability to bind to ranking points. That is a real capability we are
  choosing not to have.

---

## 9. Open questions for implementing agents

1. **All styling and visual design** — the public entry page is the first ShuttleWorks
   surface a non-operator ever sees; it is not an operator console and should not inherit
   the dense control-plane grammar uncritically. §2A settles the *architecture* of this
   (separate frontend, shared design tokens, framework decided in Phase 6); the visual
   language itself remains open. **R3 narrows it by one constraint, not more:** R11 fixes the
   *posture* (co-equal desktop and mobile layouts, no horizontal scrolling, no degraded
   functionality at either width) and leaves the language open.
2. **Minors / guardian consent** — **narrowed by Q11 (R2) and again by R10 (R3), not
   closed.** The mechanism question was answered in R2: guardian language lives in the
   director's waiver text, and birth year is a plain eligibility field. R10 answers the second
   half: **accounts are held by submitters, typically adults**, the waiver's guardian language
   covers the entered players, and a self-entering minor holds an account exactly as they do
   on the incumbent (whose signup consent checkbox says so in as many words). What remains
   open is narrow: whether *we* need anything beyond that — an age-attestation checkbox at
   signup, say — for under-16 account holders in the jurisdictions the product actually
   operates in. Product/legal call, blocks E5 (Phase 10), not E1-2.
3. **Whether `entry_events.code` → Meet `ranks[]` is the right mapping in practice**, or
   whether Meet needs a thin events concept sooner than Q2 assumes. **STAYS OPEN, and E1's
   live run answered the sharp end of it concretely (finding F-E1).** `rankCounts: {MS: 3}`
   declares *slots* MS1/MS2/MS3, but the seam maps every entrant of event `MS1` onto the
   **same slot in the same seam-created group**, so the roster UI's normalization stripped
   `ranks` from the 2nd and 3rd players on its next autosave. Entry events map onto a
   **division** (MS), not a **slot** (MS1); the seam needs either slot assignment or a
   division-level mapping. **Do not patch this ad hoc.** Untouched by R10–R14 — the rulings
   reshape intake, and this is a Seam A mapping question. Design input to E2/Phase 7.
4. Whether the Entries desk is its own nav section or a tab within an existing one.
5. Exact `ENTRIES_CLOSING_SOON` threshold and whether it is per-workspace configurable.
6. ~~Whether to promote attention codes to a shared constant now (see Q9) or log it as
   debt.~~ **RESOLVED (R2): promote, in program Phase 3.** Not debt. The codes are bare
   string literals at their backend construction sites
   (`api/workspace_signals.py:368-380`, with the vocabulary re-stated in a docstring at
   `workspace_signals.py:89`) and are hand-mirrored on the frontend — since SP-UI-1 in *two*
   places, `platform/domain/setupChecklist.ts:58` (`REASON_ACTION`) and a literal comparison
   in `products/workspace/overview/PhasePanels.tsx:92`. E4 (Phase 9) adds six more codes,
   doubling the vocabulary across three hand-maintained mirrors, and Phase 3 is already
   editing exactly these surfaces. Doing it there is a rename inside files that are open;
   doing it in Phase 9 is a rename plus six new codes plus a redesign, all at once. The
   promotion is therefore **assigned to program Phase 3 scope** (recorded in
   `SP-PROGRAM-1.md` Phase 3 amendment (a)), and E4 consumes the constant rather than
   creating it.
7. **(R3) Where entrant accounts are stored: rows in `users`, or a sibling table.** The one
   question R10 genuinely leaves open — the ruling calls it "an audit-informed implementation
   decision the spec FRAMES, not fixes", and Q13 §3 frames it: role/org columns that an
   entrant will never fill, the uniform-404 seam and its OpenAPI-derived test, the global
   `uq_users_email_lower` namespace, and throttle key namespacing. **Assigned to the SP-E1-2
   audit**, which can read the resolver and the CSRF middleware rather than reason about them
   from a spec. Q13 §3 records a bias toward a sibling table and the burden of proof if the
   audit chooses reuse. Related and *not* a separate question: the session-scoping mechanism
   (Q13 §2) is decided by the same audit, and its CSRF-coverage trap is named there.

*No other open question is added. R10–R14 are decisions, and a ruling that leaves a question
behind says so — this one does; the other four do not.* The `[CONFIRM AT STOP]` marker on
password-vs-passwordless (Q13 §4) is a **sign-off item**, not an open design question: the
default is decided and the user let it stand on 2026-08-07; the marker stays in the text until
the sign-off is recorded.

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
| 9 | R1's Q9: attention codes are "mirrored by hand in `products/hub/nextAction.ts:7-11`" | **Stale as of SP-UI-1.** `nextAction.ts` now imports `REASON_ACTION` from `platform/domain/setupChecklist.ts:58`, and a *third* hand-written mirror appeared at `products/workspace/overview/PhasePanels.tsx:92` (a literal `'NO_MODULES_ENABLED'` comparison). Three mirrors, not two — which strengthens §9.6's resolution rather than weakening it. |
| 10 | Program I1 assumes absolute URLs are generated "wherever they are generated today" | **They are not generated at all today.** `app/config.py` has no base-URL setting, and no backend module composes an absolute product URL — the invite route deliberately returns a *relative* path for the frontend to absolutize (`api/invites.py:75`). I1 is therefore a greenfield seam introduced in program Phase 2, not a refactor of existing call sites. Good news, recorded so nobody goes hunting for the call sites. |
| 11 | R6 assumed the read-path filter might be awkward enough to STOP | **It is not.** All module reads funnel through `_LocalModuleRepo` and there are exactly two queries to filter (`repositories/local.py:1441-1448` and the batched select at `1428-1432`); the settings read sits in a layer that already depends on settings transitively (`database/session.py:20`). Full mechanism in Q1 (R2). The one non-obvious trap: `ensure_modules_for` does **not** route through `_rows_for`, so filtering only `_rows_for` would leave the Hub list path leaking the module. |

### Added by the SP-ENTRIES-R3 pass (2026-08-07)

**This block is different in kind from the two above.** Items 1–11 are corrections to a
*brief* — places where a document described a tree that did not exist. Items 12–19 record
where **this spec described a design that has since shipped**, and a user ruling then
superseded the shipped thing. Both are inheritance, but the second kind carries a migration
cost, so each row names it.

| # | Claim as stated (in R1/R2 text) | What is true after R3 | Cost |
|---|---|---|---|
| 12 | **R4 / Q4: "no entrant accounts in v1"** — identity is verified email plus a per-entrant capability token | **Reversed by ruling R10.** Entrants get accounts: a second principal type through the existing auth machinery, no org and no roles, sessions scoped to `play.*`. R4's original reasoning is preserved verbatim in Q4 as a rejected alternative, with the reversal rationale (industry alignment — the incumbent is account-*mandatory* with a thin signup; GDPR simplification; manage-path UX; R13 needs a durable submitter). **This is the largest single reversal in the program to date.** | **rework** |
| 13 | §4: `entries.manage_token_hash`; the raw token returned once on the success page | **Shipped exactly as specified** (`backend/database/models.py:1181-1184`; success card `api/entries_public.py:512-517`, minted `:675`, returned `:715`) — **and R10 deletes the path.** The *precedent* survives: entrant-facing tokens hash like `AuthSession`, not like `DisplayToken`, and E3's partner invite inherits it. | **rework** |
| 14 | §4 / ruling D4: `UNIQUE (tournament_id, idempotency_key)` **on `entries`** | **Moves to `submissions`** (R13). Mechanism, semantics and provenance unchanged; the *unit* changes from one entry to one form act. D4's tenant scoping survives the move and its justification weakens harmlessly — the submit route is no longer unauthenticated. | **additive → narrowing** |
| 15 | Q12 part 3: the entries row is *shaped for* a later contact/player split | **R13 collects.** The shape becomes mandatory: `account → submission → entries → players`. R7's block discipline was implemented faithfully in both model and migration, which is exactly why collecting is an additive migration rather than archaeology. The leaf's physical form (own table vs namespaced fields) is left to the E1-2 audit; the never-mixed invariant binds either way. | **additive → narrowing** |
| 16 | §2A / program I7: "`play.*` is mobile-first and stays mobile-first"; E1's "usable at 390px — that is the bar" | **Replaced by R11:** desktop and mobile are **co-equal first-class layouts**; the bar is "no horizontal scrolling and no degraded functionality at either width". The E1 page (`api/entries_public.py:291`, `:298`) is throwaway by design, so this lands as a Phase 6 acceptance criterion, not a retrofit. I7's operator-console half is untouched. | **rework, cheap** |
| 17 | `tests/test_auth_surface.py` "contains zero public writes to workspace data" (R1) → E1 added two allowlist entries and a preamble stating "an entrant has no account and never will" | **Both directions are now history.** `PUBLIC_BY_DESIGN` (`products/scheduler/tests/test_auth_surface.py:52`) gained `GET /e/{slug}` (`:69`) and `POST /e/{slug}/submit` (`:75`). R10 removes the **write** entry and rewrites the preamble (`:38-40`) and the entry's own text (`:77`); the **read** entry stays. Editing a passing test is sanctioned here precisely because a user ruling superseded the behavior it pins. | **rework** |
| 18 | R14 §6 assumed the public tournament page could render the incumbent's IA "from fields we have" | **Partly false, and audited.** Fee, timeline, events, org name and the Enter action all have fields. **The tree has no venue name or address anywhere** — `tournaments` has no location column, `TournamentConfig` (`frontend/src/api/dto.ts:18`) has none, and "venue" in this codebase means `courtCount` / `intervalMinutes` / `dayStart` / `dayEnd` (`backend/api/tournaments.py:697-698`). **Decision: add `venue_name` + `venue_address` to `entry_pages`** (Q14 §6) — publication data, outside the state blob, so it can never 409 against the fail-closed CONFIG_LOCKED guard (`api/tournaments.py:691-703`). Not deferred. | **additive** |
| 19 | Q1 (R2): the cloud-mode predicate is `settings.environment == "cloud"` | **Stale, and it was stale before it shipped.** Ruling D2 (SP-E1-1 Phase A) changed it to `settings.auth_mode == "cloud"` because `docker-compose.cloud.yml` deliberately sets `ENVIRONMENT=local`; the shipped helper is `cloud_modules_enabled()` (`backend/app/config.py:368-386`). D2 said the spec would get an amendment paragraph; it never did. Written into Q1 by this pass. Nothing to do with R10–R14 — recorded here because a reader following the spec's stated mechanism would build the wrong predicate. |

**Two research-sourced corrections to assumptions this spec has carried since R1**, recorded
because they change what "match the incumbent" means:

| # | Assumption | What the research found |
|---|---|---|
| 20 | The incumbent collects rich profile data at signup | **No.** TournamentSoftware's signup form asks for name, sport, a separate login name, email, password and one consent checkbox — **gender, DOB, club and address are not on it** (`https://www.tournamentsoftware.com/user/Signup`, observed 2026-08-07). They are profile fields completed afterward, and federation guides describe a **profile-completeness gate before you can enter**. Our R12 field policy is closer to their *signup* than to their *profile*, deliberately. |
| 21 | The incumbent enforces eligibility in the entry form | **Unverified, and probably not.** Age categories are *published*; the events grid is structured category × discipline; but the enforcement that could be evidenced is profile-driven *offering* plus organiser rules in a prospectus applied by humans ("maximum 3 events per player", "a player may not jump flight"). **No in-form "you are not eligible" refusal could be observed.** Do not spec against a claim that the incumbent hard-blocks — which is one reason Q14 makes our own enforcement soft. |

---

## See also

- `docs/programs/SP-PROGRAM-1.md` — the master program: standing rulings R1–R14 (all encoded
  here; **R10 supersedes R4** and **R11 amends invariant I7**), program invariants I1–I8, and
  the phase table §7 maps onto
- `docs/programs/SP-E1-1.md` — the EXECUTED E1 prompt and its Phase A STOP rulings D1–D4.
  History: its record is never retro-edited, and R10–R14 supersede parts of what it shipped
- ADR 0001 — four-module split (the Tier-1/Tier-2 criterion Q1 turns on)
- ADR 0005 — `coming_soon` elimination (the actionability principle Q1 preserves)
- `docs/programs/ENTRIES_PROGRESS.md` — the SP-ENTRIES ledger
- `docs/audits/debt-log.md:481` — the GDPR pre-launch item Q10 extends
