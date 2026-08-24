# SP-DM-1 — Domain Data-Model Audit

**Date:** 2026-08-24 · **Branch:** `docs/dm1-audit` · **Pinned SHA:** `e67633fe` (working tree = `e67633fe` + the plan doc + the workspace artifacts)
**Plan:** `docs/history/superpowers/plans/2026-08-24-sp-dm-1-domain-model-audit.md` (the verbatim SP-DM-1 prompt is its Appendix A, §0–§5)
**Companion deliverable:** `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md` (target model, phases, `R-DM-*`)

Paths are plain code spans, not doc links, so this page never trips the dead-link gate.

---

## 0. Executive summary

**Verdict headline.** The people spine and the competition spine are each internally coherent. **The seam between them is a formatted string**, and that is where nearly every blocking finding lives. The hypothesis "the model underneath is fragmented" is **confirmed at the seams and at identity minting, and refuted at storage**: R13's `entrant_accounts → submissions → entries → entry_players` chain, the four bracket tables, and the 15-table workspace cascade are the cleanest regions in the tree. What is fragmented is (a) how a *human* acquires an identity, (b) how that identity crosses into competition structure, and (c) how every type surface above the API is kept in step — by eye.

**The five most consequential findings.**

1. **F-DM-01 / F-DM-02 (blocking) — the person-identity *rule* is ruled; its advisory backstop has two holes.** A blank `birth_year` is *designed* to mint a separate row and ride a `NEEDS_REVIEW` flag (§8.7) — but `looks_duplicate` is scoped to one `entry_event_id`, so a fork across different events is flagged nowhere, and `partners.accept()` never calls `same_person` at all. The identity SP-P7/SP-P8 project on can fork **silently and unflagged** in production.
2. **F-DM-03 (blocking) — doubles does not survive intake.** `_plan_bracket` emits `{"type":"PLAYER","member_ids":[]}` for every entry regardless of `entry_type` or `partner_entry_id`; an accepted pair reaches the draw as two unrelated singletons and a director re-mints it by hand as a name concatenation.
3. **F-DM-05 (blocking) — the people spine reaches the competition spine through one unconstrained String pointing *into* a JSON blob.** `entries.committed_player_id` → `tournaments.data["players"][].id`, bridged by `f"entry-{uuid}"` re-derived independently in three files. Zero FK-bearing hops on that whole path.
4. **F-DM-04 (blocking) — a bracket person's primary key is a slug of their display name.** Two same-named people are one participant; a rename re-keys the person; a repair routine decides a row is corrupt by testing `p.name === p.id` and persists its guess.
5. **F-DM-06 (blocking) — 23 of 24 JSON blobs carry no version field**, including every blob holding a domain concept (pair `member_ids`, draw slots and dependencies, result `score`, `pending_reasons`, `fee_basis`). The one versioned blob is versioned three incompatible ways.

**The single riskiest area — Area 1, person-in-tournament identity minting** (37 files · 112 call sites · 20 test files). Not the largest blast (that is Area 5, the console hand mirrors at 221 files), but the only area where the defect is **silent**: a forked `personKey` produces a second public player page that looks correct on every surface, whereas a lost doubles pair (Area 3) is visible to the director the moment they open the draw. Silent + foundational to every public projection = the risk to rank first.

**The one decision that unblocks the most — the person-spine ruling.** Does `entry_players` become the canonical `TournamentPlayer` with (a) an id-bearing, FK-bearing link into competition structure replacing the `entry-{uuid}` string, and (b) a global `PlayerProfile` above it? That single ruling resolves **F-DM-01, 02, 04, 05, 16, 17, 18, 19** and settles whether profile v1 is in scope at all. **R15 has no ruling text anywhere in the tree** (24 grep hits, all deferral markers or phantom-flags) — profile v1 is therefore an **owner-supply** input, not a citation.

**Honest counterweight.** Sixteen findings (F-DM-62..77) are explicit *not*-fragmented entries, and four of them are prior art the target model should copy rather than invent: `personKey` as an opaque UUID, `NextMatchDTO.source` + the console's `matchKey`, `entries.entry_event_id`'s composite CASCADE FK, and `packages/shared-contract/non-scheduling-keys.json` — the one cross-tier contract in the repo with a machine-enforced parity test on both sides.

---

## 1. Traceability

Full text of the rules and checks: **Appendix A of the plan** (`docs/history/superpowers/plans/2026-08-24-sp-dm-1-domain-model-audit.md`, §0–§5). Compact restatement, one line per section:

| § | Restatement | Status in this doc |
|---|---|---|
| §0.1 | Read-only; the only writes are the deliverables + ledger | Held — this file and the workspace artifacts only |
| §0.2 | Evidence or it didn't happen; every finding cites `path:line` | Held — every F-DM carries paths |
| §0.3 | Test the hypothesis, don't confirm it; "not fragmented" findings count | Held — F-DM-62..77, 16 entries |
| §0.4 | Stable ids `F-DM-*` with severity blocking/structural/cosmetic | Held — F-DM-01..77, §7 |
| §0.5 | Decisions are Kyle's; `R-DM-*` candidates, never picked silently | Deferred to the companion spec (Task 8) |
| §0.6 | Respect four-module model, match-as-currency, R13, R15 | Held — R13 is the audited spine; R15 flagged textless |
| §1 | The intended hierarchy: Account → PlayerProfile → TournamentPlayer → EventEntry → match participation; Tournament → Event → Draw → Match; joined at EventEntry ↔ Draw slot | Mapped in §5's traces; deviations are §7's findings |
| §2.1 | Representation census, 8 concepts × 6 layers, key per cell | §3 |
| §2.2 | Identity tracing: name-joins, person-in-tournament, doubles, `kind` split | §4 |
| §2.3 | Contract seams: typed / shared-table / copy-paste; two end-to-end traces; public projection inputs | §5 |
| §2.4 | Blast-radius inventory, rough counts | §6 |
| §3 | Strangler Fig, migrations are the critical path, blob versioning early, SP-P7/P8 sequencing, S/M/L | Companion spec (Task 8) |
| §4 | Deliverables: this audit doc + the unification spec + a ≤1-page exec summary on top | §0 above |
| §5.1 | Every evidence path resolves in the tree | Task 9 verifies |
| §5.2 | No silently empty matrix cells — `absent — verified` where true | §3, carried verbatim |
| §5.3 | Both traces complete, actual key at every hop | §5.2 (TRACE A, 15 hops) and §5.3 (TRACE B, 15 hops) |
| §5.4 | No decision already answered by a standing ruling | §8 appendix; ruled items cited, never re-asked |
| §5.5 | Terse fragments with evidence, not essays | Every F-DM ≤3 lines, except the two positive-control bundles (F-DM-75, F-DM-77), which enumerate several cited items each |

Corrections applied from the plan's Environment section: deliverables live under `docs/history/`; §5.4's "R7–R15" reads R1–R14 plus the D7 ruling, because **R15 has no recorded text**.

---

## 2. Method and sources

Six artifacts under `.superpowers/sdd/2026-08-24-sp-dm-1-domain-model-audit/`, all pinned at `e67633fe`: `citations-pack.md` (Task 1), `census-2a..2d.md` (Task 2, four parallel layer censuses), `matrix.md` (Task 3 merge, conflicts C-1..C-6 settled by re-reading the cited file, never by vote), `identity-trace.md` (Task 4), `seam-trace.md` (Task 5), `blast-radius.md` (Task 6). This document is the Task 7 consolidation; `F-DM-*` numbers are minted here and nowhere else.

**Exclusions applied to every count:** `archive/`, `.claude/`, `docs/`, `.superpowers/`, `node_modules/`, all `*.md`, and the generated `apps/console/src/api/dto.generated.ts` (except where its *mentions* are the point).

---

## 3. The census matrix — 8 concepts × 6 layers

Rendered as one block per concept with the six layers as **rows** (Storage · Backend DTO operator · Backend DTO public · `scheduler_core` · Console · Entrant): six `path:line` columns are unreadable. Same matrix, transposed. `absent — verified` is carried verbatim; **no cell is blank**.

### 3.1 Tournament (= workspace; ADR 0014 — vocabulary is ruled, not a finding)

| Layer | Representation | Identifying key |
|---|---|---|
| Storage | `tournaments` (`db/models.py:86`), the only table; 15 tables cascade off it | `tournaments.id` Uuid (`:89`). Discriminator `kind` `meet\|bracket` String, **no CHECK** (`:121`). Meet's whole non-match domain lives in `tournaments.data` JSON (`:129`). **Season/calendar storage: `absent — verified`** (SP-P8 is a pure projection, no migration past `x8d3e9f1a6b7`) |
| Backend OP | `TournamentSummaryDTO` (`workspaces/tournaments.py:75`) · `TournamentStateDTO` (`core/schemas.py:1008`) · `TournamentOut` (`bracket/brackets.py:370`) | uuid `id` on the summary; **no id at all** on the state blob or `TournamentOut` — identity is the route param |
| Backend PUB | `TournamentDTO` name+date (`entries/entries_json.py:293`) · `SeasonRowDTO` (`entries_json.py:531`) · `MyTournamentCardDTO` (`entries/entries_me.py:92`) · `DisplaySummaryDTO` (`display/display.py:111`) | `entry_pages.slug` (season row) · **nullable** `slug` (my-card) · capability token (display, no id) |
| scheduler_core | `absent — verified` — `TournamentState`/`TournamentAssignment` are state containers with **no tournament id** (`scheduler_core/domain/tournament.py:114`) | — |
| Console | `TournamentSummaryDTO` (`api/dto.ts:853`) · `TournamentStateDTO` (`dto.ts:470`) · bracket `TournamentDTO` (`api/bracketDto.ts:173`) · `useTournamentStore` (`store/tournamentStore.ts:22`) | uuid · no id (route param) · no id field · **store holds no id** (supplied by `hooks/useTournamentId.ts`) |
| Entrant | `EntryTournamentDTO {name,date}` (`lib/entryPage.types.ts:102`) · `SeasonRow` (`lib/phase.ts:56`) · `MyTournamentCard` (`public/assets/my-entries.d.ts:23`) | **`slug`. No workspace UUID exists anywhere on this tier** — positive control |

### 3.2 Event — splits **three** ways (Meet / Bracket / Entries), not two

| Layer | Representation | Identifying key |
|---|---|---|
| Storage | **Bracket:** `bracket_events` (`models.py:412`) · **Meet:** `absent — verified` (no `events`/`meet_events` table; a division is a rank-code string in `tournaments.data["players"][].ranks[]`, `models.py:1388-1391`) · **Entries:** `entry_events` (`models.py:1385`) | Bracket `(tournament_id, id String(100))` — id **is the discipline code**, e.g. `"MS"` (`:428`) · Entries `(tournament_id, id Uuid)` + `code String(40)` (`:1408`) · cross-family `entry_events.bracket_event_id` String, **no FK, ruled** (`:1395-1399`; `s3d8f2b5c0e1:83-87`); Meet mapping is code↔`ranks[]` string with **no storage join at all** (D8/F-E1) |
| Backend OP | **Meet:** `absent — verified` — no Event class; an event is `MatchDTO.eventRank` / `PlayerDTO.ranks: List[Code]` (`core/schemas.py:249,309`) · **Bracket:** `EventOut` (`brackets.py:339`) · **Entries:** `EntryEventDTO` (`schemas.py:935`) | discipline code `"MS"` (bracket) · uuid `id` + `code` + `bracketEventId` (entries) |
| Backend PUB | `EventDTO` (`entries_json.py:197`) · `SeedsEventDTO`/`WinnersEventDTO`/`PlayerEventDTO` (`entries_site.py:199,215,229`) · `DrawCardDTO` (`entries_site.py:103`) | uuid+`code` on the write-facing shape; **`eventCode: str` on every read projection** |
| scheduler_core | `Event` dataclass (`domain/tournament.py:105`) | `id: EventId = str` |
| Console | Meet `TournamentConfig.rankCounts` (`dto.ts:43`) + `PlayerDTO.ranks` (`:287`) + `MatchDTO.eventRank`/`.eventCode` — **two fields, one fact** (`:341-342`) · Bracket `EventDTO` **unexported** (`bracketDto.ts:142`), reached via structural alias (`modules/bracket/eventUpsertPayload.ts:17`) · Entries `EntryDTO.entryEventId` + denormalized `.eventCode` (`dto.ts:690,693`) | rank-code string · `id` · uuid **and** code side by side. **No shared Event type in the console** |
| Entrant | `EntryEventDTO` (`lib/entryPage.types.ts:22`) write path; `SeedsEventDTO`/`WinnersEventDTO` (`lib/draws.types.ts:95,111`), `PlayerEventDTO` (`lib/player.types.ts:29`), `MyEntryLine` (`my-entries.d.ts:8`) read path | **two keys on one tier:** the form posts `event.id` uuid (`routes/enter.tsx:280,291` → `entries/entry_form.py:57`); all six read shapes key by `eventCode` string |

### 3.3 Entry / Submission

| Layer | Representation | Identifying key |
|---|---|---|
| Storage | R13 chain fully materialized: `entrant_accounts:1102` → `submissions:1217` → `entries:1453` → `entry_players:1309`, plus `entry_events:1385`, `entry_pages:1625`, `entrant_sessions:1170` | `(tournament_id, entries.id)` / `(tournament_id, submissions.id)`; link `entries.submission_id`. `entrant_accounts.id` is **not** workspace-scoped (deliberate, D-A2). Exactly one uniqueness constraint across the entries tables: `uq_submissions_tournament_account_idempotency_key` (`:1298`) — no natural-key uniqueness at any level (R13/Q12, ruled). The other two in the tree are the email functional uniques on `users:953` / `entrant_accounts:1166`. Soft-dup index `ix_entries_event_player` non-unique on purpose (`:1566`) |
| Backend OP | `EntryDeskRowDTO` (`schemas.py:715`) · `EntrySubmissionDTO` (`:671`) · `EntryCommitOutcomeDTO`/`EntrySkipDTO`/`EntryCommitResultDTO` (`:771,777,787`) · `SubmissionPaymentDTO` (`entries_routes.py:358`) · `EntriesFacts` counts (`workspaces/entries_facts.py:68`) | `entries.id` + `entryEventId`; `submissions.id` |
| Backend PUB | `MyEntryLineDTO` (`entries_me.py:60`) · `ExportedEntryDTO`/`ExportedSubmissionDTO` (`entries_me.py:555,564`) · `EntrantRowDTO` (`entries_json.py:229`) · `ReserveRowDTO` (`entries_json.py:316`) · `PartnerAcceptedDTO` (`partner_routes.py:81`) | `entryId`+`personKey` · **no ids at all** (portability projection, deliberate) · `personKey` (a *person* row, not an entry row) · `eventCode`+`position`+**name string** (reserves, keyless) |
| scheduler_core | `absent — verified` — grep `entry\|submission\|account` over `scheduler_core/domain/` → 0 hits. Invariant I3 holds at the type level | — |
| Console | `EntryDTO` (`dto.ts:688`; backend name is `EntryDeskRowDTO`) · `EntrySubmissionDTO` (`:728`) · `EntryState` 6-union (`:667`) · `EntryPageDTO` (`:912`) · module-local `EntryGroup` (`modules/entries/entryDisplay.ts:101`) · **store: `absent — verified`** (no entries store; `EntriesDesk.tsx:94` `useState`) | `id`; submission id is the documented grouping key (`dto.ts:720`) |
| Entrant | `MyEntryLine.entryId` (`my-entries.d.ts:15`) · `ReceiptLoaderData.submissionId` (`routes/receipt.tsx:79`) · `FormEcho`/`PlayerEcho` (`lib/echo.ts:65,40`) | entry uuid / submission uuid. **The R13 chain is not modelled here** — `MyTournamentCard` *is* a submission but is named a tournament card (F-DM-42) |

### 3.4 Player / Person

| Layer | Representation | Identifying key |
|---|---|---|
| Storage | **Five shapes.** `users:919` (operator) · `entrant_accounts:1102` (entrant principal, separate namespace by design) · **`entry_players:1309` = the ruled person-in-tournament identity** · `bracket_participants:456` (name String + id String, **no FK to any person**) · Meet roster **`absent — verified`** (as a table; it lives in `tournaments.data["players"]`, `core/schemas.py:1019`, plus `data["bracketPlayers"]`, `schemas.py:1032`) | `entry_players (tournament_id, id)` — `person_key = entry_player_id`, **never the name** (cite `SP-P7-phase0-audit.md:64-76`). Only cross-shape link: `entries.committed_player_id` String→blob roster id (`models.py:1542`). Ruled caveat: hand-added roster players + bracket participants have no `entry_player` row. **Global `PlayerProfile` / cross-tournament person: `absent — verified`** — nothing spans tournaments except `entrant_accounts` |
| Backend OP | `PlayerDTO` (`schemas.py:244`) · `BracketPlayerDTO` (`:272`) · `ParticipantOut` (`brackets.py:244`) · `EntryDeskRowDTO.playerName` + `committedPlayerId` (`schemas.py:746,749`) · `PlayerImpact` (`:468`) | roster uuid **or** `entry-{entry_player_id}` · frontend name-slug · participant id (slug or `entry-…`) · **a bare name string** on the desk |
| Backend PUB | `EntrantRowDTO.personKey` (`entries_json.py:247`) · `PlayerPageDTO.personKey` (`entries_site.py:265`, set at `:1041`) · `TeamDTO.participantKey` (`entries_site.py:118`) · `SeedLineDTO`/`HonorDTO`/`PlayerMatchSideDTO` (`entries_site.py:193,210,242`) · `ExportedPlayerDTO` (`entries_me.py:544`) | **`personKey` = `entry_players.id` UUID — the positive control** · `participantKey` = bracket participant id · **`names: List[str]` only, no key** on seeds/winners/match sides · `fullName` only (export). Bridge between the two key-spaces is the string convention `roster_id = f"entry-{person_id}"` (`entries_site.py:942`) |
| scheduler_core | `Player` (`domain/models.py:22`) · `Participant` (`domain/tournament.py:29`) | `id: str` · `id: ParticipantId` + `member_ids` + `type PLAYER\|TEAM` |
| Console | `PlayerDTO` (`dto.ts:283`, uuid) · `BracketPlayerDTO` (`dto.ts:314`, **`p-<name-slug>` from `lib/playerSlug.ts:7-13`**) · `Participant` (`bracketDto.ts:13`) · `EntryDTO.playerName` (`dto.ts:708`, **no key**) · `Match.playerIds` (`platform/domain/match.ts:59`, mixed namespace) · store `players` + `bracketPlayers`, two parallel arrays (`tournamentStore.ts:34,42`) | uuid · name-slug · slug/synthetic · none. **`personKey` appears nowhere in console code** — only in the unimported `dto.generated.ts:3805` |
| Entrant | `EntrantListRowDTO` (`lib/entryPage.types.ts:48`) · `PlayerPageDTO` (`lib/player.types.ts:43`) · `MyEntryLine` (`my-entries.d.ts:8`) · `PlayerEcho` (`lib/echo.ts:40`) | **`personKey` UUID** ✅ — but only on the entrants tab and player page; draws/seeds/winners use `participantKey` or bare `names[]`, so a player page is linkable from exactly one place (`components/EntrantsList.tsx:69`) |

### 3.5 Partner / Pair — **no first-class entity above `scheduler_core`** (the core row below is the one place a pair is id-bearing)

| Layer | Representation | Identifying key |
|---|---|---|
| Storage | **`absent — verified`** (no pair/team table; 26-table enumeration, and `entries/partners.py` declares no model). Entries side: `entries.partner_entry_id` Uuid **no FK in ORM or DB** (`models.py:1507`) + `partner_email`/`partner_invite_hash`/`partner_accepted_at` (`:1511-1524`). Bracket side: `bracket_participants.type` + `member_ids` **JSON list of opaque strings** (`:471-472`). Meet side: `absent — verified` | none. Mutuality ("set on BOTH halves", `:1504-1506`) is application convention only |
| Backend OP | **`absent — verified`** — grep `partner` on `core/schemas.py` → 0 hits; `EntryDeskRowDTO`'s docstring still says the doubles columns "mean nothing until E3", which shipped (`schemas.py:718-720`). Only bracket's `ParticipantOut.members: Optional[List[str]]` (`brackets.py:247`) | member slugs |
| Backend PUB | `PartnerInviteDTO`/`PartnerAcceptRequest`/`PartnerAcceptedDTO` (`partner_routes.py:52,67,81`) · `PlayerEventDTO.partnerName` (`entries_site.py:239`) · `MyEntryLineDTO.partnerName` (`entries_me.py:89`) · `TeamDTO` (`entries_site.py:118`) | invite token via path, **no partner id on the wire** · **a name string** ×2 · `participantKey` + `names` — **`members` is dropped** vs `ParticipantOut` |
| scheduler_core | `Side = List[ParticipantId]` (`domain/tournament.py:19`) + `Participant.member_ids` (`:34`) — **not absent; a pair is a first-class id list here** | participant ids |
| Console | **No type — `absent — verified`.** `PickedPair` UI-local (`modules/bracket/ParticipantPicker.tsx:24`); a pair is minted as the **name concatenation** `` `${a.name} / ${b.name}` `` (`BracketPlayerFields.tsx:250-251`); transient state is one `useState('')` (`:193`); doubles-ness is a hardcoded `['MD','WD','XD']` list (`BracketDrawsTab.tsx:240`). `PartnerInviteDTO` exists only in the unimported generated file | none |
| Entrant | `TeamDTO` (`lib/draws.types.ts:25`) · `PlayerEventDTO.partnerName` (`lib/player.types.ts:34`) · `MyEntryLine.partnerName` (`my-entries.d.ts:20`) · `PlayerEcho.partners: Record<eventCode,string>` (`lib/echo.ts:62`) · `PartnerInvite` (`routes/partner.tsx:39`) | `participantKey` for the pair-as-competing-unit; **a plain name string** for the partner relation everywhere else |

### 3.6 Draw

| Layer | Representation | Identifying key |
|---|---|---|
| Storage | **Bracket:** `bracket_events` **is** the draw container (`format`/`bracket_size`/`seeded_count`/`rr_rounds`/`config`, `models.py:430-437`); the tree is `bracket_matches.slot_a/slot_b` + `dependencies`/`child_unit_ids` **JSON** (`:517-526`). **Meet:** `absent — verified` — the analogue is a solved schedule in `tournaments.data["schedule"]` (`core/schemas.py:1021-1031`), no table | `(tournament_id, bracket_events.id)`. Slot pointers (`participant_id`/`feeder_play_unit_id`) live inside JSON, unconstrained |
| Backend OP | `EventOut` doubles as the draw (`rounds`, `segments`, `config`; `brackets.py:339`) · `SegmentOut` (`:307`) · `BracketValidationOut` (`:515`) | `id` = discipline code · segment `'W'\|'L'\|'GF'\|'P5_8'` |
| Backend PUB | `DrawCardDTO`/`DrawsIndexDTO` (`entries_site.py:103,112`) · `DrawDetailDTO`/`SegmentDTO`/`RoundDTO` (`:180,160,155`) · display `GET /display/{token}/bracket` is **untyped**, raw `_serialize_session()` with no `response_model` (`display.py:214-236`) | `drawKey` — **= `event.id`**, set alongside `eventCode` from the same value (`entries_site.py:529-530`); round has `label` only, no key |
| scheduler_core | `absent — verified` — no Draw type; a draw is `Event` + the `PlayUnit.dependencies` graph (`domain/tournament.py:56,105`) | — |
| Console | Bracket-only; **`absent — verified` for Meet**. `EventDTO.rounds/.segments/.standings` (`bracketDto.ts:150,162,164`) · `SegmentDTO` (`:118`) · `BracketSlotDTO` unexported (`:51`) · no store — `useBracket` polls and replaces the whole document (`hooks/useBracket.ts:53-55`) | draw ≡ event, key `id` |
| Entrant | `DrawCardDTO`/`DrawsIndexDTO`/`DrawDetailDTO`/`SegmentDTO`/`RoundDTO` (`lib/draws.types.ts:9,19,77,58,53`) | `drawKey: string`. `kind` is a **bare `string`**; the format union lives only in a docstring + `kindLabel` (`:13,126`) |

### 3.7 Match — meet/bracket non-merge is **ADR 0006:53-59, ruled** (cite, don't file)

| Layer | Representation | Identifying key |
|---|---|---|
| Storage | **Meet ×3 for one match:** `matches` (`models.py:173`, court/slot/status only — **no player or side columns**) · `match_states` (`:281`, **no `__table_args__` at all**, no composite FK to `matches`) · `tournaments.data["matches"]` (`schemas.py:1020`) — *who plays exists only in the blob*. **Bracket:** `bracket_matches` (`:493`) with a real composite CASCADE FK. Command log `commands` (`:215`) is **Meet-only** | Meet `(tournament_id, id String(100))`, the three records joined by an unconstrained String · Bracket `(tournament_id, bracket_event_id, id)` |
| Backend OP | `MatchDTO` (`schemas.py:299`, meet, camelCase) · `PlayUnitOut` (`brackets.py:263`, bracket, snake_case) · `MatchStateDTO` (`operations/match_state_routes.py:108`) · `MatchStateOut` (`schemas.py:1170`, **dead — 0 references**) · `NextMatchDTO` (`workspaces/workspace_signals.py:101`) | `id` · `id` · `matchId` · `matchId` · **`matchId` + `source: Literal["meet","bracket"]`** — the only discriminated cross-engine reference (positive control, `:112-118`) |
| Backend PUB | `MatchNodeDTO` (`entries_site.py:145`) · `PlayerMatchDTO` (`entries_site.py:248`) · display `Dict[str, MatchStateDTO]` (`display.py:204`, operations' DTO reused verbatim) | **`nodeKey`** · **no key at all** — the meet+bracket fold (`entries_site.py:54,1064`) |
| scheduler_core | `Match` (solver, `domain/models.py:32`) · `PlayUnit` (competition, `domain/tournament.py:56`) | `id` + `event_code` + `side_a/b: List[str]` · `id` + `kind MATCH\|TIE\|BLOCK` |
| Console | **canonical `Match`** (ADR 0009, `platform/domain/match.ts:28`) fed by exactly one adapter pair (`modules/operations/opsBlock.ts:53,130`); `OpsBlock` is a deprecated alias · engine-native `MatchDTO` (`dto.ts:334`) / `PlayUnitDTO` (`bracketDto.ts:60`) · runtime `MatchStateDTO` 19 fields (`dto.ts:226`) · `useMatchStateStore` (`store/matchStateStore.ts:32`) | **`key = ${source}:${id}`** (`matchKey`, `match.ts:73`) — the one place a match is keyed with its origin |
| Entrant | `MatchNodeDTO` (`lib/draws.types.ts:44`) · `PlayerMatchDTO` (`lib/player.types.ts:17`) | `nodeKey` · **none** — non-convertible; a reader cannot get from a player-page match back to the same draw node |

### 3.8 Result

| Layer | Representation | Identifying key |
|---|---|---|
| Storage | **Meet:** `match_states.score_side_a/score_side_b` Integer (`models.py:292-293`) + actual-time columns as `String(40)` (`:290-291`). **Bracket:** `bracket_results` (`:558`), `winner_side` String + `score` **JSON** + `walkover` + `reason`, composite CASCADE FK 1:1 on `bracket_matches`. **Standings: `absent — verified`** — derived, never persisted, stripped on PUT (`schemas.py:1039-1044`) | Meet by `match_id`; Bracket `(tournament_id, bracket_event_id, bracket_match_id)` |
| Backend OP | `MatchScore` **defined twice** — `schemas.py:621` unbounded vs `match_state_routes.py:103` `ge=0,le=99` · `MatchStateDTO.score` (`:114`) · `ResultOut` (`brackets.py:295`, `winner_side` + opaque `dict`) · `BracketCommandRequest` (`schemas.py:1133`) · standings `MeetStandingRowDTO` (`schemas.py:990`, keyed **`groupId` — a school**) / `StandingRowOut` (`brackets.py:323`, `participant_id`) | see §3.9 conflict C-3 for the full standings union |
| Backend PUB | `NodeResultDTO` (`entries_site.py:136`) · `PlayerMatchDTO.score` (`:253`) · `StandingRowDTO` (`entries_site.py:166`, `participantKey`) · `WinnersEventDTO`/`HonorDTO`/`PlayerRecordDTO` (`:215,210,259`) · display `GET /display/{token}/state` **untyped** (`display.py:161-201`) | `List[List[int]]` set rows on the bracket branch; a **fabricated one-row `[[a,b]]`** from the meet aggregate (`entries_site.py:1142`) — one field, two semantics |
| scheduler_core | `Result` (`domain/tournament.py:81`) — competition layer only; **the solver layer has no result concept — `absent — verified`** (`domain/models.py`) | `winner_side`/`score`/`walkover`/`reason` |
| Console | meet `MatchStateDTO.score {sideA,sideB}` + `sets` (`dto.ts:249-253`) · bracket `ResultDTO` (`bracketDto.ts:104`) + `BracketScore` (`:100`) · **standings ×2**: `MeetStandingRowDTO` (`dto.ts:461`, `groupId`) vs `StandingRowDTO` (`bracketDto.ts:130`, `participant_id`) · `standings` deliberately has **no setter** in the store (`tournamentStore.ts:63-70`, positive control) | different grain, different key |
| Entrant | `NodeResultDTO` (`draws.types.ts:38`) · `StandingRowDTO` (`:64`) · `PlayerRecordDTO` (`player.types.ts:37`) · `WinnersDTO`/`HonorDTO` (`draws.types.ts:120,106`) · `MyEntryLine.resultBadge` (`my-entries.d.ts:18`) | **no key** — results hang off their parent; `resultBadge` is a pre-rendered string |

### 3.9 Conflict log (C-1..C-6) — resolved by re-reading the cited file, not by vote

**C-1 — `bracket_events.id`: UUID or discipline code?** 2d said UUID; 2a/2b said a tournament-scoped code. **Evidence:** `db/models.py:415-428` — docstring "the `id` is tournament-scoped (e.g. `"MS"` for Men's Singles)"; column is `String(100)`, not `Uuid`. **Resolution: 2d wrong.** The *draw* key-space and the *bracket event* key-space are one **mutable string**, unlike `entry_events.id` which is a real UUID.

**C-2 — is `drawKey` a distinct public alias?** 2b said "a public alias, not `event.id`"; 2d said it is `bracket_events.id`. **Evidence:** `entries_site.py:528-531` — `DrawCardDTO(drawKey=event.id, eventCode=event.id, …)`. **Resolution: 2b wrong.** `drawKey ≡ eventCode ≡ bracket_events.id` — one string under three field names. Feeds MX-3 / F-DM-57.

**C-3 — how many standings shapes?** 2b said ×4 (+untyped 5th); 2d said 6; 2c said 2 (+1 public). **Evidence:** grep for `class Standing…|StandingRow` over the three app trees excluding `dto.generated.ts` → **exactly 8 declarations**: `bracket/brackets.py:323` · `bracket/standings.py:52` (dataclass, `participant_id`) · `core/schemas.py:990` · `entries/entries_site.py:166` · **`meet/standings.py:31`** (dataclass, `groupId` — *missed by 2b*) · `console/api/bracketDto.ts:130` · `console/api/dto.ts:461` (*omitted by 2d*) · `entrant/lib/draws.types.ts:64`. **Resolution: 8 typed + 1 untyped** (`display/display.py:199` `model_dump()`s `MeetStandingRowDTO` into a raw dict). **Two grains**, not one: `groupId` (a school) vs a participant. Three of the eight share the exact name `StandingRowDTO` across three tiers.

**C-4 — how many pair models?** No census contradicted another; each counted only its own layer. **Resolution (union, 6 representations):** ① `entries.partner_*` columns, symmetric by convention only, no FK (`models.py:1503-1524`) · ② `bracket_participants.member_ids` JSON slug list (`models.py:472`) · ③ `Side = List[ParticipantId]` (`scheduler_core/domain/tournament.py:19`) · ④ a bare **name string** on the public wire (`entries_site.py:239`, `entries_me.py:89`) · ⑤ `TeamDTO.participantKey` + `names`, **`members` dropped** (`entries_site.py:118` vs `brackets.py:247`) · ⑥ a console name-concatenation (`BracketPlayerFields.tsx:250-251`). Operator API has **zero**. Only ③ is id-bearing and it is in the layer out of scope for change.

**C-5 — citation off-by-one.** `roster_id = f"entry-{person_id}"` is at `entries_site.py:942`, not `:941`. **Use `:942`** (applied throughout this doc).

**C-6 — citation off-by-one.** `class MatchNodeDTO` is at `entries_site.py:145`, not `:146`. **Use `:145`** (applied throughout).

**Non-conflicts checked and cleared:** Meet-Event-absent (three independent methods agree) · `personKey` = `entry_players.id` UUID (2c's "absent from console" is a different claim about a different layer, not a contradiction) · `BracketPlayerDTO.id` = name slug (2b's "stable slug" and 2c's `p-<slug>` are the same fact; `lib/playerSlug.ts:7-13` confirms the `p-` prefix) · match non-merge (all four cite ADR 0006).

### 3.10 Cross-layer observations MX-1..5 — invisible to any single-layer census

- **MX-1** — the Entries→Bracket provenance link lives in `bracket_participants.meta.sourceEntryId` (`entries/entries.py:600`) and `ParticipantOut` drops `meta` entirely (`bracket/brackets.py:244-251`): a real key that surfaces in no DTO at any layer. → **F-DM-09**
- **MX-2** — `entries.committed_player_id` (`db/models.py:1542`) and blob `sourceEntryId` (`core/schemas.py:263`, written `entries/entries.py:405,581`) are two independently-written half-pointers, neither constrainable; the crash window is documented at `entries/entries.py:239-248`. → **F-DM-10**
- **MX-3** — `DrawCardDTO.drawKey` and `.eventCode` are both assigned `event.id` at one call site (`entries_site.py:529-530`) yet modelled as two independent keys on the entrant tier (`lib/draws.types.ts:9,11`): a distinction that exists only in the type system. → **F-DM-57**
- **MX-4** — one workspace, four key kinds and no layer that declares the mapping: uuid (`db/models.py:89`, `workspaces/tournaments.py:88`) → `entry_pages.slug` (`entries_json.py:536`, nullable at `entries_me.py:93`) → capability token (`display/display.py:111`) → no id at all on the console's own blob and store (`api/dto.ts:470`, `store/tournamentStore.ts:22`). → **F-DM-25**
- **MX-5** — both Event bridges are unconstrained (`bracket_event_id` FK-less by ruling, `db/models.py:1395-1399`; code↔`ranks[]` no join at all) while six public read shapes key off the weaker one, the mutable `eventCode` (`entries_site.py:199,215,229`, `entries_json.py:316`, `lib/draws.types.ts:96,112`, `my-entries.d.ts:9`), and the write path posts the UUID. → **F-DM-24**

---

## 4. Identity trace — how a human is keyed

**Cited, not re-derived** — `docs/history/programs/SP-P7-phase0-audit.md:64-76`: `entry_players (tournament_id, id)` **is** the person-in-tournament identity; `person_key = entry_player_id`, never the name; known caveat = hand-added roster players and bracket participants have no `entry_player` row.

### 4.1 Per-subsystem person key

| Subsystem | A human is… | Key | Evidence |
|---|---|---|---|
| **Entrant account** (who *acts*) | a global row, not workspace-scoped | `entrant_accounts.id` UUID; email unique case-insensitively *within the entrant namespace only* | `db/models.py:1102,1128,1166`; "Not workspace-scoped" `:1115-1117` |
| **Operator user** | a separate row in a separate namespace | `users.id` UUID | `db/models.py:919`; split documented `:1119-1123` |
| **Entries system** (who *plays*) | **a row — the ruled identity** | `entry_players (tournament_id, id)` UUID; `account_id` FK→`entrant_accounts` = "who may act for this player" | `db/models.py:1309,1342-1345`; `SP-P7-phase0-audit.md:64-76` |
| **Entry (one event)** | a pointer to that row | `entries.entry_player_id` Uuid — **nullable; FK-less in `models.py`, FK'd in the migration** (see F-DM-11) | `db/models.py:1496`; `alembic/versions/s3d8f2b5c0e1…:373-382` |
| **Meet roster** | **a blob entry in `tournaments.data["players"]`** — no table | `PlayerDTO.id` UUID, or the seam's deterministic `entry-{entry_player_id}` | `core/schemas.py:244-246`; `entries/entries.py:227` |
| **Bracket** | a row keyed by **a slug of their display name** | `bracket_participants.id` `String(100)`, **no FK to any person**; commit seam instead writes `entry-{entry_player_id}` | `db/models.py:456-472`; `entries/entries.py:567,592-603`; `apps/console/src/lib/playerSlug.ts:7-13` |
| **Bracket roster blob** | a second blob entry | `BracketPlayerDTO.id` = the `playerSlug()` output | `core/schemas.py:272-284` |
| **Operations** | **an untagged string in a mixed namespace** | `Match.playerIds: string[]` — meet roster UUIDs *or* bracket member slugs, no `source` discriminator | `platform/domain/match.ts:50-59`; filled `modules/operations/opsBlock.ts:105,161` |
| **Console — entries desk** | **a bare name string** | `EntryDTO.playerName`; the wire carries **no `entryPlayerId`** | `core/schemas.py:735-751`; `api/dto.ts:708` |
| **Console — elsewhere** | a roster id | `PlayerDTO.id` uuid / `BracketPlayerDTO.id` slug; **`personKey` appears in zero lines of console code** | §3.4 console row |
| **Public tier — entrants list & player page** | **an opaque person UUID** ✅ | `personKey` = `entry_players.id` | `entries_json.py:247` + docstring `:242-244`; `entries_site.py:1041` |
| **Public tier — draws / seeds / winners / match sides** | **a name string in a list, keyless** | `names: List[str]`; the pair-as-unit gets `participantKey` | `entries_site.py:193,210,242`; `TeamDTO` `:118` |
| **Public tier — reserves queue** | **a name string, keyless** | `ReserveRowDTO{eventCode,position,name,club}` | `entries_json.py:316-329` |
| **Display** | whatever the engine wrote | reuses Operations' `MatchStateDTO`; bracket route untyped | `display/display.py:204,214-236` |
| **scheduler_core** | an opaque id (out of scope for change) | `Player.id: str`, `Participant.id` + `member_ids` | `scheduler_core/domain/models.py:22`, `domain/tournament.py:29-34` |

**The one bridge between the two key-spaces is a string convention**, not a join: `roster_id = f"entry-{person_id}"` (`entries_site.py:942`), minted at `entries/entries.py:227` and matched back by `_adoptable` (`:230-259`).

### 4.2 Name-join register — 12 candidate sites, **10 real name/string person-joins**

| # | Site | Verdict |
|---|---|---|
| a | `apps/console/src/lib/playerSlug.ts:7-13` | **CONFIRMED** — a person's PK *is* `p-` + their lowercased, punctuation-stripped name. Two "Li Wei" collapse into one participant. |
| b | `bracketMigration.ts:15-22` `nameFromSlug` | **CONFIRMED** — a lossy inverse of (a); the comment at `:11` states the defect it exists for. |
| c | `EntriesDesk.tsx:217` `nameById` | **NOT a join** — keyed by `e.id` (entry uuid). The real finding is upstream: the wire has no person key (`schemas.py:735-751`). |
| d | `apps/entrant/app/lib/echo.ts` lowercase | **BENIGN** — the fold at `:213,221-222` compares a *gender* constraint, not a person. |
| e | `bracketMigration.ts:47` | A TEAM's **display name** is `split(' / ')` and positionally zipped onto `member_ids`. Pair membership decoded out of a rendered label. |
| f | `bracketMigration.ts:102,108` | `p.name === p.id` marks a roster row corrupt — identity repair keyed on a name equalling a slug. |
| g | `BracketPlayerFields.tsx:250-251` | A doubles pair is **minted** as `` `${a.name} / ${b.name}` `` with a synthetic `${eventId}-T{n}` id. |
| h | `DrawView.tsx:989` (also `:1200`, `bracketLabels.ts:147`, `BracketMatchesTab.tsx:137`, `opsBlock.ts:25`) | `(nameById[id] ?? id).split(" / ")` — the same display string split back into people. |
| i | `lib/names.ts:27-60` | `formatSideName`/`sideNameLines`/`sideSurnameLine` split a pre-joined side string; `formatPlayerName:16-23` guesses the surname by last token. **Presentation-direction only.** |
| j | `entries/submissions.py:258` `looks_duplicate` | `func.lower(EntryPlayer.full_name) == …` — **ruled** (R7, preserved by R13; `db/models.py:1475-1482`). A soft flag, never a 409. |
| k | `entries/submissions.py:313` `same_person` | Same lowercased-name compare, scoped by `account_id` + `birth_year`. **Ruled** (`:280-284`). The **only** mechanism making one human one `entry_players` row across submissions. |
| l | `entries/partners.py:110,163` | The partner *relation* is addressed by **email string**; rival pairings found by string equality. Before acceptance a partner is a typed address, not a person. |

### 4.3 The same-human-N-records map

**Structural correction first.** "Plays a bracket event *and* a meet event" **spans two workspaces**: `tournaments.kind` is `meet|bracket` (`db/models.py:121`) and the commit seam branches on it exactly once (`entries/entries.py:165`). **No workspace hosts both engines.**

Within ONE workspace (the bracket one):

| # | Record | Key | Link to the previous record |
|---|---|---|---|
| 1 | `entrant_accounts` row | UUID, **global** | — (the only global person record in the tree) |
| 2 | `submissions` row (one per form act) | `(tournament_id, id)` | `submissions.account_id` **FK, real** |
| 3 | `entry_players` row (the ruled person) | `(tournament_id, id)` | `entry_players.account_id` **FK, real** |
| 4 | `entries` rows (one per event) | `(tournament_id, id)` | `entries.submission_id` + `entries.entry_player_id` — nullable; FK'd in the migration, not in `models.py` (`:1495-1496`; F-DM-11) |
| 5 | Bracket roster blob entry in `data["bracketPlayers"]` | `entry-{entry_player_id}` string | `sourceEntryId` → `entries.id`, a JSON field (`entries.py:581`) |
| 6 | `bracket_participants` row | same `entry-{…}` string | `meta.sourceEntryId` (`entries.py:600`) — **dropped by `ParticipantOut`, reaches no layer above storage: MX-1** |
| 7 | `entries.committed_player_id` | `String(100)` → the blob id | the other half-pointer; crash window documented at `entries/entries.py:239-248` — **MX-2** |
| 8 | Name strings in draws / results / seeds / winners | **no key** | `entries_site.py:242,193,210`; `entries_json.py:328` |

**Meet-workspace analogues of rows 5–8:** the roster entry is a blob object in `data["players"]` keyed `entry-{entry_player_id}` or a uuid, carrying `sourceEntryId` (`core/schemas.py:244-263`, written `entries/entries.py:394,405`); no participant table, so row 6 has no counterpart; row 7 is identical; row 8's keyless names come from `names_for()` reading the blob (`entries_site.py:1095-1100`).

**Five to eight disconnected records per person per workspace**, joined by: two real FKs (1→2, 1→3), two nullable columns unconstrained in the ORM (4), one string convention (5/6), two independently-written half-pointers (7), and one dead end (8).

**Across the two workspaces** the **only** bridge is `entrant_accounts.id`. `personKey` is `entry_players.id`, tournament-scoped (`models.py:1339-1342`) — the same human has **a different `personKey` and a different public player page per workspace**, with nothing saying they are the same person. The global person layer is `absent — verified`; R15/profile-v1 is textless → **owner-supply `R-DM-*`**.

**Load-bearing hops spot-verified:** `_adoptable`/`_player_id` (`entries/entries.py:227,230-259`) — adopt-don't-duplicate holds · `_plan_bracket` (`:566-604`) writes participant + blob roster + `meta` · both public folds key by `roster_id` (`entries_site.py:954,1077,1107`), never by name. **The inputs are keyed; the outputs are not.**

### 4.4 Doubles / pair, as it exists now

Duplicated, not symmetric-by-enforcement, and the entrant-side pair never reaches the bracket-side pair.

- **Mutuality is a write convention.** `partners.accept` sets `partner_entry_id` on both halves (`entries/partners.py:236,243`) and the model comment says so (`db/models.py:1504-1506`) — the column has **no FK in ORM or DB** (`:1507`). Nothing prevents or detects a one-directional link. A half-accepted pair is `pending` + `awaiting_partner` with a live invite hash — the designed state (`partners.py:59-62`).
- **Pair identity before acceptance is an email string** (`partners.py:110`); conflicts found by matching it (`:163`), flagged never resolved (`:171-175`) — a deliberate ruling (invariant I4).
- **The commit seam drops the pair entirely.** `_plan_bracket` emits `{"type":"PLAYER","member_ids":[]}` per entry (`entries/entries.py:592-602`); **no `TEAM` construction exists anywhere under `apps/api/src/entries/`** (`TEAM` appears only in `bracket/` and `db/models.py:459`). Two committed halves land as two independent singles; the director re-pairs by hand, where composition is written as a name concatenation with a synthetic id (`BracketPlayerFields.tsx:250-251`).
- **Where pair identity lives end-to-end:** `entries.partner_entry_id` (FK-less) → **nothing** → `bracket_participants.member_ids` JSON slug list (`models.py:472`) → `Side = List[ParticipantId]` in `scheduler_core` (the one genuinely id-bearing pair) → back out as `TeamDTO{participantKey, names}` with `members` **dropped** → and as a **bare `partnerName` string** (`entries_site.py:239`, `entries_me.py:89`).
- Meet has no pair concept (`absent — verified`); a doubles side is two ids in `MatchDTO.sideA` (`core/schemas.py:304`).
- Doubles-ness is a hardcoded list in the console (`BracketDrawsTab.tsx:240`) and a lowercased string compare on the backend (`partners.py:78-80`).

### 4.5 Meet-vs-Bracket origin split for one person

| | Meet workspace | Bracket workspace |
|---|---|---|
| Where the person lives | `tournaments.data["players"][]` JSON blob — **no table** | `bracket_participants` row **+** a second blob copy in `data["bracketPlayers"]` |
| Native key | UUID (`core/schemas.py:245`) | slug of the display name (`playerSlug.ts:7-13`, `schemas.py:275-276`) |
| Key after the Entries seam | `entry-{entry_player_id}` (`entries.py:227,394`) | same string, in **two** places (`:579`, `:596`) |
| Event attachment | a rank *code* in `ranks[]` — no join at all (D8/F-E1, cite `2026-08-06-entries-design.md:1721-1729`) | `entry_events.bracket_event_id`, FK-less by design (`models.py:1395-1399`) |
| Who is on a match | ids only in the blob (`MatchDTO.sideA`) | `member_ids` expanded from the participant |
| Extra person field | `groupId` = school, **required** (`schemas.py:247`) — Meet is school-vs-school | none |

**What bridges them: essentially nothing at the person level.** The Operations match seam bridges *matches* (`matchKey`, `NextMatchDTO.source` — properly discriminated) but `Match.playerIds` (`match.ts:59`), fed by both adapters, is an **undiscriminated** string array mixing UUIDs and slugs; the "one player, two courts" guard (`match.ts:54-57`, debt D20) cannot see a cross-namespace human. The `entries_site` folds bridge *reads*: `_meet_matches` (`:1064-1154`) and the bracket walk (`:946-1032`) both key off the same `entry-{person}` string and merge into one `PlayerPageDTO.matches` — the single place one person's meet-origin and bracket-origin history sit in one object, and it works only *within* one workspace because the `kind` branch means only one half ever returns rows.

### 4.6 Explicitly NOT fragmented (identity)

Public `personKey` = opaque `entry_players.id` UUID (docstring states why: "two entrants sharing a name is routine at a club and must not collide into one page", `entries_json.py:242-244`) · the R13 chain in storage with real FKs on both account edges · operator/entrant namespace separation deliberate and reasoned (`models.py:1106-1108,1119-1123`) · adopt-don't-duplicate holds at the commit seam (F-E1-2 **closed**, `ENTRIES_PROGRESS.md:1186-1194`) · the public partner fold joins by key not by name (`entries_site.py:886-928`) · the desk groups by submission id (`modules/entries/entryDisplay.ts:121-140`) · cross-engine match addressing already solved twice · erasure keys off the person row (`EntryPlayer.erased_at`, D7 ruled). Numbered as F-DM-62..77.

---

## 5. Seam map + end-to-end traces

**Vocabulary.** *typed seam* = a named contract both sides compile/validate against (DTO + a test or an import boundary that pins it). *shared-table coupling* = both sides read the same row/blob, contract implied by column name. *shape copy-paste* = the shape is re-declared per side with no mechanical link; drift is silent.

### 5.1 Boundary classification

| # | Boundary | Carrier | Class | Evidence |
|---|---|---|---|---|
| B1 | Entries → Bracket (commit seam) | dict literal `{"id","name","type","member_ids","seed","meta"}` → `repo.brackets.add_participants` → `bracket_participants` | **shared-table coupling** — no DTO, `type` always `"PLAYER"`, `meta.sourceEntryId` declared by no reader above the table | `entries/entries.py:592-603,526` |
| B2 | Entries → Bracket (event mapping) | `entry_events.bracket_event_id` → `bracket_events.id` | **shared-table coupling**, **FK-less by ruling R2** | `db/models.py:1395-1399,1415`; `entries/entries.py:549-552` |
| B3 | Entries → Bracket (roster blob) | `BracketPlayerDTO` appended to `data["bracketPlayers"]` | **typed seam** (pydantic-validated) over an **unversioned blob** | `entries/entries.py:577-591`; `core/schemas.py:272-295` |
| B4 | Entries → Meet (roster blob) | `PlayerDTO` appended to `data["players"]`, `groupId` **invented** as `event.code` | **typed seam** over an unversioned blob; the `groupId` value is fabricated | `entries/entries.py:392-418`; `core/schemas.py:244-269` |
| B5 | Entries → Meet (event mapping) | `entry_events.code` vs `data["config"]["rankCounts"]` keys | **shape copy-paste** — no storage join; empty vocabulary accepts everything | `entries/entries.py:426-441`; D8/F-E1 |
| B6 | Entries → both (back-reference) | `entries.committed_player_id` ↔ blob `sourceEntryId` | **shared-table coupling**, two half-pointers, neither constrainable (MX-2) | `db/models.py:1542`; `entries/entries.py:230-261,405,581` |
| B7 | Bracket table → engine | rows → `scheduler_core` `Participant` | **typed seam**; `meta` **preserved** at hydration | `bracket/brackets.py:802-812` |
| B8 | Bracket table → engine (generation) | same, `metadata={"seed": …}` only | **shape copy-paste** — `meta` (incl. `sourceEntryId`) **dropped** | `bracket/brackets.py:2178-2185` |
| B9 | Bracket → console/public wire | `ParticipantOut{id,name,members,seed}` | **typed seam that is lossy** — `meta` dropped at both call sites | `bracket/brackets.py:244-251,1171-1178,1211-1218` |
| B10 | Meet blob → `matches` table | `data["matches"][].id` + `data["schedule"]["assignments"][].matchId` → `matches.id` | **shared-table coupling**, no FK, no schema on either side | `repositories/local.py:411-480,1854,1857-1875` |
| B11 | Meet/Bracket → Operations (state) | `match_states.match_id` String(100) | **shared-table coupling** — `MatchState` has **no `__table_args__` at all** | `db/models.py:281-300` |
| B12 | Meet/Bracket → Operations (console) | `meetToOpsBlocks`/`bracketToOpsBlocks` → canonical `Match` (ADR 0009) | **typed seam** — the only engine-native→canonical adapters; key `matchKey` | `modules/operations/opsBlock.ts:53,130`; `platform/domain/match.ts:73` |
| B13 | Operations → Display (match state) | `Dict[str, MatchStateDTO]`, Operations' own DTO re-exported | **typed seam** (reused verbatim, not copied) | `display/display.py:204-212`; `operations/match_state_routes.py:108` |
| B14 | Meet → Display (board state) | `payload = {k: t.data.get(k) …}` over a 6-name tuple + `standings` `model_dump()` | **shape copy-paste** — **no `response_model`**; the field list is a Python tuple with a prose comment naming its consumer | `display/display.py:196-241` |
| B15 | Bracket → Display (board) | `_serialize_session()` returned raw | **shape copy-paste** at the route, typed underneath | `display/display.py:214-236` |
| B16 | Backend ↔ console (config classification) | `packages/shared-contract/non-scheduling-keys.json`, loaded by the API, mirrored in TS **with a parity test** | **typed seam — genuinely clean** | `workspaces/config_lock.py:14,41`; `store/tournamentStore.ts:128-153`; `store/__tests__/nonSchedulingKeys.parity.test.ts:15-18` |
| B17 | Backend → console (DTOs) | `apps/console/src/api/dto.ts`, hand-maintained; `dto.generated.ts` **unimported** | **shape copy-paste** (documented: `make generate-api` "then reconcile by hand") | `CLAUDE.md` commands; §3.4 console row |
| B18 | Backend → entrant | `entries_json`/`entries_site`/`entries_me` DTOs re-declared as TS interfaces per file | **shape copy-paste** — no generator, no parity test | `entrant/app/lib/{entryPage,draws,player}.types.ts`; `public/assets/my-entries.d.ts` |
| B19 | Entrant form → backend | native form POST, `events` field is `"{blockIndex}:{entry_events.id}"` | **shape copy-paste** — a string split with no shared constant | `entries/entry_form.py:57-60`; `entrant/app/routes/enter.tsx:280,291` |
| B20 | API → `scheduler_core` | `ScheduleConfig` via one builder | **typed seam**, import-linter pins core purity | `shared/scheduling/params.py:50`; `apps/api/.importlinter` |
| B21 | Console Operations → Bracket UI | direct imports of Bracket internals | **shape copy-paste / boundary debt** — console-only; the API has **no** such edge (import-linter contract 4) | `apps/console/.dependency-cruiser.cjs:39-45,51-54` |

### 5.2 TRACE A — singles, literal (15 hops)

One person, one singles event, account → match. **Fork at A7** on `tournaments.kind`. Left column is the key *as it physically exists*.

| Hop | Key | Where | FK? | Note |
|---|---|---|---|---|
| A1 | `entrant_accounts.id` (Uuid) | `db/models.py:1102` | — | Not workspace-scoped (deliberate, D-A2). The R10 principal. |
| A2 | `submissions.account_id` → `entrant_accounts.id` | `db/models.py:1217+` | **FK ✔** (`ondelete=CASCADE`; D7's still-owed half) | Idempotency: `uq_submissions_tournament_account_idempotency_key` (`:1298`); lookup `entries/submissions.py:134-147`. |
| A3 | `entries.submission_id` (Uuid) | `db/models.py:1495` | **FK ✔ in the migration** (`s3d8f2b5c0e1…:373-382`), **absent from `models.py`** | Written at `entries/submissions.py:463-471`. The ORM relationship is `viewonly` + `primaryjoin` (`db/models.py:1578-1586`), not a constraint — so the unit suites' `create_all` schema is weaker than production (F-DM-11). |
| A4 | `entries.entry_player_id` → `entry_players.id` | `db/models.py:1496` | **same split as A3** — FK'd in the migration, not in `models.py` | The ruled person identity. Adoption rule = same account + same lowered name + same `birth_year`, all present (`entries/submissions.py:265-318`). **Re-key:** a person without `birth_year` never adopts → a second `entry_players` row → a second `personKey`. |
| A5 | `entries.entry_event_id` → `entry_events.(tournament_id,id)` | `db/models.py:1555-1560` | **FK ✔ composite CASCADE, in models AND migration** | **The only hop constrained at both layers on the whole competition path.** |
| A6 | `entries.state = "confirmed"` | `entries/entries_routes.py:230` | — | Operator-only gate; the commit seam's sole selector (`entries/entries.py:185-189`). |
| A7 | `tournaments.kind or "meet"` | `entries/entries.py:165-167` | — | **THE FORK.** `"bracket"` → `_commit_bracket`; anything else (incl. NULL/unknown) → `_commit_meet`. No CHECK on the column (`db/models.py:121`). |
| A8 | `roster_id = f"entry-{entry.entry_player_id or entry.id}"` | `entries/entries.py:210-227` | — | **Silent re-key #1: a UUID becomes a formatted string.** The fallback (`or entry.id`) mints an id in the *entry* key-space under the same prefix, indistinguishable downstream. Re-derived independently at `entries_site.py:88,942`. |

**A9–A15, bracket branch**

| Hop | Key | Where | FK? | Note |
|---|---|---|---|---|
| A9-b | `entry_events.bracket_event_id` → `bracket_events.id` (the discipline code — C-1) | `entries/entries.py:549-552` | **FK-less, ruled (R2)** | Dangling → `SkipReason.UNMAPPABLE_EVENT`; `status ∈ {generated,started}` → `DRAW_NOT_EDITABLE` (`:562-564`). |
| A10-b | `bracket_participants.id = roster_id`, `type="PLAYER"`, `member_ids=[]`, `meta={"sourceEntryId": str(entry.id)}` | `entries/entries.py:592-603` | **FK-less to any person table** | **Silent re-shape:** the entry's identity survives only inside a JSON `meta` key. |
| A10-b′ | `data["bracketPlayers"][].id` = same `roster_id`, `.sourceEntryId` = `entries.id` | `entries/entries.py:577-591,607` | — | Second destination, same key, different store. Validated against `BracketPlayerDTO`; the blob carries **no version field**. |
| A11-b | `entries.committed_player_id = roster_id` | `entries/entries.py:264-279` | **FK-less** | Committed in a **separate transaction** from A10-b; crash window documented at `:239-249`, closed by adoption not rollback (MX-2). |
| A12-b | `Participant(id=p.id, …, metadata={"seed": p.seed})` | `bracket/brackets.py:2178-2185` | — | **`meta` — and `sourceEntryId` with it — is dropped here.** The engine never sees the entry link. |
| A13-b | `bracket_matches.slot_a/slot_b` JSON `{"participant_id": roster_id, "feeder_play_unit_id": null, "feeder_take": "winner"}` | `bracket/brackets.py:1045-1053`; `bracket/draw.py:32-69` | **FK-less (inside JSON)** | Exactly one of the two keys is set (`draw.py:50-57`). |
| A14-b | `bracket_matches.(tournament_id, bracket_event_id, id)` | `db/models.py:493-526` | **FK ✔ composite CASCADE** | Cached sides `side_a`/`side_b` are JSON lists of participant ids. |
| A15-b | `bracket_results.(tournament_id,bracket_event_id,bracket_match_id)`, `winner_side` + `score` JSON | `db/models.py:558+` | **FK ✔ 1:1 CASCADE** | |

**A9–A15, meet branch**

| Hop | Key | Where | FK? | Note |
|---|---|---|---|---|
| A9-m | `entry_events.code` ∈ `data["config"]["rankCounts"]` keys | `entries/entries.py:371,426-441` | **no join of any kind** | An **empty/absent** `rankCounts` accepts every code (`:434-441`). D8/F-E1 in situ: the code names a *slot* (`MS1`), the config declares a *count* per division. |
| A10-m | `data["players"][]` = `{id: roster_id, name: entry.player_name, groupId: event.code, ranks: [event.code], sourceEntryId: str(entry.id)}` | `entries/entries.py:392-418` | — | **Silent re-shape ×2:** (a) `groupId` is REQUIRED on `PlayerDTO` and an entry has no school, so the seam **invents** it as the event code and creates a matching `groups[]` row (`:414-416`); (b) `name` is `association_proxy("player","full_name")` (`db/models.py:1600`) — the person's identity is copied into the blob **as a string**. |
| A11-m | `entries.committed_player_id` | as A11-b | **FK-less** | Same two-transaction window. |
| A12-m | **the lineup is built in the browser**: `sideA = players.filter(p.groupId===groups[i].id && p.ranks.includes(rank)).slice(0, needed).map(p=>p.id)`, `id: uuid()` | `apps/console/src/modules/meet/matches/RegenerateMenu.tsx:84-109` | — | **Meet's draw-slot hop exists but runs client-side with zero provenance.** No `sourceEntryId` on a match, no server route, no server-side test. Match ids are fresh client UUIDs; regenerating severs recorded status (`:55-57`). |
| A13-m | `data["matches"][].sideA[]` : `List[Identifier]` = roster ids | `core/schemas.py:305-307` | — | The meet "draw slot". |
| A14-m | `matches.(tournament_id, id String(100))`, id = `data["matches"][].id` | `repositories/local.py:440-472`, called from `:1854` | **FK-less to the blob** | Projected on every `commit_tournament_state`; rows whose id vanishes from the payload are **deleted** (`:480-484`). Carries court/slot/status only — **no side columns**. |
| A15-m | `match_states.match_id` String(100) | `db/models.py:281-300` | **FK-less; no `__table_args__` at all** | Result = `score_side_a`/`score_side_b` Integers. |

**Hop count — TRACE A: 15** (A1–A8 shared, then 7 per branch). Constrained at both ORM and migration: A2, A5 (+A14-b/A15-b on the bracket branch). **Every hop from A7 onward is FK-less on the meet branch.**

### 5.3 TRACE B — doubles, literal (15 hops on top of the shared A1–A6)

Pair identity changes representation **six** times; FK-bearing hops on the pair path: **zero**.

| Hop | Key | Where | Note |
|---|---|---|---|
| B1 | `entry_events.entry_type == "doubles"` (lowercased string compare) | `entries/partners.py:78-80` | The one place the string is compared on the *backend*. Three other rules exist (F-DM-13). |
| B2 | nominator's form: `partners[str(event.id)] = partner_email` | `entries/submissions.py:481`; parsed `entries/entry_form.py:64` | Keyed by event **id** — one person can hold two doubles events with two partners. |
| B3 | `entries.partner_email` + `partner_invite_hash` (SHA-256) + `partner_invite_expires_at`; `pending_reasons += "awaiting_partner"` | `entries/partners.py:109-114` | **Representation #1: an email address on one row.** The raw token is handed to the route to mail (`submissions.py:492`), never stored. |
| B4 | conflict: another live `entries` row in the same `entry_event_id` with the same `partner_email` → both get `pending_reasons += "pair_conflict"` | `entries/partners.py:147-174` | Flagged, never resolved (I4). |
| B5 | acceptance: token → `entries.partner_invite_hash` (`ix_entries_partner_invite`) | `entries/partners.py:117-144` | Requires a **logged-in entrant principal** (R10); an invite is not a capability. |
| B6 | acceptance **mints a whole second R13 chain**: new `entry_players`, new `submissions`, new `entries` in the same `entry_event_id`, `state=pending` | `entries/partners.py:205-241` | **Representation #2: two independent entries.** The partner's row is under a *different account*, invisible to the nominator's `my_entries` query and fetched separately (`entries_me.py:277-320`). |
| B7 | `entries.partner_entry_id` set on **both** halves; `partner_accepted_at` stamped on both; token cleared | `entries/partners.py:236,243-249` | **Representation #3: two symmetric nullable Uuid columns with NO FK** (`db/models.py:1507`). Mutuality is convention only. |
| B8 | confirm: `entries.state="confirmed"` — **per half, independently** | `entries/entries_routes.py:230` | Nothing couples the two decisions. Half a pair can be confirmed. |
| B9 | commit seam: **`{"type":"PLAYER","member_ids":[]}` for every entry, doubles or not** | `entries/entries.py:592-603` | **PAIR IDENTITY IS DESTROYED HERE.** `_plan_bracket` never reads `partner_entry_id` or `entry_type`. `_plan_meet` (`:348-423`) likewise: two independent `data["players"]` rows, `ranks=[code]`. |
| B10 | operator re-mints by hand: `{id: nextTeamId(ev.id, …) /* `${eventId}-T{n}` */, name: `${player.name} / ${partner.name}`, members: [player.id, partner.id]}` | `apps/console/src/modules/bracket/BracketPlayerFields.tsx:240-254` | **Representation #4: a client-synthesized id + a name concatenation.** `partner_entry_id` plays no part in which two roster ids the operator picks. |
| B11 | `bracket_participants.type='TEAM'`, `member_ids` JSON list of roster ids | `db/models.py:471-472` | **Representation #5: an opaque JSON string list.** → `Participant.member_ids` / `Side = List[ParticipantId]` (`scheduler_core/domain/tournament.py:34,19`) — the only id-bearing pair, in the layer out of scope for change. |
| B12 | draw slot: `bracket_matches.slot_a.participant_id` = the TEAM id | `bracket/brackets.py:1045-1053` | Same slot mechanism as singles. |
| B13 | match sides: `bracket_matches.side_a` JSON `[team_id]` | `bracket/brackets.py:835-839` | The side is the TEAM id, not the two people. |
| B14 | public: `TeamDTO{participantKey, names:[participant.name], club, seed}` — `names` is **one entry, the concatenated string** | `entries/entries_site.py:416-435` | `members` dropped vs `ParticipantOut` (C-4 ⑤); club looked up by walking `participant.members` through `entry-{uuid}` (`:420-425`). |
| B15 | public partner relation: **a bare name string** | `entries_site.py:923-928` → `PlayerEventDTO.partnerName`; `entries_me.py:314-320` → `MyEntryLineDTO.partnerName` | **Representation #6.** These two projections are the **only** readers of `partner_entry_id` in the tree (tree-wide grep: 16 hits = 4 migrations, 2 model lines, 2 writer lines, 6 reader lines here, 4 test lines). **Zero engine, console, entrant-app readers.** |

**Meet doubles fork.** `_commit_meet` has no doubles concept. The pairing happens in `RegenerateMenu.tsx:87,96-100`: `needed = isDoublesRank(rank) ? 2 : 1`, then `sideAPlayers.slice(0, needed)` — **the two people paired are whichever two roster rows come first in filter order.** `entries.partner_entry_id` is not consulted, is not on the wire, and is not reachable from the console.

### 5.4 Public-projection input table

| Projection | Route | Reads | Joins | Target-hierarchy impact |
|---|---|---|---|---|
| Entry-page listing | `GET /e/api/{slug}` (`entries_json.py:374-511`) | `entry_pages.*`, `tournaments.name/tournament_date/org_id`, `orgs.name`, `entry_events.*`; entrants via `entry_players.full_name/club` + `entries.entry_player_id` + `entry_events.code` | `entries ⋈ entry_players` on `(tournament_id, entry_player_id)`; `entries ⋈ entry_events` (`entries_public.py:232-256`) | **No change.** `personKey` already *is* `TournamentPlayer.id`; a `PlayerProfile` above it adds a column, not a re-key. |
| Reserves | same payload (`entries_public.py:328-395`) | `entry_events.code`, `entry_players.full_name/club`, `entries.list_opt_out/id/submitted_at`, `state='waitlisted'` | same two joins | **No change.** Position derived from `(submitted_at, id)` order. |
| SP-P8 season calendar | `GET /e/api/pages` (`entries_json.py:563-637`) | `entry_pages` (`is_open`, `slug`, `venue_name`, `draws_published`, `results_published`), `tournaments.*`, `orgs.name`, `entry_events` | `EntryPage ⋈ Tournament`; `outerjoin Org` | **No change.** Tournament-level only; the key-set test (`tests/backend/test_season_listing.py`) reddens on any added field. A `Season`/`Calendar` entity would *replace* the `is_open` gate — an `R-DM` input, not a forced change. |
| Draws index | `GET /e/site/{slug}/draws` (`entries_site.py:515-545`) | `entry_pages.draws_published`; the hydrated bracket session = `bracket_events` + `bracket_participants` + `bracket_matches` + `data["bracket_session"]`/`["config"]` (`brackets.py:727-870`) | in-memory reassembly, not SQL | **Bracket-only, silently.** `_hydrate_session` returns `None` on empty `bracket_events` (`brackets.py:734-735`), so a Meet workspace answers `draws: []` — indistinguishable from "not generated". A `Draw` entity for Meet changes this input from nothing to something. |
| Draw detail | `GET /e/site/{slug}/draws/{draw_key}` (`entries_site.py:549+`) | same session; `bracket_results` for the gated half; `slot_a/slot_b`, `dependencies`, `meta` | — | `drawKey ≡ eventCode ≡ bracket_events.id`. A real `Draw.id` splits these two fields for the first time. |
| Seeds | `GET /e/site/{slug}/seeds` (`entries_site.py:667+`) | session `participants` (`seed` via `Participant.metadata["seed"]`), `_clubs_by_roster_id` = `entry_players.id/club` | join is the **string** `f"entry-{pid}"` (`entries_site.py:88`) | **Changes.** With a real `TournamentPlayer` FK on the participant, the string join disappears. |
| Winners | `GET /e/site/{slug}/winners` (`entries_site.py:722+`) | session `results` + final-unit walk; `TeamDTO.names` | same string join | Same as seeds. `names: List[str]` gains a key. |
| Player page | `GET /e/site/{slug}/players/{person_key}` (`entries_site.py:838-1053`) | `entry_players` by `(tournament_id, uuid(person_key))`; `entries` (`state='confirmed'`), `entry_events`, partner half via `partner_entry_id`; **bracket** session; **meet** `data["players"/"matches"/"schedule"/"config"]` + `match_states` (`:1064-1153`) | `roster_id = f"entry-{person_id}"` matched against `participant.id` **or** `participant.members[]` (`:948-951`) and against `data["players"]` keys (`:1076-1078`) | **The projection that changes most.** Both engine folds hinge entirely on the `entry-{uuid}` string. `PlayerMatchDTO` carries **no key** — no path back to the draw node. Two score semantics on one field (`_score_rows`, `:463` vs `:1142`). |
| My entries | `GET /e/account/entries` (`entries_me.py:220-360`) | `submissions` by `account_id`, `entries` by `submission_id`, `entry_events`, `tournaments`, `entry_pages`, `orgs`, partner half | batched `IN` + `tuple_(…).in_(…)` composite keys | **No change to inputs**; the R13 chain is already the query. The DTO name `MyTournamentCard` misdescribes a *submission* — naming, not input. |
| Export (portability) | `entries_me.py:544-575` | same tables, `ExportedPlayerDTO.fullName` only, **no ids at all** | — | Deliberate. Unaffected. |

### 5.5 `kind` branch inventory (live code paths)

Excluded as not-this-discriminator: `DrawCardDTO.kind` (a *format* string), entrant UI unions (`phase.ts:32`, `SeasonStatusCell`, `StickyTotalBar`), `ParticipantType`/`PlayUnitKind`.

| # | Fork | Reads | Behaviour |
|---|---|---|---|
| K1 | `entries/entries.py:165-167` | `tournaments.kind or "meet"` | commit seam → `_commit_bracket` vs `_commit_meet`. **The only place the two Entries→competition paths diverge**; the default swallows NULL/unknown into meet. |
| K2 | `db/models.py:664-668` (`derive_modules`) | `kind` param | seeds `{bracket:enabled, meet:available}` vs the mirror. |
| K3 | `workspaces/workspace_signals.py:605` | `row.kind` | `_bracket_setup` vs `_meet_setup`. |
| K4 | `workspaces/workspace_signals.py:623` | same | `NO_BRACKET` vs `NO_ROSTER`+`NOT_SCHEDULED` attention codes. |
| K5 | `workspaces/workspace_signals.py:648` | same | `_bracket_match_signals` vs `_meet_match_signals`. |
| K6 | `display/display.py:120-154` (`_board_kind`) | **`workspace_modules.status`, NOT `kind`** — falls back to `derive_modules(t.kind)` only when unseeded | Can answer `"hybrid"`. **Two different answers to "which engine is this workspace" coexist** (F-DM-34). |
| K7 | `entries/entries_site.py:948-1053` vs `:1055-1058` | neither — runs **both** folds unconditionally | The public player page is the one surface that unifies the origins, by iterating both and appending. |
| K8 | console `platform/domain/match.ts:73` + 25 sites | `Match.source: 'meet' \| 'bracket'` | The canonical, ADR-0009-sanctioned fork. `NextMatchDTO.source` is its backend twin. |
| K9 | console `modules/display/useDisplayKind.ts:19,54` | `t?.kind` with a `'hybrid'` third value | Mirrors K6 on the client. |
| K10 | console `modules/hub/nextAction.ts:40`, `HubPage.tsx:455-466`, `WorkspaceInspector.tsx:131` | `t.kind === 'bracket'` | Copy, next-action, delete-confirmation blast list. |

---

## 6. Blast radius

Rough sizing for phasing, not an inventory. Method: `rg -l <pat>` → referencing files; `rg -c` summed → call sites; paths matching `test|__tests__|spec` → test files. Patterns are symbol names from the artifacts' own citations, never bare domain words. **Areas overlap by construction** — the columns do not sum to a repo total. Bands: ≤10 files *contained* · 11–40 *medium* · >40 *pervasive*.

| # | Area | Pattern | Files | Call sites | Tests | Band |
|---|---|---|---:|---:|---:|---|
| 1 | Person-in-tournament identity minted by name match | `same_person\|looks_duplicate\|entry_player_id\|entryPlayerId\|personKey\|person_key` | 37 | 112 | 20 | medium — the *minting rule* is 2 functions; blast is in the readers |
| 2 | Bracket person key IS the display name | `playerSlug\|bracketMigration\|toPlayerSlug\|BracketPlayerDTO` | 30 (mech. 7) | 85 (8) | 5 (2) | contained (mechanism) / medium (readers) |
| 3 | Pair / doubles: 6 representations + destruction at the seam | `partner_entry_id\|partnerEntryId\|member_ids\|memberIds\|partner_email\|isDoublesRank\|is_doubles` | 33 | 120 | **5** | medium — **thinnest test cover of any large area** |
| 4 | Standings ×9 family | `StandingRow\|StandingsRow\|standings_rows\|MeetStanding\|BracketStanding\|StandingRowDTO` | 23 | 64 | 6 | medium-low — computation already single-authority; cheapest real unification |
| 5 | Console hand-mirrored `dto.ts`/`bracketDto.ts` | `api/dto'\|bracketDto'` | **221** | 233 | 84 | **pervasive — the largest blast in the audit** |
| 6 | Entrant tier hand-mirror set | `draws\.types\|playerPage\|entryPage\|MyEntriesDTO\|MyTournamentCard\|MyEntryLine\|MatchNodeDTO` | 26 (types 11) | 69 (17) | 10 (2) | contained *because the tier is small* (51 source files) — zero mechanism guards it |
| 7 | FK-less entries spine + `committed_player_id` into a blob | `committed_player_id\|committedPlayerId\|submission_id\|entry_player_id` | 36 | 152 | 20 | medium — high density (4.2 hits/file); cover is real |
| 8 | Unversioned JSON blobs | `tournaments\.data\|TournamentStateDTO\|state_blob\|\.data\["\|data\.get\("players"` | 34 | 94 | 9 | medium per-blob / pervasive all-23-at-once (JSON columns overall: 118 files, 299 sites) |
| 9 | `kind` engine forks | tight: `kind == "bracket"\|kind === .bracket.\|tournament\.kind\|is_bracket\|isBracket` | 22 (broad 45) | 45 (81) | 4 (30) | medium-low — 10 authoritative forks, enumerable; a fork registry is a one-sitting change |
| 10 | The match shape family | `MatchStateDTO\|match_states\|PlayerMatchDTO\|MatchNodeDTO\|matchKey\|BracketMatch` | 94 | **463** | 35 | **pervasive** — highest density (4.9/file); non-merge is ruled, so only the three-record join + the status union are tractable |
| 11 | Score + Assignment families | score / assignment patterns | 39 / 51 | 104 / 173 | 11 / 16 | medium — dialect-only duplication; only the divergent-validation `MatchScore` is a defect |
| 12 | Event id-vs-code + workspace key kinds | `eventCode\|event_code\|entry_event_id\|drawKey\|draw_key\|rankCounts` | 120 | 414 | 61 | **pervasive — second largest.** Every projection on both tiers keys off the mutable code |
| 13 | `dto.generated.ts` has zero importers | `dto\.generated` (mentions are the point) | **5** | 12 | 2 | **contained** — the smallest change with leverage over two pervasive areas |

**Ranking by blast size:** 5 (221) · 12 (120) · 10 (94) · 11 (51/39) · 9 (45) · 1 (37) · 7 (36) · 8 (34) · 3 (33) · 2 (30) · 6 (26) · 4 (23) · 13 (5).

**Phasing read:** **13 → 4 → 6/2** are the early, cheap, mechanism-installing phases. **5, 12, 10** are program-scale and should be sequenced *after* 13 gives them a machine-checked diff to land against.

---

## 7. Findings register `F-DM-01..77`

77 findings deduped from 115 `PF-*`/`MX-*` proposals across the seven artifacts. **7 blocking · 35 structural · 19 cosmetic · 16 not-fragmented.** Ids run `01..77`; **F-DM-28 is split into `28a`/`28b`** (two distinct mirror defects, one mechanism) so the ids after it stay stable — 78 register rows, 77 findings. Merged proposal ids are listed per finding; the full PF→F-DM mapping is `.superpowers/sdd/2026-08-24-sp-dm-1-domain-model-audit/fdm-map.md`.

### 7.1 Blocking

| ID | Finding | Evidence | Merges |
|---|---|---|---|
| **F-DM-01** | The *rule* is **ruled** (§8.7: a blank `birth_year` matches nothing by design and must "ride the `looks_duplicate` → NEEDS_REVIEW advisory"). **The gap is that the advisory does not cover the fork it promises to flag:** `looks_duplicate` is scoped to a single `Entry.entry_event_id`, so a blank-birth-year fork across *different* events mints a second `entry_players` row, a second `personKey` and a second public player page **with no NEEDS_REVIEW flag anywhere** — contradicting the ruling docstring's own claim. | rule `entries/submissions.py:280-294,305-318`; advisory `:228` with the event filter at `:256`; nullable column `db/models.py:1359`; form parse `entries/entry_form.py:53,78` | PF-4-1, PF-4-15 |
| **F-DM-02** | `partners.accept()` mints a fresh `EntryPlayer` **unconditionally** — it never calls `same_person`, so a person who enters on their own and then accepts a doubles invite under the same account always becomes two person rows / two `personKey`s. The ruling's principle (§8.7), unapplied on the partner path: `73f7e329` touched `submissions.py` only. | `entries/partners.py:205-224` (cf. the adoption at `entries/submissions.py:419`) | PF-4-2 |
| **F-DM-03** | **Pair identity is destroyed at the commit seam.** `_plan_bracket` emits `{"type":"PLAYER","member_ids":[]}` for every entry regardless of `entry_type` or `partner_entry_id`; no `TEAM` is constructed anywhere in `entries/`. An accepted pair reaches the draw as two singletons and is re-minted by hand as a name concatenation with a synthetic id. | `entries/entries.py:592-603`; `modules/bracket/BracketPlayerFields.tsx:240-254` | PF-5-1, PF-4-3, PF-2c-5 |
| **F-DM-04** | **A bracket person's primary key is a slug of their display name** (`p-<name-slug>`): two same-named people are one participant; a rename re-keys the person; a lossy `nameFromSlug()` inverse exists because the slug is the only name available on some paths. ⚠ The "D3" in that comment is the **bracket defect series**, *not* debt-log D3 (the depcruise cross-product warns) — two unrelated registers. | `apps/console/src/lib/playerSlug.ts:7-13`; `core/schemas.py:275-276`; `api/bracketDto.ts:13-20`; defect narrative `modules/bracket/bracketMigration.ts:11` | PF-4-4, PF-2c-4 |
| **F-DM-05** | **The only storage link from the people spine to the competition spine is an unconstrained String pointing *into* a JSON blob** — `entries.committed_player_id` → `tournaments.data["players"][].id` — bridged by `f"entry-{uuid}"`, minted once and independently re-derived twice. Entries→competition has **zero FK-bearing hops**; renaming the prefix silently orphans every public player page. | `db/models.py:1540-1544`; `core/schemas.py:1019`; minted `entries/entries.py:227`, re-derived `entries/entries_site.py:88,942` | PF-2a-7, PF-5-5 |
| **F-DM-06** | **23 of 24 JSON blobs carry no version field**, including every blob that holds a domain concept: pair `member_ids`, draw `slot_a/slot_b`/`dependencies`, result `score`, entry `pending_reasons`, money `fee_basis`. The one versioned blob is versioned three incompatible ways. | `db/models.py:129,132,142`; `core/schemas.py:1015,1028`; full inventory in `census-2a.md` §3 | PF-2a-4 |
| **F-DM-07** | `entries.partner_entry_id` — the only structural record that two humans agreed to play together — is read by **exactly two public projections**, and only to render a name string. Zero engine readers, zero console readers, zero entrant-app readers (tree-wide grep: 16 hits = 4 migrations + 2 model + 2 writer + 6 reader + 4 test). | `entries/entries_site.py:887-928`; `entries/entries_me.py:277-320` | PF-5-2 |

### 7.2 Structural

| ID | Finding | Evidence | Merges |
|---|---|---|---|
| **F-DM-08** | Meet's entire draw-slot hop **runs in the browser with no provenance**: `sideA = players.filter(groupId && ranks).slice(0, needed).map(p=>p.id)`, `id: uuid()`. Doubles pairs are "whichever two are first in filter order". No server route, no `sourceEntryId` on a match, no server-side test. | `apps/console/src/modules/meet/matches/RegenerateMenu.tsx:84-109,55-57` | PF-5-3 |
| **F-DM-09** | The Entries→Bracket provenance link (`bracket_participants.meta.sourceEntryId`) is **preserved only at hydration and dropped at every other exit** — the generation path and both `ParticipantOut` call sites. It exists in one table and reaches no layer above it. | written `entries/entries.py:600`; kept `bracket/brackets.py:809`; dropped `:2178-2185`, `:244-251,1171-1178,1211-1218` | MX-1, PF-5-4 |
| **F-DM-10** | The Entries↔roster link is **two independently-written half-pointers**, either of which can dangle: `entries.committed_player_id` (column→blob) and blob `sourceEntryId` (blob→`entries.id`). The crash window is documented verbatim and closed by adoption, not rollback. Neither is constrainable. | `db/models.py:1542`; `core/schemas.py:263`; `entries/entries.py:239-248,405,581` | MX-2 |
| **F-DM-11** | The two R13 spine columns are **FK-less in `models.py` but FK'd in the migration**, reached through `viewonly` relationships. The unit suites build schema via `Base.metadata.create_all`, so **the test schema is weaker than production** — an orphan is representable in tests, an `IntegrityError` in prod — and the drift test compares columns only, never constraints. | `db/models.py:1495-1496,1555-1570,1576-1594` vs `alembic/versions/s3d8f2b5c0e1_entries_accounts_and_submissions.py:373-382`; drift test `tests/backend/unit/test_entries_migration.py:297-304`; enforcement `apps/api/src/db/session.py:43-45` | PF-2a-1, PF-4-7, PF-5-12 |
| **F-DM-12** | `entries.partner_entry_id` is **mutual by write convention only** — no FK in ORM or DB, nothing prevents or detects a one-directional link, and each half is confirmed independently, so half a pair can be confirmed. | `db/models.py:1503-1507`; written `entries/partners.py:236,243`; confirm `entries/entries_routes.py:230` | PF-4-8, PF-2a-3 |
| **F-DM-13** | **"Is this event doubles?" has four independent answers** and nothing reconciles them: `entry_events.entry_type == 'doubles'`, `rank.endsWith('D')` after digit-stripping (**declared twice verbatim**), a hardcoded `['MD','WD','XD']` list, and `Participant.type == TEAM`. | `entries/partners.py:78-80`; `modules/meet/roster/positionGrid/helpers.ts:105` + `modules/meet/matches/RegenerateMenu.tsx:31`; `BracketDrawsTab.tsx:240`, `BracketPlayerFields.tsx:200`, `DrawDetailPanel.tsx:28`; `db/models.py:459` | PF-5-6, PF-5-15 |
| **F-DM-14** | Pair membership is **decoded out of a rendered label**: a TEAM's display name is `split(' / ')` and positionally zipped onto `member_ids` (silently skipped on count mismatch); the same split is repeated at five render sites. | `modules/bracket/bracketMigration.ts:41-53`; `DrawView.tsx:989,1200`, `bracketLabels.ts:147`, `BracketMatchesTab.tsx:137`, `opsBlock.ts:25` | PF-4-9 |
| **F-DM-15** | `bracketMigration` decides a roster row is corrupt by testing **`p.name === p.id`** — identity repair keyed on a name equalling a slug — and its output is **persisted**, so a wrong decode becomes data. | `modules/bracket/bracketMigration.ts:78-114,102,108` | PF-4-10 |
| **F-DM-16** | **The operator wire has no person key.** `EntryDeskRowDTO` carries `playerName` + `committedPlayerId` but no `entryPlayerId`, so the desk cannot group a person's entries across submissions except by eye — even though the backend resolved it (R-P7c). `personKey` reaches **zero lines of console code**; its only occurrences are in the unimported generated file. | `core/schemas.py:735-751`; `api/dto.ts:708`; `modules/entries/EntriesDesk.tsx:217,515`; only hits `api/dto.generated.ts:3805,4956,5245` | PF-4-6, PF-2c-6, PF-2c-7 |
| **F-DM-17** | **No global person exists.** `personKey` is tournament-scoped, so one human across two workspaces is two person identities with only `entrant_accounts.id` in common. Profile v1 / R15 has **no ruling text anywhere in the tree** → owner-supply `R-DM-*`. | `db/models.py:1339-1342`; R15 grep result in `citations-pack.md` §6 | PF-4-13 |
| **F-DM-18** | **Two person key-spaces on one public tier, joined only by a string convention, with keyless names below them.** `personKey` (entrants tab, player page) vs `participantKey` (draws) vs bare `names[]`/`name` (seeds, winners, match sides, reserves); `TeamDTO` additionally **drops `members`** vs `ParticipantOut`, so a draw node cannot address the people in a pair. Consequence: a player page is linkable from exactly one surface. | `entries_site.py:193,210,242,265,118,418-433`; `entries_json.py:316-329`; `brackets.py:247`; single link site `apps/entrant/app/components/EntrantsList.tsx:69` | PF-4-11, PF-2b-3, PF-2b-4, PF-2d-1 |
| **F-DM-19** | *(known ruled gap — **cited, not found**.)* Two person-shapes carry no `entry_player` row and therefore no identity: hand-added roster players and hand-added bracket participants. The rule is already ruled — names in draws/matches link to a player page **only when resolvable to an `entry_player`**, otherwise plain text. | `docs/history/programs/SP-P7-phase0-audit.md:64-76` (the caveat); the two shapes at `core/schemas.py:263`, `db/models.py:456-472` | PF-4-16 |
| **F-DM-20** | The partner *relation* before acceptance is an **email string**, and rival pairings are detected by string equality on it (flagged, never resolved — I4). A person who accepts from a different address is a different key. | `entries/partners.py:110,163,147-174`; kept-after-acceptance rationale `db/models.py:1508-1511` | PF-4-12 |
| **F-DM-21** | `Match.playerIds` mixes meet UUIDs and bracket slugs **with no `source` tag**, sitting beside a properly discriminated `matchKey` — so the double-booking guard the field exists for (debt D20) cannot see a human who appears under both namespaces. | `platform/domain/match.ts:50-59,73`; filled `modules/operations/opsBlock.ts:105,161` | PF-4-5 |
| **F-DM-22** | **One Meet match is three records + one blob joined by an unconstrained `String(100)`:** `matches` (court/slot/status, **no side columns**), `match_states` (**no `__table_args__` at all** — no composite FK, no index, while the analogous `commands` table declares one), and `data["matches"]`. The projection that keeps them in step **deletes** rows whose id left the blob. | `db/models.py:173,210-212,261-266,281-301`; `core/schemas.py:1020`; `repositories/local.py:440-484` | PF-2a-2, PF-5-7 |
| **F-DM-23** | **Meet has no Event object at any layer** — an event is a rank-code string (`eventRank`/`ranks[]`) with **no storage join** to `entry_events.code`, and an empty `rankCounts` accepts every code; the seam additionally **invents** `PlayerDTO.groupId = event.code` (required field, an entry has no school) and creates a matching `groups[]` row. This is D8/F-E1 in situ — cite `2026-08-06-entries-design.md:1721-1729`, do not re-open. | `core/schemas.py:249,309`; `entries/entries.py:371,426-441,392-416` | PF-2b-14, PF-5-8 |
| **F-DM-24** | **One tier, two event keys, and both Event bridges unconstrained.** The write path posts the `entry_events.id` UUID; every public read projection keys by the mutable director-typed `eventCode` across six shapes, and no layer declares the join. A code rename silently orphans across all four layers. | `routes/enter.tsx:280,291` → `entries/entry_form.py:57`; `entries_site.py:199,215,229`, `entries_json.py:316`, `lib/draws.types.ts:96,112`, `my-entries.d.ts:9`; `db/models.py:1395-1399`; console `api/dto.ts:43,287,341-342,690,693`, `api/bracketDto.ts:29,142` | MX-5, PF-2d-9, PF-2c-10 |
| **F-DM-25** | **One workspace, four key kinds, and no layer declares the mapping:** uuid (storage + operator wire) → `entry_pages.slug` (public wire, **nullable** on the my-card) → capability token (display) → **no id at all** on the console's own state blob and Zustand store. The console never holds the key it is scoped by. | `db/models.py:89`; `workspaces/tournaments.py:88`; `entries_json.py:536`; `entries_me.py:93`; `display/display.py:111`; `api/dto.ts:470,854`, `api/bracketDto.ts:173`, `store/tournamentStore.ts:22` | MX-4, PF-2b-13, PF-2c-15 |
| **F-DM-26** | **Standings is declared nine times** (8 typed + 1 untyped) with no shared source, in **two grains**: `groupId` (a school) vs a participant. Three of the eight share the exact name `StandingRowDTO` across three tiers. The *computation* is correctly single-authority — this is pure shape duplication. | `bracket/brackets.py:323`, `bracket/standings.py:52`, `meet/standings.py:31`, `core/schemas.py:990`, `entries_site.py:166`, `api/bracketDto.ts:130`, `api/dto.ts:461`, `lib/draws.types.ts:64`; untyped `display/display.py:199` | PF-2b-5, PF-2c-12, PF-2d-3, C-3 |
| **F-DM-27** | `dto.generated.ts` — documented as the authoritative type source and regenerated the same day — has **zero importers**, and is explicitly excluded from knip, vitest coverage and the public-URL contract test. The 1,065-line hand mirror it should police is reconciled by eye. **It is the missing mechanism behind F-DM-28 and F-DM-29.** | `api/dto.ts:5-8,14`; `apps/console/knip.json:5`; `apps/console/vitest.config.ts:22`; `platform/contracts/__tests__/publicUrlContract.test.ts:75` | PF-2c-1 |
| **F-DM-28a** | The hand `PlayerDTO` declares three fields (`status`, `withdrawalReason`, `withdrawnAt`) absent from the backend `StrictModel` (`extra="forbid"`), which would 422 on write. No console code writes them, and the one place `status` is read — the substitute filter `p.status !== 'withdrawn'` — is therefore a permanent no-op. | `api/dto.ts:291-293` vs `core/schemas.py:244-255`, `core/limits.py:120-128`; dead read `modules/operations/run/MeetMatchPanel.tsx:70` | PF-2c-2 |
| **F-DM-28b** | The hand `MatchStateDTO` carries 19 fields against the wire's 10; the nine client-only fields are silently dropped by the backend's `StrictIgnoringModel` and hand-preserved locally to compensate. **Live-ops state has two half-authorities.** | `api/dto.ts:226-256` vs `operations/match_state_routes.py:108-118`, `core/limits.py:131-138`; workaround + comment `hooks/useLiveTracking.ts:269-276` | PF-2c-3 |
| **F-DM-29** | **The entrant tier is a fully hand-maintained mirror of Pydantic response models** with no generator and no cross-tier contract test — nothing fails when a backend field changes shape — plus a hand-written `.d.ts` shadowing a hand-written `.js` as a fourth mirror set that no type checker ever compares to `MyEntriesDTO`. | `entrant/app/lib/{entryPage,draws,player}.types.ts:1-20` (all three say "mirrored from"); `entrant/public/assets/my-entries.d.ts:1-6,8,23,37` vs `entries/entries_me.py:115` | PF-2d-4, PF-2d-8, PF-5-10 |
| **F-DM-30** | **Two public read routes ship with no `response_model`** and return raw dicts — the one unauthenticated data plane is the one with no declared shape. `GET /display/{token}/state` is a hand-filtered blob over a **Python tuple** of field names with a prose comment naming its TS consumer; `GET /display/{token}/bracket` returns `_serialize_session()` raw. | `display/display.py:161-168,171-201,196-241,214-236` | PF-2b-11, PF-5-11 |
| **F-DM-31** | **The public tier's two match shapes are non-convertible:** `MatchNodeDTO` is key-bearing (`nodeKey`, draw context) and `PlayerMatchDTO` carries **no key at all** while folding meet+bracket. A reader cannot get from a match on a player page back to the same node in the draw. | `lib/draws.types.ts:44` vs `lib/player.types.ts:17`; backend `entries_site.py:145,248`; fold `:54,1064` | PF-2d-10 |
| **F-DM-32** | **One public field, two semantics — twice.** `PlayerMatchDTO.eventCode` is a discipline code on the bracket branch and a rank *slot* (`MS1`) on the meet branch; `PlayerMatchDTO.score: List[List[int]]` is real set rows on one branch and a **fabricated one-row `[[a,b]]`** aggregate on the other. No discriminator. ADR 0006 rules the *records* non-merged; it does not rule that one public field may carry both. | `entries_site.py:1021` vs `:1135,1142`; set rows `_score_rows` `:463` | PF-2b-7, PF-2b-8 |
| **F-DM-33** | Public draws/seeds/winners are **bracket-only by omission**: `_hydrate_session` returns `None` on an empty `bracket_events`, so a Meet workspace's `draws: []` is indistinguishable from "not generated yet". | `bracket/brackets.py:734-735`; `entries_site.py:515-545` | PF-5-13 |
| **F-DM-34** | **Two live answers to "which engine is this workspace".** `commit_entries` reads `tournaments.kind` — with `or "meet"` swallowing NULL/unknown and no CHECK on the column — while `_board_kind` deliberately reads `workspace_modules.status` and can answer `"hybrid"`. A both-modules-enabled workspace commits entries to exactly one engine while its board shows both. | `entries/entries.py:165-167`; `db/models.py:121`; `display/display.py:120-154`; console mirror `modules/display/useDisplayKind.ts:19,54` | PF-5-9 |
| **F-DM-35** | **Doubles has no operator wire shape at all**: `partner` on `core/schemas.py` → 0 hits, and `EntryDeskRowDTO`'s docstring still says the doubles columns "mean nothing until E3" — which shipped. The desk cannot show, or act on, a pairing. | `core/schemas.py:715-720` | PF-2b-1 |
| **F-DM-36** | **Six representations of one pair**, only one id-bearing and it is in the layer out of scope for change: `entries.partner_*` columns → *(nothing)* → a client-synthesized TEAM id + name concatenation → `member_ids` JSON slug list → `Side = List[ParticipantId]` → `TeamDTO{participantKey,names}` with `members` dropped → a bare `partnerName` string. The operator API has **zero**. | `db/models.py:1503-1524,472`; `BracketPlayerFields.tsx:250-251`; `scheduler_core/domain/tournament.py:19,34`; `entries_site.py:118,239`; `entries_me.py:89` | PF-2b-2, C-4 |
| **F-DM-37** | **Zero `CheckConstraint` in the entire schema.** ~19 enum-valued columns are unconstrained `String`, including tenancy-relevant `tournament_members.role`, lifecycle-relevant `entries.state`/`matches.status`, and the engine discriminator `tournaments.kind`. Typed Python enums exist but never reach the DB. | `grep "CheckConstraint\|create_check" alembic/versions/*.py` → 0; `db/models.py:60,113,121,197,288,358,430,436,471,571,580,773,849,1010,1409,1412,1500` | PF-2a-5 |
| **F-DM-38** | A **bracket** roster (`data["bracketPlayers"]`) plus its migration flag (`bracketRosterMigrated`) live inside the **meet** state blob, giving Bracket two person representations — blob list and `bracket_participants` rows — with no key between them. | `core/schemas.py:1032-1035`; `db/models.py:129,456-474` | PF-2a-6 |
| **F-DM-39** | `TournamentStateDTO` is a **keyless whole-blob document**, and `state_dto_from_document` silently drops any stored section the DTO does not declare (`bracket_session` and `_integrity` today). The wire type is a known-lossy filter over storage, by design and by comment. | `core/schemas.py:1008,1047` | PF-2b-18 |
| **F-DM-40** | `EntryPageDTO` names **two structurally unrelated things** across tiers — a flat stored row on the console, a nested projection on the entrant tier — and nothing (no test, no generator, no comment on either side) records that the collision is intentional. | `apps/console/src/api/dto.ts:912` vs `apps/entrant/app/lib/entryPage.types.ts:125` | PF-2d-2 |
| **F-DM-41** | **Wire-dialect split inside one OpenAPI document:** the entire bracket router is snake_case, everything else camelCase; the console's two hand mirrors reproduce the split, so a match's duration is `durationSlots` or `duration_slots` depending on which engine emitted it. | `bracket/brackets.py:391-398`; `api/dto.ts:343` vs `api/bracketDto.ts:67` (its camelCase exception `:92` is the deliberate ADR-0006 mirror) | PF-2b-6, PF-2c-13 |
| **F-DM-42** | **No type on the entrant tier models the R13 chain.** Submission surfaces only as a bare `submissionId` on the receipt loader; `MyTournamentCard` **is** a submission (it carries `submittedAt`, `feeTotalCents` and the entry lines) but is modelled and named as a tournament card. | `entrant/app/routes/receipt.tsx:79`; `entrant/public/assets/my-entries.d.ts:23-35,40` vs `docs/reference/modules/entries.md:9-26` | PF-2d-11 |

### 7.3 Cosmetic

| ID | Finding | Evidence | Merges |
|---|---|---|---|
| **F-DM-43** | `MatchScore` is defined **twice with divergent validation** — unbounded ints vs `ge=0, le=99` — on the same (meet) lane, so ADR 0006 does not cover it. *(Severity hedge: the source proposal marked it "cosmetic→structural"; banded cosmetic because no shipped defect is cited.)* | `core/schemas.py:621` vs `operations/match_state_routes.py:103` | PF-2b-9 |
| **F-DM-44** | Assignment ×4 and Score ×5 across wire + core, differing only in dialect and in which optional actuals they carry. The meet/bracket score *split* itself is deliberate and documented (ADR 0006 named at the declaration) — not drift. | `core/schemas.py:317`, `bracket/brackets.py:284`, `scheduler_core/domain/models.py:169`, `domain/tournament.py:126`; `api/bracketDto.ts:92-102` | PF-2b-15, PF-2c-N2 |
| **F-DM-45** | `MatchStateOut` is **dead code** — its docstring admits "not yet wired to a GET endpoint" and a tree grep finds zero references. A third match-state shape that no route serves. | `core/schemas.py:1170-1192` | PF-2b-10 |
| **F-DM-46** | The match-status union is declared **three times with three shapes**: inline on `MatchStateDTO`, as `MatchStatus` in the canonical domain, and as `LegacyStatus` in the store. | `api/dto.ts:228`; `platform/domain/match.ts:26`; `store/matchStateStore.ts:18` | PF-2c-8 |
| **F-DM-47** | `TournamentStatus` and `WorkspaceStatus` are the identical three-member union under two names, and the seven-member phase vocabulary is written out inline on `WorkspaceSignalsDTO.phase` instead of reusing `WorkspacePhase`. | `api/dto.ts:631,843-850` vs `platform/domain/lifecycle.ts:28-36` | PF-2c-9 |
| **F-DM-48** | Bracket's `EventDTO` is **not exported**, so consumers reach it through a structural-index alias `BracketTournamentDTO['events'][number]`; three modules import the alias rather than the type. | `api/bracketDto.ts:142`; `modules/bracket/eventUpsertPayload.ts:17`; consumers `DrawDetailPanel.tsx:12`, `rosterEvents.ts:13`, `BracketDrawsTab.tsx:47`, `BracketPlayerFields.tsx:21` | PF-2c-11 |
| **F-DM-49** | `EntryDTO` (console) and `EntryDeskRowDTO` (backend/OpenAPI) are the same 12-field shape under two names, so a grep for the wire type finds nothing in the console. | `api/dto.ts:688` vs `api/dto.generated.ts:3900` | PF-2c-14 |
| **F-DM-50** | Every API **request** shape for the proposal/repair/director pipeline is declared inline in `client.ts` (11 local types) rather than in either DTO mirror — the write side of the contract has no mirror at all. | `api/client.ts:109,119,127,129,143,154,166,172,188,198,203` | PF-2c-16 |
| **F-DM-51** | Three hand-kept views of `entry_pages` with no generated relation — `EntryPageUpsertDTO` (write, strict), `EntryPageDTO` (operator read), `PageDTO` (public read). Fields drift one at a time. | `core/schemas.py:792,852`; `entries/entries_json.py:253` | PF-2b-16 |
| **F-DM-52** | `PlayerDTO` and `BracketPlayerDTO` grew the identical Seam-A provenance pair (`sourceEntryId`, `remarks`) independently, each with its own explaining comment. | `core/schemas.py:256-269` vs `:290-295` | PF-2b-17 |
| **F-DM-53** | `packages/shared-contract/non-scheduling-keys.json` is a flat unversioned string array with no `$schema` and no version key, and both readers hard-code the relative path. *(The seam itself is a positive control — F-DM-69.)* | `packages/shared-contract/non-scheduling-keys.json:1`; `workspaces/config_lock.py:14` | PF-2b-19 |
| **F-DM-54** | Display imports a **private** helper across a domain boundary: `from operations.match_state_routes import MatchStateDTO, _row_to_dto`. | `display/display.py:27` | PF-2b-12 |
| **F-DM-55** | `match_states` stores timestamps as `String(40)` (`called_at`, `actual_start_time`, `actual_end_time`) while every other table uses `DateTime(timezone=True)`; `tournaments.tournament_date` is `String(32)` for the same "mirror the wire shape" reason. **Time is not comparable in SQL on the Meet operational path.** | `db/models.py:289-291,124` | PF-2a-9 |
| **F-DM-56** | Three FK-less operator-identity pointers — `tournaments.owner_id` (documented deliberate), `invite_links.created_by` (undocumented), `commands.submitted_by` (indexed, not FK'd). Deleting a `users` row leaves dangling audit provenance in two of the three. | `db/models.py:93,387,244` | PF-2a-8 |
| **F-DM-57** | `DrawCardDTO.drawKey` and `.eventCode` are assigned the **same `event.id`** at one call site, then modelled as two independent keys on the entrant tier — a distinction that exists only in the type system, and one that makes a future draw/event split look already-modelled when it is not. | `entries_site.py:529-530`; `lib/draws.types.ts:9,11` | PF-5-14, MX-3 |
| **F-DM-58** | Persons are parsed out of display strings in presentation code: `formatPlayerName` guesses the surname as the last whitespace token (its own `ponytail:` comment names the ceiling), and every board/list splits a pre-joined side string. Presentation-direction only. | `apps/console/src/lib/names.ts:12-23,27-60` | PF-4-14 |
| **F-DM-59** | Docstring line-number rot on the entrant tier: of 14 line-numbered backend citations, **13 resolve to unrelated code** (2 point past the end of a 468-line file); plus ≥3 file-only citations naming files that no longer exist and 1 naming the wrong file. Every `backend/`/`api/` prefix is pre-SP-REORG-1. | `census-2d.md` §5 table | PF-2d-5 |
| **F-DM-60** | Three public enums are typed `'a' \| 'b' \| … \| string`, so the union is decorative and TS cannot exhaust them: `MyEntryLine.state`, `MyTournamentCard.status`, `EntryEventDTO.entryType?`. `PageStatus` is the one closed union — the tier is inconsistent with itself. | `my-entries.d.ts:13,31`; `lib/entryPage.types.ts:30`; `lib/phase.ts:43` | PF-2d-6 |
| **F-DM-61** | The bracket format vocabulary is written out a **third** time as a tier-local label map, with the tag union living only in a docstring comment (`kind: string`). | `lib/draws.types.ts:13,126` vs `modules/bracket/formatRegistry.tsx:221` vs `apps/api/src/bracket/formats/__init__.py:241` | PF-2d-7 |

### 7.4 Explicitly NOT fragmented

These count. Four of them are prior art the target model should copy rather than invent.

| ID | Finding | Evidence | Merges |
|---|---|---|---|
| **F-DM-62** | **Public `personKey` is an opaque `entry_players.id` UUID, never a name** — on both public person surfaces, with the docstring stating why ("two entrants sharing a name is routine at a club and must not collide into one page"). **The positive control.** Cited, not re-derived. | `entries_json.py:229,242-247,478-486`; `entries_site.py:1041`; ruling `SP-P7-phase0-audit.md:64-76` | PF-2a-12, PF-2b-20, PF-5-21 |
| **F-DM-63** | **The R13 chain is fully materialized and is the cleanest region of the schema**: four tables, correct level placement (idempotency/fee/acceptance on the submission, remarks/gender on the player), real FKs on both account edges, one deliberate uniqueness index. | `db/models.py:1217-1306,1309-1382,1343-1345,1453-1570`; `docs/reference/modules/entries.md:9-26` | PF-2a-13 |
| **F-DM-64** | **Bracket storage is properly constrained.** All four bracket tables carry real composite CASCADE FKs to their parent in models *and* migrations; `bracket_results` is a correct 1:1 on `bracket_matches`. The scouted "several without FK constraints" does not hold at either layer. | `db/models.py:484-490,543-555,587-601`; `alembic/versions/f7a3c9b2e8d4_step_t_a_bracket_schema.py:102-107,177-182,218-231` | PF-2a-10 |
| **F-DM-65** | **Workspace fan-in is complete.** 15 child tables cascade off `tournaments.id` with declared FKs; deleting a workspace orphans nothing. `entrant_accounts` is the single exception and its exemption is documented and ruled (D-A2). | `db/models.py:150-170,1116-1117`; `s3d8f2b5c0e1:77-81` | PF-2a-11 |
| **F-DM-66** | `entries.entry_event_id` → `entry_events.(tournament_id, id)` is a **real composite CASCADE FK in models and migration** — the one hop constrained at both layers on the whole path, and the model for what the others could be. | `db/models.py:1555-1560` | PF-5-17 |
| **F-DM-67** | **Cross-engine match addressing is already solved twice, consistently:** `NextMatchDTO.source: Literal["meet","bracket"]` beside `matchId` (its comment cites ADR 0006: "an id alone cannot address a row") and the console's `matchKey = ${source}:${id}`, fed by exactly one adapter pair per ADR 0009. `OpsBlock` is a deprecated alias, not a second model. **Prior art for whatever the person layer needs.** | `workspaces/workspace_signals.py:112-118`; `platform/domain/match.ts:28,73,78`; `modules/operations/opsBlock.ts:19,53,130,240` | PF-2b-22, PF-2c-N1, PF-5-18 |
| **F-DM-68** | **Operations→Display reuses `MatchStateDTO` verbatim** rather than copying it (`schemas.py:626-632` documents the 422 regression a duplicate stub once caused), and Operations→Bracket *advancement* stays unwired on the API side (import-linter contract 4) — the console-only edge is the known debt-log D3 cluster, not a backend seam. | `display/display.py:204`; `core/schemas.py:626-632`; `apps/api/.importlinter` | PF-2b-21, PF-5-19 |
| **F-DM-69** | **`packages/shared-contract/non-scheduling-keys.json` is a real typed seam** — one file, loaded by the API classifier, mirrored in the console, **pinned by a parity test on both sides**. The only genuinely shared cross-tier contract in the repo, and the shape every other boundary in §5.1 should be measured against. | `workspaces/config_lock.py:14,41`; `store/tournamentStore.ts:130`; `store/__tests__/nonSchedulingKeys.parity.test.ts:15-18`; `tests/backend/unit/test_config_lock.py` | PF-2b-23, PF-5-16 |
| **F-DM-70** | **`scheduler_core` is clean of intake concepts** — grep `entry\|submission\|account\|standing` over `scheduler_core/domain/` → 0 hits. Invariant I3 ("event day never reads an entry row") holds at the type level, and the two-layer split (`models.py` = solver, `tournament.py` = competition) is coherent: the solver layer has no Result and no Event-with-format, exactly the purity ADR 0006 asks for. | `packages/scheduler-core/scheduler_core/domain/` | PF-2b-24 |
| **F-DM-71** | **Public projections gate at the query, not the renderer.** The SELECTs name published columns only, so contact data is structurally absent; the entries DTOs are strict allow-list projections with negative tests behind them (`EntrantRowDTO`, `SeasonRowDTO`'s key-set test, `AccountExportDTO`'s credential exclusions). Their *multiplicity* is the cost of that discipline, not accidental drift — any unification must preserve the allow-listing. | `entries_public.py:210-215,232-256,360-386`; `entries_json.py:229-245,531-534`; `entries_me.py:573-586`; `tests/backend/test_season_listing.py` | PF-2b-25, PF-5-20 |
| **F-DM-72** | **Adopt-don't-duplicate at the commit seam holds** — one roster player per person, matched on either the deterministic `entry-{…}` id or the row's `sourceEntryId`, re-runnable and additive (R3). **F-E1-2 is CLOSED** (`fc26f5a`, 2026-08-10); do not re-open. F-E1 is unaffected and stays open. | `entries/entries.py:227,230-259`; closure `docs/history/programs/ENTRIES_PROGRESS.md:1186-1194` | identity-trace §6.4 |
| **F-DM-73** | **The public partner fold and erasure both join by key, not by name.** The fold walks `partner_entry_id` → `Entry` → `entry_player_id` → `EntryPlayer.full_name`, batched, with `list_opt_out` and `erased_at` gates; erasure keys off `EntryPlayer.erased_at`, which filters both `same_person` and the public folds. D7's ruling (scrub the PII, keep the rows) is cited, not re-opened. | `entries_site.py:886-928,915`; `entries/submissions.py:314`; ruling `docs/reference/debt-log.md:33` | identity-trace §6.5, §6.8 |
| **F-DM-74** | **Operator/entrant namespace separation is deliberate and reasoned**, not drift: entrant membership is *structurally unrepresentable* because the membership FKs point at `users`. | `db/models.py:1106-1108,1119-1123` | identity-trace §6.3 |
| **F-DM-75** | **Console positives.** The entries desk models R13 correctly (`EntryGroup` bands by `submission.id`, reasoning written at the type; per-submission fee on the submission) · `standings` is correctly single-authority with **no store setter** · five Zustand stores, only two hold domain data, no shadow domain store hiding in any module · `sourceEntryId` is a real typed back-reference present on **both** roster shapes, with the StrictModel-refusal hazard documented at the declaration. | `api/dto.ts:294-300,324-327,454-467,717-734`; `modules/entries/entryDisplay.ts:101-125`; `store/tournamentStore.ts:63-70`; `hooks/useBracket.ts:53-55`, `modules/entries/EntriesDesk.tsx:94`, `modules/display/useDisplayKind.ts:45` | PF-2c-N3..N6 |
| **F-DM-76** | **The entrant tier holds no workspace UUID at all** — the public tier is addressed exclusively by `entry_pages.slug`, and RR7 loaders carry state with no store. Raw tournament UUIDs are never public keys, by design (SP-CLOUD-2). | `lib/entryPage.types.ts:102`, `lib/phase.ts:56`, `public/assets/my-entries.d.ts:23`; `census-2d.md` §6 | census-2d §6 |
| **F-DM-77** | **RULED — cite, don't file.** Meet/Bracket match-record non-merge (ADR 0006:53-59, verbatim: a shared value object "would be dead, ornamental code") · workspace/tournament vocabulary ("Fence it. Do not rename anything.", ADR `0014-workspace-vs-tournament-vocabulary.md:37`; the four-altitudes ⟷ line at `:53`) · `entry_events.bracket_event_id` FK-less (R2) · CASCADE on `submissions.account_id`/`entry_players.account_id` (D7, ruled 2026-08-21 — only the Phase-10 account-deletion half is open) · the lowercased-name soft-duplicate compare (R7, preserved verbatim by R13) · **the person-minting rule itself** (ruled 2026-08-23, §8.7 — "auto-link what is certain, flag the rest, never merge by guesswork"), with the operator merge tool ruled out of scope (`debt-log.md:78`). None of these is a finding. | `docs/explanation/decisions/0006-unified-scheduling-core.md:53-59`, `0014-…:51-54`; `s3d8f2b5c0e1:83-87`; `db/models.py:1250-1252,1343-1345,1475-1482`; `docs/reference/debt-log.md:33` | PF-2a-14, PF-4-15, PF-5-22 |

---

## 8. Prior art & ruled decisions appendix

Everything here is **cited, never re-asked** — spec §5.4 makes a re-asked decision a verification failure.

### 8.1 Person-in-tournament — ANSWERED

`docs/history/programs/SP-P7-phase0-audit.md:64-76` (§4, "R-P7c is RESOLVED by the tree"): `entry_players (tournament_id, id)` **is** the stable person-in-tournament identity; the commit seam materializes **one roster player per person** with the deterministic id `entry-{entry_player_id}` and adopt-don't-duplicate (`_adoptable`), explicitly rejecting the person×event fan-out. **`person_key` = `entry_player_id` (opaque UUID), never the name.** **Caveat (ruled, not found):** hand-added roster players and bracket participants with no entry behind them have no `entry_player` row — names in draws/matches link to a player page **only when resolvable to an `entry_player`**, otherwise plain text. → F-DM-19, F-DM-62.

### 8.2 R13 — the shipped intake model

`docs/reference/modules/entries.md:9-26`: `entrant_accounts → submissions → entries → entry_players`. Account = who acts (all contact data) · Submission = one form act over 1–N events (idempotency key, regulations acceptance, fee snapshot) · Entry = one event for one player-unit (`state`, `pending_reasons`) · Entry player = the human; **"One person in three events is one row."** The target model must express this chain, not replace it.

### 8.3 Standing rulings R1–R14 (`docs/history/programs/SP-PROGRAM-1.md:44-112`)

Domain-model load-bearing: **R2** — `entry_events` is Entries-owned, optional `bracket_event_id`, Meet maps via rank codes (the Entries↔Bracket↔Meet event seam is *ruled*) · **R7** — soft-duplicate flag survives; **no** hard `(entry_event_id, lower(contact_email))` unique index; keep player-identifying fields distinct from contact fields · **R10** — entrant accounts REQUIRED; "Account = SUBMITTER not player; one account enters many players; the self-entering player is the common case, not the model"; sessions scoped to the public host (supersedes R4) · **R12** — per player = name, gender (required), club (optional); per account = email (login identity), phone (director-toggleable); never v1: postal address, federation IDs, DOB except as a plain eligibility field · **R13** — R7's split is now MANDATORY schema; idempotency key + regulations acceptance + fee total attach to the **submission**; "player fields never mixed into contact/account fields".

One-liners: **R1** Entries Tier-1, cloud-gated · **R3** commit seam re-runnable/additive/idempotent · **R5** versioned waiver, DOB = eligibility field · **R6** cloud→local module-row read filter · **R8** `play.*` framework · **R9** Phase-11 domain cutover · **R11** desktop+mobile co-equal · **R14** tiered pricing, `withdraws_until`, max-events + discipline caps, `venue_name`/`venue_address` on `entry_pages` (off the state blob).

Also load-bearing: **I3** (`:35`) the cloud dependency ends at commit — *event day never reads an entry row* (verified at the type level, F-DM-70) · **I8** (`:40`) "Seams over sync" — Meet-blob writes go through `If-Match`/`state_version` fetch-modify-retry, never blind overwrite · **I4** pair conflicts are flagged, never resolved.

### 8.4 Debt-log (`docs/reference/debt-log.md`)

- **D3 (`:29`) — ⚠ ID COLLISION, disambiguated.** Debt-log D3 is *the depcruise `no-cross-product` warns*, 14 in three clusters (ops→bracket, workspace→display, workspace→settings); open disposition per ADR 0011 (accept / relocate / ratchet). The "D3" cited by `apps/console/src/modules/bracket/bracketMigration.ts:11` is a **different register** — a bracket *defect* series: "every name on the Bracket roster of a doubles-only draw read `alexei-sorokin`, because a TEAM participant's members are slugs and there was no PLAYER participant to look the name up from." **F-DM-04 cites the code comment by `path:line`, never "debt-log D3".**
- **D7 (`:33`) — RULED 2026-08-21, PARTLY CLOSED.** Entrant erasure is *scrub the PII, keep the rows* (`entries/lifecycle.erase_player`, migration `w7c2d8e0f5a6`); the `ondelete=CASCADE` on `submissions.account_id` and `entry_players.account_id` is **deliberately still there**. Still owed: Phase 10's account deletion must not be a bare `DELETE` — build it as an account-level scrub over the same seam, or narrow the FKs first. **Only the account-deletion half is a live `R-DM-*` item.**
- **D8 = F-E1 (`:34`, OPEN).** "The Meet mapping targets a rank *slot*, not a division." `rankCounts: {MS: 3}` declares MS1/MS2/MS3, but the seam maps every entrant of entry event `MS1` onto that same slot in the same seam-created group. Ownership is **not** a `§9.3` heading — it is §9 item 3 at `docs/history/superpowers/specs/2026-08-06-entries-design.md:1721-1729`: "Entry events map onto a **division** (MS), not a **slot** (MS1); the seam needs either slot assignment or a division-level mapping. **Do not patch this ad hoc.**" → F-DM-23; **cite, do not re-open**.
- **F-E1-2 is CLOSED** (`ENTRIES_PROGRESS.md:1186-1194`, `fc26f5a`, 2026-08-10): "a roster row is a human, so it now keys on `entry_player_id`, and `_adoptable` matches either that deterministic id or the row's `sourceEntryId`. **F-E1 is unaffected and stays open.**" → F-DM-72; do not list as a finding.
- **L1 (`:51`) — GDPR.** Entrant half done (E5); **operator half open**, plus "a story for the PII carried on workspace state blobs — the retention job does not reach them". Feeds any blob phase (F-DM-06).

### 8.5 R15 — CONFIRMED text-less

Grep for `\bR15\b` across `*.{md,ts,tsx,py,json}` (minus `archive/`, `.claude/worktrees/`, `node_modules`) → **24 hits, zero ruling text**: (a) deferral markers, all "global profiles (R15 v1)" in a *deliberately-not-done* list (`P7_PROGRESS.md:118,279`, `P8_PROGRESS.md:413`, `SP-P7-phase0-audit.md:202`); (b) briefs citing it (`2026-08-11-sp-p6-2-public-ia-brief.md:15,51,63,79`); (c) **phantom flags** — `2026-08-11-sp-p6-2-public-ia-design.md:65-70` ("cited by the brief but exists nowhere in the tree") and `:639-642`, plus `SP-COURT-1.md:234`; (d) the SP-DM-1 plan itself. ⚠ One unrelated hit in a different namespace: `.superpowers/sdd/2026-08-07-phase6-entrant-app/task-5-report.md:33,36` uses "R15" as a local phase-6 requirement id — not the ruling.

**Consequence:** profile v1 / R15 is an **owner-supply `R-DM-*`** item. Do not quote, paraphrase, or infer its content. → F-DM-17.

### 8.6 ADRs (`docs/explanation/decisions/`)

⚠ All ADR bodies are pre-reorg (they cite `products/…`, `services/…`, `backend/…`). The *decisions* are current; paths re-resolved throughout this audit.

- **0002** workspace-as-control-plane — the rename is confined to the UI facade, backed by the existing `tournaments` table and `/tournaments/*`.
- **0003** SQLite as primary persistence — ⚠ **partially superseded by ADR 0012**; its `sync_queue`/Supabase-mirror/Realtime language is **dead**. Cite only for "a single local store is canonical".
- **0006** unified scheduling core — one param builder, one CP-SAT entry; match records **not merged**, verbatim `:53-59`: a shared match-record/score value object "would be constructed by neither module… it would be dead, ornamental code." Bounds the target model's match layer.
- **0008** shared scoring fields — one `ScoringFields` component; the field set is identical *by construction*, engine-specific rows stay per module.
- **0009** universal match contract — formalizes `OpsBlock` as the one canonical cross-module `Match` in `platform/domain/match.ts`; the **only** engine-native→canonical seam is the two adapters in `opsBlock.ts`. → F-DM-67.
- **0011** cross-product boundary policy — "Classify, don't blanket-fix. Three dispositions": accept legitimate consumer/aggregator edges · relocate genuinely-misplaced shared code · ratchet the rest. Governs debt-log D3's cluster question.
- **0014** workspace vs tournament vocabulary — "**Fence it. Do not rename anything.**" (`0014-workspace-vs-tournament-vocabulary.md:37`); the translation `workspace ⟷ a tournaments row ⟷ /tournaments/{tournament_id} ⟷ tournamentStore` — the same thing at four altitudes — at `:53`. **"Tournament vs workspace naming" is not a fragmentation finding.**

### 8.7 The person-minting rule — RULED 2026-08-23

`entries/submissions.py:280-294` (`same_person`'s docstring): the adoption rule is **"the incumbent's rule, ratified at the STOP: auto-link what is certain, flag the rest, never merge by guesswork"** — same account · same normalized name · same birth year, **all present**. Name alone is *explicitly rejected* ("one club rep enters a father and son sharing a name"), and a spec without a birth year "matches nothing rather than guessing"; that person becomes a separate row and is expected to "ride the `looks_duplicate` → NEEDS_REVIEW advisory like every other ambiguity (invariant I4: a flag an operator resolves, never a silent decision)". Recorded in `P7_PROGRESS.md`'s delta section (commit `4d5aca56`). The operator-side resolver is **ruled out of scope**, not missing by accident: `docs/reference/debt-log.md:78` — "Duplicate-person review has a flag and no resolver… ruled out of SP-P7's 'minimal by design' operator scope."

**Consequence for this audit:** the *rule* is ruled and is not a finding. F-DM-01 and F-DM-02 are narrowed to the two places the ruling's own advisory promise does not hold in the tree.

### 8.8 Bottom line

ADRs 0006 + 0009 bound the target model's match layer · ADR 0014 bounds vocabulary · R13 bounds the people spine · D7's ruling bounds erasure · D8/F-E1 owns the slot-vs-division redesign · R15 is owner-supply. The four positive controls to copy rather than reinvent: `personKey` (F-DM-62), `matchKey`/`NextMatchDTO.source` (F-DM-67), `entry_event_id`'s composite CASCADE FK (F-DM-66), and the `non-scheduling-keys.json` two-sided parity test (F-DM-69).

**Next:** `R-DM-*` decisions and the phased Strangler-Fig plan are the companion deliverable, `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md`. **STOP after delivering** — Kyle reviews and issues the rulings before any implementation prompt is written.
