# SP-A — Workspace control-plane backend foundation — design

**Date:** 2026-06-23
**Status:** accepted (pending user spec review)
**Branch:** `dev/workspace-suite`
**Program:** "Control Plane First" — Ubiquiti-grade workspace redesign. SP-A is the
first of ~5 sub-projects (A backend foundation → B module routing decouple →
C Hub control plane → D Settings completion → E visual-language layer). SP-A is
**pure backend**: no UI, no routes added, no `kind` removal.

## Goal

Give the frontend control plane *real* data to render instead of faked signal:

1. **`modules?` seed on workspace create** — let create persist an explicit module
   set (the 4 templates + the deferred custom-create #4), not just a `kind`-derived
   one. `kind` stays as the legacy compatibility field.
2. **`signals?` on every workspace summary** — health, coded attention reasons,
   module counts, a per-kind setup-readiness checklist, and collaboration counts —
   computed server-side as the single source of truth.

Both extend an already-half-built foundation: summaries already carry `modules[]`
via `_modules_for` (derive-and-persist through `ensure_modules`), and
`workspace_modules.py` already encodes the dependency rules for PATCH.

## Decisions locked in brainstorming

- **Signals computed in the backend DTO** (not frontend-derived) — the summary
  doesn't carry member/invite/readiness today, so the backend is the honest single
  source of truth.
- **SP-A = backend foundation only** (both modules-seed *and* signals). SP-B/C
  consume it.
- **Richer setup-readiness keys** (per-kind, meaningful) over a minimal set —
  chosen for long-term value, *as long as it stays cheap* (no N+1, no full-payload
  reload).
- **Coded attention reasons** `{ code, label }` over plain strings — lets the Hub
  sort/style by severity later without re-parsing prose.
- Guiding principle from the user: **do not make decisions to be cheap if they
  incur architecture debt.** Applied below as: real grouped-count helpers and a
  shared dependency-rule function, *not* per-row queries or duplicated rules.

## Part 1 — `modules?` seed on create

### DTO

```python
class WorkspaceModuleSeedDTO(BaseModel):
    moduleId: Literal["meet", "bracket", "display"]
    status: Literal["enabled", "available", "disabled", "coming_soon"]
    config: Optional[dict] = None

class TournamentCreateDTO(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    kind: str = Field(default="meet", max_length=20)
    tournamentDate: Optional[str] = Field(default=None, max_length=32)
    modules: Optional[List[WorkspaceModuleSeedDTO]] = None   # NEW
```

### Behaviour

- `kind` is still required/defaulted and still validated to `meet | bracket`. The
  4 frontend templates map onto existing kinds — Meet Day / Hybrid / Blank →
  `kind=meet`; Bracket Tournament → `kind=bracket`. `modules[]` is the *explicit
  override* of the kind-derived seed; it does not introduce new `kind` literals.
- **When `modules[]` is present:** after the row is created, persist the validated,
  backfilled set via a new `repo.modules.seed_modules(row, seeds)` **before**
  `_modules_for` runs. `ensure_modules` is already idempotent (it only derives for
  modules with no row), so it becomes a no-op and returns the seeded rows.
- **When `modules[]` is absent:** unchanged — `ensure_modules` derives from `kind`.

### Validation (runs on the merged set, before persist)

A seed is rejected with **400 `VALIDATION_FAILED`** if:
- it names an unknown `moduleId`, or names the same `moduleId` twice;
- a `status` is outside the four literals;
- it violates the **Display dependency**: `display` may not be `enabled` unless
  `meet` or `bracket` is `enabled` in the merged set.

**Backfill:** a partial seed is completed before validation — any of the three
modules not named is filled to `available` (meet/bracket) or `coming_soon`
(display, unless a data module is enabled, in which case `available`). This keeps
the persisted set well-formed (all three modules present, matching what
`ensure_modules` produces).

Zero-`enabled` is **allowed** — the Blank template is legitimately all-`available`.
The "keep ≥1 operational module" rule belongs to *disable*, not *create*.

### Shared dependency rule (anti-drift)

The Display-dependency check currently lives inline in the `workspace_modules.py`
PATCH handler. **Extract it** into one function, e.g.:

```python
def display_dependency_satisfied(statuses: dict[str, str]) -> bool:
    """Display may be `enabled` only if a data-producing module
    (meet or bracket) is enabled."""
```

Both the PATCH handler and create-seed validation call it. No duplicated rule.

## Part 2 — `signals` on the summary

### DTO

```python
class AttentionReasonDTO(BaseModel):
    code: str        # stable machine code, e.g. "NO_MODULES_ENABLED"
    label: str       # human text, e.g. "No modules enabled"

class ModuleCountsDTO(BaseModel):
    enabled: int
    available: int
    disabled: int
    comingSoon: int

class CollaborationDTO(BaseModel):
    memberCount: int
    activeInviteCount: int

class WorkspaceSignalsDTO(BaseModel):
    health: Literal["good", "attention", "draft", "archived"]
    attention: List[AttentionReasonDTO]
    modules: ModuleCountsDTO
    setup: Dict[str, bool]              # per-kind readiness keys
    collaboration: CollaborationDTO

class TournamentSummaryDTO(BaseModel):
    ...
    signals: Optional[WorkspaceSignalsDTO] = None   # always populated; typed
                                                     # optional for resilience
```

### Computation — pure helper, batched counts (NO N+1)

The N+1 trap is calling a per-row helper that holds `repo`. Avoid it structurally:

```python
def _signals_for(
    row: Tournament,
    modules: List[WorkspaceModuleDTO],
    counts: RowCounts,            # this row's slice of the grouped maps
) -> WorkspaceSignalsDTO:
    ...   # PURE: no repo, no DB access
```

`list_tournaments` computes the grouped maps **once** over the visible id set,
then slices per row:

```python
ids = [t.id for t in rows if t.id in role_by_tournament]
members   = repo.members.count_by_tournament(ids)            # {id: int}
invites   = repo.invite_links.count_active_by_tournament(ids)# {id: int}
bevents   = repo.brackets.count_events_by_tournament(ids)    # {id: int}
bmatches  = repo.brackets.count_matches_by_tournament(ids)   # {id: int}
bresults  = repo.brackets.count_results_by_tournament(ids)   # {id: int}
# one grouped query each; then per-row slice into _signals_for
```

Single-GET endpoints (`get_tournament`, create, update) call the **same grouped
helpers with a one-element id list** — same code path, no special-casing.

**New grouped repo helpers** `*_by_tournament(ids: list[UUID]) -> dict[UUID, int]`
(one `GROUP BY` query each). Do **not** reuse the existing single-id
`count_matches` / `count_bracket_events` inside a loop — those are the N+1 trap;
add grouped variants alongside them.

### Readiness keys (richer, per-kind, cheap)

Meet readiness reads `row.data` — a **non-deferred JSON column already loaded** by
`list_all()`, so it is free CPU with zero extra queries:

- **meet** (`kind == "meet"`):
  - `configured` — `data["config"]` has the required scheduling fields
    (`courtCount > 0`, `dayStart`, `dayEnd`).
  - `roster` — `len(data.get("players", [])) > 0`.
  - `scheduled` — a schedule has been generated (`data["schedule"]` /
    assignments non-empty).
  - `results` — at least one scored match in the blob (`data["matches"]` entry
    carrying a recorded result, or non-empty `data` history). **Blob-only** — no
    relational `match_states` fetch. If the plan finds results are not reliably
    mirrored in the blob, **drop this key** rather than add a per-row query.
- **bracket** (`kind == "bracket"`), from the grouped count slices:
  - `events` — bracket events count > 0.
  - `bracketBuilt` — bracket matches count > 0.
  - `results` — bracket results count > 0.

Frontend renders whatever keys are present; the key set differing by kind is fine.

### Attention reasons (coded)

Computed from the same already-available data (module statuses + readiness +
counts). Stable codes (extend over time):

- `NO_MODULES_ENABLED` — "No modules enabled" (zero modules `enabled`).
- `DISPLAY_NO_SOURCE` — "Display is on but no data module is enabled"
  (display `enabled`, neither meet nor bracket `enabled`).
- meet: `NO_ROSTER` — "No players added yet"; `NOT_SCHEDULED` —
  "Schedule not generated".
- bracket: `NO_BRACKET` — "Bracket not built yet".

Severity is **not** stored — the frontend maps `code → severity`, keeping the
contract small while still sortable/stylable.

### health derivation

- `archived` if `status == "archived"`.
- `draft` if `status == "draft"`.
- else `attention` if `attention[]` is non-empty.
- else `good`.

### "active invite" definition (single source of truth)

`count_active_by_tournament` must match the frontend `inviteStatus.ts` definition:
an invite is **active** iff **not revoked AND not expired** (`revokedAt is None`
AND (`expiresAt is None` OR `expiresAt > now`)). Pin this once on the backend so
the Hub collaboration count equals what the Sharing tab shows.

## Out of scope (SP-A)

- The New Workspace template picker UI that *sends* `modules[]` — SP that builds
  templates (frontend), later.
- Any Hub / Settings UI consuming `signals` — SP-C / SP-D.
- Routing decouple / module-unavailable state — SP-B.
- Removing or repurposing `kind`. It stays.
- Denormalized readiness columns — rejected as gold-plating; the blob is already
  loaded.

## Constraints

- No route paths added or changed; `/tournaments/*`, `/display`, `/tournaments/:id/tv`
  preserved. Meet / Bracket / Display internals untouched.
- `kind` preserved as legacy compatibility.
- No data-lossy behavior; create/open/delete preserved.
- The list endpoint must add **no per-row DB round-trip** for signals beyond the
  fixed set of grouped queries (member, active-invite, bracket events/matches/
  results). Meet readiness adds zero queries (blob already loaded).
- Backend suite stays green (currently 489 pass / 1 pre-existing psycopg2
  `test_config` skip). Migration story unchanged — SP-A adds no new table
  (`workspace_modules` already migrated); `seed_modules` writes to it.

## Tests

Backend (`python3 -m pytest` from `products/scheduler`):

- **Create-seed:** each of the 4 template seeds persists the exact module set;
  a partial seed is backfilled to all three modules; legacy `kind`-only create
  still derives from `kind` (unchanged).
- **Create-seed validation:** unknown moduleId → 400; duplicate moduleId → 400;
  bad status → 400; `display=enabled` with no data module enabled → 400; Blank
  (all-`available`, zero enabled) → 201.
- **Shared dependency rule:** `display_dependency_satisfied` unit-tested; PATCH
  handler still 409s on the same violation it did before (no regression).
- **Signals shape:** every summary carries `signals`; `modules` counts match the
  module set; `health` derives correctly across draft/active/archived and
  empty/non-empty attention; coded attention reasons fire for each trigger.
- **Readiness:** meet `configured/roster/scheduled/results` reflect `data`;
  bracket `events/bracketBuilt/results` reflect the relational counts.
- **Collaboration:** `memberCount` and `activeInviteCount` correct; active-invite
  excludes revoked and expired (matches `inviteStatus`).
- **No N+1:** a list call over N tournaments issues a fixed number of grouped
  count queries, not a per-row multiple (assert via query count / the grouped
  helpers being called once each).

## Acceptance criteria

1. Create accepts and persists an explicit `modules[]` seed (4 templates + partial
   backfill), validates it via the shared dependency rule, and 400s on malformed
   seeds; legacy `kind`-only create is unchanged.
2. Every workspace summary carries a fully-populated `signals` object with coded
   attention, per-kind richer readiness, module counts, and collaboration counts.
3. Signals are computed with batched grouped queries and zero per-row DB
   round-trips beyond that fixed set; meet readiness adds no query.
4. The Display-dependency rule lives in one shared function used by both
   create-seed and PATCH; "active invite" matches the frontend definition.
5. Backend suite green (489 pass / 1 pre-existing skip); no routes changed; `kind`
   preserved.
