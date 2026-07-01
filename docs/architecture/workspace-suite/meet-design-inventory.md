> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time analysis map from the 2026-06 workspace-suite redesign, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and the VitePress site. (Labeled in SP-REFACTOR Phase 6.)

# Meet Design-Primitive Inventory

Meet is the reference standard. The suite's design language is *extracted* from Meet
and the existing `@scheduler/design-system`, not reinvented. This inventory is the
input to spec Phase 3 (design language extraction). No visuals change in Phase 1.

## Already extracted (in `@scheduler/design-system`)

Package: `@scheduler/design-system` (private, ESM). Exports:

- **Tokens** (`tokens.css`): canonical palette (`--bg`, `--bg-elev`, `--ink`,
  `--ink-muted`, `--ink-faint`, `--rule`, `--rule-soft`, `--accent`, `--accent-bg`,
  `--accent-ink`); spacing ladder `--space-1`..`--space-10` (2px→96px); radii
  (sharp/brutalist, ≤2px on controls); motion (easing + duration scale); density
  (row height, cell padding, gaps, badge height); typography (sizes 3xs 10px→2xl
  24px; Geist Variable for UI, JetBrains Mono Variable for numerics). Light
  ("Swiss Industrial Print") + dark ("Tactical Telemetry") schemes.
- **Components** (`components/index.ts`): `PageHeader`, `Card` (+ `CardHeader`,
  `CardFooter`, `CardTitle`, `CardDescription`, `CardContent`), `Input`, `Label`,
  `Select`, `Button`, `Modal`, `Hint`, `Separator`, `StatusPill`, `StatusBar`
  (+ `StatusCount`), `Toast` (+ `ToastStack`), `GanttTimeline` (+ `GANTT_GEOMETRY`,
  `placementBox`).
- **Tailwind preset** (`tailwind-preset.js`): maps tokens → Tailwind theme.
- **Icons** (`icons/index.tsx`): Phosphor wrapper.

## Meet patterns to codify (behavior notes, not yet formal primitives)

- **Header lockup:** boxed `ShuttleWorksMark` left + chrome controls right (sticky,
  `h-12`, bottom rule) — see `pages/TournamentListPage.tsx` header. Reused on operator
  surfaces; should become a shared Shell header rule.
- **PageHeader hierarchy:** eyebrow (uppercase, tracked) + title + description +
  right-aligned actions. Used on the dashboard; the standard section/page intro.
- **Status language:** `StatusPill` tones (green/idle/done) for entity status;
  `StatusBar`/`StatusCount` for aggregate counts. Status color is semantic.
- **Numeric layout:** `tabular-nums` for dates/counts (stable columns).
- **Gantt:** `GanttTimeline` geometry for schedule visualization.
- **Empty/loading/error language:** "Loading…", `Card` empty state, `role="alert"`
  destructive banner — see `TournamentListPage`.

## Bracket / Display parity checklist

For each item, confirm the sibling product uses the shared primitive (✅) or note the gap:

- [ ] Header lockup (boxed wordmark + chrome) — Bracket / Display
- [ ] PageHeader eyebrow+title+actions hierarchy — Bracket / Display
- [ ] `StatusPill` semantic tones for status — Bracket / Display
- [ ] `tabular-nums` for all numeric columns — Bracket / Display
- [ ] Shared empty/loading/error language — Bracket / Display
- [ ] `Toast`/`ToastStack` for command feedback — Bracket / Display
- [ ] Design tokens only (no ad-hoc colors/spacing) — Bracket / Display
- [ ] Operator-calm vs display-expressive expression rules respected — Display
