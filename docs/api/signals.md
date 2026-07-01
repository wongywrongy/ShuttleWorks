# Signals API

**Signals** are the per-workspace operational summary the Hub renders for every workspace — health,
what needs attention, a setup readiness checklist, module counts, and collaboration counts. They are
the most important cross-cutting backend feature: one batched computation that powers the entire Hub
dashboard. This page documents the signal fields and the `GET /tournaments` list response that
carries them.

## `build_signals`

```python
def build_signals(row, modules, counts: RowCounts) -> WorkspaceSignalsDTO
```

`build_signals` (in `api/workspace_signals.py`) is a **pure function** — no database access. It takes
a tournament row, its module DTOs, and a pre-fetched `RowCounts` slice, and returns a
`WorkspaceSignalsDTO`. Setup readiness reads the tournament's `data` blob; everything relational comes
from the counts.

### `health`

One of `good | attention | draft | archived`:

- `archived` — `row.status == "archived"`
- `draft` — `row.status == "draft"`
- `attention` — any attention codes are present
- `good` — otherwise

### `attention[]`

A list of reason codes (with labels). The codes:

| Code | Meaning |
| --- | --- |
| `NO_MODULES_ENABLED` | no modules enabled |
| `DISPLAY_NO_SOURCE` | Display is on but no data module is enabled to feed it (`display_dependency_satisfied`) |
| `NO_BRACKET` | bracket not built yet (bracket-kind workspaces) |
| `NO_ROSTER` | no players added yet (meet-kind workspaces) |
| `NOT_SCHEDULED` | schedule not generated yet (meet-kind workspaces) |

### `setup` — the readiness checklist

A small map of booleans, keyed by workspace `kind`:

**Meet:**

| Key | True when |
| --- | --- |
| `configured` | `courtCount` **and** `dayStart` **and** `dayEnd` are set |
| `roster` | the players list is non-empty |
| `scheduled` | a schedule with assignments exists |
| `results` | there is ≥1 match-state row |

**Bracket:**

| Key | True when |
| --- | --- |
| `events` | ≥1 bracket event exists |
| `bracketBuilt` | ≥1 bracket match exists |
| `results` | ≥1 bracket result exists |

### `modules` — module counts

`ModuleCountsDTO`: `enabled`, `available`, `disabled`, `comingSoon` (counts of `workspace_modules`
rows by status).

### `collaboration` — collaboration counts

`CollaborationDTO`: `memberCount` and `activeInviteCount`.

## `GET /tournaments` — the list response

The Hub fetches all workspaces from `GET /tournaments`, which returns `List[TournamentSummaryDTO]`,
one row per workspace the caller can see:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `str` | |
| `name` | `str?` | |
| `status` | `draft | active | archived` | |
| `kind` | `str` | `meet | bracket` |
| `tournamentDate` | `str?` | |
| `createdAt` / `updatedAt` | `str` | |
| `role` | `str?` | the **caller's** role on this workspace |
| `ownerName` | `str?` | denormalised owner email |
| `modules` | `WorkspaceModuleDTO[]` | each `{ moduleId, status, config? }` |
| `signals` | `WorkspaceSignalsDTO?` | the output of `build_signals` |

## One batched pass — no N+1

The list endpoint computes every workspace's signal in **one batched pass**, not per-row queries:

1. one query for all `(tournament_id, role)` pairs for the user,
2. one query for all module rows of the visible workspaces,
3. **grouped count queries** batched by `tournament_id` — members, active invites, bracket events,
   bracket matches, bracket results, and match states — collected into a
   `{ tournament_id: RowCounts }` map.

The per-row loop then calls `build_signals(row, modules, counts)` with the pre-computed counts and
makes **no further database round-trips**. `RowCounts` carries `members`, `active_invites`,
`bracket_events`, `bracket_matches`, `bracket_results`, and `match_states`.

::: tip Why this matters
Signals drive the Hub for *every* workspace on every load. Computing them per-row would be a classic
N+1 across six relations. Keeping `build_signals` pure and feeding it batched counts is what makes the
Hub cheap — change it carefully.
:::

## See also

- [API reference](/api/) — route ownership + the shared backend conventions
- [Backend structure](/architecture/backend-structure#signals-computation) — where `build_signals` sits in the layering
- [Workspace model](/architecture/workspace-model) — the Hub / control plane these signals drive
