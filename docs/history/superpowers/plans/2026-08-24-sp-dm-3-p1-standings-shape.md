# SP-DM-3 · P1 — One standings shape

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standings is declared **nine** times (8 typed + 1 untyped) across four trees, in **two grains** — `groupId` (a school) and a participant — while the *computation* is already single-authority. P1 collapses the declarations to **one backend row shape per grain**, gives the two untyped public display routes a `response_model`, and makes every surviving frontend spelling either **generated** (console) or **parity-checked** (entrant). **No migrations** (standings are derived, never persisted). **No wire keys change on any route** — the unification is in DECLARATIONS, not values, and a key-set test is what proves it.

**Ruled by:** no new ruling. P1 is a mechanism consumer: R-DM-9(a)'s parity oracle (installed by P0) is what makes a shape rename safe to perform, and R-DM-9(c) ("import the generated types directly, delete the hand mirror — the eventual end-state once divergences reach zero") is what authorizes the two console aliases in Task 3, for the two shapes whose divergence count is already **zero**.

Resolves `F-DM-26` (nine declarations) and `F-DM-30` (two untyped public read routes). Preserves `F-DM-71` (public projections gate at the query and are strict allow-lists — the new key-set tests are that discipline made machine-checked rather than prose).

**Branch (controller ruling, 2026-08-24):** `dm3/p1-standings-shape` stacked **off `dm3/p0-type-mechanism` @ `9c5e6186`**, *not* off `main`. P1 is gated on P0's parity oracle and interacts with all three of its halves (see *Oracle interactions* below); a branch off `main` would have no oracle to red.

```bash
git checkout dm3/p0-type-mechanism && git checkout -b dm3/p1-standings-shape
```

**Spec pointers:**
- Program card **§C1**: `docs/history/superpowers/plans/2026-08-24-sp-dm-3-domain-unification-program.md:46-47`.
- Design doc **P1 phase text**: `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md:113-120`.
- Audit findings: `docs/history/audits/2026-08-24-domain-model-audit.md:478` (F-DM-26), `:483` (F-DM-30), `:536` (F-DM-71), and the evidence row `:166` (conflict **C-3**, which is where the "8 typed + 1 untyped" count is derived).
- Model for the key-set test: `tests/backend/test_season_listing.py:14,107` (`ROW_KEYS` + `set(row) == ROW_KEYS`).
- The oracle P1 leans on: `apps/console/src/api/__tests__/dtoParity.test.ts`, `apps/entrant/tests/dtoParity.test.ts`, `tests/backend/test_dto_generated_freshness.py`.

---

## Global Constraints

These bind P1 exactly as they bind every phase (program plan `:13-22`):

- **No phase re-decides anything ruled.** No FK anywhere in this slice (R2); **no match-record merge and no shared match/score value object (ADR 0006)** — relevant here because `StandingRow` sits next to `Result`/`MatchScore` and the temptation to "while I'm here" a score shape must be refused; no rename of `tournaments`/`tournament_id`/`tournamentStore` (ADR 0014); the 2026-08-23 minting rule is untouched.
- **The F-DM-11 test-schema trap** does not apply (no FKs, no migrations in this slice) — noted so a later reader does not go looking.
- Backend list queries: stable tiebreaker `created_at DESC, id DESC` — not touched here (standings sort by their own ranking keys, both of which already carry a deterministic final tiebreaker: `groupId` for the meet grain, `participant_id` for the participant grain).
- Commits are **path-limited** (`git commit -- <paths>`); never `git add .`.
- Gate before claiming done: the specific suite for the change, then `make check` at slice end.
- Console DTO changes: `make generate-api`, then reconcile `apps/console/src/api/dto.ts` **by hand**. P0 made that reconciliation machine-checked; P1 removes the hand step for exactly two shapes by aliasing them.
- **P1-specific — behavior preservation is the hard constraint.** Every route's **wire key set is identical before and after**. Where a route's keys *would* change to unify a declaration, the unification does not happen and the plan says so (Task 5 records the two such places). If a step forces a key change, **stop and report**; do not edit a test to match.

### Oracle interactions (read before Task 1 — these are what makes P1 different from P0)

1. **The backend freshness pytest reds in its `generated-not-live` direction the moment a response model is renamed or deleted.** Its own docstring predicted this slice: *"P1 renames standings DTOs, so this direction is not hypothetical."* The fix is always `make generate-api` + commit the regenerated file **in the same commit as the schema change** — never a test edit. Tasks 2 and 4 schedule that explicitly. Task 1 does **not** need it (nothing it touches reaches OpenAPI).
2. **`make generate-api` calls bare `python`.** The repo `.venv` is not on PATH by default on this box, so the target dies at step 1. Run it as:
   ```bash
   PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api
   ```
   (debt-logged during P0; this is the standing workaround, not a fix.)
3. **The console oracle's floors are `generated >= 175`, `hand >= 64`, `pairs >= 57`.** They are documented "lower freely when shapes are deliberately deleted". Task 3 removes one shape from `dto.ts`, so it lowers `hand` to 63 and `pairs` to 56 **in the same commit**, and updates the honest "Actuals today" comment above them. Raising a floor is never part of this slice.
4. **`UNPAIRED` has an exhaustiveness test** (`noTwin.sort()` must equal `Object.keys(UNPAIRED).sort()`). Task 3's alias makes `MeetStandingRowDTO` vanish from `hand` entirely — it lands in neither list, which is correct and needs no `UNPAIRED` entry. If it somehow lands in `noTwin`, the `parseHand` regex matched the alias line and the alias was written wrong (it must contain no `{`).
5. **The allow-list is untouched.** No allow-list entry names a standings shape today (its six clusters are `PlayerDTO`, `MatchStateDTO`, `RosterGroupDTO`, `MatchDTO`, `TournamentStateDTO`, `InviteCreatedDTO`), so P1 closes no allow-listed divergence and the cap **stays 19**. Verify with `rg -i standing apps/console/src/api/__tests__/dtoParity.allowlist.json` → 0 hits. If that ever returns a hit, delete the line and lower the cap by exactly that many in the same commit.
6. **The entrant oracle needs no change.** Its `PAIRS` entry `StandingRowDTO: 'StandingRowDTO'` (`apps/entrant/tests/dtoParity.test.ts:116`) points at the schema generated from `entries/entries_site.py:StandingRowDTO`, which **survives P1 unchanged** (Task 5 records why). The rename in Task 2 touches `StandingRowOut`, a different schema the entrant tier does not mirror.

**Run commands (this repo):**
- backend pytest (repo root): `.venv/Scripts/python.exe -m pytest tests/backend/unit/test_meet_standings.py -q`
- console vitest: `npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts`
- console type gate: `npm --prefix apps/console run build` (runs `tsc -b`)
- entrant vitest: `npm --prefix apps/entrant run test:run -- tests/dtoParity.test.ts`
- regenerate: `PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api`
- knip: `npm --prefix apps/console run knip`
- full gate: `make check`

**Line numbers are anchored to `9c5e6186`. Re-anchor by symbol, not line, if the tree has moved.**

---

## The nine, and what happens to each

Verified at `9c5e6186` with
`rg -n "^class (Meet)?Standing|^export interface (Meet)?Standing" apps packages --glob '!**/dto.generated.ts'` → **8 lines**; the ninth is the untyped `payload["standings"]` dict at `display/display.py:199`, which has no declaration line to match.

| # | Declaration | Grain | Fate |
|---|---|---|---|
| 1 | `apps/api/src/meet/standings.py:31` `StandingRow` (dataclass) | groupId | **DELETED** (Task 1) — `compute_meet_standings` returns `MeetStandingRowDTO` |
| 2 | `apps/api/src/core/schemas.py:995` `MeetStandingRowDTO` (StrictModel) | groupId | **SURVIVES — the one groupId shape** |
| 3 | `apps/api/src/bracket/brackets.py:323` `StandingRowOut` (BaseModel) | participant | **DELETED** (Task 2) — `EventOut.standings` takes `StandingRow` directly |
| 4 | `apps/api/src/bracket/standings.py:52` `StandingRow` (dataclass) | participant | **SURVIVES — the one participant shape** |
| 5 | `apps/api/src/entries/entries_site.py:166` `StandingRowDTO` (BaseModel) | participant | **SURVIVES** — the public entrant projection; camelCase + `participantKey` + `history`. Collapsing it would change public wire keys → out of scope (Task 5) |
| 6 | `apps/console/src/api/dto.ts:461` `MeetStandingRowDTO` | groupId | **GENERATED** (Task 3) — `components["schemas"]["MeetStandingRowDTO"]` |
| 7 | `apps/console/src/api/bracketDto.ts:130` `StandingRowDTO` | participant | **GENERATED** (Task 3) — `Required<components["schemas"]["StandingRow"]>` |
| 8 | `apps/entrant/app/lib/draws.types.ts:64` `StandingRowDTO` | participant | **SURVIVES** — cannot import the console package's generated file across app boundaries; its P0 parity pair is the substitute (Task 5) |
| 9 | `apps/api/src/display/display.py:199` untyped `payload["standings"]` | groupId | **TYPED** (Task 4) — `DisplayStateDTO.standings: List[MeetStandingRowDTO]` |

**Deletion gate: 9 → 4** (rows 2, 4, 5, 8). See Task 5 Step 1 for the exact command and the two flagged deltas from the card's "≤3".

---

## File map

| File | Change |
|---|---|
| `apps/api/src/meet/standings.py` | Delete the `StandingRow` dataclass; import + return `core.schemas.MeetStandingRowDTO`. |
| `apps/api/src/workspaces/tournaments.py` | `_meet_standings_for` stops re-mapping row → DTO. |
| `tests/backend/unit/test_meet_standings.py` | Rename-only: `StandingRow` → `MeetStandingRowDTO`. |
| `apps/api/src/bracket/brackets.py` | **Delete** `StandingRowOut`; `EventOut.standings: Optional[List[StandingRow]]`; delete the 10-line re-map in `_serialize_session`. |
| `apps/console/src/api/dto.ts` | `MeetStandingRowDTO` becomes a generated alias. |
| `apps/console/src/api/bracketDto.ts` | `StandingRowDTO` becomes a generated alias. |
| `apps/console/src/api/__tests__/dtoParity.test.ts` | Lower `hand`/`pairs` floors; refresh the "Actuals today" and knip-justification comments. |
| `apps/console/knip.json` | Re-justify (or drop) the `dto.generated.ts` ignore — it now has an importer. |
| `apps/api/src/display/display.py` | `DisplayStateDTO` (new); `response_model` on `/state` and `/bracket`. |
| `tests/backend/test_display_public.py` | New key-set tests (F-DM-30 / F-DM-71). |
| `apps/console/src/api/dto.generated.ts` | Regenerated in Tasks 2 and 4 (never hand-edited). |
| `docs/history/programs/DM3_PROGRESS.md`, `docs/reference/debt-log.md` | Ledger + the two recorded ceilings. |

**Not in scope, recorded:** `apps/api/src/bracket/formats/swiss.py:214` consumes `Sequence[StandingRow]` read-only and needs **no change**. `apps/api/src/entries/entries_site.py`'s standings *construction* (`:637-651`) keeps its explicit field mapping — it is the camelCase projection boundary, not duplication.

---

### Task 1: One groupId-grain shape (`meet.standings` stops declaring its own)

**Files:**
- Modify: `apps/api/src/meet/standings.py` (`:26` import, `:30-36` dataclass, `:65` return type, `:116-126` construction)
- Modify: `apps/api/src/workspaces/tournaments.py` (`_meet_standings_for`, `:177-232`)
- Modify: `tests/backend/unit/test_meet_standings.py` (`:11`, `:21-22`, and every other `StandingRow(` in the file)

**Interfaces:**
- Consumes: `core.schemas.MeetStandingRowDTO` (exists, unchanged). The import direction is **allowed**: `meet` → `core` is a domain reaching the shared kernel (`apps/api/.importlinter` contract *meet-independence* forbids only other domains; contract *kernel-direction* forbids the reverse arrow, which this is not). `core/schemas.py` imports only `uuid`, `typing`, `pydantic`, `enum` and `core.limits` — verified at `9c5e6186` — so `meet/standings.py` keeps its documented "pure, no DB/session" property.
- Produces: `compute_meet_standings(...) -> list[MeetStandingRowDTO]`. Task 4 relies on that exact return type.

**No `make generate-api` in this task** — `MeetStandingRowDTO` is unchanged and nothing here reaches the OpenAPI document.

- [ ] **Step 1: Pin the behavior first (characterization, expected GREEN)**

Run: `.venv/Scripts/python.exe -m pytest tests/backend/unit/test_meet_standings.py tests/backend/test_tournaments.py -q`
Expected: PASS. Record the pass count. This is a behavior-preserving refactor, so the existing suite **is** the test: it must be as green after Task 1 as before, with only type *names* changed.

- [ ] **Step 2: Swap the shape** — in `apps/api/src/meet/standings.py`:

Replace the `dataclasses` import (`:26`) and the class (`:30-36`) with:

```python
from core.schemas import MeetStandingRowDTO
```

placed after the `from __future__` / `typing` imports, and add to the module docstring, directly above the final paragraph:

```
The row shape is ``core.schemas.MeetStandingRowDTO`` — the wire DTO itself,
not a private mirror of it (SP-DM-3 P1, F-DM-26: standings was declared nine
times in two grains). This module owns the *computation*; the kernel owns the
*shape*, because ``TournamentStateDTO`` embeds it and the kernel may not
import a domain (see ``apps/api/.importlinter``, kernel-direction). Importing
the kernel costs this module nothing it did not already have: ``core.schemas``
reaches pydantic and ``core.limits`` and nothing else, so the "pure, no
DB/session" promise above still holds.
```

Change the return annotation (`:65`) to `-> list[MeetStandingRowDTO]:` and the construction (`:116-126`) to build `MeetStandingRowDTO(...)` with the **same five keyword arguments** (`groupId`, `groupName`, `matchesPlayed`, `wins`, `losses` — the DTO's field names are already exactly the dataclass's). The `rows.sort(key=lambda r: (-r.wins, r.losses, r.groupId))` line is unchanged; attribute access is identical on a pydantic model.

- [ ] **Step 3: Delete the re-map** — in `apps/api/src/workspaces/tournaments.py`, `_meet_standings_for` currently computes rows then rebuilds each one field-by-field into the DTO (`:220-232`). Replace the trailing `return [MeetStandingRowDTO(...) for r in standing_rows]` with:

```python
    # ``compute_meet_standings`` returns the wire DTO itself since SP-DM-3 P1
    # (F-DM-26) - there is no private row shape left to translate from.
    return compute_meet_standings(
        matches=matches,
        match_states=match_states,
        groups=groups,
        players=players,
    )
```

and delete the now-unused `standing_rows = compute_meet_standings(...)` assignment above it, keeping the "Standings intentionally count every finished, scored match…" comment attached to the surviving call.

- [ ] **Step 4: Rename in the unit test (a type rename, NOT an assertion change)** — in `tests/backend/unit/test_meet_standings.py` change the import (`:11`) to `from meet.standings import compute_meet_standings` plus `from core.schemas import MeetStandingRowDTO`, and replace every `StandingRow(` construction with `MeetStandingRowDTO(`. **No assertion text, expected value or field name changes.** If any assertion needs editing to stay green, **stop and report** — that means the shapes were not field-identical and the refactor is not behavior-preserving.

- [ ] **Step 5: Run the backend gates**

```bash
.venv/Scripts/python.exe -m pytest tests/backend/unit/test_meet_standings.py tests/backend/test_tournaments.py tests/backend/test_display_public.py -q
.venv/Scripts/python.exe -m pytest tests/backend/test_dto_generated_freshness.py -q
cd apps/api/src && lint-imports --config ../.importlinter
```
Expected: all green, same pass count as Step 1. Freshness green **without regenerating** — that is the proof this task never touched the wire.

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(meet): standings computes the wire DTO, one groupId row shape (F-DM-26)" -- apps/api/src/meet/standings.py apps/api/src/workspaces/tournaments.py tests/backend/unit/test_meet_standings.py
```

---

### Task 2: One participant-grain shape (`StandingRowOut` deleted)

**Files:**
- Modify: `apps/api/src/bracket/brackets.py` (`:323-336` delete, `:352` annotation, `:1125-1142` re-map, imports at the top)
- Regenerate: `apps/console/src/api/dto.generated.ts`

**Interfaces:**
- Consumes: `bracket.standings.StandingRow` (frozen-free mutable dataclass, `:51-63`) — **used directly as a pydantic field type**. Verified at `9c5e6186` against the repo `.venv`: a vanilla stdlib dataclass as a `BaseModel` field lands in `components.schemas` under its own class name (`StandingRow`) with the correct properties, and `model_dump()` emits **all** fields. No `arbitrary_types_allowed`, no pydantic import in `standings.py` — the module stays a plain, engine-adjacent computation.
- Produces: the OpenAPI schema **rename** `StandingRowOut` → `StandingRow`. Task 3 consumes that exact name.

**Wire keys:** identical. `StandingRowOut`'s nine fields and `StandingRow`'s nine fields are the same names in the same order, and the serialized payload already came from a `StandingRow` field-by-field.

**The one recorded ceiling:** `StandingRow`'s eight defaulted fields (`played=0` … `position=0`) render as **not required** in OpenAPI, where `StandingRowOut` declared them required. The *values* are unchanged — the backend always serializes all nine — but the generated TS becomes `played?: number`. Task 3's console alias wraps `Required<…>` to keep consumers honest. Making the backend schema required again would mean a `BaseModel` in `standings.py` plus explicit zeros at `standings.py:79` and in `tests/backend/unit/test_swiss_round_route.py:33`; that is the fallback if Step 2 fails, not the default.

- [ ] **Step 1: Pin the current wire (characterization, expected GREEN)**

```bash
.venv/Scripts/python.exe -m pytest tests/backend -q -k "standing or swiss or round_robin"
```
Expected: PASS. Record the pass count and the names of the tests that assert standings payload keys — those are the ones that must stay green untouched.

- [ ] **Step 2: Delete `StandingRowOut`** — in `apps/api/src/bracket/brackets.py`:

1. Add `StandingRow` to the existing `from .standings import compute_standings` import (locate by symbol).
2. Delete `class StandingRowOut(BaseModel):` and its whole body (`:323-336`).
3. `EventOut.standings` (`:352`) becomes:

```python
    # Computed standings, embedded only for ``has_standings`` formats
    # (round robin, Swiss) - rides the existing poll so Display gets it
    # free and Swiss pairing consumes the same numbers the client sees.
    # The row type is ``bracket.standings.StandingRow`` itself since
    # SP-DM-3 P1 (F-DM-26): pydantic serializes a stdlib dataclass field
    # natively, so the wire shape and the computation shape are one
    # declaration. Its defaulted fields render as OPTIONAL in OpenAPI
    # (they were required under the deleted ``StandingRowOut`` mirror);
    # the backend still always emits all nine, and the console alias
    # wraps ``Required<>`` to say so.
    standings: Optional[List[StandingRow]] = None
```

4. In `_serialize_session` (`:1125-1142`), replace the nine-field re-map with:

```python
        spec = get_format(meta.format) if meta else None
        standings_out: Optional[List[StandingRow]] = None
        if spec is not None and spec.has_standings:
            standings_out = compute_standings(
                draw.play_units, state.results, list(draw.participants)
            )
```

- [ ] **Step 3: Run the backend, then regenerate — in this order**

```bash
.venv/Scripts/python.exe -m pytest tests/backend -q -k "standing or swiss or round_robin"
.venv/Scripts/python.exe -m pytest tests/backend/test_dto_generated_freshness.py -q
```
Expected: the first is green with the **same pass count as Step 1**; the second is **RED** on the `generated-not-live` direction — `StandingRowOut` no longer exists in the app and `StandingRow` is not yet in the generated file. That red is the oracle doing exactly what its docstring promised for this slice. **Record the failure text for the ledger.**

Then:
```bash
PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api
git diff --stat apps/console/src/api/dto.generated.ts
.venv/Scripts/python.exe -m pytest tests/backend/test_dto_generated_freshness.py -q
```
Expected: the diff renames the schema and touches the two `$ref`s to it; freshness back to **3 passed**. Inspect the diff before committing — anything beyond the `StandingRowOut` → `StandingRow` rename, its optionality markers and its `$ref`s means something else drifted and must be reported.

- [ ] **Step 4: The console still compiles against the OLD hand type (expected)**

Run: `npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts`
Expected: **PASS** — `bracketDto.ts` is not one of the oracle's inputs, so nothing reds here. That is itself the finding Task 3 closes: the console's bracket mirror is un-policed today.

- [ ] **Step 5: Commit (schema change + regeneration together — never split)**

```bash
git commit -m "refactor(bracket): EventOut embeds StandingRow directly, delete StandingRowOut (F-DM-26)" -- apps/api/src/bracket/brackets.py apps/console/src/api/dto.generated.ts
```

---

### Task 3: The two console mirrors become generated (R-DM-9(c), for two zero-divergence shapes)

**Files:**
- Modify: `apps/console/src/api/dto.ts` (`:454-467`)
- Modify: `apps/console/src/api/bracketDto.ts` (`:128-140`, imports at the top)
- Modify: `apps/console/src/api/__tests__/dtoParity.test.ts` (floors + two comment blocks)
- Modify: `apps/console/knip.json`

**Interfaces:**
- Consumes: generated schemas `MeetStandingRowDTO` (all five fields required — verified `dto.generated.ts:4861`) and `StandingRow` (produced by Task 2).
- Produces: `dto.ts` exports `MeetStandingRowDTO` and `bracketDto.ts` exports `StandingRowDTO` under the **same names as today**, so no consumer import changes. Consumers verified at `9c5e6186`: `store/tournamentStore.ts:14,69,118`, `modules/display/publicDisplay/StandingsView.tsx`, `modules/display/__tests__/MeetDisplayPage.standings.test.tsx`, `modules/bracket/StandingsTable.tsx`, `modules/bracket/DrawView.tsx:13,1329`, `modules/bracket/__tests__/{StandingsTable,DrawView.swiss}.test.tsx`. `platform/contracts/moduleContract.ts:45-57` imports six bracket DTOs and **neither** standings type — verified, so the module contract test is untouched.

**Why aliasing and not "teach the oracle to read `bracketDto.ts`":** extending `dtoParity.test.ts`'s file list would drag ~20 more hand types into pairing, each needing an `UNPAIRED` entry or a real pair, and any key divergence among them would need **new allow-list lines** — but the allow-list cap (19) may only shrink; raising it is a ruling. That path structurally violates P0's ratchet to close one shape. A generated alias cannot diverge at all, which is the stronger form of the card's "generated/parity-checked", and it is a four-line diff.

- [ ] **Step 1: Alias in `dto.ts`** — replace the `export interface MeetStandingRowDTO { … }` block (`:461-467`), keeping its existing doc comment above, with:

```typescript
export type MeetStandingRowDTO = components['schemas']['MeetStandingRowDTO'];
```

and add, at the top of the file next to the existing imports:

```typescript
// SP-DM-3 P1: the two standings row shapes are taken from the generated
// OpenAPI types rather than hand-mirrored (R-DM-9(c), applied to the shapes
// whose divergence count is already zero). A generated alias cannot drift, so
// these two need no parity entry - see api/__tests__/dtoParity.test.ts.
import type { components } from './dto.generated';
```

Extend the file's existing "DO NOT EDIT THIS FILE WITHOUT VERIFYING IT MATCHES dto.generated.ts" header (`:1-15`) with one sentence: *"Two shapes no longer need that verification because they ARE the generated type: `MeetStandingRowDTO` (here) and `StandingRowDTO` (bracketDto.ts)."*

- [ ] **Step 2: Alias in `bracketDto.ts`** — replace `export interface StandingRowDTO { … }` (`:128-140`), keeping the doc comment, with:

```typescript
/** `Required<>` because the wire schema marks the eight counter fields
 *  optional (they carry dataclass defaults), while the backend always emits
 *  all nine — SP-DM-3 P1, `bracket/standings.py`. The alias tells consumers
 *  the truth the schema under-states; it never adds a key. */
export type StandingRowDTO = Required<components['schemas']['StandingRow']>;
```

plus the same `import type { components } from './dto.generated';` at the top.

- [ ] **Step 3: Type gate FIRST — this is where a wrong alias shows up**

Run: `npm --prefix apps/console run build`
Expected: **PASS.** If `StandingsTable.tsx` / `DrawView.tsx` red on possibly-undefined counters, the `Required<>` wrapper is missing or misplaced. If `tournamentStore.ts` reds, the generated `MeetStandingRowDTO` is not all-required — re-check `dto.generated.ts` and report rather than widening a consumer.

- [ ] **Step 4: Lower the oracle's floors in the same commit** — in `apps/console/src/api/__tests__/dtoParity.test.ts`:

- `expect(Object.keys(hand).length).toBeGreaterThanOrEqual(64)` → `63`
- `expect(paired.length).toBeGreaterThanOrEqual(57)` → `56`
- update the "Actuals today: 177 generated schemas, 64 hand shapes, 57 pairs" comment to the numbers the run actually reports, and append: *"`hand` and `pairs` each dropped by one in SP-DM-3 P1: `MeetStandingRowDTO` became a generated alias, so `parseHand` correctly no longer sees it (an alias line has no `{`)."*
- update the knip paragraph in the file header (`:14-21`): `dto.generated.ts` **now has an importer** (`dto.ts` and `bracketDto.ts`, type-only). Replace *"has no importer BY DESIGN"* with the reason the ignore still stands after Step 5.

Run: `npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts`
Expected: **6 passed.** Confirm the reported actuals are 63 hand / 56 pairs; if `hand` is still 64, `parseHand` matched the alias line and the alias contains a `{` it should not.

- [ ] **Step 5: knip** — `apps/console/knip.json:5` ignores `src/api/dto.generated.ts`. Try removing that entry and run `npm --prefix apps/console run knip`. Expected outcome: it **reds** on unused *exports* (`openapi-typescript` emits `paths`, `webhooks`, `operations`, `$defs`; only `components` is imported), so restore the ignore and rewrite its justification in the test-file header (knip's schema rejects unknown keys, so the note cannot live in the JSON — same constraint P0 hit). Whichever way it lands, the file's justification must match reality: **record the observed knip output** in the ledger.

Run: `npm --prefix apps/console run knip` and `npm --prefix apps/console run test:run`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(console): standings rows come from the generated types (F-DM-26, R-DM-9c)" -- apps/console/src/api/dto.ts apps/console/src/api/bracketDto.ts apps/console/src/api/__tests__/dtoParity.test.ts apps/console/knip.json
```

---

### Task 4: The two untyped display routes get a `response_model` (F-DM-30) — key-set tests first

**Files:**
- Modify: `tests/backend/test_display_public.py` (new tests beside `test_projection_is_unauthenticated_and_strips_operator_material`, `:49-81`)
- Modify: `apps/api/src/display/display.py` (`:158-201`, `:214-236`, imports)
- Regenerate: `apps/console/src/api/dto.generated.ts`

**Interfaces:**
- Consumes: `core.schemas.MeetStandingRowDTO`; `bracket.brackets.TournamentOut` (what `_serialize_session` already returns — `brackets.py:1071`). Both imports are allowed: `display` names `bracket`, `workspaces` and `operations` (contract *display-independence*), and `core` is the kernel. `TournamentOut` must move to a **module-level** import because a `response_model=` is evaluated at decoration time; there is no cycle risk — contract *nothing-names-display* forbids the reverse arrow.
- Produces: OpenAPI schema `DisplayStateDTO` (verified free of collisions at `9c5e6186`: `rg "DisplayStateDTO" apps/console/src/api/dto.generated.ts` → 0 hits) and a documented response shape on `GET /display/{token}/bracket`.

**TDD order matters and is inverted from a feature slice:** the key-set tests are written **against today's behavior and pass immediately**. That is correct for a behavior-preserving refactor — they are the instrument that proves Steps 3-4 changed nothing, so they must be green *before* the change, and green after. NC 2 of the card is satisfied by their existence (they red on any added or dropped field), not by a red-first cycle.

- [ ] **Step 1: Write the key-set tests (expected GREEN on today's code)** — append to `tests/backend/test_display_public.py`, next to the existing projection test (which asserts a **subset** with `<=`; these assert **equality**, which is the F-DM-71 discipline the card asks to preserve):

```python
# F-DM-30 / F-DM-71 (SP-DM-3 P1): the public display plane is a strict
# allow-list projection, and until P1 it was an allow-list expressed as a
# Python tuple with a prose comment naming its TS consumer. These pin the
# EXACT key sets - equality, not subset, so an added field reddens here
# rather than reaching a public screen unnoticed. Model:
# tests/backend/test_season_listing.py's ROW_KEYS.
DISPLAY_STATE_KEYS = {
    "config", "groups", "players", "matches", "schedule",
    "scheduleIsStale", "standings",
}
MEET_STANDING_ROW_KEYS = {
    "groupId", "groupName", "matchesPlayed", "wins", "losses",
}


def test_display_state_key_set_is_exact(client, workspace):
    """A blob carrying EVERY projected field plus operator-only material:
    the response is exactly the seven projected keys, no more and no fewer."""
    ...  # PUT a state containing all of config/groups/players/matches/
        # schedule/scheduleIsStale PLUS operator-only material
        # (scheduleVersion, scheduleHistory, planFinalized, bracketPlayers).
        # Crib the state fixture from test_tournaments.py:293's standings
        # test, which already builds finished, scored pool play.
    client.cookies.clear()
    body = client.get(f"/display/{token}/state").json()
    assert set(body) == DISPLAY_STATE_KEYS


def test_display_state_standings_rows_are_the_meet_grain(client, workspace):
    """The one grain the public board sees is groupId (a school), and its
    row keys are exactly MeetStandingRowDTO's - not the participant grain,
    not a superset picked up from the blob."""
    ...  # same fixture, with at least one finished+scored cross-group match
    rows = client.get(f"/display/{token}/state").json()["standings"]
    assert rows, "fixture must produce at least one standings row"
    for row in rows:
        assert set(row) == MEET_STANDING_ROW_KEYS


def test_display_bracket_key_set_is_the_serialized_session(client, workspace):
    """``/display/{token}/bracket`` returns the same projection the
    viewer-gated ``GET /bracket`` does. Pinning its top-level key set is what
    makes the response_model added in P1 provably a no-op on the wire."""
    ...  # crib the bracket fixture from
        # test_display_state_and_bracket_caches_do_not_collide (:233)
    body = client.get(f"/display/{token}/bracket").json()
    assert set(body) == {
        # fill from the ACTUAL response at execution time, then keep it
        # frozen - TournamentOut's field list is the allow-list.
    }
```

Fill the three `...` blocks from the fixtures already in the file and from `tests/backend/test_tournaments.py:293`; derive the `/bracket` key set from the actual response rather than from `TournamentOut`'s source, so the test pins the **wire**, not the declaration.

Run: `.venv/Scripts/python.exe -m pytest tests/backend/test_display_public.py -q`
Expected: **all green, including the three new ones.** If `test_display_state_key_set_is_exact` reds today, the projection is already leaking or already narrower than the tuple suggests — **stop and report**, that is a finding, not a fixture bug.

- [ ] **Step 2: Commit the tests alone** (so the "green before, green after" evidence is a real commit boundary)

```bash
git commit -m "test(display): pin the public projection key sets (F-DM-30, F-DM-71)" -- tests/backend/test_display_public.py
```

- [ ] **Step 3: Type `/state`** — in `apps/api/src/display/display.py`, replace the `_MEET_PROJECTION_FIELDS` tuple (`:158-168`) with a declared model, and derive the tuple from it so the two can never drift apart:

```python
class DisplayStateDTO(BaseModel):
    """The meet board's projection of the workspace state blob (F-DM-30).

    Until SP-DM-3 P1 this route had NO ``response_model``: the one
    unauthenticated data plane in the product was the one with no declared
    shape, and its allow-list was a Python tuple with a prose comment naming
    its TS consumer. This class IS that allow-list now, and
    ``tests/backend/test_display_public.py`` pins its key set exactly.

    Notably ABSENT vs the raw blob, and deliberately: ``scheduleHistory``
    (the operator revert pool), ``scheduleVersion``, ``bracketPlayers``,
    ``planFinalized``.

    ponytail: the five pass-through fields are typed ``Any``, not with their
    real DTOs. Ceiling named: this is the public plane reading a blob that
    predates the strict DTOs, so validating it through ``TournamentConfig`` /
    ``PlayerDTO`` / ... (all ``StrictModel``, ``extra="forbid"``) would turn a
    legacy key into a 500 on a screen in a public hall, or - worse, with
    ``extra="ignore"`` - silently DROP keys the board renders. Upgrade path:
    tighten one field at a time behind P2's blob versioning, each with its own
    key-set test. What P1 buys is the KEY SET being declared, which is what
    F-DM-30 is about.
    """

    config: Any = None
    groups: Any = None
    players: Any = None
    matches: Any = None
    schedule: Any = None
    scheduleIsStale: Any = None
    standings: List[MeetStandingRowDTO] = Field(default_factory=list)


# The exact field set the meet board consumes (useDisplaySync.ts) - read off
# the response model so the projection and its declaration cannot drift.
# ``standings`` is excluded: it is computed, not copied from the blob.
_MEET_PROJECTION_FIELDS = tuple(
    f for f in DisplayStateDTO.model_fields if f != "standings"
)
```

and the route decorator (`:171`) becomes:

```python
@public_router.get(
    "/{token}/state",
    response_model=DisplayStateDTO,
    # The projection copies a key only when the blob HAS it
    # (``if k in t.data``), and the board distinguishes an absent key from a
    # null one. ``exclude_unset`` is what keeps that true through the
    # response model: a dict validated into the model marks exactly the keys
    # it carried as "set", so the wire key set is byte-for-byte what it was
    # before P1 - which the key-set test above is there to prove.
    response_model_exclude_unset=True,
)
```

The `Response(status_code=204)` early return is unaffected — FastAPI skips response-model handling entirely when the endpoint returns a `Response` instance. Add `Any` to the module's `typing` import and `Field` to its `pydantic` import if absent.

- [ ] **Step 4: Type `/bracket`** — move `from bracket.brackets import _hydrate_session, _serialize_session` to the module top (it is currently function-local, `:223`) alongside `TournamentOut`, and change the decorator (`:214`) to:

```python
@public_router.get("/{token}/bracket", response_model=TournamentOut)
```

Extend the route docstring with one sentence: *"`response_model` is `TournamentOut` — the exact type `_serialize_session` already returns (F-DM-30: the route was untyped, not un-shaped). Declaring it changes no key; it puts the shape in the OpenAPI document, which is what the generated types and the parity oracle read."*

- [ ] **Step 5: Run, then regenerate**

```bash
.venv/Scripts/python.exe -m pytest tests/backend/test_display_public.py -q
.venv/Scripts/python.exe -m pytest tests/backend -q
```
Expected: green, **with the three Step-1 key-set tests still passing unchanged** — that is the whole proof of this task. A red key-set test means the response model changed the wire; fix the model, never the test.

```bash
PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api
git diff --stat apps/console/src/api/dto.generated.ts
.venv/Scripts/python.exe -m pytest tests/backend/test_dto_generated_freshness.py -q
npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts
npm --prefix apps/entrant run test:run -- tests/dtoParity.test.ts
```
Expected: the diff adds `DisplayStateDTO` and attaches response schemas to the two display paths; freshness **3 passed**; both parity suites **green** (`DisplayStateDTO` has no hand twin, and neither oracle iterates generated-only schemas). The console `generated` floor is 175 against ~178 actual, so it needs no edit.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(display): response_model on the two public read routes (F-DM-30)" -- apps/api/src/display/display.py apps/console/src/api/dto.generated.ts
```

---

### Task 5: Deletion gate, negative controls, slice gates, ledger

**Files:** none new — verification only, plus `docs/history/programs/DM3_PROGRESS.md` and `docs/reference/debt-log.md`.

- [ ] **Step 1: The deletion gate — 9 → 4**

```bash
rg -n "^class (Meet)?Standing|^export interface (Meet)?Standing" apps packages --glob '!**/dto.generated.ts'
```
Expected: **exactly four lines**, and they are these four:

| Survivor | Grain | Why it survives |
|---|---|---|
| `apps/api/src/bracket/standings.py` `class StandingRow` | participant | The one participant row: computation **and** wire shape. |
| `apps/api/src/core/schemas.py` `class MeetStandingRowDTO` | groupId | The one groupId row. Must live in the kernel because `TournamentStateDTO` embeds it and the kernel may not import `meet`. |
| `apps/api/src/entries/entries_site.py` `class StandingRowDTO` | participant | The public entrant projection. |
| `apps/entrant/app/lib/draws.types.ts` `export interface StandingRowDTO` | participant | The entrant hand mirror. |

Also confirm the untyped ninth is gone: `rg -n 'payload\["standings"\]' apps/api/src` → still one line, but it now flows through `DisplayStateDTO` (Task 4); and `rg -n "response_model" apps/api/src/display/display.py` → **three** routes typed (`summary`, `state`, `match-states`) plus `bracket` = four, i.e. every route in the file.

**Two deltas from the card's "≤3", both deliberate and flagged for the controller:**

1. **`entries_site.StandingRowDTO` cannot re-export the backend row.** It is the same *grain* but not the same *shape*: `participantKey` where the operator wire says `participant_id`, camelCase counters where the operator wire is snake_case, and an extra `history: List[str]` the operator wire does not have. Collapsing it means changing public entrant wire keys — forbidden by this plan's own behavior-preservation constraint and out of P1's scope. What P1 *does* buy: it is now the only declaration of that projection, built from the one participant row, and it is parity-checked from the entrant side.
2. **The entrant hand mirror cannot be generated.** `dto.generated.ts` lives in `apps/console/src/api/`; importing it from `apps/entrant/app/` would be a cross-package runtime type dependency between two separately-built apps, which depcruise and the two tsconfigs both have reason to refuse. Its substitute is P0's entrant parity test, whose `PAIRS` already pins `StandingRowDTO → StandingRowDTO` — a machine check, not eyes. Generating it is R-DM-9(c) end-state work that needs the generated types to live somewhere both tiers may read (`packages/shared-contract/` is the candidate, and **P2 is about to touch that package's versioning**) — a ruling, not a P1 edit.

Counting only backend declarations, the gate is met exactly: **5 typed + 1 untyped → 3 typed + 0 untyped.**

- [ ] **Step 2: NC 1 — a deleted field reddens the console AND the entrant parity tests**

The card words NC 1 as *"deleting a shared field reddens console **and** entrant parity tests"*. **Deviation, recorded P0-style:** no single row shape is mirrored by both tiers — the console's two standings shapes are now generated aliases (which *cannot* diverge, and that is the point), and the entrant mirrors `entries_site.StandingRowDTO`, which the console does not mirror at all. So NC 1 is performed as **two probes, one per tier**, and the console half reds through the **type gate** rather than the parity oracle. Both are temporary edits, reverted, nothing committed.

Probe A — entrant tier (parity oracle):
1. Delete `pointsLost` from `apps/api/src/entries/entries_site.py:StandingRowDTO` and from its construction site (`:637-651`).
2. `.venv/Scripts/python.exe -m pytest tests/backend/test_dto_generated_freshness.py -q` → **RED** (generated-not-live keys).
3. `PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api` — a mechanical regeneration, **not a hand edit**.
4. `npm --prefix apps/entrant run test:run -- tests/dtoParity.test.ts` → **RED** on `StandingRowDTO.pointsLost hand-only`.
5. Revert: `git checkout -- apps/api/src/entries/entries_site.py apps/console/src/api/dto.generated.ts`; re-run both → green.

Probe B — console tier (type gate):
1. Delete `losses` from `apps/api/src/core/schemas.py:MeetStandingRowDTO` and from `meet/standings.py`'s construction.
2. pytest freshness → **RED**; then `make generate-api`.
3. `npm --prefix apps/console run build` → **RED** in `modules/display/publicDisplay/StandingsView.tsx` (and its test) on the missing property — the generated alias propagates the deletion into every consumer with **no hand edit anywhere**.
4. Revert all three files; re-run → green.

Record all six observed outcomes verbatim in the ledger. State the deviation there too: *an aliased shape reds through `tsc`, not through the parity oracle — that is the alias being stronger than parity, not weaker.*

- [ ] **Step 3: NC 2 — the display key-set discipline**

Standing tests, no probe needed: `.venv/Scripts/python.exe -m pytest tests/backend/test_display_public.py -q`. Confirm the ratchet bites once: temporarily add `"scheduleVersion"` to `_MEET_PROJECTION_FIELDS`'s source (i.e. add a field to `DisplayStateDTO`), run the suite → `test_display_state_key_set_is_exact` **RED**. Revert. This is the F-DM-71 preservation proof: the allow-list is now a declaration with a test behind it instead of a tuple with a comment.

- [ ] **Step 4: The allow-list is untouched**

```bash
rg -i "standing" apps/console/src/api/__tests__/dtoParity.allowlist.json   # expect: 0 hits
```
Expected: 0. P1 closes no allow-listed divergence, so the **cap stays 19** — it is not raised and there is nothing to shrink. If this returns a hit, delete those lines and lower the cap by exactly that many in the Task 3 commit.

- [ ] **Step 5: Full gate**

Run: `make check`
Expected: green across both tiers (console lint/types/vitest/depcruise, entrant lint/types/vitest/depcruise, ruff, import-linter, pytest). Fix anything red before proceeding; report honestly if a failure is pre-existing — verify that by running the same gate on a clean `dm3/p0-type-mechanism` worktree or reading CI, **never** with `git stash`.

- [ ] **Step 6: Ledger + debt-log**

- `docs/history/programs/DM3_PROGRESS.md`: flip P1's row to DONE with the commit SHAs; record the final declaration count (**4**) with the two flagged deltas from "≤3", the NC 1 probe outputs, the observed knip result from Task 3 Step 5, and any deviation from this plan.
- `docs/reference/debt-log.md`: two rows.
  1. **`DisplayStateDTO`'s five `Any` pass-through fields** — the key set is declared, the member types are not; close by tightening one field at a time behind P2's blob versioning, each with its own key-set test.
  2. **The entrant standings mirror is hand-written by necessity** — closing it needs the generated types readable from both tiers (candidate: `packages/shared-contract/`, which P2 touches), i.e. an R-DM-9(c) ruling, not an edit.
  Also record the smaller ceiling: `StandingRow`'s counter fields are **optional in the OpenAPI schema** (dataclass defaults) though always emitted; the console alias compensates with `Required<>`, the entrant mirror does not need to.

- [ ] **Step 7: Commit the docs (path-limited), then stop**

```bash
git commit -m "docs: SP-DM-3 ledger - P1 standings shape landed" -- docs/history/programs/DM3_PROGRESS.md docs/reference/debt-log.md
```

Merging `dm3/p1-standings-shape` is Kyle's call (superpowers:finishing-a-development-branch). It is stacked on `dm3/p0-type-mechanism`, which is stacked on `dm3/p3-minting-gaps` — **the three merge in order, or together.** P2 (§C2) is next in the ruled sequence and branches off whatever `main` becomes.

---

## Self-review record (plan author, 2026-08-24)

- **Spec coverage:** Card §C1's four clauses map to tasks — "one backend row shape per grain" → Tasks 1 (groupId) and 2 (participant); "re-exported to the two public projections" → Task 4 (display re-exports `MeetStandingRowDTO` inside `DisplayStateDTO`) and, for the entrant projection, Task 5 Step 1 delta 1 (it cannot re-export without changing public wire keys, so it stays a declaration built from the one participant row); "the three tiers' `StandingRowDTO`s become generated/parity-checked" → Task 3 (console ×2, **generated**) + the pre-existing entrant parity pair (**parity-checked**, free from P0 — not rebuilt); "the two untyped display routes gain a `response_model`" → Task 4. NC 1 → Task 5 Step 2 (as two per-tier probes, deviation recorded); NC 2 → Task 4 Step 1 + Task 5 Step 3. Deletion gate → Task 5 Step 1. No migrations; no wire key changes anywhere.
- **Known judgment calls (flagged, not hidden):**
  1. **The gate lands at 4, not ≤3, and the two extra are named with reasons** (Task 5 Step 1). Reaching 3 would require either changing public entrant wire keys or a cross-package import of the console's generated file — the first is forbidden by the brief, the second is an R-DM-9(c) ruling that also collides with P2's `packages/shared-contract/` work. Counting backend declarations alone, the gate is met exactly (6 → 3).
  2. **`bracket.standings.StandingRow` stays a stdlib dataclass and becomes the wire type directly**, rather than being converted to a `BaseModel`. Verified in the repo `.venv` that pydantic emits it into `components.schemas` under its own name with correct properties, and that `model_dump()` carries all nine fields. This keeps `standings.py` pydantic-free (it sits next to `scheduler_core` domain types) and makes the diff a one-line annotation plus two deletions. The cost — defaulted fields render optional in OpenAPI — is paid once by `Required<>` on the console alias, named at both ends and debt-logged. The `BaseModel` conversion is written down as the explicit fallback if the schema does not emit as verified.
  3. **Console aliases instead of teaching the oracle to read `bracketDto.ts`.** The alternative would pull ~20 unrelated hand types into pairing and would very likely need **new allow-list lines**, but the cap may only shrink — so that path structurally violates P0's ratchet in order to close one shape. An alias cannot diverge at all.
  4. **NC 1 is performed per-tier, and the console half reds through `tsc`, not the oracle.** There is no single row shape both tiers mirror, and a generated alias is deliberately un-divergeable. Recorded in the same shape P0 recorded its NC 2 deviation.
  5. **`DisplayStateDTO`'s pass-through fields are `Any`.** Typing them with the real strict DTOs would validate a legacy blob on the one unauthenticated data plane — a 500 in a public hall, or a silent key drop. The card's ask is a `response_model`, and the *key set* is what F-DM-30 is about. `ponytail:` comment names the ceiling and the upgrade path; debt-logged.
  6. **Task 4's tests are green-before and green-after, not red-first.** For a behavior-preserving refactor the key-set test is the instrument, not the deliverable's failure signal; a red-first cycle here would mean inventing a wire change the plan forbids.
  7. **`tests/backend/unit/test_meet_standings.py` changes.** It is a **type rename only** (`StandingRow(` → `MeetStandingRowDTO(`), no assertion, expected value or field name touched — and Task 1 Step 4 says to stop and report if any assertion needs editing, which would mean the shapes were not field-identical.
- **Type consistency:** `compute_meet_standings` returns `list[MeetStandingRowDTO]` in Task 1 and is consumed with that exact type by `_meet_standings_for` (Task 1) and, through it, by `DisplayStateDTO.standings: List[MeetStandingRowDTO]` (Task 4). `compute_standings` returns `List[StandingRow]` (unchanged) and is consumed as `EventOut.standings: Optional[List[StandingRow]]` (Task 2) and as `Sequence[StandingRow]` by `formats/swiss.py` (untouched). The OpenAPI schema names are `MeetStandingRowDTO`, `StandingRow` (renamed from `StandingRowOut` in Task 2), `StandingRowDTO` (entries_site, unchanged) and `DisplayStateDTO` (new) — Task 3's two aliases name the first two exactly, and the entrant `PAIRS` entry names the third. The five meet row keys (`groupId`, `groupName`, `matchesPlayed`, `wins`, `losses`) appear identically in `MeetStandingRowDTO`, the Task 1 construction, and Task 4's `MEET_STANDING_ROW_KEYS`.
- **Line numbers** are as of **`9c5e6186`** (branch `dm3/p0-type-mechanism`, this plan's base). Executors should **re-anchor by symbol, not line**, and re-derive every pinned count (parity floors, key sets, generated-schema totals) from the actual run output rather than trusting a number written here.
