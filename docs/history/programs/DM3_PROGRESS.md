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
| 6 | P5 — pair survives intake | R-DM-4 (a) | L | **DONE 2026-08-25** — `9e81ca68`..branch tip (incl. final-review fix wave `f94c85ce`+`4f049a45`), final review "Ready to merge, with fixes" → fixes landed and re-reviewed clean — **merged to main 2026-08-25** (fast-forward, Kyle's standing instruction). Ships the **Bracket** half only — the Meet half was cut at ratification (see the P5 section) |
| 7 | P6 — bracket person key demotion | R-DM-7 (a) | M | **DONE 2026-08-25** — `637ea8df`..branch tip on `dm3/p6-person-demotion` (six tasks, each reviewed clean after at most one fix round), final whole-branch review **"Ready to merge: Yes", 0 Critical / 0 Important** — **merged to main 2026-08-25** (fast-forward, Kyle's standing merge-and-proceed instruction) |
| 8 | P7 — Event key + Meet Event | R-DM-5/10/11 | L | **P7a DONE 2026-08-26** — `143f3286`..branch tip on `dm3/p7a-constraints` (four tasks; T1 and T3 reviewed clean after one fix round each, T2 clean with zero findings), `make check` green — **not yet merged**. P7 was split into three shippable slices at plan time: **P7a** (four CHECK constraints, the `or "meet"` deletion, a published `eventCode` unrenameable) is done; **P7b** (a Meet Event + the division-level mapping) and **P7c** (server-side Meet lineup + the slot-assignment surface) are **pending** and get their own plans at phase start |
| 9 | P9 — cosmetic sweep | — | S | **DONE 2026-08-25** — `b5f9e298`..branch tip on `dm3/p9-cosmetic-sweep` (four tasks, each reviewed clean; T3 one fix round, T4 two plus the final fix wave), final whole-branch review **"Ready to merge: Yes", 0 Critical / 0 Important** — **merged to main 2026-08-25** (fast-forward, Kyle's standing merge-and-proceed instruction). **Small because the sweep is mostly not sweepable** — 22 cited · 3 already closed · 7 swept · **9 routed out** · 3 refused; see the P9 session-log section |
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
*across* groups).

**Final whole-branch review (`621325ab`..`a767764b`): "Ready to merge, with fixes", 0 Critical.**
It verified the round trip end to end — seam `TEAM` → `ParticipantOut.members` → the picker seed →
`commitPicks` → `ParticipantIn` → the `brackets.py` re-derivation — and found that T3's fix-round
decision to put **seat** ids in `member_ids` is exactly what makes T6's `unavailable` logic
correct, a cross-task dependency neither task-scoped review could see whole. It also re-traced
re-run/re-save idempotency independently and found no colliding-id path (console `XD-T{n}` and seam
`team-{uuid}-{uuid}` are disjoint and inside `Identifier`'s 100). Its one Important was a **plan
defect**: the predicate never named member **distinctness**, so a person holding BOTH halves — a
state reachable from live code, because the accept route deliberately does not check who accepts
(`partner_routes.py:243`) and `adopt_or_mint` then adopts the nominator's own `EntryPlayer` — built
a one-person `"Alex Kim / Alex Kim"` TEAM. Pre-P5 that same corrupt state degraded gracefully to
one PLAYER row via the id dedupe; P5 had upgraded it into exactly the artifact T3's self-reference
guard exists to refuse. Closed in the fix wave by leg 8 (`partner_seat != participant_id`, compared
on **seats** so it survives either half adopting) plus its test; the re-review confirmed no
legitimate pair can be refused, since two different people always resolve to distinct seats. The
wave also split the design doc's mint/decode row (the decode stays P6's; the **mint is permanent**,
two per tier) rather than striking it, corrected two stale P5 claims, and logged the `team_name`
length ceiling (~403 chars writable and readable, but a console re-save 422s the whole participant
list).

`dm3/p5-pair-intake` was **merged to `main` 2026-08-25** (fast-forward, per Kyle's standing
merge-and-proceed instruction; `main` remains ahead of `origin/main` — pushing stays Kyle's call).

### 2026-08-25 — P6 slice executed (the bracket person stops being their name, subagent-driven, opus)

Branch `dm3/p6-person-demotion` off `main` @ `ca15d7d7`. Six tasks, each implementer+reviewer
dispatched separately (Tasks 1-5 reviewed clean, three of them after one fix round; this closing
task's review follows it); SDD working ledger — rulings, per-task lines, deviations, deferred minors —
at `.superpowers/sdd/2026-08-25-sp-dm-3-p6-person-demotion/progress.md`.

**Commit chain.** `637ea8df` detailed plan · `c96ea959` **T1** the characterization pins (NC 1,
NC 2, and the controller's guard pin) · `caf96c22` **T1** fix round (pin placement) · `88c2aefa`
**T2** the decode-from-label deleted · `757ffeff` **T3** the `p.name === p.id` repair deleted ·
`5eb5dbf4` **T3** fix round (a discriminating partial-TEAM fixture; NC 3 narrowed to MINTING) ·
`e4d9bc6c` **T4** the column/blob agreement assertion · `eb0155dd` **T4** fix round (the reverse
mixed case) · `458e42c5` **T5** the seam recognises a person by key · `e1a3ca2b` **T5** the leg-7b
TEAM-path pin · plus this ledger commit (the `BLOB_VERSIONS` owner comments, two docstrings, the
DTO regen, six debt rows and the design-doc gate amendment).

**P6 is a DELETION slice, and the deliverable is what is gone.** Four production files changed
(`bracketMigration.ts`, `BracketTab.tsx`, `DrawView.tsx`, `entries/entries.py`); the console half is
net **negative** (+46/-114, and `bracketMigration.ts` alone is +22/-90). Two name→person decoders are deleted outright: `nameFromSlug` (de-slugging
`p-alexei-sorokin` back into "Alexei Sorokin") and the split-and-zip that recovered a TEAM's members
by cutting its label on `" / "` positionally — F-DM-04 and F-DM-14's read half. `healBracketRosterNames`
is deleted with them: it decided a stored row was corrupt by testing `p.name === p.id` and
**persisted its guess** (F-DM-15), which is identity repair keyed on a name equalling a slug.

**The mint SURVIVES on both tiers, by ruling — this slice demotes the id, it does not remove it.**
R-DM-7(a) chose option (a): keep `bracket_participants.id` and let P4's `entry_player_id` be the
identity for everything that resolves to a person. So there is **no re-key and no migration**, and
`lib/playerSlug.ts` keeps its single caller (`BracketRosterTab.tsx:137`, the hand-add path) — the
ruling accepts the same-name collision for hand-added rows **in writing**, and a pinned test says so
(`BracketRosterTab.test.tsx:148`, "silently discards a second hand-added player with the same name
(ruled residual)"). The demotion was the **design card's** proposal — `…-design.md:168`,
"`lib/playerSlug.ts` stops being an identity mint and becomes at most a URL helper". The **plan
declined it** (judgment call 1: "`playerSlug()` survives, unchanged, as the hand-add id mint. P6
does not demote it"), and that declining was **RATIFIED**: overruling it reopens R-DM-7 itself, and
no URL consumer of a slug exists anywhere in the tree. `entries/entries.py::roster_id` likewise survives as
the backend's one `entry-{uuid}` spelling. What changed is what the id **means**: `BracketPlayerDTO`'s
docstring no longer claims the id is a slug produced by `playerSlug()` — it is a locally-unique row
key whose provenance depends on who made the row, and the identity is `entryPlayerId`.

**Negative controls — all three green, and NC 3 passed BEFORE the deletion it authorises.**
**NC 1** ("two participants named 'Li Wei' in one draw are two rows") is delivered in two halves:
the backend's `test_two_people_with_the_SAME_NAME_are_two_participants_with_two_keys` (T1 Steps 3+4,
and re-verified as T5's control at `test_entries_commit_seam.py:1139`) and the console's ruled-residual
pin above (T1 Step 4). **NC 2** ("renaming a participant changes no id and orphans no match or
result") is `BracketRosterTab.test.tsx:184`, "a rename keeps the id and every reference to it"
(T1 Step 5). **NC 3** is T3 Step 1, the `bracketMigration.test.ts:160` describe, and it is the one
that carries the slice's safety argument: it was run **against the pre-deletion code and passed**,
so removing the repair is evidence-backed rather than asserted. Its title was **narrowed at review**
and that narrowing matters: the property is not "no row is ever self-named" — `bracketMigration.ts`
copies a PLAYER participant's name verbatim, so a snapshot that is *already* self-named still
propagates one. The property proven, and the only one the deletion needs, is **"reconcile never
MINTS a name out of an id."** The input side of the repair is dead, so nothing will newly create a
row that needs healing.

**The D3 citation moved, and the register warning moved with it.** `bracketMigration.ts:8-14` used
to carry it, on `nameFromSlug`'s docstring — "it exists because the alternative shipped the raw slug
into the roster's Player column and the draw picker (defect D3): every name on the Bracket roster of
a doubles-only draw read `alexei-sorokin`". That function is deleted, so the citation now lives at
`bracketMigration.test.ts:144`, on NC 3's doc-comment, restated with the warning intact: **that is
the bracket DEFECT SERIES D3, not debt-log D3 — two registers, same number.** The defect it names is
the reason NC 3 exists at all: removing the repair must not resurrect it.

**Named behavior change — a legacy workspace never reopened since the heal shipped keeps its
slug-style names PERMANENTLY** (recorded here the way P5's `BD` widening and P4's CASCADE were).
`healBracketRosterNames` ran on **every poll**, against a populated roster, and would have fixed
those rows on the next open. It is gone, so retyping the name on the Roster tab is the only
remaining path. **It does not block**: the damage is cosmetic, it is recoverable by rename,
participants are untouched, and the residual is **unmeasurable from the repo** — it is data on
directors' laptops. The safety argument that made the deletion ratifiable is narrow and holds:
the property "reconcile never MINTS a name out of an id" was already true *before* the deletion
(verified by a negative control, not by inspection), so the post-deletion failure mode is **fewer
rows, never wrong names**. Cost if wrong: those operators retype names they would otherwise have had
healed for them.

**The second residual, ruled rather than discovered: a pre-roster-blob doubles-ONLY draw now
migrates to an EMPTY roster.** With the decode gone, a TEAM member no PLAYER participant can name is
**omitted** rather than guessed at — F-DM-19's don't-invent posture. This is safe by structure, and
the structural reason is the correction the controller made to its own first reading: the roster
blob is **not** a derived projection (it is where remarks and availability live, as P5's invariant
says), so "it's cosmetic" would have been the wrong justification. The right one is that the
reconcile effect runs only behind `if (bracketRosterMigrated || bracketPlayers.length > 0) return;`
— **only ever against an EMPTY roster** — so omission declines to *create* a row and can never
destroy one or its operator remarks. T1 added a dedicated pin for exactly that guard, proven RED by
temporarily dropping `&& bracketPlayers.length === 0` (the reconciled roster replaced the seeded row
**and its `notes`**). One fact from the tree sharpened the story: the guard was **not** the whole
effect — the heal pass ran *unguarded* beside it, so "the migration is wholly empty-roster-only" is
a sentence **T3's deletion made true**, not one that was already true.

**T5 LANDED — the commit seam now recognises a person by key, not by participant id.** It was the
plan's cuttable task (judgment call 5) and it was not cut. `entries/entries.py` carries a per-draw
set of `bracket_participants.entry_player_id` values alongside the id set, so a manual or legacy
participant row that itself carries the person key now blocks a duplicate entry that the id-only
dedupe let through. The key is read off the **COLUMN**, never the roster blob — the correct side of
the `_adoptable` divergence below — and a `NULL` column is not a person, so an unkeyed legacy row
blocks nobody and the guard degrades to today's id-only floor rather than crashing. **No refusal was
lost**: legs 1–8 all still fire with their original text, and the one excusal (`already_ours`, which
lets a pair recognise *itself* on a re-run) is provably incapable of landing a row, because it is the
byte-identical expression to the TEAM insert's id and the id-dedupe always catches it. Two brief
deviations were both **anti-weakening** and both ratified: the brief's snippet would have
short-circuited legs 6/7/8 rather than only leg 7b, and the brief's Step-1 idempotency test would
have been a **false green** (a clean second run has no candidates at all, because `_candidates`
filters `committed_player_id IS NULL`) — rebuilt on the crash-recovery shape, where a naive probe
reddens five tests.

**T4 characterized a live defect rather than agreeing with a false premise.** The brief said the
column/blob agreement assertion had no live divergence to find. It has one: `entries.py:741` builds
the roster payload but appends it only `if adopted is None` (`:746-748`), while the participant
insert carries `entry.entry_player_id` **unconditionally** (`:866`) — so `_adoptable`'s
`sourceEntryId` branch produces a keyed column under an unkeyed blob row **on every adoption, today,
with no backfill**. The reviewer's central question was whether an agreement assertion that ships
alongside a live divergence is thereby weakened. It is not: the assertion **reports** the divergence
(column-present/blob-absent is one of three disagreement shapes, each with its own test) rather than
tolerating it, and the characterization test drives the real `commit_entries` over a producible
pre-state. **Ruled: P6 would not hot-patch the seam** — the repair is a write to an *existing* roster
row, which the seam's "never mutates an existing player" invariant does not make, so it is a design
call and repairing it late in this slice without its own plan was the riskier move. The test carries
a signpost — *"If this test reds, read it as FIXED, not broken"* — instructing its own deletion, and
that deletion is the release condition for widening the agreement helper across the suite.

**Deletion gates — THREE of the five brief patterns cannot fire, and nothing was reworded to make
them.** This is the **third** slice in a row to inherit gate text that cannot fire (P5 found four of five
stale, one of them a `" / "` pattern grepped against an f-string), so the design doc's P6 gate line
was amended in place — the same move P5 made at `:160`. Verbatim results: `nameFromSlug`
→ **0, exit 1** — the only gate that fires clean. `split(' / ')` across
`apps/console/src apps/entrant/app packages` → **exactly one**, `DrawView.tsx:995` (the plan said
`:989`; re-anchored by symbol, `membersOf`), the presentation-only split ratified as judgment call 3
— it splits the participant's OWN stored display name purely to line-break a card, persists nothing
and recovers no member id. `p.name === p.id` → **three matches, all deliberate**: the plan-mandated
comment at `BracketTab.tsx:126` recording what was deleted, NC 3's own **negative** assertion
`expect(rows.some((p) => p.name === p.id)).toBe(false)` at `bracketMigration.test.ts:172`, and the
tombstone at `:187`. `healBracketRosterNames` → **three matches, all tombstone comments**. A gate
that a negative control cannot pass is a gate that punishes the evidence, so it was corrected, not
satisfied. `playerSlug` → **eight matches**, of which the **three production sites are exactly the
expected set** (the definition, `BracketRosterTab`'s import, its one call); the other five are this
program's own tests and `lib/README.md`'s table row. The brief's "expect exactly 3" counted
production only. Related correction carried into the design doc: F-DM-14's "five presentation-
direction splits" is **one** — four of the five cited sites are `join(' / ')`, the correct id→name
direction.

**Gates.** `make check` **green across both tiers**, no step errored — console lint (0 errors,
117 warnings, the standing downgraded set) / `tsc -b` / vitest **204 files, 1840 tests** /
depcruise **16 warnings, 0 errors** (the pre-ratchet `KNOWN_CROSS_MODULE` set, unchanged); entrant
lint / typecheck / vitest **37 files, 760 tests** / depcruise **clean**; ruff `All checks passed!`;
import-linter **15 kept, 0 broken**; pytest
**`1923 passed, 66 skipped, 9 warnings in 751.63s (0:12:31)`** — twelve above P5's 1911, which is
T1's, T4's and T5's new seam tests and nothing else. Nothing was red at any point in this task, so
nothing had to be argued pre-existing; **no `git stash` was used anywhere in this slice**. One
disclosure: a comment-only divider line in `blob_version.py` was corrected *after* the gate
launched, so it was re-verified on its own — `ruff check apps/api/src/db/blob_version.py` →
`All checks passed!`, `test_blob_version_inventory.py` → 3 passed, and
`test_the_tournament_document_is_the_one_wired_column_today` → 1 passed.

**Deviations from the plan, all reviewed:**
- **Judgment call 1 was RATIFIED** — `playerSlug()` survives untouched. It is the plan's own
  deviation *from the card*: the card proposed the demotion, the plan declined it, and the
  controller upheld the plan. The design-doc gate was corrected to match rather than the code.
- **The brief was wrong about T3's expected test state, twice.** There were **two** heal describes,
  not one — `bracketMigration.test.ts`'s heal case reddens too, because the heal derives its repair
  map from the now-trimmed reconcile and its fixture is doubles-only. T2 flagged it forward; T3 did
  not mistake the red for a regression.
- **The branch was deliberately RED between T2 and T3** (TDD-shaped: T2 deletes the decode, T3
  deletes the heal that consumed it). Recorded because a mid-slice merge in that window would have
  shipped a broken suite; T3 was mandatory, not cuttable.
- **T2 FLIPPED the zip pin rather than deleting it** (controller override of the brief), and forced
  one verified trim-neutral fixture change: `flattens TEAM members and dedupes by id` needed a
  `p-ben` PLAYER participant, because Ben's name previously came from the zip.
- **T3 edited four comment sentences inside the guard-pin describe** the dispatch said to leave
  untouched. Judged **justified** at review: three were future-tense claims the commit makes false,
  and the fourth vouched for "the name repair that runs after the guard" — a repair that no longer
  exists. Every `+`/`-` inside that describe is a comment line; assertions, fixture and placement
  are provably unchanged.
- **T3's rider 3 was a controller defect, conceded in full.** The mixed-TEAM assertion as first
  written could not fail under the per-member→per-participant regression it claimed to pin, because
  `playerNames` comes only from PLAYER participants and every one is unconditionally emitted — the
  id SET is invariant and only ORDER differs. Rebuilt on a discriminating fixture and proved the
  right way: injecting the regression made the case go RED as the file's only failure.
- **T5 skipped one brief test as strictly weaker than a pre-existing control** and replaced it with
  two better ones (a legacy-NULL crash/refusal test and the leg-7b TEAM-path pin).
- **T5's implementer was terminated mid-finish by a session usage limit**, resumed, and
  **re-verified rather than trusting the pre-interruption run**; its reviewer was told to watch for
  interruption-induced inconsistency and found none.
- **T6 (this task) refused the brief's Step-4 instruction to STRIKE the leg-7 debt row** and
  narrowed it instead, per the later T5 review finding; and refused the brief's Step-5 verbatim
  amendment text, which would have written two *more* unachievable gate clauses into the design doc.

**Deferred minors, rolled up:** T1's Step-6 pin duplicates the pre-existing `returns the SAME array
reference when nothing needs repair` input-for-input (added verbatim anyway — T3's deletion commit
cites its docstring, and T3 deletes the whole describe) · the tombstone comment's EOF placement ·
T4's unused session fixture, and the agreement helper not yet applied suite-wide (gated on the
adoption divergence closing) · T5's `test_a_participant_with_NO_key_never_blocks_an_entry` exercises
only the set-build NULL filter, not the candidate-side `is None` arms (likely unreachable —
`adopt_or_mint` always keys an entry) · the repo-wide `StarletteDeprecationWarning` and the
pre-existing `act(...)` stderr, both untouched.

**Six debt rows touched — four new, one narrowed, one amended.** **Amended:** the blob-vs-column double-store row —
its sentence *"Today that cannot happen (no backfill ⇒ no keyed column under an unkeyed blob row)"*
is **empirically false** and T4 proved it, so the sentence is struck and the strike is explained in
place; the row's conclusion is unchanged, but its "not reachable yet" premise is gone. The reviewer
called this "the most consequential outcome of the task; do not let it close with the row
unamended." **Narrowed, not struck:** the leg-7 "already in this draw" row — T5 closed the singleton
case and the `members[0]` case, and what remains is that a seam-built TEAM carries only
`member_ids[0]`'s key, so the person guard is blind to the **second** member of an existing team and
a third entry naming `members[1]` is still admitted (not fixable without a second column or keys on
member rows — the migration R-DM-4(a) and R-DM-7(a) both declined). **Added:** every Entries
adoption writes a keyed column under an unkeyed roster-blob row (live, pinned, owner unassigned
pending a ruling) · a person-refusal leaves an **orphan roster-blob row** and `committed_player_id`
points at it rather than at the seated row — the blob append sits *above* the dedupe guard;
pre-existing for the id-based refusal, reachable more often now that T5 added the person arm; not
repaired because re-pointing the back-reference would be a **resolution**, which I4 forbids, and
explicitly flagged so nobody mistakes it for a T4 key disagreement (T4's check iterates
**participants**, so an orphan blob row with no participant is invisible to it and it will **not**
fire) · the pre-roster-blob doubles-only empty-roster residual above · `DrawView.tsx:995` renders a
raw member id as a card line when `nameById` misses (pre-existing, deferred from T3 — the mirror
image of the defect P6 deleted: this one *shows* the id and persists nothing).

**No migration, no FK, no re-key, no slot-blob rewrite, no `BLOB_VERSIONS` flip, no
`tournaments.data` version bump, allow-list cap still 19.** The registry edit this task carried is
**comment-only**: five `bracket_matches` list blobs (`side_a`, `side_b`, `dependencies`, `slot_a`,
`slot_b`) named **P6** as their owner, for a reshape R-DM-7(a) forbids P6 to do. They are now marked
**UNOWNED**, with a paragraph in the `None`-family note saying a reshape needs its own ruling rather
than a phase pickup. Two neighbouring comments were corrected to match rather than left
contradicting it one screen apart: the header note's "P5/P6 work" pointer, and the dict's own
`list-shaped` divider, which said "owned by a later phase" over a group whose other member
(`member_ids`) P5's paragraph already calls unowned.
`test_the_tournament_document_is_the_one_wired_column_today` is untouched and green. The DTO regen
changed **only** the `BracketPlayerDTO` comment block — no field, so `dto.ts` needed no hand
reconcile and the parity allow-list and cap were not touched.

**Standing caveat, restated:** all migration and FK evidence in this program is **SQLite only**;
Postgres is untested. P6 carries **no migration**, so it adds nothing to that debt.

**Next.** **P7** inherits two things that P6 did not touch, both already recorded: F-DM-08's
server-route half (correctly re-attributed to P7 in the design doc at P5's ratification) and P5's
Meet rank-disconnect row — Meet's intake is disconnected from Meet's generation twice over, at the
rank level and at the group level. P7 is **program-scale and R-DM-5-gated**; do not start it without
reading this note. Two of P6's new rows also want a ruling before anyone builds on them: the
adoption-path divergence and the orphan roster-blob row are both **unassigned on purpose** — they
need a decision, not a phase.

**Final whole-branch review (`ca15d7d7`..`c250dbac`): "Ready to merge: Yes", 0 Critical, 0
Important.** The reviewer re-ran all five deletion gates independently rather than relaying the
task reports, and confirmed the two deletions **compose** into a stronger invariant than either
alone: with the heal gone the migration effect is wholly empty-roster-only, so the trimmed
reconcile can only ever decline to CREATE a row against an empty roster — it can never destroy a
row, its remarks, or its availability. It also verified the `already_ours` excusal is provably
incapable of landing a row (it is the byte-identical expression to the TEAM insert's id, so the
id-dedupe always catches it) and that leg 7b plus the singleton key-dedupe are new **conjuncts**,
which can only turn more inserts into refusals, never fewer. The two deliberately-unowned defects
were re-verified code-true line by line. Its three Minors are all comment-wording; the only one
worth carrying is that the guard pin's preamble still narrates a placement relative to a describe
that no longer exists above it — fold that into whichever slice next touches
`BracketTab.test.tsx`. **Release condition already encoded:** when the adoption-divergence ruling
lands, delete `test_adopting_a_legacy_roster_row_keys_the_column_and_not_the_blob` and widen
`_person_key_disagreements` suite-wide **in the same pass** — the test's own signpost says so.

`dm3/p6-person-demotion` was **merged to `main` 2026-08-25** (fast-forward, per Kyle's standing
merge-and-proceed instruction; `main` remains ahead of `origin/main` — pushing stays Kyle's call).

### 2026-08-25 — P9 slice executed (cosmetic sweep — and the sweep is mostly NOT SWEEPABLE, subagent-driven, opus)

Branch `dm3/p9-cosmetic-sweep` off `main` @ `b86162e2`. Four tasks, each implementer+reviewer
dispatched separately (T1 and T2 reviewed clean first pass, T3 clean after one fix round; this
closing task's review follows it); SDD working ledger — rulings, per-task lines, deviations,
deferred minors — at `.superpowers/sdd/2026-08-25-sp-dm-3-p9-cosmetic-sweep/progress.md`.

**Commit chain.** `b5f9e298` detailed plan (538 lines, four tasks, all S) · `698f7d91` **T1** the
dead `MatchScore` twin deleted, `row_to_dto` stops lying about privacy · `a0be2118` **T2** one
match-status union declaration, bracket `EventDTO` exported · `bab61b07` **T3** the pre-reorg
citations repointed and the unions the emitters already close · `187b3dd9` **T3** fix round (the
last two F-DM-60 members; the my-entries test helpers typed) · plus this ledger commit (the nine
routed-out debt rows, the new F-DM-78 row, and the three refused no-ops).

**THE HEADLINE — P9 is small because the sweep is mostly NOT SWEEPABLE.** Of the **22** cited
findings — the `F-DM-43..61` remainder (19) plus `F-DM-21/25/42` (3) — **3 were already closed**
by earlier slices, **7 were live and genuinely cosmetic** (swept, T1–T3), **9 were live but NOT
cosmetic** (routed out to the debt log, each with a destination), and **3 were refused as no-ops**.
3 + 7 + 9 + 3 = 22. **"Cosmetic" banded the SYMPTOM, not the fix.** Nine of these findings read as
a type tidy or a rename and every one of them carries behavior, schema or public-wire risk behind
it. That triage is the most useful thing this slice produced and it is **not a footnote**: a
cosmetic sweep that quietly changed behavior would have been the worst outcome available, and
silence about the nine would have been the second-worst. The routing — not the seven edits — is
this slice's deliverable.

**The three already closed.** F-DM-45 by **P0** (`MatchStateOut` → 0 hits in `apps/api/src`);
F-DM-53 by **P2** (`packages/shared-contract/` is now a versioned `{$schema, version, keys}`
workspace package the console imports by package name); and **F-DM-49 closed BY MECHANISM, not
renamed — RATIFIED**: R-DM-9 names F-DM-49 under "Resolves", and `dtoParity.test.ts` declares the
`EntryDTO ↔ EntryDeskRowDTO` alias with a test holding it. A finding closed by a mechanism someone
else shipped is closed; re-doing it as a rename would have been work that unpicked a ruling.

**The seven swept.** *T1 (backend).* **F-DM-43** was re-anchored from the audit's "two divergent
declarations" to a **deletion**: `core/schemas.py::MatchScore` is dead tree-wide — proved **three
ways** (grep, no wildcard `core.schemas` import anywhere, and an empty `make generate-api` diff) —
so the validation reconciliation the audit implies (`ge=0, le=99` vs unbounded) would have been
*behavioral* and was never needed. That re-anchoring is what moved the finding from behavioral to
cosmetic. **F-DM-54**: `_row_to_dto`'s leading underscore claimed a privacy that three other
modules already ignored; swept at the definition across four modules, and the audit's "display's
one import" undercounted — the fix touches **six** sites, ratified. *T2 (console).* **F-DM-46**,
the four-member match-status union: the audit counted **three** declarations and the tree returned
**eight**. **F-DM-48**: `bracketDto.ts::EventDTO` exported so the one remaining structural alias
can name it (already down from the audit's four consumers to one). *T3 (entrant).* **F-DM-59**
(8 stale pre-SP-REORG-1 citations repointed — the audit said 14), **F-DM-60** (all three
vocabulary unions closed) and **F-DM-61**. **F-DM-61 is the union half ONLY** — the 3-copy label
dedup remains **D23**'s cross-package-types question, so DONE does not overclaim it.

**The nine routed out** are now debt rows under *"Routed out of SP-DM-3 P9's cosmetic sweep"*
(the log is append-in-the-middle — cite by title, never by line). In brief, with the reason each
one is not cosmetic: **F-DM-21** — a source discriminator on `Match.playerIds` changes what the
D20 double-booking guard *sees*; needs a slice with a caught-collision negative control.
**F-DM-25** — four workspace key kinds with no mapping layer; the fix is a layer or a reference
page, and it sits against ADR 0014's fence → P7 or an owner ruling. **F-DM-42** — routed out
**despite the card naming it**, because a public-tier type rename crosses a shipped browser module
and the P0 parity pair map; **the card's banding was wrong**. **F-DM-47** — **blocked on a
direction ruling**: its only fix makes `api/dto.ts` (whose sole import today is `./dto.generated`)
name a `platform/domain` type, the first non-generated import in the hand mirror. **F-DM-50** —
the **write side** of P0's charter; R-DM-9's oracle covers responses only, so 11 request shapes
local to `api/client.ts` are unpoliced. **F-DM-51** — collapsing the three `entry_pages` views
changes public entrant wire keys, which **P1 established this program will not do**. **F-DM-55** —
see the ruling below. **F-DM-56** — three FK-less operator-identity pointers; a schema change with
F-DM-11 binding and an `ondelete` decision inside it → P7's F-DM-37 constraint work. **F-DM-57** —
**already owned by R-DM-11, which names it under "Resolves"; P7 carries it. Recorded as routed,
NOT as new debt, and P9 was instructed not to touch it** — removing `drawKey` would drop a public
entrant wire key.

**The one real decision: the `match_states` `String`→`DateTime` migration is OUT — RATIFIED.**
Those strings reach the **public** capability-token wire (`operations/match_state_routes.py` reads
`row.called_at` into `MatchStateDTO.calledAt`, a string field, and `display/display.py` re-serves
that DTO on `GET /display/{token}/match-states`), the roundtrip is **test-pinned**
(`test_called_at_and_original_slot_court_roundtrip`), and `MatchStateDTO` is a
`StrictIgnoringModel` *specifically* so it doubles as the import shape for match-state files older
builds wrote — it must keep accepting their timestamp strings. Every migration this program shipped
was **SQLite-verified only**, and a column type change is the single worst place to first meet
Postgres, which enforces the type on every existing row at `ALTER`. It is also a **schema** change
inside a slice chartered as cosmetics. The harm the finding names is **latent, not shipped**: no
query in the tree compares those columns in SQL today. **Cost if overruled**, stated concretely: it
becomes its **own M-sized slice-let with its own plan** — F-DM-11's same-commit rule, a negative
control against migration-built schema, and a Postgres run — and it would change a test the working
practices say to **flag rather than edit**. Never folded into a cosmetic commit stack.

**Three refused as no-ops — F-DM-44, F-DM-52, F-DM-58 — RATIFIED, and this is the right instinct.**
The common reason is the whole ruling: **each is already explained *in situ*, so "de-duplicating"
it deletes a rationale, not a duplication. A comment explaining why something looks duplicated is
not duplication.** F-DM-44's meet/bracket score split names ADR 0006 at the declaration and its
`Assignment`×4 spans `scheduler_core`, which the import contracts keep pure; F-DM-52's two
`entryPlayerId` rationales were made **different** by P4 on purpose (the bracket half explains why
the key is stored twice), so a mixin would flatten per-shape rationale and rename an OpenAPI schema;
F-DM-58's `lib/names.ts` already carries a `ponytail:` comment naming the exact ceiling and its
upgrade path, which is roster/P8 work — the comment **is** the finding. All three are recorded under
*Recorded deliberately* in the debt log so nobody re-opens them.

**Both verify-then-decide steps answered CONSTRAINED — checks, not assumptions.** The schema has
**zero** `CheckConstraint`s (F-DM-37), so T3 was told to verify rather than assume. `entry_type` has
exactly ONE write path, fed by `EntryEventCreateDTO.entryType: Literal["singles","doubles"]`, with
no update path. `bracket_events.format` routes every writer through `FormatId`'s `AfterValidator`
against the 6-key `FORMAT_REGISTRY`, applied on all four DTOs including `EventConfigPatchIn` — so
`DrawKind` was introduced. Both closures were **independently re-proven from source at review**
rather than relayed, including the third F-DM-60 member via `_ENTRY_STATE`'s `.get(raw,"awaiting")`
default and `_card_status`'s exactly-four returns. `kindLabel`'s `?? kind` runtime fallback is
confirmed untouched, so an off-registry format tag still renders its raw string exactly as before.

**T3's one-line bound was OVERRUN to three lines and ACCEPTED — the mechanism is worth knowing.**
The controller ruled all three F-DM-60 members into scope including the test file (Step 7's commit
path excluding it was a plan oversight, not a boundary) and bounded the fix at **one line**, with
the reason stated: *"I am not paying 26 test-line edits for a cosmetic finding."* `over:
Partial<MyEntryLine>` alone took 26 errors → 12, and the survivors were **not** the spread: a
literal property in a **mutable object literal** (`status: 'entered'`) widens to `string` on its own,
*before* `over` is considered, and the spread then unions with that — so the **return-type
annotation** is also required, to supply the contextual type that stops the widening. Both are
needed together. Final test-file diff is **3 lines** (two signatures + one `import type`), **zero
test bodies, zero assertions** — an overrun in degree, not in kind, comfortably inside the bound's
stated reason. The implementer **stated the overrun plainly and offered the revert** rather than
proceeding quietly. The bound's second half was checked explicitly: all 13 distinct override keys
enumerated across 313 lines, every one a real interface member with an in-type value, no test
passing an off-union state, and the XSS negative control still typechecks (it sits on plain `string`
fields). **Coverage is strictly BETTER** — `Record<string, unknown>` silently accepted a typo'd key
or a wrong-typed value; `Partial<…>` makes both compile errors. Cost if wrong: `git revert 187b3dd9`.

**T2's gate-comment episode — RATIFIED.** The implementer's first draft of a replacement comment
**quoted the retired expression verbatim**, which tripped their own gate; they removed their own
quotation and flagged it, because the dispatch forbids rewording to satisfy a grep. That handling
is correct: removing a quote you introduced yourself *in the same edit* is not rewording code to
satisfy a gate — the indirection the gate measures was already gone. The offered alternative (keep
the quote, raise gate B's expected count to 1) was **rejected as strictly worse**: a gate whose
expected count is "1, and that 1 is a comment quoting the thing we removed" is **precisely the
unfireable-gate pattern** this program keeps meeting. Cost of the ruling if wrong: a comment one
quotation shorter.

**Deletion gates — all five FIRED, all five verified against the tree by this task, and nothing was
reworded to satisfy one.** Verbatim, re-run at `187b3dd9`: `rg "class MatchScore" apps/api/src` →
**1** (`operations/match_state_routes.py`, the still-live local class), was 2. `rg "_row_to_dto"
apps/ tests/` → **0**, exit 1, was 13. `rg "'scheduled' \| 'called' \| 'started' \| 'finished'"
apps/console/src` → **2** — exactly the intended survivors, `platform/domain/match.ts:26` (the one
declaration) and `api/dto.ts` (the deliberate wire copy) — was 8. `rg
"BracketTournamentDTO\['events'\]" apps/console/src` → **0**, exit 1, was 1. `rg -n "backend/"
apps/entrant/app apps/entrant/public` → **3**, and they are exactly the three named-in-advance
**correct** `tests/backend/unit/…` citations (`formField.ts:16`, `formCsrf.server.ts:35`,
`formCsrf.server.ts:41`), was 11. **On fireability, which is the program's own standard:** the two
absence gates are meaningful precisely because their patterns were measured non-zero at
`b86162e2` (13 and 1), so a 0 is evidence rather than a pattern that never matched; the three
count gates name their expected survivors individually, so none of them is written against an
unreachable 0. The entrant gate's residue was deliberately set at **3, not 0** for that reason — a
gate a correct citation cannot pass is a gate that punishes the evidence.

**A gate that reads GREEN over 63 live instances — new finding F-DM-78, and the id is minted here
because the audit's sequence ends at F-DM-77.** T3 found that the F-DM-59 gate **under-measures**.
It is right about its own residue; the defect is its pattern's **scope**. **63 stale
pre-SP-REORG-1 citations are invisible to it** — measured over the whole tier by the final fix
wave, not relayed: **32** in `app/`+`public/` (25 bare `api/*.py`, 3 `services/*.py`, 3
`frontend/src/…`, 1 `app/form_csrf.py`) and **31** in `tests/` (23, 3, 2 bare `app/config.py`, 2
`backend/app/…`, 1 `services/`). All roots confirmed **nonexistent** (`apps/api/src/api`,
`apps/api/src/app`, `apps/api/src/services`, `frontend/`). **A gate that reads green over 63 live
instances is worse than no gate, because it certifies the opposite of the truth.**

**The row under-measured itself, twice, and that is the finding's real lesson.** Its first figure
was 29 — wrong on **both** axes. Wrong on *directories*: the decomposition covered `app/` and
`public/` but never `tests/`, where one of the misses is the **test-file twin of the very citation
T3 repaired** (`apiFetch.server.test.ts:82` still names `backend/app/error_codes.py` while its
source sibling was repointed), so the sweep fixed one half of a pair and the gate could not see the
other. Wrong on *patterns*: running **all** of them over the widened scope — rather than only the
one the review named, which would have repeated this row's own failure inside the row describing
it — surfaced a **fifth stale root nobody had recorded**, `services/*.py`. **Eight** citations are
excluded with stated reasons rather than dropped, including four stubbed error payloads that
deliberately imitate a leaked server string (`'IntegrityError at /app/api/entries_json.py:214'`)
inside negative controls asserting the leak never reaches the client — repointing those would make
the fixtures *wrong*. S, mechanical — the same repoint T3 Step 1 already did.

**The generalisation, third iteration of the same mistake:** for a citation gate, the default scope
is **every directory the tier owns**, not just its source directories. A gate scoped to `app/`
while `tests/` holds the same rot reads green forever. It pairs with this section's other rule —
both are the same error at different altitudes: **trusting a description of the tree instead of the
tree.**

**The program-level pattern — the FIFTH gate episode across FOUR consecutive slices: a gate
pattern in this program is unreliable until it has been RUN against the tree.** P4, P5 and P6 each
inherited at least one pattern that could never fire (P5 found four of five stale, one of them a
`" / "` pattern grepped against an f-string; P6 found three of five). **This plan's own author
caught three of their own during self-review** and rewrote each against a full, unfiltered listing
rather than trusting the audit or a partial grep: the status union was drafted "3→2" from the
audit's declaration count and actually returns **8**; `_row_to_dto` was drafted **7** from an
`--include=*.py`-limited grep and actually returns **13**; and the entrant `backend/`
decomposition was drafted from **two different greps merged by eye**, which invented a
`session.server.ts` residue that is not in the 11 at all. Then T3 found the F-DM-59 gate
under-measuring. **The rule, written down here so the next plan inherits it: a gate's expected
count must be PRODUCED by running the pattern against the tree, never predicted from the audit —
and no gate may be satisfiable by rewording a comment.**

**And this paragraph proved its own rule at its own expense, which is the cheapest demonstration
available, so it is recorded rather than quietly corrected.** It first read "now FIVE consecutive
**slices**" — but the evidence it cites enumerates **four**: P4, P5, P6 and P9. **Five is the count
of gate EPISODES, four is the count of SLICES**, and the two diverge because P9 alone contributes
two — the three patterns this plan's author caught during their own self-review, and then T3's
under-measuring F-DM-59 gate. The error came from predicting the figure from a dispatch summary
instead of counting the slices the paragraph's own evidence names. Caught at this task's review.
**A meta-count about counts, predicted from a summary instead of produced from the record — the
exact failure the rule names, committed inside the sentence stating the rule.**
The generalisation the program should carry: *"produced, not predicted" applies to the numbers in
the prose as much as to the numbers in a grep*, and a count that arrives via a summary is a
predicted count no matter how authoritative the summariser.

**A plan-defect class T3 found, and it is nastier than a wrong line number.** The brief's path
translation `backend/api/entries.py → apps/api/src/entries/entries.py` was **wrong** — `_SLUG_RE`
lives in `entries_routes.py` — and **because the wrong target exists, the brief's own `ls` check
would have PASSED while installing a fresh stale citation.** Independently confirmed at review.
**A verification step that can confirm a wrong answer is worse than none**, because it converts a
guess into evidence. The generalisation for future briefs: a path check must assert the *symbol* is
there, not merely that the file is.

**Two brief gaps, both closed by the implementer rather than shipped.** T1's Step 5 test list named
**no suite** for `meet/schedule_suggestions.py`, a file the task edits **twice** — the checklist as
written would have shipped it unverified; the implementer ran `test_schedule_suggestions.py`
themselves (16 passed). T3's Step 7 commit path **excluded the test file** the controller then ruled
into scope. Neither is a code defect; both are the same class — a task's verification surface
derived from the audit rather than from the diff the task actually produces.

**Named risks, all three handled, and the handling is the transferable part.** T1's
`match_state_routes.py` had the definition **plus four in-module call sites**; swept via a
file-scoped `replace_all` — *"exhaustive by construction, not by counting"*, which is the right
instinct and the one that survives a miscount. T1's `meet/` imports are **function-scoped** to avoid
a cycle; all three were kept function-scoped with **byte-identical placement** and no hoist
attempted, justified against `schedule_proposals.py:458` as the house pattern. T2's `LegacyStatus`
had five inline copies (`useCommandQueue.ts` ×3, `runModel.ts`, `runMachine.ts`); swept the same
way, with a loose-variant grep and a **permuted-member-order** re-run at review confirming nothing
hid under a different spelling.

**Both console substitutions are IDENTITY substitutions, re-derived at review rather than trusted.**
The union is character-for-character identical in members **and order**; and the reviewer chased the
indexed-access chain themselves — `BracketTournamentDTO['events'][number]` ≡
`TournamentDTO['events'][number]` ≡ `EventDTO[][number]` ≡ `EventDTO`. Nothing narrowed, nothing
widened; the whole T2 diff is type-position and erases at emit. The **partial** status unions in
`trafficLight.ts` and two test files were deliberately left alone — substituting there would
**widen** a type, which is behavioral, not cosmetic.

**Gates.** `make check` **green across both tiers, exit 0** — nothing was red at any point, so
nothing had to be argued pre-existing and **no `git stash` was used anywhere in this slice**.
Console lint **0 errors / 117 warnings** (the standing downgraded set) · `tsc -b` clean · console
vitest **204 files, 1840 tests** · depcruise **16 warnings, 0 errors** (the pre-ratchet
`KNOWN_CROSS_MODULE` set, unchanged); entrant lint clean · typecheck clean · entrant vitest
**37 files, 760 tests** · entrant depcruise **0 violations** (93 modules); ruff
`All checks passed!`; import-linter **15 kept, 0 broken**; pytest
**`1923 passed, 66 skipped, 7 warnings in 758.90s (0:12:38)`**. **The warning count is the one
number that differs from P6's line (7 here, 9 there), and it is race noise, not a change:** three
of the seven are `test_concurrent_requests.py::test_parallel_writes_never_500` SAWarnings whose
text is literally row-count-dependent ("expected to delete 3 row(s); 1 were matched"), so that
suite emits a different number of them per run. Nothing was silenced; the full warnings summary is
in the log and every entry is pre-existing. **Every count that means something is IDENTICAL to
P6's** — console 204/1840, entrant 37/760, pytest 1923 passed / 66 skipped — and that identity is the check worth
making rather than a coincidence worth glossing: **P9 added zero tests on any tier.** T1's
"16 passed" was a suite the implementer *ran* because the brief named none, not tests added; T3's
fix round changed helper **types** only, and its entrant count was identical before and after, so
nothing was skipped into green. The one non-green line in the log is `docs:freshness` reporting
3 areas BEHIND — **advisory by construction** (`Makefile:252`, "never fails the gate",
`Error 1 (ignored)`); it flags docs lagging code and this slice changed code, and its coarse-glob
over-reporting is already its own debt row.

**The slice changed no behavior, verified against `main` rather than asserted.** `git diff main
--stat`: 5 backend files (`-6` in `core/schemas.py`, the rest pure renames), 6 console files (all
type-position), 7 entrant files (comments, three type annotations, one erased `export type`), plus
one test file and the plan document. **Zero** changes under `alembic/`, **zero** in
`dtoParity.allowlist.json`, **zero** `dto.generated.ts` diff — each confirmed by a path-limited
`git diff main --stat`, not by inspection. **One test file appears** and it is the ruled-in-scope
`myEntries.script.test.ts`: 1 `import type` + 2 rewritten helper signatures, **zero test bodies and
zero assertions changed** (Task 1's `_row_to_dto` → `row_to_dto` rename, which the brief anticipated
in tests, turned out to touch **no** test file at all). Nothing in the sweep stopped being cosmetic.

**Deferred minors, rolled up:** T1's brief-dictated docstring phrase "four importers already
ignored" is loose (there are 3 external importing modules + 4 in-module call sites) · T2's
`runModel.ts:29` `as MatchStatus` is a **provably dead cast** (`OpsBlock['status']` is already
`MatchStatus`), left for a brief-literal minimal diff · T3's `sitemapCache.server.ts:34` is now ~99
chars, which no lint gate enforces · the `DrawKind` hand-maintenance-vs-extensible-registry
tradeoff, logged rather than fixed.

**No migration, no schema change, no re-key, no FK, no `BLOB_VERSIONS` flip, no
`tournaments.data` version bump, no DTO regen, no allow-list edit — cap still 19, and the
allow-list's `git diff --stat` against `main` is empty.** The standing caveat needs no addition:
P9 carries no migration, so it adds nothing to the SQLite-only evidence debt. Neither
deliberately-unowned defect (the `_adoptable` adoption-path divergence, the orphan roster-blob row)
is adjacent to any file this slice touched — checked, not assumed.

**Next.** **P7** remains the large one and is untouched here: it inherits F-DM-57 (which P9 was
forbidden to touch), F-DM-25 and F-DM-56 from this slice's routing, on top of what P6 handed it.
It is **program-scale and R-DM-5-gated** — do not start it without reading P6's closing note.
**P8 stays owner-blocked on the R15 text.** Of the nine routed-out rows, three want an **owner
decision** before anyone can build on them (F-DM-55 the migration, F-DM-47 the `dto.ts` direction
ruling, F-DM-25 the key-mapping question) — they are unassigned on purpose, exactly like P6's
adoption-divergence and orphan-row pair.

**Final whole-branch review (`b86162e2`..`e645aaca`): "Ready to merge: Yes", 0 Critical, 0
Important.** It audited the triage arithmetic independently, confirmed every routed-out finding is
verifiably untouched in code (not partially swept), and reproduced all five deletion gates at HEAD.
The merge-level question no task-scoped review could answer — whether a type narrowed on one tier
while another tier can still emit the excluded value — was answered **no**: the narrowed entrant
unions are closed **at their emitters** by code this branch never touched (`_ENTRY_STATE`'s
fail-calm default, `_card_status`'s four returns, the `Literal` write path, the `FormatId`
validator), and `kindLabel`'s `?? kind` runtime fallback survives, so even an off-registry wire
value still renders exactly as before. Zero runtime lines changed on the public entrant tier.
Its three Minors were docs-accuracy; two were taken (F-DM-78's scope, this row's commit range) and
the third — `row_to_dto`'s brief-dictated "four importers" phrasing, defensible as an import-site
count but loose as a module count — stays deferred for whatever next touches that file.

**The strongest single piece of evidence that this slice changed nothing:** `make check` returns
**every count identical to P6's baseline** — pytest 1923 passed / 66 skipped, console vitest 204
files / 1840 tests, entrant 37 / 760, depcruise 16w/0e, import-linter 15 kept / 0 broken. **P9
added zero tests**, which is exactly right for a sweep that is not allowed to change behaviour.

`dm3/p9-cosmetic-sweep` was **merged to `main` 2026-08-25** (fast-forward, per Kyle's standing
merge-and-proceed instruction; `main` remains ahead of `origin/main` — pushing stays Kyle's call).

---

## 2026-08-25 — SESSION HANDOFF (read this first next session)

**Tree state.** `main` @ `f70e8ead`, working tree clean, only `main` + `infra/host-split` exist
locally. **P3, P0, P1, P2, P4, P5, P6 and P9 are all merged.** `main` is **98 commits ahead of
`origin/main` and UNPUSHED**. Every slice branch and SDD workspace was deleted at its merge.

### 1. FIRST ACTION: the push is authorized but NOT cleared

Kyle said **"yes push as long as all core functionality and no loss of functionality or ui."**
Verification began and was **interrupted mid-flight — the push did NOT happen.**

**What was mechanically verified** over the whole session range (`9f423053..f70e8ead`):

| Check | Result |
|---|---|
| Files deleted | **zero** |
| API routes removed (`@router.*` decorators) | **zero** |
| React components removed / `export default function` removed | **zero** |
| User-visible strings removed from JSX | **zero** |
| Entrant route files touched | **zero** — the public tier's routes are untouched |
| Non-test `.tsx` touched | **7**, all in `modules/bracket/` plus `RegenerateMenu.tsx` |
| Exports that vanished from the diff | 6 — of which **5 still exist** (retyped or turned into re-exports: `fromEngineStatus`, `isDoubles`, `isDoublesRank`, `kindLabel`, `BracketEventDTO`) |

**What was NOT verified: `make check` on `main`.** It reached ~11% of the backend suite and was
killed by a session interrupt; the log's only `ERROR` is `The build was canceled`. **It was neither
proven green nor proven red.** The last full green run was P9 Task 4 at `4714200c`, and only docs
commits plus the merge have landed since — but that is an inference, not a run. **Re-run
`make check` on `main` and confirm exit 0 before pushing.**

### 2. The one genuine functionality removal — Kyle's call before pushing

Exactly **one** function was truly deleted this session: **`healBracketRosterNames`** (P6, ruled
*"deleted, not fixed"* by program card §C6). Three consequences are already recorded above and are
the honest answer to "no loss of functionality or ui":

1. **A legacy workspace never reopened since the name-heal shipped keeps its slug-style names
   permanently** — retyping is now the only path. Cosmetic, recoverable, unmeasurable from the repo.
2. **A legacy doubles-only draw migrating fresh shows FEWER roster rows** instead of names guessed
   from a team label. The failure mode moved from *wrong names* to *fewer rows*, deliberately.
3. **P5's D-suffix widening**: a director-defined `BD` draw is now doubles, so its picker renders
   doubles while its already-committed rows stay singles. No migration, by ruling.

None breaks the app; all three passed review as ruled, deliberate changes. **But if Kyle counts any
of them as "loss of functionality", the push should wait for his answer.** Ask before pushing.

### 3. Then: P7 — the only implementation slice left

**Do not start it casually.** The program plan bands it **"L — program-scale"** and says *"Do not
start it inside another program's window."* It wants a `meet_events` table (or a division-keyed
versioned blob section) **plus a real mapping column**, `tournaments.kind` + CHECK as the engine
authority, CheckConstraints on four columns (F-DM-37), a rule making a published `eventCode`
**unrenameable**, and **an operator-side slot-assignment surface that does not exist yet**.

**P7 has an unresolved input.** **F-DM-25** (how many kinds of workspace key there should be) is
routed to *"P7/owner"* and is one of the open rulings below. Starting a program-scale slice on top
of an unanswered scoping question is the thing to avoid — **get F-DM-25 answered first.**

**What P7 inherits, all already recorded:** F-DM-08's server-route half (re-attributed to P7 in the
design doc at P5's ratification); **F-DM-57** (P9 was forbidden to touch it — R-DM-11 owns it);
**F-DM-25** and **F-DM-56** from P9's routing; and P5's finding that **Meet's intake is disconnected
from Meet's generation twice over** — at the rank level (`ranks=[event.code]` vs the generator's
numbered `XD1..XDn`) *and* at the group level (`groupId = event.code` puts every entrant in one
"school" while the generator only ever pairs *across* groups). That second disconnect is why P5's
Meet half was cut: a Meet pair field would have had no reader.

### 4. Six open owner rulings — none blocks a slice, all block building ON them

1. **D22** — gender on adoption. Never ruled. Owner: P8/Kyle.
2. **The adoption-path divergence** — `_adoptable`'s `sourceEntryId` branch produces a keyed
   **column** under an **unkeyed blob row** on *every* adoption. The debt log had claimed this was
   impossible; P6 proved otherwise and pinned it with a characterization test whose signpost reads
   *"if this reds, read it as FIXED — delete the test."* Deliberately unassigned.
3. **The orphan roster-blob row on a person-refusal** — a refused person still gains a
   `bracketPlayers` row no participant references. Repairing the back-reference would be a
   *resolution*, which **I4 forbids** — so it needs a decision, not a patch.
4. **F-DM-55** — the `match_states` String→`DateTime` migration. Ruled **OUT of P9**: those strings
   ride the public `/display/{token}/match-states` wire and every migration this program shipped was
   verified on **SQLite only**.
5. **F-DM-47** — may `api/dto.ts` name domain types? Its fix would create the hand mirror's first
   non-generated import.
6. **F-DM-25** — the workspace-key-kinds question. **P7 wants this answered first.**

### 5. Standing process notes for the next session

- **Workflow unchanged:** `superpowers:subagent-driven-development`, opus subagents, tight contexts;
  each phase gets its **detailed plan authored at phase start against the then-current tree**;
  controller ratifies judgment calls and rules on findings; merge and proceed autonomously.
- **The produced-not-predicted rule** (learned over four slices and six gate episodes) is recorded
  in the P9 section and now binds every plan: a gate's expected count must be **produced by running
  the pattern against the tree**, never predicted from an audit or a dispatch; no gate may be
  satisfiable by rewording a comment; for **citation** gates the default scope is **every directory
  the tier owns**, not just its source dirs; and a permanent doc may only cite permanent sources
  (`git check-ignore` is the mechanical test — the SDD working ledger is git-ignored scratch).
- **R-DM-2(c) Meet-roster extraction** remains a committed follow-on **program**, not a slice.
- **P8** stays owner-blocked on the R15 content definition.

---

## 2026-08-25 — SESSION: the push happened, and F-DM-25 is ruled

**The gate is green, but it is green via a SPLIT run — say that, not "make check exit 0".** A
single `make check` exited **2**, and the reason was environmental, not a failure: `ruff` is not on
`PATH` in a bare bash shell (`process_begin: CreateProcess(NULL, ruff check …) failed`), so the
target died at the first backend line. **The frontend half ran to completion inside that same run**
and every count is identical to the P6/P9 baseline — console **204 files / 1840 tests**, entrant
**37 / 760**, depcruise **16 warnings / 0 errors**, entrant depcruise **clean**, `tsc -b` clean.
The three backend lines were then re-run with the repo `.venv` on `PATH`: `ruff` **"All checks
passed!"**, import-linter **15 kept / 0 broken**, pytest **1923 passed / 66 skipped** in 806 s.
Together those reconstitute the whole `check` target except `docs:freshness`, which the Makefile
itself marks advisory (`Makefile:252`, "never fails the gate"). **Every count that means something
matches the baseline**, which is the standard this program has used since P6 — count-identity, not
an exit code. Worth recording because a pipeline's `$?` would have lied here: `pytest | tail` reports
**tail's** status, so an exit code alone could not have carried this.

**The push happened.** Kyle was asked the §2 question from the previous handoff verbatim — whether
any of `healBracketRosterNames`'s three ruled consequences counts as "loss of functionality" — and
answered **none of them**. `git push origin main` → `53b650a1..122458d8`, **99 commits** (the
handoff said 98; its own commit was the 99th). `origin/main` and `main` now agree. **This closes the
first action of the previous handoff.**

**F-DM-25 is ruled, and the ruling is the design doc's own recommendation.** Kyle accepted: **keep
all four workspace key kinds, declare the mapping, do not re-key.** The declaration is
`docs/reference/workspace-keys.md` (commit `b841428f`), wired into the sidebar and gated by
`npm run docs:build` — the dead-link gate, which passes. The debt-log row is struck and closed.

**The page corrects the audit twice, and both corrections were produced by reading the tree.**
Three of the audit's line anchors had drifted (`db/models.py:89`→`:88,91`, `display/display.py:111`
no longer the token resolver — it is `:97`, `entries_json.py:536` is a DTO field, while the resolver
that matters is `entries_public.py:102`). The substantive correction is the fourth key kind: the
audit's *"the console never holds the key it is scoped by"* is **false as written**. The console
does hold the uuid — in `uiStore.activeTournamentId` (`store/uiStore.ts:144-146`, URL-derived, set
by `TournamentPage.tsx:69` and `useTournamentState.ts:381`, **not persisted**). What carries no id
is the **data blob** (`api/dto.ts:27` `TournamentConfig`, `store/tournamentStore.ts:22`), which is
scoped by a key it does not itself contain. That is a narrower and true claim, and it is the one the
reference page makes. A bounded Boy-Scout fix rode along: `reference/repo-layout.md` named
`apps/console/src/products/`, a directory that is `modules/` — the exact silent-rot class the debt
log's own doc-freshness row describes.

**Open rulings are now FIVE, not six.** D22 (gender on adoption), the adoption-path divergence, the
orphan roster-blob row, F-DM-55 (the `match_states` migration) and F-DM-47 (may `api/dto.ts` name
domain types) all stand unchanged. **F-DM-25 is off that list.**

**Next.** **P7 is the only implementation slice left, and its scoping input is now answered** —
R-DM-5/10/11 are ruled, P0 is merged, F-DM-25 is closed. It is still banded **L / program-scale**
with the standing instruction not to start it inside another program's window, and P6's closing
note above is still the thing to read first. Its first deliverable is a phase plan authored against
the then-current tree, not code. **P8 stays owner-blocked on the R15 text.**

**CI on the pushed `main` is green** — all five jobs (frontend, entrant, backend, interaction smoke,
compose parse) on run `32934664209` at `cd6d12b1`. Worth stating separately from `make check`:
CI's interaction-smoke job runs the **full `npm run build`**, which `make check` never does.

**P7's phase plan is authored** — `docs/history/superpowers/plans/2026-08-25-sp-dm-3-p7-event-key-and-meet-event.md`
(`506ee53d`), against this tree, per the standing convention. It makes **two controller calls**:

1. **P7 is three shippable slices, not one.** **P7a** (four `CheckConstraint`s, delete the two
   `or "meet"` fallbacks, make a published `eventCode` unrenameable) is **S**, closes four of P7's
   seven findings, carries one additive migration and adds **no UI and no wire-shape change**.
   **P7b** (a Meet Event + the mapping) and **P7c** (server-side Meet lineup + the slot-assignment
   surface) hold the design work and get their own plans at phase start. A single phase carrying all
   of it is shippable only at the end, which the program's every-phase-ships rule forbids.
2. **R-DM-11 means (b), so P7 does NOT re-key the public tier.** The P7 card's body still describes
   option **(a)** — stable key, `eventCode` demoted to a label. R-DM-11 ruled **(b) now**, and P7b
   giving Meet a real Event arguably fires (a)'s trigger, so the plan settles it on the ruling's own
   rationale: **one constraint** versus **102 `eventCode` sites across 33 files** plus a redirect
   story. The re-key stays deferred until a consumer needs the conversion — where F-DM-31/32 already
   sit.

**Measured for the plan, produced not predicted:** `CheckConstraint` in `apps/api/src` = **0**
(F-DM-37 exactly true); `or "meet"` = **2** (`entries/entries.py:165`,
`workspaces/workspace_signals.py:603`); `rankCounts` = **3** real sites once `__pycache__` is
excluded; `eventCode`/`event_code` = **102 sites / 33 files**; alembic head **`y9e4f0a2b7c8`**; all
four CHECK-target columns exist and are bare `String` (`tournaments.kind:123`, `entries.state:1566`,
`matches.status:219`, `tournament_members.role:404`).

**The plan also flags a place the card contradicts the code.** P7's **NC 3** wants an empty
`rankCounts` to stop accepting every code; `entries/entries.py:481-491`'s docstring argues that
acceptance is **deliberate** — refusing would make the seam unusable on an unconfigured workspace,
"which is exactly when public entries arrive". Do not encode NC 3 as written. **P7b** decides it
with Events as the vocabulary source; **P7a** does not touch it. And P5's Meet disconnect was
re-verified in code rather than inherited: `_plan_meet` writes `ranks=["XD"]` while
`expandRanks` emits `XD1..XDn`, **and** `groupId=event.code` puts every entrant of an event in one
group while the generator only pairs across groups (`for j = i+1`). Two independent breaks; Meet
match generation itself lives in `RegenerateMenu.tsx`, on the **client**, which is what makes P7c a
port rather than an edit.

### 2026-08-26 — P7a slice executed (the schema's first CHECK constraints, subagent-driven, opus)

Branch `dm3/p7a-constraints` off `main` @ `41a85821`. Four tasks, each implementer and reviewer
dispatched separately — T1 and T3 reviewed clean after one fix round each, T2 clean with **zero**
findings, T4 is the gate-and-record task that wrote this section. The slice's working SDD ledger was
git-ignored scratch and is deleted with the slice, so **everything load-bearing from it is carried
into this entry** rather than cited by path. That is the program's permanent-source rule
(`git check-ignore` is the mechanical test), and it is why this section is long.

**Commit chain.** `143f3286` **T1** four `CheckConstraint`s + migration `z0f5a1b3c9d2` + six tests,
in **one** commit per F-DM-11 · `32a628a6` **T1** fix round (the batch-rebuild expectation stopped
being hand-maintained) · `b4ebcdb5` **T2** the two `or "meet"` fallbacks deleted · `d6a7517e` **T3**
the machine-derived pin that no route can rename a published event code · `2a606741` **T3** fix round
(a falsely reassuring docstring corrected, D24 characterized and logged) · plus this ledger commit
(this section, four debt-log rows, and the CRLF hazard added to `CLAUDE.md`).

**F-DM-37 said the schema has zero CHECK constraints. It now has four, and every allowed-value set
was PRODUCED from an authority in code rather than invented in the migration.** That sourcing rule
is the whole discipline of the task: a CHECK is a vocabulary declaration, and a vocabulary nothing in
code owns is a constant smuggled into a schema where no reader will ever find it. The four:

| Column | Constraint | Allowed set | The authority that produces it |
| --- | --- | --- | --- |
| `tournaments.kind` | `ck_tournaments_kind` | `meet`, `bracket` | `apps/api/src/workspaces/tournaments.py:356` — `if body.kind not in ("meet", "bracket")` → 400 `"kind must be 'meet' or 'bracket'"`; the DTO defaults at `:92`/`:113` agree |
| `matches.status` | `ck_matches_status` | `scheduled`, `called`, `playing`, `finished`, `retired` | the `MatchStatus` enum, `apps/api/src/db/models.py:63-77` (the five members at `:73-77`) — the column's own default is `MatchStatus.SCHEDULED.value` |
| `entries.state` | `ck_entries_state` | `unverified`, `pending`, `waitlisted`, `confirmed`, `rejected`, `withdrawn` | the six module constants at `apps/api/src/entries/lifecycle.py:53-58` |
| `tournament_members.role` | `ck_tournament_members_role` | `viewer`, `operator`, `owner` | `ROLES = ("viewer", "operator", "owner")` at `apps/api/src/identity/members.py:58`; the same three rank in `_ROLE_LEVELS` (`core/dependencies.py:163`, `identity/invites.py:111`) |

Two sourcing subtleties worth keeping. `entries.state` is the **six**, not the four in `LIVE_STATES`
(`lifecycle.py:64`) — the two terminals are written at `:268` (`entry.state = WITHDRAWN`) and `:337`
(`= REJECTED`), so a set derived from `LIVE_STATES` would have rejected a legitimate withdrawal. And
none of the four sets is *imported* into `db/models.py`: import-linter's persistence-direction
contract forbids `db` reaching up into a domain package, so the literals are hardcoded with the
source named in a comment beside each one. The constraint names are spelled identically in the models
and in the revision, because SQLite batch mode has nothing to drop on the way down otherwise — and
`downgrade()` had to actually work, which is tested.

**No backfill was needed, and that measurement — not an assurance — is why this migration is safe on
a director's laptop.** Every `.db` on this box was copied into scratch with its `-wal`/`-shm` and
grouped read-only; the live files were never opened for write. `data/local.db` (4.0 MB) held
`kind` bracket 10 / meet 4, `state` confirmed 84 / pending 59, `status` finished 86 / scheduled 17 /
playing 2 / called 2, `role` owner 27. `apps/api/local.db` (2.4 MB) held meet 4 / bracket 1,
scheduled 36, owner 5. `data/_probe2/local.db` (4.4 MB) held meet 8 / bracket 2, scheduled 9 /
playing 2 / finished 2, owner 10. **Every distinct value on disk was inside its derived set**, so
unlike `u5f0b4d7e2a3` this revision touches no data — it only rebuilds four tables. Had one value
been outside, the slice would have owed a pre-enforcement sweep before the CHECK, and it did not.

**The migration is `z0f5a1b3c9d2`, down-revision `y9e4f0a2b7c8`, and models + revision landed in the
same commit per F-DM-11** — with the negative controls running against a **migration-built** schema
(`alembic upgrade head` onto a throwaway SQLite file; nothing in the new tests uses
`Base.metadata.create_all`). Each case first asserts the constraint **exists by name** through
`inspect(engine).get_check_constraints(table)` before asserting an out-of-vocabulary insert raises,
because an `IntegrityError` alone cannot tell "CHECK present" from "test set up wrong"; and the
positive half of the same test inserts a legal value and asserts the row landed, so a test that
raised for any reason at all cannot pass. **The batch rebuild of four tables was verified to lose no
FK, index or server default in EITHER direction** — upgrade *and* downgrade — and it is verified by a
**reflected snapshot**, not a hand-maintained list. The first version of that test did carry a hand
list of seven FKs; review found the four rebuilt tables have **eight**, the missing one being
`tournaments.org_id → orgs.id ON DELETE RESTRICT` (`db/models.py:100-102`, `fk_tournaments_org`) —
which was `tournaments`' *only* FK, so the one rebuilt table with a single foreign key had **zero**
coverage. The fix deleted the list rather than correcting it: the test now snapshots FK shape (with
`ondelete` in the tuple, never the name, since SQLite auto-names unnamed constraints), indexes and
server defaults at `y9e4f0a2b7c8`, then asserts the snapshot unchanged after `upgrade head` and
unchanged again after `downgrade`. Three anti-vacuity assertions guard the empty-snapshot failure
mode, one of them finding 1's own tuple, so the specific gap that was reported cannot reopen
silently. It went green first try. `test_entries_migration.py`'s `HEAD_REVISION` pin was bumped
`y9e4f0a2b7c8` → `z0f5a1b3c9d2` — that pin exists precisely so a new migration is noticed, and it
was.

**The `or "meet"` deletion produced 2 → 0 with ZERO test edits, which is the evidence it was dead
code rather than a behavior change** (F-DM-34 / R-DM-10). Two files, two lines. But the two sites are
**not** the same case, and the ruling that separated them is the substance.
`apps/api/src/entries/entries.py:165` was `(tournament.kind or "meet") == "bracket"` where
`tournament` is a real `Tournament` ORM row loaded inside `commit_entries` — with `ck_tournaments_kind`
plus `nullable=False` on the column, both the `None` and the empty-string case are genuinely
unreachable, so **that fallback was deleted whole**. `apps/api/src/workspaces/workspace_signals.py:603`
was `kind = getattr(row, "kind", "meet") or "meet"` inside `build_signals(row, ...)`, whose docstring
declares it **"Pure — no DB"** and whose `row` is duck-typed (the unit tests pass a
`SimpleNamespace`). **A database CHECK cannot make a `getattr` default on a duck-typed object dead**,
so deleting that default would have weakened a documented contract to satisfy a grep. It **kept the
`getattr` default** and lost only the trailing `or "meet"` — the empty-string guard, which the CHECK
*does* make impossible for a real row and which a test double would never need. The gate
`grep -rn 'or "meet"' apps/api/src` → **0** is met honestly, because the surviving default contains
no `or "meet"`. Caller work backed it: the only production caller of `commit_entries` loads the row
from the DB, every test fixture passes an explicit `kind=`, and a repo-wide search for `kind=None` /
`kind=""` found nothing. `_board_kind`'s `"hybrid"` answer was not touched (UI-only notion under
R-DM-10); it lives in `display/display.py:122`, **not** `workspace_signals.py` as the plan prose
implied.

**R-DM-11(b) turned out to have nothing to forbid: no rename path exists, so the deliverable is a
PIN derived from the live OpenAPI route table, not a guard with no caller.** The investigation was
run before any code was written, and it is the reason the slice shipped a test instead of a service
refusal. `entry_events.code` is **create-only**: one writer (`entries/entries_routes.py:875`,
`row = EntryEvent(...)` in `create_entry_event`), no update/upsert/replace function, no
`update(EntryEvent)`, no `.code =` on any ORM row (the two hits are exception constructors), none of
the five bulk `setattr` loops in `repositories/local.py` reaches an `EntryEvent`, and no PATCH/PUT/
DELETE exists on any `/entry-events` path. Backup/restore cannot rewrite one either — `entry_events`
is a real table, while `tournament_backups` snapshots the `tournaments.data` JSON blob.
`bracket_events` has **no `code` column at all**: its `id` is half of the composite primary key
`(tournament_id, id)` and is never assigned after construction, and every `/events/{event_id}` write
is keyed by that id in the *path*, which cannot rename its own key. So the property R-DM-11(b) asks
for already held by construction, and building a refusal for a caller that does not exist was
explicitly forbidden. What shipped is `tests/backend/test_event_code_unrenameable.py`, shaped after
`test_tenant_isolation.py` and reading `app.openapi()["paths"]` rather than `app.routes` (the nested
`_IncludedRouter` hazard): **two independent derivations** — every operation on a path containing
`entry-event` must equal the single create, and every operation whose request body declares a `code`
property — at **any depth**, resolving `$ref`, `allOf`/`anyOf`/`oneOf`, each property's own schema,
an array's `items` and a mapping's `additionalProperties` (the descent was added by the final
review's fix wave; see below) — must be that same one, plus a non-vacuity meta-test, because a derivation that matched nothing would pass both
forever. Its failure
message is the teeth: it names R-DM-11(b), states the rule (refuse a `code` change while any
`entry_pages` publication flag is on; a draft event stays renameable), and says the refusal belongs
in the owning service, not a DTO validator. **It was mutation-checked, twice and independently** —
implementer and reviewer each registered a synthetic `PATCH /entry-events/{event_id}` with a `code`
body on the live app and confirmed **both** derivations raise with `R-DM-11` in the message, one
resolving the body through `$ref`. The rule is also stated in the `EntryEvent` and
`create_entry_event` docstrings, where the next author to add an event-update route will actually
read it.

**New information for P7b/P7c: the entrant tier's `eventCode` has THREE sources, not one.** This was
produced by tracing `apps/entrant/app/lib/draws.types.ts` and `entryPage.types.ts` back through the
API, and it is the fact that makes "the public event key" a misleading singular. (1)
**`bracket_events.id`** feeds `DrawCardDTO.eventCode`/`.drawKey`, `DrawDetailDTO`, `SeedsEventDTO`,
`WinnersEventDTO` and bracket-origin `PlayerMatchDTO` — `entries_site.py` literally writes
`drawKey=event.id, eventCode=event.id` at `:531`, `:656`, `:693`, `:748`, `:1022`. (2)
**`entry_events.code`** feeds `EntrantListRowDTO.eventCodes`, `ReserveRowDTO.eventCode`, the entry
form's `EventDTO.code` and `PlayerEventDTO.code` (`entries_json.py:439`, `:482`, `:495`;
`entries_site.py:931`). (3) **`match["eventRank"]` out of the `tournaments.data` blob** feeds
`PlayerMatchDTO.eventCode` on **meet-origin** matches (`entries_site.py:1136`) — which the whole-state
`PUT /tournaments/{id}/state` can rewrite, though it is a display label with no public URL resolving
by it. The consequence that matters for the next slice: **`entry_events.code` is a naming and
grouping dimension, NOT a URL or submit key.** The public URL keys are `slug`, `personKey` and
`drawKey`; the entry form submits an event **by id, never by code** — `enter.tsx:280`/`:291`
render one checkbox per offered event, named `events`, whose value is `` `${index}:${event.id}` ``
(`entries/entry_form.py:35` and `:102` document that wire shape as `"<player index>:<event id>"`
/ `"0:<uuid>"`), the native POST goes to `/e/api/submit/{slug}` (`enter.tsx:499-500`), and
`_resolve_selections` (`entries_json.py:735`) hands each raw id to `_lookup_event`
(`entries_public.py:459-468`), which parses it as a **UUID** and fetches the `EntryEvent` by
composite key. The same checkbox row *displays* `event.code` beside it (`enter.tsx:293`) — shown,
never submitted, which is the whole distinction in one line of JSX. Renaming an
`entry_events.code` would silently relabel published entrant lists, reserve queues and player pages —
real harm, and exactly what R-DM-11(b) names — but it would break no address.

**D24 — a published draw can still be re-keyed, and it is routed to an owner ruling rather than
fixed.** The review found the reassuring half of the slice's own docstring was false, and it was
right. `bracket_events.id` is the entrant tier's *other* public key: `entries_site.py:530-531` writes
`drawKey=event.id`, the `/e/{slug}/draws/{drawKey}` URL segment. `POST /bracket`
(`brackets.py:1455`) takes each event id from the **request body**, and `POST /bracket/import`
(`:3157`) installs a parsed payload wholesale by the same mechanism; `DELETE /bracket` (`:1657`)
clears the bracket that stands in their way. **None of the three looks at the workspace's
publication flags**, and the 409 at `:1481` ("bracket already exists; DELETE /bracket first to
recreate") **instructs that very sequence**. R-DM-11(b)'s window opens at **publication**, which
precedes play, so the "pre-play a replace is lossless" defence does not cover it. Three things
followed and only two were P7a's. The false docstring was **corrected the same round** — a docstring
asserting a safety property the code does not have is worse than none, because it is what a future
author trusts instead of reading the routes; the implementer found the same false claim a second time
in the pin module's own docstring, which the finding had not named, by checking rather than assuming.
The gap got a **characterization test, not a widened pin**: the pin cannot be extended over the
bracket write surface because it would not pass — the property genuinely does not hold there — so
`test_a_published_draw_can_still_be_re_keyed_by_delete_and_recreate` pins the *actual* behaviour
(publish a draw, confirm `/draws/MS` resolves, run the exact sequence the 409 instructs with
`id: "MS-A"`, assert the old public URL **404s**), carrying the program's signpost for a deliberately
unowned defect: ***if this test reds, read it as FIXED — delete it.*** And **locking the draw key at
publication was NOT P7a's call**: R-DM-11 accepted one live-surface consequence — a published event
code can no longer be renamed — but blocking `DELETE`+`POST /bracket` after publication would block a
legitimate draw **rebuild**, not merely a rename, which is a bigger consequence than the one the
ruling accepted, and draw identity is precisely what P7b/P7c redesign. It is logged as **D24** under
*Open — needs an owner decision*, naming the routes, the 409, publication as the window, and the
rebuild-versus-rename cost.

**The standing caveat, restated honestly: all migration evidence in this program is SQLite-only, and
P7a ADDS to that debt.** Postgres is untested. This slice is not neutral on the point — it carries a
revision that **rebuilds four tables**, and the rebuild is the SQLite-specific path: on Postgres
`batch_alter_table` issues a plain `ALTER TABLE ... ADD CONSTRAINT` with no rebuild, so the
FK-survival risk the snapshot test covers is SQLite's, while the Postgres path is the one nothing has
exercised. Do not read the snapshot test as cross-dialect coverage. Second, smaller caveat from the
same test: it snapshots the four **rebuilt** tables only, and FK enforcement is off on the migration
connection, so a child table whose FK points into a rebuilt one could be left dangling without
raising. Not observed, not covered — logged.

**What P7a deliberately did NOT do**, so the next author does not go looking for it:

- **No public re-key.** R-DM-11 means **(b)**, not (a). The P7 card's body still describes (a) — a
  stable key with `eventCode` demoted to a label — and the plan settled it on the ruling's own
  arithmetic: **one constraint** versus **102 `eventCode` sites across 33 files** plus a redirect
  story. The conversion stays deferred until a consumer needs it, where F-DM-31/32 already sit.
- **No Meet Event, no mapping column, no operator surface.** Those are P7b and P7c. P7a adds **no UI
  and no wire-shape change** at all.
- **`tournaments.status` was left unconstrained on purpose, and the reason is the same discipline
  that produced the other four sets: NOTHING IN CODE PRODUCES ITS ALLOWED SET.** It is a
  `String(20)` with an apparent vocabulary (`draft`/`active`/`archived`) whose own column comment
  says *"Stored as plain string for ease of evolution; enforcement lives at the application layer"*,
  and no validator anywhere produces the set. A CHECK there would be a constant invented in a
  migration. The asymmetry it leaves — an unconstrained `status` beside a constrained `kind` on the
  same table — reads as an oversight, which is why it is written down here and in the debt log: the
  next constraint batch must give that column an authority in code **before** constraining it.
- **The remaining enum columns stay unconstrained.** The card said "~19 unconstrained enum Strings";
  the AST-produced list is **22** `String(<=32)` columns, of which four are now done and several are
  not enums at all (`tournaments.tournament_date` is an ISO date string — a CHECK there would be a
  format regex, a different decision). The cheapest next one is `invite_links.role`, which shares the
  `ROLES` vocabulary already used above; `workspace_modules.module_id` has backend `MODULE_IDS`;
  `bracket_events.format` has `FORMAT_REGISTRY`. The rest need a vocabulary source first.

**Gates.** `make check` green across both tiers, run with the repo `.venv/Scripts` on `PATH` (without
it the target dies at exit **2** for a purely environmental reason — `ruff`, `lint-imports` and
`pytest` all live there — which is not a failure and must not be reported as one). Console lint 0
errors / 117 warnings (the standing downgraded set), `tsc -b` clean, vitest **204 files, 1840
tests**; depcruise **16 warnings, 0 errors** (the pre-ratchet `KNOWN_CROSS_MODULE` set, unchanged);
entrant lint / typecheck / vitest **37 files, 760 tests**, entrant depcruise **clean**; ruff
**"All checks passed!"**; import-linter **15 kept, 0 broken**; pytest **`1934 passed, 66 skipped, 50 warnings in 811.37s (0:13:31)`**.
**Every frontend count is identical to the P6/P9 baseline**, which is what a backend-only slice must
produce. **pytest rose by exactly 11, and all eleven are this slice's own new tests**: **six** in
`tests/backend/unit/test_check_constraints_migration.py` (the out-of-vocabulary refusal parametrized
over all four columns = 4, plus the batch-rebuild snapshot and the downgrade round-trip) and **five**
in `tests/backend/test_event_code_unrenameable.py` (the two OpenAPI derivations, the non-vacuity
meta-test, the public-projection characterization, and D24's re-key characterization added in T3's
fix round) — **the final review's fix wave below adds a sixth to that file, after this gate episode
was measured**, so `1934` is this run's produced figure and not a claim about the branch tip. T2 added none — it is a two-line deletion with zero test edits, which is its own evidence.
`npm run docs:freshness` reports **3 areas BEHIND** — State management (6 source commits since
`2bb99fda`), Modules (17 since `e7e7221a`) and Entrant tier (15 since `7adc6820`) — which is
**advisory by the Makefile's own declaration** (`Makefile:287`, "advisory — never fails the gate";
make prefixes the recipe with `-` and prints `[Makefile:252: check] Error 1 (ignored)`), so it is
reported, not treated as red. **None of the three can be P7a's**: this slice changed no console
and no entrant source at all, and all three lag commits dated 2026-08-25 or earlier. `make check`
exited **0**.

**Four debt rows written** (`docs/reference/debt-log.md`, *Open — small and unscheduled*), in
addition to D24 above: `tournaments.status` has no authority in code for its allowed set; Alembic
revision ids have reached `z0f5a1b3c9d2` and the single-letter prefix scheme is **exhausted**, so the
next slice adding a migration picks a new one (renaming a shipped revision id is a migration-history
rewrite and is not on the table); the schema snapshot covers the four rebuilt tables only, not child
tables whose FKs point into them; and `db/models.py:756` `derive_modules(kind: Optional[str])` still
tolerates a `None` kind now that the column cannot be null or off-vocabulary.

**One hazard was hit during this slice and is now in `CLAUDE.md`.** The repo is `core.autocrlf=true`
with CRLF working-tree files, so a tool that writes LF shows a **clean, small `git diff` while having
rewritten the whole file on disk**. T2's implementer hit it on a two-line change, caught it before
committing, and restored the file. Every subsequent task checked `git diff --stat` for
proportionality before committing, and none showed a deletions-heavy stat on a barely-touched file.


**The final whole-branch review's fix wave (2026-08-26).** The review returned **Ready to merge:
yes, 0 Critical**, so nothing here was a rescue: one Important and three Minor items, fixed in a
single wave scoped to the two test files plus these two documents. **No production code was touched**,
which is also why the gate run was the two files and `ruff`, not `make check` — the frontend and the
lint surface cannot be reached from here, and re-running a 13-minute suite to observe one new test is
cost without a property.

**The pin's body derivation was widened, not documented — because the thing that breaks it is the
NEXT slice.** `_body_properties` read only top-level `properties`, `$ref` targets and
`allOf`/`anyOf`/`oneOf` members, so a request body shaped `{"event": {"code": ...}}` or
`{"events": [{"code": ...}]}` evaded derivation 2 entirely. **P7b's whole purpose is to add event
shapes**, so writing the hole down would have been writing down that the pin stops working immediately
before the thing that breaks it. It now descends into each property's own schema, an array's `items`
and a mapping's `additionalProperties` — the last of those caught on a second pass, because the
first version's own ceiling sentence ("a free-form `dict` declares no `properties`") was itself an
overclaim: a **typed** `dict[str, Model]` emits `additionalProperties: {"$ref": ...}`, whose values
very much are derivable. Same overclaim class as the snapshot docstring this wave was fixing, one
paragraph over. **The STOP ruling was re-applied to it** — the original probe had not walked
`additionalProperties` either, so running the widened derivation 2 against the live spec *was* the
probe, and it stayed green: no route ships a `dict[str, ModelWithCode]` body today. The walk resolves
`$ref` as it goes, with the existing `seen` tuple threaded through every branch as
the cycle guard — a self-referencing model (`Node.children: list[Node]`) is legal OpenAPI. **No depth
cap was added on top of it**, and the reason is worth keeping: every unbounded path through a JSON
Schema graph must revisit a `$ref`, which `seen` already cuts, so a cap would be a second mechanism
guarding nothing. One real trap was hit and is recorded: recursing on `schema.get("items") or {}`
loops on the `{}` sentinel **forever** — `{}.get("items") or {}` is `{}` — and it took a
`RecursionError` on the first run to see it. The guard is `if "items" in schema`, with the reason in a
comment beside it.

**The STOP condition was resolved by producing it, before the change was written.** The instruction
was explicit: if the recursion reds the pin on an existing nested body, stop and report — do not
loosen the assertion, do not add an exemption to `_CODE_WRITERS` — because a red there would mean a
`code` field already rides a request body nobody knew about. A throwaway probe walked every request
body in `app.openapi()` at every depth and printed one hit: `('POST',
'/tournaments/{tournament_id}/entry-events', 'code')`, the known create. Clean, so the change was safe
to write; the probe file was deleted and `git status` confirmed it gone.

**Re-mutation-checked over three body shapes, and the new one is the point.** A synthetic
`PATCH /tournaments/{tournament_id}/entry-events/{event_id}` was registered on the live app carrying,
in turn, `FlatBody{code}`, `NestedBody{event: Inner{code}}` and `ArrayBody{events: [Inner{code}]}` —
real `BaseModel`s, because FastAPI emits a nested model as a **`$ref`-valued property** and an
inline-dict fixture would pass even with the `$ref` hop broken. All three red **both** derivations with
`R-DM-11` in the message; the routes were removed and the scratch file deleted. The old
implementation, run against the same two nested fixtures, returns `{'event'}` and `{'events'}` — it
finds no `code` in either, which is the hole measured rather than asserted. A **permanent** case now
holds the recursion itself: `test_the_body_derivation_descends_into_nested_and_array_shapes` is a pure
function test over a minimal spec dict with a `$ref`-valued property, a `$ref`'d array `items`, and a
self-referencing schema as the termination proof.

**The remaining ceiling, which is what the docstring now says**, and it is smaller than the old one
rather than absent. The derivation matches on the **name** `code`, so a rename field called anything
else is invisible to it. It walks `properties`/`items`/`additionalProperties` and no other subschema
keyword — `prefixItems` and its relatives are not reachable from anything FastAPI emits today, and
adding them speculatively would be guessing rather than measuring. And a body typed as a genuinely
free-form `dict`/`Any` — `PUT /tournaments/{id}/state` ships the whole workspace blob that way —
declares no subschema at all, so nothing inside one is derivable by any traversal. **D24 was checked and states no ceiling at all**: it is entirely
about the bracket re-key gap, and a grep of `docs/reference/debt-log.md` for
`derivation|top-level|allOf|_body_properties` plus `R-DM-11` returns only that row, matching on
`R-DM-11` in its prose. So the debt log had nothing describing the *old* ceiling to correct; the new
one is stated in the derivation-2 debt row this wave added, where the next person to trip the pin will
be looking.

**The snapshot test's docstring overclaimed, and one of its omissions was load-bearing.**
`_schema_shapes` said it captured "everything `batch_alter_table` could silently drop" while capturing
FKs, indexes and defaults only. **Nullability was added** — the same `get_columns` call already
returns it — because **Task 2's deletion of the `or "meet"` fallback in `entries/entries.py` depends on
`tournaments.kind` keeping `NOT NULL` across the rebuild, and nothing asserted that.** It is its own
key rather than a widened `defaults` tuple, so the existing anti-vacuity assertions keep asserting
exactly what they say; a sibling `assert ("kind", False) in before["tournaments"]["nullability"]` joins
them. The three docstrings that enumerated the old list (the module's, `_schema_shapes`', and the
test's) now say **four** kinds and name what is still uncovered: **column type, primary key and unique
constraints**. The unique-constraint claim is produced, not assumed — reflection over the migrated
schema returns `[]` for all four rebuilt tables (`tournaments`, `matches`, `entries`,
`tournament_members`), so there is nothing yet to lose, and one added later would land outside the
snapshot.

**Three debt rows were written** (`docs/reference/debt-log.md`, *Open — small and unscheduled*), each
attributed to this review: `repositories/local.py:399` `set_status(status: "str | MatchStatus")` is the
one typed opening to the 500-at-runtime class the four CHECKs created, with **no caller passing a raw
string today** (all four production sites and all three test sites pass a `MatchStatus` member) — a row
and not a fix because narrowing a repository signature is a production change outside this wave's
charter; derivation 2 is a **repo-wide** pin that will red on any unrelated future `code` with a
message that reads as a non-sequitur, so the row names the `_CODE_WRITERS` escape hatch where someone
will find it fast; and `tournaments.kind` carries `server_default=sa.text("'meet'")` in
`alembic/versions/a8b2d5e9f1c3_step_t_i_tournament_kind.py:40` while `db/models.py:124` has only a
Python-side `default="meet"` — a **pre-existing** create_all-vs-migration divergence, observed not
introduced, and exactly the class F-DM-11's negative-control rule exists to catch.

**A program-level convention, binding P7b and P7c, and it is the citation half of the rule the program
already carries for counts.** "Produced, not predicted" was written for gate numbers; this is the same
rule pointed at line anchors:

> **No line anchor enters a permanent document unless it was printed from the tree in the session that
> writes it.**

**Three bad anchors reached the permanent docs during this slice, every one of them by trusting a
prior task's report instead of printing the line.** The failure mode is the one this program already
named at a different altitude: a citation that arrives via a summary is a *predicted* citation no
matter how authoritative the summariser, and it is worse than a predicted count — a wrong path that
happens to exist converts a guess into evidence, because the reader checks it, finds a file, and
stops. The mechanical test is cheap and non-negotiable: `grep -n` the symbol, paste what prints. Every
anchor in this wave's additions was produced that way, including the ones that turned out to be right.

**One correction this wave owes its own rule.** The CRLF hazard recorded above is real but is **not
uniform across the tree**: `tests/backend/unit/test_check_constraints_migration.py` and this file are
CRLF on disk, while `tests/backend/test_event_code_unrenameable.py` and `docs/reference/debt-log.md`
are **LF** — a previous tool wrote them that way, and `git diff` is clean either way because
`core.autocrlf=true` normalizes on the way in. So "the repo is CRLF" is the wrong generalisation; the
right one is **read the file's bytes and write back what was there**, then check `git diff --stat` for
proportionality regardless. Every file this wave edited was checked, and none showed a
deletions-heavy stat on a barely-touched file.
