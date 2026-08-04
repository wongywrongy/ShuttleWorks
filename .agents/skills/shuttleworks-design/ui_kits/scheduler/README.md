# Scheduler UI Kit

High-fidelity recreations of the ShuttleWorks workspace surfaces in the final **warmed-B blue-glow** language (dark-first, with a light pairing).

## Screens
`index.html` renders the keystone **Operations · Run** live court board — the hardest, most representative surface (module rail, summary tiles, court×time board with 3b muted-solid `MatchChip`s, queue, and inspector). It is a `@startingPoint`.

The full multi-screen click-through prototypes live at the project root and cover all 13 screens in both themes:
- `ShuttleWorks - Final Direction.dc.html` — dark
- `ShuttleWorks - Final Direction Light.dc.html` — light

Screens covered there: Hub · Meet Roster · Meet Matches · Meet Configuration · Operations Plan · Operations Run · Bracket Roster · Bracket Draw · Bracket Matches · Bracket Configuration · New Workspace · Settings · Public TV Display.

## Archetypes (reuse, don't reinvent)
Because Meet and Bracket are modular, they share page archetypes — build once, reskin the data:
- **App shell** — identity bar → module rail → action bar → content → inspector.
- **DataTable** — Roster, Matches, Bracket participants all use the same chrome; only columns + tags change.
- **Configuration** — stat-tile grid + field pairs + scoring toggle + Save.
- **Court board** — `MatchChip`s on court×time lanes (Run = live, Plan = draft).

## Composition
Screens compose the design-system primitives (`Button`, `MatchChip`, `Tag`, `StatusPill`, `MetricTile`, `HealthDot`, `WorkspaceSidebar`) over the token layer in `styles.css`. Do not re-implement primitives inside a screen.
