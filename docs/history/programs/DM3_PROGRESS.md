# SP-DM-3 — Domain-Model Unification: program ledger

**ABSOLUTE RULE:** read this file at session start, update it at session end.

**Rulings (the authority):** `docs/history/programs/DM1_RULINGS.md` — all 13 `R-DM`
decisions + 2 pull-forward mini-rulings, ruled by Kyle 2026-08-24. Nothing here
re-decides them.
**Plan:** `docs/history/superpowers/plans/2026-08-24-sp-dm-3-domain-unification-program.md`
— P3 fully detailed (bite-sized TDD tasks); P0–P2, P4–P9 as program cards, each of which
gets its own detailed plan **at phase start against the then-current tree**.
**Design doc / audit:** `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md`
· `docs/history/audits/2026-08-24-domain-model-audit.md` (pinned `e67633fe`).
**Docs branch:** MERGED — `docs/dm1-rulings` fast-forwarded into `main` 2026-08-24
(Kyle's instruction), so register + plan + this ledger are all on `main`.
Implementation happens on `<type>/<slug>` branches off `main` (first: `dm3/p3-minting-gaps`).

## Slices, in ruled execution order

| # | Slice | Ruled by | Size | Status |
|---|---|---|---|---|
| 1 | **P3 — minting gaps** (pulled forward, R-DM-1.x) | R-DM-1 (a)/(a) | S | **DONE 2026-08-24** — branch dm3/p3-minting-gaps (405c34ec..68c27751 + bookkeeping) — **merged to main 2026-08-24** (ff to 9c5e6186, Kyle's instruction) |
| 2 | P0 — type mechanism (parity oracle) | R-DM-9 (a) | M | **DONE 2026-08-24** — branch dm3/p0-type-mechanism (bd262dbd..4630ec53, stacked on P3) — **merged to main 2026-08-24** (ff to 9c5e6186, Kyle's instruction) |
| 3 | P1 — one standings shape | — | M | **DONE 2026-08-24** — 6546e63b..4df4b9cc, final review "merge as-is" — **merged to main 2026-08-24** (ff to 4df4b9cc) |
| 4 | P2 — blob version discipline | R-DM-8 (a) | M | **DONE 2026-08-25** — 93f41250..0098ee46 (incl. final-review fix wave f673ea2e + Dockerfile source COPY 0098ee46) — **merged to main 2026-08-25** (ff to 0098ee46) |
| 5 | P4 — people→competition key | R-DM-2 (a) | L | **DONE 2026-08-25** — `3bf049f7`..`7cf58d71` (incl. final-review fix wave `62ccbcab`+`7cf58d71`), final review "Ready to merge: Yes" — **merged to main 2026-08-25** (ff to `7cf58d71`, Kyle's standing instruction) |
| 6 | P5 — pair survives intake | R-DM-4 (a) | L | pending — blocked by P2 |
| 7 | P6 — bracket person key demotion | R-DM-7 (a) | M | pending — blocked by P4 |
| 8 | P7 — Event key + Meet Event | R-DM-5/10/11 | L | pending — blocked by P0; program-scale |
| 9 | P9 — cosmetic sweep | — | S | pending — anytime after P0 |
| 10 | P8 — PlayerProfile full v1 | R-DM-3 (c) | M | **BLOCKED — owner must supply the R15 text** |
| 11 | Meet-roster extraction (R-DM-2 (c), ratified) | R-DM-2 | L | pending — committed follow-on after P4 |

## Standing constraints (from the rulings — never re-decide)

- 2026-08-23 minting rule untouched; name-alone matching forbidden; merge tool stays a
  ruled deferral (debt-log, "operator merge tool" entry — the log is append-in-the-middle,
  so cite it by title, not line).
- I4 everywhere: flags, never resolutions; never a 409 for a duplicate.
- R2 (no FK on `bracket_event_id`), ADR 0006 (no match merge), ADR 0014 (no renames),
  R7/R13 (no hard contact unique), D7 (scrub, keep rows).
- F-DM-11 trap: any FK lands in `models.py` + migration in the same commit; negative
  controls assert `IntegrityError` (migration-built schema where needed).
- Open question carried: does the operator merge tool ship with or before P8? (Register
  R-DM-3 note.)

## Session log

### 2026-08-24 — Rulings session (SP-DM-2) + plan authored
- Register committed `45b241d2` (`docs/dm1-rulings`).
- Kyle then requested the implementation plan (supersedes the SP-DM-2 STOP). Plan +
  this ledger authored and committed on the same docs branch.
- Kyle ruled: merge everything to `main` before implementation. Done —
  `docs/dm1-rulings` fast-forwarded into `main` (`45b241d2`..`f705669e` + this note) and
  the branch deleted. `main` is ahead of `origin/main`; pushing is Kyle's call.
- **Next session:** branch `dm3/p3-minting-gaps` off `main`, execute the plan's Task 1–4
  (P3) via superpowers:subagent-driven-development or executing-plans. The plan's line
  numbers anchor to `53b650a1`; re-anchor by symbol if the tree has moved.

### 2026-08-24 — P3 slice executed (subagent-driven, opus)
- Branch `dm3/p3-minting-gaps` off `main`: `3aab38fc` advisory + `adopt_or_mint` extraction · `4d72884e` partner adoption via the matcher (+ `birthYear`/`askBirthYear` wire + entrant form field) · `de4eda6c` `blank_clears` keyword so partner adoption preserves club/remarks the accept form never asked (final-review Important, ruled) · `68c27751` `entryPlayerId` on the desk wire · + slice-end bookkeeping commits.
- Gates: `make check` green (1864 passed); deletion gates hold (one `EntryPlayer(` construction site; console carries the key). Final whole-branch review: merge-ready with fixes, fixes landed.
- Deviations from plan, all reviewed: `adopt_or_mint` gained keyword-only `blank_clears` (entry-form blank-means-clear unchanged); `dto.generated.ts` regenerated once at slice end, not per-task; two console test factories touched beyond the file map (tsc-forced).
- Carried to P4's plan: withdrawn-re-entry now raises the new flag (judged correct, pin with a test); `askBirthYear` parity drift (all events vs open events) + no true-branch test — one age-bracketed fixture closes both; the advisory marks only the LATER half of a fork, so the merge tool cannot find both sides from flagged rows alone.
- New debt rows: partner path raises no `needs_review_person` (→P4); gender ignored on adopt (needs ruling).
- Docs-freshness advisory flags Modules + Entrant-tier pages behind this branch (advisory only).
- Merging `dm3/p3-minting-gaps` is Kyle's call. Next slice: P0 (type mechanism) — write its detailed plan at phase start against the then-current tree.

### 2026-08-24 — P0 slice executed (subagent-driven, opus)
- Branch `dm3/p0-type-mechanism` stacked on P3: `626416c7` deletes dead `MatchStateOut` (F-DM-45) · `da254eed` backend freshness oracle (live OpenAPI vs committed `dto.generated.ts`; parser scoped to `export interface components` after a plan parser bug — 177 real schemas, 3 phantoms in the plan's count) · `a0aaa860` console parity oracle + the 19-entry allow-list (all `violation`, F-DM-28a/28b/29; ratchet cap 19, raising it is a ruling) · `7c829019` entrant oracle (35 explicit pairs incl. the two name-collision remaps, 0 divergences, cap unraised) · `b30c38ab` NC2 (F-DM-28a detected-not-silenced) + exclusions re-justified (knip's schema rejects note keys → justification in the test header).
- NC1 evidenced end-to-end: Pydantic field-add → backend RED → `make generate-api` (no hand edit) → console RED `EntryDTO.nc_probe` + entrant RED `MyEntryLine.nc_probe`; fully reverted.
- Ruled deviations: NC2 = detected + allow-listed (the design doc's "red until dropped" would ship a red suite); NC1 = two-link chain (committing the OpenAPI JSON as a third artifact rejected).
- Deletion gates: `MatchStateOut` 0 hits. `dto.generated` resolves to the expected set plus two explained extras — the new freshness pytest (this slice's own third oracle) and `apps/api/BACKEND.md` (pre-existing prose, still on pre-reorg `frontend/` paths) — and the Makefile hit is real but outside the `apps packages tests tools` scan scope. `platform/contracts/__tests__/publicUrlContract.test.ts` is the pre-existing out-of-scope exclusion; untouched, as the plan directs.
- Debt rows added: the three ratchet clusters, the keys-only ceiling (71 optionality), the allow-list tier-discriminator gap, bare-`python` generate-api, the knip `$schema` pin. Closed: "`dto.generated.ts` freshness is on the honour system" — `da254eed` is the gate it asked for.
- Final whole-branch review: merge-ready with fixes; fix wave `4630ec53` landed and re-reviewed clean — 3 new ALIASES (CommandRequestDTO/CommandResponseDTO/ProposedMove had exact wire twins, zero divergences), explicit 7-entry UNPAIRED map + exhaustiveness test (no console shape can go unpoliced by omission), exact pair floor 57, 7 overbroad MatchStateDTO `why` strings corrected (useLiveTracking preserves only postponed+playerConfirmations), zero-empty-schema parser guards both sides.
- Merging: P3 merges first or together (stacked). Next slice: P1 (one standings shape) — write its detailed plan at phase start; note Task 3's hand-shape floor (64, zero headroom) reddens on `dto.ts` deletions and is documented "lower freely"; P1's standings rename will hit the freshness oracle's generated-not-live direction by design.

### 2026-08-24 — P3 + P0 merged to main
- Kyle instructed the merge. `main` fast-forwarded to **`9c5e6186`**, taking both stacked branches with it. `dm3/p1-standings-shape` is now the only unmerged branch. `main` remains ahead of `origin/main`; pushing is still Kyle's call.

### 2026-08-24 — P1 slice executed (subagent-driven, opus)
- Branch `dm3/p1-standings-shape` off the P0 tip. Commit chain:
  - `6546e63b` P1 detailed plan.
  - `d2e182da` **Task 1 — meet/groupId grain.** `compute_meet_standings` returns the wire DTO directly; the local `StandingRow` dataclass is gone and `MeetStandingRowDTO` (kernel, `core/schemas.py`) is the one groupId row. `test_meet_standings.py` changed by type rename only — no assertion, expected value or field name touched.
  - `97dae37e` docstring rider (corrected the kernel-import reach claim).
  - `a94666c6` **Task 2 — bracket/participant grain.** `EventOut.standings` embeds `bracket/standings.py::StandingRow` directly; `StandingRowOut` deleted, so the computation type and the wire type are one dataclass. Regenerated `dto.generated.ts` (schema `StandingRowOut` → `StandingRow`).
  - `eb3b5ea3` **Task 3 — console aliases.** Both console standings shapes became generated aliases (`dto.ts::MeetStandingRowDTO`, `bracketDto.ts::StandingRowDTO`); parity floors lowered, knip justification rewritten against a measurement.
  - `4406cafe` **Task 4a — key-set tests** pinning the public projection (F-DM-30, F-DM-71).
  - `4560797b` **Task 4b — `response_model` on the two untyped public display routes**, via a new `DisplayStateDTO` that *is* the old allow-list tuple, + regen.
  - `ac086c47` Task 5 rider: the `DisplayStateDTO` docstring said five pass-through fields; there are six.
- **Deletion gate: 9 → 4 declarations**, and the four are exactly the plan's table — `bracket/standings.py::StandingRow` (participant, computation *and* wire), `core/schemas.py::MeetStandingRowDTO` (groupId, kernel-resident because `TournamentStateDTO` embeds it), `entries/entries_site.py::StandingRowDTO` (public entrant projection), `apps/entrant/app/lib/draws.types.ts::StandingRowDTO` (entrant hand mirror). **Two deltas from the card's "≤3", both deliberate:** (1) `entries_site.StandingRowDTO` cannot re-export the backend row — same grain, different shape (`participantKey` vs `participant_id`, camelCase counters, an extra `history: List[str]`), so collapsing it would change **public entrant wire keys**, which this plan forbids; (2) the entrant mirror cannot be generated — `dto.generated.ts` lives in the console package and a cross-package import between two separately-built apps is an R-DM-9(c) ruling, now **debt-logged as D23**. Counting backend declarations alone the gate is met exactly: 5 typed + 1 untyped → 3 typed + 0 untyped.
- **Plan miscount, corrected:** Step 1 predicted `payload["standings"]` would be "still one line". It is **two** (`workspaces/tournaments.py`, `display/display.py`) — and was two at base `9c5e6186` too, so this is a plan arithmetic error, not a branch regression. Both flow through a declared `response_model` (`TournamentStateDTO` / `DisplayStateDTO`), which is the property the step was actually checking.
- **NC 1 — performed as two per-tier probes** (recorded P0-style). No single row shape is mirrored by both tiers, so the card's "reddens console **and** entrant parity tests" is not literally reachable: the console's two shapes are now generated aliases, which *cannot* diverge, and the entrant mirrors `entries_site.StandingRowDTO`, which the console does not mirror at all. Six observed outcomes:
  - **Probe A (entrant, parity oracle):** deleted `pointsLost` from `entries_site.StandingRowDTO` + its construction → freshness **RED**: `dto.generated.ts is STALE against the live schema: {'StandingRowDTO': {'live_only': [], 'generated_only': ['pointsLost']}}` → `make generate-api` (mechanical, no hand edit) → entrant parity **RED**: `expected [ Array(1) ] to deeply equal []` / `+ "StandingRowDTO.pointsLost hand-only"` (1 failed | 11 passed) → reverted → 3 passed / 12 passed.
  - **Probe B (console, type gate):** deleted `losses` from `MeetStandingRowDTO` + `meet/standings.py`'s construction → freshness **RED**: `{'MeetStandingRowDTO': {'live_only': [], 'generated_only': ['losses']}}` → regen → `npm --prefix apps/console run build` **RED** with 7 `tsc` errors across three files: `publicDisplay/StandingsView.tsx(64,27)` `TS2339: Property 'losses' does not exist on type '{ groupId: string; groupName: string; matchesPlayed: number; wins: number; }'` plus 6 × `TS2353` in `StandingsView.test.tsx` and `MeetDisplayPage.standings.test.tsx` → reverted all three files → 3 passed / built clean.
  - **The deviation, stated:** an aliased shape reds through `tsc`, not through the parity oracle — that is the alias being **stronger** than parity, not weaker. Parity can only report a divergence; an alias makes divergence unrepresentable and propagates the deletion into every consumer with no hand edit anywhere.
- **NC 2 — the display key-set ratchet bites.** Temporarily added `scheduleVersion: Any` to `DisplayStateDTO` → `test_display_state_key_set_is_exact` **RED** (`assert set(body) == DISPLAY_STATE_KEYS`) *and*, unprompted, `test_projection_is_unauthenticated_and_strips_operator_material` **RED** (`AssertionError: {'scheduleVersion'}`) — the Rule-8 operator-material test caught the same field independently, which is a stronger result than the plan asked for. 2 failed / 13 passed; reverted → 15 passed. F-DM-71 preserved: the allow-list is a declaration with a test behind it, not a tuple with a comment.
- **Allow-list untouched.** `rg -i "standing"` on `dtoParity.allowlist.json` → **0 hits**. P1 closes no allow-listed divergence, so the ratchet cap stays **19** — not raised, nothing to shrink.
- **knip (Task 3 Step 5), observed.** Removing the `dto.generated.ts` ignore moved `Unused exported types` 28 → 32, adding exactly `paths`, `webhooks`, `$defs`, `operations` — the four whole-file exports `openapi-typescript` emits that nobody imports. What did **not** appear is the point: the file is no longer listed under `Unused files`, because it now has two type-only importers. The old *"no importer BY DESIGN"* justification is factually dead; the ignore was restored and its justification rewritten in the test-file header to state the measured reason (knip's schema rejects unknown keys, so the note cannot live in the JSON).
- **Gates:** `make check` **green across both tiers** — import-linter `15 kept, 0 broken`, pytest `1870 passed, 66 skipped` (12m56s), zero `FAILED`/`ERROR` anywhere in the log. Deletion gate 4/4. Freshness 3 passed. `test_display_public.py` 15 passed. Allow-list cap holds at 19.
- **New debt rows:** `DisplayStateDTO`'s six `Any` pass-through fields (key set declared, member types not — close one field at a time behind **P2's** blob versioning, each with its own key-set test); **D23** the entrant standings mirror, which needs generated types readable from both tiers (`packages/shared-contract/` is the candidate and P2 touches it) — the sibling question to D21, and they should be answered together. Plus a *Recorded deliberately* note: `StandingRow`'s counters are optional in the OpenAPI schema (dataclass defaults) but render **required-with-`@default`** in TS and are always emitted, so no consumer needs a `Required<>` wrapper — an earlier plan draft assumed one would be needed.
- Merging `dm3/p1-standings-shape` is Kyle's call; it now branches off `main` directly (P3+P0 already merged), so it merges alone. **Next slice: P2 (blob version discipline)** — write its detailed plan at phase start against the then-current tree; it is the named enabler for both new debt rows.

### 2026-08-25 — P2 slice executed (blob version discipline, subagent-driven)
- Branch `dm3/p2-blob-versioning` off `main`: `93f41250` detailed plan · `5121e6b6` mechanism + the 24-column registry · `e816af63` `tournaments.data` wired at the ORM boundary + the four version numbers reconciled (F-DM-39) · `29bcef7b` inventory ratchet · `d478e681` `shared-contract` versioning + workspace package (F-DM-53) · `7841cfd7` display `/state` comment rider (P1 pickup).
- **24 registered, 1 wired — the deliberate split.** `db/blob_version.py::BLOB_VERSIONS` declares all 24 live JSON columns (census re-derived off live SQLAlchemy metadata, key-for-key identical to the P2 plan's table); exactly one, `tournaments.data`, carries a real version today. The other 23 are `None` with a one-line reason each. Six are JSON **lists** with nowhere to put a version key — versioning them *is* reshaping them, which is P4/P5's chartered work; several dict-shaped ones are round-trip-sensitive (`solve_jobs.params` is the pinned determinism input, `workspace_modules.config` carries `tv*` to the console, `bracket_results.score` is a shape ADR 0006 forbids touching here). Stamping all 24 blind would be a behaviour change wearing a mechanism's clothes. **P4, P5 and P7 will find their columns already registered** — widening one means flipping its `None` to an int and declaring the column `VersionedJSON`, and `test_the_tournament_document_is_the_one_wired_column_today` pins the count at one so the widening is deliberate.
- **Deviation from R-DM-8(a)'s literal words — the helper is a TYPE, not a function pair.** The ruling says "one read/write helper per blob column at the repository boundary"; what shipped is a SQLAlchemy `TypeDecorator` (`VersionedJSON`) binding at the **ORM** boundary. That is strictly **tighter**, not looser: it catches the ~20 raw `tournament.data` reads across five domain packages that a repository-level helper would miss, and catches future ones with no discipline required. It cost **zero call-site edits** and **no migration** — `VersionedJSON` compiles to the same DDL as bare `JSON`, so no Alembic revision and no `make generate-api`. The registry entry is the per-column declaration the ruling asks for.
- **The deletion gate was re-scoped, on purpose.** The design doc's literal gate (`rg '\.data\["|json\.loads\('` → nothing outside helpers) is **unreachable under this design and was not run**: with the guard firing at attribute load, a raw `row.data[...]` read is *correct*. What was run instead measures what P2 built — the inventory ratchet green (3 passed), exactly **one** `CURRENT_TOURNAMENT_SCHEMA_VERSION` definition in `apps/api/src` (`db/blob_version.py`; two literals is how the mirror column and the blob key drift apart), and **0** `../../../../../packages` level-counting imports left in `apps/console/src` (F-DM-53's live half closed).
- **NC 2 probe — the ratchet was proved, then reverted.** A temporary `probe_blob` JSON column on `Tournament` reddened `test_every_json_column_is_registered` naming the offender and both legal answers: `New JSON column(s) with no entry in db.blob_version.BLOB_VERSIONS: ['tournaments.probe_blob']`. Reverted via `git checkout --`; re-run 3 passed, no residue. Note the `isinstance(col.type, (JSON, VersionedJSON))` tuple is load-bearing — a `TypeDecorator` is not a `JSON` subclass, so a `JSON`-only filter would have stopped seeing the one wired column the moment it was wired, and the ratchet would pass while measuring nothing.
- **Task 4 took the WORKSPACE PACKAGE route.** `packages/shared-contract/` is now a real npm workspace package (`@scheduler/shared-contract`) holding a versioned `{$schema, version, keys}` document with a sibling draft-07 schema; the console imports it by package name. The plan's **vitest alias fallback was not used** and `tsconfig.app.json` was **not** touched (`resolveJsonModule` proved unnecessary — `tsc -b` passed as-is). The `package-lock.json` diff reads as a rewrite in `--stat` (1053+/1043-) but is npm re-ordering: the semantic delta is two new workspace entries plus the console devDep, verified by parsing both sides. Key order and contents of the 15-key exemption list are unchanged, machine-checked.
- **Two implementer-found traps, worth knowing before P4/P5/P7 wire more columns.** (a) **The undashed-UUID `text()` plant** — `Tournament.id` is SQLAlchemy `Uuid`, which stores 32-char undashed hex on SQLite, so a `str(row.id)` bind matches **zero rows** and a future-version plant is a silent no-op (proved: `dashed rowcount 0 / hex rowcount 1`). Bind `row.id.hex`. `text()` itself is required — a typed `update()` would be re-stamped by the bind processor and the plant would test nothing. (b) **`BlobVersionError` class identity** — `tests/backend/_helpers.py::purge_backend_modules` deletes every `db.*` module from `sys.modules`, so a re-import builds a *new* exception class while the `VersionedJSON` instance bound at model-import time still raises the old one, and `pytest.raises` stops matching. Fixed at the shared choke point: one line in `_PURGE_EXEMPT` (`"db.blob_version"`), which also keeps `isinstance` stable for the inventory test. Both fail in a way that looks like "the mechanism is broken" and is not.
- **Carried as known limits, not fixed:** `tournament_backups.snapshot` is the live hole — a snapshot written by a future build restores through `upsert_data`, which re-stamps it at the current version, so it restores silently instead of raising. The guard is read-time, not query-time: one poisoned row fails a whole list response (ruled fatal-by-design, but that is the blast radius). All evidence is SQLite; Postgres was not exercised (`VersionedJSON` compiles through `impl = JSON`, so the gap is low but non-zero). Stale prose describing the contract file as a bare array may remain in `tournamentStore.ts`, `workspaces/tournaments.py`, `docs/explanation/architecture/unified-configuration.md`, `docs/reference/repo-layout.md`, `README.md` and `CLAUDE.md` — none was read or touched.
- **debt-log L1 carried forward, not closed:** versioning `tournaments.data` makes a future PII scrub *safe to roll out* (a scrubbing build can refuse a document it does not understand) but reaches no PII itself; the retention job still stops at the table columns. **D23** gained its mechanism half — `packages/shared-contract/` is now a real package with a versioned document; what remains is the R-DM-9(c) decision about putting types in it.
- **Gates:** `make check` **green across both tiers** — pytest `1883 passed, 66 skipped` (11m23s), zero `FAILED`/`ERROR`. The only non-zero line is the advisory `docs:freshness` step (`Error 1 (ignored)`, which the Makefile marks *"never fails the gate"*), reporting three BEHIND areas — one of them *State management*, now naming `d478e681`, which is the stale-prose follow-up recorded above. NC suite `69 passed`.
- **P4, P5 and P7 are now unblocked** (P2 was the named blocker on all three). Merging `dm3/p2-blob-versioning` is Kyle's call. **The next slice is the controller's decision — this entry does not pick one**; note only that P4 and P5 are both L-sized and both reshape blobs this slice deliberately left registered-but-unversioned.

### 2026-08-25 — P4 slice IN FLIGHT (session handoff — **SUPERSEDED**, see the completion entry below)

**State at handoff:** P3, P0, P1, P2 all DONE and **merged to `main`** (Kyle's standing instruction "merge first and proceed"; `main` @ `9f423053` + P2 head, unpushed — pushing stays Kyle's call). **P4 is 5/8 tasks complete** on branch `dm3/p4-person-key` @ `6b5c6f83`, all landed tasks review-clean.

**Resume protocol for the next session (workflow: superpowers:subagent-driven-development, all subagents on opus, tight contexts):**
1. Read the SDD ledger FIRST: `.superpowers/sdd/2026-08-25-sp-dm-3-p4-person-key/progress.md` — it holds the rulings, deferred minors, per-task completion lines, and a RESUME POINT naming the exact next dispatch.
2. Plan: `docs/history/superpowers/plans/2026-08-25-sp-dm-3-p4-person-key.md` (committed on the branch). Briefs for tasks 6-7 already extracted in the SDD workspace.
3. Next action: **dispatch the Task 5 reviewer** — the review package `review-e911fe70..6b5c6f83.diff` is already written in the SDD workspace. Then the T6+T7 batch (entry-{uuid} collapse + the two P3 carry-forward pickups), then T8 (gates + this ledger + debt-log), final whole-branch review (MERGE_BASE `9f423053`), one fix wave, merge to `main`, delete workspace.
4. After P4: next ruled slice is **P5 (pair survives intake)** — author its detailed plan at phase start against the then-current tree (P2's registry has its columns waiting; P5 is NOT pulled forward per R-DM-4.x, and its area has the thinnest test cover — characterization first).

**P4 commits so far:** `3bf049f7` plan · `0a5f40e9` T1 characterization pins (3 written + crash-window cited) · `b9287e5c` T2 R13 FKs reach models + constraint drift test (zero sweep breakage, structural reasons recorded) · `f56d1a41` T3 migration `y9e4f0a2b7c8` (entry_player_id composite FK CASCADE + match_states composite FK CASCADE + orphan sweep) **including the ratified live-code fix**: three write paths in `operations/match_state_routes.py` wrote the state row before its parent match — reordered parent-first (reviewer confirmed: pair was never atomic, residue flips illegal→legal, fix set proven closed) · `b1c6bb2d` T3 fix round (NC asserts BOTH bracket_participants FKs survive the batch rebuild) · `e911fe70` T4 key survives commit/hydrate/generate/regenerate (F-DM-09 generation half fixed) · `6b5c6f83` T5 wire (ParticipantOut/In + both roster blob DTOs + regen + console reconcile + `_participant_persist_fields` helper + 3 review riders).

**Known items for T8's ledger/debt-log (accumulating in the SDD ledger):** the 412-on-naive-retry error-path delta from the match_state reorder; drift test can't compare `ondelete` + covers ENTRIES_TABLES only; `ParticipantIn` has no `meta` so one `getattr` spread is dead; fabricated `entryPlayerId` on upsert = deliberate 500; BLOB_VERSIONS re-attribution (side_a/side_b/dependencies → P6); D22 gender-on-adopt still needs an owner ruling.

### 2026-08-25 — P4 slice executed (people→competition key, subagent-driven, opus)

Branch `dm3/p4-person-key` off `main` @ `9f423053`. Eight tasks, each implementer+reviewer
dispatched separately; SDD working ledger (rulings, per-task lines, deferred minors) at
`.superpowers/sdd/2026-08-25-sp-dm-3-p4-person-key/progress.md`.

**Commit chain.** `3bf049f7` detailed plan · `0a5f40e9` **T1** characterization pins (3 written,
crash-window cited — already covered at `test_entries_commit_seam.py:499`) · `b9287e5c` **T2**
the two R13 FKs reach `models.py` + a constraint-comparing drift test · `f56d1a41` **T3**
migration `y9e4f0a2b7c8` (`entry_player_id` composite FK CASCADE + `match_states` composite FK
CASCADE + orphan sweep) **including the ratified live-code fix** — three write paths in
`operations/match_state_routes.py` wrote the state row before its parent match, reordered
parent-first · `b1c6bb2d` T3 fix round (NC asserts BOTH `bracket_participants` FKs survive the
batch rebuild) · `e911fe70` **T4** the key survives commit / hydrate / generate / regenerate
(F-DM-09 generation half) · `6b5c6f83` **T5** the wire (`ParticipantOut`/`ParticipantIn`, both
roster blob DTOs, regen, console reconcile, `_participant_persist_fields` helper, 3 riders) ·
`aca891b8` mid-slice handoff docs · `7b35ea99` + `5e6c247a` **T6** the `entry-{uuid}` collapse
behind `roster_id()` + a hardened source-reading gate · `26bc989b` **T7** the two P3
carry-forward pickups · `63df5891` T5-ruled console rider (manual roster assignment carries the
key) · `d2bcc615` T7-ruled console rider (the participant picker carries the key **to the wire**)
· `e2be7119` **T8** the `BLOB_VERSIONS` re-attribution · `57af7abf` this ledger + debt-log ·
`62ccbcab` T8 fix round (D22 annotated at the row; DoublesPicker `initialIds` debt row) ·
`7cf58d71` final-review fix wave (`slot_a`/`slot_b` → P6; blob-vs-column deferral debt-logged,
owner P6, with the backfill-must-key-the-blob-too inheritance note).

**Final whole-branch review (9f423053..62ccbcab): "Ready to merge: Yes", 0 Critical, 0
Important.** The match_state parent-first reorder was the reviewer's main merge-scale target and
held: the three reordered sites are the only `match_states` upsert callers in `apps/api/src`, and
the residue a mid-pair failure leaves (parent row, no state row) was already a legal, representable
state pre-P4. Its two docs-only Minors are the `7cf58d71` fix wave; its deferred-minors triage kept
everything else deferred, flagging the pre-existing DoublesPicker `initialIds` gap as the worst
adjacent defect (debt-logged, not P4's regression). Standing caveat restated: all migration
evidence is SQLite; Postgres untested (the program's known limit since P2).

**Four `entry-{uuid}` derivation sites existed, not three.** The card said three; the planner's
tree pass found a fourth at `entries_me.py:375`, added post-audit. All four now route through one
`roster_id()`. The T8 deletion gate is the proof and it is **one hit** — the helper itself
(`entries/entries.py`), verbatim:

```
apps/api/src/entries/entries.py:    return f"entry-{person_id}"
```

The prose docstring at `entries_site.py:76` was **not** caught by the pattern (it is `entry-` in
running text, not a quoted prefix), so nothing had to be argued around; no prose was edited to
satisfy a grep. The commit-seam source-reading gate that T6 added is narrower than this `rg` — it
counts `"entry-` only, missing a single-quoted concat, and reads three files — recorded as a
minor, not fixed.

**T2 carried no migration, deliberately — F-DM-11 in reverse.** The trap the program guards against
is a FK in `models.py` with no migration. T2 is the mirror case: migration `s3d8f2b5c0e1` **already
declared** both R13 FKs (`entries.entry_player_id`, `submissions.entry_player_id`) and `models.py`
did not, so the fix is models-only and any new Alembic revision would have been a no-op that
re-declares live constraints. The commit message says so. The deeper half — *why the drift lived* —
is closed by making the drift test compare **constraints** rather than columns; its two remaining
ceilings are new debt rows. The full-suite sweep after turning the FKs on broke **zero** tests, for
a structural reason worth keeping: both columns are nullable and SQLite's `MATCH SIMPLE` skips NULL
children, so no fixture with a made-up parent id was ever exercised.

**Behavior change 1 — `match_states` now CASCADEs, and it was characterized first.** Ruling 1:
RESTRICT was not available (it breaks the Meet projection delete), so the composite FK forced
CASCADE. Per the program's own discipline the pre-change orphan behavior was pinned at
**`0a5f40e9`** *before* the schema moved, and T3 Step 5 flipped exactly that pin — a scheduled flip
citing its own characterization SHA, not drift. NC 3 is the standing guard: a blob-removed match id
still deletes its `matches` row, and now takes its state row with it.

**Behavior change 2 — the `match_state_routes` parent-first reorder, with an error-path delta.**
The new FK exposed three live write paths that inserted a `match_states` row before its parent
`matches` row. Reordering parent-first is the minimal correct fix; the reviewer confirmed it
introduces no new commit boundary (the pair was never atomic) and that the residue it can leave
flips from **illegal to legal**. The delta that is genuinely new and is recorded here rather than
fixed: the parent write now bumps the version **before** the child write, so a mid-pair failure
leaves a **bumped ETag** and a naive same-ETag retry now **412s**. It is recoverable by re-GET, and
it is a failure-mode ordering change on the live Run surface, which is why it is in the ledger.

**Behavior change 3 — `askBirthYear` is now the entry page's OPEN-events rule** (ruling 6; the page
is the collecting authority, and the P3 carry-forward flagged the drift). **Behavior change 4 —
partner acceptance now raises `needs_review_person`** (`partners.py:239` + `:264`), closing the P3 debt row.

**CASCADE on the participant FK, and the account-deletion grep (judgment call 7).** The composite
`bracket_participants.entry_player_id` FK is `ON DELETE CASCADE`. A first draft of the plan
specified `SET NULL`; review killed it, and the reasoning is recorded because it is *good policy the
schema shape does not permit* — SQLite and portable Postgres apply `SET NULL` to **every**
referencing column, and this composite FK's leading column is the `NOT NULL` primary-key column
`tournament_id`, so the failure would have landed on **tournament deletion**, not on the new
feature. NC 4 is the empirical guard that would have caught it, and it passes. The accepted blast
radius has two halves: teardown (no new loss — the participant dies with its tournament anyway) and
account deletion. The executor STOP condition on the second half was run and **NOT triggered**:
**no live code path deletes `EntrantAccount` rows.** D7 retention *scrubs* the columns and keeps the
row, which is the ruled behavior, so nothing today can reach the cascade from the person side.

**No backfill, no version bump, cap unmoved — all three held.** `entry_player_id` is additive and
nullable; old rows read `null` and P6 needs only the FK, so **no backfill** was taken (ruling 3).
**No `tournaments.data` version bump** (ruling 4): P4 reshaped no blob — it added a real COLUMN, and
the roster shapes that gained a typed `entryPlayerId` live *inside* `tournaments.data`, which P2
already versions, with an optional key older readers ignore. The `MatchStateDTO` allow-list was
untouched and the parity ratchet **cap stayed 19** (ruling 5; F-DM-28b is the state-authority
question, not P4's). T8 corrected the one comment this made owed: `bracket_matches.side_a`/`side_b`
and `dependencies` in `BLOB_VERSIONS` were attributed to P4 and are now **P6**, with the reason
recorded in the `None`-family note (`e2be7119`, comment-only).

**Deviations from the plan, all reviewed:**
- **T3 landed 7 paths, 2 beyond the brief** — the `match_state_routes` reorder and its fixture
  seeding. Ratified in principle mid-task, confirmed by review.
- **T3 fixed 9 fixture reds by seeding real parent rows**, never by dropping a constraint (the plan
  named that as the only acceptable fix and forbade the tempting one).
- **T4's first characterization test landed in the commit-seam file**, not the bracket file — the
  bracket test client mounts no entries router.
- **T5's helper is `_participant_persist_fields(metadata)`, not `(p)`** — two unrelated participant
  types reach it; behavior-equivalent.
- **T7's flag went on the `Entry(...)` construction site**; the brief's line anchor did not exist.
- **Two console riders beyond the plan's file map**, each ruled during its own task's review:
  `63df5891` (manual roster assignment) and `d2bcc615` (the participant picker). Both are the same
  defect class — a synthesis path building a participant row with no `entryPlayerId` for a roster
  player who has one, i.e. a NULL-keyed `bracket_participants` row for somebody the commit seam
  identified. The second rider **required a file the ruling did not name**: `BracketDrawsTab`'s
  `commitPicks` re-derives every participant row from the picks, so a picker-only fix died one hop
  short of the wire — and, worse, re-saving the picker *stripped* keys off participants that already
  had them (the SP-CONSOLE-4 write-echo class). Both singles and doubles synthesis were fixed, not
  only the doubles path the ruling named.
- **T8 corrected three `BLOB_VERSIONS` attributions and left two.** `bracket_matches.slot_a`/`slot_b`
  still read `P4` on the same grounds the corrected three did. The brief enumerated three; rather
  than silently widen a comment-only step past its ruling, they are recorded here — a stale forward
  attribution, XS, and the next phase to touch that file should sweep them.

**Deliberate stances, recorded rather than fixed:**
- A **fabricated `entryPlayerId` on upsert is a deliberate 500** — no preflight validation. Two
  flavors, the same failing-loudly class: `IntegrityError` for a well-formed UUID with no
  `entry_players` row, and `ValueError` from `uuid.UUID(...)` for a malformed non-UUID string.
- The **blob-vs-column double-store is unasserted this slice.** `BracketPlayerDTO.entryPlayerId`
  (inside `tournaments.data`) and `bracket_participants.entry_player_id` (the column) are
  deliberately both written; **no agreement assertion exists**, and P4 did not add one.
- A **doubles team row carries only `members[0]`'s key** — the nominating player's. One row, one
  person key; the partner's key is not represented. This is the shipped shape on both the manual
  assignment path and the picker path.
- **`_echo_shape` keeps `seed`/`members` `None` keys** that the real `toUpsertParticipant` omits, so
  its docstring slightly overclaims. **`_meet_matches`'s parameter shadows the `roster_id` import**
  (loud `TypeError` if ever hit; left in-brief).

**Negative controls — all four green, run as a set** (`136 passed`, with
`test_bracket_event_routes.py` + `test_bracket_repository.py`; NC 4 in fact lives in
`test_person_key_migration.py`, not the bracket file the brief guessed):
NC 1 `test_a_dangling_entry_player_id_is_refused` — `IntegrityError` on **migration-built** schema,
asserting `PRAGMA foreign_keys == 1` first so it cannot pass vacuously, and asserting **both**
`bracket_participants` FKs survive the batch rebuild · NC 2
`test_a_crash_between_the_two_writes_self_heals` — the crash window still adopts, unchanged by the
slice (the re-run *is* the proof) · NC 3
`test_a_match_state_whose_match_is_deleted_goes_with_it` (+ `test_repositories.py:278`) · NC 4
`test_deleting_a_tournament_with_a_person_keyed_participant_still_succeeds` — the cascade-order
control.

**Gates.** `make check` **green across both tiers** — console lint/`tsc -b`/vitest/depcruise,
entrant lint/typecheck/vitest/depcruise, ruff, import-linter **15 kept 0 broken**, pytest
`1896 passed, 66 skipped` (11m32s), console vitest `203 files / 1826 tests`, entrant vitest
`37 files / 760 tests`, console depcruise `16 warnings, 0 errors` (the pre-ratchet
`KNOWN_CROSS_MODULE` set, unchanged), entrant depcruise clean, ruff `All checks passed!`, exit
code **0**. `docs:freshness` is advisory and never fails the gate — it reported three BEHIND
areas (State management, Modules, Entrant tier) and was not acted on. Deletion gate 1 =
one hit (above). Deletion gate 2 (`committed_player_id`) = the writer + the model + two migration
files + the read-only lifecycle/facts/schema consumers — **no new derivation site**; the card's
"writer + migration only" is the *end* state after R-DM-2(c) retires the column, which P4 does not
do. Deletion gate 3 (`entryPlayerId` in the console) = non-zero as expected, plus the two rider
files the brief predates.

**New debt rows:** partner acceptance still skips `gender_flags`/`looks_duplicate` (the two thirds
of the fork P4's namesake fix did not cover — pre-existing) · `ParticipantIn` has no `meta`, so
`POST /bracket` cannot carry `sourceEntryId` and one `getattr` spread is dead on the route ·
the FK drift test cannot compare `ondelete` and covers `ENTRIES_TABLES` only · `bracketDto.ts`
`Participant` lacks `sourceEntryId` (`ParticipantOut` now returns it and no console reader can see
it without a type error). **Closed:** the P3 row "Partner acceptance raises no `needs_review_person`"
— struck, with `26bc989b` cited. **D22 (`gender` on adoption) is still open and P4 did NOT rule it**
— the row says *revisit with P4/P8*; P4 touched the adoption seam but was not given the ruling, so
it stays open for P8 or the owner.

**Next.** **P4 unblocks P6** (bracket person-key demotion — the FK it needed now exists) **and the
two deferred SP-P7 highlight-player items.** The **R-DM-2(c) Meet-roster extraction is now due as
its own program** (row 11 in the slice table) — P4 deliberately did not retire
`entries.committed_player_id`, and the deletion gate above says so. `dm3/p4-person-key` was
**merged to `main` 2026-08-25** (ff to `7cf58d71`, per Kyle's standing merge-and-proceed
instruction; `main` remains ahead of `origin/main` — pushing stays Kyle's call). The ruled next
slice is **P5 (pair survives intake)** — author its detailed plan at phase start against the
then-current tree, and note that P5's area has the **thinnest test cover of any slice, so
characterization comes first**.
