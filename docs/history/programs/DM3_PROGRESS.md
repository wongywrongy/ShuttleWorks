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
**Docs branch:** register + plan + this ledger live on `docs/dm1-rulings` (unmerged).
Implementation happens on `<type>/<slug>` branches off `main` (first: `dm3/p3-minting-gaps`).

## Slices, in ruled execution order

| # | Slice | Ruled by | Size | Status |
|---|---|---|---|---|
| 1 | **P3 — minting gaps** (pulled forward, R-DM-1.x) | R-DM-1 (a)/(a) | S | **NEXT — plan is detailed, execute it** |
| 2 | P0 — type mechanism (parity oracle) | R-DM-9 (a) | M | pending (write detailed plan at start) |
| 3 | P1 — one standings shape | — | M | pending |
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
  ruled deferral (`debt-log.md:78`).
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
- **Next session:** the rulings, plan, and this ledger exist ONLY on `docs/dm1-rulings`
  (unmerged) — a branch cut from bare `main` has none of them. Either merge
  `docs/dm1-rulings` into `main` first (three docs-only commits: `45b241d2`, `38e04b61`
  and this fix — Kyle's call, it is his docs branch) and then branch
  `dm3/p3-minting-gaps` off `main`, or branch it off `docs/dm1-rulings` directly. Then
  execute the plan's Task 1–4 (P3) via superpowers:subagent-driven-development or
  executing-plans. The plan's line numbers anchor to `53b650a1`; re-anchor by symbol if
  the tree has moved.
