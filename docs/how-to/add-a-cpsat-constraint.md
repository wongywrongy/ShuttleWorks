# How to add a CP-SAT constraint

**Goal:** teach the scheduling engine a new rule — a hard requirement or a soft
penalty — as a self-contained plugin, then expose its knobs to the product.

All scheduling lives in `scheduler_core/` — pure Python, no HTTP. Constraints are
plugins under `engine/constraints/`, one file per rule. This is the recipe from
`scheduler_core/README.md`.

::: info Hard vs soft
A **hard** constraint forbids a solution (e.g. `court_capacity` — no two matches
share a court at once). A **soft** constraint adds a weighted penalty the solver
minimises (e.g. `rest` — discourage short rest gaps). Soft penalties are
aggregated in `engine/constraints/objective.py`.
:::

## 1 · Write the plugin

Drop a new file `scheduler_core/engine/constraints/<name>.py` exporting a class
that implements the `Constraint` protocol (declared in
`engine/constraints/__init__.py`) — an `apply(model, vars, params)` method and a
`name` attribute:

```python
class NoBackToBackOnSameCourt:
    name = "no_back_to_back_same_court"
    def apply(self, model, vars, params):
        # add cp_model constraints / penalty terms here
        ...
```

Use the existing plugins as templates — `court_capacity.py` (hard) and `rest.py`
(soft) are the clearest.

## 2 · Register it

Add the plugin to `engine/constraints/__init__.py` so the loader resolves it by
name.

## 3 · Add it to an `EngineConfig`

Add its `ConstraintSpec(name=..., params={...})` to the relevant `EngineConfig`
factory — typically `engine/config.py`, or an adapter that builds a custom plugin
set. `EngineConfig.from_legacy(config)` builds the standard list from the flat
`ScheduleConfig`, so existing call-sites need no change.

## 4 · Surface the knobs

Expose any tunables end-to-end so the product can set them:

```
domain/models.SolverOptions          # add the field + default
  → backend/app/schemas.py           # mirror it on the config DTO
    → frontend/src/api/dto.ts        # the TypeScript twin
```

`backend/api/schedule.py` maps the frontend tournament config onto `SolverOptions`.

## 5 · Test it

Add a unit test under `products/scheduler/tests/` that builds a minimal instance
and asserts the new behaviour:

```bash
cd products/scheduler && .venv/Scripts/python.exe -m pytest -q
```

::: tip Repair and warm-restart inherit your constraint
Because `solve_repair` and `solve_warm_start` reuse the same plugin list, a new
constraint automatically applies to live re-solves — but verify it composes with
`stay_close` (the move-penalty plugin those paths add). See
`scheduler_core/README.md` → "Repair vs. warm-restart".
:::

## See also

- [How to build a product on the engine](/how-to/build-on-the-engine)
- [ADR 0004 — OR-Tools CP-SAT engine](/decisions/0004-ortools-cpsat-engine)
- [ADR 0006 — Unified scheduling core](/decisions/0006-unified-scheduling-core)
