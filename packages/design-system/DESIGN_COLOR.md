# DESIGN_COLOR — the two-layer color system

**System of record:** `packages/design-system/tokens.css` (primitives + semantic + per-theme
mappings) and `tailwind-preset.js` (utility names → semantic vars).
**Gate:** `node packages/design-system/scripts/check-contrast.mjs` — must pass before shipping
token changes.

## Architecture

Two layers, as CSS custom properties (HSL triplets, `hsl(var(--token) / alpha)`-compatible):

1. **Primitives** — raw scales: `--gray-0…13`, `--blue-1…10`, `--green-*`, `--amber-*`,
   `--red-*`, `--sky-*`, `--violet-*`. Descriptive only. **Never referenced by component code.**
2. **Semantic tokens** — intent-named; the only layer components (and the Tailwind preset) may
   use. Light and dark are two *mappings* of this one layer, switched by `.dark` /
   `[data-theme="dark"]` on `<html>` (`useAppliedTheme` stamps both).

Adding or fixing a theme is a mapping change, not a component sweep.

## The four color-budget rules

1. **One accent.** `--action-primary` (azure) is the only interactive hue: primary buttons,
   links, selected states, focus rings. Nothing decorative uses it or any other hue.
2. **Green = success/complete** (plus the live/playing match state — the one sanctioned
   operational green). Counts are not successes; *idle* is not a celebration. Both are neutral.
3. **Module badges (M/D/B) are neutral** outlined/filled chips — the letter carries identity.
   If module identity ever needs a stronger glance-read, use icons, not hues. (The `--module-*`
   tokens remain for categorical data-vis like source dots on hybrid boards.)
4. **Never color alone.** Any state shown with color also carries text/icon/count.

## Semantic token table

| Token | Job |
|---|---|
| `--surface-sunken / base / raised / overlay` | The elevation ladder (see below) |
| `--text-primary / secondary / muted / on-accent` | Text ramp — from the gray scale, never opacity |
| `--border-hairline / strong / focus` | Dividers (decorative) / inputs (≥3:1) / focus ring |
| `--action-primary / -hover / --action-selected-bg` | THE accent + its states |
| `--status-{success,warning,danger,info}-{fg,bg}` | Rationed status pairs; fg clears 4.5:1 on white and on its bg tint |
| `--status-{live,called,started,blocked,idle,done}[-bg/-solid/-border/-ink]` | Operational match-state vocabulary — **aliases of the same families** (live=success, called/warning=amber, blocked=danger, started=info, idle/done=neutral) |

## Per-theme mapping

| Semantic | Light | Dark |
|---|---|---|
| `surface-sunken` | `gray-2` #EFF2F5 (wells/bands — the *explicit* page tint) | `gray-13` #0F1114 |
| `surface-base` | `gray-1` #F9FAFB (page) | `gray-12` #16181D — **never pure black** |
| `surface-raised` | `gray-0` #FFFFFF + hairline + `shadow-sm` | `gray-11` #23272E |
| `surface-overlay` | `gray-0` #FFFFFF + `shadow-md/lg` | `gray-10` #313640 |
| `text-primary` | `gray-13` | `220 20% 95%` (off-white, never #FFF) |
| `text-secondary` | `gray-8` | `gray-4` |
| `text-muted` | `gray-7` | `gray-5` |
| `border-strong` | `gray-6` (≥3:1 on white) | `gray-6` (≥3:1 on raised) |
| `action-primary` | `blue-7` #2563EB (S 83%) | `blue-5` #6D9BE4 (S 68% — desaturated, no shared hex) |
| status fgs | `*-7` steps (deep, text-grade) | `*-4` steps (lighter, desaturated 20–40%) |
| status bgs | `*-1` tints | `*-9` deep tints |

**Dark elevation = luminance:** sunken 7% → base 10% → raised 16% → overlay 22% (+5–8% per
step). Anything floating (right rail, menus, dialogs, cards) sits on a *lighter* surface than
its backdrop; shadows are secondary in dark. **Light is its own logic** (not an inversion):
white/near-white base, subtle gray sunken wells, raised = white + hairline + small shadow.

## Accessibility gates (blockers)

- Text ≥ 4.5:1 against its actual surface, checked per theme per surface step.
- Non-text UI (input borders, focus rings, solid-chip inks) ≥ 3:1 (chip inks held to 4.5).
- Focus: global `:where(...):focus-visible` net in `globals.css` + `INTERACTIVE_BASE` ring;
  both use `--border-focus`.
- All enforced by `scripts/check-contrast.mjs`.

## Surviving exceptions (justified)

| Exception | Why |
|---|---|
| TV Display presets (`displayPresets.css/.ts`) + `tvAccent` user hex + `StandingsView` podium | A separate, deliberate theming axis for venue TVs; user-configurable accent is data, not style |
| `schoolAccent.ts` 8-hex palette + `SchoolDot` | Categorical school-identity palette (data-driven, deterministic per school) |
| `eventColors.ts` / `positionGrid/helpers.ts` discipline hues | Categorical data palettes on dense boards; **known debt:** the two maps disagree per discipline (logged in docs/audits/debt-log.md) |
| `MatchChip` `bg-white/20` selected wash | Hue-free translucent lightener over *solid* status fills |
| Shadow `hsl(var(--gray-13) / α)` values | Shadows key off the ink primitive by design |
| `globals.css` white-alpha sheen/scanlines | Theme-blind texture effects |

Everything else resolves to semantic tokens (audit inventory: 2026-07-10; the 57 stock-Tailwind
occurrences in shared components — Hint, AdvisoryBanner, ConflictBanner, ScheduleLockIndicator,
AppStatusPopover, SourceChip, RunInspector, `time.ts`, auth pages, StaleBanner, Toast — are gone).
