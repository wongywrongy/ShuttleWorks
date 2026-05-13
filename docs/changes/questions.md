# Open questions

Per the cloud prompt's rule: anything unclear or contradicted in the spec gets logged here and asked before proceeding.

## Status
One open question (Q2 below) blocking Step A of the architecture-adjustment arc. Initial cloud-prep ambiguities (scope, path mapping, entity set, async/sync, existing data, branch) resolved during plan-mode kickoff on 2026-05-13 — see `2026-05-13.md`.

---

### 2026-05-13 — Q2: target table for status + version columns

**Context:** `docs/arch adjustment prompt`, Step A1 — "Add two columns to the `matches` table via a new Alembic migration".

**Conflict / unclarity:** The current schema does not have a `matches` table. Match identity lives inside the `tournaments.data` JSONB snapshot (`TournamentState`), and the only adjacent SQL surface is `match_states`, keyed `(tournament_id, match_id)`, holding live-ops status + timestamps. Adding `status` + `version` to a non-existent `matches` table is not actionable without a structural choice.

**Options considered:**
- **(a) Re-target the migration onto `match_states`.** Treat that table as the canonical row for each match; rename to `matches` if desired; promote `status` from free string to the new enum; add `version`. The transition guard + ETag + command log + solver-locking all key off `match_states.match_id`. Cheapest path; matches the existing live-ops mental model. Cost: the prompt's invariant "every existing route that mutates a match" maps onto routes that today mutate `match_states` (live ops) plus the routes that mutate `tournaments.data` (Setup / Schedule generation). The latter still write match objects without touching `match_states`, so the version semantics get fuzzy when the Setup tab regenerates the schedule.
- **(b) Materialise a new `matches` table that mirrors the JSONB rows inside `tournaments.data`.** First-class SQL row per match: `id`, `tournament_id`, `court_id`, `time_slot`, `status`, `version`, etc. `match_states` either folds into it or stays as a thin live-ops adjunct. Cost: a non-trivial schema + repository + frontend wiring shift on top of the rest of the arc. Benefit: a single authoritative row per match makes the Step C command log, Step D ETag, and Step E sync semantics genuinely clean.
- **(c) Keep `tournaments.data` as the source of truth for match identity but add a side-table `match_versions` (or equivalent) that holds `match_id`, `status`, `version`.** Splits "match content" (JSONB) from "match control" (SQL). Less invasive than (b), more honest than (a). Cost: two-place lookup; reconciling JSONB rewrites with SQL versioning at every Setup save.

**Resolution:** 2026-05-13 — user picked **(b) — new `matches` table**. Schedule-commit population folded into Step A scope: Step A creates the `matches` table, backfills from existing `tournaments.data` JSONB, and wires the schedule-commit / state-write paths so per-match SQL rows stay in sync going forward. `match_states` is left untouched in this step; cleanup is a follow-up after Steps A–G stabilise.


---

## Template for new entries

```
### YYYY-MM-DD — <short title>
**Context:** <where in the spec / which step>
**Conflict / unclarity:** <what's ambiguous>
**Options considered:** <bullet list>
**Resolution:** <user answer, with date>
```
