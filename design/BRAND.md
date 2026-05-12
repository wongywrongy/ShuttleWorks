# BRAND — Scheduler × Tournament

**Status:** locked direction, palette accent TBD in board review (Phase 1.b).
**Scope:** both products under `products/` consume this brand. No surface exempt.
**Authored:** 2026-05-12. Authority over any prior CSS conventions in either product.

---

## 0. Resolved Tension

The locked direction is **industrial brutalist × premium dark editorial**, with first-class **light AND dark mode**.

The brutalist rulebook says *"never mix light and dark substrates within the same interface."* That rule applies to two different surfaces in one app — it does NOT forbid a runtime mode switch where the **entire** UI flips substrate. Our resolution:

- **Light mode** = Swiss Industrial Print substrate (matte paper, carbon ink, hazard accent).
- **Dark mode** = Tactical Telemetry substrate (deactivated CRT, white phosphor, hazard accent).
- **Same** grammar, layout, type system, ASCII syntax, hard 90° corners across both modes. Only the substrate variables (`--bg`, `--ink`) and one or two texture overlays differ. A user never sees both substrates at once.

The premium-dark-editorial side enforces restraint: no decorative noise for its own sake, no theatricality, no 47 layered drop shadows. The brutalist side enforces structure: rigid grids, ASCII framing, monospace numerics, visible compartmentalization. They cohabit cleanly because both reject decoration and demand discipline.

---

## 1. Palette — Substrate, Ink, Accent

All values defined as semantic CSS custom properties in `packages/design-system/tokens.css`. **No raw hex in product code.**

### Light mode (Swiss Industrial Print)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F4F4F0` | Page background. Unbleached documentation paper. |
| `--bg-elev` | `#FFFFFF` | Elevated cards, panels. Crisp white sheet. |
| `--ink` | `#0A0A0A` | Primary text. Carbon ink. |
| `--ink-muted` | `#4A4A48` | Secondary text, metadata. |
| `--ink-faint` | `#9A9A98` | Disabled, ghost. |
| `--rule` | `#0A0A0A` | Border, divider, grid line. Always full opacity black on light mode. |
| `--rule-soft` | `#D8D6D0` | Inner divider where full-strength would be too loud. Used in dense tables. |
| `--accent` | `#FF6B1A` | Signal Orange. Single hazard accent. One. |
| `--accent-bg` | `#FFF1E8` | Tinted callout surface (hover, focus halo, soft emphasis). |
| `--accent-ink` | `#FFFFFF` | Text on accent fill. |

### Dark mode (Tactical Telemetry)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0A0A` | Page background. Deactivated CRT. **Never pure #000.** |
| `--bg-elev` | `#141414` | Elevated cards. One step warmer than substrate. |
| `--ink` | `#EAEAEA` | Primary text. White phosphor. **Never pure #FFF.** |
| `--ink-muted` | `#9A9A9A` | Secondary text, metadata. |
| `--ink-faint` | `#555555` | Disabled, ghost. |
| `--rule` | `#EAEAEA` | Border, divider — phosphor on substrate. |
| `--rule-soft` | `#2A2A2A` | Inner divider in dense tables. |
| `--accent` | `#FF6B1A` | Signal Orange. Same hue both modes, by brutalist rule. |
| `--accent-bg` | `#2A1808` | Tinted callout surface (hover, focus halo, soft emphasis). |
| `--accent-ink` | `#0A0A0A` | Text on accent fill. |

### 1.c — Brand accent (locked 2026-05-12)

**Brand accent: Signal Orange `#FF6B1A`** — same hex in both light and dark mode (brutalist single-accent rule). Rationale: aviation/safety-marker hue — brutalist-canonical, warm, distinct from `--status-blocked` red and `--status-called` amber. Reads premium-dark-editorial without losing industrial edge.

Hazard red `#E61919` was rejected because it collides with scheduler's existing `--status-blocked` and `--destructive` semantics. Phosphor green `#4AF626` was rejected as too "Matrix"-y on light substrate.

**Accent rule: ONE accent across the system.** Status colors (`live` / `called` / `started` / `blocked` / `idle` / `done`) live in their own semantic namespace and are NOT brand colors — never use a status color for general emphasis on neutral content.

### Status palette (unchanged from scheduler, re-tinted slightly for both modes)

Inherits scheduler's existing `--status-live`, `--status-called`, `--status-started`, `--status-blocked`, `--status-idle`, `--status-done` with their `-bg` tinted variants. Dark-mode variants get adjusted lightness to maintain contrast on `#0A0A0A`. **Status colors are not brand accent — never use them for emphasis on neutral content.**

---

## 2. Typography

Three roles. Strict ladder. No ad-hoc sizes.

### 2.a Display — Macro structural type
- **Family:** `Inter` (variable, weight `900` / "Black"). Pre-loaded in tournament already, add to scheduler. Fallback: `Archivo Black`, `Monument Extended`, system bold-sans.
- **Casing:** UPPERCASE only.
- **Tracking:** `-0.04em` (tight, glyphs form a wall).
- **Leading:** `0.9`.
- **Scale:** `clamp(2.5rem, 6vw, 6rem)` for page-level titles; `clamp(1.5rem, 3vw, 2.5rem)` for section labels.
- **Use:** Page title H1, marquee section labels, large numerics on PublicDisplay.

### 2.b Body — Reading & UI sans
- **Family:** `Geist Variable` (already loaded in scheduler; added to tournament). Fallback: `Inter Variable`, system-ui.
- **Casing:** Sentence case.
- **Tracking:** `0` (default).
- **Leading:** `1.4` (body), `1.2` (UI labels).
- **Scale:** strict ladder `11 / 12 / 14 / 16 / 18 / 24 px` (preserves scheduler's existing ladder).
- **Use:** Body copy, form labels, button text, hint text, descriptions.

### 2.c Mono — Data, telemetry, identifiers
- **Family:** `JetBrains Mono Variable` (already loaded in both products). Fallback: `IBM Plex Mono`, ui-monospace.
- **Casing:** UPPERCASE for IDs, identifiers, status tags, metadata. Mixed for editable numeric input.
- **Tracking:** `0.06em` (mechanical typewriter feel).
- **Leading:** `1.3`.
- **Scale:** `10 / 11 / 12 / 14 px`. Tabular figures always (`font-variant-numeric: tabular-nums`).
- **Use:** Court IDs, match IDs, timestamps, scores, solver telemetry, all numerics, all status pills, eyebrow labels.

### Anti-patterns
- **No** ad-hoc `text-xs`, `text-xl` etc. outside the ladder.
- **No** mixing Geist + Inter Black at the same role.
- **No** lowercase Mono identifiers.
- **No** italics anywhere. Brutalism rejects italic.

---

## 3. Layout & Spatial Engineering

### Grid
- All page-level layout uses **CSS Grid**, not flex. Flex is for in-row composition only.
- Tracks are anchored to the spacing scale (§4). No `width: 47.3%`.
- Razor-thin dividers via the `grid-gap` trick: `display: grid; gap: 1px; background: var(--rule)` on the parent, `background: var(--bg-elev)` on children. Yields 1px lines without per-cell borders.

### Corners
- `border-radius: 0` is the default.
- Maximum allowed radius: `2px` and ONLY on interactive form controls (input, button, checkbox). Cards, panels, modals, badges, pills, dropdowns — **all 90°**.
- Tournament currently uses `rounded-lg` (`0.5rem`) widely. Phase 6 strips it.
- Scheduler uses `rounded` (`0.375rem`) widely. Phase 6 reduces to `0` or `2px`.

### Borders
- Default: `1px solid var(--rule)`.
- Heavy structural: `2px solid var(--rule)` for major compartment boundaries (page header bottom, section dividers).
- Forbidden: dashed/dotted borders as decoration. Allowed only when carrying semantic state (e.g., drag preview, focus ring).

### Density
- Inherits scheduler's existing comfortable/compact density tokens. Light mode defaults comfortable. Dark mode (telemetry) defaults compact to honor data-density heritage. Both modes still respect the toggle.

---

## 4. Spacing Scale

**Strict ladder.** No arbitrary px values in product code. The ladder lives in `tailwind-preset.js` and is enforced via lint rule (deferred).

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--space-0` | `0` | `0` | |
| `--space-1` | `2px` | `0.5` | Hairline offsets in mono labels |
| `--space-2` | `4px` | `1` | Tight cell padding (compact mode) |
| `--space-3` | `8px` | `2` | Default inline gap, button padding-y |
| `--space-4` | `12px` | `3` | Form control padding, card inner |
| `--space-5` | `16px` | `4` | Section gap (compact), button padding-x |
| `--space-6` | `24px` | `6` | Section gap (comfortable), card outer |
| `--space-7` | `32px` | `8` | Page block gap |
| `--space-8` | `48px` | `12` | Hero/marquee block spacing |
| `--space-9` | `64px` | `16` | Page top margin, oversized negative space |
| `--space-10` | `96px` | `24` | Display-type breathing room |

Tournament's current ad-hoc `gap-4`/`px-6` map cleanly. Scheduler's density tokens map onto `--space-2` through `--space-6`.

---

## 5. Motion Budget

Motion exists; it is **never decorative**. Every animation must encode information about system state.

### Allowed
- `marching-ants` (scheduler existing) — solver speculation in progress. Encode info.
- `scan-sweep` (scheduler existing) — committed proposal preview. Encode info.
- `gantt-grid` dotted bg (scheduler existing) — schedulable canvas affordance.
- `phase-glow` (scheduler existing) — court phase transition. Encode info.
- Standard hover state: 80ms ease-out opacity/color crossfade. Cubic-bezier `(0.22, 1, 0.36, 1)` (scheduler's existing easing).
- Modal open: 120ms scale 0.98→1.0 + opacity. Close: 80ms.

### Forbidden
- Parallax.
- Spring-bounce scaling on hover.
- Continuous idle "breathing" animations on anything except solver-thinking indicators.
- Color cycling.
- GSAP scroll-pinning (gpt-taste territory; we are not gpt-taste).
- Loaders that spin without representing actual work.

### Reduced motion
Honor `prefers-reduced-motion: reduce` — replace `marching-ants` with a static dashed pattern, replace `scan-sweep` with a static highlight, disable `phase-glow`.

---

## 6. Shadow & Elevation

**Brutalism is opposed to soft shadow.** Premium dark editorial allows minimal elevation cues. The blend's rule:

- **Light mode:** No box-shadow on anything. Elevation is signaled by `--bg-elev` background contrast + 1px border. Modals get a single hard offset shadow `0 4px 0 var(--rule)` (no blur). Popovers get `0 2px 0 var(--rule)`.
- **Dark mode:** No box-shadow. Elevation is `--bg-elev` only (#141414 over #0A0A0A). Modal/popover get a 1px `--rule` border, no offset.

Scheduler currently uses `shadow-sm`/`shadow-lg` 12+ times. Phase 6 strips all of it.

---

## 7. ASCII Syntax & Symbology

Brutalist signature. **Used purposefully**, not as decoration.

### Required usage
- **Eyebrow labels:** `[ SECTION NAME ]`, `[ COURT-04 ]`, `[ LIVE ]` — square brackets framing uppercase mono.
- **Directional chevrons:** `>>>` for next-action affordances, `<<<` for back/undo.
- **Pipe dividers** in inline metadata: `COURT-04 | 14:32 | T-180s`.
- **Status prefixes:** `[ LIVE ]`, `[ BLOCKED ]`, `[ IDLE ]` in StatusPill component — replaces colored dots in tournament.
- **Crosshair markers** (`+`) at major grid intersections on PublicDisplay layouts.

### Optional / contextual
- **Registration marks** `®`, `™` as structural punctuation when product naming.
- **Slashes** `///` as repeating texture in marquee zones.
- **Barcode strips** (repeating 1px vertical lines) as section dividers on PublicDisplay.

### Forbidden
- Emoji ANYWHERE. Lint rule blocks it.
- Decorative ASCII art (think `(╯°□°)╯︵ ┻━┻`).
- ASCII text that obscures content.

---

## 8. Texture & Surface Treatment

### Inherited from scheduler (lifted into design-system, reusable)
- `gantt-grid` — dotted-grid background pattern. Use on schedulable canvases.
- `marching-ants` — animated dashed border for in-flight states.
- `scan-sweep` — vertical light bar sweep, single pass on commit preview.
- `phase-glow` — radial pulse on phase transitions.

### New, brutalist signature additions
- **Global noise overlay** — low-opacity SVG noise filter on `body`, both modes. Adds physical grain. Implementation: `feTurbulence` + `feColorMatrix` to grayscale, ~3% opacity, fixed.
- **CRT scanlines (dark mode only)** — `repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 3px)` on `body::after`. Subtle. Toggleable via density "compact" mode.
- **Hatch fills (status surfaces)** — diagonal 1px hatch on `--status-blocked-bg` and `--status-idle-bg` so they read as "out of service" texture rather than just tinted plain.

### Forbidden
- Gradients of any kind (linear or radial) outside of the scanline/noise effects above.
- Glassmorphism / backdrop-blur.
- Halftone applied to live UI (only allowed on reference imagery or static brand assets).

---

## 9. Iconography Brief

Full spec in `packages/design-system/icons/README.md` (Phase 3). Summary:

- **Custom domain set** (~12–15 inline SVG React components) on a **24×24 grid**, **1.75px stroke**, square caps, square joins. Style: technical-drawing / blueprint linework, not Phosphor-style organic.
- **Phosphor light** (existing) stays for generic affordances. Phosphor is **not** brand; the custom set is.
- Both render at `1em` and inherit `currentColor` — no hardcoded color in icons.
- API: `<IconCourt size={16} weight="regular" />` — mirrors Phosphor for swap-compatibility.

---

## 10. Anti-Patterns (blocklist for Phase 6 visual sweep)

These are forbidden everywhere in product code. Lint rules to follow:

1. **Raw hex/RGB in JSX or CSS** outside `tokens.css`. Use tokens.
2. **`shadow-sm` / `shadow-md` / `shadow-lg`** anywhere. Removed.
3. **`rounded-2xl`, `rounded-xl`, `rounded-lg`, `rounded-md`** — replaced with `rounded-none` or `rounded-sm` (=2px) only on interactive controls.
4. **Default Tailwind palette colors** (`bg-blue-500`, `text-emerald-700`, etc.). Use tokens only.
5. **Emoji** in any UI string.
6. **Mixed-case mono IDs** (`court-04` should be `COURT-04`).
7. **Italics**.
8. **Continuous spin/pulse loaders** that don't represent real work.
9. **Gradient backgrounds** outside the engineered scanline/noise overlays.
10. **px values** outside the spacing scale (§4) in style declarations.

---

## 11. What's Coming Next (Phases 2–7)

- **Phase 2a:** npm workspace adoption (root `package.json`).
- **Phase 2b:** `packages/design-system/{tokens.css, tailwind-preset.js, DESIGN.md}`. Implements §1–§8 as actual code.
- **Phase 3:** `packages/design-system/icons/` — domain SVG set per §9.
- **Phase 4:** Extract Button/Card/Badge/Modal/Hint/etc. into the package.
- **Phase 5:** Refactor 4 megacomponents + tournament SetupForm.
- **Phase 6:** Apply: strip rounded-*, strip shadows, swap to tokens, add ASCII to all status pills, drop noise overlay.
- **Phase 7:** Visual diff vs `design/baseline/` (when captured) + walk all routes both modes.

---

## 12. Identity Boards (Phase 1.b)

Reference imagery from the `brandkit` skill lives in `design/identity/`. Generate:

1. Light substrate macro typography composition (page H1 over `#F4F4F0` with hazard accent)
2. Dark substrate telemetry dashboard composition (court Gantt slice with mono numerals)
3. Icon-art reference sheet (24-grid technical line work, 12 domain glyphs)
4. ASCII syntax inventory ([ brackets ], >>>, crosshair markers, barcode dividers)
5. Anti-AI-slop comparison: before (current scheduler slate-blue) vs after (locked direction)

Boards are reference, not source-of-truth. **This file is the source of truth.** Boards illustrate it.
