# SP-DM-3 — P9: Cosmetic sweep — detailed plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or
> executing-plans). Steps use checkbox (`- [ ]`) syntax. **Four tasks, all S.** This slice is
> explicitly *"not a program"* (program plan §C9) — if you find yourself writing a fifth task,
> stop and re-read the triage table.

**Goal:** Land the genuinely-cosmetic remainder of `F-DM-43..61` + `F-DM-21/25/42`, and — the
larger half of this slice's value — **route out loudly** the cited findings that turned out to
carry behavior risk, so nobody later mistakes "P9 covered it" for "it is done".

**Branch:** `dm3/p9-cosmetic-sweep`, already created off `main` @ **`b86162e2`**. Every line
number and count below anchors to that SHA; re-anchor by symbol if the tree has moved.

**Card:** program plan §C9. **Rulings:** `docs/history/programs/DM1_RULINGS.md` — read in full
during planning; **nothing in the 13 rulings binds a cosmetic edit**, with two exceptions that
*remove* work from this slice rather than constrain it (R-DM-9 resolves F-DM-49; R-DM-11
resolves F-DM-57 — both cited in the triage table). **Audit:** `docs/history/audits/2026-08-24-domain-model-audit.md` §7.2/§7.3.

---

## Global Constraints (inherited verbatim from the program plan)

The full block is at `2026-08-24-sp-dm-3-domain-unification-program.md` §"Global Constraints".
The four that can actually bite a cosmetic sweep:

- **No phase re-decides anything ruled.** ADR 0006 (no match/score merge), ADR 0014 (no
  `tournaments`/`tournament_id`/`tournamentStore` rename), R2, R7/R13, D7.
- **The F-DM-11 test-schema trap:** any FK or schema change lands in `models.py` **and** its
  migration in the same commit, with a negative control asserting behavior against
  migration-built schema. **This slice adds no FK and no migration** (see §"The optional
  migration" — it is recommended OUT), so the trap is avoided rather than satisfied.
- Commits are **path-limited** (`git commit -- <paths>`); never `git add .`.
- Gate before claiming done: the specific suite for the change, then `make check` at slice end.
- Console DTO changes: `make generate-api` (as `PATH="$(pwd)/.venv/Scripts:$PATH" make
  generate-api`), then reconcile `apps/console/src/api/dto.ts` **by hand**.

Plus two standing facts this slice must not disturb:

- **Parity ratchet cap is 19** and `apps/console/src/api/__tests__/dtoParity.allowlist.json` is
  untouched. No task here opens or closes an allow-listed divergence; if one appears, stop.
- **depcruise baseline is 16 warnings / 0 errors.** Task 2 adds one `store/ → platform/` import;
  the precedent is `store/uiStore.ts:11` (already imports `WorkspacePhase` from
  `platform/domain/lifecycle`), and no depcruise rule governs that direction — verified against
  `apps/console/.dependency-cruiser.cjs` (the only `platform` rules are `platform-no-modules`
  and `platform-no-app`, both about what platform imports, not what imports platform).

**Two live defects are deliberately unowned and are NOT in scope**: the adoption-path divergence
(`_adoptable`'s `sourceEntryId` branch producing a keyed column under an unkeyed blob row) and
the orphan roster-blob row on person-refusal, both in `docs/reference/debt-log.md`. **Checked:
neither is adjacent to any file this plan touches** — the sweep goes nowhere near
`entries/entries.py`, `entries/submissions.py` or the commit seam. If a task somehow leads you
there, stop; those need an owner ruling, not a Boy-Scout pass.

---

## Judgment calls this plan makes (controller: these are the ones to overrule if you disagree)

1. **The `match_states` String→DateTime migration is OUT.** It is not cosmetic — the strings
   reach the public wire, the roundtrip is test-pinned, and all migration evidence is
   SQLite-only. Full reasoning + the cost of overruling is its own section below.
2. **F-DM-47 is routed out, not swept.** Its only remaining fix requires `api/dto.ts` — a file
   whose *sole* import today is `./dto.generated` — to start naming `platform/domain` types.
   That posture ("the hand mirror depends on nothing but the wire") looks deliberate, and
   changing it is an architecture call, not a cosmetic edit. Overrule cost: one import line and
   two type aliases; the risk is that a wire/domain vocabulary drift then becomes invisible.
3. **F-DM-42 is routed out despite the card naming it.** Renaming `MyTournamentCard` to the
   submission it actually is touches the **shipped browser module** (`apps/entrant/public/assets/my-entries.js` + its hand `.d.ts`), the entrant parity oracle's explicit pair map, and the
   public tier's own test suite. A public-tier type rename across a shipped artifact is not a
   Boy-Scout edit. Overrule cost: a real slice, sized M.
4. **F-DM-49 is treated as CLOSED by P0, not swept.** R-DM-9 lists F-DM-49 among what it
   resolves, and `dtoParity.test.ts:93` now declares `EntryDTO: 'EntryDeskRowDTO'` in a
   machine-checked `ALIASES` map. Renaming the type would be 26 call sites of churn to close a
   naming nit a test already documents. Overrule cost: a mechanical rename, no behavior.
5. **F-DM-54's fix sweeps six call sites, not one.** The audit cites only display's import, but
   `_row_to_dto` is imported privately by `meet/` three times too. Root-cause laziness says fix
   the name once at the definition; the diff will exceed the finding's citation on purpose.
6. **F-DM-44, 52 and 58 get no code change.** Each is already explained in situ (see triage).
   Touching them would delete rationale, not duplication.

---

## What the tree says that the card does not

Six slices (P3, P0, P1, P2, P4, P5, P6) landed since the audit was pinned at `e67633fe`. Every
finding below was re-anchored by symbol against `b86162e2`, not read from the audit.

- **`core/schemas.py::MatchScore` is dead.** F-DM-43 is banded as "two divergent declarations",
  but a tree-wide grep (`apps/ tests/ packages/ tools/`) finds **zero** references to the
  `core/schemas.py:646` one — every `MatchScore` usage resolves to
  `operations/match_state_routes.py:103`. So F-DM-43 is not a validation reconciliation (which
  *would* be behavioral: `ge=0, le=99` vs unbounded); it is a **deletion**, exactly F-DM-45's
  shape. The generated `MatchScore` schema in `dto.generated.ts:4873` is the operations one
  (reached via `MatchStateDTO.score`), so deleting the dead twin must regen clean.
- **F-DM-48 has already shrunk to one site.** The audit lists four consumers reaching through
  `BracketTournamentDTO['events'][number]`; today exactly one declaration does
  (`modules/bracket/eventUpsertPayload.ts:17`, which re-exports it as the named
  `BracketEventDTO`) and the consumers import that name. The fix is a 2-line diff, not four.
- **F-DM-60's vocabularies are verifiably closed.** `entries_me.py:129-142` maps raw entry state
  through a 6-entry dict with an `"awaiting"` fail-calm default, and `_card_status` (`:197-215`)
  returns one of four literals. So the emitted values genuinely are the union's members and the
  `| string` escape hatch is the lie, not the honesty. **The third member of F-DM-60
  (`EntryEventDTO.entryType?: string`) is NOT verified** — it comes from an unconstrained
  `entry_events.entry_type` column (F-DM-37: zero CheckConstraints in the schema), so Task 3
  makes it a verify-then-decide step rather than assuming.
- **F-DM-59 is 8 stale citations, not 14 — and 3 of the 11 grep hits are correct.** Grepping
  `backend/` across `apps/entrant/app apps/entrant/public` returns **11** hits at `b86162e2`.
  Eight are stale pre-SP-REORG-1 `backend/api/*` / `backend/app/*` prefixes; **three cite
  `tests/backend/unit/test_form_csrf*.py`, which is a real current path** (`tests/backend/` is
  top level per CLAUDE.md) and must be left alone. The Task 3 gate targets that residue of 3 by
  name, not an unreachable 0.
- **`match_states` already gained its `__table_args__`** in P4 (F-DM-22) — the composite FK
  to `matches` is at `db/models.py:341-347` with a CASCADE rationale comment. The card's
  optional migration is only the *timestamp type*, and P4 has already been in this file.

---

## Triage of the 22 cited findings

Card scope = `F-DM-43..61` remainder (19) + `F-DM-21/25/42` (3) = **22**. Verdicts re-anchored
against `b86162e2`.

| ID | Verdict | Evidence / reason |
|---|---|---|
| **F-DM-45** | **CLOSED** — P0 (`626416c7`) | `MatchStateOut` grep → 0 hits in `apps/api/src`. |
| **F-DM-53** | **CLOSED** — P2 (`d478e681`) | `packages/shared-contract/` is a versioned `{$schema, version, keys}` workspace package; console imports by package name. |
| **F-DM-49** | **CLOSED by mechanism** — P0 / R-DM-9 | R-DM-9 names F-DM-49 in "Resolves"; `dtoParity.test.ts:93` declares the `EntryDTO ↔ EntryDeskRowDTO` alias and a test holds it. Judgment call 4. |
| **F-DM-43** | **LIVE + COSMETIC** → Task 1 | `core/schemas.py:646` is **dead** (0 refs tree-wide). Delete, not reconcile. |
| **F-DM-54** | **LIVE + COSMETIC** → Task 1 | `display/display.py:27` + 3 `meet/` sites import the private `_row_to_dto`. Rename at the definition. |
| **F-DM-46** | **LIVE + COSMETIC** → Task 2 | `store/matchStateStore.ts:18` `LegacyStatus` is character-identical to `platform/domain/match.ts:26` `MatchStatus` — and **measured, the literal union appears 8× across 6 files**, not the audit's 3. 8 → 2. |
| **F-DM-48** | **LIVE + COSMETIC** → Task 2 | `api/bracketDto.ts:154` `interface EventDTO` is unexported; one structural alias remains. |
| **F-DM-59** | **LIVE + COSMETIC** → Task 3 | 10 pre-SP-REORG-1 `backend/…` citations in entrant docstrings. |
| **F-DM-60** | **LIVE + COSMETIC (2 of 3)** → Task 3 | Two unions verified closed at the emitter; `entryType` is verify-then-decide. |
| **F-DM-61** | **LIVE + COSMETIC (union half)** → Task 3 | `draws.types.ts:13` carries the tag union **in a docstring** beside `kind: string`. The 3-copy label dedup is D23 (cross-package types), not this slice. |
| **F-DM-55** | **LIVE + NOT COSMETIC** — see §"The optional migration" | Public wire, test-pinned roundtrip, SQLite-only migration evidence. |
| **F-DM-21** | **LIVE + NOT COSMETIC** | `platform/domain/match.ts:50-59` `playerIds: string[]` mixes meet UUIDs and bracket ids with no source tag. Its own docstring says the run desk uses it to refuse double-booking (**debt D20**) and that an optional field "would make that check fail open". Adding a discriminator changes what that guard sees. Needs its own slice with a negative control that a cross-namespace collision is *caught*. |
| **F-DM-25** | **LIVE + NOT COSMETIC** | Four workspace key kinds (uuid / `entry_pages.slug` / capability token / no id at all in `tournamentStore`) with no layer declaring the mapping. The fix is a mapping layer or a reference doc, not an edit. Adjacent to ADR 0014's fence — route to P7 or an owner ruling. |
| **F-DM-42** | **LIVE + NOT COSMETIC** | Judgment call 3 — public-tier type rename across a shipped browser module + the parity pair map. |
| **F-DM-47** | **LIVE + NOT COSMETIC** | Judgment call 2 — the only remaining fix creates the first non-generated import in `api/dto.ts`. |
| **F-DM-50** | **LIVE + NOT COSMETIC** | 11 request-shape types local to `api/client.ts` with no mirror. This is the **write side of P0's charter** (R-DM-9's oracle covers responses only) and is M-sized. Route to a P0 follow-on. |
| **F-DM-51** | **LIVE + NOT COSMETIC** | Three hand-kept `entry_pages` views (`core/schemas.py:831,891`; `entries_json.py:253`) — one write-strict, one operator read, one **public** read. Collapsing them changes public entrant wire keys, which P1 already established this program will not do. |
| **F-DM-56** | **LIVE + NOT COSMETIC** | Adding FKs to `tournaments.owner_id` / `invite_links.created_by` / `commands.submitted_by` is a schema change: F-DM-11 binds it, and it changes what happens when a `users` row is deleted. Belongs with P7's constraint work (F-DM-37). |
| **F-DM-57** | **LIVE + NOT COSMETIC — already owned** | **R-DM-11 lists F-DM-57 in "Resolves"**: `eventCode` stays the public key and P7 carries the wire half. Removing `drawKey` would drop a public entrant wire key. **Do not touch — it is P7's.** |
| **F-DM-44** | **NO-OP (won't fix)** | The audit's own text: the meet/bracket score split "is deliberate and documented (ADR 0006 named at the declaration) — not drift". The remaining Assignment×4 spans `scheduler_core`, which the import contracts keep pure. Nothing to do. |
| **F-DM-52** | **NO-OP (won't fix)** | P4 gave `PlayerDTO` and `BracketPlayerDTO` **different** `entryPlayerId` rationales (`core/schemas.py:264-275` vs `:315-325` — the bracket half explains why it is stored twice). Extracting a mixin would flatten per-shape rationale and rename an OpenAPI schema. The duplication is now documented, not accidental. |
| **F-DM-58** | **NO-OP (won't fix)** | `lib/names.ts:14-15` already carries a `ponytail:` comment naming the exact ceiling ("last-token-is-surname heuristic") and its upgrade path ("a real surname field on the roster"). That surname field is roster/P8 work. Leave the comment; it is the finding. |

**Totals: 3 closed · 7 live-and-cosmetic · 9 live-but-NOT-cosmetic · 3 no-op.** (3+7+9+3 = 22.)

**Say this out loud in the ledger:** P9 is small *because the sweep is mostly not sweepable* —
nine of the twenty-two cited findings turned out to carry behavior, schema or public-wire risk.
"Cosmetic" was a banding of the *symptom*, not of the fix.

---

## The optional migration: `match_states` String timestamps → `DateTime` — **RECOMMENDED OUT**

**Recommendation: OUT.** One line: *those strings are on the public wire, the roundtrip is
test-pinned, and every migration this program has shipped was verified on SQLite only — a column
type change is the single worst place to first meet Postgres.*

The evidence, each item re-anchored:

- **They are not internal.** `operations/match_state_routes.py:167-169` reads `row.called_at`
  straight into `MatchStateDTO.calledAt` (a `Timestamp` **string** field), and
  `display/display.py:252-259` re-serves that same DTO on the **public capability-token route**
  `GET /display/{token}/match-states`. A type change means parse-on-write + format-on-read, and
  the formatted string will not be byte-identical to what the client sent. That is a public wire
  change wearing a schema change's clothes.
- **Something reads them as strings, and by design.** `repositories/local.py:2170-2181` writes
  `now_iso()` strings and clears them to `None` on uncall/postpone. `MatchStateDTO` is a
  `StrictIgnoringModel` **specifically because** it doubles as the *import* shape for a
  match-states file exported by an older build (its own comment, `match_state_routes.py:127-134`) —
  so it must keep accepting whatever timestamp strings older builds wrote.
- **A test pins the roundtrip.** `tests/backend/test_match_state.py:123`
  `test_called_at_and_original_slot_court_roundtrip`. Under CODE_HEALTH's working practices, a
  change that forces a test to change to keep passing is a **stop-and-flag**, not an edit — and
  this one would.
- **F-DM-11 binds it if it lands.** Column type in `models.py` and the Alembic revision in the
  **same commit**, with a negative control asserting behavior against migration-built schema
  (the unit suites' `Base.metadata.create_all` would otherwise hide the difference entirely).
- **Postgres is untested.** The program's standing caveat — recorded verbatim in the P2 ledger
  entry ("All evidence is SQLite; Postgres was not exercised"). SQLite is typeless enough that a
  `String→DateTime` swap can pass its whole suite and still behave differently on Postgres,
  which enforces the type on every existing row at `ALTER`.
- **The file is not quiet.** P4 already found and fixed a child-before-parent write-ordering bug
  in this exact area, and `match_states` is live-ops state on the Operations Run surface. It is
  the last table a Boy-Scout commit should reshape.

**What the finding actually buys.** F-DM-55's stated harm is *"time is not comparable in SQL on
the Meet operational path."* No query in the tree compares these columns in SQL today —
`meet/schedule_advisories.py:199` parses `calledAt` out of the **blob**, not the column. So the
harm is latent, not shipped, which is why the card marked the migration optional.

**Cost of overruling to IN:** it must be **its own slice-let with its own plan**, never appended
to this slice's commit stack — F-DM-11's same-commit rule plus a migration-built-schema negative
control plus a Postgres run is a full task loop, and it would change a test the working practices
say to flag rather than edit. Budget M, not S. Do not fold it into Tasks 1–4.

---

# Tasks

Four tasks, each independently reviewable, each with its own verification command. **Sizes: all
S.** A fresh subagent should be able to execute any one from its text alone.

---

### Task 1 — Backend: delete a dead score DTO, unprivate a cross-domain helper (S)

Closes **F-DM-43** and **F-DM-54**.

**Files:**
- Modify: `apps/api/src/core/schemas.py` (delete `class MatchScore`, ~:645-648, and the stale
  `# Match State (for Match Desk)` header directly above it)
- Modify: `apps/api/src/operations/match_state_routes.py` (definition ~:160 **plus four
  in-module call sites** ~:329, :352, :412, :477)
- Modify: `apps/api/src/display/display.py` (:27 import, :259 call)
- Modify: `apps/api/src/meet/schedule_advisories.py` (:525-526),
  `apps/api/src/meet/schedule_suggestions.py` (:125-126, :288-289) — each a **local** `from …
  import` inside a function, so there are two lines per site

**Before-counts to record (measured at `b86162e2`, re-measure before editing):**
`rg "class MatchScore" apps/api/src` → **2** · `rg "_row_to_dto" apps/ tests/` → **13**
(1 definition + 4 in-module uses in `match_state_routes.py` itself + 2 in `display/` + 6 in
`meet/`, the latter as three local `from … import` pairs). **No `tests/` hit** — the helper is
exercised through routes, so the rename touches source only.

- [ ] **Step 1: Measure, so the gate is fireable.** Run both greps above and write the numbers
      down. If either differs from the recorded before-count, the tree has moved — re-anchor by
      symbol before proceeding.
- [ ] **Step 2: Confirm the dead twin is dead.** Run
      `rg "MatchScore" apps/ tests/ packages/ tools/ | rg -v "match_state_routes|dto.generated|setMatchScore"`.
      Expected: only the `core/schemas.py` definition itself, plus a prose mention in
      `dtoParity.test.ts:108` (which describes the *operations* shape as a wire twin candidate —
      leave it alone). **If any Python code imports `core.schemas.MatchScore`, STOP** — the
      finding is then a validation reconciliation (`ge=0, le=99` vs unbounded), which is
      behavioral and belongs out of this slice.
- [ ] **Step 3: Delete it.** Remove `class MatchScore(BaseModel)` and the `# Match State (for
      Match Desk)` comment above it from `core/schemas.py`. **Keep the `# NOTE:` block below it**
      — it is about `MatchStateDTO` canonicality and the 422-on-class-identity trap, which is
      separately valuable and unrelated to the deleted class.
- [ ] **Step 4: Unprivate the helper.** In `operations/match_state_routes.py`, rename the
      definition `_row_to_dto` → `row_to_dto`. Add one line to its docstring naming why it is
      public: *"Public because `display/` and `meet/` both project match state from rows; the
      leading underscore claimed a privacy that four importers already ignored (F-DM-54)."*
      Update the four in-module call sites and all importers (display ×1, meet ×3). **Leave no
      `_row_to_dto` alias** — an alias makes the deletion gate unfireable.
- [ ] **Step 5: Verify.**
      Run: `pytest tests/backend/test_match_state.py tests/backend/test_display_public.py tests/backend/test_schedule_advisories.py -q`
      Expected: all pass, no assertion edited.
      Run: `cd apps/api/src && lint-imports --config ../.importlinter` → `15 kept, 0 broken`.
      (The display→operations and meet→operations edges already exist and are contract-allowed;
      making a name public does not create an edge.)
      Run: `ruff check apps/api` → clean.
- [ ] **Step 6: Prove the wire did not move.** Run
      `PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api` then
      `git diff --stat apps/console/src/api/dto.generated.ts`.
      Expected: **empty diff.** The dead class was unreferenced, so it never reached OpenAPI; a
      non-empty diff means Step 2's assumption was wrong — stop and report.
- [ ] **Step 7: Deletion gates (both measured fireable in Step 1).**
      `rg "class MatchScore" apps/api/src` → **1** (was 2)
      `rg "_row_to_dto" apps/ tests/` → **0** (was 13)
- [ ] **Step 8: Commit (path-limited).**
      `git commit -m "refactor(api): delete the dead MatchScore twin; row_to_dto stops lying about privacy (F-DM-43, F-DM-54)" -- apps/api/src/core/schemas.py apps/api/src/operations/match_state_routes.py apps/api/src/display/display.py apps/api/src/meet/schedule_advisories.py apps/api/src/meet/schedule_suggestions.py`

---

### Task 2 — Console: one match-status union, one exported bracket `EventDTO` (S)

Closes **F-DM-46** and **F-DM-48**. Console types only — **no backend, no regen, no
allow-list touch.**

**Files:**
- Modify: `apps/console/src/store/matchStateStore.ts` (:18 `LegacyStatus` declaration)
- Modify: `apps/console/src/hooks/useCommandQueue.ts` (:42, :55, :90 — inline copies)
- Modify: `apps/console/src/modules/operations/runtime/runModel.ts` (:29),
  `apps/console/src/modules/operations/runtime/runMachine.ts` (:29) — inline copies
- Modify: `apps/console/src/api/bracketDto.ts` (:154 `interface EventDTO`)
- Modify: `apps/console/src/modules/bracket/eventUpsertPayload.ts` (:17 structural alias)

**F-DM-46 is bigger than the audit says — measured, not assumed.** The audit counts three
*declarations*; `rg "'scheduled' \| 'called' \| 'started' \| 'finished'" apps/console/src` at
`b86162e2` returns **8** occurrences across 6 files: 2 named declarations
(`store/matchStateStore.ts:18` `LegacyStatus`, `platform/domain/match.ts:26` `MatchStatus`) and
6 inline literal copies. The target end-state is **2 occurrences**: the `platform/domain`
declaration, and `api/dto.ts:237`'s inline copy, which stays on purpose.

- [ ] **Step 1: Measure.** Run the grep above and record the count. Expected **8**. If it differs,
      the tree has moved — re-anchor before editing.
- [ ] **Step 2: F-DM-46 — one declaration, and the inline copies name it.** In
      `matchStateStore.ts`, delete the local
      `type LegacyStatus = 'scheduled' | 'called' | 'started' | 'finished';` (:18) and replace it
      with `import type { MatchStatus } from '../platform/domain/match';` plus a local alias so
      the in-file usages (`:59`, `:161`) keep reading naturally:
      ```ts
      /** F-DM-46: the legacy four-member wire spelling IS the canonical domain
       *  union, character for character. Aliased rather than redeclared so a
       *  future member lands in one place. `api/dto.ts` keeps its own inline
       *  copy on purpose — the hand mirror tracks the WIRE, not the domain. */
      type LegacyStatus = MatchStatus;
      ```
      Then replace the **five** inline literal copies with `MatchStatus`, importing it in each
      file: `hooks/useCommandQueue.ts:42,55,90` and
      `modules/operations/runtime/{runModel.ts:29,runMachine.ts:29}`. Pure type substitution —
      the unions are character-identical, so `tsc` is the proof.
      **Prior art for the import direction:** `store/uiStore.ts:11` already imports
      `WorkspacePhase` from `platform/domain/lifecycle`; `hooks/` and `modules/` importing
      `platform/` is the normal direction (the only depcruise `platform` rules govern what
      platform imports, not what imports it).
      **Do not touch `api/dto.ts:237`'s inline union** — that is judgment call 2's territory and
      is deliberately routed out.
- [ ] **Step 3: F-DM-48 — export the type consumers already use.** In `api/bracketDto.ts:154`,
      change `interface EventDTO {` to `export interface EventDTO {`. In
      `modules/bracket/eventUpsertPayload.ts:17`, replace the structural alias
      `export type BracketEventDTO = BracketTournamentDTO['events'][number];` with a direct
      re-export of the now-exported type, keeping the `BracketEventDTO` name so its three
      consumers (`DrawDetailPanel.tsx`, `rosterEvents.ts`, `BracketDrawsTab.tsx`,
      `BracketPlayerFields.tsx`) need no edit.
- [ ] **Step 4: Verify.**
      Run: `npm --prefix apps/console run build` (runs `tsc -b`) — expected: clean. This is the
      real gate: a substituted type that was not actually identical would redden here.
      Run: `npm --prefix apps/console run test:run -- src/store src/hooks src/modules/operations`
      — expected: pass, no assertion edited.
      Run: `npm run depcruise` — expected: **16 warnings / 0 errors**, unchanged. If the warning
      count moved, one of the new imports created a cross-module edge; stop and report.
- [ ] **Step 5: Deletion gates (both patterns measured against the tree at `b86162e2`).**
      `rg "'scheduled' \| 'called' \| 'started' \| 'finished'" apps/console/src` → **2** hits,
      and they must be exactly `platform/domain/match.ts` (the declaration) and `api/dto.ts` (the
      deliberate wire copy). Was **8**.
      `rg "BracketTournamentDTO\['events'\]" apps/console/src` → **0**. Was **1**.
- [ ] **Step 6: Commit (path-limited).**
      `git commit -m "refactor(console): one match-status union declaration; bracket EventDTO is exported (F-DM-46, F-DM-48)" -- apps/console/src/store/matchStateStore.ts apps/console/src/hooks/useCommandQueue.ts apps/console/src/modules/operations/runtime apps/console/src/api/bracketDto.ts apps/console/src/modules/bracket/eventUpsertPayload.ts`

---

### Task 3 — Entrant tier: honest unions, honest citations (S)

Closes **F-DM-59**, **F-DM-60** (two of three, third is verify-then-decide) and **F-DM-61**
(union half). Comments and type unions only — **no runtime code, no wire change.**

**Files (all under `apps/entrant/app/lib` + `apps/entrant/public/assets`):**
- Modify: `draws.types.ts` (:3 citation, :13 `kind`) · `entryPage.types.ts` (:4 citation, :30
  `entryType`) · `player.types.ts` (:3) · `sitemapCache.server.ts` (:34) ·
  `apiFetch.server.ts` (:58) · `formCsrf.server.ts` (:37, :49)
- Modify: `apps/entrant/public/assets/my-entries.d.ts` (:3 citation, :13 `state`, :31 `status`)
- **Do NOT modify:** `formField.ts:16`, `formCsrf.server.ts:35`, `formCsrf.server.ts:41` — see
  the decomposition below.

**Before-count (measured at `b86162e2` with the full listing, no head, no alternation):**
`rg -n "backend/" apps/entrant/app apps/entrant/public` → **11** hits, which decompose as:

- **8 stale** pre-SP-REORG-1 `backend/api/*` / `backend/app/*` prefixes —
  `my-entries.d.ts:3`, `sitemapCache.server.ts:34`, `entryPage.types.ts:4`,
  `draws.types.ts:3`, `apiFetch.server.ts:58`, `formCsrf.server.ts:37`,
  `formCsrf.server.ts:49`, `player.types.ts:3`.
- **3 legitimate and correct** — `formField.ts:16`, `formCsrf.server.ts:35`,
  `formCsrf.server.ts:41` all cite `tests/backend/unit/test_form_csrf*.py`, which is a **real,
  current** repo-root path (`tests/backend/` is top level per CLAUDE.md; verified
  `tests/backend/unit/test_form_csrf_cross_tier.py` exists). **These are the gate's residue —
  leave them untouched.**

- [ ] **Step 1: F-DM-59 — repoint the 8 stale citations.** Translate each to its live path and
      **verify the file exists before writing it** (`ls apps/api/src/<path>`), because the
      audit's own finding is that 13 of 14 such citations pointed at unrelated code — do not
      replace stale paths with new stale paths. Translations, all four targets verified present
      at `b86162e2`:
      `backend/api/entries_site.py` → `apps/api/src/entries/entries_site.py` ·
      `backend/api/entries_json.py` → `apps/api/src/entries/entries_json.py` ·
      `backend/api/entries_me.py` → `apps/api/src/entries/entries_me.py` ·
      `backend/api/entries.py` → `apps/api/src/entries/entries.py` ·
      `backend/app/form_csrf.py` → `apps/api/src/core/form_csrf.py` ·
      `backend/app/error_codes.py` → `apps/api/src/core/error_codes.py`
      (both `core/` targets confirmed by `ls apps/api/src/core/`).
      **Drop line-number suffixes** you cannot verify in the same step — `entryPage.types.ts:4`
      carries `:97-188` and `apiFetch.server.ts:58` carries `:171-183`. A file-only citation that
      is true beats a line citation that rots. Say so in one comment.
- [ ] **Step 2: F-DM-60 — close the two verified unions.** In `my-entries.d.ts`, delete the
      `| string` tail from `MyEntryLine.state` (:13) and `MyTournamentCard.status` (:31), adding
      one comment naming the emitter:
      ```ts
      /** Closed on purpose (F-DM-60): `entries_me.py::_entry_state` maps every raw
       *  state through a 6-entry dict with an `awaiting` fail-calm default, so an
       *  unknown future state arrives AS `awaiting` and never as itself. The old
       *  `| string` tail described a case the emitter cannot produce. */
      ```
      **Verify before you delete**, do not trust this plan: read
      `apps/api/src/entries/entries_me.py` `_ENTRY_STATE` / `_entry_state` (~:129-142) and
      `_card_status` (~:197-215) and confirm every returned literal is a member of the union you
      are closing. If either emitter can return something outside the union, **leave the
      `| string` and record why** — the escape hatch would then be honest.
- [ ] **Step 3: F-DM-60 third member — verify, then decide.** `entryPage.types.ts:30`
      `entryType?: string` comes from `entry_events.entry_type`, an unconstrained `String`
      column (F-DM-37: the schema has zero `CheckConstraint`s). Run
      `rg "entry_type" apps/api/src` and determine whether every write path constrains it to
      `'singles' | 'doubles'`. **If yes**, close the union with a comment citing the constraining
      site. **If no**, leave it open and add a one-line comment saying the column is
      unconstrained and that closing it waits on P7's CHECK work (F-DM-37). Either outcome is a
      pass — record which you took.
- [ ] **Step 4: F-DM-61 — move the tag union out of the docstring.** In `draws.types.ts:13`, the
      six-member format union is written **in a comment** beside `kind: string`. First verify the
      vocabulary: `rg "FORMAT_REGISTRY" -A 40 apps/api/src/bracket/formats/__init__.py` and check
      the emitter (`entries_site.py:533,658` assign `kind=event.format`). If `event.format` is
      constrained to the registry keys on write, type it:
      ```ts
      /** The format tag — the keys of the backend `FORMAT_REGISTRY`
       *  (`apps/api/src/bracket/formats/__init__.py`). F-DM-61: this union
       *  used to live in this docstring beside `kind: string`. The LABEL map
       *  below is still a third copy of the vocabulary; deduping it across
       *  packages is D23 (cross-package types), not this slice. */
      export type DrawKind = 'se' | 'de' | 'rr' | 'swiss' | 'compass' | 'monrad';
      ```
      and change `kind: string` → `kind: DrawKind`, using it in `kindLabel` (~:126) so the label
      map becomes exhaustively checked. **If `event.format` is NOT constrained on write**, leave
      `kind: string` and record why — same rule as Step 3.
- [ ] **Step 5: Verify.**
      Run: `npm run typecheck:entrant` — expected: clean. Any redness here means a consumer
      relies on a value outside the closed union, which is the *finding* firing correctly: revert
      that one closure and record it rather than widening the union back with `| string`.
      Run: `npm --prefix apps/entrant run test:run` — expected: pass.
      Run: `npm --prefix apps/entrant run lint` (or the entrant eslint script `make check`
      invokes) — expected: clean.
- [ ] **Step 6: Deletion gate (measured fireable; target is the residue, not zero of the
      alternation).**
      `rg -n "backend/" apps/entrant/app apps/entrant/public` → **3** hits, and they must be
      exactly `formField.ts:16`, `formCsrf.server.ts:35`, `formCsrf.server.ts:41` — the three
      **correct** `tests/backend/unit/test_form_csrf*.py` citations. Was **11**.
      **This gate is satisfied by repointing real stale paths, not by rewording a comment into
      compliance** — if you find yourself deleting the word `backend` from prose to make the
      count drop, you are gaming it; stop.
- [ ] **Step 7: Commit (path-limited).**
      `git commit -m "docs(entrant): repoint the pre-reorg citations; close the unions the emitters already close (F-DM-59, F-DM-60, F-DM-61)" -- apps/entrant/app/lib apps/entrant/public/assets/my-entries.d.ts`

---

### Task 4 — Route out the nine, gate the slice, close the ledger (S)

No code. This task is **the slice's main deliverable** — nine cited findings leave P9 unfixed and
must leave it *owned*.

**Files:**
- Modify: `docs/reference/debt-log.md`
- Modify: `docs/history/programs/DM3_PROGRESS.md`

- [ ] **Step 1: Debt-log the nine live-but-not-cosmetic findings.** One row each, in the log's
      existing shape. The log is **append-in-the-middle** — cite entries by title, never by line.
      Each row states the finding, why P9 refused it, and where it goes:
      - **F-DM-55** `match_states` String timestamps → owner decision; if taken, its own
        slice-let (F-DM-11 same-commit + migration-built-schema NC + a Postgres run). Cite this
        plan's §"The optional migration" for the full reasoning.
      - **F-DM-21** `Match.playerIds` has no source discriminator → the D20 double-booking guard
        cannot see a cross-namespace human. Needs a slice with a caught-collision NC.
      - **F-DM-25** four workspace key kinds, no mapping layer → P7 or an owner ruling; adjacent
        to ADR 0014's fence.
      - **F-DM-42** entrant tier models no submission type → M-sized; touches a shipped browser
        module and the parity pair map.
      - **F-DM-47** `TournamentStatus`/`WorkspaceStatus` twins → **blocked on a direction
        ruling**: may `api/dto.ts` (whose only import today is `./dto.generated`) name
        `platform/domain` types?
      - **F-DM-50** 11 request shapes local to `api/client.ts` → the **write side** of P0's
        oracle charter; R-DM-9 covers responses only.
      - **F-DM-51** three `entry_pages` views → collapsing changes public entrant wire keys,
        which P1 established this program will not do.
      - **F-DM-56** three FK-less operator-identity pointers → schema change, F-DM-11 binds;
        belongs with P7's F-DM-37 CHECK work.
      - **F-DM-57** `drawKey ≡ eventCode` → **already owned by R-DM-11, which names it in
        "Resolves"; P7 carries it.** Record as *routed, not new debt*.
      Also record the three **no-ops** (F-DM-44, F-DM-52, F-DM-58) as *considered and refused*
      with their one-line reasons, so a later reader does not re-open them.
- [ ] **Step 2: Full gate.**
      Run: `make check` (~15 min, both tiers).
      Expected: green. Baselines to check explicitly — depcruise **16 warnings / 0 errors**,
      import-linter **15 kept, 0 broken**, parity ratchet cap still **19**,
      `dtoParity.allowlist.json` **unchanged** (`git diff --stat` on it → empty).
      If something is red, verify whether it is pre-existing by running the same gate on a `main`
      worktree or reading CI — **never** with `git stash`.
- [ ] **Step 3: Confirm the slice changed no behavior.** Run
      `git diff main --stat` and read it. Expected shape: deletions and renames in
      `apps/api/src`, type aliases in `apps/console/src`, comments and unions in
      `apps/entrant`. **Zero** changes under `alembic/`, **zero** in
      `dtoParity.allowlist.json`, **zero** `dto.generated.ts` diff, and **no test assertion
      edited** (only Task 1's mechanical `_row_to_dto` → `row_to_dto` rename may appear in
      tests). If any of those is violated, the sweep stopped being cosmetic — stop and report.
- [ ] **Step 4: Update the ledger** — `docs/history/programs/DM3_PROGRESS.md`: flip P9's row to
      DONE with the commit SHAs, and write a session-log entry that leads with the triage
      numbers: **22 cited · 3 already closed · 7 swept · 9 routed out · 3 refused.** State
      plainly that P9 was small because nine of the twenty-two were not sweepable, and that
      "cosmetic" banded the symptom, not the fix. Record the `match_states` recommendation (OUT)
      and its overrule cost. Note any Step 3 verify-then-decide outcome.
- [ ] **Step 5: Commit (path-limited), then stop.**
      `git commit -m "docs: SP-DM-3 P9 - route the nine non-cosmetic findings, close the ledger" -- docs/reference/debt-log.md docs/history/programs/DM3_PROGRESS.md`
      Merging `dm3/p9-cosmetic-sweep` is the controller's call. **P7 is program-scale and not
      started** — do not start it in the same session.

---

## Self-review record (plan author, 2026-08-25)

- **Proportion.** Four S tasks, three of them code, one of them the routing that is this slice's
  real output. The card says "not a program" and this plan is not one. Every task is one file
  cluster, one shape, one verification command — grouped by *tier*, not one-task-per-finding
  (which would have produced sixteen).
- **Triage is the deliverable.** 22 cited · **3 closed** (F-DM-45 P0, F-DM-53 P2, F-DM-49 by
  R-DM-9's mechanism) · **7 live-and-cosmetic** · **9 live-but-NOT-cosmetic** · **3 refused**.
  The nine are named individually in Task 4 Step 1 with a destination each, because a cosmetic
  sweep that quietly changed behavior is the worst outcome available and silence about the nine
  would be the second-worst.
- **The one real decision, stated:** `match_states` String→DateTime is **OUT** — public wire,
  test-pinned roundtrip, `StrictIgnoringModel` import-shape tolerance, SQLite-only migration
  evidence, and a file P4 has already had to fix a write-ordering bug in. Overrule cost stated
  concretely (own slice-let, M, F-DM-11 binding, a test the working practices say to flag rather
  than edit).
- **Every gate was measured against the tree before being written** — the last two slices shipped
  three unfireable gates and this plan does not add a fourth. Before/after counts recorded:
  `class MatchScore` 2→1 · `_row_to_dto` 13→0 · the four-member status union **8→2** ·
  `BracketTournamentDTO['events']` 1→0 · `backend/` in entrant 11→3 (the residue is three
  **correct** `tests/backend/unit/…` citations, named individually so the gate is not written
  against an unreachable 0). Task 3 Step 6 explicitly forbids satisfying its gate by rewording
  prose. **Three gates were caught and rewritten during self-review**, each by running the
  pattern instead of trusting the audit or a prior partial grep: the status union was drafted
  "3→2" from the audit's declaration count but actually returns **8**; `_row_to_dto` was drafted
  **7** from a `--include=*.py`-limited grep but actually returns **13**; and the entrant
  `backend/` decomposition was drafted from two *different* greps merged by eye, which invented a
  `session.server.ts` residue that is not in the 11 at all. That is exactly the failure mode
  behind the last two slices' three unfireable gates — the fix is always the same full,
  unfiltered listing.
- **Findings whose *fix* changed between the audit and now, re-anchored:** F-DM-43 is a
  **deletion** (the `core/schemas.py` twin is dead tree-wide), not the validation reconciliation
  the audit implies — which is what moved it from "behavioral" to "cosmetic". F-DM-48 has already
  shrunk from four alias consumers to one. F-DM-59 is 8 stale citations, not 14. F-DM-60's two
  closable unions were verified against their emitter; the third was not, so it is
  verify-then-decide instead of assumed.
- **Unowned defects:** checked and stated — neither the `_adoptable` adoption-path divergence nor
  the orphan roster-blob row is adjacent to any file in this plan's file map.
- **Rulings:** `DM1_RULINGS.md` read in full. Nothing binds a cosmetic edit; two rulings *remove*
  work (R-DM-9 → F-DM-49 closed by mechanism; R-DM-11 → F-DM-57 is P7's, explicitly "do not
  touch").
- **Line numbers** anchor to **`b86162e2`**. Re-anchor by symbol if the tree has moved.
