# features/

One folder per top-level surface in the app. Each folder owns its own
components and (where it makes sense) hooks. Cross-feature primitives
live in `../components/`; cross-feature hooks live in `../hooks/`.

## Folder map

| Folder | Owns | Top-level entry |
|---|---|---|
| `tournaments/` | The tournament config form (intervals, breaks, courts, weights) | `TournamentConfigForm.tsx` |
| `setup/` | Setup-page widgets: backup panel, schedule import modal | (composed into `pages/TournamentSetupPage.tsx`) |
| `roster/` | School / player CRUD: spreadsheet, position grid, dialogs | `RosterTab.tsx` |
| `matches/` | Match authoring: spreadsheet, list, generation rules | `MatchesTab.tsx` |
| `schedule/` | Generated-schedule view + drag-Gantt + stale banner | (composed into `pages/SchedulePage.tsx`) |
| `control-center/` | The "Live" tab: workflow panel, court Gantt, match details | (composed into `pages/MatchControlCenterPage.tsx`) |
| `liveops/` | Helpers used by the live page (move proposals, validation glue) | – |
| `tracking/` | Live timing / status helpers | – |
| `exports/` | CSV / XLSX export buttons + format helpers | – |

## Conventions

- A feature folder typically has a `<Feature>Tab.tsx` (or
  `<Feature>Page.tsx`) that the shell renders. The tab is the only
  cross-cutting surface; everything else is private.
- A feature *should not* import from another feature folder. If you
  need to share, hoist the shared code to `../components/` or
  `../hooks/`.
- A feature *may* import from `../store/` (it owns its slice of state)
  and `../utils/` (pure helpers).
- Status colour classes (emerald = live, amber = called, red = blocked)
  are repeated across `control-center/` and `schedule/` because they
  carry semantic meaning, not because they're reusable styles. If a new
  feature needs the same palette, factor it into a helper rather than
  copying.

## Adding a new feature

1. Create `features/<x>/<X>Tab.tsx`.
2. Wire it into `app/AppShell.tsx` as a `lazy(...)` import + a `case`
   in the tab switch.
3. Add the tab key to `AppTab` in `store/appStore.ts` and a button to
   `app/TabBar.tsx`.
4. Keep components private to the folder until a second consumer
   appears — premature hoisting just adds indirection.

See `../FRONTEND.md` for the broader architecture and theme system.
