# BRAND — SUPERSEDED

**Status:** SUPERSEDED 2026-08-06. Do not design against this file.
**Superseded by:** [`DESIGN_COLOR.md`](./DESIGN_COLOR.md) + [`tokens.css`](./tokens.css) (color, surfaces,
radii, shadows) and [`MOTION.md`](./MOTION.md) (motion).

---

## Why this file is gone

It described a direction the product no longer has. BRAND.md locked
**industrial brutalist × premium dark editorial**: Signal Orange `#FF6B1A` as the
single accent, hard 90° corners, full-black `--rule` borders, and no soft
shadows. None of that ships. The product runs the two-layer token system:
azure `--action-primary`, a cool-gray elevation ladder, a 4–14px radius scale,
and real Gaussian shadows in light mode.

Two authoritative-sounding brand documents that disagree is worse than one
imperfect one — anyone reading this file, human or agent, pulled the UI back
toward a design that was replaced. The design review that retired this direction
identified that conflict as the root cause of the product's incoherent visual identity.

## Where the current direction lives

| Question | File |
|---|---|
| What is the accent? What are the surfaces, text ramps, status hues? | `DESIGN_COLOR.md` |
| The actual values | `tokens.css` (primitives → semantic → per-theme mapping) |
| Does a token change pass contrast? | `scripts/check-contrast.mjs` |
| What may a component do (rules an agent must follow)? | `DESIGN.md` |
| Motion vocabulary | `MOTION.md` |

## The rules that survived the change

These were right in BRAND.md and remain binding — they are restated in
`DESIGN_COLOR.md`, which is now their home:

- **One accent.** Exactly one interactive hue across the system.
- **Status colors are not brand colors.** Never use a status hue for emphasis
  on neutral content.
- **No raw hex in product code.** Semantic tokens only.
- **Never pure `#000` or pure `#FFF`** for substrate or body text.

The historical brutalist spec, if you need it for context on why an old
component looks the way it does, is in git history for this path.
