# SP-COURT-1 Queue Mode — Implementation Plan (Phases A, 1, 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Run desk putting one player on two courts at once, then teach the CP-SAT engine to solve court-agnostically (`court_policy: "queue"`) and colour courts on afterwards.

**Architecture:** Three layers, in dependency order. **Phase A** threads player identity through the canonical `Match` contract (today the adapters throw it away) and makes it a hard filter on the queue head. **Phase 1** adds `court_policy` + `court_overrides` to `ScheduleConfig` with zero behaviour change. **Phase 2** swaps the encoding for pooled matches — drop the per-court optional intervals, replace per-court `AddNoOverlap` with one `AddCumulative(capacity=|pool|)`, and recover `court_id` by deterministic greedy left-edge colouring in extraction, so the wire contract does not change shape.

**Tech Stack:** Python 3.11 · OR-Tools CP-SAT 9.15.6755 · pytest · React 19 + TypeScript · Zustand · vitest

**Spec:** `docs/history/programs/SP-COURT-1.md` (revised 2026-08-19, commit `dc8e2fa`). Read §1, §3, §5, Phase 2, Phase 4a and §7a before starting. Debt entry **D20** in `docs/reference/debt-log.md` is what Phase A closes.

## Global Constraints

Copied from the spec and the owner's Phase 0 rulings of 2026-08-19. Every task's requirements implicitly include this section.

- **CP1 = two modes + per-court override.** `court_policy: "pinned" | "queue"` at the top level, plus per-court `"pinned" | "pool"`. Phase 2 must build the pool as a *set of courts*, never as "all courts", so Phase 5 exposes the override without re-architecture.
- **CP2 = `pinned` default.** No behaviour change until a workspace asks for queue mode. A default-constructed `ScheduleConfig` must produce a byte-identical model to today's.
- **CP3 = per workspace.** The policy rides the existing `tournaments.data` JSON blob as `courtPolicy`. **No Alembic migration in this plan.**
- **CP8(a) = v1, fall back to pinned.** Non-empty `closed_court_windows` → solve pinned regardless of `court_policy`, and report `effective_policy` so the UI can say why.
- **CP4, CP5, CP6 are NOT ruled** — they gate Phases 3, 4 and bracket scope. Nothing in this plan may decide them. If a task tempts you toward a Plan-board or Display change, stop and record it.
- **The wire contract does not change shape.** Every emitted `Assignment` still carries `court_id`. `apps/api/src/core/schemas.py:306-310` `ScheduleAssignment` is a `StrictModel` — do not add fields to it in this plan.
- **No new public serializer fields.** `apps/api/src/entries/entries_site.py` and `apps/api/src/display/display.py` are frozen for this program (spec §7a).
- **No new cross-module console edges.** `npm run depcruise` treats a new one as an ERROR.
- **Determinism is a gate.** Same input + same seed → byte-identical schedule. Colouring and queue order must both be deterministic, and the `simulator/` determinism contract must not move.
- **Viewer stays read-only.** No new write path reachable for role `viewer`.
- **Negative controls are required** for every safety property (CODE_HEALTH 3b). A test that cannot fail is not a test.
- **Gate command:** `make check` (eslint · `tsc -b` · `typecheck:entrant` · vitest · depcruise · ruff · import-linter · pytest). Backend-only tasks may run `pytest` + `ruff check` + `lint-imports` and defer the full gate to the phase end.

---

## Scope of this plan

The spec has six phases. **This plan covers Phase A (new, the D20 fix), Phase 1 and Phase 2** — a coherent increment that stands on its own: the desk stops double-booking players, and the engine can solve in queue mode with a valid per-court timetable coming out the other side.

**Phases 3, 4, 4a and 5 are deliberately NOT planned here.** Phase 3 (Plan board) is gated on CP4, Phase 4 on CP5, bracket scope on CP6 — all unruled. Planning them now would mean inventing the owner's decisions. Phase 4a shrinks to a confirmation pass once Phase A lands; re-derive it from the tree at that point. Write the follow-up plan after CP4–CP6 are answered.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `apps/console/src/platform/domain/match.ts` | Canonical cross-module `Match`; gains `playerIds` | 1 |
| `apps/console/src/modules/operations/opsBlock.ts` | Both engine adapters; must stop discarding player identity | 1 |
| `apps/console/src/modules/operations/runtime/runModel.ts` | Queue derivation + eligibility; owns `busyPlayers`, the hard filter, the rest flag | 1, 2, 3 |
| `apps/console/src/modules/operations/run/RunSurface.tsx` | Auto-pull + "Assign next"; passes the busy set in | 2, 3 |
| `apps/console/src/modules/operations/run/RunQueue.tsx` | Renders the queue; shows why a row is held | 2, 3 |
| `apps/console/src/lib/stateWords.ts` | The one state vocabulary; gains `onCourt` | 2 |
| `packages/scheduler-core/scheduler_core/domain/models.py` | `ScheduleConfig.court_policy` / `court_overrides`; `ScheduleResult.effective_policy` | 4, 7 |
| `apps/api/src/shared/scheduling/params.py` | The single seam params → `ScheduleConfig` | 4 |
| `packages/scheduler-core/scheduler_core/engine/court_pool.py` | **New.** Which courts pool, which matches pool, and the one stable tiebreaker | 5, 6 |
| `packages/scheduler-core/scheduler_core/engine/variables.py` | Skips per-court optional intervals for pooled matches | 5 |
| `packages/scheduler-core/scheduler_core/engine/constraints/court_capacity.py` | `AddNoOverlap` per pinned court + one `AddCumulative` for the pool | 5 |
| `packages/scheduler-core/scheduler_core/engine/extraction.py` | Left-edge colouring so pooled matches still emit `court_id` | 5, 6 |
| `packages/scheduler-core/scheduler_core/engine/cpsat_backend.py` | Closed-window fallback to pinned; reports `effective_policy` | 7 |

---

# Phase A — Close D20 (the live defect)

Auto-pull can put a player on two courts at once, today, in production. The solver guarantees player-no-overlap and rest at *planned* times (`engine/constraints/player_no_overlap.py`, `rest.py:40` where `rest_is_hard` defaults `True`), but auto-pull assigns at `slotForAssign(...)` — a different time — so those guarantees are void for every auto-pulled match. Fix this before queue mode makes the run path the *only* enforcement point.

---

### Task 1: Player identity on the `Match` contract

`meetSide` (`opsBlock.ts:23-26`) joins player ids into a display string and throws the ids away; the bracket adapter keeps only `playUnitSideLabels` output. Nothing downstream can tell two matches share a player. Add the ids.

**Files:**
- Modify: `apps/console/src/platform/domain/match.ts:28-59` (the `Match` interface)
- Modify: `apps/console/src/modules/operations/opsBlock.ts:23-26, 88-105, 120-139`
- Test: `apps/console/src/modules/operations/__tests__/opsBlock.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Match.playerIds: string[]` — every person physically on court for this match, deduped, order irrelevant. Empty array when identity is unknown (TBD sides, unresolved feeders). **Never `undefined`** — a missing field would make every downstream check silently fail open.

- [ ] **Step 1: Write the failing test**

Add to `apps/console/src/modules/operations/__tests__/opsBlock.test.ts`:

```ts
describe('playerIds — the identity the run desk needs', () => {
  it('meet: carries the real player ids from both sides, not the display names', () => {
    const [b] = meetToOpsBlocks(
      [{ id: 'm1', sideA: ['p1', 'p2'], sideB: ['p3'], durationSlots: 1 } as MatchDTO],
      null,
      {},
      { p1: 'Ana', p2: 'Bo', p3: 'Cy' },
      null,
    );
    expect(b.sideA).toBe('Ana / Bo');        // display unchanged
    expect(new Set(b.playerIds)).toEqual(new Set(['p1', 'p2', 'p3']));
  });

  it('meet: includes sideC for tri-meets and dedupes', () => {
    const [b] = meetToOpsBlocks(
      [{ id: 'm1', sideA: ['p1'], sideB: ['p2'], sideC: ['p1', 'p3'], durationSlots: 1 } as MatchDTO],
      null, {}, {}, null,
    );
    expect([...b.playerIds].sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('meet: unknown sides yield an empty array, never undefined', () => {
    const [b] = meetToOpsBlocks(
      [{ id: 'm1', sideA: [], sideB: undefined, durationSlots: 1 } as unknown as MatchDTO],
      null, {}, {}, null,
    );
    expect(b.playerIds).toEqual([]);
  });

  it('bracket: expands a doubles participant into its members', () => {
    const data = {
      participants: [
        { id: 'pair1', name: 'Ana/Bo', members: ['p1', 'p2'] },
        { id: 'solo', name: 'Cy' },
      ],
      play_units: [{
        id: 'pu1', event_id: 'e1', round_index: 0,
        slot_a: { participant_id: 'pair1', feeder_play_unit_id: null },
        slot_b: { participant_id: 'solo', feeder_play_unit_id: null },
      }],
      assignments: [], results: [], events: [{ id: 'e1', discipline: 'MD' }],
    } as unknown as BracketTournamentDTO;
    const [b] = bracketToOpsBlocks(data);
    expect([...b.playerIds].sort()).toEqual(['p1', 'p2', 'solo']);
  });

  it('bracket: an unresolved feeder slot contributes no identity', () => {
    const data = {
      participants: [{ id: 'solo', name: 'Cy' }],
      play_units: [{
        id: 'pu1', event_id: 'e1', round_index: 1,
        slot_a: { participant_id: null, feeder_play_unit_id: 'pu0' },
        slot_b: { participant_id: 'solo', feeder_play_unit_id: null },
      }],
      assignments: [], results: [], events: [{ id: 'e1', discipline: 'MS' }],
    } as unknown as BracketTournamentDTO;
    const [b] = bracketToOpsBlocks(data);
    expect(b.playerIds).toEqual(['solo']);
  });
});
```

Add the imports the file needs at the top if absent: `import type { BracketTournamentDTO } from '../../../api/bracketDto';`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/console run test:run -- src/modules/operations/__tests__/opsBlock.test.ts -t "playerIds"`
Expected: FAIL — `playerIds` is not a property of the returned objects (`expect(undefined)`), and `tsc` will flag it as not existing on `Match`.

- [ ] **Step 3: Add the field to the contract**

In `apps/console/src/platform/domain/match.ts`, after the `sideA`/`sideB` declarations:

```ts
  /** Every person physically on court for this match — meet player ids, or a
   *  bracket participant expanded into its `members` (a doubles pair is two
   *  people, and both are busy). Deduped; order carries no meaning.
   *
   *  Empty when identity is unknown (TBD sides, unresolved feeders) — NEVER
   *  undefined. The run desk uses this to refuse putting one player on two
   *  courts, and an optional field would make that check fail open.
   *  `sideA`/`sideB` above stay DISPLAY strings; these are the identities
   *  behind them. */
  playerIds: string[];
```

- [ ] **Step 4: Fill it in the meet adapter**

In `apps/console/src/modules/operations/opsBlock.ts`, add beside `meetSide`:

```ts
/** The identities behind the display sides. `meetSide` joins names for the
 *  eye; this keeps the ids for the machine. */
function meetPlayerIds(m: MatchDTO): string[] {
  return [...new Set([...(m.sideA ?? []), ...(m.sideB ?? []), ...(m.sideC ?? [])])];
}
```

and in the object `meetToOpsBlocks` returns, beside `sideB`:

```ts
      playerIds: meetPlayerIds(m),
```

- [ ] **Step 5: Fill it in the bracket adapter**

In the same file, add above `bracketToOpsBlocks`:

```ts
/** A bracket slot names a PARTICIPANT, which for doubles is two people.
 *  Expand it, because both of them are unavailable while it plays. */
function bracketPlayerIds(
  pu: { slot_a: { participant_id: string | null }; slot_b: { participant_id: string | null } },
  membersById: Map<string, string[]>,
): string[] {
  const ids: string[] = [];
  for (const slot of [pu.slot_a, pu.slot_b]) {
    const pid = slot.participant_id;
    if (!pid) continue;                       // unresolved feeder — no identity yet
    ids.push(...(membersById.get(pid) ?? [pid]));
  }
  return [...new Set(ids)];
}
```

Inside `bracketToOpsBlocks`, beside the existing `nameById` line:

```ts
  const membersById = new Map(
    data.participants
      .filter((p) => p.members && p.members.length > 0)
      .map((p) => [p.id, p.members as string[]]),
  );
```

and in the returned object, beside `sideB`:

```ts
      playerIds: bracketPlayerIds(pu, membersById),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix apps/console run test:run -- src/modules/operations/__tests__/opsBlock.test.ts`
Expected: PASS, all cases.

- [ ] **Step 7: Fix every other construction site the type gate now flags**

Run: `npm --prefix apps/console run build`
Expected: `tsc -b` errors listing test fixtures and any other place that builds a `Match`/`OpsBlock` literal without `playerIds`. Add `playerIds: []` to each **test fixture**. If a *production* site builds a `Match` literal, fill in the real ids — do not paper it with `[]`; note the file in the commit message.

Run again until `tsc -b` is clean.

- [ ] **Step 8: Run the full frontend suite**

Run: `npm --prefix apps/console run test:run`
Expected: PASS. If a contract-baseline test fails (`src/platform/contracts/__tests__/moduleContract.test.ts`), read it before touching it — a new field on a declared DTO may need the baseline updated, which is legitimate; a new *edge* is not, and means you imported something you should not have.

- [ ] **Step 9: Commit**

```bash
git add apps/console/src/platform/domain/match.ts apps/console/src/modules/operations/opsBlock.ts apps/console/src/modules/operations/__tests__/opsBlock.test.ts
git commit -m "feat(operations): carry player identity on the Match contract (D20 prep)"
```

---

### Task 2: Hard player-busy filter on the queue head

**Files:**
- Modify: `apps/console/src/modules/operations/runtime/runModel.ts:5-13, 34-46, 124-130`
- Modify: `apps/console/src/modules/operations/run/RunSurface.tsx:91-114, 520-530`
- Modify: `apps/console/src/modules/operations/run/RunQueue.tsx:38-48, 130-150`
- Modify: `apps/console/src/lib/stateWords.ts`
- Test: `apps/console/src/modules/operations/__tests__/runModel.test.ts`

**Interfaces:**
- Consumes: `Match.playerIds: string[]` from Task 1.
- Produces:
  - `RunMatch.playerIds: string[]` (passed straight through by `toRunMatches`)
  - `busyPlayers(matches: RunMatch[]): ReadonlySet<string>`
  - `isPlayerBusy(m: RunMatch, busy: ReadonlySet<string>): boolean`
  - `nextEligible(queue: RunMatch[], busy: ReadonlySet<string>): RunMatch | undefined` — **`busy` is REQUIRED**, so the type checker finds every call site. An optional parameter here would fail open, which is the exact class of bug D20 is.

- [ ] **Step 1: Write the failing test**

Add to `apps/console/src/modules/operations/__tests__/runModel.test.ts`. Extend the local `blk` helper with `playerIds: []` in its defaults first, then:

```ts
describe('player-busy (D20)', () => {
  const onCourt = blk({ id: 'live', court: 1, slot: 0, status: 'started', playerIds: ['p1'] });
  const queued = blk({ id: 'q', slot: 1, status: 'scheduled', playerIds: ['p1', 'p9'] });
  const free   = blk({ id: 'f', slot: 2, status: 'scheduled', playerIds: ['p7'] });

  it('busyPlayers collects everyone on a court, and nobody who is done', () => {
    const ms = toRunMatches([onCourt, queued], {});
    expect(busyPlayers(ms)).toEqual(new Set(['p1']));

    const finished = toRunMatches([blk({ id: 'd', court: 1, status: 'finished', playerIds: ['p2'] })], {});
    expect(busyPlayers(finished)).toEqual(new Set());
  });

  it('nextEligible SKIPS a match whose player is already on a court', () => {
    const ms = toRunMatches([onCourt, queued, free], {});
    const head = nextEligible(deriveQueue(ms), busyPlayers(ms));
    // `queued` is earlier in queue order AND eligible AND assignable — the only
    // reason to skip it is that p1 is mid-rally on court 1.
    expect(head?.id).toBe('f');
  });

  it('NEGATIVE CONTROL: with an empty busy set the same queue returns the busy match', () => {
    // Proves the assertion above is caused by the filter and not by the
    // ordering. If this ever passes with `busyPlayers(ms)` substituted in,
    // the filter is dead code.
    const ms = toRunMatches([onCourt, queued, free], {});
    expect(nextEligible(deriveQueue(ms), new Set())?.id).toBe('q');
  });

  it('a match with no known players is never blocked by the filter', () => {
    const ms = toRunMatches([onCourt, blk({ id: 'tbd', slot: 1, playerIds: [] })], {});
    expect(nextEligible(deriveQueue(ms), busyPlayers(ms))?.id).toBe('tbd');
  });
});
```

Add `busyPlayers` to the import at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/console run test:run -- src/modules/operations/__tests__/runModel.test.ts -t "player-busy"`
Expected: FAIL — `busyPlayers is not a function`.

- [ ] **Step 3: Implement in runModel.ts**

Add `playerIds: string[];` to the `RunMatch` interface (beside `sideB`), and pass it through in `toRunMatches`'s returned object:

```ts
      playerIds: b.playerIds,
```

Then replace `nextEligible` and add the two helpers above it:

```ts
/**
 * Everyone currently occupying a court: any match that holds a court and is
 * not finished. That is exactly the complement of `deriveQueue`'s filter, so
 * a person cannot be both queued and busy through the same match.
 *
 * `called` counts as busy — you cannot call one player to two courts — and so
 * does a court-assigned `scheduled` match, because `assign_court` sets the
 * court while the status stays scheduled.
 */
export function busyPlayers(matches: RunMatch[]): ReadonlySet<string> {
  const busy = new Set<string>();
  for (const m of matches) {
    if (m.court != null && m.status !== 'done') {
      for (const p of m.playerIds) busy.add(p);
    }
  }
  return busy;
}

/** True when any player of this match is already on a court. A match with no
 *  known identities is never busy — we refuse on evidence, not on ignorance. */
export function isPlayerBusy(m: RunMatch, busy: ReadonlySet<string>): boolean {
  return m.playerIds.some((p) => busy.has(p));
}

/** The assignable head — first eligible+assignable match in queue order whose
 *  players are all off court.
 *
 *  Skips waiting (TBD-vs-TBD / unresolved-feeder) matches, non-assignable
 *  statuses (e.g. `called`), AND matches whose player is mid-rally elsewhere.
 *
 *  `busy` is REQUIRED, not optional: the solver's player-no-overlap guarantee
 *  holds at PLANNED times only, and auto-pull assigns at a different time, so
 *  this is the only thing standing between a player and two simultaneous
 *  matches (debt D20). An optional parameter would let a new call site fail
 *  open silently — build it with `busyPlayers(matches)`.
 */
export function nextEligible(
  queue: RunMatch[],
  busy: ReadonlySet<string>,
): RunMatch | undefined {
  return queue.find((m) => m.eligible && can(m.status, 'assign') && !isPlayerBusy(m, busy));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/console run test:run -- src/modules/operations/__tests__/runModel.test.ts -t "player-busy"`
Expected: PASS, all four cases including the negative control.

- [ ] **Step 5: Update the three call sites**

In `RunSurface.tsx`, change `computeAutoPull`'s body — it already receives `matches`:

```ts
  const head = nextEligible(queue, busyPlayers(matches));
```

and add `busyPlayers` to the import from `../runtime/runModel`.

At the component's two other uses (around `:520-530`), derive it once with the other memos:

```ts
  const busy = useMemo(() => busyPlayers(matches), [matches]);
```

then replace `nextEligible(queue)` with `nextEligible(queue, busy)` at both sites.

- [ ] **Step 6: Verify the type gate found them all**

Run: `npm --prefix apps/console run build`
Expected: clean. Any remaining `nextEligible(queue)` is a compile error by construction — that is the point of the required parameter.

- [ ] **Step 7: Say why a row is held, in the queue**

A held row currently renders nothing distinguishing, and folding it into `eligible` would make it claim "Both sides have to be decided first", which is false. Give it its own word.

In `apps/console/src/lib/stateWords.ts`, add `| 'onCourt'` to the `StateWord` union and to `STATE_WORD`:

```ts
  // A queued match whose player is mid-rally on another court. Not a status of
  // the match — a fact about its people — but the desk reads it in the same
  // column as the others, so it lives in the same vocabulary.
  onCourt: 'On court',
```

In `RunQueue.tsx`, add to `RunQueueProps`:

```ts
  /** Keys of queue rows held because a player is already on a court (D20).
   *  Distinct from `!eligible`, which means a side is undecided. */
  busyKeys?: ReadonlySet<string>;
```

and insert a branch as the FIRST arm of the readiness ternary chain (before `!match.eligible`):

```tsx
            {busyKeys?.has(match.key) ? (
              <span
                data-testid={`queue-busy-${match.key}`}
                title="A player in this match is on another court"
                className={`flex-shrink-0 ${EYEBROW_CLASS} text-ink-faint`}
              >
                {STATE_WORD.onCourt}
              </span>
            ) : !match.eligible ? (
```

In `RunSurface.tsx`, pass it where `<RunQueue …>` is rendered:

```tsx
            busyKeys={useMemo(
              () => new Set(queue.filter((m) => isPlayerBusy(m, busy)).map((m) => m.key)),
              [queue, busy],
            )}
```

Hoist that `useMemo` to the component body rather than calling it inline in JSX — a hook inside JSX violates rules-of-hooks, which is a blocking eslint error. Add `isPlayerBusy` to the import.

- [ ] **Step 8: Run the operations suite + gates**

Run: `npm --prefix apps/console run test:run -- src/modules/operations`
Expected: PASS.

Run: `npm run lint:scheduler && npm run depcruise`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add apps/console/src/modules/operations apps/console/src/lib/stateWords.ts
git commit -m "fix(operations): refuse to assign a match whose player is on another court (D20)"
```

---

### Task 3: Rest as a soft flag the desk can override

Player-busy is hard: the desk may not override it. Rest is soft: the desk sees the flag and decides. Software flags, humans decide.

**Files:**
- Modify: `apps/console/src/modules/operations/runtime/runModel.ts`
- Modify: `apps/console/src/modules/operations/run/RunSurface.tsx`
- Modify: `apps/console/src/modules/operations/run/RunQueue.tsx`
- Test: `apps/console/src/modules/operations/__tests__/runModel.test.ts`

**Interfaces:**
- Consumes: `RunMatch.playerIds`, `busyPlayers` from Task 2.
- Produces: `restShortKeys(matches: RunMatch[], opts: { currentSlot?: number; restSlots: number }): ReadonlySet<string>` — keys of queue matches with at least one player who finished a match fewer than `restSlots` slots ago.

- [ ] **Step 1: Write the failing test**

```ts
describe('rest flag (soft)', () => {
  it('flags a queued match whose player finished less than restSlots ago', () => {
    const ms = toRunMatches([
      blk({ id: 'just-done', court: 1, status: 'finished', playerIds: ['p1'], actualEndSlot: 9 }),
      blk({ id: 'next-up', slot: 10, status: 'scheduled', playerIds: ['p1'] }),
      blk({ id: 'rested', slot: 10, status: 'scheduled', playerIds: ['p2'] }),
    ], {});
    const flagged = restShortKeys(ms, { currentSlot: 10, restSlots: 2 });
    expect(flagged.has('meet:next-up')).toBe(true);
    expect(flagged.has('meet:rested')).toBe(false);
  });

  it('NEGATIVE CONTROL: enough elapsed slots clears the flag', () => {
    const ms = toRunMatches([
      blk({ id: 'done', court: 1, status: 'finished', playerIds: ['p1'], actualEndSlot: 5 }),
      blk({ id: 'next', slot: 10, status: 'scheduled', playerIds: ['p1'] }),
    ], {});
    expect(restShortKeys(ms, { currentSlot: 10, restSlots: 2 }).size).toBe(0);
  });

  it('a finished match with no actual end slot cannot flag anything', () => {
    const ms = toRunMatches([
      blk({ id: 'done', court: 1, status: 'finished', playerIds: ['p1'] }),
      blk({ id: 'next', slot: 10, status: 'scheduled', playerIds: ['p1'] }),
    ], {});
    expect(restShortKeys(ms, { currentSlot: 10, restSlots: 2 }).size).toBe(0);
  });

  it('the flag does NOT change what nextEligible returns', () => {
    const ms = toRunMatches([
      blk({ id: 'done', court: 1, status: 'finished', playerIds: ['p1'], actualEndSlot: 9 }),
      blk({ id: 'next', slot: 10, status: 'scheduled', playerIds: ['p1'] }),
    ], {});
    // soft means soft: it is surfaced, never enforced.
    expect(nextEligible(deriveQueue(ms), busyPlayers(ms))?.id).toBe('next');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/console run test:run -- src/modules/operations/__tests__/runModel.test.ts -t "rest flag"`
Expected: FAIL — `restShortKeys is not a function`, and `actualEndSlot` is not on `RunMatch`.

- [ ] **Step 3: Implement**

`toRunMatches` currently drops the actual timing. Add `actualEndSlot?: number;` to `RunMatch` and pass `actualEndSlot: b.actualEndSlot,` through. Then:

```ts
/**
 * Queue rows whose player has not had `restSlots` since finishing.
 *
 * SOFT by design: this returns keys to paint, and nothing else consumes it.
 * The desk may send a flagged match — a director looking at the floor knows
 * things the model does not (a retirement, a walkover, a player who wants to
 * go straight back on). Compare `busyPlayers`, which IS enforced: one body
 * cannot be in two places, and no amount of local knowledge changes that.
 *
 * A finished match with no `actualEndSlot` flags nothing — we have no evidence
 * about when the player actually came off, and guessing would cry wolf.
 */
export function restShortKeys(
  matches: RunMatch[],
  opts: { currentSlot?: number; restSlots: number },
): ReadonlySet<string> {
  const { currentSlot, restSlots } = opts;
  if (currentSlot == null || restSlots <= 0) return new Set();

  const freeAt = new Map<string, number>();      // player → earliest rested slot
  for (const m of matches) {
    if (m.status !== 'done' || m.actualEndSlot == null) continue;
    for (const p of m.playerIds) {
      const t = m.actualEndSlot + restSlots;
      freeAt.set(p, Math.max(freeAt.get(p) ?? 0, t));
    }
  }

  const flagged = new Set<string>();
  for (const m of matches) {
    if (m.court != null || m.status === 'done') continue;   // queue rows only
    if (m.playerIds.some((p) => (freeAt.get(p) ?? 0) > currentSlot)) flagged.add(m.key);
  }
  return flagged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/console run test:run -- src/modules/operations/__tests__/runModel.test.ts -t "rest flag"`
Expected: PASS, all four cases.

- [ ] **Step 5: Surface it**

`restSlots` comes from the workspace config: `TournamentConfig.defaultRestMinutes / intervalMinutes`, rounded up. In `RunSurface.tsx`, beside the other memos (`config` is already available to this surface via the tournament store — use the same accessor the surface already uses for `slotMinutes`):

```ts
  // defaultRestMinutes is wall-clock; the board counts slots.
  const restSlots = useMemo(
    () => (slotMinutes > 0 ? Math.ceil((config?.defaultRestMinutes ?? 0) / slotMinutes) : 0),
    [config?.defaultRestMinutes, slotMinutes],
  );
  const restKeys = useMemo(
    () => restShortKeys(matches, { currentSlot, restSlots }),
    [matches, currentSlot, restSlots],
  );
```

Pass `restKeys={restKeys}` to `<RunQueue>`. In `RunQueue.tsx` add the prop:

```ts
  /** Keys of queue rows whose player is short of rest. ADVISORY — the row
   *  stays sendable; the desk decides. */
  restKeys?: ReadonlySet<string>;
```

and render it as an additional badge beside the LATE badge (not in the readiness chain — it does not replace readiness, it annotates it):

```tsx
            {restKeys?.has(match.key) && (
              <span
                data-testid={`queue-rest-${match.key}`}
                title="A player in this match has just come off court"
                className={`flex-shrink-0 ${EYEBROW_CLASS} text-ink-faint`}
              >
                Short rest
              </span>
            )}
```

- [ ] **Step 6: Prove the row is still sendable**

Add to `apps/console/src/modules/operations/__tests__/runQueue.test.tsx`:

```tsx
it('a short-rest row is flagged but still sendable — soft means soft', () => {
  const onSend = vi.fn();
  render(
    <RunQueue
      queue={[/* one eligible scheduled RunMatch, key 'meet:x' */]}
      onSelect={() => {}}
      onSend={onSend}
      restKeys={new Set(['meet:x'])}
    />,
  );
  expect(screen.getByTestId('queue-rest-meet:x')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('queue-send-meet:x'));
  expect(onSend).toHaveBeenCalledWith('meet:x');
});
```

Build the queue row with the same fixture helper the neighbouring tests in that file already use — do not invent a second one.

- [ ] **Step 7: Run the gate**

Run: `make check`
Expected: all green. This is the end of Phase A, so run the whole thing.

- [ ] **Step 8: Close D20 in the debt log**

Edit `docs/reference/debt-log.md`: move the D20 row out of "Open — needs an owner decision" and strike it through in the resolved style the file already uses for closed items, noting the commits and that rest shipped soft by ruling.

- [ ] **Step 9: Commit**

```bash
git add apps/console/src/modules/operations docs/reference/debt-log.md
git commit -m "feat(operations): flag short rest on the queue; close D20"
```

---

# Phase 1 — `court_policy` on the config

Zero behaviour change. The point is that `pinned` produces a byte-identical model to today's, proven by test, so Phase 2 has a baseline it cannot silently break.

---

### Task 4: `court_policy` + `court_overrides` on `ScheduleConfig`

**Files:**
- Modify: `packages/scheduler-core/scheduler_core/domain/models.py:100-128`
- Modify: `apps/api/src/shared/scheduling/params.py:36-44, 46-64`
- Test: `tests/backend/unit/scheduling/test_params.py`
- Test: `tests/backend/unit/scheduling/test_court_policy.py` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ScheduleConfig.court_policy: str = "pinned"` — `"pinned" | "queue"`
  - `ScheduleConfig.court_overrides: Dict[int, str] = {}` — court id → `"pinned" | "pool"`; absent means "follow `court_policy`"
  - `SchedulingParams.court_policy: str = "pinned"` and `.court_overrides: Dict[int, str] = {}`

- [ ] **Step 1: Write the failing test**

Create `tests/backend/unit/scheduling/test_court_policy.py`:

```python
"""court_policy: the config field, and the promise that `pinned` changes nothing."""
from scheduler_core.domain.models import (
    Match,
    Player,
    ScheduleConfig,
    ScheduleRequest,
    SolverStatus,
)
from scheduler_core.schedule import schedule

from shared.scheduling.params import SchedulingParams, build_schedule_config


def test_default_policy_is_pinned():
    assert ScheduleConfig(total_slots=4, court_count=2).court_policy == "pinned"
    assert ScheduleConfig(total_slots=4, court_count=2).court_overrides == {}


def test_params_builder_carries_the_policy():
    cfg = build_schedule_config(
        SchedulingParams(
            court_count=4,
            total_slots=20,
            court_policy="queue",
            court_overrides={1: "pinned"},
        )
    )
    assert cfg.court_policy == "queue"
    assert cfg.court_overrides == {1: "pinned"}


def _request(**cfg_kw) -> ScheduleRequest:
    cfg = ScheduleConfig(total_slots=8, court_count=2, interval_minutes=30, **cfg_kw)
    return ScheduleRequest(
        config=cfg,
        players=[Player(id=p, name=p) for p in ("a", "b", "c", "d")],
        matches=[
            Match(id="m1", event_code="E", side_a=["a"], side_b=["b"]),
            Match(id="m2", event_code="E", side_a=["c"], side_b=["d"]),
        ],
    )


def test_pinned_is_byte_identical_to_an_unset_policy():
    """The CP2 promise: adding the field changes no existing solve.

    Compares the emitted assignments, not just feasibility — a model that
    solved to a DIFFERENT valid schedule would still be a behaviour change.
    """
    baseline = schedule(_request())
    explicit = schedule(_request(court_policy="pinned"))
    assert baseline.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert [(a.match_id, a.slot_id, a.court_id) for a in baseline.assignments] == [
        (a.match_id, a.slot_id, a.court_id) for a in explicit.assignments
    ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/backend/unit/scheduling/test_court_policy.py -v`
Expected: FAIL — `ScheduleConfig` has no attribute `court_policy` / unexpected keyword argument.

- [ ] **Step 3: Add the fields to `ScheduleConfig`**

In `packages/scheduler-core/scheduler_core/domain/models.py`, after the `closed_court_ids` field (keeping the file's comment-above-field idiom, and mirroring the `compact_schedule_mode` string-enum prior art):

```python
    # Court policy — is a court part of the plan, or just where a match
    # happens to land? "pinned" is today's behaviour: the solver chooses a
    # specific court per match and the timetable promises it. "queue" pools
    # the courts, solving only for TIME, and court identity is assigned
    # afterwards by colouring — which is how a real desk runs the day.
    #
    # Default is "pinned": no existing solve changes until a workspace asks
    # (ruling CP2). See docs/history/programs/SP-COURT-1.md.
    court_policy: str = "pinned"  # "pinned" | "queue"

    # Per-court override, court_id -> "pinned" | "pool". A court absent from
    # this map follows ``court_policy``. This is what lets a real event queue
    # the body of the draw while Court 1 stays pinned because it is filmed,
    # rostered or ticketed (ruling CP1). In "pinned" policy the map is
    # ignored — there is no pool to opt out of.
    court_overrides: Dict[int, str] = field(default_factory=dict)
```

Add `Dict` to the `typing` import at the top of the file if it is not already there.

- [ ] **Step 4: Thread it through the params seam**

In `apps/api/src/shared/scheduling/params.py`, add to `SchedulingParams` (after `closed_court_ids`):

```python
    court_policy: str = "pinned"
    court_overrides: Dict[int, str] = field(default_factory=dict)
```

and to the `ScheduleConfig(...)` call in `build_schedule_config`:

```python
        court_policy=params.court_policy,
        court_overrides=dict(params.court_overrides),
```

Add `Dict` to that file's `typing` import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/backend/unit/scheduling/ -v`
Expected: PASS, including the existing `test_params.py` cases.

- [ ] **Step 6: Run the backend gates**

Run: `pytest && ruff check apps/api packages/scheduler-core tests/backend && cd apps/api/src && lint-imports --config ../.importlinter`
Expected: full suite green; ruff clean; all 15 import contracts kept.

- [ ] **Step 7: Commit**

```bash
git add packages/scheduler-core/scheduler_core/domain/models.py apps/api/src/shared/scheduling/params.py tests/backend/unit/scheduling/
git commit -m "feat(scheduler-core): court_policy + court_overrides on ScheduleConfig (no behaviour change)"
```

---

# Phase 2 — The engine honours the policy

**Entry conditions from the spec: D1 closed AND CP8 ruled.** CP8 is ruled (v1). **D1 is still open** — `resolveClosedWindows` (`apps/console/src/hooks/useSchedule.ts:83`) swallows every bracket-occupancy failure and returns `[]`, which the solver reads as the positive claim "the bracket occupies no courts". Do not start Task 5 until D1 is closed. Under CP8-v1 a non-empty window list forces pinned mode, so a *swallowed* window list is precisely what would silently keep queue mode on when it should have stepped aside.

---

### Task 5: Pool the courts — cumulative capacity + left-edge colouring

The encoding switch is atomic: `extraction.py` reads `svars.court[match_id]`, so the moment `variables.py` stops creating court variables for pooled matches, extraction must already know how to colour. Both land in this task.

**Files:**
- Create: `packages/scheduler-core/scheduler_core/engine/court_pool.py`
- Modify: `packages/scheduler-core/scheduler_core/engine/variables.py:17-25, 28-75`
- Modify: `packages/scheduler-core/scheduler_core/engine/constraints/court_capacity.py`
- Modify: `packages/scheduler-core/scheduler_core/engine/extraction.py:36-38`
- Test: `tests/backend/unit/scheduling/test_court_policy.py`

**Interfaces:**
- Consumes: `ScheduleConfig.court_policy`, `.court_overrides` from Task 4.
- Produces, all in `court_pool.py`:
  - `pool_courts(config: ScheduleConfig) -> List[int]` — the pooled court ids, ascending. Empty in `pinned` policy.
  - `pooled_match_ids(config: ScheduleConfig, matches: Dict[str, Match], locked: Set[str]) -> Set[str]` — matches solved court-agnostically. Empty in `pinned` policy; excludes anything locked or pinned.
  - `colour_left_edge(order: List[Tuple[int, int, str]], courts: List[int]) -> Dict[str, int]` — takes `(start, duration, match_id)` triples, returns match id → court id. Raises `ValueError` when it needs more courts than exist.
- `SchedulingVars` gains `pool: Set[str]` so the constraint and extraction layers agree on which matches were pooled without recomputing.

- [ ] **Step 1: Write the failing test**

Append to `tests/backend/unit/scheduling/test_court_policy.py`:

```python
import pytest

from scheduler_core.engine.court_pool import colour_left_edge, pool_courts


def test_pool_courts_is_empty_under_pinned_policy():
    cfg = ScheduleConfig(total_slots=8, court_count=4)
    assert pool_courts(cfg) == []


def test_pool_courts_respects_the_per_court_override():
    cfg = ScheduleConfig(
        total_slots=8, court_count=4, court_policy="queue",
        court_overrides={1: "pinned"},
    )
    assert pool_courts(cfg) == [2, 3, 4]


def test_colouring_produces_a_legal_timetable():
    # three matches, all overlapping at slot 0, three courts
    order = [(0, 2, "m1"), (0, 2, "m2"), (0, 2, "m3")]
    colours = colour_left_edge(order, [1, 2, 3])
    assert sorted(colours.values()) == [1, 2, 3]


def test_colouring_reuses_a_court_once_it_frees():
    order = [(0, 2, "m1"), (2, 2, "m2")]
    assert colour_left_edge(order, [1, 2]) == {"m1": 1, "m2": 1}


def test_NEGATIVE_CONTROL_colouring_refuses_when_overlap_exceeds_courts():
    """The safety property, proven by making it fail (CODE_HEALTH 3b).

    If the cumulative constraint is ever dropped or mis-capacitied, this is
    what stops a physically impossible timetable reaching the floor. A
    colouring step that could not raise would hide exactly that bug.
    """
    order = [(0, 2, "m1"), (0, 2, "m2"), (0, 2, "m3")]
    with pytest.raises(ValueError, match="courts"):
        colour_left_edge(order, [1, 2])


def test_queue_mode_solves_and_every_assignment_still_carries_a_court():
    result = schedule(_request(court_policy="queue"))
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert len(result.assignments) == 2
    for a in result.assignments:
        assert 1 <= a.court_id <= 2      # the wire contract does not change shape


def test_queue_and_pinned_reach_the_same_makespan():
    """The equal-objective property: pooling changes the encoding, not the answer."""
    q = schedule(_request(court_policy="queue"))
    p = schedule(_request(court_policy="pinned"))
    assert max(a.slot_id + a.duration_slots for a in q.assignments) == max(
        a.slot_id + a.duration_slots for a in p.assignments
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/backend/unit/scheduling/test_court_policy.py -v`
Expected: FAIL — `No module named 'scheduler_core.engine.court_pool'`.

- [ ] **Step 3: Create `court_pool.py`**

```python
"""Which courts are a pool, which matches ride it, and how they get coloured.

Under ``court_policy="queue"`` the solver stops choosing a court per match and
solves only for TIME, with one ``AddCumulative`` capping concurrency at the
pool size. That is sound because of interval-graph theory: on a set of
intervals the greedy left-edge colouring uses exactly as many colours as the
maximum overlap, and the cumulative constraint is precisely a bound on maximum
overlap. So a solution the cumulative admits is always realisable on that many
physical courts, and court assignment is post-processing rather than a search
dimension (SP-COURT-1 §3).

Not every match may pool. A locked or pinned match has been PROMISED a court,
and a promise the solver quietly relocates is worse than a slower solve.
"""
from __future__ import annotations

from typing import Dict, List, Set, Tuple

from scheduler_core.domain.models import Match, ScheduleConfig


def pool_courts(config: ScheduleConfig) -> List[int]:
    """Pooled court ids, ascending. Empty under ``pinned`` policy.

    ``court_overrides`` lets one court stay pinned inside a queue-mode venue
    (the filmed court, the show court, the one rented by the hour) — ruling
    CP1.
    """
    if config.court_policy != "queue":
        return []
    return [
        c
        for c in range(1, config.court_count + 1)
        if config.court_overrides.get(c, "pool") == "pool"
    ]


def pooled_match_ids(
    config: ScheduleConfig,
    matches: Dict[str, Match],
    locked: Set[str],
) -> Set[str]:
    """Matches solved court-agnostically.

    Excludes locked/pinned matches: they keep their explicit per-court
    interval and stay out of the cumulative pool entirely, so queue mode
    cannot move them.
    """
    if not pool_courts(config):
        return set()
    return {mid for mid in matches if mid not in locked}


def colour_left_edge(
    order: List[Tuple[int, int, str]],
    courts: List[int],
) -> Dict[str, int]:
    """Assign a court to each ``(start, duration, match_id)``.

    Sweeps in the caller's order and gives each match the lowest-numbered
    court already free at its start. Deterministic given a deterministic
    order — see ``sort_key`` in this module, which is the one place that
    order is defined.

    Raises ``ValueError`` when concurrency exceeds ``len(courts)``. That
    cannot happen against a solution the cumulative constraint admitted, so
    it firing means the model and the colouring have drifted apart — fail
    loudly rather than emit a timetable the floor cannot play.
    """
    free_at: Dict[int, int] = {c: 0 for c in courts}
    colours: Dict[str, int] = {}
    for start, duration, match_id in order:
        for c in courts:                      # ascending: "lowest free court"
            if free_at[c] <= start:
                colours[match_id] = c
                free_at[c] = start + duration
                break
        else:
            raise ValueError(
                f"left-edge colouring needs more than {len(courts)} courts at slot "
                f"{start} (match {match_id}) — max overlap exceeds the pool"
            )
    return colours
```

- [ ] **Step 4: Run the colouring tests**

Run: `pytest tests/backend/unit/scheduling/test_court_policy.py -v -k "colour or pool_courts"`
Expected: PASS, including the negative control.

- [ ] **Step 5: Skip the per-court variables for pooled matches**

In `variables.py`, add to `SchedulingVars`:

```python
    #: Match ids solved court-agnostically — no ``is_on_court`` / ``court`` var
    #: exists for these; their court is assigned by colouring in extraction.
    pool: Set[str] = field(default_factory=set)
```

(add `Set` to the `typing` import), change the signature to accept the locked set:

```python
def create_variables(
    model: cp_model.CpModel,
    matches: Dict[str, Match],
    config: ScheduleConfig,
    locked: Optional[Set[str]] = None,
) -> SchedulingVars:
```

and inside the loop, wrap the per-court block:

```python
    vars_.pool = pooled_match_ids(config, matches, locked or set())

    for match_id, match in matches.items():
        d = match.duration_slots
        max_start = max(T - d, 0)

        start_var = model.NewIntVar(0, max_start, f"start_{match_id}")
        end_var = model.NewIntVar(d, T, f"end_{match_id}")
        interval_var = model.NewIntervalVar(start_var, d, end_var, f"iv_{match_id}")

        vars_.start[match_id] = start_var
        vars_.end[match_id] = end_var
        vars_.interval[match_id] = interval_var

        # A pooled match has no court in the model at all — that is the whole
        # saving. Creating an unconstrained court var here would be worse than
        # useless: the solver would fill it arbitrarily and non-deterministically.
        if match_id in vars_.pool:
            continue

        court_var = model.NewIntVar(1, C, f"court_{match_id}")
        vars_.court[match_id] = court_var

        on_court_bools = []
        for c in range(1, C + 1):
            ...unchanged...
```

Import `pooled_match_ids` from `scheduler_core.engine.court_pool`.

Update the call site — `cpsat_backend.py:484`, today `create_variables(self.model, self.matches, self.config)` — to pass the locked set it already holds:

```python
        self.svars = create_variables(
            self.model, self.matches, self.config, self.locked_matches
        )
```

`self.locked_matches: Set[str]` is built at `cpsat_backend.py:370, 401, 414` and is already the set `objective.py` and `extraction.py` read.

- [ ] **Step 6: Split court capacity into pinned + pool**

Replace the body of `constraints/court_capacity.py`'s `apply`:

```python
    def apply(self, ctx: ConstraintContext) -> None:
        pool = getattr(ctx.svars, "pool", set())
        pooled_courts = pool_courts(ctx.config)

        # Pinned courts keep the per-court NoOverlap they have always had.
        # Only matches that still HAVE a per-court interval participate.
        for c in range(1, ctx.config.court_count + 1):
            if c in pooled_courts:
                continue
            intervals = [
                ctx.svars.court_interval[(m_id, c)]
                for m_id in ctx.matches
                if m_id not in pool
            ]
            if intervals:
                ctx.model.AddNoOverlap(intervals)
                ctx._num_no_overlap_groups += 1  # type: ignore[attr-defined]

        # The pool is one cumulative: at most |pool| matches at any instant.
        # This is the whole encoding change — O(matches x courts) booleans and
        # per-court NoOverlap groups collapse into a single global constraint.
        if pool and pooled_courts:
            intervals = [ctx.svars.interval[m_id] for m_id in pool]
            ctx.model.AddCumulative(intervals, [1] * len(intervals), len(pooled_courts))
```

Import `pool_courts` from `scheduler_core.engine.court_pool`. Keep the module docstring accurate — it currently says "lifted verbatim", which stops being true here.

- [ ] **Step 7: Colour in extraction**

In `extraction.py`, before the assignment loop:

```python
    # Pooled matches have no court variable — the model never chose one. Recover
    # court identity by colouring, so the emitted Assignment still carries a
    # court_id and the wire contract does not change shape (SP-COURT-1 §7).
    pool = getattr(svars, "pool", set())
    coloured: Dict[str, int] = {}
    if pool:
        order = sorted(
            ((solver.Value(svars.start[m]), matches[m].duration_slots, m) for m in pool),
            key=lambda t: sort_key(t[0], t[2]),
        )
        coloured = colour_left_edge(order, pool_courts(config))
```

and inside the loop replace the court read:

```python
        court = coloured[match_id] if match_id in coloured else solver.Value(svars.court[match_id])
```

Import `colour_left_edge`, `pool_courts` and `sort_key` from `scheduler_core.engine.court_pool` (`sort_key` arrives in Task 6 — for now sort by `(start, match_id)` inline and replace it there).

- [ ] **Step 8: Stop `court_change_penalty` crashing on pooled matches**

`objective.py:100-105` reads `ctx.svars.court[match_id]` to score court changes. Pooled matches have no court variable, so this is a **KeyError**, not a harmless no-op — and it fires exactly on the warm-restart and repair paths, where `previous_assignments` is non-empty. The spec asks for a test that the penalty is a no-op for pooled matches; it is really a crash guard.

Write the test first, in `tests/backend/unit/scheduling/test_court_policy.py`:

```python
def test_court_change_penalty_is_a_no_op_for_pooled_matches():
    """A re-solve with previous assignments must not crash or score courts.

    "Which court did it move to" is a meaningless question about a match the
    model never assigned a court to — the colouring answers that afterwards.
    """
    from scheduler_core.domain.models import PreviousAssignment

    req = _request(court_policy="queue")
    req.previous_assignments = [
        PreviousAssignment(match_id="m1", slot_id=0, court_id=1),
        PreviousAssignment(match_id="m2", slot_id=1, court_id=2),
    ]
    result = schedule(req)              # KeyError before the guard
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert len(result.assignments) == 2
```

Check `PreviousAssignment`'s real field names and how `ScheduleRequest` carries them in `models.py` before running — adjust the construction to match, not the assertion.

Run: `pytest tests/backend/unit/scheduling/test_court_policy.py -v -k "no_op"`
Expected: FAIL with `KeyError: 'm1'`.

Then guard it in `constraints/objective.py`:

```python
                # A pooled match has no court variable — queue mode solves for
                # time only and colours courts afterwards, so "did it change
                # court" is not a question the model can be asked. Skip rather
                # than KeyError (SP-COURT-1 Phase 2).
                if self.court_change_penalty > 0 and match_id not in getattr(
                    ctx.svars, "pool", set()
                ):
```

Run the test again: PASS.

- [ ] **Step 9: Run the full scheduling suite**

Run: `pytest tests/backend/unit/scheduling/ -v`
Expected: PASS, including `test_queue_mode_solves_and_every_assignment_still_carries_a_court` and `test_queue_and_pinned_reach_the_same_makespan`.

- [ ] **Step 10: Prove nothing else moved**

Run: `pytest`
Expected: the full backend suite green. `test_pinned_is_byte_identical_to_an_unset_policy` from Task 4 is the one that matters most here — if it fails, the pinned path was disturbed and the change is not additive.

Run: `ruff check packages/scheduler-core && cd apps/api/src && lint-imports --config ../.importlinter`
Expected: clean. `scheduler_core` purity is a pinned contract — `court_pool.py` must import nothing outside `scheduler_core`.

- [ ] **Step 11: Commit**

```bash
git add packages/scheduler-core/scheduler_core/engine/ tests/backend/unit/scheduling/test_court_policy.py
git commit -m "feat(scheduler-core): pool courts under queue policy, colour them in extraction"
```

---

### Task 6: Queue-order determinism contract

The emitted order in queue mode is product behaviour, not an implementation detail — the desk calls matches off it. Define it once, in one function, used by both the colouring sweep and any consumer that needs queue order.

**Files:**
- Modify: `packages/scheduler-core/scheduler_core/engine/court_pool.py`
- Modify: `packages/scheduler-core/scheduler_core/engine/extraction.py`
- Test: `tests/backend/unit/scheduling/test_court_policy.py`

**Interfaces:**
- Consumes: `colour_left_edge` from Task 5.
- Produces: `sort_key(start: int, match_id: str) -> Tuple[int, str]` — the single definition of queue order.

- [ ] **Step 1: Write the failing test**

```python
def test_queue_order_is_stable_across_identical_solves():
    a = schedule(_request(court_policy="queue"))
    b = schedule(_request(court_policy="queue"))
    assert [(x.match_id, x.slot_id, x.court_id) for x in a.assignments] == [
        (x.match_id, x.slot_id, x.court_id) for x in b.assignments
    ]


def test_queue_order_does_not_depend_on_input_order():
    """Permuting the input must not permute the day.

    Without a stable tiebreaker the colouring sweep would follow dict order,
    so the same tournament entered in a different order would call matches to
    different courts — a difference the desk would see and could not explain.
    """
    forward = _request(court_policy="queue")
    reversed_ = _request(court_policy="queue")
    reversed_.matches = list(reversed(reversed_.matches))

    a = {x.match_id: (x.slot_id, x.court_id) for x in schedule(forward).assignments}
    b = {x.match_id: (x.slot_id, x.court_id) for x in schedule(reversed_).assignments}
    assert a == b
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/backend/unit/scheduling/test_court_policy.py -v -k "order"`
Expected: `test_queue_order_does_not_depend_on_input_order` FAILS (court ids swap between the two runs). If it passes by luck on a two-match fixture, widen the fixture to six matches across three courts until it fails — a determinism test that cannot detect non-determinism is worthless.

- [ ] **Step 3: Define the order once**

Add to `court_pool.py`:

```python
def sort_key(start: int, match_id: str) -> Tuple[int, str]:
    """The ONE definition of queue order: solved start, then match id.

    ``match_id`` is a random UUID, so it carries no meaning — but it is
    STABLE, which is the only property a tiebreaker needs. Sorting by start
    alone leaves ties broken by dict insertion order, which means the same
    tournament entered in a different order would produce a different day.

    Both the colouring sweep and the emitted queue order use this. If they
    ever used different keys, the desk's call list and the court assignment
    would disagree about what comes next.
    """
    return (start, match_id)
```

Use it in `colour_left_edge`'s caller (already done in Task 5 Step 7 — replace the inline tuple with `sort_key(t[0], t[2])`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/backend/unit/scheduling/test_court_policy.py -v -k "order"`
Expected: PASS both.

- [ ] **Step 5: Confirm the determinism contract did not move**

Run: `pytest tests/backend/test_determinism.py -v`
Expected: PASS unchanged. Then run the simulator's determinism scenario per `simulator/README` (`make sim*` targets) and confirm no diff.

- [ ] **Step 6: Commit**

```bash
git add packages/scheduler-core/scheduler_core/engine/court_pool.py packages/scheduler-core/scheduler_core/engine/extraction.py tests/backend/unit/scheduling/test_court_policy.py
git commit -m "feat(scheduler-core): pin queue-order determinism to one sort key"
```

---

### Task 7: Closed windows fall back to pinned (CP8-v1)

`closed_court_windows` is applied inline in `cpsat_backend.py:487-527` against `svars.is_on_court` — which pooled matches do not have. Left alone, that block would **silently become a no-op** and the solver would happily schedule onto a closed court. Under CP8-v1 the engine steps aside instead.

**Files:**
- Modify: `packages/scheduler-core/scheduler_core/engine/court_pool.py`
- Modify: `packages/scheduler-core/scheduler_core/domain/models.py` (`ScheduleResult`)
- Modify: `packages/scheduler-core/scheduler_core/engine/cpsat_backend.py:487-527`
- Test: `tests/backend/unit/scheduling/test_court_policy.py`

**Interfaces:**
- Consumes: `pool_courts` from Task 5.
- Produces:
  - `effective_policy(config: ScheduleConfig) -> str` — what the engine will ACTUALLY do, after the closed-window fallback.
  - `ScheduleResult.effective_policy: str = "pinned"` — reported so a UI can explain why a queue-mode workspace got a pinned timetable.
  - `pool_courts` returns `[]` whenever the fallback fires, so every downstream consumer inherits the decision from one place.

- [ ] **Step 1: Write the failing test**

```python
def test_closed_windows_force_pinned_and_say_so():
    """CP8-v1: correctness beats the feature. The hybrid arrives in Phase 5."""
    result = schedule(_request(court_policy="queue", closed_court_windows=[(1, 0, 3)]))
    assert result.effective_policy == "pinned"
    # and the fallback is real, not cosmetic: nothing lands on court 1 early
    for a in result.assignments:
        if a.court_id == 1:
            assert a.slot_id >= 3


def test_queue_without_closed_windows_stays_queue():
    """NEGATIVE CONTROL for the fallback: it must not fire unconditionally."""
    assert schedule(_request(court_policy="queue")).effective_policy == "queue"


def test_legacy_closed_court_ids_also_trigger_the_fallback():
    result = schedule(_request(court_policy="queue", closed_court_ids=[2]))
    assert result.effective_policy == "pinned"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/backend/unit/scheduling/test_court_policy.py -v -k "closed or stays_queue"`
Expected: FAIL — `ScheduleResult` has no attribute `effective_policy`.

- [ ] **Step 3: Implement the fallback in one place**

In `court_pool.py`:

```python
def effective_policy(config: ScheduleConfig) -> str:
    """What the engine will ACTUALLY do, after the closed-window fallback.

    Ruling CP8-v1: closed-court windows are enforced by forbidding specific
    (match, court) pairs — machinery that needs the per-court variables queue
    mode deletes. Rather than let that enforcement silently evaporate, a solve
    with any closed window falls back to pinned and says so. A workspace that
    needs queue mode CONCURRENT with bracket occupancy waits for the Phase 5
    hybrid; a double-booked court is not a smaller problem than a slower solve.
    """
    if config.court_policy != "queue":
        return config.court_policy
    if config.closed_court_windows or config.closed_court_ids:
        return "pinned"
    return "queue"
```

and make `pool_courts` consult it, so no caller can bypass the fallback:

```python
def pool_courts(config: ScheduleConfig) -> List[int]:
    if effective_policy(config) != "queue":
        return []
    ...unchanged...
```

- [ ] **Step 4: Report it on the result**

In `models.py`, add to `ScheduleResult`:

```python
    # What the engine actually did, which is not always what was asked: a
    # queue-mode solve with closed court windows falls back to pinned
    # (ruling CP8-v1). Reported so the UI can explain the timetable rather
    # than leave the operator to notice.
    effective_policy: str = "pinned"
```

In `cpsat_backend.py`, set it where the `ScheduleResult` is constructed:

```python
            effective_policy=effective_policy(self.config),
```

- [ ] **Step 5: Guard the inline closed-window block**

In `cpsat_backend.py`, immediately before the `for match_id, match in self.matches.items():` loop that builds the closed-window BoolVars, add:

```python
        # Reachable only in pinned mode by construction — effective_policy()
        # forces pinned whenever this list is non-empty, so is_on_court exists
        # for every match here. Asserted rather than assumed: if the fallback
        # is ever weakened, this is where it would otherwise fail silently.
        if windows:
            assert effective_policy(self.config) == "pinned", (
                "closed-court windows require per-court variables; "
                "effective_policy must have forced pinned mode"
            )
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/backend/unit/scheduling/test_court_policy.py -v`
Expected: PASS, whole file, including the negative control that queue stays queue without windows.

- [ ] **Step 7: Run the full gate**

Run: `make check`
Expected: all green. This ends Phase 2.

Run `pytest tests/backend/test_schedule_validate_and_closed_courts.py -v` explicitly and read the output — that file is the existing closed-court coverage and is the most likely place a regression would surface.

- [ ] **Step 8: Update the spec's ledger**

Append a session entry to `docs/history/programs/SP-COURT-1.md` §9: phases completed (A, 1, 2), commits, gate results, that CP8-v1 shipped and D20 closed, and the exact next task — **Phase 3, blocked on CP4**.

- [ ] **Step 9: Commit**

```bash
git add packages/scheduler-core tests/backend/unit/scheduling/ docs/history/programs/SP-COURT-1.md
git commit -m "feat(scheduler-core): fall back to pinned when courts are closed (CP8-v1)"
```

---

## Self-review notes

**Spec coverage.** Phase A ← D20 + spec Phase 4a's hard/soft split. Phase 1 ← spec Phase 1, with CP1's `court_overrides` added because CP1 requires the pool be a *set* from the start. Phase 2 ← spec Phase 2 in full: cumulative encoding (Task 5), colouring + negative control (Task 5), order determinism (Task 6), closed-window semantics (Task 7), lock/pin exclusion (Task 5, `pooled_match_ids`). `court_change_penalty` is handled in Task 5 Step 8 — and the spec understates it: reading `objective.py:100-105` during planning showed it is a KeyError crash on the warm-restart/repair paths, not a no-op to assert. Phases 3–5 are out of scope per the scope section.

**Known gaps for the implementer to close from the tree, not from this plan:**
- Whether `RunSurface.tsx` already has `config` in scope for `defaultRestMinutes` (Task 3, Step 5); if not, take it from the same store selector the surface uses for `slotMinutes`.

**Open owner items this plan does NOT decide:** CP4 (Plan board in queue mode), CP5 (lookahead depth + whether Display shows it), CP6 (does queue mode apply to bracket draws), CP7 (ADR 0015 — owed once CP1–CP3 are recorded, which they now are; writing it is a good first commit of the follow-up plan).
