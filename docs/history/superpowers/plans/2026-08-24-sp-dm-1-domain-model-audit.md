# SP-DM-1 — Domain Data-Model Audit: Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the SP-DM-1 read-only audit — test Kyle's fragmentation hypothesis with path-level evidence and produce two documents (audit + unification plan) plus a ledger. Zero code changes.

**Architecture:** Fan out the representation census to 4 parallel subagents (one per layer), merge into one matrix, run identity-trace and seam-trace in matrix-seeded contexts, consolidate findings under stable `F-DM-*` IDs, write the unification-plan doc, then spot-check with a fresh-context verifier.

**Spec:** Appendix A below (the SP-DM-1 prompt, verbatim). Copy its §0–§5 into the audit doc header for traceability.

**Timing:** Written 2026-08-24 while another agent was mid-flight on `feat/p8-season-calendar`. Execute after that work settles; re-pin the HEAD SHA at start regardless.

## Context

SP-P7 (public entrant surfaces) and SP-P8 (season calendar) build public projections on the domain model. Kyle hypothesizes the model is fragmented — tournament/event/entry/player represented differently across Meet, Bracket, Operations, entries, and the public tier — and wants that verified or refuted before more projections stack on top. Deliverables are documents only; implementation comes later, after Kyle issues `R-DM-*` rulings.

## Environment corrections (discovered during planning — read before anything else)

1. **Do NOT audit `.claude\worktrees\p7-public-entrant`.** That directory is a **stale pre-reorg snapshot** (old `products/scheduler/` layout), not a registered git worktree — `git worktree list` doesn't know it; its files are untracked content inside the main repo. E3 partner work (`partners.py`) that exists on the real tree is absent there.
2. **Audit target = the main checkout** `C:\Users\avlis\OneDrive\Documentos\Projects\ShuttleWorks`, on `feat/p8-season-calendar` (tip of the unmerged SP-P7/P8 stack — post-SP-REORG `apps/` layout). Pin the HEAD SHA in the ledger at audit start and cite it in both docs; paths/lines are audited as-of that SHA.
3. **Path translation** (planning scouts read the stale snapshot; concepts carry, paths don't — every scout hint below must be re-resolved):
   | Stale (snapshot) | Current (audit target) |
   |---|---|
   | `products/scheduler/backend/database/models.py` | `apps/api/src/db/models.py` |
   | `products/scheduler/backend/app/schemas.py` | `apps/api/src/core/schemas.py` |
   | `products/scheduler/backend/api/*.py` | `apps/api/src/<domain>/` (`bracket/`, `meet/`, `entries/`, `display/`, `workspaces/`, `identity/`, `operations/`, `ops/`, `solve_rail/`, `repositories/`, `shared/`) — e.g. `entries_site.py` → `apps/api/src/entries/entries_site.py` |
   | `products/scheduler/backend/alembic/` | `apps/api/src/alembic/` |
   | `products/scheduler/frontend/` | `apps/console/` (`src/api/dto.ts`, `dto.generated.ts` confirmed) |
   | `products/scheduler/entrant/` | `apps/entrant/` (`app/lib/{entryPage,draws,player}.types.ts` confirmed) |
   | `scheduler_core/` | `packages/scheduler-core/scheduler_core/` |
   | — (new) | `packages/shared-contract/non-scheduling-keys.json`, `apps/api/src/entries/{partners,partner_routes,lifecycle,retention,money}.py` |
4. **Docs reorg** — the spec's deliverable paths are stale. Current homes: audits → `docs/history/audits/`, specs → `docs/history/superpowers/specs/`, program ledgers → `docs/history/programs/`, live debt-log → `docs/reference/debt-log.md`.
5. **Concurrent-agent hygiene:** reads are safe; the only writes are the three docs. Commit them **path-limited** (`git commit -- docs/...`) — precedent: the SP-P8 plan doc was committed on this branch the same way. Never bare `git add .`; never `git stash`.

## Deliverables

1. `docs/history/audits/2026-08-24-domain-model-audit.md` — census matrix, identity trace, seam map, blast radius, `F-DM-*` register, ≤1-page exec summary on top.
2. `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md` — target model, Strangler-Fig phases, `R-DM-*` decision list.
3. `docs/history/programs/DM1_PROGRESS.md` — ledger (task record, pinned SHA, verification note).

*(Date the filenames to the actual execution date if it differs.)*

## Global constraints (from spec §0, corrected by planning)

- Read-only; the three docs above are the only writes. Any "quick fix" urge → record as a finding.
- Every finding: stable ID `F-DM-*`, severity (blocking / structural / cosmetic), evidence resolving to a real path in the audit-target tree at the pinned SHA.
- Explicit "not fragmented here" findings where an area is clean.
- Decisions → numbered `R-DM-*` with options / trade-offs / recommendation. Fold in F-E1 (=debt-log **D8**, open) and **D7's remaining Phase-10 half** (CASCADE — ruled 2026-08-21; cite the ruling, only the account-deletion half is open). **F-E1-2 is CLOSED** (`fc26f5a`, 2026-08-10) — cite the closure, do not re-open.
- **R15 has no text anywhere in the tree** (confirmed: flagged in `docs/history/superpowers/specs/2026-08-11-sp-p6-2-public-ia-design.md:65` and `docs/history/programs/SP-COURT-1.md:234`). "Profile v1" is a deferral marker, not a citable ruling — raise as an owner-supply `R-DM-*` item; never quote R15.
- **Person-in-tournament identity is ANSWERED** — `docs/history/programs/SP-P7-phase0-audit.md`: `entry_players (tournament_id, id)` is it; `person_key = entry_player_id`; caveat that hand-added roster players and bracket participants lack `entry_player` rows. Cite; do not re-derive.
- Vocabulary per ADR 0014 (`docs/explanation/decisions/0014-...`): *workspace* = product word, *tournament* = storage word. Respect ADR 0006 (don't merge the match record) and ADR 0009 (universal match contract) when drawing the target model.
- **Findings-ID protocol:** parallel workers never mint `F-DM` numbers — they emit `PF-<task>-<n>` (one-line claim, severity guess, `path:line`). Task 7 dedupes and assigns final `F-DM-01..N`. Same for decisions: workers emit proposals; Task 8 assigns `R-DM-*`.

## Scouted starting points (verified concepts; re-resolve every path per the translation table)

- **Storage** (`apps/api/src/db/models.py`, ~1700 ln in old layout): `Tournament(id uuid, kind meet|bracket)`; Meet = `matches`/`match_states` tables + the whole `TournamentStateDTO` in `tournaments.data` blob (versioned 3 ways: `schema_version` col, `state_version` col, `data["version"]`); Bracket = `bracket_events/participants/matches/results` composite-PK tables, several **without FK constraints**; Entries = `entrant_accounts/entrant_sessions/submissions/entry_players/entry_events/entries/entry_pages` — `Entry.entry_event_id/submission_id/entry_player_id/partner_entry_id` are **bare Uuid, no FK**. No pair table: doubles = `Entry.partner_entry_id` + `BracketParticipant.member_ids` JSON (check current `partners.py` — E3 landed after the scout snapshot).
- **Unversioned blobs:** `bracket_participants.member_ids/.meta`, `bracket_results.score`, `entries.pending_reasons`, `submissions.fee_basis`, `entry_pages.fee_schedule/.discipline_caps`, `workspace_modules.config`, `tournament_backups.snapshot`, `commands.payload`, `solve_jobs.*`. Versioned: `tournaments.data`, `bracket_events.config`, `bracket_matches.*` (version col).
- **DTO ×3 families for the same concept:** standings (`MeetStandingRowDTO` vs bracket router `StandingRowOut` vs entries_site `StandingRowDTO`), match (`MatchDTO` vs `PlayUnitOut` vs `MatchNodeDTO`), player (`PlayerDTO` vs `BracketPlayerDTO` vs `PlayerPageDTO`/`TeamDTO`). Bracket shapes live router-local (old `api/brackets.py:~201-530` — re-locate by class name under `apps/api/src/bracket/`), public shapes router-local in `apps/api/src/entries/{entries_json,entries_site,entries_me}.py`.
- **Meet↔Bracket reconciliation:** `entries_site.py` `_bracket()`/`_meet_matches()` fold both origins into `PlayerPageDTO`/`DrawDetailDTO`. Other `kind` branches: display mode selection, `workspace_signals` (`source: Literal["meet","bracket"]`), tournament create validation. Ignore unrelated `kind` fields (`bracket_matches.kind` MATCH/BYE, `PlayUnitKind`, backup `origin`).
- **scheduler_core I/O** (read-only observation): `packages/scheduler-core/scheduler_core/domain/models.py` (`ScheduleRequest/Player/Match/ScheduleResult…`), `domain/tournament.py` (`TournamentState/Event/PlayUnit/Participant/Result`).
- **Operator frontend:** `apps/console/src/api/dto.ts` (hand-maintained mirror of `schemas.py`; its docstring calls `dto.generated.ts` authoritative, yet the 8.6k-line generated file is **imported by nothing** — verify with grep, that's a finding) + `bracketDto.ts` (second hand mirror) + `client.ts` inline shapes; `platform/domain/match.ts` = a second UI match model; `lifecycle.ts` duplicates `TournamentStatus`. Zustand stores exist only for tournament/ui/matchState — Bracket/Ops/Display/entries are hook + module-local state.
- **Entrant app:** `apps/entrant/app/lib/{entryPage,draws,player}.types.ts` — third mirror set; `EntryPageDTO` **name-collides** with the operator's (different shape); third `StandingRowDTO`; docstrings cite backend line numbers (rot risk); RR7 loaders are the state layer (no store — likely a "not fragmented, deliberate" finding).
- **Name-keying candidates:** `apps/console/src/lib/playerSlug.ts` (name-derived slug identity — root site), `bracket/bracketMigration.ts` `nameFromSlug()` (cites defect D3), entries desk `nameById` from `playerName`, entrant `echo.ts` lowercased string compare. Positive control: public `personKey` **is** a UUID (`entries_site.py`, old line 848).

---

## Tasks

Dependency graph: **1 → (2a ‖ 2b ‖ 2c ‖ 2d) → 3 → (4 ‖ 5) → 6 → 7 → 8 → 9.** Sizes: 1 S · 2a–d M×4 · 3 S · 4 M · 5 L · 6 S · 7 M · 8 L · 9 S.

### Task 1 — Prior-art citations pack + ledger init (S, first)

- [ ] Read `docs/history/programs/SP-PROGRAM-1.md:44-109` (R1–R14 verbatim), `SP-P7-phase0-audit.md`, `docs/reference/debt-log.md` (D3, D7, D8), `docs/history/superpowers/specs/2026-08-06-entries-design.md` §9.3, ADRs 0002/0003/0006/0008/0009/0011/0014, `docs/reference/modules/entries.md`.
- [ ] Extract verbatim the ruled decisions downstream tasks must cite and must NOT re-ask (person-in-tournament, D7 ruling + open half, F-E1/D8 open, F-E1-2 closure). Grep-confirm R15 is still text-less.
- [ ] Create `docs/history/programs/DM1_PROGRESS.md` with the pinned HEAD SHA and task list; draft the audit doc's "Prior art & ruled decisions" appendix.
- [ ] This citations pack is pasted into every downstream subagent prompt.

### Task 2 — Census fan-out: 4 parallel subagents (M each)

Each fills its layer's column of the 8-concept matrix (**Tournament, Event, Entry/Submission, Player/Person, Partner/Pair, Draw, Match, Result**) — one cell = the identifying key/type at that layer, `absent — verified` for empty cells (never blank) — and emits `PF-2x-*` proposals.

- [ ] **2a Storage:** `apps/api/src/db/models.py` + `apps/api/src/alembic/` — tables, PK/FK per concept; the FK-less bare-Uuid columns; complete blob inventory with version-field yes/no per blob; the `partners.py` model additions if any.
- [ ] **2b Backend DTOs + scheduler_core:** `apps/api/src/core/schemas.py`; router-local shapes across `apps/api/src/{bracket,meet,entries,display,workspaces}/` (re-locate `ParticipantOut/PlayUnitOut/EventOut/StandingRowOut` and the entries_* DTO families by class name); `packages/scheduler-core/scheduler_core/domain/{models,tournament}.py`; `packages/shared-contract/non-scheduling-keys.json`. Tabulate the ×3 shape families.
- [ ] **2c Operator frontend:** `apps/console/src/api/{dto,dto.generated,bracketDto}.ts`, `client.ts` inline shapes, `platform/domain/{match,lifecycle}.ts`; grep-verify `dto.generated.ts` import count; store-vs-hook inventory per concept.
- [ ] **2d Entrant app:** `apps/entrant/app/lib/{entryPage,draws,player}.types.ts` + route-local loader shapes; the name collision, third `StandingRowDTO`, line-number-docstring rot; which `/e/api/*` endpoint feeds each type.

### Task 3 — Census merge (S, one context)

- [ ] Assemble matrix §(a) from 2a–2d; resolve conflicts by re-reading the file, not by vote; enforce no-silent-empty-cells.
- [ ] The merged matrix text seeds Tasks 4 and 5.

### Task 4 — Identity trace (M, parallel with 5, matrix-seeded)

- [ ] Per subsystem, state the key for a human being (string name / row / account FK / slug). Every name-string join = a `PF` proposal. Re-resolve the name-keying candidates listed above; cite defect D3 where `bracketMigration.ts` already owns it.
- [ ] Doubles/pair modeling as it exists NOW (`partners.py` + `partner_entry_id` + `member_ids`) — symmetric and enforced, or duplicated?
- [ ] Meet-vs-Bracket origin split for the same person; where the same human is N disconnected records.
- [ ] Cite SP-P7-phase0-audit for person-in-tournament; record the positive control (public `personKey` = UUID) as an explicit not-fragmented finding.

### Task 5 — Contract seams + end-to-end traces (L, parallel with 4, matrix-seeded)

- [ ] Classify every cross-layer boundary: typed seam / shared-table coupling / shape copy-paste.
- [ ] Two literal traces — one **singles**, one **doubles** — account → submission → entry → event → draw → match, writing the actual key (`table.column` or `DTO.field`) at every hop; mark FK-less hops and `kind` branches. Use `apps/api/src/entries/{submissions,entries,partners,lifecycle}.py` and the bracket/meet generation path.
- [ ] Per public projection (entries_json listing incl. the new SP-P8 season payload, entries_site draws/seeds/winners/players, entries_me): exactly which tables/columns it reads, and whether the target model changes its inputs.

### Task 6 — Blast radius (S, grep counts)

- [ ] For each fragmented area surfaced by 2–5 (name-slug identity, StandingRow ×3, hand-mirrored dto.ts, FK-less Entry columns, unversioned blobs, kind branches, …): grep-count referencing files/call-sites/tests in the audit tree. Rough counts, no precision theater.

### Task 7 — Consolidation: findings register + exec summary (M, the merger)

- [ ] Dedupe all `PF-*`, assign `F-DM-01..N` ordered by severity (blocking/structural/cosmetic), each ≤3 lines with evidence.
- [ ] Include the explicit not-fragmented findings and the honest verdict (how fragmented is it really).
- [ ] Write the ≤1-page exec summary on top: five most consequential findings, single riskiest area, the one decision that unblocks the most. Update ledger.

### Task 8 — Unification plan doc (L, one context)

- [ ] Target model diagram: Kyle's hierarchy (Account → PlayerProfile → TournamentPlayer → EventEntry → match participation; Tournament → Event → Draw → Match; joined only at EventEntry ↔ Draw slot), every entity annotated with owning module + key. Deviate only if a specific `F-DM` finding forces it, and say which. Map existing tables onto it (e.g. does `entry_players` ≙ TournamentPlayer already? — SP-P7 phase 0 suggests yes with caveats).
- [ ] Strangler-Fig phases, each with: goal, migrations, code moves, tests incl. negative controls on new invariants, deletion gate (grep/depcruise guard proving nothing reads the legacy shape), S/M/L, and blocks / blocked-by / independent vs SP-P7 + SP-P8 — including an argued build-or-defer call on further P7 projections. JSON-blob version discipline = early phase. Candidate delete-list from the audit (e.g. `dto.generated.ts` if confirmed unimported).
- [ ] `R-DM-*` decision list: options / trade-offs / recommendation / which findings each resolves. Must include F-E1 (cite entries-design §9.3 ownership), D7's Phase-10 half, R15-as-owner-supply. Cross-check every entry against the Task 1 pack — cite ruled decisions instead of re-asking. Update ledger.

### Task 9 — Spot-check verification (S, fresh subagent, no prior context)

- [ ] Given only the two finished docs: resolve every evidence path against the audit tree at the pinned SHA; scan the matrix for blank cells; confirm both traces reach match with a key at every hop; diff the `R-DM` list against R1–R14 + the D7 ruling for re-asked decisions; flag essay-length findings.
- [ ] Emit a fix-list; the Task 7/8 context applies fixes (doc edits only). Append the verification note to the ledger.
- [ ] Commit all three docs path-limited: `git commit -- docs/history/audits/... docs/history/superpowers/specs/... docs/history/programs/DM1_PROGRESS.md`.
- [ ] **STOP.** Kyle reviews and issues `R-DM` rulings; no implementation prompt gets drafted.

## Verification (of this plan's execution)

- Spec §5 checks are Task 9 (path resolution, no empty cells, complete traces, no re-asked rulings, terse findings).
- No tests/builds to run — deliverables are documents. Success = both docs exist at the stated paths, every citation spot-checks, ledger records the pinned SHA, `git status` shows no writes outside `docs/`.

---

## Appendix A — The SP-DM-1 prompt (verbatim)

# SP-DM-1 — Domain Data-Model Audit: Tournament → Event → Player → Profile

**Status:** Exploration and planning only. **This prompt authorizes zero implementation code, zero migrations, zero schema edits, zero refactors.** The deliverables are documents. Any urge to "quickly fix" something found along the way is a violation — record it as a finding instead.
**Why now:** SP-P7 (public entrant surfaces) and SP-P8 (season-calendar homepage) both build public projections on top of the domain model. Kyle's hypothesis is that the model underneath is **fragmented**: "tournament," "event," "entry," and "player" are represented differently across Meet, Bracket, Operations, the entries system, and the public tier, with no clean contract hierarchy. Building more projections on a fragmented base multiplies the cost of fixing it later. This audit verifies (or refutes) the hypothesis with evidence and produces a plan.

## 0. Absolute rules

1. **Read-only.** No commits that change behavior. The only writes permitted are the deliverable documents (§4) and the ledger update.
2. **Evidence or it didn't happen.** Every finding cites file paths (and line refs where useful), table names, DTO/type names. No from-memory claims about the tree — this codebase has caught from-memory slips before.
3. **The hypothesis is to be tested, not confirmed.** If an area is actually clean, say so explicitly — "not fragmented here" findings are as valuable as fragmentation findings. Kyle wants honest assessment, not validation.
4. **Findings get stable IDs** (`F-DM-1`, `F-DM-2`, …) with severity (blocking / structural / cosmetic) so they can be referenced in future rulings and prompts.
5. **Decisions belong to Kyle.** Where the target model requires a judgment call, present the options with trade-offs as a numbered decision list (`R-DM-*` candidates) — do not pick silently. This includes the already-queued rulings this audit will collide with: F-E1 (rank-slot mapping), F-E1-2 (roster-row multiplication — one person in multiple events), and the entrant CASCADE/deletion model.
6. **Respect standing architecture:** four-module model (Meet/Bracket produce, Operations operates, Display projects); match as shared currency; public tier reads published projections only; R13 chain (account → submission → entry → player); R15 (profile v1 = identity + tournament history). The target model must express these, not fight them.

## 1. The mental model to audit against

Kyle's intended hierarchy — the "easy contract" the system should read as:

```
Account (auth principal, entrant)                 [global]
 └─ PlayerProfile (public identity + history)     [global, R15]
     └─ TournamentPlayer (person-in-tournament)   [per tournament]
         └─ EventEntry (participation in one event,
             incl. partner linkage for doubles)   [per event]
             └─ Match participation (sides/slots) [per match]

Tournament (workspace)
 └─ Event (e.g. "A Men's Doubles")
     └─ Draw (RR pool / elimination bracket)
         └─ Match
```

Two spines — **people** and **competition structure** — joined at exactly one seam: EventEntry ↔ Draw slot. The audit's job is to map how far reality deviates from this, where the deviations are load-bearing history vs. accidental drift, and what the cheapest safe path toward the contract is.

Note: this diagram is Kyle's *intent*, not a claim about the tree, and not necessarily the final target — if the audit finds the tree is closer to a different-but-equally-clean shape, propose that instead and argue it.

## 2. Audit scope — the questions to answer

### 2.1 Representation census
For each concept — **Tournament, Event, Entry/Submission, Player/Person, Partner/Pair, Draw, Match, Result** — enumerate every representation across:
- Postgres tables (SQLAlchemy models) and their relationships/constraints,
- backend DTOs and serializers (operator API and public API separately),
- frontend TypeScript types and Zustand store shapes,
- JSON state blobs (the known long-horizon risk — document which concepts live inside opaque JSON vs. real columns, and whether the blobs carry version fields),
- `scheduler_core` input/output structures (read-only observation; core itself is out of scope for change).

Present as a matrix: concept × layer, with the identifying key used at each cell.

### 2.2 Identity tracing (the heart of it)
- How is a **human being** keyed in each subsystem? Where is a person a string name, where a row, where an account FK? Where does the same human exist as N disconnected records (Meet roster string, bracket participant row, entry row, entrant account)?
- Where do joins happen **by name string** rather than by key? Each instance is a finding.
- Does a **person-in-tournament** identity exist anywhere today, or is it implicit? (SP-P7's R-P7c depends on this — if SP-P7's Phase 0 already answered it, cite that report rather than re-deriving.)
- Doubles: how is a **pair** modeled — a first-class entity, two FKs, a concatenated string? Is partner linkage symmetric and enforced, or duplicated data?
- The Meet vs. Bracket **origin split**: the legacy `kind` schema families — how differently do the two origins model the same concepts, and what already bridges them (the Operations match seam)?

### 2.3 Contract seams
- Where module boundaries pass data today: what's a typed seam, what's an implicit shared-table coupling, what's a copy-paste of shapes?
- The entries system → competition structure handoff (submission confirmed → player exists in an event → appears in a draw): trace the actual data flow end to end for both a singles and a doubles entry. Every hop that re-keys or re-shapes silently is a finding.
- Public projections (whatever exists of SP-P7/P8 at audit time): what do they read, and would the target model change their inputs?

### 2.4 Blast-radius inventory
For the areas found fragmented: which surfaces, stores, serializers, and tests touch each fragmented representation (rough counts, not exhaustive lists) — this feeds the plan's phasing and risk assessment.

## 3. Constraints on the proposed plan

- **Strangler Fig, not big-bang.** The plan must be phased with incremental deletion gates; each phase leaves the system shippable. Characterization tests before any restructuring of complex paths.
- **Schema migrations are the unavoidable kind** — treat them as the critical path; platform-level rewrites are out.
- **JSON blob versioning:** if the audit confirms unversioned state blobs carry domain concepts, the plan must include introducing version discipline as an early phase (this is a standing identified risk).
- Each phase specifies: goal, migrations, code moves, tests (incl. negative controls on any new invariants), and its deletion gate (what legacy representation dies and how we prove nothing reads it — dependency-cruiser / grep guards where apt).
- The plan must sequence around SP-P7/SP-P8: state explicitly for each phase whether it blocks, is blocked by, or is independent of them — and whether any SP-P7 projection should be *deferred* until a phase lands (an honest "build P7 later" recommendation is acceptable and must be argued, not assumed).
- Estimate relative effort per phase (S/M/L), not time.

## 4. Deliverables (documents only)

1. `docs/audits/<date>-domain-model-audit.md` — the census matrix (§2.1), identity trace (§2.2), seam map (§2.3), blast radius (§2.4), and the findings register `F-DM-*` with severity + evidence. Include the honest verdict: how fragmented is it really, and where is it actually fine.
2. `docs/superpowers/specs/<date>-domain-model-unification-plan.md` — target model (diagrammed, with every entity's owning module and key), the phased plan per §3, and the **decision list** `R-DM-*` for Kyle: each with options, trade-offs, a recommendation, and which findings it resolves (fold in F-E1, F-E1-2, and the CASCADE question rather than leaving them parallel).
3. A ≤1-page executive summary at the top of the audit doc: the five most consequential findings, the single riskiest area, and the one decision that unblocks the most.

**STOP after delivering.** Kyle reviews, issues R-DM rulings, and only then does an implementation prompt get written (separately). Do not draft the implementation prompt.

## 5. Verification of the audit itself

- Every F-DM finding's evidence resolves to a real path in the tree (spot-checkable).
- The census matrix has no empty cells silently — "not represented at this layer" is stated where true.
- Both entry trace walkthroughs (singles + doubles) are complete: account → submission → entry → event → draw → match, with the actual key at every hop.
- The decision list contains no decision already answered by a standing ruling (check R7–R15 and prior R-* records first; cite the ruling instead).
- Word count discipline: findings are terse fragments with evidence, not essays.

*(End of verbatim prompt. Planning notes: §4's paths and §5's "R7–R15" are corrected by this plan's Environment corrections — deliverables go to the `docs/history/` locations, and R15 has no recorded text.)*
