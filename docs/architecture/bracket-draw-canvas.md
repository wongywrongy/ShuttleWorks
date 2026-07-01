# Centered bracket draw canvas

The single-draw viewer renders a **mirrored single-elimination tree**: the
Final is horizontally centered and earlier rounds fan outward to a left and
a right wing. It is a pure CSS-transform canvas — wheel-zoom, drag-pan,
fit-on-mount, round-jump chips — over an absolutely-positioned bracket whose
geometry is computed up front. This page describes that geometry and the
viewport that frames it. Both live in
`frontend/src/products/bracket/` (`DrawView.tsx`, `PanZoomCanvas.tsx`).

::: info Single-elimination only
Only single-elimination draws (`event.format === "se"`) use this canvas.
Round-robin draws (`rr`) render through `RoundRobinView` — a plain grid of
match cards grouped by round — and are not panned or mirrored.
:::

## The mirrored geometry

`computeBracketLayout(rounds)` in `DrawView.tsx` takes the round-major draw
(`rounds: string[][]`, each inner array the play-unit ids of one round) and
returns absolute pixel positions. Positions are inline styles, not flex, so
the layout is deterministic and unit-testable under jsdom — which does no
real layout.

### Horizontal: `2N − 1` uniform-pitch columns

For `N` rounds the canvas has `2N − 1` columns at a fixed pitch
(`BRACKET_CARD_WIDTH + BRACKET_COL_GAP`, i.e. `256 + 56`):

- Columns `0 … N − 2` are the **left wing**, where column `c` draws round `c`.
- Column `N − 1` is the **Final**.
- Columns `N … 2N − 2` are the **right wing**, mirrored: column `c` draws
  round `2N − 2 − c`.

Because the Final sits at column `N − 1`, its horizontal center is exactly
the content center. A round therefore appears in two columns — its first
half of matches in the left wing, its second half in the right wing. The
split is by match index (`half = round.length / 2`): binary-heap children
are contiguous, so each half is a complete subtree feeding one wing.

A degenerate single-match draw (`N === 1`) collapses to one Final column
with no wings.

### Vertical: per-wing midpoint recursion

Each match sits at the vertical midpoint of its two feeders. The layout
builds `wingCenters[roundIndex][localIndex]`:

- Round-0 cards are evenly spaced by `BRACKET_CARD_HEIGHT + BRACKET_ROW_GAP`
  (`88 + 28`).
- Each later match centers between its two feeders:
  `(prev[2j] + prev[2j + 1]) / 2`.

Both wings share the same vertical centers, so the Final — pinned to
`fullHeight / 2` — lands exactly between its two wing roots. A card's `top`
is `BRACKET_LABEL_HEIGHT + center − BRACKET_CARD_HEIGHT / 2`, leaving 28 px
above each column for its round label (`roundLabel`: Final, Semifinal,
Quarterfinal, then `Round n`).

::: warning Connector lines are alignment-implied
No explicit connector lines are drawn between rounds yet. A feeder pair and
its successor line up because the successor is placed at their midpoint, so
the bracket *reads* as connected — but the joining strokes are visual
inference, not rendered geometry. Drawing real connectors is a known
follow-up.
:::

## The pan/zoom viewport

`PanZoomCanvas` wraps the bracket in a single transformed surface
(`transform: translate(x, y) scale(s)`, `transformOrigin: 0 0`). There is no
scroll container and no dependency — it is pure frontend CSS transform.

| Gesture / control | Behaviour |
| --- | --- |
| Wheel / trackpad | Zoom toward the cursor. Bound natively with `{ passive: false }` so it can `preventDefault`. Scale clamps to `0.2 … 2`. |
| Drag background | Pan. A pointer-down whose target is inside a `button, a, input, select, [role="button"]` is ignored, so clicking a card (assign a slot, record a winner) still works. |
| `−` / `%` / `+` | Step zoom by 1.2× about the viewport center; the readout shows the current percentage. |
| Fit | Re-run fit-and-center (see below). |
| Reset | Return to `{ x: 24, y: 24, s: 1 }`. |

### Fit centers in both axes

`fit()` scales to `min(vw / (cw + 48), vh / (ch + 48))`, clamped to
`0.2 … 1` (never zooms *past* 1:1). It then centers the content
horizontally and vertically:

- `x = (vw − cw·s) / 2`
- `y = max(24, (vh − ch·s) / 2)`

Vertical centering keeps the centered Final mid-viewport rather than parked
at the top; the `max(24, …)` floor keeps a tall bracket reachable from its
top edge. Fit runs once on mount via `requestAnimationFrame` behind a
`didFit` guard. jsdom reports a zero-sized content, so `fit` no-ops there —
safe in tests.

### Round-jump chips

When more than two round labels are supplied, chips appear top-left
(`F`, `SF`, `QF`, `Rn` from `shortRoundLabel`). A chip pans horizontally to
the first column carrying that round: `x = 24 − el.offsetLeft · s`, matching
on `[data-round="i"]`. Both wings of a round share the same `data-round`
index, so a chip lands on the left-wing column.

## Known follow-up

- **Explicit connector lines between rounds are not yet drawn.** Today the
  tree's connectivity is implied purely by the midpoint alignment described
  above.

## See also

- [Bracket module](/modules/bracket)
- [Scheduling unification](/architecture/scheduling-unification)
