# 15 — Frontend design review (palette, design system, auth UX)

**Date:** 2026-08-06
**Trigger:** "the color palette and design is very poor, also ux flow — e.g. no confirm
password on account creation."
**Scope:** `packages/design-system` (tokens + docs), `products/scheduler/frontend/src`
(form primitives, auth surface).
**Branch:** `dev`.

---

## 0. Summary

The design *system* is well-built; the design *identity* is missing and the *documentation*
describes a product that no longer exists. Three findings, in the order they matter:

1. **The palette is the industry default, not a choice.** `--action-primary` is `#2563EB` —
   Tailwind `blue-600` — over a cool-gray-220 ramp. The app reads as "a competent shadcn app."
2. **The brand documents contradict the shipped tokens.** `BRAND.md` specified brutalist
   Signal Orange `#FF6B1A`, 90° corners, no soft shadows. `DESIGN.md` enforced that spec and
   declared "BRAND.md wins." Neither describes what ships. Anyone — human or agent — reading
   the design docs for direction was being pulled toward a replaced design.
3. **There was no input primitive.** The package shipped Button/Select/Card but no text input,
   so 54 raw `<input>`s across 26 files each re-derived their own look. The login form was the
   worst instance and carried a real accessibility defect.

Findings 2 and 3 are fixed in this pass. Finding 1 is a decision, presented in §4.

---

## 1. Palette

### What is good

Genuinely better architecture than most products have, and it should be kept:

- Two layers — primitives (`--gray-0…13`, `--blue-1…10`, …) → semantic (`--surface-*`,
  `--text-*`, `--action-*`, `--status-*`). Components consume only the semantic layer, so a
  theme is a *mapping change*, not a component sweep.
- Dark elevation as luminance (sunken 7% → base 10% → raised 16% → overlay 22%), light as its
  own logic rather than an inversion. No pure black, no pure white body text.
- A scripted contrast gate (`scripts/check-contrast.mjs`).
- An explicit color budget ("one accent", "green means success", "never color alone").

### What is wrong

**The values are defaults.** `#2563EB` is Tailwind `blue-600` — the single most-used accent
value on the web — and it carries every interactive affordance in the product: primary
buttons, links, selection, focus rings. The neutral ramp sits at hue 216–224, the same cool
gray shipped by every Tailwind/shadcn starter. The result is discipline without identity.

**Two hue collisions.** Both technically legal under the rules as written, both perceptually
broken:

| Collision | Effect |
|---|---|
| `--status-started` = sky `#08689B` vs `--action-primary` = azure `#2563EB` | On the Ops board a *scheduled* chip and a *clickable* control are both "blue." The "one interactive hue" rule fails in the eye even though it passes on paper. |
| `--module-meet` = `--blue-7` = the accent hex | Module identity is categorical and non-interactive, so it must not be the interaction color. `DESIGN_COLOR.md` rule 3 already says module identity should be neutral. |

Both are token-mapping changes. Logged to the debt-log rather than fixed here, because they
move colors on a shipped operational surface and belong with the §4 decision.

---

## 2. The documentation was the disease

`packages/design-system/BRAND.md` (locked 2026-05-12) specified:

> industrial brutalist × premium dark editorial … Signal Orange `#FF6B1A` … hard 90° corners
> … `--rule` = full-opacity black … brutalism is opposed to soft shadow

`tokens.css` ships: azure action color, a 4→14px radius ladder, real Gaussian shadows in
light mode, and a five-family status palette. `DESIGN.md` — the rulebook agents are told to
treat as hard — enforced the *brutalist* rules (§1.2 no soft shadows, §1.3 no `rounded-lg` /
`rounded-full`, §1.9–1.11 Signal Orange) and closed with "**BRAND.md wins**." The codebase
meanwhile contains 45 `rounded-full` and 4 `rounded-lg` call sites, and `--shadow-md` /
`--shadow-lg` are real blur shadows.

So the design docs and the design tokens had been describing different products for months.
That is a sufficient explanation on its own for an interface that feels like it has no point
of view: every contributor got a different answer depending on which file they opened.

**Fixed in this pass:**

- `BRAND.md` → a superseded stub that names its replacements and preserves the four rules that
  survived the direction change (one accent; status ≠ brand; no raw hex; never `#000`/`#FFF`).
- `DESIGN.md` → a superseded-rules table at the top (which rules to ignore and what to follow
  instead), and §10's precedence flipped to **`tokens.css` → `DESIGN_COLOR.md` → `DESIGN.md`**,
  with `MOTION.md` winning on motion.
- `MOTION.md` + `package.json` → brand pointers updated.
- The full `DESIGN.md` rewrite is logged as debt: the rule *bodies* are load-bearing for
  agents, and rewriting them blind risks loosening rules that are still correct.

---

## 3. Forms and the auth flow

### 3.1 The missing primitive

`Select.tsx`'s own docstring said "trigger styling matches `Input`" — a component that did not
exist. Consequences measured across `products/scheduler/frontend/src`:

- 54 raw `<input>` in 26 files.
- `GlobalSettingsPage.tsx` carried a private `Field` re-implementation.
- `LoginPage.tsx` carried a private `INPUT_CLASS`, and was the outlier on both tokens it used:
  `border-input` (**1** of 348 border-utility usages; the other 347 are `border-border`) and
  bare `rounded` (8px) where the app convention is `rounded-sm` (6px).

`border-input` → `--input` → `--rule-soft` = `#E8ECF0`, the *in-table divider* token, roughly
**1.1:1** on white. The system's own rule is ≥3:1 for control borders (`--border-strong`). The
sign-in screen — the first surface a cloud-mode user ever sees — had effectively invisible
input borders.

**Fixed:** `packages/design-system/components/TextField.tsx`. Label/hint/error/`aria-describedby`
wiring, `aria-invalid` on error, a password reveal toggle, and trigger styling deliberately
identical to `Select` so a text field and a dropdown in one form are the same object. Adopted
in `LoginPage` and `GlobalSettingsPage` (the private `Field` is deleted). The remaining ~50
call sites are logged as a drift-prevention sweep, not a defect.

### 3.2 The password flows disagreed with each other

| | Sign up | Reset password | Settings → Security |
|---|---|---|---|
| Confirm field | ✗ | ✗ | ✓ |
| `minLength` | ✗ | ✓ (8) | ✗ |
| Policy stated before submit | ✗ | ✗ | ✗ |
| Show/hide | ✗ | ✗ | ✗ |
| Errors anchored to a field | ✗ (form footer) | ✗ | ✗ (footer, next to the button) |

The backend has a real policy — `validate_password` enforces `password_min_length` (8) plus a
breached-password blocklist (`services/auth.py:118`) — and **none of it was visible client-side**.
The user learned the rule only by having a submission rejected. Separately, `resetPassword`
succeeded into `navigate('/login')` with no confirmation, so a successful password change was
indistinguishable from the form clearing itself.

**Fixed** — one contract for all three surfaces:

- Confirm field on every password-setting flow; mismatch blocks submission and renders on the
  confirm field.
- `PASSWORD_HINT` / `PASSWORD_MIN_LENGTH` stated once in
  `src/platform/auth/passwordPolicy.ts`, shown as a hint before submission, with the server
  documented as authoritative (it alone can check the breach list).
- `AUTH_WEAK_PASSWORD` → password field, `AUTH_EMAIL_TAKEN` / `AUTH_INVALID_EMAIL` → email
  field. Only unattributable failures (throttling, network) go to the form footer.
- Reset success now says "Password updated. Sign in with your new password."
- Password reveal on every password input.

Covered by `src/platform/auth/__tests__/LoginPage.test.tsx` (7 tests) — the surface previously
had none.

---

## 4. The palette decision — **A + C, decided 2026-08-06**

Mockups: `docs/audits/15-palette-directions.html`. Three directions were put up; **A and C were
chosen, B was not taken.**

### What shipped for A

A pure mapping change in `tokens.css` — no component touched:

- **Gray ramp: hue ~220 → warm neutral (hue 30–40, low saturation).** The *lightness steps are
  unchanged*, so the dark elevation ladder (7/10/16/22%) and every contrast pair hold by
  construction.
- **Accent: `#2563EB` → `#0F62B8`** (hue 221 → 209, deeper). Leans cyan so it holds against the
  warm ground instead of floating on it. The whole azure scale moved with it.
- The four raw per-theme HSL values that bypass the ramp (`--ink-2`, `--rule-soft`,
  dark `--text-primary`, dark `--border-hairline`) and the cool status bg tints
  (`--green-1`, `--red-1`, `--sky-1`) were warmed to match.
- `scripts/check-contrast.mjs` passes in **both** themes. The tightest pair is
  `border-strong on surface-raised` at 4.03:1 (min 3).

### What shipped for C

- **Archivo Variable** added, imported from its `wdth` subpath so the **width axis** (62–125%)
  is available — the condensed look is a real axis, not a transform.
  `--font-display` pointed at it; it previously aliased Geist, so the display role was declared
  and never exercised.
- `.type-display` / `.type-display-num` utilities in `globals.css` set family + width + weight +
  tracking together, because Tailwind's `font-display` maps the *family* only and cannot reach
  `font-stretch`. Applied so far to the Gantt court labels and the login wordmark.
- **`CourtMark`** — the signature, drawn to scale. The first attempt was a narrow vertical rail
  with one tick, which inverted the proportion and showed almost none of the marking; it did not
  read as a court. It is now a true 13.4 × 6.1 m plan in a decimetre viewBox: boundary,
  tramlines at 0.46 m, net, short service lines at 1.98 m, and the centre-line T. Colour comes
  from `currentColor`, so a mark in a live row lights with that row.

**Still open on C:** where `CourtMark` goes. Not the Gantt court-label column — that is 56px
wide and a court plan there is noise, not signature. The candidates are the Run inspector and
the Display board's court cards, where a single court is genuinely the subject.

**What A + C does not fix:** blue still means both *scheduled* and *clickable*, and
`--module-meet` is still the accent hex. The cheap half of B — demote `--status-started` to
neutral, leave the accent azure — would close it without repainting anything else. Logged.

| | Direction | Change | Risk |
|---|---|---|---|
| **A** | **Warm substrate, keep azure.** Neutrals move off cool-220 toward a paper warmth; the accent moves off the exact Tailwind hex to a deeper, less-purple azure. | ~10 primitive values | Lowest. Nothing structural moves; instantly de-templates. |
| **B** | **Re-hue from the sport.** Accent drawn from the court's own vocabulary; `--status-started` demoted out of the blue family so blue means "you can touch this" and nothing else. | Primitives + status mapping + contrast re-gate | Medium. Moves colors on the live Ops board. |
| **C** | **Keep the palette; spend the identity on type and one signature surface.** Geist + JetBrains Mono is itself a default pairing; a characterful display face used with restraint, plus a real treatment of the Run board's court lanes. | Type stack + one surface | Medium. Most distinctive ceiling, most design work, zero color risk. |

A and C are not exclusive — A is the cheap floor, C is where an actual identity would come from.

---

## 5. Files changed

| File | Change |
|---|---|
| `packages/design-system/tokens.css` | **Direction A** — warm gray ramp, cyan-leaning deeper azure, warmed status tints; **C** — `--font-display` → Archivo + width/weight tokens |
| `packages/design-system/globals.css` | `.type-display` / `.type-display-num` |
| `packages/design-system/components/CourtMark.tsx` | **New** — the Direction-C signature, court drawn to scale |
| `packages/design-system/components/GanttTimeline.tsx` | Court labels take the display face |
| `products/scheduler/frontend/src/main.tsx` | Import Archivo `wdth` |
| `products/scheduler/frontend/package.json` | `@fontsource-variable/archivo` |
| `packages/design-system/components/TextField.tsx` | **New** — the missing input primitive |
| `packages/design-system/components/index.ts` | Export `TextField`, `CourtMark` |
| `packages/design-system/BRAND.md` | Rewritten as a superseded stub |
| `packages/design-system/DESIGN.md` | Superseded-rules banner; §10 precedence flipped |
| `packages/design-system/MOTION.md`, `package.json` | Brand pointers |
| `products/scheduler/frontend/src/platform/auth/passwordPolicy.ts` | **New** — the policy, stated once |
| `products/scheduler/frontend/src/platform/auth/LoginPage.tsx` | `TextField`; confirm fields; policy hints; field-anchored errors; reset confirmation |
| `products/scheduler/frontend/src/products/settings/GlobalSettingsPage.tsx` | Private `Field` deleted → `TextField`; mismatch anchored to the confirm field |
| `products/scheduler/frontend/src/platform/auth/__tests__/LoginPage.test.tsx` | **New** — 7 tests |
| `docs/audits/debt-log.md` | 3 follow-ups logged |

---

## 6. Config-surface unification (session 2, 2026-08-06)

Session 1 built the grammar (`Section` + `Row` + `FieldRow`) and applied it to
Meet. Session 2 applied it to the two modules that still ran their own: Bracket
and Display. All gates green: vitest 1316, tsc, eslint 0 errors, depcruise 0
errors, contrast both themes, docs build.

### Bracket Configuration is one surface

The Engine/Events switcher is gone, mirroring the Meet merge. Bracket already
rendered the shared `EngineConfigForm`, so it had inherited the *inside* of the
fix while keeping the switcher around it.

`BracketStructureSection` now arrives through a new `leadingSections` prop
rather than as a second mounted form. That is the load-bearing detail:
`EngineConfigForm` spreads the whole config on submit, so two forms on one page
each doing that is a silent clobber. It is a slot rather than an import because
the bracket content calls `useBracket()` and lives in `products/`, which
dependency-cruiser forbids `platform/` from importing.

`?section=` is retired with the switcher; old links still resolve.

`BracketStructureSection`'s own "Manage" heading went too — a section heading
over two links, on a surface whose other headings introduce runs of settings,
was a heading doing decoration. The two routing rows sit in Events.

### Display Configuration adopts the grammar

It ran a third grammar: `<h3 className="text-sm">` headings at the exact weight
of the row labels beneath them, rows inside rounded bordered cards, and an
explanatory paragraph under every heading. Now `Section` + `Row` + `FieldRow`,
single column, `max-w-3xl`, same as the other two.

- `Section` gained an optional `action` slot (Reset on Court order, Copy/Open
  on Public link). It sits outside the disclosure button: a button inside a
  button is invalid, and clicking Reset would collapse the section it reset.
- The "Grid columns" dependent row lost its left-rule indent, matching the
  one-rail rule Meet already followed. Dependency is carried by the dimmed +
  `aria-disabled` state.
- Two entity-in-attribute bugs fixed: JSX string attributes are not
  entity-decoded, so `aria-label="Reset court order &amp;amp; visibility"` put a
  literal `&amp;amp;` in the accessible name.

### `Section` renders a real heading (regression from session 1)

Session 1's `Section` title was a bare `<button>`. A button carries no heading
role, so a surface built only from these had **no document outline** — screen
reader heading navigation skipped every section title on the page. It is now
an `<h3>` wrapping the disclosure button (the WAI-ARIA disclosure pattern);
`SectionHeader` likewise. Two DisplayConfig tests were already asserting
`getByRole('heading')` and had been failing against the merged surface — they
were right and the component was wrong.

### One definition of the micro-label treatment

`EYEBROW_CLASS` in `lib/utils.ts`, beside `INTERACTIVE_BASE` (the established
home for shared class constants). It replaced ~56 hand-copied instances of
`text-2xs font-semibold uppercase tracking-[0.08em]` across 40 files, plus two
`text-[10px]` near-duplicates in `WorkspaceSidebar`.

**Colour is deliberately excluded** — call sites append `text-muted-foreground`,
a status token, or a state-derived class. That separation is what lets one
constant own every use of the type step without also deciding what each one
means. Most of these could not have been the `Eyebrow` *component*: they are
`<th>`, `<td>` group rows, `<h3>` panel headings, and state-coloured pills.

This is the fix for the actual failure mode: when session 1 reweighted section
headings, the change reached only surfaces that imported a component, so
Bracket and Display kept the old treatment and looked untouched.

## 7. Customizable events + reported bugs (session 3, 2026-08-06)

### Events are user-defined

**This was scoped in §6 as a data-model change plus a migration. That was
wrong, and checking rather than trusting the earlier note is what made it
cheap.** Nothing below the UI ever required five events:

- backend `rankCounts: Dict[Code, int]`, and `Code` is
  `Annotated[str, StringConstraints(max_length=MAX_CODE)]` — a bounded string,
  not an enum. Bounds: 40 chars, 50 events.
- the DTO is already `Record<string, number>`.
- every consumer (position grid, matches spreadsheet, rank validation, xlsx
  export) already iterates the object's own keys, and
  `usePositionGridColumns` explicitly appends configured events that are not
  in the canonical `EVENT_ORDER`.
- `DISCIPLINE_NAMES` already documents "unknown codes have no entry — callers
  fall back to the raw code", and every `EVENT_LABEL` read is `?.`-guarded.

So the fixed five lived **only** in the form. `MeetEventsSection` replaces the
hardcoded list with add / remove / rename-by-code rows over `rankCounts`.
`DEFAULT_RANKS` stays as the seed for a new meet. Verified end-to-end against
the running backend: `PUT /state` with a custom `BS` code returns 200 and
stores it.

Validation lives in `validateEventCode` so the rules are stated once: letters
only (a code carrying digits would make the rank `MD2` ambiguous between event
MD position 2 and event MD2 position 1), unique, within the backend's own
`MAX_CODE` / `MAX_RANKS` bounds so a 422 is never provoked.

Labels now come from the shared `DISCIPLINE_NAMES` instead of a third private
copy, which changes the Meet config labels to title case ("Men's Singles"),
matching Bracket and the position grid.

`MeetStructureForm.tsx` is deleted — dead since the §6 merge, and it carried
its own copy of the hardcoded five.

### The dirty-check bug this surfaced

Driving the editor against a real workspace showed the form rendering the
default five while the workspace actually stored `{MS: 2, WS: 2}`.

`EngineConfigForm`'s dirty-check seeds `baselineRef` from whatever `config` was
at mount — `null` whenever the config resolves after the first render, which is
the normal case. It then fell back to using `config` as its own baseline, so
every field whose stored value differed from its default compared unequal, was
read as "the user touched this", and **the server value was never adopted**.
The form showed defaults over real saved settings, and saving wrote them back.

Mostly invisible while the surface rendered a fixed five with per-field
fallbacks. Not invisible once the event *list* comes from config: a workspace
with two events showed five and would have overwritten its own set on save.
First load is not an edit; the fix adopts unconditionally until a baseline
exists. Both halves are pinned — the adopt case and the in-flight-edit case
the dirty-check exists for.

### Reported bugs

- **"Configure display" went to the wrong page** — `setup?section=display`, the
  Meet Configuration page plus a `?section=` value no switcher has ever had.
  Its test asserted the wrong destination in its own name AND registered only
  a `/setup` route, so a wrong target rendered nothing and was
  indistinguishable from a dead button. The probe is a catch-all now.
- **Lock banners differed between engines** — see below.
- **Display board polish** — the progress footer was viewport-`fixed`, so in
  the in-shell Preview it spanned the window and ran under the sidebar. The
  live court card was white-on-near-white: presets keep the status palette
  global, which is right for status *foregrounds* but not their `-bg`
  partners, which are light-theme tints; a dark preset painted the card in
  near-white green and wrote its own white `--foreground` on top. Every preset
  now declares its own status surfaces. Empty courts dropped the placeholder
  dash, and an unresolved side reads TBD.

### Lock tiers are named for the condition

`soft`/`hard` named the volume and left the condition implicit, which hid a
real divergence: Bracket implemented both tiers, Meet only the quiet one, so
results-recorded produced an amber "saving will clear this" on Meet and a
neutral read-only banner on Bracket.

Tiers are now `schedule` and `results`, and Meet gains the results tier
(`useMeetResultsLock`). **Behaviour change:** Meet Configuration goes read-only
once a match is started or finished, matching Bracket, instead of offering to
clear the schedule while scores exist. A merely *called* match does not lock —
nothing is recorded yet.

The amber-vs-neutral split is kept deliberately. Cloudscape and Carbon
converge on two orthogonal axes — disabled vs read-only (read-only keeps the
values legible; disabled means a prerequisite is missing), and warning vs
informational severity (warning is for a consequence the operator is about to
cause, neutral for a standing condition). Colouring both amber is what teaches
an operator to skip amber. Copy is engine-neutral so both surfaces read
identically; only the exit link differs.

### Still open

- **Custom event codes get no colour identity.** `EVENT_LABEL` carries
  per-event colours for the five known codes; a custom code renders unstyled.
  Every read is guarded so nothing breaks — it is a polish gap, not a defect.
- **`Eyebrow` uppercases text content in JS as well as CSS** (§6, in the debt
  log).
- The deferred-by-decision list from session 1 stands: the `Reproducible run` /
  `Freeze horizon` names, the standalone `—` glyph on operator surfaces, the
  five action panels wanting an `ActionRow` type, and the sky/azure collision.

---

## Session 4 (2026-08-06) — SP-UI-1: control-plane appearance pass

Three findings from a review of the running control plane, all about
misallocated visual weight rather than missing features. Branch
`feat/sp-ui-1-control-plane`; frontend-only.

### P1 — The wordmark read as a button

`ShuttleWorksMark` was the wordmark inside a 1px frame — per the brand skill
the frame *is* the mark, no glyph. At 26px in an `h-12` page header that reads
as an unstyled button.

The frame is gone. The wordmark is plain display type (15px, `-0.01em`), and
contrast now comes from a new `SwMonogram` tile — 22px, `bg-foreground /
text-background`, so it is maximum-contrast in either theme and achromatic,
spending none of the restrained accent budget. The same tile replaces the
Phosphor `House` glyph as `AppSidebar`'s home affordance, unifying "this is
ShuttleWorks" with "go home"; its active state is a ring, because the solid
tile swallows `railItemClass`'s accent tint.

Deliberately a placeholder *system*: a real mark drops into `SwMonogram` and
the wordmark is unchanged. One component + tokens, no image assets.

### P2 — Nothing led the Hub row

The row was anchored on a DATE column that is empty for most workspaces, and
name / modules / next-action all carried near-identical weight.

- **Name leads** (14px semibold); the date moved to trailing right-aligned
  metadata. An undated row now renders an EMPTY cell rather than an em-dash:
  the column-level `showDate` hide only fires when *no* visible row has a date,
  so on a mixed list the placeholder produced a rail of dashes.
- **Module chips** were `bg-surface-chip text-text-secondary` — close enough
  to the row background that M/B/D could not be read without hovering for the
  `title`. On a scanning surface that is a dead column. Raised to the
  raised-surface step + full-strength text on a hairline, 18px → 20px.
- **Next action** reads as the row's call to action: hover wash, revealed
  chevron, and a focus ring that was previously invisible even though the
  control was always keyboard-reachable. Same accessible name and behaviour.

All 79 existing Hub tests passed unchanged — the reorder broke no selectors.

### P3 — Overview was a status report

Rebuilt as a **phase-keyed command center**. The primary column is a panel map
keyed on `signals.phase`, so the page changes as the event does.

**The brief assumed `phase` had to be added. It already existed** — computed
server-side by `workspace_signals.py::_derive_phase` (`setup → ready → live →
complete`), typed in `dto.ts`, covered by 3 backend tests, and already driving
`lifecycleBadge` and the Hub row action. So SP-UI-1 touched **no backend code
at all**, and reused the shipped vocabulary rather than the brief's proposed
`scheduled`/`done` rename — two derivations of one lifecycle drifting apart is
the bug class this avoids. `overviewPhase.ts` only narrows the string and
decides which phases are worth showing; an unrecognised value renders the safe
default panel, which is the seam future Entries phases arrive through.

- A **lifecycle stepper** replaces the "1/4 steps" progress bar, which measured
  setup completeness and called it the event's state. Only phases that exist
  for the workspace render — no placeholder or dashed slots.
- **One merged checklist** replaces the readiness + "needs attention" pair.
  They were one fact set rendered twice: `roster: false` and `NO_ROSTER — No
  players added yet` are the same thing split across two lists, neither
  actionable. Merged, the attention copy becomes the step's subline and the
  step carries a button routing to the fixing surface. Later incomplete steps
  render present-but-quiet. Built from data (`setupChecklist.ts`), not
  hand-authored JSX, because future phases add steps by extending the tables.
- **Stat cards removed in `setup`** — `0 / 0 / 2` on a draft spent the page's
  most visual weight on its least information. Figures appear only in the
  phases where they mean something.
- Two-column grid at full content width, replacing a narrow column floating
  left in a wide canvas.
- A **rail** of phase-agnostic facts (date, public display, collaborators),
  each linking to its owning surface.

The Hub inspector consumes the same checklist model, so the two surfaces
cannot state readiness two different ways.

### Architecture

Shared code went to `platform/domain/` + `components/control-plane/` rather
than either product, and `NextUpList` moved out of `products/hub/`.
Cross-product depcruise violations **17 → 14**.

### Gates

`tsc -b` clean · vitest **1338 → 1381** passing · eslint 0 errors (no new
warnings in touched files) · production build green · backend untouched.
Verified live against the host backend at 1600px in `setup`, `ready` and
`live`; screenshots in `.playwright-mcp/sp-ui-1/` (untracked).

### Still open from this session

- The `ready` / `live` / `complete` panels are honest minimal versions built
  from data that already exists — structure over completeness.
- The rail's "last backup" row was dropped rather than adding a second fetch
  on every workspace landing (debt log).
- Pre-existing, seen while verifying: the shell identity bar can show
  `Untitled` while the Overview shows the real name — the two read different
  sources. Not touched here (debt log).

### Follow-up (same session) — the Hub facets

The strip was the last control-plane surface still contradicting the rest. It
split on the operator-managed `status` column, which `hubFacets.ts` defended
deliberately ("a dated-but-still-draft workspace stays Draft on purpose"). That
reasoning held in isolation but not in practice: on the live database nothing
had ever been marked Active, so the strip read `Active 0 / Draft 14` — one
bucket holding everything, including the four events that were mid-play. A
filter that cannot separate a running tournament from an empty one is not
narrowing anything, and the Hub was calling those four events *Draft* while the
Overview stepper, the shell badge and the row action all said *Live*.

The lifecycle facets now read `signals.phase`:
`All / Setup / Ready / Live / Complete / Shared / Needs attention / Archived`.
The same database now reads `Setup 8 · Ready 2 · Live 4 · Complete 0`.

- **Archived outranks the phase**, applying the same precedence as
  `platform/domain/lifecycle.ts`. Match rows persist, so an archived tournament
  keeps `phase: live|complete` forever; without the rule it would sit in *Live*
  next to events actually being played. Archived also gains a facet of its own
  — it used to be reachable only under *All*.
- The lifecycle facets **partition** the list (a test pins that every row lands
  in exactly one); `Shared` / `Needs attention` still overlap them by design.
- `status` keeps the two jobs it is good at: driving `health` (and so the row
  dot) and marking a workspace archived. The row dot and the shell pill were
  deliberately **not** changed — health ("does this need me") and phase ("where
  is this event") are separate axes, and `lifecycleBadge` already handles the
  shell's precedence.
- The `Live` count is tinted live-green the way `Needs attention` is tinted
  amber — the two facets an operator scans for. A zero count stays quiet in
  either tone, so an empty facet never shouts.

Gates: vitest **1381 → 1385**; `tsc -b`, eslint (0 errors), build green.
Verified live: `Live 4` filters to exactly the four workspaces whose row action
is "Open live day". Screenshots `after-hub-facets.png`,
`after-hub-facet-live.png`.
