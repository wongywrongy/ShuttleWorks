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
| 5 | P4 — people→competition key | R-DM-2 (a) | L | **DONE 2026-08-25** — `3bf049f7`..`7cf58d71` (incl. final-review fix wave `62ccbcab`+`7cf58d71`), final review "Ready to merge: Yes" — **merged to main 2026-08-25** (ff to the branch tip incl. the closing ledger commits, Kyle's standing instruction) |
| 6 | P5 — pair survives intake | R-DM-4 (a) | L | **Tasks 1–7 DONE 2026-08-25** — `9e81ca68`..this ledger commit on `dm3/p5-pair-intake`, **unmerged**; whole-branch review + merge are Kyle's call. Ships the **Bracket** half only — the Meet half was cut at ratification (see the P5 section) |
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
**merged to `main` 2026-08-25** (fast-forward to the branch tip, per Kyle's standing
merge-and-proceed instruction; `main` remains ahead of `origin/main` — pushing stays Kyle's call). The ruled next
slice is **P5 (pair survives intake)** — author its detailed plan at phase start against the
then-current tree, and note that P5's area has the **thinnest test cover of any slice, so
characterization comes first**.

### 2026-08-25 — P5 slice executed (pair survives intake — **Bracket half only**, subagent-driven, opus)

Branch `dm3/p5-pair-intake` off `main` @ `621325ab`. Seven tasks, each implementer+reviewer
dispatched separately (T4+T5 batched, disjoint file sets); SDD working ledger — rulings,
per-task lines, deviations, deferred minors — at
`.superpowers/sdd/2026-08-25-sp-dm-3-p5-pair-intake/progress.md`.

**Commit chain.** `9e81ca68` detailed plan · `8ded73c5` **T1** characterization pins + fixture
widening (`_entry_event` hardcoded `entry_type="singles"`; `_entry` could not link two entries —
the seam's fixtures could not express a pair at all) · `70b61bf1` **T2** the ruled Step-0 pin
("a `BD` draw opens the SINGLES picker today") · `eca960f8` **T2** the `isDoubles` collapse ·
`439db74d` **T3** the TEAM pre-pass · `3c65bf94` **T3** the self-referential-link guard ·
`0e040c2d` **T3** fix round (`member_ids` → seat ids, the leg-5 test, the dead sort deleted) ·
`7173110b` **T4** the I4 pins · `a2a62095` **T5** the `partnerEntryId` wire · `a814e331`
**T4/T5** fix round (the I4 bracket-path pin) · `5d811d17` **T6** picker seeding + the console
mint collapse · `0eebce39` **T6** fix round (the `members: []` guard) · plus this ledger commit
(`BLOB_VERSIONS` comment correction + debt-log + the design-doc F-DM-08 amendment).

**P5 ships the BRACKET half of "pair survives intake". The Meet half was CUT, at ratification.**
The planner proposed it (judgment call 1) and the controller ratified the cut with an amendment,
on a structural fact verified independently: `_plan_meet` writes `ranks=[event.code]` — `"XD"` —
while the only Meet match generator, `RegenerateMenu.expandRanks`, emits only *numbered* ranks
`XD1..XDn` and filters `(p.ranks ?? []).includes(rank)`. **No committed Meet entry can reach a
generated Meet match at all today**, so a Meet pair field would have had no reader: dead code on
a broken path P7 is chartered to fix. The gap is not merely asserted — it is executable, pinned
by T1's `test_a_committed_meet_entry_cannot_reach_a_generated_match`, so this paragraph's honesty
has a test behind it. **The amendment (owed by T7, done):** the design doc's traceability row for
F-DM-08 said the `RegenerateMenu.tsx` client-side lineup construction "Moves server-side. **P5.**"
It now says **P7**, with the rank-mapping reason. That removes a self-contradiction rather than
reassigning work — the same doc's P7 slice header and R-DM-5's recommendation already give P7
F-DM-08 "in part", and `DM1_RULINGS.md:142` agrees. The P5 slice card's own "`_plan_meet` gets the
analogous side construction" clause is annotated with the same cut.

**The whole TEAM round-trip already worked; only the seam refused** (stale-card §1).
`bracket/brackets.py` was never opened: all three `Participant(...)` constructions already carry
`member_ids`, both persist dicts write it back, and `ParticipantIn`/`ParticipantOut` already
declare `members`. The backend half of P5 is **one file** — `entries/entries.py`. The card read as
though the team shape had to be built; it had to be *emitted*.

**F-DM-13 had SIX answers, not the four the card names — and two of the extras were in one file.**
`meet/exports/xlsxExports.ts` held both a local `isDoublesPrefix()` helper and a separate inline
`prefix.endsWith('D')`. All six now route through one authority per tier,
`lib/doubles.ts::isDoublesCode`, across ten call sites in seven production files — including three
the brief's line list did not enumerate (the deleted helper's two call sites, which would not have
compiled if missed, and `BracketPlayerFields`). Two plan-drift facts, both corroborated at review:
`BracketDrawsTab.tsx` has exactly **one** doubles rule, not the two the plan claimed, and the
prior-art test the brief cited was at a different line.

**Pair-name mints: the design doc's `→ 0` deletion gate is STALE, and P5 moved the count the other
way first.** A `bracket_participants.name` is NOT NULL and **director manual pairing stays by
ruling**, so a mint must exist; the gate is unachievable as written. What P5 did instead: T6
collapsed the console's **two** mints (`ParticipantPicker`, `BracketPlayerFields`) into one shared
`bracketLabels.ts::teamName`, and T3 **added** the backend's first, `entries.py::team_name`. Two
mints today, one per tier, same separator so a draw cannot render two spellings. The honest
deliverable is that nothing has to **decode** a label: a seam-built team's `member_ids` carries the
two roster ids, so membership is *data*. The decode direction (`bracketMigration.ts`'s
split-and-zip plus the render-site splits) is **P6's**, by the design doc's own text, and is
deliberately still present.

**The pair predicate has SEVEN legs, and every failure is a REFUSAL, not a decision.** The seam
builds a `TEAM` only for two entries that are mutually linked, both confirmed, both valid, in the
same draw, neither already committed. Any leg that fails leaves the confirmed half committing as a
**singleton** — nothing dangles, nothing is auto-resolved, and the director's manual pairing path
is what finishes the job. **Legs 6 and 7 exist because a first draft of the plan got them wrong,
and that is worth recording**: the draft argued leg 6 was "satisfied by construction, the loop
already validates every entry" — true, and still wrong, because the nominator is processed first,
so a partner whose payload later fails validation would leave a TEAM naming a roster row that was
never written, unrepairable on re-run since the team id is already in `existing_ids`. The same walk
exposed leg 7 (a hand-added participant for one half would put that human in the draw twice). Two
further strengthenings landed beyond the brief, both pure refusals: leg 5 is a real
`partner.entry_event_id` check (without it, mismatched halves insert one team id into two draws,
`existing_ids` being per bracket event), and legs 6/7 test the **seat id each half would actually
take**. Self-review then found that a self-referential `partner_entry_id` built a one-person
"Ana / Ana" team; guarded in `3c65bf94`.

**A one-directional `partner_entry_id` is detected by refusal + `log.warning` — NOT a new reason
code** (judgment call 3, ratified). `pair_conflict` was deliberately **not** reused: its documented
meaning is a different situation. The state is unreachable today (`accept()` writes both halves in
one transaction), which is why an operator-visible code would be a surface with no producer; the
cost accepted is that if it ever *becomes* reachable, the anomaly is log-only.

**A seam-built TEAM carries `members[0]`'s person key** — the nominating player's (judgment call 2,
ratified; it keeps P4's ruled shape). Both keys remain recoverable from `member_ids` by
construction. The alternative — a per-member key list — needs a column and the migration R-DM-4(a)
declined.

**Behavior change 1 — a confirmed pair now commits as ONE `TEAM` with real `member_ids`.** It used
to commit as two unrelated singletons, re-minted by hand in the console as a name concatenation.
Characterized first: T1's `..._TODAY_commits_as_two_unrelated_singletons` existed only to be
flipped, and T3 Step 1 is that pin inverted. Two invariants held through the change and are stated
because they are easy to break later: `committed_player_id` stays the **per-person** roster id, and
the roster blob still gets **two** rows per pair, one per human, because that is where remarks and
availability live — so `participant_id == roster_id` stops being universally true and is now a
singles-only property.

**Behavior change 2 — the `isDoubles` collapse WIDENS the bracket surfaces to the D-suffix rule, so
a director-defined `BD` draw is now doubles** (judgment call 6, ratified as a named behavior change
— recorded here the way P4's CASCADE was). Three bracket surfaces previously asked a closed
`['MD','WD','XD']` list; they now ask `isDoublesCode`. **The upgrade consequence, stated plainly:**
an existing `BD` draw's already-committed **singles** rows stay singles, while its picker now
renders **doubles**. There is **no migration in scope**. The widening only flips codes that are
D-then-digits, where the old code was already self-contradictory with itself (`isDoubles('MD2')`
was false while `isDoublesRank('MD21')` was true), so the collapse also makes the two rules agree.
`EventsControl`'s `EVENT_CATEGORIES` was checked and is correctly **not** a missed site (display
grouping — a `BD` draw simply renders under its own heading).

**Behavior change 3 — the doubles participant picker now opens SEEDED.** Committing from it used
to **replace** the draw's participant list with only this session's pairs, so an operator with four
teams entered who formed one more and saved ended with **one**. `ParticipantPicker` now forwards a
new `initialPairs`, `DrawDetailPanel` builds it from the event's existing participants instead of
handing the doubles branch a literal `[]`, and `DoublesPicker` seeds from it. Pinned by a T1
characterization pin that T6 flipped. Two consequences the brief did not name, both closed with
tests: a carried singleton's id **is** its player id, so the `unavailable` set needed a
length-aware guard or one save enters the same human twice; and sequence numbering would have
minted a duplicate `XD-T2` once the list opens seeded.

**The I4 ruling — a `pair_conflict` flag does NOT veto an agreed pair.** Surfaced by the T4/T5
implementer and ruled by the controller; recorded at length because it is the subtlest call in the
slice and it is now pinned by a test. In a bracket workspace a `pair_conflict`-flagged entry
**still** pairs into a TEAM, because no leg of the predicate consults `pending_reasons`. That is
correct and is **not** an I4 breach. `pair_conflict` means "the named partner is already spoken
for"; the predicate requires **mutual + both-accepted**, i.e. two humans who actually agreed. In
the surfaced scenario — Alex nominates Sam, Robin also nominates Sam, Sam accepts Alex — the seam
is not choosing between two valid pairs: only one pair exists, and Robin never had Sam's
acceptance. Robin's entry still commits, still carrying its flag, so the operator still sees and
adjudicates it. **Nothing was resolved.** The alternative — refusing the mutually-agreed team
because a third party also nominated Sam — would let a stranger's unilateral nomination **veto** an
agreed pair, which is the bigger I4 problem. Cost if wrong: a flagged workspace auto-forms teams
the owner meant to adjudicate first; mitigated because the flag persists and manual pairing stays.
Pinned by `test_a_pair_conflict_still_only_flags_after_the_seam_builds_teams` and by a
bracket-path twin whose docstring opens "RULED (SP-DM-3 P5)".

**Two brief defects were REFUSED by implementers and the refusals ratified.** Both are recorded
because in each case the executor was right and the instruction was wrong. (1) **T3's brief
specified `member_ids` as `roster_id(person_id)` values, which name non-seats.** A member's actual
`bracketPlayers` row id is `adopted or _player_id(m)`, so under adoption (a legacy `sourceEntryId`
row) the TEAM's `member_ids` would point at nothing — violating the brief's own NC 2 ("no member id
naming a roster row that does not exist"). Ruled: the spec wins, `member_ids` carries the two
**seat** ids in member order; `team_id` **stays** on person ids, because re-run determinism is its
whole promise. (2) **T6's brief specified a `members.length === 2` filter on the picker seed.**
That filter deletes exactly the PLAYER rows the dispatch required preserved — commit replaces the
whole list, so "filtered out" means "deleted", not "left alone". Ruled: carry every row verbatim;
the cost is `PickedPair.members` widening to `string[] | undefined` (debt-logged).

**No migration, no FK, no `BLOB_VERSIONS` flip, no `tournaments.data` version bump, allow-list cap
still 19.** R-DM-4(a) chose the no-table option, so there is no `entry_pairs` table, no backfill
and no re-key. **`bracket_participants.member_ids` stays `None` in the registry**: P5 **FILLED**
it, it did not reshape it — the value is still a bare `list[str]` with nowhere to put a `v` key
without wrapping it and rewriting every reader in `brackets.py`, `local.py`, the engine and the
console. The registry comment was corrected accordingly this task (comment-only; the same move P4
T8 made for `side_a`/`side_b`/`dependencies`), and
`test_the_tournament_document_is_the_one_wired_column_today` is untouched and green.
`partnerEntryId` reaches the desk wire **alone** — no denormalized name or `acceptedAt` (judgment
call 7, ratified) — landing whole across all three mirrors in one commit; the parity ratchet cap
stayed **19**. `partners.is_doubles` **stays where it is** and becomes an authority by import
(judgment call 8 — the laziest thing that works).

**R-DM-4.x's rationale overstates what P2 delivered — flagged, not reopened** (stale-card §6). The
ruling's rationale says P2 would give `member_ids` a versioned home; P2 gave it an enumerated
`None` slot in `BLOB_VERSIONS` instead. The decision itself (option (a), no `entry_pairs` table) is
unaffected and P5 executed it as ruled. The discrepancy is now recorded at the registry line as
well as here, so the next reader of R-DM-4.x is not surprised.

**Deletion gates — three of the five brief patterns are stale as written; no code was edited to
satisfy a grep.** Gate 1, the one that actually states the rule, is clean: `endsWith('D')` →
**one** hit, `lib/doubles.ts::isDoublesCode`, the authority itself. Gate 2 (`['MD', 'WD', 'XD']` →
expected 0) returns **one** hit — `lib/__tests__/doubles.test.ts:11`'s local `CLOSED_LIST` mirror,
a T1 characterization literal, **zero in production**; under a looser grep the two known
out-of-scope non-predicates appear exactly as the brief predicted (`eventColors.ts`'s
`DISCIPLINE_ORDER`, ordering data; `EventsControl.tsx`'s `types: ['MD','WD']`, filter grouping).
Gate 3 (`} / ${`) returns **two**: `bracketLabels.ts::teamName` (the mint) and
`RunSummaryBand.tsx`'s `${done} / ${total}` progress counter — a false positive of the pattern, not
a mint. Gate 4 (`" / "` in `apps/api/src/entries`) **cannot match the code it was written for**:
`team_name` returns an f-string, `f"{name_a} / {name_b}"`, so the pattern finds only a prose
comment; the correct pattern `} / {` over all of `apps/api/src` returns **exactly one** hit, the
mint. Gate 5 (`isDoublesRank`) returns **nine** files, not the "two" the brief guessed — one line
of that is the re-export alias at `positionGrid/helpers.ts:106` and the rest are meet call sites
reaching the single authority through it. The alias is deliberate (it avoids ~15 call-site renames
for zero behavior gain) and it is why a future reader of the design doc's
`rg "isDoublesRank|['MD','WD','XD']"` gate will see a non-zero count that is nonetheless correct:
**the honest gate is gate 1**.

**Negative controls — all four green, run as a set** (`87 passed`, across
`test_entries_commit_seam.py` + `test_partner_invites.py` + `test_entries_desk_routes.py`; the
seven named tests re-selected by name, `7 passed`): NC 1
`test_a_confirmed_pair_commits_as_ONE_team_with_real_member_ids` — the T1 pin inverted · NC 2 the
four refusal tests (half-accepted; partner already committed alone; a half that fails validation =
leg 6; a member already entered by hand = leg 7) · NC 3
`test_a_pair_conflict_still_only_flags_after_the_seam_builds_teams` plus its bracket-path twin ·
NC 4 `test_a_one_directional_partner_link_is_detected_and_no_team_is_built`.

**Gates.** `make check` **green across both tiers**, exit code **0** — console lint (0 errors,
117 warnings, the standing downgraded set) / `tsc -b` / vitest **204 files, 1839 tests** /
depcruise **16 warnings, 0 errors** (the pre-ratchet `KNOWN_CROSS_MODULE` set, unchanged);
entrant lint / typecheck / vitest **37 files, 760 tests** / depcruise **clean**; ruff
`All checks passed!`; import-linter **15 kept, 0 broken**; pytest
**`1911 passed, 66 skipped, 7 warnings in 762.65s (12:42)`**. `docs:freshness` is advisory and
never fails the gate — it reported the same three BEHIND areas P4's run did (State management,
Modules, Entrant tier) and was not acted on. Nothing was red, so nothing had to be argued
pre-existing; no `git stash` was used at any point in this slice.

**Deviations from the plan, all reviewed:**
- **The Meet half was cut** (judgment call 1) — the largest deviation, ratified with the design-doc
  amendment this task carried out.
- **T1's `CLOSED_LIST` pin was tautological**, and the brief specified it verbatim. The real closed
  list was an unexported inline array, so no T1 pin would have reddened when T2 widened the call
  sites. Ruled a **brief defect, not a rework**: it became a T2 *precondition* — a render-level
  "`BD` opens the SINGLES picker" pin (`70b61bf1`) that is red the moment the widening lands, with
  the inversion proven behaviorally (reverting only `DrawDetailPanel.tsx` failed the flipped
  assertion on "Save pairs", not on an import).
- **T2 touched three sites the brief's line list omitted** and corrected two plan-authoring line
  claims (above).
- **T3 wrote seven tests where the dispatch said five**, added two strengthenings and a
  self-referential-link guard beyond the brief, and refused the brief's `member_ids` formula.
- **T3 process gap, disclosed and judged sufficient at review:** the T1 pin was **replaced** at
  Step 1 rather than run red first, so the flip's RED evidence is the new test failing `2 == 1`
  rather than the old pin reddening.
- **T4's test signature was adapted** to `(client, workspace)` — the brief's `(client, world,
  mailbox)` belongs to a different file; name and docstring kept verbatim. Its no-TEAM assertion is
  a **backstop only** (that file's fixture is a MEET workspace, where `_plan_meet` has no TEAM
  shape), which is exactly why the I4 ruling needed the bracket-path pin added in the fix round —
  induced RED with a temporary eighth predicate leg, probe reverted, no residue in the diff.
- **T5 edited two console fixture builders in the same commit as the DTO** — `EntryDTO`'s hand
  mirror is a required `string | null`, so splitting them would have reddened the type gate.
- **T6 refused the brief's `=== 2` filter** (ratified, above) and added a **new `initialPairs`
  prop** rather than forwarding `initialIds`, because a doubles seed carries *team* ids while the
  picker's list and `unavailable` set are keyed on *player* ids.
- **T7 (this task) added a step the brief does not contain** — the controller's F-DM-08 design-doc
  amendment — and extended the brief's commit path list to include the design doc, which the brief
  predates.

**Deferred minors, rolled up:** T1's `expandRanks` pin mirrors the generator's rule in a **local
literal**, so a P7 generator-side fix leaves it green while its docstring goes false (also in the
P7 handoff below) · `_pair`'s docstring describes a member ordering the seam does not yet have ·
`doubles.test.ts` lives under `src/lib/__tests__` but tests nothing in `src/lib` (brief-mandated
placement) · a leftover function-local `timedelta` import now duplicated by the module-level one
(boy-scout when next touched) · only **1 of the 3** widened bracket surfaces has a render-level
pin; the other two are covered transitively by the authority's unit test · the backend `isDoubles`
source gate is non-recursive (`src.glob`) and matches only `== "doubles"` · T3's leg 3 has no test
(unreachable via `accept()`) · no TEAM re-run **idempotency** pin (holds by construction —
deterministic `team_id` + dedupe on `insert["id"]`; the re-run path was traced at review) · legs
4/5/7 were never mutation-checked (only the self-referential guard was, by temporary reversion) ·
T4's test name slightly overclaims what its fixture can prove, commented inline · T6's
`initialPairs` is a required prop passed `[]` in singles mode · pre-existing `act(...)` stderr in
`BracketDrawsTab.test.tsx` · the repo-wide `StarletteDeprecationWarning`, pre-existing.

**New debt rows:** a committed Meet entry can never reach a generated Meet match (**P7**, with the
local-mirror caveat on its pin) · the commit seam recognises "already in this draw" by
**participant id only**, so a picker row under an arbitrary id naming the same person is invisible
to leg 7 — the same blind spot today's singleton dedupe has, disclosed rather than closed because
narrowing it means matching on the person key, which is P6's · the doubles picker has **no
remove/unpair affordance**, with the trade-off named: the destructive re-save *was* the unpair
escape hatch, and P5 removed it by fixing the data loss · `commitPicks` emits `members: undefined`
rather than omitting the key (safe today **only** because `JSON.stringify` drops it) ·
`PickedPair.members` widened to `string[] | undefined`, losing the compile-time exactly-two
invariant (`(PickedPair | PickedSingle)[]` keeps it — a follow-up, not a redo). **Extended:** the
`ParticipantIn`-has-no-`meta` row — a seam-built TEAM writes `meta.sourceEntryId` **and**
`meta.partnerSourceEntryId`, so a console echo through the upsert now drops **pair** provenance as
well as entry provenance. **Closed:** the DoublesPicker `initialIds` row — struck, citing
`5d811d17` (+ `0eebce39`), with the removable half named as its residue. **Left with P6:** the
blob-vs-column double-store row, untouched by P5 as ruled at P4's merge. The brief's conditional
sixth row was **not** needed: T3 Step 4's `submitted_at is None` note stayed unexercised (nothing
raised, so the column keeps its ORM default) and produced no edit.

**Standing caveat, restated:** all migration and FK evidence in this program is **SQLite only**;
Postgres is untested. P5 carries **no migration**, so it adds nothing to that debt.

**Next.** **P5 unblocks P6** (the bracket person-key demotion): its NC "two 'Li Wei' in one draw
are two rows" now has both P4's FK and a seam that has stopped minting name-concatenated teams as
identity, and its `bracketMigration.ts` decode deletion is the other half of P5's mint work.
**P7 inherits two things from P5**: F-DM-08's server-route half (now correctly attributed in the
design doc), and the new Meet rank-disconnect debt row — which is worse than the row's headline,
because Meet's intake is disconnected from Meet's generation **twice over**: at the rank level
(`ranks=[event.code]` vs numbered `XD1..XDn`) **and** at the group level (`_plan_meet` writes
`groupId = event.code`, putting every entrant in one "school", while the generator only pairs
*across* groups). `dm3/p5-pair-intake` is **not merged** — the whole-branch review and the merge
are Kyle's call.
