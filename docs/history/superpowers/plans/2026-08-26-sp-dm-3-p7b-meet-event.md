# SP-DM-3 — P7b: a Meet Event, and the mapping — detailed plan

**Status:** authored 2026-08-26 against `main` @ `ab261ecc` (P7a merged and pushed, CI green).
Alembic head `z0f5a1b3c9d2`. Parent plan: `docs/history/superpowers/plans/2026-08-25-sp-dm-3-p7-event-key-and-meet-event.md`.
Rulings: `docs/history/programs/DM1_RULINGS.md` (R-DM-5 binds this slice). Ledger:
`docs/history/programs/DM3_PROGRESS.md`.

**Resolves:** F-DM-23 (Meet has no Event at all, so the seam *invents* `groupId`), F-DM-24's Meet
half, F-DM-33 (`draws: []` indistinguishable from "not generated"). **Blocked-by:** R-DM-5 (ruled),
P2 (blob version discipline, merged), P7a (merged). **Does not block:** anything already shipped.

---

## The problem, restated from the code rather than the card

Meet has no Event entity. It expresses divisions as a `rankCounts` dict inside the state blob
(`apps/api/src/core/schemas.py:118`, `{"MS": 3, "WS": 3, …}` — keys are codes, values are how many
numbered slots that division has), and a player carries the divisions they are in as
`PlayerDTO.ranks[]`. Because there is no Event row, the entries seam has nothing to map an entry
event onto — so it invents both halves of the mapping, and both are wrong:

1. **Rank level.** `_plan_meet` writes `"ranks": [event.code]` — `"XD"` (`entries/entries.py:456`),
   while the generator expands `rankCounts` into **numbered** ranks (`XD1..XDn`,
   `RegenerateMenu.tsx:24-30`) and filters `(p.ranks ?? []).includes(rank)` (`:87,90`).
   `"XD" !== "XD1"`, so **no committed entry can reach a generated Meet match**.
2. **Group level.** `_plan_meet` sets `"groupId": event.code` and creates a group row of that name
   (`entries/entries.py:454,470`) — a value invented purely to satisfy a required DTO field. The
   generator only ever pairs **across** groups (`for i … for j = i+1 …`, `RegenerateMenu.tsx:82-84`),
   so every entrant of one event lands in one "school" and could not be paired with another even if
   the ranks matched.

**Both must be fixed or neither matters** — closing one leaves committed entries just as unable to
reach a match as before. That is the single most important scoping fact in this plan.

## Ruling A — a real `meet_events` table, not a blob section

The parent plan left this open ("a `meet_events` table **or** a division-keyed, versioned blob
section"). **Ruling: the table.** Three reasons, in order of weight:

1. **R-DM-5 says "a real Meet Event entity that makes the mapping storable."** An entity is a row.
2. **A mapping column can only point at a row.** R-DM-5 requires "a real mapping column"; a column
   referencing a JSON path inside a blob is a string, not a mapping.
3. **A blob section carries no FK and no constraint.** P2 gave blobs *version* discipline, which is
   about safe reshaping, not about identity. P7a just established the schema's first
   `CheckConstraint`s; putting a new identity in a blob one slice later argues against itself.

**Cost if wrong:** a table plus a migration where a blob section would have been cheaper to write —
and considerably more expensive to constrain, join, or point a FK at, which is the whole point.

## Ruling B — `meet_events` is the authority; `rankCounts` is derived until the console moves

The failure mode to avoid is **two vocabularies**, which is the same shape as F-DM-13 (six answers
to "is this doubles", collapsed by P5). So: the table is the authority, and `rankCounts` continues
to exist as a **derived projection** for the console's existing readers.

Measured: `rankCounts` has **six** non-test readers in the console —
`modules/meet/exports/xlsxExports.ts:79`, `modules/meet/matches/MatchDetailPanel.tsx:97,114`,
`modules/meet/matches/RegenerateMenu.tsx:62`, `modules/meet/roster/hooks/useRankValidation.ts:78-84`,
`modules/meet/roster/positionGrid/helpers.ts:32`, plus its declaration at `api/dto.ts:52`.
**Moving those six is NOT P7b's job** — it is console work with no backend content, and doing it
here would double the slice for no new capability.

**Cost if wrong:** the derived projection has to be kept in step for one or two slices. That is a
real cost and it is why the derivation must live in exactly one function, named as the temporary it
is, with the readers listed in its docstring so whoever retires it can find them.

## Ruling C — the `_rank_vocabulary` fail-open survives, one layer up

The design card's **NC 3** wants an empty `rankCounts` to stop accepting every code. The seam's
docstring argues the opposite deliberately (`entries/entries.py:481-491`): *"An empty or missing
vocabulary declares nothing to contradict, so it accepts — refusing there would make the seam
unusable on a workspace whose configuration has not been filled in yet, which is exactly when public
entries arrive."* **That argument survives the move to Events verbatim** — "no Events declared yet"
is the same state as "no `rankCounts` yet", and public entries still arrive before configuration.

**Ruling: keep the fail-open when NO Meet Events are declared. Once at least one is declared, an
entry event whose code is outside the declared set is unmappable and is skipped-and-reported, exactly
as today.** Do not encode card NC 3 as written; it was written without this argument in view.
**Cost if wrong:** an unconfigured workspace silently accepts codes it will later have to reconcile —
which is today's behaviour, and the alternative breaks intake on exactly the workspaces that need it.

---

# Tasks

## Task 0 — Measure, before anything is designed against (S)

The plan asserts only what was produced. These were **not** measured at authoring time and must be
produced before Task 1 designs against them. Record every count in the ledger.

- The **Meet state blob's** exact shape for `groups`, `players[].ranks` and `config.rankCounts` as
  the backend validates it (`core/schemas.py`), and every backend reader of each.
- Every writer of `config.rankCounts` — console and backend — and whether any path other than the
  state upsert can set it.
- `_hydrate_session` (`bracket/brackets.py:733`) and `entries_site.py:515-545`: exactly how
  `draws: []` is produced for a Meet workspace today, which is F-DM-33's mechanism.
- The `groups` model: what a group row means outside the entries seam (the Meet product calls them
  *schools*), and what breaks if the seam stops inventing one per event code.
- Whether any existing test asserts the invented `groupId == event.code` behaviour. **If one does,
  it pins behaviour this slice deliberately changes — stop and flag it rather than editing it.**

## Task 1 — `meet_events` + the mapping column (M)

- A `meet_events` table: workspace-scoped, one row per **division** (`MS`, `XD`), carrying its code,
  its label, and its slot count (the number `rankCounts` used to hold). Composite PK scoped by
  `tournament_id`, following `bracket_events`' shape (`db/models.py:1483` neighbourhood) rather than
  inventing a new one.
- A **real mapping column** on `entry_events` pointing at the Meet Event row. R-DM-5 binds its
  grain: **division-level, never slot-level** — `MS`, never `MS1`.
- **F-DM-11 binds:** models change and Alembic revision in the **same commit**, down-revision
  `z0f5a1b3c9d2`, with the negative control against a **migration-built** schema. The single-letter
  revision prefix scheme is exhausted at `z` — pick the new scheme and record it (debt-logged by P7a).
- **Backfill** `meet_events` from existing blobs' `rankCounts` in the same migration, and prove it on
  a database that already holds Meet workspaces. P7a's measurement recipe applies: read the on-disk
  databases, do not assume.
- `entry_events.bracket_event_id` stays FK-less (R2). Do not touch it.

## Task 2 — Retire the invented `groupId` and close both disconnects (M)

- `_plan_meet` maps an entry onto its **Meet Event**, and derives `ranks[]` from that Event's
  declared slots rather than writing the bare code. This is disconnect 1.
- The seam stops inventing a group per event code. What it does instead is **Task 0's finding to
  inform** — the constraint is that entrants must be able to land in different groups, or the
  generator's cross-group pairing can never pair them (disconnect 2).
- **Negative controls:** (a) a committed entry **reaches a generated Meet match** — this fails today
  and is the whole point of the slice; (b) two entrants in the same division can be paired with each
  other; (c) an entry event whose code is outside a **declared** vocabulary is still
  skipped-and-reported, unchanged.
- **Behaviour change, deliberate and to be stated plainly in the ledger:** workspaces that already
  committed entries under the invented `groupId` keep those rows. Say what a director sees.

## Task 3 — F-DM-33: a Meet workspace's draws index means something (S)

- `_hydrate_session` returns `None` on empty `bracket_events`, so a Meet workspace's `draws: []` is
  indistinguishable from "not generated yet". With Meet Events, a Meet workspace can answer the
  question honestly.
- **NC:** a Meet workspace with declared Events and no generated matches is distinguishable from a
  bracket workspace with no draws.
- **Public-wire caution:** this touches `entries_site.py`, which is the **public entrant tier**. P1
  established that this program does not change public entrant wire keys. Adding a shape is not
  changing one — but say which it is, and if it turns out to be a change, stop and flag it.

## Task 4 — Gate, route out, close the ledger (S)

- Full `make check` with **`.venv/Scripts` on `PATH`** (or it dies at exit 2 on a missing `ruff`).
  Never read a pipeline's `$?` as the suite's verdict. Baseline at this slice's start: console
  204/1840, entrant 37/760, depcruise 16w/0e, import-linter 15/0, **pytest 1935 passed / 66 skipped**.
  This slice adds tests, so state the delta and account for every one.
- Carry the produced measurements into `docs/history/programs/DM3_PROGRESS.md` — the SDD workspace is
  git-ignored scratch and is deleted at slice close.
- **D24 is ruled to be decided inside this slice** (owner, 2026-08-26): whether publication should
  lock a draw's key. Draw identity is what this slice touches. Decide it, or state plainly why it
  still cannot be decided.

---

## Inherited constraints (binding, from the program and P7a)

- **Produced, not predicted.** Gate counts are produced by running the pattern against the tree. And
  its citation half, added by P7a: **no line anchor enters a permanent document unless it was printed
  from the tree in the session that writes it** — three bad anchors reached the docs in one slice,
  every one by trusting a prior task's report.
- **F-DM-11:** column change + Alembic revision in the same commit; negative control against a
  migration-built schema.
- **Refactors must not change behavior.** A test that would have to change to keep passing is a
  **stop-and-flag**, not an edit. P7b *does* change behaviour by design — which makes the distinction
  sharper, not softer: changes the plan names are intended, everything else is a finding.
- **All migration evidence in this program is SQLite-only.** Postgres is untested, and this slice
  adds a table and a backfill to that debt.
- **CRLF, and it is not uniform:** the repo is `core.autocrlf=true`, but line endings differ per file
  on disk (P7a hit both). A tool writing the wrong ending shows a clean small `git diff` while
  rewriting the whole file. Check `git diff --stat` is proportionate before every commit.
- **Workflow:** `superpowers:subagent-driven-development`, opus subagents, tight contexts, per-task
  review, whole-branch review, one fix wave, ff-merge, ledger updated at slice close.
