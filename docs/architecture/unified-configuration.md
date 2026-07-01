# Unified configuration (Meet · Bracket)

Meet and Bracket each split their **Configuration** surface into two tabs.
The first tab is an **Engine** tab whose scoring field set is identical in
both modules — not by parallel hand-written copies, but because both render
one shared component. The second tab is module-specific (Meet structure /
Bracket draw structure). This page describes what is shared by
construction, what stays per module, and why Bracket gained set-by-set
scoring without a schema migration.

## Two tabs per module

Both Configuration pages mount a segmented switcher (`Seg`) over a `section`
search param and render one section at a time:

| Module | Tab 1 (Engine) | Tab 2 |
|---|---|---|
| Meet | `EngineSettings` | `MeetStructureForm` (Meet) |
| Bracket | `BracketEngineSection` | `BracketStructureSection` (Structure) |

- **Meet** — `products/meet/TournamentSetupPage.tsx` hosts the switcher and
  a single page-level Save button. Only the active section's form is
  mounted; both carry the same `id` (`meet-config-form`), so the actions-bar
  `type="submit" form=…` button submits whichever form is showing.
- **Bracket** — `products/bracket/BracketTab.tsx` hosts the same `Seg`
  switcher (labels **Engine** / **Structure**). Bracket sections persist
  through the tournament store rather than a submit button (see below).

## The shared scoring field set

`platform/settings/ScoringFields.tsx` is the single source of the four
scoring inputs. Both Engine tabs import it, so "identical field set in both
modules" is true by construction — there are no two copies to drift apart.

The component is controlled: the parent owns a `ScoringValue` and applies
the emitted `Partial<ScoringValue>` patch to its own form state or store.
The four fields and how the UI labels map to stored values:

| UI label | Stored field | Values |
|---|---|---|
| Score type | `scoringFormat` | `'simple'` → **Simple**, `'badminton'` → **Sets** |
| Points per set | `pointsPerSet` | 11 / 15 / 21 |
| Match format | `setsToWin` | **Best of 1/3/5** stored as `setsToWin` = 1 / 2 / 3 (sets to win) |
| Deuce (win by 2) | `deuceEnabled` | boolean |

::: info Mind the mapping
"Match format" reads as best-of-_N_ but stores **sets to win**: Best of 3
is `setsToWin: 2`. The points / match-format / deuce rows are dependents of
`scoringFormat` — when Score type is **Simple** they dim and disable, but
their values still persist.
:::

The three scoring discipline codes used elsewhere are unrelated to these
fields; the score-type value `'badminton'` is purely the persisted key for
the **Sets** label.

### What each Engine tab adds around the shared fields

The shared component is the only common surface; everything else on each
Engine tab is module tuning and stays per module:

- **Meet** `EngineSettings.tsx` — adds rest between matches, an optional
  break window, and an **Advanced solver** column (reproducible run, solver
  time limit, freeze horizon) plus **Optimisation goals** (court
  utilisation, game spacing, compact schedule, player overlap). British
  spelling throughout, matching the source ("optimisation", "utilisation",
  "maximise").
- **Bracket** `BracketEngineSection.tsx` — adds the one bracket-specific
  timing input, rest between rounds (in slots). Courts, slot duration, and
  the day window live in workspace **Venue & schedule**, which the tab
  links to rather than re-owning.

## The second tab stays module-specific

- **Meet tab** (`MeetStructureForm.tsx`) owns the meet type (Dual / Tri)
  and the lineup **position counts** per discipline (`rankCounts` — men's
  singles `MS`, women's singles `WS`, men's doubles `MD`, women's doubles
  `WD`, mixed doubles `XD`). It sets *how many* positions per discipline,
  e.g. 3 = 1st–3rd singles. Who fills each position — the position grid
  (`PositionGrid`) — stays in Roster.
- **Bracket Structure tab** (`BracketStructureSection.tsx`) is a read-only
  summary: active disciplines and, per draw, its type (single-elimination
  or round-robin), draw size, and seeded count, plus **Manage** links to
  the Draws spreadsheet and participant pool. Seeding and the draw
  structure itself are owned by the Draws surface — this tab surfaces the
  facts and routes there, it does not re-model them.

## Bracket Sets scoring — no migration

Bracket gained set-by-set (**Sets**) scoring as a purely additive change:
no Alembic migration was needed, because the shape it writes into already
existed.

1. **The scoring config already lived on the shared `TournamentConfig`.**
   `scoringFormat`, `pointsPerSet`, `setsToWin`, and `deuceEnabled` are
   optional fields on `TournamentConfig` (`api/dto.ts`) and persist inside
   the `tournaments.data` JSON blob. Surfacing them on the Bracket Engine
   tab adds reads/writes of existing keys — no new column.
2. **`bracket_results.score` is already a JSON column.**
   `database/models.py` declares `score: Mapped[Optional[dict]]` as a
   `JSON` column, documented as "format-specific (sets, points, etc.)". A
   Sets result writes its set-by-set blob into that column unchanged.

So Bracket persists a result exactly as before — a `winner_side` plus the
opaque JSON `score` — and Sets scoring just populates the previously-empty
`score` blob. On the API surface, both `RecordResultIn` and `ResultOut`
(`api/brackets.py`) carry `score: Optional[dict]`, omitted for winner-only
("Simple") results.

::: warning Shared config, not a shared score record
What is shared is the scoring **configuration** field set. The per-match
**score record** is *not* unified: Meet stores integer side points
(`match_states.score_side_a/b`), Bracket stores opaque JSON
(`bracket_results.score`) plus `winner_side`. That separation is deliberate
— see [ADR 0006](/decisions/0006-unified-scheduling-core) and
[ADR 0008](/decisions/0008-shared-scoring-fields).
:::

## See also

- [ADR 0008 — Share the scoring field set; add Bracket Sets scoring without a migration](/decisions/0008-shared-scoring-fields)
- [ADR 0006 — Unified scheduling core, non-merged match record](/decisions/0006-unified-scheduling-core)
- [Scheduling unification](/architecture/scheduling-unification)
- [Meet module](/modules/meet) · [Bracket module](/modules/bracket)
