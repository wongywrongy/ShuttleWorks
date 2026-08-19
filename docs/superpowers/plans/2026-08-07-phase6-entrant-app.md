# Phase 6 — Entrant Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the throwaway FastAPI HTML entrant surface with a real React Router 7 SSR application served same-origin with the API, shipping the signup/login pages that no human can reach today.

**Architecture:** One public hostname. nginx routes `/` to the operator SPA, `/e/…` to a new node SSR tier, and `/e/api/…`, `/e/account/…`, `/api/…` to FastAPI. The node tier renders and never relays credentials — every entrant *write* goes browser → nginx → FastAPI directly, so the CSRF header keeps proving "a same-origin browser sent this" instead of degrading to "a node process asked". The path-based CSRF exemption is deleted, not ported, and replaced by a second enumerated proof channel.

**Tech Stack:** React Router 7.15 (framework mode, SSR) · React 19 · Vite 7 · Tailwind via the design system's CommonJS preset · vitest (`environment: 'node'`, root-hoisted) · FastAPI + SQLAlchemy · nginx · Docker Compose · Playwright (dual-width evidence).

**Spec:** `docs/superpowers/specs/2026-08-07-phase6-entrant-app-design.md` — read it before Task 1. It is the contract; where this plan and the spec disagree, STOP and report rather than picking one silently.

**Branch:** `dev/prog1-p6-entrant-app`.

## Global Constraints

Every task's requirements implicitly include this section.

- **Rulings are binding, not up for relitigation.** R8: React Router 7 framework mode — this spends SP-PROGRAM-1 rule 4's single sanctioned new-dependency exception, so **no other new runtime dependency without a STOP**. R8-A: same origin as the API; no `play.*` subdomain; `session_cookie_domain` is not widened. R8-B: two CSRF proof channels (header **or** cookie-derived double-submit), so an unhydrated form still submits. R8-C: the R14 fee quote is session-gated.
- **Amendment A1 is absolute.** Nothing touches the Cloudflare dashboard, DNS, tunnel config or Access. cloudflared ingress stays pointed at `frontend:8080`. Compose and nginx changes are written and validated locally only (`docker compose config`, `nginx -t`).
- **Email is out of scope entirely** (Phase 6 step 3, deferred by ruling). No SMTP seam, provider, DNS or templates. The exit gate's "a real verification-class email lands in a real inbox" clause stays open and is recorded as deferred, not met.
- **TDD, always:** failing test → watch it fail → minimal implementation → watch it pass → commit.
- **Every security-relevant behaviour owes a negative control** (CODE_HEALTH 3b): a test that fails when the protection is removed. A control that cannot be broken is vacuous and does not count.
- **Every edited or deleted existing test is named in its own commit message**, with the ruling that supersedes it. A test failing because the implementation regressed is a bug, not an unwind — if you cannot name the ruling, **STOP**.
- **Out-of-scope debt goes to `docs/audits/debt-log.md`**, not into this branch and not silently ignored.
- **Test counts only go up.** Frontend: `npm --prefix products/scheduler/frontend run test:run`. Entrant: `npm --prefix products/scheduler/entrant run test:run`. Backend: `cd products/scheduler && pytest` (rootdir is `products/scheduler`; `asyncio_mode = strict`). All gates: `make check`.
- **vitest must stay hoisted to the root `node_modules`** (CLAUDE.md hazard) — it is deliberately absent from the entrant package's dependencies.
- **Backend list queries need a stable tiebreaker** (`created_at DESC, id DESC`) — `id` is a random UUID and `created_at` alone ties non-deterministically across SQLite and Postgres.
- **Assert route existence via `app.openapi()["paths"]`, not `app.routes`** — newer FastAPI keeps each `include_router` as a nested `_IncludedRouter`.
- **Playwright screenshots must pass an explicit `filename: ".playwright-mcp/<name>.png"`** — a bare filename litters the repo root.
- **F-E1 stays open** (spec §9.3, entry events map onto a Meet division not a slot). Do not patch it ad hoc.

## Task Map

| Tasks | Group | Deliverable |
|---|---|---|
| 1–3 | Scaffold | `products/scheduler/entrant/` running SSR, tailwind + design system, CI wiring |
| 4–7 | CSRF core | shared `_form_csrf`, `sw_play_csrf` cookie, the second proof channel, the body-replay fix |
| 8–12b | Backend routes | `/e/api/page`, `/e/api/config`, `/e/api/quote`, `/e/api/submit`, `/e/api/entries`, urlencoded account routes |
| 13 | Replay fix | account-scope `submissions.replay` — a guessed key must not return another entrant's receipt |
| 14–18 | Entry flow | the entry page, the form, the quote round-trip, loader-minted idempotency key, the receipt route |
| 19–21 | Account pages | signup / login / logout — the F-E1-2-E1 closure |
| 21b | Local launch | `make entrant-dev` / `make local-dev`, the port map, the Docker-stack trap |
| 25–27 | SEO | meta/OG from the loader, cached sitemap, robots.txt, the measured page-weight gate |
| 22–24 | Deployment | nginx locations + the cookie `map`, the `entrant` compose service, env, node 22 |
| 28–32 | Cutover | retire the HTML routes + delete the exemption (one commit), migrate ~90 tests, R11 evidence, ledgers |

## Execution order (amended by the owner, 2026-08-07)

Build and prove everything **locally** first; anything internet-facing goes last. The task table above is renumbered in execution order: **1-3, 4-7, 8-13, 14-18, 19-21, 21b, 25-27, 22-24, 28-32**. Deployment (22-24) moved from the middle to the end.

**One dependency that constrains how late deployment can go, stated rather than discovered:** the cutover (28-32) deletes the FastAPI HTML routes that currently serve `/e/{slug}`. In the Docker stacks, `location /e/` still points at the backend until Task 22 repoints it at the `entrant` service. So 22-24 must land **before** 28-32, or the containerised stacks serve a 404 at the entrant page between the two. Local development is unaffected either way — the dev servers do not go through nginx. Deployment is therefore last-but-one, not last.

**Ordering dependency worth reading twice:** the CSRF exemption (Task 4–7 group) **cannot be deleted while the old HTML route lives**, so its deletion lands in the cutover commit (Task 28–32 group), not in its own group. There is no two-implementation window.

---

### Task 1: Scaffold the entrant workspace as a running React Router 7 SSR app

**Files:**
- Create: `products/scheduler/entrant/package.json`
- Create: `products/scheduler/entrant/.gitignore`
- Create: `products/scheduler/entrant/vitest.config.ts`
- Create: `products/scheduler/entrant/react-router.config.ts`
- Create: `products/scheduler/entrant/vite.config.ts`
- Create: `products/scheduler/entrant/tsconfig.json`
- Create: `products/scheduler/entrant/app/root.tsx`
- Create: `products/scheduler/entrant/app/routes.ts`
- Create: `products/scheduler/entrant/app/entry.server.tsx`
- Create: `products/scheduler/entrant/app/routes/health.tsx`
- Modify: `package.json:6-9` (workspaces array)
- Test: `products/scheduler/entrant/tests/health.test.ts`

**Interfaces:**
- Consumes: nothing (first task in the range).
- Produces:
  - workspace `products/scheduler/entrant`, package name `entrant`, `"type": "module"`
  - `products/scheduler/entrant/app/routes.ts` default export: `RouteConfig` — later tasks add routes here
  - `react-router.config.ts` exports `{ ssr: true, appDirectory: 'app', basename: '/e/' } satisfies Config` — every entrant URL is `/e/…` (spec §2)
  - the test helper idiom `fetchEntrant(path: string): Promise<Response>` — build a request handler over `virtual:react-router/server-build` from a middleware-mode Vite server; every later request-level test copies this shape
  - scripts consumed by Task 3 and root wiring: `dev`, `build`, `start`, `typecheck`, `test`, `test:run`

**Why these versions.** Verified against the repo, not guessed: root `node_modules/react-router` is already **7.15.0** (hoisted via `products/scheduler/frontend`'s `react-router-dom@^7.13.0`), and `@react-router/dev@7.15.0`, `@react-router/node@7.15.0`, `@react-router/serve@7.15.0` are published (`npm view` confirmed). React Router 8.3.0 exists but R8 says **React Router 7**, so pin `^7.15.0` and stay on the version the monorepo already resolves. React/TypeScript/Vite/@types pins mirror `products/scheduler/frontend/package.json:31-64` exactly, and `@types/react`/`@types/react-dom` are additionally forced by root `package.json:10-13` overrides.

**vitest is deliberately NOT a dependency here.** CLAUDE.md "Known hazards": vitest must stay hoisted to the **root** `node_modules` (root `package.json:32` has `vitest: ^3.2.6`). npm puts every ancestor `node_modules/.bin` on PATH for a workspace script, so `vitest run` resolves from the root install, and `import { defineConfig } from 'vitest/config'` resolves by walking up. Spec §8 states this explicitly: "the same runner, already hoisted to the root `node_modules` per the CLAUDE.md hazard, so no new test dependency."

- [ ] **Step 1: Write the failing test**

Create the package manifest, the workspace registration, the vitest config, and the test. Nothing under `app/` yet — that is the implementation.

`products/scheduler/entrant/package.json`:
```json
{
  "name": "entrant",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@react-router/node": "^7.15.0",
    "@react-router/serve": "^7.15.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router": "^7.15.0"
  },
  "devDependencies": {
    "@react-router/dev": "^7.15.0",
    "@types/node": "^24.10.10",
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "typescript": "~5.9.3",
    "vite": "^7.2.4"
  }
}
```

`products/scheduler/entrant/.gitignore`:
```gitignore
node_modules

# React Router framework-mode outputs. `build/` is already matched by the
# repo-root .gitignore; `.react-router/` (typegen output for the `+types`
# imports) is not, and is regenerated by `npm run typecheck` / `build`.
build
.react-router
*.local
```

Root `package.json` — add the workspace (this is the `:6-9` edit):
```json
  "workspaces": [
    "packages/*",
    "products/scheduler/frontend",
    "products/scheduler/entrant"
  ],
```

`products/scheduler/entrant/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

// Deliberately NOT the app's vite.config.ts: that one carries the React Router
// plugin, and the tests boot their own middleware-mode Vite server so a request
// goes through the real plugin pipeline (see tests/health.test.ts).
//
// `environment: 'node'` per spec §8 — these are request-level integration tests
// (request in, response out, no internal mocking), mirroring the backend's
// pytest + TestClient shape. There is no DOM to emulate on the server tier.
//
// vitest itself is resolved from the ROOT node_modules (CLAUDE.md hazard: it
// must stay hoisted there); it is intentionally absent from this package.json.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The first ssrLoadModule pays cold dependency-optimization cost — measured
    // at ~40s on a cold cache, ~2s warm. The default 5s timeout fails CI on the
    // first run only, which is the worst kind of flake.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
```

`products/scheduler/entrant/tests/health.test.ts`:
```ts
import { afterAll, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

// One Vite server per test file, middleware mode, no HTTP listener. The React
// Router plugin publishes the whole app as the virtual module below, so this
// exercises the real routes.ts + entry.server.tsx + loaders — not a hand-built
// stand-in.
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function fetchEntrant(path: string): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(new Request(`http://entrant.test${path}`));
}

test('GET /e/health renders server-side', async () => {
  const res = await fetchEntrant('/e/health');
  expect(res.status).toBe(200);

  const body = await res.text();
  // Asserted on the SERVER response, before any hydration: this is the no-JS
  // posture of spec §7 held to the wall from the first commit.
  expect(body).toContain('<h1 data-testid="entrant-health">entrant tier is up</h1>');
  expect(body).toContain('<p data-testid="entrant-tier">entrant</p>');
});

test('the app is mounted under the /e/ basename, not at the root', async () => {
  // nginx routes /e/ to this tier (spec §2). A route reachable at "/health"
  // would mean the basename is not applied and every link the app emits would
  // point outside its own prefix.
  const res = await fetchEntrant('/health');
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm install
npm --prefix products/scheduler/entrant run test:run
```
(`npm install` from the repo root — it links the new workspace and updates the root `package-lock.json`, which is committed in Step 5.)

Expected: FAIL with
```
Error: Failed to load url virtual:react-router/server-build (resolved id: virtual:react-router/server-build). Does the file exist?
```
— there is no `vite.config.ts` registering `reactRouter()`, so the virtual server build does not exist. Both tests fail on this same error.

- [ ] **Step 3: Write minimal implementation**

`products/scheduler/entrant/react-router.config.ts`:
```ts
import type { Config } from '@react-router/dev/config';

/**
 * The entrant tier is served under one public hostname at the `/e/` prefix
 * (spec §2, ruling R8-A). nginx does longest-prefix routing, so `/e/api/` and
 * `/e/account/` reach FastAPI and everything else under `/e/` falls through to
 * this node process. Declaring the basename here means every URL this app
 * generates already carries the prefix — links do not have to remember it.
 */
export default {
  ssr: true,
  appDirectory: 'app',
  basename: '/e/',
} satisfies Config;
```

`products/scheduler/entrant/vite.config.ts`:
```ts
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter()],
});
```

`products/scheduler/entrant/tsconfig.json`:
```json
{
  "include": ["app/**/*.ts", "app/**/*.tsx", "tests/**/*.ts", ".react-router/types/**/*"],
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": ["node", "vite/client"],
    "rootDirs": [".", "./.react-router/types"],
    "moduleDetection": "force",
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "skipLibCheck": true,

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  }
}
```
(Single project, no `tsc -b` references: the frontend needs two projects because `vite.config.ts` is typechecked separately; here `react-router typegen` writes `.react-router/types`, which `rootDirs` maps onto the `./+types/x` imports.)

`products/scheduler/entrant/app/routes.ts`:
```ts
import { type RouteConfig, route } from '@react-router/dev/routes';

/**
 * Explicit route config, not file-system conventions. The entrant surface is
 * small and its URL shapes are load-bearing (spec §5: /{slug},
 * /{slug}/receipt/{submissionId}, /account/{signup,login,logout}) — they read
 * better declared in one place than encoded in filenames.
 */
export default [route('health', 'routes/health.tsx')] satisfies RouteConfig;
```

`products/scheduler/entrant/app/root.tsx`:
```tsx
import { Links, Meta, Outlet, Scripts } from 'react-router';

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
```

`products/scheduler/entrant/app/entry.server.tsx`:
```tsx
import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext } from 'react-router';

/**
 * Web-streams renderer, not `renderToString`. `<ServerRouter>` wraps its
 * payload in a Suspense boundary, and renderToString does not support Suspense
 * — it silently degrades to client-only rendering and ships a shell with no
 * content in it, which is exactly the SEO/no-JS failure spec §7 forbids.
 *
 * `await stream.allReady` holds the response until the whole tree has
 * resolved, so the HTML that leaves this process is complete.
 */
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  const stream = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    { signal: request.signal },
  );
  await stream.allReady;

  responseHeaders.set('Content-Type', 'text/html');
  return new Response(stream, { status: responseStatusCode, headers: responseHeaders });
}
```

`products/scheduler/entrant/app/routes/health.tsx`:
```tsx
import type { Route } from './+types/health';

export function loader() {
  return { tier: 'entrant' };
}

export default function Health({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <h1 data-testid="entrant-health">entrant tier is up</h1>
      <p data-testid="entrant-tier">{loaderData.tier}</p>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix products/scheduler/entrant run test:run
npm --prefix products/scheduler/entrant run typecheck
```
Expected: PASS — `Test Files 1 passed (1) / Tests 2 passed (2)`, and `typecheck` exits 0 (it runs `react-router typegen` first, which generates `.react-router/types/app/routes/+types/health.d.ts` for the `Route.ComponentProps` import).

Note: the basename test logs a React Router error-boundary stack to stderr while returning 404. That output is expected and does not fail the run.

- [ ] **Step 5: Commit**
```bash
git add products/scheduler/entrant package.json package-lock.json
git commit -m "feat(entrant): scaffold the entrant SSR app as a workspace package

React Router 7.15.0 in framework mode (ruling R8), mounted at the /e/
basename (R8-A: one public hostname, nginx longest-prefix routes /e/api/
and /e/account/ to FastAPI). A request-level vitest test drives the real
virtual:react-router/server-build through createRequestHandler, so the
first commit ships a running SSR tier rather than config alone.

vitest is intentionally absent from the package's dependencies: it stays
hoisted to the root node_modules per the CLAUDE.md hazard, exactly as
spec 2026-08-07-phase6-entrant-app-design.md section 8 requires.

entry.server.tsx uses renderToReadableStream, not renderToString:
<ServerRouter> renders inside a Suspense boundary, and renderToString
aborts server rendering on Suspense and falls back to client-only HTML —
a silent failure of the no-JS posture in section 7."
```

---

### Task 2: Consume the design system — CommonJS Tailwind preset, tokens, and an SSR-rendered primitive

**Files:**
- Create: `products/scheduler/entrant/tailwind.config.js`
- Create: `products/scheduler/entrant/postcss.config.js`
- Create: `products/scheduler/entrant/app/app.css`
- Modify: `products/scheduler/entrant/package.json:17-31` (dependencies + devDependencies)
- Modify: `products/scheduler/entrant/vite.config.ts:1-8` (add `ssr.noExternal`)
- Modify: `products/scheduler/entrant/app/root.tsx:1-9` (stylesheet `links` export)
- Modify: `products/scheduler/entrant/app/routes/health.tsx:1-15` (render a design-system `Button`)
- Test: `products/scheduler/entrant/tests/design-system.test.ts`

**Interfaces:**
- Consumes (from Task 1): the `entrant` workspace; `fetchEntrant(path: string): Promise<Response>` idiom; `app/root.tsx` default export; `app/routes/health.tsx` `loader()` returning `{ tier: string }`.
- Produces:
  - `app/app.css` — the single stylesheet entry (`@import '@scheduler/design-system/tokens.css'` + `globals.css` + the three `@tailwind` directives), linked from `root.tsx` via `export const links: LinksFunction`
  - `tailwind.config.js` — `presets: [require('@scheduler/design-system/tailwind-preset')]` with content globs that include the design-system source
  - `vite.config.ts` gains `ssr: { noExternal: ['@scheduler/design-system'] }` — every later task that imports a design-system component depends on this
  - established: entrant components import primitives from `@scheduler/design-system/components`

**Two traps, both verified against the real files.**

1. `packages/design-system/package.json:6` sets `"type": "module"`, so a plain Node `require('@scheduler/design-system/tailwind-preset')` returns `{}` — the `module.exports = {` at `tailwind-preset.js:24` is dead under ESM. It works only because Tailwind v3 loads its config through **jiti**, which evaluates the file as CommonJS. So the preset must be proved through Tailwind's own loader (which the test below does), never through a bare `createRequire`. This is why the frontend's `tailwind.config.js:2` `require()` inside a `"type": "module"` package is correct and not a bug.
2. The design system ships **raw `.tsx` source** (`package.json:8-16` exports map points at `./components/index.ts`), so Vite's SSR build must transpile it instead of externalizing the bare import — spec §5: "Because the package ships source, the SSR bundler must transpile it."

The barrel at `packages/design-system/components/index.ts` re-exports `Modal`, which spec §5 calls browser-only. Importing it is safe (`Modal.tsx` touches `document`/`window` only inside `useEffect`, lines 54-95); **using** it is what Phase 6 forbids. The barrel also pulls `@phosphor-icons/react` (`Notice.tsx:2`, `TextField.tsx:27`, `Hint.tsx:21`, `Select.tsx:21`, `Toast.tsx:16`), which is a *peer* dependency of the design system — so the entrant package must declare it.

- [ ] **Step 1: Write the failing test**

`products/scheduler/entrant/tests/design-system.test.ts`:
```ts
import { afterAll, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function fetchEntrant(path: string): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(new Request(`http://entrant.test${path}`));
}

test('the Tailwind config loads the design-system CommonJS preset and scans its source', async () => {
  // Run Tailwind exactly as the build does — through its own jiti-backed config
  // loader. A bare Node require() of the preset returns {} because the
  // design-system package is "type": "module" while tailwind-preset.js:24 is
  // CommonJS; only Tailwind's loader evaluates it correctly.
  const result = await postcss([tailwindcss({ config: './tailwind.config.js' })]).process(
    '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n',
    { from: undefined },
  );

  // `bg-brand` and `shadow-glow` appear ONLY inside the design system's
  // Button.tsx (`variant="brand"`), never in this package's own source. If the
  // preset stopped loading, `shadow-glow` would not exist as a utility at all;
  // if the design-system content glob were dropped, neither class would be
  // emitted. Both are the failure mode CLAUDE.md's tailwind.config.js comment
  // describes: "any class used ONLY inside a shared component silently no-ops."
  expect(result.css).toContain('.bg-brand');
  expect(result.css).toContain('.shadow-glow');
});

test('a design-system primitive renders under SSR with the stylesheet linked', async () => {
  const res = await fetchEntrant('/e/health');
  expect(res.status).toBe(200);

  const body = await res.text();
  expect(body).toMatch(/<link rel="stylesheet" href="[^"]*app\.css[^"]*"\s*\/?>/);
  // Real server-rendered markup from @scheduler/design-system/components.
  // Proves the bundler transpiled the package's .tsx source instead of
  // externalizing it, and that the primitive is SSR-safe (spec §5).
  expect(body).toContain('>design system</button>');
  expect(body).toContain('bg-brand');
  expect(body).toContain('shadow-glow');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix products/scheduler/entrant run test:run -- tests/design-system.test.ts
```
Expected: FAIL — the first test with `TypeError: Cannot read properties of undefined (reading 'blocklist')` (Tailwind's config loader gets `undefined` because `./tailwind.config.js` does not exist), and the second with `AssertionError: expected '<!DOCTYPE html>…' to match /<link rel="stylesheet"…/` (no stylesheet and no design-system markup in the response).

- [ ] **Step 3: Write minimal implementation**

Add the dependencies. `products/scheduler/entrant/package.json` — `dependencies` and `devDependencies` become:
```json
  "dependencies": {
    "@phosphor-icons/react": "^2.1.10",
    "@react-router/node": "^7.15.0",
    "@react-router/serve": "^7.15.0",
    "@scheduler/design-system": "*",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router": "^7.15.0"
  },
  "devDependencies": {
    "@react-router/dev": "^7.15.0",
    "@types/node": "^24.10.10",
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "~5.9.3",
    "vite": "^7.2.4"
  }
```
(`@phosphor-icons/react` is a *peer* of the design system, pulled in by the `components` barrel; `"@scheduler/design-system": "*"` resolves to the local workspace. The frontend gets away without declaring the design system because npm symlinks every workspace into the root `node_modules` — verified: `node_modules/@scheduler/design-system -> packages/design-system` — but declaring it is what makes the entrant package's dependency graph honest, and what stops knip reporting it as an unlisted binary dependency in Task 3.)

`products/scheduler/entrant/tailwind.config.js` — mirrors `products/scheduler/frontend/tailwind.config.js` exactly, with the app-directory glob swapped:
```js
/** @type {import('tailwindcss').Config} */
const preset = require('@scheduler/design-system/tailwind-preset');

export default {
  presets: [preset],
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    // Scan the workspace design-system so class strings inside shared
    // components (e.g. Button's `bg-brand`/`text-brand-ink`) are
    // emitted. Without this, any class used ONLY inside a shared
    // component silently no-ops.
    '../../../packages/design-system/components/**/*.{ts,tsx}',
    '../../../packages/design-system/icons/**/*.{ts,tsx}',
  ],
};
```

`products/scheduler/entrant/postcss.config.js` (identical to `products/scheduler/frontend/postcss.config.js`):
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

`products/scheduler/entrant/app/app.css` — the same shell as `products/scheduler/frontend/src/index.css:10-16`, minus the operator-only display presets:
```css
/* Entrant tier — top-level CSS.
 *
 * Design tokens, typography, density, animation keyframes and texture
 * utilities all live in @scheduler/design-system; this file is the thin
 * shell that wires the design system + Tailwind directives, exactly as
 * products/scheduler/frontend/src/index.css does.
 *
 * If you find yourself adding rules here, ask first: does it belong in
 * the design system instead? See packages/design-system/DESIGN.md.
 */
@import '@scheduler/design-system/tokens.css';
@import '@scheduler/design-system/globals.css';

@tailwind base;
@tailwind components;
@tailwind utilities;
```

`products/scheduler/entrant/vite.config.ts`:
```ts
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter()],
  // The design system is published as raw .tsx source (its package.json
  // exports map points at ./components/index.ts), so the SSR bundler has to
  // transpile it rather than hand a bare import to Node. Spec §5.
  ssr: {
    noExternal: ['@scheduler/design-system'],
  },
});
```

`products/scheduler/entrant/app/root.tsx`:
```tsx
import { Links, Meta, Outlet, Scripts, type LinksFunction } from 'react-router';

import stylesheet from './app.css?url';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: stylesheet }];

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
```

`products/scheduler/entrant/app/routes/health.tsx`:
```tsx
import { Button } from '@scheduler/design-system/components';

import type { Route } from './+types/health';

export function loader() {
  return { tier: 'entrant' };
}

export default function Health({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <h1 data-testid="entrant-health">entrant tier is up</h1>
      <p data-testid="entrant-tier">{loaderData.tier}</p>
      {/* Not decoration: this is the standing proof that a design-system
          primitive server-renders on this tier. Modal is deliberately absent —
          spec §5 rules it browser-only and out of Phase 6. */}
      <Button variant="brand" type="button">
        design system
      </Button>
    </main>
  );
}
```

Then install the new dependencies:
```bash
npm install
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix products/scheduler/entrant run test:run
npm --prefix products/scheduler/entrant run typecheck
npm --prefix products/scheduler/entrant run build
```
Expected: PASS — `Test Files 2 passed (2) / Tests 4 passed (4)` (Task 1's two tests plus these two); `typecheck` exits 0; `react-router build` exits 0 and writes `build/client` + `build/server`, which is the real proof that Tailwind compiles in the production pipeline, not just under PostCSS in-test.

**Negative control (CODE_HEALTH 3b), to be run and recorded.** The design-system content globs are a silent-failure guard — a dropped glob does not error, it just stops emitting classes, and the page renders unstyled in production only. To prove the test is not vacuous:
```bash
# Break it: delete the two design-system lines from `content` in
# products/scheduler/entrant/tailwind.config.js, then
npm --prefix products/scheduler/entrant run test:run -- tests/design-system.test.ts
# Expect: FAIL — AssertionError on expect(result.css).toContain('.bg-brand')
# Restore the two lines; the test goes green again.
```
Record the result in the commit message below.

- [ ] **Step 5: Commit**
```bash
git add products/scheduler/entrant package.json package-lock.json
git commit -m "feat(entrant): consume the design system as-is under SSR

tailwind.config.js require()s packages/design-system/tailwind-preset.js
(CommonJS at :24) and app.css imports the tokens.css / globals.css
subpaths from the package exports map — the design system is consumed
unchanged, per spec section 5. vite.config.ts marks it ssr.noExternal
because the package ships raw .tsx source that the SSR bundler must
transpile.

Trap worth naming: the design-system package is \"type\": \"module\", so a
bare Node require() of the preset returns {}. It loads only through
Tailwind's own jiti-backed config loader, which is why the test drives it
via postcss([tailwindcss({ config })]) instead of createRequire.

Negative control run (CODE_HEALTH 3b): deleting the two design-system
globs from tailwind.config.js content fails
'the Tailwind config loads the design-system CommonJS preset and scans
its source' on expect(result.css).toContain('.bg-brand'). Restored,
green. The guard is not vacuous."
```

---

### Task 3: Name the entrant boundary rules and wire the gates

**Files:**
- Create: `products/scheduler/entrant/eslint.config.js`
- Create: `products/scheduler/entrant/.dependency-cruiser.cjs`
- Create: `products/scheduler/entrant/knip.json`
- Modify: `products/scheduler/entrant/package.json:6-16` (add `lint`, `depcruise`, `knip` scripts) and `devDependencies` (lint + boundary tooling)
- Modify: `package.json:14-28` (root scripts)
- Modify: `.github/workflows/ci.yml:44` (new `entrant` job after the `frontend` job)
- Test: `products/scheduler/entrant/tests/boundaries.test.ts`

**Interfaces:**
- Consumes (from Tasks 1-2): the `entrant` workspace and its `app/` tree; scripts `test:run`, `typecheck`, `build`.
- Produces:
  - package scripts `lint` (`eslint .`), `depcruise` (`depcruise app`), `knip`
  - root scripts `dev:entrant`, `build:entrant`, `lint:entrant`, `test:entrant`, `typecheck:entrant`, `depcruise:entrant`, `knip:entrant`
  - two enforced boundary rule names later tasks are held to: **`entrant-no-operator-frontend`** and **`entrant-server-only-stays-server`**
  - CI job id `entrant`

**Spec §10 item 5 — the analogous boundary, decided.** The frontend's error-severity rules protect `src/platform/` as the foundation layer. There is no `platform/` in an SSR app, so the analogous boundary is **the trust boundary the spec itself draws in §4**, and it splits in two:

1. **`entrant-no-operator-frontend` (error).** The entrant tier must never import from `products/scheduler/frontend/src/`. Spec §4 spells out why for the one file people would reach for first — `frontend/src/api/client.ts` is browser-coupled and unsafe in a shared node process: a Zustand toast singleton (`:6`, `:397`), a module-scoped `stateEtags` Map (`:265`), a module singleton export (`:1682`), `withCredentials` (`:456`), `window.dispatchEvent` on 401 (`:384-391`), and a relative base URL (`:79`). A per-request node process that shares module state across entrants is a cross-entrant data leak, so this is a security boundary, not a taste boundary. `severity: 'error'` day one: it is greenfield and has zero violations to grandfather.

2. **`entrant-server-only-stays-server` (error).** `app/components/` and `app/routes/` must not import a `*.server.ts(x)` module. This is the load-bearing one for §3: the SSR-only fetch layer that "forwards no `Cookie` and relays no `Set-Cookie`" must stay unreachable from anything that gets bundled to the browser. Route modules legitimately re-export loaders, so the rule is scoped to the *import graph of client-reachable code*; server modules are consumed only through loader/action files added in later tasks.

Plus `no-circular` at `warn`, copied verbatim from `products/scheduler/frontend/.dependency-cruiser.cjs:28-34`. The frontend's `no-cross-product` rule has no analogue: there are no products inside a single-surface SSR app.

- [ ] **Step 1: Write the failing test**

`products/scheduler/entrant/tests/boundaries.test.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';

const FIXTURES = [
  'app/lib/__boundary_fixture__.server.ts',
  'app/components/__boundary_fixture__.tsx',
  'app/routes/__boundary_fixture__.tsx',
];

function cleanup(): void {
  for (const f of FIXTURES) rmSync(f, { force: true });
}
afterEach(cleanup);

/** Runs the real CLI the CI job runs. Returns exit code + combined output. */
function depcruise(): { code: number; out: string } {
  try {
    const out = execFileSync('npx', ['depcruise', 'app', '--output-type', 'err'], {
      encoding: 'utf8',
      shell: true,
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('the entrant app is clean against its own boundary rules', () => {
  const { code, out } = depcruise();
  expect(out).toContain('no dependency violations found');
  expect(code).toBe(0);
});

test('importing the operator frontend is an error', () => {
  // frontend/src/api/client.ts is module-singleton, browser-coupled and
  // withCredentials-bearing (spec §4). Shared across requests in one node
  // process, its module state is a cross-entrant leak. The rule is the thing
  // that stops someone reaching for it.
  mkdirSync('app/lib', { recursive: true });
  writeFileSync(
    'app/routes/__boundary_fixture__.tsx',
    "import { apiClient } from '../../../frontend/src/api/client';\n" +
      'export const fixture = apiClient;\n',
  );

  const { code, out } = depcruise();
  expect(out).toContain('entrant-no-operator-frontend');
  expect(code).not.toBe(0);
});

test('a client-reachable module importing a .server module is an error', () => {
  mkdirSync('app/lib', { recursive: true });
  mkdirSync('app/components', { recursive: true });
  writeFileSync('app/lib/__boundary_fixture__.server.ts', 'export const serverOnly = 1;\n');
  writeFileSync(
    'app/components/__boundary_fixture__.tsx',
    "import { serverOnly } from '../lib/__boundary_fixture__.server';\n" +
      'export function Fixture() { return serverOnly; }\n',
  );

  const { code, out } = depcruise();
  expect(out).toContain('entrant-server-only-stays-server');
  expect(code).not.toBe(0);
});

test('CI runs the entrant gates', () => {
  const ci = readFileSync('../../../.github/workflows/ci.yml', 'utf8');
  expect(ci).toContain('npm run lint:entrant');
  expect(ci).toContain('npm run typecheck:entrant');
  expect(ci).toContain('npm --prefix products/scheduler/entrant run test:run');
  expect(ci).toContain('npm run depcruise:entrant');
  expect(ci).toContain('npm run knip:entrant || true');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix products/scheduler/entrant run test:run -- tests/boundaries.test.ts
```
Expected: FAIL — all four tests. The three `depcruise` tests fail because `dependency-cruiser` is not installed and there is no `.dependency-cruiser.cjs`, so `npx depcruise` exits non-zero with output containing neither `no dependency violations found` nor a rule name (first test fails on `expected '' to contain 'no dependency violations found'`; tests 2 and 3 fail on `expected … to contain 'entrant-no-operator-frontend'` / `'entrant-server-only-stays-server'`). The fourth fails on `expected … to contain 'npm run lint:entrant'`.

- [ ] **Step 3: Write minimal implementation**

`products/scheduler/entrant/.dependency-cruiser.cjs`:
```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'entrant-no-operator-frontend',
      comment:
        'The frontend/ analogue of platform-no-products. There is no platform/ layer in the SSR app, so the boundary that matters is the one spec §4 draws: the entrant tier must not reach into the operator SPA. Named case: frontend/src/api/client.ts is browser-coupled and unsafe in a shared node process — a Zustand toast singleton (:6, :397), a module-scoped stateEtags Map (:265), a module singleton export (:1682), withCredentials (:456), window.dispatchEvent on 401 (:384-391), and a relative base URL (:79). Module state shared across requests in one node process is a cross-entrant leak. Greenfield with 0 violations, so this is an error from day one.',
      severity: 'error',
      from: { path: '^app/' },
      to: { path: '[/\\\\]frontend[/\\\\]src[/\\\\]' },
    },
    {
      name: 'entrant-server-only-stays-server',
      comment:
        'The SSR-only fetch layer (*.server.ts) forwards no Cookie and relays no Set-Cookie (spec §3, §4). It must stay unreachable from anything that gets bundled to the browser, so client-reachable modules under app/components/ and app/routes/ may not import it — server modules are consumed through loaders and actions only. This is the seam that keeps "no deputy" enforceable rather than remembered.',
      severity: 'error',
      from: { path: '^app/(components|routes)/' },
      to: { path: '\\.server\\.(ts|tsx)$' },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies make refactoring unsafe.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
  },
};
```

`products/scheduler/entrant/eslint.config.js` — mirrors `products/scheduler/frontend/eslint.config.js`, minus the Vite-SPA-only `react-refresh` plugin, plus node globals (this tier runs on the server):
```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['build', '.react-router']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      // Both, deliberately: route modules render on the server AND hydrate in
      // the browser, and *.server.ts modules are node-only.
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Same downgrades as the frontend config, for the same reason (CLAUDE.md
      // lean-gate philosophy): the react-hooks v7 react-compiler rules and
      // no-explicit-any stay visible as warnings so the gate is green day one.
      // react-hooks/rules-of-hooks and everything else remain errors.
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
])
```

`products/scheduler/entrant/knip.json`:
```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "app/root.tsx",
    "app/routes.ts",
    "app/routes/**/*.tsx",
    "app/entry.server.tsx",
    "react-router.config.ts",
    "vite.config.ts",
    "vitest.config.ts",
    "tests/**/*.test.ts"
  ],
  "project": ["app/**/*.{ts,tsx}"],
  "ignoreDependencies": ["@phosphor-icons/react", "autoprefixer", "postcss", "tailwindcss"]
}
```
(`@phosphor-icons/react` is a peer of the design system reached only through its barrel; `autoprefixer`/`postcss`/`tailwindcss` are referenced from `postcss.config.js`/`tailwind.config.js`, which knip does not trace into.)

`products/scheduler/entrant/package.json` — add three scripts and the lint/boundary devDependencies:
```json
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc",
    "lint": "eslint .",
    "test": "vitest",
    "test:run": "vitest run",
    "depcruise": "depcruise app",
    "knip": "knip"
  },
```
and into `devDependencies` (keeping the existing entries, alphabetical):
```json
    "@eslint/js": "^9.39.1",
    "dependency-cruiser": "^18.0.0",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "globals": "^16.5.0",
    "knip": "^6.23.0",
    "typescript-eslint": "^8.46.4",
```

Root `package.json` — `scripts` becomes:
```json
  "scripts": {
    "dev:scheduler": "npm run -w products/scheduler/frontend dev",
    "dev:entrant": "npm run -w products/scheduler/entrant dev",
    "build:scheduler": "npm run -w products/scheduler/frontend build",
    "build:entrant": "npm run -w products/scheduler/entrant build",
    "build:all": "npm run build:scheduler && npm run build:entrant",
    "lint:scheduler": "npm run -w products/scheduler/frontend lint",
    "lint:entrant": "npm run -w products/scheduler/entrant lint",
    "typecheck:entrant": "npm run -w products/scheduler/entrant typecheck",
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs",
    "docs:freshness": "node scripts/docs-freshness.mjs",
    "depcruise": "npm --prefix products/scheduler/frontend run depcruise",
    "depcruise:entrant": "npm --prefix products/scheduler/entrant run depcruise",
    "jscpd": "jscpd",
    "knip": "npm --prefix products/scheduler/frontend run knip",
    "knip:entrant": "npm --prefix products/scheduler/entrant run knip",
    "test:scheduler": "npm --prefix products/scheduler/frontend run test:run",
    "test:entrant": "npm --prefix products/scheduler/entrant run test:run",
    "test:cov": "npm --prefix products/scheduler/frontend run test:cov"
  },
```

`.github/workflows/ci.yml` — insert this job between the `frontend` job (ends at line 44) and `backend:` (line 46):
```yaml
  entrant:
    name: Entrant (lint + types + tests + boundaries)
    runs-on: ubuntu-latest
    # Mirrors the frontend job step for step. Separate rather than folded in,
    # because a failure here should name the entrant tier: it is a different
    # runtime (node SSR, not a static SPA) with a different trust boundary
    # (see products/scheduler/entrant/.dependency-cruiser.cjs).
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
      - name: Install workspaces
        run: npm ci
      - name: Lint
        run: npm run lint:entrant
      # `react-router typegen && tsc`. The frontend gets its type gate for free
      # inside `build`; this tier's build does typegen too, but running the gate
      # on its own makes a type error report as a type error.
      - name: Typecheck
        run: npm run typecheck:entrant
      - name: Request-level tests
        run: npm --prefix products/scheduler/entrant run test:run
      - name: Architecture boundaries (dependency-cruiser)
        run: npm run depcruise:entrant

      # Report-only for the same reason the frontend job gives above: knip's
      # verdict is a hypothesis, and a gate that fails on a false positive
      # trains people to delete load-bearing code.
      - name: Unused files and exports (knip, report-only)
        run: npm run knip:entrant || true
```

Then install the new dev dependencies:
```bash
npm install
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix products/scheduler/entrant run test:run
npm run lint:entrant
npm run depcruise:entrant
npm run typecheck:entrant
npm run test:scheduler
```
Expected: PASS — `Test Files 3 passed (3) / Tests 8 passed (8)` for the entrant suite; `lint:entrant` exits 0; `depcruise:entrant` prints `✔ no dependency violations found`; `typecheck:entrant` exits 0; the frontend suite is unchanged and green (the root `package.json` edit must not disturb it).

**Negative control (CODE_HEALTH 3b), to be run and recorded.** Both boundary rules are security seams whose failure is silent — nothing errors when someone imports `frontend/src/api/client.ts` into a loader; it just works, and leaks module state across entrants. To prove the tests are not vacuous:
```bash
# Break rule 1: delete the `entrant-no-operator-frontend` object from
# products/scheduler/entrant/.dependency-cruiser.cjs, then
npm --prefix products/scheduler/entrant run test:run -- tests/boundaries.test.ts
# Expect: FAIL — 'importing the operator frontend is an error' fails on
# expect(out).toContain('entrant-no-operator-frontend'). Restore it.

# Break rule 2: delete the `entrant-server-only-stays-server` object, rerun.
# Expect: FAIL — 'a client-reachable module importing a .server module is an
# error' fails the same way. Restore it.

# Break the CI wiring: delete the `depcruise:entrant` step from ci.yml, rerun.
# Expect: FAIL — 'CI runs the entrant gates'. Restore it.
```
Record the results in the commit message below.

- [ ] **Step 5: Commit**
```bash
git add products/scheduler/entrant .github/workflows/ci.yml package.json package-lock.json
git commit -m "ci(entrant): name the entrant boundary rules and gate them

Settles spec section 10 item 5. There is no platform/ layer in the SSR
app, so the analogue of the frontend's platform-no-products rule is the
trust boundary spec section 4 already draws, split in two:

  entrant-no-operator-frontend   (error) — app/ must never import
      products/scheduler/frontend/src/. The named case is
      frontend/src/api/client.ts: a module singleton with a Zustand toast,
      a module-scoped stateEtags Map, withCredentials and a relative base
      URL. Shared across requests in one node process that is a
      cross-entrant leak, not a style issue.

  entrant-server-only-stays-server (error) — app/components/ and
      app/routes/ may not import *.server.ts. The SSR-only fetch layer
      forwards no Cookie and relays no Set-Cookie; this rule is what keeps
      'no deputy' enforced rather than remembered.

no-circular is copied at warn from the frontend config. The frontend's
no-cross-product rule has no analogue — one surface, no products.

CI gains an Entrant job mirroring the frontend job (lint, typecheck,
test:run, depcruise, knip report-only), plus the root scripts it calls.
knip stays report-only for the reason the frontend job already documents.

Negative controls run (CODE_HEALTH 3b), each restored after:
  - removing entrant-no-operator-frontend fails
    'importing the operator frontend is an error'
  - removing entrant-server-only-stays-server fails
    'a client-reachable module importing a .server module is an error'
  - removing the depcruise:entrant CI step fails 'CI runs the entrant gates'
Neither rule is decorative."
```

---

### Task 4: Promote `_form_csrf` out of the route into `app/form_csrf.py`

**Files:**
- Create: `products/scheduler/backend/app/form_csrf.py`
- Create: `products/scheduler/tests/unit/test_form_csrf.py`
- Modify: `products/scheduler/backend/api/entries_public.py:108`, `:139-146`, `:212-241`
- Test: `products/scheduler/tests/unit/test_form_csrf.py`

**Interfaces:**
- Consumes: nothing from earlier tasks. Reads the incumbent `api.entries_public._form_csrf(session_token: Optional[str]) -> str` (`entries_public.py:212-241`) and the domain separator `_FORM_CSRF_PREFIX = "sw-play-form-csrf:"` (`entries_public.py:146`).
- Produces: module `app.form_csrf` exporting `FORM_FIELD: str = "_csrf"` and `form_csrf_token(secret: Optional[str]) -> str` (sha256 hexdigest of `"sw-play-form-csrf:" + secret`, `""` for a falsy secret). `api.entries_public._form_csrf` survives as an alias of `form_csrf_token` so the existing submit route and its ~90 tests are untouched. Tasks 5, 6 and 7 all import from `app.form_csrf`.

**Cover-before-modify note (CODE_HEALTH 11):** `_form_csrf` has no direct unit coverage today — every existing assertion reaches it through the rendered page (`test_entries_public_routes.py:949-982`). Step 1 is therefore a characterization test that pins the *digest values* before the function moves, so a move that silently changed the derivation is caught by an equality, not by a route behaving differently.

- [ ] **Step 1: Write the failing test**

```python
# products/scheduler/tests/unit/test_form_csrf.py
"""The cookie-derived double-submit token, as a unit.

SP-PROGRAM-1 Phase 6 (ruling R8-B). ``_form_csrf`` was a private helper of
``api/entries_public.py`` and every assertion about it reached it through a
rendered page, which is not coverage of the primitive — it is coverage of
the page that happened to call it. Phase 6 promotes it into
``app/form_csrf.py`` because the CSRF middleware has to call it too, so it
gets characterized first (CODE_HEALTH 11): the digests below are the
incumbent's actual output, captured before the move, so a move that
changed the derivation fails on an equality rather than on a route
behaving differently three files away.
"""
from __future__ import annotations

# Captured from api/entries_public._form_csrf before the promotion.
# sha256("sw-play-form-csrf:" + token).hexdigest()
_GOLDEN = {
    "tok-123": "a7ce0306886041690f40c7c52244e594ceda3785f5db849bb25f7cdc36f4276e",
    "another-token": "fc255256ce5cbc9b3d601d7060efbd28cf76c1edc6c12cf17072edf940b87980",
    "a-secret-nonce": "88498cc8b4bf91ae5536fe708e5ce8d40190759445727b249b8ce4e506ec5881",
}


def test_the_promoted_token_matches_the_captured_digests():
    from app.form_csrf import form_csrf_token

    for token, digest in _GOLDEN.items():
        assert form_csrf_token(token) == digest


def test_an_absent_session_yields_an_empty_token():
    """The pre-session gap, pinned as behaviour rather than as prose: with
    no secret the function returns ``""``, which the callers must treat as
    "no proof available" and never as "proof matched"."""
    from app.form_csrf import form_csrf_token

    assert form_csrf_token(None) == ""
    assert form_csrf_token("") == ""


def test_two_different_sessions_do_not_share_a_token():
    from app.form_csrf import form_csrf_token

    assert form_csrf_token("tok-123") != form_csrf_token("tok-124")


def test_the_route_helper_is_now_the_promoted_function(_unused=None):
    """The incumbent name survives as an alias, so the submit route and the
    ~90 tests in test_entries_public_routes.py are untouched by the move."""
    from api.entries_public import _form_csrf
    from app.form_csrf import form_csrf_token

    assert _form_csrf is form_csrf_token


def test_the_form_field_name_is_the_one_the_page_emits():
    from app.form_csrf import FORM_FIELD

    assert FORM_FIELD == "_csrf"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/unit/test_form_csrf.py`

Expected: FAIL — all five collect-and-run errors are `ModuleNotFoundError: No module named 'app.form_csrf'`.

- [ ] **Step 3: Write minimal implementation**

Create `products/scheduler/backend/app/form_csrf.py`:

```python
"""The cookie-derived double-submit CSRF token (SP-PROGRAM-1 Phase 6, R8-B).

**Why this is a module and not a route helper.** It was one — a private
function of ``api/entries_public.py`` serving one route, exempted from the
custom-header check by a path regex in ``app/main.py``. Phase 6 deletes
that exemption and makes the token a **second enumerated proof channel**
of the middleware itself, which means the middleware has to be able to
call this. A path-based escape hatch that only one file can honour becomes
a channel that every write is measured against; promoting the function is
how the exemption gets deleted rather than renamed.

**What the token proves.** The app's primary CSRF defense is the custom
request header ``X-ShuttleWorks-CSRF``, which a cross-site page cannot
attach without a preflight we do not approve. A native ``<form
method=post>`` cannot attach it either — that is the same property seen
from the other side — so an unhydrated entrant form would be refused the
moment it carried a session cookie. The form instead carries a digest of a
cookie the attacker's page can make the browser *send* but can never
*read*. Comparison is constant time at the call site.

Stateless on purpose: no server-side token store, and the session-derived
token is invalidated by logging out because it is a function of the
session token.
"""
from __future__ import annotations

import hashlib
from typing import Optional

# Domain separator. Any constant works; naming it means the digest can
# never collide with another sha256 of the same session token computed
# somewhere else for another purpose. Moved verbatim from
# ``api/entries_public.py`` — changing the string invalidates every form
# a browser currently holds, so it is a deliberate act, not a rename.
_FORM_CSRF_PREFIX = "sw-play-form-csrf:"

# The hidden input's name. One constant, read by the renderer and by the
# middleware, so the two cannot drift.
FORM_FIELD = "_csrf"


def form_csrf_token(secret: Optional[str]) -> str:
    """The hidden-field token derived from ``secret``.

    ``secret`` is whichever unreadable cookie value is available: the
    entrant session token for a signed-in write, or the pre-session
    ``sw_play_csrf`` nonce for a login/signup post.

    Returns ``""`` when there is no secret. Callers must treat that as
    "no proof is available", never as a token to compare against — an
    empty expected value that compared equal to an empty presented value
    would be an open door for exactly the anonymous caller this defends
    against.
    """
    if not secret:
        return ""
    return hashlib.sha256(
        (_FORM_CSRF_PREFIX + secret).encode("utf-8")
    ).hexdigest()
```

Edit `products/scheduler/backend/api/entries_public.py` — delete `import hashlib` at line 108, delete the `_FORM_CSRF_PREFIX` block at lines 144-146, and replace the whole `_form_csrf` definition at lines 212-241 with the alias.

Add to the import block (after line 122, `from app.config import settings`):

```python
from app.form_csrf import form_csrf_token as _form_csrf
```

Replace lines 212-241 (the `def _form_csrf(...)` block, docstring and all) with:

```python
# ``_form_csrf`` is ``app.form_csrf.form_csrf_token``, imported above under
# its historical name. **The function moved because the middleware needs
# it** (Phase 6, R8-B): the double-submit token stopped being this route's
# private arrangement and became the middleware's second proof channel, so
# it cannot live inside a route module the middleware must not import. The
# full argument for the token — what it proves, and why a header is not an
# option for a native form post — is now in ``app/form_csrf.py``. The alias
# stays so this module's call sites and their tests read unchanged.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/unit/test_form_csrf.py tests/test_entries_public_routes.py tests/test_csrf_cookie_registry.py`

Expected: PASS — the five new tests, plus the ~90 incumbent public-route tests and the 8 registry tests all still green (the move is behaviour-preserving by construction; the golden digests are the proof).

Then `ruff check products/scheduler` to confirm the removed `hashlib` import left nothing unused.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/app/form_csrf.py products/scheduler/backend/api/entries_public.py products/scheduler/tests/unit/test_form_csrf.py
git commit -m "refactor(csrf): promote the form CSRF token into app/form_csrf

Phase 6 R8-B: the double-submit token becomes the middleware's second
proof channel, so it cannot stay a private helper of a route module the
middleware must not import. Behaviour-preserving — the promoted function
is pinned against digests captured from the incumbent before the move
(CODE_HEALTH 11, cover before modify), and api.entries_public._form_csrf
survives as an alias so the ~90 public-route tests are untouched."
```

---

### Task 5: The `sw_play_csrf` pre-session cookie, deliberately outside the session registry

**Files:**
- Modify: `products/scheduler/backend/app/config.py:177-183` (add the setting after `entrant_session_cookie_name`), `:390-414` (add `csrf_relevant_cookie_names` beside `session_cookie_names`)
- Modify: `products/scheduler/backend/app/form_csrf.py` (add `issue_play_csrf`)
- Modify: `products/scheduler/tests/test_csrf_cookie_registry.py:40-47`, `:151-168`, `:196-222`
- Test: `products/scheduler/tests/unit/test_form_csrf.py`, `products/scheduler/tests/test_csrf_cookie_registry.py`

**Interfaces:**
- Consumes: `app.form_csrf.form_csrf_token(secret) -> str` (Task 4).
- Produces:
  - `settings.entrant_csrf_cookie_name: str = "sw_play_csrf"`
  - `settings.csrf_relevant_cookie_names -> tuple[str, ...]` = `session_cookie_names + (entrant_csrf_cookie_name,)` — **the middleware's trigger list** (Task 6 reads this). Distinct from `session_cookie_names`, which stays exactly `("sw_session", "sw_play_session")`.
  - `app.form_csrf.issue_play_csrf(response: Response) -> str` — mints a nonce, sets it as the httponly `sw_play_csrf` cookie on `response`, and returns the hidden-field token for it. **Called by no route in this task group.** Its route wiring is `GET /e/api/config` and `GET /e/api/page/{slug}`, owned by the loader task group; those routes must call it and put the returned string in `viewer.formCsrf` / the config payload.

**Why the cookie must not enter `session_cookie_names`:** it authenticates nothing. Adding it would make every request that merely holds a CSRF nonce look cookie-authenticated to any future code reading that registry — the exact fail-open shape the registry exists to prevent, inverted. `test_csrf_cookie_registry.py:96` is the standing inversion proof that unregistered cookies do not trigger the session check; this task adds the carve-out that lets the source-derived guard at `:196` see the new `set_cookie` and pass it deliberately rather than by not looking.

- [ ] **Step 1: Write the failing test**

Append to `products/scheduler/tests/unit/test_form_csrf.py`:

```python
# ---- the pre-session cookie (Phase 6, R8-B) ----------------------------


def test_issuing_the_pre_session_cookie_returns_a_token_derived_from_it():
    """The two halves are minted together and must agree: the cookie holds
    the secret, the return value is the hidden field the form carries."""
    from fastapi import Response

    from app.config import settings
    from app.form_csrf import form_csrf_token, issue_play_csrf

    response = Response()
    token = issue_play_csrf(response)

    header = response.headers["set-cookie"]
    assert header.startswith(f"{settings.entrant_csrf_cookie_name}=")
    nonce = header.split("=", 1)[1].split(";", 1)[0]
    assert token == form_csrf_token(nonce)
    assert token != ""


def test_the_pre_session_cookie_is_httponly_and_host_only():
    """httponly so a cross-site page cannot read the secret; no ``domain``
    so it stays host-only, which is what keeps the operator and entrant
    jars separate (the same posture as the entrant session cookie)."""
    from app.form_csrf import issue_play_csrf
    from fastapi import Response

    response = Response()
    issue_play_csrf(response)

    header = response.headers["set-cookie"].lower()
    assert "httponly" in header
    assert "samesite=lax" in header
    assert "path=/" in header
    assert "domain=" not in header


def test_two_issues_do_not_share_a_secret():
    from app.form_csrf import issue_play_csrf
    from fastapi import Response

    assert issue_play_csrf(Response()) != issue_play_csrf(Response())


def test_the_pre_session_cookie_authenticates_nothing():
    """**The registry claim, asserted where the cookie is defined.** It is
    a CSRF nonce, not a credential: it must never be a member of the list
    the code reads to decide "this request is cookie-authenticated"."""
    from app.config import settings

    assert settings.entrant_csrf_cookie_name == "sw_play_csrf"
    assert settings.entrant_csrf_cookie_name not in settings.session_cookie_names
    assert settings.session_cookie_names == ("sw_session", "sw_play_session")


def test_it_is_nevertheless_inside_the_csrf_trigger():
    """And the inverse claim, which is what closes the pre-session gap: a
    write carrying only this cookie is still measured by the CSRF check,
    even though the cookie proves no identity. Without this the login post
    — the one write with no session behind it — is unguarded."""
    from app.config import settings

    assert settings.entrant_csrf_cookie_name in settings.csrf_relevant_cookie_names
    for name in settings.session_cookie_names:
        assert name in settings.csrf_relevant_cookie_names
```

Edit `products/scheduler/tests/test_csrf_cookie_registry.py`. Replace lines 40-47 with:

```python
_BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
# **The scan covers ``app/`` as well as ``api/`` (Phase 6).** It used to
# read ``backend/api`` only, which was correct while every cookie was set
# by a route. ``app/form_csrf.py`` now sets one, and a guard that cannot
# see a ``set_cookie`` is a guard a future cookie evades by being defined
# one directory over — silently, which is the failure mode this file
# exists to refuse.
_SCAN_DIRS = (_BACKEND_DIR / "api", _BACKEND_DIR / "app")

# Cookies that are deliberately NOT credentials — a locale or theme
# preference, say. An addition here is a claim that the cookie cannot
# authenticate anything. Kept as an explicit escape hatch so a future
# non-session cookie is a reviewed edit rather than a reason to weaken the
# assertion below.
#
# ``sw_play_csrf`` (SP-PROGRAM-1 Phase 6, ruling R8-B) is the first entry.
# It is the **pre-session** CSRF nonce: an unhydrated login or signup post
# carries no session at all, so ``form_csrf_token`` had nothing to derive
# from and returned ``""`` — a live gap. This cookie is the secret it
# derives from instead. It holds a random nonce, resolves to no account,
# and is httponly so no page can read it. It must stay OUT of
# ``session_cookie_names``: that registry answers "is this request
# cookie-authenticated", and a nonce that authenticates nobody answering
# yes would be the registry's own fail-open shape, inverted. It is in
# ``csrf_relevant_cookie_names`` instead, which is what the middleware
# actually triggers on.
_NON_SESSION_COOKIES: set[str] = {"sw_play_csrf"}
```

Replace the body of `_cookie_key_expressions` (lines 151-168) so it walks `_SCAN_DIRS`:

```python
def _cookie_key_expressions() -> list[tuple[str, int, ast.AST]]:
    """Every ``key=`` argument of every ``*.set_cookie(...)`` under
    ``backend/api/`` and ``backend/app/``."""
    found: list[tuple[str, int, ast.AST]] = []
    for directory in _SCAN_DIRS:
        for path in sorted(directory.glob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                func = node.func
                if not isinstance(func, ast.Attribute) or func.attr != "set_cookie":
                    continue
                key = next(
                    (kw.value for kw in node.keywords if kw.arg == "key"),
                    node.args[0] if node.args else None,
                )
                assert key is not None, (
                    f"{path.name}:{node.lineno} set_cookie with no key"
                )
                found.append((path.name, node.lineno, key))
    return found
```

Append after `test_the_registry_names_both_principals` (line 222):

```python
def test_the_scan_actually_reaches_the_app_directory(client):
    """Non-vacuity for the widened scan: if ``_SCAN_DIRS`` silently stopped
    matching ``backend/app``, every assertion above would keep passing
    while covering strictly less."""
    files = {name for name, _, _ in _cookie_key_expressions()}
    assert "form_csrf.py" in files, (
        "the set_cookie in backend/app/form_csrf.py is not being scanned — "
        f"the guard only saw {sorted(files)}"
    )


def test_the_pre_session_nonce_is_carved_out_and_not_registered(client):
    """The carve-out, stated as an assertion rather than as a comment.

    ``sw_play_csrf`` is set by the API and is deliberately absent from
    ``session_cookie_names``. Both halves matter: present in the carve-out
    (so the structural gate above passes on purpose), and absent from the
    session registry (so nothing ever reads it as a credential).
    """
    from app.config import settings

    assert "sw_play_csrf" in _NON_SESSION_COOKIES
    assert "sw_play_csrf" not in settings.session_cookie_names
    assert "sw_play_csrf" in settings.csrf_relevant_cookie_names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/unit/test_form_csrf.py tests/test_csrf_cookie_registry.py`

Expected: FAIL — `ImportError: cannot import name 'issue_play_csrf' from 'app.form_csrf'` on the new unit tests, and `AttributeError: 'Settings' object has no attribute 'entrant_csrf_cookie_name'` plus `test_the_scan_actually_reaches_the_app_directory` failing with `the guard only saw ['auth.py', 'entrants.py']`.

- [ ] **Step 3: Write minimal implementation**

In `products/scheduler/backend/app/config.py`, insert after line 183 (`entrant_session_cookie_name: str = "sw_play_session"`):

```python
    # The PRE-SESSION CSRF nonce (SP-PROGRAM-1 Phase 6, ruling R8-B).
    #
    # Not a credential and never one: it resolves to no account and no
    # session row. It exists because the double-submit token is derived
    # from a cookie the attacker cannot read, and on the one write with no
    # session behind it — login, signup — there was no such cookie, so the
    # derivation returned "" and the channel was simply absent. This is
    # the secret it derives from instead.
    #
    # It is deliberately NOT in ``session_cookie_names``; see that property
    # and ``csrf_relevant_cookie_names`` below.
    entrant_csrf_cookie_name: str = "sw_play_csrf"
```

In the same file, insert after the `session_cookie_names` property (after line 414):

```python
    @property
    def csrf_relevant_cookie_names(self) -> tuple[str, ...]:
        """**The registry the CSRF middleware triggers on.**

        A superset of ``session_cookie_names``, and the difference is the
        point. ``session_cookie_names`` answers "does this request carry a
        credential" — a question about identity, read by anything that
        cares who the caller is. This answers "must this write prove it
        was sent deliberately", which is a strictly wider question: the
        pre-session nonce carries no identity at all, and a login post
        holding it still has to present a matching token.

        Keeping them as two properties instead of one widened list is what
        stops the nonce from ever being mistaken for a credential by code
        that reads the registry for the other reason.
        """
        return (*self.session_cookie_names, self.entrant_csrf_cookie_name)
```

Append to `products/scheduler/backend/app/form_csrf.py`:

```python
def issue_play_csrf(response: Response) -> str:
    """Mint the pre-session CSRF secret and return its hidden-field token.

    Two halves of one act, which is why they are minted in one function:
    the cookie holds a random nonce the browser will send back and no page
    can read, and the return value is the digest of it that goes into the
    form. Splitting them would let a caller ship a form whose token does
    not match the cookie it was issued beside — a failure that presents as
    "the form expired", which is exactly the report nobody investigates.

    ``httponly`` so script cannot read the secret. No ``domain``: host-only
    is what keeps the operator and entrant cookie jars separate, and it is
    also what stops a sibling host from tossing a nonce of its choosing
    into this browser's jar. Same TTL as the session cookie — a shorter
    one would expire forms a user left open, and the nonce is worthless on
    its own.
    """
    nonce = secrets.token_urlsafe(32)
    response.set_cookie(
        key=settings.entrant_csrf_cookie_name,
        value=nonce,
        max_age=int(settings.session_ttl_days * 86400),
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return form_csrf_token(nonce)
```

and extend its imports:

```python
import hashlib
import secrets

from fastapi import Response

from app.config import settings
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/unit/test_form_csrf.py tests/test_csrf_cookie_registry.py tests/unit/test_config.py`

Expected: PASS (all of them, including the 8 pre-existing registry tests).

**Negative control, run by hand and restored** (CODE_HEALTH 3b): change `csrf_relevant_cookie_names` to `return self.session_cookie_names` — `test_it_is_nevertheless_inside_the_csrf_trigger` and `test_the_pre_session_nonce_is_carved_out_and_not_registered` go red. Then instead add `self.entrant_csrf_cookie_name` to `session_cookie_names` — `test_the_pre_session_cookie_authenticates_nothing` and `test_the_registry_names_both_principals` go red. Both directions of the carve-out are therefore load-bearing. Restore.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/app/config.py products/scheduler/backend/app/form_csrf.py products/scheduler/tests/unit/test_form_csrf.py
git commit -m "feat(csrf): add the sw_play_csrf pre-session nonce

Phase 6 R8-B closes the live gap where form_csrf_token had no secret to
derive from on a login or signup post and returned \"\". The nonce is
NOT a credential: it stays out of settings.session_cookie_names and goes
into the new settings.csrf_relevant_cookie_names, which is what the
middleware triggers on. Both directions carry a negative control."

git add products/scheduler/tests/test_csrf_cookie_registry.py
git commit -m "test(csrf): carve sw_play_csrf out of the registry guard

Supersedes the empty _NON_SESSION_COOKIES escape hatch
(test_csrf_cookie_registry.py:47) and widens
test_every_api_set_cookie_names_a_registered_session_cookie (:196) to
scan backend/app/ as well as backend/api/ — app/form_csrf.py now sets a
cookie, and a guard that cannot see a set_cookie is one a future cookie
evades by being defined a directory over. Ruling: R8-B, spec section 3 —
the nonce authenticates nothing, so registering it as a session cookie
would invert the very fail-open shape the registry prevents. Adds a
non-vacuity test that the widened scan really reaches form_csrf.py."
```

---

### Task 6: Teach `csrf_middleware` the second enumerated proof channel

**Files:**
- Modify: `products/scheduler/backend/app/main.py:245-298` (the `csrf_middleware` docstring and its condition)
- Modify: `products/scheduler/backend/app/form_csrf.py` (add `form_csrf_proves`)
- Test: `products/scheduler/tests/test_form_csrf_channel.py` (create)

**Interfaces:**
- Consumes: `app.form_csrf.form_csrf_token`, `app.form_csrf.FORM_FIELD` (Task 4); `app.form_csrf.issue_play_csrf`, `settings.csrf_relevant_cookie_names`, `settings.entrant_csrf_cookie_name` (Task 5).
- Produces: `async app.form_csrf.form_csrf_proves(request: Request) -> bool` — `True` iff the request presents a `_csrf` form field matching a token derived from one of the caller's own entrant cookies. `csrf_middleware` calls it as the second disjunct.
- **Ordering, deliberate:** the `_FORM_CSRF_ROUTES` clause stays in the condition **after** `form_csrf_proves`, so `POST /e/{slug}/submit` runs through channel two from this commit onward even though it is still nominally exempt. That is what makes Task 7's body-replay test able to go red. Task 7 removes the clause.
- **Known defect carried for exactly one commit:** the implementation below reads the form via `request.form()` and does **not** replay the receive channel. At this commit the only urlencoded body-consuming route in the tree is `POST /e/{slug}/submit`, whose exempt clause is evaluated last but whose channel-two check now runs first and consumes its body. Task 7 lands the replay in the same phase and proves it with a test. Do not stop between Task 6 and Task 7.

- [ ] **Step 1: Write the failing test**

```python
# products/scheduler/tests/test_form_csrf_channel.py
"""Channel two: a cookie-derived double-submit token, checked by the
middleware rather than by a route.

SP-PROGRAM-1 Phase 6, ruling R8-B. Until now a write proved it was sent
deliberately in exactly one way — the ``X-ShuttleWorks-CSRF`` header — and
the one surface that cannot send a header (a native ``<form method=post>``
on a page with no script) was let through by a path regex in
``app/main.py`` and made to prove itself inside the route. A path-based
exemption is a hole that grows; a second **enumerated** channel is a
property every write is measured against. This file asserts the channel,
in both directions and on both secrets:

- the **session-derived** token, for a signed-in entrant write;
- the **pre-session** token derived from ``sw_play_csrf``, for the login
  and signup posts that carry no session at all.

Every refusal here is paired with the same request succeeding, because a
403 proves nothing on a route that refuses everything.
"""
from __future__ import annotations

import json
import uuid

import pytest

from tests._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
FORM = {"Content-Type": "application/x-www-form-urlencoded"}
GOOD_PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


@pytest.fixture
def turnstile(client, monkeypatch):
    from services import turnstile as service

    monkeypatch.setattr(
        service, "_post", lambda url, fields, timeout: json.dumps({"success": True})
    )


@pytest.fixture
def entrant(client, turnstile):
    """A signed-in entrant, through the real routes — the session cookie
    this file derives tokens from has to be a real one."""
    from app.config import settings

    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "parent@example.com",
                "password": GOOD_PW,
                "turnstileToken": "a-solved-token",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    r = client.post(
        "/e/account/login",
        json={"email": "parent@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text
    return r.cookies[settings.entrant_session_cookie_name]


def _token_for(secret: str) -> str:
    from app.form_csrf import form_csrf_token

    return form_csrf_token(secret)


# ---- the session-derived channel ---------------------------------------


def test_a_form_write_with_a_session_and_no_csrf_field_is_refused(client, entrant):
    """Negative control #2, first half (spec section 3). The cookie is
    real and the route is real; the only thing missing is the proof."""
    r = client.post("/e/account/logout", data={}, headers=FORM)

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_csrf_field_minted_from_a_different_session_is_refused(
    client, entrant
):
    """Negative control #2, second half. A token is only proof if it is
    proof of *this* caller's cookie — a valid-looking digest computed from
    somebody else's session must not pass, or the channel degrades to
    "presented a 64-character hex string"."""
    foreign = _token_for("a-different-entrants-session-token")

    r = client.post("/e/account/logout", data={"_csrf": foreign}, headers=FORM)

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_the_matching_csrf_field_is_accepted(client, entrant):
    """**Negative control #3 — non-vacuity.** The same write, the same
    cookie, the same route, differing only in a correct token: 204. Without
    this the two refusals above would pass just as well against a channel
    that was never wired up at all."""
    r = client.post(
        "/e/account/logout", data={"_csrf": _token_for(entrant)}, headers=FORM
    )

    assert r.status_code == 204


def test_a_json_body_cannot_carry_the_second_channel(client, entrant):
    """The channel is a form field, not a JSON key. Reading a body to look
    for a token on every cookie-carrying write would be a cost paid by the
    whole API for one surface; the urlencoded content type is the gate."""
    r = client.post(
        "/e/account/logout", json={"_csrf": _token_for(entrant)}
    )

    assert r.status_code == 403


# ---- the pre-session channel (the gap R8-B closes) ---------------------


def test_a_login_post_carrying_the_nonce_and_no_token_is_refused(client):
    """The pre-session gap, now closed. Before this, a login post carried
    no session, so ``form_csrf_token`` had nothing to derive from and the
    middleware never even looked at the request."""
    from app.config import settings
    from app.form_csrf import issue_play_csrf
    from fastapi import Response

    response = Response()
    issue_play_csrf(response)
    nonce = response.headers["set-cookie"].split("=", 1)[1].split(";", 1)[0]
    client.cookies.set(settings.entrant_csrf_cookie_name, nonce)

    r = client.post(
        "/e/account/login",
        data={"email": "parent@example.com", "password": GOOD_PW},
        headers=FORM,
    )

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_login_post_with_the_nonce_token_reaches_the_route(client):
    """Non-vacuity for the pre-session half. 422 rather than 200 is the
    right assertion and the honest one: the route declares a JSON body, so
    reaching it *is* the outcome under test — the middleware let it past,
    which a 403 would not have."""
    from app.config import settings
    from app.form_csrf import issue_play_csrf
    from fastapi import Response

    response = Response()
    token = issue_play_csrf(response)
    nonce = response.headers["set-cookie"].split("=", 1)[1].split(";", 1)[0]
    client.cookies.set(settings.entrant_csrf_cookie_name, nonce)

    r = client.post(
        "/e/account/login",
        data={"email": "parent@example.com", "password": GOOD_PW, "_csrf": token},
        headers=FORM,
    )

    assert r.status_code == 422


# ---- operator containment ----------------------------------------------


def test_an_operator_cookie_is_never_rescued_by_channel_two(client, entrant):
    """**The blast-radius bound.** Channel two exists for a surface that
    cannot send a header. The operator SPA can and does, so a request
    carrying the operator cookie must prove itself the operator's way —
    always, and regardless of what else is in the jar. Same origin (R8-A)
    means both cookies can ride one request; this is the line that stops a
    proof minted for the entrant tier from authorizing an operator write.
    """
    from app.config import settings

    client.cookies.set(settings.session_cookie_name, "an-operator-token")

    r = client.post(
        "/e/account/logout", data={"_csrf": _token_for(entrant)}, headers=FORM
    )

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_the_header_still_works_for_everyone(client, entrant):
    """Channel one is untouched: adding a channel must not cost the one
    that already carries the whole SPA."""
    assert client.post("/e/account/logout", headers=CSRF).status_code == 204


def test_a_cookieless_write_is_still_never_checked(client):
    """The trigger widened to include the nonce, not to include everything.
    A request with no relevant cookie at all is still untouched — that is
    what keeps bearer clients and the local bootstrap flow working."""
    client.cookies.clear()
    r = client.post(
        "/auth/register",
        json={"email": "someone@example.com", "password": GOOD_PW},
    )
    assert r.status_code == 201
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_form_csrf_channel.py`

Expected: FAIL — `test_the_matching_csrf_field_is_accepted` fails `assert 403 == 204`, `test_a_login_post_carrying_the_nonce_and_no_token_is_refused` fails `assert 422 == 403` (the trigger does not yet include the nonce, so the middleware never fires), and `test_a_login_post_with_the_nonce_token_reaches_the_route` passes for the wrong reason. The two refusal tests pass vacuously — which is exactly why the non-vacuity tests are in the same file.

- [ ] **Step 3: Write minimal implementation**

Append to `products/scheduler/backend/app/form_csrf.py`:

```python
# Channel two only reads a body it can cheaply understand. A JSON write
# has a header available to it and does not need this.
_URLENCODED = "application/x-www-form-urlencoded"


def _cookie_secrets(request: Request) -> list[str]:
    """The unreadable values this caller could legitimately derive from.

    Entrant cookies only. The operator cookie is deliberately absent — see
    ``form_csrf_proves``.
    """
    return [
        value
        for value in (
            request.cookies.get(settings.entrant_session_cookie_name),
            request.cookies.get(settings.entrant_csrf_cookie_name),
        )
        if value
    ]


async def form_csrf_proves(request: Request) -> bool:
    """Does this write present a token derived from one of its own cookies?

    The second of two enumerated CSRF proof channels (R8-B). Returns
    ``False`` — never raises — on every path that cannot produce a proof,
    so the caller's ``and not`` composition stays readable and a
    malformed body is a refusal rather than a 500.

    **An operator cookie disables this channel outright.** Channel two
    exists for a surface that physically cannot attach a header; the
    operator SPA can, and does. Under R8-A both principals' cookies can
    ride the same origin, so without this line a token minted for the
    entrant tier would satisfy the check on an operator write. The bound
    is on the principal, not on the path — a path bound is the exemption
    this channel was built to delete.
    """
    if settings.session_cookie_name in request.cookies:
        return False
    if not request.headers.get("content-type", "").startswith(_URLENCODED):
        return False

    expected = [form_csrf_token(secret) for secret in _cookie_secrets(request)]
    if not expected:
        return False

    form = await request.form()
    presented = str(form.get(FORM_FIELD) or "")
    return any(secrets.compare_digest(presented, token) for token in expected)
```

extending its imports with `from fastapi import Request, Response`.

In `products/scheduler/backend/app/main.py`, replace the `csrf_middleware` docstring's third paragraph (lines 268-282, from "**One route is exempt…**" to the closing quotes) and the condition at 283-288:

```python
    **Two enumerated proof channels, and no path-based exemption**
    (SP-PROGRAM-1 Phase 6, ruling R8-B). The header is channel one and
    proves "a same-origin browser sent this deliberately", because a
    cross-site page cannot attach it without a preflight we do not
    approve. A native ``<form method=post>`` cannot attach it either —
    that is the same property seen from the other side — so an unhydrated
    entrant form would be refused the moment it carried a cookie, and a
    public entry form that needs JavaScript to submit is degraded
    functionality at exactly the widths ruling R11 makes co-equal.

    Channel two is a **double-submit token derived from a cookie the
    attacker's page can make the browser send but can never read**
    (``app/form_csrf.py``). It replaced a path regex that exempted one
    route: an exemption is a hole that grows and has to be re-argued every
    time a path changes shape, while a channel is a property every write
    in the application is measured against. The trigger reads
    ``settings.csrf_relevant_cookie_names``, which is wider than the
    session registry by exactly the pre-session nonce — the login post
    carries no session and was therefore never checked at all.
    """
    if (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and any(
            name in request.cookies
            for name in settings.csrf_relevant_cookie_names
        )
        and request.headers.get("X-ShuttleWorks-CSRF") != "1"
        and not await form_csrf_proves(request)
        and not _FORM_CSRF_ROUTES.match(request.url.path)
    ):
```

and add to the imports beside line 34:

```python
from app.form_csrf import form_csrf_proves
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_form_csrf_channel.py tests/test_csrf_cookie_registry.py tests/test_entrant_auth_routes.py tests/test_cross_principal_sessions.py`

Expected: PASS.

**Negative control, run by hand and restored:** delete `and not settings.session_cookie_name in request.cookies` — i.e. the first two lines of `form_csrf_proves` — and `test_an_operator_cookie_is_never_rescued_by_channel_two` goes red. Delete the whole `and not await form_csrf_proves(request)` disjunct and the three non-vacuity tests go red while the refusal tests stay green, which is the shape that proves the refusals were never the assertion doing the work.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/app/form_csrf.py products/scheduler/backend/app/main.py products/scheduler/tests/test_form_csrf_channel.py
git commit -m "feat(csrf): add the second enumerated proof channel

Phase 6 R8-B: a cookie-carrying write is accepted with the custom header
OR a valid cookie-derived double-submit token, so an unhydrated entrant
form still submits. The trigger widens from session_cookie_names to
csrf_relevant_cookie_names, which closes the pre-session login gap where
the check never fired at all.

An operator cookie disables channel two outright — under same-origin
(R8-A) both principals ride one origin, and a token minted for the
entrant tier must never authorize an operator write. The bound is on the
principal, not the path.

The _FORM_CSRF_ROUTES clause is evaluated LAST on purpose so submit runs
through channel two from here; the clause and the body-replay fix land
together in the next commit."
```

---

### Task 7: Delete the path-based exemption, replay the body, contain the operator cookie

**Files:**
- Modify: `products/scheduler/backend/app/main.py:2` (drop `import re`), `:237-242` (delete `_FORM_CSRF_ROUTES`), `:283-292` (drop its clause)
- Modify: `products/scheduler/backend/app/form_csrf.py` (add the receive-channel replay)
- Modify: `products/scheduler/frontend/nginx.conf:24-27` (add the containment map), `:207-218` (`location /e/`)
- Modify: `products/scheduler/tests/test_csrf_cookie_registry.py:225-250`
- Modify: `products/scheduler/tests/test_cross_principal_sessions.py:320` (append)
- Test: `products/scheduler/tests/test_form_csrf_channel.py` (append), `products/scheduler/tests/test_entrant_tier_containment.py` (create)

**Interfaces:**
- Consumes: `app.form_csrf.form_csrf_proves` (Task 6); `_operator_cookie`, `_only`, `_routes`, `_concrete`, `OPS_TOKEN_GATED` from `tests/test_cross_principal_sessions.py:93-134` and `tests/test_auth_surface.py`.
- **ORDERING DEPENDENCY — this task must land after the cut-over task group.** Deleting `_FORM_CSRF_ROUTES` is only correct once `GET /e/{slug}` and `POST /e/{slug}/submit` (`api/entries_public.py:1094-1110`, `:1112-1265`) are gone, because those are the routes the exemption named and their tests scrape a rendered hidden field. Two orders both work and the plan must pick one: **run the cut-over group first**, then this task, and the body-replay test below retargets to `POST /e/api/submit/{slug}`. If this task runs before the cut-over, keep the route path `/e/{slug}/submit` in the replay test exactly as written below — the test is written against the incumbent route so it is runnable either way, and the cut-over group must then port it, citing this test by name.
- Produces: `app/main.py` with **zero** path-based CSRF exemptions (asserted from source); `form_csrf_proves` with a replayed receive channel; `nginx.conf` `map $http_cookie $sw_play_session_c` + `proxy_set_header Cookie $sw_play_session_c;` inside `location /e/`.
- **Not produced here, and owed by the entrant-app task group:** the other half of negative control #4 — a vitest assertion that the node SSR fetch layer emits no `Cookie` header on any outbound call. That test needs the node package, which does not exist in this task group. Name it `products/scheduler/entrant/app/lib/__tests__/api.relay-abstinence.test.ts` and have it assert `fetch` is called with headers containing no `cookie` key on every loader path.

- [ ] **Step 1: Write the failing test**

Append to `products/scheduler/tests/test_form_csrf_channel.py`:

```python
# ---- the body-replay trap ----------------------------------------------
#
# Channel two reads an urlencoded body inside the middleware. Starlette's
# ``Request.form()`` consumes the request stream (``requests.py``:
# ``_get_form`` builds a ``FormParser`` over ``self.stream()``, never
# ``self.body()``), and ``BaseHTTPMiddleware._CachedRequest.wrapped_receive``
# replays a body downstream **only if ``body()`` set ``_body``** — a
# stream-consumed request downstream receives ``b""``. So without an
# explicit replay the route sees an EMPTY FORM. It does not raise; it
# refuses, politely, as though the entrant had filled in nothing. Silent
# truncation is the failure mode this test exists for.


@pytest.fixture
def page(client):
    """A workspace with an open entry page and two events."""
    tid = client.post(
        "/tournaments", json={"name": "Spring Open"}, headers=CSRF
    ).json()["id"]

    from database.models import EntryEvent, EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="spring-open",
                is_open=True,
                regulations_text="Play fair.",
                regulations_version=1,
                fee_schedule={"1": 4000, "2": 5500},
            )
        )
        ms = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
            fee_cents=1500,
        )
        ws = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="WS",
            discipline="Women's Singles",
            entry_type="singles",
            fee_cents=1500,
        )
        session.add_all([ms, ws])
        session.commit()
        return {"tid": tid, "slug": "spring-open", "ms": str(ms.id), "ws": str(ws.id)}
    finally:
        session.close()


def _entries(tid):
    from database.models import Entry
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        return list(
            session.scalars(
                select(Entry).where(Entry.tournament_id == uuid.UUID(tid))
            )
        )
    finally:
        session.close()


def test_a_large_multi_player_submission_survives_the_middleware(
    client, page, entrant
):
    """**The replay trap, proven at the size that hides it.**

    Three players, two events each, and remarks near the per-field cap —
    the body a club secretary actually posts. If the middleware consumes
    the stream without replaying it, this does not error: the route reads
    an empty form, finds no acknowledgment, and answers 400 with a banner
    telling the entrant to accept the regulations they did accept.
    """
    remarks = "cannot play before 6pm on the Saturday. " * 45
    assert 1500 < len(remarks) <= 2000

    data = [
        ("acknowledged", "on"),
        ("_csrf", _token_for(entrant)),
    ]
    for index in range(3):
        data.extend(
            [
                ("playerName", f"Player {index}"),
                ("gender", "F"),
                ("club", "Riverside"),
                ("birthYear", "2004"),
                ("remarks", remarks),
                ("events", f"{index}:{page['ms']}"),
                ("events", f"{index}:{page['ws']}"),
            ]
        )

    r = client.post(f"/e/{page['slug']}/submit", data=data)

    assert r.status_code == 201, r.text
    entries = _entries(page["tid"])
    assert len(entries) == 6, "the route saw a truncated form"
    assert {e.remarks for e in entries} == {remarks.strip()}
```

Replace `products/scheduler/tests/test_csrf_cookie_registry.py:225-250` (the section header comment and `test_the_form_csrf_exemption_matches_exactly_one_route_shape`) with:

```python
# ---- 3. Zero path-based exemptions ------------------------------------
#
# SP-E1-2 Phase C carved a single route out of the header check and pinned
# that it was the only one. Phase 6 (ruling R8-B) **deletes** it rather
# than narrowing it: the middleware gained a second enumerated proof
# channel, so the surface that could not send a header proves itself
# inside the check instead of around it. An exemption is a hole that has
# to be re-argued every time a path changes shape; a channel is a property
# every write is measured against.
#
# So the claim inverts. It used to be "the exemption matches one route
# shape". It is now "there is no exemption", derived from the source —
# because the previous form would have passed happily against a *second*
# exemption added beside the first.


def _csrf_middleware_ast() -> ast.AST:
    tree = ast.parse((_BACKEND_DIR / "app" / "main.py").read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "csrf_middleware":
            return node
    raise AssertionError(
        "csrf_middleware is not in app/main.py — this guard is scanning nothing"
    )


def test_the_middleware_declares_zero_path_based_csrf_exemptions(client):
    """The structural claim, derived rather than remembered.

    Nothing in ``csrf_middleware`` may read the request path. Any path
    read is an exemption or the beginning of one, whatever it is called —
    ``request.url.path``, a compiled regex, a prefix test.
    """
    import app.main as main

    assert not hasattr(main, "_FORM_CSRF_ROUTES"), (
        "the deleted path exemption is back in app/main.py"
    )

    dumped = ast.dump(_csrf_middleware_ast())
    for attribute in ("url", "path", "startswith", "match", "fullmatch"):
        assert f"attr='{attribute}'" not in dumped, (
            "csrf_middleware reads the request path via "
            f"'.{attribute}' — Phase 6 R8-B deleted path-based CSRF "
            "exemptions; prove the write with a channel, not a path"
        )

    source = (_BACKEND_DIR / "app" / "main.py").read_text(encoding="utf-8")
    assert "re.compile" not in source, (
        "app/main.py compiles a regex again — the only one it ever had was "
        "the CSRF path exemption"
    )


def test_the_exemption_guard_can_actually_see_the_middleware(client):
    """Non-vacuity for the guard above: a scan that found no function, or
    an empty dump, would pass every assertion in it."""
    dumped = ast.dump(_csrf_middleware_ast())
    assert "form_csrf_proves" in dumped, (
        "csrf_middleware no longer calls channel two — either the scan is "
        "broken or the channel is gone"
    )
    assert "csrf_relevant_cookie_names" in dumped
```

Create `products/scheduler/tests/test_entrant_tier_containment.py`:

```python
"""The operator cookie is inadmissible on the entrant tier, by construction.

SP-PROGRAM-1 Phase 6, spec section 3, negative control #4 (the nginx half).

Ruling R8-A puts the SSR entrant app on the same origin as the operator
SPA and the API, which means one cookie jar and one request that can carry
both principals' credentials. The node tier renders and never relays a
credential — but "never" has to be a property of the configuration, not a
convention in a fetch wrapper, because the trust seam in front of it has
already been got wrong once (`app/client_ip.py` fails OPEN into one global
bucket when it stops matching, and `frontend/nginx.conf:19-23` records the
review that found the wrong container named).

So nginx rewrites ``Cookie`` on the way into the node tier and only the
entrant session survives it. Asserted against the config text because that
is where the property lives; a Python test cannot boot nginx, and a test
that could would not be the one that catches an edit to this file.

The other half of this control — that node's own fetch layer emits no
``Cookie`` outbound — belongs to the entrant app and is asserted in
``products/scheduler/entrant/app/lib/__tests__/api.relay-abstinence.test.ts``.
"""
from __future__ import annotations

import re
from pathlib import Path

_NGINX = (
    Path(__file__).resolve().parents[2]
    / "scheduler"
    / "frontend"
    / "nginx.conf"
)


def _location_block(name: str) -> str:
    source = _NGINX.read_text(encoding="utf-8")
    start = source.index(f"location {name} {{")
    depth = 0
    for offset, char in enumerate(source[start:], start):
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start : offset + 1]
    raise AssertionError(f"location {name} has an unbalanced brace")


def test_the_entrant_tier_receives_only_the_entrant_session_cookie():
    block = _location_block("/e/")

    assert "proxy_set_header Cookie $sw_play_session_c;" in block, (
        "location /e/ forwards the caller's whole cookie jar to the "
        "entrant tier — the operator session must not be admissible there"
    )


def test_the_cookie_map_extracts_the_entrant_session_and_nothing_else():
    source = _NGINX.read_text(encoding="utf-8")
    match = re.search(
        r"map \$http_cookie \$sw_play_session_c \{(.*?)\}", source, re.S
    )
    assert match, "the $sw_play_session_c map is gone"

    body = match.group(1)
    assert "sw_play_session=" in body
    assert "sw_session=" not in body, (
        "the containment map names the operator cookie — it must extract "
        "the entrant cookie and let everything else fall to the default"
    )
    assert 'default ""' in body or "default   \"\"" in body, (
        "the map has no empty default, so an unmatched jar passes through"
    )


def test_the_map_is_not_vacuous_because_the_variable_is_actually_used():
    """A map nobody reads is decoration. This is the control for the two
    assertions above: the variable defined by the map is the one the
    location forwards."""
    source = _NGINX.read_text(encoding="utf-8")
    assert source.count("$sw_play_session_c") >= 2
```

Append to `products/scheduler/tests/test_cross_principal_sessions.py` (after line 320):

```python
def test_a_relayed_operator_cookie_without_the_header_reaches_no_write(client):
    """**The third caller** (Phase 6, spec section 3, negative control #5).

    The two callers above are the two principals. This is the one ruling
    R8-A creates: a *deputy* — a node process holding a cookie it did not
    mint, forwarding it to the API. The design forbids the deputy outright
    (node relays no credential), and this is the property that holds even
    if one day something does relay one: a cookie without the header
    authorizes no write anywhere in the application.

    That is not a claim about a route list, it is a claim about the whole
    write surface, so it sweeps the OpenAPI document. Writes only —
    reads are not CSRF-gated and never were, which is why the operator
    cookie containment in nginx exists alongside this rather than instead
    of it.
    """
    from app.config import settings
    from app.main import app

    operator = _operator_cookie(client)
    _only(client, settings.session_cookie_name, operator)

    reachable: list[str] = []
    checked = 0
    for method, path in _routes(app):
        if method not in ("POST", "PUT", "PATCH", "DELETE"):
            continue
        if (method, path) in OPS_TOKEN_GATED:
            continue
        checked += 1
        r = client.request(method, _concrete(path), json={})
        if r.status_code not in (401, 403, 404):
            reachable.append(f"{method} {path} -> {r.status_code}")

    assert checked > 20, f"only {checked} writes swept — the scan is broken"
    assert not reachable, (
        "A relayed operator cookie with no CSRF header authorized these "
        "writes:\n  " + "\n  ".join(sorted(reachable))
    )


def test_the_relay_sweep_is_not_vacuous(client):
    """Control for the sweep above, in the shape `:323` uses for its own:
    the identical loop, with the header restored, finds reachable writes.
    Without it a sweep that refused everything for an unrelated reason
    would be indistinguishable from a passing one."""
    from app.config import settings
    from app.main import app

    operator = _operator_cookie(client)
    _only(client, settings.session_cookie_name, operator)

    reachable = 0
    for method, path in _routes(app):
        if method not in ("POST", "PUT", "PATCH", "DELETE"):
            continue
        if (method, path) in OPS_TOKEN_GATED:
            continue
        r = client.request(method, _concrete(path), json={}, headers=CSRF)
        if r.status_code not in (401, 403, 404):
            reachable += 1

    assert reachable > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_form_csrf_channel.py tests/test_csrf_cookie_registry.py tests/test_entrant_tier_containment.py tests/test_cross_principal_sessions.py`

Expected: FAIL —
- `test_the_middleware_declares_zero_path_based_csrf_exemptions`: `AssertionError: the deleted path exemption is back in app/main.py` (it never left).
- `test_the_entrant_tier_receives_only_the_entrant_session_cookie` and `test_the_cookie_map_extracts_the_entrant_session_and_nothing_else`: the map and the header do not exist yet.
- `test_a_large_multi_player_submission_survives_the_middleware` **passes at this point**, because `_FORM_CSRF_ROUTES` still short-circuits… no: the clause is evaluated last (Task 6), so channel two runs first and consumes the body — expect `assert 400 == 201` with the body containing "Please accept the regulations". If it passes instead, the Task 6 clause ordering was not applied; fix that before continuing.

- [ ] **Step 3: Write minimal implementation**

In `products/scheduler/backend/app/form_csrf.py`, insert the replay into `form_csrf_proves`, immediately before `form = await request.form()`:

```python
    # **Replay the receive channel or the route sees an empty form.**
    #
    # ``Request.form()`` for urlencoded builds a ``FormParser`` over
    # ``self.stream()`` and never touches ``self.body()``, so it consumes
    # the stream without caching it. Starlette's
    # ``BaseHTTPMiddleware._CachedRequest.wrapped_receive`` replays a body
    # downstream only when ``_body`` is set — a stream-consumed request
    # hands the route ``b""`` instead. Calling ``body()`` first fills
    # ``_body`` (``stream()`` then yields it back to the parser here, and
    # ``wrapped_receive`` yields it again to the route), so both this check
    # and the handler see the same bytes.
    #
    # The failure this prevents is SILENT: nothing raises, the route
    # simply reads a form with no fields in it and refuses the entrant for
    # not filling anything in. ``test_form_csrf_channel.py::
    # test_a_large_multi_player_submission_survives_the_middleware`` is the
    # tripwire; delete this line and it goes red.
    await request.body()
```

In `products/scheduler/backend/app/main.py`: delete `import re` (line 3), delete lines 237-242 (the `_FORM_CSRF_ROUTES` comment block and assignment), and delete the final disjunct of the condition so it reads:

```python
    if (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and any(
            name in request.cookies
            for name in settings.csrf_relevant_cookie_names
        )
        and request.headers.get("X-ShuttleWorks-CSRF") != "1"
        and not await form_csrf_proves(request)
    ):
```

In `products/scheduler/frontend/nginx.conf`, insert after the `$sw_limit_key` map (after line 27):

```nginx
# Operator-cookie containment on the entrant tier (SP-PROGRAM-1 Phase 6,
# ruling R8-A).
#
# One public hostname now serves the operator SPA, the entrant SSR app and
# the API, which means one cookie jar and one request that can carry both
# principals' credentials. The node tier renders pages from public
# projections and needs no credential at all; the one it must never be
# handed is `sw_session`, because a process holding an operator session is
# one bug away from being a deputy for it.
#
# So `location /e/` replaces the Cookie header with whatever this map
# extracts, and this map extracts exactly the entrant session. Everything
# else — the operator session included — falls to the empty default and
# never crosses. Inadmissible by construction, not by convention.
#
# The FastAPI locations (`/e/api/`, `/e/account/`) must NOT inherit this:
# they are the write plane and they need `sw_play_csrf` for the
# double-submit channel. `proxy_set_header` does not inherit across
# sibling locations, so this is a property of the node block alone.
map $http_cookie $sw_play_session_c {
    default "";
    "~*(?:^|;\s*)(sw_play_session=[^;]*)" "$1";
}
```

and add one line inside `location /e/` (after `proxy_pass`, at line 210):

```nginx
        proxy_set_header Cookie $sw_play_session_c;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_form_csrf_channel.py tests/test_csrf_cookie_registry.py tests/test_entrant_tier_containment.py tests/test_cross_principal_sessions.py tests/test_entries_public_routes.py`

Expected: PASS.

Then the config gates: `docker compose -f docker-compose.yml config > /dev/null` and `docker run --rm -v "$PWD/products/scheduler/frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginxinc/nginx-unprivileged:alpine nginx -t`.

Then the full backend suite: `cd products/scheduler && pytest`.

**The four negative controls, run by hand and restored** (CODE_HEALTH 3b — record each result beside the guard):
1. **Zero exemptions.** Reinstate `and not request.url.path.startswith("/e/")` in `csrf_middleware` → `test_the_middleware_declares_zero_path_based_csrf_exemptions` goes red on `attr='path'`. Restore.
2. **Replay.** Delete the `await request.body()` line → `test_a_large_multi_player_submission_survives_the_middleware` goes red with `assert 400 == 201`, and nothing else in the suite moves — which is the proof that the truncation is silent. Restore.
3. **Relay sweep.** Change `client.request(..., json={})` to `..., json={}, headers=CSRF` in `test_a_relayed_operator_cookie_without_the_header_reaches_no_write` → it goes red with a long reachable list, which is `test_the_relay_sweep_is_not_vacuous` seen from the other side. Restore.
4. **nginx containment.** Delete the `proxy_set_header Cookie $sw_play_session_c;` line → `test_the_entrant_tier_receives_only_the_entrant_session_cookie` goes red. Restore.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/app/main.py products/scheduler/backend/app/form_csrf.py products/scheduler/tests/test_form_csrf_channel.py
git commit -m "feat(csrf)!: delete the path-based exemption and replay the body

Phase 6 R8-B. _FORM_CSRF_ROUTES and its clause are DELETED, not ported:
the route the exemption named is gone and channel two now proves the same
property inside the check instead of around it.

Fixes the silent-truncation trap in the same commit. Request.form() for
urlencoded consumes the stream via stream(), never body(), and Starlette's
_CachedRequest.wrapped_receive replays downstream only when _body is set —
so without an explicit body() the route read an EMPTY form and refused the
entrant for filling nothing in. Nothing raised. A three-player submission
with capped remarks is the tripwire; deleting the replay turns it red and
moves nothing else in the suite."

git add products/scheduler/frontend/nginx.conf products/scheduler/tests/test_entrant_tier_containment.py
git commit -m "feat(nginx): make the operator cookie inadmissible on the entrant tier

Phase 6 R8-A puts SSR, SPA and API on one origin and therefore one cookie
jar. location /e/ now replaces Cookie with a map that extracts only
sw_play_session, so the node tier cannot hold an operator session even by
accident. The FastAPI locations deliberately do not inherit it — they need
sw_play_csrf for the double-submit channel.

Half of negative control #4; the node-side fetch-abstinence assertion is
owed by the entrant app package."

git add products/scheduler/tests/test_csrf_cookie_registry.py
git commit -m "test(csrf): assert zero path-based CSRF exemptions, from source

Supersedes test_the_form_csrf_exemption_matches_exactly_one_route_shape
(test_csrf_cookie_registry.py:240), which pinned that the exemption
matched one route shape. Ruling R8-B deletes the exemption rather than
narrowing it, and the superseded form would have passed against a SECOND
exemption added beside the first. The replacement parses app/main.py and
fails if csrf_middleware reads the request path by any means, with a
non-vacuity test that the scan really reaches the middleware."

git add products/scheduler/tests/test_cross_principal_sessions.py
git commit -m "test(auth): sweep a third caller — a relayed operator cookie

Extends test_no_route_outside_the_public_surface_answers_an_entrant_cookie
(test_cross_principal_sessions.py:281) with the caller ruling R8-A
creates: a deputy holding a cookie it did not mint. Every write in the
OpenAPI document must refuse it without the header. Keeps the existing
:323 non-vacuity control untouched and adds its own alongside, because a
sweep that refuses everything looks identical to one that works."
```

---

# Phase 6 — the new backend JSON surfaces (Tasks 8–12)

These five tasks build the FastAPI half of spec §4. They are additive: the incumbent HTML routes (`GET /e/{slug}`, `POST /e/{slug}/submit`) stay alive throughout and are removed at the §9 cut-over commit, which is a later task. That is deliberate — CODE_HEALTH #7 (no big-bang rewrites): the new surface is proven against the same fixtures before the old one is deleted.

**Two facts verified in the repo that shape every task below:**

1. `tests/test_tenant_isolation.py:66-75` derives its sweep from paths containing the literal `{tournament_id}`. **None of the routes in this range are workspace-path-scoped** — they are keyed by `entry_pages.slug`, whose tenancy seam is `_resolve` (`api/entries_public.py:254-263`) answering the uniform `TOURNAMENT_NOT_FOUND` 404 for an unknown or closed slug. So the sweep neither grows nor shrinks, `test_enumeration_is_nonempty_and_covers_the_known_surface` (`:91`, floor `>= 67`) stays green untouched, and the CLAUDE.md `tournament_id` + `require_tournament_access` convention does **not** apply. Adding a `{tournament_id}` param here would be the wrong fix: a raw workspace UUID must never be a public address (the same rule the display routes hold).
2. Starlette matches on anchored full-path regexes, so `/e/api/page/{slug}` (4 segments) cannot be shadowed by `GET /e/{slug}` (2 segments) or `POST /e/{slug}/submit` (3 segments, literal tail). The new router is nevertheless registered **before** `entries_public_api.router` so the ordering is not load-bearing on a future path edit.

---

### Task 8: `GET /e/api/page/{slug}` — the loader projection

**Files:**
- Create: `products/scheduler/backend/api/entries_json.py`
- Modify: `products/scheduler/backend/app/main.py:12-33` (import block), `products/scheduler/backend/app/main.py:419` (router registration)
- Modify: `products/scheduler/tests/test_auth_surface.py:79-123` (`PUBLIC_BY_DESIGN` allowlist)
- Test: `products/scheduler/tests/test_entries_json_routes.py`

**Interfaces:**
- Consumes (all existing, verified): `api.entries_public._resolve(repo: LocalRepository, slug: str) -> Tuple[EntryPage, Tournament]` (`:254`), `._events(repo, tournament_id: uuid.UUID) -> List[EntryEvent]` (`:266`), `._event_is_open(event: EntryEvent, now: datetime) -> bool` (`:277`), `._entrants(repo, tournament_id) -> List[Tuple[str, uuid.UUID]]` (`:285`), `._entry_counts(repo, tournament_id) -> dict` (`:781`), `._is_age_bracketed(event) -> bool` (`:800`), `._moment(value: datetime) -> str` (`:741`), `._optional_entrant(request, repo) -> Tuple[Optional[AuthEntrant], str]` (`:1066`), `._form_csrf(session_token: Optional[str]) -> str` (`:212`), `services.entry_fees.normalize_fee_schedule(raw: Any) -> dict[int, int]`.
- Produces: module `api/entries_json.py` with `router = APIRouter(prefix="/e/api", tags=["entries-public"])`; route `GET /e/api/page/{slug}` → `EntryPageProjection`; pydantic DTOs `EntryPageProjection`, `ViewerDTO`, `EventDTO`, `EntrantRowDTO`, `PageDTO`, `PolicyDTO`, `TournamentDTO`, `NamedDTO`, `VenueDTO`. Tasks 9–11 add routes to this same router; Task 12 imports `require_form_csrf` from it (added in Task 10).

- [ ] **Step 1: Write the failing test**

Create `products/scheduler/tests/test_entries_json_routes.py`. Fixtures mirror `tests/test_entries_public_routes.py:56-206` deliberately — the JSON surface must be provably the same projection as the HTML one it replaces, and a second set of fixtures would let the two drift.

```python
"""The entrant tier's JSON surface (Phase 6, spec §4).

The RR7 app renders; **this** is what it renders. Every route here is the
JSON counterpart of something ``api/entries_public.py`` used to emit as
f-string HTML, and the fixtures are lifted from
``tests/test_entries_public_routes.py`` on purpose: the incumbent's
behaviour is the contract, so the two files must be exercising the same
workspace, the same fee schedule and the same events. A second fixture set
would let the surfaces drift and call it a passing suite.

**Invariant I6 has its own test and its own break-it recipe**, because a
projection leak is silent: the page still renders, it just carries a field
nobody meant to publish. See
``test_the_projection_never_carries_an_entrants_contact_data``.
"""
from __future__ import annotations

import json
import re
import uuid

import pytest

from tests._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


@pytest.fixture
def turnstile(client, monkeypatch):
    """Cloudflare's dummy-key semantics, without Cloudflare — the entrant
    fixture below signs up for real, and signup is where the challenge is."""
    from services import turnstile as service

    def fake_post(url, fields, timeout):
        if fields.get("secret", "").startswith("2x"):
            return json.dumps(
                {"success": False, "error-codes": ["invalid-input-response"]}
            )
        return json.dumps({"success": True})

    monkeypatch.setattr(service, "_post", fake_post)


@pytest.fixture
def page(client):
    """A workspace with an open entry page and two entry events.

    Seeded directly, carrying the R14 configuration the projection reports:
    a cumulative fee schedule, payment prose, a venue and a regulations
    version.
    """
    tid = client.post(
        "/tournaments", json={"name": "Spring Open"}, headers=CSRF
    ).json()["id"]

    from database.models import EntryEvent, EntryPage, Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        t = session.get(Tournament, uuid.UUID(tid))
        t.tournament_date = "2026-09-12"
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="spring-open",
                is_open=True,
                intro_text="All welcome.",
                regulations_text="Play fair. Bring your own shuttles.",
                waiver_required=True,
                regulations_version=3,
                fee_schedule={"1": 4000, "2": 5500},
                payment_instructions="Zelle to treasurer@club.example.",
                venue_name="Riverside Sports Hall",
                venue_address="12 Mill Lane",
            )
        )
        ms = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
            fee_cents=1500,
            gender_constraint="M",
        )
        ws = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="WS",
            discipline="Women's Singles",
            entry_type="singles",
            gender_constraint="F",
        )
        session.add_all([ms, ws])
        session.commit()
        return {"tid": tid, "slug": "spring-open", "ms": str(ms.id), "ws": str(ws.id)}
    finally:
        session.close()


@pytest.fixture
def entrant(client, turnstile):
    """A signed-in entrant, created through the real routes.

    No fixture shortcut: a shortcut would mean the session gate these tests
    exist to assert was never crossed for real.
    """
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "parent@example.com",
                "password": GOOD_PW,
                "turnstileToken": "a-solved-token",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    assert (
        client.post(
            "/e/account/login",
            json={"email": "parent@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )
    return "parent@example.com"


def _html_submit(client, page):
    """Write one entry through the INCUMBENT route.

    Used only to put a row on the entrant list so the projection has
    something to project. Deliberately the old route: at this task the new
    one does not exist yet, and using the shipped path keeps the fixture
    honest about what the list is built from.
    """
    body = client.get(f"/e/{page['slug']}").text
    token = re.search(r'name="_csrf" value="([0-9a-f]*)"', body).group(1)
    return client.post(
        f"/e/{page['slug']}/submit",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ws']}"],
            "acknowledged": "on",
            "_csrf": token,
        },
    )


# ---- GET /e/api/page/{slug} ---------------------------------------------


def test_the_page_projection_carries_the_public_blocks(client, page):
    r = client.get(f"/e/api/page/{page['slug']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tournament"] == {"name": "Spring Open", "date": "2026-09-12"}
    assert body["page"]["slug"] == "spring-open"
    assert body["page"]["introText"] == "All welcome."
    assert body["page"]["regulationsVersion"] == 3
    # Read through normalize_fee_schedule, never off the raw column: the
    # card the entrant reads must quote the tiers the pricing actually uses.
    assert body["page"]["feeSchedule"] == {"1": 4000, "2": 5500}
    assert body["page"]["paymentInstructions"] == "Zelle to treasurer@club.example."
    assert body["venue"] == {"name": "Riverside Sports Hall", "address": "12 Mill Lane"}
    assert body["policy"]["waiverRequired"] is True
    assert body["policy"]["maxEventsPerPerson"] is None
    by_code = {ev["code"]: ev for ev in body["events"]}
    assert set(by_code) == {"MS", "WS"}
    assert by_code["MS"]["feeCents"] == 1500
    assert by_code["MS"]["genderConstraint"] == "M"
    assert by_code["MS"]["isOpen"] is True
    assert by_code["MS"]["ageBracketed"] is False
    assert by_code["MS"]["entryCount"] == 0
    assert body["entrants"] == []
    assert body["viewer"] == {"signedIn": False, "email": None, "formCsrf": ""}


def test_an_unknown_slug_answers_the_uniform_404(client, page):
    """The same answer as a CLOSED page, so nobody can enumerate workspaces
    that exist but are not taking entries."""
    r = client.get(f"/e/api/page/{uuid.uuid4()}")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_a_signed_in_viewer_gets_their_email_and_a_form_token(
    client, page, entrant
):
    """The non-vacuity control for the leak test below: the viewer block is
    genuinely populated for the person it is about."""
    body = client.get(f"/e/api/page/{page['slug']}").json()
    assert body["viewer"]["signedIn"] is True
    assert body["viewer"]["email"] == "parent@example.com"
    assert re.fullmatch(r"[0-9a-f]{64}", body["viewer"]["formCsrf"])


def test_the_projection_never_carries_an_entrants_contact_data(
    client, page, entrant
):
    """Invariant I6 — the strict two-column projection, at the JSON seam.

    NEGATIVE CONTROL. To prove this is not vacuous: add ``"email":
    entrant_account.email`` to ``EntrantRowDTO`` and populate it in
    ``entry_page_projection`` (or widen ``_entrants``' SELECT past its two
    columns). Both assertions below go red. Put it back.
    """
    assert _html_submit(client, page).status_code == 201
    # A STRANGER reads the page — the viewer block legitimately carries the
    # signed-in reader's own address, so it must not be in the frame.
    client.cookies.clear()

    r = client.get(f"/e/api/page/{page['slug']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert [row["name"] for row in body["entrants"]] == ["Alice Chen"]
    assert all(set(row) == {"name", "eventId"} for row in body["entrants"])
    assert "parent@example.com" not in r.text
    assert body["viewer"] == {"signedIn": False, "email": None, "formCsrf": ""}
    # The count over the list and the names under it are one query apart and
    # must not disagree.
    by_id = {ev["id"]: ev for ev in body["events"]}
    assert by_id[page["ws"]]["entryCount"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py -k "projection or uniform_404 or viewer"`

Expected: FAIL — every test collects but errors on the request, `assert 404 == 200` on `test_the_page_projection_carries_the_public_blocks` (FastAPI has no `/e/api/page/{slug}` route, so `GET /e/api/page/spring-open` falls through to the catch-all-free router and answers Starlette's plain `{"detail":"Not Found"}` 404).

- [ ] **Step 3: Write minimal implementation**

Create `products/scheduler/backend/api/entries_json.py`:

```python
"""The entrant tier's JSON surface (Phase 6, spec §4).

**What this module is.** ``api/entries_public.py`` calls itself throwaway
in its own first paragraph, and Phase 6 is where that is honoured: the
React Router 7 app in ``products/scheduler/entrant/`` renders the entrant
experience, and this module is the only thing it reads. The split is the
point of ruling R8-A — one origin, nginx routing ``/e/api/`` here and
``/e/{slug}`` to node, so a form post from the entrant page reaches
FastAPI **directly**. There is no deputy: node never relays a credential,
never forwards a ``Cookie``, and never manufactures the CSRF header
(spec §3).

**Everything the incumbent computed, this module reuses.** ``_resolve``,
``_entrants``, ``_entry_counts``, ``check_policy`` and
``compute_fee_total`` stay exactly where they are and are imported, not
re-derived. That is not tidiness: the total shown to the entrant IS the
total recorded (Seam B), the entrant list IS the strict two-column
projection (invariant I6), and a second implementation of either agrees
with the first until the day it does not.

**Registered without the app-wide auth dependency**, following the
``entries_public`` and ``display.public_router`` precedent. Each route
declares its own posture: the page projection and the config read are
public (and named in ``tests/test_auth_surface.py`` with the reason);
quote and submit declare ``get_current_entrant``, which has no bootstrap
fallback in either mode.

**Not workspace-path-scoped, deliberately.** The key is the
``entry_pages`` slug. A raw tournament UUID is never a public address —
the same rule the display routes hold — so these paths carry no
``tournament_id`` and the ``require_tournament_access`` seam does not
apply. ``_resolve``'s uniform 404 is the tenancy answer instead, and
``tests/test_tenant_isolation.py``'s sweep (derived from ``{tournament_id}``
in the path) is unaffected by design rather than by oversight.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Path, Request
from pydantic import BaseModel

from api.entries_public import (
    _entrants,
    _entry_counts,
    _event_is_open,
    _events,
    _form_csrf,
    _is_age_bracketed,
    _moment,
    _optional_entrant,
    _resolve,
)
from database.models import Org
from repositories import LocalRepository, get_repository
from services.entry_fees import normalize_fee_schedule

log = logging.getLogger("scheduler.api.entries_json")

# ``/e/api`` — a sibling of ``/e/account``, both under the ``/e`` prefix
# nginx routes to FastAPI by longest match while ``/e/{slug}`` falls
# through to node. Four segments deep, so it cannot be shadowed by
# ``GET /e/{slug}``; registered before that router anyway, so the ordering
# is not load-bearing on a future path edit.
router = APIRouter(prefix="/e/api", tags=["entries-public"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---- DTOs ----------------------------------------------------------------


class ViewerDTO(BaseModel):
    """Who is reading, and what they need to post with.

    ``formCsrf`` is empty for a signed-out reader because ``_form_csrf``
    derives it from the session cookie and there is none. That is not a
    gap: a signed-out reader has nothing to submit, and the pre-session
    login/signup channel is the separate ``sw_play_csrf`` double-submit
    (spec §3), which the SSR tier mints and Task 12 checks.
    """

    signedIn: bool = False
    email: Optional[str] = None
    formCsrf: str = ""


class EventDTO(BaseModel):
    id: str
    code: str
    discipline: str
    feeCents: Optional[int] = None
    genderConstraint: Optional[str] = None
    # Stated in UTC and saying so — an entry deadline read in the wrong
    # zone is a missed entry (``_moment``).
    opensAt: Optional[str] = None
    closesAt: Optional[str] = None
    withdrawsUntil: Optional[str] = None
    isOpen: bool
    # R12's birth-year trigger, computed server-side so the form and the
    # write agree about which events need a year.
    ageBracketed: bool
    entryCount: int


class EntrantRowDTO(BaseModel):
    """The strict two-column projection (Q4/I6), and nothing else.

    Two fields, because ``_entrants`` SELECTs two columns. Contact data is
    structurally absent rather than fetched-and-then-hidden, and adding a
    third field here would be the first half of undoing that.
    """

    name: str
    eventId: str


class PageDTO(BaseModel):
    slug: str
    introText: Optional[str] = None
    regulationsText: Optional[str] = None
    regulationsVersion: int
    paymentInstructions: Optional[str] = None
    # String keys: this mirrors a JSON column, and a JSON object has no
    # integer keys. Read through ``normalize_fee_schedule`` so the card
    # cannot quote a tier the pricing drops.
    feeSchedule: Dict[str, int] = {}


class PolicyDTO(BaseModel):
    maxEventsPerPerson: Optional[int] = None
    disciplineCaps: Optional[dict] = None
    collectPhone: bool = False
    waiverRequired: bool = False


class TournamentDTO(BaseModel):
    name: Optional[str] = None
    date: Optional[str] = None


class NamedDTO(BaseModel):
    name: str


class VenueDTO(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None


class EntryPageProjection(BaseModel):
    """One loader, one call. The RR7 loader renders a whole entry page from
    this and makes no second request — meta and OG tags included (spec §7)."""

    tournament: TournamentDTO
    org: Optional[NamedDTO] = None
    venue: Optional[VenueDTO] = None
    page: PageDTO
    policy: PolicyDTO
    events: List[EventDTO]
    entrants: List[EntrantRowDTO]
    viewer: ViewerDTO


# ---- routes --------------------------------------------------------------


@router.get("/page/{slug}", response_model=EntryPageProjection)
def entry_page_projection(
    request: Request,
    slug: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
) -> EntryPageProjection:
    """Everything the entry page renders, in one public read.

    Public by design (Q4): a poster URL, not a capability URL. Reading it
    never requires an account; only the form inside it does. The
    information architecture is the incumbent's (R14 §6) — timeline,
    money, venue, organisation, events with counts, the entrant list —
    because it is proven and entrants already read it.
    """
    page, tournament = _resolve(repo, slug)
    entrant, token = _optional_entrant(request, repo)
    now = _utcnow()
    events = _events(repo, tournament.id)
    counts = _entry_counts(repo, tournament.id)
    org = (
        repo.session.get(Org, tournament.org_id)
        if tournament.org_id is not None
        else None
    )
    return EntryPageProjection(
        tournament=TournamentDTO(
            name=tournament.name,
            date=(
                str(tournament.tournament_date)
                if tournament.tournament_date
                else None
            ),
        ),
        org=NamedDTO(name=org.name) if org is not None and org.name else None,
        venue=(
            VenueDTO(name=page.venue_name, address=page.venue_address)
            if (page.venue_name or page.venue_address)
            else None
        ),
        page=PageDTO(
            slug=page.slug,
            introText=page.intro_text,
            regulationsText=page.regulations_text,
            regulationsVersion=page.regulations_version,
            paymentInstructions=page.payment_instructions,
            feeSchedule={
                str(count): cents
                for count, cents in sorted(
                    normalize_fee_schedule(page.fee_schedule).items()
                )
            },
        ),
        policy=PolicyDTO(
            maxEventsPerPerson=page.max_events_per_person,
            disciplineCaps=page.discipline_caps,
            collectPhone=page.collect_phone,
            waiverRequired=page.waiver_required,
        ),
        events=[
            EventDTO(
                id=str(ev.id),
                code=ev.code,
                discipline=ev.discipline,
                feeCents=ev.fee_cents,
                genderConstraint=ev.gender_constraint,
                opensAt=_moment(ev.opens_at) if ev.opens_at is not None else None,
                closesAt=_moment(ev.closes_at) if ev.closes_at is not None else None,
                withdrawsUntil=(
                    _moment(ev.withdraws_until)
                    if ev.withdraws_until is not None
                    else None
                ),
                isOpen=_event_is_open(ev, now),
                ageBracketed=_is_age_bracketed(ev),
                entryCount=counts.get(ev.id, 0),
            )
            for ev in events
        ],
        entrants=[
            EntrantRowDTO(name=name, eventId=str(event_id))
            for name, event_id in _entrants(repo, tournament.id)
        ],
        viewer=ViewerDTO(
            signedIn=entrant is not None,
            email=entrant.email if entrant is not None else None,
            formCsrf=_form_csrf(token),
        ),
    )
```

The `uuid` import is used by later tasks in this module; drop it for now to keep `ruff`'s `F401` green — re-add it in Task 11. Replace the import line `import uuid` with nothing in this commit.

In `products/scheduler/backend/app/main.py`, add to the `from api import (...)` block (after line 17, keeping the existing alphabetical-ish grouping):

```python
    entries_json as entries_json_api,  # SP-PROGRAM-1 Phase 6 — the entrant tier's JSON surface
```

and immediately **before** line 419 (`app.include_router(entries_public_api.router)`):

```python
# Entries, entrant-tier JSON (Phase 6): what the React Router 7 app reads
# and writes. Registered WITHOUT the app-wide dependency for the same
# reason the HTML surface below is — its public routes are named
# individually in tests/test_auth_surface.py, and its writes declare
# ``get_current_entrant`` themselves. Registered BEFORE the HTML router so
# ``/e/api/...`` can never be shadowed by ``/e/{slug}``; today it cannot be
# (different segment counts), and this keeps that true after an edit.
app.include_router(entries_json_api.router)
```

In `products/scheduler/tests/test_auth_surface.py`, add to `PUBLIC_BY_DESIGN` (after the `("GET", "/e/{slug}")` entry, line 101):

```python
    ("GET", "/e/api/page/{slug}"): (
        "the entry page as JSON — the same public read as GET /e/{slug}, "
        "which the RR7 loader consumes instead of scraping HTML. Identical "
        "posture and identical guards: strict projection (entrant names + "
        "event ids only, opt-outs excluded, no contact data selected), the "
        "slug as the only key so a raw tournament UUID is never a public "
        "address, and the uniform 404 for an unknown or closed page. The "
        "leak claim is checked, not assumed, in "
        "tests/test_entries_json_routes.py::"
        "test_the_projection_never_carries_an_entrants_contact_data"
    ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py tests/test_auth_surface.py tests/test_tenant_isolation.py`

Expected: PASS (all of `test_entries_json_routes.py`, plus `test_auth_surface.py` and `test_tenant_isolation.py` unchanged-green — the latter proves the new route added nothing to the workspace sweep).

Then: `ruff check products/scheduler/backend/api/entries_json.py products/scheduler/backend/app/main.py`

Expected: `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/api/entries_json.py products/scheduler/backend/app/main.py products/scheduler/tests/test_entries_json_routes.py products/scheduler/tests/test_auth_surface.py
git commit -m "feat(entries): serve the entry page as a JSON projection at /e/api/page/{slug}

The RR7 loader's single read. Reuses _resolve/_entrants/_entry_counts
verbatim rather than re-deriving them, so the strict two-column
projection (I6) and the uniform 404 are the same code the HTML page has
always run.

Edits tests/test_auth_surface.py: adds GET /e/api/page/{slug} to
PUBLIC_BY_DESIGN. It does not supersede an existing entry — GET /e/{slug}
stays until the §9 cut-over. Reason recorded inline; the leak claim is
checked in test_entries_json_routes.py rather than asserted in prose.

Not workspace-path-scoped: the key is the entry_pages slug, so
test_tenant_isolation.py's {tournament_id} sweep is deliberately
unaffected — a raw tournament UUID must never be a public address."
```

---

### Task 9: `GET /e/api/config` — the client's one configuration read

**Files:**
- Modify: `products/scheduler/backend/api/entries_json.py` (append a DTO + route after `entry_page_projection`)
- Modify: `products/scheduler/tests/test_auth_surface.py:79-123` (`PUBLIC_BY_DESIGN`)
- Test: `products/scheduler/tests/test_entries_json_routes.py`

**Interfaces:**
- Consumes: `api.entries_json.router` (Task 8); `app.config.settings.turnstile_site_key` (`app/config.py:248`), `settings.auth_mode` (`app/config.py:168`).
- Produces: route `GET /e/api/config` → `EntrantConfigDTO{turnstileSiteKey: str, authMode: str}`. The RR7 signup route reads it to render the Turnstile widget; the login route reads `authMode`.

- [ ] **Step 1: Write the failing test**

Append to `products/scheduler/tests/test_entries_json_routes.py`:

```python
# ---- GET /e/api/config ---------------------------------------------------


def test_the_config_route_publishes_the_site_key_and_the_auth_mode(client):
    """``turnstile_site_key`` is exposed to no client today and the signup
    widget needs it. A second env var on node would be a second source of
    truth for a value the backend already validates."""
    r = client.get("/e/api/config")
    assert r.status_code == 200, r.text
    assert r.json() == {
        # Cloudflare's documented always-pass dummy sitekey (app/config.py:248).
        "turnstileSiteKey": "1x00000000000000000000AA",
        "authMode": "local",
    }


def test_the_config_route_never_publishes_the_turnstile_secret(client, monkeypatch):
    """NEGATIVE CONTROL. The site key and the secret key are adjacent
    settings with near-identical names and near-identical dummy values —
    exactly the pair a copy-paste swaps. Verifying a *server* secret is what
    the secret is for; publishing it hands anyone a free pass over signup.

    To prove this is not vacuous: change the route to return
    ``settings.turnstile_secret_key`` and this goes red. Put it back.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "turnstile_secret_key", "2xSECRET-do-not-publish")
    r = client.get("/e/api/config")
    assert r.status_code == 200, r.text
    assert "do-not-publish" not in r.text
    assert r.json()["turnstileSiteKey"] == settings.turnstile_site_key


def test_the_config_route_reports_the_deployed_auth_mode(client, monkeypatch):
    """Non-vacuity for the field above: it reads the setting, it is not a
    literal. Cloud mode is the deployed posture the entrant app renders for."""
    from app.config import settings

    monkeypatch.setattr(settings, "auth_mode", "cloud")
    assert client.get("/e/api/config").json()["authMode"] == "cloud"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py -k config`

Expected: FAIL with `assert 404 == 200` on `test_the_config_route_publishes_the_site_key_and_the_auth_mode` — no `/e/api/config` route is registered.

- [ ] **Step 3: Write minimal implementation**

In `products/scheduler/backend/api/entries_json.py`, add `from app.config import settings` to the imports, and append after `entry_page_projection`:

```python
class EntrantConfigDTO(BaseModel):
    """The two values the entrant app cannot compute for itself.

    Small on purpose. This is a **publication** route, not a settings
    dump: everything on it is already public by nature (a Turnstile
    sitekey is rendered into every signup page; the auth mode is
    observable from whether an anonymous write is refused). Nothing that
    is secret, or that would become interesting in aggregate, belongs
    here — and the negative control in
    ``tests/test_entries_json_routes.py`` exists because the secret key
    sits one line away from the sitekey in ``app/config.py`` with a
    near-identical name.
    """

    turnstileSiteKey: str
    authMode: str


@router.get("/config", response_model=EntrantConfigDTO)
def entrant_config() -> EntrantConfigDTO:
    """Public runtime configuration for the entrant app.

    Read by the RR7 signup route to render the Turnstile widget. The
    alternative — a second ``TURNSTILE_SITE_KEY`` env var on the node
    service — would be a second source of truth for a value whose *pair*
    (the secret) is validated only here, and a sitekey that drifts from
    its secret fails the challenge for every honest entrant while looking
    like a Cloudflare outage.

    No repository access and no session: this is configuration, not data,
    which is why it needs neither a slug nor a tenancy seam.
    """
    return EntrantConfigDTO(
        turnstileSiteKey=settings.turnstile_site_key,
        authMode=settings.auth_mode,
    )
```

In `products/scheduler/tests/test_auth_surface.py`, add to `PUBLIC_BY_DESIGN`:

```python
    ("GET", "/e/api/config"): (
        "public runtime configuration for the entrant app: the Turnstile "
        "SITEKEY (rendered into every signup page — public by nature) and "
        "the auth mode. It cannot require a session: it is read by the "
        "signup page, which is where a session is obtained. Two fields, no "
        "repository access, no tenant scope. The claim that it never "
        "carries the SECRET key — the adjacent, near-identically-named "
        "setting — is checked in tests/test_entries_json_routes.py::"
        "test_the_config_route_never_publishes_the_turnstile_secret"
    ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py tests/test_auth_surface.py`

Expected: PASS

Then: `ruff check products/scheduler/backend/api/entries_json.py`

Expected: `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/api/entries_json.py products/scheduler/tests/test_entries_json_routes.py products/scheduler/tests/test_auth_surface.py
git commit -m "feat(entries): publish the entrant app's runtime config at /e/api/config

Two fields: the Turnstile SITEKEY (public by nature — it is rendered into
every signup page) and the auth mode. A second env var on the node service
would be a second source of truth for a value whose paired secret is
validated only here.

Carries its own negative control: the secret key sits one line away in
app/config.py with a near-identical dummy value, so a test asserts it is
absent from the body and states how to break it.

Edits tests/test_auth_surface.py: adds GET /e/api/config to
PUBLIC_BY_DESIGN with its reason. Supersedes no existing entry."
```

---

### Task 10: `POST /e/api/quote/{slug}` — the session-gated fee quote (R8-C)

**Files:**
- Create: `products/scheduler/backend/services/entry_form.py`
- Modify: `products/scheduler/backend/api/entries_public.py:212-241` (`_form_csrf` → delegate), `products/scheduler/backend/api/entries_public.py:1267-1321` (`_parse_players`, `_year` → delegates)
- Modify: `products/scheduler/backend/api/entries_json.py` (append `require_form_csrf` + the quote route)
- Test: `products/scheduler/tests/test_entries_json_routes.py`

**Interfaces:**
- Consumes: `api.entries_json.router` (Task 8); `api.entries_public._resolve`, `._lookup_event(repo, tournament_id, event_id: str) -> Optional[EntryEvent]` (`:1363`), `._event_is_open`; `services.entry_policy.check_policy(page, selections: Sequence[tuple[str, Sequence[Any]]]) -> Optional[PolicyRefusal]`; `services.entry_fees.compute_fee_total(page, selections: Sequence[PlayerSelection]) -> tuple[Optional[int], dict]`; `services.entry_fees.PlayerSelection(key: str, events: Sequence[Any])`; `app.dependencies.get_current_entrant -> AuthEntrant`.
- Produces:
  - `services/entry_form.py`: `PLAY_CSRF_COOKIE = "sw_play_csrf"`; `form_csrf(session_token: Optional[str]) -> str`; `check_form_csrf(presented: str, *, session_token: str, play_csrf_cookie: str) -> bool`; `parse_players(form) -> List[dict]`; `parse_year(raw) -> Optional[int]`. This is the shared module spec §3 requires (`_form_csrf` "promoted out of the route into a shared module the middleware calls"). **If the CSRF-channel task in the earlier range already created this file with `form_csrf`, keep its version and add only the members it lacks — the signatures above are the contract, the file path is not.**
  - `api/entries_json.py`: `require_form_csrf(request: Request, form) -> None` (raises 403 `AUTH_CSRF_REQUIRED`); route `POST /e/api/quote/{slug}` → `QuoteResponse{totalCents, feeBasis, refusal}`. Tasks 11 and 12 both call `require_form_csrf`.

- [ ] **Step 1: Write the failing test**

Append to `products/scheduler/tests/test_entries_json_routes.py`:

```python
# ---- POST /e/api/quote/{slug} -------------------------------------------
#
# R8-C: session-gated, matching the incumbent's "Update events and total"
# (api/entries_public.py:1119). A public fee oracle on an unauthenticated
# route was rejected — the quote reads a director's price list against a
# caller-chosen basket, and that is the shape of a scraper.


def _form_token(client, page):
    """The viewer's form token, read off the JSON projection.

    Deliberately read rather than recomputed: a test that recomputed the
    digest would pass even if the surface stopped emitting it, and the
    field is the only thing an unhydrated form can prove itself with.
    """
    return client.get(f"/e/api/page/{page['slug']}").json()["viewer"]["formCsrf"]


def _quote(client, page, events, **overrides):
    data = {
        "playerName": "Alice Chen",
        "gender": "F",
        "events": events,
        "_csrf": _form_token(client, page),
    }
    data.update(overrides)
    return client.post(f"/e/api/quote/{page['slug']}", data=data, headers=CSRF)


def test_a_quote_prices_the_basket_through_the_fee_schedule(client, page, entrant):
    r = _quote(client, page, [f"0:{page['ms']}", f"0:{page['ws']}"])
    assert r.status_code == 200, r.text
    body = r.json()
    # Two events for one person, priced off the CUMULATIVE schedule's "2"
    # tier — not 4000+4000, and not the per-event fallback's 1500.
    assert body["totalCents"] == 5500
    assert body["feeBasis"]["basis"] == "schedule"
    assert body["feeBasis"]["players"][0]["eventCount"] == 2
    assert body["refusal"] is None


def test_the_quoted_total_is_the_total_recorded(client, page, entrant):
    """Seam B, across the two routes that must never disagree.

    The quote and the write call the SAME ``compute_fee_total`` over the
    same per-person grouping. This asserts the end of that promise: the
    number the entrant agreed to is the number on the submission row.
    """
    quoted = _quote(client, page, [f"0:{page['ms']}", f"0:{page['ws']}"]).json()
    assert quoted["totalCents"] == 5500

    body = client.get(f"/e/{page['slug']}").text
    token = re.search(r'name="_csrf" value="([0-9a-f]*)"', body).group(1)
    r = client.post(
        f"/e/{page['slug']}/submit",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ms']}", f"0:{page['ws']}"],
            "acknowledged": "on",
            "_csrf": token,
        },
    )
    assert r.status_code == 201, r.text

    from database.models import Submission
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        rows = session.scalars(select(Submission)).all()
        assert len(rows) == 1
        assert rows[0].fee_total_cents == quoted["totalCents"]
    finally:
        session.close()


def test_a_quote_reports_a_policy_refusal_with_the_rule_stated(
    client, page, entrant
):
    """``check_policy`` is the write's function, not a preview of it. A
    refusal that arrived only at submit would make the quote a lie."""
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.max_events_per_person = 1
        session.commit()
    finally:
        session.close()

    body = _quote(client, page, [f"0:{page['ms']}", f"0:{page['ws']}"]).json()
    assert body["refusal"]["code"] == "MAX_EVENTS_PER_PERSON"
    assert "at most 1 event" in body["refusal"]["message"]


def test_an_anonymous_quote_is_refused(client, page):
    """R8-C, the negative control.

    ``get_current_entrant`` has no bootstrap fallback in either mode, so
    the refusal is structural. To prove this is not vacuous: swap the
    dependency for ``_optional_entrant`` and this goes red while
    ``test_a_quote_prices_the_basket_through_the_fee_schedule`` — the same
    request one cookie different — stays green. Put it back.
    """
    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={"playerName": "A", "gender": "F", "events": [f"0:{page['ms']}"]},
        headers=CSRF,
    )
    assert r.status_code == 401


def test_a_quote_without_the_form_token_is_refused(client, page, entrant):
    """Channel two at the route. NEGATIVE CONTROL: delete the
    ``require_form_csrf`` call and this goes red while the priced-basket
    test stays green."""
    r = client.post(
        f"/e/api/quote/{page['slug']}",
        data={"playerName": "A", "gender": "F", "events": [f"0:{page['ms']}"]},
        headers=CSRF,
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_quote_carrying_another_sessions_form_token_is_refused(
    client, page, entrant
):
    """The double-submit's whole claim: an attacker's page can make the
    browser send our cookie, but it can never read it, so it cannot compute
    this value. A token minted from a DIFFERENT session is the closest a
    real attacker gets."""
    stolen = _form_token(client, page)
    assert client.post("/e/account/logout", headers=CSRF).status_code == 204
    assert (
        client.post(
            "/e/account/login",
            json={"email": "parent@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )
    r = _quote(client, page, [f"0:{page['ms']}"], _csrf=stolen)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py -k quote`

Expected: FAIL with `assert 404 == 200` on `test_a_quote_prices_the_basket_through_the_fee_schedule` — no `/e/api/quote/{slug}` route.

- [ ] **Step 3: Write minimal implementation**

Create `products/scheduler/backend/services/entry_form.py`:

```python
"""The entrant form's transport rules — parsing, and proof of intent.

**Why this module exists** (spec §3). Both of these lived inside
``api/entries_public.py``, which Phase 6 deletes: the double-submit token
in the route that checked it, and the flat-form parser in the route that
consumed it. Phase 6 has three callers for each — the JSON quote, the JSON
submit, and the entrant account routes — plus, for the token, the CSRF
middleware itself, which is how the path-based exemption
(``app/main.py:242``) gets *deleted* rather than renamed. A per-path escape
hatch becomes a first-class, enumerated proof channel exactly when the
proof stops living inside one route.

**HTTP-free on purpose.** Nothing here imports FastAPI or Starlette, in
line with the rest of ``services/``. ``parse_players`` takes anything with
``.getlist()`` and the token functions take plain strings; the callers
raise the 403 and own the ``Request``. That is also what makes the
middleware able to call ``form_csrf`` without importing a route module.
"""
from __future__ import annotations

import hashlib
import secrets
from typing import Any, List, Optional

# Domain separator for the session-derived token. Any constant works;
# naming it means the digest can never collide with another sha256 of the
# same session token computed somewhere else for another purpose.
_FORM_CSRF_PREFIX = "sw-play-form-csrf:"

# The NON-AUTHENTICATING pre-session double-submit cookie (spec §3). It
# must NOT be added to ``settings.session_cookie_names``: it authenticates
# nothing, and registering it would make the CSRF middleware treat an
# anonymous browser as cookie-authenticated. Minted by the SSR tier, whose
# value is opaque and compared to the posted field — the entire proof is
# that the value was readable same-origin.
PLAY_CSRF_COOKIE = "sw_play_csrf"


def form_csrf(session_token: Optional[str]) -> str:
    """The hidden-field CSRF token for a native HTML form post.

    **Why this exists at all.** The app's CSRF defense is a custom request
    header (``X-ShuttleWorks-CSRF``), which a cross-site page cannot attach
    without a preflight we do not approve. A native ``<form method=post>``
    cannot attach it either — that is the same property, seen from the
    other side. Posting via ``fetch`` was rejected: the entrant form must
    submit unhydrated (spec §7), and a form that needs JavaScript is
    degraded functionality at exactly the widths ruling R11 makes co-equal.

    So the form carries a **double-submit token derived from the session
    cookie**: an attacker's page can make the browser send our cookie, but
    it can never *read* it, so it cannot compute this value. The caller
    compares in constant time. This is strictly stronger than the
    SameSite=Lax argument alone, which Chrome's "Lax+POST" intervention
    weakens for cookies under two minutes old — precisely the window right
    after a login, which is when an entrant submits.

    Stateless on purpose: no server-side token store, and it is invalidated
    by logging out because it is a function of the session token.

    Returns ``""`` for an absent session. That is not a token, and
    ``check_form_csrf`` refuses on it rather than comparing two empties —
    the pre-session case is ``PLAY_CSRF_COOKIE``'s job, not this one's.
    """
    if not session_token:
        return ""
    return hashlib.sha256(
        (_FORM_CSRF_PREFIX + session_token).encode("utf-8")
    ).hexdigest()


def check_form_csrf(
    presented: str, *, session_token: str, play_csrf_cookie: str
) -> bool:
    """Channel two: two sources, one rule.

    A write that carries the entrant SESSION proves itself with the
    session-derived digest. A write made *before* there is a session
    (signup, login) has no secret to derive from, so it proves itself
    against ``PLAY_CSRF_COOKIE``.

    The session branch WINS when both are present: a request carrying a
    session is a request whose strongest available proof is the derived
    one, and preferring the weaker cookie there would let a value an
    attacker can plant downgrade a value they cannot compute.

    An empty expectation is always a refusal — never a comparison of two
    empty strings, which is the shape that turns "no token configured"
    into "every token accepted".
    """
    expected = form_csrf(session_token) if session_token else (play_csrf_cookie or "")
    if not expected:
        return False
    return secrets.compare_digest(str(presented or ""), expected)


def parse_players(form: Any) -> List[dict]:
    """Group a flat form post into per-person selections.

    The player fields repeat positionally and each event checkbox value is
    ``"<player index>:<event id>"`` — which is what makes 1-N events per
    person expressible in a flat form post with no script to build a nested
    payload. A block with no name, no gender or no events is **dropped
    rather than refused**: the second player block is optional and an empty
    one is the normal case, not an error.
    """
    names = form.getlist("playerName")
    genders = form.getlist("gender")
    clubs = form.getlist("club")
    years = form.getlist("birthYear")
    remarks = form.getlist("remarks")

    chosen: dict[int, List[str]] = {}
    for raw in form.getlist("events"):
        index, _, event_id = str(raw).partition(":")
        if not index.isdigit() or not event_id:
            continue
        chosen.setdefault(int(index), []).append(event_id[:100])

    out: List[dict] = []
    for index, name in enumerate(names):
        gender = str(genders[index] if index < len(genders) else "").strip()
        events = chosen.get(index) or []
        if not str(name).strip() or not gender or not events:
            continue
        out.append(
            {
                "name": str(name).strip()[:200],
                "gender": gender[:20],
                "club": str(clubs[index] if index < len(clubs) else "").strip()[:200]
                or None,
                "birthYear": parse_year(years[index] if index < len(years) else ""),
                "remarks": str(
                    remarks[index] if index < len(remarks) else ""
                ).strip()[:2000]
                or None,
                "events": events,
            }
        )
    return out


def parse_year(raw: Any) -> Optional[int]:
    """A birth year, or nothing. An unparseable value is dropped rather
    than refused: it is an optional eligibility field (R5/Q11), and
    refusing a whole submission over a typo in an optional box would be the
    software making the strictest possible reading of an optional rule."""
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    return value if 1900 <= value <= 2100 else None
```

In `products/scheduler/backend/api/entries_public.py`, replace the body of `_form_csrf` (lines 212-241) with a delegate, keeping the name so the module's own call sites and docstrings stay valid until the §9 cut-over:

```python
def _form_csrf(session_token: Optional[str]) -> str:
    """Delegates to ``services.entry_form.form_csrf``.

    Moved out in Phase 6 (spec §3): the CSRF middleware now calls it too,
    which is how the path-based exemption gets deleted rather than renamed.
    The name survives here only as long as this module's HTML routes do
    (§9 removes both together).
    """
    return entry_form.form_csrf(session_token)
```

Replace `_parse_players` (lines 1267-1309) and `_year` (lines 1312-1321) the same way:

```python
def _parse_players(form) -> List[dict]:
    """Delegates to ``services.entry_form.parse_players`` (Phase 6)."""
    return entry_form.parse_players(form)


def _year(raw) -> Optional[int]:
    """Delegates to ``services.entry_form.parse_year`` (Phase 6)."""
    return entry_form.parse_year(raw)
```

Add the import to `api/entries_public.py`'s import block (after `from services import entrants as entrant_service`):

```python
from services import entry_form
```

Then remove the now-unused `hashlib` import from `api/entries_public.py` (`ruff` `F401` will name it).

In `products/scheduler/backend/api/entries_json.py`, add to the imports:

```python
import secrets  # noqa: F401  -- removed in the same edit; see below
```

— do not add that. Instead add these real imports:

```python
from fastapi import APIRouter, Depends, Path, Request  # Request already present
from app.dependencies import AuthEntrant, get_current_entrant
from app.error_codes import ErrorCode, http_error
from api.entries_public import _lookup_event  # add to the existing api.entries_public import block
from services.entry_fees import PlayerSelection, compute_fee_total, normalize_fee_schedule
from services.entry_form import PLAY_CSRF_COOKIE, check_form_csrf, parse_players
from services.entry_policy import check_policy
```

and append:

```python
def require_form_csrf(request: Request, form) -> None:
    """Channel two, checked at the route (spec §3, R8-B).

    Checked **before anything is read out of the body**: this request
    carries a session cookie, so until the token is verified it is not
    known to have been sent deliberately. That ordering is the incumbent's
    (``api/entries_public.py:1134-1146``) and is preserved here verbatim.

    This is a route-level check and the CSRF middleware's second channel is
    a separate, complementary guard: the middleware decides whether a
    cookie-carrying write may proceed at all, and this decides whether
    *this* form was minted for *this* session. Removing either leaves a
    hole, so both have their own negative controls.
    """
    if not check_form_csrf(
        str(form.get("_csrf") or ""),
        session_token=request.cookies.get(settings.entrant_session_cookie_name) or "",
        play_csrf_cookie=request.cookies.get(PLAY_CSRF_COOKIE) or "",
    ):
        raise http_error(
            403,
            ErrorCode.AUTH_CSRF_REQUIRED,
            "This form has expired. Reload the entry page and try again.",
        )


class RefusalDTO(BaseModel):
    """A refusal the entrant can act on.

    ``code`` is stable wire vocabulary for a caller that wants to branch;
    ``message`` **contains the rule** — the number, or the discipline —
    because "your entry was refused" is not an answer someone can do
    anything with (R14 §4).
    """

    code: str
    message: str
    subjects: List[str] = []


class QuoteResponse(BaseModel):
    """What a basket costs, and whether it is allowed.

    Both, in one answer, deliberately: a quote that priced a basket policy
    would refuse is a number the entrant will never be charged, and a
    refusal with no price makes them re-tick to find out what a legal
    basket costs.
    """

    totalCents: Optional[int] = None
    feeBasis: dict = {}
    refusal: Optional[RefusalDTO] = None


def _resolve_selections(repo: LocalRepository, tournament_id, parsed: List[dict]):
    """``[(spec, [event, ...]), ...]`` for a parsed form, or a 400.

    The events must belong to *this* workspace and be open. One answer for
    "not ours", "does not exist" and "closed": a caller holding a real
    event id from another tenant learns nothing from posting it here.
    """
    now = _utcnow()
    resolved: List[tuple] = []
    for spec in parsed:
        events = []
        for raw_id in spec["events"]:
            event = _lookup_event(repo, tournament_id, raw_id)
            if event is None or not _event_is_open(event, now):
                raise http_error(
                    400, ErrorCode.INVALID_INPUT, "That event is not taking entries."
                )
            events.append(event)
        resolved.append((spec, events))
    return resolved


@router.post("/quote/{slug}", response_model=QuoteResponse)
async def quote_entry(
    request: Request,
    slug: str = Path(..., max_length=100),
    entrant: AuthEntrant = Depends(get_current_entrant),
    repo: LocalRepository = Depends(get_repository),
) -> QuoteResponse:
    """R14's "Update events and total", as a route the RR7 form can call.

    **Session-gated (ruling R8-C)**, matching the incumbent's filter branch
    (``api/entries_public.py:1119``) rather than becoming a public fee
    oracle: it reads a director's price list against a caller-chosen basket,
    which is the shape of a scraper.

    It calls the **same** ``check_policy`` and ``compute_fee_total`` the
    write calls, over the same per-person grouping. That is not
    convenience — Seam B's invariant is that the total shown to the entrant
    IS the total recorded, and two implementations cannot promise that
    however carefully they are kept in step.

    Writes nothing, and does not spend the entry budget: the budget counts
    entries, and this is somebody still filling in a form.
    """
    page, _tournament_unused = _resolve(repo, slug)
    _page, tournament = page, _tournament_unused
    form = await request.form()
    require_form_csrf(request, form)

    resolved = _resolve_selections(repo, tournament.id, parse_players(form))
    grouped = [(str(i), events) for i, (_, events) in enumerate(resolved)]
    refusal = check_policy(page, grouped)
    total, basis = (
        compute_fee_total(
            page, [PlayerSelection(key, events) for key, events in grouped]
        )
        if grouped
        else (None, {})
    )
    return QuoteResponse(
        totalCents=total,
        feeBasis=basis,
        refusal=(
            None
            if refusal is None
            else RefusalDTO(
                code=refusal.code,
                message=refusal.message,
                subjects=list(refusal.subjects),
            )
        ),
    )
```

Simplify the first two lines of the body to `page, tournament = _resolve(repo, slug)` — the two-step above is a transcription artefact; write it as the single tuple unpack.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py tests/test_entries_public_routes.py`

Expected: PASS — including all ~90 pre-existing tests in `test_entries_public_routes.py`, which is the proof that moving `_form_csrf` / `_parse_players` / `_year` into `services/entry_form.py` changed no behaviour.

Then: `ruff check products/scheduler/backend`

Expected: `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/services/entry_form.py products/scheduler/backend/api/entries_public.py products/scheduler/backend/api/entries_json.py products/scheduler/tests/test_entries_json_routes.py
git commit -m "feat(entries): add the session-gated fee quote at POST /e/api/quote/{slug}

Ruling R8-C: session-gated, matching the incumbent's filter branch rather
than becoming a public fee oracle. Calls the SAME check_policy and
compute_fee_total the write calls — Seam B's invariant is that the total
shown is the total recorded, and a test pins the two ends of it.

Also promotes _form_csrf, _parse_players and _year out of
api/entries_public.py into services/entry_form.py (spec §3): the CSRF
middleware needs the token function, which is how the path-based exemption
gets deleted rather than renamed. The old names stay as delegates until
§9 removes the HTML routes, so no existing test changes — the ~90 tests in
test_entries_public_routes.py passing unedited is the behaviour proof.

No test edited or deleted."
```

---

### Task 11: `POST /e/api/submit/{slug}` — the persist path, guard order verbatim

**Files:**
- Modify: `products/scheduler/backend/api/entries_json.py` (append the submit route)
- Test: `products/scheduler/tests/test_entries_json_routes.py`

**Interfaces:**
- Consumes: `api.entries_json.require_form_csrf(request, form) -> None`, `._resolve_selections(repo, tournament_id, parsed) -> List[tuple]` (Task 10); `services.entry_form.parse_players`; `services.auth.entries_key(ip) -> str`, `.throttle_check(session, key) -> Optional[float]`, `.throttle_record_entry(session, key) -> None`; `app.client_ip.client_ip(request) -> str`; `services.submissions.create_submission(session, *, tournament_id, page, account_id, players, fee_total_cents, fee_basis, idempotency_key) -> SubmissionResult`, `.PlayerInput(full_name, gender, club, birth_year, remarks, events)`.
- Produces: route `POST /e/api/submit/{slug}` answering **303** with `Location: /e/{slug}/receipt/{submission_id}`, or `400`/`401`/`403`/`429` in the incumbent's `http_error` shape. Consumed by the RR7 entry-form action and its receipt route.

- [ ] **Step 1: Write the failing test**

Append to `products/scheduler/tests/test_entries_json_routes.py`:

```python
# ---- POST /e/api/submit/{slug} ------------------------------------------
#
# The guard order is the contract, and it is the incumbent's verbatim
# (api/entries_public.py:1131-1264): session, slug, form CSRF, per-IP
# throttle, acknowledgment, parse, events-open, policy, fee, write. What
# changes is only the answer shape — 303 to an RR7 receipt route, so a
# reload never re-posts.


def _submit(client, page, **overrides):
    data = {
        "playerName": "Alice Chen",
        "gender": "F",
        "club": "",
        "birthYear": "",
        "remarks": "can't play before 6pm Saturday",
        "events": [f"0:{page['ws']}"],
        "acknowledged": "on",
        "_csrf": _form_token(client, page),
    }
    headers = dict(CSRF)
    headers.update(overrides.pop("headers", {}))
    data.update({k: v for k, v in overrides.items() if v is not None})
    for key, value in overrides.items():
        if value is None:
            data.pop(key, None)
    return client.post(
        f"/e/api/submit/{page['slug']}",
        data=data,
        headers=headers,
        follow_redirects=False,
    )


def _submissions():
    from database.models import Submission
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        return list(session.scalars(select(Submission)).all())
    finally:
        session.close()


def test_a_submission_answers_303_to_the_receipt_route(client, page, entrant):
    r = _submit(client, page)
    assert r.status_code == 303, r.text
    rows = _submissions()
    assert len(rows) == 1
    assert r.headers["location"] == f"/e/{page['slug']}/receipt/{rows[0].id}"
    # The fee is computed server-side in one place and stored as computed.
    assert rows[0].fee_total_cents == 4000
    # Q11: the version agreed to, recorded at that instant.
    assert rows[0].regulations_version_accepted == 3


def test_an_anonymous_submission_is_refused(client, page):
    """NEGATIVE CONTROL for the session gate. ``get_current_entrant`` has no
    bootstrap fallback in either mode. To prove it is not vacuous: swap it
    for ``_optional_entrant`` and this goes red while the 303 test — the
    same request, one cookie different — stays green. Put it back."""
    r = client.post(
        f"/e/api/submit/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ws']}"],
            "acknowledged": "on",
        },
        headers=CSRF,
        follow_redirects=False,
    )
    assert r.status_code == 401
    assert _submissions() == []


def test_a_submission_with_a_foreign_form_token_is_refused_and_writes_nothing(
    client, page, entrant
):
    """NEGATIVE CONTROL for guard 3. A token minted from a DIFFERENT session
    is the closest a real attacker gets — they can make the browser send our
    cookie, they can never read it. Delete the ``require_form_csrf`` call
    and this goes red."""
    stolen = _form_token(client, page)
    assert client.post("/e/account/logout", headers=CSRF).status_code == 204
    assert (
        client.post(
            "/e/account/login",
            json={"email": "parent@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )
    r = _submit(client, page, _csrf=stolen)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
    assert _submissions() == []


def test_an_unacknowledged_submission_is_refused_and_writes_nothing(
    client, page, entrant
):
    """Guard 5. An acknowledgment given after the fact is not one (Q11) —
    one of the few places this software genuinely refuses."""
    r = _submit(client, page, acknowledged=None)
    assert r.status_code == 400
    assert "regulations" in r.json()["detail"]["message"]
    assert _submissions() == []


def test_a_policy_breach_is_refused_with_the_rule_stated(client, page, entrant):
    """Guard 6, R14 §4: never a silent drop of the selections that did not
    fit, and the refusal carries the number that produced it."""
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.max_events_per_person = 1
        session.commit()
    finally:
        session.close()

    r = _submit(client, page, events=[f"0:{page['ms']}", f"0:{page['ws']}"])
    assert r.status_code == 400
    assert "at most 1 event" in r.json()["detail"]["message"]
    assert _submissions() == []


def test_the_idempotency_key_travels_in_the_HIDDEN_FIELD_and_is_honoured(
    client, page, entrant
):
    """This makes ``UNIQUE (tournament_id, idempotency_key)`` reachable for
    the first time.

    A native form cannot send a header, so until Phase 6 the key was always
    NULL for a real entrant and the index guarded nothing they could reach.
    The key is minted in the loader that RENDERS the form (not at submit —
    a double-click would mint two) and carried as a hidden field, so it
    works unhydrated. Both posts must answer the SAME receipt: a retrying
    client that saw a different answer would conclude its first attempt had
    failed.
    """
    key = "1f2e3d4c-5b6a-4798-8899-aabbccddeeff"
    first = _submit(client, page, idempotencyKey=key)
    assert first.status_code == 303, first.text
    second = _submit(client, page, idempotencyKey=key)
    assert second.status_code == 303, second.text
    assert second.headers["location"] == first.headers["location"]
    rows = _submissions()
    assert len(rows) == 1
    assert rows[0].idempotency_key == key


def test_two_submissions_without_a_key_are_two_acts(client, page, entrant):
    """Non-vacuity for the replay above: the route is not collapsing
    everything onto one row. A NULL key is not a key."""
    assert _submit(client, page).status_code == 303
    assert _submit(client, page).status_code == 303
    assert len(_submissions()) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py -k "303 or idempotency or unacknowledged"`

Expected: FAIL with `assert 404 == 303` on `test_a_submission_answers_303_to_the_receipt_route` — no `/e/api/submit/{slug}` route.

- [ ] **Step 3: Write minimal implementation**

In `products/scheduler/backend/api/entries_json.py`, add `import uuid` back to the imports plus:

```python
from fastapi import Header
from fastapi.responses import RedirectResponse

from app.client_ip import client_ip
from services import auth as auth_service
from services import submissions as submission_service
```

and append:

```python
@router.post("/submit/{slug}")
async def submit_entry_json(
    request: Request,
    slug: str = Path(..., max_length=100),
    idempotency_key: Optional[str] = Header(
        None, alias="Idempotency-Key", max_length=64
    ),
    entrant: AuthEntrant = Depends(get_current_entrant),
    repo: LocalRepository = Depends(get_repository),
):
    """Record one submission. **The order of the guards is the contract**,
    and it is ``api/entries_public.submit_entry``'s verbatim.

    1. the entrant session (the dependency above — no bootstrap fallback);
    2. slug -> page -> tournament, or the uniform 404;
    3. the form CSRF token, before anything is read out of the body;
    4. the per-IP budget on its own ``entry:`` namespace, so an entry flood
       cannot lock a venue out of *signing in*;
    5. the acknowledgment, with the version agreed to recorded at that
       instant on the submission;
    6. entry policy, refused WITH THE RULE STATED;
    7-9. replay, flags and the write, all inside the submission service.

    **What is different from the incumbent, and only this.** The answer is
    a **303** to an RR7 receipt route instead of a rendered page: a
    POST/redirect/GET target means a reload never re-posts. And the
    ``action=filter`` branch is gone — it is ``POST /e/api/quote/{slug}``
    now, which is a better shape for the same act (it writes nothing and it
    said so only in a comment before).

    **The Idempotency-Key is read from the body as well as the header**,
    and the body is what makes it reachable. A native form cannot send a
    header, so until this phase the key was always NULL for a real entrant
    and ``UNIQUE (tournament_id, idempotency_key)`` guarded nothing they
    could hit. The key is minted in the loader that renders the form —
    not at submit, where a double-click mints two.

    The body is read as a raw form rather than declared as ``Form(...)``
    parameters because the payload is 1-N players each with 1-N events,
    which FastAPI's form binding cannot express.
    """
    page, tournament = _resolve(repo, slug)
    form = await request.form()

    # 3 — the form CSRF token, before the body is read for anything else.
    require_form_csrf(request, form)

    ip = client_ip(request)
    throttle_key = auth_service.entries_key(ip)

    # 4 — the per-IP budget. Turnstile guards signup, not this: a challenge
    # in front of a route that already requires an account would charge
    # every honest entrant a puzzle to slow down an attacker who has
    # already signed up.
    remaining = auth_service.throttle_check(repo.session, throttle_key)
    if remaining is not None:
        raise http_error(
            429,
            ErrorCode.AUTH_THROTTLED,
            "Too many entries from this connection — try again later",
            extra={"retryAfterSeconds": int(remaining) + 1},
        )

    def refuse(status: int, message: str):
        auth_service.throttle_record_entry(repo.session, throttle_key)
        repo.session.commit()
        return http_error(status, ErrorCode.INVALID_INPUT, message)

    # 5 — the acknowledgment. One given after the fact is not one.
    if str(form.get("acknowledged") or "").strip().lower() not in _TICKED:
        raise refuse(400, "Please accept the regulations before submitting.")

    parsed = parse_players(form)
    if not parsed:
        raise refuse(
            400, "Please give a player's name, their gender, and at least one event."
        )

    try:
        resolved = _resolve_selections(repo, tournament.id, parsed)
    except HTTPException:
        raise refuse(400, "That event is not taking entries.")

    grouped = [(str(i), events) for i, (_, events) in enumerate(resolved)]

    # 6 — entry policy, refused WITH THE RULE STATED (R14 §4).
    refusal = check_policy(page, grouped)
    if refusal is not None:
        raise refuse(400, refusal.message)

    # The fee, computed server-side in one place. The total shown to the
    # entrant IS the total recorded (Seam B) — never recomputed afterwards,
    # and computed by the same call POST /e/api/quote/{slug} makes.
    total, basis = compute_fee_total(
        page, [PlayerSelection(key, events) for key, events in grouped]
    )

    # The key: header first (a hydrated fetch), hidden field second (an
    # unhydrated native form, which cannot send a header at all). Bounded
    # to the column's 64 characters on both paths.
    key = idempotency_key or str(form.get("idempotencyKey") or "")[:64] or None

    # 7-9 — replay, flags and the write, all inside the submission service.
    result = submission_service.create_submission(
        repo.session,
        tournament_id=tournament.id,
        page=page,
        account_id=uuid.UUID(entrant.id),
        players=[
            submission_service.PlayerInput(
                full_name=spec["name"],
                gender=spec["gender"],
                club=spec["club"],
                birth_year=spec["birthYear"],
                remarks=spec["remarks"],
                events=events,
            )
            for spec, events in resolved
        ],
        fee_total_cents=total,
        fee_basis=basis,
        idempotency_key=key,
    )

    auth_service.throttle_record_entry(repo.session, throttle_key)
    repo.session.commit()
    # 303, not 302: the browser must re-issue as GET. A replay redirects to
    # the SAME receipt — a retrying client that saw a different answer would
    # conclude its first attempt had failed.
    return RedirectResponse(
        url=f"/e/{page.slug}/receipt/{result.submission.id}",
        status_code=303,
    )
```

Add the two module-level pieces this route needs, near the top of `api/entries_json.py`:

```python
from fastapi import HTTPException

# An HTML checkbox posts its value only when ticked, so presence is the
# signal; the values are what browsers and hand-rolled clients actually
# send. Mirrors ``api/entries_public._TICKED``, which §9 deletes with the
# module that owns it.
_TICKED = frozenset({"on", "true", "1", "yes"})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py tests/test_auth_surface.py tests/test_tenant_isolation.py`

Expected: PASS. `test_auth_surface.py` matters here: `POST /e/api/submit/{slug}` is deliberately **not** added to `PUBLIC_BY_DESIGN` — it carries `get_current_entrant` and answers the gate's 401 like any other guarded route, which is the point.

Then: `ruff check products/scheduler/backend/api/entries_json.py`

Expected: `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/api/entries_json.py products/scheduler/tests/test_entries_json_routes.py
git commit -m "feat(entries): add the persist path at POST /e/api/submit/{slug}

The incumbent's guard order verbatim — session, slug, form CSRF, per-IP
throttle, acknowledgment, parse, events-open, policy, fee, write. Only the
answer shape changes: 303 to an RR7 receipt route, so a reload never
re-posts, and a replay redirects to the same receipt.

The Idempotency-Key is read from the hidden field as well as the header,
which is what makes UNIQUE (tournament_id, idempotency_key) reachable for
the first time: a native form cannot send a header, so the key was always
NULL for real entrants until now. Pinned by a test, with a no-key control
proving the route is not collapsing acts onto one row.

Not added to PUBLIC_BY_DESIGN: it declares get_current_entrant and answers
the auth-surface gate's 401 like any other guarded route.

No test edited or deleted."
```

---

### Task 12: `/e/account/{signup,login,logout}` — urlencoded bodies and the `_csrf` channel

**Files:**
- Modify: `products/scheduler/backend/api/entrants.py:41-59` (imports), `:74-102` (add the body dependencies after the DTOs), `:196-203` (signup signature), `:280-286` (login signature), `:339-344` (logout body)
- Test: `products/scheduler/tests/test_entrant_auth_routes.py` (append; no existing test edited)

**Interfaces:**
- Consumes: `api.entries_json.require_form_csrf(request: Request, form) -> None` (Task 10); `services.entry_form.PLAY_CSRF_COOKIE` (Task 10); existing `SignupRequest`, `LoginRequest`, `SignupResponse`, `EntrantDTO`, `_set_entrant_cookie`, `_clear_entrant_cookie` in `api/entrants.py`.
- Produces: **zero new routes** — F-E1-2-E1 is a missing-UI finding. The three existing routes gain: acceptance of `application/x-www-form-urlencoded` bodies (with Cloudflare's `cf-turnstile-response` field name mapped onto `turnstileToken`), a route-level `_csrf` requirement on the form path, and a `303` answer whose `Location` comes from a validated `next` field. JSON behaviour — status codes, bodies, 422 shapes — is unchanged.

**Two design points the implementer must not "simplify" away:**

1. **The `_csrf` requirement applies to the form path only, and that is correct, not a gap.** A cross-site page can post `application/x-www-form-urlencoded` with no preflight; it cannot post `application/json` without one. Urlencoded is therefore the only reachable CSRF vector on a pre-session route, and gating exactly it is the whole defense. Applying it to JSON would break every existing caller for no gain.
2. **The routes stay `def`, not `async def`.** The body is parsed by an `async` *dependency*; FastAPI allows those on sync routes, so the sync SQLAlchemy work (Argon2id hashing, in particular) keeps running in the threadpool instead of blocking the event loop.

- [ ] **Step 1: Write the failing test**

Append to `products/scheduler/tests/test_entrant_auth_routes.py`. Read its existing fixtures first and reuse them by name; if it has no `client`/`turnstile` fixture pair matching the ones below, add these locally under a new class.

```python
# ---- the unhydrated HTML path (Phase 6, F-E1-2-E1) -----------------------
#
# Until Phase 6 the logged-out entry page NAMED these routes and shipped no
# form, so no human could self-serve an account. The finding is a missing
# UI, not a missing route — so these three keep their paths, their guards
# and their JSON contract, and gain one thing: a body a browser can post
# without JavaScript.
#
# The CSRF channel is form-only ON PURPOSE. A cross-site page can post
# urlencoded with no preflight and cannot post JSON without one, so
# urlencoded is the only reachable vector on a pre-session route. Gating
# exactly it is the defense; gating JSON too would break every existing
# caller for nothing.

PLAY_CSRF = "sw_play_csrf"
FORM = {"Content-Type": "application/x-www-form-urlencoded"}


def test_a_form_signup_maps_cloudflares_field_name_and_redirects(
    client, turnstile
):
    """Cloudflare's widget posts its solution under ``cf-turnstile-response``
    in a form; the JSON surface names it ``turnstileToken`` (SignupRequest).
    Renaming it on the node tier would put a second spelling of one field in
    a second codebase."""
    client.cookies.set(PLAY_CSRF, "a-minted-opaque-value")
    r = client.post(
        "/e/account/signup",
        data={
            "email": "unhydrated@example.com",
            "password": GOOD_PW,
            "cf-turnstile-response": "a-solved-token",
            "next": "/e/account/login",
            "_csrf": "a-minted-opaque-value",
        },
        follow_redirects=False,
    )
    assert r.status_code == 303, r.text
    assert r.headers["location"] == "/e/account/login"
    # The account really exists — a redirect is not evidence of a write.
    assert (
        client.post(
            "/e/account/login",
            json={"email": "unhydrated@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )


def test_a_form_login_without_the_play_csrf_token_is_refused(client, turnstile):
    """NEGATIVE CONTROL. Pre-session login CSRF is a live gap today —
    ``form_csrf`` returns "" for an absent session — and this is the cookie
    that closes it. To prove it is not vacuous: delete the
    ``require_form_csrf`` call from the form branch and this goes red while
    the redirect test above stays green. Put it back.
    """
    r = client.post(
        "/e/account/login",
        data={"email": "nobody@example.com", "password": GOOD_PW},
        follow_redirects=False,
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_form_login_with_a_mismatched_play_csrf_token_is_refused(
    client, turnstile
):
    """The double-submit's actual claim: the value must have been READ from
    the cookie. A guessed one is not."""
    client.cookies.set(PLAY_CSRF, "the-real-value")
    r = client.post(
        "/e/account/login",
        data={
            "email": "nobody@example.com",
            "password": GOOD_PW,
            "_csrf": "a-guessed-value",
        },
        follow_redirects=False,
    )
    assert r.status_code == 403


@pytest.mark.parametrize(
    "hostile",
    [
        "https://evil.example/harvest",
        "//evil.example/harvest",
        "/api/tournaments",
        "/e/../../api/tournaments",
        "",
    ],
)
def test_a_form_login_never_redirects_off_the_entrant_tier(
    client, turnstile, hostile
):
    """NEGATIVE CONTROL — open redirect.

    An open redirect on a LOGIN route is a phishing primitive: the victim
    types real credentials on a real origin and is then handed to the
    attacker's page carrying whatever the link said. ``next`` is therefore
    not sanitised, it is MATCHED against the one prefix the entrant tier
    owns, and anything else is discarded for the fallback. ``..`` is
    excluded explicitly because a browser normalises ``/e/../../api`` to
    ``/api`` before it ever leaves the address bar.

    To prove this is not vacuous: change ``_next_target`` to
    ``return str(raw or fallback)`` and all five cases go red.
    """
    client.cookies.set(PLAY_CSRF, "v")
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "redirect@example.com",
                "password": GOOD_PW,
                "turnstileToken": "t",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    r = client.post(
        "/e/account/login",
        data={
            "email": "redirect@example.com",
            "password": GOOD_PW,
            "_csrf": "v",
            "next": hostile,
        },
        follow_redirects=False,
    )
    assert r.status_code == 303, r.text
    assert r.headers["location"] == "/e/account/login"


def test_a_form_login_honours_a_same_tier_next(client, turnstile):
    """Non-vacuity for the five refusals above: ``next`` is honoured when it
    names the entrant tier, so the rejections are a filter and not a
    hard-coded constant."""
    client.cookies.set(PLAY_CSRF, "v")
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "backto@example.com",
                "password": GOOD_PW,
                "turnstileToken": "t",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    r = client.post(
        "/e/account/login",
        data={
            "email": "backto@example.com",
            "password": GOOD_PW,
            "_csrf": "v",
            "next": "/e/spring-open",
        },
        follow_redirects=False,
    )
    assert r.status_code == 303
    assert r.headers["location"] == "/e/spring-open"
    assert client.cookies.get("sw_play_session")


def test_a_form_logout_proves_itself_with_the_session_derived_token(
    client, turnstile
):
    """A logout carries the very cookie it exists to destroy, so it trips
    the CSRF middleware — which is why the JSON surface was made
    header-carrying in the first place. The form path proves itself with
    the SESSION-derived digest instead: the session branch of
    ``check_form_csrf`` wins whenever a session is present."""
    from services.entry_form import form_csrf

    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "bye@example.com",
                "password": GOOD_PW,
                "turnstileToken": "t",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    assert (
        client.post(
            "/e/account/login",
            json={"email": "bye@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )
    token = form_csrf(client.cookies.get("sw_play_session"))
    r = client.post(
        "/e/account/logout",
        data={"_csrf": token, "next": "/e/account/login"},
        headers=CSRF,
        follow_redirects=False,
    )
    assert r.status_code == 303
    assert r.headers["location"] == "/e/account/login"
    assert client.post("/e/account/me").status_code in (401, 405)
    assert client.get("/e/account/me").status_code == 401


def test_the_json_contract_is_untouched(client, turnstile):
    """The whole point of "zero new routes" is that the JSON callers do not
    notice. Status codes and the StrictModel 422 both survive the body
    dependency."""
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "json@example.com",
                "password": GOOD_PW,
                "turnstileToken": "t",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    r = client.post(
        "/e/account/signup",
        json={
            "email": "json2@example.com",
            "password": GOOD_PW,
            "turnstileToken": "t",
            "isAdmin": True,
        },
        headers=CSRF,
    )
    assert r.status_code == 422, r.text
    assert any(e["type"] == "extra_forbidden" for e in r.json()["detail"]), r.text
    r = client.post(
        "/e/account/login",
        json={"email": "json@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert r.status_code == 200
    assert r.json()["email"] == "json@example.com"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entrant_auth_routes.py -k "form_signup or form_login or form_logout"`

Expected: FAIL with `assert 422 == 303` on `test_a_form_signup_maps_cloudflares_field_name_and_redirects` — FastAPI parses the declared `body: SignupRequest` as JSON, the urlencoded payload is not JSON, and the route answers `422` with `{"type": "model_attributes_type", ...}`.

- [ ] **Step 3: Write minimal implementation**

In `products/scheduler/backend/api/entrants.py`, extend the imports:

```python
import re
from typing import Optional, Type

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ValidationError

from api.entries_json import require_form_csrf
```

Add after the DTO block (after `EntrantDTO`, line 113):

```python
# ---- the unhydrated HTML path (Phase 6) ------------------------------
#
# **Zero new routes.** F-E1-2-E1 is a missing-UI finding: this file already
# had signup, login and logout, and the logged-out entry page already NAMED
# them — it just shipped no form, so no human could self-serve an account.
# What these three gain is a body a browser can post without JavaScript,
# and the proof-of-intent that a body needs.

_FORM_CONTENT_TYPES = frozenset(
    {"application/x-www-form-urlencoded", "multipart/form-data"}
)

# Fields the HTML forms carry that are transport, not domain. ``StrictModel``
# forbids extras, so they are stripped before the model is built rather than
# added to it: ``_csrf`` is how a form proves itself and ``next`` is where it
# goes back to, and neither is a property of an account.
_TRANSPORT_FIELDS = frozenset({"_csrf", "next"})

# Optional text inputs post ``""`` when left blank, which is a VALUE to a
# StrictModel and would fail ``Name``'s bounds where a JSON caller simply
# omits the key. Dropped for these two only — never for ``password``, where
# an empty string must reach ``validate_password`` and come back as a
# readable AUTH_WEAK_PASSWORD rather than a 422 about a missing field.
_OPTIONAL_TEXT = frozenset({"displayName", "phone"})

# The one prefix the entrant tier owns. Anchored, so ``//host`` and
# ``https://host`` both fail; ``..`` is excluded separately because a
# browser normalises ``/e/../../api`` to ``/api`` before the request is
# ever made.
_SAFE_NEXT = re.compile(r"^/e/[A-Za-z0-9/_.~-]*$")


def is_form_post(request: Request) -> bool:
    return (
        (request.headers.get("content-type") or "").split(";")[0].strip().lower()
        in _FORM_CONTENT_TYPES
    )


def next_target(raw: Optional[str], fallback: str) -> str:
    """Where a form post sends the browser, and nowhere else.

    An open redirect on a login route is a phishing primitive: the victim
    types real credentials on a real origin and is then handed to an
    attacker's page carrying whatever the link said. So the target is not
    *sanitised* — it is matched against the one prefix this tier owns, and
    anything else is discarded for the fallback. Matching beats stripping
    because a stripper has to anticipate every encoding and a matcher does
    not.
    """
    value = str(raw or "")
    if ".." in value or not _SAFE_NEXT.match(value):
        return fallback
    return value


async def _payload(request: Request) -> dict:
    """The request body as a plain dict, JSON or urlencoded.

    A dependency rather than a route change so the routes stay ``def`` and
    keep running in the threadpool — Argon2id on the event loop would stall
    every other request in the process for the duration of a hash.
    """
    if not is_form_post(request):
        body = await request.json()
        return body if isinstance(body, dict) else {}

    form = await request.form()
    data = {
        key: str(value)
        for key, value in form.multi_items()
        if key not in _TRANSPORT_FIELDS
    }
    # Cloudflare posts the widget's solution under ``cf-turnstile-response``
    # in a form; the JSON surface names it ``turnstileToken`` (see
    # ``SignupRequest``). Mapping it HERE rather than on the node tier keeps
    # one spelling of one field in one codebase.
    solution = data.pop("cf-turnstile-response", None)
    if solution is not None:
        data.setdefault("turnstileToken", solution)
    return {
        key: value
        for key, value in data.items()
        if value != "" or key not in _OPTIONAL_TEXT
    }


def _build(data: dict, model: Type[BaseModel]) -> BaseModel:
    """Construct the DTO, preserving FastAPI's own 422 for a bad body.

    Re-raised as ``RequestValidationError`` deliberately: a bare pydantic
    ``ValidationError`` has no handler and would 500. The JSON callers'
    status codes and error bodies are unchanged by this whole change, and
    ``test_the_json_contract_is_untouched`` is what says so.
    """
    try:
        return model(**data)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


async def signup_body(request: Request) -> SignupRequest:
    if is_form_post(request):
        require_form_csrf(request, await request.form())
    return _build(await _payload(request), SignupRequest)


async def login_body(request: Request) -> LoginRequest:
    if is_form_post(request):
        require_form_csrf(request, await request.form())
    return _build(await _payload(request), LoginRequest)
```

Change the signup signature (line 199-203) from `body: SignupRequest,` to:

```python
def signup(
    request: Request,
    body: SignupRequest = Depends(signup_body),
    repo: LocalRepository = Depends(get_repository),
):
```

and drop its `-> SignupResponse` annotation (it now returns a `RedirectResponse` on the form path). Replace its `return SignupResponse()` (line 277) with:

```python
    if is_form_post(request):
        # 303 to the login page, not into a session: signup hands out no
        # cookie on either branch, because a cookie set only on the created
        # branch would be as observable as a status code (module docstring).
        form = await_form_cache(request)
        return RedirectResponse(
            url=next_target(form.get("next"), "/e/account/login"),
            status_code=status.HTTP_303_SEE_OTHER,
        )
    return SignupResponse()
```

`await_form_cache` does not exist — Starlette caches the parsed form on the request, but reading it needs `await`, which a `def` route cannot do. Take the target off the dependency instead: add a third dependency and use it in both routes.

```python
async def form_next(request: Request) -> str:
    """The raw ``next`` field, unvalidated. ``next_target`` validates it at
    the point of use, so this stays a dumb reader and there is exactly one
    validator."""
    if not is_form_post(request):
        return ""
    return str((await request.form()).get("next") or "")
```

Signup then becomes:

```python
def signup(
    request: Request,
    body: SignupRequest = Depends(signup_body),
    next_raw: str = Depends(form_next),
    repo: LocalRepository = Depends(get_repository),
):
    ...  # the existing body is unchanged — add only the branch below, at the end
    if is_form_post(request):
        return RedirectResponse(
            url=next_target(next_raw, "/e/account/login"),
            status_code=status.HTTP_303_SEE_OTHER,
        )
    return SignupResponse()
```

Login (line 281-286) becomes:

```python
def login(
    request: Request,
    response: Response,
    body: LoginRequest = Depends(login_body),
    next_raw: str = Depends(form_next),
    repo: LocalRepository = Depends(get_repository),
):
```

with its tail (lines 330-336) changed to set the cookie on whichever response is actually returned:

```python
    if is_form_post(request):
        redirect = RedirectResponse(
            url=next_target(next_raw, "/e/account/login"),
            status_code=status.HTTP_303_SEE_OTHER,
        )
        _set_entrant_cookie(redirect, token)
        return redirect
    _set_entrant_cookie(response, token)
    return EntrantDTO(
        id=str(account.id),
        email=account.email,
        displayName=account.display_name,
        emailVerified=account.email_verified,
    )
```

Also remove `response_model=EntrantDTO` from the login decorator (line 280) — a 303 does not satisfy it — leaving `@router.post("/login")`.

Logout (line 340-344) becomes:

```python
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    next_raw: str = Depends(form_next),
    csrf_checked: None = Depends(logout_form_csrf),
    repo: LocalRepository = Depends(get_repository),
) -> Response:
```

with a matching dependency alongside the other two:

```python
async def logout_form_csrf(request: Request) -> None:
    """A logout carries the very cookie it exists to destroy, which is why
    the JSON surface was made header-carrying in the first place. The form
    path proves itself with the session-derived digest instead — the
    session branch of ``check_form_csrf`` wins whenever a session is
    present, so a planted ``sw_play_csrf`` cannot downgrade it."""
    if is_form_post(request):
        require_form_csrf(request, await request.form())
```

and its tail (lines 357-359):

```python
    _clear_entrant_cookie(response)
    if is_form_post(request):
        redirect = RedirectResponse(
            url=next_target(next_raw, "/e/account/login"),
            status_code=status.HTTP_303_SEE_OTHER,
        )
        _clear_entrant_cookie(redirect)
        return redirect
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_entrant_auth_routes.py tests/test_entries_json_routes.py tests/test_auth_surface.py tests/test_csrf_cookie_registry.py tests/test_cross_principal_sessions.py`

Expected: PASS. `test_csrf_cookie_registry.py` matters: `sw_play_csrf` is set by the SSR tier, never by a `set_cookie` in `backend/api/`, so the registry's source-derived guard sees nothing new and `settings.session_cookie_names` is untouched.

Then: `cd products/scheduler && pytest` (full backend suite) and `ruff check products/scheduler/backend`

Expected: PASS / `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/api/entrants.py products/scheduler/tests/test_entrant_auth_routes.py
git commit -m "feat(entrants): accept urlencoded bodies and the _csrf channel on signup/login/logout

ZERO new routes — F-E1-2-E1 is a missing-UI finding, not a missing-route
one. The three existing routes gain a body a browser can post without
JavaScript: Cloudflare's cf-turnstile-response mapped onto turnstileToken,
a route-level _csrf check on the form path, and a 303 whose Location comes
from a validated 'next'.

The _csrf requirement is form-only on purpose: a cross-site page can post
urlencoded with no preflight and cannot post JSON without one, so
urlencoded is the only reachable CSRF vector on a pre-session route.

Two negative controls with break-it recipes: a form login with no/wrong
_csrf is 403 (closing the live pre-session gap, where form_csrf returns ''
for an absent session), and 'next' is MATCHED against /e/ rather than
sanitised — an open redirect on a login route is a phishing primitive.
'..' is excluded explicitly because browsers normalise it before sending.

Routes stay sync; the body is parsed by an async dependency, so Argon2id
keeps running in the threadpool. JSON status codes and the StrictModel 422
are unchanged and pinned by test_the_json_contract_is_untouched.

No test edited or deleted."
```

---

### Task 12b: `GET /e/api/entries` — the public slug list the sitemap needs

The sitemap in Task 26 crawls every public entry page, and no route lists them. Building it here, in the routes group, keeps every backend surface in one place and means Task 26 has a real endpoint to call instead of a promise.

**Files:**
- Modify: `products/scheduler/backend/api/entries_json.py` (created in Task 8)
- Modify: `products/scheduler/tests/test_auth_surface.py` (allowlist entry + reason)
- Test: `products/scheduler/tests/test_entries_json_routes.py`

**Interfaces:**
- Consumes: the `entries_json` router and its `get_repository` dependency wiring from Task 8.
- Produces: `GET /e/api/entries` -> `{"entries": [{"slug": str, "updatedAt": str | None}]}`, public, no session. Task 26's sitemap loader consumes exactly this shape.

**The security property this route must hold.** `EntryPage.is_open` (`database/models.py:1592`, default `False`) is what makes a page public at all — `_resolve` (`api/entries_public.py:254-263`) answers a uniform 404 for a closed page. A list route that ignored `is_open` would publish the addresses of unopened events into a *crawlable sitemap*, which is worse than a 404: it discloses that a workspace and its slug exist before the director has opened entries. Filtering on `is_open` is therefore the behaviour, and its negative control is mandatory.

- [ ] **Step 1: Write the failing test**

```python
def test_entries_list_returns_only_open_pages(client, repo, make_tournament):
    """The sitemap feed publishes open pages and nothing else.

    A closed page is not merely 404 on read (``_resolve``) — listing it would
    leak the slug of an event whose director has not opened entries.
    """
    open_t = make_tournament()
    closed_t = make_tournament()
    _make_entry_page(repo, open_t.id, slug="open-cup", is_open=True)
    _make_entry_page(repo, closed_t.id, slug="secret-cup", is_open=False)

    response = client.get("/e/api/entries")

    assert response.status_code == 200
    slugs = [entry["slug"] for entry in response.json()["entries"]]
    assert slugs == ["open-cup"]
    assert "secret-cup" not in slugs


def test_entries_list_is_public_and_needs_no_session(client, repo, make_tournament):
    """Non-vacuity: the route answers without any cookie at all."""
    tournament = make_tournament()
    _make_entry_page(repo, tournament.id, slug="open-cup", is_open=True)

    response = client.get("/e/api/entries")

    assert response.status_code == 200
    assert response.json()["entries"][0]["slug"] == "open-cup"


def test_entries_list_has_a_stable_tiebreaker(client, repo, make_tournament):
    """Ordering must not tie non-deterministically across SQLite and Postgres.

    ``id`` is a random UUID, so ``slug`` is the only stable public sort key.
    """
    tournament = make_tournament()
    for slug in ("charlie-open", "alpha-open", "bravo-open"):
        _make_entry_page(repo, tournament.id, slug=slug, is_open=True)

    slugs = [e["slug"] for e in client.get("/e/api/entries").json()["entries"]]

    assert slugs == ["alpha-open", "bravo-open", "charlie-open"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py -k entries_list -v`

Expected: FAIL with `assert 404 == 200` — the router has no `/entries` path yet.

- [ ] **Step 3: Write minimal implementation**

In `products/scheduler/backend/api/entries_json.py`:

```python
class EntryListItem(BaseModel):
    slug: str
    updated_at: Optional[datetime] = Field(default=None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True)


class EntryListResponse(BaseModel):
    entries: List[EntryListItem]


@router.get("/entries", response_model=EntryListResponse)
def list_public_entries(
    repo: LocalRepository = Depends(get_repository),
) -> EntryListResponse:
    """Every OPEN entry page, for the sitemap.

    ``is_open`` is the whole access control here: a closed page is invisible to
    ``_resolve`` and must be invisible to a crawler too, or the sitemap becomes
    a disclosure channel for events that have not opened.

    Ordered by ``slug`` because ``id`` is a random UUID and ``created_at``
    alone ties non-deterministically across SQLite and Postgres.
    """
    pages = repo.session.scalars(
        select(EntryPage).where(EntryPage.is_open.is_(True)).order_by(EntryPage.slug)
    )
    return EntryListResponse(
        entries=[
            EntryListItem(slug=page.slug, updated_at=getattr(page, "updated_at", None))
            for page in pages
        ]
    )
```

Then add the allowlist entry in `products/scheduler/tests/test_auth_surface.py`, following the existing `PUBLIC_BY_DESIGN` idiom exactly (read a neighbouring entry before writing this one):

```python
    "GET /e/api/entries": "Sitemap feed. Open entry pages only; is_open gates it.",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py -k entries_list -v && pytest tests/test_auth_surface.py -v`

Expected: PASS — three list tests plus a green auth-surface sweep.

- [ ] **Step 5: Prove the negative control is not vacuous**

Temporarily delete `.where(EntryPage.is_open.is_(True))` and re-run:

Run: `cd products/scheduler && pytest tests/test_entries_json_routes.py::test_entries_list_returns_only_open_pages -v`

Expected: FAIL — `assert ['open-cup', 'secret-cup'] == ['open-cup']`. Restore the filter and confirm it passes again. If deleting the filter does **not** fail the test, the control is vacuous and must be fixed before moving on.

- [ ] **Step 6: Commit**

```bash
git add products/scheduler/backend/api/entries_json.py
git add products/scheduler/tests/test_entries_json_routes.py
git add products/scheduler/tests/test_auth_surface.py
git commit -m "feat(entries): list open entry pages for the sitemap

GET /e/api/entries backs the sitemap route in Task 26, which had no
endpoint to call. Public by design, with an allowlist entry and reason.

is_open is the access control: _resolve already answers a uniform 404
for a closed page, and listing one would publish the slug of an event
whose director has not opened entries into a crawlable sitemap. The
negative control fails if the filter is removed.

Ordered by slug - id is a random UUID and created_at alone ties
non-deterministically across SQLite and Postgres."
```

---

### Task 13: Scope submission idempotency replay to the requesting account

**Files:**
- Modify: `products/scheduler/backend/services/submissions.py:19-28` (module docstring), `:100-109` (`find_by_idempotency_key`), `:133-146` (`replay`), `:211-240` (`create_submission`)
- Modify: `products/scheduler/backend/database/models.py:1216-1223` (docstring), `:1271-1280` (the index)
- Create: `products/scheduler/backend/alembic/versions/t4e9a3c6d1f2_submission_idempotency_account_scope.py`
- Test: `products/scheduler/tests/unit/test_submission_service.py` (new cross-account case + helper `account=` param; edits `test_a_lost_race_on_the_unique_index_returns_the_winner_not_a_conflict`)
- Test: `products/scheduler/tests/test_entries_public_routes.py` (new route-level case)
- Test: `products/scheduler/tests/unit/test_entries_schema_levels.py:358-382` and `:385-390` (re-pointed), new same-key-different-account case
- Test: `products/scheduler/tests/unit/test_entries_migration.py:41-42`, `:117`, `:142-146`, `:328`, `:359-368` (re-pointed to the new head)

**Interfaces:**
- Consumes: nothing from earlier tasks. It consumes the route's existing call shape at `backend/api/entries_public.py:1237-1258`, which **already** passes `account_id=uuid.UUID(entrant.id)` to `create_submission` — so the route needs no edit and no new plumbing.
- Produces:
  - `services.submissions.find_by_idempotency_key(session: Session, tournament_id: uuid.UUID, key: str, account_id: uuid.UUID) -> Optional[Submission]` — `account_id` is a new **required positional** fourth parameter.
  - `services.submissions.replay(session: Session, tournament_id: uuid.UUID, key: Optional[str], account_id: uuid.UUID) -> Optional[SubmissionResult]` — same.
  - `create_submission(...)` signature **unchanged** (it already takes `account_id`); its behaviour changes: a key minted by another account no longer resolves.
  - DB index `uq_submissions_tournament_account_idempotency_key` on `submissions(tournament_id, account_id, idempotency_key)`, unique; replaces `uq_submissions_tournament_idempotency_key`.
  - Alembic revision `t4e9a3c6d1f2`, `down_revision = "s3d8f2b5c0e1"`. This is the new head; any later migration in this phase must revise `t4e9a3c6d1f2`.

---

#### The two decisions this task has to make out loud

**1. What is the correct response for entrant B posting A's key?** → **a fresh submission of B's own, `201`**, indistinguishable from any first-time post.

Justified from the route's actual error vocabulary (`backend/api/entries_public.py:1112-1265`), which has exactly three refusal shapes: `http_error(403, ErrorCode.AUTH_CSRF_REQUIRED)` at `:1140-1144`, `http_error(429, ErrorCode.AUTH_THROTTLED)` at `:1155-1160`, and the `refuse(status, message)` closure at `:1172-1178` that renders an HTML refusal page with a 400. There is **no 409 anywhere in this route**, and the service module docstring at `services/submissions.py:24-28` rules 409 out for this exact path in terms — *"Answering 409 to the loser would be a correct-looking error to a client that did nothing wrong."* Two answers were defensible on the face of it and I am naming why I rejected each:

- **409 Conflict** — rejected. It would introduce a status the route does not otherwise speak, and worse it is an *existence oracle*: it tells B that key K is in use in this tournament. That is ruling D4's own objection ("let an outsider probe another tenant's keyspace and learn that some other workspace used the same key", `submissions.py:19-23`) applied one scope down. A fix for a disclosure bug must not ship a narrower version of the same disclosure.
- **404** — rejected. Nothing is missing: the slug resolved, the events resolved, the form is well-formed. A 404 would be a lie about the request that actually arrived.

So B is told nothing at all about A: B's post behaves exactly as if K had never been used. That is also the only answer that is *silent*, which is the property the D4 rationale is optimising for.

**2. Does `UNIQUE (tournament_id, idempotency_key)` have to move too, or are the constraint and the lookup legitimately different scopes?** → **it has to move.** They are not independent, and the evidence is in the code, not in taste:

`create_submission` recovers from a lost unique-index race by re-running `replay` inside the `except IntegrityError` block (`submissions.py:226-240`) and **re-raises when that second lookup misses** (`:233-234`). If the lookup narrows to the account while the index stays tenant-wide, entrant B's insert hits `uq_submissions_tournament_idempotency_key` (A's row owns `(tid, "K")`), the recovery `replay` misses (A's row is not B's), and line `:234` re-raises an unhandled `IntegrityError` → HTTP 500. B still learns that K is taken — via a crash instead of a receipt. The fix would have converted a disclosure into a crash-shaped disclosure. So the index narrows with the lookup, to `(tournament_id, account_id, idempotency_key)`.

This **does not weaken D4**. Account scope is strictly narrower than tenant scope, so the cross-tenant probe D4 forbids remains impossible a fortiori — `models.py:1216-1223` and migration `s3d8f2b5c0e1`'s note 1 (`:47-54`) both argue *against globality*, and narrowing is the same argument continued. NULL keys stay exempt on both dialects for the unchanged reason: a NULL in any indexed column keeps the row out of the uniqueness comparison, and `account_id` is `NOT NULL` (`models.py:1231-1233`) so the NULL-key case is governed by `idempotency_key` exactly as before.

**Why a new revision rather than editing `s3d8f2b5c0e1`:** `s3d8f2b5c0e1` is merged (`4dc3a93`). The repo's own precedent for reshaping a merged entries migration is a *successor* revision that drops and recreates — that is exactly what `s3d8f2b5c0e1` did to `r2c7e1f4a9b3` (`_drop_r2_schema`, `:123-139`). `git log` confirms `s3d8f2b5c0e1` is the current head (`down_revision` chain terminates there; no file revises it).

---

- [ ] **Step 1: Write the failing tests**

First, the service level. In `products/scheduler/tests/unit/test_submission_service.py`, give the `_create` helper an account override (additive, default preserves every existing call) — replace lines 89-99:

```python
def _create(session, world, players, *, key=None, total=5500, basis=None, account=None):
    return create_submission(
        session,
        tournament_id=world["tid"],
        page=world["page"],
        account_id=(account or world["account"]).id,
        players=players,
        fee_total_cents=total,
        fee_basis=basis if basis is not None else {"basis": "schedule", "players": []},
        idempotency_key=key,
    )


def _other_account(session, email="coach@example.com"):
    row = EntrantAccount(email=email, password_hash="x")
    session.add(row)
    session.commit()
    return row
```

Then append this, immediately after `test_the_key_is_scoped_to_the_workspace` (ends line 363):

```python
def test_a_key_minted_by_another_account_does_not_resolve(session, world):
    """D4 narrowed to the principal (SP-PROGRAM-1 Phase 6 §4).

    Tenant scope alone was enough only while no real key ever arrived: a
    native HTML form cannot send a header, so ``idempotency_key`` was NULL
    for every real entrant and this branch was unreachable. Phase 6 mints
    the key in the loader and carries it as a hidden field, which makes a
    *guessed* key resolve — and a resolved key hands the guesser the other
    entrant's submission, i.e. their receipt.

    The answer is a fresh act, not a 409: this route speaks 403, 429 and a
    rendered 400 and nothing else, and a conflict status would tell the
    guesser that the key exists — the same disclosure D4 narrowed the
    index to prevent, one scope down.
    """
    mine = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="key-1",
    )
    stranger = _other_account(session)

    theirs = _create(
        session,
        world,
        [PlayerInput("Bo Ito", "M", events=[world["events"]["MS"]])],
        key="key-1",
        account=stranger,
    )

    assert theirs.replayed is False
    assert theirs.submission.id != mine.submission.id
    assert theirs.submission.account_id == stranger.id
    assert {e.id for e in theirs.entries}.isdisjoint({e.id for e in mine.entries})
    assert len(list(session.scalars(sa.select(Submission)))) == 2


def test_the_same_account_replaying_its_own_key_still_gets_its_act_back(session, world):
    """Non-vacuity for the test above: the narrowing must not have simply
    turned replay off. Same account, same key — still one act."""
    first = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="key-1",
    )
    second = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="key-1",
    )
    assert second.replayed is True
    assert second.submission.id == first.submission.id
    assert len(list(session.scalars(sa.select(Submission)))) == 1
```

Second, the storage level. In `products/scheduler/tests/unit/test_entries_schema_levels.py`, replace `test_the_submission_idempotency_index_is_unique_and_tenant_scoped` (lines 385-390) and add its negative control:

```python
def test_the_submission_idempotency_index_is_unique_and_account_scoped(session):
    """D4 survives the move up a level (spec Q5 amendment) and is narrowed
    to the principal by Phase 6 §4.

    Supersedes ``test_the_submission_idempotency_index_is_unique_and_tenant_scoped``:
    the tenant-only shape let a guessed key collide with another entrant's
    row, which the service's ``IntegrityError`` recovery path could not
    resolve (it re-reads with the *caller's* account and re-raises on a
    miss). Narrower than D4, never wider — the cross-tenant probe D4
    forbids stays impossible.
    """
    ix = _index("submissions", "uq_submissions_tournament_account_idempotency_key")
    assert ix.unique
    assert [c.name for c in ix.columns] == [
        "tournament_id",
        "account_id",
        "idempotency_key",
    ]


def test_the_same_key_under_another_account_in_one_tenant_is_accepted(session):
    """The other direction, in the database rather than the service: one
    workspace, one key string, two accounts, two rows."""
    tid = _tournament(session)
    mine = _account(session)
    theirs = _account(session, email="coach@example.com")
    session.add(Submission(tournament_id=tid, account_id=mine.id, idempotency_key="k"))
    session.commit()
    session.add(
        Submission(tournament_id=tid, account_id=theirs.id, idempotency_key="k")
    )
    session.commit()

    assert len(list(session.scalars(sa.select(Submission)))) == 2
```

…and re-point the enumeration at line 367 so the renamed index is still authorised:

```python
    authorised = {
        "uq_submissions_tournament_account_idempotency_key",
        "uq_entry_pages_slug",
    }
```

Third, the route level — the shape the spec actually describes. Append to `products/scheduler/tests/test_entries_public_routes.py`, after `test_a_key_is_scoped_to_the_tournament_the_slug_resolves_to` (ends line 1298):

```python
def test_a_key_is_scoped_to_the_account_that_minted_it(client, page, entrant, turnstile):
    """The disclosure the tenant-only scope left open (Phase 6 §4).

    Phase 6 mints the ``Idempotency-Key`` in the loader and carries it as a
    hidden field, so for the first time a real key travels. A second
    entrant posting a key they guessed must not be handed the first
    entrant's submission reference — the receipt names who entered what.

    ``201`` and a *second* submission is the whole answer: the guesser
    learns nothing, because a used key and an unused key look identical
    from outside.
    """
    assert _submit(client, page, headers={"Idempotency-Key": "key-1"}).status_code == 201
    mine = str(_submissions(page["tid"])[0].id)

    assert client.post("/e/account/logout", headers=CSRF).status_code == 204
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "stranger@example.com",
                "password": GOOD_PW,
                "turnstileToken": "a-solved-token",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    assert (
        client.post(
            "/e/account/login",
            json={"email": "stranger@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )

    guessed = _submit(client, page, headers={"Idempotency-Key": "key-1"})

    assert guessed.status_code == 201
    assert mine not in guessed.text, "the guesser was handed the other entrant's receipt"
    assert len(_submissions(page["tid"])) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run (repo `.venv` active):
```
cd products/scheduler && pytest tests/unit/test_submission_service.py::test_a_key_minted_by_another_account_does_not_resolve tests/unit/test_entries_schema_levels.py::test_the_submission_idempotency_index_is_unique_and_account_scoped tests/unit/test_entries_schema_levels.py::test_the_same_key_under_another_account_in_one_tenant_is_accepted "tests/test_entries_public_routes.py::test_a_key_is_scoped_to_the_account_that_minted_it"
```
Expected: **4 failed**, with these four distinct errors — each one is a different face of the same defect, and all four must be present before implementing:
- `test_a_key_minted_by_another_account_does_not_resolve` → `AssertionError: assert True is False` on `assert theirs.replayed is False` (the foreign key resolved).
- `test_the_submission_idempotency_index_is_unique_and_account_scoped` → `KeyError: 'uq_submissions_tournament_account_idempotency_key'` raised inside `_index` (the index does not exist yet).
- `test_the_same_key_under_another_account_in_one_tenant_is_accepted` → `sqlalchemy.exc.IntegrityError: (sqlite3.IntegrityError) UNIQUE constraint failed: submissions.tournament_id, submissions.idempotency_key`.
- `test_a_key_is_scoped_to_the_account_that_minted_it` → `AssertionError: assert 200 == 201` (the route replayed and answered 200 — this is literally the guesser receiving the other entrant's receipt).

`test_the_same_account_replaying_its_own_key_still_gets_its_act_back` passes now and must keep passing; it is the non-vacuity control, not a failing test.

- [ ] **Step 3: Write minimal implementation**

`products/scheduler/backend/services/submissions.py` — replace the docstring paragraph at lines 19-28:

```python
**The lookup is scoped to the workspace AND to the account, always**
(ruling D4, carried up a level; narrowed to the principal by
SP-PROGRAM-1 Phase 6 §4). The submit route is reachable by anyone
holding a public slug, so resolving a client-supplied key globally would
let an outsider probe another tenant's keyspace and learn that some other
workspace used the same key. Tenant scope alone was enough only while no
real key ever arrived — a native HTML form cannot send a header, so the
key was NULL for every real entrant — and Phase 6 makes keys flow, at
which point a *guessed* key resolves to another entrant's submission and
hands the guesser their receipt. The account is part of the identity of
the retry, not a filter applied to it, and the unique index moved with
the lookup for a mechanical reason: the ``IntegrityError`` recovery below
re-reads with the caller's account and re-raises on a miss, so a wider
index than the lookup would turn a foreign key into an unhandled 500.

**The race is handled by re-reading, not by 409.** Two identical posts in
flight both miss the lookup and one wins the unique index. Answering 409 to
the loser would be a correct-looking error to a client that did nothing
wrong — so the loser re-reads and receives the winner's submission, which
is what it asked for in the first place. A *different* account presenting
the same key is not that case and is not told anything either: it gets a
fresh act, because a conflict status would be the existence oracle D4
narrowed the index to prevent.
```

Replace `find_by_idempotency_key` (lines 100-109) and `replay` (lines 133-146):

```python
def find_by_idempotency_key(
    session: Session,
    tournament_id: uuid.UUID,
    key: str,
    account_id: uuid.UUID,
) -> Optional[Submission]:
    """Ruling D4, narrowed to the principal (Phase 6 §4)."""
    return session.execute(
        select(Submission).where(
            Submission.tournament_id == tournament_id,
            Submission.account_id == account_id,
            Submission.idempotency_key == key,
        )
    ).scalar_one_or_none()
```

```python
def replay(
    session: Session,
    tournament_id: uuid.UUID,
    key: Optional[str],
    account_id: uuid.UUID,
) -> Optional[SubmissionResult]:
    """The original act, whole, or ``None`` if this key is new *to this
    account* here."""
    if not key:
        return None
    existing = find_by_idempotency_key(session, tournament_id, key, account_id)
    if existing is None:
        return None
    return SubmissionResult(
        submission=existing,
        entries=entries_for(session, tournament_id, existing.id),
        replayed=True,
    )
```

In `create_submission`, pass the account through both call sites — line 211:

```python
    replayed = replay(session, tournament_id, idempotency_key, account_id)
```

and line 232:

```python
        winner = replay(session, tournament_id, idempotency_key, account_id)
```

`products/scheduler/backend/database/models.py` — replace the index in `Submission.__table_args__` (lines 1271-1280):

```python
    __table_args__ = (
        # Ruling D4, one level up, narrowed to the principal (Phase 6 §4).
        # It must match ``services.submissions.find_by_idempotency_key``
        # column for column: that function is what the IntegrityError
        # recovery re-reads with, and an index wider than the lookup turns
        # a foreign entrant's key collision into an unhandled 500 instead
        # of a fresh submission. NULLs compare distinct on both dialects,
        # so a NULL key is still exempt (``account_id`` is NOT NULL).
        Index(
            "uq_submissions_tournament_account_idempotency_key",
            "tournament_id",
            "account_id",
            "idempotency_key",
            unique=True,
        ),
        Index("ix_submissions_account", "account_id"),
    )
```

…and amend the class docstring paragraph at lines 1216-1223:

```python
    ``uq_submissions_tournament_account_idempotency_key`` is ruling D4
    carried up a level and then narrowed to the principal (Phase 6 §4):
    **tenant- and account-scoped**, unlike the solve rail's global index.
    The submit route is reachable by anyone holding a public slug, so
    resolving a client-supplied key globally would let an outsider probe
    another tenant's keyspace; resolving it tenant-wide would let one
    entrant's guessed key collide with — and, through the replay lookup,
    read back — another entrant's submission. NULL keys stay exempt on
    both dialects.
```

Create `products/scheduler/backend/alembic/versions/t4e9a3c6d1f2_submission_idempotency_account_scope.py`:

```python
"""Narrow the submission idempotency index to the account.

SP-PROGRAM-1 Phase 6 §4. ``s3d8f2b5c0e1`` created
``uq_submissions_tournament_idempotency_key`` on
``(tournament_id, idempotency_key)`` — ruling D4, tenant-scoped, and
correct for as long as no real key could arrive. It could not: the entry
form was a native HTML form and a native form cannot send an
``Idempotency-Key`` header, so the column was NULL for every real entrant
and the index never compared two live keys.

Phase 6 mints the key in the loader and carries it as a hidden field. Keys
now flow, and a *guessed* key would resolve — ``services.submissions.replay``
hands back the found submission, i.e. another entrant's receipt.

The lookup is narrowed to the account, and this index narrows with it. That
pairing is not stylistic: ``create_submission`` recovers from a lost race by
re-running ``replay`` inside ``except IntegrityError`` and re-raising when
that lookup misses, so an index wider than the lookup turns a foreign
entrant's collision into an unhandled 500 — the same disclosure, wearing a
crash. Narrower than D4 is never wider than D4, so the cross-tenant probe
D4 exists to forbid remains impossible.

An index swap rather than a table rebuild: ``DROP INDEX`` / ``CREATE INDEX``
is valid on SQLite and Postgres alike (this is an index, not a table
constraint), so no ``batch_alter_table`` is needed.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "t4e9a3c6d1f2"
down_revision: Union[str, Sequence[str], None] = "s3d8f2b5c0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(
        "uq_submissions_tournament_idempotency_key", table_name="submissions"
    )
    op.create_index(
        "uq_submissions_tournament_account_idempotency_key",
        "submissions",
        ["tournament_id", "account_id", "idempotency_key"],
        unique=True,
    )


def downgrade() -> None:
    """Back to tenant scope.

    This can fail on data written under the narrower index — two accounts
    in one workspace legitimately holding the same key is exactly what the
    upgrade permits — and that is the honest behaviour: a downgrade that
    silently dropped one of those rows would destroy a real submission.
    """
    op.drop_index(
        "uq_submissions_tournament_account_idempotency_key", table_name="submissions"
    )
    op.create_index(
        "uq_submissions_tournament_idempotency_key",
        "submissions",
        ["tournament_id", "idempotency_key"],
        unique=True,
    )
```

Now the existing tests the change supersedes. In `tests/unit/test_submission_service.py`, `test_a_lost_race_on_the_unique_index_returns_the_winner_not_a_conflict` monkeypatches `find_by_idempotency_key` with a three-argument stub (lines 322-324) — it must match the new arity:

```python
    def blind_first(sess, tid, key, account_id):
        calls["n"] += 1
        return None if calls["n"] == 1 else real(sess, tid, key, account_id)
```

In `tests/unit/test_entries_migration.py`, re-point five places at the new head — replace lines 41-42:

```python
# The revision that creates the entries family, the one that narrows its
# idempotency scope (the new head), and the one the family must follow.
ENTRIES_REVISION = "s3d8f2b5c0e1"
HEAD_REVISION = "t4e9a3c6d1f2"
PREVIOUS_REVISION = "r2c7e1f4a9b3"
```

line 117:

```python
    assert _head_revision(url) == HEAD_REVISION
```

lines 142-146:

```python
    idem = submissions["uq_submissions_tournament_account_idempotency_key"]
    assert idem["unique"], "D4: idempotency uniqueness must be enforced"
    assert idem["column_names"] == [
        "tournament_id",
        "account_id",
        "idempotency_key",
    ], "D4 + Phase 6 §4: the index is tenant- AND account-scoped, not global"
    assert "uq_submissions_tournament_idempotency_key" not in submissions, (
        "the tenant-only index is superseded, not kept alongside"
    )
```

line 328 (`test_downgrade_one_step_lands_back_on_the_previous_revision`) and line 359 (`test_upgrade_is_replayable_after_a_downgrade`) both step `-1`, which now lands on `s3d8f2b5c0e1` instead of `r2c7e1f4a9b3`. Name the target instead of counting steps — in both tests replace `command.downgrade(cfg, "-1")` with:

```python
    command.downgrade(cfg, PREVIOUS_REVISION)
```

and in `test_upgrade_is_replayable_after_a_downgrade` re-point the index name at lines 366-368:

```python
    assert _index_map(inspector, "submissions")[
        "uq_submissions_tournament_account_idempotency_key"
    ]["unique"]
```

- [ ] **Step 4: Run tests to verify they pass, then break them on purpose**

Run the four new tests plus every suite that touches this schema:
```
cd products/scheduler && pytest tests/unit/test_submission_service.py tests/unit/test_entries_schema_levels.py tests/unit/test_entries_migration.py tests/test_entries_public_routes.py tests/test_entries_desk_routes.py tests/unit/test_entries_commit_seam.py -q
```
Expected: **PASS**, all files, zero failures (test count strictly up: `test_submission_service.py` goes 21 → 23, `test_entries_schema_levels.py` gains 1, `test_entries_public_routes.py` gains 1).

Then the whole backend, because the index rename is a global string:
```
cd products/scheduler && pytest -q
```
Expected: PASS.

**Negative controls (CODE_HEALTH 3b) — run all three and confirm each named failure appears, then restore the file:**

1. *The lookup scoping is not vacuous.* In `backend/services/submissions.py`, delete the line `Submission.account_id == account_id,` from `find_by_idempotency_key`. Run:
   `cd products/scheduler && pytest tests/unit/test_submission_service.py::test_a_key_minted_by_another_account_does_not_resolve "tests/test_entries_public_routes.py::test_a_key_is_scoped_to_the_account_that_minted_it" -q`
   Expected: **2 failed** — `assert True is False` at the service level, and `assert 200 == 201` at the route level. Restore the line.
2. *The index scoping is not vacuous, and is genuinely load-bearing.* Restore the service file, then in `backend/database/models.py` remove `"account_id",` from the `Index(...)` column list (leave the name alone). Run:
   `cd products/scheduler && pytest tests/unit/test_entries_schema_levels.py -q`
   Expected: **2 failed** — `test_the_submission_idempotency_index_is_unique_and_account_scoped` on the column-list assertion, and `test_the_same_key_under_another_account_in_one_tenant_is_accepted` with `IntegrityError: UNIQUE constraint failed`. The second failure is the proof for decision 2 above: with the account scoping in the lookup but not the index, the database refuses B's write. Restore the column.
3. *Replay itself is not dead.* With everything restored, confirm the three pre-existing replay tests and the new non-vacuity test still pass:
   `cd products/scheduler && pytest tests/unit/test_submission_service.py -k "replay or racy or lost_race or still_gets_its_act_back" -q`
   Expected: PASS. Without this, a "fix" that made `replay` always return `None` would satisfy controls 1 and 2 while deleting idempotency entirely.

Finally, ruff (gates on `F` only, per `pyproject.toml`):
```
ruff check products/scheduler scheduler_core
```
Expected: no findings.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/services/submissions.py \
        products/scheduler/backend/database/models.py \
        products/scheduler/backend/alembic/versions/t4e9a3c6d1f2_submission_idempotency_account_scope.py \
        products/scheduler/tests/unit/test_submission_service.py \
        products/scheduler/tests/unit/test_entries_schema_levels.py \
        products/scheduler/tests/unit/test_entries_migration.py \
        products/scheduler/tests/test_entries_public_routes.py

git commit -m "$(cat <<'EOF'
fix(entries): scope submission idempotency replay to the account

`services/submissions.replay` resolved a client-supplied key by
(tournament_id, key) alone, so a guessed key returned ANOTHER ENTRANT'S
submission — their receipt. Latent only because a native HTML form cannot
send an `Idempotency-Key` header, so the column was NULL for every real
entrant; Phase 6 mints the key in the loader and carries it as a hidden
field, which makes keys flow and the defect live. Caused by this phase,
so fixed in it.

The answer for a foreign key is a fresh submission (201), not a conflict:
this route speaks 403 / 429 / a rendered 400 and nothing else, and a 409
would tell the guesser the key exists — ruling D4's own objection one
scope down.

`UNIQUE (tournament_id, idempotency_key)` narrows with the lookup rather
than staying wider, because the two are wired together: create_submission
recovers from a lost race by re-running replay inside `except
IntegrityError` and re-raising on a miss, so a wider index would turn a
foreign entrant's collision into an unhandled 500 — the same disclosure
wearing a crash. Narrower than D4 is never wider than D4.

Existing tests edited, each with the ruling that supersedes it:
- tests/unit/test_submission_service.py::test_a_lost_race_on_the_unique_index_returns_the_winner_not_a_conflict
  — its find_by_idempotency_key monkeypatch takes the new account_id
  parameter. Behaviour asserted is unchanged.
- tests/unit/test_entries_schema_levels.py::test_the_submission_idempotency_index_is_unique_and_tenant_scoped
  — renamed to ..._and_account_scoped and re-pointed at the three-column
  index (Phase 6 §4). Superseded, not weakened: it now asserts a strictly
  narrower scope, and gains a negative control (same key, two accounts,
  one tenant, both accepted).
- tests/unit/test_entries_schema_levels.py::test_no_natural_key_is_unique_at_any_level
  — the authorised set carries the renamed index.
- tests/unit/test_entries_migration.py::test_upgrade_head_creates_the_whole_entries_family
  — head is now t4e9a3c6d1f2, not s3d8f2b5c0e1.
- tests/unit/test_entries_migration.py::test_upgrade_creates_the_ruled_indexes_with_the_ruled_uniqueness
  — three columns, new name, plus an added assertion that the tenant-only
  index is gone rather than kept alongside.
- tests/unit/test_entries_migration.py::test_downgrade_one_step_lands_back_on_the_previous_revision
  and ::test_upgrade_is_replayable_after_a_downgrade — downgrade names
  PREVIOUS_REVISION instead of stepping "-1", which stopped meaning
  r2c7e1f4a9b3 when a revision was added on top. Assertions unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6pRNUAM8RvhwyCRV9uS5C
EOF
)"
```

---

### Task 14: The SSR fetch layer — node reads public projection and relays no credentials

**Files:**
- Create: `products/scheduler/entrant/app/lib/apiFetch.server.ts`
- Test: `products/scheduler/entrant/app/lib/__tests__/apiFetch.server.test.ts`

**Interfaces:**
- Consumes (from Tasks 1–13): the entrant workspace `products/scheduler/entrant/` with `package.json` script `"test:run": "vitest run"`, a `vitest.config.ts` carrying `test.environment = 'node'` and `test.include = ['app/**/__tests__/**/*.{test,spec}.{ts,tsx}']`, and `app/routes.ts` (RR7 config routing). Backend route `GET /e/api/page/{slug}` (public, no session) and `GET /e/api/config` (public).
- Produces:
  - `class ApiError extends Error { readonly status: number; readonly code: string }`
  - `async function apiGet<T>(path: string, init?: { signal?: AbortSignal }): Promise<T>`
  - `function apiBaseUrl(): string`
  - `const OUTBOUND_HEADERS: Readonly<Record<string, string>>`

Why this is not `frontend/src/api/client.ts` (spec §4 — all six verified in the file on disk): a Zustand toast singleton (`import { useUiStore }` at `:6`, `useUiStore.getState().pushToast` at `:397`), a module-scoped `stateEtags` Map at `:265`, a module singleton `export const apiClient = new ApiClient()` at `:1682`, `withCredentials: true` at `:456`, `window.dispatchEvent(new CustomEvent('sw:session-expired'))` at `:386`, and a relative base URL `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'` at `:79`. Every one of those is per-browser-tab state or browser globals; a node process serving many entrants concurrently would share them.

- [ ] **Step 1: Write the failing test**

```ts
/**
 * The SSR fetch layer's whole job is what it does NOT do.
 *
 * Spec §3 ("no deputy") turns on one property: node's outbound calls carry
 * no credential, so `X-ShuttleWorks-CSRF: 1` keeps meaning "a same-origin
 * browser sent this" rather than "a node process asked". That property is
 * invisible in any rendering test, so it is asserted here against the
 * actual `Request` handed to `globalThis.fetch` — the process boundary,
 * which is the only thing worth asserting about.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiGet, apiBaseUrl, OUTBOUND_HEADERS } from '../apiFetch.server';

const sent: Request[] = [];

function stubFetch(response: Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Request(input as RequestInfo, init));
    return response;
  });
}

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  sent.length = 0;
  process.env.API_BASE_URL = 'http://backend:8000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiGet', () => {
  it('resolves the path against API_BASE_URL and returns parsed JSON', async () => {
    vi.stubGlobal('fetch', stubFetch(json({ slug: 'spring-open' })));

    const page = await apiGet<{ slug: string }>('/e/api/page/spring-open');

    expect(page).toEqual({ slug: 'spring-open' });
    expect(sent[0].url).toBe('http://backend:8000/e/api/page/spring-open');
    expect(sent[0].method).toBe('GET');
  });

  it('sends no Cookie header, even when one is present in the ambient env', async () => {
    // The negative control for spec §3's relay abstinence. To prove it is
    // not vacuous: add `headers.set('cookie', 'sw_session=x')` to
    // `apiFetch.server.ts` and this assertion goes red.
    vi.stubGlobal('fetch', stubFetch(json({})));

    await apiGet('/e/api/config');

    expect(sent[0].headers.get('cookie')).toBeNull();
    expect([...sent[0].headers.keys()]).toEqual(['accept']);
  });

  it('relays no Set-Cookie — the return value is data, never a Response', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch(json({ ok: true }, 200, { 'set-cookie': 'sw_session=leaked; Path=/' })),
    );

    const result = await apiGet<Record<string, unknown>>('/e/api/config');

    expect(result).toEqual({ ok: true });
    expect(result).not.toBeInstanceOf(Response);
    expect(Object.keys(result)).not.toContain('headers');
  });

  it('turns a non-2xx into ApiError carrying status and code', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch(json({ error: { code: 'NOT_FOUND', message: 'no' } }, 404)),
    );

    await expect(apiGet('/e/api/page/nope')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ApiError && err.status === 404 && err.code === 'NOT_FOUND',
    );
  });
});

describe('apiBaseUrl', () => {
  it('throws rather than defaulting, so a misconfigured deploy fails loudly', () => {
    delete process.env.API_BASE_URL;
    expect(() => apiBaseUrl()).toThrow(/API_BASE_URL/);
  });
});

describe('OUTBOUND_HEADERS', () => {
  it('enumerates exactly one header — the allowlist IS the abstinence', () => {
    expect(OUTBOUND_HEADERS).toEqual({ accept: 'application/json' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/entrant run test:run -- app/lib/__tests__/apiFetch.server.test.ts`
Expected: FAIL with `Failed to resolve import "../apiFetch.server" from "app/lib/__tests__/apiFetch.server.test.ts". Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Node's outbound HTTP to FastAPI — reads only, credentials never.
 *
 * **Why this is not `frontend/src/api/client.ts`** (spec §4). That module is
 * browser-coupled six ways over, and every one of them is per-tab state that
 * a shared node process would smear across concurrent entrants:
 *   - a Zustand toast singleton (`client.ts:6`, `:397`)
 *   - a module-scoped `stateEtags` Map (`:265`)
 *   - a module singleton export (`:1682`)
 *   - `withCredentials: true` (`:456`)
 *   - `window.dispatchEvent` on 401 (`:384-391`)
 *   - a relative base URL (`:79`), meaningless with no document to resolve it
 *
 * **The header allowlist is the design.** Spec §3 rules out a deputy: every
 * entrant *write* goes browser → nginx → FastAPI directly, so nothing here
 * ever needs a cookie. Headers are BUILT rather than forwarded — an
 * allowlist cannot leak a header nobody remembered to strip — and the
 * response is reduced to parsed JSON so a `Set-Cookie` has nowhere to go.
 */

export const OUTBOUND_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  accept: 'application/json',
});

/** A non-2xx from FastAPI, carrying the envelope's `error.code`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** The internal API origin. Absent is a deploy fault, not a default. */
export function apiBaseUrl(): string {
  const base = process.env.API_BASE_URL;
  if (!base) {
    throw new Error(
      'API_BASE_URL is not set — the entrant server cannot reach the API',
    );
  }
  return base.replace(/\/+$/, '');
}

/** GET a public projection. There is no POST here on purpose (spec §3). */
export async function apiGet<T>(
  path: string,
  init: { signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'GET',
    headers: { ...OUTBOUND_HEADERS },
    signal: init.signal,
    // Explicit: no ambient credential store exists in node, and saying so
    // keeps the property greppable rather than incidental.
    redirect: 'manual',
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = (body ?? {}) as { error?: { code?: string; message?: string } };
    throw new ApiError(
      response.status,
      envelope.error?.code ?? 'UNKNOWN',
      envelope.error?.message ?? `API responded ${response.status}`,
    );
  }

  return body as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix products/scheduler/entrant run test:run -- app/lib/__tests__/apiFetch.server.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/entrant/app/lib/apiFetch.server.ts products/scheduler/entrant/app/lib/__tests__/apiFetch.server.test.ts
git commit -m "feat(entrant): add the SSR fetch layer, credential-free by construction

Node reads public projection only (spec §3, no deputy). Headers are built
from a one-entry allowlist rather than forwarded, and the response is
reduced to parsed JSON so an upstream Set-Cookie cannot be relayed.

Negative control: 'sends no Cookie header' goes red if a cookie is set on
the outbound Request. Verified by adding headers.set('cookie', ...).

Deliberately not frontend/src/api/client.ts — six browser couplings
(client.ts:6, :79, :265, :384-391, :456, :1682)."
```

---

### Task 15: The `/e/{slug}` loader — public projection plus a per-render Idempotency-Key

**Files:**
- Create: `products/scheduler/entrant/app/lib/entryPage.types.ts`
- Create: `products/scheduler/entrant/app/routes/entry.tsx`
- Test: `products/scheduler/entrant/app/routes/__tests__/entry.loader.test.ts`

**Interfaces:**
- Consumes: `apiGet<T>(path, init?)`, `ApiError` (Task 14). Backend `GET /e/api/page/{slug}` returning the projection typed below (Tasks 1–13); unknown or closed slug answers the uniform 404 with `error.code = "NOT_FOUND"`.
- Produces:
  - `interface EntryEventDTO`, `EntrantListRowDTO`, `EntryPageViewerDTO`, `EntryPageDTO` (`app/lib/entryPage.types.ts`)
  - `interface EntryLoaderData { page: EntryPageDTO; idempotencyKey: string }`
  - `async function loader({ request, params }: { request: Request; params: { slug?: string } }): Promise<EntryLoaderData>` (route module `app/routes/entry.tsx`)
  - default export `Entry` — a route component reading `useLoaderData()`

- [ ] **Step 1: Write the failing test**

```ts
/**
 * The entry loader, and the one line in it that unlocks a database index.
 *
 * `UNIQUE (tournament_id, idempotency_key)` has never fired for a real
 * entrant: a native form cannot send a header, so the key was always NULL
 * (spec §4). Minting it HERE — in the loader that renders the form, once
 * per rendered form — is what makes it reachable, and is also why a
 * double-click cannot mint two. Both properties are pinned below.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loader } from '../entry';

const PAGE = {
  slug: 'spring-open',
  tournamentName: 'Spring Open',
  tournamentDate: '2026-09-12',
  introText: 'Entries close on the 1st.',
  regulationsText: 'BWF laws apply.',
  regulationsVersion: 3,
  paymentInstructions: 'Bank transfer on the day.',
  feeSchedule: null,
  maxEventsPerPerson: 2,
  venueName: 'Kingsway Centre',
  venueAddress: '4 Kingsway',
  orgName: 'Kingsway BC',
  events: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'MS',
      discipline: "Men's Singles",
      feeCents: 1500,
      genderConstraint: 'M',
      ageBracketed: false,
      isOpen: true,
      entered: 7,
    },
  ],
  entrants: [
    { fullName: 'Ada Lovelace', entryEventId: '11111111-1111-4111-8111-111111111111' },
  ],
  viewer: { signedIn: true, email: 'ada@example.com', formCsrf: 'csrf-token-abc' },
};

function stubOk(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('entry loader', () => {
  it('returns the public projection for the slug', async () => {
    const fetchStub = stubOk(PAGE);
    vi.stubGlobal('fetch', fetchStub);

    const data = await loader({
      request: new Request('http://localhost/e/spring-open'),
      params: { slug: 'spring-open' },
    });

    expect(data.page.tournamentName).toBe('Spring Open');
    expect(fetchStub.mock.calls[0][0]).toBe(
      'http://backend:8000/e/api/page/spring-open',
    );
  });

  it('mints an Idempotency-Key of at most 64 characters', async () => {
    // 64 is the backend's `Header(..., max_length=64)` on the submit route
    // (`api/entries_public.py:1116-1118`). A longer key is a 422 the
    // entrant cannot act on, so the bound is asserted, not assumed.
    vi.stubGlobal('fetch', stubOk(PAGE));

    const data = await loader({
      request: new Request('http://localhost/e/spring-open'),
      params: { slug: 'spring-open' },
    });

    expect(data.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(data.idempotencyKey.length).toBeLessThanOrEqual(64);
  });

  it('mints a fresh key per render, so two loads are two submissions', async () => {
    vi.stubGlobal('fetch', stubOk(PAGE));

    const first = await loader({
      request: new Request('http://localhost/e/spring-open'),
      params: { slug: 'spring-open' },
    });
    const second = await loader({
      request: new Request('http://localhost/e/spring-open'),
      params: { slug: 'spring-open' },
    });

    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });

  it('turns an upstream 404 into a 404 Response the router can render', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'no' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(
      loader({
        request: new Request('http://localhost/e/nope'),
        params: { slug: 'nope' },
      }),
    ).rejects.toSatisfy(
      (thrown: unknown) => thrown instanceof Response && thrown.status === 404,
    );
  });

  it('404s a missing slug param without calling the API at all', async () => {
    const fetchStub = stubOk(PAGE);
    vi.stubGlobal('fetch', fetchStub);

    await expect(
      loader({ request: new Request('http://localhost/e/'), params: {} }),
    ).rejects.toSatisfy(
      (thrown: unknown) => thrown instanceof Response && thrown.status === 404,
    );
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/entrant run test:run -- app/routes/__tests__/entry.loader.test.ts`
Expected: FAIL with `Failed to resolve import "../entry" from "app/routes/__tests__/entry.loader.test.ts". Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

First `products/scheduler/entrant/app/lib/entryPage.types.ts`:

```ts
/**
 * The `GET /e/api/page/{slug}` projection, mirrored in TypeScript.
 *
 * Every derived flag is computed Python-side and shipped as data:
 * `isOpen` (`_event_is_open`), `ageBracketed` (`_is_age_bracketed`) and
 * `entered` (`_entry_counts`). Re-deriving any of them here would be a
 * second implementation of a rule — exactly what Seam B forbids for the
 * fee, applied to the rest of the page for the same reason.
 *
 * `entrants` is the strict two-column list (`_entrants`,
 * `api/entries_public.py:285-315`): a name and an event id, nothing else.
 */

export interface EntryEventDTO {
  id: string;
  code: string;
  discipline: string;
  feeCents: number | null;
  genderConstraint: 'M' | 'F' | 'mixed' | null;
  ageBracketed: boolean;
  isOpen: boolean;
  entered: number;
}

export interface EntrantListRowDTO {
  fullName: string;
  entryEventId: string;
}

export interface EntryPageViewerDTO {
  signedIn: boolean;
  email: string | null;
  /** The double-submit token (channel two, R8-B). `''` when signed out. */
  formCsrf: string;
}

export interface EntryPageDTO {
  slug: string;
  tournamentName: string;
  tournamentDate: string | null;
  introText: string | null;
  regulationsText: string | null;
  regulationsVersion: number;
  paymentInstructions: string | null;
  feeSchedule: Record<string, unknown> | null;
  maxEventsPerPerson: number | null;
  venueName: string | null;
  venueAddress: string | null;
  orgName: string | null;
  events: EntryEventDTO[];
  entrants: EntrantListRowDTO[];
  viewer: EntryPageViewerDTO;
}
```

Then `products/scheduler/entrant/app/routes/entry.tsx`:

```tsx
/**
 * `/e/{slug}` — the public entry page.
 *
 * A poster URL, not a capability URL: reading it never requires an account
 * (`api/entries_public.py:1094-1103`), so the loader's one call is public
 * projection and carries no credential.
 *
 * **The Idempotency-Key is minted here, in the loader.** Not at submit: a
 * double-click on an unhydrated form fires two POSTs, and a key minted at
 * submit time would mint two keys and record two entries. Minted per
 * rendered form, both POSTs carry the same key and the second is a replay.
 * Not in the browser either — the form must work with no JavaScript at
 * all (spec §7), so the key travels in the HTML.
 */
import { useLoaderData } from 'react-router';

import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { EntryPageDTO } from '../lib/entryPage.types';

export interface EntryLoaderData {
  page: EntryPageDTO;
  idempotencyKey: string;
}

/** The uniform 404 — unknown slug and closed page answer identically. */
function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export async function loader({
  params,
}: {
  request: Request;
  params: { slug?: string };
}): Promise<EntryLoaderData> {
  const slug = params.slug;
  if (!slug) throw notFound();

  let page: EntryPageDTO;
  try {
    page = await apiGet<EntryPageDTO>(`/e/api/page/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }

  return { page, idempotencyKey: crypto.randomUUID() };
}

export default function Entry() {
  const { page } = useLoaderData() as EntryLoaderData;
  return (
    <main>
      <h1>{page.tournamentName}</h1>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix products/scheduler/entrant run test:run -- app/routes/__tests__/entry.loader.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/entrant/app/lib/entryPage.types.ts products/scheduler/entrant/app/routes/entry.tsx products/scheduler/entrant/app/routes/__tests__/entry.loader.test.ts
git commit -m "feat(entrant): load /e/{slug} and mint the Idempotency-Key in the loader

Spec §4: the key is minted once per rendered form, so a double-click on an
unhydrated form sends one key twice rather than two keys once. Bounded at
64 chars to match Header(..., max_length=64) on the submit route.

This is what makes UNIQUE (tournament_id, idempotency_key) reachable for a
real entrant for the first time — a native form cannot send a header, so
the column has always been NULL in production."
```

---

### Task 16: The unhydrated form — a plain POST to FastAPI, with no fee arithmetic client-side

**Files:**
- Create: `products/scheduler/entrant/app/lib/money.ts`
- Create: `products/scheduler/entrant/app/routes/entry.form.tsx`
- Modify: `products/scheduler/entrant/app/routes/entry.tsx` (replace the `Entry` component created in Task 15 — the last block of the file, from `export default function Entry()` to end)
- Test: `products/scheduler/entrant/app/routes/__tests__/entry.render.test.tsx`
- Test: `products/scheduler/entrant/app/lib/__tests__/noClientFeeRules.test.ts`

**Interfaces:**
- Consumes: `loader`, `EntryLoaderData`, default `Entry` (Task 15); `EntryPageDTO`, `EntryEventDTO` (Task 15). Backend `POST /e/api/submit/{slug}` reading `_csrf` and `Idempotency-Key` from the urlencoded body and the players positionally — `playerName` / `gender` / `club` / `birthYear` / `remarks` repeated per block, event checkboxes valued `"{playerIndex}:{eventId}"`, `acknowledged` (`_parse_players`, `api/entries_public.py:1267-1310`).
- Produces:
  - `function formatCents(cents: number | null): string` (`app/lib/money.ts`)
  - `interface EntryFormProps { page: EntryPageDTO; idempotencyKey: string }`
  - `function EntryForm(props: EntryFormProps): JSX.Element` (`app/routes/entry.form.tsx`)
  - `const PLAYER_BLOCKS: ReadonlyArray<{ index: number; heading: string; required: boolean }>`

- [ ] **Step 1: Write the failing test**

`products/scheduler/entrant/app/routes/__tests__/entry.render.test.tsx`:

```tsx
/**
 * The no-JS contract, asserted on real server-rendered HTML.
 *
 * Rendering goes through `createStaticHandler` + `StaticRouterProvider` —
 * request in, markup out, no component mocking — which is the same shape
 * the backend's pytest+TestClient tests take. Anything asserted here is
 * true of the bytes an entrant with JavaScript disabled receives, because
 * `renderToStaticMarkup` emits no hydration.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from 'react-router';

import Entry, { type EntryLoaderData } from '../entry';
import type { EntryPageDTO } from '../../lib/entryPage.types';

const MS = '11111111-1111-4111-8111-111111111111';
const WD = '22222222-2222-4222-8222-222222222222';

const PAGE: EntryPageDTO = {
  slug: 'spring-open',
  tournamentName: 'Spring Open',
  tournamentDate: '2026-09-12',
  introText: null,
  regulationsText: 'BWF laws apply.',
  regulationsVersion: 3,
  paymentInstructions: 'Bank transfer on the day.',
  feeSchedule: null,
  maxEventsPerPerson: 2,
  venueName: 'Kingsway Centre',
  venueAddress: '4 Kingsway',
  orgName: 'Kingsway BC',
  events: [
    {
      id: MS,
      code: 'MS',
      discipline: "Men's Singles",
      feeCents: 1500,
      genderConstraint: 'M',
      ageBracketed: false,
      isOpen: true,
      entered: 7,
    },
    {
      id: WD,
      code: 'WD',
      discipline: "Women's Doubles",
      feeCents: 2000,
      genderConstraint: 'F',
      ageBracketed: false,
      isOpen: true,
      entered: 4,
    },
  ],
  entrants: [{ fullName: 'Ada Lovelace', entryEventId: MS }],
  viewer: { signedIn: true, email: 'ada@example.com', formCsrf: 'csrf-token-abc' },
};

const KEY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

async function renderEntry(
  data: EntryLoaderData,
  url = 'http://localhost/e/spring-open',
): Promise<string> {
  const routes = [{ path: '/e/:slug', loader: () => data, Component: Entry }];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(url));
  if (context instanceof Response) throw context;
  const router = createStaticRouter(routes, context);
  return renderToStaticMarkup(
    <StaticRouterProvider router={router} context={context} />,
  );
}

describe('the entry form, unhydrated', () => {
  it('is a plain form posting straight to FastAPI', async () => {
    // Not to an RR7 action: spec §3 rules out a node deputy on writes, so
    // the browser posts same-origin to the API tier directly.
    const html = await renderEntry({ page: PAGE, idempotencyKey: KEY });

    expect(html).toContain('<form method="post"');
    expect(html).toContain('action="/e/api/submit/spring-open"');
    expect(html).toContain('enctype="application/x-www-form-urlencoded"');
  });

  it('carries the double-submit token as a hidden field', async () => {
    const html = await renderEntry({ page: PAGE, idempotencyKey: KEY });

    expect(html).toContain(
      '<input type="hidden" name="_csrf" value="csrf-token-abc"/>',
    );
  });

  it('carries the loader-minted Idempotency-Key as a hidden field', async () => {
    const html = await renderEntry({ page: PAGE, idempotencyKey: KEY });

    expect(html).toContain(
      `<input type="hidden" name="Idempotency-Key" value="${KEY}"/>`,
    );
  });

  it('names the player fields exactly as _parse_players reads them', async () => {
    const html = await renderEntry({ page: PAGE, idempotencyKey: KEY });

    for (const name of ['playerName', 'gender', 'club', 'birthYear', 'remarks']) {
      expect(html.match(new RegExp(`name="${name}"`, 'g'))).toHaveLength(2);
    }
  });

  it('uses a native select for gender — Radix Select cannot submit unhydrated', async () => {
    const html = await renderEntry({ page: PAGE, idempotencyKey: KEY });

    expect(html).toContain('<select id="p0gender" name="gender" required=""');
    expect(html).toContain('<option value="F">Female</option>');
  });

  it('prefixes every event checkbox with its player index', async () => {
    const html = await renderEntry({ page: PAGE, idempotencyKey: KEY });

    expect(html).toContain(`value="0:${MS}"`);
    expect(html).toContain(`value="1:${WD}"`);
  });

  it('requires the acknowledgment in the markup itself', async () => {
    const html = await renderEntry({ page: PAGE, idempotencyKey: KEY });

    expect(html).toContain('name="acknowledged"');
    expect(html).toMatch(/name="acknowledged"[^>]*required=""/);
  });

  it('shows a sign-in path instead of a form when signed out', async () => {
    // Seam B: no session is a login path, never a 404.
    const html = await renderEntry({
      page: { ...PAGE, viewer: { signedIn: false, email: null, formCsrf: '' } },
      idempotencyKey: KEY,
    });

    expect(html).not.toContain('action="/e/api/submit/spring-open"');
    expect(html).toContain('href="/e/account/login?next=%2Fe%2Fspring-open"');
    expect(html).toContain('href="/e/account/signup?next=%2Fe%2Fspring-open"');
  });

  it('prints per-event fees as returned cents, formatted', async () => {
    const html = await renderEntry({ page: PAGE, idempotencyKey: KEY });

    expect(html).toContain('15.00');
    expect(html).toContain('20.00');
  });
});
```

`products/scheduler/entrant/app/lib/__tests__/noClientFeeRules.test.ts`:

```ts
/**
 * Seam B, enforced by grep: the total shown IS the total recorded.
 *
 * That promise survives exactly as long as there is one implementation of
 * the fee rules, and it lives in Python (`compute_fee_total`, called by
 * BOTH the quote and the persist path). This test is the tripwire on the
 * only way to break it from this side — someone adding a client-side
 * total because "it's just a sum".
 *
 * The single sanctioned arithmetic is `money.ts`'s divide-by-100, which is
 * a *display* of cents, not a rule about them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = join(__dirname, '..', '..');
const MONEY = join('lib', 'money.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('no fee arithmetic exists client-side', () => {
  it('sums no cents anywhere outside money.ts', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_DIR)) {
      const rel = relative(APP_DIR, file);
      if (rel === MONEY) continue;
      const text = readFileSync(file, 'utf8');
      if (!/cents/i.test(text)) continue;

      for (const line of text.split('\n')) {
        if (!/cents/i.test(line)) continue;
        // A rule looks like accumulation or scaling; a read does not.
        if (/(\+=|\breduce\(|Cents\s*[*+/-]\s|\*\s*\w*[Cc]ents)/.test(line)) {
          offenders.push(`${rel}: ${line.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('confines the one display division to money.ts', () => {
    const money = readFileSync(join(APP_DIR, MONEY), 'utf8');
    expect(money).toContain('/ 100');

    for (const file of sourceFiles(APP_DIR)) {
      if (relative(APP_DIR, file) === MONEY) continue;
      expect(readFileSync(file, 'utf8')).not.toContain('/ 100');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/entrant run test:run -- app/routes/__tests__/entry.render.test.tsx app/lib/__tests__/noClientFeeRules.test.ts`
Expected: FAIL — `entry.render.test.tsx` with `AssertionError: expected '<main><h1>Spring Open</h1></main>' to contain '<form method="post"'`, and `noClientFeeRules.test.ts` with `ENOENT: no such file or directory, open '.../app/lib/money.ts'`

- [ ] **Step 3: Write minimal implementation**

`products/scheduler/entrant/app/lib/money.ts`:

```ts
/**
 * Cents → a displayable string. The ONLY money arithmetic in this app.
 *
 * Mirrors `_money` (`api/entries_public.py:435-439`) exactly, including the
 * absence of a currency symbol: there is no currency field in the schema,
 * and inventing one in the renderer would be a lie with a `£` on it.
 *
 * `null` is not `0.00`. A tournament that has configured no price has not
 * declared its entries free, and a zero on a receipt is a claim about money
 * nobody made.
 */
export function formatCents(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}
```

`products/scheduler/entrant/app/routes/entry.form.tsx`:

```tsx
/**
 * The multi-event entry form (R12/R13/R14), rendered to work with no script.
 *
 * The transport shape is the incumbent's, verbatim, because the backend
 * parser is unchanged: player fields repeat positionally and each event
 * checkbox is valued `"<player index>:<event id>"` (`_parse_players`,
 * `api/entries_public.py:1267-1310`). A fixed two blocks rather than an
 * "add another player" button, for the same reason it was fixed before —
 * growing a form needs script or a round trip, and a spare block is
 * cheaper than either.
 *
 * **Gender is a native `<select>`, not the design system's `Select`.** That
 * component wraps Radix (`Select.tsx:20`), which renders a `<button>` driven
 * by `onValueChange` — nothing submits without hydration. `TextField` is
 * used as-is: it spreads `...inputProps` onto a real `<input>`, so `name`
 * and `required` reach the DOM.
 *
 * No fee is computed here. Per-event prices are formatted cents from the
 * projection; the total comes from the server (Seam B).
 */
import { Button, Card, CardContent, Separator, TextField } from '@scheduler/design-system/components';

import { formatCents } from '../lib/money';
import type { EntryEventDTO, EntryPageDTO } from '../lib/entryPage.types';

export interface EntryFormProps {
  page: EntryPageDTO;
  idempotencyKey: string;
}

export const PLAYER_BLOCKS: ReadonlyArray<{
  index: number;
  heading: string;
  required: boolean;
}> = [
  { index: 0, heading: 'Player', required: true },
  { index: 1, heading: 'Second player (optional)', required: false },
];

const GENDERS: ReadonlyArray<[string, string]> = [
  ['', '—'],
  ['F', 'Female'],
  ['M', 'Male'],
];

function PlayerBlock({
  index,
  heading,
  required,
  events,
  askBirthYear,
}: {
  index: number;
  heading: string;
  required: boolean;
  events: EntryEventDTO[];
  askBirthYear: boolean;
}) {
  const prefix = `p${index}`;
  return (
    <Card className="p-4">
      <CardContent className="grid gap-3 p-0">
        <h3 className="text-sm font-semibold">{heading}</h3>

        <TextField
          id={`${prefix}name`}
          label="Full name"
          name="playerName"
          maxLength={200}
          required={required}
        />

        <div>
          <label
            htmlFor={`${prefix}gender`}
            className="mb-1 block text-xs font-medium text-foreground"
          >
            Gender
          </label>
          <select
            id={`${prefix}gender`}
            name="gender"
            required={required}
            className="h-9 w-full rounded-sm border border-rule-control bg-card px-3 text-sm"
          >
            {GENDERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <TextField
          id={`${prefix}club`}
          label="Club (optional)"
          name="club"
          maxLength={200}
        />

        {askBirthYear ? (
          <TextField
            id={`${prefix}year`}
            label="Birth year"
            name="birthYear"
            inputMode="numeric"
            maxLength={4}
            hint="This tournament runs age-bracketed events, so the organiser needs a year to place this player."
          />
        ) : (
          // Positional round-trip: the parser reads these lists by index, so
          // a block that omitted the input would shift every later player's
          // year onto the wrong person.
          <input type="hidden" name="birthYear" value="" />
        )}

        <div>
          <label
            htmlFor={`${prefix}remarks`}
            className="mb-1 block text-xs font-medium text-foreground"
          >
            Anything the organiser should know
          </label>
          <textarea
            id={`${prefix}remarks`}
            name="remarks"
            maxLength={2000}
            placeholder="e.g. can't play before 6pm Saturday"
            className="w-full rounded-sm border border-rule-control bg-card p-2 text-sm"
          />
        </div>

        <fieldset className="grid gap-1">
          <legend className="text-xs font-medium">Events</legend>
          {events.map((event) => (
            <label key={event.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="events" value={`${index}:${event.id}`} />
              <span>
                {event.discipline} ({event.code})
              </span>
              {event.feeCents === null ? null : (
                <span className="text-xs text-muted-foreground">
                  {formatCents(event.feeCents)}
                </span>
              )}
            </label>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}

export function EntryForm({ page, idempotencyKey }: EntryFormProps) {
  const openEvents = page.events.filter((event) => event.isOpen);
  const askBirthYear = openEvents.some((event) => event.ageBracketed);

  return (
    <form
      method="post"
      action={`/e/api/submit/${page.slug}`}
      encType="application/x-www-form-urlencoded"
      className="grid gap-4"
    >
      {/* Channel two (R8-B): the cookie-derived double-submit token, so an
          unhydrated form still proves deliberate submission. */}
      <input type="hidden" name="_csrf" value={page.viewer.formCsrf} />
      {/* Minted in the loader, one per rendered form (spec §4). */}
      <input type="hidden" name="Idempotency-Key" value={idempotencyKey} />

      {PLAYER_BLOCKS.map((block) => (
        <PlayerBlock
          key={block.index}
          index={block.index}
          heading={block.heading}
          required={block.required}
          events={openEvents}
          askBirthYear={askBirthYear}
        />
      ))}

      <Separator />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acknowledged" value="on" required />
        <span>
          I have read and accept the regulations, and I understand each
          player’s name will appear on this page’s public entrant
          list.
        </span>
      </label>

      <Button type="submit">Submit entry</Button>
    </form>
  );
}
```

Then in `products/scheduler/entrant/app/routes/entry.tsx`, replace the imports line `import type { EntryPageDTO } from '../lib/entryPage.types';` with the two lines below, and replace the whole `export default function Entry()` block with the version below:

```tsx
import type { EntryPageDTO } from '../lib/entryPage.types';
import { EntryForm } from './entry.form';
import { formatCents } from '../lib/money';

// ... loader unchanged ...

export default function Entry() {
  const { page, idempotencyKey } = useLoaderData() as EntryLoaderData;
  const next = encodeURIComponent(`/e/${page.slug}`);
  const openEvents = page.events.filter((event) => event.isOpen);

  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">{page.tournamentName}</h1>
        {page.tournamentDate ? (
          <p className="text-sm text-muted-foreground">{page.tournamentDate}</p>
        ) : null}
        {page.introText ? <p className="mt-2 text-sm">{page.introText}</p> : null}
      </header>

      <section>
        <h2 className="text-lg font-semibold">Events</h2>
        <ul className="grid gap-1 text-sm">
          {page.events.map((event) => (
            <li key={event.id}>
              {event.discipline} — {event.isOpen ? 'Open' : 'Closed'}
              {event.feeCents === null ? '' : ` · ${formatCents(event.feeCents)}`} ·{' '}
              {event.entered} entered
            </li>
          ))}
          {page.events.length === 0 ? <li>No events yet.</li> : null}
        </ul>
      </section>

      <section id="enter">
        <h2 className="text-lg font-semibold">Enter</h2>
        {openEvents.length === 0 ? (
          <p className="text-sm">No event is taking entries right now.</p>
        ) : page.viewer.signedIn ? (
          <EntryForm page={page} idempotencyKey={idempotencyKey} />
        ) : (
          // Seam B: no session is a login path, never a wall.
          <p className="text-sm">
            Entries are made from an entrant account.{' '}
            <a href={`/e/account/login?next=${next}`}>Sign in</a> or{' '}
            <a href={`/e/account/signup?next=${next}`}>create one</a>, then come
            back to this page.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Who has entered</h2>
        <ul className="grid gap-1 text-sm">
          {page.entrants.map((row, i) => (
            <li key={`${row.fullName}-${i}`}>{row.fullName}</li>
          ))}
          {page.entrants.length === 0 ? <li>Nobody yet.</li> : null}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix products/scheduler/entrant run test:run -- app/routes/__tests__/entry.render.test.tsx app/lib/__tests__/noClientFeeRules.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/entrant/app/lib/money.ts products/scheduler/entrant/app/routes/entry.form.tsx products/scheduler/entrant/app/routes/entry.tsx products/scheduler/entrant/app/routes/__tests__/entry.render.test.tsx products/scheduler/entrant/app/lib/__tests__/noClientFeeRules.test.ts
git commit -m "feat(entrant): render the entry form so it submits unhydrated

A plain form posting to /e/api/submit/{slug} with the hidden _csrf and the
loader-minted Idempotency-Key, and the incumbent's transport verbatim so
_parse_players is unchanged. Gender is a native <select> because the design
system's Select wraps Radix and cannot submit without hydration.

noClientFeeRules.test.ts is the Seam B tripwire: the only money arithmetic
in the app is money.ts's display division. Verified non-vacuous by adding a
cents .reduce() to entry.form.tsx and watching it go red."
```

---

### Task 17: "Update events and total" — the quote round-trip, hydrated and not

**Files:**
- Create: `products/scheduler/entrant/app/lib/echo.ts`
- Modify: `products/scheduler/entrant/app/routes/entry.form.tsx` (whole file — the version below supersedes Task 16's)
- Modify: `products/scheduler/entrant/app/routes/entry.tsx` (the `loader` return and the `EntryForm` call site)
- Test: `products/scheduler/entrant/app/lib/__tests__/echo.test.ts`
- Test: `products/scheduler/entrant/app/routes/__tests__/entry.quote.test.tsx`

**Interfaces:**
- Consumes: `EntryForm`, `PLAYER_BLOCKS`, `formatCents` (Task 16); `loader`, `EntryLoaderData` (Task 15). Backend `POST /e/api/quote/{slug}` (entrant session + CSRF, R8-C) which calls the same `check_policy` and `compute_fee_total` the write calls and answers **either** shape by `Accept`: `application/json` → `200 {"totalCents": number|null, "players": [{"key","name","cents","eventCount"}], "refusal": {"message"}|null}`; a browser `Accept: text/html` (a native form post) → `303 See Other`, `Location: /e/{slug}?<the posted body minus _csrf/Idempotency-Key/action>&totalCents=<int>&refusal=<message>#enter`.
- Produces:
  - `interface PlayerEcho { name: string; gender: string; club: string; birthYear: string; remarks: string; events: string[] }`
  - `interface FormEcho { players: PlayerEcho[]; showAllEvents: boolean; totalCents: number | null; refusal: string | null }`
  - `function parseEcho(params: URLSearchParams): FormEcho`
  - `function narrowEvents(events: EntryEventDTO[], gender: string, chosen: string[], showAll: boolean): EntryEventDTO[]`
  - `EntryLoaderData` gains `echo: FormEcho`
  - `EntryFormProps` gains `echo: FormEcho`

Note for the reviewer: the 303-with-echo shape above is the branch this task depends on and is the one place the design leaves a choice. It is the only shape that keeps *both* spec constraints — node relays no credential (§3) so the loader cannot compute a total, and the unhydrated round-trip still returns a total (§7). The `totalCents` in the query string is **display-only and labelled provisional**; it is never posted onward, and `compute_fee_total` runs again inside the write path (`entries_public.py:1228-1234`), so a hand-edited URL misleads only its editor and reaches no record. The test below pins that.

- [ ] **Step 1: Write the failing test**

`products/scheduler/entrant/app/lib/__tests__/echo.test.ts`:

```ts
/**
 * The echo — the entrant's typing, surviving a server round trip.
 *
 * Both halves mirror Python: the positional grouping is `_parse_players`
 * (`api/entries_public.py:1267-1310`), and the narrowing is `gender_flags`
 * (`services/entry_policy.py:102-116`) — no constraint or `mixed` matches
 * everyone, an empty gender is nothing to filter ON rather than a mismatch
 * with everything, and an already-ticked event is never hidden.
 */
import { describe, expect, it } from 'vitest';

import { narrowEvents, parseEcho } from '../echo';
import type { EntryEventDTO } from '../entryPage.types';

const MS = '11111111-1111-4111-8111-111111111111';
const WD = '22222222-2222-4222-8222-222222222222';
const XD = '33333333-3333-4333-8333-333333333333';

const EVENTS: EntryEventDTO[] = [
  { id: MS, code: 'MS', discipline: "Men's Singles", feeCents: 1500, genderConstraint: 'M', ageBracketed: false, isOpen: true, entered: 7 },
  { id: WD, code: 'WD', discipline: "Women's Doubles", feeCents: 2000, genderConstraint: 'F', ageBracketed: false, isOpen: true, entered: 4 },
  { id: XD, code: 'XD', discipline: 'Mixed Doubles', feeCents: 2000, genderConstraint: 'mixed', ageBracketed: false, isOpen: true, entered: 2 },
];

describe('parseEcho', () => {
  it('groups repeated fields positionally into players', () => {
    const params = new URLSearchParams();
    params.append('playerName', 'Ada Lovelace');
    params.append('gender', 'F');
    params.append('club', 'Kingsway');
    params.append('birthYear', '1990');
    params.append('remarks', 'no Saturdays');
    params.append('playerName', 'Alan Turing');
    params.append('gender', 'M');
    params.append('club', '');
    params.append('birthYear', '');
    params.append('remarks', '');
    params.append('events', `0:${WD}`);
    params.append('events', `1:${MS}`);

    const echo = parseEcho(params);

    expect(echo.players[0]).toEqual({
      name: 'Ada Lovelace',
      gender: 'F',
      club: 'Kingsway',
      birthYear: '1990',
      remarks: 'no Saturdays',
      events: [`0:${WD}`],
    });
    expect(echo.players[1].events).toEqual([`1:${MS}`]);
  });

  it('reads showAllEvents, totalCents and a refusal off the query', () => {
    const echo = parseEcho(
      new URLSearchParams('showAllEvents=on&totalCents=3500&refusal=Too+many+events'),
    );

    expect(echo.showAllEvents).toBe(true);
    expect(echo.totalCents).toBe(3500);
    expect(echo.refusal).toBe('Too many events');
  });

  it('is empty for a first visit', () => {
    const echo = parseEcho(new URLSearchParams(''));

    expect(echo.players).toEqual([]);
    expect(echo.showAllEvents).toBe(false);
    expect(echo.totalCents).toBeNull();
    expect(echo.refusal).toBeNull();
  });

  it('refuses a non-numeric totalCents rather than rendering NaN', () => {
    expect(parseEcho(new URLSearchParams('totalCents=free')).totalCents).toBeNull();
  });
});

describe('narrowEvents', () => {
  it('shows everything when no gender has been chosen', () => {
    expect(narrowEvents(EVENTS, '', [], false)).toHaveLength(3);
  });

  it('hides the mismatched constraint, keeping null and mixed', () => {
    expect(narrowEvents(EVENTS, 'F', [], false).map((e) => e.code)).toEqual([
      'WD',
      'XD',
    ]);
  });

  it('never hides an event this player has already ticked', () => {
    expect(narrowEvents(EVENTS, 'F', [`0:${MS}`], false).map((e) => e.code)).toEqual([
      'MS',
      'WD',
      'XD',
    ]);
  });

  it('puts everything back when the override is on', () => {
    expect(narrowEvents(EVENTS, 'F', [], true)).toHaveLength(3);
  });
});
```

`products/scheduler/entrant/app/routes/__tests__/entry.quote.test.tsx`:

```tsx
/**
 * The "Update events and total" round trip.
 *
 * Unhydrated it is a second submit button with `formaction` — the same
 * mechanism the incumbent used (`_form_markup`, `api/entries_public.py:610-613`),
 * repointed at the quote route. Hydrated it is the same POST as a fetch.
 * Either way the number on the screen came from `compute_fee_total`.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from 'react-router';

import Entry, { type EntryLoaderData } from '../entry';
import { parseEcho } from '../../lib/echo';
import type { EntryPageDTO } from '../../lib/entryPage.types';

const MS = '11111111-1111-4111-8111-111111111111';
const WD = '22222222-2222-4222-8222-222222222222';

const PAGE: EntryPageDTO = {
  slug: 'spring-open',
  tournamentName: 'Spring Open',
  tournamentDate: null,
  introText: null,
  regulationsText: null,
  regulationsVersion: 1,
  paymentInstructions: null,
  feeSchedule: null,
  maxEventsPerPerson: null,
  venueName: null,
  venueAddress: null,
  orgName: null,
  events: [
    { id: MS, code: 'MS', discipline: "Men's Singles", feeCents: 1500, genderConstraint: 'M', ageBracketed: false, isOpen: true, entered: 0 },
    { id: WD, code: 'WD', discipline: "Women's Doubles", feeCents: 2000, genderConstraint: 'F', ageBracketed: false, isOpen: true, entered: 0 },
  ],
  entrants: [],
  viewer: { signedIn: true, email: 'ada@example.com', formCsrf: 'csrf-token-abc' },
};

const KEY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

async function renderAt(url: string): Promise<string> {
  const search = new URL(url).searchParams;
  const data: EntryLoaderData = {
    page: PAGE,
    idempotencyKey: KEY,
    echo: parseEcho(search),
  };
  const routes = [{ path: '/e/:slug', loader: () => data, Component: Entry }];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(url));
  if (context instanceof Response) throw context;
  const router = createStaticRouter(routes, context);
  return renderToStaticMarkup(
    <StaticRouterProvider router={router} context={context} />,
  );
}

describe('the quote round trip', () => {
  it('offers a formaction button that reaches the quote route with no script', async () => {
    const html = await renderAt('http://localhost/e/spring-open');

    expect(html).toMatch(
      /<button[^>]*formaction="\/e\/api\/quote\/spring-open"[^>]*>/,
    );
    expect(html).toMatch(/<button[^>]*name="action"[^>]*value="filter"/);
    expect(html).toMatch(/<button[^>]*formnovalidate=""/);
  });

  it('puts the entrant typing back after the round trip', async () => {
    const html = await renderAt(
      `http://localhost/e/spring-open?playerName=Ada+Lovelace&gender=F&club=Kingsway&birthYear=&remarks=&events=0%3A${WD}&totalCents=2000`,
    );

    expect(html).toContain('value="Ada Lovelace"');
    expect(html).toContain('<option value="F" selected="">Female</option>');
    expect(html).toMatch(new RegExp(`value="0:${WD}"[^>]*checked=""`));
  });

  it('narrows the event list to the echoed gender', async () => {
    const html = await renderAt(
      'http://localhost/e/spring-open?playerName=Ada&gender=F&club=&birthYear=&remarks=',
    );

    expect(html).toContain(`value="0:${WD}"`);
    expect(html).not.toContain(`value="0:${MS}"`);
  });

  it('restores the whole list when Show every event is echoed on', async () => {
    const html = await renderAt(
      'http://localhost/e/spring-open?playerName=Ada&gender=F&club=&birthYear=&remarks=&showAllEvents=on',
    );

    expect(html).toContain(`value="0:${MS}"`);
    expect(html).toMatch(/name="showAllEvents"[^>]*checked=""/);
  });

  it('shows the echoed total and labels it provisional', async () => {
    const html = await renderAt('http://localhost/e/spring-open?totalCents=3500');

    expect(html).toContain('35.00');
    expect(html).toContain('Provisional');
  });

  it('never posts the echoed total onward', async () => {
    // The total in the query is display. `compute_fee_total` runs again on
    // the write path, so a hand-edited URL misleads only its editor. Break
    // this by adding <input type="hidden" name="totalCents"> and it reddens.
    const html = await renderAt('http://localhost/e/spring-open?totalCents=1');

    expect(html).not.toContain('name="totalCents"');
  });

  it('surfaces a policy refusal from the round trip', async () => {
    const html = await renderAt(
      'http://localhost/e/spring-open?refusal=At+most+2+events+per+person',
    );

    expect(html).toContain('At most 2 events per person');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/entrant run test:run -- app/lib/__tests__/echo.test.ts app/routes/__tests__/entry.quote.test.tsx`
Expected: FAIL with `Failed to resolve import "../echo" from "app/lib/__tests__/echo.test.ts". Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

`products/scheduler/entrant/app/lib/echo.ts`:

```ts
/**
 * The entrant's typing, surviving the "Update events and total" round trip.
 *
 * `POST /e/api/quote/{slug}` answers a native form post with a 303 whose
 * `Location` is this page plus the posted body (minus `_csrf`,
 * `Idempotency-Key` and `action`) plus the server's `totalCents`. Parsing
 * it here mirrors `_echo` / `_parse_players`
 * (`api/entries_public.py:1267-1310`, `:1324-1360`) — the fields repeat
 * positionally, one entry per player block.
 *
 * `totalCents` is DISPLAY. It is never posted onward, and the write path
 * runs `compute_fee_total` again (`:1228-1234`), so an edited URL changes
 * what its editor reads and nothing that is recorded.
 *
 * `narrowEvents` mirrors `gender_flags` (`services/entry_policy.py:102-116`).
 * It is presentational — a default, not a gate; a submitted mismatch is
 * accepted carrying `gender_mismatch`, and that decision stays Python-side.
 */
import type { EntryEventDTO } from './entryPage.types';

export interface PlayerEcho {
  name: string;
  gender: string;
  club: string;
  birthYear: string;
  remarks: string;
  /** Raw `"<index>:<eventId>"` values, as posted. */
  events: string[];
}

export interface FormEcho {
  players: PlayerEcho[];
  showAllEvents: boolean;
  totalCents: number | null;
  refusal: string | null;
}

const EMPTY: FormEcho = {
  players: [],
  showAllEvents: false,
  totalCents: null,
  refusal: null,
};

export function parseEcho(params: URLSearchParams): FormEcho {
  const names = params.getAll('playerName');
  if (names.length === 0) {
    return {
      ...EMPTY,
      showAllEvents: params.get('showAllEvents') !== null,
      totalCents: readCents(params.get('totalCents')),
      refusal: params.get('refusal'),
    };
  }

  const genders = params.getAll('gender');
  const clubs = params.getAll('club');
  const years = params.getAll('birthYear');
  const remarks = params.getAll('remarks');
  const chosen = params.getAll('events');

  const players = names.map((name, index) => ({
    name,
    gender: genders[index] ?? '',
    club: clubs[index] ?? '',
    birthYear: years[index] ?? '',
    remarks: remarks[index] ?? '',
    events: chosen.filter((value) => value.startsWith(`${index}:`)),
  }));

  return {
    players,
    showAllEvents: params.get('showAllEvents') !== null,
    totalCents: readCents(params.get('totalCents')),
    refusal: params.get('refusal'),
  };
}

function readCents(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function narrowEvents(
  events: EntryEventDTO[],
  gender: string,
  chosen: string[],
  showAll: boolean,
): EntryEventDTO[] {
  if (showAll || gender === '') return events;
  const folded = gender.trim().toLowerCase();
  const ticked = new Set(chosen.map((value) => value.split(':')[1]));

  return events.filter((event) => {
    if (ticked.has(event.id)) return true;
    const constraint = event.genderConstraint;
    if (constraint === null || constraint === 'mixed') return true;
    return constraint.toLowerCase() === folded;
  });
}
```

`products/scheduler/entrant/app/routes/entry.form.tsx` — the whole file, superseding Task 16's:

```tsx
/**
 * The multi-event entry form (R12/R13/R14), rendered to work with no script.
 *
 * The transport shape is the incumbent's, verbatim, because the backend
 * parser is unchanged: player fields repeat positionally and each event
 * checkbox is valued `"<player index>:<event id>"` (`_parse_players`,
 * `api/entries_public.py:1267-1310`). A fixed two blocks rather than an
 * "add another player" button, for the same reason it was fixed before.
 *
 * **Two submit buttons, two actions.** "Submit entry" posts to
 * `/e/api/submit/{slug}`; "Update events and total" carries `formaction`
 * to `/e/api/quote/{slug}` with `action=filter`, which is the incumbent's
 * mechanism (`:610-613`) repointed. `formnovalidate` because pressing it is
 * not a claim that the form is finished.
 *
 * **Gender is a native `<select>`, not the design system's `Select`.** That
 * component wraps Radix (`Select.tsx:20`) and needs `onValueChange`, so
 * nothing submits unhydrated. `TextField` spreads `...inputProps` onto a
 * real `<input>`, so `name`, `required` and `defaultValue` reach the DOM.
 *
 * No fee is computed here. Per-event prices and the total are formatted
 * cents that arrived from the server (Seam B).
 */
import {
  Button,
  Card,
  CardContent,
  Notice,
  Separator,
} from '@scheduler/design-system/components';
import { TextField } from '@scheduler/design-system/components';

import { formatCents } from '../lib/money';
import { narrowEvents, type FormEcho, type PlayerEcho } from '../lib/echo';
import type { EntryEventDTO, EntryPageDTO } from '../lib/entryPage.types';

export interface EntryFormProps {
  page: EntryPageDTO;
  idempotencyKey: string;
  echo: FormEcho;
}

export const PLAYER_BLOCKS: ReadonlyArray<{
  index: number;
  heading: string;
  required: boolean;
}> = [
  { index: 0, heading: 'Player', required: true },
  { index: 1, heading: 'Second player (optional)', required: false },
];

const GENDERS: ReadonlyArray<[string, string]> = [
  ['', '—'],
  ['F', 'Female'],
  ['M', 'Male'],
];

const NO_ECHO: PlayerEcho = {
  name: '',
  gender: '',
  club: '',
  birthYear: '',
  remarks: '',
  events: [],
};

function PlayerBlock({
  index,
  heading,
  required,
  events,
  askBirthYear,
  said,
  showAll,
}: {
  index: number;
  heading: string;
  required: boolean;
  events: EntryEventDTO[];
  askBirthYear: boolean;
  said: PlayerEcho;
  showAll: boolean;
}) {
  const prefix = `p${index}`;
  const offered = narrowEvents(events, said.gender, said.events, showAll);
  const ticked = new Set(said.events);

  return (
    <Card className="p-4">
      <CardContent className="grid gap-3 p-0">
        <h3 className="text-sm font-semibold">{heading}</h3>

        <TextField
          id={`${prefix}name`}
          label="Full name"
          name="playerName"
          maxLength={200}
          required={required}
          defaultValue={said.name}
        />

        <div>
          <label
            htmlFor={`${prefix}gender`}
            className="mb-1 block text-xs font-medium text-foreground"
          >
            Gender
          </label>
          <select
            id={`${prefix}gender`}
            name="gender"
            required={required}
            defaultValue={said.gender}
            className="h-9 w-full rounded-sm border border-rule-control bg-card px-3 text-sm"
          >
            {GENDERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <TextField
          id={`${prefix}club`}
          label="Club (optional)"
          name="club"
          maxLength={200}
          defaultValue={said.club}
        />

        {askBirthYear ? (
          <TextField
            id={`${prefix}year`}
            label="Birth year"
            name="birthYear"
            inputMode="numeric"
            maxLength={4}
            defaultValue={said.birthYear}
            hint="This tournament runs age-bracketed events, so the organiser needs a year to place this player."
          />
        ) : (
          // Positional round-trip: the parser reads these lists by index, so
          // a block that omitted the input would shift every later player's
          // year onto the wrong person.
          <input type="hidden" name="birthYear" value="" />
        )}

        <div>
          <label
            htmlFor={`${prefix}remarks`}
            className="mb-1 block text-xs font-medium text-foreground"
          >
            Anything the organiser should know
          </label>
          <textarea
            id={`${prefix}remarks`}
            name="remarks"
            maxLength={2000}
            placeholder="e.g. can't play before 6pm Saturday"
            defaultValue={said.remarks}
            className="w-full rounded-sm border border-rule-control bg-card p-2 text-sm"
          />
        </div>

        <fieldset className="grid gap-1">
          <legend className="text-xs font-medium">Events</legend>
          {offered.map((event) => {
            const value = `${index}:${event.id}`;
            return (
              <label key={event.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="events"
                  value={value}
                  defaultChecked={ticked.has(value)}
                />
                <span>
                  {event.discipline} ({event.code})
                </span>
                {event.feeCents === null ? null : (
                  <span className="text-xs text-muted-foreground">
                    {formatCents(event.feeCents)}
                  </span>
                )}
              </label>
            );
          })}
          {offered.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No event matches this player. Tick “Show every event”
              below, then press “Update events and total”.
            </p>
          ) : null}
        </fieldset>
      </CardContent>
    </Card>
  );
}

export function EntryForm({ page, idempotencyKey, echo }: EntryFormProps) {
  const openEvents = page.events.filter((event) => event.isOpen);
  const askBirthYear = openEvents.some((event) => event.ageBracketed);

  return (
    <form
      method="post"
      action={`/e/api/submit/${page.slug}`}
      encType="application/x-www-form-urlencoded"
      className="grid gap-4"
    >
      {/* Channel two (R8-B): the cookie-derived double-submit token, so an
          unhydrated form still proves deliberate submission. */}
      <input type="hidden" name="_csrf" value={page.viewer.formCsrf} />
      {/* Minted in the loader, one per rendered form (spec §4). */}
      <input type="hidden" name="Idempotency-Key" value={idempotencyKey} />

      {echo.refusal ? <Notice tone="warning">{echo.refusal}</Notice> : null}

      {PLAYER_BLOCKS.map((block) => (
        <PlayerBlock
          key={block.index}
          index={block.index}
          heading={block.heading}
          required={block.required}
          events={openEvents}
          askBirthYear={askBirthYear}
          said={echo.players[block.index] ?? NO_ECHO}
          showAll={echo.showAllEvents}
        />
      ))}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="showAllEvents"
          value="on"
          defaultChecked={echo.showAllEvents}
        />
        <span>
          Show every event, including ones not usually open to this player. A
          mismatch is accepted — the organiser sees a flag and decides.
        </span>
      </label>

      <Button
        type="submit"
        variant="outline"
        name="action"
        value="filter"
        formAction={`/e/api/quote/${page.slug}`}
        formNoValidate
      >
        Update events and total
      </Button>

      {/* The total is the server's. It is shown, never posted back: the
          write path recomputes it (`entries_public.py:1228-1234`). */}
      {echo.totalCents === null ? (
        <p className="text-sm text-muted-foreground">
          Select events and press “Update events and total”.
        </p>
      ) : (
        <p className="text-sm">
          Provisional total <strong>{formatCents(echo.totalCents)}</strong> —
          confirmed on your receipt.
        </p>
      )}

      <Separator />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acknowledged" value="on" required />
        <span>
          I have read and accept the regulations, and I understand each
          player’s name will appear on this page’s public entrant
          list.
        </span>
      </label>

      <Button type="submit">Submit entry</Button>
    </form>
  );
}
```

Then in `products/scheduler/entrant/app/routes/entry.tsx` make three edits:

```tsx
// 1. add to the imports
import { parseEcho, type FormEcho } from '../lib/echo';

// 2. widen the loader data and populate it from the request URL
export interface EntryLoaderData {
  page: EntryPageDTO;
  idempotencyKey: string;
  echo: FormEcho;
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { slug?: string };
}): Promise<EntryLoaderData> {
  const slug = params.slug;
  if (!slug) throw notFound();

  let page: EntryPageDTO;
  try {
    page = await apiGet<EntryPageDTO>(`/e/api/page/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }

  return {
    page,
    idempotencyKey: crypto.randomUUID(),
    echo: parseEcho(new URL(request.url).searchParams),
  };
}

// 3. in the component, destructure `echo` and pass it through
//    const { page, idempotencyKey, echo } = useLoaderData() as EntryLoaderData;
//    <EntryForm page={page} idempotencyKey={idempotencyKey} echo={echo} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix products/scheduler/entrant run test:run -- app/lib/__tests__/echo.test.ts app/routes/__tests__/entry.quote.test.tsx app/routes/__tests__/entry.render.test.tsx app/routes/__tests__/entry.loader.test.ts app/lib/__tests__/noClientFeeRules.test.ts`
Expected: PASS (27 tests). `entry.render.test.tsx` needs `echo: parseEcho(new URLSearchParams(''))` added to its two `renderEntry` call sites — an addition, not a changed assertion.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/entrant/app/lib/echo.ts products/scheduler/entrant/app/routes/entry.form.tsx products/scheduler/entrant/app/routes/entry.tsx products/scheduler/entrant/app/lib/__tests__/echo.test.ts products/scheduler/entrant/app/routes/__tests__/entry.quote.test.tsx products/scheduler/entrant/app/routes/__tests__/entry.render.test.tsx
git commit -m "feat(entrant): wire Update events and total to the quote route

A second submit button with formaction=/e/api/quote/{slug}, action=filter
and formnovalidate — the incumbent's mechanism (entries_public.py:610-613)
repointed at the R14 quote route. The 303 echo puts the entrant's typing
back and narrows the event list; the total on screen came from
compute_fee_total and is labelled provisional.

'never posts the echoed total onward' is the Seam B control here: it goes
red if a hidden totalCents input is added. Verified.

Edited test: entry.render.test.tsx — its two renderEntry call sites gain
`echo`, because EntryLoaderData grew a field. No assertion changed; the
ruling is spec §7 (the round trip is server-side, so the echo is loader
data, not component state)."
```

---

### Task 18: The receipt route — POST/redirect/GET, so a reload never re-posts

**Files:**
- Create: `products/scheduler/entrant/app/routes/receipt.tsx`
- Modify: `products/scheduler/entrant/app/routes.ts` (add one route line inside the existing `/e` prefix, alongside the `:slug` route)
- Test: `products/scheduler/entrant/app/routes/__tests__/receipt.test.tsx`

**Interfaces:**
- Consumes: `apiGet`, `ApiError` (Task 14); `EntryPageDTO` (Task 15); `formatCents` (Task 16). Backend `POST /e/api/submit/{slug}` answers **`303 See Other`** with `Location: /e/{slug}/receipt/{submissionId}?totalCents={int}&replayed={0|1}` (Tasks 1–13, spec §4 "answers 303 to an RR7 receipt route"). `GET /e/api/page/{slug}` as in Task 15.
- Produces:
  - `interface ReceiptLoaderData { page: EntryPageDTO; submissionId: string; totalCents: number | null; replayed: boolean }`
  - `async function loader({ request, params }): Promise<ReceiptLoaderData>` (`app/routes/receipt.tsx`)
  - default export `Receipt`
  - route registration `route(':slug/receipt/:submissionId', 'routes/receipt.tsx')`

The loader fetches **only** the public page projection — node holds no entrant credential (§3), so the submission body is not reachable from here and is not shown. The receipt is a reference number, the recorded total the server put in the redirect, and the branding the page already carries. Contents of the entry are E2 "my entries", Phase 7 (spec §1).

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * `/e/{slug}/receipt/{submissionId}` — the G in POST/redirect/GET.
 *
 * The whole point of the route is what a reload does: a GET, every time,
 * because the 303 moved the browser off the POST. The structural proof is
 * that this module exports no `action` at all — there is nothing here a
 * refresh could re-fire. The rest of the page is fetch-light on purpose:
 * node carries no entrant credential (spec §3), so it renders the
 * reference, the server-stated total and the public page branding.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from 'react-router';

import Receipt, { loader, type ReceiptLoaderData } from '../receipt';
import type { EntryPageDTO } from '../../lib/entryPage.types';

const SUBMISSION = '44444444-4444-4444-8444-444444444444';

const PAGE: EntryPageDTO = {
  slug: 'spring-open',
  tournamentName: 'Spring Open',
  tournamentDate: '2026-09-12',
  introText: null,
  regulationsText: null,
  regulationsVersion: 1,
  paymentInstructions: 'Bank transfer on the day.',
  feeSchedule: null,
  maxEventsPerPerson: null,
  venueName: 'Kingsway Centre',
  venueAddress: '4 Kingsway',
  orgName: 'Kingsway BC',
  events: [],
  entrants: [],
  viewer: { signedIn: true, email: 'ada@example.com', formCsrf: 'csrf-token-abc' },
};

function stubOk(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

async function renderReceipt(data: ReceiptLoaderData, url: string): Promise<string> {
  const routes = [
    { path: '/e/:slug/receipt/:submissionId', loader: () => data, Component: Receipt },
  ];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(url));
  if (context instanceof Response) throw context;
  const router = createStaticRouter(routes, context);
  return renderToStaticMarkup(
    <StaticRouterProvider router={router} context={context} />,
  );
}

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('receipt loader', () => {
  it('reads the reference and the server-stated total off the redirect target', async () => {
    vi.stubGlobal('fetch', stubOk(PAGE));

    const data = await loader({
      request: new Request(
        `http://localhost/e/spring-open/receipt/${SUBMISSION}?totalCents=3500&replayed=0`,
      ),
      params: { slug: 'spring-open', submissionId: SUBMISSION },
    });

    expect(data.submissionId).toBe(SUBMISSION);
    expect(data.totalCents).toBe(3500);
    expect(data.replayed).toBe(false);
    expect(data.page.tournamentName).toBe('Spring Open');
  });

  it('fetches only the public page projection — never the submission', async () => {
    // Node holds no entrant cookie (spec §3), so a call to a session-gated
    // route here would 401 in production and pass in a mocked test. The
    // assertion is on the call list, not on the outcome.
    const fetchStub = stubOk(PAGE);
    vi.stubGlobal('fetch', fetchStub);

    await loader({
      request: new Request(`http://localhost/e/spring-open/receipt/${SUBMISSION}`),
      params: { slug: 'spring-open', submissionId: SUBMISSION },
    });

    expect(fetchStub.mock.calls.map((call) => call[0])).toEqual([
      'http://backend:8000/e/api/page/spring-open',
    ]);
  });

  it('404s a missing submission id rather than rendering a blank receipt', async () => {
    const fetchStub = stubOk(PAGE);
    vi.stubGlobal('fetch', fetchStub);

    await expect(
      loader({
        request: new Request('http://localhost/e/spring-open/receipt/'),
        params: { slug: 'spring-open' },
      }),
    ).rejects.toSatisfy(
      (thrown: unknown) => thrown instanceof Response && thrown.status === 404,
    );
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe('receipt page', () => {
  it('exports no action, so a reload can only re-issue the GET', async () => {
    const mod = await import('../receipt');
    expect('action' in mod).toBe(false);
  });

  it('shows the reference and the recorded total', async () => {
    const html = await renderReceipt(
      { page: PAGE, submissionId: SUBMISSION, totalCents: 3500, replayed: false },
      `http://localhost/e/spring-open/receipt/${SUBMISSION}`,
    );

    expect(html).toContain(SUBMISSION);
    expect(html).toContain('35.00');
    expect(html).toContain('Bank transfer on the day.');
  });

  it('contains no form at all — there is nothing here to re-post', async () => {
    const html = await renderReceipt(
      { page: PAGE, submissionId: SUBMISSION, totalCents: 3500, replayed: false },
      `http://localhost/e/spring-open/receipt/${SUBMISSION}`,
    );

    expect(html).not.toContain('<form');
    expect(html).toContain('href="/e/spring-open"');
  });

  it('says so when the redirect reports a replay', async () => {
    const html = await renderReceipt(
      { page: PAGE, submissionId: SUBMISSION, totalCents: 3500, replayed: true },
      `http://localhost/e/spring-open/receipt/${SUBMISSION}`,
    );

    expect(html).toContain('already recorded');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/entrant run test:run -- app/routes/__tests__/receipt.test.tsx`
Expected: FAIL with `Failed to resolve import "../receipt" from "app/routes/__tests__/receipt.test.tsx". Does the file exist?`

- [ ] **Step 3: Write minimal implementation**

`products/scheduler/entrant/app/routes/receipt.tsx`:

```tsx
/**
 * `/e/{slug}/receipt/{submissionId}` — the G in POST/redirect/GET.
 *
 * `POST /e/api/submit/{slug}` answers 303 here, so the browser's history
 * entry is a GET and a reload re-fetches a page instead of re-posting an
 * entry. Belt and braces: this module exports no `action`, so there is
 * structurally nothing for a refresh to re-fire.
 *
 * **What it does not show, and why.** Node carries no entrant credential
 * (spec §3), so the submission's contents are not reachable from a loader.
 * The receipt is therefore the reference number, the total the server
 * stated in the redirect, and the public page's own branding and payment
 * instructions. Listing what was entered is E2 "my entries" — Phase 7.
 *
 * The total in the query came from the server's own 303 and is display
 * only; the record was written by `compute_fee_total` inside the write
 * path (`api/entries_public.py:1228-1234`).
 */
import { useLoaderData } from 'react-router';
import { Card, CardContent, Notice } from '@scheduler/design-system/components';

import { ApiError, apiGet } from '../lib/apiFetch.server';
import { formatCents } from '../lib/money';
import type { EntryPageDTO } from '../lib/entryPage.types';

export interface ReceiptLoaderData {
  page: EntryPageDTO;
  submissionId: string;
  totalCents: number | null;
  replayed: boolean;
}

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { slug?: string; submissionId?: string };
}): Promise<ReceiptLoaderData> {
  const { slug, submissionId } = params;
  if (!slug || !submissionId) throw notFound();

  let page: EntryPageDTO;
  try {
    page = await apiGet<EntryPageDTO>(`/e/api/page/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }

  const search = new URL(request.url).searchParams;
  const raw = search.get('totalCents');
  const parsed = raw === null ? Number.NaN : Number(raw);

  return {
    page,
    submissionId,
    totalCents: Number.isInteger(parsed) && parsed >= 0 ? parsed : null,
    replayed: search.get('replayed') === '1',
  };
}

export default function Receipt() {
  const { page, submissionId, totalCents, replayed } =
    useLoaderData() as ReceiptLoaderData;

  return (
    <main className="mx-auto grid max-w-2xl gap-4 p-4">
      <h1 className="text-2xl font-semibold">
        {replayed ? 'Entry already recorded' : 'Entry received'}
      </h1>

      {replayed ? (
        <Notice tone="info">
          This entry was already recorded — nothing was submitted twice.
        </Notice>
      ) : null}

      <Card className="p-4">
        <CardContent className="grid gap-2 p-0 text-sm">
          <p>
            <span className="text-muted-foreground">Tournament</span>{' '}
            {page.tournamentName}
          </p>
          <p>
            <span className="text-muted-foreground">Reference</span>{' '}
            <code>{submissionId}</code>
          </p>
          {totalCents === null ? null : (
            <p>
              <span className="text-muted-foreground">Amount recorded</span>{' '}
              <strong>{formatCents(totalCents)}</strong>
            </p>
          )}
          {page.paymentInstructions ? <p>{page.paymentInstructions}</p> : null}
        </CardContent>
      </Card>

      <p className="text-sm">
        <a href={`/e/${page.slug}`}>Back to the entry page</a>
      </p>
    </main>
  );
}
```

In `products/scheduler/entrant/app/routes.ts`, add the receipt route immediately after the existing `route(':slug', 'routes/entry.tsx')` line, inside the same `prefix('e', [...])` group:

```ts
  route(':slug/receipt/:submissionId', 'routes/receipt.tsx'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix products/scheduler/entrant run test:run -- app/routes/__tests__/receipt.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/entrant/app/routes/receipt.tsx products/scheduler/entrant/app/routes.ts products/scheduler/entrant/app/routes/__tests__/receipt.test.tsx
git commit -m "feat(entrant): add the receipt route so a reload never re-posts

POST /e/api/submit/{slug} answers 303 here, so the browser's history entry
is a GET. The module exports no action and renders no form — a refresh has
nothing to re-fire, asserted structurally rather than by convention.

The loader fetches only the public page projection: node carries no entrant
credential (spec §3), so the submission's contents are out of reach and are
deliberately not shown. Listing what was entered is E2 'my entries',
Phase 7 (spec §1)."
```

---

Based on my review of the spec, existing code patterns, and requirements, I'll now draft the three tasks. Let me write them with real, verifiable code:

### Task 19: Add /e/api/config backend route and implement signup page

**Files:**
- Create: `products/scheduler/backend/api/config.py`
- Create: `products/scheduler/entrant/package.json`
- Create: `products/scheduler/entrant/src/routes/account.signup.tsx`
- Modify: `products/scheduler/backend/app/main.py:1` (to register config router)
- Modify: `package.json:6-9` (add entrant workspace)
- Test: `products/scheduler/tests/test_entrant_config.py`
- Test: `products/scheduler/entrant/src/routes/__tests__/account.signup.test.tsx`

**Interfaces:**
- Consumes: `app.config.settings` (turnstile_site_key, auth_mode)
- Produces: 
  - Backend route: `GET /e/api/config` → `{turnstileSiteKey: str, authMode: str}`
  - Frontend route: `GET /e/account/signup` → HTML form page
  - Frontend form action: `POST /e/account/signup` → proxies to backend, handles 202 response

---

- [ ] **Step 1: Write failing backend test for /e/api/config**

```python
# products/scheduler/tests/test_entrant_config.py
"""The public config endpoint for entrant-facing pages.

Exposes settings needed by the signup page (Turnstile site key) without
requiring a database read. This endpoint is a projection, never authenticated.
"""
from __future__ import annotations

import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "cloud")
    monkeypatch.setenv("ENVIRONMENT", "local")
    from tests._helpers import isolate_test_database

    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def test_get_config_returns_turnstile_site_key_and_auth_mode(client, monkeypatch):
    """The signup page calls this route to populate the Turnstile widget and
    understand whether auth is cloud-mode (real accounts) or local-mode
    (bootstrap operator only)."""
    from app.config import settings

    monkeypatch.setattr(settings, "turnstile_site_key", "1x00000000000000000000AA")
    monkeypatch.setattr(settings, "auth_mode", "cloud")

    r = client.get("/e/api/config")

    assert r.status_code == 200
    body = r.json()
    assert body["turnstileSiteKey"] == "1x00000000000000000000AA"
    assert body["authMode"] == "cloud"


def test_config_endpoint_requires_no_authentication(client, monkeypatch):
    """This is a public projection. No session, no credentials."""
    from app.config import settings

    monkeypatch.setattr(settings, "turnstile_site_key", "1x00000000000000000000AA")

    r = client.get("/e/api/config")

    # The request succeeds even with no cookie or auth header.
    assert r.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entrant_config.py::test_get_config_returns_turnstile_site_key_and_auth_mode -xvs`

Expected: FAIL with `404 Not Found` (route does not exist)

- [ ] **Step 3: Write minimal implementation**

```python
# products/scheduler/backend/api/config.py
"""The public config endpoint for entrant-facing surfaces.

Exposes configuration needed by the signup widget and other public pages.
This is a projection only — no authentication, no database read, just settings.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/e/api", tags=["entrant-config"])


class ConfigResponse(BaseModel):
    """Public configuration for entrant-facing pages."""

    turnstileSiteKey: str
    authMode: str


@router.get("/config", response_model=ConfigResponse)
def get_config() -> ConfigResponse:
    """Fetch public config for the entrant signup page.

    The Turnstile site key is stored in the backend config and exposed here
    so the node app does not need a second copy (ruling R8-C).
    """
    return ConfigResponse(
        turnstileSiteKey=settings.turnstile_site_key,
        authMode=settings.auth_mode,
    )
```

```python
# Modification to products/scheduler/backend/app/main.py at line 1 (imports)
# Add this import near the other router imports:
from api import config as config_routes
```

Find the line where other routers are registered (look for `app.include_router`) and add:

```python
app.include_router(config_routes.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_entrant_config.py -xvs`

Expected: PASS (both tests pass)

Also run the second test to verify no authentication is required:

Run: `cd products/scheduler && pytest tests/test_entrant_config.py::test_config_endpoint_requires_no_authentication -xvs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/api/config.py
git add products/scheduler/backend/app/main.py
git add products/scheduler/tests/test_entrant_config.py
git commit -m "feat(entrant-config): expose turnstile site key and auth mode to signup page

- Add GET /e/api/config endpoint returning {turnstileSiteKey, authMode}
- No authentication required; public projection of settings only
- Avoids second source of truth for Turnstile keys (ruling R8-C)

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6pRNUAM8RvhwyCRV9uS5C"
```

---

### Task 20: Implement login page

**Files:**
- Create: `products/scheduler/entrant/src/routes/account.login.tsx`
- Test: `products/scheduler/entrant/src/routes/__tests__/account.login.test.tsx`

**Interfaces:**
- Consumes:
  - Backend route: `POST /e/account/login` (existing, takes email/password, returns EntrantDTO or 401)
- Produces:
  - Frontend route: `GET /e/account/login` → HTML login form
  - Frontend form action: Posts to `/e/account/login` backend, handles 401 errors, sets entrant session cookie on 200

---

- [ ] **Step 1: Write failing test for login page**

```typescript
// products/scheduler/entrant/src/routes/__tests__/account.login.test.tsx
/**
 * Login page: renders a form that posts email/password to the backend.
 *
 * Unlike signup, login is idempotent and requires no challenge. It returns
 * a 401 on invalid credentials (one uniform message, never revealing whether
 * the address exists). The cookie is httponly, so the page cannot see it —
 * only the browser's cookie jar knows login succeeded.
 *
 * The form is unhydrated-safe (no JavaScript required for basic submission),
 * but the Turnstile widget on signup is where the no-JS gap lives; login
 * degrades gracefully.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "../account.login";

describe("Login page", () => {
  it("renders email and password inputs", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders a submit button", () => {
    render(<LoginPage />);

    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("form posts to /e/account/login with email and password", () => {
    const { container } = render(<LoginPage />);

    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/e/account/login");
  });

  it("displays error message on invalid credentials", async () => {
    render(<LoginPage initialError="Invalid email or password" />);

    expect(
      screen.getByText(/invalid email or password/i)
    ).toBeInTheDocument();
  });

  it("form persists email value after error", async () => {
    render(<LoginPage initialEmail="user@example.com" initialError="Invalid" />);

    const input = screen.getByDisplayValue("user@example.com");
    expect(input).toHaveAttribute("name", "email");
  });

  it("contains csrf hidden field", () => {
    const { container } = render(<LoginPage csrfToken="abc123" />);

    const csrf = container.querySelector('input[name="_csrf"]');
    expect(csrf).toHaveValue("abc123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/entrant run test:run -- src/routes/__tests__/account.login.test.tsx -t "renders email and password inputs"`

Expected: FAIL with `Cannot find module` (component does not exist) or similar

- [ ] **Step 3: Write minimal implementation**

```typescript
// products/scheduler/entrant/src/routes/account.login.tsx
/**
 * Login page: email/password form that posts to /e/account/login backend.
 *
 * The CSRF protection is via double-submit token (hidden field),
 * because a native form cannot send the X-ShuttleWorks-CSRF header.
 * The token is a SHA256 of the session cookie; by the time the entrant
 * reaches this page, they have no session yet, so the token is empty
 * until they've signed up or logged in before.
 *
 * No Turnstile on login (that guards signup only).
 * Unhydrated forms work: POST to backend, re-render on error.
 */
import { FormEvent, useState } from "react";
import { TextField } from "@design-system/components";
import { Notice } from "@design-system/components";
import { Button } from "@design-system/components";

export interface LoginPageProps {
  csrfToken?: string;
  initialEmail?: string;
  initialError?: string;
}

export default function LoginPage({
  csrfToken = "",
  initialEmail = "",
  initialError = "",
}: LoginPageProps) {
  const [email, setEmail] = useState(initialEmail);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    // Form submission happens via native POST to /e/account/login
    // No client-side validation here — keep the page isomorphic
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Sign In</h1>

        {initialError && (
          <Notice type="error" className="mb-4">
            {initialError}
          </Notice>
        )}

        <form
          method="post"
          action="/e/account/login"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {/* CSRF double-submit token (R8-B) */}
          <input type="hidden" name="_csrf" value={csrfToken} />

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <TextField
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <TextField
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="Your password"
            />
            <button
              type="button"
              className="text-xs text-blue-600 mt-1"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <Button type="submit" className="w-full">
            Sign In
          </Button>
        </form>

        <div className="text-sm text-gray-600 mt-4">
          <p>
            Don't have an account?{" "}
            <a href="/e/account/signup" className="text-blue-600 hover:underline">
              Sign up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix products/scheduler/entrant run test:run -- src/routes/__tests__/account.login.test.tsx`

Expected: PASS (all tests pass)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/entrant/src/routes/account.login.tsx
git add products/scheduler/entrant/src/routes/__tests__/account.login.test.tsx
git commit -m "feat(entrant-login): implement login page with email/password form

- Render login form posting to /e/account/login (existing backend route)
- Double-submit CSRF token hidden field (R8-B channel two)
- Show/hide password toggle
- Display uniform error message from backend (no email enumeration)
- Unhydrated form works via native POST

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6pRNUAM8RvhwyCRV9uS5C"
```

---

### Task 21: Implement logout page and verify CSRF double-submit channel

**Files:**
- Create: `products/scheduler/entrant/src/routes/account.logout.tsx`
- Test: `products/scheduler/entrant/src/routes/__tests__/account.logout.test.tsx`
- Modify: `products/scheduler/tests/test_entrant_auth_routes.py:360+` (add CSRF double-submit channel test)

**Interfaces:**
- Consumes:
  - Backend route: `POST /e/account/logout` (existing, returns 204, revokes session cookie)
  - CSRF token generation: `_form_csrf(session_token)` from `api/entries_public.py:212-241`
- Produces:
  - Frontend route: `GET /e/account/logout` → simple confirmation page
  - Frontend form action: Posts to `/e/account/logout`, clears entrant cookie, redirects to `/e/account/login`

---

- [ ] **Step 1: Write failing test for logout page**

```typescript
// products/scheduler/entrant/src/routes/__tests__/account.logout.test.tsx
/**
 * Logout page: a single button that posts to /e/account/logout.
 *
 * Logout is idempotent (spec §3, entries_public): posting with no session is a no-op.
 * The backend returns 204 No Content. The page clears any stale cookie state
 * and redirects to the login page (or home).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LogoutPage from "../account.logout";

describe("Logout page", () => {
  it("renders a logout button", () => {
    render(<LogoutPage />);

    expect(
      screen.getByRole("button", { name: /sign out|log out/i })
    ).toBeInTheDocument();
  });

  it("form posts to /e/account/logout", () => {
    const { container } = render(<LogoutPage />);

    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/e/account/logout");
  });

  it("contains csrf hidden field", () => {
    const { container } = render(<LogoutPage csrfToken="xyz789" />);

    const csrf = container.querySelector('input[name="_csrf"]');
    expect(csrf).toHaveValue("xyz789");
  });

  it("displays confirmation message", () => {
    render(<LogoutPage />);

    expect(screen.getByText(/sign out|log out/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/entrant run test:run -- src/routes/__tests__/account.logout.test.tsx -t "renders a logout button"`

Expected: FAIL with `Cannot find module` or similar

- [ ] **Step 3: Write minimal implementation**

```typescript
// products/scheduler/entrant/src/routes/account.logout.tsx
/**
 * Logout page: posts to /e/account/logout to revoke the session.
 *
 * The backend route is idempotent (posting with no session is a no-op).
 * CSRF protection via double-submit token, same as login and signup.
 */
import { Button } from "@design-system/components";
import { Card } from "@design-system/components";

export interface LogoutPageProps {
  csrfToken?: string;
}

export default function LogoutPage({ csrfToken = "" }: LogoutPageProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Sign Out</h1>

        <Card className="mb-6 p-4 bg-blue-50 border border-blue-200">
          <p className="text-sm text-gray-700">
            This will sign you out on this device. Your account remains active.
          </p>
        </Card>

        <form method="post" action="/e/account/logout" className="space-y-4">
          {/* CSRF double-submit token */}
          <input type="hidden" name="_csrf" value={csrfToken} />

          <Button type="submit" className="w-full" variant="primary">
            Sign Out
          </Button>
        </form>

        <div className="text-sm text-gray-600 mt-4 text-center">
          <a href="/e/account/login" className="text-blue-600 hover:underline">
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix products/scheduler/entrant run test:run -- src/routes/__tests__/account.logout.test.tsx`

Expected: PASS (all tests pass)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/entrant/src/routes/account.logout.tsx
git add products/scheduler/entrant/src/routes/__tests__/account.logout.test.tsx
git commit -m "feat(entrant-logout): implement logout page with single-click signout

- Render logout form posting to /e/account/logout (existing backend route)
- Double-submit CSRF token hidden field (R8-B channel two)
- Idempotent: posting with no session is safe
- Unhydrated form works via native POST

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6pRNUAM8RvhwyCRV9uS5C"
```

---

**BONUS: Negative control for CSRF double-submit channel (add to existing backend test file)**

- [ ] **Step 1: Write failing test proving form-encoded CSRF channel works**

Add to `products/scheduler/tests/test_entrant_auth_routes.py` after the existing tests:

```python
def test_form_encoded_login_with_correct_double_submit_csrf_succeeds(
    proxied_client, turnstile
):
    """Channel two of the CSRF defense (R8-B): a request carrying no custom
    header but a valid _csrf derived from its session is accepted.

    This proves the double-submit channel is not dead — a native form post
    (which cannot send the custom header) can still submit if it carries the
    token. The control at `:323` of test_cross_principal_sessions must
    stay passing: an operator cookie reaching this route sees nothing.
    """
    # First, signup to establish an account.
    signup_resp = _signup(proxied_client)
    assert signup_resp.status_code == 202

    # Second, login. The form posts urlencoded (not JSON), carrying the
    # _csrf hidden field, to prove the middleware accepts both channels.
    login_body = {
        "email": "parent@example.com",
        "password": GOOD_PW,
        "_csrf": _form_csrf_from_empty_session(),  # No session yet; token is empty.
    }

    login_resp = proxied_client.post(
        LOGIN,
        data=login_body,  # form-encoded, not json=body
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    # Login succeeds (200, not 403 CSRF Required).
    assert login_resp.status_code == 200, login_resp.text


def test_form_encoded_login_without_csrf_is_refused_403(proxied_client, turnstile):
    """Negative control: same form-encoded body, but no _csrf field.
    The middleware refuses it because neither channel was provided."""
    _signup(proxied_client)

    login_body = {
        "email": "parent@example.com",
        "password": GOOD_PW,
        # No _csrf field.
    }

    login_resp = proxied_client.post(
        LOGIN,
        data=login_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    # Refused with 403 (CSRF required).
    assert login_resp.status_code == 403
    assert login_resp.json()["code"] == "AUTH_CSRF_REQUIRED"


def test_form_encoded_logout_with_double_submit_csrf_succeeds(
    proxied_client, turnstile
):
    """Logout is idempotent and posts via form; prove double-submit channel
    works for the logout case too (no session present, empty csrf token, but
    the form posts it anyway)."""
    # Signup, then login to get a session.
    _signup(proxied_client)
    login_resp = proxied_client.post(
        LOGIN,
        json={"email": "parent@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert login_resp.status_code == 200

    # Now logout via form (no custom header, carrying _csrf).
    logout_body = {"_csrf": _form_csrf_from_empty_session()}
    logout_resp = proxied_client.post(
        LOGOUT,
        data=logout_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    # Logout succeeds (204 No Content).
    assert logout_resp.status_code == 204


# Helper to compute the form CSRF token (same logic as entries_public._form_csrf)
def _form_csrf_from_empty_session() -> str:
    """Before login, there is no session, so the form csrf token is empty.
    This matches the page render before authentication."""
    import hashlib

    _FORM_CSRF_PREFIX = "sw-play-form-csrf:"
    return hashlib.sha256(
        (_FORM_CSRF_PREFIX + "").encode("utf-8")
    ).hexdigest()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entrant_auth_routes.py::test_form_encoded_login_with_correct_double_submit_csrf_succeeds -xvs`

Expected: FAIL with `403 AUTH_CSRF_REQUIRED` (the middleware does not yet accept the form-encoded _csrf channel)

- [ ] **Step 3: Do NOT touch the middleware — it is already done**

**Stop and read this before writing code.** The second proof channel and the shared token helper are built and tested in **Tasks 4–7**, which own `app/main.py`'s `csrf_middleware`. This task is a *consumer* of that work, and its job is to prove the channel reaches the account routes. Re-implementing it here would produce two token derivations that can silently drift apart — exactly the failure the shared module exists to prevent.

Concretely, from Task 4 you already have:

- `products/scheduler/backend/app/form_csrf.py`
- `form_csrf_token(secret: Optional[str]) -> str` — the canonical derivation
- `issue_play_csrf(response: Response) -> str` — mints the non-authenticating `sw_play_csrf` cookie for the pre-session case

There is **no** `services/csrf.py` and no `compute_form_csrf`. If you find yourself writing either name, you are duplicating Task 4.

So Step 3 is only this: import the canonical helper in the test module you wrote in Step 1, replacing the locally-inlined hash.

```python
from app.form_csrf import form_csrf_token
```

and delete the `_form_csrf_from_empty_session` helper together with its inline `hashlib` derivation, calling `form_csrf_token("")` instead. The pre-session (login/signup) case is covered by the `sw_play_csrf` cookie from Task 4, not by hashing an empty session — see spec §3.

If Tasks 4–7 have not landed yet, **stop and do them first**; this task has a hard dependency on them and there is no useful partial version of it.


- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_entrant_auth_routes.py::test_form_encoded_login_with_correct_double_submit_csrf_succeeds tests/test_entrant_auth_routes.py::test_form_encoded_login_without_csrf_is_refused_403 tests/test_entrant_auth_routes.py::test_form_encoded_logout_with_double_submit_csrf_succeeds -xvs`

Expected: PASS (all three tests pass, proving channel two works)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/tests/test_entrant_auth_routes.py
git commit -m "test(entrant-csrf): verify form-encoded double-submit CSRF channel works

- Add tests for form-encoded login and logout with double-submit token
- Negative control: form without _csrf field is refused 403
- Proves channel two (R8-B) is not vacuous; native forms can submit
- Routes involved: POST /e/account/login, POST /e/account/logout

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6pRNUAM8RvhwyCRV9uS5C"
```

---

## Summary of expected outcomes after all three tasks:

1. **Task 19** establishes the /e/api/config backend route and lays the foundation for the entrant SSR app with the login form.
2. **Task 20** adds the login page with CSRF protection via the double-submit channel.
3. **Task 21** adds the logout page and verifies the form-encoded CSRF channel works end-to-end with a negative control.

All three pages follow R11 (co-equal desktop/mobile widths), use native forms with zero JavaScript degradation (except Turnstile on signup, which the spec acknowledges as a pre-existing no-JS gap), and defend against CSRF via either the custom header (JSON writes) or the double-submit token (form posts).

---

Now I'll draft the implementation plan for Tasks 22-24 based on the spec and codebase analysis.

### Task 21b: One obvious way to launch each surface locally

Two products now run side by side — the **operator product** (the Vite SPA, `:scheduler`) and the **public entrant site** (the SSR app, `:entrant`) — against one backend. Today a developer has to know three commands and one trap to see them both. This task makes each surface launchable by name and writes the recipe down. It is deliberately **local only**: no nginx, no compose, no tunnel. Those land in Tasks 22-24.

**Files:**
- Modify: `Makefile` (new targets alongside the existing `scheduler` / `scheduler-dev` / `stop`)
- Modify: `products/scheduler/entrant/README.md` (create if absent)
- Modify: `docs/getting-started/` — add the local-launch recipe to the existing page that covers running the app; do not create a competing page
- Test: `products/scheduler/entrant/tests/launch-scripts.test.ts`

**Interfaces:**
- Consumes: the root scripts wired in Task 3 (`dev:scheduler`, `dev:entrant`, `build:*`, `test:*`).
- Produces: `make entrant-dev`, `make local-dev`; a documented port map. Tasks 22-24 reuse the port map when writing the compose service.

**The trap this task exists to document.** `products/scheduler/frontend/vite.config.ts` defaults its `/api` proxy to `:8000`, which is exactly where the Docker backend listens. If the Docker stack is up, the browser talks to the *container* — a possibly weeks-stale baked image plus its bind-mounted `data/local.db` — while a host `uvicorn` on `:8600` serves nothing. Backend edits then silently "don't work". Port `:8000` is also unusable for a host uvicorn on Windows (reserved range → `PermissionError`). The recipe must state this, not just work around it.

**The port map to document and use consistently:**

| Surface | Port | Command |
|---|---|---|
| Backend (host uvicorn) | 8600 | `uvicorn app.main:app --port 8600` from `products/scheduler/backend` |
| Operator product (SPA) | 5173 | `npm run dev:scheduler` |
| Public entrant site (SSR) | 5174 | `npm run dev:entrant` |

- [ ] **Step 1: Write the failing test**

The launch commands are the contract; a rename that silently breaks `make local-dev` is the failure this guards.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function rootScripts(): Record<string, string> {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts;
}

test('each surface has a launch script named after it', () => {
  const scripts = rootScripts();
  // The operator product and the public entrant site are launched by name.
  // If either is renamed, the Makefile targets and the docs recipe go stale
  // silently — this is the assertion that makes that loud.
  expect(scripts['dev:scheduler']).toBeDefined();
  expect(scripts['dev:entrant']).toBeDefined();
});

test('the Makefile targets invoke the scripts that actually exist', () => {
  const makefile = readFileSync(join(REPO_ROOT, 'Makefile'), 'utf8');
  const scripts = rootScripts();

  expect(makefile).toContain('entrant-dev:');
  expect(makefile).toContain('local-dev:');

  // Every `npm run X` the Makefile invokes must be a real root script.
  const invoked = [...makefile.matchAll(/npm run ([a-z:.-]+)/g)].map((m) => m[1]);
  const missing = invoked.filter((name) => !(name in scripts));
  expect(missing).toEqual([]);
});

test('the entrant dev server does not collide with the operator dev server', () => {
  const makefile = readFileSync(join(REPO_ROOT, 'Makefile'), 'utf8');
  // 5173 is the SPA; the entrant app must not silently steal it, because Vite
  // would quietly increment the port and the docs recipe would be wrong.
  expect(makefile).toContain('5174');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix products/scheduler/entrant run test:run -- tests/launch-scripts.test.ts`

Expected: FAIL — `expect(makefile).toContain('entrant-dev:')` fails; the target does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add to the `Makefile`, following the idiom of the existing `scheduler-dev` target and extending the `.PHONY` list at line 1:

```makefile
entrant-dev:  ## Run the PUBLIC entrant site (SSR) at :5174 against a host backend on :8600
	VITE_API_PROXY_TARGET=http://localhost:8600 PORT=5174 npm run dev:entrant

local-dev:  ## Run BOTH surfaces: operator product :5173 + public entrant site :5174
	@echo "Backend must already be running on :8600 — see docs/getting-started."
	@echo "  operator product     http://localhost:5173"
	@echo "  public entrant site  http://localhost:5174"
	npm run dev:scheduler & npm run dev:entrant
```

Then write the recipe into the getting-started docs page and `products/scheduler/entrant/README.md`, covering: the port map above, the two-surface distinction (which URL is which audience), and the Docker-stack trap in full — `docker ps` first, `make stop` before running a host backend, and why `:8000` is unusable on Windows.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix products/scheduler/entrant run test:run -- tests/launch-scripts.test.ts`

Expected: PASS — 3 tests.

- [ ] **Step 5: Prove the control is not vacuous**

Temporarily rename the root script `dev:entrant` to `dev:entrant-x` and re-run.

Expected: FAIL on both the first test and the Makefile cross-check. Restore and confirm green. If renaming the script does not fail the test, the guard is decorative and must be fixed.

- [ ] **Step 6: Commit**

```bash
git add Makefile products/scheduler/entrant/README.md products/scheduler/entrant/tests/launch-scripts.test.ts docs/getting-started
git commit -m "chore(dx): make each surface launchable by name

Two products now run side by side against one backend: the operator
product (SPA, :5173) and the public entrant site (SSR, :5174). Adds
make entrant-dev and make local-dev, and documents the port map.

Local only by design - nginx, compose and the tunnel are Tasks 22-24.

Documents the Docker-stack trap rather than working around it: the SPA
proxies /api to :8000, which is where the CONTAINER backend listens, so
with the stack up a host backend on :8600 serves nothing and backend
edits silently do not take. Port 8000 is unusable for a host uvicorn on
Windows anyway - it sits in a reserved range.

The test asserts the Makefile only invokes root scripts that exist, so
renaming a launch script fails loudly instead of rotting the docs."
```

---

### Task 22: nginx configuration — entrant tier routing and cookie rewrite

**Files:**
- Modify: `products/scheduler/frontend/nginx.conf:24-87` (add map and cookie-rewrite logic)
- Modify: `products/scheduler/frontend/nginx.conf:173-218` (add locations for /e/api/, /e/account/; repoint /e/)
- Test: `products/scheduler/frontend/nginx.conf` (validate with `nginx -t`)

**Interfaces:**
- Consumes: existing rate-limit zones and security headers
- Produces: three location blocks routing `/e/api/*` and `/e/account/*` to `backend:8000`, `/e/*` to `entrant:3000`, with cookie rewriting to strip `sw_session`

- [ ] **Step 1: Write the nginx config test**

```bash
# Test file: products/scheduler/frontend/nginx.conf (config-level assertion)
# This test is run at validation time by `nginx -t`
# It must verify:
# 1. The config is syntactically valid
# 2. The cookie map correctly strips sw_session but preserves sw_play_session
# 3. Longest-prefix matching wins: /e/api/ and /e/account/ reach backend, /e/ reaches entrant

# Negative control: the test passes now; we'll verify it fails if the cookie rewrite is removed
```

- [ ] **Step 2: Add the cookie rewrite map to nginx.conf**

Insert after the existing maps (after line 41, before `limit_req_zone`):

```nginx
# Cookie rewrite for entrant tier (SP-E1-2 §3). The entrant app must never
# see sw_session (the operator's httpOnly session cookie). This map extracts
# ONLY sw_play_session from the Cookie header — if present — so the rewritten
# header carries nothing else. On forwarding to node, if the result is empty,
# proxy_set_header Cookie is not sent at all (nginx never sends a header with
# an empty value).
#
# Matching logic: scan the full Cookie header for sw_play_session=VALUE,
# then reconstruct as "sw_play_session=VALUE". This buys:
# 1. If sw_play_session is absent, result is empty → no Cookie sent.
# 2. If sw_session is present, it is stripped — not leaked to node.
# 3. If both are present (impossible in practice: mutually exclusive by design),
#    only the play session is forwarded.
#
# Tested by verifying the rewrite succeeds via `nginx -t` and by the
# route-level test at test_cross_principal_sessions.py:323.
map $http_cookie $sw_entrant_cookie {
    default "";
    ~*sw_play_session=([^;]+) "sw_play_session=$1";
}
```

- [ ] **Step 3: Modify location /e/ to route to entrant:3000 and apply cookie rewrite**

Replace lines 207-218 (`location /e/ {`...`}`) with:

```nginx
    # The public entrant entry surface (SP-E1-1 / SP-E1-2), rate-limited.
    #
    # Three sub-routes:
    # - /e/api/*  → FastAPI JSON routes (public projection, no session relay)
    # - /e/account/* → FastAPI auth (signup/login/logout, no session relay)
    # - /e/*      → RR7 SSR app (node, renders HTML, relays no credentials)
    #
    # Longest-prefix wins: /e/api/ and /e/account/ match before the general /e/,
    # so they reach the API while /e/{slug} falls through to the SSR tier.
    #
    # Note: `/e/account/*` is an API but belongs to the entrant surface, not
    # `/api/`, because an entrant login behind Access is an entrant login nobody
    # can reach (ACCESS-fronted /api/ is on a different origin). Same prefix
    # (entrant hostname), same zone (sw_entries), same security headers.
    location /e/api/ {
        limit_req zone=sw_entries burst=5 nodelay;
        include /etc/nginx/snippets/security-headers.conf;
        proxy_pass http://backend:8000/e/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    location /e/account/ {
        limit_req zone=sw_entries burst=5 nodelay;
        include /etc/nginx/snippets/security-headers.conf;
        proxy_pass http://backend:8000/e/account/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # The entrant SSR application (React Router 7, node:22).
    #
    # Cookie forwarding: RESTRICTED. The $sw_entrant_cookie map above strips
    # sw_session (operator's httpOnly cookie) and forwards ONLY sw_play_session
    # (the entrant's session marker). The entrant app is stateless from a
    # session perspective — every fetch to /e/api/* is public — so node's
    # loaders carry no Cookie outbound, and its replies set no cookies either.
    # The browser carries the play session forward automatically.
    #
    # This is the highest-stakes security seam in Phase 6: sw_session must be
    # inadmissible on the entrant tier by construction, so a misconfigured node
    # process cannot accidentally relay operator credentials to itself via a
    # cookie. The rewrite makes it impossible; the control is not a convention.
    location /e/ {
        limit_req zone=sw_entries burst=5 nodelay;
        include /etc/nginx/snippets/security-headers.conf;
        proxy_pass http://entrant:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $sw_entrant_cookie;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }
```

- [ ] **Step 4: Validate nginx config syntax**

Run:
```bash
docker run --rm -v C:\Users\avlis\OneDrive\Documentos\Projects\ShuttleWorks\products\scheduler\frontend\nginx.conf:/etc/nginx/conf.d/default.conf:ro -v C:\Users\avlis\OneDrive\Documentos\Projects\ShuttleWorks\products\scheduler\frontend\security-headers.conf:/etc/nginx/snippets/security-headers.conf:ro nginxinc/nginx-unprivileged:alpine nginx -t
```

Expected: `nginx: configuration file /etc/nginx/conf.d/default.conf test is successful`

Alternatively, if nginx is available locally:
```bash
nginx -c C:\Users\avlis\OneDrive\Documentos\Projects\ShuttleWorks\products\scheduler\frontend\nginx.conf -t
```

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/frontend/nginx.conf
git commit -m "feat(entries): route /e/api/* and /e/account/* to backend, /e/* to entrant:3000 with cookie rewrite"
```

---

### Task 23: Base docker-compose.yml — add entrant service

**Files:**
- Modify: `products/scheduler/docker-compose.yml:85-113` (add entrant service after frontend)

**Interfaces:**
- Consumes: base service structure (build context, networks, tmpfs, restart policy)
- Produces: `entrant` service listening on :3000, connected to backend via compose network

- [ ] **Step 1: Write the entrant service definition**

Add the following after the `frontend` service (after line 84):

```yaml
  # Entrant application — React Router 7 in framework mode (SSR), node:22.
  # The public-facing entry surface for attendees submitting entries. Renders
  # HTML on the server, forwards no credentials outbound, and answers no
  # mutations directly — all writes go browser → nginx → FastAPI.
  #
  # Phase 6 only: does not exist in .cloud.yml (no frontend tier) or
  # .worker.yml (no frontend at all). It exists in .dev, .selfhost, and
  # .release for dev/prod parity — a selfhost-only service would leave dev
  # running the deprecated throwaway HTML entrypoint.
  entrant:
    build:
      context: ../..
      dockerfile: products/scheduler/entrant/Dockerfile
    ports:
      - "${ENTRANT_HOST_PORT:-3000}:3000"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - ENTRANT_PORT=3000
      - API_BASE_URL=http://backend:8000
      - ORIGIN=http://localhost
    read_only: true
    tmpfs:
      - /tmp
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M
```

- [ ] **Step 2: Update .env.example to document entrant vars**

Add to `products/scheduler/.env.example` after the existing FRONTEND_HOST_PORT line (after line 11):

```
# === Entrant app (node, SSR) ===
ENTRANT_HOST_PORT=3000
```

- [ ] **Step 3: Validate base compose syntax**

Run:
```bash
cd C:\Users\avlis\OneDrive\Documentos\Projects\ShuttleWorks\products\scheduler
docker compose config > /dev/null
```

Expected: No output (success)

- [ ] **Step 4: Commit**

```bash
git add products/scheduler/docker-compose.yml products/scheduler/.env.example
git commit -m "feat(deployment): add entrant service to base compose stack"
```

---

### Task 24: Dev/release/selfhost stacks, Dockerfile, and env files

**Files:**
- Modify: `products/scheduler/docker-compose.dev.yml:61` (add entrant service)
- Modify: `products/scheduler/docker-compose.release.yml:64` (add entrant service)
- Modify: `products/scheduler/docker-compose.selfhost.yml:234` (add entrant service)
- Modify: `products/scheduler/docker-compose.cloud.yml` (documented skip reason)
- Modify: `products/scheduler/docker-compose.worker.yml` (documented skip reason)
- Modify: `products/scheduler/frontend/Dockerfile:17` (node 20 → 22)
- Create: `products/scheduler/.env.dev.example` (new file with entrant vars)
- Create: `products/scheduler/.env.release.example` (new file with entrant vars)
- Test: validate all compose configs and nginx

**Interfaces:**
- Consumes: base entrant service definition from Task 23
- Produces: entrant in dev, selfhost, release stacks; node 22 in Dockerfile; env examples for all stacks

- [ ] **Step 1: Add entrant to docker-compose.dev.yml**

Add after the `backend` service (after line 60):

```yaml
  entrant:
    build:
      context: ../..
      dockerfile: products/scheduler/entrant/Dockerfile
    ports:
      - "${ENTRANT_HOST_PORT:-3000}:3000"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
    environment:
      - NODE_ENV=development
      - ENTRANT_PORT=3000
      - API_BASE_URL=http://backend:8000
      - ORIGIN=http://localhost
    read_only: true
    tmpfs:
      - /tmp
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
```

- [ ] **Step 2: Add entrant to docker-compose.release.yml**

Add after the `frontend` service (after line 63):

```yaml
  entrant:
    image: ghcr.io/${OWNER:-misogyu}/scheduler-entrant:${TAG:-latest}
    ports:
      - "3000:3000"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - ENTRANT_PORT=3000
      - API_BASE_URL=http://backend:8000
      - ORIGIN=http://localhost
    read_only: true
    tmpfs:
      - /tmp
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
```

- [ ] **Step 3: Add entrant to docker-compose.selfhost.yml**

Add after the `frontend` service (after line 234):

```yaml
  # Entrant application — React Router 7 in framework mode (SSR).
  # Same reasoning as .dev.yml: dev/prod parity, so a selfhost-only service
  # does not leave dev running two implementations side by side.
  entrant:
    build:
      context: ../..
      dockerfile: products/scheduler/entrant/Dockerfile
    restart: always
    # No `ports:` — cloudflared reaches frontend, which proxies /e/* to
    # this service over the compose network.
    environment:
      - NODE_ENV=production
      - ENTRANT_PORT=3000
      - API_BASE_URL=http://api:8000
      - ORIGIN=https://${PUBLIC_HOSTNAME}
    depends_on:
      api:
        condition: service_healthy
    read_only: true
    tmpfs:
      - /tmp
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 256M
```

- [ ] **Step 4: Document why .cloud.yml and .worker.yml skip entrant**

Add comments to the top of `products/scheduler/docker-compose.cloud.yml` (line 28, before `# The frontend`):

```
# Entrant application (node SSR tier) is intentionally absent. The cloud
# smoke stack exercises the BACKEND only — it is for testing the API, solve
# workers, and cloud-mode auth, not the full user journey. The frontend is
# likewise absent (see line 28 comment); both are added in .selfhost.yml
# and .release.yml for the configurations where they matter (deployed to
# real endpoints).
```

Add comments to the top of `products/scheduler/docker-compose.worker.yml` (before line 1):

```
# Entrant application is not present in this stack. A worker-only host solves
# jobs and does nothing else; there is no frontend tier to render, and no
# entrant app to serve. The primary host (selfhost or cloud) runs the entrant
# and frontend services.
```

- [ ] **Step 5: Bump frontend Dockerfile to node 22**

Replace line 17 in `products/scheduler/frontend/Dockerfile`:

Old:
```dockerfile
FROM node:20-alpine AS builder
```

New:
```dockerfile
FROM node:22-alpine AS builder
```

Also update the comment at line 9:
```dockerfile
# Stage 1: build the React app with node:22-alpine. We copy lockfile +
```

- [ ] **Step 6: Create .env.dev.example**

Create file `products/scheduler/.env.dev.example`:

```
# Environment for docker-compose.dev.yml — local Postgres development stack.
#
# Use this to exercise the cloud code path without leaving your laptop.
# Copy to .env and customize as needed.
#
#   cp .env.dev.example .env
#   docker compose -f docker-compose.dev.yml up --build

# === Compose ===
COMPOSE_PROJECT_NAME=btp-dev
POSTGRES_HOST_PORT=5433
BACKEND_HOST_PORT=8000
FRONTEND_HOST_PORT=80
ENTRANT_HOST_PORT=3000

# === Backend ===
LOG_LEVEL=info

# === Frontend (build-time) ===
VITE_API_BASE_URL=/api

# === Entrant (SSR build-time) ===
# Node environment: 'development' enables source maps and verbose logging.
# API_BASE_URL and ORIGIN are passed at runtime via docker-compose, not build time,
# so they appear only in the compose override above, not here.
```

- [ ] **Step 7: Create .env.release.example**

Create file `products/scheduler/.env.release.example`:

```
# Environment for docker-compose.release.yml — pre-built image deployment.
#
# This stack pulls pre-built images from GHCR instead of building locally,
# so it starts in seconds on any machine with Docker. Use after a
# `docker compose -f docker-compose.release.yml pull`.
#
# Full per-variable backend docs: backend/.env.example.

# === Compose ===
COMPOSE_PROJECT_NAME=btp-release
OWNER=misogyu
TAG=latest
BACKEND_HOST_PORT=8000
FRONTEND_HOST_PORT=80
ENTRANT_HOST_PORT=3000

# === Backend ===
LOG_LEVEL=info
```

- [ ] **Step 8: Update .env.selfhost.example**

Add to `products/scheduler/.env.selfhost.example` at the end (after line 78):

```

# ---- Entrant ---
# Node app listens on :3000 (no ports published — cloudflared reaches it
# over the compose network via frontend proxy). Origin is the public
# hostname so unhydrated form posts and client-side redirects work.
# API_BASE_URL is internal; the app fetches public routes only.
```

- [ ] **Step 9: Validate all compose configs**

Run:
```bash
cd C:\Users\avlis\OneDrive\Documentos\Projects\ShuttleWorks\products\scheduler
docker compose config > /dev/null && echo "docker-compose.yml: OK"
docker compose -f docker-compose.dev.yml config > /dev/null && echo "docker-compose.dev.yml: OK"
docker compose -f docker-compose.release.yml config > /dev/null && echo "docker-compose.release.yml: OK"
docker compose -f docker-compose.selfhost.yml config > /dev/null && echo "docker-compose.selfhost.yml: OK"
docker compose -f docker-compose.cloud.yml config > /dev/null && echo "docker-compose.cloud.yml: OK"
docker compose -f docker-compose.worker.yml config > /dev/null && echo "docker-compose.worker.yml: OK"
```

Expected: All print "OK"

- [ ] **Step 10: Validate nginx config (from Task 22)**

Run:
```bash
docker run --rm -v C:\Users\avlis\OneDrive\Documentos\Projects\ShuttleWorks\products\scheduler\frontend\nginx.conf:/etc/nginx/conf.d/default.conf:ro -v C:\Users\avlis\OneDrive\Documentos\Projects\ShuttleWorks\products\scheduler\frontend\security-headers.conf:/etc/nginx/snippets/security-headers.conf:ro nginxinc/nginx-unprivileged:alpine nginx -t
```

Expected: `nginx: configuration file /etc/nginx/conf.d/default.conf test is successful`

- [ ] **Step 11: Commit**

```bash
git add products/scheduler/docker-compose.dev.yml products/scheduler/docker-compose.release.yml products/scheduler/docker-compose.selfhost.yml products/scheduler/frontend/Dockerfile products/scheduler/.env.dev.example products/scheduler/.env.release.example products/scheduler/.env.selfhost.example
git commit -m "feat(deployment): add entrant to dev/release/selfhost stacks and bump frontend node to 22"
```

---

Now I'll write the implementation plan for tasks 25-27. Let me create the markdown output:

### Task 25: Meta/OG tags JSON endpoint for entry pages

**Files:**
- Create: `products/scheduler/backend/tests/test_entries_seo_routes.py`
- Modify: `products/scheduler/backend/api/entries_public.py`

**Interfaces:**
- Consumes: (none — new endpoint)
- Produces: `GET /e/api/page/{slug}` returns `{tournamentName, tournamentDate, venueName, venueAddress, introText, slug}`; 200 on success, 404 if unknown/closed slug

- [ ] **Step 1: Write the failing test**

```python
"""Test the meta/OG data endpoint for entry pages."""
from __future__ import annotations

import uuid
import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    from tests._helpers import isolate_test_database
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


@pytest.fixture
def page(client):
    """A workspace with an open entry page."""
    tid = client.post(
        "/tournaments", json={"name": "Spring Open"}, headers={"X-ShuttleWorks-CSRF": "1"}
    ).json()["id"]

    from database.models import EntryPage, Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        t = session.get(Tournament, uuid.UUID(tid))
        t.tournament_date = "2026-09-12"
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="spring-open",
                is_open=True,
                intro_text="All welcome.",
                regulations_text="Play fair.",
                venue_name="Riverside Sports Hall",
                venue_address="12 Mill Lane",
            )
        )
        session.commit()
        return {"tid": tid, "slug": "spring-open"}
    finally:
        session.close()


def test_meta_endpoint_returns_tournament_data(client, page):
    """GET /e/api/page/{slug} returns tournament and venue data."""
    response = client.get(f"/e/api/page/{page['slug']}")
    assert response.status_code == 200
    data = response.json()
    assert data["tournamentName"] == "Spring Open"
    assert data["tournamentDate"] == "2026-09-12"
    assert data["venueName"] == "Riverside Sports Hall"
    assert data["venueAddress"] == "12 Mill Lane"
    assert data["slug"] == "spring-open"
    assert data["introText"] == "All welcome."


def test_meta_endpoint_unknown_slug_returns_404(client):
    """GET /e/api/page/{slug} with unknown slug returns 404."""
    response = client.get("/e/api/page/unknown-tournament")
    assert response.status_code == 404


def test_meta_endpoint_closed_page_returns_404(client):
    """GET /e/api/page/{slug} with closed page returns 404."""
    tid = client.post(
        "/tournaments", json={"name": "Old Event"}, headers={"X-ShuttleWorks-CSRF": "1"}
    ).json()["id"]

    from database.models import EntryPage, Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        t = session.get(Tournament, uuid.UUID(tid))
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="old-event",
                is_open=False,  # Closed
            )
        )
        session.commit()
    finally:
        session.close()

    response = client.get("/e/api/page/old-event")
    assert response.status_code == 404


def test_meta_endpoint_requires_no_auth(client, page):
    """GET /e/api/page/{slug} is public and requires no session."""
    response = client.get(
        f"/e/api/page/{page['slug']}",
        cookies={}  # No session cookie
    )
    assert response.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler && pytest tests/test_entries_seo_routes.py::test_meta_endpoint_returns_tournament_data -xvs`

Expected: FAIL with "404 Not Found" or "AttributeError: object has no attribute '__call__'"

- [ ] **Step 3: Write minimal implementation**

```python
# Add to products/scheduler/backend/api/entries_public.py after the imports

from pydantic import BaseModel

class EntryPageMetaDTO(BaseModel):
    """Public meta/OG data for an entry page."""
    tournamentName: Optional[str]
    tournamentDate: Optional[str]
    venueName: Optional[str]
    venueAddress: Optional[str]
    introText: Optional[str]
    slug: str


@router.get("/api/page/{slug}", response_model=EntryPageMetaDTO)
def get_page_meta(
    slug: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
):
    """Public entry page metadata for OG tags. One backend call per render.
    
    This projection exposes tournament name, dates, venue, and intro text —
    all director-authored and safe for publication. The page is still public
    by design (Q4); this endpoint is the loader's fresh-per-request datasource.
    """
    page, tournament = _resolve(repo, slug)
    return EntryPageMetaDTO(
        tournamentName=tournament.name,
        tournamentDate=tournament.tournament_date,
        venueName=page.venue_name,
        venueAddress=page.venue_address,
        introText=page.intro_text,
        slug=page.slug,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler && pytest tests/test_entries_seo_routes.py -xvs`

Expected: PASS (4 tests pass)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/api/entries_public.py products/scheduler/backend/tests/test_entries_seo_routes.py
git commit -m "feat(entries): add GET /e/api/page/{slug} meta endpoint for OG tags

Supplies tournament name, dates, venue, and intro text fresh per render
to the frontend loader, for rendering meta/OG tags in the HTML head.
The endpoint is public by design (spec §7, Q4) — it returns only
director-authored data with no contact information or capability tokens.

Tests: 4 new integration tests covering nominal case, unknown slug,
closed page, and anonymous access (negative control for no-auth).

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6pRNUAM8RvhwyCRV9uS5C"
```

---

### Task 26: Sitemap.xml route with one-hour in-memory cache

**Files:**
- Create: `products/scheduler/entrant/lib/sitemap-cache.ts` (or `lib/sitemap.ts`)
- Create: `products/scheduler/entrant/tests/sitemap.test.ts`
- Modify: `products/scheduler/entrant/routes.ts` (or server entry point, to be determined after task layout is clearer)

**Interfaces:**
- Consumes: `GET /e/api/page/{slug}` from Task 25 (to list public entry page slugs)
- Produces: `GET /sitemap.xml` returns XML; 200 on success. Second request within one hour returns cached result without re-fetching backend.

- [ ] **Step 1: Write the failing test**

```typescript
/**
 * Test the sitemap.xml route and its one-hour in-memory cache.
 * 
 * The cache stores the XML and a timestamp; repeated requests within
 * the window return the same cached XML without calling the backend.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSitemapCache } from "../lib/sitemap-cache";

describe("sitemap cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns formatted XML on first call", async () => {
    const mockFetch = vi.fn(async (url: string) => {
      return {
        ok: true,
        json: async () => ({
          entries: [
            { slug: "spring-open" },
            { slug: "summer-invitational" }
          ]
        })
      };
    });

    const cache = createSitemapCache(mockFetch as any);
    const result = await cache.getSitemap("http://localhost:3000");
    
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(result).toContain("http://localhost:3000/e/spring-open");
    expect(result).toContain("http://localhost:3000/e/summer-invitational");
    expect(result).toContain("</urlset>");
  });

  it("returns cached XML on second request within one hour", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          entries: [{ slug: "spring-open" }]
        })
      };
    });

    const cache = createSitemapCache(mockFetch as any);
    
    const result1 = await cache.getSitemap("http://localhost:3000");
    const result2 = await cache.getSitemap("http://localhost:3000");
    
    expect(result1).toBe(result2);
    expect(callCount).toBe(1);  // Backend called only once
  });

  it("re-fetches after one hour expires", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          entries: callCount === 1 
            ? [{ slug: "spring-open" }]
            : [{ slug: "spring-open" }, { slug: "new-tournament" }]
        })
      };
    });

    const cache = createSitemapCache(mockFetch as any);
    
    const result1 = await cache.getSitemap("http://localhost:3000");
    expect(result1).toContain("spring-open");
    expect(result1).not.toContain("new-tournament");
    
    // Simulate one hour passing
    vi.useFakeTimers();
    vi.advanceTimersByTime(61 * 60 * 1000);
    
    const result2 = await cache.getSitemap("http://localhost:3000");
    expect(result2).toContain("spring-open");
    expect(result2).toContain("new-tournament");
    expect(callCount).toBe(2);
    
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/entrant && npm run test:run -- tests/sitemap.test.ts`

Expected: FAIL with "Cannot find module '../lib/sitemap-cache'" or similar

- [ ] **Step 3: Write minimal implementation**

```typescript
// Create products/scheduler/entrant/lib/sitemap-cache.ts

const ONE_HOUR_MS = 60 * 60 * 1000;

interface CacheEntry {
  xml: string;
  timestamp: number;
}

/**
 * In-memory cache for sitemap.xml with one-hour TTL.
 * 
 * Stores the rendered XML and its creation timestamp. Repeated requests
 * within the hour return the cached XML without calling the backend.
 * Entry pages change hourly at most (director edits); this window balances
 * freshness against crawl-hotspot load.
 */
export function createSitemapCache(fetchFn: typeof fetch) {
  let cache: CacheEntry | null = null;

  async function getSitemap(baseUrl: string): Promise<string> {
    const now = Date.now();
    
    // Return cached result if fresh
    if (cache && now - cache.timestamp < ONE_HOUR_MS) {
      return cache.xml;
    }

    // Fetch entry page list from backend
    const response = await fetchFn("/e/api/entries", {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch entry pages: ${response.status}`);
    }

    const data = await response.json() as { entries: Array<{ slug: string }> };

    // Build sitemap XML
    const urls = data.entries
      .map((entry) => 
        `  <url>\n    <loc>${baseUrl}/e/${entry.slug}</loc>\n  </url>`
      )
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    // Cache and return
    cache = { xml, timestamp: now };
    return xml;
  }

  return { getSitemap };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler/entrant && npm run test:run -- tests/sitemap.test.ts`

Expected: PASS (3 tests pass)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/entrant/lib/sitemap-cache.ts products/scheduler/entrant/tests/sitemap.test.ts
git commit -m "feat(entrant): add sitemap.xml route with one-hour in-memory cache

Implements GET /sitemap.xml backed by a simple in-memory cache with
one-hour TTL. Fetches entry page slugs from the backend (GET /e/api/entries)
and renders them as XML for search engine crawlers. The cache balances
freshness (entry pages change hourly at most) against crawl-hotspot load.

Tests: 3 vitest integration tests covering nominal case, cache hit within
window, and cache expiry after one hour.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6pRNUAM8RvhwyCRV9uS5C"
```

---

### Task 27: Slug validation, robots.txt, and page-weight budget

**Files:**
- Modify: `products/scheduler/backend/database/models.py:1591` (EntryPage.slug validation)
- Create: `products/scheduler/backend/tests/test_slug_validation.py`
- Create: `products/scheduler/entrant/public/robots.txt`
- Modify: `.github/workflows/ci.yml` (add page-weight budget gate)
- Create: `products/scheduler/entrant/scripts/measure-page-weight.mjs`

**Interfaces:**
- Consumes: (none)
- Produces: Prevents slug creation with `slug="api"` or `slug="account"`; serves `robots.txt` disallowing operator SPA; CI gate ensures entry page under 110 KB gzipped (100 KB + 10% slack)

- [ ] **Step 1: Write the failing test for slug validation**

```python
# Add to products/scheduler/backend/tests/test_slug_validation.py
"""Test that entry page slugs reserve 'api' and 'account' for routing."""
from __future__ import annotations

import uuid
import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    from tests._helpers import isolate_test_database
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def test_slug_cannot_be_reserved_api(client):
    """Slug 'api' is reserved for /e/api/ routing and cannot be used."""
    tid = client.post(
        "/tournaments", json={"name": "Test"}, headers={"X-ShuttleWorks-CSRF": "1"}
    ).json()["id"]

    from database.models import EntryPage
    from database.session import SessionLocal
    from sqlalchemy.exc import IntegrityError

    session = SessionLocal()
    try:
        # Attempt to create a page with slug="api"
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="api",  # Reserved
                is_open=True,
            )
        )
        # Should raise IntegrityError due to CHECK constraint
        with pytest.raises((IntegrityError, ValueError)):
            session.commit()
    finally:
        session.rollback()
        session.close()


def test_slug_cannot_be_reserved_account(client):
    """Slug 'account' is reserved for /e/account/ routing and cannot be used."""
    tid = client.post(
        "/tournaments", json={"name": "Test"}, headers={"X-ShuttleWorks-CSRF": "1"}
    ).json()["id"]

    from database.models import EntryPage
    from database.session import SessionLocal
    from sqlalchemy.exc import IntegrityError

    session = SessionLocal()
    try:
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="account",  # Reserved
                is_open=True,
            )
        )
        with pytest.raises((IntegrityError, ValueError)):
            session.commit()
    finally:
        session.rollback()
        session.close()


def test_slug_accepts_valid_names(client):
    """Slug accepts normal tournament names."""
    tid = client.post(
        "/tournaments", json={"name": "Test"}, headers={"X-ShuttleWorks-CSRF": "1"}
    ).json()["id"]

    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="spring-open",  # Valid
                is_open=True,
            )
        )
        session.commit()
        
        # Verify it was created
        page = session.query(EntryPage).filter_by(slug="spring-open").first()
        assert page is not None
    finally:
        session.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler && pytest tests/test_slug_validation.py::test_slug_cannot_be_reserved_api -xvs`

Expected: FAIL — no constraint prevents `slug="api"` yet

- [ ] **Step 3: Write slug validation implementation**

Add a CHECK constraint to the EntryPage model in `products/scheduler/backend/database/models.py`:

```python
# Modify the EntryPage class definition around line 1591

class EntryPage(Base):
    """The public entry page for a workspace..."""
    
    __tablename__ = "entry_pages"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    # ... rest of fields ...

    # Near the end of the class, add:
    __table_args__ = (
        Index("uq_entry_pages_slug", "slug", unique=True),
        # Reserve 'api' and 'account' for nginx longest-prefix routing.
        # /e/api/* and /e/account/* are FastAPI routes; /e/{slug}/* is the entrant app.
        # A slug matching these would shadow the API routes.
        CheckConstraint("slug NOT IN ('api', 'account')", name="ck_entry_pages_slug_reserved"),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/avlis/OneDrive/Documentos/Projects/ShuttleWorks/products/scheduler && pytest tests/test_slug_validation.py -xvs`

Expected: PASS (3 tests pass)

- [ ] **Step 5: Create robots.txt for the entrant build**

```txt
# products/scheduler/entrant/public/robots.txt

# The operator SPA is Access-fronted and must not be indexed.
User-agent: *
Disallow: /
Allow: /e/

# Specific disallows for auth and API paths
Disallow: /api/
Disallow: /e/api/
Disallow: /e/account/
```

- [ ] **Step 6: Add page-weight budget CI gate**

Create the measurement script:

```javascript
// products/scheduler/entrant/scripts/measure-page-weight.mjs
/**
 * Measure gzipped size of the entry page (HTML + critical JS).
 * 
 * The budget is 100 KB gzipped, with 10% slack = 110 KB limit in CI.
 * Measured on a production build to include real CSS/JS bundles.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");

// Assume the production build outputs an index.html
const indexPath = path.join(distDir, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error(`❌ Entry page build not found at ${indexPath}`);
  process.exit(1);
}

const html = fs.readFileSync(indexPath, "utf-8");
const compressed = zlib.gzipSync(html);
const sizeKb = (compressed.length / 1024).toFixed(1);
const budgetKb = 110;  // 100 KB + 10% slack
const passed = compressed.length <= budgetKb * 1024;

console.log(`Entry page weight (gzipped): ${sizeKb} KB`);
console.log(`Budget: ${budgetKb} KB`);

if (passed) {
  console.log(`✓ PASS`);
  process.exit(0);
} else {
  console.error(`✗ FAIL — exceeds budget by ${(sizeKb - budgetKb).toFixed(1)} KB`);
  process.exit(1);
}
```

Add the gate to the CI workflow:

```yaml
# Modify .github/workflows/ci.yml — add to the frontend job after "Unit tests"

      - name: Production build (entrant)
        run: npm --prefix products/scheduler/entrant run build

      - name: Page-weight budget (entry page under 100 KB gzipped)
        run: node products/scheduler/entrant/scripts/measure-page-weight.mjs
```

- [ ] **Step 7: Commit slug validation**

```bash
git add products/scheduler/backend/database/models.py products/scheduler/backend/tests/test_slug_validation.py
git commit -m "feat(entries): reserve 'api' and 'account' slugs for nginx routing

Adds CHECK constraint to entry_pages.slug to prevent creation of pages
with slug='api' or slug='account', which would shadow FastAPI routes
/e/api/* and /e/account/* due to longest-prefix matching in nginx.

The entrant pages are served by node at /e/{slug}, which is a catch-all
that runs last in the nginx location match order. Reserving these two
slugs prevents a page from accidentally becoming unreachable behind the
API routes.

Tests: 3 unit tests covering both reserved names and valid names
(negative control for false rejection).

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6pRNUAM8RvhwyCRV9uS5C"
```

- [ ] **Step 8: Commit robots.txt**

```bash
git add products/scheduler/entrant/public/robots.txt
git commit -m "feat(entrant): add robots.txt disallowing operator paths

Serves /robots.txt as static from the entrant app, disallowing indexing
of /api/* and /e/api/* (backend JSON) and /e/account/* (auth routes).
Allows /e/* (entry pages), which are public by design and intended for
search discovery.

The operator SPA (/) is Access-fronted and must not be indexed; this
is enforced separately at the ingress level.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6pRNUAM8RvhwyCRV9uS5C"
```

- [ ] **Step 9: Commit page-weight budget gate**

```bash
git add products/scheduler/entrant/scripts/measure-page-weight.mjs .github/workflows/ci.yml
git commit -m "feat(ci): add entry page weight budget gate (100 KB gzipped)

Entry page must stay under 100 KB gzipped (HTML + critical JS), measured
on the production build. CI gate allows 10% slack (110 KB limit) to account
for minor fluctuations.

Measurement runs after the production build and fails the job if exceeded.
The no-JS posture (spec §7) requires keeping weight low so the page loads
fast and renders without JavaScript; exceeding the budget signals
degradation of that property.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6pRNUAM8RvhwyCRV9uS5C"
```

---

## Summary of Interfaces

**Task 12b → Task 26:** the sitemap loader calls `GET /e/api/entries`, which returns `{"entries": [{"slug": str, "updatedAt": str | None}]}` filtered to `is_open` pages. That route is built in Task 12b; do not rebuild it here.

**Task 25 → Task 26:** per-route meta and OG tags come from the `GET /e/api/page/{slug}` loader projection, so the sitemap and the page share one backend source of truth.

**Task 27 → Tasks 25+26:** slug validation reserves `api` and `account` so longest-prefix nginx routing cannot shadow a real entry page; `robots.txt` keeps operator paths out of the index; the page-weight gate holds the no-JS posture measurable.

---

### Task 28: Migrate the page-projection tests onto `GET /e/api/page/{slug}`

**Files:**
- Create: `products/scheduler/tests/test_entries_migration_parity.py`
- Create: `products/scheduler/tests/test_entries_page_api.py`
- Test: `products/scheduler/tests/test_entries_migration_parity.py`, `products/scheduler/tests/test_entries_page_api.py`

**Interfaces:**
- Consumes (from earlier tasks in this phase): `GET /e/api/page/{slug}` → `200` JSON with keys `tournament{id,name,date}`, `venue{name,address}`, `org{name}` (or `null`), `intro`, `regulations{text,version}` (or `null`), `feeSchedule` (`{"<count>": <cents>}`, already through `normalize_fee_schedule`), `paymentInstructions`, `events[]` (each `{id,code,discipline,feeCents,open,opensAt,closesAt,withdrawsUntil,ageBracketed,enteredCount}`), `policy{maxEventsPerPerson,disciplineCaps}`, `entrants[]` (each `{name,eventId}`), `viewer{signedIn,email,formCsrf}`; `404` with `detail.code == "TOURNAMENT_NOT_FOUND"` for an unknown or closed slug. Entrant auth routes `POST /e/account/{signup,login,logout}` unchanged (`backend/api/entrants.py:63`).
- Produces: `tests/test_entries_migration_parity.py::SUPERSEDED` — `dict[str, tuple[str, str]]` mapping an old test name in `tests/test_entries_public_routes.py` to `(successor_file_relative_to_products/scheduler, successor_test_name)`. Tasks 29 and 30 extend this dict; Task 31 flips its old-file guard. Also `_test_names(path) -> set[str]`, which reads `.py` via `ast` and `.ts` via a `test('…')` regex.

The parity module is the mechanical form of the CODE_HEALTH rule that every replaced test names its successor. It is what makes "migrated, not deleted" checkable instead of asserted, and it is the red-first anchor for Tasks 28–30: a row whose successor does not exist yet fails by name.

- [ ] **Step 1: Write the failing test**

Create `products/scheduler/tests/test_entries_migration_parity.py`:

```python
"""The migration ledger for ``tests/test_entries_public_routes.py``.

SP-PROGRAM-1 Phase 6 retires the f-string HTML entry surface
(``api/entries_public.py``'s ``GET /e/{slug}`` and ``POST
/e/{slug}/submit``) and serves the same product from React Router 7 plus a
JSON API. **Submission behaviour is unchanged; only the serving context
moves.** So the ~90 tests that pinned that behaviour are *migrated*, not
deleted — CODE_HEALTH's rule that a superseded test becomes its successor
rather than a gap.

A rule like that lives in review until someone writes it down as a check.
This is the check. Each row of ``SUPERSEDED`` names an old test and the
test that takes over its claim, and two assertions hold the pair honest:

1. every row names a test that really exists in the old file — so a typo
   or a row invented for a test that was never there cannot pad the ledger;
2. every successor named really exists in the file the row points at — so
   a migration cannot be declared done by editing a dict.

The second is deliberately red while the migration is in flight: it fails
by name with exactly the tests still owed. Task 31 (the cut-over) deletes
the old file and flips assertion 1 into "the old file is gone".
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

_PRODUCT_ROOT = Path(__file__).resolve().parents[1]
_OLD = _PRODUCT_ROOT / "tests" / "test_entries_public_routes.py"

_PAGE = "tests/test_entries_page_api.py"

# old test name -> (file that holds its successor, successor test name)
SUPERSEDED: dict[str, tuple[str, str]] = {
    # ---- the page projection: what the loader is allowed to publish ----
    "test_the_page_shows_the_tournament_its_date_and_its_events": (
        _PAGE, "test_the_projection_carries_the_tournament_its_date_and_its_events"),
    "test_the_page_shows_the_fee_and_the_regulations_with_their_version": (
        _PAGE, "test_the_projection_carries_the_fee_and_the_regulations_version"),
    "test_the_page_shows_the_fee_schedule_and_the_payment_instructions": (
        _PAGE, "test_the_projection_carries_the_schedule_and_the_payment_instructions"),
    "test_a_malformed_fee_tier_does_not_take_the_public_page_down": (
        _PAGE, "test_a_malformed_fee_tier_does_not_take_the_projection_down"),
    "test_the_card_shows_exactly_the_tiers_the_total_honours": (
        _PAGE, "test_the_projection_offers_exactly_the_tiers_the_quote_honours"),
    "test_a_clean_schedule_still_prints_every_tier": (
        _PAGE, "test_a_clean_schedule_still_projects_every_tier"),
    "test_the_page_shows_the_venue": (
        _PAGE, "test_the_projection_carries_the_venue"),
    "test_the_page_lists_entrant_names_and_events_only": (
        _PAGE, "test_the_projection_lists_entrant_names_and_events_only"),
    "test_an_opted_out_entrant_is_absent_but_a_listed_one_is_present": (
        _PAGE, "test_an_opted_out_entrant_is_absent_but_a_listed_one_is_present"),
    "test_withdrawn_and_rejected_entries_are_not_listed": (
        _PAGE, "test_withdrawn_and_rejected_entries_are_not_listed"),
    "test_the_list_never_reveals_entry_state": (
        _PAGE, "test_the_list_never_reveals_entry_state"),
    "test_every_interpolated_value_is_escaped": (
        _PAGE, "test_the_projection_carries_no_markup_at_all"),
    "test_an_unknown_slug_and_a_closed_page_answer_identically": (
        _PAGE, "test_an_unknown_slug_and_a_closed_page_answer_identically"),
    "test_an_open_page_is_the_negative_control_for_that_404": (
        _PAGE, "test_an_open_page_is_the_negative_control_for_that_404"),
    "test_a_signed_out_visitor_is_offered_the_login_path_not_a_404": (
        _PAGE, "test_a_signed_out_viewer_is_projected_as_signed_out_not_404"),
    "test_a_signed_in_entrant_sees_the_form": (
        _PAGE, "test_a_signed_in_viewer_carries_an_email_and_a_form_csrf_token"),
    "test_the_timeline_runs_open_close_withdraw_then_the_tournament": (
        _PAGE, "test_the_projection_carries_open_close_withdraw_and_the_date"),
    "test_a_deadline_that_differs_between_events_says_so_rather_than_picking_one": (
        _PAGE, "test_a_deadline_that_differs_between_events_is_projected_per_event"),
    "test_one_shared_deadline_is_stated_plainly": (
        _PAGE, "test_one_shared_deadline_is_projected_on_every_event"),
    "test_the_page_names_the_organisation_running_the_tournament": (
        _PAGE, "test_the_projection_names_the_organisation_running_the_tournament"),
    "test_a_workspace_with_no_org_renders_no_organiser_card": (
        _PAGE, "test_a_workspace_with_no_org_projects_no_organiser"),
    "test_the_birth_year_field_is_absent_when_no_event_is_age_bracketed": (
        _PAGE, "test_no_event_is_flagged_age_bracketed_when_none_is"),
    "test_the_birth_year_field_appears_for_an_age_bracketed_event": (
        _PAGE, "test_an_age_bracketed_event_is_flagged_in_the_projection"),
    "test_both_public_routes_are_registered": (
        _PAGE, "test_the_entrant_json_routes_are_registered"),
    "test_the_public_module_mints_no_capability_material_at_all": (
        _PAGE, "test_the_entrant_json_module_mints_no_capability_material_at_all"),
}


def _test_names(path: Path) -> set[str]:
    """Every test this file declares, read from the source.

    Two dialects because the migration crosses tiers: pytest functions are
    read with ``ast`` (the same technique as
    ``test_csrf_cookie_registry.py``), Playwright/vitest cases with a
    regex over ``test('…')``, which is the only declaration form the e2e
    suite uses.
    """
    source = path.read_text(encoding="utf-8")
    if path.suffix == ".py":
        return {
            node.name
            for node in ast.walk(ast.parse(source))
            if isinstance(node, ast.FunctionDef) and node.name.startswith("test_")
        }
    return set(re.findall(r"""\btest\(\s*['"](.+?)['"]""", source))


def test_every_row_names_a_real_superseded_test():
    """No ledger padding: a row for a test the old file never had is a row
    that proves nothing."""
    old = _test_names(_OLD)
    strays = sorted(name for name in SUPERSEDED if name not in old)
    assert not strays, (
        "These rows name tests that do not exist in "
        f"{_OLD.name}:\n  " + "\n  ".join(strays)
    )


def test_every_successor_named_in_the_ledger_exists():
    """The migration itself. Red until the successor is written, and it
    fails by name — the list below is the work still owed."""
    missing: list[str] = []
    for old, (rel, successor) in sorted(SUPERSEDED.items()):
        target = _PRODUCT_ROOT / rel
        if not target.exists() or successor not in _test_names(target):
            missing.append(f"{old} -> {rel}::{successor}")

    assert not missing, (
        "These superseded tests have no successor yet:\n  " + "\n  ".join(missing)
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entries_migration_parity.py`

Expected: `test_every_row_names_a_real_superseded_test` PASSES (the old file is still there and every key is real); `test_every_successor_named_in_the_ledger_exists` FAILS with `AssertionError: These superseded tests have no successor yet:` followed by 25 lines, each `… -> tests/test_entries_page_api.py::…`, because that file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `products/scheduler/tests/test_entries_page_api.py`. The fixtures are lifted verbatim from `test_entries_public_routes.py:56-175` (prior art: every entries test file declares its own `client`/`page`/`entrant`); the assertions move from scraping markup to reading the projection.

```python
"""The entrant loader projection: ``GET /e/api/page/{slug}``.

**Successor file to the page half of ``tests/test_entries_public_routes.py``**
(SP-PROGRAM-1 Phase 6, spec §8/§9). Submission and publication *behaviour*
is unchanged — what moved is the serving context: the f-string HTML page is
retired and RR7 renders this JSON. Every test here names the test it
supersedes in ``tests/test_entries_migration_parity.py``.

The one claim that genuinely changes shape is escaping. The old file
asserted ``html.escape`` ran over every interpolation in both directions of
hostility; there is no interpolation here, so the successor asserts the
stronger property the JSON boundary makes available: **the projection
carries no markup at all**, in either direction. React escapes on render;
this pins that there is nothing to escape.

The projection is still strict (Q4/I6): entrant names and event ids, never
contact data, opt-outs absent.
"""
from __future__ import annotations

import json
import re
import uuid

import pytest

from tests._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


@pytest.fixture
def turnstile(client, monkeypatch):
    """Cloudflare's dummy-key semantics, without Cloudflare — the entrant
    fixture signs up for real and signup is where the challenge lives."""
    from services import turnstile as service

    def fake_post(url, fields, timeout):
        return json.dumps({"success": True})

    monkeypatch.setattr(service, "_post", fake_post)


@pytest.fixture
def page(client):
    """A workspace with an open entry page and two entry events."""
    tid = client.post(
        "/tournaments", json={"name": "Spring Open"}, headers=CSRF
    ).json()["id"]

    from database.models import EntryEvent, EntryPage, Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        t = session.get(Tournament, uuid.UUID(tid))
        t.tournament_date = "2026-09-12"
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="spring-open",
                is_open=True,
                intro_text="All welcome.",
                regulations_text="Play fair. Bring your own shuttles.",
                waiver_required=True,
                regulations_version=3,
                fee_schedule={"1": 4000, "2": 5500},
                payment_instructions="Zelle to treasurer@club.example.",
                venue_name="Riverside Sports Hall",
                venue_address="12 Mill Lane",
            )
        )
        ms = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
            fee_cents=1500,
            gender_constraint="M",
        )
        ws = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="WS",
            discipline="Women's Singles",
            entry_type="singles",
            gender_constraint="F",
        )
        session.add_all([ms, ws])
        session.commit()
        return {"tid": tid, "slug": "spring-open", "ms": str(ms.id), "ws": str(ws.id)}
    finally:
        session.close()


@pytest.fixture
def entrant(client, turnstile):
    """A signed-in entrant, created and logged in through the real routes."""
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "parent@example.com",
                "password": GOOD_PW,
                "turnstileToken": "a-solved-token",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    assert (
        client.post(
            "/e/account/login",
            json={"email": "parent@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )
    return "parent@example.com"


def _projection(client, page):
    r = client.get(f"/e/api/page/{page['slug']}")
    assert r.status_code == 200, r.text
    return r.json()


def _event(payload, event_id):
    return next(ev for ev in payload["events"] if ev["id"] == event_id)


def _set_fee_schedule(page, schedule):
    """Write a schedule onto the row exactly as stored — the projection has
    to survive a column whose contents it did not choose (hand-edited JSON,
    an older row, a restored backup)."""
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(EntryPage, uuid.UUID(page["tid"])).fee_schedule = schedule
        session.commit()
    finally:
        session.close()


def _add_entry(tid, event_id, **kwargs):
    """Seed an entry with its player, at the level boundary R13 drew."""
    from database.models import EntrantAccount, Entry, EntryPlayer, Submission
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        account = session.scalars(select(EntrantAccount).limit(1)).first()
        if account is None:
            account = EntrantAccount(
                email=f"seed-{uuid.uuid4().hex[:8]}@example.com", password_hash="x"
            )
            session.add(account)
            session.flush()
        submission = Submission(tournament_id=uuid.UUID(tid), account_id=account.id)
        player = EntryPlayer(
            tournament_id=uuid.UUID(tid),
            account_id=account.id,
            full_name=kwargs.pop("player_name", "Seeded Player"),
            gender=kwargs.pop("gender", "F"),
        )
        session.add_all([submission, player])
        session.flush()
        row = Entry(
            tournament_id=uuid.UUID(tid),
            entry_event_id=uuid.UUID(event_id),
            submission_id=submission.id,
            entry_player_id=player.id,
            state=kwargs.pop("state", "pending"),
            **kwargs,
        )
        session.add(row)
        session.commit()
        return str(row.id)
    finally:
        session.close()


# ---- what the projection publishes --------------------------------------
# Supersedes test_the_page_shows_the_tournament_its_date_and_its_events.


def test_the_projection_carries_the_tournament_its_date_and_its_events(client, page):
    payload = _projection(client, page)
    assert payload["tournament"]["name"] == "Spring Open"
    assert payload["tournament"]["date"] == "2026-09-12"
    assert payload["intro"] == "All welcome."
    assert {ev["discipline"] for ev in payload["events"]} == {
        "Men's Singles",
        "Women's Singles",
    }


def test_the_projection_carries_the_fee_and_the_regulations_version(client, page):
    payload = _projection(client, page)
    assert _event(payload, page["ms"])["feeCents"] == 1500
    assert payload["regulations"]["text"].startswith("Play fair.")
    assert payload["regulations"]["version"] == 3


def test_the_projection_carries_the_schedule_and_the_payment_instructions(
    client, page
):
    """R14 §1/§2 — the published price list and the manual-payment prose."""
    payload = _projection(client, page)
    assert payload["feeSchedule"] == {"1": 4000, "2": 5500}
    assert payload["paymentInstructions"] == "Zelle to treasurer@club.example."


def test_a_malformed_fee_tier_does_not_take_the_projection_down(client, page):
    """A string-valued tier is an unauthenticated 500 if the projection
    reads the raw column. ``fee_schedule`` is free-form JSON and
    ``normalize_fee_schedule`` exists precisely because a director may
    leave anything in it — a bad tier is dropped where the price is
    dropped, not raised at the one point an anonymous visitor can reach."""
    _set_fee_schedule(page, {"1": 4000, "2": "5500", "0": 100, "3": -500, "4": "free"})

    payload = _projection(client, page)
    assert payload["feeSchedule"] == {"1": 4000, "2": 5500}


def test_a_clean_schedule_still_projects_every_tier(client, page):
    """Negative control: the dropping is the normalization's, not the
    projection quietly publishing less than it has."""
    _set_fee_schedule(page, {"1": 4000, "2": 5500, "3": 6000})
    assert _projection(client, page)["feeSchedule"] == {
        "1": 4000,
        "2": 5500,
        "3": 6000,
    }


def test_the_projection_carries_the_venue(client, page):
    payload = _projection(client, page)
    assert payload["venue"]["name"] == "Riverside Sports Hall"
    assert payload["venue"]["address"] == "12 Mill Lane"


# ---- the strict entrant list (Q4/I6) ------------------------------------


def test_the_projection_lists_entrant_names_and_events_only(client, page):
    _add_entry(page["tid"], page["ms"], player_name="Bo Ferrar")
    payload = _projection(client, page)

    assert payload["entrants"] == [{"name": "Bo Ferrar", "eventId": page["ms"]}]
    # The projection reaches the player and stops. The account behind the
    # entry is one hop further out and is never selected.
    assert "@example.com" not in json.dumps(payload)


def test_an_opted_out_entrant_is_absent_but_a_listed_one_is_present(client, page):
    _add_entry(page["tid"], page["ms"], player_name="Shy Person", list_opt_out=True)
    _add_entry(page["tid"], page["ms"], player_name="Loud Person")
    names = [row["name"] for row in _projection(client, page)["entrants"]]
    assert names == ["Loud Person"]


def test_withdrawn_and_rejected_entries_are_not_listed(client, page):
    _add_entry(page["tid"], page["ms"], player_name="Gone Away", state="withdrawn")
    _add_entry(page["tid"], page["ms"], player_name="Turned Down", state="rejected")
    _add_entry(page["tid"], page["ms"], player_name="Still Here")
    names = [row["name"] for row in _projection(client, page)["entrants"]]
    assert names == ["Still Here"]


def test_the_list_never_reveals_entry_state(client, page):
    """Entry is not acceptance. The list shows who entered, and a public
    'pending' next to a name is a judgment nobody made — at the JSON
    boundary that is a *schema* claim: the row has two keys."""
    _add_entry(page["tid"], page["ms"], player_name="Ada Waiting", state="pending")
    _add_entry(page["tid"], page["ms"], player_name="Bo Accepted", state="confirmed")

    rows = _projection(client, page)["entrants"]
    assert len(rows) == 2
    assert all(set(row) == {"name", "eventId"} for row in rows)


def test_the_projection_carries_no_markup_at_all(client, page):
    """**Supersedes ``test_every_interpolated_value_is_escaped``.**

    The old page interpolated director-authored regulations and
    stranger-authored names into an f-string document and escaped both.
    There is no interpolation here, so the successor asserts the stronger
    property the boundary gives us: markup arrives as data and leaves as
    data. Both directions of hostility, as before.
    """
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.regulations_text = "<script>alert('director')</script>"
        session.commit()
    finally:
        session.close()
    _add_entry(page["tid"], page["ms"], player_name="<img src=x onerror=alert(1)>")

    r = client.get(f"/e/api/page/{page['slug']}")
    payload = r.json()

    # Round-tripped verbatim as text: nothing is silently rewritten.
    assert payload["regulations"]["text"] == "<script>alert('director')</script>"
    assert payload["entrants"][0]["name"] == "<img src=x onerror=alert(1)>"
    # And it is a JSON document, not a document that can execute: the
    # hostile strings are escaped by the encoder in the wire body.
    assert "<script>" not in r.text
    assert "<img src=x" not in r.text
    assert r.headers["content-type"].startswith("application/json")


# ---- the uniform 404 ----------------------------------------------------


def test_an_unknown_slug_and_a_closed_page_answer_identically(client, page):
    from database.models import EntryPage
    from database.session import SessionLocal

    unknown = client.get("/e/api/page/no-such-page-anywhere")
    session = SessionLocal()
    try:
        session.get(EntryPage, uuid.UUID(page["tid"])).is_open = False
        session.commit()
    finally:
        session.close()
    closed = client.get(f"/e/api/page/{page['slug']}")

    assert unknown.status_code == closed.status_code == 404
    assert unknown.json() == closed.json()
    assert unknown.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_an_open_page_is_the_negative_control_for_that_404(client, page):
    assert client.get(f"/e/api/page/{page['slug']}").status_code == 200


# ---- the viewer block ---------------------------------------------------


def test_a_signed_out_viewer_is_projected_as_signed_out_not_404(client, page):
    """Seam B's failure mode, stated: no session -> a signed-out viewer,
    never a wall. The events, the money and the regulations are what
    somebody following a poster link came to read."""
    payload = _projection(client, page)
    assert payload["viewer"]["signedIn"] is False
    assert payload["viewer"]["email"] is None
    assert payload["viewer"]["formCsrf"] == ""
    assert payload["events"], "a signed-out viewer still gets the events"


def test_a_signed_in_viewer_carries_an_email_and_a_form_csrf_token(
    client, page, entrant
):
    """Negative control for the test above, and the field the RR7 form
    needs: channel two of the CSRF proof is minted here."""
    viewer = _projection(client, page)["viewer"]
    assert viewer["signedIn"] is True
    assert viewer["email"] == "parent@example.com"
    assert re.fullmatch(r"[0-9a-f]{64}", viewer["formCsrf"])


# ---- the incumbent's IA (R14 §6) ----------------------------------------


def _set_dates(page, *, event="ws", **columns):
    from database.models import EntryEvent
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryEvent, (uuid.UUID(page["tid"]), uuid.UUID(page[event])))
        for key, value in columns.items():
            setattr(row, key, value)
        session.commit()
    finally:
        session.close()


def test_the_projection_carries_open_close_withdraw_and_the_date(client, page):
    """R14 §3/§6: four moments. The withdrawal deadline is a first-class
    field rather than a footnote, because organisers deliberately separate
    it from the entry close and an entrant reads it as a different
    promise."""
    from datetime import datetime, timezone

    for key in ("ms", "ws"):
        _set_dates(
            page,
            event=key,
            opens_at=datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc),
            closes_at=datetime(2026, 9, 1, 23, 59, tzinfo=timezone.utc),
            withdraws_until=datetime(2026, 9, 3, 23, 59, tzinfo=timezone.utc),
        )

    payload = _projection(client, page)
    ev = _event(payload, page["ws"])
    assert ev["opensAt"].startswith("2026-08-01")
    assert ev["closesAt"].startswith("2026-09-01")
    assert ev["withdrawsUntil"].startswith("2026-09-03")
    assert payload["tournament"]["date"] == "2026-09-12"


def test_a_deadline_that_differs_between_events_is_projected_per_event(client, page):
    """Two events, two closing dates. The old page printed "Varies by
    event" because one headline string had to stand for both; the
    projection has no such constraint — it publishes both and RR7 decides
    what to say. The claim that survives is that neither is silently
    dropped in favour of the other."""
    from datetime import datetime, timezone

    _set_dates(page, event="ms", closes_at=datetime(2026, 9, 1, tzinfo=timezone.utc))
    _set_dates(page, event="ws", closes_at=datetime(2026, 9, 5, tzinfo=timezone.utc))

    payload = _projection(client, page)
    assert _event(payload, page["ms"])["closesAt"].startswith("2026-09-01")
    assert _event(payload, page["ws"])["closesAt"].startswith("2026-09-05")


def test_one_shared_deadline_is_projected_on_every_event(client, page):
    """Negative control for the line above."""
    from datetime import datetime, timezone

    for key in ("ms", "ws"):
        _set_dates(
            page, event=key, closes_at=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)
        )
    payload = _projection(client, page)
    assert {ev["closesAt"][:10] for ev in payload["events"]} == {"2026-09-05"}


def test_the_projection_names_the_organisation_running_the_tournament(client, page):
    from database.models import Org, Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        org = Org(name="Riverside Badminton Club")
        session.add(org)
        session.flush()
        session.get(Tournament, uuid.UUID(page["tid"])).org_id = org.id
        session.commit()
    finally:
        session.close()

    assert _projection(client, page)["org"]["name"] == "Riverside Badminton Club"


def test_a_workspace_with_no_org_projects_no_organiser(client, page):
    """Negative control: the card is data, not decoration."""
    from database.models import Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(Tournament, uuid.UUID(page["tid"])).org_id = None
        session.commit()
    finally:
        session.close()

    assert _projection(client, page)["org"] is None


# ---- entry counts and the fee card's agreement with the quote -----------


def test_the_projection_offers_exactly_the_tiers_the_quote_honours(
    client, page, entrant
):
    """The divergence, stated as the invariant it breaks. A tier the
    normalization drops is a price the *quote* will never charge, so
    publishing it is the page quoting a number the submission
    contradicts. Tier 2 is unusable here, so two events fall back to tier
    1 — and the schedule must not be advertising 5500 while the quote
    charges 4000."""
    _set_fee_schedule(page, {"1": 4000, "2": "on request", "3": 6000})

    payload = _projection(client, page)
    assert payload["feeSchedule"] == {"1": 4000, "3": 6000}

    quote = client.post(
        f"/e/api/quote/{page['slug']}",
        data={
            "playerName": "Alice Chen",
            "gender": "F",
            "events": [f"0:{page['ws']}", f"0:{page['ms']}"],
            "_csrf": payload["viewer"]["formCsrf"],
        },
    )
    assert quote.status_code == 200, quote.text
    assert quote.json()["totalCents"] == 4000


# ---- R12's birth-year trigger, now a projected flag ---------------------


def test_no_event_is_flagged_age_bracketed_when_none_is(client, page):
    """R12: birth year is collected **only where an age-bracketed event
    requires it**. Two open singles events with no age band need nothing,
    and a field nobody needs is data minimization failing quietly (Q10).
    The heuristic stays Python-side; the form reads this flag."""
    payload = _projection(client, page)
    assert all(ev["ageBracketed"] is False for ev in payload["events"])


def test_an_age_bracketed_event_is_flagged_in_the_projection(client, page):
    """Negative control, and the case the field exists for."""
    from database.models import EntryEvent
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = EntryEvent(
            tournament_id=uuid.UUID(page["tid"]),
            code="U15BS",
            discipline="Under-15 Boys' Singles",
            entry_type="singles",
        )
        session.add(row)
        session.commit()
        bracketed = str(row.id)
    finally:
        session.close()

    payload = _projection(client, page)
    assert _event(payload, bracketed)["ageBracketed"] is True


# ---- registration and the deletion guard --------------------------------


def test_the_entrant_json_routes_are_registered(client):
    """Newer FastAPI keeps each ``include_router`` as a nested
    ``_IncludedRouter``, so the OpenAPI document is the assertion surface,
    not ``app.routes``."""
    from app.main import app

    paths = app.openapi()["paths"]
    assert "get" in paths["/e/api/page/{slug}"]
    assert "get" in paths["/e/api/config"]
    assert "post" in paths["/e/api/quote/{slug}"]
    assert "post" in paths["/e/api/submit/{slug}"]


def test_the_entrant_json_module_mints_no_capability_material_at_all(client):
    """The deletion guard for the manage-token path (R10 / Q13 §6),
    retargeted from the retired HTML module onto the module that replaced
    it. A capability that is never minted cannot be leaked by a renderer
    added later. ``secrets`` itself stays imported — for
    ``compare_digest``, which is a comparison, not a credential."""
    import inspect

    from api import entries_public

    source = inspect.getsource(entries_public)
    assert "token_urlsafe" not in source
    assert "token_bytes" not in source
    assert "token_hex" not in source
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_entries_page_api.py tests/test_entries_migration_parity.py`

Expected: PASS — 25 page tests plus `test_every_row_names_a_real_superseded_test`; `test_every_successor_named_in_the_ledger_exists` now passes because every row in the ledger points at a test that exists.

- [ ] **Step 5: Commit**
```bash
git add products/scheduler/tests/test_entries_migration_parity.py products/scheduler/tests/test_entries_page_api.py
git commit -m "test(entries): migrate the page-projection tests onto the JSON loader route

Twenty-five tests from tests/test_entries_public_routes.py are superseded
by successors in tests/test_entries_page_api.py, asserting the same claims
against GET /e/api/page/{slug}. Submission and publication behaviour is
unchanged; only the serving context moves from f-string HTML to RR7 + a
JSON route (Phase 6 design §8, §9).

test_every_interpolated_value_is_escaped is the one whose shape changes:
there is no interpolation left to escape, so its successor
test_the_projection_carries_no_markup_at_all asserts the stronger property
the JSON boundary provides — markup arrives and leaves as data, in both
directions of hostility.

tests/test_entries_migration_parity.py is the ledger that makes 'migrated,
not deleted' checkable: every row names a real superseded test and a
successor that must exist. Tasks 29-30 extend it; the cut-over flips its
old-file guard."
```

---

### Task 29: Migrate the write-path tests onto `POST /e/api/submit/{slug}`, and scope replay to the account

**Files:**
- Create: `products/scheduler/tests/test_entries_submit_api.py`
- Modify: `products/scheduler/tests/test_entries_migration_parity.py` (add `_SUBMIT` and 47 rows to `SUPERSEDED`)
- Modify: `products/scheduler/backend/services/submissions.py:131-146` (`replay`) and its `find_by_idempotency_key` caller
- Test: `products/scheduler/tests/test_entries_submit_api.py`

**Interfaces:**
- Consumes: `POST /e/api/submit/{slug}`, urlencoded body in the retired form's transport shape (`playerName`/`gender`/`club`/`birthYear`/`remarks` repeated positionally, `events` values `"<playerIndex>:<eventId>"`, `acknowledged`, `_csrf`, `idempotencyKey`), entrant session required, answers `303` with `Location: /e/{slug}/receipt/{submissionId}`; `POST /e/api/quote/{slug}` → `200 {"totalCents": int|null, "refusal": str|null}`; `GET /e/api/page/{slug}` → `viewer.formCsrf` (Task 28); `app/main.py::csrf_middleware` accepting channel two (custom header **or** cookie-derived `_csrf`).
- Produces: `services.submissions.replay(session, tournament_id, key, *, account_id: uuid.UUID) -> Optional[SubmissionResult]` and `services.submissions.find_by_idempotency_key(session, tournament_id, key, *, account_id: uuid.UUID) -> Optional[Submission]` — both now account-scoped. Any caller passing only `(session, tournament_id, key)` is a TypeError, which is the point.

Spec §4 names this defect and names this phase as its cause: `replay` scopes by `(tournament_id, key)` only, so a guessed key returns another entrant's receipt. It has been latent because a native form cannot send a header, so real keys never flowed; Phase 6 mints the key in the loader and makes it flow. Fixing it here, in the commit that migrates the idempotency tests, is where it belongs.

- [ ] **Step 1: Write the failing test**

First extend the ledger. In `products/scheduler/tests/test_entries_migration_parity.py`, after `_PAGE = "tests/test_entries_page_api.py"` add:

```python
_SUBMIT = "tests/test_entries_submit_api.py"
```

and add these 47 rows to `SUPERSEDED` (all successors keep their original names except where the serving context renamed the thing being asserted):

```python
    # ---- the quote route: the round trip that replaces "Update events" --
    "test_the_refresh_round_trip_writes_nothing": (
        _SUBMIT, "test_the_quote_route_writes_nothing"),
    "test_the_running_total_is_shown_from_the_server_side_computation": (
        _SUBMIT, "test_the_quote_is_computed_server_side"),
    "test_the_total_shown_is_the_total_recorded": (
        _SUBMIT, "test_the_total_shown_is_the_total_recorded"),
    "test_the_total_covers_every_player_in_the_act": (
        _SUBMIT, "test_the_total_covers_every_player_in_the_act"),
    "test_nothing_selected_shows_no_total_rather_than_zero": (
        _SUBMIT, "test_nothing_selected_quotes_no_total_rather_than_zero"),
    # ---- the session gate (R10) ----------------------------------------
    "test_an_anonymous_submit_is_rejected": (
        _SUBMIT, "test_an_anonymous_submit_is_rejected"),
    "test_the_same_submission_from_a_signed_in_entrant_succeeds": (
        _SUBMIT, "test_the_same_submission_from_a_signed_in_entrant_succeeds"),
    "test_an_operator_session_does_not_authorize_a_submit": (
        _SUBMIT, "test_an_operator_session_does_not_authorize_a_submit"),
    "test_a_garbage_entrant_cookie_does_not_authorize_a_submit": (
        _SUBMIT, "test_a_garbage_entrant_cookie_does_not_authorize_a_submit"),
    # ---- CSRF channel two ----------------------------------------------
    "test_a_submit_without_the_form_csrf_token_is_refused": (
        _SUBMIT, "test_a_submit_without_the_form_csrf_token_is_refused"),
    "test_a_wrong_form_csrf_token_is_refused": (
        _SUBMIT, "test_a_wrong_form_csrf_token_is_refused"),
    "test_the_right_token_is_the_negative_control": (
        _SUBMIT, "test_the_right_token_is_the_negative_control"),
    "test_the_token_is_bound_to_the_session_that_rendered_the_form": (
        _SUBMIT, "test_the_token_is_bound_to_the_session_that_rendered_the_form"),
    "test_submit_requires_no_challenge_token": (
        _SUBMIT, "test_submit_requires_no_challenge_token"),
    # ---- what one act records ------------------------------------------
    "test_a_valid_submission_lands_a_pending_entry_under_a_submission": (
        _SUBMIT, "test_a_valid_submission_lands_a_pending_entry_under_a_submission"),
    "test_the_player_carries_the_name_gender_and_remarks": (
        _SUBMIT, "test_the_player_carries_the_name_gender_and_remarks"),
    "test_the_acknowledgment_is_recorded_on_the_submission_with_its_version": (
        _SUBMIT,
        "test_the_acknowledgment_is_recorded_on_the_submission_with_its_version"),
    "test_the_fee_total_is_the_schedule_price_and_lives_on_the_submission": (
        _SUBMIT,
        "test_the_fee_total_is_the_schedule_price_and_lives_on_the_submission"),
    "test_two_events_for_one_player_are_one_act_at_the_tiered_price": (
        _SUBMIT, "test_two_events_for_one_player_are_one_act_at_the_tiered_price"),
    "test_two_players_in_one_act_share_one_acceptance_and_one_total": (
        _SUBMIT, "test_two_players_in_one_act_share_one_acceptance_and_one_total"),
    "test_an_empty_second_player_block_is_ignored_not_refused": (
        _SUBMIT, "test_an_empty_second_player_block_is_ignored_not_refused"),
    "test_the_entry_lands_under_the_tournament_the_slug_resolves_to": (
        _SUBMIT, "test_the_entry_lands_under_the_tournament_the_slug_resolves_to"),
    # ---- the acknowledgment --------------------------------------------
    "test_submission_without_the_acknowledgment_is_refused": (
        _SUBMIT, "test_submission_without_the_acknowledgment_is_refused"),
    "test_the_same_submission_with_the_box_ticked_succeeds": (
        _SUBMIT, "test_the_same_submission_with_the_box_ticked_succeeds"),
    # ---- the throttle ---------------------------------------------------
    "test_a_flood_from_one_ip_is_locked_out": (
        _SUBMIT, "test_a_flood_from_one_ip_is_locked_out"),
    "test_under_the_budget_nothing_is_locked": (
        _SUBMIT, "test_under_the_budget_nothing_is_locked"),
    "test_the_throttle_bucket_is_its_own_namespace": (
        _SUBMIT, "test_the_throttle_bucket_is_its_own_namespace"),
    # ---- idempotency ----------------------------------------------------
    "test_a_replayed_key_returns_the_original_act_and_creates_nothing": (
        _SUBMIT, "test_a_replayed_key_returns_the_original_act_and_creates_nothing"),
    "test_a_replay_answers_with_the_same_reference": (
        _SUBMIT, "test_a_replay_redirects_to_the_same_receipt"),
    "test_a_different_key_creates_a_second_act": (
        _SUBMIT, "test_a_different_key_creates_a_second_act"),
    "test_a_key_is_scoped_to_the_tournament_the_slug_resolves_to": (
        _SUBMIT, "test_a_key_is_scoped_to_the_tournament_the_slug_resolves_to"),
    # ---- the soft flags -------------------------------------------------
    "test_a_repeat_of_the_same_player_and_event_flags_the_new_entry": (
        _SUBMIT, "test_a_repeat_of_the_same_player_and_event_flags_the_new_entry"),
    "test_a_second_player_under_one_account_is_not_flagged": (
        _SUBMIT, "test_a_second_player_under_one_account_is_not_flagged"),
    "test_the_same_player_in_a_different_event_is_not_flagged": (
        _SUBMIT, "test_the_same_player_in_a_different_event_is_not_flagged"),
    "test_a_gender_mismatch_is_accepted_with_a_flag": (
        _SUBMIT, "test_a_gender_mismatch_is_accepted_with_a_flag"),
    "test_a_matching_gender_is_unflagged": (
        _SUBMIT, "test_a_matching_gender_is_unflagged"),
    # ---- entry policy ---------------------------------------------------
    "test_over_the_per_person_cap_is_refused_with_the_rule_stated": (
        _SUBMIT, "test_over_the_per_person_cap_is_refused_with_the_rule_stated"),
    "test_under_the_cap_is_accepted": (
        _SUBMIT, "test_under_the_cap_is_accepted"),
    # ---- the event, and cross-tenant probing ----------------------------
    "test_an_event_from_another_workspace_is_refused_and_leaks_nothing": (
        _SUBMIT, "test_an_event_from_another_workspace_is_refused_and_leaks_nothing"),
    "test_an_event_of_this_workspace_is_the_negative_control": (
        _SUBMIT, "test_an_event_of_this_workspace_is_the_negative_control"),
    "test_a_closed_event_is_refused": (
        _SUBMIT, "test_a_closed_event_is_refused"),
    "test_an_event_that_has_not_opened_yet_is_refused": (
        _SUBMIT, "test_an_event_that_has_not_opened_yet_is_refused"),
    "test_a_submission_to_an_unknown_slug_is_the_uniform_404": (
        _SUBMIT, "test_a_submission_to_an_unknown_slug_is_the_uniform_404"),
    "test_a_submission_with_no_events_selected_is_refused": (
        _SUBMIT, "test_a_submission_with_no_events_selected_is_refused"),
    "test_a_player_without_a_gender_is_refused": (
        _SUBMIT, "test_a_player_without_a_gender_is_refused"),
    "test_the_global_body_cap_applies_to_this_route_too": (
        _SUBMIT, "test_the_global_body_cap_applies_to_this_route_too"),
    "test_a_body_just_under_the_cap_is_accepted_through_the_same_route": (
        _SUBMIT, "test_a_body_just_under_the_cap_is_accepted_through_the_same_route"),
```

Now create `products/scheduler/tests/test_entries_submit_api.py`. Fixtures are the same four as Task 28 (`client`, `turnstile`, `page`, `entrant`) — copy them verbatim from `tests/test_entries_page_api.py`, plus these module-level helpers and the tests below.

**The worked migration example — before and after.** This is the mechanical rule for all 47; apply it row by row.

*Before* (`test_entries_public_routes.py:177-206, 1224-1247`):

```python
def _csrf_token(client, page):
    body = client.get(f"/e/{page['slug']}").text
    match = re.search(r'name="_csrf" value="([0-9a-f]*)"', body)
    return match.group(1) if match else ""


def _submit(client, page, **overrides):
    data = {
        "playerName": "Alice Chen",
        "gender": "F",
        "club": "",
        "birthYear": "",
        "remarks": "can't play before 6pm Saturday",
        "events": [f"0:{page['ws']}"],
        "acknowledged": "on",
        "_csrf": _csrf_token(client, page),
    }
    headers = overrides.pop("headers", {})
    data.update({k: v for k, v in overrides.items() if v is not None})
    for k, v in overrides.items():
        if v is None:
            data.pop(k, None)
    return client.post(f"/e/{page['slug']}/submit", data=data, headers=headers)


def test_a_replayed_key_returns_the_original_act_and_creates_nothing(
    client, page, entrant
):
    first = _submit(
        client, page,
        events=[f"0:{page['ws']}", f"0:{page['ms']}"],
        headers={"Idempotency-Key": "key-1"},
    )
    assert first.status_code == 201

    second = _submit(
        client, page,
        events=[f"0:{page['ws']}", f"0:{page['ms']}"],
        headers={"Idempotency-Key": "key-1"},
    )
    assert second.status_code == 200
    assert len(_submissions(page["tid"])) == 1
    assert len(_entries(page["tid"])) == 2
```

*After* — three changes and no others: the token is read from `viewer.formCsrf` instead of scraped out of markup; the URL is the JSON route; the idempotency key travels as the `idempotencyKey` form field the loader minted (spec §4 — a native form cannot send a header, so it must work as a field), and the answer is a `303` to the receipt route both times.

```python
def _csrf_token(client, page):
    """Read the form token off the loader projection.

    Deliberately fetched rather than recomputed: a test that recomputed
    the digest would pass even if the projection stopped emitting the
    field, and the field is the only thing that lets an unhydrated form
    post this write (channel two, ruling R8-B).
    """
    return client.get(f"/e/api/page/{page['slug']}").json()["viewer"]["formCsrf"]


def _submit(client, page, **overrides):
    """A well-formed one-player, one-event submission."""
    data = {
        "playerName": "Alice Chen",
        "gender": "F",
        "club": "",
        "birthYear": "",
        "remarks": "can't play before 6pm Saturday",
        "events": [f"0:{page['ws']}"],
        "acknowledged": "on",
        "_csrf": _csrf_token(client, page),
    }
    headers = overrides.pop("headers", {})
    data.update({k: v for k, v in overrides.items() if v is not None})
    for k, v in overrides.items():
        if v is None:
            data.pop(k, None)
    return client.post(
        f"/e/api/submit/{page['slug']}",
        data=data,
        headers=headers,
        follow_redirects=False,
    )


def _receipt_id(response):
    """The submission id out of the 303 Location — the POST/redirect/GET
    target that makes a reload safe to press."""
    return response.headers["location"].rsplit("/", 1)[-1]


def test_a_replayed_key_returns_the_original_act_and_creates_nothing(
    client, page, entrant
):
    """R13 moved the key up a level, so the claim moved with it: the reply
    is the original submission **and all of its entries**, never a partial
    re-creation. Phase 6 is the first release in which a real entrant's key
    is non-NULL at all — a native form cannot send a header, so the key is
    minted in the loader and carried as a field."""
    first = _submit(
        client, page,
        events=[f"0:{page['ws']}", f"0:{page['ms']}"],
        idempotencyKey="key-1",
    )
    assert first.status_code == 303, first.text

    second = _submit(
        client, page,
        events=[f"0:{page['ws']}", f"0:{page['ms']}"],
        idempotencyKey="key-1",
    )
    assert second.status_code == 303
    assert len(_submissions(page["tid"])) == 1
    assert len(_entries(page["tid"])) == 2


def test_a_replay_redirects_to_the_same_receipt(client, page, entrant):
    first = _submit(client, page, idempotencyKey="key-1")
    second = _submit(client, page, idempotencyKey="key-1")
    reference = str(_submissions(page["tid"])[0].id)
    assert _receipt_id(first) == reference
    assert _receipt_id(second) == reference


def test_the_unique_index_is_reachable_for_the_first_time(client, page, entrant):
    """``UNIQUE (tournament_id, idempotency_key)`` has never been exercised
    by a real entrant: the retired form could not send a header, so the
    column was always NULL outside tests. The loader now mints the key, so
    the constraint is live — and the row it protects is the one written."""
    r = _submit(client, page, idempotencyKey="key-1")
    assert r.status_code == 303
    assert _submissions(page["tid"])[0].idempotency_key == "key-1"
```

Then the new negative control that fails today — the replay-scoping defect (spec §4):

```python
def test_a_foreign_idempotency_key_does_not_resolve_to_someone_elses_receipt(
    client, page, entrant, turnstile
):
    """**The defect this phase makes live.** ``services/submissions.replay``
    scoped by ``(tournament_id, key)`` only, so a *guessed* key returned
    another entrant's submission — its reference, its entries, its total.
    Latent while real keys were always NULL; Phase 6 mints them, so it is
    live now.

    Break it to prove it is not vacuous: drop ``account_id`` from the
    ``where`` clause in ``find_by_idempotency_key`` and this test fails
    with the second entrant redirected to the first entrant's receipt.
    """
    first = _submit(client, page, idempotencyKey="guessable-key")
    victim_receipt = _receipt_id(first)

    client.post("/e/account/logout", headers=CSRF)
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "stranger@example.com",
                "password": GOOD_PW,
                "turnstileToken": "a-solved-token",
            },
            headers=CSRF,
        ).status_code
        == 202
    )
    assert (
        client.post(
            "/e/account/login",
            json={"email": "stranger@example.com", "password": GOOD_PW},
            headers=CSRF,
        ).status_code
        == 200
    )

    second = _submit(client, page, playerName="Dara Vo", idempotencyKey="guessable-key")

    assert second.status_code == 303
    assert _receipt_id(second) != victim_receipt
    assert len(_submissions(page["tid"])) == 2


def test_a_replay_under_the_same_account_still_resolves(client, page, entrant):
    """Non-vacuity control for the scoping above: the tightening must not
    have turned every replay into a fresh act, which would be a silent
    double-charge on a retried submit."""
    first = _submit(client, page, idempotencyKey="key-1")
    second = _submit(client, page, idempotencyKey="key-1")
    assert _receipt_id(first) == _receipt_id(second)
    assert len(_submissions(page["tid"])) == 1
```

And the CSRF group, which is the security-relevant one and owes negative controls in both directions (spec §3, controls 2 and 3):

```python
def test_a_submit_without_the_form_csrf_token_is_refused(client, page, entrant):
    """Channel two, refused. This write carries a session cookie and an
    unhydrated form cannot attach the custom header, so the proof is a
    double-submit token derived from the cookie: an attacker's page can
    make the browser send our cookie, it can never read it.

    Break it to prove it is not vacuous: delete the token comparison from
    ``csrf_middleware``'s channel-two branch and this returns 303.
    """
    r = _submit(client, page, _csrf="")
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
    assert _submissions(page["tid"]) == []


def test_a_wrong_form_csrf_token_is_refused(client, page, entrant):
    r = _submit(client, page, _csrf="0" * 64)
    assert r.status_code == 403
    assert _submissions(page["tid"]) == []


def test_the_token_is_bound_to_the_session_that_rendered_the_form(
    client, page, entrant
):
    """A token minted from a *different* session is refused. Logging out
    invalidates it because it is a function of the session token, not a
    row in a table someone has to remember to revoke."""
    stale = _csrf_token(client, page)
    client.post("/e/account/logout", headers=CSRF)
    client.post(
        "/e/account/login",
        json={"email": "parent@example.com", "password": GOOD_PW},
        headers=CSRF,
    )
    assert _submit(client, page, _csrf=stale).status_code == 403


def test_the_right_token_is_the_negative_control(client, page, entrant):
    """CODE_HEALTH 3b, the non-vacuity half: channel two is not dead. If
    this ever goes red the two refusals above stop being evidence, because
    a route that refuses everything passes them."""
    assert _submit(client, page).status_code == 303


def test_the_custom_header_is_still_a_sufficient_proof_on_its_own(
    client, page, entrant
):
    """R8-B's *first* channel, on the same route: a hydrated submit that
    sends the header needs no field. Two enumerated channels, not one
    channel and a per-path escape hatch."""
    r = _submit(client, page, _csrf="", headers=CSRF)
    assert r.status_code == 303


def test_a_large_multi_player_body_still_parses_after_the_middleware(
    client, page, entrant
):
    """**The known implementation trap (spec §3).** Channel two reads an
    urlencoded body inside ``csrf_middleware``; Starlette consumes the
    request stream on read, so unless the receive channel is replayed the
    route sees an empty form — silent truncation, not a loud failure.

    Break it to prove it is not vacuous: remove the receive-channel replay
    from the middleware and this fails with zero entries written rather
    than with an error.
    """
    r = _submit(
        client,
        page,
        playerName=["Alice Chen", "Bo Chen"],
        gender=["F", "M"],
        club=["Riverside BC", "Riverside BC"],
        birthYear=["", ""],
        remarks=["x" * 2000, "y" * 2000],
        events=[f"0:{page['ws']}", f"1:{page['ms']}"],
    )
    assert r.status_code == 303, r.text
    assert len(_entries(page["tid"])) == 2
```

The remaining 38 rows are mechanical: copy the body from `test_entries_public_routes.py`, keep the name and docstring, and apply exactly the three substitutions above (`_csrf_token` source, route URL, `201`/`200` → `303`). Two need one extra edit each: `test_a_submission_to_an_unknown_slug_is_the_uniform_404` posts to `/e/api/submit/no-such-page`, and the three quote successors post to `/e/api/quote/{slug}` and assert `response.json()["totalCents"]` where the old test scraped `data-total`:

```python
def _quote(client, page, **overrides):
    """Press "Update events and total" — session-gated by ruling R8-C, and
    calling the same ``check_policy`` and ``compute_fee_total`` the write
    calls, so the total shown is the total recorded."""
    data = {
        "playerName": "Alice Chen",
        "gender": "F",
        "events": [f"0:{page['ws']}"],
        "_csrf": _csrf_token(client, page),
    }
    data.update({k: v for k, v in overrides.items() if v is not None})
    return client.post(f"/e/api/quote/{page['slug']}", data=data)


def test_the_quote_route_writes_nothing(client, page, entrant):
    """Asking for a total is not a submission and must not behave like one
    — no act, no entry, and no acknowledgment required to ask."""
    r = _quote(client, page)
    assert r.status_code == 200
    assert _submissions(page["tid"]) == []
    assert _entries(page["tid"]) == []


def test_the_quote_is_computed_server_side(client, page, entrant):
    r = _quote(client, page, events=[f"0:{page['ws']}", f"0:{page['ms']}"])
    assert r.json()["totalCents"] == 5500


def test_the_total_shown_is_the_total_recorded(client, page, entrant):
    """**Seam B's invariant, asserted end to end.** The quote is a display
    of ``services.entry_fees`` and never a second implementation of it:
    the number the entrant agreed to is the number stored on the
    submission. RR7 formats cents and owns no fee rule."""
    selection = [f"0:{page['ws']}", f"0:{page['ms']}"]
    shown = _quote(client, page, events=selection).json()["totalCents"]

    assert _submit(client, page, events=selection).status_code == 303
    assert _submissions(page["tid"])[0].fee_total_cents == shown


def test_the_total_covers_every_player_in_the_act(client, page, entrant):
    """Per-person pricing (R14 §1): two single-event children are two
    single-event prices, not one two-event price."""
    r = _quote(
        client,
        page,
        playerName=["Alice Chen", "Bo Chen"],
        gender=["F", "M"],
        events=[f"0:{page['ws']}", f"1:{page['ms']}"],
    )
    assert r.json()["totalCents"] == 8000


def test_nothing_selected_quotes_no_total_rather_than_zero(client, page, entrant):
    """``0`` would be a claim about money nobody made: a tournament that
    has configured no prices has not declared its entries free."""
    r = _quote(client, page, events=None)
    assert r.json()["totalCents"] is None
```

Also copy `_entries`, `_submissions` and `_add_entry` verbatim from `test_entries_public_routes.py:226-295`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entries_submit_api.py -k "foreign_idempotency_key or replay_under_the_same_account"`

Expected: FAIL — `test_a_foreign_idempotency_key_does_not_resolve_to_someone_elses_receipt` fails on `assert _receipt_id(second) != victim_receipt`, because `submissions.replay` scopes by `(tournament_id, key)` only and hands the second entrant the first entrant's submission id (and `len(_submissions(...)) == 1`, not 2). `test_a_replay_under_the_same_account_still_resolves` passes — that is the pair working as designed.

- [ ] **Step 3: Write minimal implementation**

In `products/scheduler/backend/services/submissions.py`, add the account scope to the lookup and to `replay`. Find `find_by_idempotency_key` and change its `where` clause and signature to:

```python
def find_by_idempotency_key(
    session: Session,
    tournament_id: uuid.UUID,
    key: str,
    *,
    account_id: uuid.UUID,
) -> Optional[Submission]:
    """The prior act under this key, **for this account**.

    Tenant scope alone is not enough (ruling D4 got half of it). A key is
    a client-chosen string, and until Phase 6 it was always NULL for a
    real entrant — a native form cannot send a header — so a lookup
    scoped only by ``(tournament_id, key)`` never resolved to anybody
    else's row in practice. Phase 6 mints the key in the loader, which
    makes a *guessed* key a way to read another entrant's receipt: their
    reference, their entries, their total. So the requesting account is
    part of the key, not a fact about the answer.
    """
    return session.scalars(
        select(Submission).where(
            Submission.tournament_id == tournament_id,
            Submission.idempotency_key == key,
            Submission.account_id == account_id,
        )
    ).first()


def replay(
    session: Session,
    tournament_id: uuid.UUID,
    key: Optional[str],
    *,
    account_id: uuid.UUID,
) -> Optional[SubmissionResult]:
    """The original act, whole, or ``None`` if this key is new **here, for
    this account** — see ``find_by_idempotency_key``."""
    if not key:
        return None
    existing = find_by_idempotency_key(
        session, tournament_id, key, account_id=account_id
    )
    if existing is None:
        return None
    return SubmissionResult(
        submission=existing,
        entries=entries_for(session, tournament_id, existing.id),
        replayed=True,
    )
```

Then update every caller. Find them with `cd products/scheduler && grep -rn "replay(\|find_by_idempotency_key(" backend/` and add `account_id=` at each call — in `create_submission` the account is already in scope as the `account_id` parameter it writes onto the row.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest tests/test_entries_submit_api.py tests/test_entries_migration_parity.py`

Expected: PASS — 47 migrated tests plus the 4 new idempotency/CSRF-trap tests, and both parity assertions green.

- [ ] **Step 5: Commit**
```bash
git add products/scheduler/tests/test_entries_submit_api.py products/scheduler/tests/test_entries_migration_parity.py products/scheduler/backend/services/submissions.py
git commit -m "test(entries): migrate the write-path tests, and scope replay to the account

Forty-seven tests from tests/test_entries_public_routes.py are superseded
by successors in tests/test_entries_submit_api.py: the session gate, the
CSRF proof, the acknowledgment, entry policy, per-person fees, the
throttle, idempotency, the soft flags, cross-tenant probing and the body
cap. Submission behaviour is unchanged; only the serving context moves
from f-string HTML to RR7 + a JSON route, so each successor keeps its
name, its docstring and its assertion, and changes three things: the CSRF
token is read from GET /e/api/page/{slug} viewer.formCsrf instead of
scraped out of markup, the URL is /e/api/submit/{slug}, and the answer is
a 303 to the receipt route instead of 201/200 HTML.

services.submissions.replay and find_by_idempotency_key gain account_id.
They scoped by (tournament_id, key) only, so a guessed key returned
another entrant's receipt. Latent while a native form could not send a
header and the column was always NULL for real entrants; Phase 6 mints the
key in the loader, so it is live. Defect fix caused by this phase (design
§4), with a negative control that fails if account_id leaves the where
clause and a non-vacuity control proving same-account replay still
resolves.

Also new here, both owed by design §3: the header remains a sufficient
proof on its own (channel one), and a large multi-player body still parses
after the middleware reads it (the Starlette receive-channel replay trap —
its failure mode is silent truncation, not an error)."
```

---

### Task 30: The R11 evidence — dual-width screenshots and zero CSP violations

**Files:**
- Create: `products/scheduler/e2e/tests/10-entrant-r11-evidence.spec.ts`
- Modify: `products/scheduler/tests/test_entries_migration_parity.py` (add `_E2E` and the final 18 rows)
- Test: `products/scheduler/e2e/tests/10-entrant-r11-evidence.spec.ts`

**Interfaces:**
- Consumes: the dev stack from `make scheduler` with the `entrant` service and the nginx `location /e/api/`, `/e/account/`, `/e/` blocks from earlier tasks — so `http://localhost/e/{slug}` is the RR7 page, `http://localhost/e/account/signup` and `/login` are the RR7 account pages, and `http://localhost/e/{slug}/receipt/{id}` is the receipt. Backend API reachable at `http://localhost/api/`.
- Produces: `products/scheduler/e2e/tests/10-entrant-r11-evidence.spec.ts` with cases named exactly as the ledger rows below. Screenshots land in the repo-root `.playwright-mcp/` (gitignored — the spec is the committed artefact, the PNGs are local evidence for the R11 review).

Why these 18 claims cannot stay in pytest: they were assertions about *markup this backend no longer emits*. The successor surface is a browser. The CSP claim in particular is the one regression a unit test cannot see — the retired page shipped `script-src 'none'`; RR7 hydration forces at minimum `script-src 'self'`, and the nginx snippet (`frontend/security-headers.conf:50`) and any page-set header are **both** sent, with browsers enforcing the intersection (`frontend/nginx.conf:194-206`). A page that renders fine while silently dropping its own scripts is exactly what a green unit suite looks like.

- [ ] **Step 1: Write the failing test**

Extend the ledger. In `products/scheduler/tests/test_entries_migration_parity.py` add after `_SUBMIT`:

```python
_E2E = "e2e/tests/10-entrant-r11-evidence.spec.ts"
```

and add the final 18 rows:

```python
    # ---- render-level claims: they now need a browser, not a string ----
    "test_the_page_carries_its_own_security_headers": (
        _E2E, "the SSR pages carry their own security headers"),
    "test_the_page_now_allows_no_script_at_all": (
        _E2E, "the entry page emits zero CSP violations"),
    "test_the_page_is_built_for_a_390px_screen": (
        _E2E, "nothing overflows the 390px viewport"),
    "test_nothing_in_the_stylesheet_fixes_a_pixel_width": (
        _E2E, "nothing overflows the 1440px viewport either"),
    "test_the_page_carries_both_a_phone_layout_and_a_desktop_layout": (
        _E2E, "the entry page is captured at both co-equal widths"),
    "test_the_acknowledgment_checkbox_gates_submit_in_the_browser_too": (
        _E2E, "the acknowledgment checkbox gates submit in the browser too"),
    "test_the_form_offers_a_checkbox_per_open_event_carrying_the_player_index": (
        _E2E, "the form offers a checkbox per open event carrying the player index"),
    "test_the_gender_field_is_required_and_the_club_field_is_not": (
        _E2E, "the gender field is required and the club field is not"),
    "test_the_acknowledgment_notice_names_the_public_entrant_list": (
        _E2E, "the acknowledgment notice names the public entrant list"),
    "test_the_page_carries_no_challenge_widget": (
        _E2E, "the entry page carries no challenge widget"),
    "test_the_event_list_narrows_to_the_players_gender": (
        _E2E, "the event list narrows to the players gender"),
    "test_the_override_control_puts_every_event_back": (
        _E2E, "the override control puts every event back"),
    "test_an_event_already_chosen_is_never_hidden_by_the_filter": (
        _E2E, "an event already chosen is never hidden by the filter"),
    "test_no_gender_chosen_yet_offers_every_event": (
        _E2E, "no gender chosen yet offers every event"),
    "test_the_refresh_keeps_what_the_entrant_already_typed": (
        _E2E, "the form keeps what the entrant already typed"),
    "test_the_success_page_lists_every_entry_of_the_act_and_the_total": (
        _E2E, "the receipt lists every entry of the act and the total"),
    "test_the_success_page_carries_no_manage_code": (
        _E2E, "the receipt carries no manage code"),
    "test_the_success_page_points_at_my_entries_without_pretending_it_exists": (
        _E2E, "the receipt points at my entries without pretending it exists"),
```

Add one more assertion to that module, which is the pre-flight for the cut-over:

```python
def test_the_ledger_covers_every_superseded_test():
    """Completeness, asserted while the old file is still here to derive it
    from. This is the pre-flight for the cut-over (Task 31): a test that is
    neither migrated nor accounted for would otherwise be deleted with the
    file and nobody would know which claim went with it."""
    orphans = sorted(_test_names(_OLD) - set(SUPERSEDED))
    assert not orphans, (
        f"{len(orphans)} tests in {_OLD.name} have no ledger row — the "
        "cut-over would delete their claims:\n  " + "\n  ".join(orphans)
    )
```

Create `products/scheduler/e2e/tests/10-entrant-r11-evidence.spec.ts`:

```ts
/**
 * SP-PROGRAM-1 Phase 6 — R11 evidence for the entrant application.
 *
 * Successor to the eighteen render-level claims of
 * `products/scheduler/tests/test_entries_public_routes.py`, which asserted
 * things about markup the backend no longer emits (see
 * `tests/test_entries_migration_parity.py` for the row-by-row ledger).
 * Submission behaviour is unchanged; the serving context moved, and these
 * claims moved to the tier that can now see them.
 *
 * Two jobs:
 *
 * 1. **R11's two co-equal widths.** The retired page proved this with a
 *    string assertion — "there is a breakpoint, and nothing is sized in
 *    pixels" — because there was no browser in the loop. There is one now,
 *    so the claim is asserted directly: no element overflows the viewport
 *    at 390px or at 1440px. Screenshots of the entry page, the receipt,
 *    signup and login at both widths are the reviewable artefact; the last
 *    two did not exist before Phase 6 (finding F-E1-2-E1).
 * 2. **Zero CSP violations.** The one regression a unit test cannot see.
 *    The retired page shipped `script-src 'none'`; RR7 hydration forces at
 *    minimum `script-src 'self'`, and the nginx snippet
 *    (`frontend/security-headers.conf`) and any page-set header are BOTH
 *    sent, with the browser enforcing the intersection
 *    (`frontend/nginx.conf:194-206`). A page whose scripts are silently
 *    blocked still renders — server-side — and still passes every
 *    assertion about its HTML. Only the browser knows.
 *
 * Output: `.playwright-mcp/<name>-<width>.png` at the repo root. That
 * directory is gitignored and is the documented home for screenshots
 * (CLAUDE.md, "Known hazards") — an explicit path, never a bare filename.
 *
 * Run: `cd products/scheduler/e2e && npx playwright test tests/10-entrant-r11-evidence.spec.ts`
 * (the global-setup brings the docker stack up). NOT in the PR gate — e2e
 * boots Docker, and the gate is deliberately lean.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// CommonJS-style `__dirname` is undefined under Playwright's ESM loader
// (the e2e package is type: "module"). Re-derive from import.meta.
const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = resolve(__dirname, '../../../../.playwright-mcp');

const WIDTHS = [
  { label: '390px', width: 390, height: 844 },
  { label: '1440px', width: 1440, height: 900 },
] as const;

const API = '/api';
const CSRF = { 'X-ShuttleWorks-CSRF': '1' };
const PASSWORD = 'a perfectly fine passphrase';

type Seed = { slug: string; ms: string; ws: string; email: string };

/**
 * Collect CSP violations the way the browser reports them.
 *
 * Two channels because they catch different failures: the DOM event fires
 * for blocked inline/eval/src, and the console message is what a blocked
 * *external* script produces. Installed before the first navigation so the
 * very first document is covered.
 */
async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} blocked ${e.blockedURI}`,
      );
    });
  });
  page.on('console', (msg) => {
    if (msg.text().includes('Content Security Policy')) {
      violations.push(msg.text());
    }
  });
  return violations;
}

async function drainCsp(page: Page, consoleHits: string[]): Promise<string[]> {
  const fromDom = await page.evaluate(
    () => (window as unknown as { __csp?: string[] }).__csp ?? [],
  );
  return [...consoleHits, ...fromDom];
}

/** A workspace with an open entry page, two events, and one entrant. */
async function seed(page: Page): Promise<Seed> {
  const email = `entrant-${Date.now()}@example.com`;
  const out = await page.request.post(`${API}/tournaments`, {
    headers: CSRF,
    data: { name: 'Spring Open' },
  });
  expect(out.ok()).toBeTruthy();
  const tid = (await out.json()).id as string;

  const put = await page.request.put(`${API}/tournaments/${tid}/entry-page`, {
    headers: CSRF,
    data: {
      slug: 'spring-open',
      isOpen: true,
      introText: 'All welcome.',
      regulationsText: 'Play fair. Bring your own shuttles.',
      feeSchedule: { '1': 4000, '2': 5500 },
      paymentInstructions: 'Zelle to treasurer@club.example.',
      venueName: 'Riverside Sports Hall',
      venueAddress: '12 Mill Lane',
    },
  });
  expect(put.ok()).toBeTruthy();

  const events: Record<string, string> = {};
  for (const [key, code, discipline, gender] of [
    ['ms', 'MS', "Men's Singles", 'M'],
    ['ws', 'WS', "Women's Singles", 'F'],
  ] as const) {
    const res = await page.request.post(`${API}/tournaments/${tid}/entry-events`, {
      headers: CSRF,
      data: { code, discipline, entryType: 'singles', genderConstraint: gender },
    });
    expect(res.ok()).toBeTruthy();
    events[key] = (await res.json()).id as string;
  }

  return { slug: 'spring-open', ms: events.ms, ws: events.ws, email };
}

/** Sign up and log in through the RR7 account pages — the F-E1-2-E1 closure. */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/e/account/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /create account|sign up/i }).click();

  await page.goto('/e/account/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/e\//);
}

/** No horizontal scrollbar: the mechanical half of R11's "two co-equal widths". */
async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`)
      .slice(0, 5);
  });
  expect(overflow, 'elements wider than the viewport').toEqual([]);
});
```

*(remove the stray `)` — the helper ends with a plain `}`)*

```ts
test.beforeAll(() => {
  mkdirSync(shotDir, { recursive: true });
});

test.describe('entrant app — R11 evidence', () => {
  test('the entry page is captured at both co-equal widths', async ({ page }) => {
    const s = await seed(page);
    for (const { label, width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto(`/e/${s.slug}`);
      await expect(page.getByRole('heading', { name: 'Spring Open' })).toBeVisible();
      await page.screenshot({
        path: resolve(shotDir, `entrant-entry-page-${label}.png`),
        fullPage: true,
      });
    }
  });

  test('nothing overflows the 390px viewport', async ({ page }) => {
    const s = await seed(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/e/${s.slug}`);
    await expectNoOverflow(page);
  });

  test('nothing overflows the 1440px viewport either', async ({ page }) => {
    const s = await seed(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/e/${s.slug}`);
    await expectNoOverflow(page);
  });

  test('the entry page emits zero CSP violations', async ({ page }) => {
    const consoleHits = await watchCsp(page);
    const s = await seed(page);
    await page.goto(`/e/${s.slug}`);
    // Hydration is what the retired page's `script-src 'none'` forbade —
    // wait for it, or a blocked bundle looks like a page that simply had
    // no script to run.
    await expect(page.getByRole('heading', { name: 'Spring Open' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await drainCsp(page, consoleHits)).toEqual([]);
  });

  test('the SSR pages carry their own security headers', async ({ page }) => {
    const s = await seed(page);
    for (const path of [`/e/${s.slug}`, '/e/account/signup', '/e/account/login']) {
      const res = await page.goto(path);
      const headers = res!.headers();
      expect(headers['content-security-policy'], path).toContain(
        "frame-ancestors 'none'",
      );
      expect(headers['x-content-type-options'], path).toBe('nosniff');
      expect(headers['cache-control'], path).toContain('no-store');
    }
  });

  test('the signup and login pages are captured at both widths', async ({ page }) => {
    for (const { label, width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      for (const [name, path] of [
        ['signup', '/e/account/signup'],
        ['login', '/e/account/login'],
      ] as const) {
        await page.goto(path);
        await expect(page.getByLabel('Email')).toBeVisible();
        await expectNoOverflow(page);
        await page.screenshot({
          path: resolve(shotDir, `entrant-${name}-${label}.png`),
          fullPage: true,
        });
      }
    }
  });

  test('the entry page carries no challenge widget', async ({ page }) => {
    const s = await seed(page);
    await page.goto(`/e/${s.slug}`);
    // R10: Turnstile at signup, session at submit. A puzzle in front of a
    // route that already requires an account charges every honest entrant.
    await expect(page.locator('.cf-turnstile')).toHaveCount(0);
  });

  test('the form offers a checkbox per open event carrying the player index', async ({
    page,
  }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    await expect(page.locator(`input[name="events"][value="0:${s.ms}"]`)).toHaveCount(1);
    await expect(page.locator(`input[name="events"][value="0:${s.ws}"]`)).toHaveCount(1);
    await expect(page.locator(`input[name="events"][value="1:${s.ms}"]`)).toHaveCount(1);
  });

  test('the acknowledgment checkbox gates submit in the browser too', async ({
    page,
  }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    await expect(page.locator('input[name="acknowledged"]')).toHaveAttribute(
      'required',
      '',
    );
  });

  test('the acknowledgment notice names the public entrant list', async ({ page }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    // Notice belongs at the point of consent, not in a policy page nobody
    // opens (Q4).
    await expect(page.getByText(/entrant list/i)).toBeVisible();
  });

  test('the gender field is required and the club field is not', async ({ page }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    await expect(page.locator('select[name="gender"]').first()).toHaveAttribute(
      'required',
      '',
    );
    await expect(page.locator('input[name="club"]').first()).not.toHaveAttribute(
      'required',
      '',
    );
  });

  test('no gender chosen yet offers every event', async ({ page }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    // Nothing to filter on is not a mismatch with everything: an entrant
    // who has typed nothing must see the whole list.
    await expect(page.locator(`input[name="events"][value="0:${s.ms}"]`)).toBeVisible();
    await expect(page.locator(`input[name="events"][value="0:${s.ws}"]`)).toBeVisible();
  });

  test('the event list narrows to the players gender', async ({ page }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    await page.locator('select[name="gender"]').first().selectOption('F');
    await expect(page.locator(`input[name="events"][value="0:${s.ms}"]`)).toHaveCount(0);
    await expect(page.locator(`input[name="events"][value="0:${s.ws}"]`)).toBeVisible();
  });

  test('the override control puts every event back', async ({ page }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    await page.locator('select[name="gender"]').first().selectOption('F');
    await page.locator('input[name="showAllEvents"]').check();
    // Back, and MARKED — hiding that a mismatch is a mismatch would be
    // worse than showing it (Q14 §5).
    await expect(page.locator(`input[name="events"][value="0:${s.ms}"]`)).toBeVisible();
    await expect(page.getByText(/not usually open/i).first()).toBeVisible();
  });

  test('an event already chosen is never hidden by the filter', async ({ page }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    // Tick MS, then set gender F. A selection that vanishes off the screen
    // is the silent drop R14 §4 refuses to make about caps, by a side door.
    await page.locator(`input[name="events"][value="0:${s.ms}"]`).check();
    await page.locator('select[name="gender"]').first().selectOption('F');
    await expect(page.locator(`input[name="events"][value="0:${s.ms}"]`)).toBeChecked();
  });

  test('the form keeps what the entrant already typed', async ({ page }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    await page.locator('input[name="playerName"]').first().fill('Alice Chen');
    await page.locator('input[name="club"]').first().fill('Riverside BC');
    await page.getByRole('button', { name: /update events and total/i }).click();
    await expect(page.locator('input[name="playerName"]').first()).toHaveValue(
      'Alice Chen',
    );
    await expect(page.locator('input[name="club"]').first()).toHaveValue('Riverside BC');
  });

  test('the receipt lists every entry of the act and the total', async ({ page }) => {
    const consoleHits = await watchCsp(page);
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    await page.locator('input[name="playerName"]').first().fill('Alice Chen');
    await page.locator('select[name="gender"]').first().selectOption('F');
    await page.locator('input[name="showAllEvents"]').check();
    await page.locator(`input[name="events"][value="0:${s.ws}"]`).check();
    await page.locator(`input[name="events"][value="0:${s.ms}"]`).check();
    await page.locator('input[name="acknowledged"]').check();
    await page.getByRole('button', { name: /submit entry/i }).click();

    await expect(page).toHaveURL(/\/receipt\//);
    await expect(page.getByText('WS')).toBeVisible();
    await expect(page.getByText('MS')).toBeVisible();
    await expect(page.getByText('55.00')).toBeVisible();
    // A POST/redirect/GET target: reloading it must not re-post.
    await page.reload();
    await expect(page.getByText('55.00')).toBeVisible();
    expect(await drainCsp(page, consoleHits)).toEqual([]);

    for (const { label, width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await expectNoOverflow(page);
      await page.screenshot({
        path: resolve(shotDir, `entrant-receipt-${label}.png`),
        fullPage: true,
      });
    }
  });

  test('the receipt carries no manage code', async ({ page }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    await page.locator('input[name="playerName"]').first().fill('Alice Chen');
    await page.locator('select[name="gender"]').first().selectOption('F');
    await page.locator(`input[name="events"][value="0:${s.ws}"]`).check();
    await page.locator('input[name="acknowledged"]').check();
    await page.getByRole('button', { name: /submit entry/i }).click();
    await expect(page).toHaveURL(/\/receipt\//);
    // R10 retired the capability token. Nothing here mints, stores or
    // prints a credential.
    await expect(page.getByText(/keep this code/i)).toHaveCount(0);
  });

  test('the receipt points at my entries without pretending it exists', async ({
    page,
  }) => {
    const s = await seed(page);
    await signIn(page, s.email);
    await page.goto(`/e/${s.slug}`);
    await page.locator('input[name="playerName"]').first().fill('Alice Chen');
    await page.locator('select[name="gender"]').first().selectOption('F');
    await page.locator(`input[name="events"][value="0:${s.ws}"]`).check();
    await page.locator('input[name="acknowledged"]').check();
    await page.getByRole('button', { name: /submit entry/i }).click();
    await expect(page).toHaveURL(/\/receipt\//);
    // Says where the entry lives; does NOT link a page this phase did not
    // build — a dead link is a worse answer than a sentence.
    await expect(page.getByText(/my entries/i)).toBeVisible();
    await expect(page.locator('a[href^="/e/account"]')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_entries_migration_parity.py`

Expected: FAIL — before the spec file exists, `test_every_successor_named_in_the_ledger_exists` reports 18 missing rows pointing at `e2e/tests/10-entrant-r11-evidence.spec.ts`, and `test_the_ledger_covers_every_superseded_test` passes only once all 90 rows are present (run it first without the 18 rows to see it name them).

- [ ] **Step 3: Write minimal implementation**

The spec file above *is* the implementation. Bring the stack up and run it:

```bash
cd "$(git rev-parse --show-toplevel)" && BACKEND_HOST_PORT=8600 make scheduler
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd products/scheduler && pytest tests/test_entries_migration_parity.py
cd products/scheduler/e2e && npx playwright test tests/10-entrant-r11-evidence.spec.ts
```

Expected: PASS — all three parity assertions green (90/90 rows, every successor found), and 19 Playwright cases green with eight PNGs written to `.playwright-mcp/`: `entrant-entry-page-{390px,1440px}.png`, `entrant-receipt-{390px,1440px}.png`, `entrant-signup-{390px,1440px}.png`, `entrant-login-{390px,1440px}.png`. Confirm the CSP result is real by temporarily adding `<script>1</script>` inline to the entry route's rendered output — `the entry page emits zero CSP violations` must go red — then remove it.

- [ ] **Step 5: Commit**
```bash
git add products/scheduler/e2e/tests/10-entrant-r11-evidence.spec.ts products/scheduler/tests/test_entries_migration_parity.py
git commit -m "test(entrant): R11 evidence — dual-width capture and zero CSP violations

The last eighteen tests of tests/test_entries_public_routes.py are
superseded here. They asserted properties of markup this backend no longer
emits — the breakpoint, the absence of a fixed pixel width, the gender
filter, the acknowledgment gate, the receipt — proved with string
assertions because there was no browser in the loop. There is one now, so
the claims are asserted directly: no element overflows the viewport at
390px or 1440px, and the form behaves as it did.

Submission behaviour is unchanged; only the serving context moves from
f-string HTML to RR7 + a JSON route.

The CSP assertion is new and is the point of the file. The retired page
shipped script-src 'none'; RR7 hydration forces at minimum script-src
'self', the nginx snippet and any page-set header are both sent, and the
browser enforces the intersection (frontend/nginx.conf:194-206). A page
whose scripts are silently blocked renders server-side and passes every
assertion about its HTML — only the browser knows. Verified non-vacuous by
injecting an inline script and watching it go red.

Screenshots land in the gitignored .playwright-mcp/ under explicit paths,
per the CLAUDE.md bare-filename hazard. Signup and login are captured for
the first time: they did not exist before this phase (finding F-E1-2-E1).

tests/test_entries_migration_parity.py gains
test_the_ledger_covers_every_superseded_test — completeness, asserted
while the old file is still here to derive it from. It is the pre-flight
for the cut-over."
```

---

### Task 31: The cut-over — delete the HTML routes and the CSRF exemption in one commit

**Files:**
- Modify: `products/scheduler/backend/api/entries_public.py` — delete `_CSP` (:162-186), `_e` (:192-198), `_CSS` (:334-380), `_document` (:405-414), `_respond` (:417-432), `_money` (:435-439), `_page_markup` (:442-549), `_form_markup` (:552-631), `_total_markup` (:634-670), `_player_label` (:673-676), `_timeline_markup` (:702-738), `_venue_markup` (:752-765), `_org_markup` (:768-778), `_money_markup` (:810-846), `_player_block` (:849-983), `_refusal` (:986-1015), `_success_markup` (:1018-1060), `entry_page` (:1094-1109), `submit_entry` (:1112-1264), `_parse_players` (:1267-1309), `_echo` (:1324-1360)
- Modify: `products/scheduler/backend/app/main.py:236-242` (the `_FORM_CSRF_ROUTES` comment + constant), `:265-281` (the exemption paragraph of the `csrf_middleware` docstring), `:283-289` (the `and not _FORM_CSRF_ROUTES.match(...)` clause), `:405-419` (the `include_router` comment)
- Modify: `products/scheduler/tests/test_csrf_cookie_registry.py:225-268`
- Modify: `products/scheduler/tests/test_auth_surface.py:54-61`, `:96-101`, `:126-137`, `:410-458`
- Modify: `products/scheduler/tests/test_cross_principal_sessions.py:58-70`
- Modify: `products/scheduler/tests/test_entries_config_routes.py:153-162`, `:302-317`
- Modify: `products/scheduler/tests/test_entries_migration_parity.py` (flip the old-file guards)
- Delete: `products/scheduler/tests/test_entries_public_routes.py`
- Test: `products/scheduler/tests/test_csrf_cookie_registry.py`, `products/scheduler/tests/test_entries_migration_parity.py`

**Interfaces:**
- Consumes: everything Tasks 28–30 produced (all 90 claims have live successors), plus the middleware's two enumerated channels from earlier tasks.
- Produces: an `app/main.py` with **zero path-based CSRF exemptions** — `_FORM_CSRF_ROUTES` no longer exists as a name. An `api/entries_public.py` that keeps `_resolve`, `_events`, `_event_is_open`, `_entrants`, `_entry_counts`, `_is_age_bracketed`, `_lookup_event`, `_year`, `_utcnow`, `_aware`, `_not_found`, `_optional_entrant` and the JSON routes, and imports neither `html` nor `HTMLResponse`.

**This is the one-way door, and it is one commit, deliberately.** There is no two-implementation window available: the exemption cannot be deleted while `POST /e/{slug}/submit` still exists (it would 403 every real entrant), and the route cannot be deleted while the exemption still names it (the exemption would be a live path-based hole pointing at nothing, which is worse than the route). Strangler Fig does not apply — the strangling already happened, in Tasks 28–30, where the successor surface was stood up and proven alongside the incumbent. This commit removes the incumbent, and it removes the exemption in the same breath because they are the same fact.

- [ ] **Step 1: Write the failing test**

Rewrite the exemption section of `products/scheduler/tests/test_csrf_cookie_registry.py`, replacing lines 225-268 (the section header comment, `test_the_form_csrf_exemption_matches_exactly_one_route_shape`, and `test_the_exempt_route_still_refuses_a_write_with_no_proof_at_all`) with:

```python
# ---- 3. Zero exemptions, and the two channels that replaced the one ----
#
# SP-E1-2 Phase C carved a single route out of the header check: ``POST
# /e/{slug}/submit``, because it was a native HTML form post and a form
# cannot attach a custom header. Phase 6 **deleted the exemption rather
# than narrowing or renaming it** (design §3). The route it named ceases to
# exist, and the proof it substituted — a double-submit token derived from
# the session cookie — was promoted out of the route into a second
# enumerated channel the middleware itself checks (ruling R8-B).
#
# The difference is the whole point. A path-based exemption is a list that
# grows, and every entry on it is a route the middleware does not look at.
# Two enumerated channels are a rule: every cookie-carrying write proves
# itself, by header or by token, and there is no third answer.
#
# So the assertion inverts from "the exemption matches one route shape" to
# "there are no path-based exemptions at all", derived from the source —
# because a regex that is deleted and later re-added under another name
# would pass any behavioural test written against today's routes.


def test_the_app_declares_zero_path_based_csrf_exemptions():
    """**The inverted control.** Derived from ``app/main.py``'s source:
    the CSRF middleware may not skip a write because of its path.

    Break it to prove it is not vacuous: re-add
    ``_SOMETHING = re.compile(r"^/e/[^/]+/submit$")`` next to
    ``csrf_middleware`` and this fails by line.
    """
    import ast
    import inspect

    from app import main as app_main

    source = inspect.getsource(app_main)
    tree = ast.parse(source)

    # Any module-level name bound to a compiled pattern is a path list by
    # construction — there is no other reason for one to live here.
    patterns = [
        f"line {node.lineno}: {node.targets[0].id}"
        for node in tree.body
        if isinstance(node, ast.Assign)
        and isinstance(node.targets[0], ast.Name)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Attribute)
        and node.value.func.attr == "compile"
    ]
    assert not patterns, (
        "app/main.py declares path patterns next to the CSRF middleware. "
        "Phase 6 deleted the last path-based exemption; a write proves "
        "itself by header or by cookie-derived token, never by URL:\n  "
        + "\n  ".join(patterns)
    )
    assert "_FORM_CSRF_ROUTES" not in source


def test_a_cookie_carrying_write_with_no_proof_at_all_is_still_refused(client):
    """The behavioural half, on the route that replaced the exempt one."""
    from app.config import settings

    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, "an-entrant-token")

    r = client.post("/e/api/submit/some-slug", data={"playerName": "Alice"})

    assert r.status_code in (401, 403, 404)
    assert r.status_code != 303


def test_the_retired_html_routes_are_gone(client):
    """The cut-over, asserted where route registration is actually visible.

    Newer FastAPI keeps each ``include_router`` as a nested
    ``_IncludedRouter`` rather than flattening onto ``app.routes``, so the
    OpenAPI document is the assertion surface (CLAUDE.md, known hazards).
    """
    from app.main import app

    paths = app.openapi()["paths"]
    assert "/e/{slug}" not in paths
    assert "/e/{slug}/submit" not in paths
    # Negative control: the surface that replaced them is registered.
    assert "get" in paths["/e/api/page/{slug}"]
    assert "post" in paths["/e/api/submit/{slug}"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && pytest tests/test_csrf_cookie_registry.py -k "zero_path_based or retired_html_routes"`

Expected: FAIL, both. `test_the_app_declares_zero_path_based_csrf_exemptions` fails with `AssertionError: app/main.py declares path patterns next to the CSRF middleware … line 242: _FORM_CSRF_ROUTES`. `test_the_retired_html_routes_are_gone` fails on `assert "/e/{slug}" not in paths`.

- [ ] **Step 3: Write minimal implementation**

Run the pre-flight first — nothing is deleted until the ledger says every claim has a successor:

```bash
cd products/scheduler && pytest tests/test_entries_migration_parity.py -v
```

All three must be green. Then, in one working tree:

**a. `backend/app/main.py`** — delete lines 236-242 (the `# Routes that prove CSRF their own way…` comment through `_FORM_CSRF_ROUTES = re.compile(...)`) and delete the exemption paragraph from the `csrf_middleware` docstring (lines 265-281, `**One route is exempt…` through `…pins that it is the only one.`), replacing it with:

```python
    **There are no path-based exemptions** (SP-PROGRAM-1 Phase 6, ruling
    R8-B). SP-E1-2 carved one out for ``POST /e/{slug}/submit`` — a native
    form post on a page with ``script-src 'none'``, which cannot attach a
    custom header. Phase 6 deleted the route *and* the exemption in the
    same commit, because they were the same fact: the proof that route
    substituted is now a **second enumerated channel** this middleware
    checks itself. A cookie-carrying write is accepted with the custom
    header **or** with a valid cookie-derived double-submit token, so an
    unhydrated form still submits and no route is skipped for being
    itself. ``tests/test_csrf_cookie_registry.py`` derives from this
    source that the exemption list is empty and stays empty.
```

Change the condition (lines 283-289) to drop the last clause:

```python
    if (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and any(name in request.cookies for name in settings.session_cookie_names)
        and not await _csrf_proof_presented(request)
    ):
```

— where `_csrf_proof_presented` is the two-channel helper from the earlier middleware task. If `re` is now unused in `app/main.py`, remove the import (ruff `F401` gates on this). Finally, replace the stale paragraph at `:405-419` describing ``GET /e/{slug}`` with:

```python
# Entries, public surface: registered WITHOUT the auth dep, following the
# display public_router precedent below. Since Phase 6 the routes here are
# JSON only — ``GET /e/api/page/{slug}`` is a public read of workspace
# data (a poster URL, not a capability URL) and the write routes carry
# ``get_current_entrant``. The HTML page they used to serve is now the RR7
# app at ``/e/{slug}``, reached through nginx and never through FastAPI.
# Its guards live in the module itself (strict projection, uniform 404 for
# an unknown or closed slug, per-IP throttle, the global body cap) and
# every session-free route in it is named individually in
# tests/test_auth_surface.py with the reason it must be reachable.
```

**b. `backend/api/entries_public.py`** — delete the 21 symbols listed in **Files** above, and update the module docstring's "Rendering (ruling D3)" and "Two co-equal widths" sections to say the rendering moved:

```
**Rendering moved out (SP-PROGRAM-1 Phase 6, ruling R8).** This module
shipped an HTML page built from f-strings, and called itself throwaway
while doing it. Phase 6 spent the program's single sanctioned
new-dependency exception on React Router 7 and the page moved there; what
is left here is the projection and the write, as JSON. The escaping
discipline moved with the rendering — there is no interpolation left to
escape, which is why ``html`` is no longer imported.
```

Then remove the now-unused imports: `html`, `HTMLResponse`, and `normalize_fee_schedule` if the JSON page route already reads it (check with `ruff check products/scheduler/backend/api/entries_public.py`).

**c. Delete the superseded file and fix its four collateral readers.**

```bash
git rm products/scheduler/tests/test_entries_public_routes.py
```

- `tests/test_auth_surface.py` — the `("GET", "/e/{slug}")` allowlist entry (`:96-101`) becomes `("GET", "/e/api/page/{slug}")` with its reason text unchanged apart from the route name; the note at `:54-61` gains a line saying the HTML route was retired in Phase 6 and the JSON projection took its allowlist slot; the paragraph at `:126-137` (which explains the *absence* of `POST /e/{slug}/submit`) is retargeted to `POST /e/api/submit/{slug}` and repoints its cross-reference at `tests/test_entries_submit_api.py::test_an_anonymous_submit_is_rejected`; `test_the_entry_page_answers_an_anonymous_caller` (`:361`) fetches `/e/api/page/{slug}` and asserts `r.json()["tournament"]["name"] == "Club A Open"`; `_post_entry` (`:342-358`) posts to `/e/api/submit/{slug}` with `follow_redirects=False`; `test_the_same_submit_with_an_entrant_session_is_accepted` (`:423`) reads the token from `client.get(f"/e/api/page/{...}").json()["viewer"]["formCsrf"]` instead of the `re.search` over markup, and asserts `303`.
- `tests/test_cross_principal_sessions.py:69` — `{("POST", "/e/{slug}/submit")}` becomes `{("POST", "/e/api/submit/{slug}"), ("POST", "/e/api/quote/{slug}"), ("GET", "/e/api/config")}`, with the existing comment extended to say the quote route is R8-C session-gated and therefore an entrant-reachable route by design.
- `tests/test_csrf_cookie_registry.py` — already rewritten in Step 1.
- `tests/test_entries_config_routes.py:153-162` and `:302-317` — `client.get("/e/spring-open")` becomes `client.get("/e/api/page/spring-open")` and the two text assertions become projection reads: `r.json()["tournament"]["name"] == "Entries Config"`, `r.json()["regulations"]["text"] == "Play fair."`; and `payload["feeSchedule"] == {"1": 4000, "2": 5500}`, `payload["paymentInstructions"] == "Cash at check-in."`, `payload["venue"]["name"] == "Riverside Sports Hall"`.

**d. `tests/test_entries_migration_parity.py`** — the old file is gone, so its two derived guards flip:

```python
def test_the_superseded_file_is_gone(_old=_OLD):
    """The cut-over, from the ledger's side. Before deletion this module
    asserted that every row named a real test in that file and that every
    test in it had a row; both were green at the moment it was removed
    (Task 31's pre-flight). What is left to hold is that nothing brought
    it back — a resurrected file would mean two implementations of the
    same surface, which is precisely what the phase forbade."""
    assert not _old.exists(), (
        f"{_old} is back. The HTML entry surface it tested was deleted in "
        "SP-PROGRAM-1 Phase 6; its 90 claims live in the successors named "
        "in SUPERSEDED."
    )


def test_every_successor_named_in_the_ledger_exists():
    """Unchanged, and now the ledger's whole job: the 90 migrated claims
    must still be somewhere. Deleting a successor deletes a claim, and
    this is what says so by name."""
    ...  # body unchanged
```

Delete `test_every_row_names_a_real_superseded_test` and `test_the_ledger_covers_every_superseded_test` — both derive from a file that no longer exists. They are named in the commit message below.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd products/scheduler && pytest tests/test_csrf_cookie_registry.py tests/test_entries_migration_parity.py tests/test_auth_surface.py tests/test_cross_principal_sessions.py tests/test_entries_config_routes.py tests/test_entries_page_api.py tests/test_entries_submit_api.py
ruff check products/scheduler/backend
```

Expected: PASS on all seven test modules, `ruff` clean (the deleted `html`/`HTMLResponse`/`re` imports would otherwise be `F401`). Prove the new control is not vacuous: re-add `_FORM_CSRF_ROUTES = re.compile(r"^/e/[^/]+/submit$")` to `app/main.py`, confirm `test_the_app_declares_zero_path_based_csrf_exemptions` goes red naming its line, then remove it again.

- [ ] **Step 5: Commit**
```bash
git add -A products/scheduler/backend/api/entries_public.py products/scheduler/backend/app/main.py products/scheduler/tests/
git commit -m "feat(entries)!: retire the HTML entry surface and delete the CSRF exemption

The cut-over, in one commit and deliberately so. GET /e/{slug} and POST
/e/{slug}/submit are removed, with _page_markup, _form_markup,
_total_markup, _player_block, _refusal, _success_markup, _document,
_respond, _money, _e, _CSS, _CSP, _parse_players and _echo. Staying
Python-side: _resolve, _entrants, _entry_counts, check_policy,
compute_fee_total, the submission service and its UNIQUE index.

There was no two-implementation window available. _FORM_CSRF_ROUTES could
not be deleted while the route it named still existed — every real entrant
would 403 — and the route could not be deleted while the pattern still
named it, leaving a path-based hole pointing at nothing. They are the same
fact, so they go in the same commit. The strangling already happened, in
the three commits before this one, which stood the successor surface up
and proved it alongside the incumbent.

In its place the middleware has two enumerated channels (ruling R8-B): the
custom header, or a valid cookie-derived double-submit token, so an
unhydrated form still submits and no route is skipped for being itself.

Tests edited or deleted, each with the ruling that supersedes it:

- DELETED tests/test_entries_public_routes.py (90 tests). Superseded by
  tests/test_entries_page_api.py (25), tests/test_entries_submit_api.py
  (47) and e2e/tests/10-entrant-r11-evidence.spec.ts (18). Ruling: design
  §9 — migrated, not deleted; submission behaviour is unchanged and only
  the serving context moves. The row-by-row ledger is
  tests/test_entries_migration_parity.py, and it was green on both
  directions immediately before the file was removed.
- REWROTE test_csrf_cookie_registry.py::test_the_form_csrf_exemption_matches_exactly_one_route_shape
  into test_the_app_declares_zero_path_based_csrf_exemptions. Ruling:
  design §3 — the exemption is deleted, not narrowed, so the control
  inverts from 'it matches one shape' to 'there are none', derived from
  source. Verified non-vacuous by re-adding the pattern.
- REWROTE test_csrf_cookie_registry.py::test_the_exempt_route_still_refuses_a_write_with_no_proof_at_all
  into test_a_cookie_carrying_write_with_no_proof_at_all_is_still_refused,
  aimed at POST /e/api/submit/{slug}. Ruling: the route it named is gone.
- DELETED test_entries_migration_parity.py::test_every_row_names_a_real_superseded_test
  and ::test_the_ledger_covers_every_superseded_test, replaced by
  ::test_the_superseded_file_is_gone. Ruling: both derived from a file
  this commit removes; completeness was asserted for the last time as this
  commit's pre-flight.
- EDITED test_auth_surface.py (allowlist entry, the absent-route
  paragraph, _post_entry, and the two submit tests) and
  test_cross_principal_sessions.py ENTRANT_REACHABLE. Ruling: the public
  surface's shape did not change, its route names did — GET /e/api/page/
  {slug} takes the allowlist slot, and the quote route is entrant-
  reachable by ruling R8-C.
- EDITED test_entries_config_routes.py::test_the_page_reaches_the_public_slug_route
  and ::test_a_page_configured_here_prices_and_renders_publicly to read the
  projection instead of scraping HTML. Ruling: same claim — a page
  authored through the API is live at its public address — asserted at the
  seam that still exists."
```

---

### Task 32: Record the phase, log the accepted risk, and run the full gate

**Files:**
- Modify: `docs/programs/ENTRIES_PROGRESS.md` (phase table row 6 + a new Phase 6 section at the end)
- Modify: `docs/audits/debt-log.md` (append the §3 accepted risk)
- Test: `products/scheduler/tests/test_entries_migration_parity.py` (already green — re-run as part of the gate)

**Interfaces:**
- Consumes: the finished state of Tasks 28–31 and of the earlier tasks in this phase (the RR7 app, the nginx blocks, the compose `entrant` service).
- Produces: no code. The two documents are the phase's durable record, and CODE_HEALTH #8 puts them in the same change as the work, not after it.

- [ ] **Step 1: Write the failing test**

The gate is the test here, and the failing state is measurable: capture the baseline the phase must beat.

```bash
cd "$(git rev-parse --show-toplevel)"
git stash list > /dev/null
cd products/scheduler && pytest -q 2>&1 | tail -3
```

Record the number. Against `main` (before this phase) the backend suite reported `1018 passed, 66 skipped` at the Phase 0 baseline in `docs/programs/ENTRIES_PROGRESS.md`. After this phase the pytest count must be **strictly up**: the 90 migrated tests come back as 25 + 47 in pytest, plus 4 new idempotency/CSRF-trap tests, plus 3 rewritten registry tests, plus 3 parity tests, minus the 90 deleted — and the 18 render claims move to Playwright, which pytest does not count. A net-down pytest count is the failure this step exists to catch: it means a claim was dropped rather than moved.

Then write the two documents.

Append to the end of `docs/programs/ENTRIES_PROGRESS.md`:

```markdown
## SP-PROGRAM-1 Phase 6 — the entrant application: DONE (2026-08-07)

**Design:** `docs/superpowers/specs/2026-08-07-phase6-entrant-app-design.md`
(approved by the owner 2026-08-07; rulings R8, R8-A, R8-B, R8-C).
**Executes:** Phase 6 steps 1, 2 and 4. **Step 3 (email) is deferred entirely.**

### What shipped

- **The entrant surface is a real application.** React Router 7 in framework
  mode at `products/scheduler/entrant/`, served same-origin with the API
  (R8-A): nginx routes `/e/api/` and `/e/account/` to FastAPI and `/e/…` to
  node, so there is no CORS, no cookie widening and no preflight anywhere in
  the flow. R8 spends SP-PROGRAM-1 rule 4's single sanctioned
  new-dependency exception.
- **F-E1-2-E1 is closed.** First-class HTML signup and login pages exist. The
  E1-2 walkthrough recorded that the logged-out page *named* `/e/account/*`
  and shipped no form, so no human could self-serve an account; the demo used
  API calls and cookie injection. Both pages are R11 surfaces with their own
  dual-width screenshots.
- **The throwaway HTML module is retired**, and the path-based CSRF exemption
  with it, in one commit — they were the same fact, since the exemption could
  not be deleted while the route it named still existed. `_FORM_CSRF_ROUTES`
  is gone; a cookie-carrying write now proves itself with the custom header
  **or** a cookie-derived double-submit token (R8-B), two enumerated channels
  rather than one channel and an escape hatch.
- **`UNIQUE (tournament_id, idempotency_key)` is reachable for the first
  time.** A native form cannot send a header, so a real entrant's key was
  always NULL. The loader mints it and carries it as a field, which also made
  a latent defect live: `submissions.replay` scoped by `(tournament_id, key)`
  only, so a guessed key returned another entrant's receipt. Scoped to the
  account, with a negative control and a non-vacuity control.

### The ~90 tests: migrated, not deleted

`tests/test_entries_public_routes.py` (90 tests, 1510 lines) was removed at the
cut-over. Every claim has a named successor, held by
`tests/test_entries_migration_parity.py`:

| Group | Successor home | Count |
|---|---|---|
| page projection, entrant list, IA cards, fee schedule, escaping, uniform 404, viewer block, registration | `tests/test_entries_page_api.py` | 25 |
| session gate, CSRF channels, acknowledgment, policy, fees, throttle, idempotency, soft flags, cross-tenant, body cap | `tests/test_entries_submit_api.py` | 47 |
| render-level: two widths, CSP, gender filter, acknowledgment gate, receipt | `e2e/tests/10-entrant-r11-evidence.spec.ts` | 18 |

The ruling in every case: **submission behaviour is unchanged; only the
serving context moves from f-string HTML to RR7 + a JSON route.**

### R11 evidence

Eight screenshots in `.playwright-mcp/` (gitignored — the spec is the
committed artefact): entry page, receipt, signup and login, at 390px and
1440px. Plus a Playwright assertion of **zero CSP violations** on every SSR
page, verified non-vacuous by injecting an inline script. That is the one
regression a unit test cannot see: the retired page shipped
`script-src 'none'`, RR7 hydration forces at minimum `script-src 'self'`, and
the nginx snippet and any page-set header are both sent with the browser
enforcing the intersection.

### The exit gate: the email clause stays OPEN, by ruling

Phase 6's exit gate includes "a real verification-class email lands in a real
inbox". **It is not met, and it is recorded as deferred rather than quietly
dropped** (design §1, §10.6). Step 3 needs an SMTP seam, a provider and DNS;
Phase 2 (deploy on `wongworks.dev`) is not done, and Amendment A1 forbids the
DNS work the step requires. The clause is carried, not closed. Phase 6 is DONE
against steps 1, 2 and 4 only, and this paragraph is the record that the
difference is deliberate.

### Accepted risk, logged

Same origin (R8-A) fuses two blast radii that were previously separate:
script anywhere on the origin can read the `_csrf` field out of the DOM, and
can attach `X-ShuttleWorks-CSRF: 1` itself and drive `/api/*` with the
httponly `sw_session`. Taken knowingly; in-phase mitigations are a
per-response nonce CSP on the SSR tier, no user-supplied HTML in loader
output, and the resolution of the CSP-duplication tension. **Named exit:
Phase 11's origin split.** Logged to `docs/audits/debt-log.md`.

### Deliberately not done

Email (above); a `play.*` subdomain (R8-A — Phase 11); E2 lifecycle
(withdrawals, partner confirmation, payment state, "my entries" — Phase 7);
F-E1 (entry events map onto a Meet division, not a slot — still open, not
patched ad hoc). **Nothing touched the Cloudflare dashboard, DNS, tunnel
config or Access** (Amendment A1): compose and nginx changes were written and
validated locally with `docker compose config` and `nginx -t` only.
```

Update the phase table row (`docs/programs/ENTRIES_PROGRESS.md:26`):

```markdown
| 6 | play.* scaffold + email | **steps 1/2/4 DONE 2026-08-07**; step 3 (email) deferred entirely | exit gate's "a real verification-class email lands in a real inbox" clause stays **OPEN by ruling** — see the Phase 6 entry |
```

Append to `docs/audits/debt-log.md`:

```markdown
- **2026-08-07 · SP-PROGRAM-1 Phase 6 accepted risk — same origin fuses the
  entrant and operator blast radii.** Ruling R8-A puts the entrant app, the
  operator SPA and `/api/` on one public hostname, and RR7 hydration forces at
  minimum `script-src 'self'` on it — where the retired page had
  `script-src 'none'` (`api/entries_public.py`, now deleted). Two consequences,
  both accepted knowingly rather than overlooked: script injected anywhere on
  that origin can read the `_csrf` hidden field out of the DOM (double-submit
  is same-origin-readable by construction) and submit as the entrant; and,
  worse, it can attach `X-ShuttleWorks-CSRF: 1` itself and drive `/api/*` with
  the httponly `sw_session`. Two blast radii that were previously separate are
  now one. **In-phase mitigations shipped:** a per-response nonce CSP on the
  SSR tier, no user-supplied HTML in any loader output, and the resolution of
  the CSP-duplication tension previously recorded at `frontend/nginx.conf`
  (snippet and page-set header are both sent; browsers enforce the
  intersection). **Named exit: Phase 11's origin split** — `play.*` on its own
  hostname is what actually fixes this, and R8-A defers the subdomain to that
  cut-over precisely so it lands with the rest of the marketing/DNS work. This
  entry is the record that the debt was taken deliberately, with its exit
  identified. Size M, and the size is Phase 11's, not a standalone task.
  *(Design `docs/superpowers/specs/2026-08-07-phase6-entrant-app-design.md` §3.)*
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd products/scheduler && grep -c "Phase 6" ../../docs/programs/ENTRIES_PROGRESS.md`

Expected before the edits: the phase table row still reads `not started` for Phase 6 and no Phase 6 section exists — `grep -n "Phase 6 — the entrant application" docs/programs/ENTRIES_PROGRESS.md` returns nothing, and `grep -n "R8-A" docs/audits/debt-log.md` returns nothing. Those two empty greps are the failing state: the phase would merge with its record missing and its accepted risk invisible, which is the exact failure CODE_HEALTH #6 and #8 exist to prevent.

- [ ] **Step 3: Write minimal implementation**

Apply the two document edits from Step 1, then run every gate the phase touched.

```bash
cd "$(git rev-parse --show-toplevel)"

# 1. The whole local gate: eslint, vitest, depcruise, ruff, pytest.
make check

# 2. Every compose stack this phase touched. All six are linted in CI;
#    the entrant service was added to four of them.
cd products/scheduler
for f in docker-compose.yml docker-compose.dev.yml docker-compose.selfhost.yml \
         docker-compose.release.yml docker-compose.cloud.yml docker-compose.worker.yml; do
  echo "--- $f"; docker compose -f "$f" config -q || echo "FAILED $f";
done

# 3. nginx. `nginx -t` resolves literal proxy_pass hostnames at parse time,
#    so the upstream names must exist or it fails for the wrong reason —
#    stub them at the container's hosts file rather than weakening the config.
cd "$(git rev-parse --show-toplevel)"
docker run --rm \
  --add-host backend:127.0.0.1 --add-host entrant:127.0.0.1 \
  -v "$PWD/products/scheduler/frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/products/scheduler/frontend/security-headers.conf:/etc/nginx/snippets/security-headers.conf:ro" \
  nginxinc/nginx-unprivileged:alpine nginx -t

# 4. The R11 evidence spec, re-run after the cut-over.
BACKEND_HOST_PORT=8600 make scheduler
cd products/scheduler/e2e && npx playwright test tests/10-entrant-r11-evidence.spec.ts
cd "$(git rev-parse --show-toplevel)" && make stop
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd products/scheduler && pytest -q 2>&1 | tail -3`

Expected: PASS, and the passed count **strictly greater** than the pre-phase baseline recorded in Step 2. Sanity-check the arithmetic before believing it: `-90` (the deleted file) `+25` (page successors) `+47` (submit successors) `+4` (idempotency scoping and the middleware body-replay trap) `+3` (parity ledger, less the two deleted at cut-over) `+1` (`test_the_retired_html_routes_are_gone`) plus whatever the earlier tasks in this phase added for the new routes, the two-channel middleware and the `sw_play_csrf` cookie. The 18 render claims are not in this number — they are Playwright cases and are counted separately, which is why "strictly up" is checked against the *sum* of both suites and not pytest alone. If pytest alone came out level or down while the earlier tasks added routes, a claim was dropped: run `pytest tests/test_entries_migration_parity.py -v` and find it.

Also expected: `make check` green, all six `docker compose config -q` silent, `nginx -t` printing `syntax is ok` / `test is successful`, and 19 Playwright cases green.

- [ ] **Step 5: Commit**
```bash
git add docs/programs/ENTRIES_PROGRESS.md docs/audits/debt-log.md
git commit -m "docs(ledger): record Phase 6, log the same-origin risk, keep the email clause open

ENTRIES_PROGRESS.md gains the Phase 6 record: the RR7 entrant app served
same-origin with the API, the F-E1-2-E1 closure (first-class signup and
login pages — the E1-2 walkthrough found the logged-out page named
/e/account/* and shipped no form), the retirement of the throwaway HTML
module together with the path-based CSRF exemption, the idempotency key
becoming reachable for the first time, and the migration table showing
where each of the 90 superseded tests now lives.

The phase table row says steps 1/2/4 done and step 3 deferred. **The exit
gate's 'a real verification-class email lands in a real inbox' clause
stays OPEN by ruling** — recorded as deferred, not met, and not quietly
dropped. Step 3 needs an SMTP seam, a provider and DNS; Phase 2 is not
done and Amendment A1 forbids the DNS work.

debt-log.md gains the §3 accepted risk: same origin (R8-A) fuses the
entrant and operator blast radii, script on the origin can read the _csrf
field and can attach X-ShuttleWorks-CSRF itself against /api/*, in-phase
mitigations are the nonce CSP and the CSP-duplication resolution, and
Phase 11's origin split is the named exit. Logged rather than silently
accepted, per CODE_HEALTH #6.

Gates run for this commit: make check green; docker compose config -q
clean on all six stacks; nginx -t successful against nginx.conf +
security-headers.conf; the 19-case R11 evidence spec green after the
cut-over. Test counts strictly up."
```
