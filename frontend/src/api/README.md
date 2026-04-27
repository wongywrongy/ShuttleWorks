# api/

The HTTP boundary. Two files:

- `client.ts` — singleton axios client with toast/error plumbing and
  one method per backend route.
- `dto.ts` — TypeScript twins of every Pydantic model in
  `backend/app/schemas.py`. **Keep them in lock-step.**

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
   `useAppStore.getState().pushToast`, with the request id pulled from
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
3. Call it from the relevant feature hook in `frontend/src/hooks/`.
4. Mirror on the backend in `backend/api/<feature>.py` and register
   the router in `backend/app/main.py`.

## SSE

`/schedule/stream` uses an `EventSource` opened directly in
`useSchedule.ts` rather than going through axios — the axios client
doesn't fit streaming responses. Errors there are surfaced via the same
toast plumbing manually.
