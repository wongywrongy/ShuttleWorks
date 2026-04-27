# Frontend architecture

Single-page React 19 + Vite app. One shell, one tab bar, lazy-loaded tab
panels. State is split between two Zustand stores; the larger one is
persisted to a server-side snapshot via debounced PUTs.

## Top-level shape

```
frontend/src/
├── main.tsx                  # entry: mount <App />
├── index.css                 # Tailwind base + theme tokens (:root + .dark)
├── App.css                   # legacy file, mostly empty
├── app/
│   ├── AppShell.tsx          # mounts hydration + theme hooks, renders TabBar + active tab
│   └── TabBar.tsx            # tab nav + ThemeToggle + AppStatusPopover
├── pages/                    # one component per top-level surface (Setup, Schedule, MCC, TV)
├── features/                 # feature-scoped UI (see frontend/src/features/README.md)
├── components/               # primitives + cross-feature widgets (Toast, SolverHud, …)
├── hooks/                    # data hooks + UI hooks (see frontend/src/hooks/README.md)
├── store/                    # Zustand stores (see frontend/src/store/README.md)
├── api/                      # axios client + DTO types (see frontend/src/api/README.md)
├── utils/                    # pure helpers (time, traffic-light, exporters, …)
├── lib/utils.ts              # cn(), INTERACTIVE_BASE — used everywhere for click feedback
├── styles/                   # token overrides (rare)
├── types/                    # ambient TS types
└── services/                 # service-layer wrappers (small)
```

## State model

Two stores, one storage key each:

| Store | File | Storage key | What it holds |
|---|---|---|---|
| Tournament | `store/appStore.ts` | (server-side `/tournament-state`) | tournament config, roster, matches, schedule, match states, solver HUD, toasts, lock state |
| Preferences | `store/preferencesStore.ts` | `scheduler-app-preferences` (localStorage) | per-device theme (`light` / `dark` / `system`) |

The split is deliberate: tournament state moves between machines via
import/export; theme must not. See `store/README.md` for slice details.

## Data flow

```
mount → useTournamentState() hydrates appStore from server snapshot
      → user mutates store via actions
      → useTournamentState() debounces a PUT back to /tournament-state
      → schedule generation: useSchedule() → /schedule/stream (SSE) → store.setSchedule
      → live ops: useLiveTracking() / useLiveOperations() patch matchStates,
        each transition flushed via /match-state PUT immediately (no debounce)
```

Hooks are the seam. Components never call the API directly — they call a
hook, the hook calls `apiClient`, the hook updates the store. This keeps
optimistic updates and rollback in one place.

## Theme system

- HSL tokens defined in `index.css` under `:root` (light) and `.dark` (dark).
- Tailwind reads them via the `darkMode: ["class"]` config; semantic
  utilities like `bg-background`, `text-foreground`, `border-border`,
  `bg-card`, `bg-muted`, `text-muted-foreground` resolve per theme.
- `useAppliedTheme()` (in `hooks/`) reads the preference, resolves
  `system` against `prefers-color-scheme`, and toggles `.dark` on
  `<html>`. Mounted once in `AppShell.tsx`.
- `<ThemeToggle />` (in `components/`) is a three-state pill (Sun /
  Monitor / Moon). Rendered in the header and inside the Setup page's
  Appearance card.
- `pages/PublicDisplayPage.tsx` (the TV view) is **intentionally
  dark-only**, audience is gym projection. Don't add a toggle there.

When adding a new surface: prefer semantic tokens. For status colour
(emerald = live, amber = called, red = blocked) keep the hue and add
`dark:bg-*-500/15 dark:text-*-300` companions so it stays legible in
dark mode.

## Adding a new tab

1. Add the tab key to `AppTab` in `store/appStore.ts`.
2. Add a `lazy(() => import(...))` line in `app/AppShell.tsx` and route
   it inside the `switch (activeTab)` block.
3. Add a tab button in `app/TabBar.tsx`.
4. Build the panel under `features/<your-feature>/` (or `pages/` if it's
   a pure page-level view).

## Adding a new feature folder

Each `features/<x>/` folder typically contains:

- `<X>Tab.tsx` — top-level panel rendered by `AppShell`.
- `components/` — feature-private components.
- `hooks/` (sometimes) — feature-private hooks. Cross-feature hooks live
  in `frontend/src/hooks/`.

If a hook or component is reused by ≥2 features, hoist it to
`frontend/src/hooks/` or `frontend/src/components/`.

## Click feedback contract

Every interactive element should compose `INTERACTIVE_BASE` (or
`INTERACTIVE_BASE_QUIET` for icon-only buttons) from `lib/utils.ts`.
That is the single source of truth for hover/active/disabled/focus-ring
behaviour. See the JSDoc in that file for the rationale on each rule.

## Testing

End-to-end specs live in `e2e/` and run against the docker-compose
build. There is no frontend unit-test suite — UI work is verified
through `make test-e2e` and visual smoke (Playwright MCP).
