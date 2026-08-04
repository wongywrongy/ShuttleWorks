# Meet ⇄ Bracket Unification — Design

**Date:** 2026-07-14
**Status:** Approved (brainstorm complete)
**Scope:** Match-list visual/functional parity, Draws page cards → dense table, unified engine configuration (shared + wired), backend-enforced "Schedule locked — edits will clear schedule".

## Problem

Meet and Bracket produce the same kind of matches from the same CP-SAT engine, yet:

1. **Match lists diverge.** Bracket's Matches tab shows a Status column (Done/Live/Ready/Pending) and an event-code chip on group headers; Meet's shows neither. Row density, interaction polish, and search behavior also differ.
2. **Draws is a card grid** while every other information surface is a dense `BandedTable`.
3. **Engine config diverges oddly.** Both Engine tabs write the same tournament config blob, but Meet exposes timing/solver/optimization options Bracket lacks — and Bracket's scheduling path ignores most shared params (`default_rest_slots`, `freeze_horizon_slots`, `break_slots`, solver params, objective weights).
4. **"Schedule locked" is mostly a frontend fiction.** Meet: store flags + client-side clear, backend 409 only for venue fields. Bracket: UI-derived hook, no backend flag; only per-draw draft-only PATCH is enforced.

## Decisions (from brainstorm)

- Meet keeps inline editing; Bracket rows stay read-only. Parity is visual + semantic, not editability.
- Meet status uses the same 4-state derivation as Bracket (Pending/Ready/Live/Done).
- Both tables get a compactness/polish pass (shared row chrome).
- Bracket gains contingency actions (injury/retirement, walkover, forfeit); backend routing logic may be deferred to a follow-up if non-trivial.
- Draws: table with **inline action buttons**; participant picker moves to the DetailPanel.
- Config unification is **fully shared and wired** — Bracket consumes the params it currently ignores.
- Lock model: **409 CONFIG_LOCKED + explicit retry with `clearSchedule: true`**, atomic clear-and-apply, same contract both modules; started draws are hard-locked (`409 DRAW_STARTED`, no override).

## Section 1 — Match list parity

### Shared primitives (new/moved into `components/control-plane/`)

- **`matchStatus.ts`** moves from `products/bracket/` to `components/control-plane/`: type `MatchStatus = 'pending' | 'ready' | 'live' | 'done'`, `STATUS_LABEL`, `STATUS_CLASS`. Both match tabs and both detail panels import it. (`products/` may import `components/`; products may not import each other — depcruise.)
- **`MATCH_LIST_COLUMNS`** shared column spec: warning gutter (w-4) · `#` (w-8) · Event (w-20) · Side A (flex-3) · Side B (flex-3) · Status (right-aligned, ~w-5.5rem) · action gutter (w-8). Meet's action gutter hosts the two-click delete; Bracket's hosts the contingency overflow menu.
- **Density/polish pass** on `BANDED_ROW_CLASSES` / `BandedTable` row chrome: tighter vertical padding, consistent hover/focus affordances. Benefits Matches (both), Roster, and the new Draws table from one change.

### Meet changes (`products/meet/matches/`)

- **Status column** derived client-side (no new backend surface):
  - no schedule assignment → `pending`
  - assignment exists → `ready`
  - Operations match-state `called`/`playing`(`started`) → `live`
  - `finished`/`retired` → `done`
  - Implemented as a selector over store schedule assignments + match-states map.
- **Group band `code` chip**: discipline bands pass `code` (MS/WS/MD/WD/XD) so `GroupBandHeader` renders the same accent chip Bracket has.
- **Detail panel** gains the read-only Status pill (same component/classes as Bracket's).
- Inline editing (event select, player editors, delete) unchanged.

### Bracket changes (`products/bracket/`)

- `BracketMatchesTab` adopts the shared column spec + shared `matchStatus` (import path change; behavior identical).
- **Search becomes URL-backed `?q=`** (parity with Meet).
- **Contingency actions**: per-row overflow menu (action gutter) + detail-panel buttons for:
  - **Walkover** — result model already supports it (`ResultDTO.walkover`, walkover→BYE loser-routing policy exists).
  - **Injury/retirement** and **forfeit** — UI + command contract now; backend routing rules deferred to a follow-up if non-trivial.
  - All flow through the idempotent `POST /bracket/commands` path (never legacy `/bracket/results`).

### Drift protection

Parity unit test asserting: both tabs consume the shared column spec; both use the shared status vocabulary/classes.

## Section 2 — Draws as a dense table

`BracketDrawsTab` replaces the card grid with a `BandedTable`, grouped by discipline, one row per draw.

**Columns:** Code (`ev.id`) · Format · Size (`targetSize`) · Entered (`n/target`, amber when short) · Progress (compact done/live/ready/pend strip) · Status pill (Draft/Generated/Started/Completed — existing derivation) · Actions.

**Inline actions per row** (existing rules preserved):
- Generate (draft, enabled only when `entered == target`) / Re-generate (two-click confirm via `useConfirmClick`); started → disabled "— locked".
- Configure (draft only) → existing `DrawConfigModal`.
- Next round (Swiss + generated, disabled until round complete).
- Open draw → navigates to the draw view.

**Row click** opens the standard right-docked `DetailPanel` containing the **participant picker** (relocated from the card) and a config summary.

"＋ New draw" stays in the actions bar with the existing format-grid `NewDrawModal`.

## Section 3 — Unified engine configuration

**Insight:** Bracket's Engine tab already writes the same `data["config"]` blob as Meet (that's how scoring is shared). Engine config is one per-workspace object; unification = one component rendering all of it in both modules.

### Frontend

- One schema-driven **shared `EngineSettings`** in `platform/settings/` (beside `ConfigSurface`/`ScoringFields`), rendered by both modules. Groups:
  1. **Scoring** — existing `ScoringFields` (score type, points/set, best-of, deuce).
  2. **Timing** — rest between matches (minutes), optional break window, and **rest between rounds (slots)** declared `modules: ['bracket']` in the schema (rendered only in Bracket, inside the same group). Module-specific knobs are a declared schema exception, not drift.
  3. **Solver** — reproducible run (`deterministic`), time limit, freeze horizon.
  4. **Optimization goals** — court utilisation (+weight slider), game spacing, compact schedule, allow player overlap.
- Events tab stays module-specific (Meet lineup counts vs Bracket draws summary) but adopts the same section layout/grammar.
- Per-draw format knobs remain in `formatRegistry` (draw structure, not engine config).

### Backend wiring

- Extract config→`ScheduleConfig` assembly from `adapters/badminton.py` (`schedule_config_from_dto` — it reads only the shared tournament config) into the shared `services/scheduling/` seam.
- `brackets.py` uses the shared assembly instead of hand-rolled `_pick` reads, thereby consuming: `default_rest_slots`, `freeze_horizon_slots`, `break_slots`, solver time limit/`deterministic`, and objective weights.
- Bracket keeps explicit overrides on top: session-derived `total_slots`, meet-coexistence `closed_court_windows` (`_meet_occupied_windows`). `restBetweenRounds` continues as bracket session structure.

## Section 4 — Backend schedule lock

One contract, one enforcement point, both modules.

- **Field classification:** backend owns the scheduling-relevant field list (complement of today's frontend `NON_SCHEDULING_KEYS`: scoring/display/tv* fields never lock). A parity test pins the frontend copy to the backend list.
- **Contract** (generalizes the existing venue-fields-only CONFIG_LOCKED in `put_tournament_state`):
  - Write touching a scheduling field while a committed schedule with assignments exists → **`409 CONFIG_LOCKED`**, payload naming offending fields and the schedule(s) that would be cleared.
  - Retry with **`clearSchedule: true`** → backend atomically clears schedule(s) and applies the edit in one transaction.
  - Bracket rides the same enforcement point (its engine config flows through the same tournament-state PUT); a bracket schedule with assignments locks identically and is cleared by the same flag.
  - **Hard lock:** a started draw (results exist) is never clearable — `409 DRAW_STARTED`, no override. Per-draw config PATCH keeps its draft-only 409.
- **Frontend:** one shared lock-guard flow driven by the 409 (confirm modal → retry with flag), replacing Meet's store-only unlock/clear and Bracket's UI-only disable. `ScheduleLockIndicator` ("Schedule locked — edits will clear schedule") on both Engine tabs. Client-side lock hints remain for UX; the server is the source of truth.

## Testing

- **pytest:** lock contract (409 payload shape, atomic clear-and-apply, DRAW_STARTED hard lock, non-scheduling fields pass through); bracket schedule consumes shared `ScheduleConfig` params (rest/freeze/breaks/solver/weights).
- **vitest:** Meet status derivation selector; column-spec + status-vocabulary parity test; draws table action enable/disable rules; lock-guard 409→confirm→retry flow.
- **Contract/baselines:** `moduleContract.ts` + test baselines updated where endpoint references or shared components move; depcruise stays clean (shared code lands in `components/control-plane/` and `platform/settings/`).

## Out of scope / deferred

- Backend routing rules for injury-retirement and forfeit (beyond command contract + UI) — follow-up if non-trivial; log to debt-log if deferred.
- Merging match records across modules (ADR 0006 stands — records stay separate; this is presentation + config unification).
- Operations→Bracket advancement seam remains deliberately unwired.
