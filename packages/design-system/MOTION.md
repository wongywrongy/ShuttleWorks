# MOTION — Motion Design Language

**Enforced by:** `products/scheduler/frontend/src/platform/contracts/__tests__/motionContract.test.ts` — the token aliasing (§3), the forbidden curve (§4), the 300ms chrome cap (§10.8), the hard cuts (§2/§6) and reduced-motion coverage (§8) are asserted against the shipped CSS and call sites. This document used to assert things about the code that the code had stopped doing; that is what the test is for.

**Status:** Locked direction. Authoritative for every surface in the scheduler. Companion to `DESIGN_COLOR.md` + `tokens.css` (visual language) and `DESIGN.md` (component-architecture rulebook). `BRAND.md` is superseded — where this file cites it for the visual direction, read `DESIGN_COLOR.md` instead.

**Authored:** 2026-05-12 alongside the first motion audit (see `design/motion-audit-setup-2026-05-12.md`).

**Synthesised from:** Emil Kowalski (Linear/ex-Vercel) — primary; Jakub Krehel (jakub.kr) — secondary; Jhey Tompkins (@jh3yy) — selective. Weighting derived from the user context below.

---

## 0. The user is a tournament director

Both products serve **operators running live events under time pressure**. They are:

- Switching between Setup / Roster / Matches / Schedule / Live / TV tabs every few seconds during setup; less often during the meet itself.
- Saving config changes minutes before play starts; if a save doesn't visibly confirm, they'll re-click and create duplicate writes.
- Watching the Solver HUD + Gantt repeatedly through the meet — the highest-frequency surface.
- Keyboard-driven where possible (search, tab navigation, escape-to-close).

> **The single most important consequence:** this is a high-frequency productivity tool, not a marketing site. Motion exists only when it carries information the operator needs to keep moving. The brutalist × premium-dark-editorial visual language (BRAND.md) is reinforced by **invisible** motion — present in the corners of perception, never the centre of attention.

---

## 1. Perspective weighting

| Designer | Weight | Where they apply |
|---|---|---|
| **Emil Kowalski** | **Primary** | The frequency rule decides whether anything animates at all. High-frequency interactions (TabBar click, Solver HUD tick, score entry, Gantt drag) get zero or near-zero motion. Default easing curve = canonical `--ease-brand`. |
| **Jakub Krehel** | **Secondary** | Production polish on every state transition that earned the right to animate — enter/exit recipes, blur as state signal, icon-swap animations on save success, optical alignment. |
| **Jhey Tompkins** | **Selective** | Reserved for one moment: the save-success beat. Director under pressure needs a clear "you saved" signal that feels like a small celebration. No other place earns Jhey. |

**The synthesis rule:** Use Emil to decide *whether* to animate. Use Jakub to decide *how* if yes. Use Jhey only if the moment earns a one-shot celebration (currently only: save-success).

---

## 2. The frequency rule (Emil)

For every animation candidate, decide its **interaction frequency** first:

| Frequency | Threshold | Motion budget |
|---|---|---|
| **Live-rate** | More than 1/second (Solver HUD tick, elapsed timer, scan-sweep) | None unless the animation IS the signal (marching-ants, phase-glow, scan-sweep are already signal-carrying; honour `prefers-reduced-motion`). |
| **High** | 10+ times per session (tab click, row select, save) | Sub-200ms or no animation. Button press feedback only. |
| **Medium** | 1–10 times per session (modal open, dialog confirm, toast) | 200–300ms Jakub-recipe enter/exit. |
| **Low** | 1× per setup, then never (onboarding, first-time save) | 300–500ms allowed. One delight beat may earn its place. |
| **Keyboard-initiated** | Any | **Never animate.** URL-driven state changes, escape close, enter submit — all snap. |

**Don't violate this rule for taste reasons.** The brutalist look is rigid; the motion should match that rigidity by being equally restrained.

---

## 2a. The ambient axis (Display)

The table above measures a director's hands. **The Display board has no hands on it**, and every threshold in §2 is stated in interactions per session — a unit that does not exist on a surface nobody interacts with. Reading a hall screen through the "High frequency: tab click" rule gets the wrong answer, because a tab click is a thing a person did and a board rotation is a thing that happened to them.

The board is the concrete case, so describe the board: **Experience mode, projected in a hall, read across a room by people who did not choose to look at it, unattended for the length of an event, swapping its own content on a 15-second timer** (`MeetDisplayPage.tsx`, `ROTATION_INTERVAL_MS`). Two consequences invert §2's assumptions:

- **Nobody is mid-task, so motion cannot interrupt anything.** The operator rule "motion exists only when it carries information the operator needs to keep moving" relaxes: a spectator has nowhere to be.
- **Nobody is watching continuously, so a silent change is a change nobody knows happened.** At a desk, the absence of motion is honest; across a hall, an instant content swap reads as "the screen was always like that". Here a short enter beat is the *functional* alternative, not the polish.

| Tier | Threshold | Motion budget |
|---|---|---|
| **Ambient one-shot** | An element arrives or leaves on its own — a court card mounting, a match flipping to LIVE | 200–300ms, `--ease-brand`. It must **read at distance**: an 8px translate that's right at a desk is invisible at 3 metres. Stagger siblings ≤60ms per child, and cap the whole cascade under a second. |
| **Ambient recurring** | The surface swaps itself on a timer — the 15-second standings rotation | One enter beat at `--motion-moderate`, no exit choreography, nothing looping between swaps. The viewer sees this **~240 times an hour, for hours**: it has to be a cut they can look away from, not a transition they wait through. |
| **Ambient continuous** | Anything that never stops — a pulsing LIVE dot | Only when the loop **is** the state *and* the state is also in text. `sw-pulse` on a LIVE/CALLING dot qualifies: the pill says LIVE either way. Nothing decorative earns a loop on a screen that runs for nine hours. |

Three rules apply only here:

1. **There is no pause control and nobody to hand one to.** §8.4 ("looping animations must be pause-able") is unsatisfiable on this surface — the viewer is a hall. It is therefore met the only way left open: every looping signal honours `prefers-reduced-motion`, and every looping signal has a text equivalent, so a viewer who can't stop it can still read past it. A loop that fails either half doesn't ship to the board.
2. **Reduced motion still wins.** The board honours the viewer's OS setting exactly like the operator console does. **Where an ambient budget and the accessibility contract disagree, the accessibility contract wins** — including when that means the 15-second rotation swaps with no beat at all for that viewer. Never buy a duration rule with an accessibility exemption.
3. **Ambient is not a licence for the rest of the surface.** The Display module's *operator-facing* config editor is operator UI and follows §2. Only what the hall sees is ambient.

> Added 2026-08-11 after the design audit found the frequency model had no tier for "automatic, non-interactive, recurring every 15 seconds for hours" — and that the 450ms `block-in` entry the board borrowed for its court cards was governed, absurdly, by a rule written about clicking a tab.

---

## 3. Duration scale

Locked named tokens. Use these, not raw `ms` values, on every surface:

| Token | Value | Purpose |
|---|---|---|
| `--motion-instant` | `0ms` | URL state changes, keyboard nav, high-frequency repeats |
| `--motion-fast` | `120ms` | Press feedback, hover-state colour shifts |
| `--motion-standard` | `200ms` | Toggle thumb, Seg active swap, focus ring fade-in |
| `--motion-moderate` | `300ms` | Modal/Toast enter, banner mount, success state |
| `--motion-slow` | `450ms` | Reserved — only solver-theatre + sheen + slide-up. New surfaces don't use this. |

Reach for the next-fastest tier when in doubt — Emil's "180ms feels more responsive than 400ms."

**The `--dur*` names are aliases of this scale, not a second scale.** `tokens.css` also carries a handoff vocabulary — `--dur-fast`, `--dur`, `--dur-slow` — because the design handoff shipped with those names and `globals.css` is written in them. Every one resolves to a canonical token; none may be given a raw value again. `--pulse-dur` and `--nudge-dur` are the exception that proves it: they are loop *periods* (1.6s, 2s), not one-shot durations, and belong to §2a's ambient-continuous tier rather than to this table.

> The 2026-08-11 design audit found this half-done — `--dur-slow` at 320ms and `--dur-xslow` at 480ms answered to nothing here, and `--ease` held the very curve §4 forbids. A parallel vocabulary is how a locked scale stops being locked.

---

## 4. Easing

| Token | Value | Use |
|---|---|---|
| `--ease-brand` (already in tokens.css) | `cubic-bezier(0.22, 1, 0.36, 1)` | **Default for everything.** Decelerates with weight, settles cleanly. Matches the existing app vocabulary. |
| `--ease-out-quick` | `cubic-bezier(0.32, 0.72, 0, 1)` | Vaul / iOS-sheet curve. Reserved for sheets, drawers, or any over-shoot-resistant slide-from-edge. |
| `--ease-linear` | `linear` | Continuous solver-theatre only (scan-sweep, marching-ants). Never UI chrome. |

**Never** use Tailwind's built-in `ease`, `ease-in`, `ease-out`, `ease-in-out` for new surfaces. They're flat and read as default-CSS to anyone who notices. Always `ease-brand` (or `ease-out-quick` for drawers).

---

## 5. Enter / Exit recipes

### Standard enter (Jakub)

For anything that mounts conditionally — modals, toasts, error banners, save-success states, dropdown menus:

```jsx
// React (when framer-motion is available)
<motion.div
  initial={{ opacity: 0, translateY: 8, filter: 'blur(4px)' }}
  animate={{ opacity: 1, translateY: 0, filter: 'blur(0px)' }}
  exit={{ opacity: 0, translateY: -4, filter: 'blur(4px)' }}
  transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
/>
```

```css
/* CSS-only fallback (no framer-motion required) */
.enter {
  animation: enter var(--motion-moderate) var(--ease-brand) backwards;
}
@keyframes enter {
  from { opacity: 0; transform: translateY(8px); filter: blur(4px); }
  to   { opacity: 1; transform: translateY(0);   filter: blur(0);   }
}
```

### Exit subtlety (Jakub)

**Exits are always more restrained than enters.** The user is moving on to whatever comes next — don't compete for their attention.

- Translate: enter `+8px`, exit `-4px` (half the displacement, opposite direction)
- Blur: same `4px` both ways (the materialise effect cuts both ways)
- Opacity: same 0↔1
- Duration: same as enter

### No `scale(0)` (Emil)

Animations that start from `scale(0)` look unnatural — the element bursts from nothing. Always start from `scale(0.9)` or higher. The translate+blur recipe above is the preferred path; reach for scale only when the element is genuinely small (icons, badges).

---

## 6. Per-component patterns

### Buttons

**Press feedback** (Emil tip #1) is required on every interactive button:

```css
.button:active {
  transform: scale(0.97);
}
```

The scheduler's `INTERACTIVE_BASE` constant already includes this. Apply via `INTERACTIVE_BASE` or the design-system `<Button>` for every new button — don't write inline button class strings.

**Hover transitions** use `--motion-fast` (120ms) on the colour + background, never longer:

```css
.button {
  transition: background-color 120ms var(--ease-brand),
              color 120ms var(--ease-brand);
}
```

### Toggle (`<Toggle>` in SettingsControls)

- Thumb slide: **`transition-transform duration-200 ease-brand`** (currently the duration is implicit at Tailwind default; add explicit token).
- Track colour: 120ms `--motion-fast`.
- No bounce. Bounce makes the operator pause to watch — the operator must not pause.

### Segmented control (`<Seg>`)

- Active indicator currently swaps via `bg-accent/15`. That's acceptable for v1.
- **Premium upgrade (Jakub):** a sliding pill via Framer Motion `layoutId` would feel professional. Defer until framer-motion is installed; Emil's frequency rule says it doesn't earn the install today.

### Modals + dialogs

Use the standard enter/exit recipe (§5). Spring, bounce 0, 300ms (`--motion-moderate`). The scheduler's existing local Modal swaps to brand chrome (square, hard-offset shadow) — keep its mount instant for now; add the recipe in the same pass that installs framer-motion.

### Toasts (already in design-system)

`<ToastStack>` from `@scheduler/design-system` currently has no enter animation. Standard recipe applies. Sonner's `400ms ease-brand` cadence is the model — restraint over flair.

### Save success state (the one Jhey moment)

The director clicks **Save engine settings**, hits Cmd+S, or otherwise persists changes. They need an unmistakable "yes, I saved" signal — currently zero feedback exists.

**Pattern:**
1. On save start, swap button label to a spinner (`<Loader size="sm" />`) for the network round-trip.
2. On save success, swap to `<IconDone />` + `Saved` text for 1.5s, then revert to the original label.
3. Animate the icon swap with Jakub's icon-swap recipe (opacity + scale + blur):

```jsx
<AnimatePresence mode="wait">
  {state === 'saved' ? (
    <motion.span
      key="saved"
      initial={{ opacity: 0, scale: 0.85, filter: 'blur(4px)' }}
      animate={{ opacity: 1, scale: 1,    filter: 'blur(0)' }}
      exit={{    opacity: 0, scale: 0.85, filter: 'blur(4px)' }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <IconDone size={16} /> Saved
    </motion.span>
  ) : ( ... )}
</AnimatePresence>
```

4. The button gains a one-shot `.sheen-overlay` (already defined in `globals.css`) during the saved window. This is Jhey's slot — the only place a celebration earns the slot.

### TabBar + Settings nav

- TabBar active underline (already implemented) is the model — scaleX transform on a pre-rendered span, GPU-safe, `--ease-brand`, 300ms. ✓
- Settings nav row index doesn't animate — keyboard-accessible URL state. ✓

### Range slider (Engine — utilisation weight)

Currently the numeric readout swaps instantly. Add a 150ms colour fade-in on the readout span when the value changes — cheap, subtle, Jakub-grade polish.

### Section panel switch (SettingsShell)

The `active.render()` swap is keyboard-accessible (URL search param) and high-frequency during config setup. **Per Emil, this stays a hard cut.** Animating it would feel slow on the 8th switch.

If a future ticket wants polish: a 120ms opacity fade-only on the pane content (no translate, no blur — too much for a nav swap). Not earned today.

---

## 7. Solver-theatre motion (already in design-system)

Existing keyframes lifted from scheduler into `globals.css` carry semantic state and **must not** be retuned without revisiting the Solver UX:

| Keyframe | Purpose | Status |
|---|---|---|
| `scan-sweep` | One-pass light bar = "committed proposal preview" | Locked, signal-carrying |
| `marching-ants` | Animated dashed border = "in-flight speculation" | Locked |
| `phase-glow` | Pulsing ring = "court phase transition" | Locked |
| `block-in` | Block arrival = "schedule re-flow" | Locked |
| `sheen` | One-pass diagonal sweep = "optimal proven" / save-success | Locked |
| `slide-up` | Toast/dock entry | Locked |

`prefers-reduced-motion: reduce` kills all of these — see §8, which is now a universal rule rather than the hand-maintained selector list this line used to point at.

> **Correction (2026-08-11).** This paragraph previously said the override "already kills the infinite ones" and named four. It was a list, it had rotted, and four classes shipped unguarded for months on the strength of this sentence — including `.motion-enter`, which drives the Display board's 15-second standings rotation. Two agents read it during the design audit and believed it. If a doc asserts coverage, the coverage has to be enforced by something other than the doc; it is now `motionContract.test.ts`.

---

## 8. Accessibility contract

**Non-negotiable.** Every motion decision must pass:

1. **`prefers-reduced-motion: reduce` global override** — wired in `globals.css` as a **universal rule**: under `reduce`, `*, *::before, *::after` get `animation-duration: 0.01ms`, `animation-delay: 0`, `animation-iteration-count: 1`, `transition-duration: 0.01ms`. New animations are covered by default; there is nothing to opt into and no list to remember.

   > **Correction (2026-08-11).** This item used to claim that "transitions on transform/opacity inherit the global override automatically when triggered via Tailwind classes". **That was false, and it was the single most expensive sentence in this document.** Nothing inherits a reduced-motion override — not transitions, and least of all `animation`-based keyframes, which the override in force at the time did not touch unless a human had typed the class name into a list. Four classes were missing from that list. The rule is universal now precisely so the claim can be true.

   `0.01ms` rather than `none` is deliberate: the animation still starts and ends, so `fill-mode` end-states land and `animationend` listeners still fire. (`RunLiveBoard` clears its one-shot call-flash/go-live classes on `animationend`; under `animation: none` that event never arrived and the class stuck forever.)
2. **No vestibular triggers** — no full-screen zoom, no parallax, no spin. The existing brutalist visual language already forbids these aesthetically.
3. **Functional alternative** — every animation that carries information must have a non-motion equivalent. The toggle thumb position is meaningful regardless of slide animation; the Seg active state is meaningful regardless of pill animation; the save success text says "Saved" regardless of icon-swap animation.
4. **Looping animations** that aren't signal-carrying must be pause-able. None currently exist outside solver-theatre, which IS signal-carrying. On the Display board, where a pause control has no one to reach, §2a rule 1 applies instead.

**This contract outranks every duration and frequency rule in this document.** If honouring reduced motion means a surface loses a beat §2 or §2a would have given it, the surface loses the beat. There is no case in which a motion budget justifies an accessibility exemption — say so out loud when the two meet, rather than quietly splitting the difference.

If a new animation can't pass all 4 — drop it.

---

## 9. Implementation primitives

### Tokens in `tokens.css` (present since 2026-05; listed here for reference)

```css
:root {
  /* Duration scale */
  --motion-instant:  0ms;
  --motion-fast:     120ms;
  --motion-standard: 200ms;
  --motion-moderate: 300ms;
  --motion-slow:     450ms;

  /* Easing — --ease-brand already exists; adding sibling curves */
  --ease-out-quick: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-linear:    linear;
}
```

### Tailwind preset additions

```js
// packages/design-system/tailwind-preset.js theme.extend
transitionDuration: {
  instant:  'var(--motion-instant)',
  fast:     'var(--motion-fast)',
  standard: 'var(--motion-standard)',
  moderate: 'var(--motion-moderate)',
  slow:     'var(--motion-slow)',
},
transitionTimingFunction: {
  brand:      'var(--ease-brand)',      // existing
  'out-quick': 'var(--ease-out-quick)',
  linear:     'var(--ease-linear)',
},
```

Then usages read as: `transition-transform duration-standard ease-brand`.

### When to install framer-motion

The codebase currently has zero motion library. Don't install reflexively — the CSS-only versions of every recipe in this doc are sufficient for the productivity-tool weighting.

**Install framer-motion only when** one of these is needed:
- Shared-element transitions (`layoutId`) — e.g., a Seg sliding pill, or a card morphing to a modal
- AnimatePresence exit choreography — e.g., toast stack with staggered exit
- Spring physics on drag (Vaul-style sheets) — the scheduler's DragGantt could benefit but works fine without

Until then, CSS keyframes + transitions cover every recipe in this doc.

---

## 10. Anti-patterns (blocklist)

Forbidden on every new surface:

1. **Default Tailwind easing** (`transition` with no `ease-brand`) — feels generic.
2. **Animating layout properties** (`width`, `height`, `padding`, `margin`, `top`, `left`) — always transform / opacity instead.
3. **`scale(0)` enter** — start from `0.9+` (Emil).
4. **Bounce > 0 springs in productivity UI** — reserved for celebration only.
5. **Animating keyboard-driven state** (URL search param, Cmd+K, Esc-close) — hard cut.
6. **Animations on high-frequency repeats** (TabBar click, row select in lists, score input). Render result, not the transition.
7. **Continuous infinite animations** outside solver-theatre. The `phase-glow` and `scan-sweep` already exist; don't add a third.
8. **Long durations on chrome** (>300ms on any nav/tab/toggle/dialog). Polish moments (save success, modal enter) cap at `--motion-moderate` (300ms).
9. **`box-shadow` keyframes** — performance-hostile. Use opacity + transform; reach for the `--shadow-hard` token if substrate elevation is needed.

### Recorded exception — `sw-dock-transition` (2026-07-15 docked detail pane)

`DetailDock` transitions `width` (blocklist item 2) and animates its
Esc-driven close (item 5), deliberately: the pane is a REAL layout column
and the sibling table reflowing during the transition — columns collapsing
via container queries as room tightens — **is the feature**; a transform
animation cannot reflow siblings. Scope guards: one instance per surface,
`contain: layout style` + `--dur-slow` bound the reflow cost, and
`prefers-reduced-motion` kills the transition entirely (close is then a
hard cut with no retention, honoring item 5's intent). Do not cite this
exception for chrome/decoration — it exists only for the dock geometry.

---

## 11. When in doubt

> "The best animation is that which goes unnoticed."

— Emil Kowalski / Jakub Krehel (paraphrased)

If the director ever pauses mid-meet to admire the UI, the motion is wrong. The only acceptable comment is "I never noticed anything but it just felt right." That's the bar.

---

## 12. Companion documents

- **[`DESIGN_COLOR.md`](./DESIGN_COLOR.md)** — visual language (palette, surfaces, status hues); `BRAND.md` is a superseded stub
- **`packages/design-system/DESIGN.md`** — agent enforcement rulebook for component code
- **`design/motion-audit-setup-2026-05-12.md`** — the first motion audit, applied to the Setup tab

This file is the source of truth for motion. If anything in DESIGN.md disagrees about motion — **MOTION.md wins** and the other doc updates to match.
