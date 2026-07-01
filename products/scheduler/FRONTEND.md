# Frontend architecture

> Reflects the 2026-06 workspace-suite control-plane redesign. Full per-slice
> design record: [`../../docs/superpowers/specs/`](../../docs/superpowers/specs).

React 19 + Vite app organised as a **workspace control plane**. The router
(`app/App.tsx`) splits the public display and login from the authenticated
operator app; inside a workspace, `AppShell` renders the workspace chrome
(`WorkspaceShell` + the `ModuleDock`) around the active **module** — Meet /
Bracket / Display / Settings — chosen by route and the workspace's module
status. State is split across four Zustand stores; the tournament store is
persisted via debounced PUTs to a server-side snapshot.

## Top-level shape

```
frontend/src/
├── main.tsx                  # entry: mount <App />
├── index.css                 # Tailwind base + theme tokens (:root + .dark)
├── app/
│   ├── App.tsx               # router: /login, /display (public), and the workspace shell
│   ├── AppShell.tsx          # workspace chrome: WorkspaceShell + ModuleDock; renders the active module
│   ├── AuthGuard.tsx         # gates the operator app behind auth
│   ├── TabBar.tsx            # in-module tab nav (e.g. the Meet tabs)
│   └── workspace/            # ModuleOutlet + ModuleUnavailablePanel (the active-module slot)
├── products/                 # one folder per module / surface
│   ├── hub/                  # the workspace Hub (dashboard at `/`) + New Workspace + inspector
│   ├── meet/                 # Meet module (Setup / Roster / Matches / Schedule / Live)
│   ├── bracket/              # Bracket module (draws / schedule / live / results)
│   ├── display/              # public TV display (meet + bracket)
│   └── settings/             # per-workspace Settings (Overview / Modules / People / Sharing / Sync)
├── platform/                 # cross-module
│   ├── product-shell/        # WorkspaceShell, ModuleDock, WorkspaceIdentityBar, types
│   ├── domain/               # module model (moduleModel, useWorkspaceModules)
│   ├── auth/                 # LoginPage, InvitePage
│   └── settings/             # shared settings primitives
├── components/               # shared UI incl. control-plane/ (MetricStat / HealthDot / OverflowMenu / SectionCard / …)
├── hooks/                    # data + UI hooks (see frontend/src/hooks/README.md)
├── store/                    # Zustand stores (see frontend/src/store/README.md)
├── api/                      # axios client + DTO types (see frontend/src/api/README.md)
├── lib/                      # cross-feature primitives — cn(), INTERACTIVE_BASE, slot math (time.ts), school accents
├── utils/ · types/ · services/ · context/ · assets/
└── pages/                    # thin route components (TournamentPage)
```

## State model

Four stores, split by lifetime + persistence:

| Store | File | Persistence | What it holds |
|---|---|---|---|
| Tournament | `store/tournamentStore.ts` | server snapshot via `useTournamentState` (debounced ~1s PUTs to `/tournament-state`) | config, roster, matches, schedule, lock state |
| Match state | `store/matchStateStore.ts` | `/match-state` PUT on every mutation (no debounce) | live-ops match transitions (called / started / finished) |
| UI | `store/uiStore.ts` | none — ephemeral | solver HUD, toast queue, drag pins, validation snapshots |
| Preferences | `store/preferencesStore.ts` | `localStorage` | per-device theme + density |

Selectors that span stores live in `store/selectors.ts`.

The split is deliberate: tournament state moves between machines via
import/export; theme and density must not. See `store/README.md` for
slice details.

## Data flow

```
mount → useTournamentState() hydrates appStore from server snapshot
      → user mutates store via actions
      → useTournamentState() debounces a PUT back to /tournament-state
      → schedule generation: useSchedule() → /schedule/stream (SSE) → store.setSchedule
      → live ops: useLiveTracking() / useLiveOperations() patch matchStates,
        each transition flushed via /match-state PUT immediately (no debounce)
      → repair flow: useRepair() → /schedule/repair → store.setSchedule (with repairedMatchIds)
```

Hooks are the seam. Components never call the API directly — they call
a hook, the hook calls `apiClient`, the hook updates the store. This
keeps optimistic updates and rollback in one place.

## Theme & density

- HSL theme tokens defined in `index.css` under `:root` (light) and
  `.dark` (dark).
- Tailwind reads them via the `darkMode: ["class"]` config; semantic
  utilities like `bg-background`, `text-foreground`, `border-border`,
  `bg-card`, `bg-muted`, `text-muted-foreground` resolve per theme.
- `useAppliedTheme()` reads the preference, resolves `system` against
  `prefers-color-scheme`, and toggles `.dark` on `<html>`. Mounted
  once in `AppShell.tsx`.
- `useAppliedDensity()` does the same dance for compact / comfortable
  density.
- `<ThemeToggle />` is the three-state pill (Sun / Monitor / Moon)
  rendered in the header and inside the Setup page.
- `products/display/PublicDisplayPage.tsx` (the TV view) is **intentionally
  dark-only**, audience is gym projection. Don't add a toggle there.

When adding a new surface: prefer semantic tokens. For status colour
(emerald = live, amber = called, red = blocked) keep the hue and add
`dark:bg-*-500/15 dark:text-*-300` companions so it stays legible in
dark mode.

## Adding a module or a tab

Modules (Meet / Bracket / Display) are routed; the dock + chrome key off the
workspace's module status via `platform/domain/moduleModel` (`moduleForTab`,
`defaultTabForModule`, `primaryModuleForOpen`). The active module renders in
`app/workspace/ModuleOutlet`.

- **A tab within a module** (e.g. a new Meet tab): add it to the module's
  tab list in `moduleModel`, add a route segment, and build the panel under
  `products/<module>/`.
- **A new module** is a larger change — add its `ModuleId` + status mapping in
  `platform/product-shell/types` + `moduleModel`, a folder under `products/`,
  and wire it into the dock/outlet. See the SP-B/SP-D specs in
  `docs/superpowers/specs/` for the module-driven-chrome contract.

## Adding a product/module folder

Each `products/<module>/` folder typically contains:

- the top-level panel(s) rendered by the outlet,
- `components/` — module-private components,
- pure logic in `*.ts` (tested) + co-located `__tests__/`.

If a hook or component is reused by ≥2 modules, hoist it to
`frontend/src/hooks/` or `frontend/src/components/` (control-plane primitives
shared across the suite live in `components/control-plane/`).

## Click feedback contract

Every interactive element should compose `INTERACTIVE_BASE` (or
`INTERACTIVE_BASE_QUIET` for icon-only buttons) from `lib/utils.ts`.
That is the single source of truth for hover / active / disabled /
focus-ring behaviour.

## Testing

- **Unit / component** — Vitest + jsdom + React Testing Library, co-located in
  `__tests__/` folders next to the code (`npm run test:run`; `npx tsc -b` for
  types; `npm run build` for the build gate). Pure logic (`*.ts`) is TDD'd;
  components get render/interaction tests.
- **End-to-end** — Playwright specs in `e2e/`, run against the docker-compose
  build (`make test-e2e`), plus visual smoke via the browser harness.
