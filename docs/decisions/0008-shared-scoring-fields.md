# ADR 0008 — Share the scoring field set; add Bracket Sets scoring without a migration

**Status:** Accepted (2026-06-26, branch `dev/workspace-suite`)

## Context

Meet and Bracket each restructured their Configuration surface into two
tabs (SP-E4): an **Engine** tab and a module-specific second tab. Both
Engine tabs need the same four scoring inputs — score type, points per set,
match format, deuce.

1. **Two field sets would drift.** Hand-writing the same four controls in
   `EngineSettings` (Meet) and `BracketEngineSection` (Bracket) means any
   later change has to be made twice and stays correct only by vigilance.
2. **The scoring config already lives on a shared type.** `scoringFormat`,
   `pointsPerSet`, `setsToWin`, `deuceEnabled` are already optional fields
   on `TournamentConfig`, persisted in the `tournaments.data` JSON blob.
   Meet already read and wrote them.
3. **Bracket had only winner-only results.** Bracket persisted a result as
   `winner_side` plus an opaque JSON `score` (`bracket_results.score`,
   already a `JSON` column documented "sets, points, etc."). The column
   existed; nothing wrote a set-by-set blob into it yet.
4. **The score *record* is deliberately not merged** —
   [ADR 0006](/decisions/0006-unified-scheduling-core) keeps Meet's integer
   side points (`match_states`) and Bracket's `winner_side` + JSON score
   (`bracket_results`) as separate persistence models.

## Decision

**Extract the scoring inputs into one shared component; persist Bracket
Sets scoring into the shape that already exists.**

Shared (implemented):

- **One scoring component** — `platform/settings/ScoringFields.tsx` renders
  the four controls and emits a `Partial<ScoringValue>` patch its parent
  applies. Both Engine tabs render it, so the field set is identical *by
  construction*, not by parallel copies. Engine-specific rows (Meet's rest
  + solver/optimisation knobs; Bracket's rest between rounds) stay per
  module around it.

Not migrated (deliberate):

- **No Alembic migration for Bracket Sets scoring.** The four scoring
  fields already live on the shared `TournamentConfig` → `tournaments.data`
  JSON, and `bracket_results.score` is already a `JSON` column. Surfacing
  the fields on the Bracket Engine tab and writing a set-by-set blob into
  `score` is purely additive to shapes that already exist. `RecordResultIn`
  / `ResultOut` carry `score: Optional[dict]`, omitted for winner-only
  ("Simple") results.

This builds directly on ADR 0006's projection table: the "score" row
already records that Bracket's score is `bracket_results.score` (JSON) +
`winner_side`. ADR 0008 only adds a writer for that pre-existing slot and
shares the *config* that selects the mode — it does **not** unify the score
record.

## Consequences

- **Positive** — the scoring field set cannot drift between modules; a
  change to score-type options, points, or deuce is made once in
  `ScoringFields`.
- **Positive** — Bracket Sets scoring shipped with zero schema change and
  no data backfill: existing winner-only results keep a null `score`, new
  Sets results populate it.
- **Trade-off** — "shared scoring" is shared *configuration*, not a shared
  score record. Meet still stores integer side points and Bracket still
  stores `winner_side` + opaque JSON; a reader wanting a uniform score view
  must still project per module (ADR 0006).
- **Trade-off** — the `score` JSON blob is schema-less by design, so its
  set-by-set shape is validated in application code, not by the database.

## See also

- [Unified configuration](/architecture/unified-configuration) (the shared field set + two-tab layout) ·
  [ADR 0006 — Unified scheduling core](/decisions/0006-unified-scheduling-core)
- [Meet module](/modules/meet) · [Bracket module](/modules/bracket)
