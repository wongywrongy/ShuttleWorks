# api/

The HTTP boundary. Two files:

- `client.ts` — singleton axios client with toast/error plumbing and
  one method per backend route.
- `dto.ts` — TypeScript twins of the API models in
  `apps/api/src/core/schemas.py`. **Keep them in lock-step.**

## Base URL

```ts
import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? '/api' : 'http://localhost:8000')
```

In dev the Vite proxy rewrites `/api/*` to the FastAPI container. In
production the nginx config does the same against the FastAPI service.

## Error handling

The axios response interceptor (in `client.ts`) does three things:

1. **Cancellations** (`axios.isCancel` / `ERR_CANCELED`) re-throw
   silently — they are user-initiated and should not produce a toast.
2. **Real errors** are turned into a sticky toast via
   `useUiStore.getState().pushToast`, with the request id pulled from
   the `X-Request-ID` response header so a user can paste it into a
   bug report.
3. The original error still throws so the caller can branch on it.

When adding a method, just call `this.client.<verb>(...)`. The
interceptor wraps everything; you don't need to try/catch unless you
want to add domain-specific handling on top.

## Adding an endpoint

1. Add the request/response types to `dto.ts`. Match the Pydantic
   model field-for-field.
2. Add a method on `ApiClient` in `client.ts`.
3. Call it from the relevant feature hook in `apps/console/src/hooks/`.
4. Mirror it in the relevant router under `apps/api/src/` and register
   that router from `apps/api/src/core/main.py`.

## SSE

One live streaming route:
`POST /tournaments/{id}/bracket/schedule-next/stream`, called by
`scheduleNextBracketRoundWithProgress` in `client.ts`.

It uses `fetch` with a `ReadableStream` reader and manual `\n\n` frame
splitting — **not** `EventSource`, which cannot issue a POST and cannot
carry the CSRF header. Errors are surfaced through the toast plumbing
manually, since the axios interceptor never sees these calls.

Any new SSE route must set `X-Accel-Buffering: no` on its
`StreamingResponse`. That header is what keeps nginx from buffering the
stream in the Docker deployment; there is no per-path exemption in
`nginx.conf` to fall back on.

(The old meet-side `/schedule/stream` answers 410 — the batch solve
moved to the job rail. It was an `EventSource` flow, which is where this
paragraph's earlier description came from.)
