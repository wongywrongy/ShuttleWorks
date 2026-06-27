# ADR 0006 — Unify the scheduling core; do not merge the match record

**Status:** Accepted

## Context

Meet and Bracket are both constraint-satisfaction scheduling problems
solved by the same CP-SAT engine ([ADR 0004](/decisions/0004-ortools-cpsat-engine)).
Because they began as separate apps, some infrastructure above the engine
existed twice. We set out to find and remove that duplication while
preserving the two things genuinely unique to each module: the Meet
**position grid** (lineup positions per discipline) and the Bracket
**draw structure** (seeded slots, advancement tree).

Investigation of the backend established three facts:

1. **The engine is already shared.** Both modules build a
   `ScheduleRequest` and call into `scheduler_core` with the same
   constraint plugins. Neither lineup nor advancement is a CP-SAT
   constraint — both modules pre-resolve fully-formed matches and hand
   them to the solver (Bracket schedules one ready *wave* per solve,
   advancing `current_slot` between rounds).
2. **`ScheduleConfig` was built two ways.** The meet adapter built a rich
   config from a `TournamentConfig`; the bracket path built a bare config
   inline. Both consumed the same structural parameters.
3. **The match record is two genuinely different things.** Meet persists
   a match across the `tournaments.data` blob (rosters), the `matches`
   table (court/slot/status), and `match_states` (score as two integer
   points `sideA`/`sideB` — no winner concept). Bracket persists fully
   relationally in `bracket_matches` / `bracket_results`, where a result
   is a `winner_side` plus an opaque format-specific JSON `score`, fused
   to the advancement cascade. The differing columns *are* the protected
   position grid (`eventRank`) and draw structure (`slot_a`/`slot_b`,
   `dependencies`).

## Decision

**Unify the layer that is genuinely shared; document — but do not
build — a merge of the layer that is not.**

Shared (implemented):

- **One scheduling-parameter builder** — `services/scheduling/params.py`
  (`SchedulingParams` + `build_schedule_config`). Both modules read
  courts / time window / slot duration / rest / breaks / closures /
  freeze through it. The meet adapter layers its module-specific solver
  objective weights on top via `dataclasses.replace`.
- **One CP-SAT invocation** — both batch paths call the engine's single
  entry `scheduler_core.schedule(request, *, options, candidate_pool_size)`.
  (The streaming meet path keeps driving `CPSATScheduler` directly for
  per-solution progress events.)

Not merged (deliberate):

- The `matches` / `match_states` and `bracket_matches` / `bracket_results`
  tables are **not** combined, and no shared match-record/score value
  object is introduced. A shared value object would be constructed by
  neither module (meet emits `{sideA, sideB}` points; bracket emits
  `winner_side` + opaque JSON) — it would be dead, ornamental code.
  Merging the tables would require changing the `MatchStateDTO` /
  `BracketResult` wire shapes (a frontend change) and a schema migration
  that swallows the protected position-grid / draw-structure columns.

"The match record is one thing" is therefore honored as a **conceptual
contract** — the universal core below — that each persistence model maps
to, not as new code.

### Universal match core → per-module projection

| Universal core | Meet source | Bracket source |
|---|---|---|
| id | `matches.id` / `MatchDTO.id` | `bracket_matches.id` (PlayUnitId) |
| side_a / side_b | `MatchDTO.sideA/sideB` (state blob) | `bracket_matches.side_a/side_b` |
| court / slot | `matches.court_id` / `time_slot` | `TournamentAssignment.court_id` / `slot_id` |
| status | `matches.status` (`MatchStatus`) | result presence (`BracketResult`) |
| score | `match_states.score_side_a/b` (points) | `bracket_results.score` (JSON) + `winner_side` |

## Consequences

- **Positive** — a future developer changing scheduling parameters or the
  CP-SAT invocation touches one place, regardless of module. The shared
  seam is small, fully tested, and behavior-preserving.
- **Positive** — the protected position grid and draw structure are
  untouched; no migration, no frontend change, no contortion of either
  domain's score semantics.
- **Trade-off** — "one match record" is a documented contract, not an
  enforced type. Code that needs the universal view projects from the
  module's own model. We judged an unused value object worse than an
  honest contract: it would imply a unification that doesn't exist in
  the data.

## See also

- [Scheduling unification](/architecture/scheduling-unification) (the shared seam) ·
  [ADR 0004 — CP-SAT engine](/decisions/0004-ortools-cpsat-engine)
- Builds on this non-merge: [ADR 0007 — Bracket results through the command queue](/decisions/0007-bracket-result-command-queue) ·
  [ADR 0008 — Shared scoring fields](/decisions/0008-shared-scoring-fields)
