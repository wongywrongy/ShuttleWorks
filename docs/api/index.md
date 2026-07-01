# API reference

The backend is a FastAPI app (`products/scheduler/backend`). The **authoritative,
always-current API reference is the Swagger UI** that FastAPI generates from the running app —
this page documents the thing Swagger does *not* show: the **route-ownership model**, which
architectural module owns which prefix, and the cross-cutting conventions every route shares.
It is for backend and frontend engineers wiring or consuming a route.

- **Interactive docs (Swagger UI):** <http://localhost:8000/docs> — try requests, see every schema.
- **OpenAPI JSON:** <http://localhost:8000/openapi.json>

(Replace the host/port if you remapped `BACKEND_HOST_PORT`.) The frontend's typed client
(`frontend/src/api/dto.generated.ts`) is generated from this same OpenAPI schema, so it never
drifts from the routes.

The [Signals API](/api/signals) is documented separately because it is the most important
cross-cutting backend feature.

## Base URL

The frontend resolves the API base URL as (`frontend/src/api/README.md`):

```ts
import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? '/api' : 'http://localhost:8000')
```

In dev the Vite proxy rewrites `/api/*` to the FastAPI container; in production the nginx config
does the same against the FastAPI service. Paths below are written without the base.

## Route-ownership model

Routes are grouped by the [architectural module](/architecture/system-overview) that owns them.
Every router is registered in `app/main.py` under a single auth dependency (`get_current_user`),
**except `invites`**, which is registered without it so its public resolve endpoint stays
unauthenticated and declares per-endpoint auth itself. The route → module rationale lives in
[Backend structure](/architecture/backend-structure#route-ownership).

### Meet — the scheduling engine

Owns `/schedule*` plus the per-workspace proposal / advisory / suggestion routes. The bare
`/schedule*` solves are **stateless** — the full problem travels in the request body and they are
not tournament-scoped; everything under `/tournaments/{id}/schedule/*` operates on persisted state.

| Method · Path | Purpose |
| --- | --- |
| `POST /schedule` | solve a schedule (stateless; full problem in body) |
| `POST /schedule/stream` | solve with SSE progress (powers the live HUD) |
| `POST /schedule/validate` | cheap feasibility check for a drag |
| `POST /schedule/warm-restart` | full re-solve biased to keep the current schedule |
| `POST /schedule/repair` | targeted disruption repair (withdrawal, court closure, overrun) |
| `GET /tournaments/{id}/schedule/advisories` | computed advisories (overrun, no-show, …) |
| `POST …/schedule/proposals/{warm-restart\|repair\|manual-edit}` | create a proposal |
| `GET · DELETE …/schedule/proposals/{pid}` | fetch / discard a proposal |
| `POST …/schedule/proposals/{pid}/commit` | commit a proposal (optimistic-concurrency-checked) |
| `GET …/schedule/suggestions` | the suggestions inbox |
| `POST …/schedule/suggestions/{sid}/{apply\|dismiss}` | apply / dismiss a suggestion |
| `POST …/schedule/director-action` | director time-axis tool → proposal |

### Bracket — the draw engine

Owns every `/tournaments/{id}/bracket/*` route (router prefix
`/tournaments/{tournament_id}/bracket`). Advancement is intra-bracket — recording a result advances
the draw inside the same module.

| Method · Path | Purpose |
| --- | --- |
| `POST · GET · DELETE …/bracket` | create / read / clear the bracket |
| `POST …/bracket/events/{eid}` | upsert one event (forced to `draft`) |
| `POST …/bracket/events/{eid}/generate` | generate the draw for an event |
| `DELETE …/bracket/events/{eid}` | delete a `draft` event |
| `POST …/bracket/schedule-next` | solve the next ready round (batch) |
| `POST …/bracket/schedule-next/stream` | solve next round with SSE progress + candidate pool |
| `POST …/bracket/schedule-next/commit` | persist the operator-chosen candidate's assignments |
| `POST …/bracket/results` | record a result (advancement is intra-bracket) |
| `POST …/bracket/commands` | record a result via an **idempotent command** (Run surface) |
| `POST …/bracket/match-action` | start / finish / reset a match |
| `POST …/bracket/validate` | drag feasibility check (no solver) |
| `POST …/bracket/pin` | re-pin one match + re-solve around it |
| `POST …/bracket/assign` | **non-solver** direct court+slot placement (Run surface) |
| `POST …/bracket/unassign` | **non-solver** return-to-queue |
| `POST …/bracket/import`(+`.csv`) | import a pre-paired bracket |
| `GET …/bracket/export.{json,csv,ics}` | snapshot / order-of-play CSV / iCalendar feed |

:::info `/bracket/commands` vs `/bracket/results`
Both record a result and advance the draw. `POST /bracket/commands`
([`submit_bracket_command`](/architecture/bracket-result-queue)) carries a client-generated `id`
used as an idempotency key — resubmitting the same id returns `200` with the current snapshot
without re-running advancement, and its replay check runs **before** the `seen_version` guard so an
at-least-once redelivery never 409s on a stale version. `/bracket/results` is the simpler,
non-idempotent write. `/bracket/assign` + `/bracket/unassign` are the non-solver analogs the live
Operations Run surface uses to place / queue bracket matches by hand. See
[ADR 0007](/decisions/0007-bracket-result-command-queue).
:::

### Operations — the live-ops layer (Tier-2)

Owns the match-state reads/writes and the operator command log. Operations is a Tier-2
architectural module with no enable flag.

| Method · Path | Purpose |
| --- | --- |
| `GET …/match-states` | all live states (`{matchId: MatchStateDTO}`) |
| `GET …/match-states/{mid}` | one live state; response carries `ETag: "<version>"` |
| `PUT …/match-states/{mid}` | update one state (requires `If-Match`; `412` on stale/missing) |
| `DELETE …/match-states/{mid}` | reset one state (also requires `If-Match`) |
| `POST …/match-states/reset` | reset all states |
| `GET …/match-states/export/download` | download all states as a JSON file |
| `POST …/match-states/import/upload` | import states from an uploaded JSON file |
| `POST …/match-states/import-bulk` | merge a `{matchId: MatchStateDTO}` body |
| `POST /tournaments/{id}/commands` | apply / reject an idempotent operator command |

### Display — no routes

Display owns **no backend route**. Its surfaces are poll-only: they read existing endpoints
(`GET …/state`, `GET …/match-states`, `GET …/bracket`) owned by other modules and react to live
match-state changes via an independent poll (see `platform/contracts/moduleContract.ts`).

### Control plane — workspace CRUD + collaboration

The `tournaments`, `workspace_modules`, and `invites` routers. `/state` is **shared, not owned** —
it co-lives with control-plane CRUD in the tournaments router and is consumed by Meet (solve input)
and Display (preview source).

| Method · Path | Purpose |
| --- | --- |
| `GET · POST /tournaments` | list (with [signals](/api/signals)) / create a workspace |
| `GET · PATCH · DELETE /tournaments/{id}` | summary / update / delete |
| `GET · PUT /tournaments/{id}/state` | the persisted workspace-state blob (shared) |
| `GET …/state/backups`, `POST …/state/backup`, `POST …/state/restore/{file}` | snapshots |
| `POST /tournaments/{id}/plan-finalized` | toggle the persisted `planFinalized` flag (Run surface) |
| `GET /tournaments/{id}/modules`, `PATCH …/modules/{moduleId}` | the `workspace_modules` control plane |
| `POST · GET /tournaments/{id}/invites`, `GET …/members` | create / list invites (owner-gated) + list members |
| `GET /invites/{token}` (public) · `POST …/accept` (auth) · `DELETE …/{token}` (owner, revoke) | resolve / accept / revoke an invite link |

### Cross-module consumers

Ownership above says who *serves* a route; this says who *calls* it across a module
boundary. It is the read-side of the [seam contracts](/contracts/), derived from
`operationsContract` / `displayContract` / `meetContract`'s `consumedEndpoints` in
`platform/contracts/moduleContract.ts` — Swagger shows neither. Only the routes that
are read by a module other than their owner appear here.

| Endpoint (owner) | Also consumed by | Why · criticality |
| --- | --- | --- |
| `GET …/match-states` (**Operations**) | **Meet**, **Display** | Meet reads live status as a **solve input** (a re-plan must pin `locked` matches); Display renders it on the public TV. Read-only both ways. |
| `GET …/bracket` (**Bracket**) | **Operations**, **Display** | Operations lays out bracket-origin live matches ([Seam B](/contracts/bracket-operations)); Display renders bracket events. ~2.5 s poll; self-healing. |
| `GET · PUT …/state` (**Control plane**, shared) | **Meet**, **Display** | Meet reads `/state` as a solve input; Display draws the static layout from it. Shared, **not** owned by any engine. |

Everything else is called only by its owning module (Bracket consumes nothing
cross-module; `consumedEndpoints = []`). Display owns no route and only consumes,
which is why it appears as a consumer everywhere and an owner nowhere.

### Health probes — unauthenticated

| Method · Path | Purpose |
| --- | --- |
| `GET /health` | shallow liveness (the container is up) |
| `GET /health/deep` | deep readiness — data dir writable **and** CP-SAT solver importable |

## Operator command vocabulary

`POST /tournaments/{id}/commands` takes a wire-format `action` string; the processor maps it to a
target `MatchStatus` (`app/constants.py`, `ACTION_TO_TARGET_STATUS`) and verifies the transition is
legal from the *current* status — the caller never names `next_status` directly.

| `action` | Transition | Notes |
| --- | --- | --- |
| `call_to_court` | scheduled → called | |
| `start_match` | called → playing | |
| `finish_match` | playing → finished | |
| `retire_match` | playing → retired | |
| `uncall` | called → scheduled | |
| `assign_court` | → scheduled | **non-solver**: set `court_id` + `time_slot` (self-transition when already scheduled) |
| `postpone_match` | → scheduled | **non-solver**: clear `court_id` + `time_slot` |

The bracket's `POST /bracket/commands` is a parallel idempotent command whose only `kind` today is
`"record_result"`.

## Conventions

- **Request id** — every request carries an `X-Request-ID` (honoured from the incoming header or
  minted as a uuid4 by `request_id_middleware`), echoed on the response and into error bodies for
  bug reports.
- **Error codes** — `HTTPException`s built via `error_codes.http_error(...)` carry a structured
  `{code, message}` body. `ErrorCode` (in `app/error_codes.py`) is the authoritative list the
  frontend branches on (e.g. `MODULE_DEPENDENCY_UNMET`, `MODULE_HAS_DATA`,
  `SCHEDULE_VERSION_CONFLICT`, `BACKUP_NOT_FOUND`). Legacy bare-string `detail` still works — the
  axios interceptor falls back to treating `detail` as the message.
- **Optimistic concurrency** — two families:
  - *Match-state writes* use `ETag` / `If-Match`. A `GET …/match-states/{mid}` returns
    `ETag: "<matches.version>"` (`"0"` for an unseen match); `PUT` / `DELETE` must send a matching
    `If-Match` or get `412 Precondition Failed`.
  - *The command pipeline* and *bracket result writes* carry `seen_version`; a mismatch raises a
    `ConflictError` → `409` with `error: "stale_version"`. An illegal state-machine transition is
    `409` with `error: "conflict"`. See
    [Data flow](/architecture/data-flow#the-command-pipeline-write-path).
- **Auth** — every router requires a Supabase JWT (`get_current_user`) **except** the public invite
  resolve (`GET /invites/{token}`) and the `/health` probes. Display has no routes; in cloud mode
  its poll-only reads can be served through Supabase.
- **SSE** — `POST /schedule/stream` and `POST /bracket/schedule-next/stream` return
  `text/event-stream`. Each `data:` line is one JSON event:
  `model_built` → `phase` (`presolve`→`search`→`proving`) → `progress` (per intermediate solution)
  → `complete` → `done` (always last; the terminator), or `error`. The frontend opens these with
  `EventSource`, not axios.

## See also

- [Signals API](/api/signals) — the per-workspace summary on `GET /tournaments`
- [Backend structure](/architecture/backend-structure#route-ownership) — the route-to-module rationale
- [Data flow](/architecture/data-flow#the-command-pipeline-write-path) — the command write path
- [Bracket result queue](/architecture/bracket-result-queue) and [ADR 0007](/decisions/0007-bracket-result-command-queue) — the `/bracket/commands` design
- [Operations module](/modules/operations) — the Run surface that drives the command + non-solver routes
- [How to add an API endpoint](/how-to/add-an-api-endpoint)
