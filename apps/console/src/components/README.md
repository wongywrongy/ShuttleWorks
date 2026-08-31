# components/

Cross-module React components. Anything reused by ≥2 modules lives
here (ADR 0013 — promote by moving, never by copying); module-private
components live under `../modules/<x>/`. Components used by BOTH apps
(console + entrant) belong one tier higher, in
`packages/design-system/components/`.

## Layout

> Representative layout — not every component is listed; the source directory is authoritative.

```
components/
├── control-plane/        # the banded-table + detail-pane vocabulary shared by Meet/Bracket surfaces
│   ├── ActionsBar.tsx    #   the universal pinned top bar (min-h-11, wraps rather than clips)
│   ├── PageBody.tsx      #   the ONLY page width/gutter owner (variants: data | form | prose)
│   ├── BandedList.tsx    #   column-header row, group band header, column priorities (colClass)
│   ├── BandedTable.tsx   #   the table shell (rows/groups + selected/click chrome)
│   ├── DenseDataTable.tsx#   sort/filter/facet/pagination table (strict 28px rows)
│   ├── matchListColumns.ts #  the ONE match-list column spec + MATCH_CELL cell classes (parity-tested)
│   ├── DetailDock.tsx    #   docked detail-pane layout host (animated width column; overlay fallback)
│   ├── DetailPanel.tsx   #   detail-pane chrome (docked default; overlay escape hatch)
│   ├── PickerPopover.tsx #   anchored, portaled picker panel (Radix) — never clipped by overflow-auto
│   ├── OverflowMenu.tsx  #   "…" close-on-select action menu (Headless UI)
│   ├── SectionCard.tsx   #   panel section chrome + the sanctioned section label
│   ├── EmptyState.tsx    #   shared empty-state (title/body/action)
│   └── Eyebrow.tsx       #   the eyebrow label (EYEBROW_CLASS from lib/utils.ts)
├── common/
│   └── Modal.tsx
├── status/
│   ├── AdvisoryBanner.tsx
│   └── LockRibbon.tsx    # tiered lock chip (soft: edits clear schedule / hard: read-only, draw in play)
├── ActiveChoice.tsx      # the ONE selected-state treatment (see selectedContrastContract)
├── AppStatusPopover.tsx  # header status popover (last save, backups, etc.)
├── ErrorBoundary.tsx
├── InlineSearch.tsx      # search input wired to useSearchParamState
├── SchoolChip.tsx        # per-school accent chip (uses lib/schoolAccent.ts)
├── SourceChip.tsx        # the three-module promotion precedent (ADR 0013)
├── SolverHud.tsx         # docked solver HUD shown above schedule + live tabs
├── StatusPill.tsx        # pure re-export of the design-system StatusPill
├── Toast.tsx             # ToastStack rendered once at the app shell level
└── UnsavedBanner.tsx     # banner when /tournaments/{id}/state PUTs are failing
```

## Conventions

- Styling rules live in `packages/design-system/DESIGN.md` (the agent
  rulebook) and `DESIGN_COLOR.md` (the two-layer token architecture).
  Components consume ONLY semantic tokens through the Tailwind preset —
  `bg-surface-raised`, `text-muted-foreground`, `border-border`,
  `text-status-warning`, … Never raw hex, never the stock Tailwind
  palette (`emerald-*`, `amber-*`, `red-*` are forbidden —
  DESIGN.md §1.6); `npm run test:classes` fails on token-shaped
  utilities that don't resolve in the preset.
- Shared class constants live in `lib/utils.ts`: all clickable
  components compose `INTERACTIVE_BASE` (or `INTERACTIVE_BASE_QUIET`
  for icon-only); eyebrow labels use `EYEBROW_CLASS`; secondary text
  uses the `TEXT_*` constants. Single source of truth for
  hover / active / disabled / focus-ring and the Figma text-style
  table.
- Components in this folder must not import from `../modules/`
  (dependency-cruiser enforces this). They may import from
  `../hooks/`, `../store/`, `../lib/`, `../api/` — though `../api/`
  should normally be reached through a hook.
- **Page width/gutters**: only `PageBody` owns `mx-auto` + `max-w-*`
  (pageContainerContract enforces this); pass rhythm (`space-y-*`)
  via its `className`, never a width or a gutter.
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

## Status colour

When status colour carries semantic meaning, use the `--status-*`
token families through the preset (`bg-status-live-bg`,
`text-status-warning`, `border-status-called-border`, …) — both themes
are mapped in `packages/design-system/tokens.css` and gated for WCAG AA
by `npm run test:contrast`. `StatusPill` (re-exported here from the
design system) encodes the standard pill treatment so most callers can
just hand it a tone.
