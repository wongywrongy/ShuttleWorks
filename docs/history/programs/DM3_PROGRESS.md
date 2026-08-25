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
| 1 | **P3 — minting gaps** (pulled forward, R-DM-1.x) | R-DM-1 (a)/(a) | S | **DONE 2026-08-24** — branch dm3/p3-minting-gaps (405c34ec..68c27751 + bookkeeping), unmerged |
| 2 | P0 — type mechanism (parity oracle) | R-DM-9 (a) | M | **DONE 2026-08-24** — branch dm3/p0-type-mechanism (bd262dbd..b30c38ab + bookkeeping, stacked on P3), unmerged |
| 3 | P1 — one standings shape | — | M | **NEXT — write detailed plan at phase start** |
| 4 | P2 — blob version discipline | R-DM-8 (a) | M | pending |
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
- Merging: P3 merges first or together (stacked). Next slice: P1 (one standings shape) — write its detailed plan at phase start; note Task 3's hand-shape floor (64, zero headroom) reddens on `dto.ts` deletions and is documented "lower freely".
