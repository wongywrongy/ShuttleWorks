# Hub Dashboard Redesign — design spec

**Date:** 2026-07-03 · **Branch:** `dev/workspace-suite` · **Status:** approved, pre-plan

## Goal

Evolve the Hub (`/`) workspace dashboard to the target mockup
`ShuttleWorks - Dashboard Redesign.dc.html` (repo root; dark + light). The
Phase‑13 Hub already shipped the status facets (All / Active / Draft / Shared /
Needs attention) and the flat, time‑sorted list. This redesign adds:

- a richer **list row** (health dot · Modules column · next action) with a
  selected‑row accent, a functional **sort control**, and a **footer summary
  bar**; and
- a much deeper **inspector**: status pill, a **matches / scheduled / to‑do**
  metric triplet, a **readiness progress bar** + checklist, module rows, and a
  **"Next up"** list of the workspace's next scheduled matches.

Two of those inspector sections (metrics, Next up) need per‑workspace match
data the Hub does not load today. "No cutting corners" — build the full look.

## Decisions (resolved in brainstorming)

1. **Match data source: extend the backend summary.** Every workspace carries
   its match metrics + next‑up in `TournamentSummaryDTO.signals`, computed on
   the list path — no per‑select fetch, no frontend kind‑branching. Approach
   **A (batched)**: reuse the existing N+1‑guarded pattern (grouped `RowCounts`
   + the pre‑loaded `row.data` blob) so the list endpoint gains **zero per‑row
   queries** for meet, and at most one added grouped count for bracket.
2. **Row status dot = workspace health** (`good`/`attention`/`draft`/`archived`),
   the existing signal. **The mockup's dot *pulse* is dropped** — it signified
   "live", and we are keeping health, not a live operational status. Dots are
   static (a subtle glow on `good` is fine; no animation).
3. **Command‑bar avatar stays rail‑only.** The app's global left rail already
   carries the account avatar; the mockup drew one in the command bar only
   because its artboard had no rail. Not duplicated (consistent with Phase 13).
4. **Sort control + footer bar: both functional.** Sort offers Recent / Event
   date / Name; the footer shows live counts + a relative "Updated" time.
5. **Per‑row Modules column returns.** Phase 13 moved module chips into the
   inspector; the target doc puts a Modules column back in the rows (M/D/B
   glyphs, dashed for available‑but‑not‑enabled). Both places show modules now.

## Architecture

### 1. Backend — extend the workspace summary (`workspace_signals.py`)

`build_signals(row, modules, counts)` is **pure (no DB)**: relational counts
arrive pre‑batched in `RowCounts` (6 grouped queries in
`repositories/local.py`), and meet readiness already reads the loaded
`row.data` blob (`_meet_setup`). The extension follows the same contract.

New DTO fields on `WorkspaceSignalsDTO` (all additive/optional — older payloads
still render):

```py
class NextMatchDTO(BaseModel):
    code: str            # "MS1" (meet matchNumber → "M{n}"; bracket play-unit label)
    time_label: str | None   # "09:30" (meet: dayStart + slot*interval); None if unresolved
    court_label: str | None  # "Court 1"
    status: str          # "scheduled" (default upcoming) | "finished"
    # NOTE: only schedule-derivable state. Live called/started lives in the
    # match_states table (not the loaded data blob), so surfacing it would break
    # the zero-per-row-query guarantee — deferred. The mockup shows "Sched"; Hub
    # Next-up is a glance, Operations Run is the live surface.

class MatchMetricsDTO(BaseModel):
    total: int           # all matches / play-units
    scheduled: int       # those with a committed slot/assignment
    to_do: int           # = len(attention) — the amber tile

class WorkspaceSignalsDTO(BaseModel):
    ...                              # existing: health, attention, modules, setup, collaboration
    matches: MatchMetricsDTO         # NEW
    next_up: List[NextMatchDTO]      # NEW, ≤3, [] when undated/unconfigured/archived
```

**Computation, kind‑aware:**

- **Meet** — everything from the already‑loaded `row.data` blob (the source
  `_meet_setup` reads), **zero new queries**:
  - `total` = `len(data["matches"])`; `scheduled` = number of
    `data["schedule"]["assignments"]`.
  - `next_up` = the next ≤3 scheduled assignments by `slot_id` (skipping
    finished), each resolved: `code` from the match's `matchNumber` (`"M{n}"`),
    `time_label` from `config.dayStart + slot*config.intervalMinutes`,
    `court_label` from the assignment's court, `status` = `"scheduled"`
    (schedule‑derivable only — see `NextMatchDTO` note).
- **Bracket** — `total` = `counts.bracket_matches` (already grouped). `scheduled`
  + `next_up` come from bracket assignments; **plan step 0 verifies where they
  persist**: if in the `row.data` bracket‑session blob (like meet) it is free;
  if in a table, add one grouped `scheduled` count and cap next‑up work. Bracket
  next‑up labels use the play‑unit code (`buildPlayUnitLabels` grammar) and its
  assignment slot/court; `time_label` uses the bracket session `start_time` +
  `interval_minutes` (may be `None` → time hidden).
- `to_do` = `len(attention)` (already computed) for both kinds.

**Guardrail:** the list path must stay free of per‑row queries. Meet adds none;
bracket adds at most one grouped count. A test asserts the summary/list query
count does not grow per workspace.

Frontend DTO (`api/dto.ts`) mirrors these additively. No new route; the module
contract's endpoint list is unchanged (same `listTournaments`, richer body).

### 2. Frontend — the list (`HubPage.tsx`, `WorkspaceRow.tsx`)

- **Tabs row:** keep the facet chips; render **Needs attention** as a badge‑pill
  (amber count). Add a **sort control** at the row's right edge —
  `Recent first ▾` opening Recent / Event date / Name. Sort state lives in
  `HubPage`; the comparator is a pure, tested helper (`hubSort.ts`): Recent =
  `updatedAt` desc; Event date = the existing `sortWorkspaces` order; Name =
  locale name asc. Applied after the facet filter.
- **Row grammar** (`WorkspaceRow`): `Date(54) · [health dot] Workspace · Modules(108) · Next action(150)`.
  Selected row = `border-l-2 border-accent` + `bg-surface-card`.
  - **Health dot:** 7px, `status-live`(good)/`status-called`(attention)/muted
    (draft·archived). Static.
  - **Modules column (new):** per enabled module a 18px rounded glyph
    (`M`/`D`/`B`) tinted `bg-module-*/16 text-module-*`; an available‑not‑enabled
    module renders a **dashed** outline glyph. Driven by `tournament.modules`
    (already on the summary). A small pure `moduleGlyphs(modules)` helper +
    test. This re‑adds per‑row chips removed in Phase 13 (the Phase‑13 test that
    asserts *no* row chips is updated — a requested behavior change).
- **Footer summary bar** (`HubPage`): `N workspaces · N need attention · N archived`
  + `Updated {relative}`; counts from the loaded list, time from the last
  refresh timestamp (state in `HubPage`).

### 3. Frontend — the inspector (`WorkspaceInspector.tsx`, 344px)

- **Header:** name + `SUN JUL 12 2026 · 4 COURTS` meta + a **status pill**
  (`● Ready` `status-live` when readiness complete & health good, else
  `Needs setup` `status-called`). Reuses the shared `StatusPill`.
- **Actions:** `Open workspace →` (glow `Button`) + a gear icon button → settings.
- **Metrics — "This event":** the existing grid‑lines triplet, now
  `matches / scheduled / to do` (to‑do amber) from `signals.matches`. Falls back
  to `—` when `matches` is absent (older payload).
- **Readiness:** a **progress bar** (`ready/total`, % fill `status-live`) above
  the existing 2‑col setup checklist (`signals.setup`).
- **Modules:** the existing enabled/available rows, restyled to the doc's chip
  rows (colored square + name + ENABLED/AVAILABLE).
- **Next up:** ≤3 rows `[M] MS1 · 09:30 · Court 1 · Sched` from `signals.nextUp`;
  the section is hidden when the list is empty. A small `NextUpList` sub‑unit +
  test.

### 4. Tokens / theming

Pure design‑system tokens only — the mockup's `--sw-*`/`--dash-*`/`--surface-*`
map 1:1 to ours (`module-meet/bracket/display`, `status-live/called/started`,
the surface + ink ramp). No inline styles; both themes; reduced‑motion safe.

## Component boundaries (isolation)

| Unit | Purpose | Depends on |
| --- | --- | --- |
| `NextMatchDTO`/`MatchMetricsDTO` + `build_signals` extension | compute per‑workspace match metrics + next‑up | `row.data` (meet), `RowCounts` (bracket) |
| `hubSort.ts` | pure sort comparator (Recent/Date/Name) | summary DTO |
| `moduleGlyphs.ts` | modules[] → row glyph descriptors | `WorkspaceModuleDTO` |
| `NextUpList.tsx` | render ≤3 next matches | `NextMatchDTO[]` |
| `SortControl.tsx` | dropdown for sort order | `HubSortId` |
| `WorkspaceRow` / `WorkspaceInspector` / `HubPage` | compose the above | the units above |

## Back‑compat invariants (each pinned by a test)

- New DTO fields optional; a payload without `matches`/`nextUp` renders (tiles →
  `—`, Next up hidden). **Zero Alembic migrations.**
- List endpoint gains **no per‑row query** (query‑count test).
- The Phase‑13 facets, flat sort, Active/Draft status semantics, and the
  rail‑only avatar are unchanged.
- `sortWorkspaces` stays green (Event‑date order reuses it).

## Testing

- **Backend** (`workspace_signals` / list route): meet metrics + next‑up from a
  seeded `data` blob (total/scheduled/time/court/code); bracket metrics; undated
  / unconfigured / archived → empty next‑up; `to_do == len(attention)`; the
  query‑count guardrail.
- **Frontend:** `hubSort`, `moduleGlyphs`, `NextUpList`, `SortControl` units;
  updated `WorkspaceRow` (modules column + dot), `WorkspaceInspector` (metrics /
  readiness bar / next‑up / status pill), `HubPage` (sort + footer). The
  Phase‑13 "rows carry NO module chips" test is inverted to assert the column.
- **Gates:** frontend vitest + `tsc -b` + eslint 0‑err; backend ruff‑F + pytest;
  live Playwright pass vs the doc (both themes: row grammar, modules glyphs,
  inspector metrics/readiness/next‑up, sort, footer).

## Non‑goals / YAGNI

- No per‑row *live* operational status (dots are health; decided).
- No command‑bar avatar (rail‑only; decided).
- No denormalized match‑count columns (compute from loaded data; approach A).
- No new backend route; the data rides the existing summary.
- No change to Operations/Display or the schedule engine.

## Open verification (plan step 0)

Where bracket play‑unit **assignments** (slot/court) persist — `row.data`
bracket‑session blob vs a table — decides whether bracket `scheduled`/`next_up`
is free (blob) or needs one added grouped count. Verify before writing the
bracket computation; keep the N+1 guardrail either way.
