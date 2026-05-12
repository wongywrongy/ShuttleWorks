# Icons — @scheduler/design-system

Custom domain icon set for the scheduler + tournament products. 15 inline SVG React components on a 24×24 grid, technical-drawing style, inherits `currentColor`.

This set carries domain personality. `@phosphor-icons/react` stays as the **secondary** set for generic UI affordances (chevrons, close, drag handles, copy, etc.) — it does **not** carry brand.

---

## Quick start

```tsx
import { IconCourt, IconLive, IconBracket } from '@scheduler/design-system/icons';

<IconCourt size={16} />
<IconLive  size="1em" weight="bold" className="text-status-live" />
<IconBracket size={20} aria-label="Tournament bracket" aria-hidden={false} />
```

---

## API

```ts
interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;       // default '1em'
  weight?: 'regular' | 'bold';  // default 'regular'
}
```

- `size` accepts any CSS length. Defaults to `'1em'` so the icon scales with surrounding text.
- `weight` toggles stroke thickness: `regular` = 1.75px, `bold` = 2.5px.
- `currentColor` everywhere — never set `fill` or `stroke` color on the SVG. Use `text-*` Tailwind classes or `color` CSS instead.
- Spreads remaining SVG props (className, aria-label, role, onClick, etc.). Defaults `aria-hidden="true"` since icons are usually decorative — pass `aria-hidden={false}` + `aria-label` for icons that carry meaning by themselves.

This API mirrors `@phosphor-icons/react` so swap is mechanical:

```tsx
// Before
<Article weight="regular" size={20} />
// After (where domain meaning fits)
<IconCourt weight="regular" size={20} />
```

---

## The 15 icons

### Domain (5)
| Component | Role |
|---|---|
| `IconCourt` | Badminton court — outer + net + center service line |
| `IconRacket` | Racket profile — circular head + handle |
| `IconShuttle` | Shuttlecock — cork nose + flared skirt |
| `IconBracket` | Tournament bracket — 4-entry single-elim feed |
| `IconDraw` | Die with 4 pips — random-seed metaphor for the draw |

### Match state (6) — pair with `--status-*` colors
| Component | Status token | Meaning |
|---|---|---|
| `IconLive`     | `status-live`     | Match in progress on a court |
| `IconCalled`   | `status-called`   | Called to court |
| `IconStarted`  | `status-started`  | Operator started the clock |
| `IconBlocked`  | `status-blocked`  | Hard rule conflict / out-of-service |
| `IconIdle`     | `status-idle`     | Scheduled, not yet active |
| `IconDone`     | `status-done`     | Finished |

### Operator / system signals (4)
| Component | Role |
|---|---|
| `IconAdvisory`        | Soft warning — triangle + bang |
| `IconDisruption`      | Hard interruption — lightning bolt |
| `IconSolverThinking`  | Telemetry waveform — solver objective moving |
| `IconApply`           | Commit a proposal — arrow into square |

Need a 16th? Open an issue / extend `icons/index.tsx`. Keep additions on the 24×24 grid, technical-drawing aesthetic, stroke-only (no per-variant fill paths unless absolutely required).

---

## Design constraints (BRAND.md §9)

- **Grid:** 24×24. All coordinates fall on integer or 0.5 steps.
- **Stroke:** 1.75px regular, 2.5px bold. `stroke-linecap="square"`, `stroke-linejoin="miter"` — sharp corners, no rounded softness.
- **Style:** technical-drawing / blueprint linework. Think engineering diagrams, control-panel iconography. NOT organic, NOT decorative.
- **Color:** never hardcoded. Always `currentColor` via parent text color.
- **Composition:** prefer 1-3 paths per icon. Readable at 12-16px is the test.
- **Anti-patterns:**
  - Gradient or multi-stop fills
  - Emoji-style softness
  - Drop shadows on glyphs
  - Color baked into the SVG

---

## How they swap

Tournament currently has zero icons (text + colored dots). After Phase 6 visual sweep:

- `<Light color="bg-emerald-500" label="done" n={...} />` (in `TopBar.tsx`) becomes  
  `<IconDone size={12} className="text-status-done" /> {n}` — visual + textual, no colored-circle abstraction.
- Tournament tab buttons can take a leading icon (`IconBracket` for Draw, `IconCourt` for Schedule, `IconLive` for Live).
- Status pills become `[ <IconLive size={11} /> LIVE ]` inside the brutalist eyebrow-style pill component (Phase 4 primitive extraction).

---

## Where this differs from Phosphor

- **Stroke is heavier** (1.75 vs Phosphor's 1px light) — brutalist signature.
- **Caps + joins are square**, not round — technical illustration, not friendly.
- **Glyphs are wider** — 24-grid forces shapes to live in the box rather than float.
- **No `thin` / `light` / `duotone` weights** — only regular + bold. Brutalism rejects ambiguity.

If you find yourself wanting a Phosphor icon for a domain concept, the answer is usually "add a new one to this set." Phosphor is for the long-tail of generic UI.
