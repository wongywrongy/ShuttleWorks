# Frontend architecture

> Reflects the current workspace control-plane architecture. See the [frontend architecture reference](../../docs/explanation/architecture/system-overview.md) and [accepted ADRs](../../docs/explanation/decisions/index.md) for the rationale.

React 19 + Vite app organised as a **workspace control plane**. The router
(`apps/console/src/app/App.tsx`) splits the public display and login from the authenticated
operator app; inside a workspace, `AppShell` renders the workspace chrome
(`WorkspaceShell` + the workspace sidebar) around the active **module** — Meet /
Bracket / Display / Entries / Settings — chosen by route and the workspace's
module status. State is split across five Zustand stores (tournament,
match-state, UI, preferences, alert); the tournament store is persisted via
debounced PUTs to a server-side snapshot.

This file covers the **operator console** only. The public entrant tier is a
separate app with different rules (no client JavaScript, no stores, no
`apiClient`) — see [`apps/entrant/README.md`](../entrant/README.md) and
[the entrant tier](../../docs/explanation/architecture/entrant-tier.md).

## Top-level shape

```
apps/console/src/
├── main.tsx                  # entry: mount <App />
├── index.css                 # Tailwind base + theme tokens (:root + .dark)
├── app/
│   ├── App.tsx               # router: /login, /display (public), and the workspace shell
│   ├── AppShell.tsx          # workspace chrome and active module host
│   ├── AuthGuard.tsx         # gates the operator app behind auth
│   └── workspace/            # ModuleOutlet + ModuleUnavailablePanel (the active-module slot)
├── modules/                  # one folder per module / surface
│   ├── hub/                  # the workspace Hub (dashboard at `/`) + New Workspace + inspector
│   ├── meet/                 # Meet module (Setup / Roster / Matches / Schedule / Live)
│   ├── bracket/              # Bracket module (draws / schedule / live / results)
│   ├── operations/            # Plan + Run live-operations surfaces
│   ├── display/              # public TV display (meet + bracket)
│   ├── entries/               # cloud-only public-entry intake desk
│   ├── settings/              # per-workspace Settings (Overview / Modules / People / Sharing / Sync)
│   └── workspace/             # workspace-level surfaces
├── platform/                 # cross-module
│   ├── product-shell/        # WorkspaceShell, WorkspaceSidebar, WorkspaceIdentityBar, types
│   ├── domain/               # module model (moduleModel, useWorkspaceModules)
│   ├── auth/                 # LoginPage, InvitePage
│   └── settings/             # shared settings primitives
├── components/               # shared UI incl. control-plane/ (HealthDot / OverflowMenu / SectionCard / …)
├── hooks/                    # data + UI hooks (see apps/console/src/hooks/README.md)
├── store/                    # Zustand stores (see apps/console/src/store/README.md)
├── api/                      # axios client + DTO types (see apps/console/src/api/README.md)
├── lib/                      # cross-feature primitives — cn(), INTERACTIVE_BASE, slot math (time.ts), school accents
├── context/                  # auth context and providers
└── pages/                    # thin route components (TournamentPage)
```

## State model

Five stores, split by lifetime + persistence:

| Store | File | Persistence | What it holds |
|---|---|---|---|
| Tournament | `store/tournamentStore.ts` | server snapshot via `useTournamentState` (debounced ~1s PUTs to `/tournaments/{id}/state`) | config, roster, matches, schedule, lock state |
| Match state | `store/matchStateStore.ts` | `/tournaments/{id}/match-states` PUT on every mutation (no debounce) | live-ops match transitions (called / started / finished) |
| UI | `store/uiStore.ts` | none — ephemeral | solver HUD, toast queue, drag pins, validation snapshots |
| Preferences | `store/preferencesStore.ts` | `localStorage` | per-device theme + density |
| Alert | `store/alertStore.ts` | none — ephemeral | the Alerts & Activity rail: live advisory `conditions` + a ring-buffered `activity` trail |

Selectors that span stores live in `store/selectors.ts`.

The split is deliberate: tournament state moves between machines via
import/export; theme and density must not. See `store/README.md` for
slice details.

## Data flow

```
mount → useTournamentState() hydrates tournamentStore from server snapshot
      → user mutates store via actions
      → useTournamentState() debounces a PUT back to /tournaments/{id}/state
      → schedule generation: useSchedule() → /tournaments/{id}/solve-jobs → poll → store
      → live ops: useLiveTracking() patches matchStates,
        transitions flushed via /tournaments/{id}/match-states immediately
      → bracket results flow through the idempotent /tournaments/{id}/bracket/commands path
```

Hooks are the seam. Components never call the API directly — they call
a hook, the hook calls `apiClient`, the hook updates the store. This
keeps optimistic updates and rollback in one place.

## Theme & density

- HSL theme tokens live in `packages/design-system/tokens.css` under
  `:root` (light) and `.dark` (dark); `index.css` is a thin shell that
  just imports them (plus `globals.css`) — do not define tokens in the
  app. Token rules: `packages/design-system/DESIGN.md` +
  `DESIGN_COLOR.md`.
- Tailwind reads them via the shared preset
  (`packages/design-system/tailwind-preset.js`, `darkMode: ["class"]`);
  semantic utilities like `bg-background`, `text-foreground`,
  `border-border`, `bg-card`, `bg-muted`, `text-muted-foreground`
  resolve per theme. `npm run test:classes` fails on token-shaped
  utilities the preset doesn't wire; `npm run test:contrast` gates the
  token values for WCAG AA.
- `useAppliedTheme()` reads the preference, resolves `system` against
  `prefers-color-scheme`, and toggles `.dark` on `<html>`. Mounted
  once in `AppShell.tsx`.
- `useAppliedDensity()` does the same dance for compact / comfortable
  density.
- `<ThemeToggle />` is the three-state pill (Sun / Monitor / Moon)
  rendered in the header and inside the Setup page.
- `modules/display/PublicDisplayPage.tsx` (the TV view) is **intentionally
  dark-only**, audience is gym projection. Don't add a toggle there.

When adding a new surface: use semantic tokens only. For status colour
use the `--status-*` families through the preset (`bg-status-live-bg`,
`text-status-warning`, `bg-status-blocked-bg`, …) — both themes are
mapped in `tokens.css` and contrast-gated, so no `dark:` companions are
needed. The stock Tailwind palette (`emerald-*`, `amber-*`, `red-*`) is
forbidden (DESIGN.md §1.6).

## Adding a module or a tab

Modules (Meet / Bracket / Display) are routed; the sidebar + chrome key off the
workspace's module status via `platform/domain/moduleModel` (`moduleForTab`,
`defaultTabForModule`, `primaryModuleForOpen`). The active module renders in
`apps/console/src/app/workspace/ModuleOutlet.tsx`.

- **A tab within a module** (e.g. a new Meet tab): add it to the module's
  tab list in `moduleModel`, add a route segment, and build the panel under
  `modules/<module>/`.
- **A new module** is a larger change — add its `ModuleId` + status mapping in
  `platform/product-shell/types` + `moduleModel`, a folder under `modules/`,
  and wire it into the sidebar/outlet. Keep the ownership declaration in
  `platform/contracts/moduleContract.ts` and its colocated test in sync.

## Adding a product/module folder

Each `modules/<module>/` folder typically contains:

- the top-level panel(s) rendered by the outlet,
- `components/` — module-private components,
- pure logic in `*.ts` (tested) + co-located `__tests__/`.

If a hook or component is reused by ≥2 modules, hoist it to
`apps/console/src/hooks/` or `apps/console/src/components/` (control-plane primitives
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
- **End-to-end** — Playwright specs in `tests/e2e/`, run against the Compose
  build (`make test-e2e`), plus visual smoke via the browser harness.
