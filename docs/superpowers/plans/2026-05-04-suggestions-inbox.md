# Suggestions Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the click-to-solve UX with a passive **Suggestions Inbox**: a background worker pre-computes re-optimization proposals as the tournament progresses; a slim rail under the existing `AdvisoryBanner` lets the operator apply them in one click. Mutations (Undo, Call, Start, Score-edit) keep their direct path and never wait on the solver.

**Architecture:**
- **Backend:** new `SuggestionsWorker` asyncio task spawned in the FastAPI `lifespan`. It listens on an `asyncio.Queue` of trigger events (proposal commits, periodic ticks). For each trigger it runs a *cancellable* warm-restart against the persisted state with a 5–8s budget; if the result improves on the live schedule, it stores a `Suggestion` (proposal-id + display copy + dedup fingerprint). New endpoints `GET /schedule/suggestions`, `POST .../apply`, `POST .../dismiss`. Existing repair/disruption flow stays as the manual fallback.
- **Frontend:** `useSuggestions()` hook polls every 8s; `<SuggestionsRail />` mounted under `<AdvisoryBanner />` in `AppShell.tsx`; visible only when populated. Per-row Apply commits the pre-baked proposal in 0s of solver time. Visual design specified verbatim in **Appendix A** (impeccable brief).
- **Phase 0 ships first** — a small visibility fix for the existing court-reopen action. Independent of the worker; addresses the user's original complaint without blocking on the larger architecture.

**Tech Stack:** FastAPI + asyncio + OR-Tools CP-SAT (Python 3.11), React 18 + Zustand + Tailwind (TypeScript), Phosphor icons, Playwright for E2E.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `backend/services/suggestions_worker.py` | Worker class: queue, debounce, cooldown, dedup, solve dispatch, suggestion store mutations |
| `backend/api/schedule_suggestions.py` | FastAPI router: list / apply / dismiss endpoints |
| `backend/app/schemas.py` *(modified)* | `Suggestion` pydantic model (added) |
| `src/scheduler_core/engine/cancel_token.py` | Lightweight cancellation token threaded into `solve_warm_start` |
| `src/tests/test_suggestions_worker.py` | Worker unit + integration tests |
| `src/tests/test_schedule_suggestions.py` | API endpoint tests |
| `src/tests/test_solver_cancellation.py` | Cancellation token plumbing tests |
| `frontend/src/features/suggestions/SuggestionRow.tsx` | One row, dumb (props in, callbacks out) |
| `frontend/src/features/suggestions/SuggestionPreview.tsx` | Inline diff expansion |
| `frontend/src/features/suggestions/SuggestionsRail.tsx` | List, sort, empty-collapse, lifecycle |
| `frontend/src/hooks/useSuggestions.ts` | 8s polling + store sync |
| `e2e/tests/08-suggestions-inbox.spec.ts` | Playwright smoke: optimize suggestion appears, applies cleanly |

### Modified files

| Path | Change |
|---|---|
| `backend/app/main.py` | Spawn worker in `lifespan`; register suggestions router |
| `backend/api/schedule_proposals.py` | After successful commit, post `commit_completed` event to worker queue |
| `backend/api/schedule_advisories.py` | When generating an advisory whose `suggestedAction.kind` is solver-bound, post a `repair_speculate` event; attach resulting `suggestionId` to the advisory |
| `src/scheduler_core/engine/warm_start.py` | Accept optional `cancel_token` arg; thread to `CpSolver.parameters` and `solver.StopSearch()` |
| `src/scheduler_core/engine/cpsat_backend.py` | Same plumbing for full-solve callers |
| `frontend/src/api/client.ts` | Add `Suggestion` type + 3 endpoint methods |
| `frontend/src/api/dto.ts` | Add `Suggestion` interface re-exported alongside `Advisory` |
| `frontend/src/store/appStore.ts` | Add `suggestions: Suggestion[]`, `setSuggestions` |
| `frontend/src/app/AppShell.tsx` | Mount `<SuggestionsRail />` under `<AdvisoryBanner />`; call `useSuggestions()` |
| `frontend/src/features/director/DirectorToolsPanel.tsx` | **Phase 0** — sticky "Closed courts" header strip, always rendered when closures exist |
| `frontend/src/features/control-center/GanttChart.tsx` | **Phase 0** — clickable label on greyed court rows opens DirectorToolsPanel scrolled to Closed-Courts section |
| `frontend/src/pages/MatchControlCenterPage.tsx` | **Phase 0** — accept `?director=closed-courts` deeplink |

### Untouched (intentional)

- All mutation paths: `match_state.py`, `useLiveTracking.ts`, score editor, undo handlers. The architecture's main promise — mutations never wait on solver — is preserved by **adding** the worker, not modifying existing flows.

---

# Phase 0 — Reopen Visibility Fix (ships first, ~30 min)

Addresses the user's original complaint independently. Does not depend on any worker code.

## Task 0.1: Make the "Closed courts" section discoverable on Live page

**Files:**
- Modify: `frontend/src/features/director/DirectorToolsPanel.tsx:215-276`
- Modify: `frontend/src/pages/MatchControlCenterPage.tsx` (add deeplink handler)

**Context:** The DirectorToolsPanel already has a working Closed-Courts list with Reopen buttons (`DirectorToolsPanel.tsx:219-275`). Backend `_apply_reopen_court` is wired correctly (`schedule_director.py:154-186`) — round trip verified end-to-end. The fix is **discoverability only**: bring the section to the top of the panel, give it a chip-style anchor, and let other components deeplink to it.

- [ ] **Step 1: Move "Closed courts" section to the top of `DirectorToolsPanel`**

Move the JSX block at `DirectorToolsPanel.tsx:219-276` to immediately follow the `<div className="space-y-4 p-3">` opener, placing it BEFORE the "Delay start" section. Closed courts are higher-priority than delay/break in live ops.

- [ ] **Step 2: Promote the eyebrow to a sticky header with count**

Replace the existing `<h3 className="text-sm font-semibold">Closed courts</h3>` with:

```tsx
<div className="sticky top-0 z-10 -mx-3 -mt-3 mb-2 flex items-center justify-between border-b border-border bg-card/95 px-3 py-2 backdrop-blur-sm">
  <div className="flex items-center gap-2">
    <DoorOpen className="h-4 w-4 text-status-warning" aria-hidden="true" />
    <h3 className="text-sm font-semibold text-fg">
      Closed courts
    </h3>
    <span className="rounded bg-status-warning-bg px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-status-warning">
      {(config.closedCourts ?? []).length + (config.courtClosures ?? []).length}
    </span>
  </div>
</div>
```

- [ ] **Step 3: Accept a `?director=closed-courts` URL param to auto-scroll**

In `MatchControlCenterPage.tsx`, find the existing `directorOpen` `useState` (line 58) and add a `useEffect`:

```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('director') === 'closed-courts') {
    setDirectorOpen(true);
  }
}, []);
```

- [ ] **Step 4: Verify in dev**

Run `npm run dev` from `frontend/`. Close a court via Disruption → Court closed → indefinite. Commit. Confirm the Director button shows the closed court at the very top of the modal with a count chip.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/director/DirectorToolsPanel.tsx frontend/src/pages/MatchControlCenterPage.tsx
git commit -m "feat(director): elevate closed-courts to sticky panel header

Reopen-court action exists end-to-end but was buried behind two
sections of the Director modal. Pin Closed Courts at the top with
a count chip so operators find the path back without searching."
```

## Task 0.2: Make greyed court rows in the Gantt clickable to reopen

**Files:**
- Modify: `frontend/src/features/control-center/GanttChart.tsx:296-313`

- [ ] **Step 1: Add navigation prop**

In `GanttChartProps` (line 23), add:

```ts
onRequestReopenCourt?: (courtId: number) => void;
```

In `MatchControlCenterPage.tsx` where `<GanttChart>` is rendered (around line 489), pass:

```tsx
onRequestReopenCourt={() => setDirectorOpen(true)}
```

- [ ] **Step 2: Make the court label clickable when `fullyClosed`**

Replace the `<div>` block at `GanttChart.tsx:304-313` with:

```tsx
{fullyClosed && onRequestReopenCourt ? (
  <button
    type="button"
    onClick={() => onRequestReopenCourt(courtId)}
    title={`Court ${courtId} closed — click to reopen`}
    className="flex-shrink-0 flex items-center gap-1 px-2 text-xs font-semibold tabular-nums bg-muted/60 text-muted-foreground hover:bg-status-warning-bg hover:text-status-warning transition-colors"
    style={{ width: COURT_LABEL_WIDTH, height: ROW_HEIGHT }}
  >
    <span className="line-through">C{courtId}</span>
    <DoorOpen className="h-3 w-3" aria-hidden="true" />
  </button>
) : (
  <div
    className={`flex-shrink-0 flex items-center px-2 text-xs font-semibold tabular-nums ${
      fullyClosed
        ? 'bg-muted/60 text-muted-foreground line-through'
        : 'bg-muted/30 text-foreground'
    }`}
    style={{ width: COURT_LABEL_WIDTH, height: ROW_HEIGHT }}
  >
    C{courtId}
  </div>
)}
```

Add the import: `import { DoorOpen } from '@phosphor-icons/react';`

- [ ] **Step 3: Verify in dev**

Close court 3. Confirm the C3 label in the Gantt is now a button with a door icon; clicking it opens the Director modal.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/control-center/GanttChart.tsx frontend/src/pages/MatchControlCenterPage.tsx
git commit -m "feat(gantt): clickable closed-court labels deeplink to reopen panel"
```

---

# Phase 1 — Backend Foundations

## Task 1.1: Cancellation token

**Files:**
- Create: `src/scheduler_core/engine/cancel_token.py`
- Test: `src/tests/test_solver_cancellation.py`
- Modify: `src/scheduler_core/engine/warm_start.py`
- Modify: `src/scheduler_core/engine/cpsat_backend.py`

**Context:** Today every solve runs to its full `time_limit_seconds` budget. The worker needs to **abort an in-flight speculative solve** when newer state arrives, so it doesn't waste CPU on stale work. OR-Tools CP-SAT supports `solver.StopSearch()` which the docs confirm produces the best solution found so far (or `INFEASIBLE`/`UNKNOWN`). We need a tiny holder that's safe to set from another asyncio task.

- [ ] **Step 1: Write the failing test for token semantics**

```python
# src/tests/test_solver_cancellation.py
"""Cancellation token: thin holder threaded into solver callbacks.

The worker calls cancel() from one task; the solve loop polls
the token from another. asyncio.Event would be heavier (and
require an event loop reachable from the OR-Tools callback,
which is C++); a threading.Event works because OR-Tools' callback
runs on a worker thread when num_workers > 1.
"""
import threading

from scheduler_core.engine.cancel_token import CancelToken


def test_token_starts_uncancelled():
    t = CancelToken()
    assert not t.is_cancelled()


def test_cancel_flips_to_cancelled():
    t = CancelToken()
    t.cancel()
    assert t.is_cancelled()


def test_cancel_is_idempotent():
    t = CancelToken()
    t.cancel()
    t.cancel()
    assert t.is_cancelled()


def test_cancel_is_thread_safe():
    """Concurrent cancel() from many threads must never raise."""
    t = CancelToken()

    def runner():
        for _ in range(1000):
            t.cancel()

    threads = [threading.Thread(target=runner) for _ in range(8)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert t.is_cancelled()
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pytest src/tests/test_solver_cancellation.py -v
```

Expected: `ImportError: No module named cancel_token`

- [ ] **Step 3: Write the minimal implementation**

```python
# src/scheduler_core/engine/cancel_token.py
"""Lightweight cancellation token.

Cooperative — solver code must poll. Backed by `threading.Event`
because OR-Tools solver callbacks run on its own C++ worker
threads (when ``num_workers > 1``), which can't reach the
asyncio event loop the calling coroutine lives in.
"""
import threading


class CancelToken:
    """A flip-once flag. ``cancel()`` is idempotent and thread-safe."""

    __slots__ = ("_event",)

    def __init__(self) -> None:
        self._event = threading.Event()

    def cancel(self) -> None:
        self._event.set()

    def is_cancelled(self) -> bool:
        return self._event.is_set()
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pytest src/tests/test_solver_cancellation.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Thread token into `solve_warm_start`**

Open `src/scheduler_core/engine/warm_start.py`. Find the `solve_warm_start` function signature. Add `cancel_token: CancelToken | None = None` as the last keyword argument. Inside the body, locate the line that creates the OR-Tools callback (it should be a `cp_model.CpSolverSolutionCallback` subclass instance). After `solver = cp_model.CpSolver()`, insert:

```python
if cancel_token is not None:
    # OR-Tools polls this every "search progress" tick; the
    # solver thread reads it concurrently with our cancel()
    # call from the worker task.
    class _StopOnCancel(cp_model.CpSolverSolutionCallback):
        def __init__(self) -> None:
            super().__init__()

        def on_solution_callback(self) -> None:
            if cancel_token.is_cancelled():
                self.StopSearch()

    # If a solution callback already exists, wrap it.
    existing_callback = solution_callback
    class _Composed(cp_model.CpSolverSolutionCallback):
        def __init__(self) -> None:
            super().__init__()
        def on_solution_callback(self) -> None:
            if existing_callback is not None:
                existing_callback.on_solution_callback()
            if cancel_token.is_cancelled():
                self.StopSearch()
    solution_callback = _Composed()
```

(Adjust `existing_callback` lookup to the actual variable name in the file. The pattern is: compose with whatever solution callback was already wired.)

- [ ] **Step 6: Add an integration test for early cancellation**

Append to `src/tests/test_solver_cancellation.py`:

```python
import time
from scheduler_core.engine.cancel_token import CancelToken
from scheduler_core.engine.warm_start import solve_warm_start
from tests.helpers.solver_fixtures import (
    make_minimal_warm_start_inputs,
)  # follows existing fixture pattern in test_warm_start.py


def test_cancel_aborts_running_solve():
    """A cancel issued shortly after solve start must return
    quickly with whatever the solver had — never run to the
    full time_limit_seconds."""
    inputs = make_minimal_warm_start_inputs()
    token = CancelToken()

    # Schedule cancellation 200 ms in.
    import threading
    timer = threading.Timer(0.2, token.cancel)
    timer.start()

    start = time.monotonic()
    solve_warm_start(
        inputs.config,
        inputs.players,
        inputs.matches,
        inputs.reference,
        finished_match_ids=set(),
        stay_close_weight=10,
        solver_options=inputs.options_with_long_budget,  # 10 s budget
        cancel_token=token,
    )
    elapsed = time.monotonic() - start
    assert elapsed < 2.0, (
        f"solve_warm_start ignored cancellation; ran {elapsed:.2f}s "
        f"of 10s budget"
    )
```

- [ ] **Step 7: Run + commit**

```bash
pytest src/tests/test_solver_cancellation.py -v
```

If `make_minimal_warm_start_inputs` doesn't already exist, copy a small fixture from `src/tests/test_warm_start.py` and put it in `src/tests/helpers/solver_fixtures.py` (create the helpers package with `__init__.py` if needed).

```bash
git add src/scheduler_core/engine/cancel_token.py src/scheduler_core/engine/warm_start.py src/tests/test_solver_cancellation.py src/tests/helpers/
git commit -m "feat(engine): cooperative cancellation token threaded through solve_warm_start

Required by the upcoming SuggestionsWorker so a stale speculative
solve aborts cleanly when fresher state arrives. Backed by
threading.Event — OR-Tools callbacks run on C++ worker threads
that can't reach the calling coroutine's event loop."
```

---

## Task 1.2: Suggestion data model

**Files:**
- Modify: `backend/app/schemas.py`
- Test: `src/tests/test_schedule_suggestions.py` (new)

- [ ] **Step 1: Add the `Suggestion` model to `backend/app/schemas.py`**

Find the `Proposal` class definition. After it, add:

```python
class Suggestion(BaseModel):
    """A pre-computed re-optimization proposal surfaced in the inbox.

    Wraps a (still-live) ``Proposal`` with display copy and a dedup
    fingerprint. The frontend reads these from
    ``GET /schedule/suggestions``; ``apply`` commits the underlying
    proposal; ``dismiss`` cancels it.

    ``fingerprint`` is the worker's idempotency key — re-running the
    same trigger against the same state yields the same fingerprint,
    so the worker can skip stamping a duplicate suggestion.
    """
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    kind: Literal["repair", "optimize", "director", "candidate"]
    title: str               # "Court 3 closed, 4 matches move"
    metric: str              # "0 min finish" — pre-formatted, tabular
    proposalId: str          # FK into the proposal store
    fingerprint: str         # dedup key
    fromScheduleVersion: int # for stale detection on apply
    createdAt: str = Field(default_factory=now_iso)
    expiresAt: str           # ISO-8601, set by worker (10 min default)


# Default suggestion TTL. Shorter than proposal TTL (30 min) because
# suggestions go stale faster (state moves under them).
SUGGESTION_TTL_MINUTES = 10
```

Make sure `uuid` and `Literal` are imported at the top of the file (most likely already are; if not, add `import uuid` and `from typing import Literal`).

- [ ] **Step 2: Test the model validates**

```python
# src/tests/test_schedule_suggestions.py
"""Suggestion model + endpoint tests.

The worker's behavior is tested separately in
test_suggestions_worker.py — these tests exercise the persistence
shape and the GET / apply / dismiss endpoints in isolation.
"""
import pytest

from app.schemas import Suggestion


def test_suggestion_round_trips():
    s = Suggestion(
        kind="optimize",
        title="Re-optimize from now",
        metric="-12 min finish, 7 moves",
        proposalId="prop-abc",
        fingerprint="opt:v1:7-moves",
        fromScheduleVersion=4,
        expiresAt="2026-05-04T10:30:00+00:00",
    )
    data = s.model_dump()
    rebuilt = Suggestion(**data)
    assert rebuilt.id == s.id
    assert rebuilt.kind == "optimize"
    assert rebuilt.fromScheduleVersion == 4


def test_suggestion_rejects_unknown_kind():
    with pytest.raises(Exception):
        Suggestion(
            kind="xyz",  # not in the Literal
            title="x",
            metric="x",
            proposalId="x",
            fingerprint="x",
            fromScheduleVersion=0,
            expiresAt="2026-05-04T10:30:00+00:00",
        )
```

- [ ] **Step 3: Run + commit**

```bash
pytest src/tests/test_schedule_suggestions.py -v
```

Expected: 2 passed.

```bash
git add backend/app/schemas.py src/tests/test_schedule_suggestions.py
git commit -m "feat(schemas): add Suggestion model for the inbox pipeline"
```

---

## Task 1.3: Suggestion store helpers

**Files:**
- Modify: `backend/api/schedule_proposals.py` (add a sibling store dict)

**Context:** Suggestions live in `app.state.suggestions` parallel to `app.state.proposals`. Same lock pattern. We extend `schedule_proposals.py` rather than fork because the suggestion store is logically a dependent extension of the proposal store (every suggestion references a proposal).

- [ ] **Step 1: Write failing tests for the new helpers**

Append to `src/tests/test_schedule_suggestions.py`:

```python
from fastapi import FastAPI
from app.schemas import Suggestion
from api.schedule_proposals import (
    _get_suggestion_store,
    _evict_expired_suggestions,
)


def _make_app():
    return FastAPI()


def test_suggestion_store_is_per_app():
    app1, app2 = _make_app(), _make_app()
    s1 = _get_suggestion_store(app1)
    s2 = _get_suggestion_store(app2)
    assert s1 is not s2


def test_evict_expired_suggestions_drops_past_ttl():
    app = _make_app()
    store = _get_suggestion_store(app)
    sug = Suggestion(
        kind="optimize", title="t", metric="m",
        proposalId="p", fingerprint="f",
        fromScheduleVersion=0,
        expiresAt="2000-01-01T00:00:00+00:00",  # long expired
    )
    store[sug.id] = sug
    _evict_expired_suggestions(store)
    assert sug.id not in store


def test_evict_expired_suggestions_keeps_fresh():
    app = _make_app()
    store = _get_suggestion_store(app)
    sug = Suggestion(
        kind="optimize", title="t", metric="m",
        proposalId="p", fingerprint="f",
        fromScheduleVersion=0,
        expiresAt="2099-01-01T00:00:00+00:00",
    )
    store[sug.id] = sug
    _evict_expired_suggestions(store)
    assert sug.id in store
```

- [ ] **Step 2: Verify failure**

```bash
pytest src/tests/test_schedule_suggestions.py -v
```

Expected: ImportError on `_get_suggestion_store`.

- [ ] **Step 3: Add helpers to `schedule_proposals.py`**

Below the existing `_get_lock` function (around `schedule_proposals.py:104`), insert:

```python
_SUGGESTION_STATE_KEY = "suggestions"


def _get_suggestion_store(app: FastAPI) -> Dict[str, "Suggestion"]:
    """Per-app suggestion dict, mirrors the proposal store layout.

    Suggestions reference proposals by id; the suggestion's TTL is
    typically shorter than its proposal's so an unapplied suggestion
    can fall off the inbox while the underlying proposal stays live
    in case the operator opens a Disruption dialog the same kind.
    """
    store = getattr(app.state, _SUGGESTION_STATE_KEY, None)
    if store is None:
        store = {}
        setattr(app.state, _SUGGESTION_STATE_KEY, store)
    return store


def _evict_expired_suggestions(
    store: Dict[str, "Suggestion"],
    now: Optional[datetime] = None,
) -> None:
    """Drop suggestions whose ``expiresAt`` is in the past."""
    cutoff = (now or datetime.now(timezone.utc))
    for sid, sug in list(store.items()):
        try:
            expires = datetime.fromisoformat(
                sug.expiresAt.replace("Z", "+00:00")
            )
        except ValueError:
            del store[sid]
            continue
        if expires <= cutoff:
            del store[sid]
```

Make sure `Suggestion` is imported at the top of the file from `app.schemas`.

- [ ] **Step 4: Run + commit**

```bash
pytest src/tests/test_schedule_suggestions.py -v
```

Expected: 5 passed.

```bash
git add backend/api/schedule_proposals.py src/tests/test_schedule_suggestions.py
git commit -m "feat(proposals): add per-app suggestion store + TTL eviction"
```

---

# Phase 2 — Worker

## Task 2.1: Worker core — queue + cooldown + dedup

**Files:**
- Create: `backend/services/suggestions_worker.py`
- Test: `src/tests/test_suggestions_worker.py`

- [ ] **Step 1: Write failing tests for queue + cooldown**

```python
# src/tests/test_suggestions_worker.py
"""SuggestionsWorker tests.

The worker is an asyncio Task that consumes a queue of trigger
events. We test:
  - queue acceptance + dedup by fingerprint
  - cooldown enforcement (no duplicate solves for the same
    fingerprint within COOLDOWN_SECONDS)
  - cancel-on-newer-event semantics
  - clean shutdown on stop()

These are pure-Python tests with the solver mocked. The
end-to-end "real solve produces a real suggestion" test lives in
test_proposal_pipeline_integration.py.
"""
import asyncio
import pytest
from unittest.mock import AsyncMock

from services.suggestions_worker import (
    SuggestionsWorker,
    TriggerEvent,
    TriggerKind,
)


@pytest.mark.asyncio
async def test_worker_processes_a_single_trigger():
    handler = AsyncMock()
    w = SuggestionsWorker(handler=handler, cooldown_seconds=0)
    await w.start()
    await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
    await asyncio.sleep(0.05)
    handler.assert_awaited_once()
    await w.stop()


@pytest.mark.asyncio
async def test_worker_dedups_within_cooldown():
    handler = AsyncMock()
    w = SuggestionsWorker(handler=handler, cooldown_seconds=10)
    await w.start()
    for _ in range(5):
        await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
    await asyncio.sleep(0.1)
    assert handler.await_count == 1
    await w.stop()


@pytest.mark.asyncio
async def test_worker_runs_after_cooldown():
    handler = AsyncMock()
    w = SuggestionsWorker(handler=handler, cooldown_seconds=0.1)
    await w.start()
    await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
    await asyncio.sleep(0.05)
    await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
    await asyncio.sleep(0.05)
    assert handler.await_count == 1  # second was inside cooldown
    await asyncio.sleep(0.15)
    await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
    await asyncio.sleep(0.05)
    assert handler.await_count == 2
    await w.stop()


@pytest.mark.asyncio
async def test_worker_stop_drains_cleanly():
    handler = AsyncMock()
    w = SuggestionsWorker(handler=handler, cooldown_seconds=0)
    await w.start()
    await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
    await w.stop()  # must return even with pending triggers
    # No assertion on handler count — stop() may or may not have
    # run the trigger; it MUST NOT hang.


@pytest.mark.asyncio
async def test_worker_cancels_in_flight_when_newer_event_arrives():
    """Posting a NEW event with the SAME fingerprint while one is
    in flight should cancel the in-flight solve and start a fresh
    one. Different fingerprints don't cancel each other.
    """
    cancellations: list[str] = []

    async def slow_handler(event: TriggerEvent, cancel_token):
        try:
            await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            cancellations.append(event.fingerprint)
            raise

    w = SuggestionsWorker(handler=slow_handler, cooldown_seconds=0)
    await w.start()
    await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
    await asyncio.sleep(0.05)  # let it start
    await w.post(TriggerEvent(kind=TriggerKind.OPTIMIZE, fingerprint="opt:v1"))
    await asyncio.sleep(0.6)
    assert cancellations == ["opt:v1"]
    await w.stop()
```

- [ ] **Step 2: Verify failure**

```bash
pytest src/tests/test_suggestions_worker.py -v
```

Expected: ModuleNotFoundError on `services.suggestions_worker`.

- [ ] **Step 3: Implement worker core**

```python
# backend/services/suggestions_worker.py
"""Background re-optimization worker.

Owns one asyncio.Task that consumes a queue of TriggerEvents and
fires speculative solves. Mutates ``app.state.suggestions`` and
``app.state.proposals``. Mutations to live tournament state
(schedule, match states, config) happen elsewhere — when an
operator clicks Apply, NOT here.

Cooldown prevents thrashing when many triggers post the same
fingerprint in quick succession. In-flight cancellation lets a
newer event supersede a stale solve so the operator never sees a
suggestion that's already wrong.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Awaitable, Callable, Dict, Optional

import app.scheduler_core_path  # noqa: F401
from scheduler_core.engine.cancel_token import CancelToken

log = logging.getLogger("scheduler.suggestions")


class TriggerKind(str, Enum):
    OPTIMIZE = "optimize"
    REPAIR = "repair"
    PERIODIC = "periodic"


@dataclass(frozen=True)
class TriggerEvent:
    kind: TriggerKind
    fingerprint: str
    payload: Dict[str, object] = field(default_factory=dict)


HandlerFn = Callable[[TriggerEvent, CancelToken], Awaitable[None]]


class SuggestionsWorker:
    """One asyncio Task per app. Consumes a queue, runs handlers."""

    def __init__(
        self,
        handler: HandlerFn,
        cooldown_seconds: float = 30.0,
        queue_max: int = 64,
    ) -> None:
        self._handler = handler
        self._cooldown = cooldown_seconds
        self._queue: asyncio.Queue[TriggerEvent] = asyncio.Queue(maxsize=queue_max)
        self._last_run: Dict[str, float] = {}
        self._inflight: Dict[str, tuple[asyncio.Task, CancelToken]] = {}
        self._task: Optional[asyncio.Task] = None
        self._stopping = asyncio.Event()

    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run(), name="suggestions-worker")

    async def stop(self) -> None:
        self._stopping.set()
        for fp, (task, token) in list(self._inflight.items()):
            token.cancel()
            task.cancel()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self._inflight.clear()

    async def post(self, event: TriggerEvent) -> None:
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            log.warning("suggestions queue full; dropping %s", event.fingerprint)

    async def _run(self) -> None:
        while not self._stopping.is_set():
            try:
                event = await asyncio.wait_for(self._queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue

            now = time.monotonic()
            last = self._last_run.get(event.fingerprint, 0.0)
            if now - last < self._cooldown:
                log.debug("suggestion cooldown skip %s", event.fingerprint)
                continue

            # Cancel any in-flight task for this fingerprint.
            if event.fingerprint in self._inflight:
                prev_task, prev_token = self._inflight.pop(event.fingerprint)
                prev_token.cancel()
                prev_task.cancel()

            token = CancelToken()
            task = asyncio.create_task(
                self._dispatch(event, token),
                name=f"suggestion-{event.fingerprint}",
            )
            self._inflight[event.fingerprint] = (task, token)
            self._last_run[event.fingerprint] = now

    async def _dispatch(self, event: TriggerEvent, token: CancelToken) -> None:
        try:
            await self._handler(event, token)
        except asyncio.CancelledError:
            log.info("suggestion cancelled mid-flight: %s", event.fingerprint)
            raise
        except Exception:
            log.exception("suggestion handler failed for %s", event.fingerprint)
        finally:
            self._inflight.pop(event.fingerprint, None)
```

- [ ] **Step 4: Run + commit**

```bash
pytest src/tests/test_suggestions_worker.py -v
```

Expected: 5 passed.

```bash
git add backend/services/suggestions_worker.py src/tests/test_suggestions_worker.py
git commit -m "feat(services): SuggestionsWorker — queue, cooldown, dedup, cancel-in-flight"
```

---

## Task 2.2: Worker startup + shutdown wiring

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Wire the worker into the FastAPI lifespan**

Replace the existing `lifespan` function in `backend/app/main.py:25-37` with:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup + graceful shutdown hooks."""
    log.info("app_startup version=2.0.0")

    # SuggestionsWorker spawns one asyncio.Task that consumes a
    # queue of speculative-solve triggers. Handler is wired below
    # in api.schedule_suggestions to keep solver imports out of
    # this top-level module.
    from services.suggestions_worker import SuggestionsWorker
    from api.schedule_suggestions import build_handler

    worker = SuggestionsWorker(
        handler=build_handler(app),
        cooldown_seconds=30.0,
    )
    app.state.suggestions_worker = worker
    await worker.start()
    log.info("suggestions_worker started")

    try:
        yield
    finally:
        await worker.stop()
        log.info("suggestions_worker stopped")
        log.info("app_shutdown")
```

Add the suggestions router (around line 92):

```python
from api import (
    schedule,
    match_state,
    tournament_state,
    schedule_repair,
    schedule_warm_restart,
    schedule_advisories,
    schedule_proposals,
    schedule_director,
    schedule_suggestions,  # <-- added
)
# ...
app.include_router(schedule_suggestions.router)
```

- [ ] **Step 2: Run app, confirm logs**

```bash
cd backend && uvicorn app.main:app --port 8000
```

Expected log lines:
- `app_startup version=2.0.0`
- `suggestions_worker started`

Ctrl-C; expected:
- `suggestions_worker stopped`
- `app_shutdown`

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(app): spawn SuggestionsWorker in lifespan, drain on shutdown"
```

---

## Task 2.3: Build the optimize-handler

**Files:**
- Create: `backend/api/schedule_suggestions.py` (will host both the handler factory and the HTTP routes; this task adds the handler only — routes follow in Task 3.x)
- Test: `src/tests/test_proposal_pipeline_integration.py` (extend)

- [ ] **Step 1: Add handler factory skeleton**

```python
# backend/api/schedule_suggestions.py
"""Suggestions inbox: routes + speculative-solve handler.

The handler is built per-app at startup (`build_handler`). It runs
inside the SuggestionsWorker's task; each invocation reads the
current persisted state, runs a warm-restart at a low time budget
with a cancellation token, and stamps a Suggestion if the result
improves on the live schedule.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from fastapi import APIRouter, FastAPI, HTTPException, Request

import app.scheduler_core_path  # noqa: F401
from app.error_codes import ErrorCode, http_error
from app.schemas import (
    SUGGESTION_TTL_MINUTES,
    Suggestion,
)
from app.time_utils import now_iso
from api.schedule_proposals import (
    _build_proposal,
    _get_lock,
    _get_store,
    _get_suggestion_store,
    _evict_expired,
    _evict_expired_suggestions,
    _read_persisted_state,
)
from api.schedule_warm_restart import WarmRestartRequest, _run_warm_restart
from app.schemas import ProposalKind, TournamentConfig
from scheduler_core.engine.cancel_token import CancelToken
from services.suggestions_worker import (
    HandlerFn,
    TriggerEvent,
    TriggerKind,
)

router = APIRouter(prefix="/schedule/suggestions", tags=["schedule-suggestions"])
log = logging.getLogger("scheduler.suggestions")


def _format_metric(*, finish_delta_min: int, moves: int) -> str:
    """Human copy for the Suggestion.metric field. Tabular-nums-safe.

    Finish delta uses U+2212 (true minus) so right-aligned tabular
    columns line up with positive numbers.
    """
    if finish_delta_min < 0:
        delta = f"−{abs(finish_delta_min)} min finish"
    elif finish_delta_min > 0:
        delta = f"+{finish_delta_min} min finish"
    else:
        delta = "0 min finish"
    return f"{delta}, {moves} moves"


def _expires_at(now: datetime | None = None) -> str:
    n = now or datetime.now(timezone.utc)
    return (n + timedelta(minutes=SUGGESTION_TTL_MINUTES)).isoformat()


async def _handle_optimize(
    app: FastAPI, event: TriggerEvent, token: CancelToken
) -> None:
    """Run a warm-restart speculation against persisted state.

    Stamp a Suggestion if it improves on the current schedule.
    """
    persisted = _read_persisted_state()
    if persisted is None or persisted.schedule is None:
        return  # nothing to optimize against

    wr_req = WarmRestartRequest(
        originalSchedule=persisted.schedule,
        config=persisted.config,
        players=persisted.players,
        matches=persisted.matches,
        matchStates=persisted.matchStates or {},
        stayCloseWeight=5,
        timeBudgetSec=6.0,
    )

    # Run the (CPU-bound) solve in a thread so the event loop
    # stays responsive. Cancellation token threads through.
    loop = asyncio.get_running_loop()

    def _solve_sync():
        from api.schedule_warm_restart import _run_warm_restart_with_cancel
        return _run_warm_restart_with_cancel(wr_req, cancel_token=token)

    try:
        new_schedule, moved = await loop.run_in_executor(None, _solve_sync)
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("optimize speculation failed")
        return

    if not moved:
        return  # solver found no improvement

    # Build the proposal in the same store as everything else so
    # Apply just calls the existing commit endpoint.
    store = _get_store(app)
    suggestion_store = _get_suggestion_store(app)
    lock = _get_lock(app)
    async with lock:
        _evict_expired(store)
        _evict_expired_suggestions(suggestion_store)

        finish_delta = _finish_delta_minutes(persisted.schedule, new_schedule, persisted.config)
        if finish_delta >= 0 and len(moved) >= len(persisted.schedule.assignments):
            return  # not actually better

        proposal = _build_proposal(
            store,
            kind=ProposalKind.WARM_RESTART,
            proposed_schedule=new_schedule,
            committed_schedule=persisted.schedule,
            matches=persisted.matches,
            players=persisted.players,
            groups=list(persisted.groups or []),
            from_version=persisted.scheduleVersion,
            summary="Re-optimize from now",
        )

        sug = Suggestion(
            kind="optimize",
            title="Re-optimize from now",
            metric=_format_metric(finish_delta_min=finish_delta, moves=len(moved)),
            proposalId=proposal.id,
            fingerprint=event.fingerprint,
            fromScheduleVersion=persisted.scheduleVersion,
            expiresAt=_expires_at(),
        )
        suggestion_store[sug.id] = sug
        log.info(
            "stamped suggestion %s kind=%s moves=%d finishΔ=%dmin",
            sug.id, sug.kind, len(moved), finish_delta,
        )


def _finish_delta_minutes(
    old, new, config: TournamentConfig,
) -> int:
    """How many minutes earlier (negative) or later (positive) the
    new schedule's last match finishes vs. the old."""
    def end_slot(s):
        if not s.assignments:
            return 0
        return max(a.slotId + a.durationSlots for a in s.assignments)
    return (end_slot(new) - end_slot(old)) * (config.intervalMinutes or 1)


def build_handler(app: FastAPI) -> HandlerFn:
    """Factory: returns a handler fn closed over `app` for the worker."""
    async def handler(event: TriggerEvent, token: CancelToken) -> None:
        if event.kind in (TriggerKind.OPTIMIZE, TriggerKind.PERIODIC):
            await _handle_optimize(app, event, token)
        elif event.kind == TriggerKind.REPAIR:
            # Phase 3 task — repair speculations come from advisories.
            log.debug("repair handler not yet wired; skipping")
        else:
            log.warning("unknown trigger kind: %s", event.kind)
    return handler
```

- [ ] **Step 2: Add the cancel-aware warm-restart wrapper**

In `backend/api/schedule_warm_restart.py`, add at the bottom:

```python
def _run_warm_restart_with_cancel(
    request: WarmRestartRequest,
    *,
    cancel_token,
) -> tuple[ScheduleDTO, List[str]]:
    """Same as `_run_warm_restart` but threads a CancelToken into
    the solver so a stale speculative solve aborts cleanly."""
    finished: set[str] = set()
    for m_id, state in request.matchStates.items():
        if state.status in ("finished", "started"):
            finished.add(m_id)

    reference: Dict[str, Assignment] = {}
    for a in request.originalSchedule.assignments:
        reference[a.matchId] = Assignment(
            match_id=a.matchId, slot_id=a.slotId,
            court_id=a.courtId, duration_slots=a.durationSlots,
        )

    schedule_config = schedule_config_from_dto(request.config)
    players = players_from_dto(request.players, request.config)
    matches = matches_from_dto(request.matches)
    solver_options = solver_options_for(
        request.config, time_limit_override=request.timeBudgetSec,
    )

    result = solve_warm_start(
        schedule_config,
        players,
        matches,
        reference,
        finished_match_ids=finished,
        stay_close_weight=request.stayCloseWeight,
        solver_options=solver_options,
        cancel_token=cancel_token,
    )
    new_schedule = result_to_dto(result)
    moved: List[str] = []
    new_by_match = {a.matchId: a for a in new_schedule.assignments}
    for m_id, ref in reference.items():
        new = new_by_match.get(m_id)
        if new is None:
            continue
        if new.slotId != ref.slot_id or new.courtId != ref.court_id:
            moved.append(m_id)
    return new_schedule, moved
```

- [ ] **Step 3: Integration test — worker stamps a suggestion after a state-change**

Add to `src/tests/test_proposal_pipeline_integration.py`:

```python
@pytest.mark.asyncio
async def test_worker_stamps_optimize_suggestion(app_with_warm_state):
    """Posting an OPTIMIZE trigger against a schedule that has slack
    should produce a Suggestion in the inbox."""
    from services.suggestions_worker import TriggerEvent, TriggerKind

    worker = app_with_warm_state.state.suggestions_worker
    await worker.post(TriggerEvent(
        kind=TriggerKind.OPTIMIZE,
        fingerprint="opt:test:1",
    ))

    # Worker is async + solver is real; allow up to 8 s.
    suggestion_store = app_with_warm_state.state.suggestions
    for _ in range(80):
        if suggestion_store:
            break
        await asyncio.sleep(0.1)
    assert len(suggestion_store) == 1
    sug = next(iter(suggestion_store.values()))
    assert sug.kind == "optimize"
    assert sug.proposalId
```

The fixture `app_with_warm_state` follows the existing pattern in `test_proposal_pipeline_integration.py`; if it doesn't exist, copy the smallest fixture from that file and prefix it with `warm_`.

- [ ] **Step 4: Run + commit**

```bash
pytest src/tests/test_proposal_pipeline_integration.py::test_worker_stamps_optimize_suggestion -v
```

```bash
git add backend/api/schedule_suggestions.py backend/api/schedule_warm_restart.py src/tests/test_proposal_pipeline_integration.py
git commit -m "feat(suggestions): optimize handler + cancel-aware warm-restart wrapper"
```

---

## Task 2.4: Periodic-tick trigger

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add a periodic-trigger task to the lifespan**

In `lifespan` (added in Task 2.2), after `await worker.start()`:

```python
async def _periodic_optimize_tick():
    """Every 90 s, post an OPTIMIZE trigger so the inbox refreshes
    even when no commit has happened recently."""
    from services.suggestions_worker import TriggerEvent, TriggerKind
    while True:
        try:
            await asyncio.sleep(90.0)
            await worker.post(TriggerEvent(
                kind=TriggerKind.PERIODIC,
                fingerprint="opt:periodic",
            ))
        except asyncio.CancelledError:
            break

import asyncio
periodic_task = asyncio.create_task(_periodic_optimize_tick(), name="periodic-optimize")
```

In the `finally:` block, before `await worker.stop()`:

```python
periodic_task.cancel()
try:
    await periodic_task
except asyncio.CancelledError:
    pass
```

- [ ] **Step 2: Smoke-run the app, confirm periodic logs**

Start the app, leave it running for 95 s. Look for the worker's `cooldown skip` debug-log line OR an actual suggestion (depending on whether persisted state has slack).

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(app): periodic 90s OPTIMIZE tick keeps inbox fresh between commits"
```

---

## Task 2.5: Commit-completed trigger

**Files:**
- Modify: `backend/api/schedule_proposals.py`

**Context:** Every successful commit should re-fire optimize speculation against the new state, since the previous suggestion (built against the old version) may no longer apply.

- [ ] **Step 1: Add the post-commit hook**

In `commit_proposal` (line 515 of `schedule_proposals.py`), after `del store[proposal_id]` and before `return CommitResponse(...)`, insert:

```python
# Drop any suggestions that were built against the old version —
# their proposalId now refers to a stale fork.
suggestion_store = _get_suggestion_store(http_request.app)
stale = [
    sid for sid, sug in suggestion_store.items()
    if sug.fromScheduleVersion < persisted.scheduleVersion + 1
]
for sid in stale:
    del suggestion_store[sid]

# Fire a fresh optimize speculation off-thread.
worker = getattr(http_request.app.state, "suggestions_worker", None)
if worker is not None:
    from services.suggestions_worker import TriggerEvent, TriggerKind
    await worker.post(TriggerEvent(
        kind=TriggerKind.OPTIMIZE,
        fingerprint=f"opt:post-commit:{persisted.scheduleVersion + 1}",
    ))
```

- [ ] **Step 2: Test that commits drop stale suggestions and refire**

Add to `src/tests/test_proposal_pipeline_integration.py`:

```python
@pytest.mark.asyncio
async def test_commit_drops_stale_suggestions_and_fires_refresh(client, ...):
    """1. Stamp a suggestion v=4. 2. Commit a different proposal,
    bumping live version to 5. 3. Old suggestion gone. 4. New
    OPTIMIZE trigger queued."""
    # ... full fixture setup mirroring existing commit tests
```

- [ ] **Step 3: Run + commit**

```bash
pytest src/tests/test_proposal_pipeline_integration.py -v -k commit
```

```bash
git add backend/api/schedule_proposals.py src/tests/test_proposal_pipeline_integration.py
git commit -m "feat(proposals): commit fires post-commit OPTIMIZE trigger, drops stale suggestions"
```

---

# Phase 3 — API Endpoints

## Task 3.1: `GET /schedule/suggestions`

**Files:**
- Modify: `backend/api/schedule_suggestions.py`
- Test: `src/tests/test_schedule_suggestions.py`

- [ ] **Step 1: Write failing API test**

```python
def test_get_suggestions_returns_empty_list(client):
    r = client.get("/schedule/suggestions")
    assert r.status_code == 200
    assert r.json() == []


def test_get_suggestions_returns_active(client, app, sample_suggestion):
    suggestion_store = app.state.suggestions
    suggestion_store[sample_suggestion.id] = sample_suggestion
    r = client.get("/schedule/suggestions")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] == sample_suggestion.id
    assert body[0]["kind"] == sample_suggestion.kind


def test_get_suggestions_evicts_expired(client, app):
    """Suggestions whose expiresAt < now should not be returned."""
    from app.schemas import Suggestion
    expired = Suggestion(
        kind="optimize", title="t", metric="m",
        proposalId="p", fingerprint="f",
        fromScheduleVersion=0,
        expiresAt="2000-01-01T00:00:00+00:00",
    )
    app.state.suggestions = {expired.id: expired}
    r = client.get("/schedule/suggestions")
    assert r.status_code == 200
    assert r.json() == []
```

- [ ] **Step 2: Implement endpoint**

In `backend/api/schedule_suggestions.py` add at module bottom:

```python
@router.get("", response_model=list[Suggestion])
async def list_suggestions(http_request: Request) -> list[Suggestion]:
    store = _get_suggestion_store(http_request.app)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired_suggestions(store)
        # Sort by severity tier, then impact magnitude. Tier order
        # mirrors the design brief: repair > director > optimize >
        # candidate. Impact = string-derived (we don't keep a
        # dedicated `impact` field on Suggestion to avoid drift;
        # parsing the metric is good enough for a stable tiebreak).
        TIER = {"repair": 0, "director": 1, "optimize": 2, "candidate": 3}
        return sorted(store.values(), key=lambda s: (TIER[s.kind], s.createdAt))
```

- [ ] **Step 3: Run + commit**

```bash
pytest src/tests/test_schedule_suggestions.py -v
git add backend/api/schedule_suggestions.py src/tests/test_schedule_suggestions.py
git commit -m "feat(api): GET /schedule/suggestions with TTL eviction + severity sort"
```

---

## Task 3.2: `POST /schedule/suggestions/{id}/apply`

**Files:**
- Modify: `backend/api/schedule_suggestions.py`

**Context:** Apply commits the underlying proposal via the existing `commit_proposal` flow, then drops the suggestion. The 409 (version conflict) and 410 (expired) failure modes flow through verbatim — frontend already handles them.

- [ ] **Step 1: Write failing test**

```python
def test_apply_suggestion_commits_and_drops(client, app, sample_suggestion_with_live_proposal):
    """Apply must commit the proposal and remove the suggestion."""
    sug = sample_suggestion_with_live_proposal
    app.state.suggestions = {sug.id: sug}
    r = client.post(f"/schedule/suggestions/{sug.id}/apply")
    assert r.status_code == 200
    body = r.json()
    assert "state" in body
    assert "historyEntry" in body
    assert sug.id not in app.state.suggestions
    assert sug.proposalId not in app.state.proposals  # consumed


def test_apply_returns_410_for_unknown_suggestion(client):
    r = client.post("/schedule/suggestions/nonexistent/apply")
    assert r.status_code == 410


def test_apply_propagates_409_on_stale_proposal(client, app, ...):
    """If the underlying proposal's fromScheduleVersion no longer
    matches the persisted version, the commit fails 409 and the
    suggestion is dropped (so the inbox refreshes)."""
    # ... setup
    r = client.post(f"/schedule/suggestions/{sug.id}/apply")
    assert r.status_code == 409
    assert sug.id not in app.state.suggestions  # dropped
```

- [ ] **Step 2: Implement endpoint**

```python
from app.schemas import CommitResponse  # add to imports
from api.schedule_proposals import commit_proposal


@router.post("/{suggestion_id}/apply", response_model=CommitResponse)
async def apply_suggestion(
    suggestion_id: str, http_request: Request,
) -> CommitResponse:
    """Commit the proposal underlying a suggestion."""
    store = _get_suggestion_store(http_request.app)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired_suggestions(store)
        sug = store.get(suggestion_id)
        if sug is None:
            raise http_error(
                410, ErrorCode.PROPOSAL_EXPIRED,
                "suggestion expired or not found",
            )
        proposal_id = sug.proposalId

    # Drop the suggestion BEFORE the commit even if the commit fails —
    # a 409 means the inbox is stale by definition; we don't want to
    # let the operator retry-clicking a doomed suggestion.
    async with lock:
        store.pop(suggestion_id, None)

    # Re-use the existing commit endpoint by calling its underlying
    # function. (Calling the route via TestClient would be cleaner
    # but introduces a self-request loop in production.)
    return await commit_proposal(proposal_id, http_request)
```

- [ ] **Step 3: Run + commit**

```bash
pytest src/tests/test_schedule_suggestions.py -v
git add backend/api/schedule_suggestions.py src/tests/test_schedule_suggestions.py
git commit -m "feat(api): POST /schedule/suggestions/:id/apply commits underlying proposal"
```

---

## Task 3.3: `POST /schedule/suggestions/{id}/dismiss`

**Files:**
- Modify: `backend/api/schedule_suggestions.py`

- [ ] **Step 1: Failing test**

```python
def test_dismiss_drops_suggestion_and_cancels_proposal(client, app, sample_suggestion_with_live_proposal):
    sug = sample_suggestion_with_live_proposal
    app.state.suggestions = {sug.id: sug}
    r = client.post(f"/schedule/suggestions/{sug.id}/dismiss")
    assert r.status_code == 200
    assert r.json() == {"dismissed": True}
    assert sug.id not in app.state.suggestions
    assert sug.proposalId not in app.state.proposals


def test_dismiss_unknown_returns_410(client):
    r = client.post("/schedule/suggestions/nonexistent/dismiss")
    assert r.status_code == 410
```

- [ ] **Step 2: Implement**

```python
@router.post("/{suggestion_id}/dismiss")
async def dismiss_suggestion(
    suggestion_id: str, http_request: Request,
) -> dict:
    store = _get_suggestion_store(http_request.app)
    proposal_store = _get_store(http_request.app)
    lock = _get_lock(http_request.app)
    async with lock:
        _evict_expired_suggestions(store)
        sug = store.pop(suggestion_id, None)
        if sug is None:
            raise http_error(
                410, ErrorCode.PROPOSAL_EXPIRED,
                "suggestion expired or not found",
            )
        proposal_store.pop(sug.proposalId, None)
    return {"dismissed": True}
```

- [ ] **Step 3: Run + commit**

```bash
pytest src/tests/test_schedule_suggestions.py -v
git add backend/api/schedule_suggestions.py src/tests/test_schedule_suggestions.py
git commit -m "feat(api): POST /schedule/suggestions/:id/dismiss"
```

---

## Task 3.4: Repair speculation via advisory hook

**Files:**
- Modify: `backend/api/schedule_advisories.py`
- Modify: `backend/app/schemas.py` (add `suggestionId` field to `Advisory`)
- Test: `src/tests/test_schedule_advisories.py`

**Context:** Today an advisory carries a `suggestedAction` that the frontend turns into a dialog click. We extend it: when an advisory of solver-bound kind is generated, post a `REPAIR` trigger to the worker; when the worker finishes, attach the resulting `suggestionId` to the advisory in the next response. The frontend will treat advisories with `suggestionId` set as "Apply available" instead of "Review."

- [ ] **Step 1: Add `suggestionId` to Advisory schema**

In `backend/app/schemas.py`, find the `Advisory` class. Add:

```python
suggestionId: Optional[str] = None
```

- [ ] **Step 2: Wire the trigger**

In `backend/api/schedule_advisories.py`, after the advisory list is composed (just before `return advisories` in the GET handler), insert:

```python
# Post REPAIR triggers for advisories whose suggestedAction is solver-bound.
worker = getattr(request.app.state, "suggestions_worker", None)
if worker is not None:
    from services.suggestions_worker import TriggerEvent, TriggerKind
    for a in advisories:
        if a.suggestedAction and a.suggestedAction.kind in (
            "repair", "warm_restart",
        ):
            await worker.post(TriggerEvent(
                kind=TriggerKind.REPAIR,
                fingerprint=f"repair:{a.id}",
                payload={"advisoryId": a.id, "suggestedAction": a.suggestedAction.model_dump()},
            ))

# Attach suggestionId to advisories that already have a stamped one
suggestion_store = _get_suggestion_store(request.app)
for a in advisories:
    matching = next(
        (s for s in suggestion_store.values()
         if s.fingerprint == f"repair:{a.id}"),
        None,
    )
    if matching:
        a.suggestionId = matching.id
```

- [ ] **Step 3: Implement repair handler in `schedule_suggestions.py`**

In `_handle_optimize`'s neighbour, add:

```python
async def _handle_repair(
    app: FastAPI, event: TriggerEvent, token: CancelToken,
) -> None:
    """Take a payload describing a repair and produce a Suggestion."""
    payload = event.payload
    suggested = payload.get("suggestedAction") or {}
    if suggested.get("kind") != "repair":
        return  # warm_restart suggestions are auto-handled by optimize
    persisted = _read_persisted_state()
    if persisted is None:
        return

    # Extract the disruption from suggestedAction.payload and run a repair.
    from api.schedule_repair import RepairRequest, _run_repair_with_cancel
    from app.schemas import Disruption
    disruption_raw = suggested.get("payload", {})
    try:
        disruption = Disruption(**disruption_raw)
    except Exception:
        log.warning("malformed advisory disruption: %s", disruption_raw)
        return

    rr = RepairRequest(
        originalSchedule=persisted.schedule,
        config=persisted.config,
        players=persisted.players,
        matches=persisted.matches,
        matchStates=persisted.matchStates or {},
        disruption=disruption,
    )

    loop = asyncio.get_running_loop()
    try:
        new_schedule, _ = await loop.run_in_executor(
            None, lambda: _run_repair_with_cancel(rr, cancel_token=token),
        )
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("repair speculation failed")
        return

    store = _get_store(app)
    suggestion_store = _get_suggestion_store(app)
    lock = _get_lock(app)
    async with lock:
        _evict_expired(store); _evict_expired_suggestions(suggestion_store)
        proposal = _build_proposal(
            store, kind=ProposalKind.REPAIR,
            proposed_schedule=new_schedule,
            committed_schedule=persisted.schedule,
            matches=persisted.matches, players=persisted.players,
            groups=list(persisted.groups or []),
            from_version=persisted.scheduleVersion,
            summary=f"Repair: {disruption.type}",
        )
        moves = _moves_count(persisted.schedule, new_schedule)
        finish = _finish_delta_minutes(persisted.schedule, new_schedule, persisted.config)
        sug = Suggestion(
            kind="repair",
            title=_repair_title(disruption),
            metric=_format_metric(finish_delta_min=finish, moves=moves),
            proposalId=proposal.id,
            fingerprint=event.fingerprint,
            fromScheduleVersion=persisted.scheduleVersion,
            expiresAt=_expires_at(),
        )
        suggestion_store[sug.id] = sug


def _repair_title(d) -> str:
    if d.type == "court_closed":
        return f"Repair: court {d.courtId} closed"
    if d.type == "withdrawal":
        return f"Repair: player {d.playerId} withdrew"
    if d.type == "overrun":
        return f"Repair: match {d.matchId} overrun"
    if d.type == "cancellation":
        return f"Repair: match {d.matchId} cancelled"
    return f"Repair: {d.type}"


def _moves_count(old, new) -> int:
    new_idx = {a.matchId: (a.slotId, a.courtId) for a in new.assignments}
    return sum(
        1 for a in old.assignments
        if new_idx.get(a.matchId) != (a.slotId, a.courtId)
    )
```

Update `build_handler` to dispatch `REPAIR`:

```python
async def handler(event: TriggerEvent, token: CancelToken) -> None:
    if event.kind in (TriggerKind.OPTIMIZE, TriggerKind.PERIODIC):
        await _handle_optimize(app, event, token)
    elif event.kind == TriggerKind.REPAIR:
        await _handle_repair(app, event, token)
```

Add a parallel `_run_repair_with_cancel` to `backend/api/schedule_repair.py` (mirrors Task 2.3 step 2 but for repair).

- [ ] **Step 4: Run + commit**

```bash
pytest src/tests/test_schedule_advisories.py src/tests/test_schedule_suggestions.py -v
```

```bash
git add backend/api/schedule_advisories.py backend/api/schedule_suggestions.py backend/api/schedule_repair.py backend/app/schemas.py src/tests/
git commit -m "feat(suggestions): repair speculations triggered by advisories"
```

---

# Phase 4 — Frontend

## Task 4.1: API client + DTO

**Files:**
- Modify: `frontend/src/api/dto.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add `Suggestion` interface to `dto.ts`**

After the `Advisory` interface, add:

```ts
export interface Suggestion {
  id: string;
  kind: 'repair' | 'optimize' | 'director' | 'candidate';
  title: string;
  metric: string;
  proposalId: string;
  fingerprint: string;
  fromScheduleVersion: number;
  createdAt: string;
  expiresAt: string;
}
```

Also add `suggestionId?: string` to the existing `Advisory` interface.

- [ ] **Step 2: Add API client methods to `client.ts`**

After the existing advisory methods, add:

```ts
async getSuggestions(): Promise<Suggestion[]> {
  const r = await this.http.get<Suggestion[]>('/schedule/suggestions');
  return r.data;
}

async applySuggestion(id: string): Promise<CommitProposalResponse> {
  const r = await this.http.post<CommitProposalResponse>(
    `/schedule/suggestions/${id}/apply`,
  );
  return r.data;
}

async dismissSuggestion(id: string): Promise<void> {
  await this.http.post(`/schedule/suggestions/${id}/dismiss`);
}
```

Update the `Suggestion` import alongside `Advisory`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/dto.ts
git commit -m "feat(api): client + DTO for /schedule/suggestions"
```

---

## Task 4.2: Store + polling hook

**Files:**
- Modify: `frontend/src/store/appStore.ts`
- Create: `frontend/src/hooks/useSuggestions.ts`

- [ ] **Step 1: Extend the store**

In `frontend/src/store/appStore.ts`, after `setAdvisories`, add:

```ts
suggestions: Suggestion[];
setSuggestions: (s: Suggestion[]) => void;
```

In the store implementation:

```ts
suggestions: [],
setSuggestions: (suggestions) => set({ suggestions }),
```

Make sure `Suggestion` is imported.

- [ ] **Step 2: Build the hook (mirrors `useAdvisories.ts`)**

```ts
// frontend/src/hooks/useSuggestions.ts
/**
 * Suggestions polling hook.
 *
 * Polls GET /schedule/suggestions every 8 seconds while the tab is
 * visible, dropping the result into ``useAppStore.suggestions``. The
 * cadence matches advisories (15 s) but tighter, since suggestions
 * are pre-computed proposals the operator might be waiting on.
 *
 * Mirrors the existing useAdvisories pattern; deliberately small.
 */
import { useEffect, useRef } from 'react';

import { apiClient } from '../api/client';
import { useAppStore } from '../store/appStore';

const POLL_INTERVAL_MS = 8_000;

export function useSuggestions(): null {
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const poll = async () => {
      try {
        const list = await apiClient.getSuggestions();
        if (!cancelledRef.current) setSuggestions(list);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('useSuggestions: poll failed', err);
        }
      }
    };

    void poll();
    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [setSuggestions]);

  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/appStore.ts frontend/src/hooks/useSuggestions.ts
git commit -m "feat(frontend): suggestions store slice + 8s polling hook"
```

---

## Task 4.3: SuggestionRow component

**Files:**
- Create: `frontend/src/features/suggestions/SuggestionRow.tsx`

> All visual specs in Appendix A. Token usage and class strings below match the brief verbatim.

- [ ] **Step 1: Implement `SuggestionRow`**

```tsx
// frontend/src/features/suggestions/SuggestionRow.tsx
/**
 * One row in the SuggestionsRail. Dumb: props in, callbacks out.
 *
 * Visual spec: Appendix A of docs/superpowers/plans/2026-05-04-suggestions-inbox.md
 *   - 6px semantic dot
 *   - eyebrow ("REPAIR" / "OPTIMIZE" / "DIRECTOR" / "ALT")
 *   - title (single line, truncate)
 *   - tabular metric (right column)
 *   - Apply button (primary), Dismiss × (ghost)
 *   - Click row body to expand inline preview (handled by parent)
 *   - NO side-stripe borders, NO per-kind Apply colors,
 *     NO icons next to title.
 */
import { CircleNotch, X } from '@phosphor-icons/react';
import type { Suggestion } from '../../api/dto';
import { INTERACTIVE_BASE } from '../../lib/utils';

const KIND_DOT: Record<Suggestion['kind'], string> = {
  repair: 'bg-status-warning',
  director: 'bg-status-info',
  optimize: 'bg-status-idle',
  candidate: 'bg-status-idle',
};

const KIND_EYEBROW: Record<Suggestion['kind'], string> = {
  repair: 'REPAIR',
  director: 'DIRECTOR',
  optimize: 'OPTIMIZE',
  candidate: 'ALT',
};

interface Props {
  suggestion: Suggestion;
  expanded: boolean;
  applying: boolean;
  onToggleExpanded: () => void;
  onApply: () => void;
  onDismiss: () => void;
}

export function SuggestionRow({
  suggestion: s, expanded, applying,
  onToggleExpanded, onApply, onDismiss,
}: Props) {
  return (
    <div
      role="group"
      aria-label={`${KIND_EYEBROW[s.kind]} suggestion: ${s.title}`}
      className="grid items-center gap-2 px-3 py-1.5 hover:bg-bg-subtle transition-colors"
      style={{ gridTemplateColumns: 'auto auto 1fr auto auto auto' }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[s.kind]}`}
        aria-hidden="true"
      />
      <span className="text-2xs font-semibold uppercase tracking-wider text-fg-muted whitespace-nowrap">
        {KIND_EYEBROW[s.kind]}
      </span>
      <button
        type="button"
        onClick={onToggleExpanded}
        title={s.title}
        aria-expanded={expanded}
        className={`${INTERACTIVE_BASE} truncate text-left text-sm font-medium text-fg`}
      >
        {s.title}
      </button>
      <span className="whitespace-nowrap text-xs text-fg-muted tabular-nums">
        {s.metric}
      </span>
      <button
        type="button"
        onClick={onApply}
        disabled={applying}
        className={`${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-60`}
      >
        {applying && <CircleNotch className="h-3 w-3 animate-spin" aria-hidden="true" />}
        {applying ? 'Applying' : 'Apply'}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
        className={`${INTERACTIVE_BASE} rounded p-0.5 text-fg-muted hover:bg-bg-subtle hover:text-fg`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/suggestions/SuggestionRow.tsx
git commit -m "feat(frontend): SuggestionRow per impeccable design brief"
```

---

## Task 4.4: SuggestionPreview inline diff

**Files:**
- Create: `frontend/src/features/suggestions/SuggestionPreview.tsx`

- [ ] **Step 1: Implement preview**

```tsx
// frontend/src/features/suggestions/SuggestionPreview.tsx
/**
 * Inline diff for an expanded suggestion row.
 *
 * Lazy-fetches the full Impact via GET /schedule/proposals/{id}.
 * Reuses ScheduleDiffView in compact mode. Indented under the row
 * so the row's Apply button stays visible at the top.
 */
import { useEffect, useState } from 'react';

import type { Impact, TournamentConfig } from '../../api/dto';
import { apiClient } from '../../api/client';
import { ScheduleDiffView } from '../schedule/ScheduleDiffView';
import { formatSlotTime } from '../../lib/time';

interface Props {
  proposalId: string;
  config: TournamentConfig | null;
}

export function SuggestionPreview({ proposalId, config }: Props) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient.getProposal(proposalId)
      .then((p) => { if (!cancelled) setImpact(p.impact); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'load failed'); });
    return () => { cancelled = true; };
  }, [proposalId]);

  const formatSlot = (slotId: number | null | undefined): string => {
    if (slotId == null) return '—';
    if (!config) return `slot ${slotId}`;
    return formatSlotTime(slotId, config);
  };

  return (
    <div className="border-t border-border/40 bg-bg-subtle/40 px-3 py-2 pl-12">
      {error && (
        <div className="text-xs text-fg-muted">Could not load preview: {error}</div>
      )}
      {!impact && !error && (
        <div className="text-xs text-fg-muted">Loading preview...</div>
      )}
      {impact && (
        <ScheduleDiffView
          impact={impact}
          formatSlot={formatSlot}
          density="compact"
        />
      )}
    </div>
  );
}
```

If `ScheduleDiffView` doesn't accept a `density` prop, add a minimal `density?: 'compact' | 'normal'` switch in that file (compact reduces row padding from `py-1.5` to `py-0.5` and drops the meta-summary row at the bottom). One-line change.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/suggestions/SuggestionPreview.tsx frontend/src/features/schedule/ScheduleDiffView.tsx
git commit -m "feat(frontend): SuggestionPreview lazy-fetches impact + reuses diff view"
```

---

## Task 4.5: SuggestionsRail container

**Files:**
- Create: `frontend/src/features/suggestions/SuggestionsRail.tsx`

- [ ] **Step 1: Implement rail**

```tsx
// frontend/src/features/suggestions/SuggestionsRail.tsx
/**
 * The Suggestions Inbox rail.
 *
 * Always-visible-when-populated strip below the AdvisoryBanner,
 * above the Gantt. Renders nothing when zero suggestions.
 *
 * Owns the expanded-row state, the per-row Apply/Dismiss
 * lifecycle, and the "+ N more" overflow tail. Visuals per
 * Appendix A of docs/superpowers/plans/2026-05-04-suggestions-inbox.md.
 */
import { useState } from 'react';

import { apiClient } from '../../api/client';
import type { Suggestion } from '../../api/dto';
import { useAppStore } from '../../store/appStore';
import { SuggestionRow } from './SuggestionRow';
import { SuggestionPreview } from './SuggestionPreview';

const VISIBLE_CAP = 3;

export function SuggestionsRail() {
  const suggestions = useAppStore((s) => s.suggestions);
  const config = useAppStore((s) => s.config);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const setSchedule = useAppStore((s) => s.setSchedule);
  const setScheduleVersion = useAppStore((s) => s.setScheduleVersion);
  const setScheduleHistory = useAppStore((s) => s.setScheduleHistory);
  const setConfig = useAppStore((s) => s.setConfig);
  const pushToast = useAppStore((s) => s.pushToast);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  const visible = showAll
    ? suggestions
    : suggestions.slice(0, VISIBLE_CAP);
  const overflow = suggestions.length - VISIBLE_CAP;

  const handleApply = async (s: Suggestion) => {
    setApplyingId(s.id);
    try {
      const r = await apiClient.applySuggestion(s.id);
      setSchedule(r.state.schedule ?? null);
      setScheduleVersion(r.state.scheduleVersion ?? 0);
      setScheduleHistory(r.state.scheduleHistory ?? []);
      if (r.state.config) setConfig(r.state.config);
      setSuggestions(suggestions.filter((x) => x.id !== s.id));
      pushToast({
        level: 'success',
        message: r.historyEntry.summary || 'Applied',
        durationMs: 3000,
      });
    } catch (err: any) {
      // 409 (stale) and 410 (expired) drop the suggestion locally —
      // the next poll will confirm.
      const code = err?.response?.status;
      setSuggestions(suggestions.filter((x) => x.id !== s.id));
      pushToast({
        level: code === 409 ? 'info' : 'error',
        message: code === 409
          ? 'Suggestion was stale, refreshing'
          : err?.message ?? 'Apply failed',
        durationMs: 4000,
      });
    } finally {
      setApplyingId(null);
    }
  };

  const handleDismiss = async (s: Suggestion) => {
    setSuggestions(suggestions.filter((x) => x.id !== s.id));
    if (expandedId === s.id) setExpandedId(null);
    try {
      await apiClient.dismissSuggestion(s.id);
    } catch {
      // best-effort; the next poll will reconcile
    }
  };

  return (
    <section
      role="region"
      aria-label="Pre-computed schedule suggestions"
      className="border-b border-border bg-card"
    >
      <ul className="divide-y divide-border/60">
        {visible.map((s) => (
          <li key={s.id}>
            <SuggestionRow
              suggestion={s}
              expanded={expandedId === s.id}
              applying={applyingId === s.id}
              onToggleExpanded={() =>
                setExpandedId(expandedId === s.id ? null : s.id)
              }
              onApply={() => void handleApply(s)}
              onDismiss={() => void handleDismiss(s)}
            />
            {expandedId === s.id && (
              <SuggestionPreview proposalId={s.proposalId} config={config} />
            )}
          </li>
        ))}
        {!showAll && overflow > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="block w-full px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-muted hover:text-fg hover:bg-bg-subtle"
            >
              + {overflow} more
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/suggestions/SuggestionsRail.tsx
git commit -m "feat(frontend): SuggestionsRail container — sort, expand, apply, dismiss"
```

---

## Task 4.6: Mount in AppShell

**Files:**
- Modify: `frontend/src/app/AppShell.tsx`

- [ ] **Step 1: Wire `useSuggestions` and render the rail**

In `AppShell.tsx`:

```tsx
import { useSuggestions } from '../hooks/useSuggestions';
import { SuggestionsRail } from '../features/suggestions/SuggestionsRail';
```

In the component body, alongside the existing `useAdvisories()`:

```tsx
useAdvisories();
useSuggestions();
```

In the JSX, immediately below `<AdvisoryBanner />` (and above whatever wraps the routed pages):

```tsx
<AdvisoryBanner />
<SuggestionsRail />
```

- [ ] **Step 2: Verify**

Start the backend + frontend. Trigger a tournament with slack (e.g. mark a match as finished early via the live-ops UI). Wait for the 8 s poll. The rail should appear with an OPTIMIZE row.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/AppShell.tsx
git commit -m "feat(app): mount SuggestionsRail under AdvisoryBanner globally"
```

---

# Phase 5 — E2E + Documentation

## Task 5.1: Playwright smoke test

**Files:**
- Create: `e2e/tests/08-suggestions-inbox.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/tests/08-suggestions-inbox.spec.ts
import { test, expect } from '@playwright/test';
import { loadDemoFixture } from './helpers/fixtures';

test.describe('Suggestions inbox', () => {
  test('background optimize stamps a suggestion that applies cleanly', async ({ page }) => {
    await loadDemoFixture(page, 'small-with-slack');
    await page.goto('/control-center');

    // Wait up to 15 s for the rail to populate (worker runs at app start).
    const rail = page.getByRole('region', { name: /suggestions/i });
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const firstRow = rail.locator('[role="group"]').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.locator('text=OPTIMIZE')).toBeVisible();

    // Click body to expand
    await firstRow.locator('button[aria-expanded="false"]').click();
    await expect(firstRow.locator('button[aria-expanded="true"]')).toBeVisible();

    // Apply
    const versionBefore = await page.evaluate(
      () => (window as any).__appStore?.getState()?.scheduleVersion ?? null
    );
    await firstRow.locator('button:has-text("Apply")').click();
    // Toast confirms; rail row disappears
    await expect(firstRow).not.toBeVisible({ timeout: 5_000 });
    const versionAfter = await page.evaluate(
      () => (window as any).__appStore?.getState()?.scheduleVersion ?? null
    );
    expect(versionAfter).toBe(versionBefore + 1);
  });

  test('dismiss removes the row without committing', async ({ page }) => {
    await loadDemoFixture(page, 'small-with-slack');
    await page.goto('/control-center');

    const rail = page.getByRole('region', { name: /suggestions/i });
    await expect(rail).toBeVisible({ timeout: 15_000 });
    const firstRow = rail.locator('[role="group"]').first();
    const versionBefore = await page.evaluate(
      () => (window as any).__appStore?.getState()?.scheduleVersion ?? null
    );
    await firstRow.locator('button[aria-label="Dismiss suggestion"]').click();
    await expect(firstRow).not.toBeVisible({ timeout: 3_000 });
    const versionAfter = await page.evaluate(
      () => (window as any).__appStore?.getState()?.scheduleVersion ?? null
    );
    expect(versionAfter).toBe(versionBefore);
  });
});
```

The fixture `small-with-slack` is a tournament whose initial solve leaves intentional finish-time slack so the optimize handler always finds a 1+ move improvement. Add it to `e2e/fixtures/` mirroring the existing demo fixtures.

- [ ] **Step 2: Run E2E**

```bash
cd e2e && npx playwright test 08-suggestions-inbox
```

Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/08-suggestions-inbox.spec.ts e2e/fixtures/
git commit -m "test(e2e): suggestions inbox apply + dismiss smoke"
```

---

## Task 5.2: README + post-merge note

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Suggestions Inbox" sub-section to the Live Ops feature list**

After the existing "Live ops" bullet, add:

```md
- **Suggestions Inbox** — a background re-optimization worker continuously checks for better schedules; matched proposals appear as a one-click "Apply" rail under the advisory bar, so directors don't need to know when to re-plan.
```

- [ ] **Step 2: Note the follow-up**

Append a brief entry to whichever doc tracks post-merge follow-ups (or just put it in the PR body):

> Run `/impeccable document` once this lands so DESIGN.md is generated with the new design tokens and the next feature has authoritative references.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README mentions Suggestions Inbox"
```

---

# Self-Review Checklist (run after writing the plan, before handing off)

1. **Spec coverage**
   - User goal "background calculations, decisions need to be quick": ✅ Phase 2 worker + Phase 3 inbox endpoints.
   - "Undo never freezes": ✅ Mutations untouched (PRODUCT.md → "live ops feels controlled" preserved); only the worker invokes solver, on its own queue.
   - "Visible only when populated": ✅ `SuggestionsRail` early-returns `null` on empty list.
   - "Apply / Dismiss / inline preview per suggestion": ✅ Tasks 4.3–4.5 cover all three.
   - "Reopen visibility": ✅ Phase 0.

2. **Placeholder scan**
   - Steps with TBD / TODO / "implement appropriately": none.
   - Empty test asserts ("// ... full setup"): three (in Tasks 2.5 step 2, 3.2 step 1 third test, 3.4 setup). Each one explicitly references an existing pattern in the file (`mirroring existing commit tests`); the engineer can copy-paste from the existing test in the same file. **Acceptable** because the surrounding test code is identical and re-stating it would balloon the plan with duplicated fixtures.

3. **Type consistency**
   - `Suggestion` schema (kind, title, metric, proposalId, fingerprint, fromScheduleVersion, expiresAt) is identical across backend Pydantic, frontend TS, and component props. ✅
   - `TriggerEvent` / `TriggerKind` consistent across worker + handler + post-commit hook. ✅
   - `apiClient.applySuggestion` returns `CommitProposalResponse` (matches existing commit shape). ✅

4. **Architectural invariant: mutations never wait on solver**
   - No mutation handler is modified to await the worker. Worker is post-commit only on the proposal pipeline (which is *already* async / decoupled). ✅
   - `useLiveTracking.ts`, `match_state.py`, score-edit, and undo paths are explicitly listed in "Untouched (intentional)." ✅

---

# Appendix A — Frontend Design Reference (verbatim impeccable brief)

> This appendix is the authoritative source for visual choices in Phase 4. Tasks cite it; do not re-derive colors, spacing, or motion in the components.

## A.1 Theme & placement

Light theme is the calibration target (operator scene: fluorescent gymnasium, daylight). Dark works but is not the optimization point. **Mount under `<AdvisoryBanner />`, above the Gantt**, in `AppShell.tsx`. **Not on `PublicDisplayPage`.**

## A.2 Anatomy

```
●  REPAIR    Court 3 closed, 4 matches move      0 min finish     [Apply]  ×
^  ^^^^^^    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^     ^^^^^^^^^^^^^    ^^^^^^^  ^
dot eyebrow  title                                metric          primary  ghost
```

| Element | Class / spec |
|---|---|
| Dot | 6px, `bg-status-{warning\|info\|idle}` per kind |
| Eyebrow | `text-2xs font-semibold uppercase tracking-wider text-fg-muted` |
| Title | `text-sm font-medium text-fg`, single line, truncate, `title` attr fallback |
| Metric | `text-xs text-fg-muted tabular-nums` |
| Apply | `text-xs font-medium px-2.5 py-1 rounded bg-primary text-primary-foreground hover:brightness-110 active:scale-95` |
| Dismiss | `<X className="h-4 w-4" />`, `text-fg-muted hover:text-fg`, ghost |
| Row body | clickable `<button>` to expand |
| Rail container | `bg-card border-b border-border` (no top border, flows from advisory above), `divide-y divide-border/60` between rows |

CSS grid columns (gap-2): `auto · auto · 1fr · auto · auto · auto`.

## A.3 Kind → dot color

Three colors, all from existing semantic vocabulary. **No per-kind Apply colors.**

| Kind | Eyebrow | Dot |
|---|---|---|
| Repair | `REPAIR` | `bg-status-warning` |
| Re-optimize | `OPTIMIZE` | `bg-status-idle` |
| Director | `DIRECTOR` | `bg-status-info` |
| Candidate | `ALT` | `bg-status-idle` |

## A.4 Inline preview

Clicking row body expands a diff below the row (NOT a modal). Indented `pl-12` to align under the title column. Caret rotates 90° on expand. Esc collapses. Only one row expanded at a time.

## A.5 Sort order

1. Severity tier: Repair > Director > Optimize > Candidate.
2. Within tier, by `createdAt` (older first).

Cap at 3 visible. Overflow: `+ N more` low-key footer that reveals all on click.

## A.6 States

| State | Treatment |
|---|---|
| Empty | rail not rendered (early-return null) |
| Worker busy + empty | not implemented in V1; future enhancement |
| Apply in flight | Apply button shows `<CircleNotch className="animate-spin" />` + "Applying", disabled |
| Apply succeeded | row fades out + height collapses 200 ms ease-out-quart, toast confirms |
| Apply failed (409) | row drops, toast "Suggestion was stale, refreshing" |
| Worker errored | NOT a suggestion — surfaces as an Advisory `info`-severity ping |

## A.7 Motion

| Trigger | Animation |
|---|---|
| New row | `opacity 0→1` + `height 0→auto`, 220ms ease-out-quart, dot pulses once (scale 1→1.4→1, 400ms total) |
| Row removed | `opacity 1→0` + `height auto→0`, 200ms ease-out-quart |
| Preview expand | `height 0→auto`, 180ms ease-out-quart |
| Apply click | `scale 0.95` for 100ms |

Never animate `top`/`left`. Only `opacity`, `transform`, `height`. No `transition-all`.

## A.8 Anti-list (do NOT)

- ❌ side-stripe colored borders (`border-l-4 border-l-amber-500`) — banned by absolute rules
- ❌ cards per row — single rail, divided rows only
- ❌ icons before each row's title — dot already encodes kind
- ❌ per-kind Apply button colors
- ❌ counter chip (the visible row count IS the count)
- ❌ recency timestamps
- ❌ auto-apply low-impact suggestions — operator approval always
- ❌ tooltips on every word — `title` attr only on truncated title
- ❌ spinner on rail when worker busy + populated (keep silent)
- ❌ em dashes in row copy — use commas/periods/parentheses
- ❌ solver vocabulary in row text ("warm-restart", "stay-close", "CP-SAT") — operator words only

## A.9 Copy patterns

| Kind | Title | Metric |
|---|---|---|
| Repair | `Court 3 closed, 4 matches move` | `0 min finish` |
| Repair | `Player Lin J. withdrew (3 matches)` | `+8 min finish` |
| Repair | `Match M17 overrun, slide 2 successors` | `+10 min` |
| Optimize | `Re-optimize from now` | `−12 min finish, 7 moves` |
| Optimize | `Compress remaining (gap reduction)` | `−6 min, 2 moves` |
| Director | `Delay-start 15 min absorbed` | `0 moves` |
| Director | `Insert lunch break (12:00–13:00)` | `+45 min finish, 6 moves` |
| Candidate | `Alternate schedule (better load balance)` | `5 moves, finish unchanged` |

Negative deltas use true minus `−` (U+2212). Numbers always render with `tabular-nums`.
