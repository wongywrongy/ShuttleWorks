# ShuttleWorks shared UI contract

This is the current contract for the console and entrant applications. It replaces
retired Signal Orange/brutalist rules and conflicting prototype guidance. Tokens
in `tokens.css`, utilities in `tailwind-preset.js`, and shared components implement
this contract. `DESIGN_COLOR.md` documents the semantic color architecture.

## Surfaces and color

Use neutral page and raised surfaces in both themes. Azure identifies actions,
links, focus, and selection; identifiers and ordinary counts use neutral ink.
State always has readable text or an equivalent accessible cue. Reserve status
color for meaningful operational states and exceptions, never decorative emphasis.

Use semantic tokens, not raw colors or stock Tailwind palettes. Text must clear
4.5:1 against its actual surface; essential controls and focus indicators clear
3:1. Check selected, hover, disabled, error, and overlay states in both themes.
Do not reduce essential supporting text with opacity.

Normal cards and buttons have no shadows or press translation. Use separators or
one surface change to group content; do not nest decorative frames. Overlay
surfaces may use the shared elevation tokens. Dense boards are seamed surfaces;
Setup forms have room for labels and guidance. Keep Display dark and readable at
venue distance. Do not add texture, photography, glass, or decorative glow.

## Type and density

Geist is the interface typeface. Use tabular figures for scores, counts, times,
and references without changing the font family. Monospace is for actual code or
technical diagnostics. The public display face is reserved for public titles.
Preserve participant display names, order, and diacritics; never infer surnames.

| Role | Size / line height |
| --- | --- |
| `text-support` | 12 / 16 |
| `text-console` | 14 / 20 |
| `text-public` | 16 / 24 |
| `text-section` | 20 / 28 |
| `text-page` | 28 / 36 |

Body weight is 400, emphasis 600. Existing compact data roles remain available
where useful; essential prose does not belong in micro-label type. Use sentence
case for guidance and actions. Do not apply all-caps styling to names or prose.

Console forms use 36px controls, public forms 40px controls, and public primary
actions 44px. Compact console controls may use 32px with adequate separation.
Actual hit areas must not overlap; pseudo-element hit areas are not a substitute
for measured targets. Match rows start at 48px and grow for doubles and wrapping.

## Layout and components

Console `PageBody` owns page gutters: 24px and a 52rem maximum for forms; data
surfaces use available width. Public mobile layouts use 16px gutters. Use the
4/8/12/16/24/32/48 spacing ladder, 8px label gaps, 16px field gaps, and 24px section
gaps. Account forms cap at 26rem. Brackets scroll within a labeled region rather
than widening the document. Never clip names or essential content to satisfy a
fixed row height.

Reuse the existing settings sections, labeled fields, and aligned rows for Setup,
Publish, and administrative property editors. Avoid duplicate headings and added
indents. Radius scales with control height, not with role: the smallest controls
(`xs`, `icon-sm`, `icon-xs`) take 6px (`rounded-sm`), `sm`/`default`/`icon` take
8px (`rounded`), and `lg` takes 9px (`rounded-md`) — see `Button.tsx`'s `size`
variants for the concrete mapping. Panels stay 8px and overlays 12px; smaller
marks can use 4px.

Shared components contain domain-neutral UI only. Apps own tournament semantics,
API access, permissions, and navigation. Meet and Bracket share presentation
archetypes while retaining their domain behavior. Preserve the existing framework,
imports, and semantic token aliases when upgrading components.

## Interaction and truthful state

Every form needs visible labels and distinct dirty, saving, saved, and failed
states. Keep actions where their scope is clear. Explicit publication saves alone
change audience/content visibility; ordinary Setup saves do not publish.

Use semantic headings, native controls, keyboard access, visible focus, associated
errors, and concise live announcements. Modal overlays contain focus, offer a
visible cancel/close, and restore focus to the trigger. Honor reduced motion.
Use restrained color transitions; do not move controls on press.

Display state using the authority that can establish it. Distinguish missing,
loading, failed, denied, stale, and empty states. A local edit is not necessarily
saved, a queued command is not confirmed, and a pending receipt is not success.
Expose backend details only when they help the user decide or recover.

## Standing UX heuristics (2026-09-15)

Adopted from the 2026-09 entrant UX audit's fourteen unsourced heuristics
(`docs/audits/2026-09-entrant-ux-audit.md`, "Rulings the owner must make").
The nine below are standing rules; an audit can cite them directly instead
of arguing from first principles each time.

1. **In-flight feedback for native form POSTs.** Any route that submits a
   form with no client script must still show the browser's own
   navigation/loading affordance is not obscured or fought; where a route
   layers its own pending state on top (a disabled submit, a status
   region), it must appear before the round trip completes, not only
   after. Applies to every entrant form. An audit checks it by submitting
   with scripting on and off and confirming the user gets a visible cue
   the submit was received.
2. **Form errors are identified, explained, and prevented (WCAG 3.3.1,
   3.3.3, 3.3.4), and rejection preserves data.** Every field-level error
   names the field and states what is wrong or expected; a rejected
   submit re-renders with every prior value intact, never a blank form.
   Applies to every entrant form. An audit checks it by submitting invalid
   data and confirming both the error text and the untouched sibling
   fields.
3. **Links look like links, buttons look like buttons, and no button does
   nothing without JS.** A control that only navigates is an `<a>`; a
   control that only submits or triggers a mutation is a `<button>`; a
   `<button>` with no enclosing `<form>` and no server fallback is
   forbidden. Applies everywhere on the entrant tier (SSR, no hydration).
   An audit checks it by disabling scripting and confirming every visible
   button still does something.
4. **Loading and error states are distinct from empty states.** A route
   waiting on a request, a route that got a 5xx or timed out, and a route
   whose query legitimately returned nothing must render three different
   messages, never the same "nothing here" copy. Applies to every
   data-backed entrant page. An audit checks it by forcing each condition
   (slow network, an injected fault, a query with no matches) and
   confirming the copy differs.
5. **24px minimum target, 44px for primary actions, beyond `Button`.**
   Any interactive element not built from the shared `Button` (native
   `<select>`, a raw `<a>`, a checkbox label) still clears a 24px hit
   area, or a 40px nearest-centre spacing exception per WCAG 2.5.8; the
   page's primary action clears 44px. An audit checks it by measuring the
   rendered box (or spacing to the next target) on every non-`Button`
   interactive element.
6. **Skip link and landmarks (WCAG 2.4.1).** Every route renders exactly
   one visible-on-focus skip link as the first tab stop, and exactly one
   `<main>`, one `<header>`, one `<footer>`. Applies to every entrant
   route. An audit checks it by tabbing from a fresh load and inspecting
   the landmark count in the accessibility tree.
7. **Focus management on validation failure or tab change (WCAG 2.4.3).**
   A failed submit moves focus to the first invalid field or the error
   summary; a client-side tab/view switch moves focus to the new panel's
   heading. Applies to multi-step forms and any tabbed view. An audit
   checks it by triggering the failure or switch and reading the active
   element.
8. **Icon-only buttons carry an accessible name.** Any control whose
   visible content is an icon with no adjacent text has an `aria-label`
   or equivalent that names the action, not the icon. Applies everywhere
   on the entrant tier. An audit checks it by reading the accessible-name
   computation for every icon-only control.
9. **Destructive actions confirm or offer undo.** An action that cannot
   be trivially reversed (withdraw, delete) requires a second press that
   states the consequence in full, or completes immediately with a
   visible undo window. `window.confirm` does not satisfy this. Applies
   to every destructive action on the entrant tier. An audit checks it by
   triggering the action once and confirming it did not complete without
   a second step or an undo affordance.

### Not yet rules

These five heuristics from the same audit are deferred, not adopted:

- **Wayfinding/information scent after "You are here" removal.** No
  replacement wayfinding pattern has been designed yet; adopting a rule
  now would either re-introduce the removed pattern or invent one
  unreviewed.
- **Complex table header association (WCAG 1.3.1).** The entrant tier has
  no complex (multi-level header) table today; the rule has no surface to
  apply to yet.
- **Autocomplete attributes (WCAG 1.3.5).** The sign-up form already does
  this correctly by example; a standing rule needs a survey of every
  entrant form first, not yet done.
- **Colour-blind verification method.** No method (simulation tool,
  manual process) has been chosen; adopting the rule without a method
  would be unenforceable.
- **Print/offline receipt.** Out of scope for the current entrant
  feature set; revisit if a print/offline requirement is taken up.

## Verification

Run `npm run test:contrast` and `npm run test:classes` for shared style changes,
then affected consumer tests and builds. Verify actual computed colors, focus,
layout, and overlays in browsers. Public surfaces also require narrow-width and
200% text-zoom checks; console coverage is desktop. Update visual evidence and
record justified domain-specific exceptions rather than adding competing rules.
