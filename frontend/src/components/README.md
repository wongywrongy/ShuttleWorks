# components/

Cross-feature React components. Anything reused by ≥2 features lives
here; feature-private components live under `../features/<x>/`.

## Layout

```
components/
├── ui/                # shadcn-style primitives (button, card, input, label, separator)
├── common/            # reusable but non-primitive widgets
│   ├── Modal.tsx
│   ├── ProgressIndicator.tsx
│   ├── ElapsedTimer.tsx
│   └── SafeDisplay.tsx
├── status/            # status-related shared widgets
├── roster/            # roster widgets shared across roster + matches features
├── AppStatusPopover.tsx  # header status popover (last save, backups, etc.)
├── ErrorBoundary.tsx
├── LoadingSpinner.tsx
├── SolverHud.tsx      # docked solver HUD shown above the schedule + live tabs
├── ThemeToggle.tsx    # light / system / dark pill
├── Toast.tsx          # ToastStack rendered once at the app shell level
└── UnsavedBanner.tsx  # red banner when /tournament-state PUTs are failing
```

## Conventions

- `ui/` follows the shadcn convention: variant + size via class-variance
  authority, semantic tokens for colour. **Don't hardcode greys**;
  always use `bg-card`, `text-foreground`, `text-muted-foreground`,
  `border-border`, etc. The primitives already do this — copy the
  pattern when adding new ones.
- All clickable components compose `INTERACTIVE_BASE` (or
  `INTERACTIVE_BASE_QUIET` for icon-only) from `lib/utils.ts`. That is
  the single source of truth for hover/active/disabled/focus-ring.
- Components in this folder should not import from `../features/`.
  They may import from `../hooks/`, `../store/`, `../utils/`, `../api/`
  — though `../api/` should normally be reached through a hook.

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
emerald-on-light should both pass WCAG AA at 4.5:1.
