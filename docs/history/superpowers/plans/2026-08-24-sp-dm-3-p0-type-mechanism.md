# SP-DM-3 · P0 — Install the type mechanism (parity oracle)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop hand-reconciling the type mirrors by eye. Wire `apps/console/src/api/dto.generated.ts` — 10,677 generated lines with **zero importers** today — as a machine-checked **parity oracle** for the console hand mirror (`api/dto.ts`) and the entrant tier's hand mirrors, with the known divergences allow-listed in one place and ratcheted to zero, never silenced. Delete the dead `MatchStateOut`. **No migrations. No behavior change to runtime code** — the only production-code deletion in this slice is `MatchStateOut` (0 references); everything else is tests + config.

**Ruled by:** `R-DM-9` option (a) — `docs/history/programs/DM1_RULINGS.md:164-173`:

> Wire `dto.generated.ts` as a parity oracle — a test asserting `api/dto.ts` matches the generated shapes, with the known divergences allow-listed and ratcheted to zero, never silenced. Option (c) (import it directly, delete the hand mirror) is the eventual end-state once divergences reach zero.

Resolves `F-DM-27`, `F-DM-28a`, `F-DM-28b`, `F-DM-29`, `F-DM-45`, `F-DM-49` (F-DM-28b/29 become *visible and gated*, not fixed — see the ceiling note below).

**Branch (controller ruling, 2026-08-24):** `dm3/p0-type-mechanism` stacked **off `dm3/p3-minting-gaps` @ `78e30101`**, *not* off `main`. P3 changed both DTO mirrors — `dto.ts` gained `entryPlayerId`, and `dto.generated.ts` was regenerated with `askBirthYear` + `entryPlayerId`. An oracle built off `main` would bake stale baselines (allow-list entries and pinned counts) that conflict on merge.

```bash
git checkout dm3/p3-minting-gaps && git checkout -b dm3/p0-type-mechanism
```

**Spec pointers:**
- Program card **§C0**: `docs/history/superpowers/plans/2026-08-24-sp-dm-3-domain-unification-program.md:43-44`.
- Design doc **P0 phase text**: `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md:103-109`.
- Audit findings: `docs/history/audits/2026-08-24-domain-model-audit.md:479` (F-DM-27), `:480` (F-DM-28a), `:481` (F-DM-28b), `:482` (F-DM-29), `:503` (F-DM-45), `:507` (F-DM-49).
- Model for the test shape: `apps/console/src/store/__tests__/nonSchedulingKeys.parity.test.ts:12-19` — a cross-package `readFileSync` + set compare. (The card cites this under `apps/entrant/`; it actually lives in **console** and reads a `packages/` file. That precedent — a console-side test policing a cross-package contract — is load-bearing below.)

---

## Global Constraints

These bind P0 exactly as they bind every phase (program plan `:13-22`):

- **No phase re-decides anything ruled.** P0 adds a gate, not a refactor: no FK anywhere (R2), no match-record merge or shared match/score value object (**ADR 0006** — relevant here because `MatchStateDTO`'s 9 hand-only fields are drift to *record*, not to unify); no rename of `tournaments`/`tournament_id`/`tournamentStore` (ADR 0014); the 2026-08-23 minting rule is untouched.
- **The F-DM-11 test-schema trap** does not apply (no FKs in this slice) — noted so a later reader does not go looking.
- Backend list queries: stable tiebreaker `created_at DESC, id DESC` — not touched here.
- Commits are **path-limited** (`git commit -- <paths>`); never `git add .`.
- Gate before claiming done: the specific suite for the change, then `make check` at slice end.
- Console DTO changes: `make generate-api`, then reconcile `apps/console/src/api/dto.ts` **by hand**. P0 makes that reconciliation machine-checked; it does not replace it.
- **P0-specific:** the oracle is **keys-only**. Types and optionality are deliberately unpoliced — a prototype run against `78e30101` counts **71** optionality mismatches on the 53 auto-paired console shapes, almost all Pydantic defaults rendering as `?`. Policing those is R-DM-9(c) territory and would bury the 19 real key divergences. The allow-list carries a `kind` field so an optionality pass can be added later without reformatting it.

**Run commands (this repo):**
- console vitest: `npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts`
- entrant vitest: `npm --prefix apps/entrant run test:run -- tests/dtoParity.test.ts`
- backend pytest (repo root): `.venv/Scripts/python.exe -m pytest tests/backend/test_dto_generated_freshness.py -q`
- knip: `npm --prefix apps/console run knip`
- full gate: `make check`

**Line numbers are anchored to `78e30101`. Re-anchor by symbol, not line, if the tree has moved.**

---

## File map

| File | Change |
|---|---|
| `apps/api/src/core/schemas.py` | **Delete** `MatchStateOut` (`:1175-1197`, end of file). Only production-code change in the slice. |
| `tests/backend/test_dto_generated_freshness.py` | **New.** The oracle's freshness half: live OpenAPI vs the committed generated file. |
| `apps/console/src/api/__tests__/dtoParity.test.ts` | **New.** Console hand mirror vs the generated schemas. |
| `apps/console/src/api/__tests__/dtoParity.allowlist.json` | **New.** The single allow-list, read by both tiers. |
| `apps/entrant/tests/dtoParity.test.ts` | **New.** The entrant hand mirrors vs the same generated schemas. |
| `apps/console/knip.json` | `:5` exclusion re-justified (see Task 5). |
| `apps/console/vitest.config.ts` | `:22` exclusion re-justified (see Task 5). |
| `docs/history/programs/DM3_PROGRESS.md` | Ledger row for P0. |

**Not in scope:** `apps/entrant/public/assets/entrants-filter.d.ts`. Despite sitting beside `my-entries.d.ts`, it declares two **local script function signatures** (`matches()`, `apply()` — `entrants-filter.d.ts:1-7`), not a wire DTO. It is not one of F-DM-29's four mirrors and has no backend twin to be parity-checked against. Excluded, reason recorded here.

**The four entrant hand-mirror files** (F-DM-29, audit `:482`) are:
`apps/entrant/app/lib/draws.types.ts`, `apps/entrant/app/lib/entryPage.types.ts`, `apps/entrant/app/lib/player.types.ts`, `apps/entrant/public/assets/my-entries.d.ts`.

---

### Task 1: Delete the dead `MatchStateOut` (F-DM-45)

**Files:** Modify (delete from): `apps/api/src/core/schemas.py:1175-1197`.

**Interfaces:** Consumes nothing. Produces nothing. This is a pure deletion — the class has **zero references** in the tracked tree (verified at `78e30101`; the only other hit, `.claude/worktrees/p7-public-entrant/…/schemas.py:1155`, is a gitignored stale snapshot — `.gitignore:32` — and `rg` skips it by default).

Do this **first** so the oracle tasks are never comparing against a shape that is about to vanish.

- [ ] **Step 1: Prove it is dead before deleting**

```bash
rg "MatchStateOut" apps packages tests tools docs
rg -c "MatchStateOut" apps/console/src/api/dto.generated.ts
```

Expected: the *only* hit is the declaration in `apps/api/src/core/schemas.py`; the generated-file count is **0** (an unrouted Pydantic model never enters the OpenAPI document — which is why this deletion needs **no** `make generate-api`). If either expectation fails, **stop and report** — a reference means F-DM-45's premise moved.

- [ ] **Step 2: Delete it** — remove `class MatchStateOut(BaseModel):` and its whole body (`apps/api/src/core/schemas.py:1175-1197`, currently the last statement in the file). Leave the file ending with a single trailing newline after the preceding class.

The docstring it carries admits the state it is being deleted for — *"NOTE (Task 5): This DTO is defined here but not yet wired to a GET endpoint. The serialisation site will be added in a follow-up task"*. That follow-up never came; the Run surface ships against `match_state_routes.py`'s own shape (`operations/match_state_routes.py:108-118`). Nothing to preserve.

- [ ] **Step 3: Verify the deletion gate + that nothing imported it transitively**

```bash
rg "MatchStateOut" apps packages tests tools     # expect: 0 hits
.venv/Scripts/python.exe -m pytest tests/backend -q -x
```
Expected: `rg` returns nothing; pytest green (an import error would surface immediately — `schemas.py` is imported by nearly every route module).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(api): delete dead MatchStateOut (F-DM-45)" -- apps/api/src/core/schemas.py
```

---

### Task 2: The freshness half — live OpenAPI vs the committed generated file

**Files:** Create: `tests/backend/test_dto_generated_freshness.py`.

**Interfaces:**
- Consumes: `core.main.app` (`app.openapi()` — exactly what `tools/generate_openapi.py:26` dumps; that script does **no** post-processing, so comparing against `app.openapi()` directly is faithful and needs no subprocess). `tests/backend/conftest.py` already puts `apps/api/src` on `sys.path`.
- Produces: nothing importable. This test is the reason a Pydantic field-add can redden **before** anyone edits a hand mirror — without it, adding a field to a response model leaves generated + hand mirrors equally stale and equally green.

**Why a pytest and not a vitest:** vitest cannot build the FastAPI app. The oracle is therefore a **two-link chain** — this test catches *generated-vs-live* drift; Tasks 3 and 4 catch *hand-vs-generated* drift. See the NC reading in Task 5 Step 2.

- [ ] **Step 1: Write the test** — create `tests/backend/test_dto_generated_freshness.py`:

```python
"""``dto.generated.ts`` is fresh against the live OpenAPI document.

The freshness half of P0's parity oracle (R-DM-9a). The console and entrant
parity tests (``apps/console/src/api/__tests__/dtoParity.test.ts``,
``apps/entrant/tests/dtoParity.test.ts``) compare the hand mirrors against
the COMMITTED generated file; that comparison is only worth anything if the
committed file still describes the app. This test is what makes a field
added to a Pydantic response model red BEFORE anybody edits a mirror:
regenerating (``make generate-api``) is the mechanical fix, and the two
vitest suites then redden until the hand mirrors follow.

Keys only, by ruling (P0 plan, Global Constraints): types and optionality
are not policed here — 71 optionality mismatches exist by construction
(Pydantic defaults render as ``?``) and are R-DM-9(c) territory.
"""
from __future__ import annotations

import re
from pathlib import Path

from core.main import app

GENERATED = (
    Path(__file__).resolve().parents[2]
    / "apps" / "console" / "src" / "api" / "dto.generated.ts"
)

# openapi-typescript emits `components.schemas` with a fixed indentation:
# the schema name at 8 spaces, its properties at 12. Anything deeper is a
# nested inline object and is deliberately invisible to this parser.
# ponytail: indentation regex over a machine-formatted file, not a TS parse.
# If openapi-typescript's formatting ever changes, _parse_generated() finds
# zero schemas and the pinned-floor assertion below fails loudly.
_SCHEMA = re.compile(r"^ {8}([A-Za-z_][A-Za-z0-9_]*): \{$")
_FIELD = re.compile(r"^ {12}([A-Za-z_][A-Za-z0-9_]*)\??:")
_CLOSE = re.compile(r"^ {8}\};$")


def _parse_generated() -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    current: str | None = None
    for line in GENERATED.read_text(encoding="utf-8").splitlines():
        m = _SCHEMA.match(line)
        if m:
            current = m.group(1)
            out[current] = set()
            continue
        if current is None:
            continue
        f = _FIELD.match(line)
        if f:
            out[current].add(f.group(1))
        elif _CLOSE.match(line):
            current = None
    return out


def _live_object_schemas() -> dict[str, set[str]]:
    schemas = app.openapi()["components"]["schemas"]
    return {
        name: {k for k in body["properties"] if k.isidentifier()}
        for name, body in schemas.items()
        if "properties" in body and name.isidentifier()
    }


def test_the_generated_file_still_parses():
    """Guards the parser itself: a formatting change must fail loudly here,
    not quietly turn every comparison below into a no-op."""
    parsed = _parse_generated()
    assert len(parsed) >= 180, f"parsed only {len(parsed)} schemas"


def test_the_generated_and_live_schema_NAMES_match_both_ways():
    """Both directions on purpose. live-not-generated catches a field/model
    ADD that was never regenerated; generated-not-live catches a DELETE or a
    RENAME that was never regenerated - without which the parity tests would
    keep happily auto-pairing a hand shape against a ghost schema. P1 renames
    standings DTOs, so this direction is not hypothetical."""
    generated, live = set(_parse_generated()), set(_live_object_schemas())
    assert sorted(live - generated) == [], (
        "dto.generated.ts is STALE - these response models are not in it: "
        f"{sorted(live - generated)}. Run `make generate-api` and commit."
    )
    assert sorted(generated - live) == [], (
        "dto.generated.ts is STALE - these schemas no longer exist in the "
        f"app: {sorted(generated - live)}. Run `make generate-api` and commit."
    )


def test_generated_schema_keys_match_the_live_schema_keys():
    generated = _parse_generated()
    drift = {}
    for name, live_keys in _live_object_schemas().items():
        gen_keys = generated.get(name)
        if gen_keys is None:
            continue  # reported by the test above
        if live_keys != gen_keys:
            drift[name] = {
                "live_only": sorted(live_keys - gen_keys),
                "generated_only": sorted(gen_keys - live_keys),
            }
    assert not drift, (
        "dto.generated.ts is STALE against the live schema: "
        f"{drift}. Run `make generate-api` and commit the result."
    )
```

- [ ] **Step 2: Run it — expect GREEN**

Run: `.venv/Scripts/python.exe -m pytest tests/backend/test_dto_generated_freshness.py -q`
Expected: **3 passed.** P3 regenerated the file at `f8a69862`, so it is fresh at this base. If it is red at step 2, the fix is `make generate-api` + commit the regenerated file **in this task** — do not weaken the test.

- [ ] **Step 3: Demonstrate RED (NC 1, backend half)** — this is the negative control; it is a temporary edit, reverted in the same step.

Add a throwaway field to any `response_model` Pydantic class, e.g. in `apps/api/src/core/schemas.py`, `EntryDeskRowDTO`: `nc_probe: Optional[str] = None`.

Run: `.venv/Scripts/python.exe -m pytest tests/backend/test_dto_generated_freshness.py -q`
Expected: **FAIL** — `test_generated_schema_keys_match_the_live_schema_keys` reports `EntryDeskRowDTO: {'live_only': ['nc_probe'], ...}`.

Then **revert the probe** (`git checkout -- apps/api/src/core/schemas.py`) and re-run: green. Record the observed failure text in the ledger at Task 6; do **not** commit the probe.

- [ ] **Step 4: Commit**

```bash
git commit -m "test(api): dto.generated.ts freshness oracle vs live OpenAPI (R-DM-9a)" -- tests/backend/test_dto_generated_freshness.py
```

---

### Task 3: The console parity oracle + the allow-list

**Files:**
- Create: `apps/console/src/api/__tests__/dtoParity.test.ts` (console vitest `include` is `src/**/__tests__/**/*.{test,spec}.{ts,tsx}` — `vitest.config.ts:11`).
- Create: `apps/console/src/api/__tests__/dtoParity.allowlist.json`.
- Reads (never writes): `apps/console/src/api/dto.ts` (`:1-15` header says "DO NOT EDIT THIS FILE WITHOUT VERIFYING IT MATCHES dto.generated.ts" — this task is that verification, mechanized), `apps/console/src/api/dto.generated.ts` (`components.schemas` opens at `:3074-3075`).

**Interfaces:**
- Produces: the allow-list JSON schema below, and the file path `src/api/__tests__/dtoParity.allowlist.json`. **Task 4 reads that exact file across packages, and Task 5 asserts against three of its entries — its shape is a contract between tasks.**

Allow-list entry shape (flat array; one object per divergent **field**):

```json
{ "shape": "PlayerDTO", "field": "status", "side": "hand-only", "kind": "violation", "why": "F-DM-28a - refused by the backend StrictModel (extra=forbid); a write would 422. Delete from dto.ts to close." }
```

- `side`: `"hand-only"` (field in the mirror, not in the wire) or `"generated-only"`.
- `kind`: `"violation"` (the mirror is wrong and must be fixed to close) or `"accepted"` (a recorded, ruled divergence). Reserved for a future `"optionality"` pass — see Global Constraints.
- `why`: **must** cite an `F-DM-*` finding or a ruling. No bare "known".

**Pairing rule (console):** auto-pair by **name** — every `export interface|type` in `dto.ts` whose name is also a `components.schemas` key — plus one explicit alias, `EntryDTO → EntryDeskRowDTO` (F-DM-49: the same 12-field shape under two names). Auto-pairing is **fail-loud**: a coincidental name collision produces a divergence the test *reports*, never a silent pass. Measured at `78e30101`: **53 auto-pairs, 19 divergent fields**, all hand-only, across 6 shapes.

- [ ] **Step 1: Write the test** — create `apps/console/src/api/__tests__/dtoParity.test.ts`:

```typescript
/**
 * The parity oracle (R-DM-9a, SP-DM-3 P0): `api/dto.ts` is checked against
 * the generated `api/dto.generated.ts` shapes, key by key.
 *
 * `dto.ts:14` says "DO NOT EDIT THIS FILE WITHOUT VERIFYING IT MATCHES
 * dto.generated.ts". Until now that verification was a human's eyes, and
 * F-DM-28a/28b are what the eyes missed. Freshness of the generated file
 * itself is the backend half of this oracle:
 * `tests/backend/test_dto_generated_freshness.py`.
 *
 * Keys only, by ruling — types and optionality are not policed (P0 plan,
 * Global Constraints).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import allowlist from './dtoParity.allowlist.json';

const API_DIR = resolve(__dirname, '..');

/** Every generated schema name -> its property names.
 *  ponytail: indentation regex over a machine-formatted file, not a TS
 *  parse. The pinned floor in the first test is what makes a formatting
 *  change fail loudly instead of emptying the comparison. */
export function parseGenerated(source: string): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  let current: string | null = null;
  for (const line of source.split(/\r?\n/)) {
    const open = /^ {8}([A-Za-z_][A-Za-z0-9_]*): \{$/.exec(line);
    if (open) {
      current = open[1];
      out[current] = new Set();
      continue;
    }
    if (!current) continue;
    const field = /^ {12}([A-Za-z_$][A-Za-z0-9_$]*)\??:/.exec(line);
    if (field) out[current].add(field[1]);
    else if (/^ {8}\};$/.test(line)) current = null;
  }
  return out;
}

/** Every top-level `export interface|type X { ... }` -> its member names.
 *  `[^{]*` absorbs `extends Y` and generics; unions without a body (e.g.
 *  `export type X = 'a' | 'b';`) have no `{` and are correctly skipped. */
export function parseHand(source: string): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  let current: string | null = null;
  for (const line of source.split(/\r?\n/)) {
    const open = /^export (?:interface|type) ([A-Za-z_][A-Za-z0-9_]*)[^{]*\{/.exec(line);
    if (open) {
      current = open[1];
      out[current] = new Set();
      continue;
    }
    if (!current) continue;
    const field = /^ {2}([A-Za-z_$][A-Za-z0-9_$]*)\??:/.exec(line);
    if (field) out[current].add(field[1]);
    else if (/^\}/.test(line)) current = null;
  }
  return out;
}

/** F-DM-49: the same shape under two names. */
const ALIASES: Record<string, string> = { EntryDTO: 'EntryDeskRowDTO' };

type AllowEntry = { shape: string; field: string; side: string; kind: string; why: string };

const generatedSource = readFileSync(resolve(API_DIR, 'dto.generated.ts'), 'utf-8');
const handSource = readFileSync(resolve(API_DIR, 'dto.ts'), 'utf-8');
const generated = parseGenerated(generatedSource);
const hand = parseHand(handSource);

/** Every divergent (shape, field, side) the oracle can see right now. */
export function divergences(): AllowEntry[] {
  const found: AllowEntry[] = [];
  for (const [name, handKeys] of Object.entries(hand)) {
    const wire = generated[ALIASES[name] ?? name];
    if (!wire) continue; // frontend-private type: no wire twin, nothing to police
    for (const k of handKeys) if (!wire.has(k)) found.push({ shape: name, field: k, side: 'hand-only', kind: '', why: '' });
    for (const k of wire) if (!handKeys.has(k)) found.push({ shape: name, field: k, side: 'generated-only', kind: '', why: '' });
  }
  return found;
}

const key = (e: { shape: string; field: string; side: string }) => `${e.shape}.${e.field}:${e.side}`;

describe('console DTO parity oracle', () => {
  it('parses both files (guards the parsers themselves)', () => {
    // Pinned at 78e30101: 180 generated schemas, 64 hand shapes, 53 pairs.
    // These floors are PARSER guards, not a ratchet: lower them freely when
    // shapes are deliberately deleted (R-DM-9(c)'s end-state shrinks dto.ts;
    // P1's own gate is 9 declarations -> <=3). Only the ALLOW-LIST cap below
    // is a ratchet, and raising that one is a ruling.
    expect(Object.keys(generated).length).toBeGreaterThanOrEqual(180);
    expect(Object.keys(hand).length).toBeGreaterThanOrEqual(64);
    // Every `export interface` HAS a body, so every one must have parsed -
    // a silently skipped shape is the parser's only fail-dangerous mode.
    for (const [, name] of handSource.matchAll(/^export interface ([A-Za-z_][A-Za-z0-9_]*)/gm)) {
      expect(Object.keys(hand)).toContain(name);
    }
    const paired = Object.keys(hand).filter((n) => generated[ALIASES[n] ?? n]);
    expect(paired.length).toBeGreaterThanOrEqual(53);
  });

  it('dto.ts matches the generated shapes, except the allow-listed divergences', () => {
    const allowed = new Set((allowlist as AllowEntry[]).map(key));
    const unexpected = divergences().filter((d) => !allowed.has(key(d)));
    expect(unexpected).toEqual([]);
  });

  it('the allow-list only shrinks: every entry is still a real divergence', () => {
    const live = new Set(divergences().map(key));
    const stale = (allowlist as AllowEntry[]).filter((e) => !live.has(key(e)));
    expect(stale).toEqual([]); // fixed a divergence? delete its allow-list line.
  });

  it('the allow-list is capped and every entry cites its reason', () => {
    const entries = allowlist as AllowEntry[];
    // RATCHET: this number may only go DOWN. Raising it is a ruling, not an edit.
    expect(entries.length).toBeLessThanOrEqual(19);
    for (const e of entries) {
      expect(e.why).toMatch(/F-DM-\d+|R-DM-\d+|ADR \d+/);
      expect(['violation', 'accepted']).toContain(e.kind);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail (RED)**

Run: `npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts`
Expected: FAIL — the allow-list file does not exist yet (module-not-found), and once created empty, the second test lists **19** unexpected divergences. That list is the RED state the allow-list is written against.

- [ ] **Step 3: Write the allow-list** — create `apps/console/src/api/__tests__/dtoParity.allowlist.json` from the 19 divergences the test just printed. Measured at `78e30101` (re-derive from the actual failure output; do not trust this table if it disagrees):

| shape | fields (all `hand-only`) | kind | why |
|---|---|---|---|
| `PlayerDTO` | `status`, `withdrawalReason`, `withdrawnAt` | `violation` | F-DM-28a — refused by the backend `StrictModel` (`extra="forbid"`); a write carrying them 422s. The one read (`modules/operations/run/MeetMatchPanel.tsx:70`, `p.status !== 'withdrawn'`) is a permanent no-op. |
| `MatchStateDTO` | `actualCourtId`, `actualSlotId`, `delayed`, `delayReason`, `delayedPlayerId`, `postponed`, `pinned`, `playerConfirmations`, `sets` | `violation` | F-DM-28b — 19 hand fields against the wire's 10; the nine are dropped by `StrictIgnoringModel` and hand-preserved in `hooks/useLiveTracking.ts:269-276`. Live-ops state has two half-authorities. Closing this is P1/P4 work, not P0. |
| `RosterGroupDTO` | `type`, `parentId`, `children`, `playerIds` | `violation` | F-DM-29 class (client-side roster tree fields absent from the wire shape). |
| `MatchDTO` | `eventCode` | `violation` | F-DM-29 class. |
| `TournamentStateDTO` | `recoveredFromBackup` | `violation` | F-DM-29 class. |
| `InviteCreatedDTO` | `email` | `violation` | F-DM-29 class. |

Write each as one JSON object with the full `why` text (finding id + one sentence of what closing it means). File shape:

```json
[
  { "shape": "PlayerDTO", "field": "status", "side": "hand-only", "kind": "violation", "why": "F-DM-28a - ..." }
]
```

If the real failure output differs from the table (extra or missing entries), **use the output and note the delta in the ledger** — the table is a 78e30101 snapshot, not an authority.

- [ ] **Step 4: Run again — expect GREEN**

Run: `npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts`
Expected: **4 passed.** Then confirm the ratchet bites: temporarily delete one allow-list line → test 2 fails (unexpected divergence); temporarily invent an entry for a non-existent field → test 3 fails (stale entry). Revert both.

- [ ] **Step 5: Type gate**

Run: `npm --prefix apps/console run build`
Expected: PASS. (`resolveJsonModule` — if `tsc` rejects the JSON import, the fallback is `JSON.parse(readFileSync(...))`, matching `nonSchedulingKeys.parity.test.ts:17`. Prefer the fallback over touching `tsconfig`.)

- [ ] **Step 6: Commit**

```bash
git commit -m "test(console): dto.ts parity oracle vs dto.generated.ts (R-DM-9a, F-DM-27)" -- apps/console/src/api/__tests__/dtoParity.test.ts apps/console/src/api/__tests__/dtoParity.allowlist.json
```

---

### Task 4: The entrant tier's four hand mirrors (F-DM-29)

**Files:** Create: `apps/entrant/tests/dtoParity.test.ts` (entrant vitest `include` is `tests/**/*.test.ts` — `apps/entrant/vitest.config.ts`; env is `node`, so `node:fs` is available).

**Interfaces:**
- Consumes: `apps/console/src/api/dto.generated.ts` and `apps/console/src/api/__tests__/dtoParity.allowlist.json` by relative path across packages — the same read direction `nonSchedulingKeys.parity.test.ts:13-17` already establishes, so no new coupling direction is introduced. The two parser functions are **copied** from Task 3, not imported (see the judgment call in the Self-review record).
- Produces: nothing importable.

**Pairing rule (entrant): an EXPLICIT map, not auto-by-name.** Two entrant shapes collide by name with *unrelated* backend schemas — entrant `EntryPageDTO` is the page **projection** (backend `EntryPageProjection`, `dto.generated.ts:4056`) while generated `EntryPageDTO` (`:3999`) is the operator's page **config**; likewise entrant `EntryEventDTO` vs the operator's `EntryEventDTO` (`:3971`). Auto-pairing would compare the wrong shapes. The map below is derived from `EntryPageProjection`'s own member types (`dto.generated.ts:4056-4073`) — verify each at execution time.

- [ ] **Step 1: Write the test** — create `apps/entrant/tests/dtoParity.test.ts`:

```typescript
/**
 * The entrant tier's hand mirrors are checked against the generated OpenAPI
 * shapes (R-DM-9a, SP-DM-3 P0; F-DM-29: "a fully hand-maintained mirror of
 * Pydantic response models with no generator and no cross-tier contract
 * test - nothing fails when a backend field changes shape"). This is that
 * test.
 *
 * Reads the console package's generated file and the single allow-list -
 * the same cross-package read direction as
 * `apps/console/src/store/__tests__/nonSchedulingKeys.parity.test.ts`.
 *
 * PAIRS is explicit, NOT auto-by-name: entrant `EntryPageDTO` /
 * `EntryEventDTO` collide with unrelated operator-side schemas of the same
 * name, and auto-pairing would compare the wrong shapes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const CONSOLE_API = resolve(REPO, 'apps/console/src/api');

// ponytail: the two parsers are copied from
// apps/console/src/api/__tests__/dtoParity.test.ts - ~30 lines duplicated
// rather than inventing a shared test-util package for two consumers.
// Extract when a third tier needs them.
function parseGenerated(source: string): Record<string, Set<string>> { /* verbatim from Task 3 */ }
function parseHand(source: string): Record<string, Set<string>> { /* verbatim from Task 3 */ }

/** hand shape -> generated schema name, per mirror file. */
const MIRRORS: { file: string; pairs: Record<string, string>; unpaired: Record<string, string> }[] = [
  {
    file: 'apps/entrant/app/lib/entryPage.types.ts',
    pairs: {
      EntryPageDTO: 'EntryPageProjection',
      EntryTournamentDTO: 'TournamentDTO',
      EntryNamedDTO: 'NamedDTO',
      EntryVenueDTO: 'VenueDTO',
      EntryPageContentDTO: 'PageDTO',
      EntryPolicyDTO: 'PolicyDTO',
      EntryPublicationDTO: 'PublicationDTO',
      EntryEventDTO: 'EventDTO',
      EntrantListRowDTO: 'EntrantRowDTO',
      EntryPageViewerDTO: 'ViewerDTO',
    },
    unpaired: {},
  },
  { file: 'apps/entrant/app/lib/draws.types.ts', pairs: { /* name-identical: DrawCardDTO, DrawsIndexDTO, TeamDTO, ... */ }, unpaired: {} },
  { file: 'apps/entrant/app/lib/player.types.ts', pairs: { /* PlayerPageDTO, PlayerMatchDTO, PlayerMatchSideDTO, PlayerEventDTO, PlayerRecordDTO */ }, unpaired: {} },
  {
    file: 'apps/entrant/public/assets/my-entries.d.ts',
    pairs: { MyEntriesDTO: 'MyEntriesDTO', MyEntryLine: 'MyEntryLineDTO', MyTournamentCard: 'MyTournamentCardDTO' },
    unpaired: {},
  },
];
```

then, for each mirror, three assertions in the same grammar as Task 3:

```typescript
const generated = parseGenerated(readFileSync(resolve(CONSOLE_API, 'dto.generated.ts'), 'utf-8'));
const allowlist = JSON.parse(
  readFileSync(resolve(CONSOLE_API, '__tests__/dtoParity.allowlist.json'), 'utf-8'),
) as { shape: string; field: string; side: string; kind: string; why: string }[];
const key = (e: { shape: string; field: string; side: string }) => `${e.shape}.${e.field}:${e.side}`;

describe.each(MIRRORS)('entrant DTO parity: $file', ({ file, pairs, unpaired }) => {
  const hand = parseHand(readFileSync(resolve(REPO, file), 'utf-8'));

  it('every hand shape is either paired or explicitly unpaired with a reason', () => {
    // No shape drifts unpoliced by simply being forgotten.
    expect(Object.keys(hand).sort()).toEqual([...Object.keys(pairs), ...Object.keys(unpaired)].sort());
    for (const why of Object.values(unpaired)) expect(why.length).toBeGreaterThan(20);
  });

  it('every paired schema exists in the generated file', () => {
    for (const schema of Object.values(pairs)) expect(Object.keys(generated)).toContain(schema);
  });

  it('keys match, except the allow-listed divergences', () => {
    const allowed = new Set(allowlist.map(key));
    const unexpected: unknown[] = [];
    for (const [name, schema] of Object.entries(pairs)) {
      const wire = generated[schema];
      for (const k of hand[name]) if (!wire.has(k) && !allowed.has(key({ shape: name, field: k, side: 'hand-only' }))) unexpected.push(`${name}.${k} hand-only`);
      for (const k of wire) if (!hand[name].has(k) && !allowed.has(key({ shape: name, field: k, side: 'generated-only' }))) unexpected.push(`${name}.${k} generated-only`);
    }
    expect(unexpected).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and fill in the map (RED → GREEN)**

Run: `npm --prefix apps/entrant run test:run -- tests/dtoParity.test.ts`
Iterate: the first assertion names every hand shape you have not yet placed in `pairs` or `unpaired`. Fill `pairs` where a generated schema genuinely corresponds (**verify against the referring schema's member types in `dto.generated.ts`, never by name alone**); put anything with no wire twin in `unpaired` with a one-sentence reason. Then let the third assertion produce the divergence list.

Measured at `78e30101` with name-matching only, `draws.types.ts`, `player.types.ts` and `my-entries.d.ts` show **zero** divergences once aliased; `entryPage.types.ts`'s apparent divergences were the two name collisions, and should vanish under the explicit map. **Expect a near-empty entrant contribution to the allow-list.** If real divergences remain, append them to `apps/console/src/api/__tests__/dtoParity.allowlist.json` with an `F-DM-29` citation and **raise the Task 3 cap by exactly that many, noting it in the ledger** — that is the only sanctioned raise in this slice, and it happens once, at install.

- [ ] **Step 3: Entrant gates**

Run: `npm --prefix apps/entrant run test:run` then `npm --prefix apps/entrant run typecheck` and `npm --prefix apps/entrant run depcruise`
Expected: all pass. The test reads files with `node:fs`; it imports nothing from `apps/console`, so no depcruise boundary is crossed.

- [ ] **Step 4: Commit**

```bash
git commit -m "test(entrant): parity oracle for the four hand mirrors (R-DM-9a, F-DM-29)" -- apps/entrant/tests/dtoParity.test.ts apps/console/src/api/__tests__/dtoParity.allowlist.json apps/console/src/api/__tests__/dtoParity.test.ts
```

(The allow-list and the console test are in the path list only if step 2 changed them.)

---

### Task 5: Negative controls + the knip / vitest exclusions

**Files:**
- Modify: `apps/console/src/api/__tests__/dtoParity.test.ts` (append one NC test).
- Modify: `apps/console/knip.json:5`, `apps/console/vitest.config.ts:22`.

**Interfaces:** Consumes `divergences()` exported by Task 3's test module (it is exported for exactly this). Produces nothing.

- [ ] **Step 1: NC 2 — F-DM-28a's three fields asserted AS violations**

Append to `apps/console/src/api/__tests__/dtoParity.test.ts`:

```typescript
describe('NC: the oracle SEES F-DM-28a (it is allow-listed, not silenced)', () => {
  it('reports PlayerDTO status / withdrawalReason / withdrawnAt as hand-only divergences', () => {
    // The allow-list stops these from failing the suite. This asserts the
    // oracle still DETECTS them - so deleting the allow-list entries is the
    // only way to make them go away, and quietly widening the allow-list
    // cannot hide them. R-DM-9a: "ratcheted to zero, never silenced".
    const seen = divergences().filter((d) => d.shape === 'PlayerDTO').map((d) => d.field).sort();
    expect(seen).toEqual(['status', 'withdrawalReason', 'withdrawnAt']);
    const listed = (allowlist as AllowEntry[]).filter((e) => e.shape === 'PlayerDTO');
    expect(listed).toHaveLength(3);
    for (const e of listed) {
      expect(e.kind).toBe('violation');
      expect(e.why).toContain('F-DM-28a');
    }
  });
});
```

**Deliberate deviation, recorded:** the design doc (`:107`) words NC 2 as "the test fails today until they are dropped". Shipping P0 with a red suite is not shippable, and dropping the three fields would be a production-code change this slice's scope forbids. The controller's framing — *"allow-listed divergences, ratcheted to zero, never silenced"* — is implemented instead: the failure is allow-listed, the **detection** is asserted. Closing F-DM-28a = delete the three fields from `dto.ts:291-293`, delete the three allow-list lines, delete this NC test. Log that as a debt-log row in Task 6.

Run: `npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts` → **5 passed.**

- [ ] **Step 2: NC 1 — a Pydantic field-add reddens both tiers** (temporary edit, reverted)

The card's NC reads *"a field added to a Pydantic response model reddens both tiers before any hand edit"*. **Reading, stated explicitly:** the oracle is a two-link chain, and `make generate-api` is a mechanical regeneration, **not a hand edit**. So:

1. Add `nc_probe: Optional[str] = None` to `EntryDeskRowDTO` (`apps/api/src/core/schemas.py`) **and** to a shape the entrant tier mirrors — `MyEntryLineDTO` in `apps/api/src/entries/entries_me.py` (locate by symbol).
2. Run `.venv/Scripts/python.exe -m pytest tests/backend/test_dto_generated_freshness.py -q` → **RED** (link 1: the generated file is stale).
3. Run `make generate-api` (no hand edit of any mirror).
4. Run `npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts` → **RED** on `EntryDTO.nc_probe generated-only`, and `npm --prefix apps/entrant run test:run -- tests/dtoParity.test.ts` → **RED** on `MyEntryLine.nc_probe generated-only`. **Both tiers, no hand edit.**
5. Revert everything: `git checkout -- apps/api/src/core/schemas.py apps/api/src/entries/entries_me.py apps/console/src/api/dto.generated.ts`, then re-run all three suites → green.

Record the four observed outcomes verbatim in the ledger (Task 6). Nothing from this step is committed.

- [ ] **Step 3: The `knip.json` + `vitest.config.ts` exclusions — re-justify (expected) or remove**

Both exclusions remain **earned**, and this step records why in the same commit as the oracle:
- **knip** (`apps/console/knip.json:5`): the parity tests read `dto.generated.ts` with `readFileSync`, which gives knip no importer — removing the ignore simply re-reds knip for a file that now has a policing consumer. Keep it, justified.
- **vitest coverage** (`apps/console/vitest.config.ts:22`): the file is types-only and never executes; without the exclusion it reports as a 10,677-line 0%-covered file. Keep it, justified.

Do this:
1. Try a note key in `knip.json`: `"//": "src/api/dto.generated.ts has no importer BY DESIGN - src/api/__tests__/dtoParity.test.ts reads it as TEXT (the R-DM-9a parity oracle). Re-justified 2026-08-24, SP-DM-3 P0."` Run `npm --prefix apps/console run knip`. If knip's schema rejects the unknown key, **drop the key** and put the same sentence in the test file's header comment instead — the justification must exist somewhere a reader of either file will find it.
2. In `apps/console/vitest.config.ts`, above the `exclude:` line, add:

```typescript
      // dto.generated.ts is excluded because it is types-only - it emits no
      // runtime code, so it can only ever report 0%. It is NOT unpoliced:
      // src/api/__tests__/dtoParity.test.ts parses it as the parity oracle
      // (R-DM-9a). Re-justified 2026-08-24, SP-DM-3 P0.
```

3. Run `npm --prefix apps/console run knip` and `npm --prefix apps/console run test:run` → both clean.

- [ ] **Step 4: Commit**

```bash
git commit -m "test(console): NC for F-DM-28a + re-justify the dto.generated exclusions (R-DM-9a)" -- apps/console/src/api/__tests__/dtoParity.test.ts apps/console/knip.json apps/console/vitest.config.ts
```

---

### Task 6: Slice gates, deletion-gate verification, ledger

**Files:** none new — verification only, plus `docs/history/programs/DM3_PROGRESS.md` and `docs/reference/debt-log.md`.

- [ ] **Step 1: The design doc's P0 deletion gates** (`:108`)

```bash
rg "MatchStateOut" apps packages tests tools          # expect: 0
rg -l "dto\.generated" apps packages tests tools      # expect: ONLY the two parity tests,
                                                      # knip.json, vitest.config.ts, Makefile,
                                                      # dto.ts's header comment, and
                                                      # platform/contracts/__tests__/publicUrlContract.test.ts:75
```
The `publicUrlContract` hit is a pre-existing exclusion (audit `:479`) and is **out of scope** — it excludes the generated file from a URL-shape scan for its own reason. Note it in the ledger; do not touch it.

- [ ] **Step 2: The negative controls, restated for the record**

- NC 1 (field-add reddens both tiers): performed in Task 5 Step 2 — paste the observed outputs into the ledger.
- NC 2 (F-DM-28a asserted as violations): standing test, `npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts`.
- Ratchet controls: performed in Task 3 Step 4 (delete an entry → red; invent an entry → red).

- [ ] **Step 3: Full gate**

Run: `make check`
Expected: green across both tiers (console lint/types/vitest/depcruise, entrant lint/types/vitest/depcruise, ruff, import-linter, pytest). Fix anything red before proceeding; report honestly if a failure is pre-existing — verify that by running the same gate on a clean `dm3/p3-minting-gaps` worktree or reading CI, **never** with `git stash`.

- [ ] **Step 4: Ledger + debt-log**

- `docs/history/programs/DM3_PROGRESS.md`: flip P0's row to DONE with the commit SHAs; record the final allow-list count (the ratchet's starting number), the NC 1 evidence, and any deviation from this plan.
- `docs/reference/debt-log.md`: one row per `kind: "violation"` cluster now under ratchet — **F-DM-28a** (3 fields; close by deleting `dto.ts:291-293` + the 3 allow-list lines + the NC test), **F-DM-28b** (9 fields; needs the live-ops state authority decided — P1/P4), and the four singletons (`RosterGroupDTO`, `MatchDTO.eventCode`, `TournamentStateDTO.recoveredFromBackup`, `InviteCreatedDTO.email`). Also record the **keys-only ceiling**: 71 optionality mismatches exist and are unpoliced by ruling (R-DM-9(c) territory).

- [ ] **Step 5: Commit the docs (path-limited), then stop**

```bash
git commit -m "docs: SP-DM-3 ledger - P0 type mechanism landed" -- docs/history/programs/DM3_PROGRESS.md docs/reference/debt-log.md
```

Merging `dm3/p0-type-mechanism` is Kyle's call (superpowers:finishing-a-development-branch). It is stacked on `dm3/p3-minting-gaps` — **P3 merges first, or the two merge together.** P1 (§C1) is unblocked by this slice and branches off whatever main becomes.

---

## Self-review record (plan author, 2026-08-24)

- **Spec coverage:** Card §C0's five clauses map to tasks — oracle for `dto.ts` → Task 3; "same shape for the entrant tier's four hand-mirror files" → Task 4 (the four are named in the File map; the fifth `.d.ts` in that directory, `entrants-filter.d.ts`, is scoped out with its reason); delete `MatchStateOut` → Task 1; knip + vitest exclusions in the same commit → Task 5 Step 3; NC 1 → Task 5 Step 2, NC 2 → Task 5 Step 1. The design doc's deletion gate (`:108`) is Task 6 Step 1. R-DM-9's "allow-listed and ratcheted to zero, never silenced" is three assertions: cap (`<= 19`), no-stale-entries (an entry whose divergence is fixed fails the suite), and the NC that asserts *detection* independent of the allow-list. No migrations; the only production-code edit is Task 1's deletion.
- **Known judgment calls (flagged, not hidden):**
  1. **NC 2 is implemented as "detected + allow-listed", not "red until dropped."** The design doc's literal wording would ship a red suite or force a `dto.ts` deletion outside this slice's scope. The controller's framing authorizes the substitution; recorded in Task 5 Step 1 with the exact recipe for closing it.
  2. **NC 1 is a two-link chain, and regeneration is not a hand edit.** vitest cannot build the FastAPI app, so "reddens both tiers before any hand edit" is satisfied as: pytest reds immediately → `make generate-api` → both vitest tiers red, mirrors still untouched. If the controller wants both tiers red *before regeneration*, that requires committing the OpenAPI JSON as a third artifact — more surface for the same signal. Not built.
  3. **Regex/indentation parsers, not the TypeScript compiler API.** Prototyped against the real files at `78e30101`: 180 generated schemas, 64 hand shapes, 53 pairs, 19 divergences — reproducing F-DM-28a's 3 and F-DM-28b's 9 exactly. `typescript` is a devDep in both packages, so the AST route is available if the formatting assumption ever breaks; the pinned floors + the "every `export interface` parsed" check are what make that break loud instead of silent.
  4. **Two test files with a ~30-line duplicated parser, not a shared test-util package.** The one-file alternative (console-side test policing entrant files, following `nonSchedulingKeys.parity.test.ts`'s own cross-package precedent) is lazier and was seriously considered; rejected so that `npm --prefix apps/entrant run test:run` catches entrant drift on its own — CLAUDE.md records what an entrant-invisible gate cost last time. The duplication carries a `ponytail:` comment naming the extract-when.
  5. **Console auto-pairs by name; entrant uses an explicit map.** Auto-pairing is fail-loud (a bad pair *reports* a divergence, never silently passes), but the entrant tier has two real name collisions (`EntryPageDTO`, `EntryEventDTO` vs unrelated operator schemas), so its map is explicit and exhaustive-checked.
  6. **Keys only.** 71 optionality mismatches measured; policing them would bury the 19 real ones. The allow-list's `kind` field reserves room for that pass without a reformat.
  7. **One allow-list, in the console `__tests__` dir**, not `packages/shared-contract/`: it has no runtime consumer, and P2 is about to change that package's versioning discipline.
- **Type consistency:** the allow-list entry shape `{shape, field, side, kind, why}` is declared once in Task 3, consumed verbatim by Task 4 (`JSON.parse` + the same `key()`) and Task 5 (`kind === 'violation'`, `why` contains `F-DM-28a`). `side` is exactly `'hand-only' | 'generated-only'`; `kind` is exactly `'violation' | 'accepted'`; the `key()` function is `shape.field:side` in all three places. `divergences()` is exported from the console test module and consumed by the NC in the same file. The generated-file parser has the same contract in TypeScript and Python (schema name → set of property names, keys only, identifier-named properties only).
- **Line numbers** are as of **`78e30101`** (branch `dm3/p3-minting-gaps`, which is this plan's base). Executors should **re-anchor by symbol, not line**, if the tree has moved — and re-derive the 19-entry allow-list from the actual test output rather than trusting the Task 3 table.
