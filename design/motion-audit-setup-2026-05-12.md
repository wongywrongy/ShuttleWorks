# Motion Audit — Setup tab (5 sections)

**Date:** 2026-05-12
**Framework:** `packages/design-system/MOTION.md` (see for principles)
**Scope:** All 5 Setup-tab sections: Tournament / Engine / Public display / Appearance / Tournament data
**Methodology:** `design-motion-principles` skill (Emil Kowalski / Jakub Krehel / Jhey Tompkins per-designer audit)

---

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 AUDIT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 2 Critical  |  🟡 4 Important  |  🟢 3 Opportunities
Primary perspective: Emil Kowalski (productivity tool, live-event time pressure)
Secondary: Jakub Krehel (production polish on the moments that earned animation)
Selective: Jhey Tompkins (one beat reserved for save success)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Overall Assessment

The Setup tab is **motion-bare** — exactly what Emil would order for a high-frequency productivity surface. The chrome (TabBar underline, tokens.css `--ease-brand`, `prefers-reduced-motion` global override) already encodes good defaults. What's missing is the **3 production-polish micro-moments** the operator actually needs to feel confident: press feedback on save, save-success confirmation, and a smoother error banner mount. Everything else — section switch, Seg active swap, Toggle thumb slide — is intentionally close-to-instant and should stay that way.

The biggest risk in this state is **operator double-saves**: a director clicks Save during a meet, sees zero visual change, clicks again, creates duplicate writes. That's a critical bug masquerading as a motion gap.

---

### ⚡ EMIL'S PERSPECTIVE — Restraint & Speed

**What's Working Well**
- ✓ Section switch (URL `?section=` change → instant content render) is correctly a hard cut — keyboard-accessible, high-frequency during setup, no animation needed. — `SettingsShell.tsx:42-80`
- ✓ Range slider readout updates instantly with no easing on the number itself — correct for a slider where 60+ updates/second would otherwise queue tweens. — `SettingsControls.tsx:307-323` (RangeSlider)
- ✓ Toggle and Seg both use Tailwind's implicit `transition-colors` (defaults to 150ms) — within Emil's sub-200ms ceiling. — `SettingsControls.tsx:87, 121`
- ✓ Canonical `--ease-brand: cubic-bezier(0.22, 1, 0.36, 1)` is the default app curve (not generic `ease`). — `tokens.css:55`
- ✓ `prefers-reduced-motion: reduce` global override is wired and disables infinite animations. — `globals.css:200-212`

**Issues to Address**
- ✗ Save buttons have **no press feedback** — Emil tip #1 ("Scale your buttons") not applied. The scheduler `INTERACTIVE_BASE` constant includes `active:scale-[0.97]` but the design-system `<Button>` doesn't compose `INTERACTIVE_BASE` (it has its own active-state class set). Verify on the 4 save buttons in: TournamentConfigForm, EngineSettings, PublicDisplaySettings, and the per-row Restore buttons in DataSettings. — `packages/design-system/components/Button.tsx`
- ✗ Toggle thumb `transition-transform` has **no explicit duration or easing** — Tailwind defaults to 150ms linear, which works but reads as default-CSS. Should be `transition-transform duration-standard ease-brand`. — `SettingsControls.tsx:127`
- ✗ Range slider's numeric readout (`<span>{value}</span>`) **swaps without any visual feedback** — for slider drag (live-rate frequency), this is correct; but on keyboard arrow-key increments (lower frequency), a 150ms colour fade would confirm the key registered. — `SettingsControls.tsx:319-321`

**Emil would say**: "Most of this is right — restraint won. But Save buttons absolutely need press feedback, and the toggle thumb's implicit Tailwind default is the kind of thing that reads as 'someone forgot to set the easing.' Both are 5-line fixes."

---

### 🎯 JAKUB'S PERSPECTIVE — Production Polish

**What's Working Well**
- ✓ Easing curve choice (`--ease-brand`) is canonically a Jakub-grade decel curve (`cubic-bezier(0.22, 1, 0.36, 1)`), not the flat `ease-out`. — `tokens.css:55`
- ✓ The TabBar underline animation (different surface, but the model) uses scaleX transform + GPU-safe + `--ease-brand` + 300ms — textbook Jakub.
- ✓ `globals.css` carries the polished `block-in`, `slide-up`, `sheen` keyframes that should be reused, not re-invented.

**Issues to Address**
- ✗ **Error banner motion gap (critical for Jakub):** `{saveError && <ErrorBanner />}` hard-snaps in/out in both EngineSettings and PublicDisplaySettings. This is exactly the conditional render that Jakub's enter recipe (opacity + translateY + blur, 300ms spring bounce-0) was designed for. — `EngineSettings.tsx:179`, `PublicDisplaySettings.tsx:176`
- ✗ **Save button has no success state.** The button label stays static through the entire save → succeeded transition. Jakub's icon-swap recipe (AnimatePresence with opacity + scale + blur on the label change) is the missing polish. Operator clarity > visual restraint here. — `TournamentConfigForm.tsx:Save`, `EngineSettings.tsx:Save`, `PublicDisplaySettings.tsx:Save`
- ✗ **Seg active indicator** changes via background swap with no shared-element transition. Acceptable for v1, but for production polish Jakub would `layoutId` a sliding pill. Defer to a framer-motion install (see MOTION.md §9). — `SettingsControls.tsx:75-103`
- ✗ **Optical alignment** on the save Button (text-only) is fine, but the `<Button>` in DataSettings's "Restore" rows is icon-less and right-anchored — no optical issue today, but worth checking when an icon prefix is added.
- ✗ **Hover transitions on Seg buttons** use `transition-colors` (background + text colour) without explicit duration — at Tailwind's default 150ms this is acceptable but reads as inherited rather than intentional. Should be explicitly `duration-fast ease-brand`. — `SettingsControls.tsx:87`

**Jakub would say**: "The skeleton is good — the motion is just absent in the 2–3 places where a clear professional signal would prevent operator double-clicks. Save-success state is the #1 high-leverage moment. Error banner is #2."

---

### ✨ JHEY'S PERSPECTIVE — Experimentation & Delight (selective)

**What's Working Well**
- ✓ The `sheen-overlay` class already exists in `globals.css` — a one-pass diagonal sweep ready to compose onto the save button when persistence succeeds.

**Opportunities**
- 💡 **Save success: one-shot sheen** — when a director finally saves engine settings during a meet, fire `.sheen-overlay motion-reduce:hidden` for 1.1s on the button's relative container. The button itself can use `will-change: filter` to lift onto a GPU layer for that frame. This is the one delight moment in the whole Setup tab; Jhey only earns this. — `Button` rendering in Save handlers
- 💡 **Toggle thumb shimmer on activation** — would be cute, but violates Emil's frequency rule (toggles are higher-frequency than save). **Don't ship.**
- 💡 **Range slider thumb glow** — same — fun in isolation, exhausting in a director's third hour. **Don't ship.**

**Jhey would say**: "Save success is the only place I'm allowed in this app. Take the slot — it's free polish since `.sheen-overlay` is already authored. Everything else: out of my lane."

---

## Combined Recommendations

### Critical (Must Fix)

| | Issue | File | Action |
|-|---|---|---|
| 🔴 | Save button has **no press feedback** (Emil tip #1) | `packages/design-system/components/Button.tsx` | Add `active:scale-[0.97]` to the buttonVariants base class, matching `INTERACTIVE_BASE`. One-line fix on a primitive — fixes every Save button in the app. |
| 🔴 | Save action has **no success confirmation** — risk of operator double-saves during meet | `EngineSettings.tsx`, `PublicDisplaySettings.tsx`, `TournamentConfigForm.tsx` | After `onSave` resolves, swap button label to `<IconDone /> Saved` for 1.5s via local state. Animate the icon swap per MOTION.md §6 "Save success" recipe. |

### Important (Should Fix)

| | Issue | File | Action |
|-|---|---|---|
| 🟡 | Error banner snaps in/out — Jakub motion gap | `EngineSettings.tsx:179`, `PublicDisplaySettings.tsx:176` | Wrap in `.enter` CSS class with the Jakub recipe keyframe (MOTION.md §5). No framer-motion install required. |
| 🟡 | Toggle thumb easing implicit | `SettingsControls.tsx:127` | `transition-transform` → `transition-transform duration-standard ease-brand`. |
| 🟡 | Seg button hover transition has no explicit duration | `SettingsControls.tsx:87` | `transition-colors` → `transition-colors duration-fast ease-brand`. |
| 🟡 | Range slider readout updates without keyboard-arrow confirmation | `SettingsControls.tsx:319` | Add `transition-colors duration-fast ease-brand` to the readout span; flash `text-accent` for 150ms on value change. |

### Opportunities (Could Enhance)

| | Enhancement | Where | Impact |
|-|---|---|---|
| 🟢 | Save success: one-shot `.sheen-overlay` | Save handler in every section pane | The one Jhey moment — celebrates the persistence beat without competing for attention on every other interaction. |
| 🟢 | Seg active indicator: sliding pill via `layoutId` | `SettingsControls.tsx` Seg | Premium production polish; requires framer-motion install. Not earned today. |
| 🟢 | Tokenise duration scale | `tokens.css` + `tailwind-preset.js` | ✓ Already shipped in this commit — `duration-fast` / `duration-standard` / `duration-moderate` / `duration-slow` are now Tailwind utilities. |

---

## Designer Reference Summary

> **Who was referenced most**: **Emil Kowalski**, with Jakub Krehel close behind on the 4 Important recommendations.
>
> **Why**: The Setup tab is medium-to-low-frequency (visited a handful of times per setup, then closed) but the operator is high-stakes — wrong configs lose minutes during a meet. Emil's frequency rule rules OUT animation on 90% of surfaces here; Jakub's polish rules IN the 3 moments where motion carries actual information (save state, error banner, value confirmation).
>
> **If you want to lean differently**:
> - **To follow Emil more strictly**: drop the Jhey save-success sheen entirely, keep only the press feedback + success icon swap. Pure productivity asceticism.
> - **To follow Jakub more strictly**: add the `layoutId` sliding pill on Seg + a 150ms blur on section-switch pane content. Bumps the codebase toward shared-element-transition territory; means installing framer-motion. Worth it if Setup gets touched daily, not worth it if it's setup-once-per-meet.
> - **To follow Jhey more strictly**: add a "first-save-of-the-day" milestone delight — once per session, the save-success sheen pulses twice instead of once. Marker that today's setup is real, not a dry-run. Single delighter, easily turned off.

---

## What ships with this audit

Same commit also lands the underlying primitives so future surfaces can immediately follow the framework:

- `--motion-instant` / `--motion-fast` / `--motion-standard` / `--motion-moderate` / `--motion-slow` CSS variables in `tokens.css`
- `--ease-brand` / `--ease-out-quick` / `--ease-linear` CSS variables in `tokens.css`
- Matching `transitionDuration` + `transitionTimingFunction` keys in `tailwind-preset.js` so `duration-standard ease-brand` is a valid Tailwind class
- `MOTION.md` framework at `packages/design-system/MOTION.md` — durable rulebook for every future motion decision

Critical + Important fixes flagged above are **not yet implemented** — this audit is the brief, the implementation is the next ticket.
