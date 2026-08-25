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
| 4 | P2 — blob version discipline | R-DM-8 (a) | M | **NEXT — write detailed plan at phase start** |
| 5 | P4 — people→competition key | R-DM-2 (a) | L | pending — blocked by P3+P2 |
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
