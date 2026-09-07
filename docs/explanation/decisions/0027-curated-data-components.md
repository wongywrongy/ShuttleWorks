# 0027 — Curated components from the Claude Design library (data + actions)

**Status:** Accepted — 2026-09-04. Supersedes ADR 0020 decision 1 for the
shared `Card` (the per-tier console/entrant radii stand) and the
`StatusPill` register described there. Replaces `DESIGN.md` §1.2 and §1.3.

## Context

The owner curated a ShuttleWorks design system in Claude Design
(project `167bfecf`), generated from the repo's `tokens.css` and the
Figma foundation file, and ruled that its look is preferred over the
BRAND.md-era brutalist direction the shared package still carried. The
first group brought across is the data display card
(`components/data/data.card.html`): Card, StatusPill, Badge, Avatar.

The shared package was already split visual-from-core: every colour,
radius, shadow and motion value the curated library uses resolves to a
token that `tokens.css` and `tailwind-preset.js` already define. The
port is therefore class changes and two new files, not a token change.

## Decisions

1. **Radius by role, not by tier.** 6px (`rounded-sm`) on anything
   pressable, 8px (`rounded`) on anything that contains, 4px
   (`rounded-xs`) only on tiny nested marks. The shared `Card` takes the
   container radius; it is no longer square. Console panels and entrant
   cards keep their own radii (ADR 0020 decision 1 is otherwise intact).
2. **Elevation is the shadow tokens.** `Card` `frame` carries
   `shadow-card`, `elevated` carries `shadow-md`; `bare` is a sunken
   well. Dark mode already resolves these to luminance-only depth, so
   the classes are theme-neutral. `DESIGN.md` §1.2 ("no shadow-sm/md/lg")
   is withdrawn.
3. **Card inset is 16px.** `CardHeader`/`CardContent`/`CardFooter` move
   from `p-6` to `p-4`, the spacing ladder's card-padding step. No app
   composes these sub-components today, so nothing shifts.
4. **Status is colour + text; nothing is a pill.** The owner ruled that
   the dotted, fully-round pill is a telltale of generated UI. `StatusPill`
   is 22px tall (`h-badge`, density-aware), `rounded-xs`, 10px Geist 600
   uppercase tracked +0.06em, transparent border, and its `dot`/`pulse`
   props are removed (six console call sites updated). The console
   `LiveStatusPill` and the entrant `StatusChip` follow: `rounded-xs`, no
   dot. `STATUS_TONE` keeps its `border`/`dot` parts for any consumer that
   still needs them. Live state on the Display board is carried by the
   text (MOTION.md §8.3).
5. **`Badge` and `Avatar` join the package** as new primitives with the
   curated API (`tone`×`size`; `size`×inferred `variant`). `Badge` is
   for counts and neutral labels; status hues never decorate neutral
   content.
6. **Button is one construction (actions group).** Every style carries a
   1px border; the filled and outlined styles add the `--shadow-hard`
   offset and sink 3px on press (120ms, `ease-out-quick`); `ghost`,
   `link` and `toolbar` have no chrome. The azure glow (`shadow-glow`)
   and the `active:scale` press are gone from the primitive. Sizes follow
   the curated table (xs 28 / sm 36 / default 40 / lg 44; icon 36 /
   icon-sm 28 / icon-xs 24), radius by size. The curated library names
   the azure button `brand` and the ink button `default`; the code base
   has always spelled its primary action `default`, so `default` stays
   azure (alias of `brand`) and the ink fill is exposed as `variant="ink"`.
   The compact sizes keep their invisible 44×44 hit area.

## Consequences

- Every consumer of the shared `Card` and `StatusPill` re-skins at once,
  which is the point of the visual/core split.
- Console `PendingBadge` and the entrant `DateBadge` are unrelated to the
  new `Badge` and keep their names.
- The entrant `StatusChip` test and the entrant design-system smoke test
  changed with the design: the chip no longer asserts a dot, and the
  "shared classes were emitted" proxy moved from `shadow-glow` (now
  unused) to `text-brand-ink`.
- The 15 hand-rolled azure buttons in console modules (the ADR 0019 "ops
  raw-button sweep" deferral) were re-chromed in the same change through
  one console constant, `ACCENT_PRESS` in `apps/console/src/lib/utils.ts`
  (border + hard offset + 3px sink), so no primary action still glows.
  Converting them to `<Button>` proper remains open; the visual debt is
  closed. The one remaining `shadow-glow` is the bracket final-card
  highlight in `DrawView`, a Card emphasis and not a button.
- Remaining Claude Design groups (forms, feedback, layout, navigation)
  port the same way, one specimen card at a time. The
  `dot` on `StatusPill` is retired (decision 4).
