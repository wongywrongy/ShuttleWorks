# Operations Run Surface (SP-G1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **Run** surface in the Operations module — the live, state-driven day-of control plane (court board with relative Now/Next/Later lanes, global queue, match inspector, summary band) governed by one Operations-owned match-lifecycle state machine, for both Meet- and Bracket-sourced matches.

**Architecture:** A pure Operations-owned **state machine** (`scheduled→called→playing→done`, `late` derived) is the single contract; the board, queue, inspector, and band all derive from it. Run reads current match state from the existing reactive sources (meet `matchStateStore`+schedule, bracket polled snapshot) at the inbound seam and writes through an Operations-owned router: meet via the command queue (existing `call/start/finish` + **new** non-solver `assign_court`/`postpone_match`), bracket via typed `bracketApi` calls plus a **new Seam C** command endpoint for result/advancement. Lane and queue ordering are **derived** from `court+slot+status` so a mid-event refresh never loses the floor. No whole-floor re-solve ever runs in Run.

**Tech Stack:** Frontend — React 19, Zustand, dnd-kit, Tailwind, Vitest, `@scheduler/design-system/components`. Backend — FastAPI, SQLAlchemy, Pydantic, pytest (venv at repo-root `.venv/Scripts/python.exe`). Monorepo: `products/scheduler/{frontend,backend}`, engine `scheduler_core/`.

## Global Constraints

- **Status vocabulary (everywhere, exact):** `Scheduled`, `Called`, `Playing`, `Done`, with `Late` as a derived flag (never a stored state). Action labels name the state they produce: **Call**→Called, **Start**→Playing, **Record result**→Done. Sentence case. No synonyms ("Started"/"Ready"/"Playing now" are banned in Run UI).
- **`RunStatus` is Operations-owned** = `'scheduled' | 'called' | 'playing' | 'done'`. Map at the seams: meet legacy `started→playing`, `finished→done`; backend canonical is already `playing`/`finished`. Bracket has no persisted `called`.
- **No `Date.now()` / `Math.random()` / argless `new Date()` in pure modules** (`runMachine.ts`, `runModel.ts`) — `late`/`drift` take an injected `currentSlot`. Pure modules must be deterministic.
- **Never re-run the solver in Run.** `pinAndResolve` and the proposal pipeline are Plan-only. Court writes in Run use the non-solver command path only.
- **Derive, don't persist ordering.** Lanes/queue are computed from `court+slot+status`; the only new persistence is the court/slot written by `assign_court`/`postpone_match` and the `planFinalized` flag.
- **Do NOT edit existing Alembic migrations** (head `j3e7f9a1b5c8`). New persisted fields go in the `tournament.data` JSON blob (no migration) unless a column is unavoidable.
- **Backend already has the canonical state machine** (`services/match_state.py`). Extend it; do not fork a second one server-side.
- **Test commands:** frontend (from `products/scheduler/frontend`): `npx vitest run`, type gate `npx tsc -b`, `npm run build`. Backend (from repo root): `.venv/Scripts/python.exe -m pytest -q`. Baseline frontend = **409 passing**; must not regress. Known pre-existing backend fails to ignore: `test_routes_registered` + 2–3 backup timestamp-tie flakes.
- **Commit after each task.** Branch `dev/workspace-suite`. Do not push or commit unless the executing skill/user says so; if committing, end messages with the session footer.
- **Guardrail (Definition of Done):** if no `.tsx` under `products/scheduler/frontend/src/products/operations/` changed, the task did not complete. Deliverable = working Run behavior wired to Operations-owned state.

---

## File Structure

**New — frontend (`products/scheduler/frontend/src/products/operations/`)**
- `runtime/runMachine.ts` — pure state machine: `RunStatus`, `RunTransition`, `transition()`, action predicates, vocab mapping, `deriveLate()`, `deriveDriftSlots()`.
- `runtime/runModel.ts` — pure derivation: `RunMatch`, `toRunMatches()`, `deriveCourtLanes()`, `deriveQueue()`, `deriveSummary()`.
- `runtime/runActions.ts` — the Operations write router: maps `(RunMatch, RunActionKind)` → the correct seam call (meet command / bracket api / Seam C); plus `autoPullAssignments()` helper (pure planning of which queue head fills which freed court).
- `run/RunSurface.tsx` — composes the surface, owns selection + transient bracket-`called` set + auto-pull orchestration, wires the router.
- `run/RunSummaryBand.tsx`, `run/RunBoard.tsx`, `run/RunQueue.tsx`, `run/RunInspector.tsx` — presentational, driven by `runModel` output.
- `__tests__/runMachine.test.ts`, `__tests__/runModel.test.ts`, `__tests__/runActions.test.ts`, `__tests__/runSurface.test.tsx`.

**Modified — frontend**
- `OperationsProduct.tsx` — render `<RunSurface/>` for the live segment (replaces the read-only board+list Live branch); Plan (Courts) branch unchanged. Title/subtitle → "Run".
- `app/workspace/workspaceNav.ts:108-113` — labels `Courts`→`Plan`, `Live`→`Run`.
- `hooks/useBracketResultQueue.ts` — point `submitFn` at the new Seam C command endpoint.
- `api/client.ts` + `api/bracketClient.tsx` — add `assignMatchCourt`, `postponeMatch` (meet command helpers if not generic), `recordBracketResultCommand` (Seam C), `setPlanFinalized`.
- `api/dto.ts` — `MatchStateDTO` add `actualSlotId?: number`; `TournamentStateDTO` add `planFinalized?: boolean`.
- `products/operations/opsBlock.ts` — meet→OpsBlock reads live `actualSlotId` override for slot (so Run orders by the live slot).

**Modified — backend (`products/scheduler/backend/`)**
- `app/constants.py` — `MatchAction` add `ASSIGN_COURT`, `POSTPONE_MATCH`; extend `ACTION_TO_TARGET_STATUS`.
- `services/match_state.py:45-51` — `VALID_TRANSITIONS` add `PLAYING→SCHEDULED`.
- `repositories/local.py` `process_command` — handle court/slot set (assign) + clear (postpone) from payload.
- `app/schemas.py` — `MatchStateOut`/state DTO add `actualSlotId`; `TournamentStateDTO` add `planFinalized`. New `BracketCommandRequest`.
- `api/brackets.py` — new `POST /tournaments/{tid}/bracket/commands` (Seam C) reusing `record_result`.
- `api/state.py` (or wherever state PUT lives) / a small `POST /tournaments/{tid}/plan-finalized` — set the finalize flag.

**Tests — backend (`products/scheduler/backend/tests/`)**
- `unit/test_match_state_transitions.py` (extend) — `PLAYING→SCHEDULED`.
- `test_commands_assign_postpone.py` — new actions.
- `test_bracket_commands_seam_c.py` — Seam C idempotent advancement.
- `test_plan_finalized.py` — readiness flag round-trip.

---

## Vocabulary & seam map (read once before coding)

| Run action | Precondition (`RunStatus`) | Produces | Meet seam | Bracket seam |
|---|---|---|---|---|
| Call | `scheduled` & is court's Now | `called` | `call_to_court` cmd | transient Operations-`called` (not persisted) |
| Start | `called` | `playing` (clears late) | `start_match` cmd | `bracketApi.matchAction({action:'start'})` |
| Record result | `playing` | `done` | `finish_match` cmd (+score payload) | **Seam C** `recordBracketResultCommand` |
| Postpone | `called`\|`playing` | `scheduled`, leaves lane → queue | `postpone_match` cmd (clears court/slot) | `bracketApi.matchAction({action:'reset'})` (verify it un-assigns; see Task 9) |
| Assign / Send / Auto-pull | queue (`scheduled`, no court) | `scheduled` on a court | `assign_court` cmd (sets court/slot) | `bracketApi.pinMatch` |

Engine→`RunStatus` mapping: meet `scheduled→scheduled, called→called, started→playing, finished→done`; bracket `scheduled→scheduled, started→playing, finished→done` (+ Operations-local `called` overlay for bracket only).

---

## Task 1: Run state machine (the contract)

**Files:**
- Create: `products/scheduler/frontend/src/products/operations/runtime/runMachine.ts`
- Test: `products/scheduler/frontend/src/products/operations/__tests__/runMachine.test.ts`

**Interfaces:**
- Produces: `type RunStatus = 'scheduled'|'called'|'playing'|'done'`; `type RunActionKind = 'call'|'start'|'record'|'postpone'|'assign'`; `function transition(status: RunStatus, action: RunActionKind): RunStatus | null`; `function can(status: RunStatus, action: RunActionKind): boolean`; `function fromEngineStatus(s: 'scheduled'|'called'|'started'|'finished'): RunStatus`; `const RUN_STATUS_LABEL: Record<RunStatus,string>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { transition, can, fromEngineStatus, RUN_STATUS_LABEL } from '../runtime/runMachine';

describe('runMachine', () => {
  it('walks the happy path call→start→record', () => {
    expect(transition('scheduled', 'call')).toBe('called');
    expect(transition('called', 'start')).toBe('playing');
    expect(transition('playing', 'record')).toBe('done');
  });
  it('postpone returns called and playing to scheduled', () => {
    expect(transition('called', 'postpone')).toBe('scheduled');
    expect(transition('playing', 'postpone')).toBe('scheduled');
  });
  it('rejects illegal transitions with null', () => {
    expect(transition('scheduled', 'start')).toBeNull();   // must Call first
    expect(transition('done', 'record')).toBeNull();        // terminal
    expect(transition('scheduled', 'record')).toBeNull();
  });
  it('assign keeps a queued match scheduled', () => {
    expect(transition('scheduled', 'assign')).toBe('scheduled');
  });
  it('can() mirrors transition feasibility', () => {
    expect(can('called', 'start')).toBe(true);
    expect(can('scheduled', 'start')).toBe(false);
  });
  it('maps engine vocab to RunStatus', () => {
    expect(fromEngineStatus('started')).toBe('playing');
    expect(fromEngineStatus('finished')).toBe('done');
    expect(fromEngineStatus('called')).toBe('called');
  });
  it('labels use the canonical words', () => {
    expect(RUN_STATUS_LABEL).toMatchObject({
      scheduled: 'Scheduled', called: 'Called', playing: 'Playing', done: 'Done',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler/frontend && npx vitest run src/products/operations/__tests__/runMachine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * runMachine — the Operations-owned match lifecycle contract.
 *
 * One state machine governs Run. Every surface (board, queue, inspector,
 * band) derives action availability from `can()` and never invents its own
 * status vocabulary. `late` is a derived flag (see deriveLate), never a state.
 */
export type RunStatus = 'scheduled' | 'called' | 'playing' | 'done';
export type RunActionKind = 'call' | 'start' | 'record' | 'postpone' | 'assign';

/** Legal status→status edges. `assign` is a court change, not a status edge,
 *  so it is handled separately (keeps the match `scheduled`). */
const TRANSITIONS: Record<RunStatus, Partial<Record<RunActionKind, RunStatus>>> = {
  scheduled: { call: 'called', assign: 'scheduled' },
  called: { start: 'playing', postpone: 'scheduled' },
  playing: { record: 'done', postpone: 'scheduled' },
  done: {},
};

export function transition(status: RunStatus, action: RunActionKind): RunStatus | null {
  return TRANSITIONS[status][action] ?? null;
}
export function can(status: RunStatus, action: RunActionKind): boolean {
  return transition(status, action) !== null;
}

export function fromEngineStatus(s: 'scheduled' | 'called' | 'started' | 'finished'): RunStatus {
  if (s === 'started') return 'playing';
  if (s === 'finished') return 'done';
  return s; // scheduled | called
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  scheduled: 'Scheduled',
  called: 'Called',
  playing: 'Playing',
  done: 'Done',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/products/operations/__tests__/runMachine.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/frontend/src/products/operations/runtime/runMachine.ts products/scheduler/frontend/src/products/operations/__tests__/runMachine.test.ts
git commit -m "feat(operations): Run state machine — the lifecycle contract"
```

---

## Task 2: `late` + `drift` derivation (pure, clock-injected)

**Files:**
- Modify: `products/scheduler/frontend/src/products/operations/runtime/runMachine.ts`
- Test: `products/scheduler/frontend/src/products/operations/__tests__/runMachine.test.ts`

**Interfaces:**
- Produces: `function deriveLate(input: { status: RunStatus; plannedSlot?: number; currentSlot?: number }): boolean`; `function deriveDriftSlots(input: { status: RunStatus; plannedSlot?: number; span?: number; currentSlot?: number }): number` (slots a `playing` match is past its planned end; 0 otherwise).

- [ ] **Step 1: Write the failing test** (append to `runMachine.test.ts`)

```ts
import { deriveLate, deriveDriftSlots } from '../runtime/runMachine';

describe('deriveLate', () => {
  it('is late when past planned start and still scheduled/called', () => {
    expect(deriveLate({ status: 'scheduled', plannedSlot: 2, currentSlot: 3 })).toBe(true);
    expect(deriveLate({ status: 'called', plannedSlot: 2, currentSlot: 2 })).toBe(true);
  });
  it('clears once playing (or done)', () => {
    expect(deriveLate({ status: 'playing', plannedSlot: 2, currentSlot: 9 })).toBe(false);
    expect(deriveLate({ status: 'done', plannedSlot: 2, currentSlot: 9 })).toBe(false);
  });
  it('is not late before the planned start, or with no clock/plan', () => {
    expect(deriveLate({ status: 'scheduled', plannedSlot: 5, currentSlot: 3 })).toBe(false);
    expect(deriveLate({ status: 'scheduled', plannedSlot: undefined, currentSlot: 3 })).toBe(false);
    expect(deriveLate({ status: 'scheduled', plannedSlot: 5, currentSlot: undefined })).toBe(false);
  });
});
describe('deriveDriftSlots', () => {
  it('counts slots a playing match runs past its planned end', () => {
    expect(deriveDriftSlots({ status: 'playing', plannedSlot: 2, span: 1, currentSlot: 5 })).toBe(2);
    expect(deriveDriftSlots({ status: 'playing', plannedSlot: 2, span: 1, currentSlot: 3 })).toBe(0);
    expect(deriveDriftSlots({ status: 'called', plannedSlot: 2, span: 1, currentSlot: 9 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`deriveLate is not a function`).

- [ ] **Step 3: Implement** (append to `runMachine.ts`)

```ts
/** Late = past planned start while still waiting. Cleared on play. Pure. */
export function deriveLate(input: { status: RunStatus; plannedSlot?: number; currentSlot?: number }): boolean {
  const { status, plannedSlot, currentSlot } = input;
  if (status !== 'scheduled' && status !== 'called') return false;
  if (plannedSlot == null || currentSlot == null) return false;
  return currentSlot >= plannedSlot;
}

/** Slots a playing match has run past its planned end (planned + span). Pure. */
export function deriveDriftSlots(input: {
  status: RunStatus; plannedSlot?: number; span?: number; currentSlot?: number;
}): number {
  const { status, plannedSlot, span = 1, currentSlot } = input;
  if (status !== 'playing' || plannedSlot == null || currentSlot == null) return 0;
  return Math.max(0, currentSlot - (plannedSlot + span));
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `feat(operations): derive late + drift from injected clock (no Date.now)`

---

## Task 3: Run derivation model — lanes, queue, summary

**Files:**
- Create: `products/scheduler/frontend/src/products/operations/runtime/runModel.ts`
- Test: `products/scheduler/frontend/src/products/operations/__tests__/runModel.test.ts`

**Interfaces:**
- Consumes: `OpsBlock` from `../opsBlock` (fields `source,id,key,label,colorKey,court,slot,span,status,sideA,sideB,done,started`); `runMachine` (`RunStatus`, `fromEngineStatus`, `deriveLate`).
- Produces:
  - `interface RunMatch { key:string; id:string; source:'meet'|'bracket'; label:string; colorKey?:string; sideA:string; sideB:string; court?:number; plannedSlot?:number; span:number; status:RunStatus; late:boolean; eligible:boolean }`
  - `function toRunMatches(blocks: OpsBlock[], opts:{ currentSlot?:number; calledBracketIds?: ReadonlySet<string>; eligibleBracketIds?: ReadonlySet<string> }): RunMatch[]`
  - `interface CourtLane { court:number; now?:RunMatch; next?:RunMatch; later?:RunMatch; depth:number }`
  - `function deriveCourtLanes(matches: RunMatch[], courtCount:number): CourtLane[]`
  - `function deriveQueue(matches: RunMatch[]): RunMatch[]` — all unassigned, non-done, **sorted by `plannedSlot` (nulls last) then `key`**. Returns eligible *and* ineligible (the queue shows everything waiting); callers pick the assignable head via `nextEligible`.
  - `function nextEligible(queue: RunMatch[]): RunMatch | undefined` — first `eligible` match in queue order (the head auto-pull/assign uses).
  - `interface RunSummary { done:number; total:number; playing:number; courtsFree:number; late:number }`
  - `function deriveSummary(matches: RunMatch[], lanes: CourtLane[]): RunSummary`

**Eligibility (injected, keeps the model pure):** meet matches are eligible when both sides are known (`sideA`/`sideB` ≠ `'TBD'`). Bracket eligibility (both sides known **and** all feeder deps resolved) is computed by the parent — reuse `OperationsProduct`'s existing `schedulableCount` predicate to build `eligibleBracketIds` and pass it in. Auto-pull/assign must never place an ineligible (TBD-vs-TBD) match on a court.

**Queue ordering / postpone (documented deviation):** the queue sorts by `plannedSlot` then `key` — a *derived* order, so it survives refresh with no extra persistence. Consequence: a postponed match re-enters the queue by that key, **not** pushed to the tail as the mockup's in-memory demo does. This is the intended trade for refresh-durability; note it in `runModel`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { toRunMatches, deriveCourtLanes, deriveQueue, nextEligible, deriveSummary } from '../runtime/runModel';
import type { OpsBlock } from '../opsBlock';

const blk = (o: Partial<OpsBlock> & { id: string }): OpsBlock => ({
  source: 'meet', key: `meet:${o.id}`, label: o.id, span: 1,
  status: 'scheduled', sideA: 'A', sideB: 'B', done: false, started: false,
  ...o,
} as OpsBlock);

describe('runModel', () => {
  it('maps engine status to RunStatus and derives late', () => {
    const [m] = toRunMatches([blk({ id: 'a', status: 'started', court: 1, slot: 0 })], { currentSlot: 5 });
    expect(m.status).toBe('playing');
    expect(m.late).toBe(false); // playing clears late
    const [w] = toRunMatches([blk({ id: 'b', status: 'scheduled', court: 1, slot: 1 })], { currentSlot: 4 });
    expect(w.late).toBe(true);
  });
  it('overlays Operations-local called onto bracket matches', () => {
    const [m] = toRunMatches(
      [blk({ id: 'p', source: 'bracket', key: 'bracket:p', status: 'scheduled', court: 2, slot: 0 })],
      { calledBracketIds: new Set(['p']) },
    );
    expect(m.status).toBe('called');
  });
  it('orders each court lane by slot, drops done, exposes Now/Next/Later + depth', () => {
    const ms = toRunMatches([
      blk({ id: 'n3', court: 1, slot: 3 }),
      blk({ id: 'done', court: 1, slot: 0, status: 'finished', done: true }),
      blk({ id: 'n1', court: 1, slot: 1 }),
      blk({ id: 'n2', court: 1, slot: 2 }),
    ], {});
    const [lane] = deriveCourtLanes(ms, 1);
    expect([lane.now?.id, lane.next?.id, lane.later?.id]).toEqual(['n1', 'n2', 'n3']);
    expect(lane.depth).toBe(3); // 3 not-done on court 1
  });
  it('renders a free court (empty lane) for courts with no live matches', () => {
    const lanes = deriveCourtLanes(toRunMatches([blk({ id: 'x', court: 1, slot: 0 })], {}), 2);
    expect(lanes[1].now).toBeUndefined();
  });
  it('queue = unassigned non-done, sorted by plannedSlot then key; excludes court-assigned', () => {
    const ms = toRunMatches([
      blk({ id: 'q2', court: undefined, slot: 5 }),
      blk({ id: 'on', court: 1, slot: 0 }),
      blk({ id: 'q1', court: undefined, slot: 2 }),
      blk({ id: 'fin', status: 'finished', done: true }),
    ], {});
    expect(deriveQueue(ms).map((m) => m.id)).toEqual(['q1', 'q2']); // slot 2 before slot 5
  });
  it('marks bracket eligibility and nextEligible skips TBD-vs-TBD', () => {
    const ms = toRunMatches(
      [
        blk({ id: 'feeder', source: 'bracket', key: 'bracket:feeder', sideA: 'TBD', sideB: 'TBD', slot: 1 }),
        blk({ id: 'ready', source: 'bracket', key: 'bracket:ready', sideA: 'Lin', sideB: 'Roy', slot: 2 }),
      ],
      { eligibleBracketIds: new Set(['ready']) },
    );
    const q = deriveQueue(ms);
    expect(q.map((m) => m.id)).toEqual(['feeder', 'ready']); // both shown, slot order
    expect(nextEligible(q)?.id).toBe('ready');               // ineligible feeder skipped
  });
  it('meet match is eligible when both sides are known', () => {
    const [m] = toRunMatches([blk({ id: 'm', sideA: 'A', sideB: 'B' })], {});
    expect(m.eligible).toBe(true);
    const [u] = toRunMatches([blk({ id: 'u', sideA: 'TBD', sideB: 'B' })], {});
    expect(u.eligible).toBe(false);
  });
  it('summary counts are all derived', () => {
    const ms = toRunMatches([
      blk({ id: 'p', court: 1, slot: 0, status: 'started' }),
      blk({ id: 'd', status: 'finished', done: true }),
      blk({ id: 'lateq', court: undefined, slot: 1 }), // unassigned, late candidate
    ], { currentSlot: 9 });
    const lanes = deriveCourtLanes(ms, 3);
    const s = deriveSummary(ms, lanes);
    expect(s).toMatchObject({ done: 1, total: 3, playing: 1, courtsFree: 2 });
    expect(s.late).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run → FAIL** (module not found).

- [ ] **Step 3: Implement** (`runModel.ts`)

```ts
import type { OpsBlock } from '../opsBlock';
import { fromEngineStatus, deriveLate, type RunStatus } from './runMachine';

export interface RunMatch {
  key: string; id: string; source: 'meet' | 'bracket';
  label: string; colorKey?: string; sideA: string; sideB: string;
  court?: number; plannedSlot?: number; span: number;
  status: RunStatus; late: boolean; eligible: boolean;
}

const TBD = 'TBD';

export function toRunMatches(
  blocks: OpsBlock[],
  opts: { currentSlot?: number; calledBracketIds?: ReadonlySet<string>; eligibleBracketIds?: ReadonlySet<string> },
): RunMatch[] {
  const { currentSlot, calledBracketIds, eligibleBracketIds } = opts;
  return blocks.map((b) => {
    let status = fromEngineStatus(b.status as 'scheduled' | 'called' | 'started' | 'finished');
    // Bracket has no persisted `called`; overlay the Operations-local flag.
    if (status === 'scheduled' && b.source === 'bracket' && calledBracketIds?.has(b.id)) {
      status = 'called';
    }
    // Eligible = playable now. Meet: both sides known. Bracket: parent supplies
    // the resolved-feeders set (reuse schedulableCount's predicate).
    const eligible =
      b.source === 'meet'
        ? b.sideA !== TBD && b.sideB !== TBD
        : (eligibleBracketIds?.has(b.id) ?? false);
    return {
      key: b.key, id: b.id, source: b.source, label: b.label, colorKey: b.colorKey,
      sideA: b.sideA, sideB: b.sideB, court: b.court ?? undefined, plannedSlot: b.slot,
      span: b.span ?? 1, status,
      late: deriveLate({ status, plannedSlot: b.slot, currentSlot }),
      eligible,
    };
  });
}

export interface CourtLane { court: number; now?: RunMatch; next?: RunMatch; later?: RunMatch; depth: number; }

export function deriveCourtLanes(matches: RunMatch[], courtCount: number): CourtLane[] {
  const n = Math.max(1, courtCount);
  return Array.from({ length: n }, (_, i) => i + 1).map((court) => {
    const lane = matches
      .filter((m) => m.court === court && m.status !== 'done')
      .sort((a, b) => (a.plannedSlot ?? Infinity) - (b.plannedSlot ?? Infinity)
        || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return { court, now: lane[0], next: lane[1], later: lane[2], depth: lane.length };
  });
}

export function deriveQueue(matches: RunMatch[]): RunMatch[] {
  return matches
    .filter((m) => m.court == null && m.status !== 'done')
    .sort((a, b) => (a.plannedSlot ?? Infinity) - (b.plannedSlot ?? Infinity)
      || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The assignable head — first eligible match in queue order. Skips waiting
 *  (TBD-vs-TBD / unresolved-feeder) matches so auto-pull never lands one. */
export function nextEligible(queue: RunMatch[]): RunMatch | undefined {
  return queue.find((m) => m.eligible);
}

export interface RunSummary { done: number; total: number; playing: number; courtsFree: number; late: number; }

export function deriveSummary(matches: RunMatch[], lanes: CourtLane[]): RunSummary {
  return {
    done: matches.filter((m) => m.status === 'done').length,
    total: matches.length,
    playing: matches.filter((m) => m.status === 'playing').length,
    courtsFree: lanes.filter((l) => l.now == null).length,
    late: matches.filter((m) => m.late).length,
  };
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `feat(operations): Run derivation — court lanes, queue, summary`

---

## Task 4: Backend — add `PLAYING→SCHEDULED` transition

**Files:**
- Modify: `products/scheduler/backend/services/match_state.py:45-51`
- Test: `products/scheduler/backend/tests/unit/test_match_state_transitions.py` (create if absent)

**Interfaces:**
- Consumes: `MatchStatus` (`database/models.py`), `assert_valid_transition` (`services/match_state.py`).
- Produces: `VALID_TRANSITIONS[PLAYING]` now includes `SCHEDULED` (postpone-from-playing).

- [ ] **Step 1: Write the failing test**

```python
import pytest
from backend.services.match_state import assert_valid_transition, VALID_TRANSITIONS
from backend.database.models import MatchStatus

def test_playing_can_return_to_scheduled_for_postpone():
    # Should not raise.
    assert_valid_transition("m1", MatchStatus.PLAYING, MatchStatus.SCHEDULED)
    assert MatchStatus.SCHEDULED in VALID_TRANSITIONS[MatchStatus.PLAYING]

def test_playing_still_reaches_finished_and_retired():
    assert_valid_transition("m1", MatchStatus.PLAYING, MatchStatus.FINISHED)
    assert_valid_transition("m1", MatchStatus.PLAYING, MatchStatus.RETIRED)
```

(Confirm the import path matches the repo's test convention — existing tests under `tests/unit/` import as `from backend.services...`. Match whatever the sibling tests use.)

- [ ] **Step 2: Run → FAIL**

Run: `.venv/Scripts/python.exe -m pytest products/scheduler/backend/tests/unit/test_match_state_transitions.py -q`
Expected: FAIL — `ConflictError` raised / `SCHEDULED not in [...]`.

- [ ] **Step 3: Implement** — edit `VALID_TRANSITIONS`:

```python
VALID_TRANSITIONS: dict[MatchStatus, list[MatchStatus]] = {
    MatchStatus.SCHEDULED: [MatchStatus.CALLED],
    MatchStatus.CALLED: [MatchStatus.PLAYING, MatchStatus.SCHEDULED],
    MatchStatus.PLAYING: [MatchStatus.FINISHED, MatchStatus.RETIRED, MatchStatus.SCHEDULED],
    MatchStatus.FINISHED: [],
    MatchStatus.RETIRED: [],
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `feat(scheduler): allow PLAYING→SCHEDULED for live postpone`

---

## Task 5: Backend — `assign_court` + `postpone_match` commands (non-solver)

**Files:**
- Modify: `products/scheduler/backend/app/constants.py:20-43`
- Modify: `products/scheduler/backend/repositories/local.py` (`process_command` — court/slot mutation)
- Modify: `products/scheduler/backend/app/schemas.py` — `MatchStateOut`/state row add `actualSlotId`; ensure `payload` carries `court_id`/`time_slot`.
- Test: `products/scheduler/backend/tests/test_commands_assign_postpone.py` (new)

**Interfaces:**
- Consumes: `CommandRequest{id, match_id, action, payload, seen_version}`, `process_command(...)`, `matches` table cols `status,version,court_id,time_slot`.
- Produces: `MatchAction.ASSIGN_COURT='assign_court'`, `MatchAction.POSTPONE_MATCH='postpone_match'`; `assign_court` sets `court_id=payload['court_id']`, `time_slot=payload['time_slot']`, status stays/→`scheduled`; `postpone_match` sets `court_id=None`, `time_slot=None`, status→`scheduled`; `CommandResponse.court_id/time_slot` reflect the result.

- [ ] **Step 1: Write the failing test**

```python
import uuid
# Use the repo's existing command-endpoint test harness/fixtures (see
# tests/test_schedule_endpoints_e2e.py + the commands tests) for app client + a seeded meet match.

def _cmd(client, tid, match_id, action, payload, seen_version):
    return client.post(f"/tournaments/{tid}/commands", json={
        "id": str(uuid.uuid4()), "match_id": match_id,
        "action": action, "payload": payload, "seen_version": seen_version,
    })

def test_assign_court_sets_court_and_slot_without_solving(meet_client, seeded_meet):
    tid, match_id, version = seeded_meet  # match starts unassigned (court_id None)
    r = _cmd(meet_client, tid, match_id, "assign_court", {"court_id": 3, "time_slot": 7}, version)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "scheduled"
    assert body["court_id"] == 3 and body["time_slot"] == 7

def test_postpone_clears_assignment_and_returns_to_scheduled(meet_client, seeded_playing_match):
    tid, match_id, version = seeded_playing_match  # status playing, court 2 slot 4
    r = _cmd(meet_client, tid, match_id, "postpone_match", {}, version)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "scheduled"
    assert body["court_id"] is None and body["time_slot"] is None
```

(If the repo lacks these fixtures, build them from the existing command tests; seed a meet tournament + one match, fetch its version via the state/match-state GET.)

- [ ] **Step 2: Run → FAIL** (422/400 — unknown action `assign_court`).

- [ ] **Step 3: Implement**

`app/constants.py` — extend enum + map (assign/postpone both target SCHEDULED; SCHEDULED→SCHEDULED self-edge skips the guard since `process_command` only asserts when `target != current`, but postpone from playing/called→scheduled is now legal via Task 4 / existing edge):

```python
class MatchAction(str, Enum):
    CALL_TO_COURT = "call_to_court"
    START_MATCH = "start_match"
    FINISH_MATCH = "finish_match"
    RETIRE_MATCH = "retire_match"
    UNCALL = "uncall"
    ASSIGN_COURT = "assign_court"       # set court+slot, no solve (status stays scheduled)
    POSTPONE_MATCH = "postpone_match"   # clear court+slot, status → scheduled

ACTION_TO_TARGET_STATUS: dict[MatchAction, MatchStatus] = {
    MatchAction.CALL_TO_COURT: MatchStatus.CALLED,
    MatchAction.START_MATCH: MatchStatus.PLAYING,
    MatchAction.FINISH_MATCH: MatchStatus.FINISHED,
    MatchAction.RETIRE_MATCH: MatchStatus.RETIRED,
    MatchAction.UNCALL: MatchStatus.SCHEDULED,
    MatchAction.ASSIGN_COURT: MatchStatus.SCHEDULED,
    MatchAction.POSTPONE_MATCH: MatchStatus.SCHEDULED,
}
```

`repositories/local.py` `process_command` — in the apply step (around the existing `match.status = target_status.value`), add court/slot mutation keyed on the action:

```python
# --- court/slot side-effects for the live (non-solver) assign + postpone ---
if action == MatchAction.ASSIGN_COURT:
    payload = payload or {}
    match.court_id = payload.get("court_id", match.court_id)
    match.time_slot = payload.get("time_slot", match.time_slot)
elif action == MatchAction.POSTPONE_MATCH:
    match.court_id = None
    match.time_slot = None
# (CALL_TO_COURT may already carry an optional court_id in payload — keep that
#  behaviour; only ASSIGN_COURT/POSTPONE_MATCH change court for non-call actions.)
```

`app/schemas.py` — add `actualSlotId` to the match-state output DTO so the frontend can order Run lanes by the live slot (the column is `time_slot`):

```python
class MatchStateOut(BaseModel):
    # ...existing fields...
    actualCourtId: Optional[int] = None
    actualSlotId: Optional[int] = None   # NEW — live slot (matches.time_slot)
```

(Map `time_slot → actualSlotId` wherever `MatchStateOut` is serialized — mirror the `court_id → actualCourtId` mapping.)

- [ ] **Step 4: Run → PASS.** Then full backend suite to catch dispatch/serialization regressions: `.venv/Scripts/python.exe -m pytest products/scheduler/backend -q` (ignore the known pre-existing fails).

- [ ] **Step 5: Commit** — `feat(scheduler): non-solver assign_court + postpone_match commands`

---

## Task 6: Backend — Seam C (bracket result via command)

**Files:**
- Modify: `products/scheduler/backend/app/schemas.py` — `BracketCommandRequest`.
- Modify: `products/scheduler/backend/api/brackets.py` — `POST /tournaments/{tid}/bracket/commands`.
- Test: `products/scheduler/backend/tests/test_bracket_commands_seam_c.py` (new)

**Interfaces:**
- Consumes: `record_result(state, draws, play_unit_id, winner_side, *, finished_at_slot, walkover, score) -> List[PlayUnitId]` (`services/bracket/advancement.py:42`); existing `seen_version` guard pattern (`brackets.py:1897`).
- Produces: `POST /tournaments/{tid}/bracket/commands` accepting `BracketCommandRequest{id: UUID, kind: Literal['record_result'], play_unit_id, winner_side, seen_version?, finished_at_slot?, walkover?, score?}`, returning `TournamentOut`. Idempotent on `id` (replay returns the current snapshot, does not double-advance).

- [ ] **Step 1: Write the failing test**

```python
import uuid

def _bcmd(client, tid, **kw):
    body = {"id": str(uuid.uuid4()), "kind": "record_result", **kw}
    return client.post(f"/tournaments/{tid}/bracket/commands", json=body)

def test_seam_c_records_result_and_advances(bracket_client, seeded_bracket):
    tid, pu_id, version = seeded_bracket  # a ready round-0 play unit
    r = _bcmd(bracket_client, tid, play_unit_id=pu_id, winner_side="A", seen_version=version)
    assert r.status_code == 200, r.text
    dto = r.json()
    # the result is recorded and the downstream unit now references the winner
    assert any(res["play_unit_id"] == pu_id for res in dto["results"])

def test_seam_c_is_idempotent_on_command_id(bracket_client, seeded_bracket):
    tid, pu_id, version = seeded_bracket
    cid = str(uuid.uuid4())
    body = {"id": cid, "kind": "record_result", "play_unit_id": pu_id, "winner_side": "A", "seen_version": version}
    r1 = bracket_client.post(f"/tournaments/{tid}/bracket/commands", json=body)
    r2 = bracket_client.post(f"/tournaments/{tid}/bracket/commands", json=body)  # replay
    assert r1.status_code == 200 and r2.status_code == 200
    # exactly one result for pu_id (no double advance)
    results = [x for x in r2.json()["results"] if x["play_unit_id"] == pu_id]
    assert len(results) == 1
```

- [ ] **Step 2: Run → FAIL** (404 — endpoint missing).

- [ ] **Step 3: Implement**

`app/schemas.py`:

```python
class BracketCommandRequest(BaseModel):
    id: uuid.UUID
    kind: Literal["record_result"]
    play_unit_id: str
    winner_side: Literal["A", "B"]
    seen_version: Optional[int] = None
    finished_at_slot: Optional[int] = None
    walkover: bool = False
    score: Optional[dict] = None
```

`api/brackets.py` — new route mirroring `record_match_result` but command-shaped + idempotent. Reuse the existing hydrate/serialize + `record_result`.

**Idempotency is real blob-schema work, not an accessor (budget it):** add a persisted `applied_command_ids` set to the bracket session/`data` blob and thread it through the existing **hydrate → mutate → serialize → persist** lifecycle (read it on hydrate, write it on persist) — the same way `match_versions`/`results` are threaded. The **replay check must run BEFORE the `seen_version` guard**: on a genuine replay the version has already advanced, so the version guard alone would (correctly) 409 and break idempotency — the early replay-return is what makes a repeated command a no-op. Keep that ordering.

```python
@router.post("/commands", response_model=TournamentOut, dependencies=[_OPERATOR])
def submit_bracket_command(
    body: BracketCommandRequest,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> TournamentOut:
    session = _hydrate_session(repo, tournament_id)  # existing helper
    # Idempotency: replay → return current snapshot, do not advance.
    applied = session.applied_command_ids  # persisted set in data blob (add accessor)
    if str(body.id) in applied:
        return _serialize_session(session)
    # Optimistic concurrency (mirror record_match_result:1897-1909)
    if body.seen_version is not None:
        current = session.match_versions.get(body.play_unit_id, 1)
        if body.seen_version != current:
            raise ConflictError(match_id=body.play_unit_id, current_version=current,
                                seen_version=body.seen_version, message="bracket match changed")
    record_result(session.state, session.draws, body.play_unit_id,
                  WinnerSide(body.winner_side), finished_at_slot=body.finished_at_slot,
                  walkover=body.walkover, score=body.score)
    applied.add(str(body.id))
    _persist_session(session, repo)  # existing write path used by record_match_result
    return _serialize_session(session)
```

(Use the *exact* hydrate/serialize/persist helpers `record_match_result` uses — read `brackets.py:1867-1951` and copy its session lifecycle precisely; only the idempotency guard + reuse of `record_result` are new.)

- [ ] **Step 4: Run → PASS**, then full bracket suite.

- [ ] **Step 5: Commit** — `feat(scheduler): Seam C — bracket result/advancement via Operations command`

---

## Task 7: Backend — Plan-finalized readiness flag

**Files:**
- Modify: `products/scheduler/backend/app/schemas.py` — `TournamentStateDTO` add `planFinalized: bool = False`.
- Modify: state write path / new `POST /tournaments/{tid}/plan-finalized` (`api/state.py` or the tournaments router).
- Test: `products/scheduler/backend/tests/test_plan_finalized.py` (new)

**Interfaces:**
- Produces: `planFinalized` persisted in `tournament.data`; `POST /tournaments/{tid}/plan-finalized {finalized: bool}` toggles it; `GET .../state` round-trips it.

- [ ] **Step 1: Write the failing test**

```python
def test_plan_finalized_round_trips(client, seeded_meet_tid):
    tid = seeded_meet_tid
    assert client.get(f"/tournaments/{tid}/state").json().get("planFinalized") in (False, None)
    r = client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": True})
    assert r.status_code == 200, r.text
    assert client.get(f"/tournaments/{tid}/state").json()["planFinalized"] is True
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the field (default `False`) + the toggle endpoint (read blob, set `data["planFinalized"]`, persist). Keep it a pure flag — no derivation required server-side; Run derives "what's missing" client-side.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(scheduler): planFinalized flag + toggle for Plan→Run handoff`

---

## Task 8: Frontend API clients + DTOs for the new seams

**Files:**
- Modify: `products/scheduler/frontend/src/api/dto.ts` — `MatchStateDTO` add `actualSlotId?: number`; `TournamentStateDTO` add `planFinalized?: boolean`.
- Modify: `products/scheduler/frontend/src/api/client.ts` — `recordBracketResultCommand`, `setPlanFinalized` (and confirm the generic command submit can carry `assign_court`/`postpone_match` + payload).
- Modify: `products/scheduler/frontend/src/products/operations/opsBlock.ts` — meet→OpsBlock: slot reads `st?.actualSlotId ?? a?.slotId` (live slot wins, mirroring the existing `actualCourtId ?? a?.courtId`).
- Test: `products/scheduler/frontend/src/products/operations/__tests__/opsBlock.test.ts` (extend)

- [ ] **Step 1: Add a failing test** — meet OpsBlock prefers the live slot override:

```ts
it('meet block uses the live actualSlotId override over the planned slot', () => {
  const matches = [{ id: 'm', sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1' } as any];
  const schedule = { assignments: [{ matchId: 'm', slotId: 2, courtId: 1, durationSlots: 1 }] } as any;
  const states = { m: { matchId: 'm', status: 'scheduled', actualCourtId: 3, actualSlotId: 9 } } as any;
  const [b] = meetToOpsBlocks(matches, schedule, states, { p1: 'P1', p2: 'P2' });
  expect(b.court).toBe(3);
  expect(b.slot).toBe(9);
});
```

- [ ] **Step 2: Run → FAIL** (slot is 2).
- [ ] **Step 3: Implement** — in `meetToOpsBlocks`, `const slot = st?.actualSlotId ?? a?.slotId;` and use it. Add the DTO fields. Add client methods:

```ts
// client.ts
recordBracketResultCommand: (tid: string, body: { id: string; play_unit_id: string; winner_side: 'A'|'B'; seen_version?: number; score?: unknown; walkover?: boolean }) =>
  http.post(`/tournaments/${tid}/bracket/commands`, { kind: 'record_result', ...body }),
setPlanFinalized: (tid: string, finalized: boolean) =>
  http.post(`/tournaments/${tid}/plan-finalized`, { finalized }),
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(operations): client + DTO wiring for live slot, Seam C, finalize`

---

## Task 9: Run write router + auto-pull planner

**Files:**
- Create: `products/scheduler/frontend/src/products/operations/runtime/runActions.ts`
- Test: `products/scheduler/frontend/src/products/operations/__tests__/runActions.test.ts`

**Interfaces:**
- Consumes: `RunMatch`, `CourtLane` (`runModel`); `can` (`runMachine`); `useCommandQueue().submit`, `useBracketApi()`, `recordBracketResultCommand`.
- Produces:
  - `type RunActionKind` re-exported; `interface RunSeams { meetSubmit; bracketApi; bracketResult; setCalledBracket(id,on) }`
  - `function runAction(match: RunMatch, kind: RunActionKind, target: { court?: number; slot?: number } | undefined, seams: RunSeams): void` — guarded by `can()`, routes per the seam map table above.
  - `function slotForAssign(court: number, matches: RunMatch[], currentSlot: number): number` — pure: the synthesized lane slot for a match newly placed on `court` = `max(currentSlot, ...plannedSlot of that court's non-done matches) + 1`. Orders the newcomer after the court's current lane and never before "now". Injected `currentSlot` (no clock read); persisted via `assign_court`'s `time_slot`.
  - `function planAutoPull(lanes: CourtLane[], queue: RunMatch[], allMatches: RunMatch[], currentSlot: number): Array<{ matchKey: string; court: number; slot: number }>` — pure: for each free court (`now == null`), take `nextEligible` of the *remaining* queue (consume it so two free courts can't grab the same match), slot via `slotForAssign`. Deterministic; no clock read.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runAction, planAutoPull } from '../runtime/runActions';

const seams = () => ({
  meetSubmit: vi.fn(), bracketApi: { matchAction: vi.fn().mockResolvedValue({}), pinMatch: vi.fn().mockResolvedValue({}) },
  bracketResult: vi.fn(), setCalledBracket: vi.fn(),
});
const m = (o: any) => ({ key: o.key ?? `${o.source}:${o.id}`, id: o.id, source: o.source ?? 'meet', label: o.id, sideA: 'A', sideB: 'B', span: 1, status: o.status ?? 'scheduled', late: false, court: o.court, plannedSlot: o.slot });

describe('runAction routing', () => {
  it('meet call/start/record go through the command queue', () => {
    const s = seams();
    runAction(m({ id: 'a', status: 'scheduled', court: 1 }), 'call', undefined, s);
    runAction(m({ id: 'a', status: 'called', court: 1 }), 'start', undefined, s);
    runAction(m({ id: 'a', status: 'playing', court: 1 }), 'record', undefined, s);
    expect(s.meetSubmit).toHaveBeenNthCalledWith(1, 'call_to_court', 'a', undefined);
    expect(s.meetSubmit).toHaveBeenNthCalledWith(2, 'start_match', 'a', undefined);
    expect(s.meetSubmit).toHaveBeenNthCalledWith(3, 'finish_match', 'a', undefined);
  });
  it('meet assign/postpone send court payloads', () => {
    const s = seams();
    runAction(m({ id: 'q', status: 'scheduled' }), 'assign', { court: 2, slot: 5 }, s);
    runAction(m({ id: 'p', status: 'playing', court: 2 }), 'postpone', undefined, s);
    expect(s.meetSubmit).toHaveBeenCalledWith('assign_court', 'q', { court_id: 2, time_slot: 5 });
    expect(s.meetSubmit).toHaveBeenCalledWith('postpone_match', 'p', {});
  });
  it('bracket record routes to Seam C; start to matchAction; call sets local flag', () => {
    const s = seams();
    runAction(m({ id: 'b', source: 'bracket', status: 'scheduled', court: 1 }), 'call', undefined, s);
    runAction(m({ id: 'b', source: 'bracket', status: 'called', court: 1 }), 'start', undefined, s);
    expect(s.setCalledBracket).toHaveBeenCalledWith('b', true);
    expect(s.bracketApi.matchAction).toHaveBeenCalledWith({ play_unit_id: 'b', action: 'start' });
  });
  it('refuses illegal transitions (no seam call)', () => {
    const s = seams();
    runAction(m({ id: 'a', status: 'scheduled', court: 1 }), 'start', undefined, s);
    expect(s.meetSubmit).not.toHaveBeenCalled();
  });
});

describe('planAutoPull', () => {
  it('fills only free courts, from the eligible queue head, with a concrete slot', () => {
    const lanes = [
      { court: 1, now: undefined, depth: 0 },
      { court: 2, now: { id: 'on', plannedSlot: 4 } as any, depth: 1 },
    ] as any;
    const queue = [
      { ...m({ id: 'wait' }), eligible: false },     // ineligible head → skipped
      { ...m({ id: 'q1' }), eligible: true, plannedSlot: 2 },
    ];
    const plan = planAutoPull(lanes, queue, [...queue], 6);
    // court 1 is free → gets q1 (the eligible head); court 2 is busy → untouched.
    // slot = max(currentSlot 6, court-1 lane slots none) + 1 = 7.
    expect(plan).toEqual([{ matchKey: 'meet:q1', court: 1, slot: 7 }]);
  });
  it('does not assign the same match to two free courts', () => {
    const lanes = [{ court: 1, now: undefined, depth: 0 }, { court: 2, now: undefined, depth: 0 }] as any;
    const queue = [{ ...m({ id: 'only' }), eligible: true, plannedSlot: 0 }];
    const plan = planAutoPull(lanes, queue, [...queue], 3);
    expect(plan).toHaveLength(1);
    expect(plan[0].court).toBe(1);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `runActions.ts` per the seam-map table (guard every action with `can(match.status, kind)` and return early if false; for bracket `record`, call `bracketResult({ matchId: id, winnerSide })`; for `assign`, meet→`meetSubmit('assign_court', id, {court_id, time_slot})`, bracket→`bracketApi.pinMatch({play_unit_id:id, court_id, slot_id})`; for `postpone`, meet→`meetSubmit('postpone_match', id, {})`, bracket→`bracketApi.matchAction({play_unit_id:id, action:'reset'})`). Implement `slotForAssign` + `planAutoPull` as the tests specify.

  **Verify-before-proceeding (read the backend handlers; do NOT assume — this is the same anti-pattern you rejected for meet `pinAndResolve`):**
  - Does bracket **`pinMatch`** (assign) trigger a bracket **re-solve**? If yes, it's the wrong path for live assign — use a direct single-placement write or add a minimal non-solver bracket assign, mirroring the meet `assign_court` decision. Don't ship a per-assign bracket solve.
  - Does **`matchAction('reset')`** actually **un-assign the court** (clear the assignment, not just reset start)? If not, route bracket postpone through a minimal bracket unassign instead.
  - Record both findings in a comment at the top of `runActions.ts` so the seam boundary is explicit.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(operations): Run write router + auto-pull planner`

---

## Task 10: Point the bracket result queue at Seam C

**Files:**
- Modify: `products/scheduler/frontend/src/hooks/useBracketResultQueue.ts:~87`
- Test: extend `products/scheduler/frontend/src/hooks/__tests__/` bracket-queue test if present (else add a focused test asserting the new client method is called).

- [ ] **Step 1: Failing test** — submitting a result calls `recordBracketResultCommand` (not `recordBracketResultVersioned`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3:** change `submitFn` to call `apiClient.recordBracketResultCommand(tid, { id: cmd.id, play_unit_id: cmd.matchId, winner_side: cmd.winnerSide, seen_version: cmd.seenVersion, score: cmd.score })`. Keep the IndexedDB persistence + conflict handling exactly as-is.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `refactor(operations): bracket results flow through Seam C`

---

## Task 11: `RunSummaryBand` (derived band)

**Files:**
- Create: `products/scheduler/frontend/src/products/operations/run/RunSummaryBand.tsx`
- Test: `__tests__/runSurface.test.tsx` (start the file; band assertions)

**Interfaces:** Consumes `RunSummary`. Renders four stats — `done` (`{done} / {total}`), `playing`, `courts free`, `late` — using the exact words. No internal counting; props only.

- [ ] **Step 1: Failing test** — renders `2 / 5`, `Playing`, `Courts free`, `Late` from a `RunSummary` prop.
- [ ] **Step 2: FAIL.** → [ ] **Step 3:** implement presentational band (design per §8; match workspace tokens). → [ ] **Step 4: PASS.** → [ ] **Step 5: Commit** — `feat(operations): Run summary band`

---

## Task 12: `RunBoard` (relative court lanes)

**Files:**
- Create: `products/scheduler/frontend/src/products/operations/run/RunBoard.tsx`
- Test: `__tests__/runSurface.test.tsx` (board assertions)

**Interfaces:** Consumes `CourtLane[]`, `selectedKey`, `onSelect(key)`, `onAssignNext(court)`. One row per court: `Court | Now | Next | Later`. Empty lane → a free-court cell with an **Assign next** affordance (calls `onAssignNext`) when the queue is non-empty. Each card shows code (`label`), `sideA v sideB`, a source dot (meet/bracket), and a late flag when `match.late`. Cards are selectable. No clock columns.

- [ ] **Step 1: Failing test** — given a lane with `now/next/later`, renders three cards in order with source dots; an empty lane renders an Assign-next button that fires `onAssignNext(court)`; a late match shows the late marker; clicking a card fires `onSelect(key)`.
- [ ] **Step 2: FAIL.** → [ ] **Step 3:** implement (design yours; use `data-testid="run-court-{n}"`, `run-card-{key}`, `run-assign-next-{n}` for tests). → [ ] **Step 4: PASS.** → [ ] **Step 5: Commit** — `feat(operations): Run court board with relative lanes`

---

## Task 13: `RunQueue` (global ordered queue)

**Files:**
- Create: `products/scheduler/frontend/src/products/operations/run/RunQueue.tsx`
- Test: `__tests__/runSurface.test.tsx` (queue assertions)

**Interfaces:** Consumes `RunMatch[]` (queue), `selectedKey`, `onSelect(key)`. Each row: position `#{i+1}`, source, code, `A v B`, late marker. Empty → "Queue empty — every match is on a court." Selecting fires `onSelect`. No source chip beyond the small dot/word per existing Operations convention.

- [ ] **Step 1: Failing test** — renders positions `#1..#n` in order; empty-state copy; select fires.
- [ ] **Step 2: FAIL.** → [ ] **Step 3:** implement. → [ ] **Step 4: PASS.** → [ ] **Step 5: Commit** — `feat(operations): Run global queue`

---

## Task 14: `RunInspector` (context-dependent)

**Files:**
- Create: `products/scheduler/frontend/src/products/operations/run/RunInspector.tsx`
- Test: `__tests__/runSurface.test.tsx` (inspector assertions)

**Interfaces:** Consumes the selected `RunMatch` + its lane role (`'now'|'next-later'|'queued'|null`), a `freeCourt?: number`, and `onAction(kind, target?)`. Behaviour (drive buttons from `can()`):
- Now match: `scheduled`→**Call**; `called`→**Start** + **Postpone**; `playing`→**Record result** + **Postpone**. Show code, discipline, source, court, planned start, drift (when playing), status pill, per-side players.
- Next/Later: identity + "Queued behind {Now code} on C{court}; advances when the court clears." No call/start.
- Queued: identity + **Send to C{freeCourt}** when one is free, else "No court is free — waits for one to clear."
- Nothing selected: an invitation ("Select a match to call it to a court, start play, or record the result.").

- [ ] **Step 1: Failing test** — for each selection role, asserts the correct action buttons appear/don't, action fires `onAction` with the right kind, and the empty state renders the invitation. Use the exact action labels (Call/Start/Record result/Postpone/Send to C…).
- [ ] **Step 2: FAIL.** → [ ] **Step 3:** implement. → [ ] **Step 4: PASS.** → [ ] **Step 5: Commit** — `feat(operations): Run match inspector`

---

## Task 15: `RunSurface` — compose + own state + auto-pull

**Files:**
- Create: `products/scheduler/frontend/src/products/operations/run/RunSurface.tsx`
- Test: `__tests__/runSurface.test.tsx` (integration)

**Interfaces:**
- Consumes: `OpsBlock[]` (from the parent's existing meet+bracket derivation), the bracket `data` snapshot (to compute `eligibleBracketIds` — reuse `OperationsProduct`'s `schedulableCount` predicate), `courtCount`, `currentSlot`, `planFinalized`, and the seam hooks (`useCommandQueue`, `useBracketApi`, bracket result submit).
- Owns: `selectedKey`, a transient `calledBracketIds: Set<string>`.
- **Auto-pull is action-triggered, NOT a reactive effect** (avoids the lag/effect-storm of reading derived state that trails the optimistic write and recomputes on every bracket poll): the `record` handler, after issuing the result, computes — from the *current* model — the just-finished match's court, and if that record empties the court's lane (`depth` would drop to 0) and `nextEligible(queue)` exists, issues exactly **one** `runAction(head, 'assign', { court, slot: slotForAssign(court, matches, currentSlot) })`. Deterministic, fires once, no dependence on re-derivation timing. (The same `slotForAssign` powers the free-court "Assign next" and inspector "Send to court".)
- Renders: `RunSummaryBand` + `RunBoard` + `RunQueue` + `RunInspector` (overlay rail, matching the existing Operations overlay pattern so width isn't stolen). Actions-bar title "Run", subtitle "Call matches, track courts, clear the queue." A "Plan finalized · ready to run" pill when `planFinalized`; a legible "Plan not finalized" note otherwise.

- [ ] **Step 1: Failing integration test** — render with a fixture of mixed meet/bracket OpsBlocks:
  - the band shows correct derived counts;
  - selecting a Now `playing` match and clicking **Record result** calls the meet finish (mock the seam) and the match leaves the lane;
  - that same record, on a court whose lane is now empty with an eligible queue match waiting, fires **exactly one** `assign_court` for `nextEligible` (auto-pull) — and a second poll/re-render does NOT fire a duplicate assign;
  - an **ineligible** (TBD) queue head is skipped by auto-pull;
  - selecting a queued match shows **Send to C{free}** and it fires `assign` with a concrete slot.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — wire `toRunMatches`/`deriveCourtLanes`/`deriveQueue`/`nextEligible`/`deriveSummary`, compute `eligibleBracketIds`, build the seams object, and put auto-pull **inside the `record` handler** (per the Owns note) — not in a `useEffect`. Bracket Call toggles `calledBracketIds`; Start clears it.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(operations): Run surface — board + queue + inspector + auto-pull`

---

## Task 16: Mount Run in Operations; retire the old Live branch

**Files:**
- Modify: `products/scheduler/frontend/src/products/operations/OperationsProduct.tsx` (the `isLive` branch → `<RunSurface/>`; title/subtitle)
- Modify: `products/scheduler/frontend/src/products/operations/__tests__/` (update/replace `courtStatus.test.tsx` Live expectations)

- [ ] **Step 1:** Update the failing Live test to assert `data-testid="run-surface"` renders for a live segment with both engines, and the Plan (Courts) branch is unchanged.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3:** Replace the `isLive ? (LiveStatusBar + read-only board + queue)` block with `<RunSurface blocks={blocks} courtCount={courtCount} currentSlot={currentSlot} planFinalized={planFinalized} />`. Keep `BracketApiProvider`, selection plumbing the surface needs, and the Courts branch intact. Remove now-dead Live-only wiring (old `LiveStatusBar` usage if fully superseded — keep the file only if still referenced).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(operations): Live segment now renders the Run surface`

---

## Task 17: Nav rename + Plan→Run readiness control

**Files:**
- Modify: `products/scheduler/frontend/src/app/workspace/workspaceNav.ts:108-113` (`Courts`→`Plan`, `Live`→`Run`, both arms)
- Modify: the Plan (Courts) header in `OperationsProduct.tsx` — add a minimal **"Mark plan ready to run"** toggle calling `apiClient.setPlanFinalized` (only on the Plan surface).
- Modify: any nav test asserting the old labels.

- [ ] **Step 1:** Update the nav test to expect `Plan`/`Run` labels for both single-engine arms (and confirm the both-engines arm if it has its own labels).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3:** Rename labels. Add the finalize toggle to the Plan header (reads `planFinalized` from state, writes via the client, optimistic). Run reads the same flag for its pill (already wired in Task 15).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(operations): rename Courts→Plan, Live→Run; add ready-to-run toggle`

---

## Task 18: Vocabulary sweep + dead-code cleanup

**Files:**
- Modify: any Run-surface legend/labels still saying `Started`/`Finished` → `Playing`/`Done` (the new components should already be correct; this catches the board legend + any reused bits).
- Remove: Live-only components fully superseded by Run (e.g. `LiveStatusBar`, the read-only Live board path) **only if** they have no remaining importers (grep first); delete their orphaned tests.

- [ ] **Step 1:** `grep -rn "Started\|Finished\|Live\b" products/scheduler/frontend/src/products/operations` and the workspace nav; list what must change.
- [ ] **Step 2:** Apply the renames; remove dead files with zero importers.
- [ ] **Step 3:** Run `npx tsc -b` (catches dangling imports) + `npx vitest run`.
- [ ] **Step 4: Commit** — `chore(operations): unify Run vocabulary; drop superseded Live code`

---

## Task 19: Full verification + manual

- [ ] **Step 1:** Frontend gate from `products/scheduler/frontend`: `npx tsc -b` (clean), `npx vitest run` (≥409 + new tests, all green), `npm run build` (clean).
- [ ] **Step 2:** Backend gate from repo root: `.venv/Scripts/python.exe -m pytest products/scheduler/backend -q` (only the known pre-existing fails remain).
- [ ] **Step 3:** Manual (Docker rebuild + Playwright per the project run recipe): on a both-engines workspace — finalize the Plan, switch to Run, confirm: Call→Start→Record advances a court and auto-pulls the queue head; Postpone returns a playing match to the queue; a free court offers Assign next; a bracket Record result advances the bracket (Seam C) and the winner appears downstream; the band counts track; a mid-event refresh preserves the floor (lanes/queue derived from persisted court+slot+status).
- [ ] **Step 4:** Report results with command output (per verification-before-completion). Do not claim done without green gates.

---

## Self-Review (completed against the spec)

- **§4 contract** → Tasks 1–2 (machine + late/drift), enforced everywhere via `can()` (Tasks 9, 14).
- **§5.1 board / relative lanes / free-court assign / auto-pull** → Tasks 3, 12, 15 (+ §9 auto-pull in 9/15).
- **§5.2 queue** → Tasks 3, 13. **§5.3 inspector** → Task 14. **§5.4 band** → Tasks 3, 11.
- **§5.5 Plan→Run readiness** → Tasks 7, 17 (flag + minimal finalize control + pill).
- **§5.6 hybrid + result routing** → Tasks 6, 9, 10 (Seam C for bracket; meet via command queue).
- **§6 ownership** → state machine + model owned in `operations/runtime/`; reads existing stores at the seam; no `matchStateStore` migration (confirmed scope). Bracket non-result actions via typed `bracketApi` ("encapsulate later").
- **§7 vocabulary + nav rename** → Tasks 14/18 (words) + 17 (Plan/Run).
- **§9 settled** → auto-pull ON (9/15); postpone→queue (1, 5, 9); park deferred (note the seam in `runActions` comments).
- **§10 tests** → every logic task is TDD; pure machine/model/router unit-tested independent of render; Task 19 gates.
- **§11 DoD / guardrail** → `.tsx` under `operations/` change in Tasks 11–17.

**Open verification items flagged for the implementer (do not assume — verify in Task 9 before coding the bracket seams):**
1. Bracket **assign** — confirm `pinMatch` does **not** trigger a bracket re-solve (symmetric to the meet `pinAndResolve` check); if it does, use/add a non-solver single placement.
2. Bracket **postpone/unassign** — confirm `matchAction('reset')` clears the court assignment; if not, add a minimal bracket unassign.
3. Bracket **`called`** is Operations-local (not persisted) — a refresh reverts a called bracket match to scheduled. Acceptable per scope; documented in `runModel`.
4. The meet **live slot** (`time_slot`/`actualSlotId`) must be serialized on the match-state DTO for Run ordering (Task 5/8) — verify the serialization site.
5. **Queue order is derived** (`plannedSlot` then `key`), so postpone re-enters by key, not at the tail (documented deviation from the mockup's in-memory demo) — intended trade for refresh-durability.
