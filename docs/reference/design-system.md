# Design system

Reference for the UI system both tiers are built from: where the tokens
live, which primitives exist at which tier, and which gates hold it all
together. The intent is that this page maps 1:1 onto a future Figma
library — tokens become Figma Variables, primitives become components,
variant props become Figma variants.

Authoritative sources this page indexes (all in the repo, all enforced):

| Document | Owns |
| --- | --- |
| `packages/design-system/DESIGN.md` | The rulebook: 12 hard styling rules (no raw hex, no stock Tailwind palette, radius and type ladders, accent reservation) |
| `packages/design-system/DESIGN_COLOR.md` | The two-layer color architecture and the color budget |
| `packages/design-system/BRAND.md` | Brand voice and the brutalist card/shadow language |
| `packages/design-system/MOTION.md` | The motion scale (`--motion-*`) and easing vocabulary |
| ADR 0013 (`docs/explanation/decisions/0013-shared-ui-promotion-policy.md`) | Where shared UI lives and when it moves |
| ADR 0019 (`docs/explanation/decisions/0019-design-system-consolidation-pass.md`) | The 2026-08 consolidation pass and its recorded deferrals |

## Token architecture

All design tokens live in **one file**: `packages/design-system/tokens.css`
(~215 custom properties, defined once per theme — light under `:root` /
`[data-theme="light"]`, dark under `.dark` / `[data-theme="dark"]`). Both
apps import it through a thin shell (`apps/console/src/index.css`,
`apps/entrant/app/app.css`); neither app defines a token of its own.

Two layers (DESIGN_COLOR.md):

1. **Primitives** — `--gray-0…13`, `--blue-1…10`, `--green-*`, `--amber-*`,
   `--red-*`, `--sky-*`, `--violet-*`. Never referenced by components.
2. **Semantic** — the only layer components may consume, resolved per theme:
   - Surfaces: `--surface-{sunken,base,raised,overlay,hover,selected-wash,inverse,inverse-ink,inverse-muted}`
   - Text: `--text-{primary,secondary,muted,on-accent}`
   - Borders: `--border-{hairline,strong,focus}`, `--border-control`
   - Action: `--action-{primary,primary-hover,selected-bg,selected-foreground}`
   - Status pairs: `--status-{success,warning,danger,info}-{fg,bg}` plus the
     operational match-state families `--status-{live,called,late,overdue,started,blocked,warning,idle,done}`
     (each with `-bg`; the first four also `-solid`/`-border`/`-ink`)
   - Module identity: `--module-{meet,bracket,ops,display}`

Non-color scales, same file: spacing `--space-0…10`, radii
`--radius-{xs,sm,md,lg,xl}` (+ default), type `--text-{3xs,2xs,xs,2sm,sm,base,lg,2xl}`,
fonts `--font-{display,sans,mono}`, density `--density-*` (responds to
`[data-density="compact"]`), z-index `--z-{hud,chrome,overlay,modal,popover}`,
motion `--motion-{instant,fast,standard,moderate,slow}` + `--ease-*`,
shadows `--shadow-*` and `--glow-*`.

Components never read custom properties directly — they use Tailwind
utilities wired by `packages/design-system/tailwind-preset.js`
(`bg-surface-raised`, `text-status-warning`, `h-row`, `duration-fast`,
`z-modal`, …). Both apps' `tailwind.config.js` consume the preset and add
only `content` globs.

**Figma mapping:** the semantic layer is the Variables collection (one
mode per theme); the primitive ramps are a second, hidden collection the
semantic variables alias into. The Tailwind utility names are the
variable names.

`npm run figma:tokens` (`tools/export-figma-tokens.mjs`) derives
`packages/design-system/figma-tokens.json` from `tokens.css` — W3C
`$type`/`$value` tokens in four sets: `primitives`, `semantic/light`,
`semantic/dark` (identical name sets, hex-resolved through the alias
chains, so they import as two modes of one collection), and `scales`
(spacing/radius/type as dimensions). Import with Tokens Studio or any
design-tokens-aware variables importer; regenerate after any
`tokens.css` change — the JSON is derived, never edited.

### Token gates

- `npm run test:contrast` — WCAG AA gate over `tokens.css` (text vs every
  surface step, status fg vs tint, focus/strong borders at 3:1), both
  themes. Runs first in `make check` and in CI. It parses the file
  structurally, so do not reformat `tokens.css`.
- `npm run test:classes` — fails on any *token-shaped* utility that does
  not resolve in the preset (the `bg-bg-subtle` incident class: such
  classes render silently transparent). Scans both apps + the shared
  components. In `make check` and CI.
- `npm run figma:tokens:check` — fails when the tracked Figma Variables
  export no longer matches `tokens.css`; run `npm run figma:tokens` to
  regenerate it. In `make check` and CI.

## Component tiers

The promotion ladder (ADR 0013, enforced by dependency-cruiser — a new
cross-module import is a build **error**):

| Tier | Location | Criterion |
| --- | --- | --- |
| Shared package | `packages/design-system/components/` | Used by more than one app; must be SSR-safe if the entrant tier uses it |
| Console shared | `apps/console/src/components/` | Used by 2+ console modules |
| Module-local | `apps/console/src/modules/<x>/` | One module only |
| Entrant | `apps/entrant/app/components/` + `apps/entrant/app/lib/ui.ts` | The public tier (no hydration — see below) |

### Shared package primitives (`packages/design-system/components/`)

| Component | Variants / API |
| --- | --- |
| `Button` | cva: `variant` (incl. `brand`, `outline`) × `size` (`xs`…, icon), `asChild` |
| `Card` (+ Header/Footer/Title/Description/Content) | cva: `variant` (default `frame`); deliberately square-cornered (BRAND.md) |
| `StatusPill` | `tone: green \| yellow \| red \| blue \| amber \| idle \| done` |
| `Notice` | `tone: info \| warning \| danger \| success \| accent` |
| `TextField` | `size: sm \| md`; always renders a visible `<label>`; hint/error wired to aria |
| `Select` | Radix; `size: sm \| md`, `clearable`, `mono`. **Not usable on the entrant tier** (portal + client events) |
| `Toast` / `ToastStack`, `Modal`, `Separator`, `StatusBar`, `CourtMark`, `GanttTimeline` | typed props |

### Console shared layer (`apps/console/src/components/`)

Documented in `apps/console/src/components/README.md`. Highlights:
`control-plane/PageBody` (the ONLY page width/gutter owner — variants
`data | form | prose`), `control-plane/ActionsBar`, the table vocabulary
(`DenseDataTable`, `BandedTable`, `BandedList`), `control-plane/DetailDock`
+ `DetailPanel`, `control-plane/SectionCard` (panel section + eyebrow
label), `control-plane/EmptyState`, `control-plane/Eyebrow`,
`DialogFooter` (`align: between | end`), `ActiveChoice` (the one
selected-state treatment), chips (`SourceChip`, `SchoolChip`,
`MatchChip`, `PendingBadge`), `StatusPill` (re-export of the shared one).

### Shared class constants

Some primitives are *strings*, not components — the treatment must apply
to varying elements (`<th>`, `<h3>`, `<td>`), or the tier cannot ship a
component at all (entrant). These are the Figma *text styles / effect
styles* of the system:

| Constant | Location | Treatment |
| --- | --- | --- |
| `INTERACTIVE_BASE` / `INTERACTIVE_BASE_QUIET` | `apps/console/src/lib/utils.ts` | Click feedback: transition, focus ring, press scale, disabled |
| `EYEBROW_CLASS` | same | The 10px semibold uppercase micro-label (tone appended by caller) |
| `TEXT_MUTED_2XS` / `TEXT_MUTED_XS` / `TEXT_MUTED_SM` | same | The secondary-text ladder |
| `TEXT_TITLE` / `TEXT_TITLE_SM` | same | Panel/row headings (base/sm semibold) |
| `TEXT_EMPHASIS` | same | `font-medium text-foreground` inline emphasis |
| `INPUT_INLINE_CLASS` | same | The unlabeled inline `<input>` skin (aria-label callers); labelled fields use `TextField` |
| `CARD` / `CARD_SKIN` | `apps/entrant/app/lib/ui.ts` | The entrant card (`rounded-lg border` + skin + `p-6 shadow-sm`) and its raw surface pair |
| `INPUT_SKIN`, `SELECT_CONTROL`, `BUTTON_SECONDARY` | same | Entrant form-control skins (native elements only) |

### The entrant constraint

The entrant tier (`apps/entrant/`) is SSR with **no hydration**: no event
handlers, no hooks with client effects, no portals. A shared component is
usable there only if it renders complete native HTML (`Button` with
`asChild`, `Notice`, `TextField` for labelled fields). Interactive
primitives (`Select`, `Modal`, `Toast`) are console-only; the entrant
equivalents are native `<select>`/`<details>` styled by the `ui.ts`
constants. Its page-weight gate counts HTML (not CSS), so primitives must
not add wrapper elements.

## Layout conventions

- **Console page anatomy:** `flex h-full min-h-0 flex-col` page root →
  `ActionsBar` (pinned, wraps rather than clips) → `min-h-0 flex-1
  overflow-auto` scroll region → `PageBody` (`data` full-width / `form`
  900px centered / `prose` 68ch). Only `PageBody` may combine `mx-auto`
  with `max-w-*` (contract-tested). Vertical rhythm is `space-y-*`
  passed via `PageBody`'s `className`.
- **Console responsive behavior is container-query-first**:
  `@container/table` drives column collapse in the table vocabulary
  (`priority: 2|3` columns). Viewport breakpoints are rare (~45 uses).
- **Entrant responsive behavior is stock Tailwind breakpoints**: `sm:`
  640px, `md:` 768px, `lg:` 1024px (`xl+` unused); `max-sm:` turns the
  season filter popover into a bottom sheet. Design targets: 1440×900
  desktop, 390×844 mobile (the surface-book viewports).
- **Theme/density:** `.dark` class on `<html>` (`useAppliedTheme`),
  `[data-density]` for compact mode. The TV display surface is
  intentionally dark-only.

## Naming conventions

- Tokens: `--<family>-<role>[-<state>]`, semantic over component-specific
  (`--surface-raised`, not `--card-bg`).
- Variant props are explicit unions (`tone`, `variant`, `size`, `align`),
  cva where variants multiply — these map directly to Figma variants.
- Class constants: SCREAMING_SNAKE, suffixed `_CLASS`/`_SKIN` when they
  are partial treatments meant for composition.
- New identifiers say *workspace*, not *tournament* (ADR 0014).

## Known inconsistencies (recorded, not silently normalized)

Deliberately left for a design decision — see ADR 0019:

- **Card radius:** shared `Card` is square (BRAND.md); the entrant card
  and console panels use `rounded-lg`/`rounded-sm`. Unify before building
  the Figma card component.
- **Status pill register:** shared/console `StatusPill` is uppercase
  `rounded-sm`; entrant `StatusChip` is sentence-case `rounded-full` with
  the same tone map.
- **Three EmptyState designs** (console centered zero-state, entrant
  card, bracket editorial section) share a name, not a design.
- **Entrant input radius** varies `rounded` vs `rounded-sm` between
  routes (`INPUT_SKIN` call sites).
- Console raw `<button>` elements (~200) outside dialogs/forms have not
  been swept onto `Button`; many are legitimate row affordances.
