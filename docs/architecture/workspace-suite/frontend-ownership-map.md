# Frontend Ownership Map

Maps current `products/scheduler/frontend/src/` files to their future suite owner.
No files move in Phase 1. "Owner" = which workspace module or platform layer the code
*belongs to* conceptually, used to enforce import boundaries (see import-boundaries.md).

## Workspace Shell (app-level chrome)

- `app/App.tsx` — router + providers (BrowserRouter, AuthProvider, ErrorBoundary).
- `app/AppShell.tsx` — tab-based operator layout shell (will become Workspace Shell + product host).
- `app/TabBar.tsx` — top navigation (will become the product switcher + tab chrome).
- `app/AuthGuard` / `context/` (AuthContext) — session gating.
- `components/` — shared chrome not yet in design-system (error boundary, toast host, status indicators).

## Hub

- `pages/TournamentListPage.tsx` — the dashboard / workspace list (becomes Hub).
- `pages/TournamentPage.tsx` — `/tournaments/:id/*` wrapper that resolves kind and mounts AppShell (straddles Hub→Shell handoff; platform-routing concern).

## Meet product

- `features/setup/`, `features/roster/`, `features/matches/`, `features/schedule/`,
  `features/control-center/`, `features/liveOps/`, `features/suggestions/`,
  `features/exports/`, `features/director/` — meet workflow surfaces.
- Meet tab ids (`setup | roster | matches | schedule | live | tv`) defined in `app/TabBar.tsx`.

## Bracket product

- `features/bracket/` — draw desk, advancement, bracket schedule, bracket live.
- `lib/bracketTabs.ts` — bracket tab ids + labels.
- Bracket tab ids: `bracket-setup | bracket-roster | bracket-events | bracket-draw | bracket-schedule | bracket-live`.

## Display product

- `pages/PublicDisplayPage.tsx` — public `/display` surface.
- `pages/publicDisplay/` — display-specific subcomponents + tests.

## Core Platform (frontend)

- `api/` — API client (axios) + DTOs (`dto.ts`, `dto.generated.ts`).
- `hooks/` — identity + data hooks: `useTournamentId` (`useTournamentId`,
  `useTournamentIdOrNull`), `useTournament`, `useTournamentKind`, `useTournamentState`,
  `useLiveTracking`, etc. These are the future Workspace identity/data layer.
- `store/` — Zustand stores (`uiStore`, `tournamentStore`, `matchStateStore`, …).
- `services/`, `lib/`, `types/`, `utils/` — shared utilities and abstractions.
- `platform/domain/workspace.ts` — **new in Phase 1**: user-facing container-noun facade.
- `@scheduler/design-system` (`packages/design-system/`) — design tokens + shared primitives.

## Risk list (files too large or crossing concerns)

- `features/bracket/` — large; backend+UI boundary still trails Meet (per spec weak point #5).
- `app/AppShell.tsx` — overloaded "one product with tabs"; the future Shell/Hub/product
  split lands here (spec weak point #3).
- `pages/TournamentListPage.tsx` — mixes Hub listing, create-dialog, and delete-modal concerns.
