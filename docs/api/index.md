# API reference

The backend is a FastAPI app. The **authoritative, always-current API reference is the Swagger UI**
that FastAPI generates from the running app:

- **Interactive docs (Swagger UI):** <http://localhost:8000/docs> — try requests, see every schema.
- **OpenAPI JSON:** <http://localhost:8000/openapi.json>

(Replace the host/port if you remapped `BACKEND_HOST_PORT`.) The frontend's typed client
(`frontend/src/api/dto.generated.ts`) is generated from this same OpenAPI schema via `make
generate-api`, so it never drifts from the routes. This page documents the thing Swagger does *not*
show: the **route-ownership model** — which architectural module owns which prefix.

The [Signals API](/api/signals) is documented separately because it is the most important
cross-cutting backend feature.

## Route-ownership model

Routes are grouped by the [architectural module](/architecture/system-overview) that owns them.
Every router is registered in `app/main.py` with an auth dependency, **except `invites`**, which is
public-lookup-capable and declares per-endpoint auth itself.

### Meet — the scheduling engine

| Method · Path | Purpose |
| --- | --- |
| `POST /schedule` | solve a schedule (stateless; full problem in body) |
| `POST /schedule/stream` | solve with SSE progress (powers the live HUD) |
| `POST /schedule/validate` | cheap feasibility check for a drag |
| `POST /schedule/warm-restart` | full re-solve biased to keep the current schedule |
| `POST /schedule/repair` | targeted disruption repair (withdrawal, court closure, overrun) |
| `GET /tournaments/{id}/schedule/advisories` | computed advisories (overrun, no-show, …) |
| `POST /tournaments/{id}/schedule/proposals/{warm-restart,repair,manual-edit}` | create a proposal |
| `GET · POST(commit) · DELETE(cancel) …/schedule/proposals/{pid}` | fetch / commit / discard a proposal |
| `GET …/schedule/suggestions`, `POST …/{sid}/{apply,dismiss}` | the suggestions inbox |
| `POST /tournaments/{id}/schedule/director-action` | director time-axis tools |

### Bracket — the draw engine

| Method · Path | Purpose |
| --- | --- |
| `POST · GET · DELETE /tournaments/{id}/bracket` | create / read / clear the bracket |
| `POST …/bracket/schedule-next` | schedule the next ready round |
| `POST …/bracket/results` | record a result (advancement is intra-bracket) |
| `POST …/bracket/match-action` | start / finish / reset a match |
| `POST …/bracket/{validate,pin}` | drag feasibility / re-pin + re-solve |
| `POST …/bracket/import`(+`.csv`), `GET …/bracket/export.{json,csv,ics}` | import / export |
| `POST …/bracket/events/{eid}`(+`/generate`), `DELETE …/bracket/events/{eid}` | event upsert / generate / delete |

### Operations — the live-ops layer (Tier-2)

| Method · Path | Purpose |
| --- | --- |
| `GET …/match-states`, `GET …/match-states/{mid}` | read live state (single returns an `ETag`) |
| `PUT …/match-states/{mid}` | update a match state (requires `If-Match` — optimistic concurrency) |
| `DELETE …/match-states/{mid}` (also requires `If-Match`), `POST …/match-states/reset` | reset one / all |
| `GET …/match-states/export/download`, `POST …/match-states/import/{upload,bulk}` | export / import |
| `POST /tournaments/{id}/commands` | apply/reject an idempotent operator command |

### Control plane — workspace CRUD + collaboration

| Method · Path | Purpose |
| --- | --- |
| `GET · POST /tournaments` | list (with [signals](/api/signals)) / create a workspace |
| `GET · PATCH · DELETE /tournaments/{id}` | summary / update / delete |
| `GET · PUT /tournaments/{id}/state` | the persisted workspace state blob |
| `GET …/state/backups`, `POST …/state/backup`, `POST …/state/restore/{file}` | snapshots |
| `GET /tournaments/{id}/modules`, `PATCH …/modules/{moduleId}` | the `workspace_modules` API |
| `POST · GET /tournaments/{id}/invites`, `GET /tournaments/{id}/members` | create / list invites (owner-gated) + list members |
| `GET /invites/{token}` (public) · `POST /invites/{token}/accept` (auth) · `DELETE /invites/{token}` (owner, revoke) | resolve / accept / revoke an invite link |

## Conventions

- **Request id** — every request carries an `X-Request-ID` (echoed into error bodies for bug reports).
- **Error codes** — all `HTTPException`s go through `error_codes.http_error(...)`, so error responses
  carry a stable `code` (e.g. `MODULE_DEPENDENCY_UNMET`, `MODULE_HAS_DATA`) the frontend branches on.
- **Optimistic concurrency** — match-state writes use `ETag` / `If-Match`; the command pipeline uses
  the `matches.version` check. See [Data flow](/architecture/data-flow#the-command-pipeline-write-path).
- **Auth** — all routers require auth except the public invite lookup and the public `/display`-fed
  reads (which go through Supabase in cloud mode).

For the route-to-module rationale see [Backend structure](/architecture/backend-structure#route-ownership).
