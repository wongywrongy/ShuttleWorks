# Entries

**Tier-1, user-enableable, and the only module that is cloud-only.** Entries is the intake
module: it turns what the public submitted on the [entrant tier](/architecture/entrant-tier) into
roster players, under an operator's hand. It shipped in SP-PROGRAM-1 Phase 5 (E1, 2026-08-06) and
was reshaped by the R13 submission model in the E1-2 delta slice (2026-08-07).

This page is for engineers. It covers what Entries owns, the commit seam into the roster, and the
lifecycle scope that is deliberately not built yet.

## What it does

- Gives the operator a single surface, the **Entries desk** (`entries` segment,
  `products/entries/EntriesDesk.tsx`), showing what the public form produced.
- Lets an operator **confirm** a pending entry. That is the *only* lifecycle transition E1 ships;
  reject / promote / withdraw are E2 and their absence is asserted by a colocated test so the
  scope line stays visible rather than eroding.
- Runs the **commit seam** on demand, reporting per-entry what happened.
- Holds the public page's configuration: `entry_pages` (slug, venue, fee schedule, regulations
  text and version, `opens_at` / `closes_at` / `withdraws_until`, `payment_instructions`) and
  `entry_events` (the categories a person can enter).

Rows on the desk are **banded by the submission they arrived on** (ruling R13). One form covering
two children and four events is one agreement, one total, and one person to write to; the address
and the act's fee total sit on the band, once, rather than on every row.

::: info The desk shows full contact data. That is deliberate.
The *public* entrant list is a strict projection — names and event ids only, opt-outs excluded, no
contact data selected in the SQL. The desk is its opposite number: the operator is the person who
has to write back about a clash, and the entrant's free-text `remarks` sit here precisely so the
sentence reaches whoever is building the schedule.
:::

## What it owns

| Kind | Owned |
| --- | --- |
| **Nav surfaces** | Entries (`entries`) — declared in `entriesContract.ownedSegments` |
| **Backend routes** | `GET /tournaments/{id}/entries` (desk projection) · `POST …/entries/{entry_id}/confirm` · `POST …/entries/commit` (the seam) · `PUT …/entry-page` · `POST …/entry-events` — all `require_tournament_access`-gated, operator role for the writes |
| **`apiClient` methods** | `listEntries`, `confirmEntry`, `commitEntries` |
| **Public data plane** | `/e/api/*` and `/e/account/*` — the unauthenticated JSON the entrant tier reads and the browser posts to. Documented in [API reference](/api/#entries-the-public-entrant-surface) |
| **Tables** | `entry_pages`, `entry_events`, `submissions`, `entries`, `entry_players`, `entrant_accounts`, `entrant_sessions` |

`produces: ['PlayerDTO']` (via the commit seam, into the Meet roster blob) and
`consumes: ['EntryDTO', 'EntryCommitResultDTO']`, pinned in
`platform/contracts/moduleContract.ts` against its colocated test — see
[Module contracts](/contracts/).

## The commit seam

`POST /tournaments/{id}/entries/commit` → `services/entries.py::commit_entries`. In one sentence:
**every `confirmed` entry with no `committed_player_id` becomes a roster player, exactly once,
without disturbing anything already there.**

::: warning Two different things are called "Seam A"
This site letters the *module-contract* seams A–D, where **A is Meet → Operations**
(`scheduleFinalized`). The Entries design spec letters its own seams independently, and calls this
one **Seam A** too. They are unrelated. On this site the Entries edge is always the **commit
seam**, and its `SeamEdge` name is **`entriesCommitted`** — that string is the unambiguous one.
:::

Four properties are worth knowing before you change anything in that module:

- **It is re-runnable, not one-shot.** BWF separates the entry deadline from the withdrawal
  deadline, and directors handle late entries as routine work. A one-shot commit would push them
  straight back to hand-editing the roster, which is the workflow Entries exists to remove.
  Re-running is normal operation, so idempotency is a correctness requirement, not a nicety.
- **It refuses instead of guessing.** An entry whose `entry_events.code` has no meaning in this
  workspace is skipped and *reported*, never mapped onto the nearest-looking thing. Same for a
  bracket entry pointing at a draw that is already generated or started. This is invariant **I4**:
  software flags, operators decide.
- **Partial success is the expected shape, not an error path.** The result is
  `{committed: [{id, playerId}], skipped: [{id, reason}]}` — never a wholesale rollback. The desk
  *renders* that summary rather than toasting it, because a list of things an operator must go and
  fix is not a six-second notification.
- **Commit order becomes roster order**, so candidates are read oldest-submission-first with `id`
  as the tiebreaker (`submitted_at` alone ties non-deterministically across SQLite and Postgres —
  the house rule for every list query).

::: warning A roster row is a *human*, not an entry
The roster id is derived from `entry_player_id`, not from the entry. An entry is one event for one
person, so keying on it produced one roster row per (person × event) — a bracket roster reading
"42 players" for 23 people, and a public entrant list naming someone once per event they entered
(fixed 2026-08-10, `fc26f5a`). A person's second event now attaches to the row their first one
created: on Meet it extends that player's `ranks[]`, on Bracket the one shared participant id goes
into every draw they entered. `_adoptable` matches either the deterministic id **or** the row's
`sourceEntryId`, so a roster written by the older build is adopted rather than duplicated, and
existing ranks are never removed — an operator's own edits to a row are not this seam's to undo.
:::

The seam routes to `_commit_meet` or `_commit_bracket` on the workspace `kind`. The meet path
writes the roster blob through a compare-and-swap that is **weaker than it looks**: `upsert_data`
re-reads through `session.get`, which answers from the identity map, and `SessionLocal` sets
`expire_on_commit=False` — so a competing write from another session is invisible unless the
caller expires its own snapshot first. Hence `_expire` being called twice per attempt. Removing
either call does not fail loudly; it fails as a lost update. It is characterized, with a negative
control, in `tests/test_concurrent_state_writes.py`.

## The entry lifecycle (and what is not built)

`Entry.state` carries the spec §6 vocabulary, but E1 walks only a short path of it:

| State | Status today |
| --- | --- |
| `pending` | where every E1 submission lands (ruling D1), with `pending_reasons` as a JSON list |
| `confirmed` | the operator's one transition, and the **only** committable state |
| `unverified` | in the vocabulary, **never entered** — its only exit is the email-verification transition, which is E2 (Phase 7) |
| `rejected`, `withdrawn`, waitlist promotion | **not built.** E2 |

A post-commit withdrawal will raise a `COMMITTED_ENTRY_WITHDREW` attention flag rather than
mutating the roster behind the operator's back (ruling R3).

**No natural-key uniqueness exists at any level**, deliberately: one parent enters two children,
one club rep enters eight players. Duplicate *suspicion* — same event, same player name, across
submissions — is a soft attention flag an operator resolves, powered by the non-unique
`ix_entries_event_player`. The one surviving uniqueness in this family is the **submission's
idempotency key**, which guards a mechanical retry rather than a human judgement.

## Cloud-only, and why the event day is not

Entries is the one module that cannot run in local mode. Enabling it in local mode answers
**`409 MODULE_REQUIRES_CLOUD`** (`api/workspace_modules.py`), the mode-aware seed omits the row,
and a workspace restored from cloud into local has the inherited row filtered at read time
(ruling R6).

That does not compromise the offline guarantee, because of invariant **I3**: **the cloud dependency
ends at commit.** Once entries are committed they are roster players in the workspace blob like any
other, and nothing on event day reads an entry row. A venue with no internet runs the tournament
exactly as it would have. See [Data flow](/architecture/data-flow) and
[ADR 0003](/decisions/0003-sqlite-as-primary-persistence).

## Money

Fees are displayed and totalled; **no payment is taken**. `POST /e/api/quote/{slug}` (the running
total on the entry form) and `POST /e/api/submit/{slug}` (the recorded charge) share one
`compute_fee_total` in Python, so a quote cannot diverge from what is stored. The entrant tier is
forbidden from reimplementing the arithmetic, and that is enforced by a source scan
(`entrant/tests/noClientFeeRules.test.ts`) rather than left to review. Payment instructions are the
organiser's own free text; Stripe is explicitly post-program.

**No currency is recorded anywhere in the data.** Amounts render bare, and the renderer refuses to
invent a symbol. An open proposal would add one nullable ISO-4217 field.

## Known gaps

- **Finding F-E1** is open: an entry event maps onto a Meet **division**, not a rank slot. Tracked
  in the program ledger and deliberately not patched ad hoc.
- **Email does not exist.** Phase 6 step 3 (transactional email provider, SPF/DKIM/DMARC) was
  deferred entirely, which is why `unverified` is unreachable and password reset is unavailable to
  entrants.
- **No operator surface for entry-page configuration.** The routes exist (`PUT …/entry-page`,
  `POST …/entry-events`); the UI to drive them is not part of the desk.

## See also

- [Entrant tier](/architecture/entrant-tier) — the public app that produces what this desk consumes
- [API reference → Entries](/api/#entries-the-public-entrant-surface) — the public route table
- [Module contracts](/contracts/) — where `entriesCommitted` is declared and pinned
- [Meet](/modules/meet) · [Bracket](/modules/bracket) — the two roster shapes the seam writes into
- [Workspace model](/architecture/workspace-model) — module rows, seeding, and the cloud-only guard
- [Progress reports](/progress/) — the program that built it, phase by phase
