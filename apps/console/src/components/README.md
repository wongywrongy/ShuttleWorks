# components/

Cross-feature React components. Anything reused by ≥2 features lives
here; feature-private components live under `../features/<x>/`.

## Layout

> Representative layout — not every component is listed; the source directory is authoritative.

```
components/
├── ui/                   # shadcn-style primitives (button, card, input, label, separator)
├── control-plane/        # the banded-table + detail-pane vocabulary shared by Meet/Bracket surfaces
│   ├── BandedList.tsx    #   column-header row, group band header, column priorities (colClass)
│   ├── BandedTable.tsx   #   the table shell (rows/groups + selected/click chrome)
│   ├── matchListColumns.ts #  the ONE match-list column spec + MATCH_CELL cell classes (parity-tested)
│   ├── DetailDock.tsx    #   docked detail-pane layout host (animated width column; overlay fallback)
│   ├── DetailPanel.tsx   #   detail-pane chrome (docked default; overlay escape hatch)
│   ├── PickerPopover.tsx #   anchored, portaled picker panel (Radix) — never clipped by overflow-auto
│   └── OverflowMenu.tsx  #   "…" close-on-select action menu (Headless UI)
├── common/
│   ├── Modal.tsx
│   └── ElapsedTimer.tsx
├── status/
│   └── LockRibbon.tsx    # tiered lock chip (soft: edits clear schedule / hard: read-only, draw in play)
├── AppStatusPopover.tsx  # header status popover (last save, backups, etc.)
├── ErrorBoundary.tsx
├── InlineSearch.tsx      # search input wired to useSearchParamState
├── SchoolDot.tsx         # per-school accent dot (uses lib/schoolAccent.ts)
├── SolverHud.tsx         # docked solver HUD shown above schedule + live tabs
├── StatusPill.tsx        # status colour pill (live / called / blocked / done)
├── Toast.tsx             # ToastStack rendered once at the app shell level
└── UnsavedBanner.tsx     # red banner when /tournament-state PUTs are failing
```

## Conventions

- `ui/` follows the shadcn convention: variant + size via
  class-variance authority, semantic tokens for colour. **Don't
  hardcode greys** — always use `bg-card`, `text-foreground`,
  `text-muted-foreground`, `border-border`, etc. The primitives
  already do this; copy the pattern when adding new ones.
- All clickable components compose `INTERACTIVE_BASE` (or
  `INTERACTIVE_BASE_QUIET` for icon-only) from `lib/utils.ts`. Single
  source of truth for hover / active / disabled / focus-ring.
- Components in this folder should not import from `../features/`.
  They may import from `../hooks/`, `../store/`, `../utils/`,
  `../lib/`, `../api/` — though `../api/` should normally be reached
  through a hook.
- **Detail panes**: mount a `DetailDock` as the LAST flex child of a
  `relative flex … overflow-hidden` row container and render a
  `DetailPanel` (docked) inside it. Docked panes do NOT close on outside
  click — row re-click toggles, Esc/× dismiss.
- **Column priorities**: a `BandedListColumn` with `priority: 2|3`
  collapses via container query as the surface narrows — the surface's
  scroll wrapper MUST carry `@container/table`, or the column is
  hidden at every width.
- **Popovers**: use `PickerPopover` (stay-open pickers/forms) or
  `OverflowMenu` (close-on-select actions). Never hand-roll an
  `absolute` dropdown inside an `overflow-auto` container — it clips.

## Status colour palette (dark-mode aware)

When status colour carries semantic meaning (live / called / blocked):

```tsx
// live (emerald)
'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
// called (amber)
'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
// blocked (red)
'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
```

Keep the hue, swap the lightness between themes — emerald-on-dark and
emerald-on-light should both pass WCAG AA at 4.5:1. `StatusPill.tsx`
encodes this so most callers can just hand it a status string.
