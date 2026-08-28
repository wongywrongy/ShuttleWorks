# DESIGN — Agent rulebook for @scheduler/design-system

**Spec:** [`DESIGN_COLOR.md`](./DESIGN_COLOR.md) + [`tokens.css`](./tokens.css). This file is the
*enforcement contract* for anyone (human or agent) writing code against the design system.

If you are an LLM agent writing code in this monorepo, treat this file as a hard rulebook. Violations get rejected — **except** for the rules listed as superseded immediately below.

> ### ⚠ Partially superseded (2026-08-06)
>
> This file was written for the brutalist × Signal-Orange direction specified in `BRAND.md`.
> That direction was replaced by the two-layer token system; `BRAND.md` is now a superseded
> stub. The rules below no longer describe what ships — **follow `tokens.css` /
> `DESIGN_COLOR.md`, not these**:
>
> | Rule | Said | Ships |
> |---|---|---|
> | §1.2, §1.8.b | No soft shadows; hard offset only | Real Gaussian `--shadow-sm/md/lg` in light; none in dark (elevation = luminance) |
> | §1.3 | 90° corners; `rounded-sm` = 2px | Radius ladder 4→14px; `rounded-sm` = 6px; cards `rounded-lg`, pills `rounded-full` |
> | §1.9, §1.10, §1.11 | Accent = Signal Orange `#FF6B1A` | Accent = `--action-primary` azure; `--accent` is an alias of it |
> | §0 "both products" | the retired tournament frontend is a consumer | That product is frozen under `archive/tournament-pre-merge/`; the current consumers are the console and entrant apps |
>
> Everything else here (no raw hex, no default Tailwind palette colors, the spacing ladder,
> the type ladder, the one-font-family rule, mono reserved for tabular data) is **still
> binding** — those rules were never about the brutalist direction.
>
> A full rewrite of this file against the current tokens is logged in
> `docs/reference/debt-log.md`.

---

## 0. What this package is

`@scheduler/design-system` is the shared source of design truth for both current frontends:

- `apps/console/`
- `apps/entrant/`

It exports:
- `tokens.css` — CSS custom properties (palette light + dark, type scale, spacing ladder, animation keyframes)
- `globals.css` — `@layer base` rules + texture utility classes (`pin-marquee`, `scan-bar`, `sheen-overlay`, `gantt-grid`, `hatch`, `scanlines`, `grid-lines`)
- `tailwind-preset.js` — Tailwind theme preset (consumed via `presets: [require('@scheduler/design-system/tailwind-preset')]` in each product's `tailwind.config.js`)
- *(Phase 3)* `icons/` — custom domain SVG components
- *(Phase 4)* `components/` — shared UI primitives (Button, Card, Badge, Modal, …)

---

## 1. The hard rules

Each rule has a **why** and a **what to do instead**.

### 1.1 No raw hex / RGB color literals in product code
- **Why:** the entire palette swap between Phase-1 slate-blue and Phase-6 brutalist relies on changing CSS variables in one file. Hex literals in JSX/CSS bypass the layer and create dead spots.
- **Instead:** `bg-bg`, `text-ink`, `border-rule`, `text-status-live`, `bg-status-blocked-bg`. Or `hsl(var(--ink) / 0.5)` in plain CSS.

### 1.2 No `shadow-sm`, `shadow-md`, `shadow-lg` anywhere
- **Why:** BRAND.md §6 — brutalism is opposed to soft shadow; premium-dark uses substrate elevation instead.
- **Instead:** Use `--bg-elev` (a slightly lighter substrate) + 1px border for cards. For modals/popovers, the design system provides a hard offset shadow via `--shadow-hard` (light mode only).

### 1.3 No `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full`
- **Why:** BRAND.md §3 — 90° corners default. 2px max on interactive form controls only.
- **Instead:** `rounded-none` everywhere (also the default). `rounded-sm` (2px) on `<input>`, `<button>`, `<select>`, `<textarea>`. **Never** on `Card`, `Badge`, `Pill`, `Modal`, `Dropdown`, dividers, page chrome.

### 1.4 No emoji in UI strings
- **Why:** BRAND.md §7 — ASCII syntax is brutalist signature; emoji are AI-slop signal.
- **Instead:** ASCII syntax: `[ LIVE ]`, `>>>`, `<<<`, pipe `|` separators. Or icons from the design-system icon set.

### 1.5 No italics
- **Why:** BRAND.md §2 anti-pattern — brutalism rejects italic.
- **Instead:** Bold for emphasis. Uppercase mono for identifiers. Eyebrow class for labels.

### 1.6 No default Tailwind palette colors (`bg-blue-500`, `text-red-600`, etc.)
- **Why:** Same as 1.1. They bypass the token system. Particularly insidious because they "look fine."
- **Instead:** Use the brand semantic tokens. If you need a status hue: `text-status-live`. If you need destructive: `text-destructive` (legacy alias, kept). If you need accent: `text-accent`.

### 1.7 No arbitrary `px` values outside the spacing ladder
- **Why:** BRAND.md §4 — strict 0/2/4/8/12/16/24/32/48/64/96 ladder. Random `px-7`, `mt-9` etc. compound into visual noise.
- **Instead:** Tailwind defaults (`p-2`, `gap-4`, etc.) map to the ladder. For brand-named scale: `p-b-3` (8px), `gap-b-5` (16px), `mt-b-7` (32px). For density-aware: `py-cell`, `px-cell`, `gap-section`.

### 1.8 No `text-xl`, `text-3xl`, `text-4xl`, etc.
- **Why:** Strict 10/11/12/14/16/18/24 type ladder (BRAND.md §2 + `--text-3xs` added 2026-05-12 to absorb a long tail of micro-stamp arbitraries). Display sizes are handled by `font-display` + `clamp()`, not by ad-hoc Tailwind sizes.
- **Instead:** `text-3xs` (10px micro-stamp / status pill / footnote), `text-2xs` (11px overline / eyebrow / SectionHeader), `text-xs` (12px metadata), `text-sm` (14px body), `text-base` (16px), `text-lg` (18px), `text-2xl` (24px). Display headers use `font-display text-display` (custom utility — TBD in Phase 6) or inline `style={{ fontSize: 'var(--display-min)' }}`. Below `text-3xs` is off-scale.

### 1.8.b Shadows resolve to brand hard-offset only
- **Why:** BRAND.md §6 — Gaussian drop shadows clash with the brutalist chrome. Every elevation should land on the same `0 4px 0 hsl(var(--rule))` offset in light mode, dropping to none in dark.
- **Instead:** The Tailwind preset overrides `boxShadow.{sm, md, lg, xl, 2xl}` to resolve to `var(--shadow-hard)`. Use the utilities (`shadow-lg`, `shadow-xl`) — never `shadow-[<custom>]` arbitraries. `shadow-inner` keeps its own brand mapping for grid-cell drag highlights.

### 1.8.c One font family — mono is for tabular data only
- **Why:** Visual coherence. The operator should never feel a font shift while their eye sweeps a row. Decorative mono (mono nav labels, mono section eyebrows, mono description copy) breaks that.
- **`--font-sans`** (the default) carries: body, headings, labels, eyebrows, SectionHeader, buttons, descriptions, error/warning copy, search inputs, comboboxes, dropdown options, banner messages — everything that's words.
- **`--font-mono`** is reserved for:
  - **Scores** — `21-19`, set columns
  - **Rank codes** — `MS1`, `WD2`, `XD3`
  - **Time stamps** — `09:30`, `14:45`
  - **Court IDs** — `C3`, `C12`
  - **Elapsed timers** — `02:34`, `1h 15m`
  - **Numeric form inputs** for codes (event-rank `<select>` / `<input>`, score number inputs)
  - **Solver progress logs** — the streaming log lines that mimic terminal output
  - **TV / public-display tactical-telemetry surfaces** — the `/display` route specifically embraces a Bloomberg-Terminal aesthetic; whole panels there may be mono by design
- **Test**: if a class applies `font-mono` to a wrapper rather than the specific data point, audit it. Either the wrapper exclusively holds tabular data (acceptable) or it's bleeding mono onto prose (replace).

### 1.9 No new colors outside the palette
- **Why:** A single warm accent (Signal Orange) + ink scale + status palette is the entire design space. Adding hues collapses the discipline.
- **Instead:** If a status needs differentiation, add a new `--status-*` token in `tokens.css` and use it through the `status.*` Tailwind color. **Never** invent a one-off color in a component.

### 1.10 Never use `--status-*` colors for non-status emphasis
- **Why:** They have semantic meaning (live, called, blocked, idle, done). Using `text-status-live` to mean "highlight" creates false signal.
- **Instead:** `text-accent` for brand emphasis (Signal Orange). `text-ink` for primary. `text-ink-muted` for secondary.

### 1.11 Accent vocabulary (Phase 6 complete — naming now aligns with BRAND.md)
- `bg-accent` / `text-accent` / `border-accent` / `ring-accent` → Signal Orange (`--accent`).
- `bg-accent-bg` → tinted callout surface (pale-orange light / dark-orange dark).
- `text-accent-ink` → text on accent fill (white on light substrate, dark on dark).
- `text-accent-foreground` kept as an alias for `text-accent-ink` so any straggler call-site keeps compiling.
- Focus rings: `focus:ring-ring` resolves to `--ring → var(--accent)` = Signal Orange. Use `ring-ring`, not `ring-accent`, in focus contexts so the semantic name reads correctly.
- Surface hover gray previously called `bg-accent` is now `bg-muted/40`. Don't reintroduce the old meaning.

### 1.12 Accent reservation — the accent means "act" (SP-CONSOLE-5 ACC-N1)

**Resting accent ink is reserved for exactly four things: a primary action,
active nav, a genuine navigation link, and selected state. An identifier is
never accent-inked.**

The accent had drifted into carrying seven jobs at once — nav state, links,
primary buttons, event codes, draw codes, segmented-control selection and
progress bars. On Bracket Matches that rendered 110 blue event codes down one
column, which reads as 110 actions on a surface where the codes do nothing.

- Event / draw / match **codes** render in body ink (`text-foreground`). The
  row is the affordance. Ruled first on the draws list as DRW-2 and generalised
  here.
- **Progress bars** use status tokens (§4), never the accent.
- Interaction states (`hover:border-accent`, `focus:ring-ring`) are not ink and
  are unaffected — colouring a control's response to the pointer is what the
  accent is for.

Held by `platform/contracts/__tests__/accentContract.test.ts`, which scans
`className` values carrying `sw-num` (the class every code slot uses) for
resting `text-accent`, with a documented allowlist for selection state.

---

## 1.13 Page containers — one anchor, one gutter (SP-CONSOLE-5 LAY-1)

`components/control-plane/PageBody.tsx` is the console's only content
container. Before it there were four families and three gutter values, and the
two that looked most alike were the same box measured twice: Configuration and
the workspace settings pages both centred a `max-w-3xl` column, but one spent
its gutter outside the scroll region (`px-4`) and the other inside the column
(`p-6`), so their text started 24px apart.

| Variant | Bound | Use |
|---|---|---|
| `data` | full width, page gutter | tables, grids, boards — bounding them hides columns to no purpose |
| `form` | `max-w-[900px]`, centred, page gutter | every settings and configuration surface |
| `prose` | `max-w-[68ch]` | descriptive paragraphs **inside** a `form` body |

`prose` is measured in characters, not pixels: the readable band is 45–75
characters (WCAG 1.4.8 caps non-CJK at 80), which is a property of the text —
a px bound silently leaves that band the moment the type scale moves. A lone
`<p>` takes `PAGE_BODY_WIDTH.prose` directly rather than gaining a wrapper
element; the bound comes from the same table either way.

Held by `platform/contracts/__tests__/pageContainerContract.test.tsx`: the DOM
half asserts the component renders what it declares, and the source half fails
on any surface that pairs `mx-auto` with `max-w-*` outside a reasoned
allowlist — which is the half that catches the regression, because the drift
arrived as eight files each centring their own column.

---

## 2. Consumption pattern (how products import this)

The top-level CSS files (`apps/console/src/index.css` and `apps/entrant/app/app.css`)
import the same package layers:

```css
@import '@scheduler/design-system/tokens.css';
@import '@scheduler/design-system/globals.css';
@tailwind base;
@tailwind components;
@tailwind utilities;

/* product-specific styles go below — keep them tiny */
```

Both `apps/console/tailwind.config.js` and `apps/entrant/tailwind.config.js` use the preset:

```js
const preset = require('@scheduler/design-system/tailwind-preset');

export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // product-specific theme.extend if absolutely needed (rare)
};
```

That's it. Most of each product's old config is now dead and can be deleted.

---

## 3. Dark mode

- **Mechanism:** `.dark` class on `<html>` element (matches scheduler's existing `AppearanceSettings.tsx`).
- **Toggle UI:** scheduler already has one in Settings → Appearance. Tournament adds a header-button toggle in Phase 2b.
- **Behavior:** every canonical token (`--bg`, `--ink`, `--rule`, etc.) has a paired value in `.dark`. No component should know the mode — it reads `bg-bg`, `text-ink`, etc., and the substrate flips automatically.
- **Don't:** condition behavior on `mode === 'dark'` in JS — use CSS only.
- **Don't:** define palette overrides in components. Tokens are the only place.

---

## 4. Status palette guidance

Status colors carry meaning and **must not be used as brand color or general emphasis**:

| Token | Meaning |
|---|---|
| `--status-live` | Match in progress on a court |
| `--status-called` | Called to court, not yet started |
| `--status-started` | Operator started the clock |
| `--status-blocked` | Hard rule conflict / out-of-service |
| `--status-warning` | Soft violation (warning, not block) |
| `--status-idle` | Scheduled but not yet active |
| `--status-done` | Finished |

Each has a `-bg` variant for tinted backgrounds. Use them in `StatusPill`, Gantt blocks, MATCHES list, control center workflow chips. Nowhere else.

### 4.1 X6 — the status ink budget (SP-CONSOLE-3)

**Containers (pills/chips/badges) are reserved for exceptional, time-sensitive
states: LIVE, CALLED, LATE, and error conditions. Default states (READY,
PENDING), terminal states (DONE), and identity metadata use plain text, ink
weight, or data (scores, fractions). No list column may render the same chip on
every row — a chip whose value never varies within a surface is decoration, not
information.**

Rendering ladder for dense operator lists and panels:

| State class | Treatment |
|---|---|
| PENDING | plain text, muted ink, normal weight (no fainter checked ink exists — `--ink-faint` aliases `--text-muted`, so weight is the second step) |
| READY | plain text, muted ink, semibold |
| LIVE | chip (dot + tinted container) — the only routine chip |
| CALLED / LATE | chip, respective status tokens (queue/ops contexts) |
| DONE | **no label** — the right-aligned score in tabular figures *is* the status (X6-D; supersedes the SP-CONSOLE-2 X3 chip-plus-score ruling) |
| Error / blocked | chip, error token |

The one match-list renderer is `MatchStatus`
(`apps/console/src/components/control-plane/matchStatus.tsx`); its property test
asserts the rendered DOM, with a demonstrated negative control. **Exemption:**
glance-at-distance operator surfaces — Live day court cards, Plan grid fills,
the venue TV — keep their high-contrast fills (SP-CONSOLE-2 PLAN-1 rationale);
X6 governs dense lists and panels only.

**Result side blocks (SP-CONSOLE-3A RES-1).** Score is a per-side fact, so
the finished panel's Result renders as TWO side blocks (`ResultSides` in
`control-plane/MatchCard.tsx`, both engines): each block nests its player
rows beside a rail carrying the side's identity ONCE (Meet school chip /
Bracket event badge — never repeated per player row) and the side's score
in a fixed-width tabular slot, vertically centered, that holds a games
tally ("2") or set scores without layout change. Winner reads by
**weight** — bolder score and names on the winning block; no dot, no fill
(the `WinnerDot` stays a list/`MatchCard` cue). A hairline separates the
blocks; the court · time caption sits below.

---

## 5. Typography quick rules

| Role | Family | Weight | Case | When |
|---|---|---|---|---|
| Display H1 | `font-display` (Inter Black 900) | 900 | UPPER | Page title, marquee section labels, hero numerics |
| Body H1/H2/H3 | `font-sans` (Geist Variable) | 600 | Sentence | Page subtitles, section headers, dialog titles |
| Body p | `font-sans` | 400 | Sentence | Reading copy, descriptions, hints |
| Label | `font-sans` | 500 | Sentence | Form labels, button text |
| Eyebrow | `font-mono` (JetBrains Mono) | 600 | UPPER | Above section titles, in `[ BRACKETS ]` |
| ID / metadata | `font-mono` | 400 | UPPER | Court IDs, match IDs, timestamps, scores |

`.eyebrow` class in `globals.css` is the canonical eyebrow style — use it.

---

## 6. Component file size

Hard limit: **300 lines** per component file. Plan §Phase 5 calls this out — it's not aspirational, it's the contract. If a file passes 300 lines:

1. Extract sub-components into the same folder
2. Extract logic into hooks (`use*.ts`)
3. Use per-page Context if prop counts exceed ~6
4. If still oversized, the component is doing too much — re-decompose

---

## 7. Reusing the texture system

`globals.css` provides these utility classes. Use them; don't reinvent:

- `.pin-marquee` — animated dashed border (in-flight states)
- `.scan-bar` — single light bar sweep (one-shot signals)
- `.sheen-overlay` — diagonal light pass (proof of optimal)
- `.gantt-grid` — dotted background (schedulable canvas)
- `.hatch` — diagonal hatch (out-of-service / blocked)
- `.scanlines` — dark-mode CRT scanlines (opt-in on `<body>`)
- `.grid-lines` — razor-thin grid dividers via `gap: 1px` trick

For new textures, propose them in BRAND.md §8 first.

---

## 7.5 Motion — see MOTION.md

Motion has its own rulebook: **`packages/design-system/MOTION.md`** (canonical) plus the date-stamped audits under `design/motion-audit-*.md`. Skim §1-§2 of MOTION.md before adding any animation; reach for the duration tokens (`duration-fast/standard/moderate`) + `ease-brand` for every new transition.

> Quick gate: high-frequency interactions (tab clicks, row selects, score entry, solver-tick) get **zero motion**. Save/modal/banner mounts get the Jakub recipe (opacity + translateY + blur, 300ms, spring bounce-0). One Jhey delight beat lives on save-success (the existing `.sheen-overlay`). Anything else needs to justify itself against MOTION.md §10 anti-patterns.

## 8. The motion budget

Two questions to ask before adding any animation:

1. **Does this encode system state?** If no, delete it.
2. **Is it gated by `prefers-reduced-motion`?** If continuous, must have a static fallback in `globals.css`.

Forbidden animations are listed in BRAND.md §5. The list is exhaustive — don't add to it.

---

## 9. Don't put product code in this package

`@scheduler/design-system` is product-agnostic. If you find yourself importing `../../apps/...` from this package, stop. The dependency arrow goes one way: apps → design-system, never the reverse.

If a thing is used by both products, it lives here. If it's used by one, it lives in that product. Don't pre-emptively generalize; extract on the second use, not the first.

---

## 10. When this file disagrees with the spec

**`tokens.css` wins, then `DESIGN_COLOR.md`, then this file.** The shipped tokens are the
ground truth; `DESIGN_COLOR.md` explains them; this file enforces how components may consume
them. `MOTION.md` wins on motion. `BRAND.md` is superseded and wins on nothing.

If you spot a drift, raise it — don't silently choose one. That precedence used to point at
`BRAND.md`, which is exactly how this file spent months describing a design the product had
already replaced.
