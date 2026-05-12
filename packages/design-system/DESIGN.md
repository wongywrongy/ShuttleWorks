# DESIGN — Agent rulebook for @scheduler/design-system

**Companion to `design/BRAND.md`.** BRAND.md is the *spec*; this file is the *enforcement contract* for anyone (human or agent) writing code against the design system. Read both.

If you are an LLM agent writing code in this monorepo, treat this file as a hard rulebook. Violations get rejected.

---

## 0. What this package is

`@scheduler/design-system` is the single source of design truth for both products:

- `products/scheduler/frontend`
- `products/tournament/frontend`

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
- **Why:** Strict 11/12/14/16/18/24 type ladder (BRAND.md §2). Display sizes are handled by `font-display` + `clamp()`, not by ad-hoc Tailwind sizes.
- **Instead:** `text-2xs`, `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-2xl`. Display headers use `font-display text-display` (custom utility — TBD in Phase 6) or inline `style={{ fontSize: 'var(--display-min)' }}`.

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

---

## 2. Consumption pattern (how products import this)

Both products' top-level CSS file (scheduler `src/index.css`, tournament `src/styles.css`) becomes:

```css
@import '@scheduler/design-system/tokens.css';
@import '@scheduler/design-system/globals.css';
@tailwind base;
@tailwind components;
@tailwind utilities;

/* product-specific styles go below — keep them tiny */
```

Both products' `tailwind.config.js`:

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

`@scheduler/design-system` is product-agnostic. If you find yourself importing `../products/scheduler/...` from this package, stop. The dependency arrow goes one way: products → design-system, never the reverse.

If a thing is used by both products, it lives here. If it's used by one, it lives in that product. Don't pre-emptively generalize; extract on the second use, not the first.

---

## 10. When this file disagrees with BRAND.md

**BRAND.md wins.** This file is the enforcement; that one is the spec. If you spot a drift, raise it; don't silently choose one.
