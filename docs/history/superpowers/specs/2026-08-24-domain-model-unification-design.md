# SP-DM-1 — Domain-Model Unification Design

**Date:** 2026-08-24 · **Pinned SHA:** `e67633fe` · **Companion:** `docs/history/audits/2026-08-24-domain-model-audit.md` (the `F-DM-01..77` register; every `F-DM-*` below resolves there, with its evidence — this document points, it does not restate)
**Plan:** `docs/history/superpowers/plans/2026-08-24-sp-dm-1-domain-model-audit.md` — the verbatim SP-DM-1 prompt is its Appendix A (§1 = the target hierarchy, §3 = the constraints on this plan).

Deliverable 2 of 3. **Documents only — this spec authorizes no code.** Kyle rules on `R-DM-*` (§3) before any implementation prompt is written.

Paths are plain code spans, not doc links, so this page never trips the dead-link gate.

**Two id series are in play and must not be confused.** `DV-1..DV-9` are **this document's** deviations from Kyle's diagram (§1.2). `D3`/`D7`/`D8`/`D-A2` wherever they appear are **foreign** ids — the debt-log, or the census artifact — and are always qualified at the point of use.

---

## 1. Target model

### 1.1 The hierarchy (Appendix A §1, copied faithfully; annotations added)

```
Account (auth principal, entrant)                 [entries · entrant_accounts.id UUID · GLOBAL]
 └─ PlayerProfile (public identity + history)     [—  NO REPRESENTATION · owner-supply · DV-3]
     └─ TournamentPlayer (person-in-tournament)   [entries · entry_players.(tournament_id, id) · RULED]
         └─ EventEntry (participation in one event,
             incl. partner linkage for doubles)   [entries · entries.(tournament_id, id)]
             └─ Match participation (sides/slots) [bracket: participant id in a slot blob
                                                   meet:    roster id in data["matches"].sideA]

Tournament (workspace)                            [workspaces · tournaments.id UUID]
 └─ Event (e.g. "A Men's Doubles")                [bracket: bracket_events.(tournament_id, id=CODE)
                                                   meet:    NO ENTITY · DV-4
                                                   entries: entry_events.(tournament_id, id) UUID]
     └─ Draw (RR pool / elimination bracket)      [bracket: FUSED INTO Event · DV-5
                                                   meet:    NO ENTITY · DV-4]
         └─ Match                                 [bracket: bracket_matches · meet: 3 records · DV-6]

The one join:  EventEntry ↔ Draw slot
  today   entries.committed_player_id : String → f"entry-{entry_player_id}" → a JSON slot   (F-DM-05)
  target  a key-bearing, FK-bearing link                                                    (R-DM-2)
```

**Owning module** is the API package (`apps/api/src/<domain>/`) that owns the writes. **Key** is the identifying key as it physically exists at the pinned SHA.

### 1.2 Forced deviations from Kyle's diagram

Each deviates only because a finding or a standing ruling forces it. Nothing else deviates.

| # | Deviation | Forced by |
|---|---|---|
| **DV-1** | **Two Account namespaces, not one.** Operator = `users`, entrant = `entrant_accounts`; entrant membership in a workspace is structurally unrepresentable because the membership FKs point at `users`. Deliberate and reasoned, not drift. | F-DM-74; R10 (`SP-PROGRAM-1.md:44-112`) |
| **DV-2** | **Submission sits beside the spine, not on it.** Kyle's chain has no Submission; R13's shipped chain does, and idempotency key / regulations acceptance / fee snapshot attach to it. The target keeps R13 verbatim: Submission is an *act* linking one Account to 1–N EventEntries, not a level of the person hierarchy. | R13 (`docs/reference/modules/entries.md:9-26`); F-DM-63 |
| **DV-3** | **PlayerProfile has no representation at any layer** (F-DM-17). R15 / "profile v1" has **no ruling text anywhere in the tree** — an owner-supply input, never a citation. Drawn dashed until R-DM-3. | F-DM-17; `citations-pack.md` §6 |
| **DV-4** | **Meet has neither an Event nor a Draw entity** (F-DM-23, F-DM-33). The target cannot draw one Event box per workspace — it draws one per engine. | F-DM-23 (= debt-log D8 / F-E1, cite `2026-08-06-entries-design.md:1721-1729`), F-DM-33 |
| **DV-5** | **Bracket fuses Event and Draw into one row**, and its key is the mutable discipline code (F-DM-57, audit conflicts C-1/C-2). Splitting them is R-DM-11, not a given. | F-DM-57; audit §3.9 |
| **DV-6** | **The Match layer stays non-merged, per ADR 0006** (`:53-59`: a shared match/score value object "would be dead, ornamental code"). The target's cross-engine join is the existing `matchKey = ${source}:${id}` + `NextMatchDTO.source`, one adapter pair (ADR 0009) — copy it, do not invent a match entity. Meet additionally stores one match as three records + a blob (F-DM-22). | ADR 0006, ADR 0009, F-DM-67, F-DM-22 |
| **DV-7** | **One workspace hosts exactly one engine** — `tournaments.kind` branches once at the commit seam, and two live answers to "which engine" coexist (F-DM-34). | F-DM-34; audit §4.3 |
| **DV-8** | **The Meet roster is a blob, not a table** (F-DM-05, F-DM-38). Every Meet person box in the target is a blob entry until R-DM-2 / R-DM-8 land. | F-DM-05, F-DM-38; census §3.4 |
| **DV-9** | **Vocabulary is fenced, not renamed.** The target says *workspace* in prose and keeps `tournaments`/`tournament_id`/`tournamentStore` in code. `entry_players` **is not renamed** to `tournament_players`: the ≙ is recorded here and in `docs/reference/`, at zero migration cost. | ADR 0014 (`0014-workspace-vs-tournament-vocabulary.md:37` — "Fence it. Do not rename anything.") |

### 1.3 Every existing table mapped onto the target

26 tables (`grep -n "__tablename__" apps/api/src/db/models.py`). "Out of model" = infrastructure/tenancy, correctly outside the domain hierarchy — one row each, not forced onto the diagram.

| Table | Target entity | Key | Note |
|---|---|---|---|
| `entrant_accounts` | **Account (entrant)** | `id` UUID, **global** | The only global person record in the tree. Not workspace-scoped — deliberate and ruled (census id `D-A2`, audit §3.3). |
| `users` | **Account (operator)** | `id` UUID | Separate namespace by design — DV-1. |
| — | **PlayerProfile** | — | **Absent — verified.** Owner-supply, R-DM-3. DV-3. |
| `entry_players` | **TournamentPlayer** ✅ | `(tournament_id, id)` | **`entry_players ≙ TournamentPlayer` — yes, with caveats.** Ruled: `SP-P7-phase0-audit.md:64-76` — it **is** the stable person-in-tournament identity; `person_key = entry_player_id`, never the name. **Caveats (all ruled or filed, none new):** (a) hand-added roster players and bracket participants have no `entry_player` row → link to a player page only when resolvable, else plain text (F-DM-19); (b) minting is *deliberately* conservative, so one human can legitimately hold several rows (F-DM-01/02, ruled 2026-08-23 — R-DM-1 covers only what that ruling left open); (c) its link into competition is a formatted string, not a key (F-DM-05 — R-DM-2). No rename (DV-9). |
| `submissions` | **Submission** (beside the spine) | `(tournament_id, id)` | R13. Idempotency/fee/acceptance live here — DV-2. |
| `entries` | **EventEntry** | `(tournament_id, id)` | Doubles linkage = `partner_entry_id`, FK-less, mutual by convention (F-DM-12). |
| `entry_events` | **Event (Entries' copy)** | `(tournament_id, id)` UUID + `code` | Entries-owned; optional `bracket_event_id`, **FK-less by ruling R2**. |
| `entry_pages` | **publication surface** | `slug` | The public tier's only workspace key (F-DM-76). |
| `tournaments` | **Tournament (workspace)** | `id` UUID | Plus `data` = the Meet domain blob — DV-8. |
| `tournaments.data["players"]` | Meet roster (person) | `entry-{entry_player_id}` or a UUID | **Blob, not a table** — DV-8. |
| `tournaments.data["bracketPlayers"]` | Bracket roster (person) | `playerSlug()` output | A *bracket* roster inside the *meet* blob (F-DM-38). |
| `bracket_participants` | **Match-participation unit** (person **or** pair) | `(tournament_id, id String(100))` | Id is a name slug, or `entry-{…}` from the seam; no FK to any person (F-DM-04). `member_ids` JSON = the only storage pair. |
| `bracket_events` | **Event + Draw, fused** | `(tournament_id, id = the code)` | DV-5. |
| `bracket_matches` | **Match (bracket)** | `(tournament_id, bracket_event_id, id)` | Real composite CASCADE FK (F-DM-64). Slots are JSON. |
| `bracket_results` | **Result (bracket)** | 1:1 on `bracket_matches` | Correctly constrained (F-DM-64). |
| `matches` | **Match (meet) — record 1/3** | `(tournament_id, id String(100))` | Court/slot/status only; **no side columns** (F-DM-22). |
| `match_states` | **Match (meet) — record 2/3 + Result** | `match_id String(100)` | **No `__table_args__` at all** — DV-6 / F-DM-22. Timestamps as `String(40)` (F-DM-55). |
| `tournaments.data["matches"]` | **Match (meet) — record 3/3** | blob id | *Who plays* exists only here — DV-6 / DV-8. |
| `commands` | Operations command log | `(tournament_id, id)` | Meet-only. Domain-adjacent, not a hierarchy entity. |
| `workspace_modules` | module enablement (control plane) | `(tournament_id, module_id)` | Second answer to "which engine" — DV-7. |
| `orgs`, `org_members`, `tournament_members`, `invite_links` | tenancy | — | **Out of model.** |
| `auth_sessions`, `entrant_sessions`, `auth_throttle` | session/abuse | — | **Out of model.** |
| `display_tokens` | capability token | — | **Out of model** (a workspace *key kind*, F-DM-25, but not an entity). |
| `solve_jobs`, `tournament_backups` | infrastructure | — | **Out of model.** |

### 1.4 What the target keeps because it is already right

Copy, do not reinvent: F-DM-62 (`personKey` as an opaque UUID) · F-DM-67 (`matchKey` + `NextMatchDTO.source`) · F-DM-66 (`entry_event_id`'s composite CASCADE FK — the shape every other hop should take) · F-DM-69 (`non-scheduling-keys.json`'s two-sided parity test — the shape every cross-tier contract should take) · F-DM-71 (public projections gate at the query) · F-DM-72 (adopt-don't-duplicate; F-E1-2 **closed**) · F-DM-70 (`scheduler_core` clean of intake).

---

## 2. Strangler-Fig phases

Ten phases, **P0–P9**. Every phase leaves the system shippable; no phase requires the next one to ship. Effort is relative (S/M/L), never time. **Migrations are the critical path** (Appendix A §3) — P2, P4, P6, P7, P8 carry them.

**Standing constraint on every phase:** a phase may not re-decide anything ruled. Specifically it may **not** add an FK to `entry_events.bracket_event_id` (R2), merge match records or introduce a shared match/score value object (ADR 0006), rename `tournaments`/`tournament_id`/`tournamentStore` (ADR 0014), add a hard `(entry_event_id, lower(contact_email))` unique index (R7/R13), weaken the 2026-08-23 minting ruling into name-alone matching (`entries/submissions.py:280-294`), resolve pair conflicts rather than flag them (I4), or re-open entrant erasure (debt-log D7, ruled 2026-08-21).

**The F-DM-11 test-schema trap applies to every FK negative control below.** The unit suites build schema with `Base.metadata.create_all`, which lacks the migration's FKs — an FK negative control written naively passes for the wrong reason. Rule: **each phase that adds an FK adds it to `models.py` and the migration in the same commit, and its negative control asserts the `IntegrityError`**; where a control must run against migration-built schema instead, the phase says so.

### P0 — Install the type mechanism (M) · resolves F-DM-27, 28, 29, 40, 45, 49

**Goal.** Stop hand-reconciling three type mirrors by eye — F-DM-27 is the missing mechanism behind F-DM-28 and F-DM-29, and Area 13 (5 files) is the smallest change in the audit with leverage over two pervasive areas (Area 5 = 221 files, Area 12 = 120).

- **Migrations:** none.
- **Code moves:** none — this phase adds a gate, not a refactor. Per R-DM-9: wire `dto.generated.ts` into a parity test against `api/dto.ts` (recommended) or delete it and gate on `make generate-api` diff. Same shape for the entrant tier's four hand-mirror files. Model: `store/__tests__/nonSchedulingKeys.parity.test.ts:15-18` (F-DM-69).
- **Tests + negative controls:** parity test per mirror. **NC 1:** add a field to a Pydantic response model → the parity test reddens on both tiers before any hand edit. **NC 2:** F-DM-28's three refused `PlayerDTO` fields are asserted *as* violations — the test fails today until they are dropped.
- **Deletion gate:** `rg "MatchStateOut"` → 0 (F-DM-45, dead). `rg -l "dto\.generated"` returns only the parity test + config (or 0, on the delete branch). `apps/console/knip.json:5` and `vitest.config.ts:22`'s exclusions are removed or re-justified in the same commit.
- **Sequencing:** **independent** of SP-P7/SP-P8. **Blocks nothing, unblocks everything above the API** — P1, P3, P6, P7 all land wire changes this makes machine-checked. Do it first.

### P1 — One standings shape (M) · resolves F-DM-26, 30

**Goal.** F-DM-26 — nine declarations, two grains, no shared source, while the *computation* is already single-authority. Pure shape duplication: the cheapest real unification and the natural first proof of P0's mechanism.

- **Migrations:** none (standings are derived, never persisted — `schemas.py:1039-1044`).
- **Code moves:** one backend row shape per grain, re-exported to the two public projections; the three tiers' `StandingRowDTO`s become generated/parity-checked. Give the two untyped public display routes a `response_model` (F-DM-30).
- **Tests + negative controls:** **NC 1:** deleting a field from the shared shape reddens the console *and* entrant parity tests, not just the backend. **NC 2:** the untyped display routes get a key-set test shaped like `tests/backend/test_season_listing.py`, which reddens on any added field — the allow-list discipline F-DM-71 says must be preserved.
- **Deletion gate:** `rg "class Standing|StandingRow|StandingsRow"` across the three app trees returns the shared declarations only (9 → ≤3).
- **Sequencing:** **independent** of SP-P7/SP-P8. Blocked-by P0.

### P2 — JSON-blob version discipline (M) · resolves F-DM-06, 39, 53 · **mandated early by Appendix A §3**

**Goal.** F-DM-06 — 23 of 24 blobs unversioned, including every domain-carrying one; the single versioned blob is versioned three incompatible ways. Every later phase that reshapes a blob (P4, P5, P7) needs this first.

- **Migrations:** none if the version is written on next write with "absent ⇒ v1" on read (recommended, R-DM-8); a per-blob backfill is the alternative. `tournaments.data`'s three schemes are reconciled by documentation + one accessor, not by dropping a column — `state_version` is load-bearing for I8's `If-Match` fetch-modify-retry.
- **Code moves:** one read/write helper per blob column, replacing bare JSON access at the repository boundary. `non-scheduling-keys.json` gains `$schema` + a version key and both readers stop hard-coding the relative path (F-DM-53).
- **Tests + negative controls:** **NC 1:** a blob written at `v2` and read by `v1` code raises rather than silently mis-parsing; an unversioned blob reads as `v1` and is rewritten stamped. **NC 2:** an inventory test fails when a new JSON column is added without a version helper — the mechanism, not the migration, is the deliverable.
- **Deletion gate:** `rg '\.data\["|json\.loads\(' apps/api/src` finds no domain-blob access outside the helpers. Carries debt-log L1's open half forward: the retention job still does not reach PII on workspace state blobs — record, do not fix here.
- **Sequencing:** **independent** of SP-P7/SP-P8. **Blocks P4, P5, P7.**

### P3 — Close the two minting gaps (S) · resolves F-DM-01's cross-event half, F-DM-02, F-DM-16

**Goal.** The minting *rule* is ruled (2026-08-23) and is not reopened here. What P3 builds is the two gaps that ruling left — the advisory that does not fire across events, and the partner path that applies none of it — plus the operator wire's missing person key (F-DM-16). Shape per R-DM-1.

- **Migrations:** none. A merge tool for already-fragmented rows is a **ruled deferral**, `docs/reference/debt-log.md:78` — not this phase, not a new proposal.
- **Code moves:** widen `looks_duplicate`'s advisory to a second, weaker workspace-scoped reason code (`entries/submissions.py:228-261`); route `partners.accept()` through `same_person` and give it the discriminator it never receives (`entries/partners.py:176-224`); add `entryPlayerId` to `EntryDeskRowDTO` — the backend already resolved the identity (R-P7c), the wire simply does not carry it.
- **Tests + negative controls:** **NC 1 (the ruling holds):** two submissions, same account, same name, **no birth year** → still **two** rows, never merged — plus a NEEDS_REVIEW flag on the second, which is what is new. **NC 2 (the ruling holds the other way):** same account, same name, **different** birth years (a father and son) → two rows, and *no* new flag beyond today's same-event one. **NC 3:** enter alone, then accept a doubles invite under the same account with a matching birth year → one person row (two today). **NC 4:** R7 preserved — every duplicate answer is still a flag, never a 409 (I4).
- **Deletion gate:** `rg "EntryPlayer\(" apps/api/src` returns one construction site (the adoption path) instead of two. `rg "personKey|entryPlayerId" apps/console/src` is non-zero for the first time.
- **Sequencing:** **blocked-by** R-DM-1. Independent of P0–P2. **Gates two SP-P7 deferrals** — §2.1.

### P4 — The people→competition link becomes a key (L) · resolves F-DM-05, 09, 10, 11, 18 (the keyless-`names[]` half), 22

**Goal.** F-DM-05 — the only storage link between the two spines is an unconstrained String pointing *into* a JSON blob, re-derived in three files, with zero FK-bearing hops. This is the seam Kyle's diagram draws as a single line.

- **Migrations:** (a) add the two missing composite FKs to `models.py` so the ORM matches the migration that already has them (F-DM-11) — **models.py and migration in the same commit**; (b) per R-DM-2, a real `entry_player_id` (Uuid, composite FK) on `bracket_participants` + a typed `entryPlayerId` on both roster blob shapes, written alongside the legacy string; (c) `match_states` gains `__table_args__` with a composite FK to `matches` and an index (F-DM-22) — `commands` already declares one, prior art in the same file.
- **Code moves:** the three `entry-{uuid}` derivation sites (`entries/entries.py:227`, `entries_site.py:88,942`) collapse to one; `ParticipantOut` stops dropping the provenance link at the generation path and both call sites (F-DM-09).
- **Tests + negative controls:** **NC 1:** a `bracket_participants` row with a non-existent `entry_player_id` → `IntegrityError` (must run against **migration-built** schema, or land (a) first — F-DM-11). **NC 2:** the documented commit crash window (`entries/entries.py:239-248`) still leaves no dangling read path — characterized before it is touched. **NC 3:** a Meet-branch match id removed from the blob still deletes its `matches` row.
- **Deletion gate:** `rg '"entry-' apps/api/src apps/console/src apps/entrant/app` → the one minting site, then 0 once readers move. `rg "committed_player_id"` → writer + migration only.
- **Sequencing:** **blocked-by** R-DM-2 and P3. **Blocks P7 and P8.** Changes the seeds, winners and player-page projection inputs (audit §5.4) — §2.1.

### P5 — Pair survives intake (L) · resolves F-DM-03, 07, 12, 13, 14 (minting half), 35, 36

**Goal.** F-DM-03 — the commit seam emits `PLAYER`/`member_ids: []` for every entry, so an accepted pair reaches the draw as two singletons and is re-minted by hand as a name concatenation; F-DM-07 — `partner_entry_id` has zero engine, console and entrant readers.

- **Migrations:** none under R-DM-4's recommended option; an `entry_pairs` table is option (b).
- **Code moves:** `_plan_bracket` emits `type="TEAM"` with real `member_ids` for a confirmed pair; `_plan_meet` gets the analogous side construction, which also removes the client-side pairing in `RegenerateMenu.tsx:87,96-100` (F-DM-08) — **cut from P5 to P7 at ratification, 2026-08-25; see §2.2's F-DM-08 row for the rank-mapping reason.** One `isDoubles(event)` authority replaces the four answers (F-DM-13) — *amended 2026-08-25: the audit found **six**, not four, and P5 collapsed all six.* `partnerEntryId` reaches the operator wire, which today has **zero** pair shapes (F-DM-35).
- **Tests + negative controls:** **NC 1:** commit a confirmed pair → one `TEAM` with two `member_ids`, not two `PLAYER`s (fails today). **NC 2:** commit a *half*-accepted pair → the confirmed half commits as a singleton and nothing dangles; the designed state (`partners.py:59-62`) survives. **NC 3:** I4 preserved — a `pair_conflict` is still only flagged. **NC 4:** writing `partner_entry_id` on one half only is detected (per R-DM-4), since nothing detects it today.
- **Deletion gate:** `rg "split\(' / '\)|\\$\{.*name\} / \\$\{" apps/console/src` → 0 for the *minting* direction; the five presentation-direction splits (F-DM-14) go at P6. `rg "isDoublesRank|\['MD','WD','XD'\]"` → one authority — *amended 2026-08-25: the gate is one **definition**, not one file. `rg isDoublesRank` still returns nine console files, because P5 kept `isDoublesRank` as a re-export alias over the single `isDoublesCode` authority in `lib/doubles.ts` rather than churning every call site. The literal rank array is what went to zero.*
- **Sequencing:** **blocked-by** R-DM-4 and P2 (`member_ids` is an unversioned blob). Independent of SP-P7/SP-P8. **Thinnest test cover of any large area** (5 test files / 33 files / 120 sites) — characterization tests before restructuring, per Appendix A §3.

### P6 — The bracket person stops being their name (M) · resolves F-DM-04, 14 (read half), 15

**Goal.** F-DM-04 — a bracket person's primary key is a slug of their display name, so same-named people collapse and a rename re-keys the person; F-DM-15 — a repair routine decides a row is corrupt by `p.name === p.id` and **persists its guess**.

- **Migrations:** per R-DM-7 — either re-key `bracket_participants.id`, or keep it and let P4's `entry_player_id` be the identity for everything that resolves to a person. The delta is a data migration over a String PK referenced from inside JSON slot blobs; hence M, not S, and hence P4 first.
- **Code moves:** `lib/playerSlug.ts` stops being an identity mint and becomes at most a URL helper; `bracketMigration.ts`'s decode-from-label and `p.name === p.id` repair are deleted rather than fixed.
- **Tests + negative controls:** **NC 1:** two participants named "Li Wei" in one draw are two rows (collapses today). **NC 2:** renaming a participant changes no id and orphans no match or result. **NC 3:** removing the repair routine does not resurrect the bracket defect its comment describes (`bracketMigration.ts:11` — the **bracket defect series** D3, *not* debt-log D3; two registers, same number).
- **Deletion gate:** `rg "playerSlug|toPlayerSlug|nameFromSlug" apps/console/src` → 0 outside a URL helper; `rg "p\.name === p\.id"` → 0.
- **Sequencing:** **blocked-by** P4. Independent of SP-P7/SP-P8. Mechanism contained (7 files / 8 sites); readers medium (30 / 85).

### P7 — One Event key, and a Meet Event (L) · resolves F-DM-08, 23, 24, 33, 34, 37, 57

**Goal.** F-DM-24 — the write path posts a UUID while every public read projection keys by a mutable, director-typed `eventCode` across six shapes on two tiers; F-DM-23 — Meet has no Event at all, so the seam *invents* the required `groupId`. This is debt-log D8 / F-E1's redesign, which **the entries design spec owns**: `2026-08-06-entries-design.md:1721-1729` — "Do not patch this ad hoc."

- **Migrations:** per R-DM-5 — a `meet_events` table (or a division-keyed, versioned blob section) plus a real mapping column; per R-DM-10, `CheckConstraint`s on the ~19 unconstrained enum Strings, starting with `tournaments.kind`, `entries.state`, `matches.status`, `tournament_members.role` (F-DM-37: **zero** check constraints exist today).
- **Code moves:** public projections key by a stable key with `eventCode` demoted to a label (R-DM-11); a Meet Draw makes F-DM-33's `draws: []` distinguishable from "not generated" for the first time; one engine-discriminator authority replaces the two (F-DM-34).
- **Tests + negative controls:** **NC 1:** renaming an event code leaves every public URL and projection resolving (fails today). **NC 2:** `INSERT tournaments(kind='banana')` is rejected (succeeds today; `or "meet"` swallows it). **NC 3:** an empty `rankCounts` no longer accepts every code (`entries/entries.py:434-441`). **NC 4:** a Meet workspace's draws index is distinguishable from an ungenerated bracket one.
- **Deletion gate:** `rg "rankCounts" apps/api/src` → the migration-compat path only; `rg "or \"meet\"" apps/api/src` → 0.
- **Sequencing:** **blocked-by** R-DM-5 and P0 (Area 12 is 120 files / 414 sites / 61 tests — the second-largest blast; it needs a machine-checked wire diff to land against). **Touches SP-P7/SP-P8 projections most** — every entrant read shape keys by `eventCode`. Program-scale; do not start it inside another program's window.

### P8 — PlayerProfile v1 (M) · resolves F-DM-17, and F-DM-18's cross-surface half

**Goal.** Give DV-3's dashed box a body: a global person above `TournamentPlayer`, so one human across two workspaces is one identity with one public history. **Scope is owner-supply** — R15 has no ruling text and is never quoted or inferred (R-DM-3).

- **Migrations:** a `player_profiles` table (or a profile role on `entrant_accounts`) plus a nullable `profile_id` on `entry_players`. Additive and back-fillable from `entry_players.account_id`, already a real FK — the cheapest version adds no new join to any existing query.
- **Code moves:** none for v1 storage. Any public surface is a *new* projection, not a change to an existing one — which is why it is late in the sequence.
- **Tests + negative controls:** **NC 1:** two `entry_players` rows in two workspaces under one account resolve to one profile. **NC 2:** an `entry_player` with no account (hand-added, F-DM-19) resolves to **no** profile and renders as plain text — the ruled caveat must survive. **NC 3:** a scrubbed player (debt-log D7, `erased_at`) is absent from the profile's history, and the profile itself is scrubbed, not deleted.
- **Deletion gate:** nothing dies here; the phase is purely additive. Its gate is the inverse: `rg "personKey"` shows the tournament-scoped key still in use, unchanged — the profile sits *above* it, so F-DM-62 stays true.
- **Sequencing:** **blocked-by** R-DM-3 and P3/P4. **This is the SP-P7 deferral that matters** — §2.1.

### P9 — Cosmetic sweep + deletions (S) · resolves the F-DM-43..61 remainder

**Goal.** Collect what the earlier phases leave adjacent and cheap: F-DM-43, 46, 47, 48, 50, 51, 52, 54, 55, 56, 59, 60, 61 — plus F-DM-21, 25 and 42 from §2.3.

- **Migrations:** one, optional — `match_states`' `String(40)` timestamps → `DateTime(timezone=True)`, so time is comparable in SQL on the Meet operational path (F-DM-55).
- **Tests + negative controls:** each item is covered by P0's parity tests once they exist; the only new control is that `MatchScore`'s bounds (`ge=0, le=99`) apply at both declaration sites (F-DM-43).
- **Deletion gate:** §2.2's delete-list reaches zero.
- **Sequencing:** independent, anytime after P0. Boy-Scout material per `CODE_HEALTH.md` — do not make it a program.

### 2.1 Sequencing against SP-P7 / SP-P8 — the build-or-defer call

**SP-P8 (season calendar) is done and unaffected.** Its payload is tournament-level only and has a key-set test that reddens on any added field (audit §5.4). No phase changes its inputs. A `Season`/`Calendar` *entity* would replace the `is_open` gate — R-DM-13, not a forced change.

**SP-P7's remaining work is the seven inherited deferrals** (`P7_PROGRESS.md`, re-listed unchanged in `P8_PROGRESS.md`). The criterion: **a projection that mints, keys on, or links to a public person identity waits for P3; one that does not, ships now.**

| Deferred SP-P7 item | Call | Argument |
|---|---|---|
| Live-state chip wiring | **BUILD** | Keys on `matchKey`, prior art the target keeps (F-DM-67). Touches no person key. |
| Elimination connector lines | **BUILD** | Pure render. Zero domain surface. |
| Compass/Monrad plate winners | **BUILD** | Same session walk as Winners; `names[]` is keyless today and stays keyless either way. No new URL. |
| Withdrawn/rejected write paths (E2) | **BUILD** | `entries.state` transitions on the cleanest region of the schema (F-DM-63); touches no minting. P7's CHECK on `entries.state` is additive after it. |
| "Account has newer contact details" hint (R-P7a) | **BUILD** | Compares `entrant_accounts` to `entry_players` contact fields — both exist, both keyed. |
| Highlight-player on the draw tree | **DEFER past P3+P4** | The first surface to link a *draw node* to a *player page*, and the two carry different key-spaces (F-DM-18). Built today it must join them through the `entry-{uuid}` string (F-DM-05) — the exact join P4 deletes. Building it first means building it twice. |
| Global profiles (R15 v1) | **DEFER — it is P8** | Not a deferral to re-time but an owner-supply decision (R-DM-3). Profile pages mint public URLs per person, and a person key legitimately fragments under the 2026-08-23 ruling with **no resolver yet** (`debt-log.md:78`) — so every fragment becomes a URL a later merge must redirect. |

**Net:** five of seven build now; two defer, and both are person-keyed. **No SP-P7 work is blocked by P0, P1, P2, P5, P6, P7 or P9.**

### 2.2 Delete-list

| Item | Evidence | Disposition |
|---|---|---|
| `apps/console/src/api/dto.generated.ts` — zero importers | F-DM-27 | **R-DM-9 decides**: parity oracle (recommended) or delete. Either way it stops being a file nobody reads. **P0.** |
| `MatchStateOut` — no route serves it, 0 references | F-DM-45 | **Delete. P0.** |
| The three `entry-{uuid}` derivation sites | F-DM-05 | Collapse to one, then zero. **P4.** |
| The pair name-concatenation mint + `nameFromSlug` decode-from-label | F-DM-03, 14 | **Split at the SP-DM-3 P5 ratification, 2026-08-25; the row read "Delete. **P5.**" and conflated two items.** The **decode** (`bracketMigration.ts`'s `nameFromSlug` split-and-zip) is still **Delete. P6.** — unchanged, and P5 is what makes it possible: a seam-built team carries its membership in `member_ids`, so nothing has to read it back out of the label. The **mint** is **permanent, not deleted**: `bracket_participants.name` is NOT NULL and director manual pairing STAYS (R-DM-4's ruling note), so a pair label must be minted somewhere. P5 in fact *added* the backend's first — there are now two, one per tier (`bracketLabels.ts`'s `teamName`, which `ParticipantPicker` and `BracketPlayerFields` both call, and `entries/entries.py`'s `team_name`), deliberately spelling the separator the same way. What P5 delivers against F-DM-03 is that no reader has to DECODE the label, not that the label stops existing. |
| `playerSlug()` as an identity mint | F-DM-04 | Demote to a URL helper or delete. **P6.** |
| `p.name === p.id` corruption heuristic (persists its guess) | F-DM-15 | **Delete. P6.** |
| `or "meet"` engine default | F-DM-34 | **Delete** once `kind` carries a CHECK. **P7.** |
| The `RegenerateMenu.tsx` client-side lineup construction | F-DM-08 | Moves server-side. **P7** *(amended 2026-08-25, at the SP-DM-3 P5 ratification; the row read **P5**)*. P5 shipped the Bracket half of the pair only: `_plan_meet` writes `ranks=[event.code]` (e.g. `"XD"`) while `RegenerateMenu.expandRanks` emits only numbered ranks `XD1..XDn` and filters `(p.ranks ?? []).includes(rank)`, so **no committed Meet entry can reach a generated Meet match at all today** — a Meet pair field would have no reader. P7 owns the Event-key mapping that fixes it. This removes a self-contradiction rather than reassigning work: the P7 slice header and R-DM-5's recommendation already give P7 F-DM-08 "in part", as does `DM1_RULINGS.md:142`. |

### 2.3 Findings this plan leaves open, deliberately

Explicit dispositions, so nothing in the blocking/structural bands is silently unhomed.

| Finding | Disposition |
|---|---|
| **F-DM-19** — the two person-shapes with no `entry_player` row | **Ruled gap, cited not filed** (`SP-P7-phase0-audit.md:64-76`): they link to a player page only when resolvable, otherwise plain text. Its survival is pinned by **P8 NC 2**. |
| **F-DM-20** — pre-acceptance partner is an email string; rivals found by string equality | **Accepted.** Flag-never-resolve is ruled (I4); the email *is* the address before a person exists. Revisit only under R-DM-4 option (b). |
| **F-DM-21** — `Match.playerIds` mixes meet UUIDs and bracket slugs untagged | **P9.** Tag with `source` following F-DM-67's pattern (`matchKey` sits beside it in the same file). Unblocks debt D20's double-booking guard. |
| **F-DM-25** — one workspace, four key kinds, no layer declares the mapping | **P9** — a declared mapping table in `docs/reference/`, not a re-key. Each of the four is deliberate. |
| **F-DM-31 / F-DM-32** — non-convertible public match shapes; one public field, two semantics | **Open.** Fold into P7's wire pass if it happens, else open until a consumer needs the conversion. ADR 0006 rules the *records* non-merged; it does not rule that one public field may carry both semantics, so this stays a live finding. |
| **F-DM-38** — a bracket roster inside the meet blob | **Accepted** until R-DM-2 option (c) moves the Meet roster out of the blob. Nothing else dislodges it. |
| **F-DM-41** — wire-dialect split (bracket snake_case, everything else camelCase) | **Made visible by P0's oracle; unification is R-DM-9 option (c) scale.** Accepted meanwhile — consistent per router, not drifting. |
| **F-DM-42** — no entrant type models the R13 chain; `MyTournamentCard` *is* a submission | **P9.** Naming, not inputs (audit §5.4). |
| **F-DM-44 / F-DM-58** | **Accepted.** The score/assignment split is documented at the declaration (ADR 0006); the surname guess already carries its own `ponytail:` ceiling comment. |

---

## 3. Decision list `R-DM-1..13`

Every entry was diffed against `citations-pack.md` and the 2026-08-23 minting ruling. **Nothing already ruled is re-asked.** Where a decision abuts a ruling, the ruled half is stated as a constraint, not a question.

---

**R-DM-1 — What remains open in person minting after the 2026-08-23 ruling?**

*Ruled 2026-08-23 — cite, do not re-open.* The adoption rule is **same account · same normalized name · same birth year, all present**: "auto-link what is certain, flag the rest, never merge by guesswork", ratified at the STOP (`entries/submissions.py:280-294`; recorded in SP-P7's delta, `4d5aca56`). Name alone is **explicitly rejected** — one club rep enters a father and son sharing a name — and a spec with no birth year **matches nothing rather than guessing**, riding the `looks_duplicate` → NEEDS_REVIEW advisory instead (I4). The operator merge tool is a **ruled deferral**, `docs/reference/debt-log.md:78`. R7's soft flag and no-hard-unique stand.

So F-DM-01's mechanism is ruled behaviour, not a defect to redesign, and **an option that matches on name alone contradicts the STOP ruling** — available only as an explicit owner override, and not recommendable here. Two things that ruling does not cover:

**(i) The advisory does not fire across events.** `looks_duplicate` is scoped to **same event** *and* same name (`entries/submissions.py:228-261`, docstring: "Same event **and** same player name, across submissions"). The ruling's promise — that the birth-year-less person rides the advisory "like every other ambiguity" — therefore holds only when the second entry lands in the *same* event. Enter MS today and MD next week with no birth year and there are two `entry_players` rows, two `personKey`s, two public player pages, **and no flag anywhere**.

| Option | Trade-off |
|---|---|
| **(a) Add a second, weaker workspace-scoped advisory: same account + same name, any event → NEEDS_REVIEW.** | Restores the ruling's own promise at the scope it assumed. Flag-only, so I4 and "never merge by guesswork" both hold. No schema change. Cost: more review noise for one account legitimately entering two same-named children — the same false positive the same-event flag already accepts. |
| **(b) Require `birth_year` on every player.** | Removes the gap at the source. Abuts **R12**, which admits DOB only as a *plain eligibility field* — making it required for identity is a new demand on every entrant and an owner call on R12's edge. |
| **(c) Accept the gap; the merge tool (`debt-log.md:78`) is the resolver.** | Zero work. Leaves fragments unflagged until an operator notices, and there is no merge tool yet. |

**Recommendation: (a).**

**(ii) The partner path applies none of the ruling.** `partners.accept()` constructs `EntryPlayer` directly, never calls `same_person`, and **takes no `birth_year` argument at all** (`entries/partners.py:176-224`) — so a partner-minted person carries `birth_year = NULL` permanently and can never be the certain match, in either direction, even later. Enter alone, then accept a doubles invite under the same account, and you are two people forever. F-DM-02 records this as "unruled as far as the tree states".

| Option | Trade-off |
|---|---|
| **(a) Route acceptance through `same_person` and collect the discriminator on the accept form.** | The ruling's principle applied where it was never applied. One extra field on a form the acceptor is already filling in. |
| **(b) Route through `same_person` without the field.** | A no-op today (NULL never matches), correct the day the field arrives. Half a fix that looks like a whole one. |
| **(c) Accept; let the merge tool cover it.** | Same objection as (i)(c). |

**Recommendation: (a).**

**Resolves F-DM-01's cross-event half and F-DM-02.** F-DM-16 (`entryPlayerId` on the operator wire) is a wire fix in P3, not a decision.

---

**R-DM-2 — How does the people spine link to the competition spine?**

*Ruled, not in question:* `entry_players` **is** TournamentPlayer (`SP-P7-phase0-audit.md:64-76`). Open is the **link mechanism only** — F-DM-05.

| Option | Trade-off |
|---|---|
| **(a) Add `entry_player_id` (Uuid, composite FK) to `bracket_participants` + a typed `entryPlayerId` on both roster blob shapes; keep the string as a legacy read path until the gate closes.** | Strangler-shaped, one FK per side, both key-spaces resolvable during the migration. Cost: a dual-write window; the blob half is only as safe as P2's versioning. |
| **(b) Keep the string convention, document it, add a consistency test.** | Zero migration. Leaves the seam a formatted string — a prefix rename still orphans every public player page, and no DB constraint can help. |
| **(c) Move the Meet roster out of the blob into a table first, then FK both sides.** | The clean end-state (removes DV-8). Program-scale: `tournaments.data` is 34 files / 94 sites and I8's write discipline rides on it. |

**Recommendation: (a) now, (c) as a later program if the Meet blob is opened for another reason.** **Resolves F-DM-05, F-DM-09, F-DM-10, F-DM-11 (with the models.py FK parity), F-DM-22.**

---

**R-DM-3 — Is PlayerProfile v1 in scope, and what is it?** *(owner-supply)*

**R15 has no ruling text anywhere in the tree** — 24 grep hits, all deferral markers, briefs citing it, or explicit phantom flags. It is **not quoted, paraphrased or inferred here.** The tree fact is F-DM-17.

| Option | Trade-off |
|---|---|
| **(a) Out of scope. Record the absence; `entrant_accounts.id` remains the only cross-workspace bridge.** | Zero cost. Public player history stays per-workspace — what every current projection assumes. |
| **(b) Storage-only v1: `player_profiles` (or a profile role on `entrant_accounts`) + a nullable `profile_id` on `entry_players`, back-filled from `account_id`. No public surface.** | Additive, cheap, back-fillable, changes no query. Buys the option on (c) without committing to a surface. |
| **(c) Full v1: profile + public cross-tournament history pages.** | New public URLs keyed on a person that legitimately fragments (R-DM-1) with no merge tool yet — hence late. |

**Recommendation: (b), and hold (c) until Kyle supplies the profile-v1 scope.** Kyle must supply what a profile *contains*; this spec will not infer it. **Resolves F-DM-17 and F-DM-18's cross-surface half.**

---

**R-DM-4 — Is a doubles pair a first-class entity?**

F-DM-03, F-DM-07, F-DM-36 — six representations, only one id-bearing and it is in `scheduler_core`, out of scope for change.

*Ruled, not in question:* pair conflicts are **flagged, never resolved** (I4) — an option that resolves them is a re-ask. R7's no-hard-unique stands.

| Option | Trade-off |
|---|---|
| **(a) Keep the two columns; make the seam emit `TEAM` with real `member_ids`; add the pair to the operator wire.** | Smallest diff that fixes the blocking finding. Mutuality stays a write convention plus a test/check. No migration. |
| **(b) An `entry_pairs` table (one row per pair, two FKs, a unique on the event).** | Mutuality becomes structural; conflicts become a constraint — which collides with I4 unless carefully scoped. Migration + backfill from `partner_entry_id`. |
| **(c) Status quo + a director re-pairing UI.** | Ratifies the hand-minted name concatenation. Cheapest today, most expensive per event. |

**Recommendation: (a).** It closes F-DM-03 without a migration and leaves (b) reachable. **Resolves F-DM-03, F-DM-07, F-DM-12, F-DM-13, F-DM-35, F-DM-36.**

---

**R-DM-5 — F-E1 / debt-log D8: division-level mapping, or seam-side slot assignment?**

F-DM-23 in situ. **Ownership is not a `§9.3` heading** — it is §9 item 3 of the entries design, `docs/history/superpowers/specs/2026-08-06-entries-design.md:1721-1729`: "Entry events map onto a **division** (MS), not a **slot** (MS1); the seam needs either slot assignment or a division-level mapping. **Do not patch this ad hoc.**" Open since; untouched by R10–R14.

| Option | Trade-off |
|---|---|
| **(a) Division-level mapping: `entry_events.code` names a division; slot assignment happens later, operator-side.** | Matches the spec's own first framing; keeps intake dumb. Requires a slot-assignment surface that does not exist. |
| **(b) Seam-side slot assignment: the seam distributes entrants across the division's declared slots.** | No new operator surface. Puts a competition decision in the intake seam, and the seam is re-runnable/additive (R3), so the distribution must be stable across re-runs. |
| **(c) A real Meet Event entity (P7), with entry events mapping onto it.** | Removes DV-4 and the invented `groupId` at once. Largest, but blocks on nothing else. |

**Recommendation: (a) as the model, (c) as the mechanism** — rule the mapping division-level now, and let P7 build the Event that makes it storable. **Resolves F-DM-23, F-DM-08 (in part), and F-DM-24's Meet half.**

---

**R-DM-6 — Debt-log D7's remaining half: how does account deletion work?**

*Ruled 2026-08-21, cite don't re-open:* entrant erasure is **scrub the PII, keep the rows** (`entries/lifecycle.erase_player`, migration `w7c2d8e0f5a6`), and the `ondelete=CASCADE` on `submissions.account_id` / `entry_players.account_id` is **deliberately still there** (`docs/reference/debt-log.md:33`). Still owed: **Phase 10's account deletion must not be a bare `DELETE`** over that live CASCADE.

| Option | Trade-off |
|---|---|
| **(a) Account-level scrub over the existing erase seam: iterate the account's `entry_players`, scrub each, then neutralize the account row (no row deletion).** | Reuses the ruled, shipped mechanism; consistent with "keep the rows"; no FK change. The account row lingers scrubbed — needs a documented terminal state. |
| **(b) Narrow the two FKs to `RESTRICT`/`SET NULL` first, then allow a real `DELETE`.** | A true delete becomes safe. Migration on two FKs; changes a ruled-deliberate CASCADE, so it needs explicit sign-off. |
| **(c) Refuse account deletion; offer erasure only.** | Zero work, defensible (erasure ≠ deleting every row). May not satisfy debt-log L1's operator half. |

**Recommendation: (a).** The ruling's own shape applied one level up, leaving (b) available. **Resolves D7's open half; interacts with L1's operator half and blob-PII story (P2).**

---

**R-DM-7 — Does the bracket participant id stop being a name slug?**

F-DM-04.

| Option | Trade-off |
|---|---|
| **(a) Keep the id; make R-DM-2's `entry_player_id` the identity for every participant that resolves to a person.** | No data migration over a String PK referenced from inside JSON slot blobs. Hand-added participants keep a slug id — already covered by the ruled caveat (plain text, not linkable). |
| **(b) Re-key participants to opaque ids with a migration that rewrites the slot blobs.** | Clean end-state. Touches every `slot_a`/`slot_b`, `side_a`/`side_b` and `dependencies` blob — the riskiest migration in this document. |

**Recommendation: (a).** (b) only if a bracket-side program opens those blobs for another reason. **Resolves F-DM-04, F-DM-14, F-DM-15.**

---

**R-DM-8 — What shape does blob versioning take?**

*Not in question:* that blobs get version discipline, and that it is an **early phase** — Appendix A §3 mandates it. Open is only the shape (F-DM-06).

| Option | Trade-off |
|---|---|
| **(a) A `v` int inside each blob; absent ⇒ v1; stamped on next write.** | No migration, no backfill, works per column. Old rows stay unstamped until touched — read paths must tolerate that forever. |
| **(b) An envelope `{v, data}` per blob column.** | Unambiguous. Requires a backfill migration per column and rewrites every reader at once. |
| **(c) A schema registry + per-blob migration chain.** | Correct at scale. Over-built for 24 blobs on a single-store product. |

*Sub-question — `tournaments.data`'s three schemes.* Keep `state_version` untouched (I8's `If-Match` fetch-modify-retry rides on it; it is a *concurrency* token, not a schema version), treat `data["version"]` as the schema version, and document `schema_version` as the row-format version. One accessor, no column drops.

**Recommendation: (a).** **Resolves F-DM-06, F-DM-39, F-DM-53.**

---

**R-DM-9 — `dto.generated.ts`: oracle or corpse?**

F-DM-27.

| Option | Trade-off |
|---|---|
| **(a) Wire it as a parity oracle: a test asserting `api/dto.ts` matches the generated shapes.** | Turns 8.6k dead lines into the mechanism behind F-DM-28/29. It reddens immediately on the known divergences — which is the point, but they must be allow-listed *down to zero*, not silenced. |
| **(b) Delete it; gate on `make generate-api` producing no diff in CI.** | Smaller repo, same boundary guarantee. Loses per-type granularity and direct imports. |
| **(c) Import from it directly and delete the hand mirror.** | The end-state everyone assumes exists. 221 files import `api/dto`; a program, not a phase. |

**Recommendation: (a)**, with (c) as the eventual shape once divergences are zero. **Resolves F-DM-27, F-DM-28, F-DM-29, F-DM-49.**

---

**R-DM-10 — Which record answers "what engine is this workspace"?**

F-DM-34.

| Option | Trade-off |
|---|---|
| **(a) `tournaments.kind` is the authority + a CHECK; `workspace_modules` governs UI only.** | One truth for the domain. Forecloses hybrid workspaces, which `_board_kind` already half-supports. |
| **(b) `workspace_modules` is the authority; `kind` becomes a seed value.** | Hybrid becomes real. The commit seam must then choose an engine per *event*, not per workspace — a much larger change. |
| **(c) Keep both, document the split, CHECK the column.** | Cheapest; the ambiguity survives as a documented one. |

**Recommendation: (a).** Nothing needs a hybrid workspace today, and DV-7 is what every trace assumes. **Resolves F-DM-34; carries F-DM-37's CHECK work.**

---

**R-DM-11 — Does the public tier key events by a stable key or by the code?**

F-DM-24, F-DM-57. *Ruled, not in question:* `entry_events.bracket_event_id` stays **FK-less** (R2). This is about the *public wire*, not that FK.

| Option | Trade-off |
|---|---|
| **(a) Public projections key by a stable key; `eventCode` becomes a label.** | A rename stops orphaning URLs. Breaks existing public URLs once — needs a redirect story, and SP-P7/P8 shapes change (Area 12: 120 files / 414 sites). |
| **(b) Keep `eventCode` as the key; forbid renaming a code once published.** | Zero wire change. Enforces a product rule with a constraint instead of a redesign — cheap, and honest about what a code is. |
| **(c) Split `drawKey` from `eventCode` for real.** | Worth it only if Draw becomes an entity separate from Event (DV-5). Otherwise it is today's type-system-only distinction with more code. |

**Recommendation: (b) now, (a) if and when P7 gives Meet a real Event.** Renaming a published event code is already a director error; making it *impossible* is a one-line constraint versus a two-tier re-key. **Resolves F-DM-24, F-DM-57.**

---

**R-DM-12 — Accept the build-or-defer call in §2.1?**

| Option | Trade-off |
|---|---|
| **(a) Accept.** | Two items wait; five ship. No SP-P7 work is blocked by seven of the ten phases. |
| **(b) Build highlight-player now against the `entry-{uuid}` join.** | Ships sooner; guarantees a rewrite at P4, and links a public draw node to a person key that fragments with no resolver. |
| **(c) Freeze all SP-P7 remainder until P4.** | Over-correction — five of the seven touch no person key at all. |

**Recommendation: (a).** **Resolves the Appendix A §3 sequencing requirement.**

---

**R-DM-13 — Is Season/Calendar an entity?**

SP-P8 ships as a pure projection with no migration; the audit records that a `Season`/`Calendar` entity "would *replace* the `is_open` gate — an `R-DM` input, not a forced change" (audit §5.4).

| Option | Trade-off |
|---|---|
| **(a) Projection-only. `entry_pages.is_open` + dates stay the gate.** | Zero cost; the key-set test already guards the payload. |
| **(b) A `seasons` table owning date ranges and membership.** | Real grouping, multi-year history, a home for org-level calendars. No consumer asks for it today. |

**Recommendation: (a).** YAGNI until a surface needs it. **Resolves nothing open; forecloses nothing.**

---

### 3.1 The one decision that unblocks the most

The audit names it "the person-spine ruling" and lists **R-DM-1 + R-DM-2 + R-DM-3 + R-DM-7** as its parts — that joint framing stands. **Its largest genuinely-open part is now R-DM-2** (the link mechanism), because R-DM-1's core — what makes two entries the same human — was **ruled on 2026-08-23** and only its two gaps remain. R-DM-2 alone resolves five findings including two blocking, and unblocks P4, P6, P7 and P8.

---

**STOP.** Kyle reviews and issues `R-DM` rulings. No implementation prompt is drafted from this document.
