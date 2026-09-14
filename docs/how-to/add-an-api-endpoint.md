# How to add an API endpoint

**Goal:** add one HTTP route end-to-end — Pydantic model, FastAPI handler, its
TypeScript DTO twin, an `apiClient` method, and the hook that calls it — keeping
the frontend and backend types in lock-step.

This is the recipe from `apps/console/src/api/README.md`, with the worked example
being the bracket result command (`submit_bracket_command` →
`recordBracketResultCommand`).

::: info The one rule
`apps/console/src/api/dto.ts` holds a TypeScript twin of **every** Pydantic model in
`apps/api/src/core/schemas.py`. Keep them field-for-field in lock-step — a drift here
is the most common source of runtime surprises.
:::

## 1 · Backend — model, handler, router

1. Add the request/response models to `apps/api/src/core/schemas.py` (or a
   feature-local schema module, as `brackets.py` does with `BracketCommandRequest`).
2. Add the handler to the owning domain's router file, `apps/api/src/<domain>/<feature>_routes.py` — each domain package owns its
   routers as well as its services (SP-REORG-1 Phase 3):

   ```python
   @router.post("/commands", response_model=TournamentOut, dependencies=[_OPERATOR])
   def submit_bracket_command(body: BracketCommandRequest, ...):
       ...
   ```
3. Register the router in `apps/api/src/core/main.py` if the feature file is new.

### The enforcement seam — non-negotiable for workspace routes

Every route that acts on a workspace resource MUST (SP-CLOUD-2):

1. take the tenant id from a path param named **exactly `tournament_id`** — the
   seam binds to that name; and
2. attach `Depends(require_tournament_access("<viewer|operator|owner>"))`, at
   router level or per route (the `_OPERATOR` dep in the example above is
   exactly this).

The seam answers a **uniform 404** (`TOURNAMENT_NOT_FOUND`) for non-members and
nonexistent ids alike — existence is information; never hand-roll a 403 for
"not yours". A real member with an insufficient *role* gets the same 404. This is not
merely convention: the cross-tenant isolation suite
(`tests/backend/test_tenant_isolation.py`) discovers every `{tournament_id}` operation
from the OpenAPI schema and fails CI if any of them leaks — a new endpoint that
forgets the dependency is caught automatically, with no test to hand-write.

For a **sensitive** action (deleting, exporting a file, issuing or revoking a
link, changing membership or authority) pass `fresh=True` to the same
dependency. After the tenant and role checks, a session whose MFA proof is older
than five minutes gets `401 AUTH_REAUTH_REQUIRED`; the console raises its
verification lock and retries the call once through `withFreshProof`
(`apps/console/src/api/sessionRestore.ts`). Do not gate the JSON reads the
console polls: the lock would reappear every five minutes
([ADR 0033](/explanation/decisions/0033-fresh-proof-scope)).

**Exception: auth-only ceremonies.** `/auth/mfa/*`, `/auth/activity`,
`/auth/reauth-check`, `/auth/node/*` and `POST /auth/login?workspaceId=` run
before any workspace route can, so on an event node they select the workspace
with a `workspaceId` query parameter (or, for `/auth/node/activate`, a body
field) instead of a `tournament_id` path parameter. The selector proves
nothing by itself: `core/dependencies.py` still checks the node cookie's
workspace, the member's operator/owner role, the node id and the active
authority epoch, and `repositories/mfa.py` (`node_scope`) does the same for
activation. They are outside the OpenAPI-derived isolation sweep on purpose;
their denials are pinned in `tests/backend/test_node_operator_mfa_http.py`.
Do not copy this shape for a route that acts on workspace data.

The **only** unauthenticated data plane is the spectator display
(`/display/{token}/*`, resolved by a capability token). Never add public routes
keyed on raw tournament UUIDs.

For a **write** that needs optimistic UI + conflict safety, follow the command
pipeline rather than a bare mutation — carry a client UUID idempotency key and a
`seen_version`. See [Data flow → the command pipeline](/explanation/architecture/data-flow#the-command-pipeline-write-path)
and [Bracket result command queue](/explanation/architecture/bracket-result-queue).

## 2 · Frontend — DTO twin

Add the matching TypeScript types to `apps/console/src/api/dto.ts` (or `apps/console/src/api/bracketDto.ts` for
bracket shapes), matching the Pydantic fields exactly.

## 3 · Frontend — `apiClient` method

Add a method on `ApiClient` in `apps/console/src/api/client.ts`. The axios response interceptor
already turns errors into toasts (with the `X-Request-ID` for bug reports), so you
don't need a try/catch unless you want domain-specific handling:

```ts
async recordBracketResultCommand(tid: string, body: BracketCommandRequest) {
  return this.client.post(`/tournaments/${tid}/bracket/commands`, body);
}
```

## 4 · Frontend — call it from a hook

Components never call `apiClient` directly — **hooks are the seam**. Add or extend
a hook under `apps/console/src/hooks/` (e.g. `useBracketResultQueue`) that owns the
call, the optimistic apply, and the outcome routing.

## 5 · If the endpoint is module-owned, declare it

List the new `apiClient` method in the owning module's
`moduleContract.ownedEndpoints` (or `consumedEndpoints` if another module owns
it). The contract test checks these by **referential identity** to real
`apiClient` methods, so a renamed or removed method fails the build.

## Verify

```bash
# backend (from repo root)
.venv/Scripts/python.exe -m pytest apps/api -q
# frontend
cd apps/console && npx tsc -b && npx vitest run
```

Open the live Swagger UI at `http://localhost:8000/docs` to exercise the route.

## See also

- [How to wire a seam](/how-to/wire-a-seam) — when the endpoint crosses a module boundary
- [API reference](/reference/api/) · [Data flow](/explanation/architecture/data-flow)
