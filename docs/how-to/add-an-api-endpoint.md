# How to add an API endpoint

**Goal:** add one HTTP route end-to-end — Pydantic model, FastAPI handler, its
TypeScript DTO twin, an `apiClient` method, and the hook that calls it — keeping
the frontend and backend types in lock-step.

This is the recipe from `frontend/src/api/README.md`, with the worked example
being the bracket result command (`submit_bracket_command` →
`recordBracketResultCommand`).

::: info The one rule
`api/dto.ts` holds a TypeScript twin of **every** Pydantic model in
`backend/app/schemas.py`. Keep them field-for-field in lock-step — a drift here
is the most common source of runtime surprises.
:::

## 1 · Backend — model, handler, router

1. Add the request/response models to `backend/app/schemas.py` (or a
   feature-local schema module, as `brackets.py` does with `BracketCommandRequest`).
2. Add the handler to the feature's router file, `backend/api/<feature>.py`:

   ```python
   @router.post("/commands", response_model=TournamentOut, dependencies=[_OPERATOR])
   def submit_bracket_command(body: BracketCommandRequest, ...):
       ...
   ```
3. Register the router in `backend/app/main.py` if the feature file is new.

For a **write** that needs optimistic UI + conflict safety, follow the command
pipeline rather than a bare mutation — carry a client UUID idempotency key and a
`seen_version`. See [Data flow → the command pipeline](/architecture/data-flow#the-command-pipeline-write-path)
and [Bracket result command queue](/architecture/bracket-result-queue).

## 2 · Frontend — DTO twin

Add the matching TypeScript types to `api/dto.ts` (or `api/bracketDto.ts` for
bracket shapes), matching the Pydantic fields exactly.

## 3 · Frontend — `apiClient` method

Add a method on `ApiClient` in `api/client.ts`. The axios response interceptor
already turns errors into toasts (with the `X-Request-ID` for bug reports), so you
don't need a try/catch unless you want domain-specific handling:

```ts
async recordBracketResultCommand(tid: string, body: BracketCommandRequest) {
  return this.client.post(`/tournaments/${tid}/bracket/commands`, body);
}
```

## 4 · Frontend — call it from a hook

Components never call `apiClient` directly — **hooks are the seam**. Add or extend
a hook under `frontend/src/hooks/` (e.g. `useBracketResultQueue`) that owns the
call, the optimistic apply, and the outcome routing.

## 5 · If the endpoint is module-owned, declare it

List the new `apiClient` method in the owning module's
`moduleContract.ownedEndpoints` (or `consumedEndpoints` if another module owns
it). The contract test checks these by **referential identity** to real
`apiClient` methods, so a renamed or removed method fails the build.

## Verify

```bash
# backend (from repo root)
.venv/Scripts/python.exe -m pytest products/scheduler/backend -q
# frontend
cd products/scheduler/frontend && npx tsc -b && npx vitest run
```

Open the live Swagger UI at `http://localhost:8000/docs` to exercise the route.

## See also

- [How to wire a seam](/how-to/wire-a-seam) — when the endpoint crosses a module boundary
- [API reference](/api/) · [Data flow](/architecture/data-flow)
